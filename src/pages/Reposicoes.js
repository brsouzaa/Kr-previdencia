import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const s = {
  title: { fontSize: 20, fontWeight: 500, color: '#111', marginBottom: 4, letterSpacing: '-0.3px' },
  subtitle: { fontSize: 13, color: '#888', marginBottom: 20 },
  tabs: { display: 'flex', gap: 8, marginBottom: 20, borderBottom: '0.5px solid rgba(0,0,0,0.1)' },
  tab: { padding: '10px 16px', fontSize: 13, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', color: '#888', borderBottom: '2px solid transparent', marginBottom: -1 },
  tabActive: { color: '#185FA5', borderBottomColor: '#185FA5' },
  badge: { fontSize: 11, color: '#fff', padding: '2px 8px', borderRadius: 10, marginLeft: 6, background: '#A32D2D' },
  card: { background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: 10 },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 8 },
  advNome: { fontSize: 15, fontWeight: 500, color: '#111' },
  metaInfo: { fontSize: 12, color: '#888', marginTop: 2 },
  qtd: { fontSize: 22, fontWeight: 500, color: '#854F0B' },
  qtdLabel: { fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.4px' },
  motivoBox: { background: '#FFF8E7', border: '0.5px solid #B7892530', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 13, color: '#555' },
  actions: { display: 'flex', gap: 8 },
  btnAprovar: { flex: 1, padding: '9px', background: '#EAF3DE', color: '#3B6D11', border: '0.5px solid #3B6D11', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  btnNegar: { flex: 1, padding: '9px', background: '#FCEBEB', color: '#A32D2D', border: '0.5px solid #A32D2D', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  empty: { textAlign: 'center', padding: '3rem 1rem', color: '#aaa', fontSize: 13 },
  loading: { textAlign: 'center', padding: '3rem', color: '#888', fontSize: 14 },
  status: { fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 500 },
}

const STATUS_STYLE = {
  pendente: { background: '#FFF8E7', color: '#854F0B' },
  aprovado: { background: '#EAF3DE', color: '#3B6D11' },
  negado: { background: '#FCEBEB', color: '#A32D2D' },
}

function formatData(d) {
  if (!d) return ''
  const dt = new Date(d)
  return dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function Reposicoes() {
  const { profile } = useAuth()
  const [aba, setAba] = useState('pendente')
  const [reposicoes, setReposicoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [acaoEmCurso, setAcaoEmCurso] = useState(null)

  useEffect(() => {
    let cancelado = false
    async function carrega() {
      setLoading(true)
      const { data } = await supabase
        .from('lotes')
        .select('*, advogados(nome_completo, oab, estado), profiles!vendedor_id(nome)')
        .eq('tipo', 'reposicao')
        .eq('status_aprovacao', aba)
        .order('created_at', { ascending: false })

      if (cancelado) return
      setReposicoes(data || [])
      setLoading(false)
    }
    carrega()
    return () => { cancelado = true }
  }, [aba])

  async function aprovar(lote) {
    if (!window.confirm(`Aprovar reposição de ${lote.total_contratos} contrato(s) para ${lote.advogados?.nome_completo}?`)) return
    setAcaoEmCurso(lote.id)
    
    const { error } = await supabase.from('lotes').update({
      status_aprovacao: 'aprovado',
      status_pagamento: 'emitir_contrato',
      aprovado_por: profile.id,
      aprovado_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', lote.id)

    setAcaoEmCurso(null)
    if (error) { alert('Erro: ' + error.message); return }
    
    // Remove da lista atual
    setReposicoes(reposicoes.filter(r => r.id !== lote.id))
  }

  async function negar(lote) {
    const motivo = window.prompt('Motivo da negação (vai aparecer pra vendedora):')
    if (!motivo || motivo.trim() === '') { alert('Negação cancelada — motivo vazio.'); return }
    setAcaoEmCurso(lote.id)
    
    const { error } = await supabase.from('lotes').update({
      status_aprovacao: 'negado',
      aprovado_por: profile.id,
      aprovado_em: new Date().toISOString(),
      motivo_negacao: motivo.trim(),
      updated_at: new Date().toISOString(),
    }).eq('id', lote.id)

    setAcaoEmCurso(null)
    if (error) { alert('Erro: ' + error.message); return }
    
    setReposicoes(reposicoes.filter(r => r.id !== lote.id))
  }

  return (
    <div>
      <div style={s.title}>🔄 Reposições</div>
      <div style={s.subtitle}>Solicitações de reposição feitas pelas vendedoras B2B. Aprovadas viram contratos grátis na fila de entrega.</div>

      <div style={s.tabs}>
        {['pendente', 'aprovado', 'negado'].map(k => (
          <button
            key={k}
            onClick={() => setAba(k)}
            style={{ ...s.tab, ...(aba === k ? s.tabActive : {}) }}
          >
            {k === 'pendente' && '⏳ Pendentes'}
            {k === 'aprovado' && '✓ Aprovadas'}
            {k === 'negado' && '✕ Negadas'}
          </button>
        ))}
      </div>

      {loading && <div style={s.loading}>Carregando...</div>}
      
      {!loading && reposicoes.length === 0 && (
        <div style={s.empty}>
          {aba === 'pendente' && 'Nenhuma reposição pendente.'}
          {aba === 'aprovado' && 'Nenhuma reposição aprovada.'}
          {aba === 'negado' && 'Nenhuma reposição negada.'}
        </div>
      )}

      {!loading && reposicoes.map(lote => (
        <div key={lote.id} style={s.card}>
          <div style={s.cardHeader}>
            <div style={{ flex: 1 }}>
              <div style={s.advNome}>{lote.advogados?.nome_completo || 'Advogado removido'}</div>
              <div style={s.metaInfo}>
                {lote.advogados?.oab} · {lote.advogados?.estado} · Solicitado por {lote.profiles?.nome || 'desconhecido'}
              </div>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                {formatData(lote.created_at)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={s.qtd}>{lote.total_contratos}</div>
              <div style={s.qtdLabel}>contrato{lote.total_contratos !== 1 ? 's' : ''}</div>
            </div>
          </div>

          {lote.motivo_reposicao && (
            <div style={s.motivoBox}>
              <strong style={{ color: '#854F0B' }}>Motivo:</strong> {lote.motivo_reposicao}
            </div>
          )}

          {aba === 'pendente' && (
            <div style={s.actions}>
              <button
                style={s.btnAprovar}
                onClick={() => aprovar(lote)}
                disabled={acaoEmCurso === lote.id}
              >
                {acaoEmCurso === lote.id ? '...' : '✓ Aprovar'}
              </button>
              <button
                style={s.btnNegar}
                onClick={() => negar(lote)}
                disabled={acaoEmCurso === lote.id}
              >
                ✕ Negar
              </button>
            </div>
          )}

          {aba === 'aprovado' && lote.aprovado_em && (
            <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
              ✓ Aprovado em {formatData(lote.aprovado_em)}
            </div>
          )}

          {aba === 'negado' && (
            <div>
              {lote.motivo_negacao && (
                <div style={{ background: '#FCEBEB', border: '0.5px solid #A32D2D30', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#A32D2D', marginTop: 8 }}>
                  <strong>Motivo da negação:</strong> {lote.motivo_negacao}
                </div>
              )}
              {lote.aprovado_em && (
                <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
                  Negado em {formatData(lote.aprovado_em)}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
