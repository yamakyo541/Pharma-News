import { GoogleGenAI } from "@google/genai";
import type { Config } from "../config.js";
import type { Settings } from "../settings.js";
import type { RawTweet, EnrichedTweet } from "../types.js";
import { extractUrls } from "../utils/post-optimizer.js";
import { chunkArray } from "../utils/chunk.js";
import { isRetryableGeminiCallError, withRetry } from "../utils/retry.js";
import { URL_SUMMARY_PROMPT } from "./prompts.js";
import {
  getCachedSummary,
  loadUrlSummaryCache,
  pruneUrlSummaryCache,
  saveUrlSummaryCache,
  setCachedSummary,
} from "../utils/url-summary-cache.js";

export async function summarizeUrls(
  tweets: RawTweet[],
  urlContents: Map<string, string>,
  config: Config,
  settings: Settings,
): Promise<EnrichedTweet[]> {
  if (urlContents.size === 0) {
    return tweets.map((t) => ({ ...t, enrichedText: buildFullText(t) }));
  }

  console.info(
    `[3/5] 各URLを Gemini（${settings.analysis.urlSummaryModel}）で要約中...`,
  );
  const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
  const summaryCache = new Map<string, string>();
  const entries = [...urlContents.entries()];

  const cacheCfg = settings.urlSummaryCache;
  let diskCache: Awaited<ReturnType<typeof loadUrlSummaryCache>> | null = null;
  if (cacheCfg?.enabled) {
    diskCache = await loadUrlSummaryCache(cacheCfg.filePath);
    pruneUrlSummaryCache(
      diskCache,
      cacheCfg.maxAgeDays * 86_400_000,
      cacheCfg.maxEntries,
    );
  }

  const chunks = chunkArray(
    entries,
    Math.max(1, settings.analysis.geminiMaxParallelRequests),
  );
  for (const chunk of chunks) {
    const results = await Promise.allSettled(
      chunk.map(async ([url, content]) => {
        const fromDisk =
          diskCache && cacheCfg
            ? getCachedSummary(diskCache, url, cacheCfg.maxAgeDays * 86_400_000)
            : undefined;
        if (fromDisk) {
          return { url, summary: fromDisk.slice(0, settings.urlContent.maxSummaryChars) };
        }

        const truncated = content.slice(
          0,
          settings.urlContent.maxSummaryChars *
            settings.urlContent.inputCharsMultiplier,
        );
        const prompt = URL_SUMMARY_PROMPT.replace(
          "{article_text}",
          truncated,
        );

        const res = await withRetry(
          () =>
            ai.models.generateContent({
              model: settings.analysis.urlSummaryModel,
              contents: prompt,
              config: { temperature: 0 },
            }),
          settings.resilience,
          isRetryableGeminiCallError,
          { label: `${settings.analysis.urlSummaryModel}（URL要約）` },
        );

        const text = res.text?.slice(0, settings.urlContent.maxSummaryChars);
        const summary = text ?? "";
        if (diskCache && cacheCfg && summary) {
          setCachedSummary(diskCache, url, summary);
        }
        return { url, summary };
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value.summary) {
        summaryCache.set(r.value.url, r.value.summary);
      }
    }
  }

  if (diskCache && cacheCfg?.enabled) {
    pruneUrlSummaryCache(
      diskCache,
      cacheCfg.maxAgeDays * 86_400_000,
      cacheCfg.maxEntries,
    );
    await saveUrlSummaryCache(cacheCfg.filePath, diskCache);
  }

  console.info(`→ URL要約完了: ${summaryCache.size}件`);

  return tweets.map((tweet) => {
    let enrichedText = buildFullText(tweet);
    for (const url of extractUrls(tweet.text)) {
      const summary = summaryCache.get(url);
      if (summary) {
        enrichedText += `\n[補足情報]: ${summary}`;
      }
    }
    return { ...tweet, enrichedText };
  });
}

function buildFullText(tweet: RawTweet): string {
  let text = tweet.text;
  if (tweet.quotedText) {
    text += `\n${tweet.quotedText}`;
  }
  return text;
}
