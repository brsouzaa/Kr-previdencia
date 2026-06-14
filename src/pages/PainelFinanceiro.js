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

  // Bloqueio: só admin/analista veem financeiro
  const podeVer = profile && (profile.role === 'admin' || profile.role === 'analista')

  useEffect(() => {
    if (!podeVer) { setLoading(false); return }
    supabase.from('v_dashboard_kr').select('*').then(({ data, error }) => {
      if (error) console.error('Erro view dashboard:', error)
      setLinhas(data || [])
      setLoading(false)
    })
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

  // ---- VENDAS (competência): lotes vivos, não-reposição, por data_venda ----
  const rVenda = rangeMes(vendaAno, vendaMes)
  const vendasLin = linhas.filter(l =>
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
  const caixaLin = linhas.filter(l =>
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
  const inadLin = linhas.filter(l =>
    l.eh_inadimplente && l.data_inadimplencia_dia &&
    l.data_inadimplencia_dia >= rInad.ini && l.data_inadimplencia_dia <= rInad.fim
  )
  const inad = {
    lotes: inadLin.length,
    contratos: inadLin.reduce((s, l) => s + Number(l.total_contratos || 0), 0),
    valor: inadLin.reduce((s, l) => s + Number(l.valor_total || 0), 0),
  }

  // Inadimplência total acumulada (todos os inadimplentes vivos, independente do mês)
  const inadTotal = linhas.filter(l => l.eh_inadimplente)
  const inadTotalValor = inadTotal.reduce((s, l) => s + Number(l.valor_total || 0), 0)

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
      <div style={{ marginBottom: 6 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111', margin: 0 }}>Painel Financeiro</h1>
        <p style={{ fontSize: 13, color: '#5F5E5A', margin: '4px 0 0' }}>
          Cada número tem sua própria régua de data — venda, caixa e inadimplência são coisas diferentes.
        </p>
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
