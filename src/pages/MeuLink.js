import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../lib/AuthContext'

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

export default function MeuLink() {
  const { profile } = useAuth()
  const isMobile = useIsMobile()
  const [copiado, setCopiado] = useState(false)
  const qrRef = useRef()

  const baseUrl = window.location.origin
  const link = `${baseUrl}/cadastro/${profile?.id}`

  function copiarLink() {
    navigator.clipboard.writeText(link)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2500)
  }

  function abrirWhatsApp() {
    const msg = encodeURIComponent(`Olá! Para se cadastrar como advogado parceiro da KR Previdência, acesse o link abaixo e preencha seus dados:\n\n${link}`)
    window.open(`https://wa.me/?text=${msg}`, '_blank')
  }

  const card = { background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 14, padding: '1.5rem', marginBottom: 14 }

  return (
    <div>
      <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 500, color: '#111', marginBottom: 6, letterSpacing: '-0.3px' }}>Meu link de cadastro</div>
      <div style={{ fontSize: 13, color: '#888', marginBottom: '1.5rem' }}>Compartilhe com advogados para que se cadastrem diretamente no sistema</div>

      {/* Link */}
      <div style={card}>
        <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Seu link</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, padding: '10px 14px', background: '#f8f8f6', borderRadius: 8, fontSize: 13, color: '#185FA5', wordBreak: 'break-all', border: '0.5px solid rgba(0,0,0,0.08)' }}>
            {link}
          </div>
          <button onClick={copiarLink} style={{ padding: '10px 16px', background: copiado ? '#EAF3DE' : '#185FA5', color: copiado ? '#3B6D11' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', flexShrink: 0, transition: 'all 0.2s' }}>
            {copiado ? '✓ Copiado!' : 'Copiar'}
          </button>
        </div>
      </div>

      {/* Ações */}
      <div style={card}>
        <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 14 }}>Compartilhar</div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
          <button onClick={abrirWhatsApp} style={{ padding: '13px', background: '#EAF3DE', color: '#3B6D11', border: '0.5px solid #3B6D11', borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>💬</span> Enviar pelo WhatsApp
          </button>
          <button onClick={copiarLink} style={{ padding: '13px', background: '#E6F1FB', color: '#185FA5', border: '0.5px solid #185FA5', borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>🔗</span> {copiado ? 'Link copiado!' : 'Copiar link'}
          </button>
        </div>
      </div>

      {/* QR Code */}
      <div style={card}>
        <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 14 }}>QR Code</div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div ref={qrRef} id="qrcode-container" style={{ padding: 16, background: '#fff', borderRadius: 12, border: '0.5px solid rgba(0,0,0,0.1)', display: 'inline-block' }}>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(link)}&bgcolor=ffffff&color=0d0d0d&margin=0`}
              alt="QR Code do seu link de cadastro"
              width={200}
              height={200}
              style={{ display: 'block', borderRadius: 8 }}
            />
          </div>
          <div style={{ fontSize: 12, color: '#888', textAlign: 'center' }}>
            O advogado escaneia o QR Code com a câmera do celular e abre o formulário de cadastro
          </div>
          <a
            href={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(link)}&bgcolor=ffffff&color=0d0d0d&margin=10`}
            download="qrcode-kr-previdencia.png"
            target="_blank"
            rel="noreferrer"
            style={{ padding: '9px 18px', background: '#f0f0ee', color: '#555', border: '0.5px solid #ccc', borderRadius: 8, fontSize: 13, textDecoration: 'none', cursor: 'pointer' }}
          >
            Baixar QR Code
          </a>
        </div>
      </div>

      {/* Preview */}
      <div style={{ ...card, background: '#f8f8f6', border: '0.5px dashed rgba(0,0,0,0.15)' }}>
        <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Prévia do formulário</div>
        <div style={{ fontSize: 13, color: '#555', lineHeight: 1.6 }}>
          O advogado vai ver um formulário simples com:<br />
          nome, OAB, estado, cidade, telefone, e-mail, endereço e estado civil.<br />
          Ao enviar, o cadastro aparece automaticamente na sua lista de advogados.
        </div>
        <a href={link} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 12, padding: '8px 14px', background: '#185FA5', color: '#fff', borderRadius: 8, fontSize: 13, textDecoration: 'none', fontWeight: 500 }}>
          Ver formulário →
        </a>
      </div>
    </div>
  )
}
