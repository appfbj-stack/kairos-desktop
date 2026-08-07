# Roadmap — Kairos Desktop AI

> Plano de execução faseado. Cada fase termina com demo funcional e código commitado.

---

## Fase 0 — Fundação ✅ EM CURSO
**Duração:** 1 semana
**Status:** Em curso (este commit)

**Entregáveis:**
- [x] Repositório `kairos-desktop` criado
- [x] Estrutura Clean Architecture definida
- [x] package.json, tsconfig (4 variantes), .gitignore, .env.example
- [x] electron-builder.yml
- [x] README, LICENSE, .editorconfig, .prettierrc
- [x] PRD técnico
- [x] Documento de arquitetura
- [x] Roadmap

**Commit inicial:** `chore: bootstrap kairos-desktop repo`

---

## Fase 1 — Kairos AI Core + LLM Bridge
**Duração:** 4-6 semanas
**Pré-requisito:** Fase 0 ✅

**Entregáveis:**
- [ ] `core/domain/` — entidades + VOs + domain events + errors
- [ ] `core/application/llm/invoke-llm.usecase.ts`
- [ ] `core/application/llm/select-model.usecase.ts`
- [ ] `core/infrastructure/llm/llm-provider.interface.ts` (contrato)
- [ ] `core/infrastructure/llm/openrouter.adapter.ts` (1º, prioritário)
- [ ] `core/infrastructure/llm/openai.adapter.ts`
- [ ] `core/infrastructure/llm/anthropic.adapter.ts`
- [ ] `core/infrastructure/llm/ollama.adapter.ts`
- [ ] `core/infrastructure/llm/policies/defaults.ts`
- [ ] Fastify server em `localhost:4096` com:
  - `POST /chat` (texto → resposta)
  - `GET /models?provider=...`
  - `POST /tools/invoke` (teste)
- [ ] Testes unitários dos adapters (mock da SDK)
- [ ] Documentação: como adicionar novo provider

**Commit final:** `feat(core): LLM Bridge with 4 providers (OpenRouter, OpenAI, Anthropic, Ollama)`

---

## Fase 2 — Memória SQLite + Entities
**Duração:** 4-6 semanas
**Pré-requisito:** Fase 1

**Entregáveis:**
- [ ] `core/infrastructure/persistence/migrations/001_init.sql`
- [ ] `core/infrastructure/persistence/migrations/runner.ts`
- [ ] `core/infrastructure/memory/sqlite.repository.ts`
- [ ] `core/infrastructure/memory/fts-indexer.ts`
- [ ] `core/infrastructure/memory/markdown.exporter.ts`
- [ ] `core/application/memory/recall-entities.usecase.ts`
- [ ] `core/application/memory/store-entity.usecase.ts`
- [ ] `core/application/memory/search-entities.usecase.ts`
- [ ] Tabelas: `entities`, `entities_fts`, `conversations`, `messages`, `user_preferences`, `system_settings`, `audit_log`
- [ ] Testes: CRUD + FTS + export
- [ ] CLI: `kairos memory search "..."`

**Commit final:** `feat(core): 3-tier memory (system/company/user) with FTS5 + markdown export`

---

## Fase 3 — Electron Shell + Chat UI
**Duração:** 8-12 semanas
**Pré-requisito:** Fase 1 (Fase 2 pode vir em paralelo)

**Entregáveis:**
- [ ] `src/main/index.ts` — entry, lifecycle, app menu
- [ ] `src/main/window.ts` — BrowserWindow factory
- [ ] `src/main/services/system-tray.ts`
- [ ] `src/main/services/global-hotkeys.ts` (Ctrl+Shift+K abre chat)
- [ ] `src/main/ipc/chat.handler.ts` — bridge para Core
- [ ] `src/preload/index.ts` — contextBridge
- [ ] `src/renderer/main.tsx` + `App.tsx`
- [ ] `src/renderer/components/Chat/ChatPanel.tsx`
- [ ] `src/renderer/components/Chat/MessageList.tsx`
- [ ] `src/renderer/components/Chat/InputBar.tsx`
- [ ] `src/renderer/components/Sidebar/Sidebar.tsx`
- [ ] `src/renderer/store/chat.store.ts` (Zustand)
- [ ] `src/renderer/styles/globals.css` + tema light/dark
- [ ] WebSocket entre renderer e main (`ws://localhost:4096/ws`)
- [ ] Vite config para dev com HMR
- [ ] `npm run dev` funcional (Electron + Vite HMR)
- [ ] Build de produção: `npm run build && npm run package`
- [ ] Testes E2E com Playwright

**Commit final:** `feat(desktop): Electron shell + chat UI + voice button (Phase 3)`

---

## Fase 4 — 8 Skills Windows Nativas
**Duração:** 6-8 semanas
**Pré-requisito:** Fase 1 (precisa do Core) + Fase 3 (precisa da UI)

**Entregáveis:**
- [ ] `core/infrastructure/windows/app-launcher.adapter.ts`
- [ ] `core/infrastructure/windows/file-manager.adapter.ts`
- [ ] `core/infrastructure/windows/search.adapter.ts`
- [ ] `core/infrastructure/windows/clipboard.adapter.ts`
- [ ] `core/infrastructure/windows/excel.adapter.ts` (exceljs)
- [ ] `core/infrastructure/windows/word.adapter.ts` (docx)
- [ ] `core/infrastructure/windows/pdf.adapter.ts` (pdf-parse, pdfkit, pdf2pic)
- [ ] `core/infrastructure/windows/browser.adapter.ts` (Playwright)
- [ ] Cada skill com seu `SKILL.md` (formato OSQ)
- [ ] `core/application/skills/execute-skill.usecase.ts` com approval flow
- [ ] UI: painel "Skills" mostra as 8 + status
- [ ] Testes de cada skill (unit + integration)
- [ ] Documentação: como instalar/atualizar skill

**Commit final:** `feat(skills): 8 native Windows skills (Phase 4)`

---

## Fase 5 — Pipeline Executor Próprio
**Duração:** 4-6 semanas
**Pré-requisito:** Fase 4

**Entregáveis:**
- [ ] `core/infrastructure/opensquad/opensquad-bridge.ts` (importa módulos do OSQ bundled)
- [ ] `core/infrastructure/opensquad/pipeline-executor.ts` (~500-800 linhas)
- [ ] `core/infrastructure/opensquad/skills-bridge.ts`
- [ ] Lê `squad.yaml` + executa steps + gera `state.json`
- [ ] Notificação WS em tempo real
- [ ] Squad de exemplo: `carrossel-news-cc` (do OSQ) rodando dentro do Kairos
- [ ] Testes E2E

**Commit final:** `feat(bridge): opensquad pipeline executor with state.json + WS notifications`

---

## Fase 6 — Approval + Audit
**Duração:** 3-4 semanas
**Pré-requisito:** Fase 4

**Entregáveis:**
- [ ] `core/domain/entities/approval.entity.ts`
- [ ] `core/domain/value-objects/approval-policy.vo.ts`
- [ ] `core/application/approval/request-approval.usecase.ts`
- [ ] `core/application/approval/respond-approval.usecase.ts`
- [ ] `core/infrastructure/persistence/audit-log.repository.ts`
- [ ] UI: `ApprovalModal.tsx` (mostra diff da ação, botões Aprovar/Rejeitar)
- [ ] Classificação automática: safe vs critical por tool/skill
- [ ] Audit log imutável (SQLite append-only)
- [ ] Página "Audit Log" com filtro
- [ ] Export CSV para compliance

**Commit final:** `feat(security): approval flow + audit log (Phase 6)`

---

## Fase 7 — Telemetria Opt-in + LGPD
**Duração:** 3-4 semanas
**Pré-requisito:** Fase 6

**Entregáveis:**
- [ ] Toggle de telemetria em Settings (default OFF)
- [ ] `core/infrastructure/telemetry/anonymous-collector.ts`
- [ ] Endpoint local de export: "baixar todos os meus dados" (LGPD art. 18)
- [ ] Endpoint de exclusão: "apagar tudo"
- [ ] Banner de consentimento na primeira execução
- [ ] Documentação de privacidade
- [ ] Testes de export/exclusão

**Commit final:** `feat(privacy): opt-in telemetry + LGPD data export/deletion`

---

## Fase 8 — Auto-update
**Duração:** 3-4 semanas
**Pré-requisito:** Fase 7

**Entregáveis:**
- [ ] `src/main/services/auto-updater.ts` (electron-updater)
- [ ] Update server (GitHub Releases ou custom)
- [ ] Versionamento encadeado: Kairos + OpenSquad bundled + Skills bundled
- [ ] Backup automático antes de update
- [ ] Rollback atômico em caso de falha
- [ ] UI: banner "Nova versão disponível"
- [ ] Testes: simular update falho → rollback

**Commit final:** `feat(updater): auto-update with atomic rollback (Phase 8)`

---

## Fase 9 — Marketplace Vertical
**Duração:** 6-8 semanas
**Pré-requisito:** Fase 8

**Entregáveis:**
- [ ] Catálogo de skills verticais (igreja, imobiliária, escritório, engenharia)
- [ ] UI: Skill Marketplace (busca, filtro, install)
- [ ] Skill `kairos-skill-creator` integrada
- [ ] Versionamento semver + hash SHA-256
- [ ] Allowlist de skills confiáveis
- [ ] Documentação por vertical (case studies)
- [ ] Pilotos: 3 igrejas, 2 imobiliárias, 1 escritório

**Commit final:** `feat(marketplace): vertical skills catalog (church/real-estate/office)`

---

## Resumo

| Fase | Duração | Acumulado |
|------|---------|-----------|
| 0 | 1 sem | 1 sem |
| 1 | 4-6 sem | 5-7 sem |
| 2 | 4-6 sem | 9-13 sem |
| 3 | 8-12 sem | 17-25 sem |
| 4 | 6-8 sem | 23-33 sem |
| 5 | 4-6 sem | 27-39 sem |
| 6 | 3-4 sem | 30-43 sem |
| 7 | 3-4 sem | 33-47 sem |
| 8 | 3-4 sem | 36-51 sem |
| 9 | 6-8 sem | 42-59 sem |

**Total: 10-14 meses** com 1 dev senior + 1 designer + 1 DevOps em paralelo.

**MVP mínimo para uso real:** até o fim da Fase 4 (6-9 meses).
**Versão comercial:** fim da Fase 8 (10-13 meses).
**Marketplace vertical:** fim da Fase 9 (12-15 meses).
