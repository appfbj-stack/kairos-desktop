/**
 * Banner: Campanha de Oracao e Jejum - OBPC Cajuru
 * Escala de 09/08 (domingo) a 21/08 (sexta) = 13 dias
 */
import { generateVisual } from './core/skills/builtin/generate-visual.js';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const OUT = resolve(process.cwd(), 'test-fixtures', 'visual');
await mkdir(OUT, { recursive: true });

const escala = [
  { day: 'Domingo',   name: 'Pastor e Jane',     date: '09/08' },
  { day: 'Segunda',   name: 'Mateus e Raquel',   date: '10/08' },
  { day: 'Terca',     name: 'Jose Carlos e Fran', date: '11/08' },
  { day: 'Quarta',    name: 'Du e Nilma',         date: '12/08' },
  { day: 'Quinta',    name: 'Valdir e Denize',    date: '13/08' },
  { day: 'Sexta',     name: 'Rosangela e Jorge',  date: '14/08' },
  { day: 'Sabado',    name: 'Luan e Maiara',      date: '15/08' },
  { day: 'Domingo',   name: 'Joelson e Suelen',   date: '16/08' },
  { day: 'Segunda',   name: 'Vinicius e Kesia',   date: '17/08' },
  { day: 'Terca',     name: 'Juliana e Ademir',   date: '18/08' },
  { day: 'Quarta',    name: 'Beth e Cleonice',    date: '19/08' },
  { day: 'Quinta',    name: 'Victor e Mayra',     date: '20/08' },
  { day: 'Sexta',     name: 'Dorival e Cida',     date: '21/08' },
];

const args = {
  type: 'banner',
  viewport: 'instagram-post',  // 1080x1080 (compativel com o template banner)
  outputDir: OUT,
  filename: 'oracao-jejum-obpc-cajuru',
  topLeft: 'IGREJA BATISTA',
  topRight: 'OBPC CAJURU',
  titlePrefix: 'CAMPANHA DE',
  titleMain: 'ORACAO',
  titleSecondary: 'E JEJUM',
  verses: 'Buscai, porem, primeiro o reino de Deus e a sua justica, e todas estas coisas vos serao acrescentadas. - Mateus 6.33',
  purpose: '13 dias de oracao e jejum pela nossa igreja, familia e avivamento',
  dateStart: '09 de agosto',
  dateEnd: '21 de agosto',
  dateLabel: 'sexta-feira',
  description: 'Escala OBPC Cajuru - 13 dias de cobertura em oracao',
  scaleTitle: 'ESCALA DE ORACAO - OBPC CAJURU',
  scale: escala,
  churchName: 'IGREJA BATISTA KAIROS',
  churchTagline: 'Uma igreja que ora',
  primaryColor: '#1a2540',
  accentColor: '#d4a017',
  backgroundColor: '#f5efe6',
};

console.log('Gerando banner...');
const res = await generateVisual.execute(args, { cwd: process.cwd() });
console.log(res.content);
if (res.error) process.exit(1);

console.log('\nPronto! Arquivo:', res.data.files[0].path);
