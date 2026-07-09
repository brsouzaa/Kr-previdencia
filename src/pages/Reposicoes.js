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
  // --- Painel do topo ---
  painel: { background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: 16 },
  filtros: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 },
  fBtn: { padding: '5px 12px', fontSize: 12, fontWeight: 500, borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', background: '#fff', color: '#666', cursor: 'pointer' },
  fBtnOn: { background: '#185FA5', color: '#fff', borderColor: '#185FA5' },
  dateInput: { padding: '4px 8px', fontSize: 12, borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', color: '#333' },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 },
  kpi: { border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '10px 12px' },
  kpiTop: { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 500, marginBottom: 6 },
  kpiNum: { fontSize: 24, fontWeight: 500, lineHeight: 1 },
  kpiSub: { fontSize: 11, color: '#888', marginTop: 4 },
  reguaBox: { borderRadius: 10, padding: '12px 14px', border: '0.5px solid' },
  barraBg: { height: 8, background: 'rgba(0,0,0,0.06)', borderRadius: 99, overflow: 'hidden', marginTop: 8, position: 'relative' },
  barraFill: { height: '100%', borderRadius: 99, transition: 'width .3s' },
  marca: { position: 'absolute', top: -3, width: 1.5, height: 14, background: 'rgba(0,0,0,0.35)' },
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

  // --- Painel do topo: período + resumo por status + régua de saúde ---
  const [periodo, setPeriodo] = useState('mes') // dia | semana | mes | custom
  const [dtIni, setDtIni] = useState('')
  const [dtFim, setDtFim] = useState('')
  const [resumo, setResumo] = useState(null)   // { pendente:{...}, aprovado:{...}, negado:{...} }
  const [regua, setRegua] = useState(null)     // { clientes_fechados, repostos_aprovados, pct, teto_alerta, teto_bloqueio, situacao }
  const [loadingPainel, setLoadingPainel] = useState(true)
  const [refreshPainel, setRefreshPainel] = useState(0)

  // Calcula o intervalo [inicio, fim) da janela escolhida
  function intervalo() {
    const agora = new Date()
    if (periodo === 'dia') {
      const i = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
      const f = new Date(i); f.setDate(f.getDate() + 1)
      return [i, f]
    }
    if (periodo === 'semana') {
      const diaSem = agora.getDay() // 0=dom
      const i = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - diaSem)
      const f = new Date(i); f.setDate(f.getDate() + 7)
      return [i, f]
    }
    if (periodo === 'custom' && dtIni && dtFim) {
      const i = new Date(dtIni + 'T00:00:00')
      const f = new Date(dtFim + 'T00:00:00'); f.setDate(f.getDate() + 1) // fim inclusivo
      return [i, f]
    }
    // mes (default)
    const i = new Date(agora.getFullYear(), agora.getMonth(), 1)
    const f = new Date(agora.getFullYear(), agora.getMonth() + 1, 1)
    return [i, f]
  }

  useEffect(() => {
    let cancelado = false
    async function carregaPainel() {
      if (periodo === 'custom' && (!dtIni || !dtFim)) return
      setLoadingPainel(true)
      const [ini, fim] = intervalo()
      const pIni = ini.toISOString()
      const pFim = fim.toISOString()

      const [{ data: resArr }, { data: regArr }] = await Promise.all([
        supabase.rpc('reposicao_resumo_periodo', { p_inicio: pIni, p_fim: pFim }),
        supabase.rpc('pct_reposicao_periodo', { p_inicio: pIni, p_fim: pFim, p_repostos_extra: 0 }),
      ])
      if (cancelado) return

      const mapa = { pendente: null, aprovado: null, negado: null }
      for (const r of (resArr || [])) mapa[r.status] = r
      setResumo(mapa)
      setRegua(Array.isArray(regArr) ? regArr[0] : regArr)
      setLoadingPainel(false)
    }
    carregaPainel()
    return () => { cancelado = true }
  }, [periodo, dtIni, dtFim, refreshPainel])

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

      const lotesArr = data || []
      // Clientes vinculados a cada reposição (quem será / foi cancelado)
      const ids = lotesArr.map(l => l.id)
      const porLote = {}
      if (ids.length) {
        const { data: cls } = await supabase
          .from('clientes')
          .select('id, nome, cpf, status, reposto_por_lote_id')
          .in('reposto_por_lote_id', ids)
        for (const c of (cls || [])) {
          (porLote[c.reposto_por_lote_id] = porLote[c.reposto_por_lote_id] || []).push(c)
        }
      }
      const comClientes = lotesArr.map(l => ({ ...l, clientes_repostos: porLote[l.id] || [] }))

      if (cancelado) return
      setReposicoes(comClientes)
      setLoading(false)
    }
    carrega()
    return () => { cancelado = true }
  }, [aba])

  async function aprovar(lote) {
    setAcaoEmCurso(lote.id)
    // Régua de reposição: checa se aprovar este lote estoura o teto (15% alerta, 20% bloqueio)
    // sobre clientes fechados do mês. Dado vivo via função no banco (não contador).
    const agoraCheck = new Date()
    const { data: reguaArr } = await supabase.rpc('pct_reposicao_mes', {
      p_ano: agoraCheck.getFullYear(),
      p_mes: agoraCheck.getMonth() + 1,
      p_repostos_extra: Number(lote.total_contratos || 0),
    })
    const regua = Array.isArray(reguaArr) ? reguaArr[0] : reguaArr
    if (regua && regua.situacao === 'bloqueio') {
      setAcaoEmCurso(null)
      alert(
        `🚫 BLOQUEADO — teto de reposição estourado.\n\n` +
        `Aprovar esta reposição levaria o mês a ${regua.pct}% de reposição ` +
        `(${regua.repostos_simulado} repostos sobre ${regua.clientes_fechados} clientes fechados).\n\n` +
        `O limite é 20%. Acima disso o sistema não aprova — reposição alta come margem e indica problema na entrega.\n\n` +
        `Teto de bloqueio neste mês: ${regua.teto_bloqueio} reposições.`
      )
      return
    }
    let avisoAlerta = ''
    if (regua && regua.situacao === 'alerta') {
      avisoAlerta = `\n\n⚠️ ATENÇÃO: isto leva o mês a ${regua.pct}% de reposição (alerta a partir de 15%, bloqueio em 20%). Teto de bloqueio: ${regua.teto_bloqueio}.`
    }
    const repostos = lote.clientes_repostos || []
    const listaCancelar = repostos.length
      ? `\n\n🚫 Será(ão) CANCELADO(S) ${repostos.length} cliente(s) reposto(s):\n` + repostos.map(c => `• ${c.nome} (${c.cpf})`).join('\n')
      : '\n\n(Sem cliente vinculado — nada será cancelado.)'
    if (!window.confirm(`Aprovar reposição de ${lote.total_contratos} contrato(s) para ${lote.advogados?.nome_completo}?\n\n⚠️ Vai entrar na fila com PRIORIDADE MÁXIMA e prazo de 24h.${listaCancelar}${avisoAlerta}`)) {
      setAcaoEmCurso(null)
      return
    }

    const { data: res, error } = await supabase.rpc('reposicao_aprovar', { p_lote_id: lote.id })

    setAcaoEmCurso(null)
    if (error) { alert('Erro ao aprovar: ' + error.message); return }

    const nCancelados = res?.clientes_cancelados ?? 0
    if (nCancelados > 0) {
      alert(`✓ Reposição aprovada. ${nCancelados} cliente(s) reposto(s) cancelado(s) e fora da contagem.`)
    }
    // Remove da lista atual
    setReposicoes(reposicoes.filter(r => r.id !== lote.id))
    setRefreshPainel(v => v + 1)
  }

  async function negar(lote) {
    const motivo = window.prompt('Motivo da negação (vai aparecer pra vendedora):')
    if (!motivo || motivo.trim() === '') { alert('Negação cancelada — motivo vazio.'); return }
    setAcaoEmCurso(lote.id)
    
    const { error } = await supabase.rpc('reposicao_negar', { p_lote_id: lote.id, p_motivo: motivo.trim() })

    setAcaoEmCurso(null)
    if (error) { alert('Erro: ' + error.message); return }
    
    setReposicoes(reposicoes.filter(r => r.id !== lote.id))
    setRefreshPainel(v => v + 1)
  }

  return (
    <div>
      <div style={s.title}>🔄 Reposições</div>
      <div style={s.subtitle}>Solicitações de reposição feitas pelas vendedoras B2B. Aprovadas viram contratos grátis na fila de entrega.</div>

      {/* ===== PAINEL: período + KPIs + régua ===== */}
      <div style={s.painel}>
        <div style={s.filtros}>
          {[['dia','Hoje'], ['semana','Semana'], ['mes','Mês'], ['custom','Personalizado']].map(([k, label]) => (
            <button key={k} onClick={() => setPeriodo(k)}
              style={{ ...s.fBtn, ...(periodo === k ? s.fBtnOn : {}) }}>
              {label}
            </button>
          ))}
          {periodo === 'custom' && (
            <>
              <input type="date" style={s.dateInput} value={dtIni} onChange={e => setDtIni(e.target.value)} />
              <span style={{ fontSize: 12, color: '#888' }}>até</span>
              <input type="date" style={s.dateInput} value={dtFim} onChange={e => setDtFim(e.target.value)} />
            </>
          )}
        </div>

        {periodo === 'custom' && (!dtIni || !dtFim) && (
          <div style={{ fontSize: 12, color: '#888' }}>Escolha as duas datas para ver os números.</div>
        )}

        {loadingPainel && !(periodo === 'custom' && (!dtIni || !dtFim)) && (
          <div style={{ fontSize: 12, color: '#888' }}>Calculando...</div>
        )}

        {!loadingPainel && resumo && (
          <>
            <div style={s.kpis}>
              {[
                ['pendente', 'Pendentes', '#854F0B', '#FFF8E7'],
                ['aprovado', 'Aprovadas', '#3B6D11', '#EAF3DE'],
                ['negado', 'Negadas', '#A32D2D', '#FCEBEB'],
              ].map(([k, label, cor, bg]) => {
                const r = resumo[k]
                const advs = r ? Number(r.advogados) : 0
                const cts = r ? Number(r.contratos) : 0
                const sols = r ? Number(r.solicitacoes) : 0
                return (
                  <div key={k} style={{ ...s.kpi, background: bg, borderColor: cor + '30' }}>
                    <div style={{ ...s.kpiTop, color: cor }}>{label}</div>
                    <div style={{ ...s.kpiNum, color: cor }}>{cts}</div>
                    <div style={s.kpiSub}>
                      contrato{cts !== 1 ? 's' : ''} · <strong>{advs}</strong> advogado{advs !== 1 ? 's' : ''} · {sols} solicitaç{sols !== 1 ? 'ões' : 'ão'}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Régua de saúde: mesma regra do sistema (15% alerta / 20% bloqueio sobre fechados) */}
            {regua && (() => {
              const sit = regua.situacao
              const semBase = sit === 'sem_base'
              const cor = semBase ? '#888' : sit === 'bloqueio' ? '#A32D2D' : sit === 'alerta' ? '#854F0B' : '#3B6D11'
              const bg = semBase ? '#FAFAFA' : sit === 'bloqueio' ? '#FCEBEB' : sit === 'alerta' ? '#FFF8E7' : '#EAF3DE'
              const rotulo = semBase ? 'Sem base' : sit === 'bloqueio' ? 'Bloqueio' : sit === 'alerta' ? 'Alerta' : 'Saudável'
              const pct = Number(regua.pct || 0)
              const fechados = Number(regua.clientes_fechados || 0)
              const pendCt = resumo.pendente ? Number(resumo.pendente.contratos) : 0
              const pctSeAprovarTudo = fechados > 0
                ? Math.round(((Number(regua.repostos_aprovados || 0) + pendCt) / fechados) * 1000) / 10
                : null
              return (
                <div style={{ ...s.reguaBox, background: bg, borderColor: cor + '40' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: cor }}>
                      Taxa de reposição: {semBase ? '—' : `${pct}%`} · {rotulo}
                    </div>
                    <div style={{ fontSize: 11, color: '#666' }}>
                      {regua.repostos_aprovados} repostos sobre {fechados} fechados
                    </div>
                  </div>

                  {!semBase && (
                    <div style={s.barraBg}>
                      <div style={{ ...s.barraFill, width: `${Math.min(pct / 25 * 100, 100)}%`, background: cor }} />
                      <div style={{ ...s.marca, left: `${15 / 25 * 100}%` }} title="Alerta 15%" />
                      <div style={{ ...s.marca, left: `${20 / 25 * 100}%` }} title="Bloqueio 20%" />
                    </div>
                  )}

                  <div style={{ fontSize: 11, color: '#666', marginTop: 8 }}>
                    Alerta ≥15% · bloqueio &gt;20% dos fechados. Tetos no período: {regua.teto_alerta} / {regua.teto_bloqueio} reposições.
                    {periodo === 'dia' && ' Base diária é pequena — a % oscila muito.'}
                  </div>

                  {pctSeAprovarTudo != null && pendCt > 0 && (
                    <div style={{
                      fontSize: 12, marginTop: 8, paddingTop: 8, borderTop: '0.5px solid rgba(0,0,0,0.08)',
                      color: pctSeAprovarTudo > 20 ? '#A32D2D' : pctSeAprovarTudo >= 15 ? '#854F0B' : '#3B6D11', fontWeight: 500,
                    }}>
                      {pctSeAprovarTudo > 20 ? '🚫' : pctSeAprovarTudo >= 15 ? '⚠️' : '✓'} Se aprovar as {pendCt} pendentes: <strong>{pctSeAprovarTudo}%</strong>
                      {pctSeAprovarTudo > 20 && ' — o sistema vai bloquear parte delas.'}
                    </div>
                  )}
                </div>
              )
            })()}
          </>
        )}
      </div>

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

          {(lote.clientes_repostos || []).length > 0 && (
            <div style={{ background: '#FCEBEB', border: '0.5px solid #A32D2D20', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#A32D2D', fontWeight: 600, marginBottom: 4 }}>
                {aba === 'pendente' ? '🚫 Serão cancelados ao aprovar:' : '🚫 Clientes repostos:'}
              </div>
              {lote.clientes_repostos.map(c => (
                <div key={c.id} style={{ fontSize: 12, color: '#555' }}>• {c.nome} · {c.cpf}{c.status === 'cancelado' ? ' — ✓ cancelado' : ''}</div>
              ))}
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
