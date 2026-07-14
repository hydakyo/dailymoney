import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

const DAILY_REMINDER_ID = 4101;

export const isNativeApp = () => Capacitor.isNativePlatform();

export async function setDailyReminder(time: string) {
  if (!isNativeApp()) throw new Error("Nhắc cục bộ chỉ có trong bản Daily Money native cho iPhone.");

  const current = await LocalNotifications.checkPermissions();
  const permission = current.display === "prompt" ? await LocalNotifications.requestPermissions() : current;
  if (permission.display !== "granted") throw new Error("Bạn cần cho phép thông báo trong Cài đặt iPhone.");

  const [hour, minute] = time.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) throw new Error("Giờ nhắc không hợp lệ.");

  await LocalNotifications.cancel({ notifications: [{ id: DAILY_REMINDER_ID }] });
  await LocalNotifications.schedule({
    notifications: [{
      id: DAILY_REMINDER_ID,
      title: "Daily Money",
      body: "Dành một phút ghi lại các khoản thu chi hôm nay.",
      schedule: { on: { hour, minute }, repeats: true },
      extra: { route: "home" }
    }]
  });
}

export async function clearDailyReminder() {
  if (!isNativeApp()) return;
  await LocalNotifications.cancel({ notifications: [{ id: DAILY_REMINDER_ID }] });
}
