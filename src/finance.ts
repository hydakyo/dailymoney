import type { Budget, Category, Debt, DebtPayment, GoalEntry, Installment, RecurringOccurrence, RecurringRule, SavingsGoal, Transaction, Wallet } from "./domain";

export type BudgetProgressItem = Budget & {
  spent: number;
  category?: Category;
};

export type MonthForecast = {
  projectedBalance: number;
  expectedIncome: number;
  expectedRecurringExpense: number;
  expectedInstallments: number;
  projectedFlexibleExpense: number;
  remainingBudget: number;
  daysRemaining: number;
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

export function monthForecast({
  balance,
  month,
  transactions,
  rules,
  occurrences,
  installments,
  budgets,
  asOf = new Date()
}: {
  balance: number;
  month: string;
  transactions: Transaction[];
  rules: RecurringRule[];
  occurrences: RecurringOccurrence[];
  installments: Installment[];
  budgets: BudgetProgressItem[];
  asOf?: Date;
}): MonthForecast | null {
  const currentMonth = `${asOf.getFullYear()}-${String(asOf.getMonth() + 1).padStart(2, "0")}`;
  if (month !== currentMonth) return null;

  const daysInMonth = new Date(asOf.getFullYear(), asOf.getMonth() + 1, 0).getDate();
  const daysRemaining = Math.max(0, daysInMonth - asOf.getDate());
  const elapsedDays = Math.max(1, asOf.getDate());
  const currentExpense = monthTotals(transactions, month).expense;
  const averageDailyExpense = currentExpense / elapsedDays;
  const remainingBudget = budgets.reduce((sum, budget) => sum + Math.max(0, budget.limit - budget.spent), 0);
  const uncappedFlexibleExpense = averageDailyExpense * daysRemaining;
  const projectedFlexibleExpense = budgets.length ? Math.min(uncappedFlexibleExpense, remainingBudget) : uncappedFlexibleExpense;

  const ruleById = new Map(rules.map(rule => [rule.id, rule]));
  let expectedIncome = 0;
  let expectedRecurringExpense = 0;
  for (const occurrence of occurrences) {
    if (occurrence.status !== "pending" || !occurrence.dueDate.startsWith(month)) continue;
    const rule = ruleById.get(occurrence.ruleId);
    if (!rule || !rule.active || rule.kind === "transfer") continue;
    if (rule.kind === "income") expectedIncome += rule.amount;
    else expectedRecurringExpense += rule.amount;
  }

  const expectedInstallments = installments.reduce((sum, installment) => {
    if (installment.closedAt || installment.startDate > `${month}-${String(daysInMonth).padStart(2, "0")}`) return sum;
    const dueDate = Math.min(installment.dueDate, daysInMonth);
    return dueDate > asOf.getDate() ? sum + installment.monthlyAmount : sum;
  }, 0);

  return {
    projectedBalance: balance + expectedIncome - expectedRecurringExpense - expectedInstallments - projectedFlexibleExpense,
    expectedIncome,
    expectedRecurringExpense,
    expectedInstallments,
    projectedFlexibleExpense,
    remainingBudget,
    daysRemaining
  };
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
