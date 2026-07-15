# Worker

Backend do SIGAA Caiu — Cloudflare Worker com Cron Triggers e banco D1 (SQLite).

## Estrutura

```
src/
  index.ts    ← entry point (scheduled + fetch handlers)
  health.ts   ← health check do SIGAA (fetch + logica de status)
  db.ts       ← operacoes no D1 (salvar, consultar, incidentes)
  evolution.ts ← cliente HTTP da Evolution API
  notification-outbox.ts ← persistencia idempotente de entregas
  notify.ts   ← orquestracao WhatsApp + Telegram
  api.ts      ← rotas da API (/api/status, /history, /stats, /incidents)
  cors.ts     ← headers CORS
  types.ts    ← interfaces TypeScript
schema.sql    ← schema do banco D1
```

## Dev local

```bash
npm install

# Criar banco local
npx wrangler d1 execute sigaa-caiu-ufg-db --local --file=schema.sql

# Rodar
npx wrangler dev --port 8787 --test-scheduled

# Simular um health check (cron)
curl "http://localhost:8787/__scheduled?cron=*/3+*+*+*+*"

# Testar endpoints
curl http://localhost:8787/api/status
curl http://localhost:8787/api/history?period=24h
curl http://localhost:8787/api/stats
curl http://localhost:8787/api/incidents

# Testes e TypeScript
npm test
npm run typecheck
```

## Setup inicial (primeira vez)

```bash
# Login no Cloudflare
npx wrangler login

# Criar banco D1
npx wrangler d1 create sigaa-caiu-ufg-db
# Copiar o database_id retornado pro wrangler.jsonc

# Aplicar schema no banco remoto
npx wrangler d1 execute sigaa-caiu-ufg-db --remote --file=schema.sql
```

## Alertas de queda

Uma queda e confirmada depois de 2 checks `offline` consecutivos. Nesse momento o
Worker cria um evento idempotente no D1 e envia uma unica mensagem por incidente:

```text
🚨 O SIGAA caiu!

O SIGAA da UFG está fora do ar no momento.
Acompanhe: https://ufg.sigaacaiu.com
```

O WhatsApp descobre automaticamente todos os grupos da instancia Evolution no
inicio do incidente. Falhas temporarias sao retentadas enquanto o incidente
continuar aberto; entregas pendentes sao canceladas assim que o SIGAA voltar.
Nao ha mensagem de recuperacao. Telegram e opcional e segue a mesma regra.

### Configuracao

Cadastre os valores como secrets do Worker — nunca no `wrangler.jsonc`:

```bash
npx wrangler secret put EVOLUTION_API_URL
npx wrangler secret put EVOLUTION_API_KEY
npx wrangler secret put EVOLUTION_INSTANCE_NAME

# Opcionais
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
```

Endpoint planejado para a Evolution exclusiva deste fork:

```text
EVOLUTION_API_URL=https://evolution.ufg.sigaacaiu.com
EVOLUTION_INSTANCE_NAME=sigaa-caiu-ufg
```

A Evolution deste fork deve ser uma instalacao independente, com banco, Redis,
chave de API e instancia proprios. Nao reutilize endpoint, credenciais, instancia,
webhooks ou armazenamento de outro projeto. A unica integracao permitida e o
Worker do SIGAA chamando a Evolution dedicada ao proprio fork.

Antes do primeiro deploy com a funcionalidade, aplique a migration:

```bash
npm run db:notifications:remote
```

Checklist de rollout:

1. Provisionar uma Evolution dedicada ao fork, sem compartilhar infraestrutura com outros projetos.
2. Confirmar que `${EVOLUTION_API_URL}/server/ok` responde sem erro.
3. Fixar a imagem Docker da Evolution na versao validada, sem usar `latest`.
4. Criar/conectar `sigaa-caiu-ufg` por QR Code e adiciona-la primeiro a um grupo de teste.
5. Aplicar a migration D1, cadastrar os secrets e publicar o Worker.
6. Depois do smoke test, adicionar o numero aos grupos definitivos.

## Deploy

```bash
npx wrangler deploy
```

## Schema D1

```sql
checks (id, timestamp, status, http_code, response_time_ms, error)
incidents (id, started_at, ended_at, duration_s)
notification_events (incident_id, channel, status, attempts, next_attempt_at)
notification_deliveries (incident_id, channel, target_id, status, attempts, sent_at)
```

Dados sao mantidos por 2 anos. Cleanup automatico roda diariamente via cron.
