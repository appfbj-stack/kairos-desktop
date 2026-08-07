# Kairos Skills

Este diretório contém as **skills nativas** do Kairos Desktop AI.

Cada skill segue o formato OpenSquad (compatível 100%):

```
skills/<skill-id>/
├── SKILL.md           # Obrigatório - frontmatter YAML + instruções
├── scripts/           # Opcional - scripts locais
├── references/        # Opcional - arquivos de referência
└── assets/            # Opcional - recursos visuais
```

## Skills v1 (Fase 4)

| # | Skill | Função |
|---|-------|--------|
| 1 | `windows-app-launcher` | Abrir/fechar programas |
| 2 | `windows-file-manager` | Mover/copiar/renomear/listar |
| 3 | `windows-search` | Buscar arquivos |
| 4 | `windows-clipboard` | Ler/escrever clipboard |
| 5 | `office-excel` | Preencher/ler planilhas |
| 6 | `office-word` | Gerar .docx |
| 7 | `pdf-converter` | PDF ↔ DOCX/TXT/PNG |
| 8 | `browser-controller` | Automação web (Playwright) |

## Skills v2+ (Fase 9)

- Skills verticais: igreja, imobiliária, escritório, engenharia
- Marketplace de skills da comunidade
- Integrações: WhatsApp Business, Telegram, ERP, CRM

---

**Status:** Estrutura criada. Skills implementadas na Fase 4 (ver `docs/ROADMAP.md`).
