import { create } from "zustand";
import { db, initializeDatabase } from "./db";
import type { AppSettings, Budget, Category, CategoryLearning, Debt, DebtPayment, GoalEntry, Installment, RecurringOccurrence, RecurringRule, SavingsGoal, Transaction, Wallet } from "./domain";
import { today } from "./domain";
import { dueOccurrences } from "./finance";

export interface AppData {
  settings: AppSettings;
  wallets: Wallet[];
  categories: Category[];
  categoryLearnings?: CategoryLearning[];
  transactions: Transaction[];
  budgets: Budget[];
  rules: RecurringRule[];
  occurrences: RecurringOccurrence[];
  debts: Debt[];
  payments: DebtPayment[];
  goals: SavingsGoal[];
  goalEntries: GoalEntry[];
  installments: Installment[];
}

export const emptyData = (): AppData => ({
  settings: {
    id: "settings",
    onboardingComplete: false,
    openingBalance: 0,
    currency: "VND",
    lockEnabled: false,
    reminderEnabled: false,
    reminderTime: "20:00",
    minimumReserve: 0,
    theme: "system",
    createdAt: "",
    updatedAt: ""
  },
  wallets: [],
  categories: [],
  categoryLearnings: [],
  transactions: [],
  budgets: [],
  rules: [],
  occurrences: [],
  debts: [],
  payments: [],
  goals: [],
  goalEntries: [],
  installments: []
});

interface AppStore {
  data: AppData;
  ready: boolean;
  loadError: string | null;
  locked: boolean;
  setLocked: (locked: boolean) => void;
  refresh: () => Promise<void>;
}

export const useAppStore = create<AppStore>((set, get) => ({
  data: emptyData(),
  ready: false,
  loadError: null,
  locked: false,
  setLocked: (locked: boolean) => set({ locked }),
  refresh: async () => {
    try {
    const settings = await initializeDatabase();
    const [wallets, categories, categoryLearnings, transactions, budgets, rules, occurrences, debts, payments, goals, goalEntries, installments] = await Promise.all([
      db.wallets.toArray(),
      db.categories.toArray(),
      db.categoryLearnings.toArray(),
      db.transactions.reverse().toArray(),
      db.budgets.toArray(),
      db.recurringRules.toArray(),
      db.recurringOccurrences.toArray(),
      db.debts.toArray(),
      db.debtPayments.toArray(),
      db.goals.toArray(),
      db.goalEntries.toArray(),
      db.installments.toArray()
    ]);
    
    const activeRules = rules.filter(rule => rule.active);
    const dueByRule = activeRules.map(rule => ({ rule, result: dueOccurrences(rule, occurrences, today()) }));
    const creates = dueByRule.flatMap(({ result }) =>
      result.occurrences.map(occurrence => ({
        ...occurrence, 
        createdAt: new Date().toISOString(), 
        updatedAt: new Date().toISOString() 
      }))
    );
    
    if (creates.length) {
      // IDs are deterministic (rule:date), so concurrent refreshes remain idempotent.
      await db.recurringOccurrences.bulkPut(creates);
    }
    
    if (dueByRule.length) {
      await Promise.all(dueByRule.map(async ({ rule, result }) => {
        const { nextDueDate } = result;
        if (nextDueDate !== rule.nextDueDate) {
          await db.recurringRules.update(rule.id, { nextDueDate, updatedAt: new Date().toISOString() });
        }
      }));
    }
    
    const finalOccurrences = creates.length ? await db.recurringOccurrences.toArray() : occurrences;
    const nextDueDates = new Map(dueByRule.map(({ rule, result }) => [rule.id, result.nextDueDate]));
    const finalRules = rules.map(rule => nextDueDates.has(rule.id) ? { ...rule, nextDueDate: nextDueDates.get(rule.id)! } : rule);
    
    const newData = { settings, wallets, categories, categoryLearnings, transactions, budgets, rules: finalRules, occurrences: finalOccurrences, debts, payments, goals, goalEntries, installments };
    
    set((state) => ({
      data: newData,
      locked: !state.ready ? settings.lockEnabled : state.locked,
      loadError: null,
      ready: true
    }));
    } catch (error) {
      set({
        ready: true,
        locked: false,
        loadError: error instanceof Error ? error.message : "Không thể mở dữ liệu trên thiết bị này."
      });
    }
  }
}));
