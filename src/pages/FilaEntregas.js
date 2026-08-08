import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function diasRestantes(dataLimite) {
  if (!dataLimite) return null
  return Math.ceil((new Date(dataLimite + 'T23:59:59') - new Date()) / 86400000)
}
function diasDesde(data) { return Math.floor((Date.now() - new Date(data)) / 86400000) }

function urgencia(restam) {
  if (restam === null) return { bg: '#232a37', border: 'rgba(255,255,255,0.08)', badgeBg: '#2b3340', badgeColor: '#8b9bb4' }
  if (restam <= 0) return { bg: 'rgba(248,113,113,.14)', border: '#A32D2D50', badgeBg: '#f87171', badgeColor: '#232a37' }
  if (restam <= 2) return { bg: 'rgba(251,191,36,.12)', border: '#854F0B50', badgeBg: '#fbbf24', badgeColor: '#232a37' }
  return { bg: 'rgba(52,211,153,.14)', border: '#3B6D1150', badgeBg: '#34d399', badgeColor: '#232a37' }
}

function isUrlValida(url) {
  if (!url || typeof url !== 'string') return false
  try { const u = new URL(url.trim()); return u.protocol === 'http:' || u.protocol === 'https:' } catch { return false }
}

const STATUS_LABELS = {
  aguardando_emissao: { txt: '⏳ A emitir', cor: '#8b9bb4' },
  emitido: { txt: '✉️ Aguardando assinar', cor: '#fbbf24' },
  expirado: { txt: '❌ Expirou', cor: '#f87171' },
  cancelado: { txt: '❌ Cancelado', cor: '#f87171' },
  assinado: { txt: '✅ Assinou', cor: '#34d399' },
  aguardando_pos_venda: { txt: '📞 Pós-venda', cor: '#60a5fa' },
  em_contato_pos_venda: { txt: '📞 Em contato', cor: '#60a5fa' },
  validado_pos_venda: { txt: '✅ Pós-venda OK', cor: '#34d399' },
  em_validacao: { txt: '🔍 Pra validar', cor: '#fbbf24' },
  validado: { txt: '✅ Validado', cor: '#34d399' },
  entregue: { txt: '✅ Entregue', cor: '#34d399' },
  barrado_pos_venda: { txt: '🚫 Barrado', cor: '#f87171' },
  devolvido_correcao_doc: { txt: '↩️ Devolvido', cor: '#fbbf24' },
  devolvido_reemissao: { txt: '↩️ Reemitir', cor: '#fbbf24' },
}

export default function FilaEntregas() {
  const [lotes, setLotes] = useState([])
  const [filtroProduto, setFiltroProduto] = useState('')
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState({})
  const [profile, setProfile] = useState(null)

  // Modal devolver cliente
  const [devolvendo, setDevolvendo] = useState(null) // { cliente, lote }
  const [motivoDevolucao, setMotivoDevolucao] = useState('')
  const [salvandoDevolucao, setSalvandoDevolucao] = useState(false)

  // Estado da validação por cliente
  const [validandoCliente, setValidandoCliente] = useState({})

  // Modal edicao manual do lote
  const [editandoLote, setEditandoLote] = useState(null) // { id, total_contratos, qtd_assinados, advogado_nome }
  const [editTotal, setEditTotal] = useState('')
  const [editAssinados, setEditAssinados] = useState('')
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)

  // Painel lateral do cliente (ficha + docs)
  const [clienteAberto, setClienteAberto] = useState(null) // cliente_id
  const [clienteDetalhe, setClienteDetalhe] = useState(null) // dados completos
  const [carregandoCliente, setCarregandoCliente] = useState(false)
  const [zapsignDocs, setZapsignDocs] = useState(null) // links assinados
  const [carregandoZapsign, setCarregandoZapsign] = useState(false)

  // Modal entrega parcial
  const [confirmandoEntrega, setConfirmandoEntrega] = useState(null) // lote
  const [salvandoEntrega, setSalvandoEntrega] = useState(false)

  useEffect(() => { fetchProfile(); fetchFila() }, [])

  async function fetchProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof)
    }
  }

  async function fetchFila() {
    setLoading(true)
    const { data } = await supabase
      .from('lotes')
      .select('*, advogados(nome_completo, oab, cidade, estado, telefone, email), profiles(nome), clientes(id, nome, status, link_assinatura)')
      .eq('status_pagamento', 'a_entregar')
      .order('prioridade_fila', { ascending: false, nullsFirst: false })
      .order('data_prioridade', { ascending: true, nullsFirst: false })
      .order('data_compra', { ascending: true })
    setLotes(data || [])
    setLoading(false)
  }

  function atualizar(loteId, campos) {
    setLotes(ls => ls.map(l => l.id === loteId ? { ...l, ...campos } : l))
  }

  async function salvarCampo(loteId, campos) {
    setSalvando(s => ({ ...s, [loteId]: true }))
    await supabase.from('lotes').update({ ...campos, updated_at: new Date().toISOString() }).eq('id', loteId)
    setTimeout(() => setSalvando(s => ({ ...s, [loteId]: false })), 500)
  }

  async function abrirDevolucao(cliente, lote) {
    setDevolvendo({ cliente, lote })
    setMotivoDevolucao('')
  }

  async function abrirPainelCliente(clienteId) {
    setClienteAberto(clienteId)
    setClienteDetalhe(null)
    setZapsignDocs(null)
    setCarregandoCliente(true)
    const { data } = await supabase.from('clientes').select('*, profiles!clientes_vendedor_operador_id_fkey(nome)').eq('id', clienteId).single()
    setClienteDetalhe(data)
    setCarregandoCliente(false)
    // Buscar PDFs assinados do ZapSign em paralelo
    if (data?.zapsign_token) {
      setCarregandoZapsign(true)
      try {
        const r = await fetch(`https://api.zapsign.com.br/api/v1/docs/${data.zapsign_token}/`, {
          headers: { 'Authorization': 'Bearer 51c9009c-597c-436b-908d-92b3875c331bc2ef76e9-e116-4ba5-8342-e8ab3e1324cd' }
        })
        const j = await r.json()
        setZapsignDocs({
          contrato: j.signed_file || j.original_file,
          procuracao: j.extra_docs?.find(d => d.name?.toLowerCase().includes('procuracao'))?.signed_file || j.extra_docs?.[0]?.signed_file,
          termo: j.extra_docs?.find(d => d.name?.toLowerCase().includes('termo'))?.signed_file || j.extra_docs?.[1]?.signed_file,
          status: j.status,
        })
      } catch (e) { console.error('Erro ZapSign:', e) }
      setCarregandoZapsign(false)
    }
  }

  function fecharPainelCliente() {
    setClienteAberto(null)
    setClienteDetalhe(null)
    setZapsignDocs(null)
  }

  async function confirmarDevolucao() {
    if (!devolvendo || !motivoDevolucao.trim()) {
      alert('Motivo obrigatorio')
      return
    }
    setSalvandoDevolucao(true)
    try {
      const ANON = process.env.REACT_APP_SUPABASE_ANON_KEY || (await supabase.auth.getSession()).data.session?.access_token
      const r = await fetch('https://sdqslzpfbazehqcvibjy.supabase.co/functions/v1/gerar-contratos-zapsign/devolver-reemissao', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id: devolvendo.cliente.id,
          motivo: motivoDevolucao.trim(),
          analista_id: profile.id
        })
      })
      const j = await r.json()
      if (!j.ok) { alert('Erro: ' + (j.error || 'falhou')); setSalvandoDevolucao(false); return }
      setDevolvendo(null)
      setMotivoDevolucao('')
      await fetchFila()
    } catch (e) { alert('Erro: ' + e.message) }
    setSalvandoDevolucao(false)
  }

  async function validarCliente(cliente, lote) {
    if (!confirm(`Confirmar validação do cliente ${cliente.nome}?\nDocumentos e contrato OK.`)) return
    setValidandoCliente(v => ({ ...v, [cliente.id]: true }))
    try {
      const ANON = process.env.REACT_APP_SUPABASE_ANON_KEY || (await supabase.auth.getSession()).data.session?.access_token
      const r = await fetch('https://sdqslzpfbazehqcvibjy.supabase.co/functions/v1/gerar-contratos-zapsign/analista-validar-cliente', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: cliente.id, analista_id: profile.id })
      })
      const j = await r.json()
      if (!j.ok) { alert('Erro: ' + (j.error || 'falhou')); setValidandoCliente(v => ({ ...v, [cliente.id]: false })); return }
      await fetchFila()
    } catch (e) { alert('Erro: ' + e.message) }
    setValidandoCliente(v => ({ ...v, [cliente.id]: false }))
  }

  function abrirEdicaoManual(lote) {
    setEditandoLote(lote)
    setEditTotal(String(lote.total_contratos || 0))
    setEditAssinados(String(lote.qtd_assinados || 0))
  }

  async function salvarEdicaoManual() {
    if (!editandoLote) return
    const total = parseInt(editTotal, 10)
    const assinados = parseInt(editAssinados, 10)
    if (!Number.isInteger(total) || total < 1) { alert('Total de contratos deve ser >= 1'); return }
    if (!Number.isInteger(assinados) || assinados < 0) { alert('Quantidade de assinados deve ser >= 0'); return }
    if (assinados > total) { alert('Assinados nao pode ser maior que Total'); return }
    setSalvandoEdicao(true)
    try {
      const ANON = process.env.REACT_APP_SUPABASE_ANON_KEY || (await supabase.auth.getSession()).data.session?.access_token
      const r = await fetch('https://sdqslzpfbazehqcvibjy.supabase.co/functions/v1/gerar-contratos-zapsign/lote-editar-manual', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ lote_id: editandoLote.id, total_contratos: total, qtd_assinados: assinados, editor_id: profile.id })
      })
      const j = await r.json()
      if (!j.ok) { alert('Erro: ' + (j.error || 'falhou')); setSalvandoEdicao(false); return }
      setEditandoLote(null)
      await fetchFila()
      alert(`✅ Lote atualizado! Total: ${j.total_contratos} · Assinados: ${j.qtd_assinados} · Emitidos: ${j.qtd_emitidos}`)
    } catch (e) { alert('Erro: ' + e.message) }
    setSalvandoEdicao(false)
  }

  function tentarEntregar(lote) {
    if (!isUrlValida(lote.link_entrega)) {
      alert('⚠️ Cole o link da pasta no Drive antes de entregar (campo "Link da entrega")')
      return
    }
    // Verificar se lote tá completo
    const clientes = lote.clientes || []
    const total = lote.total_contratos
    const validados = clientes.filter(c => ['em_validacao','validado'].includes(c.status)).length
    const pendentes = clientes.filter(c => ['emitido','expirado','aguardando_pos_venda','em_contato_pos_venda','devolvido_correcao_doc','devolvido_reemissao','aguardando_emissao'].includes(c.status)).length

    if (validados === 0) {
      alert('Nenhum cliente pronto pra entregar (em_validacao/validado)')
      return
    }
    // Lote completo? entrega direto
    if (validados >= total && pendentes === 0) {
      executarEntrega(lote, false)
      return
    }
    // Incompleto: abre modal pra escolher
    setConfirmandoEntrega(lote)
  }

  async function executarEntrega(lote, cancelarPendentes) {
    setSalvandoEntrega(true)
    try {
      const ANON = process.env.REACT_APP_SUPABASE_ANON_KEY || (await supabase.auth.getSession()).data.session?.access_token
      const r = await fetch('https://sdqslzpfbazehqcvibjy.supabase.co/functions/v1/gerar-contratos-zapsign/lote-entregar', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lote_id: lote.id,
          analista_id: profile.id,
          link_entrega: lote.link_entrega,
          observacao: lote.observacao_entrega || null,
          cancelar_pendentes: cancelarPendentes
        })
      })
      const j = await r.json()
      if (!j.ok) { alert('Erro: ' + (j.error || 'falhou')); setSalvandoEntrega(false); return }
      setConfirmandoEntrega(null)
      await fetchFila()
      alert(`✅ Lote entregue! ${j.entregues} clientes entregues${j.cancelados_pendentes ? ` · ${j.cancelados_pendentes} pendentes cancelados` : ''}`)
    } catch (e) { alert('Erro: ' + e.message) }
    setSalvandoEntrega(false)
  }

  // Filtro por produto (fila separada por produto)
  const PRODUTOS_FILA = ['Maternidade', 'Maternidade Mãe', 'Gestante até 5 meses', 'Pensão por Morte', 'BPC', 'Auxilio Acidente']
  const lotesFiltrados = filtroProduto ? lotes.filter(l => (l.produto || 'Maternidade') === filtroProduto) : lotes

  const totalContratos = lotesFiltrados.reduce((s, l) => s + l.total_contratos, 0)
  const totalEntregues = lotesFiltrados.reduce((s, l) => s + (l.qtd_entregues || 0), 0)
  const vencendoHoje = lotesFiltrados.filter(l => { const r = diasRestantes(l.data_limite_entrega); return r !== null && r <= 1 }).length

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: '#8b9bb4' }}>Carregando fila...</div>

  return (
    <div>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 500, color: '#e6edf7', marginBottom: 4 }}>📦 Fila de entregas</div>
          <div style={{ fontSize: 13, color: '#8b9bb4' }}>Confira docs e contratos · monte a pasta no Drive · entregue · {lotesFiltrados.length} pedido{lotesFiltrados.length !== 1 ? 's' : ''} na fila{filtroProduto ? ` · ${filtroProduto}` : ''}</div>
        </div>
        <select value={filtroProduto} onChange={e => setFiltroProduto(e.target.value)}
          style={{ padding: '8px 12px', fontSize: 13, border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 8, background: '#232a37', outline: 'none', cursor: 'pointer' }}>
          <option value="">Todos os produtos</option>
          {PRODUTOS_FILA.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: '1.5rem' }}>
        {[
          ['Na fila', lotesFiltrados.length, '#60a5fa', 'rgba(96,165,250,.12)'],
          ['Pendentes', totalContratos - totalEntregues, '#fbbf24', 'rgba(251,191,36,.12)'],
          ['Entregues', totalEntregues, '#34d399', 'rgba(52,211,153,.14)'],
          ['Vencem hoje', vencendoHoje, '#f87171', 'rgba(248,113,113,.14)'],
        ].map(([label, valor, cor, bg]) => (
          <div key={label} style={{ background: label === 'Vencem hoje' && valor > 0 ? bg : '#232a37', border: `0.5px solid ${label === 'Vencem hoje' && valor > 0 ? cor + '50' : 'rgba(255,255,255,0.08)'}`, borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: cor, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4, opacity: 0.8 }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 500, color: cor }}>{valor}</div>
          </div>
        ))}
      </div>

      {lotesFiltrados.length === 0 && (
        <div style={{ textAlign: 'center', padding: '4rem', background: '#232a37', borderRadius: 14, border: '0.5px solid rgba(255,255,255,0.07)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#8b9bb4' }}>Fila vazia — nenhum lote aguardando entrega</div>
        </div>
      )}

      {lotesFiltrados.map((lote, idx) => {
        const restam = diasRestantes(lote.data_limite_entrega)
        const chegouHa = diasDesde(lote.data_compra)
        const u = urgencia(restam)
        const entregues = lote.qtd_entregues || 0

        const clientes = lote.clientes || []
        const assinadosSistema = clientes.filter(c => ['assinado','aguardando_pos_venda','em_contato_pos_venda','validado_pos_venda','em_validacao','validado','entregue'].includes(c.status)).length
        const assinadosCard = Math.max(assinadosSistema, lote.qtd_entregues || 0, lote.qtd_assinados || 0)
        const validados = clientes.filter(c => ['em_validacao','validado'].includes(c.status)).length
        const pendentesAssinatura = clientes.filter(c => c.status === 'emitido').length
        const expirados = clientes.filter(c => c.status === 'expirado').length
        const progresso = lote.total_contratos > 0 ? Math.round((entregues / lote.total_contratos) * 100) : 0

        const podeEntregar = validados > 0 && isUrlValida(lote.link_entrega)
        const completo = validados >= lote.total_contratos && pendentesAssinatura === 0
        const linkValido = isUrlValida(lote.link_entrega)

        return (
          <div key={lote.id} style={{ background: lote.tipo === 'reposicao' ? 'rgba(251,191,36,.12)' : u.bg, border: `${lote.tipo === 'reposicao' ? '2px' : '1.5px'} solid ${lote.tipo === 'reposicao' ? '#fbbf24' : u.border}`, borderRadius: 14, padding: '1.25rem', marginBottom: 14 }}>
            {lote.tipo === 'reposicao' && (
              <div style={{ background: '#fbbf24', color: '#232a37', padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, marginBottom: 10, display: 'inline-block', letterSpacing: '0.3px' }}>
                🔄 REPOSIÇÃO · PRAZO 24H · ENTREGAR HOJE
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#60a5fa', color: '#232a37', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{idx + 1}°</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: '#e6edf7' }}>{lote.advogados?.nome_completo}</div>
                  <div style={{ fontSize: 12, color: '#8b9bb4' }}>{lote.advogados?.oab} · {lote.advogados?.cidade}, {lote.advogados?.estado}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Vendedor: {lote.profiles?.nome} · há {chegouHa} dia{chegouHa !== 1 ? 's' : ''}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: '#e6edf7', marginBottom: 3 }}>R$ {Number(lote.valor_total).toLocaleString('pt-BR')}</div>
                <div style={{ fontSize: 12, color: '#8b9bb4', marginBottom: 5 }}>{lote.total_contratos} contrato{lote.total_contratos !== 1 ? 's' : ''}</div>
                <span style={{ padding: '3px 10px', background: u.badgeBg, color: u.badgeColor, borderRadius: 20, fontSize: 11, fontWeight: 500 }}>
                  {restam === null ? 'Sem prazo' : restam <= 0 ? '🔴 Vencido' : restam === 1 ? '⚠️ Vence hoje' : `${restam}d restantes`}
                </span>
                {(profile?.role === 'admin' || profile?.role === 'analista') && (
                  <button onClick={() => abrirEdicaoManual(lote)} title="Corrigir números manualmente" style={{ marginTop: 6, padding: '3px 8px', background: '#232a37', color: '#8b9bb4', border: '0.5px solid rgba(0,0,0,0.45)', borderRadius: 6, fontSize: 11, cursor: 'pointer', display: 'block', marginLeft: 'auto' }}>
                    ✏️ Corrigir
                  </button>
                )}
              </div>
            </div>

            {/* Progresso */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                <span style={{ color: '#8b9bb4', fontWeight: 500 }}>Progresso</span>
                <span style={{ color: progresso === 100 ? '#34d399' : '#60a5fa', fontWeight: 500 }}>{entregues}/{lote.total_contratos} entregues · {progresso}%</span>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 6, height: 10, overflow: 'hidden' }}>
                <div style={{ width: `${progresso}%`, height: '100%', background: progresso === 100 ? '#34d399' : '#60a5fa', borderRadius: 6, transition: 'width 0.4s' }} />
              </div>
            </div>

            {/* Contadores */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 }}>
              {[
                ['Total', lote.total_contratos, '#e6edf7'],
                ['Assinados', assinadosCard, '#34d399'],
                ['Pra validar', validados, validados > 0 ? '#fbbf24' : '#8b9bb4'],
                ['Aguardando', pendentesAssinatura, pendentesAssinatura > 0 ? '#60a5fa' : '#8b9bb4'],
              ].map(([l, v, c]) => (
                <div key={l} style={{ background: '#171c26', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: c, opacity: 0.75, marginBottom: 2 }}>{l}</div>
                  <div style={{ fontSize: 18, fontWeight: 500, color: c }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Lista de clientes */}
            {clientes.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#8b9bb4', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>
                  Clientes ({clientes.length}/{lote.total_contratos} cadastrados)
                </div>
                {clientes.map(c => {
                  const lbl = STATUS_LABELS[c.status] || { txt: c.status, cor: '#8b9bb4' }
                  const emValidacao = c.status === 'em_validacao'
                  const validando = validandoCliente[c.id]
                  return (
                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: clienteAberto === c.id ? 'rgba(96,165,250,.12)' : '#171c26', borderRadius: 6, marginBottom: 4, border: clienteAberto === c.id ? '1px solid #60a5fa' : '1px solid transparent', gap: 6 }}>
                      <span onClick={() => abrirPainelCliente(c.id)} style={{ fontSize: 12, color: '#60a5fa', flex: 1, cursor: 'pointer', textDecoration: 'underline' }}>
                        🔍 {c.nome}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 500, color: lbl.cor, marginRight: 6 }}>{lbl.txt}</span>
                      {emValidacao && (
                        <>
                          <button onClick={() => validarCliente(c, lote)} disabled={validando} style={{ padding: '3px 8px', background: 'rgba(52,211,153,.14)', color: '#34d399', border: '0.5px solid #3B6D1140', borderRadius: 6, fontSize: 11, cursor: validando ? 'wait' : 'pointer', opacity: validando ? 0.5 : 1 }}>
                            {validando ? '...' : '✅ Validar'}
                          </button>
                          <button onClick={() => abrirDevolucao(c, lote)} disabled={validando} style={{ padding: '3px 8px', background: 'rgba(248,113,113,.14)', color: '#f87171', border: '0.5px solid #A32D2D40', borderRadius: 6, fontSize: 11, cursor: 'pointer', opacity: validando ? 0.5 : 1 }}>
                            ↩️ Devolver
                          </button>
                        </>
                      )}
                    </div>
                  )
                })}
                {expirados > 0 && (
                  <div style={{ fontSize: 11, color: '#f87171', marginTop: 4 }}>
                    {expirados} expirado{expirados !== 1 ? 's' : ''} — vão voltar pra emissão (advogado vai ter mais clientes)
                  </div>
                )}
              </div>
            )}

            {/* Aviso lote incompleto */}
            {!completo && validados > 0 && (
              <div style={{ fontSize: 11, color: '#fbbf24', background: 'rgba(251,191,36,.12)', padding: '8px 10px', borderRadius: 6, marginBottom: 10, border: '0.5px solid #854F0B30' }}>
                ⚠️ Lote incompleto: {validados}/{lote.total_contratos} prontos pra entregar.
                {pendentesAssinatura > 0 && ` ${pendentesAssinatura} ainda assinando.`}
                {' '}Recomendado aguardar completar. Se entregar agora, sistema vai perguntar o que fazer com os pendentes.
              </div>
            )}

            {/* Link Drive — OBRIGATÓRIO */}
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: linkValido ? '#34d399' : '#f87171', display: 'block', marginBottom: 4, fontWeight: 500 }}>
                {linkValido ? '✅ Link da entrega (Drive)' : '🔴 Link da entrega (Drive) — OBRIGATÓRIO'}
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="url" value={lote.link_entrega || ''} placeholder="https://drive.google.com/drive/folders/..."
                  onChange={e => atualizar(lote.id, { link_entrega: e.target.value })}
                  onBlur={e => salvarCampo(lote.id, { link_entrega: e.target.value })}
                  style={{ flex: 1, padding: '9px 10px', fontSize: 13, border: `1px solid ${linkValido ? '#3B6D1150' : '#A32D2D50'}`, borderRadius: 8, outline: 'none', background: linkValido ? '#EAF3DE40' : '#FCEBEB30' }} />
                {linkValido && (
                  <a href={lote.link_entrega} target="_blank" rel="noreferrer" style={{ padding: '9px 12px', background: 'rgba(96,165,250,.12)', color: '#60a5fa', border: '0.5px solid #60a5fa', borderRadius: 8, fontSize: 12, textDecoration: 'none', display: 'flex', alignItems: 'center' }}>🔗 Ver</a>
                )}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: '#8b9bb4', display: 'block', marginBottom: 4 }}>Observação</label>
              <textarea rows={2} value={lote.observacao_entrega || ''} placeholder="Ex: docs OK, contratos validados..."
                onChange={e => atualizar(lote.id, { observacao_entrega: e.target.value })}
                onBlur={e => salvarCampo(lote.id, { observacao_entrega: e.target.value })}
                style={{ width: '100%', padding: '9px 10px', fontSize: 13, border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 8, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>

            <button onClick={() => tentarEntregar(lote)}
              disabled={!podeEntregar}
              style={{ width: '100%', padding: '12px', background: podeEntregar ? '#34d399' : '#64748b', color: '#232a37', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: podeEntregar ? 'pointer' : 'not-allowed' }}>
              {!linkValido ? '🔴 Cole o link do Drive primeiro' : validados === 0 ? '⏳ Nenhum cliente pronto pra entregar' : completo ? '✅ Entregar lote completo' : `⚠️ Entregar parcial (${validados}/${lote.total_contratos})`}
            </button>
            {salvando[lote.id] && <div style={{ fontSize: 11, color: '#64748b', marginTop: 6, textAlign: 'right' }}>Salvando...</div>}
          </div>
        )
      })}

      {/* PAINEL LATERAL DO CLIENTE */}
      {clienteAberto && (
        <div style={{ position: 'fixed', top: 0, right: 0, width: '50%', maxWidth: 600, height: '100vh', background: '#232a37', boxShadow: '-4px 0 20px rgba(255,255,255,0.11)', zIndex: 90, overflowY: 'auto', padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ fontSize: 18, fontWeight: 500, color: '#e6edf7' }}>📋 Detalhes do cliente</div>
            <button onClick={fecharPainelCliente} style={{ padding: '6px 12px', background: '#2b3340', color: '#8b9bb4', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>✕ Fechar</button>
          </div>

          {carregandoCliente && <div style={{ textAlign: 'center', padding: 40, color: '#8b9bb4' }}>Carregando...</div>}

          {clienteDetalhe && !carregandoCliente && (
            <>
              {/* FICHA CADASTRAL */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: '#8b9bb4', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8, fontWeight: 500 }}>Ficha cadastral</div>
                <div style={{ background: '#171c26', padding: 14, borderRadius: 8, fontSize: 13, lineHeight: 1.7 }}>
                  <div><strong>Nome:</strong> {clienteDetalhe.nome}</div>
                  <div><strong>CPF:</strong> {clienteDetalhe.cpf}</div>
                  <div><strong>RG:</strong> {clienteDetalhe.rg || '—'}</div>
                  <div><strong>Telefone:</strong> {clienteDetalhe.telefone}</div>
                  <div><strong>Endereço:</strong> {clienteDetalhe.rua}, {clienteDetalhe.numero} {clienteDetalhe.bairro ? `· ${clienteDetalhe.bairro}` : ''}</div>
                  <div><strong>Cidade/UF:</strong> {clienteDetalhe.cidade}/{clienteDetalhe.uf} · CEP {clienteDetalhe.cep}</div>
                  <div style={{ marginTop: 6, paddingTop: 6, borderTop: '0.5px solid rgba(255,255,255,0.07)' }}>
                    <strong>🤰 DPP:</strong> {clienteDetalhe.data_prevista_parto ? new Date(clienteDetalhe.data_prevista_parto + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                    {' · '}
                    <strong>Meses:</strong> {clienteDetalhe.meses_gravidez || '—'}
                  </div>
                  <div><strong>NIS:</strong> {clienteDetalhe.nis || '—'}</div>
                  <div><strong>Vendedora:</strong> {clienteDetalhe.profiles?.nome || '—'}</div>
                  <div><strong>Status:</strong> <span style={{ color: (STATUS_LABELS[clienteDetalhe.status] || {}).cor || '#8b9bb4', fontWeight: 500 }}>{(STATUS_LABELS[clienteDetalhe.status] || {}).txt || clienteDetalhe.status}</span></div>
                  {clienteDetalhe.pos_venda_observacao && <div><strong>Obs Luciane:</strong> <span style={{ color: '#fbbf24' }}>{clienteDetalhe.pos_venda_observacao}</span></div>}
                </div>
              </div>

              {/* DOCUMENTOS DO CLIENTE */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: '#8b9bb4', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8, fontWeight: 500 }}>📎 Documentos enviados</div>
                {clienteDetalhe.documentos && Object.keys(clienteDetalhe.documentos).length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {Object.entries(clienteDetalhe.documentos).filter(([k,v]) => v).map(([nome, url]) => {
                      const labels = { rg_frente: '🆔 RG (frente)', rg_verso: '🆔 RG (verso)', comprovante_1: '📄 Comprovante 1', comprovante_2: '📄 Comprovante 2', comprovante_endereco: '🏠 Comprovante de endereço' }
                      return (
                        <div key={nome} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#171c26', borderRadius: 8 }}>
                          <span style={{ fontSize: 13, color: '#e6edf7' }}>{labels[nome] || nome}</span>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <a href={url} target="_blank" rel="noreferrer" style={{ padding: '6px 10px', background: 'rgba(96,165,250,.12)', color: '#60a5fa', border: '0.5px solid #60a5fa', borderRadius: 6, fontSize: 11, textDecoration: 'none' }}>👁️ Ver</a>
                            <a href={url} download target="_blank" rel="noreferrer" style={{ padding: '6px 10px', background: '#34d399', color: '#232a37', borderRadius: 6, fontSize: 11, textDecoration: 'none' }}>⬇️ Baixar</a>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{ background: 'rgba(248,113,113,.14)', padding: 12, borderRadius: 8, fontSize: 12, color: '#f87171' }}>
                    ⚠️ Cliente sem documentos cadastrados
                  </div>
                )}
              </div>

              {/* CONTRATOS ZAPSIGN */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: '#8b9bb4', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8, fontWeight: 500 }}>✍️ Contratos assinados (ZapSign)</div>
                {carregandoZapsign && <div style={{ fontSize: 12, color: '#8b9bb4' }}>Buscando PDFs...</div>}
                {!carregandoZapsign && zapsignDocs && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[
                      { nome: '📜 Contrato principal', url: zapsignDocs.contrato },
                      { nome: '📋 Procuração', url: zapsignDocs.procuracao },
                      { nome: '📝 Termo', url: zapsignDocs.termo },
                    ].filter(d => d.url).map(d => (
                      <div key={d.nome} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'rgba(52,211,153,.14)', borderRadius: 8 }}>
                        <span style={{ fontSize: 13, color: '#e6edf7' }}>{d.nome}</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <a href={d.url} target="_blank" rel="noreferrer" style={{ padding: '6px 10px', background: '#232a37', color: '#34d399', border: '0.5px solid #34d399', borderRadius: 6, fontSize: 11, textDecoration: 'none' }}>👁️ Ver</a>
                          <a href={d.url} download target="_blank" rel="noreferrer" style={{ padding: '6px 10px', background: '#34d399', color: '#232a37', borderRadius: 6, fontSize: 11, textDecoration: 'none' }}>⬇️ Baixar PDF</a>
                        </div>
                      </div>
                    ))}
                    <div style={{ fontSize: 10, color: '#8b9bb4', marginTop: 4 }}>
                      💡 Os PDFs assinados saem direto do ZapSign. Clique em Baixar e jogue na pasta do Drive.
                    </div>
                  </div>
                )}
                {!carregandoZapsign && !zapsignDocs && clienteDetalhe.zapsign_token && (
                  <div style={{ fontSize: 12, color: '#f87171' }}>Erro ao buscar PDFs do ZapSign</div>
                )}
                {!clienteDetalhe.zapsign_token && (
                  <div style={{ background: 'rgba(251,191,36,.12)', padding: 12, borderRadius: 8, fontSize: 12, color: '#fbbf24' }}>
                    Cliente ainda sem token ZapSign
                  </div>
                )}
              </div>

              {/* PRINTS DA LUCIANE */}
              {clienteDetalhe.pos_venda_prints && Array.isArray(clienteDetalhe.pos_venda_prints) && clienteDetalhe.pos_venda_prints.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, color: '#8b9bb4', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8, fontWeight: 500 }}>📸 Prints da Luciane (validação pós-venda)</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {clienteDetalhe.pos_venda_prints.map((path, i) => {
                      const url = `https://sdqslzpfbazehqcvibjy.supabase.co/storage/v1/object/public/pos-venda-prints/${path}`
                      return (
                        <a key={i} href={url} target="_blank" rel="noreferrer" style={{ padding: '8px 12px', background: 'rgba(251,191,36,.12)', color: '#fbbf24', border: '0.5px solid #854F0B40', borderRadius: 6, fontSize: 12, textDecoration: 'none' }}>
                          📸 Print {i+1} →
                        </a>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* MODAL EDIÇÃO MANUAL DO LOTE */}
      {editandoLote && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#232a37', padding: 24, borderRadius: 12, width: '90%', maxWidth: 480 }}>
            <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 6 }}>✏️ Corrigir números do lote</div>
            <div style={{ fontSize: 13, color: '#8b9bb4', marginBottom: 16 }}>Lote do <strong>{editandoLote.advogados?.nome_completo}</strong></div>
            <div style={{ background: 'rgba(251,191,36,.12)', padding: 10, borderRadius: 6, fontSize: 11, color: '#fbbf24', marginBottom: 16 }}>
              ⚠️ Use só pra corrigir erros de operação ou questões da empresa. O sistema vai reaplicar a regra de prioridade automaticamente.
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: '#e6edf7', fontWeight: 500, marginBottom: 4, display: 'block' }}>Total de contratos *</label>
              <input type="number" min="1" max="999" value={editTotal} onChange={e => setEditTotal(e.target.value)}
                style={{ width: '100%', padding: 10, fontSize: 14, border: '0.5px solid rgba(0,0,0,0.45)', borderRadius: 8, outline: 'none', boxSizing: 'border-box' }} />
              <div style={{ fontSize: 10, color: '#8b9bb4', marginTop: 4 }}>Quantos contratos esse advogado fechou no total</div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: '#e6edf7', fontWeight: 500, marginBottom: 4, display: 'block' }}>Quantidade de assinados *</label>
              <input type="number" min="0" max={editTotal || 999} value={editAssinados} onChange={e => setEditAssinados(e.target.value)}
                style={{ width: '100%', padding: 10, fontSize: 14, border: '0.5px solid rgba(0,0,0,0.45)', borderRadius: 8, outline: 'none', boxSizing: 'border-box' }} />
              <div style={{ fontSize: 10, color: '#8b9bb4', marginTop: 4 }}>Não pode ser maior que o total. Atual: {editandoLote.qtd_assinados}</div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditandoLote(null)} disabled={salvandoEdicao} style={{ padding: '8px 14px', background: '#2b3340', color: '#8b9bb4', border: 'none', borderRadius: 7, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={salvarEdicaoManual} disabled={salvandoEdicao}
                style={{ padding: '8px 14px', background: '#60a5fa', color: '#232a37', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: salvandoEdicao ? 'not-allowed' : 'pointer', opacity: salvandoEdicao ? 0.5 : 1 }}>
                {salvandoEdicao ? 'Salvando...' : 'Salvar correção'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DEVOLUÇÃO */}
      {devolvendo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#232a37', padding: 24, borderRadius: 12, width: '90%', maxWidth: 500 }}>
            <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 6 }}>↩️ Devolver pra reemissão</div>
            <div style={{ fontSize: 13, color: '#8b9bb4', marginBottom: 14 }}>Cliente: <strong>{devolvendo.cliente.nome}</strong></div>
            <label style={{ fontSize: 12, color: '#e6edf7', fontWeight: 500, marginBottom: 4, display: 'block' }}>Motivo da devolução *</label>
            <textarea rows={3} value={motivoDevolucao} onChange={e => setMotivoDevolucao(e.target.value)} placeholder="Ex: Documento ilegível, RG vencido, foto em ângulo errado..."
              style={{ width: '100%', padding: 10, fontSize: 13, border: '0.5px solid rgba(0,0,0,0.45)', borderRadius: 8, fontFamily: 'inherit', resize: 'vertical', outline: 'none', marginBottom: 14, boxSizing: 'border-box' }} />
            <div style={{ background: 'rgba(251,191,36,.12)', padding: 10, borderRadius: 6, fontSize: 11, color: '#fbbf24', marginBottom: 14 }}>
              ⚠️ Cliente vai voltar pra fila de emissão. Vendedora será notificada e tem 24h pra reabordar.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setDevolvendo(null)} disabled={salvandoDevolucao} style={{ padding: '8px 14px', background: '#2b3340', color: '#8b9bb4', border: 'none', borderRadius: 7, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={confirmarDevolucao} disabled={salvandoDevolucao || !motivoDevolucao.trim()}
                style={{ padding: '8px 14px', background: '#f87171', color: '#232a37', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: salvandoDevolucao || !motivoDevolucao.trim() ? 'not-allowed' : 'pointer', opacity: salvandoDevolucao || !motivoDevolucao.trim() ? 0.5 : 1 }}>
                {salvandoDevolucao ? 'Devolvendo...' : 'Confirmar devolução'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ENTREGA PARCIAL */}
      {confirmandoEntrega && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#232a37', padding: 24, borderRadius: 12, width: '90%', maxWidth: 540 }}>
            <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 6 }}>⚠️ Entrega parcial</div>
            <div style={{ fontSize: 13, color: '#8b9bb4', marginBottom: 14 }}>
              Lote do <strong>{confirmandoEntrega.advogados?.nome_completo}</strong> ainda não está completo.
              <br />
              {(confirmandoEntrega.clientes || []).filter(c => ['em_validacao','validado'].includes(c.status)).length}/{confirmandoEntrega.total_contratos} prontos pra entregar.
            </div>
            <div style={{ background: 'rgba(251,191,36,.12)', padding: 12, borderRadius: 8, fontSize: 12, color: '#fbbf24', marginBottom: 16 }}>
              <strong>O que fazer com os clientes ainda pendentes?</strong>
              <br/>(em assinatura, expirados, devolvidos)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              <button onClick={() => executarEntrega(confirmandoEntrega, true)} disabled={salvandoEntrega}
                style={{ padding: 12, background: '#f87171', color: '#232a37', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', textAlign: 'left' }}>
                ❌ Cancelar pendentes (advogado fechou o lote, sem mais clientes)
              </button>
              <button onClick={() => executarEntrega(confirmandoEntrega, false)} disabled={salvandoEntrega}
                style={{ padding: 12, background: '#60a5fa', color: '#232a37', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', textAlign: 'left' }}>
                ⏳ Manter pendentes ativos (advogado aceita receber depois quando completar)
              </button>
            </div>
            <button onClick={() => setConfirmandoEntrega(null)} disabled={salvandoEntrega}
              style={{ width: '100%', padding: '8px 14px', background: '#2b3340', color: '#8b9bb4', border: 'none', borderRadius: 7, fontSize: 13, cursor: 'pointer' }}>
              Cancelar
            </button>
            {salvandoEntrega && <div style={{ fontSize: 11, color: '#64748b', marginTop: 8, textAlign: 'center' }}>Processando entrega...</div>}
          </div>
        </div>
      )}
    </div>
  )
}
