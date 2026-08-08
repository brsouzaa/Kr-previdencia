import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import UploadDocumento from '../components/UploadDocumento'

const STATUS_INFO = {
  aguardando_emissao:      { label: 'Aguardando emissão', cor: '#fbbf24', bg: 'rgba(251,191,36,.12)', icon: '⏳' },
  emitido:                 { label: 'Emitido — link disponível', cor: '#60a5fa', bg: 'rgba(96,165,250,.12)', icon: '📨' },
  assinado:                { label: 'Assinado — bônus contabilizado!', cor: '#34d399', bg: 'rgba(52,211,153,.14)', icon: '🏆' },
  aguardando_pos_venda:    { label: 'Assinou — pós-venda vai ligar', cor: '#60a5fa', bg: 'rgba(96,165,250,.12)', icon: '📞' },
  em_contato_pos_venda:    { label: 'Pós-venda em contato', cor: '#fbbf24', bg: 'rgba(251,191,36,.12)', icon: '📞' },
  validado_pos_venda:      { label: 'Validado pelo pós-venda', cor: '#34d399', bg: 'rgba(52,211,153,.14)', icon: '✓' },
  barrado_pos_venda:       { label: 'Barrado pelo pós-venda — bônus descontado!', cor: '#f87171', bg: 'rgba(248,113,113,.14)', icon: '❌' },
  em_validacao:            { label: 'Em validação pela analista', cor: '#34d399', bg: 'rgba(52,211,153,.14)', icon: '🔍' },
  validado:                { label: 'Validado pela analista', cor: '#34d399', bg: 'rgba(52,211,153,.14)', icon: '✅' },
  entregue:                { label: 'Entregue ao advogado', cor: '#60a5fa', bg: 'rgba(96,165,250,.12)', icon: '📦' },
  devolvido_correcao_doc:  { label: 'Devolvido — bônus descontado!', cor: '#f87171', bg: 'rgba(248,113,113,.14)', icon: '⚠️' },
  devolvido_reemissao:     { label: 'Devolvido — bônus descontado!', cor: '#f87171', bg: 'rgba(248,113,113,.14)', icon: '⚠️' },
  expirado:                { label: 'Expirou sem assinar', cor: '#f87171', bg: 'rgba(248,113,113,.14)', icon: '⌛' },
  cancelado:               { label: 'Cancelado', cor: '#8b9bb4', bg: '#1a2742', icon: '❌' },
}

const TIPOS_DOC = [
  { chave: 'rg_frente', label: 'RG Frente', obrigatorio: true },
  { chave: 'rg_verso', label: 'RG Verso', obrigatorio: true },
  { chave: 'comprovante_1', label: 'Comprovante 1', obrigatorio: true },
  { chave: 'comprovante_2', label: 'Comprovante 2', obrigatorio: true },
  { chave: 'comprovante_endereco', label: 'Comprovante de endereço (opcional)', obrigatorio: false },
]

const s = {
  card: { background: '#131e33', border: '0.5px solid rgba(148,163,184,0.14)', borderRadius: 14, padding: '1rem', marginBottom: 10 },
  cardAlerta: { background: '#131e33', border: '1.5px solid #f87171', borderRadius: 14, padding: '1rem', marginBottom: 10, boxShadow: '0 0 0 4px rgba(248,113,113,0.08)' },
  search: { width: '100%', padding: '10px 12px', fontSize: 14, border: '0.5px solid rgba(0,0,0,0.45)', borderRadius: 8, background: '#131e33', outline: 'none', boxSizing: 'border-box', marginBottom: 12 },
  filtroChip: (ativo, cor, bg) => ({
    padding: '6px 12px', fontSize: 12, borderRadius: 16,
    background: ativo ? cor : bg, color: ativo ? '#131e33' : cor,
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

export default function MeusClientes() {
  const { profile } = useAuth()
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [busca, setBusca] = useState('')
  const [copiadoId, setCopiadoId] = useState(null)
  const [reemitindoId, setReemitindoId] = useState(null)
  const [editandoDocsId, setEditandoDocsId] = useState(null)

  const fetchClientes = useCallback(async () => {
    setLoading(true)
    // Coordenadora B2C: RLS já filtra pelo setor_responsavel; busca JOIN com vendedor pra ver quem cadastrou
    const isCoord = profile?.role === 'coordenador_b2c'
    let q = supabase
      .from('clientes')
      .select(isCoord ? '*, profiles!clientes_vendedor_operador_id_fkey(nome)' : '*')
      .order('created_at', { ascending: false })
    if (profile?.role === 'vendedor_operador') {
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

  async function atualizarDoc(clienteId, chave, url) {
    const cli = clientes.find(c => c.id === clienteId)
    if (!cli) return
    const novosDocs = { ...(cli.documentos || {}), [chave]: url }
    const { error } = await supabase.from('clientes').update({ documentos: novosDocs }).eq('id', clienteId)
    if (error) alert('Erro ao salvar documento: ' + error.message)
    else fetchClientes()
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: '#8b9bb4' }}>Carregando...</div>

  return (
    <div>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 500, color: '#e6edf7', marginBottom: 4 }}>
            {profile?.role === 'coordenador_b2c'
              ? `📋 Clientes do setor ${profile?.setor_responsavel === 'autonomos' ? 'autônomos' : 'captação + IA'}`
              : '📋 Meus clientes'}
          </div>
          <div style={{ fontSize: 13, color: '#8b9bb4' }}>{clientes.length} cliente{clientes.length !== 1 ? 's' : ''} cadastrado{clientes.length !== 1 ? 's' : ''}</div>
        </div>
        <button onClick={fetchClientes} style={{ padding: '8px 14px', fontSize: 13, background: '#131e33', border: '0.5px solid rgba(148,163,184,0.20)', borderRadius: 8, cursor: 'pointer', color: '#8b9bb4' }}>
          ↻ Atualizar
        </button>
      </div>

      {/* Alerta de devoluções */}
      {devolvidos.length > 0 && (
        <div style={{ background: 'rgba(248,113,113,.14)', border: '1.5px solid #f87171', borderRadius: 10, padding: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#f87171', marginBottom: 4 }}>
            ⚠️ {devolvidos.length} cliente{devolvidos.length !== 1 ? 's' : ''} devolvido{devolvidos.length !== 1 ? 's' : ''} — bônus descontado!
          </div>
          <div style={{ fontSize: 12, color: '#f87171', marginBottom: 8 }}>
            A analista pediu correção. Resolva pra recuperar o bônus.
          </div>
          <button onClick={() => setFiltroStatus(devolvidos[0].status)}
            style={{
              padding: '8px 14px', background: '#f87171', color: '#131e33', border: 'none', borderRadius: 8,
              fontSize: 12, fontWeight: 500, cursor: 'pointer'
            }}>
            👉 Ver clientes devolvidos
          </button>
        </div>
      )}

      <input style={s.search} placeholder="🔍 Buscar por nome, CPF ou telefone..."
        value={busca} onChange={e => setBusca(e.target.value)} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <button style={s.filtroChip(filtroStatus === 'todos', '#60a5fa', 'rgba(96,165,250,.12)')} onClick={() => setFiltroStatus('todos')}>
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
        <div style={{ textAlign: 'center', padding: '3rem', color: '#8b9bb4', background: '#131e33', borderRadius: 14, border: '0.5px solid rgba(148,163,184,0.10)' }}>
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
                <div style={{ fontSize: 14, fontWeight: 500, color: '#e6edf7', marginBottom: 2 }}>{c.nome}</div>
                <div style={{ fontSize: 12, color: '#8b9bb4' }}>{c.cpf} · {c.telefone}</div>
              </div>
              <span style={s.badgeStatus(info.cor, info.bg)}>{info.icon} {info.label}</span>
            </div>

            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
              {c.cidade}/{c.uf} · {c.produto === 'Auxilio Acidente' ? 'Auxílio Acidente' : c.produto} · {tempoRelativo(c.created_at)}
              {' · '}
              <span style={{ color: docsAnexados >= 4 ? '#34d399' : '#f87171' }}>📎 {docsAnexados}/5 documentos</span>
              {profile?.role === 'coordenador_b2c' && c.profiles?.nome && (
                <> · 👤 <span style={{ color: '#8b9bb4' }}>{c.profiles.nome}</span></>
              )}
            </div>

            {/* REEMITIDO AUTOMATICAMENTE — informativo, vendedor não precisa fazer nada */}
            {ehReemitidoAuto && (
              <div style={{ marginTop: 10, padding: 12, background: 'rgba(251,191,36,.12)', borderRadius: 8, border: '1px solid #F59E0B40' }}>
                <div style={{ fontSize: 12, color: '#fbbf24', fontWeight: 500, marginBottom: 4 }}>
                  🔄 Cliente foi reemitido pela analista
                </div>
                <div style={{ fontSize: 13, color: '#fbbf24', fontStyle: 'italic', marginBottom: 8 }}>
                  Motivo: "{c.motivo_reemissao}"
                </div>
                <div style={{ fontSize: 11, color: '#8b9bb4', lineHeight: 1.5 }}>
                  ✅ <strong>Não precisa fazer nada.</strong> A supervisão vai gerar um novo contrato pra <strong>outro advogado</strong> automaticamente. Quando o link sair, ele aparece aqui pra você enviar pro cliente. Avise o cliente que vai chegar um novo link em breve.
                </div>
              </div>
            )}

            {/* DEVOLVIDO - mensagem destacada */}
            {ehDevolvido && c.motivo_devolucao && (
              <div style={{ marginTop: 10, padding: 12, background: 'rgba(248,113,113,.14)', borderRadius: 8, border: '1px solid #A32D2D40' }}>
                <div style={{ fontSize: 12, color: '#f87171', fontWeight: 500, marginBottom: 4 }}>
                  💬 Motivo da devolução pela analista:
                </div>
                <div style={{ fontSize: 13, color: '#f87171', fontStyle: 'italic', marginBottom: 10 }}>
                  "{c.motivo_devolucao}"
                </div>
                {/* Contador 24h só pra correção de documento */}
                {c.status === 'devolvido_correcao_doc' && (() => {
                  const t = tempoRestante24h(c.devolvido_em)
                  return (
                    <div style={{
                      padding: '8px 10px', borderRadius: 6, marginBottom: 10,
                      background: t.urgente ? '#f87171' : 'rgba(251,191,36,.12)',
                      color: t.urgente ? '#131e33' : '#fbbf24',
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
                    <div style={{ fontSize: 11, color: '#8b9bb4', marginBottom: 8 }}>
                      O bônus desse cliente foi descontado. Edite os documentos abaixo, depois clique em "✅ Marcar corrigido" pra recuperar o bônus.
                    </div>
                    <button onClick={() => setEditandoDocsId(c.id)}
                      style={{ width: '100%', padding: '10px', background: '#f87171', color: '#131e33', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', marginBottom: 6 }}>
                      📎 Editar documentos
                    </button>
                    <button onClick={() => marcarCorrigido(c)}
                      style={{ width: '100%', padding: '10px', background: '#34d399', color: '#131e33', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                      ✅ Marcar corrigido — recuperar bônus
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 11, color: '#8b9bb4', marginBottom: 8 }}>
                      O bônus desse cliente foi descontado. O contrato precisa ser refeito — clique abaixo pra mandar pra supervisão emitir novamente. <strong>O novo contrato vai pra outro advogado da fila.</strong> Quando o cliente assinar de novo, o bônus volta.
                    </div>
                    <button onClick={() => refazer(c)} disabled={reemitindoId === c.id}
                      style={{ width: '100%', padding: '10px', background: reemitindoId === c.id ? '#64748b' : '#f87171', color: '#131e33', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: reemitindoId === c.id ? 'not-allowed' : 'pointer' }}>
                      {reemitindoId === c.id ? '⏳ Processando...' : '🔄 Reiniciar fluxo'}
                    </button>
                  </>
                )}
              </div>
            )}

            {c.observacao && (
              <div style={{ fontSize: 12, color: '#8b9bb4', marginTop: 8, padding: '6px 10px', background: '#0d1526', borderRadius: 6, fontStyle: 'italic' }}>
                "{c.observacao}"
              </div>
            )}

            {/* DOCUMENTOS */}
            <div style={{ marginTop: 10 }}>
              {!editando ? (
                <button onClick={() => setEditandoDocsId(c.id)}
                  style={{ fontSize: 12, color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                  📎 Ver/{editavel ? 'editar' : ''} documentos
                </button>
              ) : (
                <div style={{ marginTop: 8, padding: 12, background: '#0d1526', borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#8b9bb4' }}>
                      Documentos {!editavel && '(somente leitura)'}
                    </div>
                    <button onClick={() => setEditandoDocsId(null)} style={{ fontSize: 11, color: '#8b9bb4', background: 'none', border: 'none', cursor: 'pointer' }}>fechar</button>
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
                        <span style={{ color: '#8b9bb4' }}>{tipo.label}: </span>
                        {docs[tipo.chave] ? (
                          <a href={docs[tipo.chave]} target="_blank" rel="noreferrer" style={{ color: '#34d399', textDecoration: 'underline' }}>✓ ver arquivo</a>
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
                <div style={{ fontSize: 11, color: '#60a5fa', marginBottom: 6, fontWeight: 500 }}>📨 Link de assinatura — envie pro cliente:</div>
                <div style={{ background: '#131e33', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#60a5fa', wordBreak: 'break-all', marginBottom: 8, border: '0.5px solid rgba(148,163,184,0.10)' }}>
                  {c.link_assinatura}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => copiarLink(c)} style={{ flex: 1, padding: '8px', background: copiadoId === c.id ? '#34d399' : '#60a5fa', color: '#131e33', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                    {copiadoId === c.id ? '✓ Copiado' : '📋 Copiar link'}
                  </button>
                  <a href={whatsappLink(c)} target="_blank" rel="noreferrer"
                    style={{ flex: 1, padding: '8px', background: '#34d399', color: '#131e33', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', textDecoration: 'none', textAlign: 'center' }}>
                    💬 Enviar WhatsApp
                  </a>
                </div>
              </div>
            )}

            {c.status === 'expirado' && (
              <div style={{ marginTop: 10, padding: 10, background: 'rgba(248,113,113,.14)', borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: '#f87171', marginBottom: 8 }}>⌛ Cliente não assinou em 15h.</div>
                <button onClick={() => refazer(c)} disabled={reemitindoId === c.id}
                  style={{ width: '100%', padding: '8px', background: reemitindoId === c.id ? '#64748b' : '#f87171', color: '#131e33', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: reemitindoId === c.id ? 'not-allowed' : 'pointer' }}>
                  {reemitindoId === c.id ? '⏳ Processando...' : '🔄 Solicitar nova emissão'}
                </button>
              </div>
            )}

            {c.status === 'aguardando_emissao' && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#fbbf24' }}>Aguardando supervisão emitir o contrato...</div>
            )}
            {c.status === 'em_validacao' && (
              <div style={{ marginTop: 8, padding: 8, background: 'rgba(52,211,153,.14)', borderRadius: 6, fontSize: 11, color: '#34d399', textAlign: 'center', fontWeight: 500 }}>
                🏆 Bônus contabilizado · Aguardando analista validar
              </div>
            )}
            {c.status === 'assinado' && (
              <div style={{ marginTop: 8, padding: 8, background: 'rgba(52,211,153,.14)', borderRadius: 6, fontSize: 11, color: '#34d399', textAlign: 'center', fontWeight: 500 }}>
                🏆 Bônus contabilizado!
              </div>
            )}
            {c.status === 'validado' && (
              <div style={{ marginTop: 8, padding: 8, background: 'rgba(52,211,153,.14)', borderRadius: 6, fontSize: 11, color: '#34d399', textAlign: 'center', fontWeight: 500 }}>
                ✅ Validado pela analista · Bônus contabilizado
              </div>
            )}
            {c.status === 'entregue' && (
              <div style={{ marginTop: 8, padding: 8, background: 'rgba(96,165,250,.12)', borderRadius: 6, fontSize: 11, color: '#60a5fa', textAlign: 'center', fontWeight: 500 }}>
                📦 Entregue ao advogado · Bônus contabilizado
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
