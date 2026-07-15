import type { AppSettings } from "./domain";
import { hashLegacyPin, hashPin, timingSafeEqual } from "./utils";

function isLegacySalt(salt: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(salt);
}

export async function verifySettingsPin(pin: string, settings: AppSettings) {
  if (!settings.pinHash || !settings.pinSalt) return false;
  const hashed = isLegacySalt(settings.pinSalt)
    ? await hashLegacyPin(pin, settings.pinSalt)
    : await hashPin(pin, settings.pinSalt);
  return timingSafeEqual(hashed, settings.pinHash);
}

/**
 * Guard a destructive local reset. A configured PIN is always required; if
 * storage is so damaged that the PIN cannot be read, a deliberate typed phrase
 * is the recovery-only fallback to prevent accidental taps.
 */
export async function confirmDeviceDataDeletion(settings?: AppSettings): Promise<boolean> {
  if (settings?.lockEnabled && settings.pinHash && settings.pinSalt) {
    const pin = window.prompt("Nhập mã PIN 6 số để xóa vĩnh viễn toàn bộ dữ liệu trên thiết bị.");
    if (pin === null) return false;
    if (!/^\d{6}$/.test(pin) || !(await verifySettingsPin(pin, settings))) {
      window.alert("Mã PIN không đúng. Dữ liệu chưa bị xóa.");
      return false;
    }
    return window.confirm("PIN đã xác thực. Xóa vĩnh viễn toàn bộ dữ liệu Daily Money trên thiết bị này?");
  }

  const phrase = window.prompt("Không có PIN khả dụng để xác thực. Để tránh xóa nhầm, hãy nhập chính xác: XÓA DỮ LIỆU");
  if (phrase !== "XÓA DỮ LIỆU") {
    if (phrase !== null) window.alert("Cụm xác nhận không đúng. Dữ liệu chưa bị xóa.");
    return false;
  }
  return window.confirm("Xác nhận lần cuối: xóa vĩnh viễn toàn bộ dữ liệu Daily Money trên thiết bị này?");
}
