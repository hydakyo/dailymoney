import type { DailyMoneyDatabase } from "./db";
import type { CategoryLearning, CategoryLearningSource, EditableTransactionKind } from "./domain";
import { newId } from "./domain";
import { learningPhrase } from "./category-classifier";

/** Persists a user-confirmed voice/SMS classification on this device only. */
export async function learnCategoryFromText(
  database: DailyMoneyDatabase,
  input: { text: string; kind: EditableTransactionKind; categoryId: string; source: CategoryLearningSource }
) {
  const phrase = learningPhrase(input.text);
  if (!phrase || !input.categoryId) return;
  const now = new Date().toISOString();
  await database.transaction("rw", database.categoryLearnings, async () => {
    const existing = await database.categoryLearnings.where("[kind+phrase]").equals([input.kind, phrase]).first();
    if (existing) {
      await database.categoryLearnings.update(existing.id, {
        categoryId: input.categoryId,
        source: input.source,
        uses: existing.uses + 1,
        updatedAt: now
      });
      return;
    }
    const learning: CategoryLearning = {
      id: newId(), kind: input.kind, phrase, categoryId: input.categoryId, source: input.source, uses: 1, createdAt: now, updatedAt: now
    };
    await database.categoryLearnings.add(learning);
  });
}
