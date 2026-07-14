import type { Budget, Category, Debt, DebtPayment, GoalEntry, Installment, ObligationPriority, RecurringOccurrence, RecurringRule, SavingsGoal, Transaction, Wallet } from "./domain";

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
  behaviorConfidence: "low" | "medium" | "high";
  remainingBudget: number;
  daysRemaining: number;
};

export type CashFlowEvent = {
  date: string;
  amount: number;
  label: string;
  kind: "income" | "recurring" | "installment" | "debt" | "goal" | "flexible";
  priority?: ObligationPriority;
  categoryId?: string;
};

export type CashFlowForecast = {
  endingBalance: number;
  lowestBalance: number;
  lowestBalanceDate: string | null;
  lowestBalanceWithoutFlexible: number;
  shortfall: number;
  dailyFlexibleAllowance: number;
  flexibleExpenseForecast: number;
  events: CashFlowEvent[];
};

export type CashFlowScenario = {
  flexibleExpenseMultiplier?: number;
  receivableMultiplier?: number;
};

export type CashFlowForecastInput = {
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
  scenario?: CashFlowScenario;
  reserveFloor?: number;
};

export type CashFlowScenarios = {
  base: CashFlowForecast;
  cautious: CashFlowForecast;
  rescue: CashFlowForecast;
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

export function collectionConfidenceMultiplier(debt: Debt) {
  if (debt.kind !== "receivable") return 1;
  // Backups created before collection confidence existed must stay conservative.
  // New receivables use "likely" as their default, so legacy rows do too.
  if (debt.collectionConfidence === "uncertain") return 0.5;
  if (debt.collectionConfidence === "certain") return 1;
  return 0.8;
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
  const historicalDates = new Set(historicalFlexibleTransactions.map(transaction => transaction.date));
  const historicalMonths = new Set(historicalFlexibleTransactions.map(transaction => transaction.date.slice(0, 7)));
  const historicalCategoryCount = new Set(historicalFlexibleTransactions.map(transaction => transaction.categoryId)).size;
  const dailyTotals = new Map<string, number>();
  for (const transaction of historicalFlexibleTransactions) {
    dailyTotals.set(transaction.date, (dailyTotals.get(transaction.date) ?? 0) + transaction.amount);
  }
  const dailyValues = [...dailyTotals.values()];
  const dailyAverage = dailyValues.reduce((sum, amount) => sum + amount, 0) / Math.max(1, dailyValues.length);
  const dailyDeviation = Math.sqrt(dailyValues.reduce((sum, amount) => sum + (amount - dailyAverage) ** 2, 0) / Math.max(1, dailyValues.length));
  const hasStablePattern = dailyAverage > 0 && dailyDeviation / dailyAverage <= 1.5;
  const latestHistoryDate = [...historicalDates].sort().at(-1);
  const isRecent = Boolean(latestHistoryDate && latestHistoryDate >= new Date(Date.UTC(asOf.getFullYear(), asOf.getMonth(), asOf.getDate() - 45)).toISOString().slice(0, 10));
  const behaviorConfidence = historicalMonths.size >= 3 && historicalDates.size >= 18 && historicalCategoryCount >= 2 && hasStablePattern && isRecent
    ? "high"
    : historicalMonths.size >= 2 && historicalDates.size >= 8 && isRecent
    ? "medium"
    : "low";

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
  for (const rule of rules) {
    for (const dueDate of recurringDatesInMonth(rule, month)) includeRecurring(rule, dueDate);
  }
  const monthEnd = `${month}-${String(daysInMonth).padStart(2, "0")}`;

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
    if (debt.kind === "receivable") expectedDebtReceivables += outstanding * collectionConfidenceMultiplier(debt);
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
    behaviorConfidence,
    remainingBudget,
    daysRemaining
  };
}

export function cashFlowForecast(input: CashFlowForecastInput): CashFlowForecast | null {
  const asOf = input.asOf ?? new Date();
  const forecast = monthForecast({ ...input, asOf });
  if (!forecast) return null;

  const currentMonth = `${asOf.getFullYear()}-${String(asOf.getMonth() + 1).padStart(2, "0")}`;
  const asOfDate = `${currentMonth}-${String(asOf.getDate()).padStart(2, "0")}`;
  const monthEnd = `${currentMonth}-${String(new Date(asOf.getFullYear(), asOf.getMonth() + 1, 0).getDate()).padStart(2, "0")}`;
  const flexibleExpenseMultiplier = Math.max(0, input.scenario?.flexibleExpenseMultiplier ?? 1);
  const receivableMultiplier = Math.min(1, Math.max(0, input.scenario?.receivableMultiplier ?? 1));
  const reserveFloor = Math.max(0, input.reserveFloor ?? 0);
  const fixedEvents: CashFlowEvent[] = [];
  const addEvent = (event: CashFlowEvent) => fixedEvents.push({ ...event, date: event.date < asOfDate ? asOfDate : event.date });
  const ruleById = new Map(input.rules.map(rule => [rule.id, rule]));
  const occurrenceByKey = new Map(input.occurrences.map(occurrence => [`${occurrence.ruleId}:${occurrence.dueDate}`, occurrence]));
  const countedOccurrences = new Set<string>();
  const addRecurring = (rule: RecurringRule, dueDate: string) => {
    const key = `${rule.id}:${dueDate}`;
    if (countedOccurrences.has(key) || !rule.active || rule.kind === "transfer") return;
    const occurrence = occurrenceByKey.get(key);
    if (occurrence && occurrence.status !== "pending") return;
    countedOccurrences.add(key);
    const priority = rule.priority ?? "normal";
    addEvent({ date: dueDate, amount: rule.kind === "income" ? rule.amount : -rule.amount, label: rule.note || "Giao dịch lặp", kind: rule.kind === "income" ? "income" : "recurring", priority: rule.kind === "expense" ? priority : undefined, categoryId: rule.categoryId });
  };
  for (const occurrence of input.occurrences) {
    if (occurrence.status !== "pending" || !occurrence.dueDate.startsWith(currentMonth)) continue;
    const rule = ruleById.get(occurrence.ruleId);
    if (rule) addRecurring(rule, occurrence.dueDate);
  }
  for (const rule of input.rules) {
    for (const dueDate of recurringDatesInMonth(rule, currentMonth)) addRecurring(rule, dueDate);
  }

  for (const installment of input.installments) {
    if (installment.closedAt) continue;
    const paidPeriods = paidInstallmentPeriods(installment, input.transactions);
    for (const period of installmentPeriods(installment)) {
      if (period > currentMonth || paidPeriods.has(period)) continue;
      const day = String(Math.min(installment.dueDate, Number(monthEnd.slice(-2)))).padStart(2, "0");
      addEvent({ date: period < currentMonth ? asOfDate : `${period}-${day}`, amount: -installment.monthlyAmount, label: `Trả góp: ${installment.name}`, kind: "installment", priority: installment.priority ?? "high", categoryId: installment.categoryId });
    }
  }

  for (const debt of input.debts ?? []) {
    if (debt.closedAt || !debt.dueDate || debt.dueDate > monthEnd) continue;
    const outstanding = debtOutstanding(debt, input.debtPayments ?? []);
    if (!outstanding) continue;
    const adjustedOutstanding = debt.kind === "receivable" ? outstanding * collectionConfidenceMultiplier(debt) * receivableMultiplier : outstanding;
    if (!adjustedOutstanding) continue;
    addEvent({
      date: debt.dueDate,
      amount: debt.kind === "receivable" ? adjustedOutstanding : -adjustedOutstanding,
      label: debt.kind === "receivable" ? `Thu nợ: ${debt.person}` : `Trả nợ: ${debt.person}`,
      kind: "debt",
      priority: debt.kind === "payable" ? debt.priority ?? "high" : undefined
    });
  }

  const flexibleExpenseForecast = forecast.projectedFlexibleExpense * flexibleExpenseMultiplier;
  const flexibleDates: string[] = [];
  for (let date = new Date(Date.UTC(asOf.getFullYear(), asOf.getMonth(), asOf.getDate() + 1)); date.toISOString().slice(0, 10) <= monthEnd; date.setUTCDate(date.getUTCDate() + 1)) {
    flexibleDates.push(date.toISOString().slice(0, 10));
  }
  const simulate = (dailyAmount: number) => {
    const events = [
      ...fixedEvents,
      ...flexibleDates.map(date => ({ date, amount: -dailyAmount, label: "Chi linh hoạt dự kiến", kind: "flexible" as const }))
    ].sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount || a.label.localeCompare(b.label));
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
    return { events, endingBalance: runningBalance, lowestBalance, lowestBalanceDate };
  };
  const expectedDailyFlexible = flexibleDates.length ? flexibleExpenseForecast / flexibleDates.length : 0;
  const simulation = simulate(expectedDailyFlexible);
  let dailyFlexibleAllowance = 0;
  const zeroFlexibleSimulation = simulate(0);
  if (flexibleDates.length && zeroFlexibleSimulation.lowestBalance >= reserveFloor) {
    let lower = 0;
    let upper = expectedDailyFlexible;
    for (let iteration = 0; iteration < 32; iteration += 1) {
      const candidate = (lower + upper) / 2;
      if (simulate(candidate).lowestBalance >= reserveFloor) lower = candidate;
      else upper = candidate;
    }
    dailyFlexibleAllowance = Math.floor(lower);
  }
  const shortfall = Math.ceil(Math.max(0, reserveFloor - simulation.lowestBalance));
  return {
    endingBalance: simulation.endingBalance,
    lowestBalance: simulation.lowestBalance,
    lowestBalanceDate: simulation.lowestBalanceDate,
    lowestBalanceWithoutFlexible: zeroFlexibleSimulation.lowestBalance,
    shortfall,
    dailyFlexibleAllowance,
    flexibleExpenseForecast,
    events: simulation.events
  };
}

export function cashFlowScenarios(input: Omit<CashFlowForecastInput, "scenario">): CashFlowScenarios | null {
  const base = cashFlowForecast(input);
  if (!base) return null;
  const cautious = cashFlowForecast({ ...input, scenario: { flexibleExpenseMultiplier: 1.25, receivableMultiplier: 0.5 } });
  const rescue = cashFlowForecast({ ...input, scenario: { flexibleExpenseMultiplier: 0.55, receivableMultiplier: 0 } });
  if (!cautious || !rescue) return null;
  return { base, cautious, rescue };
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

function firstRecurringDueOnOrAfter(rule: RecurringRule, target: string) {
  if (rule.nextDueDate >= target) return rule.nextDueDate;
  const from = parseLocalDate(rule.nextDueDate);
  const targetDate = parseLocalDate(target);
  const differenceInDays = Math.floor((targetDate.getTime() - from.getTime()) / 86_400_000);
  if (rule.frequency === "daily" || rule.frequency === "weekly") {
    const stepDays = rule.frequency === "daily" ? rule.interval : rule.interval * 7;
    const steps = Math.ceil(differenceInDays / stepDays);
    from.setUTCDate(from.getUTCDate() + steps * stepDays);
    return formatLocalDate(from);
  }
  const differenceInMonths = (targetDate.getUTCFullYear() - from.getUTCFullYear()) * 12 + targetDate.getUTCMonth() - from.getUTCMonth();
  if (rule.frequency === "monthly") {
    const steps = Math.ceil(differenceInMonths / rule.interval);
    const targetMonthIndex = from.getUTCMonth() + steps * rule.interval;
    const targetYear = from.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
    const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
    from.setUTCFullYear(targetYear, targetMonth, Math.min(rule.dayOfMonth ?? from.getUTCDate(), daysInMonth(targetYear, targetMonth)));
    return formatLocalDate(from);
  }
  const differenceInYears = targetDate.getUTCFullYear() - from.getUTCFullYear();
  const steps = Math.ceil(differenceInYears / rule.interval);
  const targetYear = from.getUTCFullYear() + steps * rule.interval;
  from.setUTCFullYear(targetYear, from.getUTCMonth(), Math.min(rule.dayOfMonth ?? from.getUTCDate(), daysInMonth(targetYear, from.getUTCMonth())));
  return formatLocalDate(from);
}

export function recurringDatesInMonth(rule: RecurringRule, month: string) {
  const monthStart = `${month}-01`;
  const [year, monthNumber] = month.split("-").map(Number);
  const monthEnd = `${month}-${String(daysInMonth(year, monthNumber - 1)).padStart(2, "0")}`;
  const dueDates: string[] = [];
  let dueDate = firstRecurringDueOnOrAfter(rule, monthStart);
  for (let iteration = 0; iteration < 400 && dueDate <= monthEnd && (!rule.endDate || dueDate <= rule.endDate); iteration += 1) {
    dueDates.push(dueDate);
    dueDate = advanceDueDate(rule, dueDate);
  }
  return dueDates;
}

export function dueOccurrences(rule: RecurringRule, existing: RecurringOccurrence[], today: string) {
  const results: Array<Pick<RecurringOccurrence, "id" | "ruleId" | "dueDate" | "status">> = [];
  const seen = new Set(existing.map(item => `${item.ruleId}:${item.dueDate}`));
  let dueDate = rule.nextDueDate;
  for (let iteration = 0; iteration < 400 && dueDate <= today && (!rule.endDate || dueDate <= rule.endDate); iteration += 1) {
    const key = `${rule.id}:${dueDate}`;
    if (!seen.has(key)) results.push({ id: key, ruleId: rule.id, dueDate, status: "pending" });
    dueDate = advanceDueDate(rule, dueDate);
  }
  return { occurrences: results, nextDueDate: dueDate };
}
