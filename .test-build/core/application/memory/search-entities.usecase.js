/**
 * Use Case: Search Entities (Nivel Empresa)
 *
 * Busca entidades por:
 *  - texto livre (FTS5)
 *  - tipo (person, product, process, document)
 *  - tag
 *
 * Retorna top N resultados ordenados por relevancia.
 */
import { z } from 'zod';
import { getMemoryRepository } from '../../infrastructure/memory/sqlite.repository.js';
export const SearchEntitiesInputSchema = z.object({
    query: z.string().min(1).optional(),
    type: z.enum(['person', 'product', 'process', 'document', 'company']).optional(),
    tag: z.string().optional(),
    limit: z.number().min(1).max(100).default(20),
});
export class SearchEntitiesUseCase {
    async execute(input) {
        const parsed = SearchEntitiesInputSchema.parse(input);
        const repo = getMemoryRepository();
        if (parsed.query) {
            let results = repo.searchEntities(parsed.query, parsed.limit);
            if (parsed.type)
                results = results.filter((e) => e.type === parsed.type);
            if (parsed.tag)
                results = results.filter((e) => e.tags.includes(parsed.tag));
            return results;
        }
        let results = repo.listEntities({ type: parsed.type, limit: parsed.limit });
        if (parsed.tag)
            results = results.filter((e) => e.tags.includes(parsed.tag));
        return results;
    }
}
export const searchEntitiesUseCase = new SearchEntitiesUseCase();
