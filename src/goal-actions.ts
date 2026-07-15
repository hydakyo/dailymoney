import type { DailyMoneyDatabase } from "./db";
import type { SavingsGoal } from "./domain";

export type GoalFormValues = Omit<SavingsGoal, "id" | "closedAt" | "createdAt" | "updatedAt">;
export type GoalUpdateResult = { status: "updated" } | { status: "not-found" };

/** Updates a goal and reconciles completion against the durable entry ledger. */
export async function updateGoalFromDatabase(
  database: DailyMoneyDatabase,
  goalId: string,
  value: GoalFormValues,
  now: string
): Promise<GoalUpdateResult> {
  return database.transaction("rw", database.goals, database.goalEntries, async () => {
    const existing = await database.goals.get(goalId);
    if (!existing) return { status: "not-found" };

    const entries = await database.goalEntries.where("goalId").equals(existing.id).toArray();
    const balance = entries.reduce(
      (sum, entry) => sum + (entry.direction === "contribution" ? entry.amount : -entry.amount),
      0
    );
    await database.goals.update(existing.id, {
      ...value,
      closedAt: balance >= value.target ? existing.closedAt ?? now : undefined,
      updatedAt: now
    });
    return { status: "updated" };
  });
}
