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
import {
  filterUndeliveredTweets,
  loadDeliveredUrlSet,
  persistDeliveredUrls,
} from "./utils/delivery-state.js";
import type { RssFeedFetchFailure } from "./sources/rss-feed.js";

/** 失敗時のジョブサマリー用（途中まで進んだ値を保持） */
let partialRunMetrics: {
  useSampleData: boolean;
  rssItemCount?: number;
  rssNewItemCount?: number;
  urlBodyCount?: number;
  rssFetchFailures?: RssFeedFetchFailure[];
  allFeedsFailed?: boolean;
  skippedNoNewArticles?: boolean;
} = { useSampleData: false };

async function main() {
  partialRunMetrics = {
    useSampleData: false,
    rssItemCount: undefined,
    rssNewItemCount: undefined,
    urlBodyCount: undefined,
    rssFetchFailures: undefined,
    allFeedsFailed: undefined,
    skippedNoNewArticles: undefined,
  };
  const config = loadConfig();
  partialRunMetrics.useSampleData = config.USE_SAMPLE_DATA;

  console.info(
    `[Gemini] urlSummary=${settings.analysis.urlSummaryModel} trendAnalysis=${settings.analysis.trendAnalysisModel}`,
  );

  console.info("[1/5] RSS からニュースを取得中...");
  const rss = await fetchRssAsRawTweets(config, settings);
  partialRunMetrics.rssFetchFailures = rss.stats.fetchFailures;
  const allFeedsFailed =
    rss.stats.fetchAttemptCount > 0 && rss.stats.fetchSuccessCount === 0;
  partialRunMetrics.allFeedsFailed = allFeedsFailed;

  if (allFeedsFailed) {
    throw new UserFacingError(
      "すべてのRSSフィードの取得に失敗しました。ネットワーク・URL・src/settings.ts の rssFeeds を確認してください。",
    );
  }

  const tweetsInWindow = rss.tweets;
  console.info(`→ 記事（窓内・ミックス後） ${tweetsInWindow.length}件`);
  partialRunMetrics.rssItemCount = tweetsInWindow.length;

  if (tweetsInWindow.length === 0) {
    console.warn(
      `[RSS] 統計: 取得試行 ${rss.stats.fetchAttemptCount} / 成功 ${rss.stats.fetchSuccessCount} / 失敗フィード ${rss.stats.fetchFailures.length} 本`,
    );
    for (const f of rss.stats.fetchFailures) {
      console.warn(`[RSS] 失敗: ${f.label} — ${f.message}`);
    }
    throw new UserFacingError(
      "分析対象のニュースが0件でした。contentSource.rssFeeds・取得期間（lookbackHours）・rssCategoryCaps を確認してください。上記 [RSS] 統計・失敗ログも参照してください。",
    );
  }

  let tweets = tweetsInWindow;
  const delivery = settings.deliveryState;
  if (delivery?.enabled && !config.USE_SAMPLE_DATA) {
    const delivered = await loadDeliveredUrlSet(delivery.stateFilePath);
    tweets = filterUndeliveredTweets(tweetsInWindow, delivered);
    console.info(`→ 未配信のみ: ${tweets.length}件`);
  }

  partialRunMetrics.rssNewItemCount = tweets.length;

  if (tweets.length === 0) {
    partialRunMetrics.skippedNoNewArticles = true;
    console.info(
      "新着記事はありません（いずれも過去配信済みのURLです）。処理を終了します。",
    );
    writeGithubActionsRunSummary({
      outcome: "success",
      useSampleData: config.USE_SAMPLE_DATA,
      rssItemCount: tweetsInWindow.length,
      rssNewItemCount: 0,
      skippedNoNewArticles: true,
      rssFetchFailures: rss.stats.fetchFailures,
      allFeedsFailed: false,
    });
    return;
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

  if (delivery?.enabled && !config.USE_SAMPLE_DATA) {
    const urls = tweets.map((t) => t.url);
    await persistDeliveredUrls(
      delivery.stateFilePath,
      urls,
      delivery.maxTrackedUrls,
    );
  }

  writeGithubActionsRunSummary({
    outcome: "success",
    useSampleData: config.USE_SAMPLE_DATA,
    rssItemCount: tweetsInWindow.length,
    rssNewItemCount: tweets.length,
    urlBodyCount: urlContents.size,
    topTopicCount: analysis.top_topics.length,
    rssFetchFailures: rss.stats.fetchFailures,
    skippedNoNewArticles: false,
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
      rssNewItemCount: partialRunMetrics.rssNewItemCount,
      urlBodyCount: partialRunMetrics.urlBodyCount,
      errorMessage: error.message,
      rssFetchFailures: partialRunMetrics.rssFetchFailures,
      allFeedsFailed: partialRunMetrics.allFeedsFailed,
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
      rssNewItemCount: partialRunMetrics.rssNewItemCount,
      urlBodyCount: partialRunMetrics.urlBodyCount,
      errorMessage:
        error instanceof Error ? error.message : String(error),
      rssFetchFailures: partialRunMetrics.rssFetchFailures,
      allFeedsFailed: partialRunMetrics.allFeedsFailed,
    });
    console.error("\n[INTERNAL] Unexpected error:", error);
  }
  process.exit(1);
});
