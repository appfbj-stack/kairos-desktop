/**
 * Teste local: image_ai_generator skill
 *
 * Requer OPENROUTER_API_KEY em .env
 */
import 'dotenv/config';
import { imageAiGenerator } from './core/skills/builtin/image-ai-generator.js';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const OUT = resolve(process.cwd(), 'test-fixtures', 'ai-generated');
await mkdir(OUT, { recursive: true });
console.log('Output dir:', OUT);
console.log('');

if (!process.env.OPENROUTER_API_KEY) {
  console.error('ERRO: OPENROUTER_API_KEY nao configurado no .env');
  process.exit(1);
}

const args = {
  mode: 'test',
  prompt: 'A simple flat illustration of a church with a cross on top, sunny day, blue sky, clean composition, 4K quality',
  outputDir: OUT,
  filename: 'igreja-teste.png',
  aspectRatio: '1:1',
};

console.log('Gerando:', args.prompt);
console.log('Modo:', args.mode, '| Aspect ratio:', args.aspectRatio);
console.log('Aguarde (~10-30s)...');
console.log('');

const res = await imageAiGenerator.execute(args, { cwd: process.cwd() });
console.log('content:', res.content);
if (res.error) {
  console.log('data:', res.data);
  process.exit(1);
}
console.log('data:', res.data);
