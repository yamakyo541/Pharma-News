/**
 * RSS だけ取得して成功/失敗と窓内件数を表示する（Gemini・Jina・Gmail は使わない）。
 * 使い方（プロジェクトルート）:
 *   $env:JINA_API_KEY="x"; $env:GEMINI_API_KEY="x"; $env:GMAIL_USER="a@b.co"; $env:GMAIL_APP_PASSWORD="0123456789012345"; $env:GMAIL_TO="a@b.co"; npx tsx scripts/diagnose-rss.ts
 */
import { loadConfig } from "../src/config.js";
import { settings } from "../src/settings.js";
import {
  fetchRssAsRawTweets,
  normalizeRssItems,
  parseRssItems,
} from "../src/sources/rss-feed.js";

async function main() {
  const config = loadConfig();
  if (config.USE_SAMPLE_DATA) {
    console.log("USE_SAMPLE_DATA=true のためスキップ（false で実行してください）");
    process.exit(1);
  }
  console.log(
    `lookbackHours=${settings.schedule.lookbackHours} rssMaxItems=${settings.contentSource.rssMaxItems} rssMaxItemsPerFeed=${settings.contentSource.rssMaxItemsPerFeed}`,
  );
  console.log("rssCategoryCaps", settings.contentSource.rssCategoryCaps);

  const cutoff = new Date(
    Date.now() - settings.schedule.lookbackHours * 60 * 60 * 1000,
  );
  console.log(`\n現在の窓の下限（UTC）: ${cutoff.toISOString()}\n`);

  const feeds = settings.contentSource.rssFeeds
    .map((f) => ({ label: f.label, url: f.url.trim() }))
    .filter((f) => f.url.length > 0);

  console.log("--- フィード別（取得→窓内件数）---");
  for (const feed of feeds) {
    try {
      const res = await fetch(feed.url, {
        headers: {
          Accept: "application/rss+xml, application/xml, text/xml, */*",
        },
      });
      if (!res.ok) {
        console.log(`${feed.label}: HTTP ${res.status}`);
        continue;
      }
      const xml = await res.text();
      const items = parseRssItems(xml);
      const tweets = normalizeRssItems(items, feed.label, cutoff, feed.url);
      const head =
        tweets[0] != null
          ? ` 先頭: ${tweets[0].createdAt} ${tweets[0].url.slice(0, 72)}…`
          : "";
      console.log(
        `${feed.label}: RSSアイテム ${items.length} 件 → 窓内 ${tweets.length} 件${head}`,
      );
    } catch (e) {
      console.log(
        `${feed.label}: エラー — ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  const r = await fetchRssAsRawTweets(config, settings);
  console.log("\n--- 取得統計 ---");
  console.log(JSON.stringify(r.stats, null, 2));
  console.log(`\n窓内・ミックス後の記事数: ${r.tweets.length}`);
  if (r.tweets.length > 0) {
    console.log("\n先頭3件の日時とURL:");
    for (const t of r.tweets.slice(0, 3)) {
      console.log(`  ${t.createdAt}  ${t.url}`);
    }
  }
  if (r.stats.fetchFailures.length > 0) {
    console.log("\n失敗したフィード:");
    for (const f of r.stats.fetchFailures) {
      console.log(`  - ${f.label}: ${f.message}`);
    }
  }
  if (r.tweets.length === 0 && r.stats.fetchSuccessCount > 0) {
    console.log(
      "\n※ 取得は一部成功していますが、lookback 内に記事がありません（日付・リンク条件で落ちた可能性）。",
    );
  }
  if (r.tweets.length === 0 && r.stats.fetchSuccessCount === 0) {
    console.log("\n※ すべてのフィード取得に失敗しています。");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
