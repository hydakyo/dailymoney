import type { Category, Transaction } from "./domain";
import type { AppData } from "./store";
import { budgetProgress, monthForecast, totalBalance } from "./finance";
import { addMonths } from "./utils";

export interface SuggestedBudget {
  categoryId: string;
  categoryName: string;
  suggestedLimit: number;
  kind: "need" | "want";
}

export interface SmartPlan {
  projectedBalance: number;
  forecastIncome: number;
  mandatoryExpenses: number;
  flexibleAllowance: number;
  recommendedReserve: number;
  suggestedBudgets: SuggestedBudget[];
  needsTotal: number;
  wantsTotal: number;
  savesTotal: number;
  summary: string;
  isCurrentMonth: boolean;
}

const NEED_CATEGORY_NAMES = new Set(["Ăn uống", "Di chuyển", "Nhà ở", "Hóa đơn", "Sức khỏe", "Giáo dục", "Gia đình"]);

function isFlexibleExpense(transaction: Transaction) {
  return transaction.kind === "expense" && !transaction.recurringRuleId && !transaction.installmentId && !transaction.debtPaymentId;
}

function roundUpToThousand(amount: number) {
  return Math.ceil(Math.max(0, amount) / 1_000) * 1_000;
}

function categoryKind(category: Category): "need" | "want" {
  return NEED_CATEGORY_NAMES.has(category.name) ? "need" : "want";
}

export function generateSmartPlan(data: AppData, currentMonth: string): SmartPlan {
  const balance = totalBalance(data.wallets, data.transactions);
  const budgetItems = budgetProgress(data.budgets, data.transactions, data.categories, currentMonth);
  const forecast = monthForecast({
    balance,
    month: currentMonth,
    transactions: data.transactions,
    rules: data.rules,
    occurrences: data.occurrences,
    installments: data.installments,
    budgets: budgetItems,
    debts: data.debts,
    debtPayments: data.payments
  });
  const expenseCategories = data.categories.filter(category => category.kind === "expense" && !category.archived);
  const historyMonths = [1, 2, 3].map(offset => addMonths(currentMonth, -offset));
  const historyTransactions = data.transactions.filter(transaction => isFlexibleExpense(transaction) && historyMonths.some(month => transaction.date.startsWith(month)));
  const currentTransactions = data.transactions.filter(transaction => isFlexibleExpense(transaction) && transaction.date.startsWith(currentMonth));
  const currentSpentByCategory = new Map<string, number>();
  for (const transaction of currentTransactions) {
    currentSpentByCategory.set(transaction.categoryId, (currentSpentByCategory.get(transaction.categoryId) ?? 0) + transaction.amount);
  }

  const averageMonthlyByCategory = new Map<string, number>();
  for (const category of expenseCategories) {
    const monthsWithData = new Set(historyTransactions.filter(transaction => transaction.categoryId === category.id).map(transaction => transaction.date.slice(0, 7)));
    const total = historyTransactions.filter(transaction => transaction.categoryId === category.id).reduce((sum, transaction) => sum + transaction.amount, 0);
    if (total > 0) averageMonthlyByCategory.set(category.id, total / Math.max(1, monthsWithData.size));
  }

  const baselineRemainingByCategory = new Map<string, number>();
  for (const category of expenseCategories) {
    const average = averageMonthlyByCategory.get(category.id) ?? 0;
    const spent = currentSpentByCategory.get(category.id) ?? 0;
    if (average > 0) baselineRemainingByCategory.set(category.id, Math.max(0, average - spent));
  }
  if (!baselineRemainingByCategory.size) {
    for (const budget of budgetItems) {
      if (budget.limit > budget.spent) baselineRemainingByCategory.set(budget.categoryId, budget.limit - budget.spent);
    }
  }

  const baselineRemaining = [...baselineRemainingByCategory.values()].reduce((sum, amount) => sum + amount, 0);
  const projectedBalance = forecast?.projectedBalance ?? balance;
  const forecastIncome = forecast ? forecast.expectedIncome + forecast.expectedDebtReceivables : 0;
  const mandatoryExpenses = forecast ? forecast.expectedRecurringExpense + forecast.expectedInstallments + forecast.expectedDebtRepayments : 0;
  const forecastFlexible = forecast?.projectedFlexibleExpense ?? baselineRemaining;
  const flexibleAllowance = Math.max(0, forecastFlexible + Math.min(0, projectedBalance));
  const historicalDailySpend = historyTransactions.reduce((sum, transaction) => sum + transaction.amount, 0) / Math.max(1, historyMonths.length * 30);
  const recommendedReserve = Math.min(Math.max(0, projectedBalance), historicalDailySpend * 7);
  const savesTotal = Math.max(0, projectedBalance - recommendedReserve);
  const suggestedBudgets: SuggestedBudget[] = [];
  const weightTotal = baselineRemaining || 1;

  for (const category of expenseCategories) {
    const baseline = baselineRemainingByCategory.get(category.id) ?? 0;
    if (baseline <= 0) continue;
    const spent = currentSpentByCategory.get(category.id) ?? 0;
    suggestedBudgets.push({
      categoryId: category.id,
      categoryName: category.name,
      suggestedLimit: roundUpToThousand(spent + flexibleAllowance * (baseline / weightTotal)),
      kind: categoryKind(category)
    });
  }

  const needsTotal = suggestedBudgets.filter(item => item.kind === "need").reduce((sum, item) => sum + item.suggestedLimit, 0);
  const wantsTotal = suggestedBudgets.filter(item => item.kind === "want").reduce((sum, item) => sum + item.suggestedLimit, 0);
  const summary = projectedBalance < 0
    ? `Dự báo thiếu ${Math.abs(projectedBalance).toLocaleString("vi-VN")}đ. Kế hoạch đã giảm phần chi linh hoạt về mức có thể chi.`
    : flexibleAllowance === 0
    ? "Không còn dư địa chi linh hoạt sau các nghĩa vụ và dự báo hiện tại."
    : "Hạn mức danh mục dựa trên mức chi thực tế, sau khi ưu tiên các nghĩa vụ đã dự báo.";

  return {
    projectedBalance,
    forecastIncome,
    mandatoryExpenses,
    flexibleAllowance,
    recommendedReserve,
    suggestedBudgets,
    needsTotal,
    wantsTotal,
    savesTotal,
    summary,
    isCurrentMonth: Boolean(forecast)
  };
}
