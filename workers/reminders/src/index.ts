import webpush from "web-push";

export interface Env {
  REMINDERS: D1Database;
  SUBSCRIPTION_LIMITER: RateLimit;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  MAX_SUBSCRIPTIONS?: string;
  ALLOWED_ORIGINS?: string;
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

const getMaxSubscriptions = (env: Env) => Number(env.MAX_SUBSCRIPTIONS) || 1000;

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const invalid = (message: string) => json({ error: message }, 400);
const validTime = (value: unknown): value is string => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
function vietnamNow() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? "00";
  return { date: `${value("year")}-${value("month")}-${value("day")}`, time: `${value("hour")}:${value("minute")}` };
}

async function sendReminder(env: Env, row: ReminderRow, date: string) {
  // Claim the reminder before sending so cron retries or overlapping runs cannot
  // deliver the same daily notification twice to an endpoint.
  const claim = await env.REMINDERS.prepare("UPDATE subscriptions SET last_sent_date = ? WHERE endpoint = ? AND (last_sent_date IS NULL OR last_sent_date <> ?)")
    .bind(date, row.endpoint, date)
    .run();
  if (!claim.meta.changes) return false;

  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  try {
    await webpush.sendNotification(JSON.parse(row.subscription_json) as StoredSubscription, JSON.stringify({ title: "Daily Money", body: "Dành một phút ghi lại các khoản thu chi hôm nay.", tag: "daily-money-reminder", url: "/" }));
    return true;
  } catch (error) {
    const statusCode = error instanceof webpush.WebPushError ? error.statusCode : 0;
    if (statusCode === 404 || statusCode === 410) await env.REMINDERS.prepare("DELETE FROM subscriptions WHERE endpoint = ?").bind(row.endpoint).run();
    else await env.REMINDERS.prepare("UPDATE subscriptions SET last_sent_date = NULL WHERE endpoint = ? AND last_sent_date = ?").bind(row.endpoint, date).run();
    console.error("Unable to send reminder", statusCode || error);
    return false;
  }
}

const getAllowedOrigins = (env: Env) => {
  if (env.ALLOWED_ORIGINS) return env.ALLOWED_ORIGINS.split(",");
  return ["https://dm.kelvin.io.vn", "http://localhost:5173", "http://localhost:4173"];
};

// Validate subscription more strictly
function validSubscriptionStrict(value: unknown): value is StoredSubscription {
  if (!value || typeof value !== "object") return false;
  const subscription = value as { endpoint?: unknown; keys?: unknown };
  if (typeof subscription.endpoint !== "string" || !subscription.endpoint.startsWith("https://") || subscription.endpoint.length > 2048) return false;
  if (!subscription.keys || typeof subscription.keys !== "object") return false;
  const keys = subscription.keys as { p256dh?: unknown; auth?: unknown };
  if (typeof keys.p256dh !== "string" || keys.p256dh.length > 256) return false;
  if (typeof keys.auth !== "string" || keys.auth.length > 128) return false;
  return true;
}

async function handleApi(request: Request, env: Env, path: string) {
  const origin = request.headers.get("Origin");
  if (!origin || !getAllowedOrigins(env).includes(origin)) {
    return json({ error: "Origin không được phép." }, 403);
  }

  // Preflight check
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (path === "/api/reminders/vapid-key" && request.method === "GET") {
    return new Response(JSON.stringify({ publicKey: env.VAPID_PUBLIC_KEY }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin },
    });
  }

  // Helper to read and limit body size to 8KB
  const readJson = async <T>() => {
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > 8192) throw new Error("Payload quá lớn");
    const text = await request.text();
    if (text.length > 8192) throw new Error("Payload quá lớn");
    return JSON.parse(text) as T;
  };

  if (path === "/api/reminders/subscribe" && request.method === "POST") {
    try {
      const clientKey = request.headers.get("cf-connecting-ip") ?? "unknown-client";
      const limit = await env.SUBSCRIPTION_LIMITER.limit({ key: `subscribe:${clientKey}` });
      if (!limit.success) return json({ error: "Bạn đã thao tác quá nhanh. Vui lòng thử lại sau một phút." }, 429);
      const body = await readJson<{ subscription?: unknown; time?: unknown }>();
      if (!body || !validSubscriptionStrict(body.subscription) || !validTime(body.time)) return invalid("Subscription hoặc giờ nhắc không hợp lệ.");
      const result = await env.REMINDERS.prepare("INSERT INTO subscriptions (endpoint, subscription_json, reminder_time, updated_at) SELECT ?, ?, ?, datetime('now') WHERE EXISTS (SELECT 1 FROM subscriptions WHERE endpoint = ?) OR (SELECT COUNT(*) FROM subscriptions) < ? ON CONFLICT(endpoint) DO UPDATE SET subscription_json = excluded.subscription_json, reminder_time = excluded.reminder_time, updated_at = excluded.updated_at")
        .bind(body.subscription.endpoint, JSON.stringify(body.subscription), body.time, body.subscription.endpoint, getMaxSubscriptions(env))
        .run();
      if (!result.meta.changes) return json({ error: "Dịch vụ reminder đang đạt giới hạn vận hành. Vui lòng thử lại sau." }, 503);
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin } });
    } catch {
      return invalid("Request không hợp lệ.");
    }
  }

  if (path === "/api/reminders/unsubscribe" && request.method === "POST") {
    try {
      const clientKey = request.headers.get("cf-connecting-ip") ?? "unknown-client";
      const limit = await env.SUBSCRIPTION_LIMITER.limit({ key: `unsubscribe:${clientKey}` });
      if (!limit.success) return json({ error: "Bạn đã thao tác quá nhanh. Vui lòng thử lại sau một phút." }, 429);
      const body = await readJson<{ endpoint?: unknown }>();
      if (!body || typeof body.endpoint !== "string" || body.endpoint.length > 2048) return invalid("Endpoint không hợp lệ.");
      await env.REMINDERS.prepare("DELETE FROM subscriptions WHERE endpoint = ?").bind(body.endpoint).run();
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin } });
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
    await Promise.all(results.map(row => sendReminder(env, row, now.date)));
  }
} satisfies ExportedHandler<Env>;
