import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import ModalNovaVenda from '../components/ModalNovaVenda'

// 31/08 v2 — Painel de Vendas, depois de conferir os números contra o banco.
// O que estava errado e foi corrigido:
//   • o robô "IA Atendimento" aparecia como o MAIOR vendedor do mês (94 vendas).
//     Robô não tem meta nem comissão — saiu do ranking e virou uma nota de rodapé.
//   • Bolsa Família perdia venda: nada alimentava o painel depois da importação.
//     Agora entra sozinha (gatilho no banco); as 40 que faltavam foram recuperadas.
//   • comissão aparecia em três lugares somando sempre zero. Ficou em um só.
//   • o admin via a "produção dele" repetindo o painel geral. Saiu.
//
// Regra de leitura da tela: cada número aparece UMA vez, no lugar onde ele responde
// uma pergunta. Se um número não muda nenhuma decisão, ele não entra.
const CORES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#94a3b8']
const COR_BARRADA = '#e34948'
const COR_TEXTO = '#0f172a'
const COR_FRACA = '#94a3b8'
const COR_MEDIA = '#5b6b84'

const PERIODOS = [['hoje', 'Hoje'], ['7d', '7 dias'], ['mes', 'Este mês'], ['30d', '30 dias']]

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
  title: { fontSize: 20, fontWeight: 500, color: COR_TEXTO, marginBottom: 3 },
  sub: { fontSize: 13, color: COR_MEDIA, marginBottom: 18 },

  barraTopo: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 },
  chip: { padding: '7px 14px', fontSize: 12.5, fontWeight: 500, borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.12)', background: '#ffffff', color: COR_MEDIA, cursor: 'pointer', whiteSpace: 'nowrap' },
  chipOn: { background: COR_TEXTO, color: '#ffffff', borderColor: COR_TEXTO },
  dataInput: { padding: '6px 10px', fontSize: 12.5, borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.18)' },

  // 4 números, não 6. Cada um responde uma pergunta diferente.
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(158px, 1fr))', gap: 1,
          background: 'rgba(15,23,42,0.08)', border: '0.5px solid rgba(15,23,42,0.08)',
          borderRadius: 12, overflow: 'hidden', marginBottom: 20 },
  kpi: { background: '#ffffff', padding: '15px 17px' },
  kpiNum: { fontSize: 30, fontWeight: 700, color: COR_TEXTO, lineHeight: 1.05, letterSpacing: '-0.8px' },
  kpiLab: { fontSize: 11.5, color: COR_MEDIA, marginTop: 5, lineHeight: 1.35 },
  kpiPe: { fontSize: 11, marginTop: 7, lineHeight: 1.4 },

  faixa: (tom) => ({
    fontSize: 12.5, lineHeight: 1.6, borderRadius: 10, padding: '11px 14px', marginBottom: 16,
    color: tom === 'alerta' ? '#7c2d12' : COR_MEDIA,
    background: tom === 'alerta' ? 'rgba(237,161,0,.14)' : '#f8fafc',
    border: '0.5px solid ' + (tom === 'alerta' ? 'rgba(237,161,0,.5)' : 'rgba(15,23,42,0.08)'),
  }),

  colunas: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 14, alignItems: 'start' },
  bloco: { background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.10)', borderRadius: 12, padding: 17, marginBottom: 14 },
  blocoTit: { fontSize: 13.5, fontWeight: 600, color: COR_TEXTO, marginBottom: 2 },
  blocoSub: { fontSize: 11, color: COR_FRACA, marginBottom: 15 },

  barraLinha: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11 },
  barraNome: { fontSize: 12.5, color: COR_TEXTO, width: 132, flexShrink: 0, textAlign: 'right',
               overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  barraTrilho: { flex: 1, height: 20, background: '#f1f5f9', borderRadius: 4, display: 'flex', gap: 2, overflow: 'hidden' },
  barraFill: (cor, pct) => ({ width: Math.max(pct, 0) + '%', background: cor, borderRadius: '0 4px 4px 0' }),
  barraVal: { fontSize: 12.5, fontWeight: 700, color: COR_TEXTO, width: 46, flexShrink: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  barraSec: { fontSize: 11, color: COR_BARRADA, width: 62, flexShrink: 0, fontVariantNumeric: 'tabular-nums' },

  evo: { display: 'flex', alignItems: 'flex-end', gap: 3, height: 96, overflowX: 'auto', paddingTop: 4 },
  evoCol: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 20, flex: 1 },
  evoBarra: (h, cor) => ({ width: '100%', maxWidth: 22, height: Math.max(h, 2), background: cor, borderRadius: '3px 3px 0 0' }),
  evoDia: { fontSize: 9, color: COR_FRACA, whiteSpace: 'nowrap' },

  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 },
  th: { textAlign: 'left', fontSize: 10, color: COR_FRACA, fontWeight: 600, padding: '6px 8px',
        borderBottom: '0.5px solid rgba(15,23,42,0.10)', textTransform: 'uppercase', letterSpacing: '.4px' },
  td: { padding: '9px 8px', borderBottom: '0.5px solid rgba(15,23,42,0.05)', color: COR_TEXTO },
  tdNum: { padding: '9px 8px', borderBottom: '0.5px solid rgba(15,23,42,0.05)', color: COR_TEXTO,
           textAlign: 'right', fontVariantNumeric: 'tabular-nums' },

  tag: { fontSize: 10.5, color: COR_MEDIA, background: '#f1f5f9', borderRadius: 5, padding: '2px 7px' },
  tagRuim: { fontSize: 10.5, fontWeight: 700, color: '#b3322f', background: 'rgba(227,73,72,.13)', borderRadius: 5, padding: '2px 7px' },
  tagBom: { fontSize: 10.5, fontWeight: 700, color: '#0f7a52', background: 'rgba(27,175,122,.15)', borderRadius: 5, padding: '2px 7px' },
  vazio: { fontSize: 12.5, color: COR_FRACA, padding: '20px 6px', textAlign: 'center' },
  nota: { fontSize: 11, color: COR_FRACA, marginTop: 12, lineHeight: 1.5 },
}

// barra com rótulo e número visíveis: cor identifica, texto informa
function Barras({ itens, valorDe, secDe, rotuloDe }) {
  const max = Math.max(1, ...itens.map(valorDe))
  if (!itens.length) return <div style={s.vazio}>Nada no período.</div>
  return (
    <div>
      {itens.map((it, i) => {
        const sec = secDe ? Number(secDe(it) || 0) : 0
        return (
          <div key={rotuloDe(it) + i} style={s.barraLinha}>
            <div style={s.barraNome} title={rotuloDe(it)}>{rotuloDe(it)}</div>
            <div style={s.barraTrilho}>
              <div style={s.barraFill(CORES[i] || CORES[4], 100 * valorDe(it) / max)} />
              {sec > 0 && <div style={s.barraFill(COR_BARRADA, 100 * sec / max)} />}
            </div>
            <div style={s.barraVal}>{inteiro(valorDe(it))}</div>
            {secDe && <div style={s.barraSec}>{sec > 0 ? '−' + sec : ''}</div>}
          </div>
        )
      })}
    </div>
  )
}

export default function PainelVendas() {
  const { profile } = useAuth()
  const ehAdmin = profile?.role === 'admin'

  const [periodo, setPeriodo] = useState('mes')
  const [ini, setIni] = useState(inicioMes())
  const [fim, setFim] = useState(hojeISO())
  const [painel, setPainel] = useState(null)
  const [meu, setMeu] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [modalVenda, setModalVenda] = useState(false)

  useEffect(() => {
    if (periodo === 'custom') return
    const [a, b] = faixaDe(periodo)
    setIni(a); setFim(b)
  }, [periodo])

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('')
    // o admin não precisa da própria produção aqui — ela já está no painel geral
    const res = ehAdmin
      ? [await supabase.rpc('venda_painel', { p_inicio: ini, p_fim: fim })]
      : [await supabase.rpc('venda_minhas', { p_dias: 30 })]
    if (res[0].error) setErro(res[0].error.message)
    if (ehAdmin) setPainel(res[0].data || null); else setMeu(res[0].data || null)
    setCarregando(false)
  }, [ehAdmin, ini, fim])

  useEffect(() => { carregar() }, [carregar])

  const t = painel?.totais
  const ant = painel?.anterior
  const decididas = t ? Number(t.vendas || 0) + Number(t.barradas || 0) : 0
  const pctBarrada = decididas ? Math.round(100 * Number(t.barradas || 0) / decididas) : null

  // A comparação só vale quando os dois períodos são da operação. Comparar
  // importação com importação produz variação que não aconteceu na vida real.
  const delta = useMemo(() => {
    if (!t || !ant) return null
    if (Number(t.importadas || 0) > 0 || Number(ant.importadas || 0) > 0) return null
    const a = Number(ant.vendas || 0), h = Number(t.vendas || 0)
    return a === 0 ? null : Math.round(100 * (h - a) / a)
  }, [t, ant])

  const porDia = painel?.por_dia || []
  const maxDia = Math.max(1, ...porDia.map(d => Number(d.vendas || 0)))
  const gargalo = painel?.aguardando_advogado || []
  const totalGargalo = gargalo.reduce((a, g) => a + Number(g.qtd || 0), 0)
  const robo = painel?.robo

  return (
    <div>
      <div style={s.title}>💵 Painel de vendas</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ ...s.sub, marginBottom: 0 }}>
          {ehAdmin ? 'Bolsa Família e produtos de contrato somados no mesmo número.'
                   : 'Sua produção e sua comissão.'}
        </div>
        <button style={{ padding: '10px 18px', fontSize: 13.5, fontWeight: 600, borderRadius: 10,
                         border: 'none', background: '#1baf7a', color: '#fff', cursor: 'pointer' }}
          onClick={() => setModalVenda(true)}>+ Nova venda</button>
      </div>

      {erro && <div style={s.faixa('alerta')}>Não consegui carregar: {erro}</div>}

      {/* ================= ADMIN ================= */}
      {ehAdmin && (<>
        <div style={s.barraTopo}>
          {PERIODOS.map(([v, l]) => (
            <button key={v} style={{ ...s.chip, ...(periodo === v ? s.chipOn : {}) }}
              onClick={() => setPeriodo(v)}>{l}</button>
          ))}
          <button style={{ ...s.chip, ...(periodo === 'custom' ? s.chipOn : {}) }}
            onClick={() => setPeriodo('custom')}>Escolher</button>
          {periodo === 'custom' && (<>
            <input type="date" style={s.dataInput} value={ini} onChange={e => setIni(e.target.value)} />
            <span style={{ color: COR_FRACA, fontSize: 12 }}>até</span>
            <input type="date" style={s.dataInput} value={fim} onChange={e => setFim(e.target.value)} />
          </>)}
        </div>

        {carregando ? <div style={s.vazio}>Carregando...</div> : t && (<>
          {/* o que trava caixa vem primeiro */}
          {totalGargalo > 0 && (
            <div style={s.faixa('alerta')}>
              <b>{totalGargalo} cliente(s) entregues esperando alguém dizer se o advogado aceitou.</b>{' '}
              Sem essa decisão a venda não fecha e a comissão não sai.
              {gargalo.slice(0, 4).map((g, i) => (
                <span key={i}> · {g.dono}: <b>{g.qtd}</b>
                  {g.mais_antiga_dias > 0 ? ' (há ' + g.mais_antiga_dias + 'd)' : ''}</span>
              ))}
            </div>
          )}

          {Number(t.importadas) > 0 && Number(t.proprias) === 0 && (
            <div style={s.faixa()}>
              Todas as <b>{inteiro(t.importadas)}</b> vendas deste período vieram da importação
              do histórico. Elas contam volume, mas <b>não geram comissão</b> — a comissão passa a
              valer nas vendas registradas a partir da data que você definir.
            </div>
          )}

          <div style={s.kpis}>
            <div style={s.kpi}>
              <div style={s.kpiNum}>{inteiro(t.vendas)}</div>
              <div style={s.kpiLab}>vendas aprovadas</div>
              <div style={{ ...s.kpiPe, color: delta == null ? COR_FRACA : (delta >= 0 ? '#0f7a52' : '#b3322f'),
                            fontWeight: delta == null ? 400 : 700 }}>
                {delta == null ? 'sem base comparável' :
                  (delta >= 0 ? '▲ ' : '▼ ') + Math.abs(delta) + '% vs período anterior'}
              </div>
            </div>
            <div style={s.kpi}>
              <div style={{ ...s.kpiNum, color: Number(t.barradas) > 0 ? '#b3322f' : COR_TEXTO }}>
                {inteiro(t.barradas)}
              </div>
              <div style={s.kpiLab}>barradas pelo advogado</div>
              <div style={{ ...s.kpiPe, color: COR_FRACA }}>
                {pctBarrada == null ? '—' : pctBarrada + '% do que foi decidido'}
              </div>
            </div>
            <div style={s.kpi}>
              <div style={s.kpiNum}>{inteiro(t.em_aberto)}</div>
              <div style={s.kpiLab}>ainda sem decisão</div>
              <div style={{ ...s.kpiPe, color: COR_FRACA }}>não contam como venda</div>
            </div>
            <div style={s.kpi}>
              <div style={{ ...s.kpiNum, color: Number(t.comissao) > 0 ? '#0f7a52' : COR_TEXTO }}>
                {dinheiro(t.comissao)}
              </div>
              <div style={s.kpiLab}>comissão do período</div>
              <div style={{ ...s.kpiPe, color: COR_FRACA }}>
                {Number(t.emprestado) > 0 ? dinheiro(t.emprestado) + ' emprestados no BF' : 'só o que já foi aprovado'}
              </div>
            </div>
          </div>

          {porDia.length > 1 && (
            <div style={s.bloco}>
              <div style={s.blocoTit}>Vendas por dia</div>
              <div style={s.blocoSub}>Aprovadas em azul · barradas em vermelho embaixo</div>
              <div style={s.evo}>
                {porDia.map((d, i) => (
                  <div key={i} style={s.evoCol}
                    title={brData(d.dia) + ': ' + d.vendas + ' aprovada(s), ' + d.barradas + ' barrada(s)'}>
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <div style={s.evoBarra(64 * Number(d.vendas || 0) / maxDia, CORES[0])} />
                      {Number(d.barradas) > 0 &&
                        <div style={s.evoBarra(Math.min(18, 64 * Number(d.barradas) / maxDia), COR_BARRADA)} />}
                    </div>
                    <div style={s.evoDia}>{brData(d.dia)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={s.colunas}>
            <div style={s.bloco}>
              <div style={s.blocoTit}>Por produto</div>
              <div style={s.blocoSub}>Barra azul = aprovadas · vermelho = barradas</div>
              <Barras
                itens={(painel.por_produto || []).slice(0, 5)}
                valorDe={it => Number(it.vendas || 0)}
                secDe={it => Number(it.barradas || 0)}
                rotuloDe={it => it.produto} />
            </div>

            <div style={s.bloco}>
              <div style={s.blocoTit}>Por vendedor</div>
              <div style={s.blocoSub}>Só pessoas. Robô não tem meta nem comissão.</div>
              {(painel.por_vendedor || []).length === 0
                ? <div style={s.vazio}>Nenhuma venda no período.</div>
                : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={s.tabela}>
                      <thead><tr>
                        <th style={s.th}>Vendedor</th>
                        <th style={{ ...s.th, textAlign: 'right' }}>Vendas</th>
                        <th style={{ ...s.th, textAlign: 'right' }}>Barradas</th>
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
                              <td style={s.tdNum}>
                                {Number(v.barradas) === 0 ? <span style={{ color: COR_FRACA }}>—</span>
                                  : <span style={pct >= 30 ? s.tagRuim : s.tag}>{v.barradas} · {pct}%</span>}
                              </td>
                              <td style={s.tdNum}>
                                {Number(v.comissao) > 0 ? dinheiro(v.comissao)
                                  : <span style={{ color: COR_FRACA }}>—</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              {robo && Number(robo.vendas) > 0 && (
                <div style={s.nota}>
                  🤖 O atendimento por IA fechou <b>{inteiro(robo.vendas)}</b> e teve{' '}
                  <b>{inteiro(robo.barradas)}</b> barradas no período. Fica fora do ranking de
                  propósito — só entra aqui para o total não ficar sem explicação.
                </div>
              )}
              <div style={s.nota}>
                Percentual de barrada alto em uma pessoa costuma ser qualidade do cadastro,
                não volume. Vale ver os motivos antes de cobrar meta.
              </div>
            </div>
          </div>
        </>)}
      </>)}

      {/* ================= VENDEDOR ================= */}
      {!ehAdmin && !carregando && meu && (<>
        <div style={s.kpis}>
          <div style={s.kpi}>
            <div style={s.kpiNum}>{inteiro(meu.hoje?.vendas)}</div>
            <div style={s.kpiLab}>vendas hoje</div>
            <div style={{ ...s.kpiPe, color: '#0f7a52', fontWeight: 700 }}>{dinheiro(meu.hoje?.comissao)}</div>
          </div>
          <div style={s.kpi}>
            <div style={s.kpiNum}>{inteiro(meu.semana?.vendas)}</div>
            <div style={s.kpiLab}>últimos 7 dias</div>
            <div style={{ ...s.kpiPe, color: '#0f7a52', fontWeight: 700 }}>{dinheiro(meu.semana?.comissao)}</div>
          </div>
          <div style={s.kpi}>
            <div style={s.kpiNum}>{inteiro(meu.mes?.vendas)}</div>
            <div style={s.kpiLab}>este mês</div>
            <div style={{ ...s.kpiPe, color: '#0f7a52', fontWeight: 700 }}>{dinheiro(meu.mes?.comissao)}</div>
          </div>
          <div style={s.kpi}>
            <div style={{ ...s.kpiNum, color: Number(meu.mes?.barradas) > 0 ? '#b3322f' : COR_TEXTO }}>
              {inteiro(meu.mes?.barradas)}
            </div>
            <div style={s.kpiLab}>barradas no mês</div>
            <div style={{ ...s.kpiPe, color: COR_FRACA }}>
              {Number(meu.em_aberto) > 0 ? inteiro(meu.em_aberto) + ' esperando decisão' : 'nada em espera'}
            </div>
          </div>
        </div>

        {/* motivo e autor visíveis: quem barra e quem perde a comissão são
            pessoas diferentes, e sem isso a vendedora só vê o valor sumir */}
        {(meu.barradas_recentes || []).length > 0 && (
          <div style={s.bloco}>
            <div style={s.blocoTit}>Vendas que caíram</div>
            <div style={s.blocoSub}>Com o motivo e quem registrou. Se discordar, fale com essa pessoa.</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={s.tabela}>
                <thead><tr>
                  <th style={s.th}>Cliente</th>
                  <th style={s.th}>Motivo</th>
                  <th style={s.th}>Quem</th>
                  <th style={s.th}>Reposição</th>
                </tr></thead>
                <tbody>
                  {meu.barradas_recentes.map((b, i) => (
                    <tr key={i}>
                      <td style={s.td}>{b.cliente}<div style={{ fontSize: 10.5, color: COR_FRACA }}>{b.produto}</div></td>
                      <td style={{ ...s.td, maxWidth: 260 }}>{b.motivo}</td>
                      <td style={s.td}>{b.quem}</td>
                      <td style={s.td}>{b.reposicao_pedida
                        ? <span style={s.tagBom}>pedida</span> : <span style={s.tag}>não</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={s.bloco}>
          <div style={s.blocoTit}>Minhas vendas · últimos 30 dias</div>
          <div style={s.blocoSub}>Só gera comissão o que o advogado aceitou</div>
          {(meu.lista || []).length === 0
            ? <div style={s.vazio}>Nenhuma venda registrada ainda.</div>
            : (
              <div style={{ overflowX: 'auto', maxHeight: '52vh', scrollbarWidth: 'thin' }}>
                <table style={s.tabela}>
                  <thead><tr>
                    <th style={s.th}>Data</th>
                    <th style={s.th}>Cliente</th>
                    <th style={s.th}>Situação</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Comissão</th>
                  </tr></thead>
                  <tbody>
                    {meu.lista.map(v => (
                      <tr key={v.id}>
                        <td style={s.td}>{brData(v.data_venda)}</td>
                        <td style={s.td}>{v.cliente}
                          <div style={{ fontSize: 10.5, color: COR_FRACA }}>{v.produto}</div></td>
                        <td style={s.td}>
                          {v.status === 'barrada'
                            ? <span style={s.tagRuim} title={v.motivo || ''}>barrada</span>
                            : v.status === 'aprovada' || v.status === 'concluida'
                            ? <span style={s.tagBom}>aprovada</span>
                            : <span style={s.tag}>{String(v.status).replace('_', ' ')}</span>}
                        </td>
                        <td style={s.tdNum}>
                          {v.conta_comissao === false
                            ? <span style={{ color: COR_FRACA, fontSize: 11 }}>histórico</span>
                            : dinheiro(v.comissao)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          <div style={s.nota}>
            Marcadas como <b>histórico</b> vieram da importação e não geram comissão.
          </div>
        </div>
      </>)}

      {modalVenda && (
        <ModalNovaVenda
          aoFechar={() => setModalVenda(false)}
          aoSalvar={() => carregar()} />
      )}
    </div>
  )
}
