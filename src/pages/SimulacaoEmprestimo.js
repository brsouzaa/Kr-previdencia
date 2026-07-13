import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const s = {
  title: { fontSize: 20, fontWeight: 500, color: '#111', marginBottom: 4, letterSpacing: '-0.3px' },
  subtitle: { fontSize: 13, color: '#888', marginBottom: 20 },
  painel: { background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: 16 },
  filtros: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 },
  fBtn: { padding: '5px 12px', fontSize: 12, fontWeight: 500, borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', background: '#fff', color: '#666', cursor: 'pointer' },
  fBtnOn: { background: '#185FA5', color: '#fff', borderColor: '#185FA5' },
  dateInput: { padding: '4px 8px', fontSize: 12, borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', color: '#333' },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 },
  kpi: { border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '10px 12px' },
  kpiTop: { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 500, marginBottom: 6 },
  kpiNum: { fontSize: 24, fontWeight: 500, lineHeight: 1 },
  kpiSub: { fontSize: 11, color: '#888', marginTop: 4 },
  tabs: { display: 'flex', gap: 8, marginBottom: 16, borderBottom: '0.5px solid rgba(0,0,0,0.1)', flexWrap: 'wrap' },
  tab: { padding: '10px 14px', fontSize: 13, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', color: '#888', borderBottom: '2px solid transparent', marginBottom: -1 },
  tabActive: { color: '#185FA5', borderBottomColor: '#185FA5' },
  tabBadge: { fontSize: 11, padding: '1px 7px', borderRadius: 10, marginLeft: 6, background: 'rgba(0,0,0,0.08)', color: '#555' },
  card: { background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: 10 },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap', gap: 8 },
  nome: { fontSize: 15, fontWeight: 500, color: '#111' },
  meta: { fontSize: 12, color: '#888', marginTop: 2 },
  matTag: { display: 'inline-block', fontSize: 11, color: '#3B6D11', background: '#EAF3DE', border: '0.5px solid #3B6D1130', borderRadius: 8, padding: '2px 8px', marginTop: 6 },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  btnPegar: { flex: 1, minWidth: 120, padding: '9px', background: '#E6F1FB', color: '#185FA5', border: '0.5px solid #185FA5', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  btnAprovar: { flex: 1, minWidth: 120, padding: '9px', background: '#EAF3DE', color: '#3B6D11', border: '0.5px solid #3B6D11', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  btnNegar: { flex: 1, minWidth: 120, padding: '9px', background: '#FCEBEB', color: '#A32D2D', border: '0.5px solid #A32D2D', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  formBox: { background: '#F8FAFC', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: 12, marginTop: 10 },
  campoLinha: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 },
  campo: { flex: 1, minWidth: 130 },
  label: { fontSize: 11, color: '#666', display: 'block', marginBottom: 4 },
  input: { width: '100%', padding: '7px 9px', fontSize: 13, borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', boxSizing: 'border-box' },
  empty: { textAlign: 'center', padding: '3rem 1rem', color: '#aaa', fontSize: 13 },
  loading: { textAlign: 'center', padding: '3rem', color: '#888', fontSize: 14 },
}

const ABAS = [
  ['novo', 'Novos'],
  ['em_analise', 'Em análise'],
  ['pre_aprovado', 'Pré-aprovados'],
  ['negado', 'Negados'],
  ['sem_contato', 'Sem contato'],
]

function fmtCpf(cpf) {
  const d = (cpf || '').replace(/\D/g, '')
  if (d.length !== 11) return cpf
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`
}
function fmtTel(t) {
  const d = (t || '').replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`
  return t
}
function fmtBRL(n) {
  if (n == null) return '—'
  return 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
}
function tempoRelativo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 60) return `há ${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}

export default function SimulacaoEmprestimo() {
  const { profile } = useAuth()
  const [aba, setAba] = useState('novo')
  const [itens, setItens] = useState([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(null)

  // painel
  const [periodo, setPeriodo] = useState('mes')
  const [dtIni, setDtIni] = useState('')
  const [dtFim, setDtFim] = useState('')
  const [resumo, setResumo] = useState(null)

  // formulário de simulação por card aberto
  const [formAberto, setFormAberto] = useState(null) // id do card
  const [valor, setValor] = useState('')
  const [margem, setMargem] = useState('')
  const [parcela, setParcela] = useState('')
  const [obs, setObs] = useState('')

  const intervalo = useCallback(() => {
    const agora = new Date()
    if (periodo === 'dia') {
      const i = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
      const f = new Date(i); f.setDate(f.getDate() + 1); return [i, f]
    }
    if (periodo === 'semana') {
      const i = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - agora.getDay())
      const f = new Date(i); f.setDate(f.getDate() + 7); return [i, f]
    }
    if (periodo === 'custom' && dtIni && dtFim) {
      const i = new Date(dtIni + 'T00:00:00')
      const f = new Date(dtFim + 'T00:00:00'); f.setDate(f.getDate() + 1); return [i, f]
    }
    const i = new Date(agora.getFullYear(), agora.getMonth(), 1)
    const f = new Date(agora.getFullYear(), agora.getMonth() + 1, 1); return [i, f]
  }, [periodo, dtIni, dtFim])

  const carregar = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('simulacoes_emprestimo')
      .select('*')
      .eq('status', aba)
      .order('criado_em', { ascending: aba === 'novo' })
    const lista = data || []
    // resolve nome de quem pegou sem embed ambiguo (2 FKs -> profiles quebram o PostgREST)
    const ids = [...new Set(lista.map(i => i.atribuido_a).filter(Boolean))]
    let nomes = {}
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, nome').in('id', ids)
      nomes = Object.fromEntries((profs || []).map(p => [p.id, p.nome]))
    }
    setItens(lista.map(i => ({ ...i, _atribuido_nome: nomes[i.atribuido_a] || null })))
    setLoading(false)
  }, [aba])

  const carregarResumo = useCallback(async () => {
    if (periodo === 'custom' && (!dtIni || !dtFim)) return
    const [ini, fim] = intervalo()
    const { data } = await supabase.rpc('simulacao_emprestimo_resumo', { p_inicio: ini.toISOString(), p_fim: fim.toISOString() })
    setResumo(data || null)
  }, [periodo, dtIni, dtFim, intervalo])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { carregarResumo() }, [carregarResumo])

  async function pegar(item) {
    setSalvando(item.id)
    await supabase.from('simulacoes_emprestimo').update({
      status: 'em_analise', atribuido_a: profile?.id, atribuido_em: new Date().toISOString(), atualizado_em: new Date().toISOString()
    }).eq('id', item.id)
    setSalvando(null)
    carregar(); carregarResumo()
  }

  function abrirForm(id) {
    setFormAberto(id); setValor(''); setMargem(''); setParcela(''); setObs('')
  }

  async function decidir(item, novoStatus) {
    if (novoStatus === 'pre_aprovado' && !valor) { alert('Informe o valor pré-aprovado.'); return }
    if (novoStatus === 'negado' && !obs.trim()) { alert('Informe o motivo da negação.'); return }
    setSalvando(item.id)
    const payload = {
      status: novoStatus,
      decidido_por: profile?.id, decidido_em: new Date().toISOString(), atualizado_em: new Date().toISOString(),
    }
    if (novoStatus === 'pre_aprovado') {
      payload.valor_simulado = Number(valor)
      payload.margem_disponivel = margem ? Number(margem) : null
      payload.parcela_estimada = parcela ? Number(parcela) : null
      payload.observacao = obs.trim() || null
    } else {
      payload.motivo_negado = obs.trim()
    }
    await supabase.from('simulacoes_emprestimo').update(payload).eq('id', item.id)
    setSalvando(null); setFormAberto(null)
    carregar(); carregarResumo()
  }

  async function marcarSemContato(item) {
    setSalvando(item.id)
    await supabase.from('simulacoes_emprestimo').update({
      status: 'sem_contato', atualizado_em: new Date().toISOString()
    }).eq('id', item.id)
    setSalvando(null)
    carregar(); carregarResumo()
  }

  return (
    <div>
      <div style={s.title}>💰 Simulação de Empréstimo</div>
      <div style={s.subtitle}>Leads que enviaram o CPF pela Ana/Isis. Um especialista simula e marca pré-aprovado ou negado.</div>

      {/* Painel */}
      <div style={s.painel}>
        <div style={s.filtros}>
          {[['dia', 'Hoje'], ['semana', 'Semana'], ['mes', 'Mês'], ['custom', 'Personalizado']].map(([k, label]) => (
            <button key={k} onClick={() => setPeriodo(k)} style={{ ...s.fBtn, ...(periodo === k ? s.fBtnOn : {}) }}>{label}</button>
          ))}
          {periodo === 'custom' && (
            <>
              <input type="date" style={s.dateInput} value={dtIni} onChange={e => setDtIni(e.target.value)} />
              <span style={{ fontSize: 12, color: '#888' }}>até</span>
              <input type="date" style={s.dateInput} value={dtFim} onChange={e => setDtFim(e.target.value)} />
            </>
          )}
        </div>
        {resumo && (
          <div style={s.kpis}>
            <div style={{ ...s.kpi, background: '#F4F8FC', borderColor: '#185FA520' }}>
              <div style={{ ...s.kpiTop, color: '#185FA5' }}>Recebidos</div>
              <div style={{ ...s.kpiNum, color: '#185FA5' }}>{resumo.total}</div>
              <div style={s.kpiSub}>{resumo.novo} novo(s) · {resumo.em_analise} em análise</div>
            </div>
            <div style={{ ...s.kpi, background: '#EAF3DE', borderColor: '#3B6D1130' }}>
              <div style={{ ...s.kpiTop, color: '#3B6D11' }}>Pré-aprovados</div>
              <div style={{ ...s.kpiNum, color: '#3B6D11' }}>{resumo.pre_aprovado}</div>
              <div style={s.kpiSub}>{resumo.taxa_pre_aprovacao != null ? `${resumo.taxa_pre_aprovacao}% dos decididos` : 'aguardando decisões'}</div>
            </div>
            <div style={{ ...s.kpi, background: '#FCEBEB', borderColor: '#A32D2D30' }}>
              <div style={{ ...s.kpiTop, color: '#A32D2D' }}>Negados</div>
              <div style={{ ...s.kpiNum, color: '#A32D2D' }}>{resumo.negado}</div>
              <div style={s.kpiSub}>{resumo.sem_contato} sem contato</div>
            </div>
            <div style={{ ...s.kpi, background: '#FFF8E7', borderColor: '#85500B30' }}>
              <div style={{ ...s.kpiTop, color: '#854F0B' }}>Potencial pré-aprovado</div>
              <div style={{ ...s.kpiNum, color: '#854F0B', fontSize: 20 }}>{fmtBRL(resumo.valor_potencial)}</div>
              <div style={s.kpiSub}>ticket médio {fmtBRL(resumo.ticket_medio)}</div>
            </div>
          </div>
        )}
      </div>

      {/* Abas por status */}
      <div style={s.tabs}>
        {ABAS.map(([k, label]) => (
          <button key={k} onClick={() => { setAba(k); setFormAberto(null) }} style={{ ...s.tab, ...(aba === k ? s.tabActive : {}) }}>
            {label}
            {resumo && resumo[k] > 0 && <span style={s.tabBadge}>{resumo[k]}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={s.loading}>Carregando...</div>
      ) : itens.length === 0 ? (
        <div style={s.empty}>Nenhum lead {ABAS.find(a => a[0] === aba)?.[1].toLowerCase()} neste momento.</div>
      ) : (
        itens.map(item => (
          <div key={item.id} style={s.card}>
            <div style={s.cardHeader}>
              <div>
                <div style={s.nome}>{item.nome}</div>
                <div style={s.meta}>
                  {fmtCpf(item.cpf)} · {fmtTel(item.telefone)} · {tempoRelativo(item.criado_em)}
                  {item.origem_ia ? ` · via ${item.origem_ia}` : ''}
                </div>
                {item.cliente_maternidade_id && <div style={s.matTag}>Já é cliente de maternidade</div>}
                {item.status === 'pre_aprovado' && (
                  <div style={{ ...s.meta, color: '#3B6D11', marginTop: 6 }}>
                    Pré-aprovado: <strong>{fmtBRL(item.valor_simulado)}</strong>
                    {item.margem_disponivel ? ` · margem ${fmtBRL(item.margem_disponivel)}` : ''}
                    {item.parcela_estimada ? ` · parcela ${fmtBRL(item.parcela_estimada)}` : ''}
                    {item.observacao ? ` · ${item.observacao}` : ''}
                  </div>
                )}
                {item.status === 'negado' && item.motivo_negado && (
                  <div style={{ ...s.meta, color: '#A32D2D', marginTop: 6 }}>Negado: {item.motivo_negado}</div>
                )}
                {item.status === 'em_analise' && item._atribuido_nome && (
                  <div style={{ ...s.meta, marginTop: 6 }}>Com {item._atribuido_nome}</div>
                )}
              </div>
            </div>

            {/* Ações por status */}
            {item.status === 'novo' && (
              <div style={s.actions}>
                <button style={s.btnPegar} disabled={salvando === item.id} onClick={() => pegar(item)}>Pegar para simular</button>
                <button style={{ ...s.fBtn, padding: '9px 12px' }} disabled={salvando === item.id} onClick={() => marcarSemContato(item)}>Sem contato</button>
              </div>
            )}

            {item.status === 'em_analise' && formAberto !== item.id && (
              <div style={s.actions}>
                <button style={s.btnAprovar} onClick={() => abrirForm(item.id)}>Registrar resultado</button>
                <button style={{ ...s.fBtn, padding: '9px 12px' }} disabled={salvando === item.id} onClick={() => marcarSemContato(item)}>Sem contato</button>
              </div>
            )}

            {item.status === 'em_analise' && formAberto === item.id && (
              <div style={s.formBox}>
                <div style={s.campoLinha}>
                  <div style={s.campo}>
                    <label style={s.label}>Valor pré-aprovado (R$)</label>
                    <input style={s.input} type="number" value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" />
                  </div>
                  <div style={s.campo}>
                    <label style={s.label}>Margem disponível (R$)</label>
                    <input style={s.input} type="number" value={margem} onChange={e => setMargem(e.target.value)} placeholder="opcional" />
                  </div>
                  <div style={s.campo}>
                    <label style={s.label}>Parcela estimada (R$)</label>
                    <input style={s.input} type="number" value={parcela} onChange={e => setParcela(e.target.value)} placeholder="opcional" />
                  </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={s.label}>Observação / motivo</label>
                  <input style={s.input} value={obs} onChange={e => setObs(e.target.value)} placeholder="Obs. (obrigatório se negar)" />
                </div>
                <div style={s.actions}>
                  <button style={s.btnAprovar} disabled={salvando === item.id} onClick={() => decidir(item, 'pre_aprovado')}>✓ Pré-aprovado</button>
                  <button style={s.btnNegar} disabled={salvando === item.id} onClick={() => decidir(item, 'negado')}>✕ Negado</button>
                  <button style={{ ...s.fBtn, padding: '9px 12px' }} onClick={() => setFormAberto(null)}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}
