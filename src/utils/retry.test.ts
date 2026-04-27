import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UserFacingError } from "./errors.js";
import {
  backoffDelayMs,
  isRetryableFetchError,
  isRetryableGeminiCallError,
  isRetryableHttpStatus,
  withRetry,
} from "./retry.js";

const fastResilience = {
  maxAttempts: 3,
  baseDelayMs: 1,
  maxDelayMs: 5,
};

describe("isRetryableHttpStatus", () => {
  it("429 と 5xx を再試行対象にする", () => {
    expect(isRetryableHttpStatus(429)).toBe(true);
    expect(isRetryableHttpStatus(503)).toBe(true);
    expect(isRetryableHttpStatus(404)).toBe(false);
    expect(isRetryableHttpStatus(200)).toBe(false);
  });
});

describe("isRetryableFetchError", () => {
  it("UserFacingError は再試行しない", () => {
    expect(isRetryableFetchError(new UserFacingError("x"))).toBe(false);
  });

  it("AbortError は再試行する", () => {
    const e = new Error("aborted");
    e.name = "AbortError";
    expect(isRetryableFetchError(e)).toBe(true);
  });
});

describe("isRetryableGeminiCallError", () => {
  it("UserFacingError は再試行しない", () => {
    expect(isRetryableGeminiCallError(new UserFacingError("x"))).toBe(false);
  });

  it("RESOURCE_EXHAUSTED メッセージは再試行する", () => {
    expect(
      isRetryableGeminiCallError(
        new Error("RESOURCE_EXHAUSTED: quota exceeded"),
      ),
    ).toBe(true);
  });
});

describe("backoffDelayMs", () => {
  it("上限を超えない", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(backoffDelayMs(10, 1000, 2000)).toBeLessThanOrEqual(2000);
    vi.mocked(Math.random).mockRestore();
  });
});

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("初回成功なら1回だけ実行される", async () => {
    let n = 0;
    const p = withRetry(
      async () => {
        n++;
        return 42;
      },
      fastResilience,
      () => true,
    );
    await expect(p).resolves.toBe(42);
    expect(n).toBe(1);
  });

  it("再試行後に成功する", async () => {
    let n = 0;
    const p = withRetry(
      async () => {
        n++;
        if (n < 3) throw new Error("503");
        return "ok";
      },
      fastResilience,
      () => true,
    );
    const run = async () => {
      await vi.runAllTimersAsync();
      return p;
    };
    await expect(run()).resolves.toBe("ok");
    expect(n).toBe(3);
  });

  it("再試行不可なら即スローする", async () => {
    let n = 0;
    await expect(
      withRetry(
        async () => {
          n++;
          throw new UserFacingError("no");
        },
        fastResilience,
        isRetryableFetchError,
      ),
    ).rejects.toThrow("no");
    expect(n).toBe(1);
  });
});
