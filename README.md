# SIGAA Caiu? — UFG

Monitor em tempo real do [SIGAA da UFG](https://sigaa.sistemas.ufg.br). Verifica automaticamente se o sistema esta no ar, lento ou fora do ar a cada 3 minutos.

**Site:** [ufg.sigaacaiu.com](https://ufg.sigaacaiu.com)

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

## Alertas em grupos do WhatsApp

Depois de 2 falhas consecutivas, o Worker confirma o incidente e envia uma unica
mensagem para todos os grupos da instancia dedicada `sigaa-caiu-ufg` na Evolution
API. O alerta usa a URL publica oficial `https://ufg.sigaacaiu.com`; nao ha aviso
para lentidao, falha isolada, permanencia offline ou recuperacao. As entregas sao
idempotentes por incidente/canal/grupo, com retry de falhas temporarias e
cancelamento automatico se o SIGAA voltar.

O Telegram pode permanecer configurado em paralelo, seguindo exatamente a mesma
regra de enviar somente a queda confirmada. Configuracao e rollout estao descritos
em [`worker/README.md`](worker/README.md#alertas-de-queda).

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

| Campo                 | Descricao                                               |
| --------------------- | ------------------------------------------------------- |
| `status`              | `online`, `degraded` ou `offline`                       |
| `confirmed`           | `false` se houve apenas 1 falha (possivel flap de rede) |
| `consecutiveFailures` | Quantas falhas consecutivas ate agora                   |
| `currentIncident`     | Incidente em andamento, se houver                       |

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
├── infra/     ← Evolution API isolada (Docker + CI + operacao)
└── README.md
```

## Infraestrutura da Evolution

A Evolution dedicada roda separadamente em
`https://evolution.ufg.sigaacaiu.com`. O dashboard administrativo entra por
`/cfgevo`, protegido pelo Cloudflare Access, e redireciona para o Manager
embutido. Compose, testes, backup e rollout estao em
[`infra/evolution/README.md`](infra/evolution/README.md).

## Issues e sugestoes

Abra uma [issue](https://github.com/m9tzin/sigaa-caiu-ufg/issues) se encontrar um bug ou tiver uma sugestao.

## Licenca e creditos

Este projeto e open source sob a licenca [MIT](LICENSE) — voce pode usar, modificar e fazer fork livremente.

Baseado no projeto original [sigaacaiu.com](https://sigaacaiu.com) por [trindadetiago](https://github.com/trindadetiago/sigaa-caiu).
