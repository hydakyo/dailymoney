import type { Category, Transaction } from "./domain";

export type CategoryMatch = {
  categoryId: string;
  matched: boolean;
  confidence: "high" | "low" | "none";
};

export const normalizeCategoryText = (value: string) => value
  .toLocaleLowerCase("vi-VN")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/đ/g, "d")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

// Concepts are matched to a category by name, so custom categories remain
// fully available and no UI order can silently select an unrelated category.
const categoryConcepts: Record<string, string[]> = {
  "Ăn uống": ["ca phe", "cafe", "coffee", "an sang", "an trua", "an toi", "com", "pho", "bun", "do an", "nuoc", "tra sua", "nhau", "banh", "nha hang", "quan an"],
  "Di chuyển": ["xang", "grab", "taxi", "gui xe", "xe buyt", "be", "gojek", "xanh sm", "ve xe", "tram xang"],
  "Nhà ở": ["tien nha", "thue nha", "dien", "nuoc", "internet", "wifi", "rac", "chung cu"],
  "Hóa đơn": ["hoa don", "dien", "nuoc", "internet", "wifi", "dien thoai", "bao hiem"],
  "Mua sắm": ["mua", "sieu thi", "quan ao", "giay dep", "shopee", "lazada", "tiki", "tiktok shop", "cho"],
  "Sức khỏe": ["thuoc", "benh vien", "kham", "nha khoa", "phong kham", "xet nghiem"],
  "Giải trí": ["phim", "game", "giai tri", "netflix", "du lich", "nhac", "spotify", "karaoke"],
  "Giáo dục": ["hoc", "sach", "vo", "but", "hoc phi", "khoa hoc"],
  "Gia đình": ["gia dinh", "con cai", "bo me", "vo chong"],
  "Lương": ["luong", "thuong", "nhan luong", "tien luong", "salary", "thu nhap"],
  "Bán hàng": ["ban hang", "ban duoc", "doanh thu", "khach chuyen"],
  "Thưởng": ["thuong", "bonus", "hoa hong", "commission"],
  "Quà tặng": ["qua", "mung", "bieu", "phong bi", "chuc mung", "lixi"],
  "Khác": []
};

function includesPhrase(text: string, phrase: string) {
  return ` ${text} `.includes(` ${phrase} `);
}

function categoryNameScore(text: string, name: string) {
  if (!name || name === "khac") return 0;
  if (includesPhrase(text, name)) return 100 + name.length;
  const meaningfulTokens = name.split(" ").filter(token => token.length >= 3);
  const matchedTokens = meaningfulTokens.filter(token => includesPhrase(text, token));
  if (!matchedTokens.length) return 0;
  return matchedTokens.length === meaningfulTokens.length
    ? 70 + matchedTokens.join("").length
    : matchedTokens.length * 12;
}

/**
 * Selects only among every active category of the requested kind. Unknown
 * language goes to that kind's explicit “Khác” category, never array index 0.
 */
export function inferCategory(text: string, kind: Transaction["kind"], categories: Category[]): CategoryMatch {
  const available = categories.filter(category => category.kind === kind && !category.archived);
  const value = normalizeCategoryText(text);
  let best: { categoryId: string; score: number } | undefined;

  for (const category of available) {
    const categoryName = normalizeCategoryText(category.name);
    let score = categoryNameScore(value, categoryName);
    const canonicalConcept = Object.entries(categoryConcepts).find(([name]) => normalizeCategoryText(name) === categoryName)?.[1] ?? [];
    for (const phrase of canonicalConcept) {
      if (includesPhrase(value, phrase)) score = Math.max(score, 90 + phrase.length);
    }
    if (!best || score > best.score) best = { categoryId: category.id, score };
  }

  if (best && best.score >= 45) {
    return { categoryId: best.categoryId, matched: true, confidence: best.score >= 70 ? "high" : "low" };
  }
  const other = available.find(category => normalizeCategoryText(category.name) === "khac");
  return { categoryId: other?.id ?? "", matched: false, confidence: "none" };
}

export function inferTransactionKind(text: string): Extract<Transaction["kind"], "income" | "expense"> {
  const value = normalizeCategoryText(text);
  const incomeSignals = ["nhan luong", "tien luong", "thu nhap", "duoc tra", "ban duoc", "ban hang", "hoan tien", "hoan tra", "thuong", "tien ve", "cong tien", "nhan tien"];
  return incomeSignals.some(signal => includesPhrase(value, signal)) || /(^|\s)(nhan|thu)(\s|$)/.test(value)
    ? "income"
    : "expense";
}
