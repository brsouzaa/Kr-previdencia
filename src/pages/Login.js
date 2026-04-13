import { useState } from 'react'
import { useAuth } from '../lib/AuthContext'

const s = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f8f6' },
  card: { background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 16, padding: '2.5rem 2rem', width: '100%', maxWidth: 380 },
  logo: { fontSize: 20, fontWeight: 600, color: '#111', marginBottom: 6, letterSpacing: '-0.4px' },
  logoSpan: { color: '#185FA5' },
  sub: { fontSize: 13, color: '#666', marginBottom: '2rem' },
  label: { display: 'block', fontSize: 12, color: '#555', marginBottom: 5, marginTop: 16 },
  input: { width: '100%', padding: '10px 12px', fontSize: 14, border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 8, outline: 'none', background: '#fff', color: '#111' },
  btn: { width: '100%', marginTop: '1.5rem', padding: '11px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer', letterSpacing: '0.2px' },
  error: { marginTop: 12, padding: '10px 12px', background: '#FCEBEB', borderRadius: 8, fontSize: 13, color: '#A32D2D' },
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
