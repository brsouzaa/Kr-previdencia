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
  'Maternidade': { bg: '#E1F5EE', color: '#0F6E56' },
  'BPC': { bg: '#EEEDFE', color: '#534AB7' },
  'Auxilio Acidente': { bg: '#FAEEDA', color: '#854F0B' },
}

const STATUS_LOTE = {
  emitir_contrato: { bg: '#F1EFE8', color: '#5F5E5A', label: 'Emitir contrato' },
  assinar_contrato: { bg: '#EEEDFE', color: '#534AB7', label: 'Assinar contrato' },
  a_entregar: { bg: '#E6F1FB', color: '#185FA5', label: 'A entregar' },
  entregue: { bg: '#FAEEDA', color: '#854F0B', label: 'Entregue' },
  pago: { bg: '#EAF3DE', color: '#3B6D11', label: 'Pago' },
  inadimplente: { bg: '#FCEBEB', color: '#A32D2D', label: 'Inadimplente' },
}

function hoje() { return new Date().toISOString().slice(0,10) }
function semanaAtras() { const d=new Date(); d.setDate(d.getDate()-7); return d.toISOString().slice(0,10) }
function mesAtras() { const d=new Date(); d.setDate(d.getDate()-30); return d.toISOString().slice(0,10) }
const MEDAL = ['🥇','🥈','🥉']
const fmt = v => `R$ ${Number(v).toLocaleString('pt-BR')}`

function diasDesde(data) {
  return Math.floor((Date.now() - new Date(data)) / 86400000)
}

export default function Dashboard() {
  const { profile } = useAuth()
  const isMobile = useIsMobile()
  const [vendedores, setVendedores] = useState([])
  const [filtroVendedor, setFiltroVendedor] = useState('')
  const [filtroProduto, setFiltroProduto] = useState('')
  const [periodo, setPeriodo] = useState('mes')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [compras, setCompras] = useState([])
  const [lotes, setLotes] = useState([])
  const [advCriticos, setAdvCriticos] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalStatus, setModalStatus] = useState(null) // 'a_entregar' | 'entregue' | 'pago' | 'inadimplente'
  const [modalComprovante, setModalComprovante] = useState(null)

  useEffect(() => {
    if (profile?.role === 'admin') {
      supabase.from('profiles').select('id, nome').eq('role', 'vendedor').order('nome').then(({ data }) => setVendedores(data || []))
    }
    fetchDados()
  }, [profile])

  async function fetchDados() {
    setLoading(true)
    let qC = supabase.from('compras').select('id, produto, data_compra, vendedor_id, profiles(nome)').order('data_compra', { ascending: false })
    let qL = supabase.from('lotes').select('*, advogados(nome_completo, oab, cidade), profiles(nome)').order('data_compra', { ascending: false })
    let qA = supabase.from('advogados').select('id, nome_completo, oab, ultima_compra, status, profiles!advogados_vendedor_id_fkey(nome)').eq('status', 'vermelho').not('ultima_compra', 'is', null).order('ultima_compra', { ascending: true }).limit(10)

    if (profile?.role !== 'admin') {
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
    if (periodo === 'mes') return { inicio: mesAtras(), fim: hoje() }
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
      const dentroDoP = (!inicio || l.data_compra >= inicio) && (!fim || l.data_compra <= fim)
      const vendedorOk = !filtroVendedor || l.profiles?.nome === filtroVendedor
      return dentroDoP && vendedorOk
    })
  }

  const comprasFiltradas = filtrarCompras(compras)
  const lotesFiltrados = filtrarLotes(lotes)

  const vendas = {
    hoje: compras.filter(c => c.data_compra === hoje()).length,
    semana: compras.filter(c => c.data_compra >= semanaAtras()).length,
    mes: compras.filter(c => c.data_compra >= mesAtras()).length,
    total: compras.length,
  }

  const financeiro = {
    emitir_contrato: lotesFiltrados.filter(l => l.status_pagamento === 'emitir_contrato').reduce((s,l) => s + Number(l.valor_total), 0),
    assinar_contrato: lotesFiltrados.filter(l => l.status_pagamento === 'assinar_contrato').reduce((s,l) => s + Number(l.valor_total), 0),
    a_entregar: lotesFiltrados.filter(l => l.status_pagamento === 'a_entregar').reduce((s,l) => s + Number(l.valor_total), 0),
    entregue: lotesFiltrados.filter(l => l.status_pagamento === 'entregue').reduce((s,l) => s + Number(l.valor_total), 0),
    pago: lotesFiltrados.filter(l => l.status_pagamento === 'pago').reduce((s,l) => s + Number(l.valor_total), 0),
    inadimplente: lotesFiltrados.filter(l => l.status_pagamento === 'inadimplente').reduce((s,l) => s + Number(l.valor_total), 0),
  }

  const contagem = {
    emitir_contrato: lotesFiltrados.filter(l => l.status_pagamento === 'emitir_contrato').length,
    assinar_contrato: lotesFiltrados.filter(l => l.status_pagamento === 'assinar_contrato').length,
    a_entregar: lotesFiltrados.filter(l => l.status_pagamento === 'a_entregar').length,
    entregue: lotesFiltrados.filter(l => l.status_pagamento === 'entregue').length,
    pago: lotesFiltrados.filter(l => l.status_pagamento === 'pago').length,
    inadimplente: lotesFiltrados.filter(l => l.status_pagamento === 'inadimplente').length,
  }

  const porProduto = comprasFiltradas.reduce((acc, c) => { acc[c.produto] = (acc[c.produto] || 0) + 1; return acc }, {})
  const rankingMap = comprasFiltradas.reduce((acc, c) => { const n = c.profiles?.nome || 'Sem nome'; acc[n] = (acc[n] || 0) + 1; return acc }, {})
  const ranking = Object.entries(rankingMap).sort((a, b) => b[1] - a[1])
  const porDia = comprasFiltradas.reduce((acc, c) => { const d = c.data_compra; if (!acc[d]) acc[d] = { total: 0, produtos: {} }; acc[d].total++; acc[d].produtos[c.produto] = (acc[d].produtos[c.produto] || 0) + 1; return acc }, {})
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

  const card = { background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: '14px 16px' }

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>Carregando...</div>

  // Lotes do modal selecionado
  const lotesModal = modalStatus ? lotesFiltrados.filter(l => l.status_pagamento === modalStatus) : []
  const valorModal = lotesModal.reduce((s, l) => s + Number(l.valor_total), 0)

  return (
    <div>
      <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 500, color: '#111', marginBottom: '1.25rem' }}>Dashboard de vendas</div>

      {/* Métricas contratos */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: 10, marginBottom: '1rem' }}>
        {[['Hoje', vendas.hoje, '#185FA5'], ['Esta semana', vendas.semana, '#0F6E56'], ['Este mês', vendas.mes, '#854F0B'], ['Total geral', vendas.total, '#111']].map(([l,v,c]) => (
          <div key={l} style={card}>
            <div style={{ fontSize: 11, color: c, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, opacity: 0.8 }}>{l}</div>
            <div style={{ fontSize: 28, fontWeight: 500, color: c }}>{v}</div>
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>contrato{v!==1?'s':''}</div>
          </div>
        ))}
      </div>

      {/* Cards de status clicáveis */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: 10, marginBottom: '1.25rem' }}>
        {[
          ['emitir_contrato', 'Emitir contrato', financeiro.emitir_contrato, '#5F5E5A', '#F1EFE8'],
          ['assinar_contrato', 'Assinar contrato', financeiro.assinar_contrato, '#534AB7', '#EEEDFE'],
          ['a_entregar', 'A entregar', financeiro.a_entregar, '#185FA5', '#E6F1FB'],
          ['entregue', 'Entregue', financeiro.entregue, '#854F0B', '#FAEEDA'],
          ['pago', 'Pago', financeiro.pago, '#3B6D11', '#EAF3DE'],
          ['inadimplente', 'Inadimplente', financeiro.inadimplente, '#A32D2D', '#FCEBEB'],
        ].map(([st, label, valor, cor, bg]) => (
          <div key={st} onClick={() => setModalStatus(st === modalStatus ? null : st)}
            style={{ background: modalStatus === st ? bg : '#fff', border: `${modalStatus === st ? 2 : 0.5}px solid ${cor}${modalStatus === st ? '' : '40'}`, borderRadius: 12, padding: '14px 16px', cursor: 'pointer', transition: 'all 0.15s' }}>
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
        <div style={{ background: '#fff', border: `1.5px solid ${STATUS_LOTE[modalStatus]?.color}40`, borderRadius: 14, padding: '1.25rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 500, color: STATUS_LOTE[modalStatus]?.color }}>{STATUS_LOTE[modalStatus]?.label}</span>
              <span style={{ fontSize: 13, color: '#888', marginLeft: 8 }}>{lotesModal.length} lote{lotesModal.length!==1?'s':''} · {fmt(valorModal)}</span>
            </div>
            <button onClick={() => setModalStatus(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#888' }}>×</button>
          </div>

          {lotesModal.length === 0 && <div style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: '1.5rem' }}>Nenhum lote neste status</div>}

          {lotesModal.map(lote => {
            const dias = diasDesde(lote.data_compra)
            const alerta = modalStatus === 'a_entregar' && dias >= 3
            return (
              <div key={lote.id} style={{ border: `0.5px solid ${alerta ? '#A32D2D' : 'rgba(0,0,0,0.08)'}`, borderRadius: 10, padding: 12, marginBottom: 10, background: alerta ? '#FCEBEB40' : '#f8f8f6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{lote.advogados?.nome_completo}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>{lote.advogados?.oab} · {lote.advogados?.cidade}</div>
                    {profile?.role === 'admin' && <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>Vendedor: {lote.profiles?.nome}</div>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{fmt(lote.valor_total)}</div>
                    <div style={{ fontSize: 11, color: alerta ? '#A32D2D' : '#888' }}>{lote.total_contratos} contrato{lote.total_contratos!==1?'s':''} · {dias}d atrás</div>
                  </div>
                </div>

                {/* Data de entrega se entregue/pago */}
                {lote.data_entrega && <div style={{ fontSize: 11, color: '#854F0B', marginBottom: 8 }}>Entregue em {lote.data_entrega}</div>}
                {lote.status_pagamento === 'pago' && lote.data_pagamento && (
                  <div style={{ fontSize: 11, color: '#3B6D11', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    ✓ Pago em {lote.data_pagamento}
                    {lote.comprovante_url && <button onClick={() => verComprovante(lote)} style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: 11, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Ver comprovante</button>}
                  </div>
                )}

                {/* Ações por status */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {modalStatus === 'emitir_contrato' && (
                    <>
                      <button onClick={() => mudarStatusLote(lote.id, 'assinar_contrato')} style={{ flex: 1, padding: '7px', background: '#EEEDFE', color: '#534AB7', border: '0.5px solid #534AB7', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                        ✓ Contrato emitido
                      </button>
                      <button onClick={() => mudarStatusLote(lote.id, 'inadimplente')} style={{ padding: '7px 10px', background: '#FCEBEB', color: '#A32D2D', border: '0.5px solid #A32D2D', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>
                        Inadimp.
                      </button>
                    </>
                  )}
                  {modalStatus === 'assinar_contrato' && (
                    <>
                      <button onClick={() => mudarStatusLote(lote.id, 'a_entregar')} style={{ flex: 1, padding: '7px', background: '#E6F1FB', color: '#185FA5', border: '0.5px solid #185FA5', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                        ✓ Contrato assinado
                      </button>
                      <button onClick={() => mudarStatusLote(lote.id, 'inadimplente')} style={{ padding: '7px 10px', background: '#FCEBEB', color: '#A32D2D', border: '0.5px solid #A32D2D', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>
                        Inadimp.
                      </button>
                    </>
                  )}
                  {modalStatus === 'a_entregar' && (
                    <>
                      <button onClick={() => mudarStatusLote(lote.id, 'entregue')} style={{ flex: 1, padding: '7px', background: '#FAEEDA', color: '#854F0B', border: '0.5px solid #854F0B', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                        ✓ Marcar entregue
                      </button>
                      <button onClick={() => mudarStatusLote(lote.id, 'inadimplente')} style={{ padding: '7px 10px', background: '#FCEBEB', color: '#A32D2D', border: '0.5px solid #A32D2D', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>
                        Inadimp.
                      </button>
                    </>
                  )}
                  {modalStatus === 'entregue' && (
                    <>
                      <button onClick={() => setModalComprovante(lote)} style={{ flex: 1, padding: '7px', background: '#EAF3DE', color: '#3B6D11', border: '0.5px solid #3B6D11', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                        📎 Pago + comprovante
                      </button>
                      <button onClick={() => mudarStatusLote(lote.id, 'inadimplente')} style={{ padding: '7px 10px', background: '#FCEBEB', color: '#A32D2D', border: '0.5px solid #A32D2D', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>
                        Inadimp.
                      </button>
                      <button onClick={() => mudarStatusLote(lote.id, 'a_entregar')} style={{ padding: '7px 10px', background: '#f0f0ee', color: '#888', border: '0.5px solid #ccc', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>
                        Voltar
                      </button>
                    </>
                  )}
                  {modalStatus === 'inadimplente' && (
                    <>
                      <button onClick={() => mudarStatusLote(lote.id, 'entregue')} style={{ flex: 1, padding: '7px', background: '#FAEEDA', color: '#854F0B', border: '0.5px solid #854F0B', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>
                        Reativar
                      </button>
                      <button onClick={() => setModalComprovante(lote)} style={{ flex: 1, padding: '7px', background: '#EAF3DE', color: '#3B6D11', border: '0.5px solid #3B6D11', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                        📎 Pago + comprovante
                      </button>
                    </>
                  )}
                  {modalStatus === 'pago' && (
                    <button onClick={() => mudarStatusLote(lote.id, 'entregue')} style={{ padding: '7px 10px', background: '#f0f0ee', color: '#888', border: '0.5px solid #ccc', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>
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
        const atrasadosEntrega = lotes.filter(l => l.status_pagamento === 'a_entregar' && diasDesde(l.data_compra) >= 3)
        const atrasadosPagamento = lotes.filter(l => l.status_pagamento === 'entregue' && diasDesde(l.data_entrega || l.data_compra) >= 1)

        if (atrasadosEmissao.length === 0 && atrasadosAssinatura.length === 0 && atrasadosEntrega.length === 0 && atrasadosPagamento.length === 0) return null

        return (
          <div style={{ background: '#fff', border: '1.5px solid #E24B4A', borderRadius: 14, padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#A32D2D', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 16 }}>🚨</span> Requer atenção agora
            </div>

            {atrasadosEmissao.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#5F5E5A', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>
                  Aguardando emissão de contrato ({atrasadosEmissao.length})
                </div>
                {atrasadosEmissao.map(lote => {
                  const dias = diasDesde(lote.data_compra)
                  return (
                    <div key={lote.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#F1EFE8', borderRadius: 8, marginBottom: 6, border: '0.5px solid #5F5E5A40' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{lote.advogados?.nome_completo}</div>
                        <div style={{ fontSize: 11, color: '#5F5E5A' }}>{lote.total_contratos} contrato{lote.total_contratos!==1?'s':''} · {fmt(lote.valor_total)}{profile?.role === 'admin' ? ` · ${lote.profiles?.nome}` : ''}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: dias === 0 ? '#5F5E5A' : '#A32D2D' }}>{dias === 0 ? 'Hoje' : `${dias} dia${dias!==1?'s':''} sem emitir`}</div>
                        <button onClick={() => mudarStatusLote(lote.id, 'assinar_contrato')} style={{ fontSize: 11, padding: '3px 8px', background: '#534AB7', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', marginTop: 4 }}>
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
                <div style={{ fontSize: 12, fontWeight: 500, color: '#534AB7', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>
                  Contrato pendente de assinatura — +1 dia ({atrasadosAssinatura.length})
                </div>
                {atrasadosAssinatura.map(lote => {
                  const dias = diasDesde(lote.data_compra)
                  return (
                    <div key={lote.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#EEEDFE', borderRadius: 8, marginBottom: 6, border: '0.5px solid #534AB740' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{lote.advogados?.nome_completo}</div>
                        <div style={{ fontSize: 11, color: '#534AB7' }}>{lote.total_contratos} contrato{lote.total_contratos!==1?'s':''} · {fmt(lote.valor_total)}{profile?.role === 'admin' ? ` · ${lote.profiles?.nome}` : ''}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: '#A32D2D' }}>{dias} dia{dias!==1?'s':''} sem assinar</div>
                        <button onClick={() => mudarStatusLote(lote.id, 'a_entregar')} style={{ fontSize: 11, padding: '3px 8px', background: '#534AB7', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', marginTop: 4 }}>
                          Contrato assinado
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {atrasadosEntrega.length > 0 && (
              <div style={{ marginBottom: atrasadosPagamento.length > 0 ? 14 : 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#185FA5', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>
                  Entrega atrasada — +3 dias ({atrasadosEntrega.length})
                </div>
                {atrasadosEntrega.map(lote => {
                  const dias = diasDesde(lote.data_compra)
                  return (
                    <div key={lote.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#E6F1FB', borderRadius: 8, marginBottom: 6, border: '0.5px solid #185FA540' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{lote.advogados?.nome_completo}</div>
                        <div style={{ fontSize: 11, color: '#185FA5' }}>{lote.total_contratos} contrato{lote.total_contratos!==1?'s':''} · {fmt(lote.valor_total)}{profile?.role === 'admin' ? ` · ${lote.profiles?.nome}` : ''}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: '#A32D2D' }}>{dias} dias atrasado</div>
                        <button onClick={() => mudarStatusLote(lote.id, 'entregue')} style={{ fontSize: 11, padding: '3px 8px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', marginTop: 4 }}>
                          Marcar entregue
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {atrasadosPagamento.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#A32D2D', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>
                  Entregue — vira inadimplente em breve ({atrasadosPagamento.length})
                </div>
                {atrasadosPagamento.map(lote => {
                  const dias = diasDesde(lote.data_entrega || lote.data_compra)
                  const restam = Math.max(0, 2 - dias)
                  return (
                    <div key={lote.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#FAEEDA', borderRadius: 8, marginBottom: 6, border: '0.5px solid #85400B40' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{lote.advogados?.nome_completo}</div>
                        <div style={{ fontSize: 11, color: '#854F0B' }}>{lote.total_contratos} contrato{lote.total_contratos!==1?'s':''} · {fmt(lote.valor_total)}{profile?.role === 'admin' ? ` · ${lote.profiles?.nome}` : ''}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                        <div style={{ fontSize: 11, color: '#A32D2D', fontWeight: 500 }}>{restam === 0 ? 'Vira inadimp. hoje' : `${restam}d restante${restam!==1?'s':''}`}</div>
                        <button onClick={() => setModalComprovante(lote)} style={{ fontSize: 11, padding: '3px 8px', background: '#3B6D11', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', marginTop: 4 }}>
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
        <select style={{ padding: '8px 10px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 8, background: '#fff', color: '#111', outline: 'none' }} value={periodo} onChange={e => { setPeriodo(e.target.value); if(e.target.value !== 'custom') { setDataInicio(''); setDataFim('') } }}>
          <option value="hoje">Hoje</option>
          <option value="semana">Esta semana</option>
          <option value="mes">Este mês</option>
          <option value="total">Todo período</option>
          <option value="custom">Período personalizado</option>
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
          {comprasFiltradas.length} contrato{comprasFiltradas.length!==1?'s':''}
        </div>
      </div>
      {periodo === 'custom' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, color: '#888' }}>De</div>
          <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
            style={{ padding: '8px 10px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 8, background: '#fff', color: '#111', outline: 'none' }} />
          <div style={{ fontSize: 13, color: '#888' }}>até</div>
          <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
            style={{ padding: '8px 10px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 8, background: '#fff', color: '#111', outline: 'none' }} />
          {dataInicio && dataFim && (
            <div style={{ padding: '8px 12px', background: '#E6F1FB', borderRadius: 8, fontSize: 12, color: '#185FA5', fontWeight: 500 }}>
              {dataInicio} → {dataFim}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginBottom: '1.25rem' }}>
        {/* Por produto */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#111', marginBottom: 12 }}>Por produto</div>
          {['Maternidade','BPC','Auxilio Acidente'].map(p => {
            const qtd = porProduto[p] || 0
            const pct = comprasFiltradas.length > 0 ? Math.round((qtd/comprasFiltradas.length)*100) : 0
            return (
              <div key={p} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                  <span style={{ color: PROD_STYLE[p]?.color, fontWeight: 500 }}>{p==='Auxilio Acidente'?'Aux. Acidente':p}</span>
                  <span style={{ fontWeight: 500 }}>{qtd} <span style={{ color: '#aaa', fontWeight: 400 }}>({pct}%)</span></span>
                </div>
                <div style={{ background: '#f0f0ee', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: PROD_STYLE[p]?.color, borderRadius: 4, transition: 'width 0.4s' }}></div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Ranking */}
        <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#111', marginBottom: 12 }}>Ranking de vendedoras</div>
            {ranking.length === 0 && <div style={{ color: '#aaa', fontSize: 13 }}>Nenhuma venda no período</div>}
            {ranking.map(([nome, qtd], i) => (
              <div key={nome} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, padding: '8px 10px', background: i===0?'#FAEEDA':'#f8f8f6', borderRadius: 8 }}>
                <div style={{ fontSize: 18, width: 28 }}>{MEDAL[i]||`${i+1}º`}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{nome}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>{qtd} contrato{qtd!==1?'s':''} · {fmt(qtd*299)}</div>
                </div>
                <div style={{ fontSize: 20, fontWeight: 500, color: i===0?'#854F0B':'#185FA5' }}>{qtd}</div>
              </div>
            ))}
        </div>
      </div>

      {/* Alertas críticos */}
      {advCriticos.length > 0 && (
        <div style={{ ...card, marginBottom: '1.25rem', borderColor: '#F09595' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#A32D2D', marginBottom: 12 }}>⚠️ Advogados críticos — +30 dias sem comprar</div>
          {advCriticos.map(a => {
            const dias = diasDesde(a.ultima_compra)
            return (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{a.nome_completo}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>{a.oab}{profile?.role==='admin'?` · ${a.profiles?.nome||'—'}`:''}</div>
                </div>
                <div style={{ fontSize: 12, color: '#A32D2D', fontWeight: 500, textAlign: 'right' }}>
                  {dias} dias<br/><span style={{ fontWeight: 400, color: '#aaa', fontSize: 11 }}>sem comprar</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Histórico por dia */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#111', marginBottom: 12 }}>Histórico de vendas por dia</div>
        {diasOrdenados.length === 0 && <div style={{ color: '#aaa', fontSize: 13 }}>Nenhuma venda no período</div>}
        {diasOrdenados.map(([data, info]) => (
          <div key={data} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{data}</div>
              <div style={{ fontSize: 13, color: '#185FA5', fontWeight: 500 }}>{info.total} contrato{info.total!==1?'s':''} · {fmt(info.total*299)}</div>
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
