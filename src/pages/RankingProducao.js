import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const s = {
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 },
  cardMetric: { background: '#ffffff', borderRadius: 14, padding: '16px', border: '0.5px solid rgba(15,23,42,0.07)' },
  cardLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6, fontWeight: 500 },
  cardValue: { fontSize: 26, fontWeight: 500 },
  cardSub: { fontSize: 11, color: '#5b6b84', marginTop: 4 },
  block: { background: '#ffffff', borderRadius: 14, padding: '1.25rem', border: '0.5px solid rgba(15,23,42,0.07)', marginBottom: 16 },
  blockTitle: { fontSize: 14, fontWeight: 500, color: '#0f172a', marginBottom: 14 },
  rankRow: { display: 'grid', gridTemplateColumns: '32px 1fr 80px 80px 90px', gap: 10, alignItems: 'center', padding: '10px 6px', borderBottom: '0.5px solid rgba(15,23,42,0.05)' },
  rankPos: (top) => ({
    width: 28, height: 28, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 600,
    background: top === 1 ? '#FFD700' : top === 2 ? '#C0C0C0' : top === 3 ? '#CD7F32' : '#e2e8f0',
    color: top <= 3 ? '#232a37' : '#5b6b84',
  }),
  alertBox: (cor, bg) => ({ background: bg, border: `1px solid ${cor}40`, borderRadius: 10, padding: '10px 12px', fontSize: 12, color: cor, marginBottom: 8 }),
}

function bonusPorFaixa(qtd) {
  if (qtd <= 0) return 0
  if (qtd >= 41) return qtd * 20
  if (qtd >= 16) return qtd * 17
  return qtd * 15
}

export default function RankingProducao() {
  const [ranking, setRanking] = useState([])
  const [vendedoresEmQueda, setEmQueda] = useState([])
  const [zeraramHoje, setZeraramHoje] = useState([])
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState('mes')

  // Filtro de período personalizado
  const [modalCustom, setModalCustom] = useState(false)
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [rankingCustom, setRankingCustom] = useState(null) // null = não aplicado, [] = aplicado vazio
  const [loadingCustom, setLoadingCustom] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)

    // Ranking completo
    const { data: rk } = await supabase.from('vw_ranking_vendedores').select('*').order('posicao_mes')
    setRanking(rk || [])

    // Detecta vendedoras em queda: vendia bem na semana anterior e zerou esta semana
    // (assinados_semana = 0 mas tinha assinaturas em mês > 0)
    const queda = (rk || []).filter(r => r.assinados_semana === 0 && r.assinados_mes > 0)
    setEmQueda(queda)

    // Vendedoras que não venderam hoje
    const semVendaHoje = (rk || []).filter(r => r.assinados_hoje === 0)
    setZeraramHoje(semVendaHoje)

    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  // Auto-refresh a cada 60s
  useEffect(() => {
    const id = setInterval(fetch, 60000)
    return () => clearInterval(id)
  }, [fetch])

  async function aplicarFiltroCustom() {
    if (!dataInicio || !dataFim) { alert('Selecione as duas datas'); return }
    if (dataInicio > dataFim) { alert('Data início não pode ser maior que data fim'); return }
    setLoadingCustom(true)
    const { data, error } = await supabase.rpc('ranking_periodo_personalizado', {
      p_inicio: dataInicio,
      p_fim: dataFim
    })
    if (error) { alert('Erro: ' + error.message); setLoadingCustom(false); return }
    setRankingCustom(data || [])
    setPeriodo('custom')
    setModalCustom(false)
    setLoadingCustom(false)
  }

  function fecharCustom() {
    setRankingCustom(null)
    setPeriodo('mes')
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: '#5b6b84' }}>Carregando...</div>

  const usandoCustom = periodo === 'custom' && rankingCustom !== null
  const campoQtd = periodo === 'hoje' ? 'assinados_hoje' : periodo === 'semana' ? 'assinados_semana' : 'assinados_mes'
  const campoPos = periodo === 'hoje' ? 'posicao_hoje' : periodo === 'semana' ? 'posicao_semana' : 'posicao_mes'
  const rankingOrdenado = usandoCustom 
    ? [...rankingCustom].sort((a,b) => a.posicao - b.posicao) 
    : [...ranking].sort((a,b) => a[campoPos] - b[campoPos])

  // Totais
  const totalAssinadosMes = ranking.reduce((s, r) => s + (r.assinados_mes || 0), 0)
  const totalBonusMes = ranking.reduce((s, r) => s + bonusPorFaixa(r.assinados_mes || 0), 0)
  // Total de bônus quando custom está ativo (usa mesma fórmula de faixas)
  const totalBonusCustom = (rankingCustom || []).reduce((s, r) => s + bonusPorFaixa(r.assinados_periodo || 0), 0)
  const totalAssinadosHoje = ranking.reduce((s, r) => s + (r.assinados_hoje || 0), 0)
  const totalAssinadosSem = ranking.reduce((s, r) => s + (r.assinados_semana || 0), 0)
  const ativosHoje = ranking.filter(r => r.assinados_hoje > 0).length

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: 20, fontWeight: 500, color: '#0f172a', marginBottom: 4 }}>🏆 Ranking de Vendedoras</div>
        <div style={{ fontSize: 13, color: '#5b6b84' }}>Acompanhamento de produção e bônus mensal · atualiza a cada 60 segundos</div>
      </div>

      {/* === CARDS DE TOTAIS === */}
      <div style={s.cards}>
        <div style={s.cardMetric}>
          <div style={{ ...s.cardLabel, color: '#059669' }}>Assinados hoje</div>
          <div style={{ ...s.cardValue, color: '#059669' }}>{totalAssinadosHoje}</div>
          <div style={s.cardSub}>{ativosHoje} de {ranking.length} ativ{ativosHoje !== 1 ? 'as' : 'a'}</div>
        </div>
        <div style={s.cardMetric}>
          <div style={{ ...s.cardLabel, color: '#2563eb' }}>Assinados na semana</div>
          <div style={{ ...s.cardValue, color: '#2563eb' }}>{totalAssinadosSem}</div>
          <div style={s.cardSub}>últimos 7 dias</div>
        </div>
        <div style={s.cardMetric}>
          <div style={{ ...s.cardLabel, color: '#7c3aed' }}>Assinados no mês</div>
          <div style={{ ...s.cardValue, color: '#7c3aed' }}>{totalAssinadosMes}</div>
          <div style={s.cardSub}>mês corrente</div>
        </div>
        <div style={s.cardMetric}>
          <div style={{ ...s.cardLabel, color: '#b45309' }}>
            💰 Bônus {periodo === 'custom' && rankingCustom ? 'do período' : 'do mês'}
          </div>
          <div style={{ ...s.cardValue, color: '#b45309' }}>
            R$ {(periodo === 'custom' && rankingCustom ? totalBonusCustom : totalBonusMes).toLocaleString('pt-BR')}
          </div>
          <div style={s.cardSub}>
            {periodo === 'custom' && rankingCustom 
              ? `${dataInicio.split('-').reverse().slice(0,2).join('/')} → ${dataFim.split('-').reverse().slice(0,2).join('/')}` 
              : 'a pagar dia 1 do próximo mês'}
          </div>
        </div>
      </div>

      {/* === ALERTAS === */}
      {(vendedoresEmQueda.length > 0 || zeraramHoje.length > 0) && (
        <div style={s.block}>
          <div style={s.blockTitle}>🚨 Atenção</div>

          {vendedoresEmQueda.length > 0 && (
            <div style={s.alertBox('#dc2626', 'rgba(248,113,113,.14)')}>
              <strong>📉 {vendedoresEmQueda.length} vendedora{vendedoresEmQueda.length !== 1 ? 's' : ''} em queda</strong>
              <div style={{ marginTop: 4 }}>
                Não fecharam contratos esta semana mas tinham vendido no mês: {vendedoresEmQueda.map(v => v.vendedor_nome).join(', ')}
              </div>
            </div>
          )}

          {zeraramHoje.length > 0 && zeraramHoje.length < ranking.length && (
            <div style={s.alertBox('#b45309', 'rgba(251,191,36,.12)')}>
              <strong>⏰ {zeraramHoje.length} sem venda hoje</strong>
              <div style={{ marginTop: 4 }}>
                {zeraramHoje.slice(0, 5).map(v => v.vendedor_nome.split(' ')[0]).join(', ')}
                {zeraramHoje.length > 5 ? ` e mais ${zeraramHoje.length - 5}` : ''}
              </div>
            </div>
          )}
        </div>
      )}

      {/* === RANKING COMPLETO === */}
      <div style={s.block}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }}>🏆 Ranking completo</div>
          <div style={{ display: 'flex', gap: 4, background: '#f2f5fa', borderRadius: 8, padding: 3 }}>
            {[['hoje','Hoje'],['semana','Semana'],['mes','Mês']].map(([k, label]) => (
              <button key={k} onClick={() => { setPeriodo(k); setRankingCustom(null) }}
                style={{
                  padding: '6px 14px', fontSize: 12, fontWeight: 500,
                  border: 'none', cursor: 'pointer', borderRadius: 6,
                  background: periodo === k ? '#ffffff' : 'transparent',
                  color: periodo === k ? '#2563eb' : '#5b6b84',
                  boxShadow: periodo === k ? '0 1px 3px rgba(15,23,42,0.06)' : 'none',
                }}>{label}</button>
            ))}
            <button onClick={() => setModalCustom(true)}
              style={{
                padding: '6px 14px', fontSize: 12, fontWeight: 500,
                border: 'none', cursor: 'pointer', borderRadius: 6,
                background: periodo === 'custom' ? '#ffffff' : 'transparent',
                color: periodo === 'custom' ? '#2563eb' : '#5b6b84',
                boxShadow: periodo === 'custom' ? '0 1px 3px rgba(15,23,42,0.06)' : 'none',
              }}>📅 {periodo === 'custom' && rankingCustom ? `${dataInicio.split('-').reverse().slice(0,2).join('/')} → ${dataFim.split('-').reverse().slice(0,2).join('/')}` : 'Personalizado'}</button>
          </div>
        </div>

        {/* Header */}
        <div style={{ ...s.rankRow, fontSize: 10, color: '#5b6b84', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid rgba(15,23,42,0.08)', paddingBottom: 8 }}>
          <div></div>
          <div>Vendedora</div>
          <div style={{ textAlign: 'right' }}>Assinados</div>
          <div style={{ textAlign: 'right' }}>Taxa</div>
          <div style={{ textAlign: 'right' }}>Bônus mês</div>
        </div>

        {rankingOrdenado.map(r => {
          // No modo custom, a estrutura é diferente
          const qtd = usandoCustom ? r.assinados_periodo : (r[campoQtd] || 0)
          const cadastros = usandoCustom ? r.cadastros_periodo : (r.cadastros_mes || 0)
          const tempoMedio = usandoCustom ? r.tempo_medio_h : r.tempo_medio_h_mes
          const taxa = usandoCustom ? Number(r.taxa_assinatura) : Number(r.taxa_assinatura_mes || 0)
          const pos = usandoCustom ? r.posicao : r[campoPos]
          // Bônus: no modo mês usa assinados_mes, no custom usa assinados_periodo (mesma fórmula de faixas)
          const bonus = usandoCustom ? bonusPorFaixa(r.assinados_periodo || 0) : bonusPorFaixa(r.assinados_mes || 0)
          return (
            <div key={r.vendedor_id} style={s.rankRow}>
              <div style={s.rankPos(pos)}>{pos}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{r.vendedor_nome}</div>
                <div style={{ fontSize: 10, color: '#5b6b84' }}>
                  {cadastros} cadastros · {tempoMedio ? `${Math.round(tempoMedio)}h média` : 'sem dados'}
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 500, color: '#2563eb' }}>
                {qtd}
              </div>
              <div style={{ textAlign: 'right', fontSize: 12, color: taxa >= 60 ? '#059669' : taxa >= 40 ? '#b45309' : '#dc2626' }}>
                {taxa}%
              </div>
              <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 500, color: bonus > 0 ? '#059669' : '#64748b' }}>
                R$ {bonus.toLocaleString('pt-BR')}
              </div>
            </div>
          )
        })}

        <div style={{ marginTop: 14, padding: '10px 12px', background: '#f2f5fa', borderRadius: 8, fontSize: 11, color: '#5b6b84', lineHeight: 1.5 }}>
          <strong>Faixas:</strong> 1-15 contratos R$15 · 16-40 contratos R$17 · 41+ R$20 (lote do mês inteiro pelo mesmo valor) ·
          <strong>Desempate:</strong> menor tempo médio entre cadastro e assinatura
        </div>
      </div>

      {/* MODAL FILTRO PERSONALIZADO */}
      {modalCustom && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#ffffff', padding: 24, borderRadius: 12, width: '90%', maxWidth: 440 }}>
            <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 6 }}>📅 Filtro de período personalizado</div>
            <div style={{ fontSize: 13, color: '#5b6b84', marginBottom: 16 }}>Veja produção das vendedoras em qualquer intervalo</div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#0f172a', fontWeight: 500, marginBottom: 4, display: 'block' }}>Data início *</label>
              <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                style={{ width: '100%', padding: 10, fontSize: 14, border: '0.5px solid rgba(0,0,0,0.45)', borderRadius: 8, outline: 'none', boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: '#0f172a', fontWeight: 500, marginBottom: 4, display: 'block' }}>Data fim *</label>
              <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                style={{ width: '100%', padding: 10, fontSize: 14, border: '0.5px solid rgba(0,0,0,0.45)', borderRadius: 8, outline: 'none', boxSizing: 'border-box' }} />
            </div>

            <div style={{ background: 'rgba(52,211,153,.14)', padding: 10, borderRadius: 6, fontSize: 11, color: '#059669', marginBottom: 14 }}>
              💡 O bônus será recalculado pelo período usando as mesmas faixas (1-15 R$15 · 16-40 R$17 · 41+ R$20).
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
              {rankingCustom !== null && (
                <button onClick={fecharCustom} style={{ padding: '8px 14px', background: 'rgba(248,113,113,.14)', color: '#dc2626', border: 'none', borderRadius: 7, fontSize: 13, cursor: 'pointer' }}>Limpar filtro</button>
              )}
              <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                <button onClick={() => setModalCustom(false)} disabled={loadingCustom} style={{ padding: '8px 14px', background: '#e2e8f0', color: '#5b6b84', border: 'none', borderRadius: 7, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
                <button onClick={aplicarFiltroCustom} disabled={loadingCustom || !dataInicio || !dataFim}
                  style={{ padding: '8px 14px', background: '#60a5fa', color: '#232a37', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: loadingCustom ? 'not-allowed' : 'pointer', opacity: loadingCustom || !dataInicio || !dataFim ? 0.5 : 1 }}>
                  {loadingCustom ? 'Carregando...' : 'Aplicar'}
                </button>
              </div>
            </div>

            {/* Atalhos rápidos */}
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '0.5px solid rgba(15,23,42,0.07)' }}>
              <div style={{ fontSize: 11, color: '#5b6b84', marginBottom: 6 }}>Atalhos rápidos:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[
                  ['Mês passado', () => {
                    const hoje = new Date()
                    const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
                    const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0)
                    setDataInicio(inicio.toISOString().slice(0,10))
                    setDataFim(fim.toISOString().slice(0,10))
                  }],
                  ['Últimos 30 dias', () => {
                    const hoje = new Date()
                    const inicio = new Date(hoje.getTime() - 30 * 86400000)
                    setDataInicio(inicio.toISOString().slice(0,10))
                    setDataFim(hoje.toISOString().slice(0,10))
                  }],
                  ['Últimos 90 dias', () => {
                    const hoje = new Date()
                    const inicio = new Date(hoje.getTime() - 90 * 86400000)
                    setDataInicio(inicio.toISOString().slice(0,10))
                    setDataFim(hoje.toISOString().slice(0,10))
                  }],
                  ['Este ano', () => {
                    const hoje = new Date()
                    setDataInicio(`${hoje.getFullYear()}-01-01`)
                    setDataFim(hoje.toISOString().slice(0,10))
                  }],
                ].map(([label, fn]) => (
                  <button key={label} onClick={fn} style={{ padding: '4px 10px', background: '#f2f5fa', color: '#5b6b84', border: '0.5px solid rgba(15,23,42,0.07)', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>{label}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
