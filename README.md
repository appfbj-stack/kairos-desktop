# Kairos Desktop AI

> **Assistente empresarial inteligente para Windows.**
> Powered by [OpenSquad](https://github.com/appfbj-stack/opensquad) como motor interno de orquestração de agentes e skills.

🌐 **Site:** [kairosdesktop.fbautomacao.space](https://kairosdesktop.fbautomacao.space)
📦 **Updates:** [kairosdesktop.fbautomacao.space/downloads](https://kairosdesktop.fbautomacao.space/downloads)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933)](https://nodejs.org)
[![Electron](https://img.shields.io/badge/Electron-33-47848F)](https://www.electronjs.org)
[![Status](https://img.shields.io/badge/status-MVP%20em%20constru%C3%A7%C3%A3o-orange)]()

---

## O que é

Kairos é um **agente de IA desktop** que conversa com o usuário em linguagem natural (texto e voz), entende comandos, planeja tarefas, executa ações no Windows e aprende os processos da empresa ao longo do tempo. Usa o **OpenSquad** como motor interno — você nunca precisa abrir PowerShell ou terminal.

**Não é um CRM.** O CRM é só um módulo. O verdadeiro produto é um assistente que **trabalha no seu computador** enquanto a LLM atua como cérebro.

---

## Arquitetura

```
┌──────────────────────────────────────────────────────────┐
│  Usuário                                                 │
└──────────────┬───────────────────────────────────────────┘
               │ (texto/voz)
┌──────────────▼───────────────────────────────────────────┐
│  Kairos Desktop (Electron + React)                       │
│  - Chat, voz, tasks, skills, memória, settings           │
└──────────────┬───────────────────────────────────────────┘
               │ IPC
┌──────────────▼───────────────────────────────────────────┐
│  Kairos AI Core (Node.js + Clean Architecture)           │
│  - Domain / Application / Infrastructure / Interface    │
│  - LLM Bridge (OpenRouter, OpenAI, Anthropic, Ollama)   │
│  - Memory (SQLite + Markdown export)                    │
│  - Approval flow                                         │
└──────────────┬───────────────────────────────────────────┘
               │ módulos importados diretamente
┌──────────────▼───────────────────────────────────────────┐
│  OpenSquad Engine (bundled, fork appfbj-stack/opensquad) │
│  - Skills (mcp / script / hybrid / prompt)              │
│  - Pipeline Executor (próprio)                          │
│  - Memory (file-first)                                  │
└──────────────┬───────────────────────────────────────────┘
               │ spawn / API
┌──────────────▼───────────────────────────────────────────┐
│  Skills + Windows                                        │
│  - 8 skills nativas v1 (file, clipboard, Office, PDF)   │
│  - Sistema / Programas / Navegador / Rede               │
└──────────────────────────────────────────────────────────┘
```

---

## Stack

- **Electron 33** — desktop runtime
- **React 18 + TypeScript 5.6** — UI
- **Vite 6** — build do renderer
- **Zustand** — state management
- **better-sqlite3** — memória local
- **Fastify** — API HTTP interna (Kairos AI Core)
- **pino** — logs estruturados
- **zod** — validação
- **ws** — WebSocket (IPC e updates)
- **electron-builder** — empacotamento (NSIS / DMG / AppImage)

---

## Estrutura do repositório

```
kairos-desktop/
├── src/
│   ├── main/           # Electron main process (IPC, services, events)
│   ├── preload/        # Context bridge (exposição segura de APIs)
│   ├── renderer/       # React UI (chat, voice, tasks, skills, memory)
│   └── shared/         # Tipos compartilhados main ↔ renderer
├── core/               # Kairos AI Core (Clean Architecture)
│   ├── domain/         # Entities, VOs, domain events, errors
│   ├── application/    # Use cases (chat, skills, memory, llm)
│   ├── infrastructure/ # Adapters (LLM, memory, opensquad, windows)
│   └── interface/      # DTOs, presenters
├── opensquad/          # OpenSquad bundled (motor interno)
├── skills/             # Kairos Skills bundled
├── scripts/            # dev.mjs, build.mjs, kairos-init.mjs
├── tests/              # unit, integration, e2e
├── resources/          # ícones, assets
└── docs/               # PRD, arquitetura, roadmap
```

---

## Roadmap

| Fase | Status | Entregável |
|------|--------|------------|
| 0 — Repositório + PRD técnico | 🟡 Em curso | Este commit |
| 1 — Kairos AI Core + LLM Bridge | ⏳ | OpenRouter/OpenAI/Anthropic/Ollama integrados |
| 2 — Memória SQLite + entities | ⏳ | 3 níveis (Sistema / Empresa / Usuário) |
| 3 — Electron shell + chat UI | ⏳ | Janela, sidebar, input, voice button |
| 4 — 8 skills Windows nativas | ⏳ | file/clipboard/Office/PDF/browser |
| 5 — Pipeline Executor próprio | ⏳ | Emulação do OSQ runner em TS |
| 6 — Aprovação de ações + audit log | ⏳ | Modal + SQLite log |
| 7 — Telemetria opt-in + LGPD | ⏳ | Toggle + export de dados |
| 8 — Auto-update (Kairos + OSQ + Skills) | ⏳ | electron-updater + versionamento |
| 9 — Marketplace de Skills verticais | ⏳ | Igreja, imobiliária, escritório |

Veja [`docs/ROADMAP.md`](docs/ROADMAP.md) para detalhes.

---

## Desenvolvimento

```bash
# instalar dependências
npm install

# modo dev (Electron + Vite HMR)
npm run dev

# type-check
npm run typecheck

# testes
npm test

# build de produção
npm run build

# empacotar instalador
npm run package
```

**Requisitos:** Node.js 20+, npm 10+.

---

## Configuração inicial

```bash
# 1. copiar .env
cp .env.example .env

# 2. preencher pelo menos 1 provedor LLM
#    (recomendado: OpenRouter - 1 chave = 200+ modelos)
nano .env

# 3. primeira execução
npm run kairos:init
npm run dev
```

---

## Documentação

- [`docs/PRD-TECNICO.md`](docs/PRD-TECNICO.md) — Especificação técnica do Kairos AI Core
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Decisões arquiteturais e diagramas
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — Fases e entregáveis

---

## Licença

MIT © 2026 Fernando Borges — veja [`LICENSE`](LICENSE).
