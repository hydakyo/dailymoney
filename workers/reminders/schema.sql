CREATE TABLE IF NOT EXISTS subscriptions (
  endpoint TEXT PRIMARY KEY,
  subscription_json TEXT NOT NULL,
  reminder_time TEXT NOT NULL,
  last_sent_date TEXT,
  updated_at TEXT NOT NULL
);
