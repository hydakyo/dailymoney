import { z } from "zod";

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
  exportedAt?: string;
  transactions: Transaction[];
  settings: AppSettings;
  categories: Category[];
  budgets?: Budget[];
  recurringRules?: RecurringRule[];
  recurringOccurrences?: RecurringOccurrence[];
  debts?: Debt[];
  debtPayments?: DebtPayment[];
  goals?: SavingsGoal[];
  goalEntries?: GoalEntry[];
  wallets?: Wallet[];
  installments?: Installment[];
}

export interface BackupPayloadV2 {
  schemaVersion: 2;
  exportedAt?: string;
  transactions: Transaction[];
  settings: AppSettings;
  categories: Category[];
  budgets: Budget[];
  recurringRules: RecurringRule[];
  recurringOccurrences: RecurringOccurrence[];
  debts: Debt[];
  debtPayments: DebtPayment[];
  goals: SavingsGoal[];
  goalEntries: GoalEntry[];
  wallets: Wallet[];
  installments?: Installment[];
}

export interface BackupPayloadV3 {
  schemaVersion: 3;
  exportedAt?: string;
  transactions: Transaction[];
  settings: AppSettings;
  categories: Category[];
  budgets: Budget[];
  recurringRules: RecurringRule[];
  recurringOccurrences: RecurringOccurrence[];
  debts: Debt[];
  debtPayments: DebtPayment[];
  goals: SavingsGoal[];
  goalEntries: GoalEntry[];
  wallets: Wallet[];
  installments: Installment[];
}

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const MonthSchema = z.string().regex(/^\d{4}-\d{2}$/);
const MoneySchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const SignedMoneySchema = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);

export const TransactionKindSchema = z.enum(["income", "expense", "transfer"]);
export const DebtKindSchema = z.enum(["receivable", "payable"]);
export const FrequencySchema = z.enum(["daily", "weekly", "monthly", "yearly"]);

export const AppSettingsSchema = z.object({
  id: z.literal("settings"),
  onboardingComplete: z.boolean(),
  openingBalance: SignedMoneySchema.catch(0),
  currency: z.literal("VND"),
  pinHash: z.string().max(256).optional(),
  pinSalt: z.string().max(256).optional(),
  lockEnabled: z.boolean().catch(false),
  reminderEnabled: z.boolean().optional(),
  reminderTime: z.string().max(10).optional(),
  lastBackupAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const WalletSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  icon: z.string().max(50),
  color: z.string().max(20),
  initialBalance: SignedMoneySchema,
  archived: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CategorySchema = z.object({
  id: z.string().min(1).max(100),
  kind: TransactionKindSchema,
  name: z.string().trim().min(1).max(100),
  icon: z.string().max(50),
  color: z.string().max(20),
  archived: z.boolean(),
  builtIn: z.boolean(),
  createdAt: z.string(),
});

export const TransactionSchema = z.object({
  id: z.string().min(1).max(100),
  kind: TransactionKindSchema,
  amount: MoneySchema,
  categoryId: z.string().max(100),
  walletId: z.string().max(100),
  toWalletId: z.string().max(100).optional(),
  date: DateSchema,
  note: z.string().trim().max(2000).optional(),
  recurringRuleId: z.string().max(100).optional(),
  debtPaymentId: z.string().max(100).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const BudgetSchema = z.object({
  id: z.string().min(1).max(100),
  categoryId: z.string().max(100),
  month: MonthSchema,
  limit: MoneySchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const RecurringRuleSchema = z.object({
  id: z.string().min(1).max(100),
  kind: TransactionKindSchema,
  amount: MoneySchema,
  categoryId: z.string().max(100),
  walletId: z.string().max(100).optional(),
  toWalletId: z.string().max(100).optional(),
  note: z.string().trim().max(2000).optional(),
  frequency: FrequencySchema,
  interval: z.number().int().min(1).max(365),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  weekday: z.number().int().min(0).max(6).optional(),
  startDate: DateSchema,
  nextDueDate: DateSchema,
  endDate: DateSchema.optional(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const RecurringOccurrenceSchema = z.object({
  id: z.string().min(1).max(100),
  ruleId: z.string().max(100),
  dueDate: DateSchema,
  status: z.enum(["pending", "confirmed", "skipped"]),
  transactionId: z.string().max(100).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const DebtSchema = z.object({
  id: z.string().min(1).max(100),
  kind: DebtKindSchema,
  person: z.string().trim().min(1).max(100),
  principal: MoneySchema,
  openedDate: DateSchema,
  dueDate: DateSchema.optional(),
  note: z.string().trim().max(2000).optional(),
  closedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const DebtPaymentSchema = z.object({
  id: z.string().min(1).max(100),
  debtId: z.string().max(100),
  amount: MoneySchema,
  date: DateSchema,
  note: z.string().trim().max(2000).optional(),
  transactionId: z.string().max(100),
  createdAt: z.string(),
});

export const SavingsGoalSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  target: MoneySchema,
  targetDate: DateSchema.optional(),
  color: z.string().max(20),
  icon: z.string().max(50),
  closedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const GoalEntrySchema = z.object({
  id: z.string().min(1).max(100),
  goalId: z.string().max(100),
  amount: MoneySchema,
  direction: z.enum(["contribution", "withdrawal"]),
  date: DateSchema,
  note: z.string().trim().max(2000).optional(),
  createdAt: z.string(),
});

export const InstallmentSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  totalAmount: MoneySchema,
  monthlyAmount: MoneySchema,
  totalMonths: z.number().int().positive().max(1200),
  startDate: DateSchema,
  dueDate: z.number().int().min(1).max(31),
  closedAt: z.string().optional(),
  categoryId: z.string().max(100),
  walletId: z.string().max(100),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const BackupPayloadV1Schema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.string().optional(),
  transactions: z.array(TransactionSchema),
  settings: AppSettingsSchema,
  categories: z.array(CategorySchema),
  budgets: z.array(BudgetSchema).optional(),
  recurringRules: z.array(RecurringRuleSchema).optional(),
  recurringOccurrences: z.array(RecurringOccurrenceSchema).optional(),
  debts: z.array(DebtSchema).optional(),
  debtPayments: z.array(DebtPaymentSchema).optional(),
  goals: z.array(SavingsGoalSchema).optional(),
  goalEntries: z.array(GoalEntrySchema).optional(),
  wallets: z.array(WalletSchema).optional(),
  installments: z.array(InstallmentSchema).optional(),
});

export const BackupPayloadV2Schema = z.object({
  schemaVersion: z.literal(2),
  exportedAt: z.string().optional(),
  transactions: z.array(TransactionSchema),
  settings: AppSettingsSchema,
  categories: z.array(CategorySchema),
  budgets: z.array(BudgetSchema),
  recurringRules: z.array(RecurringRuleSchema),
  recurringOccurrences: z.array(RecurringOccurrenceSchema),
  debts: z.array(DebtSchema),
  debtPayments: z.array(DebtPaymentSchema),
  goals: z.array(SavingsGoalSchema),
  goalEntries: z.array(GoalEntrySchema),
  wallets: z.array(WalletSchema),
  installments: z.array(InstallmentSchema).optional(),
});

export const BackupPayloadV3Schema = z.object({
  schemaVersion: z.literal(3),
  exportedAt: z.string().optional(),
  transactions: z.array(TransactionSchema),
  settings: AppSettingsSchema,
  categories: z.array(CategorySchema),
  budgets: z.array(BudgetSchema),
  recurringRules: z.array(RecurringRuleSchema),
  recurringOccurrences: z.array(RecurringOccurrenceSchema),
  debts: z.array(DebtSchema),
  debtPayments: z.array(DebtPaymentSchema),
  goals: z.array(SavingsGoalSchema),
  goalEntries: z.array(GoalEntrySchema),
  wallets: z.array(WalletSchema),
  installments: z.array(InstallmentSchema),
});

export const BackupSchema = z.discriminatedUnion("schemaVersion", [
  BackupPayloadV1Schema,
  BackupPayloadV2Schema,
  BackupPayloadV3Schema,
]);

export type BackupPayload = z.infer<typeof BackupSchema>;

export const formatVnd = (amount: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(amount);

export const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
export const currentMonth = () => today().slice(0, 7);
export const newId = () => crypto.randomUUID();
