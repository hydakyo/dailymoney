function asBufferSource(value: Uint8Array) {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}

export function toBase64(data: Uint8Array) {
  let value = "";
  data.forEach(byte => { value += String.fromCharCode(byte); });
  return btoa(value);
}

export async function hashPin(pin: string, salt: string) {
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey("raw", encoder.encode(pin), "PBKDF2", false, ["deriveKey"]);
  const digest = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: asBufferSource(fromBase64(salt)), iterations: 600_000 },
    material,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const raw = await crypto.subtle.exportKey("raw", digest);
  return Array.from(new Uint8Array(raw), item => item.toString(16).padStart(2, "0")).join("");
}

export function monthLabel(month: string) {
  const [year, value] = month.split("-");
  return `Tháng ${Number(value)}/${year}`;
}

export function addMonths(month: string, offset: number) {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(year, value - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
