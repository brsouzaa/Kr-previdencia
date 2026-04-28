import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const s = {
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 },
  cardMetric: { background: '#fff', borderRadius: 14, padding: '16px', border: '0.5px solid rgba(0,0,0,0.08)' },
  cardLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6, fontWeight: 500 },
  cardValue: { fontSize: 26, fontWeight: 500 },
  cardSub: { fontSize: 11, color: '#888', marginTop: 4 },
  block: { background: '#fff', borderRadius: 14, padding: '1.25rem', border: '0.5px solid rgba(0,0,0,0.08)', marginBottom: 16 },
  blockTitle: { fontSize: 14, fontWeight: 500, color: '#111', marginBottom: 14 },
  rankRow: { display: 'grid', gridTemplateColumns: '32px 1fr 80px 80px 90px', gap: 10, alignItems: 'center', padding: '10px 6px', borderBottom: '0.5px solid rgba(0,0,0,0.05)' },
  rankPos: (top) => ({
    width: 28, height: 28, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 600,
    background: top === 1 ? '#FFD700' : top === 2 ? '#C0C0C0' : top === 3 ? '#CD7F32' : '#f0f0ee',
    color: top <= 3 ? '#fff' : '#666',
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

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>Carregando...</div>

  const campoQtd = periodo === 'hoje' ? 'assinados_hoje' : periodo === 'semana' ? 'assinados_semana' : 'assinados_mes'
  const campoPos = periodo === 'hoje' ? 'posicao_hoje' : periodo === 'semana' ? 'posicao_semana' : 'posicao_mes'
  const rankingOrdenado = [...ranking].sort((a,b) => a[campoPos] - b[campoPos])

  // Totais
  const totalAssinadosMes = ranking.reduce((s, r) => s + (r.assinados_mes || 0), 0)
  const totalBonusMes = ranking.reduce((s, r) => s + bonusPorFaixa(r.assinados_mes || 0), 0)
  const totalAssinadosHoje = ranking.reduce((s, r) => s + (r.assinados_hoje || 0), 0)
  const totalAssinadosSem = ranking.reduce((s, r) => s + (r.assinados_semana || 0), 0)
  const ativosHoje = ranking.filter(r => r.assinados_hoje > 0).length

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: 20, fontWeight: 500, color: '#111', marginBottom: 4 }}>🏆 Ranking de Vendedoras</div>
        <div style={{ fontSize: 13, color: '#888' }}>Acompanhamento de produção e bônus mensal · atualiza a cada 60 segundos</div>
      </div>

      {/* === CARDS DE TOTAIS === */}
      <div style={s.cards}>
        <div style={s.cardMetric}>
          <div style={{ ...s.cardLabel, color: '#3B6D11' }}>Assinados hoje</div>
          <div style={{ ...s.cardValue, color: '#3B6D11' }}>{totalAssinadosHoje}</div>
          <div style={s.cardSub}>{ativosHoje} de {ranking.length} ativ{ativosHoje !== 1 ? 'as' : 'a'}</div>
        </div>
        <div style={s.cardMetric}>
          <div style={{ ...s.cardLabel, color: '#185FA5' }}>Assinados na semana</div>
          <div style={{ ...s.cardValue, color: '#185FA5' }}>{totalAssinadosSem}</div>
          <div style={s.cardSub}>últimos 7 dias</div>
        </div>
        <div style={s.cardMetric}>
          <div style={{ ...s.cardLabel, color: '#534AB7' }}>Assinados no mês</div>
          <div style={{ ...s.cardValue, color: '#534AB7' }}>{totalAssinadosMes}</div>
          <div style={s.cardSub}>mês corrente</div>
        </div>
        <div style={s.cardMetric}>
          <div style={{ ...s.cardLabel, color: '#854F0B' }}>💰 Bônus do mês</div>
          <div style={{ ...s.cardValue, color: '#854F0B' }}>R$ {totalBonusMes.toLocaleString('pt-BR')}</div>
          <div style={s.cardSub}>a pagar dia 1 do próximo mês</div>
        </div>
      </div>

      {/* === ALERTAS === */}
      {(vendedoresEmQueda.length > 0 || zeraramHoje.length > 0) && (
        <div style={s.block}>
          <div style={s.blockTitle}>🚨 Atenção</div>

          {vendedoresEmQueda.length > 0 && (
            <div style={s.alertBox('#A32D2D', '#FCEBEB')}>
              <strong>📉 {vendedoresEmQueda.length} vendedora{vendedoresEmQueda.length !== 1 ? 's' : ''} em queda</strong>
              <div style={{ marginTop: 4 }}>
                Não fecharam contratos esta semana mas tinham vendido no mês: {vendedoresEmQueda.map(v => v.vendedor_nome).join(', ')}
              </div>
            </div>
          )}

          {zeraramHoje.length > 0 && zeraramHoje.length < ranking.length && (
            <div style={s.alertBox('#854F0B', '#FAEEDA')}>
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
          <div style={{ fontSize: 14, fontWeight: 500, color: '#111' }}>🏆 Ranking completo</div>
          <div style={{ display: 'flex', gap: 4, background: '#f8f8f6', borderRadius: 8, padding: 3 }}>
            {[['hoje','Hoje'],['semana','Semana'],['mes','Mês']].map(([k, label]) => (
              <button key={k} onClick={() => setPeriodo(k)}
                style={{
                  padding: '6px 14px', fontSize: 12, fontWeight: 500,
                  border: 'none', cursor: 'pointer', borderRadius: 6,
                  background: periodo === k ? '#fff' : 'transparent',
                  color: periodo === k ? '#185FA5' : '#888',
                  boxShadow: periodo === k ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                }}>{label}</button>
            ))}
          </div>
        </div>

        {/* Header */}
        <div style={{ ...s.rankRow, fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid rgba(0,0,0,0.1)', paddingBottom: 8 }}>
          <div></div>
          <div>Vendedora</div>
          <div style={{ textAlign: 'right' }}>Assinados</div>
          <div style={{ textAlign: 'right' }}>Taxa</div>
          <div style={{ textAlign: 'right' }}>Bônus mês</div>
        </div>

        {rankingOrdenado.map(r => {
          const bonus = bonusPorFaixa(r.assinados_mes || 0)
          return (
            <div key={r.vendedor_id} style={s.rankRow}>
              <div style={s.rankPos(r[campoPos])}>{r[campoPos]}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{r.vendedor_nome}</div>
                <div style={{ fontSize: 10, color: '#888' }}>
                  {r.cadastros_mes || 0} cadastros · {r.tempo_medio_h_mes ? `${Math.round(r.tempo_medio_h_mes)}h média` : 'sem dados'}
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 500, color: '#185FA5' }}>
                {r[campoQtd] || 0}
              </div>
              <div style={{ textAlign: 'right', fontSize: 12, color: r.taxa_assinatura_mes >= 60 ? '#3B6D11' : r.taxa_assinatura_mes >= 40 ? '#854F0B' : '#A32D2D' }}>
                {r.taxa_assinatura_mes || 0}%
              </div>
              <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 500, color: bonus > 0 ? '#3B6D11' : '#aaa' }}>
                R$ {bonus.toLocaleString('pt-BR')}
              </div>
            </div>
          )
        })}

        <div style={{ marginTop: 14, padding: '10px 12px', background: '#f8f8f6', borderRadius: 8, fontSize: 11, color: '#888', lineHeight: 1.5 }}>
          <strong>Faixas:</strong> 1-15 contratos R$15 · 16-40 contratos R$17 · 41+ R$20 (lote do mês inteiro pelo mesmo valor) ·
          <strong>Desempate:</strong> menor tempo médio entre cadastro e assinatura
        </div>
      </div>
    </div>
  )
}
