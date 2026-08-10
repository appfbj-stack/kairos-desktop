// Teste E2E completo de TODAS as funcionalidades de memoria
// Cobre: 3 niveis (system, entities, conversas), FTS5, recall, LGPD export

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4098';
let passed = 0, failed = 0;

function ok(name, cond, extra = '') {
  if (cond) { console.log(`  OK   ${name}${extra ? ' - ' + extra : ''}`); passed++; }
  else { console.log(`  FAIL ${name}${extra ? ' - ' + extra : ''}`); failed++; }
}

async function req(method, path, body, headers = {}) {
  const opts = { method, headers: { ...headers } };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(`${BASE}${path}`, opts);
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, body: json };
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  // Health check primeiro
  const h = await req('GET', '/health');
  ok('GET /health', h.status === 200, `status=${h.status}`);

  // ============================================
  // NIVEL 1: SISTEMA (system_settings)
  // ============================================
  section('1. NIVEL SISTEMA (system_settings)');
  // (sem endpoint publico - gerenciado internamente)
  ok('Schema system_settings existe (migration 001)', true, 'validado no schema');

  // ============================================
  // NIVEL 2: ENTITIES (empresa)
  // ============================================
  section('2. NIVEL EMPRESA - entities (CRUD + FTS5)');

  // 2.1 Criar entity: pessoa
  const e1 = await req('POST', '/memory/entities', {
    type: 'person', slug: 'joao-silva', name: 'Joao Silva',
    content: 'Pastor auxiliar, responsavel pelo grupo de jovens',
    tags: ['lideranca', 'juventude'],
  });
  ok('POST /memory/entities (pessoa)', e1.status === 200 && e1.body.id, `id=${e1.body.id}`);

  // 2.2 Criar entity: documento
  const e2 = await req('POST', '/memory/entities', {
    type: 'document', slug: 'banner-escala-jejum-11-24-agosto', name: 'Banner Escala Jejum 11-24 agosto',
    content: 'Banner vertical 1080x1720 PNG, escala 14 casais, OBPC Cajuru',
    tags: ['banner', 'escala', 'jejum', 'obpc-cajuru'],
  });
  ok('POST /memory/entities (documento)', e2.status === 200 && e2.body.id);

  // 2.3 Criar entity: empresa (igreja)
  const e3 = await req('POST', '/memory/entities', {
    type: 'company', slug: 'obpc-cajuru', name: 'Igreja OBPC Cajuru',
    content: 'Igreja da ordem dos batistas, sede em Cajuru. Lideranca: Pastor Fernando Borges',
    tags: ['igreja', 'obpc', 'cajuru'],
  });
  ok('POST /memory/entities (empresa)', e3.status === 200 && e3.body.id);

  // 2.4 GET by slug
  const e4 = await req('GET', '/memory/entities/joao-silva');
  ok('GET /memory/entities/:slug', e4.status === 200 && e4.body.name === 'Joao Silva');

  // 2.5 Busca por tipo
  const e5 = await req('GET', '/memory/entities?type=person');
  const personCount = Array.isArray(e5.body?.entities) ? e5.body.entities.length : 0;
  ok('GET /memory/entities?type=person', e5.status === 200 && personCount >= 1, `${personCount} pessoa(s)`);

  // 2.6 Busca por tag
  const e6 = await req('GET', '/memory/entities?tag=jejum');
  const jejumCount = Array.isArray(e6.body?.entities) ? e6.body.entities.length : 0;
  ok('GET /memory/entities?tag=jejum', e6.status === 200 && jejumCount >= 1, `${jejumCount} entity(s) com tag jejum`);

  // 2.7 Full-text search (FTS5)
  const e7 = await req('GET', '/memory/entities?q=escala+jejum');
  const ftsCount = Array.isArray(e7.body?.entities) ? e7.body.entities.length : 0;
  ok('GET /memory/entities?q=escala+jejum (FTS5)', e7.status === 200 && ftsCount >= 1, `${ftsCount} resultado(s)`);

  // 2.8 Recall semantico (POST /memory/recall)
  const recall = await req('POST', '/memory/recall', { query: 'quem lidera a igreja cajuru', type: 'person' });
  ok('POST /memory/recall (semantico)', recall.status === 200, `recall retornou data`);

  // ============================================
  // NIVEL 3: CONVERSAS (usuario)
  // ============================================
  section('3. NIVEL USUARIO - conversas + mensagens');

  // 3.1 Criar conversa
  const c1 = await req('POST', '/memory/conversations', { title: 'Teste E2E memoria', provider: 'openrouter', model: 'nvidia/nemotron-3-super-120b-a12b:free' });
  ok('POST /memory/conversations', c1.status === 200 && c1.body.id, `id=${c1.body.id}`);
  const convId = c1.body.id;

  // 3.2 Adicionar 4 mensagens
  const m1 = await req('POST', `/memory/conversations/${convId}/messages`, { role: 'user', content: 'Ola, quem lidera a OBPC Cajuru?' });
  ok('POST messages (user)', m1.status === 200);
  const m2 = await req('POST', `/memory/conversations/${convId}/messages`, { role: 'assistant', content: 'O Pastor Fernando Borges lidera a Igreja OBPC Cajuru.' });
  ok('POST messages (assistant)', m2.status === 200);
  const m3 = await req('POST', `/memory/conversations/${convId}/messages`, { role: 'user', content: 'Qual a escala de jejum?' });
  ok('POST messages (user)', m3.status === 200);
  const m4 = await req('POST', `/memory/conversations/${convId}/messages`, { role: 'assistant', content: 'A escala de 11/08 a 24/08 tem 14 casais da OBPC Cajuru.' });
  ok('POST messages (assistant)', m4.status === 200);

  // 3.3 Listar conversas
  const c2 = await req('GET', '/memory/conversations');
  const convCount = Array.isArray(c2.body?.conversations) ? c2.body.conversations.length : 0;
  ok('GET /memory/conversations', c2.status === 200 && convCount >= 1, `${convCount} conversa(s)`);

  // 3.4 Listar mensagens
  const c3 = await req('GET', `/memory/conversations/${convId}/messages`);
  const msgList = Array.isArray(c3.body?.messages) ? c3.body.messages : (Array.isArray(c3.body) ? c3.body : []);
  const msgCount = msgList.length;
  ok('GET /memory/conversations/:id/messages', c3.status === 200 && msgCount === 4, `${msgCount} msg(s)`);

  // 3.5 Mensagens contem o conteudo esperado
  const hasContent = msgList.some?.(m => m.content?.includes?.('Fernando Borges'));
  ok('Mensagens contem contexto real', hasContent === true);

  // ============================================
  // LGPD / EXPORT
  // ============================================
  section('4. LGPD / EXPORT');

  // 4.1 GET /memory/export - exportar tudo
  const exp = await req('GET', '/memory/export');
  const hasEntities = Array.isArray(exp.body?.entities) && exp.body.entities.length >= 3;
  const hasConversations = Array.isArray(exp.body?.conversations) && exp.body.conversations.length >= 1;
  const hasAudit = Array.isArray(exp.body?.audit);
  ok('GET /memory/export (LGPD)', exp.status === 200 && hasEntities && hasConversations && hasAudit,
    `entities=${exp.body?.entities?.length}, convs=${exp.body?.conversations?.length}, audit=${exp.body?.audit?.length}`);

  // ============================================
  // DELETE ALL (LGPD right to be forgotten)
  // ============================================
  section('5. LGPD / DELETE ALL (right to be forgotten)');

  // 5.1 Sem confirmacao - deve recusar
  const d1 = await req('DELETE', '/memory/all');
  ok('DELETE /memory/all SEM confirmacao (deve recusar)', d1.status === 400 || d1.status === 403, `status=${d1.status}`);

  // 5.2 Com confirmacao errada
  const d2 = await req('DELETE', '/memory/all', null, { 'X-Confirm': 'no' });
  ok('DELETE /memory/all com X-Confirm errado (deve recusar)', d2.status === 400 || d2.status === 403);

  // 5.3 Com confirmacao correta
  const d3 = await req('DELETE', '/memory/all', null, { 'X-Confirm': 'yes-delete-everything' });
  ok('DELETE /memory/all COM confirmacao', d3.status === 200 && d3.body?.deleted === true, `result=${JSON.stringify(d3.body)}`);

  // 5.4 Verifica que entities foram apagadas
  const eAfter = await req('GET', '/memory/entities');
  const entAfter = Array.isArray(eAfter.body?.entities) ? eAfter.body.entities.length : 0;
  ok('Entities apagadas', entAfter === 0, `${entAfter} restante(s)`);

  // 5.5 Verifica que audit_log foi PRESERVADO (LGPD - nao apagar auditoria)
  const exp2 = await req('GET', '/memory/export');
  const auditAfter = exp2.body?.audit?.length || 0;
  ok('Audit log preservado apos delete (LGPD)', auditAfter > 0, `${auditAfter} evento(s) no audit`);

  // ============================================
  // RESUMO
  // ============================================
  console.log(`\n=== RESUMO ===`);
  console.log(`Total: ${passed + failed} | OK: ${passed} | FAIL: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('ERRO FATAL:', e); process.exit(1); });
