import { describe, it, expect, vi } from "vitest";
import { fetchUrlContents } from "./url-content.js";
import type { Config } from "../config.js";
import type { Settings } from "../settings.js";
import { settings as appSettings } from "../settings.js";
import type { RawTweet } from "../types.js";

const mockConfig: Config = {
  JINA_API_KEY: "test-jina",
  GEMINI_API_KEY: "test-gemini",
  GMAIL_USER: "bot@example.com",
  GMAIL_APP_PASSWORD: "abcdabcdabcdabcd",
  GMAIL_TO: "you@example.com",
  USE_SAMPLE_DATA: true,
};

const baseSettings: Settings = {
  ...appSettings,
  schedule: { ...appSettings.schedule },
  urlContent: {
    ...appSettings.urlContent,
    enabled: true,
    timeoutMs: 5000,
    parallelism: 5,
  },
};

const disabledSettings: Settings = {
  ...baseSettings,
  urlContent: { ...baseSettings.urlContent, enabled: false },
};

const tweetsNoUrl: RawTweet[] = [
  {
    authorId: "user1",
    text: "URLなしのツイート",
    createdAt: "2026-04-16T10:00:00.000Z",
    url: "https://example.com/post/no-url-in-text",
  },
];

function makeTweetsWithUrls(...urls: string[]): RawTweet[] {
  return urls.map((u, i) => ({
    authorId: "user1",
    text: `Check out ${u}`,
    createdAt: "2026-04-16T10:00:00.000Z",
    url: `https://example.com/post/${i + 1}`,
  }));
}

describe("fetchUrlContents", () => {
  it("urlContent.enabled=false のとき空Mapを返す", async () => {
    const result = await fetchUrlContents(
      makeTweetsWithUrls("https://example.com/article"),
      mockConfig,
      disabledSettings,
    );
    expect(result.size).toBe(0);
  });

  it("URLがないツイートでは空Mapを返す", async () => {
    const result = await fetchUrlContents(
      tweetsNoUrl,
      mockConfig,
      baseSettings,
    );
    expect(result.size).toBe(0);
  });

  it("Jina 200 OK で本文を取得できる", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        // HEAD展開: 展開後URLとしてそのまま返す（除外ドメインでないので通過する）
        if (init?.method === "HEAD") {
          return Promise.resolve({ url });
        }
        // Jina Reader 呼び出し
        if (url.startsWith("https://r.jina.ai/")) {
          return Promise.resolve(new Response("Article body content", { status: 200 }));
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );

    const tweets = makeTweetsWithUrls("https://example.com/article");
    const result = await fetchUrlContents(tweets, mockConfig, baseSettings);
    expect(result.size).toBe(1);
    const content = [...result.values()][0];
    expect(content).toBe("Article body content");
  });

  it("Jina 402 でフォールバックし残りをスキップする", async () => {
    let jinaCallCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (init?.method === "HEAD") {
          return Promise.resolve({ url });
        }
        if (url.startsWith("https://r.jina.ai/")) {
          jinaCallCount++;
          if (jinaCallCount === 1) {
            return Promise.resolve(new Response("First article", { status: 200 }));
          }
          return Promise.resolve(new Response(null, { status: 402 }));
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );

    const tweets = makeTweetsWithUrls(
      "https://a.example.com/1",
      "https://b.example.com/2",
      "https://c.example.com/3",
    );
    const result = await fetchUrlContents(tweets, mockConfig, {
      ...baseSettings,
      urlContent: { ...baseSettings.urlContent, parallelism: 1 },
    });
    expect(result.size).toBe(1);
    expect([...result.values()][0]).toBe("First article");
  });
});
