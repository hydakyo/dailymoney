import type { EditableTransactionKind, Transaction, TransactionKind } from "./domain";

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

export function isLegacyTransfer(kind: TransactionKind) {
  return kind === "transfer";
}
