import type { Category, FinancialClass } from "./domain";
import { newId } from "./domain";

const now = () => new Date().toISOString();

const make = (kind: Category["kind"], name: string, icon: string, color: string, financialClass?: FinancialClass): Category => ({
  id: newId(), kind, name, icon, color, archived: false, builtIn: true, financialClass, createdAt: now()
});

export const defaultCategories = (): Category[] => [
  make("income", "Lương", "WalletCards", "#27ae60"),
  make("income", "Thưởng", "Sparkles", "#17a2b8"),
  make("income", "Bán hàng", "Store", "#7c5cff"),
  make("income", "Khác", "Plus", "#64748b"),
  make("expense", "Ăn uống", "Utensils", "#ef6b73", "essential"),
  make("expense", "Di chuyển", "Car", "#f59e0b", "essential"),
  make("expense", "Nhà ở", "House", "#8b5cf6", "essential"),
  make("expense", "Hóa đơn", "ReceiptText", "#2563eb", "essential"),
  make("expense", "Mua sắm", "ShoppingBag", "#ec4899", "discretionary"),
  make("expense", "Sức khỏe", "HeartPulse", "#10b981", "essential"),
  make("expense", "Giải trí", "Popcorn", "#f97316", "discretionary"),
  make("expense", "Giáo dục", "GraduationCap", "#0ea5e9", "essential"),
  make("expense", "Gia đình", "Users", "#d946ef", "essential"),
  make("expense", "Khác", "CircleEllipsis", "#64748b", "discretionary")
];
