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
  expectedDebtReceivables: number;
  expectedDebtRepayments: number;
  projectedFlexibleExpense: number;
  flexibleForecastSource: "current" | "history" | "none";
  remainingBudget: number;
  daysRemaining: number;
};

export type CashFlowEvent = {
  date: string;
  amount: number;
  label: string;
  kind: "income" | "recurring" | "installment" | "debt" | "flexible";
};

export type CashFlowForecast = {
  endingBalance: number;
  lowestBalance: number;
  lowestBalanceDate: string | null;
  shortfall: number;
  dailyFlexibleAllowance: number;
  events: CashFlowEvent[];
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
    const alreadyCanonical = payments.length <= periods.length && payments.every(payment => {
      const period = payment.installmentPeriod;
      if (!period || !expectedPeriods.has(period) || assignedPeriods.has(period)) return false;
      assignedPeriods.add(period);
      return true;
    }) && periods.slice(0, payments.length).every(period => assignedPeriods.has(period));
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
  debts = [],
  debtPayments = [],
  asOf = new Date()
}: {
  balance: number;
  month: string;
  transactions: Transaction[];
  rules: RecurringRule[];
  occurrences: RecurringOccurrence[];
  installments: Installment[];
  budgets: BudgetProgressItem[];
  debts?: Debt[];
  debtPayments?: DebtPayment[];
  asOf?: Date;
}): MonthForecast | null {
  const currentMonth = `${asOf.getFullYear()}-${String(asOf.getMonth() + 1).padStart(2, "0")}`;
  if (month !== currentMonth) return null;

  const daysInMonth = new Date(asOf.getFullYear(), asOf.getMonth() + 1, 0).getDate();
  const daysRemaining = Math.max(0, daysInMonth - asOf.getDate());
  const elapsedDays = Math.max(1, asOf.getDate());
  const asOfDate = `${currentMonth}-${String(asOf.getDate()).padStart(2, "0")}`;
  const isFlexibleExpense = (transaction: Transaction) => transaction.kind === "expense" && !transaction.recurringRuleId && !transaction.installmentId && !transaction.debtPaymentId;
  const historyStart = new Date(Date.UTC(asOf.getFullYear(), asOf.getMonth() - 3, 1)).toISOString().slice(0, 10);
  const monthStart = `${month}-01`;
  const historicalFlexibleTransactions = transactions.filter(transaction => isFlexibleExpense(transaction) && transaction.date >= historyStart && transaction.date < monthStart);
  const currentFlexibleTransactions = transactions.filter(transaction => isFlexibleExpense(transaction) && transaction.date >= monthStart && transaction.date <= asOfDate);
  const categoryIds = new Set([...historicalFlexibleTransactions, ...currentFlexibleTransactions].map(transaction => transaction.categoryId));
  const historicalWeekdayCount = new Map<number, number>();
  for (let date = new Date(`${historyStart}T00:00:00Z`); date < new Date(`${monthStart}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + 1)) {
    historicalWeekdayCount.set(date.getUTCDay(), (historicalWeekdayCount.get(date.getUTCDay()) ?? 0) + 1);
  }
  const historicalByCategoryWeekday = new Map<string, number>();
  for (const transaction of historicalFlexibleTransactions) {
    const weekday = new Date(`${transaction.date}T00:00:00Z`).getUTCDay();
    const key = `${transaction.categoryId}:${weekday}`;
    historicalByCategoryWeekday.set(key, (historicalByCategoryWeekday.get(key) ?? 0) + transaction.amount);
  }
  const currentByCategory = new Map<string, number>();
  for (const transaction of currentFlexibleTransactions) {
    currentByCategory.set(transaction.categoryId, (currentByCategory.get(transaction.categoryId) ?? 0) + transaction.amount);
  }
  const currentWeight = currentFlexibleTransactions.length ? Math.min(0.6, elapsedDays / 14) : 0;
  const projectedByCategory = new Map<string, number>();
  const monthEndDate = new Date(Date.UTC(asOf.getFullYear(), asOf.getMonth() + 1, 0));
  for (let date = new Date(Date.UTC(asOf.getFullYear(), asOf.getMonth(), asOf.getDate() + 1)); date <= monthEndDate; date.setUTCDate(date.getUTCDate() + 1)) {
    const weekday = date.getUTCDay();
    for (const categoryId of categoryIds) {
      const historicalRate = (historicalByCategoryWeekday.get(`${categoryId}:${weekday}`) ?? 0) / (historicalWeekdayCount.get(weekday) ?? 1);
      const currentRate = (currentByCategory.get(categoryId) ?? 0) / elapsedDays;
      const dailyEstimate = historicalRate > 0 ? historicalRate * (1 - currentWeight) + currentRate * currentWeight : currentRate;
      projectedByCategory.set(categoryId, (projectedByCategory.get(categoryId) ?? 0) + dailyEstimate);
    }
  }
  const remainingBudgetByCategory = new Map(budgets.map(budget => [budget.categoryId, Math.max(0, budget.limit - budget.spent)]));
  let projectedFlexibleExpense = 0;
  let remainingBudget = 0;
  for (const [categoryId, projected] of projectedByCategory) {
    const remaining = remainingBudgetByCategory.get(categoryId);
    projectedFlexibleExpense += remaining === undefined ? projected : Math.min(projected, remaining);
  }
  for (const remaining of remainingBudgetByCategory.values()) remainingBudget += remaining;
  const flexibleForecastSource = currentFlexibleTransactions.length ? "current" : historicalFlexibleTransactions.length ? "history" : "none";

  const ruleById = new Map(rules.map(rule => [rule.id, rule]));
  const occurrenceByKey = new Map(occurrences.map(occurrence => [`${occurrence.ruleId}:${occurrence.dueDate}`, occurrence]));
  const countedOccurrences = new Set<string>();
  let expectedIncome = 0;
  let expectedRecurringExpense = 0;
  const includeRecurring = (rule: RecurringRule, dueDate: string) => {
    const key = `${rule.id}:${dueDate}`;
    if (countedOccurrences.has(key) || !rule.active || rule.kind === "transfer") return;
    const occurrence = occurrenceByKey.get(key);
    if (occurrence && occurrence.status !== "pending") return;
    countedOccurrences.add(key);
    if (rule.kind === "income") expectedIncome += rule.amount;
    else expectedRecurringExpense += rule.amount;
  };
  for (const occurrence of occurrences) {
    if (occurrence.status !== "pending" || !occurrence.dueDate.startsWith(month)) continue;
    const rule = ruleById.get(occurrence.ruleId);
    if (rule) includeRecurring(rule, occurrence.dueDate);
  }
  const monthEnd = `${month}-${String(daysInMonth).padStart(2, "0")}`;
  for (const rule of rules) {
    let dueDate = rule.nextDueDate;
    while (dueDate <= monthEnd && (!rule.endDate || dueDate <= rule.endDate)) {
      if (dueDate.startsWith(month)) includeRecurring(rule, dueDate);
      dueDate = advanceDueDate(rule, dueDate);
    }
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

  let expectedDebtReceivables = 0;
  let expectedDebtRepayments = 0;
  for (const debt of debts) {
    if (debt.closedAt || !debt.dueDate || debt.dueDate > monthEnd) continue;
    const outstanding = debtOutstanding(debt, debtPayments);
    if (debt.kind === "receivable") expectedDebtReceivables += outstanding;
    else expectedDebtRepayments += outstanding;
  }

  return {
    projectedBalance: balance + expectedIncome + expectedDebtReceivables - expectedRecurringExpense - expectedInstallments - expectedDebtRepayments - projectedFlexibleExpense,
    expectedIncome,
    expectedRecurringExpense,
    expectedInstallments,
    expectedInstallmentPeriods,
    expectedDebtReceivables,
    expectedDebtRepayments,
    projectedFlexibleExpense,
    flexibleForecastSource,
    remainingBudget,
    daysRemaining
  };
}

export function cashFlowForecast(input: {
  balance: number;
  month: string;
  transactions: Transaction[];
  rules: RecurringRule[];
  occurrences: RecurringOccurrence[];
  installments: Installment[];
  budgets: BudgetProgressItem[];
  debts?: Debt[];
  debtPayments?: DebtPayment[];
  asOf?: Date;
}): CashFlowForecast | null {
  const asOf = input.asOf ?? new Date();
  const forecast = monthForecast({ ...input, asOf });
  if (!forecast) return null;

  const currentMonth = `${asOf.getFullYear()}-${String(asOf.getMonth() + 1).padStart(2, "0")}`;
  const asOfDate = `${currentMonth}-${String(asOf.getDate()).padStart(2, "0")}`;
  const monthEnd = `${currentMonth}-${String(new Date(asOf.getFullYear(), asOf.getMonth() + 1, 0).getDate()).padStart(2, "0")}`;
  const events: CashFlowEvent[] = [];
  const addEvent = (event: CashFlowEvent) => events.push({ ...event, date: event.date < asOfDate ? asOfDate : event.date });
  const ruleById = new Map(input.rules.map(rule => [rule.id, rule]));
  const occurrenceByKey = new Map(input.occurrences.map(occurrence => [`${occurrence.ruleId}:${occurrence.dueDate}`, occurrence]));
  const countedOccurrences = new Set<string>();
  const addRecurring = (rule: RecurringRule, dueDate: string) => {
    const key = `${rule.id}:${dueDate}`;
    if (countedOccurrences.has(key) || !rule.active || rule.kind === "transfer") return;
    const occurrence = occurrenceByKey.get(key);
    if (occurrence && occurrence.status !== "pending") return;
    countedOccurrences.add(key);
    addEvent({ date: dueDate, amount: rule.kind === "income" ? rule.amount : -rule.amount, label: rule.note || "Giao dịch lặp", kind: rule.kind === "income" ? "income" : "recurring" });
  };
  for (const occurrence of input.occurrences) {
    if (occurrence.status !== "pending" || !occurrence.dueDate.startsWith(currentMonth)) continue;
    const rule = ruleById.get(occurrence.ruleId);
    if (rule) addRecurring(rule, occurrence.dueDate);
  }
  for (const rule of input.rules) {
    let dueDate = rule.nextDueDate;
    while (dueDate <= monthEnd && (!rule.endDate || dueDate <= rule.endDate)) {
      if (dueDate.startsWith(currentMonth)) addRecurring(rule, dueDate);
      dueDate = advanceDueDate(rule, dueDate);
    }
  }

  for (const installment of input.installments) {
    if (installment.closedAt) continue;
    const paidPeriods = paidInstallmentPeriods(installment, input.transactions);
    for (const period of installmentPeriods(installment)) {
      if (period > currentMonth || paidPeriods.has(period)) continue;
      const day = String(Math.min(installment.dueDate, Number(monthEnd.slice(-2)))).padStart(2, "0");
      addEvent({ date: period < currentMonth ? asOfDate : `${period}-${day}`, amount: -installment.monthlyAmount, label: `Trả góp: ${installment.name}`, kind: "installment" });
    }
  }

  for (const debt of input.debts ?? []) {
    if (debt.closedAt || !debt.dueDate || debt.dueDate > monthEnd) continue;
    const outstanding = debtOutstanding(debt, input.debtPayments ?? []);
    if (!outstanding) continue;
    addEvent({
      date: debt.dueDate,
      amount: debt.kind === "receivable" ? outstanding : -outstanding,
      label: debt.kind === "receivable" ? `Thu nợ: ${debt.person}` : `Trả nợ: ${debt.person}`,
      kind: "debt"
    });
  }

  if (forecast.projectedFlexibleExpense > 0 && forecast.daysRemaining > 0) {
    const dailyAmount = forecast.projectedFlexibleExpense / forecast.daysRemaining;
    for (let date = new Date(Date.UTC(asOf.getFullYear(), asOf.getMonth(), asOf.getDate() + 1)); date.toISOString().slice(0, 10) <= monthEnd; date.setUTCDate(date.getUTCDate() + 1)) {
      addEvent({ date: date.toISOString().slice(0, 10), amount: -dailyAmount, label: "Chi linh hoạt dự kiến", kind: "flexible" });
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount || a.label.localeCompare(b.label));
  let runningBalance = input.balance;
  let lowestBalance = runningBalance;
  let lowestBalanceDate: string | null = null;
  for (const event of events) {
    runningBalance += event.amount;
    if (runningBalance < lowestBalance) {
      lowestBalance = runningBalance;
      lowestBalanceDate = event.date;
    }
  }

  const shortfall = Math.max(0, -lowestBalance);
  return {
    endingBalance: runningBalance,
    lowestBalance,
    lowestBalanceDate,
    shortfall,
    dailyFlexibleAllowance: forecast.daysRemaining ? Math.max(0, forecast.projectedFlexibleExpense - Math.max(shortfall, Math.max(0, -forecast.projectedBalance))) / forecast.daysRemaining : 0,
    events
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
