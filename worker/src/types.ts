export type Status = "online" | "degraded" | "offline";

// Per-layer status; "skipped" means the layer wasn't run this tick (e.g. e2e gating, missing creds).
export type LayerStatus = Status | "skipped";

export interface ReachabilityResult {
  status: LayerStatus;
  httpCode: number | null;
  responseTimeMs: number;
  error: string | null;
}

export interface LayerResult {
  status: LayerStatus;
  error: string | null;
  responseTimeMs: number;
}

export interface CheckResult {
  // Derived overall for this tick.
  status: Status;
  // Mirror of reachability for backwards compat with existing queries.
  httpCode: number | null;
  responseTimeMs: number;
  error: string | null;
  // Per-layer detail.
  reachability: ReachabilityResult;
  portal: LayerResult;
  loginForm: LayerResult;
  loginE2e: LayerResult;
}

export interface CheckRow {
  id: number;
  timestamp: string;
  status: Status;
  http_code: number | null;
  response_time_ms: number;
  error: string | null;
  reachability_status: LayerStatus | null;
  reachability_http: number | null;
  reachability_ms: number | null;
  reachability_error: string | null;
  portal_status: LayerStatus | null;
  portal_ms: number | null;
  portal_error: string | null;
  login_form_status: LayerStatus | null;
  login_form_ms: number | null;
  login_form_error: string | null;
  login_e2e_status: LayerStatus | null;
  login_e2e_ms: number | null;
  login_e2e_error: string | null;
}

export interface IncidentRow {
  id: number;
  started_at: string;
  ended_at: string | null;
  duration_s: number | null;
}

export type IncidentTransition =
  | { type: "opened"; incidentId: number }
  | { type: "closed"; incidentId: number }
  | { type: "unchanged"; incidentId: number | null };

export type NotificationChannel = "whatsapp" | "telegram";

export type NotificationEventStatus =
  | "pending"
  | "discovered"
  | "completed"
  | "failed_final"
  | "canceled";

export interface NotificationEventRow {
  id: number;
  incident_id: number;
  channel: NotificationChannel;
  status: NotificationEventStatus;
  attempts: number;
  next_attempt_at: string;
  last_error: string | null;
}

export type NotificationDeliveryStatus =
  | "pending"
  | "processing"
  | "sent"
  | "failed_final"
  | "canceled";

export interface NotificationDeliveryRow {
  id: number;
  incident_id: number;
  channel: NotificationChannel;
  target_id: string;
  target_name: string | null;
  status: NotificationDeliveryStatus;
  attempts: number;
  next_attempt_at: string;
  processing_started_at: string | null;
  last_error: string | null;
}

export interface LastKnownLayer {
  status: LayerStatus;
  error: string | null;
  timestamp: string;
  responseTimeMs: number | null;
}

export type LastKnownLayerWithHttp = LastKnownLayer & {
  httpCode: number | null;
};

export interface LastKnownLayers {
  reachability: LastKnownLayerWithHttp | null;
  portal: LastKnownLayer | null;
  loginForm: LastKnownLayer | null;
  loginE2e: LastKnownLayer | null;
}

export interface OtherServiceDef {
  id: string;
  name: string;
  url: string;
}

export interface OtherServiceCheckResult {
  serviceId: string;
  status: Status;
  httpCode: number | null;
  responseTimeMs: number;
  error: string | null;
}

export interface OtherServiceRow {
  id: number;
  timestamp: string;
  service_id: string;
  status: Status;
  http_code: number | null;
  response_time_ms: number;
  error: string | null;
}

export interface RawOtherServiceRow {
  timestamp: string;
  service_id: string;
  response_time_ms: number;
}

export interface Env {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  EVOLUTION_API_URL?: string;
  EVOLUTION_API_KEY?: string;
  EVOLUTION_INSTANCE_NAME?: string;
  SIGAA_MONITOR_USER?: string;
  SIGAA_MONITOR_PASS?: string;
}
