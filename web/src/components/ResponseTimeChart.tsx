"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import type { HistoryResponse } from "@/lib/types";
import { statusColor } from "@/lib/utils";
import { institutionalTheme } from "@/lib/institutionalTheme";

type Period = "24h" | "7d" | "30d";

interface Props {
  histories: Record<Period, HistoryResponse | null>;
}

function formatTime(timestamp: string, period: Period): string {
  const date = new Date(timestamp);
  const options: Intl.DateTimeFormatOptions =
    period === "24h"
      ? { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }
      : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" };
  return date.toLocaleString("pt-BR", options);
}

export function ResponseTimeChart({ histories }: Props) {
  const [period, setPeriod] = useState<Period>("24h");
  const history = histories[period];

  const data =
    history?.checks.map((c) => ({
      time: formatTime(c.timestamp, period),
      ms: c.response_time_ms,
      status: c.status,
      color: statusColor(c.status),
    })) ?? [];

  return (
    <div className="institutional-panel">
      <div className="institutional-panel-header flex items-center justify-between">
        <span>Tempo de resposta</span>
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
        {data.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-sigaa-muted text-sm">
            Sem dados para este periodo
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
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
                tickFormatter={(v) => (v >= 1000 ? `${v / 1000}s` : `${v}ms`)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: institutionalTheme.colors.panelBackground,
                  border: `1px solid ${institutionalTheme.colors.borders.default}`,
                  borderRadius: 2,
                  fontSize: 12,
                  color: institutionalTheme.colors.text.main,
                }}
                formatter={(value) => {
                  const v = Number(value);
                  return [
                    v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`,
                    "Resposta",
                  ];
                }}
              />
              <ReferenceLine
                y={10000}
                stroke={institutionalTheme.colors.status.degraded}
                strokeDasharray="4 4"
                label={{ value: "10s", fill: institutionalTheme.colors.status.degraded, fontSize: 10 }}
              />
              <Line
                type="monotone"
                dataKey="ms"
                stroke={institutionalTheme.colors.status.online}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
