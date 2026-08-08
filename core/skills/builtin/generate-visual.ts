/**
 * generate_visual - gera imagem PNG a partir de template HTML via Playwright.
 *
 * Refactor Fase 4.3: migrado de Puppeteer pra Playwright (alinhado com OpenSquad
 * que tambem usa Playwright via MCP). Suporta:
 *
 *  3 modos de geracao (compatibilidade):
 *   - banner: 1080x1350 vertical (cartaz)
 *   - carousel: 1080x1080 multi-slide quadrado (compat) - viewport OpenSquad padrao
 *   - card: 1080x1080 quadrado 1 slide
 *
 *  3 templates visuais do OpenSquad (model-a, model-b, model-c):
 *   - model-a: Twitter Editorial (preto, avatar, texto editorial)
 *   - model-b: Clean Visual (cards numerados laranja/cinza)
 *   - model-c: Data Dashboard (cards com metricas)
 *
 *  Presets de viewport (image-design.md):
 *   - instagram-post:    1080x1080
 *   - instagram-carousel:1080x1440
 *   - instagram-story:  1080x1920
 *   - facebook-post:    1200x630
 *   - twitter-post:     1200x675
 *   - linkedin-post:    1200x627
 *   - youtube-thumb:    1280x720
 *
 *  Regras de design aplicadas (image-design.md):
 *   - Min font: 58px hero / 43px heading / 34px body / 24px caption
 *   - SEM slide counter (Instagram mostra nativo)
 *   - 5 cores max
 *   - Self-contained HTML (inline CSS, only Google Fonts @import)
 *
 * NAO requer Office. Funciona em Windows/Mac/Linux com Chromium.
 */

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Skill } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATES_DIR = resolve(__dirname, '..', '..', 'templates', 'visual');

/** Presets de viewport por plataforma (OpenSquad image-design.md) */
const VIEWPORT_PRESETS: Record<string, { width: number; height: number }> = {
  'instagram-post':     { width: 1080, height: 1080 },
  'instagram-carousel': { width: 1080, height: 1440 },
  'instagram-story':    { width: 1080, height: 1920 },
  'facebook-post':      { width: 1200, height: 630  },
  'twitter-post':       { width: 1200, height: 675  },
  'linkedin-post':      { width: 1200, height: 627  },
  'youtube-thumb':      { width: 1280, height: 720  },
};

interface CarouselSlide {
  label?: string;
  title: string;
  body?: string;
  verses?: string;
  versesRef?: string;
  ctaHeadline?: string;
  ctaSub?: string;
}

export const generateVisual: Skill = {
  name: 'generate_visual',
  description:
    'Gera imagem PNG (banner, card ou carrossel) a partir de template HTML. ' +
    'Modos: banner (1080x1350 vertical), carousel (1080x1080 multi-slide), card (1080x1080 1 slide). ' +
    'Tambem suporta templates do OpenSquad (model-a, model-b, model-c) e viewports por plataforma. ' +
    'Use para criar material visual para redes sociais, cultos, eventos da igreja. ' +
    'Aceita cores customizadas, textos, escala de nomes, versiculos, CTA. ' +
    'Renderiza via Playwright headless Chromium (alinhado com OpenSquad). ' +
    'Multiplos slides geram multiplos PNGs numerados.',
  category: 'office',
  parameters: {
    type: 'object',
    properties: {
      // === Modo de geracao (compat) ===
      type: {
        type: 'string',
        enum: ['banner', 'carousel', 'card', 'opensquad-a', 'opensquad-b', 'opensquad-c'],
        description:
          'Tipo de visual: banner (vertical 1080x1350), carousel (1080x1080 multi), ' +
          'card (1080x1080 1), opensquad-a (Twitter editorial), ' +
          'opensquad-b (Clean visual com cards numerados), opensquad-c (Data dashboard).',
      },
      // === Viewport ===
      viewport: {
        type: 'string',
        enum: Object.keys(VIEWPORT_PRESETS),
        description:
          `Preset de plataforma (sobrescreve width/height): ${Object.keys(VIEWPORT_PRESETS).join(', ')}. ` +
          'Para Instagram carrossel use "instagram-carousel" (1080x1440 - padrao OpenSquad).',
      },
      width: { type: 'number', description: 'Largura em pixels (default: 1080).' },
      height: { type: 'number', description: 'Altura em pixels (default: 1080).' },
      outputDir: {
        type: 'string',
        description: 'Diretorio onde salvar o(s) PNG(s). Se nao existir, sera criado.',
      },
      filename: {
        type: 'string',
        description: 'Nome base do arquivo (sem extensao). Default: gera slug a partir do titulo. Para carousel, sufixo -1, -2... adicionado.',
      },
      // === Campos do banner (compat) ===
      topLeft: { type: 'string', description: '[banner] Texto canto superior esquerdo.' },
      topRight: { type: 'string', description: '[banner] Texto canto superior direito.' },
      titlePrefix: { type: 'string', description: '[banner] Prefixo do titulo.' },
      titleMain: { type: 'string', description: '[banner] Titulo principal.' },
      titleSecondary: { type: 'string', description: '[banner] Titulo secundario.' },
      verses: { type: 'string', description: '[banner] Versiculo.' },
      purpose: { type: 'string', description: '[banner] Proposito.' },
      dateStart: { type: 'string', description: '[banner] Data inicial.' },
      dateEnd: { type: 'string', description: '[banner] Data final.' },
      dateLabel: { type: 'string', description: '[banner] Label do dia da semana final.' },
      description: { type: 'string', description: '[banner] Descricao.' },
      scaleTitle: { type: 'string', description: '[banner] Titulo da escala.' },
      scale: {
        type: 'array',
        description: '[banner] Array de objetos {day, name, date} para a escala.',
        items: { type: 'object' },
      },
      // === Campos compartilhados ===
      churchName: { type: 'string', description: 'Nome da igreja.' },
      churchTagline: { type: 'string', description: 'Slogan da igreja.' },
      // === Campos do carousel/card ===
      slides: {
        type: 'array',
        description: '[carousel] Array de slides {label, title, body, verses, versesRef, ctaHeadline, ctaSub}.',
        items: { type: 'object' },
      },
      title: { type: 'string', description: '[card] Titulo principal.' },
      body: { type: 'string', description: '[card] Texto do corpo.' },
      label: { type: 'string', description: '[card] Label/tag superior.' },
      ctaHeadline: { type: 'string', description: '[card] CTA headline.' },
      ctaSub: { type: 'string', description: '[card] CTA subtitulo.' },
      ctaText: { type: 'string', description: '[carousel] Texto do CTA no rodape.' },
      // === Cores (max 5, regra image-design.md) ===
      primaryColor: { type: 'string', description: 'Cor primaria (default: #1a2540 azul marinho).' },
      accentColor: { type: 'string', description: 'Cor de destaque (default: #d4a017 dourado).' },
      backgroundColor: { type: 'string', description: 'Cor de fundo (default: #f5efe6 bege).' },
      textColor: { type: 'string', description: 'Cor do texto (default: #1a2540).' },
      mutedColor: { type: 'string', description: 'Cor secundaria/muted (default: #6b7280).' },
      // === OpenSquad template params (A/B/C) ===
      tag: { type: 'string', description: '[opensquad-a/c] Tag uppercase (ex: "PERGUNTA INCÔMODA").' },
      question: { type: 'string', description: '[opensquad-a] Pergunta hero (ex: "Por que o TSE proibiu...").' },
      reveal: { type: 'string', description: '[opensquad-a] Texto de revelacao com strong.' },
      authorName: { type: 'string', description: '[opensquad-a] Nome do autor.' },
      authorHandle: { type: 'string', description: '[opensquad-a] @handle.' },
      items: {
        type: 'array',
        description: '[opensquad-b] Array de {n, title, subtitle} para cards numerados.',
        items: { type: 'object' },
      },
      metrics: {
        type: 'array',
        description: '[opensquad-c] Array de {label, value, color} para cards de metricas.',
        items: { type: 'object' },
      },
    },
    required: ['type', 'outputDir'],
  },
  async execute(args) {
    const type = String(args.type || '').trim();
    const outputDir = String(args.outputDir || '').trim();
    if (!type) {
      return { content: 'Erro: type obrigatorio', error: true };
    }
    if (!outputDir) {
      return { content: 'Erro: outputDir obrigatorio', error: true };
    }

    // Resolve viewport (preset > width/height > default)
    const viewport = resolveViewport(args);

    // Cores (max 5, regra OpenSquad image-design.md)
    const colors = {
      primary: String(args.primaryColor || '#1a2540'),
      accent:  String(args.accentColor  || '#d4a017'),
      bg:      String(args.backgroundColor || '#f5efe6'),
      text:    String(args.textColor || '#1a2540'),
      muted:   String(args.mutedColor || '#6b7280'),
    };
    const churchName = String(args.churchName || 'IGREJA BATISTA');
    const churchTagline = String(args.churchTagline || 'Uma igreja que ora');

    try {
      await mkdir(outputDir, { recursive: true });
    } catch (err) {
      return { content: `Erro criando outputDir: ${(err as Error).message}`, error: true };
    }

    // Prepara HTML por modo
    let pages: { name: string; html: string }[] = [];

    if (type === 'banner') {
      const html = await renderBannerHTML({
        topLeft: String(args.topLeft || ''),
        topRight: String(args.topRight || churchName),
        titlePrefix: String(args.titlePrefix || 'CAMPANHA DE'),
        titleMain: String(args.titleMain || 'ORACAO'),
        titleSecondary: String(args.titleSecondary || 'E JEJUM'),
        verses: String(args.verses || ''),
        purpose: String(args.purpose || ''),
        dateStart: String(args.dateStart || ''),
        dateEnd: String(args.dateEnd || ''),
        dateLabel: String(args.dateLabel || ''),
        description: String(args.description || ''),
        scaleTitle: String(args.scaleTitle || 'ESCALA'),
        scale: Array.isArray(args.scale) ? (args.scale as Array<{day:string;name:string;date:string}>) : [],
        churchName,
        churchTagline,
        colors,
      });
      const filename = String(args.filename || slugify(String(args.titleMain || 'banner')));
      pages = [{ name: `${filename}.png`, html }];
    } else if (type === 'card') {
      const html = await renderCarouselHTML(
        {
          label: String(args.label || 'CAMPANHA'),
          title: String(args.title || ''),
          body: String(args.body || ''),
          verses: args.verses ? String(args.verses) : undefined,
          versesRef: args.versesRef ? String(args.versesRef) : undefined,
          ctaHeadline: args.ctaHeadline ? String(args.ctaHeadline) : undefined,
          ctaSub: args.ctaSub ? String(args.ctaSub) : undefined,
        },
        1, 1, churchName, churchTagline, String(args.ctaText || ''), colors,
      );
      const filename = String(args.filename || slugify(String(args.title || 'card')));
      pages = [{ name: `${filename}.png`, html }];
    } else if (type === 'carousel') {
      const slides: CarouselSlide[] = Array.isArray(args.slides) ? (args.slides as CarouselSlide[]) : [];
      if (slides.length === 0) {
        return { content: 'Erro: carousel precisa de array "slides" com pelo menos 1 item', error: true };
      }
      const total = slides.length;
      for (let i = 0; i < slides.length; i++) {
        const html = await renderCarouselHTML(slides[i], i + 1, total, churchName, churchTagline, String(args.ctaText || ''), colors);
        const filename = String(args.filename || slugify(slides[i].title || 'carousel'));
        const suffix = total > 1 ? `-${i + 1}` : '';
        pages.push({ name: `${filename}${suffix}.png`, html });
      }
    } else if (type === 'opensquad-a') {
      const html = await renderOpenSquadA({
        tag: String(args.tag || 'PERGUNTA INCÔMODA'),
        question: String(args.question || 'Sua pergunta aqui?'),
        reveal: String(args.reveal || ''),
        authorName: String(args.authorName || churchName),
        authorHandle: String(args.authorHandle || '@suaigreja'),
        churchName,
        churchTagline,
        colors,
      });
      const filename = String(args.filename || slugify(String(args.question) || 'opensquad-a'));
      pages = [{ name: `${filename}.png`, html }];
    } else if (type === 'opensquad-b') {
      const items = Array.isArray(args.items)
        ? (args.items as Array<{ n: number | string; title: string; subtitle?: string }>)
        : [];
      if (items.length === 0) {
        return { content: 'Erro: opensquad-b precisa de array "items" com pelo menos 1 item', error: true };
      }
      const html = await renderOpenSquadB({
        items,
        churchName,
        colors,
      });
      const filename = String(args.filename || slugify(items[0].title || 'opensquad-b'));
      pages = [{ name: `${filename}.png`, html }];
    } else if (type === 'opensquad-c') {
      const metrics = Array.isArray(args.metrics)
        ? (args.metrics as Array<{ label: string; value: string; color?: string }>)
        : [];
      if (metrics.length === 0) {
        return { content: 'Erro: opensquad-c precisa de array "metrics" com pelo menos 1 item', error: true };
      }
      const html = await renderOpenSquadC({
        metrics,
        churchName,
        colors,
      });
      const filename = String(args.filename || slugify(metrics[0].label || 'opensquad-c'));
      pages = [{ name: `${filename}.png`, html }];
    } else {
      return { content: `Erro: type "${type}" nao suportado`, error: true };
    }

    // Lazy import playwright (pode falhar se nao tiver browser instalado)
    let chromium: any;
    try {
      const pw = await import('playwright');
      chromium = pw.chromium;
    } catch (e) {
      throw new Error(`playwright nao disponivel: ${(e as Error).message}`);
    }

    // Lancar browser headless
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    }).catch((e: Error) => {
      throw new Error(`Falha lancando Chromium: ${e.message}. Em Docker rode: npx playwright install --with-deps chromium`);
    });

    const results: { filename: string; path: string; size: number }[] = [];
    try {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      });
      try {
        for (const page of pages) {
          const tab = await context.newPage();
          await tab.setContent(page.html, { waitUntil: 'load' });
          // Aguarda fontes carregarem (Playwright tambem expõe document no page context)
          await tab.evaluate('document.fonts.ready');
          const outPath = resolve(outputDir, page.name);
          const buf = await tab.screenshot({
            type: 'png',
            clip: { x: 0, y: 0, width: viewport.width, height: viewport.height },
          });
          await writeFile(outPath, buf);
          await tab.close();
          results.push({ filename: page.name, path: outPath, size: buf.length });
        }
      } finally {
        await context.close();
      }
    } finally {
      await browser.close();
    }

    let msg = '';
    if (results.length === 1) {
      const r = results[0];
      msg = `Imagem gerada: ${r.path} (${(r.size/1024).toFixed(1)} KB, ${viewport.width}x${viewport.height})`;
    } else {
      msg = `${results.length} imagens geradas em ${outputDir} (${viewport.width}x${viewport.height}):\n` +
            results.map((r) => `  - ${r.filename} (${(r.size/1024).toFixed(1)} KB)`).join('\n');
    }
    return {
      content: msg,
      data: { type, outputDir, viewport, files: results, engine: 'playwright' },
    };
  },
};

// =====================================================
// Helpers
// =====================================================

function resolveViewport(args: any): { width: number; height: number } {
  if (args.viewport && VIEWPORT_PRESETS[args.viewport]) {
    return VIEWPORT_PRESETS[args.viewport];
  }
  const w = Number(args.width) || 1080;
  const h = Number(args.height) || 1080;
  return { width: w, height: h };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60) || 'visual';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// =====================================================
// Template: BANNER (compat com codigo anterior)
// =====================================================
async function renderBannerHTML(p: {
  topLeft: string; topRight: string;
  titlePrefix: string; titleMain: string; titleSecondary: string;
  verses: string; purpose: string;
  dateStart: string; dateEnd: string; dateLabel: string; description: string;
  scaleTitle: string;
  scale: Array<{day:string;name:string;date:string}>;
  churchName: string; churchTagline: string;
  colors: { primary: string; accent: string; bg: string; text: string; muted: string };
}): Promise<string> {
  const tpl = await readFile(join(TEMPLATES_DIR, 'banner.html'), 'utf-8');
  const scaleRows = p.scale
    .map((s) => `<div class="scale-row">
        <div class="day"><span class="icon">📅</span>${escapeHtml(s.day.toUpperCase())}</div>
        <div class="name">${escapeHtml(s.name)}</div>
        <div class="date">${escapeHtml(s.date)}</div>
      </div>`)
    .join('\n');

  const replace = (html: string, key: string, val: string): string =>
    html.replace(new RegExp('\\{\\{\\s*' + key + '\\s*\\}\\}', 'g'), val);

  let out = tpl;
  out = out.replace('background: #f5efe6;', `background: ${p.colors.bg};`);
  out = out.replace('color: #1a2540;', `color: ${p.colors.primary};`);
  out = out.replaceAll('#1a2540', p.colors.primary);
  out = out.replaceAll('#d4a017', p.colors.accent);
  out = out.replaceAll('#f5efe6', p.colors.bg);

  out = replace(out, 'top_left', escapeHtml(p.topLeft || p.churchName));
  out = replace(out, 'top_right', escapeHtml(p.topRight));
  out = replace(out, 'title_prefix', escapeHtml(p.titlePrefix));
  out = replace(out, 'title_main', escapeHtml(p.titleMain));
  out = replace(out, 'title_secondary', escapeHtml(p.titleSecondary));
  out = replace(out, 'verses', escapeHtml(p.verses));
  out = replace(out, 'purpose', escapeHtml(p.purpose));
  out = replace(out, 'date_start', escapeHtml(p.dateStart));
  out = replace(out, 'date_end', escapeHtml(p.dateEnd));
  out = replace(out, 'date_label', escapeHtml(p.dateLabel));
  out = replace(out, 'description', escapeHtml(p.description));
  out = replace(out, 'scale_title', escapeHtml(p.scaleTitle));
  out = replace(out, 'scale_rows', scaleRows);
  out = replace(out, 'church_name', escapeHtml(p.churchName));
  out = replace(out, 'church_tagline', escapeHtml(p.churchTagline));
  return out;
}

// =====================================================
// Template: CAROUSEL/CARD (compat com codigo anterior)
// =====================================================
async function renderCarouselHTML(
  slide: CarouselSlide,
  slideNumber: number,
  totalSlides: number,
  churchName: string,
  churchTagline: string,
  ctaText: string,
  colors: { primary: string; accent: string; bg: string; text: string; muted: string },
): Promise<string> {
  const tpl = await readFile(join(TEMPLATES_DIR, 'carousel.html'), 'utf-8');

  const bodyHtml = (slide.body || '')
    .split(/\n\n+/)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('\n');

  const versesHtml = slide.verses
    ? `<div class="verses">"${escapeHtml(slide.verses)}"<span class="ref">— ${escapeHtml(slide.versesRef || '')}</span></div>`
    : '';

  const ctaHtml = (slide.ctaHeadline || slide.ctaSub)
    ? `<div class="cta"><div class="headline">${escapeHtml(slide.ctaHeadline || '')}</div><div class="sub">${escapeHtml(slide.ctaSub || '')}</div></div>`
    : '';

  const replace = (html: string, key: string, val: string): string =>
    html.replace(new RegExp('\\{\\{\\s*' + key + '\\s*\\}\\}', 'g'), val);

  let out = tpl;
  out = out.replaceAll('#1a2540', colors.primary);
  out = out.replaceAll('#d4a017', colors.accent);
  out = out.replaceAll('#f5efe6', colors.bg);

  out = replace(out, 'title', escapeHtml(slide.title));
  out = replace(out, 'label', escapeHtml((slide.label || '').toUpperCase()));
  out = replace(out, 'body', bodyHtml);
  out = replace(out, 'verses_html', versesHtml);
  out = replace(out, 'cta_html', ctaHtml);
  out = replace(out, 'slide_number', String(slideNumber));
  out = replace(out, 'total_slides', String(totalSlides));
  out = replace(out, 'church_name', escapeHtml(churchName));
  out = replace(out, 'church_tagline', escapeHtml(churchTagline));
  out = replace(out, 'cta_text', escapeHtml(ctaText));
  return out;
}

// =====================================================
// Template: OpenSquad Model A (Twitter Editorial)
// Base: skills/template-designer/base-templates/model-a.html do OpenSquad
// Viewport: 1080x1440 (instagram-carousel padrao)
// Regra: SEM slide counter, hero 62px, swipe CTA accent
// =====================================================
async function renderOpenSquadA(p: {
  tag: string;
  question: string;
  reveal: string;
  authorName: string;
  authorHandle: string;
  churchName: string;
  churchTagline: string;
  colors: { primary: string; accent: string; bg: string; text: string; muted: string };
}): Promise<string> {
  // Cor de fundo default do OpenSquad Model A: preto (#000). Texto branco.
  // Pode ser customizado via primaryColor (bg) + textColor (texto).
  const bg = p.colors.bg === '#f5efe6' ? '#0A0E1A' : p.colors.bg; // override default bege
  const fg = p.colors.text === '#1a2540' ? '#FFFFFF' : p.colors.text;
  const muted = p.colors.muted === '#6b7280' ? '#8899AA' : p.colors.muted;
  const accent = p.colors.accent === '#d4a017' ? '#1E90FF' : p.colors.accent;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;900&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1080px; height: 1440px; overflow: hidden;
    background: ${bg};
    color: ${fg};
    font-family: 'Inter', sans-serif;
    display: flex; flex-direction: column;
    padding: 80px 72px;
    position: relative;
  }
  .tag {
    font-size: 22px; font-weight: 700; color: ${accent};
    text-transform: uppercase; letter-spacing: 3px;
    margin-bottom: 40px;
  }
  .question {
    font-size: 62px; font-weight: 700; color: ${fg};
    line-height: 1.2; margin-bottom: 48px;
    max-width: 880px;
  }
  .question .accent { color: ${accent}; }
  .reveal {
    font-size: 32px; font-weight: 400; color: ${muted};
    line-height: 1.5; max-width: 820px;
    border-left: 4px solid ${accent};
    padding-left: 28px;
  }
  .reveal strong { color: ${fg}; font-weight: 700; }
  .swipe {
    position: absolute; bottom: 72px; right: 72px;
    display: flex; align-items: center; gap: 12px;
    font-size: 22px; font-weight: 500; color: ${accent};
  }
  .swipe-arrow {
    width: 40px; height: 40px; border-radius: 50%;
    border: 2px solid ${accent};
    display: flex; align-items: center; justify-content: center;
    font-size: 20px;
  }
  .deco-line {
    position: absolute; top: 0; right: 0;
    width: 4px; height: 100%;
    background: linear-gradient(to bottom, transparent, ${accent}, transparent);
    opacity: 0.4;
  }
  .author {
    position: absolute; bottom: 72px; left: 72px;
    display: flex; align-items: center; gap: 16px;
  }
  .author-avatar {
    width: 48px; height: 48px; border-radius: 50%;
    background: linear-gradient(135deg, ${accent}, ${muted});
  }
  .author-info { display: flex; flex-direction: column; }
  .author-name { font-size: 20px; font-weight: 700; color: ${fg}; }
  .author-handle { font-size: 16px; color: ${muted}; }
</style>
</head>
<body>
  <div class="deco-line"></div>
  <div class="tag">${escapeHtml(p.tag)}</div>
  <h1 class="question">${escapeHtml(p.question)}</h1>
  <p class="reveal">${escapeHtml(p.reveal)}</p>
  <div class="author">
    <div class="author-avatar"></div>
    <div class="author-info">
      <span class="author-name">${escapeHtml(p.authorName)}</span>
      <span class="author-handle">${escapeHtml(p.authorHandle)}</span>
    </div>
  </div>
  <div class="swipe">
    <span>Swipe</span>
    <div class="swipe-arrow">→</div>
  </div>
</body>
</html>`;
}

// =====================================================
// Template: OpenSquad Model B (Clean Visual - cards numerados)
// Base: skills/template-designer/base-templates/model-b.html
// =====================================================
async function renderOpenSquadB(p: {
  items: Array<{ n: number | string; title: string; subtitle?: string }>;
  churchName: string;
  colors: { primary: string; accent: string; bg: string; text: string; muted: string };
}): Promise<string> {
  // Cores default do OpenSquad Model B: warm cream + orange. Pode customizar.
  const bg = p.colors.bg === '#f5efe6' ? '#FDF6EE' : p.colors.bg;
  const fg = p.colors.text === '#1a2540' ? '#111111' : p.colors.text;
  const accent = p.colors.accent === '#d4a017' ? '#E85D2A' : p.colors.accent;
  const muted = p.colors.muted === '#6b7280' ? '#666666' : p.colors.muted;

  // Gera paleta de gradient progressivo (orange steps)
  const accentSteps = ['#E85D2A', '#D4742A', '#C05A1A', '#A04010'];

  const itemRows = p.items.map((item, i) => {
    const step = accentSteps[i % accentSteps.length];
    const isDark = i === p.items.length - 1;
    const bgStyle = i === 0
      ? `background: #FFF5E6;`
      : `background: linear-gradient(90deg, #FDEBD0, #${i % 2 === 0 ? 'F5C89A' : 'FDEBD0'});`;
    const finalBg = isDark ? `background: linear-gradient(90deg, #E8A065, #D07030);` : bgStyle;
    const titleColor = isDark ? '#fff' : fg;
    const subColor = isDark ? '#ffffffcc' : muted;
    return `<div style="display:flex;align-items:center;gap:28px;${finalBg}border-radius:20px;padding:28px 32px;">
      <div style="width:64px;height:64px;border-radius:50%;border:3px solid ${step};display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;color:${step};flex-shrink:0;">${item.n}</div>
      <div>
        <div style="font-size:34px;font-weight:700;color:${titleColor};">${escapeHtml(item.title)}</div>
        ${item.subtitle ? `<div style="font-size:26px;color:${subColor};font-weight:500;">${escapeHtml(item.subtitle)}</div>` : ''}
      </div>
    </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;900&family=Montserrat:wght@900&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1080px; height: 1440px; overflow: hidden;
    background: ${bg};
    color: ${fg};
    font-family: 'Inter', sans-serif;
    display: flex; flex-direction: column;
    padding: 72px;
    justify-content: center;
    gap: 48px;
  }
  h1 {
    text-align: center;
    font-size: 58px; font-weight: 900; line-height: 1.15;
    margin: 0; text-transform: uppercase;
    font-family: 'Montserrat', sans-serif;
  }
  h1 .accent { color: ${accent}; }
  .items { display: flex; flex-direction: column; gap: 20px; }
</style>
</head>
<body>
  <h1>${escapeHtml(p.churchName.toUpperCase())}</h1>
  <div class="items">
    ${itemRows}
  </div>
</body>
</html>`;
}

// =====================================================
// Template: OpenSquad Model C (Data Dashboard - metricas)
// Base: skills/template-designer/base-templates/model-c.html
// =====================================================
async function renderOpenSquadC(p: {
  metrics: Array<{ label: string; value: string; color?: string }>;
  churchName: string;
  colors: { primary: string; accent: string; bg: string; text: string; muted: string };
}): Promise<string> {
  // Default OpenSquad: dark purple + yellow/pink/green/purple metrics
  const bg = p.colors.bg === '#f5efe6'
    ? 'linear-gradient(160deg,#0f0326,#1a0a3e 40%,#0d0d0d)'
    : p.colors.bg;
  const fg = p.colors.text === '#1a2540' ? '#FFFFFF' : p.colors.text;
  const muted = p.colors.muted === '#6b7280' ? '#888888' : p.colors.muted;

  // Paleta de cores das metricas
  const metricColors = ['#F59E0B', '#EC4899', '#7C3AED', '#4ADE80', '#1E90FF', '#E85D2A'];

  const rows = p.metrics.map((m, i) => {
    const color = m.color || metricColors[i % metricColors.length];
    return `<div style="background:#ffffff08;border:1px solid #ffffff10;border-radius:16px;padding:28px 32px;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:28px;color:${muted};font-weight:500;">${escapeHtml(m.label)}</span>
      <span style="font-size:40px;font-weight:800;color:${color};font-family:'Montserrat',sans-serif;">${escapeHtml(m.value)}</span>
    </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800;900&family=Montserrat:wght@900&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1080px; height: 1440px; overflow: hidden;
    background: ${bg};
    color: ${fg};
    font-family: 'Inter', sans-serif;
    display: flex; flex-direction: column;
    padding: 72px;
    position: relative;
  }
  .glow-1 {
    position: absolute; top: -120px; right: -120px;
    width: 480px; height: 480px;
    background: radial-gradient(circle, #7C3AED33, transparent 70%);
    pointer-events: none;
  }
  .glow-2 {
    position: absolute; bottom: -100px; left: -100px;
    width: 400px; height: 400px;
    background: radial-gradient(circle, #F59E0B22, transparent 70%);
    pointer-events: none;
  }
  .header { position: relative; z-index: 1; margin-bottom: 40px; }
  .tag {
    display: inline-block;
    background: #F59E0B33;
    border-radius: 8px; padding: 8px 20px;
    font-size: 24px; color: #F59E0B; font-weight: 800;
    text-transform: uppercase; letter-spacing: 3px;
    margin-bottom: 28px;
  }
  h1 {
    font-size: 52px; font-weight: 900; line-height: 1.2;
    margin: 0 0 24px 0;
    font-family: 'Montserrat', sans-serif;
  }
  h1 .accent {
    background: linear-gradient(90deg, #F59E0B, #EC4899);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .sub {
    font-size: 34px; color: #bbb;
    line-height: 1.55; margin: 0;
    font-weight: 500; letter-spacing: 0.01em;
  }
  .metrics {
    position: relative; z-index: 1;
    display: flex; flex-direction: column;
    gap: 16px; margin: 40px 0; flex: 1;
    justify-content: center;
  }
  .footer {
    position: relative; z-index: 1;
    display: flex; align-items: center; gap: 20px;
    padding-top: 24px;
    border-top: 1px solid #ffffff12;
  }
  .footer-avatar {
    width: 48px; height: 48px; border-radius: 50%;
    background: linear-gradient(135deg, #F59E0B, #EC4899);
  }
  .footer-handle { font-size: 24px; color: #777; }
</style>
</head>
<body>
  <div class="glow-1"></div>
  <div class="glow-2"></div>
  <div class="header">
    <div class="tag">${escapeHtml(p.churchName.toUpperCase())}</div>
    <h1>Dados <span class="accent">reais</span> da nossa igreja</h1>
    <p class="sub">Veja o que Deus tem feito atraves da sua participacao.</p>
  </div>
  <div class="metrics">
    ${rows}
  </div>
  <div class="footer">
    <div class="footer-avatar"></div>
    <span class="footer-handle">${escapeHtml('@' + p.churchName.toLowerCase().replace(/[^a-z0-9]/g, ''))}</span>
  </div>
</body>
</html>`;
}
