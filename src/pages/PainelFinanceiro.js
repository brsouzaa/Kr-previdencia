import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// ============================================================
// PAINEL FINANCEIRO KR — cada métrica na régua de data correta
//   VENDAS        -> data_venda        (competência: quando o advogado fechou)
//   FATURAMENTO   -> data_faturamento  (caixa: quando o dinheiro entrou)
//   INADIMPLÊNCIA -> data_inadimplencia_dia (quando virou inadimplente)
// Fonte única: view public.v_dashboard_kr
// ============================================================

const COR = {
  vendas: '#0F6E56',
  caixa: '#185FA5',
  inad: '#A32D2D',
  neutro: '#5F5E5A',
}

const fmt = v => `R$ ${Number(v || 0).toLocaleString('pt-BR')}`
const fmtNum = v => Number(v || 0).toLocaleString('pt-BR')

function pad(n) { return String(n).padStart(2, '0') }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

// Range de um mês (0=jan) de um ano
function rangeMes(ano, mes) {
  const ini = new Date(ano, mes, 1)
  const fim = new Date(ano, mes + 1, 0)
  return { ini: ymd(ini), fim: ymd(fim) }
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function useIsMobile() {
  const [m, setM] = useState(window.innerWidth <= 768)
  useEffect(() => {
    const h = () => setM(window.innerWidth <= 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return m
}

export default function PainelFinanceiro() {
  const { profile } = useAuth()
  const isMobile = useIsMobile()
  const [linhas, setLinhas] = useState([])
  const [loading, setLoading] = useState(true)

  const hoje = new Date()
  // Seletores INDEPENDENTES: cada métrica tem seu próprio mês/ano
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

  // Bloqueio: só admin/analista veem financeiro
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
  }, [profile])

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

  // Sincroniza gasto de anuncios da Meta (botao manual)
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
      // recarrega gastos E clientes fechados (CAC atualiza junto)
      const { data } = await supabase.from('gastos_anuncios').select('*')
      setGastos(data || [])
      const { data: fc } = await supabase.from('v_clientes_fechados_mes').select('*')
      setFechadosMes(fc || [])
    } catch (e) { alert('Erro: ' + e.message) }
    setSincronizando(false)
  }

  // Filtro de PRODUTO aplicado a todos os cards. 'Todos' = sem filtro.
  const base = produtoSel === 'Todos' ? linhas : linhas.filter(l => l.produto === produtoSel)
  // Lista de produtos disponíveis nos dados (pra montar o dropdown sem inventar opção vazia)
  const produtosDisponiveis = Array.from(new Set(linhas.map(l => l.produto).filter(Boolean))).sort()

  // ---- VENDAS (competência): lotes vivos, não-reposição, por data_venda ----
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

  // ---- FATURAMENTO (caixa): lotes pagos, por data_faturamento ----
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

  // ---- INADIMPLÊNCIA: por data_inadimplencia_dia ----
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

  // Inadimplência total acumulada (todos os inadimplentes vivos, independente do mês)
  const inadTotal = base.filter(l => l.eh_inadimplente)
  const inadTotalValor = inadTotal.reduce((s, l) => s + Number(l.valor_total || 0), 0)

  // ---- REPOSIÇÕES: aprovadas, por data de APROVAÇÃO (não data do pedido) ----
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

  // ---- RÉGUA DE REPOSIÇÃO: % sobre clientes fechados do mês (alerta 15%, bloqueio 20%) ----
  // Clientes fechados do mês de reposição (soma todos os produtos)
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

  // ---- CUSTO DE ANÚNCIO: gasto Meta (com 13% imposto) do mês selecionado ----
  const custoLin = gastos.filter(g => g.ano === custoAno && g.mes === (custoMes + 1))
  const custoTotal = custoLin.reduce((s, g) => s + Number(g.gasto_total || 0), 0)
  const custoLiquido = custoLin.reduce((s, g) => s + Number(g.gasto_liquido || 0), 0)
  const custoSincronizadoEm = custoLin.length ? custoLin.map(g => g.sincronizado_em).sort().reverse()[0] : null
  // CAC = custo / (clientes fechados no mês + contratos repostos aprovados no mês)
  // Clientes fechados = status validado/entregue/assinado (cliente real, não pedido de advogado)
  // Reposição também é cliente novo adquirido. Sempre geral (gasto de anúncio não separa por produto).
  const rCusto = rangeMes(custoAno, custoMes)
  // Clientes fechados do mês (todos os produtos) — pra ratear o gasto
  const fechadosDoMes = fechadosMes.filter(f => f.ano === custoAno && f.mes === (custoMes + 1))
  const totalFechadosTodos = fechadosDoMes.reduce((s, f) => s + Number(f.clientes_fechados || 0), 0)
  // Reposições do mês por produto (da view de linhas)
  const reposicoesDoMes = linhas.filter(l => l.eh_reposicao_aprovada && l.data_aprovacao_dia && l.data_aprovacao_dia >= rCusto.ini && l.data_aprovacao_dia <= rCusto.fim)
  const totalRepostosTodos = reposicoesDoMes.reduce((s, l) => s + Number(l.total_contratos || 0), 0)
  const baseTodos = totalFechadosTodos + totalRepostosTodos

  // Se filtrou produto: rateia o gasto proporcional aos adquiridos daquele produto
  let clientesFechadosCusto, reposicoesCusto, baseAquisicao, custoRateado
  if (produtoSel === 'Todos') {
    clientesFechadosCusto = totalFechadosTodos
    reposicoesCusto = totalRepostosTodos
    baseAquisicao = baseTodos
    custoRateado = custoTotal
  } else {
    clientesFechadosCusto = fechadosDoMes.filter(f => f.produto === produtoSel).reduce((s, f) => s + Number(f.clientes_fechados || 0), 0)
    reposicoesCusto = reposicoesDoMes.filter(l => l.produto === produtoSel).reduce((s, l) => s + Number(l.total_contratos || 0), 0)
    baseAquisicao = clientesFechadosCusto + reposicoesCusto
    // rateio: gasto total * (adquiridos do produto / adquiridos totais)
    custoRateado = baseTodos > 0 ? custoTotal * (baseAquisicao / baseTodos) : 0
  }
  const cac = baseAquisicao > 0 ? custoRateado / baseAquisicao : 0

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

  return (
    <div style={{ padding: isMobile ? '1rem' : '1.5rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111', margin: 0 }}>Painel Financeiro</h1>
          <p style={{ fontSize: 13, color: '#5F5E5A', margin: '4px 0 0' }}>
            Cada número tem sua própria régua de data — venda, caixa e inadimplência são coisas diferentes.
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

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 14, marginTop: 16 }}>
        <Card
          titulo="Vendas"
          subtitulo="Pedidos fechados no mês (competência)"
          cor={COR.vendas}
          seletor={<Seletor mes={vendaMes} setMes={setVendaMes} ano={vendaAno} setAno={setVendaAno} cor={COR.vendas} />}
          contratos={vendas.contratos}
          lotes={vendas.lotes}
          valor={vendas.valor}
          rodape="Valor potencial dos pedidos fechados — pode ainda não ter entrado no caixa."
        />
        <Card
          titulo="Faturamento"
          subtitulo="Dinheiro que entrou no mês (caixa)"
          cor={COR.caixa}
          seletor={<Seletor mes={caixaMes} setMes={setCaixaMes} ano={caixaAno} setAno={setCaixaAno} cor={COR.caixa} />}
          contratos={caixa.contratos}
          lotes={caixa.lotes}
          valor={caixa.valor}
          rodape="Conta pela data do pagamento — inclui pedidos de meses anteriores pagos neste mês."
        />
        <Card
          titulo="Inadimplência"
          subtitulo="Virou inadimplente no mês"
          cor={COR.inad}
          seletor={<Seletor mes={inadMes} setMes={setInadMes} ano={inadAno} setAno={setInadAno} cor={COR.inad} />}
          contratos={inad.contratos}
          lotes={inad.lotes}
          valor={inad.valor}
          rodape={`Total acumulado em aberto (todos os meses): ${fmt(inadTotalValor)} · ${inadTotal.length} pedidos`}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 14, marginTop: 14 }}>
        <div style={{ background: '#fff', borderRadius: 14, padding: isMobile ? '1rem' : '1.25rem', border: '0.5px solid rgba(0,0,0,0.1)', borderTop: `3px solid ${COR.neutro}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, gap: 8, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: COR.neutro }}>Reposições</div>
              <div style={{ fontSize: 11, color: '#9a9a96' }}>Reposições aprovadas no mês</div>
            </div>
            <Seletor mes={repMes} setMes={setRepMes} ano={repAno} setAno={setRepAno} cor={COR.neutro} />
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#111' }}>{fmtNum(rep.contratos)}</div>
              <div style={{ fontSize: 11, color: '#9a9a96' }}>contratos repostos</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: COR.neutro }}>{fmtNum(rep.lotes)}</div>
              <div style={{ fontSize: 11, color: '#9a9a96' }}>reposições</div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#9a9a96', marginTop: 10, paddingTop: 8, borderTop: '0.5px solid rgba(0,0,0,0.07)' }}>
            Total histórico: {fmtNum(repTotalContratos)} contratos repostos em {fmtNum(repTotal.length)} reposições.
          </div>
          {fechadosRepMes > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid rgba(0,0,0,0.07)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: repCorRegua }}>
                  {repPct.toFixed(1)}% de reposição
                  {repSituacao === 'bloqueio' ? ' · 🚫 acima do teto' : repSituacao === 'alerta' ? ' · ⚠️ alerta' : ' · ok'}
                </span>
                <span style={{ fontSize: 11, color: '#9a9a96' }}>limite 15% · bloqueio 20%</span>
              </div>
              <div style={{ height: 8, background: '#EDECE6', borderRadius: 4, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${repPctTeto}%`, background: repCorRegua, borderRadius: 4 }} />
                <div style={{ position: 'absolute', left: '75%', top: 0, bottom: 0, width: 1, background: '#854F0B' }} title="15%" />
                <div style={{ position: 'absolute', left: '100%', top: 0, bottom: 0, width: 2, background: '#A32D2D', marginLeft: -2 }} title="20%" />
              </div>
              <div style={{ fontSize: 11, color: '#9a9a96', marginTop: 6 }}>
                {fmtNum(rep.contratos)} repostos de {fmtNum(fechadosRepMes)} clientes fechados · teto alerta {fmtNum(repTetoAlerta)} · teto bloqueio {fmtNum(repTetoBloqueio)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CUSTO DE ANÚNCIO + CAC */}
      <div style={{ background: '#fff', borderRadius: 14, padding: isMobile ? '1rem' : '1.25rem', border: '0.5px solid rgba(0,0,0,0.1)', borderTop: '3px solid #854F0B', marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, gap: 8, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#854F0B' }}>Custo de anúncio</div>
            <div style={{ fontSize: 11, color: '#9a9a96' }}>Meta (Ana Livia 4 + KR Promotora Nova 01) · com 13% imposto · CAC só anúncio (sem folha){produtoSel !== 'Todos' ? ` · rateado p/ ${produtoSel}` : ''}</div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <Seletor mes={custoMes} setMes={setCustoMes} ano={custoAno} setAno={setCustoAno} cor="#854F0B" />
            <button onClick={sincronizarGastos} disabled={sincronizando}
              style={{ fontSize: 12, padding: '6px 12px', background: sincronizando ? '#f0f0ee' : '#854F0B', color: sincronizando ? '#888' : '#fff', border: 'none', borderRadius: 7, cursor: sincronizando ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
              {sincronizando ? 'Sincronizando…' : '🔄 Sincronizar'}
            </button>
          </div>
        </div>
        {custoLin.length === 0 ? (
          <div style={{ fontSize: 13, color: '#9a9a96', marginTop: 12 }}>
            Sem gasto sincronizado para este mês. Clique em <strong>Sincronizar</strong> para puxar da Meta.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 24, marginTop: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#111' }}>{fmt(produtoSel === 'Todos' ? custoTotal : custoRateado)}</div>
                <div style={{ fontSize: 11, color: '#9a9a96' }}>{produtoSel === 'Todos' ? 'custo total (com imposto)' : `custo rateado p/ ${produtoSel}`}</div>
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#854F0B' }}>{fmt(cac)}</div>
                <div style={{ fontSize: 11, color: '#9a9a96' }}>CAC parcial (só anúncio) ÷ {fmtNum(baseAquisicao)} adquiridos</div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#9a9a96', marginTop: 10, paddingTop: 8, borderTop: '0.5px solid rgba(0,0,0,0.07)' }}>
              Mídia (sem imposto): {fmt(custoLiquido)} · {custoLin.map(g => `${g.conta_nome}: ${fmt(g.gasto_total)}`).join(' · ')}
              {custoSincronizadoEm ? ` · atualizado ${new Date(custoSincronizadoEm).toLocaleString('pt-BR')}` : ''}
              <br />CAC = {fmtNum(clientesFechadosCusto)} clientes fechados + {fmtNum(reposicoesCusto)} repostos = {fmtNum(baseAquisicao)} adquiridos{produtoSel !== 'Todos' ? ` (${produtoSel})` : ''}. É CAC parcial: só anúncio, sem folha da equipe.
            </div>
          </>
        )}
      </div>

      <div style={{ background: '#FBFAF7', borderRadius: 12, padding: '1rem 1.25rem', marginTop: 18, border: '0.5px solid rgba(0,0,0,0.07)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#5F5E5A', marginBottom: 6 }}>Como ler este painel</div>
        <div style={{ fontSize: 12, color: '#5F5E5A', lineHeight: 1.6 }}>
          <strong style={{ color: COR.vendas }}>Vendas</strong> = o que os advogados fecharam (mede esforço comercial do mês).<br />
          <strong style={{ color: COR.caixa }}>Faturamento</strong> = o que entrou no banco (mede caixa real — pode incluir venda de mês passado paga agora).<br />
          <strong style={{ color: COR.inad }}>Inadimplência</strong> = o que virou calote no mês.<br />
          Os três quase nunca batem — e é assim que tem que ser.
        </div>
      </div>
    </div>
  )
}
