import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// ===== Painel do Digitador BF (v2 — conferência PÓS-FATO) =====
// Princípio: o robô digita e ENVIA automático (filtro = apto da fila_digitacao_bf).
// O humano confere DEPOIS, com 1 clique (✓ Correto / ⚠ Problema) — igual ao Confere CNIS.
// Nada aqui trava a digitação. As marcações alimentam a taxa de acerto/erro da máquina.
// Plano de controle 100% via Supabase; senha Crefisa cifrada via RPC (nunca volta pro front);
// prints no bucket privado digitador-prints (signed URL, só admin).

const s = {
  wrap: { padding: 16, maxWidth: 1200, margin: '0 auto' },
  h1: { fontSize: 20, fontWeight: 600, marginBottom: 4 },
  sub: { fontSize: 13, color: '#8b9bb4', marginBottom: 16 },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 10, marginBottom: 16 },
  card: (cor) => ({ border: '0.5px solid rgba(255,255,255,0.07)', borderLeft: `4px solid ${cor}`, borderRadius: 10, padding: '10px 12px', background: '#232a37' }),
  cardTop: { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600, color: '#8b9bb4', marginBottom: 4 },
  cardNum: { fontSize: 22, fontWeight: 600, lineHeight: 1.1 },
  cardSub: { fontSize: 11, color: '#8b9bb4', marginTop: 3 },
  abas: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 },
  aba: (on) => ({ padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid ' + (on ? '#60a5fa' : 'rgba(255,255,255,0.09)'), background: on ? '#60a5fa' : '#232a37', color: on ? '#232a37' : '#c6d2e4' }),
  box: { border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 14, marginBottom: 12, background: '#232a37' },
  boxTitulo: { fontSize: 14, fontWeight: 600, marginBottom: 10 },
  btn: { padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: '#60a5fa', color: '#232a37', marginRight: 6 },
  btnG: { padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.11)', background: '#232a37', color: '#c6d2e4', marginRight: 6 },
  btnVerde: { padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: '#34d399', color: '#232a37', marginRight: 6 },
  btnVermelho: { padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: '#f87171', color: '#232a37', marginRight: 6 },
  input: { padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.11)', fontSize: 13, marginRight: 6 },
  tag: (bg, cor) => ({ fontSize: 11, fontWeight: 700, background: bg, color: cor, borderRadius: 6, padding: '2px 8px', display: 'inline-block' }),
  linha: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderBottom: '0.5px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' },
  mono: { fontFamily: 'monospace', fontSize: 12 },
  toggleGrande: (on) => ({ padding: '14px 28px', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer', border: 'none', background: on ? '#34d399' : '#f87171', color: '#232a37' }),
  campoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 6, marginTop: 8 },
  campo: { fontSize: 12, background: '#1e242f', borderRadius: 6, padding: '5px 8px' },
  logRow: (nivel) => ({ fontSize: 12, fontFamily: 'monospace', padding: '5px 8px', borderRadius: 6, marginBottom: 3, background: nivel === 'erro' ? 'rgba(248,113,113,.14)' : '#1e242f', color: nivel === 'erro' ? '#f87171' : '#c6d2e4' }),
  printImg: { maxWidth: '100%', borderRadius: 8, border: '0.5px solid rgba(255,255,255,0.11)', cursor: 'pointer' },
  chip: (on) => ({ padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid ' + (on ? '#60a5fa' : 'rgba(255,255,255,0.11)'), background: on ? 'rgba(96,165,250,.12)' : '#232a37', color: on ? '#60a5fa' : '#8b9bb4', marginRight: 6 }),
}

const STATUS_SESSAO = {
  ativa: ['rgba(52,211,153,.14)', '#34d399'], caida: ['rgba(248,113,113,.14)', '#f87171'],
  expirada: ['rgba(251,191,36,.12)', '#fbbf24'], logando: ['rgba(96,165,250,.12)', '#60a5fa'],
}

function dentroJanela() {
  const h = Number(new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }))
  return h >= 7 && h < 23
}
function fmtTs(ts) { return ts ? new Date(ts).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—' }
function agoSeg(ts) { return ts ? Math.floor((Date.now() - new Date(ts).getTime()) / 1000) : null }

export default function PainelDigitador() {
  const { profile } = useAuth()
  const [aba, setAba] = useState('conferencia')
  const [control, setControl] = useState(null)
  const [sessoes, setSessoes] = useState([])
  const [heartbeat, setHeartbeat] = useState(null)
  const [logs, setLogs] = useState([])
  const [filtroNivel, setFiltroNivel] = useState('todos')
  const [filtroUsuario, setFiltroUsuario] = useState('')
  const [problemas, setProblemas] = useState([])
  const [resumo, setResumo] = useState(null)
  const [confs, setConfs] = useState([])
  const [filtroConf, setFiltroConf] = useState('pendentes') // pendentes | problema | todos | sombra
  const [filtroConfLogin, setFiltroConfLogin] = useState('')
  const [prints, setPrints] = useState({})
  const [novoUser, setNovoUser] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [vncAberto, setVncAberto] = useState(false)

  const carregar = useCallback(async () => {
    const [c, se, hb, r] = await Promise.all([
      supabase.from('digitador_control').select('*').eq('id', 1).single(),
      supabase.from('digitador_sessoes').select('*').order('usuario'),
      supabase.from('digitador_heartbeat').select('*').order('ultimo_ping', { ascending: false }).limit(1),
      supabase.rpc('digitador_resumo'),
    ])
    setControl(c.data || null)
    setSessoes(se.data || [])
    setHeartbeat((hb.data || [])[0] || null)
    setResumo(r.data || null)
  }, [])

  const carregarConfs = useCallback(async () => {
    let q = supabase.from('digitador_conferencia').select('*').order('ts', { ascending: false }).limit(60)
    if (filtroConf === 'sombra') q = q.eq('modo', 'sombra')
    else {
      q = q.eq('modo', 'producao')
      if (filtroConf === 'pendentes') q = q.eq('conferido', false).eq('problema', false)
      if (filtroConf === 'problema') q = q.eq('problema', true)
    }
    if (filtroConfLogin) q = q.eq('usuario', filtroConfLogin)
    const { data } = await q
    setConfs(data || [])
    for (const reg of (data || [])) {
      if (reg.screenshot_path && !prints[reg.id]) {
        const { data: su } = await supabase.storage.from('digitador-prints').createSignedUrl(reg.screenshot_path, 3600)
        if (su?.signedUrl) setPrints(prev => ({ ...prev, [reg.id]: su.signedUrl }))
      }
    }
  }, [filtroConf, filtroConfLogin, prints])

  const carregarLogs = useCallback(async () => {
    let q = supabase.from('digitador_logs').select('*').order('ts', { ascending: false }).limit(120)
    if (filtroNivel !== 'todos') q = q.eq('nivel', filtroNivel)
    if (filtroUsuario) q = q.eq('usuario', filtroUsuario)
    const { data } = await q
    setLogs(data || [])
  }, [filtroNivel, filtroUsuario])

  const carregarProblemas = useCallback(async () => {
    const { data } = await supabase.rpc('digitador_leads_problema')
    setProblemas(data || [])
  }, [])

  useEffect(() => { carregar(); carregarConfs(); carregarLogs(); carregarProblemas() }, []) // eslint-disable-line
  useEffect(() => {
    const id = setInterval(() => { carregar(); if (aba === 'conferencia') carregarConfs(); if (aba === 'erros') carregarLogs() }, 20000)
    return () => clearInterval(id)
  }, [aba, carregar, carregarConfs, carregarLogs])
  useEffect(() => { carregarConfs() }, [filtroConf, filtroConfLogin]) // eslint-disable-line
  useEffect(() => { carregarLogs() }, [filtroNivel, filtroUsuario]) // eslint-disable-line

  const atualizarControl = async (patch) => {
    const { error } = await supabase.from('digitador_control')
      .update({ ...patch, atualizado_em: new Date().toISOString(), atualizado_por: profile?.nome || profile?.id })
      .eq('id', 1)
    if (error) { alert('Erro: ' + error.message); return }
    carregar()
  }

  // ===== conferência: 1 clique, pós-fato (não desfaz nada) =====
  const marcarCorreto = async (reg) => {
    await supabase.from('digitador_conferencia').update({
      conferido: true, problema: false, conferido_por: profile?.nome || profile?.id, conferido_em: new Date().toISOString(),
    }).eq('id', reg.id)
    setConfs(prev => prev.filter(x => filtroConf !== 'pendentes' ? true : x.id !== reg.id))
    carregar(); if (filtroConf !== 'pendentes') carregarConfs()
  }
  const marcarProblema = async (reg) => {
    const obs = window.prompt('O que está errado? (vai pra fila de correção — a proposta JÁ FOI enviada, isso só sinaliza)')
    if (obs === null) return
    await supabase.from('digitador_conferencia').update({
      problema: true, conferido: false, obs: obs || null, conferido_por: profile?.nome || profile?.id, conferido_em: new Date().toISOString(),
    }).eq('id', reg.id)
    carregarConfs(); carregar()
  }

  const salvarLogin = async () => {
    if (!novoUser.trim()) { alert('Informe o usuário'); return }
    setSalvando(true)
    const { error } = await supabase.rpc('digitador_salvar_login', { p_usuario: novoUser.trim(), p_senha: novaSenha })
    setSalvando(false)
    if (error) { alert('Erro: ' + error.message); return }
    setNovoUser(''); setNovaSenha('')
    carregar()
  }
  const excluirLogin = async (usuario) => {
    if (!window.confirm(`Remover o login ${usuario}?`)) return
    const { error } = await supabase.rpc('digitador_excluir_login', { p_usuario: usuario })
    if (error) { alert('Erro: ' + error.message); return }
    carregar()
  }
  const toggleRodizio = async (usuario, valor) => {
    await supabase.from('digitador_sessoes').update({ ativo_no_rodizio: valor, atualizado_em: new Date().toISOString() }).eq('usuario', usuario)
    carregar()
  }
  const marcarRelogin = async (usuario) => {
    // COMANDO pro robô abrir a janela de login (o robô escuta `pedir_relogin`, não `precisa_relogin`).
    // `precisa_relogin` é ESTADO (o robô seta quando a sessão cai) — só pra exibição.
    await supabase.from('digitador_sessoes').update({ pedir_relogin: true, atualizado_em: new Date().toISOString() }).eq('usuario', usuario)
    carregar()
  }

  const conf = resumo?.conferencia || {}
  const vivo = heartbeat && agoSeg(heartbeat.ultimo_ping) !== null && agoSeg(heartbeat.ultimo_ping) < 120
  const janela = dentroJanela()
  const caidas = sessoes.filter(x => x.status === 'caida' || x.precisa_relogin)

  return (
    <div style={s.wrap}>
      <div style={s.h1}>🖨️ Painel do Digitador BF</div>
      <div style={s.sub}>O robô digita e envia sozinho (filtro: apto da fila). Você confere depois, com 1 clique — as marcações viram a taxa de acerto da máquina. Janela Crefisa: 07h–23h.</div>

      {/* SAÚDE */}
      <div style={s.cards}>
        <div style={s.card(vivo ? '#34d399' : '#f87171')}>
          <div style={s.cardTop}>Robô</div>
          <div style={{ ...s.cardNum, color: vivo ? '#34d399' : '#f87171' }}>{vivo ? 'VIVO' : 'SEM SINAL'}</div>
          <div style={s.cardSub}>{heartbeat ? `ping ${fmtTs(heartbeat.ultimo_ping)} · ${heartbeat.versao || ''}` : 'nunca pingou'}</div>
        </div>
        <div style={s.card(control?.ligado ? '#34d399' : '#f87171')}>
          <div style={s.cardTop}>Fila</div>
          <div style={{ ...s.cardNum, color: control?.ligado ? '#34d399' : '#f87171' }}>{control?.ligado ? 'LIGADA' : 'PAUSADA'}</div>
          <div style={s.cardSub}>modo: {control?.modo || '—'}{!janela && ' · FORA DA JANELA'}</div>
        </div>
        <div style={s.card('#60a5fa')}>
          <div style={s.cardTop}>Fila apta</div>
          <div style={s.cardNum}>{resumo?.fila_apto ?? '—'}</div>
          <div style={s.cardSub}>robô reporta: {heartbeat?.fila_pendente ?? '—'}</div>
        </div>
        <div style={s.card('#34d399')}>
          <div style={s.cardTop}>Digitados hoje</div>
          <div style={s.cardNum}>{resumo?.digitados_hoje ?? '—'}</div>
          <div style={s.cardSub}>{conf.pendentes ?? 0} a conferir · {conf.com_problema ?? 0} problema</div>
        </div>
        <div style={s.card(conf.taxa_acerto_pct == null ? '#8b9bb4' : conf.taxa_acerto_pct >= 95 ? '#34d399' : '#fbbf24')}>
          <div style={s.cardTop}>Taxa de acerto (7d)</div>
          <div style={s.cardNum}>{conf.taxa_acerto_pct != null ? conf.taxa_acerto_pct + '%' : '—'}</div>
          <div style={s.cardSub}>{conf.conferidos_ok ?? 0} ok / {(conf.conferidos_ok ?? 0) + (conf.com_problema ?? 0)} conferidos</div>
        </div>
        <div style={s.card(caidas.length ? '#f87171' : '#34d399')}>
          <div style={s.cardTop}>Logins</div>
          <div style={{ ...s.cardNum, color: caidas.length ? '#f87171' : '#34d399' }}>{sessoes.length - caidas.length}/{sessoes.length} ok</div>
          <div style={s.cardSub}>{caidas.length ? `${caidas.length} precisando de relogin` : 'todos ativos'}</div>
        </div>
      </div>

      {/* ABAS */}
      <div style={s.abas}>
        {[['conferencia', `✅ Conferência${conf.pendentes ? ` (${conf.pendentes})` : ''}`], ['controle', '🎛️ Controle'], ['logins', `🔑 Logins${caidas.length ? ` (${caidas.length}⚠)` : ''}`], ['erros', '🐞 Erros & Logs'], ['metricas', '📊 Métricas']].map(([k, l]) => (
          <div key={k} style={s.aba(aba === k)} onClick={() => { setAba(k); if (k === 'erros') { carregarLogs(); carregarProblemas() } if (k === 'conferencia') carregarConfs() }}>{l}</div>
        ))}
      </div>

      {/* ===== CONFERÊNCIA (pós-fato, 1 clique) ===== */}
      {aba === 'conferencia' && (
        <div>
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            {[['pendentes', `A conferir (${conf.pendentes ?? 0})`], ['problema', `Com problema (${conf.com_problema ?? 0})`], ['todos', 'Todas (produção)'], ['sombra', 'Sombra (testes)']].map(([k, l]) => (
              <span key={k} style={s.chip(filtroConf === k)} onClick={() => setFiltroConf(k)}>{l}</span>
            ))}
            <select style={s.input} value={filtroConfLogin} onChange={e => setFiltroConfLogin(e.target.value)}>
              <option value="">todos os logins</option>
              {sessoes.map(x => <option key={x.usuario} value={x.usuario}>{x.usuario}</option>)}
            </select>
          </div>

          {confs.length === 0 && (
            <div style={{ ...s.box, color: '#8b9bb4', textAlign: 'center' }}>
              {filtroConf === 'pendentes' ? 'Nada a conferir. 🎉 Tudo que o robô digitou já foi auditado.' : 'Nenhum registro nesse filtro.'}
            </div>
          )}
          {confs.map(reg => (
            <div key={reg.id} style={s.box}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <strong>Lead #{reg.lead_id}</strong>{reg.cpf && <span style={s.mono}> · CPF {reg.cpf}</span>} · {fmtTs(reg.ts)}
                  {' '}<span style={reg.modo === 'producao' ? s.tag('rgba(52,211,153,.14)', '#34d399') : s.tag('rgba(96,165,250,.12)', '#60a5fa')}>{reg.modo === 'producao' ? 'ENVIADA' : 'SOMBRA'}</span>
                  {reg.protocolo && <span style={{ ...s.tag('rgba(96,165,250,.10)', '#60a5fa'), marginLeft: 6 }}>protocolo {reg.protocolo}</span>}
                  {' '}<span style={s.tag('#1e242f', '#8b9bb4')}>RG: {reg.anexos_rg ?? 0} · Extrato: {reg.anexos_extrato ?? 0}</span>
                  {reg.usuario && <span style={{ ...s.tag('#1e242f', '#8b9bb4'), marginLeft: 6 }}>{reg.usuario}</span>}
                  {reg.conferido && <span style={{ ...s.tag('rgba(52,211,153,.14)', '#34d399'), marginLeft: 6 }}>✓ correto ({reg.conferido_por})</span>}
                  {reg.problema && <span style={{ ...s.tag('rgba(248,113,113,.14)', '#f87171'), marginLeft: 6 }}>⚠ problema ({reg.conferido_por})</span>}
                </div>
                {reg.modo === 'producao' && !reg.conferido && !reg.problema && (
                  <div>
                    <button style={s.btnVerde} onClick={() => marcarCorreto(reg)}>✓ Correto</button>
                    <button style={s.btnVermelho} onClick={() => marcarProblema(reg)}>⚠ Problema</button>
                  </div>
                )}
              </div>
              {reg.obs && <div style={{ fontSize: 12, color: '#f87171', marginTop: 6 }}>Obs: {reg.obs}</div>}
              {reg.erro_detalhe && <div style={{ fontSize: 12, color: '#f87171', marginTop: 6 }}>Erro: {reg.erro_detalhe}</div>}
              {reg.campos_json && (
                <div style={s.campoGrid}>
                  {Object.entries(reg.campos_json).map(([k, v]) => (
                    <div key={k} style={s.campo}><strong>{k}:</strong> {String(v ?? '—')}</div>
                  ))}
                </div>
              )}
              {prints[reg.id] && (
                <div style={{ marginTop: 10 }}>
                  <a href={prints[reg.id]} target="_blank" rel="noreferrer">
                    <img src={prints[reg.id]} alt="print da proposta" style={{ ...s.printImg, maxHeight: 340 }} />
                  </a>
                  <div style={{ fontSize: 11, color: '#8b9bb4' }}>clique pra abrir em tamanho real</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ===== CONTROLE ===== */}
      {aba === 'controle' && control && (
        <div style={s.box}>
          <div style={s.boxTitulo}>Liga / desliga a fila</div>
          <button style={s.toggleGrande(control.ligado)} onClick={() => atualizarControl({ ligado: !control.ligado })}>
            {control.ligado ? '● RODANDO — clicar para PAUSAR' : '■ PAUSADO — clicar para LIGAR'}
          </button>
          <div style={{ fontSize: 12, color: '#8b9bb4', marginTop: 6 }}>
            Estado real: {!janela ? 'fora da janela 07h–23h (robô dorme mesmo ligado)' : control.ligado ? 'processando a fila automaticamente' : 'pausado'}
          </div>
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Modo</div>
            <button style={control.modo === 'producao' ? s.btnVerde : s.btnG} onClick={() => atualizarControl({ modo: 'producao' })}>🚀 Produção (envia de verdade)</button>
            <button style={control.modo === 'dry_run' ? s.btn : s.btnG} onClick={() => atualizarControl({ modo: 'dry_run' })}>🕶️ Sombra (teste pontual — preenche sem enviar)</button>
            <div style={{ fontSize: 12, color: '#8b9bb4', marginTop: 4 }}>Produção é o modo normal. Sombra é só pra teste quando você quiser conferir antes — não é etapa do fluxo.</div>
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ fontSize: 13 }}>Lote: <input type="number" style={{ ...s.input, width: 70 }} defaultValue={control.lote} onBlur={e => atualizarControl({ lote: Number(e.target.value) || control.lote })} /></label>
            <label style={{ fontSize: 13 }}>Pausa (ms): <input type="number" style={{ ...s.input, width: 90 }} defaultValue={control.pausa_ms} onBlur={e => atualizarControl({ pausa_ms: Number(e.target.value) || control.pausa_ms })} /></label>
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: 13 }}>URL do VNC (noVNC do VPS): <input style={{ ...s.input, width: 340 }} defaultValue={control.vnc_url || ''} placeholder="https://vps:6080/vnc.html" onBlur={e => atualizarControl({ vnc_url: e.target.value || null })} /></label>
          </div>
          <div style={{ fontSize: 12, color: '#8b9bb4', marginTop: 10 }}>Última alteração: {fmtTs(control.atualizado_em)} por {control.atualizado_por || '—'}</div>
        </div>
      )}

      {/* ===== LOGINS ===== */}
      {aba === 'logins' && (
        <div>
          <div style={s.box}>
            <div style={s.boxTitulo}>Adicionar / atualizar login Crefisa</div>
            <input style={s.input} placeholder="usuário" value={novoUser} onChange={e => setNovoUser(e.target.value)} />
            <input style={s.input} type="password" placeholder="senha (cifrada no banco)" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} />
            <button style={s.btn} onClick={salvarLogin} disabled={salvando}>{salvando ? '...' : 'Salvar'}</button>
            <div style={{ fontSize: 11, color: '#8b9bb4', marginTop: 6 }}>A senha vai cifrada direto pro banco via RPC — não aparece em log nem volta pro painel. Pra trocar, salve de novo com o mesmo usuário.</div>
          </div>
          <div style={s.box}>
            <div style={s.boxTitulo}>Logins e rodízio</div>
            {sessoes.length === 0 && <div style={{ color: '#8b9bb4', fontSize: 13 }}>Nenhum login cadastrado.</div>}
            {sessoes.map(x => {
              const [bg, cor] = STATUS_SESSAO[x.status] || ['#2b3340', '#8b9bb4']
              return (
                <div key={x.usuario} style={s.linha}>
                  <div>
                    <strong style={s.mono}>{x.usuario}</strong>{' '}
                    <span style={s.tag(bg, cor)}>{x.status}</span>
                    {x.precisa_relogin && <span style={{ ...s.tag('rgba(251,191,36,.12)', '#fbbf24'), marginLeft: 6 }}>precisa relogin</span>}
                    <div style={{ fontSize: 11, color: '#8b9bb4', marginTop: 2 }}>último OK: {fmtTs(x.ultimo_ok_em)}{x.ultimo_erro ? ` · erro: ${x.ultimo_erro}` : ''}</div>
                  </div>
                  <div>
                    <button style={x.ativo_no_rodizio ? s.btnG : s.btnVerde} onClick={() => toggleRodizio(x.usuario, !x.ativo_no_rodizio)}>
                      {x.ativo_no_rodizio ? 'Tirar do rodízio' : 'Pôr no rodízio'}
                    </button>
                    {(x.status === 'caida' || x.precisa_relogin) && (
                      <button style={s.btn} onClick={() => { marcarRelogin(x.usuario); setVncAberto(true) }}>🔌 Reconectar (VNC)</button>
                    )}
                    {!x.precisa_relogin && x.status !== 'caida' && (
                      <button style={s.btnG} onClick={() => marcarRelogin(x.usuario)}>Forçar relogin</button>
                    )}
                    <button style={s.btnVermelho} onClick={() => excluirLogin(x.usuario)}>Remover</button>
                  </div>
                </div>
              )
            })}
          </div>
          {vncAberto && (
            <div style={s.box}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={s.boxTitulo}>VNC do VPS — faça o login e resolva o captcha</div>
                <button style={s.btnG} onClick={() => setVncAberto(false)}>Fechar</button>
              </div>
              {control?.vnc_url
                ? <iframe title="vnc" src={control.vnc_url} style={{ width: '100%', height: 560, border: '0.5px solid rgba(255,255,255,0.11)', borderRadius: 8 }} />
                : <div style={{ fontSize: 13, color: '#f87171' }}>URL do VNC não configurada — preencha na aba Controle quando o VPS estiver no ar.</div>}
              <div style={{ fontSize: 12, color: '#8b9bb4', marginTop: 6 }}>Depois do login, o robô re-salva a sessão sozinho e o status volta pra "ativa".</div>
            </div>
          )}
        </div>
      )}

      {/* ===== ERROS & LOGS ===== */}
      {aba === 'erros' && (
        <div>
          <div style={s.box}>
            <div style={s.boxTitulo}>Leads com problema na digitação ({problemas.length})</div>
            {problemas.length === 0 && <div style={{ color: '#8b9bb4', fontSize: 13 }}>Nenhum lead com erro/revisão. 🎉</div>}
            {problemas.map(p => (
              <div key={p.lead_id} style={s.linha}>
                <div>
                  <strong>#{p.lead_id}</strong> {p.nome || ''} <span style={s.mono}>{p.tel}</span>{p.cpf && <span style={s.mono}> · {p.cpf}</span>}
                  <div style={{ fontSize: 12, marginTop: 2 }}>
                    <span style={s.tag('rgba(248,113,113,.14)', '#f87171')}>{p.status}</span>{' '}
                    {p.detalhe && <span style={{ color: '#8b9bb4' }}>{p.detalhe}</span>}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#8b9bb4' }}>{p.digitado_em ? fmtTs(p.digitado_em) : ''} {p.digitado_por ? `· ${p.digitado_por}` : ''}</div>
              </div>
            ))}
          </div>
          <div style={s.box}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
              <div style={s.boxTitulo}>Logs do robô</div>
              <div>
                <select style={s.input} value={filtroNivel} onChange={e => setFiltroNivel(e.target.value)}>
                  <option value="todos">todos</option><option value="info">info</option><option value="erro">erro</option>
                </select>
                <select style={s.input} value={filtroUsuario} onChange={e => setFiltroUsuario(e.target.value)}>
                  <option value="">todos os logins</option>
                  {sessoes.map(x => <option key={x.usuario} value={x.usuario}>{x.usuario}</option>)}
                </select>
                <button style={s.btnG} onClick={carregarLogs}>Atualizar</button>
              </div>
            </div>
            {logs.length === 0 && <div style={{ color: '#8b9bb4', fontSize: 13 }}>Sem logs ainda (o robô grava aqui a cada evento).</div>}
            {logs.map(l => (
              <div key={l.id} style={s.logRow(l.nivel)}>
                {fmtTs(l.ts)} [{l.nivel}]{l.usuario ? ` [${l.usuario}]` : ''}{l.lead_id ? ` [lead ${l.lead_id}]` : ''} {l.evento}{l.detalhe ? ` — ${l.detalhe}` : ''}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== MÉTRICAS ===== */}
      {aba === 'metricas' && (
        <div style={s.box}>
          <div style={s.boxTitulo}>Fila e bloqueios</div>
          <div style={{ fontSize: 14, marginBottom: 8 }}>
            Aptos pra digitação automática: <strong>{resumo?.fila_apto ?? '—'}</strong> · Protocolos gerados (total): <strong>{resumo?.protocolos_total ?? '—'}</strong> · Últimos 7 dias: <strong>{conf.producao_7d ?? 0}</strong> digitadas
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Bloqueados por motivo:</div>
          {resumo?.bloqueados_por_motivo && Object.keys(resumo.bloqueados_por_motivo).length > 0
            ? Object.entries(resumo.bloqueados_por_motivo).sort((a, b) => b[1] - a[1]).map(([m, q]) => (
                <div key={m} style={{ fontSize: 13, padding: '4px 0', borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}>
                  <strong>{q}</strong> — {m}
                </div>
              ))
            : <div style={{ color: '#8b9bb4', fontSize: 13 }}>Nenhum bloqueado agora.</div>}
        </div>
      )}
    </div>
  )
}
