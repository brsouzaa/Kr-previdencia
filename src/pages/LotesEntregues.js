import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const s = {
  card: { background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 14, padding: '1rem', marginBottom: 10 },
  cardNovo: { background: '#fff', border: '1.5px solid #3B6D11', borderRadius: 14, padding: '1rem', marginBottom: 10, boxShadow: '0 0 0 4px rgba(59,109,17,0.08)' },
  badge: (cor, bg) => ({ display: 'inline-block', padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 500, color: cor, background: bg }),
}

function fmtData(d) {
  if (!d) return ''
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function LotesEntregues() {
  const { profile } = useAuth()
  const [lotes, setLotes] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('lotes')
      .select('*, advogados(nome_completo, oab, estado, telefone, email), profiles(id, nome)')
      .or('data_primeira_entrega.not.is.null,status_pagamento.eq.entregue')
      .order('data_primeira_entrega', { ascending: false, nullsFirst: false })

    // Vendedor vê só os lotes dele. Admin vê todos.
    if (profile?.role === 'vendedor') {
      q = q.eq('vendedor_id', profile.id)
    }

    const { data } = await q
    setLotes(data || [])
    setLoading(false)
  }, [profile])

  useEffect(() => { fetch() }, [fetch])
  useEffect(() => {
    const id = setInterval(fetch, 60000)
    return () => clearInterval(id)
  }, [fetch])

  // Marca a notificação como vista
  async function marcarVisto(lote) {
    if (!lote.notificacao_pendente) return
    await supabase.from('lotes').update({ notificacao_pendente: false }).eq('id', lote.id)
    fetch()
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>Carregando...</div>

  const novos = lotes.filter(l => l.notificacao_pendente)
  const antigos = lotes.filter(l => !l.notificacao_pendente)

  return (
    <div>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 500, color: '#111', marginBottom: 4 }}>📦 Lotes liberados</div>
          <div style={{ fontSize: 13, color: '#888' }}>
            {lotes.length} lote{lotes.length !== 1 ? 's' : ''} já liberado{lotes.length !== 1 ? 's' : ''} pra entrega
            {novos.length > 0 && <span style={{ marginLeft: 8, color: '#3B6D11', fontWeight: 500 }}>· {novos.length} nov{novos.length !== 1 ? 'os' : 'o'}</span>}
          </div>
        </div>
        <button onClick={fetch} style={{ padding: '8px 14px', fontSize: 13, background: '#fff', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 8, cursor: 'pointer', color: '#555' }}>
          ↻ Atualizar
        </button>
      </div>

      {lotes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#888', background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.06)' }}>
          📭 Nenhum lote liberado ainda.
          <div style={{ fontSize: 12, marginTop: 8 }}>
            Quando a Sthefany validar e liberar lotes seus, eles aparecem aqui.
          </div>
        </div>
      ) : (
        <>
          {novos.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: '#3B6D11', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500, marginBottom: 8 }}>🆕 Novos — confira</div>
              {novos.map(l => {
                const totalLote = l.total_contratos || 0
                const validados = l.qtd_validados || 0
                const restantes = totalLote - validados
                const eParcial = restantes > 0
                return (
                  <div key={l.id} style={s.cardNovo} onClick={() => marcarVisto(l)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 500, color: '#111' }}>⚖️ {l.advogados?.nome_completo}</div>
                        <div style={{ fontSize: 12, color: '#666' }}>OAB/{l.advogados?.estado} {l.advogados?.oab}</div>
                      </div>
                      {eParcial ? (
                        <span style={s.badge('#854F0B', '#FAEEDA')}>📦 Entrega parcial</span>
                      ) : (
                        <span style={s.badge('#3B6D11', '#EAF3DE')}>✅ Lote completo</span>
                      )}
                    </div>

                    <div style={{ background: '#f8f8f6', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                      <div style={{ fontSize: 12, color: '#555' }}>
                        <strong>{validados}</strong> de <strong>{totalLote}</strong> contratos liberados pra entrega
                      </div>
                      {eParcial && (
                        <div style={{ fontSize: 11, color: '#854F0B', marginTop: 4 }}>
                          ⚠️ {restantes} ainda em correção/validação — você pode entregar essa parte agora e o complemento depois
                        </div>
                      )}
                    </div>

                    <div style={{ fontSize: 11, color: '#888' }}>
                      Liberado: {fmtData(l.data_primeira_entrega)}
                      {l.advogados?.telefone && ` · 📞 ${l.advogados.telefone}`}
                    </div>
                  </div>
                )
              })}
            </>
          )}

          {antigos.length > 0 && novos.length > 0 && (
            <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500, marginTop: 24, marginBottom: 8 }}>Histórico</div>
          )}

          {antigos.map(l => {
            const totalLote = l.total_contratos || 0
            const validados = l.qtd_validados || 0
            const eCompleto = l.status_pagamento === 'entregue' && validados >= totalLote
            return (
              <div key={l.id} style={s.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#111' }}>⚖️ {l.advogados?.nome_completo}</div>
                    <div style={{ fontSize: 11, color: '#666' }}>OAB/{l.advogados?.estado} {l.advogados?.oab}</div>
                  </div>
                  <span style={s.badge(eCompleto ? '#3B6D11' : '#854F0B', eCompleto ? '#EAF3DE' : '#FAEEDA')}>
                    {validados}/{totalLote}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#888' }}>
                  Liberado: {fmtData(l.data_primeira_entrega)}
                  {l.data_entrega_total && ` · Concluído: ${fmtData(l.data_entrega_total)}`}
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
