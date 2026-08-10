// Testa skill office_excel_write via chat (LLM tool calling)
const r = await fetch('https://kairosdesktop.fbautomacao.space/chat/sync', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [{
      role: 'user',
      content: 'Crie uma planilha Excel em /tmp/dizimos-agosto.xlsx com uma aba chamada "Dizimos" contendo 3 colunas (Data, Membro, Valor). Depois adicione 2 linhas: "10/08/2026, Pastor Fernando, 1500" e "11/08/2026, Joao Silva, 250.50".'
    }],
  }),
});
const j = await r.json();
console.log('Status:', r.status);
console.log('Provider:', j.provider);
console.log('Model:', j.model);
console.log('Content:', j.content);
console.log('Tool calls:', JSON.stringify(j.toolCalls, null, 2));
console.log('Used tools:', j.usedTools);
