import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// 14/11/2026 (Bruno) — VERIFICACAO EM DUAS ETAPAS (2FA) para ADMIN.
// Depois da senha, o admin digita o codigo de 6 digitos do app autenticador
// (Google Authenticator, Microsoft Authenticator, Authy...).
// - 1a vez: mostra o QR code para cadastrar o app e pede o primeiro codigo.
// - Depois: so pede o codigo. A sessao sobe para nivel aal2 e fica valendo no aparelho.
// Usa o MFA nativo do Supabase (TOTP). O codigo nunca passa pelo nosso banco.
// Se a API de MFA der erro (ex.: recurso desligado no projeto), mostra o erro e deixa
// seguir SEM 2FA para o admin nao ficar trancado fora — a trava no banco so entra
// depois que o 2FA estiver cadastrado e funcionando.
export default function MfaAdmin({ onOk }) {
  const [modo, setModo] = useState('carregando') // carregando | desafio | cadastro | erro
  const [fatorId, setFatorId] = useState(null)
  const [qr, setQr] = useState(null)
  const [segredo, setSegredo] = useState(null)
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let vivo = true
    async function iniciar() {
      try {
        const { data: aal, error: eAal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
        if (eAal) throw eAal
        if (aal?.currentLevel === 'aal2') { onOk(); return }
        const { data: fs, error: eF } = await supabase.auth.mfa.listFactors()
        if (eF) throw eF
        const verificado = (fs?.totp || []).find(f => f.status === 'verified')
        if (verificado) {
          if (vivo) { setFatorId(verificado.id); setModo('desafio') }
          return
        }
        // cadastro abandonado antes: apaga o fator nao verificado e comeca de novo
        for (const f of (fs?.all || [])) {
          if (f.factor_type === 'totp' && f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id })
        }
        const { data: en, error: eE } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'KR admin ' + new Date().toISOString().slice(0, 16) })
        if (eE) throw eE
        if (vivo) { setFatorId(en.id); setQr(en.totp?.qr_code || null); setSegredo(en.totp?.secret || null); setModo('cadastro') }
      } catch (e) {
        if (vivo) { setErro(String(e?.message || e)); setModo('erro') }
      }
    }
    iniciar()
    return () => { vivo = false }
  }, [onOk])

  async function confirmar(e) {
    e?.preventDefault?.()
    const c = codigo.replace(/\D/g, '')
    if (c.length !== 6 || !fatorId) { setErro('Digite os 6 números que aparecem no app.'); return }
    setEnviando(true); setErro(null)
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fatorId, code: c })
    setEnviando(false)
    if (error) { setErro('Código inválido ou vencido. Confira a hora do celular e tente o código novo.'); setCodigo(''); return }
    onOk()
  }

  const caixa = { maxWidth: 420, width: '100%', background: '#fff', borderRadius: 14, padding: 28, boxShadow: '0 8px 30px rgba(0,0,0,.08)', fontFamily: 'system-ui, sans-serif', color: '#1b2430' }
  const botao = { width: '100%', padding: 13, border: 'none', borderRadius: 10, background: '#132A3E', color: '#fff', fontWeight: 700, fontSize: 15, cursor: enviando ? 'wait' : 'pointer', marginTop: 12 }
  const link = { background: 'none', border: 'none', color: '#5b6b84', textDecoration: 'underline', cursor: 'pointer', fontSize: 13, marginTop: 14 }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f8f6', padding: 16 }}>
      <div style={caixa}>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>🔐 Verificação em duas etapas</div>
        <div style={{ fontSize: 13, color: '#5b6b84', marginBottom: 18 }}>Acesso protegido</div>

        {modo === 'carregando' && <div style={{ fontSize: 14, color: '#888' }}>Carregando...</div>}

        {modo === 'cadastro' && (
          <>
            <div style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 12 }}>
              1. Abra o <b>Google Authenticator</b> (ou outro app autenticador) no celular.<br />
              2. Toque em <b>+</b> e leia o QR code abaixo.<br />
              3. Digite o código de 6 números que aparecer.
            </div>
            {qr && <div style={{ textAlign: 'center', margin: '8px 0 10px' }}><img src={qr} alt="QR code do autenticador" style={{ width: 200, height: 200 }} /></div>}
            {segredo && <div style={{ fontSize: 12, color: '#5b6b84', textAlign: 'center', wordBreak: 'break-all', marginBottom: 6 }}>Sem câmera? Digite a chave no app: <b style={{ userSelect: 'all' }}>{segredo}</b></div>}
          </>
        )}

        {modo === 'desafio' && (
          <div style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 6 }}>Digite o código de 6 números do seu app autenticador.</div>
        )}

        {(modo === 'cadastro' || modo === 'desafio') && (
          <form onSubmit={confirmar}>
            <input value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder="000000"
              style={{ width: '100%', padding: '12px 14px', fontSize: 24, letterSpacing: 8, textAlign: 'center', border: '1.5px solid #d6dbe3', borderRadius: 10, marginTop: 6 }} />
            <button type="submit" style={botao} disabled={enviando}>{enviando ? 'Conferindo...' : 'Entrar'}</button>
          </form>
        )}

        {modo === 'erro' && (
          <>
            <div style={{ fontSize: 13.5, background: '#FDF3D2', color: '#664D03', borderRadius: 10, padding: 12, lineHeight: 1.5 }}>
              Não foi possível iniciar a verificação em duas etapas: {erro}. Avise o suporte. Por enquanto o acesso segue sem o código.
            </div>
            <button style={botao} onClick={onOk}>Continuar</button>
          </>
        )}

        {erro && modo !== 'erro' && <div style={{ fontSize: 13, color: '#dc2626', marginTop: 10 }}>{erro}</div>}

        <div style={{ textAlign: 'center' }}>
          <button style={link} onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </div>
    </div>
  )
}
