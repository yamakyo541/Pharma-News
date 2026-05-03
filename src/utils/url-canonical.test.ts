import { describe, it, expect } from "vitest";
import { canonicalUrlForState } from "./url-canonical.js";

describe("canonicalUrlForState", () => {
  it("ホストを小文字化し末尾スラッシュとハッシュを除去する", () => {
    expect(
      canonicalUrlForState("HTTPS://Example.COM/path/#frag"),
    ).toBe("https://example.com/path");
  });

  it("クエリは保持する", () => {
    expect(canonicalUrlForState("https://a.com/x?y=1")).toBe(
      "https://a.com/x?y=1",
    );
  });
});
