import { describe, expect, it } from "vitest";
import { decryptBackup, encryptBackup } from "./backup";
import type { BackupPayloadV1 } from "./domain";

const payload: BackupPayloadV1 = {
  schemaVersion: 1,
  exportedAt: "2026-07-13T00:00:00.000Z",
  settings: { id: "settings", onboardingComplete: true, openingBalance: 0, currency: "VND", lockEnabled: false, createdAt: "", updatedAt: "" },
  categories: [], transactions: [], budgets: [], recurringRules: [], recurringOccurrences: [], debts: [], debtPayments: [], goals: [], goalEntries: []
};

describe("encrypted backup", () => {
  it("round-trips only with the correct password", async () => {
    const backup = await encryptBackup(payload, "mot-mat-khau-dai");
    await expect(decryptBackup(backup, "sai-mat-khau")).rejects.toThrow("Không thể mở backup");
    await expect(decryptBackup(backup, "mot-mat-khau-dai")).resolves.toEqual(payload);
  });

  it("rejects short passwords before encryption", async () => {
    await expect(encryptBackup(payload, "ngan")).rejects.toThrow("ít nhất 10 ký tự");
  });
});
