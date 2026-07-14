import { create } from "zustand";
import { db, initializeDatabase } from "./db";
import type { AppSettings, Budget, Category, Debt, DebtPayment, GoalEntry, Installment, RecurringOccurrence, RecurringRule, SavingsGoal, Transaction, Wallet } from "./domain";
import { today } from "./domain";
import { dueOccurrences } from "./finance";

export interface AppData {
  settings: AppSettings;
  wallets: Wallet[];
  categories: Category[];
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
    createdAt: "",
    updatedAt: ""
  },
  wallets: [],
  categories: [],
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
  locked: boolean;
  setLocked: (locked: boolean) => void;
  refresh: () => Promise<void>;
}

export const useAppStore = create<AppStore>((set, get) => ({
  data: emptyData(),
  ready: false,
  locked: false,
  setLocked: (locked: boolean) => set({ locked }),
  refresh: async () => {
    const settings = await initializeDatabase();
    const [wallets, categories, transactions, budgets, rules, occurrences, debts, payments, goals, goalEntries, installments] = await Promise.all([
      db.wallets.toArray(),
      db.categories.toArray(),
      db.transactions.orderBy("date").reverse().toArray(),
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
    const creates = activeRules.flatMap(rule => 
      dueOccurrences(rule, occurrences, today()).occurrences.map(occurrence => ({ 
        ...occurrence, 
        createdAt: new Date().toISOString(), 
        updatedAt: new Date().toISOString() 
      }))
    );
    
    if (creates.length) {
      await db.recurringOccurrences.bulkAdd(creates);
    }
    
    if (activeRules.length) {
      await Promise.all(activeRules.map(async rule => {
        const nextDueDate = dueOccurrences(rule, occurrences, today()).nextDueDate;
        if (nextDueDate !== rule.nextDueDate) {
          await db.recurringRules.update(rule.id, { nextDueDate, updatedAt: new Date().toISOString() });
        }
      }));
    }
    
    const finalOccurrences = creates.length ? await db.recurringOccurrences.toArray() : occurrences;
    
    const newData = { settings, wallets, categories, transactions, budgets, rules, occurrences: finalOccurrences, debts, payments, goals, goalEntries, installments };
    
    set((state) => ({
      data: newData,
      locked: !state.ready ? settings.lockEnabled : state.locked,
      ready: true
    }));
  }
}));
