import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const STATUS_STYLE = {
  verde: { bg: '#EAF3DE', color: '#3B6D11', label: 'Ativo' },
  amarelo: { bg: '#FAEEDA', color: '#854F0B', label: 'Atenção' },
  vermelho: { bg: '#FCEBEB', color: '#A32D2D', label: 'Crítico' },
}
const TITULO_STYLE = {
  'Parceiro Bronze': { bg: '#FAECE7', color: '#993C1D' },
  'Parceiro Prata': { bg: '#D3D1C7', color: '#444441' },
  'Cliente Gold': { bg: '#FAEEDA', color: '#854F0B' },
  'Cliente Gold II': { bg: '#FAEEDA', color: '#854F0B' },
  'Cliente Platinum': { bg: '#E6F1FB', color: '#185FA5' },
  'Cliente Platinum II': { bg: '#E6F1FB', color: '#185FA5' },
  'Cliente Diamond': { bg: '#EEEDFE', color: '#3C3489' },
  'Cliente Diamond II': { bg: '#EEEDFE', color: '#3C3489' },
  'Cliente Black': { bg: '#2C2C2A', color: '#D3D1C7' },
}
const PROD_STYLE = {
  'Maternidade': { bg: '#E1F5EE', color: '#0F6E56' },
  'BPC': { bg: '#EEEDFE', color: '#534AB7' },
  'Auxilio Acidente': { bg: '#FAEEDA', color: '#854F0B' },
}
const PAG_STYLE = {
  pendente: { bg: '#FAEEDA', color: '#854F0B', label: 'Pendente' },
  pago: { bg: '#EAF3DE', color: '#3B6D11', label: 'Pago' },
  inadimplente: { bg: '#FCEBEB', color: '#A32D2D', label: 'Inadimplente' },
}
const TITULOS = ['','Parceiro Bronze','Parceiro Prata','Cliente Gold','Cliente Gold II','Cliente Platinum','Cliente Platinum II','Cliente Diamond','Cliente Diamond II','Cliente Black']
const PRODUTOS = ['Maternidade', 'BPC', 'Auxilio Acidente']
const VALOR_CONTRATO = 299

const s = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' },
  panel: { background: '#fff', height: '100vh', overflowY: 'auto', padding: '1.5rem', borderLeft: '0.5px solid rgba(0,0,0,0.1)' },
  closeBtn: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#888', float: 'right' },
  name: { fontSize: 18, fontWeight: 500, color: '#111', marginBottom: 3, marginTop: '1.5rem' },
  sub: { fontSize: 13, color: '#888', marginBottom: 14 },
  badges: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
  badge: (style) => ({ padding: '3px 9px', borderRadius: 20, fontSize: 12, fontWeight: 500, ...style }),
  section: { marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '0.5px solid rgba(0,0,0,0.08)' },
  sectionTitle: { fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10, fontWeight: 500 },
  row: { display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 },
  rowLabel: { color: '#888' },
  rowValue: { fontWeight: 500, color: '#111' },
  compraBox: { background: '#f8f8f6', borderRadius: 10, padding: '1rem', marginTop: '1rem' },
  label: { fontSize: 12, color: '#555', marginBottom: 4, display: 'block', marginTop: 10 },
  input: { width: '100%', padding: '9px 10px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 8, background: '#fff', color: '#111', outline: 'none' },
  btnSave: { width: '100%', marginTop: 12, padding: '10px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  btnDisabled: { width: '100%', marginTop: 12, padding: '10px', background: '#aaa', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'not-allowed' },
  qtyRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
  qtyLabel: { fontSize: 13, flex: 1, color: '#333' },
  qtyBtn: { width: 32, height: 32, borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.2)', background: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#185FA5', fontWeight: 500, flexShrink: 0 },
  qtyValue: { fontSize: 16, fontWeight: 500, minWidth: 28, textAlign: 'center', color: '#111' },
}

function ModalComprovante({ lote, onClose, onConfirm }) {
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
    if (upErr) { setErro('Erro ao enviar arquivo: ' + upErr.message); setUploading(false); return }
    const { data: urlData } = supabase.storage.from('comprovantes').getPublicUrl(path)
    await onConfirm(lote.id, path, arquivo.name, urlData?.publicUrl)
    setUploading(false)
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '1.5rem', width: '100%', maxWidth: 400 }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: '#111', marginBottom: 4 }}>Comprovante de pagamento</div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: '1.25rem' }}>
          Lote de {lote.total_contratos} contrato{lote.total_contratos !== 1 ? 's' : ''} · R$ {Number(lote.valor_total).toLocaleString('pt-BR')} · {lote.data_compra}
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

export default function DetalheAdvogado({ advogado, onClose, onUpdated }) {
  const { profile } = useAuth()
  const [compras, setCompras] = useState([])
  const [lotes, setLotes] = useState([])
  const [qtds, setQtds] = useState({ 'Maternidade': 0, 'BPC': 0, 'Auxilio Acidente': 0 })
  const [dataCompra, setDataCompra] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [adv, setAdv] = useState(advogado)
  const [modalLote, setModalLote] = useState(null)

  useEffect(() => { fetchTudo() }, [advogado.id])

  async function fetchTudo() {
    const [{ data: c }, { data: l }] = await Promise.all([
      supabase.from('compras').select('*').eq('advogado_id', advogado.id).order('data_compra', { ascending: false }),
      supabase.from('lotes').select('*, profiles(nome)').eq('advogado_id', advogado.id).order('data_compra', { ascending: false }),
    ])
    setCompras(c || [])
    setLotes(l || [])
    const { data: a } = await supabase.from('advogados').select('*').eq('id', advogado.id).single()
    if (a) setAdv(a)
  }

  function ajustarQtd(produto, delta) {
    setQtds(q => ({ ...q, [produto]: Math.max(0, (q[produto] || 0) + delta) }))
  }

  const totalLote = Object.values(qtds).reduce((a, b) => a + b, 0)
  const valorLote = totalLote * VALOR_CONTRATO

  async function registrarLote() {
    if (totalLote === 0) return
    setSaving(true)
    const inserir = []
    for (const [produto, qtd] of Object.entries(qtds)) {
      for (let i = 0; i < qtd; i++) {
        inserir.push({ advogado_id: adv.id, produto, vendedor_id: profile.id, data_compra: dataCompra })
      }
    }
    await supabase.from('compras').insert(inserir)
    const loteExistente = lotes.find(l => l.data_compra === dataCompra)
    if (loteExistente) {
      await supabase.from('lotes').update({
        total_contratos: loteExistente.total_contratos + totalLote,
        valor_total: (loteExistente.total_contratos + totalLote) * VALOR_CONTRATO,
        updated_at: new Date().toISOString(),
      }).eq('id', loteExistente.id)
    } else {
      await supabase.from('lotes').insert({
        advogado_id: adv.id, vendedor_id: profile.id, data_compra: dataCompra,
        total_contratos: totalLote, valor_total: valorLote, status_pagamento: 'pendente',
      })
    }
    setQtds({ 'Maternidade': 0, 'BPC': 0, 'Auxilio Acidente': 0 })
    await fetchTudo()
    setSaving(false)
  }

  async function confirmarPagamento(loteId, path, nome, url) {
    await supabase.from('lotes').update({
      status_pagamento: 'pago',
      data_pagamento: new Date().toISOString().slice(0, 10),
      comprovante_url: path,
      comprovante_nome: nome,
      updated_at: new Date().toISOString(),
    }).eq('id', loteId)
    await fetchTudo()
  }

  async function verComprovante(lote) {
    if (!lote.comprovante_url) return
    const { data } = await supabase.storage.from('comprovantes').createSignedUrl(lote.comprovante_url, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function marcarInadimplente(loteId) {
    await supabase.from('lotes').update({ status_pagamento: 'inadimplente', updated_at: new Date().toISOString() }).eq('id', loteId)
    await fetchTudo()
  }

  async function desfazerPagamento(loteId) {
    await supabase.from('lotes').update({ status_pagamento: 'pendente', data_pagamento: null, comprovante_url: null, comprovante_nome: null, updated_at: new Date().toISOString() }).eq('id', loteId)
    await fetchTudo()
  }

  async function excluirLote(lote) {
    if (!window.confirm(`Excluir lote de ${lote.total_contratos} contratos do dia ${lote.data_compra}?`)) return
    const ids = compras.filter(c => c.data_compra === lote.data_compra).map(c => c.id)
    if (ids.length > 0) await supabase.from('compras').delete().in('id', ids)
    if (lote.comprovante_url) await supabase.storage.from('comprovantes').remove([lote.comprovante_url])
    await supabase.from('lotes').delete().eq('id', lote.id)
    const { data: restantes } = await supabase.from('compras').select('data_compra').eq('advogado_id', adv.id).order('data_compra', { ascending: false })
    await supabase.from('advogados').update({ total_compras: restantes?.length || 0, ultima_compra: restantes?.[0]?.data_compra || null }).eq('id', adv.id)
    await fetchTudo()
  }

  const contagemProduto = compras.reduce((acc, c) => { acc[c.produto] = (acc[c.produto] || 0) + 1; return acc }, {})
  const comprasPorData = compras.reduce((acc, c) => { const d = c.data_compra; if (!acc[d]) acc[d] = {}; acc[d][c.produto] = (acc[d][c.produto] || 0) + 1; return acc }, {})
  const st = STATUS_STYLE[adv.status] || STATUS_STYLE.vermelho
  const t = Math.min(adv.total_compras, 9)
  const ts = TITULO_STYLE[adv.titulo]
  const proximoTitulo = t < 9 ? TITULOS[t + 1] : null
  const diasUltimaCompra = adv.ultima_compra ? Math.floor((Date.now() - new Date(adv.ultima_compra)) / 86400000) : null
  const totalPago = lotes.filter(l => l.status_pagamento === 'pago').reduce((s, l) => s + Number(l.valor_total), 0)
  const totalPendente = lotes.filter(l => l.status_pagamento === 'pendente').reduce((s, l) => s + Number(l.valor_total), 0)
  const totalInadimplente = lotes.filter(l => l.status_pagamento === 'inadimplente').reduce((s, l) => s + Number(l.valor_total), 0)
  const fmt = v => `R$ ${Number(v).toLocaleString('pt-BR')}`

  return (
    <div style={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...s.panel, width: 'min(420px, 100vw)' }}>
        <button style={s.closeBtn} onClick={onClose}>×</button>
        <div style={s.name}>{adv.nome_completo}</div>
        <div style={s.sub}>{adv.oab} · {adv.cidade}, {adv.estado}</div>
        <div style={s.badges}>
          <span style={s.badge({ background: st.bg, color: st.color })}>{st.label}</span>
          {adv.titulo && ts && <span style={s.badge({ background: ts.bg, color: ts.color })}>{adv.titulo}</span>}
        </div>

        {/* Desempenho */}
        <div style={s.section}>
          <div style={s.sectionTitle}>Desempenho</div>
          <div style={s.row}><span style={s.rowLabel}>Total de contratos</span><span style={s.rowValue}>{adv.total_compras}</span></div>
          <div style={s.row}><span style={s.rowLabel}>Última compra</span><span style={s.rowValue}>{diasUltimaCompra !== null ? `${diasUltimaCompra} dias atrás` : 'Nenhuma'}</span></div>
          {proximoTitulo && <div style={s.row}><span style={s.rowLabel}>Próximo título</span><span style={{ ...s.rowValue, color: '#185FA5' }}>{proximoTitulo}</span></div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {PRODUTOS.map(p => {
              const qtd = contagemProduto[p] || 0
              return (
                <div key={p} style={{ background: PROD_STYLE[p]?.bg, borderRadius: 8, padding: '8px 12px', textAlign: 'center', flex: 1, opacity: qtd === 0 ? 0.35 : 1 }}>
                  <div style={{ fontSize: 22, fontWeight: 500, color: PROD_STYLE[p]?.color }}>{qtd}</div>
                  <div style={{ fontSize: 10, color: PROD_STYLE[p]?.color, marginTop: 2 }}>{p === 'Auxilio Acidente' ? 'Aux.' : p}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Financeiro */}
        <div style={s.section}>
          <div style={s.sectionTitle}>Financeiro</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[['Pago', totalPago, '#3B6D11', '#EAF3DE'], ['Pendente', totalPendente, '#854F0B', '#FAEEDA'], ['Inadimp.', totalInadimplente, '#A32D2D', '#FCEBEB']].map(([l, v, c, bg]) => (
              <div key={l} style={{ background: bg, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: c, opacity: 0.8, marginBottom: 3 }}>{l}</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: c }}>{fmt(v)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Contato */}
        <div style={s.section}>
          <div style={s.sectionTitle}>Contato</div>
          <div style={s.row}><span style={s.rowLabel}>Telefone</span><span style={s.rowValue}>{adv.telefone}</span></div>
          <div style={s.row}><span style={s.rowLabel}>E-mail</span><span style={{ ...s.rowValue, color: '#185FA5', fontSize: 12 }}>{adv.email}</span></div>
        </div>

        {/* Registrar lote */}
        <div style={s.section}>
          <div style={s.sectionTitle}>Registrar lote</div>
          <div style={s.compraBox}>
            {PRODUTOS.map(p => (
              <div key={p} style={s.qtyRow}>
                <div style={s.qtyLabel}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: PROD_STYLE[p]?.color, marginRight: 6 }}></span>
                  {p === 'Auxilio Acidente' ? 'Aux. Acidente' : p}
                </div>
                <button style={s.qtyBtn} onClick={() => ajustarQtd(p, -1)} type="button">−</button>
                <div style={s.qtyValue}>{qtds[p]}</div>
                <button style={s.qtyBtn} onClick={() => ajustarQtd(p, 1)} type="button">+</button>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 12, paddingTop: 10, borderTop: '0.5px solid rgba(0,0,0,0.1)' }}>
              <span style={{ color: '#888' }}>Total · Valor</span>
              <span style={{ fontWeight: 500 }}>{totalLote} contrato{totalLote !== 1 ? 's' : ''} · {fmt(valorLote)}</span>
            </div>
            <label style={{ ...s.label, marginTop: 14 }}>Data da venda</label>
            <input style={s.input} type="date" value={dataCompra} onChange={e => setDataCompra(e.target.value)} />
            <button style={totalLote === 0 || saving ? s.btnDisabled : s.btnSave} onClick={registrarLote} disabled={totalLote === 0 || saving}>
              {saving ? 'Salvando...' : `Registrar ${totalLote > 0 ? `${totalLote} contrato${totalLote !== 1 ? 's' : ''} · ${fmt(valorLote)}` : 'lote'}`}
            </button>
          </div>
        </div>

        {/* Lotes */}
        {lotes.length > 0 && (
          <div style={s.section}>
            <div style={s.sectionTitle}>Lotes de compra</div>
            {lotes.map(lote => {
              const ps = PAG_STYLE[lote.status_pagamento] || PAG_STYLE.pendente
              const prodsDoLote = comprasPorData[lote.data_compra] || {}
              return (
                <div key={lote.id} style={{ border: `0.5px solid ${ps.color}30`, borderRadius: 10, padding: 12, marginBottom: 12, background: ps.bg + '40' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{lote.data_compra}</div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{lote.total_contratos} contrato{lote.total_contratos !== 1 ? 's' : ''} · {fmt(lote.valor_total)}</div>
                    </div>
                    <span style={{ padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: ps.bg, color: ps.color, flexShrink: 0 }}>{ps.label}</span>
                  </div>

                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
                    {Object.entries(prodsDoLote).map(([prod, qtd]) => (
                      <span key={prod} style={{ padding: '2px 7px', borderRadius: 4, fontSize: 11, background: PROD_STYLE[prod]?.bg, color: PROD_STYLE[prod]?.color }}>
                        {qtd}x {prod === 'Auxilio Acidente' ? 'Aux.' : prod}
                      </span>
                    ))}
                  </div>

                  {/* Comprovante se pago */}
                  {lote.status_pagamento === 'pago' && (
                    <div style={{ fontSize: 11, color: '#3B6D11', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>✓ Pago em {lote.data_pagamento}</span>
                      {lote.comprovante_url && (
                        <button onClick={() => verComprovante(lote)} style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: 11, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                          Ver comprovante
                        </button>
                      )}
                    </div>
                  )}

                  {/* Ações */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    {lote.status_pagamento !== 'pago' && (
                      <button onClick={() => setModalLote(lote)} style={{ flex: 1, padding: '7px', background: '#EAF3DE', color: '#3B6D11', border: '0.5px solid #3B6D11', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                        📎 Pago + comprovante
                      </button>
                    )}
                    {lote.status_pagamento === 'pago' && (
                      <button onClick={() => desfazerPagamento(lote.id)} style={{ flex: 1, padding: '7px', background: '#f0f0ee', color: '#888', border: '0.5px solid #ccc', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>
                        Desfazer
                      </button>
                    )}
                    {lote.status_pagamento === 'pendente' && (
                      <button onClick={() => marcarInadimplente(lote.id)} style={{ padding: '7px 10px', background: '#FCEBEB', color: '#A32D2D', border: '0.5px solid #A32D2D', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>
                        Inadimp.
                      </button>
                    )}
                    <button onClick={() => excluirLote(lote)} style={{ padding: '7px 10px', background: 'none', color: '#ccc', border: '0.5px solid #ddd', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>
                      Excluir
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modalLote && (
        <ModalComprovante
          lote={modalLote}
          onClose={() => setModalLote(null)}
          onConfirm={confirmarPagamento}
        />
      )}
    </div>
  )
}
