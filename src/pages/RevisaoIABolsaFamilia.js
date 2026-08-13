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
const SUB_ESTADOS_NEGADO = ['BF_NEGADO', 'DESQUALIFICADO_CAIXA_TEM', 'DESQUALIFICADO_SEM_BF', 'DESQUALIFICADO_SEM_BOLSA', 'RECUSOU_OFERTA', 'RECUSOU_VALOR', 'RECUSA_TEMPORARIA', 'DESISTIU', 'CANCELADO', 'CANCELADO_CLIENTE', 'RECUSOU']

// Todo sub_estado com coluna propria + os de Negados. O que NAO estiver aqui cai em "Outros" — rede de seguranca pra card nunca mais sumir do board.
const CHAVES_CONHECIDAS = new Set([
  ...COLUNAS.map(([k]) => k).filter(k => k !== 'NEGADO' && k !== 'OUTROS'),
  ...SUB_ESTADOS_NEGADO,
])

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
  return { de: null, ate: null }
}
const OPCOES_DATA = [['tudo', 'tudo'], ['hoje', 'hoje'], ['ontem', 'ontem'], ['7d', '7 dias'], ['mes', 'mês'], ['custom', 'personalizado']]

function primeiroNome(n) { return (n || 'cliente').split(' ')[0] }

function sugestaoPara(lead, linkCrefisa) {
  const nome = primeiroNome(lead.nome)
  const valor = lead.valor || ''
  const map = {
    OFERTA: `Oi ${nome}! 💗 Vi que você ainda não aproveitou sua pré-aprovação${valor ? ` de R$ ${valor}` : ''} 💰 Quer que eu te explique como funciona? É rapidinho!`,
    COLETA_RG_FRENTE: `Oi ${nome}! Pra liberar seu dinheiro${valor ? ` (R$ ${valor})` : ''} só falta a foto da FRENTE do seu RG 📸 Me manda?`,
    COLETA_RG_VERSO: `${nome}, recebi a frente do RG certinho! ✅ Agora só falta o VERSO 📸 Pode mandar?`,
    COLETA_EXTRATO: `${nome}, falta só 1 documentinho: o extrato do seu Caixa Tem em PDF 📄 É só abrir o app, tocar em extrato e compartilhar aqui comigo 💗`,
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
  normal: { border: '0.5px solid rgba(255,255,255,0.08)', background: '#232a37' },
}

const s = {
  title: { fontSize: 20, fontWeight: 500, color: '#e6edf7', marginBottom: 4 },
  sub: { fontSize: 13, color: '#8b9bb4', marginBottom: 14 },
  topo: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 },
  chip: { padding: '6px 14px', fontSize: 13, fontWeight: 500, borderRadius: 8, border: '0.5px solid rgba(255,255,255,0.11)', background: '#232a37', color: '#8b9bb4', cursor: 'pointer' },
  chipOn: { background: '#f87171', color: '#232a37', borderColor: '#f87171' },
  kpi: { fontSize: 13, color: '#8b9bb4', padding: '6px 12px', background: 'rgba(96,165,250,.10)', borderRadius: 8 },
  board: { display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 16, alignItems: 'flex-start' },
  col: { minWidth: 230, maxWidth: 230, background: '#2b3340', borderRadius: 10, padding: 8, flexShrink: 0 },
  colTitulo: { fontSize: 12, fontWeight: 600, color: '#8b9bb4', padding: '4px 6px 8px', display: 'flex', justifyContent: 'space-between' },
  card: { borderRadius: 8, padding: '8px 10px', marginBottom: 8, cursor: 'pointer' },
  cardNome: { fontSize: 13, fontWeight: 600, color: '#e6edf7' },
  cardMeta: { fontSize: 11, color: '#8b9bb4', marginTop: 2 },
  tagTrat: { fontSize: 10, background: 'rgba(52,211,153,.14)', color: '#34d399', borderRadius: 6, padding: '2px 7px', display: 'inline-block', marginTop: 4, fontWeight: 600 },
  tagTratSup: { fontSize: 10, background: 'rgba(96,165,250,.10)', color: '#60a5fa', borderRadius: 6, padding: '2px 7px', display: 'inline-block', marginTop: 4, fontWeight: 600 },
  tagNinguem: { fontSize: 10, background: 'rgba(248,113,113,.14)', color: '#f87171', borderRadius: 6, padding: '2px 7px', display: 'inline-block', marginTop: 4, fontWeight: 600 },
  tagRespondeu: { fontSize: 10, background: 'rgba(251,191,36,.12)', color: '#fbbf24', borderRadius: 6, padding: '2px 7px', display: 'inline-block', marginTop: 4, marginRight: 4, fontWeight: 700 },
  tagMotivo: { fontSize: 10, background: '#2b3340', color: '#8b9bb4', borderRadius: 6, padding: '2px 7px', display: 'inline-block', marginTop: 4, fontWeight: 600 },
  badgeIA: { fontSize: 10, background: 'rgba(96,165,250,.14)', color: '#60a5fa', borderRadius: 6, padding: '2px 7px', fontWeight: 700, display: 'inline-block' },
  badgeHumano: { fontSize: 10, background: 'rgba(167,139,250,.18)', color: '#a78bfa', borderRadius: 6, padding: '2px 7px', fontWeight: 700, display: 'inline-block' },
  cardChat: { fontSize: 12, textDecoration: 'none', background: 'rgba(52,211,153,.14)', color: '#34d399', borderRadius: 6, padding: '1px 7px', fontWeight: 700 },
  btnNegar: { padding: '9px 12px', background: 'rgba(248,113,113,.14)', color: '#f87171', border: '0.5px solid rgba(178,59,59,0.3)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  painelMotivos: { marginTop: 10, padding: 12, background: '#1e242f', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 10 },
  motivosGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 },
  btnMotivo: { padding: '9px 10px', background: '#232a37', color: '#f87171', border: '0.5px solid rgba(178,59,59,0.35)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 50, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '3vh 12px', overflowY: 'auto' },
  modal: { background: '#232a37', borderRadius: 14, width: '100%', maxWidth: 640, padding: '1.25rem', maxHeight: '92vh', overflowY: 'auto' },
  ficha: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 13, background: '#1e242f', borderRadius: 10, padding: 12, marginBottom: 12 },
  anexoBox: { marginBottom: 12 },
  anexoLabel: { fontSize: 12, fontWeight: 600, color: '#8b9bb4', marginBottom: 6 },
  anexoRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  anexoImg: { width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '0.5px solid rgba(255,255,255,0.11)' },
  anexoFile: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'rgba(96,165,250,.10)', border: '0.5px solid rgba(255,255,255,0.09)', borderRadius: 8, fontSize: 12, color: '#60a5fa', textDecoration: 'none', fontWeight: 500 },
  msgs: { maxHeight: 220, overflowY: 'auto', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 10, marginBottom: 12, display: 'flex', flexDirection: 'column-reverse', gap: 6 },
  msgCliente: { alignSelf: 'flex-start', background: '#2b3340', borderRadius: '10px 10px 10px 2px', padding: '6px 10px', fontSize: 12, maxWidth: '85%' },
  msgAna: { alignSelf: 'flex-end', background: 'rgba(52,211,153,.14)', borderRadius: '10px 10px 2px 10px', padding: '6px 10px', fontSize: 12, maxWidth: '85%' },
  textarea: { width: '100%', minHeight: 90, padding: 10, fontSize: 13, borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.45)', boxSizing: 'border-box', marginBottom: 8, fontFamily: 'inherit' },
  btnEnviar: { width: '100%', padding: 12, background: '#34d399', color: '#232a37', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 10 },
  acoes: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  btnAcao: { padding: '9px 12px', background: '#60a5fa', color: '#232a37', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer' },
  btnFechar: { padding: '9px 12px', background: '#232a37', color: '#8b9bb4', border: '0.5px solid rgba(255,255,255,0.11)', borderRadius: 8, fontSize: 12, cursor: 'pointer' },
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
  const [soVermelhos, setSoVermelhos] = useState(false)
  const [arrastando, setArrastando] = useState(null)
  const [agentes, setAgentes] = useState([])
  const [filtroAgente, setFiltroAgente] = useState('')
  const [filtroEntrada, setFiltroEntrada] = useState('tudo')
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
    const { data } = await supabase.rpc('bf_board', {
      p_agente,
      p_entrada_de: fe.de ? fe.de.toISOString() : null,
      p_entrada_ate: fe.ate ? fe.ate.toISOString() : null,
      p_ativ_de: fa.de ? fa.de.toISOString() : null,
      p_ativ_ate: fa.ate ? fa.ate.toISOString() : null,
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

  let visiveis = soVermelhos ? board.filter(c => c.cor === 'vermelho') : board
  if (filtroAtendimento === 'respondido') visiveis = visiveis.filter(c => c.humano_respondeu)
  else if (filtroAtendimento === 'sem') visiveis = visiveis.filter(c => !c.humano_respondeu)
  const totalVermelhos = board.filter(c => c.cor === 'vermelho').length
  const semDono = board.filter(c => !c.bf_em_tratamento && (c.cor === 'vermelho' || c.cor === 'amarelo') && c.sub_estado !== 'BF_CONCLUIDO').length

  return (
    <div>
      <div style={s.title}>🩷 Revisão IA — Bolsa Família</div>
      <div style={s.sub}>
        {ehSupervisor ? 'Quadro geral do funil BF. Vermelho = travado, agente precisa destravar.' : 'Seus clientes do funil. Vermelho = travou, entre e destrave.'}
      </div>

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
        <select style={s.chip} value={filtroAtendimento} onChange={e => setFiltroAtendimento(e.target.value)} title="Atendimento humano">
          <option value="todos">Atendimento: todos</option>
          <option value="respondido">✅ Já respondido</option>
          <option value="sem">⚠️ Sem resposta</option>
        </select>
        <span style={s.kpi}>Total no funil: <strong>{board.length}</strong></span>
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

      <div style={s.board}>
        {colunasVisiveis.map(([key, label]) => {
          let cards = key === 'NEGADO'
            ? visiveis.filter(c => SUB_ESTADOS_NEGADO.includes(c.sub_estado))
            : key === 'OUTROS'
            ? visiveis.filter(c => !CHAVES_CONHECIDAS.has(c.sub_estado))
            : visiveis.filter(c => c.sub_estado === key)
          // Solta em qualquer coluna do funil; Negados so pelo botao Negar (motivo), Outros nao recebe
          const ehDestino = key !== 'NEGADO' && key !== 'OUTROS'
          const destaque = key === 'DOCS_COMPLETOS'
          return (
            <div key={key}
              style={{ ...s.col, ...(destaque ? { background: 'rgba(52,211,153,.14)', border: '2px solid #34d399' } : {}), ...(ehDestino && arrastando ? { outline: '2px dashed #60a5fa' } : {}) }}
              onDragOver={ehDestino ? (e => e.preventDefault()) : undefined}
              onDrop={ehDestino ? (e => { e.preventDefault(); if (arrastando) moverEtapa(arrastando, key); setArrastando(null) }) : undefined}>
              <div style={{ ...s.colTitulo, ...(destaque ? { color: '#34d399', fontWeight: 700 } : {}) }}>
                <span>{destaque ? '⭐ ' : ''}{label}</span><span>{cards.length}</span>
              </div>
              {cards.map(c => {
                return (
                <div key={c.id} draggable
                  onDragStart={() => setArrastando(c.id)}
                  onDragEnd={() => setArrastando(null)}
                  style={{ ...s.card, ...(CORES[c.cor] || CORES.normal), cursor: 'grab' }}
                  onClick={() => abrirCard(c)}>
                  <div style={s.cardNome}>{c.nome || 'Sem nome'}</div>
                  <div style={s.cardMeta}>
                    {c.valor ? `R$ ${c.valor} · ` : ''}{c.cor === 'vermelho' ? `🔴 parado há ${c.minutos_parado} min` : c.cor === 'amarelo' ? `🟡 ${c.minutos_parado} min` : `${c.minutos_parado} min`}
                  </div>
                  {ehSupervisor && c.agente_nome && <div style={s.cardMeta}>👤 {c.agente_nome}</div>}
                  {key === 'NEGADO' && <div style={s.tagMotivo}>❌ {labelMotivo(c)}</div>}
                  {key !== 'NEGADO' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      <span style={c.ana_pausada ? s.badgeHumano : s.badgeIA}>{c.ana_pausada ? '🧑 humano' : '🤖 IA'}</span>
                      {c.chatwoot_conversation_id && (
                        <a href={linkChatwoot(c)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={s.cardChat} title="Abrir conversa no Chatwoot">💬</a>
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

      {lead && (
        <div style={s.overlay} onClick={() => setLead(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>{lead.nome}</div>
            <div style={{ fontSize: 12, color: '#8b9bb4', marginBottom: 10 }}>
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

            <div style={{ background: lead.ana_pausada ? 'rgba(167,139,250,.10)' : 'rgba(96,165,250,.08)', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 10, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: lead.ana_pausada ? '#a78bfa' : '#60a5fa' }}>
                  {lead.ana_pausada ? '🧑 Humano no controle — IA pausada' : '🤖 IA ativa (Ana respondendo)'}
                </span>
                {lead.ana_pausada ? (
                  <button style={{ fontSize: 12, padding: '7px 14px', background: '#60a5fa', color: '#232a37', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }} disabled={enviando} onClick={() => handoff(lead, 'devolver')}>🤖 Devolver pra IA</button>
                ) : (
                  <button style={{ fontSize: 12, padding: '7px 14px', background: '#a78bfa', color: '#232a37', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }} disabled={enviando} onClick={() => handoff(lead, 'assumir')}>✋ Assumir (pausar IA)</button>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#8b9bb4', marginTop: 6 }}>
                {lead.ana_pausada
                  ? 'A Ana não responde enquanto você está no controle. Responda pelo Chatwoot. Clique em "Devolver pra IA" quando terminar.'
                  : 'Ao responder no Chatwoot a IA pausa sozinha. Você também pode assumir aqui pra parar a Ana antes de escrever.'}
                {lead.cliente_respondeu && <span style={{ color: '#fbbf24', fontWeight: 700 }}> · 💬 o cliente respondeu</span>}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#8b9bb4' }}>
                💬 Conversa <span style={{ color: '#34d399', fontWeight: 500 }}>· atualiza sozinha</span>
              </span>
              <button
                style={{ fontSize: 11, padding: '4px 10px', background: 'rgba(96,165,250,.10)', color: '#60a5fa', border: '0.5px solid rgba(255,255,255,0.09)', borderRadius: 8, cursor: 'pointer', fontWeight: 500 }}
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
              <div style={{ fontSize: 12, color: '#f87171', background: 'rgba(248,113,113,.10)', borderRadius: 8, padding: 10, marginBottom: 10 }}>Sem conversa no Chatwoot vinculada a este lead.</div>
            )}

            <div style={{ fontSize: 12, fontWeight: 600, color: '#8b9bb4', marginBottom: 6 }}>Ações de etapa:</div>
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
                <div style={{ fontSize: 12, fontWeight: 700, color: '#8b9bb4', marginBottom: 8 }}>Por que está negando?</div>
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
