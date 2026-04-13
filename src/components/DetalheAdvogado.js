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

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

export default function Advogados() {
  const { profile } = useAuth()
  const isMobile = useIsMobile()
  const [advogados, setAdvogados] = useState([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroProduto, setFiltroProduto] = useState('')
  const [showNovo, setShowNovo] = useState(false)
  const [detalhe, setDetalhe] = useState(null)

  const fetch = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    let q = supabase.from('advogados').select(`
      id, nome_completo, oab, estado, cidade, telefone, email,
      estado_civil, endereco, nacionalidade,
      vendedor_id, total_compras, ultima_compra, status, titulo,
      created_at, updated_at,
      profiles!advogados_vendedor_id_fkey(nome),
      advogado_produtos(produto)
    `).order('updated_at', { ascending: false })
    if (profile.role !== 'admin') q = q.eq('vendedor_id', profile.id)
    if (filtroStatus) q = q.eq('status', filtroStatus)
    const { data } = await q
    setAdvogados(data || [])
    setLoading(false)
  }, [profile, filtroStatus])

  useEffect(() => { fetch() }, [fetch])

  const filtered = advogados.filter(a => {
    const q = busca.toLowerCase()
    const matchQ = !q || a.nome_completo?.toLowerCase().includes(q) || a.oab?.toLowerCase().includes(q) || a.cidade?.toLowerCase().includes(q)
    const matchP = !filtroProduto || (a.advogado_produtos || []).some(p => p.produto === filtroProduto)
    return matchQ && matchP
  })

  const counts = {
    total: advogados.length,
    verde: advogados.filter(a => a.status === 'verde').length,
    amarelo: advogados.filter(a => a.status === 'amarelo').length,
    vermelho: advogados.filter(a => a.status === 'vermelho').length,
  }

  const dotColor = { verde: '#3B6D11', amarelo: '#BA7517', vermelho: '#A32D2D' }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 500, color: '#111', letterSpacing: '-0.3px' }}>Advogados</div>
        <button onClick={() => setShowNovo(true)} style={{ padding: '8px 16px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>+ Novo</button>
      </div>

      {/* Métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, minmax(0,1fr))', gap: 10, marginBottom: '1.25rem' }}>
        {[['Total', counts.total, '#111'], ['Ativos', counts.verde, '#3B6D11'], ['Atenção', counts.amarelo, '#BA7517'], ['Críticos', counts.vermelho, '#A32D2D']].map(([l, v, c]) => (
          <div key={l} style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: c, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, opacity: 0.8 }}>{l}</div>
            <div style={{ fontSize: 24, fontWeight: 500, color: c }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, marginBottom: '1rem' }}>
        <input style={{ flex: 1, padding: '8px 10px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 8, background: '#fff', color: '#111', outline: 'none' }} placeholder="Buscar nome, OAB..." value={busca} onChange={e => setBusca(e.target.value)} />
        <select style={{ padding: '8px 10px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 8, background: '#fff', color: '#111', outline: 'none' }} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="verde">Ativos</option>
          <option value="amarelo">Atenção</option>
          <option value="vermelho">Críticos</option>
        </select>
        <select style={{ padding: '8px 10px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 8, background: '#fff', color: '#111', outline: 'none' }} value={filtroProduto} onChange={e => setFiltroProduto(e.target.value)}>
          <option value="">Todos produtos</option>
          <option value="Maternidade">Maternidade</option>
          <option value="BPC">BPC</option>
          <option value="Auxilio Acidente">Aux. Acidente</option>
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#888', fontSize: 14 }}>Carregando...</div>
      ) : isMobile ? (
        /* CARDS MOBILE */
        <div>
          {filtered.length === 0 && <div style={{ textAlign: 'center', color: '#aaa', fontSize: 13, padding: '2rem' }}>Nenhum advogado encontrado</div>}
          {filtered.map(a => (
            <div key={a.id} onClick={() => setDetalhe(a)} style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: '14px', marginBottom: 10, cursor: 'pointer', active: { background: '#f0f0f0' } }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ flex: 1, marginRight: 8 }}>
                  <div style={{ fontWeight: 500, fontSize: 14, color: '#111' }}>{a.nome_completo}</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{a.oab} · {a.cidade}, {a.estado}</div>
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: STATUS[a.status]?.bg, color: STATUS[a.status]?.color, flexShrink: 0 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor[a.status] }}></span>
                  {STATUS[a.status]?.label}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {(a.advogado_produtos || []).map(p => (
                    <span key={p.produto} style={{ padding: '2px 7px', borderRadius: 4, fontSize: 11, background: PROD_CLASS[p.produto]?.bg, color: PROD_CLASS[p.produto]?.color }}>
                      {p.produto === 'Auxilio Acidente' ? 'Aux.' : p.produto}
                    </span>
                  ))}
                  {a.titulo && (
                    <span style={{ padding: '2px 7px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: TITULOS_CLASS[a.titulo]?.bg, color: TITULOS_CLASS[a.titulo]?.color }}>
                      {a.titulo}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#888' }}>{a.total_compras} contrato{a.total_compras !== 1 ? 's' : ''}</div>
              </div>
              {profile?.role === 'admin' && <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>Vendedor: {a.profiles?.nome || '—'}</div>}
            </div>
          ))}
        </div>
      ) : (
        /* TABELA DESKTOP */
        <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500, background: '#f8f8f6', borderBottom: '0.5px solid rgba(0,0,0,0.08)', width: '22%' }}>Advogado</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500, background: '#f8f8f6', borderBottom: '0.5px solid rgba(0,0,0,0.08)', width: '10%' }}>OAB</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500, background: '#f8f8f6', borderBottom: '0.5px solid rgba(0,0,0,0.08)', width: '8%' }}>Estado</th>
                {profile?.role === 'admin' && <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500, background: '#f8f8f6', borderBottom: '0.5px solid rgba(0,0,0,0.08)', width: '12%' }}>Vendedor</th>}
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500, background: '#f8f8f6', borderBottom: '0.5px solid rgba(0,0,0,0.08)', width: '11%' }}>Status</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500, background: '#f8f8f6', borderBottom: '0.5px solid rgba(0,0,0,0.08)', width: '15%' }}>Título</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500, background: '#f8f8f6', borderBottom: '0.5px solid rgba(0,0,0,0.08)', width: '14%' }}>Produtos</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500, background: '#f8f8f6', borderBottom: '0.5px solid rgba(0,0,0,0.08)', width: '8%' }}>Contratos</th>
                <th style={{ padding: '10px 12px', background: '#f8f8f6', borderBottom: '0.5px solid rgba(0,0,0,0.08)', width: '4%' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.id} onClick={() => setDetalhe(a)} style={{ cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8f8f6'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={{ padding: '10px 12px', borderBottom: '0.5px solid rgba(0,0,0,0.06)', fontSize: 13 }}>
                    <div style={{ fontWeight: 500 }}>{a.nome_completo}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>{a.cidade}</div>
                  </td>
                  <td style={{ padding: '10px 12px', borderBottom: '0.5px solid rgba(0,0,0,0.06)', fontSize: 12, color: '#888' }}>{a.oab}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '0.5px solid rgba(0,0,0,0.06)', fontSize: 12 }}>{a.estado}</td>
                  {profile?.role === 'admin' && <td style={{ padding: '10px 12px', borderBottom: '0.5px solid rgba(0,0,0,0.06)', fontSize: 12 }}>{a.profiles?.nome || '—'}</td>}
                  <td style={{ padding: '10px 12px', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 20, fontSize: 12, fontWeight: 500, background: STATUS[a.status]?.bg, color: STATUS[a.status]?.color }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor[a.status] }}></span>
                      {STATUS[a.status]?.label}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
                    {a.titulo ? <span style={{ padding: '2px 7px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: TITULOS_CLASS[a.titulo]?.bg, color: TITULOS_CLASS[a.titulo]?.color, whiteSpace: 'nowrap' }}>{a.titulo}</span> : '—'}
                  </td>
                  <td style={{ padding: '10px 12px', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
                    {(a.advogado_produtos || []).map(p => <span key={p.produto} style={{ padding: '2px 6px', borderRadius: 4, fontSize: 11, marginRight: 3, background: PROD_CLASS[p.produto]?.bg, color: PROD_CLASS[p.produto]?.color, display: 'inline-block' }}>{p.produto === 'Auxilio Acidente' ? 'Aux.' : p.produto}</span>)}
                  </td>
                  <td style={{ padding: '10px 12px', borderBottom: '0.5px solid rgba(0,0,0,0.06)', fontWeight: 500, textAlign: 'center', fontSize: 13 }}>{a.total_compras}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '0.5px solid rgba(0,0,0,0.06)', color: '#aaa', fontSize: 16 }}>›</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={10} style={{ padding: '2rem', textAlign: 'center', color: '#aaa', fontSize: 13 }}>Nenhum advogado encontrado</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {showNovo && <NovoAdvogado onClose={() => setShowNovo(false)} onSaved={() => { setShowNovo(false); fetch() }} />}
      {detalhe && <DetalheAdvogado advogado={detalhe} onClose={() => setDetalhe(null)} onUpdated={() => { setDetalhe(null); fetch() }} />}
    </div>
  )
}
