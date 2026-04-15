import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

export default function ModalComprovante({ lote, onClose, onConfirm }) {
  const [arquivo, setArquivo] = useState(null)
  const [preview, setPreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [erro, setErro] = useState('')
  const inputRef = useRef()

  function selecionarArquivo(e) {
    const f = e.target.files[0]
    if (!f) return
    if (f.size > 10 * 1024 * 1024) { setErro('Arquivo muito grande. Máximo 10MB.'); return }
    setArquivo(f)
    setErro('')
    if (f.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = ev => setPreview(ev.target.result)
      reader.readAsDataURL(f)
    } else {
      setPreview('pdf')
    }
  }

  async function confirmar() {
    if (!arquivo) { setErro('Selecione o comprovante antes de confirmar.'); return }
    setUploading(true)
    setErro('')
    const ext = arquivo.name.split('.').pop()
    const path = `lote_${lote.id}_${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('comprovantes').upload(path, arquivo, { upsert: true })
    if (upErr) { setErro('Erro ao enviar: ' + upErr.message); setUploading(false); return }
    await onConfirm(lote.id, path, arquivo.name)
    setUploading(false)
    onClose()
  }

  const fmt = v => `R$ ${Number(v).toLocaleString('pt-BR')}`

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '1.5rem', width: '100%', maxWidth: 400 }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: '#111', marginBottom: 4 }}>Comprovante de pagamento</div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: '1.25rem' }}>
          {lote.total_contratos} contrato{lote.total_contratos !== 1 ? 's' : ''} · {fmt(lote.valor_total)} · {lote.data_compra}
        </div>

        <input ref={inputRef} type="file" accept="image/*,.pdf" onChange={selecionarArquivo} style={{ display: 'none' }} />

        {!arquivo ? (
          <div onClick={() => inputRef.current.click()} style={{ border: '1.5px dashed rgba(0,0,0,0.2)', borderRadius: 10, padding: '2rem', textAlign: 'center', cursor: 'pointer', background: '#f8f8f6' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📎</div>
            <div style={{ fontSize: 13, color: '#555', fontWeight: 500 }}>Clique para selecionar</div>
            <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>JPG, PNG, PDF — máx. 10MB</div>
          </div>
        ) : (
          <div style={{ border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 10, overflow: 'hidden', marginBottom: 4 }}>
            {preview === 'pdf' ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', background: '#f8f8f6' }}>
                <div style={{ fontSize: 32, marginBottom: 6 }}>📄</div>
                <div style={{ fontSize: 13, color: '#111', fontWeight: 500 }}>{arquivo.name}</div>
              </div>
            ) : (
              <img src={preview} alt="Comprovante" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', background: '#f8f8f6' }} />
            )}
            <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#888' }}>{arquivo.name}</span>
              <button onClick={() => { setArquivo(null); setPreview(null) }} style={{ background: 'none', border: 'none', color: '#A32D2D', fontSize: 12, cursor: 'pointer' }}>Remover</button>
            </div>
          </div>
        )}

        {erro && <div style={{ marginTop: 8, fontSize: 12, color: '#A32D2D', padding: '6px 10px', background: '#FCEBEB', borderRadius: 6 }}>{erro}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: '1.25rem' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', background: 'none', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#555' }}>Cancelar</button>
          <button onClick={confirmar} disabled={uploading || !arquivo} style={{ flex: 1, padding: '10px', background: arquivo && !uploading ? '#3B6D11' : '#aaa', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: arquivo && !uploading ? 'pointer' : 'not-allowed' }}>
            {uploading ? 'Enviando...' : '✓ Confirmar pagamento'}
          </button>
        </div>
      </div>
    </div>
  )
}
