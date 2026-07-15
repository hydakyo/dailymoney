import type { Category, CategoryLearning, Transaction } from "./domain";

export type CategoryCandidate = { categoryId: string; confidence: "high" | "low"; learned: boolean };
export type CategoryMatch = {
  categoryId: string;
  matched: boolean;
  confidence: "high" | "low" | "none";
  candidates: CategoryCandidate[];
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

const learningStopWords = new Set([
  "hom", "nay", "qua", "toi", "minh", "da", "vua", "dung", "chi", "tien", "khoan", "giao", "dich",
  "ngay", "thang", "nam", "nghin", "ngan", "trieu", "vnd", "dong", "mua", "an", "uong", "tra", "nhan",
  "duoc", "hoan", "tk", "sd", "nd", "luc", "noi", "so", "du", "cho", "tai", "thanh", "toan", "ref"
]);

/** A compact, amount/date-free signature that can be matched next time. */
export function learningPhrase(text: string) {
  return normalizeCategoryText(text)
    .split(" ")
    .filter(token => token.length >= 2 && !/^\d+$/.test(token) && !learningStopWords.has(token))
    .slice(0, 8)
    .join(" ");
}

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
export function inferCategory(text: string, kind: Transaction["kind"], categories: Category[], learnings: CategoryLearning[] = []): CategoryMatch {
  const available = categories.filter(category => category.kind === kind && !category.archived);
  const value = normalizeCategoryText(text);
  const scores = new Map<string, { score: number; learned: boolean }>();

  for (const category of available) {
    const categoryName = normalizeCategoryText(category.name);
    let score = categoryNameScore(value, categoryName);
    const canonicalConcept = Object.entries(categoryConcepts).find(([name]) => normalizeCategoryText(name) === categoryName)?.[1] ?? [];
    for (const phrase of canonicalConcept) {
      if (includesPhrase(value, phrase)) score = Math.max(score, 90 + phrase.length);
    }
    scores.set(category.id, { score, learned: false });
  }
  for (const learning of learnings) {
    if (learning.kind !== kind || !available.some(category => category.id === learning.categoryId)) continue;
    if (!includesPhrase(value, learning.phrase)) continue;
    const current = scores.get(learning.categoryId) ?? { score: 0, learned: false };
    scores.set(learning.categoryId, { score: Math.max(current.score, 500 + Math.min(learning.uses, 99)), learned: true });
  }
  const ranked = available
    .map(category => ({ categoryId: category.id, ...(scores.get(category.id) ?? { score: 0, learned: false }) }))
    .filter(candidate => candidate.score >= 20)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);
  const candidates: CategoryCandidate[] = ranked.map(candidate => ({
    categoryId: candidate.categoryId,
    confidence: candidate.score >= 70 ? "high" : "low",
    learned: candidate.learned
  }));
  const best = ranked[0];
  if (best && best.score >= 45) {
    return { categoryId: best.categoryId, matched: true, confidence: best.score >= 70 ? "high" : "low", candidates };
  }
  const other = available.find(category => normalizeCategoryText(category.name) === "khac");
  return { categoryId: other?.id ?? "", matched: false, confidence: "none", candidates };
}

export function inferTransactionKind(text: string, learnings: CategoryLearning[] = []): Extract<Transaction["kind"], "income" | "expense"> {
  const value = normalizeCategoryText(text);
  const learned = learnings
    .filter(learning => includesPhrase(value, learning.phrase))
    .sort((left, right) => right.uses - left.uses || right.updatedAt.localeCompare(left.updatedAt))[0];
  if (learned) return learned.kind;
  const incomeSignals = ["nhan luong", "tien luong", "thu nhap", "duoc tra", "duoc hoan", "ban duoc", "ban hang", "hoan tien", "hoan tra", "thuong", "tien ve", "cong tien", "nhan tien"];
  return incomeSignals.some(signal => includesPhrase(value, signal)) || /(^|\s)(nhan|thu)(\s|$)/.test(value)
    ? "income"
    : "expense";
}
