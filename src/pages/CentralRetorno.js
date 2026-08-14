import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ═══════════════════════════════════════════════════════════════
// CENTRAL DE RETORNO — interface do sistema de retrabalho multicanal
// (push grátis + avisos pagos WhatsApp/SMS/Email do KR Chat/PWA).
// Todo acesso a dados passa pela edge central-retorno (admin-only,
// service role só no backend, segredos sempre mascarados ****ab12).
// ═══════════════════════════════════════════════════════════════

const ROSA = '#f472b6' // acento da marca (uso pontual — tela B2B)
const CORES_CANAL = { whatsapp: '#34d399', sms: '#60a5fa', email: '#fbbf24' }
const ICONE_CANAL = { whatsapp: '💬', sms: '📱', email: '✉️' }
const GATES = [
  ['conversa_criada', 'Iniciou conversa'], ['oferta_vista', 'Viu a oferta'],
  ['rg_frente', 'RG frente'], ['rg_verso', 'RG verso'],
  ['extrato', 'Extrato'], ['cnis', 'CNIS'],
]
const REGRA_NEGOCIO = 'Limitador: 1 SMS + 1 WhatsApp pagos por lead/dia (3/semana cada); email até 5/dia. O aviso só é disparado quando existe mensagem real esperando na conversa.'

const s = {
  title: { fontSize: 20, fontWeight: 500, color: '#e6edf7', marginBottom: 4 },
  sub: { fontSize: 13, color: '#8b9bb4', marginBottom: 14 },
  card: { background: '#232a37', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 14 },
  kpiNum: { fontSize: 22, fontWeight: 700, color: '#e6edf7' },
  kpiLbl: { fontSize: 11, color: '#8b9bb4', marginTop: 2 },
  input: { padding: '7px 10px', fontSize: 13, borderRadius: 8, border: '0.5px solid rgba(255,255,255,0.13)', background: '#1e242f', color: '#e6edf7', width: '100%', boxSizing: 'border-box' },
  label: { fontSize: 11, color: '#8b9bb4', display: 'block', marginBottom: 3, marginTop: 8 },
  btn: (cor = '#60a5fa', solido = false) => ({
    padding: '7px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
    border: `1px solid ${cor}`, background: solido ? cor : 'transparent', color: solido ? '#1a202c' : cor,
  }),
  aviso: { fontSize: 12, color: '#fbbf24', background: 'rgba(251,191,36,.1)', border: '0.5px solid rgba(251,191,36,.35)', borderRadius: 10, padding: '10px 12px', lineHeight: 1.5 },
  th: { textAlign: 'left', fontSize: 11, color: '#8b9bb4', fontWeight: 600, textTransform: 'uppercase', padding: '9px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)', background: '#1e242f' },
  td: { fontSize: 13, color: '#e6edf7', padding: '8px 10px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', verticalAlign: 'middle' },
  badge: (cor, bg) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600, color: cor, background: bg }),
}
const fmtBR = (dt) => { if (!dt) return '—'; try { return new Date(dt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return dt } }
const reais = (v) => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',')

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

  return (
    <div>
      <div style={s.title}>📣 Central de Retorno</div>
      <div style={s.sub}>Retrabalho multicanal do KR Chat: push grátis + avisos pagos por WhatsApp, SMS e email. <span style={{ color: ROSA }}>●</span> Interface do sistema que roda sozinho no banco.</div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[['painel', '📊 Painel'], ['leads', '👥 Leads'], ['conectores', '🔌 Conectores'], ['campanhas', '📢 Campanhas'], ['fila', '📜 Fila / Log']].map(([k, lbl]) => (
          <button key={k} onClick={() => setTela(k)}
            style={{ padding: '7px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer', border: tela === k ? `1px solid ${ROSA}` : '0.5px solid rgba(255,255,255,0.11)', background: tela === k ? 'rgba(244,114,182,.14)' : '#232a37', color: tela === k ? ROSA : '#8b9bb4' }}>
            {lbl}
          </button>
        ))}
      </div>

      {erro && <div style={{ ...s.aviso, color: '#f87171', borderColor: 'rgba(248,113,113,.4)', background: 'rgba(248,113,113,.1)', marginBottom: 12 }}>⚠ {erro}</div>}
      {!ov && !erro && <div style={{ color: '#8b9bb4', fontSize: 13 }}>Carregando...</div>}

      {ov && tela === 'painel' && <Painel ov={ov} />}
      {tela === 'leads' && <Leads />}
      {ov && tela === 'conectores' && <Conectores ov={ov} recarregar={carregarOverview} />}
      {tela === 'campanhas' && <Campanhas />}
      {tela === 'fila' && <Fila />}
    </div>
  )
}

// ═══════════════ TELA 2 — PAINEL (home) ═══════════════
function Painel({ ov }) {
  const hoje = new Date().toLocaleDateString('en-CA')
  const ontem = new Date(Date.now() - 86400000).toLocaleDateString('en-CA')
  const custosHoje = (ov.custos14 || []).filter(c => String(c.dia).slice(0, 10) === hoje)
  const custoTotalHoje = custosHoje.reduce((a, c) => a + Number(c.custo_reais || 0), 0)
  const pushHoje = (ov.push14 || []).find(p => String(p.dia).slice(0, 10) === hoje) || {}
  const fHoje = (ov.funil || []).find(f => String(f.dia).slice(0, 10) === hoje) || {}
  const fOntem = (ov.funil || []).find(f => String(f.dia).slice(0, 10) === ontem) || {}

  // grafico 14 dias: custo/dia empilhado por canal
  const dias = {}
  ;(ov.custos14 || []).forEach(c => {
    const d = String(c.dia).slice(0, 10)
    if (!dias[d]) dias[d] = {}
    dias[d][c.canal] = Number(c.custo_reais || 0)
  })
  const serie = Object.entries(dias).sort((a, b) => a[0] < b[0] ? -1 : 1).slice(-14)
  const maxDia = Math.max(0.01, ...serie.map(([, v]) => Object.values(v).reduce((a, x) => a + x, 0)))

  const linhaFunil = (lbl, a, b) => (
    <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
      <span style={{ color: '#c6d2e4' }}>{lbl}</span>
      <span><span style={{ color: '#8b9bb4' }}>{b || 0}</span><span style={{ color: '#64748b', margin: '0 5px' }}>→</span><b style={{ color: '#e6edf7' }}>{a || 0}</b></span>
    </div>
  )

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 12 }}>
        <div style={s.card}>
          <div style={s.kpiNum}>{custosHoje.reduce((a, c) => a + Number(c.envios || 0), 0)}</div>
          <div style={s.kpiLbl}>Avisos pagos enviados hoje</div>
          <div style={{ fontSize: 11, marginTop: 6 }}>
            {custosHoje.length === 0 ? <span style={{ color: '#64748b' }}>nenhum envio pago hoje</span> :
              custosHoje.map(c => <div key={c.canal} style={{ color: CORES_CANAL[c.canal] || '#8b9bb4' }}>{ICONE_CANAL[c.canal]} {c.canal}: {c.envios} · {reais(c.custo_reais)}</div>)}
          </div>
        </div>
        <div style={s.card}>
          <div style={{ ...s.kpiNum, color: custoTotalHoje > 0 ? '#fbbf24' : '#e6edf7' }}>{reais(custoTotalHoje)}</div>
          <div style={s.kpiLbl}>Custo pago hoje</div>
        </div>
        <div style={s.card}>
          <div style={{ ...s.kpiNum, color: '#34d399' }}>{pushHoje.entregues || 0}</div>
          <div style={s.kpiLbl}>Pushes entregues hoje (grátis)</div>
          <div style={{ fontSize: 11, color: '#8b9bb4', marginTop: 6 }}>👆 {pushHoje.clicados || 0} clicados · {pushHoje.telefones_alcancados || 0} pessoas</div>
        </div>
        <div style={s.card}>
          <div style={{ ...s.kpiNum, color: '#60a5fa' }}>{(ov.fila_hoje || []).length}</div>
          <div style={s.kpiLbl}>Itens na fila hoje</div>
          <div style={{ fontSize: 11, color: '#8b9bb4', marginTop: 6 }}>
            {['pendente', 'enviado', 'falhou', 'cancelado'].map(st => {
              const n = (ov.fila_hoje || []).filter(f => f.status === st).length
              return n ? <span key={st} style={{ marginRight: 8 }}>{st}: <b style={{ color: '#e6edf7' }}>{n}</b></span> : null
            })}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 10 }}>
        <div style={s.card}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#c6d2e4', marginBottom: 10 }}>💸 Custo por dia — últimos 14 dias (empilhado por canal)</div>
          {serie.length === 0 ? <div style={{ color: '#64748b', fontSize: 12 }}>Sem envios pagos no período. Push (grátis) continua rodando.</div> : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 110 }}>
              {serie.map(([d, v]) => {
                const tot = Object.values(v).reduce((a, x) => a + x, 0)
                return (
                  <div key={d} title={`${d.slice(8)}/${d.slice(5, 7)} · ${reais(tot)}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                    {['email', 'sms', 'whatsapp'].map(cn => v[cn] ? (
                      <div key={cn} style={{ height: Math.max(2, (v[cn] / maxDia) * 92), background: CORES_CANAL[cn], borderRadius: 2, marginTop: 1 }} />
                    ) : null)}
                    <div style={{ fontSize: 9, color: '#64748b', textAlign: 'center', marginTop: 3 }}>{d.slice(8)}</div>
                  </div>
                )
              })}
            </div>
          )}
          <div style={{ fontSize: 10, color: '#8b9bb4', marginTop: 8 }}>
            {Object.entries(CORES_CANAL).map(([cn, cor]) => <span key={cn} style={{ marginRight: 10 }}><span style={{ color: cor }}>■</span> {cn}</span>)}
          </div>
        </div>
        <div style={s.card}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#c6d2e4', marginBottom: 10 }}>🔻 Funil do chat — hoje vs ontem</div>
          {linhaFunil('Chegaram', fHoje.chegaram, fOntem.chegaram)}
          {linhaFunil('Deram telefone', fHoje.deram_telefone, fOntem.deram_telefone)}
          {linhaFunil('Aceitaram push', fHoje.aceitaram_push, fOntem.aceitaram_push)}
          {linhaFunil('Iniciaram conversa', fHoje.iniciaram_conversa, fOntem.iniciaram_conversa)}
          {linhaFunil('Viram oferta', fHoje.viram_oferta, fOntem.viram_oferta)}
          {linhaFunil('Docs completos', fHoje.docs_completos, fOntem.docs_completos)}
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 6 }}>ontem → hoje</div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════ TELA — LEADS DO SITE ═══════════════
const PRODUTOS = [['', 'Todos'], ['bolsa', '🩷 Bolsa'], ['gravida', '🤰 Grávida'], ['mae', '🤱 Mãe'], ['outro', 'Outro']]
const NOME_GATE = { conversa_criada: 'iniciou conversa', oferta_vista: 'viu oferta', rg_frente: 'RG frente', rg_verso: 'RG verso', extrato: 'extrato', docs_completos: 'docs completos' }

function Leads() {
  const [leads, setLeads] = useState(null)
  const [produto, setProduto] = useState('')
  const [busca, setBusca] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let vivo = true
    setLeads(null)
    chamar('leads_list', { produto: produto || undefined })
      .then(r => { if (vivo) setLeads(r.leads) })
      .catch(e => { if (vivo) setMsg(String(e.message || e)) })
    return () => { vivo = false }
  }, [produto])

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
    a.download = `leads_${produto || 'todos'}_${new Date().toLocaleDateString('en-CA')}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        {PRODUTOS.map(([v, lbl]) => (
          <button key={v} onClick={() => setProduto(v)}
            style={{ padding: '6px 12px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer', border: produto === v ? `1px solid ${ROSA}` : '0.5px solid rgba(255,255,255,0.11)', background: produto === v ? 'rgba(244,114,182,.14)' : '#232a37', color: produto === v ? ROSA : '#8b9bb4' }}>
            {lbl}{v && contagem[v] != null ? ` (${contagem[v]})` : ''}{!v && leads ? ` (${leads.length})` : ''}
          </button>
        ))}
        <input style={{ ...s.input, width: 220 }} placeholder="🔎 nome, telefone ou email" value={busca} onChange={e => setBusca(e.target.value)} />
        <button style={s.btn('#34d399', true)} disabled={!visiveis.length} onClick={exportar}>⬇️ Exportar planilha ({visiveis.length})</button>
      </div>
      {msg && <div style={{ ...s.aviso, color: '#f87171', borderColor: 'rgba(248,113,113,.4)', background: 'rgba(248,113,113,.1)', marginBottom: 10 }}>{msg}</div>}
      <div style={{ ...s.aviso, marginBottom: 12 }}>ℹ️ Leads que se cadastraram na página (deram telefone). Email só aparece para quem a página coletar — hoje o funil ainda não pede email.</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#232a37', borderRadius: 12, overflow: 'hidden', border: '0.5px solid rgba(255,255,255,0.08)' }}>
        <thead><tr>
          <th style={s.th}>Nome</th><th style={s.th}>Telefone</th><th style={s.th}>Email</th>
          <th style={s.th}>Produto</th><th style={s.th}>Cadastro</th><th style={s.th}>Último passo</th><th style={s.th}>Push</th>
        </tr></thead>
        <tbody>
          {!leads && <tr><td style={s.td} colSpan={7}>Carregando...</td></tr>}
          {leads && visiveis.length === 0 && <tr><td style={s.td} colSpan={7}>Nenhum lead nesse filtro.</td></tr>}
          {visiveis.slice(0, 500).map(l => (
            <tr key={l.telefone}>
              <td style={s.td}>{l.nome || <span style={{ color: '#64748b' }}>—</span>}</td>
              <td style={s.td}>{l.telefone}</td>
              <td style={s.td}>{l.email || <span style={{ color: '#64748b' }}>—</span>}</td>
              <td style={s.td}><span style={s.badge(ROSA, 'rgba(244,114,182,.12)')}>{l.produto}</span></td>
              <td style={s.td}>{fmtBR(l.cadastrado_em)}</td>
              <td style={{ ...s.td, color: '#8b9bb4', fontSize: 12 }}>{NOME_GATE[l.ultimo_evento] || l.ultimo_evento || 'só cadastro'}</td>
              <td style={s.td}>{l.push_aceito ? '🔔' : <span style={{ color: '#64748b' }}>—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>Tabela mostra até 500 linhas; a planilha exporta TODOS os {visiveis.length} do filtro atual (com busca aplicada).</div>
    </div>
  )
}

// ═══════════════ TELA 1 — CONECTORES ═══════════════
function Conectores({ ov, recarregar }) {
  const [editando, setEditando] = useState(null) // conector em edição
  const [form, setForm] = useState({})
  const [custom, setCustom] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [teste, setTeste] = useState(null) // {conector, telefone, email, resultado, rodando}
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
      {msg && <div style={{ ...s.aviso, color: '#f87171', borderColor: 'rgba(248,113,113,.4)', background: 'rgba(248,113,113,.1)', marginBottom: 10 }}>{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
        {(ov.conectores || []).map(c => (
          <div key={c.id} style={{ ...s.card, borderColor: c.ativo ? 'rgba(52,211,153,.4)' : 'rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#e6edf7' }}>{ICONE_CANAL[c.tipo] || '🔌'} {c.nome}</div>
              <button onClick={() => toggle(c)} title={c.ativo ? 'Desativar' : 'Ativar'}
                style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: c.ativo ? '#34d399' : '#3a4353', position: 'relative' }}>
                <span style={{ position: 'absolute', top: 3, left: c.ativo ? 23 : 3, width: 18, height: 18, borderRadius: 9, background: '#fff', transition: 'left .15s' }} />
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#8b9bb4', lineHeight: 1.7 }}>
              tipo: <b style={{ color: CORES_CANAL[c.tipo] || '#e6edf7' }}>{c.tipo}</b> · prioridade: {c.prioridade} · custo: {c.custo_centavos > 0 ? reais(c.custo_centavos / 100) + '/envio' : 'grátis'}<br />
              {c.configurado
                ? <span style={s.badge('#34d399', 'rgba(52,211,153,.14)')}>✓ credenciais salvas</span>
                : <span style={s.badge('#fbbf24', 'rgba(251,191,36,.12)')}>⚠ falta conectar</span>}
              {' '}{c.ativo
                ? <span style={s.badge('#34d399', 'rgba(52,211,153,.14)')}>ON</span>
                : <span style={s.badge('#8b9bb4', '#2b3340')}>OFF</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button style={s.btn('#60a5fa')} onClick={() => abrirEdicao(c)}>{c.configurado ? '✏️ Editar' : '🔗 Conectar'}</button>
              <button style={s.btn(ROSA)} onClick={() => setTeste({ conector: c, telefone: '', email: '', resultado: null, rodando: false })}>🧪 Testar envio</button>
            </div>
          </div>
        ))}
      </div>

      {/* ---- formulário de conexão (por tipo, esconde o JSON) ---- */}
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
            <div style={{ fontSize: 11, color: '#8b9bb4', marginTop: 6, lineHeight: 1.6 }}>
              Placeholders disponíveis (substituídos no envio):<br />
              <code style={{ color: ROSA }}>{'${telefone_e164}'}</code> +5511999991234 · <code style={{ color: ROSA }}>{'${telefone11}'}</code> 11999991234 · <code style={{ color: ROSA }}>{'${nome}'}</code> primeiro nome · <code style={{ color: ROSA }}>{'${email}'}</code> · <code style={{ color: ROSA }}>{'${link}'}</code> link completo do chat · <code style={{ color: ROSA }}>{'${link_sufixo}'}</code> só o ?tel=...
            </div>
          </>)}
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 10 }}>Segredos salvos aparecem mascarados (****ab12). Deixe mascarado para manter o valor atual; digite um novo para substituir.</div>
          {msg && <div style={{ fontSize: 12, color: '#f87171', marginTop: 8 }}>{msg}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'space-between' }}>
            <button style={s.btn('#8b9bb4')} onClick={() => setCustom(v => !v)}>{custom ? '← Formulário simples' : '⚙️ Provedor customizado (avançado)'}</button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={s.btn('#8b9bb4')} onClick={() => setEditando(null)}>Cancelar</button>
              <button style={s.btn('#34d399', true)} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : '💾 Salvar'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ---- teste de envio ---- */}
      {teste && (
        <Modal titulo={`🧪 Testar ${teste.conector.nome}`} fechar={() => setTeste(null)}>
          <div style={{ fontSize: 12, color: '#8b9bb4', lineHeight: 1.6 }}>
            Insere um item real na fila com o SEU telefone, canal fixo <b style={{ color: CORES_CANAL[teste.conector.tipo] }}>{teste.conector.tipo}</b>, e chama o despacho de verdade (mesmo caminho do robô). O limitador vale para o teste também — 2º teste no mesmo dia pode sair como “cancelado: limitador”.
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
            <pre style={{ marginTop: 12, background: '#1a202c', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 10, fontSize: 11, color: teste.resultado.error ? '#f87171' : '#c6d2e4', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 220, overflow: 'auto' }}>
              {JSON.stringify(teste.resultado, null, 2)}
            </pre>
          )}
        </Modal>
      )}
    </div>
  )
}

// ═══════════════ TELA 3 — CAMPANHAS ═══════════════
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

  // alvo estimado com debounce quando o segmento muda
  useEffect(() => {
    if (!nova) return
    setAlvo(null)
    const t = setTimeout(async () => {
      try {
        const r = await chamar('campanha_alvo', { gates: nova.gates, funil: nova.funil === 'todos' ? null : nova.funil, min_h: nova.min_h, max_h: nova.max_h })
        setAlvo(r.alvo)
      } catch { setAlvo('?') }
    }, 500)
    return () => clearTimeout(t)
  }, [nova?.gates, nova?.funil, nova?.min_h, nova?.max_h]) // eslint-disable-line react-hooks/exhaustive-deps

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
      if (!cid) { // nova, ainda não salva
        const r = await chamar('campanha_salvar', { ...nova, funil: nova.funil === 'todos' ? null : nova.funil }); cid = r.id
      }
      const r2 = await chamar('campanha_disparar', { id: cid })
      setMsg(`✅ Disparada: ${JSON.stringify(r2.resultado)}`)
      setNova(null); carregar()
    } catch (e) { setMsg(String(e.message || e)) }
    setOcupado(false)
  }

  const primeiroNome = 'Maria' // preview
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: '#8b9bb4' }}>Campanhas de push (grátis) para reengajar quem parou no funil do chat.</div>
        <button style={s.btn(ROSA, true)} onClick={abrirNova}>+ Nova campanha</button>
      </div>
      {msg && <div style={{ ...s.aviso, marginBottom: 10 }}>{msg}</div>}

      {nova && (
        <div style={{ ...s.card, marginBottom: 14, border: `1px solid ${ROSA}44` }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#e6edf7', marginBottom: 4 }}>Nova campanha</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
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
                  <label key={g} style={{ fontSize: 12, color: nova.gates.includes(g) ? '#e6edf7' : '#8b9bb4', background: nova.gates.includes(g) ? 'rgba(244,114,182,.14)' : '#1e242f', border: nova.gates.includes(g) ? `1px solid ${ROSA}` : '0.5px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer' }}>
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
              <div style={{ background: '#1a202c', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: 12 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: ROSA, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>💌</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#e6edf7' }}>{(nova.titulo || '').replace('{nome}', primeiroNome)}</div>
                    <div style={{ fontSize: 12, color: '#c6d2e4' }}>{(nova.corpo || '').replace('{nome}', primeiroNome)}</div>
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>chat.maismaeauxilio.com.br · agora</div>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 14, ...s.card, background: '#1e242f', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#8b9bb4', textTransform: 'uppercase' }}>🎯 Alvo estimado</div>
                <div style={{ fontSize: 30, fontWeight: 700, color: alvo === null ? '#64748b' : ROSA }}>{alvo === null ? '…' : alvo}</div>
                <div style={{ fontSize: 11, color: '#8b9bb4' }}>pessoas com push aceito nesse segmento agora</div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
                <button style={s.btn('#8b9bb4')} onClick={() => setNova(null)}>Cancelar</button>
                <button style={s.btn('#60a5fa')} disabled={ocupado} onClick={salvarRascunho}>💾 Salvar rascunho</button>
                <button style={s.btn(ROSA, true)} disabled={ocupado} onClick={() => disparar(null, nova.nome || 'sem nome', alvo)}>🚀 Disparar agora</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {dados?.rascunhos?.length > 0 && (
        <div style={{ ...s.card, marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#c6d2e4', marginBottom: 8 }}>📝 Rascunhos</div>
          {dados.rascunhos.map(r => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '5px 0', borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}>
              <span style={{ color: '#e6edf7' }}>{r.nome} <span style={{ color: '#64748b', fontSize: 11 }}>· {(r.gates || []).join(', ')} · {r.funil || 'todos'} · {r.parado_min_horas}-{r.parado_max_horas}h</span></span>
              <button style={s.btn(ROSA)} disabled={ocupado} onClick={() => disparar(r.id, r.nome, null)}>🚀 Disparar</button>
            </div>
          ))}
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#232a37', borderRadius: 12, overflow: 'hidden', border: '0.5px solid rgba(255,255,255,0.08)' }}>
        <thead><tr>
          <th style={s.th}>Campanha</th><th style={s.th}>Disparada</th><th style={s.th}>Enviados</th>
          <th style={s.th}>Entregues</th><th style={s.th}>Clicados</th><th style={s.th}>Voltaram e avançaram</th>
        </tr></thead>
        <tbody>
          {!dados && <tr><td style={s.td} colSpan={6}>Carregando...</td></tr>}
          {dados && (dados.relatorio || []).length === 0 && <tr><td style={s.td} colSpan={6}>Nenhuma campanha disparada ainda.</td></tr>}
          {(dados?.relatorio || []).map(c => (
            <tr key={c.id}>
              <td style={s.td}>{c.nome}</td>
              <td style={s.td}>{fmtBR(c.disparada_em)}</td>
              <td style={s.td}>{c.enviados ?? '—'}</td>
              <td style={s.td}>{c.entregues}</td>
              <td style={s.td}>{c.clicados}</td>
              <td style={{ ...s.td, color: c.voltaram_e_avancaram > 0 ? '#34d399' : '#8b9bb4', fontWeight: 600 }}>{c.voltaram_e_avancaram}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ═══════════════ TELA 4 — FILA / LOG ═══════════════
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

  const corStatus = { enviado: ['#34d399', 'rgba(52,211,153,.14)'], pendente: ['#60a5fa', 'rgba(96,165,250,.14)'], falhou: ['#f87171', 'rgba(248,113,113,.14)'], cancelado: ['#8b9bb4', '#2b3340'] }
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <select style={{ ...s.input, width: 150 }} value={fStatus} onChange={e => setFStatus(e.target.value)}>
          <option value="">status: todos</option><option>pendente</option><option>enviado</option><option>falhou</option><option>cancelado</option>
        </select>
        <select style={{ ...s.input, width: 150 }} value={fCanal} onChange={e => setFCanal(e.target.value)}>
          <option value="">canal: todos</option><option>whatsapp</option><option>sms</option><option>email</option><option>auto</option>
        </select>
        <input type="date" style={{ ...s.input, width: 160, colorScheme: 'dark' }} value={fDia} onChange={e => setFDia(e.target.value)} />
        <button style={s.btn('#fbbf24')} disabled={ocupado} onClick={reprocessar}>↩️ Reprocessar falhados</button>
      </div>
      {msg && <div style={{ ...s.aviso, marginBottom: 10 }}>{msg}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#232a37', borderRadius: 12, overflow: 'hidden', border: '0.5px solid rgba(255,255,255,0.08)' }}>
        <thead><tr>
          <th style={s.th}>Telefone</th><th style={s.th}>Canal</th><th style={s.th}>Provider</th><th style={s.th}>Status</th>
          <th style={s.th}>Custo</th><th style={s.th}>Criado</th><th style={s.th}>Enviado</th><th style={s.th}>Detalhe</th>
        </tr></thead>
        <tbody>
          {!linhas && <tr><td style={s.td} colSpan={8}>Carregando...</td></tr>}
          {linhas && linhas.length === 0 && <tr><td style={s.td} colSpan={8}>Fila vazia nesse filtro.</td></tr>}
          {(linhas || []).map(r => {
            const [cor, bg] = corStatus[r.status] || ['#8b9bb4', '#2b3340']
            const det = r.resultado || {}
            return (
              <tr key={r.id}>
                <td style={s.td}>{r.telefone}{det.teste ? ' 🧪' : ''}</td>
                <td style={{ ...s.td, color: CORES_CANAL[r.canal] || '#e6edf7' }}>{ICONE_CANAL[r.canal] || ''} {r.canal}</td>
                <td style={s.td}>{r.provider || '—'}</td>
                <td style={s.td}><span style={s.badge(cor, bg)}>{r.status}</span></td>
                <td style={s.td}>{r.custo_centavos > 0 ? reais(r.custo_centavos / 100) : '—'}</td>
                <td style={s.td}>{fmtBR(r.criado_em)}</td>
                <td style={s.td}>{fmtBR(r.enviado_em)}</td>
                <td style={{ ...s.td, fontSize: 11, color: '#8b9bb4', maxWidth: 260 }}>
                  {det.http ? `HTTP ${det.http} ` : ''}{det.motivo || det.erro || (det.resp ? String(det.resp).slice(0, 80) : '') || '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>Últimos 200 itens do filtro. Telefones mascarados por privacidade — o número completo nunca sai do banco.</div>
    </div>
  )
}

// ═══════════════ modal simples ═══════════════
function Modal({ titulo, fechar, children }) {
  return (
    <div onClick={fechar} style={{ position: 'fixed', inset: 0, background: 'rgba(10,14,20,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#232a37', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 14, padding: 18, width: 560, maxWidth: '96vw', maxHeight: '88vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#e6edf7' }}>{titulo}</div>
          <button onClick={fechar} style={{ background: 'none', border: 'none', color: '#8b9bb4', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
