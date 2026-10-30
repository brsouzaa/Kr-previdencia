// ============================================================================
// MESA DO RETROATIVO   (menu: "Revisão IA Retroativo")
// 22/10/2026 (Bruno) — desenho da mesa antiga + tema do CRM.
//
// POR QUE: medido em 22/10, dos 2.168 leads entregues ao vendedor 2.043 (94%)
// nunca receberam um clique de registro e só 9 tinham observação escrita. A RPC
// retroativo_vendedor_marcar existe e funciona desde 19/10 — faltava tela.
//
// COMO FUNCIONA HOJE (Bruno, 21/10): a máquina simula a listagem, o lead passa
// no GERID, os pré-aprovados o advogado confirma, e aí vai pro vendedor, que
// liga pra um lead FRIO — a cliente NÃO sabe que tem direito e nunca procurou a
// KR. Não existe mais tráfego, KR Chat nem mensagem automática.
//
// O QUE SAIU da versão de 2.306 linhas: board kanban de 11 colunas, painel do
// dia, conferência do funil (PromoBank), fechamento do dia, filtros de
// entrada/atividade/entrega, auto-refresh e leitura de conversa do Chatwoot,
// aprovar/reprovar CNIS (é trabalho da advogada, tem tela própria).
//
// O QUE FICOU (o desenho que o Bruno aprovou em 22/10): KPIs do dia, abas por
// estado do lead, cards em lista com ação na própria linha, alerta de parados
// +48h, e o seletor de vendedor abrindo JÁ num vendedor (não em "todos").
//
// O QUE ENTROU: mensagem de abordagem pronta, com botão que abre o WhatsApp já
// escrito, e observação inline (sem window.prompt).
//
// DESIGN: importa ../lib/tema. Antes só o Layout.js usava — por isso a sidebar
// era bonita e o miolo parecia outro sistema.
// ============================================================================

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { cores, sombras, raio, fonte, ui } from '../lib/tema'

// ===== BOARD =====
// 21/10 — mae_board6 = a mae_board4 por dentro, com DOIS cortes: só
// cnis_aprovado='true' e só os últimos N dias (app_config.retroativo_board_dias).
// Medido: mae_board4 = 19.736 linhas / 21 idas / 14s; mae_board6 = 627ms.
// A mae_board4 segue intacta no banco — reverter = trocar o nome aqui.
const RPC_BOARD = 'mae_board6'
const PAGINA_BOARD = 1000
const MAX_PAGINAS = 25

const COLUNAS_MESA_ATIVA = ['PITCH_LIBERADO', 'CAD_ENDERECO', 'CAD_RG', 'CAD_COMPROVANTE', 'CAD_FINAL']
const COLUNAS_MESA_FECHOU = ['AGUARDANDO_ASSINATURA', 'FINALIZADO']

// 19/10 — a VENDA vem da tabela clientes, não da coluna do board. Medido: das
// 370 vendas fechadas, só 176 tinham o lead em FINALIZADO; as outras 194 foram
// digitadas no Novo Cliente, que cria o cliente e não mexe no estado do lead.
const CLIENTE_FECHADO = ['validado', 'entregue', 'assinado']
const CLIENTE_PERDIDO = ['cancelado', 'expirado', 'barrado_pos_venda']
const MOTIVO_PERDA = {
  expirado: ['⏳', 'Não assinou a tempo', 'O link de assinatura venceu antes de ela assinar.'],
  cancelado: ['🚫', 'Cancelada', 'O contrato foi cancelado depois de emitido.'],
  barrado_pos_venda: ['🛑', 'Barrada no pós-venda', 'A conferência do pós-venda não aprovou.'],
}

// ===== PERMISSÃO (copiado sem alteração de regra) =====
const OPERACAO_USUARIOS = {
  '72fa4914-e8de-4c0c-a954-b05241e9d1bd': 'ronaldo', // Thamires (supervisora)
  '8bff997b-e43f-4b65-bafc-b4e7e704b14b': 'ronaldo', // Brenda
  '3a9c1779-2008-4aaa-9cfb-e64336b9207a': 'ronaldo', // Tamy
  'ed181784-484b-4ad9-9e8c-4f35b1279940': 'ronaldo', // Kisse
  '7085f131-b2db-4b96-a4db-2a1e2a5bf6f6': 'ronaldo', // Kayllaine
  'cf6444f5-7e03-4cc7-9442-9b0cb963695a': 'leandro', // Isabelle (supervisora)
  '5d8cf47f-47e8-4d15-a4b8-48308d4b0840': 'leandro', // Rafaelle
  '977a4664-eb04-4a51-84ab-b61449720dc2': 'leandro', // Sara
}
const SUPERVISORAS_OPERACAO = [
  '72fa4914-e8de-4c0c-a954-b05241e9d1bd', // Thamires (Ronaldo)
  'cf6444f5-7e03-4cc7-9442-9b0cb963695a', // Isabelle (Leandro)
]
// Supervisora NÃO recebe lead: olha o time. Entra na própria lista porque pode
// ter lead antigo na mão.
const SUPERVISORAS_TIME = {
  '0a5958b9-d43b-4bac-a01d-af60247dd721': [ // Agatha Barreto — time 12 meses
    '9fbda3fe-22aa-4179-b1a7-005e99660c8d', // Duda
    'bb85a0f3-2d79-499e-8b19-6219bd0cef56', // Gislaine
    '4a1db9e1-0b10-48bc-85d6-23b728b9fd4f', // Luciane
    'a1d7dbfb-bc0d-46a3-b523-bfdc15aac0c9', // Leticia
    'be98f268-314f-4114-acc3-7bb9ce7635fd', // Maryana Kodos
    '4bf01e58-2d1e-417a-878b-786094f1ad01', // Fernanda (femalves)
    '84461a51-1aff-4c54-839b-e10a12f5ae5b', // Leandro Souza — 27/10
    '0a5958b9-d43b-4bac-a01d-af60247dd721', // a própria Agatha
  ],
}

// ===== ABAS (mesma lógica da mesa antiga) =====
const ABAS = [
  ['hoje', '🔥 Caiu hoje'],
  ['represado', '📦 Atrasados'],
  ['contato', '📞 Em contato'],
  ['retomar', '🔁 Não respondeu'],
  ['tel', '📵 Telefone errado'],
  ['sem_direito', '🚫 Sem direito'],
  ['fechou', '✅ Venda fechada'],
  ['recuperar', '♻️ Recuperar'],
]
const PERIODOS = [
  ['tudo', 'Todo o período'], ['hoje', 'Hoje'], ['ontem', 'Ontem'],
  ['7d', 'Últimos 7 dias'], ['30d', 'Últimos 30 dias'],
]

// ===== HELPERS DE DATA =====
// Dia no fuso de São Paulo (en-CA dá yyyy-mm-dd). Comparar com toISOString()
// erraria a virada: em UTC o dia vira às 21h daqui, e o "caiu hoje" sairia com
// os leads da noite anterior dentro.
function diaBR(iso) {
  if (!iso) return null
  try { return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) } catch (_) { return null }
}
// 23/10 (Bruno) — A MESA É SEMPRE DO MAIS RECENTE PARA O MAIS ANTIGO, em todas
// as abas e na busca. Antes era o contrário (o mais parado em cima). A data que
// conta é a do fato da aba: nas abas de venda fechada e recuperar, a data do
// cadastro da cliente (cliente_em); nas outras, quando o lead caiu na mesa
// (entregue_vendedora_em). Sem data vai pro fim.
// 23/10 (Bruno) — A MESMA DATA VALE PARA O FILTRO DE PERÍODO. Bug que ele pegou:
// a venda de hoje (492.913.378-54, lead de 16/10) mostrava "venda de hoje" mas
// sumia no filtro "Hoje", porque o filtro olhava só a chegada do lead na mesa.
// Ordem, filtro e selo agora usam esta função — uma data só por aba.
function dataDoFato(l) {
  return (l._aba === 'fechou' || l._aba === 'recuperar')
    ? (l.cliente_em || l.entregue_vendedora_em) : l.entregue_vendedora_em
}
function dataDaOrdem(l) {
  const iso = dataDoFato(l)
  const t = iso ? new Date(iso).getTime() : NaN
  return Number.isFinite(t) ? t : -Infinity
}
function maisRecenteEmCima(a, b) {
  const da = dataDaOrdem(a), db = dataDaOrdem(b)
  if (da === db) return 0
  return db > da ? 1 : -1
}
function hojeBR() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) }
function horasDe(iso) {
  if (!iso) return null
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000)
  return h >= 0 ? h : 0
}
function fmtHoras(h) {
  if (h === null || h === undefined) return '—'
  if (h < 1) return 'agora'
  if (h < 24) return h + 'h'
  const d = Math.floor(h / 24)
  return d + (d === 1 ? ' dia' : ' dias')
}
function dentroDoPeriodo(iso, periodo) {
  if (periodo === 'tudo') return true
  const d = diaBR(iso)
  if (!d) return false
  const hoje = hojeBR()
  if (periodo === 'hoje') return d === hoje
  const dias = Math.round((new Date(hoje + 'T12:00:00') - new Date(d + 'T12:00:00')) / 86400000)
  if (periodo === 'ontem') return dias === 1
  if (periodo === '7d') return dias >= 0 && dias <= 6
  if (periodo === '30d') return dias >= 0 && dias <= 29
  return true
}

// ===== FORMATAÇÃO =====
function soDigitos(v) { return String(v || '').replace(/\D/g, '') }
function primeiroNome(n) {
  const p = String(n || '').trim().split(/\s+/)[0] || ''
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : ''
}
function nomeBonito(n) {
  const min = ['da', 'de', 'do', 'das', 'dos', 'e']
  return String(n || '').trim().toLowerCase().split(/\s+/)
    .map((p, i) => (i > 0 && min.includes(p)) ? p : p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
}
function fmtTel(t) {
  const d = soDigitos(t).replace(/^55/, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return t || '—'
}
function fmtCPF(c) {
  const d = soDigitos(c)
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : (c || '—')
}
// 23/10 — BUG CORRIGIDO: o filho_dn do GERID vem como '2024-05-03' (922 de 929
// leads na mesa em 23/10). new Date('2024-05-03') é meia-noite em UTC, que no
// Brasil é 21h do dia ANTERIOR — o card dizia "nasceu em 02/05/2024" para quem
// nasceu em 03/05. Data pura (sem hora) agora é só remontada no texto, sem
// passar por fuso. Data com hora usa o fuso de São Paulo.
function fmtData(v) {
  if (!v) return ''
  const s = String(v).trim()
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

// ===== O VÍNCULO QUE DEU O DIREITO =====
// Estrutura conferida no banco em 22/10 (public.gerid_vinculo_decisivo):
// { fim, tipo, regra, inicio, empresa, filho_dn, filho_nome, eh_beneficio,
//   dn_aproximada, total_vinculos, filhos_no_gerid, meses_antes_do_parto }
//
// ATENÇÃO (comentário do próprio mae_board6, 19/10): o filho_nome NÃO vem do
// GERID — o board injeta de public.detetive_fila, e LIMPA a marcação que a
// detetive cola no fim do nome ("... Óbito", "... Indicativo criminal": 543 e
// 572 nomes na base). Quando o nome não casa com segurança, vem vazio de
// propósito — dizer o nome errado na ligação é pior do que não dizer nome.
// Por isso o vinculo_direito pode vir SÓ com filho_nome, sem empresa: o bloco
// "empresa que deu o direito" tem que checar empresa, não o objeto inteiro.
function lerVinculo(v) {
  if (!v) return null
  const d = Array.isArray(v) ? v[0] : v
  if (!d || typeof d !== 'object') return null
  const tipo = String(d.tipo || '')
  return {
    empresa: String(d.empresa || '').trim() || null,
    ehBeneficio: d.eh_beneficio === true,   // o GERID já classifica; não adivinhar por regex
    tipo: /domest/i.test(tipo) ? 'Empregada doméstica'
      : /empregad/i.test(tipo) ? 'Empregada'
      : /facultativ/i.test(tipo) ? 'Facultativa'
      : /individual|mei|aut/i.test(tipo) ? 'Contribuinte individual'
      : (tipo || null),
    inicio: d.inicio || null,
    fim: d.fim || null,
    meses: d.meses_antes_do_parto,
    filhoDn: d.filho_dn || null,
    // data de parto APROXIMADA: o vendedor NÃO pode afirmar o dia na ligação.
    dnAproximada: d.dn_aproximada === true,
    filhoNome: String(d.filho_nome || '').trim() || null,
    // 23/10 — '12' ou '24'. Só vem da RPC gerid_direitos_dos_leads; o
    // vinculo_direito do board não traz, e aí fica null (a tela não mostra).
    faixa: d.faixa === '12' || d.faixa === '24' ? d.faixa : null,
  }
}

// "Empregada · 23/09/2025 a 18/10/2025 · 8 meses antes do parto"
function descVinculo(v) {
  return [v.tipo,
    v.inicio && v.fim ? `${v.inicio} a ${v.fim}` : v.fim ? `até ${v.fim}` : null,
    v.meses === 0 ? 'saiu no mês do parto'
      : v.meses != null ? `${v.meses} ${v.meses === 1 ? 'mês' : 'meses'} antes do parto` : null]
    .filter(Boolean).join(' · ')
}

// 23/10 (Bruno) — FICHA DO CNIS. Mesma rota /ficha/<cpf> do App.js e mesma RPC
// ficha_cnis que a Fila de Entregas e a tela antiga já usavam; nada novo no
// banco. Tinha saído no redesenho de 22/10 junto com o modal antigo — erro meu.
// Só com CPF de 11 dígitos: sem isso a ficha abre em tela de erro, e botão que
// abre erro treina o vendedor a não clicar.
function linkFichaCnis(cpf) {
  const d = soDigitos(cpf)
  return d.length === 11 ? `/ficha/${d}` : null
}

// ===== MENSAGEM DE ABORDAGEM =====
// 22/10 (Bruno) — atendimento é 100% WhatsApp; o vendedor precisa de texto
// pronto, não de mais um campo pra ler. Cobertura medida em 22/10 na mesa:
// nome do bebê 819/852 (96%), nome da mãe 26, data do parto 7.
function montarAbordagem(lead, vinc) {
  const filho = vinc?.filhoNome
  if (filho) return `Olá, tudo bem?\n\nGostaria de falar com a responsável do ${nomeBonito(filho)}?`
  const mae = nomeBonito(lead?.nome || '')
  if (mae) return `Olá, tudo bem?\n\nGostaria de falar com a ${mae}?`
  // Só cita a data quando o GERID achou o dia EXATO.
  const dn = vinc?.dnAproximada ? null : fmtData(vinc?.filhoDn || lead?.data_nascimento_filho)
  if (dn) return `Olá, tudo bem?\n\nGostaria de falar com a mãe do bebê que nasceu em ${dn}?`
  return 'Olá, tudo bem?\n\nGostaria de falar com a responsável pela família?'
}
function linkWhats(tel, texto) {
  const d = soDigitos(tel)
  if (!d) return null
  return `https://wa.me/${d.startsWith('55') ? d : '55' + d}?text=${encodeURIComponent(texto)}`
}

// Códigos TÊM que bater com retroativo_vendedor_marcar — a RPC rejeita o resto.
const ACOES_SECUNDARIAS = [
  { id: 'sem_resposta', rotulo: 'Não respondeu', cor: cores.alerta },
  { id: 'tel_errado', rotulo: 'Telefone errado', cor: cores.perigo },
  { id: 'sem_direito', rotulo: 'Não tem direito', cor: cores.suave, exigeObs: true },
]

// 23/10 (Bruno) — PASSAR O LEAD PARA OUTRA VENDEDORA. Existia na mesa antiga
// (01/10) e ficou de fora no redesenho de 22/10. A gravação é a mesma RPC de
// sempre, retroativo_transferir_lead (troca os DOIS campos de dono, limpa o
// "estou nesse", grava log e notifica quem recebe). Os códigos TÊM que ser os
// mesmos da função do banco — fora da lista ela recusa.
// Quem pode: admin (todas as faixas) e supervisora do retroativo (só a faixa
// dela). A lista de destino vem de retroativo_vendedoras_transferencia, que usa
// a MESMA regra — se ela volta vazia, o botão nem aparece.
const MOTIVOS_TRANSF = [
  ['venda_fora', '💰 Venda por fora — ela já fechou'],
  ['cliente_pediu', '🗣️ Cliente pediu outra atendente'],
  ['folga', '🏖️ Vendedora de folga / afastada'],
  ['carga', '⚖️ Reequilibrar a carga do time'],
  ['sem_contato', '📵 Não conseguiu contato com a cliente'],
  ['ja_atendeu', '🤝 Já atendeu essa cliente antes'],
  ['outro', '✏️ Outro — escrever'],
]

// ===== ESTILOS (100% derivados de ../lib/tema) =====
const s = {
  h1: { fontSize: 24, fontWeight: 800, color: cores.texto, letterSpacing: '-0.02em', margin: 0 },
  sub: { fontSize: 13, color: cores.suave, marginTop: 4, lineHeight: 1.5 },

  buscaWrap: { display: 'flex', gap: 8, margin: '16px 0' },
  buscaInput: { flex: 1, maxWidth: 380, padding: '10px 13px', fontSize: 13, borderRadius: raio.botao, fontFamily: 'inherit' },
  btn: { padding: '10px 18px', borderRadius: raio.botao, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', background: cores.azul, color: '#fff' },
  btnGhost: { padding: '8px 14px', borderRadius: raio.botao, border: `1px solid ${cores.cardBorda}`, background: cores.card, color: cores.texto, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },

  painel: { ...ui.card, padding: 18, marginBottom: 14 },
  painelTopo: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 },
  avatar: { width: 42, height: 42, borderRadius: raio.pill, display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 800, color: '#fff', background: `linear-gradient(135deg, ${cores.azul}, ${cores.roxo})` },
  quem: { fontSize: 16, fontWeight: 800, color: cores.texto },
  quando: { fontSize: 12, color: cores.suave, marginTop: 1 },

  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: 10 },
  kpi: (cor, destaque) => ({
    padding: '12px 14px', borderRadius: raio.cartao,
    background: destaque ? `${cor}0f` : cores.chipBg,
    border: `1px solid ${destaque ? cor + '40' : cores.cardBorda}`,
  }),
  kpiLab: { fontSize: 9.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: cores.suave },
  kpiNum: (cor) => ({ fontSize: 26, fontWeight: 800, color: cor, lineHeight: 1.1, marginTop: 3 }),
  kpiSub: { fontSize: 10.5, color: cores.suave, marginTop: 2, lineHeight: 1.3 },

  barraWrap: { marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 },
  barra: { flex: 1, height: 6, borderRadius: raio.pill, background: cores.chipBg, overflow: 'hidden' },
  barraFill: { height: '100%', borderRadius: raio.pill, background: `linear-gradient(90deg, ${cores.ok}, ${cores.okVivo})`, transition: 'width .4s ease' },

  alerta: { padding: '12px 16px', borderRadius: raio.cartao, background: `${cores.perigo}0f`, border: `1px solid ${cores.perigo}33`, marginBottom: 14, fontSize: 12.5, color: cores.texto, lineHeight: 1.55 },

  abas: { display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' },
  aba: (ativo) => ({
    padding: '7px 13px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', borderRadius: raio.pill,
    border: `1px solid ${ativo ? cores.texto : cores.cardBorda}`,
    background: ativo ? cores.texto : cores.card, color: ativo ? '#fff' : cores.suave, fontFamily: 'inherit',
  }),
  select: { padding: '7px 11px', fontSize: 12.5, borderRadius: raio.botao, fontFamily: 'inherit' },

  card: { ...ui.card, padding: 18, marginBottom: 10 },
  cardTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' },
  nome: { fontSize: 17, fontWeight: 800, color: cores.texto, letterSpacing: '-0.01em' },
  meta: { fontSize: 12.5, color: cores.suave, marginTop: 3, fontFamily: fonte.mono },

  bloco: { marginTop: 12, borderRadius: raio.cartao, padding: 13, background: cores.chipBg, border: `1px solid ${cores.cardBorda}` },
  blocoTit: { fontSize: 9.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: cores.suave, marginBottom: 7, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  dir1: { fontSize: 14, fontWeight: 700, color: cores.texto },
  dir2: { fontSize: 12.5, color: cores.suave, marginTop: 2, lineHeight: 1.5 },
  bebe: { fontSize: 13, color: cores.texto, marginTop: 9, fontWeight: 600 },

  msgBox: { marginTop: 12, borderRadius: raio.cartao, border: `1.5px solid ${cores.azul}33`, background: `${cores.azul}0a`, padding: 13 },
  msgTexto: { fontSize: 13.5, color: cores.texto, lineHeight: 1.6, whiteSpace: 'pre-wrap' },
  btnCopiar: { fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: raio.botao, border: `1px solid ${cores.azul}44`, background: cores.card, color: cores.azul, cursor: 'pointer', fontFamily: 'inherit' },

  acoes: { display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'stretch' },
  btnPegar: { flex: '1 1 260px', padding: '13px 16px', borderRadius: raio.botao, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: 'inherit', background: 'linear-gradient(135deg,#22c55e,#16a34a)', boxShadow: '0 4px 14px rgba(22,163,74,.3)', textAlign: 'center', textDecoration: 'none', display: 'block' },
  btnAcao: (cor) => ({ padding: '11px 13px', borderRadius: raio.botao, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', border: `1.5px solid ${cor}44`, background: `${cor}0d`, color: cor }),

  obsArea: { width: '100%', marginTop: 10, padding: 11, fontSize: 13, borderRadius: raio.botao, border: `1px solid ${cores.cardBorda}`, minHeight: 58, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' },

  vazio: { ...ui.card, padding: 40, textAlign: 'center' },
  toast: { position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', padding: '12px 22px', borderRadius: raio.botao, background: cores.texto, color: '#fff', fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: sombras.cardHover },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'grid', placeItems: 'center', zIndex: 900, padding: 16 },
  modal: { ...ui.card, padding: 22, maxWidth: 560, width: '100%', maxHeight: '86vh', overflowY: 'auto' },
  linha: { display: 'flex', fontSize: 13, padding: '6px 0', borderBottom: `1px solid ${cores.cardBorda}` },
  linhaLab: { width: 150, color: cores.suave, flexShrink: 0 },
}

// ============================================================================
export default function RevisaoIARetroativo({ setPage }) {
  const { profile } = useAuth()
  const ehAdmin = profile?.role === 'admin' || profile?.role === 'supervisor_producao'

  const minhaOp = OPERACAO_USUARIOS[profile?.id] || null
  const souSupOperacao = SUPERVISORAS_OPERACAO.includes(profile?.id)
  const meuTime = SUPERVISORAS_TIME[profile?.id] || null
  const vejoMaisDeUm = ehAdmin || souSupOperacao || !!meuTime

  const [board, setBoard] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [aba, setAba] = useState('hoje')
  // 28/10 (Bruno): a tela abre em "Hoje". "Todo o período" continua no seletor.
  const [periodo, setPeriodo] = useState('hoje')
  // 22/10 — vendedor escolhido. Começa no que ficou guardado da última visita;
  // '' (string vazia) é uma escolha válida e quer dizer "toda a operação".
  const [vendedorSel, setVendedorSel] = useState(() => {
    try { const v = window.localStorage.getItem('kr_mesa_vendedor'); return v === null ? null : v } catch (_) { return null }
  })
  // 22/10 — A LISTA DO SELETOR TEM VIDA PRÓPRIA — NÃO DERIVAR DO BOARD.
  // Bug encontrado pelo Bruno em 22/10: eu montava a lista a partir do board já
  // filtrado, então ao escolher um vendedor o board só trazia os leads dele, a
  // lista encolhia para um nome só e o seletor ficava preso nesse vendedor.
  // Agora ela é preenchida só na carga SEM filtro e não é mais sobrescrita.
  const [listaVendedores, setListaVendedores] = useState([])
  const [busca, setBusca] = useState('')
  const [buscaAtiva, setBuscaAtiva] = useState('')
  // 28/10 (Bruno): a mesa mostra só os últimos 30 dias (app_config
  // retroativo_board_dias), mas a BUSCA acha o lead dela em qualquer data.
  // Vem da mae_board6_busca (mesmas colunas da mae_board6, sem o corte de dias).
  const [extrasBusca, setExtrasBusca] = useState([])
  const [obsAberta, setObsAberta] = useState(null)       // `${leadId}:${acao}`
  const [obs, setObs] = useState('')
  const [marcando, setMarcando] = useState(null)
  const [ficha, setFicha] = useState(null)
  const [toast, setToast] = useState(null)
  // 23/10 (Bruno) — TODOS OS FILHOS COM DIREITO, não só o mais novo.
  // O vinculo_direito do board vem de gerid_vinculo_decisivo, que faz
  // "order by filho_dn desc limit 1" de propósito — um argumento de ligação. Com
  // dois filhos aprovados (35 leads na mesa em 23/10) o segundo sumia. Caso:
  // Fernanda de Almeida Ribeiro — filho 2026 por 12 meses E filho 2022 por 24,
  // a tela mostrava só o de 2026. Agora, depois do board, UMA chamada à RPC
  // gerid_direitos_dos_leads traz os leads com 2+ filhos; os outros ficam como
  // estão. Mapa lead_id -> [direitos]. Vazio = tela igual à de antes.
  const [direitosExtra, setDireitosExtra] = useState({})
  // 29/10/2026 (Bruno) — telefone certo pela Assertiva (edge function assertiva-telefone)
  const [telNovo, setTelNovo] = useState({})              // lead_id -> telefone escolhido
  const [busTel, setBusTel] = useState(null)              // { l, msg, st, telefones, erro, de_cache }
  const [usandoTel, setUsandoTel] = useState('')
  const [telManual, setTelManual] = useState('')          // "Achei por outro meio": numero digitado
  // 23/10 — passar para outra vendedora (ver MOTIVOS_TRANSF no topo)
  const [vendsTransf, setVendsTransf] = useState([])     // [{profile_id, nome, faixa}]
  const [transf, setTransf] = useState(null)             // lead sendo passado
  const [transfPara, setTransfPara] = useState('')
  const [transfCod, setTransfCod] = useState('')
  const [transfTxt, setTransfTxt] = useState('')
  const [transfHoje, setTransfHoje] = useState(false)
  const [transferindo, setTransferindo] = useState(false)
  const podeTransferir = vendsTransf.length > 0
  const reqAtual = useRef(0)

  function avisar(t) { setToast(t); setTimeout(() => setToast(null), 2600) }

  // ===== CARREGAR =====
  const carregar = useCallback(async () => {
    if (!profile?.id) return
    const meuReq = ++reqAtual.current
    setCarregando(true)

    // 22/10 — QUEM VÊ MAIS DE UM BAIXA A MESA INTEIRA E FILTRA NA TELA.
    // Medido em 22/10: a mae_board6 inteira são 903 linhas / 922 kB / ~600ms —
    // com a mae_board4 (19.736 linhas) isso era impensável, com a 6 é barato.
    // Por que não filtrar no servidor: filtrando lá, a resposta só traz UM
    // vendedor, e era de lá que eu montava a lista do seletor — resultado, o
    // seletor sumia assim que a tela lembrava a escolha anterior (bug que o
    // Bruno pegou em 22/10). Baixando tudo, a lista está sempre completa e
    // trocar de vendedor não vai mais ao servidor.
    const p_agente = vejoMaisDeUm ? null : profile.id

    let todos = []
    for (let p = 0; p < MAX_PAGINAS; p++) {
      const de = p * PAGINA_BOARD
      const { data, error } = await supabase.rpc(RPC_BOARD, {
        p_agente,
        p_entrada_de: null, p_entrada_ate: null,
        p_ativ_de: null, p_ativ_ate: null,
        p_entrega_de: null, p_entrega_ate: null,
      }).range(de, de + PAGINA_BOARD - 1)
      if (error || !data || data.length === 0) break
      todos = todos.concat(data)
      if (data.length < PAGINA_BOARD) break
    }
    // Descarta resposta atrasada (senão a lenta sobrescreve a rápida).
    if (meuReq !== reqAtual.current) return

    const visiveis = (todos || []).filter(l =>
      (!minhaOp || (l.operacao || 'kr') === minhaOp) &&
      (!meuTime || meuTime.includes(l.bf_agente_id)))
    setBoard(visiveis)

    // A lista do seletor sai da mesa inteira, que é o que sempre chega aqui.
    const m = new Map()
    visiveis.forEach(l => { if (l.bf_agente_id && l.agente_nome) m.set(l.bf_agente_id, l.agente_nome) })
    setListaVendedores([...m.entries()].sort((a, b) => a[1].localeCompare(b[1])))
    setCarregando(false)

    // 23/10 — filhos extras, em segundo plano. Se falhar, a tela segue como
    // antes (um filho por card) — nunca trava a mesa por causa disto.
    try {
      const ids = visiveis.map(l => l.id).filter(Boolean)
      if (ids.length) {
        const { data: dx } = await supabase.rpc('gerid_direitos_dos_leads', { p_lead_ids: ids })
        if (meuReq !== reqAtual.current) return
        const mapa = {}
        for (const r of (dx || [])) if (Array.isArray(r.direitos) && r.direitos.length >= 2) mapa[r.lead_id] = r.direitos
        setDireitosExtra(mapa)
      } else setDireitosExtra({})
    } catch (_) { /* fica sem os extras; o card mostra o filho decisivo como sempre */ }
    // 29/10 — telefone que a vendedora escolheu na Assertiva (o original do lead nao e apagado)
    try {
      const ids = visiveis.map(l => l.id).filter(Boolean)
      if (ids.length) {
        const { data: tx } = await supabase.rpc('retroativo_tel_assertiva_dos_leads', { p_lead_ids: ids })
        if (meuReq !== reqAtual.current) return
        const mapa = {}
        for (const r of (tx || [])) if (r.tel) mapa[r.lead_id] = r.tel
        setTelNovo(mapa)
      }
    } catch (_) { /* segue com o telefone original */ }
    // vendedorSel NÃO entra aqui: trocar de vendedor é filtro de tela, não
    // recarregamento. Se entrar, cada troca vira uma ida ao servidor de novo.
  }, [profile?.id, vejoMaisDeUm, minhaOp, meuTime])

  useEffect(() => { carregar() }, [carregar])

  // 28/10 — busca fora da janela de dias. Roda de novo quando o board recarrega,
  // pra o lead achado refletir o que a vendedora acabou de marcar nele.
  useEffect(() => {
    const q = buscaAtiva.trim()
    const dig = soDigitos(q)
    if (!profile?.id || (dig ? dig.length < 4 : q.length < 3)) { setExtrasBusca([]); return }
    let vivo = true
    supabase.rpc('mae_board6_busca', {
      p_agente: vejoMaisDeUm ? null : profile.id,
      p_entrada_de: null, p_entrada_ate: null,
      p_ativ_de: null, p_ativ_ate: null,
      p_entrega_de: null, p_entrega_ate: null,
      p_termo: q,
    }).then(({ data, error }) => {
      if (!vivo) return
      if (error || !Array.isArray(data)) { setExtrasBusca([]); return }
      setExtrasBusca(data.filter(l =>
        (!minhaOp || (l.operacao || 'kr') === minhaOp) &&
        (!meuTime || meuTime.includes(l.bf_agente_id))))
    })
    return () => { vivo = false }
  }, [buscaAtiva, board, profile?.id, vejoMaisDeUm, minhaOp, meuTime])
  useEffect(() => {
    const t = setInterval(carregar, 60000)   // sem Chatwoot, sem polling de conversa
    return () => clearInterval(t)
  }, [carregar])

  // ===== QUEM É A MESA =====
  // 19/10 — o CADASTRO decide primeiro, antes da coluna do board: se existe
  // cliente com esse CPF, vale o que aconteceu com o contrato dela.
  function abaDoLead(l) {
    if (CLIENTE_FECHADO.includes(l.cliente_status)) return 'fechou'
    if (CLIENTE_PERDIDO.includes(l.cliente_status)) return 'recuperar'
    if (COLUNAS_MESA_FECHOU.includes(l.coluna)) return 'fechou'
    if (!COLUNAS_MESA_ATIVA.includes(l.coluna)) return null
    if (l.vend_status === 'sem_direito') return 'sem_direito'
    if (l.vend_status === 'tel_errado') return 'tel'
    if (l.vend_status === 'sem_resposta') return 'retomar'
    if (l.vend_status === 'contato') return 'contato'
    return diaBR(l.entregue_vendedora_em) === hojeBR() ? 'hoje' : 'represado'
  }

  // O recorte por vendedor é aqui, na tela — ver a nota no carregar(). '' ou
  // null = toda a operação. Tudo abaixo (abas, KPIs, alerta de 48h) já sai
  // recortado, então o topo fala sempre da mesa que está sendo exibida.
  const mesa = useMemo(() => board
    .filter(l => !vendedorSel || l.bf_agente_id === vendedorSel)
    .map(l => ({ ...l, _aba: abaDoLead(l), _h: horasDe(l.entregue_vendedora_em) }))
    .filter(l => l._aba), [board, vendedorSel])

  // 22/10 (Bruno) — O FILTRO DE PERÍODO MANDA EM TUDO: cards do topo, abas,
  // alerta de 48h e lista. A versão antiga fazia o contrário de propósito (o
  // topo ignorava o filtro) e isso dava dois números diferentes na mesma tela
  // sem ninguém saber qual valia. Agora a tela inteira fala do mesmo recorte.
  // CONSEQUÊNCIA ESPERADA, NÃO É BUG: com período "Hoje", "Parados +48h" dá
  // zero — lead que chegou hoje não tem 48h. Por isso o período escolhido fica
  // escrito no topo, do lado da data.
  const mesaFiltrada = useMemo(() => periodo === 'tudo'
    ? mesa : mesa.filter(l => dentroDoPeriodo(dataDoFato(l), periodo)), [mesa, periodo])

  const conta = (a) => mesaFiltrada.filter(l => l._aba === a).length

  const lista = useMemo(() => {
    const q = buscaAtiva.trim()
    if (q) {
      // A BUSCA É A ÚNICA COISA QUE IGNORA O PERÍODO, de propósito: quem cola um
      // CPF quer achar AQUELA cliente, e não saber em que recorte ela caiu. Se a
      // busca respeitasse o filtro, procurar alguém de 10 dias atrás com o
      // período em "Hoje" devolveria "não encontrada" — e a pessoa concluiria
      // que a cliente não existe. A tela avisa que está fora do filtro.
      const d = soDigitos(q)
      const achados = mesa.filter(l =>
        (d && (soDigitos(l.cpf).includes(d) || soDigitos(l.tel).includes(d))) ||
        (!d && String(l.nome || '').toLowerCase().includes(q.toLowerCase())))
      // 28/10 — soma o que a busca achou fora da janela de dias da mesa
      const ja = new Set(achados.map(l => l.id))
      const fora = extrasBusca
        .filter(l => !ja.has(l.id) && (!vendedorSel || l.bf_agente_id === vendedorSel))
        .map(l => ({ ...l, _aba: abaDoLead(l), _h: horasDe(l.entregue_vendedora_em) }))
        .filter(l => l._aba)
      return achados.concat(fora).sort(maisRecenteEmCima)
    }
    return mesaFiltrada.filter(l => l._aba === aba).sort(maisRecenteEmCima)
  }, [mesa, mesaFiltrada, aba, buscaAtiva, extrasBusca, vendedorSel])

  // ===== NÚMEROS DO TOPO — todos sobre mesaFiltrada (ver nota acima) =====
  const caiuHoje = mesaFiltrada.filter(l => l._aba !== 'fechou' && l._aba !== 'recuperar'
    && diaBR(l.entregue_vendedora_em) === hojeBR()).length
  const falouHoje = mesaFiltrada.filter(l => diaBR(l.vend_contato_em) === hojeBR()).length
  const semContatoHoje = mesaFiltrada.filter(l => diaBR(l.entregue_vendedora_em) === hojeBR()
    && !l.vend_contato_em && l._aba !== 'fechou' && l._aba !== 'recuperar').length
  // "Atrasado" = na fila sem ninguém encostar há 48h+. É o número que se cobra.
  const parados48 = mesaFiltrada.filter(l => (l._aba === 'hoje' || l._aba === 'represado') && (l._h ?? 0) >= 48).length
  const naMesa = conta('hoje') + conta('represado') + conta('contato') + conta('retomar')
  const pctDia = caiuHoje > 0 ? Math.round(100 * Math.min(falouHoje, caiuHoje) / caiuHoje) : 0
  const periodoRotulo = (PERIODOS.find(p => p[0] === periodo) || [])[1] || ''
  const filtroLigado = periodo !== 'tudo'

  // 22/10 (Bruno) — admin/supervisão ABRE JÁ NUM VENDEDOR, não em "todos": com
  // 778 numa fila só os números do topo não dizem o que fazer. Só vale na
  // PRIMEIRA visita (vendedorSel === null). Depois disso manda o que ficou
  // guardado, inclusive '' = toda a operação, que é escolha legítima.
  // 23/10 — e se o vendedor guardado SUMIU da mesa (ficou sem lead, foi
  // desligado, teve tudo transferido)? Antes a tela filtrava por um id que não
  // está mais na lista: mesa vazia, seletor mostrando "Toda a operação" e o
  // topo também — parecia que a operação inteira estava zerada. Agora volta pro
  // primeiro vendedor da lista, igual à primeira visita.
  useEffect(() => {
    if (!vejoMaisDeUm || listaVendedores.length === 0) return
    if (vendedorSel === null) { escolherVendedor(listaVendedores[0][0]); return }
    if (vendedorSel !== '' && !listaVendedores.some(v => v[0] === vendedorSel)) {
      escolherVendedor(listaVendedores[0][0])
    }
  }, [vejoMaisDeUm, vendedorSel, listaVendedores])

  function escolherVendedor(id) {
    setVendedorSel(id)
    try { window.localStorage.setItem('kr_mesa_vendedor', id ?? '') } catch (_) {}
  }

  const nomeDaMesa = vejoMaisDeUm
    ? (listaVendedores.find(v => v[0] === vendedorSel)?.[1] || 'Toda a operação')
    : (profile?.nome || '')
  const iniciais = (nomeDaMesa || '?').trim().split(/\s+/).slice(0, 2)
    .map(p => p[0] || '').join('').toUpperCase() || '?'
  const hojeExtenso = new Date().toLocaleDateString('pt-BR',
    { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo' })

  // ===== AÇÕES =====
  // Quem decide o que pode é o BANCO (retroativo_vendedor_marcar); a tela manda.
  async function marcar(l, acao) {
    if (marcando) return
    const def = ACOES_SECUNDARIAS.find(a => a.id === acao)
    const chave = `${l.id}:${acao}`
    const texto = obsAberta === chave ? obs.trim() : ''
    if (def?.exigeObs && !texto) { setObsAberta(chave); setObs(''); avisar('Escreva o motivo antes de tirar da mesa'); return }

    setMarcando(l.id)
    const { data, error } = await supabase.rpc('retroativo_vendedor_marcar', {
      p_lead_id: l.id, p_acao: acao, p_obs: texto || null,
    })
    setMarcando(null)
    if (error || !data?.ok) { avisar('Não gravou: ' + (error?.message || data?.erro || 'erro')); return }

    avisar(`${primeiroNome(l.nome) || 'Cliente'} · ${data.status === 'contato' ? 'na sua mão' : (def?.rotulo || '').toLowerCase()}`)
    setObsAberta(null); setObs('')
    setBoard(b => b.map(x => x.id === l.id
      ? { ...x, vend_status: data.status, vend_obs: texto || x.vend_obs, vend_tentativas: data.tentativas ?? x.vend_tentativas, vend_contato_em: x.vend_contato_em || new Date().toISOString() }
      : x))
    carregar()
  }

  // ===== TELEFONE CERTO (Assertiva) =====
  // "Telefone errado" agora primeiro procura o número atualizado da cliente. Só se nenhum
  // servir é que o lead vai pro resgate, como antes. Cada consulta nova é paga: o mesmo CPF
  // dentro de 30 dias reaproveita o resultado guardado (sem custo).
  async function buscarTelefone(l, msg) {
    setBusTel({ l, msg, st: 'buscando', telefones: [] })
    try {
      const { data, error } = await supabase.functions.invoke('assertiva-telefone', { body: { lead_id: l.id } })
      if (error || !data?.ok) {
        // a função devolve o motivo no corpo da resposta; sem isso a tela só mostrava "non-2xx"
        let corpo = data, status = error?.context?.status
        if (error?.context && typeof error.context.json === 'function') { try { corpo = await error.context.json() } catch (_) { /* sem corpo */ } }
        const motivo = (corpo && corpo.erro) || (error && error.message) || 'não consegui buscar'
        const limite = status === 429 || /limite/i.test(motivo)
        setBusTel(bb => bb && bb.l.id === l.id ? { ...bb, st: limite ? 'limite' : 'erro', erro: motivo, max: (/(\d+)/.exec(motivo) || [])[1] } : bb)
        return
      }
      setBusTel(b => b && b.l.id === l.id ? { ...b, st: 'ok', telefones: data.telefones || [], de_cache: data.de_cache } : b)
    } catch (e) {
      setBusTel(b => b && b.l.id === l.id ? { ...b, st: 'erro', erro: String(e.message || e) } : b)
    }
  }
  async function usarTelefone(l, t) {
    if (usandoTel) return
    setUsandoTel(t.digitos)
    const { data, error } = await supabase.rpc('retroativo_tel_usar', { p_lead_id: l.id, p_tel: t.digitos })
    setUsandoTel('')
    if (error || !data?.ok) { avisar('Não gravou: ' + (error?.message || data?.erro || 'erro')); return }
    setTelNovo(m => ({ ...m, [l.id]: data.tel }))
    setBoard(b => b.map(x => x.id === l.id ? { ...x, vend_status: 'contato', vend_contato_em: x.vend_contato_em || new Date().toISOString() } : x))
    setBusTel(null)
    avisar(`${primeiroNome(l.nome) || 'Cliente'} · número novo salvo, ela continua com você`)
    carregar()
  }

  // 29/10 (Bruno) — "Achei por outro meio": o numero veio por fora da Assertiva (referencia,
  // a cliente chamou, resgate). Grava igual ao "Esse e o certo" (card e WhatsApp passam a usar o
  // numero novo, sai de Telefone errado) e, se tiver anotacao, registra junto.
  async function acheiPorFora(l) {
    const d = soDigitos(telManual)
    if (d.length < 10 || d.length > 13) { avisar('Digite o telefone com DDD'); return }
    if (marcando) return
    setMarcando(l.id)
    const { data, error } = await supabase.rpc('retroativo_tel_usar', { p_lead_id: l.id, p_tel: d })
    if (error || !data?.ok) { setMarcando(null); avisar('Não gravou: ' + (error?.message || data?.erro || 'erro')); return }
    const nota = obs.trim()
    if (nota) await supabase.rpc('retroativo_vendedor_marcar', { p_lead_id: l.id, p_acao: 'reabrir', p_obs: `Telefone novo ${fmtTel(d)} — ${nota}` })
    setMarcando(null)
    setTelNovo(m => ({ ...m, [l.id]: data.tel }))
    setBoard(b => b.map(x => x.id === l.id ? { ...x, vend_status: 'contato', vend_obs: nota ? `Telefone novo ${fmtTel(d)} — ${nota}` : x.vend_obs } : x))
    setObsAberta(null); setObs(''); setTelManual('')
    avisar(`${primeiroNome(l.nome) || 'Cliente'} · número novo salvo, voltou pra sua mesa`)
    carregar()
  }

  // 23/10 — lista de quem pode receber. Uma ida só, na abertura da tela. Para
  // vendedora comum a RPC devolve vazio e o botão "passar" não aparece.
  useEffect(() => {
    if (!profile?.id) return
    let vivo = true
    supabase.rpc('retroativo_vendedoras_transferencia')
      .then(({ data }) => { if (vivo) setVendsTransf(Array.isArray(data) ? data : []) })
      .catch(() => { if (vivo) setVendsTransf([]) })
    return () => { vivo = false }
  }, [profile?.id])

  function abrirTransf(l) {
    setTransf(l); setTransfPara(''); setTransfCod(''); setTransfTxt(''); setTransfHoje(false)
  }
  // só "Outro" exige texto — nos demais o código já diz tudo (o banco cobra igual)
  const transfOk = !!(transfPara && transfCod && (transfCod !== 'outro' || transfTxt.trim()))

  async function confirmarTransf() {
    if (!transf || !transfOk || transferindo) return
    setTransferindo(true)
    const { data, error } = await supabase.rpc('retroativo_transferir_lead', {
      p_lead_id: transf.id,
      p_para: transfPara,
      p_motivo_codigo: transfCod,
      p_motivo_texto: transfTxt.trim() || null,
      p_marcar_entregue_hoje: transfHoje,
    })
    setTransferindo(false)
    if (error || !data?.ok) { avisar('Não passou: ' + (error?.message || data?.erro || 'erro')); return }
    avisar(`${primeiroNome(transf.nome) || 'Cliente'} passou de ${data.de || 'sem dona'} para ${data.para}`)
    setTransf(null); setFicha(null)
    carregar()
  }

  function copiar(txt) {
    // sem navigator.clipboard (navegador antigo / página sem https) o "?." devolvia
    // undefined e o .then quebrava a tela; agora só avisa
    if (!navigator.clipboard) { avisar('Não consegui copiar — selecione o texto'); return }
    navigator.clipboard.writeText(txt).then(() => avisar('Mensagem copiada'))
      .catch(() => avisar('Não consegui copiar — selecione o texto'))
  }

  // 22/10 — o botão Vender leva pro Novo Cliente com o CPF na mão. setPage vem
  // do App.js; sem a prop, copia o CPF e avisa — a tela funciona dos dois jeitos.
  // 23/10 — o App.js só manda o setPage para quem TEM a tela Novo Cliente
  // (paginaPermitida). Sem a prop — quem não digita cliente — fica como antes:
  // copia o CPF e avisa. Com a prop, o CPF também vai pra área de transferência
  // ANTES de trocar de tela: se o Novo Cliente ainda não ler o kr_venda_cpf, é
  // só colar.
  // O recado pro Novo Cliente leva a HORA: ele só aceita se tiver menos de 5
  // minutos. Sem isso, um CPF deixado aqui reapareceria preenchido sozinho num
  // cadastro qualquer dias depois. E só é gravado quando a tela vai mesmo trocar.
  function vender(l) {
    const cpf = fmtCPF(l.cpf)
    if (typeof setPage === 'function') {
      try { window.localStorage.setItem('kr_venda_cpf', JSON.stringify({ cpf: soDigitos(l.cpf), em: Date.now() })) } catch (_) {}
      try { navigator.clipboard?.writeText(cpf)?.catch?.(() => {}) } catch (_) {}
      setPage('novo_cliente')
      return
    }
    if (!navigator.clipboard) { avisar(`CPF ${cpf} — abra "Novo cliente (digitar)"`); return }
    navigator.clipboard.writeText(cpf)
      .then(() => avisar('CPF copiado — abra "Novo cliente (digitar)"'))
      .catch(() => avisar(`CPF ${cpf} — abra "Novo cliente (digitar)"`))
  }

  // ===== RENDER =====
  return (
    <div style={{ fontFamily: fonte.familia }}>
      <h1 style={s.h1}>📋 Mesa do Retroativo</h1>
      <div style={s.sub}>
        Clientes já pré-aprovadas pela advogada, prontas para a ligação. Marque o que
        aconteceu em cada uma — é assim que nenhuma fica esquecida. Venda fechada vai
        para o Painel de vendas.
      </div>

      <div style={s.buscaWrap}>
        <input style={s.buscaInput} value={busca} placeholder="🔎 Achar cliente: CPF, telefone ou nome"
          onChange={e => setBusca(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') setBuscaAtiva(busca) }} />
        <button style={s.btn} onClick={() => setBuscaAtiva(busca)}>Buscar</button>
        {buscaAtiva && <button style={s.btnGhost} onClick={() => { setBusca(''); setBuscaAtiva('') }}>Limpar</button>}
      </div>

      {/* ===== PAINEL DO DIA ===== */}
      <div style={s.painel}>
        <div style={s.painelTopo}>
          <div style={s.avatar}>{iniciais}</div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={s.quem}>{nomeDaMesa}</div>
            <div style={s.quando}>
              Retroativo · {hojeExtenso}
              {filtroLigado && (
                <> · <b style={{ color: cores.azul }}>mostrando: {periodoRotulo.toLowerCase()}</b></>
              )}
            </div>
          </div>
          <button style={s.btnGhost} onClick={carregar} disabled={carregando}>
            {carregando ? '⏳ Atualizando…' : '🔄 Atualizar'}
          </button>
          {vejoMaisDeUm && listaVendedores.length > 0 && (
            <select style={s.select} value={vendedorSel ?? ''} onChange={e => escolherVendedor(e.target.value)}>
              <option value="">👥 Toda a operação</option>
              {listaVendedores.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
            </select>
          )}
        </div>

        <div style={s.kpis}>
          <div style={s.kpi(cores.ok, true)}>
            <div style={s.kpiLab}>Caíram hoje</div>
            <div style={s.kpiNum(cores.ok)}>{caiuHoje}</div>
            <div style={s.kpiSub}>{semContatoHoje} ainda sem contato</div>
          </div>
          <div style={s.kpi(cores.azul)}>
            <div style={s.kpiLab}>Na mesa</div>
            <div style={s.kpiNum(cores.texto)}>{naMesa}</div>
            <div style={s.kpiSub}>clientes em aberto</div>
          </div>
          <div style={s.kpi(cores.perigo, parados48 > 0)}>
            <div style={s.kpiLab}>Parados +48h</div>
            <div style={s.kpiNum(parados48 > 0 ? cores.perigo : cores.texto)}>{parados48}</div>
            <div style={s.kpiSub}>ninguém falou ainda</div>
          </div>
          <div style={s.kpi(cores.azul)}>
            <div style={s.kpiLab}>Falou hoje</div>
            <div style={s.kpiNum(cores.azul)}>{falouHoje}</div>
            <div style={s.kpiSub}>de {caiuHoje} que caíram</div>
          </div>
          <div style={s.kpi(cores.ok)}>
            <div style={s.kpiLab}>Vendas fechadas</div>
            <div style={s.kpiNum(cores.ok)}>{conta('fechou')}</div>
            <div style={s.kpiSub}>assinado ou validado</div>
          </div>
          <div style={s.kpi(cores.alerta, conta('recuperar') > 0)}>
            <div style={s.kpiLab}>Pra recuperar</div>
            <div style={s.kpiNum(cores.alerta)}>{conta('recuperar')}</div>
            <div style={s.kpiSub}>fecharam e caíram</div>
          </div>
        </div>

        {/* Com um período que não inclui hoje (ex.: "Ontem"), caiuHoje é 0 e a
            barra não tem o que medir — aí ela dá lugar ao total do recorte, em
            vez de mostrar "0 de 0 · 0% do dia", que parece defeito. */}
        <div style={s.barraWrap}>
          {caiuHoje > 0 ? (
            <>
              <div style={s.barra}><div style={{ ...s.barraFill, width: `${pctDia}%` }} /></div>
              <div style={{ fontSize: 11.5, color: cores.suave, whiteSpace: 'nowrap' }}>
                <b style={{ color: cores.texto }}>{falouHoje} de {caiuHoje}</b> que caíram hoje · {pctDia}% do dia
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11.5, color: cores.suave }}>
              {filtroLigado
                ? <>Nenhuma cliente caiu hoje dentro de <b style={{ color: cores.texto }}>{periodoRotulo.toLowerCase()}</b> · {mesaFiltrada.length} {mesaFiltrada.length === 1 ? 'cliente' : 'clientes'} nesse recorte</>
                : 'Nenhuma cliente nova caiu hoje.'}
            </div>
          )}
        </div>
      </div>

      {parados48 > 0 && (
        <div style={s.alerta}>
          <b style={{ color: cores.perigo }}>{parados48} {parados48 === 1 ? 'cliente está' : 'clientes estão'} há mais de 48h sem ninguém falar
          {filtroLigado ? ` (dentro de ${periodoRotulo.toLowerCase()})` : ''}.</b>{' '}
          Cada dia parado é uma chance de ela fechar com outro escritório. Comece pela aba Atrasados.
        </div>
      )}

      {/* ===== ABAS ===== */}
      <div style={s.abas}>
        {ABAS.map(([k, rot]) => (
          <button key={k} style={s.aba(aba === k && !buscaAtiva)}
            onClick={() => { setAba(k); setBuscaAtiva(''); setBusca('') }}>
            {rot} {conta(k)}
          </button>
        ))}
        <select style={s.select} value={periodo} onChange={e => setPeriodo(e.target.value)}>
          {PERIODOS.map(([v, l]) => <option key={v} value={v}>📅 {l}</option>)}
        </select>
      </div>

      {/* Busca ignora o período e as abas — a tela diz isso em vez de deixar a
          pessoa achar que o filtro quebrou. */}
      {buscaAtiva && lista.length > 0 && (
        <div style={{ ...s.alerta, background: `${cores.azul}0d`, border: `1px solid ${cores.azul}33` }}>
          <b>{lista.length} {lista.length === 1 ? 'resultado' : 'resultados'} para "{buscaAtiva}"</b> —
          a busca procura na mesa inteira{filtroLigado ? `, ignorando o filtro "${periodoRotulo.toLowerCase()}"` : ''} e em todas as abas.
        </div>
      )}

      {/* ===== LISTA ===== */}
      {carregando && lista.length === 0 ? (
        <div style={s.vazio}><div style={{ fontSize: 15, color: cores.suave }}>Carregando a mesa…</div></div>
      ) : lista.length === 0 ? (
        <div style={s.vazio}>
          <div style={{ fontSize: 38, marginBottom: 10 }}>{buscaAtiva ? '🔎' : '✅'}</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: cores.texto, marginBottom: 5 }}>
            {buscaAtiva ? 'Ninguém encontrado' : 'Nada nesta aba'}
          </div>
          <div style={{ fontSize: 13, color: cores.suave }}>
            {buscaAtiva
              ? `Nenhuma cliente com esse CPF, telefone ou nome na mesa${vendedorSel ? ' de ' + nomeDaMesa : ''}.`
              : filtroLigado
                ? <>Nada nesta aba dentro de <b>{periodoRotulo.toLowerCase()}</b>. Experimente "Todo o período".</>
                : 'Quando cair cliente nova aqui, ela aparece sozinha.'}
          </div>
        </div>
      ) : lista.map(l => {
        const vinc = lerVinculo(l.vinculo_direito)
        const msg = montarAbordagem(l, vinc)
        const perda = MOTIVO_PERDA[l.cliente_status]
        const chaveObs = obsAberta && obsAberta.startsWith(`${l.id}:`) ? obsAberta : null
        // 23/10 — com 2+ filhos aprovados, a lista completa vem da RPC; cada item
        // tem a mesma forma do vinculo_direito, então passa pelo mesmo lerVinculo.
        const extras = direitosExtra[l.id]
        const direitos = Array.isArray(extras) && extras.length >= 2 ? extras.map(lerVinculo).filter(Boolean) : null
        const cpfLimpo = soDigitos(l.cpf)
        return (
          <div key={l.id} style={s.card}>
            <div style={s.cardTopo}>
              <div style={{ minWidth: 0 }}>
                <div style={s.nome}>{nomeBonito(l.nome) || 'Sem nome'}</div>
                <div style={s.meta}>
                  {telNovo[l.id] ? <><b style={{ color: cores.ok }}>📞 {fmtTel(telNovo[l.id])}</b> <span style={{ textDecoration: 'line-through' }}>{fmtTel(l.tel)}</span></> : fmtTel(l.tel)} · CPF {fmtCPF(l.cpf)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {direitos && <span style={ui.pill(cores.azul)}>{direitos.length} filhos com direito</span>}
                {l.vend_tentativas > 0 && <span style={ui.pill(cores.alerta)}>{l.vend_tentativas}ª tentativa</span>}
                {vejoMaisDeUm && l.agente_nome && <span style={ui.pill(cores.roxo)}>{primeiroNome(l.agente_nome)}</span>}
                {podeTransferir && (
                  <button style={{ ...s.btnCopiar, color: cores.roxo, borderColor: `${cores.roxo}44` }}
                    title="Passar esta cliente para outra vendedora" onClick={() => abrirTransf(l)}>
                    🔄 passar
                  </button>
                )}
                {/* 23/10 (Bruno) — na aba Venda fechada o selo fala da VENDA, não de
                    quando o lead caiu na mesa. Antes mostrava "na mesa há 7 dias" numa
                    venda feita hoje (ex.: 492.913.378-54, lead de 16/10, venda 23/10).
                    cliente_em = data do cadastro da cliente no CRM. */}
                {l._aba === 'fechou' ? (
                  <span style={ui.pill(cores.ok)}>
                    {l.cliente_em
                      ? (diaBR(l.cliente_em) === hojeBR() ? 'venda de hoje'
                        : `venda de ${new Date(l.cliente_em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`)
                      : 'venda fechada'}
                  </span>
                ) : (
                  <span style={ui.pill((l._h ?? 0) >= 48 ? cores.perigo : cores.suave)}>
                    {l._aba === 'recuperar' ? 'caiu' : 'na mesa há'} {fmtHoras(l._h)}
                  </span>
                )}
              </div>
            </div>

            {/* ===== UM filho (o comum): igual ao desenho aprovado em 22/10 ===== */}
            {!direitos && vinc?.empresa && (
              <div style={s.bloco}>
                <div style={s.blocoTit}><span>{vinc.ehBeneficio ? 'Benefício que deu o direito' : 'Empresa que deu o direito'}</span></div>
                <div style={s.dir1}>{vinc.empresa}</div>
                <div style={s.dir2}>{descVinculo(vinc)}</div>
              </div>
            )}
            {!direitos && (vinc?.filhoNome || vinc?.filhoDn || l.data_nascimento_filho) && (
              <div style={s.bebe}>
                👶 {vinc?.filhoNome ? <b>{nomeBonito(vinc.filhoNome)}</b> : 'Filho(a)'}
                {(vinc?.filhoDn || l.data_nascimento_filho) && ` · nasceu em ${fmtData(vinc?.filhoDn || l.data_nascimento_filho)}`}
                {l.idade_bebe ? ` · ${l.idade_bebe}` : ''}
                {vinc?.dnAproximada && (
                  <span style={{ color: cores.alerta, fontWeight: 600 }}> · ⚠️ data aproximada, não afirme o dia</span>
                )}
              </div>
            )}

            {/* ===== DOIS OU MAIS filhos (23/10): um bloco por direito ===== */}
            {direitos && direitos.map((v, i) => (
              <div key={v.filhoDn || i} style={{ ...s.bloco, borderLeft: `3px solid ${v.faixa === '24' ? cores.alerta : cores.ok}` }}>
                <div style={s.blocoTit}>
                  <span>Direito {i + 1} de {direitos.length}</span>
                  {v.faixa && (
                    <span style={ui.pill(v.faixa === '24' ? cores.alerta : cores.ok)}>
                      {v.faixa === '24' ? '24 meses · confirmar seguro' : '12 meses'}
                    </span>
                  )}
                </div>
                <div style={{ ...s.bebe, marginTop: 0 }}>
                  👶 {v.filhoNome ? <b>{nomeBonito(v.filhoNome)}</b> : 'Filho(a)'}
                  {v.filhoDn && ` · nasceu em ${fmtData(v.filhoDn)}`}
                  {v.dnAproximada && <span style={{ color: cores.alerta, fontWeight: 600 }}> · ⚠️ data aproximada</span>}
                </div>
                {v.empresa && (
                  <div style={{ marginTop: 8 }}>
                    <div style={s.dir1}>{v.ehBeneficio ? '📄' : '🏢'} {v.empresa}</div>
                    <div style={s.dir2}>{descVinculo(v)}</div>
                  </div>
                )}
              </div>
            ))}

            {/* o que ele já anotou */}
            {l.vend_obs && (
              <div style={{ ...s.bloco, background: `${cores.alerta}0d`, border: `1px solid ${cores.alerta}33` }}>
                <div style={s.blocoTit}><span>Você anotou da última vez</span></div>
                <div style={{ fontSize: 13, color: cores.texto, lineHeight: 1.5 }}>{l.vend_obs}</div>
              </div>
            )}

            {/* por que caiu (aba recuperar) */}
            {l._aba === 'recuperar' && perda && (
              <div style={{ ...s.bloco, background: `${cores.perigo}0d`, border: `1px solid ${cores.perigo}33` }}>
                <div style={s.dir1}>{perda[0]} {perda[1]}</div>
                <div style={s.dir2}>{perda[2]}</div>
              </div>
            )}

            {/* ===== abas de trabalho: mensagem + ações ===== */}
            {['hoje', 'represado', 'contato', 'retomar'].includes(l._aba) && (
              <>
                <div style={s.msgBox}>
                  <div style={s.blocoTit}>
                    <span>Mande essa mensagem</span>
                    <button style={s.btnCopiar} onClick={() => copiar(msg)}>Copiar</button>
                  </div>
                  <div style={s.msgTexto}>{msg}</div>
                </div>

                <div style={s.acoes}>
                  {linkWhats(telNovo[l.id] || l.tel, msg) && (
                    <a style={s.btnPegar} href={linkWhats(telNovo[l.id] || l.tel, msg)} target="_blank" rel="noreferrer"
                      onClick={() => { if (l.vend_status !== 'contato') marcar(l, 'pegar') }}>
                      💬 Abrir o WhatsApp já com a mensagem
                    </a>
                  )}
                  {l.vend_status !== 'contato' && (
                    <button style={{ ...s.btnAcao(cores.ok), fontSize: 12.5 }} disabled={marcando === l.id}
                      onClick={() => marcar(l, 'pegar')}>
                      {marcando === l.id ? '⏳' : '✋ Peguei esta cliente'}
                    </button>
                  )}
                  {ACOES_SECUNDARIAS.map(a => (
                    <button key={a.id} style={s.btnAcao(a.cor)} disabled={marcando === l.id}
                      onClick={() => {
                        const ch = `${l.id}:${a.id}`
                        if (a.id === 'tel_errado') { buscarTelefone(l, msg); return }
                        if (a.exigeObs && obsAberta !== ch) { setObsAberta(ch); setObs(''); return }
                        marcar(l, a.id)
                      }}>
                      {a.rotulo}
                    </button>
                  ))}
                  <button style={s.btnAcao(cores.suave)} onClick={() => setFicha(l)}>abrir ficha</button>
                  {linkFichaCnis(l.cpf) && (
                    <a style={{ ...s.btnAcao(cores.azul), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                      href={linkFichaCnis(l.cpf)} target="_blank" rel="noreferrer" title="Vínculos do CNIS, qual deu o direito, carência e fundamento legal. Dá pra mandar o link pra cliente.">
                      📄 Ficha CNIS
                    </a>
                  )}
                </div>

                {chaveObs && (
                  <div>
                    <textarea style={s.obsArea} value={obs} onChange={e => setObs(e.target.value)}
                      placeholder={chaveObs.endsWith(':sem_direito')
                        ? 'Por que ela não tem direito? (obrigatório)'
                        : 'Anote o que ela disse — você lê isso na próxima ligação.'} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button style={{ ...ui.btnPrimario, opacity: marcando === l.id ? .6 : 1 }}
                        disabled={marcando === l.id}
                        onClick={() => marcar(l, chaveObs.split(':')[1])}>
                        {marcando === l.id ? 'Gravando…' : 'Confirmar'}
                      </button>
                      <button style={s.btnGhost} onClick={() => { setObsAberta(null); setObs('') }}>Cancelar</button>
                    </div>
                  </div>
                )}

                <button style={{ ...ui.btnPrimario, width: '100%', marginTop: 10, padding: '12px' }}
                  onClick={() => vender(l)}>
                  Fechou! Cadastrar a venda
                </button>
              </>
            )}

            {/* abas de leitura: só a ficha */}
            {!['hoje', 'represado', 'contato', 'retomar'].includes(l._aba) && (
              <div style={s.acoes}>
                {/* 26/10 (Bruno) — A ABA "TELEFONE ERRADO" ERA BECO SEM SAÍDA. Caso:
                    Francine Paiva (429.670.428-11) — marcada tel errado, acharam o número,
                    falaram com ela e viram que não tinha direito, mas a tela não tinha
                    botão nenhum aqui. O banco (retroativo_vendedor_marcar) sempre aceitou
                    'reabrir' e 'sem_direito' de qualquer situação; faltava só a tela.
                    · 29/10: virou "Achei por outro meio" — pede o TELEFONE (obrigatório) e grava
                      igual ao "Esse é o certo" da Assertiva (retroativo_tel_usar): o card e o
                      WhatsApp passam a usar o número novo e o resgate fica resolvido.
                    · Não tem direito -> 'sem_direito', motivo obrigatório como nas outras abas. */}
                {l._aba === 'tel' && (
                  <>
                    <button style={{ ...s.btnAcao(cores.azul), fontWeight: 800, background: `${cores.azul}14` }} onClick={() => buscarTelefone(l, msg)}>🔎 Buscar telefone certo</button>
                    <button style={s.btnAcao(cores.suave)} disabled={marcando === l.id}
                      onClick={() => {
                        const ch = `${l.id}:reabrir`
                        if (obsAberta !== ch) { setObsAberta(ch); setObs(''); setTelManual(''); return }
                        setObsAberta(null); setObs(''); setTelManual('')
                      }}>
                      📞 Achei por outro meio
                    </button>
                    <button style={s.btnAcao(cores.suave)} disabled={marcando === l.id}
                      onClick={() => {
                        const ch = `${l.id}:sem_direito`
                        if (obsAberta !== ch) { setObsAberta(ch); setObs(''); return }
                        marcar(l, 'sem_direito')
                      }}>
                      🚫 Não tem direito
                    </button>
                  </>
                )}
                <button style={s.btnAcao(cores.suave)} onClick={() => setFicha(l)}>abrir ficha</button>
                {linkFichaCnis(l.cpf) && (
                  <a style={{ ...s.btnAcao(cores.azul), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                    href={linkFichaCnis(l.cpf)} target="_blank" rel="noreferrer">📄 Ficha CNIS</a>
                )}
                {l._aba === 'recuperar' && (
                  <button style={{ ...ui.btnPrimario, padding: '11px 16px' }} onClick={() => vender(l)}>
                    Cadastrar de novo
                  </button>
                )}
              </div>
            )}

            {/* 26/10 — caixa de observação da aba "Telefone errado". Mesmo
                comportamento das abas de trabalho: abre no 1º clique, grava no Confirmar. */}
            {l._aba === 'tel' && chaveObs && (
              <div>
                {chaveObs.endsWith(':reabrir') && (
                  <input value={telManual} onChange={e => setTelManual(e.target.value)} inputMode="tel"
                    placeholder="Telefone novo com DDD (obrigatório) — ex.: (11) 98765-4321"
                    style={{ ...s.obsArea, minHeight: 0, height: 44, marginBottom: 8, fontWeight: 700 }} />
                )}
                <textarea style={s.obsArea} value={obs} onChange={e => setObs(e.target.value)}
                  placeholder={chaveObs.endsWith(':sem_direito')
                    ? 'Por que ela não tem direito? (obrigatório)'
                    : 'Como achou o número? (opcional — ex.: contato de referência, ela chamou)'} />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button style={{ ...ui.btnPrimario, opacity: marcando === l.id || (chaveObs.endsWith(':reabrir') && soDigitos(telManual).length < 10) ? .6 : 1 }}
                    disabled={marcando === l.id || (chaveObs.endsWith(':reabrir') && soDigitos(telManual).length < 10)}
                    onClick={() => (chaveObs.endsWith(':reabrir') ? acheiPorFora(l) : marcar(l, chaveObs.split(':')[1]))}>
                    {marcando === l.id ? 'Gravando…' : 'Confirmar'}
                  </button>
                  <button style={s.btnGhost} onClick={() => { setObsAberta(null); setObs('') }}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* ===== TELEFONE CERTO (Assertiva) ===== */}
      {busTel && (
        <div style={{ ...s.overlay, zIndex: 960 }} onClick={() => !usandoTel && setBusTel(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: cores.texto }}>📞 Telefone certo</div>
                <div style={{ fontSize: 13, color: cores.suave, marginTop: 2 }}>{nomeBonito(busTel.l.nome)} · número que não deu: {fmtTel(busTel.l.tel)}</div>
              </div>
              <button style={s.btnGhost} onClick={() => setBusTel(null)}>Fechar</button>
            </div>
            {busTel.st === 'buscando' && <div style={{ padding: '22px 0', fontSize: 14, color: cores.suave }}>🔎 Procurando os telefones atualizados dela…</div>}
            {busTel.st === 'limite' && (
              <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 12, background: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239' }}>
                <div style={{ fontSize: 15, fontWeight: 800 }}>⛔ Limite diário de buscas atingido</div>
                <div style={{ fontSize: 13.5, marginTop: 4 }}>Você já usou as {busTel.max || ''} buscas de telefone de hoje. Amanhã libera de novo (zera à meia-noite). Se precisar antes, fale com a supervisão.</div>
              </div>
            )}
            {busTel.st === 'erro' && (
              <div style={{ marginTop: 14, fontSize: 13.5, color: cores.perigo }}>
                Não consegui buscar: {busTel.erro}
                <div style={{ marginTop: 8 }}><button style={s.btnAcao(cores.azul)} onClick={() => buscarTelefone(busTel.l, busTel.msg)}>Tentar de novo</button></div>
              </div>
            )}
            {busTel.st === 'ok' && (
              <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
                {busTel.telefones.length === 0 && <div style={{ fontSize: 13.5, color: cores.suave }}>Nenhum outro telefone encontrado para esse CPF.</div>}
                {busTel.telefones.slice(0, 6).map((t, i) => (
                  <div key={t.digitos} style={{ border: `1px solid ${i === 0 && !t.e_o_atual && !t.nao_perturbe ? cores.ok + '66' : 'rgba(15,23,42,.1)'}`, background: i === 0 && !t.e_o_atual && !t.nao_perturbe ? cores.ok + '0d' : '#fff', borderRadius: 12, padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                      <div style={{ fontSize: 15.5, fontWeight: 800, color: cores.texto }}>{t.numero}{i === 0 && !t.e_o_atual && !t.nao_perturbe ? <span style={{ ...ui.pill(cores.ok), marginLeft: 8 }}>mais provável</span> : null}</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4, fontSize: 12, color: cores.suave }}>
                        <span>{t.tipo === 'movel' ? 'celular' : 'fixo'}</span>
                        {t.whatsapp && <span style={{ color: cores.ok, fontWeight: 700 }}>· tem WhatsApp</span>}
                        {t.operadora && <span>· {t.operadora}</span>}
                        {t.ultimo_contato && <span>· {t.ultimo_contato.toLowerCase()}</span>}
                        {t.relacao && !/direto/i.test(t.relacao) && <span>· {t.relacao}</span>}
                      </div>
                      {t.e_o_atual && <div style={{ fontSize: 12, fontWeight: 700, color: cores.alerta, marginTop: 3 }}>é o número que já está no lead</div>}
                      {t.nao_perturbe && <div style={{ fontSize: 12, fontWeight: 700, color: cores.perigo, marginTop: 3 }}>⚠️ cadastrado no "Não perturbe" — evite</div>}
                    </div>
                    {!t.e_o_atual && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {t.tipo === 'movel' && linkWhats(t.digitos, busTel.msg) && (
                          <a style={{ ...s.btnAcao(cores.ok), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }} href={linkWhats(t.digitos, busTel.msg)} target="_blank" rel="noreferrer">💬 WhatsApp</a>
                        )}
                        <button style={s.btnAcao(cores.azul)} disabled={!!usandoTel} onClick={() => usarTelefone(busTel.l, t)}>
                          {usandoTel === t.digitos ? 'Salvando…' : '✓ Esse é o certo'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                <div style={{ fontSize: 11.5, color: cores.suave }}>Fonte: Assertiva{busTel.de_cache ? ' (consulta guardada, sem custo)' : ''}. Mande a mensagem e, quando ela responder, marque "Esse é o certo".</div>
              </div>
            )}
            {busTel.l.vend_status !== 'tel_errado' && busTel.st !== 'buscando' && (
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(15,23,42,.08)' }}>
                <button style={s.btnAcao(cores.perigo)} disabled={marcando === busTel.l.id}
                  onClick={() => { const l = busTel.l; setBusTel(null); marcar(l, 'tel_errado') }}>
                  Nenhum serve — mandar pro resgate (telefone errado)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== FICHA ===== */}
      {ficha && (
        <div style={s.overlay} onClick={() => setFicha(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
              <div style={{ fontSize: 19, fontWeight: 800, color: cores.texto }}>{nomeBonito(ficha.nome)}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {podeTransferir && (
                  <button style={{ ...s.btnGhost, color: cores.roxo, borderColor: `${cores.roxo}55` }}
                    onClick={() => abrirTransf(ficha)}>🔄 Passar para outra</button>
                )}
                <button style={s.btnGhost} onClick={() => setFicha(null)}>Fechar</button>
              </div>
            </div>
            {linkFichaCnis(ficha.cpf) && (
              <a href={linkFichaCnis(ficha.cpf)} target="_blank" rel="noreferrer"
                style={{ ...ui.btnPrimario, display: 'block', textAlign: 'center', textDecoration: 'none', marginBottom: 14 }}>
                📄 Abrir a ficha do CNIS — por que ela tem direito
              </a>
            )}
            {Array.isArray(direitosExtra[ficha.id]) && direitosExtra[ficha.id].length >= 2 && (
              <div style={{ ...s.bloco, marginTop: 0, marginBottom: 12, background: `${cores.azul}0a`, border: `1px solid ${cores.azul}33` }}>
                <div style={s.blocoTit}><span>{direitosExtra[ficha.id].length} filhos com direito</span></div>
                {direitosExtra[ficha.id].map(lerVinculo).filter(Boolean).map((v, i) => (
                  <div key={i} style={{ fontSize: 13, color: cores.texto, marginTop: i ? 6 : 0 }}>
                    👶 <b>{v.filhoNome ? nomeBonito(v.filhoNome) : 'Filho(a)'}</b>{v.filhoDn ? ` · ${fmtData(v.filhoDn)}` : ''}
                    {v.faixa ? ` · ${v.faixa} meses` : ''}{v.empresa ? ` · ${v.empresa}` : ''}
                  </div>
                ))}
              </div>
            )}
            {[
              ['Telefone', fmtTel(ficha.tel)],
              ['CPF', fmtCPF(ficha.cpf)],
              ['Nascimento do filho', fmtData(ficha.data_nascimento_filho) + (ficha.idade_bebe ? ` (${ficha.idade_bebe})` : '')],
              ['Entregue a você em', fmtData(ficha.entregue_vendedora_em)],
              ['Na mesa há', fmtHoras(ficha._h)],
              ['Tentativas', String(ficha.vend_tentativas || 0)],
              ['Último contato', ficha.vend_contato_em ? fmtData(ficha.vend_contato_em) : 'nunca'],
              ['Vendedor', ficha.agente_nome || '—'],
              ['Estado no sistema', `${ficha.coluna || '—'} / ${ficha.estado || '—'}`],
              ['Cadastro', ficha.cliente_status || 'ainda não cadastrada'],
              ['Venda cadastrada em', ficha.cliente_em ? new Date(ficha.cliente_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'],
              ['Trabalhava no nascimento', ficha.trabalhava_no_nascimento || '—'],
              ['Já trabalhou CLT', ficha.ja_trabalhou_clt || '—'],
            ].map(([lab, val]) => (
              <div key={lab} style={s.linha}>
                <div style={s.linhaLab}>{lab}</div>
                <div style={{ flex: 1, color: cores.texto }}>{val || '—'}</div>
              </div>
            ))}
            {ficha.vend_obs && (
              <div style={{ ...s.bloco, marginTop: 14 }}>
                <div style={s.blocoTit}><span>Sua observação</span></div>
                <div style={{ fontSize: 13, color: cores.texto, lineHeight: 1.5 }}>{ficha.vend_obs}</div>
              </div>
            )}
            {ficha.gerid_vendedor && (
              <div style={{ ...s.bloco, marginTop: 10 }}>
                <div style={s.blocoTit}><span>Resumo do GERID</span></div>
                <div style={{ fontSize: 12.5, color: cores.texto, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{ficha.gerid_vendedor}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== PASSAR PARA OUTRA VENDEDORA (23/10) =====
          Motivo obrigatório dos DOIS lados: o botão fica apagado sem ele e o
          banco recusa se vier vazio. zIndex acima da ficha, que pode estar aberta. */}
      {transf && (
        <div style={{ ...s.overlay, zIndex: 950 }} onClick={() => !transferindo && setTransf(null)}>
          <div style={{ ...s.modal, maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 800, color: cores.texto }}>🔄 Passar para outra vendedora</div>
            <div style={{ fontSize: 13, color: cores.suave, marginTop: 4 }}>
              {nomeBonito(transf.nome) || 'Cliente'}
              {transf.agente_nome ? <> · hoje com <b>{transf.agente_nome}</b></> : ' · sem dona'}
            </div>

            <div style={{ ...s.blocoTit, marginTop: 16 }}><span>Para quem vai *</span></div>
            <select style={{ ...s.select, width: '100%', padding: '10px 11px', fontSize: 13 }}
              value={transfPara} onChange={e => setTransfPara(e.target.value)}>
              <option value="">escolha a vendedora…</option>
              {vendsTransf.filter(v => v.profile_id !== transf.bf_agente_id).map(v => (
                <option key={v.profile_id} value={v.profile_id}>
                  {v.nome}{v.faixa === '12' || v.faixa === '24' ? ` · time ${v.faixa} meses` : v.faixa ? ` · ${v.faixa}` : ''}
                </option>
              ))}
            </select>

            <div style={{ ...s.blocoTit, marginTop: 14 }}><span>Por quê? *</span></div>
            <select style={{ ...s.select, width: '100%', padding: '10px 11px', fontSize: 13 }}
              value={transfCod} onChange={e => setTransfCod(e.target.value)}>
              <option value="">escolha o motivo…</option>
              {MOTIVOS_TRANSF.map(([cod, txt]) => <option key={cod} value={cod}>{txt}</option>)}
            </select>
            {transfCod === 'outro' && (
              <textarea style={s.obsArea} value={transfTxt} onChange={e => setTransfTxt(e.target.value)}
                placeholder="Escreva o motivo *" />
            )}
            {transfCod === 'venda_fora' && (
              <div style={{ ...s.bloco, background: `${cores.azul}0a`, border: `1px solid ${cores.azul}33`, fontSize: 12.5, color: cores.texto, lineHeight: 1.5 }}>
                💡 Marque <b>"entregue hoje"</b> abaixo para a cliente voltar ao topo da mesa de quem recebe.
              </div>
            )}

            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 14, fontSize: 13, color: cores.texto, cursor: 'pointer' }}>
              <input type="checkbox" checked={transfHoje} onChange={e => setTransfHoje(e.target.checked)} style={{ marginTop: 3 }} />
              <span><b>Marcar como entregue hoje</b><br />
                <span style={{ fontSize: 12, color: cores.suave }}>
                  A cliente cai como "caiu hoje" para quem recebe. Desmarcado, fica a data de entrega original.
                </span>
              </span>
            </label>

            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <button style={{ ...s.btnGhost, flex: 1 }} disabled={transferindo} onClick={() => setTransf(null)}>Cancelar</button>
              <button style={{ ...s.btn, flex: 2, opacity: transfOk && !transferindo ? 1 : 0.5 }}
                disabled={!transfOk || transferindo} onClick={confirmarTransf}>
                {transferindo ? '⏳ Passando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={s.toast}>{toast}</div>}
    </div>
  )
}
