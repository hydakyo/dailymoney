import type { BackupPayloadV1 } from "./domain";

export interface EncryptedBackup {
  format: "daily-money-encrypted";
  version: 1;
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: number; salt: string };
  cipher: { name: "AES-GCM"; iv: string; ciphertext: string };
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ITERATIONS = 310_000;

function toBase64(data: Uint8Array) {
  let value = "";
  data.forEach(byte => { value += String.fromCharCode(byte); });
  return btoa(value);
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}

function asBufferSource(value: Uint8Array) {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

async function keyFromPassword(password: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: asBufferSource(salt), iterations }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function encryptBackup(payload: BackupPayloadV1, password: string): Promise<EncryptedBackup> {
  if (password.length < 10) throw new Error("Mật khẩu backup cần ít nhất 10 ký tự.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFromPassword(password, salt, ITERATIONS);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: asBufferSource(iv) }, key, encoder.encode(JSON.stringify(payload)));
  return {
    format: "daily-money-encrypted", version: 1,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: ITERATIONS, salt: toBase64(salt) },
    cipher: { name: "AES-GCM", iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) }
  };
}

export async function decryptBackup(value: EncryptedBackup, password: string): Promise<BackupPayloadV1> {
  if (value.format !== "daily-money-encrypted" || value.version !== 1) throw new Error("File backup không đúng định dạng Daily Money.");
  try {
    const key = await keyFromPassword(password, fromBase64(value.kdf.salt), value.kdf.iterations);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: asBufferSource(fromBase64(value.cipher.iv)) }, key, asBufferSource(fromBase64(value.cipher.ciphertext)));
    const payload = JSON.parse(decoder.decode(plain)) as BackupPayloadV1;
    if (payload.schemaVersion !== 1 || !payload.settings || !Array.isArray(payload.transactions)) throw new Error("Nội dung backup không hợp lệ.");
    return payload;
  } catch {
    throw new Error("Không thể mở backup. Kiểm tra lại mật khẩu hoặc file.");
  }
}

export function downloadFile(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function transactionsCsv(rows: Array<{ date: string; kind: string; category: string; amount: number; note?: string }>) {
  const escape = (value: string | number | undefined) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return "\uFEFFNgày,Loại,Danh mục,Số tiền,Ghi chú\n" + rows.map(row => [row.date, row.kind === "income" ? "Thu" : "Chi", row.category, row.amount, row.note].map(escape).join(",")).join("\n");
}
