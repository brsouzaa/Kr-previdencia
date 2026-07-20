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
  ['NEGADO', '❌ Negados'],
]

// sub_estados que caem na coluna Negados (o BF_NEGADO manual + os que a Ana ja cria sozinha)
const SUB_ESTADOS_NEGADO = ['BF_NEGADO', 'DESQUALIFICADO_CAIXA_TEM', 'DESQUALIFICADO_SEM_BF', 'DESQUALIFICADO_SEM_BOLSA', 'RECUSOU_OFERTA', 'RECUSOU_VALOR', 'RECUSA_TEMPORARIA', 'DESISTIU', 'CANCELADO', 'RECUSOU']

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
  tagTrat: { fontSize: 10, background: '#DFF3E0', color: '#256B2E', borderRadius: 6, padding: '2px 7px', display: 'inline-block', marginTop: 4, fontWeight: 600 },
  tagTratSup: { fontSize: 10, background: '#E0ECFF', color: '#185FA5', borderRadius: 6, padding: '2px 7px', display: 'inline-block', marginTop: 4, fontWeight: 600 },
  tagNinguem: { fontSize: 10, background: '#F3E6E6', color: '#A32D2D', borderRadius: 6, padding: '2px 7px', display: 'inline-block', marginTop: 4, fontWeight: 600 },
  tagRespondeu: { fontSize: 10, background: '#FFF3DC', color: '#B26B00', borderRadius: 6, padding: '2px 7px', display: 'inline-block', marginTop: 4, marginRight: 4, fontWeight: 700 },
  tagMotivo: { fontSize: 10, background: '#EDEDED', color: '#666', borderRadius: 6, padding: '2px 7px', display: 'inline-block', marginTop: 4, fontWeight: 600 },
  btnNegar: { padding: '9px 12px', background: '#FBECEC', color: '#B23B3B', border: '0.5px solid rgba(178,59,59,0.3)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  painelMotivos: { marginTop: 10, padding: 12, background: '#FAFAFA', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 10 },
  motivosGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 },
  btnMotivo: { padding: '9px 10px', background: '#fff', color: '#B23B3B', border: '0.5px solid rgba(178,59,59,0.35)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 50, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '3vh 12px', overflowY: 'auto' },
  modal: { background: '#fff', borderRadius: 14, width: '100%', maxWidth: 640, padding: '1.25rem', maxHeight: '92vh', overflowY: 'auto' },
  ficha: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 13, background: '#F8FAFC', borderRadius: 10, padding: 12, marginBottom: 12 },
  anexoBox: { marginBottom: 12 },
  anexoLabel: { fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 },
  anexoRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  anexoImg: { width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)' },
  anexoFile: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: '#F4F8FC', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 8, fontSize: 12, color: '#185FA5', textDecoration: 'none', fontWeight: 500 },
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
  const [anexos, setAnexos] = useState([])
  const [carregandoAnexos, setCarregandoAnexos] = useState(false)
  const [atualizandoConversa, setAtualizandoConversa] = useState(false)
  const [mostrarMotivos, setMostrarMotivos] = useState(false)
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

  // Pega o card (marca selo) sem mandar mensagem
  async function marcarTratando(c) {
    if (!c) return
    await supabase.rpc('bf_marcar_tratando', { p_lead_id: c.id, p_agente_id: profile?.id })
    setLead({ ...c, bf_em_tratamento: true, cliente_respondeu: false })
    carregar()
  }
  // Solta o card (tira o selo)
  async function soltarTratamento(c) {
    if (!c) return
    await supabase.rpc('bf_soltar_tratamento', { p_lead_id: c.id })
    setLead({ ...c, bf_em_tratamento: false, cliente_respondeu: false })
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
      if (ehAdmin) {
        return <>{aviso}<span style={s.tagTratSup}>🟢 {c.agente_nome ? `${primeiroNome(c.agente_nome)} tratando` : 'em tratamento'}</span></>
      }
      return <>{aviso}<span style={s.tagTrat}>🟢 Você está tratando</span></>
    }
    if (ehAdmin && (c.cor === 'vermelho' || c.cor === 'amarelo') && c.sub_estado !== 'BF_CONCLUIDO') {
      return <span style={s.tagNinguem}>⚪ ninguém pegou</span>
    }
    return null
  }

  const visiveis = soVermelhos ? board.filter(c => c.cor === 'vermelho') : board
  const totalVermelhos = board.filter(c => c.cor === 'vermelho').length
  const semDono = board.filter(c => !c.bf_em_tratamento && (c.cor === 'vermelho' || c.cor === 'amarelo') && c.sub_estado !== 'BF_CONCLUIDO').length

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
        {ehAdmin && <span style={s.kpi}>⚪ Sem ninguém: <strong>{semDono}</strong></span>}
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
          const cards = key === 'NEGADO'
            ? visiveis.filter(c => SUB_ESTADOS_NEGADO.includes(c.sub_estado))
            : visiveis.filter(c => c.sub_estado === key)
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
                  {key === 'NEGADO' && <div style={s.tagMotivo}>❌ {labelMotivo(c)}</div>}
                  {key !== 'NEGADO' && seloTratamento(c)}
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

            <div style={s.anexoBox}>
              <div style={s.anexoLabel}>
                📎 Anexos {carregandoAnexos ? '(carregando...)' : `(${anexos.length})`}
              </div>
              {!carregandoAnexos && anexos.length === 0 && (
                <div style={{ fontSize: 12, color: '#aaa' }}>Nenhum anexo nesta conversa.</div>
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
                  style={{ fontSize: 12, padding: '6px 12px', background: '#FBECEC', color: '#B23B3B', border: '0.5px solid rgba(178,59,59,0.3)', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
                  onClick={() => soltarTratamento(lead)}
                >✋ Soltar (não estou mais nesse)</button>
              ) : (
                <button
                  style={{ fontSize: 12, padding: '6px 12px', background: '#EAF5E1', color: '#3B6D11', border: '0.5px solid rgba(59,109,17,0.3)', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
                  onClick={() => marcarTratando(lead)}
                >🙋 Estou nesse</button>
              )}
              {lead.bf_em_tratamento && lead.cliente_respondeu && (
                <span style={{ fontSize: 12, fontWeight: 700, color: '#B26B00', background: '#FFF3DC', padding: '6px 10px', borderRadius: 8 }}>💬 o cliente respondeu</span>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>
                💬 Conversa <span style={{ color: '#3B6D11', fontWeight: 500 }}>· atualiza sozinha</span>
              </span>
              <button
                style={{ fontSize: 11, padding: '4px 10px', background: '#F4F8FC', color: '#185FA5', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 8, cursor: 'pointer', fontWeight: 500 }}
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
              <button style={s.btnNegar} onClick={() => setMostrarMotivos(v => !v)} disabled={enviando}>❌ Negar / Não quis</button>
              <button style={s.btnFechar} onClick={() => setLead(null)}>Fechar</button>
            </div>

            {mostrarMotivos && (
              <div style={s.painelMotivos}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 8 }}>Por que está negando?</div>
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
