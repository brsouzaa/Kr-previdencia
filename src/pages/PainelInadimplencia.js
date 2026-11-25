import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { hexA, estiloCard as card, fmtData, hojeISO, useIsMobile } from './ProtocoloFicha'

// ===== PAINEL DE INADIMPLENCIA (25/11/2026, Bruno) — pagina propria, fora do Acompanhamento =====
// So LE o que o Acompanhamento ja tem (rpc posdef_lista). Nao muda nada no banco.
// Mesma regra do PosDeferimento.js: inadimplente = passou 4 dias da data do pagamento sem pagar;
// taxa = inadimplentes / (pagaram + inadimplentes); conta pela DATA AGENDADA do pagamento.
// Limite 20%: laranja a partir de 15%, vermelho em 20% ou mais. RT fica de fora.
// Times = os responsaveis de cada vendedora (mesma tabela fin_time_responsavel).

const DIAS_INADIMPLENTE = 4
const ESPERANDO = ['aguardando_pagamento', 'orientacao_prev', 'prevsempre', 'pago', 'conta_banco']
const RT_ID = '7dcd2bef-c0c5-41ac-b104-ff8eed300ca5'
const TIMES = [
  { k: 'call', nome: 'Call Center', ids: ['0a5958b9-d43b-4bac-a01d-af60247dd721', '1c9e99ee-02c4-4500-9dd5-9706f95d0ee9'] },
  { k: 'egle', nome: 'Egle', ids: ['6db43f01-71e6-4972-b84e-eb49375e8e70'] },
  { k: 'jose', nome: 'José', ids: ['a3b8aea4-1b5f-45cb-ba06-192a99bdbf85'] },
  { k: 'leandro', nome: 'Leandro', ids: ['84461a51-1aff-4c54-839b-e10a12f5ae5b'] },
]
const SEM_TIME = { k: 'outro', nome: 'Sem time' }
const AMOSTRA_MIN = 5   // menos que isso de vencidos = taxa pouco confiavel

// cores com contraste forte sobre fundo claro
const C = { ok: '#15803d', okBg: '#dcfce7', la: '#b45309', laBg: '#fef3c7', ve: '#b91c1c', veBg: '#fee2e2', az: '#1d4ed8', tx: '#0b1220', su: '#475569', linha: '#e2e8f0', vazio: '#cbd5e1' }
const status = (t) => (t == null ? { cor: C.su, bg: '#f1f5f9', rot: 'SEM VENCIDOS' } : t >= 20 ? { cor: C.ve, bg: C.veBg, rot: 'ACIMA DO LIMITE' } : t >= 15 ? { cor: C.la, bg: C.laBg, rot: 'ATENÇÃO · perto do limite' } : { cor: C.ok, bg: C.okBg, rot: 'DENTRO DO LIMITE' })

// ---------------------------------------------------------------- datas
const somaDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const diasApos = (iso) => (iso ? Math.round((new Date(hojeISO() + 'T12:00:00') - new Date(iso + 'T12:00:00')) / 86400000) : null)
const segunda = (iso) => { const dow = new Date(iso + 'T12:00:00').getDay(); return somaDias(iso, -((dow + 6) % 7)) }
const ymd = (a, m, d) => `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const fimMes = (a, m) => ymd(a, m, new Date(a, m, 0).getDate())   // m = 1..12
const somaMes = (a, m, n) => { const t = a * 12 + (m - 1) + n; return [Math.floor(t / 12), (t % 12) + 1] }
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const MESES_L = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '')

// periodo escolhido -> { de, ate, rot } (de/ate vazios = sem limite)
function intervalo(per, off, datas) {
  const hoje = hojeISO()
  const [a, m] = hoje.slice(0, 7).split('-').map(Number)
  if (per === 'semana') { const de = somaDias(segunda(hoje), 7 * off); const ate = somaDias(de, 6); return { de, ate, rot: `${ddmm(de)} – ${ddmm(ate)}` } }
  if (per === 'mes') { const [y, mm] = somaMes(a, m, off); return { de: ymd(y, mm, 1), ate: fimMes(y, mm), rot: `${MESES_L[mm - 1]}/${y}` } }
  if (per === 'tri') {
    const q0 = Math.floor((m - 1) / 3) * 3 + 1
    const [y, mm] = somaMes(a, q0, 3 * off)
    const [y2, mm2] = somaMes(y, mm, 2)
    return { de: ymd(y, mm, 1), ate: fimMes(y2, mm2), rot: `${MESES[mm - 1]}–${MESES[mm2 - 1]}/${y2}` }
  }
  if (per === 'datas') return { de: datas.de || '', ate: datas.ate || '', rot: datas.de || datas.ate ? `${datas.de ? fmtData(datas.de) : 'início'} – ${datas.ate ? fmtData(datas.ate) : 'hoje'}` : 'Escolha as datas' }
  return { de: '', ate: '', rot: 'Todo o período' }
}
const ROT_ANT = { semana: 'semana anterior', mes: 'mês anterior', tri: 'trimestre anterior' }

// ---------------------------------------------------------------- regra (igual ao Acompanhamento)
const inadimplente = (c) => ESPERANDO.includes(c.etapa) && !!c.data_pagamento && diasApos(c.data_pagamento) > DIAS_INADIMPLENTE
const dataRef = (c) => c.data_pagamento || c.pago_em || null   // mesma base do "mes da data agendada"
const timeDe = (c) => {
  const ids = c.responsavel_ids || []
  if (ids.includes(RT_ID)) return 'rt'
  const t = TIMES.find(x => x.ids.some(i => ids.includes(i)))
  return t ? t.k : SEM_TIME.k
}
const nomeTime = (k) => (TIMES.find(t => t.k === k) || SEM_TIME).nome
const ehMercantil = (c) => /mercantil/i.test(String(c.banco || ''))
const bancoCurto = (b) => { const s = String(b || ''); if (!s) return 'Sem banco'; if (/mercantil/i.test(s)) return 'Mercantil'; if (/caixa/i.test(s)) return 'Caixa'; if (/banco do brasil/i.test(s)) return 'Banco do Brasil'; return s.replace(/^Banco\s+/i, '').slice(0, 18) }
const primeiroNome = (n) => { const p = String(n || '').trim().split(/\s+/); const f = p[0] || ''; return f ? f[0].toUpperCase() + f.slice(1).toLowerCase() + (p.length > 1 ? ' ' + p[p.length - 1][0].toUpperCase() + '.' : '') : '—' }
const reais0 = (v) => 'R$ ' + Math.round(Number(v || 0)).toLocaleString('pt-BR')
const pct = (t) => (t == null ? '—' : (Math.round(t * 10) / 10).toLocaleString('pt-BR') + '%')

function medir(lista) {
  const r = { total: 0, pagos: 0, inad: 0, aberto: 0, vBen: 0, vRec: 0, vRisco: 0, vAberto: 0 }
  lista.forEach(c => {
    r.total++; r.vBen += Number(c.valor_beneficio || 0)
    if (c.etapa === 'baixado') { r.pagos++; r.vRec += Number(c.honorario_valor || 0) }
    else if (inadimplente(c)) { r.inad++; r.vRisco += Number(c.valor_beneficio || 0) }
    else { r.aberto++; r.vAberto += Number(c.valor_beneficio || 0) }
  })
  r.venc = r.pagos + r.inad
  r.taxa = r.venc ? (r.inad / r.venc) * 100 : null
  r.taxaR = r.taxa == null ? null : Math.round(r.taxa * 10) / 10   // a cor segue o numero que aparece
  return r
}
const noIntervalo = (c, iv) => { const d = dataRef(c); return !!d && (!iv.de || d >= iv.de) && (!iv.ate || d <= iv.ate) }

// ---------------------------------------------------------------- pecas visuais
function useVivo() {   // anima a entrada (barras crescem do zero)
  const [v, setV] = useState(false)
  useEffect(() => { const t = setTimeout(() => setV(true), 80); return () => clearTimeout(t) }, [])
  return v
}
function NumeroAnimado({ valor, fmt }) {
  const [mostra, setMostra] = useState(0)
  const atual = useRef(0)
  useEffect(() => {
    const ini = atual.current, fim = Number(valor || 0), t0 = performance.now(), dur = 650
    let raf
    const passo = (t) => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3)
      const v = ini + (fim - ini) * e
      atual.current = v; setMostra(v)
      if (p < 1) raf = requestAnimationFrame(passo)
    }
    raf = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(raf)
  }, [valor])
  return <>{fmt(mostra)}</>
}
const lbl = { fontSize: 11, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: C.su }
const cardP = { ...card, padding: 18, minWidth: 0 }

function Segmento({ opcoes, valor, onChange, pequeno }) {
  return (
    <div style={{ display: 'inline-flex', background: '#e2e8f0', borderRadius: 10, padding: 3, flexWrap: 'wrap' }}>
      {opcoes.map(o => (
        <button key={o.v} onClick={() => onChange(o.v)} style={{
          border: 'none', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 8, padding: pequeno ? '4px 10px' : '7px 12px',
          fontSize: pequeno ? 12 : 13, fontWeight: valor === o.v ? 700 : 600, whiteSpace: 'nowrap',
          background: valor === o.v ? '#0f172a' : 'transparent', color: valor === o.v ? '#fff' : '#334155', transition: 'background .2s, color .2s',
        }}>{o.l}</button>
      ))}
    </div>
  )
}
function Caixa({ valor, onChange, opcoes, desativado, largura = 180 }) {
  return (
    <select value={valor} disabled={desativado} onChange={e => onChange(e.target.value)} style={{
      minWidth: largura, padding: '8px 10px', borderRadius: 9, fontFamily: 'inherit', fontSize: 13, cursor: desativado ? 'not-allowed' : 'pointer',
      border: `1px solid ${desativado ? C.linha : '#94a3b8'}`, background: desativado ? '#f8fafc' : '#fff', color: desativado ? '#94a3b8' : C.tx,
    }}>
      {opcoes.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  )
}
const Grupo = ({ rot, children }) => <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}><div style={lbl}>{rot}</div>{children}</div>

// grafico de barras vertical com linhas de 15% e 20%, tooltip e animacao
function Barras({ itens, altura = 190, escalaMax = 30, compacto }) {
  const vivo = useVivo()
  const [hover, setHover] = useState(null)
  const max = Math.max(escalaMax, ...itens.map(i => (i.taxa == null ? 0 : i.taxa + 4)))
  const y = (v) => (v / max) * 100
  return (
    <div style={{ position: 'relative', paddingLeft: 34, marginTop: 10 }}>
      <div style={{ position: 'relative', height: altura }}>
        {[{ v: 20, c: C.ve, d: '6px' }, { v: 15, c: C.la, d: '3px' }].map(l => (
          <div key={l.v} style={{ position: 'absolute', left: 0, right: 0, bottom: `${y(l.v)}%`, borderTop: `1.5px dashed ${l.c}`, transition: 'bottom .5s', zIndex: 1, pointerEvents: 'none' }}>
            <span style={{ position: 'absolute', left: -34, top: -8, fontSize: 11, fontWeight: 800, color: l.c }}>{l.v}%</span>
          </div>
        ))}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, borderTop: `1px solid ${C.vazio}` }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: compacto ? 6 : 12 }}>
          {itens.map((it, i) => {
            const st = status(it.taxaR)
            const h = it.taxa == null ? 0 : Math.max(y(it.taxa), 1.2)
            return (
              <div key={it.k} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(hover === i ? null : i)}
                style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', cursor: 'default', position: 'relative' }}>
                <div style={{ fontSize: compacto ? 10.5 : 12, fontWeight: 800, color: C.tx, marginBottom: 4, opacity: vivo ? 1 : 0, transition: 'opacity .4s .3s', whiteSpace: 'nowrap' }}>{it.taxa == null ? '—' : pct(it.taxaR)}</div>
                <div style={{
                  width: '100%', maxWidth: compacto ? 44 : 70, height: vivo ? `${h}%` : '0%', minHeight: it.taxa == null ? 3 : 0,
                  background: it.taxa == null ? C.vazio : st.cor, borderRadius: '6px 6px 2px 2px',
                  transition: 'height .7s cubic-bezier(.2,.8,.2,1), background .3s, filter .2s, transform .2s',
                  filter: hover === i ? 'brightness(1.12)' : 'none', transform: hover === i ? 'scaleX(1.06)' : 'none',
                  boxShadow: it.destaque ? `0 0 0 2px #fff, 0 0 0 4px ${hexA(C.az, 0.9)}` : 'none',
                }} />
                {hover === i && (
                  <div style={{ position: 'absolute', bottom: `calc(${h}% + 26px)`, left: '50%', transform: 'translateX(-50%)', background: '#0f172a', color: '#fff', borderRadius: 10, padding: '8px 11px', fontSize: 12, whiteSpace: 'nowrap', zIndex: 5, boxShadow: '0 8px 24px rgba(15,23,42,.25)', pointerEvents: 'none' }}>
                    <div style={{ fontWeight: 800, marginBottom: 2 }}>{it.dica || it.nome}</div>
                    <div>{it.inad} inadimplente{it.inad === 1 ? '' : 's'} de {it.venc} vencido{it.venc === 1 ? '' : 's'}</div>
                    <div style={{ color: '#cbd5e1' }}>{it.pagos} pagaram · {it.aberto} a vencer</div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: compacto ? 6 : 12, marginTop: 6 }}>
        {itens.map(it => (
          <div key={it.k} style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
            <div style={{ fontSize: compacto ? 10.5 : 12, fontWeight: it.destaque ? 800 : 700, color: it.destaque ? C.az : C.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.nome}</div>
            {!compacto && <div style={{ fontSize: 11, color: C.su }}>{it.inad} de {it.venc}{it.venc > 0 && it.venc < AMOSTRA_MIN ? ' ⚠️' : ''}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

// barras deitadas (para muitas vendedoras)
function BarrasDeitadas({ itens }) {
  const vivo = useVivo()
  const [hover, setHover] = useState(null)
  const max = Math.max(30, ...itens.map(i => (i.taxa == null ? 0 : i.taxa + 4)))
  const x = (v) => (v / max) * 100
  return (
    <div style={{ display: 'grid', gap: 7, marginTop: 12, maxHeight: 330, overflowY: 'auto', paddingRight: 4 }}>
      {itens.map((it, i) => {
        const st = status(it.taxaR)
        return (
          <div key={it.k} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 150px) 1fr 92px', gap: 10, alignItems: 'center', fontSize: 13, borderRadius: 8, padding: '3px 4px', background: hover === i ? '#f1f5f9' : 'transparent', transition: 'background .15s' }}>
            <span style={{ fontWeight: it.destaque ? 800 : 600, color: it.destaque ? C.az : C.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.dica || it.nome}>{it.nome}</span>
            <span style={{ position: 'relative', height: 14, background: '#eef2f7', borderRadius: 99 }}>
              <i style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: vivo ? `${it.taxa == null ? 0 : Math.max(x(it.taxa), 1)}%` : 0, background: st.cor, borderRadius: 99, transition: 'width .7s cubic-bezier(.2,.8,.2,1), background .3s' }} />
              <i style={{ position: 'absolute', left: `${x(15)}%`, top: -3, bottom: -3, width: 2, background: C.la }} />
              <i style={{ position: 'absolute', left: `${x(20)}%`, top: -3, bottom: -3, width: 2, background: C.ve }} />
            </span>
            <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              <b style={{ color: it.taxa == null ? C.su : st.cor }}>{it.taxa == null ? '—' : pct(it.taxaR)}</b>
              <span style={{ color: C.su, fontSize: 11.5 }}> · {it.inad}/{it.venc}{it.venc > 0 && it.venc < AMOSTRA_MIN ? ' ⚠️' : ''}</span>
            </span>
          </div>
        )
      })}
      <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: C.su, marginTop: 4 }}>
        <span><b style={{ color: C.la }}>|</b> 15% atenção</span><span><b style={{ color: C.ve }}>|</b> 20% limite</span><span>inadimplentes / vencidos</span>
      </div>
    </div>
  )
}

// ================================================================ pagina
export default function PainelInadimplencia() {
  const mobile = useIsMobile()
  const [lista, setLista] = useState(null)
  const [erro, setErro] = useState('')
  const [escopo, setEscopo] = useState('todos')   // todos | time | vend
  const [fTime, setFTime] = useState('')
  const [fVend, setFVend] = useState('')
  const [per, setPer] = useState('mes')
  const [off, setOff] = useState(0)
  const [datas, setDatas] = useState({ de: '', ate: '' })
  const [cob, setCob] = useState('todas')   // todas | prev | manual
  const [fBanco, setFBanco] = useState('')
  const [evoModo, setEvoModo] = useState('sem')
  const [grpModo, setGrpModo] = useState('a')

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('posdef_lista')
    if (error) { setErro(error.message); return }
    setErro('')
    // igual ao Acompanhamento: antes do extrato a data e so previsao (nao conta)
    setLista((Array.isArray(data) ? data : [])
      .map(c => (!c.extrato_em && ['deferido', 'carta', 'extrato', 'prevsempre'].includes(c.etapa) && c.data_pagamento) ? { ...c, data_pagamento: null } : c)
      .map(c => ({ ...c, _time: timeDe(c) }))
      .filter(c => c._time !== 'rt' && c.etapa !== 'cancelado'))
  }, [])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { const t = setInterval(carregar, 60000); return () => clearInterval(t) }, [carregar])

  const base = lista || []
  const vendedoras = useMemo(() => {
    const m = {}
    base.forEach(c => { if (c.vendedora_id && !m[c.vendedora_id]) m[c.vendedora_id] = { id: c.vendedora_id, nome: c.vendedora_nome || '—', time: c._time } })
    return Object.values(m).sort((a, b) => a.nome.localeCompare(b.nome))
  }, [base])
  const timesComDados = useMemo(() => [...TIMES, SEM_TIME].filter(t => base.some(c => c._time === t.k)), [base])
  const bancos = useMemo(() => [...new Set(base.map(c => bancoCurto(c.banco)))].sort(), [base])
  const vendSel = vendedoras.find(v => v.id === fVend)

  // filtros que NAO sao periodo
  const casaCob = useCallback((c) => (cob === 'prev' ? !!c.prevsempre : cob === 'manual' ? !c.prevsempre : true) && (!fBanco || bancoCurto(c.banco) === fBanco), [cob, fBanco])
  const doEscopo = useMemo(() => base.filter(c => {
    if (escopo === 'time' && fTime && c._time !== fTime) return false
    if (escopo === 'vend' && fVend && c.vendedora_id !== fVend) return false
    return casaCob(c)
  }), [base, escopo, fTime, fVend, casaCob])

  const iv = useMemo(() => intervalo(per, off, datas), [per, off, datas])
  const ivAnt = useMemo(() => (ROT_ANT[per] ? intervalo(per, off - 1, datas) : null), [per, off, datas])
  const noPer = useMemo(() => doEscopo.filter(c => noIntervalo(c, iv)), [doEscopo, iv])
  const m = useMemo(() => medir(noPer), [noPer])
  const mAnt = useMemo(() => (ivAnt ? medir(doEscopo.filter(c => noIntervalo(c, ivAnt))) : null), [doEscopo, ivAnt])
  const mTime = useMemo(() => {
    if (escopo !== 'vend' || !vendSel) return null
    return medir(base.filter(c => c._time === vendSel.time && casaCob(c) && noIntervalo(c, iv)))
  }, [escopo, vendSel, base, casaCob, iv])
  const st = status(m.taxaR)

  // evolucao: 12 semanas ou 12 meses terminando no fim do periodo escolhido
  const evolucao = useMemo(() => {
    const fim = iv.ate && iv.ate < hojeISO() ? iv.ate : hojeISO()
    const out = []
    if (evoModo === 'sem') {
      const s0 = segunda(fim)
      for (let i = 11; i >= 0; i--) {
        const de = somaDias(s0, -7 * i), ate = somaDias(de, 6)
        const r = medir(doEscopo.filter(c => noIntervalo(c, { de, ate })))
        out.push({ ...r, k: de, nome: ddmm(de), dica: `Semana ${ddmm(de)} – ${ddmm(ate)}` })
      }
    } else {
      const [a, mm] = fim.slice(0, 7).split('-').map(Number)
      for (let i = 11; i >= 0; i--) {
        const [y, m2] = somaMes(a, mm, -i)
        const r = medir(doEscopo.filter(c => noIntervalo(c, { de: ymd(y, m2, 1), ate: fimMes(y, m2) })))
        out.push({ ...r, k: `${y}-${m2}`, nome: `${MESES[m2 - 1]}/${String(y).slice(2)}`, dica: `${MESES_L[m2 - 1]}/${y}` })
      }
    }
    // corta o comeco vazio (antes do setor existir)
    const primeiro = out.findIndex(r => r.total > 0)
    return primeiro > 0 ? out.slice(Math.min(primeiro, out.length - 4)) : out
  }, [doEscopo, iv, evoModo])

  // grafico por time / vendedora
  const grupo = useMemo(() => {
    const porVend = (lst, destaqueId) => {
      const g = {}
      lst.forEach(c => { const k = c.vendedora_id || '—'; (g[k] || (g[k] = { nome: c.vendedora_nome || '—', time: c._time, cs: [] })).cs.push(c) })
      return Object.entries(g).map(([k, v]) => ({ ...medir(v.cs), k, nome: primeiroNome(v.nome), dica: `${v.nome} · ${nomeTime(v.time)}`, destaque: k === destaqueId }))
        .sort((a, b) => (b.taxa ?? -1) - (a.taxa ?? -1) || b.venc - a.venc)
    }
    if (escopo === 'todos') {
      if (grpModo === 'b') return { titulo: 'Inadimplência por vendedora', itens: porVend(noPer), deitado: true }
      return { titulo: 'Inadimplência por time', itens: timesComDados.map(t => ({ ...medir(noPer.filter(c => c._time === t.k)), k: t.k, nome: t.nome })) }
    }
    if (escopo === 'time') {
      if (!fTime) return { titulo: 'Inadimplência por time', itens: timesComDados.map(t => ({ ...medir(noPer.filter(c => c._time === t.k)), k: t.k, nome: t.nome })) }
      const its = porVend(noPer)
      return { titulo: `Vendedoras do time ${nomeTime(fTime)}`, itens: its, deitado: its.length > 6 }
    }
    if (!vendSel) return { titulo: 'Escolha a vendedora', itens: [] }
    if (grpModo === 'b') {
      const doTime = base.filter(c => c._time === vendSel.time && casaCob(c) && noIntervalo(c, iv))
      const its = porVend(doTime, vendSel.id)
      return { titulo: `${primeiroNome(vendSel.nome)} × time ${nomeTime(vendSel.time)}`, itens: its, deitado: its.length > 6 }
    }
    // por mes: 6 meses terminando no fim do periodo
    const fim = iv.ate && iv.ate < hojeISO() ? iv.ate : hojeISO()
    const [a, mm] = fim.slice(0, 7).split('-').map(Number)
    const its = []
    for (let i = 5; i >= 0; i--) {
      const [y, m2] = somaMes(a, mm, -i)
      its.push({ ...medir(doEscopo.filter(c => noIntervalo(c, { de: ymd(y, m2, 1), ate: fimMes(y, m2) }))), k: `${y}-${m2}`, nome: `${MESES[m2 - 1]}`, dica: `${MESES_L[m2 - 1]}/${y}` })
    }
    return { titulo: `${primeiroNome(vendSel.nome)} mês a mês`, itens: its }
  }, [escopo, grpModo, noPer, timesComDados, fTime, vendSel, base, casaCob, iv, doEscopo])

  const comp = useMemo(() => {
    const merc = noPer.filter(ehMercantil).length
    const prev = noPer.filter(c => c.prevsempre).length
    return { merc, prev, outros: noPer.length - merc, mPrev: medir(noPer.filter(c => c.prevsempre)), mMan: medir(noPer.filter(c => !c.prevsempre)) }
  }, [noPer])
  const inadLista = useMemo(() => noPer.filter(inadimplente).sort((a, b) => String(a.data_pagamento).localeCompare(String(b.data_pagamento))), [noPer])

  const mudaEscopo = (v) => { setEscopo(v); setGrpModo('a'); if (v === 'todos') { setFTime(''); setFVend('') } if (v === 'time') setFVend('') }
  const mudaPer = (v) => { setPer(v); setOff(0) }
  const limpar = () => { mudaEscopo('todos'); setPer('mes'); setOff(0); setDatas({ de: '', ate: '' }); setCob('todas'); setFBanco('') }
  const vendsDoTime = escopo === 'vend' && fTime ? vendedoras.filter(v => v.time === fTime) : vendedoras

  const chips = [
    escopo === 'todos' ? 'Todos os times' : null,
    escopo !== 'todos' && fTime ? `Time ${nomeTime(fTime)}` : null,
    escopo === 'vend' && vendSel ? vendSel.nome : null,
    iv.rot,
    cob === 'prev' ? 'Só PrevSempre' : cob === 'manual' ? 'Só cobrança manual' : null,
    fBanco ? fBanco : null,
  ].filter(Boolean)

  const dif = mAnt && m.taxa != null && mAnt.taxa != null ? Math.round((m.taxa - mAnt.taxa) * 10) / 10 : null
  const larg = Math.min(100, ((m.taxa || 0) / 30) * 100)
  const grid2 = (a, b) => ({ display: 'grid', gridTemplateColumns: mobile ? '1fr' : `${a}fr ${b}fr`, gap: 14, marginBottom: 14 })

  if (erro) return <div style={{ ...cardP, color: C.ve }}>Erro ao carregar: {erro}</div>

  return (
    <div style={{ display: 'grid', gap: 0, color: C.tx }}>
      <div style={{ marginBottom: 12 }}>
        <h1 style={{ fontSize: 23, fontWeight: 800, margin: 0 }}>📉 Inadimplência</h1>
        <div style={{ fontSize: 13, color: C.su, marginTop: 3 }}>Inadimplente = {DIAS_INADIMPLENTE} dias depois da data do pagamento sem pagar · conta pela data agendada · limite 20% (laranja a partir de 15%) · RT fora</div>
      </div>

      {/* ---------------- filtros */}
      <div style={{ ...card, padding: '14px 16px', display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 10, position: mobile ? 'static' : 'sticky', top: 0, zIndex: 20 }}>
        <Grupo rot="Visualizar"><Segmento valor={escopo} onChange={mudaEscopo} opcoes={[{ v: 'todos', l: 'Todos' }, { v: 'time', l: 'Time' }, { v: 'vend', l: 'Vendedora' }]} /></Grupo>
        <Grupo rot="Time">
          <Caixa valor={fTime} desativado={escopo === 'todos'} onChange={v => { setFTime(v); if (escopo === 'vend') setFVend('') }}
            opcoes={[{ v: '', l: escopo === 'vend' ? 'Todos os times' : escopo === 'time' ? 'Escolha o time' : 'Todos os times' }, ...timesComDados.map(t => ({ v: t.k, l: t.nome }))]} />
        </Grupo>
        <Grupo rot="Vendedora">
          <Caixa valor={fVend} desativado={escopo !== 'vend'} largura={200} onChange={v => { setFVend(v); setGrpModo('a') }}
            opcoes={[{ v: '', l: escopo === 'vend' ? 'Escolha a vendedora' : 'Todas' }, ...vendsDoTime.map(v => ({ v: v.id, l: `${v.nome} · ${nomeTime(v.time)}` }))]} />
        </Grupo>
        <Grupo rot="Período"><Segmento valor={per} onChange={mudaPer} opcoes={[{ v: 'semana', l: 'Semana' }, { v: 'mes', l: 'Mês' }, { v: 'tri', l: 'Trimestre' }, { v: 'todo', l: 'Todo o período' }, { v: 'datas', l: 'De–até' }]} /></Grupo>
        {ROT_ANT[per] && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {[{ s: '◀', d: -1, t: 'Período anterior' }, null, { s: '▶', d: 1, t: 'Próximo período' }].map((b, i) => b ? (
              <button key={i} title={b.t} onClick={() => setOff(off + b.d)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #94a3b8', background: '#fff', cursor: 'pointer', fontSize: 11, color: '#334155' }}>{b.s}</button>
            ) : <b key={i} style={{ fontSize: 14, minWidth: 112, textAlign: 'center' }}>{iv.rot}</b>)}
            {off !== 0 && <button onClick={() => setOff(0)} style={{ border: 'none', background: 'none', color: C.az, fontWeight: 700, cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit' }}>hoje</button>}
          </div>
        )}
        {per === 'datas' && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: C.su }}>
            de <input type="date" value={datas.de} max={datas.ate || undefined} onChange={e => setDatas({ ...datas, de: e.target.value })} style={{ padding: '7px 9px', borderRadius: 9, border: '1px solid #94a3b8', fontFamily: 'inherit' }} />
            até <input type="date" value={datas.ate} min={datas.de || undefined} onChange={e => setDatas({ ...datas, ate: e.target.value })} style={{ padding: '7px 9px', borderRadius: 9, border: '1px solid #94a3b8', fontFamily: 'inherit' }} />
          </div>
        )}
        <Grupo rot="Cobrança"><Segmento valor={cob} onChange={setCob} opcoes={[{ v: 'todas', l: 'Todas' }, { v: 'prev', l: 'PrevSempre' }, { v: 'manual', l: 'Manual' }]} /></Grupo>
        <Grupo rot="Banco"><Caixa valor={fBanco} onChange={setFBanco} largura={140} opcoes={[{ v: '', l: 'Todos' }, ...bancos.map(b => ({ v: b, l: b }))]} /></Grupo>
        <button onClick={limpar} style={{ marginLeft: 'auto', alignSelf: 'center', border: 'none', background: 'none', color: C.az, fontWeight: 700, cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit' }}>Limpar filtros</button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {chips.map(c => <span key={c} style={{ fontSize: 12, fontWeight: 700, background: '#e0e7ff', color: '#1e3a8a', borderRadius: 99, padding: '4px 10px' }}>{c}</span>)}
        {!lista && <span style={{ fontSize: 12, color: C.su }}>carregando…</span>}
      </div>

      {escopo === 'vend' && !vendSel ? (
        <div style={{ ...cardP, textAlign: 'center', color: C.su, padding: 40 }}>Escolha a vendedora no filtro acima.</div>
      ) : (<>
        {/* ---------------- taxa + valores */}
        <div style={grid2(1.15, 1)}>
          <div style={cardP}>
            <div style={lbl}>Taxa de inadimplência · {iv.rot}</div>
            <div style={{ display: 'flex', gap: 22, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 58, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1, color: st.cor, fontVariantNumeric: 'tabular-nums', transition: 'color .3s' }}>
                {m.taxa == null ? '—' : <NumeroAnimado valor={m.taxa} fmt={v => pct(Math.round(v * 10) / 10)} />}
              </div>
              <div style={{ minWidth: 0 }}>
                <span style={{ display: 'inline-block', fontSize: 12.5, fontWeight: 800, borderRadius: 99, padding: '4px 11px', marginBottom: 8, background: st.bg, color: st.cor, transition: 'all .3s' }}>{st.rot}</span>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{m.inad} inadimplente{m.inad === 1 ? '' : 's'} de {m.venc} vencido{m.venc === 1 ? '' : 's'}{m.venc > 0 && m.venc < AMOSTRA_MIN ? ' · ⚠️ amostra pequena' : ''}</div>
                <div style={{ fontSize: 12.5, color: C.su, marginTop: 6 }}>
                  {dif != null ? <>{dif > 0 ? '▲' : dif < 0 ? '▼' : '='} {Math.abs(dif).toLocaleString('pt-BR')} ponto{Math.abs(dif) === 1 ? '' : 's'} em relação ao {ROT_ANT[per]} ({pct(mAnt.taxaR)})</> : ROT_ANT[per] ? `${ROT_ANT[per]}: sem vencidos` : ''}
                  {mTime && <> · média do time {nomeTime(vendSel.time)}: <b style={{ color: status(mTime.taxaR).cor }}>{pct(mTime.taxaR)}</b></>}
                </div>
              </div>
            </div>
            <div style={{ position: 'relative', height: 10, background: C.linha, borderRadius: 99, marginTop: 16 }}>
              <i style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${larg}%`, background: st.cor, borderRadius: 99, transition: 'width .7s cubic-bezier(.2,.8,.2,1), background .3s' }} />
              <i style={{ position: 'absolute', left: '50%', top: -5, bottom: -5, width: 2, background: C.la }} />
              <i style={{ position: 'absolute', left: '66.7%', top: -5, bottom: -5, width: 2, background: C.ve }} />
            </div>
            <div style={{ position: 'relative', height: 14, fontSize: 10.5, color: C.su, marginTop: 5 }}>
              <span style={{ position: 'absolute', left: 0 }}>0%</span><span style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>15%</span>
              <span style={{ position: 'absolute', left: '66.7%', transform: 'translateX(-50%)' }}>20%</span><span style={{ position: 'absolute', right: 0 }}>30%</span>
            </div>
          </div>
          <div style={{ ...cardP, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            {[
              { r: 'Valor do período', v: m.vBen, c: C.tx, s: `${m.total} cliente${m.total === 1 ? '' : 's'} · soma dos benefícios` },
              { r: 'Honorário recebido', v: m.vRec, c: C.ok, s: `${m.pagos} pagaram` },
              { r: 'Em risco', v: m.vRisco, c: C.ve, s: `${m.inad} inadimplente${m.inad === 1 ? '' : 's'} · benefício` },
              { r: 'A vencer', v: m.vAberto, c: C.az, s: `${m.aberto} dentro do prazo · benefício` },
            ].map(k => (
              <div key={k.r} style={{ border: `1px solid ${C.linha}`, borderRadius: 12, padding: '12px 14px', minWidth: 0 }}>
                <div style={lbl}>{k.r}</div>
                <div style={{ fontSize: 'clamp(18px, 2vw, 22px)', fontWeight: 800, marginTop: 4, color: k.c, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}><NumeroAnimado valor={k.v} fmt={reais0} /></div>
                <div style={{ fontSize: 12, color: C.su, marginTop: 2 }}>{k.s}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ---------------- evolucao + composicao */}
        <div style={grid2(1.6, 1)}>
          <div style={cardP}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={lbl}>Evolução{escopo === 'vend' && vendSel ? ` · ${primeiroNome(vendSel.nome)}` : escopo === 'time' && fTime ? ` · time ${nomeTime(fTime)}` : ''} · {evoModo === 'sem' ? 'semanas' : 'meses'}</div>
              <Segmento pequeno valor={evoModo} onChange={setEvoModo} opcoes={[{ v: 'sem', l: 'Semanas' }, { v: 'mes', l: 'Meses' }]} />
            </div>
            <Barras key={evoModo} itens={evolucao} compacto />
            <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: C.su, marginTop: 8, flexWrap: 'wrap' }}>
              <span><b style={{ color: C.ve }}>– –</b> limite 20%</span><span><b style={{ color: C.la }}>- -</b> atenção 15%</span><span>cinza = sem vencidos · passe o mouse na barra</span>
            </div>
          </div>
          <div style={cardP}>
            <div style={lbl}>Quem são as clientes</div>
            <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
              {[{ r: '🏦 Mercantil', n: comp.merc, c: '#0369a1' }, { r: '🤝 PrevSempre', n: comp.prev, c: '#0e7490' }, { r: '💳 Outros bancos', n: comp.outros, c: '#6d28d9' }].map(x => (
                <div key={x.r} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 34px', gap: 10, alignItems: 'center', fontSize: 13 }}>
                  <span>{x.r}</span>
                  <span style={{ height: 10, background: C.linha, borderRadius: 99, overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: `${noPer.length ? (x.n / noPer.length) * 100 : 0}%`, background: x.c, transition: 'width .7s cubic-bezier(.2,.8,.2,1)' }} /></span>
                  <b style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{x.n}</b>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
              {[{ t: 'PrevSempre', r: comp.mPrev }, { t: 'Cobrança manual', r: comp.mMan }].map(x => {
                const s = status(x.r.taxaR)
                return (
                  <div key={x.t} style={{ borderRadius: 12, padding: '11px 13px', background: s.bg, transition: 'background .3s' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>{x.t}</div>
                    <div style={{ fontSize: 26, fontWeight: 800, marginTop: 2, color: s.cor }}>{pct(x.r.taxaR)}</div>
                    <div style={{ fontSize: 11.5, color: '#334155' }}>{x.r.inad} de {x.r.venc} vencidos</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ---------------- por time/vendedora + lista */}
        <div style={grid2(1.6, 1)}>
          <div style={cardP}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={lbl}>{grupo.titulo} · {iv.rot}</div>
              {escopo === 'todos' && <Segmento pequeno valor={grpModo} onChange={setGrpModo} opcoes={[{ v: 'a', l: 'Times' }, { v: 'b', l: 'Vendedoras' }]} />}
              {escopo === 'vend' && vendSel && <Segmento pequeno valor={grpModo} onChange={setGrpModo} opcoes={[{ v: 'a', l: 'Por mês' }, { v: 'b', l: 'Comparar com o time' }]} />}
            </div>
            {grupo.itens.length === 0 ? <div style={{ color: C.su, fontSize: 13, padding: '30px 0', textAlign: 'center' }}>Sem clientes nesse filtro.</div>
              : grupo.deitado ? <BarrasDeitadas key={grupo.titulo} itens={grupo.itens} /> : <Barras key={grupo.titulo} itens={grupo.itens} altura={170} />}
          </div>
          <div style={cardP}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={lbl}>Inadimplentes · {iv.rot}</div>
              <span style={{ fontSize: 11.5, fontWeight: 800, borderRadius: 99, padding: '3px 9px', background: inadLista.length ? C.veBg : C.okBg, color: inadLista.length ? C.ve : C.ok }}>{inadLista.length} cliente{inadLista.length === 1 ? '' : 's'}</span>
            </div>
            <div style={{ maxHeight: 300, overflowY: 'auto', marginTop: 6 }}>
              {inadLista.length === 0 && <div style={{ color: C.su, fontSize: 13, padding: '24px 0', textAlign: 'center' }}>Nenhuma inadimplente nesse filtro. 👏</div>}
              {inadLista.map(c => {
                const d = diasApos(c.data_pagamento)
                const cor = d > 15 ? [C.ve, C.veBg] : d > 7 ? [C.la, C.laBg] : ['#334155', C.linha]
                return (
                  <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, padding: '10px 0', borderBottom: `1px solid ${C.linha}`, fontSize: 13 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</div>
                      <div style={{ fontSize: 12, color: C.su, marginTop: 2 }}>{bancoCurto(c.banco)}{c.prevsempre ? ' · PrevSempre' : ''} · venceu {fmtData(c.data_pagamento)} · {primeiroNome(c.vendedora_nome)} ({nomeTime(c._time)})</div>
                    </div>
                    <span style={{ fontSize: 11.5, fontWeight: 800, borderRadius: 99, padding: '3px 9px', alignSelf: 'center', background: cor[1], color: cor[0], whiteSpace: 'nowrap' }}>{d} dias</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </>)}
    </div>
  )
}
