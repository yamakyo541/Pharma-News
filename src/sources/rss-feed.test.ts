import { describe, it, expect } from "vitest";
import { normalizeRssItems, parseRssItems } from "./rss-feed.js";

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
