import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  appendGithubJobSummary,
  writeGithubActionsRunSummary,
} from "./github-job-summary.js";

describe("github-job-summary", () => {
  const original = process.env.GITHUB_STEP_SUMMARY;
  let tmpDir: string;
  let summaryFile: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pharma-gh-sum-"));
    summaryFile = join(tmpDir, "step-summary.md");
    process.env.GITHUB_STEP_SUMMARY = summaryFile;
  });

  afterEach(() => {
    if (tmpDir) {
      try {
        rmSync(tmpDir, { recursive: true });
      } catch {
        /* ignore */
      }
    }
    if (original === undefined) {
      delete process.env.GITHUB_STEP_SUMMARY;
    } else {
      process.env.GITHUB_STEP_SUMMARY = original;
    }
  });

  it("GITHUB_STEP_SUMMARY が無いときは何も書かない", () => {
    delete process.env.GITHUB_STEP_SUMMARY;
    appendGithubJobSummary("should not appear");
    expect(() => readFileSync(summaryFile, "utf-8")).toThrow();
  });

  it("成功サマリーを追記する", () => {
    writeGithubActionsRunSummary({
      outcome: "success",
      useSampleData: false,
      rssItemCount: 5,
      urlBodyCount: 3,
      topTopicCount: 5,
    });
    const text = readFileSync(summaryFile, "utf-8");
    expect(text).toContain("Pharma News");
    expect(text).toContain("5");
    expect(text).toContain("窓内");
    expect(text).toContain("新着");
    expect(text).toContain("メール送信まで完了");
  });

  it("失敗サマリーにエラーメッセージを含める", () => {
    writeGithubActionsRunSummary({
      outcome: "failure",
      useSampleData: true,
      rssItemCount: 2,
      errorMessage: "Something went wrong",
    });
    const text = readFileSync(summaryFile, "utf-8");
    expect(text).toContain("失敗");
    expect(text).toContain("Something went wrong");
    expect(text).toContain("モックRSS");
  });
});
