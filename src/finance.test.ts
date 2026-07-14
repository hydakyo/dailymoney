import { describe, expect, it } from "vitest";
import { advanceDueDate, totalBalance, walletBalance, budgetProgress, debtOutstanding, dueOccurrences, goalBalance, monthTotals } from "./finance";
import type { Budget, Category, Debt, DebtPayment, GoalEntry, RecurringRule, SavingsGoal, Transaction, Wallet } from "./domain";

const transaction = (kind: Transaction["kind"], amount: number, date = "2026-07-13", walletId = "w1"): Transaction => ({
  id: crypto.randomUUID(), kind, amount, categoryId: "category", walletId, date, createdAt: "", updatedAt: ""
});

const rule = (overrides: Partial<RecurringRule> = {}): RecurringRule => ({
  id: "rent", kind: "expense", amount: 5_000_000, categoryId: "home", frequency: "monthly", interval: 1, dayOfMonth: 31,
  startDate: "2026-01-31", nextDueDate: "2026-01-31", active: true, createdAt: "", updatedAt: "", ...overrides
});

describe("finance calculations", () => {
  it("calculates total balance from wallets and transactions", () => {
    const wallets: Wallet[] = [{ id: "w1", name: "Cash", initialBalance: 1_000_000, color: "", icon: "", archived: false, createdAt: "", updatedAt: "" }];
    expect(totalBalance(wallets, [transaction("income", 400_000), transaction("expense", 125_000)])).toBe(1_275_000);
  });

  it("totals only the requested month", () => {
    const totals = monthTotals([transaction("income", 300_000, "2026-07-01"), transaction("expense", 80_000, "2026-07-03"), transaction("expense", 50_000, "2026-06-30")], "2026-07");
    expect(totals).toEqual({ income: 300_000, expense: 80_000 });
  });

  it("clamps monthly rules on short months", () => {
    expect(advanceDueDate(rule(), "2026-01-31")).toBe("2026-02-28");
    expect(advanceDueDate(rule(), "2028-01-31")).toBe("2028-02-29");
  });

  it("advances daily rules across month boundaries", () => {
    expect(advanceDueDate(rule({ frequency: "daily", interval: 1 }), "2026-02-28")).toBe("2026-03-01");
    expect(advanceDueDate(rule({ frequency: "daily", interval: 2 }), "2026-12-31")).toBe("2027-01-02");
  });

  it("creates missing occurrences once and moves the due cursor forward", () => {
    const result = dueOccurrences(rule(), [], "2026-03-15");
    expect(result.occurrences.map(item => item.dueDate)).toEqual(["2026-01-31", "2026-02-28"]);
    expect(result.nextDueDate).toBe("2026-03-31");
  });

  it("does not recreate an occurrence already awaiting confirmation", () => {
    const result = dueOccurrences(rule(), [{ id: "rent:2026-01-31", ruleId: "rent", dueDate: "2026-01-31", status: "pending", createdAt: "", updatedAt: "" }], "2026-02-01");
    expect(result.occurrences.map(item => item.dueDate)).toEqual([]);
    expect(result.nextDueDate).toBe("2026-02-28");
  });

  it("calculates budget, debt and savings progress without changing the shared balance", () => {
    const category: Category = { id: "food", kind: "expense", name: "Ăn uống", icon: "Utensils", color: "#f00", archived: false, builtIn: true, createdAt: "" };
    const budget: Budget = { id: "budget", categoryId: "food", month: "2026-07", limit: 2_000_000, createdAt: "", updatedAt: "" };
    const debt: Debt = { id: "debt", kind: "payable", person: "An", principal: 3_000_000, openedDate: "2026-07-01", createdAt: "", updatedAt: "" };
    const payment: DebtPayment = { id: "payment", debtId: "debt", amount: 750_000, date: "2026-07-02", transactionId: "transaction", createdAt: "" };
    const goal: SavingsGoal = { id: "goal", name: "Du lịch", target: 5_000_000, color: "#00f", icon: "Goal", createdAt: "", updatedAt: "" };
    const entries: GoalEntry[] = [{ id: "one", goalId: "goal", amount: 1_500_000, direction: "contribution", date: "2026-07-02", createdAt: "" }, { id: "two", goalId: "goal", amount: 200_000, direction: "withdrawal", date: "2026-07-03", createdAt: "" }];

    expect(budgetProgress([budget], [{ ...transaction("expense", 450_000, "2026-07-02"), categoryId: "food" }], [category], "2026-07")[0]).toMatchObject({ spent: 450_000, category });
    expect(debtOutstanding(debt, [payment])).toBe(2_250_000);
    expect(goalBalance(goal, entries)).toBe(1_300_000);
  });
});
