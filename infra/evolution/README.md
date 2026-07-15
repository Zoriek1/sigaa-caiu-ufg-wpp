# Evolution API exclusiva do SIGAA

Stack Docker para `https://evolution.ufg.sigaacaiu.com`. Ela nao compartilha
containers, banco, Redis, chaves ou sessoes com nenhum outro projeto.

## Componentes

- Evolution API `v2.3.7`, com o Manager embutido em `/manager/`.
- PostgreSQL 15 e Redis 7 em uma rede interna, sem portas publicas.
- Caddy como unico ponto de entrada HTTP/HTTPS.
- Bootstrap `/cfgevo`, que valida a chave configurada e abre o Manager sem pedir
  a chave novamente.

Todas as imagens estao fixadas por tag e digest multi-arquitetura. Atualizacoes
devem trocar tag e digest juntas e passar pelo smoke test antes do deploy.

## Preparacao da VPS

Requisitos: Linux, Docker Engine, Docker Compose v2, `curl`, `rsync` e acesso aos
ports 80/443. O DNS deve apontar `evolution.ufg.sigaacaiu.com` para a VPS.

```bash
cd infra/evolution
cp .env.example .env
chmod 600 .env
```

Gere valores URL-safe diferentes para cada secret:

```bash
openssl rand -hex 32
```

Substitua todos os placeholders do `.env` e valide antes de subir:

```bash
docker compose --env-file .env config --quiet
docker compose --env-file .env pull
docker compose --env-file .env up -d --wait --wait-timeout 300
```

Teste a API sem imprimir a chave:

```bash
set -a
. ./.env
set +a
sh scripts/healthcheck.sh
```

## Dashboard `/cfgevo`

`/cfgevo` e uma pagina de entrada protegida. Ela usa
`AUTHENTICATION_API_KEY` do `.env`, valida a credencial na Evolution, grava os
campos esperados pelo Manager no `localStorage` e redireciona para `/manager/`.
A resposta nao pode ser armazenada em cache.

Como a chave precisa chegar ao navegador para o Manager funcionar, qualquer
usuario autorizado no Cloudflare Access consegue visualiza-la nas ferramentas
do navegador. Restrinja o Access somente aos administradores responsaveis.

Crie duas aplicacoes **Self-hosted** no Cloudflare Zero Trust usando o provedor
de identidade ja adotado pela conta:

| Aplicacao | Host | Path | Politica |
| --- | --- | --- | --- |
| `sigaa-evolution-bootstrap` | `evolution.ufg.sigaacaiu.com` | `cfgevo*` | Allow somente administradores atuais |
| `sigaa-evolution-manager` | `evolution.ufg.sigaacaiu.com` | `manager*` | A mesma politica |

Nao proteja o dominio inteiro: os endpoints REST continuam publicos e exigem o
header `apikey`. Nao crie uma politica Bypass para os caminhos do dashboard.
Mantenha o proxy do DNS ativo e configure TLS como Full (strict).

Validacao manual depois de publicar:

1. Uma janela anonima nao autorizada deve parar no Cloudflare Access.
2. Um administrador deve abrir `/cfgevo`, passar pelo Access e chegar em
   `/manager/` sem formulario de API key.
3. `/server/ok` deve continuar acessivel sem Access.

## Backup e restauracao

O deploy executa um `pg_dump` antes de atualizar uma instalacao existente. Para
fazer backup manual:

```bash
sh scripts/backup-postgres.sh
```

Os dumps locais ficam em `backups/`, com retencao padrao de 7 dias. Copie-os
para armazenamento criptografado fora da VPS. Para restaurar, pare a Evolution,
recrie o banco vazio e use `pg_restore --clean --if-exists` dentro do container
PostgreSQL; valide a restauracao em ambiente separado antes de usa-la em
producao.

## Deploy pelo GitHub Actions

O workflow `Deploy Evolution` e manual e usa o environment protegido
`evolution-production`. Cadastre nele:

- `EVOLUTION_SSH_HOST`
- `EVOLUTION_SSH_PORT`
- `EVOLUTION_SSH_USER`
- `EVOLUTION_SSH_PRIVATE_KEY`
- `EVOLUTION_SSH_HOST_KEY` (linha completa e previamente verificada de
  `known_hosts`)
- `EVOLUTION_DEPLOY_PATH` (caminho absoluto sem espacos)

Na VPS, crie antecipadamente
`$EVOLUTION_DEPLOY_PATH/shared/.env`, com permissao `600`. Cada execucao envia
uma release imutavel, faz backup, valida e sobe o Compose. Se o health check
falhar, o script volta para a release anterior.

## CI

O CI usa credenciais descartaveis, sobe todo o stack em portas locais e testa:

- schema do Compose e ausencia de `latest`;
- saude de PostgreSQL, Redis, Evolution, bootstrap e Caddy;
- `/server/ok` e `/verify-creds`;
- `/cfgevo` em Chromium headless, incluindo `localStorage` e redirecionamento;
- teardown com remocao dos volumes descartaveis.

O teste nunca cria uma instancia de WhatsApp, le QR Code ou envia mensagens.
Configure a protecao da branch `main` para exigir os checks `Worker tests`,
`Frontend build` e `Evolution Docker smoke test` antes do merge.
