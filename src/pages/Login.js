import { useState } from 'react'
import { useAuth } from '../lib/AuthContext'

const s = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#171c26' },
  card: { background: '#232a37', border: '0.5px solid rgba(255,255,255,0.09)', borderRadius: 16, padding: '2.5rem 2rem', width: '100%', maxWidth: 380 },
  logo: { fontSize: 20, fontWeight: 600, color: '#e6edf7', marginBottom: 6, letterSpacing: '-0.4px' },
  logoSpan: { color: '#60a5fa' },
  sub: { fontSize: 13, color: '#8b9bb4', marginBottom: '2rem' },
  label: { display: 'block', fontSize: 12, color: '#8b9bb4', marginBottom: 5, marginTop: 16 },
  input: { width: '100%', padding: '10px 12px', fontSize: 14, border: '0.5px solid rgba(0,0,0,0.45)', borderRadius: 8, outline: 'none', background: '#232a37', color: '#e6edf7' },
  btn: { width: '100%', marginTop: '1.5rem', padding: '11px', background: '#60a5fa', color: '#232a37', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer', letterSpacing: '0.2px' },
  error: { marginTop: 12, padding: '10px 12px', background: 'rgba(248,113,113,.14)', borderRadius: 8, fontSize: 13, color: '#f87171' },
}

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await signIn(email, password)
    if (error) setError('E-mail ou senha incorretos.')
    setLoading(false)
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logo}>KR <span style={s.logoSpan}>Previdência</span></div>
        <div style={s.sub}>Acesse o painel de gestão de advogados</div>
        <form onSubmit={handleSubmit}>
          <label style={s.label}>E-mail</label>
          <input style={s.input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" required />
          <label style={s.label}>Senha</label>
          <input style={s.input} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
          {error && <div style={s.error}>{error}</div>}
          <button style={s.btn} type="submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
