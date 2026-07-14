import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppData } from "./store";
import { generateAdvice } from "./advisor";

afterEach(() => vi.useRealTimers());

describe("home advisor cash-flow signals", () => {
  it("prioritizes an early cash shortfall over a generic stable assessment", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T12:00:00.000Z"));
    const data: AppData = {
      settings: { id: "settings", onboardingComplete: true, openingBalance: 0, currency: "VND", lockEnabled: false, createdAt: "", updatedAt: "" },
      wallets: [{ id: "wallet", name: "Ví chính", icon: "Wallet", color: "#000", initialBalance: -900_000, archived: false, createdAt: "", updatedAt: "" }],
      categories: [{ id: "home", kind: "expense", name: "Nhà ở", icon: "House", color: "#000", archived: false, builtIn: true, financialClass: "essential", createdAt: "" }],
      transactions: [{ id: "income", kind: "income", amount: 1_000_000, categoryId: "home", walletId: "wallet", date: "2026-07-01", createdAt: "", updatedAt: "" }], budgets: [], occurrences: [], debts: [], payments: [], goals: [], goalEntries: [], installments: [],
      rules: [
        { id: "bill", kind: "expense", amount: 200_000, categoryId: "home", walletId: "wallet", frequency: "monthly", interval: 1, dayOfMonth: 15, startDate: "2026-07-15", nextDueDate: "2026-07-15", active: true, createdAt: "", updatedAt: "" },
        { id: "salary", kind: "income", amount: 300_000, categoryId: "home", walletId: "wallet", frequency: "monthly", interval: 1, dayOfMonth: 30, startDate: "2026-07-30", nextDueDate: "2026-07-30", active: true, createdAt: "", updatedAt: "" }
      ]
    };

    const advice = generateAdvice(data, "2026-07");

    expect(advice[0]).toMatchObject({ id: "cash_flow_shortfall", level: "danger" });
    expect(advice.some(item => item.id === "all_good")).toBe(false);
    expect(advice.some(item => item.id === "high_savings")).toBe(false);
  });
});
