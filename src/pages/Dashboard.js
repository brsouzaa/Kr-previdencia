import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
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

const PROD_STYLE = {
  'Maternidade': { bg: '#E1F5EE', color: '#0F6E56' },
  'BPC': { bg: '#EEEDFE', color: '#534AB7' },
  'Auxilio Acidente': { bg: '#FAEEDA', color: '#854F0B' },
}

function hoje() { return new Date().toISOString().slice(0, 10) }
function semanaAtras() {
  const d = new Date(); d.setDate(d.getDate() - 7)
  return d.toISOString().slice(0, 10)
}
function mesAtras() {
  const d = new Date(); d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

const MEDAL = ['🥇', '🥈', '🥉']

export default function Dashboard() {
  const { profile } = useAuth()
  const isMobile = useIsMobile()
  const [vendedores, setVendedores] = useState([])
  const [filtroVendedor, setFiltroVendedor] = useState('')
  const [filtroProduto, setFiltroProduto] = useState('')
  const [periodo, setPeriodo] = useState('mes')
  const [compras, setCompras] = useState([])
  const [advCriticos, setAdvCriticos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile?.role === 'admin') {
      supabase.from('profiles').select('id, nome').eq('role', 'vendedor').order('nome').then(({ data }) => setVendedores(data || []))
    }
    fetchDados()
  }, [profile])

  async function fetchDados() {
    setLoading(true)
    // Buscar todas as compras com dados de vendedor e advogado
    let q = supabase.from('compras').select(`
      id, produto, data_compra, created_at,
      advogados(nome_completo, oab),
      profiles(nome)
    `).order('data_compra', { ascending: false })

    if (profile?.role !== 'admin') q = q.eq('vendedor_id', profile?.id)

    const { data: comprasData } = await q
    setCompras(comprasData || [])

    // Buscar advogados críticos (>30 dias sem comprar)
    let qAdv = supabase.from('advogados').select(`
      id, nome_completo, oab, ultima_compra, status,
      profiles!advogados_vendedor_id_fkey(nome)
    `).eq('status', 'vermelho').not('ultima_compra', 'is', null).order('ultima_compra', { ascending: true }).limit(10)

    if (profile?.role !== 'admin') qAdv = qAdv.eq('vendedor_id', profile?.id)

    const { data: advData } = await qAdv
    setAdvCriticos(advData || [])
    setLoading(false)
  }

  // Filtrar compras por período e vendedor/produto
  function filtrarCompras(lista) {
    let inicio = ''
    if (periodo === 'hoje') inicio = hoje()
    else if (periodo === 'semana') inicio = semanaAtras()
    else if (periodo === 'mes') inicio = mesAtras()

    return lista.filter(c => {
      const dentroDoP = !inicio || c.data_compra >= inicio
      const vendedorOk = !filtroVendedor || c.profiles?.nome === filtroVendedor
      const produtoOk = !filtroProduto || c.produto === filtroProduto
      return dentroDoP && vendedorOk && produtoOk
    })
  }

  const comprasFiltradas = filtrarCompras(compras)

  // Métricas por período fixo
  const vendas = {
    hoje: compras.filter(c => c.data_compra === hoje()).length,
    semana: compras.filter(c => c.data_compra >= semanaAtras()).length,
    mes: compras.filter(c => c.data_compra >= mesAtras()).length,
    total: compras.length,
  }

  // Contagem por produto no período filtrado
  const porProduto = comprasFiltradas.reduce((acc, c) => {
    acc[c.produto] = (acc[c.produto] || 0) + 1
    return acc
  }, {})

  // Ranking de vendedores no período filtrado
  const rankingMap = comprasFiltradas.reduce((acc, c) => {
    const nome = c.profiles?.nome || 'Sem nome'
    acc[nome] = (acc[nome] || 0) + 1
    return acc
  }, {})
  const ranking = Object.entries(rankingMap).sort((a, b) => b[1] - a[1])

  // Agrupar compras filtradas por data para o histórico
  const porDia = comprasFiltradas.reduce((acc, c) => {
    const d = c.data_compra
    if (!acc[d]) acc[d] = { total: 0, produtos: {} }
    acc[d].total++
    acc[d].produtos[c.produto] = (acc[d].produtos[c.produto] || 0) + 1
    return acc
  }, {})
  const diasOrdenados = Object.entries(porDia).sort((a, b) => b[0].localeCompare(a[0]))

  const card = { background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: '14px 16px' }
  const metricGrid = { display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 10, marginBottom: '1.25rem' }
  const sectionTitle = { fontSize: 13, fontWeight: 500, color: '#111', marginBottom: 12, letterSpacing: '-0.2px' }

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>Carregando...</div>

  return (
    <div>
      <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 500, color: '#111', marginBottom: '1.25rem', letterSpacing: '-0.3px' }}>Dashboard de vendas</div>

      {/* Métricas fixas */}
      <div style={metricGrid}>
        {[
          ['Hoje', vendas.hoje, '#185FA5'],
          ['Esta semana', vendas.semana, '#0F6E56'],
          ['Este mês', vendas.mes, '#854F0B'],
          ['Total geral', vendas.total, '#111'],
        ].map(([l, v, c]) => (
          <div key={l} style={{ ...card, cursor: 'pointer', borderColor: periodo === l.toLowerCase().replace(' ', '') ? c : 'rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: 11, color: c, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, opacity: 0.8 }}>{l}</div>
            <div style={{ fontSize: 28, fontWeight: 500, color: c }}>{v}</div>
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>contrato{v !== 1 ? 's' : ''}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <select style={{ padding: '8px 10px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 8, background: '#fff', color: '#111', outline: 'none' }} value={periodo} onChange={e => setPeriodo(e.target.value)}>
          <option value="hoje">Hoje</option>
          <option value="semana">Esta semana</option>
          <option value="mes">Este mês</option>
          <option value="total">Todo período</option>
        </select>
        {profile?.role === 'admin' && (
          <select style={{ padding: '8px 10px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 8, background: '#fff', color: '#111', outline: 'none' }} value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}>
            <option value="">Todos os vendedores</option>
            {vendedores.map(v => <option key={v.id}>{v.nome}</option>)}
          </select>
        )}
        <select style={{ padding: '8px 10px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 8, background: '#fff', color: '#111', outline: 'none' }} value={filtroProduto} onChange={e => setFiltroProduto(e.target.value)}>
          <option value="">Todos produtos</option>
          <option value="Maternidade">Maternidade</option>
          <option value="BPC">BPC</option>
          <option value="Auxilio Acidente">Aux. Acidente</option>
        </select>
        <div style={{ padding: '8px 12px', background: '#f0f0ee', borderRadius: 8, fontSize: 13, color: '#555', display: 'flex', alignItems: 'center' }}>
          {comprasFiltradas.length} contrato{comprasFiltradas.length !== 1 ? 's' : ''} encontrado{comprasFiltradas.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginBottom: '1.25rem' }}>

        {/* Por produto */}
        <div style={card}>
          <div style={sectionTitle}>Por produto</div>
          {['Maternidade', 'BPC', 'Auxilio Acidente'].map(p => {
            const qtd = porProduto[p] || 0
            const pct = comprasFiltradas.length > 0 ? Math.round((qtd / comprasFiltradas.length) * 100) : 0
            return (
              <div key={p} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                  <span style={{ color: PROD_STYLE[p]?.color, fontWeight: 500 }}>{p === 'Auxilio Acidente' ? 'Aux. Acidente' : p}</span>
                  <span style={{ fontWeight: 500 }}>{qtd} <span style={{ color: '#aaa', fontWeight: 400 }}>({pct}%)</span></span>
                </div>
                <div style={{ background: '#f0f0ee', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: PROD_STYLE[p]?.color, borderRadius: 4, transition: 'width 0.4s' }}></div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Ranking vendedores — só admin */}
        {profile?.role === 'admin' && (
          <div style={card}>
            <div style={sectionTitle}>Ranking de vendedoras</div>
            {ranking.length === 0 && <div style={{ color: '#aaa', fontSize: 13 }}>Nenhuma venda no período</div>}
            {ranking.map(([nome, qtd], i) => (
              <div key={nome} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '8px 10px', background: i === 0 ? '#FAEEDA' : '#f8f8f6', borderRadius: 8 }}>
                <div style={{ fontSize: 20, width: 28 }}>{MEDAL[i] || `${i + 1}º`}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{nome}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>{qtd} contrato{qtd !== 1 ? 's' : ''}</div>
                </div>
                <div style={{ fontSize: 20, fontWeight: 500, color: i === 0 ? '#854F0B' : '#185FA5' }}>{qtd}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Alertas — advogados críticos */}
      {advCriticos.length > 0 && (
        <div style={{ ...card, marginBottom: '1.25rem', borderColor: '#F09595' }}>
          <div style={{ ...sectionTitle, color: '#A32D2D' }}>⚠️ Advogados críticos — +30 dias sem comprar</div>
          {advCriticos.map(a => {
            const dias = Math.floor((Date.now() - new Date(a.ultima_compra)) / 86400000)
            return (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{a.nome_completo}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>{a.oab}{profile?.role === 'admin' ? ` · ${a.profiles?.nome || '—'}` : ''}</div>
                </div>
                <div style={{ fontSize: 12, color: '#A32D2D', fontWeight: 500, textAlign: 'right' }}>
                  {dias} dias<br /><span style={{ fontWeight: 400, color: '#aaa', fontSize: 11 }}>sem comprar</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Histórico por dia */}
      <div style={card}>
        <div style={sectionTitle}>Histórico de vendas por dia</div>
        {diasOrdenados.length === 0 && <div style={{ color: '#aaa', fontSize: 13 }}>Nenhuma venda no período selecionado</div>}
        {diasOrdenados.map(([data, info]) => (
          <div key={data} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{data}</div>
              <div style={{ fontSize: 13, color: '#185FA5', fontWeight: 500 }}>{info.total} contrato{info.total !== 1 ? 's' : ''}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(info.produtos).map(([prod, qtd]) => (
                <span key={prod} style={{ padding: '3px 8px', borderRadius: 6, fontSize: 12, background: PROD_STYLE[prod]?.bg, color: PROD_STYLE[prod]?.color, fontWeight: 500 }}>
                  {qtd}x {prod === 'Auxilio Acidente' ? 'Aux. Acidente' : prod}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
