import Dexie, { type EntityTable } from "dexie";
import type { AppSettings, BackupPayloadV1, BackupPayloadV2, BackupPayloadV3, Budget, Category, Debt, DebtPayment, GoalEntry, Installment, RecurringOccurrence, RecurringRule, SavingsGoal, Transaction, Wallet } from "./domain";
import { defaultCategories } from "./seed";
import { newId } from "./domain";

class DailyMoneyDatabase extends Dexie {
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

  constructor() {
    super("daily-money");
    
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
    }).upgrade(async trans => {
      await trans.table("transactions").toCollection().modify((transaction: Transaction) => {
        if (transaction.installmentId && !transaction.installmentPeriod) transaction.installmentPeriod = transaction.date.slice(0, 7);
      });
    });

    this.version(6).stores({
      settings: "id", wallets: "id, archived", categories: "id, kind, archived",
      transactions: "id, date, kind, categoryId, walletId, toWalletId, recurringRuleId, debtPaymentId, installmentId, installmentPeriod, &[installmentId+installmentPeriod]",
      budgets: "id, [month+categoryId], month, categoryId", recurringRules: "id, active, nextDueDate",
      recurringOccurrences: "id, [ruleId+dueDate], status, dueDate", debts: "id, kind, dueDate, closedAt",
      debtPayments: "id, debtId, date, transactionId", goals: "id, closedAt", goalEntries: "id, goalId, date",
      installments: "id, closedAt, dueDate"
    }).upgrade(async trans => {
      const transactions = await trans.table("transactions").toArray() as Transaction[];
      const seen = new Set<string>();
      for (const transaction of transactions) {
        if (!transaction.installmentId) continue;
        transaction.installmentPeriod ??= transaction.date.slice(0, 7);
        const key = `${transaction.installmentId}:${transaction.installmentPeriod}`;
        if (seen.has(key)) {
          transaction.installmentId = undefined;
          transaction.installmentPeriod = undefined;
        } else {
          seen.add(key);
        }
      }
      await trans.table("transactions").bulkPut(transactions);
    });
  }
}

export const db = new DailyMoneyDatabase();

export async function initializeDatabase() {
  return db.transaction("rw", db.settings, db.categories, db.wallets, async () => {
    const existing = await db.settings.get("settings");
    if (!existing) {
      const now = new Date().toISOString();
      const settings: AppSettings = {
        id: "settings", onboardingComplete: false, openingBalance: 0, currency: "VND", lockEnabled: false, createdAt: now, updatedAt: now
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
    const seen = new Set<string>();
    const duplicates = categories.filter(category => {
      if (!category.builtIn) return false;
      const key = `${category.kind}:${category.name}`;
      if (seen.has(key)) return true;
      seen.add(key);
      return false;
    });
    if (duplicates.length) await db.categories.bulkDelete(duplicates.map(category => category.id));
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

export async function restoreBackup(payload: BackupPayloadV1 | BackupPayloadV2 | BackupPayloadV3) {
  await db.transaction("rw", db.tables, async () => {
    await Promise.all(db.tables.map(table => table.clear()));
    await db.settings.put(payload.settings);
    await db.categories.bulkAdd(payload.categories);
    const seenInstallmentPeriods = new Set<string>();
    const restoredTransactions = payload.transactions.map(transaction => {
      const restored = { ...transaction };
      if (restored.installmentId) {
        restored.installmentPeriod ??= restored.date.slice(0, 7);
        const key = `${restored.installmentId}:${restored.installmentPeriod}`;
        if (seenInstallmentPeriods.has(key)) {
          restored.installmentId = undefined;
          restored.installmentPeriod = undefined;
        } else {
          seenInstallmentPeriods.add(key);
        }
      }
      return restored;
    });
    await db.transactions.bulkAdd(restoredTransactions);
    await db.budgets.bulkAdd(payload.budgets ?? []);
    await db.recurringRules.bulkAdd(payload.recurringRules ?? []);
    await db.recurringOccurrences.bulkAdd(payload.recurringOccurrences ?? []);
    await db.debts.bulkAdd(payload.debts ?? []);
    await db.debtPayments.bulkAdd(payload.debtPayments ?? []);
    await db.goals.bulkAdd(payload.goals ?? []);
    await db.goalEntries.bulkAdd(payload.goalEntries ?? []);

    if (payload.schemaVersion >= 3) {
      await db.installments.bulkAdd((payload as BackupPayloadV3).installments);
    }

    if (payload.schemaVersion >= 2) {
      await db.wallets.bulkAdd((payload as BackupPayloadV2).wallets);
    } else {
      // Migrate v1 backup to v2
      const defaultWalletId = newId();
      const now = new Date().toISOString();
      await db.wallets.add({
        id: defaultWalletId,
        name: "Ví chính",
        icon: "Wallet",
        color: "#6d5dfc",
        initialBalance: payload.settings.openingBalance || 0,
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
