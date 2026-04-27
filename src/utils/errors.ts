/** 受講生向けメッセージ用。`main.ts` が `[USER-FACING]` として表示する */
export class UserFacingError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "UserFacingError";
  }
}
