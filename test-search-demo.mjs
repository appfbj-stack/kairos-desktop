// Cria arquivos de teste no VPS e depois lista via skill
import { writeFile, mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';

const keyPath = 'C:\\Users\\ferna\\.ssh\\vps';
const remote = 'root@187.77.229.227';

// Cria 3 videos fake de teste
console.log('=== Criando videos fake no VPS ===');
for (const f of ['sermao-domingo.mp4', 'louvor-noite.avi', 'estudo-biblico.mkv']) {
  const cmd = `ssh -i ${keyPath} ${remote} "mkdir -p /tmp/teste-videos && head -c 1048576 /dev/urandom > /tmp/teste-videos/${f}"`;
  execSync(cmd, { stdio: 'inherit' });
}
console.log('Videos criados');

// Lista via skill via chat
console.log('\n=== Listando via search_files skill ===');
const r = await fetch('https://kairosdesktop.fbautomacao.space/chat/sync', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [{
      role: 'user',
      content: 'Use search_files com pattern "*.mp4,*.avi,*.mkv" e path "/tmp/teste-videos". Retorne o resultado.'
    }],
  }),
});
const j = await r.json();
console.log('Status:', r.status);
console.log('Used tools:', j.usedTools);
console.log('Tool:', j.toolCalls?.[0]?.name);
console.log('Args:', JSON.stringify(j.toolCalls?.[0]?.arguments));
console.log('Content:', j.content);
