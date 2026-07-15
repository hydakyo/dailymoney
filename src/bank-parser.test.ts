import { describe, expect, it } from "vitest";
import type { Category } from "./domain";
import { parseBankSms } from "./bank-parser";

const categories: Category[] = [
  { id: "home", kind: "expense", name: "Nhà ở", icon: "", color: "", archived: false, builtIn: true, createdAt: "" },
  { id: "shopping", kind: "expense", name: "Mua sắm", icon: "", color: "", archived: false, builtIn: true, createdAt: "" },
  { id: "salary", kind: "income", name: "Lương", icon: "", color: "", archived: false, builtIn: true, createdAt: "" }
];

describe("bank SMS parser", () => {
  it("extracts an accented debit SMS including its transaction date", () => {
    expect(parseBankSms("SD TK 0123 -50,000VND lúc 14:00 13/07/2026. ND: thanh toán tiền điện", categories)).toMatchObject({
      kind: "expense",
      amount: 50_000,
      date: "2026-07-13",
      categoryId: "home",
      note: "thanh toán tiền điện"
    });
  });

  it("recognizes accented incoming text and a two-digit year", () => {
    expect(parseBankSms("TK 1903 cộng +1.000.000 VND 14/07/26. ND: nhận lương", categories)).toMatchObject({
      kind: "income",
      amount: 1_000_000,
      date: "2026-07-14",
      categoryId: "salary"
    });
  });

  it("uses the largest formatted number when a currency marker is absent", () => {
    expect(parseBankSms("So du 1.250.000, giao dich 64.000", categories).amount).toBe(1_250_000);
  });

  it("does not silently use the first category for an unknown merchant", () => {
    const categoriesWithOther: Category[] = [
      { id: "health", kind: "expense", name: "Sức khỏe", icon: "", color: "", archived: false, builtIn: true, createdAt: "" },
      { id: "other", kind: "expense", name: "Khác", icon: "", color: "", archived: false, builtIn: true, createdAt: "" }
    ];
    expect(parseBankSms("TK -50.000 VND 14/07. ND: CUA HANG ABC", categoriesWithOther)).toMatchObject({ categoryId: "other", categoryMatched: false });
  });
});
