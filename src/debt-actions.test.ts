import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { deleteDebtWithRelatedRecords, updateDebtFromDatabase } from "./debt-actions";
import { DailyMoneyDatabase } from "./db";
import type { Debt, DebtPayment, Transaction } from "./domain";

const databases: DailyMoneyDatabase[] = [];

async function createDatabase() {
  const database = new DailyMoneyDatabase(`daily-money-debt-actions-${crypto.randomUUID()}`);
  databases.push(database);
  await database.open();
  return database;
}

const debt: Debt = {
  id: "debt-1", kind: "payable", person: "An", principal: 500_000, openedDate: "2026-07-01",
  createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z"
};

function transaction(id: string): Transaction {
  return {
    id, kind: "expense", amount: 300_000, categoryId: "food", walletId: "wallet", date: "2026-07-10",
    debtPaymentId: `payment-${id}`, createdAt: "2026-07-10T00:00:00.000Z", updatedAt: "2026-07-10T00:00:00.000Z"
  };
}

function payment(id: string, transactionId: string): DebtPayment {
  return { id, debtId: debt.id, amount: 300_000, date: "2026-07-10", transactionId, createdAt: "2026-07-10T00:00:00.000Z" };
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(async database => {
    const name = database.name;
    database.close();
    await Dexie.delete(name);
  }));
});

describe("debt actions", () => {
  it("deletes every database payment and transaction, including records absent from a stale UI snapshot", async () => {
    const database = await createDatabase();
    const first = transaction("transaction-1");
    const later = transaction("transaction-2");
    await database.debts.add(debt);
    await database.transactions.bulkAdd([first, later]);
    await database.debtPayments.bulkAdd([payment("payment-1", first.id), payment("payment-2", later.id)]);

    await deleteDebtWithRelatedRecords(database, debt.id);

    expect(await database.debts.get(debt.id)).toBeUndefined();
    expect(await database.debtPayments.where("debtId").equals(debt.id).count()).toBe(0);
    expect(await database.transactions.bulkGet([first.id, later.id])).toEqual([undefined, undefined]);
  });

  it("uses the database payment total when validating a principal edit", async () => {
    const database = await createDatabase();
    const recorded = transaction("transaction-1");
    await database.debts.add(debt);
    await database.transactions.add(recorded);
    await database.debtPayments.add(payment("payment-1", recorded.id));

    const result = await updateDebtFromDatabase(database, debt.id, { ...debt, principal: 250_000 }, "2026-07-15T00:00:00.000Z");

    expect(result).toEqual({ status: "principal-below-paid", paid: 300_000 });
    expect(await database.debts.get(debt.id)).toMatchObject({ principal: 500_000 });
  });

  it("sets closedAt from the database payment total after a valid principal edit", async () => {
    const database = await createDatabase();
    const recorded = transaction("transaction-1");
    await database.debts.add(debt);
    await database.transactions.add(recorded);
    await database.debtPayments.add(payment("payment-1", recorded.id));

    const result = await updateDebtFromDatabase(database, debt.id, { ...debt, principal: 300_000 }, "2026-07-15T00:00:00.000Z");

    expect(result).toEqual({ status: "updated" });
    expect(await database.debts.get(debt.id)).toMatchObject({ principal: 300_000, closedAt: "2026-07-15T00:00:00.000Z" });
  });
});
