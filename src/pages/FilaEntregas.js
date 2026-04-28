import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function diasRestantes(dataLimite) {
  if (!dataLimite) return null
  return Math.ceil((new Date(dataLimite + 'T23:59:59') - new Date()) / 86400000)
}

function diasDesde(data) {
  return Math.floor((Date.now() - new Date(data)) / 86400000)
}

function urgencia(restam) {
  if (restam === null) return { bg: '#fff', border: 'rgba(0,0,0,0.1)', badgeBg: '#f0f0ee', badgeColor: '#888' }
  if (restam <= 0) return { bg: '#FCEBEB', border: '#A32D2D50', badgeBg: '#A32D2D', badgeColor: '#fff' }
  if (restam <= 2) return { bg: '#FAEEDA', border: '#854F0B50', badgeBg: '#854F0B', badgeColor: '#fff' }
  return { bg: '#EAF3DE', border: '#3B6D1150', badgeBg: '#3B6D11', badgeColor: '#fff' }
}

export default function FilaEntregas() {
  const [lotes, setLotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState({})

  useEffect(() => { fetchFila() }, [])

  async function fetchFila() {
    setLoading(true)
    const { data } = await supabase
      .from('lotes')
      .select('*, advogados(nome_completo, oab, cidade, estado, telefone, email), profiles(nome)')
      .eq('status_pagamento', 'a_entregar')
      .order('data_compra', { ascending: true })
    setLotes(data || [])
    setLoading(false)
  }

  function atualizar(loteId, campos) {
    setLotes(ls => ls.map(l => l.id === loteId ? { ...l, ...campos } : l))
  }

  async function salvar(loteId, campos) {
    setSalvando(s => ({ ...s, [loteId]: true }))
    await supabase.from('lotes').update({ ...campos, updated_at: new Date().toISOString() }).eq('id', loteId)
    setTimeout(() => setSalvando(s => ({ ...s, [loteId]: false })), 500)
  }

  async function marcarEntregue(lote) {
    if (!window.confirm('Marcar lote de ' + lote.advogados?.nome_completo + ' como entregue?')) return
    await supabase.from('lotes').update({
      status_pagamento: 'entregue',
      data_entrega: new Date().toISOString().slice(0, 10),
      qtd_entregues: lote.total_contratos,
      updated_at: new Date().toISOString(),
    }).eq('id', lote.id)
    fetchFila()
  }

  const totalContratos = lotes.reduce((s, l) => s + l.total_contratos, 0)
  const totalEntregues = lotes.reduce((s, l) => s + (l.qtd_entregues || 0), 0)
  const vencendoHoje = lotes.filter(l => { const r = diasRestantes(l.data_limite_entrega); return r !== null && r <= 1 }).length

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>Carregando fila...</div>

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: 20, fontWeight: 500, color: '#111', marginBottom: 4 }}>📦 Fila de entregas</div>
        <div style={{ fontSize: 13, color: '#888' }}>Ordem de chegada · {lotes.length} pedido{lotes.length !== 1 ? 's' : ''} na fila</div>
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
        const faltamEntregar = lote.total_contratos - entregues
        const progresso = lote.total_contratos > 0 ? Math.round((entregues / lote.total_contratos) * 100) : 0

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
                <span style={{ color: '#555', fontWeight: 500 }}>Progresso de entrega</span>
                <span style={{ color: progresso === 100 ? '#3B6D11' : '#185FA5', fontWeight: 500 }}>{entregues}/{lote.total_contratos} · {progresso}%</span>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.1)', borderRadius: 6, height: 10, overflow: 'hidden' }}>
                <div style={{ width: `${progresso}%`, height: '100%', background: progresso === 100 ? '#3B6D11' : '#185FA5', borderRadius: 6, transition: 'width 0.4s' }} />
              </div>
            </div>

            {/* Contadores */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
              {[
                ['Total pedido', lote.total_contratos, '#111', '#f8f8f6'],
                ['Já entregues', entregues, entregues > 0 ? '#3B6D11' : '#888', entregues > 0 ? '#EAF3DE' : '#f8f8f6'],
                ['Faltam entregar', faltamEntregar, faltamEntregar > 0 ? '#185FA5' : '#3B6D11', faltamEntregar > 0 ? '#E6F1FB' : '#EAF3DE'],
              ].map(([l, v, c, bg]) => (
                <div key={l} style={{ background: bg, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: c, opacity: 0.75, marginBottom: 2 }}>{l}</div>
                  <div style={{ fontSize: 18, fontWeight: 500, color: c }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Campo aprovados */}
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Aprovados / entregues</label>
              <input type="number" min="0" max={lote.total_contratos} value={entregues}
                onChange={e => atualizar(lote.id, { qtd_entregues: Math.min(parseInt(e.target.value)||0, lote.total_contratos) })}
                onBlur={e => salvar(lote.id, { qtd_entregues: Math.min(parseInt(e.target.value)||0, lote.total_contratos) })}
                style={{ width: '100%', padding: '9px 10px', fontSize: 15, fontWeight: 500, border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 8, outline: 'none', boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Link da entrega</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="url" value={lote.link_entrega || ''} placeholder="https://..."
                  onChange={e => atualizar(lote.id, { link_entrega: e.target.value })}
                  onBlur={e => salvar(lote.id, { link_entrega: e.target.value })}
                  style={{ flex: 1, padding: '9px 10px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 8, outline: 'none' }} />
                {lote.link_entrega && (
                  <a href={lote.link_entrega} target="_blank" rel="noreferrer"
                    style={{ padding: '9px 12px', background: '#E6F1FB', color: '#185FA5', border: '0.5px solid #185FA5', borderRadius: 8, fontSize: 12, textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
                    🔗 Ver
                  </a>
                )}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Observação</label>
              <textarea rows={2} value={lote.observacao_entrega || ''} placeholder="Ex: 3 reenviados em 27/04, aguardando assinatura..."
                onChange={e => atualizar(lote.id, { observacao_entrega: e.target.value })}
                onBlur={e => salvar(lote.id, { observacao_entrega: e.target.value })}
                style={{ width: '100%', padding: '9px 10px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 8, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              {lote.link_entrega && (
                <a href={`https://wa.me/55${(lote.advogados?.telefone||'').replace(/\D/g,'')}?text=${encodeURIComponent('Olá! Seus contratos estão prontos. Acesse: ' + lote.link_entrega)}`}
                  target="_blank" rel="noreferrer"
                  style={{ flex: 1, padding: '10px', background: '#EAF3DE', color: '#3B6D11', border: '0.5px solid #3B6D11', borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: 'none', textAlign: 'center' }}>
                  💬 Enviar por WhatsApp
                </a>
              )}
              <button onClick={() => marcarEntregue(lote)}
                style={{ flex: 1, padding: '10px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                ✓ Marcar como entregue
              </button>
            </div>
            {salvando[lote.id] && <div style={{ fontSize: 11, color: '#aaa', marginTop: 6, textAlign: 'right' }}>Salvando...</div>}
          </div>
        )
      })}
    </div>
  )
}
