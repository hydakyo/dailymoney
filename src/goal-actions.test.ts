import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { DailyMoneyDatabase } from "./db";
import { updateGoalFromDatabase } from "./goal-actions";

const databases: DailyMoneyDatabase[] = [];

function testDatabase() {
  const database = new DailyMoneyDatabase(`goal-actions-${crypto.randomUUID()}`);
  databases.push(database);
  return database;
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(database => database.delete()));
});

describe("updateGoalFromDatabase", () => {
  it("reconciles closedAt when editing a target in either direction", async () => {
    const database = testDatabase();
    const goal = {
      id: "goal", name: "Emergency fund", target: 12_000_000, color: "#000", icon: "Goal",
      createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z"
    };
    await database.goals.add(goal);
    await database.goalEntries.add({ id: "entry", goalId: goal.id, amount: 10_000_000, direction: "contribution", date: "2026-07-02", createdAt: "2026-07-02T00:00:00.000Z" });

    await updateGoalFromDatabase(database, goal.id, { name: goal.name, target: 8_000_000, color: goal.color, icon: goal.icon }, "2026-07-03T00:00:00.000Z");
    expect((await database.goals.get(goal.id))?.closedAt).toBe("2026-07-03T00:00:00.000Z");

    await updateGoalFromDatabase(database, goal.id, { name: goal.name, target: 15_000_000, color: goal.color, icon: goal.icon }, "2026-07-04T00:00:00.000Z");
    expect((await database.goals.get(goal.id))?.closedAt).toBeUndefined();
  });
});
