import { describe, expect, it } from "vitest";
import { suggestRecurringFrequency } from "./recurrence-suggestion";
import type { Transaction } from "./domain";

const transaction = (id: string, date: string, amount = 30_000): Transaction => ({
  id, kind: "expense", amount, categoryId: "food", walletId: "wallet", date, createdAt: "", updatedAt: ""
});

describe("recurrence suggestion", () => {
  it("suggests a weekly rule only after a repeated history pattern", () => {
    const history = [transaction("one", "2026-07-01"), transaction("two", "2026-07-08")];
    expect(suggestRecurringFrequency(transaction("candidate", "2026-07-15"), history)).toBe("weekly");
  });

  it("does not suggest recurrence from unrelated amounts", () => {
    const history = [transaction("one", "2026-07-01", 30_000), transaction("two", "2026-07-08", 300_000)];
    expect(suggestRecurringFrequency(transaction("candidate", "2026-07-15"), history)).toBeNull();
  });
});
