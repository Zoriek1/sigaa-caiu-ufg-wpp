export interface EvolutionConfig {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
}

export interface EvolutionGroup {
  id: string;
  name: string | null;
}

export class ProviderRequestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status: number | null = null
  ) {
    super(message);
    this.name = "ProviderRequestError";
  }
}

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_ERROR_LENGTH = 500;

export function normalizeEvolutionBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function parseEvolutionGroups(payload: unknown): EvolutionGroup[] {
  const root = asRecord(payload);
  const data = root ? root.data : undefined;
  const dataRecord = asRecord(data);
  const groups =
    (Array.isArray(payload) && payload) ||
    (Array.isArray(data) && data) ||
    (root && Array.isArray(root.groups) && root.groups) ||
    (dataRecord && Array.isArray(dataRecord.groups) && dataRecord.groups) ||
    [];

  const unique = new Map<string, EvolutionGroup>();
  for (const rawGroup of groups) {
    const group = asRecord(rawGroup);
    if (!group) continue;

    const id = firstString(
      group.id,
      group.jid,
      group.JID,
      group.remoteJid
    );
    if (!id || !id.endsWith("@g.us")) continue;

    const name = firstString(group.subject, group.name, group.Name) || null;
    unique.set(id, { id, name });
  }

  return Array.from(unique.values());
}

export async function fetchEvolutionGroups(
  config: EvolutionConfig,
  fetchFn: typeof fetch = fetch
): Promise<EvolutionGroup[]> {
  const url = `${config.baseUrl}/group/fetchAllGroups/${encodeURIComponent(config.instanceName)}?getParticipants=false`;
  const response = await providerFetch(
    url,
    {
      method: "GET",
      headers: { apikey: config.apiKey },
    },
    fetchFn
  );

  const payload = await parseJsonResponse(response);
  return parseEvolutionGroups(payload);
}

export async function sendEvolutionText(
  config: EvolutionConfig,
  groupJid: string,
  text: string,
  fetchFn: typeof fetch = fetch
): Promise<string | null> {
  const url = `${config.baseUrl}/message/sendText/${encodeURIComponent(config.instanceName)}`;
  const nestedPayload = {
    number: groupJid,
    textMessage: { text },
    delay: 500,
    linkPreview: false,
  };

  let response = await rawProviderFetch(
    url,
    evolutionPostInit(config.apiKey, nestedPayload),
    fetchFn
  );

  // Evolution 2.x releases used a flat `text` field. A 400 means the first
  // request was rejected, so retrying with the legacy schema cannot duplicate
  // an accepted message.
  if (response.status === 400) {
    response = await rawProviderFetch(
      url,
      evolutionPostInit(config.apiKey, {
        number: groupJid,
        text,
        delay: 500,
        linkPreview: false,
      }),
      fetchFn
    );
  }

  await assertProviderResponse(response);
  const payload = await parseJsonResponse(response);
  return extractProviderMessageId(payload);
}

function evolutionPostInit(apiKey: string, body: unknown): RequestInit {
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify(body),
  };
}

async function providerFetch(
  url: string,
  init: RequestInit,
  fetchFn: typeof fetch
): Promise<Response> {
  const response = await rawProviderFetch(url, init, fetchFn);
  await assertProviderResponse(response);
  return response;
}

async function rawProviderFetch(
  url: string,
  init: RequestInit,
  fetchFn: typeof fetch
): Promise<Response> {
  try {
    return await fetchFn(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    throw new ProviderRequestError(`network_error: ${message}`, true);
  }
}

async function assertProviderResponse(response: Response): Promise<void> {
  if (response.ok) return;

  const body = (await response.text()).slice(0, MAX_RESPONSE_ERROR_LENGTH);
  const retryable =
    response.status === 408 ||
    response.status === 425 ||
    response.status === 429 ||
    response.status >= 500;

  throw new ProviderRequestError(
    `evolution_http_${response.status}: ${body || response.statusText}`,
    retryable,
    response.status
  );
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderRequestError("evolution_invalid_json", true, response.status);
  }
}

function extractProviderMessageId(payload: unknown): string | null {
  const root = asRecord(payload);
  if (!root) return null;

  const key = asRecord(root.key);
  const data = asRecord(root.data);
  const dataKey = data ? asRecord(data.key) : null;
  return firstString(
    root.messageId,
    root.id,
    key?.id,
    data?.messageId,
    dataKey?.id
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
