import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Componente de upload pra um único documento.
// Faz upload no bucket "documentos-clientes" e retorna a URL pública.
// Props:
//   - label: texto do label (ex: "RG Frente")
//   - obrigatorio: bool (mostra asterisco)
//   - valorInicial: URL atual (se já tem upload)
//   - clienteId: id do cliente (usado pra nomear o arquivo)
//   - chave: chave do tipo de documento (ex: 'rg_frente')
//   - somentePdf: exige PDF (CTPS digital e extrato FGTS — 31/08)
//   - onChange: callback(url|null)
// 03/11 (Bruno): mostra o tamanho do arquivo anexado e recusa arquivo vazio (0 KB).
const fmtTam = (b) => (b == null ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`)
const VAZIO_MSG = 'O arquivo chegou VAZIO (0 KB). Salve o arquivo de novo no computador (área de trabalho), confira se abre e anexe outra vez.'
async function tamanhoNoServidor(url) {
  try { const r = await fetch(url, { method: 'HEAD', cache: 'no-store' }); const n = r.headers.get('content-length'); return n == null ? null : Number(n) }
  catch (_e) { return null }
}

export default function UploadDocumento({ label, obrigatorio, valorInicial, clienteId, chave, somentePdf, onChange }) {
  const [url, setUrl] = useState(valorInicial || null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState(null)
  const [tamanho, setTamanho] = useState(null)

  // anexo que ja veio salvo (rascunho / edicao): busca o tamanho no servidor
  useEffect(() => {
    let vivo = true
    if (url && tamanho == null) tamanhoNoServidor(url).then(n => { if (vivo) setTamanho(n) })
    return () => { vivo = false }
  }, [url, tamanho])

  async function fazerUpload(file) {
    setErro(null)
    if (!file) return

    if (!file.size) {
      setErro(VAZIO_MSG)
      return
    }

    // Valida tamanho (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setErro('Arquivo muito grande (máx 10MB)')
      return
    }

    // Valida tipo. CTPS digital e extrato FGTS TÊM que ser PDF: são documentos
    // baixados de app (gov.br / FGTS) e print de tela não serve para o advogado —
    // ele precisa do arquivo original, com as páginas e a assinatura digital.
    // Checa o nome também: alguns navegadores mandam file.type vazio.
    const ehPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')
    if (somentePdf) {
      if (!ehPdf) {
        setErro('Este documento tem que ser o PDF baixado do aplicativo — print ou foto não vale.')
        return
      }
    } else {
      const tiposPermitidos = ['image/jpeg','image/jpg','image/png','image/webp','application/pdf']
      if (!tiposPermitidos.includes(file.type) && !ehPdf) {
        setErro('Use JPG, PNG ou PDF')
        return
      }
    }

    setEnviando(true)
    try {
      const ext = file.name.split('.').pop().toLowerCase()
      const nomeArquivo = `${clienteId || 'temp'}/${chave}_${Date.now()}.${ext}`

      const { error: errUp } = await supabase.storage
        .from('documentos-clientes')
        .upload(nomeArquivo, file, { upsert: true, contentType: file.type })

      if (errUp) throw errUp

      const { data: pub } = supabase.storage
        .from('documentos-clientes')
        .getPublicUrl(nomeArquivo)

      // confere o que REALMENTE ficou no servidor: se chegou vazio, nao aceita o anexo
      const noServidor = await tamanhoNoServidor(pub.publicUrl)
      if (noServidor === 0) {
        setErro(VAZIO_MSG)
        setEnviando(false)
        return
      }
      setTamanho(noServidor ?? file.size)
      setUrl(pub.publicUrl)
      onChange?.(pub.publicUrl)
    } catch (err) {
      setErro('Erro ao enviar: ' + (err.message || 'tente de novo'))
    }
    setEnviando(false)
  }

  function remover() {
    setUrl(null)
    setTamanho(null)
    onChange?.(null)
  }

  const tem = !!url

  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12, color: '#5b6b84', marginBottom: 6 }}>
        {label} {obrigatorio && <span style={{ color: '#dc2626' }}>*</span>}
      </label>

      {!tem ? (
        <label style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '14px', border: `1.5px dashed ${erro ? '#f87171' : 'rgba(0,0,0,0.45)'}`,
          borderRadius: 8, cursor: enviando ? 'wait' : 'pointer',
          background: erro ? 'rgba(248,113,113,.14)' : '#f1f5f9',
          fontSize: 13, color: erro ? '#dc2626' : '#5b6b84',
          minHeight: 50,
        }}>
          {enviando ? (
            <span>⏳ Enviando...</span>
          ) : (
            <span>📎 Clique para anexar {somentePdf ? '(somente PDF)' : '(JPG, PNG ou PDF)'}</span>
          )}
          <input type="file"
            accept={somentePdf ? 'application/pdf,.pdf' : 'image/jpeg,image/jpg,image/png,image/webp,application/pdf'}
            disabled={enviando}
            onChange={e => fazerUpload(e.target.files?.[0])}
            style={{ display: 'none' }} />
        </label>
      ) : (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 12px', border: '0.5px solid #3B6D1140',
          background: 'rgba(52,211,153,.14)', borderRadius: 8,
        }}>
          <a href={url} target="_blank" rel="noreferrer"
            style={{ flex: 1, fontSize: 12, color: '#059669', textDecoration: 'underline', wordBreak: 'break-all' }}>
            ✓ Anexado — clique pra ver
          </a>
          {tamanho != null && (
            <span style={{ fontSize: 12, color: tamanho ? '#5b6b84' : '#dc2626', fontWeight: tamanho ? 400 : 700, whiteSpace: 'nowrap' }}>
              {tamanho ? fmtTam(tamanho) : 'VAZIO (0 KB) — troque'}
            </span>
          )}
          <button onClick={remover} type="button"
            style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, padding: '4px 8px', textDecoration: 'underline' }}>
            trocar
          </button>
        </div>
      )}

      {erro && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{erro}</div>}
    </div>
  )
}
