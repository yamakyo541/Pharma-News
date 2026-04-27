import type { Settings } from "../settings.js";
import { UserFacingError } from "./errors.js";

export type ResilienceSettings = Settings["resilience"];

/** 408 / 429 / 5xx を一時障害として扱う */
export function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status < 600);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const s = (error as { status?: unknown }).status;
  return typeof s === "number" ? s : undefined;
}

/** fetch 系・RSS・Jina 向け */
export function isRetryableFetchError(error: unknown): boolean {
  if (error instanceof UserFacingError) return false;
  const status = getErrorStatus(error);
  if (status !== undefined && isRetryableHttpStatus(status)) return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  if (
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "EAI_AGAIN" ||
    code === "ENOTFOUND"
  ) {
    return true;
  }
  const msg = error instanceof Error ? error.message : String(error);
  return /fetch failed|network|socket/i.test(msg);
}

/**
 * Gemini / 汎用 SDK 向け。429・5xx・UNAVAILABLE 等はリトライ候補。
 * UserFacingError は再試行しない。
 */
export function isRetryableGeminiCallError(error: unknown): boolean {
  if (error instanceof UserFacingError) return false;
  const status = getErrorStatus(error);
  if (status !== undefined && isRetryableHttpStatus(status)) return true;
  const msg = error instanceof Error ? error.message : String(error);
  if (
    /429|50[0-4]|UNAVAILABLE|DEADLINE_EXCEEDED|RESOURCE_EXHAUSTED|INTERNAL/i.test(
      msg,
    )
  ) {
    return true;
  }
  return isRetryableFetchError(error);
}

export function backoffDelayMs(
  attemptIndex: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  const exp = Math.min(
    maxDelayMs,
    baseDelayMs * 2 ** Math.max(0, attemptIndex),
  );
  const jitter = exp * 0.2 * Math.random();
  return Math.min(maxDelayMs, Math.round(exp + jitter));
}

/**
 * 失敗時に `isRetryable` が true のときだけ指数バックオフで再試行する。
 * `attempt` は 1 始まり（初回失敗後の待機は attempt=1 に対応する遅延）。
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  resilience: ResilienceSettings,
  isRetryable: (error: unknown) => boolean,
  options?: { label?: string },
): Promise<T> {
  const { maxAttempts, baseDelayMs, maxDelayMs } = resilience;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (e) {
      lastError = e;
      if (attempt >= maxAttempts || !isRetryable(e)) {
        throw e;
      }
      const wait = backoffDelayMs(attempt - 1, baseDelayMs, maxDelayMs);
      if (options?.label) {
        console.warn(
          `[retry] ${options.label} — ${attempt}/${maxAttempts} 回目失敗、${wait}ms 待って再試行`,
        );
      } else {
        console.warn(
          `[retry] ${attempt}/${maxAttempts} 回目失敗、${wait}ms 待って再試行`,
        );
      }
      await sleep(wait);
    }
  }
  throw lastError;
}
