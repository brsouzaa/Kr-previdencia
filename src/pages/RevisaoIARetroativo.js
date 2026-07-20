import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const COLUNAS = [
  ['QUALIFICANDO', '💬 Qualificando'],
  ['PEDIU_CNIS', '📄 Pediu CNIS'],
  ['FILA_GERID', '🗂️ Fila GERID'],
  ['A_ANALISAR', '🔍 CNIS a analisar'],
  ['PRECISA_HUMANO', '🙋 Precisa humano'],
  ['PITCH_LIBERADO', '🚀 Pitch liberado'],
  ['COLETANDO', '📋 Coletando cadastro'],
  ['AGUARDANDO_ASSINATURA', '✍️ Aguard. assinatura'],
  ['FINALIZADO', '🎉 Finalizado'],
  ['REPROVADO', '⛔ Reprovado'],
  ['DESQUALIFICADO', '🚫 Desqualificado'],
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
    QUALIFICANDO: `Oi ${nome}! 💗 Vi que a gente parou no meio da sua análise do retroativo. Posso continuar? É rapidinho e pode valer mais de R$ 6 mil pra você!`,
    PEDIU_CNIS: `${nome}, pra eu confirmar o seu direito só falta o seu extrato CNIS 📄 Você consegue me mandar? Se tiver dúvida de como tirar, eu te ajudo passo a passo 💗`,
    PITCH_LIBERADO: `${nome}, boa notícia! ✅ Analisamos o seu CNIS e está tudo certo pra seguir. Posso te explicar os próximos passos?`,
    COLETANDO: `${nome}, falta pouquinho pra finalizar seu cadastro! 💗 Me manda o que falta que eu já deixo tudo pronto pra você.`,
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
  const ehAdmin = profile?.role === 'admin'

  const [board, setBoard] = useState([])
  const [soVermelhos, setSoVermelhos] = useState(false)
  const [agentes, setAgentes] = useState([])
  const [filtroAgente, setFiltroAgente] = useState('')
  const [lead, setLead] = useState(null)
  const [mensagens, setMensagens] = useState([])
  const [texto, setTexto] = useState('')
  const [sugestao, setSugestao] = useState('')
  const [enviando, setEnviando] = useState(false)

  const carregar = useCallback(async () => {
    if (!profile?.id) return
    const p_agente = ehAdmin ? (filtroAgente || null) : profile.id
    const { data } = await supabase.rpc('mae_board', { p_agente })
    setBoard(data || [])
  }, [profile, ehAdmin, filtroAgente])

  useEffect(() => { carregar(); const t = setInterval(carregar, 45000); return () => clearInterval(t) }, [carregar])

  useEffect(() => {
    if (ehAdmin) {
      supabase.from('profiles').select('id, nome').eq('role', 'agente_bf').then(() => {})
      supabase.rpc('mae_board', { p_agente: null }).then(() => {})
      supabase.from('profiles').select('id, nome')
        .in('id', ['758a33f7-e5a2-4ef7-943a-dfe0ac72a387', '64ced61d-fdae-4399-97c9-900c59120fff', '7ad37a1d-e5be-438c-9afd-982646d507d4', 'a3e94f8b-7e64-479b-9d72-1414afb83d1c'])
        .order('nome')
        .then(({ data }) => setAgentes(data || []))
    }
  }, [ehAdmin])

  async function abrirCard(l) {
    setLead(l)
    const sug = sugestaoPara(l)
    setSugestao(sug); setTexto(sug)
    const { data } = await supabase.rpc('bf_mensagens', { p_lead_id: l.id, p_limit: 12 })
    setMensagens(data || [])
  }

  async function enviarComoAna() {
    if (!lead) return
    setEnviando(true)
    const { data, error } = await supabase.functions.invoke('bf-disparar-mensagem', {
      body: {
        lead_id: lead.id,
        texto: texto && texto.trim() ? texto.trim() : null,
        agente_id: profile?.id,
        sugestao_ia: sugestao,
        editado: texto.trim() !== sugestao.trim(),
      },
    })
    setEnviando(false)
    if (error || !data?.ok) { alert('Erro: ' + (error?.message || data?.erro || 'falhou')); return }
    setLead(null); setTexto(''); carregar()
  }

  async function decidirCnis(aprovado) {
    if (!lead) return
    let motivo = null
    if (!aprovado) {
      motivo = window.prompt('Motivo da reprovação:')
      if (motivo === null) return
    }
    setEnviando(true)
    const { data, error } = await supabase.rpc('mae_aprovar_cnis', {
      p_lead_id: lead.id, p_aprovado: aprovado, p_analista: profile?.id, p_motivo: motivo,
    })
    setEnviando(false)
    if (error || !data?.ok) { alert('Erro: ' + (error?.message || data?.erro || 'falhou')); return }
    setLead(null); carregar()
  }

  const visiveis = soVermelhos ? board.filter(c => c.cor === 'vermelho') : board
  const totalVermelhos = board.filter(c => c.cor === 'vermelho').length
  const filaAnalista = board.filter(c => c.coluna === 'A_ANALISAR').length

  return (
    <div>
      <div style={s.title}>🤱 Revisão IA — Retroativo</div>
      <div style={s.sub}>
        {ehAdmin ? 'Funil das mães do retroativo. Vermelho = travou agora; cinza = backlog frio.' : 'Suas mães do funil. Vermelho = travou, entre e destrave. Na coluna "CNIS a analisar", aprove ou reprove.'}
      </div>

      <div style={s.topo}>
        <button style={{ ...s.chip, ...(soVermelhos ? s.chipOn : {}) }} onClick={() => setSoVermelhos(v => !v)}>
          🔴 Só vermelhos ({totalVermelhos})
        </button>
        <span style={s.kpi}>🔍 Fila do analista: <strong>{filaAnalista}</strong></span>
        <span style={s.kpi}>Total: <strong>{board.length}</strong></span>
        <span style={s.kpi}>Finalizadas: <strong>{board.filter(c => c.coluna === 'FINALIZADO').length}</strong></span>
        {ehAdmin && (
          <select style={{ ...s.chip, cursor: 'pointer' }} value={filtroAgente} onChange={e => setFiltroAgente(e.target.value)}>
            <option value="">Todos os agentes</option>
            {agentes.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        )}
        <button style={s.chip} onClick={carregar}>🔄 Atualizar</button>
      </div>

      <div style={s.board}>
        {COLUNAS.map(([key, label]) => {
          const cards = visiveis.filter(c => c.coluna === key)
          return (
            <div key={key} style={s.col}>
              <div style={s.colTitulo}><span>{label}</span><span>{cards.length}</span></div>
              {cards.slice(0, 60).map(c => (
                <div key={c.id} style={{ ...s.card, ...(CORES[c.cor] || CORES.normal) }} onClick={() => abrirCard(c)}>
                  <div style={s.cardNome}>{c.nome || 'Sem nome'}</div>
                  <div style={s.cardMeta}>
                    {c.cor === 'vermelho' ? `🔴 parada há ${fmtParado(c.minutos_parado)}` : c.cor === 'amarelo' ? `🟡 ${fmtParado(c.minutos_parado)}` : `${fmtParado(c.minutos_parado)}`}
                    {c.idade_bebe ? ` · 👶 ${c.idade_bebe}` : ''}
                  </div>
                  {ehAdmin && c.agente_nome && <div style={s.cardMeta}>👤 {c.agente_nome}</div>}
                  {c.motivo_desqualificacao && key === 'DESQUALIFICADO' && <div style={s.cardMeta}>❌ {String(c.motivo_desqualificacao).slice(0, 40)}</div>}
                  {c.bf_em_tratamento && <span style={s.tagTrat}>em tratamento</span>}
                </div>
              ))}
              {cards.length > 60 && <div style={{ fontSize: 11, color: '#999', padding: 6 }}>+{cards.length - 60} mais…</div>}
            </div>
          )
        })}
      </div>

      {lead && (
        <div style={s.overlay} onClick={() => setLead(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>{lead.nome}</div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>
              {(COLUNAS.find(c => c[0] === lead.coluna) || [])[1] || lead.coluna} · parada há {fmtParado(lead.minutos_parado)}
            </div>

            <div style={s.ficha}>
              <div style={s.destaque}>👶 Nascimento do filho: {lead.data_nascimento_filho || '—'} {lead.idade_bebe ? `(${lead.idade_bebe})` : ''}</div>
              <div>📞 {lead.tel || '—'}</div>
              <div>🪪 CPF: {lead.cpf || '—'}</div>
              <div>💼 Trabalhava no nascimento: {lead.trabalhava_no_nascimento || '—'}</div>
              <div>📇 Já trabalhou CLT: {lead.ja_trabalhou_clt || '—'}</div>
              <div>🪪 RG: {lead.doc_rg_frente ? '✅' : '❌'} frente · {lead.doc_rg_verso ? '✅' : '❌'} verso</div>
              <div>📜 Certidão: {lead.certidao ? '✅' : '❌'}</div>
              {lead.cnis_reprovado_motivo && <div style={{ gridColumn: '1 / -1', color: '#A32D2D' }}>⛔ Reprovado: {lead.cnis_reprovado_motivo}</div>}
            </div>

            {lead.coluna === 'A_ANALISAR' && (
              <div style={{ background: '#FFF7E6', borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 13 }}>
                🔍 <strong>Análise do CNIS:</strong> baixe o CNIS na conversa da Vendeai, cruze com a data de nascimento do filho acima e decida:
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button style={s.btnAprovar} onClick={() => decidirCnis(true)} disabled={enviando}>✅ APROVAR CNIS</button>
                  <button style={s.btnReprovar} onClick={() => decidirCnis(false)} disabled={enviando}>⛔ REPROVAR</button>
                </div>
              </div>
            )}

            <div style={s.msgs}>
              {mensagens.map((m, i) => (
                <div key={i} style={m.role === 'user' ? s.msgCliente : s.msgAna}>{m.content}</div>
              ))}
              {mensagens.length === 0 && <div style={{ fontSize: 12, color: '#aaa' }}>Sem mensagens.</div>}
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>💬 Mensagem de destrave (sugerida pela IA — edite à vontade):</div>
            <textarea style={s.textarea} value={texto} onChange={e => setTexto(e.target.value)} />
            <button style={s.btnEnviar} onClick={enviarComoAna} disabled={enviando}>
              {enviando ? 'Enviando...' : '💗 Enviar como Ana'}
            </button>
            <button style={s.btnFechar} onClick={() => setLead(null)}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  )
}
