import type {
  NotificationChannel,
  NotificationDeliveryRow,
  NotificationEventRow,
} from "./types";

export interface NotificationTarget {
  id: string;
  name: string | null;
}

const MAX_ERROR_LENGTH = 1_000;

export async function ensureNotificationEvent(
  db: D1Database,
  incidentId: number,
  channel: NotificationChannel
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO notification_events (incident_id, channel)
       VALUES (?, ?)`
    )
    .bind(incidentId, channel)
    .run();
}

export async function getDueNotificationEvents(
  db: D1Database,
  incidentId: number,
  nowIso: string
): Promise<NotificationEventRow[]> {
  const result = await db
    .prepare(
      `SELECT id, incident_id, channel, status, attempts, next_attempt_at, last_error
       FROM notification_events
       WHERE incident_id = ?
         AND status = 'pending'
         AND next_attempt_at <= ?
       ORDER BY id`
    )
    .bind(incidentId, nowIso)
    .all<NotificationEventRow>();

  return result.results;
}

export async function insertNotificationTargets(
  db: D1Database,
  incidentId: number,
  channel: NotificationChannel,
  targets: NotificationTarget[]
): Promise<void> {
  if (targets.length === 0) return;

  const stmt = db.prepare(
    `INSERT OR IGNORE INTO notification_deliveries
       (incident_id, channel, target_id, target_name)
     VALUES (?, ?, ?, ?)`
  );

  await db.batch(
    targets.map((target) =>
      stmt.bind(incidentId, channel, target.id, target.name)
    )
  );
}

export async function markEventDiscovered(
  db: D1Database,
  eventId: number,
  completed: boolean
): Promise<void> {
  const status = completed ? "completed" : "discovered";
  await db
    .prepare(
      `UPDATE notification_events
       SET status = ?, last_error = NULL,
           updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE id = ? AND status = 'pending'`
    )
    .bind(status, eventId)
    .run();
}

export async function scheduleEventRetry(
  db: D1Database,
  eventId: number,
  attempts: number,
  nextAttemptAt: string,
  error: string
): Promise<void> {
  await db
    .prepare(
      `UPDATE notification_events
       SET attempts = ?, next_attempt_at = ?, last_error = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE id = ? AND status = 'pending'`
    )
    .bind(attempts, nextAttemptAt, truncateError(error), eventId)
    .run();
}

export async function markEventFailedFinal(
  db: D1Database,
  eventId: number,
  attempts: number,
  error: string
): Promise<void> {
  await db
    .prepare(
      `UPDATE notification_events
       SET status = 'failed_final', attempts = ?, last_error = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE id = ? AND status = 'pending'`
    )
    .bind(attempts, truncateError(error), eventId)
    .run();
}

export async function getDueNotificationDeliveries(
  db: D1Database,
  incidentId: number,
  nowIso: string,
  staleBeforeIso: string
): Promise<NotificationDeliveryRow[]> {
  const result = await db
    .prepare(
      `SELECT id, incident_id, channel, target_id, target_name, status,
              attempts, next_attempt_at, processing_started_at, last_error
       FROM notification_deliveries
       WHERE incident_id = ?
         AND (
           (status = 'pending' AND next_attempt_at <= ?)
           OR (status = 'processing' AND processing_started_at <= ?)
         )
       ORDER BY id`
    )
    .bind(incidentId, nowIso, staleBeforeIso)
    .all<NotificationDeliveryRow>();

  return result.results;
}

export async function claimNotificationDelivery(
  db: D1Database,
  deliveryId: number,
  nowIso: string,
  staleBeforeIso: string
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE notification_deliveries
       SET status = 'processing', processing_started_at = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE id = ?
         AND (
           (status = 'pending' AND next_attempt_at <= ?)
           OR (status = 'processing' AND processing_started_at <= ?)
         )`
    )
    .bind(nowIso, deliveryId, nowIso, staleBeforeIso)
    .run();

  return (result.meta.changes ?? 0) === 1;
}

export async function markDeliverySent(
  db: D1Database,
  deliveryId: number,
  providerMessageId: string | null
): Promise<void> {
  await db
    .prepare(
      `UPDATE notification_deliveries
       SET status = 'sent', provider_message_id = ?, last_error = NULL,
           processing_started_at = NULL,
           sent_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
           updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE id = ? AND status = 'processing'`
    )
    .bind(providerMessageId, deliveryId)
    .run();
}

export async function markDeliveryFailed(
  db: D1Database,
  deliveryId: number,
  attempts: number,
  retryable: boolean,
  nextAttemptAt: string,
  error: string
): Promise<void> {
  await db
    .prepare(
      `UPDATE notification_deliveries
       SET status = ?, attempts = ?, next_attempt_at = ?, last_error = ?,
           processing_started_at = NULL,
           updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE id = ? AND status = 'processing'`
    )
    .bind(
      retryable ? "pending" : "failed_final",
      attempts,
      nextAttemptAt,
      truncateError(error),
      deliveryId
    )
    .run();
}

export async function finalizeNotificationEvents(
  db: D1Database,
  incidentId: number
): Promise<void> {
  await db
    .prepare(
      `UPDATE notification_events AS event
       SET status = 'completed',
           updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE event.incident_id = ?
         AND event.status = 'discovered'
         AND NOT EXISTS (
           SELECT 1 FROM notification_deliveries AS delivery
           WHERE delivery.incident_id = event.incident_id
             AND delivery.channel = event.channel
             AND delivery.status IN ('pending', 'processing')
         )`
    )
    .bind(incidentId)
    .run();
}

export async function cancelIncidentNotifications(
  db: D1Database,
  incidentId: number
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `UPDATE notification_deliveries
         SET status = 'canceled', processing_started_at = NULL,
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         WHERE incident_id = ? AND status IN ('pending', 'processing')`
      )
      .bind(incidentId),
    db
      .prepare(
        `UPDATE notification_events
         SET status = 'canceled',
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         WHERE incident_id = ? AND status IN ('pending', 'discovered')`
      )
      .bind(incidentId),
  ]);
}

function truncateError(error: string): string {
  return error.slice(0, MAX_ERROR_LENGTH);
}
