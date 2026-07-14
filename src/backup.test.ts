import { describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { decryptBackup, encryptBackup } from "./backup";
import type { BackupPayload, BackupPayloadV1, BackupPayloadV2, BackupPayloadV3 } from "./domain";

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

  it("rejects malformed base64 metadata with a controlled error", async () => {
    const encrypted = await encryptBackup(payloadV3, "mot-mat-khau-dai");
    await expect(decryptBackup({ ...encrypted, kdf: { ...encrypted.kdf, salt: "A" } }, "mot-mat-khau-dai")).rejects.toThrow("File backup không đúng định dạng");
  });
});

import { db, exportBackup, restoreBackup } from "./db";

describe("E2E Restore", () => {
  it("exports, clears and restores the complete database", async () => {
    // Seed full database
    await db.settings.put(richPayloadV3.settings);
    if (richPayloadV3.categories) await db.categories.bulkPut(richPayloadV3.categories);
    if (richPayloadV3.transactions) await db.transactions.bulkPut(richPayloadV3.transactions);
    if (richPayloadV3.budgets) await db.budgets.bulkPut(richPayloadV3.budgets);
    if (richPayloadV3.recurringRules) await db.recurringRules.bulkPut(richPayloadV3.recurringRules);
    if (richPayloadV3.recurringOccurrences) await db.recurringOccurrences.bulkPut(richPayloadV3.recurringOccurrences);
    if (richPayloadV3.debts) await db.debts.bulkPut(richPayloadV3.debts);
    if (richPayloadV3.debtPayments) await db.debtPayments.bulkPut(richPayloadV3.debtPayments);
    if (richPayloadV3.goals) await db.goals.bulkPut(richPayloadV3.goals);
    if (richPayloadV3.goalEntries) await db.goalEntries.bulkPut(richPayloadV3.goalEntries);
    if (richPayloadV3.wallets) await db.wallets.bulkPut(richPayloadV3.wallets);
    if (richPayloadV3.installments) await db.installments.bulkPut(richPayloadV3.installments);

    const original = await exportBackup();
    const encrypted = await encryptBackup(original, "mot-mat-khau-dai");

    // Clear all tables
    await Promise.all(db.tables.map(table => table.clear()));

    const decrypted = await decryptBackup(encrypted, "mot-mat-khau-dai");
    await restoreBackup(decrypted);

    const restored = await exportBackup();

    // Normalize timestamps (exportedAt will be different)
    const normalize = (payload: BackupPayload) => ({ ...payload, exportedAt: undefined });
    expect(normalize(restored)).toEqual(normalize(original));
  });

  it("assigns legacy installment payments to consecutive obligation periods on restore", async () => {
    const legacyInstallment = { id: "legacy-installment", name: "Laptop", totalAmount: 1_500_000, monthlyAmount: 500_000, totalMonths: 3, startDate: "2026-05-01", dueDate: 15, categoryId: "shopping", walletId: "wallet", createdAt: "", updatedAt: "" };
    const legacyTransactions = [
      { id: "legacy-1", kind: "expense" as const, amount: 500_000, categoryId: "shopping", walletId: "wallet", date: "2026-08-01", note: "Trả góp: Laptop", installmentId: "legacy-installment", createdAt: "2026-08-01T10:00:00.000Z", updatedAt: "" },
      { id: "legacy-2", kind: "expense" as const, amount: 500_000, categoryId: "shopping", walletId: "wallet", date: "2026-08-01", note: "Trả góp: Laptop", installmentId: "legacy-installment", createdAt: "2026-08-01T10:01:00.000Z", updatedAt: "" },
      { id: "legacy-3", kind: "expense" as const, amount: 500_000, categoryId: "shopping", walletId: "wallet", date: "2026-08-20", note: "Trả góp: Laptop", installmentId: "legacy-installment", createdAt: "2026-08-20T10:00:00.000Z", updatedAt: "" }
    ];
    await restoreBackup({
      ...payloadV3,
      wallets: [{ id: "wallet", name: "Ví chính", icon: "Wallet", color: "#000", initialBalance: 0, archived: false, createdAt: "", updatedAt: "" }],
      installments: [legacyInstallment],
      transactions: legacyTransactions
    });

    const restored = await db.transactions.orderBy("id").toArray();
    expect(restored.map(transaction => transaction.installmentPeriod)).toEqual(["2026-05", "2026-06", "2026-07"]);
    expect(await db.installments.get("legacy-installment")).toMatchObject({ closedAt: expect.any(String) });
  });
});
