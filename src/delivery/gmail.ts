import nodemailer from "nodemailer";
import type { Config } from "../config.js";
import type { Analysis } from "../analysis/schema.js";
import type { Settings } from "../settings.js";
import { UserFacingError } from "../utils/errors.js";

export async function sendDigestEmail(
  analysis: Analysis,
  config: Config,
  settings: Settings,
): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: config.GMAIL_USER,
      pass: config.GMAIL_APP_PASSWORD,
    },
  });

  const html = buildEmailHtml(analysis, settings);
  const text = buildEmailText(analysis, settings);

  try {
    const topCount = analysis.top_topics.length;
    await transporter.sendMail({
      from: `"${settings.mailUi.senderDisplayName}" <${config.GMAIL_USER}>`,
      to: config.GMAIL_TO,
      subject: buildSubject(settings, topCount),
      text,
      html,
    });
  } catch (cause) {
    throw new UserFacingError(
      "Gmail へのメール送信に失敗しました。GMAIL_USER（送信元の Google アカウント）・GMAIL_APP_PASSWORD（アプリパスワード・空白なし16文字）・GMAIL_TO（宛先。カンマ区切り可）を確認してください。",
      { cause },
    );
  }

  console.info("Gmail 送信完了");
}

function buildEmailText(analysis: Analysis, settings: Settings): string {
  const lines: string[] = [settings.mailUi.digestHeading, ""];
  lines.push("--- 今日の全体俯瞰 ---", "");
  analysis.daily_overview.forEach((line) => {
    lines.push(`・${line}`);
  });
  lines.push("");
  lines.push("--- 今日の示唆 ---", "");
  analysis.industry_implications.forEach((line) => {
    lines.push(`・${line}`);
  });
  lines.push("");
  appendRankedTopicsText(
    lines,
    `${settings.mailUi.topTopicsSectionHeadingPrefix}${analysis.top_topics.length}`,
    analysis.top_topics,
  );
  return lines.join("\n");
}

function appendRankedTopicsText(
  lines: string[],
  heading: string,
  items: Analysis["top_topics"],
): void {
  lines.push(`--- ${heading} ---`, "");
  items.forEach((topic, i) => {
    lines.push(`■ ${i + 1}. ${topic.title}`, "");
    for (const d of topic.details) {
      lines.push(`・${d.text}`, `  出典: ${d.source_url}`, "");
    }
    if (topic.sources.length > 0) {
      lines.push("参考:", ...topic.sources, "");
    }
  });
}

function buildEmailHtml(analysis: Analysis, settings: Settings): string {
  const parts: string[] = [
    "<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head><body style=\"font-family:sans-serif;line-height:1.5;color:#222;\">",
    `<h1 style="font-size:1.25rem;">${escapeHtml(settings.mailUi.digestHeading)}</h1>`,
    "<h2 style=\"font-size:1rem;margin-top:1.5rem;\">今日の全体俯瞰</h2>",
    `<ul style="margin-top:0;">${analysis.daily_overview.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`,
    "<h2 style=\"font-size:1rem;margin-top:1.5rem;\">今日の示唆</h2>",
    `<ul style="margin-top:0;">${analysis.industry_implications.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`,
  ];

  appendRankedTopicsHtml(
    parts,
    `${settings.mailUi.topTopicsSectionHeadingPrefix}${analysis.top_topics.length}`,
    analysis.top_topics,
  );

  parts.push("</body></html>");
  return parts.join("\n");
}

function appendRankedTopicsHtml(
  parts: string[],
  heading: string,
  items: Analysis["top_topics"],
): void {
  parts.push(`<h2 style="font-size:1rem;margin-top:1.5rem;">${escapeHtml(heading)}</h2>`);
  items.forEach((topic, i) => {
    const rankedTitle = `${i + 1}. ${topic.title}`;
    parts.push(`<h3 style="font-size:1rem;margin-bottom:0.25rem;">${escapeHtml(rankedTitle)}</h3>`);
    if (topic.details.length > 0) {
      const detailLis = topic.details
        .map((d) => {
          const href = escapeAttr(d.source_url);
          return `<li>${escapeHtml(d.text)} <a href="${href}" style="font-size:0.875rem;">（出典）</a></li>`;
        })
        .join("");
      parts.push(`<ul style="margin-top:0;">${detailLis}</ul>`);
    }
    if (topic.sources.length > 0) {
      const links = topic.sources
        .map((url) => {
          const href = escapeAttr(url);
          return `<li><a href="${href}">${escapeHtml(url)}</a></li>`;
        })
        .join("");
      parts.push(`<p style="font-size:0.875rem;color:#555;">参考</p><ul>${links}</ul>`);
    }
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function buildSubject(settings: Settings, topCount: number): string {
  return `${settings.mailUi.emailSubjectPrefix} ${formatJstDate()} 重要トピック${topCount}件`;
}

function formatJstDate(): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replace(/\//g, "-");
}
