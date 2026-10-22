// ============================================================================
// MINHA MESA — RETROATIVO   (antigo "Revisão IA — Retroativo")
// 22/10/2026 (Bruno) — REDESENHO COMPLETO DA TELA.
//
// POR QUE: medido em 22/10, dos 2.168 leads entregues ao vendedor, 2.043 (94%)
// nunca receberam UM clique de registro, e só 9 tinham observação escrita. A RPC
// retroativo_vendedor_marcar existe desde 19/10 e funciona — o que faltava era
// uma tela que fizesse o vendedor usá-la. A tela antiga tinha 2.306 linhas, 19
// RPCs, kanban, painel do dia, conferência do funil e fechamento: o vendedor
// abria, olhava e fechava sem marcar nada.
//
// COMO FUNCIONA HOJE (Bruno, 21/10): a máquina simula a listagem, o lead passa
// no GERID, os pré-aprovados o advogado confirma, e aí vai pro vendedor, que
// liga pra um lead FRIO — a cliente NÃO sabe que tem direito e nunca procurou a
// KR. Não existe mais tráfego, não existe KR Chat, não existe mensagem
// automática. A tela serve pra UMA coisa: o vendedor recebe o lead do dia, fala
// com a cliente e registra o que aconteceu.
//
// O QUE SAIU (tudo isso existia e não servia mais a esse fluxo):
//   - board kanban de 11 colunas          - painel do dia / distribuição
//   - conferência do funil (PromoBank)    - fechamento do dia
//   - filtros de entrada/atividade/entrega- auto-refresh do Chatwoot (8s)
//   - leitura de conversa do Chatwoot     - aprovar/reprovar CNIS (é da advogada)
//
// O QUE ENTROU:
//   - FILA: um cliente por vez, com o próximo entrando sozinho ao marcar
//   - mensagem de abordagem pronta, com botão que já abre o WhatsApp escrito
//   - as 4 ações do RPC em botões grandes, com observação inline (sem prompt())
//   - progresso do dia e tempo de espera por cliente
//
// DESIGN: esta é a primeira tela do CRM a importar ../lib/tema. Antes só o
// Layout.js usava — por isso a sidebar era bonita e o miolo parecia outro
// sistema. Toda cor, raio, sombra e fonte daqui vem do tema.
// ============================================================================

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { cores, sombras, raio, fonte, ui } from '../lib/tema'

// ===== BOARD =====
// 21/10 — mae_board6 = a mae_board4 por dentro, com DOIS cortes: só
// cnis_aprovado='true' (o que a advogada liberou) e só os últimos N dias
// (app_config.retroativo_board_dias, hoje 15). Medido em 21/10: mae_board4 =
// 19.736 linhas / 21 idas / 14s; mae_board6 = 145 linhas / 1 ida / 627ms.
// A mae_board4 segue intacta no banco — reverter = trocar o nome aqui.
const RPC_BOARD = 'mae_board6'
const PAGINA_BOARD = 1000
const MAX_PAGINAS = 25

// Colunas que contam como lead VIVO na mão do vendedor. Fechou (assinatura /
// finalizado) sai da fila e vira número no placar.
const COLUNAS_ATIVAS = ['PITCH_LIBERADO', 'CAD_ENDERECO', 'CAD_RG', 'CAD_COMPROVANTE', 'CAD_FINAL']

// 19/10 — a VENDA vem da tabela clientes, não da coluna do board. Medido: das
// 370 vendas fechadas, só 176 tinham o lead em FINALIZADO; as outras 194 foram
// digitadas no Novo Cliente, que cria o cliente e não mexe no estado do lead.
const CLIENTE_FECHADO = ['validado', 'entregue', 'assinado']

// ===== PERMISSÃO (copiado da tela antiga, sem alteração de regra) =====
// Operações LICENCIADAS: o usuário só enxerga leads da própria operação.
const OPERACAO_USUARIOS = {
  '72fa4914-e8de-4c0c-a954-b05241e9d1bd': 'ronaldo', // Thamires (supervisora)
  '8bff997b-e43f-4b65-bafc-b4e7e704b14b': 'ronaldo', // Brenda
  '3a9c1779-2008-4aaa-9cfb-e64336b9207a': 'ronaldo', // Tamy
  'ed181784-484b-4ad9-9e8c-4f35b1279940': 'ronaldo', // Kisse
  '7085f131-b2db-4b96-a4db-2a1e2a5bf6f6': 'ronaldo', // Kayllaine
  'cf6444f5-7e03-4cc7-9442-9b0cb963695a': 'leandro', // Isabelle (supervisora)
  '5d8cf47f-47e8-4d15-a4b8-48308d4b0840': 'leandro', // Rafaelle
  '977a4664-eb04-4a51-84ab-b61449720dc2': 'leandro', // Sara
}
const SUPERVISORAS_OPERACAO = [
  '72fa4914-e8de-4c0c-a954-b05241e9d1bd', // Thamires (Ronaldo)
  'cf6444f5-7e03-4cc7-9442-9b0cb963695a', // Isabelle (Leandro)
]

// Retroativo = dois times por faixa. A supervisora NÃO recebe lead: ela olha o
// time. Entra na própria lista porque pode ter lead antigo na mão.
const SUPERVISORAS_TIME = {
  // Agatha Barreto — time 12 meses
  '0a5958b9-d43b-4bac-a01d-af60247dd721': [
    '9fbda3fe-22aa-4179-b1a7-005e99660c8d', // Duda
    'bb85a0f3-2d79-499e-8b19-6219bd0cef56', // Gislaine
    '4a1db9e1-0b10-48bc-85d6-23b728b9fd4f', // Luciane
    'a1d7dbfb-bc0d-46a3-b523-bfdc15aac0c9', // Leticia
    'be98f268-314f-4114-acc3-7bb9ce7635fd', // Maryana Kodos
    '4bf01e58-2d1e-417a-878b-786094f1ad01', // Fernanda (femalves)
    '0a5958b9-d43b-4bac-a01d-af60247dd721', // a própria Agatha
  ],
}

// ===== HELPERS =====
function soDigitos(v) { return String(v || '').replace(/\D/g, '') }

function primeiroNome(n) {
  const p = String(n || '').trim().split(/\s+/)[0] || ''
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : ''
}

// "MARIA APARECIDA DA SILVA" -> "Maria Aparecida da Silva"
function nomeBonito(n) {
  const minusculas = ['da', 'de', 'do', 'das', 'dos', 'e']
  return String(n || '').trim().toLowerCase().split(/\s+/)
    .map((p, i) => (i > 0 && minusculas.includes(p)) ? p : p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

function fmtTel(t) {
  const d = soDigitos(t).replace(/^55/, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return t || '—'
}

function fmtCPF(c) {
  const d = soDigitos(c)
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : (c || '—')
}

function fmtData(v) {
  if (!v) return ''
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(String(v))) return v
  const d = new Date(v)
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('pt-BR')
}

// "3 dias", "5h", "40 min" — quanto tempo essa cliente está esperando.
function fmtEspera(min) {
  if (min == null) return ''
  if (min < 60) return `${min} min`
  if (min < 1440) return `${Math.floor(min / 60)}h`
  const d = Math.floor(min / 1440)
  return `${d} ${d === 1 ? 'dia' : 'dias'}`
}

function diasDesde(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

function ehHoje(iso) { return diasDesde(iso) === 0 }

// ===== O VÍNCULO QUE DEU O DIREITO =====
// vinculo_direito vem do GERID (public.gerid_vinculo_decisivo). É o argumento
// da ligação: a cliente não sabe que tem direito, o vendedor precisa chegar
// sabendo onde ela trabalhou e quando.
// Estrutura real conferida no banco em 22/10 (public.gerid_vinculo_decisivo):
// { fim, tipo, regra, inicio, empresa, filho_dn, filho_nome, eh_beneficio,
//   dn_aproximada, total_vinculos, filhos_no_gerid, meses_antes_do_parto }
function lerVinculo(v) {
  if (!v) return null
  const d = Array.isArray(v) ? v[0] : v
  if (!d || typeof d !== 'object') return null
  const tipo = String(d.tipo || '')
  return {
    empresa: String(d.empresa || '').trim() || null,
    // o próprio GERID já classifica — não adivinhar por regex o que vem pronto
    ehBeneficio: d.eh_beneficio === true,
    tipo: /domest/i.test(tipo) ? 'Empregada doméstica'
      : /empregad/i.test(tipo) ? 'Empregada'
      : /facultativ/i.test(tipo) ? 'Facultativa'
      : /individual|mei|aut/i.test(tipo) ? 'Contribuinte individual'
      : (tipo || null),
    inicio: d.inicio || null,
    fim: d.fim || null,
    meses: d.meses_antes_do_parto,
    filhoDn: d.filho_dn || null,
    // 22/10 — data de parto APROXIMADA (o GERID não achou o dia exato). O
    // vendedor NÃO pode afirmar a data na ligação: se ele erra o dia, a cliente
    // desconfia e a ligação morre. Por isso vira aviso na tela e sai da mensagem.
    dnAproximada: d.dn_aproximada === true,
    // 22/10 — o campo existe e o gerid_texto_venda já lê, mas a extensão do
    // GERID ainda não grava: medido em 22/10, 1 de 13.858 consultas em 15 dias.
    // Fica lido aqui pra que, no dia em que a extensão gravar, a mensagem de
    // abordagem passe a usar o nome da criança sozinha, sem mexer nesta tela.
    filhoNome: String(d.filho_nome || '').trim() || null,
  }
}

// ===== MENSAGEM DE ABORDAGEM =====
// 22/10 (Bruno) — o atendimento é 100% WhatsApp e o vendedor precisa de um
// texto pronto pra copiar, não de um campo a mais pra ler.
// Ordem de preferência do "com quem eu quero falar":
//   1. nome da criança  (ideal — hoje só 1 lead em 2.168 tem; ver nota acima)
//   2. nome da mãe      (83% dos leads)
//   3. data do parto    (100% — ninguém fica sem mensagem)
function montarAbordagem(lead, vinc) {
  const filho = vinc?.filhoNome
  if (filho) return `Olá, tudo bem?\n\nGostaria de falar com a responsável do ${nomeBonito(filho)}?`
  const mae = nomeBonito(lead?.nome || '')
  if (mae) return `Olá, tudo bem?\n\nGostaria de falar com a ${mae}?`
  // Só cita a data quando o GERID achou o dia EXATO. Data aproximada na
  // mensagem queima a ligação: a cliente vê o dia errado e desconfia.
  const dn = vinc?.dnAproximada ? null : fmtData(vinc?.filhoDn || lead?.data_nascimento_filho)
  if (dn) return `Olá, tudo bem?\n\nGostaria de falar com a mãe do bebê que nasceu em ${dn}?`
  return 'Olá, tudo bem?\n\nGostaria de falar com a responsável pela família?'
}

// wa.me já com o texto escrito: 1 clique em vez de copiar, trocar de aba, colar.
function linkWhats(tel, texto) {
  const d = soDigitos(tel)
  if (!d) return null
  const num = d.startsWith('55') ? d : `55${d}`
  return `https://wa.me/${num}?text=${encodeURIComponent(texto)}`
}

// ===== AS 4 AÇÕES =====
// Espelham exatamente o que retroativo_vendedor_marcar aceita. Não invente ação
// aqui: a RPC rejeita o que não está nesta lista.
const ACOES = [
  { id: 'pegar', rotulo: 'Falei com ela', ajuda: 'Consegui contato — segue na minha mão', cor: cores.ok, icone: '✓' },
  { id: 'sem_resposta', rotulo: 'Não respondeu', ajuda: 'Conta uma tentativa e volta pra fila', cor: cores.alerta, icone: '↻' },
  { id: 'tel_errado', rotulo: 'Telefone errado', ajuda: 'Sai da minha mesa e vai pro resgate', cor: cores.roxo, icone: '📵' },
  { id: 'sem_direito', rotulo: 'Sem direito', ajuda: 'Tira da mesa — exige motivo', cor: cores.perigo, icone: '✕', exigeObs: true },
]

const ST = {
  contato: { rotulo: 'Em contato', cor: cores.ok },
  sem_resposta: { rotulo: 'Não respondeu', cor: cores.alerta },
  tel_errado: { rotulo: 'Telefone errado', cor: cores.roxo },
  sem_direito: { rotulo: 'Sem direito', cor: cores.perigo },
}

// ===== ESTILOS (100% derivados de ../lib/tema) =====
const s = {
  topo: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 },
  h1: { fontSize: 26, fontWeight: 800, color: cores.texto, letterSpacing: '-0.02em', fontFamily: fonte.familia },
  sub: { fontSize: 13, color: cores.suave, marginTop: 4 },

  placar: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  kpi: { ...ui.card, padding: '10px 16px', minWidth: 92 },
  kpiNum: { fontSize: 22, fontWeight: 800, color: cores.texto, lineHeight: 1, fontFamily: fonte.familia },
  kpiLab: { fontSize: 10.5, fontWeight: 600, color: cores.suave, textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 5 },

  barra: { height: 6, borderRadius: raio.pill, background: cores.chipBg, overflow: 'hidden', marginBottom: 20 },
  barraFill: { height: '100%', borderRadius: raio.pill, background: `linear-gradient(90deg, ${cores.azul}, ${cores.roxo})`, transition: 'width .4s ease' },

  palco: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 18, alignItems: 'start' },
  card: { ...ui.card, padding: 24, position: 'relative' },

  passo: { fontSize: 11, fontWeight: 700, color: cores.suave, letterSpacing: '.06em', textTransform: 'uppercase' },
  nome: { fontSize: 25, fontWeight: 800, color: cores.texto, letterSpacing: '-0.02em', margin: '10px 0 2px', lineHeight: 1.15 },
  linhaDados: { display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 },
  tel: { fontSize: 17, fontWeight: 700, color: cores.texto, fontFamily: fonte.mono },
  cpf: { fontSize: 12.5, color: cores.suave, fontFamily: fonte.mono },

  bloco: { marginTop: 18, borderRadius: raio.cartao, padding: 16, background: cores.chipBg, border: `1px solid ${cores.cardBorda}` },
  blocoTit: { fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: cores.suave, marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  dir1: { fontSize: 15, fontWeight: 700, color: cores.texto },
  dir2: { fontSize: 13, color: cores.suave, marginTop: 3, lineHeight: 1.5 },

  msgBox: { marginTop: 18, borderRadius: raio.cartao, border: `1.5px solid ${cores.azul}33`, background: `${cores.azul}0a`, padding: 16 },
  msgTexto: { fontSize: 14.5, color: cores.texto, lineHeight: 1.65, whiteSpace: 'pre-wrap', fontFamily: fonte.familia },
  btnCopiar: { fontSize: 11, fontWeight: 700, padding: '5px 11px', borderRadius: raio.botao, border: `1px solid ${cores.azul}44`, background: cores.card, color: cores.azul, cursor: 'pointer', fontFamily: 'inherit' },
  btnWhats: { ...ui.btnPrimario, width: '100%', marginTop: 12, padding: '13px 16px', fontSize: 14, display: 'block', textAlign: 'center', textDecoration: 'none', background: 'linear-gradient(135deg,#22c55e,#16a34a)', boxShadow: '0 4px 14px rgba(22,163,74,.35)' },

  pergunta: { fontSize: 12.5, fontWeight: 700, color: cores.texto, marginTop: 22, marginBottom: 10 },
  acoes: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 9 },
  acao: (cor) => ({
    padding: '13px 12px', borderRadius: raio.botao, cursor: 'pointer', textAlign: 'left',
    border: `1.5px solid ${cor}33`, background: `${cor}0d`, fontFamily: 'inherit', transition: 'all .15s',
  }),
  acaoTit: (cor) => ({ fontSize: 13, fontWeight: 700, color: cor }),
  acaoSub: { fontSize: 10.5, color: cores.suave, marginTop: 3, lineHeight: 1.35 },

  obsArea: { width: '100%', marginTop: 10, padding: 11, fontSize: 13, borderRadius: raio.botao, border: `1px solid ${cores.cardBorda}`, minHeight: 64, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' },

  vender: { ...ui.btnPrimario, width: '100%', marginTop: 14, padding: '14px 16px', fontSize: 14.5 },

  nav: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, gap: 10 },
  navBtn: { padding: '9px 16px', borderRadius: raio.botao, border: `1px solid ${cores.cardBorda}`, background: cores.card, color: cores.texto, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },

  lado: { ...ui.card, padding: 16, position: 'sticky', top: 16 },
  ladoTit: { fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: cores.suave, marginBottom: 11 },
  buscaInput: { width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: raio.botao, boxSizing: 'border-box', fontFamily: 'inherit' },
  mini: (ativo) => ({
    padding: '9px 11px', borderRadius: raio.botao, cursor: 'pointer', marginBottom: 6,
    border: `1px solid ${ativo ? cores.azul : cores.cardBorda}`,
    background: ativo ? `${cores.azul}0f` : cores.card, textAlign: 'left', width: '100%', fontFamily: 'inherit',
  }),
  miniNome: { fontSize: 12.5, fontWeight: 700, color: cores.texto, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  miniMeta: { fontSize: 10.5, color: cores.suave, marginTop: 2 },

  vazio: { ...ui.card, padding: 48, textAlign: 'center' },
  vazioTit: { fontSize: 19, fontWeight: 800, color: cores.texto, marginBottom: 6 },
  vazioSub: { fontSize: 13.5, color: cores.suave, lineHeight: 1.6 },

  select: { padding: '8px 11px', fontSize: 12.5, borderRadius: raio.botao, fontFamily: 'inherit' },
  toast: { position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', padding: '12px 22px', borderRadius: raio.botao, background: cores.texto, color: '#fff', fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: sombras.cardHover },
}

// ============================================================================
export default function RevisaoIARetroativo({ setPage }) {
  const { profile } = useAuth()
  const ehAdmin = profile?.role === 'admin' || profile?.role === 'supervisor_producao'

  const minhaOp = OPERACAO_USUARIOS[profile?.id] || null
  const souSupOperacao = SUPERVISORAS_OPERACAO.includes(profile?.id)
  const meuTime = SUPERVISORAS_TIME[profile?.id] || null
  const vejoMaisDeUm = ehAdmin || souSupOperacao || !!meuTime

  const [board, setBoard] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [i, setI] = useState(0)
  const [obs, setObs] = useState('')
  const [acaoAberta, setAcaoAberta] = useState(null)
  const [marcando, setMarcando] = useState(false)
  const [toast, setToast] = useState(null)
  const [busca, setBusca] = useState('')
  const [filtroAgente, setFiltroAgente] = useState('')
  const reqAtual = useRef(0)

  function avisar(t) { setToast(t); setTimeout(() => setToast(null), 2600) }

  // ===== CARREGAR =====
  const carregar = useCallback(async () => {
    if (!profile?.id) return
    const meuReq = ++reqAtual.current
    setCarregando(true)

    // Admin/supervisão pode olhar o de outro; vendedor vê só o próprio.
    const p_agente = vejoMaisDeUm ? (filtroAgente || null) : profile.id

    let todos = []
    for (let p = 0; p < MAX_PAGINAS; p++) {
      const de = p * PAGINA_BOARD
      const { data, error } = await supabase
        .rpc(RPC_BOARD, {
          p_agente,
          p_entrada_de: null, p_entrada_ate: null,
          p_ativ_de: null, p_ativ_ate: null,
          p_entrega_de: null, p_entrega_ate: null,
        })
        .range(de, de + PAGINA_BOARD - 1)
      if (error || !data || data.length === 0) break
      todos = todos.concat(data)
      if (data.length < PAGINA_BOARD) break
    }

    // Descarta resposta atrasada (senão a lenta sobrescreve a rápida).
    if (meuReq !== reqAtual.current) return

    const visiveis = (todos || []).filter(l =>
      (!minhaOp || (l.operacao || 'kr') === minhaOp) &&
      (!meuTime || meuTime.includes(l.bf_agente_id)))

    setBoard(visiveis)
    setCarregando(false)
  }, [profile?.id, filtroAgente, vejoMaisDeUm, minhaOp, meuTime])

  useEffect(() => { carregar() }, [carregar])

  // Recarrega sozinho a cada 60s — sem Chatwoot, sem polling de conversa.
  useEffect(() => {
    const t = setInterval(carregar, 60000)
    return () => clearInterval(t)
  }, [carregar])

  // ===== A FILA =====
  // Quem o vendedor tem que chamar: lead vivo, sem venda fechada, que ele ainda
  // não encostou OU que não respondeu (volta pra fila). Ordem: quem espera há
  // mais tempo primeiro — é o que estava sumindo na tela antiga.
  const fila = useMemo(() => {
    const vivos = board.filter(l =>
      COLUNAS_ATIVAS.includes(l.coluna) &&
      !CLIENTE_FECHADO.includes(l.cliente_status) &&
      !['tel_errado', 'sem_direito'].includes(l.vend_status))
    const semToque = vivos.filter(l => !l.vend_status)
    const retomar = vivos.filter(l => l.vend_status === 'sem_resposta')
    const emContato = vivos.filter(l => l.vend_status === 'contato')
    const porEspera = (a, b) => (b.minutos_parado || 0) - (a.minutos_parado || 0)
    return [...semToque.sort(porEspera), ...retomar.sort(porEspera), ...emContato.sort(porEspera)]
  }, [board])

  const achados = useMemo(() => {
    const q = busca.trim()
    if (q.length < 3) return null
    const d = soDigitos(q)
    return board.filter(l =>
      (d && (soDigitos(l.cpf).includes(d) || soDigitos(l.tel).includes(d))) ||
      (!d && String(l.nome || '').toLowerCase().includes(q.toLowerCase()))
    ).slice(0, 25)
  }, [busca, board])

  const lista = achados || fila
  const lead = lista[Math.min(i, Math.max(0, lista.length - 1))] || null
  const vinc = useMemo(() => lerVinculo(lead?.vinculo_direito), [lead])
  const abordagem = useMemo(() => lead ? montarAbordagem(lead, vinc) : '', [lead, vinc])

  useEffect(() => { setI(0); setObs(''); setAcaoAberta(null) }, [busca, filtroAgente])

  // ===== PLACAR DO DIA =====
  const placar = useMemo(() => {
    const vivos = board.filter(l => COLUNAS_ATIVAS.includes(l.coluna))
    return {
      fila: fila.length,
      falados: board.filter(l => l.vend_status === 'contato').length,
      hoje: board.filter(l => ehHoje(l.vend_contato_em)).length,
      vendas: board.filter(l => CLIENTE_FECHADO.includes(l.cliente_status) && ehHoje(l.cliente_em)).length,
      novos: vivos.filter(l => ehHoje(l.entregue_vendedora_em)).length,
    }
  }, [board, fila])

  const totalDia = placar.novos || fila.length + placar.hoje
  const pct = totalDia > 0 ? Math.min(100, Math.round((placar.hoje / totalDia) * 100)) : 0

  const agentes = useMemo(() => {
    const m = new Map()
    board.forEach(l => { if (l.bf_agente_id && l.agente_nome) m.set(l.bf_agente_id, l.agente_nome) })
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [board])

  // ===== AÇÕES =====
  async function marcar(acaoId) {
    if (!lead || marcando) return
    const acao = ACOES.find(a => a.id === acaoId)
    if (acao?.exigeObs && !obs.trim()) { avisar('Escreva o motivo antes de tirar da mesa'); return }

    setMarcando(true)
    const { data, error } = await supabase.rpc('retroativo_vendedor_marcar', {
      p_lead_id: lead.id, p_acao: acaoId, p_obs: obs.trim() || null,
    })
    setMarcando(false)

    if (error || !data?.ok) { avisar('Não gravou: ' + (error?.message || data?.erro || 'erro')); return }

    avisar(`${primeiroNome(lead.nome)} · ${acao?.rotulo?.toLowerCase()}`)
    setObs(''); setAcaoAberta(null)

    // Tira da lista na hora e já mostra o próximo (sem esperar o recarregamento).
    setBoard(b => b.map(x => x.id === lead.id
      ? { ...x, vend_status: data.status, vend_obs: obs.trim() || x.vend_obs, vend_contato_em: x.vend_contato_em || new Date().toISOString() }
      : x))
    carregar()
  }

  function copiar() {
    navigator.clipboard?.writeText(abordagem)
      .then(() => avisar('Mensagem copiada'))
      .catch(() => avisar('Não consegui copiar — selecione o texto'))
  }

  // 22/10 — o botão "Vender" leva pro Novo Cliente com o CPF já na mão.
  // setPage vem do App.js. Enquanto o App não passar a prop, o botão copia o
  // CPF e avisa — a tela funciona dos dois jeitos, sem quebrar.
  function vender() {
    if (!lead) return
    try { window.localStorage.setItem('kr_venda_cpf', soDigitos(lead.cpf)) } catch (_) {}
    if (typeof setPage === 'function') { setPage('novo_cliente'); return }
    navigator.clipboard?.writeText(fmtCPF(lead.cpf))
    avisar('CPF copiado — abra "Novo cliente (digitar)"')
  }

  // ===== RENDER =====
  return (
    <div style={{ fontFamily: fonte.familia }}>
      <div style={s.topo}>
        <div>
          <div style={s.h1}>Minha mesa</div>
          <div style={s.sub}>
            {carregando ? 'Carregando suas clientes…'
              : fila.length === 0 ? 'Nenhuma cliente esperando você agora.'
              : `${fila.length} ${fila.length === 1 ? 'cliente esperando' : 'clientes esperando'} o seu contato.`}
          </div>
        </div>
        <div style={s.placar}>
          <div style={s.kpi}><div style={s.kpiNum}>{placar.fila}</div><div style={s.kpiLab}>Na fila</div></div>
          <div style={s.kpi}><div style={{ ...s.kpiNum, color: cores.ok }}>{placar.hoje}</div><div style={s.kpiLab}>Falei hoje</div></div>
          <div style={s.kpi}><div style={{ ...s.kpiNum, color: cores.azul }}>{placar.vendas}</div><div style={s.kpiLab}>Vendas hoje</div></div>
        </div>
      </div>

      <div style={s.barra}><div style={{ ...s.barraFill, width: `${pct}%` }} /></div>

      <div style={s.palco}>
        {/* ===== PALCO: UMA CLIENTE POR VEZ ===== */}
        <div>
          {!lead ? (
            <div style={s.vazio}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>{carregando ? '⏳' : '🎉'}</div>
              <div style={s.vazioTit}>{carregando ? 'Carregando…' : achados ? 'Ninguém encontrado' : 'Fila zerada'}</div>
              <div style={s.vazioSub}>
                {carregando ? 'Buscando as clientes que a advogada liberou pra você.'
                  : achados ? 'Nenhuma cliente com esse CPF, telefone ou nome na sua mesa.'
                  : 'Você falou com todo mundo que estava esperando. Quando a advogada liberar mais, elas aparecem aqui sozinhas.'}
              </div>
            </div>
          ) : (
            <div style={s.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div style={s.passo}>{achados ? 'Resultado da busca' : `${Math.min(i + 1, lista.length)} de ${lista.length}`}</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {lead.vend_status && ST[lead.vend_status] && (
                    <span style={ui.pill(ST[lead.vend_status].cor)}>{ST[lead.vend_status].rotulo}</span>
                  )}
                  {lead.vend_tentativas > 0 && <span style={ui.pill(cores.alerta)}>{lead.vend_tentativas}ª tentativa</span>}
                  {lead.minutos_parado != null && (
                    <span style={ui.pill(lead.minutos_parado > 2880 ? cores.perigo : cores.suave)}>
                      esperando {fmtEspera(lead.minutos_parado)}
                    </span>
                  )}
                </div>
              </div>

              <div style={s.nome}>{nomeBonito(lead.nome) || 'Sem nome'}</div>
              <div style={s.linhaDados}>
                <span style={s.tel}>{fmtTel(lead.tel)}</span>
                <span style={s.cpf}>{fmtCPF(lead.cpf)}</span>
                {/* 22/10 — o selo "tem WhatsApp" saiu daqui de propósito: medido no
                    board, whats_tem vem nulo em 995 dos 996 leads ativos. Mostrar
                    ausência como "não tem" seria mentira; o vendedor clica no botão
                    verde e descobre em 1 segundo. */}
                {vejoMaisDeUm && lead.agente_nome && <span style={ui.pill(cores.roxo)}>{primeiroNome(lead.agente_nome)}</span>}
              </div>

              {/* POR QUE ELA TEM DIREITO — o argumento da ligação */}
              {(vinc || lead.data_nascimento_filho) && (
                <div style={s.bloco}>
                  <div style={s.blocoTit}><span>Por que ela tem direito</span></div>
                  <div style={s.dir1}>
                    👶 {vinc?.filhoNome ? `${nomeBonito(vinc.filhoNome)} · ` : ''}
                    nasceu em {fmtData(vinc?.filhoDn || lead.data_nascimento_filho)}
                  </div>
                  {vinc?.dnAproximada && (
                    <div style={{ ...s.dir2, color: cores.alerta, fontWeight: 600 }}>
                      ⚠️ Data aproximada — não afirme o dia na ligação, pergunte a ela.
                    </div>
                  )}
                  {vinc?.empresa && (
                    <div style={{ marginTop: 10 }}>
                      <div style={s.dir1}>{vinc.ehBeneficio ? '📄' : '🏢'} {vinc.empresa}</div>
                      <div style={s.dir2}>
                        {[vinc.tipo, vinc.inicio && vinc.fim ? `${vinc.inicio} a ${vinc.fim}` : vinc.fim ? `até ${vinc.fim}` : null,
                          vinc.meses === 0 ? 'saiu no mês do parto' : vinc.meses != null ? `saiu ${vinc.meses} ${vinc.meses === 1 ? 'mês' : 'meses'} antes do parto` : null]
                          .filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* O QUE ELE JÁ ANOTOU — sem isso a observação não serve pra nada */}
              {lead.vend_obs && (
                <div style={{ ...s.bloco, background: `${cores.alerta}0d`, border: `1px solid ${cores.alerta}33` }}>
                  <div style={s.blocoTit}><span>Da última vez você anotou</span></div>
                  <div style={{ fontSize: 13.5, color: cores.texto, lineHeight: 1.55 }}>{lead.vend_obs}</div>
                </div>
              )}

              {/* MENSAGEM PRONTA */}
              <div style={s.msgBox}>
                <div style={s.blocoTit}>
                  <span>Mande essa mensagem</span>
                  <button style={s.btnCopiar} onClick={copiar}>Copiar</button>
                </div>
                <div style={s.msgTexto}>{abordagem}</div>
                {linkWhats(lead.tel, abordagem) && (
                  <a style={s.btnWhats} href={linkWhats(lead.tel, abordagem)} target="_blank" rel="noreferrer">
                    Abrir o WhatsApp já com a mensagem escrita
                  </a>
                )}
              </div>

              {/* AÇÕES */}
              <div style={s.pergunta}>O que aconteceu?</div>
              <div style={s.acoes}>
                {ACOES.map(a => (
                  <button key={a.id} style={s.acao(a.cor)}
                    onClick={() => setAcaoAberta(acaoAberta === a.id ? null : a.id)}>
                    <div style={s.acaoTit(a.cor)}>{a.icone} {a.rotulo}</div>
                    <div style={s.acaoSub}>{a.ajuda}</div>
                  </button>
                ))}
              </div>

              {acaoAberta && (
                <div style={{ marginTop: 12 }}>
                  <textarea style={s.obsArea} value={obs} onChange={e => setObs(e.target.value)}
                    placeholder={ACOES.find(a => a.id === acaoAberta)?.exigeObs
                      ? 'Por que ela não tem direito? (obrigatório)'
                      : 'Anote o que ela disse — você lê isso na próxima ligação. Pode deixar vazio.'} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button style={{ ...ui.btnPrimario, flex: 1, opacity: marcando ? .6 : 1 }}
                      disabled={marcando} onClick={() => marcar(acaoAberta)}>
                      {marcando ? 'Gravando…' : `Confirmar: ${ACOES.find(a => a.id === acaoAberta)?.rotulo}`}
                    </button>
                    <button style={s.navBtn} onClick={() => { setAcaoAberta(null); setObs('') }}>Cancelar</button>
                  </div>
                </div>
              )}

              <button style={s.vender} onClick={vender}>Fechou! Cadastrar a venda</button>

              <div style={s.nav}>
                <button style={{ ...s.navBtn, opacity: i === 0 ? .4 : 1 }}
                  disabled={i === 0} onClick={() => { setI(n => Math.max(0, n - 1)); setObs(''); setAcaoAberta(null) }}>
                  ← Anterior
                </button>
                <span style={{ fontSize: 11.5, color: cores.suave }}>
                  {lead.entregue_vendedora_em && `recebida ${fmtData(lead.entregue_vendedora_em)}`}
                </span>
                <button style={{ ...s.navBtn, opacity: i >= lista.length - 1 ? .4 : 1 }}
                  disabled={i >= lista.length - 1} onClick={() => { setI(n => n + 1); setObs(''); setAcaoAberta(null) }}>
                  Pular por ora →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ===== LADO: BUSCA + PRÓXIMAS ===== */}
        <div style={s.lado}>
          {vejoMaisDeUm && agentes.length > 0 && (
            <>
              <div style={s.ladoTit}>Vendedor</div>
              <select style={{ ...s.select, width: '100%', marginBottom: 16 }}
                value={filtroAgente} onChange={e => setFiltroAgente(e.target.value)}>
                <option value="">Todos</option>
                {agentes.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
              </select>
            </>
          )}

          <div style={s.ladoTit}>Achar cliente</div>
          <input style={s.buscaInput} value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="CPF, telefone ou nome" />

          <div style={{ ...s.ladoTit, marginTop: 18 }}>
            {achados ? `${achados.length} encontradas` : `Próximas (${Math.max(0, fila.length - i - 1)})`}
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto', margin: '0 -4px', padding: '0 4px' }}>
            {lista.slice(achados ? 0 : i, (achados ? 0 : i) + 14).map((l, k) => {
              const idx = (achados ? 0 : i) + k
              return (
                <button key={l.id} style={s.mini(idx === i)} onClick={() => { setI(idx); setObs(''); setAcaoAberta(null) }}>
                  <div style={s.miniNome}>{nomeBonito(l.nome) || 'Sem nome'}</div>
                  <div style={s.miniMeta}>
                    {fmtTel(l.tel)}
                    {l.minutos_parado != null && ` · ${fmtEspera(l.minutos_parado)}`}
                    {l.vend_tentativas > 0 && ` · ${l.vend_tentativas}ª`}
                  </div>
                </button>
              )
            })}
            {lista.length === 0 && <div style={{ fontSize: 12, color: cores.suave, padding: '8px 2px' }}>Nada por aqui.</div>}
          </div>
        </div>
      </div>

      {toast && <div style={s.toast}>{toast}</div>}
    </div>
  )
}
