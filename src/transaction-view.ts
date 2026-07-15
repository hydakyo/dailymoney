import type { Category, Transaction } from "./domain";

export type TransactionKindFilter = "all" | "income" | "expense";

export type TransactionFilters = {
  month: string;
  query: string;
  kind: TransactionKindFilter;
  categoryId: string;
  date?: string;
};

export type TransactionSummary = {
  count: number;
  income: number;
  expense: number;
  net: number;
};

export type TransactionDateGroup = TransactionSummary & {
  date: string;
  transactions: Transaction[];
};

function normalizeSearch(value: string | number) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi-VN")
    .trim();
}

export function summarizeTransactions(transactions: Transaction[]): TransactionSummary {
  return transactions.reduce<TransactionSummary>(
    (summary, transaction) => {
      if (transaction.kind === "income") summary.income += transaction.amount;
      if (transaction.kind === "expense") summary.expense += transaction.amount;
      summary.count += 1;
      summary.net = summary.income - summary.expense;
      return summary;
    },
    { count: 0, income: 0, expense: 0, net: 0 }
  );
}

export function filterTransactions(
  transactions: Transaction[],
  categories: Map<string, Category>,
  filters: TransactionFilters
) {
  const query = normalizeSearch(filters.query);
  return transactions
    .filter(transaction => transaction.date.startsWith(filters.month))
    .filter(transaction => !filters.date || transaction.date === filters.date)
    .filter(transaction => filters.kind === "all" || transaction.kind === filters.kind)
    .filter(transaction => filters.categoryId === "all" || transaction.categoryId === filters.categoryId)
    .filter(transaction => {
      if (!query) return true;
      const categoryName = transaction.kind === "transfer"
        ? "Chuyển ví"
        : categories.get(transaction.categoryId)?.name ?? "Không rõ";
      const searchable = [
        categoryName,
        transaction.note ?? "",
        transaction.amount,
        transaction.amount.toLocaleString("vi-VN"),
        transaction.date
      ].map(normalizeSearch).join(" ");
      return searchable.includes(query);
    })
    .sort((left, right) => right.date.localeCompare(left.date) || right.createdAt.localeCompare(left.createdAt));
}

export function groupTransactionsByDate(transactions: Transaction[]): TransactionDateGroup[] {
  const groups = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    const group = groups.get(transaction.date) ?? [];
    group.push(transaction);
    groups.set(transaction.date, group);
  }
  return Array.from(groups, ([date, items]) => ({ date, transactions: items, ...summarizeTransactions(items) }))
    .sort((left, right) => right.date.localeCompare(left.date));
}
