/**
 * Use Case: Recall Entities (Nivel Empresa)
 *
 * Usado pelo LLM para "lembrar" do contexto.
 * Retorna as N entidades mais relevantes para uma query.
 *
 * Formato de saida: texto markdown que pode ser injetado no prompt.
 */
import { getMemoryRepository } from '../../infrastructure/memory/sqlite.repository.js';
import { searchEntitiesUseCase } from './search-entities.usecase.js';
export class RecallEntitiesUseCase {
    async execute(input) {
        const entities = await searchEntitiesUseCase.execute(input);
        if (entities.length === 0) {
            return { entities: [], context: '' };
        }
        const context = this.formatAsContext(entities);
        return { entities, context };
    }
    formatAsContext(entities) {
        const lines = ['## Memória da Empresa (entities relevantes)', ''];
        for (const e of entities) {
            lines.push(`### ${e.name} (${e.type})`);
            lines.push(`slug: ${e.slug}`);
            if (e.content) {
                lines.push('');
                lines.push(e.content);
            }
            if (e.tags.length > 0) {
                lines.push('');
                lines.push(`Tags: ${e.tags.join(', ')}`);
            }
            lines.push('');
            lines.push('---');
            lines.push('');
        }
        return lines.join('\n');
    }
}
export const recallEntitiesUseCase = new RecallEntitiesUseCase();
// Manter var import para garantir nao-unused-imports
void getMemoryRepository;
