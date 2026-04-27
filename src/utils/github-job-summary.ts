import { appendFileSync } from "node:fs";

export type GithubJobSummaryOutcome = "success" | "failure";

export type GithubJobSummaryPayload = {
  outcome: GithubJobSummaryOutcome;
  useSampleData: boolean;
  rssItemCount?: number;
  urlBodyCount?: number;
  topTopicCount?: number;
  /** failure のとき表示（GitHub Actions のジョブサマリー用） */
  errorMessage?: string;
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

  lines.push("| 項目 | 値 |", "|------|-----|");
  lines.push(`| RSS 記事数（分析対象） | ${cell(payload.rssItemCount)} |`);
  lines.push(`| Jina 本文取得済み URL 数 | ${cell(payload.urlBodyCount)} |`);
  if (payload.outcome === "success") {
    lines.push(`| 分析レポートの重要トピック数 | ${cell(payload.topTopicCount)} |`);
  }
  lines.push("");

  if (payload.outcome === "success") {
    lines.push("**結果:** メール送信まで完了しました。");
  } else {
    lines.push("**結果:** 失敗しました。", "");
    if (payload.errorMessage) {
      lines.push("### メッセージ", "", formatErrorForMarkdown(payload.errorMessage), "");
    }
  }

  appendGithubJobSummary(lines.join("\n"));
}
