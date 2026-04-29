import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// === Faixas de bônus ===
function bonusPorFaixa(qtd) {
  if (qtd <= 0) return 0
  if (qtd >= 41) return qtd * 20
  if (qtd >= 16) return qtd * 17
  return qtd * 15
}
function valorFaixaAtual(qtd) {
  if (qtd >= 41) return 20
  if (qtd >= 16) return 17
  return 15
}
function faltamProxFaixa(qtd) {
  if (qtd >= 41) return null
  if (qtd >= 16) return { faltam: 41 - qtd, novo: 20 }
  return { faltam: 16 - qtd, novo: 17 }
}

const s = {
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 },
  cardMetric: { background: '#fff', borderRadius: 14, padding: '16px', border: '0.5px solid rgba(0,0,0,0.08)' },
  cardLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6, fontWeight: 500 },
  cardValue: { fontSize: 28, fontWeight: 500 },
  cardSub: { fontSize: 11, color: '#888', marginTop: 4 },
  block: { background: '#fff', borderRadius: 14, padding: '1.25rem', border: '0.5px solid rgba(0,0,0,0.08)', marginBottom: 16 },
  blockTitle: { fontSize: 14, fontWeight: 500, color: '#111', marginBottom: 14 },
  bonusBig: { background: 'linear-gradient(135deg, #185FA5 0%, #2680C2 100%)', borderRadius: 16, padding: '1.5rem', color: '#fff', marginBottom: 16, boxShadow: '0 4px 14px rgba(24,95,165,0.25)' },
  bonusBigLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.9, marginBottom: 6 },
  bonusBigValue: { fontSize: 36, fontWeight: 600, marginBottom: 8 },
  bonusBigSub: { fontSize: 13, opacity: 0.9 },
  faixa: { display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, marginBottom: 6, fontSize: 12 },
  faixaAtiva: { background: 'rgba(255,255,255,0.2)', fontWeight: 500 },
  rankRow: (destacado) => ({
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 12px', borderRadius: 8, marginBottom: 4,
    background: destacado ? '#E6F1FB' : 'transparent',
    border: destacado ? '1.5px solid #185FA5' : '0.5px solid transparent',
  }),
  rankPos: (top, destacado) => ({
    width: 32, height: 32, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 600, flexShrink: 0,
    background: top === 1 ? '#FFD700' : top === 2 ? '#C0C0C0' : top === 3 ? '#CD7F32' : (destacado ? '#185FA5' : '#f0f0ee'),
    color: top <= 3 || destacado ? '#fff' : '#666',
  }),
  toast: {
    position: 'fixed', top: 20, right: 20, zIndex: 9999,
    background: '#3B6D11', color: '#fff', padding: '12px 18px',
    borderRadius: 10, fontSize: 13, fontWeight: 500,
    boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
    animation: 'slideIn 0.4s ease-out',
  },
}

const STYLE_KEYFRAMES = `
@keyframes slideIn { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
`

export default function MeuDesempenho() {
  const { profile } = useAuth()
  const [ranking, setRanking] = useState([])
  const [meusClientes, setMeusClientes] = useState([])
  const [streak, setStreak] = useState(0)
  const [loading, setLoading] = useState(true)
  const [periodoRanking, setPeriodoRanking] = useState('mes') // hoje | semana | mes
  const [toast, setToast] = useState(null)
  const ultimaPosicaoMes = useRef(null)

  const fetchTudo = useCallback(async () => {
    setLoading(true)
    const [{ data: rk }, { data: clis }, { data: stk }] = await Promise.all([
      supabase.from('vw_ranking_vendedores').select('*').order('posicao_mes'),
      supabase.from('clientes').select('*').eq('vendedor_operador_id', profile.id),
      supabase.rpc('streak_vendedor', { p_vendedor_id: profile.id }),
    ])
    setRanking(rk || [])
    setMeusClientes(clis || [])
    setStreak(stk || 0)

    // Detecta virada de posição
    const minha = (rk || []).find(r => r.vendedor_id === profile.id)
    if (minha) {
      if (ultimaPosicaoMes.current !== null && minha.posicao_mes < ultimaPosicaoMes.current) {
        const passados = (rk || []).filter(r =>
          r.posicao_mes > minha.posicao_mes &&
          r.posicao_mes <= ultimaPosicaoMes.current &&
          r.vendedor_id !== profile.id
        )
        const passadoNome = passados.length > 0 ? passados[0].vendedor_nome.split(' ')[0] : null
        setToast({
          msg: passadoNome
            ? `🚀 Você subiu pra ${minha.posicao_mes}º! Passou ${passadoNome}.`
            : `🚀 Você subiu pra ${minha.posicao_mes}º lugar!`,
        })
        setTimeout(() => setToast(null), 5000)
      }
      ultimaPosicaoMes.current = minha.posicao_mes
    }
    setLoading(false)
  }, [profile])

  useEffect(() => { fetchTudo() }, [fetchTudo])

  // Auto-refresh a cada 60s
  useEffect(() => {
    const id = setInterval(fetchTudo, 60000)
    return () => clearInterval(id)
  }, [fetchTudo])

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>Carregando...</div>

  const minha = ranking.find(r => r.vendedor_id === profile.id)
  const assinadosMes = minha?.assinados_mes || 0
  const bonusAtual = bonusPorFaixa(assinadosMes)
  const faixaAtual = valorFaixaAtual(assinadosMes)
  const proximaFaixa = faltamProxFaixa(assinadosMes)
  const minhaPosicaoMes = minha?.posicao_mes || ranking.length
  const minhaPosicaoSem = minha?.posicao_semana || ranking.length
  const minhaPosicaoHoje = minha?.posicao_hoje || ranking.length

  // Métricas pessoais
  const totalCadastrados = meusClientes.length
  const aguardando = meusClientes.filter(c => c.status === 'aguardando_emissao').length
  const emitidos = meusClientes.filter(c => c.status === 'emitido').length
  const expirados = meusClientes.filter(c => c.status === 'expirado').length

  // Ordena ranking por período escolhido
  const campoQtd = periodoRanking === 'hoje' ? 'assinados_hoje' : periodoRanking === 'semana' ? 'assinados_semana' : 'assinados_mes'
  const campoPos = periodoRanking === 'hoje' ? 'posicao_hoje' : periodoRanking === 'semana' ? 'posicao_semana' : 'posicao_mes'
  const rankingOrdenado = [...ranking].sort((a,b) => a[campoPos] - b[campoPos])
  const top4 = rankingOrdenado.slice(0, 4)
  const minhaPosicaoPeriodo = minha?.[campoPos] || ranking.length
  const minhaForaTop4 = minhaPosicaoPeriodo > 4

  return (
    <div>
      <style>{STYLE_KEYFRAMES}</style>
      {toast && <div style={s.toast}>{toast.msg}</div>}

      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: 20, fontWeight: 500, color: '#111', marginBottom: 4 }}>📊 Meu desempenho</div>
        <div style={{ fontSize: 13, color: '#888' }}>Acompanhe seu bônus do mês e o ranking — atualiza automaticamente</div>
      </div>

      {/* === BÔNUS DESTAQUE === */}
      <div style={s.bonusBig}>
        <div style={s.bonusBigLabel}>💰 Bônus a receber este mês</div>
        <div style={s.bonusBigValue}>R$ {bonusAtual.toLocaleString('pt-BR')}</div>
        <div style={s.bonusBigSub}>
          {assinadosMes} contrato{assinadosMes !== 1 ? 's' : ''} assinado{assinadosMes !== 1 ? 's' : ''} · R$ {faixaAtual} cada
        </div>
        {proximaFaixa && (
          <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(255,255,255,0.18)', borderRadius: 10, fontSize: 12 }}>
            🎯 Faltam <strong>{proximaFaixa.faltam}</strong> contrato{proximaFaixa.faltam !== 1 ? 's' : ''} pra subir pra <strong>R$ {proximaFaixa.novo}/contrato</strong>
            {' '}— ganharia R$ {bonusPorFaixa(assinadosMes + proximaFaixa.faltam).toLocaleString('pt-BR')} no total!
          </div>
        )}

        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.2)' }}>
          <div style={{ fontSize: 11, opacity: 0.85, marginBottom: 6 }}>Faixas de bônus (lote do mês inteiro pelo mesmo valor)</div>
          <div style={{ ...s.faixa, ...(assinadosMes < 16 ? s.faixaAtiva : {}) }}>
            <span>1 a 15 contratos</span><span>R$ 15 cada</span>
          </div>
          <div style={{ ...s.faixa, ...(assinadosMes >= 16 && assinadosMes < 41 ? s.faixaAtiva : {}) }}>
            <span>16 a 40 contratos</span><span>R$ 17 cada</span>
          </div>
          <div style={{ ...s.faixa, ...(assinadosMes >= 41 ? s.faixaAtiva : {}), marginBottom: 0 }}>
            <span>41 ou mais</span><span>R$ 20 cada</span>
          </div>
        </div>
      </div>

      {/* === MÉTRICAS PESSOAIS === */}
      <div style={s.cards}>
        <div style={s.cardMetric}>
          <div style={{ ...s.cardLabel, color: '#185FA5' }}>Cadastrados (total)</div>
          <div style={{ ...s.cardValue, color: '#185FA5' }}>{totalCadastrados}</div>
          <div style={s.cardSub}>desde sempre</div>
        </div>
        <div style={s.cardMetric}>
          <div style={{ ...s.cardLabel, color: '#854F0B' }}>Pendentes</div>
          <div style={{ ...s.cardValue, color: '#854F0B' }}>{aguardando + emitidos}</div>
          <div style={s.cardSub}>{aguardando} aguardando · {emitidos} emitidos</div>
        </div>
        <div style={s.cardMetric}>
          <div style={{ ...s.cardLabel, color: '#3B6D11' }}>Assinados (mês)</div>
          <div style={{ ...s.cardValue, color: '#3B6D11' }}>{assinadosMes}</div>
          <div style={s.cardSub}>contam pro bônus</div>
        </div>
        <div style={s.cardMetric}>
          <div style={{ ...s.cardLabel, color: '#A32D2D' }}>🔥 Streak</div>
          <div style={{ ...s.cardValue, color: streak > 0 ? '#A32D2D' : '#aaa' }}>{streak}</div>
          <div style={s.cardSub}>{streak === 0 ? 'venda hoje pra começar' : `dia${streak !== 1 ? 's' : ''} consecutivo${streak !== 1 ? 's' : ''}`}</div>
        </div>
      </div>

      {/* === MINHA POSIÇÃO === */}
      <div style={s.block}>
        <div style={s.blockTitle}>🏆 Minha posição no ranking</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[
            ['Hoje', minhaPosicaoHoje, ranking.length],
            ['Semana', minhaPosicaoSem, ranking.length],
            ['Mês', minhaPosicaoMes, ranking.length],
          ].map(([label, pos, total]) => (
            <div key={label} style={{ textAlign: 'center', padding: '10px', background: '#f8f8f6', borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 600, color: pos === 1 ? '#FFD700' : pos === 2 ? '#999' : pos === 3 ? '#CD7F32' : '#185FA5' }}>
                {pos}º
              </div>
              <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>de {total}</div>
            </div>
          ))}
        </div>
      </div>

      {/* === RANKING === */}
      <div style={s.block}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#111' }}>🏆 Top 4 vendedores</div>
          <div style={{ display: 'flex', gap: 4, background: '#f8f8f6', borderRadius: 8, padding: 3 }}>
            {[['hoje','Hoje'],['semana','Semana'],['mes','Mês']].map(([k, label]) => (
              <button key={k} onClick={() => setPeriodoRanking(k)}
                style={{
                  padding: '6px 12px', fontSize: 12, fontWeight: 500,
                  border: 'none', cursor: 'pointer', borderRadius: 6,
                  background: periodoRanking === k ? '#fff' : 'transparent',
                  color: periodoRanking === k ? '#185FA5' : '#888',
                  boxShadow: periodoRanking === k ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                }}>{label}</button>
            ))}
          </div>
        </div>

        {top4.map(r => {
          const destacado = r.vendedor_id === profile.id
          return (
            <div key={r.vendedor_id} style={s.rankRow(destacado)}>
              <div style={s.rankPos(r[campoPos], destacado)}>{r[campoPos]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: destacado ? 600 : 500, color: destacado ? '#185FA5' : '#111' }}>
                  {destacado ? `${r.vendedor_nome} (você)` : r.vendedor_nome}
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#185FA5' }}>
                {r[campoQtd]} contrato{r[campoQtd] !== 1 ? 's' : ''}
              </div>
            </div>
          )
        })}

        {minhaForaTop4 && minha && (
          <>
            <div style={{ textAlign: 'center', color: '#aaa', fontSize: 12, margin: '8px 0' }}>· · ·</div>
            <div style={s.rankRow(true)}>
              <div style={s.rankPos(minha[campoPos], true)}>{minha[campoPos]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#185FA5' }}>{minha.vendedor_nome} (você)</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#185FA5' }}>
                {minha[campoQtd]} contrato{minha[campoQtd] !== 1 ? 's' : ''}
              </div>
            </div>
          </>
        )}
      </div>

      <div style={{ fontSize: 11, color: '#aaa', textAlign: 'center', marginTop: 16 }}>
        Bônus zera todo dia 1 do mês · Conta automaticamente quando o cliente assina · Se a analista devolver, desconta · Atualiza a cada 60s
      </div>
    </div>
  )
}
