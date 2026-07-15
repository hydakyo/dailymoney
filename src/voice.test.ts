import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { parseVoiceTransaction } from "./voice";
import type { Category } from "./domain";

const categories: Category[] = [
  { id: "food", kind: "expense", name: "Ăn uống", icon: "", color: "", archived: false, builtIn: true, createdAt: "" },
  { id: "transport", kind: "expense", name: "Di chuyển", icon: "", color: "", archived: false, builtIn: true, createdAt: "" },
  { id: "salary", kind: "income", name: "Lương", icon: "", color: "", archived: false, builtIn: true, createdAt: "" }
];

describe("voice transaction parser", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T05:00:00.000Z"));
  });

  afterAll(() => vi.useRealTimers());

  it("extracts a Vietnamese food expense in thousands", () => {
    expect(parseVoiceTransaction("Hôm nay cà phê 35 nghìn", categories)).toMatchObject({ kind: "expense", amount: 35_000, categoryId: "food" });
  });

  it("recognizes an income and amounts in millions", () => {
    expect(parseVoiceTransaction("Nhận lương 12 triệu", categories)).toMatchObject({ kind: "income", amount: 12_000_000, categoryId: "salary" });
  });

  it("recognizes a plain received amount as income", () => {
    expect(parseVoiceTransaction("Nhận 500 nghìn", categories)).toMatchObject({ kind: "income" });
  });

  it("understands refund and debt-payment wording", () => {
    expect(parseVoiceTransaction("Được hoàn 200 nghìn tiền Grab", categories)).toMatchObject({ kind: "income", amount: 200_000 });
    expect(parseVoiceTransaction("Trả nợ anh An 500 nghìn", categories)).toMatchObject({ kind: "expense", amount: 500_000 });
  });

  it("does not mistake a spoken day for a formatted VND amount", () => {
    expect(parseVoiceTransaction("Ngày 13 tháng 7 ăn tối 64.000", categories)).toMatchObject({ amount: 64_000, categoryId: "food", date: "2026-07-13", note: "ăn tối" });
  });

  it("keeps a plain amount when the date is spoken after it", () => {
    expect(parseVoiceTransaction("Ăn tối 64000 ngày 13 tháng 7", categories)).toMatchObject({ amount: 64_000, categoryId: "food", date: "2026-07-13" });
  });

  it("understands decimal millions from speech recognition", () => {
    expect(parseVoiceTransaction("Nhận lương 1,5 triệu", categories)).toMatchObject({ kind: "income", amount: 1_500_000, categoryId: "salary" });
  });

  it("uses yesterday in the Vietnam timezone", () => {
    expect(parseVoiceTransaction("Hôm qua cà phê 35 nghìn", categories)).toMatchObject({ amount: 35_000, categoryId: "food", date: "2026-07-13" });
  });

  it("matches every active custom category instead of a fixed built-in subset", () => {
    const customCategories: Category[] = [
      { id: "health", kind: "expense", name: "Sức khỏe", icon: "", color: "", archived: false, builtIn: true, createdAt: "" },
      { id: "coffee", kind: "expense", name: "Cà phê", icon: "", color: "", archived: false, builtIn: false, createdAt: "" },
      { id: "other", kind: "expense", name: "Khác", icon: "", color: "", archived: false, builtIn: true, createdAt: "" }
    ];
    expect(parseVoiceTransaction("Uống cà phê 35 nghìn", customCategories)).toMatchObject({ categoryId: "coffee", categoryMatched: true });
  });

  it("falls back only to the explicit other category when it cannot classify", () => {
    const categoriesWithOther: Category[] = [
      { id: "health", kind: "expense", name: "Sức khỏe", icon: "", color: "", archived: false, builtIn: true, createdAt: "" },
      { id: "other", kind: "expense", name: "Khác", icon: "", color: "", archived: false, builtIn: true, createdAt: "" }
    ];
    expect(parseVoiceTransaction("Mua đồ lặt vặt 25 nghìn", categoriesWithOther)).toMatchObject({ categoryId: "other", categoryMatched: false });
  });
});
