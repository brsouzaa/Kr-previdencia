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
  ['NEGADO', '❌ Negados'],
  ['OUTROS', '❓ Outros'],
]

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
  tagTrat: { fontSize: 10, background: '#DFF3E0', color: '#256B2E', borderRadius: 6, padding: '2px 7px', display: 'inline-block', marginTop: 4, fontWeight: 600 },
  tagTratSup: { fontSize: 10, background: '#E0ECFF', color: '#185FA5', borderRadius: 6, padding: '2px 7px', display: 'inline-block', marginTop: 4, fontWeight: 600 },
  tagNinguem: { fontSize: 10, background: '#F3E6E6', color: '#A32D2D', borderRadius: 6, padding: '2px 7px', display: 'inline-block', marginTop: 4, fontWeight: 600 },
  tagRespondeu: { fontSize: 10, background: '#FFF3DC', color: '#B26B00', borderRadius: 6, padding: '2px 7px', display: 'inline-block', marginTop: 4, marginRight: 4, fontWeight: 700 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 50, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '3vh 12px', overflowY: 'auto' },
  modal: { background: '#fff', borderRadius: 14, width: '100%', maxWidth: 640, padding: '1.25rem', maxHeight: '92vh', overflowY: 'auto' },
  ficha: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 13, background: '#F8FAFC', borderRadius: 10, padding: 12, marginBottom: 12 },
  destaque: { gridColumn: '1 / -1', background: '#FFF7E6', border: '1px solid #C88A0040', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontWeight: 600 },
  anexoBox: { marginBottom: 12 },
  anexoLabel: { fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 },
  anexoRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  anexoImg: { width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)' },
  anexoFile: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: '#F4F8FC', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 8, fontSize: 12, color: '#185FA5', textDecoration: 'none', fontWeight: 500 },
  msgs: { maxHeight: 200, overflowY: 'auto', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: 10, marginBottom: 12, display: 'flex', flexDirection: 'column-reverse', gap: 6 },
  msgCliente: { alignSelf: 'flex-start', background: '#F1F1F1', borderRadius: '10px 10px 10px 2px', padding: '6px 10px', fontSize: 12, maxWidth: '85%' },
  msgAna: { alignSelf: 'flex-end', background: '#EAF3DE', borderRadius: '10px 10px 2px 10px', padding: '6px 10px', fontSize: 12, maxWidth: '85%' },
  textarea: { width: '100%', minHeight: 80, padding: 10, fontSize: 13, borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.2)', boxSizing: 'border-box', marginBottom: 8, fontFamily: 'inherit' },
  btnEnviar: { width: '100%', padding: 12, background: '#3B6D11', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 10 },
  btnAprovar: { flex: 1, padding: 12, background: '#3B6D11', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnReprovar: { flex: 1, padding: 12, background: '#A32D2D', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnAvancar: { flex: 1, padding: 12, background: '#185FA5', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnVoltar: { flex: 1, padding: 12, background: '#fff', color: '#666', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnFechar: { padding: '9px 12px', background: '#fff', color: '#888', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 8, fontSize: 12, cursor: 'pointer' },
  btnNegar: { padding: '9px 12px', background: '#FBECEC', color: '#B23B3B', border: '0.5px solid rgba(178,59,59,0.3)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  painelMotivos: { marginTop: 8, padding: 12, background: '#FAFAFA', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 10 },
  motivosGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 },
  btnMotivo: { padding: '9px 10px', background: '#fff', color: '#B23B3B', border: '0.5px solid rgba(178,59,59,0.35)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left' },
}

export default function RevisaoIARetroativo() {
  const { profile } = useAuth()
  const ehAdmin = profile?.role === 'admin' || IDS_SUPERVISOR_BOARD.includes(profile?.id)

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
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)

  const carregar = useCallback(async () => {
    if (!profile?.id) return
    const p_agente = ehAdmin ? (filtroAgente || null) : profile.id
    const fe = faixaData(filtroEntrada, entradaDe, entradaAte)
    const fa = faixaData(filtroAtividade, ativDe, ativAte)
    const { data } = await supabase.rpc('mae_board', {
      p_agente,
      p_entrada_de: fe.de ? fe.de.toISOString() : null,
      p_entrada_ate: fe.ate ? fe.ate.toISOString() : null,
      p_ativ_de: fa.de ? fa.de.toISOString() : null,
      p_ativ_ate: fa.ate ? fa.ate.toISOString() : null,
    })
    setBoard(data || [])
  }, [profile?.id, ehAdmin, filtroAgente, filtroEntrada, filtroAtividade, entradaDe, entradaAte, ativDe, ativAte])

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
      if (ehAdmin) {
        return <>{aviso}<span style={s.tagTratSup}>🟢 {l.agente_nome ? `${primeiroNome(l.agente_nome)} tratando` : 'em tratamento'}</span></>
      }
      return <>{aviso}<span style={s.tagTrat}>🟢 Você está tratando</span></>
    }
    if (ehAdmin && (l.cor === 'vermelho' || l.cor === 'amarelo') && l.coluna !== 'FINALIZADO' && l.coluna !== 'REPROVADO') {
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
    setTexto(sugestaoPara(l))
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

  const fechar = () => { setLead(null); setMensagens([]); setTexto(''); setAnexos([]) }

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
  ).slice(0, 60)

  return (
    <div>
      <div style={s.title}>🤱 Revisão IA — Retroativo</div>
      <div style={s.sub}>Funil das mães do retroativo. Vermelho = travou agora; cinza = backlog frio.</div>

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
        {ehAdmin && <span style={s.kpi}>⚪ Sem ninguém: <b>{semDono}</b></span>}
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
          const podeSoltar = col !== 'OUTROS'
          return (
            <div key={col}
              style={{ ...s.col, ...(podeSoltar && arrastando ? { outline: '2px dashed #185FA5' } : {}) }}
              onDragOver={podeSoltar ? (e => e.preventDefault()) : undefined}
              onDrop={podeSoltar ? (e => { e.preventDefault(); soltarNaColuna(col) }) : undefined}>
              <div style={s.colTitulo}><span>{titulo}</span><span>{board.filter(l => l.coluna === col).length}</span></div>
              {cards.map(l => (
                <div key={l.id} draggable
                  onDragStart={() => setArrastando(l.id)}
                  onDragEnd={() => setArrastando(null)}
                  style={{ ...s.card, ...(CORES[l.cor] || CORES.normal), cursor: 'grab' }}
                  onClick={() => abrirLead(l)}>
                  <div style={s.cardNome}>{l.nome || 'Sem nome'}</div>
                  <div style={s.cardMeta}>
                    {l.cor === 'vermelho' ? '🔴 ' : ''}{l.cor === 'amarelo' ? '🟡 ' : ''}parada há {fmtParado(l.minutos_parado)}
                    {ehAdmin && l.agente_nome ? ` · ${l.agente_nome}` : ''}
                  </div>
                  {(l.coluna === 'REPROVADO' || l.coluna === 'NEGADO') && l.cnis_reprovado_motivo && (
                    <div style={s.cardMeta}>❌ {l.cnis_reprovado_motivo}</div>
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
              {ehAdmin && lead.agente_nome && <div>👤 Dona: {lead.agente_nome}</div>}
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

            <div style={{ marginBottom: 10 }}>
              <button style={s.btnNegar} onClick={() => setMostrarMotivosNegar(v => !v)}>❌ Negar / Não quis</button>
              {mostrarMotivosNegar && (
                <div style={s.painelMotivos}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 8 }}>Por que está negando? (não mexe no CNIS)</div>
                  <div style={s.motivosGrid}>
                    {MOTIVOS_NEGAR.map(([codigo, texto]) => (
                      <button key={codigo} style={s.btnMotivo} onClick={() => negarLead(lead.id, texto)}>{texto}</button>
                    ))}
                  </div>
                </div>
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

            {lead.estado === 'COLETANDO_CADASTRO' && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Mover etapa do cadastro na mão (não aciona a IA):</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={s.btnVoltar} disabled={enviando} onClick={() => avancarEtapa('voltar')}>← Voltar</button>
                  <button style={s.btnAvancar} disabled={enviando} onClick={() => avancarEtapa('proximo')}>Próxima etapa →</button>
                </div>
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
