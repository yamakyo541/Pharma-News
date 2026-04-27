import { describe, it, expect, vi } from "vitest";
import { UserFacingError } from "../utils/errors.js";
import type { Settings } from "../settings.js";
import { settings as appSettings } from "../settings.js";
import type { Config } from "../config.js";
import type { EnrichedTweet } from "../types.js";

const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent };
  },
}));

const { analyzeTrends } = await import("./analyze.js");

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
  urlContent: { ...appSettings.urlContent, enabled: false },
};

const sampleTweets: EnrichedTweet[] = [
  {
    authorId: "test",
    text: "AI news",
    createdAt: "2026-04-16T10:00:00.000Z",
    url: "https://example.com/news/ai-1",
    enrichedText: "AI news",
  },
];

const validResponse = {
  daily_overview: ["全体俯瞰1", "全体俯瞰2", "全体俯瞰3"],
  industry_implications: ["示唆1", "示唆2"],
  top_topics: [
    {
      title: "Test News",
      details: ["Detail"],
      sources: ["https://example.com/news/ai-1"],
    },
    {
      title: "Test News 2",
      details: ["Detail"],
      sources: ["https://example.com/news/ai-2"],
    },
    {
      title: "Test News 3",
      details: ["Detail"],
      sources: ["https://example.com/news/ai-3"],
    },
  ],
};

describe("analyzeTrends", () => {
  it("正常な JSON を返すと Analysis を返す", async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify(validResponse),
      candidates: [{ finishReason: "STOP" }],
    });

    const result = await analyzeTrends(sampleTweets, mockConfig, mockSettings);
    expect(result.top_topics).toHaveLength(3);
    expect(result.top_topics[0]!.title).toBe("Test News");
  });

  it("SAFETY finishReason で UserFacingError をスローする", async () => {
    mockGenerateContent.mockResolvedValue({
      text: undefined,
      candidates: [{ finishReason: "SAFETY" }],
    });

    await expect(
      analyzeTrends(sampleTweets, mockConfig, mockSettings),
    ).rejects.toThrow(UserFacingError);
  });
});
