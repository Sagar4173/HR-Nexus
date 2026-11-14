import { describe, expect, it } from "vitest";

import { normalizePage } from "@/lib/format";

describe("normalizePage", () => {
  it("defaults missing, zero, negative and non-finite values to page one", () => {
    expect(normalizePage(undefined)).toBe(1);
    expect(normalizePage(0)).toBe(1);
    expect(normalizePage(-4)).toBe(1);
    expect(normalizePage(Number.NaN)).toBe(1);
    expect(normalizePage(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it("accepts positive integers and clamps very large pages", () => {
    expect(normalizePage(2)).toBe(2);
    expect(normalizePage("3")).toBe(3);
    expect(normalizePage(Number.MAX_SAFE_INTEGER)).toBe(10_000);
  });
});
