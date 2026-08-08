/**
 * Teste local: gera 4 PDFs (carta, recibo, ata, dizimo) via skill igreja_documento.
 *
 * Uso: node --import tsx test-igreja-documento.mjs
 */

import { igrejaDocumento } from './core/skills/builtin/igreja-documento.js';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const OUT = resolve(process.cwd(), 'test-fixtures', 'igreja');
await mkdir(OUT, { recursive: true });
console.log('Output dir:', OUT);
console.log('');

const baseArgs = {
  churchName: 'IGREJA BATISTA KAIROS',
  churchTagline: 'Uma igreja que ora',
  churchAddress: 'SBN Quadra 02, Bloco H, Edificio Central, Brasilia/DF',
  churchPhone: '(61) 3321-0000',
  churchEmail: 'contato@igrejakairos.org.br',
  churchCnpj: '12.345.678/0001-90',
};

const tests = [
  {
    nome: '1. CARTA de Apresentacao',
    args: {
      ...baseArgs,
      mode: 'carta',
      outputDir: OUT,
      tipo: 'CARTA DE APRESENTACAO',
      data_extenso: 'Brasilia, 08 de agosto de 2026',
      cidade: 'Brasilia',
      destinatario_nome: 'Rev. Joao Pereira da Silva',
      destinatario_nome_curto: 'Pastor Joao',
      destinatario_cargo: 'Pastor Presidente',
      destinatario_igreja: 'Primeira Igreja Batista de Sao Paulo',
      destinatario_endereco: 'Rua Augusta, 1500 - Cerqueira Cesar, Sao Paulo/SP',
      assunto: 'Apresentacao do seminarista Lucas Martins',
      corpo_html:
        '<p>Venho, por meio desta, apresentar a Vossa Reverencia o seminarista <strong>Lucas Martins de Oliveira</strong>, membro desta igreja ha 5 anos, atualmente em processo de formacao teologica no Seminario Teologico Batista de Brasilia.</p>' +
        '<p>O seminarista Lucas tem se destacado pelo seu comprometimento com a obra de Deus, lideranca de celulas, e dedicacao ao estudo da Palavra. Recomendamos que seja recebido com carinho e lhe sejam dadas oportunidades de servico ministerial em sua amada igreja.</p>' +
        '<p>Agradecemos desde ja pela atencao e oramos para que Deus continue abencoando ricamente o ministerio de Vossa Reverencia.</p>',
      pastor_nome: 'Rev. Fernando Borges',
      pastor_cargo: 'Pastor Presidente',
      filename: 'carta-apresentacao-lucas',
    },
  },
  {
    nome: '2. RECIBO de Dizimo',
    args: {
      ...baseArgs,
      mode: 'recibo',
      outputDir: OUT,
      recibo_numero: '2026-0089',
      tipo_recibo: 'RECIBO DE DIZIMO',
      valor: '350,00',
      valor_extenso: 'trezentos e cinquenta reais',
      doador_nome: 'Maria Aparecida da Silva',
      doador_documento: '123.456.789-00',
      doador_endereco: 'SHIS QI 09, Bloco A, Casa 15, Brasilia/DF',
      doador_telefone: '(61) 99887-6655',
      referente_descricao: 'Contribuicao referente ao mes de julho/2026',
      forma_pagamento: 'PIX',
      forma_pagamento_obs: '- Chave: dizimos@igrejakairos.org.br',
      tesoureiro_nome: 'Jose Carlos de Souza',
      tesoureiro_cargo: 'Tesoureiro',
      data_extenso: 'Brasilia, 02 de agosto de 2026',
      cidade: 'Brasilia',
      filename: 'recibo-dizimo-2026-0089',
    },
  },
  {
    nome: '3. ATA de Reuniao de Diretoria',
    args: {
      ...baseArgs,
      mode: 'ata',
      outputDir: OUT,
      ata_numero: '012/2026',
      titulo: 'Reuniao Ordinaria de Diretoria',
      data_extenso: '05 de agosto de 2026',
      horario: '19h30 as 21h45',
      local: 'Sala da Diretoria - Sede da Igreja',
      tipo_reuniao: 'Reuniao de diretoria',
      participantes: [
        'Rev. Fernando Borges (Presidente)',
        'Jose Carlos de Souza (Tesoureiro)',
        'Ana Paula Ferreira (Secretaria)',
        'Lucas Martins (Vogal)',
        'Patricia Almeida (Vogal)',
      ],
      pauta: [
        'Leitura e aprovacao da ata anterior',
        'Relatorio financeiro de julho/2026',
        'Planejamento da Campanha de Oracao de Setembro',
        'Definicao das escalas de voluntarios para o mes',
        'Assuntos gerais',
      ],
      deliberacoes: [
        {
          titulo: 'Aprovacao da ata anterior',
          decisao: 'Aprovada por unanimidade.',
        },
        {
          titulo: 'Relatorio financeiro',
          decisao: 'Aprovado o balanco de julho/2026 com total de R$ 28.450,00 em entradas e R$ 22.100,00 em saidas, saldo positivo de R$ 6.350,00.',
          observacao: 'Disponibilizar o detalhamento no grupo da diretoria ate 10/08.',
        },
        {
          titulo: 'Campanha de Oracao',
          decisao: 'Definida a Campanha de 21 dias no mes de setembro com tema "Avivamento nas Familias". Inicio em 01/09.',
          observacao: 'Lucas responsavel pela midia. Patricia responsavel pelas celulas.',
        },
        {
          titulo: 'Escalas de voluntarios',
          decisao: 'Escalas definidas para recepcao, louvor, midia e criancas durante o mes de agosto.',
        },
      ],
      secretario_nome: 'Ana Paula Ferreira',
      secretario_cargo: 'Secretaria',
      presidente_nome: 'Rev. Fernando Borges',
      presidente_cargo: 'Pastor Presidente',
      filename: 'ata-reuniao-012-2026',
    },
  },
  {
    nome: '4. Relatorio Mensal de Dizimos',
    args: {
      ...baseArgs,
      mode: 'dizimo',
      outputDir: OUT,
      mes_extenso: 'Julho',
      ano: '2026',
      total_geral: '28.450,00',
      total_dizimos: '18.300,00',
      total_ofertas: '6.800,00',
      total_outros: '3.350,00',
      total_ofertas_outros: '10.150,00',
      data_geracao: '01/08/2026',
      tesoureiro_nome: 'Jose Carlos de Souza',
      tesoureiro_cargo: 'Tesoureiro',
      pastor_nome: 'Rev. Fernando Borges',
      pastor_cargo: 'Pastor Presidente',
      conselheiro_nome: 'Dr. Roberto Mendes',
      conselheiro_cargo: 'Conselheiro Fiscal',
      observacoes:
        'Mes de julho apresentou crescimento de 12% em relacao a junho. A Campanha de Oracao de 21 dias contribuiu significativamente com o item "Outros". ' +
        'Foi feito aporte de R$ 5.000,00 para a missao na Amazonia, registrado como despesa autorizada pela diretoria.',
      lancamentos: [
        { data: '01/07', tipo: 'Dizimo',     contribuinte: 'Maria Aparecida da Silva', descricao: 'Mensalidade julho',         dizimo: 350,  ofertaOutros: 0 },
        { data: '01/07', tipo: 'Dizimo',     contribuinte: 'Joao Carlos Mendes',        descricao: 'Mensalidade julho',         dizimo: 500,  ofertaOutros: 0 },
        { data: '02/07', tipo: 'Dizimo',     contribuinte: 'Patricia Almeida',          descricao: 'Mensalidade julho',         dizimo: 200,  ofertaOutros: 0 },
        { data: '05/07', tipo: 'Oferta',     contribuinte: 'Culto de quarta',           descricao: 'Oferta cultos de julho',    dizimo: 0,    ofertaOutros: 1450 },
        { data: '06/07', tipo: 'Dizimo',     contribuinte: 'Lucas Martins',             descricao: 'Mensalidade julho',         dizimo: 250,  ofertaOutros: 0 },
        { data: '07/07', tipo: 'Oferta',     contribuinte: 'Culto de domingo (manha)',  descricao: 'Oferta dos 2 cultos',       dizimo: 0,    ofertaOutros: 3200 },
        { data: '07/07', tipo: 'Oferta',     contribuinte: 'Culto de domingo (noite)',  descricao: 'Oferta dos 2 cultos',       dizimo: 0,    ofertaOutros: 0 },
        { data: '10/07', tipo: 'Dizimo',     contribuinte: 'Ana Paula Ferreira',        descricao: 'Mensalidade julho',         dizimo: 400,  ofertaOutros: 0 },
        { data: '12/07', tipo: 'Doacao',     contribuinte: 'Familia Souza',             descricao: 'Doacao para reforma',       dizimo: 0,    ofertaOutros: 2000 },
        { data: '14/07', tipo: 'Dizimo',     contribuinte: 'Roberto Mendes',            descricao: 'Mensalidade julho',         dizimo: 800,  ofertaOutros: 0 },
        { data: '15/07', tipo: 'Campanha',   contribuinte: 'Culto de oracao',           descricao: 'Campanha Avivamento',       dizimo: 0,    ofertaOutros: 1350 },
        { data: '20/07', tipo: 'Dizimo',     contribuinte: 'Jose Carlos Souza',         descricao: 'Mensalidade julho',         dizimo: 600,  ofertaOutros: 0 },
        { data: '20/07', tipo: 'Oferta',     contribuinte: 'Culto de domingo (manha)',  descricao: 'Oferta dos 2 cultos',       dizimo: 0,    ofertaOutros: 2150 },
        { data: '25/07', tipo: 'Dizimo',     contribuinte: 'Fernanda Oliveira',         descricao: 'Mensalidade julho',         dizimo: 300,  ofertaOutros: 0 },
        { data: '28/07', tipo: 'Dizimo',     contribuinte: 'Carlos Eduardo Lima',       descricao: 'Mensalidade julho + 13o',   dizimo: 950,  ofertaOutros: 0 },
        { data: '30/07', tipo: 'Dizimo',     contribuinte: 'Helena Costa',              descricao: 'Mensalidade julho',         dizimo: 180,  ofertaOutros: 0 },
      ],
      filename: 'relatorio-dizimos-julho-2026',
    },
  },
];

let ok = 0;
let fail = 0;

for (const t of tests) {
  console.log(`\n=== ${t.nome} ===`);
  try {
    const res = await igrejaDocumento.execute(t.args, { cwd: process.cwd() });
    if (res.error) {
      console.log('  ERRO:', res.content);
      fail++;
    } else {
      console.log('  OK:', res.content);
      ok++;
    }
  } catch (e) {
    console.log('  EXCECAO:', e.message);
    fail++;
  }
}

console.log(`\n=== Resultado: ${ok} OK / ${fail} ERRO ===`);
console.log(`PDFs em: ${OUT}`);

if (fail > 0) process.exit(1);
