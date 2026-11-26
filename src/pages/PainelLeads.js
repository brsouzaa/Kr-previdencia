import { useEffect, useState, useCallback, useMemo } from 'react'
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

const CATS = [
  ['venda', '✅ Vendeu', '#15803d'], ['negociacao', '🤝 Em negociação', '#0369a1'], ['nao_quis', '🙅 Não quis fechar', '#b45309'],
  ['sem_resposta', '📵 Não respondeu', '#64748b'], ['tel_errado', '☎️ Telefone errado', '#b91c1c'], ['sem_direito', '🚫 Não tem direito', '#6d28d9'],
  ['homem', '👤 Lead errado (homem)', '#0f172a'], ['negado', '⛔ Negado depois', '#94a3b8'], ['sem_tabulacao', '⏳ Sem tabulação', '#cbd5e1'],
]
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

  const carregarRel = useCallback(async () => {
    if (!intervalo.de || !intervalo.ate) return
    setCarregandoRel(true)
    const { data, error } = await supabase.rpc('retroativo_painel_periodo', { p_ini: intervalo.de, p_fim: intervalo.ate })
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
    if (!v.na_dist) return ['fora da distribuição', C.su, '#f1f5f9']
    if (v.travada) return [`⛔ travada · ${v.pend_atrasados + v.neg_vencida} pendentes`, C.ve, C.veBg]
    if (v.liberada) return ['🔓 destravada hoje', C.la, C.laBg]
    if (v.teto && v.recebidos >= v.teto) return ['✓ cota batida', C.ok, C.okBg]
    if (v.time !== 'RT' && !v.cota_time) return ['sem cota de time hoje', C.su, '#f1f5f9']
    return ['recebendo', v.time === 'RT' ? C.rx : C.az, v.time === 'RT' ? C.rxBg : C.azBg]
  }

  if (erro) return <div style={{ ...cardP, color: C.ve }}>Erro ao carregar: {erro}</div>
  if (!hoje) return <div style={{ ...cardP, color: C.su }}>Carregando…</div>

  const nAcao = travadas.length + reposicoes.length
  const grid2 = (a, b) => ({ display: 'grid', gridTemplateColumns: mobile ? '1fr' : `${a}fr ${b}fr`, gap: 14 })
  const totalRel = rel?.total || 0
  const cats = rel?.categorias || {}
  const motivos = Object.entries(rel?.motivos || {}).sort((a, b) => b[1] - a[1])
  const totMot = motivos.reduce((s, [, n]) => s + n, 0)
  const porDia = rel?.por_dia || []
  const maxDia = Math.max(1, ...porDia.map(d => d.recebidos))

  return (
    <div style={{ color: C.tx, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ fontSize: 23, fontWeight: 800, margin: 0 }}>📨 Painel de leads</h1>
          <div style={{ fontSize: 13, color: C.su, marginTop: 3 }}>
            Atualizado {hoje.agora} · tabulação obrigatória: {hoje.tabulacao_inicio
              ? <b style={{ color: C.ok }}>ligada (leads desde {ddmm(hoje.tabulacao_inicio)})</b>
              : <b style={{ color: C.la }}>ainda desligada</b>}
          </div>
        </div>
        <button style={btn()} onClick={() => { carregarHoje(); carregarRel() }}>🔄 Atualizar</button>
        <button style={btn(C.az, true)} onClick={() => setModal({ tipo: 'enviar', vend: '', qtd: '1', motivo: '' })}>📨 Enviar lead manualmente</button>
      </div>

      {/* ---------- números do topo */}
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : '1.4fr 1fr 1fr 1fr', gap: 12 }}>
        <div style={cardP}>
          <div style={lbl}>Entregues hoje (KR)</div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>{entreguesKR} <span style={{ fontSize: 15, color: C.su }}>/ {cotaTotal} da cota</span></div>
          <div style={{ marginTop: 8 }}><Barra v={entreguesKR} max={cotaTotal} cor={C.az} /></div>
          <div style={{ fontSize: 12, color: C.su, marginTop: 6 }}>RT: {entreguesRT} hoje{hoje.rt_saldo ? ` · faltam ${hoje.rt_saldo} da KR para a RT` : ''}</div>
        </div>
        <div style={cardP}>
          <div style={lbl}>Na fila para enviar</div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4, color: C.az }}>{(disp.kr || 0) + (disp.rt || 0)}</div>
          <div style={{ fontSize: 12, color: C.su, marginTop: 2 }}>aprovados aguardando · KR {disp.kr || 0} · RT {disp.rt || 0}</div>
        </div>
        <div style={cardP}>
          <div style={lbl}>Tabulação de {ddmm(hoje.ontem)}</div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4, color: pct(tabOntem.tabulados, tabOntem.total) >= 90 ? C.ok : pct(tabOntem.tabulados, tabOntem.total) >= 60 ? C.la : C.ve }}>{pct(tabOntem.tabulados, tabOntem.total)}%</div>
          <div style={{ fontSize: 12, color: C.su, marginTop: 2 }}>{tabOntem.tabulados} de {tabOntem.total} leads</div>
        </div>
        <div style={{ ...cardP, ...(nAcao ? { borderColor: '#fecaca', background: '#fff7f7' } : {}) }}>
          <div style={{ ...lbl, color: nAcao ? '#991b1b' : C.su }}>Precisam de ação</div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4, color: nAcao ? C.ve : C.ok }}>{nAcao}</div>
          <div style={{ fontSize: 12, color: C.su, marginTop: 2 }}>{travadas.length} {travadas.length === 1 ? 'travada' : 'travadas'} · {reposicoes.length} {reposicoes.length === 1 ? 'reposição' : 'reposições'}</div>
        </div>
      </div>

      {/* ---------- distribuição + ações */}
      <div style={grid2(1.75, 1)}>
        <div style={cardP}>
          <div style={lbl}>Distribuição de hoje</div>
          {grupos.map(([time, vs], gi) => {
            const t = (hoje.times || []).find(x => x.time === time)
            return (
              <div key={time} style={{ marginTop: 10, paddingTop: gi ? 10 : 0, borderTop: gi ? `1px solid ${C.linha}` : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 800, color: '#334155', marginBottom: 4 }}>
                  <span>{time}</span><span>{t ? `${t.recebido} / ${t.cota}` : time === 'RT' ? `${vs.reduce((s, v) => s + v.recebidos, 0)} hoje` : ''}</span>
                </div>
                {vs.map(v => {
                  const [txt, cor, bg] = situacao(v)
                  const max = v.teto || Math.max(...vs.map(x => x.recebidos), 1)
                  return (
                    <div key={v.id} style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 70px' : '150px 1fr 70px 210px', gap: 10, alignItems: 'center', padding: '6px 0', fontSize: 13.5 }}>
                      <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.nome}</span>
                      {!mobile && <Barra v={v.recebidos} max={max} cor={v.travada ? C.ve : v.teto && v.recebidos >= v.teto ? C.ok : time === 'RT' ? C.rx : C.az} />}
                      <span style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{v.teto ? `${v.recebidos} / ${v.teto}` : v.recebidos}{v.manual ? <span style={{ color: C.su, fontWeight: 600 }}> +{v.manual}</span> : null}</span>
                      {!mobile && <span style={chip(cor, bg)}>{txt}</span>}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        <div style={{ ...cardP, alignSelf: 'start' }}>
          <div style={lbl}>Precisa de você</div>
          {!nAcao && <div style={{ fontSize: 13, color: C.su, padding: '20px 0', textAlign: 'center' }}>Nada pendente agora. 👏</div>}
          {travadas.map(v => (
            <div key={v.id} style={{ padding: '11px 0', borderBottom: `1px solid ${C.linha}`, fontSize: 13 }}>
              <div style={{ fontWeight: 800 }}>⛔ {v.nome} travada</div>
              <div style={{ fontSize: 12, color: C.su, marginTop: 2 }}>
                {v.pend_atrasados} {v.pend_atrasados === 1 ? 'lead' : 'leads'} de dias anteriores sem tabulação{v.neg_vencida ? ` · ${v.neg_vencida} em negociação há +3 dias` : ''}
                {v.teto ? ` · ${Math.max(v.teto - v.recebidos, 0)} leads guardados` : ''}
              </div>
              <div style={{ marginTop: 7 }}>
                <button style={{ ...btn(C.ve), padding: '6px 10px', fontSize: 12, borderColor: '#fca5a5' }}
                  onClick={() => setModal({ tipo: 'destravar', v, motivo: '' })}>Destravar com motivo</button>
              </div>
            </div>
          ))}
          {reposicoes.map(r => (
            <div key={r.id} style={{ padding: '11px 0', borderBottom: `1px solid ${C.linha}`, fontSize: 13 }}>
              <div style={{ fontWeight: 800 }}>👤 Reposição · {r.vendedora}</div>
              <div style={{ fontSize: 12, color: C.su, marginTop: 2 }}>{r.cliente} · é homem · {quandoFoi(r.pedido_em)}{r.obs ? ` · "${r.obs}"` : ''}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                <button style={{ ...btn(C.ok, true), padding: '6px 10px', fontSize: 12 }} disabled={gravando} onClick={() => decidir(r, true)}>Aprovar</button>
                <button style={{ ...btn(), padding: '6px 10px', fontSize: 12 }} disabled={gravando} onClick={() => setModal({ tipo: 'negar', r, motivo: '' })}>Negar</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ---------- relatórios por período */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', borderBottom: `2px solid ${C.linha}`, marginTop: 6 }}>
        {[['qualidade', 'Qualidade dos leads'], ['vendedoras', 'Vendedoras'], ['recebidos', 'Recebidos e reposições']].map(([k, t]) => (
          <button key={k} onClick={() => setAba(k)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '10px 14px', fontWeight: 700, fontSize: 13.5, color: aba === k ? C.tx : C.su, borderBottom: aba === k ? `3px solid ${C.az}` : '3px solid transparent', marginBottom: -2 }}>{t}</button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: '6px 0' }}>
          <select value={per} onChange={e => setPer(e.target.value)} style={{ ...campo, marginTop: 0, width: 'auto' }}>
            <option value="hoje">Hoje</option><option value="7d">Últimos 7 dias</option><option value="mes">Este mês</option>
            <option value="30d">Últimos 30 dias</option><option value="datas">De–até</option>
          </select>
          {per === 'datas' && <>
            <input type="date" value={datas.de} onChange={e => setDatas({ ...datas, de: e.target.value })} style={{ ...campo, marginTop: 0, width: 'auto' }} />
            <input type="date" value={datas.ate} onChange={e => setDatas({ ...datas, ate: e.target.value })} style={{ ...campo, marginTop: 0, width: 'auto' }} />
          </>}
          {carregandoRel && <span style={{ fontSize: 12, color: C.su }}>carregando…</span>}
        </div>
      </div>

      {rel && aba === 'qualidade' && (
        <div style={grid2(1.2, 1)}>
          <div style={cardP}>
            <div style={lbl}>Resultado dos {totalRel.toLocaleString('pt-BR')} leads de {ddmm(rel.ini)} a {ddmm(rel.fim)}</div>
            <div style={{ display: 'flex', height: 28, borderRadius: 8, overflow: 'hidden', marginTop: 12, background: C.linha }}>
              {CATS.map(([k, , cor]) => cats[k] ? <i key={k} title={k} style={{ display: 'block', width: `${(cats[k] / Math.max(totalRel, 1)) * 100}%`, background: cor, transition: 'width .6s' }} /> : null)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: '7px 18px', marginTop: 12, fontSize: 13 }}>
              {CATS.map(([k, t, cor]) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: cor, display: 'inline-block' }} />{t}
                  <b style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{pct(cats[k] || 0, totalRel)}%</b>
                  <span style={{ color: C.su, fontSize: 12, minWidth: 40, textAlign: 'right' }}>{cats[k] || 0}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={cardP}>
            <div style={lbl}>Por que não fechou</div>
            {!motivos.length && <div style={{ fontSize: 13, color: C.su, padding: '18px 0' }}>Ainda sem "Não quis fechar" no período.</div>}
            {motivos.map(([m, n]) => (
              <div key={m} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 44px', gap: 10, alignItems: 'center', fontSize: 13, marginTop: 9 }}>
                <span>{MOTIVOS[m] || m}</span><Barra v={n} max={totMot} cor={C.la} /><b style={{ textAlign: 'right' }}>{pct(n, totMot)}%</b>
              </div>
            ))}
          </div>
        </div>
      )}

      {rel && aba === 'vendedoras' && (
        <div style={{ ...cardP, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
            <thead><tr>{['Vendedora', 'Time', 'Recebidos', 'Tabulados', 'Vendas', 'Conversão', 'Em negociação', 'Não quis', 'Sem tabulação'].map(h => (
              <th key={h} style={{ ...lbl, textAlign: h === 'Vendedora' || h === 'Time' ? 'left' : 'right', padding: '8px', borderBottom: `1px solid ${C.linha}` }}>{h}</th>))}</tr></thead>
            <tbody>
              {(rel.vendedoras || []).map(v => (
                <tr key={(v.nome || '-') + v.time}>
                  <td style={{ padding: '8px', fontWeight: 700 }}>{v.nome || '—'}</td><td style={{ padding: '8px', color: C.su }}>{v.time}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{v.recebidos}{v.manual ? <span style={{ color: C.su }}> (+{v.manual} manual)</span> : null}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: pct(v.tabulados, v.recebidos) >= 90 ? C.ok : C.la, fontWeight: 700 }}>{pct(v.tabulados, v.recebidos)}%</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: C.ok }}>{v.vendas}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800 }}>{pct(v.vendas, v.recebidos)}%</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{v.negociacao}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{v.nao_quis}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: v.sem_tabulacao ? C.ve : C.su }}>{v.sem_tabulacao}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rel && aba === 'recebidos' && (
        <div style={grid2(1.6, 1)}>
          <div style={cardP}>
            <div style={lbl}>Leads recebidos por dia · {totalRel.toLocaleString('pt-BR')} no período</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 170, marginTop: 14 }}>
              {porDia.map(d => (
                <div key={d.dia} title={`${ddmm(d.dia)}: ${d.recebidos} (KR ${d.kr} · RT ${d.rt})`} style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700 }}>{d.recebidos}</span>
                  <div style={{ width: '100%', maxWidth: 34, display: 'flex', flexDirection: 'column', height: `${(d.recebidos / maxDia) * 85}%`, transition: 'height .6s', borderRadius: '5px 5px 2px 2px', overflow: 'hidden' }}>
                    <i style={{ display: 'block', flex: d.rt, background: C.rx }} /><i style={{ display: 'block', flex: d.kr, background: C.az }} />
                  </div>
                  <span style={{ fontSize: 10, color: C.su, marginTop: 3 }}>{ddmm(d.dia)}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 12, color: C.su, marginTop: 8 }}>
              <span><b style={{ color: C.az }}>■</b> KR</span><span><b style={{ color: C.rx }}>■</b> RT</span><span>passe o mouse na barra para ver o número</span>
            </div>
          </div>
          <div style={cardP}>
            <div style={lbl}>Reposições e envios no período</div>
            {[['Pedidos de reposição', rel.reposicoes?.total], ['Aprovadas', rel.reposicoes?.aprovadas], ['Negadas', rel.reposicoes?.negadas],
              ['Pendentes', rel.reposicoes?.pendentes], ['Envios manuais', rel.envios_manuais]].map(([t, n]) => (
              <div key={t} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${C.linha}`, fontSize: 13.5 }}>
                <span>{t}</span><b>{n || 0}</b>
              </div>
            ))}
          </div>
        </div>
      )}

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
