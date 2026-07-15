import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { DailyMoneyDatabase } from "./db";
import { learnCategoryFromText } from "./category-learning";
import { inferCategory, inferTransactionKind } from "./category-classifier";
import type { Category } from "./domain";

const databases: DailyMoneyDatabase[] = [];
const categories: Category[] = [
  { id: "food", kind: "expense", name: "Ăn uống", icon: "", color: "", archived: false, builtIn: true, createdAt: "" },
  { id: "work-coffee", kind: "expense", name: "Tiếp khách", icon: "", color: "", archived: false, builtIn: false, createdAt: "" },
  { id: "other", kind: "expense", name: "Khác", icon: "", color: "", archived: false, builtIn: true, createdAt: "" }
];

afterEach(async () => Promise.all(databases.splice(0).map(database => database.delete())));

describe("local category learning", () => {
  it("learns a correction and gives it priority on the next similar phrase", async () => {
    const database = new DailyMoneyDatabase(`category-learning-${crypto.randomUUID()}`);
    databases.push(database);
    await learnCategoryFromText(database, { text: "Hôm nay Highlands 65 nghìn", kind: "expense", categoryId: "work-coffee", source: "voice" });
    const learnings = await database.categoryLearnings.toArray();

    expect(learnings).toMatchObject([{ phrase: "highlands", categoryId: "work-coffee", uses: 1 }]);
    expect(inferCategory("Highlands 70 nghìn", "expense", categories, learnings)).toMatchObject({
      categoryId: "work-coffee", matched: true,
      candidates: [{ categoryId: "work-coffee", learned: true }]
    });
    expect(inferTransactionKind("Highlands 70 nghìn", learnings)).toBe("expense");
  });

  it("updates an existing phrase instead of creating conflicting rules", async () => {
    const database = new DailyMoneyDatabase(`category-learning-${crypto.randomUUID()}`);
    databases.push(database);
    await learnCategoryFromText(database, { text: "Grab 50 nghìn", kind: "expense", categoryId: "food", source: "voice" });
    await learnCategoryFromText(database, { text: "Grab 80 nghìn", kind: "expense", categoryId: "work-coffee", source: "voice" });
    expect(await database.categoryLearnings.count()).toBe(1);
    expect(await database.categoryLearnings.toCollection().first()).toMatchObject({ categoryId: "work-coffee", uses: 2 });
  });
});
