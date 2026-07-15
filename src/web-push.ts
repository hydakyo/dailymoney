const API_BASE = import.meta.env.VITE_REMINDER_API_BASE ?? "/api/reminders";

const base64UrlToBytes = (value: string) => {
  const padded = value + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
};

export const supportsWebPush = () => window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const payload = await response.json().catch(() => ({})) as { error?: string; publicKey?: string };
  if (!response.ok) throw new Error(payload.error ?? "Không thể kết nối dịch vụ nhắc.");
  return payload;
}

export async function setWebPushReminder(time: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Giờ nhắc không hợp lệ.");
  if (!supportsWebPush()) throw new Error("Cần mở Daily Money từ Màn hình chính trên iPhone để bật nhắc PWA.");
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") throw new Error("Bạn cần cho phép thông báo cho Daily Money trong Cài đặt iPhone.");

  const { publicKey } = await request("/vapid-key");
  if (!publicKey) throw new Error("Dịch vụ nhắc chưa được cấu hình.");
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) });
  await request("/subscribe", { method: "POST", body: JSON.stringify({ subscription: subscription.toJSON(), time }) });
}

export async function clearWebPushReminder() {
  if (!supportsWebPush()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await request("/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint: subscription.endpoint }) });
  await subscription.unsubscribe();
}
