import Dexie, { type EntityTable } from "dexie";
import type { AppSettings, BackupPayloadV1, BackupPayloadV2, BackupPayloadV3, Budget, Category, Debt, DebtPayment, GoalEntry, Installment, RecurringOccurrence, RecurringRule, SavingsGoal, Transaction, Wallet } from "./domain";
import { defaultCategories } from "./seed";
import { newId } from "./domain";
import { normalizeInstallmentPayments, paidInstallmentPeriods } from "./finance";

export class DailyMoneyDatabase extends Dexie {
  settings!: EntityTable<AppSettings, "id">;
  wallets!: EntityTable<Wallet, "id">;
  categories!: EntityTable<Category, "id">;
  transactions!: EntityTable<Transaction, "id">;
  budgets!: EntityTable<Budget, "id">;
  recurringRules!: EntityTable<RecurringRule, "id">;
  recurringOccurrences!: EntityTable<RecurringOccurrence, "id">;
  debts!: EntityTable<Debt, "id">;
  debtPayments!: EntityTable<DebtPayment, "id">;
  goals!: EntityTable<SavingsGoal, "id">;
  goalEntries!: EntityTable<GoalEntry, "id">;
  installments!: EntityTable<Installment, "id">;

  constructor(name = "daily-money") {
    super(name);
    
    this.version(1).stores({
      settings: "id",
      categories: "id, kind, archived",
      transactions: "id, date, kind, categoryId, recurringRuleId, debtPaymentId",
      budgets: "id, [month+categoryId], month, categoryId",
      recurringRules: "id, active, nextDueDate",
      recurringOccurrences: "id, [ruleId+dueDate], status, dueDate",
      debts: "id, kind, dueDate, closedAt",
      debtPayments: "id, debtId, date, transactionId",
      goals: "id, closedAt",
      goalEntries: "id, goalId, date"
    });

    this.version(2).stores({
      settings: "id",
      wallets: "id, archived",
      categories: "id, kind, archived",
      transactions: "id, date, kind, categoryId, walletId, toWalletId, recurringRuleId, debtPaymentId",
      budgets: "id, [month+categoryId], month, categoryId",
      recurringRules: "id, active, nextDueDate",
      recurringOccurrences: "id, [ruleId+dueDate], status, dueDate",
      debts: "id, kind, dueDate, closedAt",
      debtPayments: "id, debtId, date, transactionId",
      goals: "id, closedAt",
      goalEntries: "id, goalId, date"
    }).upgrade(async trans => {
      // Migration from v1 to v2: create a default wallet and assign all transactions to it
      const settings = await trans.table("settings").get("settings");
      const defaultWalletId = newId();
      const now = new Date().toISOString();
      
      await trans.table("wallets").add({
        id: defaultWalletId,
        name: "Ví chính",
        icon: "Wallet",
        color: "#6d5dfc",
        initialBalance: settings?.openingBalance || 0,
        archived: false,
        createdAt: now,
        updatedAt: now
      });

      await trans.table("transactions").toCollection().modify((transaction: Transaction) => {
        transaction.walletId = defaultWalletId;
      });

      await trans.table("recurringRules").toCollection().modify((rule: RecurringRule) => {
        rule.walletId = defaultWalletId;
      });
    });

    this.version(3).stores({
      settings: "id",
      wallets: "id, archived",
      categories: "id, kind, archived",
      transactions: "id, date, kind, categoryId, walletId, toWalletId, recurringRuleId, debtPaymentId",
      budgets: "id, [month+categoryId], month, categoryId",
      recurringRules: "id, active, nextDueDate",
      recurringOccurrences: "id, [ruleId+dueDate], status, dueDate",
      debts: "id, kind, dueDate, closedAt",
      debtPayments: "id, debtId, date, transactionId",
      goals: "id, closedAt",
      goalEntries: "id, goalId, date",
      installments: "id, closedAt, dueDate"
    });

    this.version(4).stores({
      settings: "id", wallets: "id, archived", categories: "id, kind, archived",
      transactions: "id, date, kind, categoryId, walletId, toWalletId, recurringRuleId, debtPaymentId, installmentId",
      budgets: "id, [month+categoryId], month, categoryId", recurringRules: "id, active, nextDueDate",
      recurringOccurrences: "id, [ruleId+dueDate], status, dueDate", debts: "id, kind, dueDate, closedAt",
      debtPayments: "id, debtId, date, transactionId", goals: "id, closedAt", goalEntries: "id, goalId, date",
      installments: "id, closedAt, dueDate"
    });

    this.version(5).stores({
      settings: "id", wallets: "id, archived", categories: "id, kind, archived",
      transactions: "id, date, kind, categoryId, walletId, toWalletId, recurringRuleId, debtPaymentId, installmentId, installmentPeriod, [installmentId+installmentPeriod]",
      budgets: "id, [month+categoryId], month, categoryId", recurringRules: "id, active, nextDueDate",
      recurringOccurrences: "id, [ruleId+dueDate], status, dueDate", debts: "id, kind, dueDate, closedAt",
      debtPayments: "id, debtId, date, transactionId", goals: "id, closedAt", goalEntries: "id, goalId, date",
      installments: "id, closedAt, dueDate"
    });

    this.version(6).stores({
      settings: "id", wallets: "id, archived", categories: "id, kind, archived",
      transactions: "id, date, kind, categoryId, walletId, toWalletId, recurringRuleId, debtPaymentId, installmentId, installmentPeriod, [installmentId+installmentPeriod]",
      budgets: "id, [month+categoryId], month, categoryId", recurringRules: "id, active, nextDueDate",
      recurringOccurrences: "id, [ruleId+dueDate], status, dueDate", debts: "id, kind, dueDate, closedAt",
      debtPayments: "id, debtId, date, transactionId", goals: "id, closedAt", goalEntries: "id, goalId, date",
      installments: "id, closedAt, dueDate"
    });

    this.version(7).stores({
      settings: "id", wallets: "id, archived", categories: "id, kind, archived",
      transactions: "id, date, kind, categoryId, walletId, toWalletId, recurringRuleId, debtPaymentId, installmentId, installmentPeriod, [installmentId+installmentPeriod]",
      budgets: "id, [month+categoryId], month, categoryId", recurringRules: "id, active, nextDueDate",
      recurringOccurrences: "id, [ruleId+dueDate], status, dueDate", debts: "id, kind, dueDate, closedAt",
      debtPayments: "id, debtId, date, transactionId", goals: "id, closedAt", goalEntries: "id, goalId, date",
      installments: "id, closedAt, dueDate"
    });

    this.version(8).stores({
      settings: "id", wallets: "id, archived", categories: "id, kind, archived",
      transactions: "id, date, kind, categoryId, walletId, toWalletId, recurringRuleId, debtPaymentId, installmentId, installmentPeriod, [installmentId+installmentPeriod]",
      budgets: "id, [month+categoryId], month, categoryId", recurringRules: "id, active, nextDueDate",
      recurringOccurrences: "id, [ruleId+dueDate], status, dueDate", debts: "id, kind, dueDate, closedAt",
      debtPayments: "id, debtId, date, transactionId", goals: "id, closedAt", goalEntries: "id, goalId, date",
      installments: "id, closedAt, dueDate"
    }).upgrade(async trans => {
      const transactions = await trans.table("transactions").toArray() as Transaction[];
      const installments = await trans.table("installments").toArray() as Installment[];
      const reconciled = reconcileInstallmentPayments(transactions, installments);
      await trans.table("transactions").bulkPut(reconciled.transactions);
      await trans.table("installments").bulkPut(reconciled.installments);
    });

    this.version(9).stores({
      settings: "id", wallets: "id, archived", categories: "id, kind, archived",
      transactions: "id, date, kind, categoryId, walletId, toWalletId, recurringRuleId, debtPaymentId, installmentId, installmentPeriod, [installmentId+installmentPeriod]",
      budgets: "id, [month+categoryId], month, categoryId", recurringRules: "id, active, nextDueDate",
      recurringOccurrences: "id, [ruleId+dueDate], status, dueDate", debts: "id, kind, dueDate, closedAt",
      debtPayments: "id, debtId, date, transactionId", goals: "id, closedAt", goalEntries: "id, goalId, date",
      installments: "id, closedAt, dueDate"
    }).upgrade(async trans => {
      const essentialNames = new Set(["Ăn uống", "Di chuyển", "Nhà ở", "Hóa đơn", "Sức khỏe", "Giáo dục", "Gia đình"]);
      await trans.table("categories").toCollection().modify((category: Category) => {
        if (category.kind === "expense" && !category.financialClass) {
          category.financialClass = essentialNames.has(category.name) ? "essential" : "discretionary";
        }
      });
    });

    this.version(10).stores({
      settings: "id", wallets: "id, archived", categories: "id, kind, archived",
      transactions: "id, date, kind, categoryId, walletId, toWalletId, recurringRuleId, debtPaymentId, installmentId, installmentPeriod, [installmentId+installmentPeriod]",
      budgets: "id, [month+categoryId], month, categoryId", recurringRules: "id, active, nextDueDate",
      recurringOccurrences: "id, [ruleId+dueDate], status, dueDate", debts: "id, kind, dueDate, closedAt",
      debtPayments: "id, debtId, date, transactionId", goals: "id, closedAt", goalEntries: "id, goalId, date",
      installments: "id, closedAt, dueDate"
    }).upgrade(async trans => {
      await trans.table("debts").toCollection().modify((debt: Debt) => {
        if (debt.kind === "receivable" && !debt.collectionConfidence) {
          debt.collectionConfidence = "likely";
        }
      });
    });

    // First remove legacy duplicates while the compound index is still non-unique.
    // The next version can then safely make the business invariant database-enforced.
    this.version(11).stores({
      settings: "id", wallets: "id, archived", categories: "id, kind, archived",
      transactions: "id, date, kind, categoryId, walletId, toWalletId, recurringRuleId, debtPaymentId, installmentId, installmentPeriod, [installmentId+installmentPeriod]",
      budgets: "id, [month+categoryId], month, categoryId", recurringRules: "id, active, nextDueDate",
      recurringOccurrences: "id, [ruleId+dueDate], status, dueDate", debts: "id, kind, dueDate, closedAt",
      debtPayments: "id, debtId, date, transactionId", goals: "id, closedAt", goalEntries: "id, goalId, date",
      installments: "id, closedAt, dueDate"
    }).upgrade(async trans => {
      const budgets = await trans.table("budgets").toArray() as Budget[];
      const keepByKey = new Map<string, Budget>();
      const duplicates: string[] = [];
      for (const budget of budgets.sort((left, right) =>
        (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "") || (right.createdAt ?? "").localeCompare(left.createdAt ?? "")
      )) {
        const key = `${budget.month}:${budget.categoryId}`;
        if (keepByKey.has(key)) duplicates.push(budget.id);
        else keepByKey.set(key, budget);
      }
      if (duplicates.length) await trans.table("budgets").bulkDelete(duplicates);
    });

    this.version(12).stores({
      settings: "id", wallets: "id, archived", categories: "id, kind, archived",
      transactions: "id, date, kind, categoryId, walletId, toWalletId, recurringRuleId, debtPaymentId, installmentId, installmentPeriod, [installmentId+installmentPeriod]",
      budgets: "id, &[month+categoryId], month, categoryId", recurringRules: "id, active, nextDueDate",
      recurringOccurrences: "id, [ruleId+dueDate], status, dueDate", debts: "id, kind, dueDate, closedAt",
      debtPayments: "id, debtId, date, transactionId", goals: "id, closedAt", goalEntries: "id, goalId, date",
      installments: "id, closedAt, dueDate"
    });
  }
}

export const db = new DailyMoneyDatabase();

function reconcileInstallmentPayments(transactions: Transaction[], installments: Installment[]) {
  const normalizedTransactions = normalizeInstallmentPayments(transactions, installments);
  const now = new Date().toISOString();
  const normalizedInstallments = installments.map(installment => {
    const closedAt = paidInstallmentPeriods(installment, normalizedTransactions).size === installment.totalMonths
      ? installment.closedAt ?? now
      : undefined;
    return closedAt === installment.closedAt ? installment : { ...installment, closedAt, updatedAt: now };
  });
  return { transactions: normalizedTransactions, installments: normalizedInstallments };
}

function installmentLinkChanged(before: Transaction, after: Transaction) {
  return before.installmentId !== after.installmentId || before.installmentPeriod !== after.installmentPeriod;
}

export async function initializeDatabase() {
  return db.transaction("rw", [db.settings, db.categories, db.wallets, db.transactions, db.budgets, db.recurringRules, db.installments], async () => {
    const existing = await db.settings.get("settings");
    if (!existing) {
      const now = new Date().toISOString();
      const settings: AppSettings = {
        id: "settings", onboardingComplete: false, openingBalance: 0, currency: "VND", lockEnabled: false, minimumReserve: 0, theme: "system", createdAt: now, updatedAt: now
      };
      await db.settings.put(settings);
      await db.categories.bulkAdd(defaultCategories());
      await db.wallets.add({
        id: newId(),
        name: "Ví chính",
        icon: "Wallet",
        color: "#6d5dfc",
        initialBalance: 0,
        archived: false,
        createdAt: now,
        updatedAt: now
      });
      return settings;
    }
    const categories = await db.categories.toArray();
    const primaryByKey = new Map<string, string>();
    const remapCategoryIds = new Map<string, string>();
    const duplicates = categories.filter(category => {
      if (!category.builtIn) return false;
      const key = `${category.kind}:${category.name}`;
      const primaryId = primaryByKey.get(key);
      if (primaryId) {
        remapCategoryIds.set(category.id, primaryId);
        return true;
      }
      primaryByKey.set(key, category.id);
      return false;
    });
    if (duplicates.length) {
      await db.transactions.toCollection().modify(transaction => {
        const replacement = remapCategoryIds.get(transaction.categoryId);
        if (replacement) transaction.categoryId = replacement;
      });
      const budgets = await db.budgets.toArray();
      const seenBudgetKeys = new Set<string>();
      const budgetIdsToDelete: string[] = [];
      const budgetIdsToRemap: Array<{ id: string; categoryId: string }> = [];
      for (const budget of budgets) {
        const categoryId = remapCategoryIds.get(budget.categoryId) ?? budget.categoryId;
        const key = `${budget.month}:${categoryId}`;
        if (seenBudgetKeys.has(key)) {
          budgetIdsToDelete.push(budget.id);
        } else {
          seenBudgetKeys.add(key);
          if (categoryId !== budget.categoryId) budgetIdsToRemap.push({ id: budget.id, categoryId });
        }
      }
      if (budgetIdsToDelete.length) await db.budgets.bulkDelete(budgetIdsToDelete);
      for (const budget of budgetIdsToRemap) await db.budgets.update(budget.id, { categoryId: budget.categoryId });
      await db.recurringRules.toCollection().modify(rule => {
        const replacement = remapCategoryIds.get(rule.categoryId);
        if (replacement) rule.categoryId = replacement;
      });
      await db.installments.toCollection().modify(installment => {
        const replacement = remapCategoryIds.get(installment.categoryId);
        if (replacement) installment.categoryId = replacement;
      });
      await db.categories.bulkDelete(duplicates.map(category => category.id));
    }
    const transactions = await db.transactions.toArray();
    const installments = await db.installments.toArray();
    const reconciled = reconcileInstallmentPayments(transactions, installments);
    const changedTransactions = reconciled.transactions.filter((transaction, index) => installmentLinkChanged(transactions[index], transaction));
    if (changedTransactions.length) await db.transactions.bulkPut(changedTransactions);
    const changedInstallments = reconciled.installments.filter((installment, index) => installment.closedAt !== installments[index].closedAt);
    if (changedInstallments.length) await db.installments.bulkPut(changedInstallments);
    return existing;
  });
}

export async function exportBackup(): Promise<BackupPayloadV3> {
  const settings = await db.settings.get("settings");
  if (!settings) throw new Error("Chưa thể đọc cài đặt ứng dụng.");
  const [wallets, categories, transactions, budgets, recurringRules, recurringOccurrences, debts, debtPayments, goals, goalEntries, installments] = await Promise.all([
    db.wallets.toArray(), db.categories.toArray(), db.transactions.toArray(), db.budgets.toArray(), db.recurringRules.toArray(), db.recurringOccurrences.toArray(),
    db.debts.toArray(), db.debtPayments.toArray(), db.goals.toArray(), db.goalEntries.toArray(), db.installments.toArray()
  ]);
  return { schemaVersion: 3, exportedAt: new Date().toISOString(), settings, wallets, categories, transactions, budgets, recurringRules, recurringOccurrences, debts, debtPayments, goals, goalEntries, installments };
}

function assertUnique(records: Array<{ id: string }>, label: string) {
  const ids = new Set<string>();
  for (const record of records) {
    if (ids.has(record.id)) throw new Error(`Backup có ${label} trùng ID.`);
    ids.add(record.id);
  }
}

function hasUsablePin(settings: AppSettings) {
  if (!settings.lockEnabled) return true;
  if (!settings.pinHash || !settings.pinSalt || !/^[a-f0-9]{64}$/i.test(settings.pinHash)) return false;
  const legacySalt = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(settings.pinSalt);
  const currentSalt = /^[A-Za-z0-9+/]{22}==$/.test(settings.pinSalt);
  return legacySalt || currentSalt;
}

function normalizeRestoredSettings(settings: AppSettings): AppSettings {
  if (hasUsablePin(settings)) return settings;
  return { ...settings, lockEnabled: false, pinHash: undefined, pinSalt: undefined };
}

export function prepareRestorePayload(payload: BackupPayloadV1 | BackupPayloadV2 | BackupPayloadV3) {
  const wallets: Wallet[] = payload.schemaVersion >= 2 ? payload.wallets ?? [] : [];
  const categories: Category[] = payload.categories;
  let transactions: Transaction[] = payload.transactions;
  const budgets: Budget[] = payload.budgets ?? [];
  const rules: RecurringRule[] = payload.recurringRules ?? [];
  const occurrences: RecurringOccurrence[] = payload.recurringOccurrences ?? [];
  const debts: Debt[] = payload.debts ?? [];
  const payments: DebtPayment[] = payload.debtPayments ?? [];
  const goals: SavingsGoal[] = payload.goals ?? [];
  const entries: GoalEntry[] = payload.goalEntries ?? [];
  const installments: Installment[] = payload.schemaVersion >= 3 ? payload.installments ?? [] : [];
  if (payload.schemaVersion >= 2 && !wallets.length) throw new Error("Backup không có ví hợp lệ.");
  for (const [records, label] of [
    [wallets, "ví"], [categories, "danh mục"], [transactions, "giao dịch"], [budgets, "ngân sách"],
    [rules, "giao dịch lặp"], [occurrences, "kỳ lặp"], [debts, "công nợ"], [payments, "thanh toán công nợ"],
    [goals, "mục tiêu"], [entries, "đóng góp mục tiêu"], [installments, "trả góp"]
  ] as const) assertUnique(records as Array<{ id: string }>, label);
  const walletIds = new Set(wallets.map(item => item.id));
  const categoryIds = new Set(categories.map(item => item.id));
  const transactionIds = new Set(transactions.map(item => item.id));
  const ruleIds = new Set(rules.map(item => item.id));
  const debtIds = new Set(debts.map(item => item.id));
  const goalIds = new Set(goals.map(item => item.id));
  const installmentIds = new Set(installments.map(item => item.id));
  const requireReference = (condition: boolean, message: string) => { if (!condition) throw new Error(`Backup không hợp lệ: ${message}.`); };
  for (const transaction of transactions) {
    if (payload.schemaVersion >= 2) requireReference(walletIds.has(transaction.walletId), "giao dịch trỏ tới ví không tồn tại");
    requireReference(categoryIds.has(transaction.categoryId), "giao dịch trỏ tới danh mục không tồn tại");
    if (payload.schemaVersion >= 2 && transaction.toWalletId) requireReference(walletIds.has(transaction.toWalletId), "giao dịch chuyển tiền trỏ tới ví không tồn tại");
    if (transaction.installmentId) requireReference(installmentIds.has(transaction.installmentId), "giao dịch trỏ tới trả góp không tồn tại");
  }
  for (const budget of budgets) requireReference(categoryIds.has(budget.categoryId), "ngân sách trỏ tới danh mục không tồn tại");
  const budgetKeys = new Set<string>();
  for (const budget of budgets) {
    const key = `${budget.month}:${budget.categoryId}`;
    if (budgetKeys.has(key)) throw new Error("Backup có ngân sách trùng tháng và danh mục.");
    budgetKeys.add(key);
  }
  for (const rule of rules) {
    requireReference(categoryIds.has(rule.categoryId), "giao dịch lặp trỏ tới danh mục không tồn tại");
    if (payload.schemaVersion >= 2 && rule.walletId) requireReference(walletIds.has(rule.walletId), "giao dịch lặp trỏ tới ví không tồn tại");
  }
  for (const occurrence of occurrences) requireReference(ruleIds.has(occurrence.ruleId), "kỳ lặp trỏ tới giao dịch lặp không tồn tại");
  for (const payment of payments) {
    requireReference(debtIds.has(payment.debtId), "thanh toán công nợ trỏ tới khoản nợ không tồn tại");
    requireReference(transactionIds.has(payment.transactionId), "thanh toán công nợ trỏ tới giao dịch không tồn tại");
  }
  const paymentByTransactionId = new Map<string, DebtPayment>();
  for (const payment of payments) {
    requireReference(!paymentByTransactionId.has(payment.transactionId), "nhiều thanh toán công nợ cùng trỏ tới một giao dịch");
    paymentByTransactionId.set(payment.transactionId, payment);
  }
  transactions = transactions.map(transaction => {
    const payment = paymentByTransactionId.get(transaction.id);
    if (!payment) return transaction;
    requireReference(!transaction.debtPaymentId || transaction.debtPaymentId === payment.id, "thanh toán công nợ không khớp giao dịch liên kết");
    return transaction.debtPaymentId ? transaction : { ...transaction, debtPaymentId: payment.id };
  });
  for (const entry of entries) requireReference(goalIds.has(entry.goalId), "đóng góp mục tiêu trỏ tới mục tiêu không tồn tại");
  for (const installment of installments) {
    requireReference(categoryIds.has(installment.categoryId), "trả góp trỏ tới danh mục không tồn tại");
    requireReference(walletIds.has(installment.walletId), "trả góp trỏ tới ví không tồn tại");
  }
  return { ...payload, transactions, settings: normalizeRestoredSettings(payload.settings) };
}

export async function restoreBackup(payload: BackupPayloadV1 | BackupPayloadV2 | BackupPayloadV3) {
  const prepared = prepareRestorePayload(payload);
  await db.transaction("rw", db.tables, async () => {
    await Promise.all(db.tables.map(table => table.clear()));
    await db.settings.put(prepared.settings);
    await db.categories.bulkAdd(prepared.categories);
    const restoredTransactions = prepared.transactions.map(transaction => ({ ...transaction }));
    await db.transactions.bulkAdd(restoredTransactions);
    await db.budgets.bulkAdd(prepared.budgets ?? []);
    await db.recurringRules.bulkAdd(prepared.recurringRules ?? []);
    await db.recurringOccurrences.bulkAdd(prepared.recurringOccurrences ?? []);
    await db.debts.bulkAdd(prepared.debts ?? []);
    await db.debtPayments.bulkAdd(prepared.debtPayments ?? []);
    await db.goals.bulkAdd(prepared.goals ?? []);
    await db.goalEntries.bulkAdd(prepared.goalEntries ?? []);

    if (prepared.schemaVersion >= 3) {
      await db.installments.bulkAdd((prepared as BackupPayloadV3).installments);
      const reconciled = reconcileInstallmentPayments(restoredTransactions, await db.installments.toArray());
      const changedTransactions = reconciled.transactions.filter((transaction, index) => installmentLinkChanged(restoredTransactions[index], transaction));
      if (changedTransactions.length) await db.transactions.bulkPut(changedTransactions);
      const originalInstallments = new Map((prepared as BackupPayloadV3).installments.map(installment => [installment.id, installment]));
      const changedInstallments = reconciled.installments.filter(installment => installment.closedAt !== originalInstallments.get(installment.id)?.closedAt);
      if (changedInstallments.length) await db.installments.bulkPut(changedInstallments);
    }

    if (prepared.schemaVersion >= 2) {
      await db.wallets.bulkAdd((prepared as BackupPayloadV2).wallets);
    } else {
      // Migrate v1 backup to v2
      const defaultWalletId = newId();
      const now = new Date().toISOString();
      await db.wallets.add({
        id: defaultWalletId,
        name: "Ví chính",
        icon: "Wallet",
        color: "#6d5dfc",
        initialBalance: prepared.settings.openingBalance || 0,
        archived: false,
        createdAt: now,
        updatedAt: now
      });
      await db.transactions.toCollection().modify((transaction: Transaction) => {
        transaction.walletId = defaultWalletId;
      });
      await db.recurringRules.toCollection().modify((rule: RecurringRule) => {
        rule.walletId = defaultWalletId;
      });
    }
  });
}
