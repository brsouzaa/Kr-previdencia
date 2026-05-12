import { useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

const s = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f8f6', padding: 20 },
  card: { background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 16, padding: '2.5rem 2rem', width: '100%', maxWidth: 460 },
  logo: { fontSize: 20, fontWeight: 600, color: '#111', marginBottom: 6, letterSpacing: '-0.4px' },
  logoSpan: { color: '#185FA5' },
  title: { fontSize: 16, fontWeight: 600, color: '#111', marginBottom: 6, marginTop: 8 },
  sub: { fontSize: 13, color: '#666', marginBottom: '1.5rem' },
  label: { display: 'block', fontSize: 12, color: '#555', marginBottom: 5, marginTop: 16 },
  input: { width: '100%', padding: '10px 12px', fontSize: 14, border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 8, outline: 'none', background: '#fff', color: '#111', boxSizing: 'border-box' },
  hint: { fontSize: 11, color: '#888', marginTop: 4 },
  btn: { width: '100%', marginTop: '1.5rem', padding: '11px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer', letterSpacing: '0.2px' },
  btnSecondary: { width: '100%', marginTop: 8, padding: '10px', background: 'transparent', color: '#888', border: 'none', borderRadius: 8, fontSize: 12, cursor: 'pointer' },
  error: { marginTop: 12, padding: '10px 12px', background: '#FCEBEB', borderRadius: 8, fontSize: 13, color: '#A32D2D' },
  success: { marginTop: 12, padding: '10px 12px', background: '#EAF3DE', borderRadius: 8, fontSize: 13, color: '#3B6D11' },
}

export default function PrimeiroAcesso() {
  const { profile, signOut, refreshProfile } = useAuth()
  const [nome, setNome] = useState(profile?.nome || '')
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    // Validações
    const nomeTrim = nome.trim()
    if (nomeTrim.length < 3) return setError('Nome muito curto (mínimo 3 caracteres).')
    if (nomeTrim.split(' ').length < 2) return setError('Digite nome e sobrenome.')
    if (senha.length < 6) return setError('Senha deve ter no mínimo 6 caracteres.')
    if (senha === 'kr2026') return setError('Escolha uma senha diferente da senha temporária.')
    if (senha !== senha2) return setError('As senhas não conferem.')

    setLoading(true)
    try {
      // 1. Atualiza a senha no auth
      const { error: errAuth } = await supabase.auth.updateUser({ password: senha })
      if (errAuth) throw errAuth

      // 2. Atualiza nome + marca senha_temporaria como false
      const { error: errProfile } = await supabase
        .from('profiles')
        .update({
          nome: nomeTrim,
          senha_temporaria: false
        })
        .eq('id', profile.id)
      if (errProfile) throw errProfile

      setSuccess('✓ Cadastro concluído! Redirecionando...')

      // 3. Atualiza o profile no AuthContext (recarrega do banco)
      if (refreshProfile) {
        await refreshProfile()
      } else {
        // Fallback: reload da página
        setTimeout(() => window.location.reload(), 1000)
      }
    } catch (err) {
      setError(err.message || 'Erro ao atualizar dados. Tente novamente.')
    }
    setLoading(false)
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logo}>KR <span style={s.logoSpan}>Previdência</span></div>
        <div style={s.title}>👋 Bem-vinda(o) ao sistema!</div>
        <div style={s.sub}>
          Antes de começar, preencha seu nome completo e crie uma senha pessoal segura.
          Isso é feito apenas uma vez.
        </div>

        <form onSubmit={handleSubmit}>
          <label style={s.label}>Nome completo</label>
          <input
            style={s.input}
            type="text"
            value={nome}
            onChange={e => setNome(e.target.value)}
            placeholder="Ex: Maria da Silva"
            required
            autoFocus
          />
          <div style={s.hint}>Digite seu nome e sobrenome completos</div>

          <label style={s.label}>Crie sua nova senha</label>
          <input
            style={s.input}
            type="password"
            value={senha}
            onChange={e => setSenha(e.target.value)}
            placeholder="Mínimo 6 caracteres"
            required
            minLength={6}
          />
          <div style={s.hint}>Use letras, números e algo difícil de adivinhar</div>

          <label style={s.label}>Confirme a senha</label>
          <input
            style={s.input}
            type="password"
            value={senha2}
            onChange={e => setSenha2(e.target.value)}
            placeholder="Digite novamente"
            required
            minLength={6}
          />

          {error && <div style={s.error}>{error}</div>}
          {success && <div style={s.success}>{success}</div>}

          <button style={s.btn} type="submit" disabled={loading}>
            {loading ? 'Salvando...' : 'Concluir cadastro'}
          </button>
          <button style={s.btnSecondary} type="button" onClick={signOut}>
            Sair
          </button>
        </form>
      </div>
    </div>
  )
}
