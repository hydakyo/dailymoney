import { describe, expect, it } from "vitest";
import type { Category, Transaction } from "./domain";
import { normalizeEditableTransaction, requireMatchingActiveCategory } from "./transaction";

describe("single-wallet transaction normalization", () => {
  it("cleans a legacy transfer into an expense on the primary wallet", () => {
    const legacy = {
      kind: "transfer",
      amount: 120_000,
      categoryId: "food",
      date: "2026-07-14",
      note: "Dữ liệu cũ"
    } satisfies Pick<Transaction, "kind" | "amount" | "categoryId" | "date" | "note">;

    expect(normalizeEditableTransaction(legacy, "primary-wallet")).toEqual({
      kind: "expense",
      amount: 120_000,
      categoryId: "food",
      walletId: "primary-wallet",
      toWalletId: undefined,
      date: "2026-07-14",
      note: "Dữ liệu cũ"
    });
  });
});

describe("transaction category integrity", () => {
  const categories: Category[] = [
    { id: "salary", kind: "income", name: "Salary", icon: "Banknote", color: "#0f0", archived: false, builtIn: true, createdAt: "" },
    { id: "food", kind: "expense", name: "Food", icon: "Utensils", color: "#f00", archived: false, builtIn: true, createdAt: "" },
    { id: "old-food", kind: "expense", name: "Old", icon: "Archive", color: "#999", archived: true, builtIn: false, createdAt: "" }
  ];

  it("rejects an income category when an edited transaction changes to expense", () => {
    expect(() => requireMatchingActiveCategory(categories, { kind: "expense", categoryId: "salary" }))
      .toThrow("Danh mục không phù hợp với loại giao dịch.");
  });

  it("accepts only an active category of the selected kind", () => {
    expect(requireMatchingActiveCategory(categories, { kind: "expense", categoryId: "food" }).id).toBe("food");
    expect(() => requireMatchingActiveCategory(categories, { kind: "expense", categoryId: "old-food" })).toThrow();
  });
});
