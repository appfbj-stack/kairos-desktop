# PRD Técnico — Kairos AI Core

> **Documento vivo.** Decisões travadas em 2026-08-06.
> Status: **rascunho aprovado para Fase 1**.

---

## 1. Visão do produto

Kairos Desktop AI é um **assistente empresarial inteligente** para Windows.
O usuário nunca vê PowerShell, terminal ou comandos do OpenSquad.
Toda interação é via interface gráfica (Electron + React).

**OpenSquad é componente interno** — não produto separado. O usuário final não sabe que ele existe.

---

## 2. Decisões travadas (Fase 0)

| # | Decisão | Escolha | Por quê |
|---|---------|---------|---------|
| D1 | Pipeline Executor | **Escrever do zero em TypeScript** dentro do Kairos AI Core | Mantém o Kairos standalone (sem IDE externa) |
| D2 | Provedores LLM v1 | **OpenRouter + OpenAI + Anthropic + Ollama** | 4 provedores, OpenRouter como rota primária (1 chave = 200+ modelos) |
| D3 | Memória | **SQLite-first + export Markdown** | FTS5 para busca, export para versionamento em git |
| D4 | Skills Windows v1 | **8 essenciais** (ver §5) | Corta 80% dos casos sem inflar escopo |
| D5 | Dashboard Phaser | **Manter como painel opcional** (toggle "modo escritório"); default é **Kanban + Chat** | Reduz complexidade de empacotamento Electron |
| D6 | Telemetria | **Opt-in** com toggle claro | Sem telemetria fica cego, opt-out irrita |
| D7 | LGPD | **Built-in desde v1** | Não custa no início, evita dor depois |
| D8 | OpenSquad source | **Fork `appfbj-stack/opensquad` 0.1.15** (vs upstream 0.1.14) | Você já tem customizações no fork |
| D9 | Domínio público | **`kairosdesktop.fbautomacao.space`** (subdomínio do VPS Dokploy 187.77.229.227) | Servidor de updates, docs, downloads, telemetria, marketplace |

---

## 3. Arquitetura — 5 camadas

```
┌──────────────────────────────────────────────────────────┐
│  1. Usuário                                               │
└──────────────┬───────────────────────────────────────────┘
               │ texto/voz
┌──────────────▼───────────────────────────────────────────┐
│  2. Kairos Desktop (Electron + React + TS)                │
│     - Chat, voz, tasks, skills, memory, settings          │
│     - System tray, global hotkeys, notifications          │
└──────────────┬───────────────────────────────────────────┘
               │ IPC (typed, context-isolated)
┌──────────────▼───────────────────────────────────────────┐
│  3. Kairos AI Core (Node.js + Clean Architecture)         │
│     ┌──────────────┬──────────────┬────────────────┐      │
│     │ domain       │ application  │ interface      │      │
│     │ entities     │ use cases    │ DTOs           │      │
│     │ value objs   │              │ presenters     │      │
│     │ domain events│              │                │      │
│     │ errors       │              │                │      │
│     ├──────────────┴──────────────┴────────────────┤      │
│     │ infrastructure (adapters)                    │      │
│     │   - LLM (4 providers)                        │      │
│     │   - Memory (SQLite + Markdown export)        │      │
│     │   - OpenSquad Bridge (importa módulos)       │      │
│     │   - Windows (8 skills nativas)               │      │
│     │   - Persistence (migrations, audit log)      │      │
│     └─────────────────────────────────────────────┘      │
│     - HTTP API (Fastify) em localhost:4096                │
│     - WebSocket para updates em tempo real                │
└──────────────┬───────────────────────────────────────────┘
               │ importa diretamente (sem CLI)
┌──────────────▼───────────────────────────────────────────┐
│  4. OpenSquad Engine (bundled)                            │
│     - skills.js, agents.js, runs.js, init.js             │
│     - 11 skills bundled (apify, canva, resend, ...)      │
│     - Pipeline Executor próprio (TS, em core/)            │
└──────────────┬───────────────────────────────────────────┘
               │ spawn / API / Playwright
┌──────────────▼───────────────────────────────────────────┐
│  5. Windows + Serviços externos                           │
│     - Sistema, programas, arquivos                        │
│     - 8 skills nativas v1                                 │
│     - APIs externas (Canva, Resend, Apify, ...)          │
└──────────────────────────────────────────────────────────┘
```

---

## 4. Kairos AI Core — state machine

O Core opera em **estados explícitos** com transições validadas:

```
              ┌────────────┐
              │   IDLE     │◄─────────────────┐
              └─────┬──────┘                  │
                    │ user input              │
                    ▼                         │
              ┌────────────┐                  │
              │ THINKING   │                  │
              │ (LLM call) │                  │
              └─────┬──────┘                  │
                    │                         │
        ┌───────────┼───────────┐             │
        ▼           ▼           ▼             │
  ┌──────────┐ ┌─────────┐ ┌─────────┐       │
  │ EXECUTING│ │ AWAITING│ │  ERROR  │       │
  │ skill(s) │ │ APPROVAL│ │         │       │
  └────┬─────┘ └────┬────┘ └────┬────┘       │
       │            │           │            │
       │            │ approved  │ recovered  │
       │            ▼           │            │
       │      ┌──────────┐      │            │
       │      │ EXECUTING│◄─────┘            │
       │      └────┬─────┘                   │
       │           │                         │
       └───────────┴─────────────────────────┘
                   done / all skills executed
```

**Regras de transição:**
- IDLE → THINKING: novo input do usuário
- THINKING → AWAITING_APPROVAL: LLM pediu tool call classificado como "crítico"
- THINKING → EXECUTING: tool call classificado como "safe"
- AWAITING_APPROVAL → EXECUTING: usuário aprovou
- AWAITING_APPROVAL → IDLE: usuário rejeitou (com reason)
- EXECUTING → THINKING: tool call retornou, LLM vai processar resultado
- EXECUTING → IDLE: tool call finalizou a tarefa
- * → ERROR: exceção não tratada
- ERROR → IDLE: erro recuperado (auto ou manual)

---

## 5. As 8 skills nativas Windows v1

| # | Skill | Função | Skills OSQ reaproveitadas |
|---|-------|--------|---------------------------|
| 1 | `windows-app-launcher` | Abrir/fechar programas (`start`, `taskkill`) | — |
| 2 | `windows-file-manager` | Mover/copiar/renomear/listar | — |
| 3 | `windows-search` | Buscar arquivos por nome/conteúdo (PowerShell + `Get-ChildItem`/`Select-String`) | — |
| 4 | `windows-clipboard` | Ler/escrever clipboard | — |
| 5 | `office-excel` | Preencher/ler planilhas (via `exceljs` ou COM automation) | — |
| 6 | `office-word` | Gerar documentos `.docx` (via `docx` npm) | — |
| 7 | `pdf-converter` | PDF ↔ DOCX/TXT/PNG (`pdf-parse`, `pdfkit`, `pdf2pic`) | — |
| 8 | `browser-controller` | Automação web (Playwright) | ✅ reusa OSQ |

**Critério de criticidade (aprovação obrigatória):**
- 🔴 Excluir arquivo/diretório
- 🔴 Enviar email/mensagem
- 🔴 Alterar dado financeiro
- 🔴 Fechar programa em uso
- 🟡 Escrever em arquivo fora de `~/Documents/Kairos/`
- 🟢 Ler arquivo, abrir programa, copiar, mover, gerar documento

---

## 6. Sistema de memória (3 níveis)

### 6.1 Nível Sistema
- Configurações globais do Kairos (tema, idioma, providers, etc.)
- **Storage:** `~/.kairos/system.db` (SQLite, tabela `settings`)
- **API:** `system.set(key, value)`, `system.get(key)`

### 6.2 Nível Empresa
- Nome, segmento, processos, pastas, modelos, fluxos, clientes, regras internas
- **Storage:** `~/.kairos/memory.db` (SQLite) + export para `~/.kairos/export/company/*.md` (versionável)
- **Schema:**
  ```sql
  CREATE TABLE entities (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,        -- 'person' | 'product' | 'process' | 'document'
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    content TEXT NOT NULL,      -- Markdown body
    tags TEXT,                   -- JSON array
    relations TEXT,              -- JSON array de {type, target_slug}
    created_at INTEGER,
    updated_at INTEGER
  );
  CREATE VIRTUAL TABLE entities_fts USING fts5(name, content, tags);
  ```

### 6.3 Nível Usuário
- Preferências, histórico de conversas, atalhos, últimas tarefas
- **Storage:** `~/.kairos/memory.db` (SQLite)
- **Schema:**
  ```sql
  CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    title TEXT,
    created_at INTEGER,
    updated_at INTEGER
  );
  CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT REFERENCES conversations(id),
    role TEXT,                  -- 'user' | 'assistant' | 'system' | 'tool'
    content TEXT,
    tool_calls TEXT,            -- JSON
    tool_results TEXT,          -- JSON
    ts INTEGER
  );
  CREATE TABLE user_preferences (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  ```

---

## 7. LLM Bridge — contrato

### 7.1 Interface comum (todos os provedores)

```typescript
interface LLMProvider {
  id: 'openrouter' | 'openai' | 'anthropic' | 'ollama';
  displayName: string;
  
  // Listagem dinâmica de modelos
  listModels(): Promise<ModelInfo[]>;
  
  // Invocation (streaming + non-streaming)
  invoke(request: InvokeRequest): Promise<AsyncIterable<Chunk>>;
  
  // Capabilities
  supportsTools(): boolean;
  supportsVision(): boolean;
  maxContextWindow(model: string): number;
  
  // Cost estimation
  estimateCost(model: string, inputTokens: number, outputTokens: number): number;
}
```

### 7.2 Tool Calling Protocol (function calling)

O Kairos Core expõe **tools** para o LLM. Cada tool = 1 skill ou 1 capability interna.

```typescript
type ToolDefinition = {
  name: string;              // ex: 'kairos_execute_skill'
  description: string;
  parameters: z.ZodSchema;   // zod para validação runtime
  requiresApproval: 'safe' | 'critical';
};

const TOOL_REGISTRY: ToolDefinition[] = [
  {
    name: 'kairos_execute_skill',
    description: 'Executa uma skill do catálogo',
    parameters: z.object({
      skillId: z.string(),
      args: z.record(z.unknown()).optional(),
    }),
    requiresApproval: 'safe', // cada skill declara seu próprio nível
  },
  {
    name: 'kairos_remember_entity',
    description: 'Salva uma entidade na memória da empresa',
    parameters: z.object({
      type: z.enum(['person', 'product', 'process', 'document']),
      name: z.string(),
      content: z.string(),
      tags: z.array(z.string()).optional(),
    }),
    requiresApproval: 'safe',
  },
  // ...
];
```

### 7.3 Model selection policy

- **Default por provider** (em `core/infrastructure/llm/policies/defaults.ts`)
- **User override** nas settings (provider + model preferidos)
- **Cota mensal** (input/output tokens) com alerta em 80% e bloqueio em 100%
- **Fallback chain:** se provider default falhar, tenta o próximo da lista

---

## 8. Approval flow

```
LLM ──tool_call──► Core
                     │
                     ▼
              ┌──────────────┐
              │ policy check │ (TOOL_REGISTRY[tool].requiresApproval)
              └──────┬───────┘
                     │
            ┌────────┴────────┐
            │                 │
        'safe'           'critical'
            │                 │
            ▼                 ▼
      ┌──────────┐    ┌──────────────────┐
      │ EXECUTE  │    │ AWAIT APPROVAL   │
      │ agora    │    │ - mostra modal   │
      └────┬─────┘    │ - loga no audit  │
           │          └────────┬─────────┘
           ▼                   │
       result                 │ user
           │              ┌────┴────┐
           │              │         │
           │          approved   rejected
           │              │         │
           ▼              ▼         ▼
       LLM ◄───────── EXECUTE   IDLE (com reason)
```

**Audit log:** toda aprovação/rejeição grava linha em `audit_log` (SQLite append-only).

---

## 9. Pipeline Executor (próprio, em `core/`)

O OpenSquad original **não tem runner programático** — a execução é feita pela IDE interpretando o prompt `runner.pipeline.md`. Para o Kairos ser standalone, escrevemos um executor em TypeScript que emula esse comportamento.

**Localização:** `core/infrastructure/opensquad/pipeline-executor.ts`

**Responsabilidades:**
1. Ler `squad.yaml` do squad
2. Resolver skills (checar `skills/<id>/SKILL.md`)
3. Gerar `state.json` inicial (squad, status, agents, step)
4. Iterar `pipeline.steps`:
   - Lançar `THINKING` state
   - Chamar LLM com prompt do step
   - Aguardar tool calls
   - Executar skills (com approval flow)
   - Atualizar `state.json` após cada handoff
5. Salvar run final em `squads/<name>/output/<run-id>/`
6. Notificar WebSocket subscribers

**Tamanho estimado:** 500-800 linhas TS.

---

## 10. Stack detalhado por camada

| Camada | Stack |
|--------|-------|
| Electron main | Node 20, Fastify, ws, pino, better-sqlite3, zod |
| Preload | TypeScript puro, contextBridge |
| Renderer | React 18, Zustand, Vite 6, TypeScript 5.6 |
| Core / Domain | TypeScript puro, sem deps externas |
| Core / Application | TypeScript + zod (validação de input) |
| Core / Infrastructure | openai, @anthropic-ai/sdk, better-sqlite3, chokidar |
| Build | TypeScript 5.6, Vite 6, electron-builder 25 |
| Testes | node --test (unit), Playwright (e2e) |

---

## 11. Fases de entrega (resumo)

| # | Fase | Semanas | Entregável |
|---|------|---------|------------|
| 0 | Repo + PRD | ✅ | Este commit |
| 1 | Kairos AI Core + LLM Bridge | 4-6 | API HTTP + 4 providers integrados |
| 2 | Memória SQLite + entities | 4-6 | 3 níveis funcionando |
| 3 | Electron shell + chat UI | 8-12 | Janela, sidebar, voice button |
| 4 | 8 skills Windows | 6-8 | Skills instaladas, testadas, documentadas |
| 5 | Pipeline Executor próprio | 4-6 | Emulação do OSQ runner |
| 6 | Approval + audit | 3-4 | Modal + SQLite log |
| 7 | Telemetria + LGPD | 3-4 | Toggle + export |
| 8 | Auto-update | 3-4 | electron-updater |
| 9 | Marketplace vertical | 6-8 | Igreja, imobiliária, escritório |

**Total estimado:** 36-52 semanas (9-12 meses) com 1 dev senior + 1 designer + 1 DevOps.

---

## 12. Riscos técnicos (revisão)

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| Skills `script` rodam com permissões integrais | 🔴 Alta | Sandbox (Docker/gVisor) antes de aceitar skills não-confiáveis |
| Pipeline Executor é trabalho novo (~500-800 linhas) | 🟡 Média | MVP pode executar skills avulsas antes de orquestrar pipelines |
| Auto-update race conditions (4 ecossistemas) | 🟡 Média | Update server central + lock local + rollback atômico |
| Custo de tokens imprevisível | 🟡 Média | Painel de gasto + alerta + cota |
| LGPD ausente em MVP | 🟡 Média | Built-in desde v1, mesmo que simples |
| Dependência do fork `appfbj-stack/opensquad` | 🟢 Baixa | Fica fácil voltar ao upstream; ref do fork é estável |

---

**Próximo passo:** iniciar Fase 1 — Kairos AI Core + LLM Bridge.
