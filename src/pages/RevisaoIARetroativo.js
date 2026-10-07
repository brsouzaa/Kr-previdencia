import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const IDS_SUPERVISOR_BOARD = [
  // 01/10: Egle saiu daqui — agora ela e supervisora do TIME de 24 meses
  // (SUPERVISORAS_TIME), nao do board inteiro.
  // '6db43f01-71e6-4972-b84e-eb49375e8e70', // Egle Marcela
]

// ===== OPERAÇÕES LICENCIADAS (Ronaldo / Leandro) =====
// Usuário licenciado só enxerga leads da PRÓPRIA operação (l.operacao, marcada pelo sync via inbox).
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

// 01/10 (Bruno): o retroativo virou DOIS times por faixa. Agatha supervisiona o de
// 12 meses, Egle o de 24. As duas NAO recebem lead — so olham o time.
// A propria supervisora entra na lista porque pode ter lead antigo na mao
// (a Egle tem 8 de 12 meses recebidos na mao em 25/09).
const SUPERVISORAS_TIME = {
  // Agatha Barreto — time 12 meses
  '0a5958b9-d43b-4bac-a01d-af60247dd721': [
    '9fbda3fe-22aa-4179-b1a7-005e99660c8d', // Duda
    'bb85a0f3-2d79-499e-8b19-6219bd0cef56', // Gislaine
    '4a1db9e1-0b10-48bc-85d6-23b728b9fd4f', // Luciane
    'a1d7dbfb-bc0d-46a3-b523-bfdc15aac0c9', // Leticia
    'be98f268-314f-4114-acc3-7bb9ce7635fd', // Maryana Kodos
    '0a5958b9-d43b-4bac-a01d-af60247dd721', // ela mesma
  ],
  // Egle Marcela — time 12 a 24 meses
  '6db43f01-71e6-4972-b84e-eb49375e8e70': [
    '758a33f7-e5a2-4ef7-943a-dfe0ac72a387', // Supervisora Joana
    '64ced61d-fdae-4399-97c9-900c59120fff', // Supervisora Pamela
    'a3e94f8b-7e64-479b-9d72-1414afb83d1c', // nadiacajado
    '2c71c435-f5c2-49cf-984b-3629438045d2', // helenlima451
    '7ad37a1d-e5be-438c-9afd-982646d507d4', // juhferreira141988
    '6db43f01-71e6-4972-b84e-eb49375e8e70', // ela mesma (8 leads de 25/09)
  ],
}

const COLUNAS = [
  // Ordem = ordem real do fluxo. O PromoBank vem ANTES do CNIS: so quem qualifica
  // deveria receber o passo-a-passo do Meu INSS.
  ['PEDIU_CNIS', '⏳ Aguardando PromoBank'],
  ['PEDIU_CNIS_OK', '✅ Passou PromoBank — pediu CNIS'],
  ['FILA_GERID', '🗂️ Fila GERID'],
  ['A_ANALISAR', '⚖️ Com a advogada'],   // inclui quem foi aprovado sem ela e precisa ratificar
  ['PITCH_LIBERADO', '🚀 Pré-aprovado real'],
  ['CAD_ENDERECO', '📍 Endereço'],
  ['CAD_RG', '🪪 RG frente/verso'],
  ['CAD_COMPROVANTE', '📜 Doc. do filho'],
  ['CAD_FINAL', '🏁 CPF / Nº RG / Nome'],
  ['AGUARDANDO_ASSINATURA', '✍️ Aguard. assinatura'],
  ['FINALIZADO', '🎉 Finalizado'],
  ['REPROVADO', '⛔ Reprovado'],
  ['NEGADO', '❌ Negados'],
  ['OUTROS', '❓ Outros'],
]

// Visão da VENDEDORA (não-admin): 25/08 — a análise saiu da mão dela e virou a Mesa da Advogada.
// Ela só recebe PRÉ-APROVADO REAL (cnis_aprovado=true, decidido pela advogada) em diante.
const COLUNAS_VENDEDOR = ['PITCH_LIBERADO', 'CAD_ENDERECO', 'CAD_RG', 'CAD_COMPROVANTE', 'CAD_FINAL', 'AGUARDANDO_ASSINATURA', 'FINALIZADO']

// Vendedoras do Retroativo: alem de so verem PRE-APROVADO REAL em diante,
// cada uma ve SO OS LEADS DELA (bf_agente_id = ela). A advogada entrega por rodizio.
const IDS_VENDEDORAS_RETROATIVO = [
  'a1d7dbfb-bc0d-46a3-b523-bfdc15aac0c9', // Leticia — entrou no setor 27/08
  'bb85a0f3-2d79-499e-8b19-6219bd0cef56', // Gislaine — entrou no setor 27/08
  'be98f268-314f-4114-acc3-7bb9ce7635fd', // Maryana Kodos
  '88929e81-7223-4754-a17b-1cd08f46195d', // Sthefany Mendes
  '9fbda3fe-22aa-4179-b1a7-005e99660c8d', // Duda (supervisoraeduarda25) — a que ja atuava no setor
  '4a1db9e1-0b10-48bc-85d6-23b728b9fd4f', // Luciane — 16/09: sem esta linha ela via o board INTEIRO (6.021 leads)
  // 01/10 — time de 24 meses. SEM ESTAS LINHAS a tela tenta baixar o board
  // inteiro (10.362 leads em 11 requisicoes) e fica carregando pra sempre:
  // foi o que travou as 5 hoje, e e o MESMO caso da Luciane em 16/09.
  '758a33f7-e5a2-4ef7-943a-dfe0ac72a387', // Supervisora Joana
  '64ced61d-fdae-4399-97c9-900c59120fff', // Supervisora Pamela
  'a3e94f8b-7e64-479b-9d72-1414afb83d1c', // nadiacajado
  '2c71c435-f5c2-49cf-984b-3629438045d2', // helenlima451
  '7ad37a1d-e5be-438c-9afd-982646d507d4', // juhferreira141988
  // 01/10: Agatha Barreto SAIU daqui — virou supervisora do time de 12,
  // nao e mais vendedora. Ela entrou em SUPERVISORAS_TIME acima.
]

// Painel do dia: SO o Bruno ve. Deliberadamente por ID e nao por role='admin' —
// ele pediu "so para eu ver", e admin e um papel que outras pessoas podem receber.
const ID_DONO_PAINEL = '906f9a57-bd4a-4b0e-9973-0968ef4f1e15' // Bruno Souza

// Quem opera o funil e precisa ver TODAS as colunas (incl. Pediu CNIS e Fila GERID),
// sem virar supervisora do resto (selos, filtros e nomes continuam de vendedora)
// 25/08: a Duda saiu daqui — virou vendedora do retroativo, com carteira propria.
// Se alguem precisar do funil inteiro sem ser admin, e aqui que entra.
const IDS_VE_TODAS_COLUNAS = []

// Motivos pra negar / não quis (perda comercial — NÃO mexe no cnis_aprovado, protege a auditoria)
const MOTIVOS_NEGAR = [
  ['ja_recebeu', 'Já recebeu SM'],
  ['empregada', 'Empregada no parto'],
  ['sem_contribuicao', 'Sem contribuição/carência'],
  ['fora_graca', 'Fora do período de graça'],
  ['nao_quis', 'Não quis / desistiu'],
  ['sem_resposta', 'Sem resposta'],
  ['duplicado', 'Duplicado'],
  ['outro', 'Outro'],
]

// 01/10 (Bruno): motivo da transferencia e MENU FECHADO, nao texto livre.
// Com texto cada supervisora escrevia de um jeito e no fim do mes nao dava pra
// contar nada. Os codigos aqui tem que ser os MESMOS da funcao do banco
// (retroativo_transferir_lead) — mexer num lado sem o outro derruba a validacao.
// 'venda_fora' e o caso que o Bruno pediu: a vendedora fechou por planilha e o
// lead esta com outra pessoa; passa pra ela, marca entregue hoje, e ela clica em
// "Fechei a venda" — o credito vai pra quem vendeu.
const MOTIVOS_TRANSF = [
  ['venda_fora', '💰 Venda por fora — ela já fechou por planilha'],
  ['cliente_pediu', '🗣️ Cliente pediu outra atendente'],
  ['folga', '🏖️ Vendedora de folga / afastada'],
  ['carga', '⚖️ Reequilibrar a carga do time'],
  ['sem_contato', '📵 Não conseguiu contato com a cliente'],
  ['ja_atendeu', '🤝 Já atendeu essa cliente antes'],
  ['outro', '✏️ Outro — escrever'],
]

// Faixa de datas a partir do preset (base: fuso do navegador = BRT do usuario)
function faixaData(preset, cDe, cAte) {
  const ini = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
  const hoje = ini(new Date())
  const amanha = new Date(hoje); amanha.setDate(amanha.getDate() + 1)
  if (preset === 'hoje') return { de: hoje, ate: amanha }
  if (preset === 'ontem') { const o = new Date(hoje); o.setDate(o.getDate() - 1); return { de: o, ate: hoje } }
  if (preset === '7d') { const d = new Date(hoje); d.setDate(d.getDate() - 6); return { de: d, ate: amanha } }
  if (preset === 'mes') { const d = new Date(hoje); d.setDate(d.getDate() - 29); return { de: d, ate: amanha } }
  if (preset === 'custom') {
    const de = cDe ? ini(cDe + 'T00:00:00') : null
    let ate = null
    if (cAte) { ate = ini(cAte + 'T00:00:00'); ate.setDate(ate.getDate() + 1) }
    return { de, ate }
  }
  return { de: null, ate: null }
}
const OPCOES_DATA = [['tudo', 'tudo'], ['hoje', 'hoje'], ['ontem', 'ontem'], ['7d', '7 dias'], ['mes', 'mês'], ['custom', 'personalizado']]

// 14/09 — o PostgREST deste projeto corta QUALQUER resposta em 1.000 linhas, sem erro
// e sem aviso. O board inteiro tem 5.440 leads, então a tela montava com as 1.000
// primeiras. Como a ordenação é por urgência (vermelho/amarelo antes), as colunas do
// FIM do funil — verdes e antigas — eram as primeiras a sumir:
//   Finalizado 87 -> 5 · Pré-aprovado real 214 -> 16 · Cad. final 7 -> 0 (sumia inteira)
//
// ATENÇÃO, ISSO JÁ ME PEGOU UMA VEZ: o limite é do SERVIDOR, não do cliente.
// Passar .limit(20000) NÃO resolve — testado em 14/09, a resposta volta
// "content-range: 0-999/5440" do mesmo jeito. Header Range também não pagina em RPC.
// O que funciona é OFFSET, que o supabase-js gera com .range(de, ate).
const PAGINA_BOARD = 1000
// 07/10 — era 12 (teto de 12 mil). O board da Duda tem 14.706 linhas, então ela
// perdia 2.706 leads TODA vez, em silêncio. Subi pra 25 (25 mil) com folga.
// Se um dia estourar de novo, o sintoma é o mesmo: colunas do fim do funil
// encolhendo sem motivo. Conferir com: select count(*) from mae_board2(<id>,...).
const MAX_PAGINAS = 25

// 07/10 — os filtros viviam só em useState. Qualquer remontagem da tela (troca de
// aba, refresh de token, volta de navegação) zerava tudo pro padrão e o número da
// coluna pulava sozinho: a vendedora via 42 virar 191 sem ninguém tocar em lead.
// Era isso que elas chamavam de "os leads estão sumindo". Agora cada filtro fica
// gravado no navegador dela. Navegador sem storage (aba anônima travada, política
// de privacidade) simplesmente não persiste — a tela continua funcionando igual.
const CHAVE_FILTROS = 'kr_retro_filtros_v1'
function lerFiltroSalvo(campo, padrao) {
  try {
    const bruto = window.localStorage.getItem(CHAVE_FILTROS)
    if (!bruto) return padrao
    const o = JSON.parse(bruto)
    return (o && o[campo] !== undefined && o[campo] !== null) ? o[campo] : padrao
  } catch (_) { return padrao }
}
function salvarFiltro(campo, valor) {
  try {
    const bruto = window.localStorage.getItem(CHAVE_FILTROS)
    const o = bruto ? JSON.parse(bruto) : {}
    o[campo] = valor
    window.localStorage.setItem(CHAVE_FILTROS, JSON.stringify(o))
  } catch (_) { /* sem storage: segue sem persistir */ }
}

// Busca a RPC do board inteira, em páginas. Para assim que uma página vier incompleta,
// então quem filtra por agente (vendedora, ~130 leads) continua fazendo 1 requisição só.
async function buscarBoardCompleto(rpc, params) {
  let todos = []
  for (let i = 0; i < MAX_PAGINAS; i++) {
    const de = i * PAGINA_BOARD
    const { data, error } = await supabase.rpc(rpc, params).range(de, de + PAGINA_BOARD - 1)
    if (error || !data || data.length === 0) break
    todos = todos.concat(data)
    if (data.length < PAGINA_BOARD) break
  }
  return todos
}

function primeiroNome(n) { return (n || 'cliente').split(' ')[0] }

// 21/09 — "16/09 13:03" pro carimbo de WhatsApp. Valor ruim no banco vira ''
// em vez de "Invalid Date" no meio do card.
// 22/09 (Bruno) — a vendedora liga sem saber onde a cliente trabalhou, e é
// justamente isso que ela precisa confirmar pra fechar. O robô do GERID já
// identificou o vínculo que gerou o direito; aqui ele vira texto de gente.
// Benefício e recolhimento não são empregador — dizer "você trabalhou na
// AUXILIO DOENCA" queima a ligação, então o rótulo muda.
function textoVinculo(v) {
  if (!v) return ''
  if (v.bruto) return v.bruto
  const periodo = v.inicio ? `${v.inicio} a ${v.fim}` : `até ${v.fim}`
  const quando = v.meses_antes_do_parto === 0
    ? 'no mês do parto'
    : `${v.meses_antes_do_parto} ${v.meses_antes_do_parto === 1 ? 'mês' : 'meses'} antes do parto`
  return `${periodo} · ${quando}`
}

function fmtCarimbo(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function fmtParado(min) {
  if (min < 60) return `${min} min`
  if (min < 1440) return `${Math.floor(min / 60)}h`
  return `${Math.floor(min / 1440)}d`
}

// Responder é no Chatwoot (a IA pausa sozinha quando humano responde lá) — mesmo padrão do Revisão BF.
const CHATWOOT_BASE = 'https://chat.grupookr.com.br' // migracao Chatwoot: instancia propria
const CHATWOOT_ACC = '1'
function linkChatwoot(c) {
  return c?.chatwoot_conversation_id ? `${CHATWOOT_BASE}/app/accounts/${CHATWOOT_ACC}/conversations/${c.chatwoot_conversation_id}` : null
}

const CORES = {
  vermelho: { border: '1px solid #f87171', background: 'rgba(248,113,113,.14)' },
  amarelo: { border: '1px solid #fbbf24', background: 'rgba(251,191,36,.12)' },
  frio: { border: '0.5px solid rgba(15,23,42,0.09)', background: '#e2e8f0', opacity: 0.8 },
  verde: { border: '0.5px solid #3B6D1140', background: 'rgba(52,211,153,.14)' },
  normal: { border: '0.5px solid rgba(15,23,42,0.08)', background: '#ffffff' },
}

const s = {
  title: { fontSize: 20, fontWeight: 500, color: '#0f172a', marginBottom: 4 },
  sub: { fontSize: 13, color: '#5b6b84', marginBottom: 14 },
  topo: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 },
  chip: { padding: '6px 14px', fontSize: 13, fontWeight: 500, borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.11)', background: '#ffffff', color: '#5b6b84', cursor: 'pointer' },
  chipOn: { background: '#f87171', color: '#232a37', borderColor: '#f87171' },
  kpi: { fontSize: 13, color: '#5b6b84', padding: '6px 12px', background: 'rgba(96,165,250,.10)', borderRadius: 8 },
  board: { display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 16, alignItems: 'flex-start' },
  col: { minWidth: 230, maxWidth: 230, background: '#e2e8f0', borderRadius: 10, padding: 8, flexShrink: 0 },
  colTitulo: { fontSize: 12, fontWeight: 600, color: '#5b6b84', padding: '4px 6px 8px', display: 'flex', justifyContent: 'space-between' },
  card: { borderRadius: 8, padding: '8px 10px', marginBottom: 8, cursor: 'pointer' },
  cardNome: { fontSize: 13, fontWeight: 600, color: '#0f172a' },
  cardMeta: { fontSize: 11, color: '#5b6b84', marginTop: 2 },
  geridBox: { marginBottom: 12, padding: 12, borderRadius: 10, background: 'rgba(52,211,153,.10)', border: '0.5px solid rgba(52,211,153,.45)' },
  geridLabel: { fontSize: 12, fontWeight: 700, color: '#059669', marginBottom: 6 },
  geridMotivo: { fontSize: 12, color: '#0f172a', background: '#ffffff', borderRadius: 6, padding: '6px 8px', marginBottom: 8 },
  geridImg: { width: '100%', maxHeight: 340, objectFit: 'contain', borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.14)', background: '#ffffff', display: 'block', cursor: 'zoom-in' },
  geridPe: { fontSize: 10, color: '#5b6b84', marginTop: 5 },
  buscaWrap: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' },
  buscaInput: { flex: '1 1 300px', maxWidth: 420, padding: '9px 12px', fontSize: 13, borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.18)', background: '#ffffff', color: '#0f172a', boxSizing: 'border-box' },
  buscaBtn: { padding: '9px 18px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', background: '#60a5fa', color: '#232a37', cursor: 'pointer' },
  buscaRes: { display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  buscaVazio: { fontSize: 13, color: '#5b6b84', padding: '10px 12px', background: '#f1f5f9', borderRadius: 10 },
  buscaCard: { flex: '1 1 320px', maxWidth: 460, padding: 12, borderRadius: 10, background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.14)' },
  buscaTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 },
  buscaTag: { fontSize: 10, fontWeight: 700, color: '#2563eb', background: 'rgba(96,165,250,.14)', borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' },
  buscaMotivo: { fontSize: 11, color: '#b45309', background: 'rgba(251,191,36,.12)', borderRadius: 6, padding: '4px 7px', marginTop: 6 },
  buscaComo: { fontSize: 10, color: '#94a3b8', marginTop: 6 },
  buscaAlerta: { fontSize: 11, fontWeight: 700, color: '#dc2626', background: 'rgba(248,113,113,.14)', borderRadius: 6, padding: '4px 7px', marginTop: 6 },
  buscaAbrir: { marginTop: 8, width: '100%', padding: '8px 10px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: 'none', background: '#34d399', color: '#232a37', cursor: 'pointer' },
  tagTrat: { fontSize: 10, background: 'rgba(52,211,153,.14)', color: '#059669', borderRadius: 6, padding: '2px 7px', display: 'inline-block', marginTop: 4, fontWeight: 600 },
  tagTratSup: { fontSize: 10, background: 'rgba(96,165,250,.10)', color: '#2563eb', borderRadius: 6, padding: '2px 7px', display: 'inline-block', marginTop: 4, fontWeight: 600 },
  tagNinguem: { fontSize: 10, background: 'rgba(248,113,113,.14)', color: '#dc2626', borderRadius: 6, padding: '2px 7px', display: 'inline-block', marginTop: 4, fontWeight: 600 },
  tagRespondeu: { fontSize: 10, background: 'rgba(251,191,36,.12)', color: '#b45309', borderRadius: 6, padding: '2px 7px', display: 'inline-block', marginTop: 4, marginRight: 4, fontWeight: 700 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 50, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '3vh 12px', overflowY: 'auto' },
  modal: { background: '#ffffff', borderRadius: 14, width: '100%', maxWidth: 640, padding: '1.25rem', maxHeight: '92vh', overflowY: 'auto' },
  ficha: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 13, background: '#f1f5f9', borderRadius: 10, padding: 12, marginBottom: 12 },
  destaque: { gridColumn: '1 / -1', background: 'rgba(251,191,36,.12)', border: '1px solid #C88A0040', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontWeight: 600 },
  anexoBox: { marginBottom: 12 },
  anexoLabel: { fontSize: 12, fontWeight: 600, color: '#5b6b84', marginBottom: 6 },
  anexoRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  anexoImg: { width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.11)' },
  anexoFile: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'rgba(96,165,250,.10)', border: '0.5px solid rgba(15,23,42,0.09)', borderRadius: 8, fontSize: 12, color: '#2563eb', textDecoration: 'none', fontWeight: 500 },
  msgs: { maxHeight: 200, overflowY: 'auto', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 10, padding: 10, marginBottom: 12, display: 'flex', flexDirection: 'column-reverse', gap: 6 },
  msgCliente: { alignSelf: 'flex-start', background: '#e2e8f0', borderRadius: '10px 10px 10px 2px', padding: '6px 10px', fontSize: 12, maxWidth: '85%' },
  msgAna: { alignSelf: 'flex-end', background: 'rgba(52,211,153,.14)', borderRadius: '10px 10px 2px 10px', padding: '6px 10px', fontSize: 12, maxWidth: '85%' },
  textarea: { width: '100%', minHeight: 80, padding: 10, fontSize: 13, borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.45)', boxSizing: 'border-box', marginBottom: 8, fontFamily: 'inherit' },
  btnEnviar: { width: '100%', padding: 12, background: '#34d399', color: '#232a37', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 10 },
  btnAprovar: { flex: 1, padding: 12, background: '#34d399', color: '#232a37', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnReprovar: { flex: 1, padding: 12, background: '#f87171', color: '#232a37', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnAvancar: { flex: 1, padding: 12, background: '#60a5fa', color: '#232a37', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnVoltar: { flex: 1, padding: 12, background: '#ffffff', color: '#5b6b84', border: '0.5px solid rgba(0,0,0,0.45)', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnFechar: { padding: '9px 12px', background: '#ffffff', color: '#5b6b84', border: '0.5px solid rgba(15,23,42,0.11)', borderRadius: 8, fontSize: 12, cursor: 'pointer' },
  btnNegar: { padding: '9px 12px', background: 'rgba(248,113,113,.14)', color: '#dc2626', border: '0.5px solid rgba(178,59,59,0.3)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  btnFechou: { padding: '10px 16px', background: '#059669', color: '#ffffff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  // 09/09: bloco que substitui o botao quando a venda JA esta marcada
  vendaFeita: { padding: '10px 12px', background: 'rgba(52,211,153,.12)', border: '0.5px solid rgba(59,109,17,0.3)', borderRadius: 10, fontSize: 12.5 },
  btnDesfazer: { marginTop: 8, padding: '8px 14px', background: '#ffffff', color: '#b45309', border: '1px solid #fbbf24', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  fechLinha: (r) => ({
    padding: '8px 10px', borderRadius: 8, marginBottom: 6, fontSize: 13,
    background: r === 'FECHOU' ? 'rgba(52,211,153,.12)' : r === 'NEGOU' ? 'rgba(248,113,113,.10)' : 'rgba(251,191,36,.14)',
    border: '0.5px solid rgba(15,23,42,0.07)',
  }),
  confWrap: { marginBottom: 12 },
  painelBtn: { padding: '8px 14px', background: '#0f172a', color: '#ffffff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  painelCorpo: { marginTop: 8, padding: 12, background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.12)', borderRadius: 10 },
  painelTopo: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 },
  painelKpis: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 },
  painelVazio: { fontSize: 13, color: '#5b6b84', padding: '10px 12px', background: '#f1f5f9', borderRadius: 8 },
  painelNota: { fontSize: 12, color: '#065f46', background: 'rgba(52,211,153,.12)', borderRadius: 8, padding: '6px 9px', marginTop: 8 },
  painelPe: { fontSize: 11, color: '#5b6b84', marginTop: 10, lineHeight: 1.45 },
  tab: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 },
  th: { textAlign: 'left', padding: '6px 8px', color: '#5b6b84', fontWeight: 600, borderBottom: '1px solid rgba(15,23,42,0.10)', whiteSpace: 'nowrap' },
  thNum: { textAlign: 'right', padding: '6px 8px', color: '#5b6b84', fontWeight: 600, borderBottom: '1px solid rgba(15,23,42,0.10)', whiteSpace: 'nowrap' },
  td: { padding: '6px 8px', color: '#0f172a', borderBottom: '0.5px solid rgba(15,23,42,0.06)', whiteSpace: 'nowrap' },
  tdNum: { padding: '6px 8px', color: '#0f172a', textAlign: 'right', borderBottom: '0.5px solid rgba(15,23,42,0.06)', whiteSpace: 'nowrap' },
  tdBom: { color: '#059669', fontWeight: 700 },
  tdRuim: { color: '#dc2626', fontWeight: 700 },
  confBtn: { padding: '8px 14px', background: '#ffffff', color: '#0f172a', border: '0.5px solid rgba(15,23,42,0.12)', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  confBox: { marginTop: 8, padding: 12, background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 11, maxWidth: 560 },
  confVazio: { marginTop: 8, padding: 12, background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 11, fontSize: 13, color: '#5b6b84', maxWidth: 560 },
  confLinha: (g) => ({
    display: 'flex', justifyContent: 'space-between', gap: 12,
    padding: '6px 8px', borderRadius: 7, marginBottom: 2, fontSize: 13,
    background: g === 'FURO' ? 'rgba(248,113,113,.12)' : g === 'ADVOGADA' ? 'rgba(52,211,153,.10)' : g === 'ENTRADA' ? '#f2f5fa' : 'transparent',
    color: g === 'FURO' ? '#b91c1c' : '#0f172a',
    fontWeight: g === 'ENTRADA' || g === 'FURO' ? 700 : 500,
  }),
  confNota: { marginTop: 8, fontSize: 11.5, color: '#5b6b84', lineHeight: 1.45 },
  seloMaquina: { marginTop: 6, display: 'inline-block', padding: '2px 8px', background: 'rgba(96,165,250,.10)', color: '#2563eb', border: '0.5px solid rgba(96,165,250,0.3)', borderRadius: 999, fontSize: 11, fontWeight: 600 },
  seloAdvogada: { marginTop: 6, display: 'block', padding: '3px 8px', background: 'rgba(52,211,153,.14)', color: '#065f46', border: '0.5px solid rgba(5,150,105,.25)', borderRadius: 7, fontSize: 11, fontWeight: 600, lineHeight: 1.35 },
  seloSeguro: { marginTop: 4, display: 'block', padding: '3px 8px', background: 'rgba(251,191,36,.16)', color: '#92400e', border: '0.5px solid rgba(180,83,9,.28)', borderRadius: 7, fontSize: 11, fontWeight: 700, lineHeight: 1.35 },
  // 21/09 — validacao de WhatsApp. SEM whatsapp e o caso que muda a acao do
  // vendedor (ligar em vez de mandar mensagem), entao ganha destaque de alerta.
  // COM whatsapp e confirmacao, fica discreto. Nao verificado nao aparece no
  // card: sao 7 mil leads sem validacao e o card viraria um mar de cinza.
  seloSemWhats: { marginTop: 4, display: 'block', padding: '3px 8px', background: 'rgba(220,38,38,.12)', color: '#991b1b', border: '0.5px solid rgba(220,38,38,.32)', borderRadius: 7, fontSize: 11, fontWeight: 700, lineHeight: 1.35 },
  seloTemWhats: { marginTop: 4, display: 'inline-block', padding: '1px 7px', background: 'rgba(5,150,105,.12)', color: '#059669', borderRadius: 7, fontSize: 10.5, fontWeight: 700 },
  vincBox: { marginTop: 8, marginBottom: 4, padding: '10px 12px', background: 'rgba(37,99,235,.06)', border: '0.5px solid rgba(37,99,235,.22)', borderRadius: 10 },
  vincTit: { fontSize: 11, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 },
  vincNome: { fontSize: 14, fontWeight: 700, color: '#0f172a', lineHeight: 1.35 },
  vincMeta: { fontSize: 12, color: '#475569', marginTop: 2, lineHeight: 1.45 },
  vincRegra: { fontSize: 11.5, color: '#065f46', marginTop: 6, lineHeight: 1.45 },
  fichaWhats: (cor, bg) => ({ display: 'inline-block', marginLeft: 6, padding: '1px 7px', borderRadius: 7, fontSize: 11, fontWeight: 700, color: cor, background: bg }),
  // 21/09 — CARIMBO HUMANO. Dado diferente do selo do robo acima, de proposito:
  // um e o validador automatico, o outro e o que a atendente constatou na pratica.
  // Ficam lado a lado porque o valor esta em poder comparar os dois.
  seloCarimbo: (cor, bg, borda) => ({ marginTop: 4, display: 'block', padding: '3px 8px', background: bg, color: cor, border: '0.5px solid ' + borda, borderRadius: 7, fontSize: 11, fontWeight: 700, lineHeight: 1.35 }),
  carimboBox: { marginBottom: 10, padding: '10px 12px', background: '#f8fafc', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 10 },
  carimboLabel: { fontSize: 11.5, fontWeight: 700, color: '#5b6b84', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 7 },
  carimboBtn: (ativo, cor, bg, borda) => ({ fontSize: 12, padding: '6px 12px', background: ativo ? bg : '#ffffff', color: ativo ? cor : '#5b6b84', border: '0.5px solid ' + (ativo ? borda : 'rgba(15,23,42,0.14)'), borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }),
  carimboPe: { marginTop: 7, fontSize: 11, color: '#64748b', lineHeight: 1.45 },
  painelMotivos: { marginTop: 8, padding: 12, background: '#f1f5f9', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 10 },
  motivosGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 },
  btnMotivo: { padding: '9px 10px', background: '#ffffff', color: '#dc2626', border: '0.5px solid rgba(178,59,59,0.35)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left' },
  // 01/10 — ficha reorganizada: as acoes viraram DOIS blocos com titulo
  // ("enquanto voce atende" / "como terminou"), e a troca de dona saiu do meio
  // delas pra linha do dono, la em cima. Antes eram 5 botoes soltos de 5 cores,
  // sem dizer o que era rotina e o que era excecao.
  donoLinha: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: '#f1f5f9', borderRadius: 9, padding: '9px 12px', marginBottom: 12, fontSize: 12.5, color: '#0f172a', flexWrap: 'wrap' },
  donoAcao: { fontSize: 11.5, fontWeight: 600, color: '#1d4ed8', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0, fontFamily: 'inherit' },
  bloco: { background: '#f8fafc', border: '0.5px solid rgba(15,23,42,0.09)', borderRadius: 10, padding: '11px 12px', marginBottom: 10 },
  blocoFecho: { background: '#ffffff', border: '0.5px solid rgba(5,150,105,.25)', borderRadius: 10, padding: '11px 12px', marginBottom: 10 },
  blocoLabel: { fontSize: 10.5, fontWeight: 700, color: '#5b6b84', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 9 },
  blocoLinha: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  blocoPe: { fontSize: 11, color: '#64748b', marginTop: 8, lineHeight: 1.45 },
  transfTit: { fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 2 },
  transfSub: { fontSize: 13, color: '#5b6b84', marginBottom: 14 },
  transfLabel: { fontSize: 12, fontWeight: 700, color: '#5b6b84', marginBottom: 6, marginTop: 10 },
  transfSelect: { width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.18)', background: '#ffffff', color: '#0f172a', boxSizing: 'border-box', fontFamily: 'inherit' },
  transfVazio: { fontSize: 12, color: '#b45309', background: 'rgba(251,191,36,.12)', borderRadius: 8, padding: '8px 10px', marginTop: 8 },
  transfCheck: { display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 14, padding: '10px 12px', background: '#f8fafc', border: '0.5px solid rgba(15,23,42,0.09)', borderRadius: 10, fontSize: 12.5, cursor: 'pointer' },
  transfCheckPe: { fontSize: 11, color: '#64748b', lineHeight: 1.45 },
  transfAviso: { fontSize: 11.5, color: '#92400e', background: 'rgba(251,191,36,.14)', borderRadius: 8, padding: '8px 10px', marginTop: 10, lineHeight: 1.45 },
}

export default function RevisaoIARetroativo() {
  const { profile } = useAuth()
  const ehAdmin = profile?.role === 'admin' || IDS_SUPERVISOR_BOARD.includes(profile?.id)
  const minhaOp = OPERACAO_USUARIOS[profile?.id] || null            // operação licenciada (null = KR)
  const ehSupervisorOp = SUPERVISORAS_OPERACAO.includes(profile?.id)
  const meuTime = SUPERVISORAS_TIME[profile?.id] || null
  const ehSupervisorTime = !!meuTime
  const ehSupervisor = ehAdmin || ehSupervisorOp || ehSupervisorTime
  const ehVendedor = !ehSupervisor
  // visão completa das colunas (não muda selos/filtros/nomes, só as colunas visíveis)
  const veTodasColunas = ehSupervisor || IDS_VE_TODAS_COLUNAS.includes(profile?.id)
  // vendedora do retroativo so enxerga a carteira dela
  const soMeusLeads = IDS_VENDEDORAS_RETROATIVO.includes(profile?.id)
  const ehDono = profile?.id === ID_DONO_PAINEL

  const [board, setBoard] = useState([])
  // 07/10 — contador de requisição: resposta atrasada não escreve na tela.
  const reqAtual = useRef(0)
  // 07/10 — lista do seletor de vendedora, guardada à parte do board.
  const [agentesConhecidos, setAgentesConhecidos] = useState([])

  // 07/10 — usarFiltro = useState que grava no navegador. Mesma assinatura do
  // useState, então o resto da tela não muda em nada. Fica aqui dentro do
  // componente de propósito: hook declarado fora não tem por que existir.
  const usarFiltro = (campo, padrao) => {
    const [v, setV] = useState(() => lerFiltroSalvo(campo, padrao))
    const set = (novo) => setV(anterior => {
      const valor = typeof novo === 'function' ? novo(anterior) : novo
      salvarFiltro(campo, valor)
      return valor
    })
    return [v, set]
  }

  const [soVermelhos, setSoVermelhos] = usarFiltro('soVermelhos', false)
  const [filtroAgente, setFiltroAgente] = usarFiltro('filtroAgente', '')
  const [filtroEntrada, setFiltroEntrada] = usarFiltro('filtroEntrada', 'tudo')
  const [filtroAtividade, setFiltroAtividade] = usarFiltro('filtroAtividade', 'mes')
  const [filtroAtendimento, setFiltroAtendimento] = usarFiltro('filtroAtendimento', 'todos')
  const [entradaDe, setEntradaDe] = usarFiltro('entradaDe', ''); const [entradaAte, setEntradaAte] = usarFiltro('entradaAte', '')
  const [ativDe, setAtivDe] = usarFiltro('ativDe', ''); const [ativAte, setAtivAte] = usarFiltro('ativAte', '')
  // 16/09 (Bruno): filtro por QUANDO A ADVOGADA ENTREGOU o lead pra vendedora.
  // Nasceu porque lead aprovado hoje com conversa de dias atras so era achado
  // adivinhando a data da ultima interacao. Padrao 'tudo' de proposito: se abrisse
  // em 'hoje', a vendedora perderia a carteira inteira ao abrir a tela.
  const [filtroEntrega, setFiltroEntrega] = usarFiltro('filtroEntrega', 'tudo')
  const [entregaDe, setEntregaDe] = usarFiltro('entregaDe', ''); const [entregaAte, setEntregaAte] = usarFiltro('entregaAte', '')
  const [lead, setLead] = useState(null)
  const [arrastando, setArrastando] = useState(null)
  const [mostrarMotivosNegar, setMostrarMotivosNegar] = useState(false)
  const [mensagens, setMensagens] = useState([])
  const [anexos, setAnexos] = useState([])
  const [carregandoAnexos, setCarregandoAnexos] = useState(false)
  // 28/08 (Bruno): o print do GERID que a advogada anexa na mesa dela tem que chegar
  // na vendedora. 97 leads ja entregues tinham print e a vendedora nao via nenhum —
  // o mae_board nao devolve esse campo. Busco sob demanda ao abrir a ficha, por LEAD_ID,
  // pra nao mexer no mae_board (que alimenta o board inteiro) nem pesar o carregamento.
  const [gerid, setGerid] = useState(null)
  const [geridCarregando, setGeridCarregando] = useState(false)
  // 09/09 (Bruno): DESFAZER o "Fechei a venda". A Gislaine marcou a Kessia por engano
  // e nao tinha como corrigir sozinha — virou pedido no chat e SQL na mao no banco de
  // producao, com o numero errado no fechamento do dia ate alguem reverter.
  // O mae_board nao devolve venda_fechada, e eu NAO mexo nele (alimenta o board inteiro,
  // mesma decisao do print do GERID acima): busco o status ao abrir a ficha.
  // Quem pode desfazer e decidido no BANCO (mae_venda_status) — a tela so obedece.
  const [venda, setVenda] = useState(null)
  const [vendaCarregando, setVendaCarregando] = useState(false)
  const [desfazendo, setDesfazendo] = useState(false)
  const [atualizandoConversa, setAtualizandoConversa] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [fechAberto, setFechAberto] = useState(false)
  const [fechamento, setFechamento] = useState(null)
  const [fechCarregando, setFechCarregando] = useState(false)
  // 28/08 (Bruno): painel do dia — SÓ ELE vê. Não é "admin": é este ID.
  // Se um dia outra pessoa precisar, é aqui que entra.
  const [painelAberto, setPainelAberto] = useState(false)
  const [painelDia, setPainelDia] = useState(null)     // { distribuicao: [], vendas: [] }
  const [painelCarregando, setPainelCarregando] = useState(false)
  const [painelData, setPainelData] = useState('')     // vazio = hoje

  const [confAberta, setConfAberta] = useState(false)
  const [conferencia, setConferencia] = useState(null)
  const [confCarregando, setConfCarregando] = useState(false)
  // 27/08 (Bruno): busca por CPF/telefone. A tela tem filtro de entrada e de atividade,
  // entao cliente antigo some do board e nao da pra achar rolando. A busca IGNORA os
  // filtros e varre o funil retroativo inteiro.
  const [busca, setBusca] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [achados, setAchados] = useState(null)   // null = ainda nao buscou
  // 01/10 (Bruno): supervisora passa um lead pra outra vendedora do time dela.
  // A trava de faixa esta no BANCO (retroativo_transferir_lead), nao aqui — a tela
  // so filtra a lista pra nao oferecer quem ela nao pode escolher.
  const [transf, setTransf] = useState(null)
  const [transfPara, setTransfPara] = useState('')
  const [transfCod, setTransfCod] = useState('')
  const [transfMotivo, setTransfMotivo] = useState('')
  const [transfHoje, setTransfHoje] = useState(false)
  const [transfVends, setTransfVends] = useState([])
  const [transferindo, setTransferindo] = useState(false)
  const podeTransferir = ehSupervisorTime || ehAdmin

  const carregarPainelDia = useCallback(async (data) => {
    setPainelCarregando(true)
    const p_dia = data || null   // null = hoje, resolvido no banco em BRT
    const [dist, vend] = await Promise.all([
      supabase.rpc('retroativo_distribuicao_dia', { p_dia }),
      supabase.rpc('retroativo_vendas_dia', { p_dia }),
    ])
    if (dist.error) console.error(dist.error)
    if (vend.error) console.error(vend.error)
    setPainelDia({ distribuicao: dist.data || [], vendas: vend.data || [] })
    setPainelCarregando(false)
  }, [])

  const abrirPainelDia = async () => {
    const abrir = !painelAberto
    setPainelAberto(abrir)
    if (abrir) await carregarPainelDia(painelData)
  }

  const abrirConferencia = async () => {
    const abrir = !confAberta
    setConfAberta(abrir)
    if (!abrir) return
    setConfCarregando(true)
    const r = await supabase.rpc('retroativo_conferencia', { p_de: null, p_ate: null })
    if (r.error) console.error(r.error)
    setConferencia(r.data || [])
    setConfCarregando(false)
  }

  const carregar = useCallback(async () => {
    if (!profile?.id) return
    const meuReq = ++reqAtual.current   // 07/10 — senha desta chamada (ver nota lá embaixo)
    // Funil retroativo é 100% automático e SEM DONO por lead. Se a vendedora filtrar
    // pelo próprio id, ela só enxerga A analisar/Pitch (sempre visíveis) e perde cadastro/
    // assinatura/finalizado (que são gated por dono). Ela vê o funil compartilhado inteiro,
    // já fatiado nas colunas dela pelo COLUNAS_VENDEDOR. Corte continua valendo.
    // 14/09 — a vendedora passou a filtrar NA RPC, não só no front.
    // Antes: p_agente = null pra todo mundo que não é admin, e o recorte dela era
    // feito no .filter() abaixo. Como o PostgREST corta a resposta em 1.000 linhas,
    // ela recebia as 1.000 primeiras de um board de 5.435 (que nem era dela) e só
    // então filtrava — sobravam 9 leads dos 130 dela, e 1 finalizado dos 28.
    // Medido em 14/09: mae_board(id) devolve EXATAMENTE o mesmo que
    // mae_board(null) + filtro no front (130 linhas, 28 finalizado, 68 pitch).
    // O comentário antigo dizia que filtrar pelo id fazia ela perder colunas —
    // não é mais verdade. O .filter() do front continua abaixo como rede de segurança.
    const p_agente = ehAdmin ? (filtroAgente || null) : (soMeusLeads ? profile.id : null)
    const fe = faixaData(filtroEntrada, entradaDe, entradaAte)
    const fa = faixaData(filtroAtividade, ativDe, ativAte)
    const fg = faixaData(filtroEntrega, entregaDe, entregaAte)
    // 16/09 — mae_board2 = a mae_board de sempre com DUAS mudanças:
    //   1) Atividade voltou a olhar SÓ ultima_interacao (a conversa da cliente).
    //      O GREATEST que estava lá incluía bf_atribuido_em, que a supervisora move
    //      a cada transferência: 190 dos 519 aprovados apareciam como "atividade hoje"
    //      sem ninguém ter falado nada, com defasagem de até 15 dias.
    //   2) p_entrega_de/ate: quando a ADVOGADA liberou o lead pra vendedora.
    // A mae_board antiga continua no banco, intacta — reverter = trocar o nome aqui.
    const data = await buscarBoardCompleto('mae_board2', {
      p_agente,
      p_entrada_de: fe.de ? fe.de.toISOString() : null,
      p_entrada_ate: fe.ate ? fe.ate.toISOString() : null,
      p_ativ_de: fa.de ? fa.de.toISOString() : null,
      p_ativ_ate: fa.ate ? fa.ate.toISOString() : null,
      p_entrega_de: fg.de ? fg.de.toISOString() : null,
      p_entrega_ate: fg.ate ? fg.ate.toISOString() : null,
    })
    // 07/10 — RESPOSTA ATRASADA. Este é o bug do "o filtro some e depois volta
    // sozinho". Sem filtro o board tem 14.706 linhas = 15 idas ao servidor, uns
    // 10 segundos. Com filtro tem ~300 = meio segundo. Então:
    //   t=0  abre a tela sem filtro  -> dispara a busca LENTA
    //   t=1  escolhe a vendedora     -> busca RÁPIDA volta, tela certa
    //   t=10 a busca LENTA termina   -> setBoard joga TUDO por cima  (filtro "sumiu")
    //   t=45 o timer roda de novo    -> volta ao certo              ("corrigiu sozinho")
    // A correção é descartar a resposta que chegou atrasada: cada chamada leva um
    // número, e só a mais recente tem direito de escrever na tela.
    if (meuReq !== reqAtual.current) return

    // Operação licenciada só enxerga os leads da própria operação
    const visiveis = (data || []).filter(l =>
      (!minhaOp || (l.operacao || 'kr') === minhaOp) &&
      (!meuTime || meuTime.includes(l.bf_agente_id)) &&
      (!soMeusLeads || l.bf_agente_id === profile?.id))
    setBoard(visiveis)

    // 07/10 — a lista do seletor saía do próprio board. Ao filtrar por uma
    // vendedora o board só tinha os leads dela, então o seletor passava a listar
    // só ela e não dava pra trocar direto pra outra: tinha que voltar em "Todos
    // os agentes" primeiro. Agora a lista completa é guardada enquanto NÃO há
    // filtro e reaproveitada depois, então o seletor nunca encolhe.
    if (!filtroAgente) {
      const completos = []
      visiveis.forEach(l => {
        if (l.bf_agente_id && l.agente_nome && !completos.some(a => a.id === l.bf_agente_id)) {
          completos.push({ id: l.bf_agente_id, nome: l.agente_nome })
        }
      })
      if (completos.length) setAgentesConhecidos(completos.sort((a, b) => a.nome.localeCompare(b.nome)))
    }
  }, [profile?.id, ehAdmin, minhaOp, soMeusLeads, filtroAgente, filtroEntrada, filtroAtividade, entradaDe, entradaAte, ativDe, ativAte, filtroEntrega, entregaDe, entregaAte])

  useEffect(() => {
    carregar()
    const timer = setInterval(carregar, 45000)
    return () => clearInterval(timer)
  }, [carregar])

  // 07/10 — usa a lista guardada (completa). Se ainda não carregou nenhuma vez
  // sem filtro, cai no board atual, que é o comportamento antigo.
  const agentes = agentesConhecidos.length ? agentesConhecidos : (() => {
    const acc = []
    board.forEach(l => {
      if (l.bf_agente_id && l.agente_nome && !acc.some(a => a.id === l.bf_agente_id)) {
        acc.push({ id: l.bf_agente_id, nome: l.agente_nome })
      }
    })
    return acc
  })()

  const totalVermelhos = board.filter(l => l.cor === 'vermelho').length
  const filaAnalista = board.filter(l => l.coluna === 'A_ANALISAR').length
  const finalizadas = board.filter(l => l.coluna === 'FINALIZADO').length
  const semDono = board.filter(l => !l.bf_em_tratamento && (l.cor === 'vermelho' || l.cor === 'amarelo') && l.coluna !== 'FINALIZADO' && l.coluna !== 'REPROVADO').length

  // Selo de tratamento no card, respeitando quem está olhando
  function seloTratamento(l) {
    if (l.bf_em_tratamento) {
      const aviso = l.cliente_respondeu ? <span style={s.tagRespondeu}>💬 cliente respondeu</span> : null
      if (ehSupervisor) {
        return <>{aviso}<span style={s.tagTratSup}>🟢 {l.agente_nome ? `${primeiroNome(l.agente_nome)} tratando` : 'em tratamento'}</span></>
      }
      return <>{aviso}<span style={s.tagTrat}>🟢 Você está tratando</span></>
    }
    if (ehSupervisor && (l.cor === 'vermelho' || l.cor === 'amarelo') && l.coluna !== 'FINALIZADO' && l.coluna !== 'REPROVADO') {
      return <span style={s.tagNinguem}>⚪ ninguém pegou</span>
    }
    return null
  }

  // Recarrega mensagens + anexos de um lead (usado ao abrir, no auto-refresh e no botão)
  const recarregarConversa = useCallback(async (l, comLoading) => {
    if (!l) return
    if (comLoading) setAtualizandoConversa(true)
    try {
      // Fonte primaria: espelho ao vivo do Chatwoot (inclui msgs digitadas pela supervisora na mao)
      let usouChatwoot = false
      if (l.chatwoot_conversation_id) {
        const { data: res } = await supabase.functions.invoke('bf-conversa', {
          body: { conversation_id: l.chatwoot_conversation_id, limit: 30 },
        })
        if (res?.ok) {
          setMensagens(res.mensagens || [])
          setAnexos(res.anexos || [])
          usouChatwoot = true
        }
      }
      // Fallback: Chatwoot fora do ar ou lead sem conversation_id -> usa o banco
      if (!usouChatwoot) {
        const { data } = await supabase.rpc('bf_mensagens', { p_lead_id: l.id, p_limit: 30 })
        setMensagens(data || [])
      }
    } finally { if (comLoading) setAtualizandoConversa(false) }
  }, [])

  async function buscarCliente() {
    const t = (busca || '').replace(/\D/g, '')
    if (t.length < 8) { alert('Digite o CPF completo ou pelo menos os 8 últimos dígitos do telefone.'); return }
    setBuscando(true)
    const { data, error } = await supabase.rpc('mae_buscar_lead', { p_termo: busca })
    setBuscando(false)
    if (error) { alert('Erro na busca: ' + error.message); return }
    setAchados(data || [])
  }
  function limparBusca() { setBusca(''); setAchados(null) }

  async function carregarGerid(leadId) {
    setGerid(null)
    if (!leadId) return
    setGeridCarregando(true)
    const { data } = await supabase.rpc('gerid_print_do_lead', { p_lead_id: leadId })
    setGeridCarregando(false)
    setGerid((data && data[0]) || null)   // sem print => null, a ficha nem mostra o bloco
  }

  async function carregarVenda(leadId) {
    setVenda(null)
    if (!leadId) return
    setVendaCarregando(true)
    const { data } = await supabase.rpc('mae_venda_status', { p_lead_id: leadId })
    setVendaCarregando(false)
    setVenda(data || null)
  }

  const desfazerVenda = async (l) => {
    if (!window.confirm('Desfazer a marcacao de VENDA FECHADA dessa cliente?\n\nEla volta a ficar em aberto no seu fechamento do dia. Nao marca como negada.')) return
    setDesfazendo(true)
    const r = await supabase.rpc('mae_venda_desfazer', { p_lead_id: l.id, p_motivo: null })
    setDesfazendo(false)
    if (r.error || !r.data?.ok) { alert('Nao deu pra desfazer: ' + (r.error?.message || r.data?.erro || 'erro')); return }
    await carregarVenda(l.id)
    carregar()
  }

  const abrirLead = async (l) => {
    setLead(l)
    carregarGerid(l && l.id)
    carregarVenda(l && l.id)
    setMensagens([])
    setAnexos([])
    setCarregandoAnexos(true)
    try { await recarregarConversa(l, false) } finally { setCarregandoAnexos(false) }
  }

  // Auto-refresh da conversa aberta: recarrega a cada 8s enquanto o modal estiver aberto
  useEffect(() => {
    if (!lead) return
    const t = setInterval(() => { recarregarConversa(lead, false) }, 8000)
    return () => clearInterval(t)
  }, [lead, recarregarConversa])

  const fechar = () => { setLead(null); setMensagens([]); setAnexos([]); setGerid(null); setVenda(null) }

  // 01/10 — monta a lista: so as vendedoras do MEU time, fora eu mesma e fora quem ja
  // tem o lead. Admin ve os dois times. Nao busco em maismae.bf_agentes porque o front
  // nao tem permissao nesse schema — uso as listas que ja estao no topo deste arquivo.
  const abrirTransferir = async (l) => {
    setTransf(l); setTransfPara(''); setTransfCod(''); setTransfMotivo(''); setTransfHoje(false); setTransfVends([])
    const base = meuTime || (ehAdmin ? Object.values(SUPERVISORAS_TIME).flat() : [])
    const ids = base.filter(id => id !== profile?.id && id !== l.bf_agente_id)
    if (ids.length === 0) return
    const { data } = await supabase.from('profiles')
      .select('id, nome').in('id', ids).eq('ativo', true).order('nome')
    setTransfVends(data || [])
  }

  // so "Outro" exige texto — nos demais o codigo ja diz tudo
  const transfOk = transfPara && transfCod && (transfCod !== 'outro' || transfMotivo.trim())

  const confirmarTransferir = async () => {
    if (!transf || !transfOk || transferindo) return
    setTransferindo(true)
    const { data, error } = await supabase.rpc('retroativo_transferir_lead', {
      p_lead_id: transf.id,
      p_para: transfPara,
      p_motivo_codigo: transfCod,
      p_motivo_texto: transfMotivo.trim() || null,
      p_marcar_entregue_hoje: transfHoje,
    })
    setTransferindo(false)
    if (error || !data?.ok) {
      alert('Não deu pra transferir: ' + (error?.message || data?.erro || 'erro')); return
    }
    alert(`✅ ${transf.nome || 'Cliente'} passou de ${data.de || 'sem dono'} para ${data.para}.`
      + (data.marcado_entregue_hoje ? '\nMarcado como entregue hoje.' : ''))
    setTransf(null); fechar(); carregar()
  }

  // Pega o card (marca selo) sem mandar mensagem
  // 21/09 — carimbo do atendimento por WhatsApp. TRES estados: nada, 'iniciado'
  // e 'sem_whats'. Clicar no botao que ja esta aceso DESMARCA; clicar no outro
  // TROCA. A RPC e toggle, entao a tela so manda o status desejado.
  // Isto NAO encosta na IA nem no "estou nesse" — sao carimbos independentes.
  const [carimbando, setCarimbando] = useState(false)
  const marcarWhats = async (l, status) => {
    if (carimbando) return
    setCarimbando(true)
    try {
      const { data, error } = await supabase.rpc('retroativo_marcar_whats', {
        p_lead_id: l.id, p_status: status, p_agente_id: profile?.id || null,
      })
      if (error) { alert('Não deu pra marcar: ' + error.message); return }
      if (data && data.ok === false) { alert(data.erro || 'Não deu pra marcar.'); return }
      const novo = (data && data.status) || null
      const quando = novo ? new Date().toISOString() : null
      setLead(x => (x ? { ...x, whats_marcado: novo, whats_iniciado_em: quando } : x))
      setBoard(b => b.map(x => (x.id === l.id ? { ...x, whats_marcado: novo, whats_iniciado_em: quando } : x)))
    } finally { setCarimbando(false) }
  }

  const marcarTratando = async (l) => {
    if (!l) return
    await supabase.rpc('bf_marcar_tratando', { p_lead_id: l.id, p_agente_id: profile.id })
    setLead({ ...l, bf_em_tratamento: true, cliente_respondeu: false })
    carregar()
  }
  // Solta o card (tira o selo)
  const soltarTratamento = async (l) => {
    if (!l) return
    await supabase.rpc('bf_soltar_tratamento', { p_lead_id: l.id })
    setLead({ ...l, bf_em_tratamento: false, cliente_respondeu: false })
    carregar()
  }

  const decidirCnis = async (aprovado) => {
    if (!lead || enviando) return
    let motivo = null
    if (!aprovado) {
      motivo = window.prompt('Motivo da reprovação do CNIS:')
      if (!motivo) return
    }
    setEnviando(true)
    try {
      const { error } = await supabase.rpc('mae_aprovar_cnis', {
        p_lead_id: lead.id, p_aprovado: aprovado, p_analista: profile.id, p_motivo: motivo,
      })
      if (error) { alert('Erro: ' + (error.message || 'tente de novo')) }
      else { fechar(); carregar() }
    } finally { setEnviando(false) }
  }

  // Move o lead de coluna do cadastro na mao (sem acionar a IA). Ja marca em tratamento + loga.
  const avancarEtapa = async (direcao) => {
    if (!lead || enviando) return
    setEnviando(true)
    try {
      const { data, error } = await supabase.rpc('mae_avancar_etapa', {
        p_lead_id: lead.id, p_agente_id: profile.id, p_direcao: direcao,
      })
      if (error || !data?.ok) { alert('Nao deu pra mover: ' + (error?.message || data?.erro || 'erro')); return }
      fechar(); carregar()
    } finally { setEnviando(false) }
  }

  const fecharVenda = async (id) => {
    if (!window.confirm('Marcar essa cliente como VENDA FECHADA?')) return
    const r = await supabase.rpc('mae_vendedora_fechou', { p_lead_id: id, p_vendedora: profile?.id })
    if (r.error || !r.data?.ok) { alert('Não deu: ' + (r.error?.message || r.data?.erro || 'erro')); return }
    fechar(); carregar()
    // o status fica carregado pra proxima vez que a ficha abrir mostrar o desfazer
    carregarVenda(id)
  }

  const abrirFechamento = async () => {
    const abrir = !fechAberto
    setFechAberto(abrir)
    if (!abrir) return
    setFechCarregando(true)
    const r = await supabase.rpc('retroativo_fechamento_dia', { p_dia: null })
    if (r.error) console.error(r.error)
    setFechamento(r.data || [])
    setFechCarregando(false)
  }

  const negarLead = async (id, motivo) => {
    const { data, error } = await supabase.rpc('mae_negar', { p_lead_id: id, p_agente_id: profile?.id, p_motivo: motivo })
    if (error || !data?.ok) { alert('Erro ao negar: ' + (error?.message || data?.erro || 'erro')); return }
    setMostrarMotivosNegar(false); fechar(); carregar()
  }
  // Arrastar card pra qualquer coluna. Reprovado/Negados pedem motivo; Outros não recebe.
  const soltarNaColuna = async (col) => {
    const id = arrastando; setArrastando(null)
    if (!id || col === 'OUTROS') return
    if (col === 'NEGADO') { const m = window.prompt('Motivo pra negar / não quis:'); if (m) negarLead(id, m); return }
    if (col === 'REPROVADO') {
      const m = window.prompt('Motivo da reprovação do CNIS:'); if (!m) return
      const { error } = await supabase.rpc('mae_aprovar_cnis', { p_lead_id: id, p_aprovado: false, p_analista: profile?.id, p_motivo: m })
      if (error) alert('Erro: ' + error.message); else carregar()
      return
    }
    const { data, error } = await supabase.rpc('mae_mover_coluna', { p_lead_id: id, p_agente_id: profile?.id, p_coluna: col })
    if (error || !data?.ok) { alert('Não moveu: ' + (error?.message || data?.erro || 'erro')); return }
    carregar()
  }

  const passaAtend = (l) => filtroAtendimento === 'todos' || (filtroAtendimento === 'respondido' ? l.humano_respondeu : !l.humano_respondeu)
  // 07/10 — separei o que a coluna TEM do que ela MOSTRA. Antes o título contava
  // board.filter(coluna) cru (sem os filtros de cor/atendimento) e os cards saíam
  // de outra conta, cortada em 60. Dava dois números diferentes na mesma coluna e
  // ninguém sabia qual valia.
  // Subi o corte de 60 pra 250: com 60 a coluna escondia mais do que mostrava
  // (203 leads, 60 na tela) e o título virava "60 de 203", que confundiu o time.
  // Agora o título traz só o número real e, se ainda sobrar card escondido, o
  // aviso aparece no PÉ da coluna, em texto, onde não se confunde com contagem.
  const LIMITE_CARDS = 250
  const totalDe = (col) => board.filter(l =>
    l.coluna === col && (!soVermelhos || l.cor === 'vermelho') && passaAtend(l)
    // vendedora: em "A analisar" só vê os que travaram (precisa de ajuda)
    && (!(ehVendedor && !veTodasColunas && col === 'A_ANALISAR') || l.cor === 'vermelho')
  ).length
  const cardsDe = (col) => board.filter(l =>
    l.coluna === col && (!soVermelhos || l.cor === 'vermelho') && passaAtend(l)
    && (!(ehVendedor && !veTodasColunas && col === 'A_ANALISAR') || l.cor === 'vermelho')
  ).slice(0, LIMITE_CARDS)
  const colunasVisiveis = veTodasColunas ? COLUNAS : COLUNAS.filter(([k]) => COLUNAS_VENDEDOR.includes(k))

  return (
    <div>
      <div style={s.title}>🤱 Revisão IA — Retroativo</div>
      <div style={s.sub}>{ehVendedor && !veTodasColunas
        ? 'Seus clientes: CNIS já enviado em diante. 🤖 = pré-aprovada pela máquina (confira de perto). Em "A analisar" aparecem só os que travaram e precisam de você.'
        : 'Funil das mães do retroativo. Vermelho = travou agora; cinza = backlog frio.'}</div>

      <div style={s.topo}>
        <button style={{ ...s.chip, ...(soVermelhos ? s.chipOn : {}) }} onClick={() => setSoVermelhos(v => !v)}>
          🔴 Só vermelhos ({totalVermelhos})
        </button>
        <select style={s.chip} value={filtroEntrada} onChange={e => setFiltroEntrada(e.target.value)} title="Data de entrada do lead">
          {OPCOES_DATA.map(([v, l]) => <option key={v} value={v}>Entrada: {l}</option>)}
        </select>
        {filtroEntrada === 'custom' && (<>
          <input type="date" style={s.chip} value={entradaDe} onChange={e => setEntradaDe(e.target.value)} />
          <input type="date" style={s.chip} value={entradaAte} onChange={e => setEntradaAte(e.target.value)} />
        </>)}
        <select style={s.chip} value={filtroAtividade} onChange={e => setFiltroAtividade(e.target.value)} title="Última atividade">
          {OPCOES_DATA.map(([v, l]) => <option key={v} value={v}>Atividade: {l}</option>)}
        </select>
        {filtroAtividade === 'custom' && (<>
          <input type="date" style={s.chip} value={ativDe} onChange={e => setAtivDe(e.target.value)} />
          <input type="date" style={s.chip} value={ativAte} onChange={e => setAtivAte(e.target.value)} />
        </>)}
        <select style={s.chip} value={filtroEntrega} onChange={e => setFiltroEntrega(e.target.value)} title="Quando a advogada entregou o lead para a vendedora">
          {OPCOES_DATA.map(([v, l]) => <option key={v} value={v}>⚖️ Entregue: {l}</option>)}
        </select>
        {filtroEntrega === 'custom' && (<>
          <input type="date" style={s.chip} value={entregaDe} onChange={e => setEntregaDe(e.target.value)} />
          <input type="date" style={s.chip} value={entregaAte} onChange={e => setEntregaAte(e.target.value)} />
        </>)}
        <select style={s.chip} value={filtroAtendimento} onChange={e => setFiltroAtendimento(e.target.value)} title="Atendimento humano">
          <option value="todos">Atendimento: todos</option>
          <option value="respondido">✅ Já respondido</option>
          <option value="sem">⚠️ Sem resposta</option>
        </select>
        <span style={s.kpi}>🔍 Fila do analista: <b>{filaAnalista}</b></span>
        <span style={s.kpi}>Total: <b>{board.length}</b></span>
        <span style={s.kpi}>Finalizadas: <b>{finalizadas}</b></span>
        {ehSupervisor && <span style={s.kpi}>⚪ Sem ninguém: <b>{semDono}</b></span>}
        {ehAdmin && (
          <select style={s.chip} value={filtroAgente} onChange={e => setFiltroAgente(e.target.value)}>
            <option value="">Todos os agentes</option>
            {agentes.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        )}
        <button style={s.chip} onClick={carregar}>🔄 Atualizar</button>
      </div>

      {/* Busca por CPF ou telefone — varre o funil inteiro, ignora os filtros acima */}
      <div style={s.buscaWrap}>
        <input
          style={s.buscaInput}
          value={busca}
          placeholder="🔎 Achar cliente: cole o CPF ou o telefone"
          onChange={e => setBusca(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') buscarCliente() }}
        />
        <button style={s.buscaBtn} onClick={buscarCliente} disabled={buscando}>
          {buscando ? 'Buscando...' : 'Buscar'}
        </button>
        {achados !== null && <button style={s.chip} onClick={limparBusca}>limpar</button>}
      </div>

      {achados !== null && (
        <div style={s.buscaRes}>
          {achados.length === 0
            ? <div style={s.buscaVazio}>Nenhuma cliente com esse CPF ou telefone no funil do Retroativo.</div>
            : achados.map(c => (
              <div key={c.id} style={s.buscaCard}>
                <div style={s.buscaTopo}>
                  <span style={s.cardNome}>{c.nome || 'Cliente +Mais Mãe'}</span>
                  <span style={s.buscaTag}>{c.coluna}</span>
                </div>
                <div style={s.cardMeta}>
                  {c.tel} · CPF {c.cpf || '—'} · parada há {c.minutos_parado >= 60
                    ? Math.floor(c.minutos_parado / 60) + 'h' + String(c.minutos_parado % 60).padStart(2, '0')
                    : c.minutos_parado + 'min'}
                </div>
                <div style={s.cardMeta}>
                  {c.agente_nome ? '👤 com ' + c.agente_nome : '⚪ sem ninguém'}
                  {c.entregue_vendedora_em ? ' · entregue à vendedora' : ''}
                  {c.cliente_id_crm ? ' · ✅ já está no CRM' : ''}
                </div>
                {(c.advogada_motivo || c.motivo_desqualificacao) && (
                  <div style={s.buscaMotivo}>{c.advogada_motivo || c.motivo_desqualificacao}</div>
                )}
                {/* CPF gravado torto: a busca acha assim mesmo, mas avisa — senao a consulta
                    no PromoBank nunca roda e ninguem entende por que a cliente travou. */}
                <div style={/⚠️/.test(c.achou_por || '') ? s.buscaAlerta : s.buscaComo}>
                  achou por {c.achou_por}
                </div>
                <button style={s.buscaAbrir} onClick={() => abrirLead(c)}>Abrir ficha</button>
              </div>
            ))}
        </div>
      )}

      {/* PAINEL DO DIA — só o Bruno. Distribuição conta pelo dia em que a advogada
          aprovou e o rodízio entregou (bf_atribuido_em), NÃO pela chegada do lead.
          Venda conta por venda_fechada_em e credita quem fechou. */}
      {ehDono && (
        <div style={s.confWrap}>
          <button style={s.painelBtn} onClick={abrirPainelDia}>
            {painelAberto ? '▾' : '▸'} 📊 Meu painel do dia — distribuição e vendas
          </button>
          {painelAberto && (
            <div style={s.painelCorpo}>
              <div style={s.painelTopo}>
                <input type="date" style={s.chip} value={painelData}
                  onChange={e => { setPainelData(e.target.value); carregarPainelDia(e.target.value) }} />
                {painelData && (
                  <button style={s.chip} onClick={() => { setPainelData(''); carregarPainelDia('') }}>hoje</button>
                )}
                <button style={s.chip} onClick={() => carregarPainelDia(painelData)}>🔄 Atualizar</button>
                {painelCarregando && <span style={{ fontSize: 12, color: '#5b6b84' }}>carregando...</span>}
              </div>

              {painelDia && (() => {
                const d = painelDia.distribuicao, v = painelDia.vendas
                const totalDist = d.reduce((s2, x) => s2 + Number(x.recebidos || 0), 0)
                const totalPegou = d.reduce((s2, x) => s2 + Number(x.pegou || 0), 0)
                const totalVendas = v.reduce((s2, x) => s2 + Number(x.vendas || 0), 0)
                const vendasDe = n => (v.find(x => x.vendedora === n) || {}).vendas || 0
                return (
                  <>
                    <div style={s.painelKpis}>
                      <span style={s.kpi}>📥 Distribuídos hoje: <b>{totalDist}</b></span>
                      <span style={s.kpi}>✋ Pegaram: <b>{totalPegou}</b>{totalDist ? ' (' + Math.round(100 * totalPegou / totalDist) + '%)' : ''}</span>
                      <span style={{ ...s.kpi, background: 'rgba(52,211,153,.16)', color: '#065f46', fontWeight: 700 }}>
                        💰 Vendas: <b>{totalVendas}</b>
                      </span>
                      <span style={s.kpi}>📈 Conversão: <b>{totalDist ? (100 * totalVendas / totalDist).toFixed(1) + '%' : '—'}</b></span>
                    </div>

                    {d.length === 0 && <div style={s.painelVazio}>Nada distribuído nesse dia.</div>}
                    {d.length > 0 && (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={s.tab}>
                          <thead><tr>
                            <th style={s.th}>vendedora</th>
                            <th style={s.thNum}>recebeu</th>
                            <th style={s.thNum}>pegou</th>
                            <th style={s.thNum}>não pegou</th>
                            <th style={s.thNum}>h até pegar</th>
                            <th style={s.thNum}>vendas</th>
                            <th style={s.thNum}>conversão</th>
                            <th style={s.thNum}>em aberto</th>
                            <th style={s.thNum}>1ª → última</th>
                          </tr></thead>
                          <tbody>
                            {d.map(x => {
                              const vd = Number(vendasDe(x.vendedora))
                              const rec = Number(x.recebidos || 0)
                              const naoPegou = Number(x.ninguem_pegou || 0)
                              return (
                                <tr key={x.vendedora}>
                                  <td style={s.td}>{x.vendedora}</td>
                                  <td style={s.tdNum}>{rec}</td>
                                  <td style={s.tdNum}>{x.pegou}</td>
                                  {/* quem recebeu e não pegou nada é o que trava o funil */}
                                  <td style={{ ...s.tdNum, ...(naoPegou === rec && rec > 0 ? s.tdRuim : {}) }}>{naoPegou}</td>
                                  <td style={s.tdNum}>{x.h_ate_pegar != null ? Number(x.h_ate_pegar).toFixed(1) + 'h' : '—'}</td>
                                  <td style={{ ...s.tdNum, ...(vd > 0 ? s.tdBom : {}) }}>{vd}</td>
                                  <td style={s.tdNum}>{rec ? (100 * vd / rec).toFixed(0) + '%' : '—'}</td>
                                  <td style={s.tdNum}>{x.em_aberto}</td>
                                  <td style={s.tdNum}>{String(x.primeiro || '').slice(0, 5)} → {String(x.ultimo || '').slice(0, 5)}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* vendas de quem NAO recebeu no dia nao aparecem na tabela acima */}
                    {v.filter(x => !d.some(y => y.vendedora === x.vendedora)).map(x => (
                      <div key={x.vendedora} style={s.painelNota}>
                        💰 {x.vendedora}: {x.vendas} venda(s) hoje de cliente recebido em outro dia
                      </div>
                    ))}
                    <div style={s.painelPe}>
                      Distribuição conta pelo dia em que a advogada aprovou e o rodízio entregou — não pela data de chegada do lead.
                      Venda conta por quem fechou.
                    </div>
                  </>
                )
              })()}
            </div>
          )}
        </div>
      )}

      {ehAdmin && (
        <div style={s.confWrap}>
          <button style={s.confBtn} onClick={abrirConferencia}>
            {confAberta ? '▾' : '▸'} 🔍 Conferência do funil — o que passou no PromoBank e o que falta
          </button>
          {confAberta && (
            confCarregando ? (
              <div style={s.confVazio}>Carregando…</div>
            ) : (
              <div style={s.confBox}>
                {(conferencia || []).map(l => (
                  <div key={l.ordem} style={s.confLinha(l.grupo)}>
                    <span>{l.etapa}</span>
                    <b>{l.qtd}</b>
                  </div>
                ))}
                <div style={s.confNota}>
                  A cliente só chega na advogada depois de passar no PromoBank.
                  Se a linha do <b>furo</b> for maior que zero, tem gente com CPF que o robô deixou pra trás.
                </div>
              </div>
            )
          )}
        </div>
      )}

      <div style={s.confWrap}>
        <button style={s.confBtn} onClick={abrirFechamento}>
          {fechAberto ? '▾' : '▸'} 📒 Fechamento do dia — fechou / negou / sem resposta
        </button>
        {fechAberto && (
          fechCarregando ? (
            <div style={s.confVazio}>Carregando…</div>
          ) : !(fechamento || []).length ? (
            <div style={s.confVazio}>Nada registrado hoje ainda.</div>
          ) : (
            <div style={{ ...s.confBox, maxWidth: 780 }}>
              {(fechamento || []).map((f, i) => (
                <div key={i} style={s.fechLinha(f.resultado)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span><b>{f.vendedora}</b> · {f.resultado === 'FECHOU' ? '✅' : f.resultado === 'NEGOU' ? '❌' : '🔁'} {f.resultado}</span>
                    <b>{f.qtd}</b>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#5b6b84', marginTop: 2 }}>{f.motivo}</div>
                  <div style={{ fontSize: 11, color: '#8b9bb4', marginTop: 3 }}>{f.nomes}</div>
                </div>
              ))}
              <div style={s.confNota}>
                🔁 <b>Sem resposta</b> sai separado de propósito: é a lista de retrabalho.
              </div>
            </div>
          )
        )}
      </div>

      <div style={s.board}>
        {colunasVisiveis.map(([col, titulo]) => {
          const cards = cardsDe(col)
          const podeSoltar = col !== 'OUTROS'
          return (
            <div key={col}
              style={{ ...s.col, ...(podeSoltar && arrastando ? { outline: '2px dashed #60a5fa' } : {}) }}
              onDragOver={podeSoltar ? (e => e.preventDefault()) : undefined}
              onDrop={podeSoltar ? (e => { e.preventDefault(); soltarNaColuna(col) }) : undefined}>
              <div style={s.colTitulo}><span>{titulo}</span><span>{totalDe(col)}</span></div>
              {cards.map(l => (
                <div key={l.id} draggable
                  onDragStart={(e) => { try { e.dataTransfer.setData('text/plain', String(l.id)); e.dataTransfer.effectAllowed = 'move' } catch (_) {} setArrastando(l.id) }}
                  onDragEnd={() => setArrastando(null)}
                  style={{ ...s.card, ...(CORES[l.cor] || CORES.normal), cursor: 'grab' }}
                  onClick={() => abrirLead(l)}>
                  <div style={s.cardNome}>{l.nome || 'Sem nome'}</div>
                  {l.coluna === 'PITCH_LIBERADO' && l.cnis_aprovado !== 'true' && (
                    <div style={s.seloMaquina}>🤖 pré-aprovada máquina</div>
                  )}
                  {l.coluna === 'PITCH_LIBERADO' && l.cnis_aprovado === 'true' && l.advogada_motivo && (
                    <div style={s.seloAdvogada}>⚖️ {l.advogada_motivo}</div>
                  )}
                  {l.coluna === 'PITCH_LIBERADO' && (l.advogada_motivo || '').indexOf('seguro-desemprego') >= 0 && (
                    <div style={s.seloSeguro}>⚠️ perguntar do seguro-desemprego</div>
                  )}
                  {/* 21/09 — DOIS dados distintos, nessa ordem:
                      1) o carimbo da ATENDENTE (o que uma pessoa constatou)
                      2) o selo do ROBO validador (o que a Evolution respondeu)
                      O carimbo vem primeiro porque vale mais: é observação direta.
                      Quem nao tem nem um nem outro nao mostra nada — sao 7 mil
                      leads sem validacao e o card viraria um mar de cinza. */}
                  {l.whats_marcado === 'iniciado' && (
                    <div style={s.seloCarimbo('#065f46', 'rgba(52,211,153,.14)', 'rgba(5,150,105,.25)')}
                      title="alguém da equipe já iniciou o atendimento por WhatsApp">
                      📲 Atendimento iniciado no WhatsApp{fmtCarimbo(l.whats_iniciado_em) ? ' · ' + fmtCarimbo(l.whats_iniciado_em) : ''}
                    </div>
                  )}
                  {l.whats_marcado === 'sem_whats' && (
                    <div style={s.seloCarimbo('#991b1b', 'rgba(220,38,38,.12)', 'rgba(220,38,38,.32)')}
                      title="a equipe constatou que esse número não tem WhatsApp — ligar">
                      📵 Não tem WhatsApp (conferido){fmtCarimbo(l.whats_iniciado_em) ? ' · ' + fmtCarimbo(l.whats_iniciado_em) : ''}
                    </div>
                  )}
                  {/* selo do robo. So aparece quando a pessoa NAO carimbou — se
                      carimbou, quem manda e ela, e dois selos dizendo a mesma
                      coisa so ocupam espaco. A comparacao entre os dois fica na
                      ficha, onde ha lugar pra mostrar os dois lado a lado. */}
                  {!l.whats_marcado && l.whats_tem === 'false' && (
                    <div style={s.seloSemWhats}>📵 Sem WhatsApp — ligar, não mandar mensagem</div>
                  )}
                  {!l.whats_marcado && l.whats_tem === 'true' && (
                    <div><span style={s.seloTemWhats}>✅ WhatsApp</span></div>
                  )}
                  <div style={s.cardMeta}>
                    {l.cor === 'vermelho' ? '🔴 ' : ''}{l.cor === 'amarelo' ? '🟡 ' : ''}parada há {fmtParado(l.minutos_parado)}
                    {ehSupervisor && l.agente_nome ? ` · ${l.agente_nome}` : ''}
                  </div>
                  {(l.coluna === 'REPROVADO' || l.coluna === 'NEGADO') && l.cnis_reprovado_motivo && (
                    <div style={s.cardMeta}>❌ {l.cnis_reprovado_motivo}</div>
                  )}
                  {l.chatwoot_conversation_id && (
                    <a href={linkChatwoot(l)} target="_blank" rel="noreferrer" draggable={false} onClick={e => e.stopPropagation()} onDragStart={e => e.preventDefault()}
                      style={{ fontSize: 12, textDecoration: 'none', background: 'rgba(52,211,153,.14)', color: '#059669', borderRadius: 6, padding: '1px 7px', fontWeight: 700, display: 'inline-block', marginTop: 4 }}
                      title="Abrir conversa no Chatwoot">💬</a>
                  )}
                  {seloTratamento(l)}
                </div>
              ))}
              {/* 07/10 — aviso de corte no pé da coluna, em texto, longe do contador */}
              {totalDe(col) > LIMITE_CARDS && (
                <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center', padding: '8px 4px' }}>
                  + {totalDe(col) - LIMITE_CARDS} não exibidos · use os filtros para reduzir a lista
                </div>
              )}
            </div>
          )
        })}
      </div>

      {lead && (
        <div style={s.overlay} onClick={fechar}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{lead.nome || 'Sem nome'}</div>
              <button style={s.btnFechar} onClick={fechar}>Fechar ✕</button>
            </div>

            {/* 01/10 — trocar a dona e acao de GESTAO, nao de venda: fica junto do
                nome da dona e so a supervisora ve. Antes era um botao do mesmo
                tamanho do "Fechei a venda", no meio das acoes da vendedora. */}
            {ehSupervisor && (
              <div style={s.donoLinha}>
                <span>👤 {lead.agente_nome ? <b>{lead.agente_nome}</b> : <i>sem dona</i>}</span>
                {podeTransferir && (
                  <button style={s.donoAcao} onClick={() => abrirTransferir(lead)}>
                    passar para outra
                  </button>
                )}
              </div>
            )}

            <div style={s.ficha}>
              {lead.data_nascimento_filho && (
                <div style={s.destaque}>👶 Nascimento do filho: {lead.data_nascimento_filho}{lead.idade_bebe ? ` (${lead.idade_bebe})` : ''}</div>
              )}

              {/* 22/09 — O QUE GARANTE O DIREITO DELA. É o que a vendedora
                  confirma na ligação: "você trabalhou na X até tal data, né?".
                  Sem isso ela liga no escuro. Vem do robô do GERID. */}
              {lead.vinculo_direito && !lead.vinculo_direito.bruto && (
                <div style={s.vincBox}>
                  <div style={s.vincTit}>
                    {lead.vinculo_direito.eh_beneficio
                      ? '📄 Benefício que garante o direito'
                      : '🏢 Empresa que garante o direito'}
                  </div>
                  <div style={s.vincNome}>{lead.vinculo_direito.empresa}</div>
                  <div style={s.vincMeta}>{lead.vinculo_direito.tipo}</div>
                  <div style={s.vincMeta}>{textoVinculo(lead.vinculo_direito)}</div>
                  <div style={s.vincRegra}>
                    ✅ {lead.vinculo_direito.regra}
                    {lead.vinculo_direito.total_vinculos > 1
                      ? ` · a cliente tem ${lead.vinculo_direito.total_vinculos} vínculos no CNIS, este é o que vale`
                      : ''}
                  </div>
                </div>
              )}
              <div>
                📱 {lead.tel || '—'}
                {/* aqui os TRES estados aparecem: na ficha ha espaco, e "ainda nao
                    verificado" e informacao util — nao significa que nao tenha. */}
                {lead.whats_tem === 'true'
                  ? <span style={s.fichaWhats('#059669', 'rgba(5,150,105,.12)')} title="o número tem WhatsApp">✅ tem WhatsApp</span>
                  : lead.whats_tem === 'false'
                    ? <span style={s.fichaWhats('#dc2626', 'rgba(220,38,38,.10)')} title="o número NÃO tem WhatsApp — ligar, não mandar mensagem">📵 sem WhatsApp</span>
                    : <span style={s.fichaWhats('#5b6b84', 'rgba(15,23,42,.05)')} title="ainda não foi verificado — não significa que não tenha">⏳ não verificado</span>}
              </div>
              <div>🪪 CPF: {lead.cpf || '—'}</div>
              <div>💼 Trabalhava no nascimento: {lead.trabalhava_no_nascimento || '—'}</div>
              <div>📋 Já trabalhou CLT: {lead.ja_trabalhou_clt || '—'}</div>
              <div>🪪 RG frente: {lead.doc_rg_frente ? '✅' : '—'}</div>
              <div>🪪 RG verso: {lead.doc_rg_verso ? '✅' : '—'}</div>
              <div>📜 Certidão: {lead.certidao ? '✅' : '—'}</div>
              <div>📌 Etapa: {lead.estado}{lead.sub_estado ? ` / ${lead.sub_estado}` : ''}</div>
              {lead.cnis_aprovado === 'true' && <div>✅ CNIS aprovado</div>}
              {lead.cnis_aprovado === 'false' && <div>⛔ CNIS reprovado: {lead.cnis_reprovado_motivo || ''}</div>}
            </div>

            {/* Print do GERID da advogada. So aparece quando ela anexou — a aprovacao
                exige o print, entao pra pre-aprovado real ele existe. E a prova do
                direito da cliente: a vendedora vende olhando pra ele. */}
            {geridCarregando && (
              <div style={s.geridBox}><div style={s.geridLabel}>🗂️ Print do GERID</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>carregando...</div></div>
            )}
            {!geridCarregando && gerid && gerid.print_url && (
              <div style={s.geridBox}>
                <div style={s.geridLabel}>🗂️ Print do GERID — anexado pela advogada</div>
                {gerid.advogada_motivo && <div style={s.geridMotivo}>⚖️ {gerid.advogada_motivo}</div>}
                <a href={gerid.print_url} target="_blank" rel="noreferrer" title="Abrir o print em tamanho real">
                  <img src={gerid.print_url} alt="Print do GERID" style={s.geridImg} />
                </a>
                <div style={s.geridPe}>
                  Clique na imagem pra abrir em tamanho real
                  {gerid.print_em ? ' · anexado em ' + gerid.print_em : ''}
                </div>
              </div>
            )}

            <div style={s.anexoBox}>
              <div style={s.anexoLabel}>
                📎 Anexos {carregandoAnexos ? '(carregando...)' : `(${anexos.length})`}
              </div>
              {!carregandoAnexos && anexos.length === 0 && (
                <div style={{ fontSize: 12, color: '#64748b' }}>Nenhum anexo nesta conversa.</div>
              )}
              <div style={s.anexoRow}>
                {anexos.map((a, i) => (
                  a.tipo === 'image' ? (
                    <a key={i} href={a.url} target="_blank" rel="noreferrer" title="Abrir imagem">
                      <img src={a.thumb || a.url} alt="anexo" style={s.anexoImg} />
                    </a>
                  ) : (
                    <a key={i} href={a.url} target="_blank" rel="noreferrer" style={s.anexoFile}>
                      📄 {a.ext ? a.ext.toUpperCase() : 'Arquivo'} · abrir/baixar
                    </a>
                  )
                ))}
              </div>
            </div>

            {/* 01/10 — UM bloco pro que acontece DURANTE o atendimento: pegar o
                card e carimbar o WhatsApp. Antes "estou nesse" era um botao solto
                embaixo e o carimbo era outra caixa, sem relacao visual.
                21/09 — o carimbo tem TRES estados: nada, 'iniciado' e 'sem_whats'.
                Clicar no que ja esta aceso DESMARCA; clicar no outro TROCA. */}
            <div style={s.bloco}>
              <div style={s.blocoLabel}>Enquanto você atende</div>
              <div style={s.blocoLinha}>
                {lead.bf_em_tratamento ? (
                  <button style={s.carimboBtn(true, '#065f46', 'rgba(52,211,153,.16)', 'rgba(5,150,105,.3)')}
                    onClick={() => soltarTratamento(lead)}
                    title="você está com essa cliente — clicar solta o card">
                    🙋 Estou nesse (soltar)
                  </button>
                ) : (
                  <button style={s.carimboBtn(false, '#065f46', 'rgba(52,211,153,.16)', 'rgba(5,150,105,.3)')}
                    onClick={() => marcarTratando(lead)}
                    title="marca que você pegou essa cliente, pra ninguém atender junto">
                    🙋 Estou nesse
                  </button>
                )}
                <button
                  style={s.carimboBtn(lead.whats_marcado === 'iniciado', '#065f46', 'rgba(52,211,153,.16)', 'rgba(5,150,105,.3)')}
                  disabled={carimbando}
                  onClick={() => marcarWhats(lead, 'iniciado')}
                  title="marca que você já chamou essa cliente no WhatsApp — clicar de novo desmarca">
                  {lead.whats_marcado === 'iniciado' ? '✅ Chamei no WhatsApp' : '📲 Chamei no WhatsApp'}
                </button>
                <button
                  style={s.carimboBtn(lead.whats_marcado === 'sem_whats', '#991b1b', 'rgba(220,38,38,.14)', 'rgba(220,38,38,.34)')}
                  disabled={carimbando}
                  onClick={() => marcarWhats(lead, 'sem_whats')}
                  title="marca que esse número NÃO tem WhatsApp — clicar de novo desmarca">
                  {lead.whats_marcado === 'sem_whats' ? '✅ Não tem WhatsApp' : '📵 Não tem WhatsApp'}
                </button>
                {lead.whats_marcado && fmtCarimbo(lead.whats_iniciado_em) && (
                  <span style={{ fontSize: 11.5, color: '#5b6b84' }}>marcado em {fmtCarimbo(lead.whats_iniciado_em)}</span>
                )}
              </div>
              {/* o robo e a pessoa discordaram: vale mostrar, e o caso que interessa */}
              {lead.whats_marcado === 'sem_whats' && lead.whats_tem === 'true' && (
                <div style={s.carimboPe}>
                  ⚠️ O validador automático tinha dito que <b>tem</b> WhatsApp. Sua marcação vale mais — mas avisa o time, é um erro do robô pra investigar.
                </div>
              )}
              {lead.whats_marcado === 'iniciado' && lead.whats_tem === 'false' && (
                <div style={s.carimboPe}>
                  ⚠️ O validador automático tinha dito que <b>não tem</b> WhatsApp. Se você conseguiu falar por lá, avisa o time — é um erro do robô pra investigar.
                </div>
              )}
              {!lead.whats_marcado && (
                <div style={s.blocoPe}>
                  Serve pra ninguém chamar a mesma cliente duas vezes — e pra conferir se o validador automático está acertando.
                </div>
              )}
              {lead.bf_em_tratamento && lead.cliente_respondeu && (
                <div style={{ ...s.blocoPe, color: '#b45309', fontWeight: 700 }}>💬 a cliente respondeu</div>
              )}
            </div>

            {/* 01/10 — o DESFECHO num bloco so. O verde aparece UMA vez e e a acao
                que a gente quer que ela clique; o "nao quis" fica do lado, menor.
                Antes o verde competia com o laranja do soltar e o azul do passar. */}
            <div style={s.blocoFecho}>
              <div style={s.blocoLabel}>Como terminou</div>
              {lead.cnis_aprovado === 'true' && (
              <div>
                {vendaCarregando ? (
                  <div style={{ fontSize: 12, color: '#5b6b84' }}>conferindo o fechamento…</div>
                ) : venda?.fechada ? (
                  // Ja marcada: o botao de fechar SOME e da lugar ao aviso + desfazer.
                  // Antes o botao continuava ali e a RPC recusava com "ja esta marcada
                  // como fechada" — parecia bug em vez de estado.
                  <div style={s.vendaFeita}>
                    <div style={{ fontWeight: 700, color: '#047857' }}>
                      ✅ Venda fechada por {venda.por_nome}
                      {venda.em ? ` · ${new Date(venda.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
                    </div>
                    {venda.pode_desfazer ? (
                      <>
                        <button style={s.btnDesfazer} disabled={desfazendo} onClick={() => desfazerVenda(lead)}>
                          {desfazendo ? 'desfazendo…' : '↩︎ Marquei errado, desfazer'}
                        </button>
                        <div style={{ fontSize: 11, color: '#5b6b84', marginTop: 5 }}>
                          A cliente volta a ficar em aberto no fechamento do dia. Não marca como negada.
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 11.5, color: '#5b6b84', marginTop: 6 }}>
                        Não dá pra desfazer aqui: {venda.motivo || 'sem permissão'}.
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={s.blocoLinha}>
                    <button style={s.btnFechou} onClick={() => fecharVenda(lead.id)}>✅ Fechei a venda</button>
                    <button style={s.btnNegar} onClick={() => setMostrarMotivosNegar(v => !v)}>❌ Não quis</button>
                  </div>
                )}
              </div>
              )}

              {/* lead que ainda nao foi pre-aprovado nao tem "fechei a venda",
                  mas pode ser negado do mesmo jeito */}
              {lead.cnis_aprovado !== 'true' && (
                <div style={s.blocoLinha}>
                  <button style={s.btnNegar} onClick={() => setMostrarMotivosNegar(v => !v)}>❌ Não quis</button>
                </div>
              )}

              {!venda?.fechada && lead.cnis_aprovado === 'true' && !vendaCarregando && (
                <div style={s.blocoPe}>Vale também quando fechar pelo WhatsApp — é assim que entra no seu fechamento do dia.</div>
              )}

              {mostrarMotivosNegar && (
                <div style={s.painelMotivos}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#5b6b84', marginBottom: 8 }}>Por que está negando? (não mexe no CNIS)</div>
                  <div style={s.motivosGrid}>
                    {MOTIVOS_NEGAR.map(([codigo, texto]) => (
                      <button key={codigo} style={s.btnMotivo} onClick={() => negarLead(lead.id, texto)}>{texto}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#5b6b84' }}>
                💬 Conversa <span style={{ color: '#059669', fontWeight: 500 }}>· atualiza sozinha</span>
              </span>
              <button
                style={{ fontSize: 11, padding: '4px 10px', background: 'rgba(96,165,250,.10)', color: '#2563eb', border: '0.5px solid rgba(15,23,42,0.09)', borderRadius: 8, cursor: 'pointer', fontWeight: 500 }}
                onClick={() => recarregarConversa(lead, true)}
                disabled={atualizandoConversa}
              >
                {atualizandoConversa ? 'Atualizando...' : '🔄 Atualizar conversa'}
              </button>
            </div>
            <div style={s.msgs}>
              {mensagens.length === 0 && <div style={{ fontSize: 12, color: '#64748b' }}>Sem mensagens.</div>}
              {mensagens.map((m, i) => (
                <div key={i} style={m.role === 'user' ? s.msgCliente : s.msgAna}>{m.content || '—'}</div>
              ))}
            </div>

            {lead.coluna === 'A_ANALISAR' && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <button style={s.btnAprovar} disabled={enviando} onClick={() => decidirCnis(true)}>✅ APROVAR CNIS</button>
                <button style={s.btnReprovar} disabled={enviando} onClick={() => decidirCnis(false)}>⛔ REPROVAR CNIS</button>
              </div>
            )}

            {lead.estado === 'COLETANDO_CADASTRO' && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#5b6b84', marginBottom: 4 }}>Mover etapa do cadastro na mão (não aciona a IA):</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={s.btnVoltar} disabled={enviando} onClick={() => avancarEtapa('voltar')}>← Voltar</button>
                  <button style={s.btnAvancar} disabled={enviando} onClick={() => avancarEtapa('proximo')}>Próxima etapa →</button>
                </div>
              </div>
            )}

            {linkChatwoot(lead) ? (
              <a href={linkChatwoot(lead)} target="_blank" rel="noreferrer"
                style={{ display: 'block', textAlign: 'center', textDecoration: 'none', width: '100%', padding: 12, background: '#34d399', color: '#232a37', borderRadius: 10, fontSize: 14, fontWeight: 700, marginBottom: 10, boxSizing: 'border-box' }}>
                💬 Abrir conversa no Chatwoot
              </a>
            ) : (
              <div style={{ fontSize: 12, color: '#dc2626', background: 'rgba(248,113,113,.10)', borderRadius: 8, padding: 10, marginBottom: 10 }}>Sem conversa no Chatwoot vinculada a este lead.</div>
            )}
          </div>
        </div>
      )}

      {/* 01/10 — modal de transferencia. O motivo e obrigatorio nos DOIS lados:
          o botao fica desabilitado sem ele, e o banco recusa se vier vazio. */}
      {transf && (
        <div style={s.overlay} onClick={() => !transferindo && setTransf(null)}>
          <div style={{ ...s.modal, maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div style={s.transfTit}>🔄 Passar para outra vendedora</div>
            <div style={s.transfSub}>
              {transf.nome || 'Cliente'}{transf.agente_nome ? ` · hoje com ${transf.agente_nome}` : ''}
            </div>

            <div style={s.transfLabel}>Para quem vai *</div>
            <select style={s.transfSelect} value={transfPara} onChange={e => setTransfPara(e.target.value)}>
              <option value="">escolha a vendedora...</option>
              {transfVends.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
            {transfVends.length === 0 && (
              <div style={s.transfVazio}>Nenhuma outra vendedora disponível no seu time.</div>
            )}

            <div style={s.transfLabel}>Por quê? *</div>
            <select style={s.transfSelect} value={transfCod} onChange={e => setTransfCod(e.target.value)}>
              <option value="">escolha o motivo...</option>
              {MOTIVOS_TRANSF.map(([cod, txt]) => <option key={cod} value={cod}>{txt}</option>)}
            </select>

            {/* so "Outro" abre o texto: nos demais o codigo ja explica, e campo
                livre que ninguem preenche direito so atrapalha a contagem */}
            {transfCod === 'outro' && (
              <>
                <div style={s.transfLabel}>Escreva o motivo *</div>
                <textarea style={s.textarea} value={transfMotivo} onChange={e => setTransfMotivo(e.target.value)}
                  placeholder="O que aconteceu?" />
              </>
            )}

            {transfCod === 'venda_fora' && (
              <div style={s.transfAviso}>
                💡 Marque <b>"entregue hoje"</b> abaixo: assim a cliente volta pro topo da fila
                e a vendedora consegue clicar em "Fechei a venda" pra entrar no fechamento do dia dela.
              </div>
            )}

            <label style={s.transfCheck}>
              <input type="checkbox" checked={transfHoje} onChange={e => setTransfHoje(e.target.checked)} />
              <span><b>Marcar como entregue hoje</b><br />
                <span style={s.transfCheckPe}>
                  O lead volta pro topo da fila de hoje, como se tivesse acabado de chegar.
                  Se deixar desmarcado, a data de entrega original é mantida.
                </span>
              </span>
            </label>

            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button style={s.btnVoltar} disabled={transferindo} onClick={() => setTransf(null)}>Cancelar</button>
              <button style={{ ...s.btnAvancar, flex: 2, opacity: transfOk ? 1 : 0.5 }}
                disabled={transferindo || !transfOk}
                onClick={confirmarTransferir}>
                {transferindo ? '⏳ passando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
