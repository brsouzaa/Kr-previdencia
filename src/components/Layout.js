import { useState, useEffect } from 'react'
import { useAuth } from '../lib/AuthContext'

const NAV_PRODUTOR = [
  { key: 'contratos', label: '📄 Gerar contratos' },
]
const NAV_SUPERVISOR_PRODUCAO = [
  { key: 'supervisor_producao', label: '📊 Supervisão' },
  { key: 'contratos', label: '📄 Gerar contratos' },
]
const NAV_VENDEDOR = [
  { key: 'dashboard', label: '📊 Dashboard' },
  { key: 'advogados', label: 'Advogados' },
  { key: 'funil', label: 'Funil' },
  { key: 'compras', label: 'Histórico' },
  { key: 'fila', label: '📦 Fila de entregas' },
  { key: 'contratos', label: '📄 Gerar contratos' },
  { key: 'meulink', label: '🔗 Meu link' },
]
const NAV_ADMIN = [
  { key: 'dashboard', label: '📊 Dashboard' },
  { key: 'advogados', label: 'Advogados' },
  { key: 'funil', label: 'Funil' },
  { key: 'compras', label: 'Histórico' },
  { key: 'equipe', label: 'Equipe' },
  { key: 'fila', label: '📦 Fila de entregas' },
  { key: 'contratos', label: '📄 Gerar contratos' },
  { key: 'meulink', label: '🔗 Meu link' },
]

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

export default function Layout({ children, page, setPage }) {
  const { profile, signOut } = useAuth()
  const isMobile = useIsMobile()
  const [menuOpen, setMenuOpen] = useState(false)
  const nav = profile?.role === 'admin' ? NAV_ADMIN 
    : profile?.role === 'produtor' ? NAV_PRODUTOR
    : profile?.role === 'supervisor_producao' ? NAV_SUPERVISOR_PRODUCAO
    : NAV_VENDEDOR

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8f8f6' }}>

      {isMobile && menuOpen && (
        <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 299 }} />
      )}

      {(!isMobile || menuOpen) && (
        <div style={{
          width: 210, background: '#fff',
          borderRight: '0.5px solid rgba(0,0,0,0.1)',
          display: 'flex', flexDirection: 'column',
          padding: '1.25rem 0', flexShrink: 0,
          ...(isMobile ? { position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 300, boxShadow: '4px 0 20px rgba(0,0,0,0.15)' } : {})
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#111', padding: '0 1.25rem 1.25rem', borderBottom: '0.5px solid rgba(0,0,0,0.08)', marginBottom: '0.75rem' }}>
            KR <span style={{ color: '#185FA5' }}>Previdência</span>
          </div>
          {nav.map(n => (
            <button key={n.key} onClick={() => { setPage(n.key); setMenuOpen(false) }} style={{
              display: 'block', padding: '10px 1.25rem', fontSize: 13,
              color: page === n.key ? '#185FA5' : '#555',
              fontWeight: page === n.key ? 500 : 400,
              background: page === n.key ? '#E6F1FB' : 'transparent',
              cursor: 'pointer', textAlign: 'left',
              border: 'none', borderLeftWidth: 2, borderLeftStyle: 'solid',
              borderLeftColor: page === n.key ? '#185FA5' : 'transparent',
              width: '100%'
            }}>
              {n.label}
            </button>
          ))}
          <div style={{ marginTop: 'auto', padding: '1rem 1.25rem', borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#111', marginBottom: 2 }}>{profile?.nome}</div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>{profile?.role === 'admin' ? 'Administrador' : 'Vendedor'}</div>
            <button onClick={signOut} style={{ fontSize: 12, color: '#A32D2D', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Sair</button>
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {isMobile && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 56, background: '#fff', borderBottom: '0.5px solid rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1rem', zIndex: 100 }}>
            <button onClick={() => setMenuOpen(!menuOpen)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: '#111', padding: '4px 8px', lineHeight: 1 }}>☰</button>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111' }}>KR <span style={{ color: '#185FA5' }}>Previdência</span></div>
            <button onClick={signOut} style={{ fontSize: 12, color: '#A32D2D', background: 'none', border: 'none', cursor: 'pointer' }}>Sair</button>
          </div>
        )}
        <div style={{ padding: isMobile ? '1rem' : '1.5rem', paddingTop: isMobile ? '72px' : '1.5rem', overflowY: 'auto', flex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  )
}
