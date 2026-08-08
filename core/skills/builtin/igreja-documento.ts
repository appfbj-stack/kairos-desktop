/**
 * igreja_documento - gera PDF de documentos oficiais da igreja a partir de templates HTML.
 *
 * 4 modos disponiveis:
 *   - carta:   Carta (apresentacao, transferencia, recomendacao) - A4 retrato
 *   - recibo:  Recibo (dizimo, oferta, doacao) - A5 paisagem
 *   - ata:     Ata de reuniao / assembleia - A4 retrato
 *   - dizimo:  Relatorio mensal de dizimos e ofertas - A4 paisagem
 *
 * Renderiza HTML via Playwright headless Chromium -> PDF.
 * NAO requer Office. Funciona em Windows/Mac/Linux.
 *
 * Cores Kairos (default):
 *   - Primaria: #1a2540 (azul marinho)
 *   - Destaque: #d4a017 (dourado)
 *   - Fundo:    #f5efe6 (bege)
 *   - Texto:    #1a2540
 *   - Muted:    #6b7280
 */

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Skill } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATES_DIR = resolve(__dirname, '..', '..', 'templates', 'igreja');

type Mode = 'carta' | 'recibo' | 'ata' | 'dizimo';

const MODE_FILES: Record<Mode, string> = {
  carta: 'carta.html',
  recibo: 'recibo.html',
  ata: 'ata.html',
  dizimo: 'dizimo.html',
};

const MODE_PDF_FORMAT: Record<Mode, { format: string; landscape: boolean }> = {
  carta: { format: 'A4', landscape: false },
  recibo: { format: 'A5', landscape: true },
  ata: { format: 'A4', landscape: false },
  dizimo: { format: 'A4', landscape: true },
};

export const igrejaDocumento: Skill = {
  name: 'igreja_documento',
  description:
    'Gera PDF de documentos oficiais da igreja a partir de templates HTML profissionais. ' +
    '4 modos: carta (apresentacao/transferencia/recomendacao, A4 retrato), ' +
    'recibo (dizimo/oferta/doacao, A5 paisagem), ' +
    'ata (reuniao/assembleia, A4 retrato), ' +
    'dizimo (relatorio mensal com tabela de lancamentos, A4 paisagem). ' +
    'Renderiza via Playwright headless Chromium -> PDF. ' +
    'NAO requer Office instalado (funciona em qualquer PC). ' +
    'Cores Kairos: azul marinho + dourado. ' +
    'Use quando o pastor/secretario/tesoureiro precisar gerar documentos oficiais prontos para imprimir/assinar.',
  category: 'office',
  parameters: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['carta', 'recibo', 'ata', 'dizimo'],
        description: 'Tipo de documento: carta | recibo | ata | dizimo.',
      },
      outputDir: {
        type: 'string',
        description: 'Diretorio onde salvar o PDF. Sera criado se nao existir.',
      },
      filename: {
        type: 'string',
        description: 'Nome do PDF sem extensao. Default: gerado via slug do titulo.',
      },
      // === Dados da igreja (todos os modos) ===
      churchName: { type: 'string', description: 'Nome da igreja (default: IGREJA BATISTA KAIROS).' },
      churchTagline: { type: 'string', description: 'Slogan (default: Uma igreja que ora).' },
      churchAddress: { type: 'string', description: 'Endereco completo (rua, numero, bairro, cidade/UF).' },
      churchPhone: { type: 'string', description: 'Telefone.' },
      churchEmail: { type: 'string', description: 'Email.' },
      churchCnpj: { type: 'string', description: 'CNPJ (aparece em ata e dizimo).' },

      // === CARTA ===
      tipo: {
        type: 'string',
        enum: ['CARTA DE APRESENTACAO', 'CARTA DE TRANSFERENCIA', 'CARTA DE RECOMENDACAO'],
        description: '[carta] Tipo da carta.',
      },
      data_extenso: { type: 'string', description: '[carta/recibo] Data por extenso (ex: Brasilia, 08 de agosto de 2026).' },
      cidade: { type: 'string', description: '[carta/recibo] Cidade para o local-data.' },
      destinatario_nome: { type: 'string', description: '[carta] Nome completo do destinatario.' },
      destinatario_nome_curto: { type: 'string', description: '[carta] Primeiro nome ou como chamar (ex: Pastor Joao).' },
      destinatario_cargo: { type: 'string', description: '[carta] Cargo (ex: Pastor Presidente).' },
      destinatario_igreja: { type: 'string', description: '[carta] Igreja do destinatario.' },
      destinatario_endereco: { type: 'string', description: '[carta] Endereco do destinatario.' },
      assunto: { type: 'string', description: '[carta] Assunto.' },
      corpo_html: { type: 'string', description: '[carta] Corpo da carta em HTML (paragrafos <p>...</p>).' },
      pastor_nome: { type: 'string', description: '[carta] Nome do pastor que assina.' },
      pastor_cargo: { type: 'string', description: '[carta] Cargo do pastor (default: Pastor Presidente).' },

      // === RECIBO ===
      recibo_numero: { type: 'string', description: '[recibo] Numero sequencial do recibo (ex: 2026-001).' },
      tipo_recibo: { type: 'string', description: '[recibo] Tipo (ex: Recibo de Dizimo, Recibo de Oferta).' },
      valor: { type: 'string', description: '[recibo] Valor numerico (ex: 350,00).' },
      valor_extenso: { type: 'string', description: '[recibo] Valor por extenso (ex: trezentos e cinquenta reais).' },
      doador_nome: { type: 'string', description: '[recibo] Nome de quem contribui.' },
      doador_documento: { type: 'string', description: '[recibo] CPF ou CNPJ.' },
      doador_endereco: { type: 'string', description: '[recibo] Endereco do doador.' },
      doador_telefone: { type: 'string', description: '[recibo] Telefone do doador.' },
      referente_descricao: { type: 'string', description: '[recibo] Descricao do que esta sendo recebido.' },
      forma_pagamento: {
        type: 'string',
        enum: ['Dinheiro', 'PIX', 'Transferencia bancaria', 'Cartao de credito', 'Cartao de debito', 'Cheque', 'Boleto'],
        description: '[recibo] Forma de pagamento principal.',
      },
      forma_pagamento_obs: { type: 'string', description: '[recibo] Observacao da forma de pagamento (banco, agencia, etc).' },
      tesoureiro_nome: { type: 'string', description: '[recibo/dizimo] Nome do tesoureiro.' },
      tesoureiro_cargo: { type: 'string', description: '[recibo/dizimo] Cargo do tesoureiro (default: Tesoureiro(a)).' },

      // === ATA ===
      ata_numero: { type: 'string', description: '[ata] Numero da ata (ex: 12/2026).' },
      titulo: { type: 'string', description: '[ata] Titulo da reuniao.' },
      horario: { type: 'string', description: '[ata] Horario (ex: 19h30 as 21h45).' },
      local: { type: 'string', description: '[ata] Local da reuniao.' },
      tipo_reuniao: {
        type: 'string',
        enum: ['Reuniao de diretoria', 'Assembleia Geral', 'Reuniao de celula', 'Conselho fiscal', 'Culto administrativo', 'Outra'],
        description: '[ata] Tipo da reuniao.',
      },
      participantes: {
        type: 'array',
        description: '[ata] Array de strings com nomes dos participantes presentes.',
        items: { type: 'string' },
      },
      pauta: {
        type: 'array',
        description: '[ata] Array de strings com os itens da pauta (em ordem).',
        items: { type: 'string' },
      },
      deliberacoes: {
        type: 'array',
        description: '[ata] Array de objetos {titulo, decisao, observacao?} com as deliberacoes da reuniao.',
        items: { type: 'object' },
      },
      secretario_nome: { type: 'string', description: '[ata] Nome do secretario(a).' },
      secretario_cargo: { type: 'string', description: '[ata] Cargo do secretario (default: Secretario(a)).' },
      presidente_nome: { type: 'string', description: '[ata] Nome do presidente da reuniao.' },
      presidente_cargo: { type: 'string', description: '[ata] Cargo do presidente (default: Pastor Presidente).' },

      // === DIZIMO (relatorio mensal) ===
      mes_extenso: { type: 'string', description: '[dizimo] Mes por extenso (ex: Julho).' },
      ano: { type: 'string', description: '[dizimo] Ano (ex: 2026).' },
      total_geral: { type: 'string', description: '[dizimo] Total geral do mes (ex: 12.450,00).' },
      total_dizimos: { type: 'string', description: '[dizimo] Soma dos dizimos (ex: 8.300,00).' },
      total_ofertas: { type: 'string', description: '[dizimo] Soma das ofertas (ex: 2.800,00).' },
      total_outros: { type: 'string', description: '[dizimo] Soma de campanhas/outros (ex: 1.350,00).' },
      total_ofertas_outros: { type: 'string', description: '[dizimo] Soma oferta+outros (ex: 4.150,00).' },
      lancamentos: {
        type: 'array',
        description: '[dizimo] Array de objetos {data, tipo, contribuinte, descricao, dizimo, ofertaOutros}.',
        items: { type: 'object' },
      },
      observacoes: { type: 'string', description: '[dizimo] Observacoes do mes (opcional).' },
      data_geracao: { type: 'string', description: '[dizimo] Data de geracao do relatorio (ex: 01/08/2026).' },
      conselheiro_nome: { type: 'string', description: '[dizimo] Nome do conselheiro/auditor.' },
      conselheiro_cargo: { type: 'string', description: '[dizimo] Cargo do conselheiro (default: Conselheiro(a) Fiscal).' },

      // === Cores (max 5, padrao OpenSquad image-design.md) ===
      primaryColor: { type: 'string', description: 'Cor primaria (default: #1a2540).' },
      accentColor: { type: 'string', description: 'Cor de destaque (default: #d4a017).' },
      backgroundColor: { type: 'string', description: 'Cor de fundo suave (default: #f5efe6).' },
    },
    required: ['mode', 'outputDir'],
  },
  async execute(args) {
    const mode = String(args.mode || '').trim() as Mode;
    const outputDir = String(args.outputDir || '').trim();
    if (!mode || !MODE_FILES[mode]) {
      return {
        content: `Erro: mode obrigatorio e deve ser um de: ${Object.keys(MODE_FILES).join(', ')}`,
        error: true,
      };
    }
    if (!outputDir) {
      return { content: 'Erro: outputDir obrigatorio', error: true };
    }

    // Defaults da igreja
    const churchName = String(args.churchName || 'IGREJA BATISTA KAIROS');
    const churchTagline = String(args.churchTagline || 'Uma igreja que ora');
    const churchAddress = String(args.churchAddress || 'SBN Quadra 02, Bloco H, Edificio Central, Brasilia/DF');
    const churchPhone = String(args.churchPhone || '(61) 3321-0000');
    const churchEmail = String(args.churchEmail || 'contato@igrejakairos.org.br');
    const churchCnpj = String(args.churchCnpj || '00.000.000/0001-00');

    // Cores (5 max, padrao Kairos)
    const colors = {
      primary: String(args.primaryColor || '#1a2540'),
      accent:  String(args.accentColor  || '#d4a017'),
      bg:      String(args.backgroundColor || '#f5efe6'),
    };

    try {
      await mkdir(outputDir, { recursive: true });
    } catch (err) {
      return { content: `Erro criando outputDir: ${(err as Error).message}`, error: true };
    }

    // Carrega template HTML
    let html: string;
    try {
      const tplPath = join(TEMPLATES_DIR, MODE_FILES[mode]);
      html = await readFile(tplPath, 'utf-8');
    } catch (err) {
      return {
        content: `Erro carregando template ${MODE_FILES[mode]}: ${(err as Error).message}`,
        error: true,
      };
    }

    // Renderiza por modo
    if (mode === 'carta') {
      html = renderCarta(html, {
        churchName, churchTagline, churchAddress, churchPhone, churchEmail,
        colors,
        args: args as Record<string, unknown>,
      });
    } else if (mode === 'recibo') {
      html = renderRecibo(html, {
        churchName, churchTagline, churchAddress,
        colors,
        args: args as Record<string, unknown>,
      });
    } else if (mode === 'ata') {
      html = renderAta(html, {
        churchName, churchTagline, churchAddress, churchPhone, churchCnpj,
        colors,
        args: args as Record<string, unknown>,
      });
    } else if (mode === 'dizimo') {
      html = renderDizimo(html, {
        churchName, churchTagline, churchAddress, churchPhone, churchCnpj,
        colors,
        args: args as Record<string, unknown>,
      });
    }

    // Playwright -> PDF
    let chromium: any;
    try {
      const pw = await import('playwright');
      chromium = pw.chromium;
    } catch (e) {
      throw new Error(`playwright nao disponivel: ${(e as Error).message}. Em Docker rode: npx playwright install --with-deps chromium`);
    }

    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    }).catch((e: Error) => {
      throw new Error(`Falha lancando Chromium: ${e.message}`);
    });

    let outPath = '';
    let buf: Buffer;
    try {
      const context = await browser.newContext({ deviceScaleFactor: 2 });
      const tab = await context.newPage();
      await tab.setContent(html, { waitUntil: 'load' });
      await tab.evaluate('document.fonts.ready');

      const filename = String(
        args.filename ||
        slugify(
          mode === 'carta' ? String(args.assunto || args.tipo || 'carta') :
          mode === 'recibo' ? String(args.tipo_recibo || 'recibo') :
          mode === 'ata' ? String(args.titulo || 'ata') :
          `dizimo-${String(args.mes_extenso || 'mes')}-${String(args.ano || '')}`
        )
      );

      const pdfFormat = MODE_PDF_FORMAT[mode];
      outPath = resolve(outputDir, `${filename}.pdf`);

      buf = await tab.pdf({
        format: pdfFormat.format as any,
        landscape: pdfFormat.landscape,
        printBackground: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 }, // CSS ja controla @page margin
      });
      await writeFile(outPath, buf);
      await tab.close();
      await context.close();
    } finally {
      await browser.close();
    }

    return {
      content: `Documento gerado: ${outPath} (${(buf!.length / 1024).toFixed(1)} KB, ${MODE_PDF_FORMAT[mode].format} ${MODE_PDF_FORMAT[mode].landscape ? 'paisagem' : 'retrato'})`,
      data: {
        mode,
        outputDir,
        path: outPath,
        sizeBytes: buf!.length,
        engine: 'playwright-pdf',
      },
    };
  },
};

// =====================================================
// Helpers de rendering
// =====================================================

function replaceKey(html: string, key: string, val: string): string {
  return html.replace(new RegExp('\\{\\{\\s*' + key + '\\s*\\}\\}', 'g'), val);
}

function replaceAllHex(html: string, map: Record<string, string>): string {
  let out = html;
  for (const [from, to] of Object.entries(map)) {
    out = out.replaceAll(from, to);
  }
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60) || 'documento';
}

function applyColors(html: string, colors: { primary: string; accent: string; bg: string }): string {
  return replaceAllHex(html, {
    '#1a2540': colors.primary,
    '#d4a017': colors.accent,
    '#f5efe6': colors.bg,
  });
}

interface RenderContext {
  churchName: string;
  churchTagline: string;
  churchAddress: string;
  churchPhone?: string;
  churchEmail?: string;
  churchCnpj?: string;
  colors: { primary: string; accent: string; bg: string };
  args: Record<string, unknown>;
}

// =====================================================
// CARTA
// =====================================================
function renderCarta(html: string, ctx: RenderContext): string {
  const a = ctx.args;
  let out = applyColors(html, ctx.colors);

  out = replaceKey(out, 'church_name', escapeHtml(ctx.churchName));
  out = replaceKey(out, 'church_tagline', escapeHtml(ctx.churchTagline));
  out = replaceKey(out, 'church_address', escapeHtml(ctx.churchAddress));
  out = replaceKey(out, 'church_phone', escapeHtml(ctx.churchPhone || ''));
  out = replaceKey(out, 'church_email', escapeHtml(ctx.churchEmail || ''));
  out = replaceKey(out, 'tipo', escapeHtml(String(a.tipo || 'CARTA DE APRESENTACAO')));
  out = replaceKey(out, 'data_extenso', escapeHtml(String(a.data_extenso || '')));
  out = replaceKey(out, 'cidade', escapeHtml(String(a.cidade || 'Brasilia')));
  out = replaceKey(out, 'destinatario_nome', escapeHtml(String(a.destinatario_nome || '')));
  out = replaceKey(out, 'destinatario_nome_curto', escapeHtml(String(a.destinatario_nome_curto || String(a.destinatario_nome || '').split(' ')[0] || 'Prezado(a)')));
  out = replaceKey(out, 'destinatario_cargo', escapeHtml(String(a.destinatario_cargo || '')));
  out = replaceKey(out, 'destinatario_igreja', escapeHtml(String(a.destinatario_igreja || '')));
  out = replaceKey(out, 'destinatario_endereco', escapeHtml(String(a.destinatario_endereco || '')));
  out = replaceKey(out, 'assunto', escapeHtml(String(a.assunto || '')));
  out = replaceKey(out, 'corpo_html', String(a.corpo_html || '<p>Sem conteudo.</p>'));
  out = replaceKey(out, 'pastor_nome', escapeHtml(String(a.pastor_nome || 'Pastor Presidente')));
  out = replaceKey(out, 'pastor_cargo', escapeHtml(String(a.pastor_cargo || 'Pastor Presidente')));

  return out;
}

// =====================================================
// RECIBO
// =====================================================
function renderRecibo(html: string, ctx: RenderContext): string {
  const a = ctx.args;
  let out = applyColors(html, ctx.colors);

  out = replaceKey(out, 'church_name', escapeHtml(ctx.churchName));
  out = replaceKey(out, 'church_tagline', escapeHtml(ctx.churchTagline));
  out = replaceKey(out, 'church_address', escapeHtml(ctx.churchAddress));
  out = replaceKey(out, 'recibo_numero', escapeHtml(String(a.recibo_numero || '0001')));
  out = replaceKey(out, 'tipo_recibo', escapeHtml(String(a.tipo_recibo || 'RECIBO DE DIZIMO')));
  out = replaceKey(out, 'valor', escapeHtml(String(a.valor || '0,00')));
  out = replaceKey(out, 'valor_extenso', escapeHtml(String(a.valor_extenso || '')));
  out = replaceKey(out, 'doador_nome', escapeHtml(String(a.doador_nome || '')));
  out = replaceKey(out, 'doador_documento', escapeHtml(String(a.doador_documento || '')));
  out = replaceKey(out, 'doador_endereco', escapeHtml(String(a.doador_endereco || '')));
  out = replaceKey(out, 'doador_telefone', escapeHtml(String(a.doador_telefone || '')));
  out = replaceKey(out, 'referente_descricao', escapeHtml(String(a.referente_descricao || '')));
  out = replaceKey(out, 'forma_pagamento', escapeHtml(String(a.forma_pagamento || 'Dinheiro')));
  out = replaceKey(out, 'forma_pagamento_obs', escapeHtml(String(a.forma_pagamento_obs || '')));
  out = replaceKey(out, 'tesoureiro_nome', escapeHtml(String(a.tesoureiro_nome || 'Tesoureiro(a)')));
  out = replaceKey(out, 'tesoureiro_cargo', escapeHtml(String(a.tesoureiro_cargo || 'Tesoureiro(a)')));
  out = replaceKey(out, 'cidade', escapeHtml(String(a.cidade || 'Brasilia')));
  out = replaceKey(out, 'data_extenso', escapeHtml(String(a.data_extenso || '')));

  return out;
}

// =====================================================
// ATA
// =====================================================
function renderAta(html: string, ctx: RenderContext): string {
  const a = ctx.args;
  let out = applyColors(html, ctx.colors);

  out = replaceKey(out, 'church_name', escapeHtml(ctx.churchName));
  out = replaceKey(out, 'church_tagline', escapeHtml(ctx.churchTagline));
  out = replaceKey(out, 'church_address', escapeHtml(ctx.churchAddress));
  out = replaceKey(out, 'church_phone', escapeHtml(ctx.churchPhone || ''));
  out = replaceKey(out, 'church_cnpj', escapeHtml(ctx.churchCnpj || ''));
  out = replaceKey(out, 'ata_numero', escapeHtml(String(a.ata_numero || '001')));
  out = replaceKey(out, 'titulo', escapeHtml(String(a.titulo || 'Reuniao')));
  out = replaceKey(out, 'data_extenso', escapeHtml(String(a.data_extenso || '')));
  out = replaceKey(out, 'horario', escapeHtml(String(a.horario || '')));
  out = replaceKey(out, 'local', escapeHtml(String(a.local || ctx.churchAddress)));
  out = replaceKey(out, 'tipo_reuniao', escapeHtml(String(a.tipo_reuniao || 'Reuniao de diretoria')));
  out = replaceKey(out, 'secretario_nome', escapeHtml(String(a.secretario_nome || 'Secretario(a)')));
  out = replaceKey(out, 'secretario_cargo', escapeHtml(String(a.secretario_cargo || 'Secretario(a)')));
  out = replaceKey(out, 'presidente_nome', escapeHtml(String(a.presidente_nome || 'Presidente')));
  out = replaceKey(out, 'presidente_cargo', escapeHtml(String(a.presidente_cargo || 'Pastor Presidente')));

  // Participantes (array de strings -> HTML)
  const participantes: string[] = Array.isArray(a.participantes) ? (a.participantes as string[]) : [];
  const participantesHtml = participantes.length > 0
    ? participantes.map((n) => `&bull; ${escapeHtml(String(n))}`).join('<br>')
    : '(nenhum participante registrado)';
  out = replaceKey(out, 'participantes_html', participantesHtml);

  // Pauta (array de strings -> ol>li)
  const pauta: string[] = Array.isArray(a.pauta) ? (a.pauta as string[]) : [];
  const pautaHtml = pauta.length > 0
    ? pauta.map((p) => `<li>${escapeHtml(String(p))}</li>`).join('\n')
    : '<li>Sem itens de pauta registrados.</li>';
  out = replaceKey(out, 'pauta_html', pautaHtml);

  // Deliberacoes (array de objetos {titulo, decisao, observacao?})
  const deliberacoes = Array.isArray(a.deliberacoes)
    ? (a.deliberacoes as Array<{ titulo?: string; decisao?: string; observacao?: string }>)
    : [];
  const deliberacoesHtml = deliberacoes.length > 0
    ? deliberacoes.map((d, i) => `
        <div class="deliberacao">
          <div class="num">Deliberacao ${i + 1}${d.titulo ? ` &mdash; ${escapeHtml(String(d.titulo))}` : ''}</div>
          <div><strong>Decisao:</strong> ${escapeHtml(String(d.decisao || ''))}</div>
          ${d.observacao ? `<div style="margin-top:3pt;"><em>Obs.: ${escapeHtml(String(d.observacao))}</em></div>` : ''}
        </div>
      `).join('\n')
    : '<p>Sem deliberacoes registradas.</p>';
  out = replaceKey(out, 'deliberacoes_html', deliberacoesHtml);

  return out;
}

// =====================================================
// DIZIMO (relatorio mensal)
// =====================================================
function renderDizimo(html: string, ctx: RenderContext): string {
  const a = ctx.args;
  let out = applyColors(html, ctx.colors);

  out = replaceKey(out, 'church_name', escapeHtml(ctx.churchName));
  out = replaceKey(out, 'church_tagline', escapeHtml(ctx.churchTagline));
  out = replaceKey(out, 'church_address', escapeHtml(ctx.churchAddress));
  out = replaceKey(out, 'church_phone', escapeHtml(ctx.churchPhone || ''));
  out = replaceKey(out, 'church_cnpj', escapeHtml(ctx.churchCnpj || ''));
  out = replaceKey(out, 'mes_extenso', escapeHtml(String(a.mes_extenso || '')));
  out = replaceKey(out, 'ano', escapeHtml(String(a.ano || new Date().getFullYear().toString())));
  out = replaceKey(out, 'total_geral', escapeHtml(String(a.total_geral || '0,00')));
  out = replaceKey(out, 'total_dizimos', escapeHtml(String(a.total_dizimos || '0,00')));
  out = replaceKey(out, 'total_ofertas', escapeHtml(String(a.total_ofertas || '0,00')));
  out = replaceKey(out, 'total_outros', escapeHtml(String(a.total_outros || '0,00')));
  out = replaceKey(out, 'total_ofertas_outros', escapeHtml(String(a.total_ofertas_outros || '0,00')));
  out = replaceKey(out, 'data_geracao', escapeHtml(String(a.data_geracao || new Date().toLocaleDateString('pt-BR'))));
  out = replaceKey(out, 'tesoureiro_nome', escapeHtml(String(a.tesoureiro_nome || 'Tesoureiro(a)')));
  out = replaceKey(out, 'tesoureiro_cargo', escapeHtml(String(a.tesoureiro_cargo || 'Tesoureiro(a)')));
  out = replaceKey(out, 'pastor_nome', escapeHtml(String(a.pastor_nome || 'Pastor Presidente')));
  out = replaceKey(out, 'pastor_cargo', escapeHtml(String(a.pastor_cargo || 'Pastor Presidente')));
  out = replaceKey(out, 'conselheiro_nome', escapeHtml(String(a.conselheiro_nome || 'Conselheiro(a) Fiscal')));
  out = replaceKey(out, 'conselheiro_cargo', escapeHtml(String(a.conselheiro_cargo || 'Conselheiro(a) Fiscal')));

  // Linhas (array de objetos {data, tipo, contribuinte, descricao, dizimo, ofertaOutros})
  const lancamentos = Array.isArray(a.lancamentos)
    ? (a.lancamentos as Array<{ data?: string; tipo?: string; contribuinte?: string; descricao?: string; dizimo?: number | string; ofertaOutros?: number | string }>)
    : [];
  const linhasHtml = lancamentos.length > 0
    ? lancamentos.map((l) => `
        <tr>
          <td>${escapeHtml(String(l.data || ''))}</td>
          <td>${escapeHtml(String(l.tipo || 'Dizimo'))}</td>
          <td>${escapeHtml(String(l.contribuinte || ''))}</td>
          <td>${escapeHtml(String(l.descricao || ''))}</td>
          <td class="r">${escapeHtml(formatMoney(l.dizimo))}</td>
          <td class="r">${escapeHtml(formatMoney(l.ofertaOutros))}</td>
        </tr>
      `).join('\n')
    : '<tr><td colspan="6" style="text-align:center; padding:12pt; color:#6b7280;">Sem lancamentos no periodo.</td></tr>';
  out = replaceKey(out, 'linhas_html', linhasHtml);

  // Observacoes (bloco condicional)
  const obs = String(a.observacoes || '').trim();
  const obsHtml = obs
    ? `<div class="obs"><strong>Observacoes:</strong> ${escapeHtml(obs)}</div>`
    : '';
  out = replaceKey(out, 'obs_html', obsHtml);

  return out;
}

function formatMoney(v: number | string | undefined): string {
  if (v === undefined || v === null || v === '') return '0,00';
  if (typeof v === 'number') {
    return v.toFixed(2).replace('.', ',');
  }
  return String(v);
}
