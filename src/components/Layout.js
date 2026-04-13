import { useState } from 'react'
import { useAuth } from '../lib/AuthContext'

const NAV = [
  { key: 'advogados', label: 'Advogados' },
  { key: 'funil', label: 'Funil' },
  { key: 'compras', label: 'Histórico' },
]
const NAV_ADMIN = [
  { key: 'advogados', label: 'Advogados' },
  { key: 'funil', label: 'Funil' },
  { key: 'compras', label: 'Histórico' },
  { key: 'equipe', label: 'Equipe' },
]

export default function Layout({ children, page, setPage }) {
  const { profile, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const nav = profile?.role === 'admin' ? NAV_ADMIN : NAV

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8f8f6' }}>
      <style>{`
        @media (max-width: 768px) {
          .sidebar { display: none !important; }
          .sidebar.open { display: flex !important; position: fixed; inset: 0; z-index: 300; width: 240px !important; box-shadow: 4px 0 20px rgba(0,0,0,0.15); }
          .topbar { display: flex !important; }
          .main-content { padding: 1rem !important; }
          .overlay { display: block !important; }
        }
        @media (min-width: 769px) {
          .topbar { display: none !important; }
          .sidebar { display: flex !important; }
          .overlay { display: none !important; }
        }
      `}</style>

      {/* Overlay mobile */}
      <div className="overlay" onClick={() => setMenuOpen(false)} style={{ display: 'none', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 299 }}></div>

      {/* Sidebar */}
      <div className={`sidebar${menuOpen ? ' open' : ''}`} style={{ width: 200, background: '#fff', borderRight: '0.5px solid rgba(0,0,0,0.1)', flexDirection: 'column', padding: '1.25rem 0', flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#111', padding: '0 1.25rem 1.25rem', borderBottom: '0.5px solid rgba(0,0,0,0.08)', marginBottom: '0.75rem', letterSpacing: '-0.3px' }}>
          KR <span style={{ color: '#185FA5' }}>Previdência</span>
        </div>
        {nav.map(n => (
          <button key={n.key} onClick={() => { setPage(n.key); setMenuOpen(false) }} style={{ display: 'block', padding: '10px 1.25rem', fontSize: 13, color: page === n.key ? '#185FA5' : '#555', fontWeight: page === n.key ? 500 : 400, background: page === n.key ? '#E6F1FB' : 'transparent', borderLeft: page === n.key ? '2px solid #185FA5' : '2px solid transparent', cursor: 'pointer', textAlign: 'left', border: 'none', width: '100%', borderLeftWidth: 2, borderLeftStyle: 'solid', borderLeftColor: page === n.key ? '#185FA5' : 'transparent' }}>
            {n.label}
          </button>
        ))}
        <div style={{ marginTop: 'auto', padding: '1rem 1.25rem', borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#111', marginBottom: 2 }}>{profile?.nome}</div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>{profile?.role === 'admin' ? 'Administrador' : 'Vendedor'}</div>
          <button onClick={signOut} style={{ fontSize: 12, color: '#A32D2D', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Sair</button>
        </div>
      </div>

      {/* Topbar mobile */}
      <div className="topbar" style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 56, background: '#fff', borderBottom: '0.5px solid rgba(0,0,0,0.1)', alignItems: 'center', justifyContent: 'space-between', padding: '0 1rem', zIndex: 100 }}>
        <button onClick={() => setMenuOpen(!menuOpen)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: '#111', padding: '4px 8px' }}>☰</button>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#111' }}>KR <span style={{ color: '#185FA5' }}>Previdência</span></div>
        <button onClick={signOut} style={{ fontSize: 12, color: '#A32D2D', background: 'none', border: 'none', cursor: 'pointer' }}>Sair</button>
      </div>

      {/* Conteúdo */}
      <div className="main-content" style={{ flex: 1, padding: '1.5rem', overflowY: 'auto', marginTop: 0 }}>
        <div style={{ paddingTop: 0 }} className="content-wrapper">
          {children}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .content-wrapper { padding-top: 56px !important; }
        }
      `}</style>
    </div>
  )
}
