import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

const s = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  modal: { background: '#fff', borderRadius: 16, padding: '1.75rem', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' },
  title: { fontSize: 16, fontWeight: 500, color: '#111' },
  closeBtn: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#888' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  label: { display: 'block', fontSize: 12, color: '#555', marginBottom: 4 },
  input: { width: '100%', padding: '9px 10px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 8, color: '#111', background: '#fff', outline: 'none' },
  select: { width: '100%', padding: '9px 10px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 8, color: '#111', background: '#fff', outline: 'none' },
  btnSave: { width: '100%', marginTop: '1.25rem', padding: '11px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' },
  error: { marginTop: 10, padding: '8px 12px', background: '#FCEBEB', borderRadius: 8, fontSize: 13, color: '#A32D2D' },
  sectionTitle: { fontSize: 12, fontWeight: 500, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '1rem 0 8px' },
}

const INITIAL = { nome_completo: '', oab: '', estado: 'SP', cidade: '', telefone: '', email: '', estado_civil: 'Solteiro(a)', nacionalidade: 'Brasileira', endereco: '' }

export default function NovoAdvogado({ onClose, onSaved }) {
  const { profile } = useAuth()
  const [form, setForm] = useState(INITIAL)
  const [vendedorId, setVendedorId] = useState(profile?.id || '')
  const [vendedores, setVendedores] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (profile?.role === 'admin') {
      supabase.from('profiles').select('id, nome').eq('role', 'vendedor').then(({ data }) => {
        setVendedores(data || [])
      })
    }
  }, [profile])

  function set(field, value) { setForm(f => ({ ...f, [field]: value })) }

  async function handleSave(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.from('advogados').insert({
      ...form,
      vendedor_id: profile?.role === 'admin' ? vendedorId : profile.id,
      total_compras: 0,
      status: 'vermelho',
    })
    if (error) { setError('Erro ao salvar: ' + error.message); setLoading(false); return }
    onSaved()
  }

  return (
    <div style={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={s.modal}>
        <div style={s.header}>
          <div style={s.title}>Cadastrar novo advogado</div>
          <button style={s.closeBtn} onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSave}>

          {profile?.role === 'admin' && (
            <div style={{ marginBottom: 12 }}>
              <div style={s.sectionTitle}>Vincular ao vendedor</div>
              <select style={s.select} value={vendedorId} onChange={e => setVendedorId(e.target.value)} required>
                <option value="">Selecione o vendedor</option>
                {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
              </select>
            </div>
          )}

          <div style={s.sectionTitle}>Dados pessoais</div>
          <div style={s.grid}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={s.label}>Nome completo *</label>
              <input style={s.input} value={form.nome_completo} onChange={e => set('nome_completo', e.target.value)} required />
            </div>
            <div>
              <label style={s.label}>OAB *</label>
              <input style={s.input} value={form.oab} onChange={e => set('oab', e.target.value)} placeholder="SP-123456" required />
            </div>
            <div>
              <label style={s.label}>Estado *</label>
              <select style={s.select} value={form.estado} onChange={e => set('estado', e.target.value)}>
                {ESTADOS.map(e => <option key={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>Cidade *</label>
              <input style={s.input} value={form.cidade} onChange={e => set('cidade', e.target.value)} required />
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
              <input style={s.input} value={form.endereco} onChange={e => set('endereco', e.target.value)} />
            </div>
          </div>

          <div style={s.sectionTitle}>Contato</div>
          <div style={s.grid}>
            <div>
              <label style={s.label}>Telefone *</label>
              <input style={s.input} value={form.telefone} onChange={e => set('telefone', e.target.value)} placeholder="(11) 99999-0000" required />
            </div>
            <div>
              <label style={s.label}>E-mail *</label>
              <input style={s.input} type="email" value={form.email} onChange={e => set('email', e.target.value)} required />
            </div>
          </div>

          {error && <div style={s.error}>{error}</div>}
          <button style={s.btnSave} type="submit" disabled={loading}>{loading ? 'Salvando...' : 'Cadastrar advogado'}</button>
        </form>
      </div>
    </div>
  )
}
