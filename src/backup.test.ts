import { describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { decryptBackup, encryptBackup } from "./backup";
import { BackupSchema, type BackupPayload, type BackupPayloadV1, type BackupPayloadV2, type BackupPayloadV3 } from "./domain";

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

const wallet = { id: "wallet", name: "Ví chính", icon: "Wallet", color: "#000", initialBalance: 0, archived: false, createdAt: "", updatedAt: "" };
const shopping = { id: "shopping", kind: "expense" as const, name: "Mua sắm", icon: "Bag", color: "#000", archived: false, builtIn: true, createdAt: "" };
const debtTransaction = { id: "transaction", kind: "expense" as const, amount: 500_000, categoryId: "shopping", walletId: "wallet", date: "2026-07-14", debtPaymentId: "payment", createdAt: "", updatedAt: "" };

describe("encrypted backup", () => {
  it("rejects zero money and impossible calendar dates", () => {
    expect(BackupSchema.safeParse({ ...payloadV3, wallets: [wallet], categories: [shopping], transactions: [{ ...debtTransaction, amount: 0 }] }).success).toBe(false);
    expect(BackupSchema.safeParse({ ...payloadV3, wallets: [wallet], categories: [shopping], transactions: [{ ...debtTransaction, date: "2026-99-99" }] }).success).toBe(false);
  });

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

import { db, exportBackup, prepareRestorePayload, restoreBackup } from "./db";

describe("E2E Restore", () => {
  it("turns an invalid restored PIN lock off instead of locking the user out", () => {
    const prepared = prepareRestorePayload({ ...payloadV3, wallets: [wallet], settings: { ...settings, lockEnabled: true } });
    expect(prepared.settings).toMatchObject({ lockEnabled: false, pinHash: undefined, pinSalt: undefined });
  });

  it("rejects orphan references and duplicate monthly budgets before clearing device data", () => {
    expect(() => prepareRestorePayload({
      ...payloadV3,
      wallets: [wallet],
      categories: [shopping],
      transactions: [{ ...debtTransaction, categoryId: "missing-category" }]
    })).toThrow("danh mục không tồn tại");
    expect(() => prepareRestorePayload({
      ...payloadV3,
      wallets: [wallet],
      categories: [shopping],
      budgets: [
        { id: "one", categoryId: "shopping", month: "2026-07", limit: 100_000, createdAt: "", updatedAt: "" },
        { id: "two", categoryId: "shopping", month: "2026-07", limit: 200_000, createdAt: "", updatedAt: "" }
      ]
    })).toThrow("ngân sách trùng");
    expect(() => prepareRestorePayload({
      ...richPayloadV3,
      wallets: [wallet],
      categories: [shopping],
      transactions: [{ ...debtTransaction, debtPaymentId: "other-payment" }]
    })).toThrow("không khớp giao dịch liên kết");
  });

  it("repairs a legacy debt payment link when its transaction can be identified unambiguously", () => {
    const prepared = prepareRestorePayload({
      ...richPayloadV3,
      wallets: [wallet],
      categories: [shopping],
      transactions: [{ ...debtTransaction, debtPaymentId: undefined }]
    });
    expect(prepared.transactions[0].debtPaymentId).toBe("payment");
  });

  it("exports, clears and restores the complete database", async () => {
    const completePayload = { ...richPayloadV3, wallets: [wallet], categories: [shopping], transactions: [debtTransaction] };
    // Seed full database
    await db.settings.put(completePayload.settings);
    await db.categories.bulkPut(completePayload.categories);
    await db.transactions.bulkPut(completePayload.transactions);
    await db.budgets.bulkPut(completePayload.budgets);
    await db.recurringRules.bulkPut(completePayload.recurringRules);
    await db.recurringOccurrences.bulkPut(completePayload.recurringOccurrences);
    await db.debts.bulkPut(completePayload.debts);
    await db.debtPayments.bulkPut(completePayload.debtPayments);
    await db.goals.bulkPut(completePayload.goals);
    await db.goalEntries.bulkPut(completePayload.goalEntries);
    await db.wallets.bulkPut(completePayload.wallets);
    await db.installments.bulkPut(completePayload.installments);

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
      wallets: [wallet],
      categories: [shopping],
      installments: [legacyInstallment],
      transactions: legacyTransactions
    });

    const restored = await db.transactions.orderBy("id").toArray();
    expect(restored.map(transaction => transaction.installmentPeriod)).toEqual(["2026-05", "2026-06", "2026-07"]);
    expect(await db.installments.get("legacy-installment")).toMatchObject({ closedAt: expect.any(String) });
  });
});
