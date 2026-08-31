import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// 30-31/08 (Bruno): painel de planejamento pessoal. Ele anotava tudo no WhatsApp e se perdia.
// SÓ ELE VÊ — trancado por ID, não por role. Dados dele (RLS por dono_id no banco).
const ID_DONO = '906f9a57-bd4a-4b0e-9973-0968ef4f1e15' // Bruno Souza

const ABAS = [
  ['dia', '⭐ Meu dia'],
  ['projetos', '🚀 Projetos'],
  ['metas', '🎯 Metas'],
  ['notas', '📌 Anotações'],
  ['semana', '📊 Semana'],
]
const COLUNAS = [
  ['ATRASADO', '🔴 Atrasado', 'Não fez no dia. Vira dívida, não some.'],
  ['HOJE', '⭐ Hoje', 'O que tem que sair hoje.'],
  ['SEMANA', '📅 Próximos 7 dias', 'Já tem data marcada.'],
  ['SEM_DATA', '💭 Quando der', 'Sem data. Puxe pro dia quando quiser.'],
]
const PRIORIDADES = [[1, '🔥 Urgente'], [2, '• Normal'], [3, '· Quando der']]
const CORES_PROJ = ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#f472b6', '#22d3ee', '#94a3b8']

const isoLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const hojeISO = () => isoLocal(new Date())
const somaDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoLocal(d) }
// próximo dia da semana (0=dom): "seg" a partir de hoje
const proxDiaSemana = (alvo) => {
  const d = new Date()
  let i = 1
  while (i <= 7 && new Date(d.getTime() + i * 864e5).getDay() !== alvo) i++
  d.setDate(d.getDate() + i)
  return isoLocal(d)
}

// ===== CAPTURA INTELIGENTE =====
// Ele escreve como pensa e o painel entende. É o que faz isso ser mais rápido que o WhatsApp:
//   "ligar pro contador amanhã !urgente #financeiro @site /semanal"
// Lista FECHADA de dias. Nunca usar prefixo solto (\w*): "terminar" começa com "ter"
// e "quadro" com "qua" — com prefixo, "terminar o painel" viraria terça-feira.
const RE_DIA = /\s(domingos?|dom|segundas?(?:-feira)?|seg|ter[çc]as?(?:-feira)?|ter|quartas?(?:-feira)?|qua|quintas?(?:-feira)?|qui|sextas?(?:-feira)?|sex|s[áa]bados?|s[áa]b)\s/i
const NUM_DIA = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 }
const diaDaPalavra = (p) =>
  NUM_DIA[String(p).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 3)]

export function interpretar(txt, projetos) {
  let t = ' ' + txt + ' '
  const achou = { data: null, prioridade: null, area: null, projeto: null, repete: null, repeteDias: null }
  const tira = (re) => { const m = t.match(re); if (m) { t = t.replace(m[0], ' '); return m } return null }

  // recorrência: /diaria /semanal /mensal, ou "toda segunda"
  let m = tira(/\s\/(diaria|diária|semanal|mensal)\s/i)
  if (m) achou.repete = m[1].toLowerCase().replace('diária', 'diaria')
  // "todo dia", "toda semana", "todo mês", "todas as segundas"
  m = tira(/\stod[ao]s?\s+(?:[oa]s?\s+)?(dias?|semanas?|m[êe]s|meses|segundas?|ter[çc]as?|quartas?|quintas?|sextas?|s[áa]bados?|domingos?)\s/i)
  if (m) {
    const p = m[1].toLowerCase()
    if (p.startsWith('dia')) achou.repete = 'diaria'
    else if (p.startsWith('semana')) achou.repete = 'semanal'
    else if (p.startsWith('m')) achou.repete = 'mensal'
    else {
      const n = diaDaPalavra(p)
      if (n != null) {
        achou.repete = 'dias_semana'
        achou.repeteDias = [n]
        achou.data = achou.data || proxDiaSemana(n)
      }
    }
  }
  // prioridade: !1 !2 !3 ou !urgente
  m = tira(/\s!(1|2|3|urgente|normal|baixa)\s/i)
  if (m) {
    const v = m[1].toLowerCase()
    achou.prioridade = v === '1' || v === 'urgente' ? 1 : v === '3' || v === 'baixa' ? 3 : 2
  }
  // área: #vendas
  m = tira(/\s#([a-zà-ú0-9_]+)\s/i)
  if (m) achou.area = m[1].toLowerCase()
  // projeto: @nome (casa por começo do nome, sem precisar escrever tudo)
  m = tira(/\s@([a-zà-ú0-9_-]+)\s/i)
  if (m) {
    const alvo = m[1].toLowerCase()
    const p = (projetos || []).find(x => (x.nome || '').toLowerCase().replace(/\s/g, '').startsWith(alvo))
    if (p) achou.projeto = p.id
  }
  // datas: hoje, amanhã, seg..dom, 15/09, dia 15
  if (tira(/\shoje\s/i)) achou.data = hojeISO()
  else if (tira(/\s(amanh[ãa])\s/i)) achou.data = somaDias(1)
  else {
    m = tira(/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s/)
    if (m) {
      const ano = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : new Date().getFullYear()
      const d = new Date(ano, +m[2] - 1, +m[1])
      // data já passada sem ano informado = ele quer o ano que vem
      if (!m[3] && d < new Date(hojeISO())) d.setFullYear(ano + 1)
      achou.data = isoLocal(d)
    } else {
      m = tira(RE_DIA)
      if (m) {
        const n = diaDaPalavra(m[1])
        if (n != null) achou.data = proxDiaSemana(n)
      }
    }
  }
  return { titulo: t.replace(/\s+/g, ' ').trim(), ...achou }
}

const CORES_PRIO = {
  1: { borderLeft: '3px solid #dc2626' },
  2: { borderLeft: '3px solid #60a5fa' },
  3: { borderLeft: '3px solid #cbd5e1' },
}

const s = {
  title: { fontSize: 20, fontWeight: 500, color: '#0f172a', marginBottom: 4 },
  sub: { fontSize: 13, color: '#5b6b84', marginBottom: 14 },
  abas: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, borderBottom: '0.5px solid rgba(15,23,42,0.10)', paddingBottom: 10 },
  aba: { padding: '8px 15px', fontSize: 13.5, fontWeight: 500, borderRadius: 9, border: 'none', background: 'transparent', color: '#5b6b84', cursor: 'pointer' },
  abaOn: { background: '#0f172a', color: '#ffffff', fontWeight: 600 },
  abaBadge: { marginLeft: 6, fontSize: 11, background: '#dc2626', color: '#fff', borderRadius: 99, padding: '1px 6px', fontWeight: 700 },

  capturaWrap: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 },
  capturaInput: { flex: '1 1 340px', minWidth: 200, padding: '13px 15px', fontSize: 15, borderRadius: 11, border: '1px solid rgba(15,23,42,0.18)', background: '#ffffff', color: '#0f172a', boxSizing: 'border-box' },
  chip: { padding: '7px 12px', fontSize: 12.5, fontWeight: 500, borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.12)', background: '#ffffff', color: '#5b6b84', cursor: 'pointer', whiteSpace: 'nowrap' },
  chipOn: { background: '#0f172a', color: '#ffffff', borderColor: '#0f172a' },
  btnAdd: { padding: '13px 24px', fontSize: 14, fontWeight: 600, borderRadius: 11, border: 'none', background: '#34d399', color: '#232a37', cursor: 'pointer' },
  // o que a captura entendeu, mostrado ANTES de salvar
  previa: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 11.5, color: '#5b6b84', background: 'rgba(52,211,153,.10)', border: '0.5px solid rgba(52,211,153,.4)', borderRadius: 8, padding: '7px 11px', marginBottom: 10 },
  previaTag: { background: '#ffffff', borderRadius: 6, padding: '2px 7px', fontWeight: 600, color: '#0f172a' },
  dica: { fontSize: 11, color: '#94a3b8', marginBottom: 16, lineHeight: 1.6 },
  code: { background: '#f1f5f9', borderRadius: 4, padding: '1px 5px', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 10.5, color: '#475569' },

  kpis: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
  kpi: { fontSize: 13, color: '#5b6b84', padding: '7px 13px', background: 'rgba(96,165,250,.10)', borderRadius: 8 },
  kpiAlerta: { fontSize: 13, color: '#dc2626', fontWeight: 700, padding: '7px 13px', background: 'rgba(248,113,113,.14)', borderRadius: 8 },
  kpiBom: { fontSize: 13, color: '#065f46', fontWeight: 700, padding: '7px 13px', background: 'rgba(52,211,153,.16)', borderRadius: 8 },

  quadro: { display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 14, alignItems: 'flex-start' },
  col: { minWidth: 272, maxWidth: 272, background: '#f1f5f9', borderRadius: 12, padding: 10, flexShrink: 0, display: 'flex', flexDirection: 'column', maxHeight: '62vh' },
  colTit: { fontSize: 12.5, fontWeight: 700, color: '#0f172a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  colSub: { fontSize: 10.5, color: '#94a3b8', marginBottom: 9, lineHeight: 1.35 },
  // CARDS ROLÁVEIS (pedido do Bruno): a coluna cresce até um teto e daí rola por dentro,
  // em vez de esticar a página. scrollbar fina pra não roubar espaço do card.
  colScroll: { overflowY: 'auto', overflowX: 'hidden', flex: 1, minHeight: 0, paddingRight: 4, scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent', overscrollBehavior: 'contain' },
  vazio: { fontSize: 12, color: '#94a3b8', padding: '14px 6px', textAlign: 'center' },

  card: { background: '#ffffff', borderRadius: 9, padding: '9px 11px', marginBottom: 7, border: '0.5px solid rgba(15,23,42,0.08)' },
  cardTopo: { display: 'flex', gap: 8, alignItems: 'flex-start' },
  check: { width: 19, height: 19, borderRadius: 5, border: '1.5px solid #94a3b8', background: '#ffffff', cursor: 'pointer', flexShrink: 0, marginTop: 1, padding: 0, fontSize: 12, lineHeight: '16px' },
  checkOn: { background: '#34d399', borderColor: '#34d399', color: '#ffffff' },
  cardTit: { fontSize: 13.5, color: '#0f172a', lineHeight: 1.35, flex: 1, wordBreak: 'break-word' },
  cardTitFeito: { textDecoration: 'line-through', color: '#94a3b8' },
  cardPe: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 6, marginLeft: 27 },
  tag: { fontSize: 10, color: '#5b6b84', background: '#f1f5f9', borderRadius: 5, padding: '2px 6px' },
  tagAtraso: { fontSize: 10, fontWeight: 700, color: '#dc2626', background: 'rgba(248,113,113,.14)', borderRadius: 5, padding: '2px 6px' },
  tagProj: (cor) => ({ fontSize: 10, fontWeight: 600, color: '#ffffff', background: cor || '#60a5fa', borderRadius: 5, padding: '2px 6px' }),
  tagRep: { fontSize: 10, color: '#7c3aed', background: 'rgba(167,139,250,.16)', borderRadius: 5, padding: '2px 6px', fontWeight: 600 },
  acao: { fontSize: 10.5, color: '#5b6b84', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', textDecoration: 'underline' },
  acaoRuim: { color: '#dc2626' },

  secao: { fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 10 },
  gridProj: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 13, alignItems: 'start' },
  projCard: (cor) => ({ background: '#ffffff', borderRadius: 12, border: '0.5px solid rgba(15,23,42,0.10)', borderTop: '4px solid ' + (cor || '#60a5fa'), padding: 14, display: 'flex', flexDirection: 'column' }),
  projTopo: { display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', marginBottom: 6 },
  projNome: { fontSize: 15, fontWeight: 600, color: '#0f172a', lineHeight: 1.3 },
  projTarefas: { maxHeight: 210, overflowY: 'auto', marginTop: 10, paddingRight: 4, scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent', overscrollBehavior: 'contain' },
  barra: { height: 8, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden', marginTop: 8, marginBottom: 6 },
  barraIn: (pct, cor) => ({ height: '100%', width: Math.max(pct, 2) + '%', background: cor || '#60a5fa', borderRadius: 99, transition: 'width .35s' }),

  metaCard: { background: '#ffffff', borderRadius: 12, padding: 14, marginBottom: 10, border: '0.5px solid rgba(15,23,42,0.10)' },
  metaTopo: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', marginBottom: 9 },
  metaNum: { fontSize: 14, color: '#5b6b84', whiteSpace: 'nowrap' },
  inputMini: { width: 76, padding: '5px 8px', fontSize: 12.5, borderRadius: 7, border: '0.5px solid rgba(15,23,42,0.18)', boxSizing: 'border-box' },
  notaCard: { background: 'rgba(251,191,36,.10)', border: '0.5px solid rgba(251,191,36,.5)', borderRadius: 10, padding: '11px 13px', marginBottom: 8 },
  gridNotas: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10, alignItems: 'start' },

  modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 60, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '8vh 14px', overflowY: 'auto' },
  modalBox: { background: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 470 },
  label: { fontSize: 12, color: '#5b6b84', marginBottom: 5, display: 'block', fontWeight: 500 },
  input: { width: '100%', padding: '10px 12px', fontSize: 14, borderRadius: 9, border: '0.5px solid rgba(15,23,42,0.18)', boxSizing: 'border-box', marginBottom: 12 },
  semanaGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 },
  bloco: { background: '#ffffff', borderRadius: 12, border: '0.5px solid rgba(15,23,42,0.10)', padding: 15 },
  blocoNum: { fontSize: 27, fontWeight: 700, color: '#0f172a', lineHeight: 1.1 },
  blocoLab: { fontSize: 12, color: '#5b6b84', marginTop: 3 },
}

export default function MeuPlanejamento() {
  const { profile } = useAuth()
  const [aba, setAba] = useState('dia')
  const [itens, setItens] = useState([])
  const [projetos, setProjetos] = useState([])
  const [resumo, setResumo] = useState(null)
  const [carregando, setCarregando] = useState(true)

  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState('tarefa')
  const [quando, setQuando] = useState('hoje')
  const [prio, setPrio] = useState(2)
  const [metaAlvo, setMetaAlvo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [projAberto, setProjAberto] = useState({})
  const [modalProj, setModalProj] = useState(null)
  const campoRef = useRef(null)

  const carregar = useCallback(async () => {
    const [li, pr, re] = await Promise.all([
      supabase.rpc('plan_listar', { p_dias_futuro: 7 }),
      supabase.rpc('plan_projetos'),
      supabase.rpc('plan_resumo'),
    ])
    setItens(li.data || [])
    setProjetos(pr.data || [])
    setResumo((re.data && re.data[0]) || null)
    setCarregando(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // "/" foca a captura de qualquer lugar da tela — sem tirar a mão do teclado
  useEffect(() => {
    const atalho = (e) => {
      const emCampo = /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '')
      if (e.key === '/' && !emCampo && campoRef.current) { e.preventDefault(); campoRef.current.focus() }
      if (e.key === 'Escape' && campoRef.current === document.activeElement) campoRef.current.blur()
    }
    window.addEventListener('keydown', atalho)
    return () => window.removeEventListener('keydown', atalho)
  }, [])

  const lido = useMemo(() => texto.trim() ? interpretar(texto, projetos) : null, [texto, projetos])

  async function adicionar() {
    const t = (texto || '').trim()
    if (!t || salvando) return
    const p = interpretar(t, projetos)
    if (!p.titulo) { alert('Escreve o que é, além dos marcadores.'); return }
    setSalvando(true)
    const dataAlvo = tipo === 'nota' ? null
      : p.data ? p.data
      : quando === 'hoje' ? hojeISO()
      : quando === 'amanha' ? somaDias(1)
      : quando === 'semana' ? somaDias(7) : null
    const { error } = await supabase.rpc('plan_criar', {
      p_tipo: tipo, p_titulo: p.titulo, p_data_alvo: dataAlvo,
      p_prioridade: p.prioridade || prio, p_area: p.area || null, p_detalhe: null,
      p_meta_alvo: tipo === 'meta' && metaAlvo ? Number(metaAlvo) : null,
      p_projeto_id: p.projeto || null,
      p_repete: tipo === 'tarefa' ? (p.repete || null) : null,
      p_repete_dias: p.repeteDias || null,
    })
    setSalvando(false)
    if (error) { alert('Não salvou: ' + error.message); return }
    setTexto(''); setMetaAlvo('')
    if (campoRef.current && campoRef.current.focus) campoRef.current.focus()
    carregar()
  }

  async function marcar(it) {
    const { data, error } = await supabase.rpc('plan_marcar', { p_id: it.id, p_feito: !it.feito })
    if (error) { alert('Erro: ' + error.message); return }
    if (data && data.gerou_proxima) {
      // avisa que a série continua — senão ele acha que sumiu
      const d = String(data.proxima_data || '').split('-')
      if (d.length === 3) alert('✅ Feito! Já criei a próxima pra ' + d[2] + '/' + d[1] + '.')
    }
    carregar()
  }
  async function adiar(it, dias) {
    const { error } = await supabase.rpc('plan_adiar', { p_id: it.id, p_dias: dias })
    if (error) { alert('Erro: ' + error.message); return } ; carregar()
  }
  async function paraHoje(it) {
    const { error } = await supabase.rpc('plan_editar', { p_id: it.id, p_data_alvo: hojeISO() })
    if (error) { alert('Erro: ' + error.message); return } ; carregar()
  }
  async function excluir(it) {
    if (!window.confirm('Excluir "' + it.titulo + '"?')) return
    const { error } = await supabase.rpc('plan_excluir', { p_id: it.id })
    if (error) { alert('Erro: ' + error.message); return } ; carregar()
  }
  async function salvarProgresso(it, v) {
    const n = Number(v); if (Number.isNaN(n)) return
    const { error } = await supabase.rpc('plan_editar', { p_id: it.id, p_meta_feito: n })
    if (error) { alert('Erro: ' + error.message); return } ; carregar()
  }
  async function salvarProjeto(form) {
    const fn = form.id ? 'proj_editar' : 'proj_criar'
    const args = form.id
      ? { p_id: form.id, p_nome: form.nome, p_prazo: form.prazo || null, p_cor: form.cor, p_limpar_prazo: !form.prazo }
      : { p_nome: form.nome, p_prazo: form.prazo || null, p_cor: form.cor }
    const { error } = await supabase.rpc(fn, args)
    if (error) { alert('Erro: ' + error.message); return }
    setModalProj(null); carregar()
  }
  async function statusProjeto(p, status) {
    const { error } = await supabase.rpc('proj_editar', { p_id: p.id, p_status: status })
    if (error) { alert('Erro: ' + error.message); return } ; carregar()
  }
  async function excluirProjeto(p) {
    if (!window.confirm('Excluir o projeto "' + p.nome + '"? As tarefas dele continuam, só ficam sem projeto.')) return
    const { error } = await supabase.rpc('proj_excluir', { p_id: p.id })
    if (error) { alert('Erro: ' + error.message); return } ; carregar()
  }

  if (profile && profile.id !== ID_DONO) {
    return <div style={{ padding: '3rem', textAlign: 'center', color: '#5b6b84' }}>Esta página é pessoal.</div>
  }

  const doGrupo = (g) => itens.filter(i => i.grupo === g)
  const metas = itens.filter(i => i.tipo === 'meta' && !i.feito)
  const notas = itens.filter(i => i.tipo === 'nota' && !i.feito)
  const atrasadas = doGrupo('ATRASADO')
  const tarefasDoProjeto = (pid) => itens.filter(i => i.projeto_id === pid && i.tipo === 'tarefa')

  const Cartao = (it, semProjeto) => (
    <div key={it.id} style={{ ...s.card, ...(CORES_PRIO[it.prioridade] || CORES_PRIO[2]) }}>
      <div style={s.cardTopo}>
        <button style={{ ...s.check, ...(it.feito ? s.checkOn : {}) }} onClick={() => marcar(it)}
          title={it.feito ? 'Desmarcar' : 'Marcar como feito'}>{it.feito ? '✓' : ''}</button>
        <div style={{ ...s.cardTit, ...(it.feito ? s.cardTitFeito : {}) }}>{it.titulo}</div>
      </div>
      <div style={s.cardPe}>
        {it.dias_atraso > 0 && <span style={s.tagAtraso}>{it.dias_atraso}d atrasada</span>}
        {it.dia_br && !it.dias_atraso && <span style={s.tag}>{it.dia_br}</span>}
        {it.repete && <span style={s.tagRep}>🔁 {it.repete === 'dias_semana' ? 'dias fixos' : it.repete}</span>}
        {!semProjeto && it.projeto_nome && <span style={s.tagProj(it.projeto_cor)}>{it.projeto_nome}</span>}
        {it.area && <span style={s.tag}>{it.area}</span>}
        {!it.feito && it.grupo !== 'HOJE' && <button style={s.acao} onClick={() => paraHoje(it)}>→ hoje</button>}
        {!it.feito && <button style={s.acao} onClick={() => adiar(it, 1)}>+1 dia</button>}
        {!it.feito && <button style={s.acao} onClick={() => adiar(it, 7)}>+1 sem</button>}
        <button style={{ ...s.acao, ...s.acaoRuim }} onClick={() => excluir(it)}>excluir</button>
      </div>
    </div>
  )

  return (
    <div>
      <div style={s.title}>🎯 Meu planejamento</div>
      <div style={s.sub}>Escreve do jeito que pensa e aperta Enter. Nada aqui se perde no meio de conversa.</div>

      {/* CAPTURA — sempre visível, em qualquer aba */}
      <div style={s.capturaWrap}>
        <input ref={campoRef} style={s.capturaInput} value={texto}
          placeholder={tipo === 'meta' ? 'Qual a meta? ex: fechar 40 vendas'
            : tipo === 'nota' ? 'Anota antes de esquecer...'
            : 'ex: reunião com Haru amanhã !urgente #sistema'}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') adicionar() }} />
        <button style={s.btnAdd} onClick={adicionar} disabled={salvando || !texto.trim()}>
          {salvando ? 'Salvando...' : '+ Adicionar'}
        </button>
      </div>

      {/* o que foi entendido, ANTES de salvar — sem surpresa depois */}
      {lido && (lido.data || lido.prioridade || lido.area || lido.projeto || lido.repete) && (
        <div style={s.previa}>
          <span>entendi:</span>
          <span style={s.previaTag}>{lido.titulo || '(sem título!)'}</span>
          {lido.data && <span style={s.previaTag}>📅 {lido.data.split('-').reverse().slice(0, 2).join('/')}</span>}
          {lido.prioridade === 1 && <span style={s.previaTag}>🔥 urgente</span>}
          {lido.prioridade === 3 && <span style={s.previaTag}>· quando der</span>}
          {lido.area && <span style={s.previaTag}>#{lido.area}</span>}
          {lido.projeto && <span style={s.previaTag}>🚀 {(projetos.find(p => p.id === lido.projeto) || {}).nome}</span>}
          {lido.repete && <span style={s.previaTag}>🔁 {lido.repete === 'dias_semana' ? 'toda semana' : lido.repete}</span>}
        </div>
      )}

      <div style={s.capturaWrap}>
        {[['tarefa', '✓ Tarefa'], ['meta', '🎯 Meta'], ['nota', '📌 Anotação']].map(([v, l]) => (
          <button key={v} style={{ ...s.chip, ...(tipo === v ? s.chipOn : {}) }} onClick={() => setTipo(v)}>{l}</button>
        ))}
        {tipo === 'tarefa' && <span style={{ color: '#cbd5e1' }}>|</span>}
        {tipo === 'tarefa' && [['hoje', 'Hoje'], ['amanha', 'Amanhã'], ['semana', 'Esta semana'], ['sem', 'Sem data']].map(([v, l]) => (
          <button key={v} style={{ ...s.chip, ...(quando === v ? s.chipOn : {}) }} onClick={() => setQuando(v)}>{l}</button>
        ))}
        {tipo === 'meta' && <input style={{ ...s.inputMini, width: 110 }} value={metaAlvo}
          placeholder="alvo (nº)" onChange={e => setMetaAlvo(e.target.value)} />}
        {tipo !== 'nota' && <span style={{ color: '#cbd5e1' }}>|</span>}
        {tipo !== 'nota' && PRIORIDADES.map(([v, l]) => (
          <button key={v} style={{ ...s.chip, ...(prio === v ? s.chipOn : {}) }} onClick={() => setPrio(v)}>{l}</button>
        ))}
      </div>
      <div style={s.dica}>
        Atalhos no texto: <span style={s.code}>amanhã</span> <span style={s.code}>seg</span> <span style={s.code}>15/09</span> ·
        <span style={s.code}>!urgente</span> · <span style={s.code}>#vendas</span> · <span style={s.code}>@projeto</span> ·
        <span style={s.code}>/semanal</span> ou <span style={s.code}>toda segunda</span>.
        Aperte <span style={s.code}>/</span> pra voltar pro campo de qualquer lugar.
      </div>

      <div style={s.abas}>
        {ABAS.map(([v, l]) => (
          <button key={v} style={{ ...s.aba, ...(aba === v ? s.abaOn : {}) }} onClick={() => setAba(v)}>
            {l}{v === 'dia' && atrasadas.length > 0 && <span style={s.abaBadge}>{atrasadas.length}</span>}
          </button>
        ))}
      </div>

      {carregando ? <div style={s.vazio}>Carregando...</div> : (<>

        {aba === 'dia' && (<>
          <div style={s.kpis}>
            {atrasadas.length > 0 && <span style={s.kpiAlerta}>🔴 Atrasado: <b>{atrasadas.length}</b></span>}
            <span style={s.kpi}>⭐ Hoje: <b>{doGrupo('HOJE').length}</b></span>
            <span style={resumo && resumo.feitas_hoje > 0 ? s.kpiBom : s.kpi}>✅ Concluído hoje: <b>{resumo ? resumo.feitas_hoje : 0}</b></span>
            {resumo && resumo.sequencia_dias > 1 && <span style={s.kpiBom}>🔥 {resumo.sequencia_dias} dias seguidos</span>}
          </div>
          <div style={s.quadro}>
            {COLUNAS.map(([chave, titulo, ajuda]) => {
              const lista = doGrupo(chave)
              return (
                <div key={chave} style={s.col}>
                  <div style={s.colTit}><span>{titulo}</span><span style={{ color: '#94a3b8' }}>{lista.length}</span></div>
                  <div style={s.colSub}>{ajuda}</div>
                  <div style={s.colScroll}>
                    {lista.length === 0 ? <div style={s.vazio}>—</div> : lista.map(i => Cartao(i))}
                  </div>
                </div>
              )
            })}
          </div>
        </>)}

        {aba === 'projetos' && (<>
          <div style={{ ...s.capturaWrap, marginBottom: 14 }}>
            <button style={s.btnAdd} onClick={() => setModalProj({ nome: '', prazo: '', cor: CORES_PROJ[0] })}>
              + Novo projeto
            </button>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              Pra jogar tarefa num projeto, escreva <span style={s.code}>@nome</span> na captura lá em cima.
            </span>
          </div>
          {projetos.length === 0 && <div style={s.vazio}>Nenhum projeto ainda. Comece pelo que está te tirando o sono.</div>}
          <div style={s.gridProj}>
            {projetos.map(p => {
              const tarefas = tarefasDoProjeto(p.id)
              const abertas = tarefas.filter(t => !t.feito)
              const aberto = projAberto[p.id]
              return (
                <div key={p.id} style={s.projCard(p.cor)}>
                  <div style={s.projTopo}>
                    <div>
                      <div style={s.projNome}>{p.nome}</div>
                      <div style={{ fontSize: 11.5, color: '#5b6b84', marginTop: 3 }}>
                        {p.feitas}/{p.total} tarefas
                        {p.status !== 'ativo' && ' · ' + p.status}
                      </div>
                    </div>
                    <div style={{ fontSize: 19, fontWeight: 700, color: p.pct >= 100 ? '#059669' : '#0f172a' }}>{p.pct}%</div>
                  </div>
                  <div style={s.barra}><div style={s.barraIn(p.pct, p.cor)} /></div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {p.dia_br && (
                      <span style={p.dias_pro_prazo < 0 ? s.tagAtraso : s.tag}>
                        {p.dias_pro_prazo < 0 ? 'venceu há ' + Math.abs(p.dias_pro_prazo) + 'd'
                          : p.dias_pro_prazo === 0 ? 'vence hoje' : 'faltam ' + p.dias_pro_prazo + 'd'}
                      </span>
                    )}
                    {abertas.length > 0 && <span style={s.tag}>{abertas.length} em aberto</span>}
                  </div>
                  {tarefas.length > 0 && (
                    <button style={{ ...s.acao, textAlign: 'left', marginTop: 9 }}
                      onClick={() => setProjAberto(v => ({ ...v, [p.id]: !aberto }))}>
                      {aberto ? '▾ esconder tarefas' : '▸ ver as ' + tarefas.length + ' tarefas'}
                    </button>
                  )}
                  {aberto && <div style={s.projTarefas}>{tarefas.map(t => Cartao(t, true))}</div>}
                  <div style={{ ...s.cardPe, marginLeft: 0, marginTop: 10 }}>
                    <button style={s.acao} onClick={() => setModalProj({ id: p.id, nome: p.nome, prazo: p.prazo || '', cor: p.cor })}>editar</button>
                    {p.status === 'ativo'
                      ? <button style={s.acao} onClick={() => statusProjeto(p, 'concluido')}>concluir</button>
                      : <button style={s.acao} onClick={() => statusProjeto(p, 'ativo')}>reabrir</button>}
                    <button style={{ ...s.acao, ...s.acaoRuim }} onClick={() => excluirProjeto(p)}>excluir</button>
                  </div>
                </div>
              )
            })}
          </div>
        </>)}

        {aba === 'metas' && (<>
          <div style={s.secao}>🎯 Metas</div>
          {metas.length === 0 && <div style={s.vazio}>Nenhuma meta aberta. Use o botão 🎯 Meta lá em cima.</div>}
          <div style={{ maxWidth: 620 }}>
            {metas.map(m => {
              const pct = m.meta_pct != null ? m.meta_pct : 0
              return (
                <div key={m.id} style={s.metaCard}>
                  <div style={s.metaTopo}>
                    <div style={s.projNome}>{m.titulo}</div>
                    <div style={s.metaNum}>
                      {m.meta_alvo ? <b>{Number(m.meta_feito || 0)}</b> : null}
                      {m.meta_alvo ? ' / ' + Number(m.meta_alvo) : 'sem alvo'}
                    </div>
                  </div>
                  {m.meta_alvo > 0 && (<>
                    <div style={s.barra}><div style={s.barraIn(pct, pct >= 100 ? '#34d399' : '#60a5fa')} /></div>
                    <div style={{ fontSize: 11.5, color: pct >= 100 ? '#059669' : '#5b6b84', marginBottom: 8, fontWeight: pct >= 100 ? 700 : 400 }}>
                      {pct}%{pct >= 100 ? ' — bateu 🎉' : ''}
                    </div>
                  </>)}
                  <div style={{ ...s.cardPe, marginLeft: 0 }}>
                    {m.meta_alvo > 0 && (
                      <input style={s.inputMini} type="number" defaultValue={Number(m.meta_feito || 0)}
                        title="Quanto já foi feito" onBlur={e => salvarProgresso(m, e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }} />
                    )}
                    {m.dia_br && <span style={m.dias_atraso > 0 ? s.tagAtraso : s.tag}>
                      {m.dias_atraso > 0 ? 'venceu há ' + m.dias_atraso + 'd' : 'até ' + m.dia_br}</span>}
                    {m.area && <span style={s.tag}>{m.area}</span>}
                    <button style={s.acao} onClick={() => marcar(m)}>concluir</button>
                    <button style={{ ...s.acao, ...s.acaoRuim }} onClick={() => excluir(m)}>excluir</button>
                  </div>
                </div>
              )
            })}
          </div>
        </>)}

        {aba === 'notas' && (<>
          <div style={s.secao}>📌 Anotações</div>
          {notas.length === 0 && <div style={s.vazio}>Nada anotado. Use o botão 📌 Anotação lá em cima.</div>}
          <div style={s.gridNotas}>
            {notas.map(n => (
              <div key={n.id} style={s.notaCard}>
                <div style={{ fontSize: 13.5, color: '#0f172a', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{n.titulo}</div>
                <div style={{ ...s.cardPe, marginLeft: 0 }}>
                  {n.area && <span style={s.tag}>{n.area}</span>}
                  <button style={s.acao} onClick={() => marcar(n)}>arquivar</button>
                  <button style={{ ...s.acao, ...s.acaoRuim }} onClick={() => excluir(n)}>excluir</button>
                </div>
              </div>
            ))}
          </div>
        </>)}

        {aba === 'semana' && resumo && (<>
          <div style={s.secao}>📊 Como foi a semana</div>
          <div style={s.semanaGrid}>
            <div style={s.bloco}><div style={s.blocoNum}>{resumo.feitas_semana}</div><div style={s.blocoLab}>concluídas em 7 dias</div></div>
            <div style={s.bloco}>
              <div style={{ ...s.blocoNum, color: resumo.taxa_semana != null && resumo.taxa_semana < 50 ? '#dc2626' : '#0f172a' }}>
                {resumo.taxa_semana != null ? resumo.taxa_semana + '%' : '—'}
              </div>
              <div style={s.blocoLab}>do que planejou pra semana</div>
            </div>
            <div style={s.bloco}>
              <div style={{ ...s.blocoNum, color: resumo.atrasadas > 0 ? '#dc2626' : '#059669' }}>{resumo.atrasadas}</div>
              <div style={s.blocoLab}>atrasadas agora</div>
            </div>
            <div style={s.bloco}><div style={s.blocoNum}>{resumo.abertas_total}</div><div style={s.blocoLab}>abertas no total</div></div>
            <div style={s.bloco}>
              <div style={{ ...s.blocoNum, color: resumo.sequencia_dias > 1 ? '#059669' : '#0f172a' }}>{resumo.sequencia_dias}</div>
              <div style={s.blocoLab}>dias seguidos fechando algo</div>
            </div>
          </div>
          <div style={{ ...s.bloco, marginBottom: 18 }}>
            <div style={{ fontSize: 13.5, color: '#0f172a', lineHeight: 1.6 }}>
              {resumo.atrasadas > 5
                ? <>Você tem <b style={{ color: '#dc2626' }}>{resumo.atrasadas} tarefas atrasadas</b>. Quando a lista de atrasado passa de 5, ela vira ruído e você para de olhar. Vale abrir a coluna 🔴 e fazer uma limpeza: o que não vai acontecer mesmo, exclua sem culpa.</>
                : resumo.taxa_semana != null && resumo.taxa_semana < 50
                ? <>Você concluiu <b>{resumo.taxa_semana}%</b> do que planejou pra semana. Menos da metade normalmente não é falta de esforço — é excesso de tarefa no dia. Tente marcar menos coisa por dia e usar <b>Quando der</b> pro resto.</>
                : resumo.feitas_semana === 0
                ? <>Nenhuma tarefa concluída nos últimos 7 dias. Se você está trabalhando e não está marcando, o painel não vai te ajudar em nada — o valor dele vem de marcar o que fechou.</>
                : <>Ritmo saudável: <b>{resumo.feitas_semana} concluídas</b> nos últimos 7 dias{resumo.taxa_semana != null ? <> e <b>{resumo.taxa_semana}%</b> do planejado</> : null}. Continua assim.</>}
            </div>
          </div>
          <div style={s.secao}>✅ Concluído nos últimos 7 dias</div>
          <div style={{ maxWidth: 620, maxHeight: '45vh', overflowY: 'auto', paddingRight: 6, scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}>
            {itens.filter(i => i.feito).length === 0
              ? <div style={s.vazio}>Nada concluído ainda.</div>
              : itens.filter(i => i.feito).map(i => Cartao(i))}
          </div>
        </>)}
      </>)}

      {modalProj && (
        <div style={s.modal} onClick={() => setModalProj(null)}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
              {modalProj.id ? 'Editar projeto' : 'Novo projeto'}
            </div>
            <label style={s.label}>Nome</label>
            <input style={s.input} value={modalProj.nome} autoFocus
              placeholder="ex: Refazer o funil do Bolsa Família"
              onChange={e => setModalProj(v => ({ ...v, nome: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter' && modalProj.nome.trim()) salvarProjeto(modalProj) }} />
            <label style={s.label}>Prazo (opcional)</label>
            <input style={s.input} type="date" value={modalProj.prazo}
              onChange={e => setModalProj(v => ({ ...v, prazo: e.target.value }))} />
            <label style={s.label}>Cor</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
              {CORES_PROJ.map(c => (
                <button key={c} onClick={() => setModalProj(v => ({ ...v, cor: c }))}
                  style={{ width: 30, height: 30, borderRadius: 8, background: c, cursor: 'pointer',
                    border: modalProj.cor === c ? '3px solid #0f172a' : '1px solid rgba(0,0,0,.1)' }} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ ...s.btnAdd, flex: 1 }} disabled={!modalProj.nome.trim()}
                onClick={() => salvarProjeto(modalProj)}>Salvar</button>
              <button style={s.chip} onClick={() => setModalProj(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
