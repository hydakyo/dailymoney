import type { Category, EditableTransactionKind, Transaction, TransactionKind } from "./domain";

type EditableTransactionDraft = Pick<Transaction, "kind" | "amount" | "categoryId" | "date" | "note">;

export function normalizeEditableTransaction(draft: EditableTransactionDraft, primaryWalletId: string) {
  const kind: EditableTransactionKind = draft.kind === "income" ? "income" : "expense";
  return {
    kind,
    amount: draft.amount,
    categoryId: draft.categoryId,
    walletId: primaryWalletId,
    toWalletId: undefined,
    date: draft.date,
    note: draft.note
  };
}

export function requireMatchingActiveCategory(
  categories: Category[],
  input: Pick<Transaction, "categoryId"> & { kind: EditableTransactionKind }
) {
  const category = categories.find(item =>
    item.id === input.categoryId && item.kind === input.kind && !item.archived
  );
  if (!category) {
    throw new Error("Danh mục không phù hợp với loại giao dịch.");
  }
  return category;
}

export function isLegacyTransfer(kind: TransactionKind) {
  return kind === "transfer";
}
