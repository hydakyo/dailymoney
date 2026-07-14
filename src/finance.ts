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
  expectedInstallmentPeriods: number;
  projectedFlexibleExpense: number;
  remainingBudget: number;
  daysRemaining: number;
};

export function installmentPeriods(installment: Installment) {
  const [year, month] = installment.startDate.slice(0, 7).split("-").map(Number);
  return Array.from({ length: installment.totalMonths }, (_, offset) => {
    const date = new Date(Date.UTC(year, month - 1 + offset, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export function paidInstallmentPeriods(installment: Installment, transactions: Transaction[]) {
  const expectedPeriods = new Set(installmentPeriods(installment));
  return new Set(
    transactions
      .filter(transaction => transaction.installmentId === installment.id && transaction.installmentPeriod && expectedPeriods.has(transaction.installmentPeriod))
      .map(transaction => transaction.installmentPeriod as string),
  );
}

export function oldestUnpaidInstallmentPeriod(installment: Installment, transactions: Transaction[]) {
  const paidPeriods = paidInstallmentPeriods(installment, transactions);
  return installmentPeriods(installment).find(period => !paidPeriods.has(period));
}

export function normalizeInstallmentPayments(transactions: Transaction[], installments: Installment[]) {
  const normalized = transactions.map(transaction => ({ ...transaction }));
  const installmentsById = new Map(installments.map(installment => [installment.id, installment]));
  const paymentsByInstallment = new Map<string, Transaction[]>();

  for (const transaction of normalized) {
    if (!transaction.installmentId) continue;
    if (!installmentsById.has(transaction.installmentId)) {
      transaction.installmentId = undefined;
      transaction.installmentPeriod = undefined;
      continue;
    }
    const payments = paymentsByInstallment.get(transaction.installmentId) ?? [];
    payments.push(transaction);
    paymentsByInstallment.set(transaction.installmentId, payments);
  }

  for (const [installmentId, payments] of paymentsByInstallment) {
    const periods = installmentPeriods(installmentsById.get(installmentId)!);
    const expectedPeriods = new Set(periods);
    const assignedPeriods = new Set<string>();
    const alreadyCanonical = payments.every(payment => {
      const period = payment.installmentPeriod;
      if (!period || !expectedPeriods.has(period) || assignedPeriods.has(period)) return false;
      assignedPeriods.add(period);
      return true;
    });
    if (alreadyCanonical) continue;

    payments.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    payments.forEach((payment, index) => {
      const period = periods[index];
      if (period) payment.installmentPeriod = period;
      else {
        payment.installmentId = undefined;
        payment.installmentPeriod = undefined;
      }
    });
  }

  return normalized;
}

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
  const flexibleTransactions = transactions
    .filter(transaction => transaction.kind === "expense" && transaction.date.startsWith(month) && !transaction.recurringRuleId && !transaction.installmentId && !transaction.debtPaymentId)
  const budgetedCategoryIds = new Set(budgets.map(budget => budget.categoryId));
  const budgetedFlexibleExpense = flexibleTransactions.filter(transaction => budgetedCategoryIds.has(transaction.categoryId)).reduce((sum, transaction) => sum + transaction.amount, 0);
  const unbudgetedFlexibleExpense = flexibleTransactions.filter(transaction => !budgetedCategoryIds.has(transaction.categoryId)).reduce((sum, transaction) => sum + transaction.amount, 0);
  const remainingBudget = budgets.reduce((sum, budget) => sum + Math.max(0, budget.limit - budget.spent), 0);
  const projectedBudgetedExpense = Math.min((budgetedFlexibleExpense / elapsedDays) * daysRemaining, remainingBudget);
  const projectedUnbudgetedExpense = (unbudgetedFlexibleExpense / elapsedDays) * daysRemaining;
  const projectedFlexibleExpense = projectedBudgetedExpense + projectedUnbudgetedExpense;

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

  let expectedInstallments = 0;
  let expectedInstallmentPeriods = 0;
  for (const installment of installments) {
    if (installment.closedAt) continue;
    const paidPeriods = paidInstallmentPeriods(installment, transactions);
    const dueUnpaidCount = installmentPeriods(installment).filter(period => period <= month && !paidPeriods.has(period)).length;
    expectedInstallments += dueUnpaidCount * installment.monthlyAmount;
    expectedInstallmentPeriods += dueUnpaidCount;
  }

  return {
    projectedBalance: balance + expectedIncome - expectedRecurringExpense - expectedInstallments - projectedFlexibleExpense,
    expectedIncome,
    expectedRecurringExpense,
    expectedInstallments,
    expectedInstallmentPeriods,
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
