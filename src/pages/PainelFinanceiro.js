import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// ============================================================
// PAINEL FINANCEIRO KR — O CORAÇÃO DA OPERAÇÃO
//   KPIs do mês · Análise automática · Gráficos · CAC · DRE · Agenda
//   Réguas de data: VENDAS -> data_venda | FATURAMENTO -> data_faturamento
//   | INADIMPLÊNCIA -> data_inadimplencia_dia
// Fontes: v_dashboard_kr, v_dre_mensal, v_fluxo_caixa_projetado,
//         gastos_anuncios, v_clientes_fechados_mes, lotes, finance_requests
// ============================================================

const COR = {
  vendas: '#0F6E56',
  caixa: '#185FA5',
  inad: '#A32D2D',
  neutro: '#5F5E5A',
  verde: '#3B6D11',
  vermelho: '#A32D2D',
  laranja: '#854F0B',
  azul: '#185FA5',
  roxo: '#5B21B6',
}

const fmt = v => `R$ ${Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`
const fmtK = v => {
  const n = Number(v || 0)
  if (Math.abs(n) >= 1000) return `R$ ${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`
  return `R$ ${n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
}
const fmtNum = v => Number(v || 0).toLocaleString('pt-BR')
const fmtPct = v => (v == null ? '—' : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`)

function pad(n) { return String(n).padStart(2, '0') }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

function rangeMes(ano, mes) {
  const ini = new Date(ano, mes, 1)
  const fim = new Date(ano, mes + 1, 0)
  return { ini: ymd(ini), fim: ymd(fim) }
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const mesLabel = (mIso) => { const d = new Date(mIso + 'T00:00:00'); return `${MES_CURTO[d.getMonth()]}/${String(d.getFullYear()).slice(2)}` }

function useIsMobile() {
  const [m, setM] = useState(window.innerWidth <= 768)
  useEffect(() => {
    const h = () => setM(window.innerWidth <= 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return m
}

// ---------- Gráfico de barras mensais (SVG puro: receita × despesa + resultado) ----------
function GraficoMensal({ dados, isMobile }) {
  if (!dados.length) return null
  const W = 700, H = 220, padL = 8, padB = 26, padT = 14
  const n = dados.length
  const grupoW = (W - padL * 2) / n
  const barW = Math.min(26, grupoW / 3)
  const maxV = Math.max(...dados.map(d => Math.max(d.receita, d.despesa)), 1)
  const y = v => padT + (H - padT - padB) * (1 - v / maxV)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {[0.25, 0.5, 0.75, 1].map(f => (
        <line key={f} x1={padL} x2={W - padL} y1={y(maxV * f)} y2={y(maxV * f)} stroke="rgba(0,0,0,0.06)" strokeWidth="1" />
      ))}
      {dados.map((d, i) => {
        const cx = padL + grupoW * i + grupoW / 2
        return (
          <g key={d.mes}>
            <rect x={cx - barW - 2} y={y(d.receita)} width={barW} height={H - padB - y(d.receita)} rx="3" fill={COR.verde} opacity="0.9" />
            <rect x={cx + 2} y={y(d.despesa)} width={barW} height={H - padB - y(d.despesa)} rx="3" fill={COR.vermelho} opacity="0.75" />
            <text x={cx} y={H - 8} textAnchor="middle" fontSize="11" fill="#9a9a96">{mesLabel(d.mes)}</text>
            {!isMobile && d.receita > 0 && (
              <text x={cx - barW / 2 - 2} y={y(d.receita) - 4} textAnchor="middle" fontSize="9.5" fill={COR.verde} fontWeight="600">{fmtK(d.receita)}</text>
            )}
          </g>
        )
      })}
      {/* linha do resultado */}
      <polyline
        fill="none" stroke={COR.azul} strokeWidth="2" strokeDasharray="4 3"
        points={dados.map((d, i) => `${padL + grupoW * i + grupoW / 2},${y(Math.max(d.resultado, 0))}`).join(' ')}
      />
      {dados.map((d, i) => (
        <circle key={'c' + d.mes} cx={padL + grupoW * i + grupoW / 2} cy={y(Math.max(d.resultado, 0))} r="3.5"
          fill={d.resultado >= 0 ? COR.azul : COR.vermelho} />
      ))}
    </svg>
  )
}

// ---------- Sparkline (SVG) ----------
function Sparkline({ pontos, cor = COR.azul, altura = 42 }) {
  const vals = pontos.filter(p => p != null)
  if (vals.length < 2) return <div style={{ fontSize: 11, color: '#9a9a96' }}>histórico insuficiente</div>
  const W = 160, H = altura, mx = Math.max(...vals), mn = Math.min(...vals)
  const range = mx - mn || 1
  const pts = pontos.map((v, i) => v == null ? null : `${(W / (pontos.length - 1)) * i},${H - 6 - (H - 12) * ((v - mn) / range)}`).filter(Boolean)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 180, height: altura }}>
      <polyline fill="none" stroke={cor} strokeWidth="2" points={pts.join(' ')} />
      <circle cx={pts[pts.length - 1].split(',')[0]} cy={pts[pts.length - 1].split(',')[1]} r="3" fill={cor} />
    </svg>
  )
}

// ---------- Composição de despesa (barras horizontais, % sobre o FATURAMENTO) ----------
function Composicao({ itens, receita }) {
  const total = itens.reduce((s, x) => s + x.valor, 0)
  if (total <= 0) return <div style={{ fontSize: 12, color: '#9a9a96', padding: '8px 0' }}>Nenhuma despesa classificada neste mês ainda.</div>
  const temReceita = Number(receita || 0) > 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {itens.filter(x => x.valor > 0).sort((a, b) => b.valor - a.valor).map(x => {
        const pctRec = temReceita ? x.valor / receita * 100 : null
        const pctDesp = total > 0 ? x.valor / total * 100 : 0
        const barra = temReceita ? Math.min(pctRec, 100) : pctDesp
        return (
          <div key={x.nome}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
              <span style={{ color: '#374151', fontWeight: 600 }}>{x.nome}</span>
              <span style={{ color: '#5F5E5A' }}>
                {fmt(x.valor)} · <b style={{ color: '#111' }}>{temReceita ? `${pctRec.toFixed(1)}% da receita` : `${pctDesp.toFixed(1)}% da despesa`}</b>
              </span>
            </div>
            <div style={{ height: 8, background: 'rgba(0,0,0,0.05)', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ width: `${barra}%`, height: '100%', background: x.cor, borderRadius: 6 }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function PainelFinanceiro() {
  const { profile } = useAuth()
  const isMobile = useIsMobile()
  const [linhas, setLinhas] = useState([])
  const [loading, setLoading] = useState(true)

  const hoje = new Date()
  // Seletores INDEPENDENTES por métrica (mantidos)
  const [vendaMes, setVendaMes] = useState(hoje.getMonth())
  const [vendaAno, setVendaAno] = useState(hoje.getFullYear())
  const [caixaMes, setCaixaMes] = useState(hoje.getMonth())
  const [caixaAno, setCaixaAno] = useState(hoje.getFullYear())
  const [inadMes, setInadMes] = useState(hoje.getMonth())
  const [inadAno, setInadAno] = useState(hoje.getFullYear())
  const [repMes, setRepMes] = useState(hoje.getMonth())
  const [repAno, setRepAno] = useState(hoje.getFullYear())
  const [produtoSel, setProdutoSel] = useState('Todos')
  const [gastos, setGastos] = useState([])
  const [fechadosMes, setFechadosMes] = useState([])
  const [sincronizando, setSincronizando] = useState(false)
  const [custoMes, setCustoMes] = useState(hoje.getMonth())
  const [custoAno, setCustoAno] = useState(hoje.getFullYear())

  // Novos: DRE, agenda e pulso de caixa por período
  const [dre, setDre] = useState([])
  const [agenda, setAgenda] = useState([])
  const [metas, setMetas] = useState(null)
  const [periodo, setPeriodo] = useState('mes') // hoje | semana | mes | perso
  const [persoIni, setPersoIni] = useState(ymd(new Date(hoje.getFullYear(), hoje.getMonth(), 1)))
  const [persoFim, setPersoFim] = useState(ymd(hoje))
  const [pulso, setPulso] = useState(null)
  const [detalhe, setDetalhe] = useState(null) // receita | despesa | resultado | cac | mkt | agenda

  const podeVer = profile && (profile.role === 'admin' || profile.role === 'analista')

  useEffect(() => {
    if (!podeVer) { setLoading(false); return }
    supabase.from('v_dashboard_kr').select('*').then(({ data, error }) => {
      if (error) console.error('Erro view dashboard:', error)
      setLinhas(data || [])
      setLoading(false)
    })
    supabase.from('gastos_anuncios').select('*').then(({ data }) => setGastos(data || []))
    supabase.from('v_clientes_fechados_mes').select('*').then(({ data }) => setFechadosMes(data || []))
    supabase.from('v_dre_mensal').select('*').order('mes', { ascending: true }).then(({ data }) => setDre(data || []))
    supabase.from('v_fluxo_caixa_projetado').select('*').order('data_vencimento').then(({ data }) => setAgenda(data || []))
    supabase.from('metas_financeiras').select('*').order('mes', { ascending: false }).limit(1).then(({ data }) => setMetas(data && data[0] ? data[0] : null))
  }, [profile])

  // Pulso de caixa: o que ENTROU e SAIU no período selecionado (dia/semana/mês/personalizado)
  useEffect(() => {
    if (!podeVer) return
    const h = new Date(); h.setHours(0, 0, 0, 0)
    let ini, fim
    if (periodo === 'hoje') { ini = ymd(h); fim = ymd(h) }
    else if (periodo === 'semana') { const s = new Date(h); s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); ini = ymd(s); fim = ymd(h) }
    else if (periodo === 'mes') { ini = ymd(new Date(h.getFullYear(), h.getMonth(), 1)); fim = ymd(h) }
    else { ini = persoIni; fim = persoFim }
    ;(async () => {
      const [{ data: ent }, { data: sai }] = await Promise.all([
        supabase.from('lotes').select('valor_total').eq('status_pagamento', 'pago').gte('data_pagamento', ini).lte('data_pagamento', fim + 'T23:59:59'),
        supabase.from('finance_requests').select('valor').eq('status', 'pago').gte('pago_em', ini).lte('pago_em', fim + 'T23:59:59'),
      ])
      const entrou = (ent || []).reduce((s, l) => s + Number(l.valor_total || 0), 0)
      const saiu = (sai || []).reduce((s, r) => s + Number(r.valor || 0), 0)
      setPulso({ ini, fim, entrou, saiu, qtdEnt: (ent || []).length, qtdSai: (sai || []).length })
    })()
  }, [periodo, persoIni, persoFim, podeVer])

  // ======= HOOK-FREE a partir daqui (early returns) =======
  if (!podeVer) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '2rem' }}>
        <div style={{ background: '#fff', borderRadius: 14, padding: '2rem', maxWidth: 420, textAlign: 'center', border: '0.5px solid rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 6 }}>Acesso restrito</div>
          <div style={{ fontSize: 13, color: '#5F5E5A' }}>Apenas administração tem acesso ao painel financeiro.</div>
        </div>
      </div>
    )
  }
  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#5F5E5A' }}>Carregando painel financeiro…</div>
  }

  async function sincronizarGastos() {
    setSincronizando(true)
    try {
      const ANON = process.env.REACT_APP_SUPABASE_ANON_KEY || (await supabase.auth.getSession()).data.session?.access_token
      const r = await fetch('https://sdqslzpfbazehqcvibjy.supabase.co/functions/v1/sincronizar-gastos-meta', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ano: custoAno, mes: custoMes + 1, editor_id: profile.id })
      })
      const j = await r.json()
      if (!j.ok) { alert('Erro ao sincronizar: ' + (j.error || (j.erros && j.erros.map(e => e.conta + ': ' + e.erro).join(' | ')) || 'falhou')) }
      else { alert(`Gastos sincronizados! Total com imposto: R$ ${Number(j.total_com_imposto).toLocaleString('pt-BR')}`) }
      const { data } = await supabase.from('gastos_anuncios').select('*')
      setGastos(data || [])
      const { data: fc } = await supabase.from('v_clientes_fechados_mes').select('*')
      setFechadosMes(fc || [])
      const { data: d2 } = await supabase.from('v_dre_mensal').select('*').order('mes', { ascending: true })
      setDre(d2 || [])
    } catch (e) { alert('Erro: ' + e.message) }
    setSincronizando(false)
  }

  // ---- Filtro de produto (mantido) ----
  const base = produtoSel === 'Todos' ? linhas : linhas.filter(l => l.produto === produtoSel)
  const produtosDisponiveis = Array.from(new Set(linhas.map(l => l.produto).filter(Boolean))).sort()

  // ---- VENDAS (competência) ----
  const rVenda = rangeMes(vendaAno, vendaMes)
  const vendasLin = base.filter(l =>
    l.eh_venda_viva && !l.eh_reposicao &&
    l.data_venda && l.data_venda >= rVenda.ini && l.data_venda <= rVenda.fim
  )
  const vendas = {
    lotes: vendasLin.length,
    contratos: vendasLin.reduce((s, l) => s + Number(l.total_contratos || 0), 0),
    valor: vendasLin.reduce((s, l) => s + Number(l.valor_total || 0), 0),
  }

  // ---- FATURAMENTO (caixa) ----
  const rCaixa = rangeMes(caixaAno, caixaMes)
  const caixaLin = base.filter(l =>
    l.eh_pago && l.data_faturamento &&
    l.data_faturamento >= rCaixa.ini && l.data_faturamento <= rCaixa.fim
  )
  const caixa = {
    lotes: caixaLin.length,
    contratos: caixaLin.reduce((s, l) => s + Number(l.total_contratos || 0), 0),
    valor: caixaLin.reduce((s, l) => s + Number(l.valor_total || 0), 0),
  }

  // ---- INADIMPLÊNCIA ----
  const rInad = rangeMes(inadAno, inadMes)
  const inadLin = base.filter(l =>
    l.eh_inadimplente && l.data_inadimplencia_dia &&
    l.data_inadimplencia_dia >= rInad.ini && l.data_inadimplencia_dia <= rInad.fim
  )
  const inad = {
    lotes: inadLin.length,
    contratos: inadLin.reduce((s, l) => s + Number(l.total_contratos || 0), 0),
    valor: inadLin.reduce((s, l) => s + Number(l.valor_total || 0), 0),
  }
  const inadTotal = base.filter(l => l.eh_inadimplente)
  const inadTotalValor = inadTotal.reduce((s, l) => s + Number(l.valor_total || 0), 0)

  // ---- REPOSIÇÕES ----
  const rRep = rangeMes(repAno, repMes)
  const repLin = base.filter(l =>
    l.eh_reposicao_aprovada && l.data_aprovacao_dia &&
    l.data_aprovacao_dia >= rRep.ini && l.data_aprovacao_dia <= rRep.fim
  )
  const rep = {
    lotes: repLin.length,
    contratos: repLin.reduce((s, l) => s + Number(l.total_contratos || 0), 0),
  }
  const repTotal = base.filter(l => l.eh_reposicao_aprovada)
  const repTotalContratos = repTotal.reduce((s, l) => s + Number(l.total_contratos || 0), 0)

  // ---- Régua de reposição ----
  const fechadosRepMes = fechadosMes
    .filter(f => f.ano === repAno && f.mes === (repMes + 1))
    .reduce((s, f) => s + Number(f.clientes_fechados || 0), 0)
  const repPct = fechadosRepMes > 0 ? (rep.contratos / fechadosRepMes * 100) : 0
  const repTetoAlerta = Math.floor(fechadosRepMes * 0.15)
  const repTetoBloqueio = Math.floor(fechadosRepMes * 0.20)
  const repSituacao = fechadosRepMes === 0 ? 'sem_base'
    : repPct > 20 ? 'bloqueio'
    : repPct >= 15 ? 'alerta'
    : 'ok'
  const repCorRegua = repSituacao === 'bloqueio' ? '#A32D2D'
    : repSituacao === 'alerta' ? '#854F0B'
    : '#3B6D11'
  const repPctTeto = Math.min(repPct / 20 * 100, 100)

  // ---- CUSTO DE ANÚNCIO / CAC (mantido) ----
  const custoLin = gastos.filter(g => g.ano === custoAno && g.mes === (custoMes + 1))
  const custoTotal = custoLin.reduce((s, g) => s + Number(g.gasto_total || 0), 0)
  const custoLiquido = custoLin.reduce((s, g) => s + Number(g.gasto_liquido || 0), 0)
  const custoSincronizadoEm = custoLin.length ? custoLin.map(g => g.sincronizado_em).sort().reverse()[0] : null
  const rCusto = rangeMes(custoAno, custoMes)
  const fechadosDoMes = fechadosMes.filter(f => f.ano === custoAno && f.mes === (custoMes + 1))
  const totalFechadosTodos = fechadosDoMes.reduce((s, f) => s + Number(f.clientes_fechados || 0), 0)
  const reposicoesDoMes = linhas.filter(l => l.eh_reposicao_aprovada && l.data_aprovacao_dia && l.data_aprovacao_dia >= rCusto.ini && l.data_aprovacao_dia <= rCusto.fim)
  const totalRepostosTodos = reposicoesDoMes.reduce((s, l) => s + Number(l.total_contratos || 0), 0)
  const baseTodos = totalFechadosTodos
  let clientesFechadosCusto, reposicoesCusto, baseAquisicao, custoRateado
  if (produtoSel === 'Todos') {
    clientesFechadosCusto = totalFechadosTodos
    reposicoesCusto = totalRepostosTodos
    baseAquisicao = baseTodos
    custoRateado = custoTotal
  } else {
    clientesFechadosCusto = fechadosDoMes.filter(f => f.produto === produtoSel).reduce((s, f) => s + Number(f.clientes_fechados || 0), 0)
    reposicoesCusto = reposicoesDoMes.filter(l => l.produto === produtoSel).reduce((s, l) => s + Number(l.total_contratos || 0), 0)
    baseAquisicao = clientesFechadosCusto
    custoRateado = baseTodos > 0 ? custoTotal * (baseAquisicao / baseTodos) : 0
  }
  const cac = baseAquisicao > 0 ? custoRateado / baseAquisicao : 0

  // ---- CAC por mês (sparkline): gasto total do mês ÷ fechados do mês ----
  const cacSerie = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    const g = gastos.filter(x => x.ano === d.getFullYear() && x.mes === d.getMonth() + 1)
      .reduce((s, x) => s + Number(x.gasto_total || 0), 0)
    const f = fechadosMes.filter(x => x.ano === d.getFullYear() && x.mes === d.getMonth() + 1)
      .reduce((s, x) => s + Number(x.clientes_fechados || 0), 0)
    cacSerie.push(f > 0 ? g / f : null)
  }

  // ---- DRE: mês corrente, anterior e últimos 6 pro gráfico ----
  const mesIsoAtual = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-01`
  const dreAtual = dre.find(d => d.mes === mesIsoAtual) || {}
  const dAnt = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
  const mesIsoAnterior = `${dAnt.getFullYear()}-${pad(dAnt.getMonth() + 1)}-01`
  const dreAnterior = dre.find(d => d.mes === mesIsoAnterior) || {}
  const dre6 = dre.slice(-6).map(d => ({
    mes: d.mes,
    receita: Number(d.receita || 0),
    despesa: Number(d.despesa_total || 0),
    resultado: Number(d.resultado || 0),
  }))

  // ---- Agenda: atrasadas e próximos 7 dias ----
  const h0 = new Date(); h0.setHours(0, 0, 0, 0)
  const dv = s => new Date(s + 'T00:00:00')
  const em7 = new Date(h0); em7.setDate(em7.getDate() + 7)
  const atrasadas = agenda.filter(x => x.origem === 'lancamento' && dv(x.data_vencimento) < h0)
  const prox7 = agenda.filter(x => dv(x.data_vencimento) >= h0 && dv(x.data_vencimento) < em7)
  const somaV = arr => arr.reduce((s, x) => s + Number(x.valor || 0), 0)

  // ============================================================
  // METAS DO MÊS — réguas oficiais da KR sobre o faturamento
  //   fixo+folha ≤ teto_fixo · marketing ≤ teto_mkt · comissão ≤ teto_com
  //   imposto ≤ teto_imp · variável+dívida+sem grupo ≤ teto_var
  // ============================================================
  const metaFat = metas ? Number(metas.meta_faturamento || 0) : 0
  const receitaAtual = Number(dreAtual.receita || 0)
  const diasMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate()
  const paceEsperado = metaFat > 0 ? metaFat * (hoje.getDate() / diasMes) : 0
  const reguas = metas ? [
    { nome: 'Fixo (c/ folha)', gasto: Number(dreAtual.fixo || 0) + folhaMes - Number(dreAtual.comissao || 0), tetoPct: Number(metas.teto_fixo_pct), cor: COR.laranja },
    { nome: 'Marketing (c/ IA)', gasto: Number(dreAtual.marketing_total || 0), tetoPct: Number(metas.teto_marketing_pct), cor: COR.azul },
    { nome: 'Comissão', gasto: Number(dreAtual.comissao || 0), tetoPct: Number(metas.teto_comissao_pct), cor: COR.roxo },
    { nome: 'Imposto', gasto: Number(dreAtual.imposto || 0), tetoPct: Number(metas.teto_imposto_pct), cor: '#6b7280' },
    { nome: 'Variáveis (resto)', gasto: Number(dreAtual.variavel || 0) + Number(dreAtual.divida || 0) + Number(dreAtual.sem_grupo || 0), tetoPct: Number(metas.teto_variavel_pct), cor: '#0F6E56' },
  ].map(r => {
    const tetoRS = metaFat * r.tetoPct / 100
    const usoPct = tetoRS > 0 ? r.gasto / tetoRS * 100 : 0
    return { ...r, tetoRS, usoPct, pctReceita: receitaAtual > 0 ? r.gasto / receitaAtual * 100 : null }
  }) : []

  // ============================================================
  // ANÁLISE AUTOMÁTICA — motor de regras sobre os dados do mês
  // ============================================================
  const alertas = []
  const add = (nivel, texto, acao) => alertas.push({ nivel, texto, acao })
  const receitaMes = Number(dreAtual.receita || 0)
  const folhaMes = Number(dreAtual.folha || 0) + Number(dreAtual.comissao || 0)
  const fixoMes = Number(dreAtual.fixo || 0)
  const semGrupoMes = Number(dreAtual.sem_grupo || 0)
  const pctMkt = dreAtual.pct_marketing != null ? Number(dreAtual.pct_marketing) : null
  const resultadoMes = Number(dreAtual.resultado || 0)

  if (atrasadas.length > 0)
    add('critico', `${atrasadas.length} conta(s) VENCIDA(s) sem pagamento — ${fmt(somaV(atrasadas))} em atraso.`, 'Pagar hoje na aba Financeiro → Pagar.')
  if (folhaMes === 0)
    add('critico', 'Folha/comissão do mês está em R$ 0 — o resultado exibido está superestimado.', 'Fábio precisa cadastrar a folha em Financeiro → Fixas & Recorrentes.')
  if (fixoMes === 0)
    add('aviso', 'Nenhum custo fixo lançado neste mês (aluguel, softwares...).', 'Cadastrar os fixos como recorrentes.')
  if (resultadoMes < 0)
    add('critico', `Resultado do mês NEGATIVO: ${fmt(resultadoMes)}.`, 'Revisar despesas e pace de receita.')
  if (pctMkt != null && pctMkt > 50)
    add('critico', `Marketing consumindo ${fmtPct(pctMkt)} da receita — acima de 50%.`, 'Rever campanhas / verba antes de escalar.')
  else if (pctMkt != null && pctMkt >= 35)
    add('aviso', `Marketing em ${fmtPct(pctMkt)} da receita (teto saudável ~35%).`, 'Acompanhar CAC de perto esta semana.')
  // CAC vs mês anterior
  const cacAtualSerie = cacSerie[cacSerie.length - 1]
  const cacAntSerie = cacSerie[cacSerie.length - 2]
  if (cacAtualSerie != null && cacAntSerie != null && cacAntSerie > 0 && (cacAtualSerie - cacAntSerie) / cacAntSerie > 0.15)
    add('aviso', `CAC subiu ${fmtPct((cacAtualSerie - cacAntSerie) / cacAntSerie * 100)} vs mês anterior (${fmt(cacAntSerie)} → ${fmt(cacAtualSerie)}).`, 'Investigar criativos/campanhas que pioraram.')
  // grupo que existia e sumiu
  ;[['folha', 'Folha'], ['fixo', 'Fixo'], ['imposto', 'Imposto'], ['divida', 'Dívida']].forEach(([k, nome]) => {
    if (Number(dreAnterior[k] || 0) > 0 && Number(dreAtual[k] || 0) === 0)
      add('aviso', `${nome} tinha ${fmt(dreAnterior[k])} no mês passado e está R$ 0 neste — esqueceram de lançar?`, 'Conferir lançamentos do mês.')
  })
  if (semGrupoMes > 0)
    add('aviso', `${fmt(semGrupoMes)} em despesas SEM classificação de grupo.`, 'Classificar pra não sujar as porcentagens.')
  // Inadimplência: NÃO é despesa (é receita que não entrou; não soma no resultado).
  // Alerta compara a inadimplência NOVA do mês com a receita do mesmo mês (régua igual).
  const rMesCorrente = rangeMes(hoje.getFullYear(), hoje.getMonth())
  const inadNovaMes = base
    .filter(l => l.eh_inadimplente && l.data_inadimplencia_dia && l.data_inadimplencia_dia >= rMesCorrente.ini && l.data_inadimplencia_dia <= rMesCorrente.fim)
    .reduce((s, l) => s + Number(l.valor_total || 0), 0)
  if (receitaMes > 0 && inadNovaMes / receitaMes > 0.1)
    add('aviso', `Inadimplência nova neste mês: ${fmt(inadNovaMes)} (${fmtPct(inadNovaMes / receitaMes * 100)} da receita do mês). Acumulado em aberto: ${fmt(inadTotalValor)}. Obs: inadimplência não entra como despesa — é venda que não virou caixa.`, 'Acionar cobrança dos lotes vencidos.')
  // Metas: estouro e proximidade de teto
  reguas.forEach(r => {
    if (r.usoPct > 100)
      add('critico', `META ESTOURADA — ${r.nome}: ${fmt(r.gasto)} já passou o teto de ${fmt(r.tetoRS)} (${r.tetoPct}% da meta de ${fmtK(metaFat)}).`, 'Frear essa categoria ou revisar a meta.')
    else if (r.usoPct >= 80)
      add('aviso', `${r.nome} em ${r.usoPct.toFixed(0)}% do teto do mês (${fmt(r.gasto)} de ${fmt(r.tetoRS)}).`, 'Acompanhar antes de estourar.')
  })
  if (metaFat > 0 && receitaAtual < paceEsperado * 0.85)
    add('aviso', `Receita abaixo do pace da meta: ${fmt(receitaAtual)} vs ${fmt(paceEsperado)} esperado pra hoje (meta ${fmtK(metaFat)}).`, 'Acelerar vendas/cobrança pra não perder o mês.')
  if (!alertas.length)
    add('ok', 'Nenhum alerta crítico. Números do mês dentro dos parâmetros.', '')

  const NIVEL_STYLE = {
    critico: { bg: '#FCEBEB', borda: '#A32D2D', icone: '🔴' },
    aviso: { bg: '#FAEEDA', borda: '#854F0B', icone: '🟠' },
    ok: { bg: '#EAF3DE', borda: '#3B6D11', icone: '🟢' },
  }

  const anos = [hoje.getFullYear(), hoje.getFullYear() - 1]

  function Seletor({ mes, setMes, ano, setAno, cor }) {
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <select value={mes} onChange={e => setMes(Number(e.target.value))}
          style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: `1px solid ${cor}40`, color: cor, fontWeight: 600, background: '#fff' }}>
          {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select value={ano} onChange={e => setAno(Number(e.target.value))}
          style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: `1px solid ${cor}40`, color: cor, fontWeight: 600, background: '#fff' }}>
          {anos.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
    )
  }

  function Card({ titulo, subtitulo, cor, seletor, contratos, lotes, valor, rodape }) {
    return (
      <div style={{ background: '#fff', borderRadius: 14, padding: isMobile ? '1rem' : '1.25rem', border: '0.5px solid rgba(0,0,0,0.1)', borderTop: `3px solid ${cor}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, gap: 8, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: cor }}>{titulo}</div>
            <div style={{ fontSize: 11, color: '#9a9a96' }}>{subtitulo}</div>
          </div>
          {seletor}
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#111', marginTop: 10 }}>{fmt(valor)}</div>
        <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: cor }}>{fmtNum(contratos)}</div>
            <div style={{ fontSize: 11, color: '#9a9a96' }}>contratos</div>
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#5F5E5A' }}>{fmtNum(lotes)}</div>
            <div style={{ fontSize: 11, color: '#9a9a96' }}>pedidos</div>
          </div>
        </div>
        {rodape && <div style={{ fontSize: 11, color: '#9a9a96', marginTop: 10, paddingTop: 8, borderTop: '0.5px solid rgba(0,0,0,0.07)' }}>{rodape}</div>}
      </div>
    )
  }

  const kpi = (titulo, valor, cor, sub, chave) => (
    <button onClick={() => chave && setDetalhe(detalhe === chave ? null : chave)}
      style={{
        background: detalhe === chave ? '#F7FAFF' : '#fff', borderRadius: 14, padding: '14px 16px',
        border: detalhe === chave ? `1.5px solid ${cor}` : '0.5px solid rgba(0,0,0,0.1)',
        borderTop: `3px solid ${cor}`, textAlign: 'left', cursor: chave ? 'pointer' : 'default', width: '100%',
      }}>
      <div style={{ fontSize: 11, color: '#9a9a96', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.4px' }}>{titulo}</div>
      <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700, color: cor, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{valor}</div>
      {sub && <div style={{ fontSize: 11, color: '#9a9a96', marginTop: 2 }}>{sub}</div>}
      {chave && <div style={{ fontSize: 10, color: detalhe === chave ? cor : '#c4c4c0', marginTop: 4, fontWeight: 700 }}>{detalhe === chave ? '▴ fechar' : '▾ detalhar'}</div>}
    </button>
  )

  const secao = (titulo, extra) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '22px 0 10px' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>{titulo}</div>
      {extra}
    </div>
  )

  const pill = (ativo) => ({
    background: ativo ? COR.azul : '#fff', color: ativo ? '#fff' : '#555',
    border: `1px solid ${ativo ? COR.azul : 'rgba(0,0,0,0.15)'}`, borderRadius: 20,
    padding: '5px 13px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
  })

  return (
    <div style={{ padding: isMobile ? '1rem' : '1.5rem', maxWidth: 1100, margin: '0 auto' }}>
      {/* HEADER */}
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111', margin: 0 }}>Painel Financeiro</h1>
          <p style={{ fontSize: 13, color: '#5F5E5A', margin: '4px 0 0' }}>
            O coração da operação — receita, custo, CAC e caixa num lugar só.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: '#9a9a96', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Produto</label>
          <select value={produtoSel} onChange={e => setProdutoSel(e.target.value)}
            style={{ fontSize: 13, padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.2)', color: '#111', fontWeight: 600, background: '#fff', cursor: 'pointer', minWidth: 180 }}>
            <option value="Todos">Todos os produtos</option>
            {produtosDisponiveis.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {/* KPIs DO MÊS — clique pra detalhar */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(6, 1fr)', gap: 10 }}>
        {kpi('Receita (mês)', fmtK(dreAtual.receita), COR.verde, `${MES_CURTO[hoje.getMonth()]} até hoje`, 'receita')}
        {kpi('Despesa oper. (mês)', fmtK(dreAtual.despesa_operacional), COR.vermelho, fmtPct(dreAtual.pct_operacional) + ' da receita · detalhes em Despesas & Custos', null)}
        {kpi('Marketing (invest.)', fmtK(dreAtual.marketing_total), pctMkt > 50 ? COR.vermelho : pctMkt >= 35 ? COR.laranja : COR.azul, fmtPct(dreAtual.pct_marketing) + ' da receita', 'mkt')}
        {kpi('CAC (mês sel.)', cac > 0 ? fmt(cac) : '—', COR.azul, `${fmtNum(baseAquisicao)} adquiridos`, 'cac')}
        {kpi('A sair (7 dias)', fmtK(somaV(prox7)), atrasadas.length ? COR.vermelho : COR.laranja, atrasadas.length ? `${atrasadas.length} ATRASADA(S)!` : `${prox7.length} conta(s)`, 'agenda')}
        {kpi('Resultado', fmtK(dreAtual.resultado), Number(dreAtual.resultado || 0) >= 0 ? COR.verde : COR.vermelho, folhaMes === 0 ? '⚠ sem folha ainda' : 'desconta tudo, incl. mkt', 'resultado')}
      </div>

      {/* PAINEL DE DETALHE do KPI clicado */}
      {detalhe && (
        <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 14, padding: '1rem 1.25rem', marginTop: 10 }}>
          {detalhe === 'receita' && (() => {
            const pagosMes = base.filter(l => l.eh_pago && l.data_faturamento && l.data_faturamento >= rMesCorrente.ini && l.data_faturamento <= rMesCorrente.fim)
              .sort((a, b) => (b.data_faturamento || '').localeCompare(a.data_faturamento || ''))
            return (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Receita do mês — {pagosMes.length} lote(s) pago(s), {fmt(pagosMes.reduce((s, l) => s + Number(l.valor_total || 0), 0))}</div>
                {pagosMes.length === 0 ? <div style={{ fontSize: 12, color: '#9a9a96' }}>Nenhum lote pago neste mês ainda.</div>
                  : pagosMes.slice(0, 25).map((l, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '5px 0', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                      <span style={{ color: '#374151' }}>{(l.data_faturamento || '').split('-').reverse().join('/')} · {l.produto || '—'} · {fmtNum(l.total_contratos)} contrato(s)</span>
                      <b>{fmt(l.valor_total)}</b>
                    </div>
                  ))}
                {pagosMes.length > 25 && <div style={{ fontSize: 11, color: '#9a9a96', marginTop: 6 }}>+ {pagosMes.length - 25} lotes (recorte dos 25 maiores/recentes)</div>}
              </>
            )
          })()}
          {detalhe === 'resultado' && (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Como o resultado é calculado ({MES_CURTO[hoje.getMonth()]})</div>
              {[
                ['Receita (lotes pagos)', dreAtual.receita, COR.verde],
                ['− Marketing (tráfego + extra)', dreAtual.marketing_total, COR.azul],
                ['− Folha + Comissão', folhaMes, COR.roxo],
                ['− Fixo', dreAtual.fixo, COR.laranja],
                ['− Variável', dreAtual.variavel, '#0F6E56'],
                ['− Imposto', dreAtual.imposto, '#6b7280'],
                ['− Dívida', dreAtual.divida, COR.vermelho],
                ['− Sem grupo', dreAtual.sem_grupo, '#9ca3af'],
              ].map(([lbl, v, c]) => (
                <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0' }}>
                  <span style={{ color: c, fontWeight: 600 }}>{lbl}</span><b>{fmt(v)}</b>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, padding: '8px 0 2px', borderTop: '2px solid rgba(0,0,0,0.08)', marginTop: 4 }}>
                <b>= Resultado</b>
                <b style={{ color: Number(dreAtual.resultado || 0) >= 0 ? '#15803d' : '#b91c1c' }}>{fmt(dreAtual.resultado)}</b>
              </div>
              <div style={{ fontSize: 11, color: '#9a9a96', marginTop: 6 }}>Inadimplência NÃO entra aqui — é receita que não virou caixa, não despesa. Acumulado em aberto: {fmt(inadTotalValor)}.</div>
            </>
          )}
          {detalhe === 'cac' && (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Como o CAC é calculado ({MESES[custoMes]})</div>
              <div style={{ fontSize: 12.5, color: '#374151', lineHeight: 1.8 }}>
                Gasto de anúncio com imposto: <b>{fmt(custoTotal)}</b> (líquido {fmt(custoLiquido)} + 13%)<br />
                Clientes fechados no mês (validados/assinados, sem barrados/cancelados): <b>{fmtNum(totalFechadosTodos)}</b><br />
                {produtoSel !== 'Todos' && (<>Filtro {produtoSel}: {fmtNum(baseAquisicao)} fechados → gasto rateado {fmt(custoRateado)}<br /></>)}
                Reposições aprovadas no mês: <b>{fmtNum(reposicoesCusto)}</b> — fora do denominador (o reposto conta quando valida)<br />
                <b style={{ color: COR.azul }}>CAC = {fmt(custoRateado)} ÷ {fmtNum(baseAquisicao)} = {cac > 0 ? fmt(cac) : '—'}</b> · parcial (só anúncio, sem folha)
              </div>
            </>
          )}
          {detalhe === 'mkt' && (() => {
            const contasMes = gastos.filter(g => g.ano === hoje.getFullYear() && g.mes === hoje.getMonth() + 1)
            const temReceita = receitaMes > 0
            const linhaSub = (nome, cor, total) => total > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: `${cor}12`, borderLeft: `4px solid ${cor}`, borderRadius: 8, padding: '8px 12px', marginBottom: 6 }}>
                <b style={{ fontSize: 13, color: cor }}>{nome}</b>
                <span style={{ fontSize: 12.5 }}>
                  <b>{fmt(total)}</b>
                  {temReceita && <span style={{ color: '#5F5E5A' }}> · {fmtPct(total / receitaMes * 100)} da receita</span>}
                </span>
              </div>
            )
            return (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
                  Marketing (investimento em aquisição) — {fmt(dreAtual.marketing_total)} ({fmtPct(dreAtual.pct_marketing)} da receita)
                </div>
                {linhaSub('🎯 Captação (tráfego, disparos)', COR.azul, Number(dreAtual.marketing_captacao || 0))}
                {contasMes.map((g, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 12px', color: '#374151' }}>
                    <span>{g.conta_nome || g.conta_id} — tráfego Meta c/ 13% imposto</span><span>{fmt(g.gasto_total)}</span>
                  </div>
                ))}
                {linhaSub('🎬 Estrutura (video maker, design, conteúdo)', COR.roxo, Number(dreAtual.marketing_estrutura || 0))}
                {Number(dreAtual.marketing_estrutura || 0) === 0 && (
                  <div style={{ fontSize: 11.5, color: '#9a9a96' }}>Estrutura zerada — lance como Marketing → Estrutura no Financeiro.</div>
                )}
                <div style={{ fontSize: 11, color: '#9a9a96', marginTop: 8 }}>
                  Lançamento a lançamento fica na tela Despesas & Custos. Marketing é investimento na leitura, mas segue descontado no Resultado.
                </div>
              </>
            )
          })()}
          {detalhe === 'agenda' && (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Contas a sair — atrasadas ({atrasadas.length}) e próximos 7 dias ({prox7.length})</div>
              {[...atrasadas, ...prox7].map((x, i) => {
                const atr = x.origem === 'lancamento' && dv(x.data_vencimento) < h0
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '5px 0', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                    <span style={{ color: atr ? COR.vermelho : '#374151', fontWeight: atr ? 700 : 400 }}>
                      {x.data_vencimento.split('-').reverse().join('/')} · {(x.descricao || '—').slice(0, 55)}{atr ? ' · ATRASADA' : ''}{x.origem === 'projecao' ? ' · projeção' : ''}
                    </span>
                    <b style={{ color: atr ? COR.vermelho : '#111' }}>{fmt(x.valor)}</b>
                  </div>
                )
              })}
              {!atrasadas.length && !prox7.length && <div style={{ fontSize: 12, color: '#9a9a96' }}>Nada vencendo nos próximos 7 dias.</div>}
            </>
          )}
        </div>
      )}

      {/* ANÁLISE AUTOMÁTICA */}
      {secao('🧠 Análise automática', <span style={{ fontSize: 11, color: '#9a9a96' }}>regras sobre os dados do mês — recalcula a cada acesso</span>)}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {alertas.map((a, i) => {
          const s = NIVEL_STYLE[a.nivel]
          return (
            <div key={i} style={{ background: s.bg, border: `1px solid ${s.borda}30`, borderLeft: `4px solid ${s.borda}`, borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 14 }}>{s.icone}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: '#111', fontWeight: 600 }}>{a.texto}</div>
                {a.acao && <div style={{ fontSize: 12, color: '#5F5E5A', marginTop: 2 }}>→ {a.acao}</div>}
              </div>
            </div>
          )
        })}
      </div>

      {/* METAS DO MÊS */}
      {metas && (
        <>
          {secao('🎯 Metas do mês', <span style={{ fontSize: 11, color: '#9a9a96' }}>meta {fmtK(metaFat)} · réguas {reguas.map(r => r.tetoPct + '%').join(' / ')}</span>)}
          <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 14, padding: '1rem 1.25rem' }}>
            {/* Faturamento vs meta */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                <b style={{ color: '#111' }}>Faturamento</b>
                <span style={{ color: '#5F5E5A' }}>
                  <b style={{ color: receitaAtual >= paceEsperado ? COR.verde : COR.laranja }}>{fmt(receitaAtual)}</b>
                  {' '}de {fmt(metaFat)} · {metaFat > 0 ? (receitaAtual / metaFat * 100).toFixed(1) : 0}%
                  <span style={{ color: '#9a9a96' }}> · pace esperado hoje: {fmtK(paceEsperado)}</span>
                </span>
              </div>
              <div style={{ height: 12, background: 'rgba(0,0,0,0.05)', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
                <div style={{ width: `${Math.min(metaFat > 0 ? receitaAtual / metaFat * 100 : 0, 100)}%`, height: '100%', background: COR.verde, borderRadius: 8 }} />
                {metaFat > 0 && <div style={{ position: 'absolute', left: `${Math.min(paceEsperado / metaFat * 100, 100)}%`, top: 0, bottom: 0, width: 2, background: '#111', opacity: 0.5 }} title="pace esperado" />}
              </div>
            </div>
            {/* Réguas de gasto */}
            {reguas.map(r => {
              const corBarra = r.usoPct > 100 ? COR.vermelho : r.usoPct >= 80 ? COR.laranja : COR.verde
              return (
                <div key={r.nome} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                    <span style={{ fontWeight: 600, color: '#374151' }}>{r.nome} <span style={{ color: '#9a9a96', fontWeight: 400 }}>· teto {r.tetoPct}% = {fmtK(r.tetoRS)}</span></span>
                    <span style={{ color: '#5F5E5A' }}>
                      {fmt(r.gasto)} · <b style={{ color: corBarra }}>{r.usoPct.toFixed(0)}% do teto</b>
                      {r.pctReceita != null && <span style={{ color: '#9a9a96' }}> · {r.pctReceita.toFixed(1)}% da receita real</span>}
                    </span>
                  </div>
                  <div style={{ height: 8, background: 'rgba(0,0,0,0.05)', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(r.usoPct, 100)}%`, height: '100%', background: corBarra, borderRadius: 6 }} />
                  </div>
                </div>
              )
            })}
            <div style={{ fontSize: 11, color: '#9a9a96', marginTop: 8 }}>
              Tetos em R$ calculados sobre a META de faturamento ({fmtK(metaFat)}). Soma das réguas = {reguas.reduce((s2, r) => s2 + r.tetoPct, 0)}% → margem alvo {100 - reguas.reduce((s2, r) => s2 + r.tetoPct, 0)}%.
            </div>
          </div>
        </>
      )}

      {/* GRÁFICO 6 MESES + COMPOSIÇÃO */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.6fr 1fr', gap: 12, marginTop: 22 }}>
        <div style={{ background: '#fff', borderRadius: 14, padding: '1rem 1.25rem', border: '0.5px solid rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>Receita × Despesa (6 meses)</div>
            <div style={{ fontSize: 11, color: '#9a9a96' }}>
              <span style={{ color: COR.verde, fontWeight: 700 }}>■</span> receita&nbsp;&nbsp;
              <span style={{ color: COR.vermelho, fontWeight: 700 }}>■</span> despesa&nbsp;&nbsp;
              <span style={{ color: COR.azul, fontWeight: 700 }}>– –</span> resultado
            </div>
          </div>
          <GraficoMensal dados={dre6} isMobile={isMobile} />
        </div>
        <div style={{ background: '#fff', borderRadius: 14, padding: '1rem 1.25rem', border: '0.5px solid rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 10 }}>Pra onde vai o dinheiro ({MES_CURTO[hoje.getMonth()]}) — % do faturamento</div>
          <Composicao receita={receitaMes} itens={[
            { nome: 'Marketing (tráfego+extra)', valor: Number(dreAtual.marketing_total || 0), cor: COR.azul },
            { nome: 'Folha + Comissão', valor: folhaMes, cor: COR.roxo },
            { nome: 'Fixo', valor: fixoMes, cor: COR.laranja },
            { nome: 'Variável', valor: Number(dreAtual.variavel || 0), cor: '#0F6E56' },
            { nome: 'Imposto', valor: Number(dreAtual.imposto || 0), cor: '#6b7280' },
            { nome: 'Dívida', valor: Number(dreAtual.divida || 0), cor: COR.vermelho },
            { nome: 'Sem grupo', valor: semGrupoMes, cor: '#9ca3af' },
          ]} />
        </div>
      </div>

      {/* PULSO DE CAIXA POR PERÍODO */}
      {secao('💓 Pulso de caixa', (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['hoje', 'Hoje'], ['semana', 'Semana'], ['mes', 'Mês'], ['perso', 'Personalizado']].map(([k, l]) => (
            <button key={k} style={pill(periodo === k)} onClick={() => setPeriodo(k)}>{l}</button>
          ))}
          {periodo === 'perso' && (
            <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 12 }}>
              <input type="date" value={persoIni} max={persoFim} onChange={e => setPersoIni(e.target.value)}
                style={{ border: '1px solid rgba(0,0,0,0.15)', borderRadius: 8, padding: '4px 6px', fontSize: 12 }} />
              <span>até</span>
              <input type="date" value={persoFim} min={persoIni} onChange={e => setPersoFim(e.target.value)}
                style={{ border: '1px solid rgba(0,0,0,0.15)', borderRadius: 8, padding: '4px 6px', fontSize: 12 }} />
            </span>
          )}
        </div>
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 10 }}>
        {kpi('Entrou (recebido)', pulso ? fmt(pulso.entrou) : '…', COR.verde, pulso ? `${pulso.qtdEnt} lote(s) pago(s)` : '')}
        {kpi('Saiu (despesas pagas)', pulso ? fmt(pulso.saiu) : '…', COR.vermelho, pulso ? `${pulso.qtdSai} conta(s)` : '')}
        {kpi('Saldo do período', pulso ? fmt(pulso.entrou - pulso.saiu) : '…', pulso && pulso.entrou - pulso.saiu >= 0 ? COR.verde : COR.vermelho, pulso ? `${pulso.ini.split('-').reverse().join('/')} → ${pulso.fim.split('-').reverse().join('/')}` : '')}
      </div>

      {/* CAC */}
      {secao('🎯 Custo de aquisição (CAC)', <Seletor mes={custoMes} setMes={setCustoMes} ano={custoAno} setAno={setCustoAno} cor={COR.azul} />)}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 10 }}>
        <div style={{ background: '#fff', borderRadius: 14, padding: '1rem 1.25rem', border: '0.5px solid rgba(0,0,0,0.1)', borderTop: `3px solid ${COR.azul}` }}>
          <div style={{ fontSize: 11, color: '#9a9a96', textTransform: 'uppercase', fontWeight: 700 }}>CAC {MESES[custoMes]}</div>
          <div style={{ fontSize: 30, fontWeight: 700, color: COR.azul, marginTop: 4 }}>{cac > 0 ? fmt(cac) : '—'}</div>
          <div style={{ fontSize: 11, color: '#9a9a96' }}>CAC parcial (só anúncio) ÷ {fmtNum(baseAquisicao)} adquiridos</div>
        </div>
        <div style={{ background: '#fff', borderRadius: 14, padding: '1rem 1.25rem', border: '0.5px solid rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: 11, color: '#9a9a96', textTransform: 'uppercase', fontWeight: 700 }}>Evolução do CAC (6 meses)</div>
          <div style={{ marginTop: 8 }}><Sparkline pontos={cacSerie} cor={COR.azul} /></div>
          <div style={{ fontSize: 11, color: '#9a9a96', marginTop: 4 }}>
            {cacSerie.filter(x => x != null).map((v, i, arr) => i === arr.length - 1 ? fmt(v) : fmtK(v)).join(' · ')}
          </div>
        </div>
        <div style={{ background: '#fff', borderRadius: 14, padding: '1rem 1.25rem', border: '0.5px solid rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: 11, color: '#9a9a96', textTransform: 'uppercase', fontWeight: 700 }}>Gasto anúncio {MESES[custoMes]}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#111', marginTop: 4 }}>{fmt(custoTotal)}</div>
          <div style={{ fontSize: 11, color: '#9a9a96' }}>líquido {fmt(custoLiquido)} + 13% imposto</div>
          <button onClick={sincronizarGastos} disabled={sincronizando}
            style={{ marginTop: 8, fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8, border: `1px solid ${COR.azul}`, background: '#fff', color: COR.azul, cursor: 'pointer' }}>
            {sincronizando ? 'Sincronizando…' : '↻ Sincronizar Meta'}
          </button>
          <button onClick={async () => {
            try {
              const tk = (await supabase.auth.getSession()).data.session?.access_token
              const r = await fetch('https://sdqslzpfbazehqcvibjy.supabase.co/functions/v1/sincronizar-gastos-anthropic', {
                method: 'POST', headers: { 'Authorization': `Bearer ${tk}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ ano: hoje.getFullYear(), mes: hoje.getMonth() + 1, editor_id: profile.id })
              })
              const j = await r.json()
              if (!j.ok) alert('Anthropic: ' + j.error)
              else alert(`Custo IA sincronizado: US$ ${Number(j.total_usd).toFixed(2)} → R$ ${Number(j.total_brl).toLocaleString('pt-BR')} (câmbio ${j.cambio}). Aparece em Variável · IA / Anthropic.`)
            } catch (e) { alert('Erro: ' + e.message) }
          }}
            style={{ marginTop: 6, marginLeft: 6, fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8, border: `1px solid ${COR.roxo}`, background: '#fff', color: COR.roxo, cursor: 'pointer' }}>
            🤖 Sincronizar custo IA
          </button>
          {custoSincronizadoEm && <div style={{ fontSize: 10, color: '#9a9a96', marginTop: 4 }}>últ. sync: {new Date(custoSincronizadoEm).toLocaleString('pt-BR')}</div>}
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#9a9a96', marginTop: 6 }}>
        CAC = gasto de anúncio (c/ imposto) ÷ clientes fechados (validados/assinados, sem barrados/cancelados){produtoSel !== 'Todos' ? ` — rateado p/ ${produtoSel}` : ''}. Reposições ({fmtNum(reposicoesCusto)}) não entram no denominador. CAC parcial: só anúncio, sem folha.
      </div>

      {/* OPERAÇÃO: cards com réguas próprias (mantidos) */}
      {secao('📦 Operação — cada número na sua régua de data')}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: 12 }}>
        <Card
          titulo="Vendas (competência)" subtitulo="Lotes vivos por data da venda" cor={COR.vendas}
          seletor={<Seletor mes={vendaMes} setMes={setVendaMes} ano={vendaAno} setAno={setVendaAno} cor={COR.vendas} />}
          contratos={vendas.contratos} lotes={vendas.lotes} valor={vendas.valor}
          rodape="Exclui reposições. Lote que vira inadimplente sai daqui e vai pra Inadimplência."
        />
        <Card
          titulo="Faturamento (caixa)" subtitulo="Lotes pagos por data do pagamento" cor={COR.caixa}
          seletor={<Seletor mes={caixaMes} setMes={setCaixaMes} ano={caixaAno} setAno={setCaixaAno} cor={COR.caixa} />}
          contratos={caixa.contratos} lotes={caixa.lotes} valor={caixa.valor}
          rodape="Dinheiro que efetivamente entrou no mês selecionado."
        />
        <Card
          titulo="Inadimplência" subtitulo="Por data em que virou inadimplente" cor={COR.inad}
          seletor={<Seletor mes={inadMes} setMes={setInadMes} ano={inadAno} setAno={setInadAno} cor={COR.inad} />}
          contratos={inad.contratos} lotes={inad.lotes} valor={inad.valor}
          rodape={`Acumulado total em aberto: ${fmt(inadTotalValor)} (${fmtNum(inadTotal.length)} lotes)`}
        />
        <div style={{ background: '#fff', borderRadius: 14, padding: isMobile ? '1rem' : '1.25rem', border: '0.5px solid rgba(0,0,0,0.1)', borderTop: `3px solid ${repCorRegua}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, gap: 8, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: repCorRegua }}>Reposições aprovadas</div>
              <div style={{ fontSize: 11, color: '#9a9a96' }}>Por data de aprovação · custo operacional</div>
            </div>
            <Seletor mes={repMes} setMes={setRepMes} ano={repAno} setAno={setRepAno} cor={repCorRegua} />
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#111', marginTop: 10 }}>{fmtNum(rep.contratos)} <span style={{ fontSize: 14, color: '#9a9a96', fontWeight: 500 }}>contratos grátis</span></div>
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#5F5E5A', marginBottom: 3 }}>
              <span>{repSituacao === 'sem_base' ? 'Sem base de fechados no mês' : `${repPct.toFixed(1)}% dos ${fmtNum(fechadosRepMes)} fechados do mês`}</span>
              <span>alerta {fmtNum(repTetoAlerta)} · teto {fmtNum(repTetoBloqueio)}</span>
            </div>
            <div style={{ height: 8, background: 'rgba(0,0,0,0.06)', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ width: `${repPctTeto}%`, height: '100%', background: repCorRegua, borderRadius: 6 }} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#9a9a96', marginTop: 10, paddingTop: 8, borderTop: '0.5px solid rgba(0,0,0,0.07)' }}>
            Régua: alerta ≥15% · bloqueio &gt;20% dos fechados. Total histórico: {fmtNum(repTotalContratos)} contratos repostos.
          </div>
        </div>
      </div>

      {/* DRE COMPACTA */}
      {secao('📑 DRE mensal', <span style={{ fontSize: 11, color: '#9a9a96' }}>últimos 6 meses · % sobre a receita</span>)}
      <div style={{ background: '#fff', borderRadius: 14, padding: '0.5rem 0.75rem', border: '0.5px solid rgba(0,0,0,0.1)', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          <thead>
            <tr>
              {['Mês', 'Receita', 'Marketing', '%', 'Pessoas', '%', 'Fixo', '%', 'Outros', 'Desp. total', '% custo', 'Resultado'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid rgba(0,0,0,0.08)', color: '#6b7280', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...dre].reverse().slice(0, 6).map(l => {
              const outros = Number(l.variavel || 0) + Number(l.imposto || 0) + Number(l.divida || 0) + Number(l.sem_grupo || 0)
              const pos = Number(l.resultado || 0) >= 0
              const ehAtual = l.mes === mesIsoAtual
              return (
                <tr key={l.mes} style={ehAtual ? { background: '#F0F7FF' } : undefined}>
                  <td style={td}><b>{mesLabel(l.mes)}</b>{ehAtual ? ' •' : ''}</td>
                  <td style={td}>{fmt(l.receita)}</td>
                  <td style={td}>{fmt(l.marketing_total)}</td>
                  <td style={{ ...td, color: Number(l.pct_marketing) > 50 ? COR.vermelho : Number(l.pct_marketing) >= 35 ? COR.laranja : COR.verde, fontWeight: 600 }}>{fmtPct(l.pct_marketing)}</td>
                  <td style={td}>{fmt(Number(l.folha || 0) + Number(l.comissao || 0))}</td>
                  <td style={td}>{fmtPct(l.pct_pessoas)}</td>
                  <td style={td}>{fmt(l.fixo)}</td>
                  <td style={td}>{fmtPct(l.pct_fixo)}</td>
                  <td style={td}>{fmt(outros)}</td>
                  <td style={td}>{fmt(l.despesa_total)}</td>
                  <td style={td}>{fmtPct(l.pct_custo_total)}</td>
                  <td style={{ ...td, color: pos ? '#15803d' : '#b91c1c', fontWeight: 700 }}>{fmt(l.resultado)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* AGENDA RESUMIDA */}
      {secao('📅 Próximos vencimentos', <span style={{ fontSize: 11, color: '#9a9a96' }}>detalhe completo em Financeiro → Agenda</span>)}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 30 }}>
        {[...atrasadas, ...prox7].slice(0, 8).map((x, i) => {
          const atr = x.origem === 'lancamento' && dv(x.data_vencimento) < h0
          return (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: atr ? '#FCEBEB' : '#fff', border: `1px solid ${atr ? '#A32D2D40' : 'rgba(0,0,0,0.1)'}`, borderRadius: 10, padding: '9px 14px' }}>
              <div style={{ fontSize: 12.5, color: '#111' }}>
                <b>{x.data_vencimento.split('-').reverse().join('/')}</b> · {x.descricao || '—'}
                {atr && <span style={{ color: COR.vermelho, fontWeight: 700 }}> · ATRASADA</span>}
                {x.origem === 'projecao' && <span style={{ color: '#9a9a96' }}> · projeção</span>}
              </div>
              <div style={{ fontWeight: 700, fontSize: 13, color: atr ? COR.vermelho : '#111' }}>{fmt(x.valor)}</div>
            </div>
          )
        })}
        {!atrasadas.length && !prox7.length && (
          <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: 16, textAlign: 'center', fontSize: 12.5, color: '#9a9a96' }}>
            Nada vencendo nos próximos 7 dias. Cadastre as recorrentes em Financeiro → Fixas & Recorrentes pra agenda ganhar vida.
          </div>
        )}
      </div>
    </div>
  )
}

const td = { padding: '8px 10px', borderBottom: '1px solid rgba(0,0,0,0.05)' }
