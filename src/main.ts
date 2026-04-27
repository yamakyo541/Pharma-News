// ┌──────────────────────────────────────────────────────┐
// │  読み順ガイド                                        │
// │  この main() の5ステップを上から読めば全体が分かる。  │
// │  ソースは RSS のみ（日刊薬業の購読フィード等）。       │
// │  詳しく見たくなったら各 import 先にジャンプ。          │
// │  設定を変えたい場合は src/settings.ts を開く。        │
// └──────────────────────────────────────────────────────┘

import { loadConfig } from "./config.js";
import { settings } from "./settings.js";
import { fetchRssAsRawTweets } from "./sources/rss-feed.js";
import { fetchUrlContents } from "./sources/url-content.js";
import { summarizeUrls } from "./analysis/url-summarizer.js";
import { analyzeTrends } from "./analysis/analyze.js";
import { sendDigestEmail } from "./delivery/gmail.js";
import { UserFacingError } from "./utils/errors.js";
import { writeGithubActionsRunSummary } from "./utils/github-job-summary.js";

/** 失敗時のジョブサマリー用（途中まで進んだ値を保持） */
let partialRunMetrics: {
  useSampleData: boolean;
  rssItemCount?: number;
  urlBodyCount?: number;
} = { useSampleData: false };

async function main() {
  partialRunMetrics = {
    useSampleData: false,
    rssItemCount: undefined,
    urlBodyCount: undefined,
  };
  const config = loadConfig();
  partialRunMetrics.useSampleData = config.USE_SAMPLE_DATA;

  console.info("[1/5] RSS からニュースを取得中...");
  const tweets = await fetchRssAsRawTweets(config, settings);
  console.info(`→ 記事 ${tweets.length}件`);
  partialRunMetrics.rssItemCount = tweets.length;

  if (tweets.length === 0) {
    throw new UserFacingError(
      "分析対象のニュースが0件でした。contentSource.rssFeeds と取得期間（lookbackHours）を確認してください。",
    );
  }

  console.info("[2/5] URL本文を Jina Reader で取得中...");
  const urlContents = await fetchUrlContents(tweets, config, settings);
  console.info(`→ 本文取得済みURL: ${urlContents.size}件`);
  partialRunMetrics.urlBodyCount = urlContents.size;

  const enrichedTweets = await summarizeUrls(
    tweets,
    urlContents,
    config,
    settings,
  );
  const analysis = await analyzeTrends(enrichedTweets, config, settings);

  console.info("[5/5] Gmail へ送信中...");
  await sendDigestEmail(analysis, config, settings);

  writeGithubActionsRunSummary({
    outcome: "success",
    useSampleData: config.USE_SAMPLE_DATA,
    rssItemCount: tweets.length,
    urlBodyCount: urlContents.size,
    topTopicCount: analysis.top_topics.length,
  });

  console.info("すべての処理が完了しました");
}

main().catch((error: unknown) => {
  const envSample =
    process.env.USE_SAMPLE_DATA === "true" ||
    process.env.USE_SAMPLE_DATA === "1";
  if (error instanceof UserFacingError) {
    writeGithubActionsRunSummary({
      outcome: "failure",
      useSampleData: partialRunMetrics.useSampleData || envSample,
      rssItemCount: partialRunMetrics.rssItemCount,
      urlBodyCount: partialRunMetrics.urlBodyCount,
      errorMessage: error.message,
    });
    console.error(`\n[USER-FACING] ${error.message}`);
    console.error("対処法の詳細は docs/troubleshooting.md を参照してください。");
    if (error.cause) {
      console.error("[DETAIL]", error.cause);
    }
  } else {
    writeGithubActionsRunSummary({
      outcome: "failure",
      useSampleData: partialRunMetrics.useSampleData || envSample,
      rssItemCount: partialRunMetrics.rssItemCount,
      urlBodyCount: partialRunMetrics.urlBodyCount,
      errorMessage:
        error instanceof Error ? error.message : String(error),
    });
    console.error("\n[INTERNAL] Unexpected error:", error);
  }
  process.exit(1);
});
