import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// ═══════════════════════════════════════════════════════════════
// CENTRAL DE RETORNO — interface do sistema de retrabalho multicanal
// (push grátis + avisos pagos WhatsApp/SMS/Email do KR Chat/PWA).
// Todo acesso a dados passa pela edge central-retorno (admin-only,
// service role só no backend, segredos sempre mascarados ****ab12).
// Paleta dos gráficos validada (CVD + contraste) contra o fundo grafite.
// ═══════════════════════════════════════════════════════════════

const ROSA = '#db2777' // acento da marca (UI, nunca série de dado)
// séries de dado (validadas): canais e funil de e-mail
const CORES_CANAL = { whatsapp: '#059669', sms: '#3b82f6', email: '#d97706' }
const ICONE_CANAL = { whatsapp: '💬', sms: '📱', email: '✉️' }
const CORES_EMAIL = { enviados: '#8b5cf6', entregues: '#059669', abertos: '#3b82f6', clicados: '#ec4899' }
// status (reservadas pra estado, nunca série)
const OK = '#059669', ALERTA = '#b45309', ERRO = '#dc2626', NEUTRO = '#5b6b84'

const GATES = [
  ['conversa_criada', 'Iniciou conversa'], ['oferta_vista', 'Viu a oferta'],
  ['rg_frente', 'RG frente'], ['rg_verso', 'RG verso'],
  ['extrato', 'Extrato'], ['cnis', 'CNIS'],
]
const REGRA_NEGOCIO = 'Limitador: 1 SMS + 1 WhatsApp pagos por lead/dia (3/semana cada); email até 5/dia. O aviso só é disparado quando existe mensagem real esperando na conversa.'

// ───────────────────────── design system da tela ─────────────────────────
const s = {
  title: { fontSize: 20, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.01em' },
  sub: { fontSize: 13, color: '#5b6b84', marginTop: 2, marginBottom: 16 },
  // seção = bloco branco da tela (card grande com cabeçalho)
  secao: { background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 14, padding: 16, marginBottom: 14 },
  secaoHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  secaoTit: { fontSize: 13, fontWeight: 600, color: '#334155' },
  secaoSub: { fontSize: 11, color: '#64748b' },
  // KPI = tile interno (superfície mais escura que a seção)
  kpi: { background: '#f1f5f9', border: '0.5px solid rgba(15,23,42,0.07)', borderRadius: 12, padding: '12px 14px', minWidth: 0 },
  kpiLbl: { fontSize: 10, fontWeight: 600, color: '#5b6b84', textTransform: 'uppercase', letterSpacing: '0.06em' },
  kpiNum: { fontSize: 24, fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums', lineHeight: 1.25, marginTop: 2 },
  kpiSub: { fontSize: 11, color: '#5b6b84', marginTop: 4, lineHeight: 1.5 },
  grid: (min = 150) => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 10 }),
  input: { padding: '7px 10px', fontSize: 13, borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.13)', background: '#f1f5f9', color: '#0f172a', width: '100%', boxSizing: 'border-box' },
  label: { fontSize: 11, color: '#5b6b84', display: 'block', marginBottom: 3, marginTop: 8 },
  btn: (cor = '#2563eb', solido = false) => ({
    padding: '7px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
    border: `1px solid ${cor}`, background: solido ? cor : 'transparent', color: solido ? '#10141b' : cor,
  }),
  chip: (ativo, cor = ROSA) => ({
    padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 999, cursor: 'pointer',
    border: ativo ? `1px solid ${cor}` : '0.5px solid rgba(15,23,42,0.11)',
    background: ativo ? `${cor}22` : '#f1f5f9', color: ativo ? cor : '#5b6b84',
  }),
  aviso: { fontSize: 12, color: '#b45309', background: 'rgba(251,191,36,.08)', border: '0.5px solid rgba(251,191,36,.3)', borderRadius: 10, padding: '9px 12px', lineHeight: 1.5 },
  erroBox: { fontSize: 12, color: ERRO, background: 'rgba(248,113,113,.08)', border: '0.5px solid rgba(248,113,113,.35)', borderRadius: 10, padding: '9px 12px' },
  th: { textAlign: 'left', fontSize: 10.5, color: '#5b6b84', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '9px 10px', borderBottom: '1px solid rgba(15,23,42,0.07)' },
  td: { fontSize: 13, color: '#0f172a', padding: '9px 10px', borderBottom: '0.5px solid rgba(15,23,42,0.05)', verticalAlign: 'middle', fontVariantNumeric: 'tabular-nums' },
  tabela: { width: '100%', borderCollapse: 'collapse' },
  badge: (cor, bg) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600, color: cor, background: bg }),
  vazio: { color: '#64748b', fontSize: 12, padding: '18px 0', textAlign: 'center' },
  nota: { fontSize: 11, color: '#64748b', marginTop: 8 },
}
const fmtBR = (dt) => { if (!dt) return '—'; try { return new Date(dt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return dt } }
const reais = (v) => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',')

function Secao({ icone, titulo, sub, acao, children, estilo }) {
  return (
    <div style={{ ...s.secao, ...(estilo || {}) }}>
      {(titulo || acao) && (
        <div style={s.secaoHead}>
          <div>
            <span style={s.secaoTit}>{icone ? `${icone} ` : ''}{titulo}</span>
            {sub && <span style={{ ...s.secaoSub, marginLeft: 8 }}>{sub}</span>}
          </div>
          {acao}
        </div>
      )}
      {children}
    </div>
  )
}
function Kpi({ label, valor, cor, sub, borda }) {
  return (
    <div style={{ ...s.kpi, ...(borda ? { border: `1px solid ${borda}55`, boxShadow: `inset 3px 0 0 ${borda}` } : {}) }}>
      <div style={s.kpiLbl}>{label}</div>
      <div style={{ ...s.kpiNum, color: cor || '#0f172a' }}>{valor}</div>
      {sub && <div style={s.kpiSub}>{sub}</div>}
    </div>
  )
}
function Legenda({ itens }) {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10 }}>
      {itens.map(([cor, lbl]) => (
        <span key={lbl} style={{ fontSize: 11, color: '#5b6b84', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: cor, display: 'inline-block' }} />{lbl}
        </span>
      ))}
    </div>
  )
}

async function chamar(acao, extra = {}) {
  const { data, error } = await supabase.functions.invoke('central-retorno', { body: { acao, ...extra } })
  if (error) {
    let msg = error.message
    try { const ctx = await error.context?.json(); if (ctx?.error) msg = ctx.error } catch { /* usa message */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

// ═══════════════════════════ página ═══════════════════════════
export default function CentralRetorno() {
  const [tela, setTela] = useState('painel')
  const [ov, setOv] = useState(null)
  const [erro, setErro] = useState('')

  const carregarOverview = useCallback(async () => {
    try { setOv(await chamar('overview')); setErro('') } catch (e) { setErro(String(e.message || e)) }
  }, [])
  useEffect(() => {
    carregarOverview()
    const t = setInterval(carregarOverview, 90000)
    return () => clearInterval(t)
  }, [carregarOverview])

  const ABAS = [['painel', '📊 Painel'], ['leads', '👥 Leads'], ['crefaz', '💡 Crefaz'], ['conectores', '🔌 Conectores'], ['campanhas', '📢 Campanhas'], ['email', '✉️ E-mail'], ['fila', '📜 Fila / Log']]

  return (
    <div style={{ maxWidth: 1180 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={s.title}>📣 Central de Retorno</div>
          <div style={s.sub}>Retrabalho multicanal do KR Chat — push grátis + avisos pagos por WhatsApp, SMS e e-mail.</div>
        </div>
      </div>

      {/* sub-navegação: controle segmentado */}
      <div style={{ display: 'inline-flex', background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 10, padding: 3, gap: 2, marginBottom: 16, flexWrap: 'wrap' }}>
        {ABAS.map(([k, lbl]) => (
          <button key={k} onClick={() => setTela(k)}
            style={{ padding: '7px 13px', fontSize: 12.5, fontWeight: 600, borderRadius: 8, cursor: 'pointer', border: 'none', background: tela === k ? '#dde5f0' : 'transparent', color: tela === k ? '#0f172a' : '#5b6b84', boxShadow: tela === k ? `inset 0 -2px 0 ${ROSA}` : 'none' }}>
            {lbl}
          </button>
        ))}
      </div>

      {erro && <div style={{ ...s.erroBox, marginBottom: 12 }}>⚠ {erro}</div>}
      {!ov && !erro && <div style={{ color: '#5b6b84', fontSize: 13 }}>Carregando...</div>}

      {ov && tela === 'painel' && <Painel ov={ov} />}
      {tela === 'leads' && <Leads />}
      {tela === 'crefaz' && <Crefaz />}
      {ov && tela === 'conectores' && <Conectores ov={ov} recarregar={carregarOverview} />}
      {tela === 'campanhas' && <Campanhas />}
      {tela === 'email' && <Email />}
      {tela === 'fila' && <Fila />}
    </div>
  )
}

// ═══════════════ PAINEL (home) ═══════════════
function Painel({ ov }) {
  const hoje = new Date().toLocaleDateString('en-CA')
  const ontem = new Date(Date.now() - 86400000).toLocaleDateString('en-CA')
  const custosHoje = (ov.custos14 || []).filter(c => String(c.dia).slice(0, 10) === hoje)
  const custoTotalHoje = custosHoje.reduce((a, c) => a + Number(c.custo_reais || 0), 0)
  const enviosHoje = custosHoje.reduce((a, c) => a + Number(c.envios || 0), 0)
  const pushHoje = (ov.push14 || []).find(p => String(p.dia).slice(0, 10) === hoje) || {}
  const fHoje = (ov.funil || []).find(f => String(f.dia).slice(0, 10) === hoje) || {}
  const fOntem = (ov.funil || []).find(f => String(f.dia).slice(0, 10) === ontem) || {}
  const filaHoje = ov.fila_hoje || []

  // série 14 dias: custo/dia empilhado por canal
  const dias = {}
  ;(ov.custos14 || []).forEach(c => {
    const d = String(c.dia).slice(0, 10)
    if (!dias[d]) dias[d] = {}
    dias[d][c.canal] = { custo: Number(c.custo_reais || 0), envios: Number(c.envios || 0) }
  })
  const serie = Object.entries(dias).sort((a, b) => a[0] < b[0] ? -1 : 1).slice(-14)
  const maxDia = Math.max(0.01, ...serie.map(([, v]) => Object.values(v).reduce((a, x) => a + x.custo, 0)))

  const linhaFunil = (lbl, a, b) => {
    const va = Number(a || 0), vb = Number(b || 0)
    const delta = va - vb
    return (
      <div key={lbl} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 10, alignItems: 'center', fontSize: 12, padding: '5px 0', borderBottom: '0.5px solid rgba(15,23,42,0.04)' }}>
        <span style={{ color: '#334155' }}>{lbl}</span>
        <span style={{ color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>ontem {vb}</span>
        <b style={{ color: '#0f172a', fontVariantNumeric: 'tabular-nums', minWidth: 34, textAlign: 'right' }}>{va}</b>
        <span style={{ fontSize: 11, minWidth: 40, textAlign: 'right', color: delta > 0 ? OK : delta < 0 ? ERRO : '#64748b' }}>
          {delta === 0 ? '=' : (delta > 0 ? '▲ ' : '▼ ') + Math.abs(delta)}
        </span>
      </div>
    )
  }

  return (
    <div>
      <div style={{ ...s.grid(170), marginBottom: 14 }}>
        <Kpi label="Avisos pagos hoje" valor={enviosHoje}
          sub={custosHoje.length === 0 ? 'nenhum envio pago hoje' :
            custosHoje.map(c => `${ICONE_CANAL[c.canal] || ''} ${c.canal}: ${c.envios}`).join(' · ')} />
        <Kpi label="Custo pago hoje" valor={reais(custoTotalHoje)} cor={custoTotalHoje > 0 ? ALERTA : '#0f172a'} />
        <Kpi label="Pushes entregues hoje" valor={pushHoje.entregues || 0} cor={OK}
          sub={`👆 ${pushHoje.clicados || 0} clicados · ${pushHoje.telefones_alcancados || 0} pessoas · grátis`} />
        <Kpi label="Fila hoje" valor={filaHoje.length}
          sub={['pendente', 'enviado', 'falhou', 'cancelado'].map(st => {
            const n = filaHoje.filter(f => f.status === st).length
            return n ? `${st}: ${n}` : null
          }).filter(Boolean).join(' · ') || 'vazia'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        <Secao icone="💸" titulo="Custo por dia" sub="últimos 14 dias · empilhado por canal" estilo={{ marginBottom: 0 }}>
          {serie.length === 0 ? <div style={s.vazio}>Sem envios pagos no período. O push (grátis) continua rodando.</div> : (
            <div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
                {serie.map(([d, v]) => {
                  const tot = Object.values(v).reduce((a, x) => a + x.custo, 0)
                  const detalhe = Object.entries(v).map(([cn, x]) => `${cn}: ${x.envios} envio(s) · ${reais(x.custo)}`).join('\n')
                  return (
                    <div key={d} title={`${d.slice(8)}/${d.slice(5, 7)} — total ${reais(tot)}\n${detalhe}`}
                      style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%', minWidth: 10 }}>
                      {['email', 'sms', 'whatsapp'].map(cn => v[cn] ? (
                        <div key={cn} style={{ height: Math.max(3, (v[cn].custo / maxDia) * 98), background: CORES_CANAL[cn], borderRadius: '2px 2px 0 0', marginTop: 2 }} />
                      ) : null)}
                      <div style={{ fontSize: 9, color: '#64748b', textAlign: 'center', marginTop: 4 }}>{d.slice(8)}</div>
                    </div>
                  )
                })}
              </div>
              <Legenda itens={[[CORES_CANAL.whatsapp, 'whatsapp'], [CORES_CANAL.sms, 'sms'], [CORES_CANAL.email, 'email']]} />
            </div>
          )}
        </Secao>

        <Secao icone="🔻" titulo="Funil do chat" sub="hoje vs ontem" estilo={{ marginBottom: 0 }}>
          {linhaFunil('Chegaram', fHoje.chegaram, fOntem.chegaram)}
          {linhaFunil('Deram telefone', fHoje.deram_telefone, fOntem.deram_telefone)}
          {linhaFunil('Aceitaram push', fHoje.aceitaram_push, fOntem.aceitaram_push)}
          {linhaFunil('Iniciaram conversa', fHoje.iniciaram_conversa, fOntem.iniciaram_conversa)}
          {linhaFunil('Viram oferta', fHoje.viram_oferta, fOntem.viram_oferta)}
          {linhaFunil('Docs completos', fHoje.docs_completos, fOntem.docs_completos)}
        </Secao>
      </div>
    </div>
  )
}

// ═══════════════ LEADS DO SITE ═══════════════
const PRODUTOS = [['', 'Todos'], ['bolsa', '🩷 Bolsa'], ['gravida', '🤰 Grávida'], ['mae', '🤱 Mãe'], ['outro', 'Outro']]
const NOME_GATE = { conversa_criada: 'iniciou conversa', oferta_vista: 'viu oferta', rg_frente: 'RG frente', rg_verso: 'RG verso', extrato: 'extrato', docs_completos: 'docs completos' }
const OPCOES_PERIODO = [['tudo', 'tudo'], ['hoje', 'hoje'], ['ontem', 'ontem'], ['7d', '7 dias'], ['30d', '30 dias'], ['custom', 'personalizado']]

function faixaCadastro(preset, cDe, cAte) {
  const ini = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
  const hoje = ini(new Date())
  const mais1 = (d) => { const x = new Date(d); x.setDate(x.getDate() + 1); return x }
  const menos = (d, n) => { const x = new Date(d); x.setDate(x.getDate() - n); return x }
  let de = null, ate = null
  if (preset === 'hoje') { de = hoje; ate = mais1(hoje) }
  else if (preset === 'ontem') { de = menos(hoje, 1); ate = hoje }
  else if (preset === '7d') { de = menos(hoje, 6); ate = mais1(hoje) }
  else if (preset === '30d') { de = menos(hoje, 29); ate = mais1(hoje) }
  else if (preset === 'custom') {
    if (cDe) de = ini(cDe + 'T00:00:00')
    if (cAte) ate = mais1(ini(cAte + 'T00:00:00'))
  }
  return { de: de ? de.toISOString() : undefined, ate: ate ? ate.toISOString() : undefined }
}

function Leads() {
  const [leads, setLeads] = useState(null)
  const [produto, setProduto] = useState('')
  const [busca, setBusca] = useState('')
  const [periodo, setPeriodo] = useState('tudo')
  const [dtDe, setDtDe] = useState('')
  const [dtAte, setDtAte] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let vivo = true
    setLeads(null)
    const fx = faixaCadastro(periodo, dtDe, dtAte)
    chamar('leads_list', { produto: produto || undefined, de: fx.de, ate: fx.ate })
      .then(r => { if (vivo) setLeads(r.leads) })
      .catch(e => { if (vivo) setMsg(String(e.message || e)) })
    return () => { vivo = false }
  }, [produto, periodo, dtDe, dtAte])

  const visiveis = (leads || []).filter(l => {
    if (!busca) return true
    const b = busca.toLowerCase()
    return (l.nome || '').toLowerCase().includes(b) || (l.telefone || '').includes(b) || (l.email || '').toLowerCase().includes(b)
  })
  const contagem = {}
  ;(leads || []).forEach(l => { contagem[l.produto] = (contagem[l.produto] || 0) + 1 })

  const exportar = () => {
    const cab = ['nome', 'telefone', 'email', 'produto', 'cadastrado_em', 'ultimo_passo', 'push_aceito']
    const linhas = visiveis.map(l => [
      l.nome || '', l.telefone || '', l.email || '', l.produto || '',
      l.cadastrado_em ? new Date(l.cadastrado_em).toLocaleString('pt-BR') : '',
      NOME_GATE[l.ultimo_evento] || l.ultimo_evento || 'só cadastro',
      l.push_aceito ? 'sim' : 'não',
    ])
    const esc = (v) => '"' + String(v).replace(/"/g, '""') + '"'
    const csv = '﻿' + [cab, ...linhas].map(r => r.map(esc).join(';')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `leads_${produto || 'todos'}_${periodo}_${new Date().toLocaleDateString('en-CA')}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div>
      <Secao icone="🔎" titulo="Filtros" sub="leads que se cadastraram na página (deram telefone)"
        acao={<button style={s.btn(OK, true)} disabled={!visiveis.length} onClick={exportar}>⬇️ Exportar planilha ({visiveis.length})</button>}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          {PRODUTOS.map(([v, lbl]) => (
            <button key={v} onClick={() => setProduto(v)} style={s.chip(produto === v)}>
              {lbl}{v && contagem[v] != null ? ` · ${contagem[v]}` : ''}{!v && leads ? ` · ${leads.length}` : ''}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <input style={{ ...s.input, width: 220 }} placeholder="nome, telefone ou email" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#5b6b84', marginRight: 2 }}>Cadastro em:</span>
          {OPCOES_PERIODO.map(([v, lbl]) => (
            <button key={v} onClick={() => setPeriodo(v)} style={s.chip(periodo === v, '#2563eb')}>{lbl}</button>
          ))}
          {periodo === 'custom' && (<>
            <input type="date" value={dtDe} onChange={e => setDtDe(e.target.value)} style={{ ...s.input, width: 145, colorScheme: 'light' }} />
            <span style={{ fontSize: 12, color: '#5b6b84' }}>até</span>
            <input type="date" value={dtAte} onChange={e => setDtAte(e.target.value)} style={{ ...s.input, width: 145, colorScheme: 'light' }} />
          </>)}
        </div>
        <div style={s.nota}>E-mail só aparece para quem a página coletar — hoje o funil ainda não pede e-mail.</div>
      </Secao>

      {msg && <div style={{ ...s.erroBox, marginBottom: 12 }}>{msg}</div>}

      <Secao icone="👥" titulo="Leads" sub={leads ? `${visiveis.length} no filtro atual · tabela mostra até 500 · a planilha exporta todos` : 'carregando…'}>
        <table style={s.tabela}>
          <thead><tr>
            <th style={s.th}>Nome</th><th style={s.th}>Telefone</th><th style={s.th}>Email</th>
            <th style={s.th}>Produto</th><th style={s.th}>Cadastro</th><th style={s.th}>Último passo</th><th style={s.th}>Push</th>
          </tr></thead>
          <tbody>
            {!leads && <tr><td style={s.td} colSpan={7}><div style={s.vazio}>Carregando...</div></td></tr>}
            {leads && visiveis.length === 0 && <tr><td style={s.td} colSpan={7}><div style={s.vazio}>Nenhum lead nesse filtro.</div></td></tr>}
            {visiveis.slice(0, 500).map(l => (
              <tr key={l.telefone}>
                <td style={s.td}>{l.nome || <span style={{ color: '#64748b' }}>—</span>}</td>
                <td style={s.td}>{l.telefone}</td>
                <td style={s.td}>{l.email || <span style={{ color: '#64748b' }}>—</span>}</td>
                <td style={s.td}><span style={s.badge(ROSA, 'rgba(244,114,182,.12)')}>{l.produto}</span></td>
                <td style={s.td}>{fmtBR(l.cadastrado_em)}</td>
                <td style={{ ...s.td, color: '#5b6b84', fontSize: 12 }}>{NOME_GATE[l.ultimo_evento] || l.ultimo_evento || 'só cadastro'}</td>
                <td style={s.td}>{l.push_aceito ? '🔔' : <span style={{ color: '#64748b' }}>—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Secao>
    </div>
  )
}

// ═══════════════ CONECTORES ═══════════════
function Conectores({ ov, recarregar }) {
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState({})
  const [custom, setCustom] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [teste, setTeste] = useState(null)
  const [msg, setMsg] = useState('')

  const abrirEdicao = (c) => { setEditando(c); setForm({ ...c.form }); setCustom(false); setMsg('') }
  const campo = (k) => ({ value: form[k] ?? '', onChange: (e) => setForm(f => ({ ...f, [k]: e.target.value })) })

  const toggle = async (c) => {
    if (!c.configurado && !c.ativo) { setMsg(`"${c.nome}" ainda não tem credenciais — clique em Conectar primeiro.`); return }
    try { await chamar('conector_toggle', { id: c.id, ativo: !c.ativo }); recarregar() } catch (e) { setMsg(String(e.message || e)) }
  }
  const salvar = async () => {
    setSalvando(true); setMsg('')
    try {
      await chamar('conector_salvar', { id: editando.id, form, prioridade: editando.prioridade, custo_centavos: editando.custo_centavos })
      setEditando(null); recarregar()
    } catch (e) { setMsg(String(e.message || e)) }
    setSalvando(false)
  }
  const rodarTeste = async () => {
    setTeste(t => ({ ...t, rodando: true, resultado: null }))
    try {
      const r = await chamar('teste_envio', { conector_id: teste.conector.id, telefone: teste.telefone, email: teste.email || undefined })
      setTeste(t => ({ ...t, rodando: false, resultado: r }))
    } catch (e) { setTeste(t => ({ ...t, rodando: false, resultado: { error: String(e.message || e) } })) }
  }

  return (
    <div>
      <div style={{ ...s.aviso, marginBottom: 14 }}>📏 {REGRA_NEGOCIO}</div>
      {msg && <div style={{ ...s.erroBox, marginBottom: 10 }}>{msg}</div>}

      <div style={s.grid(290)}>
        {(ov.conectores || []).map(c => (
          <div key={c.id} style={{ ...s.secao, marginBottom: 0, borderLeft: `3px solid ${c.ativo ? OK : 'rgba(15,23,42,0.12)'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{ICONE_CANAL[c.tipo] || '🔌'} {c.nome}</div>
              <button onClick={() => toggle(c)} title={c.ativo ? 'Desativar' : 'Ativar'}
                style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: c.ativo ? OK : '#cbd5e1', position: 'relative', flexShrink: 0 }}>
                <span style={{ position: 'absolute', top: 3, left: c.ativo ? 23 : 3, width: 18, height: 18, borderRadius: 9, background: '#fff', transition: 'left .15s' }} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={s.badge(CORES_CANAL[c.tipo] ? '#0f172a' : '#5b6b84', `${CORES_CANAL[c.tipo] || '#e2e8f0'}55`)}>{c.tipo}</span>
              {c.configurado
                ? <span style={s.badge(OK, 'rgba(52,211,153,.14)')}>✓ credenciais salvas</span>
                : <span style={s.badge(ALERTA, 'rgba(251,191,36,.12)')}>⚠ falta conectar</span>}
              <span style={s.badge(c.ativo ? OK : '#5b6b84', c.ativo ? 'rgba(52,211,153,.14)' : '#e2e8f0')}>{c.ativo ? 'ON' : 'OFF'}</span>
            </div>
            <div style={{ fontSize: 11, color: '#5b6b84', marginBottom: 10 }}>
              prioridade {c.prioridade} · {c.custo_centavos > 0 ? `${reais(c.custo_centavos / 100)}/envio` : 'grátis'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={s.btn('#2563eb')} onClick={() => abrirEdicao(c)}>{c.configurado ? '✏️ Editar' : '🔗 Conectar'}</button>
              <button style={s.btn(ROSA)} onClick={() => setTeste({ conector: c, telefone: '', email: '', resultado: null, rodando: false })}>🧪 Testar envio</button>
            </div>
          </div>
        ))}
      </div>

      {editando && (
        <Modal titulo={`${ICONE_CANAL[editando.tipo] || '🔌'} ${editando.nome} — conexão`} fechar={() => setEditando(null)}>
          {!custom && editando.tipo === 'whatsapp' && (<>
            <label style={s.label}>Phone Number ID (Meta Cloud API)</label>
            <input style={s.input} placeholder="ex: 123456789012345" {...campo('phone_number_id')} />
            <label style={s.label}>Token permanente da BM</label>
            <input style={s.input} placeholder={form.token || 'EAAG...'} {...campo('token')} />
            <label style={s.label}>Nome do template (utility aprovado na WABA)</label>
            <input style={s.input} {...campo('template')} placeholder="mensagem_nao_lida" />
          </>)}
          {!custom && editando.tipo === 'sms' && (<>
            <label style={s.label}>Account SID (Twilio)</label>
            <input style={s.input} placeholder="AC..." {...campo('account_sid')} />
            <label style={s.label}>Auth Token</label>
            <input style={s.input} placeholder={form.auth_token || 'token'} {...campo('auth_token')} />
            <label style={s.label}>Sender (número ou Messaging Service)</label>
            <input style={s.input} placeholder="+55..." {...campo('sender')} />
          </>)}
          {!custom && editando.tipo === 'email' && (<>
            <label style={s.label}>API Key (Resend)</label>
            <input style={s.input} placeholder={form.api_key || 're_...'} {...campo('api_key')} />
            <label style={s.label}>Remetente</label>
            <input style={s.input} placeholder="Mais Mae <oi@maismaeauxilio.com.br>" {...campo('remetente')} />
          </>)}
          {custom && (<>
            <label style={s.label}>URL do endpoint</label>
            <input style={s.input} {...campo('url')} />
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={s.label}>Método</label>
                <select style={s.input} {...campo('method')}><option>POST</option><option>PUT</option></select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={s.label}>Content-Type</label>
                <select style={s.input} {...campo('content_type')}><option value="json">json</option><option value="form">form</option></select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={s.label}>Auth</label>
                <select style={s.input} {...campo('auth_type')}><option value="bearer">bearer</option><option value="basic">basic</option></select>
              </div>
            </div>
            {(form.auth_type || 'bearer') === 'bearer' ? (<>
              <label style={s.label}>Token (bearer)</label>
              <input style={s.input} placeholder={form.auth_token || 'token'} {...campo('auth_token')} />
            </>) : (<>
              <label style={s.label}>Usuário (basic)</label>
              <input style={s.input} {...campo('auth_user')} />
              <label style={s.label}>Senha (basic)</label>
              <input style={s.input} placeholder={form.auth_pass || 'senha'} {...campo('auth_pass')} />
            </>)}
            <label style={s.label}>Body template (JSON)</label>
            <textarea style={{ ...s.input, minHeight: 130, fontFamily: 'monospace', fontSize: 12 }} {...campo('body_template')} />
            <div style={{ fontSize: 11, color: '#5b6b84', marginTop: 6, lineHeight: 1.6 }}>
              Placeholders disponíveis (substituídos no envio):<br />
              <code style={{ color: ROSA }}>{'${telefone_e164}'}</code> +5511999991234 · <code style={{ color: ROSA }}>{'${telefone11}'}</code> 11999991234 · <code style={{ color: ROSA }}>{'${nome}'}</code> primeiro nome · <code style={{ color: ROSA }}>{'${email}'}</code> · <code style={{ color: ROSA }}>{'${link}'}</code> link completo do chat · <code style={{ color: ROSA }}>{'${link_sufixo}'}</code> só o ?tel=...
            </div>
          </>)}
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 10 }}>Segredos salvos aparecem mascarados (****ab12). Deixe mascarado para manter o valor atual; digite um novo para substituir.</div>
          {msg && <div style={{ fontSize: 12, color: ERRO, marginTop: 8 }}>{msg}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <button style={s.btn('#5b6b84')} onClick={() => setCustom(v => !v)}>{custom ? '← Formulário simples' : '⚙️ Provedor customizado (avançado)'}</button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={s.btn('#5b6b84')} onClick={() => setEditando(null)}>Cancelar</button>
              <button style={s.btn(OK, true)} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : '💾 Salvar'}</button>
            </div>
          </div>
        </Modal>
      )}

      {teste && (
        <Modal titulo={`🧪 Testar ${teste.conector.nome}`} fechar={() => setTeste(null)}>
          <div style={{ fontSize: 12, color: '#5b6b84', lineHeight: 1.6 }}>
            Insere um item real na fila com o SEU telefone, canal fixo <b style={{ color: '#0f172a' }}>{teste.conector.tipo}</b>, e chama o despacho de verdade (mesmo caminho do robô). O limitador vale para o teste também — 2º teste no mesmo dia pode sair como “cancelado: limitador”.
          </div>
          <label style={s.label}>Telefone do operador (DDD + número)</label>
          <input style={s.input} placeholder="11999991234" value={teste.telefone} onChange={e => setTeste(t => ({ ...t, telefone: e.target.value }))} />
          {teste.conector.tipo === 'email' && (<>
            <label style={s.label}>Email de teste</label>
            <input style={s.input} placeholder="voce@exemplo.com" value={teste.email} onChange={e => setTeste(t => ({ ...t, email: e.target.value }))} />
          </>)}
          <div style={{ marginTop: 12 }}>
            <button style={s.btn(ROSA, true)} disabled={teste.rodando} onClick={rodarTeste}>{teste.rodando ? 'Disparando…' : '🚀 Disparar teste'}</button>
          </div>
          {teste.resultado && (
            <pre style={{ marginTop: 12, background: '#e2e8f0', border: '0.5px solid rgba(15,23,42,0.1)', borderRadius: 8, padding: 10, fontSize: 11, color: teste.resultado.error ? ERRO : '#334155', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 220, overflow: 'auto' }}>
              {JSON.stringify(teste.resultado, null, 2)}
            </pre>
          )}
        </Modal>
      )}
    </div>
  )
}

// ═══════════════ CAMPANHAS ═══════════════
function Campanhas() {
  const [dados, setDados] = useState(null)
  const [nova, setNova] = useState(null)
  const [alvo, setAlvo] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState('')

  const carregar = useCallback(async () => {
    try { setDados(await chamar('campanhas_list')) } catch (e) { setMsg(String(e.message || e)) }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const segKey = nova ? JSON.stringify([nova.gates, nova.funil, nova.min_h, nova.max_h]) : ''
  useEffect(() => {
    if (!segKey) return
    setAlvo(null)
    const seg = JSON.parse(segKey)
    const t = setTimeout(async () => {
      try {
        const r = await chamar('campanha_alvo', { gates: seg[0], funil: seg[1] === 'todos' ? null : seg[1], min_h: seg[2], max_h: seg[3] })
        setAlvo(r.alvo)
      } catch { setAlvo('?') }
    }, 500)
    return () => clearTimeout(t)
  }, [segKey])

  const abrirNova = () => setNova({ nome: '', titulo: 'Você tem 1 mensagem não lida 💌', corpo: '{nome}, sua conversa ficou parada e seu atendimento está esperando. Toque para continuar!', gates: ['conversa_criada', 'oferta_vista'], funil: 'todos', min_h: 24, max_h: 168 })
  const mudaGate = (g) => setNova(n => ({ ...n, gates: n.gates.includes(g) ? n.gates.filter(x => x !== g) : [...n.gates, g] }))

  const salvarRascunho = async () => {
    if (!nova.nome) { setMsg('Dê um nome à campanha.'); return }
    setOcupado(true); setMsg('')
    try { await chamar('campanha_salvar', { ...nova, funil: nova.funil === 'todos' ? null : nova.funil }); setNova(null); carregar() }
    catch (e) { setMsg(String(e.message || e)) }
    setOcupado(false)
  }
  const disparar = async (id, nome, alvoTxt) => {
    if (!window.confirm(`🚀 Disparar a campanha "${nome}" agora?${alvoTxt ? `\nAlvo estimado: ${alvoTxt} pessoas.` : ''}\n\nIsso envia push real para todo o segmento. Tem certeza?`)) return
    setOcupado(true); setMsg('')
    try {
      let cid = id
      if (!cid) {
        const r = await chamar('campanha_salvar', { ...nova, funil: nova.funil === 'todos' ? null : nova.funil }); cid = r.id
      }
      const r2 = await chamar('campanha_disparar', { id: cid })
      setMsg(`✅ Disparada: ${JSON.stringify(r2.resultado)}`)
      setNova(null); carregar()
    } catch (e) { setMsg(String(e.message || e)) }
    setOcupado(false)
  }

  const primeiroNome = 'Maria'
  return (
    <div>
      {msg && <div style={{ ...s.aviso, marginBottom: 10 }}>{msg}</div>}

      {!nova && (
        <Secao icone="📢" titulo="Campanhas de push" sub="reengajar quem parou no funil do chat — grátis"
          acao={<button style={s.btn(ROSA, true)} onClick={abrirNova}>+ Nova campanha</button>} estilo={{ paddingBottom: 6 }}>
          <div />
        </Secao>
      )}

      {nova && (
        <Secao icone="✨" titulo="Nova campanha" acao={<button style={s.btn('#5b6b84')} onClick={() => setNova(null)}>Cancelar</button>} estilo={{ border: `1px solid ${ROSA}44` }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            <div>
              <label style={s.label}>Nome (interno)</label>
              <input style={s.input} value={nova.nome} onChange={e => setNova(n => ({ ...n, nome: e.target.value }))} placeholder="ex: resgate docs parados 24-72h" />
              <label style={s.label}>Título do push</label>
              <input style={s.input} value={nova.titulo} onChange={e => setNova(n => ({ ...n, titulo: e.target.value }))} />
              <label style={s.label}>Corpo ({'{nome}'} vira o primeiro nome)</label>
              <textarea style={{ ...s.input, minHeight: 60 }} value={nova.corpo} onChange={e => setNova(n => ({ ...n, corpo: e.target.value }))} />
              <label style={s.label}>Onde pararam (gates)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {GATES.map(([g, lbl]) => (
                  <label key={g} style={{ ...s.chip(nova.gates.includes(g)), display: 'inline-block' }}>
                    <input type="checkbox" style={{ display: 'none' }} checked={nova.gates.includes(g)} onChange={() => mudaGate(g)} />{lbl}
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={s.label}>Funil</label>
                  <select style={s.input} value={nova.funil} onChange={e => setNova(n => ({ ...n, funil: e.target.value }))}>
                    <option value="todos">todos</option><option value="bolsa">bolsa</option><option value="gravida">gravida</option><option value="mae">mae</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={s.label}>Parado de (horas)</label>
                  <input type="number" style={s.input} value={nova.min_h} onChange={e => setNova(n => ({ ...n, min_h: e.target.value }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={s.label}>até (horas)</label>
                  <input type="number" style={s.input} value={nova.max_h} onChange={e => setNova(n => ({ ...n, max_h: e.target.value }))} />
                </div>
              </div>
            </div>
            <div>
              <label style={s.label}>Preview do push</label>
              <div style={{ background: '#e2e8f0', border: '0.5px solid rgba(15,23,42,0.12)', borderRadius: 12, padding: 12 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: ROSA, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>💌</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{(nova.titulo || '').replace('{nome}', primeiroNome)}</div>
                    <div style={{ fontSize: 12, color: '#334155' }}>{(nova.corpo || '').replace('{nome}', primeiroNome)}</div>
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>chat.maismaeauxilio.com.br · agora</div>
                  </div>
                </div>
              </div>
              <div style={{ ...s.kpi, marginTop: 14, textAlign: 'center' }}>
                <div style={s.kpiLbl}>🎯 Alvo estimado</div>
                <div style={{ ...s.kpiNum, fontSize: 30, color: alvo === null ? '#64748b' : ROSA }}>{alvo === null ? '…' : alvo}</div>
                <div style={s.kpiSub}>pessoas com push aceito nesse segmento agora</div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
                <button style={s.btn('#2563eb')} disabled={ocupado} onClick={salvarRascunho}>💾 Salvar rascunho</button>
                <button style={s.btn(ROSA, true)} disabled={ocupado} onClick={() => disparar(null, nova.nome || 'sem nome', alvo)}>🚀 Disparar agora</button>
              </div>
            </div>
          </div>
        </Secao>
      )}

      {dados?.rascunhos?.length > 0 && (
        <Secao icone="📝" titulo="Rascunhos">
          {dados.rascunhos.map(r => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 13, padding: '7px 0', borderBottom: '0.5px solid rgba(15,23,42,0.05)' }}>
              <span style={{ color: '#0f172a' }}>{r.nome} <span style={{ color: '#64748b', fontSize: 11 }}>· {(r.gates || []).join(', ')} · {r.funil || 'todos'} · {r.parado_min_horas}-{r.parado_max_horas}h</span></span>
              <button style={s.btn(ROSA)} disabled={ocupado} onClick={() => disparar(r.id, r.nome, null)}>🚀 Disparar</button>
            </div>
          ))}
        </Secao>
      )}

      <Secao icone="📈" titulo="Campanhas disparadas" sub="resultado em até 48h após o disparo">
        <table style={s.tabela}>
          <thead><tr>
            <th style={s.th}>Campanha</th><th style={s.th}>Disparada</th><th style={s.th}>Enviados</th>
            <th style={s.th}>Entregues</th><th style={s.th}>Clicados</th><th style={s.th}>Voltaram e avançaram</th>
          </tr></thead>
          <tbody>
            {!dados && <tr><td style={s.td} colSpan={6}><div style={s.vazio}>Carregando...</div></td></tr>}
            {dados && (dados.relatorio || []).length === 0 && <tr><td style={s.td} colSpan={6}><div style={s.vazio}>Nenhuma campanha disparada ainda.</div></td></tr>}
            {(dados?.relatorio || []).map(c => (
              <tr key={c.id}>
                <td style={s.td}>{c.nome}</td>
                <td style={s.td}>{fmtBR(c.disparada_em)}</td>
                <td style={s.td}>{c.enviados ?? '—'}</td>
                <td style={s.td}>{c.entregues}</td>
                <td style={s.td}>{c.clicados}</td>
                <td style={{ ...s.td, color: c.voltaram_e_avancaram > 0 ? OK : '#5b6b84', fontWeight: 600 }}>{c.voltaram_e_avancaram}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Secao>
    </div>
  )
}

// ═══════════════ E-MAIL (máquina de nutrição) ═══════════════
const NOME_STATUS_FLUXO = { ativo: ['ativo', OK, 'rgba(52,211,153,.14)'], concluiu_etapa_chave: ['✅ converteu', OK, 'rgba(52,211,153,.14)'], optout: ['🚫 descadastrou', ERRO, 'rgba(248,113,113,.14)'], fim_do_prazo: ['⏳ fim de prazo', '#5b6b84', '#e2e8f0'] }

function Email() {
  const [dados, setDados] = useState(null)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    let vivo = true
    chamar('email_painel').then(r => { if (vivo) setDados(r) }).catch(e => { if (vivo) setMsg(String(e.message || e)) })
    return () => { vivo = false }
  }, [])

  if (msg) return <div style={s.erroBox}>{msg}</div>
  if (!dados) return <div style={{ color: '#5b6b84', fontSize: 13 }}>Carregando...</div>

  const hoje = new Date().toLocaleDateString('en-CA')
  const saude = dados.saude14 || []
  const d0 = saude.find(x => String(x.dia).slice(0, 10) === hoje) || { enviados: 0, entregues: 0, abertos: 0, clicados: 0, falhados: 0, taxa_entrega_pct: null, taxa_abertura_pct: null }
  const corEntrega = d0.taxa_entrega_pct == null ? NEUTRO : d0.taxa_entrega_pct < 80 ? ERRO : d0.taxa_entrega_pct < 90 ? ALERTA : OK
  const fx = dados.fluxo || { no_fluxo: {}, tabela: [] }
  const noFluxoTotal = Object.values(fx.no_fluxo || {}).reduce((a, x) => a + x, 0)
  const falhas = dados.falhas || []
  const temSpam = falhas.some(f => f.tipo === 'complained')

  // gráfico de linhas 14 dias
  const serie = [...saude].sort((a, b) => String(a.dia) < String(b.dia) ? -1 : 1).slice(-14)
  const W = 640, H = 150, PADX = 34, PADT = 10, PADB = 20
  const maxV = Math.max(1, ...serie.map(x => Number(x.enviados || 0)))
  const px = (i) => serie.length < 2 ? W / 2 : PADX + i * ((W - PADX - 8) / (serie.length - 1))
  const py = (v) => PADT + (1 - Number(v || 0) / maxV) * (H - PADT - PADB)
  const linha = (campo) => serie.map((x, i) => `${px(i)},${py(x[campo])}`).join(' ')
  const gridVals = [0, Math.round(maxV / 2), maxV]

  return (
    <div>
      <div style={{ ...s.grid(140), marginBottom: 14 }}>
        <Kpi label="Enviados hoje" valor={d0.enviados} />
        <Kpi label="Entregues" valor={d0.entregues} />
        <Kpi label="Abertos" valor={d0.abertos} />
        <Kpi label="Clicados" valor={d0.clicados} />
        <Kpi label="Falhados" valor={d0.falhados} cor={d0.falhados > 0 ? ERRO : '#0f172a'} borda={d0.falhados > 0 ? ERRO : null} />
        <Kpi label="Taxa de entrega" valor={d0.taxa_entrega_pct == null ? '—' : `${d0.taxa_entrega_pct}%`} cor={corEntrega} borda={corEntrega} />
        <Kpi label="Taxa de abertura" valor={d0.taxa_abertura_pct == null ? '—' : `${d0.taxa_abertura_pct}%`} />
      </div>

      <Secao icone="📈" titulo="Últimos 14 dias" sub="passe o mouse no gráfico pra ver as taxas do dia">
        {serie.length === 0 ? <div style={s.vazio}>Sem envios ainda.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 780, display: 'block' }}>
              {gridVals.map(v => (
                <g key={v}>
                  <line x1={PADX} x2={W - 8} y1={py(v)} y2={py(v)} stroke="rgba(15,23,42,0.06)" strokeWidth="1" />
                  <text x={PADX - 6} y={py(v) + 3} textAnchor="end" fontSize="8.5" fill="#64748b">{v}</text>
                </g>
              ))}
              {['enviados', 'entregues', 'abertos', 'clicados'].map(campo => (
                <polyline key={campo} points={linha(campo)} fill="none" stroke={CORES_EMAIL[campo]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              ))}
              {serie.map((x, i) => (
                <g key={String(x.dia)}>
                  <rect x={px(i) - 11} y={0} width={22} height={H - PADB} fill="transparent">
                    <title>{`${String(x.dia).slice(8, 10)}/${String(x.dia).slice(5, 7)} · enviados ${x.enviados} · entregues ${x.entregues} (${x.taxa_entrega_pct ?? '—'}%) · abertos ${x.abertos} (${x.taxa_abertura_pct ?? '—'}%) · clicados ${x.clicados} · falhados ${x.falhados}`}</title>
                  </rect>
                  <text x={px(i)} y={H - 7} textAnchor="middle" fontSize="8" fill="#64748b">{String(x.dia).slice(8, 10)}</text>
                </g>
              ))}
            </svg>
          </div>
        )}
        <Legenda itens={[[CORES_EMAIL.enviados, 'enviados'], [CORES_EMAIL.entregues, 'entregues'], [CORES_EMAIL.abertos, 'abertos'], [CORES_EMAIL.clicados, 'clicados']]} />
      </Secao>

      <Secao icone="🌊" titulo="Fluxo de nutrição" sub="a máquina de e-mail de até 5 meses por lead">
        <div style={{ ...s.grid(170), marginBottom: 12 }}>
          <Kpi label="No fluxo agora" valor={noFluxoTotal}
            sub={Object.entries(fx.no_fluxo || {}).map(([f, n]) => `${f}: ${n}`).join(' · ') || 'ninguém ainda'} />
          <Kpi label="✅ Saíram — converteram" valor={fx.convertidos || 0} cor={OK} borda={OK}
            sub="completaram a etapa-chave — o número de sucesso da máquina" />
          <Kpi label="🚫 Descadastros" valor={fx.optout || 0} cor={(fx.optout || 0) > 0 ? ERRO : '#0f172a'} />
          <Kpi label="⏳ Fim de prazo" valor={fx.fim_prazo || 0} cor="#5b6b84" />
        </div>
        <div style={{ ...s.aviso, marginBottom: 12 }}>🤰 Grávida: fluxo máximo de 60 dias. Demais: 150 dias. Saída automática quando o lead completa a etapa-chave (mãe: CNIS · grávida/bolsa: documentação completa).</div>
        {(fx.tabela || []).length > 0 && (
          <div>
            <table style={s.tabela}>
              <thead><tr>
                <th style={s.th}>Telefone</th><th style={s.th}>Funil</th><th style={s.th}>Dia do fluxo</th><th style={s.th}>Status</th><th style={s.th}>Inscrito</th>
              </tr></thead>
              <tbody>
                {fx.tabela.map((r, i) => {
                  const [lbl, cor, bg] = NOME_STATUS_FLUXO[r.status] || [r.status, '#5b6b84', '#e2e8f0']
                  return (
                    <tr key={i}>
                      <td style={s.td}>{r.telefone}</td>
                      <td style={s.td}><span style={s.badge(ROSA, 'rgba(244,114,182,.12)')}>{r.funil || '—'}</span></td>
                      <td style={s.td}>dia {r.dia_fluxo}</td>
                      <td style={s.td}><span style={s.badge(cor, bg)}>{lbl}</span></td>
                      <td style={s.td}>{fmtBR(r.inscrito_em)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div style={s.nota}>Últimos 200 inscritos no fluxo.</div>
          </div>
        )}
      </Secao>

      <Secao icone="🩺" titulo="Falhas recentes" sub="bounce / spam — diagnóstico de reputação"
        acao={temSpam ? <span style={s.badge(ERRO, 'rgba(248,113,113,.14)')}>⚠ ALERTA: alguém marcou SPAM</span> : null}>
        {falhas.length === 0 ? <div style={s.vazio}>Nenhuma falha registrada. 👌</div> : (
          <table style={s.tabela}>
            <thead><tr><th style={s.th}>Destinatário</th><th style={s.th}>Tipo</th><th style={s.th}>Quando</th></tr></thead>
            <tbody>
              {falhas.map((f, i) => (
                <tr key={i} style={f.tipo === 'complained' ? { background: 'rgba(248,113,113,.1)' } : undefined}>
                  <td style={s.td}>{f.destinatario}</td>
                  <td style={{ ...s.td, color: f.tipo === 'complained' ? ERRO : ALERTA, fontWeight: 600 }}>{f.tipo === 'complained' ? '🚨 marcou spam' : '↩ devolvido (bounce)'}</td>
                  <td style={s.td}>{fmtBR(f.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Secao>
    </div>
  )
}

// ═══════════════ FILA / LOG ═══════════════
function Fila() {
  const [linhas, setLinhas] = useState(null)
  const [fStatus, setFStatus] = useState('')
  const [fCanal, setFCanal] = useState('')
  const [fDia, setFDia] = useState('')
  const [msg, setMsg] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const carregar = useCallback(async () => {
    try { const r = await chamar('fila_list', { status: fStatus || undefined, canal: fCanal || undefined, dia: fDia || undefined }); setLinhas(r.linhas) }
    catch (e) { setMsg(String(e.message || e)) }
  }, [fStatus, fCanal, fDia])
  useEffect(() => { carregar() }, [carregar])

  const reprocessar = async () => {
    if (!window.confirm('Reprocessar TODOS os itens falhados (voltam para pendente e o robô tenta de novo)?')) return
    setOcupado(true)
    try { const r = await chamar('fila_reprocessar'); setMsg(`↩️ ${r.reprocessados} item(ns) voltaram para a fila.`); carregar() }
    catch (e) { setMsg(String(e.message || e)) }
    setOcupado(false)
  }

  const corStatus = { enviado: [OK, 'rgba(52,211,153,.14)'], pendente: ['#2563eb', 'rgba(96,165,250,.14)'], falhou: [ERRO, 'rgba(248,113,113,.14)'], cancelado: ['#5b6b84', '#e2e8f0'] }
  return (
    <div>
      <Secao icone="📜" titulo="Fila de avisos" sub="últimos 200 itens do filtro · telefones mascarados por privacidade"
        acao={<button style={s.btn(ALERTA)} disabled={ocupado} onClick={reprocessar}>↩️ Reprocessar falhados</button>}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <select style={{ ...s.input, width: 150 }} value={fStatus} onChange={e => setFStatus(e.target.value)}>
            <option value="">status: todos</option><option>pendente</option><option>enviado</option><option>falhou</option><option>cancelado</option>
          </select>
          <select style={{ ...s.input, width: 150 }} value={fCanal} onChange={e => setFCanal(e.target.value)}>
            <option value="">canal: todos</option><option>whatsapp</option><option>sms</option><option>email</option><option>auto</option>
          </select>
          <input type="date" style={{ ...s.input, width: 160, colorScheme: 'light' }} value={fDia} onChange={e => setFDia(e.target.value)} />
        </div>
        {msg && <div style={{ ...s.aviso, marginBottom: 10 }}>{msg}</div>}
        <table style={s.tabela}>
          <thead><tr>
            <th style={s.th}>Telefone</th><th style={s.th}>Canal</th><th style={s.th}>Provider</th><th style={s.th}>Status</th>
            <th style={s.th}>Custo</th><th style={s.th}>Criado</th><th style={s.th}>Enviado</th><th style={s.th}>Detalhe</th>
          </tr></thead>
          <tbody>
            {!linhas && <tr><td style={s.td} colSpan={8}><div style={s.vazio}>Carregando...</div></td></tr>}
            {linhas && linhas.length === 0 && <tr><td style={s.td} colSpan={8}><div style={s.vazio}>Fila vazia nesse filtro.</div></td></tr>}
            {(linhas || []).map(r => {
              const [cor, bg] = corStatus[r.status] || ['#5b6b84', '#e2e8f0']
              const det = r.resultado || {}
              return (
                <tr key={r.id}>
                  <td style={s.td}>{r.telefone}{det.teste ? ' 🧪' : ''}</td>
                  <td style={s.td}>{ICONE_CANAL[r.canal] || ''} {r.canal}</td>
                  <td style={s.td}>{r.provider || '—'}</td>
                  <td style={s.td}><span style={s.badge(cor, bg)}>{r.status}</span></td>
                  <td style={s.td}>{r.custo_centavos > 0 ? reais(r.custo_centavos / 100) : '—'}</td>
                  <td style={s.td}>{fmtBR(r.criado_em)}</td>
                  <td style={s.td}>{fmtBR(r.enviado_em)}</td>
                  <td style={{ ...s.td, fontSize: 11, color: '#5b6b84', maxWidth: 260 }}>
                    {det.http ? `HTTP ${det.http} ` : ''}{det.motivo || det.erro || (det.resp ? String(det.resp).slice(0, 80) : '') || '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Secao>
    </div>
  )
}

// ═══════════════ modal ═══════════════
function Modal({ titulo, fechar, children }) {
  return (
    <div onClick={fechar} style={{ position: 'fixed', inset: 0, background: 'rgba(10,14,20,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.12)', borderRadius: 14, padding: 18, width: 560, maxWidth: '96vw', maxHeight: '88vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{titulo}</div>
          <button onClick={fechar} style={{ background: 'none', border: 'none', color: '#5b6b84', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ═══════════════ CREFAZ — crédito na conta de luz ═══════════════
// 08/09. Tela operacional: o operador consulta o CPF na Crefaz por fora e volta
// aqui pra marcar o resultado.
//
// POR QUE LÊ A TABELA E NÃO A VIEW crefaz_planilha_consulta:
// a view nao devolve o `id` (sem ele nao da pra fazer o UPDATE) e filtra
// status='aguardando_consulta' (o que deixaria os filtros por pre-aprovado,
// negado e enviado sem nada pra mostrar). Entao a lista sai de crefaz_fila com
// elegivel=true, que e o mesmo conjunto da view mais os ja consultados.
// As METRICAS seguem vindo da view crefaz_metricas, que ja soma tudo.
//
// TEMPO REAL: canal do Supabase Realtime na tabela crefaz_fila (habilitada em
// 08/09, com replica identity full pro payload do UPDATE vir completo). O evento
// atualiza a linha no estado sem refazer a consulta; as metricas, que sao
// agregado, essas sim sao relidas a cada evento.
//
// Acesso: policies bruno_le_crefaz_fila / bruno_marca_crefaz_fila (por ID,
// decisao do Bruno em 08/09 — so ele opera por enquanto).
const STATUS_CREFAZ = {
  aguardando_consulta:  { label: 'Aguardando consulta', cor: '#b45309', bg: 'rgba(180,83,9,.10)' },
  pre_aprovado:         { label: 'Pré-aprovado',        cor: '#059669', bg: 'rgba(5,150,105,.10)' },
  negado:               { label: 'Negado',              cor: '#dc2626', bg: 'rgba(220,38,38,.10)' },
  enviado_atendimento:  { label: 'Enviado ao atendimento', cor: '#2563eb', bg: 'rgba(37,99,235,.10)' },
  inelegivel:           { label: 'Inelegível',          cor: '#5b6b84', bg: 'rgba(15,23,42,.06)' },
}
const FILTROS_STATUS = [
  ['todos', 'Todos'],
  ['aguardando_consulta', '⏳ Aguardando'],
  ['pre_aprovado', '✅ Pré-aprovado'],
  ['negado', '❌ Negado'],
  ['enviado_atendimento', '📤 Enviado'],
]
// CEP sugerido por DDD — 09/09.
// O mapa DDD->CEP saiu daqui e foi pro banco: colunas cep_sugerido, cep_cidade
// e cep_aproximado em crefaz_cobertura_ddd. Motivo: e dado de negocio, ficava
// invisivel pra quem abre o Supabase e so mudava com deploy. Agora corrigir um
// CEP e um UPDATE.
//
// A tela le a view crefaz_fila_painel, que e a fila com o CEP do DDD ao lado
// (a planilha_consulta nao serve: nao tem id e so mostra aguardando_consulta).
// A view tem security_invoker = on, entao respeita a mesma RLS da tabela.
//
// cep_aproximado vem GERADO do banco: e true quando o DDD tem mais de uma
// distribuidora (concessionaria com "/"), caso em que o CEP e que decide qual
// atende — e o teto muda junto (CPFL 4.000 x Elektro 2.000).

const soDigitos = (v) => String(v || '').replace(/\D/g, '')
const cpfBonito = (v) => {
  const n = soDigitos(v)
  return n.length === 11 ? n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : (v || '—')
}
const telBonito = (v) => {
  const n = soDigitos(v).replace(/^55/, '')
  if (n.length === 11) return n.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  if (n.length === 10) return n.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  return v || '—'
}
const inteiroBR = (v) => (v === null || v === undefined || v === '') ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR')
const dataBR = (d) => { if (!d) return '—'; try { return new Date(d).toLocaleDateString('pt-BR') } catch { return d } }

function Crefaz() {
  const { profile } = useAuth()
  const [linhas, setLinhas] = useState(null)
  const [metricas, setMetricas] = useState(null)
  const [erro, setErro] = useState('')
  const [aoVivo, setAoVivo] = useState(false)
  const [pulso, setPulso] = useState(null)      // id da linha que acabou de mudar
  const [salvando, setSalvando] = useState(null)
  const [copiado, setCopiado] = useState(null)
  const [valores, setValores] = useState({})    // rascunho do valor por linha

  const [fStatus, setFStatus] = useState('aguardando_consulta')
  const [fConcessionaria, setFConcessionaria] = useState('todas')
  const [fUf, setFUf] = useState('todas')
  const [fValorMin, setFValorMin] = useState('')
  const [busca, setBusca] = useState('')
  const [limite, setLimite] = useState(60)

  // 27 linhas, lidas uma vez: o evento do Realtime vem da TABELA crefaz_fila,
  // que nao tem as colunas de CEP (elas moram na cobertura). Num UPDATE o CEP
  // da linha sobrevive pelo spread, mas num INSERT a linha nasceria sem — e
  // este mapa que preenche. Continua sendo dado do banco, so cruzado aqui.
  // em ref, nao em estado: o canal do Realtime e montado uma vez so, e um estado
  // aqui entraria nas dependencias do efeito e derrubaria o websocket a cada
  // carga. Com ref o callback sempre le o valor atual sem recriar a conexao.
  const coberturaRef = useRef({})
  useEffect(() => {
    supabase.from('crefaz_cobertura_ddd').select('ddd, cep_sugerido, cep_cidade, cep_aproximado')
      .then(({ data }) => {
        if (!data) return
        const m = {}
        data.forEach(c => { m[c.ddd] = c })
        coberturaRef.current = m
      })
  }, [])

  const carregar = useCallback(async () => {
    const [f, m] = await Promise.all([
      supabase.from('crefaz_fila_painel')
        .select('id, nome, cpf, telefone, ddd, uf, concessionaria, valor_max, status, valor_pre_aprovado, consultado_em, consultado_por, enviado_atendimento_em, criado_em, cep_sugerido, cep_cidade, cep_aproximado')
        .eq('elegivel', true).order('criado_em', { ascending: true }),
      supabase.from('crefaz_metricas').select('*').maybeSingle(),
    ])
    if (f.error) { setErro(f.error.message); setLinhas([]); return }
    setErro('')
    setLinhas(f.data || [])
    if (!m.error) setMetricas(m.data)
  }, [])

  const soMetricas = useCallback(async () => {
    const { data, error } = await supabase.from('crefaz_metricas').select('*').maybeSingle()
    if (!error) setMetricas(data)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // tempo real: cada INSERT/UPDATE/DELETE da tabela chega por websocket
  useEffect(() => {
    const canal = supabase.channel('crefaz-fila-ao-vivo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crefaz_fila' }, (ev) => {
        const nova = ev.new, velha = ev.old
        setLinhas(prev => {
          if (!prev) return prev
          if (ev.eventType === 'DELETE') return prev.filter(l => l.id !== velha?.id)
          if (!nova?.elegivel) return prev.filter(l => l.id !== nova?.id)  // saiu da fila
          const achou = prev.some(l => l.id === nova.id)
          if (!achou) {
            // linha nova: o payload nao traz o CEP, entao completa pela cobertura
            const c = coberturaRef.current[nova.ddd] || {}
            const comCep = { ...nova, cep_sugerido: c.cep_sugerido || null, cep_cidade: c.cep_cidade || null, cep_aproximado: !!c.cep_aproximado }
            return [...prev, comCep].sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em))
          }
          // update: o spread preserva o CEP que a linha ja tinha
          return prev.map(l => (l.id === nova.id ? { ...l, ...nova } : l))
        })
        if (nova?.id) { setPulso(nova.id); setTimeout(() => setPulso(p => (p === nova.id ? null : p)), 1800) }
        soMetricas()
      })
      .subscribe(st => setAoVivo(st === 'SUBSCRIBED'))
    return () => { supabase.removeChannel(canal) }
  }, [soMetricas])

  async function marcar(linha, novoStatus) {
    setSalvando(linha.id)
    const patch = { status: novoStatus }
    if (novoStatus === 'pre_aprovado' || novoStatus === 'negado') {
      patch.consultado_em = new Date().toISOString()
      patch.consultado_por = profile?.nome || profile?.id || 'operador'
    }
    if (novoStatus === 'pre_aprovado') {
      const bruto = soDigitos(valores[linha.id])
      if (!bruto) { alert('Informe o valor liberado antes de marcar como pré-aprovado.'); setSalvando(null); return }
      patch.valor_pre_aprovado = parseInt(bruto, 10)
    }
    if (novoStatus === 'enviado_atendimento') patch.enviado_atendimento_em = new Date().toISOString()

    const { data, error } = await supabase.from('crefaz_fila').update(patch).eq('id', linha.id).select()
    setSalvando(null)
    if (error) { setErro(`Não salvou: ${error.message}`); return }
    // sem policy de UPDATE o PostgREST devolve 0 linhas SEM erro — por isso a checagem
    if (!data || data.length === 0) {
      setErro('Nada foi gravado: seu login não tem permissão de escrita nesta fila. Nenhuma alteração foi feita.')
      return
    }
    setErro('')
    setLinhas(prev => prev.map(l => (l.id === linha.id ? { ...l, ...data[0] } : l)))
    setValores(v => { const n = { ...v }; delete n[linha.id]; return n })
  }

  // copia so digitos: CPF e CEP entram na Crefaz sem mascara
  async function copiar(texto, chave, rotulo) {
    const limpo = soDigitos(texto)
    try {
      await navigator.clipboard.writeText(limpo)
      setCopiado(chave); setTimeout(() => setCopiado(c => (c === chave ? null : c)), 1400)
    } catch { alert(`Não consegui copiar. ${rotulo}: ${limpo}`) }
  }

  const concessionarias = useMemo(
    () => Array.from(new Set((linhas || []).map(l => l.concessionaria).filter(Boolean))).sort(),
    [linhas])
  const ufs = useMemo(
    () => Array.from(new Set((linhas || []).map(l => l.uf).filter(Boolean))).sort(),
    [linhas])

  const filtradas = useMemo(() => {
    const min = fValorMin ? Number(soDigitos(fValorMin)) : null
    const b = busca.trim().toLowerCase()
    const bDig = soDigitos(busca)
    return (linhas || []).filter(l => {
      if (fStatus !== 'todos' && l.status !== fStatus) return false
      if (fConcessionaria !== 'todas' && l.concessionaria !== fConcessionaria) return false
      if (fUf !== 'todas' && l.uf !== fUf) return false
      if (min !== null && Number(l.valor_max || 0) < min) return false
      if (b) {
        if (bDig) return soDigitos(l.cpf).includes(bDig) || soDigitos(l.telefone).includes(bDig)
        return (l.nome || '').toLowerCase().includes(b)
      }
      return true
    })
  }, [linhas, fStatus, fConcessionaria, fUf, fValorMin, busca])

  useEffect(() => { setLimite(60) }, [fStatus, fConcessionaria, fUf, fValorMin, busca])
  const visiveis = filtradas.slice(0, limite)
  const contaPorStatus = useMemo(() => {
    const m = {}
    ;(linhas || []).forEach(l => { m[l.status] = (m[l.status] || 0) + 1 })
    return m
  }, [linhas])

  const m = metricas || {}
  return (
    <>
      <Secao icone="💡" titulo="Crédito na conta de luz (Crefaz)"
        sub="Consulta manual na Crefaz — marque aqui o resultado de cada CPF."
        acao={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: aoVivo ? OK : NEUTRO }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: aoVivo ? OK : '#94a3b8', display: 'inline-block' }} />
            {aoVivo ? 'ao vivo' : 'conectando...'}
          </span>
        }>
        <div style={s.grid(150)}>
          <Kpi label="Total perguntados" valor={m.total_perguntados ?? '—'} />
          <Kpi label="Com conta no nome" valor={m.com_conta_no_nome ?? '—'} sub={`${m.sem_conta_no_nome ?? 0} sem conta no nome`} />
          <Kpi label="Elegíveis na fila" valor={m.elegiveis_fila ?? '—'} cor={ROSA} borda={ROSA}
            sub={`${m.conta_mas_ddd_fora ?? 0} têm conta mas o DDD não é coberto`} />
          <Kpi label="% elegível" valor={m.pct_elegivel != null ? `${m.pct_elegivel}%` : '—'} />
          <Kpi label="Pré-aprovados" valor={m.pre_aprovados ?? '—'} cor={OK} borda={OK} />
        </div>
      </Secao>

      {erro && <div style={{ ...s.erroBox, marginBottom: 12 }}>⚠ {erro}</div>}

      <Secao titulo="Fila de consulta" sub={`${filtradas.length} de ${(linhas || []).length} elegíveis`}
        acao={<button onClick={carregar} style={s.btn(NEUTRO)}>↻ Recarregar</button>}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 10 }}>
          {FILTROS_STATUS.map(([k, lbl]) => (
            <button key={k} onClick={() => setFStatus(k)} style={s.chip(fStatus === k)}>
              {lbl}{k !== 'todos' && contaPorStatus[k] ? ` · ${contaPorStatus[k]}` : ''}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 12 }}>
          <div>
            <label style={s.label}>Buscar</label>
            <input style={s.input} placeholder="nome, CPF ou telefone" value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          <div>
            <label style={s.label}>Concessionária</label>
            <select style={s.input} value={fConcessionaria} onChange={e => setFConcessionaria(e.target.value)}>
              <option value="todas">Todas</option>
              {concessionarias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={s.label}>UF</label>
            <select style={s.input} value={fUf} onChange={e => setFUf(e.target.value)}>
              <option value="todas">Todas</option>
              {ufs.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label style={s.label}>Valor máx. a partir de</label>
            <input style={s.input} placeholder="ex.: 1000" inputMode="numeric"
              value={fValorMin} onChange={e => setFValorMin(e.target.value)} />
          </div>
        </div>

        {linhas === null ? (
          <div style={s.vazio}>Carregando...</div>
        ) : filtradas.length === 0 ? (
          <div style={s.vazio}>Nenhum lead com esses filtros.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={s.tabela}>
              <thead>
                <tr>
                  <th style={s.th}>Entrada</th>
                  <th style={s.th}>Cliente</th>
                  <th style={s.th}>CPF</th>
                  <th style={s.th}>Telefone</th>
                  <th style={s.th}>Concessionária</th>
                  <th style={s.th}>Valor máx.</th>
                  <th style={s.th}>Status</th>
                  <th style={s.th}>Marcar resultado</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map(l => {
                  const st = STATUS_CREFAZ[l.status] || { label: l.status, cor: NEUTRO, bg: 'rgba(15,23,42,.06)' }
                  const pendente = l.status === 'aguardando_consulta'
                  const ocupado = salvando === l.id
                  return (
                    <tr key={l.id} style={pulso === l.id ? { background: 'rgba(219,39,119,.07)' } : undefined}>
                      <td style={s.td}>{dataBR(l.criado_em)}</td>
                      <td style={{ ...s.td, fontVariantNumeric: 'normal' }}>{l.nome || '—'}</td>
                      <td style={s.td}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {cpfBonito(l.cpf)}
                          <button onClick={() => copiar(l.cpf, `cpf-${l.id}`, 'CPF')} title="copiar CPF"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: copiado === `cpf-${l.id}` ? OK : '#2563eb', padding: 0 }}>
                            {copiado === `cpf-${l.id}` ? '✓ copiado' : '⧉ copiar'}
                          </button>
                        </span>
                      </td>
                      <td style={s.td}>{telBonito(l.telefone)}<span style={{ color: '#5b6b84' }}> · {l.ddd}/{l.uf}</span></td>
                      <td style={{ ...s.td, fontVariantNumeric: 'normal' }}>
                        {l.concessionaria || '—'}
                        {l.cep_sugerido && (
                          <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 11.5, color: '#5b6b84', fontVariantNumeric: 'tabular-nums' }}>
                              CEP {l.cep_sugerido}
                            </span>
                            <button onClick={() => copiar(l.cep_sugerido, `cep-${l.id}`, 'CEP')} title={`CEP de ${l.cep_cidade || 'referência'} — para a simulação`}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: copiado === `cep-${l.id}` ? OK : '#2563eb', padding: 0 }}>
                              {copiado === `cep-${l.id}` ? '✓ copiado' : '⧉ copiar'}
                            </button>
                            {l.cep_aproximado && (
                              <span title="Neste DDD há mais de uma distribuidora e o CEP é que define qual atende — confira o teto que a simulação devolver."
                                style={{ fontSize: 10.5, color: ALERTA, fontWeight: 600, cursor: 'help' }}>
                                ⚠ aprox.
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={s.td}>{inteiroBR(l.valor_max)}</td>
                      <td style={s.td}>
                        <span style={s.badge(st.cor, st.bg)}>{st.label}</span>
                        {l.status === 'pre_aprovado' && l.valor_pre_aprovado != null && (
                          <div style={{ fontSize: 11, color: OK, marginTop: 3 }}>liberado {inteiroBR(l.valor_pre_aprovado)}</div>
                        )}
                        {l.consultado_em && (
                          <div style={{ fontSize: 10.5, color: '#5b6b84', marginTop: 2 }}>
                            {fmtBR(l.consultado_em)}{l.consultado_por ? ` · ${l.consultado_por}` : ''}
                          </div>
                        )}
                      </td>
                      <td style={s.td}>
                        {pendente ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <input placeholder="valor" inputMode="numeric" disabled={ocupado}
                              value={valores[l.id] || ''}
                              onChange={e => setValores(v => ({ ...v, [l.id]: e.target.value }))}
                              style={{ ...s.input, width: 86, padding: '5px 8px', fontSize: 12 }} />
                            <button disabled={ocupado} onClick={() => marcar(l, 'pre_aprovado')} style={s.btn(OK)}>✅ Pré-aprovado</button>
                            <button disabled={ocupado} onClick={() => marcar(l, 'negado')} style={s.btn(ERRO)}>❌ Negado</button>
                          </div>
                        ) : (l.status === 'pre_aprovado' || l.status === 'enviado_atendimento') ? (
                          // 09/09: o botao "Enviado ao atendimento" SAIU. Todo pre-aprovado
                          // sobe sozinho pra tela Revisao Crefaz, onde a Duda trabalha —
                          // nao existe mais portao de entrega. O botao virava armadilha:
                          // quem clicasse mudaria o status do cliente a toa.
                          <span style={{ fontSize: 11.5, color: '#047857', fontWeight: 600 }}>
                            💡 na Revisão Crefaz
                          </span>
                        ) : (
                          <span style={{ fontSize: 11.5, color: '#5b6b84' }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filtradas.length > visiveis.length && (
              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <button onClick={() => setLimite(n => n + 60)} style={s.btn(NEUTRO)}>
                  ver mais {Math.min(60, filtradas.length - visiveis.length)} de {filtradas.length - visiveis.length}
                </button>
              </div>
            )}
          </div>
        )}
        <div style={s.nota}>
          A regra de DDD e cobertura fica no backend — esta tela só lê a fila e grava o resultado da consulta.
          <br />
          O <b>CEP</b> ao lado da concessionária é o centro da cidade principal daquele DDD, para preencher a
          simulação — não é o endereço do cliente. Onde aparece <b style={{ color: ALERTA }}>⚠ aprox.</b> existe
          mais de uma distribuidora no mesmo DDD e é o CEP que define qual atende, então o teto pode vir diferente.
        </div>
      </Secao>
    </>
  )
}
