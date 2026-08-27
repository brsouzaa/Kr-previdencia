import ModalComprovante from './ModalComprovante'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const STATUS_STYLE = {
  verde: { bg: 'rgba(52,211,153,.14)', color: '#059669', label: 'Ativo' },
  amarelo: { bg: 'rgba(251,191,36,.12)', color: '#b45309', label: 'Atenção' },
  vermelho: { bg: 'rgba(248,113,113,.14)', color: '#dc2626', label: 'Crítico' },
}
const TITULO_STYLE = {
  'Parceiro Bronze': { bg: 'rgba(248,113,113,.14)', color: '#b45309' },
  'Parceiro Prata': { bg: '#334766', color: '#334155' },
  'Cliente Gold': { bg: 'rgba(251,191,36,.12)', color: '#b45309' },
  'Cliente Gold II': { bg: 'rgba(251,191,36,.12)', color: '#b45309' },
  'Cliente Platinum': { bg: 'rgba(96,165,250,.12)', color: '#2563eb' },
  'Cliente Platinum II': { bg: 'rgba(96,165,250,.12)', color: '#2563eb' },
  'Cliente Diamond': { bg: 'rgba(167,139,250,.14)', color: '#7c3aed' },
  'Cliente Diamond II': { bg: 'rgba(167,139,250,.14)', color: '#7c3aed' },
  'Cliente Black': { bg: '#334155', color: '#334766' },
}
const PROD_STYLE = {
  'Maternidade': { bg: 'rgba(52,211,153,.14)', color: '#059669' },
  'Maternidade Mãe': { bg: 'rgba(251,191,36,.12)', color: '#b45309' },
  'Gestante até 5 meses': { bg: 'rgba(96,165,250,.10)', color: '#2563eb' },
  'BPC': { bg: 'rgba(167,139,250,.14)', color: '#7c3aed' },
  'Pensão por Morte': { bg: 'rgba(167,139,250,.14)', color: '#7c3aed' },
  'Auxilio Acidente': { bg: 'rgba(251,191,36,.12)', color: '#b45309' },
}
const PAG_STYLE = {
  emitir_contrato: { bg: '#e2e8f0', color: '#5b6b84', label: 'Emitir contrato' },
  assinar_contrato: { bg: 'rgba(167,139,250,.14)', color: '#7c3aed', label: 'Assinar contrato' },
  a_entregar: { bg: 'rgba(96,165,250,.12)', color: '#2563eb', label: 'A entregar' },
  entregue: { bg: 'rgba(251,191,36,.12)', color: '#b45309', label: 'Entregue' },
  pago: { bg: 'rgba(52,211,153,.14)', color: '#059669', label: 'Pago' },
  inadimplente: { bg: 'rgba(248,113,113,.14)', color: '#dc2626', label: 'Inadimplente' },
  pendente_aprovacao: { bg: 'rgba(251,191,36,.12)', color: '#b45309', label: '🔄 Reposição pendente' },
  nao_assinou: { bg: '#e2e8f0', color: '#5b6b84', label: 'Não assinou' },
}
const TITULOS = ['','Parceiro Bronze','Parceiro Prata','Cliente Gold','Cliente Gold II','Cliente Platinum','Cliente Platinum II','Cliente Diamond','Cliente Diamond II','Cliente Black']
const PRODUTOS = ['Maternidade', 'Maternidade Mãe', 'Gestante até 5 meses', 'Pensão por Morte', 'Auxilio Acidente']

// 27/08 (relato do Fabio): o select de produto do modal de REPOSICAO so tinha 3 opcoes
// (Maternidade, Pensao por Morte, Auxilio Acidente). Faltavam "Maternidade Mae" e
// "Gestante ate 5 meses" — e como o form nasce com 'Maternidade', toda reposicao desses
// dois saia gravada como Maternidade e caia na fila de entrega ERRADA (a Fila e separada
// por produto). Nao era erro de quem preenchia: nao tinha como escolher certo.
// Lista igual a PRODUTOS_FILA da tela Fila de entregas — os 6 produtos que existem em clientes.
const PRODUTOS_REPOSICAO = ['Maternidade', 'Maternidade Mãe', 'Gestante até 5 meses', 'Pensão por Morte', 'BPC', 'Auxilio Acidente']

// Tabela de preços por produto (fallback, sincronizado com produtos_precos do banco)
const FALLBACK_TABELAS = {
  'Gestante até 5 meses': [
    { qtd_min: 1, qtd_max: null, preco: 199 },
  ],
  'Maternidade Mãe': [
    { qtd_min: 1, qtd_max: 10, preco: 499 },
    { qtd_min: 11, qtd_max: 30, preco: 459 },
    { qtd_min: 31, qtd_max: 50, preco: 439 },
    { qtd_min: 51, qtd_max: 100, preco: 409 },
    { qtd_min: 101, qtd_max: null, preco: 399 },
  ],
  'Maternidade': [
    { qtd_min: 1, qtd_max: 4, preco: 449 },
    { qtd_min: 5, qtd_max: 9, preco: 399 },
    { qtd_min: 10, qtd_max: 29, preco: 359 },
    { qtd_min: 30, qtd_max: 49, preco: 329 },
    { qtd_min: 50, qtd_max: 99, preco: 299 },
    { qtd_min: 100, qtd_max: null, preco: 279 },
  ],
  'Pensão por Morte': [
    { qtd_min: 1, qtd_max: 2, preco: 2498 },
    { qtd_min: 3, qtd_max: 9, preco: 2297 },
    { qtd_min: 10, qtd_max: 29, preco: 2097 },
    { qtd_min: 30, qtd_max: null, preco: 1998 },
  ],
  'Auxilio Acidente': [
    { qtd_min: 1, qtd_max: 4, preco: 449 },
    { qtd_min: 5, qtd_max: 9, preco: 399 },
    { qtd_min: 10, qtd_max: 29, preco: 359 },
    { qtd_min: 30, qtd_max: 49, preco: 329 },
    { qtd_min: 50, qtd_max: 99, preco: 299 },
    { qtd_min: 100, qtd_max: null, preco: 279 },
  ],
}

function precoUnitarioFromTabela(tabela, qtd) {
  if (!qtd || qtd < 1) return 0
  const linha = (tabela || []).find(l => l.qtd_min <= qtd && (l.qtd_max == null || l.qtd_max >= qtd))
  return linha ? Number(linha.preco) : 0
}

function calcularValorPorQtds(qtds, tabelas) {
  let total = 0
  for (const produto of PRODUTOS) {
    const qtd = qtds[produto] || 0
    if (qtd === 0) continue
    const preco = precoUnitarioFromTabela(tabelas[produto], qtd)
    total += qtd * preco
  }
  return total
}

const s = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' },
  panel: { background: '#ffffff', height: '100vh', overflowY: 'auto', padding: '1.5rem', borderLeft: '0.5px solid rgba(15,23,42,0.08)' },
  closeBtn: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#5b6b84', float: 'right' },
  name: { fontSize: 18, fontWeight: 500, color: '#0f172a', marginBottom: 3, marginTop: '1.5rem' },
  sub: { fontSize: 13, color: '#5b6b84', marginBottom: 14 },
  badges: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
  badge: (style) => ({ padding: '3px 9px', borderRadius: 20, fontSize: 12, fontWeight: 500, ...style }),
  section: { marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '0.5px solid rgba(15,23,42,0.07)' },
  sectionTitle: { fontSize: 11, color: '#5b6b84', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10, fontWeight: 500 },
  row: { display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 },
  rowLabel: { color: '#5b6b84' },
  rowValue: { fontWeight: 500, color: '#0f172a' },
  compraBox: { background: '#f2f5fa', borderRadius: 10, padding: '1rem', marginTop: '1rem' },
  label: { fontSize: 12, color: '#5b6b84', marginBottom: 4, display: 'block', marginTop: 10 },
  input: { width: '100%', padding: '9px 10px', fontSize: 13, border: '0.5px solid rgba(15,23,42,0.12)', borderRadius: 8, background: '#ffffff', color: '#0f172a', outline: 'none' },
  btnSave: { width: '100%', marginTop: 12, padding: '10px', background: '#60a5fa', color: '#232a37', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  btnDisabled: { width: '100%', marginTop: 12, padding: '10px', background: '#64748b', color: '#232a37', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'not-allowed' },
  qtyRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
  qtyLabel: { fontSize: 13, flex: 1, color: '#334155' },
  qtyBtn: { width: 32, height: 32, borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.45)', background: '#ffffff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb', fontWeight: 500, flexShrink: 0 },
  qtyValue: { fontSize: 16, fontWeight: 500, minWidth: 28, textAlign: 'center', color: '#0f172a' },
}

export default function DetalheAdvogado({ advogado, onClose, onUpdated }) {
  const { profile } = useAuth()
  const [compras, setCompras] = useState([])
  const [lotes, setLotes] = useState([])
  const [qtds, setQtds] = useState({ 'Maternidade': 0, 'Pensão por Morte': 0, 'Auxilio Acidente': 0 })
  const [dataCompra, setDataCompra] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [adv, setAdv] = useState(advogado)
  const [modalLote, setModalLote] = useState(null)
  const [modalReposicao, setModalReposicao] = useState(false)
  const [repForm, setRepForm] = useState({ qtd: 1, motivo: '', observacao: '', produto: 'Maternidade' })
  const [savingRep, setSavingRep] = useState(false)
  const [clientesAdv, setClientesAdv] = useState([])
  const [repSelecionados, setRepSelecionados] = useState([])
  const [repBusca, setRepBusca] = useState('')
  const [aba, setAba] = useState('lotes')
  const [tabelas, setTabelas] = useState(FALLBACK_TABELAS)
  // Edição dos dados cadastrais
  const [editando, setEditando] = useState(false)
  const [formEdit, setFormEdit] = useState(null)
  const [salvandoEdit, setSalvandoEdit] = useState(false)
  const [vendedores, setVendedores] = useState([])
  const ehAdmin = profile?.role === 'admin'

  const abrirEdicao = async () => {
    setFormEdit({
      nome_completo: adv.nome_completo || '', oab: adv.oab || '', estado: adv.estado || '',
      cidade: adv.cidade || '', endereco: adv.endereco || '', cep: adv.cep || '',
      numero: adv.numero || '', bairro: adv.bairro || '', telefone: adv.telefone || '',
      email: adv.email || '', estado_civil: adv.estado_civil || '', nacionalidade: adv.nacionalidade || '',
      vendedor_id: adv.vendedor_id || '',
    })
    setEditando(true)
    if (ehAdmin && vendedores.length === 0) {
      const { data } = await supabase.from('profiles').select('id, nome').in('role', ['vendedor', 'admin']).order('nome')
      setVendedores(data || [])
    }
  }

  const salvarEdicao = async () => {
    if (!formEdit.nome_completo.trim() || !formEdit.oab.trim()) { alert('Nome e OAB são obrigatórios.'); return }
    setSalvandoEdit(true)
    const payload = { ...formEdit, updated_at: new Date().toISOString() }
    if (!ehAdmin) delete payload.vendedor_id // só admin troca o vendedor
    if (payload.vendedor_id === '') delete payload.vendedor_id
    const { error } = await supabase.from('advogados').update(payload).eq('id', adv.id)
    setSalvandoEdit(false)
    if (error) { alert('Erro ao salvar: ' + error.message); return }
    setAdv({ ...adv, ...payload })
    setEditando(false)
  }

  useEffect(() => { fetchTudo() }, [advogado.id])

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('produtos_precos')
          .select('produto, qtd_min, qtd_max, preco_unitario')
          .eq('ativo', true)
          .order('qtd_min', { ascending: true })
        if (error || !data) return
        const novo = {}
        for (const row of data) {
          if (!novo[row.produto]) novo[row.produto] = []
          novo[row.produto].push({ qtd_min: row.qtd_min, qtd_max: row.qtd_max, preco: Number(row.preco_unitario) })
        }
        if (novo['Maternidade'] && novo['Pensão por Morte'] && novo['Auxilio Acidente']) {
          setTabelas(novo)
        }
      } catch(e) { /* mantém fallback */ }
    })()
  }, [])

  async function notificarEmail(tipo, dados) {
    try { await supabase.functions.invoke('enviar-email', { body: { tipo, dados } }) }
    catch(e) { console.log('Email nao enviado:', e) }
  }

  async function fetchTudo() {
    const [{ data: c }, { data: l }] = await Promise.all([
      supabase.from('compras').select('*').eq('advogado_id', advogado.id).order('data_compra', { ascending: false }),
      supabase.from('lotes').select('*, profiles(nome)').eq('advogado_id', advogado.id).order('data_compra', { ascending: false }),
    ])
    setCompras(c || [])
    setLotes(l || [])
    const { data: a } = await supabase.from('advogados').select('*').eq('id', advogado.id).single()
    if (a) setAdv(a)
    // Clientes vivos do advogado, elegíveis a reposição (não em outra reposição pendente)
    const { data: cli } = await supabase.from('clientes')
      .select('id, nome, cpf, status, produto, reposto_por_lote_id')
      .eq('advogado_id', advogado.id)
      .in('status', ['assinado','em_validacao','validado','aguardando_pos_venda','em_contato_pos_venda','aguardando_emissao','emitido','aguardando_revisao_ia'])
      .is('reposto_por_lote_id', null)
      .order('nome', { ascending: true })
    setClientesAdv(cli || [])
  }

  function ajustarQtd(produto, delta) {
    setQtds(q => ({ ...q, [produto]: Math.max(0, (q[produto] || 0) + delta) }))
  }

  const totalLote = Object.values(qtds).reduce((a, b) => a + b, 0)
  const valorLote = calcularValorPorQtds(qtds, tabelas)
  const repBuscaNum = repBusca.replace(/\D/g, '')
  const clientesAdvFiltrados = repBusca.trim()
    ? clientesAdv.filter(c => (c.nome || '').toLowerCase().includes(repBusca.trim().toLowerCase()) || (repBuscaNum && (c.cpf || '').replace(/\D/g,'').includes(repBuscaNum)))
    : clientesAdv

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
        valor_total: Number(loteExistente.valor_total) + valorLote,
        updated_at: new Date().toISOString(),
      }).eq('id', loteExistente.id)
    } else {
      // Define produto do lote: o de maior quantidade
      const produtoLote = Object.entries(qtds)
        .filter(([, q]) => q > 0)
        .sort(([, a], [, b]) => b - a)[0]?.[0] || null
      await supabase.from('lotes').insert({
        advogado_id: adv.id, vendedor_id: profile.id, data_compra: dataCompra,
        total_contratos: totalLote, valor_total: valorLote, status_pagamento: 'emitir_contrato',
        produto: produtoLote,
      })
    }
    setQtds({ 'Maternidade': 0, 'Pensão por Morte': 0, 'Auxilio Acidente': 0 })
    await fetchTudo()
    setSaving(false)
  }

  // FUNÇÕES ADMIN
  async function solicitarReposicao() {
    if (!repForm.motivo) { alert('Selecione o motivo da reposição.'); return }
    if (repSelecionados.length < 1) { alert('Selecione ao menos um cliente que será reposto.'); return }
    setSavingRep(true)

    const motivoCompleto = repForm.motivo + (repForm.observacao ? ': ' + repForm.observacao : '')

    const { error } = await supabase.rpc('reposicao_solicitar', {
      p_advogado_id: adv.id,
      p_produto: repForm.produto,
      p_motivo: motivoCompleto,
      p_cliente_ids: repSelecionados,
    })

    setSavingRep(false)
    if (error) {
      alert('Erro ao solicitar reposição: ' + error.message)
      return
    }

    setModalReposicao(false)
    setRepForm({ qtd: 1, motivo: '', observacao: '', produto: 'Maternidade' })
    setRepSelecionados([])
    alert('✓ Solicitação enviada (' + repSelecionados.length + ' cliente(s)). Os clientes serão cancelados quando o admin aprovar.')
    await fetchTudo()
  }

  async function excluirAdvogado() {
    if (!window.confirm('Excluir permanentemente "' + adv.nome_completo + '"? Todos os lotes e compras serão removidos.')) return
    for (const lote of lotes) {
      if (lote.comprovante_url) await supabase.storage.from('comprovantes').remove([lote.comprovante_url])
    }
    await supabase.from('compras').delete().eq('advogado_id', adv.id)
    await supabase.from('advogado_produtos').delete().eq('advogado_id', adv.id)
    await supabase.from('lotes').delete().eq('advogado_id', adv.id)
    await supabase.from('advogados').delete().eq('id', adv.id)
    if (onUpdated) onUpdated()
    onClose()
  }

  async function editarQtdLote(loteId, qtdAtual, totalAtual) {
    const input = window.prompt('Nova quantidade (atual: ' + qtdAtual + '):', qtdAtual)
    if (!input) return
    const novaQtd = parseInt(input)
    if (isNaN(novaQtd) || novaQtd < 1) { alert('Quantidade inválida.'); return }
    const diff = novaQtd - qtdAtual
    // Recalcula valor baseado nos produtos reais das compras vinculadas ao lote
    const lote = lotes.find(l => l.id === loteId)
    const comprasDoLote = compras.filter(c => c.data_compra === lote.data_compra)
    // Conta produtos atuais e mantém proporção
    const breakdown = comprasDoLote.reduce((acc, c) => {
      acc[c.produto] = (acc[c.produto] || 0) + 1
      return acc
    }, {})
    // Se só tem 1 produto, escala direto. Se misturado, mantém proporção e aproxima.
    const produtos = Object.keys(breakdown)
    let novoValor
    if (produtos.length === 1) {
      // Lote 100% de um produto: simples
      const tabela = tabelas[produtos[0]] || FALLBACK_TABELAS[produtos[0]]
      novoValor = novaQtd * precoUnitarioFromTabela(tabela, novaQtd)
    } else {
      // Lote misto: escala proporcionalmente
      const fator = novaQtd / qtdAtual
      const novasQtds = {}
      for (const p of PRODUTOS) novasQtds[p] = Math.round((breakdown[p] || 0) * fator)
      novoValor = calcularValorPorQtds(novasQtds, tabelas)
    }
    // Se o valor foi editado manualmente, NÃO sobrescreve: muda só a quantidade.
    const updateQtd = lote.valor_manual
      ? { total_contratos: novaQtd, updated_at: new Date().toISOString() }
      : { total_contratos: novaQtd, valor_total: novoValor, updated_at: new Date().toISOString() }
    await supabase.from('lotes').update(updateQtd).eq('id', loteId)
    await supabase.from('advogados').update({ total_compras: Math.max(0, totalAtual + diff) }).eq('id', adv.id)
    await fetchTudo()
  }

  // Edita o valor_total do lote manualmente (valor negociado com o advogado).
  // Direto, sem aprovação. Bloqueado se o lote já estiver pago.
  async function editarValorLote(lote) {
    if (lote.status_pagamento === 'pago') {
      alert('Lote já pago — o valor não pode mais ser alterado.')
      return
    }
    const atual = Number(lote.valor_total) || 0
    const input = window.prompt('Valor total do lote (R$) — valor final da negociação:', atual)
    if (input === null) return
    const limpo = String(input).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
    const novoValor = Number(limpo)
    if (isNaN(novoValor) || novoValor < 0) { alert('Valor inválido.'); return }
    await supabase.from('lotes').update({
      valor_total: novoValor,
      valor_manual: true,
      updated_at: new Date().toISOString(),
    }).eq('id', lote.id)
    await fetchTudo()
  }

  async function mudarStatusAdmin(lote, novoStatus) {
    const update = { status_pagamento: novoStatus, updated_at: new Date().toISOString() }
    if (novoStatus === 'entregue') update.data_entrega = new Date().toISOString().slice(0,10)
    if (novoStatus !== 'pago') { update.data_pagamento = null; update.comprovante_url = null; update.comprovante_nome = null }
    if (novoStatus === 'a_entregar' || novoStatus === 'assinar_contrato' || novoStatus === 'emitir_contrato') update.data_entrega = null
    await supabase.from('lotes').update(update).eq('id', lote.id)
    await fetchTudo()
  }

  async function confirmarPagamento(loteId, path, nome) {
    await supabase.from('lotes').update({
      status_pagamento: 'pago',
      data_pagamento: new Date().toISOString().slice(0, 10),
      comprovante_url: path,
      comprovante_nome: nome,
      updated_at: new Date().toISOString(),
    }).eq('id', loteId)
    const lote = lotes.find(l => l.id === loteId)
    if (lote) await notificarEmail('lote_pago', { advogado_nome: adv.nome_completo, data_compra: lote.data_compra, total_contratos: lote.total_contratos, valor_total: lote.valor_total })
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
    await supabase.from('lotes').update({ status_pagamento: 'entregue', data_pagamento: null, comprovante_url: null, comprovante_nome: null, updated_at: new Date().toISOString() }).eq('id', loteId)
    await fetchTudo()
  }

  async function excluirLote(lote) {
    if (!window.confirm('Excluir lote de ' + lote.total_contratos + ' contratos do dia ' + lote.data_compra + '?')) return
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
  const totalPendente = lotes.filter(l => !['pago','inadimplente'].includes(l.status_pagamento)).reduce((s, l) => s + Number(l.valor_total), 0)
  const totalInadimplente = lotes.filter(l => l.status_pagamento === 'inadimplente').reduce((s, l) => s + Number(l.valor_total), 0)
  const fmt = v => `R$ ${Number(v).toLocaleString('pt-BR')}`

  return (
    <div style={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...s.panel, width: 'min(460px, 100vw)' }}>
        <button style={s.closeBtn} onClick={onClose}>×</button>
        <div style={s.name}>{adv.nome_completo}</div>
        <div style={s.sub}>{adv.oab} · {adv.cidade}, {adv.estado}</div>
        <div style={s.badges}>
          <span style={s.badge({ background: st.bg, color: st.color })}>{st.label}</span>
          {adv.titulo && ts && <span style={s.badge({ background: ts.bg, color: ts.color })}>{adv.titulo}</span>}
          {profile?.role === 'admin' && (
            <button onClick={excluirAdvogado} style={{ marginLeft: 'auto', padding: '3px 10px', background: 'rgba(248,113,113,.14)', color: '#dc2626', border: '0.5px solid #f87171', borderRadius: 20, fontSize: 11, cursor: 'pointer', fontWeight: 500 }}>
              Excluir
            </button>
          )}
        </div>

        {/* Desempenho */}
        <div style={s.section}>
          <div style={s.sectionTitle}>Desempenho</div>
          <div style={s.row}><span style={s.rowLabel}>Total de contratos</span><span style={s.rowValue}>{adv.total_compras}</span></div>
          <div style={s.row}><span style={s.rowLabel}>Última compra</span><span style={s.rowValue}>{diasUltimaCompra !== null ? `${diasUltimaCompra} dias atrás` : 'Nenhuma'}</span></div>
          {proximoTitulo && <div style={s.row}><span style={s.rowLabel}>Próximo título</span><span style={{ ...s.rowValue, color: '#2563eb' }}>{proximoTitulo}</span></div>}
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
            {[['Pago', totalPago, '#059669', 'rgba(52,211,153,.14)'], ['Em aberto', totalPendente, '#b45309', 'rgba(251,191,36,.12)'], ['Inadimp.', totalInadimplente, '#dc2626', 'rgba(248,113,113,.14)']].map(([l, v, c, bg]) => (
              <div key={l} style={{ background: bg, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: c, opacity: 0.8, marginBottom: 3 }}>{l}</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: c }}>{fmt(v)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Abas */}
        <div style={{ display: 'flex', marginTop: '1.25rem', borderBottom: '1px solid rgba(15,23,42,0.07)' }}>
          {[['lotes','Lotes'],['dados','Dados cadastrais']].map(([key, label]) => (
            <button key={key} onClick={() => setAba(key)} style={{ flex: 1, padding: '9px 0', fontSize: 13, fontWeight: aba === key ? 500 : 400, color: aba === key ? '#2563eb' : '#5b6b84', background: 'none', border: 'none', borderBottom: aba === key ? '2px solid #60a5fa' : '2px solid transparent', cursor: 'pointer' }}>
              {label}
            </button>
          ))}
        </div>

        {/* Aba: Dados cadastrais */}
        {aba === 'dados' && editando && formEdit && (
          <div style={s.section}>
            <div style={s.sectionTitle}>Editar dados cadastrais</div>
            {[['nome_completo','Nome completo'],['oab','OAB'],['estado','Estado (UF)'],['cidade','Cidade'],
              ['endereco','Endereço'],['cep','CEP'],['numero','Número'],['bairro','Bairro'],
              ['telefone','Telefone'],['email','E-mail'],['estado_civil','Estado civil'],['nacionalidade','Nacionalidade']].map(([campo, label]) => (
              <div key={campo}>
                <label style={s.label}>{label}</label>
                <input style={s.input} value={formEdit[campo]} onChange={e => setFormEdit({ ...formEdit, [campo]: e.target.value })} />
              </div>
            ))}
            {ehAdmin && (
              <div>
                <label style={s.label}>Vendedor responsável</label>
                <select style={{ ...s.input, cursor: 'pointer' }} value={formEdit.vendedor_id}
                  onChange={e => setFormEdit({ ...formEdit, vendedor_id: e.target.value })}>
                  <option value="">— selecionar —</option>
                  {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                </select>
                <div style={{ fontSize: 11, color: '#b45309', marginTop: 4 }}>
                  Trocar o vendedor muda quem vê e atende este advogado. Lotes e compras já feitos não mudam de dono.
                </div>
              </div>
            )}
            <button style={salvandoEdit ? s.btnDisabled : s.btnSave} disabled={salvandoEdit} onClick={salvarEdicao}>
              {salvandoEdit ? 'Salvando...' : '💾 Salvar alterações'}
            </button>
            <button style={{ ...s.btnSave, background: '#e2e8f0', color: '#334155', marginTop: 8 }} onClick={() => setEditando(false)}>Cancelar</button>
          </div>
        )}
        {aba === 'dados' && !editando && (
          <div>
            <button
              style={{ marginTop: '1.25rem', width: '100%', padding: '9px 0', background: 'rgba(96,165,250,.10)', color: '#2563eb', border: '0.5px solid rgba(15,23,42,0.09)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              onClick={abrirEdicao}>
              ✏️ Editar dados cadastrais
            </button>
            <div style={s.section}>
              <div style={s.sectionTitle}>Dados pessoais</div>
              <div style={s.row}><span style={s.rowLabel}>Nome completo</span><span style={{ ...s.rowValue, fontSize: 12 }}>{adv.nome_completo}</span></div>
              <div style={s.row}><span style={s.rowLabel}>OAB</span><span style={s.rowValue}>{adv.oab}</span></div>
              <div style={s.row}><span style={s.rowLabel}>Estado</span><span style={s.rowValue}>{adv.estado}</span></div>
              <div style={s.row}><span style={s.rowLabel}>Cidade</span><span style={s.rowValue}>{adv.cidade}</span></div>
              {adv.endereco && <div style={s.row}><span style={s.rowLabel}>Endereço</span><span style={{ ...s.rowValue, fontSize: 12, textAlign: 'right', maxWidth: '55%' }}>{adv.endereco}</span></div>}
            {adv.cep && <div style={s.row}><span style={s.rowLabel}>CEP</span><span style={s.rowValue}>{adv.cep}</span></div>}
              {adv.estado_civil && <div style={s.row}><span style={s.rowLabel}>Estado civil</span><span style={s.rowValue}>{adv.estado_civil}</span></div>}
              {adv.nacionalidade && <div style={s.row}><span style={s.rowLabel}>Nacionalidade</span><span style={s.rowValue}>{adv.nacionalidade}</span></div>}
            </div>
            <div style={s.section}>
              <div style={s.sectionTitle}>Contato</div>
              <div style={s.row}>
                <span style={s.rowLabel}>Telefone</span>
                <a href={`https://wa.me/55${(adv.telefone||'').replace(/\D/g,'')}`} target="_blank" rel="noreferrer" style={{ ...s.rowValue, color: '#059669', textDecoration: 'none' }}>
                  {adv.telefone} 💬
                </a>
              </div>
              <div style={s.row}><span style={s.rowLabel}>E-mail</span><span style={{ ...s.rowValue, color: '#2563eb', fontSize: 12 }}>{adv.email}</span></div>
            </div>
            <div style={s.section}>
              <div style={s.sectionTitle}>Vínculo</div>
              <div style={s.row}><span style={s.rowLabel}>Cadastrado em</span><span style={s.rowValue}>{adv.created_at ? new Date(adv.created_at).toLocaleDateString('pt-BR') : '—'}</span></div>
              <div style={s.row}><span style={s.rowLabel}>Última compra</span><span style={s.rowValue}>{adv.ultima_compra ? new Date(adv.ultima_compra + 'T00:00:00').toLocaleDateString('pt-BR') : 'Nenhuma'}</span></div>
              <div style={s.row}><span style={s.rowLabel}>Total de contratos</span><span style={s.rowValue}>{adv.total_compras}</span></div>
            </div>
          </div>
        )}

        {/* Aba: Lotes */}
        {aba === 'lotes' && (
          <div>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 12, paddingTop: 10, borderTop: '0.5px solid rgba(15,23,42,0.08)' }}>
                  <span style={{ color: '#5b6b84' }}>Total · Valor</span>
                  <span style={{ fontWeight: 500 }}>{totalLote} contrato{totalLote !== 1 ? 's' : ''} · {fmt(valorLote)}</span>
                </div>
                <label style={{ ...s.label, marginTop: 14 }}>Data da venda</label>
                <input style={s.input} type="date" value={dataCompra} onChange={e => setDataCompra(e.target.value)} />
                <button style={totalLote === 0 || saving ? s.btnDisabled : s.btnSave} onClick={registrarLote} disabled={totalLote === 0 || saving}>
                  {saving ? 'Salvando...' : `Registrar ${totalLote > 0 ? `${totalLote} contrato${totalLote !== 1 ? 's' : ''} · ${fmt(valorLote)}` : 'lote'}`}
                </button>
                <button onClick={() => setModalReposicao(true)} style={{ width: '100%', marginTop: 8, padding: '10px', background: 'rgba(251,191,36,.12)', color: '#b45309', border: '0.5px solid #fbbf24', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                  🔄 Solicitar reposição (grátis)
                </button>
              </div>
            </div>

            {/* Lotes existentes */}
            {lotes.length > 0 && (
              <div style={s.section}>
                <div style={s.sectionTitle}>Histórico de lotes</div>
                {lotes.map(lote => {
                  const ps = PAG_STYLE[lote.status_pagamento] || PAG_STYLE.emitir_contrato
                  const prodsDoLote = comprasPorData[lote.data_compra] || {}
                  return (
                    <div key={lote.id} style={{ border: `0.5px solid ${ps.color}30`, borderRadius: 10, padding: 12, marginBottom: 12, background: ps.bg + '40' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{lote.data_compra}</div>
                          <div style={{ fontSize: 12, color: '#5b6b84', marginTop: 2 }}>{lote.total_contratos} contrato{lote.total_contratos !== 1 ? 's' : ''} · {fmt(lote.valor_total)}</div>
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

                      {lote.status_pagamento === 'pago' && lote.data_pagamento && (
                        <div style={{ fontSize: 11, color: '#059669', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                          ✓ Pago em {lote.data_pagamento}
                          {lote.comprovante_url && <button onClick={() => verComprovante(lote)} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 11, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Ver comprovante</button>}
                        </div>
                      )}

                      {/* Ações por status */}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {lote.status_pagamento === 'emitir_contrato' && (
                          <>
                            <button onClick={() => mudarStatusAdmin(lote, 'assinar_contrato')} style={{ flex: 1, padding: '7px', background: 'rgba(167,139,250,.14)', color: '#7c3aed', border: '0.5px solid #a78bfa', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>✓ Contrato emitido</button>
                            <button onClick={() => marcarInadimplente(lote.id)} style={{ padding: '7px 10px', background: 'rgba(248,113,113,.14)', color: '#dc2626', border: '0.5px solid #f87171', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>Inadimp.</button>
                          </>
                        )}
                        {lote.status_pagamento === 'assinar_contrato' && (
                          <>
                            <button onClick={() => mudarStatusAdmin(lote, 'a_entregar')} style={{ flex: 1, padding: '7px', background: 'rgba(96,165,250,.12)', color: '#2563eb', border: '0.5px solid #60a5fa', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>✓ Contrato assinado</button>
                            <button onClick={() => marcarInadimplente(lote.id)} style={{ padding: '7px 10px', background: 'rgba(248,113,113,.14)', color: '#dc2626', border: '0.5px solid #f87171', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>Inadimp.</button>
                          </>
                        )}
                        {lote.status_pagamento === 'a_entregar' && (
                          <>
                            <button onClick={() => mudarStatusAdmin(lote, 'entregue')} style={{ flex: 1, padding: '7px', background: 'rgba(251,191,36,.12)', color: '#b45309', border: '0.5px solid #fbbf24', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>✓ Marcar entregue</button>
                            <button onClick={() => marcarInadimplente(lote.id)} style={{ padding: '7px 10px', background: 'rgba(248,113,113,.14)', color: '#dc2626', border: '0.5px solid #f87171', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>Inadimp.</button>
                          </>
                        )}
                        {lote.status_pagamento === 'entregue' && (
                          <button onClick={() => setModalLote(lote)} style={{ flex: 1, padding: '7px', background: 'rgba(52,211,153,.14)', color: '#059669', border: '0.5px solid #34d399', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>📎 Pago + comprovante</button>
                        )}
                        {lote.status_pagamento === 'pago' && (
                          <button onClick={() => desfazerPagamento(lote.id)} style={{ flex: 1, padding: '7px', background: '#e2e8f0', color: '#5b6b84', border: '0.5px solid #64748b', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>Desfazer</button>
                        )}
                        {lote.status_pagamento === 'inadimplente' && (
                          <>
                            <button onClick={() => mudarStatusAdmin(lote, 'entregue')} style={{ flex: 1, padding: '7px', background: 'rgba(251,191,36,.12)', color: '#b45309', border: '0.5px solid #fbbf24', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>Reativar</button>
                            <button onClick={() => setModalLote(lote)} style={{ flex: 1, padding: '7px', background: 'rgba(52,211,153,.14)', color: '#059669', border: '0.5px solid #34d399', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>📎 Pago</button>
                          </>
                        )}
                        <button onClick={() => excluirLote(lote)} style={{ padding: '7px 10px', background: 'none', color: '#64748b', border: '0.5px solid #ddd', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>Excluir</button>
                      </div>

                      {/* Editar valor negociado — dono do lote ou admin; bloqueado se pago */}
                      {(profile?.role === 'admin' || lote.vendedor_id === profile?.id) && lote.status_pagamento !== 'pago' && (
                        <button onClick={() => editarValorLote(lote)} style={{ marginTop: 8, fontSize: 11, padding: '5px 10px', background: 'rgba(96,165,250,.10)', color: '#2563eb', border: '0.5px solid #60a5fa', borderRadius: 7, cursor: 'pointer' }}>
                          ✏️ Editar valor ({fmt(lote.valor_total)}){lote.valor_manual ? ' · manual' : ''}
                        </button>
                      )}

                      {/* Admin: editar */}
                      {profile?.role === 'admin' && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '0.5px dashed rgba(15,23,42,0.08)' }}>
                          <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Admin — alterar status</div>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                            {[
                              { key: 'emitir_contrato', label: 'Emitir', bg: '#e2e8f0', color: '#5b6b84' },
                              { key: 'assinar_contrato', label: 'Assinar', bg: 'rgba(167,139,250,.14)', color: '#7c3aed' },
                              { key: 'a_entregar', label: 'A entregar', bg: 'rgba(96,165,250,.12)', color: '#2563eb' },
                              { key: 'entregue', label: 'Entregue', bg: 'rgba(251,191,36,.12)', color: '#b45309' },
                              { key: 'pago', label: 'Pago', bg: 'rgba(52,211,153,.14)', color: '#059669' },
                              { key: 'inadimplente', label: 'Inadimp.', bg: 'rgba(248,113,113,.14)', color: '#dc2626' },
                            ].map(op => (
                              <button key={op.key} disabled={lote.status_pagamento === op.key}
                                onClick={() => op.key === 'pago' ? setModalLote(lote) : mudarStatusAdmin(lote, op.key)}
                                style={{ padding: '5px 10px', borderRadius: 7, fontSize: 11, cursor: lote.status_pagamento === op.key ? 'default' : 'pointer', fontWeight: lote.status_pagamento === op.key ? 500 : 400, background: lote.status_pagamento === op.key ? op.bg : '#e2e8f0', color: lote.status_pagamento === op.key ? op.color : '#5b6b84', border: lote.status_pagamento === op.key ? '1.5px solid ' + op.color : '0.5px solid #ddd' }}>
                                {lote.status_pagamento === op.key ? '✓ ' : ''}{op.label}
                              </button>
                            ))}
                          </div>
                          <button onClick={() => editarQtdLote(lote.id, lote.total_contratos, adv.total_compras)} style={{ fontSize: 11, padding: '5px 10px', background: '#e2e8f0', color: '#5b6b84', border: '0.5px solid #64748b', borderRadius: 7, cursor: 'pointer' }}>
                            ✏️ Editar quantidade ({lote.total_contratos} contrato{lote.total_contratos!==1?'s':''})
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
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

      {modalReposicao && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.05)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => e.target === e.currentTarget && setModalReposicao(false)}>
          <div style={{ background: '#ffffff', borderRadius: 12, padding: '1.5rem', width: 'min(440px, 92vw)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: '#0f172a', marginBottom: 4 }}>🔄 Solicitar reposição</div>
            <div style={{ fontSize: 12, color: '#5b6b84', marginBottom: 16 }}>Contratos grátis pra cobrir problemas com advogado. Não conta no faturamento nem na meta.</div>
            
            <div style={{ fontSize: 12, color: '#5b6b84', marginBottom: 4 }}>Produto</div>
            <select
              value={repForm.produto}
              onChange={e => setRepForm({ ...repForm, produto: e.target.value })}
              style={{ width: '100%', padding: '9px 10px', fontSize: 14, border: '0.5px solid rgba(0,0,0,0.45)', borderRadius: 8, marginBottom: 12, background: '#ffffff', boxSizing: 'border-box' }}
            >
              {PRODUTOS_REPOSICAO.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            {/* Avisa quando o produto escolhido nao bate com o dos clientes marcados —
                foi assim que 6 reposicoes foram parar na fila errada sem ninguem ver. */}
            {(() => {
              const marcados = clientesAdv.filter(c => repSelecionados.includes(c.id))
              const fora = marcados.filter(c => (c.produto || 'Maternidade') !== repForm.produto)
              if (!fora.length) return null
              const quais = [...new Set(fora.map(c => c.produto || 'Maternidade'))].join(', ')
              return (
                <div style={{ fontSize: 12, fontWeight: 600, color: '#dc2626', background: 'rgba(248,113,113,.14)', borderRadius: 8, padding: '8px 10px', marginBottom: 12 }}>
                  ⚠️ {fora.length} cliente{fora.length !== 1 ? 's' : ''} marcado{fora.length !== 1 ? 's' : ''} {fora.length !== 1 ? 'são' : 'é'} de <b>{quais}</b>, mas o produto acima está como <b>{repForm.produto}</b>.
                  <div style={{ fontWeight: 400, marginTop: 3 }}>Se enviar assim, a reposição cai na fila de entrega errada.</div>
                </div>
              )
            })()}

            <div style={{ fontSize: 12, color: '#5b6b84', marginBottom: 4 }}>
              Clientes que serão repostos <span style={{ color: '#dc2626' }}>({repSelecionados.length} selecionado{repSelecionados.length !== 1 ? 's' : ''})</span>
            </div>
            <div style={{ fontSize: 11, color: '#5b6b84', marginBottom: 6 }}>Marque os clientes deste advogado que furaram. Serão CANCELADOS quando o admin aprovar.</div>
            <input
              value={repBusca}
              onChange={e => setRepBusca(e.target.value)}
              placeholder="🔎 Buscar por nome ou CPF..."
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.45)', borderRadius: 8, marginBottom: 8, boxSizing: 'border-box' }}
            />
            <div style={{ maxHeight: 200, overflowY: 'auto', border: '0.5px solid rgba(15,23,42,0.11)', borderRadius: 8, marginBottom: 12 }}>
              {clientesAdv.length === 0 ? (
                <div style={{ padding: '12px', fontSize: 12, color: '#5b6b84' }}>Nenhum cliente vivo deste advogado disponível.</div>
              ) : clientesAdvFiltrados.length === 0 ? (
                <div style={{ padding: '12px', fontSize: 12, color: '#5b6b84' }}>Nenhum cliente encontrado.</div>
              ) : clientesAdvFiltrados.map(c => {
                const sel = repSelecionados.includes(c.id)
                return (
                  <div key={c.id}
                    onClick={() => setRepSelecionados(sel ? repSelecionados.filter(id => id !== c.id) : [...repSelecionados, c.id])}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '0.5px solid rgba(15,23,42,0.05)', cursor: 'pointer', background: sel ? 'rgba(248,113,113,.14)' : '#ffffff' }}>
                    <input type="checkbox" checked={sel} readOnly style={{ pointerEvents: 'none' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: '#0f172a' }}>{c.nome}</div>
                      <div style={{ fontSize: 11, color: '#5b6b84' }}>{c.cpf} · {c.status}{c.produto ? ' · ' + c.produto : ''}</div>
                    </div>
                  </div>
                )
              })}
            </div>
            
            <div style={{ fontSize: 12, color: '#5b6b84', marginBottom: 4 }}>Motivo</div>
            <select 
              value={repForm.motivo} 
              onChange={e => setRepForm({ ...repForm, motivo: e.target.value })}
              style={{ width: '100%', padding: '9px 10px', fontSize: 14, border: '0.5px solid rgba(0,0,0,0.45)', borderRadius: 8, marginBottom: 12, background: '#ffffff', boxSizing: 'border-box' }}
            >
              <option value="">Selecione...</option>
              <option value="Cliente não assinou">Cliente não assinou</option>
              <option value="CCT sem sucesso">CCT sem sucesso</option>
              <option value="Cliente desistiu">Cliente desistiu</option>
              <option value="Documentação inválida">Documentação inválida</option>
              <option value="Erro na emissão">Erro na emissão</option>
              <option value="Outro">Outro</option>
            </select>
            
            <div style={{ fontSize: 12, color: '#5b6b84', marginBottom: 4 }}>Observação (opcional)</div>
            <textarea
              value={repForm.observacao} 
              onChange={e => setRepForm({ ...repForm, observacao: e.target.value })}
              placeholder="Detalhe o motivo se necessário..."
              rows={3}
              style={{ width: '100%', padding: '9px 10px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.45)', borderRadius: 8, marginBottom: 16, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
            
            <div style={{ display: 'flex', gap: 8 }}>
              <button 
                onClick={() => { setModalReposicao(false); setRepSelecionados([]) }}
                style={{ flex: 1, padding: '10px', background: '#e2e8f0', color: '#5b6b84', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button 
                onClick={solicitarReposicao}
                disabled={savingRep || !repForm.motivo || repSelecionados.length === 0}
                style={{ flex: 2, padding: '10px', background: (savingRep || !repForm.motivo || repSelecionados.length === 0) ? '#64748b' : '#fbbf24', color: '#232a37', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: (savingRep || !repForm.motivo || repSelecionados.length === 0) ? 'not-allowed' : 'pointer' }}
              >
                {savingRep ? 'Enviando...' : `Enviar solicitação${repSelecionados.length ? ' (' + repSelecionados.length + ')' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
