import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// 30/08 (Bruno): painel de planejamento pessoal. Ele anotava tudo no WhatsApp e se perdia.
// SÓ ELE VÊ — trancado por ID, não por role. Os dados são dele (RLS por dono_id).
const ID_DONO = '906f9a57-bd4a-4b0e-9973-0968ef4f1e15' // Bruno Souza

// Colunas do quadro. A ordem é a ordem de urgência: o que está atrasado vem primeiro.
const COLUNAS = [
  ['ATRASADO', '🔴 Atrasado',   'Não fez no dia. Não some — vira dívida.'],
  ['HOJE',     '⭐ Hoje',        'O que tem que sair hoje.'],
  ['SEMANA',   '📅 Esta semana', 'Próximos 7 dias.'],
  ['SEM_DATA', '💭 Quando der',  'Sem data marcada.'],
]
const PRIORIDADES = [[1, '🔥 Urgente'], [2, '• Normal'], [3, '· Quando der']]
const AREAS = ['vendas', 'financeiro', 'sistema', 'equipe', 'jurídico', 'pessoal']

const hojeISO = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}
const somaDias = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

const CORES_PRIO = {
  1: { borderLeft: '3px solid #dc2626' },
  2: { borderLeft: '3px solid #60a5fa' },
  3: { borderLeft: '3px solid #cbd5e1' },
}

const s = {
  title: { fontSize: 20, fontWeight: 500, color: '#0f172a', marginBottom: 4 },
  sub: { fontSize: 13, color: '#5b6b84', marginBottom: 16 },
  // captura rápida: o campo tem que ser a primeira coisa da tela, senão ele volta pro WhatsApp
  capturaWrap: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 },
  capturaInput: { flex: '1 1 320px', minWidth: 200, padding: '12px 14px', fontSize: 15, borderRadius: 10, border: '0.5px solid rgba(15,23,42,0.20)', background: '#ffffff', color: '#0f172a', boxSizing: 'border-box' },
  chip: { padding: '7px 12px', fontSize: 12.5, fontWeight: 500, borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.12)', background: '#ffffff', color: '#5b6b84', cursor: 'pointer', whiteSpace: 'nowrap' },
  chipOn: { background: '#0f172a', color: '#ffffff', borderColor: '#0f172a' },
  btnAdd: { padding: '12px 22px', fontSize: 14, fontWeight: 600, borderRadius: 10, border: 'none', background: '#34d399', color: '#232a37', cursor: 'pointer' },
  dica: { fontSize: 11, color: '#94a3b8', marginBottom: 18 },
  kpis: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
  kpi: { fontSize: 13, color: '#5b6b84', padding: '7px 13px', background: 'rgba(96,165,250,.10)', borderRadius: 8 },
  kpiAlerta: { fontSize: 13, color: '#dc2626', fontWeight: 700, padding: '7px 13px', background: 'rgba(248,113,113,.14)', borderRadius: 8 },
  quadro: { display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 14, alignItems: 'flex-start', marginBottom: 22 },
  col: { minWidth: 268, maxWidth: 268, background: '#f1f5f9', borderRadius: 12, padding: 10, flexShrink: 0 },
  colTit: { fontSize: 12.5, fontWeight: 700, color: '#0f172a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  colSub: { fontSize: 10.5, color: '#94a3b8', marginBottom: 9, lineHeight: 1.35 },
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
  acao: { fontSize: 10.5, color: '#5b6b84', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', textDecoration: 'underline' },
  acaoRuim: { color: '#dc2626' },
  secao: { fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 10, marginTop: 6 },
  metaCard: { background: '#ffffff', borderRadius: 11, padding: 13, marginBottom: 9, border: '0.5px solid rgba(15,23,42,0.10)' },
  metaTopo: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', marginBottom: 9 },
  metaTit: { fontSize: 14, fontWeight: 600, color: '#0f172a' },
  metaNum: { fontSize: 13, color: '#5b6b84', whiteSpace: 'nowrap' },
  barra: { height: 9, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden', marginBottom: 7 },
  barraIn: (pct, ok) => ({ height: '100%', width: pct + '%', background: ok ? '#34d399' : '#60a5fa', borderRadius: 99, transition: 'width .3s' }),
  metaPe: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  inputMini: { width: 74, padding: '5px 8px', fontSize: 12.5, borderRadius: 7, border: '0.5px solid rgba(15,23,42,0.18)', boxSizing: 'border-box' },
  notaCard: { background: 'rgba(251,191,36,.10)', border: '0.5px solid rgba(251,191,36,.5)', borderRadius: 9, padding: '9px 11px', marginBottom: 7 },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 18, alignItems: 'start' },
  feitoWrap: { marginTop: 20, paddingTop: 14, borderTop: '0.5px solid rgba(15,23,42,0.10)' },
}

export default function MeuPlanejamento() {
  const { profile } = useAuth()
  const [itens, setItens] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  // captura rápida
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState('tarefa')
  const [quando, setQuando] = useState('hoje')     // hoje | amanha | semana | sem
  const [prio, setPrio] = useState(2)
  const [area, setArea] = useState('')
  const [metaAlvo, setMetaAlvo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [mostrarFeitos, setMostrarFeitos] = useState(false)
  const campoRef = useRef(null)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('plan_listar', { p_dias_futuro: 7 })
    if (error) { setErro(error.message); setItens([]) }
    else { setErro(''); setItens(data || []) }
    setCarregando(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function adicionar() {
    const t = (texto || '').trim()
    if (!t || salvando) return
    setSalvando(true)
    const dataAlvo = tipo === 'nota' ? null
      : quando === 'hoje' ? hojeISO()
      : quando === 'amanha' ? somaDias(1)
      : quando === 'semana' ? somaDias(7)
      : null
    const { error } = await supabase.rpc('plan_criar', {
      p_tipo: tipo,
      p_titulo: t,
      p_data_alvo: dataAlvo,
      p_prioridade: prio,
      p_area: area || null,
      p_detalhe: null,
      p_meta_alvo: tipo === 'meta' && metaAlvo ? Number(metaAlvo) : null,
    })
    setSalvando(false)
    if (error) { alert('Não salvou: ' + error.message); return }
    setTexto(''); setMetaAlvo('')
    // devolve o foco pro campo: a ideia é despejar várias coisas seguidas
    if (campoRef.current && campoRef.current.focus) campoRef.current.focus()
    carregar()
  }

  async function marcar(it) {
    const { error } = await supabase.rpc('plan_marcar', { p_id: it.id, p_feito: !it.feito })
    if (error) { alert('Erro: ' + error.message); return }
    carregar()
  }
  async function adiar(it, dias) {
    const { error } = await supabase.rpc('plan_adiar', { p_id: it.id, p_dias: dias })
    if (error) { alert('Erro: ' + error.message); return }
    carregar()
  }
  async function excluir(it) {
    if (!window.confirm('Excluir "' + it.titulo + '"?')) return
    const { error } = await supabase.rpc('plan_excluir', { p_id: it.id })
    if (error) { alert('Erro: ' + error.message); return }
    carregar()
  }
  async function salvarProgresso(it, valor) {
    const n = Number(valor)
    if (Number.isNaN(n)) return
    const { error } = await supabase.rpc('plan_editar', { p_id: it.id, p_meta_feito: n })
    if (error) { alert('Erro: ' + error.message); return }
    carregar()
  }

  if (profile && profile.id !== ID_DONO) {
    return <div style={{ padding: '3rem', textAlign: 'center', color: '#5b6b84' }}>Esta página é pessoal.</div>
  }

  const doGrupo = (g) => itens.filter(i => i.grupo === g)
  const metas = itens.filter(i => i.tipo === 'meta' && !i.feito)
  const notas = itens.filter(i => i.tipo === 'nota' && !i.feito)
  const feitos = itens.filter(i => i.feito)
  const atrasados = doGrupo('ATRASADO')
  const hoje = doGrupo('HOJE')
  const feitosHoje = feitos.filter(i => (i.feito_em || '').slice(0, 10) === hojeISO()).length

  const Cartao = (it) => (
    <div key={it.id} style={{ ...s.card, ...(CORES_PRIO[it.prioridade] || CORES_PRIO[2]) }}>
      <div style={s.cardTopo}>
        <button style={{ ...s.check, ...(it.feito ? s.checkOn : {}) }} onClick={() => marcar(it)}
          title={it.feito ? 'Desmarcar' : 'Marcar como feito'}>{it.feito ? '✓' : ''}</button>
        <div style={{ ...s.cardTit, ...(it.feito ? s.cardTitFeito : {}) }}>{it.titulo}</div>
      </div>
      <div style={s.cardPe}>
        {it.dias_atraso > 0 && <span style={s.tagAtraso}>{it.dias_atraso}d atrasada</span>}
        {it.dia_br && !it.dias_atraso && <span style={s.tag}>{it.dia_br}</span>}
        {it.area && <span style={s.tag}>{it.area}</span>}
        {!it.feito && <button style={s.acao} onClick={() => adiar(it, 1)} title="Joga pro dia seguinte">+1 dia</button>}
        {!it.feito && <button style={s.acao} onClick={() => adiar(it, 7)}>+1 sem</button>}
        <button style={{ ...s.acao, ...s.acaoRuim }} onClick={() => excluir(it)}>excluir</button>
      </div>
    </div>
  )

  return (
    <div>
      <div style={s.title}>🎯 Meu planejamento</div>
      <div style={s.sub}>Tarefa, meta ou anotação — escreve e aperta Enter. Nada aqui se perde no meio de conversa.</div>

      {/* CAPTURA RÁPIDA — primeira coisa da tela de propósito */}
      <div style={s.capturaWrap}>
        <input ref={campoRef} style={s.capturaInput} value={texto}
          placeholder={tipo === 'meta' ? 'Qual a meta? ex: fechar 40 vendas' : tipo === 'nota' ? 'Anota aqui antes de esquecer...' : 'O que precisa ser feito?'}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') adicionar() }} />
        <button style={s.btnAdd} onClick={adicionar} disabled={salvando || !texto.trim()}>
          {salvando ? 'Salvando...' : '+ Adicionar'}
        </button>
      </div>

      <div style={s.capturaWrap}>
        {[['tarefa', '✓ Tarefa'], ['meta', '🎯 Meta'], ['nota', '📌 Anotação']].map(([v, l]) => (
          <button key={v} style={{ ...s.chip, ...(tipo === v ? s.chipOn : {}) }} onClick={() => setTipo(v)}>{l}</button>
        ))}
        {tipo === 'tarefa' && <span style={{ color: '#cbd5e1' }}>|</span>}
        {tipo === 'tarefa' && [['hoje', 'Hoje'], ['amanha', 'Amanhã'], ['semana', 'Esta semana'], ['sem', 'Sem data']].map(([v, l]) => (
          <button key={v} style={{ ...s.chip, ...(quando === v ? s.chipOn : {}) }} onClick={() => setQuando(v)}>{l}</button>
        ))}
        {tipo === 'meta' && (
          <input style={{ ...s.inputMini, width: 108 }} value={metaAlvo} placeholder="alvo (nº)"
            onChange={e => setMetaAlvo(e.target.value)} />
        )}
        {tipo !== 'nota' && <span style={{ color: '#cbd5e1' }}>|</span>}
        {tipo !== 'nota' && PRIORIDADES.map(([v, l]) => (
          <button key={v} style={{ ...s.chip, ...(prio === v ? s.chipOn : {}) }} onClick={() => setPrio(v)}>{l}</button>
        ))}
        <select style={s.chip} value={area} onChange={e => setArea(e.target.value)}>
          <option value="">área…</option>
          {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <div style={s.dica}>Os botões acima ficam como você deixou — dá pra despejar várias tarefas seguidas só digitando e apertando Enter.</div>

      {erro && <div style={{ ...s.kpiAlerta, marginBottom: 14 }}>Erro ao carregar: {erro}</div>}

      <div style={s.kpis}>
        {atrasados.length > 0 && <span style={s.kpiAlerta}>🔴 Atrasado: <b>{atrasados.length}</b></span>}
        <span style={s.kpi}>⭐ Hoje: <b>{hoje.length}</b></span>
        <span style={s.kpi}>✅ Concluído hoje: <b>{feitosHoje}</b></span>
        <span style={s.kpi}>🎯 Metas abertas: <b>{metas.length}</b></span>
      </div>

      {carregando ? <div style={s.vazio}>Carregando...</div> : (
        <>
          <div style={s.quadro}>
            {COLUNAS.map(([chave, titulo, ajuda]) => {
              const lista = doGrupo(chave)
              return (
                <div key={chave} style={s.col}>
                  <div style={s.colTit}><span>{titulo}</span><span style={{ color: '#94a3b8' }}>{lista.length}</span></div>
                  <div style={s.colSub}>{ajuda}</div>
                  {lista.length === 0 ? <div style={s.vazio}>—</div> : lista.map(Cartao)}
                </div>
              )
            })}
          </div>

          <div style={s.grid2}>
            <div>
              <div style={s.secao}>🎯 Metas</div>
              {metas.length === 0 && <div style={s.vazio}>Nenhuma meta aberta.</div>}
              {metas.map(m => {
                const pct = m.meta_pct != null ? m.meta_pct : 0
                return (
                  <div key={m.id} style={s.metaCard}>
                    <div style={s.metaTopo}>
                      <div style={s.metaTit}>{m.titulo}</div>
                      <div style={s.metaNum}>
                        {m.meta_alvo ? <b>{Number(m.meta_feito || 0)}</b> : null}
                        {m.meta_alvo ? ' / ' + Number(m.meta_alvo) : 'sem alvo'}
                      </div>
                    </div>
                    {m.meta_alvo > 0 && (<>
                      <div style={s.barra}><div style={s.barraIn(pct, pct >= 100)} /></div>
                      <div style={{ fontSize: 11, color: pct >= 100 ? '#059669' : '#5b6b84', marginBottom: 7, fontWeight: pct >= 100 ? 700 : 400 }}>
                        {pct}%{pct >= 100 ? ' — bateu 🎉' : ''}
                      </div>
                    </>)}
                    <div style={s.metaPe}>
                      {m.meta_alvo > 0 && (
                        <input style={s.inputMini} type="number" defaultValue={Number(m.meta_feito || 0)}
                          title="Quanto já foi feito"
                          onBlur={e => salvarProgresso(m, e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }} />
                      )}
                      {m.dia_br && <span style={m.dias_atraso > 0 ? s.tagAtraso : s.tag}>
                        {m.dias_atraso > 0 ? 'venceu há ' + m.dias_atraso + 'd' : 'até ' + m.dia_br}
                      </span>}
                      {m.area && <span style={s.tag}>{m.area}</span>}
                      <button style={s.acao} onClick={() => marcar(m)}>concluir</button>
                      <button style={{ ...s.acao, ...s.acaoRuim }} onClick={() => excluir(m)}>excluir</button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div>
              <div style={s.secao}>📌 Anotações</div>
              {notas.length === 0 && <div style={s.vazio}>Nada anotado.</div>}
              {notas.map(n => (
                <div key={n.id} style={s.notaCard}>
                  <div style={{ fontSize: 13.5, color: '#0f172a', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{n.titulo}</div>
                  <div style={{ ...s.cardPe, marginLeft: 0 }}>
                    {n.area && <span style={s.tag}>{n.area}</span>}
                    <button style={s.acao} onClick={() => marcar(n)}>arquivar</button>
                    <button style={{ ...s.acao, ...s.acaoRuim }} onClick={() => excluir(n)}>excluir</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {feitos.length > 0 && (
            <div style={s.feitoWrap}>
              <button style={s.chip} onClick={() => setMostrarFeitos(v => !v)}>
                {mostrarFeitos ? '▾' : '▸'} ✅ Concluído ({feitos.length})
              </button>
              {mostrarFeitos && (
                <div style={{ marginTop: 10, maxWidth: 560 }}>
                  {feitos.map(Cartao)}
                  <div style={s.dica}>Some daqui sozinho depois de 7 dias.</div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
