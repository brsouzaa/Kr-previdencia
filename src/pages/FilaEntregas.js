import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function diasRestantes(dataLimite) {
  if (!dataLimite) return null
  return Math.ceil((new Date(dataLimite + 'T23:59:59') - new Date()) / 86400000)
}
function diasDesde(data) { return Math.floor((Date.now() - new Date(data)) / 86400000) }

function urgencia(restam) {
  if (restam === null) return { bg: '#fff', border: 'rgba(0,0,0,0.1)', badgeBg: '#f0f0ee', badgeColor: '#888' }
  if (restam <= 0) return { bg: '#FCEBEB', border: '#A32D2D50', badgeBg: '#A32D2D', badgeColor: '#fff' }
  if (restam <= 2) return { bg: '#FAEEDA', border: '#854F0B50', badgeBg: '#854F0B', badgeColor: '#fff' }
  return { bg: '#EAF3DE', border: '#3B6D1150', badgeBg: '#3B6D11', badgeColor: '#fff' }
}

function isUrlValida(url) {
  if (!url || typeof url !== 'string') return false
  try { const u = new URL(url.trim()); return u.protocol === 'http:' || u.protocol === 'https:' } catch { return false }
}

const STATUS_LABELS = {
  aguardando_emissao: { txt: '⏳ A emitir', cor: '#888' },
  emitido: { txt: '✉️ Aguardando assinar', cor: '#854F0B' },
  expirado: { txt: '❌ Expirou', cor: '#A32D2D' },
  cancelado: { txt: '❌ Cancelado', cor: '#A32D2D' },
  assinado: { txt: '✅ Assinou', cor: '#3B6D11' },
  aguardando_pos_venda: { txt: '📞 Pós-venda', cor: '#185FA5' },
  em_contato_pos_venda: { txt: '📞 Em contato', cor: '#185FA5' },
  validado_pos_venda: { txt: '✅ Pós-venda OK', cor: '#3B6D11' },
  em_validacao: { txt: '🔍 Pra validar', cor: '#854F0B' },
  validado: { txt: '✅ Validado', cor: '#3B6D11' },
  entregue: { txt: '✅ Entregue', cor: '#3B6D11' },
  barrado_pos_venda: { txt: '🚫 Barrado', cor: '#A32D2D' },
  devolvido_correcao_doc: { txt: '↩️ Devolvido', cor: '#854F0B' },
  devolvido_reemissao: { txt: '↩️ Reemitir', cor: '#854F0B' },
}

export default function FilaEntregas() {
  const [lotes, setLotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState({})
  const [profile, setProfile] = useState(null)

  // Modal devolver cliente
  const [devolvendo, setDevolvendo] = useState(null) // { cliente, lote }
  const [motivoDevolucao, setMotivoDevolucao] = useState('')
  const [salvandoDevolucao, setSalvandoDevolucao] = useState(false)

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

  const totalContratos = lotes.reduce((s, l) => s + l.total_contratos, 0)
  const totalEntregues = lotes.reduce((s, l) => s + (l.qtd_entregues || 0), 0)
  const vencendoHoje = lotes.filter(l => { const r = diasRestantes(l.data_limite_entrega); return r !== null && r <= 1 }).length

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>Carregando fila...</div>

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: 20, fontWeight: 500, color: '#111', marginBottom: 4 }}>📦 Fila de entregas</div>
        <div style={{ fontSize: 13, color: '#888' }}>Confira docs e contratos · monte a pasta no Drive · entregue · {lotes.length} pedido{lotes.length !== 1 ? 's' : ''} na fila</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: '1.5rem' }}>
        {[
          ['Na fila', lotes.length, '#185FA5', '#E6F1FB'],
          ['Pendentes', totalContratos - totalEntregues, '#854F0B', '#FAEEDA'],
          ['Entregues', totalEntregues, '#3B6D11', '#EAF3DE'],
          ['Vencem hoje', vencendoHoje, '#A32D2D', '#FCEBEB'],
        ].map(([label, valor, cor, bg]) => (
          <div key={label} style={{ background: label === 'Vencem hoje' && valor > 0 ? bg : '#fff', border: `0.5px solid ${label === 'Vencem hoje' && valor > 0 ? cor + '50' : 'rgba(0,0,0,0.1)'}`, borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: cor, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4, opacity: 0.8 }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 500, color: cor }}>{valor}</div>
          </div>
        ))}
      </div>

      {lotes.length === 0 && (
        <div style={{ textAlign: 'center', padding: '4rem', background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#555' }}>Fila vazia — nenhum lote aguardando entrega</div>
        </div>
      )}

      {lotes.map((lote, idx) => {
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
          <div key={lote.id} style={{ background: u.bg, border: `1.5px solid ${u.border}`, borderRadius: 14, padding: '1.25rem', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#185FA5', color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{idx + 1}°</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: '#111' }}>{lote.advogados?.nome_completo}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{lote.advogados?.oab} · {lote.advogados?.cidade}, {lote.advogados?.estado}</div>
                  <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>Vendedor: {lote.profiles?.nome} · há {chegouHa} dia{chegouHa !== 1 ? 's' : ''}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: '#111', marginBottom: 3 }}>R$ {Number(lote.valor_total).toLocaleString('pt-BR')}</div>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 5 }}>{lote.total_contratos} contrato{lote.total_contratos !== 1 ? 's' : ''}</div>
                <span style={{ padding: '3px 10px', background: u.badgeBg, color: u.badgeColor, borderRadius: 20, fontSize: 11, fontWeight: 500 }}>
                  {restam === null ? 'Sem prazo' : restam <= 0 ? '🔴 Vencido' : restam === 1 ? '⚠️ Vence hoje' : `${restam}d restantes`}
                </span>
              </div>
            </div>

            {/* Progresso */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                <span style={{ color: '#555', fontWeight: 500 }}>Progresso</span>
                <span style={{ color: progresso === 100 ? '#3B6D11' : '#185FA5', fontWeight: 500 }}>{entregues}/{lote.total_contratos} entregues · {progresso}%</span>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.1)', borderRadius: 6, height: 10, overflow: 'hidden' }}>
                <div style={{ width: `${progresso}%`, height: '100%', background: progresso === 100 ? '#3B6D11' : '#185FA5', borderRadius: 6, transition: 'width 0.4s' }} />
              </div>
            </div>

            {/* Contadores */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 }}>
              {[
                ['Total', lote.total_contratos, '#111'],
                ['Assinados', assinadosCard, '#3B6D11'],
                ['Pra validar', validados, validados > 0 ? '#854F0B' : '#888'],
                ['Aguardando', pendentesAssinatura, pendentesAssinatura > 0 ? '#185FA5' : '#888'],
              ].map(([l, v, c]) => (
                <div key={l} style={{ background: '#f8f8f6', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: c, opacity: 0.75, marginBottom: 2 }}>{l}</div>
                  <div style={{ fontSize: 18, fontWeight: 500, color: c }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Lista de clientes */}
            {clientes.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>
                  Clientes ({clientes.length}/{lote.total_contratos} cadastrados)
                </div>
                {clientes.map(c => {
                  const lbl = STATUS_LABELS[c.status] || { txt: c.status, cor: '#888' }
                  const podeDevolver = ['em_validacao','validado'].includes(c.status)
                  return (
                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#f8f8f6', borderRadius: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: '#111', flex: 1 }}>{c.nome}</span>
                      <span style={{ fontSize: 11, fontWeight: 500, color: lbl.cor, marginRight: 10 }}>{lbl.txt}</span>
                      {podeDevolver && (
                        <button onClick={() => abrirDevolucao(c, lote)} style={{ padding: '3px 8px', background: '#FCEBEB', color: '#A32D2D', border: '0.5px solid #A32D2D40', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
                          ↩️ Devolver
                        </button>
                      )}
                    </div>
                  )
                })}
                {expirados > 0 && (
                  <div style={{ fontSize: 11, color: '#A32D2D', marginTop: 4 }}>
                    {expirados} expirado{expirados !== 1 ? 's' : ''} — vão voltar pra emissão (advogado vai ter mais clientes)
                  </div>
                )}
              </div>
            )}

            {/* Aviso lote incompleto */}
            {!completo && validados > 0 && (
              <div style={{ fontSize: 11, color: '#854F0B', background: '#FAEEDA', padding: '8px 10px', borderRadius: 6, marginBottom: 10, border: '0.5px solid #854F0B30' }}>
                ⚠️ Lote incompleto: {validados}/{lote.total_contratos} prontos pra entregar.
                {pendentesAssinatura > 0 && ` ${pendentesAssinatura} ainda assinando.`}
                {' '}Recomendado aguardar completar. Se entregar agora, sistema vai perguntar o que fazer com os pendentes.
              </div>
            )}

            {/* Link Drive — OBRIGATÓRIO */}
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: linkValido ? '#3B6D11' : '#A32D2D', display: 'block', marginBottom: 4, fontWeight: 500 }}>
                {linkValido ? '✅ Link da entrega (Drive)' : '🔴 Link da entrega (Drive) — OBRIGATÓRIO'}
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="url" value={lote.link_entrega || ''} placeholder="https://drive.google.com/drive/folders/..."
                  onChange={e => atualizar(lote.id, { link_entrega: e.target.value })}
                  onBlur={e => salvarCampo(lote.id, { link_entrega: e.target.value })}
                  style={{ flex: 1, padding: '9px 10px', fontSize: 13, border: `1px solid ${linkValido ? '#3B6D1150' : '#A32D2D50'}`, borderRadius: 8, outline: 'none', background: linkValido ? '#EAF3DE40' : '#FCEBEB30' }} />
                {linkValido && (
                  <a href={lote.link_entrega} target="_blank" rel="noreferrer" style={{ padding: '9px 12px', background: '#E6F1FB', color: '#185FA5', border: '0.5px solid #185FA5', borderRadius: 8, fontSize: 12, textDecoration: 'none', display: 'flex', alignItems: 'center' }}>🔗 Ver</a>
                )}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Observação</label>
              <textarea rows={2} value={lote.observacao_entrega || ''} placeholder="Ex: docs OK, contratos validados..."
                onChange={e => atualizar(lote.id, { observacao_entrega: e.target.value })}
                onBlur={e => salvarCampo(lote.id, { observacao_entrega: e.target.value })}
                style={{ width: '100%', padding: '9px 10px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 8, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>

            <button onClick={() => tentarEntregar(lote)}
              disabled={!podeEntregar}
              style={{ width: '100%', padding: '12px', background: podeEntregar ? '#3B6D11' : '#ccc', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: podeEntregar ? 'pointer' : 'not-allowed' }}>
              {!linkValido ? '🔴 Cole o link do Drive primeiro' : validados === 0 ? '⏳ Nenhum cliente pronto pra entregar' : completo ? '✅ Entregar lote completo' : `⚠️ Entregar parcial (${validados}/${lote.total_contratos})`}
            </button>
            {salvando[lote.id] && <div style={{ fontSize: 11, color: '#aaa', marginTop: 6, textAlign: 'right' }}>Salvando...</div>}
          </div>
        )
      })}

      {/* MODAL DEVOLUÇÃO */}
      {devolvendo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 12, width: '90%', maxWidth: 500 }}>
            <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 6 }}>↩️ Devolver pra reemissão</div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 14 }}>Cliente: <strong>{devolvendo.cliente.nome}</strong></div>
            <label style={{ fontSize: 12, color: '#111', fontWeight: 500, marginBottom: 4, display: 'block' }}>Motivo da devolução *</label>
            <textarea rows={3} value={motivoDevolucao} onChange={e => setMotivoDevolucao(e.target.value)} placeholder="Ex: Documento ilegível, RG vencido, foto em ângulo errado..."
              style={{ width: '100%', padding: 10, fontSize: 13, border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 8, fontFamily: 'inherit', resize: 'vertical', outline: 'none', marginBottom: 14, boxSizing: 'border-box' }} />
            <div style={{ background: '#FAEEDA', padding: 10, borderRadius: 6, fontSize: 11, color: '#854F0B', marginBottom: 14 }}>
              ⚠️ Cliente vai voltar pra fila de emissão. Vendedora será notificada e tem 24h pra reabordar.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setDevolvendo(null)} disabled={salvandoDevolucao} style={{ padding: '8px 14px', background: '#f0f0ee', color: '#5F5E5A', border: 'none', borderRadius: 7, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={confirmarDevolucao} disabled={salvandoDevolucao || !motivoDevolucao.trim()}
                style={{ padding: '8px 14px', background: '#A32D2D', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: salvandoDevolucao || !motivoDevolucao.trim() ? 'not-allowed' : 'pointer', opacity: salvandoDevolucao || !motivoDevolucao.trim() ? 0.5 : 1 }}>
                {salvandoDevolucao ? 'Devolvendo...' : 'Confirmar devolução'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ENTREGA PARCIAL */}
      {confirmandoEntrega && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 12, width: '90%', maxWidth: 540 }}>
            <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 6 }}>⚠️ Entrega parcial</div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 14 }}>
              Lote do <strong>{confirmandoEntrega.advogados?.nome_completo}</strong> ainda não está completo.
              <br />
              {(confirmandoEntrega.clientes || []).filter(c => ['em_validacao','validado'].includes(c.status)).length}/{confirmandoEntrega.total_contratos} prontos pra entregar.
            </div>
            <div style={{ background: '#FAEEDA', padding: 12, borderRadius: 8, fontSize: 12, color: '#854F0B', marginBottom: 16 }}>
              <strong>O que fazer com os clientes ainda pendentes?</strong>
              <br/>(em assinatura, expirados, devolvidos)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              <button onClick={() => executarEntrega(confirmandoEntrega, true)} disabled={salvandoEntrega}
                style={{ padding: 12, background: '#A32D2D', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', textAlign: 'left' }}>
                ❌ Cancelar pendentes (advogado fechou o lote, sem mais clientes)
              </button>
              <button onClick={() => executarEntrega(confirmandoEntrega, false)} disabled={salvandoEntrega}
                style={{ padding: 12, background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', textAlign: 'left' }}>
                ⏳ Manter pendentes ativos (advogado aceita receber depois quando completar)
              </button>
            </div>
            <button onClick={() => setConfirmandoEntrega(null)} disabled={salvandoEntrega}
              style={{ width: '100%', padding: '8px 14px', background: '#f0f0ee', color: '#5F5E5A', border: 'none', borderRadius: 7, fontSize: 13, cursor: 'pointer' }}>
              Cancelar
            </button>
            {salvandoEntrega && <div style={{ fontSize: 11, color: '#aaa', marginTop: 8, textAlign: 'center' }}>Processando entrega...</div>}
          </div>
        </div>
      )}
    </div>
  )
}
