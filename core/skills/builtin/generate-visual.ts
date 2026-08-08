/**
 * generate_visual - gera imagem PNG a partir de template HTML via Puppeteer.
 *
 * 3 modos:
 *  - banner: 1080x1350 (cartaz vertical)
 *  - carousel: 1080x1080 (multi-slide Instagram)
 *  - card: 1080x1080 (1 slide quadrado)
 *
 * Usa templates HTML em core/templates/visual/ (banner.html, carousel.html).
 * Renderiza via Puppeteer headless Chromium.
 *
 * NAO requer Microsoft Office. Funciona em qualquer plataforma com Chromium.
 *
 * IMPORTANTE: no Windows usa o Chrome/Edge ja instalado; no Linux/Docker precisa
 * de Chromium (instalado no Dockerfile.core).
 */

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Skill } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATES_DIR = resolve(__dirname, '..', '..', 'templates', 'visual');

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
    'Use para criar material visual para redes sociais, cultos, eventos da igreja. ' +
    'Aceita cores customizadas, textos, escala de nomes, versiculos, CTA. ' +
    'Renderiza via Chromium headless. Multiplos slides geram multiplos PNGs numerados.',
  category: 'office',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['banner', 'carousel', 'card'],
        description: 'Tipo de visual: banner (vertical), carousel (multi-slide quadrado), card (1 quadrado).',
      },
      outputDir: {
        type: 'string',
        description: 'Diretorio onde salvar o(s) PNG(s). Se nao existir, sera criado.',
      },
      filename: {
        type: 'string',
        description: 'Nome base do arquivo (sem extensao). Default: gera slug a partir do titulo. Para carousel, sufixo -1, -2... adicionado.',
      },
      // Campos do banner
      topLeft: { type: 'string', description: '[banner] Texto canto superior esquerdo (ex: nome da igreja, evento).' },
      topRight: { type: 'string', description: '[banner] Texto canto superior direito (ex: "IGREJA BATISTA").' },
      titlePrefix: { type: 'string', description: '[banner] Prefixo do titulo (ex: "CAMPANHA DE").' },
      titleMain: { type: 'string', description: '[banner] Titulo principal (ex: "ORACAO").' },
      titleSecondary: { type: 'string', description: '[banner] Titulo secundario (ex: "E JEJUM").' },
      verses: { type: 'string', description: '[banner] Versiculo (ex: "Creio no Senhor Jesus...").' },
      purpose: { type: 'string', description: '[banner] Proposito (ex: "LIBERTACAO, CURA E SALVACAO").' },
      dateStart: { type: 'string', description: '[banner] Data inicial (ex: "09/08 (DOMINGO)").' },
      dateEnd: { type: 'string', description: '[banner] Data final (ex: "31/12 (QUARTA-FEIRA)").' },
      dateLabel: { type: 'string', description: '[banner] Label do dia da semana final.' },
      description: { type: 'string', description: '[banner] Descricao (ex: "CADA DIA UMA DUPLA...").' },
      scaleTitle: { type: 'string', description: '[banner] Titulo da escala (ex: "ESCALA DE ORACAO E JEJUM - AGOSTO").' },
      scale: {
        type: 'array',
        description: '[banner] Array de objetos {day, name, date} para a escala (ex: [{day:"DOMINGO",name:"Pastor e Jane",date:"09/08"}, ...]).',
        items: { type: 'object' },
      },
      // Campos compartilhados
      churchName: { type: 'string', description: 'Nome da igreja (ex: "IGREJA BATISTA CENTRAL").' },
      churchTagline: { type: 'string', description: 'Slogan da igreja (ex: "Uma igreja que ora").' },
      // Campos do carousel
      slides: {
        type: 'array',
        description: '[carousel] Array de slides {label, title, body, verses, versesRef, ctaHeadline, ctaSub}.',
        items: { type: 'object' },
      },
      ctaText: { type: 'string', description: '[carousel] Texto do CTA no rodape (ex: "Saiba mais", "Inscreva-se").' },
      // Cores
      primaryColor: { type: 'string', description: 'Cor primaria (default: #1a2540 azul marinho).' },
      accentColor: { type: 'string', description: 'Cor de destaque (default: #d4a017 dourado).' },
      backgroundColor: { type: 'string', description: 'Cor de fundo (default: #f5efe6 bege).' },
    },
    required: ['type', 'outputDir'],
  },
  async execute(args) {
    const type = String(args.type || '').trim();
    const outputDir = String(args.outputDir || '').trim();
    if (!type || !['banner', 'carousel', 'card'].includes(type)) {
      return { content: 'Erro: type deve ser "banner", "carousel" ou "card"', error: true };
    }
    if (!outputDir) {
      return { content: 'Erro: outputDir obrigatorio', error: true };
    }

    const colors = {
      primary: String(args.primaryColor || '#1a2540'),
      accent: String(args.accentColor || '#d4a017'),
      bg: String(args.backgroundColor || '#f5efe6'),
    };
    const churchName = String(args.churchName || 'IGREJA BATISTA');
    const churchTagline = String(args.churchTagline || 'Uma igreja que ora');

    try {
      await mkdir(outputDir, { recursive: true });
    } catch (err) {
      return { content: `Erro criando outputDir: ${(err as Error).message}`, error: true };
    }

    // Lazy import puppeteer (pode falhar se nao tiver Chromium)
    const puppeteer = await import('puppeteer').catch((e) => {
      throw new Error(`puppeteer nao disponivel: ${e.message}`);
    });

    // Prepara HTML por modo
    let pages: { name: string; html: string; width: number; height: number }[] = [];

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
      pages = [{ name: `${filename}.png`, html, width: 1080, height: 1350 }];
    } else if (type === 'card') {
      const slides: CarouselSlide[] = [
        {
          label: String(args.label || 'CAMPANHA'),
          title: String(args.title || ''),
          body: String(args.body || ''),
          verses: args.verses ? String(args.verses) : undefined,
          versesRef: args.versesRef ? String(args.versesRef) : undefined,
          ctaHeadline: args.ctaHeadline ? String(args.ctaHeadline) : undefined,
          ctaSub: args.ctaSub ? String(args.ctaSub) : undefined,
        },
      ];
      const html = await renderCarouselHTML(slides[0], 1, 1, churchName, churchTagline, String(args.ctaText || ''), colors);
      const filename = String(args.filename || slugify(String(args.title || 'card')));
      pages = [{ name: `${filename}.png`, html, width: 1080, height: 1080 }];
    } else {
      // carousel
      const slides: CarouselSlide[] = Array.isArray(args.slides) ? (args.slides as CarouselSlide[]) : [];
      if (slides.length === 0) {
        return { content: 'Erro: carousel precisa de array "slides" com pelo menos 1 item', error: true };
      }
      const total = slides.length;
      for (let i = 0; i < slides.length; i++) {
        const html = await renderCarouselHTML(slides[i], i + 1, total, churchName, churchTagline, String(args.ctaText || ''), colors);
        const filename = String(args.filename || slugify(slides[i].title || 'carousel'));
        const suffix = total > 1 ? `-${i + 1}` : '';
        pages.push({ name: `${filename}${suffix}.png`, html, width: 1080, height: 1080 });
      }
    }

    // Lanca browser
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    }).catch((e: Error) => {
      throw new Error(`Falha lancando Chromium: ${e.message}. Verifique se Chrome/Chromium esta instalado.`);
    });

    const results: { filename: string; path: string; size: number }[] = [];
    try {
      for (const page of pages) {
        const p = await browser.newPage();
        await p.setViewport({ width: page.width, height: page.height, deviceScaleFactor: 1 });
        await p.setContent(page.html, { waitUntil: 'load' });
        // Aguarda fontes carregarem (Puppeteer injeta `document` no page context via string eval)
        await p.evaluate('document.fonts.ready');
        const outPath = resolve(outputDir, page.name);
        const buf = await p.screenshot({
          type: 'png',
          clip: { x: 0, y: 0, width: page.width, height: page.height },
        });
        await writeFile(outPath, buf);
        await p.close();
        results.push({ filename: page.name, path: outPath, size: buf.length });
      }
    } finally {
      await browser.close();
    }

    let msg = '';
    if (results.length === 1) {
      const r = results[0];
      msg = `Imagem gerada: ${r.path} (${(r.size/1024).toFixed(1)} KB)`;
    } else {
      msg = `${results.length} imagens geradas em ${outputDir}:\n` +
            results.map((r) => `  - ${r.filename} (${(r.size/1024).toFixed(1)} KB)`).join('\n');
    }
    return { content: msg, data: { type, outputDir, files: results } };
  },
};

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

async function renderBannerHTML(p: {
  topLeft: string; topRight: string;
  titlePrefix: string; titleMain: string; titleSecondary: string;
  verses: string; purpose: string;
  dateStart: string; dateEnd: string; dateLabel: string; description: string;
  scaleTitle: string;
  scale: Array<{day:string;name:string;date:string}>;
  churchName: string; churchTagline: string;
  colors: { primary: string; accent: string; bg: string };
}): Promise<string> {
  const tpl = await readFile(join(TEMPLATES_DIR, 'banner.html'), 'utf-8');
  const scaleRows = p.scale
    .map((s) => `<div class="scale-row">
        <div class="day"><span class="icon">📅</span>${escapeHtml(s.day.toUpperCase())}</div>
        <div class="name">${escapeHtml(s.name)}</div>
        <div class="date">${escapeHtml(s.date)}</div>
      </div>`)
    .join('\n');

  // Substitui placeholders. Usa funcao pra evitar conflito com {{ }} do CSS.
  const replace = (html: string, key: string, val: string): string =>
    html.replace(new RegExp('\\{\\{\\s*' + key + '\\s*\\}\\}', 'g'), val);

  let out = tpl;
  // CSS vars (cor)
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

async function renderCarouselHTML(
  slide: CarouselSlide,
  slideNumber: number,
  totalSlides: number,
  churchName: string,
  churchTagline: string,
  ctaText: string,
  colors: { primary: string; accent: string; bg: string },
): Promise<string> {
  const tpl = await readFile(join(TEMPLATES_DIR, 'carousel.html'), 'utf-8');

  // Body (quebra em paragrafos)
  const bodyHtml = (slide.body || '')
    .split(/\n\n+/)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('\n');

  // Versiculos
  const versesHtml = slide.verses
    ? `<div class="verses">"${escapeHtml(slide.verses)}"<span class="ref">— ${escapeHtml(slide.versesRef || '')}</span></div>`
    : '';

  // CTA box
  const ctaHtml = (slide.ctaHeadline || slide.ctaSub)
    ? `<div class="cta"><div class="headline">${escapeHtml(slide.ctaHeadline || '')}</div><div class="sub">${escapeHtml(slide.ctaSub || '')}</div></div>`
    : '';

  const replace = (html: string, key: string, val: string): string =>
    html.replace(new RegExp('\\{\\{\\s*' + key + '\\s*\\}\\}', 'g'), val);

  let out = tpl;
  // Cores
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
