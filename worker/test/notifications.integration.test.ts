import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOpenIncident, manageIncidents } from "../src/db";
import {
  ensureNotificationEvent,
  insertNotificationTargets,
} from "../src/notification-outbox";
import {
  OUTAGE_MESSAGE,
  applyIncidentNotificationTransition,
  processIncidentNotifications,
  retryDelaySeconds,
} from "../src/notify";
import type { CheckResult, CheckRow, Env } from "../src/types";

const schemaPath = fileURLToPath(new URL("../schema.sql", import.meta.url));

describe("incident notification outbox", () => {
  let mf: Miniflare;
  let db: D1Database;

  beforeEach(async () => {
    mf = new Miniflare({
      modules: true,
      script: "export default { fetch() { return new Response('ok') } }",
      d1Databases: { DB: "notifications-test" },
    });
    db = (await mf.getD1Database("DB")) as D1Database;
    await applySqlFile(db, readFileSync(schemaPath, "utf8"));
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await mf.dispose();
  });

  it("opens only on the second failure and returns explicit transitions", async () => {
    const first = await manageIncidents(db, check("offline"), []);
    expect(first).toEqual({ type: "unchanged", incidentId: null });
    await applyIncidentNotificationTransition(evolutionEnv(db), first);
    const eventsBeforeConfirmation = await db
      .prepare("SELECT COUNT(*) AS count FROM notification_events")
      .first<{ count: number }>();
    expect(eventsBeforeConfirmation?.count).toBe(0);

    const opened = await manageIncidents(db, check("offline"), [
      checkRow("offline"),
    ]);
    expect(opened.type).toBe("opened");
    expect((await getOpenIncident(db))?.id).toBe(opened.incidentId);

    const unchanged = await manageIncidents(db, check("offline"), [
      checkRow("offline"),
      checkRow("offline"),
    ]);
    expect(unchanged).toEqual(opened.type === "opened"
      ? { type: "unchanged", incidentId: opened.incidentId }
      : neverValue());

    const closed = await manageIncidents(db, check("online"), [
      checkRow("offline"),
    ]);
    expect(closed).toEqual(
      opened.type === "opened"
        ? { type: "closed", incidentId: opened.incidentId }
        : neverValue()
    );
    expect(await getOpenIncident(db)).toBeNull();
  });

  it("discovers every group and sends exactly once per incident", async () => {
    await db
      .prepare("INSERT INTO incidents (started_at) VALUES (?)")
      .bind("2026-07-15T12:00:00Z")
      .run();
    const incident = await getOpenIncident(db);
    expect(incident).not.toBeNull();

    const env = evolutionEnv(db);
    await applyIncidentNotificationTransition(env, {
      type: "opened",
      incidentId: incident!.id,
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/group/fetchAllGroups/")) {
        return new Response(
          JSON.stringify([
            { id: "group-a@g.us", subject: "Grupo A" },
            { id: "group-b@g.us", subject: "Grupo B" },
          ]),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ key: { id: `msg-${url.length}` } }), {
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await processIncidentNotifications(env, incident!.id);

    const deliveries = await db
      .prepare(
        "SELECT target_id, status FROM notification_deliveries ORDER BY target_id"
      )
      .all<{ target_id: string; status: string }>();
    expect(deliveries.results).toEqual([
      { target_id: "group-a@g.us", status: "sent" },
      { target_id: "group-b@g.us", status: "sent" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await processIncidentNotifications(env, incident!.id);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("isolates group failures and retries only the retryable destination", async () => {
    await db
      .prepare("INSERT INTO incidents (started_at) VALUES (?)")
      .bind("2026-07-15T12:00:00Z")
      .run();
    const incident = (await getOpenIncident(db))!;
    const env = evolutionEnv(db);
    await applyIncidentNotificationTransition(env, {
      type: "opened",
      incidentId: incident.id,
    });

    let retryableCalls = 0;
    const sentNumbers: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/group/fetchAllGroups/")) {
        return new Response(
          JSON.stringify([
            { id: "ok@g.us", subject: "OK" },
            { id: "retry@g.us", subject: "Retry" },
            { id: "blocked@g.us", subject: "Blocked" },
          ]),
          { status: 200 }
        );
      }

      const number = JSON.parse(String(init?.body)).number as string;
      sentNumbers.push(number);
      if (number === "retry@g.us" && retryableCalls++ === 0) {
        return new Response("temporarily unavailable", { status: 503 });
      }
      if (number === "blocked@g.us") {
        return new Response("not allowed", { status: 403 });
      }
      return new Response(JSON.stringify({ key: { id: `msg-${number}` } }), {
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await processIncidentNotifications(env, incident.id);

    let statuses = await deliveryStatuses(db);
    expect(statuses).toEqual({
      "blocked@g.us": "failed_final",
      "ok@g.us": "sent",
      "retry@g.us": "pending",
    });

    await db
      .prepare(
        "UPDATE notification_deliveries SET next_attempt_at = ? WHERE target_id = ?"
      )
      .bind("2000-01-01T00:00:00Z", "retry@g.us")
      .run();
    await processIncidentNotifications(env, incident.id);

    statuses = await deliveryStatuses(db);
    expect(statuses).toEqual({
      "blocked@g.us": "failed_final",
      "ok@g.us": "sent",
      "retry@g.us": "sent",
    });
    expect(sentNumbers.filter((number) => number === "ok@g.us")).toHaveLength(1);
    expect(sentNumbers.filter((number) => number === "blocked@g.us")).toHaveLength(1);
    expect(sentNumbers.filter((number) => number === "retry@g.us")).toHaveLength(2);

    const event = await db
      .prepare("SELECT status FROM notification_events")
      .first<{ status: string }>();
    expect(event?.status).toBe("completed");
  });

  it("sends Telegram once through the same incident outbox", async () => {
    await db
      .prepare("INSERT INTO incidents (started_at) VALUES (?)")
      .bind("2026-07-15T12:00:00Z")
      .run();
    const incident = (await getOpenIncident(db))!;
    const env: Env = {
      DB: db,
      TELEGRAM_BOT_TOKEN: "bot-token",
      TELEGRAM_CHAT_ID: "chat-id",
    };
    await applyIncidentNotificationTransition(env, {
      type: "opened",
      incidentId: incident.id,
    });

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ result: { message_id: 42 } }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await processIncidentNotifications(env, incident.id);
    await processIncidentNotifications(env, incident.id);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const delivery = await db
      .prepare("SELECT channel, target_id, status FROM notification_deliveries")
      .first<{ channel: string; target_id: string; status: string }>();
    expect(delivery).toEqual({
      channel: "telegram",
      target_id: "configured-chat",
      status: "sent",
    });
  });

  it("keeps targets idempotent and cancels pending work on recovery", async () => {
    await db
      .prepare("INSERT INTO incidents (started_at) VALUES (?)")
      .bind("2026-07-15T12:00:00Z")
      .run();
    const incident = (await getOpenIncident(db))!;

    await ensureNotificationEvent(db, incident.id, "whatsapp");
    await ensureNotificationEvent(db, incident.id, "whatsapp");
    await insertNotificationTargets(db, incident.id, "whatsapp", [
      { id: "group-a@g.us", name: "Grupo A" },
      { id: "group-a@g.us", name: "Grupo A" },
    ]);

    await applyIncidentNotificationTransition(evolutionEnv(db), {
      type: "closed",
      incidentId: incident.id,
    });

    const event = await db
      .prepare("SELECT status FROM notification_events")
      .first<{ status: string }>();
    const delivery = await db
      .prepare("SELECT status FROM notification_deliveries")
      .first<{ status: string }>();
    expect(event?.status).toBe("canceled");
    expect(delivery?.status).toBe("canceled");

    const count = await db
      .prepare("SELECT COUNT(*) AS count FROM notification_deliveries")
      .first<{ count: number }>();
    expect(count?.count).toBe(1);
  });

  it("uses the agreed retry schedule and public message", () => {
    expect([1, 2, 3, 8].map(retryDelaySeconds)).toEqual([60, 120, 300, 300]);
    expect(OUTAGE_MESSAGE).toContain("🚨 O SIGAA caiu!");
    expect(OUTAGE_MESSAGE).toContain("https://ufg.sigaacaiu.com");
    expect(OUTAGE_MESSAGE.toLowerCase()).not.toContain("volt");
  });
});

function evolutionEnv(db: D1Database): Env {
  return {
    DB: db,
    EVOLUTION_API_URL: "https://evolution.example.com/",
    EVOLUTION_API_KEY: "secret",
    EVOLUTION_INSTANCE_NAME: "sigaa-caiu-ufg",
  };
}

function check(status: CheckResult["status"]): CheckResult {
  return {
    status,
    httpCode: status === "offline" ? null : 302,
    responseTimeMs: 100,
    error: status === "offline" ? "offline" : null,
    reachability: {
      status,
      httpCode: status === "offline" ? null : 302,
      responseTimeMs: 100,
      error: status === "offline" ? "offline" : null,
    },
    portal: { status: "skipped", responseTimeMs: 0, error: null },
    loginForm: { status: "skipped", responseTimeMs: 0, error: null },
    loginE2e: { status: "skipped", responseTimeMs: 0, error: null },
  };
}

function checkRow(status: CheckRow["status"]): CheckRow {
  return {
    id: 1,
    timestamp: "2026-07-15T12:00:00Z",
    status,
    http_code: status === "offline" ? null : 302,
    response_time_ms: 100,
    error: status === "offline" ? "offline" : null,
    reachability_status: status,
    reachability_http: status === "offline" ? null : 302,
    reachability_ms: 100,
    reachability_error: null,
    portal_status: null,
    portal_ms: null,
    portal_error: null,
    login_form_status: null,
    login_form_ms: null,
    login_form_error: null,
    login_e2e_status: null,
    login_e2e_ms: null,
    login_e2e_error: null,
  };
}

function neverValue(): never {
  throw new Error("unreachable");
}

async function deliveryStatuses(
  db: D1Database
): Promise<Record<string, string>> {
  const result = await db
    .prepare("SELECT target_id, status FROM notification_deliveries")
    .all<{ target_id: string; status: string }>();
  return Object.fromEntries(
    result.results.map((row) => [row.target_id, row.status])
  );
}

async function applySqlFile(db: D1Database, sql: string): Promise<void> {
  const statements = sql
    .replace(/--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await db.prepare(statement).run();
  }
}
