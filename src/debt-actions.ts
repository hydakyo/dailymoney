import type { DailyMoneyDatabase } from "./db";
import type { Debt } from "./domain";

export type DebtFormValues = Pick<
  Debt,
  "kind" | "person" | "principal" | "openedDate" | "dueDate" | "note" | "priority" | "collectionConfidence"
>;

export type DebtUpdateResult =
  | { status: "updated" }
  | { status: "not-found" }
  | { status: "principal-below-paid"; paid: number };

export async function deleteDebtWithRelatedRecords(database: DailyMoneyDatabase, debtId: string) {
  await database.transaction("rw", database.debts, database.debtPayments, database.transactions, async () => {
    const payments = await database.debtPayments.where("debtId").equals(debtId).toArray();
    await database.transactions.bulkDelete(payments.map(payment => payment.transactionId));
    await database.debtPayments.bulkDelete(payments.map(payment => payment.id));
    await database.debts.delete(debtId);
  });
}

export async function updateDebtFromDatabase(
  database: DailyMoneyDatabase,
  debtId: string,
  value: DebtFormValues,
  now: string
): Promise<DebtUpdateResult> {
  return database.transaction("rw", database.debts, database.debtPayments, async () => {
    const currentDebt = await database.debts.get(debtId);
    if (!currentDebt) return { status: "not-found" };

    const payments = await database.debtPayments.where("debtId").equals(debtId).toArray();
    const paid = payments.reduce((sum, payment) => sum + payment.amount, 0);
    if (value.principal < paid) return { status: "principal-below-paid", paid };

    await database.debts.update(debtId, {
      ...value,
      closedAt: paid > 0 && value.principal <= paid ? currentDebt.closedAt ?? now : undefined,
      updatedAt: now
    });
    return { status: "updated" };
  });
}
