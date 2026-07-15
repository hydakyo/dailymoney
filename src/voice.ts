import type { Category, Transaction } from "./domain";
import { inferCategory, inferTransactionKind } from "./category-classifier";

const normalized = (value: string) => value.toLocaleLowerCase("vi-VN").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");

function amountFromSpeech(text: string) {
  const withoutDate = normalized(text).replace(/ngay\s+\d{1,2}(?:\s+thang\s+\d{1,2})?(?:\s+nam\s+\d{4})?/g, " ");
  const candidates = Array.from(withoutDate.matchAll(/(\d[\d\s.,]*)(?:\s*(trieu|tr|nghin|ngan|k))?/g));
  if (!candidates.length) return 0;
  const match = candidates.sort((left, right) => scoreMoney(right) - scoreMoney(left))[0];
  const raw = match[1].replace(/\s/g, "");
  const number = match[2] && /^\d+[.,]\d{1,2}$/.test(raw)
    ? Number(raw.replace(",", "."))
    : Number(raw.replace(/[.,]/g, ""));
  if (!Number.isFinite(number)) return 0;
  if (match[2]?.startsWith("tr")) return number * 1_000_000;
  if (match[2]) return number * 1_000;
  return number;
}

function scoreMoney(match: RegExpMatchArray) {
  const raw = match[1];
  const hasUnit = Boolean(match[2]);
  const hasThousandsSeparator = /[.,]\d{3}(?!\d)/.test(raw);
  return (hasUnit ? 10_000 : 0) + (hasThousandsSeparator ? 1_000 : 0) + (match.index ?? 0);
}

function dateFromSpeech(text: string) {
  const fallback = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const value = normalized(text);
  if (/\b(hom qua|hqua)\b/.test(value)) {
    const yesterday = new Date(`${fallback}T00:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    return yesterday.toISOString().slice(0, 10);
  }
  const match = value.match(/ngay\s+(\d{1,2})(?:\s+thang\s+(\d{1,2})(?:\s+nam\s+(\d{4}))?)?/);
  if (!match) return fallback;
  const year = Number(match[3] ?? fallback.slice(0, 4));
  const month = Number(match[2] ?? fallback.slice(5, 7));
  const day = Number(match[1]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return fallback;
  return candidate.toISOString().slice(0, 10);
}

function noteFromSpeech(text: string) {
  return text
    .replace(/\b(hôm nay|hom nay|hqua|hôm qua)\b/gi, "")
    .replace(/\bngày\s+\d{1,2}(?:\s+tháng\s+\d{1,2})?(?:\s+năm\s+\d{4})?\b/gi, "")
    .replace(/\b\d[\d\s.,]*(?:\s*(?:triệu|tr|nghìn|ngàn|k))?\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export type VoiceParseResult = Pick<Transaction, "kind" | "amount" | "categoryId" | "date" | "note"> & {
  categoryMatched: boolean;
  categoryConfidence: "high" | "low" | "none";
};

export function parseVoiceTransaction(text: string, categories: Category[]): VoiceParseResult {
  const kind = inferTransactionKind(text);
  const category = inferCategory(text, kind, categories);

  return { 
    kind, 
    amount: amountFromSpeech(text), 
    categoryId: category.categoryId,
    date: dateFromSpeech(text), 
    note: noteFromSpeech(text) || text.trim(),
    categoryMatched: category.matched,
    categoryConfidence: category.confidence
  };
}
