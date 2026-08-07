# Kairos Update Server

Servidor Fastify que hospeda os instaladores e metadados de update do Kairos Desktop.

**Produção:** https://kairosdesktop.fbautomacao.space
**Container:** `kairos-update-server` (porta 4097)
**Stack:** Node 20, Fastify 5, TypeScript 5.6

## Quick start (dev)

```bash
npm install
npm run dev
# Servidor em http://localhost:4097
```

## Quick start (Docker)

```bash
docker build -t kairos-update-server .
docker run -p 4097:4097 -v $(pwd)/downloads:/app/downloads kairos-update-server
```

## Endpoints

- `GET /` — Info
- `GET /health` — Health check
- `GET /api/updates/manifest` — Versões publicadas
- `GET /api/updates/check?version=X&channel=stable` — Cliente checa update
- `GET /api/updates/latest` — `latest.yml` da versão mais recente
- `GET /downloads/{version}/{file}` — Download de instalador

## Estrutura de `downloads/`

```
downloads/
├── v0.1.0/
│   ├── Kairos-Desktop-AI-0.1.0-Setup.exe
│   ├── Kairos-Desktop-AI-0.1.0-Setup.exe.blockmap
│   └── latest.yml
├── v0.2.0/
│   ├── Kairos-Desktop-AI-0.2.0-Setup.exe
│   ├── Kairos-Desktop-AI-0.2.0-Setup.exe.blockmap
│   └── latest.yml
```

O `latest.yml` é gerado automaticamente pelo `electron-builder` quando o `--publish always` é usado.

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `PORT` | `4097` | Porta |
| `HOST` | `0.0.0.0` | Bind |
| `KAIROS_PUBLIC_URL` | `https://kairosdesktop.fbautomacao.space` | URL pública |
| `LOG_LEVEL` | `info` | Nível de log |
| `NODE_ENV` | `production` | Modo |
