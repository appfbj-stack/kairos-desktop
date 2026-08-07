/**
 * Teste de integracao: Memoria SQLite (Fase 2).
 *
 * Roda com: `npm run test:memory`
 * Valida CRUD de entities, conversations, messages, FTS5 search, LGPD export.
 */

import { v4 as uuid } from 'uuid';
import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';

// Forca DB em path temporario para nao poluir ~/.kairos
const TEST_DB = join(process.env.TEMP || 'C:\\Windows\\Temp', `kairos-test-${Date.now()}.db`);
process.env.KAIROS_DATA_DIR = TEST_DB.replace(/[^/\\]+$/, '');

import { MemoryRepository } from '../../core/infrastructure/memory/sqlite.repository.js';
import { storeEntityUseCase } from '../../core/application/memory/store-entity.usecase.js';
import { searchEntitiesUseCase } from '../../core/application/memory/search-entities.usecase.js';
import { recallEntitiesUseCase } from '../../core/application/memory/recall-entities.usecase.js';
import { createConversationUseCase, addMessageUseCase, listConversationsUseCase, listMessagesUseCase } from '../../core/application/memory/conversation.usecase.js';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  \u2713 ${name}`);
    passed++;
  } else {
    console.log(`  \u2717 ${name} ${detail ? `(${detail})` : ''}`);
    failed++;
  }
}

function cleanup() {
  for (const ext of ['', '-shm', '-wal']) {
    const p = TEST_DB + ext;
    if (existsSync(p)) unlinkSync(p);
  }
}

async function main() {
  console.log(`\n=== Teste de Memoria SQLite (db: ${TEST_DB}) ===\n`);
  cleanup();

  // Setup fresh DB
  const repo = new MemoryRepository(TEST_DB);
  repo.migrate();

  // 1. Migration aplicada
  console.log('1. Migration:');
  const tables = (repo as any).db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as { name: string }[];
  check('Tabela entities existe', tables.some((t) => t.name === 'entities'));
  check('Tabela entities_fts existe', tables.some((t) => t.name === 'entities_fts'));
  check('Tabela conversations existe', tables.some((t) => t.name === 'conversations'));
  check('Tabela messages existe', tables.some((t) => t.name === 'messages'));
  check('Tabela audit_log existe', tables.some((t) => t.name === 'audit_log'));

  // 2. Store entities
  console.log('\n2. Store entities:');
  const maria = await storeEntityUseCase.execute({
    type: 'person',
    slug: 'maria-silva',
    name: 'Maria Silva',
    content: 'Coordenadora do circulo de oracao. Prefere ser contactada por WhatsApp. Casada com Joao Silva.',
    tags: ['membro', 'lideranca', 'whatsapp'],
    relations: [],
    metadata: { phone: '+5511999999999' },
  });
  check('Maria Silva criada', maria.id.length > 0);
  check('Maria tem tag whatsapp', maria.tags.includes('whatsapp'));

  const joao = await storeEntityUseCase.execute({
    type: 'person',
    slug: 'joao-silva',
    name: 'Joao Silva',
    content: 'Pastor auxiliar. Esposo da Maria Silva.',
    tags: ['membro', 'pastor'],
    relations: [{ type: 'esposo_de', targetSlug: 'maria-silva' }],
    metadata: {},
  });
  check('Joao Silva criado', joao.id.length > 0);
  check('Joao tem relation', joao.relations.length === 1);

  const liturgia = await storeEntityUseCase.execute({
    type: 'process',
    slug: 'liturgia-domingo',
    name: 'Liturgia de Domingo',
    content: 'Processo de preparacao da liturgia do culto de domingo. Inclui selecao de hinos, leitura biblica, pregacao, oracao.',
    tags: ['culto', 'processo', 'semanal'],
    relations: [],
    metadata: {},
  });
  check('Liturgia criada', liturgia.id.length > 0);

  // 3. Search by FTS5
  console.log('\n3. Busca FTS5:');
  const resultsOracao = await searchEntitiesUseCase.execute({ query: 'oracao' });
  check('Busca "oracao" retorna pelo menos 1', resultsOracao.length >= 1, `${resultsOracao.length} results`);
  check('Resultado inclui Maria', resultsOracao.some((e) => e.slug === 'maria-silva'));

  const resultsCulto = await searchEntitiesUseCase.execute({ query: 'culto' });
  check('Busca "culto" retorna Liturgia', resultsCulto.some((e) => e.slug === 'liturgia-domingo'));

  // 4. Filter by type
  console.log('\n4. Filtro por tipo:');
  const people = await searchEntitiesUseCase.execute({ type: 'person' });
  check('Filtro person retorna 2 (Maria + Joao)', people.length === 2, `${people.length} results`);

  const processes = await searchEntitiesUseCase.execute({ type: 'process' });
  check('Filtro process retorna 1 (Liturgia)', processes.length === 1);

  // 5. Recall (formato contexto para LLM)
  console.log('\n5. Recall (contexto para LLM):');
  const recall = await recallEntitiesUseCase.execute({ query: 'oracao' });
  check('Recall retorna entities', recall.entities.length > 0);
  check('Recall gera contexto markdown', recall.context.includes('## Memória'));
  check('Contexto menciona Maria', recall.context.includes('Maria Silva'));

  // 6. Conversation + messages
  console.log('\n6. Conversas e mensagens:');
  const conv = await createConversationUseCase.execute({ title: 'Teste E2E', provider: 'openrouter', model: 'openai/gpt-4o-mini' });
  check('Conversa criada', conv.id.length > 0);

  await addMessageUseCase.execute({ conversationId: conv.id, role: 'user', content: 'Ola, Kairos!' });
  await addMessageUseCase.execute({ conversationId: conv.id, role: 'assistant', content: 'Ola! Como posso ajudar?' });
  await addMessageUseCase.execute({ conversationId: conv.id, role: 'user', content: 'Me fala sobre a Maria Silva' });

  const msgs = await listMessagesUseCase.execute(conv.id);
  check('3 mensagens armazenadas', msgs.length === 3, `${msgs.length} msgs`);
  check('Mensagens em ordem cronologica', msgs[0].content === 'Ola, Kairos!');
  check('Ultima mensagem eh do user', msgs[2].role === 'user');

  const conversations = await listConversationsUseCase.execute();
  check('Lista de conversas >= 1', conversations.length >= 1);

  // 7. Audit log
  console.log('\n7. Audit log:');
  repo.addAudit({
    eventType: 'skill.executed',
    actor: 'skill:test',
    payload: { skill: 'windows-file-manager' },
    approvedBy: 'user',
    decision: 'allow',
  });
  const audit = repo.listAudit(10);
  check('Audit log tem entrada', audit.length >= 1);
  check('Audit entry eh skill.executed', audit[0].eventType === 'skill.executed');

  // 8. LGPD export
  console.log('\n8. LGPD export:');
  const exported = repo.exportAll();
  check('Export tem entities', Array.isArray(exported.entities) && (exported.entities as any[]).length >= 3);
  check('Export tem conversations', Array.isArray(exported.conversations) && (exported.conversations as any[]).length >= 1);
  check('Export tem audit', Array.isArray(exported.audit));
  check('Export tem version', (exported as any).version === '0.1.0');

  // 9. LGPD delete all
  console.log('\n9. LGPD delete all:');
  repo.deleteAll();
  const afterDelete = repo.listEntities({ limit: 100 });
  check('Apos deleteAll, 0 entities', afterDelete.length === 0);
  const afterDeleteConv = await listConversationsUseCase.execute();
  check('Apos deleteAll, 0 conversations', afterDeleteConv.length === 0);
  const afterDeleteAudit = repo.listAudit(10);
  check('Apos deleteAll, 0 audit', afterDeleteAudit.length === 0);

  // Cleanup
  repo.close();
  cleanup();

  // Resumo
  console.log(`\n=== Resultado: ${passed} OK, ${failed} falharam ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Erro fatal:', err);
  cleanup();
  process.exit(1);
});
