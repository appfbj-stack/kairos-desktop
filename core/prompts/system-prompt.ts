/**
 * System prompt do Kairos.
 *
 * C12 fix: antes era hardcoded em ChatPanel.tsx (25 linhas) - duplicado
 * em cada request, e reusabilidade zero. Agora centralizado aqui.
 *
 * O prompt e construido dinamicamente com a lista de skills disponiveis
 * (vem do registry), entao adicionar nova skill = aparece no prompt
 * automaticamente no proximo restart do frontend (ou no proximo build do
 * frontend, dependendo de como e consumido).
 *
 * Tokens: ~600. Cabe em qualquer LLM mesmo nos free tier.
 */

import type { Skill } from '../skills/types.js';

export interface SystemPromptOptions {
  /** Lista de skills (vem do registry). */
  skills: Skill[];
  /** Contexto recuperado da memoria (opcional). */
  recalledContext?: string;
}

/**
 * Constroi o system prompt com a lista de skills formatada.
 */
export function buildSystemPrompt(opts: SystemPromptOptions): string {
  const { skills, recalledContext } = opts;

  // Agrupa skills por categoria pra prompt ficar mais legivel pro LLM
  const byCategory = new Map<string, Skill[]>();
  for (const s of skills) {
    const cat = s.category || 'misc';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(s);
  }

  const skillLines: string[] = [];
  for (const [cat, list] of byCategory) {
    const items = list.map((s) => `- ${s.name}: ${shortDescription(s.description)}`).join('\n');
    skillLines.push(`### ${cat}\n${items}`);
  }

  let prompt =
    'Voce eh o Kairos, um assistente de IA para Windows. Responda em portugues do Brasil.\n\n' +
    `Voce tem acesso a ${skills.length} tools do Windows agrupadas por categoria:\n\n` +
    skillLines.join('\n\n') +
    '\n\n' +
    'Sobre arquivos anexados pelo usuario:\n' +
    '- Imagens sao enviadas como multimodal (voce VE a imagem)\n' +
    '- PDF e texto (TXT/MD/JSON/HTML) tem o texto extraido e injetado no contexto\n' +
    '- Outros formatos (xlsx, docx, zip) vem com o path no disco; use a skill apropriada para processar\n\n' +
    'Para operacoes de escrita (que modificam arquivos), sempre faca dryRun primeiro se o usuario nao tiver certeza.\n\n' +
    'Use-as quando o usuario pedir algo do PC. Seja direto, sem enrolacao. ' +
    'Quando precisar de varias tools, chame em sequencia (o sistema executa e devolve o resultado).';

  if (recalledContext && recalledContext.trim()) {
    prompt += '\n\n## Contexto recuperado da memoria\n' + recalledContext;
  }

  return prompt;
}

/**
 * Extrai a primeira frase da description (corta no primeiro ponto final).
 * Usado pra nao estourar tokens com descricoes longas.
 */
function shortDescription(desc: string): string {
  const idx = desc.indexOf('. ');
  if (idx > 0 && idx < 200) {
    return desc.slice(0, idx + 1);
  }
  return desc.slice(0, 150) + (desc.length > 150 ? '...' : '');
}
