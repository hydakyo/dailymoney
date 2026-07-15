import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { DailyMoneyDatabase } from "./db";
import { updateInstallmentFromDatabase } from "./installment-actions";

const databases: DailyMoneyDatabase[] = [];

function testDatabase() {
  const database = new DailyMoneyDatabase(`installment-actions-${crypto.randomUUID()}`);
  databases.push(database);
  return database;
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(database => database.delete()));
});

describe("updateInstallmentFromDatabase", () => {
  it("keeps the schedule when another tab has already recorded a payment", async () => {
    const database = testDatabase();
    const installment = {
      id: "installment", name: "Phone", totalAmount: 1_200_000, monthlyAmount: 400_000, totalMonths: 3,
      startDate: "2026-07-01", dueDate: 15, categoryId: "shopping", walletId: "wallet", createdAt: "", updatedAt: ""
    };
    await database.installments.add(installment);
    await database.transactions.add({
      id: "payment", kind: "expense", amount: 400_000, categoryId: "shopping", walletId: "wallet", date: "2026-07-15",
      installmentId: installment.id, installmentPeriod: "2026-07", createdAt: "", updatedAt: ""
    });

    const result = await updateInstallmentFromDatabase(database, installment.id, {
      ...installment, name: "Phone (renamed)", totalAmount: 9_000_000, monthlyAmount: 3_000_000,
      totalMonths: 9, startDate: "2026-10-01", dueDate: 20
    }, "2026-07-16T00:00:00.000Z");

    expect(result).toEqual({ status: "updated", scheduleLocked: true });
    expect(await database.installments.get(installment.id)).toMatchObject({
      name: "Phone (renamed)", totalAmount: 1_200_000, monthlyAmount: 400_000, totalMonths: 3,
      startDate: "2026-07-01", dueDate: 15
    });
  });
});
