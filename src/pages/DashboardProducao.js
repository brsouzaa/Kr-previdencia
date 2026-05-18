import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function DashboardProducao() {
  const [lotes, setLotes] = useState([])
  const [contratos, setContratos] = useState([])
  const [loading, setLoading] = useState(true)
  const [sincronizando, setSincronizando] = useState(false)
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [periodo, setPeriodo] = useState('hoje') // hoje | ontem | semana | mes | mes_passado | custom
  const [customInicio, setCustomInicio] = useState(() => new Date().toISOString().slice(0, 10))
  const [customFim, setCustomFim] = useState(() => new Date().toISOString().slice(0, 10))
  const [meta, setMeta] = useState(null)

  useEffect(() => {
    fetchDados()
    if (!autoRefresh) return
    const interval = setInterval(fetchDados, 30000) // atualiza a cada 30s
    return () => clearInterval(interval)
  }, [autoRefresh])

  async function fetchDados() {
    const agora = new Date()
    const [{ data: l }, { data: c }, { data: m }] = await Promise.all([
      supabase.from('lotes').select('*, advogados(nome_completo, oab, estado)').in('status_pagamento', ['a_entregar', 'entregue']).order('data_limite_entrega', { ascending: true }),
      supabase.from('contratos_producao').select('*, advogados(nome_completo), lotes!lote_id(produto)').order('created_at', { ascending: false }),
      supabase.from('metas').select('*').eq('escopo', 'b2c_geral').eq('ano', agora.getFullYear()).eq('mes', agora.getMonth() + 1).is('vendedor_id', null).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    setLotes(l || [])
    setContratos(c || [])
    setMeta(m || null)
    setUltimaAtualizacao(new Date())
    setLoading(false)
  }

  async function sincronizarAgora() {
    if (sincronizando) return
    setSincronizando(true)
    try {
      const resp = await supabase.functions.invoke('gerar-contratos-zapsign/sincronizar', { body: {} })
      if (resp.error) throw new Error(typeof resp.error === 'string' ? resp.error : JSON.stringify(resp.error))
      const r = resp.data
      alert(`Sincronização concluída!\n\n${r.assinados || 0} contrato(s) marcado(s) como assinado\n${r.expirados || 0} contrato(s) expirado(s) e voltaram à fila com prioridade`)
      await fetchDados()
    } catch (err) {
      alert('Erro ao sincronizar: ' + (err.message || err.toString()))
    }
    setSincronizando(false)
  }

  // === Cálculos das métricas ===
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const fimHoje = new Date(hoje)
  fimHoje.setHours(23, 59, 59, 999)

  const fimSemana = new Date(hoje)
  fimSemana.setDate(fimSemana.getDate() + 7)

  const lotesAtivos = lotes.filter(l => l.status_pagamento === 'a_entregar')

  // Vencendo hoje: lotes com data_limite_entrega = hoje
  const lotesVencendoHoje = lotesAtivos.filter(l => {
    if (!l.data_limite_entrega) return false
    const dl = new Date(l.data_limite_entrega + 'T00:00:00')
    return dl.getTime() === hoje.getTime()
  })
  const contratosVencendoHoje = lotesVencendoHoje.reduce((sum, l) => {
    const restantes = (l.total_contratos || 0) - (l.qtd_emitidos || 0)
    return sum + restantes
  }, 0)

  // Vencendo na semana: próximos 7 dias
  const lotesVencendoSemana = lotesAtivos.filter(l => {
    if (!l.data_limite_entrega) return false
    const dl = new Date(l.data_limite_entrega + 'T00:00:00')
    return dl >= hoje && dl <= fimSemana
  })
  const contratosVencendoSemana = lotesVencendoSemana.reduce((sum, l) => {
    const restantes = (l.total_contratos || 0) - (l.qtd_emitidos || 0)
    return sum + restantes
  }, 0)

  // Atrasados: data_limite_entrega já passou
  const lotesAtrasados = lotesAtivos.filter(l => {
    if (!l.data_limite_entrega) return false
    const dl = new Date(l.data_limite_entrega + 'T00:00:00')
    return dl < hoje
  })
  const contratosAtrasados = lotesAtrasados.reduce((sum, l) => {
    const restantes = (l.total_contratos || 0) - (l.qtd_emitidos || 0)
    return sum + restantes
  }, 0)

  // Hoje
  const emitidosHoje = contratos.filter(c => {
    const d = new Date(c.created_at)
    return d >= hoje && d <= fimHoje
  }).length
  const assinadosHoje = contratos.filter(c => {
    if (!c.data_assinatura) return false
    const d = new Date(c.data_assinatura)
    return d >= hoje && d <= fimHoje
  }).length

  // Esta semana
  const inicioSemana = new Date(hoje)
  inicioSemana.setDate(inicioSemana.getDate() - 7)
  const emitidosSemana = contratos.filter(c => new Date(c.created_at) >= inicioSemana).length
  const assinadosSemana = contratos.filter(c => c.status === 'assinado' && c.data_assinatura && new Date(c.data_assinatura) >= inicioSemana).length

  // Pendentes de emissão (todos os lotes ativos)
  const pendentesEmissao = lotesAtivos.reduce((sum, l) => {
    const restantes = (l.total_contratos || 0) - (l.qtd_emitidos || 0)
    return sum + Math.max(0, restantes)
  }, 0)

  // Em prioridade
  const lotesPrioridade = lotesAtivos.filter(l => l.prioridade_fila)
  const contratosPrioridade = lotesPrioridade.reduce((sum, l) => {
    const restantes = (l.total_contratos || 0) - (l.qtd_emitidos || 0)
    return sum + Math.max(0, restantes)
  }, 0)

  // Expirando em <3h
  const tresHoras = Date.now() + 3 * 3600 * 1000
  const expirandoEm3h = contratos.filter(c => {
    if (c.status !== 'enviado' || !c.data_expiracao) return false
    const exp = new Date(c.data_expiracao).getTime()
    return exp > Date.now() && exp <= tresHoras
  })

  // Taxa de conversão geral
  const totalEmitidos = contratos.filter(c => c.status !== 'expirado').length
  const totalAssinados = contratos.filter(c => c.status === 'assinado').length
  const taxaConversao = totalEmitidos > 0 ? Math.round((totalAssinados / totalEmitidos) * 100) : 0

  // === Período selecionado (filtro top da tela) ===
  function rangePeriodo() {
    const ini = new Date(); ini.setHours(0, 0, 0, 0)
    const fim = new Date(); fim.setHours(23, 59, 59, 999)
    if (periodo === 'hoje') return { ini, fim, label: 'Hoje' }
    if (periodo === 'ontem') {
      const i = new Date(ini); i.setDate(i.getDate() - 1)
      const f = new Date(fim); f.setDate(f.getDate() - 1)
      return { ini: i, fim: f, label: 'Ontem' }
    }
    if (periodo === 'semana') {
      const i = new Date(ini); i.setDate(i.getDate() - i.getDay()) // domingo
      return { ini: i, fim, label: 'Esta semana' }
    }
    if (periodo === 'mes') {
      const i = new Date(ini.getFullYear(), ini.getMonth(), 1)
      return { ini: i, fim, label: 'Este mês' }
    }
    if (periodo === 'mes_passado') {
      const i = new Date(ini.getFullYear(), ini.getMonth() - 1, 1)
      const f = new Date(ini.getFullYear(), ini.getMonth(), 0); f.setHours(23, 59, 59, 999)
      return { ini: i, fim: f, label: 'Mês passado' }
    }
    if (periodo === 'custom') {
      const i = new Date(customInicio + 'T00:00:00')
      const f = new Date(customFim + 'T23:59:59')
      return { ini: i, fim: f, label: `${customInicio} → ${customFim}` }
    }
    return { ini, fim, label: '' }
  }
  const range = rangePeriodo()

  // Emitidos no período + por produto
  const contratosNoPeriodo = contratos.filter(c => {
    const d = new Date(c.created_at)
    return d >= range.ini && d <= range.fim
  })
  const emitidosPeriodo = contratosNoPeriodo.length
  const emitidosMaternidade = contratosNoPeriodo.filter(c => c.lotes?.produto === 'Maternidade').length
  const emitidosBPC = contratosNoPeriodo.filter(c => c.lotes?.produto === 'BPC').length
  const emitidosAux = contratosNoPeriodo.filter(c => c.lotes?.produto === 'Auxilio Acidente').length

  const assinadosPeriodo = contratos.filter(c => {
    if (!c.data_assinatura) return false
    const d = new Date(c.data_assinatura)
    return d >= range.ini && d <= range.fim
  }).length

  const validosPeriodo = contratosNoPeriodo.filter(c => c.status !== 'expirado').length
  const assinadosValidos = contratosNoPeriodo.filter(c => c.status === 'assinado').length
  const taxaAssinaturaPeriodo = validosPeriodo > 0 ? Math.round((assinadosValidos / validosPeriodo) * 100) : 0

  // Meta do mês (sempre referente ao mês atual, mesmo filtro de período sendo diferente)
  // Pra projeção, considera o mês inteiro.
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0); fimMes.setHours(23, 59, 59, 999)
  const emitidosMes = contratos.filter(c => {
    const d = new Date(c.created_at)
    return d >= inicioMes && d <= fimMes
  })
  const emitidosMesTotal = emitidosMes.length
  const emitidosMesMat = emitidosMes.filter(c => c.lotes?.produto === 'Maternidade').length
  const emitidosMesBPC = emitidosMes.filter(c => c.lotes?.produto === 'BPC').length
  const emitidosMesAux = emitidosMes.filter(c => c.lotes?.produto === 'Auxilio Acidente').length

  // Dias úteis restantes no mês (aproximação: dias corridos × 5/7)
  const diasCorridosRestantes = Math.max(1, Math.ceil((fimMes - hoje) / (1000 * 60 * 60 * 24)))
  const diasUteisRestantes = Math.max(1, Math.round(diasCorridosRestantes * 5 / 7))

  const card = { background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: '14px 16px' }

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>Carregando...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 500, color: '#111' }}>📈 Dashboard de Produção</div>
          {ultimaAtualizacao && (
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
              Última atualização: {ultimaAtualizacao.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              {autoRefresh && <span style={{ marginLeft: 8, color: '#3B6D11' }}>● Auto-atualizando a cada 30s</span>}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: '#555', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
            Auto-atualizar
          </label>
          <button
            onClick={fetchDados}
            style={{
              padding: '8px 14px',
              background: '#fff',
              color: '#185FA5',
              border: '1px solid #185FA5',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            ↻ Atualizar
          </button>
          <button
            onClick={sincronizarAgora}
            disabled={sincronizando}
            style={{
              padding: '8px 14px',
              background: sincronizando ? '#aaa' : '#185FA5',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: sincronizando ? 'not-allowed' : 'pointer'
            }}
          >
            {sincronizando ? '⏳ Sincronizando...' : '🔄 Sincronizar ZapSign'}
          </button>
        </div>
      </div>

      {/* === FILTRO DE PERÍODO === */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, fontWeight: 500 }}>📅 Período</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { k: 'hoje', l: 'Hoje' },
            { k: 'ontem', l: 'Ontem' },
            { k: 'semana', l: 'Esta semana' },
            { k: 'mes', l: 'Este mês' },
            { k: 'mes_passado', l: 'Mês passado' },
            { k: 'custom', l: 'Personalizado' },
          ].map(p => (
            <button
              key={p.k}
              onClick={() => setPeriodo(p.k)}
              style={{
                padding: '7px 12px',
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 8,
                border: '0.5px solid rgba(0,0,0,0.15)',
                background: periodo === p.k ? '#111' : '#fff',
                color: periodo === p.k ? '#fff' : '#555',
                cursor: 'pointer',
              }}
            >
              {p.l}
            </button>
          ))}
          {periodo === 'custom' && (
            <span style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 6 }}>
              <input type="date" value={customInicio} onChange={e => setCustomInicio(e.target.value)} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)' }} />
              <span style={{ fontSize: 12, color: '#888' }}>→</span>
              <input type="date" value={customFim} onChange={e => setCustomFim(e.target.value)} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)' }} />
            </span>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 10 }}>
          <div style={card}>
            <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Emitidos · {range.label}</div>
            <div style={{ fontSize: 28, fontWeight: 500, color: '#111' }}>{emitidosPeriodo}</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>Mat {emitidosMaternidade} · BPC {emitidosBPC} · Aux {emitidosAux}</div>
          </div>
          <div style={card}>
            <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Assinados · {range.label}</div>
            <div style={{ fontSize: 28, fontWeight: 500, color: '#3B6D11' }}>{assinadosPeriodo}</div>
          </div>
          <div style={{ ...card, background: taxaAssinaturaPeriodo >= 70 ? '#EAF3DE' : taxaAssinaturaPeriodo >= 40 ? '#FAEEDA' : '#FCEBEB', border: `0.5px solid ${taxaAssinaturaPeriodo >= 70 ? '#3B6D11' : taxaAssinaturaPeriodo >= 40 ? '#854F0B' : '#A32D2D'}30` }}>
            <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Taxa assinatura · {range.label}</div>
            <div style={{ fontSize: 28, fontWeight: 500, color: taxaAssinaturaPeriodo >= 70 ? '#3B6D11' : taxaAssinaturaPeriodo >= 40 ? '#854F0B' : '#A32D2D' }}>{taxaAssinaturaPeriodo}%</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{assinadosValidos} de {validosPeriodo} válidos</div>
          </div>
          <div style={card}>
            <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Pendentes emissão (geral)</div>
            <div style={{ fontSize: 28, fontWeight: 500, color: '#7C3AED' }}>{pendentesEmissao}</div>
          </div>
        </div>
      </div>

      {/* === CARD DE META B2C DO MÊS === */}
      {meta && (
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, fontWeight: 500 }}>🎯 Meta do mês</div>
          <div style={{ ...card, background: '#FFF8E7', border: '0.5px solid #B7892530' }}>
            {(() => {
              const metaTotal = (meta.contratos_maternidade || 0) + (meta.contratos_bpc || 0) + (meta.contratos_aux || 0)
              const pctTotal = metaTotal > 0 ? Math.round((emitidosMesTotal / metaTotal) * 100) : 0
              const ritmo = Math.max(0, Math.ceil((metaTotal - emitidosMesTotal) / diasUteisRestantes))
              const pctMat = meta.contratos_maternidade > 0 ? Math.round((emitidosMesMat / meta.contratos_maternidade) * 100) : 0
              const pctBPC = meta.contratos_bpc > 0 ? Math.round((emitidosMesBPC / meta.contratos_bpc) * 100) : 0
              const pctAux = meta.contratos_aux > 0 ? Math.round((emitidosMesAux / meta.contratos_aux) * 100) : 0
              const corPct = pctTotal >= 90 ? '#3B6D11' : pctTotal >= 50 ? '#854F0B' : '#A32D2D'
              return (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>
                        Total emitido no mês: <span style={{ color: corPct, fontWeight: 600 }}>{emitidosMesTotal.toLocaleString('pt-BR')}</span> / {metaTotal.toLocaleString('pt-BR')} ({pctTotal}%)
                      </div>
                      <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                        Falta {Math.max(0, metaTotal - emitidosMesTotal).toLocaleString('pt-BR')} em ~{diasUteisRestantes} dias úteis · ritmo {ritmo}/dia
                      </div>
                    </div>
                    {meta.taxa_assinatura_pct > 0 && (
                      <div style={{ fontSize: 12, color: '#555' }}>
                        Taxa assinatura: <strong style={{ color: taxaConversao >= meta.taxa_assinatura_pct ? '#3B6D11' : '#A32D2D' }}>{taxaConversao}%</strong> / {meta.taxa_assinatura_pct}%
                      </div>
                    )}
                  </div>
                  {/* Barra geral */}
                  <div style={{ height: 8, background: '#fff', borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
                    <div style={{ height: '100%', width: Math.min(100, pctTotal) + '%', background: corPct, transition: 'width 0.3s' }} />
                  </div>
                  {/* Detalhe por produto */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    <div style={{ background: '#fff', padding: '10px 12px', borderRadius: 8 }}>
                      <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Maternidade</div>
                      <div style={{ fontSize: 18, fontWeight: 500, color: '#111' }}>{emitidosMesMat} / {meta.contratos_maternidade || 0}</div>
                      <div style={{ fontSize: 11, color: pctMat >= 90 ? '#3B6D11' : pctMat >= 50 ? '#854F0B' : '#A32D2D', marginTop: 2 }}>{pctMat}%</div>
                    </div>
                    <div style={{ background: '#fff', padding: '10px 12px', borderRadius: 8 }}>
                      <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>BPC</div>
                      <div style={{ fontSize: 18, fontWeight: 500, color: '#111' }}>{emitidosMesBPC} / {meta.contratos_bpc || 0}</div>
                      <div style={{ fontSize: 11, color: pctBPC >= 90 ? '#3B6D11' : pctBPC >= 50 ? '#854F0B' : '#A32D2D', marginTop: 2 }}>{pctBPC}%</div>
                    </div>
                    <div style={{ background: '#fff', padding: '10px 12px', borderRadius: 8 }}>
                      <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Aux. Acidente</div>
                      <div style={{ fontSize: 18, fontWeight: 500, color: '#111' }}>{emitidosMesAux} / {meta.contratos_aux || 0}</div>
                      <div style={{ fontSize: 11, color: pctAux >= 90 ? '#3B6D11' : pctAux >= 50 ? '#854F0B' : '#A32D2D', marginTop: 2 }}>{pctAux}%</div>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* === ALERTAS CRÍTICOS === */}
      {(lotesAtrasados.length > 0 || expirandoEm3h.length > 0 || lotesVencendoHoje.length > 0) && (
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, fontWeight: 500 }}>⚠️ Atenção urgente</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            {lotesAtrasados.length > 0 && (
              <div style={{ ...card, background: '#FCEBEB', border: '1.5px solid #A32D2D60' }}>
                <div style={{ fontSize: 11, color: '#A32D2D', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4, fontWeight: 600 }}>🚨 ATRASADOS</div>
                <div style={{ fontSize: 32, fontWeight: 600, color: '#A32D2D' }}>{contratosAtrasados}</div>
                <div style={{ fontSize: 11, color: '#A32D2D', marginTop: 4 }}>
                  Em {lotesAtrasados.length} lote{lotesAtrasados.length !== 1 ? 's' : ''} com prazo vencido
                </div>
              </div>
            )}
            {lotesVencendoHoje.length > 0 && (
              <div style={{ ...card, background: '#FAEEDA', border: '1.5px solid #854F0B60' }}>
                <div style={{ fontSize: 11, color: '#854F0B', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4, fontWeight: 600 }}>📅 VENCEM HOJE</div>
                <div style={{ fontSize: 32, fontWeight: 600, color: '#854F0B' }}>{contratosVencendoHoje}</div>
                <div style={{ fontSize: 11, color: '#854F0B', marginTop: 4 }}>
                  Em {lotesVencendoHoje.length} lote{lotesVencendoHoje.length !== 1 ? 's' : ''}
                </div>
              </div>
            )}
            {expirandoEm3h.length > 0 && (
              <div style={{ ...card, background: '#FEF3C7', border: '1.5px solid #F59E0B60' }}>
                <div style={{ fontSize: 11, color: '#854F0B', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4, fontWeight: 600 }}>⏰ EXPIRAM EM &lt; 3H</div>
                <div style={{ fontSize: 32, fontWeight: 600, color: '#854F0B' }}>{expirandoEm3h.length}</div>
                <div style={{ fontSize: 11, color: '#854F0B', marginTop: 4 }}>
                  Contratos pendentes de assinatura
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* === MÉTRICAS PRINCIPAIS === */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, fontWeight: 500 }}>📊 Hoje</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          <div style={{ ...card, background: '#E6F1FB', border: '0.5px solid #185FA530' }}>
            <div style={{ fontSize: 11, color: '#185FA5', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4, opacity: 0.8 }}>Emitidos hoje</div>
            <div style={{ fontSize: 28, fontWeight: 500, color: '#185FA5' }}>{emitidosHoje}</div>
          </div>
          <div style={{ ...card, background: '#EAF3DE', border: '0.5px solid #3B6D1130' }}>
            <div style={{ fontSize: 11, color: '#3B6D11', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4, opacity: 0.8 }}>Assinados hoje</div>
            <div style={{ fontSize: 28, fontWeight: 500, color: '#3B6D11' }}>{assinadosHoje}</div>
          </div>
          <div style={{ ...card, background: '#F3E8FF', border: '0.5px solid #7C3AED30' }}>
            <div style={{ fontSize: 11, color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4, opacity: 0.8 }}>Pendentes p/ emitir</div>
            <div style={{ fontSize: 28, fontWeight: 500, color: '#7C3AED' }}>{pendentesEmissao}</div>
          </div>
          <div style={{ ...card, background: '#FEF3C7', border: '0.5px solid #F59E0B30' }}>
            <div style={{ fontSize: 11, color: '#854F0B', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4, opacity: 0.8 }}>Em prioridade</div>
            <div style={{ fontSize: 28, fontWeight: 500, color: '#854F0B' }}>{contratosPrioridade}</div>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, fontWeight: 500 }}>📅 Esta semana</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          <div style={card}>
            <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Vencem nos próximos 7 dias</div>
            <div style={{ fontSize: 28, fontWeight: 500, color: '#111' }}>{contratosVencendoSemana}</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{lotesVencendoSemana.length} lote{lotesVencendoSemana.length !== 1 ? 's' : ''}</div>
          </div>
          <div style={card}>
            <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Emitidos na semana</div>
            <div style={{ fontSize: 28, fontWeight: 500, color: '#111' }}>{emitidosSemana}</div>
          </div>
          <div style={card}>
            <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Assinados na semana</div>
            <div style={{ fontSize: 28, fontWeight: 500, color: '#111' }}>{assinadosSemana}</div>
          </div>
          <div style={{ ...card, background: taxaConversao >= 70 ? '#EAF3DE' : taxaConversao >= 40 ? '#FAEEDA' : '#FCEBEB', border: `0.5px solid ${taxaConversao >= 70 ? '#3B6D11' : taxaConversao >= 40 ? '#854F0B' : '#A32D2D'}30` }}>
            <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Taxa de assinatura geral</div>
            <div style={{ fontSize: 28, fontWeight: 500, color: taxaConversao >= 70 ? '#3B6D11' : taxaConversao >= 40 ? '#854F0B' : '#A32D2D' }}>{taxaConversao}%</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{totalAssinados} de {totalEmitidos} válidos</div>
          </div>
        </div>
      </div>

      {/* === LISTAS DETALHADAS === */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: '1.25rem' }}>
        {/* Lotes vencendo hoje */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#111', marginBottom: 12 }}>
            📅 Lotes vencendo hoje ({lotesVencendoHoje.length})
          </div>
          {lotesVencendoHoje.length === 0 && <div style={{ color: '#aaa', fontSize: 13 }}>Nenhum lote vence hoje</div>}
          {lotesVencendoHoje.map(l => {
            const restantes = (l.total_contratos || 0) - (l.qtd_emitidos || 0)
            return (
              <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#FAEEDA', borderRadius: 8, marginBottom: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.advogados?.nome_completo}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>OAB/{l.advogados?.estado} {l.advogados?.oab} · Lote: {l.total_contratos} contratos</div>
                </div>
                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: '#854F0B', color: '#fff', flexShrink: 0, marginLeft: 8 }}>
                  {restantes} restante{restantes !== 1 ? 's' : ''}
                </span>
              </div>
            )
          })}
        </div>

        {/* Lotes em prioridade */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#111', marginBottom: 12 }}>
            ⚡ Lotes em prioridade ({lotesPrioridade.length})
          </div>
          {lotesPrioridade.length === 0 && <div style={{ color: '#aaa', fontSize: 13 }}>Nenhum lote em prioridade</div>}
          {lotesPrioridade.map(l => {
            const restantes = (l.total_contratos || 0) - (l.qtd_emitidos || 0)
            return (
              <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#FEF3C7', borderRadius: 8, marginBottom: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.advogados?.nome_completo}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>Prioridade desde {l.data_prioridade ? new Date(l.data_prioridade).toLocaleDateString('pt-BR') : '-'}</div>
                </div>
                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: '#F59E0B', color: '#fff', flexShrink: 0, marginLeft: 8 }}>
                  {restantes} reemitir
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Expirando em <3h */}
      {expirandoEm3h.length > 0 && (
        <div style={{ ...card, marginBottom: '1.25rem', background: '#FEF3C7', border: '0.5px solid #F59E0B40' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#854F0B', marginBottom: 10 }}>
            ⏰ Contratos expirando em menos de 3 horas — entrar em contato com o cliente!
          </div>
          {expirandoEm3h.map(c => {
            const horasRestantes = Math.max(0, (new Date(c.data_expiracao).getTime() - Date.now()) / 3600000)
            return (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#fff', borderRadius: 8, marginBottom: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{c.cliente_nome}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>📞 {c.cliente_telefone} · Adv: {c.advogados?.nome_completo}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: '#F59E0B', color: '#fff' }}>
                    {horasRestantes < 1 ? `${Math.round(horasRestantes * 60)}min` : `${horasRestantes.toFixed(1)}h`}
                  </span>
                  {c.cliente_telefone && (
                    <a
                      href={`https://wa.me/55${c.cliente_telefone.replace(/\D/g,'')}?text=${encodeURIComponent('Olá! Lembrete: seus documentos para assinatura estão prestes a expirar. Por favor, acesse: ' + c.link_assinatura)}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ padding: '4px 10px', background: '#25D366', color: '#fff', textDecoration: 'none', borderRadius: 6, fontSize: 11, fontWeight: 500 }}
                    >
                      WhatsApp
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Atrasados (lotes com prazo vencido) */}
      {lotesAtrasados.length > 0 && (
        <div style={{ ...card, background: '#FCEBEB', border: '0.5px solid #A32D2D40' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#A32D2D', marginBottom: 10 }}>
            🚨 Lotes com prazo vencido — atenção urgente
          </div>
          {lotesAtrasados.map(l => {
            const restantes = (l.total_contratos || 0) - (l.qtd_emitidos || 0)
            const diasAtraso = Math.floor((hoje - new Date(l.data_limite_entrega + 'T00:00:00')) / (24 * 3600000))
            return (
              <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#fff', borderRadius: 8, marginBottom: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{l.advogados?.nome_completo}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>Atrasado há {diasAtraso} dia{diasAtraso !== 1 ? 's' : ''} · Prazo era {new Date(l.data_limite_entrega + 'T00:00:00').toLocaleDateString('pt-BR')}</div>
                </div>
                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: '#A32D2D', color: '#fff', flexShrink: 0, marginLeft: 8 }}>
                  {restantes} restante{restantes !== 1 ? 's' : ''}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
