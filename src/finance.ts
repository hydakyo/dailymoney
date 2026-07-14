import type { Budget, Category, Debt, DebtPayment, GoalEntry, RecurringOccurrence, RecurringRule, SavingsGoal, Transaction, Wallet } from "./domain";

export type BudgetProgressItem = Budget & {
  spent: number;
  category?: Category;
};

export function walletBalance(wallet: Wallet, transactions: Transaction[]) {
  return wallet.initialBalance + transactions.reduce((total, transaction) => {
    if (transaction.walletId === wallet.id) {
      if (transaction.kind === "income") return total + transaction.amount;
      if (transaction.kind === "expense") return total - transaction.amount;
      if (transaction.kind === "transfer") return total - transaction.amount;
    }
    if (transaction.kind === "transfer" && transaction.toWalletId === wallet.id) {
      return total + transaction.amount;
    }
    return total;
  }, 0);
}

export function totalBalance(wallets: Wallet[], transactions: Transaction[]) {
  return wallets.reduce((sum, wallet) => sum + walletBalance(wallet, transactions), 0);
}

export function monthTransactions(transactions: Transaction[], month: string) {
  return transactions.filter(transaction => transaction.date.startsWith(month));
}

export function monthTotals(transactions: Transaction[], month: string) {
  return monthTransactions(transactions, month).reduce(
    (totals, transaction) => ({
      income: totals.income + (transaction.kind === "income" ? transaction.amount : 0),
      expense: totals.expense + (transaction.kind === "expense" ? transaction.amount : 0)
    }),
    { income: 0, expense: 0 }
  );
}

export function categorySpending(transactions: Transaction[], month: string, categoryId: string) {
  return transactions
    .filter(transaction => transaction.kind === "expense" && transaction.categoryId === categoryId && transaction.date.startsWith(month))
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

export function budgetProgress(budgets: Budget[], transactions: Transaction[], categories: Category[], month: string): BudgetProgressItem[] {
  return budgets.filter(budget => budget.month === month).map(budget => ({
    ...budget,
    spent: categorySpending(transactions, month, budget.categoryId),
    category: categories.find(category => category.id === budget.categoryId)
  }));
}

export function debtOutstanding(debt: Debt, payments: DebtPayment[]) {
  return Math.max(0, debt.principal - payments.filter(payment => payment.debtId === debt.id).reduce((sum, payment) => sum + payment.amount, 0));
}

export function goalBalance(goal: SavingsGoal, entries: GoalEntry[]) {
  return entries.filter(entry => entry.goalId === goal.id).reduce((sum, entry) => sum + (entry.direction === "contribution" ? entry.amount : -entry.amount), 0);
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatLocalDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function advanceDueDate(rule: RecurringRule, from: string) {
  const date = parseLocalDate(from);
  if (rule.frequency === "daily") {
    date.setUTCDate(date.getUTCDate() + rule.interval);
    return formatLocalDate(date);
  }
  if (rule.frequency === "weekly") {
    date.setUTCDate(date.getUTCDate() + 7 * rule.interval);
    return formatLocalDate(date);
  }
  if (rule.frequency === "yearly") {
    const targetYear = date.getUTCFullYear() + rule.interval;
    const targetMonth = date.getUTCMonth();
    date.setUTCFullYear(targetYear, targetMonth, Math.min(rule.dayOfMonth ?? date.getUTCDate(), daysInMonth(targetYear, targetMonth)));
    return formatLocalDate(date);
  }
  const targetMonthIndex = date.getUTCMonth() + rule.interval;
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  date.setUTCFullYear(targetYear, targetMonth, Math.min(rule.dayOfMonth ?? date.getUTCDate(), daysInMonth(targetYear, targetMonth)));
  return formatLocalDate(date);
}

export function dueOccurrences(rule: RecurringRule, existing: RecurringOccurrence[], today: string) {
  const results: Array<Pick<RecurringOccurrence, "id" | "ruleId" | "dueDate" | "status">> = [];
  const seen = new Set(existing.map(item => `${item.ruleId}:${item.dueDate}`));
  let dueDate = rule.nextDueDate;
  while (dueDate <= today && (!rule.endDate || dueDate <= rule.endDate)) {
    const key = `${rule.id}:${dueDate}`;
    if (!seen.has(key)) results.push({ id: key, ruleId: rule.id, dueDate, status: "pending" });
    dueDate = advanceDueDate(rule, dueDate);
  }
  return { occurrences: results, nextDueDate: dueDate };
}
