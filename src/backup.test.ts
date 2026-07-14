import { describe, expect, it } from "vitest";
import { decryptBackup, encryptBackup } from "./backup";
import type { BackupPayloadV1, BackupPayloadV2, BackupPayloadV3 } from "./domain";

const settings = { id: "settings" as const, onboardingComplete: true, openingBalance: 0, currency: "VND" as const, lockEnabled: false, createdAt: "", updatedAt: "" };

const payloadV1: BackupPayloadV1 = {
  schemaVersion: 1,
  settings,
  categories: [], transactions: [], budgets: [], recurringRules: [], recurringOccurrences: [], debts: [], debtPayments: [], goals: [], goalEntries: [], wallets: [], installments: []
};

const payloadV2: BackupPayloadV2 = {
  schemaVersion: 2,
  settings,
  categories: [], transactions: [], budgets: [], recurringRules: [], recurringOccurrences: [], debts: [], debtPayments: [], goals: [], goalEntries: [], wallets: [], installments: []
};

const payloadV3: BackupPayloadV3 = {
  schemaVersion: 3,
  settings,
  categories: [], transactions: [], budgets: [], recurringRules: [], recurringOccurrences: [], debts: [], debtPayments: [], goals: [], goalEntries: [], wallets: [], installments: []
};

const richPayloadV3: BackupPayloadV3 = {
  ...payloadV3,
  exportedAt: "2026-07-14T00:00:00.000Z",
  debts: [{ id: "debt", kind: "payable", person: "An", principal: 3_000_000, openedDate: "2026-07-01", dueDate: "2026-08-01", note: "Mượn tiền", createdAt: "", updatedAt: "" }],
  debtPayments: [{ id: "payment", debtId: "debt", amount: 500_000, date: "2026-07-14", note: "Đợt 1", transactionId: "transaction", createdAt: "" }],
  goals: [{ id: "goal", name: "Du lịch", target: 10_000_000, targetDate: "2026-12-01", color: "#00f", icon: "Goal", createdAt: "", updatedAt: "" }],
  goalEntries: [{ id: "entry", goalId: "goal", amount: 1_000_000, direction: "contribution", date: "2026-07-14", note: "Tháng 7", createdAt: "" }],
  installments: [{ id: "installment", name: "Điện thoại", totalAmount: 12_000_000, monthlyAmount: 1_000_000, totalMonths: 12, startDate: "2026-07-01", dueDate: 15, categoryId: "shopping", walletId: "wallet", createdAt: "", updatedAt: "" }]
};

describe("encrypted backup", () => {
  it.each([payloadV1, payloadV2, payloadV3])(
    "encrypts and restores schema version %o",
    async payload => {
      const encrypted = await encryptBackup(payload, "mot-mat-khau-dai");
      const restored = await decryptBackup(encrypted, "mot-mat-khau-dai");
      expect(restored).toEqual(payload);
    }
  );

  it("preserves all current debt, savings and installment fields", async () => {
    const encrypted = await encryptBackup(richPayloadV3, "mot-mat-khau-dai");
    await expect(decryptBackup(encrypted, "mot-mat-khau-dai")).resolves.toEqual(richPayloadV3);
  });

  it("rejects short passwords before encryption", async () => {
    await expect(encryptBackup(payloadV1, "ngan")).rejects.toThrow("ít nhất 10 ký tự");
  });
});
