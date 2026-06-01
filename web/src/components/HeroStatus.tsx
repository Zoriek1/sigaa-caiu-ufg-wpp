"use client";

import { useMemo } from "react";
import type { StatusResponse, Incident } from "@/lib/types";
import { formatMs, timeAgo } from "@/lib/utils";
import { institutionalTheme } from "@/lib/institutionalTheme";

interface Props {
  data: StatusResponse | null;
  error: boolean;
  daysSinceLastIncident: number | null;
  incidents: Incident[] | null;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// "O SIGAA caiu?" → Não! (ta online)
const ONLINE_RESPONSES = [
  { emoji: "👍", text: "Nao!", sub: "Milagrosamente funcionando." },
  { emoji: "👍", text: "Nao, ta no ar!", sub: "Aproveita enquanto dura." },
  { emoji: "🎉", text: "Nao!", sub: "Inacreditavel, mas ta funcionando." },
  { emoji: "👍", text: "Nao, pode ir!", sub: "Corre antes que caia." },
  { emoji: "🙏", text: "Nao!", sub: "Gracas a Deus e a CERCOMP." },
  { emoji: "👍", text: "Nao!", sub: "Nao, voce nao ta sonhando." },
];

// "O SIGAA caiu?" → Ainda não, mas ta lento...
const SLOW_RESPONSES = [
  { emoji: "🐌", text: "Ainda nao, mas...", sub: "Ta taaao lento que ja ja cai..." },
  { emoji: "😮‍💨", text: "Nao, mas quase", sub: "Ta mais lento que fila do RU." },
  { emoji: "🐢", text: "Mais ou menos", sub: "Ta funcionando em camara lenta." },
  { emoji: "⏳", text: "Nao... ainda", sub: "Pega um cafe enquanto carrega." },
  { emoji: "🦥", text: "Nao, mas ta arrastando", sub: "Mais lento que matricula em periodo." },
];

// "O SIGAA caiu?" → Sim!
const DOWN_RESPONSES = [
  { emoji: "👎", text: "Sim, caiu", sub: "F no chat. Vai tomar um cafe e volta depois." },
  { emoji: "💀", text: "Sim, morreu", sub: "Descanse em paz, SIGAA." },
  { emoji: "👎", text: "Sim", sub: "Surpresa de ninguem." },
  { emoji: "😭", text: "Sim...", sub: "Era previsivel, ne?" },
  { emoji: "🪦", text: "Sim, foi de base", sub: "Causa da morte: ser o SIGAA." },
];

const CHECKING_RESPONSES = [
  { emoji: "🤔", text: "Hmm...", sub: "Parece que oscilou. Verificando se caiu mesmo..." },
  { emoji: "👀", text: "Calma ai...", sub: "To olhando, parece que deu uma tremida." },
  { emoji: "🔍", text: "Investigando...", sub: "Pode ter sido so um soluço." },
];

const RECOVERING_RESPONSES = [
  { emoji: "🤞", text: "Parece que voltou", sub: "Mas nao confia nao, caiu agora pouco." },
  { emoji: "👀", text: "Voltou... sera?", sub: "Ainda ta quente, fica de olho." },
  { emoji: "😅", text: "Voltou, mas...", sub: "Acabou de cair. Nao bota muita fe nao." },
  { emoji: "⚠️", text: "Ta no ar de novo", sub: "Caiu faz pouco, pode oscilar ainda." },
];

export function HeroStatus({ data, error, daysSinceLastIncident, incidents }: Props) {
  const recentlyRecovered = useMemo(() => {
    if (!incidents || incidents.length === 0) return false;
    const lastIncident = incidents[0];
    if (!lastIncident.ended_at) return false;
    const endedAgo = Date.now() - new Date(lastIncident.ended_at).getTime();
    return endedAgo < 10 * 60 * 1000; // 10 minutes
  }, [incidents]);

  const response = useMemo(() => {
    if (error) return null;
    if (!data || !data.lastCheck) return null;

    const isDown = data.status === "offline" && data.confirmed;
    const isSlow = data.status === "degraded";
    const isChecking = data.status === "offline" && !data.confirmed;

    if (isDown) return pickRandom(DOWN_RESPONSES);
    if (isSlow) return pickRandom(SLOW_RESPONSES);
    if (isChecking) return pickRandom(CHECKING_RESPONSES);
    if (recentlyRecovered) return pickRandom(RECOVERING_RESPONSES);
    return pickRandom(ONLINE_RESPONSES);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.status, data?.confirmed, error, recentlyRecovered]);

  const currentStatus = useMemo(() => {
    if (error) return { label: "ERRO DE COMUNICAÇÃO", color: institutionalTheme.colors.status.offline };
    if (!data || !data.lastCheck) return { label: "AGUARDANDO DADOS...", color: institutionalTheme.colors.text.muted };
    
    const isDown = data.status === "offline" && data.confirmed;
    const isSlow = data.status === "degraded";
    const isChecking = data.status === "offline" && !data.confirmed;

    if (isDown) return { label: "SISTEMA INDISPONÍVEL", color: institutionalTheme.colors.status.offline };
    if (isSlow) return { label: "SISTEMA LENTO / DEGRADADO", color: institutionalTheme.colors.status.degraded };
    if (isChecking) return { label: "VERIFICANDO INSTABILIDADE...", color: institutionalTheme.colors.status.degraded };
    if (recentlyRecovered) return { label: "SISTEMA EM RECUPERAÇÃO", color: institutionalTheme.colors.status.degraded };
    return { label: "SISTEMA OPERACIONAL", color: institutionalTheme.colors.status.online };
  }, [data, error, recentlyRecovered]);

  return (
    <div className="institutional-panel w-full max-w-2xl mx-auto shadow-sm">
      <div className="institutional-panel-header text-sm sm:text-base">
        Serviço de Verificação de Disponibilidade (SVD)
      </div>
      
      <div className="p-6 sm:p-10 flex flex-col items-center text-center">
        {/* Incident Alert Banner */}
        {data?.currentIncident && (
          <div className="alert-banner w-full justify-center mb-6 text-red-800 text-sm sm:text-base border-red-300 bg-red-50">
            ⚠️ ALERTA: Incidente em andamento no sistema.
          </div>
        )}
        
        <div className="text-xs font-bold text-sigaa-muted uppercase tracking-wider mb-2">
          Estado Atual do Sistema
        </div>
        
        <div 
          className={`text-2xl sm:text-4xl font-black mb-6 ${(!data || !data.lastCheck) && !error ? "animate-pulse" : ""}`}
          style={{ color: currentStatus.color }}
        >
          {currentStatus.label}
        </div>

        {/* The Humorous Report Box */}
        {response && (
          <div className="mb-8 p-4 border border-sigaa-border-default bg-sigaa-background w-full rounded-sm">
             <div className="text-3xl mb-2">{response.emoji}</div>
             <div className="font-bold text-sigaa-text">{response.text}</div>
             <div className="text-sm text-sigaa-muted mt-1">{response.sub}</div>
          </div>
        )}

        {/* Error Fallback Box */}
        {error && !response && (
          <div className="mb-8 p-4 border border-sigaa-border-default bg-sigaa-background w-full rounded-sm">
             <div className="font-bold text-sigaa-text">Erro ao conectar com o monitor.</div>
             <div className="text-sm text-sigaa-muted mt-1">Tentando novamente em breve...</div>
          </div>
        )}

        {/* Stats & Last Check Boxes */}
        {data?.lastCheck && !error && (
          <div className="flex flex-col sm:flex-row gap-3 w-full justify-center text-xs text-sigaa-muted mt-2">
            <div className="border border-sigaa-border-default px-3 py-1.5 bg-sigaa-background rounded-sm">
              Última verificação: {timeAgo(data.lastCheck.timestamp)}
            </div>
            {data.status !== "offline" && data.lastCheck.responseTimeMs > 0 && (
              <div className="border border-sigaa-border-default px-3 py-1.5 bg-sigaa-background rounded-sm">
                Tempo de resposta: {formatMs(data.lastCheck.responseTimeMs)}
              </div>
            )}
          </div>
        )}

        {/* Days since last incident */}
        {daysSinceLastIncident !== null && daysSinceLastIncident > 0 && data?.status !== "offline" && !error && (
          <div className="mt-8 text-xs text-sigaa-muted font-bold uppercase tracking-wider">
            Estamos a {daysSinceLastIncident} {daysSinceLastIncident === 1 ? "dia" : "dias"} sem incidentes registrados
          </div>
        )}
      </div>
    </div>
  );
}
