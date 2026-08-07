/**
 * Use Case: Store Entity (Nivel Empresa)
 *
 * Salva uma entidade nomeada (pessoa, produto, processo, documento).
 * Auto-gera id se nao fornecido.
 */

import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { getMemoryRepository, type EntityType, type Entity } from '../../infrastructure/memory/sqlite.repository.js';

export const StoreEntityInputSchema = z.object({
  type: z.enum(['person', 'product', 'process', 'document', 'company']),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(200),
  content: z.string().default(''),
  tags: z.array(z.string()).default([]),
  relations: z.array(z.object({ type: z.string(), targetSlug: z.string() })).default([]),
  metadata: z.record(z.unknown()).default({}),
});

export type StoreEntityInput = z.infer<typeof StoreEntityInputSchema>;

export class StoreEntityUseCase {
  async execute(input: StoreEntityInput): Promise<Entity> {
    const parsed = StoreEntityInputSchema.parse(input);
    const repo = getMemoryRepository();

    // Verifica se ja existe por slug
    const existing = repo.getEntityBySlug(parsed.slug);
    if (existing) {
      // Atualiza
      return repo.storeEntity({
        ...existing,
        ...parsed,
        relations: parsed.relations,
        tags: parsed.tags,
        metadata: parsed.metadata,
      });
    }

    return repo.storeEntity({
      id: uuid(),
      type: parsed.type as EntityType,
      slug: parsed.slug,
      name: parsed.name,
      content: parsed.content,
      tags: parsed.tags,
      relations: parsed.relations,
      metadata: parsed.metadata,
    });
  }
}

export const storeEntityUseCase = new StoreEntityUseCase();
