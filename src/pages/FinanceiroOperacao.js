import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ============================================================
// FINANCEIRO DA OPERAÇÃO (30/10/2026, Bruno) — só Bruno e Fábio
//   ⚖️ Equilíbrio  : custo fixo do mês, contratos pagos, lucro e quanto falta para empatar
//   💸 Comissão    : relatório da sexta por time, sobre o que o Acompanhamento marcou
//                    como "Cliente pagou" na semana (sábado a sexta)
// Tudo vem das RPCs fin_equilibrio / fin_comissao_semana (banco confere o acesso).
// O time da vendedora sai dos responsáveis do Acompanhamento (posdef_responsaveis).
// ============================================================

const VERDE = '#059669', VERMELHO = '#dc2626', LARANJA = '#b45309', AZUL = '#2563eb', CINZA = '#5b6b84', TINTA = '#0f172a'
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const CATEGORIAS = { folha: 'Folha', ferramenta: 'Ferramenta', sistema: 'Sistema / IA', outro: 'Outro' }

const reais = v => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const reais0 = v => `R$ ${Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
const numBR = s => { const t = String(s ?? '').trim(); if (!t) return null; return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t) }
const dataBR = v => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—')
const dataHoraBR = v => (v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—')
const fmtCpf = c => { const d = String(c || '').replace(/\D/g, ''); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : (c || '—') }
const isoDia = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const somaDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDia(d) }

const caixa = { background: '#fff', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 14, padding: '14px 16px' }
const rotulo = { fontSize: 11, textTransform: 'uppercase', color: CINZA, fontWeight: 700, letterSpacing: 0.4 }

function Kpi({ t, v, s, cor }) {
  return (
    <div className="dc-kpi" style={{ borderTopColor: cor || '#64748b' }}>
      <span className="dc-kpi-t">{t}</span><b style={{ color: cor || TINTA }}>{v}</b>{s && <span className="dc-kpi-s">{s}</span>}
    </div>
  )
}

async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); return true } catch (_) { return false }
}

// ------------------------------------------------------------ ⚖️ EQUILÍBRIO
export function Equilibrio() {
  const [hoje] = useState(() => new Date())
  const opcoesMes = useMemo(() => [-2, -1, 0, 1, 2].map(n => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + n, 1)
    return { v: isoDia(d), l: `${MESES[d.getMonth()]}/${d.getFullYear()}` }
  }), [hoje])
  const [mes, setMes] = useState(opcoesMes[2].v)
  const [d, setD] = useState(null)
  const [erro, setErro] = useState('')
  const [editando, setEditando] = useState(null)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    setErro('')
    const { data, error } = await supabase.rpc('fin_equilibrio', { p_mes: mes })
    if (error) { setErro(error.message); setD({}); return }
    setD(data || {})
  }, [mes])
  useEffect(() => { carregar() }, [carregar])

  const conta = useMemo(() => {
    if (!d || !d.parametros) return null
    const p = d.parametros
    const imp = Number(p.imposto_pct || 0) / 100
    const hon = Number(p.honorario || 0)
    const liq = hon * (1 - imp)
    const times = (d.times || []).filter(t => t.comissao != null)
      .map(t => ({ ...t, margem: liq - Number(t.comissao) - Number(p.fabio_por_contrato || 0) - Number(p.prevsempre_taxa || 0) }))
    const margens = times.map(t => t.margem)
    const piorMargem = margens.length ? Math.min(...margens) : 0
    const melhorMargem = margens.length ? Math.max(...margens) : 0
    const fixo = Number(d.custo_fixo || 0)
    const pg = d.pagos || {}
    const qtd = Number(pg.qtd || 0)
    const receita = Number(pg.receita || 0)
    const imposto = receita * imp
    const variaveis = Number(pg.comissoes || 0) + Number(pg.fabio || 0) + Number(pg.prevsempre || 0) + imposto
    const lucro = receita - variaveis - fixo
    const margemReal = qtd > 0 ? (receita - variaveis) / qtd : null
    // inadimplência: real do Acompanhamento (com pelo menos 5 casos vencidos) ou a informada
    const ina = d.inadimplencia || {}
    const vencidos = Number(ina.pagaram || 0) + Number(ina.inadimplentes || 0)
    const taxaReal = vencidos > 0 ? Number(ina.inadimplentes || 0) / vencidos : null
    const taxaParam = p.inadimplencia_pct != null ? Number(p.inadimplencia_pct) / 100 : null
    const taxa = vencidos >= 5 ? taxaReal : (taxaParam != null ? taxaParam : taxaReal)
    const eqMin = melhorMargem > 0 ? Math.ceil(fixo / melhorMargem) : null
    const eqMax = piorMargem > 0 ? Math.ceil(fixo / piorMargem) : null
    const eqReal = margemReal && margemReal > 0 ? Math.ceil(fixo / margemReal) : null
    const alvo = eqReal || eqMax
    const faltam = alvo != null ? Math.max(0, alvo - qtd) : null
    const comInad = n => (n != null && taxa != null && taxa < 1 ? Math.ceil(n / (1 - taxa)) : null)
    return { p, imp, times, fixo, qtd, receita, imposto, variaveis, lucro, margemReal, taxa, taxaReal, vencidos, eqMin, eqMax, eqReal, faltam, comInad, pg }
  }, [d])

  async function salvarCusto(c) {
    setSalvando(true)
    const { error } = await supabase.rpc('fin_custo_salvar', { p: c })
    setSalvando(false)
    if (error) { alert('Erro: ' + error.message); return }
    setEditando(null); carregar()
  }
  async function excluirCusto(c) {
    if (!window.confirm(`Excluir "${c.nome}" dos custos fixos?`)) return
    const { error } = await supabase.rpc('fin_custo_excluir', { p_id: c.id })
    if (error) { alert('Erro: ' + error.message); return }
    carregar()
  }
  async function salvarParam(chave, valorTxt) {
    const v = numBR(valorTxt)
    if (v != null && Number.isNaN(v)) { alert('Valor inválido'); return }
    const { error } = await supabase.rpc('fin_param_salvar', { p_chave: chave, p_valor: v })
    if (error) { alert('Erro: ' + error.message); return }
    carregar()
  }

  if (d === null) return <div className="dc-vazio">Carregando…</div>
  if (erro) return <div style={{ background: 'rgba(248,113,113,.14)', color: VERMELHO, padding: '10px 14px', borderRadius: 10, fontSize: 13 }}>{erro}</div>
  if (!conta) return <div className="dc-vazio">Sem dados.</div>
  const c = conta
  const nomeMes = opcoesMes.find(o => o.v === mes)?.l || mes

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select className="dc-in" value={mes} onChange={e => setMes(e.target.value)}>
          {opcoesMes.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
        <span style={{ fontSize: 12.5, color: CINZA }}>Custo do mês de competência · contratos pagos = marcados "Cliente pagou" no Acompanhamento dentro do mês.</span>
      </div>

      <div className="dc-kpis" style={{ marginBottom: 0 }}>
        <Kpi t="Custo fixo do mês" v={reais0(c.fixo)} s={`${(d.custos || []).length} itens`} cor={LARANJA} />
        <Kpi t="Contratos pagos" v={c.qtd} s={reais0(c.receita) + ' recebidos'} cor={AZUL} />
        <Kpi t={c.lucro >= 0 ? 'Lucro do mês' : 'Falta cobrir'} v={reais0(Math.abs(c.lucro))} s={c.lucro >= 0 ? 'já pagou o fixo' : 'para empatar o mês'} cor={c.lucro >= 0 ? VERDE : VERMELHO} />
        <Kpi t="Faltam para empatar" v={c.faltam == null ? '—' : `${c.faltam} contratos`} s={c.eqReal ? 'pela margem real do mês' : 'no pior caso (time de R$500)'} cor={c.faltam ? VERMELHO : VERDE} />
      </div>

      <div style={caixa}>
        <div style={{ ...rotulo, marginBottom: 8 }}>⚖️ Ponto de equilíbrio · {nomeMes}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, color: TINTA }}>{c.eqMin ?? '—'}{c.eqMax && c.eqMax !== c.eqMin ? ` a ${c.eqMax}` : ''} <span style={{ fontSize: 14, fontWeight: 600, color: CINZA }}>contratos pagos</span></div>
            <div style={{ fontSize: 12.5, color: CINZA }}>≈ {c.eqMin ? Math.ceil(c.eqMin / 4.3) : '—'}{c.eqMax && c.eqMax !== c.eqMin ? `–${Math.ceil(c.eqMax / 4.3)}` : ''} por semana · depende de qual time vendeu</div>
            {c.eqReal && <div style={{ fontSize: 12.5, color: AZUL, marginTop: 4 }}>Pela margem real do mês ({reais0(c.margemReal)}/contrato): <b>{c.eqReal}</b> contratos</div>}
          </div>
          <div>
            <div style={{ fontSize: 13, color: TINTA }}>
              Inadimplência usada: <b>{c.taxa == null ? 'sem dado ainda' : `${Math.round(c.taxa * 100)}%`}</b>
            </div>
            <div style={{ fontSize: 12.5, color: CINZA, marginTop: 2 }}>
              {c.vencidos > 0 ? `Real do mês: ${d.inadimplencia.inadimplentes} de ${c.vencidos} não pagaram (${Math.round((c.taxaReal || 0) * 100)}%)` : 'Nenhum caso com data de pagamento vencida no mês ainda.'}
              {c.vencidos < 5 && c.p.inadimplencia_pct != null ? ` · usando a taxa informada (${c.p.inadimplencia_pct}%) até ter 5 casos` : ''}
            </div>
            {c.taxa != null && c.taxa > 0 && (
              <div style={{ fontSize: 13, color: TINTA, marginTop: 6 }}>
                Precisam chegar à data de pagamento: <b>{c.comInad(c.eqMin)}{c.eqMax !== c.eqMin ? ` a ${c.comInad(c.eqMax)}` : ''}</b> contratos
              </div>
            )}
            <div style={{ fontSize: 12, color: CINZA, marginTop: 6 }}>Inadimplente não gera comissão: vendedor só recebe no pago.</div>
          </div>
          <div>
            <div style={{ fontSize: 13, color: TINTA }}>Previsto para receber no mês: <b>{d.previsto?.qtd || 0}</b> contratos ({reais0(d.previsto?.receita)})</div>
            <div style={{ fontSize: 12.5, color: CINZA, marginTop: 2 }}>Casos aguardando com data de pagamento no mês e ainda no prazo.</div>
            {Number(c.imp) === 0 && <div style={{ fontSize: 12.5, color: LARANJA, marginTop: 6, fontWeight: 700 }}>⚠ Imposto em 0% — informe o % abaixo para a conta fechar.</div>}
          </div>
        </div>
      </div>

      <div style={caixa}>
        <div style={{ ...rotulo, marginBottom: 8 }}>Quanto sobra de cada contrato pago</div>
        <div className="dc-tabela-wrap" style={{ border: 'none' }}>
          <table className="dc-tabela">
            <thead><tr><th>Time</th><th style={{ textAlign: 'right' }}>Honorário</th><th style={{ textAlign: 'right' }}>Imposto</th><th style={{ textAlign: 'right' }}>Comissão</th><th style={{ textAlign: 'right' }}>Fábio</th><th style={{ textAlign: 'right' }}>PrevSempre</th><th style={{ textAlign: 'right' }}>Sobra</th></tr></thead>
            <tbody>
              {c.times.map(t => (
                <tr key={t.chave}>
                  <td style={{ fontWeight: 700 }}>{t.nome}</td>
                  <td style={{ textAlign: 'right' }}>{reais0(c.p.honorario)}</td>
                  <td style={{ textAlign: 'right' }}>{reais0(c.p.honorario * c.imp)}</td>
                  <td style={{ textAlign: 'right' }}>{reais0(t.comissao)}</td>
                  <td style={{ textAlign: 'right' }}>{reais0(c.p.fabio_por_contrato)}</td>
                  <td style={{ textAlign: 'right' }}>{reais0(c.p.prevsempre_taxa)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: VERDE }}>{reais0(t.margem)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 12, color: CINZA, marginTop: 6 }}>Conta no pior caso (contrato cai na PrevSempre). Fora da PrevSempre sobra {reais0(c.p.prevsempre_taxa)} a mais. RT CRÉDITOS está sem regra de comissão (independente).</div>
      </div>

      {c.qtd > 0 && (
        <div style={caixa}>
          <div style={{ ...rotulo, marginBottom: 8 }}>Resultado do mês até agora</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '6px 18px', fontSize: 13 }}>
            <span>Recebido: <b>{reais(c.receita)}</b></span>
            <span>Comissões: <b>{reais(c.pg.comissoes)}</b></span>
            <span>Fábio: <b>{reais(c.pg.fabio)}</b></span>
            <span>PrevSempre: <b>{reais(c.pg.prevsempre)}</b> ({c.pg.prevsempre_qtd})</span>
            <span>Imposto: <b>{reais(c.imposto)}</b></span>
            <span>Custo fixo: <b>{reais(c.fixo)}</b></span>
            <span style={{ color: c.lucro >= 0 ? VERDE : VERMELHO }}>Resultado: <b>{reais(c.lucro)}</b></span>
            {c.pg.sem_regra > 0 && <span style={{ color: LARANJA }}>{c.pg.sem_regra} pago(s) sem regra de comissão (RT / sem time)</span>}
          </div>
        </div>
      )}

      <div style={caixa}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <div style={rotulo}>Custos fixos · {nomeMes} · {reais(c.fixo)}</div>
          <button className="dc-btn dc-btn-ok" onClick={() => setEditando({ nome: '', categoria: 'folha', valor: '', inicio: mes, fim: '', obs: '' })}>➕ Novo custo</button>
        </div>
        <div className="dc-tabela-wrap" style={{ border: 'none' }}>
          <table className="dc-tabela">
            <thead><tr><th>Custo</th><th>Tipo</th><th>Vale de</th><th style={{ textAlign: 'right' }}>Valor/mês</th><th></th></tr></thead>
            <tbody>
              {(d.custos || []).map(x => (
                <tr key={x.id}>
                  <td><div style={{ fontWeight: 600 }}>{x.nome}</div>{x.obs && <div style={{ fontSize: 11.5, color: /INFORMAR|confirmar/i.test(x.obs) ? LARANJA : CINZA }}>{x.obs}</div>}</td>
                  <td><span className="dc-badge">{CATEGORIAS[x.categoria] || x.categoria}</span></td>
                  <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{dataBR(x.inicio)}{x.fim ? ` até ${dataBR(x.fim)}` : ' em diante'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{reais(x.valor)}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <button className="dc-btn" onClick={() => setEditando({ ...x, fim: x.fim || '', obs: x.obs || '' })}>✎</button>
                    <button className="dc-btn dc-btn-del" onClick={() => excluirCusto(x)}>🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 12, color: CINZA, marginTop: 6 }}>Aumento ou desligamento: coloque a data de fim no valor atual e crie um novo a partir do mês seguinte. Assim o histórico de cada mês não muda.</div>
      </div>

      <div style={caixa}>
        <div style={{ ...rotulo, marginBottom: 8 }}>Parâmetros</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
          {[['honorario', 'Honorário (R$)'], ['imposto_pct', 'Imposto (%)'], ['inadimplencia_pct', 'Inadimplência (%) · vazio = real'], ['prevsempre_taxa', 'Taxa PrevSempre (R$)'], ['fabio_por_contrato', 'Fábio por contrato (R$)']].map(([k, l]) => (
            <Param key={k + String(c.p[k])} rot={l} valor={c.p[k]} onSalvar={v => salvarParam(k, v)} />
          ))}
        </div>
      </div>

      {editando && (
        <div onClick={() => !salvando && setEditando(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ ...caixa, width: 'min(480px, 100%)', display: 'grid', gap: 10 }}>
            <b style={{ fontSize: 16 }}>{editando.id ? 'Editar custo' : 'Novo custo fixo'}</b>
            <label style={rotulo}>Nome<input className="dc-in" style={{ width: '100%', marginTop: 4 }} value={editando.nome} onChange={e => setEditando({ ...editando, nome: e.target.value })} /></label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={rotulo}>Valor por mês (R$)<input className="dc-in" style={{ width: '100%', marginTop: 4 }} inputMode="decimal" value={editando.valor} onChange={e => setEditando({ ...editando, valor: e.target.value })} /></label>
              <label style={rotulo}>Tipo<select className="dc-in" style={{ width: '100%', marginTop: 4 }} value={editando.categoria} onChange={e => setEditando({ ...editando, categoria: e.target.value })}>
                {Object.entries(CATEGORIAS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select></label>
              <label style={rotulo}>Vale a partir de<input type="date" className="dc-in" style={{ width: '100%', marginTop: 4 }} value={String(editando.inicio || '').slice(0, 10)} onChange={e => setEditando({ ...editando, inicio: e.target.value })} /></label>
              <label style={rotulo}>Até (vazio = sem fim)<input type="date" className="dc-in" style={{ width: '100%', marginTop: 4 }} value={String(editando.fim || '').slice(0, 10)} onChange={e => setEditando({ ...editando, fim: e.target.value })} /></label>
            </div>
            <label style={rotulo}>Observação<input className="dc-in" style={{ width: '100%', marginTop: 4 }} value={editando.obs} onChange={e => setEditando({ ...editando, obs: e.target.value })} /></label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="dc-btn" disabled={salvando} onClick={() => setEditando(null)}>Cancelar</button>
              <button className="dc-btn dc-btn-ok" disabled={salvando} onClick={() => salvarCusto({
                id: editando.id || null, nome: editando.nome, categoria: editando.categoria,
                valor: numBR(editando.valor),
                inicio: editando.inicio || null, fim: editando.fim || null, obs: editando.obs,
              })}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Param({ rot, valor, onSalvar }) {
  const [v, setV] = useState(valor == null ? '' : String(valor))
  const mudou = (valor == null ? '' : String(valor)) !== v
  return (
    <label style={{ ...rotulo, display: 'grid', gap: 4 }}>{rot}
      <div style={{ display: 'flex', gap: 6 }}>
        <input className="dc-in" style={{ flex: 1, minWidth: 0 }} inputMode="decimal" value={v} onChange={e => setV(e.target.value)} />
        {mudou && <button className="dc-btn dc-btn-ok" style={{ marginLeft: 0 }} onClick={() => onSalvar(v)}>Salvar</button>}
      </div>
    </label>
  )
}

// ------------------------------------------------------------ 💸 COMISSÃO DA SEMANA
function sextaDaSemana() {
  const h = new Date()
  const d = new Date(h.getFullYear(), h.getMonth(), h.getDate())
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7))
  return isoDia(d)
}

export function ComissaoSemana() {
  const [sexta, setSexta] = useState(sextaDaSemana())
  const [d, setD] = useState(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const carregar = useCallback(async () => {
    setErro(''); setD(null)
    const { data, error } = await supabase.rpc('fin_comissao_semana', { p_sexta: sexta })
    if (error) { setErro(error.message); setD({ itens: [] }); return }
    setD(data || { itens: [] })
  }, [sexta])
  useEffect(() => { carregar() }, [carregar])

  const grupos = useMemo(() => {
    const itens = (d && d.itens) || []
    const ordem = ((d && d.times) || []).map(t => t.chave)
    const mapa = {}
    itens.forEach(i => {
      const k = i.time && i.time !== 'conflito' ? i.time : (i.time === 'conflito' ? 'conflito' : 'sem_time')
      if (!mapa[k]) mapa[k] = { chave: k, nome: i.time_nome, comissao: i.comissao, itens: [] }
      mapa[k].itens.push(i)
    })
    return Object.values(mapa).sort((a, b) => {
      const ia = ordem.indexOf(a.chave), ib = ordem.indexOf(b.chave)
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
    })
  }, [d])

  const itens = (d && d.itens) || []
  const totalCom = itens.reduce((s, i) => s + Number(i.comissao || 0), 0)
  const totalFabio = itens.reduce((s, i) => s + Number(i.fabio || 0), 0)
  const semRegra = grupos.filter(g => g.comissao == null)

  function textoGrupo(g) {
    const tot = g.comissao != null ? g.itens.length * Number(g.comissao) : null
    const linhas = g.itens.map((i, n) => `${n + 1}. ${i.nome} · CPF ${fmtCpf(i.cpf)} · vendedora: ${i.vendedora || '—'} · pagou em ${dataHoraBR(i.baixa_em)}`)
    return [
      `*Comissão ${g.nome}* — semana ${dataBR(d.de)} a ${dataBR(d.ate)}`,
      `Contratos pagos: ${g.itens.length}`,
      g.comissao != null ? `Comissão: ${g.itens.length} × ${reais(g.comissao)} = *${reais(tot)}*` : 'Sem regra de comissão definida',
      '',
      ...linhas,
    ].join('\n')
  }
  async function copiarGrupo(g) {
    const ok = await copiar(textoGrupo(g))
    setAviso(ok ? `Relatório de ${g.nome} copiado` : 'Não consegui copiar — selecione o texto manualmente')
    setTimeout(() => setAviso(''), 2500)
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="dc-btn" style={{ marginLeft: 0 }} onClick={() => setSexta(somaDias(sexta, -7))}>◀</button>
        <input type="date" className="dc-in" value={sexta} onChange={e => e.target.value && setSexta(e.target.value)} />
        <button className="dc-btn" style={{ marginLeft: 0 }} onClick={() => setSexta(somaDias(sexta, 7))}>▶</button>
        <span style={{ fontSize: 12.5, color: CINZA }}>
          {d && d.de ? `Semana de ${dataBR(d.de)} (sábado) a ${dataBR(d.ate)} (sexta)` : ''} · conta o que o Acompanhamento marcou como <b>"Cliente pagou"</b> nesses dias.
        </span>
      </div>

      {erro && <div style={{ background: 'rgba(248,113,113,.14)', color: VERMELHO, padding: '10px 14px', borderRadius: 10, fontSize: 13 }}>{erro}</div>}
      {aviso && <div style={{ background: 'rgba(52,211,153,.14)', color: VERDE, padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700 }}>{aviso}</div>}

      {d === null ? <div className="dc-vazio">Carregando…</div> : (
        <>
          <div className="dc-kpis" style={{ marginBottom: 0 }}>
            <Kpi t="Contratos pagos na semana" v={itens.length} cor={AZUL} />
            <Kpi t="Comissão dos times" v={reais(totalCom)} cor={VERDE} />
            <Kpi t="Fábio" v={reais(totalFabio)} s={`${itens.length} × ${reais(itens[0]?.fabio || 50)}`} cor="#7c3aed" />
            <Kpi t="Total a pagar na sexta" v={reais(totalCom + totalFabio)} cor={TINTA} />
          </div>

          {semRegra.length > 0 && (
            <div style={{ background: 'rgba(251,191,36,.12)', border: '1px solid #b4530930', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: LARANJA }}>
              ⚠ {semRegra.map(g => `${g.itens.length} em "${g.nome}"`).join(' · ')} — sem valor de comissão. Confira antes de pagar.
            </div>
          )}

          {itens.length === 0 && <div className="dc-vazio">Nenhum contrato marcado como "Cliente pagou" nessa semana.</div>}

          {grupos.map(g => {
            const tot = g.comissao != null ? g.itens.length * Number(g.comissao) : null
            return (
              <div key={g.chave} style={caixa}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: g.comissao == null ? LARANJA : TINTA }}>{g.nome}</div>
                    <div style={{ fontSize: 12.5, color: CINZA }}>
                      {g.itens.length} contrato(s) pago(s){g.comissao != null ? ` × ${reais(g.comissao)} = ` : ' · sem regra de comissão'}
                      {tot != null && <b style={{ color: VERDE }}>{reais(tot)}</b>}
                    </div>
                  </div>
                  <button className="dc-btn dc-btn-ok" onClick={() => copiarGrupo(g)}>📋 Copiar relatório</button>
                </div>
                <div className="dc-tabela-wrap" style={{ border: 'none' }}>
                  <table className="dc-tabela">
                    <thead><tr><th>Cliente</th><th>Vendedora</th><th>Marcado pago</th><th>Honorário</th><th style={{ textAlign: 'right' }}>Comissão</th></tr></thead>
                    <tbody>
                      {g.itens.map(i => (
                        <tr key={i.caso_id}>
                          <td><div style={{ fontWeight: 600 }}>{i.nome}</div><div style={{ fontSize: 11.5, color: CINZA }}>{fmtCpf(i.cpf)}{i.prevsempre ? ' · PrevSempre' : ''}</div></td>
                          <td style={{ fontSize: 12.5 }}>{i.vendedora || '—'}</td>
                          <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{dataHoraBR(i.baixa_em)}{i.marcado_por ? <div style={{ fontSize: 11, color: CINZA }}>por {i.marcado_por}</div> : null}</td>
                          <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{i.honorario ? reais(i.honorario) : '—'}{i.forma ? <div style={{ fontSize: 11, color: CINZA }}>{i.forma}</div> : null}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{i.comissao != null ? reais(i.comissao) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
          <div style={{ fontSize: 12, color: CINZA }}>O time vem dos responsáveis do Acompanhamento: vendedora sem responsável cai em "Sem time".</div>
        </>
      )}
    </div>
  )
}
