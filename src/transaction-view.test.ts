import { describe, expect, it } from "vitest";
import type { Category, Transaction } from "./domain";
import { filterTransactions, groupTransactionsByDate, summarizeTransactions } from "./transaction-view";

const categories = new Map<string, Category>([
  ["food", { id: "food", kind: "expense", name: "Ăn uống", icon: "Utensils", color: "#f00", archived: false, builtIn: true, createdAt: "now" }],
  ["salary", { id: "salary", kind: "income", name: "Lương", icon: "Wallet", color: "#0f0", archived: false, builtIn: true, createdAt: "now" }]
]);

const transactions: Transaction[] = [
  { id: "1", kind: "expense", amount: 50_000, categoryId: "food", walletId: "wallet", date: "2026-07-15", note: "Bữa sáng", createdAt: "2026-07-15T08:00:00Z", updatedAt: "now" },
  { id: "2", kind: "income", amount: 10_000_000, categoryId: "salary", walletId: "wallet", date: "2026-07-15", note: "Tháng 7", createdAt: "2026-07-15T09:00:00Z", updatedAt: "now" },
  { id: "3", kind: "expense", amount: 80_000, categoryId: "food", walletId: "wallet", date: "2026-06-30", createdAt: "2026-06-30T09:00:00Z", updatedAt: "now" }
];

describe("transaction view helpers", () => {
  it("filters by month, kind and category", () => {
    expect(filterTransactions(transactions, categories, { month: "2026-07", query: "", kind: "expense", categoryId: "food" }).map(item => item.id)).toEqual(["1"]);
  });

  it("searches Vietnamese text without requiring diacritics", () => {
    expect(filterTransactions(transactions, categories, { month: "2026-07", query: "an uong", kind: "all", categoryId: "all" }).map(item => item.id)).toEqual(["1"]);
  });

  it("searches formatted amounts", () => {
    expect(filterTransactions(transactions, categories, { month: "2026-07", query: "10.000.000", kind: "all", categoryId: "all" }).map(item => item.id)).toEqual(["2"]);
  });

  it("summarizes income, expense and net cash flow", () => {
    expect(summarizeTransactions(transactions.slice(0, 2))).toEqual({ count: 2, income: 10_000_000, expense: 50_000, net: 9_950_000 });
  });

  it("groups transactions by date in descending order", () => {
    const groups = groupTransactionsByDate(transactions);
    expect(groups.map(group => [group.date, group.count])).toEqual([["2026-07-15", 2], ["2026-06-30", 1]]);
  });
});
