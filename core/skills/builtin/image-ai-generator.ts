/**
 * image_ai_generator - gera imagens via OpenRouter multimodal (Node port do OpenSquad).
 *
 * Referencia: .opensquad-tmp2/skills/image-ai-generator/scripts/generate.py
 *
 * 2 modos:
 *   - test:       sourceful/riverflow-v2-fast (barato, ~R$0.01/imagem)
 *   - production: google/gemini-3.1-flash-image-preview (alta qualidade, ~R$0.07/imagem)
 *
 * Suporta:
 *   - Single image (prompt + outputDir + filename)
 *   - Reference image (logo, mascot) multimodal
 *   - Aspect ratio (1:1, 16:9, 9:16, 3:4, 4:3)
 *
 * NAO precisa de Office, NAO precisa de Playwright (e uma chamada HTTP).
 * Custo: depende do modo escolhido.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { Skill } from '../types.js';

const MODELS = {
  test: 'sourceful/riverflow-v2-fast',
  production: 'google/gemini-3.1-flash-image-preview',
} as const;

type Mode = keyof typeof MODELS;

const ASPECT_RATIO_HINTS: Record<string, string> = {
  '1:1': 'square 1:1 aspect ratio',
  '16:9': 'landscape 16:9 aspect ratio',
  '9:16': 'portrait 9:16 aspect ratio (vertical)',
  '3:4': 'portrait 3:4 aspect ratio',
  '4:3': 'landscape 4:3 aspect ratio',
};

function detectMime(filePath: string, fallback?: string): string {
  const ext = extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  };
  return map[ext] || fallback || 'image/png';
}

function loadApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (key) return key;
  throw new Error(
    'OPENROUTER_API_KEY nao configurado. Defina em .env ou variavel de ambiente do Core.',
  );
}

function buildPrompt(userPrompt: string, aspectRatio?: string): string {
  let p = `Generate an image: ${userPrompt}. Only output the image, no text.`;
  if (aspectRatio && ASPECT_RATIO_HINTS[aspectRatio]) {
    p += ` Use ${ASPECT_RATIO_HINTS[aspectRatio]}.`;
  }
  return p;
}

async function generateSingle(opts: {
  prompt: string;
  outputDir: string;
  filename: string;
  mode: Mode;
  referencePath?: string;
  aspectRatio?: string;
  apiKey: string;
}): Promise<{ path: string; sizeBytes: number; model: string; mode: Mode }> {
  const model = MODELS[opts.mode];

  // Garante diretorio
  if (!existsSync(opts.outputDir)) {
    mkdirSync(opts.outputDir, { recursive: true });
  }

  // Monta content (multimodal se tem reference)
  let content: string | Array<{ type: string; [k: string]: unknown }>;
  if (opts.referencePath && existsSync(opts.referencePath)) {
    const mime = detectMime(opts.referencePath);
    const imgB64 = readFileSync(opts.referencePath).toString('base64');
    content = [
      { type: 'image_url', image_url: { url: `data:${mime};base64,${imgB64}` } },
      {
        type: 'text',
        text: buildPrompt(opts.prompt, opts.aspectRatio) +
              ' Use the logo/asset from the reference image above in the composition.',
      },
    ];
  } else {
    content = buildPrompt(opts.prompt, opts.aspectRatio);
  }

  // Chama OpenRouter
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenRouter HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: unknown; images?: Array<{ image_url?: { url?: string } }> } }>;
  };

  const message = data.choices?.[0]?.message;
  if (!message) {
    throw new Error('Resposta sem message do OpenRouter');
  }

  // Tenta primeiro message.images (formato multimodal)
  let imgB64: string | null = null;
  const images = message.images;
  if (images && images.length > 0) {
    const url = images[0]?.image_url?.url || '';
    if (url.startsWith('data:')) {
      imgB64 = url.includes(',') ? url.split(',', 2)[1] : url.split('data:')[1];
    }
  }

  // Fallback: content pode ser string base64 ou data URI
  if (!imgB64) {
    const content = message.content;
    if (typeof content === 'string' && content.length > 0) {
      if (content.startsWith('data:')) {
        imgB64 = content.includes(',') ? content.split(',', 2)[1] : content;
      } else if (content.length > 100 && /^[A-Za-z0-9+/=]+$/.test(content.slice(0, 100))) {
        // As vezes vem base64 puro (sem prefixo data:)
        imgB64 = content;
      }
    }
  }

  if (!imgB64) {
    throw new Error(
      `Modelo ${model} nao retornou imagem. Pode ser que o modelo nao suporte image generation, ou resposta em formato inesperado.`,
    );
  }

  // Decodifica e salva
  const buf = Buffer.from(imgB64, 'base64');
  const fullPath = join(opts.outputDir, opts.filename);
  writeFileSync(fullPath, buf);

  return {
    path: fullPath,
    sizeBytes: buf.length,
    model,
    mode: opts.mode,
  };
}

export const imageAiGenerator: Skill = {
  name: 'image_ai_generator',
  description:
    'Gera imagem via IA (OpenRouter multimodal). ' +
    '2 modos: test (rapido e barato, ~R$0.01) e production (alta qualidade, ~R$0.07). ' +
    'Suporta imagem de referencia (logo/mascote) via multimodal. ' +
    'Use para criar assets visuais: banners, thumbnails, ilustracoes, posts para redes sociais. ' +
    'Custo: gera apenas o que for necessario. Comece com test, faca production so quando aprovado. ' +
    'Cuidado: modelos de imagem podem nao renderizar texto corretamente.',
  category: 'office',
  parameters: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['test', 'production'],
        description: 'Modo de geracao: test (rapido/barato) ou production (alta qualidade).',
      },
      prompt: {
        type: 'string',
        description: 'Descricao da imagem a gerar (em ingles recomendado, mas PT-BR funciona).',
      },
      outputDir: {
        type: 'string',
        description: 'Diretorio onde salvar a imagem. Sera criado se nao existir.',
      },
      filename: {
        type: 'string',
        description: 'Nome do arquivo (com extensao .png ou .jpg). Default: gera via slug do prompt.',
      },
      referencePath: {
        type: 'string',
        description: 'Caminho opcional de imagem de referencia (logo, mascot). O modelo vai incorpora-la.',
      },
      aspectRatio: {
        type: 'string',
        enum: ['1:1', '16:9', '9:16', '3:4', '4:3'],
        description: 'Aspect ratio desejado (padrao: 1:1 quadrado).',
      },
    },
    required: ['mode', 'prompt', 'outputDir'],
  },
  async execute(args) {
    const mode = (String(args.mode || 'test') as Mode);
    if (mode !== 'test' && mode !== 'production') {
      return { content: `Erro: mode invalido "${mode}". Use "test" ou "production".`, error: true };
    }

    const prompt = String(args.prompt || '').trim();
    if (!prompt) {
      return { content: 'Erro: prompt obrigatorio.', error: true };
    }

    const outputDir = String(args.outputDir || '').trim();
    if (!outputDir) {
      return { content: 'Erro: outputDir obrigatorio.', error: true };
    }

    // Filename default
    let filename = String(args.filename || '').trim();
    if (!filename) {
      const slug = prompt
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 50) || 'image';
      filename = `${slug}-${mode}.png`;
    }
    if (!/\.(png|jpg|jpeg|webp)$/i.test(filename)) {
      filename += '.png';
    }

    let apiKey: string;
    try {
      apiKey = loadApiKey();
    } catch (err) {
      return { content: (err as Error).message, error: true };
    }

    try {
      const result = await generateSingle({
        prompt,
        outputDir,
        filename,
        mode,
        referencePath: args.referencePath ? String(args.referencePath) : undefined,
        aspectRatio: args.aspectRatio ? String(args.aspectRatio) : undefined,
        apiKey,
      });

      const sizeKb = (result.sizeBytes / 1024).toFixed(1);
      return {
        content:
          `Imagem gerada: ${result.path} (${sizeKb} KB)\n` +
          `Modo: ${result.mode} | Modelo: ${result.model}`,
        data: result,
      };
    } catch (err) {
      return { content: `Erro gerando imagem: ${(err as Error).message}`, error: true };
    }
  },
};
