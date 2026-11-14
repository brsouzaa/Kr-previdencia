import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

// 14/11/2026 (Bruno) — DASHBOARD DO MAE RETROATIVO (unico produto atual).
// Substitui no menu o Dashboard antigo (venda de lote para advogado), que continua no codigo.
// So admin e financeiro: as RPCs dash_retroativo e fin_equilibrio conferem o acesso no banco.
// Numeros por time = mesmo time do Despesas & Custos (fin_times).
//   Leads      = retroativo entregue a vendedora no periodo (retrabalho separado)
//   Fechados   = contrato assinado no periodo, pela vendedora que cadastrou
//   Conversao  = fechados / (leads novos + retrabalho) do periodo
//   Protocolo / deferido / indeferido = setor de Protocolo
//   Pagos / receita = baixa no Acompanhamento
//   Resultado do mes = mesma conta do Despesas & Custos (receita - variaveis - custo fixo)

const hojeSP = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const dataBR = s => (s ? s.split('-').reverse().join('/') : '')
const reais = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const pct = (a, b) => (b > 0 ? `${((a / b) * 100).toFixed(1).replace('.', ',')}%` : '–')

function periodo(tipo) {
  const h = hojeSP()
  if (tipo === 'semana') { const s = new Date(h); const dw = (h.getDay() + 6) % 7; s.setDate(h.getDate() - dw); return [iso(s), iso(h)] }
  if (tipo === 'mes') return [iso(new Date(h.getFullYear(), h.getMonth(), 1)), iso(h)]
  if (tipo === 'mes_passado') return [iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)), iso(new Date(h.getFullYear(), h.getMonth(), 0))]
  return [iso(h), iso(h)]
}

const COR = { tinta: '#1b2430', cinza: '#5b6b84', linha: '#e6e2d8', fundo: '#fbf9f4', azul: '#132A3E', verde: '#1A7A44', vermelho: '#B02A37', laranja: '#C8781E' }
const caixa = { background: '#fff', border: `1px solid ${COR.linha}`, borderRadius: 12, padding: 16 }
const rotulo = { fontSize: 12, fontWeight: 700, color: COR.cinza, textTransform: 'uppercase', letterSpacing: 0.4 }

function Kpi({ t, v, s, cor }) {
  return (
    <div style={{ ...caixa, minWidth: 0 }}>
      <div style={rotulo}>{t}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: cor || COR.tinta, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
      {s && <div style={{ fontSize: 12, color: COR.cinza, marginTop: 2 }}>{s}</div>}
    </div>
  )
}

export default function DashboardRetroativo() {
  const [tipo, setTipo] = useState('semana')
  const [ini, setIni] = useState(() => periodo('semana')[0])
  const [fim, setFim] = useState(() => periodo('semana')[1])
  const [d, setD] = useState(null)
  const [eq, setEq] = useState(null)
  const [erro, setErro] = useState(null)
  const [carregando, setCarregando] = useState(false)

  const escolher = t => { setTipo(t); if (t !== 'outro') { const [a, b] = periodo(t); setIni(a); setFim(b) } }

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null)
    const mesRef = fim.slice(0, 7) + '-01'
    const [r1, r2] = await Promise.all([
      supabase.rpc('dash_retroativo', { p_ini: ini, p_fim: fim }),
      supabase.rpc('fin_equilibrio', { p_mes: mesRef }),
    ])
    if (r1.error) setErro(r1.error.message)
    setD(r1.data || null)
    setEq(r2.error ? null : r2.data)
    setCarregando(false)
  }, [ini, fim])

  useEffect(() => { carregar() }, [carregar])

  // mesma conta do Despesas & Custos (FinanceiroOperacao.js)
  const res = useMemo(() => {
    if (!eq || !eq.parametros) return null
    const imp = Number(eq.parametros.imposto_pct || 0) / 100
    const pg = eq.pagos || {}
    const receita = Number(pg.receita || 0)
    const variaveis = Number(pg.comissoes || 0) + Number(pg.fabio || 0) + Number(pg.prevsempre || 0) + receita * imp
    const fixo = Number(eq.custo_fixo || 0)
    return { receita, variaveis, fixo, lucro: receita - variaveis - fixo, qtd: Number(pg.qtd || 0), previsto: eq.previsto || {} }
  }, [eq])

  const t = d?.totais || {}
  const leads = Number(t.leads_novos || 0) + Number(t.leads_retrab || 0)
  const maxDia = Math.max(1, ...((d?.fechados_dia || []).map(x => x.n)))
  const nomeMes = fim ? new Date(fim + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : ''

  return (
    <div style={{ padding: '16px max(16px, env(safe-area-inset-left, 0px))', color: COR.tinta, maxWidth: 1200 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>📊 Dashboard · Mãe Retroativo</div>
          <div style={{ fontSize: 13, color: COR.cinza }}>{dataBR(ini)} a {dataBR(fim)}{carregando ? ' · atualizando...' : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['hoje', 'Hoje'], ['semana', 'Semana'], ['mes', 'Mês'], ['mes_passado', 'Mês passado'], ['outro', 'Período']].map(([k, l]) => (
            <button key={k} onClick={() => escolher(k)}
              style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${tipo === k ? COR.azul : COR.linha}`, background: tipo === k ? COR.azul : '#fff', color: tipo === k ? '#fff' : COR.tinta, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{l}</button>
          ))}
          {tipo === 'outro' && (
            <>
              <input type="date" value={ini} onChange={e => setIni(e.target.value)} style={{ padding: 6, borderRadius: 8, border: `1px solid ${COR.linha}` }} />
              <input type="date" value={fim} onChange={e => setFim(e.target.value)} style={{ padding: 6, borderRadius: 8, border: `1px solid ${COR.linha}` }} />
            </>
          )}
        </div>
      </div>

      {erro && <div style={{ ...caixa, background: '#F8D7DA', color: '#842029', marginBottom: 12 }}>Não foi possível carregar: {erro}</div>}

      {d && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 12 }}>
            <Kpi t="Leads recebidos" v={leads.toLocaleString('pt-BR')} s={`${t.leads_novos || 0} novos · ${t.leads_retrab || 0} retrabalho`} />
            <Kpi t="Fechados" v={t.fechados || 0} s="contratos assinados" cor={COR.azul} />
            <Kpi t="Conversão" v={pct(Number(t.fechados || 0), leads)} s="fechados ÷ leads" cor={COR.verde} />
            <Kpi t="Protocolados" v={t.protocolados || 0} s="no INSS no período" />
            <Kpi t="Deferidos" v={t.deferidos || 0} s={`${t.indeferidos || 0} indeferidos`} cor={COR.verde} />
            <Kpi t="Pagos" v={t.pagos || 0} s={reais(t.receita)} cor={COR.verde} />
          </div>

          <div style={{ ...caixa, marginBottom: 12 }}>
            <div style={{ ...rotulo, marginBottom: 10 }}>Por time</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 640 }}>
                <thead>
                  <tr style={{ textAlign: 'right', color: COR.cinza, fontSize: 12 }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>Time</th>
                    <th style={{ padding: '6px 8px' }}>Leads novos</th><th style={{ padding: '6px 8px' }}>Retrabalho</th>
                    <th style={{ padding: '6px 8px' }}>Fechados</th><th style={{ padding: '6px 8px' }}>Conversão</th>
                    <th style={{ padding: '6px 8px' }}>Protocolados</th><th style={{ padding: '6px 8px' }}>Deferidos</th>
                    <th style={{ padding: '6px 8px' }}>Pagos</th><th style={{ padding: '6px 8px' }}>Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {(d.times || []).map(x => {
                    const l = Number(x.leads_novos) + Number(x.leads_retrab)
                    return (
                      <tr key={x.chave} style={{ borderTop: `1px solid ${COR.linha}`, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        <td style={{ textAlign: 'left', padding: '8px', fontWeight: 700 }}>{x.nome}</td>
                        <td style={{ padding: 8 }}>{x.leads_novos}</td><td style={{ padding: 8 }}>{x.leads_retrab}</td>
                        <td style={{ padding: 8, fontWeight: 700 }}>{x.fechados}</td>
                        <td style={{ padding: 8, fontWeight: 700, color: COR.verde }}>{pct(Number(x.fechados), l)}</td>
                        <td style={{ padding: 8 }}>{x.protocolados}</td><td style={{ padding: 8 }}>{x.deferidos}</td>
                        <td style={{ padding: 8 }}>{x.pagos}</td><td style={{ padding: 8 }}>{reais(x.receita)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 12, color: COR.cinza, marginTop: 8 }}>Time = responsável no Acompanhamento (o mesmo usado na comissão do Despesas & Custos). "Sem time" = vendedora sem responsável cadastrado.</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div style={caixa}>
              <div style={{ ...rotulo, marginBottom: 10 }}>Fechados por dia</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
                {(d.fechados_dia || []).map(x => (
                  <div key={x.dia} title={`${dataBR(x.dia)}: ${x.n}`} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ fontSize: 11, color: COR.cinza }}>{x.n}</div>
                    <div style={{ width: '100%', height: Math.max(3, (x.n / maxDia) * 90), background: COR.azul, borderRadius: '4px 4px 0 0' }} />
                    <div style={{ fontSize: 10.5, color: COR.cinza }}>{dataBR(x.dia).slice(0, 5)}</div>
                  </div>
                ))}
                {!(d.fechados_dia || []).length && <div style={{ fontSize: 13, color: COR.cinza }}>Nenhum fechamento no período.</div>}
              </div>
            </div>

            <div style={caixa}>
              <div style={{ ...rotulo, marginBottom: 10 }}>Carteira hoje</div>
              <div style={{ fontSize: 14, lineHeight: 1.9 }}>
                <div>Aguardando protocolo: <b>{d.carteira?.aguardando_protocolo || 0}</b></div>
                <div>No INSS (protocolado / exigência): <b>{d.carteira?.no_inss || 0}</b></div>
                <div>Deferidos (total): <b>{d.carteira?.deferidos_total || 0}</b></div>
                <div style={{ borderTop: `1px solid ${COR.linha}`, marginTop: 6, paddingTop: 6 }}>
                  A receber no Acompanhamento: <b>{d.a_receber?.qtd || 0}</b> casos · <b>{reais(d.a_receber?.valor)}</b>
                </div>
                <div style={{ fontSize: 12, color: COR.cinza }}>
                  {Object.entries(d.a_receber?.por_etapa || {}).map(([k, n]) => `${k.replace(/_/g, ' ')}: ${n}`).join(' · ')}
                </div>
              </div>
            </div>
          </div>

          {res && (
            <div style={caixa}>
              <div style={{ ...rotulo, marginBottom: 10 }}>Resultado de {nomeMes} (Despesas & Custos)</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                <Kpi t="Receita (baixas)" v={reais(res.receita)} s={`${res.qtd} clientes pagaram`} cor={COR.verde} />
                <Kpi t="Custos variáveis" v={reais(res.variaveis)} s="comissão, Fábio, PrevSempre, imposto" cor={COR.laranja} />
                <Kpi t="Custo fixo" v={reais(res.fixo)} cor={COR.laranja} />
                <Kpi t={res.lucro >= 0 ? 'Lucro do mês' : 'Falta cobrir'} v={reais(Math.abs(res.lucro))} cor={res.lucro >= 0 ? COR.verde : COR.vermelho} />
                <Kpi t="Previsto no mês" v={reais(res.previsto.receita)} s={`${res.previsto.qtd || 0} contratos com data de pagamento`} />
              </div>
              <div style={{ fontSize: 12, color: COR.cinza, marginTop: 8 }}>Custos e parâmetros são editados em 📋 Despesas & Custos. A receita entra sozinha quando o caso recebe baixa no Acompanhamento.</div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
