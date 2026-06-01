# SIGAA Caiu? — UFG

Monitor em tempo real do [SIGAA da UFG](https://sigaa.sistemas.ufg.br). Verifica automaticamente se o sistema esta no ar, lento ou fora do ar a cada 3 minutos.

**Site:** [ufg.sigaacaiu.com](ufg.sigaacaiu.com)

Fork de [trindadetiago/sigaa-caiu](https://github.com/trindadetiago/sigaa-caiu) adaptado para a UFG.

## Como funciona

Um [Cloudflare Worker](https://workers.cloudflare.com/) faz requisicoes periodicas ao SIGAA UFG e salva o resultado num banco de dados D1. O frontend consome esses dados e exibe o status atual, historico e incidentes.

```
Cloudflare Worker (cron a cada 3 min)
  │
  ├── Layer 1: GET sigaa.sistemas.ufg.br/sigaa/verTelaLogin.do
  │   └── 302 → SSO = servidor vivo
  │
  ├── Layer 2: GET sso.ufg.br/cas/login
  │   └── verifica se o SSO/CAS esta respondendo
  │
  ├── Layer 3: campos do formulario CAS
  │   └── verifica username, password e execution token
  │
  └── Salva no D1 (SQLite)

Frontend (Next.js no Vercel)
  └── Consome a API publica do Worker
```

> **Nota:** A UFG usa CAS/SSO (`sso.ufg.br`) para autenticacao. O check E2E de login (camada 4) nao e suportado pois o SSO enforca reCAPTCHA.

## API Publica

Base URL: `https://sigaa-caiu-ufg-worker.matheusmrno.workers.dev`

A API e aberta — qualquer pessoa pode consumir, sem autenticacao.

### `GET /api/status`

Status atual do SIGAA UFG.

```json
{
  "status": "online",
  "confirmed": true,
  "lastCheck": {
    "timestamp": "2026-05-30T21:00:00Z",
    "status": "online",
    "httpCode": 302,
    "responseTimeMs": 630
  },
  "consecutiveFailures": 0,
  "currentIncident": null
}
```

| Campo | Descricao |
|---|---|
| `status` | `online`, `degraded` ou `offline` |
| `confirmed` | `false` se houve apenas 1 falha (possivel flap de rede) |
| `consecutiveFailures` | Quantas falhas consecutivas ate agora |
| `currentIncident` | Incidente em andamento, se houver |

### `GET /api/history?period=24h|7d|30d`

Historico de checks. Para `7d` e `30d` os dados sao agregados (downsampled).

### `GET /api/stats`

Uptime e tempo medio de resposta por periodo.

### `GET /api/incidents`

Ultimos 10 incidentes (periodos de indisponibilidade).

## Estrutura

```
sigaa-caiu-ufg/
├── worker/    ← Cloudflare Worker (API + cron + D1)
├── web/       ← Next.js (frontend no Vercel)
└── README.md
```

## Issues e sugestoes

Abra uma [issue](https://github.com/m9tzin/sigaa-caiu-ufg/issues) se encontrar um bug ou tiver uma sugestao.
