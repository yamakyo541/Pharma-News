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
  const e = error as Record<string, unknown>;
  const direct = e.status;
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;

  // @google/genai / REST が `{ error: { code: 503, status: "UNAVAILABLE" } }` 形式で返す場合
  const nested = e.error;
  if (nested && typeof nested === "object") {
    const n = nested as Record<string, unknown>;
    const code = n.code;
    if (typeof code === "number" && Number.isFinite(code)) return code;
    if (typeof code === "string" && /^\d{3}$/.test(code)) return Number(code);
  }
  return undefined;
}

/** Gemini 再試行判定用に、message / cause / オブジェクト本体をつなぐ */
function geminiErrorText(error: unknown): string {
  const parts: string[] = [];
  if (error instanceof Error) {
    parts.push(error.message);
    if (error.cause !== undefined) parts.push(String(error.cause));
  } else if (error && typeof error === "object") {
    try {
      parts.push(JSON.stringify(error));
    } catch {
      parts.push(String(error));
    }
  } else {
    parts.push(String(error));
  }
  return parts.join(" ");
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
  const msg = geminiErrorText(error);
  if (
    /429|50[0-4]|UNAVAILABLE|DEADLINE_EXCEEDED|RESOURCE_EXHAUSTED|INTERNAL/i.test(
      msg,
    )
  ) {
    return true;
  }
  // JSON 本文だけが message / cause に載るケース（"code":503）
  if (/"code"\s*:\s*(408|429|5\d{2})\b/.test(msg)) return true;
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
