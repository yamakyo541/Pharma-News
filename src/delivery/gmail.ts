import nodemailer from "nodemailer";
import type { Config } from "../config.js";
import type { Analysis } from "../analysis/schema.js";
import type { Settings } from "../settings.js";
import { UserFacingError } from "../utils/errors.js";

type MailTheme = Settings["mailUi"]["theme"];

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
    await transporter.sendMail({
      from: `"${settings.mailUi.senderDisplayName}" <${config.GMAIL_USER}>`,
      to: config.GMAIL_TO,
      subject: buildSubject(analysis, settings),
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
  const theme = settings.mailUi.theme;
  const bodyFont = `font-family:${theme.fontFamily};line-height:1.65;color:${theme.text};`;

  const overviewItems = analysis.daily_overview
    .map(
      (line) =>
        `<li style="margin:0 0 0.5rem 0;font-size:1.0625rem;font-weight:600;">${escapeHtml(line)}</li>`,
    )
    .join("");

  const implicationItems = analysis.industry_implications
    .map((line) => `<li style="margin:0 0 0.4rem 0;">${escapeHtml(line)}</li>`)
    .join("");

  const parts: string[] = [
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>`,
    `<body style="margin:0;padding:0;background:#f5f7fa;${bodyFont}">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;">`,
    `<tr><td align="center" style="padding:16px 12px;">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid ${theme.border};">`,
    `<tr><td style="padding:24px 20px;${bodyFont}">`,

    // ブランド見出し
    `<p style="margin:0 0 1.25rem 0;font-size:1.35rem;font-weight:700;color:${theme.accent};">${escapeHtml(settings.mailUi.digestHeading)}</p>`,

    // 今日の全体俯瞰（最優先）
    sectionHeadingHtml("今日の全体俯瞰", theme, true),
    `<ul style="margin:0.75rem 0 0 0;padding-left:1.25rem;">${overviewItems}</ul>`,

    // 今日の示唆（色帯）
    `<div style="margin-top:1.5rem;">`,
    sectionHeadingHtml("今日の示唆", theme, false),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:0.75rem;border-collapse:collapse;">`,
    `<tr><td style="background:${theme.accentSoft};border-left:4px solid ${theme.accent};padding:12px 14px;">`,
    `<ul style="margin:0;padding-left:1.15rem;color:${theme.text};">${implicationItems}</ul>`,
    `</td></tr></table>`,
    `</div>`,
  ];

  appendRankedTopicsHtml(
    parts,
    `${settings.mailUi.topTopicsSectionHeadingPrefix}${analysis.top_topics.length}`,
    analysis.top_topics,
    theme,
  );

  parts.push(
    `</td></tr></table>`,
    `</td></tr></table>`,
    `</body></html>`,
  );
  return parts.join("\n");
}

function sectionHeadingHtml(
  label: string,
  theme: MailTheme,
  prominent: boolean,
): string {
  const size = prominent ? "1.125rem" : "1rem";
  return `<h2 style="margin:0;font-size:${size};font-weight:700;color:${theme.accent};border-bottom:2px solid ${theme.accent};padding-bottom:4px;display:inline-block;">${escapeHtml(label)}</h2>`;
}

function appendRankedTopicsHtml(
  parts: string[],
  heading: string,
  items: Analysis["top_topics"],
  theme: MailTheme,
): void {
  parts.push(`<div style="margin-top:1.75rem;">`);
  parts.push(sectionHeadingHtml(heading, theme, false));
  items.forEach((topic, i) => {
    const rankedTitle = `${i + 1}. ${topic.title}`;
    parts.push(
      `<div style="margin-top:1.1rem;padding-top:0.85rem;border-top:1px solid ${theme.border};">`,
      `<h3 style="margin:0 0 0.4rem 0;font-size:1.05rem;font-weight:700;color:${theme.text};">${escapeHtml(rankedTitle)}</h3>`,
    );
    if (topic.details.length > 0) {
      const detailLis = topic.details
        .map((d) => {
          const href = escapeAttr(d.source_url);
          return `<li style="margin:0 0 0.45rem 0;">${escapeHtml(d.text)} <a href="${href}" style="font-size:0.8125rem;color:${theme.accent};text-decoration:underline;">（出典）</a></li>`;
        })
        .join("");
      parts.push(
        `<ul style="margin:0.35rem 0 0 0;padding-left:1.2rem;">${detailLis}</ul>`,
      );
    }
    if (topic.sources.length > 0) {
      const links = topic.sources
        .map((url) => {
          const href = escapeAttr(url);
          return `<li style="margin:0 0 0.25rem 0;word-break:break-all;"><a href="${href}" style="color:${theme.muted};font-size:0.8125rem;">${escapeHtml(url)}</a></li>`;
        })
        .join("");
      parts.push(
        `<p style="margin:0.6rem 0 0.2rem 0;font-size:0.8125rem;font-weight:700;color:${theme.muted};">参考</p>`,
        `<ul style="margin:0;padding-left:1.2rem;">${links}</ul>`,
      );
    }
    parts.push(`</div>`);
  });
  parts.push(`</div>`);
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

function buildSubject(analysis: Analysis, settings: Settings): string {
  const topCount = analysis.top_topics.length;
  const base = `${settings.mailUi.emailSubjectPrefix} ${formatJstDate()} 重要トピック${topCount}件`;
  const topTitle = analysis.top_topics[0]?.title;
  if (!topTitle) return base;
  const truncated = truncateForSubject(
    topTitle,
    settings.mailUi.subjectTopTopicMaxChars,
  );
  return `${base}｜${truncated}`;
}

/** 件名用に文字数で切り詰め（絵文字なども1文字扱いに近いスプレッド） */
function truncateForSubject(title: string, maxChars: number): string {
  const chars = [...title];
  if (chars.length <= maxChars) return title;
  if (maxChars <= 1) return "…";
  return `${chars.slice(0, maxChars - 1).join("")}…`;
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
