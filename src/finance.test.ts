import { describe, expect, it } from "vitest";
import { advanceDueDate, totalBalance, walletBalance, budgetProgress, debtOutstanding, dueOccurrences, goalBalance, installmentPeriods, monthForecast, monthTotals, normalizeInstallmentPayments, oldestUnpaidInstallmentPeriod, paidInstallmentPeriods } from "./finance";
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

  it("moves money between wallets without changing the total balance", () => {
    const wallets: Wallet[] = [
      { id: "w1", name: "Cash", initialBalance: 1_000_000, color: "", icon: "", archived: false, createdAt: "", updatedAt: "" },
      { id: "w2", name: "Bank", initialBalance: 2_000_000, color: "", icon: "", archived: false, createdAt: "", updatedAt: "" }
    ];
    const transfer = { ...transaction("transfer", 400_000, "2026-07-13", "w1"), toWalletId: "w2" };
    expect(walletBalance(wallets[0], [transfer])).toBe(600_000);
    expect(walletBalance(wallets[1], [transfer])).toBe(2_400_000);
    expect(totalBalance(wallets, [transfer])).toBe(3_000_000);
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

  it("forecasts the current month from pending rules, installments and remaining budget", () => {
    const category: Category = { id: "food", kind: "expense", name: "Ăn uống", icon: "Utensils", color: "#f00", archived: false, builtIn: true, createdAt: "" };
    const budget: Budget = { id: "budget", categoryId: "food", month: "2026-07", limit: 2_000_000, createdAt: "", updatedAt: "" };
    const forecast = monthForecast({
      balance: 10_000_000,
      month: "2026-07",
      transactions: [{ ...transaction("expense", 1_000_000, "2026-07-01"), categoryId: "food" }],
      rules: [rule({ id: "salary", kind: "income", amount: 4_000_000, nextDueDate: "2026-07-25" }), rule({ id: "rent", amount: 2_000_000, nextDueDate: "2026-07-20" })],
      occurrences: [
        { id: "salary:2026-07-25", ruleId: "salary", dueDate: "2026-07-25", status: "pending", createdAt: "", updatedAt: "" },
        { id: "rent:2026-07-20", ruleId: "rent", dueDate: "2026-07-20", status: "pending", createdAt: "", updatedAt: "" }
      ],
      installments: [{ id: "phone", name: "Phone", totalAmount: 3_000_000, monthlyAmount: 500_000, totalMonths: 6, startDate: "2026-07-01", dueDate: 20, categoryId: "food", walletId: "w1", createdAt: "", updatedAt: "" }],
      budgets: budgetProgress([budget], [{ ...transaction("expense", 1_000_000, "2026-07-01"), categoryId: "food" }], [category], "2026-07"),
      asOf: new Date(2026, 6, 14)
    });
    expect(forecast).toMatchObject({ expectedIncome: 4_000_000, expectedRecurringExpense: 2_000_000, expectedInstallments: 500_000, remainingBudget: 1_000_000, projectedFlexibleExpense: 1_000_000 });
    expect(forecast?.projectedBalance).toBe(10_500_000);
    expect(monthForecast({ balance: 0, month: "2026-06", transactions: [], rules: [], occurrences: [], installments: [], budgets: [], asOf: new Date(2026, 6, 14) })).toBeNull();
  });

  it("does not forecast a future installment period and finds the oldest missed period", () => {
    const installment = { id: "phone", name: "Phone", totalAmount: 3_000_000, monthlyAmount: 500_000, totalMonths: 3, startDate: "2026-08-01", dueDate: 20, categoryId: "food", walletId: "w1", createdAt: "", updatedAt: "" };
    expect(installmentPeriods(installment)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(oldestUnpaidInstallmentPeriod(installment, [])).toBe("2026-08");
    expect(monthForecast({ balance: 1_000_000, month: "2026-07", transactions: [], rules: [], occurrences: [], installments: [installment], budgets: [], asOf: new Date(2026, 6, 14) })?.expectedInstallments).toBe(0);
  });

  it("forecasts every unpaid installment period that is due by month end", () => {
    const installment = { id: "phone", name: "Phone", totalAmount: 3_000_000, monthlyAmount: 500_000, totalMonths: 3, startDate: "2026-05-01", dueDate: 20, categoryId: "food", walletId: "w1", createdAt: "", updatedAt: "" };
    const forecast = monthForecast({ balance: 5_000_000, month: "2026-07", transactions: [], rules: [], occurrences: [], installments: [installment], budgets: [], asOf: new Date(2026, 6, 14) });
    expect(forecast?.expectedInstallments).toBe(1_500_000);
    expect(forecast?.expectedInstallmentPeriods).toBe(3);
  });

  it("maps legacy installment payments to obligation periods instead of payment months", () => {
    const installment = { id: "phone", name: "Phone", totalAmount: 1_500_000, monthlyAmount: 500_000, totalMonths: 3, startDate: "2026-05-01", dueDate: 20, categoryId: "food", walletId: "w1", createdAt: "", updatedAt: "" };
    const payments = [
      { ...transaction("expense", 500_000, "2026-05-20"), id: "first", installmentId: "phone", createdAt: "2026-05-20T10:00:00.000Z" },
      { ...transaction("expense", 500_000, "2026-06-20"), id: "second", installmentId: "phone", createdAt: "2026-06-20T10:00:00.000Z" },
      { ...transaction("expense", 500_000, "2026-08-02"), id: "late", installmentId: "phone", createdAt: "2026-08-02T10:00:00.000Z" }
    ];

    const normalized = normalizeInstallmentPayments(payments, [installment]);
    expect(normalized.map(payment => payment.installmentPeriod)).toEqual(["2026-05", "2026-06", "2026-07"]);
    expect(paidInstallmentPeriods(installment, normalized).size).toBe(3);
    expect(oldestUnpaidInstallmentPeriod(installment, normalized)).toBeUndefined();
  });

  it("keeps multiple legacy catch-up payments in the same month as separate periods", () => {
    const installment = { id: "phone", name: "Phone", totalAmount: 1_500_000, monthlyAmount: 500_000, totalMonths: 3, startDate: "2026-05-01", dueDate: 20, categoryId: "food", walletId: "w1", createdAt: "", updatedAt: "" };
    const payments = [
      { ...transaction("expense", 500_000, "2026-08-01"), id: "catch-up-1", installmentId: "phone", createdAt: "2026-08-01T10:00:00.000Z" },
      { ...transaction("expense", 500_000, "2026-08-01"), id: "catch-up-2", installmentId: "phone", createdAt: "2026-08-01T10:01:00.000Z" }
    ];

    expect(normalizeInstallmentPayments(payments, [installment]).map(payment => payment.installmentPeriod)).toEqual(["2026-05", "2026-06"]);
  });

  it("preserves valid assigned periods when reconciling later app launches", () => {
    const installment = { id: "phone", name: "Phone", totalAmount: 1_500_000, monthlyAmount: 500_000, totalMonths: 3, startDate: "2026-05-01", dueDate: 20, categoryId: "food", walletId: "w1", createdAt: "", updatedAt: "" };
    const payments = [
      { ...transaction("expense", 500_000, "2026-05-20"), id: "may", installmentId: "phone", installmentPeriod: "2026-05" },
      { ...transaction("expense", 500_000, "2026-07-20"), id: "july", installmentId: "phone", installmentPeriod: "2026-07" }
    ];

    expect(normalizeInstallmentPayments(payments, [installment]).map(payment => payment.installmentPeriod)).toEqual(["2026-05", "2026-07"]);
  });
});
