export type TransactionKind = "income" | "expense" | "transfer";
export type DebtKind = "receivable" | "payable";
export type Frequency = "daily" | "weekly" | "monthly" | "yearly";

export interface AppSettings {
  id: "settings";
  onboardingComplete: boolean;
  openingBalance: number; // Deprecated, kept for v1 compatibility
  currency: "VND";
  pinHash?: string;
  pinSalt?: string;
  lockEnabled: boolean;
  reminderEnabled?: boolean;
  reminderTime?: string;
  lastBackupAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Wallet {
  id: string;
  name: string;
  icon: string;
  color: string;
  initialBalance: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  kind: TransactionKind;
  name: string;
  icon: string;
  color: string;
  archived: boolean;
  builtIn: boolean;
  createdAt: string;
}

export interface Transaction {
  id: string;
  kind: TransactionKind;
  amount: number;
  categoryId: string; // For transfer, this can be empty or a special "transfer" category
  walletId: string;
  toWalletId?: string; // Only used when kind === "transfer"
  date: string;
  note?: string;
  recurringRuleId?: string;
  debtPaymentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Budget {
  id: string;
  categoryId: string;
  month: string;
  limit: number;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringRule {
  id: string;
  kind: TransactionKind;
  amount: number;
  categoryId: string;
  walletId?: string;
  toWalletId?: string;
  note?: string;
  frequency: Frequency;
  interval: number;
  dayOfMonth?: number;
  weekday?: number;
  startDate: string;
  nextDueDate: string;
  endDate?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringOccurrence {
  id: string;
  ruleId: string;
  dueDate: string;
  status: "pending" | "confirmed" | "skipped";
  transactionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Debt {
  id: string;
  kind: DebtKind;
  person: string;
  principal: number;
  openedDate: string;
  dueDate?: string;
  note?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DebtPayment {
  id: string;
  debtId: string;
  amount: number;
  date: string;
  note?: string;
  transactionId: string;
  createdAt: string;
}

export interface SavingsGoal {
  id: string;
  name: string;
  target: number;
  targetDate?: string;
  color: string;
  icon: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GoalEntry {
  id: string;
  goalId: string;
  amount: number;
  direction: "contribution" | "withdrawal";
  date: string;
  note?: string;
  createdAt: string;
}

export interface Installment {
  id: string;
  name: string;
  totalAmount: number;
  monthlyAmount: number;
  totalMonths: number;
  startDate: string;
  dueDate: number; // Day of the month (1-31)
  closedAt?: string;
  categoryId: string; // To categorize the monthly payment
  walletId: string;   // Where to deduct from when paid automatically/manually
  createdAt: string;
  updatedAt: string;
}

export interface BackupPayloadV1 {
  schemaVersion: 1;
  exportedAt: string;
  settings: AppSettings;
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  recurringRules: RecurringRule[];
  recurringOccurrences: RecurringOccurrence[];
  debts: Debt[];
  debtPayments: DebtPayment[];
  goals: SavingsGoal[];
  goalEntries: GoalEntry[];
}

export interface BackupPayloadV2 extends Omit<BackupPayloadV1, "schemaVersion"> {
  schemaVersion: 2;
  wallets: Wallet[];
}

export interface BackupPayloadV3 extends Omit<BackupPayloadV2, "schemaVersion"> {
  schemaVersion: 3;
  installments: Installment[];
}

export const formatVnd = (amount: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(amount);

export const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
export const currentMonth = () => today().slice(0, 7);
export const newId = () => crypto.randomUUID();
