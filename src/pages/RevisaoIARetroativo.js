import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// Supervisores de board (Egle): veem em modo supervisor — todos os atendentes + filtro + cores
const IDS_SUPERVISOR_BOARD = [
  '6db43f01-71e6-4972-b84e-eb49375e8e70', // Egle Marcela
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

// Supervisoras de TIME interno (KR): veem o board filtrado pelos leads das PROPRIAS vendedoras.
// 25/08 (Bruno): Maryana Kodos SAIU daqui. No retroativo ela e vendedora, nao supervisora —
// tem que ver so o que a advogada liberou, igual Sthefany e Eduarda. Estar nesta lista
// ligava ehSupervisor -> veTodasColunas e ela enxergava o funil inteiro.
const SUPERVISORAS_TIME = {}

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
  'be98f268-314f-4114-acc3-7bb9ce7635fd', // Maryana Kodos
  '88929e81-7223-4754-a17b-1cd08f46195d', // Sthefany Mendes
  '9fbda3fe-22aa-4179-b1a7-005e99660c8d', // Duda (supervisoraeduarda25) — a que ja atuava no setor
]

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
  fechLinha: (r) => ({
    padding: '8px 10px', borderRadius: 8, marginBottom: 6, fontSize: 13,
    background: r === 'FECHOU' ? 'rgba(52,211,153,.12)' : r === 'NEGOU' ? 'rgba(248,113,113,.10)' : 'rgba(251,191,36,.14)',
    border: '0.5px solid rgba(15,23,42,0.07)',
  }),
  confWrap: { marginBottom: 12 },
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
  painelMotivos: { marginTop: 8, padding: 12, background: '#f1f5f9', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 10 },
  motivosGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 },
  btnMotivo: { padding: '9px 10px', background: '#ffffff', color: '#dc2626', border: '0.5px solid rgba(178,59,59,0.35)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left' },
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

  const [board, setBoard] = useState([])
  const [soVermelhos, setSoVermelhos] = useState(false)
  const [filtroAgente, setFiltroAgente] = useState('')
  const [filtroEntrada, setFiltroEntrada] = useState('tudo')
  const [filtroAtividade, setFiltroAtividade] = useState('mes')
  const [filtroAtendimento, setFiltroAtendimento] = useState('todos')
  const [entradaDe, setEntradaDe] = useState(''); const [entradaAte, setEntradaAte] = useState('')
  const [ativDe, setAtivDe] = useState(''); const [ativAte, setAtivAte] = useState('')
  const [lead, setLead] = useState(null)
  const [arrastando, setArrastando] = useState(null)
  const [mostrarMotivosNegar, setMostrarMotivosNegar] = useState(false)
  const [mensagens, setMensagens] = useState([])
  const [anexos, setAnexos] = useState([])
  const [carregandoAnexos, setCarregandoAnexos] = useState(false)
  const [atualizandoConversa, setAtualizandoConversa] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [fechAberto, setFechAberto] = useState(false)
  const [fechamento, setFechamento] = useState(null)
  const [fechCarregando, setFechCarregando] = useState(false)
  const [confAberta, setConfAberta] = useState(false)
  const [conferencia, setConferencia] = useState(null)
  const [confCarregando, setConfCarregando] = useState(false)

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
    // Funil retroativo é 100% automático e SEM DONO por lead. Se a vendedora filtrar
    // pelo próprio id, ela só enxerga A analisar/Pitch (sempre visíveis) e perde cadastro/
    // assinatura/finalizado (que são gated por dono). Ela vê o funil compartilhado inteiro,
    // já fatiado nas colunas dela pelo COLUNAS_VENDEDOR. Corte continua valendo.
    const p_agente = ehAdmin ? (filtroAgente || null) : null
    const fe = faixaData(filtroEntrada, entradaDe, entradaAte)
    const fa = faixaData(filtroAtividade, ativDe, ativAte)
    const { data } = await supabase.rpc('mae_board', {
      p_agente,
      p_entrada_de: fe.de ? fe.de.toISOString() : null,
      p_entrada_ate: fe.ate ? fe.ate.toISOString() : null,
      p_ativ_de: fa.de ? fa.de.toISOString() : null,
      p_ativ_ate: fa.ate ? fa.ate.toISOString() : null,
    })
    // Operação licenciada só enxerga os leads da própria operação
    setBoard((data || []).filter(l =>
      (!minhaOp || (l.operacao || 'kr') === minhaOp) &&
      (!meuTime || meuTime.includes(l.bf_agente_id)) &&
      (!soMeusLeads || l.bf_agente_id === profile?.id)))
  }, [profile?.id, ehAdmin, minhaOp, soMeusLeads, filtroAgente, filtroEntrada, filtroAtividade, entradaDe, entradaAte, ativDe, ativAte])

  useEffect(() => {
    carregar()
    const timer = setInterval(carregar, 45000)
    return () => clearInterval(timer)
  }, [carregar])

  const agentes = []
  board.forEach(l => {
    if (l.bf_agente_id && l.agente_nome && !agentes.some(a => a.id === l.bf_agente_id)) {
      agentes.push({ id: l.bf_agente_id, nome: l.agente_nome })
    }
  })

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

  const abrirLead = async (l) => {
    setLead(l)
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

  const fechar = () => { setLead(null); setMensagens([]); setAnexos([]) }


  // Pega o card (marca selo) sem mandar mensagem
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
  const cardsDe = (col) => board.filter(l =>
    l.coluna === col && (!soVermelhos || l.cor === 'vermelho') && passaAtend(l)
    // vendedora: em "A analisar" só vê os que travaram (precisa de ajuda)
    && (!(ehVendedor && !veTodasColunas && col === 'A_ANALISAR') || l.cor === 'vermelho')
  ).slice(0, 60)
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
              <div style={s.colTitulo}><span>{titulo}</span><span>{ehVendedor && !veTodasColunas && col === 'A_ANALISAR' ? cards.length : board.filter(l => l.coluna === col).length}</span></div>
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

            <div style={s.ficha}>
              {lead.data_nascimento_filho && (
                <div style={s.destaque}>👶 Nascimento do filho: {lead.data_nascimento_filho}{lead.idade_bebe ? ` (${lead.idade_bebe})` : ''}</div>
              )}
              <div>📱 {lead.tel || '—'}</div>
              <div>🪪 CPF: {lead.cpf || '—'}</div>
              <div>💼 Trabalhava no nascimento: {lead.trabalhava_no_nascimento || '—'}</div>
              <div>📋 Já trabalhou CLT: {lead.ja_trabalhou_clt || '—'}</div>
              <div>🪪 RG frente: {lead.doc_rg_frente ? '✅' : '—'}</div>
              <div>🪪 RG verso: {lead.doc_rg_verso ? '✅' : '—'}</div>
              <div>📜 Certidão: {lead.certidao ? '✅' : '—'}</div>
              <div>📌 Etapa: {lead.estado}{lead.sub_estado ? ` / ${lead.sub_estado}` : ''}</div>
              {lead.cnis_aprovado === 'true' && <div>✅ CNIS aprovado</div>}
              {lead.cnis_aprovado === 'false' && <div>⛔ CNIS reprovado: {lead.cnis_reprovado_motivo || ''}</div>}
              {ehSupervisor && lead.agente_nome && <div>👤 Dona: {lead.agente_nome}</div>}
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

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              {lead.bf_em_tratamento ? (
                <button
                  style={{ fontSize: 12, padding: '6px 12px', background: 'rgba(248,113,113,.14)', color: '#dc2626', border: '0.5px solid rgba(178,59,59,0.3)', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
                  onClick={() => soltarTratamento(lead)}
                >✋ Soltar (não estou mais nesse)</button>
              ) : (
                <button
                  style={{ fontSize: 12, padding: '6px 12px', background: 'rgba(52,211,153,.14)', color: '#059669', border: '0.5px solid rgba(59,109,17,0.3)', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
                  onClick={() => marcarTratando(lead)}
                >🙋 Estou nesse</button>
              )}
              {lead.bf_em_tratamento && lead.cliente_respondeu && (
                <span style={{ fontSize: 12, fontWeight: 700, color: '#b45309', background: 'rgba(251,191,36,.12)', padding: '6px 10px', borderRadius: 8 }}>💬 o cliente respondeu</span>
              )}
            </div>

            {lead.cnis_aprovado === 'true' && (
              <div style={{ marginBottom: 10 }}>
                <button style={s.btnFechou} onClick={() => fecharVenda(lead.id)}>✅ Fechei a venda</button>
                <div style={{ fontSize: 11, color: '#5b6b84', marginTop: 5 }}>
                  Use também quando fechar pelo WhatsApp — é assim que entra no seu fechamento do dia.
                </div>
              </div>
            )}

            <div style={{ marginBottom: 10 }}>
              <button style={s.btnNegar} onClick={() => setMostrarMotivosNegar(v => !v)}>❌ Negar / Não quis</button>
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
    </div>
  )
}
