import { describe, expect, it } from "vitest";
import { formatAmountInput, normalizeAmountInput } from "./amount";

describe("amount input formatting", () => {
  it("formats VND amounts with dot group separators while preserving raw digits", () => {
    expect(formatAmountInput("64000")).toBe("64.000");
    expect(formatAmountInput("123456789")).toBe("123.456.789");
    expect(normalizeAmountInput("1.234.567đ")).toBe("1234567");
  });

  it("keeps a single zero and removes non-significant leading zeroes", () => {
    expect(normalizeAmountInput("00025000")).toBe("25000");
    expect(formatAmountInput("0")).toBe("0");
    expect(formatAmountInput("")).toBe("");
  });
});
