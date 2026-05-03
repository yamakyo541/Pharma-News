import { describe, it, expect, vi } from "vitest";
import type { Settings } from "../settings.js";
import { settings as appSettings } from "../settings.js";
import type { Config } from "../config.js";
import type { RawTweet } from "../types.js";

const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent };
  },
}));

const { summarizeUrls } = await import("./url-summarizer.js");

const mockConfig: Config = {
  JINA_API_KEY: "test",
  GEMINI_API_KEY: "test",
  GMAIL_USER: "bot@example.com",
  GMAIL_APP_PASSWORD: "abcdabcdabcdabcd",
  GMAIL_TO: "you@example.com",
  USE_SAMPLE_DATA: true,
};

const mockSettings: Settings = {
  ...appSettings,
  schedule: { ...appSettings.schedule },
  urlContent: {
    ...appSettings.urlContent,
    enabled: true,
    timeoutMs: 5000,
    parallelism: 5,
  },
  urlSummaryCache: appSettings.urlSummaryCache
    ? { ...appSettings.urlSummaryCache, enabled: false }
    : undefined,
};

const sampleTweets: RawTweet[] = [
  {
    authorId: "user1",
    text: "Check out https://example.com/article",
    createdAt: "2026-04-16T10:00:00.000Z",
    url: "https://example.com/post/1",
  },
];

describe("summarizeUrls", () => {
  it("urlContents が空のとき元テキストをそのまま返す", async () => {
    const result = await summarizeUrls(
      sampleTweets,
      new Map(),
      mockConfig,
      mockSettings,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.enrichedText).toBe(
      "Check out https://example.com/article",
    );
  });

  it("urlContents があるとき [補足情報] を挿入する", async () => {
    mockGenerateContent.mockResolvedValue({
      text: "記事の要約テキスト",
    });

    const urlContents = new Map([
      ["https://example.com/article", "Full article body text here..."],
    ]);

    const result = await summarizeUrls(
      sampleTweets,
      urlContents,
      mockConfig,
      mockSettings,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.enrichedText).toContain("[補足情報]");
    expect(result[0]!.enrichedText).toContain("記事の要約テキスト");
  });
});
