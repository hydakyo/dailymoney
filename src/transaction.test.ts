import { describe, expect, it } from "vitest";
import type { Transaction } from "./domain";
import { normalizeEditableTransaction } from "./transaction";

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
