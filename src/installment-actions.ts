import type { DailyMoneyDatabase } from "./db";
import type { Installment } from "./domain";

export type InstallmentFormValues = Omit<Installment, "id" | "createdAt" | "updatedAt">;
export type InstallmentUpdateResult = { status: "updated"; scheduleLocked: boolean } | { status: "not-found" };

/** Keeps the payment schedule immutable once a durable payment exists. */
export async function updateInstallmentFromDatabase(
  database: DailyMoneyDatabase,
  installmentId: string,
  value: InstallmentFormValues,
  now: string
): Promise<InstallmentUpdateResult> {
  return database.transaction("rw", database.installments, database.transactions, async () => {
    const existing = await database.installments.get(installmentId);
    if (!existing) return { status: "not-found" };

    const scheduleLocked = (await database.transactions.where("installmentId").equals(existing.id).count()) > 0;
    const schedule = scheduleLocked
      ? {
          totalAmount: existing.totalAmount,
          monthlyAmount: existing.monthlyAmount,
          totalMonths: existing.totalMonths,
          startDate: existing.startDate,
          dueDate: existing.dueDate
        }
      : {};
    await database.installments.update(existing.id, { ...value, ...schedule, updatedAt: now });
    return { status: "updated", scheduleLocked };
  });
}
