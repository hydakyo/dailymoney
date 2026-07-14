import { describe, expect, it } from "vitest";
import { parseVoiceTransaction } from "./voice";
import type { Category } from "./domain";

const categories: Category[] = [
  { id: "food", kind: "expense", name: "Ăn uống", icon: "", color: "", archived: false, builtIn: true, createdAt: "" },
  { id: "transport", kind: "expense", name: "Di chuyển", icon: "", color: "", archived: false, builtIn: true, createdAt: "" },
  { id: "salary", kind: "income", name: "Lương", icon: "", color: "", archived: false, builtIn: true, createdAt: "" }
];

describe("voice transaction parser", () => {
  it("extracts a Vietnamese food expense in thousands", () => {
    expect(parseVoiceTransaction("Hôm nay cà phê 35 nghìn", categories)).toMatchObject({ kind: "expense", amount: 35_000, categoryId: "food" });
  });

  it("recognizes an income and amounts in millions", () => {
    expect(parseVoiceTransaction("Nhận lương 12 triệu", categories)).toMatchObject({ kind: "income", amount: 12_000_000, categoryId: "salary" });
  });

  it("does not mistake a spoken day for a formatted VND amount", () => {
    expect(parseVoiceTransaction("Ngày 13 tháng 7 ăn tối 64.000", categories)).toMatchObject({ amount: 64_000, categoryId: "food", date: "2026-07-13", note: "ăn tối" });
  });

  it("keeps a plain amount when the date is spoken after it", () => {
    expect(parseVoiceTransaction("Ăn tối 64000 ngày 13 tháng 7", categories)).toMatchObject({ amount: 64_000, categoryId: "food", date: "2026-07-13" });
  });
});
