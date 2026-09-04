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
  // 04/09 — semaforo de presenca no app: online agora (verde cheio), ate 1h (verde),
  // ate 20h (amarelo), acima disso (vermelho).
  appOnline: { fontSize: 10, background: '#34d399', color: '#0f172a', borderRadius: 6, padding: '2px 7px', fontWeight: 800, display: 'inline-block' },
  appVerde: { fontSize: 10, background: 'rgba(52,211,153,.20)', color: '#059669', borderRadius: 6, padding: '2px 7px', fontWeight: 700, display: 'inline-block' },
  appAmarelo: { fontSize: 10, background: 'rgba(251,191,36,.20)', color: '#b45309', borderRadius: 6, padding: '2px 7px', fontWeight: 700, display: 'inline-block' },
  appVermelho: { fontSize: 10, background: 'rgba(248,113,113,.16)', color: '#dc2626', borderRadius: 6, padding: '2px 7px', fontWeight: 700, display: 'inline-block' },
  cardChat: { fontSize: 12, textDecoration: 'none', background: 'rgba(52,211,153,.14)', color: '#059669', borderRadius: 6, padding: '1px 7px', fontWeight: 700 },
  tagFalha: { fontSize: 10, background: 'rgba(248,113,113,.16)', color: '#dc2626', borderRadius: 6, padding: '3px 7px', marginTop: 4, fontWeight: 700 },
  // Modal em 3 faixas: cabecalho fixo, miolo que rola, rodape de acoes fixo.
  // A conversa tem scroll PROPRIO dentro do miolo — antes ela era um bloco de 200px
  // no meio de uma pagina que rolava inteira, e a pessoa perdia o fio.
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 50, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '2vh 12px' },
  modal: { background: '#ffffff', borderRadius: 16, width: '100%', maxWidth: 660, maxHeight: '96vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(15,23,42,0.28)' },
  mHead: { padding: '14px 18px 12px', borderBottom: '0.5px solid rgba(15,23,42,0.10)', flexShrink: 0 },
  mHeadTopo: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  mNome: { fontSize: 17, fontWeight: 650, color: '#0f172a', lineHeight: 1.25 },
  mEtapa: { fontSize: 12, color: '#5b6b84', marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  mX: { flexShrink: 0, width: 30, height: 30, borderRadius: 8, border: 'none', background: '#f1f5f9', color: '#5b6b84', fontSize: 16, cursor: 'pointer', lineHeight: 1 },
  mCorpo: { padding: '12px 18px', overflowY: 'auto', flex: 1, minHeight: 0 },
  mFoot: { padding: '10px 18px 14px', borderTop: '0.5px solid rgba(15,23,42,0.10)', flexShrink: 0, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  pill: { fontSize: 11, fontWeight: 600, borderRadius: 999, padding: '3px 9px', background: '#f1f5f9', color: '#5b6b84', whiteSpace: 'nowrap' },
  ficha: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 },
  secTitulo: { fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  msgs: { height: '38vh', minHeight: 200, overflowY: 'auto', background: '#f8fafc', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 12, padding: 12, marginBottom: 12, display: 'flex', flexDirection: 'column-reverse', gap: 7 },
  msgCliente: { alignSelf: 'flex-start', background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.09)', borderRadius: '12px 12px 12px 3px', padding: '7px 11px', fontSize: 12.5, lineHeight: 1.45, maxWidth: '84%', color: '#0f172a', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  msgAna: { alignSelf: 'flex-end', background: 'rgba(52,211,153,.15)', borderRadius: '12px 12px 3px 12px', padding: '7px 11px', fontSize: 12.5, lineHeight: 1.45, maxWidth: '84%', color: '#0f172a', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  // comentario interno do time (nota privada do Chatwoot) — nao foi pra cliente
  msgNota: { alignSelf: 'center', width: '94%', background: 'rgba(251,191,36,.14)', border: '0.5px dashed #fbbf24', borderRadius: 10, padding: '7px 11px', fontSize: 12, lineHeight: 1.45, color: '#78350f', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  msgNotaTag: { fontSize: 10, fontWeight: 700, color: '#b45309', display: 'block', marginBottom: 2 },
  btnVerde: { display: 'block', textAlign: 'center', textDecoration: 'none', width: '100%', padding: 12, background: '#34d399', color: '#232a37', borderRadius: 10, fontSize: 14, fontWeight: 700, marginBottom: 10, boxSizing: 'border-box' },
  btn: { padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', background: '#60a5fa', color: '#232a37', marginRight: 6 },
  btnG: { padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: '0.5px solid rgba(15,23,42,0.11)', background: '#ffffff', color: '#5b6b84', marginRight: 6 },
  textarea: { width: '100%', minHeight: 84, padding: 10, fontSize: 13, borderRadius: 10, border: '0.5px solid rgba(15,23,42,0.18)', boxSizing: 'border-box', marginBottom: 8, fontFamily: 'inherit', resize: 'vertical' },
  btnEnviar: { width: '100%', padding: 12, background: '#34d399', color: '#232a37', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 6 },
  btnEnviarOff: { width: '100%', padding: 12, background: '#e2e8f0', color: '#94a3b8', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'not-allowed', marginBottom: 6 },
  avisoEnvio: { fontSize: 11, color: '#5b6b84', marginBottom: 12 },
  msgImg: { display: 'block', maxWidth: 150, maxHeight: 150, borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.11)', marginTop: 4, cursor: 'zoom-in' },
  msgArquivo: { display: 'inline-block', fontSize: 11, fontWeight: 700, textDecoration: 'none', color: '#2563eb', background: 'rgba(96,165,250,.12)', borderRadius: 6, padding: '5px 9px', marginTop: 4 },
  anexoSolto: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, paddingTop: 8, borderTop: '0.5px dashed rgba(15,23,42,0.14)' },
  anexoSoltoImg: { width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.11)' },
  lightbox: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, cursor: 'zoom-out' },
  lightboxImg: { maxWidth: '92vw', maxHeight: '92vh', borderRadius: 10 },
  // busca por cliente (mesmo padrao do Revisao IA Retroativo)
  buscaWrap: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' },
  buscaInput: { flex: '1 1 300px', maxWidth: 420, padding: '9px 12px', fontSize: 13, borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.18)', background: '#ffffff', color: '#0f172a', boxSizing: 'border-box' },
  buscaBtn: { padding: '9px 18px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', background: '#60a5fa', color: '#232a37', cursor: 'pointer' },
  buscaRes: { display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  buscaVazio: { fontSize: 13, color: '#5b6b84', padding: '10px 12px', background: '#f1f5f9', borderRadius: 10, marginBottom: 16 },
  buscaCard: { flex: '1 1 320px', maxWidth: 460, padding: 12, borderRadius: 10, background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.14)' },
  buscaTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 },
  buscaTag: { fontSize: 10, fontWeight: 700, color: '#2563eb', background: 'rgba(96,165,250,.14)', borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' },
  buscaComo: { fontSize: 10, color: '#94a3b8', marginTop: 6 },
  buscaAbrir: { marginTop: 8, width: '100%', padding: '8px 10px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: 'none', background: '#34d399', color: '#232a37', cursor: 'pointer' },
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

// 04/09 — PRESENÇA da cliente no PWA. Vem de public.pwa_visto (ultima atividade
// por telefone), alimentada pelo cron pwa-visto-refresh de MINUTO em minuto.
//
// Por que da pra escrever "online" e nao so "esteve no app":
// medido em 16.424 intervalos entre eventos consecutivos do mesmo telefone, com
// o app aberto a cliente gera evento a cada 1,1s (mediana) — 96% dos intervalos
// sao de ate 1 minuto e so 1,2% passam de 5 min. Entao atividade ha menos de
// 2 minutos significa app aberto AGORA, nao "esteve". Com o cron de 1 min, a
// defasagem maxima do dado e 1 minuto.
//
// Isso NAO e a conversa do Chatwoot. A cliente pode estar parada no chat ha 6h
// e com o app aberto agora — e exatamente essa a hora de chamar. Os dois tempos
// aparecem lado a lado no card e na ficha, cada um com seu rotulo.
const APP_ONLINE_MIN = 2      // ate 2 min = app aberto agora
const APP_VERDE_MIN = 60      // ate 1h = 🟢
const APP_AMARELO_MIN = 1200  // ate 20h = 🟡, acima disso 🔴

function fmtHa(min) {
  if (min < 60) return `${min} min`
  if (min < 1440) return `${Math.floor(min / 60)}h`
  return `${Math.floor(min / 1440)}d`
}

const ESTILOS_APP = { online: 'appOnline', verde: 'appVerde', amarelo: 'appAmarelo', vermelho: 'appVermelho' }

function seloApp(min) {
  if (min == null) return null   // nunca apareceu no app: sem selo
  if (min <= APP_ONLINE_MIN) return { texto: '🟢 online agora', nivel: 'online' }
  if (min <= APP_VERDE_MIN) return { texto: `🟢 online há ${fmtHa(min)}`, nivel: 'verde' }
  if (min <= APP_AMARELO_MIN) return { texto: `🟡 online há ${fmtHa(min)}`, nivel: 'amarelo' }
  return { texto: `🔴 online há ${fmtHa(min)}`, nivel: 'vermelho' }
}

export default function RevisaoIAGestante() {
  const { profile } = useAuth()
  const ehSupervisor = profile?.role === 'admin' || IDS_SUPERVISOR_GESTANTE.includes(profile?.id)
  const [board, setBoard] = useState([])
  const [soVermelhos, setSoVermelhos] = useState(false)
  const [so5mais, setSo5mais] = useState(false)
  const [soVivas, setSoVivas] = useState(false)
  const [filtroEntrada, setFiltroEntrada] = useState('tudo')
  const [filtroAtividade, setFiltroAtividade] = useState('mes')
  const [entradaDe, setEntradaDe] = useState(''); const [entradaAte, setEntradaAte] = useState('')
  const [ativDe, setAtivDe] = useState(''); const [ativAte, setAtivAte] = useState('')
  const [filtroAgente, setFiltroAgente] = useState('')
  const [agentes, setAgentes] = useState([])
  const [lead, setLead] = useState(null)
  const [mensagens, setMensagens] = useState([])
  const [agindo, setAgindo] = useState(false)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [anexos, setAnexos] = useState([])
  const [zoom, setZoom] = useState(null)
  const [carregandoConversa, setCarregandoConversa] = useState(false)
  const [conversaCompleta, setConversaCompleta] = useState(true)
  // Busca por CPF / telefone / nome. Igual ao Revisao IA Retroativo: a tela tem
  // filtro de entrada e de atividade, entao cliente antigo some do board e nao da
  // pra achar rolando. A busca IGNORA os filtros e varre o funil gestante inteiro.
  const [busca, setBusca] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [achados, setAchados] = useState(null)   // null = ainda nao buscou

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

  // 03/09 — a conversa vinha cortada em 12 mensagens porque era o que a tela pedia,
  // e o Chatwoot so devolve ~20 por requisicao. A edge ganhou dois parametros
  // OPCIONAIS (default off, pra nao mexer no BF/CLT/Retroativo):
  //   paginar       -> segue o cursor `before` ate juntar o limite pedido
  //   incluir_notas -> traz tambem as notas privadas (os comentarios do time)
  // `completa`:
  //   true  -> carga inicial e botao Atualizar: pagina o Chatwoot ate a conversa toda.
  //   false -> tick de 8s: UMA requisicao so, e faz merge com o que ja esta na tela.
  // Sem essa separacao o auto-refresh dispararia ate 12 chamadas ao Chatwoot a cada
  // 8 segundos por atendente com o card aberto — nao vale o preco.
  const recarregarConversa = useCallback(async (l, comLoading, completa) => {
    if (!l?.chatwoot_conversation_id) { setMensagens([]); setAnexos([]); return }
    if (comLoading) setCarregandoConversa(true)
    const { data: res } = await supabase.functions.invoke('bf-conversa', {
      body: {
        conversation_id: l.chatwoot_conversation_id, account_id: 1,
        limit: completa ? 200 : 30,
        paginar: !!completa,
        incluir_notas: true,   // os comentarios internos do time
      },
    })
    if (comLoading) setCarregandoConversa(false)
    if (!res?.ok) return
    const chave = (m) => `${m.created_at}|${m.role}|${m.content}`
    if (completa) {
      // a edge ja devolvia `anexos` (foto do RG, comprovante, audio) — o gestante so ignorava
      setMensagens(res.mensagens || [])
      setAnexos(res.anexos || [])
      setConversaCompleta(res.completo !== false)
    } else {
      setMensagens(ant => {
        const vistas = new Set(ant.map(chave))
        const novas = (res.mensagens || []).filter(m => !vistas.has(chave(m)))
        if (novas.length === 0) return ant
        return [...novas, ...ant].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      })
      setAnexos(ant => {
        const ids = new Set(ant.map(a => a.id ?? a.url))
        const novos = (res.anexos || []).filter(a => !ids.has(a.id ?? a.url))
        return novos.length ? [...ant, ...novos] : ant
      })
    }
  }, [])

  const abrirCard = async (l) => {
    setLead(l); setMensagens([]); setAnexos([]); setTexto(''); setConversaCompleta(true)
    recarregarConversa(l, true, true)
  }

  async function buscarCliente() {
    const termo = (busca || '').trim()
    const so_numeros = termo.replace(/\D/g, '')
    if (so_numeros.length < 8 && termo.length < 3) {
      alert('Digite o CPF, os 8 últimos dígitos do telefone, ou pelo menos 3 letras do nome.')
      return
    }
    setBuscando(true)
    const { data, error } = await supabase.rpc('gestante_buscar_lead', { p_termo: termo })
    setBuscando(false)
    if (error) { alert('Erro na busca: ' + error.message); return }
    setAchados(data || [])
  }
  const limparBusca = () => { setBusca(''); setAchados(null) }

  // 03/09 — responder a cliente direto daqui, sem abrir o Chatwoot.
  // Reusa a MESMA edge do Bolsa Familia (bf-disparar-mensagem). Ela ja e generica:
  // busca o lead por id em maismae.leads (sem filtro de funil), roteia pela conta de
  // chatwoot do proprio lead e, com `acao: null`, NAO mexe no sub_estado — o mapa de
  // acoes dela e so do BF. Nada foi alterado no banco nem na edge por causa disso.
  // Efeito colateral que e proposital: bf_disparar_patch_lead pausa a Ana no lead
  // assim que um humano manda mensagem. Por isso o aviso embaixo do campo.
  const enviarTexto = async () => {
    const t = (texto || '').trim()
    if (!lead || !t) return
    if (!lead.chatwoot_conversation_id) { alert('Este lead nao tem conversa no Chatwoot vinculada.'); return }
    setEnviando(true)
    const { data, error } = await supabase.functions.invoke('bf-disparar-mensagem', {
      body: { lead_id: lead.id, texto: t, agente_id: profile?.id, acao: null },
    })
    setEnviando(false)
    if (error || !data?.ok) { alert('Nao enviou: ' + (error?.message || data?.erro || 'falhou')); return }
    setTexto('')
    setLead(l => (l ? { ...l, ana_pausada: true, bf_em_tratamento: true } : l))
    recarregarConversa(lead, false, false)
    carregar()
  }

  // conversa em tempo real: recarrega a cada 8s enquanto o modal estiver aberto
  useEffect(() => {
    if (!lead) return
    const t = setInterval(() => { recarregarConversa(lead, false, false) }, 8000)
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
  // 04/09: "viva no app" = mexeu no PWA nas ultimas 3h. E o filtro que responde
  // "quem eu chamo agora": cliente parada no chat mas ativa no app e a mais quente.
  if (soVivas) visiveis = visiveis.filter(c => c.pwa_min != null && c.pwa_min <= APP_VERDE_MIN)
  if (!ehSupervisor) {
    visiveis = visiveis.filter(c => c.cor === 'vermelho' || c.cor === 'amarelo' || c.bf_em_tratamento || COLUNAS_CRITICAS.includes(c.coluna2))
  }
  const totalVermelhos = board.filter(c => c.cor === 'vermelho').length
  const criticos = board.filter(c => ['FALHA_EMISSAO', 'LINK_EXPIRADO', 'AGUARD_ASSINATURA'].includes(c.coluna2)).length
  const cincoMais = board.filter(c => c.cinco_mais).length
  const estiloApp = (sa) => s[ESTILOS_APP[sa.nivel]]
  const vivasAgora = board.filter(c => c.pwa_min != null && c.pwa_min <= APP_VERDE_MIN).length
  const onlineAgora = board.filter(c => c.pwa_min != null && c.pwa_min <= APP_ONLINE_MIN).length
  // o caso que o selo existe pra resolver: parada na conversa e com o app aberto
  const vivasEParadas = board.filter(c => c.pwa_min != null && c.pwa_min <= APP_VERDE_MIN && c.cor === 'vermelho').length

  // Anexos x mensagens: a edge devolve os dois em listas separadas, mas os dois
  // carimbam o MESMO created_at da mensagem original do Chatwoot — entao da pra
  // casar por timestamp e desenhar o arquivo dentro da bolha certa.
  const anexosPorMsg = new Map()
  for (const a of anexos) {
    if (!a?.criado_em) continue
    if (!anexosPorMsg.has(a.criado_em)) anexosPorMsg.set(a.criado_em, [])
    anexosPorMsg.get(a.criado_em).push(a)
  }
  // Sobra quem nao casou: anexo mais antigo que o corte de 12 mensagens, ou preso
  // numa mensagem que a edge descartou (privada / tipo diferente de 0 e 1).
  // Esses aparecem numa faixa embaixo em vez de sumir da tela.
  const horasNaTela = new Set(mensagens.map(m => m.created_at))
  const anexosSoltos = anexos.filter(a => !a?.criado_em || !horasNaTela.has(a.criado_em))

  const renderAnexo = (a, i) => (
    a.tipo === 'image'
      ? <img key={i} src={a.thumb || a.url} alt="anexo" style={s.msgImg} onClick={() => setZoom(a.url)} />
      : <a key={i} href={a.url} target="_blank" rel="noreferrer" style={s.msgArquivo} onClick={e => e.stopPropagation()}>
          {a.tipo === 'audio' ? '🎧 Áudio' : a.tipo === 'video' ? '🎬 Vídeo' : `📄 ${a.ext ? a.ext.toUpperCase() : 'Arquivo'}`} · abrir
        </a>
  )

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
        <button style={{ ...s.chip, ...(soVivas ? { background: '#34d399', color: '#0f172a', borderColor: '#34d399' } : {}) }}
          onClick={() => setSoVivas(v => !v)} title="Cliente com o app aberto agora ou na última hora">
          🟢 Online ({vivasAgora}){onlineAgora > 0 ? ` · ${onlineAgora} agora` : ''}
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
        {vivasEParadas > 0 && (
          <span style={{ ...s.kpi, background: 'rgba(52,211,153,.16)', color: '#059669' }} title="Não responde no chat, mas está online no app — é quem chamar primeiro">
            🟢 Online mas paradas: <strong>{vivasEParadas}</strong>
          </span>
        )}
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

      {/* Busca por cliente — mesmo padrao do Revisao IA Retroativo. Ignora os
          filtros de entrada/atividade e varre o funil gestante inteiro, porque
          cliente antigo simplesmente nao esta no board pra ser achado rolando. */}
      <div style={s.buscaWrap}>
        <input
          style={s.buscaInput}
          value={busca}
          placeholder="🔎 Achar cliente: CPF, telefone ou nome"
          onChange={e => setBusca(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') buscarCliente() }}
        />
        <button style={s.buscaBtn} onClick={buscarCliente} disabled={buscando}>
          {buscando ? 'Buscando…' : 'Buscar'}
        </button>
        {achados !== null && <button style={s.chip} onClick={limparBusca}>✕ limpar busca</button>}
      </div>

      {achados !== null && achados.length === 0 && (
        <div style={s.buscaVazio}>Nenhuma cliente do funil gestante com esse CPF, telefone ou nome.</div>
      )}
      {achados !== null && achados.length > 0 && (
        <div style={s.buscaRes}>
          {achados.map(c => (
            <div key={c.id} style={s.buscaCard}>
              <div style={s.buscaTopo}>
                <strong style={{ fontSize: 13, color: '#0f172a' }}>{c.nome || 'Sem nome'}</strong>
                <span style={s.buscaTag}>{(COLUNAS.find(x => x[0] === c.coluna2) || [])[1] || c.coluna2}</span>
              </div>
              <div style={{ fontSize: 12, color: '#5b6b84' }}>
                📞 {c.tel || '—'} · 🤰 {c.meses != null ? `${c.meses}m` : '?'}
                {c.agente_nome ? ` · 👤 ${c.agente_nome}` : ' · sem dono'}
              </div>
              <div style={{ fontSize: 11, color: '#5b6b84', marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span>💬 última msg há {fmtParado(c.minutos_parado)}</span>
                <span>· {c.ana_pausada ? '🧑 IA pausada' : '🤖 IA ativa'}</span>
                {(() => { const sa = seloApp(c.pwa_min); return sa
                  ? <span style={estiloApp(sa)}>{sa.texto}</span> : null })()}
              </div>
              <div style={s.buscaComo}>achou por {c.achou_por}</div>
              <button style={s.buscaAbrir} onClick={() => abrirCard(c)}>Abrir atendimento</button>
            </div>
          ))}
        </div>
      )}

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
                    {(() => { const sa = seloApp(c.pwa_min); return sa
                      ? <span style={estiloApp(sa)} title="Presença no app da cliente — não é a conversa">{sa.texto}</span>
                      : <span style={{ ...s.badgeMenos5, color: '#94a3b8' }} title="Nunca abriu o app">⚪ sem app</span> })()}
                  </div>
                  {/* os DOIS tempos, cada um com seu rotulo: a conversa e o app */}
                  <div style={s.cardMeta}>
                    💬 {c.cor === 'vermelho' ? '🔴 ' : c.cor === 'amarelo' ? '🟡 ' : ''}última msg há {fmtParado(c.minutos_parado)}
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
          <div style={s.mHead}>
            <div style={s.mHeadTopo}>
              <div>
                <div style={s.mNome}>{lead.nome || 'Sem nome'}</div>
                <div style={s.mEtapa}>
                  <span>{(COLUNAS.find(c => c[0] === lead.coluna2) || [])[1] || lead.coluna2}</span>
                  {/* os dois tempos, sempre juntos e rotulados: a conversa e o app */}
                  <span style={{ color: lead.cor === 'vermelho' ? '#dc2626' : lead.cor === 'amarelo' ? '#b45309' : '#5b6b84' }}>
                    💬 última msg há {fmtParado(lead.minutos_parado)}
                  </span>
                  {(() => { const sa = seloApp(lead.pwa_min); return sa
                    ? <span style={estiloApp(sa)}>{sa.texto}</span>
                    : <span style={{ ...s.badgeMenos5, color: '#94a3b8' }}>⚪ nunca abriu o app</span> })()}
                </div>
              </div>
              <button style={s.mX} onClick={() => setLead(null)} title="Fechar">✕</button>
            </div>
          </div>

          <div style={s.mCorpo}>
            <div style={s.ficha}>
              <span style={{ ...s.pill, ...(lead.cinco_mais ? { background: 'rgba(244,114,182,.16)', color: '#db2777' } : {}) }}>
                🤰 {lead.meses != null ? `${lead.meses} meses` : 'meses ?'}{lead.cinco_mais ? ' · 5+' : ''}
              </span>
              <span style={s.pill}>📞 {lead.tel || '—'}</span>
              <span style={s.pill}>📄 {lead.status_contrato || 'sem contrato'}</span>
              {lead.emitido_em && <span style={s.pill}>🕐 {new Date(lead.emitido_em).toLocaleString('pt-BR')}</span>}
              {ehSupervisor && <span style={s.pill}>👤 {lead.agente_nome || 'sem dono'}</span>}
              {/* presença no app repetida aqui na ficha, com o dado cru do lado —
                  o rodapé de tempo do cabeçalho some quando a pessoa rola o modal */}
              {(() => { const sa = seloApp(lead.pwa_min); return sa
                ? <span style={{ ...s.pill, ...estiloApp(sa), fontSize: 11, borderRadius: 999, padding: '3px 9px' }}>
                    {sa.nivel === 'online' ? '📱 app aberto agora' : `📱 app: ${fmtHa(lead.pwa_min)} atrás`}
                  </span>
                : <span style={{ ...s.pill, color: '#94a3b8' }}>📱 nunca abriu o app</span> })()}
              <span style={s.pill}>💬 última msg: {fmtParado(lead.minutos_parado)} atrás</span>
              <span style={{ ...s.pill, color: '#94a3b8' }}>IA: {lead.sub_estado || lead.estado || '—'}</span>
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

            <div style={s.secTitulo}>
              <span>
                💬 Conversa {mensagens.length > 0 && `· ${mensagens.length} mensagens`}
                {!conversaCompleta && <span style={{ color: '#b45309' }}> · só as mais recentes</span>}
              </span>
              <button style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', background: 'rgba(96,165,250,.10)', color: '#2563eb', border: '0.5px solid rgba(15,23,42,0.09)', borderRadius: 8, cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }}
                onClick={() => recarregarConversa(lead, true, true)} disabled={carregandoConversa}>
                {carregandoConversa ? 'Carregando…' : '🔄 Atualizar'}</button>
            </div>
            <div style={s.msgs}>
              {mensagens.map((m, i) => {
                const anx = anexosPorMsg.get(m.created_at) || []
                // quando a msg e so o marcador "📎 arquivo do cliente", o arquivo
                // ja diz tudo — o texto vira ruido e sai.
                const soMarcador = anx.length > 0 && /^📎 arquivo (do cliente|enviado)$/.test(m.content || '')
                // 'nota' = comentario interno escrito no Chatwoot; nao foi pra cliente
                if (m.role === 'nota') return (
                  <div key={i} style={s.msgNota}>
                    <span style={s.msgNotaTag}>📝 comentário interno{m.autor ? ` · ${m.autor}` : ''}</span>
                    {!soMarcador && m.content}
                    {anx.map(renderAnexo)}
                  </div>
                )
                return (
                  <div key={i} style={m.role === 'user' ? s.msgCliente : s.msgAna}>
                    {!soMarcador && m.content}
                    {anx.map(renderAnexo)}
                  </div>
                )
              })}
              {mensagens.length === 0 && (
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  {carregandoConversa ? 'Carregando a conversa…' : 'Sem mensagens.'}
                </div>
              )}
            </div>

            {anexosSoltos.length > 0 && (
              <div style={s.anexoSolto}>
                <div style={{ width: '100%', fontSize: 11, fontWeight: 700, color: '#5b6b84' }}>
                  📎 Outros arquivos da conversa ({anexosSoltos.length}) — fora das últimas mensagens
                </div>
                {anexosSoltos.map((a, i) => (
                  a.tipo === 'image'
                    ? <img key={i} src={a.thumb || a.url} alt="anexo" style={{ ...s.anexoSoltoImg, cursor: 'zoom-in' }} onClick={() => setZoom(a.url)} />
                    : <a key={i} href={a.url} target="_blank" rel="noreferrer" style={s.msgArquivo}>
                        {a.tipo === 'audio' ? '🎧 Áudio' : a.tipo === 'video' ? '🎬 Vídeo' : `📄 ${a.ext ? a.ext.toUpperCase() : 'Arquivo'}`} · abrir
                      </a>
                ))}
              </div>
            )}

            {/* 03/09 — responder daqui mesmo, igual ao Revisao IA Bolsa Familia.
                A mensagem sai pelo Chatwoot na conta do proprio lead. */}
            {lead.chatwoot_conversation_id ? (
              <>
                <textarea
                  style={s.textarea}
                  value={texto}
                  disabled={enviando}
                  placeholder="Escreve a resposta pra cliente… (sai pelo WhatsApp, via Chatwoot)"
                  onChange={e => setTexto(e.target.value)}
                />
                <button
                  style={(enviando || !texto.trim()) ? s.btnEnviarOff : s.btnEnviar}
                  disabled={enviando || !texto.trim()}
                  onClick={enviarTexto}
                >
                  {enviando ? 'Enviando…' : '📨 Enviar pra cliente'}
                </button>
                <div style={s.avisoEnvio}>
                  Ao enviar, a <strong>Ana pausa sozinha</strong> neste atendimento — ela não responde mais
                  até você clicar em <strong>🤖 Devolver pra IA</strong> lá em cima.
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: '#dc2626', background: 'rgba(248,113,113,.10)', borderRadius: 8, padding: 10, marginBottom: 12 }}>
                Sem conversa no Chatwoot vinculada — não dá pra responder por aqui.
              </div>
            )}

            {linkChatwoot(lead) && (
              <a href={linkChatwoot(lead)} target="_blank" rel="noreferrer"
                style={{ display: 'block', textAlign: 'center', textDecoration: 'none', padding: '9px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600, background: 'transparent', color: '#059669', border: '1px solid #34d399' }}>
                💬 Abrir no Chatwoot — pra mandar foto, áudio ou arquivo
              </a>
            )}
          </div>

          <div style={s.mFoot}>
            {ehSupervisor && lead.bf_agente_id !== profile.id && (
              <button style={{ ...s.btn, background: '#f472b6', marginRight: 0 }} disabled={agindo} onClick={() => puxarPraMim(lead)}>🙋 Puxar pra mim</button>
            )}
            {ehSupervisor && (
              <select style={{ padding: '8px 10px', borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.11)', background: '#f1f5f9', color: '#334155', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                value="" disabled={agindo} onChange={e => redistribuir(lead, e.target.value)}>
                <option value="">↪ Distribuir para…</option>
                {agentes.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            )}
            <button style={{ ...s.btnG, marginLeft: 'auto', marginRight: 0 }} onClick={() => setLead(null)}>Fechar</button>
          </div>
        </div>
      </div>
      )}

      {/* clicou na foto do RG/comprovante: abre em tamanho cheio, clique em qualquer lugar fecha */}
      {zoom && (
        <div style={s.lightbox} onClick={() => setZoom(null)}>
          <img src={zoom} alt="anexo" style={s.lightboxImg} onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
