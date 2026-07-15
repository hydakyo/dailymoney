ALTER TABLE subscriptions ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN next_retry_at TEXT;
