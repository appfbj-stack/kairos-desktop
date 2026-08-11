/**
 * Skill registry - mantém a lista de skills disponíveis e
 * expõe metadados no formato OpenAI function calling.
 */

import type { Skill, JsonSchema } from './types.js';
import { checkSafety } from './safety.js';
import { fileManagerList, fileManagerRead } from './builtin/file-manager.js';
import { appLauncherOpen } from './builtin/app-launcher.js';
import { searchFiles } from './builtin/search.js';
import { clipboardRead, clipboardWrite } from './builtin/clipboard.js';
import { officeExcelRead } from './builtin/office-excel.js';
import { officeWordRead } from './builtin/office-word.js';
import { officeExcelWrite } from './builtin/office-excel-write.js';
import { officeWordWrite } from './builtin/office-word-write.js';
import { fileOrganize } from './builtin/file-organize.js';
import { generateVisual } from './builtin/generate-visual.js';
import { igrejaDocumento } from './builtin/igreja-documento.js';
import { imageAiGenerator } from './builtin/image-ai-generator.js';
import { pdfConvert } from './builtin/pdf-converter.js';
import { browserNavigate } from './builtin/browser-navigate.js';
import { sshRemote, sshRemoteKey } from './builtin/ssh-remote.js';

// Re-export para conveniência
export type { Skill, JsonSchema } from './types.js';

const builtinSkills: Skill[] = [
  // Fase 4 MVP - read-only
  fileManagerList,
  fileManagerRead,
  appLauncherOpen,
  searchFiles,
  // Fase 4.1 - 5 skills adicionais
  clipboardRead,
  clipboardWrite,
  officeExcelRead,
  officeWordRead,
  pdfConvert,
  browserNavigate,
  // Fase 4.2 - 3 skills de escrita (preencher e organizar)
  officeExcelWrite,
  officeWordWrite,
  fileOrganize,
  // Fase 4.3 - gerar visual (banner, carousel, card via HTML+Puppeteer)
  generateVisual,
  // Fase 4.4 - documentos oficiais da igreja (carta, recibo, ata, dizimo) via Playwright -> PDF
  igrejaDocumento,
  // Fase 4.5 - gerar imagem via IA multimodal (OpenSquad image-ai-generator port)
  imageAiGenerator,
  // Fase 5 - SSH bridge (acesso remoto ao PC do usuario)
  sshRemote,
  sshRemoteKey,
];

class SkillRegistry {
  private skills = new Map<string, Skill>();

  constructor(initial: Skill[] = []) {
    for (const s of initial) {
      this.register(s);
    }
  }

  register(skill: Skill): void {
    if (this.skills.has(skill.name)) {
      throw new Error(`Skill duplicada: ${skill.name}`);
    }
    this.skills.set(skill.name, skill);
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  list(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Retorna as skills no formato ToolDefinition-like (sem wrapper OpenAI).
   * O adapter (mapTools) faz o wrapping para OpenAI.
   *
   * Retorna um array com shape de ToolDefinition (name, description, parameters)
   * mas mantendo o tipo Skill[] (com category e execute) para o caller.
   */
  asToolDefinitions(): Skill[] {
    return this.list();
  }

  /**
   * Mantida por compatibilidade: retorna no formato OpenAI pronto.
   * Usar asToolDefinitions() se for passar pelo mapTools do adapter.
   */
  asOpenAITools(): Array<{
    type: 'function';
    function: { name: string; description: string; parameters: JsonSchema };
  }> {
    return this.list().map((s) => ({
      type: 'function' as const,
      function: {
        name: s.name,
        description: s.description,
        parameters: s.parameters,
      },
    }));
  }

  /**
   * Executa uma skill pelo nome. Retorna erro estruturado
   * se a skill não existe OU se a safety check falhou.
   */
  async execute(
    name: string,
    args: Record<string, unknown>,
    ctx: { cwd?: string } = {},
  ): Promise<{ ok: true; content: string; data?: unknown } | { ok: false; error: string }> {
    const skill = this.skills.get(name);
    if (!skill) {
      return { ok: false, error: `Skill nao encontrada: ${name}` };
    }

    // Validação basica dos args (required check)
    const required = skill.parameters.required || [];
    for (const key of required) {
      if (!(key in args)) {
        return { ok: false, error: `Argumento obrigatorio faltando: ${key}` };
      }
    }

    // Safety check no script (se a skill expuser)
    const safetyKey = (skill as any).safetyCheck as string | undefined;
    if (safetyKey && !checkSafety(safetyKey).safe) {
      return { ok: false, error: `Safety: ${checkSafety(safetyKey).reason}` };
    }

    try {
      const result = await skill.execute(args, ctx);
      return { ok: true, content: result.content, data: result.data };
    } catch (err) {
      return { ok: false, error: `Erro executando ${name}: ${(err as Error).message}` };
    }
  }
}

export const skillRegistry = new SkillRegistry(builtinSkills);
