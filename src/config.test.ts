import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  const original = process.env;

  beforeEach(() => {
    process.env = { ...original };
  });

  afterAll(() => {
    process.env = original;
  });

  const commonEnv = {
    JINA_API_KEY: "test",
    GEMINI_API_KEY: "test",
    GMAIL_USER: "bot@example.com",
    GMAIL_APP_PASSWORD: "abcdabcdabcdabcd",
    GMAIL_TO: "you@example.com",
  };

  it("USE_SAMPLE_DATA=false で必須キーが揃っていればパースできる", () => {
    process.env = {
      ...original,
      ...commonEnv,
      USE_SAMPLE_DATA: "false",
    };
    const config = loadConfig();
    expect(config.USE_SAMPLE_DATA).toBe(false);
    expect(config.GEMINI_API_KEY).toBe("test");
  });

  it("USE_SAMPLE_DATA=true を boolean に変換する", () => {
    process.env = { ...original, ...commonEnv, USE_SAMPLE_DATA: "true" };
    const config = loadConfig();
    expect(config.USE_SAMPLE_DATA).toBe(true);
  });

  it("必須キーが欠落すると process.exit(1) を呼ぶ", () => {
    process.env = {};
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {
        throw new Error("process.exit called");
      }) as never);
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => loadConfig()).toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("USE_SAMPLE_DATA=true のときも必須の共通キーだけで成功する", () => {
    process.env = { ...original, ...commonEnv, USE_SAMPLE_DATA: "true" };
    const config = loadConfig();
    expect(config.USE_SAMPLE_DATA).toBe(true);
  });
});
