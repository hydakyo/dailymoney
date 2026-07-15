import type { Category, Transaction } from "./domain";
import { inferCategory, normalizeCategoryText } from "./category-classifier";

const normalizeVietnamese = normalizeCategoryText;

function dateFromSms(text: string) {
  const fallback = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const match = text.match(/(?:^|\D)(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?(?!\d)/);
  if (!match) return fallback;
  const currentYear = Number(fallback.slice(0, 4));
  const day = Number(match[1]);
  const month = Number(match[2]);
  const spokenYear = match[3] ? Number(match[3]) : currentYear;
  const year = spokenYear < 100 ? 2000 + spokenYear : spokenYear;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return fallback;
  return candidate.toISOString().slice(0, 10);
}

export type BankSmsParseResult = Pick<Transaction, "kind" | "amount" | "categoryId" | "date" | "note"> & {
  categoryMatched: boolean;
  categoryConfidence: "high" | "low" | "none";
};

export function parseBankSms(text: string, categories: Category[]): BankSmsParseResult {
  // Common SMS formats in Vietnam:
  // VCB: SD TK 0123... -50,000VND luc 14:00 14/07/2026. ND: thanh toan tien dien.
  // TCB: TK 1903... GD: +1,000,000VND 14/07. ND: NGUYEN VAN A chuyen tien.
  // Momo: Ban vua thanh toan 35.000d cho Cua hang A. Ngay 14/07.
  
  let kind: Transaction["kind"] = "expense";
  let amount = 0;
  let note = "";
  const date = dateFromSms(text);

  const normalized = normalizeVietnamese(text).replace(/vnd/g, "vnd");

  // A signed bank amount is more reliable than wording in a merchant note.
  const signedAmount = text.match(/([+-])\s*\d/)?.[1];
  if (signedAmount === "+") {
    kind = "income";
  } else if (signedAmount === "-" || normalized.includes("tru") || normalized.includes("thanh toan")) {
    kind = "expense";
  } else if (/(^|\s)(nhan|cong)(\s|$)|ban duoc|hoan tien/.test(normalized)) {
    kind = "income";
  }

  // Detect Amount
  // Match +50,000 or -50.000 or 50.000VND or 50,000 d
  const amountMatch = text.match(/([+-]?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)\s*(vnd|d|vnđ)/i);
  if (amountMatch) {
    const rawAmount = amountMatch[1].replace(/[.,\s+-]/g, "");
    amount = Number(rawAmount);
  } else {
    // Try just finding the largest formatted number, not the first account/date fragment.
    const numbers = Array.from(text.matchAll(/(?<!\d)(\d{1,3}(?:[.,]\d{3})+)(?!\d)/g));
    if (numbers.length > 0) {
      amount = Math.max(...numbers.map(item => Number(item[1].replace(/[.,]/g, ""))));
    }
  }

  // Detect Note (usually after "ND:", "Nội dung:", "Ref:", "Mess:")
  const noteMatch = text.match(/(?:^|[\s.;-])(?:nd|nội dung|noi dung|ref|mess|msg)\s*:\s*(.+)$/i);
  if (noteMatch) {
    note = noteMatch[1].trim();
  } else {
    note = text.substring(0, 50) + (text.length > 50 ? "..." : ""); // fallback
  }

  const category = inferCategory(note || text, kind, categories);

  return { kind, amount, note, date, categoryId: category.categoryId, categoryMatched: category.matched, categoryConfidence: category.confidence };
}
