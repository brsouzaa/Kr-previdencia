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

const s = {
  layout: { display: 'flex', minHeight: '100vh', background: '#f8f8f6' },
  sidebar: { width: 200, background: '#fff', borderRight: '0.5px solid rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', padding: '1.25rem 0', flexShrink: 0 },
  logo: { fontSize: 15, fontWeight: 600, color: '#111', padding: '0 1.25rem 1.25rem', borderBottom: '0.5px solid rgba(0,0,0,0.08)', marginBottom: '0.75rem', letterSpacing: '-0.3px' },
  logoBlue: { color: '#185FA5' },
  navItem: (active) => ({
    display: 'block', padding: '8px 1.25rem', fontSize: 13, color: active ? '#185FA5' : '#555',
    fontWeight: active ? 500 : 400, background: active ? '#E6F1FB' : 'transparent',
    borderLeft: active ? '2px solid #185FA5' : '2px solid transparent',
    cursor: 'pointer', textAlign: 'left', border: 'none', width: '100%',
  }),
  main: { flex: 1, padding: '1.5rem', overflowY: 'auto' },
  userBox: { marginTop: 'auto', padding: '1rem 1.25rem', borderTop: '0.5px solid rgba(0,0,0,0.08)' },
  userName: { fontSize: 13, fontWeight: 500, color: '#111', marginBottom: 2 },
  userRole: { fontSize: 11, color: '#888', marginBottom: 8 },
  logoutBtn: { fontSize: 12, color: '#A32D2D', background: 'none', border: 'none', cursor: 'pointer', padding: 0 },
}

export default function Layout({ children, page, setPage }) {
  const { profile, signOut } = useAuth()
  const nav = profile?.role === 'admin' ? NAV_ADMIN : NAV

  return (
    <div style={s.layout}>
      <div style={s.sidebar}>
        <div style={s.logo}>KR <span style={s.logoBlue}>Previdência</span></div>
        {nav.map(n => (
          <button key={n.key} style={s.navItem(page === n.key)} onClick={() => setPage(n.key)}>
            {n.label}
          </button>
        ))}
        <div style={s.userBox}>
          <div style={s.userName}>{profile?.nome}</div>
          <div style={s.userRole}>{profile?.role === 'admin' ? 'Administrador' : 'Vendedor'}</div>
          <button style={s.logoutBtn} onClick={signOut}>Sair</button>
        </div>
      </div>
      <div style={s.main}>{children}</div>
    </div>
  )
}
