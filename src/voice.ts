import type { Category, Transaction } from "./domain";

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

// Map synonyms directly to logical concepts instead of hardcoded UI names
const categorySynonyms: Record<string, string[]> = {
  "Ăn uống": ["ca phe", "cafe", "an sang", "an trua", "an toi", "com", "pho", "bun", "do an", "nuoc", "tra sua", "an", "nhau", "banh"],
  "Di chuyển": ["xang", "grab", "taxi", "gui xe", "xe buyt", "be", "gojek", "xe", "ve xe"],
  "Nhà ở": ["tien nha", "thue nha", "dien", "nuoc", "internet", "wifi", "rac"],
  "Mua sắm": ["mua", "sieu thi", "quan ao", "giay dep", "shopee", "lazada", "tiki", "taom", "cho"],
  "Sức khỏe": ["thuoc", "benh vien", "kham", "nha khoa", "phong kham"],
  "Giải trí": ["phim", "game", "giai tri", "netflix", "xem", "choi", "du lich", "nhac", "spotify"],
  "Giáo dục": ["hoc", "sach", "vo", "but", "hoc phi"],
  "Lương": ["luong", "thuong", "nhan luong"],
  "Quà tặng": ["qua", "mung", "bieu", "phong bi", "chuc mung"]
};

function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;
  let match = 0;
  const hash_s1 = new Array(len1).fill(0);
  const hash_s2 = new Array(len2).fill(0);
  const max_dist = Math.floor(Math.max(len1, len2) / 2) - 1;
  for (let i = 0; i < len1; i++) {
    for (let j = Math.max(0, i - max_dist); j < Math.min(len2, i + max_dist + 1); j++) {
      if (s1[i] === s2[j] && hash_s2[j] === 0) {
        hash_s1[i] = 1;
        hash_s2[j] = 1;
        match++;
        break;
      }
    }
  }
  if (match === 0) return 0;
  let t = 0;
  let point = 0;
  for (let i = 0; i < len1; i++) {
    if (hash_s1[i]) {
      while (hash_s2[point] === 0) point++;
      if (s1[i] !== s2[point++]) t++;
    }
  }
  t /= 2;
  return (match / len1 + match / len2 + (match - t) / match) / 3.0;
}

export function parseVoiceTransaction(text: string, categories: Category[]): Pick<Transaction, "kind" | "amount" | "categoryId" | "date" | "note"> {
  const value = normalized(text);
  const kind: Transaction["kind"] = /\b(nhan|thu|luong|ban duoc|hoan tien|duoc tra)\b/.test(value) ? "income" : "expense";
  
  const available = categories.filter(category => category.kind === kind && !category.archived);
  let bestMatchId = available[0]?.id ?? "";
  let bestScore = 0;

  // 1. Direct synonym match
  for (const [key, words] of Object.entries(categorySynonyms)) {
    if (words.some(word => value.includes(word))) {
      // Find category with this exact name or fuzzy match
      const cat = available.find(c => normalized(c.name) === normalized(key));
      if (cat) {
        bestMatchId = cat.id;
        bestScore = 2; // high score for direct synonym map
        break;
      }
    }
  }

  // 2. Fuzzy match against all available categories' names if no direct synonym hit
  if (bestScore === 0) {
    const tokens = value.split(" ");
    for (const category of available) {
      const catNorm = normalized(category.name);
      if (value.includes(catNorm)) {
        bestScore = 1.5;
        bestMatchId = category.id;
        break;
      }
      for (const token of tokens) {
        if (token.length < 3) continue;
        const score = jaroWinkler(token, catNorm);
        if (score > 0.85 && score > bestScore) {
          bestScore = score;
          bestMatchId = category.id;
        }
      }
    }
  }

  // 3. Fallback to "Khác" if very low confidence
  if (bestScore < 0.6) {
    const otherCat = available.find(category => normalized(category.name).includes("khac"));
    if (otherCat) bestMatchId = otherCat.id;
  }

  return { 
    kind, 
    amount: amountFromSpeech(text), 
    categoryId: bestMatchId, 
    date: dateFromSpeech(text), 
    note: noteFromSpeech(text) || text.trim() 
  };
}
