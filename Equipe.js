import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const s = {
  title: { fontSize: 20, fontWeight: 500, color: '#111', marginBottom: '1.25rem', letterSpacing: '-0.3px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 },
  card: { background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: '1.25rem' },
  avatar: { width: 44, height: 44, borderRadius: '50%', background: '#E6F1FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 500, fontSize: 15, color: '#185FA5', marginBottom: 10 },
  name: { fontSize: 15, fontWeight: 500, color: '#111', marginBottom: 3 },
  email: { fontSize: 12, color: '#888', marginBottom: 14 },
  stats: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
  stat: { background: '#f8f8f6', borderRadius: 8, padding: '8px 10px' },
  statLabel: { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 3 },
  statValue: { fontSize: 18, fontWeight: 500, color: '#111' },
  loading: { textAlign: 'center', padding: '3rem', color: '#888', fontSize: 14 },
}

export default function Equipe() {
  const [vendedores, setVendedores] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      const { data: profiles } = await supabase.from('profiles').select('*').eq('role', 'vendedor')
      if (!profiles) { setLoading(false); return }

      const withStats = await Promise.all(profiles.map(async v => {
        const { count: total } = await supabase.from('advogados').select('*', { count: 'exact', head: true }).eq('vendedor_id', v.id)
        const { count: verde } = await supabase.from('advogados').select('*', { count: 'exact', head: true }).eq('vendedor_id', v.id).eq('status', 'verde')
        const { count: compras } = await supabase.from('compras').select('*', { count: 'exact', head: true }).eq('vendedor_id', v.id)
        return { ...v, total: total || 0, ativos: verde || 0, compras: compras || 0 }
      }))
      setVendedores(withStats)
      setLoading(false)
    }
    fetch()
  }, [])

  if (loading) return <div style={s.loading}>Carregando...</div>

  return (
    <div>
      <div style={s.title}>Equipe de vendas</div>
      <div style={s.grid}>
        {vendedores.map(v => {
          const initials = v.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
          return (
            <div key={v.id} style={s.card}>
              <div style={s.avatar}>{initials}</div>
              <div style={s.name}>{v.nome}</div>
              <div style={s.email}>{v.email}</div>
              <div style={s.stats}>
                <div style={s.stat}><div style={s.statLabel}>Advogados</div><div style={s.statValue}>{v.total}</div></div>
                <div style={s.stat}><div style={{ ...s.statLabel, color: '#3B6D11' }}>Ativos</div><div style={{ ...s.statValue, color: '#3B6D11' }}>{v.ativos}</div></div>
                <div style={s.stat}><div style={s.statLabel}>Vendas</div><div style={s.statValue}>{v.compras}</div></div>
              </div>
            </div>
          )
        })}
        {vendedores.length === 0 && <div style={{ color: '#aaa', fontSize: 14 }}>Nenhum vendedor cadastrado ainda</div>}
      </div>
    </div>
  )
}
