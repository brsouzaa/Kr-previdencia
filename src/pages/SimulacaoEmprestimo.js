import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const s = {
  title: { fontSize: 20, fontWeight: 500, color: '#111', marginBottom: 4, letterSpacing: '-0.3px' },
  subtitle: { fontSize: 13, color: '#888', marginBottom: 16 },
  robo: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, marginBottom: 16, flexWrap: 'wrap' },
  roboOk: { background: '#EAF3DE', border: '0.5px solid #3B6D1130' },
  roboAlerta: { background: '#FCEBEB', border: '0.5px solid #A32D2D40' },
  luz: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
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
  cardVencido: { border: '1px solid #A32D2D', background: '#FEF6F6' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap', gap: 8 },
  nome: { fontSize: 15, fontWeight: 500, color: '#111' },
  meta: { fontSize: 12, color: '#888', marginTop: 2 },
  valorBig: { fontSize: 22, fontWeight: 600, color: '#3B6D11', lineHeight: 1 },
  donoTag: { fontSize: 12, marginBottom: 8, padding: '4px 8px', borderRadius: 6, display: 'inline-block' },
  donoOk: { color: '#25683b', background: '#EAF3DE' },
  donoVencido: { color: '#A32D2D', background: '#FCEBEB', fontWeight: 500 },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  btnVender: { flex: 1, minWidth: 140, padding: '10px', background: '#3B6D11', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnWhats: { padding: '10px 14px', background: '#EAF3DE', color: '#25683b', border: '0.5px solid #3B6D1140', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 },
  btnSec: { padding: '9px 12px', background: '#fff', color: '#888', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  // desfecho
  desfechoBox: { background: '#F8FAFC', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: 12, marginTop: 10 },
  desfechoTitulo: { fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 10 },
  btnDesVendeu: { padding: '10px', background: '#3B6D11', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnDesNao: { padding: '10px', background: '#fff', color: '#A32D2D', border: '0.5px solid #A32D2D40', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  input: { width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', boxSizing: 'border-box', marginBottom: 8 },
  empty: { textAlign: 'center', padding: '3rem 1rem', color: '#aaa', fontSize: 13 },
  loading: { textAlign: 'center', padding: '3rem', color: '#888', fontSize: 14 },
  filaHeader: { fontSize: 12, color: '#666', background: '#F4F8FC', border: '0.5px solid #185FA520', borderRadius: 8, padding: '8px 12px', marginBottom: 12 },
  linkGestao: { fontSize: 13, color: '#185FA5', fontWeight: 500, textDecoration: 'none' },
}

const ABAS = [
  ['pre_aprovado', 'A contatar'],
  ['vendido', 'Vendidos'],
  ['nao_vendido', 'Não fecharam'],
  ['sem_contato', 'Sem contato'],
  ['novo', 'Fila do robô'],
  ['negado', 'Negados'],
]

const MOTIVOS_NAO_VENDA = ['Cliente desistiu', 'Sem interesse', 'Valor baixo', 'Já tem empréstimo', 'Não atende', 'Dados errados', 'Outro']

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
  const [dash, setDash] = useState(null)
  const [saude, setSaude] = useState(null)
  const [desfechoAberto, setDesfechoAberto] = useState(null)
  const [valorVenda, setValorVenda] = useState('')
  const [motivoNao, setMotivoNao] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    const ehAdmin = profile?.role === 'admin'
    let q = supabase.from('simulacoes_emprestimo').select('*').eq('status', aba)
    // Na fila "A contatar": vendedor ve so os LIVRES + os que ELE pegou. Admin ve tudo.
    if (aba === 'pre_aprovado' && !ehAdmin && profile?.id) {
      q = q.or(`atribuido_a.is.null,atribuido_a.eq.${profile.id}`)
    }
    if (aba === 'pre_aprovado') q = q.order('prazo_resolucao', { ascending: true, nullsFirst: false })
    else if (aba === 'vendido') q = q.order('vendido_em', { ascending: false, nullsFirst: false })
    else q = q.order('atualizado_em', { ascending: false })
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

  const carregarDash = useCallback(async () => {
    const fim = new Date(); let ini = new Date()
    if (periodo === 'dia') ini.setHours(0, 0, 0, 0)
    else if (periodo === 'semana') ini.setDate(ini.getDate() - 7)
    else if (periodo === 'mes') ini.setMonth(ini.getMonth() - 1)
    else if (periodo === 'custom') { if (dtIni) ini = new Date(dtIni); if (dtFim) fim.setTime(new Date(dtFim).getTime()) }
    const { data } = await supabase.rpc('emprestimo_dashboard', { p_inicio: ini.toISOString(), p_fim: fim.toISOString() })
    setDash(data || null)
  }, [periodo, dtIni, dtFim])

  const carregarSaude = useCallback(async () => {
    const { data: log } = await supabase.from('crefisa_log').select('criado_em').order('criado_em', { ascending: false }).limit(1)
    const { count: fila } = await supabase.from('simulacoes_emprestimo').select('id', { count: 'exact', head: true }).eq('status', 'novo')
    const ultima = log?.[0]?.criado_em || null
    const minSemSim = ultima ? Math.floor((Date.now() - new Date(ultima).getTime()) / 60000) : 999
    setSaude({ ultima, fila: fila || 0, parado: minSemSim >= 10 })
  }, [])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { carregarDash() }, [carregarDash])
  useEffect(() => { carregarSaude(); const id = setInterval(carregarSaude, 30000); return () => clearInterval(id) }, [carregarSaude])

  async function assumir(item) {
    setSalvando(item.id)
    await supabase.from('simulacoes_emprestimo').update({ atribuido_a: profile?.id }).eq('id', item.id)
    setSalvando(null); carregar(); carregarDash()
  }

  function abrirDesfecho(id) { setDesfechoAberto(id); setValorVenda(''); setMotivoNao('') }

  async function marcarVendido(item) {
    const v = Number(String(valorVenda).replace(/[^\d]/g, ''))
    if (!v) { alert('Informe o valor vendido.'); return }
    setSalvando(item.id)
    await supabase.from('simulacoes_emprestimo').update({
      status: 'vendido', valor_vendido: v, atribuido_a: item.atribuido_a || profile?.id
    }).eq('id', item.id)
    setSalvando(null); setDesfechoAberto(null); carregar(); carregarDash()
  }

  async function marcarNaoVendido(item) {
    if (!motivoNao) { alert('Escolha o motivo.'); return }
    setSalvando(item.id)
    await supabase.from('simulacoes_emprestimo').update({
      status: 'nao_vendido', motivo_nao_venda: motivoNao, atribuido_a: item.atribuido_a || profile?.id
    }).eq('id', item.id)
    setSalvando(null); setDesfechoAberto(null); carregar(); carregarDash()
  }

  async function marcarSemContato(item) {
    setSalvando(item.id)
    await supabase.from('simulacoes_emprestimo').update({
      status: 'sem_contato', atribuido_a: item.atribuido_a || profile?.id
    }).eq('id', item.id)
    setSalvando(null); setDesfechoAberto(null); carregar(); carregarDash()
  }

  const t = dash?.totais

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={s.title}>💰 Empréstimo Crefisa — CRM de vendas</div>
          <div style={s.subtitle}>Robô simula sozinho. Sua função: contatar os pré-aprovados, fechar e <strong>registrar o desfecho</strong>.</div>
        </div>
      </div>

      {saude && (
        <div style={{ ...s.robo, ...(saude.parado ? s.roboAlerta : s.roboOk) }}>
          <span style={{ ...s.luz, background: saude.parado ? '#A32D2D' : '#3B6D11' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: saude.parado ? '#A32D2D' : '#25683b' }}>
            {saude.parado ? '⚠️ Robô parado — avisar o Bruno' : '🤖 Robô ativo'}
          </span>
          <span style={{ fontSize: 12, color: '#666' }}>última simulação {tempoDesde(saude.ultima)}</span>
          <span style={{ fontSize: 12, color: '#666', marginLeft: 'auto' }}>fila do robô: <strong>{saude.fila}</strong></span>
        </div>
      )}

      {/* DASHBOARD DE GESTÃO */}
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
        {t && (
          <div style={s.kpis}>
            <div style={{ ...s.kpi, background: '#EAF3DE', borderColor: '#3B6D1130' }}>
              <div style={{ ...s.kpiTop, color: '#3B6D11' }}>Vendido no período</div>
              <div style={{ ...s.kpiNum, color: '#3B6D11', fontSize: 20 }}>{fmtBRL(t.valor_vendido)}</div>
              <div style={s.kpiSub}>{t.vendidos} vendas · ticket {fmtBRL(t.ticket_medio)}</div>
            </div>
            <div style={{ ...s.kpi, background: '#F4F8FC', borderColor: '#185FA520' }}>
              <div style={{ ...s.kpiTop, color: '#185FA5' }}>Conversão</div>
              <div style={{ ...s.kpiNum, color: '#185FA5' }}>{t.taxa_conversao}%</div>
              <div style={s.kpiSub}>{t.vendidos} de {t.vendidos + t.nao_vendidos + t.sem_contato} resolvidos</div>
            </div>
            <div style={{ ...s.kpi, background: '#FFF8E7', borderColor: '#85500B30' }}>
              <div style={{ ...s.kpiTop, color: '#854F0B' }}>A contatar</div>
              <div style={{ ...s.kpiNum, color: '#854F0B' }}>{t.pre_aprovados_abertos}</div>
              <div style={s.kpiSub}>{t.assumidos_sem_desfecho} assumidos sem desfecho</div>
            </div>
            <div style={{ ...s.kpi, background: t.vencidos_cobranca > 0 ? '#FCEBEB' : '#F7F7F7', borderColor: t.vencidos_cobranca > 0 ? '#A32D2D30' : 'rgba(0,0,0,0.08)' }}>
              <div style={{ ...s.kpiTop, color: t.vencidos_cobranca > 0 ? '#A32D2D' : '#888' }}>⏰ Vencidos (cobrar)</div>
              <div style={{ ...s.kpiNum, color: t.vencidos_cobranca > 0 ? '#A32D2D' : '#888' }}>{t.vencidos_cobranca}</div>
              <div style={s.kpiSub}>passaram de 24h sem resolver</div>
            </div>
          </div>
        )}
        {/* RANKING POR VENDEDOR */}
        {dash?.ranking?.length > 0 && (
          <div style={{ marginTop: 14, borderTop: '0.5px solid rgba(0,0,0,0.08)', paddingTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 8 }}>Ranking por vendedor</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: '#888', textAlign: 'left' }}>
                    <th style={{ padding: '4px 8px' }}>Vendedor</th>
                    <th style={{ padding: '4px 8px' }}>Atendidos</th>
                    <th style={{ padding: '4px 8px' }}>Vendas</th>
                    <th style={{ padding: '4px 8px' }}>Conversão</th>
                    <th style={{ padding: '4px 8px' }}>Valor</th>
                    <th style={{ padding: '4px 8px' }}>Em aberto</th>
                  </tr>
                </thead>
                <tbody>
                  {dash.ranking.map(r => (
                    <tr key={r.vendedor_id} style={{ borderTop: '0.5px solid rgba(0,0,0,0.05)' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 500 }}>{r.vendedor}</td>
                      <td style={{ padding: '6px 8px' }}>{r.atendidos}</td>
                      <td style={{ padding: '6px 8px', color: '#3B6D11', fontWeight: 500 }}>{r.vendidos}</td>
                      <td style={{ padding: '6px 8px' }}>{r.conversao}%</td>
                      <td style={{ padding: '6px 8px', color: '#3B6D11' }}>{fmtBRL(r.valor_vendido)}</td>
                      <td style={{ padding: '6px 8px', color: r.em_aberto > 0 ? '#854F0B' : '#888' }}>{r.em_aberto}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div style={s.tabs}>
        {ABAS.map(([k, label]) => (
          <button key={k} onClick={() => { setAba(k); setDesfechoAberto(null) }} style={{ ...s.tab, ...(aba === k ? s.tabActive : {}) }}>{label}</button>
        ))}
      </div>

      {aba === 'novo' && (
        <div style={s.filaHeader}>🔄 CPFs na fila do robô — ele simula sozinho a cada ~2 min. Nada a fazer aqui.</div>
      )}

      {aba === 'pre_aprovado' && profile?.role !== 'admin' && (
        <div style={s.filaHeader}>
          👤 Você vê os leads livres + os que você pegou. Depois de assumir, o lead é seu até registrar o desfecho — não volta pro pool.
        </div>
      )}

      {loading ? (
        <div style={s.loading}>Carregando...</div>
      ) : itens.length === 0 ? (
        <div style={s.empty}>{aba === 'pre_aprovado' ? 'Nenhum pré-aprovado aguardando contato.' : 'Nada aqui.'}</div>
      ) : (
        itens.map(item => {
          const jaAssumido = !!item.atribuido_a
          const meuLead = item.atribuido_a === profile?.id
          const tel = soDigitos(item.telefone)
          const vencido = aba === 'pre_aprovado' && jaAssumido && item.prazo_resolucao && new Date(item.prazo_resolucao) < new Date()
          return (
            <div key={item.id} style={{ ...s.card, ...(vencido ? s.cardVencido : {}) }}>
              <div style={s.cardHeader}>
                <div>
                  <div style={s.nome}>{item.nome || 'Sem nome'}</div>
                  <div style={s.meta}>CPF {fmtCpf(item.cpf)} · {item.telefone || 'sem telefone'} · {item.origem_ia || 'IA'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {aba === 'vendido'
                    ? <div style={s.valorBig}>{fmtBRL(item.valor_vendido)}</div>
                    : <div style={s.valorBig}>{fmtBRL(item.valor_simulado)}</div>}
                  {aba === 'pre_aprovado' && <div style={s.meta}>aprovado {tempoDesde(item.decidido_em || item.atualizado_em)}</div>}
                  {aba === 'vendido' && <div style={s.meta}>vendido {tempoDesde(item.vendido_em)}</div>}
                  {aba === 'nao_vendido' && item.motivo_nao_venda && <div style={s.meta}>{item.motivo_nao_venda}</div>}
                </div>
              </div>

              {aba === 'pre_aprovado' && (
                <>
                  {jaAssumido && (
                    <div style={{ ...s.donoTag, ...(vencido ? s.donoVencido : s.donoOk) }}>
                      {vencido ? '⏰ ' : '✓ '}
                      {meuLead ? 'Você' : (nomesProfiles[item.atribuido_a] || 'Alguém')} pegou {tempoDesde(item.atribuido_em)}
                      {vencido && ' · PRAZO VENCIDO, precisa resolver'}
                    </div>
                  )}
                  {desfechoAberto === item.id ? (
                    <div style={s.desfechoBox}>
                      <div style={s.desfechoTitulo}>Qual foi o desfecho?</div>
                      <input style={s.input} placeholder="Valor fechado (R$)" value={valorVenda} onChange={e => setValorVenda(e.target.value)} />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginBottom: 8 }}>
                        <button style={s.btnDesVendeu} onClick={() => marcarVendido(item)} disabled={salvando === item.id}>✅ Vendeu — registrar</button>
                      </div>
                      <select style={s.input} value={motivoNao} onChange={e => setMotivoNao(e.target.value)}>
                        <option value="">Se não fechou, escolha o motivo...</option>
                        {MOTIVOS_NAO_VENDA.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button style={s.btnDesNao} onClick={() => marcarNaoVendido(item)} disabled={salvando === item.id}>❌ Não fechou</button>
                        <button style={s.btnSec} onClick={() => marcarSemContato(item)} disabled={salvando === item.id}>Sem contato</button>
                        <button style={s.btnSec} onClick={() => setDesfechoAberto(null)}>Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div style={s.actions}>
                      {!jaAssumido && (
                        <button style={s.btnVender} onClick={() => assumir(item)} disabled={salvando === item.id}>
                          {salvando === item.id ? '...' : '📞 Assumir e contatar'}
                        </button>
                      )}
                      {jaAssumido && (
                        <button style={s.btnVender} onClick={() => abrirDesfecho(item.id)}>✍️ Registrar desfecho</button>
                      )}
                      {tel && <a style={s.btnWhats} href={`https://wa.me/55${tel}`} target="_blank" rel="noreferrer">💬 WhatsApp</a>}
                    </div>
                  )}
                </>
              )}

              {aba === 'vendido' && (
                <div style={{ fontSize: 12, color: '#25683b' }}>✅ Vendido por {nomesProfiles[item.atribuido_a] || 'vendedor'}</div>
              )}
              {aba === 'nao_vendido' && (
                <div style={{ fontSize: 12, color: '#888' }}>Fechado por {nomesProfiles[item.atribuido_a] || 'vendedor'} · {item.motivo_nao_venda || 'sem motivo'}</div>
              )}
              {aba === 'novo' && (
                <div style={{ fontSize: 13, color: '#185FA5', fontWeight: 500 }}>⏳ Na fila do robô</div>
              )}
              {aba === 'negado' && item.motivo_negado && (
                <div style={{ fontSize: 12, color: '#A32D2D', background: '#FCEBEB', borderRadius: 8, padding: '8px 10px' }}>Motivo: {item.motivo_negado}</div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
