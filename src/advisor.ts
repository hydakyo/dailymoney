import type { AppData } from "./store";
import { currentMonth as actualCurrentMonth } from "./domain";
import { budgetProgress, cashFlowScenarios, monthTotals, totalBalance, debtOutstanding } from "./finance";

export type AdviceLevel = "danger" | "warning" | "success" | "info";

export interface Advice {
  id: string;
  level: AdviceLevel;
  title: string;
  description: string;
  action?: string;
}

function getDaysInMonth(yearMonth: string) {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function generateAdvice(data: AppData, currentMonth: string): Advice[] {
  const advices: Advice[] = [];
  const balance = totalBalance(data.wallets, data.transactions);
  const budgets = budgetProgress(data.budgets, data.transactions, data.categories, currentMonth);
  const flowScenarios = currentMonth === actualCurrentMonth()
    ? cashFlowScenarios({
      balance,
      month: currentMonth,
      transactions: data.transactions,
      rules: data.rules,
      occurrences: data.occurrences,
      installments: data.installments,
      budgets,
      debts: data.debts,
      debtPayments: data.payments
    })
    : null;
  if (flowScenarios?.base.shortfall) {
    advices.push({
      id: "cash_flow_shortfall",
      level: "danger",
      title: "Thiếu tiền trước khi có dòng tiền vào",
      description: `Dòng tiền có thể âm ${flowScenarios.base.shortfall.toLocaleString("vi-VN")}đ vào ${flowScenarios.base.lowestBalanceDate ?? "cuối tháng"}, dù số dư cuối tháng có thể hồi phục.`,
      action: "Tạm dừng chi linh hoạt và chuẩn bị tiền cho các nghĩa vụ đến hạn trước ngày này."
    });
  } else if (flowScenarios?.cautious.shortfall) {
    advices.push({
      id: "cash_flow_cautious_shortfall",
      level: "warning",
      title: "Không nên chi dựa vào khoản phải thu",
      description: `Kịch bản thận trọng thiếu ${flowScenarios.cautious.shortfall.toLocaleString("vi-VN")}đ vào ${flowScenarios.cautious.lowestBalanceDate ?? "cuối tháng"}.`,
      action: "Chỉ dùng khoản phải thu sau khi tiền thực sự về tài khoản."
    });
  } else if (flowScenarios) {
    const historyStart = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
    const averageDailyFlexible = data.transactions
      .filter(transaction => transaction.kind === "expense" && !transaction.recurringRuleId && !transaction.installmentId && !transaction.debtPaymentId && transaction.date >= historyStart)
      .reduce((sum, transaction) => sum + transaction.amount, 0) / 90;
    const reserve = averageDailyFlexible * 7;
    if (reserve > 0 && flowScenarios.cautious.lowestBalance < reserve) {
      advices.push({
        id: "cash_flow_thin_buffer",
        level: "warning",
        title: "Quỹ đệm dòng tiền mỏng",
        description: `Dòng tiền thận trọng có thể chạm ${Math.round(flowScenarios.cautious.lowestBalance).toLocaleString("vi-VN")}đ, thấp hơn mức đệm 7 ngày chi linh hoạt.`,
        action: "Hoãn tăng ngân sách hoặc chuyển tiền vào mục tiêu cho đến sau các ngày nghĩa vụ lớn."
      });
    }
  }
  
  // 1. Tình trạng tiền mặt tổng thể
  if (balance < 0) {
    advices.push({
      id: "negative_balance",
      level: "danger",
      title: "Cảnh báo Âm Vốn",
      description: "Tổng tài sản hiện tại của bạn đang bị âm. Bạn đang nợ nhiều hơn số tiền đang có.",
      action: "Hãy rà soát lại các ví và khoản nợ."
    });
  } else if (balance > 0 && balance < 1000000) {
    advices.push({
      id: "low_balance",
      level: "warning",
      title: "Sắp cạn tiền mặt",
      description: `Tổng số dư của bạn chỉ còn khoảng ${Math.round(balance / 1000)}k. Bạn nên hạn chế mua sắm lúc này.`,
    });
  }

  // 2. Dòng tiền tháng này
  const totals = monthTotals(data.transactions, currentMonth);
  const income = totals.income;
  const expense = totals.expense;
  
  if (income > 0) {
    const savingsRate = (income - expense) / income;
    if (savingsRate >= 0.2) {
      advices.push({
        id: "high_savings",
        level: "success",
        title: "Tỷ lệ Tiết kiệm Tốt",
        description: `Tháng này bạn đã giữ lại được ${(savingsRate * 100).toFixed(0)}% thu nhập. Xin chúc mừng, bạn đang đi đúng hướng!`,
      });
    } else if (savingsRate < 0 && savingsRate > -1) {
      advices.push({
        id: "overspent",
        level: "danger",
        title: "Chi Vượt Thu",
        description: `Tháng này bạn đã tiêu lẹm vào tiền cũ (âm ${(Math.abs(savingsRate) * 100).toFixed(0)}% so với thu nhập).`,
        action: "Hạn chế tiêu pha trong phần còn lại của tháng."
      });
    } else if (savingsRate >= 0 && savingsRate < 0.1) {
      advices.push({
        id: "low_savings",
        level: "warning",
        title: "Tiết kiệm Dưới chuẩn",
        description: `Bạn chỉ đang tiết kiệm được ${(savingsRate * 100).toFixed(0)}% thu nhập. Mức lý tưởng nên là ít nhất 20%.`,
      });
    }

    // Tốc độ tiêu tiền (Burn rate)
    const today = new Date();
    const currentYm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    if (currentMonth === currentYm) {
      const currentDay = today.getDate();
      const daysInMonth = getDaysInMonth(currentYm);
      const monthProgress = currentDay / daysInMonth;
      const spendingRate = expense / income;
      
      if (monthProgress <= 0.5 && spendingRate > 0.7) {
        advices.push({
          id: "fast_burn_rate",
          level: "danger",
          title: "Tốc độ Chi tiêu Quá nhanh",
          description: `Mới trôi qua ${(monthProgress * 100).toFixed(0)}% thời gian của tháng nhưng bạn đã tiêu hết ${(spendingRate * 100).toFixed(0)}% thu nhập.`,
          action: "Bạn cần phanh gấp lại ngay nếu không muốn mượn nợ cuối tháng!"
        });
      }
    }
  } else if (expense > 0) {
    advices.push({
      id: "no_income",
      level: "warning",
      title: "Chưa có Thu nhập",
      description: "Tháng này bạn đã tiêu tiền nhưng chưa ghi nhận khoản thu nhập nào. Hãy theo dõi dòng tiền cẩn thận.",
    });
  }

  // 3. Phân tích Ngân sách
  let overBudgetCount = 0;
  let nearBudgetCount = 0;
  
  for (const b of budgets) {
    const ratio = b.spent / b.limit;
    if (ratio > 1) {
      overBudgetCount++;
    } else if (ratio >= 0.8) {
      nearBudgetCount++;
    }
  }
  
  if (overBudgetCount > 0) {
    advices.push({
      id: "budget_exceeded",
      level: "danger",
      title: `Vỡ ngân sách (${overBudgetCount} hạng mục)`,
      description: "Bạn đã chi tiêu vượt quá giới hạn ngân sách tự đặt ra. Hãy vào tab Kế hoạch để xem chi tiết.",
    });
  } else if (nearBudgetCount > 0) {
    advices.push({
      id: "budget_warning",
      level: "warning",
      title: `Sắp chạm trần ngân sách (${nearBudgetCount} hạng mục)`,
      description: "Một số hạng mục đã chạm mốc 80% ngân sách. Hãy chú ý hơn khi chi tiêu.",
    });
  }

  // 4. Phân tích Nợ & Trả góp
  let totalOutstanding = 0;
  for (const debt of data.debts) {
    if (debt.kind === "payable" && !debt.closedAt) {
      totalOutstanding += debtOutstanding(debt, data.payments);
    }
  }
  
  let monthlyInstallmentBurden = 0;
  const [currentY, currentM] = currentMonth.split("-").map(Number);
  
  for (const inst of data.installments) {
    if (inst.closedAt) continue;
    const [startY, startM] = inst.startDate.split("-").map(Number);
    // Số tháng đã trôi qua kể từ startDate
    const diffMonths = (currentY - startY) * 12 + (currentM - startM);
    if (diffMonths >= 0 && diffMonths < inst.totalMonths) {
      monthlyInstallmentBurden += inst.monthlyAmount;
    }
  }

  if (totalOutstanding > balance && balance > 0) {
    advices.push({
      id: "high_debt",
      level: "danger",
      title: "Nợ Cao Hơn Tài Sản",
      description: "Tổng số nợ của bạn đang lớn hơn số tiền bạn có. Khả năng thanh khoản đang ở mức báo động.",
    });
  }

  if (income > 0) {
    const dti = monthlyInstallmentBurden / income;
    if (dti > 0.3) {
      advices.push({
        id: "high_dti",
        level: "danger",
        title: "Gánh nặng Trả góp Cao",
        description: `Mỗi tháng bạn phải dành tới ${(dti * 100).toFixed(0)}% thu nhập để trả góp. Không nên mua thêm bất cứ khoản trả góp nào nữa!`,
      });
    }
  } else if (monthlyInstallmentBurden > 0) {
     advices.push({
        id: "installment_no_income",
        level: "warning",
        title: "Áp lực Trả góp",
        description: "Bạn có khoản trả góp tháng này nhưng chưa có thu nhập. Hãy chuẩn bị tiền để thanh toán đúng hạn.",
      });
  }

  // 5. Quỹ khẩn cấp
  if (data.goals.length === 0) {
    advices.push({
      id: "no_goals",
      level: "info",
      title: "Chưa có Quỹ Khẩn Cấp",
      description: "Quy tắc tài chính cơ bản là luôn có một Quỹ Dự Phòng bằng 3-6 tháng sinh hoạt phí.",
      action: "Hãy qua tab Kế hoạch tạo ngay một Mục tiêu Tiết kiệm nhé."
    });
  }

  if (advices.length === 0) {
    advices.push({
      id: "all_good",
      level: "success",
      title: "Tình hình Ổn định",
      description: "Tình hình tài chính của bạn đang rất tốt, không có vấn đề gì đáng lo ngại. Tiếp tục duy trì nhé!",
    });
  }

  const visibleAdvices = flowScenarios?.base.shortfall
    ? advices.filter(advice => advice.level !== "success")
    : advices;

  // Ưu tiên hiển thị: danger -> warning -> success -> info
  const weight = { danger: 4, warning: 3, success: 2, info: 1 };
  visibleAdvices.sort((a, b) => weight[b.level] - weight[a.level]);

  return visibleAdvices;
}
