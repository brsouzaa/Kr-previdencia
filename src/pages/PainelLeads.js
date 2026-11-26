import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { estiloCard as card, hojeISO, useIsMobile } from './ProtocoloFicha'

// ===== PAINEL DE LEADS (26/11/2026, Bruno) =====
// Distribuicao do dia, tabulacao obrigatoria (quem esta travada, destravar com motivo), reposicoes
// (lead errado: e homem), envio manual e relatorios de qualidade dos leads por periodo.
// Acesso: admin + app_config.painel_leads_ids (Haru). O banco confere de novo (painel_leads_pode) em toda funcao.
// So le e chama as funcoes do banco: retroativo_painel_hoje, retroativo_painel_periodo, retroativo_destravar,
// retroativo_reposicao_decidir, retroativo_enviar_manual.

const C = { tx: '#0b1220', su: '#475569', linha: '#e2e8f0', ok: '#15803d', okBg: '#dcfce7', az: '#1d4ed8', azBg: '#dbeafe', ve: '#b91c1c', veBg: '#fee2e2', la: '#b45309', laBg: '#fef3c7', rx: '#6d28d9', rxBg: '#ede9fe' }
const lbl = { fontSize: 11, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: C.su }
const cardP = { ...card, padding: 16, minWidth: 0 }
const btn = (cor = C.tx, cheio = false) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 10, fontSize: 13, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${cheio ? cor : '#cbd5e1'}`, background: cheio ? cor : '#fff', color: cheio ? '#fff' : cor,
})
const chip = (cor, bg) => ({ fontSize: 11.5, fontWeight: 800, borderRadius: 99, padding: '4px 10px', background: bg, color: cor, whiteSpace: 'nowrap', justifySelf: 'start' })

// Resultado dos leads no periodo. 'pend' = ainda conta como SEM tabulacao para a trava.
const CATS = [
  { k: 'venda', t: 'Vendeu', cor: '#15803d' },
  { k: 'negociacao', t: 'Em negociação', cor: '#0284c7' },
  { k: 'nao_quis', t: 'Não quis fechar', cor: '#d97706' },
  { k: 'sem_resposta', t: 'Não respondeu (2+ vezes)', cor: '#64748b' },
  { k: 'tel_errado', t: 'Telefone errado', cor: '#dc2626' },
  { k: 'sem_direito', t: 'Não tem direito', cor: '#7c3aed' },
  { k: 'homem', t: 'Lead errado (homem)', cor: '#334155' },
  { k: 'negado', t: 'Negado depois', cor: '#a8a29e' },
  { k: 'sem_resposta_1', t: 'Não respondeu (só 1 vez)', cor: '#fbbf24', pend: true },
  { k: 'sem_tabulacao', t: 'Sem tabulação', cor: '#f59e0b', pend: true },
]
const LEAD_RUIM = ['tel_errado', 'sem_direito', 'homem', 'negado']
const MOTIVOS = {
  tem_advogado: 'Já tem advogado ou já deu entrada', ja_recebeu: 'Já recebeu o benefício', desconfiou: 'Desconfiou / achou golpe',
  honorario_caro: 'Achou o honorário caro', nao_aceita_honorario: 'Não aceita pagar honorário', sozinha_inss: 'Quer fazer sozinha no INSS',
  familia: 'Marido ou família não deixou', vai_pensar: 'Vai pensar', parou_responder: 'Parou de responder após o 1º contato',
  sem_documentos: 'Não quis mandar os documentos', problema_documento: 'Problema com documento', nao_assina_digital: 'Não quis assinar digital',
  presencial: 'Queria atendimento presencial', outro: 'Outro',
}
const somaDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const ddmm = (iso) => (iso ? `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}` : '')
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)
const pctTxt = (a, b) => (!b || !a ? '0%' : (a / b) * 100 < 1 ? '<1%' : `${Math.round((a / b) * 100)}%`)
const milhar = (n) => Number(n || 0).toLocaleString('pt-BR')
const horaDe = (ts) => { try { return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) } catch (_) { return '' } }
const quandoFoi = (ts) => {
  if (!ts) return ''
  const h = (Date.now() - new Date(ts).getTime()) / 3600000
  return h < 1 ? 'pedido agora' : h < 24 ? `pedido há ${Math.floor(h)}h` : `pedido em ${new Date(ts).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
}

function Barra({ v, max, cor }) {
  const [w, setW] = useState(0)
  useEffect(() => { const t = setTimeout(() => setW(max ? Math.min(100, (v / max) * 100) : 0), 60); return () => clearTimeout(t) }, [v, max])
  return (
    <span style={{ display: 'block', height: 9, background: C.linha, borderRadius: 99, overflow: 'hidden' }}>
      <i style={{ display: 'block', height: '100%', width: `${w}%`, background: cor, borderRadius: 99, transition: 'width .7s cubic-bezier(.2,.8,.2,1)' }} />
    </span>
  )
}

function Modal({ titulo, sub, onFechar, children }) {
  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'grid', placeItems: 'center', zIndex: 900, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...card, padding: 20, width: '100%', maxWidth: 460 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <div><div style={{ fontSize: 17, fontWeight: 800, color: C.tx }}>{titulo}</div>{sub && <div style={{ fontSize: 13, color: C.su, marginTop: 2 }}>{sub}</div>}</div>
          <button onClick={onFechar} style={btn()}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
const campo = { width: '100%', boxSizing: 'border-box', marginTop: 10, padding: '9px 11px', borderRadius: 10, border: '1px solid #94a3b8', fontFamily: 'inherit', fontSize: 13.5 }

// ===== relatorios: tabela de vendedoras (ordenavel) e grafico de leads por dia =====
const COLS_V = [
  ['nome', 'Vendedora'], ['recebidos', 'Recebidos'], ['vendas', 'Vendas'], ['conv', 'Conversão'], ['tab', 'Tabulados'],
  ['negociacao', 'Negociação'], ['nao_quis', 'Não quis'], ['sem_tabulacao', 'Sem tabulação'],
]
function TabelaVendedoras({ linhas, mobile }) {
  const [ord, setOrd] = useState({ k: 'conv', desc: true })
  const dados = linhas.map(v => ({ ...v, nome: v.nome || 'Sem vendedora', conv: v.recebidos ? v.vendas / v.recebidos : 0, tab: v.recebidos ? v.tabulados / v.recebidos : 0 }))
  // quem recebeu poucos leads no periodo (menos de 20) vai pro fim: 1 lead e 1 venda nao e 100% de conversao de verdade
  dados.sort((a, b) => {
    const poucoA = a.recebidos < 20, poucoB = b.recebidos < 20
    if (ord.k !== 'nome' && poucoA !== poucoB) return poucoA ? 1 : -1
    const x = a[ord.k], y = b[ord.k]
    const r = typeof x === 'string' ? x.localeCompare(y) : (x || 0) - (y || 0)
    return ord.desc ? -r : r
  })
  const tot = dados.reduce((t, v) => ({ recebidos: t.recebidos + v.recebidos, vendas: t.vendas + v.vendas, tabulados: t.tabulados + v.tabulados, negociacao: t.negociacao + v.negociacao, nao_quis: t.nao_quis + v.nao_quis, sem_tabulacao: t.sem_tabulacao + v.sem_tabulacao }),
    { recebidos: 0, vendas: 0, tabulados: 0, negociacao: 0, nao_quis: 0, sem_tabulacao: 0 })
  const maxConv = Math.max(0.01, ...dados.map(v => v.conv))
  const td = { padding: '9px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderBottom: `1px solid ${C.linha}` }
  const mini = (v, max, cor) => (
    <span style={{ display: 'inline-block', width: 54, height: 6, background: C.linha, borderRadius: 99, marginRight: 8, verticalAlign: 'middle', overflow: 'hidden' }}>
      <i style={{ display: 'block', height: '100%', width: `${Math.min(100, (v / max) * 100)}%`, background: cor, borderRadius: 99 }} />
    </span>
  )
  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${C.linha}`, borderRadius: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 760 }}>
        <thead><tr style={{ background: '#f8fafc' }}>{COLS_V.map(([k, t]) => (
          <th key={k} onClick={() => setOrd(o => ({ k, desc: o.k === k ? !o.desc : k !== 'nome' }))}
            style={{ ...lbl, textAlign: k === 'nome' ? 'left' : 'right', padding: '10px', cursor: 'pointer', whiteSpace: 'nowrap', color: ord.k === k ? C.tx : C.su, borderBottom: `1px solid ${C.linha}` }}>
            {t}{ord.k === k ? (ord.desc ? ' ↓' : ' ↑') : ''}
          </th>))}</tr></thead>
        <tbody>
          {dados.map(v => (
            <tr key={v.nome + v.time}>
              <td style={{ ...td, textAlign: 'left' }}><div style={{ fontWeight: 700 }}>{v.nome}</div><div style={{ fontSize: 11.5, color: C.su }}>{v.time}{v.recebidos < 20 ? ' · poucos leads' : ''}</div></td>
              <td style={td}>{milhar(v.recebidos)}{v.manual ? <div style={{ fontSize: 11, color: C.su }}>+{v.manual} na mão</div> : null}</td>
              <td style={{ ...td, fontWeight: 800, color: v.vendas ? C.ok : C.su }}>{v.vendas}</td>
              <td style={{ ...td, fontWeight: 800 }}>{!mobile && mini(v.conv, maxConv, C.ok)}<span style={{ display: 'inline-block', minWidth: 38 }}>{pctTxt(v.vendas, v.recebidos)}</span></td>
              <td style={{ ...td, fontWeight: 700, color: v.tab >= 0.9 ? C.ok : v.tab >= 0.6 ? C.la : C.ve }}>{!mobile && mini(v.tab, 1, v.tab >= 0.9 ? C.ok : v.tab >= 0.6 ? '#f59e0b' : C.ve)}<span style={{ display: 'inline-block', minWidth: 38 }}>{pctTxt(v.tabulados, v.recebidos)}</span></td>
              <td style={td}>{v.negociacao || <span style={{ color: '#cbd5e1' }}>0</span>}</td>
              <td style={td}>{v.nao_quis || <span style={{ color: '#cbd5e1' }}>0</span>}</td>
              <td style={{ ...td, fontWeight: v.sem_tabulacao ? 700 : 400, color: v.sem_tabulacao ? C.la : '#cbd5e1' }}>{milhar(v.sem_tabulacao)}</td>
            </tr>
          ))}
          <tr style={{ background: '#f8fafc', fontWeight: 800 }}>
            <td style={{ ...td, textAlign: 'left' }}>Total</td><td style={td}>{milhar(tot.recebidos)}</td><td style={{ ...td, color: C.ok }}>{tot.vendas}</td>
            <td style={td}>{pctTxt(tot.vendas, tot.recebidos)}</td><td style={td}>{pctTxt(tot.tabulados, tot.recebidos)}</td>
            <td style={td}>{tot.negociacao}</td><td style={td}>{tot.nao_quis}</td><td style={{ ...td, color: C.la }}>{milhar(tot.sem_tabulacao)}</td>
          </tr>
        </tbody>
      </table>
      <div style={{ fontSize: 11.5, color: C.su, padding: '8px 10px' }}>Clique no título da coluna para ordenar. Quem recebeu menos de 20 leads fica no fim. Tabulados = tudo que não está pendente (Não respondeu só conta a partir da 2ª tentativa).</div>
    </div>
  )
}

const ehFimDeSemana = (iso) => { const d = new Date(iso + 'T12:00:00').getDay(); return d === 0 || d === 6 }
function GraficoDias({ dias }) {
  const [foco, setFoco] = useState(null)
  const max = Math.max(1, ...dias.map(d => d.recebidos))
  const passo = max > 200 ? 100 : max > 100 ? 50 : max > 40 ? 20 : 10
  const topo = Math.ceil(max / passo) * passo
  const marcas = []
  for (let v = 0; v <= topo; v += passo) marcas.push(v)
  const pularRotulo = dias.length > 16 ? 2 : 1
  const d = foco != null ? dias[foco] : null
  return (
    <div style={{ border: `1px solid ${C.linha}`, borderRadius: 12, padding: '14px 16px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 14, fontWeight: 800, flex: 1 }}>Leads entregues por dia</div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.su }}><i style={{ width: 9, height: 9, borderRadius: 3, background: C.az }} />origem KR</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.su }}><i style={{ width: 9, height: 9, borderRadius: 3, background: '#8b5cf6' }} />origem RT</span>
      </div>
      <div style={{ height: 18, fontSize: 12.5, marginTop: 6, color: C.su }}>
        {d ? <span><b style={{ color: C.tx }}>{ddmm(d.dia)}</b> · {d.recebidos} leads · KR {d.kr} · RT {d.rt}</span> : 'Passe o mouse (ou toque) numa barra para ver o dia'}
      </div>
      {!dias.length && <div style={{ padding: 30, textAlign: 'center', color: C.su, fontSize: 13 }}>Nenhum lead entregue no período.</div>}
      {!!dias.length && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <div style={{ position: 'relative', width: 30, height: 200, fontSize: 10.5, color: C.su, flexShrink: 0 }}>
            {marcas.map(v => <span key={v} style={{ position: 'absolute', right: 0, bottom: `${(v / topo) * 100}%`, transform: 'translateY(50%)' }}>{v}</span>)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ position: 'relative', height: 200 }}>
              {marcas.map(v => <div key={v} style={{ position: 'absolute', left: 0, right: 0, bottom: `${(v / topo) * 100}%`, borderTop: `1px ${v ? 'dashed' : 'solid'} ${v ? '#e2e8f0' : '#cbd5e1'}` }} />)}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: 3 }} onMouseLeave={() => setFoco(null)}>
                {dias.map((x, i) => (
                  <div key={x.dia} onMouseEnter={() => setFoco(i)} onClick={() => setFoco(i)}
                    style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', cursor: 'pointer' }}>
                    <div style={{ width: '100%', maxWidth: 30, height: `${(x.recebidos / topo) * 100}%`, display: 'flex', flexDirection: 'column', gap: x.rt && x.kr ? 2 : 0, opacity: foco == null || foco === i ? 1 : 0.45, transition: 'opacity .15s, height .6s' }}>
                      <i style={{ display: 'block', flex: x.rt, background: '#8b5cf6', borderRadius: '4px 4px 0 0', minHeight: x.rt ? 2 : 0 }} />
                      <i style={{ display: 'block', flex: x.kr, background: C.az, borderRadius: x.rt ? 0 : '4px 4px 0 0', minHeight: x.kr ? 2 : 0 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 3, marginTop: 5 }}>
              {dias.map((x, i) => (
                <span key={x.dia} style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: 10, color: ehFimDeSemana(x.dia) ? '#cbd5e1' : C.su, fontWeight: foco === i ? 800 : 400, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                  {i % pularRotulo === 0 || foco === i ? String(x.dia).slice(8, 10) : ''}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
function ResumoDias({ dias }) {
  const uteis = dias.filter(d => !ehFimDeSemana(d.dia))
  const tot = dias.reduce((s, d) => s + d.recebidos, 0)
  const kr = dias.reduce((s, d) => s + d.kr, 0)
  const maior = dias.reduce((m, d) => (!m || d.recebidos > m.recebidos ? d : m), null)
  const media = uteis.length ? Math.round(uteis.reduce((s, d) => s + d.recebidos, 0) / uteis.length) : 0
  return (
    <div style={{ border: `1px solid ${C.linha}`, borderRadius: 12, padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {[['Total no período', milhar(tot)], ['Média por dia útil', milhar(media)], ['Maior dia', maior ? `${maior.recebidos} · ${ddmm(maior.dia)}` : '—'], ['Origem KR / RT', `${pct(kr, tot)}% / ${tot ? 100 - pct(kr, tot) : 0}%`]].map(([t, v]) => (
        <div key={t} style={{ minWidth: 0 }}><div style={lbl}>{t}</div><div style={{ fontSize: 18, fontWeight: 800, marginTop: 3 }}>{v}</div></div>
      ))}
    </div>
  )
}

// Cartao de time e numero do topo: fora do componente para nao remontar (as barras reanimariam a cada atualizacao).
function Cartao({ titulo, direita, sub, acento, children }) {
  return (
    <div style={{ ...cardP, padding: 0, overflow: 'hidden', breakInside: 'avoid', marginBottom: 14 }}>
      <div style={{ height: 4, background: acento }} />
      <div style={{ padding: '14px 16px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 14.5, fontWeight: 800, flex: 1, minWidth: 0 }}>{titulo}</span>
          {direita}
        </div>
        {sub && <div style={{ fontSize: 12, color: C.su, marginTop: 3 }}>{sub}</div>}
      </div>
      <div style={{ padding: '0 16px 10px' }}>{children}</div>
    </div>
  )
}
function Kpi({ rotulo, valor, cor, extra, children, borda, mobile }) {
  return (
    <div style={{ padding: mobile ? '12px 14px' : '4px 22px', borderLeft: borda && !mobile ? `1px solid ${C.linha}` : 'none', minWidth: 0 }}>
      <div style={lbl}>{rotulo}</div>
      <div style={{ fontSize: 30, fontWeight: 800, marginTop: 4, color: cor || C.tx, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{valor}{extra}</div>
      {children}
    </div>
  )
}

export default function PainelLeads() {
  const mobile = useIsMobile()
  const [hoje, setHoje] = useState(null)
  const [erro, setErro] = useState('')
  const [aba, setAba] = useState('qualidade')
  const [per, setPer] = useState('mes')
  const [datas, setDatas] = useState({ de: somaDias(hojeISO(), -6), ate: hojeISO() })
  const [rel, setRel] = useState(null)
  const [carregandoRel, setCarregandoRel] = useState(false)
  const [modal, setModal] = useState(null)   // { tipo: 'destravar'|'negar'|'enviar', ... }
  const [gravando, setGravando] = useState(false)
  const [toast, setToast] = useState('')

  const avisar = useCallback((t) => { setToast(t); setTimeout(() => setToast(''), 3500) }, [])

  const carregarHoje = useCallback(async () => {
    const { data, error } = await supabase.rpc('retroativo_painel_hoje')
    if (error || !data?.ok) { setErro(error?.message || data?.erro || 'erro'); return }
    setErro(''); setHoje(data)
  }, [])
  useEffect(() => { carregarHoje() }, [carregarHoje])
  useEffect(() => { const t = setInterval(carregarHoje, 60000); return () => clearInterval(t) }, [carregarHoje])

  const intervalo = useMemo(() => {
    const h = hojeISO()
    if (per === 'hoje') return { de: h, ate: h }
    if (per === '7d') return { de: somaDias(h, -6), ate: h }
    if (per === 'mes') return { de: h.slice(0, 8) + '01', ate: h }
    if (per === '30d') return { de: somaDias(h, -29), ate: h }
    return datas
  }, [per, datas])

  const pedidoRel = useRef(0)
  const carregarRel = useCallback(async () => {
    if (!intervalo.de || !intervalo.ate) return
    const [de, ate] = intervalo.de <= intervalo.ate ? [intervalo.de, intervalo.ate] : [intervalo.ate, intervalo.de]
    const n = ++pedidoRel.current
    setCarregandoRel(true)
    const { data, error } = await supabase.rpc('retroativo_painel_periodo', { p_ini: de, p_fim: ate })
    if (n !== pedidoRel.current) return            // trocou o periodo no meio: ignora a resposta velha
    setCarregandoRel(false)
    if (!error && data?.ok) setRel(data)
  }, [intervalo])
  useEffect(() => { carregarRel() }, [carregarRel])

  const vend = useMemo(() => (hoje?.vendedoras || []), [hoje])
  const grupos = useMemo(() => {
    const m = {}
    vend.forEach(v => { (m[v.time] || (m[v.time] = [])).push(v) })
    const ordem = (t) => (t === 'RT' ? 'zz1' : t === 'Sem time' ? 'zz2' : t)
    return Object.entries(m).sort((a, b) => ordem(a[0]).localeCompare(ordem(b[0])))
  }, [vend])
  const travadas = vend.filter(v => v.travada)
  const reposicoes = hoje?.reposicoes || []
  const kr = vend.filter(v => v.time !== 'RT')
  const entreguesKR = kr.reduce((s, v) => s + (v.recebidos || 0), 0)
  const entreguesRT = vend.filter(v => v.time === 'RT').reduce((s, v) => s + (v.recebidos || 0), 0)
  const cotaTotal = (hoje?.times || []).reduce((s, t) => s + (t.cota || 0), 0)
  const disp = hoje?.disponiveis || { kr: 0, rt: 0 }
  const tabOntem = hoje?.tab_ontem || { total: 0, tabulados: 0 }

  async function destravar() {
    if (!modal?.motivo || modal.motivo.trim().length < 3) return
    setGravando(true)
    const { data, error } = await supabase.rpc('retroativo_destravar', { p_vend: modal.v.id, p_motivo: modal.motivo.trim() })
    setGravando(false)
    if (error || !data?.ok) { avisar('Não gravou: ' + (error?.message || data?.erro)); return }
    avisar(`${modal.v.nome} destravada hoje`); setModal(null); carregarHoje()
  }
  async function decidir(r, aprovar, obs) {
    setGravando(true)
    const { data, error } = await supabase.rpc('retroativo_reposicao_decidir', { p_id: r.id, p_aprovar: aprovar, p_obs: obs || null })
    setGravando(false)
    if (error || !data?.ok) { avisar('Não gravou: ' + (error?.message || data?.erro)); return }
    avisar(aprovar ? `Reposição aprovada · ${r.vendedora} recebe 1 lead no lugar` : 'Reposição negada · o lead voltou pra vendedora')
    setModal(null); carregarHoje(); carregarRel()
  }
  async function enviar() {
    const q = parseInt(modal?.qtd, 10)
    if (!modal?.vend || !q || !modal?.motivo || modal.motivo.trim().length < 3) return
    setGravando(true)
    const { data, error } = await supabase.rpc('retroativo_enviar_manual', { p_vend: modal.vend, p_qtd: q, p_motivo: modal.motivo.trim() })
    setGravando(false)
    if (error || !data?.ok) { avisar('Não gravou: ' + (error?.message || data?.erro)); return }
    avisar(data.enviados ? `${data.enviados} ${data.enviados === 1 ? 'lead enviado' : 'leads enviados'}` : 'Não há lead disponível na fila agora')
    setModal(null); carregarHoje()
  }

  const situacao = (v) => {
    if (!v.na_dist) return ['pausada', C.su, '#f1f5f9']
    if (v.travada) return [`⛔ travada · ${v.pend_atrasados + v.neg_vencida}`, C.ve, C.veBg]
    if (v.liberada) return ['🔓 destravada', C.la, C.laBg]
    if (v.teto && v.recebidos >= v.teto) return ['✓ cota batida', C.ok, C.okBg]
    if (v.time !== 'RT' && !v.cota_time) return ['sem cota hoje', C.su, '#f1f5f9']
    return ['recebendo', v.time === 'RT' ? C.rx : C.az, v.time === 'RT' ? C.rxBg : C.azBg]
  }

  if (erro) return <div style={{ ...cardP, color: C.ve }}>Erro ao carregar: {erro}</div>
  if (!hoje) return <div style={{ ...cardP, color: C.su }}>Carregando…</div>

  const nAcao = travadas.length + reposicoes.length
  const totalRel = rel?.total || 0
  const cats = rel?.categorias || {}
  const motivos = Object.entries(rel?.motivos || {}).sort((a, b) => b[1] - a[1])
  const totMot = motivos.reduce((s, [, n]) => s + n, 0)
  const porDia = rel?.por_dia || []
  const nPend = CATS.filter(c => c.pend).reduce((s, c) => s + (cats[c.k] || 0), 0)
  const nRuim = LEAD_RUIM.reduce((s, k) => s + (cats[k] || 0), 0)
  const maxCat = Math.max(1, ...CATS.map(c => cats[c.k] || 0))

  // ----- times em cartões: KR com cota, RT e um cartão "sem cota hoje" (sem time ou time sem cota no dia)
  const cotaDe = (time) => (hoje.times || []).find(x => x.time === time)
  const cartoes = []
  const semCota = []
  grupos.forEach(([time, vs]) => {
    if (time === 'RT') return
    if (cotaDe(time)) cartoes.push({ time, vs, t: cotaDe(time) })
    else semCota.push(...vs)
  })
  const rtVs = (grupos.find(([t]) => t === 'RT') || [null, []])[1]
  const pctTab = pct(tabOntem.tabulados, tabOntem.total)
  const corTab = pctTab >= 90 ? C.ok : pctTab >= 60 ? C.la : C.ve
  const timesBatidos = cartoes.filter(c => c.t.recebido >= c.t.cota).length

  const pessoa = (v, rt) => {
    const [txt, cor] = situacao(v)
    const max = v.teto || Math.max(...(rt ? rtVs : [v]).map(x => x.recebidos), 1)
    const corBarra = !v.na_dist ? '#cbd5e1' : v.travada ? C.ve : v.teto && v.recebidos >= v.teto ? C.ok : rt ? C.rx : C.az
    return (
      <div key={v.id} style={{ padding: '7px 0', opacity: v.na_dist ? 1 : 0.55 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13.5 }}>
          <span style={{ fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.nome}</span>
          {v.pend_hoje > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: C.la }}>{v.pend_hoje} a tabular</span>}
          <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{v.recebidos}{v.teto ? <span style={{ color: C.su, fontWeight: 600 }}>/{v.teto}</span> : null}{v.manual ? <span style={{ color: C.su, fontWeight: 600 }}> +{v.manual}</span> : null}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
          <span style={{ flex: 1 }}><Barra v={v.recebidos} max={max} cor={corBarra} /></span>
          <span style={{ fontSize: 11, fontWeight: 700, color: cor, minWidth: 92, textAlign: 'right', whiteSpace: 'nowrap' }}>{txt}</span>
        </div>
      </div>
    )
  }
  return (
    <div style={{ color: C.tx, display: 'grid', gap: 16 }}>
      {/* ---------- cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-.01em' }}>Painel de leads</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 5, fontSize: 12.5, color: C.su }}>
            <span>Hoje, {hoje.agora}</span>
            <span style={hoje.tabulacao_inicio ? chip(C.ok, C.okBg) : chip(C.la, C.laBg)}>
              {hoje.tabulacao_inicio ? `● Tabulação obrigatória ligada · leads desde ${ddmm(hoje.tabulacao_inicio)}` : '○ Tabulação obrigatória desligada'}
            </span>
          </div>
        </div>
        <button style={btn()} onClick={() => { carregarHoje(); carregarRel() }}>↻ Atualizar</button>
        <button style={btn(C.az, true)} onClick={() => setModal({ tipo: 'enviar', vend: '', qtd: '1', motivo: '' })}>＋ Enviar lead manualmente</button>
      </div>

      {/* ---------- números do dia: uma faixa só */}
      <div style={{ ...cardP, padding: mobile ? 0 : '16px 4px', display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : '1.5fr 1fr 1fr 1fr 1fr' }}>
        <Kpi mobile={mobile} rotulo="Entregues hoje · KR" valor={entreguesKR} extra={<span style={{ fontSize: 15, color: C.su, fontWeight: 700 }}> / {cotaTotal}</span>}>
          <div style={{ marginTop: 9 }}><Barra v={entreguesKR} max={cotaTotal} cor={entreguesKR >= cotaTotal ? C.ok : C.az} /></div>
          <div style={{ fontSize: 12, color: C.su, marginTop: 6 }}>{timesBatidos} de {cartoes.length} times bateram a cota</div>
        </Kpi>
        <Kpi mobile={mobile} borda rotulo="RT hoje" valor={entreguesRT} cor={C.rx}>
          <div style={{ fontSize: 12, color: C.su, marginTop: 4 }}>{hoje.rt_saldo ? `faltam ${hoje.rt_saldo} da KR p/ RT` : 'sem compensação pendente'}</div>
        </Kpi>
        <Kpi mobile={mobile} borda rotulo="Na fila" valor={(disp.kr || 0) + (disp.rt || 0)} cor={C.az}>
          <div style={{ fontSize: 12, color: C.su, marginTop: 4 }}>aprovados · KR {disp.kr || 0} · RT {disp.rt || 0}</div>
        </Kpi>
        <Kpi mobile={mobile} borda rotulo={`Tabulação ${ddmm(hoje.ontem)}`} valor={`${pctTab}%`} cor={corTab}>
          <div style={{ fontSize: 12, color: C.su, marginTop: 4 }}>{tabOntem.tabulados} de {tabOntem.total} leads</div>
        </Kpi>
        <Kpi mobile={mobile} borda rotulo="Precisam de você" valor={nAcao} cor={nAcao ? C.ve : C.ok}>
          <div style={{ fontSize: 12, color: C.su, marginTop: 4 }}>{nAcao ? `${travadas.length} ${travadas.length === 1 ? 'travada' : 'travadas'} · ${reposicoes.length} ${reposicoes.length === 1 ? 'reposição' : 'reposições'}` : 'tudo em dia'}</div>
        </Kpi>
      </div>

      {/* ---------- precisa de você: só aparece quando tem algo */}
      {nAcao > 0 && (
        <div style={{ ...cardP, borderColor: '#fecaca', background: '#fffafa' }}>
          <div style={{ ...lbl, color: '#991b1b' }}>Precisa de você · {nAcao}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10, marginTop: 10 }}>
            {travadas.map(v => (
              <div key={v.id} style={{ border: `1px solid #fecaca`, background: '#fff', borderRadius: 12, padding: 12, fontSize: 13 }}>
                <div style={{ fontWeight: 800 }}>⛔ {v.nome} <span style={{ color: C.su, fontWeight: 600 }}>· {v.time}</span></div>
                <div style={{ fontSize: 12, color: C.su, marginTop: 3 }}>
                  {v.pend_atrasados} {v.pend_atrasados === 1 ? 'lead' : 'leads'} de dias anteriores sem tabulação{v.neg_vencida ? ` · ${v.neg_vencida} em negociação há +3 dias` : ''}
                  {v.teto && v.teto > v.recebidos ? ` · ${v.teto - v.recebidos} guardados` : ''}
                </div>
                <button style={{ ...btn(C.ve), padding: '6px 10px', fontSize: 12, borderColor: '#fca5a5', marginTop: 8 }}
                  onClick={() => setModal({ tipo: 'destravar', v, motivo: '' })}>Destravar com motivo</button>
              </div>
            ))}
            {reposicoes.map(r => (
              <div key={r.id} style={{ border: `1px solid ${C.linha}`, background: '#fff', borderRadius: 12, padding: 12, fontSize: 13 }}>
                <div style={{ fontWeight: 800 }}>👤 Reposição · {r.vendedora}</div>
                <div style={{ fontSize: 12, color: C.su, marginTop: 3 }}>{r.cliente} · é homem · {quandoFoi(r.pedido_em)}{r.obs ? ` · "${r.obs}"` : ''}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button style={{ ...btn(C.ok, true), padding: '6px 10px', fontSize: 12 }} disabled={gravando} onClick={() => decidir(r, true)}>Aprovar</button>
                  <button style={{ ...btn(), padding: '6px 10px', fontSize: 12 }} disabled={gravando} onClick={() => setModal({ tipo: 'negar', r, motivo: '' })}>Negar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------- distribuição de hoje: um cartão por time */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Distribuição de hoje</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: C.su }}>
            {[[C.az, 'recebendo'], [C.ok, 'cota batida'], [C.ve, 'travada'], ['#cbd5e1', 'fora / pausada']].map(([c, t]) => (
              <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: 99, background: c, display: 'inline-block' }} />{t}</span>
            ))}
          </div>
        </div>
        <div style={{ columns: '290px', columnGap: 14 }}>
          {cartoes.map(({ time, vs, t }) => {
            const ok = t.recebido >= t.cota
            return (
              <Cartao key={time} titulo={time} acento={ok ? C.ok : C.az}
                direita={<span style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{t.recebido}<span style={{ fontSize: 13, color: C.su }}> / {t.cota}</span></span>}
                sub={ok ? <b style={{ color: C.ok }}>✓ cota do time batida</b> : `faltam ${t.cota - t.recebido} para a cota`}>
                {vs.map(v => pessoa(v))}
              </Cartao>
            )
          })}
          {rtVs.length > 0 && (
            <Cartao titulo="RT" acento={C.rx}
              direita={<span style={{ fontSize: 20, fontWeight: 800, color: C.rx }}>{entreguesRT}<span style={{ fontSize: 13, color: C.su }}> hoje</span></span>}
              sub={hoje.rt_saldo ? `faltam ${hoje.rt_saldo} leads da KR para a RT` : 'sem cota diária'}>
              {rtVs.map(v => pessoa(v, true))}
            </Cartao>
          )}
          {semCota.length > 0 && (
            <Cartao titulo="Sem cota hoje" acento="#cbd5e1" sub="Não estão em time com cota no dia: não recebem pela cota.">
              {semCota.map(v => (
                <div key={v.id} style={{ display: 'flex', gap: 8, padding: '6px 0', fontSize: 13, borderTop: `1px solid ${C.linha}` }}>
                  <span style={{ fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.nome}</span>
                  <span style={{ color: C.su, fontSize: 12 }}>{v.time === 'Sem time' ? 'sem time' : v.time}</span>
                  <b style={{ minWidth: 18, textAlign: 'right' }}>{v.recebidos}</b>
                </div>
              ))}
            </Cartao>
          )}
        </div>
      </div>

      {/* ---------- relatórios por período */}
      <div style={{ ...cardP, padding: 0, overflow: 'hidden', marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '14px 16px', borderBottom: `1px solid ${C.linha}` }}>
          <div style={{ fontSize: 16, fontWeight: 800, marginRight: 4 }}>Relatórios</div>
          <div style={{ display: 'inline-flex', background: '#f1f5f9', borderRadius: 10, padding: 3, gap: 2, flexWrap: 'wrap' }}>
            {[['qualidade', 'Qualidade dos leads'], ['vendedoras', 'Vendedoras'], ['recebidos', 'Recebidos por dia']].map(([k, t]) => (
              <button key={k} onClick={() => setAba(k)} style={{ border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '7px 12px', borderRadius: 8, fontWeight: 700, fontSize: 13, background: aba === k ? '#fff' : 'transparent', color: aba === k ? C.tx : C.su, boxShadow: aba === k ? '0 1px 3px rgba(15,23,42,.12)' : 'none' }}>{t}</button>
            ))}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {[['hoje', 'Hoje'], ['7d', '7 dias'], ['mes', 'Este mês'], ['30d', '30 dias'], ['datas', 'Escolher datas']].map(([k, t]) => (
              <button key={k} onClick={() => setPer(k)} style={{ ...btn(per === k ? C.az : C.su, per === k), padding: '6px 11px', fontSize: 12.5, borderRadius: 99 }}>{t}</button>
            ))}
            {per === 'datas' && <>
              <input type="date" value={datas.de} onChange={e => setDatas({ ...datas, de: e.target.value })} style={{ ...campo, marginTop: 0, width: 'auto', padding: '5px 8px' }} />
              <span style={{ color: C.su, fontSize: 12 }}>até</span>
              <input type="date" value={datas.ate} onChange={e => setDatas({ ...datas, ate: e.target.value })} style={{ ...campo, marginTop: 0, width: 'auto', padding: '5px 8px' }} />
            </>}
          </div>
        </div>

        {!rel && <div style={{ padding: 30, textAlign: 'center', color: C.su, fontSize: 13 }}>Carregando…</div>}
        {rel && (
          <div style={{ padding: 16, opacity: carregandoRel ? 0.5 : 1, transition: 'opacity .2s' }}>
            <div style={{ fontSize: 12.5, color: C.su, marginBottom: 12 }}>
              Leads entregues de <b style={{ color: C.tx }}>{ddmm(rel.ini)}</b> a <b style={{ color: C.tx }}>{ddmm(rel.fim)}</b>{carregandoRel ? ' · atualizando…' : ''}
            </div>

            {aba === 'qualidade' && (
              <div style={{ display: 'grid', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 10 }}>
                  {[
                    ['Leads recebidos', milhar(totalRel), C.tx, 'no período'],
                    ['Viraram venda', milhar(cats.venda), C.ok, `${pctTxt(cats.venda, totalRel)} dos leads`],
                    ['Lead ruim', milhar(nRuim), C.ve, `${pctTxt(nRuim, totalRel)} · telefone errado, sem direito, homem ou negado`],
                    ['Ainda sem tabulação', milhar(nPend), nPend ? C.la : C.ok, `${pctTxt(nPend, totalRel)} dos leads`],
                  ].map(([r, v, cor, sub]) => (
                    <div key={r} style={{ background: '#f8fafc', border: `1px solid ${C.linha}`, borderRadius: 12, padding: '12px 14px', minWidth: 0 }}>
                      <div style={lbl}>{r}</div>
                      <div style={{ fontSize: 26, fontWeight: 800, color: cor, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                      <div style={{ fontSize: 11.5, color: C.su, marginTop: 2 }}>{sub}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1.5fr 1fr', gap: 14, alignItems: 'start' }}>
                  <div style={{ border: `1px solid ${C.linha}`, borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>Para onde foram os leads</div>
                    <div style={{ fontSize: 12, color: C.su, marginTop: 2 }}>Barra = quantidade · % sobre o total do período</div>
                    {[false, true].map(pend => (
                      <div key={String(pend)} style={{ marginTop: pend ? 14 : 8, paddingTop: pend ? 12 : 0, borderTop: pend ? `1px dashed ${C.linha}` : 'none' }}>
                        {pend && <div style={{ ...lbl, color: C.la, marginBottom: 2 }}>Ainda pendente (não conta como tabulado)</div>}
                        {CATS.filter(c => !!c.pend === pend).map(c => {
                          const n = cats[c.k] || 0
                          if (pend && c.k === 'sem_resposta_1' && !n) return null
                          return (
                            <div key={c.k} title={`${c.t}: ${milhar(n)} (${pctTxt(n, totalRel)})`}
                              style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 48px 44px' : '200px 1fr 56px 44px', gap: 10, alignItems: 'center', padding: '6px 0', fontSize: 13 }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                <i style={{ width: 9, height: 9, borderRadius: 3, background: c.cor, flexShrink: 0 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: n ? C.tx : C.su }}>{c.t}</span>
                              </span>
                              {!mobile && <Barra v={n} max={maxCat} cor={c.cor} />}
                              <span style={{ textAlign: 'right', color: C.su, fontVariantNumeric: 'tabular-nums' }}>{milhar(n)}</span>
                              <b style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: n ? C.tx : C.su }}>{pctTxt(n, totalRel)}</b>
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>

                  <div style={{ border: `1px solid ${C.linha}`, borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>Por que não fechou</div>
                    <div style={{ fontSize: 12, color: C.su, marginTop: 2 }}>{totMot ? `${milhar(totMot)} leads com motivo` : 'Motivos escolhidos no botão "Não quis fechar"'}</div>
                    {!motivos.length && (
                      <div style={{ marginTop: 14, padding: '18px 14px', borderRadius: 10, background: '#f8fafc', fontSize: 13, color: C.su, textAlign: 'center' }}>
                        Nenhum motivo registrado no período.<br />Aparece aqui assim que as vendedoras começarem a usar o botão.
                      </div>
                    )}
                    {motivos.map(([m, n], i) => (
                      <div key={m} style={{ marginTop: 10 }}>
                        <div style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                          <span style={{ flex: 1, minWidth: 0, fontWeight: i < 3 ? 700 : 500 }}>{MOTIVOS[m] || m}</span>
                          <span style={{ color: C.su }}>{n}</span><b style={{ minWidth: 38, textAlign: 'right' }}>{pctTxt(n, totMot)}</b>
                        </div>
                        <div style={{ marginTop: 4 }}><Barra v={n} max={motivos[0][1]} cor={i < 3 ? '#d97706' : '#fcd34d'} /></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {aba === 'vendedoras' && <TabelaVendedoras linhas={rel.vendedoras || []} mobile={mobile} />}

            {aba === 'recebidos' && (
              <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1.7fr 1fr', gap: 14, alignItems: 'start' }}>
                <GraficoDias dias={porDia} />
                <div style={{ display: 'grid', gap: 14 }}>
                  <ResumoDias dias={porDia} />
                  <div style={{ border: `1px solid ${C.linha}`, borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>Reposições e envios manuais</div>
                    {[['Reposições pedidas', rel.reposicoes?.total, C.tx], ['Aprovadas', rel.reposicoes?.aprovadas, C.ok], ['Negadas', rel.reposicoes?.negadas, C.ve],
                      ['Esperando decisão', rel.reposicoes?.pendentes, C.la], ['Leads enviados na mão', rel.envios_manuais, C.az]].map(([t, n, cor]) => (
                      <div key={t} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.linha}`, fontSize: 13.5 }}>
                        <span>{t}</span><b style={{ color: n ? cor : C.su }}>{n || 0}</b>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---------- modais */}
      {modal?.tipo === 'destravar' && (
        <Modal titulo={`Destravar ${modal.v.nome}`} sub="Vale só para hoje. Fica registrado quem destravou e por quê." onFechar={() => !gravando && setModal(null)}>
          <textarea style={{ ...campo, minHeight: 70 }} placeholder="Motivo (obrigatório)" value={modal.motivo} onChange={e => setModal({ ...modal, motivo: e.target.value })} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button style={btn()} onClick={() => setModal(null)} disabled={gravando}>Cancelar</button>
            <button style={btn(C.ve, true)} onClick={destravar} disabled={gravando || modal.motivo.trim().length < 3}>{gravando ? 'Gravando…' : 'Destravar'}</button>
          </div>
        </Modal>
      )}
      {modal?.tipo === 'negar' && (
        <Modal titulo="Negar reposição" sub={`${modal.r.cliente} · ${modal.r.vendedora}. O lead volta para ela, sem tabulação.`} onFechar={() => !gravando && setModal(null)}>
          <textarea style={{ ...campo, minHeight: 70 }} placeholder="Por que está negando? (obrigatório)" value={modal.motivo} onChange={e => setModal({ ...modal, motivo: e.target.value })} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button style={btn()} onClick={() => setModal(null)} disabled={gravando}>Cancelar</button>
            <button style={btn(C.ve, true)} onClick={() => decidir(modal.r, false, modal.motivo.trim())} disabled={gravando || modal.motivo.trim().length < 3}>{gravando ? 'Gravando…' : 'Negar'}</button>
          </div>
        </Modal>
      )}
      {modal?.tipo === 'enviar' && (
        <Modal titulo="Enviar lead manualmente" sub={`Sai da fila de aprovados (KR ${disp.kr || 0} · RT ${disp.rt || 0}). Não conta na cota do dia.`} onFechar={() => !gravando && setModal(null)}>
          <select style={campo} value={modal.vend} onChange={e => setModal({ ...modal, vend: e.target.value })}>
            <option value="">Escolha a vendedora</option>
            {vend.filter(v => v.na_dist).map(v => <option key={v.id} value={v.id}>{v.nome} · {v.time}</option>)}
          </select>
          <input style={campo} type="number" min="1" max="50" value={modal.qtd} onChange={e => setModal({ ...modal, qtd: e.target.value })} placeholder="Quantidade" />
          <textarea style={{ ...campo, minHeight: 60 }} placeholder="Motivo (obrigatório)" value={modal.motivo} onChange={e => setModal({ ...modal, motivo: e.target.value })} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button style={btn()} onClick={() => setModal(null)} disabled={gravando}>Cancelar</button>
            <button style={btn(C.az, true)} onClick={enviar} disabled={gravando || !modal.vend || !parseInt(modal.qtd, 10) || modal.motivo.trim().length < 3}>{gravando ? 'Enviando…' : 'Enviar'}</button>
          </div>
        </Modal>
      )}
      {toast && <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', padding: '12px 22px', borderRadius: 10, background: C.tx, color: '#fff', fontSize: 13, fontWeight: 600, zIndex: 9999 }}>{toast}</div>}
      <div style={{ fontSize: 11.5, color: C.su }}>Leads guardados = a parte da cota da vendedora travada, que espera por ela. Envio manual não conta na cota. Reposição aprovada: ela recebe 1 lead no lugar e o total do dia fica igual. Atualiza sozinho a cada minuto · {horaDe(new Date())}</div>
    </div>
  )
}
