import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// ===== Revisão IA — Gestante (13/08) =====
// Board de gestantes (5+ meses e <5 juntas, com destaque 🤰). Colunas DERIVADAS do estado real
// (lead + contrato no CRM): o card muda de coluna sozinho — por isso NÃO tem arrastar aqui.
// Críticos (falha de emissão c/ motivo, link expirado, aguard. assinatura) são AUTO-ATRIBUÍDOS
// ao time e SEMPRE visíveis pra vendedora dona. Supervisora: Maryana (distribui e toma atendimento).

// Supervisao do funil gestante: veem o board inteiro, distribuem e tomam atendimento.
const IDS_SUPERVISOR_GESTANTE = [
  'be98f268-314f-4114-acc3-7bb9ce7635fd', // Maryana Kodos
  '6cc8ec02-4aac-4fc7-98f4-d2060f5a6732', // Leandro Enrico — 03/09: cuidando do setor
]

// Quem aparece no filtro por atendente. Leticia e Gislaine seguem aqui porque
// ainda sao donas de 279 e 278 leads, mesmo tendo saido da fila de distribuicao
// em 03/09 (so o Leandro recebe lead novo).
const TIME_GESTANTE = [
  'a1d7dbfb-bc0d-46a3-b523-bfdc15aac0c9', // Leticia
  'bb85a0f3-2d79-499e-8b19-6219bd0cef56', // Gislaine
  '6cc8ec02-4aac-4fc7-98f4-d2060f5a6732', // Leandro Enrico — 03/09
]

// SOMENTE Chatwoot novo (grupookr) — o board já filtra no banco; nada da VendeAI aqui.
const CHATWOOT_BASE = 'https://chat.grupookr.com.br'
const CHATWOOT_ACC = '1'
const linkChatwoot = (c) => c?.chatwoot_conversation_id
  ? `${CHATWOOT_BASE}/app/accounts/${CHATWOOT_ACC}/conversations/${c.chatwoot_conversation_id}` : null

// 03/09 — colunas REDESENHADAS na ordem real do funil, confirmada lendo as mensagens
// que a IA manda em cada sub_estado (maismae.mensagens) + o flag preco_aceito_em.
// Antes: 'Coletando cadastro' era uma coluna so, com 2.070 leads misturando o comeco
// (pedido de CEP) e o fim (cadastro completo) do funil.
// A ordem abaixo vem do banco, nao de suposicao:
//   PERGUNTANDO_NOME/ANALISE_MESES NAO pergunta nome — pergunta meses de gravidez.
//   EXPLICANDO/TURNO_2 e o pitch ("liberar mais de R$6 mil", "nao paga nada agora").
//   O aceite grava preco_aceito_em e a IA JA pede o CEP na mesma mensagem.
//   MESES_GRAVIDEZ e o FIM da coleta ("cadastro 100% completo"), nao o comeco.
// A quebra do CEP em duas colunas e o achado que muda a operacao: dos 914 parados
// no CEP, so 183 (20%) tinham aceitado a proposta. Os outros 731 travaram ANTES,
// na oferta — lead frio disfarcado de lead em cadastro.
const COLUNAS = [
  ['QUALIFICANDO', '🤰 Qualificando meses'],
  ['OFERTA', '💰 Na oferta'],
  ['FRIO', '❄️ Travou na oferta'],
  ['ENDERECO', '📍 Endereço'],
  ['RG_FRENTE', '🪪 RG frente'],
  ['RG_VERSO', '🪪 RG verso'],
  ['COMPROVANTE', '📄 Comprov. gravidez'],
  ['FECHAMENTO', '✅ Fechamento'],
  ['CADASTRO_COMPLETO', '📋 Cadastro completo'],
  ['PRECISA_HUMANO', '🙋 Precisa humano'],
  ['FALHA_EMISSAO', '🛑 FALHA na emissão'],
  ['AGUARD_ASSINATURA', '✍️ Aguard. assinatura'],
  ['LINK_EXPIRADO', '⏰ Link EXPIRADO'],
  ['ASSINADO', '✅ Assinados'],
  ['PERDIDO', '❌ Perdidos'],
  ['OUTROS', '❓ Outros'],
]
const COLUNAS_CRITICAS = ['FALHA_EMISSAO', 'AGUARD_ASSINATURA', 'LINK_EXPIRADO', 'PRECISA_HUMANO']

const CORES = {
  vermelho: { border: '1px solid #f87171', background: 'rgba(248,113,113,.14)' },
  amarelo: { border: '1px solid #fbbf24', background: 'rgba(251,191,36,.12)' },
  verde: { border: '0.5px solid #3B6D1140', background: 'rgba(52,211,153,.14)' },
  normal: { border: '0.5px solid rgba(15,23,42,0.08)', background: '#ffffff' },
}

const s = {
  title: { fontSize: 20, fontWeight: 500, color: '#0f172a', marginBottom: 4 },
  sub: { fontSize: 13, color: '#5b6b84', marginBottom: 14 },
  topo: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 },
  chip: { padding: '6px 14px', fontSize: 13, fontWeight: 500, borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.11)', background: '#ffffff', color: '#5b6b84', cursor: 'pointer' },
  chipOn: { background: '#f87171', color: '#232a37', borderColor: '#f87171' },
  kpi: { fontSize: 13, color: '#5b6b84', padding: '6px 12px', background: 'rgba(96,165,250,.10)', borderRadius: 8 },
  board: { display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 16, alignItems: 'flex-start' },
  col: { minWidth: 235, maxWidth: 235, background: '#e2e8f0', borderRadius: 10, padding: 8, flexShrink: 0 },
  colTitulo: { fontSize: 12, fontWeight: 600, color: '#5b6b84', padding: '4px 6px 8px', display: 'flex', justifyContent: 'space-between' },
  card: { borderRadius: 8, padding: '8px 10px', marginBottom: 8, cursor: 'pointer' },
  cardNome: { fontSize: 13, fontWeight: 600, color: '#0f172a' },
  cardMeta: { fontSize: 11, color: '#5b6b84', marginTop: 2 },
  badge5: { fontSize: 10, background: 'rgba(244,114,182,.20)', color: '#db2777', borderRadius: 6, padding: '2px 7px', fontWeight: 800, display: 'inline-block' },
  badgeMenos5: { fontSize: 10, background: 'rgba(139,155,180,.16)', color: '#5b6b84', borderRadius: 6, padding: '2px 7px', fontWeight: 700, display: 'inline-block' },
  badgeIA: { fontSize: 10, background: 'rgba(96,165,250,.14)', color: '#2563eb', borderRadius: 6, padding: '2px 7px', fontWeight: 700, display: 'inline-block' },
  badgeHumano: { fontSize: 10, background: 'rgba(167,139,250,.18)', color: '#7c3aed', borderRadius: 6, padding: '2px 7px', fontWeight: 700, display: 'inline-block' },
  cardChat: { fontSize: 12, textDecoration: 'none', background: 'rgba(52,211,153,.14)', color: '#059669', borderRadius: 6, padding: '1px 7px', fontWeight: 700 },
  tagFalha: { fontSize: 10, background: 'rgba(248,113,113,.16)', color: '#dc2626', borderRadius: 6, padding: '3px 7px', marginTop: 4, fontWeight: 700 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 50, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '3vh 12px', overflowY: 'auto' },
  modal: { background: '#ffffff', borderRadius: 14, width: '100%', maxWidth: 620, padding: '1.25rem', maxHeight: '92vh', overflowY: 'auto' },
  ficha: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 13, background: '#f1f5f9', borderRadius: 10, padding: 12, marginBottom: 12 },
  msgs: { maxHeight: 200, overflowY: 'auto', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 10, padding: 10, marginBottom: 12, display: 'flex', flexDirection: 'column-reverse', gap: 6 },
  msgCliente: { alignSelf: 'flex-start', background: '#e2e8f0', borderRadius: '10px 10px 10px 2px', padding: '6px 10px', fontSize: 12, maxWidth: '85%' },
  msgAna: { alignSelf: 'flex-end', background: 'rgba(52,211,153,.14)', borderRadius: '10px 10px 2px 10px', padding: '6px 10px', fontSize: 12, maxWidth: '85%' },
  btnVerde: { display: 'block', textAlign: 'center', textDecoration: 'none', width: '100%', padding: 12, background: '#34d399', color: '#232a37', borderRadius: 10, fontSize: 14, fontWeight: 700, marginBottom: 10, boxSizing: 'border-box' },
  btn: { padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', background: '#60a5fa', color: '#232a37', marginRight: 6 },
  btnG: { padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: '0.5px solid rgba(15,23,42,0.11)', background: '#ffffff', color: '#5b6b84', marginRight: 6 },
}

// Faixa de datas a partir do preset (mesmo padrao das outras Revisoes IA)
function faixaData(preset, cDe, cAte) {
  const ini = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
  const hoje = ini(new Date())
  const amanha = new Date(hoje); amanha.setDate(amanha.getDate() + 1)
  if (preset === 'hoje') return { de: hoje, ate: amanha }
  if (preset === 'ontem') { const o = new Date(hoje); o.setDate(o.getDate() - 1); return { de: o, ate: hoje } }
  if (preset === '7d') { const d = new Date(hoje); d.setDate(d.getDate() - 6); return { de: d, ate: amanha } }
  if (preset === 'mes') { const d = new Date(hoje); d.setDate(d.getDate() - 29); return { de: d, ate: amanha } }
  if (preset === 'custom') {
    const de = cDe ? ini(cDe + 'T00:00:00') : null
    let ate = null
    if (cAte) { ate = ini(cAte + 'T00:00:00'); ate.setDate(ate.getDate() + 1) }
    return { de, ate }
  }
  return { de: null, ate: null }
}
const OPCOES_DATA = [['tudo', 'tudo'], ['hoje', 'hoje'], ['ontem', 'ontem'], ['7d', '7 dias'], ['mes', 'mês'], ['custom', 'personalizado']]

function fmtParado(min) {
  if (min == null) return '—'
  if (min < 60) return `${min} min`
  if (min < 1440) return `${Math.floor(min / 60)}h`
  return `${Math.floor(min / 1440)}d`
}

export default function RevisaoIAGestante() {
  const { profile } = useAuth()
  const ehSupervisor = profile?.role === 'admin' || IDS_SUPERVISOR_GESTANTE.includes(profile?.id)
  const [board, setBoard] = useState([])
  const [soVermelhos, setSoVermelhos] = useState(false)
  const [so5mais, setSo5mais] = useState(false)
  const [filtroEntrada, setFiltroEntrada] = useState('tudo')
  const [filtroAtividade, setFiltroAtividade] = useState('mes')
  const [entradaDe, setEntradaDe] = useState(''); const [entradaAte, setEntradaAte] = useState('')
  const [ativDe, setAtivDe] = useState(''); const [ativAte, setAtivAte] = useState('')
  const [filtroAgente, setFiltroAgente] = useState('')
  const [agentes, setAgentes] = useState([])
  const [lead, setLead] = useState(null)
  const [mensagens, setMensagens] = useState([])
  const [agindo, setAgindo] = useState(false)

  const carregar = useCallback(async () => {
    if (!profile?.id) return
    const fe = faixaData(filtroEntrada, entradaDe, entradaAte)
    const fa = faixaData(filtroAtividade, ativDe, ativAte)
    // gestante_board2: mesma funcao de antes + o campo `coluna2` (funil redesenhado).
    // A gestante_board antiga continua no banco, intacta — reverter = trocar o nome aqui.
    const { data } = await supabase.rpc('gestante_board2', {
      p_agente: ehSupervisor ? (filtroAgente || null) : profile.id,
      p_entrada_de: fe.de ? fe.de.toISOString() : null,
      p_entrada_ate: fe.ate ? fe.ate.toISOString() : null,
      p_ativ_de: fa.de ? fa.de.toISOString() : null,
      p_ativ_ate: fa.ate ? fa.ate.toISOString() : null,
    })
    setBoard(data || [])
  }, [profile, ehSupervisor, filtroAgente, filtroEntrada, filtroAtividade, entradaDe, entradaAte, ativDe, ativAte])

  useEffect(() => { carregar(); const t = setInterval(carregar, 45000); return () => clearInterval(t) }, [carregar])
  useEffect(() => {
    if (!ehSupervisor) return
    supabase.from('profiles').select('id, nome').in('id', TIME_GESTANTE).order('nome')
      .then(({ data }) => setAgentes(data || []))
  }, [ehSupervisor])

  const recarregarConversa = useCallback(async (l) => {
    if (!l?.chatwoot_conversation_id) { setMensagens([]); return }
    const { data: res } = await supabase.functions.invoke('bf-conversa', {
      body: { conversation_id: l.chatwoot_conversation_id, account_id: 1, limit: 12 },
    })
    if (res?.ok) setMensagens(res.mensagens || [])
  }, [])

  const abrirCard = async (l) => { setLead(l); setMensagens([]); recarregarConversa(l) }

  // conversa em tempo real: recarrega a cada 8s enquanto o modal estiver aberto
  useEffect(() => {
    if (!lead) return
    const t = setInterval(() => { recarregarConversa(lead) }, 8000)
    return () => clearInterval(t)
  }, [lead, recarregarConversa])

  const distribuir = async () => {
    // ATENCAO: aqui continua sendo `c.coluna` (nomes ANTIGOS) de proposito. Quem distribui
    // de verdade e a gestante_atribuir_agentes no banco, e ela usa gestante_coluna (v1) —
    // se essa contagem usasse coluna2 o numero no aviso mentiria sobre o que vai ser feito.
    // 'CADASTRO' (v1) hoje engloba tudo que na tela virou ❄️ Travou na oferta + 📍 Endereço
    // + RG + Comprovante + Fechamento + Cadastro completo.
    const semDono = board.filter(c => !c.bf_agente_id && ['CADASTRO', 'PRECISA_HUMANO', 'FALHA_EMISSAO', 'AGUARD_ASSINATURA'].includes(c.coluna)).length
    // 03/09: o aviso dizia "entre Leticia e Gislaine", fixo no texto. As duas sairam
    // da fila e hoje so o Leandro recebe — com o pool em uma pessoa, TUDO cai nele de
    // uma vez. O numero e o destino agora aparecem antes de confirmar.
    if (!window.confirm(`⚖️ Distribuir ${semDono} atendimento(s) SEM DONO (cadastros e críticos)?\n\n⚠️ Vão TODOS para quem está na fila de distribuição da gestante — hoje é uma pessoa só.\n\nAssinados, conversas com a IA e perdidos NÃO são distribuídos.\n\nTem certeza?`)) return
    const { data } = await supabase.rpc('gestante_atribuir_agentes')
    alert(data?.ok ? `✅ ${data.atribuidos} distribuídos no time` : (data?.erro || 'Erro'))
    carregar()
  }

  // Supervisora toma o atendimento pra ela (tira do vendedor)
  const puxarPraMim = async (l) => {
    if (!l) return
    setAgindo(true)
    await supabase.rpc('gestante_reatribuir', { p_lead_id: l.id, p_agente_id: profile.id })
    await supabase.rpc('bf_marcar_tratando', { p_lead_id: l.id, p_agente_id: profile.id })
    setAgindo(false)
    setLead({ ...l, bf_agente_id: profile.id, agente_nome: profile.nome, bf_em_tratamento: true })
    carregar()
  }

  // Supervisora distribui um caso pra alguem do time (triagem dos expirados)
  const redistribuir = async (l, agenteId) => {
    if (!l || !agenteId) return
    setAgindo(true)
    const { data } = await supabase.rpc('gestante_reatribuir', { p_lead_id: l.id, p_agente_id: agenteId })
    setAgindo(false)
    if (!data?.ok) { alert('Não foi: ' + (data?.erro || 'erro')); return }
    const ag = agentes.find(a => a.id === agenteId)
    setLead({ ...l, bf_agente_id: agenteId, agente_nome: ag?.nome || '' })
    carregar()
  }

  // Handoff IA<->humano — mesmos 2 gates do BF (flag + label), via edge bf-handoff
  const handoff = async (l, acao) => {
    if (!l) return
    setAgindo(true)
    const { data, error } = await supabase.functions.invoke('bf-handoff', {
      body: { lead_id: l.id, acao, agente_id: profile?.id },
    })
    setAgindo(false)
    if (error || !data?.ok) { alert('Erro: ' + (error?.message || data?.erro || 'falhou')); return }
    setLead({ ...l, ana_pausada: acao === 'assumir' })
    carregar()
  }

  // Vendedora: só travados (amarelo/vermelho), em tratamento, e SEMPRE os críticos dela
  let visiveis = soVermelhos ? board.filter(c => c.cor === 'vermelho') : board
  if (so5mais) visiveis = visiveis.filter(c => c.cinco_mais)
  if (!ehSupervisor) {
    visiveis = visiveis.filter(c => c.cor === 'vermelho' || c.cor === 'amarelo' || c.bf_em_tratamento || COLUNAS_CRITICAS.includes(c.coluna2))
  }
  const totalVermelhos = board.filter(c => c.cor === 'vermelho').length
  const criticos = board.filter(c => ['FALHA_EMISSAO', 'LINK_EXPIRADO', 'AGUARD_ASSINATURA'].includes(c.coluna2)).length
  const cincoMais = board.filter(c => c.cinco_mais).length

  return (
    <div>
      <div style={s.title}>🤰 Revisão IA — Gestante</div>
      <div style={s.sub}>
        {ehSupervisor
          ? 'Funil gestante na ordem real (5+ meses destacadas 🤰). Colunas mudam sozinhas conforme a IA avança. ❄️ Travou na oferta = ainda não aceitou a proposta.'
          : 'Seus atendimentos: quem TRAVOU (🟡 10min · 🔴 20min) e SEMPRE os críticos seus — falha de emissão, link expirado e aguardando assinatura.'}
      </div>

      <div style={s.topo}>
        <button style={{ ...s.chip, ...(soVermelhos ? s.chipOn : {}) }} onClick={() => setSoVermelhos(v => !v)}>
          🔴 Só vermelhos ({totalVermelhos})
        </button>
        <button style={{ ...s.chip, ...(so5mais ? { background: '#f472b6', color: '#232a37', borderColor: '#f472b6' } : {}) }} onClick={() => setSo5mais(v => !v)}>
          🤰 Só 5+ meses
        </button>
        <select style={s.chip} value={filtroEntrada} onChange={e => setFiltroEntrada(e.target.value)} title="Data de entrada do lead">
          {OPCOES_DATA.map(([v, l]) => <option key={v} value={v}>Entrada: {l}</option>)}
        </select>
        {filtroEntrada === 'custom' && (<>
          <input type="date" style={s.chip} value={entradaDe} onChange={e => setEntradaDe(e.target.value)} />
          <input type="date" style={s.chip} value={entradaAte} onChange={e => setEntradaAte(e.target.value)} />
        </>)}
        <select style={s.chip} value={filtroAtividade} onChange={e => setFiltroAtividade(e.target.value)} title="Última atividade">
          {OPCOES_DATA.map(([v, l]) => <option key={v} value={v}>Atividade: {l}</option>)}
        </select>
        {filtroAtividade === 'custom' && (<>
          <input type="date" style={s.chip} value={ativDe} onChange={e => setAtivDe(e.target.value)} />
          <input type="date" style={s.chip} value={ativAte} onChange={e => setAtivAte(e.target.value)} />
        </>)}
        <span style={s.kpi}>Total: <strong>{board.length}</strong></span>
        <span style={{ ...s.kpi, background: 'rgba(244,114,182,.12)', color: '#db2777' }}>🤰 5+ meses: <strong>{cincoMais}</strong></span>
        <span style={{ ...s.kpi, background: 'rgba(248,113,113,.12)', color: '#dc2626' }}>🚨 Críticos: <strong>{criticos}</strong></span>
        {ehSupervisor && (
          <>
            <select style={{ ...s.chip, cursor: 'pointer' }} value={filtroAgente} onChange={e => setFiltroAgente(e.target.value)}>
              <option value="">Todos os agentes</option>
              {agentes.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
            <button style={s.chip} onClick={distribuir}>⚖️ Distribuir sem dono</button>
          </>
        )}
        <button style={s.chip} onClick={carregar}>🔄 Atualizar</button>
      </div>

      <div style={s.board}>
        {COLUNAS.map(([key, label]) => {
          const cards = visiveis.filter(c => c.coluna2 === key)
          const critica = COLUNAS_CRITICAS.includes(key) && key !== 'PRECISA_HUMANO'
          if (key === 'OUTROS' && cards.length === 0) return null
          return (
            <div key={key} style={{ ...s.col, ...(critica ? { border: '2px solid #f87171' } : {}) }}>
              <div style={{ ...s.colTitulo, ...(critica ? { color: '#dc2626', fontWeight: 700 } : {}) }}>
                <span>{label}</span><span>{cards.length}</span>
              </div>
              {cards.map(c => (
                <div key={c.id} style={{ ...s.card, ...(CORES[c.cor] || CORES.normal) }} onClick={() => abrirCard(c)}>
                  <div style={s.cardNome}>{c.nome || 'Sem nome'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                    <span style={c.cinco_mais ? s.badge5 : s.badgeMenos5}>🤰 {c.meses != null ? `${c.meses}m` : '?'}{c.cinco_mais ? ' · 5+' : ''}</span>
                    <span style={c.ana_pausada ? s.badgeHumano : s.badgeIA}>{c.ana_pausada ? '🧑' : '🤖'}</span>
                    {c.chatwoot_conversation_id && (
                      <a href={linkChatwoot(c)} target="_blank" rel="noreferrer" draggable={false} onClick={e => e.stopPropagation()} style={s.cardChat}>💬</a>
                    )}
                  </div>
                  <div style={s.cardMeta}>
                    {c.cor === 'vermelho' ? '🔴 ' : c.cor === 'amarelo' ? '🟡 ' : ''}parada há {fmtParado(c.minutos_parado)}
                    {ehSupervisor && c.agente_nome ? ` · 👤 ${c.agente_nome}` : ''}
                  </div>
                  {key === 'FALHA_EMISSAO' && c.falha_motivo && <div style={s.tagFalha}>🛑 {c.falha_motivo}</div>}
                  {key === 'LINK_EXPIRADO' && <div style={s.tagFalha}>⏰ reemitir/reenviar link</div>}
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {lead && (
        <div style={s.overlay} onClick={() => setLead(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>{lead.nome || 'Sem nome'}</div>
            <div style={{ fontSize: 12, color: '#5b6b84', marginBottom: 10 }}>
              {(COLUNAS.find(c => c[0] === lead.coluna2) || [])[1] || lead.coluna2} · parada há {fmtParado(lead.minutos_parado)}
            </div>

            <div style={s.ficha}>
              <div>🤰 Gestação: <strong style={{ color: lead.cinco_mais ? '#db2777' : '#0f172a' }}>{lead.meses != null ? `${lead.meses} meses` : '—'}{lead.cinco_mais ? ' (5+)' : ''}</strong></div>
              <div>📞 {lead.tel || '—'}</div>
              <div>📄 Contrato: {lead.status_contrato || '—'}</div>
              <div>🕐 Emitido: {lead.emitido_em ? new Date(lead.emitido_em).toLocaleString('pt-BR') : '—'}</div>
              {ehSupervisor && <div>👤 {lead.agente_nome || 'sem dono'}</div>}
              <div>Etapa IA: {lead.estado || '—'}</div>
            </div>

            {lead.falha_motivo && (
              <div style={{ fontSize: 12, color: '#dc2626', background: 'rgba(248,113,113,.10)', borderRadius: 8, padding: 10, marginBottom: 10, fontWeight: 600 }}>
                🛑 Falha na emissão: {lead.falha_motivo}
              </div>
            )}
            {lead.link_assinatura && (
              <div style={{ fontSize: 12, background: '#f1f5f9', borderRadius: 8, padding: 10, marginBottom: 10, wordBreak: 'break-all' }}>
                🔗 Link de assinatura{lead.coluna2 === 'LINK_EXPIRADO' ? ' (EXPIRADO — precisa reemitir)' : ''}:<br />
                <a href={lead.link_assinatura} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>{lead.link_assinatura}</a>
              </div>
            )}

            <div style={{ background: lead.ana_pausada ? 'rgba(167,139,250,.10)' : 'rgba(96,165,250,.08)', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 10, padding: 10, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: lead.ana_pausada ? '#7c3aed' : '#2563eb' }}>
                  {lead.ana_pausada ? '🧑 Humano no controle — IA pausada' : '🤖 IA ativa (Ana respondendo)'}
                </span>
                {lead.ana_pausada ? (
                  <button style={s.btn} disabled={agindo} onClick={() => handoff(lead, 'devolver')}>🤖 Devolver pra IA</button>
                ) : (
                  <button style={{ ...s.btn, background: '#a78bfa' }} disabled={agindo} onClick={() => handoff(lead, 'assumir')}>✋ Assumir (pausar IA)</button>
                )}
              </div>
            </div>

            {linkChatwoot(lead)
              ? <a href={linkChatwoot(lead)} target="_blank" rel="noreferrer" style={s.btnVerde}>💬 Abrir conversa no Chatwoot</a>
              : <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 10 }}>Sem conversa no Chatwoot vinculada.</div>}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#5b6b84' }}>💬 Conversa <span style={{ color: '#059669', fontWeight: 500 }}>· atualiza sozinha</span></span>
              <button style={{ fontSize: 11, padding: '4px 10px', background: 'rgba(96,165,250,.10)', color: '#2563eb', border: '0.5px solid rgba(15,23,42,0.09)', borderRadius: 8, cursor: 'pointer' }}
                onClick={() => recarregarConversa(lead)}>🔄 Atualizar conversa</button>
            </div>
            <div style={s.msgs}>
              {mensagens.map((m, i) => (
                <div key={i} style={m.role === 'user' ? s.msgCliente : s.msgAna}>{m.content}</div>
              ))}
              {mensagens.length === 0 && <div style={{ fontSize: 12, color: '#64748b' }}>Sem mensagens.</div>}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ehSupervisor && lead.bf_agente_id !== profile.id && (
                <button style={{ ...s.btn, background: '#f472b6' }} disabled={agindo} onClick={() => puxarPraMim(lead)}>🙋 Puxar pra mim</button>
              )}
              {ehSupervisor && (
                <select style={{ padding: '8px 10px', borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.11)', background: '#f1f5f9', color: '#334155', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  value="" disabled={agindo} onChange={e => redistribuir(lead, e.target.value)}>
                  <option value="">↪ Distribuir para…</option>
                  {agentes.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </select>
              )}
              <button style={s.btnG} onClick={() => setLead(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
