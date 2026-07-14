import type { Category, Transaction } from "./domain";
import type { AppData } from "./store";
import { budgetProgress, cashFlowForecast, monthForecast, totalBalance } from "./finance";
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
  lowestBalance: number;
  lowestBalanceDate: string | null;
  shortfall: number;
  dailyFlexibleCap: number;
  priorityActions: Array<{ level: "danger" | "warning" | "info"; title: string; detail: string }>;
  upcomingObligations: Array<{ date: string; label: string; amount: number }>;
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
  const cashFlow = cashFlowForecast({
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
  const shortfall = cashFlow?.shortfall ?? Math.max(0, -projectedBalance);
  const flexibleAllowance = Math.max(0, forecastFlexible - Math.max(0, -projectedBalance, shortfall));
  const historicalDailySpend = historyTransactions.reduce((sum, transaction) => sum + transaction.amount, 0) / Math.max(1, historyMonths.length * 30);
  const recommendedReserve = Math.min(Math.max(0, projectedBalance), historicalDailySpend * 7);
  const savesTotal = Math.max(0, projectedBalance - recommendedReserve);
  const suggestedBudgets: SuggestedBudget[] = [];
  const weightTotal = baselineRemaining || 1;

  for (const category of expenseCategories) {
    const baseline = baselineRemainingByCategory.get(category.id) ?? 0;
    if (baseline <= 0) continue;
    const spent = currentSpentByCategory.get(category.id) ?? 0;
    const suggestedLimit = roundUpToThousand(spent + flexibleAllowance * (baseline / weightTotal));
    if (suggestedLimit <= spent) continue;
    suggestedBudgets.push({
      categoryId: category.id,
      categoryName: category.name,
      suggestedLimit,
      kind: categoryKind(category)
    });
  }

  const needsTotal = suggestedBudgets.filter(item => item.kind === "need").reduce((sum, item) => sum + item.suggestedLimit, 0);
  const wantsTotal = suggestedBudgets.filter(item => item.kind === "want").reduce((sum, item) => sum + item.suggestedLimit, 0);
  const dailyFlexibleCap = cashFlow?.dailyFlexibleAllowance ?? 0;
  const priorityActions: SmartPlan["priorityActions"] = [];
  if (shortfall > 0) {
    priorityActions.push({
      level: "danger",
      title: `Thiếu ${shortfall.toLocaleString("vi-VN")}đ trước ${cashFlow?.lowestBalanceDate ?? "cuối tháng"}`,
      detail: `Giảm hoặc dời ít nhất ${Math.ceil(shortfall / Math.max(1, forecast?.daysRemaining ?? 1)).toLocaleString("vi-VN")}đ mỗi ngày cho đến khi có dòng tiền vào.`
    });
    priorityActions.push({
      level: "warning",
      title: "Bảo vệ các khoản thiết yếu và đến hạn",
      detail: "Tạm dừng chi tùy chọn trước. Nếu vẫn không đủ, hãy chủ động liên hệ bên nhận thanh toán để trao đổi phương án phù hợp trước hạn."
    });
  } else if (cashFlow && cashFlow.lowestBalance < recommendedReserve) {
    priorityActions.push({
      level: "warning",
      title: "Dòng tiền an toàn nhưng quỹ đệm mỏng",
      detail: "Giữ lại khoản dự phòng và hạn chế tăng ngân sách cho đến sau các ngày nghĩa vụ lớn."
    });
  } else {
    priorityActions.push({
      level: "info",
      title: "Dòng tiền đủ an toàn theo dự báo",
      detail: "Giữ hạn mức đề xuất, sau đó mới chuyển phần tiền dư vào mục tiêu tiết kiệm."
    });
  }
  const upcomingObligations = (cashFlow?.events ?? [])
    .filter(event => event.amount < 0 && event.kind !== "flexible")
    .slice(0, 3)
    .map(event => ({ date: event.date, label: event.label, amount: Math.abs(event.amount) }));
  const summary = shortfall > 0
    ? `Dòng tiền có thể âm vào ${cashFlow?.lowestBalanceDate ?? "cuối tháng"}; kế hoạch đã hạ hạn mức chi linh hoạt để bù thiếu.`
    : projectedBalance < 0
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
    isCurrentMonth: Boolean(forecast),
    lowestBalance: cashFlow?.lowestBalance ?? projectedBalance,
    lowestBalanceDate: cashFlow?.lowestBalanceDate ?? null,
    shortfall,
    dailyFlexibleCap,
    priorityActions,
    upcomingObligations
  };
}
