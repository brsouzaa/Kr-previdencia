import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

const VERDE = '#3B6D11', VERMELHO = '#A32D2D', LARANJA = '#854F0B', AZUL = '#185FA5'

// ---------- helpers de data (YYYY-MM-DD, horário local) ----------
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function hojeLocal() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()) }

function calcPeriodo(periodo, custIni, custFim) {
  const hoje = hojeLocal()
  let inicio, fim
  if (periodo === 'hoje') { inicio = hoje; fim = hoje }
  else if (periodo === 'semana') { inicio = addDays(hoje, -((hoje.getDay() + 6) % 7)); fim = hoje }
  else if (periodo === 'mes') { inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1); fim = hoje }
  else {
    inicio = custIni ? new Date(custIni + 'T00:00:00') : hoje
    fim = custFim ? new Date(custFim + 'T00:00:00') : hoje
  }
  const durDias = Math.max(1, Math.round((fim - inicio) / 86400000) + 1)
  return { inicio: ymd(inicio), fim: ymd(fim), inicioAnterior: ymd(addDays(inicio, -durDias)) }
}

function fmtData(v) {
  if (!v) return '—'
  const s = String(v).slice(0, 10)
  const [y, m, d] = s.split('-')
  return d ? `${d}/${m}/${y}` : s
}

function metricas(lista) {
  const total = lista.length
  const validados = lista.filter(c => c.resultado === 'validado').length
  const barrados = total - validados
  return { total, validados, barrados, taxa: total ? Math.round((validados / total) * 100) : 0 }
}

export default function PosVendaHistorico() {
  const [linhas, setLinhas] = useState([])
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState('hoje')
  const [custIni, setCustIni] = useState(ymd(hojeLocal()))
  const [custFim, setCustFim] = useState(ymd(hojeLocal()))
  const [filtro, setFiltro] = useState('todos')

  const p = useMemo(() => calcPeriodo(periodo, custIni, custFim), [periodo, custIni, custFim])

  useEffect(() => { fetchDados() }, [p.inicio, p.fim, p.inicioAnterior])

  async function fetchDados() {
    setLoading(true)
    // busca o período atual + o anterior (para calcular evolução) numa query só
    const { data } = await supabase
      .from('v_pos_venda_historico')
      .select('*')
      .gte('data_venda', p.inicioAnterior)
      .lte('data_venda', p.fim)
      .order('data_venda', { ascending: false })
      .limit(5000)
    setLinhas(data || [])
    setLoading(false)
  }

  // separa atual x anterior pela data de venda (assinatura)
  const atuais = useMemo(() => linhas.filter(c => c.data_venda >= p.inicio && c.data_venda <= p.fim), [linhas, p])
  const anteriores = useMemo(() => linhas.filter(c => c.data_venda >= p.inicioAnterior && c.data_venda < p.inicio), [linhas, p])

  const mAtual = useMemo(() => metricas(atuais), [atuais])
  const mAnt = useMemo(() => metricas(anteriores), [anteriores])

  const barradosAtuais = useMemo(() => atuais.filter(c => c.resultado === 'barrado'), [atuais])

  // ranking de motivos (feedbacks)
  const motivos = useMemo(() => {
    const acc = {}
    barradosAtuais.forEach(c => { const m = (c.motivo_barrado || 'Sem motivo').trim(); acc[m] = (acc[m] || 0) + 1 })
    return Object.entries(acc).sort((a, b) => b[1] - a[1])
  }, [barradosAtuais])

  // quebra por vendedora (qualidade da venda)
  const porVendedora = useMemo(() => {
    const acc = {}
    atuais.forEach(c => {
      const v = c.vendedora || '—'
      if (!acc[v]) acc[v] = { total: 0, barrados: 0 }
      acc[v].total++
      if (c.resultado === 'barrado') acc[v].barrados++
    })
    return Object.entries(acc)
      .map(([nome, x]) => ({ nome, ...x, taxaBarr: x.total ? Math.round((x.barrados / x.total) * 100) : 0 }))
      .filter(x => x.barrados > 0)
      .sort((a, b) => b.barrados - a.barrados)
  }, [atuais])

  const listaFiltrada = useMemo(() => {
    if (filtro === 'validados') return atuais.filter(c => c.resultado === 'validado')
    if (filtro === 'barrados') return atuais.filter(c => c.resultado === 'barrado')
    return atuais
  }, [atuais, filtro])

  const deltaTaxa = mAtual.taxa - mAnt.taxa

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 40 }}>
      <h2 style={{ fontSize: 22, fontWeight: 600, color: '#111', marginBottom: 4 }}>📚 Histórico do Pós-Venda</h2>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>
        Período por <b>data de assinatura</b> (dia da venda). {fmtData(p.inicio)} → {fmtData(p.fim)}
      </div>

      {/* Seletor de período */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        {[['hoje', 'Hoje'], ['semana', 'Semana'], ['mes', 'Mês'], ['personalizado', 'Personalizado']].map(([k, lbl]) => (
          <button key={k} onClick={() => setPeriodo(k)} style={pill(periodo === k)}>{lbl}</button>
        ))}
        {periodo === 'personalizado' && (
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#555' }}>
            <input type="date" value={custIni} max={custFim} onChange={e => setCustIni(e.target.value)} style={dateInput} />
            <span>até</span>
            <input type="date" value={custFim} min={custIni} max={ymd(hojeLocal())} onChange={e => setCustFim(e.target.value)} style={dateInput} />
          </span>
        )}
      </div>

      {/* Cards de métrica do período */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
        <button onClick={() => setFiltro('todos')} style={statCard(filtro === 'todos')}>
          <div style={cap}>Total no período</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#111' }}>{mAtual.total}</div>
        </button>
        <button onClick={() => setFiltro('validados')} style={statCard(filtro === 'validados', VERDE, '#EAF3DE')}>
          <div style={{ ...cap, color: VERDE }}>✅ Validados</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: VERDE }}>{mAtual.validados}</div>
        </button>
        <button onClick={() => setFiltro('barrados')} style={statCard(filtro === 'barrados', VERMELHO, '#FCEBEB')}>
          <div style={{ ...cap, color: VERMELHO }}>❌ Barrados</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: VERMELHO }}>{mAtual.barrados}</div>
        </button>
        <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: 14 }}>
          <div style={cap}>Taxa de aprovação</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: mAtual.taxa >= 80 ? VERDE : mAtual.taxa >= 60 ? LARANJA : VERMELHO }}>
            {mAtual.taxa}%
          </div>
          <div style={{ fontSize: 11, color: deltaTaxa >= 0 ? VERDE : VERMELHO, marginTop: 2 }}>
            {deltaTaxa >= 0 ? '▲' : '▼'} {Math.abs(deltaTaxa)} p.p. vs período anterior
          </div>
        </div>
      </div>

      {/* B.I — evolução + feedbacks + vendedora */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10, marginBottom: 18 }}>
        {/* Evolução */}
        <div style={bi}>
          <div style={biTitle}>📈 Evolução vs período anterior</div>
          <RowBI label="Total de vendas" a={mAnt.total} b={mAtual.total} />
          <RowBI label="Barrados" a={mAnt.barrados} b={mAtual.barrados} invert />
          <RowBI label="Taxa de aprovação" a={mAnt.taxa} b={mAtual.taxa} suf="%" />
        </div>
        {/* Feedbacks / motivos */}
        <div style={bi}>
          <div style={biTitle}>🗣️ Motivos de barramento (feedbacks)</div>
          {motivos.length === 0 ? <div style={vazio}>Nenhum barrado no período</div> :
            motivos.slice(0, 6).map(([m, n]) => (
              <div key={m} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                <span style={{ color: '#444', maxWidth: '80%' }}>{m}</span>
                <b style={{ color: VERMELHO }}>{n} ({Math.round((n / barradosAtuais.length) * 100)}%)</b>
              </div>
            ))}
        </div>
        {/* Vendedora */}
        <div style={bi}>
          <div style={biTitle}>👤 Barrados por vendedora</div>
          {porVendedora.length === 0 ? <div style={vazio}>Nenhum barrado no período</div> :
            porVendedora.slice(0, 6).map(v => (
              <div key={v.nome} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                <span style={{ color: '#444', maxWidth: '70%' }}>{v.nome}</span>
                <b style={{ color: VERMELHO }}>{v.barrados}/{v.total} · {v.taxaBarr}%</b>
              </div>
            ))}
        </div>
      </div>

      {/* Lista */}
      {loading ? <div style={{ padding: 30, textAlign: 'center', color: '#888' }}>Carregando...</div>
        : listaFiltrada.length === 0 ? <div style={vazio}>Nenhum cliente nesse filtro/período</div>
          : listaFiltrada.map(c => {
            const barrado = c.resultado === 'barrado'
            return (
              <div key={c.id} style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: 14, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#111' }}>{c.nome}</div>
                      <span style={{ fontSize: 10, padding: '2px 6px', background: barrado ? '#FCEBEB' : '#EAF3DE', color: barrado ? VERMELHO : VERDE, borderRadius: 6, fontWeight: 500 }}>
                        {barrado ? '❌ Barrado' : '✅ Validado'}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: '#888' }}>
                      {c.cpf} · {c.telefone || '—'} · Vendedora: {c.vendedora || '—'}
                      {c.nis ? ` · NIS: ${c.nis}` : ' · sem NIS'}
                    </div>
                    {barrado && c.motivo_barrado && (
                      <div style={{ fontSize: 11, color: VERMELHO, marginTop: 4, background: '#FCEBEB', padding: '4px 8px', borderRadius: 4, display: 'inline-block' }}>
                        Motivo: {c.motivo_barrado}
                      </div>
                    )}
                    {c.observacao && (
                      <div style={{ fontSize: 11, color: '#666', marginTop: 4, fontStyle: 'italic' }}>💬 {c.observacao}</div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#666', textAlign: 'right', minWidth: 150 }}>
                    <div>📝 Assinou: <b>{fmtData(c.data_venda)}</b></div>
                    <div style={{ color: barrado ? VERMELHO : VERDE }}>
                      {barrado ? '❌ Barrado' : '✅ Validado'}: {fmtData(barrado ? c.barrado_em : c.validado_em)}
                    </div>
                    {c.tentativas > 0 && <div style={{ marginTop: 2 }}>📞 {c.tentativas} tentativa(s)</div>}
                    {c.analista && <div style={{ marginTop: 2, color: '#999' }}>Analista: {c.analista}</div>}
                  </div>
                </div>
              </div>
            )
          })}
    </div>
  )
}

function RowBI({ label, a, b, suf = '', invert = false }) {
  const delta = b - a
  const bom = invert ? delta <= 0 : delta >= 0
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '3px 0' }}>
      <span style={{ color: '#444' }}>{label}</span>
      <span>
        <span style={{ color: '#999' }}>{a}{suf}</span>
        <span style={{ color: '#bbb', margin: '0 5px' }}>→</span>
        <b style={{ color: '#111' }}>{b}{suf}</b>
        <span style={{ color: bom ? VERDE : VERMELHO, marginLeft: 6, fontSize: 11 }}>
          {delta === 0 ? '=' : (delta > 0 ? '▲' : '▼') + Math.abs(delta) + suf}
        </span>
      </span>
    </div>
  )
}

const cap = { fontSize: 11, color: '#888', textTransform: 'uppercase' }
const vazio = { background: '#fff', padding: 24, textAlign: 'center', borderRadius: 12, border: '0.5px solid rgba(0,0,0,0.08)', color: '#888', fontSize: 13 }
const bi = { background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: 14 }
const biTitle = { fontSize: 12, fontWeight: 600, color: '#333', marginBottom: 8 }
const dateInput = { border: '1px solid rgba(0,0,0,0.15)', borderRadius: 8, padding: '5px 8px', fontSize: 12 }

function pill(ativo) {
  return {
    background: ativo ? AZUL : '#fff', color: ativo ? '#fff' : '#555',
    border: `1px solid ${ativo ? AZUL : 'rgba(0,0,0,0.15)'}`, borderRadius: 20,
    padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500,
  }
}
function statCard(ativo, cor = AZUL, bg = '#fff') {
  return {
    background: ativo ? bg : '#fff', border: `1px solid ${ativo ? cor : 'rgba(0,0,0,0.1)'}`,
    borderRadius: 12, padding: 14, cursor: 'pointer', textAlign: 'left',
  }
}
