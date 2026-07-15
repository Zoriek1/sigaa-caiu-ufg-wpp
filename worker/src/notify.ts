import type {
  Env,
  IncidentTransition,
  NotificationChannel,
  NotificationDeliveryRow,
  NotificationEventRow,
} from "./types";
import { getOpenIncident } from "./db";
import {
  ProviderRequestError,
  fetchEvolutionGroups,
  normalizeEvolutionBaseUrl,
  sendEvolutionText,
  type EvolutionConfig,
} from "./evolution";
import {
  cancelIncidentNotifications,
  claimNotificationDelivery,
  ensureNotificationEvent,
  finalizeNotificationEvents,
  getDueNotificationDeliveries,
  getDueNotificationEvents,
  insertNotificationTargets,
  markDeliveryFailed,
  markDeliverySent,
  markEventDiscovered,
  markEventFailedFinal,
  scheduleEventRetry,
} from "./notification-outbox";

export const OUTAGE_MESSAGE =
  "🚨 O SIGAA caiu!\n\n" +
  "O SIGAA da UFG está fora do ar no momento.\n" +
  "Acompanhe: https://ufg.sigaacaiu.com";

const DELIVERY_CONCURRENCY = 5;
const PROCESSING_LEASE_MS = 2 * 60_000;
const TELEGRAM_TARGET_ID = "configured-chat";

export async function applyIncidentNotificationTransition(
  env: Env,
  transition: IncidentTransition
): Promise<void> {
  if (
    transition.type === "opened" ||
    (transition.type === "unchanged" && transition.incidentId !== null)
  ) {
    const incidentId = transition.incidentId;
    if (incidentId === null) return;
    const channels = configuredChannels(env);
    await Promise.all(
      channels.map((channel) =>
        ensureNotificationEvent(env.DB, incidentId, channel)
      )
    );
    return;
  }

  if (transition.type === "closed") {
    await cancelIncidentNotifications(env.DB, transition.incidentId);
  }
}

export async function processIncidentNotifications(
  env: Env,
  incidentId: number
): Promise<void> {
  const openIncident = await getOpenIncident(env.DB);
  if (!openIncident || openIncident.id !== incidentId) {
    await cancelIncidentNotifications(env.DB, incidentId);
    return;
  }

  const now = new Date();
  const nowIso = toIsoSeconds(now);
  const dueEvents = await getDueNotificationEvents(env.DB, incidentId, nowIso);
  for (const event of dueEvents) {
    await discoverNotificationTargets(env, event, now);
  }

  const deliveryNow = new Date();
  const deliveryNowIso = toIsoSeconds(deliveryNow);
  const staleBeforeIso = toIsoSeconds(
    new Date(deliveryNow.getTime() - PROCESSING_LEASE_MS)
  );
  const deliveries = await getDueNotificationDeliveries(
    env.DB,
    incidentId,
    deliveryNowIso,
    staleBeforeIso
  );

  await mapWithConcurrency(deliveries, DELIVERY_CONCURRENCY, (delivery) =>
    processDelivery(env, delivery, deliveryNowIso, staleBeforeIso)
  );

  await finalizeNotificationEvents(env.DB, incidentId);
}

export function retryDelaySeconds(attempts: number): number {
  if (attempts <= 1) return 60;
  if (attempts === 2) return 120;
  return 300;
}

async function discoverNotificationTargets(
  env: Env,
  event: NotificationEventRow,
  now: Date
): Promise<void> {
  try {
    if (event.channel === "whatsapp") {
      const config = evolutionConfig(env);
      if (!config) throw new Error("evolution_configuration_missing");

      const groups = await fetchEvolutionGroups(config);
      await insertNotificationTargets(
        env.DB,
        event.incident_id,
        event.channel,
        groups.map((group) => ({ id: group.id, name: group.name }))
      );
      await markEventDiscovered(env.DB, event.id, groups.length === 0);
      return;
    }

    if (!telegramConfigured(env)) {
      throw new Error("telegram_configuration_missing");
    }

    await insertNotificationTargets(env.DB, event.incident_id, event.channel, [
      { id: TELEGRAM_TARGET_ID, name: "Telegram" },
    ]);
    await markEventDiscovered(env.DB, event.id, false);
  } catch (error) {
    const attempts = event.attempts + 1;
    if (error instanceof ProviderRequestError && !error.retryable) {
      await markEventFailedFinal(
        env.DB,
        event.id,
        attempts,
        errorMessage(error)
      );
      return;
    }
    await scheduleEventRetry(
      env.DB,
      event.id,
      attempts,
      nextAttemptIso(now, attempts),
      errorMessage(error)
    );
  }
}

async function processDelivery(
  env: Env,
  delivery: NotificationDeliveryRow,
  nowIso: string,
  staleBeforeIso: string
): Promise<void> {
  const claimed = await claimNotificationDelivery(
    env.DB,
    delivery.id,
    nowIso,
    staleBeforeIso
  );
  if (!claimed) return;

  const openIncident = await getOpenIncident(env.DB);
  if (!openIncident || openIncident.id !== delivery.incident_id) {
    await cancelIncidentNotifications(env.DB, delivery.incident_id);
    return;
  }

  try {
    const providerMessageId =
      delivery.channel === "whatsapp"
        ? await sendWhatsAppDelivery(env, delivery)
        : await sendTelegramDelivery(env);
    await markDeliverySent(env.DB, delivery.id, providerMessageId);
  } catch (error) {
    const attempts = delivery.attempts + 1;
    const retryable =
      error instanceof ProviderRequestError ? error.retryable : true;
    await markDeliveryFailed(
      env.DB,
      delivery.id,
      attempts,
      retryable,
      nextAttemptIso(new Date(), attempts),
      errorMessage(error)
    );
  }
}

async function sendWhatsAppDelivery(
  env: Env,
  delivery: NotificationDeliveryRow
): Promise<string | null> {
  const config = evolutionConfig(env);
  if (!config) throw new Error("evolution_configuration_missing");
  return sendEvolutionText(config, delivery.target_id, OUTAGE_MESSAGE);
}

async function sendTelegramDelivery(env: Env): Promise<string | null> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    throw new Error("telegram_configuration_missing");
  }

  let response: Response;
  try {
    response = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text: OUTAGE_MESSAGE,
          disable_web_page_preview: false,
        }),
        signal: AbortSignal.timeout(10_000),
      }
    );
  } catch (error) {
    throw new ProviderRequestError(
      `telegram_network_error: ${errorMessage(error)}`,
      true
    );
  }

  const body = await response.text();
  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    throw new ProviderRequestError(
      `telegram_http_${response.status}: ${body.slice(0, 500)}`,
      retryable,
      response.status
    );
  }

  if (!body) return null;
  try {
    const payload = JSON.parse(body) as {
      result?: { message_id?: number | string };
    };
    const messageId = payload.result?.message_id;
    return messageId === undefined ? null : String(messageId);
  } catch {
    return null;
  }
}

function configuredChannels(env: Env): NotificationChannel[] {
  const channels: NotificationChannel[] = [];
  if (evolutionConfig(env)) channels.push("whatsapp");
  if (telegramConfigured(env)) channels.push("telegram");
  return channels;
}

function evolutionConfig(env: Env): EvolutionConfig | null {
  const baseUrl = env.EVOLUTION_API_URL?.trim();
  const apiKey = env.EVOLUTION_API_KEY?.trim();
  const instanceName = env.EVOLUTION_INSTANCE_NAME?.trim();
  if (!baseUrl || !apiKey || !instanceName) return null;

  return {
    baseUrl: normalizeEvolutionBaseUrl(baseUrl),
    apiKey,
    instanceName,
  };
}

function telegramConfigured(env: Env): boolean {
  return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
}

function nextAttemptIso(now: Date, attempts: number): string {
  return toIsoSeconds(
    new Date(now.getTime() + retryDelaySeconds(attempts) * 1_000)
  );
}

function toIsoSeconds(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown_error";
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (cursor < items.length) {
        const item = items[cursor++];
        await fn(item);
      }
    }
  );
  await Promise.all(workers);
}
