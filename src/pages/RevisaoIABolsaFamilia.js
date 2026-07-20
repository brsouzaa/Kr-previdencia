import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// Agentes BF por ID (Joana, Pamela, Juliana/Ju, Nadia) — sem trocar role delas
export const IDS_AGENTES_BF = [
  '758a33f7-e5a2-4ef7-943a-dfe0ac72a387', // Joana
  '64ced61d-fdae-4399-97c9-900c59120fff', // Pamela
  '7ad37a1d-e5be-438c-9afd-982646d507d4', // Juliana (Ju Ferreira)
  'a3e94f8b-7e64-479b-9d72-1414afb83d1c', // Nadia Cajado
]

// Supervisores de board (Egle): veem em modo supervisor — todos os atendentes + filtro + cores
const IDS_SUPERVISOR_BOARD = [
  '6db43f01-71e6-4972-b84e-eb49375e8e70', // Egle Marcela
]

const COLUNAS = [
  ['OFERTA', '📢 Oferta'],
  ['COLETA_RG_FRENTE', '🪪 RG Frente'],
  ['COLETA_RG_VERSO', '🪪 RG Verso'],
  ['COLETA_EXTRATO', '📄 Extrato'],
  ['DOCS_COMPLETOS', '✅ A digitar'],
  ['BF_AGUARDANDO_LINK', '⏳ Aguard. link'],
  ['BF_LINK_ENVIADO', '🔗 Link enviado'],
  ['BF_AGUARDANDO_ASSINATURA', '✍️ Aguard. assinatura'],
  ['BF_ASSINADO', '💰 Assinado'],
  ['BF_CONCLUIDO', '🎉 Concluído'],
]

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

const CORES = {
  vermelho: { border: '1px solid #A32D2D', background: '#FEF6F6' },
  amarelo: { border: '1px solid #C88A00', background: '#FFFBEB' },
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
  msgs: { maxHeight: 220, overflowY: 'auto', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: 10, marginBottom: 12, display: 'flex', flexDirection: 'column-reverse', gap: 6 },
  msgCliente: { alignSelf: 'flex-start', background: '#F1F1F1', borderRadius: '10px 10px 10px 2px', padding: '6px 10px', fontSize: 12, maxWidth: '85%' },
  msgAna: { alignSelf: 'flex-end', background: '#EAF3DE', borderRadius: '10px 10px 2px 10px', padding: '6px 10px', fontSize: 12, maxWidth: '85%' },
  textarea: { width: '100%', minHeight: 90, padding: 10, fontSize: 13, borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.2)', boxSizing: 'border-box', marginBottom: 8, fontFamily: 'inherit' },
  btnEnviar: { width: '100%', padding: 12, background: '#3B6D11', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 10 },
  acoes: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  btnAcao: { padding: '9px 12px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer' },
  btnFechar: { padding: '9px 12px', background: '#fff', color: '#888', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 8, fontSize: 12, cursor: 'pointer' },
}

export default function RevisaoIABolsaFamilia() {
  const { profile } = useAuth()
  const ehAdmin = profile?.role === 'admin' || IDS_SUPERVISOR_BOARD.includes(profile?.id)

  const [board, setBoard] = useState([])
  const [soVermelhos, setSoVermelhos] = useState(false)
  const [agentes, setAgentes] = useState([])
  const [filtroAgente, setFiltroAgente] = useState('')
  const [linkCrefisa, setLinkCrefisa] = useState('')
  const [lead, setLead] = useState(null)
  const [mensagens, setMensagens] = useState([])
  const [texto, setTexto] = useState('')
  const [sugestao, setSugestao] = useState('')
  const [enviando, setEnviando] = useState(false)

  const carregar = useCallback(async () => {
    if (!profile?.id) return
    const p_agente = ehAdmin ? (filtroAgente || null) : profile.id
    const { data } = await supabase.rpc('bf_board', { p_agente })
    setBoard(data || [])
  }, [profile, ehAdmin, filtroAgente])

  useEffect(() => { carregar(); const t = setInterval(carregar, 45000); return () => clearInterval(t) }, [carregar])

  useEffect(() => {
    supabase.from('app_config').select('valor').eq('chave', 'bf_link_crefisa').single()
      .then(({ data }) => setLinkCrefisa(data?.valor || ''))
    if (ehAdmin) {
      supabase.from('profiles').select('id, nome').in('id', IDS_AGENTES_BF).order('nome')
        .then(({ data }) => setAgentes(data || []))
    }
  }, [ehAdmin])

  async function abrirCard(l) {
    setLead(l)
    const sug = sugestaoPara(l, linkCrefisa)
    setSugestao(sug); setTexto(sug)
    const { data } = await supabase.rpc('bf_mensagens', { p_lead_id: l.id, p_limit: 12 })
    setMensagens(data || [])
  }

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
    setLead(null); setTexto(''); carregar()
  }

  async function distribuir() {
    const { data } = await supabase.rpc('bf_atribuir_agentes')
    alert(data?.ok ? `✅ ${data.atribuidos} leads distribuídos` : (data?.erro || 'Erro'))
    carregar()
  }

  const visiveis = soVermelhos ? board.filter(c => c.cor === 'vermelho') : board
  const totalVermelhos = board.filter(c => c.cor === 'vermelho').length

  return (
    <div>
      <div style={s.title}>🩷 Revisão IA — Bolsa Família</div>
      <div style={s.sub}>
        {ehAdmin ? 'Quadro geral do funil BF. Vermelho = travado, agente precisa destravar.' : 'Seus clientes do funil. Vermelho = travou, entre e destrave.'}
      </div>

      <div style={s.topo}>
        <button style={{ ...s.chip, ...(soVermelhos ? s.chipOn : {}) }} onClick={() => setSoVermelhos(v => !v)}>
          🔴 Só vermelhos ({totalVermelhos})
        </button>
        <span style={s.kpi}>Total no funil: <strong>{board.length}</strong></span>
        <span style={s.kpi}>Concluídos: <strong>{board.filter(c => c.sub_estado === 'BF_CONCLUIDO').length}</strong></span>
        {ehAdmin && (
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
        {COLUNAS.map(([key, label]) => {
          const cards = visiveis.filter(c => c.sub_estado === key)
          return (
            <div key={key} style={s.col}>
              <div style={s.colTitulo}><span>{label}</span><span>{cards.length}</span></div>
              {cards.map(c => (
                <div key={c.id} style={{ ...s.card, ...(CORES[c.cor] || CORES.normal) }} onClick={() => abrirCard(c)}>
                  <div style={s.cardNome}>{c.nome || 'Sem nome'}</div>
                  <div style={s.cardMeta}>
                    {c.valor ? `R$ ${c.valor} · ` : ''}{c.cor === 'vermelho' ? `🔴 parado há ${c.minutos_parado} min` : c.cor === 'amarelo' ? `🟡 ${c.minutos_parado} min` : `${c.minutos_parado} min`}
                  </div>
                  {ehAdmin && c.agente_nome && <div style={s.cardMeta}>👤 {c.agente_nome}</div>}
                  {c.bf_em_tratamento && <span style={s.tagTrat}>em tratamento</span>}
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {lead && (
        <div style={s.overlay} onClick={() => setLead(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>{lead.nome}</div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>
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

            <div style={s.msgs}>
              {mensagens.map((m, i) => (
                <div key={i} style={m.role === 'user' ? s.msgCliente : s.msgAna}>{m.content}</div>
              ))}
              {mensagens.length === 0 && <div style={{ fontSize: 12, color: '#aaa' }}>Sem mensagens.</div>}
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>💬 Mensagem (sugerida pela IA — edite à vontade):</div>
            <textarea style={s.textarea} value={texto} onChange={e => setTexto(e.target.value)} />
            <button style={s.btnEnviar} onClick={() => disparar(null)} disabled={enviando}>
              {enviando ? 'Enviando...' : '💗 Enviar como Ana'}
            </button>

            <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>Ações de etapa:</div>
            <div style={s.acoes}>
              {lead.sub_estado === 'DOCS_COMPLETOS' && <button style={s.btnAcao} onClick={() => disparar('proposta_digitada', '')} disabled={enviando}>✅ Proposta digitada</button>}
              {lead.sub_estado === 'BF_AGUARDANDO_LINK' && <button style={s.btnAcao} onClick={() => disparar('enviar_link', sugestaoPara({ ...lead, sub_estado: 'BF_LINK_ENVIADO' }, linkCrefisa))} disabled={enviando}>🔗 Enviar link Crefisa</button>}
              {lead.sub_estado === 'BF_LINK_ENVIADO' && <button style={s.btnAcao} onClick={() => disparar('cliente_chamou', '')} disabled={enviando}>📲 Cliente chamou</button>}
              {lead.sub_estado === 'BF_AGUARDANDO_ASSINATURA' && <button style={s.btnAcao} onClick={() => disparar('assinou', sugestaoPara({ ...lead, sub_estado: 'BF_ASSINADO' }, linkCrefisa))} disabled={enviando}>✍️ Assinou</button>}
              {lead.sub_estado === 'BF_ASSINADO' && <button style={s.btnAcao} onClick={() => disparar('concluido', sugestaoPara({ ...lead, sub_estado: 'BF_CONCLUIDO' }, linkCrefisa))} disabled={enviando}>🎉 Dinheiro caiu</button>}
              <button style={s.btnFechar} onClick={() => setLead(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
