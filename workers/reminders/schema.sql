CREATE TABLE IF NOT EXISTS subscriptions (
  endpoint TEXT PRIMARY KEY,
  subscription_json TEXT NOT NULL,
  reminder_time TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
