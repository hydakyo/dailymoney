import type { Category } from "./domain";
import { newId } from "./domain";

const now = () => new Date().toISOString();

const make = (kind: Category["kind"], name: string, icon: string, color: string): Category => ({
  id: newId(), kind, name, icon, color, archived: false, builtIn: true, createdAt: now()
});

export const defaultCategories = (): Category[] => [
  make("income", "Lương", "WalletCards", "#27ae60"),
  make("income", "Thưởng", "Sparkles", "#17a2b8"),
  make("income", "Bán hàng", "Store", "#7c5cff"),
  make("income", "Khác", "Plus", "#64748b"),
  make("expense", "Ăn uống", "Utensils", "#ef6b73"),
  make("expense", "Di chuyển", "Car", "#f59e0b"),
  make("expense", "Nhà ở", "House", "#8b5cf6"),
  make("expense", "Hóa đơn", "ReceiptText", "#2563eb"),
  make("expense", "Mua sắm", "ShoppingBag", "#ec4899"),
  make("expense", "Sức khỏe", "HeartPulse", "#10b981"),
  make("expense", "Giải trí", "Popcorn", "#f97316"),
  make("expense", "Giáo dục", "GraduationCap", "#0ea5e9"),
  make("expense", "Gia đình", "Users", "#d946ef"),
  make("expense", "Khác", "CircleEllipsis", "#64748b")
];
