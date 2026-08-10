// Testa skill search_files cross-platform via chat
const r = await fetch('https://kairosdesktop.fbautomacao.space/chat/sync', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [{
      role: 'user',
      content: 'Use a tool search_files para listar todos os arquivos de video (extensoes .mp4, .avi, .mkv, .mov, .webm) dentro do diretorio /opt/kairos. Retorne a lista com nome, tamanho e data. Limite a 20 resultados.'
    }],
  }),
});
const j = await r.json();
console.log('Status:', r.status);
console.log('Provider:', j.provider);
console.log('Model:', j.model);
console.log('Used tools:', j.usedTools);
console.log('Tool calls:', JSON.stringify(j.toolCalls, null, 2));
console.log('Content:', j.content);
