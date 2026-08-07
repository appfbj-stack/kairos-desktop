# Arquitetura — Kairos Desktop AI

> **Complementa o PRD técnico.** Foco em decisões, diagramas e trade-offs.

**Domínio público:** `kairosdesktop.fbautomacao.space` (VPS Dokploy 187.77.229.227)
**Sub-recursos:**
- `/` — Landing page
- `/docs` — Documentação
- `/downloads` — Instaladores Windows/Mac/Linux (auto-update)
- `/api/updates` — Endpoint de versionamento (electron-updater)
- `/api/telemetry` — Telemetria opt-in
- `/api/marketplace` — Skills verticais (Fase 9)
- `/status` — Status público

---

## 1. Decisões arquiteturais (ADRs)

### ADR-001 — Electron como runtime desktop

**Status:** Aceito
**Data:** 2026-08-06

**Contexto:** O Kairos precisa rodar nativamente no Windows, com acesso a sistema de arquivos, clipboard, programas, e APIs do Office. Opções: Electron, Tauri, nativo (C#), Wails.

**Decisão:** Electron 33.

**Razões:**
- Node.js embutido (compatibilidade 100% com OpenSquad)
- Ecossistema maduro (electron-builder, electron-updater)
- Mesma stack do OpenSquad upstream (facilita reuso)
- Permite reusar o dashboard Phaser (futuro)
- TypeScript nativo

**Trade-offs aceitos:**
- Tamanho do binário (~150MB) — aceitável para desktop empresarial
- Consumo de RAM (~200MB) — aceitável
- Não suporta mobile (decisão consciente: foco Windows)

---

### ADR-002 — Clean Architecture (Domain / Application / Infrastructure / Interface)

**Status:** Aceito

**Contexto:** PRD exige SOLID, CA, DDD, EDA. Como dividir o código?

**Decisão:** 4 camadas, sem framework:
- **Domain** — entidades puras, value objects, domain events, erros
- **Application** — use cases, orquestração
- **Infrastructure** — adapters para mundo externo (LLM, SQLite, OSQ, Windows)
- **Interface** — DTOs e presenters (input/output boundary)

**Razões:**
- Testabilidade (domain sem deps, application testável com mocks)
- Substituibilidade (trocar SQLite por Postgres = 1 adapter)
- Clareza (cada arquivo tem 1 responsabilidade)

**Trade-offs:**
- Mais arquivos que MVC puro
- Overhead de DTOs (mitigado por type aliases)

---

### ADR-003 — OpenSquad como fork bundled, não como dependência npm

**Status:** Aceito (pendente validação: usar `appfbj-stack/opensquad` ou `renatoasse/opensquad`)

**Contexto:** O OSQ pode ser instalado via `npm install opensquad` ou bundled como submódulo/git subtree.

**Decisão:** Bundled em `opensquad/` no repo, com download automático via `scripts/kairos-init.mjs`.

**Razões:**
- Versão fixa (não quebra com update upstream)
- Permite patchar bugs sem esperar upstream
- Auditável (você vê exatamente o que está rodando)

**Trade-offs:**
- Precisa de merge/rebase periódico do upstream
- Fork pode divergir

---

### ADR-004 — SQLite-first + Markdown export

**Status:** Aceito

**Contexto:** Memória pode ser 100% Markdown (estilo OSQ) ou 100% SQLite, ou híbrido.

**Decisão:** Híbrido:
- **SQLite** é source of truth (rápido, FTS5, relações)
- **Markdown** é export versionável (git-friendly, legível)

**Razões:**
- Melhor dos dois mundos
- Export para git permite auditoria humana
- Import de Markdown existente (migração de OSQ puro)

---

### ADR-005 — 4 provedores LLM com OpenRouter como rota primária

**Status:** Aceito

**Decisão:** Suportar OpenRouter, OpenAI, Anthropic, Ollama desde v1.

**Razões:**
- OpenRouter = 1 chave, 200+ modelos, fallback automático
- OpenAI = usuários que já têm assinatura
- Anthropic = Claude (excelente para agentic tasks)
- Ollama = offline/grátis (alinha com público não-técnico)

---

### ADR-006 — LLM Bridge como contrato (interface) com adapters

**Status:** Aceito

**Decisão:** `core/infrastructure/llm/` define `LLMProvider` interface. Cada provedor é um adapter.

**Razões:**
- Trocar provedor = 0 mudança no Application
- Adicionar provedor = 1 novo arquivo

---

## 2. Diagrama de sequência — mensagem do usuário

```
User           Renderer         Main Process      Core           LLM           Skills
 │                │                  │              │              │              │
 │  type msg      │                  │              │              │              │
 │───────────────►│                  │              │              │              │
 │                │  ipc('chat:send')│              │              │              │
 │                │─────────────────►│              │              │              │
 │                │                  │  invoke      │              │              │
 │                │                  │  SendMsg     │              │              │
 │                │                  │  UseCase     │              │              │
 │                │                  │─────────────►│              │              │
 │                │                  │              │  stream      │              │
 │                │                  │              │─────────────►│              │
 │                │                  │              │              │              │
 │                │                  │              │  ◄─ chunks   │              │
 │                │                  │              │              │              │
 │                │                  │              │  tool_call?  │              │
 │                │                  │              │◄─────────────│              │
 │                │                  │              │              │              │
 │                │                  │              │  classify    │              │
 │                │                  │              │  'safe'?     │              │
 │                │                  │              │─────────┐    │              │
 │                │                  │              │         │    │              │
 │                │                  │              │  yes    │    │              │
 │                │                  │              │◄────────┘    │              │
 │                │                  │              │              │              │
 │                │                  │              │  execute     │              │
 │                │                  │              │  skill       │              │
 │                │                  │              │─────────────────────────────►
 │                │                  │              │              │              │
 │                │                  │              │  result      │              │
 │                │                  │              │◄─────────────────────────────
 │                │                  │              │              │              │
 │                │                  │              │  invoke LLM  │              │
 │                │                  │              │  (with tool  │              │
 │                │                  │              │   result)    │              │
 │                │                  │              │─────────────►│              │
 │                │                  │              │              │              │
 │                │                  │              │  final text  │              │
 │                │                  │              │◄─────────────│              │
 │                │                  │              │              │              │
 │                │                  │  stream     │              │              │
 │                │                  │  chunks     │              │              │
 │                │                  │◄─────────────│              │              │
 │                │  ws('chat:chunk')│              │              │              │
 │                │◄─────────────────│              │              │              │
 │  render chunk  │                  │              │              │              │
 │◄───────────────│                  │              │              │              │
```

---

## 3. Mapa de módulos

```
src/main/                       Electron main process
├── index.ts                    Entry point
├── window.ts                   BrowserWindow factory
├── ipc/
│   ├── chat.handler.ts         IPC: chat:send, chat:stream
│   ├── skills.handler.ts       IPC: skills:list, skills:install
│   ├── memory.handler.ts       IPC: memory:recall, memory:store
│   ├── approvals.handler.ts    IPC: approval:request, approval:respond
│   └── updates.handler.ts      IPC: update:check, update:apply
├── services/
│   ├── auto-updater.ts         electron-updater wrapper
│   ├── system-tray.ts          Tray icon + menu
│   ├── global-hotkeys.ts       Ctrl+Shift+K etc.
│   └── notifications.ts        Native Windows toasts
└── events/
    ├── event-bus.ts            Internal pub/sub (pino-based)
    └── event-logger.ts         Persist events to audit log

src/preload/                    Context bridge
└── index.ts                    Expose safe API to renderer

src/renderer/                   React UI
├── App.tsx                     Root component
├── main.tsx                    React DOM entry
├── components/
│   ├── Chat/                   Chat panel + input + voice
│   ├── Sidebar/                Navigation
│   ├── Tasks/                  Kanban de tarefas
│   ├── Skills/                 Marketplace + detalhes
│   ├── Memory/                 Visualizador de entities
│   └── Settings/               Providers, preferências
├── pages/                      Home, Skills, Memory, Settings
├── store/                      Zustand stores
├── hooks/                      useChatSocket, useVoice etc.
└── styles/                     globals.css, theme.ts

src/shared/                     Tipos compartilhados
├── ipc-channels.ts             Constantes de canais IPC
├── types/
│   ├── chat.ts
│   ├── skill.ts
│   ├── memory.ts
│   └── llm.ts
└── constants.ts

core/                           Kairos AI Core (Clean Architecture)
├── domain/                     SEM dependências externas
│   ├── entities/
│   │   ├── message.entity.ts
│   │   ├── conversation.entity.ts
│   │   ├── skill.entity.ts
│   │   ├── memory-entry.entity.ts
│   │   └── approval.entity.ts
│   ├── value-objects/
│   │   ├── llm-provider.vo.ts
│   │   ├── tool-call.vo.ts
│   │   ├── approval-policy.vo.ts
│   │   └── token-estimate.vo.ts
│   ├── events/
│   │   ├── domain-event.ts
│   │   ├── message-received.event.ts
│   │   ├── skill-executed.event.ts
│   │   └── approval-requested.event.ts
│   └── errors/
│       ├── domain.error.ts
│       ├── validation.error.ts
│       └── approval-required.error.ts
├── application/                Use cases
│   ├── chat/
│   │   ├── send-message.usecase.ts
│   │   └── stream-response.usecase.ts
│   ├── skills/
│   │   ├── list-skills.usecase.ts
│   │   ├── install-skill.usecase.ts
│   │   ├── execute-skill.usecase.ts
│   │   └── create-skill.usecase.ts
│   ├── memory/
│   │   ├── recall-entities.usecase.ts
│   │   ├── store-entity.usecase.ts
│   │   └── search-entities.usecase.ts
│   ├── llm/
│   │   ├── invoke-llm.usecase.ts
│   │   └── select-model.usecase.ts
│   └── approval/
│       ├── request-approval.usecase.ts
│       └── respond-approval.usecase.ts
├── infrastructure/             Adapters (mundo externo)
│   ├── llm/
│   │   ├── llm-provider.interface.ts
│   │   ├── openrouter.adapter.ts
│   │   ├── openai.adapter.ts
│   │   ├── anthropic.adapter.ts
│   │   └── ollama.adapter.ts
│   ├── memory/
│   │   ├── sqlite.repository.ts
│   │   ├── markdown.exporter.ts
│   │   └── fts-indexer.ts
│   ├── opensquad/
│   │   ├── opensquad-bridge.ts
│   │   ├── pipeline-executor.ts
│   │   └── skills-bridge.ts
│   ├── windows/
│   │   ├── app-launcher.adapter.ts
│   │   ├── file-manager.adapter.ts
│   │   ├── search.adapter.ts
│   │   ├── clipboard.adapter.ts
│   │   ├── excel.adapter.ts
│   │   ├── word.adapter.ts
│   │   ├── pdf.adapter.ts
│   │   └── browser.adapter.ts
│   └── persistence/
│       ├── migrations/
│       │   ├── 001_init.sql
│       │   └── runner.ts
│       └── audit-log.repository.ts
└── interface/                  Boundary
    ├── dto/
    │   ├── chat.dto.ts
    │   ├── skill.dto.ts
    │   └── memory.dto.ts
    └── presenters/
        └── (formatters)
```

---

## 4. Padrões e convenções

- **Naming:** camelCase para TS, kebab-case para arquivos, PascalCase para classes
- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`)
- **Branches:** `feat/`, `fix/`, `chore/`
- **Tests:** arquivo ao lado (`foo.ts` + `foo.test.ts`) ou em `tests/`
- **Errors:** classes custom extending `DomainError`
- **Async:** Promises + async/await, sem callbacks
- **Logging:** pino com `pino-pretty` em dev
- **Validation:** zod em todos os input boundaries (IPC, HTTP, file read)

---

## 5. Quando NÃO usar esta arquitetura

- Projetos com 1-2 devs e <5k linhas
- MVPs descartáveis
- Scripts one-shot

Para o Kairos, faz sentido porque é um produto com **vida útil longa (5+ anos)**, **múltiplas integrações** e **time crescente**.
