import type { Category, Transaction } from "./domain";

const normalizeVietnamese = (value: string) => value
  .toLocaleLowerCase("vi-VN")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/đ/g, "d");

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

export function parseBankSms(text: string, categories: Category[]): Partial<Pick<Transaction, "kind" | "amount" | "categoryId" | "date" | "note">> {
  // Common SMS formats in Vietnam:
  // VCB: SD TK 0123... -50,000VND luc 14:00 14/07/2026. ND: thanh toan tien dien.
  // TCB: TK 1903... GD: +1,000,000VND 14/07. ND: NGUYEN VAN A chuyen tien.
  // Momo: Ban vua thanh toan 35.000d cho Cua hang A. Ngay 14/07.
  
  let kind: Transaction["kind"] = "expense";
  let amount = 0;
  let note = "";
  const date = dateFromSms(text);

  const normalized = normalizeVietnamese(text).replace(/vnd/g, "vnd");

  // Detect Kind
  if (normalized.includes("nhan") || normalized.includes("cong") || normalized.includes("+") || normalized.includes("ban duoc")) {
    kind = "income";
  }
  if (normalized.includes("tru") || normalized.includes("thanh toan") || normalized.includes("-")) {
    kind = "expense";
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

  // Category matching
  let categoryId = "";
  const expenseCategories = categories.filter(c => c.kind === kind && !c.archived);
  
  if (note) {
    const noteLower = note.toLocaleLowerCase("vi-VN");
    const normalizedNote = normalizeVietnamese(note);
    for (const cat of expenseCategories) {
      if (noteLower.includes(cat.name.toLowerCase())) {
        categoryId = cat.id;
        break;
      }
    }
    // Simple fallbacks
    if (!categoryId) {
      if (normalizedNote.includes("grab") || normalizedNote.includes("be ") || normalizedNote.includes("gojek")) {
        categoryId = expenseCategories.find(c => c.name.includes("Di chuyển"))?.id || "";
      } else if (normalizedNote.includes("shopee") || normalizedNote.includes("lazada") || normalizedNote.includes("tiki")) {
        categoryId = expenseCategories.find(c => c.name.includes("Mua sắm"))?.id || "";
      } else if (normalizedNote.includes("dien") || normalizedNote.includes("nuoc") || normalizedNote.includes("internet")) {
        categoryId = expenseCategories.find(c => c.name.includes("Nhà ở"))?.id || "";
      }
    }
  }

  if (!categoryId) {
    categoryId = expenseCategories[0]?.id ?? "";
  }

  return { kind, amount, note, date, categoryId };
}
