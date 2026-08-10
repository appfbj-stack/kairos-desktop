// Teste: banner de escala de jejum (14 pessoas/casais, 11/08 a 24/08)
// Mantem EXATAMENTE como o Pastor escreveu (sem corrigir nomes)
import { writeFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, 'core', 'templates', 'visual');
const OUTPUT_DIR = join(__dirname, 'test-fixtures', 'visual');

// Escala completa (na ordem que o Pastor passou)
const scale = [
  { day: 'ter',  date: '11/08', name: 'Pastor e Jane' },
  { day: 'qua',  date: '12/08', name: 'Mateus e Raquel' },
  { day: 'qui',  date: '13/08', name: 'José Carlos Fran' },
  { day: 'sex',  date: '14/08', name: 'Du e Nilma' },
  { day: 'sáb',  date: '15/08', name: 'Valdir e Denize' },
  { day: 'dom',  date: '16/08', name: 'Rosangela e Jorge' },
  { day: 'seg',  date: '17/08', name: 'Luan e Maiara' },
  { day: 'ter',  date: '18/08', name: 'Joelson Suelen' },
  { day: 'qua',  date: '19/08', name: 'Vinícius e Késia' },
  { day: 'qui',  date: '20/08', name: 'Juliana e Ademir' },
  { day: 'sex',  date: '21/08', name: 'Beth Cleonice' },
  { day: 'sáb',  date: '22/08', name: 'Victor e Mayra' },
  { day: 'dom',  date: '23/08', name: 'Dorival  Cida' },
  { day: 'seg',  date: '24/08', name: 'Sonia  Sirley' },
];

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const tpl = await (await import('node:fs/promises')).readFile(join(TEMPLATES_DIR, 'banner.html'), 'utf-8');

  const scaleRows = scale.map(s => `<div class="scale-row">
    <div class="day"><span class="icon">📅</span>${s.day.toUpperCase()}</div>
    <div class="name">${s.name}</div>
    <div class="date">${s.date}</div>
  </div>`).join('\n');

  const replace = (html, key, val) => html.replace(new RegExp('\\{\\{\\s*' + key + '\\s*\\}\\}', 'g'), val);

  let out = tpl;
  out = replace(out, 'top_left', 'ESCALA DE JEJUM');
  out = replace(out, 'top_right', 'IGREJA OBPC CAJURU');
  out = replace(out, 'title_prefix', 'CAMPANHA DE');
  out = replace(out, 'title_main', 'ORAÇÃO');
  out = replace(out, 'title_secondary', 'E JEJUM');
  out = replace(out, 'verses', '"Bem-aventurados os que têm fome e sede de justiça, porque serão fartos."');
  out = replace(out, 'purpose', 'Cada casal/pessoa jejua 1 dia pela campanha');
  out = replace(out, 'date_start', '11/08');
  out = replace(out, 'date_end', '24/08');
  out = replace(out, 'date_label', 'segunda');
  out = replace(out, 'description', '14 dias de jejum - um casal/pessoa por dia');
  out = replace(out, 'scale_title', 'ESCALA');
  out = replace(out, 'scale_rows', scaleRows);
  out = replace(out, 'church_name', 'IGREJA OBPC CAJURU');
  out = replace(out, 'church_tagline', 'Uma igreja que ora');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  // Banner mais alto (1080x2400) para caber 14 nomes com folga
  const HEIGHT = 2400;
  const ctx = await browser.newContext({ viewport: { width: 1080, height: HEIGHT }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setContent(out, { waitUntil: 'load' });
  // Sobrescreve CSS fixo do template (height 1350px + overflow hidden) para
  // o conteudo expandir e caber todas as 14 linhas
  await page.addStyleTag({ content: `
    html, body { height: auto !important; min-height: 100%; overflow: visible !important; }
    body { padding-bottom: 40px; }
    .scale-row { padding: 14px 28px !important; }
    .scale-row .name { font-size: 24px !important; }
  ` });
  await page.evaluate('document.fonts.ready');
  // Mede altura real do body apos render
  const realHeight = await page.evaluate('document.body.scrollHeight');
  const finalHeight = Math.min(realHeight, 2800); // cap pra nao estourar
  console.log('altura real do body:', realHeight, '-> usando', finalHeight);
  const outPath = join(OUTPUT_DIR, 'escala-jejum-11-24-agosto.png');
  const buf = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1080, height: finalHeight } });
  await writeFile(outPath, buf);
  console.log('OK:', outPath, `(${(buf.length/1024).toFixed(1)} KB, 1080x${finalHeight})`);
  await browser.close();
}
main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
