import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import NovoAdvogado from '../components/NovoAdvogado'
import DetalheAdvogado from '../components/DetalheAdvogado'

const TITULOS_CLASS = {
  'Parceiro Bronze': { bg: '#FAECE7', color: '#993C1D' },
  'Parceiro Prata': { bg: '#D3D1C7', color: '#444441' },
  'Cliente Gold': { bg: '#FAEEDA', color: '#854F0B' },
  'Cliente Gold II': { bg: '#FAEEDA', color: '#854F0B' },
  'Cliente Platinum': { bg: '#E6F1FB', color: '#185FA5' },
  'Cliente Platinum II': { bg: '#E6F1FB', color: '#185FA5' },
  'Cliente Diamond': { bg: '#EEEDFE', color: '#3C3489' },
  'Cliente Diamond II': { bg: '#EEEDFE', color: '#3C3489' },
  'Cliente Black': { bg: '#2C2C2A', color: '#D3D1C7' },
}
const PROD_CLASS = {
  'Maternidade': { bg: '#E1F5EE', color: '#0F6E56' },
  'BPC': { bg: '#EEEDFE', color: '#534AB7' },
  'Auxilio Acidente': { bg: '#FAEEDA', color: '#854F0B' },
}
const STATUS = {
  verde: { bg: '#EAF3DE', color: '#3B6D11', label: 'Ativo' },
  amarelo: { bg: '#FAEEDA', color: '#854F0B', label: 'Atenção' },
  vermelho: { bg: '#FCEBEB', color: '#A32D2D', label: 'Crítico' },
}

const s = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' },
  title: { fontSize: 20, fontWeight: 500, color: '#111', letterSpacing: '-0.3px' },
  metrics: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 10, marginBottom: '1.25rem' },
  metric: { background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: '12px 14px' },
  metricLabel: { fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 },
  metricValue: { fontSize: 24, fontWeight: 500, color: '#111' },
  filters: { display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' },
  input: { flex: 1, minWidth: 160, padding: '8px 10px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 8, background: '#fff', color: '#111', outline: 'none' },
  select: { padding: '8px 10px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 8, background: '#fff', color: '#111', outline: 'none' },
  btnAdd: { padding: '8px 16px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  tableWrap: { background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, overflow: 'hidden' },
  th: { padding: '10px 12px', textAlign: 'left', fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500, background: '#f8f8f6', borderBottom: '0.5px solid rgba(0,0,0,0.08)' },
  td: { padding: '10px 12px', borderBottom: '0.5px solid rgba(0,0,0,0.06)', fontSize: 13, color: '#111', verticalAlign: 'middle' },
  badge: (st) => ({ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 20, fontSize: 12, fontWeight: 500, background: STATUS[st]?.bg || '#eee', color: STATUS[st]?.color || '#555' }),
  dot: (st) => ({ width: 7, height: 7, borderRadius: '50%', background: STATUS[st]?.color || '#888', display: 'inline-block' }),
  titleBadge: (t) => ({ padding: '2px 7px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: TITULOS_CLASS[t]?.bg || '#eee', color: TITULOS_CLASS[t]?.color || '#555', whiteSpace: 'nowrap' }),
  prodTag: (p) => ({ padding: '2px 6px', borderRadius: 4, fontSize: 11, marginRight: 3, background: PROD_CLASS[p]?.bg || '#eee', color: PROD_CLASS[p]?.color || '#555', display: 'inline-block' }),
  loading: { textAlign: 'center', padding: '3rem', color: '#888', fontSize: 14 },
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
    if (profile?.role !== 'admin' && profile?.role !== 'analista') q = q.eq('vendedor_id', profile?.id)
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
        <div style={s.metric}><div style={{ ...s.metricLabel, color: '#3B6D11' }}>Ativos</div><div style={{ ...s.metricValue, color: '#3B6D11' }}>{counts.verde}</div></div>
        <div style={s.metric}><div style={{ ...s.metricLabel, color: '#BA7517' }}>Atenção</div><div style={{ ...s.metricValue, color: '#BA7517' }}>{counts.amarelo}</div></div>
        <div style={s.metric}><div style={{ ...s.metricLabel, color: '#A32D2D' }}>Críticos</div><div style={{ ...s.metricValue, color: '#A32D2D' }}>{counts.vermelho}</div></div>
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
                {(profile?.role === 'admin' || profile?.role === 'analista') && <th style={{ ...s.th, width: '13%' }}>Vendedor</th>}
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
                  onMouseEnter={e => e.currentTarget.style.background = '#f8f8f6'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={s.td}>
                    <div style={{ fontWeight: 500 }}>{a.nome_completo}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>{a.cidade}</div>
                  </td>
                  <td style={{ ...s.td, fontSize: 12, color: '#888' }}>{a.oab}</td>
                  <td style={{ ...s.td, fontSize: 12 }}>{a.estado}</td>
                  {(profile?.role === 'admin' || profile?.role === 'analista') && <td style={{ ...s.td, fontSize: 12 }}>{a.profiles?.nome || '—'}</td>}
                  <td style={s.td}>
                    <span style={s.badge(a.status)}>
                      <span style={s.dot(a.status)}></span>
                      {STATUS[a.status]?.label}
                    </span>
                  </td>
                  <td style={s.td}>{a.titulo ? <span style={s.titleBadge(a.titulo)}>{a.titulo}</span> : '—'}</td>
                  <td style={s.td}>{(a.advogado_produtos || []).map(p => <span key={p.produto} style={s.prodTag(p.produto)}>{p.produto === 'Auxilio Acidente' ? 'Aux.' : p.produto}</span>)}</td>
                  <td style={{ ...s.td, fontWeight: 500, textAlign: 'center' }}>{a.total_compras}</td>
                  <td style={{ ...s.td, color: '#aaa', fontSize: 16 }}>›</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={(profile?.role === 'admin' || profile?.role === 'analista') ? 9 : 8} style={{ ...s.td, textAlign: 'center', color: '#aaa', padding: '2rem' }}>Nenhum advogado encontrado</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showNovo && <NovoAdvogado onClose={() => setShowNovo(false)} onSaved={() => { setShowNovo(false); fetch() }} />}
      {detalhe && <DetalheAdvogado advogado={detalhe} onClose={() => setDetalhe(null)} onUpdated={() => { setDetalhe(null); fetch() }} />}
    </div>
  )
}
