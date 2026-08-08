import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// ============================================================
// REVISÃO IA — CLT (Crédito do Trabalhador)
// Janela do funil CLT conduzido pela IA (cascata Presença -> V8).
// v1: OBSERVAÇÃO — todo lead CLT aparece mapeado por etapa; conversa ao vivo no modal.
// Coluna vem derivada do clt_board (catch-all OUTROS: card nunca some).
// ============================================================

const CHATWOOT_BASE = 'https://crm.vendeaitecnologia.com.br'
const CHATWOOT_ACC = '8918'

// Supervisores de board (Egle) — mesmo padrão das outras telas
const IDS_SUPERVISOR_BOARD = [
  '6db43f01-71e6-4972-b84e-eb49375e8e70', // Egle Marcela
]

// Operações licenciadas: usuário só vê leads da própria operação
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
  ['CONSENTIMENTO', '📝 Consentimento'],
  ['CONSULTANDO', '🔎 Consultando bancos'],
  ['PRE_APROVADO', '💰 Pré-aprovado'],
  ['DOCS', '🪪 Documentos'],
  ['PROPOSTA', '⌨️ Proposta'],
  ['FORMALIZACAO', '🔗 Formalização'],
  ['ASSINADO', '✍️ Assinado'],
  ['CONCLUIDO', '🎉 Pago'],
  ['NEGADO', '❌ Negados'],
  ['OUTROS', '❓ Outros'],
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

const CORES = {
  vermelho: { border: '1px solid #f87171', background: 'rgba(248,113,113,.14)' },
  amarelo: { border: '1px solid #fbbf24', background: 'rgba(251,191,36,.12)' },
  frio: { border: '0.5px solid rgba(255,255,255,0.09)', background: '#2b3340', opacity: 0.8 },
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
  tagBanco: { fontSize: 10, background: 'rgba(96,165,250,.10)', color: '#60a5fa', borderRadius: 6, padding: '2px 7px', display: 'inline-block', marginTop: 4, fontWeight: 700 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 50, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '3vh 12px', overflowY: 'auto' },
  modal: { background: '#232a37', borderRadius: 14, width: '100%', maxWidth: 640, padding: '1.25rem', maxHeight: '92vh', overflowY: 'auto' },
  ficha: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 13, background: '#1e242f', borderRadius: 10, padding: 12, marginBottom: 12 },
  msgs: { maxHeight: 240, overflowY: 'auto', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 10, marginBottom: 12, display: 'flex', flexDirection: 'column-reverse', gap: 6 },
  msgCliente: { alignSelf: 'flex-start', background: '#2b3340', borderRadius: '10px 10px 10px 2px', padding: '6px 10px', fontSize: 12, maxWidth: '85%' },
  msgIa: { alignSelf: 'flex-end', background: 'rgba(52,211,153,.14)', borderRadius: '10px 10px 2px 10px', padding: '6px 10px', fontSize: 12, maxWidth: '85%' },
  btnFechar: { padding: '9px 12px', background: '#232a37', color: '#8b9bb4', border: '0.5px solid rgba(255,255,255,0.11)', borderRadius: 8, fontSize: 12, cursor: 'pointer' },
  link: { fontSize: 12, color: '#60a5fa', textDecoration: 'none', fontWeight: 500 },
}

export default function RevisaoIACLT() {
  const { profile } = useAuth()
  const ehAdmin = profile?.role === 'admin' || IDS_SUPERVISOR_BOARD.includes(profile?.id)
  const minhaOp = OPERACAO_USUARIOS[profile?.id] || null
  const meuTime = SUPERVISORAS_TIME[profile?.id] || null

  const [board, setBoard] = useState([])
  const [soVermelhos, setSoVermelhos] = useState(false)
  const [filtroEntrada, setFiltroEntrada] = useState('tudo')
  const [filtroAtividade, setFiltroAtividade] = useState('tudo')
  const [filtroAtendimento, setFiltroAtendimento] = useState('todos')
  const [entradaDe, setEntradaDe] = useState(''); const [entradaAte, setEntradaAte] = useState('')
  const [ativDe, setAtivDe] = useState(''); const [ativAte, setAtivAte] = useState('')
  const [lead, setLead] = useState(null)
  const [mensagens, setMensagens] = useState([])
  const [carregandoConversa, setCarregandoConversa] = useState(false)

  const carregar = useCallback(async () => {
    if (!profile?.id) return
    const fe = faixaData(filtroEntrada, entradaDe, entradaAte)
    const fa = faixaData(filtroAtividade, ativDe, ativAte)
    const { data } = await supabase.rpc('clt_board', {
      p_agente: null,
      p_entrada_de: fe.de ? fe.de.toISOString() : null,
      p_entrada_ate: fe.ate ? fe.ate.toISOString() : null,
      p_ativ_de: fa.de ? fa.de.toISOString() : null,
      p_ativ_ate: fa.ate ? fa.ate.toISOString() : null,
    })
    // Operação licenciada só enxerga os leads da própria operação
    setBoard((data || []).filter(l =>
      (!minhaOp || (l.operacao || 'kr') === minhaOp) &&
      (!meuTime || meuTime.includes(l.bf_agente_id))))
  }, [profile?.id, minhaOp, filtroEntrada, filtroAtividade, entradaDe, entradaAte, ativDe, ativAte])

  useEffect(() => {
    carregar()
    const t = setInterval(carregar, 45000)
    return () => clearInterval(t)
  }, [carregar])

  async function abrirLead(l) {
    setLead(l); setMensagens([]); setCarregandoConversa(true)
    try {
      if (l.chatwoot_conversation_id) {
        const { data: res } = await supabase.functions.invoke('bf-conversa', {
          body: { conversation_id: l.chatwoot_conversation_id, limit: 15 },
        })
        if (res?.ok) setMensagens(res.mensagens || [])
      }
    } catch (e) { /* conversa é opcional */ }
    setCarregandoConversa(false)
  }

  const passaAtend = (l) => filtroAtendimento === 'todos' || (filtroAtendimento === 'respondido' ? l.humano_respondeu : !l.humano_respondeu)
  const cardsDe = (col) => board.filter(l =>
    l.coluna === col && (!soVermelhos || l.cor === 'vermelho') && passaAtend(l)
  ).slice(0, 60)

  const totalVermelhos = board.filter(l => l.cor === 'vermelho').length
  const concluidos = board.filter(l => l.coluna === 'CONCLUIDO').length

  return (
    <div>
      <div style={s.title}>💼 Revisão IA — CLT</div>
      <div style={s.sub}>Funil do Crédito do Trabalhador conduzido pela IA (Presença → V8). Vermelho = travou agora; cinza = backlog frio.</div>

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
        <span style={s.kpi}>Total: <b>{board.length}</b></span>
        <span style={s.kpi}>🎉 Pagos: <b>{concluidos}</b></span>
        <button style={s.chip} onClick={carregar}>🔄 Atualizar</button>
      </div>

      <div style={s.board}>
        {COLUNAS.map(([col, titulo]) => {
          const cards = cardsDe(col)
          return (
            <div key={col} style={s.col}>
              <div style={s.colTitulo}><span>{titulo}</span><span>{board.filter(l => l.coluna === col).length}</span></div>
              {cards.map(l => (
                <div key={l.id} style={{ ...s.card, ...(CORES[l.cor] || CORES.normal) }} onClick={() => abrirLead(l)}>
                  <div style={s.cardNome}>{l.nome || 'Sem nome'}</div>
                  <div style={s.cardMeta}>
                    {l.cor === 'vermelho' ? '🔴 ' : ''}{l.cor === 'amarelo' ? '🟡 ' : ''}parado há {fmtParado(l.minutos_parado)}
                  </div>
                  {l.clt_banco && <span style={s.tagBanco}>🏦 {l.clt_banco}{l.clt_valor ? ` · R$ ${l.clt_valor}` : ''}</span>}
                  {l.coluna === 'NEGADO' && l.clt_motivo && <div style={s.cardMeta}>❌ {l.clt_motivo}</div>}
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {lead && (
        <div style={s.overlay} onClick={() => setLead(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{lead.nome || 'Sem nome'}</div>
            <div style={s.ficha}>
              <div>📱 {lead.tel || '—'}</div>
              <div>🪪 CPF: {lead.cpf || '—'}</div>
              <div>🏦 Banco: {lead.clt_banco || '—'}</div>
              <div>💰 Valor: {lead.clt_valor ? `R$ ${lead.clt_valor}` : '—'}</div>
              <div>📌 Status CLT: {lead.clt_status || '—'}</div>
              <div>📍 Etapa: {lead.estado}{lead.sub_estado ? ` / ${lead.sub_estado}` : ''}</div>
              {lead.clt_motivo && <div style={{ gridColumn: '1 / -1' }}>❌ Motivo: {lead.clt_motivo}</div>}
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, color: '#8b9bb4', marginBottom: 6 }}>💬 Conversa (espelho do Chatwoot):</div>
            <div style={s.msgs}>
              {carregandoConversa && <div style={{ fontSize: 12, color: '#8b9bb4' }}>Carregando conversa...</div>}
              {!carregandoConversa && mensagens.length === 0 && <div style={{ fontSize: 12, color: '#8b9bb4' }}>Sem mensagens.</div>}
              {mensagens.map((m, i) => (
                <div key={i} style={m.de === 'cliente' ? s.msgCliente : s.msgIa}>{m.texto}</div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
              {lead.chatwoot_conversation_id
                ? <a style={s.link} href={`${CHATWOOT_BASE}/app/accounts/${CHATWOOT_ACC}/conversations/${lead.chatwoot_conversation_id}`} target="_blank" rel="noreferrer">abrir no Chatwoot 💬</a>
                : <span />}
              <button style={s.btnFechar} onClick={() => setLead(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
      {ehAdmin && <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>v1 observação: sem ações manuais ainda — o funil CLT é 100% da IA. Etapas fora do contrato caem em "Outros".</div>}
    </div>
  )
}
