import { useState, useEffect } from 'react'
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
const TITULOS = ['', 'Parceiro Bronze', 'Parceiro Prata', 'Cliente Gold', 'Cliente Gold II', 'Cliente Platinum', 'Cliente Platinum II', 'Cliente Diamond', 'Cliente Diamond II', 'Cliente Black']

const s = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' },
  panel: { width: 380, background: '#fff', height: '100vh', overflowY: 'auto', padding: '1.5rem', borderLeft: '0.5px solid rgba(0,0,0,0.1)' },
  closeBtn: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#888', float: 'right' },
  name: { fontSize: 18, fontWeight: 500, color: '#111', marginBottom: 3, marginTop: '1.5rem', letterSpacing: '-0.3px' },
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
  select: { width: '100%', padding: '9px 10px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 8, background: '#fff', color: '#111', outline: 'none' },
  input: { width: '100%', padding: '9px 10px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 8, background: '#fff', color: '#111', outline: 'none' },
  btnSave: { width: '100%', marginTop: 12, padding: '10px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  tlItem: { display: 'flex', gap: 10, marginBottom: 12 },
  tlDot: { width: 8, height: 8, borderRadius: '50%', background: '#185FA5', marginTop: 4, flexShrink: 0 },
  tlText: { fontSize: 13, color: '#111' },
  tlDate: { fontSize: 11, color: '#888' },
  prodTag: (p) => ({ padding: '2px 7px', borderRadius: 4, fontSize: 12, marginRight: 4, display: 'inline-block', background: PROD_STYLE[p]?.bg || '#eee', color: PROD_STYLE[p]?.color || '#555' }),
}

export default function DetalheAdvogado({ advogado, onClose, onUpdated }) {
  const { profile } = useAuth()
  const [compras, setCompras] = useState([])
  const [produtos, setProdutos] = useState([])
  const [produto, setProduto] = useState('Maternidade')
  const [dataCompra, setDataCompra] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [adv, setAdv] = useState(advogado)

  useEffect(() => {
    fetchCompras()
    fetchProdutos()
  }, [advogado.id])

  async function fetchCompras() {
    const { data } = await supabase.from('compras').select('*').eq('advogado_id', advogado.id).order('data_compra', { ascending: false })
    setCompras(data || [])
  }

  async function fetchProdutos() {
    const { data } = await supabase.from('advogado_produtos').select('produto').eq('advogado_id', advogado.id)
    setProdutos(data?.map(d => d.produto) || [])
  }

  async function fetchAdv() {
    const { data } = await supabase.from('advogados').select('*').eq('id', advogado.id).single()
    if (data) setAdv(data)
  }

  async function registrarCompra() {
    setSaving(true)
    await supabase.from('compras').insert({ advogado_id: adv.id, produto, vendedor_id: profile.id, data_compra: dataCompra })
    await fetchCompras()
    await fetchProdutos()
    await fetchAdv()
    setSaving(false)
  }

  // Contagem por produto
  const contagemProduto = compras.reduce((acc, c) => {
    acc[c.produto] = (acc[c.produto] || 0) + 1
    return acc
  }, {})

  const st = STATUS_STYLE[adv.status] || STATUS_STYLE.vermelho
  const t = Math.min(adv.total_compras, 9)
  const ts = TITULO_STYLE[adv.titulo]
  const proximoTitulo = t < 9 ? TITULOS[t + 1] : null
  const diasUltimaCompra = adv.ultima_compra ? Math.floor((Date.now() - new Date(adv.ultima_compra)) / 86400000) : null

  return (
    <div style={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={s.panel}>
        <button style={s.closeBtn} onClick={onClose}>×</button>
        <div style={s.name}>{adv.nome_completo}</div>
        <div style={s.sub}>{adv.oab} · {adv.cidade}, {adv.estado}</div>
        <div style={s.badges}>
          <span style={s.badge({ background: st.bg, color: st.color })}>{st.label}</span>
          {adv.titulo && ts && <span style={s.badge({ background: ts.bg, color: ts.color })}>{adv.titulo}</span>}
        </div>

        <div style={s.section}>
          <div style={s.sectionTitle}>Desempenho</div>
          <div style={s.row}><span style={s.rowLabel}>Total de compras</span><span style={s.rowValue}>{adv.total_compras}</span></div>
          <div style={s.row}><span style={s.rowLabel}>Última compra</span><span style={s.rowValue}>{diasUltimaCompra !== null ? `${diasUltimaCompra} dias atrás` : 'Nenhuma'}</span></div>
          {proximoTitulo && <div style={s.row}><span style={s.rowLabel}>Próximo título</span><span style={{ ...s.rowValue, color: '#185FA5' }}>{proximoTitulo}</span></div>}

          {/* Contagem por produto */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {['Maternidade', 'BPC', 'Auxilio Acidente'].map(p => {
              const qtd = contagemProduto[p] || 0
              return (
                <div key={p} style={{ background: PROD_STYLE[p]?.bg, borderRadius: 8, padding: '8px 12px', textAlign: 'center', minWidth: 80, opacity: qtd === 0 ? 0.35 : 1 }}>
                  <div style={{ fontSize: 20, fontWeight: 500, color: PROD_STYLE[p]?.color }}>{qtd}</div>
                  <div style={{ fontSize: 10, color: PROD_STYLE[p]?.color, marginTop: 2 }}>{p === 'Auxilio Acidente' ? 'Aux. Acidente' : p}</div>
                </div>
              )
            })}
          </div>
        </div>

        <div style={s.section}>
          <div style={s.sectionTitle}>Contato</div>
          <div style={s.row}><span style={s.rowLabel}>Telefone</span><span style={s.rowValue}>{adv.telefone}</span></div>
          <div style={s.row}><span style={s.rowLabel}>E-mail</span><span style={{ ...s.rowValue, color: '#185FA5', fontSize: 12 }}>{adv.email}</span></div>
          <div style={s.row}><span style={s.rowLabel}>Estado civil</span><span style={s.rowValue}>{adv.estado_civil || '—'}</span></div>
          <div style={s.row}><span style={s.rowLabel}>Endereço</span><span style={{ ...s.rowValue, fontSize: 12 }}>{adv.endereco || '—'}</span></div>
        </div>

        <div style={s.section}>
          <div style={s.sectionTitle}>Registrar compra</div>
          <div style={s.compraBox}>
            <label style={{ ...s.label, marginTop: 0 }}>Produto</label>
            <select style={s.select} value={produto} onChange={e => setProduto(e.target.value)}>
              <option value="Maternidade">Maternidade</option>
              <option value="BPC">BPC</option>
              <option value="Auxilio Acidente">Auxílio Acidente</option>
            </select>
            <label style={s.label}>Data da compra</label>
            <input style={s.input} type="date" value={dataCompra} onChange={e => setDataCompra(e.target.value)} />
            <button style={s.btnSave} onClick={registrarCompra} disabled={saving}>{saving ? 'Salvando...' : 'Registrar compra'}</button>
          </div>
        </div>

        {compras.length > 0 && (
          <div style={s.section}>
            <div style={s.sectionTitle}>Histórico de compras</div>
            {compras.map(c => (
              <div key={c.id} style={s.tlItem}>
                <div style={s.tlDot}></div>
                <div>
                  <div style={s.tlText}>{c.produto}</div>
                  <div style={s.tlDate}>{c.data_compra}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
