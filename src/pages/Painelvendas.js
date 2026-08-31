import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// 31/08 — Painel de Vendas. A venda passou a existir como registro proprio
// (tabela `vendas`), somando Bolsa Familia (maismae.leads) e os produtos do
// contrato (public.clientes) no mesmo numero, sem copiar dado de nenhum dos dois.
//
// Duas leituras na mesma tela, porque as perguntas sao diferentes:
//   ADMIN     — "quanto entrou, de quem, e o que esta travado?"
//   VENDEDOR  — "quanto eu fiz e quanto eu ganhei?"
//
// Sobre as cores: paleta categorica validada (CVD e contraste) — as barras
// carregam rotulo direto porque duas delas ficam abaixo de 3:1 no fundo claro,
// e cor sozinha nunca deve ser a unica forma de ler o dado.
const CORES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#94a3b8']
const COR_BARRADA = '#e34948'

const PERIODOS = [
  ['hoje', 'Hoje'],
  ['7d', 'Últimos 7 dias'],
  ['mes', 'Este mês'],
  ['30d', 'Últimos 30 dias'],
]

const isoLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const hojeISO = () => isoLocal(new Date())
const somaDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoLocal(d) }
const inicioMes = () => { const d = new Date(); d.setDate(1); return isoLocal(d) }
const brData = (iso) => { const p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] : '' }
const dinheiro = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const inteiro = (v) => Number(v || 0).toLocaleString('pt-BR')

function faixaDe(p) {
  if (p === 'hoje') return [hojeISO(), hojeISO()]
  if (p === '7d') return [somaDias(-6), hojeISO()]
  if (p === 'mes') return [inicioMes(), hojeISO()]
  return [somaDias(-29), hojeISO()]
}

const s = {
  title: { fontSize: 20, fontWeight: 500, color: '#0f172a', marginBottom: 4 },
  sub: { fontSize: 13, color: '#5b6b84', marginBottom: 16 },
  linha: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 },
  chip: { padding: '7px 13px', fontSize: 12.5, fontWeight: 500, borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.12)', background: '#ffffff', color: '#5b6b84', cursor: 'pointer', whiteSpace: 'nowrap' },
  chipOn: { background: '#0f172a', color: '#ffffff', borderColor: '#0f172a' },
  dataInput: { padding: '6px 10px', fontSize: 12.5, borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.18)' },

  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))', gap: 12, marginBottom: 22 },
  kpi: { background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.10)', borderRadius: 12, padding: '14px 16px' },
  kpiNum: { fontSize: 28, fontWeight: 700, color: '#0f172a', lineHeight: 1.1, letterSpacing: '-0.5px' },
  kpiLab: { fontSize: 12, color: '#5b6b84', marginTop: 4 },
  kpiDelta: (up) => ({ fontSize: 11.5, fontWeight: 700, marginTop: 6, color: up ? '#0f7a52' : '#b3322f' }),
  kpiNeutro: { fontSize: 11.5, color: '#94a3b8', marginTop: 6 },

  bloco: { background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.10)', borderRadius: 12, padding: 16, marginBottom: 16 },
  blocoTit: { fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 3 },
  blocoSub: { fontSize: 11.5, color: '#94a3b8', marginBottom: 14 },

  // barra horizontal com rotulo direto — nunca so a cor
  barraLinha: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 },
  barraNome: { fontSize: 12.5, color: '#0f172a', width: 150, flexShrink: 0, textAlign: 'right' },
  barraTrilho: { flex: 1, height: 22, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden', display: 'flex' },
  barraFill: (cor, pct) => ({ width: Math.max(pct, 0) + '%', background: cor, borderRadius: '0 4px 4px 0', transition: 'width .4s' }),
  barraVal: { fontSize: 12.5, fontWeight: 700, color: '#0f172a', width: 92, flexShrink: 0 },

  // evolucao por dia: barras finas ancoradas na base
  evo: { display: 'flex', alignItems: 'flex-end', gap: 3, height: 108, paddingTop: 6, overflowX: 'auto' },
  evoCol: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 22, flex: 1 },
  evoBarra: (h, cor) => ({ width: '100%', maxWidth: 26, height: Math.max(h, 2), background: cor, borderRadius: '4px 4px 0 0' }),
  evoDia: { fontSize: 9.5, color: '#94a3b8', whiteSpace: 'nowrap' },

  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', fontSize: 11, color: '#94a3b8', fontWeight: 600, padding: '7px 10px', borderBottom: '0.5px solid rgba(15,23,42,0.10)', textTransform: 'uppercase', letterSpacing: '.3px' },
  td: { padding: '9px 10px', borderBottom: '0.5px solid rgba(15,23,42,0.06)', color: '#0f172a' },
  tdNum: { padding: '9px 10px', borderBottom: '0.5px solid rgba(15,23,42,0.06)', color: '#0f172a', textAlign: 'right', fontVariantNumeric: 'tabular-nums' },

  tag: { fontSize: 10.5, color: '#5b6b84', background: '#f1f5f9', borderRadius: 5, padding: '2px 7px' },
  tagRuim: { fontSize: 10.5, fontWeight: 700, color: '#b3322f', background: 'rgba(227,73,72,.13)', borderRadius: 5, padding: '2px 7px' },
  tagBom: { fontSize: 10.5, fontWeight: 700, color: '#0f7a52', background: 'rgba(27,175,122,.15)', borderRadius: 5, padding: '2px 7px' },
  alerta: { fontSize: 12.5, lineHeight: 1.55, color: '#7c2d12', background: 'rgba(237,161,0,.14)', border: '0.5px solid rgba(237,161,0,.5)', borderRadius: 10, padding: '11px 13px', marginBottom: 16 },
  vazio: { fontSize: 12.5, color: '#94a3b8', padding: '18px 6px', textAlign: 'center' },
  aviso: { fontSize: 11.5, color: '#94a3b8', marginTop: 10, lineHeight: 1.5 },
}

// barras com rotulo direto: a cor identifica, o texto informa
function Barras({ itens, corDe, valorDe, rotuloDe, formata }) {
  const max = Math.max(1, ...itens.map(valorDe))
  if (!itens.length) return <div style={s.vazio}>Nada no período.</div>
  return (
    <div>
      {itens.map((it, i) => (
        <div key={rotuloDe(it) + i} style={s.barraLinha}>
          <div style={s.barraNome} title={rotuloDe(it)}>{rotuloDe(it)}</div>
          <div style={s.barraTrilho}>
            <div style={s.barraFill(corDe(it, i), 100 * valorDe(it) / max)} />
          </div>
          <div style={s.barraVal}>{(formata || inteiro)(valorDe(it))}</div>
        </div>
      ))}
    </div>
  )
}

export default function PainelVendas() {
  const { profile } = useAuth()
  const ehAdmin = profile?.role === 'admin'

  const [periodo, setPeriodo] = useState('hoje')
  const [ini, setIni] = useState(hojeISO())
  const [fim, setFim] = useState(hojeISO())
  const [painel, setPainel] = useState(null)
  const [meu, setMeu] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (periodo === 'custom') return
    const [a, b] = faixaDe(periodo)
    setIni(a); setFim(b)
  }, [periodo])

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('')
    const chamadas = [supabase.rpc('venda_minhas', { p_dias: 30 })]
    if (ehAdmin) chamadas.push(supabase.rpc('venda_painel', { p_inicio: ini, p_fim: fim }))
    const res = await Promise.all(chamadas)
    if (res[0].error) setErro(res[0].error.message)
    setMeu(res[0].data || null)
    if (ehAdmin) {
      if (res[1].error) setErro(res[1].error.message)
      setPainel(res[1].data || null)
    }
    setCarregando(false)
  }, [ehAdmin, ini, fim])

  useEffect(() => { carregar() }, [carregar])

  const t = painel?.totais
  const ant = painel?.anterior
  const delta = useMemo(() => {
    if (!t || !ant) return null
    const a = Number(ant.vendas || 0), h = Number(t.vendas || 0)
    if (a === 0) return null
    return Math.round(100 * (h - a) / a)
  }, [t, ant])

  const pctBarrada = useMemo(() => {
    if (!t) return null
    const total = Number(t.vendas || 0) + Number(t.barradas || 0)
    return total === 0 ? null : Math.round(100 * Number(t.barradas || 0) / total)
  }, [t])

  const porDia = painel?.por_dia || []
  const maxDia = Math.max(1, ...porDia.map(d => Number(d.vendas || 0)))
  const gargalo = painel?.aguardando_advogado || []
  const totalGargalo = gargalo.reduce((a, g) => a + Number(g.qtd || 0), 0)

  return (
    <div>
      <div style={s.title}>💵 Painel de vendas</div>
      <div style={s.sub}>
        {ehAdmin
          ? 'Bolsa Família e os produtos de contrato somados no mesmo número.'
          : 'Sua produção e sua comissão.'}
      </div>

      {erro && <div style={s.alerta}>Não consegui carregar: {erro}</div>}

      {/* ============ VISÃO DO ADMIN ============ */}
      {ehAdmin && (<>
        <div style={s.linha}>
          {PERIODOS.map(([v, l]) => (
            <button key={v} style={{ ...s.chip, ...(periodo === v ? s.chipOn : {}) }}
              onClick={() => setPeriodo(v)}>{l}</button>
          ))}
          <button style={{ ...s.chip, ...(periodo === 'custom' ? s.chipOn : {}) }}
            onClick={() => setPeriodo('custom')}>Escolher datas</button>
          {periodo === 'custom' && (<>
            <input type="date" style={s.dataInput} value={ini} onChange={e => setIni(e.target.value)} />
            <span style={{ color: '#94a3b8', fontSize: 12 }}>até</span>
            <input type="date" style={s.dataInput} value={fim} onChange={e => setFim(e.target.value)} />
          </>)}
        </div>

        {carregando ? <div style={s.vazio}>Carregando...</div> : t && (<>
          {/* O gargalo vem ANTES dos números: é o que segura caixa hoje. */}
          {totalGargalo > 0 && (
            <div style={s.alerta}>
              <b>{totalGargalo} cliente(s) entregues esperando o vendedor dizer se o advogado aceitou.</b>{' '}
              Enquanto ninguém decide, essa venda não conta como aprovada e a comissão não fecha.
              {gargalo.slice(0, 4).map((g, i) => (
                <span key={i}> · {g.dono}: <b>{g.qtd}</b>
                  {g.mais_antiga_dias > 0 ? ' (mais antiga há ' + g.mais_antiga_dias + 'd)' : ''}</span>
              ))}
            </div>
          )}

          <div style={s.kpis}>
            <div style={s.kpi}>
              <div style={s.kpiNum}>{inteiro(t.vendas)}</div>
              <div style={s.kpiLab}>vendas aprovadas</div>
              {delta == null
                ? <div style={s.kpiNeutro}>sem base anterior</div>
                : <div style={s.kpiDelta(delta >= 0)}>
                    {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}% vs período anterior
                  </div>}
            </div>
            <div style={s.kpi}>
              <div style={{ ...s.kpiNum, color: '#0f7a52' }}>{dinheiro(t.comissao)}</div>
              <div style={s.kpiLab}>comissão a pagar no período</div>
              <div style={s.kpiNeutro}>histórico importado não gera comissão</div>
            </div>
            <div style={s.kpi}>
              <div style={{ ...s.kpiNum, color: Number(t.barradas) > 0 ? '#b3322f' : '#0f172a' }}>{inteiro(t.barradas)}</div>
              <div style={s.kpiLab}>barradas pelo advogado</div>
              {pctBarrada != null && <div style={s.kpiNeutro}>{pctBarrada}% do que foi decidido</div>}
            </div>
            <div style={s.kpi}>
              <div style={s.kpiNum}>{inteiro(t.em_aberto)}</div>
              <div style={s.kpiLab}>ainda sem decisão</div>
            </div>
            {Number(t.emprestado) > 0 && (
              <div style={s.kpi}>
                <div style={s.kpiNum}>{dinheiro(t.emprestado)}</div>
                <div style={s.kpiLab}>emprestado no Bolsa Família</div>
              </div>
            )}
          </div>

          {porDia.length > 1 && (
            <div style={s.bloco}>
              <div style={s.blocoTit}>Vendas por dia</div>
              <div style={s.blocoSub}>Aprovadas em azul; barradas em vermelho, embaixo.</div>
              <div style={s.evo}>
                {porDia.map((d, i) => (
                  <div key={i} style={s.evoCol} title={brData(d.dia) + ': ' + d.vendas + ' aprovada(s), ' + d.barradas + ' barrada(s)'}>
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <div style={s.evoBarra(74 * Number(d.vendas || 0) / maxDia, CORES[0])} />
                      {Number(d.barradas) > 0 &&
                        <div style={s.evoBarra(Math.min(20, 74 * Number(d.barradas) / maxDia), COR_BARRADA)} />}
                    </div>
                    <div style={s.evoDia}>{brData(d.dia)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={s.bloco}>
            <div style={s.blocoTit}>Por produto</div>
            <div style={s.blocoSub}>Vendas aprovadas no período.</div>
            <Barras
              itens={(painel.por_produto || []).slice(0, 5)}
              corDe={(it, i) => CORES[i] || CORES[4]}
              valorDe={it => Number(it.vendas || 0)}
              rotuloDe={it => it.produto} />
          </div>

          <div style={s.bloco}>
            <div style={s.blocoTit}>Por vendedor</div>
            <div style={s.blocoSub}>Quem vendeu, quanto caiu e quanto tem a receber.</div>
            {(painel.por_vendedor || []).length === 0
              ? <div style={s.vazio}>Nenhuma venda no período.</div>
              : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={s.tabela}>
                    <thead><tr>
                      <th style={s.th}>Vendedor</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Aprovadas</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Barradas</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>% barrada</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Comissão</th>
                    </tr></thead>
                    <tbody>
                      {painel.por_vendedor.map((v, i) => {
                        const tot = Number(v.vendas || 0) + Number(v.barradas || 0)
                        const pct = tot === 0 ? null : Math.round(100 * Number(v.barradas || 0) / tot)
                        return (
                          <tr key={i}>
                            <td style={s.td}>{v.nome}</td>
                            <td style={s.tdNum}>{inteiro(v.vendas)}</td>
                            <td style={s.tdNum}>{inteiro(v.barradas)}</td>
                            <td style={s.tdNum}>
                              {pct == null ? '—'
                                : <span style={pct >= 30 ? s.tagRuim : s.tag}>{pct}%</span>}
                            </td>
                            <td style={s.tdNum}>{dinheiro(v.comissao)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            <div style={s.aviso}>
              % barrada alta em um vendedor específico costuma ser problema de qualidade
              do cadastro, não de volume — vale olhar os motivos antes de cobrar meta.
            </div>
          </div>
        </>)}
      </>)}

      {/* ============ VISÃO DO VENDEDOR ============ */}
      {!carregando && meu && (
        <div style={{ marginTop: ehAdmin ? 26 : 0 }}>
          {ehAdmin && <div style={{ ...s.blocoTit, marginBottom: 12, fontSize: 15 }}>Minha produção</div>}

          <div style={s.kpis}>
            <div style={s.kpi}>
              <div style={s.kpiNum}>{inteiro(meu.hoje?.vendas)}</div>
              <div style={s.kpiLab}>vendas hoje</div>
              <div style={{ ...s.kpiNeutro, color: '#0f7a52', fontWeight: 700 }}>{dinheiro(meu.hoje?.comissao)}</div>
            </div>
            <div style={s.kpi}>
              <div style={s.kpiNum}>{inteiro(meu.semana?.vendas)}</div>
              <div style={s.kpiLab}>últimos 7 dias</div>
              <div style={{ ...s.kpiNeutro, color: '#0f7a52', fontWeight: 700 }}>{dinheiro(meu.semana?.comissao)}</div>
            </div>
            <div style={s.kpi}>
              <div style={s.kpiNum}>{inteiro(meu.mes?.vendas)}</div>
              <div style={s.kpiLab}>este mês</div>
              <div style={{ ...s.kpiNeutro, color: '#0f7a52', fontWeight: 700 }}>{dinheiro(meu.mes?.comissao)}</div>
            </div>
            <div style={s.kpi}>
              <div style={{ ...s.kpiNum, color: Number(meu.mes?.barradas) > 0 ? '#b3322f' : '#0f172a' }}>
                {inteiro(meu.mes?.barradas)}
              </div>
              <div style={s.kpiLab}>barradas no mês</div>
            </div>
            <div style={s.kpi}>
              <div style={s.kpiNum}>{inteiro(meu.em_aberto)}</div>
              <div style={s.kpiLab}>esperando decisão</div>
            </div>
          </div>

          {/* Motivo e nome de quem barrou ficam visíveis de propósito: quem barra
              (vendedor do advogado) e quem perde a comissão (quem fechou a venda)
              são pessoas diferentes. Sem isso, a vendedora só vê o valor sumir. */}
          {(meu.barradas_recentes || []).length > 0 && (
            <div style={s.bloco}>
              <div style={s.blocoTit}>Vendas que caíram</div>
              <div style={s.blocoSub}>Com o motivo e quem registrou. Se discordar, fale com essa pessoa.</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={s.tabela}>
                  <thead><tr>
                    <th style={s.th}>Cliente</th>
                    <th style={s.th}>Produto</th>
                    <th style={s.th}>Motivo</th>
                    <th style={s.th}>Quem</th>
                    <th style={s.th}>Reposição</th>
                  </tr></thead>
                  <tbody>
                    {meu.barradas_recentes.map((b, i) => (
                      <tr key={i}>
                        <td style={s.td}>{b.cliente}</td>
                        <td style={s.td}><span style={s.tag}>{b.produto}</span></td>
                        <td style={{ ...s.td, maxWidth: 300 }}>{b.motivo}</td>
                        <td style={s.td}>{b.quem}</td>
                        <td style={s.td}>{b.reposicao_pedida
                          ? <span style={s.tagBom}>pedida</span>
                          : <span style={s.tag}>não</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={s.bloco}>
            <div style={s.blocoTit}>Minhas vendas (30 dias)</div>
            <div style={s.blocoSub}>Só conta comissão o que o advogado aceitou.</div>
            {(meu.lista || []).length === 0
              ? <div style={s.vazio}>Nenhuma venda registrada ainda.</div>
              : (
                <div style={{ overflowX: 'auto', maxHeight: '52vh', scrollbarWidth: 'thin' }}>
                  <table style={s.tabela}>
                    <thead><tr>
                      <th style={s.th}>Data</th>
                      <th style={s.th}>Cliente</th>
                      <th style={s.th}>Produto</th>
                      <th style={s.th}>Situação</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Comissão</th>
                    </tr></thead>
                    <tbody>
                      {meu.lista.map(v => (
                        <tr key={v.id}>
                          <td style={s.td}>{brData(v.data_venda)}</td>
                          <td style={s.td}>{v.cliente}</td>
                          <td style={s.td}><span style={s.tag}>{v.produto}</span></td>
                          <td style={s.td}>
                            {v.status === 'barrada'
                              ? <span style={s.tagRuim} title={v.motivo || ''}>barrada</span>
                              : v.status === 'aprovada' || v.status === 'concluida'
                              ? <span style={s.tagBom}>aprovada</span>
                              : <span style={s.tag}>{v.status.replace('_', ' ')}</span>}
                          </td>
                          <td style={s.tdNum}>
                            {v.conta_comissao === false
                              ? <span style={{ color: '#94a3b8', fontSize: 11.5 }}>histórico</span>
                              : dinheiro(v.comissao)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            <div style={s.aviso}>
              Vendas marcadas como <b>histórico</b> vieram da importação e não geram comissão —
              a comissão vale a partir da data combinada.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
