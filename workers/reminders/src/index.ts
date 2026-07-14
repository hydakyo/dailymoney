import webpush from "web-push";

export interface Env {
  REMINDERS: D1Database;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
}

type StoredSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  expirationTime?: number | null;
};

type ReminderRow = {
  endpoint: string;
  subscription_json: string;
  reminder_time: string;
};

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const invalid = (message: string) => json({ error: message }, 400);
const validTime = (value: unknown): value is string => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const validSubscription = (value: unknown): value is StoredSubscription => {
  if (!value || typeof value !== "object") return false;
  const subscription = value as StoredSubscription;
  return typeof subscription.endpoint === "string" && subscription.endpoint.startsWith("https://") && typeof subscription.keys?.p256dh === "string" && typeof subscription.keys?.auth === "string";
};

function vietnamNow() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? "00";
  return { date: `${value("year")}-${value("month")}-${value("day")}`, time: `${value("hour")}:${value("minute")}` };
}

async function sendReminder(env: Env, row: ReminderRow) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  try {
    await webpush.sendNotification(JSON.parse(row.subscription_json) as StoredSubscription, JSON.stringify({ title: "Daily Money", body: "Dành một phút ghi lại các khoản thu chi hôm nay.", tag: "daily-money-reminder", url: "/" }));
    return true;
  } catch (error) {
    const statusCode = error instanceof webpush.WebPushError ? error.statusCode : 0;
    if (statusCode === 404 || statusCode === 410) await env.REMINDERS.prepare("DELETE FROM subscriptions WHERE endpoint = ?").bind(row.endpoint).run();
    console.error("Unable to send reminder", statusCode || error);
    return false;
  }
}

const ALLOWED_ORIGINS = ["https://dm.kelvin.io.vn", "http://localhost:5173", "http://localhost:4173"];

async function handleApi(request: Request, env: Env, path: string) {
  const origin = request.headers.get("Origin");
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return json({ error: "Origin không được phép." }, 403);
  }

  // Preflight check
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": origin || "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (path === "/api/reminders/vapid-key" && request.method === "GET") {
    return new Response(JSON.stringify({ publicKey: env.VAPID_PUBLIC_KEY }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin || "*" },
    });
  }

  // Helper to read and limit body size to 8KB
  const readJson = async <T>() => {
    const text = await request.text();
    if (text.length > 8192) throw new Error("Payload quá lớn");
    return JSON.parse(text) as T;
  };

  if (path === "/api/reminders/subscribe" && request.method === "POST") {
    try {
      const body = await readJson<{ subscription?: unknown; time?: unknown }>();
      if (!body || !validSubscription(body.subscription) || !validTime(body.time)) return invalid("Subscription hoặc giờ nhắc không hợp lệ.");
      await env.REMINDERS.prepare("INSERT INTO subscriptions (endpoint, subscription_json, reminder_time, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(endpoint) DO UPDATE SET subscription_json = excluded.subscription_json, reminder_time = excluded.reminder_time, updated_at = excluded.updated_at").bind(body.subscription.endpoint, JSON.stringify(body.subscription), body.time).run();
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin || "*" } });
    } catch {
      return invalid("Request không hợp lệ.");
    }
  }

  if (path === "/api/reminders/unsubscribe" && request.method === "POST") {
    try {
      const body = await readJson<{ endpoint?: unknown }>();
      if (!body || typeof body.endpoint !== "string") return invalid("Endpoint không hợp lệ.");
      await env.REMINDERS.prepare("DELETE FROM subscriptions WHERE endpoint = ?").bind(body.endpoint).run();
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin || "*" } });
    } catch {
      return invalid("Request không hợp lệ.");
    }
  }

  return json({ error: "Không tìm thấy API." }, 404);
}

export default {
  fetch(request, env) {
    return handleApi(request, env, new URL(request.url).pathname);
  },
  async scheduled(_controller, env) {
    const now = vietnamNow();
    const { results = [] } = await env.REMINDERS.prepare("SELECT endpoint, subscription_json, reminder_time FROM subscriptions WHERE reminder_time = ?").bind(now.time).all<ReminderRow>();
    await Promise.all(results.map(row => sendReminder(env, row)));
  }
} satisfies ExportedHandler<Env>;
