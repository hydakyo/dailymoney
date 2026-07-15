import { z } from "zod";

export type TransactionKind = "income" | "expense" | "transfer";
export type EditableTransactionKind = Exclude<TransactionKind, "transfer">;
export type DebtKind = "receivable" | "payable";
export type Frequency = "daily" | "weekly" | "monthly" | "yearly";
export type ObligationPriority = "essential" | "high" | "normal" | "flexible";
export type FinancialClass = "essential" | "discretionary";
export type CollectionConfidence = "certain" | "likely" | "uncertain";
export type ThemePreference = "system" | "light" | "dark";
export type CategoryLearningSource = "voice" | "sms" | "manual";

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
  minimumReserve?: number;
  theme?: ThemePreference;
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
  financialClass?: FinancialClass;
  createdAt: string;
}

/** A local correction used to personalize transaction classification. */
export interface CategoryLearning {
  id: string;
  kind: EditableTransactionKind;
  phrase: string;
  categoryId: string;
  source: CategoryLearningSource;
  uses: number;
  createdAt: string;
  updatedAt: string;
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
  installmentId?: string;
  installmentPeriod?: string;
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
  priority?: ObligationPriority;
  active: boolean;
  /** Archived rules retain the semantic link on historical transactions. */
  archived?: boolean;
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
  priority?: ObligationPriority;
  collectionConfidence?: CollectionConfidence;
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
  priority?: ObligationPriority;
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
  categoryLearnings?: CategoryLearning[];
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
  categoryLearnings?: CategoryLearning[];
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
  categoryLearnings?: CategoryLearning[];
}

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, "Ngày không hợp lệ");
export function isValidDate(value: string) {
  return DateSchema.safeParse(value).success;
}

const MonthSchema = z.string().regex(/^\d{4}-\d{2}$/).refine(value => {
  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
}, "Tháng không hợp lệ");
const NonnegativeMoneySchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const MoneySchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
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
  minimumReserve: NonnegativeMoneySchema.optional(),
  theme: z.enum(["system", "light", "dark"]).optional(),
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
  financialClass: z.enum(["essential", "discretionary"]).optional(),
  createdAt: z.string(),
});

export const CategoryLearningSchema = z.object({
  id: z.string().min(1).max(100),
  kind: z.enum(["income", "expense"]),
  phrase: z.string().trim().min(2).max(200),
  categoryId: z.string().min(1).max(100),
  source: z.enum(["voice", "sms", "manual"]),
  uses: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  createdAt: z.string(),
  updatedAt: z.string(),
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
  installmentId: z.string().max(100).optional(),
  installmentPeriod: MonthSchema.optional(),
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
  priority: z.enum(["essential", "high", "normal", "flexible"]).optional(),
  active: z.boolean(),
  archived: z.boolean().optional(),
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
  priority: z.enum(["essential", "high", "normal", "flexible"]).optional(),
  collectionConfidence: z.enum(["certain", "likely", "uncertain"]).optional(),
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
  priority: z.enum(["essential", "high", "normal", "flexible"]).optional(),
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
  categoryLearnings: z.array(CategoryLearningSchema).optional(),
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
  categoryLearnings: z.array(CategoryLearningSchema).optional(),
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
  categoryLearnings: z.array(CategoryLearningSchema).optional(),
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
