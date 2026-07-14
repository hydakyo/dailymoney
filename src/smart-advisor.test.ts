import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppData } from "./store";
import { generateSmartPlan } from "./smart-advisor";

const data: AppData = {
  settings: { id: "settings", onboardingComplete: true, openingBalance: 0, currency: "VND", lockEnabled: false, createdAt: "", updatedAt: "" },
  wallets: [{ id: "wallet", name: "Ví chính", icon: "Wallet", color: "#000", initialBalance: 10_000_000, archived: false, createdAt: "", updatedAt: "" }],
  categories: [
    { id: "food", kind: "expense", name: "Ăn uống", icon: "Utensils", color: "#000", archived: false, builtIn: true, createdAt: "" },
    { id: "shopping", kind: "expense", name: "Mua sắm", icon: "ShoppingBag", color: "#000", archived: false, builtIn: true, createdAt: "" }
  ],
  transactions: [
    { id: "food-apr", kind: "expense", amount: 1_200_000, categoryId: "food", walletId: "wallet", date: "2026-04-10", createdAt: "", updatedAt: "" },
    { id: "food-may", kind: "expense", amount: 1_100_000, categoryId: "food", walletId: "wallet", date: "2026-05-10", createdAt: "", updatedAt: "" },
    { id: "food-jun", kind: "expense", amount: 1_300_000, categoryId: "food", walletId: "wallet", date: "2026-06-10", createdAt: "", updatedAt: "" },
    { id: "shopping-apr", kind: "expense", amount: 300_000, categoryId: "shopping", walletId: "wallet", date: "2026-04-10", createdAt: "", updatedAt: "" },
    { id: "shopping-may", kind: "expense", amount: 400_000, categoryId: "shopping", walletId: "wallet", date: "2026-05-10", createdAt: "", updatedAt: "" },
    { id: "shopping-jun", kind: "expense", amount: 500_000, categoryId: "shopping", walletId: "wallet", date: "2026-06-10", createdAt: "", updatedAt: "" }
  ],
  budgets: [],
  rules: [{ id: "rent", kind: "expense", amount: 1_000_000, categoryId: "food", walletId: "wallet", frequency: "monthly", interval: 1, dayOfMonth: 20, startDate: "2026-01-20", nextDueDate: "2026-07-20", active: true, createdAt: "", updatedAt: "" }],
  occurrences: [],
  debts: [{ id: "debt", kind: "payable", person: "An", principal: 500_000, openedDate: "2026-06-01", dueDate: "2026-07-25", createdAt: "", updatedAt: "" }],
  payments: [],
  goals: [],
  goalEntries: [],
  installments: [{ id: "phone", name: "Phone", totalAmount: 3_000_000, monthlyAmount: 500_000, totalMonths: 6, startDate: "2026-07-01", dueDate: 20, categoryId: "shopping", walletId: "wallet", createdAt: "", updatedAt: "" }]
};

afterEach(() => vi.useRealTimers());

describe("adaptive smart plan", () => {
  it("prioritizes forecast obligations and allocates the flexible envelope by real category spending", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T12:00:00.000Z"));

    const plan = generateSmartPlan(data, "2026-07");
    const food = plan.suggestedBudgets.find(item => item.categoryId === "food");
    const shopping = plan.suggestedBudgets.find(item => item.categoryId === "shopping");

    expect(plan.mandatoryExpenses).toBe(2_000_000);
    expect(plan.flexibleAllowance).toBeGreaterThan(0);
    expect(food?.suggestedLimit).toBeGreaterThan(shopping?.suggestedLimit ?? 0);
    expect(plan.needsTotal).toBe(food?.suggestedLimit);
    expect(plan.wantsTotal).toBe(shopping?.suggestedLimit);
  });

  it("creates an urgent recovery plan when cash is short before a later income arrives", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T12:00:00.000Z"));
    const stressed: AppData = {
      ...data,
      wallets: [{ ...data.wallets[0], initialBalance: 6_000_000 }],
      debts: [{ ...data.debts[0], principal: 6_000_000, dueDate: "2026-07-15" }],
      rules: [
        ...data.rules,
        { ...data.rules[0], id: "salary", kind: "income", amount: 8_000_000, nextDueDate: "2026-07-30" }
      ]
    };

    const plan = generateSmartPlan(stressed, "2026-07");
    expect(plan.shortfall).toBeGreaterThan(0);
    expect(plan.priorityActions[0]).toMatchObject({ level: "danger" });
    expect(plan.lowestBalanceDate).toBeTruthy();
  });
});
