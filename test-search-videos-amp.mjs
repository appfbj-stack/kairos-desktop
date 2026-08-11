// Testa skill search_files em /tmp e em / (raiz)
const tests = [
  { pattern: '*.mp4,*.avi,*.mkv,*.mov,*.webm,*.wmv,*.flv', path: '/tmp', limit: 20 },
  { pattern: '*.mp4,*.avi,*.mkv', path: '/', limit: 20 },
];

for (const t of tests) {
  const r = await fetch('https://kairosdesktop.fbautomacao.space/chat/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{
        role: 'user',
        content: `Use a tool search_files com pattern "${t.pattern}" e path "${t.path}" e limit ${t.limit}. Retorne APENAS o resultado da tool, sem explicacoes extras.`,
      }],
    }),
  });
  const j = await r.json();
  console.log(`\n=== Pattern: ${t.pattern} em ${t.path} ===`);
  console.log('Used tools:', j.usedTools);
  if (j.toolCalls && j.toolCalls.length > 0) {
    console.log('Tool args:', JSON.stringify(j.toolCalls[0].arguments));
  }
  console.log('Content:', j.content?.substring(0, 1500));
}
