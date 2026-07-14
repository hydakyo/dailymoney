import { currentMonth as actualCurrentMonth } from "./domain";
import type { Category, ObligationPriority, Transaction } from "./domain";
import type { AppData } from "./store";
import { budgetProgress, cashFlowScenarios, monthForecast, totalBalance } from "./finance";
import { addMonths } from "./utils";

export type SmartPlanScenarioId = "base" | "cautious" | "rescue";

export interface SuggestedBudget {
  categoryId: string;
  categoryName: string;
  suggestedLimit: number;
  kind: "need" | "want";
}

export interface PlanScenario {
  id: SmartPlanScenarioId;
  label: string;
  description: string;
  endingBalance: number;
  lowestBalance: number;
  lowestBalanceDate: string | null;
  shortfall: number;
}

export interface SmartPlan {
  projectedBalance: number;
  forecastIncome: number;
  mandatoryExpenses: number;
  trendFlexibleExpense: number;
  flexibleAllowance: number;
  budgetReduction: number;
  reserveFloor: number;
  recommendedReserve: number;
  suggestedBudgets: SuggestedBudget[];
  needsTotal: number;
  wantsTotal: number;
  savesTotal: number;
  summary: string;
  isCurrentMonth: boolean;
  isBalanced: boolean;
  selectedScenario: SmartPlanScenarioId;
  defaultScenario: SmartPlanScenarioId;
  unresolvedShortfall: number;
  lowestBalance: number;
  lowestBalanceDate: string | null;
  shortfall: number;
  dailyFlexibleCap: number;
  behaviorConfidence: "low" | "medium" | "high";
  scenarios: PlanScenario[];
  priorityActions: Array<{ level: "danger" | "warning" | "info"; title: string; detail: string }>;
  upcomingObligations: Array<{ date: string; label: string; amount: number; priority: ObligationPriority; priorityLabel: string }>;
}

function isFlexibleExpense(transaction: Transaction) {
  return transaction.kind === "expense" && !transaction.recurringRuleId && !transaction.installmentId && !transaction.debtPaymentId;
}

function roundUpToThousand(amount: number) {
  return Math.ceil(Math.max(0, amount) / 1_000) * 1_000;
}

function categoryKind(category: Category): "need" | "want" {
  return category.financialClass === "essential" ? "need" : "want";
}

function moneyText(amount: number) {
  return Math.ceil(Math.max(0, amount)).toLocaleString("vi-VN");
}

function isMandatoryPriority(priority: ObligationPriority | undefined) {
  return priority === "essential" || priority === "high";
}

const PRIORITY_RANK: Record<ObligationPriority, number> = { essential: 0, high: 1, normal: 2, flexible: 3 };
const PRIORITY_LABEL: Record<ObligationPriority, string> = {
  essential: "Thiết yếu",
  high: "Cao",
  normal: "Có thể điều chỉnh",
  flexible: "Linh hoạt"
};

function daysUntil(date: string | null) {
  if (!date) return 0;
  const now = new Date();
  const start = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const [year, month, day] = date.split("-").map(Number);
  return Math.round((Date.UTC(year, month - 1, day) - start) / 86_400_000);
}

function unavailablePlan(balance: number): SmartPlan {
  return {
    projectedBalance: balance,
    forecastIncome: 0,
    mandatoryExpenses: 0,
    trendFlexibleExpense: 0,
    flexibleAllowance: 0,
    budgetReduction: 0,
    reserveFloor: 0,
    recommendedReserve: 0,
    suggestedBudgets: [],
    needsTotal: 0,
    wantsTotal: 0,
    savesTotal: 0,
    summary: "Kế hoạch thông minh chỉ hỗ trợ tháng đang diễn ra, vì cần số dư thực tế và các nghĩa vụ còn lại.",
    isCurrentMonth: false,
    isBalanced: false,
    selectedScenario: "cautious",
    defaultScenario: "cautious",
    unresolvedShortfall: 0,
    lowestBalance: balance,
    lowestBalanceDate: null,
    shortfall: 0,
    dailyFlexibleCap: 0,
    behaviorConfidence: "low",
    scenarios: [],
    priorityActions: [],
    upcomingObligations: []
  };
}

export function generateSmartPlan(data: AppData, currentMonth: string, selectedScenarioInput?: SmartPlanScenarioId): SmartPlan {
  const balance = totalBalance(data.wallets, data.transactions);
  if (currentMonth !== actualCurrentMonth()) return unavailablePlan(balance);

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
  const categoryById = new Map(expenseCategories.map(category => [category.id, category]));
  const historyMonths = [1, 2, 3].map(offset => addMonths(currentMonth, -offset));
  const historyTransactions = data.transactions.filter(transaction => isFlexibleExpense(transaction) && historyMonths.some(month => transaction.date.startsWith(month)));
  const currentFlexibleTransactions = data.transactions.filter(transaction => isFlexibleExpense(transaction) && transaction.date.startsWith(currentMonth));
  const essentialHistory = historyTransactions.filter(transaction => categoryById.get(transaction.categoryId)?.financialClass === "essential");
  const historicalEssentialDailySpend = essentialHistory.reduce((sum, transaction) => sum + transaction.amount, 0) / Math.max(1, historyMonths.length * 30);
  const expectedFixedExpenses = (forecast?.expectedRecurringExpense ?? 0) + (forecast?.expectedInstallments ?? 0) + (forecast?.expectedDebtRepayments ?? 0);
  const reserveFloor = roundUpToThousand(Math.max(historicalEssentialDailySpend * 7, expectedFixedExpenses * 0.05));
  const cashFlowInput = {
    balance,
    month: currentMonth,
    transactions: data.transactions,
    rules: data.rules,
    occurrences: data.occurrences,
    installments: data.installments,
    budgets: budgetItems,
    debts: data.debts,
    debtPayments: data.payments,
    reserveFloor
  };
  const flowScenarios = cashFlowScenarios(cashFlowInput);
  const defaultScenario: SmartPlanScenarioId = flowScenarios?.cautious.shortfall === 0 && flowScenarios.cautious.lowestBalanceWithoutFlexible >= reserveFloor
    ? "cautious"
    : "rescue";
  const selectedScenario = selectedScenarioInput ?? defaultScenario;
  const selectedFlow = flowScenarios?.[selectedScenario];
  const baseFlow = flowScenarios?.base;
  const structuralShortfall = selectedFlow ? Math.ceil(Math.max(0, reserveFloor - selectedFlow.lowestBalanceWithoutFlexible)) : 0;
  const isBalanced = Boolean(selectedFlow) && structuralShortfall === 0;
  const daysRemaining = Math.max(0, forecast?.daysRemaining ?? 0);
  const dailyFlexibleCap = selectedFlow?.dailyFlexibleAllowance ?? 0;
  const flexibleAllowance = isBalanced
    ? Math.min(selectedFlow?.flexibleExpenseForecast ?? 0, dailyFlexibleCap * daysRemaining)
    : 0;
  const trendFlexibleExpense = Math.ceil(baseFlow?.flexibleExpenseForecast ?? forecast?.projectedFlexibleExpense ?? 0);
  const budgetReduction = Math.ceil(Math.max(0, trendFlexibleExpense - flexibleAllowance));

  const flexibleCurrentByCategory = new Map<string, number>();
  for (const transaction of currentFlexibleTransactions) {
    flexibleCurrentByCategory.set(transaction.categoryId, (flexibleCurrentByCategory.get(transaction.categoryId) ?? 0) + transaction.amount);
  }
  const allCurrentExpenseByCategory = new Map<string, number>();
  for (const transaction of data.transactions) {
    if (transaction.kind === "expense" && transaction.date.startsWith(currentMonth)) {
      allCurrentExpenseByCategory.set(transaction.categoryId, (allCurrentExpenseByCategory.get(transaction.categoryId) ?? 0) + transaction.amount);
    }
  }
  const averageMonthlyByCategory = new Map<string, number>();
  for (const category of expenseCategories) {
    const total = historyTransactions.filter(transaction => transaction.categoryId === category.id).reduce((sum, transaction) => sum + transaction.amount, 0);
    if (total > 0) averageMonthlyByCategory.set(category.id, total / historyMonths.length);
  }
  const baselineRemainingByCategory = new Map<string, number>();
  for (const category of expenseCategories) {
    const average = averageMonthlyByCategory.get(category.id) ?? 0;
    const spent = flexibleCurrentByCategory.get(category.id) ?? 0;
    if (average > 0) baselineRemainingByCategory.set(category.id, Math.max(0, average - spent));
  }
  if (!baselineRemainingByCategory.size) {
    for (const budget of budgetItems) {
      if (budget.limit > budget.spent) baselineRemainingByCategory.set(budget.categoryId, budget.limit - budget.spent);
    }
  }
  const fixedRemainingByCategory = new Map<string, number>();
  for (const event of selectedFlow?.events ?? []) {
    if (event.amount >= 0 || !event.categoryId || event.kind === "flexible") continue;
    fixedRemainingByCategory.set(event.categoryId, (fixedRemainingByCategory.get(event.categoryId) ?? 0) + Math.abs(event.amount));
  }
  const baselineRemaining = [...baselineRemainingByCategory.values()].reduce((sum, amount) => sum + amount, 0);
  const suggestedBudgets: SuggestedBudget[] = [];
  const plannedCategoryIds = new Set([...baselineRemainingByCategory.keys(), ...fixedRemainingByCategory.keys()]);
  for (const categoryId of plannedCategoryIds) {
    const category = categoryById.get(categoryId);
    if (!category) continue;
    const baseline = baselineRemainingByCategory.get(categoryId) ?? 0;
    const fixedRemaining = fixedRemainingByCategory.get(categoryId) ?? 0;
    const flexibleAllocation = baselineRemaining > 0 ? flexibleAllowance * (baseline / baselineRemaining) : 0;
    const suggestedLimit = roundUpToThousand((allCurrentExpenseByCategory.get(categoryId) ?? 0) + fixedRemaining + flexibleAllocation);
    if (suggestedLimit <= 0) continue;
    suggestedBudgets.push({ categoryId, categoryName: category.name, suggestedLimit, kind: categoryKind(category) });
  }
  suggestedBudgets.sort((left, right) => right.suggestedLimit - left.suggestedLimit);
  const needsTotal = suggestedBudgets.filter(item => item.kind === "need").reduce((sum, item) => sum + item.suggestedLimit, 0);
  const wantsTotal = suggestedBudgets.filter(item => item.kind === "want").reduce((sum, item) => sum + item.suggestedLimit, 0);
  const mandatoryExpenses = (selectedFlow?.events ?? [])
    .filter(event => event.amount < 0 && (event.kind === "installment" || event.kind === "debt" || (event.kind === "recurring" && isMandatoryPriority(event.priority))))
    .reduce((sum, event) => sum + Math.abs(event.amount), 0);
  const riskDate = selectedFlow?.lowestBalanceDate ?? null;
  const daysToRisk = daysUntil(riskDate);
  const priorityActions: SmartPlan["priorityActions"] = [];
  if (!isBalanced) {
    priorityActions.push({
      level: "danger",
      title: `Kế hoạch khẩn cấp: vẫn thiếu ${moneyText(structuralShortfall)}đ`,
      detail: `Dù dừng toàn bộ chi linh hoạt, dòng tiền vẫn không giữ được quỹ tối thiểu ${moneyText(reserveFloor)}đ. Cần bổ sung tiền, dời hoặc thương lượng nghĩa vụ đến hạn.`
    });
  } else if ((selectedFlow?.shortfall ?? 0) > 0) {
    priorityActions.push({
      level: "warning",
      title: `Cần giảm ${moneyText(budgetReduction)}đ chi linh hoạt theo kế hoạch`,
      detail: `Nếu giữ thói quen hiện tại, dòng tiền có thể thiếu ${moneyText(selectedFlow?.shortfall ?? 0)}đ. Hạn mức đề xuất giữ lại quỹ tối thiểu ${moneyText(reserveFloor)}đ.`
    });
  } else {
    priorityActions.push({
      level: "info",
      title: "Dòng tiền đủ an toàn theo kịch bản đã chọn",
      detail: `Hạn mức đề xuất vẫn giữ quỹ tối thiểu ${moneyText(reserveFloor)}đ trước các nghĩa vụ còn lại.`
    });
  }
  if (structuralShortfall > 0) {
    priorityActions.push({
      level: "warning",
      title: "Không thể cân bằng chỉ bằng ngân sách",
      detail: "Ưu tiên dời khoản có thể thương lượng, bổ sung tiền hoặc xác nhận lại ngày nhận khoản phải thu; không xem đây là kế hoạch chi tiêu hoàn chỉnh."
    });
  }
  const upcomingObligations = (selectedFlow?.events ?? [])
    .filter(event => event.amount < 0 && (event.kind === "installment" || event.kind === "debt" || (event.kind === "recurring" && isMandatoryPriority(event.priority))))
    .map(event => {
      const priority = event.priority ?? "high";
      return { date: event.date, label: event.label, amount: Math.ceil(Math.abs(event.amount)), priority, priorityLabel: PRIORITY_LABEL[priority] };
    })
    .sort((left, right) => PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority] || left.date.localeCompare(right.date))
    .slice(0, 4);
  const fallbackScenario = { endingBalance: balance, lowestBalance: balance, lowestBalanceDate: null, shortfall: 0 };
  const scenarios: PlanScenario[] = [
    { id: "base", label: "Cơ sở", description: "Theo nhịp chi hiện tại và khoản phải thu sau khi xét mức chắc chắn.", ...(flowScenarios?.base ?? fallbackScenario) },
    { id: "cautious", label: "Thận trọng", description: "Chi linh hoạt cao hơn 25%; giảm thêm 50% khoản phải thu sau khi xét độ chắc chắn.", ...(flowScenarios?.cautious ?? fallbackScenario) },
    { id: "rescue", label: "Cứu hộ", description: "Giảm 45% chi linh hoạt và không dựa vào khoản phải thu. Các khoản lặp vẫn được tính cho đến khi bạn chủ động bỏ qua.", ...(flowScenarios?.rescue ?? fallbackScenario) }
  ];
  const summary = !isBalanced
    ? `Kế hoạch chưa cân bằng: còn thiếu ${moneyText(structuralShortfall)}đ ngoài khả năng điều chỉnh ngân sách.`
    : (selectedFlow?.shortfall ?? 0) > 0
    ? `Giảm ${moneyText(budgetReduction)}đ so với xu hướng chi để giữ quỹ tối thiểu ${moneyText(reserveFloor)}đ.`
    : "Hạn mức danh mục phù hợp với kịch bản đã chọn và vẫn giữ quỹ dự phòng tối thiểu.";

  return {
    projectedBalance: forecast?.projectedBalance ?? balance,
    forecastIncome: forecast ? Math.ceil(forecast.expectedIncome + forecast.expectedDebtReceivables) : 0,
    mandatoryExpenses: Math.ceil(mandatoryExpenses),
    trendFlexibleExpense,
    flexibleAllowance: Math.floor(flexibleAllowance),
    budgetReduction,
    reserveFloor,
    recommendedReserve: reserveFloor,
    suggestedBudgets,
    needsTotal,
    wantsTotal,
    savesTotal: isBalanced ? Math.max(0, Math.floor((selectedFlow?.endingBalance ?? 0) - reserveFloor)) : 0,
    summary,
    isCurrentMonth: Boolean(forecast),
    isBalanced,
    selectedScenario,
    defaultScenario,
    unresolvedShortfall: structuralShortfall,
    lowestBalance: selectedFlow?.lowestBalance ?? balance,
    lowestBalanceDate: selectedFlow?.lowestBalanceDate ?? null,
    shortfall: selectedFlow?.shortfall ?? 0,
    dailyFlexibleCap,
    behaviorConfidence: forecast?.behaviorConfidence ?? "low",
    scenarios,
    priorityActions,
    upcomingObligations
  };
}
