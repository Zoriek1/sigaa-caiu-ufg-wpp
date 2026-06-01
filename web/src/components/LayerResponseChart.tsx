"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import type { HistoryResponse } from "@/lib/types";
import { institutionalTheme } from "@/lib/institutionalTheme";

type Period = "24h" | "7d" | "30d";

interface Props {
  histories: Record<Period, HistoryResponse | null>;
}

const LAYERS = [
  { key: "reachability_ms", label: "Servidor", color: "#22c55e" },
  { key: "portal_ms", label: "Portal", color: "#3b82f6" },
  { key: "login_form_ms", label: "Login", color: "#a855f7" },
  { key: "login_e2e_ms", label: "Login E2E", color: "#f97316" },
] as const;

function formatTime(timestamp: string, period: Period): string {
  const date = new Date(timestamp);
  const options: Intl.DateTimeFormatOptions =
    period === "24h"
      ? { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }
      : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" };
  return date.toLocaleString("pt-BR", options);
}

function formatMs(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`;
}

export function LayerResponseChart({ histories }: Props) {
  const [period, setPeriod] = useState<Period>("24h");
  const history = histories[period];

  const data =
    history?.checks.map((c) => ({
      time: formatTime(c.timestamp, period),
      reachability_ms: c.reachability_ms ?? null,
      portal_ms: c.portal_ms ?? null,
      login_form_ms: c.login_form_ms ?? null,
      login_e2e_ms: c.login_e2e_ms ?? null,
    })) ?? [];

  // Only show layers that have at least one data point.
  const activeLayers = LAYERS.filter((l) =>
    data.some((d) => d[l.key] != null)
  );

  return (
    <div className="institutional-panel">
      <div className="institutional-panel-header flex items-center justify-between">
        <span>Tempo de resposta por camada</span>
        <div className="flex gap-1">
          {(["24h", "7d", "30d"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2 py-0.5 text-xs border transition-colors ${
                period === p
                  ? "bg-sigaa-primary text-white border-sigaa-primary"
                  : "bg-white text-sigaa-primary border-sigaa-border-blue hover:bg-sigaa-secondary"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {data.length === 0 || activeLayers.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-sigaa-muted text-sm">
            Sem dados para este periodo
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke={institutionalTheme.colors.borders.default} />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 11, fill: institutionalTheme.colors.text.muted }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: institutionalTheme.colors.text.muted }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatMs(v)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: institutionalTheme.colors.panelBackground,
                  border: `1px solid ${institutionalTheme.colors.borders.default}`,
                  borderRadius: 2,
                  fontSize: 12,
                  color: institutionalTheme.colors.text.main,
                }}
                formatter={(value, name) => {
                  const v = Number(value);
                  const layer = LAYERS.find((l) => l.key === name);
                  return [formatMs(v), layer?.label ?? String(name)];
                }}
              />
              <Legend
                iconType="square"
                iconSize={8}
                wrapperStyle={{ fontSize: 12, color: institutionalTheme.colors.text.muted }}
                formatter={(value: string) => {
                  const layer = LAYERS.find((l) => l.key === value);
                  return layer?.label ?? value;
                }}
              />
              {activeLayers.map((layer) => (
                <Line
                  key={layer.key}
                  type="monotone"
                  dataKey={layer.key}
                  stroke={layer.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
