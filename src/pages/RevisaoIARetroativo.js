import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// Supervisores de board (Egle): veem em modo supervisor — todos os atendentes + filtro + cores
const IDS_SUPERVISOR_BOARD = [
  '6db43f01-71e6-4972-b84e-eb49375e8e70', // Egle Marcela
]

const COLUNAS = [
  ['PEDIU_CNIS', '📄 Pediu CNIS'],
  ['FILA_GERID', '🗂️ Fila GERID'],
  ['A_ANALISAR', '🔍 A analisar'],
  ['PITCH_LIBERADO', '🚀 Pitch liberado'],
  ['CAD_ENDERECO', '📍 Endereço'],
  ['CAD_RG', '🪪 RG frente/verso'],
  ['CAD_COMPROVANTE', '📜 Doc. do filho'],
  ['CAD_FINAL', '🏁 CPF / Nº RG / Nome'],
  ['AGUARDANDO_ASSINATURA', '✍️ Aguard. assinatura'],
  ['FINALIZADO', '🎉 Finalizado'],
  ['REPROVADO', '⛔ Reprovado'],
]

function primeiroNome(n) { return (n || 'cliente').split(' ')[0] }

function fmtParado(min) {
  if (min < 60) return `${min} min`
  if (min < 1440) return `${Math.floor(min / 60)}h`
  return `${Math.floor(min / 1440)}d`
}

function sugestaoPara(lead) {
  const nome = primeiroNome(lead.nome)
  const map = {
    PEDIU_CNIS: `${nome}, pra eu confirmar o seu direito só falta o seu extrato CNIS 📄 Você consegue me mandar? Se tiver dúvida de como tirar, eu te ajudo passo a passo 💗`,
    PITCH_LIBERADO: `${nome}, boa notícia! ✅ Analisamos o seu CNIS e está tudo certo pra seguir. Posso te explicar os próximos passos?`,
    CAD_ENDERECO: `${nome}, me passa seu CEP e o número da sua casa? 📍 É o primeiro passo do cadastro, rapidinho! 💗`,
    CAD_RG: `${nome}, me manda as fotos do seu RG? Primeiro a FRENTE, depois o VERSO 🪪 Falta pouquinho! 💗`,
    CAD_COMPROVANTE: `${nome}, agora me manda o documento do seu bebê (certidão de nascimento) 📜 Tá quase! 💗`,
    CAD_FINAL: `${nome}, última etapa! 🎉 Me confirma seu CPF, o número do seu RG e seu nome completo (igualzinho ao documento) que eu finalizo seu cadastro 💗`,
    AGUARDANDO_ASSINATURA: `${nome}, seu contrato já está prontinho esperando sua assinatura ✍️ É só clicar no link que te mandei. Qualquer dúvida me chama! 💗`,
  }
  return map[lead.coluna] || `Oi ${nome}! 💗 Tudo bem? Vi que a gente parou no meio — posso te ajudar a continuar?`
}

const CORES = {
  vermelho: { border: '1px solid #A32D2D', background: '#FEF6F6' },
  amarelo: { border: '1px solid #C88A00', background: '#FFFBEB' },
  frio: { border: '0.5px solid rgba(0,0,0,0.12)', background: '#F3F4F6', opacity: 0.8 },
  verde: { border: '0.5px solid #3B6D1140', background: '#F2F8EC' },
  normal: { border: '0.5px solid rgba(0,0,0,0.1)', background: '#fff' },
}

const s = {
  title: { fontSize: 20, fontWeight: 500, color: '#111', marginBottom: 4 },
  sub: { fontSize: 13, color: '#888', marginBottom: 14 },
  topo: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 },
  chip: { padding: '6px 14px', fontSize: 13, fontWeight: 500, borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', background: '#fff', color: '#666', cursor: 'pointer' },
  chipOn: { background: '#A32D2D', color: '#fff', borderColor: '#A32D2D' },
  kpi: { fontSize: 13, color: '#555', padding: '6px 12px', background: '#F4F8FC', borderRadius: 8 },
  board: { display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 16, alignItems: 'flex-start' },
  col: { minWidth: 230, maxWidth: 230, background: '#F4F5F7', borderRadius: 10, padding: 8, flexShrink: 0 },
  colTitulo: { fontSize: 12, fontWeight: 600, color: '#555', padding: '4px 6px 8px', display: 'flex', justifyContent: 'space-between' },
  card: { borderRadius: 8, padding: '8px 10px', marginBottom: 8, cursor: 'pointer' },
  cardNome: { fontSize: 13, fontWeight: 600, color: '#111' },
  cardMeta: { fontSize: 11, color: '#888', marginTop: 2 },
  tagTrat: { fontSize: 10, background: '#E0ECFF', color: '#185FA5', borderRadius: 6, padding: '1px 6px', display: 'inline-block', marginTop: 4 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 50, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '3vh 12px', overflowY: 'auto' },
  modal: { background: '#fff', borderRadius: 14, width: '100%', maxWidth: 640, padding: '1.25rem', maxHeight: '92vh', overflowY: 'auto' },
  ficha: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 13, background: '#F8FAFC', borderRadius: 10, padding: 12, marginBottom: 12 },
  destaque: { gridColumn: '1 / -1', background: '#FFF7E6', border: '1px solid #C88A0040', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontWeight: 600 },
  msgs: { maxHeight: 200, overflowY: 'auto', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: 10, marginBottom: 12, display: 'flex', flexDirection: 'column-reverse', gap: 6 },
  msgCliente: { alignSelf: 'flex-start', background: '#F1F1F1', borderRadius: '10px 10px 10px 2px', padding: '6px 10px', fontSize: 12, maxWidth: '85%' },
  msgAna: { alignSelf: 'flex-end', background: '#EAF3DE', borderRadius: '10px 10px 2px 10px', padding: '6px 10px', fontSize: 12, maxWidth: '85%' },
  textarea: { width: '100%', minHeight: 80, padding: 10, fontSize: 13, borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.2)', boxSizing: 'border-box', marginBottom: 8, fontFamily: 'inherit' },
  btnEnviar: { width: '100%', padding: 12, background: '#3B6D11', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 10 },
  btnAprovar: { flex: 1, padding: 12, background: '#3B6D11', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnReprovar: { flex: 1, padding: 12, background: '#A32D2D', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnFechar: { padding: '9px 12px', background: '#fff', color: '#888', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 8, fontSize: 12, cursor: 'pointer' },
}

export default function RevisaoIARetroativo() {
  const { profile } = useAuth()
  const ehAdmin = profile?.role === 'admin' || IDS_SUPERVISOR_BOARD.includes(profile?.id)

  const [board, setBoard] = useState([])
  const [soVermelhos, setSoVermelhos] = useState(false)
  const [filtroAgente, setFiltroAgente] = useState('')
  const [lead, setLead] = useState(null)
  const [mensagens, setMensagens] = useState([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)

  const carregar = useCallback(async () => {
    if (!profile?.id) return
    const p_agente = ehAdmin ? (filtroAgente || null) : profile.id
    const { data } = await supabase.rpc('mae_board', { p_agente })
    setBoard(data || [])
  }, [profile?.id, ehAdmin, filtroAgente])

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

  const abrirLead = async (l) => {
    setLead(l)
    setTexto(sugestaoPara(l))
    setMensagens([])
    const { data } = await supabase.rpc('bf_mensagens', { p_lead_id: l.id, p_limit: 30 })
    setMensagens(data || [])
  }

  const fechar = () => { setLead(null); setMensagens([]); setTexto('') }

  const enviarComoAna = async () => {
    if (!lead || !texto.trim() || enviando) return
    setEnviando(true)
    try {
      const sugestaoOriginal = sugestaoPara(lead)
      const { error } = await supabase.functions.invoke('bf-disparar-mensagem', {
        body: {
          lead_id: lead.id,
          texto: texto.trim(),
          agente_id: profile.id,
          sugestao_ia: sugestaoOriginal,
          editado: texto.trim() !== sugestaoOriginal,
        },
      })
      if (error) { alert('Erro ao enviar: ' + (error.message || 'tente de novo')) }
      else { fechar(); carregar() }
    } finally { setEnviando(false) }
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

  const cardsDe = (col) => board.filter(l =>
    l.coluna === col && (!soVermelhos || l.cor === 'vermelho')
  ).slice(0, 60)

  return (
    <div>
      <div style={s.title}>🤱 Revisão IA — Retroativo</div>
      <div style={s.sub}>Funil das mães do retroativo. Vermelho = travou agora; cinza = backlog frio.</div>

      <div style={s.topo}>
        <button style={{ ...s.chip, ...(soVermelhos ? s.chipOn : {}) }} onClick={() => setSoVermelhos(v => !v)}>
          🔴 Só vermelhos ({totalVermelhos})
        </button>
        <span style={s.kpi}>🔍 Fila do analista: <b>{filaAnalista}</b></span>
        <span style={s.kpi}>Total: <b>{board.length}</b></span>
        <span style={s.kpi}>Finalizadas: <b>{finalizadas}</b></span>
        {ehAdmin && (
          <select style={s.chip} value={filtroAgente} onChange={e => setFiltroAgente(e.target.value)}>
            <option value="">Todos os agentes</option>
            {agentes.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        )}
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
                    {l.cor === 'vermelho' ? '🔴 ' : ''}{l.cor === 'amarelo' ? '🟡 ' : ''}parada há {fmtParado(l.minutos_parado)}
                    {ehAdmin && l.agente_nome ? ` · ${l.agente_nome}` : ''}
                  </div>
                  {l.coluna === 'REPROVADO' && l.cnis_reprovado_motivo && (
                    <div style={s.cardMeta}>❌ {l.cnis_reprovado_motivo}</div>
                  )}
                  {l.bf_em_tratamento && <span style={s.tagTrat}>em tratamento</span>}
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
              {ehAdmin && lead.agente_nome && <div>👤 Dona: {lead.agente_nome}</div>}
            </div>

            <div style={s.msgs}>
              {mensagens.length === 0 && <div style={{ fontSize: 12, color: '#aaa' }}>Sem mensagens.</div>}
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

            <textarea style={s.textarea} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Mensagem que a Ana vai enviar..." />
            <button style={s.btnEnviar} disabled={enviando || !texto.trim()} onClick={enviarComoAna}>
              {enviando ? 'Enviando...' : '💬 Enviar como Ana'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
