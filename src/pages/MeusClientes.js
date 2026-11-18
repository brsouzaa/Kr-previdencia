import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import UploadDocumento from '../components/UploadDocumento'

const STATUS_INFO = {
  aguardando_emissao:      { label: 'Aguardando emissão', cor: '#b45309', bg: 'rgba(251,191,36,.12)', icon: '⏳' },
  emitido:                 { label: 'Emitido — link disponível', cor: '#2563eb', bg: 'rgba(96,165,250,.12)', icon: '📨' },
  assinado:                { label: 'Assinado — bônus contabilizado!', cor: '#059669', bg: 'rgba(52,211,153,.14)', icon: '🏆' },
  aguardando_pos_venda:    { label: 'Assinou — pós-venda vai ligar', cor: '#2563eb', bg: 'rgba(96,165,250,.12)', icon: '📞' },
  em_contato_pos_venda:    { label: 'Pós-venda em contato', cor: '#b45309', bg: 'rgba(251,191,36,.12)', icon: '📞' },
  validado_pos_venda:      { label: 'Validado pelo pós-venda', cor: '#059669', bg: 'rgba(52,211,153,.14)', icon: '✓' },
  barrado_pos_venda:       { label: 'Barrado pelo pós-venda — bônus descontado!', cor: '#dc2626', bg: 'rgba(248,113,113,.14)', icon: '❌' },
  em_validacao:            { label: 'Em validação pela analista', cor: '#059669', bg: 'rgba(52,211,153,.14)', icon: '🔍' },
  validado:                { label: 'Validado pela analista', cor: '#059669', bg: 'rgba(52,211,153,.14)', icon: '✅' },
  entregue:                { label: 'Entregue ao advogado', cor: '#2563eb', bg: 'rgba(96,165,250,.12)', icon: '📦' },
  devolvido_correcao_doc:  { label: 'Devolvido — bônus descontado!', cor: '#dc2626', bg: 'rgba(248,113,113,.14)', icon: '⚠️' },
  devolvido_reemissao:     { label: 'Devolvido — bônus descontado!', cor: '#dc2626', bg: 'rgba(248,113,113,.14)', icon: '⚠️' },
  expirado:                { label: 'Expirou sem assinar', cor: '#dc2626', bg: 'rgba(248,113,113,.14)', icon: '⌛' },
  cancelado:               { label: 'Cancelado', cor: '#5b6b84', bg: '#e2e8f0', icon: '❌' },
}

const TIPOS_DOC = [
  { chave: 'rg_frente', label: 'RG Frente', obrigatorio: true },
  { chave: 'rg_verso', label: 'RG Verso', obrigatorio: true },
  { chave: 'comprovante_1', label: 'Comprovante 1', obrigatorio: true },
  { chave: 'comprovante_2', label: 'Comprovante 2', obrigatorio: true },
  { chave: 'comprovante_endereco', label: 'Comprovante de endereço (opcional)', obrigatorio: false },
]

const s = {
  card: { background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 14, padding: '1rem', marginBottom: 10 },
  cardAlerta: { background: '#ffffff', border: '1.5px solid #f87171', borderRadius: 14, padding: '1rem', marginBottom: 10, boxShadow: '0 0 0 4px rgba(248,113,113,0.08)' },
  search: { width: '100%', padding: '10px 12px', fontSize: 14, border: '0.5px solid rgba(0,0,0,0.45)', borderRadius: 8, background: '#ffffff', outline: 'none', boxSizing: 'border-box', marginBottom: 12 },
  filtroChip: (ativo, cor, bg) => ({
    padding: '6px 12px', fontSize: 12, borderRadius: 16,
    background: ativo ? cor : bg, color: ativo ? '#232a37' : cor,
    border: `1px solid ${cor}40`, cursor: 'pointer', fontWeight: 500,
  }),
  badgeStatus: (cor, bg) => ({ display: 'inline-block', padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 500, color: cor, background: bg }),
}

function tempoRelativo(dt) {
  const ms = Date.now() - new Date(dt).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `há ${d}d`
  return new Date(dt).toLocaleDateString('pt-BR')
}

// Calcula quanto tempo falta até cancelamento automático (24h)
// Retorna { texto, urgente }
function tempoRestante24h(devolvidoEm) {
  if (!devolvidoEm) return { texto: '', urgente: false, vencido: false }
  const limite = new Date(devolvidoEm).getTime() + (24 * 60 * 60 * 1000)
  const restante = limite - Date.now()
  if (restante <= 0) return { texto: '⚠️ Vencido — será cancelado em breve', urgente: true, vencido: true }
  const horas = Math.floor(restante / (60 * 60 * 1000))
  const minutos = Math.floor((restante % (60 * 60 * 1000)) / (60 * 1000))
  if (horas === 0) return { texto: `⏰ Restam ${minutos}min`, urgente: true, vencido: false }
  if (horas < 6) return { texto: `⏰ Restam ${horas}h ${minutos}min`, urgente: true, vencido: false }
  return { texto: `⏰ Restam ${horas}h pra resolver`, urgente: false, vencido: false }
}

// 16/11/2026 (Bruno): papel le todos os clientes no banco (analista), mas em "Meus clientes" so ve os proprios
const IDS_SO_PROPRIOS = [
  '88929e81-7223-4754-a17b-1cd08f46195d', // Sthefany Mendes
]
// 16/11/2026 (Bruno): quem acompanha os clientes de um time inteiro em "Meus clientes"
const IDS_DANI_RT = {
  '71a5b26a-28c3-421a-bc25-d9dee6e577a2': [ // Dani (RT)
    '71a5b26a-28c3-421a-bc25-d9dee6e577a2', // Dani
    '7dcd2bef-c0c5-41ac-b104-ff8eed300ca5', // RT CRÉDITOS — Ronaldo
    '1d62560e-49f8-41b1-90ef-7c045d92034e', // Kayllaine (RT)
    'c22ed96c-b2e2-4e1b-b3ad-6d71f83e2882', // Thamires (RT)
    '68fda177-b412-4014-b72b-646afbd65b07', // Tamires (RT)
    '3c2d5397-4956-49af-97e4-56f865b8a2ce', // Brenda (RT)
    '9ea8edb6-2398-444f-aa28-1b1caece671c', // Kisse (RT)
  ],
  // 18/11/2026 (Bruno): Ronaldo (RT CREDITOS) ve os clientes do time RT (RLS ronaldo_rt_le_clientes)
  '7dcd2bef-c0c5-41ac-b104-ff8eed300ca5': [ // RT CRÉDITOS — Ronaldo
    '7dcd2bef-c0c5-41ac-b104-ff8eed300ca5', // o próprio Ronaldo
    '71a5b26a-28c3-421a-bc25-d9dee6e577a2', // Dani (RT)
    '1d62560e-49f8-41b1-90ef-7c045d92034e', // Kayllaine (RT)
    'c22ed96c-b2e2-4e1b-b3ad-6d71f83e2882', // Thamires (RT)
    '68fda177-b412-4014-b72b-646afbd65b07', // Tamires (RT)
    '3c2d5397-4956-49af-97e4-56f865b8a2ce', // Brenda (RT)
    '9ea8edb6-2398-444f-aa28-1b1caece671c', // Kisse (RT)
  ],
  // 17/11/2026 (Bruno): Kayllaine (RT) com o mesmo acesso do Ronaldo
  '1d62560e-49f8-41b1-90ef-7c045d92034e': [ // Kayllaine (RT)
    '1d62560e-49f8-41b1-90ef-7c045d92034e', // Kayllaine
    '7dcd2bef-c0c5-41ac-b104-ff8eed300ca5', // RT CRÉDITOS — Ronaldo
    '71a5b26a-28c3-421a-bc25-d9dee6e577a2', // Dani (RT)
    'c22ed96c-b2e2-4e1b-b3ad-6d71f83e2882', // Thamires (RT)
    '68fda177-b412-4014-b72b-646afbd65b07', // Tamires (RT)
    '3c2d5397-4956-49af-97e4-56f865b8a2ce', // Brenda (RT)
    '9ea8edb6-2398-444f-aa28-1b1caece671c', // Kisse (RT)
  ],
}

export default function MeusClientes() {
  const { profile } = useAuth()
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [busca, setBusca] = useState('')
  const [copiadoId, setCopiadoId] = useState(null)
  const [reemitindoId, setReemitindoId] = useState(null)
  // 18/11/2026 (Bruno): pop-up da reemissao — mesmo advogado ou um dos disponiveis. { c, carregando, anterior, opcoes, escolha, erro }
  const [popReemitir, setPopReemitir] = useState(null)
  const [editandoDocsId, setEditandoDocsId] = useState(null)

  const fetchClientes = useCallback(async () => {
    setLoading(true)
    // Coordenadora B2C: RLS já filtra pelo setor_responsavel; busca JOIN com vendedor pra ver quem cadastrou
    const isCoord = profile?.role === 'coordenador_b2c'
    // 16/11/2026 (Bruno): Dani (RT) acompanha os clientes do RT CREDITOS e das vendedoras RT (RLS dani_rt_le_clientes)
    const timeRt = IDS_DANI_RT[profile?.id] || null
    let q = supabase
      .from('clientes')
      .select(isCoord || timeRt ? '*, profiles!clientes_vendedor_operador_id_fkey(nome)' : '*')
      .order('created_at', { ascending: false })
    if (timeRt) {
      q = q.in('vendedor_operador_id', timeRt)
    } else if (profile?.role === 'vendedor_operador' || IDS_SO_PROPRIOS.includes(profile?.id)) {
      // 16/11/2026 (Bruno): Sthefany (analista) digita propostas — aqui so os clientes que ELA cadastrou
      q = q.eq('vendedor_operador_id', profile.id)
    }
    const { data } = await q
    setClientes(data || [])
    setLoading(false)
  }, [profile])

  useEffect(() => { fetchClientes() }, [fetchClientes])
  useEffect(() => {
    const id = setInterval(fetchClientes, 30000)
    return () => clearInterval(id)
  }, [fetchClientes])

  const devolvidos = clientes.filter(c => c.status === 'devolvido_correcao_doc' || c.status === 'devolvido_reemissao')

  // Ordem de prioridade do status — devolvidos sempre no topo pra urgência ficar visível
  const ORDEM_STATUS = {
    devolvido_correcao_doc: 1,
    devolvido_reemissao: 1,
    expirado: 2,
    emitido: 3,
    aguardando_emissao: 4,
    em_validacao: 5,
    assinado: 6,
    validado: 7,
    entregue: 8,
    cancelado: 9,
  }

  const filtrados = clientes
    .filter(c => {
      if (filtroStatus !== 'todos' && c.status !== filtroStatus) return false
      if (busca) {
        const b = busca.toLowerCase()
        return c.nome.toLowerCase().includes(b) || c.cpf.includes(b) || c.telefone.includes(b)
      }
      return true
    })
    .sort((a, b) => {
      const oa = ORDEM_STATUS[a.status] || 99
      const ob = ORDEM_STATUS[b.status] || 99
      if (oa !== ob) return oa - ob
      // Dentro do mesmo status, mais recente primeiro
      return new Date(b.created_at) - new Date(a.created_at)
    })

  const counts = { todos: clientes.length }
  Object.keys(STATUS_INFO).forEach(k => {
    counts[k] = clientes.filter(c => c.status === k).length
  })

  function copiarLink(c) {
    if (!c.link_assinatura) return
    navigator.clipboard.writeText(c.link_assinatura)
    setCopiadoId(c.id); setTimeout(() => setCopiadoId(null), 2500)
  }

  function whatsappLink(c) {
    const tel = (c.telefone || '').replace(/\D/g, '')
    const msg = encodeURIComponent(
      `Olá ${c.nome.split(' ')[0]}, tudo bem? Seguindo nossa conversa, segue o link para assinatura digital dos seus documentos:\n\n${c.link_assinatura}\n\nO link expira em 15 horas. Qualquer dúvida me avise!`
    )
    return `https://wa.me/55${tel}?text=${msg}`
  }

  // Cliente devolvido com correção de documento → vendedor re-uploada e marca como resolvido
  // (volta pra em_validacao)
  async function marcarCorrigido(c) {
    if (!window.confirm(`Confirmar que você corrigiu os documentos de ${c.nome}?\nVai voltar pra fila da analista validar.`)) return
    const { error } = await supabase.from('clientes').update({
      status: 'em_validacao',
      motivo_devolucao: null, devolvido_por: null, devolvido_em: null,
    }).eq('id', c.id)
    if (error) alert('Erro: ' + error.message)
    else fetchClientes()
  }

  // Devolvido pra reemissão → volta pra aguardando_emissao (igual fluxo de expirado)
  async function refazer(c) {
    if (!window.confirm(`Reiniciar fluxo de ${c.nome}?\nVai voltar pra fila da supervisão emitir um novo contrato.`)) return
    setReemitindoId(c.id)
    try {
      const { error } = await supabase.from('clientes').update({
        status: 'aguardando_emissao',
        contrato_producao_id: null, lote_id: null, advogado_id: null,
        zapsign_token: null, link_assinatura: null,
        emitido_por: null, emitido_em: null,
        bloqueado_por: null, bloqueado_em: null,
        motivo_devolucao: null, devolvido_por: null, devolvido_em: null,
      }).eq('id', c.id)
      if (error) {
        if (error.code === '23505') {
          alert('Já existe um cadastro ativo (aguardando ou emitido) com este CPF.')
        } else { throw error }
        setReemitindoId(null); return
      }
      await fetchClientes()
      alert('✅ Cliente de volta na fila da supervisão.')
    } catch (err) {
      alert('Erro: ' + (err.message || err.toString()))
    }
    setReemitindoId(null)
  }

  // 18/11/2026 (Bruno): "Solicitar nova emissao" (expirado) abre um pop-up: fica com o mesmo advogado ou troca
  // por um dos disponiveis (mesma lista do Novo cliente). O contrato novo sai SOZINHO (trg_emissao_automatica_time),
  // igual ao cadastro normal; se o advogado estiver sem vaga, fica na Fila de digitacao como antes.
  async function abrirReemitir(c) {
    setPopReemitir({ c, carregando: true, anterior: null, opcoes: [], escolha: '', erro: null })
    let r = null, erro = null
    try {
      const { data, error } = await supabase.rpc('reemitir_advogado_opcoes', { p_cliente_id: c.id })
      if (error || !data?.ok) erro = error?.message || data?.erro || 'não consegui carregar os advogados'
      else r = data
    } catch (e) { erro = String(e.message || e) }
    const anterior = r?.anterior || null
    const opcoes = Array.isArray(r?.opcoes) ? r.opcoes : []
    setPopReemitir({ c, carregando: false, anterior, opcoes, escolha: anterior?.id || opcoes[0]?.id || '', erro })
  }

  async function confirmarReemitir() {
    const p = popReemitir
    if (!p || p.carregando) return
    const c = p.c
    setReemitindoId(c.id)
    try {
      const { error } = await supabase.from('clientes').update({
        status: 'aguardando_emissao',
        advogado_escolhido_id: p.escolha || c.advogado_escolhido_id || null,
        contrato_producao_id: null, lote_id: null, advogado_id: null,
        zapsign_token: null, link_assinatura: null,
        emitido_por: null, emitido_em: null,
        bloqueado_por: null, bloqueado_em: null,
        motivo_devolucao: null, devolvido_por: null, devolvido_em: null,
      }).eq('id', c.id)
      if (error) {
        if (error.code === '23505') {
          alert('Já existe um cadastro ativo (aguardando ou emitido) com este CPF.')
        } else { throw error }
        setReemitindoId(null); return
      }
      setPopReemitir(null)
      await fetchClientes()
      alert('✅ Novo contrato pedido. O link aparece aqui em cerca de 1 minuto (a tela atualiza sozinha).\nSe o advogado estiver sem vaga, o contrato fica na Fila de digitação e a supervisão emite.')
    } catch (err) {
      alert('Erro: ' + (err.message || err.toString()))
    }
    setReemitindoId(null)
  }

  async function atualizarDoc(clienteId, chave, url) {
    const cli = clientes.find(c => c.id === clienteId)
    if (!cli) return
    const novosDocs = { ...(cli.documentos || {}), [chave]: url }
    const { error } = await supabase.from('clientes').update({ documentos: novosDocs }).eq('id', clienteId)
    if (error) alert('Erro ao salvar documento: ' + error.message)
    else fetchClientes()
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: '#5b6b84' }}>Carregando...</div>

  return (
    <div>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 500, color: '#0f172a', marginBottom: 4 }}>
            {profile?.role === 'coordenador_b2c'
              ? `📋 Clientes do setor ${profile?.setor_responsavel === 'autonomos' ? 'autônomos' : 'captação + IA'}`
              : '📋 Meus clientes'}
          </div>
          <div style={{ fontSize: 13, color: '#5b6b84' }}>{clientes.length} cliente{clientes.length !== 1 ? 's' : ''} cadastrado{clientes.length !== 1 ? 's' : ''}</div>
        </div>
        <button onClick={fetchClientes} style={{ padding: '8px 14px', fontSize: 13, background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.11)', borderRadius: 8, cursor: 'pointer', color: '#5b6b84' }}>
          ↻ Atualizar
        </button>
      </div>

      {/* Alerta de devoluções */}
      {devolvidos.length > 0 && (
        <div style={{ background: 'rgba(248,113,113,.14)', border: '1.5px solid #f87171', borderRadius: 10, padding: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#dc2626', marginBottom: 4 }}>
            ⚠️ {devolvidos.length} cliente{devolvidos.length !== 1 ? 's' : ''} devolvido{devolvidos.length !== 1 ? 's' : ''} — bônus descontado!
          </div>
          <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>
            A analista pediu correção. Resolva pra recuperar o bônus.
          </div>
          <button onClick={() => setFiltroStatus(devolvidos[0].status)}
            style={{
              padding: '8px 14px', background: '#f87171', color: '#232a37', border: 'none', borderRadius: 8,
              fontSize: 12, fontWeight: 500, cursor: 'pointer'
            }}>
            👉 Ver clientes devolvidos
          </button>
        </div>
      )}

      <input style={s.search} placeholder="🔍 Buscar por nome, CPF ou telefone..."
        value={busca} onChange={e => setBusca(e.target.value)} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <button style={s.filtroChip(filtroStatus === 'todos', '#2563eb', 'rgba(96,165,250,.12)')} onClick={() => setFiltroStatus('todos')}>
          Todos · {counts.todos}
        </button>
        {Object.entries(STATUS_INFO).map(([key, info]) => {
          if (!counts[key]) return null
          return (
            <button key={key} style={s.filtroChip(filtroStatus === key, info.cor, info.bg)} onClick={() => setFiltroStatus(key)}>
              {info.icon} {info.label} · {counts[key]}
            </button>
          )
        })}
      </div>

      {filtrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#5b6b84', background: '#ffffff', borderRadius: 14, border: '0.5px solid rgba(15,23,42,0.06)' }}>
          {clientes.length === 0 ? '📭 Nenhum cliente cadastrado ainda.' : 'Nenhum cliente encontrado.'}
        </div>
      ) : filtrados.map(c => {
        const info = STATUS_INFO[c.status] || STATUS_INFO.aguardando_emissao
        const docs = c.documentos || {}
        const docsAnexados = TIPOS_DOC.filter(t => docs[t.chave]).length
        const editavel = c.status === 'aguardando_emissao' || c.status === 'devolvido_correcao_doc'
        const editando = editandoDocsId === c.id
        const ehDevolvido = c.status === 'devolvido_correcao_doc' || c.status === 'devolvido_reemissao'
        // Cliente que veio de reemissao automatica: tá em aguardando_emissao mas tem motivo_reemissao
        const ehReemitidoAuto = c.status === 'aguardando_emissao' && c.motivo_reemissao
        const cardStyle = (ehDevolvido || ehReemitidoAuto) ? s.cardAlerta : { ...s.card, borderLeft: `3px solid ${info.cor}` }

        return (
          <div key={c.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 8 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#0f172a', marginBottom: 2 }}>{c.nome}</div>
                <div style={{ fontSize: 12, color: '#5b6b84' }}>{c.cpf} · {c.telefone}</div>
              </div>
              <span style={s.badgeStatus(info.cor, info.bg)}>{info.icon} {info.label}</span>
            </div>

            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
              {c.cidade}/{c.uf} · {c.produto === 'Auxilio Acidente' ? 'Auxílio Acidente' : c.produto} · {tempoRelativo(c.created_at)}
              {' · '}
              <span style={{ color: docsAnexados >= 4 ? '#059669' : '#dc2626' }}>📎 {docsAnexados}/5 documentos</span>
              {(profile?.role === 'coordenador_b2c' || IDS_DANI_RT[profile?.id]) && c.profiles?.nome && (
                <> · 👤 <span style={{ color: '#5b6b84' }}>{c.profiles.nome}</span></>
              )}
            </div>

            {/* REEMITIDO AUTOMATICAMENTE — informativo, vendedor não precisa fazer nada */}
            {ehReemitidoAuto && (
              <div style={{ marginTop: 10, padding: 12, background: 'rgba(251,191,36,.12)', borderRadius: 8, border: '1px solid #F59E0B40' }}>
                <div style={{ fontSize: 12, color: '#b45309', fontWeight: 500, marginBottom: 4 }}>
                  🔄 Cliente foi reemitido pela analista
                </div>
                <div style={{ fontSize: 13, color: '#b45309', fontStyle: 'italic', marginBottom: 8 }}>
                  Motivo: "{c.motivo_reemissao}"
                </div>
                <div style={{ fontSize: 11, color: '#5b6b84', lineHeight: 1.5 }}>
                  ✅ <strong>Não precisa fazer nada.</strong> A supervisão vai gerar um novo contrato pra <strong>outro advogado</strong> automaticamente. Quando o link sair, ele aparece aqui pra você enviar pro cliente. Avise o cliente que vai chegar um novo link em breve.
                </div>
              </div>
            )}

            {/* DEVOLVIDO - mensagem destacada */}
            {ehDevolvido && c.motivo_devolucao && (
              <div style={{ marginTop: 10, padding: 12, background: 'rgba(248,113,113,.14)', borderRadius: 8, border: '1px solid #A32D2D40' }}>
                <div style={{ fontSize: 12, color: '#dc2626', fontWeight: 500, marginBottom: 4 }}>
                  💬 Motivo da devolução pela analista:
                </div>
                <div style={{ fontSize: 13, color: '#dc2626', fontStyle: 'italic', marginBottom: 10 }}>
                  "{c.motivo_devolucao}"
                </div>
                {/* Contador 24h só pra correção de documento */}
                {c.status === 'devolvido_correcao_doc' && (() => {
                  const t = tempoRestante24h(c.devolvido_em)
                  return (
                    <div style={{
                      padding: '8px 10px', borderRadius: 6, marginBottom: 10,
                      background: t.urgente ? '#f87171' : 'rgba(251,191,36,.12)',
                      color: t.urgente ? '#232a37' : '#b45309',
                      fontSize: 12, fontWeight: 500, textAlign: 'center'
                    }}>
                      {t.texto}
                      {!t.vencido && <div style={{ fontSize: 10, fontWeight: 400, marginTop: 2, opacity: 0.9 }}>
                        Se passar de 24h sem corrigir, contrato é cancelado automaticamente
                      </div>}
                    </div>
                  )
                })()}
                {c.status === 'devolvido_correcao_doc' ? (
                  <>
                    <div style={{ fontSize: 11, color: '#5b6b84', marginBottom: 8 }}>
                      O bônus desse cliente foi descontado. Edite os documentos abaixo, depois clique em "✅ Marcar corrigido" pra recuperar o bônus.
                    </div>
                    <button onClick={() => setEditandoDocsId(c.id)}
                      style={{ width: '100%', padding: '10px', background: '#f87171', color: '#232a37', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', marginBottom: 6 }}>
                      📎 Editar documentos
                    </button>
                    <button onClick={() => marcarCorrigido(c)}
                      style={{ width: '100%', padding: '10px', background: '#34d399', color: '#232a37', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                      ✅ Marcar corrigido — recuperar bônus
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 11, color: '#5b6b84', marginBottom: 8 }}>
                      O bônus desse cliente foi descontado. O contrato precisa ser refeito — clique abaixo pra mandar pra supervisão emitir novamente. <strong>O novo contrato vai pra outro advogado da fila.</strong> Quando o cliente assinar de novo, o bônus volta.
                    </div>
                    <button onClick={() => refazer(c)} disabled={reemitindoId === c.id}
                      style={{ width: '100%', padding: '10px', background: reemitindoId === c.id ? '#64748b' : '#f87171', color: '#232a37', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: reemitindoId === c.id ? 'not-allowed' : 'pointer' }}>
                      {reemitindoId === c.id ? '⏳ Processando...' : '🔄 Reiniciar fluxo'}
                    </button>
                  </>
                )}
              </div>
            )}

            {c.observacao && (
              <div style={{ fontSize: 12, color: '#5b6b84', marginTop: 8, padding: '6px 10px', background: '#f2f5fa', borderRadius: 6, fontStyle: 'italic' }}>
                "{c.observacao}"
              </div>
            )}

            {/* DOCUMENTOS */}
            <div style={{ marginTop: 10 }}>
              {!editando ? (
                <button onClick={() => setEditandoDocsId(c.id)}
                  style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                  📎 Ver/{editavel ? 'editar' : ''} documentos
                </button>
              ) : (
                <div style={{ marginTop: 8, padding: 12, background: '#f2f5fa', borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#5b6b84' }}>
                      Documentos {!editavel && '(somente leitura)'}
                    </div>
                    <button onClick={() => setEditandoDocsId(null)} style={{ fontSize: 11, color: '#5b6b84', background: 'none', border: 'none', cursor: 'pointer' }}>fechar</button>
                  </div>
                  {editavel ? (
                    TIPOS_DOC.map(tipo => (
                      <UploadDocumento key={tipo.chave}
                        label={tipo.label} obrigatorio={tipo.obrigatorio}
                        clienteId={c.id} chave={tipo.chave}
                        valorInicial={docs[tipo.chave]}
                        onChange={url => atualizarDoc(c.id, tipo.chave, url)} />
                    ))
                  ) : (
                    TIPOS_DOC.map(tipo => (
                      <div key={tipo.chave} style={{ marginBottom: 6, fontSize: 12 }}>
                        <span style={{ color: '#5b6b84' }}>{tipo.label}: </span>
                        {docs[tipo.chave] ? (
                          <a href={docs[tipo.chave]} target="_blank" rel="noreferrer" style={{ color: '#059669', textDecoration: 'underline' }}>✓ ver arquivo</a>
                        ) : (
                          <span style={{ color: '#64748b' }}>— não anexado</span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {c.status === 'emitido' && c.link_assinatura && (
              <div style={{ marginTop: 12, padding: 10, background: 'rgba(96,165,250,.12)', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: '#2563eb', marginBottom: 6, fontWeight: 500 }}>📨 Link de assinatura — envie pro cliente:</div>
                <div style={{ background: '#ffffff', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#2563eb', wordBreak: 'break-all', marginBottom: 8, border: '0.5px solid rgba(15,23,42,0.06)' }}>
                  {c.link_assinatura}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => copiarLink(c)} style={{ flex: 1, padding: '8px', background: copiadoId === c.id ? '#34d399' : '#60a5fa', color: '#232a37', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                    {copiadoId === c.id ? '✓ Copiado' : '📋 Copiar link'}
                  </button>
                  <a href={whatsappLink(c)} target="_blank" rel="noreferrer"
                    style={{ flex: 1, padding: '8px', background: '#34d399', color: '#232a37', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', textDecoration: 'none', textAlign: 'center' }}>
                    💬 Enviar WhatsApp
                  </a>
                </div>
              </div>
            )}

            {c.status === 'expirado' && (
              <div style={{ marginTop: 10, padding: 10, background: 'rgba(248,113,113,.14)', borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>⌛ Cliente não assinou em 15h.</div>
                <button onClick={() => abrirReemitir(c)} disabled={reemitindoId === c.id}
                  style={{ width: '100%', padding: '8px', background: reemitindoId === c.id ? '#64748b' : '#f87171', color: '#232a37', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: reemitindoId === c.id ? 'not-allowed' : 'pointer' }}>
                  {reemitindoId === c.id ? '⏳ Processando...' : '🔄 Solicitar nova emissão'}
                </button>
              </div>
            )}

            {c.status === 'aguardando_emissao' && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#b45309' }}>⏳ Emitindo o contrato — o link aparece aqui em instantes. Se demorar, a supervisão emite pela Fila de digitação.</div>
            )}
            {c.status === 'em_validacao' && (
              <div style={{ marginTop: 8, padding: 8, background: 'rgba(52,211,153,.14)', borderRadius: 6, fontSize: 11, color: '#059669', textAlign: 'center', fontWeight: 500 }}>
                🏆 Bônus contabilizado · Aguardando analista validar
              </div>
            )}
            {c.status === 'assinado' && (
              <div style={{ marginTop: 8, padding: 8, background: 'rgba(52,211,153,.14)', borderRadius: 6, fontSize: 11, color: '#059669', textAlign: 'center', fontWeight: 500 }}>
                🏆 Bônus contabilizado!
              </div>
            )}
            {c.status === 'validado' && (
              <div style={{ marginTop: 8, padding: 8, background: 'rgba(52,211,153,.14)', borderRadius: 6, fontSize: 11, color: '#059669', textAlign: 'center', fontWeight: 500 }}>
                ✅ Validado pela analista · Bônus contabilizado
              </div>
            )}
            {c.status === 'entregue' && (
              <div style={{ marginTop: 8, padding: 8, background: 'rgba(96,165,250,.12)', borderRadius: 6, fontSize: 11, color: '#2563eb', textAlign: 'center', fontWeight: 500 }}>
                📦 Entregue ao advogado · Bônus contabilizado
              </div>
            )}
          </div>
        )
      })}

      {/* 18/11/2026 (Bruno): pop-up da reemissao — mesmo advogado ou um dos disponiveis */}
      {popReemitir && (
        <div onClick={() => reemitindoId ? null : setPopReemitir(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#ffffff', borderRadius: 12, padding: 20, width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 30px rgba(15,23,42,.25)' }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>🔄 Nova emissão — {popReemitir.c.nome}</div>
            <div style={{ fontSize: 13, color: '#5b6b84', marginBottom: 14 }}>Vai continuar com o mesmo advogado ou trocar?</div>
            {popReemitir.carregando ? (
              <div style={{ fontSize: 13, color: '#5b6b84', padding: '12px 0' }}>Carregando advogados...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                {popReemitir.anterior && (
                  <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 10, borderRadius: 8, cursor: 'pointer', border: popReemitir.escolha === popReemitir.anterior.id ? '1.5px solid #34d399' : '1px solid rgba(15,23,42,.12)', background: popReemitir.escolha === popReemitir.anterior.id ? 'rgba(52,211,153,.10)' : '#ffffff' }}>
                    <input type="radio" checked={popReemitir.escolha === popReemitir.anterior.id} onChange={() => setPopReemitir(p => ({ ...p, escolha: p.anterior.id }))} />
                    <span style={{ fontSize: 13, color: '#0f172a' }}>
                      <b>Manter o mesmo advogado</b><br />{popReemitir.anterior.nome}
                      {!popReemitir.anterior.tem_vaga && <span style={{ display: 'block', fontSize: 11, color: '#b45309', marginTop: 2 }}>Sem vaga agora — o contrato fica na Fila de digitação até abrir vaga.</span>}
                    </span>
                  </label>
                )}
                {popReemitir.opcoes.length > 0 && (
                  <div style={{ fontSize: 11, color: '#5b6b84', marginTop: 4 }}>{popReemitir.anterior ? 'OU TROCAR PARA' : 'ESCOLHA O ADVOGADO'}</div>
                )}
                {popReemitir.opcoes.map(o => (
                  <label key={o.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 10, borderRadius: 8, cursor: 'pointer', border: popReemitir.escolha === o.id ? '1.5px solid #60a5fa' : '1px solid rgba(15,23,42,.12)', background: popReemitir.escolha === o.id ? 'rgba(96,165,250,.10)' : '#ffffff' }}>
                    <input type="radio" checked={popReemitir.escolha === o.id} onChange={() => setPopReemitir(p => ({ ...p, escolha: o.id }))} />
                    <span style={{ fontSize: 13, color: '#0f172a' }}>{o.nome}</span>
                  </label>
                ))}
                {!popReemitir.anterior && popReemitir.opcoes.length === 0 && (
                  <div style={{ fontSize: 12, color: '#5b6b84' }}>Nenhum advogado com vaga na sua lista agora — o sistema escolhe pela fila.</div>
                )}
                {popReemitir.erro && <div style={{ fontSize: 11, color: '#dc2626' }}>{popReemitir.erro}</div>}
              </div>
            )}
            <div style={{ fontSize: 11, color: '#5b6b84', marginBottom: 12 }}>O contrato novo sai sozinho e o link aparece aqui em cerca de 1 minuto.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setPopReemitir(null)} disabled={!!reemitindoId}
                style={{ flex: 1, padding: '10px', background: '#ffffff', color: '#5b6b84', border: '1px solid rgba(15,23,42,.12)', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={confirmarReemitir} disabled={popReemitir.carregando || !!reemitindoId}
                style={{ flex: 2, padding: '10px', background: (popReemitir.carregando || reemitindoId) ? '#64748b' : '#60a5fa', color: '#232a37', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: (popReemitir.carregando || reemitindoId) ? 'not-allowed' : 'pointer' }}>
                {reemitindoId ? '⏳ Pedindo...' : '🔄 Confirmar nova emissão'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
