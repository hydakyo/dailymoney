import { describe, expect, it } from "vitest";
import type { Wallet } from "./domain";
import { primaryWallet, requirePrimaryWalletId } from "./wallet";

const wallet = (id: string, archived = false): Wallet => ({ id, name: id, icon: "Wallet", color: "#000", initialBalance: 0, archived, createdAt: "", updatedAt: "" });

describe("primary wallet", () => {
  it("prefers the first active wallet even when legacy backups put an archived wallet first", () => {
    const wallets = [wallet("archived", true), wallet("main"), wallet("secondary")];
    expect(primaryWallet(wallets)?.id).toBe("main");
    expect(requirePrimaryWalletId(wallets)).toBe("main");
  });

  it("fails loudly instead of creating records with an empty wallet ID", () => {
    expect(() => requirePrimaryWalletId([])).toThrow("Không tìm thấy ví chính");
  });
});
