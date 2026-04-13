import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const COLS = [
  { key: 'verde', label: 'Ativos', sub: 'Compraram nos últimos 15 dias', hBg: '#EAF3DE', hColor: '#3B6D11', dot: '#3B6D11' },
  { key: 'amarelo', label: 'Atenção', sub: '16 a 30 dias sem comprar', hBg: '#FAEEDA', hColor: '#854F0B', dot: '#BA7517' },
  { key: 'vermelho', label: 'Críticos', sub: 'Mais de 30 dias sem comprar', hBg: '#FCEBEB', hColor: '#A32D2D', dot: '#A32D2D' },
]

const s = {
  title: { fontSize: 20, fontWeight: 500, color: '#111', marginBottom: '1.25rem', letterSpacing: '-0.3px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 },
  col: { border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, overflow: 'hidden', background: '#fff' },
  header: (c) => ({ padding: '12px 14px', background: c.hBg, borderBottom: '0.5px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', gap: 8 }),
  dot: (c) => ({ width: 8, height: 8, borderRadius: '50%', background: c.dot, flexShrink: 0 }),
  hLabel: (c) => ({ fontSize: 13, fontWeight: 500, color: c.hColor }),
  hCount: { fontSize: 12, color: 'inherit', opacity: 0.7, marginLeft: 2 },
  hSub: (c) => ({ fontSize: 11, color: c.hColor, opacity: 0.8 }),
  card: { padding: '10px 14px', borderBottom: '0.5px solid rgba(0,0,0,0.06)', cursor: 'pointer' },
  cardName: { fontSize: 13, fontWeight: 500, color: '#111' },
  cardSub: { fontSize: 11, color: '#888', marginTop: 2 },
  empty: { padding: '1.5rem', textAlign: 'center', fontSize: 13, color: '#aaa' },
  loading: { textAlign: 'center', padding: '3rem', color: '#888', fontSize: 14 },
}

export default function Funil() {
  const { profile } = useAuth()
  const [advogados, setAdvogados] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      let q = supabase.from('advogados').select('id, nome_completo, cidade, estado, total_compras, titulo, status, ultima_compra, profiles(nome)').order('ultima_compra', { ascending: false, nullsFirst: false })
      if (profile?.role !== 'admin') q = q.eq('vendedor_id', profile?.id)
      const { data } = await q
      setAdvogados(data || [])
      setLoading(false)
    }
    if (profile) fetch()
  }, [profile])

  if (loading) return <div style={s.loading}>Carregando...</div>

  return (
    <div>
      <div style={s.title}>Funil por status</div>
      <div style={s.grid}>
        {COLS.map(col => {
          const lista = advogados.filter(a => a.status === col.key)
          return (
            <div key={col.key} style={s.col}>
              <div style={s.header(col)}>
                <span style={s.dot(col)}></span>
                <div>
                  <div style={s.hLabel(col)}>{col.label} <span style={s.hCount}>({lista.length})</span></div>
                  <div style={s.hSub(col)}>{col.sub}</div>
                </div>
              </div>
              {lista.length === 0 ? (
                <div style={s.empty}>Nenhum</div>
              ) : (
                lista.map(a => (
                  <div key={a.id} style={s.card}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8f8f6'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <div style={s.cardName}>{a.nome_completo}</div>
                    <div style={s.cardSub}>
                      {profile?.role === 'admin' && a.profiles?.nome ? `${a.profiles.nome} · ` : ''}
                      {a.total_compras} compra{a.total_compras !== 1 ? 's' : ''}
                      {a.titulo ? ` · ${a.titulo}` : ''}
                    </div>
                  </div>
                ))
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
