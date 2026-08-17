import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// Agentes BF por ID (Joana, Pamela, Juliana/Ju, Nadia) — sem trocar role delas
export const IDS_AGENTES_BF = [
  '758a33f7-e5a2-4ef7-943a-dfe0ac72a387', // Joana
  '64ced61d-fdae-4399-97c9-900c59120fff', // Pamela
  '7ad37a1d-e5be-438c-9afd-982646d507d4', // Juliana (Ju Ferreira)
  'a3e94f8b-7e64-479b-9d72-1414afb83d1c', // Nadia Cajado
  '2c71c435-f5c2-49cf-984b-3629438045d2', // Hellen (helenlima451)
]

// Supervisores de board (Egle): veem em modo supervisor — todos os atendentes + filtro + cores
const IDS_SUPERVISOR_BOARD = [
  '6db43f01-71e6-4972-b84e-eb49375e8e70', // Egle Marcela
]

// ===== OPERAÇÕES LICENCIADAS (Ronaldo / Leandro) =====
// Cada usuário licenciado só enxerga leads da PRÓPRIA operação (l.operacao, marcada pelo sync via inbox).
export const OPERACAO_USUARIOS = {
  '72fa4914-e8de-4c0c-a954-b05241e9d1bd': 'ronaldo', // Thamires (supervisora)
  '8bff997b-e43f-4b65-bafc-b4e7e704b14b': 'ronaldo', // Brenda
  '3a9c1779-2008-4aaa-9cfb-e64336b9207a': 'ronaldo', // Tamy
  'ed181784-484b-4ad9-9e8c-4f35b1279940': 'ronaldo', // Kisse
  '7085f131-b2db-4b96-a4db-2a1e2a5bf6f6': 'ronaldo', // Kayllaine
  'cf6444f5-7e03-4cc7-9442-9b0cb963695a': 'leandro', // Isabelle (supervisora)
  '5d8cf47f-47e8-4d15-a4b8-48308d4b0840': 'leandro', // Rafaelle
  '977a4664-eb04-4a51-84ab-b61449720dc2': 'leandro', // Sara
}
export const SUPERVISORAS_OPERACAO = [
  '72fa4914-e8de-4c0c-a954-b05241e9d1bd', // Thamires (Ronaldo)
  'cf6444f5-7e03-4cc7-9442-9b0cb963695a', // Isabelle (Leandro)
]
const OPERACAO_VENDEDORAS = {
  ronaldo: ['8bff997b-e43f-4b65-bafc-b4e7e704b14b', '3a9c1779-2008-4aaa-9cfb-e64336b9207a', 'ed181784-484b-4ad9-9e8c-4f35b1279940', '7085f131-b2db-4b96-a4db-2a1e2a5bf6f6'],
  leandro: ['5d8cf47f-47e8-4d15-a4b8-48308d4b0840', '977a4664-eb04-4a51-84ab-b61449720dc2'],
}

// Supervisoras de TIME interno (KR): veem o board filtrado pelos leads das PROPRIAS vendedoras
const SUPERVISORAS_TIME = {
  'be98f268-314f-4114-acc3-7bb9ce7635fd': [ // Maryana Kodos -> time dela
    '78e022dd-b499-4e7d-85ce-65922ddbf9cf', // Eduarda (B2C)
    'a1d7dbfb-bc0d-46a3-b523-bfdc15aac0c9', // Leticia
    'a3b8aea4-1b5f-45cb-ba06-192a99bdbf85', // Daniele
    'bb85a0f3-2d79-499e-8b19-6219bd0cef56', // Gislaine
  ],
}

const COLUNAS = [
  ['OFERTA', '📢 Oferta'],
  ['CONFIRMA_CAIXA_TEM', '💬 Confirma Caixa'],
  ['COLETA_RG_FRENTE', '🪪 RG Frente'],
  ['COLETA_RG_VERSO', '🪪 RG Verso'],
  ['COLETA_EXTRATO', '📄 Extrato'],
  ['BF_DADOS_PESSOAIS', '📝 Dados finais'],
  ['DOCS_COMPLETOS', '✅ A digitar'],
  ['BF_AGUARDANDO_LINK', '⏳ Aguard. link'],
  ['BF_LINK_ENVIADO', '🔗 Link enviado'],
  ['BF_AGUARDANDO_ASSINATURA', '✍️ Aguard. assinatura'],
  ['BF_ASSINADO', '💰 Assinado'],
  ['BF_CONCLUIDO', '🎉 Concluído'],
  ['NEGADO', '❌ Negados'],
  ['OUTROS', '❓ Outros'],
]

// sub_estados que caem na coluna Negados (o BF_NEGADO manual + os que a Ana ja cria sozinha)
const SUB_ESTADOS_NEGADO = ['BF_NEGADO', 'DESQUALIFICADO_CAIXA_TEM', 'DESQUALIFICADO_SEM_BF', 'DESQUALIFICADO_SEM_BOLSA', 'RECUSOU_OFERTA', 'RECUSOU_VALOR', 'RECUSA_TEMPORARIA', 'DESISTIU', 'CANCELADO', 'CANCELADO_CLIENTE', 'RECUSOU', 'SEM_INTERESSE', 'SEM_INTERESSE_HOSTIL']

// Etapas de "confirmação final de dados" da Ana (endereço/CEP, conta corrigida, CNIS em análise):
// caem TODAS na coluna 📝 Dados finais — entre Extrato e A digitar, em vez de irem pra Outros.
const SUB_ESTADOS_DADOS_FINAIS = ['BF_DADOS_PESSOAIS', 'CONTA_CORRIGIDA', 'CNIS_EM_ANALISE']

// Todo sub_estado com coluna propria + os de Negados. O que NAO estiver aqui cai em "Outros" — rede de seguranca pra card nunca mais sumir do board.
const CHAVES_CONHECIDAS = new Set([
  ...COLUNAS.map(([k]) => k).filter(k => k !== 'NEGADO' && k !== 'OUTROS'),
  ...SUB_ESTADOS_NEGADO,
  ...SUB_ESTADOS_DADOS_FINAIS,
])

// ===== MODO ESTEIRA (F1) =====
// SLA por ETAPA (min) — o vermelho volta a significar algo: estourou o SLA daquela etapa.
// (F2: mover pro app_config pra ajustar sem deploy)
const SLA_ETAPA = {
  BF_DADOS_PESSOAIS: 15, CONTA_CORRIGIDA: 15, CNIS_EM_ANALISE: 30,
  OFERTA: 120, CONFIRMA_CAIXA_TEM: 15,
  COLETA_RG_FRENTE: 15, COLETA_RG_VERSO: 15, COLETA_EXTRATO: 30,
  DOCS_COMPLETOS: 30, BF_AGUARDANDO_LINK: 120,
  BF_LINK_ENVIADO: 1440, BF_AGUARDANDO_ASSINATURA: 1440,
}
const META_VENDAS_DIA = 10        // meta Bruno: 10 aprovações/dia por vendedora
const META_CONVERSAO_PCT = 15     // meta Bruno: converter >= 15% da carteira

// Quanto maior o score, mais no topo da fila. Pondera: perto do dinheiro (docs/digitada),
// cliente esperando resposta, SLA da etapa estourado e valor da proposta.
function scoreFila(c) {
  const sla = SLA_ETAPA[c.sub_estado] || 60
  const estouro = (c.minutos_parado || 0) / sla
  let sc = Math.min(estouro, 8) * 12                      // até ~96 pts por atraso
  if (c.cliente_respondeu) sc += 90                       // gente esperando humano = topo
  if (c.sub_estado === 'BF_AGUARDANDO_LINK') sc += 75     // digitada: falta só o link
  if (c.sub_estado === 'BF_LINK_ENVIADO' || c.sub_estado === 'BF_AGUARDANDO_ASSINATURA') sc += 55
  if (c.sub_estado === 'DOCS_COMPLETOS') sc += 60
  else if (c.docs_completos) sc += 40
  sc += Math.min(Number(c.valor) || 0, 1000) / 1000 * 15  // valor da proposta pesa um pouco
  return sc
}
// Nível de urgência pela régua da etapa (não mais relógio único de 10/20min)
function nivelSla(c) {
  const sla = SLA_ETAPA[c.sub_estado] || 60
  const r = (c.minutos_parado || 0) / sla
  if (r >= 2) return ['🔴', '#dc2626', 'rgba(248,113,113,.12)']
  if (r >= 1) return ['🟡', '#b45309', 'rgba(251,191,36,.10)']
  return ['🟢', '#059669', 'rgba(52,211,153,.08)']
}
// A AÇÃO que o item pede — o coração do modo esteira: diz o que fazer, não o estado.
function acaoSugerida(c) {
  if (c.cliente_respondeu) return '💬 Cliente respondeu e está ESPERANDO — responda agora'
  if (c.sub_estado === 'BF_AGUARDANDO_LINK') return '🔗 Proposta digitada — enviar o link de assinatura'
  if (c.sub_estado === 'BF_LINK_ENVIADO') return '✍️ Link enviado — cobrar a assinatura'
  if (c.sub_estado === 'BF_AGUARDANDO_ASSINATURA') return '✍️ Falta assinar — cobrar o cliente'
  if (c.sub_estado === 'DOCS_COMPLETOS') {
    if (c.dig_protocolo || c.dig_em) return '🤖 Digitada pelo robô — conferir e seguir'
    if (['erro', 'revisar', 'revisar_humano', 'faltando_dados'].includes(c.dig_status)) return '🖐 Robô não digitou — DIGITAR MANUAL'
    return '🖐 Docs completos — DIGITAR AGORA (manual)'
  }
  if (c.sub_estado === 'COLETA_EXTRATO') return '📄 Falta o EXTRATO — pedir de novo'
  if (c.sub_estado === 'COLETA_RG_VERSO') return '🪪 Falta o RG VERSO — pedir de novo'
  if (c.sub_estado === 'COLETA_RG_FRENTE') return '🪪 Falta o RG FRENTE — pedir de novo'
  if (SUB_ESTADOS_DADOS_FINAIS.includes(c.sub_estado)) return '📝 Confirmando dados finais (endereço/conta) — destravar se parar'
  if (c.sub_estado === 'CONFIRMA_CAIXA_TEM') return '💬 Confirmando Caixa Tem — destravar a conversa'
  if (c.sub_estado === 'OFERTA') return '📢 Viu a oferta e parou — reengajar (áudio funciona)'
  return '👀 Verificar a conversa'
}

// Liberado (23/07): TODO o time BF ve todas as colunas e arrasta em todas.
// NEGADO continua so pelo botao Negar (precisa de motivo); OUTROS nao recebe card (catch-all).

// Motivos do botao Negar: [codigo estavel, label]. O codigo vai pro banco (bf_motivo_perda), o label a atendente ve.
const MOTIVOS_NEGADO = [
  ['recebe_menos_400', 'Recebe menos de 400'],
  ['caixa_tem', 'No caixa tem / já pegou'],
  ['sem_bolsa_familia', 'Não recebe Bolsa Família'],
  ['sem_foto_rg', 'Sem foto do RG'],
  ['sem_resposta', 'Sem resposta'],
  ['juros_alto', 'Juros alto'],
  ['recusou_oferta', 'Recusou a oferta'],
  ['desistiu', 'Desistiu'],
  ['cancelou', 'Cancelou'],
]
// Traduz o que estiver gravado (codigo novo OU sub_estado antigo da Ana) para texto legivel no card
function labelMotivo(c) {
  const m = c.bf_motivo_perda
  if (m) { const achou = MOTIVOS_NEGADO.find(x => x[0] === m); return achou ? achou[1] : m }
  const porSub = {
    DESQUALIFICADO_CAIXA_TEM: 'No caixa tem / já pegou',
    DESQUALIFICADO_SEM_BF: 'Não recebe Bolsa Família',
    DESQUALIFICADO_SEM_BOLSA: 'Não recebe Bolsa Família',
    RECUSOU_OFERTA: 'Recusou a oferta',
    RECUSOU_VALOR: 'Recusou o valor',
    RECUSA_TEMPORARIA: 'Recusa temporária',
    DESISTIU: 'Desistiu',
    CANCELADO: 'Cancelou',
    RECUSOU: 'Recusou',
    SEM_INTERESSE: 'Sem interesse',
    SEM_INTERESSE_HOSTIL: 'Sem interesse (hostil)',
  }
  return porSub[c.sub_estado] || 'Negado'
}

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
  // "a partir de AGORA": corta o estoque antigo — o carimbo fica salvo no navegador
  // e sobrevive a reload; o botão "zerar corte" re-carimba.
  if (preset === 'agora') {
    let corte = null
    try { corte = localStorage.getItem('bf_corte_apartir') } catch (_) { /* sem storage */ }
    if (!corte) { corte = new Date().toISOString(); try { localStorage.setItem('bf_corte_apartir', corte) } catch (_) { /* ok */ } }
    return { de: new Date(corte), ate: null }
  }
  // dia operacional 19h→19h (pedido Bruno): antes das 19h conta desde ONTEM 19h
  if (preset === 'dia19') {
    const agora = new Date()
    const de = new Date(agora); de.setHours(19, 0, 0, 0)
    if (agora.getHours() < 19) de.setDate(de.getDate() - 1)
    const ate = new Date(de); ate.setDate(ate.getDate() + 1)
    return { de, ate }
  }
  return { de: null, ate: null }
}
const OPCOES_DATA = [['tudo', 'tudo'], ['agora', '⚡ a partir de AGORA'], ['dia19', '🕖 dia 19h→19h'], ['hoje', 'hoje'], ['ontem', 'ontem'], ['7d', '7 dias'], ['mes', 'mês'], ['custom', 'personalizado']]

function primeiroNome(n) { return (n || 'cliente').split(' ')[0] }

function sugestaoPara(lead, linkCrefisa) {
  const nome = primeiroNome(lead.nome)
  const valor = lead.valor || ''
  const map = {
    OFERTA: `Oi ${nome}! 💗 Vi que você ainda não aproveitou sua pré-aprovação${valor ? ` de R$ ${valor}` : ''} 💰 Quer que eu te explique como funciona? É rapidinho!`,
    COLETA_RG_FRENTE: `Oi ${nome}! Pra liberar seu dinheiro${valor ? ` (R$ ${valor})` : ''} só falta a foto da FRENTE do seu RG 📸 Me manda?`,
    COLETA_RG_VERSO: `${nome}, recebi a frente do RG certinho! ✅ Agora só falta o VERSO 📸 Pode mandar?`,
    COLETA_EXTRATO: `${nome}, falta só 1 documentinho: o extrato do seu Caixa Tem em PDF 📄 É só abrir o app, tocar em extrato e compartilhar aqui comigo 💗`,
    BF_DADOS_PESSOAIS: `${nome}, falta pouquinho! 💗 Me confirma seu endereço completo (rua, número, bairro e cidade) que eu já finalizo seu cadastro 📝`,
    DOCS_COMPLETOS: `${nome}, seus documentos chegaram certinhos! ✅ Já estamos finalizando sua proposta, te aviso assim que estiver pronta 💗`,
    BF_AGUARDANDO_LINK: `${nome}, sua proposta está em finalização! ✅ Assim que liberar eu te mando o link, tá? 💗`,
    BF_LINK_ENVIADO: `Prontinho, ${nome}! ✅ Sua proposta já está liberada. Pra finalizar, chama no WhatsApp oficial da Crefisa nesse link 👉 ${linkCrefisa} — é só mandar um oi que eles concluem a liberação${valor ? ` do seu R$ ${valor}` : ''} 💰`,
    BF_AGUARDANDO_ASSINATURA: `${nome}, conseguiu chamar a Crefisa? 💗 Qualquer dificuldade me fala que te ajudo!`,
    BF_ASSINADO: `Perfeito, ${nome}! 🎉 Deu tudo certo com a sua assinatura. Em até 24 horas${valor ? ` o seu R$ ${valor}` : ' o valor'} cai direto na sua conta do Caixa Tem 💰 Fica de olho!`,
    BF_CONCLUIDO: `${nome}, seu dinheiro já foi liberado! 🎉 Qualquer coisa é só me chamar 💗`,
  }
  return map[lead.sub_estado] || `Oi ${nome}! 💗 Tudo bem? Vi que a gente parou no meio — posso te ajudar a continuar?`
}

// Deep-link pro Chatwoot (responder é lá, não pelo CRM) — mesmo padrão do Confere CNIS/CLT
const CHATWOOT_BASE = 'https://chat.grupookr.com.br' // migracao Chatwoot: instancia propria
const CHATWOOT_ACC = '1'
function linkChatwoot(c) {
  return c?.chatwoot_conversation_id ? `${CHATWOOT_BASE}/app/accounts/${CHATWOOT_ACC}/conversations/${c.chatwoot_conversation_id}` : null
}

const CORES = {
  vermelho: { border: '1px solid #f87171', background: 'rgba(248,113,113,.14)' },
  amarelo: { border: '1px solid #fbbf24', background: 'rgba(251,191,36,.12)' },
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
  tagTrat: { fontSize: 10, background: 'rgba(52,211,153,.14)', color: '#059669', borderRadius: 6, padding: '2px 7px', display: 'inline-block', marginTop: 4, fontWeight: 600 },
  tagTratSup: { fontSize: 10, background: 'rgba(96,165,250,.10)', color: '#2563eb', borderRadius: 6, padding: '2px 7px', display: 'inline-block', marginTop: 4, fontWeight: 600 },
  tagNinguem: { fontSize: 10, background: 'rgba(248,113,113,.14)', color: '#dc2626', borderRadius: 6, padding: '2px 7px', display: 'inline-block', marginTop: 4, fontWeight: 600 },
  tagRespondeu: { fontSize: 10, background: 'rgba(251,191,36,.12)', color: '#b45309', borderRadius: 6, padding: '2px 7px', display: 'inline-block', marginTop: 4, marginRight: 4, fontWeight: 700 },
  tagMotivo: { fontSize: 10, background: '#e2e8f0', color: '#5b6b84', borderRadius: 6, padding: '2px 7px', display: 'inline-block', marginTop: 4, fontWeight: 600 },
  badgeIA: { fontSize: 10, background: 'rgba(96,165,250,.14)', color: '#2563eb', borderRadius: 6, padding: '2px 7px', fontWeight: 700, display: 'inline-block' },
  badgeHumano: { fontSize: 10, background: 'rgba(167,139,250,.18)', color: '#7c3aed', borderRadius: 6, padding: '2px 7px', fontWeight: 700, display: 'inline-block' },
  cardChat: { fontSize: 12, textDecoration: 'none', background: 'rgba(52,211,153,.14)', color: '#059669', borderRadius: 6, padding: '1px 7px', fontWeight: 700 },
  btnNegar: { padding: '9px 12px', background: 'rgba(248,113,113,.14)', color: '#dc2626', border: '0.5px solid rgba(178,59,59,0.3)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  painelMotivos: { marginTop: 10, padding: 12, background: '#f1f5f9', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 10 },
  motivosGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 },
  btnMotivo: { padding: '9px 10px', background: '#ffffff', color: '#dc2626', border: '0.5px solid rgba(178,59,59,0.35)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 50, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '3vh 12px', overflowY: 'auto' },
  modal: { background: '#ffffff', borderRadius: 14, width: '100%', maxWidth: 640, padding: '1.25rem', maxHeight: '92vh', overflowY: 'auto' },
  ficha: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 13, background: '#f1f5f9', borderRadius: 10, padding: 12, marginBottom: 12 },
  anexoBox: { marginBottom: 12 },
  anexoLabel: { fontSize: 12, fontWeight: 600, color: '#5b6b84', marginBottom: 6 },
  anexoRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  anexoImg: { width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.11)' },
  anexoFile: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'rgba(96,165,250,.10)', border: '0.5px solid rgba(15,23,42,0.09)', borderRadius: 8, fontSize: 12, color: '#2563eb', textDecoration: 'none', fontWeight: 500 },
  msgs: { maxHeight: 220, overflowY: 'auto', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 10, padding: 10, marginBottom: 12, display: 'flex', flexDirection: 'column-reverse', gap: 6 },
  msgCliente: { alignSelf: 'flex-start', background: '#e2e8f0', borderRadius: '10px 10px 10px 2px', padding: '6px 10px', fontSize: 12, maxWidth: '85%' },
  msgAna: { alignSelf: 'flex-end', background: 'rgba(52,211,153,.14)', borderRadius: '10px 10px 2px 10px', padding: '6px 10px', fontSize: 12, maxWidth: '85%' },
  textarea: { width: '100%', minHeight: 90, padding: 10, fontSize: 13, borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.45)', boxSizing: 'border-box', marginBottom: 8, fontFamily: 'inherit' },
  btnEnviar: { width: '100%', padding: 12, background: '#34d399', color: '#232a37', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 10 },
  acoes: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  btnAcao: { padding: '9px 12px', background: '#60a5fa', color: '#232a37', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer' },
  btnFechar: { padding: '9px 12px', background: '#ffffff', color: '#5b6b84', border: '0.5px solid rgba(15,23,42,0.11)', borderRadius: 8, fontSize: 12, cursor: 'pointer' },
}

export default function RevisaoIABolsaFamilia() {
  const { profile } = useAuth()
  const ehAdmin = profile?.role === 'admin' || IDS_SUPERVISOR_BOARD.includes(profile?.id)
  const minhaOp = OPERACAO_USUARIOS[profile?.id] || null            // operação licenciada do usuário (null = KR)
  const ehSupervisorOp = SUPERVISORAS_OPERACAO.includes(profile?.id) // supervisora licenciada: vê TODA a operação dela
  const meuTime = SUPERVISORAS_TIME[profile?.id] || null              // supervisora de time interno: vê só os leads das vendedoras dela
  const ehSupervisorTime = !!meuTime
  const ehSupervisor = ehAdmin || ehSupervisorOp || ehSupervisorTime

  const [board, setBoard] = useState([])
  const [robo, setRobo] = useState({ ligado: true, vivo: true })   // contexto do robô digitador (pra coluna A digitar)
  const [limiarManual, setLimiarManual] = useState(30)             // min na fila sem robô digitar -> pode digitar manual
  const [soVermelhos, setSoVermelhos] = useState(false)
  const [vista, setVista] = useState(null)                         // null = padrão do papel: vendedora abre na FILA, supervisão no funil
  const [vendasMinhas, setVendasMinhas] = useState([])             // vendas p/ o placar do dia (35d)
  const [arrastando, setArrastando] = useState(null)
  const [agentes, setAgentes] = useState([])
  const [filtroAgente, setFiltroAgente] = useState('')
  const [filtroEntrada, setFiltroEntrada] = useState(() => { try { return localStorage.getItem('bf_filtro_entrada') || 'tudo' } catch (_) { return 'tudo' } })
  const [filtroAtividade, setFiltroAtividade] = useState('mes')
  const [filtroAtendimento, setFiltroAtendimento] = useState('todos')
  const [entradaDe, setEntradaDe] = useState(''); const [entradaAte, setEntradaAte] = useState('')
  const [ativDe, setAtivDe] = useState(''); const [ativAte, setAtivAte] = useState('')
  const [linkCrefisa, setLinkCrefisa] = useState('')
  const [lead, setLead] = useState(null)
  const [mensagens, setMensagens] = useState([])
  const [anexos, setAnexos] = useState([])
  const [carregandoAnexos, setCarregandoAnexos] = useState(false)
  const [atualizandoConversa, setAtualizandoConversa] = useState(false)
  const [mostrarMotivos, setMostrarMotivos] = useState(false)
  const [texto, setTexto] = useState('')
  const [sugestao, setSugestao] = useState('')
  const [enviando, setEnviando] = useState(false)

  const carregar = useCallback(async () => {
    if (!profile?.id) return
    const p_agente = ehSupervisor ? (filtroAgente || null) : profile.id
    const fe = faixaData(filtroEntrada, entradaDe, entradaAte)
    const fa = faixaData(filtroAtividade, ativDe, ativAte)
    const [{ data }, ctl, hb] = await Promise.all([
      supabase.rpc('bf_board', {
        p_agente,
        p_entrada_de: fe.de ? fe.de.toISOString() : null,
        p_entrada_ate: fe.ate ? fe.ate.toISOString() : null,
        p_ativ_de: fa.de ? fa.de.toISOString() : null,
        p_ativ_ate: fa.ate ? fa.ate.toISOString() : null,
      }),
      supabase.from('digitador_control').select('ligado').eq('id', 1).single(),
      supabase.from('digitador_heartbeat').select('ultimo_ping').order('ultimo_ping', { ascending: false }).limit(1),
    ])
    const ping = (hb.data || [])[0]?.ultimo_ping
    setRobo({
      ligado: ctl.data ? ctl.data.ligado !== false : true,
      vivo: !!ping && (Date.now() - new Date(ping).getTime()) < 120000,
    })
    // Operação licenciada só enxerga os leads da própria operação
    const rows = (data || []).filter(l =>
      (!minhaOp || (l.operacao || 'kr') === minhaOp) &&
      (!meuTime || meuTime.includes(l.bf_agente_id)))
    setBoard(rows)
  }, [profile, ehSupervisor, minhaOp, filtroAgente, filtroEntrada, filtroAtividade, entradaDe, entradaAte, ativDe, ativAte])

  useEffect(() => { carregar(); const t = setInterval(carregar, 45000); return () => clearInterval(t) }, [carregar])

  useEffect(() => {
    supabase.from('app_config').select('valor').eq('chave', 'bf_link_crefisa').single()
      .then(({ data }) => setLinkCrefisa(data?.valor || ''))
    supabase.from('app_config').select('valor').eq('chave', 'bf_digitar_manual_min').single()
      .then(({ data }) => { const v = parseInt(data?.valor, 10); if (v > 0) setLimiarManual(v) })
    const idsAgentes = ehAdmin ? IDS_AGENTES_BF : (ehSupervisorOp ? (OPERACAO_VENDEDORAS[minhaOp] || []) : (meuTime || []))
    if (idsAgentes.length) {
      supabase.from('profiles').select('id, nome').in('id', idsAgentes).order('nome')
        .then(({ data }) => setAgentes(data || []))
    }
  }, [ehAdmin, ehSupervisorOp, minhaOp])

  // Recarrega mensagens + anexos de um lead (usado ao abrir, no auto-refresh e no botão)
  const recarregarConversa = useCallback(async (l, comLoading) => {
    if (!l) return
    if (comLoading) setAtualizandoConversa(true)
    try {
      // Fonte primaria: espelho ao vivo do Chatwoot (inclui msgs digitadas pela supervisora na mao)
      let usouChatwoot = false
      if (l.chatwoot_conversation_id) {
        const { data: res } = await supabase.functions.invoke('bf-conversa', {
          body: { conversation_id: l.chatwoot_conversation_id, limit: 12 },
        })
        if (res?.ok) {
          setMensagens(res.mensagens || [])
          setAnexos(res.anexos || [])
          usouChatwoot = true
        }
      }
      // Fallback: Chatwoot fora do ar ou lead sem conversation_id -> usa o banco
      if (!usouChatwoot) {
        const { data } = await supabase.rpc('bf_mensagens', { p_lead_id: l.id, p_limit: 12 })
        setMensagens(data || [])
      }
    } finally { if (comLoading) setAtualizandoConversa(false) }
  }, [])

  async function abrirCard(l) {
    setLead(l)
    setMostrarMotivos(false)
    const sug = sugestaoPara(l, linkCrefisa)
    setSugestao(sug); setTexto(sug)
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

  async function disparar(acao, textoForcado) {
    if (!lead) return
    setEnviando(true)
    const t = textoForcado !== undefined ? textoForcado : texto
    const { data, error } = await supabase.functions.invoke('bf-disparar-mensagem', {
      body: {
        lead_id: lead.id,
        texto: t && t.trim() ? t.trim() : null,
        agente_id: profile?.id,
        acao: acao || null,
        sugestao_ia: sugestao,
        editado: (t || '').trim() !== sugestao.trim(),
      },
    })
    setEnviando(false)
    if (error || !data?.ok) { alert('Erro: ' + (error?.message || data?.erro || 'falhou')); return }
    setLead(null); setTexto(''); setAnexos([]); carregar()
  }

  // Handoff IA<->humano: 'assumir' pausa a Ana (flag + label humano_assumiu), 'devolver' reativa.
  // Mexe nos DOIS gates de uma vez via edge bf-handoff (banco + Chatwoot).
  async function handoff(c, acao) {
    if (!c) return
    setEnviando(true)
    const { data, error } = await supabase.functions.invoke('bf-handoff', {
      body: { lead_id: c.id, acao, agente_id: profile?.id },
    })
    setEnviando(false)
    if (error || !data?.ok) { alert('Erro no handoff: ' + (error?.message || data?.erro || 'falhou')); return }
    const pausar = acao === 'assumir'
    setLead({ ...c, ana_pausada: pausar, bf_em_tratamento: pausar })
    carregar()
  }

  // Filtro de entrada persistente (o "a partir de agora" sobrevive a reload)
  const mudarEntrada = (v) => {
    setFiltroEntrada(v)
    try {
      localStorage.setItem('bf_filtro_entrada', v)
      if (v === 'agora' && !localStorage.getItem('bf_corte_apartir')) localStorage.setItem('bf_corte_apartir', new Date().toISOString())
    } catch (_) { /* sem storage */ }
  }
  const redefinirCorte = () => {
    if (!window.confirm('Zerar o corte pra AGORA? Só vai contar quem entrar daqui pra frente.')) return
    try { localStorage.setItem('bf_corte_apartir', new Date().toISOString()) } catch (_) { /* ok */ }
    carregar()
  }
  let corteLabel = ''
  try { const cx = localStorage.getItem('bf_corte_apartir'); if (cx) corteLabel = new Date(cx).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch (_) { /* ok */ }

  // Placar do dia: vendas pra régua de meta (vendedora vê as dela; supervisão vê do time)
  useEffect(() => {
    if (!profile?.id) return
    let vivo = true
    supabase.rpc('bf_vendas_painel', { p_agente: ehSupervisor ? null : profile.id })
      .then(({ data }) => { if (vivo) setVendasMinhas(data || []) })
    return () => { vivo = false }
  }, [profile?.id, ehSupervisor, board.length])

  // "Tô tratando no meu WhatsApp": tira o card do board (vai pra aba própria) e pausa a Ana.
  // Devolver: religa a Ana e o card volta pro funil. O handoff pode falhar (ex: sem conversa
  // no Chatwoot) sem travar a marcação — a Ana só age no Chatwoot mesmo.
  async function marcarWhats(c) {
    if (!c) return
    if (!window.confirm(`📲 Marcar "${c.nome || 'lead'}" como EM TRATAMENTO NO SEU WHATSAPP?\n\nO card sai do board (vai pra aba 💬 Meu WhatsApp) e a Ana é pausada nesse cliente.`)) return
    setEnviando(true)
    try { await supabase.functions.invoke('bf-handoff', { body: { lead_id: c.id, acao: 'assumir', agente_id: profile?.id } }) } catch (_) { /* segue */ }
    const { error } = await supabase.rpc('bf_whats_pessoal', { p_lead_id: c.id, p_ligar: true, p_agente: profile?.id })
    setEnviando(false)
    if (error) { alert('Erro ao marcar: ' + error.message); return }
    setLead(null); carregar()
  }
  async function devolverWhats(c) {
    if (!c) return
    if (!window.confirm(`↩ Devolver "${c.nome || 'lead'}" pro board?\n\nA Ana volta a atender esse cliente no Chatwoot.`)) return
    setEnviando(true)
    const { error } = await supabase.rpc('bf_whats_pessoal', { p_lead_id: c.id, p_ligar: false, p_agente: profile?.id })
    if (!error) { try { await supabase.functions.invoke('bf-handoff', { body: { lead_id: c.id, acao: 'devolver', agente_id: profile?.id } }) } catch (_) { /* segue */ } }
    setEnviando(false)
    if (error) { alert('Erro ao devolver: ' + error.message); return }
    setLead(null); carregar()
  }

  // "Venda feita": pede o valor da proposta, grava em bf_vendas (1 por lead; re-registrar
  // atualiza o valor), conclui o lead e alimenta o painel de Vendas. Nada de card sumir.
  async function registrarVenda(c) {
    if (!c) return
    const raw = window.prompt(`💰 VENDA FEITA — ${c.nome || 'lead'}\n\nValor da proposta (R$):`, c.valor || '')
    if (raw == null) return
    const t = String(raw).replace('R$', '').trim()
    const valor = t.includes(',') ? parseFloat(t.replace(/\./g, '').replace(',', '.')) : parseFloat(t)
    if (!valor || isNaN(valor) || valor <= 0) { alert('Valor inválido. Ex: 601,55'); return }
    if (!window.confirm(`Confirmar VENDA de R$ ${valor.toFixed(2).replace('.', ',')} para "${c.nome || 'lead'}"?\n\nO card vai pra coluna Concluído e a venda entra no painel 💰 Vendas.`)) return
    setEnviando(true)
    const { data, error } = await supabase.rpc('bf_venda_registrar', { p_lead_id: c.id, p_agente: profile?.id, p_valor: valor })
    setEnviando(false)
    if (error || data?.erro) { alert('Erro ao registrar: ' + (error?.message || data?.erro)); return }
    setLead(null); carregar()
  }

  // Supervisão reatribui o atendimento: tira de uma atendente e manda pra outra (Bruno/Egle)
  async function reatribuir(c, agenteNovo) {
    if (!c || !agenteNovo) return
    const nomeNovo = (agentes.find(a => a.id === agenteNovo) || {}).nome || 'a vendedora'
    if (!window.confirm(`↪ Reatribuir "${c.nome || 'lead'}" ${c.agente_nome ? `de ${c.agente_nome} ` : ''}para ${nomeNovo}?`)) return
    setEnviando(true)
    const { data, error } = await supabase.rpc('bf_reatribuir', { p_lead_id: c.id, p_agente_novo: agenteNovo })
    setEnviando(false)
    if (error || data?.erro) { alert('Erro ao reatribuir: ' + (error?.message || data?.erro)); return }
    setLead(null); carregar()
  }

  // Nega o lead com um motivo (codigo estavel de MOTIVOS_NEGADO)
  async function negar(c, motivoCodigo) {
    if (!c || !motivoCodigo) return
    setEnviando(true)
    try {
      await supabase.rpc('bf_negar', { p_lead_id: c.id, p_agente_id: profile?.id, p_motivo: motivoCodigo })
      setMostrarMotivos(false)
      setLead(null)
      carregar()
    } finally { setEnviando(false) }
  }

  async function distribuir() {
    const { data } = await supabase.rpc('bf_atribuir_agentes')
    alert(data?.ok ? `✅ ${data.atribuidos} leads distribuídos` : (data?.erro || 'Erro'))
    carregar()
  }

  // ===== Status de DIGITAÇÃO no card "A digitar" (pedido 13/08) =====
  // O atendente precisa saber: já digitada? robô falhou (motivo)? bloqueada na fila (motivo)?
  // ou aguardando robô (timer) — e após X min sem digitar, PODE DIGITAR MANUAL.
  const tagDig = (bg, cor, txt) => (
    <div style={{ fontSize: 10, background: bg, color: cor, borderRadius: 6, padding: '3px 7px', marginTop: 4, fontWeight: 700 }}>{txt}</div>
  )
  function statusDigitacao(c) {
    if (c.dig_protocolo || c.dig_em) {
      return tagDig('rgba(52,211,153,.16)', '#059669', `🤖✅ DIGITADA pelo robô${c.dig_protocolo ? ` · prot. ${c.dig_protocolo}` : ''}`)
    }
    if (['erro', 'revisar', 'revisar_humano', 'faltando_dados'].includes(c.dig_status)) {
      return (
        <>
          {tagDig('rgba(248,113,113,.16)', '#dc2626', `🤖❌ robô NÃO digitou — ${(c.dig_detalhe || c.dig_status).slice(0, 60)}`)}
          {tagDig('rgba(167,139,250,.18)', '#7c3aed', '🖐 DIGITAR MANUAL')}
        </>
      )
    }
    // Robô fora do ar ou desligado: digitação é MANUAL e IMEDIATA — sem falar em "esperar robô".
    if (!robo.vivo || !robo.ligado) {
      return tagDig('rgba(167,139,250,.18)', '#7c3aed', '🖐 DIGITAR AGORA — manual')
    }
    if (c.fila_apto === false) {
      return (
        <>
          {tagDig('rgba(251,191,36,.14)', '#b45309', `⚠ ${(c.fila_motivo || 'dados faltando').slice(0, 60)}`)}
          {tagDig('rgba(167,139,250,.18)', '#7c3aed', '🖐 DIGITAR MANUAL')}
        </>
      )
    }
    if (c.minutos_parado >= limiarManual) {
      return (
        <>
          {tagDig('rgba(251,191,36,.14)', '#b45309', `⏱ na fila do robô há ${c.minutos_parado} min e nada`)}
          {tagDig('rgba(167,139,250,.18)', '#7c3aed', `🖐 PODE DIGITAR MANUAL (+${limiarManual}min)`)}
        </>
      )
    }
    return tagDig('rgba(96,165,250,.12)', '#2563eb', `🤖 na fila do robô · ${c.minutos_parado} min ⏱`)
  }

  // Selo de tratamento no card, respeitando quem está olhando
  function seloTratamento(c) {
    if (c.bf_em_tratamento) {
      const aviso = c.cliente_respondeu ? <span style={s.tagRespondeu}>💬 cliente respondeu</span> : null
      if (ehSupervisor) {
        return <>{aviso}<span style={s.tagTratSup}>🟢 {c.agente_nome ? `${primeiroNome(c.agente_nome)} tratando` : 'em tratamento'}</span></>
      }
      return <>{aviso}<span style={s.tagTrat}>🟢 Você está tratando</span></>
    }
    if (ehSupervisor && (c.cor === 'vermelho' || c.cor === 'amarelo') && c.sub_estado !== 'BF_CONCLUIDO') {
      return <span style={s.tagNinguem}>⚪ ninguém pegou</span>
    }
    return null
  }

  // Todo mundo (vendedora e admin) ve o funil inteiro
  const colunasVisiveis = COLUNAS
  const moverEtapa = async (leadId, colunaDestino) => {
    const { data, error } = await supabase.rpc('bf_mover_etapa', { p_lead_id: leadId, p_agente_id: profile?.id, p_coluna_destino: colunaDestino })
    if (error || !data?.ok) { alert('Não moveu: ' + (error?.message || data?.erro || 'erro')); return }
    carregar()
  }

  // Em tratamento no WhatsApp pessoal: fora do funil, aba própria.
  // Atendente vê os DELA; supervisor/admin vê de todo o escopo do board.
  const noWhats = board.filter(c => c.whats_pessoal)
  const meusWhats = ehSupervisor ? noWhats : noWhats.filter(c => c.bf_agente_id === profile?.id)

  // Vista ativa: vendedora nasce na FILA (modo foco), supervisão no funil (mapa).
  const vAtiva = vista || (ehSupervisor ? 'funil' : 'fila')

  // ===== MINHA FILA (modo esteira): lista única priorizada, cada item com a AÇÃO =====
  const fila = board
    .filter(c => c.sub_estado !== 'BF_CONCLUIDO' && !SUB_ESTADOS_NEGADO.includes(c.sub_estado) && !c.whats_pessoal)
    .map(c => ({ ...c, _score: scoreFila(c) }))
    .sort((a, b) => b._score - a._score)

  // ===== PLACAR DO DIA (metas Bruno: 10 vendas/dia · conversão >= 15% da carteira) =====
  const hoje0 = (() => { const x = new Date(); x.setHours(0, 0, 0, 0); return x })()
  const vHoje = vendasMinhas.filter(v => new Date(v.criado_em) >= hoje0)
  const volHoje = vHoje.reduce((a, v) => a + Number(v.valor || 0), 0)
  const carteira = Math.max(1, board.length)
  const convPct = Math.round((vendasMinhas.length / carteira) * 100) // vendas 35d / carteira atual

  let visiveis = soVermelhos ? board.filter(c => c.cor === 'vermelho') : board
  visiveis = visiveis.filter(c => !c.whats_pessoal) // quem está no Whats pessoal não polui o funil
  // VENDEDORA vê: quem TRAVOU (🟡 10min / 🔴 20min), quem ELA está tratando,
  // e SEMPRE quem já mandou TODA a documentação (docs_completos) — parado ou não, em qualquer etapa.
  if (!ehSupervisor) visiveis = visiveis.filter(c => c.cor === 'vermelho' || c.cor === 'amarelo' || c.bf_em_tratamento || c.docs_completos)
  if (filtroAtendimento === 'respondido') visiveis = visiveis.filter(c => c.humano_respondeu)
  else if (filtroAtendimento === 'sem') visiveis = visiveis.filter(c => !c.humano_respondeu)
  const totalVermelhos = board.filter(c => c.cor === 'vermelho').length
  const semDono = board.filter(c => !c.bf_em_tratamento && (c.cor === 'vermelho' || c.cor === 'amarelo') && c.sub_estado !== 'BF_CONCLUIDO').length

  return (
    <div>
      <div style={s.title}>🩷 Revisão IA — Bolsa Família</div>
      <div style={s.sub}>
        {ehSupervisor ? 'Quadro geral do funil BF. Vermelho = travado, agente precisa destravar.' : 'Aparece quem TRAVOU (🟡 10min · 🔴 20min) e TODO cliente com documentação completa — esses ficam até concluir.'}
      </div>

      <div style={{ display: 'inline-flex', background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.1)', borderRadius: 10, padding: 3, gap: 2, marginBottom: 10, flexWrap: 'wrap' }}>
        <button onClick={() => setVista('fila')}
          style={{ padding: '7px 14px', fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: 'pointer', border: 'none', background: vAtiva === 'fila' ? 'rgba(244,114,182,.16)' : 'transparent', color: vAtiva === 'fila' ? '#db2777' : '#5b6b84' }}>
          🎯 {ehSupervisor ? 'Esteira' : 'Minha Fila'} ({fila.length})
        </button>
        {ehSupervisor && (
          <button onClick={() => setVista('cockpit')}
            style={{ padding: '7px 14px', fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: 'pointer', border: 'none', background: vAtiva === 'cockpit' ? 'rgba(96,165,250,.16)' : 'transparent', color: vAtiva === 'cockpit' ? '#2563eb' : '#5b6b84' }}>
            🧭 Cockpit
          </button>
        )}
        <button onClick={() => setVista('funil')}
          style={{ padding: '7px 14px', fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: 'pointer', border: 'none', background: vAtiva === 'funil' ? '#dde5f0' : 'transparent', color: vAtiva === 'funil' ? '#0f172a' : '#5b6b84' }}>
          📋 Funil{ehSupervisor ? ' (mapa)' : ''}
        </button>
        <button onClick={() => setVista('whats')}
          style={{ padding: '7px 14px', fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: 'pointer', border: 'none', background: vAtiva === 'whats' ? 'rgba(52,211,153,.18)' : 'transparent', color: vAtiva === 'whats' ? '#059669' : '#5b6b84' }}>
          💬 {ehSupervisor ? 'WhatsApp do time' : 'Meu WhatsApp'} ({meusWhats.length})
        </button>
        <button onClick={() => setVista('vendas')}
          style={{ padding: '7px 14px', fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: 'pointer', border: 'none', background: vAtiva === 'vendas' ? 'rgba(251,191,36,.16)' : 'transparent', color: vAtiva === 'vendas' ? '#b45309' : '#5b6b84' }}>
          💰 Vendas
        </button>
      </div>

      {(vAtiva === 'fila' || vAtiva === 'cockpit') && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          <select style={s.chip} value={filtroEntrada} onChange={e => mudarEntrada(e.target.value)} title="Considerar leads que entraram em:">
            {OPCOES_DATA.map(([v, l]) => <option key={v} value={v}>Entrada: {l}</option>)}
          </select>
          {filtroEntrada === 'custom' && (<>
            <input type="date" style={s.chip} value={entradaDe} onChange={e => setEntradaDe(e.target.value)} />
            <input type="date" style={s.chip} value={entradaAte} onChange={e => setEntradaAte(e.target.value)} />
          </>)}
          {filtroEntrada === 'agora' && (<>
            {corteLabel && <span style={{ fontSize: 11, color: '#5b6b84' }}>corte: {corteLabel}</span>}
            <button style={s.chip} onClick={redefinirCorte}>↺ zerar corte (agora)</button>
          </>)}
          <select style={s.chip} value={filtroAtividade} onChange={e => setFiltroAtividade(e.target.value)} title="Última atividade">
            {OPCOES_DATA.map(([v, l]) => <option key={v} value={v}>Atividade: {l}</option>)}
          </select>
          <span style={{ fontSize: 11, color: '#64748b' }}>fila, metas e cockpit respeitam esse filtro — estoque antigo fica de fora</span>
        </div>
      )}

      {vAtiva === 'fila' && (
        <div>
          {/* placar do dia — a meta na cara */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 10, marginBottom: 12 }}>
            <div style={{ background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#5b6b84', textTransform: 'uppercase', letterSpacing: '0.06em' }}>🎯 Vendas hoje</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: vHoje.length >= META_VENDAS_DIA ? '#059669' : '#0f172a' }}>
                {vHoje.length}<span style={{ fontSize: 14, color: '#64748b' }}> / {ehSupervisor ? META_VENDAS_DIA + ' por vendedora' : META_VENDAS_DIA}</span>
              </div>
              <div style={{ height: 5, background: '#e2e8f0', borderRadius: 3, marginTop: 6, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, (vHoje.length / META_VENDAS_DIA) * 100)}%`, background: vHoje.length >= META_VENDAS_DIA ? '#34d399' : '#f472b6', borderRadius: 3 }} />
              </div>
            </div>
            <div style={{ background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#5b6b84', textTransform: 'uppercase', letterSpacing: '0.06em' }}>💰 Volume hoje</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#b45309' }}>{'R$ ' + volHoje.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            </div>
            <div style={{ background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#5b6b84', textTransform: 'uppercase', letterSpacing: '0.06em' }}>📈 Conversão da carteira</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: convPct >= META_CONVERSAO_PCT ? '#059669' : convPct >= META_CONVERSAO_PCT / 2 ? '#b45309' : '#dc2626' }}>{convPct}%</div>
              <div style={{ fontSize: 10, color: '#64748b' }}>meta ≥ {META_CONVERSAO_PCT}% · {vendasMinhas.length} venda(s) / {carteira} sob gestão</div>
            </div>
            <div style={{ background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#5b6b84', textTransform: 'uppercase', letterSpacing: '0.06em' }}>📋 Na fila agora</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#0f172a' }}>{fila.length}</div>
              <div style={{ fontSize: 10, color: '#64748b' }}>atenda de cima pra baixo — a ordem já é a prioridade</div>
            </div>
          </div>

          {/* a fila em si: nº1 = próximo cliente. Sem decisão, só execução. */}
          {fila.length === 0 && (
            <div style={{ background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 12, padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
              Fila zerada. 🎉 Confere o 💬 Meu WhatsApp ou puxa leads novos com a supervisão.
            </div>
          )}
          {fila.slice(0, 100).map((c, i) => {
            const [emoji, corSla, bgSla] = nivelSla(c)
            const sla = SLA_ETAPA[c.sub_estado] || 60
            return (
              <div key={c.id} onClick={() => abrirCard(c)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, background: i === 0 ? 'rgba(244,114,182,.07)' : '#ffffff', border: i === 0 ? '1px solid rgba(244,114,182,.45)' : '0.5px solid rgba(15,23,42,0.07)', borderLeft: `3px solid ${corSla}`, borderRadius: 12, padding: '10px 14px', marginBottom: 8, cursor: 'pointer' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: i === 0 ? '#db2777' : '#64748b', minWidth: 30, textAlign: 'center' }}>{i + 1}º</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{c.nome || 'Sem nome'}</span>
                    {c.valor && <span style={{ fontSize: 12, color: '#b45309', fontWeight: 700 }}>R$ {c.valor}</span>}
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#5b6b84', background: '#f1f5f9', borderRadius: 6, padding: '2px 7px' }}>{(COLUNAS.find(x => x[0] === c.sub_estado) || [])[1] || c.sub_estado}</span>
                    {ehSupervisor && c.agente_nome && <span style={{ fontSize: 10, color: '#5b6b84' }}>👤 {c.agente_nome}</span>}
                    <span style={{ fontSize: 10, fontWeight: 700, color: corSla, background: bgSla, borderRadius: 6, padding: '2px 7px' }}>{emoji} {c.minutos_parado} min (SLA {sla})</span>
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: i === 0 ? '#db2777' : '#334155', marginTop: 4 }}>{acaoSugerida(c)}</div>
                </div>
                {c.chatwoot_conversation_id && (
                  <a href={linkChatwoot(c)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={s.cardChat} title="Abrir conversa no Chatwoot">💬</a>
                )}
              </div>
            )
          })}
          {fila.length > 100 && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Mostrando os 100 mais prioritários de {fila.length}.</div>}
        </div>
      )}

      {vAtiva === 'funil' && (
      <div style={s.topo}>
        <button style={{ ...s.chip, ...(soVermelhos ? s.chipOn : {}) }} onClick={() => setSoVermelhos(v => !v)}>
          🔴 Só vermelhos ({totalVermelhos})
        </button>
        <select style={s.chip} value={filtroEntrada} onChange={e => mudarEntrada(e.target.value)} title="Data de entrada do lead">
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
        <select style={s.chip} value={filtroAtendimento} onChange={e => setFiltroAtendimento(e.target.value)} title="Atendimento humano">
          <option value="todos">Atendimento: todos</option>
          <option value="respondido">✅ Já respondido</option>
          <option value="sem">⚠️ Sem resposta</option>
        </select>
        <span style={s.kpi}>No funil: <strong>{board.length - noWhats.length}</strong></span>
        <span style={s.kpi}>📲 Whats do time: <strong>{noWhats.length}</strong></span>
        <span style={s.kpi}>Total que entrou: <strong>{board.length}</strong></span>
        <span style={s.kpi}>Concluídos: <strong>{board.filter(c => c.sub_estado === 'BF_CONCLUIDO').length}</strong></span>
        {ehSupervisor && <span style={s.kpi}>⚪ Sem ninguém: <strong>{semDono}</strong></span>}
        {ehSupervisor && (
          <>
            <select style={{ ...s.chip, cursor: 'pointer' }} value={filtroAgente} onChange={e => setFiltroAgente(e.target.value)}>
              <option value="">Todos os agentes</option>
              {agentes.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
            <button style={s.chip} onClick={distribuir}>⚖️ Distribuir leads novos</button>
          </>
        )}
        <button style={s.chip} onClick={carregar}>🔄 Atualizar</button>
      </div>
      )}

      {vAtiva === 'whats' && (
        <div>
          <div style={{ fontSize: 12, color: '#5b6b84', marginBottom: 10 }}>
            Clientes em tratamento no WhatsApp pessoal — fora do funil, com a Ana pausada. Terminou? <b style={{ color: '#0f172a' }}>Devolver pro board</b> religa a Ana e o card volta pras colunas.
          </div>
          {meusWhats.length === 0 && (
            <div style={{ background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 12, padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
              Ninguém no WhatsApp pessoal agora. Pra levar um cliente pra cá, abra o card no funil e clique em “📲 Tratando no meu Whats”.
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {meusWhats.map(c => (
              <div key={c.id} style={{ background: '#ffffff', border: '1px solid rgba(52,211,153,.35)', borderLeft: '3px solid #34d399', borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>{c.nome || 'Sem nome'}</div>
                <div style={{ fontSize: 11, color: '#5b6b84', marginBottom: 6 }}>
                  {c.valor ? `R$ ${c.valor} · ` : ''}{(COLUNAS.find(x => x[0] === c.sub_estado) || [])[1] || c.sub_estado}
                  {c.whats_pessoal_em ? ` · no Whats desde ${new Date(c.whats_pessoal_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
                </div>
                {ehSupervisor && c.agente_nome && <div style={{ fontSize: 11, color: '#5b6b84', marginBottom: 6 }}>👤 {c.agente_nome}</div>}
                <div style={{ fontSize: 11, color: '#5b6b84', marginBottom: 8 }}>
                  📞 {c.tel || '—'} · {c.docs_completos ? '📄 docs completos' : `🪪 ${c.doc_rg_frente ? '✅' : '❌'}/${c.doc_rg_verso ? '✅' : '❌'} · 📄 ${c.doc_extrato ? '✅' : '❌'}`}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button style={{ fontSize: 12, padding: '6px 12px', background: '#fbbf24', color: '#232a37', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }} disabled={enviando} onClick={() => registrarVenda(c)}>💰 Venda feita</button>
                  <button style={{ fontSize: 12, padding: '6px 12px', background: 'transparent', color: '#2563eb', border: '1px solid #60a5fa', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }} disabled={enviando} onClick={() => devolverWhats(c)}>↩ Devolver pro board</button>
                  {c.chatwoot_conversation_id && (
                    <a href={linkChatwoot(c)} target="_blank" rel="noreferrer" style={s.cardChat} title="Abrir conversa no Chatwoot">💬 Chatwoot</a>
                  )}
                  <span style={{ fontSize: 10, color: '#7c3aed', fontWeight: 700 }}>🧑 Ana pausada</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {vAtiva === 'vendas' && <PainelVendas profile={profile} ehSupervisor={ehSupervisor} />}

      {vAtiva === 'cockpit' && ehSupervisor && (
        <PainelCockpit board={board} vendas={vendasMinhas} fila={fila}
          verFilaDe={(agId) => { setFiltroAgente(agId); setVista('fila') }}
          abrirCard={abrirCard} linkChatwoot={linkChatwoot} />
      )}

      {ehSupervisor && vAtiva === 'funil' && confAberta && conferencia && (
        <div style={{ background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 12, padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
            🔍 Conferência do período — landing {conferencia.landing} · no funil {conferencia.no_funil} · 📲 whats {conferencia.whats_do_time}
            {Number(conferencia.sem_conversa_chatwoot || 0) > 0 && <span style={{ color: '#dc2626' }}> · ⚠ {conferencia.sem_conversa_chatwoot} lead(s) SEM conversa no Chatwoot</span>}
          </div>
          <div style={{ fontSize: 12, color: '#5b6b84', marginBottom: 8 }}>
            Fora do funil: {Object.entries(conferencia.resumo_fora || {}).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ') || 'nada — tudo dentro'}
          </div>
          {(conferencia.fora_lista || []).length > 0 && (
            <div style={{ maxHeight: 220, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: '#5b6b84' }}>Telefone</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: '#5b6b84' }}>Nome</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: '#5b6b84' }}>Motivo de estar fora</th>
                </tr></thead>
                <tbody>
                  {(conferencia.fora_lista || []).map((x, i) => (
                    <tr key={i} style={{ borderTop: '0.5px solid rgba(15,23,42,0.06)' }}>
                      <td style={{ padding: '4px 8px', color: '#0f172a' }}>{x.tel}</td>
                      <td style={{ padding: '4px 8px', color: '#0f172a' }}>{x.nome}</td>
                      <td style={{ padding: '4px 8px', color: (x.motivo || '').startsWith('consulta_') ? '#dc2626' : x.motivo === 'nao_abriu_whats' ? '#b45309' : '#5b6b84' }}>
                        {(x.motivo || '').replace(/_/g, ' ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {vAtiva === 'funil' && (
      <div style={s.board}>
        {colunasVisiveis.map(([key, label]) => {
          let cards = key === 'NEGADO'
            ? visiveis.filter(c => SUB_ESTADOS_NEGADO.includes(c.sub_estado))
            : key === 'OUTROS'
            ? visiveis.filter(c => !CHAVES_CONHECIDAS.has(c.sub_estado))
            : key === 'BF_DADOS_PESSOAIS'
            ? visiveis.filter(c => SUB_ESTADOS_DADOS_FINAIS.includes(c.sub_estado))
            : visiveis.filter(c => c.sub_estado === key)
          // Solta em qualquer coluna do funil; Negados so pelo botao Negar (motivo), Outros nao recebe
          const ehDestino = key !== 'NEGADO' && key !== 'OUTROS'
          const destaque = key === 'DOCS_COMPLETOS'
          return (
            <div key={key}
              style={{ ...s.col, ...(destaque ? { background: 'rgba(52,211,153,.14)', border: '2px solid #34d399' } : {}), ...(ehDestino && arrastando ? { outline: '2px dashed #60a5fa' } : {}) }}
              onDragOver={ehDestino ? (e => e.preventDefault()) : undefined}
              onDrop={ehDestino ? (e => { e.preventDefault(); if (arrastando) moverEtapa(arrastando, key); setArrastando(null) }) : undefined}>
              <div style={{ ...s.colTitulo, ...(destaque ? { color: '#059669', fontWeight: 700 } : {}) }}>
                <span>{destaque ? '⭐ ' : ''}{label}</span><span>{cards.length}</span>
              </div>
              {cards.map(c => {
                return (
                <div key={c.id} draggable
                  onDragStart={(e) => { try { e.dataTransfer.setData('text/plain', String(c.id)); e.dataTransfer.effectAllowed = 'move' } catch (_) {} setArrastando(c.id) }}
                  onDragEnd={() => setArrastando(null)}
                  style={{ ...s.card, ...(CORES[c.cor] || CORES.normal), cursor: 'grab' }}
                  onClick={() => abrirCard(c)}>
                  <div style={s.cardNome}>{c.nome || 'Sem nome'}</div>
                  <div style={s.cardMeta}>
                    {c.valor ? `R$ ${c.valor} · ` : ''}{c.cor === 'vermelho' ? `🔴 parado há ${c.minutos_parado} min` : c.cor === 'amarelo' ? `🟡 ${c.minutos_parado} min` : `${c.minutos_parado} min`}
                  </div>
                  {ehSupervisor && c.agente_nome && <div style={s.cardMeta}>👤 {c.agente_nome}</div>}
                  {key === 'NEGADO' && <div style={s.tagMotivo}>❌ {labelMotivo(c)}</div>}
                  {key === 'DOCS_COMPLETOS' && statusDigitacao(c)}
                  {key === 'DOCS_COMPLETOS' && c.fila_aviso && <div style={{ fontSize: 10, color: '#b45309', marginTop: 2 }}>⚠ conferir CPF do extrato após digitar</div>}
                  {key !== 'NEGADO' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      <span style={c.ana_pausada ? s.badgeHumano : s.badgeIA}>{c.ana_pausada ? '🧑 humano' : '🤖 IA'}</span>
                      {c.chatwoot_conversation_id && (
                        <a href={linkChatwoot(c)} target="_blank" rel="noreferrer" draggable={false} onClick={e => e.stopPropagation()} onDragStart={e => e.preventDefault()} style={s.cardChat} title="Abrir conversa no Chatwoot">💬</a>
                      )}
                    </div>
                  )}
                  {key !== 'NEGADO' && seloTratamento(c)}
                </div>
                )
              })}
            </div>
          )
        })}
      </div>
      )}

      {lead && (
        <div style={s.overlay} onClick={() => setLead(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>{lead.nome}</div>
            <div style={{ fontSize: 12, color: '#5b6b84', marginBottom: 10 }}>
              {(COLUNAS.find(c => c[0] === lead.sub_estado) || [])[1] || lead.sub_estado} · parado há {lead.minutos_parado} min
            </div>

            <div style={s.ficha}>
              <div>📞 {lead.tel || '—'}</div>
              <div>💰 R$ {lead.valor || '—'} ({lead.tipo || '—'})</div>
              <div>🔢 NIS: {lead.nis || '—'}</div>
              <div>💵 Renda: {lead.renda || '—'}</div>
              <div>🪪 RG: {lead.doc_rg_frente ? '✅' : '❌'} frente · {lead.doc_rg_verso ? '✅' : '❌'} verso</div>
              <div>📄 Extrato: {lead.doc_extrato ? '✅' : '❌'}</div>
            </div>

            {lead.sub_estado === 'DOCS_COMPLETOS' && (
              <div style={{ background: '#f1f5f9', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 10, padding: 10, marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#5b6b84', marginBottom: 4 }}>🤖 Digitação (robô)</div>
                {statusDigitacao(lead)}
                {lead.dig_detalhe && <div style={{ fontSize: 11, color: '#5b6b84', marginTop: 6 }}>detalhe: {lead.dig_detalhe}</div>}
                {lead.fila_aviso && <div style={{ fontSize: 11, color: '#b45309', marginTop: 4 }}>⚠ {lead.fila_aviso}</div>}
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

            <div style={{ background: lead.ana_pausada ? 'rgba(167,139,250,.10)' : 'rgba(96,165,250,.08)', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 10, padding: 10, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: lead.ana_pausada ? '#7c3aed' : '#2563eb' }}>
                  {lead.ana_pausada ? '🧑 Humano no controle — IA pausada' : '🤖 IA ativa (Ana respondendo)'}
                </span>
                {lead.ana_pausada ? (
                  <button style={{ fontSize: 12, padding: '7px 14px', background: '#60a5fa', color: '#232a37', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }} disabled={enviando} onClick={() => handoff(lead, 'devolver')}>🤖 Devolver pra IA</button>
                ) : (
                  <button style={{ fontSize: 12, padding: '7px 14px', background: '#a78bfa', color: '#232a37', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }} disabled={enviando} onClick={() => handoff(lead, 'assumir')}>✋ Assumir (pausar IA)</button>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#5b6b84', marginTop: 6 }}>
                {lead.ana_pausada
                  ? 'A Ana não responde enquanto você está no controle. Responda pelo Chatwoot. Clique em "Devolver pra IA" quando terminar.'
                  : 'Ao responder no Chatwoot a IA pausa sozinha. Você também pode assumir aqui pra parar a Ana antes de escrever.'}
                {lead.cliente_respondeu && <span style={{ color: '#b45309', fontWeight: 700 }}> · 💬 o cliente respondeu</span>}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {!lead.whats_pessoal ? (
                <button style={{ fontSize: 12, padding: '7px 14px', background: 'transparent', color: '#059669', border: '1px solid #34d399', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }} disabled={enviando} onClick={() => marcarWhats(lead)}>📲 Tratando no meu Whats</button>
              ) : (
                <button style={{ fontSize: 12, padding: '7px 14px', background: 'transparent', color: '#2563eb', border: '1px solid #60a5fa', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }} disabled={enviando} onClick={() => devolverWhats(lead)}>↩ Devolver pro board</button>
              )}
              <button style={{ fontSize: 12, padding: '7px 14px', background: '#fbbf24', color: '#232a37', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }} disabled={enviando} onClick={() => registrarVenda(lead)}>💰 Venda feita</button>
              {ehSupervisor && agentes.length > 0 && (
                <select value="" disabled={enviando}
                  onChange={e => { if (e.target.value) reatribuir(lead, e.target.value) }}
                  style={{ fontSize: 12, fontWeight: 700, padding: '7px 10px', borderRadius: 8, border: '1px solid #7c3aed', background: 'transparent', color: '#7c3aed', cursor: 'pointer' }}>
                  <option value="">↪ Reatribuir para…</option>
                  {agentes.filter(a => a.id !== lead.bf_agente_id).map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </select>
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
              {mensagens.map((m, i) => (
                <div key={i} style={m.role === 'user' ? s.msgCliente : s.msgAna}>{m.content}</div>
              ))}
              {mensagens.length === 0 && <div style={{ fontSize: 12, color: '#64748b' }}>Sem mensagens.</div>}
            </div>

            {linkChatwoot(lead) ? (
              <a href={linkChatwoot(lead)} target="_blank" rel="noreferrer"
                style={{ display: 'block', textAlign: 'center', textDecoration: 'none', width: '100%', padding: 12, background: '#34d399', color: '#232a37', borderRadius: 10, fontSize: 14, fontWeight: 700, marginBottom: 10, boxSizing: 'border-box' }}>
                💬 Abrir conversa no Chatwoot
              </a>
            ) : (
              <div style={{ fontSize: 12, color: '#dc2626', background: 'rgba(248,113,113,.10)', borderRadius: 8, padding: 10, marginBottom: 10 }}>Sem conversa no Chatwoot vinculada a este lead.</div>
            )}

            <div style={{ fontSize: 12, fontWeight: 600, color: '#5b6b84', marginBottom: 6 }}>Ações de etapa:</div>
            <div style={s.acoes}>
              {lead.sub_estado === 'DOCS_COMPLETOS' && <button style={s.btnAcao} onClick={() => disparar('proposta_digitada', '')} disabled={enviando}>✅ Proposta digitada</button>}
              {lead.sub_estado === 'BF_AGUARDANDO_LINK' && <button style={s.btnAcao} onClick={() => disparar('enviar_link', sugestaoPara({ ...lead, sub_estado: 'BF_LINK_ENVIADO' }, linkCrefisa))} disabled={enviando}>🔗 Enviar link Crefisa</button>}
              {lead.sub_estado === 'BF_LINK_ENVIADO' && <button style={s.btnAcao} onClick={() => disparar('cliente_chamou', '')} disabled={enviando}>📲 Cliente chamou</button>}
              {lead.sub_estado === 'BF_AGUARDANDO_ASSINATURA' && <button style={s.btnAcao} onClick={() => disparar('assinou', sugestaoPara({ ...lead, sub_estado: 'BF_ASSINADO' }, linkCrefisa))} disabled={enviando}>✍️ Assinou</button>}
              {lead.sub_estado === 'BF_ASSINADO' && <button style={s.btnAcao} onClick={() => disparar('concluido', sugestaoPara({ ...lead, sub_estado: 'BF_CONCLUIDO' }, linkCrefisa))} disabled={enviando}>🎉 Dinheiro caiu</button>}
              <button style={s.btnNegar} onClick={() => setMostrarMotivos(v => !v)} disabled={enviando}>❌ Negar / Não quis</button>
              <button style={s.btnFechar} onClick={() => setLead(null)}>Fechar</button>
            </div>

            {mostrarMotivos && (
              <div style={s.painelMotivos}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#5b6b84', marginBottom: 8 }}>Por que está negando?</div>
                <div style={s.motivosGrid}>
                  {MOTIVOS_NEGADO.map(([codigo, texto]) => (
                    <button key={codigo} style={s.btnMotivo} disabled={enviando} onClick={() => negar(lead, codigo)}>{texto}</button>
                  ))}
                </div>
                <button style={{ ...s.btnFechar, marginTop: 8 }} onClick={() => setMostrarMotivos(false)}>Cancelar</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════ PAINEL DE VENDAS (💰) ═══════════════
// Vendedora vê AS DELAS (contagem + volume emprestado); supervisor/admin vê tudo,
// com quebra por vendedora e o toggle de "pago".
function PainelVendas({ profile, ehSupervisor }) {
  const [vendas, setVendas] = useState(null)
  const [msg, setMsg] = useState('')

  const carregarVendas = useCallback(async () => {
    const { data, error } = await supabase.rpc('bf_vendas_painel', { p_agente: ehSupervisor ? null : (profile?.id || null) })
    if (error) { setMsg(error.message); return }
    setVendas(data || [])
  }, [ehSupervisor, profile?.id])
  useEffect(() => { carregarVendas() }, [carregarVendas])

  const fmtV = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const dia0 = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
  const hoje0 = dia0(new Date())
  const ontem0 = new Date(hoje0.getTime() - 86400000)
  const sem0 = new Date(hoje0.getTime() - 6 * 86400000)
  const mes0 = new Date(hoje0.getTime() - 29 * 86400000)
  const lista = vendas || []
  const filtra = (de, ate) => lista.filter(v => { const d = new Date(v.criado_em); return d >= de && (!ate || d < ate) })
  const grupos = [
    ['Hoje', filtra(hoje0)],
    ['Ontem', filtra(ontem0, hoje0)],
    ['Semana (7d)', filtra(sem0)],
    ['Mês (30d)', filtra(mes0)],
  ]
  const soma = (l) => l.reduce((a, v) => a + Number(v.valor || 0), 0)

  // quebra por vendedora no período do mês (só supervisão)
  const porVendedora = {}
  if (ehSupervisor) filtra(mes0).forEach(v => {
    const n = v.agente_nome || '—'
    if (!porVendedora[n]) porVendedora[n] = { qtd: 0, vol: 0 }
    porVendedora[n].qtd++; porVendedora[n].vol += Number(v.valor || 0)
  })

  const togglePago = async (v) => {
    await supabase.rpc('bf_venda_pagar', { p_venda_id: v.id, p_pago: !v.pago })
    carregarVendas()
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: '#5b6b84', marginBottom: 10 }}>
        {ehSupervisor ? 'Todas as vendas registradas pelo botão 💰 Venda feita.' : 'Suas vendas registradas pelo botão 💰 Venda feita — contagem e volume emprestado.'}
      </div>
      {msg && <div style={{ fontSize: 12, color: '#dc2626', background: 'rgba(248,113,113,.08)', border: '0.5px solid rgba(248,113,113,.35)', borderRadius: 10, padding: '9px 12px', marginBottom: 10 }}>{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
        {grupos.map(([lbl, l]) => (
          <div key={lbl} style={{ background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#5b6b84', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{lbl}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{l.length}</div>
            <div style={{ fontSize: 12, color: '#b45309', fontWeight: 700, marginTop: 2 }}>{fmtV(soma(l))}</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>volume emprestado</div>
          </div>
        ))}
      </div>

      {ehSupervisor && Object.keys(porVendedora).length > 0 && (
        <div style={{ background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 8 }}>👤 Por vendedora — mês (30d)</div>
          {Object.entries(porVendedora).sort((a, b) => b[1].vol - a[1].vol).map(([n, x]) => (
            <div key={n} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '0.5px solid rgba(15,23,42,0.04)' }}>
              <span style={{ color: '#334155' }}>{n}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}><b style={{ color: '#0f172a' }}>{x.qtd}</b> venda(s) · <b style={{ color: '#b45309' }}>{fmtV(x.vol)}</b></span>
            </div>
          ))}
        </div>
      )}

      <div style={{ background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 12, padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 8 }}>🧾 Vendas — últimos 35 dias</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={{ textAlign: 'left', fontSize: 10.5, color: '#5b6b84', fontWeight: 600, textTransform: 'uppercase', padding: '8px 10px', borderBottom: '1px solid rgba(15,23,42,0.07)' }}>Quando</th>
            <th style={{ textAlign: 'left', fontSize: 10.5, color: '#5b6b84', fontWeight: 600, textTransform: 'uppercase', padding: '8px 10px', borderBottom: '1px solid rgba(15,23,42,0.07)' }}>Cliente</th>
            {ehSupervisor && <th style={{ textAlign: 'left', fontSize: 10.5, color: '#5b6b84', fontWeight: 600, textTransform: 'uppercase', padding: '8px 10px', borderBottom: '1px solid rgba(15,23,42,0.07)' }}>Vendedora</th>}
            <th style={{ textAlign: 'right', fontSize: 10.5, color: '#5b6b84', fontWeight: 600, textTransform: 'uppercase', padding: '8px 10px', borderBottom: '1px solid rgba(15,23,42,0.07)' }}>Valor</th>
            <th style={{ textAlign: 'left', fontSize: 10.5, color: '#5b6b84', fontWeight: 600, textTransform: 'uppercase', padding: '8px 10px', borderBottom: '1px solid rgba(15,23,42,0.07)' }}>Pago?</th>
          </tr></thead>
          <tbody>
            {!vendas && <tr><td colSpan={ehSupervisor ? 5 : 4} style={{ padding: 16, color: '#64748b', fontSize: 12, textAlign: 'center' }}>Carregando...</td></tr>}
            {vendas && lista.length === 0 && <tr><td colSpan={ehSupervisor ? 5 : 4} style={{ padding: 16, color: '#64748b', fontSize: 12, textAlign: 'center' }}>Nenhuma venda registrada ainda. Use o botão 💰 Venda feita no card do cliente.</td></tr>}
            {lista.map(v => (
              <tr key={v.id}>
                <td style={{ fontSize: 12, color: '#5b6b84', padding: '8px 10px', borderBottom: '0.5px solid rgba(15,23,42,0.04)' }}>{new Date(v.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                <td style={{ fontSize: 13, color: '#0f172a', padding: '8px 10px', borderBottom: '0.5px solid rgba(15,23,42,0.04)' }}>{v.cliente || 'Sem nome'}</td>
                {ehSupervisor && <td style={{ fontSize: 12, color: '#5b6b84', padding: '8px 10px', borderBottom: '0.5px solid rgba(15,23,42,0.04)' }}>{v.agente_nome || '—'}</td>}
                <td style={{ fontSize: 13, color: '#b45309', fontWeight: 700, padding: '8px 10px', borderBottom: '0.5px solid rgba(15,23,42,0.04)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtV(v.valor)}</td>
                <td style={{ padding: '8px 10px', borderBottom: '0.5px solid rgba(15,23,42,0.04)' }}>
                  {ehSupervisor ? (
                    <button onClick={() => togglePago(v)} title="Marcar/desmarcar pago"
                      style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, cursor: 'pointer', border: 'none', background: v.pago ? 'rgba(52,211,153,.16)' : '#e2e8f0', color: v.pago ? '#059669' : '#5b6b84' }}>
                      {v.pago ? '✔ pago' : 'marcar pago'}
                    </button>
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 700, color: v.pago ? '#059669' : '#5b6b84' }}>{v.pago ? '✔ pago' : 'aguardando'}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ═══════════════ 🧭 COCKPIT DA SUPERVISÃO (F2) ═══════════════
// Ferramenta de COBRANÇA da Egle: quem está abaixo da meta, quem tem cliente
// esperando, onde a operação trava — com 1 clique pra cair na fila da pessoa.
function PainelCockpit({ board, vendas, fila, verFilaDe, abrirCard, linkChatwoot }) {
  const hoje0 = (() => { const x = new Date(); x.setHours(0, 0, 0, 0); return x })()
  const tile = { background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 12, padding: '12px 14px' }
  const lbl = { fontSize: 10, fontWeight: 600, color: '#5b6b84', textTransform: 'uppercase', letterSpacing: '0.06em' }
  const num = (cor = '#0f172a') => ({ fontSize: 24, fontWeight: 700, color: cor, fontVariantNumeric: 'tabular-nums' })
  const thC = { textAlign: 'left', fontSize: 10.5, color: '#5b6b84', fontWeight: 600, textTransform: 'uppercase', padding: '8px 10px', borderBottom: '1px solid rgba(15,23,42,0.07)' }
  const tdC = { fontSize: 13, color: '#0f172a', padding: '8px 10px', borderBottom: '0.5px solid rgba(15,23,42,0.04)', fontVariantNumeric: 'tabular-nums' }

  // ---- agregados por vendedora (a tabela de cobrança) ----
  const ag = {}
  const pega = (id, nome) => {
    if (!ag[id]) ag[id] = { id, nome: nome || '—', carteira: 0, filaN: 0, estourados: 0, esperando: 0, whats: 0, vHoje: 0, volHoje: 0, v35: 0 }
    return ag[id]
  }
  board.forEach(c => {
    if (!c.bf_agente_id) return
    const a = pega(c.bf_agente_id, c.agente_nome)
    a.carteira++
    if (c.whats_pessoal) { a.whats++; return }
    if (c.sub_estado === 'BF_CONCLUIDO' || SUB_ESTADOS_NEGADO.includes(c.sub_estado)) return
    a.filaN++
    if (nivelSla(c)[0] === '🔴') a.estourados++
    if (c.cliente_respondeu) a.esperando++
  })
  vendas.forEach(v => {
    if (!v.agente_id) return
    const a = pega(v.agente_id, v.agente_nome)
    a.v35++
    if (new Date(v.criado_em) >= hoje0) { a.vHoje++; a.volHoje += Number(v.valor || 0) }
  })
  const linhas = Object.values(ag).sort((a, b) => b.vHoje - a.vHoje || b.v35 - a.v35)

  // ---- topo: o estado da operação em 4 números ----
  const semDono = board.filter(c => !c.bf_agente_id && c.sub_estado !== 'BF_CONCLUIDO' && !SUB_ESTADOS_NEGADO.includes(c.sub_estado)).length
  const esperandoTotal = fila.filter(c => c.cliente_respondeu)
  const estouradosTotal = fila.filter(c => nivelSla(c)[0] === '🔴').length
  const vHojeTime = vendas.filter(v => new Date(v.criado_em) >= hoje0)
  const volHojeTime = vHojeTime.reduce((a, v) => a + Number(v.valor || 0), 0)

  // ---- gargalo: em que etapa a operação está travando (só quem estourou SLA) ----
  const gargalo = {}
  fila.forEach(c => {
    if (nivelSla(c)[0] === '🟢') return
    const k = (COLUNAS.find(x => x[0] === c.sub_estado) || [])[1] || c.sub_estado
    gargalo[k] = (gargalo[k] || 0) + 1
  })
  const gargaloOrd = Object.entries(gargalo).sort((a, b) => b[1] - a[1]).slice(0, 6)
  const maxG = Math.max(1, ...gargaloOrd.map(([, n]) => n))

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 12 }}>
        <div style={tile}>
          <div style={lbl}>💰 Vendas do time hoje</div>
          <div style={num(vHojeTime.length > 0 ? '#059669' : '#0f172a')}>{vHojeTime.length}</div>
          <div style={{ fontSize: 11, color: '#b45309', fontWeight: 700 }}>{'R$ ' + volHojeTime.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        </div>
        <div style={{ ...tile, ...(esperandoTotal.length > 0 ? { border: '1px solid rgba(248,113,113,.5)' } : {}) }}>
          <div style={lbl}>💬 Clientes ESPERANDO resposta</div>
          <div style={num(esperandoTotal.length > 0 ? '#dc2626' : '#059669')}>{esperandoTotal.length}</div>
          <div style={{ fontSize: 10, color: '#64748b' }}>responderam e ninguém atendeu — cobre isso primeiro</div>
        </div>
        <div style={tile}>
          <div style={lbl}>🔴 SLA estourado (2×+)</div>
          <div style={num(estouradosTotal > 0 ? '#b45309' : '#059669')}>{estouradosTotal}</div>
          <div style={{ fontSize: 10, color: '#64748b' }}>na fila geral de {fila.length}</div>
        </div>
        <div style={{ ...tile, ...(semDono > 0 ? { border: '1px solid rgba(251,191,36,.5)' } : {}) }}>
          <div style={lbl}>⚪ Sem dono</div>
          <div style={num(semDono > 0 ? '#b45309' : '#059669')}>{semDono}</div>
          <div style={{ fontSize: 10, color: '#64748b' }}>use ⚖️ Distribuir no Funil (mapa)</div>
        </div>
      </div>

      {/* A TABELA DE COBRANÇA — por vendedora, metas na linha */}
      <div style={{ ...tile, marginBottom: 12, padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 8 }}>👥 Por vendedora — metas: {META_VENDAS_DIA} vendas/dia · conversão ≥ {META_CONVERSAO_PCT}%</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead><tr>
              <th style={thC}>Vendedora</th>
              <th style={thC}>Vendas hoje</th>
              <th style={thC}>Volume hoje</th>
              <th style={thC}>Conversão</th>
              <th style={thC}>Carteira</th>
              <th style={thC}>Fila</th>
              <th style={thC}>💬 Esperando</th>
              <th style={thC}>🔴 Estourado</th>
              <th style={thC}>📲 Whats</th>
              <th style={thC}></th>
            </tr></thead>
            <tbody>
              {linhas.length === 0 && <tr><td style={tdC} colSpan={10}><div style={{ textAlign: 'center', color: '#64748b', padding: 10 }}>Sem leads atribuídos ainda.</div></td></tr>}
              {linhas.map(a => {
                const conv = a.carteira ? Math.round((a.v35 / a.carteira) * 100) : 0
                const bateuDia = a.vHoje >= META_VENDAS_DIA
                return (
                  <tr key={a.id}>
                    <td style={{ ...tdC, fontWeight: 600 }}>{a.nome}</td>
                    <td style={tdC}>
                      <span style={{ fontWeight: 800, color: bateuDia ? '#059669' : a.vHoje > 0 ? '#0f172a' : '#dc2626' }}>{a.vHoje}</span>
                      <span style={{ color: '#64748b', fontSize: 11 }}> / {META_VENDAS_DIA}</span>
                      <div style={{ height: 4, width: 70, background: '#e2e8f0', borderRadius: 2, marginTop: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, (a.vHoje / META_VENDAS_DIA) * 100)}%`, background: bateuDia ? '#34d399' : '#f472b6' }} />
                      </div>
                    </td>
                    <td style={{ ...tdC, color: '#b45309', fontWeight: 700 }}>{'R$ ' + a.volHoje.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td style={{ ...tdC, fontWeight: 800, color: conv >= META_CONVERSAO_PCT ? '#059669' : conv >= META_CONVERSAO_PCT / 2 ? '#b45309' : '#dc2626' }}>{conv}%</td>
                    <td style={tdC}>{a.carteira}</td>
                    <td style={tdC}>{a.filaN}</td>
                    <td style={{ ...tdC, color: a.esperando > 0 ? '#dc2626' : '#64748b', fontWeight: a.esperando > 0 ? 800 : 400 }}>{a.esperando}</td>
                    <td style={{ ...tdC, color: a.estourados > 0 ? '#b45309' : '#64748b' }}>{a.estourados}</td>
                    <td style={tdC}>{a.whats}</td>
                    <td style={tdC}>
                      <button onClick={() => verFilaDe(a.id)} style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8, cursor: 'pointer', border: '1px solid #60a5fa', background: 'transparent', color: '#2563eb' }}>ver fila →</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        {/* onde a operação trava */}
        <div style={{ ...tile, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 8 }}>🚧 Onde está travando (SLA estourado por etapa)</div>
          {gargaloOrd.length === 0 && <div style={{ color: '#64748b', fontSize: 12, textAlign: 'center', padding: 10 }}>Nenhuma etapa estourada. 👌</div>}
          {gargaloOrd.map(([etapa, n]) => (
            <div key={etapa} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                <span style={{ color: '#334155' }}>{etapa}</span><b style={{ color: '#0f172a' }}>{n}</b>
              </div>
              <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(n / maxG) * 100}%`, background: '#fbbf24', borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </div>

        {/* a lista de cobrança imediata: cliente esperando, do pior pro melhor */}
        <div style={{ ...tile, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 8 }}>🚨 Cobrança imediata — clientes esperando resposta</div>
          {esperandoTotal.length === 0 && <div style={{ color: '#64748b', fontSize: 12, textAlign: 'center', padding: 10 }}>Ninguém esperando. 👏</div>}
          {[...esperandoTotal].sort((a, b) => b.minutos_parado - a.minutos_parado).slice(0, 10).map(c => (
            <div key={c.id} onClick={() => abrirCard(c)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '0.5px solid rgba(15,23,42,0.04)', cursor: 'pointer' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', minWidth: 62 }}>⏱ {c.minutos_parado} min</span>
              <span style={{ fontSize: 13, color: '#0f172a', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome || 'Sem nome'}</span>
              <span style={{ fontSize: 11, color: '#5b6b84' }}>{c.agente_nome || '⚪ sem dono'}</span>
              {c.chatwoot_conversation_id && <a href={linkChatwoot(c)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 13, textDecoration: 'none' }} title="Abrir no Chatwoot">💬</a>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
