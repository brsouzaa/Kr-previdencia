import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const PROD_STYLE = {
  'Maternidade': { bg: 'rgba(52,211,153,.14)', color: '#059669' },
  'BPC': { bg: 'rgba(167,139,250,.14)', color: '#7c3aed' },
  'Auxilio Acidente': { bg: 'rgba(251,191,36,.12)', color: '#b45309' },
}

const s = {
  title: { fontSize: 20, fontWeight: 500, color: '#0f172a', marginBottom: '1.25rem', letterSpacing: '-0.3px' },
  metrics: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10, marginBottom: '1.25rem' },
  metric: { background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 10, padding: '12px 14px' },
  metricLabel: { fontSize: 11, color: '#5b6b84', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 },
  metricValue: { fontSize: 24, fontWeight: 500, color: '#0f172a' },
  tableWrap: { background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 12, overflow: 'hidden' },
  th: { padding: '10px 12px', textAlign: 'left', fontSize: 11, color: '#5b6b84', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500, background: '#f2f5fa', borderBottom: '0.5px solid rgba(15,23,42,0.07)' },
  td: { padding: '10px 12px', borderBottom: '0.5px solid rgba(15,23,42,0.06)', fontSize: 13, color: '#0f172a' },
  tag: (p) => ({ padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 500, background: PROD_STYLE[p]?.bg || '#e2e8f0', color: PROD_STYLE[p]?.color || '#5b6b84', display: 'inline-block' }),
  loading: { textAlign: 'center', padding: '3rem', color: '#5b6b84', fontSize: 14 },
}

export default function Compras() {
  const { profile } = useAuth()
  const [compras, setCompras] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      let q = supabase.from('compras').select('*, advogados(nome_completo, oab), profiles(nome)').order('data_compra', { ascending: false })
      if (profile?.role !== 'admin') q = q.eq('vendedor_id', profile?.id)
      const { data } = await q
      setCompras(data || [])
      setLoading(false)
    }
    if (profile) fetch()
  }, [profile])

  const counts = {
    total: compras.length,
    mat: compras.filter(c => c.produto === 'Maternidade').length,
    bpc: compras.filter(c => c.produto === 'BPC').length,
    aux: compras.filter(c => c.produto === 'Auxilio Acidente').length,
  }

  return (
    <div>
      <div style={s.title}>Histórico de compras</div>
      <div style={s.metrics}>
        <div style={s.metric}><div style={s.metricLabel}>Total</div><div style={s.metricValue}>{counts.total}</div></div>
        <div style={s.metric}><div style={{ ...s.metricLabel, color: '#059669' }}>Maternidade</div><div style={{ ...s.metricValue, color: '#059669' }}>{counts.mat}</div></div>
        <div style={s.metric}><div style={{ ...s.metricLabel, color: '#7c3aed' }}>BPC</div><div style={{ ...s.metricValue, color: '#7c3aed' }}>{counts.bpc}</div></div>
      </div>

      <div style={s.tableWrap}>
        {loading ? <div style={s.loading}>Carregando...</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ ...s.th, width: '30%' }}>Advogado</th>
                {profile?.role === 'admin' && <th style={{ ...s.th, width: '20%' }}>Vendedor</th>}
                <th style={{ ...s.th, width: '20%' }}>Produto</th>
                <th style={{ ...s.th, width: '15%' }}>Data</th>
              </tr>
            </thead>
            <tbody>
              {compras.map(c => (
                <tr key={c.id}>
                  <td style={s.td}>
                    <div style={{ fontWeight: 500 }}>{c.advogados?.nome_completo}</div>
                    <div style={{ fontSize: 11, color: '#5b6b84' }}>{c.advogados?.oab}</div>
                  </td>
                  {profile?.role === 'admin' && <td style={{ ...s.td, fontSize: 12, color: '#5b6b84' }}>{c.profiles?.nome}</td>}
                  <td style={s.td}><span style={s.tag(c.produto)}>{c.produto}</span></td>
                  <td style={{ ...s.td, color: '#5b6b84', fontSize: 12 }}>{c.data_compra}</td>
                </tr>
              ))}
              {compras.length === 0 && <tr><td colSpan={profile?.role === 'admin' ? 4 : 3} style={{ ...s.td, textAlign: 'center', color: '#64748b', padding: '2rem' }}>Nenhuma compra registrada</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
