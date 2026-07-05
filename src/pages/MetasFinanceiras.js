import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// ============================================================
// METAS & SAÚDE FINANCEIRA — o placar oficial da KR
//   Escada do ano · réguas em 3 níveis (saudável/alvo/tolerável)
//   · projeção de fim de mês · análise por IA
// ============================================================

const VERDE_ESCURO = '#14532d', VERDE = '#3B6D11', LARANJA = '#854F0B', VERMELHO = '#A32D2D', AZUL = '#185FA5', ROXO = '#5B21B6'
const fmt = v => `R$ ${Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`
const fmtK = v => {
  const n = Number(v || 0)
  if (Math.abs(n) >= 1000000) return `R$ ${(n / 1000000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}M`
  if (Math.abs(n) >= 1000) return `R$ ${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`
  return `R$ ${n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
}
const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const pad = n => String(n).padStart(2, '0')

export default function MetasFinanceiras() {
  const { profile } = useAuth()
  const [metas, setMetas] = useState([])
  const [dre, setDre] = useState([])
  const [loading, setLoading] = useState(true)
  const [ia, setIa] = useState(null)       // texto da análise
  const [iaLoading, setIaLoading] = useState(false)

  const podeVer = profile && ['admin', 'analista'].includes(profile.role)

  useEffect(() => {
    if (!podeVer) { setLoading(false); return }
    Promise.all([
      supabase.from('metas_financeiras').select('*').order('mes'),
      supabase.from('v_dre_mensal').select('*').order('mes'),
    ]).then(([m, d]) => {
      setMetas(m.data || [])
      setDre(d.data || [])
      setLoading(false)
    })
  }, [profile])

  if (!podeVer) return <div style={{ padding: '3rem', textAlign: 'center', color: '#5F5E5A' }}>Acesso restrito à administração.</div>
  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: '#5F5E5A' }}>Carregando metas…</div>

  const hoje = new Date()
  const mesIso = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-01`
  const metaMes = metas.find(m => m.mes === mesIso)
  const dreMes = dre.find(d => d.mes === mesIso) || {}
  const diasMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate()
  const fracao = hoje.getDate() / diasMes

  const receita = Number(dreMes.receita || 0)
  const metaFat = metaMes ? Number(metaMes.meta_faturamento) : 0
  const pace = metaFat * fracao
  const projecaoReceita = hoje.getDate() > 0 ? receita / hoje.getDate() * diasMes : 0

  const folha = Number(dreMes.folha || 0)
  const gastoFixo = Number(dreMes.fixo || 0) + folha
  const gastoMkt = Number(dreMes.marketing_total || 0)
  const gastoCom = Number(dreMes.comissao || 0)
  const gastoImp = Number(dreMes.imposto || 0)
  const gastoVar = Number(dreMes.variavel || 0) + Number(dreMes.divida || 0) + Number(dreMes.sem_grupo || 0)

  // Réguas: [saudável, alvo, tolerável] — comissão/imposto/variáveis têm nível único
  const reguas = metaMes ? [
    { nome: 'Fixo (c/ folha)', gasto: gastoFixo, niveis: [Number(metaMes.saudavel_fixo_pct), Number(metaMes.alvo_fixo_pct), Number(metaMes.teto_fixo_pct)], cor: LARANJA },
    { nome: 'Marketing (c/ IA)', gasto: gastoMkt, niveis: [Number(metaMes.saudavel_marketing_pct), Number(metaMes.alvo_marketing_pct), Number(metaMes.teto_marketing_pct)], cor: AZUL },
    { nome: 'Comissão', gasto: gastoCom, niveis: [null, null, Number(metaMes.teto_comissao_pct)], cor: ROXO },
    { nome: 'Imposto', gasto: gastoImp, niveis: [null, null, Number(metaMes.teto_imposto_pct)], cor: '#6b7280' },
    { nome: 'Variáveis (resto)', gasto: gastoVar, niveis: [null, null, Number(metaMes.teto_variavel_pct)], cor: '#0F6E56' },
  ].map(r => {
    const [saud, alvo, tol] = r.niveis
    const tolRS = metaFat * tol / 100
    const pctMeta = metaFat > 0 ? r.gasto / metaFat * 100 : 0
    const projGasto = hoje.getDate() > 0 ? r.gasto / hoje.getDate() * diasMes : 0
    let zona, corZona
    if (saud != null && pctMeta <= saud) { zona = 'EXTREMAMENTE SAUDÁVEL'; corZona = VERDE_ESCURO }
    else if (alvo != null && pctMeta <= alvo) { zona = 'NO ALVO'; corZona = VERDE }
    else if (pctMeta <= tol) { zona = saud != null ? 'TOLERÁVEL' : 'DENTRO DO TETO'; corZona = LARANJA }
    else { zona = 'ESTOURADO'; corZona = VERMELHO }
    return { ...r, saud, alvo, tol, tolRS, pctMeta, projGasto, zona, corZona }
  }) : []

  async function pedirAnaliseIA() {
    setIaLoading(true)
    setIa(null)
    try {
      const tk = (await supabase.auth.getSession()).data.session?.access_token
      const r = await fetch('https://sdqslzpfbazehqcvibjy.supabase.co/functions/v1/analise-financeira-ia', {
        method: 'POST', headers: { 'Authorization': `Bearer ${tk}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ editor_id: profile.id })
      })
      const j = await r.json()
      if (!j.ok) setIa('⚠ ' + j.error)
      else setIa(j.analise)
    } catch (e) { setIa('⚠ Erro: ' + e.message) }
    setIaLoading(false)
  }

  const card = { background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 14, padding: '1rem 1.25rem' }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 0 40px' }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111', margin: '0 0 2px' }}>🥅 Metas & Saúde Financeira</h2>
      <div style={{ fontSize: 13, color: '#5F5E5A', marginBottom: 14 }}>
        O placar oficial: escada de faturamento do ano e réguas de saúde sobre a meta.
      </div>

      {/* ESCADA DO ANO */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
        {metas.map(m => {
          const d = new Date(m.mes + 'T00:00:00')
          const dreM = dre.find(x => x.mes === m.mes)
          const real = Number(dreM?.receita || 0)
          const pct = Number(m.meta_faturamento) > 0 ? real / Number(m.meta_faturamento) * 100 : 0
          const ehAtual = m.mes === mesIso
          const passado = m.mes < mesIso
          return (
            <div key={m.mes} style={{
              ...card, padding: '10px 14px',
              border: ehAtual ? `1.5px solid ${AZUL}` : card.border,
              background: ehAtual ? '#F7FAFF' : '#fff',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: ehAtual ? AZUL : '#9a9a96' }}>
                {MES_CURTO[d.getMonth()]}/{String(d.getFullYear()).slice(2)}{ehAtual ? ' • agora' : ''}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#111', marginTop: 2 }}>{fmtK(m.meta_faturamento)}</div>
              {(ehAtual || passado) && (
                <div style={{ fontSize: 11, marginTop: 2, color: pct >= 100 ? VERDE : pct >= 70 ? LARANJA : VERMELHO, fontWeight: 600 }}>
                  {fmtK(real)} · {pct.toFixed(0)}%
                </div>
              )}
            </div>
          )
        })}
      </div>

      {!metaMes ? (
        <div style={{ ...card, textAlign: 'center', color: '#9a9a96', fontSize: 13 }}>Sem meta cadastrada pro mês corrente.</div>
      ) : (
        <>
          {/* MÊS CORRENTE */}
          <div style={{ ...card, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
              <b style={{ fontSize: 14 }}>Faturamento de {MES_CURTO[hoje.getMonth()]} — meta {fmtK(metaFat)}</b>
              <span style={{ fontSize: 12.5, color: '#5F5E5A' }}>
                <b style={{ color: receita >= pace ? VERDE : LARANJA }}>{fmt(receita)}</b> ({metaFat > 0 ? (receita / metaFat * 100).toFixed(1) : 0}%)
                · pace esperado: {fmtK(pace)}
                · projeção do mês no ritmo atual: <b style={{ color: projecaoReceita >= metaFat ? VERDE : VERMELHO }}>{fmtK(projecaoReceita)}</b>
              </span>
            </div>
            <div style={{ height: 14, background: 'rgba(0,0,0,0.05)', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
              <div style={{ width: `${Math.min(metaFat > 0 ? receita / metaFat * 100 : 0, 100)}%`, height: '100%', background: VERDE, borderRadius: 8 }} />
              <div style={{ position: 'absolute', left: `${Math.min(fracao * 100, 100)}%`, top: 0, bottom: 0, width: 2, background: '#111', opacity: 0.5 }} />
            </div>
          </div>

          {/* RÉGUAS 3 NÍVEIS */}
          <div style={{ ...card, marginBottom: 14 }}>
            <b style={{ fontSize: 14 }}>Réguas de saúde — % sobre a meta de {fmtK(metaFat)}</b>
            <div style={{ fontSize: 11, color: '#9a9a96', margin: '2px 0 12px' }}>
              🟩 extremamente saudável · 🟢 no alvo · 🟧 tolerável · 🟥 estourado — marcadores na barra mostram os 3 níveis
            </div>
            {reguas.map(r => (
              <div key={r.nome} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3, flexWrap: 'wrap', gap: 4 }}>
                  <span style={{ fontWeight: 600, color: '#374151' }}>
                    {r.nome}
                    <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 700, color: '#fff', background: r.corZona, borderRadius: 6, padding: '2px 7px' }}>{r.zona}</span>
                  </span>
                  <span style={{ color: '#5F5E5A' }}>
                    {fmt(r.gasto)} · <b style={{ color: r.corZona }}>{r.pctMeta.toFixed(1)}%</b> da meta
                    {r.saud != null && <span style={{ color: '#9a9a96' }}> · níveis {r.saud}/{r.alvo}/{r.tol}%</span>}
                    {r.saud == null && <span style={{ color: '#9a9a96' }}> · teto {r.tol}%</span>}
                  </span>
                </div>
                <div style={{ height: 10, background: 'rgba(0,0,0,0.05)', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
                  <div style={{ width: `${Math.min(r.pctMeta / r.tol * 100, 100)}%`, height: '100%', background: r.corZona, borderRadius: 6 }} />
                  {r.saud != null && <div style={{ position: 'absolute', left: `${r.saud / r.tol * 100}%`, top: 0, bottom: 0, width: 2, background: VERDE_ESCURO, opacity: 0.7 }} title={`saudável ${r.saud}%`} />}
                  {r.alvo != null && <div style={{ position: 'absolute', left: `${r.alvo / r.tol * 100}%`, top: 0, bottom: 0, width: 2, background: VERDE, opacity: 0.7 }} title={`alvo ${r.alvo}%`} />}
                </div>
                <div style={{ fontSize: 11, color: '#9a9a96', marginTop: 2 }}>
                  teto do mês: {fmtK(r.tolRS)} · projeção no ritmo atual: <b style={{ color: r.projGasto > r.tolRS ? VERMELHO : '#5F5E5A' }}>{fmtK(r.projGasto)}</b>
                  {r.projGasto > r.tolRS && ' ⚠ estoura no ritmo atual'}
                </div>
              </div>
            ))}
            <div style={{ fontSize: 11, color: '#9a9a96', borderTop: '0.5px solid rgba(0,0,0,0.07)', paddingTop: 8 }}>
              Fixo inclui folha. Marketing inclui tráfego, extras e IA. Variáveis = variável + dívida + sem grupo. Soma dos tetos toleráveis = 78% → margem mínima 22%; no alvo (15/27) margem sobe pra ~33%; extremamente saudável (10/20) → ~45%.
            </div>
          </div>

          {/* ANÁLISE IA */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <b style={{ fontSize: 14 }}>🤖 Análise estratégica por IA</b>
              <button onClick={pedirAnaliseIA} disabled={iaLoading}
                style={{ fontSize: 12.5, fontWeight: 600, padding: '7px 14px', borderRadius: 8, border: `1px solid ${ROXO}`, background: iaLoading ? '#f5f3ff' : '#fff', color: ROXO, cursor: 'pointer' }}>
                {iaLoading ? 'Analisando…' : ia ? '↻ Analisar de novo' : 'Gerar análise'}
              </button>
            </div>
            {ia ? (
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#374151', marginTop: 10, lineHeight: 1.6, background: '#FAFAF8', borderRadius: 10, padding: '12px 14px' }}>{ia}</div>
            ) : (
              <div style={{ fontSize: 12, color: '#9a9a96', marginTop: 8 }}>
                A IA lê a escada de metas, as réguas e a DRE dos últimos meses e devolve: diagnóstico com números, top 3 ações da semana e o maior risco. Clique pra gerar.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
