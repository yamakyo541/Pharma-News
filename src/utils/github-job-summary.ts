import { appendFileSync } from "node:fs";
import type { RssFeedFetchFailure } from "../sources/rss-feed.js";

export type GithubJobSummaryOutcome = "success" | "failure";

export type GithubJobSummaryPayload = {
  outcome: GithubJobSummaryOutcome;
  useSampleData: boolean;
  /** lookback・ミックス適用後の分析対象件数（配信差分前） */
  rssItemCount?: number;
  /** 配信済み除外後の新着件数 */
  rssNewItemCount?: number;
  urlBodyCount?: number;
  topTopicCount?: number;
  /** failure のとき表示（GitHub Actions のジョブサマリー用） */
  errorMessage?: string;
  /** 取得を試みたフィードがすべて失敗した（ジョブはエラー終了） */
  allFeedsFailed?: boolean;
  /** フィード単位の取得失敗（warn 相当の内容をサマリーに残す） */
  rssFetchFailures?: RssFeedFetchFailure[];
  /** 窓内に記事はあるがすべて配信済みでメール等をスキップした */
  skippedNoNewArticles?: boolean;
};

/**
 * GitHub Actions が注入する `GITHUB_STEP_SUMMARY` があるときだけ、
 * ジョブサマリー（実行概要タブ）へ Markdown を追記する。ローカルでは何もしない。
 */
export function appendGithubJobSummary(markdown: string): void {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path) return;
  appendFileSync(path, `${markdown}\n`, "utf-8");
}

function cell(n: number | undefined): string {
  return n === undefined ? "—" : String(n);
}

function formatErrorForMarkdown(text: string): string {
  const body = text.replace(/```/g, "'''");
  return ["```text", body, "```"].join("\n");
}

/** 成功／失敗の実行サマリーを1ブロックで書き出す */
export function writeGithubActionsRunSummary(
  payload: GithubJobSummaryPayload,
): void {
  if (!process.env.GITHUB_STEP_SUMMARY) return;

  const lines: string[] = ["## Pharma News 実行サマリー", ""];

  if (payload.useSampleData) {
    lines.push(
      "> **モード:** `USE_SAMPLE_DATA=true`（fixtures のモックRSS）",
      "",
    );
  }

  if (payload.skippedNoNewArticles) {
    lines.push(
      "> **スキップ:** 窓内に記事はありますが、いずれも過去配信済み URL のため分析・送信を行いませんでした。",
      "",
    );
  }

  if (payload.allFeedsFailed) {
    lines.push(
      "> **RSS:** 設定されたすべてのフィードの取得に失敗しました。",
      "",
    );
  }

  lines.push("| 項目 | 値 |", "|------|-----|");
  lines.push(`| RSS 記事数（窓内・ミックス後） | ${cell(payload.rssItemCount)} |`);
  lines.push(`| 新着（未配信のみのときの分析対象） | ${cell(payload.rssNewItemCount)} |`);
  lines.push(`| Jina 本文取得済み URL 数 | ${cell(payload.urlBodyCount)} |`);
  if (payload.outcome === "success") {
    lines.push(`| 分析レポートの重要トピック数 | ${cell(payload.topTopicCount)} |`);
  }
  lines.push("");

  if (payload.rssFetchFailures && payload.rssFetchFailures.length > 0) {
    lines.push("### RSS フィード取得の失敗", "");
    for (const f of payload.rssFetchFailures) {
      const msg = f.message.replace(/```/g, "'''");
      lines.push(`- **${f.label}:** \`${msg}\``);
    }
    lines.push("");
  }

  if (payload.outcome === "success") {
    if (payload.skippedNoNewArticles) {
      lines.push("**結果:** 新着なしのためスキップしました。");
    } else {
      lines.push("**結果:** メール送信まで完了しました。");
    }
  } else {
    lines.push("**結果:** 失敗しました。", "");
    if (payload.errorMessage) {
      lines.push("### メッセージ", "", formatErrorForMarkdown(payload.errorMessage), "");
    }
  }

  appendGithubJobSummary(lines.join("\n"));
}
