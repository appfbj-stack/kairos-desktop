# Deploy — Kairos Desktop AI

Infraestrutura de suporte ao Kairos Desktop AI rodando no **VPS Dokploy** (`187.77.229.227`).

> O Kairos em si é um **app desktop** (Electron) instalado no Windows do usuário.
> Esta pasta contém os **servidores de suporte** que ficam online 24/7.

## Domínio

**`kairosdesktop.fbautomacao.space`** (wildcard SSL já configurado no Caddy do VPS)

## Arquitetura

```
                         kairosdesktop.fbautomacao.space
                                      │
                                      ▼
                          ┌─────────────────────────┐
                          │  Caddy (Dokploy nativo) │
                          │  *.fbautomacao.space    │
                          └──────────┬──────────────┘
                                     │
                ┌────────────────────┼────────────────────┐
                │                    │                    │
                ▼                    ▼                    ▼
        /downloads/*         /api/updates/*           /api/*
                │                    │                    │
                └────────┬───────────┘                    │
                         ▼                                ▼
              ┌────────────────────┐            ┌──────────────────┐
              │ kairos-update-     │            │ kairos-*         │
              │ server (Fastify)   │            │ (futuro)         │
              │ porta 4097         │            │ - marketplace    │
              └────────────────────┘            │ - telemetry      │
                                                │ - license server │
                                                └──────────────────┘
```

## Serviços atuais (Fase 0)

### `kairos-update-server` (Fastify + Node 20)

**Função:** Hospeda instaladores do Kairos Desktop e metadados consumidos pelo `electron-updater`.

**Endpoints:**
- `GET /` — Info do servidor
- `GET /health` — Health check (Dokploy monitora isso)
- `GET /api/updates/manifest` — Lista versões publicadas
- `GET /api/updates/check?version=X&channel=stable` — Cliente checa update
- `GET /api/updates/latest` — Retorna `latest.yml` da versão mais recente
- `GET /downloads/{version}/{file}` — Download direto do instalador

**Tamanho:** ~50 linhas TS (Fase 0) → ~300 linhas (Fase 8 completo)

## Como fazer deploy

### Opção A — Dokploy UI (recomendado)

1. Acesse `http://187.77.229.227:3000`
2. **Create Project** → nome: `Kairos Desktop`
3. **Create Service** → tipo: `Docker Compose`
4. **Source**: aponte para `https://github.com/appfbj-stack/kairos-desktop`
5. **Branch**: `main`
6. **Docker Compose Path**: `deploy/docker-compose.yml`
7. **Domain**: `kairosdesktop.fbautomacao.space` (porta 80/443)
8. **Deploy** 🚀

### Opção B — Docker local (teste)

```bash
cd deploy
docker compose up -d
curl http://localhost:4097/health
```

### Opção C — VPS manual via SSH

```bash
ssh -i C:\Users\ferna\.ssh\vps root@187.77.229.227

# Cria diretório
mkdir -p /opt/kairos && cd /opt/kairos

# Clona repo
git clone https://github.com/appfbj-stack/kairos-desktop.git .

# Build + start
cd deploy
docker compose up -d --build

# Verifica
curl https://kairosdesktop.fbautomacao.space/health
```

## Workflow de release (Fase 8)

Quando uma nova versão do Kairos for lançada:

```bash
# 1. Em uma maquina com electron-builder, buildar o instalador
cd kairos-desktop
npm run package

# 2. O instalador vai para ./release/${version}/
ls release/0.2.0/

# 3. Copiar para o servidor
scp -i C:\Users\ferna\.ssh\vps -r release/0.2.0/ \
  root@187.77.229.227:/opt/kairos/downloads/

# 4. (Opcional) Renomear para o padrao
ssh -i C:\Users\ferna\.ssh\vps root@187.77.229.227 \
  "mv /opt/kairos/downloads/0.2.0 /opt/kairos/downloads/v0.2.0"

# 5. Verificar
curl https://kairosdesktop.fbautomacao.space/api/updates/manifest
```

## Variáveis de ambiente (Dokploy)

Configure no painel do Dokploy:

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `KAIROS_PUBLIC_URL` | `https://kairosdesktop.fbautomacao.space` | URL pública do servidor |
| `PORT` | `4097` | Porta interna do Fastify |
| `HOST` | `0.0.0.0` | Interface de bind |
| `LOG_LEVEL` | `info` | Nível de log |
| `NODE_ENV` | `production` | Modo |

## Próximos serviços (roadmap)

| Fase | Serviço | Função |
|------|---------|--------|
| 5 | `kairos-marketplace` | Catálogo de skills verticais |
| 7 | `kairos-telemetry` | Telemetria opt-in (LGPD compliant) |
| 8 | `kairos-license` | Validação de licença (enterprise) |
| 8 | `kairos-stats` | Dashboard de uso (auto-hospedado) |
| 9 | `kairos-skills-registry` | Registry público de skills |

Cada um será um container separado no mesmo `docker-compose.yml`.

## Logs

```bash
# Dokploy UI → Service → Logs (recomendado)

# Manual via SSH
ssh -i C:\Users\ferna\.ssh\vps root@187.77.229.227
docker logs -f kairos-update-server
```

## Backup

O volume `kairos-update-downloads` contém todos os instaladores publicados. Backup:

```bash
ssh -i C:\Users\ferna\.ssh\vps root@187.77.229.227 \
  "docker run --rm -v kairos-update-downloads:/data -v \$(pwd):/backup alpine tar czf /backup/kairos-downloads-\$(date +%F).tar.gz /data"
```
