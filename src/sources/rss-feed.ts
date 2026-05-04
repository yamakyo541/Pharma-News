import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { XMLParser } from "fast-xml-parser";
import type { Config } from "../config.js";
import type { Settings } from "../settings.js";
import type { RawTweet } from "../types.js";
import { UserFacingError } from "../utils/errors.js";
import { canonicalUrlForState } from "../utils/url-canonical.js";
import {
  isRetryableFetchError,
  isRetryableHttpStatus,
  withRetry,
} from "../utils/retry.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
  // WHO 等は description 内の HTML 実体参照が非常に多く、既定の展開上限（1000）で失敗する
  processEntities: {
    enabled: true,
    maxTotalExpansions: 200_000,
    maxExpandedLength: 2_000_000,
    maxEntitySize: 50_000,
  },
});

export type RssFeedFetchFailure = {
  label: string;
  message: string;
};

export type RssFetchStats = {
  configuredFeedCount: number;
  fetchAttemptCount: number;
  fetchSuccessCount: number;
  fetchFailures: RssFeedFetchFailure[];
};

export type RssFetchResult = {
  tweets: RawTweet[];
  stats: RssFetchStats;
};

export function applyRssCategorySelection(
  tweets: RawTweet[],
  settings: Settings,
): RawTweet[] {
  const maxTotal = settings.contentSource.rssMaxItems;
  const caps = settings.contentSource.rssCategoryCaps;
  const sorted = [...tweets].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  if (!caps || Object.keys(caps).length === 0) {
    return sorted.slice(0, maxTotal);
  }

  const picked = new Set<string>();
  const counts: Record<string, number> = {};
  const out: RawTweet[] = [];

  const keyOf = (t: RawTweet) => canonicalUrlForState(t.url);

  const tryAdd = (t: RawTweet, ignoreCategory: boolean): boolean => {
    if (out.length >= maxTotal) return false;
    const k = keyOf(t);
    if (picked.has(k)) return false;
    const cat = t.category ?? "other";
    if (!ignoreCategory) {
      const cap = caps[cat];
      if (cap !== undefined && (counts[cat] ?? 0) >= cap) {
        return false;
      }
    }
    out.push(t);
    picked.add(k);
    if (!ignoreCategory && caps[cat] !== undefined) {
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return true;
  };

  for (const t of sorted) {
    tryAdd(t, false);
  }
  if (out.length < maxTotal) {
    for (const t of sorted) {
      tryAdd(t, true);
    }
  }
  return out;
}

function mergeTweetByCanonicalUrl(
  map: Map<string, RawTweet>,
  tweet: RawTweet,
): void {
  const key = canonicalUrlForState(tweet.url);
  const existing = map.get(key);
  if (
    !existing ||
    new Date(tweet.createdAt).getTime() >
      new Date(existing.createdAt).getTime()
  ) {
    map.set(key, tweet);
  }
}

export async function fetchRssAsRawTweets(
  config: Config,
  settings: Settings,
): Promise<RssFetchResult> {
  if (config.USE_SAMPLE_DATA) {
    const tweets = await loadSampleRssTweets();
    return {
      tweets,
      stats: {
        configuredFeedCount: 0,
        fetchAttemptCount: 0,
        fetchSuccessCount: 1,
        fetchFailures: [],
      },
    };
  }

  const feeds = settings.contentSource.rssFeeds
    .map((feed) => ({
      label: feed.label.trim() || "RSS",
      url: feed.url.trim(),
      category: feed.category,
      maxItems: feed.maxItems,
    }))
    .filter((feed) => feed.url.length > 0);

  if (feeds.length === 0) {
    throw new UserFacingError(
      "RSS取得が有効ですが contentSource.rssFeeds が空です。src/settings.ts に購読用のRSSのURLを1件以上設定してください。",
    );
  }

  const cutoff = new Date(
    Date.now() - settings.schedule.lookbackHours * 60 * 60 * 1000,
  );

  const stats: RssFetchStats = {
    configuredFeedCount: feeds.length,
    fetchAttemptCount: 0,
    fetchSuccessCount: 0,
    fetchFailures: [],
  };

  const tweetsByUrl = new Map<string, RawTweet>();

  for (const feed of feeds) {
    stats.fetchAttemptCount += 1;
    let items: ParsedRssItem[];
    try {
      const xml = await fetchRssXml(feed.url, settings);
      items = parseRssItems(xml);
      stats.fetchSuccessCount += 1;
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : String(cause);
      console.warn(`[RSS] ${feed.label} の取得をスキップ:`, cause);
      stats.fetchFailures.push({ label: feed.label, message });
      continue;
    }

    let normalized = normalizeRssItems(items, feed.label, cutoff).map(
      (t) => ({
        ...t,
        ...(feed.category ? { category: feed.category } : {}),
      }),
    );
    normalized.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const perFeedCap =
      feed.maxItems ?? settings.contentSource.rssMaxItemsPerFeed;
    if (typeof perFeedCap === "number" && Number.isFinite(perFeedCap)) {
      normalized = normalized.slice(0, Math.max(0, perFeedCap));
    }

    for (const tweet of normalized) {
      mergeTweetByCanonicalUrl(tweetsByUrl, tweet);
    }
  }

  const merged = [...tweetsByUrl.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const tweets = applyRssCategorySelection(merged, settings);

  return { tweets, stats };
}

export function normalizeRssItems(
  items: ParsedRssItem[],
  label: string,
  cutoff: Date,
): RawTweet[] {
  const tweets: RawTweet[] = [];
  for (const raw of items) {
    const item = raw as ParsedRssItem & { guid?: unknown };
    const pubStr = normalizeTextField(item.pubDate);
    // Invalid Date では toISOString() が RangeError になるため、必ず getTime() で判定してから変換する
    let createdAt: string;
    if (pubStr) {
      const parsed = new Date(pubStr);
      if (Number.isNaN(parsed.getTime())) continue;
      createdAt = parsed.toISOString();
    } else {
      createdAt = new Date().toISOString();
    }
    if (new Date(createdAt) < cutoff) continue;

    const link =
      pickHttpUrl(normalizeTextField(item.link)) ??
      pickHttpUrl(normalizeTextField(item.guid));
    if (!link) continue;

    const title = stripTags(normalizeTextField(item.title) ?? "").trim();
    const desc = stripTags(normalizeTextField(item.description) ?? "").trim();
    const text = [title, desc, link].filter(Boolean).join("\n");

    tweets.push({
      authorId: label,
      text,
      createdAt,
      url: link,
    });
  }
  return tweets;
}

async function loadSampleRssTweets(): Promise<RawTweet[]> {
  const path = resolve(
    import.meta.dirname,
    "../../fixtures/sample-rss-tweets.json",
  );
  const raw = await readFile(path, "utf-8");
  return JSON.parse(raw) as RawTweet[];
}

async function fetchRssXml(url: string, settings: Settings): Promise<string> {
  const timeoutMs = settings.contentSource.rssFetchTimeoutMs;

  try {
    return await withRetry(
      async () => {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), timeoutMs);
        try {
          const res = await fetch(url, {
            signal: ctl.signal,
            headers: {
              Accept: "application/rss+xml, application/xml, text/xml, */*",
            },
          });
          if (isRetryableHttpStatus(res.status)) {
            throw Object.assign(new Error(`RSS HTTP ${res.status}`), {
              status: res.status,
            });
          }
          if (!res.ok) {
            throw new UserFacingError(
              `RSSフィードの取得に失敗しました（HTTP ${res.status}）。URLが正しいか、認証が必要でないか確認してください。`,
            );
          }
          return await res.text();
        } catch (cause) {
          if (cause instanceof UserFacingError) throw cause;
          if ((cause as Error)?.name === "AbortError") {
            throw Object.assign(new Error("RSS fetch timeout"), {
              name: "AbortError",
            });
          }
          throw cause;
        } finally {
          clearTimeout(timer);
        }
      },
      settings.resilience,
      isRetryableFetchError,
      { label: `RSS ${url.slice(0, 72)}` },
    );
  } catch (cause) {
    if (cause instanceof UserFacingError) throw cause;
    if ((cause as Error)?.name === "AbortError") {
      throw new UserFacingError(
        "RSSフィードの取得がタイムアウトしました。ネットワークか URL を確認してください。",
      );
    }
    throw new UserFacingError(
      "RSSフィードの取得中にエラーが発生しました。URLとネットワークを確認してください。",
      { cause },
    );
  }
}

export interface ParsedRssItem {
  title?: string;
  link?: string;
  pubDate?: string;
  description?: string;
}

export function parseRssItems(xml: string): ParsedRssItem[] {
  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch (cause) {
    throw new UserFacingError(
      "RSSのXMLを解析できませんでした。フィードが壊れていないか確認してください。",
      { cause },
    );
  }

  const channel = (doc as { rss?: { channel?: unknown } })?.rss?.channel;
  if (channel) {
    const ch = channel as { item?: ParsedRssItem | ParsedRssItem[] };
    return toArray(ch.item);
  }

  // RSS 1.0（RDF）：厚労省・内閣府・PMDA 新着など（channel と item が rdf:RDF 直下の兄弟）
  const rdf = (doc as { "rdf:RDF"?: unknown })?.["rdf:RDF"];
  if (rdf && typeof rdf === "object" && rdf !== null) {
    const root = rdf as Record<string, unknown>;
    const raw = root.item;
    const items = toArray(raw as RdfLikeItem | RdfLikeItem[] | undefined);
    return items.map(rdfItemToParsed);
  }

  throw new UserFacingError(
    "RSS形式として解釈できる channel（RSS 2.0）または rdf:RDF（RSS 1.0）が見つかりませんでした。フィードURLか形式を確認してください。",
  );
}

/** fast-xml-parser が返す RSS 1.0 item の緩い形 */
type RdfLikeItem = Record<string, unknown>;

function rdfItemToParsed(item: RdfLikeItem): ParsedRssItem {
  const title = normalizeTextField(item.title);
  const link = normalizeTextField(item.link);
  const description = normalizeTextField(item.description);
  const pubDate =
    normalizeTextField(item.pubDate) ??
    normalizeTextField(item["dc:date"]);
  const out: ParsedRssItem = {};
  if (title !== undefined) out.title = title;
  if (link !== undefined) out.link = link;
  if (description !== undefined) out.description = description;
  if (pubDate !== undefined) out.pubDate = pubDate;
  return out;
}

function toArray<T>(x: T | T[] | undefined): T[] {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}

function normalizeTextField(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "#text" in v) {
    const t = (v as { "#text": unknown })["#text"];
    return typeof t === "string" ? t : undefined;
  }
  return undefined;
}

function pickHttpUrl(s: string | undefined): string | undefined {
  const t = s?.trim();
  if (!t) return undefined;
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  return undefined;
}
