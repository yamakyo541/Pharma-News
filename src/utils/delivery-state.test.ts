import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  filterUndeliveredTweets,
  loadDeliveredUrlSet,
  persistDeliveredUrls,
} from "./delivery-state.js";

describe("delivery-state", () => {
  let dir: string;
  let statePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pharma-del-"));
    statePath = join(dir, "state.json");
  });

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true });
    } catch {
      /* ignore */
    }
  });

  it("空ファイル相当では全件未配信として扱う", async () => {
    const delivered = await loadDeliveredUrlSet(statePath);
    const tweets = [
      {
        authorId: "a",
        text: "t",
        createdAt: "2026-01-01T00:00:00.000Z",
        url: "https://example.com/x",
      },
    ];
    expect(filterUndeliveredTweets(tweets, delivered)).toHaveLength(1);
  });

  it("persist 後は canonical URL で除外される", async () => {
    await persistDeliveredUrls(statePath, ["https://example.com/x/"], 100);
    const delivered = await loadDeliveredUrlSet(statePath);
    const tweets = [
      {
        authorId: "a",
        text: "t",
        createdAt: "2026-01-01T00:00:00.000Z",
        url: "https://example.com/x",
      },
    ];
    expect(filterUndeliveredTweets(tweets, delivered)).toHaveLength(0);
    const raw = JSON.parse(readFileSync(statePath, "utf-8")) as {
      deliveredUrls: string[];
    };
    expect(raw.deliveredUrls.length).toBeGreaterThan(0);
  });
});
