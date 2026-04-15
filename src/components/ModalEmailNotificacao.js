import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

export default function ModalEmailNotificacao({ onClose }) {
  const { profile } = useAuth()
  const [email, setEmail] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function salvar(e) {
    e.preventDefault()
    if (!email) return
    setSalvando(true)
    const { error } = await supabase.from('profiles').update({
      email_notificacao: email,
      notificacao_pendente: false,
    }).eq('id', profile.id)
    if (error) { setErro('Erro ao salvar. Tente novamente.'); setSalvando(false); return }
    onClose()
  }

  async function pularPorAgora() {
    await supabase.from('profiles').update({ notificacao_pendente: false }).eq('id', profile.id)
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '2rem', width: '100%', maxWidth: 420 }}>
        <div style={{ fontSize: 32, marginBottom: 12, textAlign: 'center' }}>📬</div>
        <div style={{ fontSize: 18, fontWeight: 500, color: '#111', marginBottom: 8, textAlign: 'center' }}>
          Cadastre seu e-mail de notificações
        </div>
        <div style={{ fontSize: 14, color: '#888', lineHeight: 1.6, marginBottom: '1.5rem', textAlign: 'center' }}>
          Receba alertas quando um novo advogado se cadastrar pelo seu link, quando um lote ficar inadimplente e quando um pagamento for confirmado.
        </div>

        <form onSubmit={salvar}>
          <label style={{ display: 'block', fontSize: 12, color: '#555', marginBottom: 4 }}>Seu e-mail pessoal</label>
          <input
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setErro('') }}
            placeholder="seu@email.com"
            required
            style={{ width: '100%', padding: '11px 12px', fontSize: 14, border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 8, color: '#111', background: '#fff', outline: 'none', boxSizing: 'border-box', marginBottom: 8 }}
          />
          {erro && <div style={{ fontSize: 12, color: '#A32D2D', marginBottom: 8 }}>{erro}</div>}

          <button type="submit" disabled={!email || salvando} style={{ width: '100%', padding: '12px', background: email && !salvando ? '#185FA5' : '#aaa', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: email && !salvando ? 'pointer' : 'not-allowed', marginBottom: 8 }}>
            {salvando ? 'Salvando...' : 'Salvar e-mail'}
          </button>
          <button type="button" onClick={pularPorAgora} style={{ width: '100%', padding: '10px', background: 'none', border: 'none', fontSize: 13, color: '#aaa', cursor: 'pointer' }}>
            Pular por agora
          </button>
        </form>
      </div>
    </div>
  )
}
