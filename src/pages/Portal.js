import { useState } from 'react'
import { supabase } from '../lib/supabase'

const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

const s = {
  page: { minHeight: '100vh', background: '#f8f8f6', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem 1rem' },
  card: { background: '#fff', borderRadius: 16, padding: '2rem', width: '100%', maxWidth: 520, border: '0.5px solid rgba(0,0,0,0.1)' },
  logo: { fontSize: 22, fontWeight: 600, color: '#111', marginBottom: 4, letterSpacing: '-0.4px', textAlign: 'center' },
  logoBlue: { color: '#185FA5' },
  sub: { fontSize: 14, color: '#888', marginBottom: '2rem', textAlign: 'center' },
  sectionTitle: { fontSize: 11, fontWeight: 500, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '1.25rem 0 8px' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  label: { display: 'block', fontSize: 12, color: '#555', marginBottom: 4 },
  input: { width: '100%', padding: '10px 12px', fontSize: 14, border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 8, color: '#111', background: '#fff', outline: 'none', boxSizing: 'border-box' },
  select: { width: '100%', padding: '10px 12px', fontSize: 14, border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 8, color: '#111', background: '#fff', outline: 'none' },
  checkRow: { display: 'flex', gap: 10, alignItems: 'flex-start', margin: '1.25rem 0', padding: '12px', background: '#f8f8f6', borderRadius: 8 },
  btn: { width: '100%', marginTop: '1rem', padding: '13px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: 'pointer' },
  btnDisabled: { width: '100%', marginTop: '1rem', padding: '13px', background: '#aaa', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: 'not-allowed' },
  error: { marginTop: 10, padding: '10px 12px', background: '#FCEBEB', borderRadius: 8, fontSize: 13, color: '#A32D2D' },
  success: { textAlign: 'center', padding: '2rem' },
  successIcon: { fontSize: 48, marginBottom: 16 },
  successTitle: { fontSize: 20, fontWeight: 500, color: '#111', marginBottom: 8 },
  successSub: { fontSize: 14, color: '#888', lineHeight: 1.6 },
}

const INITIAL = { nome_completo: '', oab: '', estado: 'SP', cidade: '', telefone: '', email: '', estado_civil: 'Solteiro(a)', nacionalidade: 'Brasileira', endereco: '' }

export default function Portal({ vendedorId, vendedorNome }) {
  const [form, setForm] = useState(INITIAL)
  const [aceite, setAceite] = useState(false)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState(false)
  const [oabDuplicado, setOabDuplicado] = useState(false)

  function set(field, value) { setForm(f => ({ ...f, [field]: value })) }

  async function verificarOab(oab) {
    if (!oab || oab.length < 3) { setOabDuplicado(false); return }
    const { data } = await supabase.from('advogados').select('id').eq('oab', oab.trim()).maybeSingle()
    setOabDuplicado(!!data)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!aceite) { setErro('Você precisa aceitar os termos para continuar.'); return }
    if (oabDuplicado) { setErro('Este OAB já está cadastrado.'); return }
    setLoading(true)
    setErro('')

    const { error } = await supabase.from('advogados').insert({
      ...form,
      oab: form.oab.trim(),
      vendedor_id: vendedorId,
      total_compras: 0,
      status: 'vermelho',
    })

    if (error) {
      if (error.code === '23505') setErro('Este OAB já está cadastrado no sistema.')
      else setErro('Erro ao enviar cadastro. Tente novamente.')
      setLoading(false)
      return
    }

    setSucesso(true)
    setLoading(false)
  }

  if (sucesso) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={s.success}>
            <div style={s.successIcon}>✅</div>
            <div style={s.successTitle}>Cadastro recebido!</div>
            <div style={s.successSub}>
              Seus dados foram enviados com sucesso.<br /><br />
              <strong>Próximo passo:</strong> avise sua consultora pelo WhatsApp que você acabou de preencher o cadastro para agilizar o processo.
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logo}>KR <span style={s.logoBlue}>Previdência</span></div>
        <div style={s.sub}>Cadastro de advogado parceiro{vendedorNome ? ` · ${vendedorNome}` : ''}</div>

        <form onSubmit={handleSubmit}>
          <div style={s.sectionTitle}>Dados pessoais</div>
          <div style={s.grid}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={s.label}>Nome completo *</label>
              <input style={s.input} value={form.nome_completo} onChange={e => set('nome_completo', e.target.value)} required placeholder="Nome completo" />
            </div>
            <div>
              <label style={s.label}>OAB *</label>
              <input style={{ ...s.input, borderColor: oabDuplicado ? '#A32D2D' : 'rgba(0,0,0,0.2)' }} value={form.oab} onChange={e => { set('oab', e.target.value); setOabDuplicado(false) }} onBlur={e => verificarOab(e.target.value)} placeholder="SP-123456" required />
              {oabDuplicado && <div style={{ fontSize: 11, color: '#A32D2D', marginTop: 3 }}>OAB já cadastrado</div>}
            </div>
            <div>
              <label style={s.label}>Estado *</label>
              <select style={s.select} value={form.estado} onChange={e => set('estado', e.target.value)}>
                {ESTADOS.map(e => <option key={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>Cidade *</label>
              <input style={s.input} value={form.cidade} onChange={e => set('cidade', e.target.value)} required placeholder="Sua cidade" />
            </div>
            <div>
              <label style={s.label}>Estado civil</label>
              <select style={s.select} value={form.estado_civil} onChange={e => set('estado_civil', e.target.value)}>
                {['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União estável'].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>Nacionalidade</label>
              <input style={s.input} value={form.nacionalidade} onChange={e => set('nacionalidade', e.target.value)} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={s.label}>Endereço</label>
              <input style={s.input} value={form.endereco} onChange={e => set('endereco', e.target.value)} placeholder="Rua, número, bairro" />
            </div>
          </div>

          <div style={s.sectionTitle}>Contato</div>
          <div style={s.grid}>
            <div>
              <label style={s.label}>Telefone / WhatsApp *</label>
              <input style={s.input} value={form.telefone} onChange={e => set('telefone', e.target.value)} placeholder="(11) 99999-0000" required />
            </div>
            <div>
              <label style={s.label}>E-mail *</label>
              <input style={s.input} type="email" value={form.email} onChange={e => set('email', e.target.value)} required placeholder="seu@email.com" />
            </div>
          </div>

          <div style={s.checkRow}>
            <input type="checkbox" id="aceite" checked={aceite} onChange={e => setAceite(e.target.checked)} style={{ marginTop: 2, flexShrink: 0, width: 16, height: 16, cursor: 'pointer' }} />
            <label htmlFor="aceite" style={{ fontSize: 13, color: '#555', lineHeight: 1.5, cursor: 'pointer' }}>
              Declaro que as informações fornecidas são verdadeiras e autorizo a KR Previdência a entrar em contato para fins de parceria comercial.
            </label>
          </div>

          {erro && <div style={s.error}>{erro}</div>}

          <button style={aceite && !oabDuplicado && !loading ? s.btn : s.btnDisabled} type="submit" disabled={!aceite || oabDuplicado || loading}>
            {loading ? 'Enviando...' : 'Enviar cadastro'}
          </button>
        </form>
      </div>
    </div>
  )
}
