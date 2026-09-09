import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// ===== Revisão Crefaz (09/09) =====
// Onde a Duda trabalha os clientes que o robô pré-aprovou no Crédito Conta de Luz.
//
// DE ONDE VEM: todo registro de crefaz_fila com status 'pre_aprovado' OU
// 'enviado_atendimento'. NÃO existe mais botão de "entregar" na Central de
// Retorno — o pré-aprovado sobe pra cá sozinho. O 'enviado_atendimento' entra
// junto porque é o único cliente que passou pelo botão antigo antes de ele sair;
// se ficasse de fora, ele sumiria da operação.
//
// POR QUE COLUNAS NOVAS (contato_*) EM VEZ DE MEXER NO `status`:
// o `status` é do ROBÔ — ele consulta o Crefaz sozinho e grava pre_aprovado /
// negado (41 negados e 3 pré-aprovados só no dia 09/09, consultado_por='robo').
// Se o contato humano escrevesse no mesmo campo, os dois brigariam e o cliente
// sumiria do board no meio do atendimento. Mesma coisa em `tentativas` e
// `detalhe`, que são do robô: o contador humano é `contato_tentativas`.
//
// O board é DERIVADO de contato_status: não tem arrastar, o card anda sozinho
// quando a Duda registra a ação.

const COLUNAS = [
  [null, '📞 A chamar'],
  ['chamado', '⏳ Chamei — aguardando'],
  ['fechado', '✅ Fechou'],
  ['perdido', '❌ Perdeu'],
]

const MOTIVOS_PERDA = [
  'Não atende há dias',
  'Número errado / não existe',
  'Não quis o crédito',
  'Valor muito baixo pra ela',
  'Já fez com outro',
  'Conta de luz não está no nome',
  'Outro',
]

// SLA: quanto tempo o cliente está parado desde o pré-aprovado (ou desde a
// última ligação, se já foi chamado). Crédito pré-aprovado esfria rápido.
const SLA_AMARELO_H = 24
const SLA_VERMELHO_H = 72

const CORES = {
  vermelho: { border: '1px solid #f87171', background: 'rgba(248,113,113,.14)' },
  amarelo: { border: '1px solid #fbbf24', background: 'rgba(251,191,36,.12)' },
  normal: { border: '0.5px solid rgba(15,23,42,0.08)', background: '#ffffff' },
  feito: { border: '0.5px solid #3B6D1140', background: 'rgba(52,211,153,.14)' },
  morto: { border: '0.5px solid rgba(15,23,42,0.10)', background: '#f1f5f9' },
}

const s = {
  title: { fontSize: 20, fontWeight: 500, color: '#0f172a', marginBottom: 4 },
  sub: { fontSize: 13, color: '#5b6b84', marginBottom: 14 },
  topo: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 },
  kpi: { fontSize: 13, color: '#5b6b84', padding: '6px 12px', background: 'rgba(96,165,250,.10)', borderRadius: 8 },
  kpiForte: { fontSize: 13, fontWeight: 700, color: '#047857', padding: '6px 12px', background: 'rgba(52,211,153,.16)', borderRadius: 8 },
  kpiAlerta: { fontSize: 13, fontWeight: 700, color: '#dc2626', padding: '6px 12px', background: 'rgba(248,113,113,.14)', borderRadius: 8 },
  aoVivo: { fontSize: 11, fontWeight: 700, color: '#047857', background: 'rgba(52,211,153,.16)', borderRadius: 999, padding: '3px 10px' },
  aoVivoOff: { fontSize: 11, fontWeight: 700, color: '#b45309', background: 'rgba(251,191,36,.18)', borderRadius: 999, padding: '3px 10px' },
  buscaWrap: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' },
  buscaInput: { flex: '1 1 300px', maxWidth: 420, padding: '9px 12px', fontSize: 13, borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.18)', background: '#ffffff', color: '#0f172a', boxSizing: 'border-box' },
  board: { display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 16, alignItems: 'flex-start' },
  col: { minWidth: 260, maxWidth: 260, background: '#eef2f7', borderRadius: 12, padding: 9, flexShrink: 0 },
  colTitulo: { fontSize: 11.5, fontWeight: 700, color: '#64748b', padding: '3px 4px 9px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, letterSpacing: '.01em' },
  colContador: { fontSize: 10.5, fontWeight: 700, color: '#64748b', background: 'rgba(15,23,42,.06)', borderRadius: 999, padding: '1px 8px', flexShrink: 0 },
  colVazia: { fontSize: 11.5, color: '#94a3b8', padding: '10px 4px' },
  card: { borderRadius: 10, padding: '9px 11px', marginBottom: 8, cursor: 'pointer', transition: 'box-shadow .12s' },
  cardPulso: { boxShadow: '0 0 0 2px rgba(96,165,250,.55)' },
  cardTopo: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  cardNome: { fontSize: 13, fontWeight: 600, color: '#0f172a', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cardValor: { fontSize: 12.5, fontWeight: 700, color: '#047857', whiteSpace: 'nowrap' },
  cardTags: { display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, flexWrap: 'wrap' },
  cardMeta: { fontSize: 11, color: '#5b6b84', marginTop: 5 },
  badge: { fontSize: 10, background: 'rgba(139,155,180,.14)', color: '#5b6b84', borderRadius: 999, padding: '2px 8px', fontWeight: 600, display: 'inline-block', whiteSpace: 'nowrap' },
  badgeLig: { fontSize: 10, background: 'rgba(167,139,250,.16)', color: '#7c3aed', borderRadius: 999, padding: '2px 8px', fontWeight: 700, display: 'inline-block', whiteSpace: 'nowrap' },
  badgeQuente: { fontSize: 10, background: 'rgba(248,113,113,.16)', color: '#dc2626', borderRadius: 999, padding: '2px 8px', fontWeight: 700, display: 'inline-block', whiteSpace: 'nowrap' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 50, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '2vh 12px' },
  modal: { background: '#ffffff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '96vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(15,23,42,0.28)' },
  mHead: { padding: '14px 18px 12px', borderBottom: '0.5px solid rgba(15,23,42,0.10)', flexShrink: 0 },
  mHeadTopo: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  mNome: { fontSize: 17, fontWeight: 650, color: '#0f172a', lineHeight: 1.25 },
  mSub: { fontSize: 12, color: '#5b6b84', marginTop: 3 },
  mX: { flexShrink: 0, width: 30, height: 30, borderRadius: 8, border: 'none', background: '#f1f5f9', color: '#5b6b84', fontSize: 16, cursor: 'pointer', lineHeight: 1 },
  mCorpo: { padding: '12px 18px', overflowY: 'auto', flex: 1, minHeight: 0 },
  mFoot: { padding: '10px 18px 14px', borderTop: '0.5px solid rgba(15,23,42,0.10)', flexShrink: 0, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  ficha: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 },
  pill: { fontSize: 11, fontWeight: 600, borderRadius: 999, padding: '3px 9px', background: '#f1f5f9', color: '#5b6b84', whiteSpace: 'nowrap' },
  pillValor: { fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '3px 9px', background: 'rgba(52,211,153,.16)', color: '#047857', whiteSpace: 'nowrap' },
  secTitulo: { fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6, marginTop: 4 },
  linhaCopia: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  dado: { fontSize: 14, fontWeight: 600, color: '#0f172a' },
  btnCopiar: { fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 7, border: '0.5px solid rgba(15,23,42,0.14)', background: '#ffffff', color: '#5b6b84', cursor: 'pointer' },
  btnZap: { fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 7, border: 'none', background: 'rgba(52,211,153,.18)', color: '#047857', textDecoration: 'none' },
  btnChamei: { width: '100%', padding: 13, background: '#60a5fa', color: '#232a37', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 10 },
  btnFechou: { flex: 1, padding: 11, background: '#34d399', color: '#232a37', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  btnPerdeu: { flex: 1, padding: 11, background: '#ffffff', color: '#dc2626', border: '1px solid #f87171', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  btnVoltar: { padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: '0.5px solid rgba(15,23,42,0.11)', background: '#ffffff', color: '#5b6b84' },
  select: { width: '100%', padding: 10, fontSize: 13, borderRadius: 9, border: '0.5px solid rgba(15,23,42,0.18)', background: '#ffffff', color: '#0f172a', boxSizing: 'border-box', marginBottom: 8 },
  textarea: { width: '100%', minHeight: 70, padding: 10, fontSize: 13, borderRadius: 10, border: '0.5px solid rgba(15,23,42,0.18)', boxSizing: 'border-box', marginBottom: 8, fontFamily: 'inherit', resize: 'vertical' },
  hist: { fontSize: 12, color: '#5b6b84', background: '#f8fafc', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 10, padding: 10, marginBottom: 10, lineHeight: 1.6 },
  erro: { fontSize: 12.5, fontWeight: 600, color: '#dc2626', background: 'rgba(248,113,113,.12)', border: '1px solid #f87171', borderRadius: 9, padding: '9px 11px', marginBottom: 10 },
  vazio: { fontSize: 13.5, color: '#5b6b84', padding: 22, background: '#f8fafc', borderRadius: 12, textAlign: 'center' },
  rodape: { fontSize: 11.5, color: '#94a3b8', marginTop: 14, lineHeight: 1.6 },
}

const soDigitos = (v) => String(v || '').replace(/\D/g, '')

function cpfBonito(v) {
  const d = soDigitos(v)
  if (!v) return '—'
  if (d.length !== 11) return v
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

function telBonito(v) {
  let d = soDigitos(v)
  if (!d) return '—'
  if (d.length === 13 && d.startsWith('55')) d = d.slice(2)
  if (d.length === 12 && d.startsWith('55')) d = d.slice(2)
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return v
}

function inteiroBR(v) {
  if (v === null || v === undefined) return '—'
  return 'R$ ' + Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

// "há 3h", "há 2 dias" — o que responde "quem eu chamo agora"
function fmtHa(iso) {
  if (!iso) return '—'
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`
}

function fmtQuando(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// horas paradas desde o marco que importa: se já foi chamado, conta da ligação
function horasParado(l) {
  const marco = l.contato_ultima_em || l.consultado_em || l.criado_em
  if (!marco) return 0
  return (Date.now() - new Date(marco).getTime()) / 3600000
}

function corDe(l) {
  if (l.contato_status === 'fechado') return CORES.feito
  if (l.contato_status === 'perdido') return CORES.morto
  const h = horasParado(l)
  if (h >= SLA_VERMELHO_H) return CORES.vermelho
  if (h >= SLA_AMARELO_H) return CORES.amarelo
  return CORES.normal
}

export default function RevisaoCrefaz() {
  const { profile } = useAuth()
  const [linhas, setLinhas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(null)      // linha no modal
  const [modoPerda, setModoPerda] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [obs, setObs] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [copiado, setCopiado] = useState('')
  const [aoVivo, setAoVivo] = useState(false)
  const [pulso, setPulso] = useState(null)

  const carregar = useCallback(async () => {
    // a view traz o CEP sugerido junto; a fila é só o que o robô pré-aprovou
    const { data, error } = await supabase
      .from('crefaz_fila_painel')
      .select('id, nome, cpf, telefone, ddd, uf, concessionaria, valor_max, status, valor_pre_aprovado, consultado_em, consultado_por, enviado_atendimento_em, criado_em, cep_sugerido, cep_cidade, cep_aproximado, contato_status, contato_tentativas, contato_ultima_em, contato_por, contato_obs, contato_fechado_em')
      .in('status', ['pre_aprovado', 'enviado_atendimento'])
      .order('consultado_em', { ascending: true, nullsFirst: false })
    if (!error) setLinhas(data || [])
    setCarregando(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // Tempo real: a tela fica aberta o dia todo e o robô pré-aprova a qualquer
  // hora. Sem isso a Duda só veria o cliente novo se apertasse F5.
  useEffect(() => {
    const canal = supabase
      .channel('crefaz-revisao-ao-vivo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crefaz_fila' }, (ev) => {
        const nova = ev.new || {}
        const velha = ev.old || {}
        const naFila = (r) => ['pre_aprovado', 'enviado_atendimento'].includes(r?.status)
        setLinhas(prev => {
          if (ev.eventType === 'DELETE') return prev.filter(l => l.id !== velha.id)
          if (!naFila(nova)) return prev.filter(l => l.id !== nova.id)   // saiu da fila
          const achou = prev.some(l => l.id === nova.id)
          if (!achou) { setPulso(nova.id); return [...prev, nova] }
          return prev.map(l => (l.id === nova.id ? { ...l, ...nova } : l))
        })
        setPulso(nova.id || velha.id)
        setTimeout(() => setPulso(null), 2500)
      })
      .subscribe((st) => setAoVivo(st === 'SUBSCRIBED'))
    return () => { supabase.removeChannel(canal) }
  }, [])

  // ESC fecha o modal
  useEffect(() => {
    if (!aberto) return
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      setAberto(null); setModoPerda(false); setMotivo(''); setObs(''); setErro('')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aberto])

  const copiar = async (texto, chave) => {
    try {
      await navigator.clipboard.writeText(soDigitos(texto) || String(texto || ''))
      setCopiado(chave)
      setTimeout(() => setCopiado(''), 1600)
    } catch { /* clipboard bloqueado: a pessoa copia na mão */ }
  }

  function fechar() {
    setAberto(null); setModoPerda(false); setMotivo(''); setObs(''); setErro('')
  }

  // ── grava a ação e CONFERE se gravou ────────────────────────────────
  // Sem policy o PostgREST devolve 200 com ZERO linhas e nenhum erro: a tela
  // pareceria ter salvo e não salvou. Foi o furo que achei na aba Crefaz em
  // 08/09 — por isso todo update aqui checa data.length.
  async function gravar(linha, patch) {
    setOcupado(true); setErro('')
    const { data, error } = await supabase
      .from('crefaz_fila')
      .update(patch)
      .eq('id', linha.id)
      .select()
    setOcupado(false)
    if (error) { setErro('Não gravou: ' + error.message); return null }
    if (!data || data.length === 0) {
      setErro('Nada foi gravado: seu login não tem permissão de escrita nessa fila. Avise o Bruno — não adianta clicar de novo.')
      return null
    }
    const nova = data[0]
    setLinhas(prev => prev.map(l => (l.id === nova.id ? { ...l, ...nova } : l)))
    return nova
  }

  async function chamei(l) {
    const nova = await gravar(l, {
      contato_status: 'chamado',
      contato_tentativas: (l.contato_tentativas || 0) + 1,
      contato_ultima_em: new Date().toISOString(),
      contato_por: profile?.nome || null,
    })
    if (nova) setAberto({ ...l, ...nova })
  }

  async function fechou(l) {
    const agora = new Date().toISOString()
    const nova = await gravar(l, {
      contato_status: 'fechado',
      contato_fechado_em: agora,
      contato_ultima_em: agora,
      contato_por: profile?.nome || null,
      contato_obs: obs.trim() || l.contato_obs || null,
    })
    if (nova) fechar()
  }

  async function perdeu(l) {
    if (!motivo) { setErro('Escolha o motivo antes de marcar como perdido.'); return }
    const texto = motivo === 'Outro' ? (obs.trim() || 'Outro') : (obs.trim() ? `${motivo} — ${obs.trim()}` : motivo)
    const nova = await gravar(l, {
      contato_status: 'perdido',
      contato_ultima_em: new Date().toISOString(),
      contato_por: profile?.nome || null,
      contato_obs: texto,
    })
    if (nova) fechar()
  }

  // volta pra fila: erro de clique não pode virar cliente perdido pra sempre
  async function devolverPraFila(l) {
    const nova = await gravar(l, { contato_status: l.contato_tentativas > 0 ? 'chamado' : null, contato_fechado_em: null })
    if (nova) fechar()
  }

  const visiveis = useMemo(() => {
    const b = busca.trim().toLowerCase()
    if (!b) return linhas
    const bd = soDigitos(b)
    return linhas.filter(l =>
      (l.nome || '').toLowerCase().includes(b) ||
      (bd && (soDigitos(l.cpf).includes(bd) || soDigitos(l.telefone).includes(bd))))
  }, [linhas, busca])

  const porColuna = useMemo(() => {
    const m = new Map(COLUNAS.map(([k]) => [k, []]))
    visiveis.forEach(l => {
      const k = l.contato_status || null
      if (m.has(k)) m.get(k).push(l)
    })
    // dentro da coluna, o mais parado primeiro — é quem esfria
    m.forEach(arr => arr.sort((a, b) => horasParado(b) - horasParado(a)))
    return m
  }, [visiveis])

  const kpis = useMemo(() => {
    const aChamar = linhas.filter(l => !l.contato_status)
    const chamados = linhas.filter(l => l.contato_status === 'chamado')
    const fechados = linhas.filter(l => l.contato_status === 'fechado')
    const soma = (arr) => arr.reduce((t, l) => t + Number(l.valor_pre_aprovado || 0), 0)
    return {
      aChamar: aChamar.length,
      chamados: chamados.length,
      fechados: fechados.length,
      perdidos: linhas.filter(l => l.contato_status === 'perdido').length,
      esfriando: linhas.filter(l => !['fechado', 'perdido'].includes(l.contato_status) && horasParado(l) >= SLA_VERMELHO_H).length,
      naMesa: soma(aChamar) + soma(chamados),
      fechado: soma(fechados),
    }
  }, [linhas])

  if (carregando) return <div style={{ padding: 20, color: '#5b6b84' }}>Carregando…</div>

  return (
    <div>
      <div style={s.title}>💡 Revisão Crefaz</div>
      <div style={s.sub}>
        Clientes que o robô pré-aprovou no Crédito Conta de Luz. Entram aqui sozinhos, sem ninguém precisar enviar.
      </div>

      <div style={s.topo}>
        <span style={s.kpi}>📞 A chamar: <b>{kpis.aChamar}</b></span>
        <span style={s.kpi}>⏳ Aguardando retorno: <b>{kpis.chamados}</b></span>
        <span style={s.kpiForte}>✅ Fechou: {kpis.fechados} · {inteiroBR(kpis.fechado)}</span>
        <span style={s.kpi}>❌ Perdeu: <b>{kpis.perdidos}</b></span>
        <span style={s.kpi}>💰 Na mesa: <b>{inteiroBR(kpis.naMesa)}</b></span>
        {kpis.esfriando > 0 && (
          <span style={s.kpiAlerta}>🥶 {kpis.esfriando} parado{kpis.esfriando > 1 ? 's' : ''} +3 dias</span>
        )}
        <span style={aoVivo ? s.aoVivo : s.aoVivoOff}>{aoVivo ? 'ao vivo' : 'conectando…'}</span>
      </div>

      <div style={s.buscaWrap}>
        <input
          style={s.buscaInput}
          placeholder="Buscar por nome, CPF ou telefone…"
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
        {busca && <button style={s.btnVoltar} onClick={() => setBusca('')}>limpar</button>}
      </div>

      {linhas.length === 0 ? (
        <div style={s.vazio}>
          Nenhum cliente pré-aprovado ainda. Assim que o robô aprovar alguém no Crefaz, ele aparece aqui sozinho.
        </div>
      ) : (
        <div style={s.board}>
          {COLUNAS.map(([chave, rotulo]) => {
            const lista = porColuna.get(chave) || []
            return (
              <div key={String(chave)} style={s.col}>
                <div style={s.colTitulo}>
                  <span>{rotulo}</span>
                  <span style={s.colContador}>{lista.length}</span>
                </div>
                {lista.length === 0 && <div style={s.colVazia}>vazio</div>}
                {lista.map(l => {
                  const h = horasParado(l)
                  const quente = !['fechado', 'perdido'].includes(l.contato_status) && h >= SLA_VERMELHO_H
                  return (
                    <div
                      key={l.id}
                      style={{ ...s.card, ...corDe(l), ...(pulso === l.id ? s.cardPulso : {}) }}
                      onClick={() => { setAberto(l); setModoPerda(false); setMotivo(''); setObs(''); setErro('') }}
                    >
                      <div style={s.cardTopo}>
                        <span style={s.cardNome}>{l.nome || 'sem nome'}</span>
                        <span style={s.cardValor}>{inteiroBR(l.valor_pre_aprovado)}</span>
                      </div>
                      <div style={s.cardTags}>
                        {l.concessionaria && <span style={s.badge}>{l.concessionaria}</span>}
                        {l.contato_tentativas > 0 && (
                          <span style={s.badgeLig}>📞 {l.contato_tentativas}x</span>
                        )}
                        {quente && <span style={s.badgeQuente}>esfriando</span>}
                      </div>
                      <div style={s.cardMeta}>
                        {l.contato_ultima_em
                          ? `última ligação ${fmtHa(l.contato_ultima_em)}`
                          : `pré-aprovado ${fmtHa(l.consultado_em)}`}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      <div style={s.rodape}>
        A ordem dentro de cada coluna é a do mais parado primeiro — quem está no topo é quem esfria.
        Amarelo passa de 24h sem contato, vermelho passa de 72h.
      </div>

      {aberto && (
        <div style={s.overlay} onClick={(e) => { if (e.target === e.currentTarget) fechar() }}>
          <div style={s.modal}>
            <div style={s.mHead}>
              <div style={s.mHeadTopo}>
                <div>
                  <div style={s.mNome}>{aberto.nome || 'sem nome'}</div>
                  <div style={s.mSub}>
                    Pré-aprovado {fmtQuando(aberto.consultado_em)}
                    {aberto.consultado_por ? ` · por ${aberto.consultado_por}` : ''}
                  </div>
                </div>
                <button style={s.mX} onClick={fechar}>×</button>
              </div>
              <div style={{ ...s.ficha, marginTop: 10, marginBottom: 0 }}>
                <span style={s.pillValor}>💰 {inteiroBR(aberto.valor_pre_aprovado)} liberado</span>
                {aberto.concessionaria && <span style={s.pill}>{aberto.concessionaria}</span>}
                {aberto.uf && <span style={s.pill}>{aberto.uf}</span>}
                {aberto.contato_tentativas > 0 && <span style={s.pill}>📞 {aberto.contato_tentativas} ligação(ões)</span>}
              </div>
            </div>

            <div style={s.mCorpo}>
              {erro && <div style={s.erro}>{erro}</div>}

              <div style={s.secTitulo}>Contato</div>
              <div style={s.linhaCopia}>
                <span style={s.dado}>{telBonito(aberto.telefone)}</span>
                <button style={s.btnCopiar} onClick={() => copiar(aberto.telefone, 'tel')}>
                  {copiado === 'tel' ? '✓ copiado' : 'copiar'}
                </button>
                <a
                  style={s.btnZap}
                  href={`https://wa.me/55${soDigitos(aberto.telefone).replace(/^55/, '')}`}
                  target="_blank" rel="noreferrer"
                >WhatsApp</a>
              </div>
              <div style={s.linhaCopia}>
                <span style={s.dado}>{cpfBonito(aberto.cpf)}</span>
                <button style={s.btnCopiar} onClick={() => copiar(aberto.cpf, 'cpf')}>
                  {copiado === 'cpf' ? '✓ copiado' : 'copiar'}
                </button>
              </div>
              {aberto.cep_sugerido && (
                <div style={s.linhaCopia}>
                  <span style={s.dado}>CEP {aberto.cep_sugerido}</span>
                  <button style={s.btnCopiar} onClick={() => copiar(aberto.cep_sugerido, 'cep')}>
                    {copiado === 'cep' ? '✓ copiado' : 'copiar'}
                  </button>
                  {aberto.cep_aproximado && (
                    <span style={s.badge}>aproximado — não é o endereço do cliente</span>
                  )}
                </div>
              )}

              {(aberto.contato_ultima_em || aberto.contato_obs) && (
                <>
                  <div style={s.secTitulo}>Histórico</div>
                  <div style={s.hist}>
                    {aberto.contato_tentativas > 0 && (
                      <div>📞 {aberto.contato_tentativas} ligação(ões) · última {fmtQuando(aberto.contato_ultima_em)}</div>
                    )}
                    {aberto.contato_por && <div>👤 por {aberto.contato_por}</div>}
                    {aberto.contato_fechado_em && <div>✅ fechou em {fmtQuando(aberto.contato_fechado_em)}</div>}
                    {aberto.contato_obs && <div>📝 {aberto.contato_obs}</div>}
                  </div>
                </>
              )}

              {modoPerda ? (
                <>
                  <div style={s.secTitulo}>Por que perdeu?</div>
                  <select style={s.select} value={motivo} onChange={e => setMotivo(e.target.value)}>
                    <option value="">Escolha o motivo…</option>
                    {MOTIVOS_PERDA.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <textarea
                    style={s.textarea}
                    placeholder="Detalhe (opcional)…"
                    value={obs}
                    onChange={e => setObs(e.target.value)}
                  />
                </>
              ) : (
                <>
                  <div style={s.secTitulo}>Observação (opcional)</div>
                  <textarea
                    style={s.textarea}
                    placeholder="O que o cliente disse…"
                    value={obs}
                    onChange={e => setObs(e.target.value)}
                  />
                </>
              )}
            </div>

            <div style={{ ...s.mFoot, flexDirection: 'column', alignItems: 'stretch' }}>
              {['fechado', 'perdido'].includes(aberto.contato_status) ? (
                <>
                  <div style={{ fontSize: 12.5, color: '#5b6b84', marginBottom: 8 }}>
                    {aberto.contato_status === 'fechado' ? '✅ Marcado como fechado.' : '❌ Marcado como perdido.'}
                    {' '}Clicou errado?
                  </div>
                  <button style={s.btnVoltar} disabled={ocupado} onClick={() => devolverPraFila(aberto)}>
                    ↩︎ Devolver pra fila
                  </button>
                </>
              ) : modoPerda ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={s.btnVoltar} disabled={ocupado} onClick={() => { setModoPerda(false); setErro('') }}>
                    voltar
                  </button>
                  <button style={s.btnPerdeu} disabled={ocupado} onClick={() => perdeu(aberto)}>
                    Confirmar perda
                  </button>
                </div>
              ) : (
                <>
                  <button style={s.btnChamei} disabled={ocupado} onClick={() => chamei(aberto)}>
                    📞 Chamei o cliente
                    {aberto.contato_tentativas > 0 ? ` (${aberto.contato_tentativas + 1}ª vez)` : ''}
                  </button>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={s.btnFechou} disabled={ocupado} onClick={() => fechou(aberto)}>
                      ✅ Fechou
                    </button>
                    <button style={s.btnPerdeu} disabled={ocupado} onClick={() => { setModoPerda(true); setObs(''); setErro('') }}>
                      ❌ Perdeu
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
