import type { AppData } from "./store";
import type { Category } from "./domain";
import { debtOutstanding } from "./finance";

export interface SuggestedBudget {
  categoryId: string;
  categoryName: string;
  suggestedLimit: number;
  kind: "need" | "want" | "save";
}

export interface SmartPlan {
  averageIncome: number;
  mandatoryExpenses: number;
  disposableIncome: number;
  suggestedBudgets: SuggestedBudget[];
  needsTotal: number;
  wantsTotal: number;
  savesTotal: number;
}

export function generateSmartPlan(data: AppData, currentMonth: string): SmartPlan {
  let totalIncome = 0;
  const incomeMonths = new Set<string>();
  
  // Tính tổng thu nhập lịch sử để lấy số trung bình (Dự báo thu nhập)
  for (const t of data.transactions) {
    if (t.kind === "income") {
      incomeMonths.add(t.date.substring(0, 7));
      totalIncome += t.amount;
    }
  }
  let averageIncome = incomeMonths.size > 0 ? totalIncome / incomeMonths.size : 0;
  
  // Nếu người dùng chưa có dữ liệu thu nhập, lấy mặc định 10M để demo thuật toán
  if (averageIncome === 0) {
    averageIncome = 10000000;
  }

  // Các khoản chi bắt buộc (Trả góp, Nợ đến hạn)
  let mandatoryExpenses = 0;
  
  const [currentY, currentM] = currentMonth.split("-").map(Number);
  
  for (const inst of data.installments) {
    if (inst.closedAt) continue;
    const [startY, startM] = inst.startDate.split("-").map(Number);
    const diffMonths = (currentY - startY) * 12 + (currentM - startM);
    if (diffMonths >= 0 && diffMonths < inst.totalMonths) {
      mandatoryExpenses += inst.monthlyAmount;
    }
  }
  
  for (const debt of data.debts) {
    if (debt.kind === "payable" && !debt.closedAt && debt.dueDate && debt.dueDate.startsWith(currentMonth)) {
      mandatoryExpenses += debtOutstanding(debt, data.payments);
    }
  }

  // Thu nhập khả dụng sau khi trừ nợ
  let disposableIncome = averageIncome - mandatoryExpenses;
  if (disposableIncome < 0) disposableIncome = 0;

  // Áp dụng Quy tắc 50/30/20
  const needsTotal = disposableIncome * 0.5;
  const wantsTotal = disposableIncome * 0.3;
  const savesTotal = disposableIncome * 0.2;

  const needsCategories = ["Ăn uống", "Di chuyển", "Nhà ở", "Hóa đơn", "Sức khỏe", "Giáo dục", "Gia đình"];
  const wantsCategories = ["Mua sắm", "Giải trí", "Khác"];
  
  const suggestedBudgets: SuggestedBudget[] = [];
  
  const cNeeds = data.categories.filter(c => needsCategories.includes(c.name) && !c.archived && c.kind === "expense");
  const cWants = data.categories.filter(c => wantsCategories.includes(c.name) && !c.archived && c.kind === "expense");

  // Chia đều ngân sách thiết yếu cho các hạng mục thiết yếu
  if (cNeeds.length > 0) {
    // Làm tròn đến hàng nghìn (1000)
    const split = Math.round((needsTotal / cNeeds.length) / 1000) * 1000;
    for (const c of cNeeds) {
      suggestedBudgets.push({ categoryId: c.id, categoryName: c.name, suggestedLimit: split, kind: "need" });
    }
  }
  
  // Chia đều ngân sách cá nhân cho các hạng mục tiêu dùng
  if (cWants.length > 0) {
    const split = Math.round((wantsTotal / cWants.length) / 1000) * 1000;
    for (const c of cWants) {
      suggestedBudgets.push({ categoryId: c.id, categoryName: c.name, suggestedLimit: split, kind: "want" });
    }
  }

  return { 
    averageIncome, 
    mandatoryExpenses, 
    disposableIncome, 
    suggestedBudgets,
    needsTotal,
    wantsTotal,
    savesTotal
  };
}
