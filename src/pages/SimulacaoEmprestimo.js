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
  valorBig: { fontSize: 22, fontWeight: 600, color: '#3B6D11', lineHeight: 1 },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  btnVender: { flex: 1, minWidth: 150, padding: '10px', background: '#3B6D11', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnWhats: { padding: '10px 14px', background: '#EAF3DE', color: '#25683b', border: '0.5px solid #3B6D1140', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 },
  btnSec: { padding: '9px 12px', background: '#fff', color: '#888', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  linkCorrigir: { fontSize: 11, color: '#999', textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', marginTop: 8, padding: 0 },
  formBox: { background: '#F8FAFC', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: 12, marginTop: 10 },
  campoLinha: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 },
  campo: { flex: 1, minWidth: 130 },
  label: { fontSize: 11, color: '#666', display: 'block', marginBottom: 4 },
  input: { width: '100%', padding: '7px 9px', fontSize: 13, borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', boxSizing: 'border-box' },
  empty: { textAlign: 'center', padding: '3rem 1rem', color: '#aaa', fontSize: 13 },
  loading: { textAlign: 'center', padding: '3rem', color: '#888', fontSize: 14 },
  robo: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, marginBottom: 16, flexWrap: 'wrap' },
  roboOk: { background: '#EAF3DE', border: '0.5px solid #3B6D1130' },
  roboAlerta: { background: '#FCEBEB', border: '0.5px solid #A32D2D40' },
  luz: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  filaHeader: { fontSize: 12, color: '#666', background: '#F4F8FC', border: '0.5px solid #185FA520', borderRadius: 8, padding: '8px 12px', marginBottom: 12 },
}

const ABAS = [
  ['pre_aprovado', 'Pré-aprovados'],
  ['novo', 'Novos (fila do robô)'],
  ['em_analise', 'Em análise'],
  ['negado', 'Negados'],
  ['sem_contato', 'Sem contato'],
]

function fmtCpf(cpf) {
  const d = (cpf || '').replace(/\D/g, '')
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : cpf
}
function fmtBRL(v) {
  if (v == null) return 'R$ 0'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function tempoDesde(iso) {
  if (!iso) return ''
  const seg = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seg < 60) return `há ${seg}s`
  const min = Math.floor(seg / 60)
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}
function soDigitos(t) { return (t || '').replace(/\D/g, '') }

export default function SimulacaoEmprestimo() {
  const { profile } = useAuth()
  const [aba, setAba] = useState('pre_aprovado')
  const [itens, setItens] = useState([])
  const [nomesProfiles, setNomesProfiles] = useState({})
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(null)
  const [periodo, setPeriodo] = useState('mes')
  const [dtIni, setDtIni] = useState('')
  const [dtFim, setDtFim] = useState('')
  const [resumo, setResumo] = useState(null)
  const [saude, setSaude] = useState(null)
  const [formAberto, setFormAberto] = useState(null)
  const [valor, setValor] = useState('')
  const [margem, setMargem] = useState('')
  const [parcela, setParcela] = useState('')
  const [obs, setObs] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('simulacoes_emprestimo').select('*').eq('status', aba)
    if (aba === 'pre_aprovado') q = q.order('valor_simulado', { ascending: false, nullsFirst: false })
    else q = q.order('criado_em', { ascending: aba === 'novo' })
    const { data } = await q.limit(300)
    const lista = data || []
    const ids = [...new Set(lista.map(i => i.atribuido_a).filter(Boolean))]
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, nome').in('id', ids)
      const mapa = {}; (profs || []).forEach(p => { mapa[p.id] = p.nome })
      setNomesProfiles(mapa)
    }
    setItens(lista)
    setLoading(false)
  }, [aba])

  const carregarResumo = useCallback(async () => {
    const fim = new Date(); let ini = new Date()
    if (periodo === 'dia') ini.setHours(0, 0, 0, 0)
    else if (periodo === 'semana') ini.setDate(ini.getDate() - 7)
    else if (periodo === 'mes') ini.setMonth(ini.getMonth() - 1)
    else if (periodo === 'custom') { if (dtIni) ini = new Date(dtIni); if (dtFim) fim.setTime(new Date(dtFim).getTime()) }
    const { data } = await supabase.rpc('simulacao_emprestimo_resumo', { p_inicio: ini.toISOString(), p_fim: fim.toISOString() })
    setResumo(data || null)
  }, [periodo, dtIni, dtFim])

  const carregarSaude = useCallback(async () => {
    const { data: log } = await supabase.from('crefisa_log').select('criado_em').order('criado_em', { ascending: false }).limit(1)
    const { count: fila } = await supabase.from('simulacoes_emprestimo').select('id', { count: 'exact', head: true }).eq('status', 'novo')
    const { count: proc } = await supabase.from('simulacoes_emprestimo').select('id', { count: 'exact', head: true }).eq('status', 'processando')
    const umaHoraAtras = new Date(Date.now() - 3600000).toISOString()
    const { count: ultimaHora } = await supabase.from('crefisa_log').select('id', { count: 'exact', head: true }).gte('criado_em', umaHoraAtras)
    const ultima = log?.[0]?.criado_em || null
    const minSemSim = ultima ? Math.floor((Date.now() - new Date(ultima).getTime()) / 60000) : 999
    setSaude({ ultima, fila: fila || 0, processando: proc || 0, ultimaHora: ultimaHora || 0, parado: minSemSim >= 10 })
  }, [])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { carregarResumo() }, [carregarResumo])
  useEffect(() => {
    carregarSaude()
    const id = setInterval(carregarSaude, 30000)
    return () => clearInterval(id)
  }, [carregarSaude])

  async function assumir(item) {
    setSalvando(item.id)
    await supabase.from('simulacoes_emprestimo').update({
      atribuido_a: profile?.id, atribuido_em: new Date().toISOString(), atualizado_em: new Date().toISOString()
    }).eq('id', item.id)
    setSalvando(null)
    carregar()
  }

  async function marcarSemContato(item) {
    setSalvando(item.id)
    await supabase.from('simulacoes_emprestimo').update({
      status: 'sem_contato', atualizado_em: new Date().toISOString()
    }).eq('id', item.id)
    setSalvando(null)
    carregar(); carregarResumo()
  }

  function abrirCorrecao(id) { setFormAberto(id); setValor(''); setMargem(''); setParcela(''); setObs('') }
  async function corrigirManual(item, novoStatus) {
    if (novoStatus === 'pre_aprovado' && !valor) { alert('Informe o valor.'); return }
    if (novoStatus === 'negado' && !obs.trim()) { alert('Informe o motivo.'); return }
    setSalvando(item.id)
    const payload = {
      status: novoStatus, decidido_por: profile?.id, decidido_em: new Date().toISOString(),
      observacao: '[correcao manual] ' + (obs.trim() || ''), atualizado_em: new Date().toISOString(),
    }
    if (novoStatus === 'pre_aprovado') {
      payload.valor_simulado = Number(valor)
      payload.margem_disponivel = margem ? Number(margem) : null
      payload.parcela_estimada = parcela ? Number(parcela) : null
    } else { payload.motivo_negado = obs.trim() }
    await supabase.from('simulacoes_emprestimo').update(payload).eq('id', item.id)
    setSalvando(null); setFormAberto(null)
    carregar(); carregarResumo()
  }

  return (
    <div>
      <div style={s.title}>💰 Simulação de Empréstimo</div>
      <div style={s.subtitle}>
        A simulação é automática — os CPFs são simulados na Crefisa sozinhos.
        Sua função: contatar os <strong>pré-aprovados</strong> e fechar o empréstimo.
      </div>

      {saude && (
        <div style={{ ...s.robo, ...(saude.parado ? s.roboAlerta : s.roboOk) }}>
          <span style={{ ...s.luz, background: saude.parado ? '#A32D2D' : '#3B6D11' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: saude.parado ? '#A32D2D' : '#25683b' }}>
            {saude.parado ? '⚠️ Robô parado — avisar o Bruno' : '🤖 Robô ativo'}
          </span>
          <span style={{ fontSize: 12, color: '#666' }}>
            última simulação {tempoDesde(saude.ultima)} · {saude.ultimaHora}/h
          </span>
          <span style={{ fontSize: 12, color: '#666', marginLeft: 'auto' }}>
            fila: <strong>{saude.fila}</strong> aguardando · {saude.processando} simulando agora
          </span>
        </div>
      )}

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
            <div style={{ ...s.kpi, background: '#EAF3DE', borderColor: '#3B6D1130' }}>
              <div style={{ ...s.kpiTop, color: '#3B6D11' }}>Pré-aprovados · aguardando contato</div>
              <div style={{ ...s.kpiNum, color: '#3B6D11' }}>{resumo.pre_aprovado}</div>
              <div style={s.kpiSub}>{resumo.taxa_pre_aprovacao != null ? `${resumo.taxa_pre_aprovacao}% dos decididos` : '—'}</div>
            </div>
            <div style={{ ...s.kpi, background: '#FFF8E7', borderColor: '#85500B30' }}>
              <div style={{ ...s.kpiTop, color: '#854F0B' }}>Potencial em pré-aprovados</div>
              <div style={{ ...s.kpiNum, color: '#854F0B', fontSize: 20 }}>{fmtBRL(resumo.valor_potencial)}</div>
              <div style={s.kpiSub}>ticket médio {fmtBRL(resumo.ticket_medio)}</div>
            </div>
            <div style={{ ...s.kpi, background: '#F4F8FC', borderColor: '#185FA520' }}>
              <div style={{ ...s.kpiTop, color: '#185FA5' }}>Recebidos</div>
              <div style={{ ...s.kpiNum, color: '#185FA5' }}>{resumo.total}</div>
              <div style={s.kpiSub}>{resumo.novo} na fila do robô</div>
            </div>
            <div style={{ ...s.kpi, background: '#FCEBEB', borderColor: '#A32D2D30' }}>
              <div style={{ ...s.kpiTop, color: '#A32D2D' }}>Negados</div>
              <div style={{ ...s.kpiNum, color: '#A32D2D' }}>{resumo.negado}</div>
              <div style={s.kpiSub}>{resumo.sem_contato} sem contato</div>
            </div>
          </div>
        )}
      </div>

      <div style={s.tabs}>
        {ABAS.map(([k, label]) => (
          <button key={k} onClick={() => { setAba(k); setFormAberto(null) }} style={{ ...s.tab, ...(aba === k ? s.tabActive : {}) }}>
            {label}
            {resumo && resumo[k] > 0 && <span style={s.tabBadge}>{resumo[k]}</span>}
          </button>
        ))}
      </div>

      {aba === 'novo' && (
        <div style={s.filaHeader}>
          🔄 Estes CPFs estão na fila do robô — ele simula sozinho a cada ~2 min. Nada a fazer manualmente aqui (só descartar se necessário).
        </div>
      )}

      {loading ? (
        <div style={s.loading}>Carregando...</div>
      ) : itens.length === 0 ? (
        <div style={s.empty}>
          {aba === 'pre_aprovado' ? 'Nenhum pré-aprovado aguardando contato.' : 'Nada aqui.'}
        </div>
      ) : (
        itens.map(item => {
          const ehMat = !!item.cliente_maternidade_id
          const jaAssumido = !!item.atribuido_a
          const tel = soDigitos(item.telefone)
          return (
            <div key={item.id} style={s.card}>
              <div style={s.cardHeader}>
                <div>
                  <div style={s.nome}>{item.nome || 'Sem nome'}</div>
                  <div style={s.meta}>CPF {fmtCpf(item.cpf)} · {item.telefone || 'sem telefone'} · {item.origem_ia || 'IA'}</div>
                  {ehMat && <span style={s.matTag}>já é cliente maternidade</span>}
                </div>
                {aba === 'pre_aprovado' && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={s.valorBig}>{fmtBRL(item.valor_simulado)}</div>
                    <div style={s.meta}>aprovado {tempoDesde(item.decidido_em || item.atualizado_em)}</div>
                    {item.parcela_estimada && <div style={s.meta}>parcela ~{fmtBRL(item.parcela_estimada)}</div>}
                  </div>
                )}
              </div>

              {aba === 'pre_aprovado' && (
                <>
                  {jaAssumido ? (
                    <div style={{ fontSize: 12, color: '#3B6D11', marginBottom: 8 }}>
                      ✓ Em contato por <strong>{nomesProfiles[item.atribuido_a] || 'alguém'}</strong> {tempoDesde(item.atribuido_em)}
                    </div>
                  ) : null}
                  <div style={s.actions}>
                    {!jaAssumido && (
                      <button style={s.btnVender} onClick={() => assumir(item)} disabled={salvando === item.id}>
                        {salvando === item.id ? '...' : '📞 Assumir e contatar'}
                      </button>
                    )}
                    {tel && (
                      <a style={s.btnWhats} href={`https://wa.me/55${tel}`} target="_blank" rel="noreferrer">💬 WhatsApp</a>
                    )}
                    <button style={s.btnSec} onClick={() => marcarSemContato(item)} disabled={salvando === item.id}>Sem contato</button>
                  </div>
                </>
              )}

              {aba === 'novo' && (
                <div style={s.actions}>
                  <div style={{ flex: 1, fontSize: 13, color: '#185FA5', fontWeight: 500, padding: '8px 0' }}>
                    ⏳ Na fila do robô — aguardando simulação automática
                  </div>
                  <button style={s.btnSec} onClick={() => marcarSemContato(item)} disabled={salvando === item.id}>Descartar</button>
                </div>
              )}

              {aba === 'negado' && item.motivo_negado && (
                <div style={{ fontSize: 12, color: '#A32D2D', background: '#FCEBEB', borderRadius: 8, padding: '8px 10px' }}>
                  Motivo: {item.motivo_negado}
                </div>
              )}

              {(aba === 'novo' || aba === 'negado' || aba === 'em_analise') && (
                formAberto === item.id ? (
                  <div style={s.formBox}>
                    <div style={s.campoLinha}>
                      <div style={s.campo}>
                        <label style={s.label}>Valor (se pré-aprovar)</label>
                        <input style={s.input} value={valor} onChange={e => setValor(e.target.value)} placeholder="R$" />
                      </div>
                      <div style={s.campo}>
                        <label style={s.label}>Motivo (se negar)</label>
                        <input style={s.input} value={obs} onChange={e => setObs(e.target.value)} placeholder="motivo" />
                      </div>
                    </div>
                    <div style={s.actions}>
                      <button style={{ ...s.btnSec, color: '#3B6D11', borderColor: '#3B6D1140' }} onClick={() => corrigirManual(item, 'pre_aprovado')}>Pré-aprovar</button>
                      <button style={{ ...s.btnSec, color: '#A32D2D', borderColor: '#A32D2D40' }} onClick={() => corrigirManual(item, 'negado')}>Negar</button>
                      <button style={s.btnSec} onClick={() => setFormAberto(null)}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <button style={s.linkCorrigir} onClick={() => abrirCorrecao(item.id)}>corrigir manualmente</button>
                )
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
