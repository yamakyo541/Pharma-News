import { describe, it, expect } from "vitest";
import {
  applyRssCategorySelection,
  normalizeRssItems,
  parseRssItems,
} from "./rss-feed.js";
import type { Settings } from "../settings.js";

describe("parseRssItems", () => {
  it("RSS 2.0 の item を配列として解釈する", () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <item>
      <title><![CDATA[記事A]]></title>
      <link>https://example.com/a</link>
      <pubDate>Mon, 27 Apr 2026 10:00:00 GMT</pubDate>
      <description><![CDATA[<p>概要A</p>]]></description>
    </item>
    <item>
      <title>記事B</title>
      <link>https://example.com/b</link>
      <pubDate>Mon, 26 Apr 2026 10:00:00 GMT</pubDate>
      <description>概要B</description>
    </item>
  </channel>
</rss>`;
    const items = parseRssItems(xml);
    expect(items).toHaveLength(2);
    expect(items[0]!.link).toBe("https://example.com/a");
    expect(items[1]!.title).toBe("記事B");
  });

  it("item が1件だけでも配列として扱う", () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>単一</title>
    <link>https://example.com/one</link>
    <pubDate>Mon, 27 Apr 2026 12:00:00 GMT</pubDate>
  </item>
</channel></rss>`;
    const items = parseRssItems(xml);
    expect(items).toHaveLength(1);
    expect(items[0]!.link).toBe("https://example.com/one");
  });

  it("description 内の実体参照が多い RSS 2.0 も解析できる（既定1000回上限を超えない設定）", () => {
    // CDATA 内は実体参照として展開されないため、要素テキストに &amp; を並べる
    const many = "&amp;".repeat(1200);
    const xml = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>多実体参照</title>
    <link>https://example.com/many-entities</link>
    <pubDate>Mon, 27 Apr 2026 12:00:00 GMT</pubDate>
    <description>${many}</description>
  </item>
</channel></rss>`;
    const items = parseRssItems(xml);
    expect(items).toHaveLength(1);
    expect(items[0]!.link).toBe("https://example.com/many-entities");
  });

  it("RSS 1.0（rdf:RDF）の item を解釈し dc:date を pubDate 相当として返す", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns="http://purl.org/rss/1.0/"
         xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel rdf:about="https://example.com/feed">
    <title>Test RDF</title>
    <link>https://example.com/</link>
  </channel>
  <item>
    <title>RDF記事</title>
    <link>https://example.com/rdf-1</link>
    <dc:date>2026-04-27T12:00:00+09:00</dc:date>
  </item>
</rdf:RDF>`;
    const items = parseRssItems(xml);
    expect(items).toHaveLength(1);
    expect(items[0]!.link).toBe("https://example.com/rdf-1");
    expect(items[0]!.pubDate).toBe("2026-04-27T12:00:00+09:00");
  });
});

describe("normalizeRssItems", () => {
  it("不正な pubDate の item はスキップし toISOString で落ちない", () => {
    const cutoff = new Date("2020-01-01T00:00:00.000Z");
    const out = normalizeRssItems(
      [
        { title: "壊れ日付", link: "https://example.com/bad", pubDate: "not-a-date" },
        {
          title: "正常",
          link: "https://example.com/good",
          pubDate: "Mon, 27 Apr 2026 10:00:00 GMT",
        },
      ],
      "Test",
      cutoff,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.url).toBe("https://example.com/good");
  });
});

describe("applyRssCategorySelection", () => {
  const baseSettings = {
    contentSource: {
      rssFeeds: [],
      rssMaxItems: 3,
      rssFetchTimeoutMs: 15_000,
      rssCategoryCaps: { a: 1, b: 2 },
    },
    mailUi: {
      senderDisplayName: "",
      emailSubjectPrefix: "",
      digestHeading: "",
      topTopicsSectionHeadingPrefix: "",
    },
    schedule: { lookbackHours: 24 },
    urlContent: {
      enabled: true,
      timeoutMs: 1,
      parallelism: 1,
      maxSummaryChars: 1,
      inputCharsMultiplier: 1,
    },
    analysis: {
      urlSummaryModel: "",
      trendAnalysisModel: "",
      temperature: 0,
      geminiMaxParallelRequests: 1,
    },
    resilience: {
      maxAttempts: 1,
      baseDelayMs: 1,
      maxDelayMs: 1,
    },
  } satisfies Settings;

  it("カテゴリ上限を守りつつ不足分を他カテゴリで埋める", () => {
    const tweets = [
      {
        authorId: "x",
        text: "t",
        createdAt: "2026-04-27T12:00:00.000Z",
        url: "https://example.com/1",
        category: "a",
      },
      {
        authorId: "x",
        text: "t",
        createdAt: "2026-04-27T11:00:00.000Z",
        url: "https://example.com/2",
        category: "a",
      },
      {
        authorId: "y",
        text: "t",
        createdAt: "2026-04-27T10:00:00.000Z",
        url: "https://example.com/3",
        category: "b",
      },
      {
        authorId: "y",
        text: "t",
        createdAt: "2026-04-27T09:00:00.000Z",
        url: "https://example.com/4",
        category: "b",
      },
    ];
    const out = applyRssCategorySelection(tweets, baseSettings);
    expect(out).toHaveLength(3);
    expect(out.map((t) => t.url)).toEqual([
      "https://example.com/1",
      "https://example.com/3",
      "https://example.com/4",
    ]);
  });
});
