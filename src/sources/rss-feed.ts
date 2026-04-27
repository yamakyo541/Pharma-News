import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { XMLParser } from "fast-xml-parser";
import type { Config } from "../config.js";
import type { Settings } from "../settings.js";
import type { RawTweet } from "../types.js";
import { UserFacingError } from "../utils/errors.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
});

export async function fetchRssAsRawTweets(
  config: Config,
  settings: Settings,
): Promise<RawTweet[]> {
  if (config.USE_SAMPLE_DATA) {
    return loadSampleRssTweets();
  }

  const feeds = settings.contentSource.rssFeeds
    .map((feed) => ({
      label: feed.label.trim() || "RSS",
      url: feed.url.trim(),
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

  const tweetsByUrl = new Map<string, RawTweet>();
  for (const feed of feeds) {
    let items: ParsedRssItem[];
    try {
      const xml = await fetchRssXml(feed.url, settings.contentSource.rssFetchTimeoutMs);
      items = parseRssItems(xml);
    } catch (cause) {
      console.warn(`[RSS] ${feed.label} の取得をスキップ:`, cause);
      continue;
    }
    const normalized = normalizeRssItems(items, feed.label, cutoff);
    for (const tweet of normalized) {
      if (!tweetsByUrl.has(tweet.url)) {
        tweetsByUrl.set(tweet.url, tweet);
      }
    }
  }

  const tweets = [...tweetsByUrl.values()];
  tweets.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return tweets.slice(0, settings.contentSource.rssMaxItems);
}

function normalizeRssItems(
  items: ParsedRssItem[],
  label: string,
  cutoff: Date,
): RawTweet[] {
  const tweets: RawTweet[] = [];
  for (const raw of items) {
    const item = raw as ParsedRssItem & { guid?: unknown };
    const pubStr = normalizeTextField(item.pubDate);
    const createdAt = pubStr
      ? new Date(pubStr).toISOString()
      : new Date().toISOString();
    if (Number.isNaN(new Date(createdAt).getTime())) continue;
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

async function fetchRssXml(
  url: string,
  timeoutMs: number,
): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: { Accept: "application/rss+xml, application/xml, text/xml, */*" },
    });
    if (!res.ok) {
      throw new UserFacingError(
        `RSSフィードの取得に失敗しました（HTTP ${res.status}）。URLが正しいか、認証が必要でないか確認してください。`,
      );
    }
    return await res.text();
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
  } finally {
    clearTimeout(timer);
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
  if (!channel) {
    throw new UserFacingError(
      "RSS形式として channel が見つかりませんでした。RSS 2.0 のフィードURLか確認してください。",
    );
  }

  const ch = channel as { item?: ParsedRssItem | ParsedRssItem[] };
  return toArray(ch.item);
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
