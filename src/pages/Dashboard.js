import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import ModalComprovante from '../components/ModalComprovante'

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
  'Maternidade': { bg: 'rgba(52,211,153,.14)', color: '#059669' },
  'BPC': { bg: 'rgba(167,139,250,.14)', color: '#7c3aed' },
  'Pensão por Morte': { bg: 'rgba(167,139,250,.14)', color: '#7c3aed' },
  'Auxilio Acidente': { bg: 'rgba(251,191,36,.12)', color: '#b45309' },
}

const STATUS_LOTE = {
  emitir_contrato: { bg: '#e2e8f0', color: '#5b6b84', label: 'Emitir contrato' },
  nao_assinou: { bg: 'rgba(248,113,113,.14)', color: '#dc2626', label: 'Não assinou' },
  assinar_contrato: { bg: 'rgba(167,139,250,.14)', color: '#7c3aed', label: 'Assinar contrato' },
  a_entregar: { bg: 'rgba(96,165,250,.12)', color: '#2563eb', label: 'A entregar' },
  entregue: { bg: 'rgba(251,191,36,.12)', color: '#b45309', label: 'Entregue' },
  pago: { bg: 'rgba(52,211,153,.14)', color: '#059669', label: 'Pago' },
  inadimplente: { bg: 'rgba(248,113,113,.14)', color: '#dc2626', label: 'Inadimplente' },
}

function fmtLocal(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function hoje() { return fmtLocal(new Date()) }
function semanaAtras() { const d=new Date(); d.setDate(d.getDate()-7); return fmtLocal(d) }
function mesAtras() { const d=new Date(); d.setDate(d.getDate()-30); return fmtLocal(d) }
function primeiroDiaMes() { const d=new Date(); return fmtLocal(new Date(d.getFullYear(), d.getMonth(), 1)) }
const STATUS_MORTOS = ['nao_assinou', 'inadimplente', 'cancelado', 'expirado']
const MEDAL = ['🥇','🥈','🥉']
const fmt = v => `R$ ${Number(v).toLocaleString('pt-BR')}`

function diasDesde(data) {
  return Math.floor((Date.now() - new Date(data)) / 86400000)
}

export default function Dashboard() {
  const { profile } = useAuth()
  const isMobile = useIsMobile()

  // Bloqueio de acesso: supervisor de produção, produtor e vendedor-operador não podem ver o dashboard de vendas
  // Analista pode ver (precisa entregar lotes e ver os antigos)
  if (profile && ['supervisor_producao','produtor','vendedor_operador'].includes(profile.role)) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '2rem' }}>
        <div style={{ background: '#ffffff', borderRadius: 14, padding: '2rem', maxWidth: 420, textAlign: 'center', border: '0.5px solid rgba(15,23,42,0.08)' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 16, fontWeight: 500, color: '#0f172a', marginBottom: 6 }}>Acesso restrito</div>
          <div style={{ fontSize: 13, color: '#5b6b84', lineHeight: 1.6 }}>
            Esta página é exclusiva para administradores e vendedores de advogado.
            Use o menu lateral para acessar suas áreas disponíveis.
          </div>
        </div>
      </div>
    )
  }
  const [vendedores, setVendedores] = useState([])
  const [filtroVendedor, setFiltroVendedor] = useState('')
  const [filtroProduto, setFiltroProduto] = useState('')
  const [periodo, setPeriodo] = useState('total') // padrão: TUDO — status é estoque; mês é filtro opcional
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [compras, setCompras] = useState([])
  const [lotes, setLotes] = useState([])
  const [advCriticos, setAdvCriticos] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalStatus, setModalStatus] = useState(null) // 'a_entregar' | 'entregue' | 'pago' | 'inadimplente'
  const [modalComprovante, setModalComprovante] = useState(null)
  const [repExpandido, setRepExpandido] = useState(false)
  const [repPeriodo, setRepPeriodo] = useState('mes') // hoje | semana | mes
  // Expansao de cards: { [lote_id]: { aberto: true, contratos: [...] } }
  const [loteExpandido, setLoteExpandido] = useState({})

  async function toggleExpandirLote(loteId) {
    if (loteExpandido[loteId]?.aberto) {
      setLoteExpandido(prev => ({ ...prev, [loteId]: { ...prev[loteId], aberto: false } }))
      return
    }
    // Se ja tem contratos carregados, só abre
    if (loteExpandido[loteId]?.contratos) {
      setLoteExpandido(prev => ({ ...prev, [loteId]: { ...prev[loteId], aberto: true } }))
      return
    }
    // Senao, busca contratos
    setLoteExpandido(prev => ({ ...prev, [loteId]: { aberto: true, loading: true } }))
    const { data } = await supabase
      .from('contratos_producao')
      .select('id, cliente_nome, cliente_cpf, status, link_assinatura, zapsign_token, data_assinatura, data_envio')
      .eq('lote_id', loteId)
      .order('data_assinatura', { ascending: true, nullsFirst: false })
    setLoteExpandido(prev => ({
      ...prev,
      [loteId]: { aberto: true, loading: false, contratos: data || [] }
    }))
  }

  useEffect(() => {
    if ((profile?.role === 'admin' || profile?.role === 'analista')) {
      supabase.from('profiles').select('id, nome').eq('role', 'vendedor').order('nome').then(({ data }) => setVendedores(data || []))
    }
    fetchDados()
  }, [profile])

  async function fetchDados() {
    setLoading(true)
    let qC = supabase.from('compras').select('id, produto, data_compra, vendedor_id, advogado_id, profiles(nome)').order('data_compra', { ascending: false })
    let qL = supabase.from('lotes').select('*, advogados(nome_completo, oab, cidade), profiles(nome)').order('data_compra', { ascending: false })
    let qA = supabase.from('advogados').select('id, nome_completo, oab, ultima_compra, status, profiles!advogados_vendedor_id_fkey(nome)').eq('status', 'vermelho').not('ultima_compra', 'is', null).order('ultima_compra', { ascending: true }).limit(10)

    // Analista vê tudo (igual admin) — precisa enxergar todos os lotes pra entregar e gerenciar
    const veTudo = (profile?.role === 'admin' || profile?.role === 'analista') || profile?.role === 'analista'
    if (!veTudo) {
      qC = qC.eq('vendedor_id', profile?.id)
      qL = qL.eq('vendedor_id', profile?.id)
      qA = qA.eq('vendedor_id', profile?.id)
    }

    const [{ data: c }, { data: l }, { data: a }] = await Promise.all([qC, qL, qA])
    setCompras(c || [])
    setLotes(l || [])
    setAdvCriticos(a || [])
    setLoading(false)
  }

  function getPeriodo() {
    if (periodo === 'hoje') return { inicio: hoje(), fim: hoje() }
    if (periodo === 'semana') return { inicio: semanaAtras(), fim: hoje() }
    if (periodo === 'mes') return { inicio: primeiroDiaMes(), fim: hoje() }
    if (periodo === 'custom') return { inicio: dataInicio, fim: dataFim }
    return { inicio: '', fim: '' }
  }

  function filtrarCompras(lista) {
    const { inicio, fim } = getPeriodo()
    return lista.filter(c => {
      const dentroDoP = (!inicio || c.data_compra >= inicio) && (!fim || c.data_compra <= fim)
      const vendedorOk = !filtroVendedor || c.profiles?.nome === filtroVendedor
      const produtoOk = !filtroProduto || c.produto === filtroProduto
      return dentroDoP && vendedorOk && produtoOk
    })
  }

  function filtrarLotes(lista) {
    const { inicio, fim } = getPeriodo()
    return lista.filter(l => {
      if (l.tipo === 'reposicao') return false
      const dentroDoP = (!inicio || l.data_compra >= inicio) && (!fim || l.data_compra <= fim)
      const vendedorOk = !filtroVendedor || l.profiles?.nome === filtroVendedor
      return dentroDoP && vendedorOk
    })
  }

  const comprasFiltradas = filtrarCompras(compras)
  const lotesFiltrados = filtrarLotes(lotes)

  // PAGO usa régua de CAIXA (data_pagamento), não data_compra — senão pagamento de mês anterior some
  const lotesPagosNoPeriodo = (() => {
    const { inicio, fim } = getPeriodo()
    return lotes.filter(l => {
      if (l.status_pagamento !== 'pago') return false
      if (l.tipo === 'reposicao') return false
      const dp = l.data_pagamento // 'YYYY-MM-DD'
      if (!dp) return false
      const dentro = (!inicio || dp >= inicio) && (!fim || dp <= fim)
      const vendedorOk = !filtroVendedor || l.profiles?.nome === filtroVendedor
      return dentro && vendedorOk
    })
  })()

  // Mapa de status do lote por (advogado_id + data_compra)
  const statusLotePorCompra = {}
  for (const l of lotes) {
    const key = `${l.advogado_id}__${l.data_compra}`
    statusLotePorCompra[key] = l.status_pagamento
  }
  function compraEhFaturavel(c) {
    const status = statusLotePorCompra[`${c.advogado_id}__${c.data_compra}`]
    // Se não tem lote ainda, conta (venda fresca, sem status ainda)
    if (!status) return true
    // Exclui apenas vendas mortas
    return !STATUS_MORTOS.includes(status)
  }
  const comprasFaturaveis = compras.filter(compraEhFaturavel)
  // Combinação: filtro de período + filtro de faturável (usado em ranking, por produto, por dia)
  const comprasFiltradasFaturaveis = comprasFiltradas.filter(compraEhFaturavel)

  // Reposições pendentes (todos os lotes carregados, ignorando período)
  const reposicoesPendentes = lotes.filter(l => l.tipo === 'reposicao' && l.status_aprovacao === 'pendente')
  const reposicoesPendentesQtd = reposicoesPendentes.reduce((s, l) => s + Number(l.total_contratos || 0), 0)

  // Reposições APROVADAS no período PRÓPRIO do card (usa aprovado_em pra filtrar)
  const CAC_MEDIO = 100
  function inicioPeriodoRep() {
    if (repPeriodo === 'hoje') return hoje()
    if (repPeriodo === 'semana') return semanaAtras()
    if (repPeriodo === 'mes') return primeiroDiaMes()
    return primeiroDiaMes()
  }
  const inicioRep = inicioPeriodoRep()
  function dentroPeriodoRep(lote) {
    if (!lote.aprovado_em) return false
    const dataAprov = lote.aprovado_em.slice(0, 10) // YYYY-MM-DD
    return dataAprov >= inicioRep && dataAprov <= hoje()
  }
  const reposicoesAprovadas = lotes.filter(l => l.tipo === 'reposicao' && l.status_aprovacao === 'aprovado' && dentroPeriodoRep(l))
  const reposicoesAprovadasQtd = reposicoesAprovadas.reduce((s, l) => s + Number(l.total_contratos || 0), 0)
  const reposicoesCustoCAC = reposicoesAprovadasQtd * CAC_MEDIO

  // Total de contratos vendidos no MESMO período do card de reposição (pra calcular % real)
  const contratosVendidosPeriodoRep = comprasFaturaveis.filter(c => c.data_compra >= inicioRep && c.data_compra <= hoje()).length
  const taxaReposicao = contratosVendidosPeriodoRep > 0
    ? (reposicoesAprovadasQtd / contratosVendidosPeriodoRep) * 100
    : 0

  // Cor e label do alerta
  let alertaRep = { cor: '#059669', bg: 'rgba(52,211,153,.14)', label: 'Dentro do esperado' }
  if (taxaReposicao >= 20) alertaRep = { cor: '#dc2626', bg: 'rgba(248,113,113,.14)', label: 'Algo errado no funil' }
  else if (taxaReposicao >= 10) alertaRep = { cor: '#b45309', bg: 'rgba(251,191,36,.12)', label: 'Olho aberto' }

  // Breakdown por vendedora (B2B) — agrupa reposições por nome do vendedor do lote
  const repPorVendedora = reposicoesAprovadas.reduce((acc, l) => {
    const nome = l.profiles?.nome || 'Sem nome'
    if (!acc[nome]) acc[nome] = { qtd: 0, contratos: 0 }
    acc[nome].qtd += 1
    acc[nome].contratos += Number(l.total_contratos || 0)
    return acc
  }, {})
  const rankingRepVendedora = Object.entries(repPorVendedora)
    .map(([nome, v]) => ({ nome, ...v }))
    .sort((a, b) => b.contratos - a.contratos)
    .slice(0, 5)

  // Breakdown por advogado
  const repPorAdvogado = reposicoesAprovadas.reduce((acc, l) => {
    const nome = l.advogados?.nome_completo || 'Sem nome'
    if (!acc[nome]) acc[nome] = { qtd: 0, contratos: 0 }
    acc[nome].qtd += 1
    acc[nome].contratos += Number(l.total_contratos || 0)
    return acc
  }, {})
  const rankingRepAdvogado = Object.entries(repPorAdvogado)
    .map(([nome, v]) => ({ nome, ...v }))
    .sort((a, b) => b.contratos - a.contratos)
    .slice(0, 5)

  const vendas = {
    hoje: comprasFaturaveis.filter(c => c.data_compra === hoje()).length,
    semana: comprasFaturaveis.filter(c => c.data_compra >= semanaAtras()).length,
    mes: comprasFaturaveis.filter(c => c.data_compra >= primeiroDiaMes()).length,
    total: comprasFaturaveis.length,
  }

  const financeiro = {
    emitir_contrato: lotesFiltrados.filter(l => l.status_pagamento === 'emitir_contrato').reduce((s,l) => s + Number(l.valor_total), 0),
    nao_assinou: lotesFiltrados.filter(l => l.status_pagamento === 'nao_assinou').reduce((s,l) => s + Number(l.valor_total), 0),
    assinar_contrato: lotesFiltrados.filter(l => l.status_pagamento === 'assinar_contrato').reduce((s,l) => s + Number(l.valor_total), 0),
    a_entregar: lotesFiltrados.filter(l => l.status_pagamento === 'a_entregar').reduce((s,l) => s + Number(l.valor_total), 0),
    entregue: lotesFiltrados.filter(l => l.status_pagamento === 'entregue').reduce((s,l) => s + Number(l.valor_total), 0),
    pago: lotesPagosNoPeriodo.reduce((s,l) => s + Number(l.valor_total), 0),
    inadimplente: lotesFiltrados.filter(l => l.status_pagamento === 'inadimplente').reduce((s,l) => s + Number(l.valor_total), 0),
  }

  const contagem = {
    emitir_contrato: lotesFiltrados.filter(l => l.status_pagamento === 'emitir_contrato').length,
    nao_assinou: lotesFiltrados.filter(l => l.status_pagamento === 'nao_assinou').length,
    assinar_contrato: lotesFiltrados.filter(l => l.status_pagamento === 'assinar_contrato').length,
    a_entregar: lotesFiltrados.filter(l => l.status_pagamento === 'a_entregar').length,
    entregue: lotesFiltrados.filter(l => l.status_pagamento === 'entregue').length,
    pago: lotesPagosNoPeriodo.length,
    inadimplente: lotesFiltrados.filter(l => l.status_pagamento === 'inadimplente').length,
  }

  const porProduto = comprasFiltradasFaturaveis.reduce((acc, c) => { acc[c.produto] = (acc[c.produto] || 0) + 1; return acc }, {})
  const rankingMap = comprasFiltradasFaturaveis.reduce((acc, c) => { const n = c.profiles?.nome || 'Sem nome'; acc[n] = (acc[n] || 0) + 1; return acc }, {})
  const ranking = Object.entries(rankingMap).sort((a, b) => b[1] - a[1])
  const porDia = comprasFiltradasFaturaveis.reduce((acc, c) => { const d = c.data_compra; if (!acc[d]) acc[d] = { total: 0, produtos: {} }; acc[d].total++; acc[d].produtos[c.produto] = (acc[d].produtos[c.produto] || 0) + 1; return acc }, {})
  const diasOrdenados = Object.entries(porDia).sort((a, b) => b[0].localeCompare(a[0]))

  async function mudarStatusLote(loteId, novoStatus) {
    const update = { status_pagamento: novoStatus, updated_at: new Date().toISOString() }
    if (novoStatus === 'entregue') update.data_entrega = hoje()
    if (novoStatus !== 'pago') { update.data_pagamento = null; update.comprovante_url = null; update.comprovante_nome = null }
    await supabase.from('lotes').update(update).eq('id', loteId)
    await fetchDados()
  }

  async function confirmarPagamento(loteId, path, nome) {
    await supabase.from('lotes').update({
      status_pagamento: 'pago',
      data_pagamento: hoje(),
      comprovante_url: path,
      comprovante_nome: nome,
      updated_at: new Date().toISOString(),
    }).eq('id', loteId)
    setModalComprovante(null)
    await fetchDados()
  }

  async function verComprovante(lote) {
    if (!lote.comprovante_url) return
    const { data } = await supabase.storage.from('comprovantes').createSignedUrl(lote.comprovante_url, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const card = { background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 12, padding: '14px 16px' }

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: '#5b6b84' }}>Carregando...</div>

  // Lotes do modal selecionado
  const lotesModal = modalStatus
    ? lotesFiltrados
        .filter(l => l.status_pagamento === modalStatus)
        .sort((a, b) => {
          // Reposição sempre primeiro
          const aRep = a.tipo === 'reposicao' ? 1 : 0
          const bRep = b.tipo === 'reposicao' ? 1 : 0
          if (aRep !== bRep) return bRep - aRep
          // Depois prioridade_fila (boolean)
          const aPri = a.prioridade_fila ? 1 : 0
          const bPri = b.prioridade_fila ? 1 : 0
          if (aPri !== bPri) return bPri - aPri
          // Por fim, data_compra mais antiga primeiro
          return (a.data_compra || '').localeCompare(b.data_compra || '')
        })
    : []
  const valorModal = lotesModal.reduce((s, l) => s + Number(l.valor_total), 0)

  return (
    <div>
      <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 500, color: '#0f172a', marginBottom: '1.25rem' }}>Dashboard de vendas</div>

      {/* Métricas contratos */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 10, marginBottom: '1rem' }}>
        {[['Hoje', vendas.hoje, '#2563eb'], ['Esta semana', vendas.semana, '#059669'], ['Este mês', vendas.mes, '#b45309'], ['Total geral', vendas.total, '#0f172a']].map(([l,v,c]) => (
          <div key={l} style={card}>
            <div style={{ fontSize: 11, color: c, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, opacity: 0.8 }}>{l}</div>
            <div style={{ fontSize: 28, fontWeight: 500, color: c }}>{v}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>contrato{v!==1?'s':''}</div>
          </div>
        ))}
      </div>

      {/* Aviso de reposições pendentes (só admin) */}
      {profile?.role === 'admin' && reposicoesPendentes.length > 0 && (
        <div style={{ background: 'rgba(251,191,36,.12)', border: '0.5px solid #B7892550', borderRadius: 12, padding: '14px 16px', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 11, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>🔄 Reposições aguardando aprovação</div>
            <div style={{ fontSize: 13, color: '#5b6b84' }}>
              <strong style={{ color: '#b45309' }}>{reposicoesPendentes.length}</strong> solicitação{reposicoesPendentes.length !== 1 ? 'ões' : ''}
              {' · '}
              <strong style={{ color: '#b45309' }}>{reposicoesPendentesQtd}</strong> contrato{reposicoesPendentesQtd !== 1 ? 's' : ''} grátis
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#5b6b84' }}>Vá em <strong>🔄 Reposições</strong> no menu</div>
        </div>
      )}

      {/* Métricas de reposição aprovadas (só admin) */}
      {profile?.role === 'admin' && (
        <div style={{ background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.07)', borderRadius: 12, padding: '14px 16px', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 11, color: '#5b6b84', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🔄 Reposições aprovadas</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 0, border: '0.5px solid rgba(15,23,42,0.09)', borderRadius: 7, overflow: 'hidden' }}>
                {[['hoje', 'Hoje'], ['semana', 'Semana'], ['mes', 'Mês']].map(([val, lbl]) => (
                  <button
                    key={val}
                    onClick={() => setRepPeriodo(val)}
                    style={{
                      padding: '4px 10px',
                      fontSize: 11,
                      background: repPeriodo === val ? '#60a5fa' : '#ffffff',
                      color: repPeriodo === val ? '#232a37' : '#5b6b84',
                      border: 'none',
                      borderRight: val !== 'mes' ? '0.5px solid rgba(15,23,42,0.09)' : 'none',
                      cursor: 'pointer',
                      fontWeight: repPeriodo === val ? 500 : 400,
                    }}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 500, color: alertaRep.cor, background: alertaRep.bg }}>{alertaRep.label}</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 10, marginBottom: rankingRepVendedora.length > 0 ? 12 : 0 }}>
            <div style={{ padding: '10px 12px', background: '#f1f5f9', borderRadius: 8 }}>
              <div style={{ fontSize: 10, color: '#5b6b84', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 2 }}>Aprovadas</div>
              <div style={{ fontSize: 22, fontWeight: 500, color: '#0f172a' }}>{reposicoesAprovadas.length}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>solicitaç{reposicoesAprovadas.length !== 1 ? 'ões' : 'ão'}</div>
            </div>
            <div style={{ padding: '10px 12px', background: '#f1f5f9', borderRadius: 8 }}>
              <div style={{ fontSize: 10, color: '#5b6b84', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 2 }}>Contratos grátis</div>
              <div style={{ fontSize: 22, fontWeight: 500, color: '#0f172a' }}>{reposicoesAprovadasQtd}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>repostos</div>
            </div>
            <div style={{ padding: '10px 12px', background: '#f1f5f9', borderRadius: 8 }}>
              <div style={{ fontSize: 10, color: '#5b6b84', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 2 }}>Taxa de reposição</div>
              <div style={{ fontSize: 22, fontWeight: 500, color: alertaRep.cor }}>{taxaReposicao.toFixed(1)}%</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>sobre {contratosVendidosPeriodoRep} vendidos</div>
            </div>
            <div style={{ padding: '10px 12px', background: '#f1f5f9', borderRadius: 8 }}>
              <div style={{ fontSize: 10, color: '#5b6b84', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 2 }}>CAC desperdiçado</div>
              <div style={{ fontSize: 22, fontWeight: 500, color: '#dc2626' }}>{fmt(reposicoesCustoCAC)}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>~R$100/contrato</div>
            </div>
          </div>

          {(rankingRepVendedora.length > 0 || rankingRepAdvogado.length > 0) && (
            <button
              onClick={() => setRepExpandido(!repExpandido)}
              style={{ width: '100%', padding: '7px 10px', marginTop: 8, background: '#f1f5f9', color: '#5b6b84', border: '0.5px solid rgba(15,23,42,0.07)', borderRadius: 7, fontSize: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span>📊 Ver detalhes por vendedora e advogado</span>
              <span>{repExpandido ? '▲' : '▼'}</span>
            </button>
          )}

          {repExpandido && (
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
              {rankingRepVendedora.length > 0 && (
                <div style={{ background: '#f1f5f9', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 11, color: '#5b6b84', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>Top vendedoras (reposições pedidas)</div>
                  {rankingRepVendedora.map((v, i) => (
                    <div key={v.nome} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: i > 0 ? '0.5px solid rgba(15,23,42,0.05)' : 'none' }}>
                      <span style={{ fontSize: 13, color: '#0f172a' }}>{i + 1}. {v.nome}</span>
                      <span style={{ fontSize: 12, color: '#5b6b84' }}>{v.contratos} contrato{v.contratos !== 1 ? 's' : ''} · {v.qtd} pedido{v.qtd !== 1 ? 's' : ''}</span>
                    </div>
                  ))}
                </div>
              )}
              {rankingRepAdvogado.length > 0 && (
                <div style={{ background: '#f1f5f9', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 11, color: '#5b6b84', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>Top advogados (mais reposições recebidas)</div>
                  {rankingRepAdvogado.map((a, i) => (
                    <div key={a.nome} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: i > 0 ? '0.5px solid rgba(15,23,42,0.05)' : 'none' }}>
                      <span style={{ fontSize: 13, color: '#0f172a' }}>{i + 1}. {a.nome}</span>
                      <span style={{ fontSize: 12, color: '#5b6b84' }}>{a.contratos} contrato{a.contratos !== 1 ? 's' : ''} · {a.qtd} pedido{a.qtd !== 1 ? 's' : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Cards de status clicáveis */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 10, marginBottom: '1.25rem' }}>
        {[
          ['emitir_contrato', 'Emitir contrato', financeiro.emitir_contrato, '#5b6b84', '#e2e8f0'],
          ['assinar_contrato', 'Assinar contrato', financeiro.assinar_contrato, '#7c3aed', 'rgba(167,139,250,.14)'],
          ['a_entregar', 'A entregar', financeiro.a_entregar, '#2563eb', 'rgba(96,165,250,.12)'],
          ['entregue', 'Entregue', financeiro.entregue, '#b45309', 'rgba(251,191,36,.12)'],
          ['pago', 'Pago', financeiro.pago, '#059669', 'rgba(52,211,153,.14)'],
          ['inadimplente', 'Inadimplente', financeiro.inadimplente, '#dc2626', 'rgba(248,113,113,.14)'],
          ['nao_assinou', 'Não assinou', financeiro.nao_assinou, '#dc2626', 'rgba(248,113,113,.14)'],
        ].map(([st, label, valor, cor, bg]) => (
          <div key={st} onClick={() => setModalStatus(st === modalStatus ? null : st)}
            style={{ background: modalStatus === st ? bg : '#ffffff', border: `${modalStatus === st ? 2 : 0.5}px solid ${cor}${modalStatus === st ? '' : '40'}`, borderRadius: 12, padding: '14px 16px', cursor: 'pointer', transition: 'all 0.15s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 11, color: cor, textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.9 }}>{label}</div>
              <span style={{ background: bg, color: cor, fontSize: 11, fontWeight: 500, padding: '2px 7px', borderRadius: 20 }}>{contagem[st]}</span>
            </div>
            <div style={{ fontSize: isMobile ? 15 : 18, fontWeight: 500, color: cor }}>{fmt(valor)}</div>
          </div>
        ))}
      </div>

      {/* Modal inline de lotes por status */}
      {modalStatus && (
        <div style={{ background: '#ffffff', border: `1.5px solid ${STATUS_LOTE[modalStatus]?.color}40`, borderRadius: 14, padding: '1.25rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 500, color: STATUS_LOTE[modalStatus]?.color }}>{STATUS_LOTE[modalStatus]?.label}</span>
              <span style={{ fontSize: 13, color: '#5b6b84', marginLeft: 8 }}>{lotesModal.length} lote{lotesModal.length!==1?'s':''} · {fmt(valorModal)}</span>
            </div>
            <button onClick={() => setModalStatus(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#5b6b84' }}>×</button>
          </div>

          {lotesModal.length === 0 && <div style={{ color: '#64748b', fontSize: 13, textAlign: 'center', padding: '1.5rem' }}>Nenhum lote neste status</div>}

          {lotesModal.map(lote => {
            const dias = diasDesde(lote.data_compra)
            const alerta = modalStatus === 'a_entregar' && dias >= 3
            const ehReposicao = lote.tipo === 'reposicao'
            return (
              <div key={lote.id} style={{ border: `${ehReposicao ? '2px' : '0.5px'} solid ${ehReposicao ? '#fbbf24' : alerta ? '#f87171' : 'rgba(15,23,42,0.07)'}`, borderRadius: 10, padding: 12, marginBottom: 10, background: ehReposicao ? 'rgba(251,191,36,.12)' : alerta ? '#FCEBEB40' : '#f2f5fa' }}>
                {ehReposicao && (
                  <div style={{ background: '#fbbf24', color: '#232a37', padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, marginBottom: 8, display: 'inline-block', letterSpacing: '0.3px' }}>
                    🔄 REPOSIÇÃO · 24H
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{lote.advogados?.nome_completo}</div>
                    <div style={{ fontSize: 11, color: '#5b6b84' }}>{lote.advogados?.oab} · {lote.advogados?.cidade}</div>
                    {(profile?.role === 'admin' || profile?.role === 'analista') && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Vendedor: {lote.profiles?.nome}</div>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{fmt(lote.valor_total)}</div>
                    <div style={{ fontSize: 11, color: alerta ? '#dc2626' : '#5b6b84' }}>{lote.total_contratos} contrato{lote.total_contratos!==1?'s':''} · {dias}d atrás</div>
                  </div>
                </div>

                {/* Data de entrega se entregue/pago */}
                {lote.data_entrega && <div style={{ fontSize: 11, color: '#b45309', marginBottom: 8 }}>Entregue em {lote.data_entrega}</div>}
                {lote.status_pagamento === 'pago' && lote.data_pagamento && (
                  <div style={{ fontSize: 11, color: '#059669', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    ✓ Pago em {lote.data_pagamento}
                    {lote.comprovante_url && <button onClick={() => verComprovante(lote)} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 11, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Ver comprovante</button>}
                  </div>
                )}

                {/* Botão expandir lista de contratos (a entregar / entregue / pago / inadimplente) */}
                {['a_entregar','entregue','pago','inadimplente'].includes(modalStatus) && (
                  <button
                    onClick={() => toggleExpandirLote(lote.id)}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      marginBottom: 8,
                      background: loteExpandido[lote.id]?.aberto ? '#ffffff' : '#e2e8f0',
                      color: '#5b6b84',
                      border: '0.5px solid rgba(15,23,42,0.08)',
                      borderRadius: 7,
                      fontSize: 11,
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <span>📄 Ver clientes assinados ({lote.qtd_assinados || 0}/{lote.total_contratos})</span>
                    <span>{loteExpandido[lote.id]?.aberto ? '▲' : '▼'}</span>
                  </button>
                )}

                {/* Lista expandida de contratos do lote */}
                {loteExpandido[lote.id]?.aberto && (
                  <div style={{ background: '#f1f5f9', border: '0.5px solid rgba(15,23,42,0.06)', borderRadius: 7, padding: 8, marginBottom: 8 }}>
                    {loteExpandido[lote.id]?.loading && <div style={{ fontSize: 11, color: '#5b6b84', textAlign: 'center', padding: 8 }}>Carregando...</div>}
                    {!loteExpandido[lote.id]?.loading && loteExpandido[lote.id]?.contratos?.length === 0 && (
                      <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center', padding: 8 }}>Nenhum contrato neste lote</div>
                    )}
                    {(loteExpandido[lote.id]?.contratos || []).map((c, idx) => {
                      const ehAssinado = c.status === 'assinado'
                      const corStatus = ehAssinado ? '#059669' : c.status === 'expirado' || c.status === 'cancelado' ? '#dc2626' : '#5b6b84'
                      return (
                        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 6px', borderBottom: idx < loteExpandido[lote.id].contratos.length - 1 ? '0.5px solid rgba(15,23,42,0.05)' : 'none', gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {ehAssinado && <span style={{ color: '#059669', marginRight: 4 }}>✓</span>}
                              {c.cliente_nome}
                            </div>
                            <div style={{ fontSize: 10, color: '#5b6b84' }}>
                              {c.cliente_cpf} · <span style={{ color: corStatus }}>{c.status}</span>
                              {c.data_assinatura && ` · assinou em ${new Date(c.data_assinatura).toLocaleDateString('pt-BR')}`}
                            </div>
                          </div>
                          {c.link_assinatura && (
                            <a href={c.link_assinatura} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: '#2563eb', textDecoration: 'none', flexShrink: 0, padding: '3px 6px', background: 'rgba(96,165,250,.12)', borderRadius: 4 }}>
                              🔗 Contrato
                            </a>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Ações por status */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {modalStatus === 'emitir_contrato' && (
                    <>
                      <button onClick={() => mudarStatusLote(lote.id, 'assinar_contrato')} style={{ flex: 1, padding: '7px', background: 'rgba(167,139,250,.14)', color: '#7c3aed', border: '0.5px solid #a78bfa', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                        ✓ Contrato emitido
                      </button>
                      <button onClick={() => mudarStatusLote(lote.id, 'inadimplente')} style={{ padding: '7px 10px', background: 'rgba(248,113,113,.14)', color: '#dc2626', border: '0.5px solid #f87171', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>
                        Inadimp.
                      </button>
                    </>
                  )}
                  {modalStatus === 'assinar_contrato' && (
                    <>
                      <button onClick={() => mudarStatusLote(lote.id, 'a_entregar')} style={{ flex: 1, padding: '7px', background: 'rgba(96,165,250,.12)', color: '#2563eb', border: '0.5px solid #60a5fa', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                        ✓ Contrato assinado
                      </button>
                      <button onClick={() => mudarStatusLote(lote.id, 'inadimplente')} style={{ padding: '7px 10px', background: 'rgba(248,113,113,.14)', color: '#dc2626', border: '0.5px solid #f87171', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>
                        Inadimp.
                      </button>
                    </>
                  )}
                  {modalStatus === 'a_entregar' && (
                    <>
                      <button onClick={() => mudarStatusLote(lote.id, 'entregue')} style={{ flex: 1, padding: '7px', background: 'rgba(251,191,36,.12)', color: '#b45309', border: '0.5px solid #fbbf24', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                        ✓ Marcar entregue
                      </button>
                      <button onClick={() => mudarStatusLote(lote.id, 'inadimplente')} style={{ padding: '7px 10px', background: 'rgba(248,113,113,.14)', color: '#dc2626', border: '0.5px solid #f87171', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>
                        Inadimp.
                      </button>
                    </>
                  )}
                  {modalStatus === 'entregue' && (
                    <>
                      <button onClick={() => setModalComprovante(lote)} style={{ flex: 1, padding: '7px', background: 'rgba(52,211,153,.14)', color: '#059669', border: '0.5px solid #34d399', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                        📎 Pago + comprovante
                      </button>
                      <button onClick={() => mudarStatusLote(lote.id, 'inadimplente')} style={{ padding: '7px 10px', background: 'rgba(248,113,113,.14)', color: '#dc2626', border: '0.5px solid #f87171', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>
                        Inadimp.
                      </button>
                      <button onClick={() => mudarStatusLote(lote.id, 'a_entregar')} style={{ padding: '7px 10px', background: '#e2e8f0', color: '#5b6b84', border: '0.5px solid #64748b', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>
                        Voltar
                      </button>
                    </>
                  )}
                  {modalStatus === 'nao_assinou' && (
                    <>
                      <button onClick={() => mudarStatusLote(lote.id, 'assinar_contrato')} style={{ flex: 1, padding: '7px', background: 'rgba(167,139,250,.14)', color: '#7c3aed', border: '0.5px solid #a78bfa', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                        Reenviar contrato
                      </button>
                      <select
                        onChange={(e) => { if (e.target.value) { mudarStatusLote(lote.id, e.target.value); e.target.value = '' } }}
                        defaultValue=""
                        style={{ padding: '7px 10px', background: '#ffffff', color: '#5b6b84', border: '0.5px solid rgba(15,23,42,0.12)', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}
                      >
                        <option value="" disabled>Mover para...</option>
                        <option value="emitir_contrato">📝 Emitir contrato</option>
                        <option value="a_entregar">📦 A entregar</option>
                        <option value="entregue">✅ Entregue</option>
                        <option value="pago">💰 Pago</option>
                        <option value="inadimplente">⚠️ Inadimplente</option>
                      </select>
                    </>
                  )}
                  {modalStatus === 'inadimplente' && (
                    <>
                      <button onClick={() => setModalComprovante(lote)} style={{ flex: 1, padding: '7px', background: 'rgba(52,211,153,.14)', color: '#059669', border: '0.5px solid #34d399', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                        📎 Pago + comprovante
                      </button>
                      <select
                        onChange={(e) => { if (e.target.value) { mudarStatusLote(lote.id, e.target.value); e.target.value = '' } }}
                        defaultValue=""
                        style={{ padding: '7px 10px', background: '#ffffff', color: '#5b6b84', border: '0.5px solid rgba(15,23,42,0.12)', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}
                      >
                        <option value="" disabled>Mover para...</option>
                        <option value="emitir_contrato">📝 Emitir contrato</option>
                        <option value="assinar_contrato">✍️ Assinar contrato</option>
                        <option value="a_entregar">📦 A entregar</option>
                        <option value="entregue">✅ Entregue</option>
                        <option value="nao_assinou">❌ Não assinou</option>
                      </select>
                    </>
                  )}
                  {modalStatus === 'pago' && (
                    <button onClick={() => mudarStatusLote(lote.id, 'entregue')} style={{ padding: '7px 10px', background: '#e2e8f0', color: '#5b6b84', border: '0.5px solid #64748b', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>
                      Desfazer pagamento
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}


      {/* Painel de avisos automáticos */}
      {(() => {
        const atrasadosEmissao = lotes.filter(l => l.status_pagamento === 'emitir_contrato')
        const atrasadosAssinatura = lotes.filter(l => l.status_pagamento === 'assinar_contrato' && diasDesde(l.data_compra) >= 1)
        const atrasadosEntrega = lotes.filter(l => l.status_pagamento === 'a_entregar' && diasDesde(l.data_compra) >= 7)
        const atrasadosPagamento = lotes.filter(l => l.status_pagamento === 'entregue' && diasDesde(l.data_entrega || l.data_compra) >= 1)

        if (atrasadosEmissao.length === 0 && atrasadosAssinatura.length === 0 && atrasadosPagamento.length === 0) return null

        return (
          <div style={{ background: 'rgba(248,113,113,.14)', border: '2.5px solid #f87171', borderRadius: 14, padding: '1rem 1.25rem', marginBottom: '1.25rem', boxShadow: '0 4px 16px rgba(248,113,113,0.15)' }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#dc2626', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 16 }}>🚨</span> Requer atenção agora
            </div>

            {atrasadosEmissao.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#5b6b84', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>
                  Aguardando emissão de contrato ({atrasadosEmissao.length})
                </div>
                {atrasadosEmissao.map(lote => {
                  const dias = diasDesde(lote.data_compra)
                  return (
                    <div key={lote.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#e2e8f0', borderRadius: 8, marginBottom: 6, border: '0.5px solid #5F5E5A40' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{lote.advogados?.nome_completo}</div>
                        <div style={{ fontSize: 11, color: '#5b6b84' }}>{lote.total_contratos} contrato{lote.total_contratos!==1?'s':''} · {fmt(lote.valor_total)}{(profile?.role === 'admin' || profile?.role === 'analista') ? ` · ${lote.profiles?.nome}` : ''}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: dias === 0 ? '#5b6b84' : '#dc2626' }}>{dias === 0 ? 'Hoje' : `${dias} dia${dias!==1?'s':''} sem emitir`}</div>
                        <button onClick={() => mudarStatusLote(lote.id, 'assinar_contrato')} style={{ fontSize: 11, padding: '3px 8px', background: '#a78bfa', color: '#232a37', border: 'none', borderRadius: 5, cursor: 'pointer', marginTop: 4 }}>
                          Marcar emitido
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {atrasadosAssinatura.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>
                  Contrato pendente de assinatura — +1 dia ({atrasadosAssinatura.length})
                </div>
                {atrasadosAssinatura.map(lote => {
                  const dias = diasDesde(lote.data_compra)
                  return (
                    <div key={lote.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'rgba(167,139,250,.14)', borderRadius: 8, marginBottom: 6, border: '0.5px solid #534AB740' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{lote.advogados?.nome_completo}</div>
                        <div style={{ fontSize: 11, color: '#7c3aed' }}>{lote.total_contratos} contrato{lote.total_contratos!==1?'s':''} · {fmt(lote.valor_total)}{(profile?.role === 'admin' || profile?.role === 'analista') ? ` · ${lote.profiles?.nome}` : ''}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: '#dc2626' }}>{dias} dia{dias!==1?'s':''} sem assinar</div>
                        <button onClick={() => mudarStatusLote(lote.id, 'a_entregar')} style={{ fontSize: 11, padding: '3px 8px', background: '#a78bfa', color: '#232a37', border: 'none', borderRadius: 5, cursor: 'pointer', marginTop: 4 }}>
                          Contrato assinado
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}



            {atrasadosPagamento.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>
                  Entregue — vira inadimplente em breve ({atrasadosPagamento.length})
                </div>
                {atrasadosPagamento.map(lote => {
                  const dias = diasDesde(lote.data_entrega || lote.data_compra)
                  const restam = Math.max(0, 2 - dias)
                  return (
                    <div key={lote.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'rgba(251,191,36,.12)', borderRadius: 8, marginBottom: 6, border: '0.5px solid #85400B40' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{lote.advogados?.nome_completo}</div>
                        <div style={{ fontSize: 11, color: '#b45309' }}>{lote.total_contratos} contrato{lote.total_contratos!==1?'s':''} · {fmt(lote.valor_total)}{(profile?.role === 'admin' || profile?.role === 'analista') ? ` · ${lote.profiles?.nome}` : ''}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                        <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 500 }}>{restam === 0 ? 'Vira inadimp. hoje' : `${restam}d restante${restam!==1?'s':''}`}</div>
                        <button onClick={() => setModalComprovante(lote)} style={{ fontSize: 11, padding: '3px 8px', background: '#34d399', color: '#232a37', border: 'none', borderRadius: 5, cursor: 'pointer', marginTop: 4 }}>
                          Marcar pago
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: periodo === 'custom' ? '0.5rem' : '1.25rem', flexWrap: 'wrap' }}>
        <select style={{ padding: '8px 10px', fontSize: 13, border: '0.5px solid rgba(15,23,42,0.12)', borderRadius: 8, background: '#ffffff', color: '#0f172a', outline: 'none' }} value={periodo} onChange={e => { setPeriodo(e.target.value); if(e.target.value !== 'custom') { setDataInicio(''); setDataFim('') } }}>
          <option value="hoje">Hoje</option>
          <option value="semana">Esta semana</option>
          <option value="mes">Este mês</option>
          <option value="total">Todo período</option>
          <option value="custom">Período personalizado</option>
        </select>
        {(profile?.role === 'admin' || profile?.role === 'analista') && (
          <select style={{ padding: '8px 10px', fontSize: 13, border: '0.5px solid rgba(15,23,42,0.12)', borderRadius: 8, background: '#ffffff', color: '#0f172a', outline: 'none' }} value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}>
            <option value="">Todos os vendedores</option>
            {vendedores.map(v => <option key={v.id}>{v.nome}</option>)}
          </select>
        )}
        <select style={{ padding: '8px 10px', fontSize: 13, border: '0.5px solid rgba(15,23,42,0.12)', borderRadius: 8, background: '#ffffff', color: '#0f172a', outline: 'none' }} value={filtroProduto} onChange={e => setFiltroProduto(e.target.value)}>
          <option value="">Todos produtos</option>
          <option value="Maternidade">Maternidade</option>
          <option value="Pensão por Morte">Pensão por Morte</option>
          <option value="BPC">BPC</option>
          <option value="Auxilio Acidente">Aux. Acidente</option>
        </select>
        <div style={{ padding: '8px 12px', background: '#e2e8f0', borderRadius: 8, fontSize: 13, color: '#5b6b84', display: 'flex', alignItems: 'center' }}>
          {comprasFiltradasFaturaveis.length} contrato{comprasFiltradasFaturaveis.length!==1?'s':''}
        </div>
      </div>
      {periodo === 'custom' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, color: '#5b6b84' }}>De</div>
          <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
            style={{ padding: '8px 10px', fontSize: 13, border: '0.5px solid rgba(15,23,42,0.12)', borderRadius: 8, background: '#ffffff', color: '#0f172a', outline: 'none' }} />
          <div style={{ fontSize: 13, color: '#5b6b84' }}>até</div>
          <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
            style={{ padding: '8px 10px', fontSize: 13, border: '0.5px solid rgba(15,23,42,0.12)', borderRadius: 8, background: '#ffffff', color: '#0f172a', outline: 'none' }} />
          {dataInicio && dataFim && (
            <div style={{ padding: '8px 12px', background: 'rgba(96,165,250,.12)', borderRadius: 8, fontSize: 12, color: '#2563eb', fontWeight: 500 }}>
              {dataInicio} → {dataFim}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginBottom: '1.25rem' }}>
        {/* Por produto */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', marginBottom: 12 }}>Por produto</div>
          {['Maternidade','Pensão por Morte','Auxilio Acidente'].map(p => {
            const qtd = porProduto[p] || 0
            const pct = comprasFiltradasFaturaveis.length > 0 ? Math.round((qtd/comprasFiltradasFaturaveis.length)*100) : 0
            return (
              <div key={p} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                  <span style={{ color: PROD_STYLE[p]?.color, fontWeight: 500 }}>{p==='Auxilio Acidente'?'Aux. Acidente':p}</span>
                  <span style={{ fontWeight: 500 }}>{qtd} <span style={{ color: '#64748b', fontWeight: 400 }}>({pct}%)</span></span>
                </div>
                <div style={{ background: '#e2e8f0', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: PROD_STYLE[p]?.color, borderRadius: 4, transition: 'width 0.4s' }}></div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Ranking */}
        <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', marginBottom: 12 }}>Ranking de vendedoras</div>
            {ranking.length === 0 && <div style={{ color: '#64748b', fontSize: 13 }}>Nenhuma venda no período</div>}
            {ranking.map(([nome, qtd], i) => (
              <div key={nome} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, padding: '8px 10px', background: i===0?'rgba(251,191,36,.12)':'#f2f5fa', borderRadius: 8 }}>
                <div style={{ fontSize: 18, width: 28 }}>{MEDAL[i]||`${i+1}º`}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{nome}</div>
                  <div style={{ fontSize: 11, color: '#5b6b84' }}>{qtd} contrato{qtd!==1?'s':''} · {fmt(qtd*299)}</div>
                </div>
                <div style={{ fontSize: 20, fontWeight: 500, color: i===0?'#b45309':'#2563eb' }}>{qtd}</div>
              </div>
            ))}
        </div>
      </div>

      {/* Alertas críticos */}
      {advCriticos.length > 0 && (
        <div style={{ ...card, marginBottom: '1.25rem', borderColor: 'rgba(248,113,113,.35)' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#dc2626', marginBottom: 12 }}>⚠️ Advogados críticos — +30 dias sem comprar</div>
          {advCriticos.map(a => {
            const dias = diasDesde(a.ultima_compra)
            return (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '0.5px solid rgba(15,23,42,0.06)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{a.nome_completo}</div>
                  <div style={{ fontSize: 11, color: '#5b6b84' }}>{a.oab}{profile?.role==='admin'?` · ${a.profiles?.nome||'—'}`:''}</div>
                </div>
                <div style={{ fontSize: 12, color: '#dc2626', fontWeight: 500, textAlign: 'right' }}>
                  {dias} dias<br/><span style={{ fontWeight: 400, color: '#64748b', fontSize: 11 }}>sem comprar</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Histórico por dia */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', marginBottom: 12 }}>Histórico de vendas por dia</div>
        {diasOrdenados.length === 0 && <div style={{ color: '#64748b', fontSize: 13 }}>Nenhuma venda no período</div>}
        {diasOrdenados.map(([data, info]) => (
          <div key={data} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '0.5px solid rgba(15,23,42,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{data}</div>
              <div style={{ fontSize: 13, color: '#2563eb', fontWeight: 500 }}>{info.total} contrato{info.total!==1?'s':''} · {fmt(info.total*299)}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(info.produtos).map(([prod, qtd]) => (
                <span key={prod} style={{ padding: '3px 8px', borderRadius: 6, fontSize: 12, background: PROD_STYLE[prod]?.bg, color: PROD_STYLE[prod]?.color, fontWeight: 500 }}>
                  {qtd}x {prod==='Auxilio Acidente'?'Aux. Acidente':prod}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {modalComprovante && (
        <ModalComprovante
          lote={modalComprovante}
          onClose={() => setModalComprovante(null)}
          onConfirm={confirmarPagamento}
        />
      )}
    </div>
  )
}
