# OpenSquad bundled

Este diretório conterá o **OpenSquad** bundled como motor interno do Kairos.

## Origem

Fork: `appfbj-stack/opensquad` (sua versão customizada, v0.1.15)
Upstream: `renatoasse/opensquad` v0.1.14

## Como é populado

Via `npm run kairos:init` (script em `scripts/kairos-init.mjs`):

1. Verifica se `opensquad/.opensquad-version` já existe
2. Se não, clona do fork `appfbj-stack/opensquad` na tag `v0.1.15`
3. Copia `skills/`, `squads/`, `_opensquad/`, etc. para cá
4. Grava a versão em `.opensquad-version`

## Como o Kairos usa

- **Skills bundled** (11 originais) são registradas no Kairos Skill Registry
- **Squad templates** são listados na UI
- **Pipeline Executor** (escrito em TypeScript) consome `squad.yaml` e `squad-party.csv`
- **`_opensquad/core/`** é importado diretamente pelos adapters de `core/infrastructure/opensquad/`

## Atualização

- Automática via `npx kairos update --core` (Fase 8)
- Manual via `npm run kairos:init -- --force` (re-baixar)

---

**Status:** Estrutura reservada. Conteúdo baixado na primeira execução.
