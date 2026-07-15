-- Reliable per-incident notification outbox for WhatsApp and Telegram.
-- Apply before deploying Worker code that reads these tables:
--   npx wrangler d1 execute sigaa-caiu-ufg-db --local  --file=schema_migration_notifications.sql
--   npx wrangler d1 execute sigaa-caiu-ufg-db --remote --file=schema_migration_notifications.sql

CREATE TABLE IF NOT EXISTS notification_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id     INTEGER NOT NULL,
  channel         TEXT    NOT NULL CHECK (channel IN ('whatsapp', 'telegram')),
  status          TEXT    NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'discovered', 'completed', 'failed_final', 'canceled')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  last_error      TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (incident_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_notification_events_due
  ON notification_events(incident_id, status, next_attempt_at);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id           INTEGER NOT NULL,
  channel               TEXT    NOT NULL CHECK (channel IN ('whatsapp', 'telegram')),
  target_id             TEXT    NOT NULL,
  target_name           TEXT,
  status                TEXT    NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'processing', 'sent', 'failed_final', 'canceled')),
  attempts              INTEGER NOT NULL DEFAULT 0,
  next_attempt_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  processing_started_at TEXT,
  last_error            TEXT,
  provider_message_id   TEXT,
  sent_at               TEXT,
  created_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (incident_id, channel, target_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_due
  ON notification_deliveries(incident_id, status, next_attempt_at);
