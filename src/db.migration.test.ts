import { describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import Dexie from "dexie";
import { DailyMoneyDatabase } from "./db";
import type { Installment, Transaction } from "./domain";

const installment: Installment = {
  id: "phone", name: "Phone", totalAmount: 1_500_000, monthlyAmount: 500_000, totalMonths: 3,
  startDate: "2026-05-01", dueDate: 20, categoryId: "shopping", walletId: "wallet", createdAt: "", updatedAt: ""
};

function legacyStores(version: 4 | 7) {
  return {
    transactions: version === 4
      ? "id, date, kind, categoryId, walletId, toWalletId, recurringRuleId, debtPaymentId, installmentId"
      : "id, date, kind, categoryId, walletId, toWalletId, recurringRuleId, debtPaymentId, installmentId, installmentPeriod, [installmentId+installmentPeriod]",
    installments: "id, closedAt, dueDate"
  };
}

function payment(id: string, date: string, installmentPeriod?: string): Transaction {
  return {
    id, kind: "expense", amount: 500_000, categoryId: "shopping", walletId: "wallet", date,
    note: "Trả góp: Phone", installmentId: "phone", installmentPeriod, createdAt: `${date}T10:00:00.000Z`, updatedAt: ""
  };
}

async function upgradeFixture(version: 4 | 7, transactions: Transaction[], fixtureInstallment: Installment) {
  const name = `daily-money-migration-${crypto.randomUUID()}`;
  const legacy = new Dexie(name);
  legacy.version(version).stores(legacyStores(version));
  await legacy.open();
  await legacy.table("transactions").bulkAdd(transactions);
  await legacy.table("installments").add(fixtureInstallment);
  legacy.close();

  const upgraded = new DailyMoneyDatabase(name);
  await upgraded.open();
  return { name, upgraded };
}

async function disposeFixture(name: string, upgraded: DailyMoneyDatabase) {
  upgraded.close();
  await Dexie.delete(name);
}

describe("installment database migrations", () => {
  it("deduplicates legacy budgets before enforcing one budget per month and category", async () => {
    const name = `daily-money-budget-migration-${crypto.randomUUID()}`;
    const legacy = new Dexie(name);
    legacy.version(10).stores({ budgets: "id, [month+categoryId], month, categoryId" });
    await legacy.open();
    await legacy.table("budgets").bulkAdd([
      { id: "old", categoryId: "food", month: "2026-07", limit: 100_000, createdAt: "2026-07-01", updatedAt: "2026-07-01" },
      { id: "new", categoryId: "food", month: "2026-07", limit: 200_000, createdAt: "2026-07-02", updatedAt: "2026-07-02" }
    ]);
    legacy.close();

    const upgraded = new DailyMoneyDatabase(name);
    await upgraded.open();
    try {
      expect(await upgraded.budgets.where("[month+categoryId]").equals(["2026-07", "food"]).count()).toBe(1);
      await expect(upgraded.budgets.add({ id: "duplicate", categoryId: "food", month: "2026-07", limit: 300_000, createdAt: "", updatedAt: "" })).rejects.toThrow();
    } finally {
      await disposeFixture(name, upgraded);
    }
  });

  it("keeps every linked payment when upgrading a version 4 database with same-month catch-up payments", async () => {
    const { name, upgraded } = await upgradeFixture(4, [
      { ...payment("may", "2026-08-01"), createdAt: "2026-08-01T10:00:00.000Z" },
      { ...payment("june", "2026-08-01"), createdAt: "2026-08-01T10:01:00.000Z" },
      payment("july", "2026-08-20"),
      payment("extra", "2026-08-21")
    ], installment);

    try {
      const payments = await upgraded.transactions.toArray();
      const byId = new Map(payments.map(item => [item.id, item]));
      expect([byId.get("may")?.installmentPeriod, byId.get("june")?.installmentPeriod, byId.get("july")?.installmentPeriod]).toEqual(["2026-05", "2026-06", "2026-07"]);
      expect(byId.get("extra")).toMatchObject({ installmentId: undefined, installmentPeriod: undefined });
      expect(await upgraded.installments.get("phone")).toMatchObject({ closedAt: expect.any(String) });
    } finally {
      await disposeFixture(name, upgraded);
    }
  });

  it("normalizes a version 7 fixture with a non-contiguous legacy period set and reopens an incorrectly closed installment", async () => {
    const { name, upgraded } = await upgradeFixture(7, [
      payment("may", "2026-05-20", "2026-05"),
      payment("july", "2026-07-20", "2026-07")
    ], { ...installment, closedAt: "2026-07-20T00:00:00.000Z" });

    try {
      const payments = await upgraded.transactions.toArray();
      const byId = new Map(payments.map(item => [item.id, item]));
      expect([byId.get("may")?.installmentPeriod, byId.get("july")?.installmentPeriod]).toEqual(["2026-05", "2026-06"]);
      expect(await upgraded.installments.get("phone")).toMatchObject({ closedAt: undefined });
    } finally {
      await disposeFixture(name, upgraded);
    }
  });

  it("assigns editable financial classes to legacy expense categories", async () => {
    const name = `daily-money-category-migration-${crypto.randomUUID()}`;
    const legacy = new Dexie(name);
    legacy.version(8).stores({ categories: "id, kind, archived" });
    await legacy.open();
    await legacy.table("categories").bulkAdd([
      { id: "home", kind: "expense", name: "Nhà ở", icon: "House", color: "#000", archived: false, builtIn: true, createdAt: "" },
      { id: "shopping", kind: "expense", name: "Mua sắm", icon: "Bag", color: "#000", archived: false, builtIn: true, createdAt: "" }
    ]);
    legacy.close();

    const upgraded = new DailyMoneyDatabase(name);
    await upgraded.open();
    try {
      expect(await upgraded.categories.get("home")).toMatchObject({ financialClass: "essential" });
      expect(await upgraded.categories.get("shopping")).toMatchObject({ financialClass: "discretionary" });
    } finally {
      await disposeFixture(name, upgraded);
    }
  });

  it("assigns likely confidence to a receivable created before confidence existed", async () => {
    const name = `daily-money-debt-migration-${crypto.randomUUID()}`;
    const legacy = new Dexie(name);
    legacy.version(9).stores({ debts: "id, kind, dueDate, closedAt" });
    await legacy.open();
    await legacy.table("debts").add({ id: "loan", kind: "receivable", person: "Bình", principal: 1_000_000, openedDate: "2026-06-01", createdAt: "", updatedAt: "" });
    legacy.close();

    const upgraded = new DailyMoneyDatabase(name);
    await upgraded.open();
    try {
      expect(await upgraded.debts.get("loan")).toMatchObject({ collectionConfidence: "likely" });
    } finally {
      await disposeFixture(name, upgraded);
    }
  });
});
