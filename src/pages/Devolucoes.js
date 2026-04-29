import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const TIPOS_DOC = [
  { chave: 'rg_frente', label: 'RG Frente' },
  { chave: 'rg_verso', label: 'RG Verso' },
  { chave: 'comprovante_1', label: 'Comprovante 1' },
  { chave: 'comprovante_2', label: 'Comprovante 2' },
  { chave: 'comprovante_endereco', label: 'Comp. endereço' },
]

const s = {
  card: { background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 14, padding: '1rem', marginBottom: 10 },
  cardUrgente: { background: '#fff', border: '1.5px solid #A32D2D', borderRadius: 14, padding: '1rem', marginBottom: 10, boxShadow: '0 0 0 4px rgba(163,45,45,0.06)' },
  metricCard: { background: '#fff', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: 14, textAlign: 'center' },
  filtroChip: (ativo, cor, bg) => ({
    padding: '6px 12px', fontSize: 12, borderRadius: 16,
    background: ativo ? cor : bg, color: ativo ? '#fff' : cor,
    border: `1px solid ${cor}40`, cursor: 'pointer', fontWeight: 500,
  }),
  badge: (cor, bg) => ({ display: 'inline-block', padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 500, color: cor, background: bg }),
}

function tempoRelativo(dt) {
  if (!dt) return ''
  const ms = Date.now() - new Date(dt).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  return `há ${d}d`
}

function diasParado(dt) {
  if (!dt) return 0
  const ms = Date.now() - new Date(dt).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

export default function Devolucoes() {
  const { profile } = useAuth()
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [filtroVendedor, setFiltroVendedor] = useState('todos')
  const [busca, setBusca] = useState('')
  const [verDocsId, setVerDocsId] = useState(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('clientes')
      .select(`
        *,
        vendedor:profiles!clientes_vendedor_operador_id_fkey(id, nome, email),
        analista:profiles!clientes_devolvido_por_fkey(nome),
        lote:lotes(id, vendedor_id, advogados(nome_completo))
      `)
      .in('status', ['devolvido_correcao_doc', 'devolvido_reemissao'])
      .order('devolvido_em', { ascending: false })

    // Filtrar conforme role
    if (profile?.role === 'vendedor_operador') {
      // Vendedor-operador vê só clientes que ele cadastrou
      q = q.eq('vendedor_operador_id', profile.id)
    }
    // vendedor de advogado é filtrado no client-side abaixo (precisa do JOIN lote.vendedor_id)

    const { data } = await q

    let resultado = data || []

    // Filtra vendedor de advogado
    if (profile?.role === 'vendedor') {
      resultado = resultado.filter(c => c.lote?.vendedor_id === profile.id)
    }

    setClientes(resultado)
    setLoading(false)
  }, [profile])

  useEffect(() => { fetch() }, [fetch])
  useEffect(() => {
    const id = setInterval(fetch, 60000)
    return () => clearInterval(id)
  }, [fetch])

  // Lista única de vendedoras pra filtro
  const vendedoras = [...new Map(clientes.filter(c => c.vendedor).map(c => [c.vendedor.id, c.vendedor])).values()]
    .sort((a,b) => a.nome.localeCompare(b.nome))

  const filtrados = clientes.filter(c => {
    if (filtroTipo === 'correcao_doc' && c.status !== 'devolvido_correcao_doc') return false
    if (filtroTipo === 'reemissao' && c.status !== 'devolvido_reemissao') return false
    if (filtroVendedor !== 'todos' && c.vendedor_operador_id !== filtroVendedor) return false
    if (busca) {
      const b = busca.toLowerCase()
      return c.nome.toLowerCase().includes(b) || c.cpf.includes(b) || (c.vendedor?.nome || '').toLowerCase().includes(b)
    }
    return true
  })

  const totais = {
    todos: clientes.length,
    correcao_doc: clientes.filter(c => c.status === 'devolvido_correcao_doc').length,
    reemissao: clientes.filter(c => c.status === 'devolvido_reemissao').length,
    parados3dias: clientes.filter(c => diasParado(c.devolvido_em) >= 3).length,
  }

  // Top 3 vendedoras com mais devoluções (insight de qualidade)
  const porVendedora = {}
  clientes.forEach(c => {
    if (!c.vendedor_operador_id) return
    if (!porVendedora[c.vendedor_operador_id]) {
      porVendedora[c.vendedor_operador_id] = { nome: c.vendedor?.nome || '?', count: 0 }
    }
    porVendedora[c.vendedor_operador_id].count++
  })
  const top3 = Object.entries(porVendedora).sort((a,b) => b[1].count - a[1].count).slice(0, 3)

  function whatsappCobrar(c) {
    if (!c.vendedor) return ''
    // Não temos telefone do vendedor. Vai mandar só uma mensagem de modelo pra copiar.
    const msg = `Oi ${c.vendedor.nome.split(' ')[0]}! Você tem 1 cliente devolvido pra correção:\n\n` +
      `Cliente: ${c.nome}\n` +
      `Motivo: ${c.motivo_devolucao || '—'}\n\n` +
      `${c.status === 'devolvido_correcao_doc'
        ? 'Edita os documentos no sistema e clica em "Marcar corrigido" pra recuperar o bônus.'
        : 'Precisa reiniciar o fluxo (clica em "Reiniciar fluxo" no card). Cliente vai assinar de novo.'}`
    return msg
  }

  function copiarCobranca(c) {
    const msg = whatsappCobrar(c)
    navigator.clipboard.writeText(msg)
    alert('Mensagem copiada! Cole no WhatsApp da ' + (c.vendedor?.nome || 'vendedora'))
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>Carregando...</div>

  return (
    <div>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 500, color: '#111', marginBottom: 4 }}>
            ⚠️ {profile?.role === 'vendedor_operador' ? 'Meus devolvidos' :
                 profile?.role === 'vendedor' ? 'Devoluções dos meus lotes' :
                 'Devoluções'}
          </div>
          <div style={{ fontSize: 13, color: '#888' }}>
            {profile?.role === 'vendedor_operador'
              ? `${clientes.length} cliente${clientes.length !== 1 ? 's' : ''} pra você corrigir`
              : profile?.role === 'vendedor'
                ? `${clientes.length} cliente${clientes.length !== 1 ? 's' : ''} de lotes seus em correção`
                : `${clientes.length} cliente${clientes.length !== 1 ? 's' : ''} aguardando correção pelo vendedor`}
          </div>
        </div>
        <button onClick={fetch} style={{ padding: '8px 14px', fontSize: 13, background: '#fff', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 8, cursor: 'pointer', color: '#555' }}>
          ↻ Atualizar
        </button>
      </div>

      {/* === MÉTRICAS === */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
        <div style={s.metricCard}>
          <div style={{ fontSize: 11, color: '#854F0B', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Correção doc</div>
          <div style={{ fontSize: 26, fontWeight: 500, color: '#854F0B' }}>{totais.correcao_doc}</div>
        </div>
        <div style={s.metricCard}>
          <div style={{ fontSize: 11, color: '#A32D2D', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Reemissão</div>
          <div style={{ fontSize: 26, fontWeight: 500, color: '#A32D2D' }}>{totais.reemissao}</div>
        </div>
        <div style={s.metricCard}>
          <div style={{ fontSize: 11, color: '#A32D2D', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>🚨 Parados 3+ dias</div>
          <div style={{ fontSize: 26, fontWeight: 500, color: totais.parados3dias > 0 ? '#A32D2D' : '#aaa' }}>{totais.parados3dias}</div>
        </div>
        <div style={s.metricCard}>
          <div style={{ fontSize: 11, color: '#185FA5', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Total devoluções</div>
          <div style={{ fontSize: 26, fontWeight: 500, color: '#185FA5' }}>{totais.todos}</div>
        </div>
      </div>

      {/* === TOP 3 VENDEDORAS COM MAIS DEVOLUÇÕES === */}
      {top3.length > 0 && top3[0][1].count > 1 && (
        <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 14, padding: '1rem', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#111', marginBottom: 10 }}>🎯 Vendedoras com mais devoluções pendentes</div>
          {top3.map(([id, info]) => (
            <div key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: '0.5px solid rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: 13, color: '#555' }}>{info.nome}</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: info.count >= 3 ? '#A32D2D' : '#854F0B' }}>
                {info.count} devolução{info.count !== 1 ? 'ões' : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* === BUSCA E FILTROS === */}
      <input style={{ width: '100%', padding: '10px 12px', fontSize: 14, border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 8, background: '#fff', outline: 'none', boxSizing: 'border-box', marginBottom: 12 }}
        placeholder="🔍 Buscar por cliente, CPF ou vendedora..."
        value={busca} onChange={e => setBusca(e.target.value)} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <button style={s.filtroChip(filtroTipo === 'todos', '#185FA5', '#E6F1FB')} onClick={() => setFiltroTipo('todos')}>
          Todos · {totais.todos}
        </button>
        <button style={s.filtroChip(filtroTipo === 'correcao_doc', '#854F0B', '#FAEEDA')} onClick={() => setFiltroTipo('correcao_doc')}>
          🔁 Correção doc · {totais.correcao_doc}
        </button>
        <button style={s.filtroChip(filtroTipo === 'reemissao', '#A32D2D', '#FCEBEB')} onClick={() => setFiltroTipo('reemissao')}>
          🔄 Reemissão · {totais.reemissao}
        </button>
      </div>

      {vendedoras.length > 1 && (
        <div style={{ marginBottom: 16 }}>
          <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}
            style={{ padding: '8px 12px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 8, background: '#fff', cursor: 'pointer' }}>
            <option value="todos">Todas as vendedoras ({clientes.length})</option>
            {vendedoras.map(v => {
              const count = clientes.filter(c => c.vendedor_operador_id === v.id).length
              return <option key={v.id} value={v.id}>{v.nome} ({count})</option>
            })}
          </select>
        </div>
      )}

      {/* === LISTA === */}
      {filtrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#888', background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.06)' }}>
          ✅ {clientes.length === 0 ? 'Nenhuma devolução pendente.' : 'Nenhum resultado com esses filtros.'}
        </div>
      ) : filtrados.map(c => {
        const docs = c.documentos || {}
        const verDocs = verDocsId === c.id
        const dias = diasParado(c.devolvido_em)
        const urgente = dias >= 3
        const ehReemissao = c.status === 'devolvido_reemissao'

        return (
          <div key={c.id} style={urgente ? s.cardUrgente : s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#111' }}>{c.nome}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                  {c.cpf} · {c.telefone} · {c.cidade}/{c.uf}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={s.badge(
                  ehReemissao ? '#A32D2D' : '#854F0B',
                  ehReemissao ? '#FCEBEB' : '#FAEEDA'
                )}>
                  {ehReemissao ? '🔄 Reemissão' : '🔁 Correção doc'}
                </span>
                {urgente && (
                  <span style={s.badge('#A32D2D', '#FCEBEB')}>🚨 {dias} dias parado</span>
                )}
              </div>
            </div>

            <div style={{ background: '#FCEBEB', borderRadius: 6, padding: 10, marginBottom: 8, fontSize: 12, color: '#A32D2D' }}>
              <div style={{ fontWeight: 500, marginBottom: 2 }}>💬 Motivo:</div>
              "{c.motivo_devolucao || '— sem motivo registrado —'}"
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 11, color: '#888', marginBottom: 8 }}>
              <span><strong>Vendedora:</strong> {c.vendedor?.nome || '—'}</span>
              <span><strong>Devolvido por:</strong> {c.analista?.nome || '—'}</span>
              <span><strong>Quando:</strong> {tempoRelativo(c.devolvido_em)}</span>
              <span><strong>Produto:</strong> {c.produto === 'Auxilio Acidente' ? 'Auxílio Acidente' : c.produto}</span>
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

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => copiarCobranca(c)}
                style={{ padding: '8px 14px', background: '#fff', color: '#185FA5', border: '0.5px solid #185FA540', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                💬 Copiar cobrança pra WhatsApp
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
