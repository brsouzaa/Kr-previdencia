import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import formatarParaWhatsApp from '../lib/formatarParaWhatsApp'

const TIPOS_DOC = [
  { chave: 'rg_frente', label: 'RG Frente' },
  { chave: 'rg_verso', label: 'RG Verso' },
  { chave: 'comprovante_1', label: 'Comprovante 1' },
  { chave: 'comprovante_2', label: 'Comprovante 2' },
  { chave: 'comprovante_endereco', label: 'Comprovante de endereço' },
]

const s = {
  card: { background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 14, padding: '1.25rem', marginBottom: 12 },
  loteCard: { background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 14, padding: '1rem', marginBottom: 10, cursor: 'pointer' },
  badge: (cor, bg) => ({ display: 'inline-block', padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 500, color: cor, background: bg }),
  btn: { padding: '8px 14px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer' },
  btnGreen: { padding: '8px 14px', background: '#3B6D11', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer' },
  btnRed: { padding: '8px 14px', background: '#fff', color: '#A32D2D', border: '1px solid #A32D2D', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer' },
  btnSec: { padding: '8px 14px', background: '#fff', color: '#185FA5', border: '0.5px solid #185FA540', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer' },
  modalBg: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' },
  modal: { background: '#fff', borderRadius: 14, padding: '1.5rem', maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto' },
}

export default function Entregas() {
  const { profile } = useAuth()
  const [lotes, setLotes] = useState([])
  const [loteAberto, setLoteAberto] = useState(null)
  const [clientesLote, setClientesLote] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalDevolucao, setModalDevolucao] = useState(null)
  const [tipoDevolucao, setTipoDevolucao] = useState('correcao_doc')
  const [motivoDevolucao, setMotivoDevolucao] = useState('')
  const [processando, setProcessando] = useState(false)
  const [verDocsId, setVerDocsId] = useState(null)
  const [copiadoId, setCopiadoId] = useState(null)
  const [copiadoTodos, setCopiadoTodos] = useState(false)

  // Busca lotes que têm clientes em em_validacao OU validado (ainda não entregues)
  const fetchLotes = useCallback(async () => {
    setLoading(true)
    const { data: cs } = await supabase.from('clientes')
      .select('lote_id, status, advogado_id')
      .in('status', ['em_validacao','validado','devolvido_correcao_doc'])
      .not('lote_id', 'is', null)

    // Agrupa por lote_id
    const loteIds = [...new Set((cs || []).map(c => c.lote_id))]
    if (loteIds.length === 0) { setLotes([]); setLoading(false); return }

    const { data: lts } = await supabase.from('lotes')
      .select('*, advogados(nome_completo, oab, estado), profiles(id, nome)')
      .in('id', loteIds)

    const enriquecido = (lts || []).map(l => {
      const dolote = (cs || []).filter(c => c.lote_id === l.id)
      return {
        ...l,
        em_validacao: dolote.filter(c => c.status === 'em_validacao').length,
        validados: dolote.filter(c => c.status === 'validado').length,
        devolvidos: dolote.filter(c => c.status === 'devolvido_correcao_doc').length,
        total: dolote.length,
      }
    }).sort((a,b) => (b.em_validacao + b.devolvidos) - (a.em_validacao + a.devolvidos))

    setLotes(enriquecido)
    setLoading(false)
  }, [])

  useEffect(() => { fetchLotes() }, [fetchLotes])
  useEffect(() => {
    const id = setInterval(fetchLotes, 60000)
    return () => clearInterval(id)
  }, [fetchLotes])

  async function abrirLote(lote) {
    setLoteAberto(lote)
    const { data } = await supabase.from('clientes')
      .select('*, profiles!clientes_vendedor_operador_id_fkey(nome)')
      .eq('lote_id', lote.id)
      .order('created_at')
    setClientesLote(data || [])
  }

  async function refreshLote(loteId) {
    const { data } = await supabase.from('clientes')
      .select('*, profiles!clientes_vendedor_operador_id_fkey(nome)')
      .eq('lote_id', loteId)
      .order('created_at')
    setClientesLote(data || [])
    fetchLotes()
  }

  async function validar(cliente) {
    setProcessando(true)
    const { error } = await supabase.from('clientes').update({
      status: 'validado',
      validado_por: profile.id,
      validado_em: new Date().toISOString(),
    }).eq('id', cliente.id)
    if (error) alert('Erro: ' + error.message)
    else await refreshLote(cliente.lote_id)
    setProcessando(false)
  }

  async function devolver() {
    if (!modalDevolucao || !motivoDevolucao.trim()) return
    setProcessando(true)
    try {
      if (tipoDevolucao === 'correcao_doc') {
        // Correção de documento — mantém contrato, só vendedor re-uploada
        const { error } = await supabase.from('clientes').update({
          status: 'devolvido_correcao_doc',
          motivo_devolucao: motivoDevolucao,
          devolvido_por: profile.id,
          devolvido_em: new Date().toISOString(),
        }).eq('id', modalDevolucao.id)
        if (error) throw error
      } else {
        // Reemissão — cancela ZapSign, vendedor corrige dados, supervisora reemite
        const resp = await supabase.functions.invoke('gerar-contratos-zapsign/devolver-reemissao', {
          body: { cliente_id: modalDevolucao.id, motivo: motivoDevolucao, analista_id: profile.id }
        })
        if (resp.error) throw new Error(typeof resp.error === 'string' ? resp.error : JSON.stringify(resp.error))
        if (!resp.data?.ok) throw new Error(resp.data?.error || 'Erro')
      }

      await refreshLote(modalDevolucao.lote_id)
      setModalDevolucao(null)
      setMotivoDevolucao('')
      setTipoDevolucao('correcao_doc')
    } catch (err) {
      alert('Erro: ' + (err.message || err.toString()))
    }
    setProcessando(false)
  }

  function copiarWhats(c) {
    const texto = formatarParaWhatsApp(c, c.profiles?.nome)
    navigator.clipboard.writeText(texto)
    setCopiadoId(c.id)
    setTimeout(() => setCopiadoId(null), 2500)
  }

  function copiarTodosValidados() {
    if (!loteAberto) return
    const validados = clientesLote.filter(c => c.status === 'validado')
    if (validados.length === 0) return
    const textos = validados.map((c, i) => `${i === 0 ? '' : '\n\n———————————————\n\n'}${formatarParaWhatsApp(c, c.profiles?.nome)}`).join('')
    navigator.clipboard.writeText(textos)
    setCopiadoTodos(true)
    setTimeout(() => setCopiadoTodos(false), 2500)
  }

  async function entregarLote() {
    if (!loteAberto) return
    const validados = clientesLote.filter(c => c.status === 'validado')
    if (validados.length === 0) {
      alert('Nenhum cliente validado pra entregar')
      return
    }
    const aindaPendentes = clientesLote.filter(c => c.status === 'em_validacao' || c.status === 'devolvido_correcao_doc').length
    const totalLote = loteAberto.total_contratos || clientesLote.length
    const jaEntreguesAntes = clientesLote.filter(c => c.status === 'entregue').length
    const totalEntregando = validados.length
    const futuroEntregue = jaEntreguesAntes + totalEntregando
    const eEntregaTotal = futuroEntregue >= totalLote && aindaPendentes === 0

    const msg = aindaPendentes > 0
      ? `Entregar ${totalEntregando} cliente(s) validados? ⚠️ Restam ${aindaPendentes} pendentes — esta será uma ENTREGA PARCIAL.`
      : `Entregar ${totalEntregando} cliente(s) validados pro advogado ${loteAberto.advogados?.nome_completo}?`

    if (!window.confirm(msg)) return
    setProcessando(true)

    try {
      const ids = validados.map(c => c.id)
      const agora = new Date().toISOString()
      const { error: e1 } = await supabase.from('clientes').update({
        status: 'entregue',
        entregue_em: agora,
      }).in('id', ids)
      if (e1) throw e1

      const updates = {
        qtd_validados: futuroEntregue,
        notificacao_pendente: true,
        updated_at: agora,
      }
      if (!loteAberto.data_primeira_entrega) updates.data_primeira_entrega = agora
      if (eEntregaTotal) {
        updates.status_pagamento = 'entregue'
        updates.qtd_entregues = totalLote
        updates.data_entrega = agora.slice(0, 10)
        updates.data_entrega_total = agora
      }
      const { error: e2 } = await supabase.from('lotes').update(updates).eq('id', loteAberto.id)
      if (e2) throw e2

      alert(`✅ ${totalEntregando} cliente(s) marcados como entregue${totalEntregando !== 1 ? 's' : ''}!\nVendedor de advogado foi notificado.`)
      setLoteAberto(null)
      await fetchLotes()
    } catch (err) {
      alert('Erro: ' + (err.message || err.toString()))
    }
    setProcessando(false)
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>Carregando...</div>

  // === Tela de detalhe do lote ===
  if (loteAberto) {
    const totalLote = loteAberto.total_contratos || clientesLote.length
    const validados = clientesLote.filter(c => c.status === 'validado')
    const emValidacao = clientesLote.filter(c => c.status === 'em_validacao')
    const devolvidos = clientesLote.filter(c => c.status === 'devolvido_correcao_doc')
    const entregues = clientesLote.filter(c => c.status === 'entregue')

    return (
      <div>
        <div style={{ marginBottom: '1.5rem' }}>
          <button onClick={() => setLoteAberto(null)} style={{ marginBottom: 8, background: 'none', border: 'none', color: '#185FA5', cursor: 'pointer', fontSize: 13 }}>← voltar</button>
          <div style={{ fontSize: 20, fontWeight: 500, color: '#111', marginBottom: 2 }}>Lote — {loteAberto.advogados?.nome_completo}</div>
          <div style={{ fontSize: 12, color: '#888' }}>
            OAB/{loteAberto.advogados?.estado} {loteAberto.advogados?.oab} · Vendedor: {loteAberto.profiles?.nome}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 16 }}>
          <div style={{ ...s.card, padding: 12, marginBottom: 0, textAlign: 'center', background: '#FAEEDA' }}>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#854F0B' }}>{emValidacao.length}</div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#854F0B' }}>Em validação</div>
          </div>
          <div style={{ ...s.card, padding: 12, marginBottom: 0, textAlign: 'center', background: '#EAF3DE' }}>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#3B6D11' }}>{validados.length}</div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#3B6D11' }}>Validados</div>
          </div>
          <div style={{ ...s.card, padding: 12, marginBottom: 0, textAlign: 'center', background: '#FCEBEB' }}>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#A32D2D' }}>{devolvidos.length}</div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#A32D2D' }}>Devolvidos</div>
          </div>
          <div style={{ ...s.card, padding: 12, marginBottom: 0, textAlign: 'center', background: '#E6F1FB' }}>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#185FA5' }}>{entregues.length}/{totalLote}</div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#185FA5' }}>Entregues</div>
          </div>
        </div>

        {validados.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <button onClick={copiarTodosValidados} style={copiadoTodos ? s.btnGreen : s.btn}>
              {copiadoTodos ? '✓ Copiado' : `📋 Copiar ${validados.length} dossiê(s) pra WhatsApp`}
            </button>
            <button onClick={entregarLote} disabled={processando}
              style={{ ...s.btnGreen, padding: '8px 16px', fontSize: 13, fontWeight: 600, opacity: processando ? 0.5 : 1 }}>
              📦 Entregar {validados.length} validado(s) pro advogado
            </button>
          </div>
        )}

        {clientesLote.map(c => {
          const docs = c.documentos || {}
          const verDocs = verDocsId === c.id
          const cor = c.status === 'validado' ? '#3B6D11' :
                      c.status === 'em_validacao' ? '#854F0B' :
                      c.status === 'devolvido_correcao_doc' ? '#A32D2D' :
                      c.status === 'entregue' ? '#185FA5' : '#666'
          const bg = c.status === 'validado' ? '#EAF3DE' :
                     c.status === 'em_validacao' ? '#FAEEDA' :
                     c.status === 'devolvido_correcao_doc' ? '#FCEBEB' :
                     c.status === 'entregue' ? '#E6F1FB' : '#f0f0ee'
          const labelStatus = c.status === 'validado' ? '✓ Validado' :
                              c.status === 'em_validacao' ? '⏳ Aguardando você validar' :
                              c.status === 'devolvido_correcao_doc' ? '⚠️ Devolvido — aguarda correção' :
                              c.status === 'entregue' ? '📦 Já entregue' : c.status
          return (
            <div key={c.id} style={{ ...s.card, borderLeft: `3px solid ${cor}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#111' }}>{c.nome}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>{c.cpf} · {c.telefone} · Vendedor: {c.profiles?.nome}</div>
                </div>
                <span style={s.badge(cor, bg)}>{labelStatus}</span>
              </div>

              {c.motivo_devolucao && c.status === 'devolvido_correcao_doc' && (
                <div style={{ fontSize: 12, color: '#A32D2D', padding: 8, background: '#FCEBEB', borderRadius: 6, marginBottom: 8 }}>
                  💬 <strong>Motivo da devolução:</strong> {c.motivo_devolucao}
                </div>
              )}

              <div style={{ fontSize: 11, color: '#aaa', marginBottom: 8 }}>
                {c.cidade}/{c.uf} · {c.produto === 'Auxilio Acidente' ? 'Auxílio Acidente' : c.produto}
                {c.produto === 'Maternidade' && c.nis && ` · NIS: ${c.nis}`}
              </div>

              <button onClick={() => setVerDocsId(verDocs ? null : c.id)}
                style={{ fontSize: 12, color: '#185FA5', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0, marginBottom: 8 }}>
                📎 {verDocs ? 'Esconder documentos' : 'Ver documentos'}
              </button>

              {verDocs && (
                <div style={{ background: '#fafaf8', borderRadius: 6, padding: 10, marginBottom: 8 }}>
                  {TIPOS_DOC.map(tipo => (
                    <div key={tipo.chave} style={{ marginBottom: 4, fontSize: 12 }}>
                      <span style={{ color: '#555' }}>{tipo.label}: </span>
                      {docs[tipo.chave] ? (
                        <a href={docs[tipo.chave]} target="_blank" rel="noreferrer" style={{ color: '#185FA5', textDecoration: 'underline' }}>✓ abrir</a>
                      ) : (
                        <span style={{ color: '#aaa' }}>— não anexado</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {(c.status === 'em_validacao' || c.status === 'validado') && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => copiarWhats(c)} style={copiadoId === c.id ? s.btnGreen : s.btnSec}>
                    {copiadoId === c.id ? '✓ Copiado' : '📋 Copiar dossiê'}
                  </button>
                  {c.status === 'em_validacao' && (
                    <>
                      <button onClick={() => validar(c)} disabled={processando} style={s.btnGreen}>
                        ✅ Validar
                      </button>
                      <button onClick={() => setModalDevolucao(c)} style={s.btnRed}>
                        🔄 Devolver
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Modal devolução */}
        {modalDevolucao && (
          <div style={s.modalBg} onClick={() => !processando && setModalDevolucao(null)}>
            <div style={s.modal} onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>Devolver: {modalDevolucao.nome}</div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>Escolha o tipo de devolução e descreva o problema</div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: '#555', marginBottom: 8, fontWeight: 500 }}>Tipo:</div>
                <button onClick={() => setTipoDevolucao('correcao_doc')}
                  style={{
                    width: '100%', padding: 12, marginBottom: 8, textAlign: 'left',
                    border: tipoDevolucao === 'correcao_doc' ? '1.5px solid #854F0B' : '0.5px solid rgba(0,0,0,0.15)',
                    background: tipoDevolucao === 'correcao_doc' ? '#FAEEDA' : '#fff',
                    borderRadius: 8, cursor: 'pointer', fontSize: 13,
                  }}>
                  <div style={{ fontWeight: 500, color: '#854F0B' }}>🔁 Correção de documentos</div>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                    Mantém o contrato. Vendedor só re-anexa o documento problemático. Mais rápido.
                  </div>
                </button>
                <button onClick={() => setTipoDevolucao('reemissao')}
                  style={{
                    width: '100%', padding: 12, textAlign: 'left',
                    border: tipoDevolucao === 'reemissao' ? '1.5px solid #A32D2D' : '0.5px solid rgba(0,0,0,0.15)',
                    background: tipoDevolucao === 'reemissao' ? '#FCEBEB' : '#fff',
                    borderRadius: 8, cursor: 'pointer', fontSize: 13,
                  }}>
                  <div style={{ fontWeight: 500, color: '#A32D2D' }}>🔄 Reemissão de contrato</div>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                    Cancela contrato no ZapSign. Vendedor corrige dados, supervisão emite de novo, cliente assina novo. Use pra erros graves (CPF errado, nome errado).
                  </div>
                </button>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: '#555', marginBottom: 6, fontWeight: 500 }}>Motivo da devolução *</div>
                <textarea value={motivoDevolucao} onChange={e => setMotivoDevolucao(e.target.value)}
                  placeholder="Ex: foto do RG borrada, comprovante 1 ilegível..."
                  style={{ width: '100%', minHeight: 80, padding: 10, fontSize: 13, border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 8, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none', resize: 'vertical' }} />
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setModalDevolucao(null)} disabled={processando}
                  style={{ flex: 1, padding: 10, background: '#fff', color: '#666', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button onClick={devolver} disabled={processando || !motivoDevolucao.trim()}
                  style={{ flex: 2, padding: 10, background: motivoDevolucao.trim() && !processando ? '#A32D2D' : '#aaa', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: motivoDevolucao.trim() && !processando ? 'pointer' : 'not-allowed' }}>
                  {processando ? '⏳ Processando...' : 'Confirmar devolução'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // === Tela lista de lotes ===
  return (
    <div>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 500, color: '#111', marginBottom: 4 }}>📥 Validação e Entregas</div>
          <div style={{ fontSize: 13, color: '#888' }}>{lotes.length} lote{lotes.length !== 1 ? 's' : ''} com clientes pra validar/entregar</div>
        </div>
        <button onClick={fetchLotes} style={{ padding: '8px 14px', fontSize: 13, background: '#fff', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 8, cursor: 'pointer', color: '#555' }}>
          ↻ Atualizar
        </button>
      </div>

      {lotes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#888', background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.06)' }}>
          ✅ Sem lotes pendentes no momento.
        </div>
      ) : lotes.map(l => (
        <div key={l.id} style={s.loteCard} onClick={() => abrirLote(l)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#111' }}>{l.advogados?.nome_completo}</div>
              <div style={{ fontSize: 11, color: '#888' }}>OAB/{l.advogados?.estado} {l.advogados?.oab} · Vendedor: {l.profiles?.nome}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {l.em_validacao > 0 && <span style={s.badge('#854F0B', '#FAEEDA')}>⏳ {l.em_validacao} pra validar</span>}
            {l.validados > 0 && <span style={s.badge('#3B6D11', '#EAF3DE')}>✓ {l.validados} validado{l.validados !== 1 ? 's' : ''}</span>}
            {l.devolvidos > 0 && <span style={s.badge('#A32D2D', '#FCEBEB')}>⚠️ {l.devolvidos} devolvido{l.devolvidos !== 1 ? 's' : ''}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
