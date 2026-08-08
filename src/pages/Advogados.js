import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import NovoAdvogado from '../components/NovoAdvogado'
import DetalheAdvogado from '../components/DetalheAdvogado'

const TITULOS_CLASS = {
  'Parceiro Bronze': { bg: 'rgba(248,113,113,.14)', color: '#fbbf24' },
  'Parceiro Prata': { bg: '#334766', color: '#c6d2e4' },
  'Cliente Gold': { bg: 'rgba(251,191,36,.12)', color: '#fbbf24' },
  'Cliente Gold II': { bg: 'rgba(251,191,36,.12)', color: '#fbbf24' },
  'Cliente Platinum': { bg: 'rgba(96,165,250,.12)', color: '#60a5fa' },
  'Cliente Platinum II': { bg: 'rgba(96,165,250,.12)', color: '#60a5fa' },
  'Cliente Diamond': { bg: 'rgba(167,139,250,.14)', color: '#a78bfa' },
  'Cliente Diamond II': { bg: 'rgba(167,139,250,.14)', color: '#a78bfa' },
  'Cliente Black': { bg: '#c6d2e4', color: '#334766' },
}
const PROD_CLASS = {
  'Maternidade': { bg: 'rgba(52,211,153,.14)', color: '#34d399' },
  'Gestante até 5 meses': { bg: 'rgba(96,165,250,.10)', color: '#60a5fa' },
  'BPC': { bg: 'rgba(167,139,250,.14)', color: '#a78bfa' },
  'Auxilio Acidente': { bg: 'rgba(251,191,36,.12)', color: '#fbbf24' },
}
const STATUS = {
  verde: { bg: 'rgba(52,211,153,.14)', color: '#34d399', label: 'Ativo' },
  amarelo: { bg: 'rgba(251,191,36,.12)', color: '#fbbf24', label: 'Atenção' },
  vermelho: { bg: 'rgba(248,113,113,.14)', color: '#f87171', label: 'Crítico' },
}

const s = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' },
  title: { fontSize: 20, fontWeight: 500, color: '#e6edf7', letterSpacing: '-0.3px' },
  metrics: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 10, marginBottom: '1.25rem' },
  metric: { background: '#232a37', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 14px' },
  metricLabel: { fontSize: 11, color: '#8b9bb4', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 },
  metricValue: { fontSize: 24, fontWeight: 500, color: '#e6edf7' },
  filters: { display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' },
  input: { flex: 1, minWidth: 160, padding: '8px 10px', fontSize: 13, border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 8, background: '#232a37', color: '#e6edf7', outline: 'none' },
  select: { padding: '8px 10px', fontSize: 13, border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 8, background: '#232a37', color: '#e6edf7', outline: 'none' },
  btnAdd: { padding: '8px 16px', background: '#60a5fa', color: '#232a37', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  tableWrap: { background: '#232a37', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' },
  th: { padding: '10px 12px', textAlign: 'left', fontSize: 11, color: '#8b9bb4', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500, background: '#171c26', borderBottom: '0.5px solid rgba(255,255,255,0.07)' },
  td: { padding: '10px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', fontSize: 13, color: '#e6edf7', verticalAlign: 'middle' },
  badge: (st) => ({ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 20, fontSize: 12, fontWeight: 500, background: STATUS[st]?.bg || '#2b3340', color: STATUS[st]?.color || '#8b9bb4' }),
  dot: (st) => ({ width: 7, height: 7, borderRadius: '50%', background: STATUS[st]?.color || '#8b9bb4', display: 'inline-block' }),
  titleBadge: (t) => ({ padding: '2px 7px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: TITULOS_CLASS[t]?.bg || '#2b3340', color: TITULOS_CLASS[t]?.color || '#8b9bb4', whiteSpace: 'nowrap' }),
  prodTag: (p) => ({ padding: '2px 6px', borderRadius: 4, fontSize: 11, marginRight: 3, background: PROD_CLASS[p]?.bg || '#2b3340', color: PROD_CLASS[p]?.color || '#8b9bb4', display: 'inline-block' }),
  loading: { textAlign: 'center', padding: '3rem', color: '#8b9bb4', fontSize: 14 },
}

export default function Advogados() {
  const { profile } = useAuth()
  const [advogados, setAdvogados] = useState([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroProduto, setFiltroProduto] = useState('')
  const [showNovo, setShowNovo] = useState(false)
  const [detalhe, setDetalhe] = useState(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('advogados').select(`*, profiles(nome), advogado_produtos(produto)`).order('updated_at', { ascending: false })
    if (profile?.role !== 'admin') q = q.eq('vendedor_id', profile?.id)
    if (filtroStatus) q = q.eq('status', filtroStatus)
    const { data } = await q
    setAdvogados(data || [])
    setLoading(false)
  }, [profile, filtroStatus])

  useEffect(() => { if (profile) fetch() }, [fetch, profile])

  const filtered = advogados.filter(a => {
    const q = busca.toLowerCase()
    const matchQ = !q || a.nome_completo.toLowerCase().includes(q) || a.oab.toLowerCase().includes(q) || a.cidade.toLowerCase().includes(q)
    const matchP = !filtroProduto || (a.advogado_produtos || []).some(p => p.produto === filtroProduto)
    return matchQ && matchP
  })

  const counts = { total: advogados.length, verde: advogados.filter(a => a.status === 'verde').length, amarelo: advogados.filter(a => a.status === 'amarelo').length, vermelho: advogados.filter(a => a.status === 'vermelho').length }

  return (
    <div>
      <div style={s.header}>
        <div style={s.title}>Advogados parceiros</div>
        <button style={s.btnAdd} onClick={() => setShowNovo(true)}>+ Novo advogado</button>
      </div>

      <div style={s.metrics}>
        <div style={s.metric}><div style={s.metricLabel}>Total</div><div style={s.metricValue}>{counts.total}</div></div>
        <div style={s.metric}><div style={{ ...s.metricLabel, color: '#34d399' }}>Ativos</div><div style={{ ...s.metricValue, color: '#34d399' }}>{counts.verde}</div></div>
        <div style={s.metric}><div style={{ ...s.metricLabel, color: '#fbbf24' }}>Atenção</div><div style={{ ...s.metricValue, color: '#fbbf24' }}>{counts.amarelo}</div></div>
        <div style={s.metric}><div style={{ ...s.metricLabel, color: '#f87171' }}>Críticos</div><div style={{ ...s.metricValue, color: '#f87171' }}>{counts.vermelho}</div></div>
      </div>

      <div style={s.filters}>
        <input style={s.input} placeholder="Buscar nome, OAB, cidade..." value={busca} onChange={e => setBusca(e.target.value)} />
        <select style={s.select} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="verde">Ativos</option>
          <option value="amarelo">Atenção</option>
          <option value="vermelho">Críticos</option>
        </select>
        <select style={s.select} value={filtroProduto} onChange={e => setFiltroProduto(e.target.value)}>
          <option value="">Todos os produtos</option>
          <option value="Maternidade">Maternidade</option>
          <option value="Gestante até 5 meses">Gestante até 5 meses</option>
          <option value="BPC">BPC</option>
          <option value="Auxilio Acidente">Auxílio Acidente</option>
        </select>
      </div>

      <div style={s.tableWrap}>
        {loading ? (
          <div style={s.loading}>Carregando...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ ...s.th, width: '22%' }}>Advogado</th>
                <th style={{ ...s.th, width: '10%' }}>OAB</th>
                <th style={{ ...s.th, width: '9%' }}>Estado</th>
                {profile?.role === 'admin' && <th style={{ ...s.th, width: '13%' }}>Vendedor</th>}
                <th style={{ ...s.th, width: '11%' }}>Status</th>
                <th style={{ ...s.th, width: '15%' }}>Título</th>
                <th style={{ ...s.th, width: '14%' }}>Produtos</th>
                <th style={{ ...s.th, width: '6%' }}>Compras</th>
                <th style={{ ...s.th, width: '4%' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.id} onClick={() => setDetalhe(a)} style={{ cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#171c26'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={s.td}>
                    <div style={{ fontWeight: 500 }}>{a.nome_completo}</div>
                    <div style={{ fontSize: 11, color: '#8b9bb4' }}>{a.cidade}</div>
                  </td>
                  <td style={{ ...s.td, fontSize: 12, color: '#8b9bb4' }}>{a.oab}</td>
                  <td style={{ ...s.td, fontSize: 12 }}>{a.estado}</td>
                  {profile?.role === 'admin' && <td style={{ ...s.td, fontSize: 12 }}>{a.profiles?.nome || '—'}</td>}
                  <td style={s.td}>
                    <span style={s.badge(a.status)}>
                      <span style={s.dot(a.status)}></span>
                      {STATUS[a.status]?.label}
                    </span>
                  </td>
                  <td style={s.td}>{a.titulo ? <span style={s.titleBadge(a.titulo)}>{a.titulo}</span> : '—'}</td>
                  <td style={s.td}>{(a.advogado_produtos || []).map(p => <span key={p.produto} style={s.prodTag(p.produto)}>{p.produto === 'Auxilio Acidente' ? 'Aux.' : p.produto}</span>)}</td>
                  <td style={{ ...s.td, fontWeight: 500, textAlign: 'center' }}>{a.total_compras}</td>
                  <td style={{ ...s.td, color: '#64748b', fontSize: 16 }}>›</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={profile?.role === 'admin' ? 9 : 8} style={{ ...s.td, textAlign: 'center', color: '#64748b', padding: '2rem' }}>Nenhum advogado encontrado</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showNovo && <NovoAdvogado onClose={() => setShowNovo(false)} onSaved={() => { setShowNovo(false); fetch() }} />}
      {detalhe && <DetalheAdvogado advogado={detalhe} onClose={() => setDetalhe(null)} onUpdated={() => { setDetalhe(null); fetch() }} />}
    </div>
  )
}
