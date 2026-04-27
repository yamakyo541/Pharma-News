import type { Config } from "../config.js";
import type { Settings } from "../settings.js";
import type { RawTweet } from "../types.js";
import { extractUrls, expandUrls } from "../utils/post-optimizer.js";
import { chunkArray } from "../utils/chunk.js";
import {
  isRetryableFetchError,
  isRetryableHttpStatus,
  withRetry,
} from "../utils/retry.js";

/**
 * 入力テキスト内URLの本文を Jina Reader で取得する。
 * 返す Map のキーは出現する短縮URL（extractUrls で抽出したもの）。
 * url-summarizer がそのまま Map.get(url) で引けるようにする。
 */
export async function fetchUrlContents(
  tweets: RawTweet[],
  config: Config,
  settings: Settings,
): Promise<Map<string, string>> {
  const contents = new Map<string, string>();

  if (!settings.urlContent.enabled) {
    console.info("URL本文取得は src/settings.ts の urlContent.enabled=false のため無効");
    return contents;
  }

  const allRawUrls = tweets.flatMap((t) => extractUrls(t.text));
  const uniqueRawUrls = [...new Set(allRawUrls)];

  if (uniqueRawUrls.length === 0) return contents;

  console.info(`→ ${uniqueRawUrls.length}件 のURLをHEADで展開中`);
  const urlMapping = await expandUrls(uniqueRawUrls);
  console.info(
    `→ 本文取得対象URL: ${urlMapping.size}件（展開後の除外ドメインはスキップ済み）`,
  );

  if (urlMapping.size === 0) return contents;

  let jina402Detected = false;
  const entries = [...urlMapping.entries()];
  const chunks = chunkArray(entries, settings.urlContent.parallelism);

  for (const chunk of chunks) {
    if (jina402Detected) break;

    const results = await Promise.allSettled(
      chunk.map(async ([originalUrl, expandedUrl]) => {
        try {
          return await withRetry(
            async () => {
              const ctl = new AbortController();
              const timer = setTimeout(
                () => ctl.abort(),
                settings.urlContent.timeoutMs,
              );
              try {
                const res = await fetch(`https://r.jina.ai/${expandedUrl}`, {
                  headers: {
                    Accept: "text/plain",
                    ...(config.JINA_API_KEY
                      ? { Authorization: `Bearer ${config.JINA_API_KEY}` }
                      : {}),
                  },
                  signal: ctl.signal,
                });

                if (res.status === 402 || res.status === 401) {
                  jina402Detected = true;
                  console.warn(
                    `[Jina] ${res.status} — 無料枠が枯渇しました。URL本文なしで分析を続行します。`,
                  );
                  return { originalUrl, content: undefined };
                }
                if (isRetryableHttpStatus(res.status)) {
                  throw Object.assign(new Error(`Jina HTTP ${res.status}`), {
                    status: res.status,
                  });
                }
                if (!res.ok) {
                  return { originalUrl, content: undefined };
                }
                const text = await res.text();
                return { originalUrl, content: text };
              } finally {
                clearTimeout(timer);
              }
            },
            settings.resilience,
            isRetryableFetchError,
            { label: `Jina ${originalUrl.slice(0, 64)}` },
          );
        } catch {
          return { originalUrl, content: undefined };
        }
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value.content) {
        contents.set(r.value.originalUrl, r.value.content);
      }
    }
  }

  if (jina402Detected) {
    console.warn(
      `[Jina] フォールバック: ${contents.size} URLs の本文を取得済み。残りはスキップします。`,
    );
  } else {
    console.info(`→ 本文取得完了: ${contents.size}件`);
  }

  return contents;
}
