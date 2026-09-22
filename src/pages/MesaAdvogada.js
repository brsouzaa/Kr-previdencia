import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// ===== MESA DA ADVOGADA — Retroativo (25/08) =====
// Regra do fluxo (Bruno): ninguem chega aqui sem ter passado pela conferencia PromoBank.
// A fila vem priorizada do banco (rpc mesa_advogada): pre-aprovado primeiro, e quem nao
// mandou CNIS so aparece depois de 20 min parada. A decisao dela e a oficial:
// PRE-APROVADO REAL vai pro vendedor; NEGADO encerra e a cliente e avisada no Chatwoot.
//
// 20/09 — DETETIVE. A rpc passou a devolver duas colunas novas:
//   do_detetive      : o lead nasceu de uma consulta do robo Detetive
//   filhos_elegiveis : datas dos filhos com MENOS de 5 anos (grau Filho; enteado fora),
//                      no formato "13/09/2024, 20/04/2022", do mais novo pro mais velho.
// Quem vem do Detetive tem a data de nascimento LIDA no orgao; o resto da mesa hoje veio
// de lista com data estimada. Por isso eles sobem no topo (a ordenacao e feita no banco)
// e ganham etiqueta e filtro proprios aqui.

const CHATWOOT_BASE = 'https://chat.grupookr.com.br'
const linkChat = (c) => c && c.chatwoot_conversation_id
  ? CHATWOOT_BASE + '/app/accounts/' + (c.chatwoot_account_id || 1) + '/conversations/' + c.chatwoot_conversation_id
  : null

const FILAS = {
  PRE_APROVADO:   { label: '🔥 Pré-aprovada pela máquina', cor: '#059669', bg: 'rgba(52,211,153,.14)' },
  CNIS_RECEBIDO:  { label: '📄 CNIS recebido', cor: '#2563eb', bg: 'rgba(96,165,250,.12)' },
  GERID:          { label: '🗂️ Fila GERID', cor: '#7c3aed', bg: 'rgba(167,139,250,.14)' },
  PEDIU_HUMANO:   { label: '🙋 Pediu humano', cor: '#b45309', bg: 'rgba(251,191,36,.12)' },
  SEM_CNIS_20MIN: { label: '⏰ Sem CNIS há 20min+', cor: '#5b6b84', bg: 'rgba(15,23,42,.04)' },
  // 16/09: a RPC mesa_advogada devolve esta fila desde 25/08 e o front nunca soube dela.
  // Resultado: os cards caiam no fallback e apareciam rotulados como '⏰ Sem CNIS há 20min+',
  // e o chip dela nao existia (contagem sumia). Hoje 191 dos 191 da mesa sao desta fila —
  // 87 deles sem conversa no Chatwoot (vieram do site).
  QUALIFICADO_SEM_CNIS: { label: '🌐 Qualificada, sem CNIS', cor: '#0891b2', bg: 'rgba(34,211,238,.12)' },
}
const ORDEM_FILAS = ['PRE_APROVADO', 'CNIS_RECEBIDO', 'GERID', 'PEDIU_HUMANO', 'QUALIFICADO_SEM_CNIS', 'SEM_CNIS_20MIN']

const DETETIVE_COR = '#4f46e5'
const DETETIVE_BG  = 'rgba(99,102,241,.12)'

// 21/09 — VALIDADOR DE WHATSAPP.
// whats_tem vem da rpc como 'true' / 'false' / null.
//   'true'  -> o numero tem WhatsApp
//   'false' -> NAO tem
//   null    -> NAO FOI VERIFICADO — que e coisa diferente de "nao tem".
//              Uma e resposta, a outra e falta de resposta. Nunca tratar igual.
//
// A mesa lista quem ainda NAO foi decidido, e o robo do validador so enfileira
// quando a advogada aprova (cnis_aprovado vira 'true'). Os dois conjuntos nao se
// cruzam — por isso a fila chega aqui 100% "nao verificado", e isso NAO e bug.
// Quem preenche esse buraco e o botao "Verificar" de cada card (ver abaixo).
const WHATS = {
  tem:  { chave: 'tem',  label: '✅ Tem WhatsApp',   cor: '#059669', bg: 'rgba(5,150,105,.12)' },
  nao:  { chave: 'nao',  label: '❌ Sem WhatsApp',   cor: '#dc2626', bg: 'rgba(220,38,38,.10)' },
  nver: { chave: 'nver', label: '⏳ Não verificado', cor: '#5b6b84', bg: 'rgba(15,23,42,.05)' },
}
// normaliza o que vem do banco pra uma das 3 chaves acima
const chaveWhats = (v) => (v === 'true' ? 'tem' : v === 'false' ? 'nao' : 'nver')

// 21/09 — VERIFICACAO SOB DEMANDA. Botao MANUAL, nunca automatico.
// Medido em 21/09: o chip haru4 e UNICO, teto 120 consultas/dia, e as 11h ja
// tinham 76 gastas. A advogada abre ~180 leads/dia. Se isso disparasse sozinho
// ao abrir o card, a mesa comia o teto antes do meio-dia E furava a fila do lead
// que esta indo pra vendedora agora (o sob-demanda entra com prioridade +1).
// Por isso quem decide gastar a consulta e a advogada, clicando.
// Cache: lead ja validado responde em ~1s sem gastar chip.
//
// 21/09 tarde — BLINDAGEM, depois de queimar 7 consultas do chip em 3 leads sem
// nenhuma resposta. A falha veio como "http 401" e o botao deixou repetir 5x no
// mesmo numero. Cada repeticao debitou o chip: a funcao RESERVA a consulta antes
// de chamar a Evolution, entao erro tardio ja saiu do teto do dia.
// Regra do Bruno: chip com problema NAO desliga o botao — o rodizio troca pro
// chip seguinte. So desliga quando nao sobrar nenhum chip.
// Daqui a tela so enxerga 3 desfechos, e trata cada um diferente:
const MOTIVO_WHATS = {
  sem_chip_disponivel: 'nenhum chip disponível agora — fora da janela 8h-20h, teto do dia estourado ou todos os chips fora do ar',
  timeout: 'a Evolution não respondeu a tempo',
  resposta_inesperada: 'a Evolution respondeu algo que não dá pra ler',
  sem_telefone: 'o lead não tem telefone gravado',
  lead_nao_encontrado: 'lead não encontrado',
  lead_id_invalido: 'lead inválido',
  erro_interno: 'erro interno do validador',
}
const textoMotivoWhats = (m) =>
  MOTIVO_WHATS[m] || (/^http/.test(String(m || '')) ? 'a Evolution recusou a chave (' + m + ')' : String(m || 'motivo não informado'))

// DESLIGA O BOTAO DA TELA INTEIRA. So dois casos:
//   sem_chip_disponivel -> e literalmente "acabaram os chips". Insistir nao acha
//                          chip nenhum, e cada insistencia ainda custa a reserva.
//   http 401 / 403      -> a Evolution recusou a CHAVE. A chave e uma so, vale
//                          pra todos os chips (EVOLUTION_APIKEY, no ambiente da
//                          edge function). Trocar de chip NAO resolve: e problema
//                          de configuracao, nao de chip. Insistir queima o teto
//                          de graca — foi exatamente o que aconteceu as 11h45.
// Qualquer outro motivo (timeout, resposta estranha) e falha pontual: o botao
// continua vivo e ela pode tentar de novo.
const derrubaBotaoGeral = (m) => m === 'sem_chip_disponivel' || m === 'http 401' || m === 'http 403'
// teto de tentativas no MESMO lead, pra nao repetir 5x como aconteceu
const MAX_TENTATIVAS_WHATS = 2

// ───────────────────────────────────────────────────────────────────────────
// 21/09 (Bruno) — FASE DE TESTE DO VALIDADOR. Botao DESLIGADO de proposito.
//
// O teste e de ISOLAMENTO: so leads de agosto entram na fila, pra medir se o
// validador acerta e quanto o chip aguenta, sem contaminar a operacao viva.
// O botao aqui furaria isso — ele valida lead de HOJE sob demanda, com
// prioridade +1, e cada clique entra na conta do chip que esta sob medicao.
//
// PRA RELIGAR quando o teste acabar: trocar pra true. Nada mais.
// O codigo do botao continua inteiro embaixo, so nao e renderizado.
const VERIFICAR_WHATS_LIGADO = false

// ───────────────────────────────────────────────────────────────────────────
// 21/09 — ROBÔ DO GERID. Ele consulta o GERID antes da advogada e grava em
// dados_json.gerid: consultado_em, vinculos[], decisao_filhos[], resumo,
// prints[] (URLs jpeg, só quando aprovar/conferir) e tela (texto dos vínculos).
//
// DOIS estados na tela, so: APROVAR ou REPROVAR. Ponto.
// O robô pode gravar 'conferir' em decisao_filhos[] (é o formato dele), mas aqui
// isso vira APROVAR. A regra é de uma linha:
//
//   REPROVAR -> o robô reprovou TODOS os filhos
//   APROVAR  -> qualquer outra coisa
//
// A direção não é arbitrária: reprovar é o único lado que manda mensagem de
// recusa pra cliente e não tem volta. Dúvida do robô cai do lado que a advogada
// olha, nunca do lado que dispara sozinho.
//
// DUAS ABAS SEPARADAS, por decisão do Bruno: aprovação não se mistura com
// reprovação. São trabalhos diferentes — a aprovação vira venda e sai no grupo;
// a reprovação é limpeza em lote.
const GERID = {
  apr: { chave: 'apr', label: '🤖 Aprovar',  cor: '#059669', bg: 'rgba(5,150,105,.10)',
         dica: 'O robô não reprovou tudo — é aqui que sai venda' },
  aud: { chave: 'aud', label: '🔍 Conferir o robô', cor: '#b45309', bg: 'rgba(180,83,9,.10)',
         dica: 'Amostra do dia: o robô reprovou, mas estes ficaram pra você conferir se ele acertou' },
}
// 22/09 — quem o robô reprovou NÃO chega mais aqui: o banco reprova sozinho.
// A exceção é a amostra diária de 10, que vem marcada com gerid_auditoria e é
// justamente o que mede se o robô está certo.
const abaGerid = (c) => (c && c.gerid_auditoria ? 'aud' : c && c.gerid_veredito === 'aprovar' ? 'apr' : null)

// selo por filho. 'conferir' do robô é mostrado como aprovar, pelo mesmo motivo.
const SUGESTAO = {
  aprovar:  { label: '✅ robô sugere APROVAR',  cor: '#059669', bg: 'rgba(5,150,105,.12)' },
  reprovar: { label: '⛔ robô sugere REPROVAR', cor: '#b45309', bg: 'rgba(180,83,9,.12)' },
}
const seloFilho = (s) => (s === 'reprovar' ? SUGESTAO.reprovar : SUGESTAO.aprovar)


// Motivos — exatamente os que a operacao usa hoje no grupo do WhatsApp
const MOTIVOS_APROVA = [
  'Dentro dos 12 meses',
  'Dentro dos 24 meses — confirmar seguro-desemprego com a cliente',
  'Dentro dos 24 meses por ter 120 contribuições',
]
const MOTIVOS_NEGA = [
  'Recebeu salário maternidade',
  'Estava empregada no parto',
  'Excedeu o período de graça',
  'Outro motivo',
]

const s = {
  // 16/09 — a pagina ficava colada na esquerda em tela larga. margin auto centraliza.
  wrap: { maxWidth: 1100, margin: '0 auto', padding: '0 16px', width: '100%', boxSizing: 'border-box' },
  h1: { fontSize: 22, fontWeight: 600, color: '#0f172a', margin: 0 },
  sub: { fontSize: 13, color: '#5b6b84', marginTop: 4, marginBottom: 18, lineHeight: 1.5 },
  chips: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 },
  chip: (cor, bg, on) => ({
    padding: '7px 13px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
    background: on ? cor : bg, color: on ? '#ffffff' : cor,
    border: '0.5px solid rgba(15,23,42,0.09)', fontFamily: 'inherit',
  }),
  card: (destaque) => ({
    background: '#ffffff', borderRadius: 13, padding: 16, marginBottom: 12,
    border: destaque ? '1.5px solid #059669' : '0.5px solid rgba(15,23,42,0.08)',
    boxShadow: '0 1px 2px rgba(15,23,42,.06)',
  }),
  linha: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  nome: { fontSize: 15, fontWeight: 600, color: '#0f172a' },
  dado: { fontSize: 12, color: '#5b6b84', marginTop: 3 },
  badge: (cor, bg) => ({ padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: bg, color: cor, whiteSpace: 'nowrap' }),
  badges: { display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' },
  barraLote: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 },
  btnLote: { padding: '9px 14px', background: '#0f172a', color: '#ffffff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  loteDica: { fontSize: 12, color: '#5b6b84' },
  gerid: { marginTop: 10, padding: 10, borderRadius: 9, background: '#f2f5fa', border: '0.5px solid rgba(15,23,42,0.08)' },
  geridTit: { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#5b6b84', marginBottom: 7 },
  geridLinha: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' },
  btnCopia: (off) => ({ padding: '5px 10px', background: off ? '#e2e8f0' : '#ffffff', color: off ? '#94a3b8' : '#2563eb', border: '0.5px solid rgba(15,23,42,0.14)', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: off ? 'not-allowed' : 'pointer', fontFamily: 'inherit', minWidth: 78 }),
  valor: { fontSize: 14, fontWeight: 600, color: '#0f172a', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing: '0.3px' },
  alertaMini: { fontSize: 10.5, fontWeight: 600, color: '#92400e', background: 'rgba(251,191,36,.18)', borderRadius: 6, padding: '2px 7px' },
  // --- filhos elegiveis (20/09) ---
  // Bloco proprio logo abaixo do nascimento. Quando ha MAIS DE UM filho dentro
  // do prazo de 5 anos, ganha fundo amarelo: cada filho e um pedido a mais, e
  // hoje isso passava batido. Enteado nao entra (nao gera direito).
  filhosBox: (varios) => ({
    marginTop: 8, padding: varios ? '9px 10px' : '6px 0 0', borderRadius: 8,
    background: varios ? 'rgba(251,191,36,.16)' : 'transparent',
    border: varios ? '1px solid rgba(180,83,9,.35)' : 'none',
  }),
  filhosTit: { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#5b6b84', marginBottom: 4 },
  filhosDatas: { fontSize: 13.5, fontWeight: 600, color: '#0f172a', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing: '0.3px', lineHeight: 1.5 },
  filhosNota: { fontSize: 11.5, fontWeight: 700, color: '#92400e', marginTop: 5, lineHeight: 1.4 },
  // --- filtro de whatsapp (21/09) ---
  chipsLinha: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 },
  chipsRotulo: { fontSize: 11.5, fontWeight: 700, color: '#5b6b84', textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: 2 },
  seloWhats: (cor, bg) => ({ display: 'inline-block', padding: '1px 7px', borderRadius: 7, fontSize: 11, fontWeight: 700, color: cor, background: bg, marginLeft: 6 }),
  btnWhats: (off) => ({ marginLeft: 6, padding: '1px 8px', background: '#ffffff', color: off ? '#94a3b8' : '#2563eb', border: '0.5px solid rgba(15,23,42,0.16)', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: off ? 'wait' : 'pointer', fontFamily: 'inherit' }),
  whatsErro: { display: 'inline-block', marginLeft: 6, fontSize: 10.5, fontWeight: 600, color: '#92400e', background: 'rgba(251,191,36,.18)', borderRadius: 6, padding: '2px 7px' },
  whatsParado: { background: 'rgba(251,191,36,.14)', border: '0.5px solid rgba(180,83,9,.35)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12.5, lineHeight: 1.55, color: '#7c2d12' },
  // 21/09 — robô do GERID
  roboBox: (rep) => ({ marginTop: 10, padding: '9px 12px', borderRadius: 9, fontSize: 12.5, lineHeight: 1.5,
    background: rep ? 'rgba(180,83,9,.06)' : 'rgba(3,105,161,.06)',
    border: '0.5px solid ' + (rep ? 'rgba(180,83,9,.22)' : 'rgba(3,105,161,.22)'), color: '#0f172a' }),
  roboTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 5 },
  roboPrintOk: { fontSize: 10.5, fontWeight: 700, color: '#059669', background: 'rgba(5,150,105,.12)', borderRadius: 6, padding: '2px 7px' },
  roboResumo: { fontSize: 12, color: '#475569', marginBottom: 6 },
  roboFilho: { marginTop: 5, paddingTop: 5, borderTop: '0.5px solid rgba(15,23,42,.07)' },
  roboSelo: (cor, bg) => ({ display: 'inline-block', padding: '1px 7px', borderRadius: 7, fontSize: 10.5, fontWeight: 700, color: cor, background: bg, marginRight: 6 }),
  roboFilhoNome: { fontSize: 12, fontWeight: 600, color: '#0f172a' },
  roboMotivo: { fontSize: 11.5, color: '#5b6b84', marginTop: 2, lineHeight: 1.45 },
  checkLote: { marginRight: 8, width: 15, height: 15, cursor: 'pointer', verticalAlign: 'middle' },
  loteRep: { background: 'rgba(180,83,9,.07)', border: '0.5px solid rgba(180,83,9,.3)', borderRadius: 10, padding: '11px 14px', marginBottom: 14 },
  loteRepTopo: { fontSize: 12.5, color: '#0f172a', lineHeight: 1.5, marginBottom: 9 },
  loteRepBotoes: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  btnLoteSec: { padding: '6px 12px', background: '#ffffff', color: '#5b6b84', border: '0.5px solid rgba(15,23,42,.16)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  btnLoteFinal: (off) => ({ padding: '7px 16px', background: off ? '#e2e8f0' : '#b45309', color: off ? '#94a3b8' : '#ffffff', border: 0, borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: off ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }),
  loteRepPe: { marginTop: 9, fontSize: 11.5, color: '#7c2d12', lineHeight: 1.5 },
  vincBox: { marginTop: 10, padding: '9px 12px', background: '#f8fafc', border: '0.5px solid rgba(15,23,42,.09)', borderRadius: 9 },
  vincTit: { fontSize: 11.5, fontWeight: 700, color: '#5b6b84', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' },
  vincLinha: { fontSize: 11.5, color: '#334155', padding: '3px 0', borderTop: '0.5px solid rgba(15,23,42,.06)', lineHeight: 1.45 },
  telaGerid: { marginTop: 7, padding: '9px 11px', background: '#0f172a', color: '#e2e8f0', borderRadius: 8, fontSize: 11, lineHeight: 1.5, maxHeight: 260, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, monospace' },
  vincImg: { maxWidth: '100%', borderRadius: 8, border: '0.5px solid rgba(15,23,42,.12)', marginTop: 7, display: 'block' },
  buscaWrap: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: 6, flexWrap: 'wrap' },
  buscaInput: { flex: '1 1 280px', minWidth: 0, padding: '9px 12px', fontSize: 13, borderRadius: 9, border: '0.5px solid rgba(15,23,42,.14)', background: '#ffffff', color: '#0f172a', fontFamily: 'inherit', boxSizing: 'border-box' },
  buscaLimpar: { padding: '8px 11px', fontSize: 12, fontWeight: 700, borderRadius: 9, border: '0.5px solid rgba(15,23,42,.14)', background: '#ffffff', color: '#5b6b84', cursor: 'pointer', fontFamily: 'inherit' },
  buscaConta: { fontSize: 11.5, color: '#5b6b84' },
  // --- escolher quais filhos entram (20/09) ---
  escolhaBox: { marginBottom: 10, padding: 11, borderRadius: 9, background: '#fffdf7', border: '1px solid rgba(180,83,9,.35)' },
  escolhaTit: { fontSize: 12.5, fontWeight: 700, color: '#92400e', marginBottom: 7 },
  escolhaItem: (on) => ({
    display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', marginBottom: 5,
    borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%',
    background: on ? 'rgba(52,211,153,.14)' : '#ffffff',
    border: '1px solid ' + (on ? '#05966955' : 'rgba(15,23,42,0.12)'),
    color: on ? '#0f172a' : '#5b6b84',
    textDecoration: on ? 'none' : 'line-through',
  }),
  escolhaMarca: (on) => ({ fontSize: 14, fontWeight: 700, color: on ? '#059669' : '#94a3b8', minWidth: 16 }),
  escolhaTexto: { fontSize: 13, fontWeight: 600, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
  escolhaNota: { fontSize: 11, color: '#5b6b84', marginTop: 4, lineHeight: 1.45 },
  maquina: { marginTop: 10, padding: 10, borderRadius: 9, background: '#f2f5fa', fontSize: 12, color: '#334155', lineHeight: 1.45 },
  acoes: { display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  btnOk: { padding: '10px 16px', background: '#059669', color: '#ffffff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  btnNao: { padding: '10px 16px', background: '#dc2626', color: '#ffffff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  btnChat: { padding: '10px 14px', background: 'rgba(96,165,250,.12)', color: '#2563eb', border: '0.5px solid rgba(15,23,42,0.09)', borderRadius: 9, fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'inline-block' },
  motivos: { marginTop: 12, padding: 12, borderRadius: 10, background: '#f2f5fa', border: '0.5px solid rgba(15,23,42,0.08)' },
  // 16/09 — faixa da linha pronta pro grupo do WhatsApp, depois de pré-aprovar
  avisoWrap: (ok) => ({ position: 'sticky', top: 0, zIndex: 20, marginBottom: 14, padding: 14, borderRadius: 12,
    background: ok ? 'rgba(52,211,153,.14)' : 'rgba(248,113,113,.14)',
    border: '1px solid ' + (ok ? '#34d399' : '#f87171') }),
  avisoTitulo: (ok) => ({ fontSize: 12, fontWeight: 600, color: ok ? '#065f46' : '#991b1b', marginBottom: 8 }),
  avisoLinha: { fontSize: 15, fontWeight: 600, color: '#0f172a', background: '#ffffff', padding: '10px 12px', borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.11)', wordBreak: 'break-word', lineHeight: 1.45 },
  avisoBotoes: { display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  avisoAlerta: { marginTop: 8, fontSize: 12, fontWeight: 600, color: '#b45309' },
  motivoBtn: (cor) => ({
    display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', marginBottom: 6,
    background: '#ffffff', color: '#0f172a', border: '1px solid ' + cor + '40',
    borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
  }),
  input: { width: '100%', padding: '9px 10px', fontSize: 13, borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.12)', marginBottom: 6, boxSizing: 'border-box', fontFamily: 'inherit' },
  vazio: { textAlign: 'center', padding: '3rem', color: '#5b6b84', fontSize: 14, background: '#ffffff', borderRadius: 13, border: '0.5px solid rgba(15,23,42,0.08)' },
  // --- print do GERID (26/08) ---
  colaArea: (temPrint) => ({
    marginBottom: 8, padding: '16px 12px', borderRadius: 9, textAlign: 'center', cursor: 'text',
    background: temPrint ? 'rgba(52,211,153,.14)' : '#fffdf7',
    border: temPrint ? '1px solid #05966950' : '2px dashed #b45309',
    outline: 'none',
  }),
  colaTit: (temPrint) => ({ fontSize: 14, fontWeight: 700, color: temPrint ? '#059669' : '#b45309' }),
  linkArquivo: {
    background: 'none', border: 'none', padding: 0, marginTop: 6,
    color: '#5b6b84', fontSize: 11.5, textDecoration: 'underline',
    cursor: 'pointer', fontFamily: 'inherit',
  },
  colaDica: { fontSize: 11, color: '#5b6b84', marginTop: 4, lineHeight: 1.45 },
  previewWrap: { marginTop: 8, position: 'relative' },
  preview: { maxWidth: '100%', maxHeight: 220, borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.14)', display: 'block', margin: '0 auto' },
  btnTiraPrint: { marginTop: 6, padding: '5px 10px', background: '#ffffff', color: '#dc2626', border: '0.5px solid #dc262640', borderRadius: 7, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
}

// Bucket ja usado pelos outros anexos do sistema.
const BUCKET_PRINT = 'documentos-clientes'

// Copiar sem depender de clipboard API (que falha em http e em alguns navegadores)
function copiar(texto) {
  try {
    if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(texto); return true }
  } catch (e) { /* cai no fallback */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = texto
    ta.style.position = 'fixed'; ta.style.left = '-9999px'
    document.body.appendChild(ta); ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    return true
  } catch (e) { return false }
}

// "13/09/2024, 20/04/2022" -> ['13/09/2024','20/04/2022']
const listaFilhos = (txt) => String(txt || '').split(',').map(x => x.trim()).filter(Boolean)

// 21/09 — o robô grava data em ISO (2024-01-01). Vira 01/01/2024 sem passar
// por new Date(), que em ISO puro interpreta como UTC e às vezes volta um dia.
const brDeIso = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''))
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v || '')
}
const fmtQuando = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function MesaAdvogada() {
  const { profile } = useAuth()
  const [copiado, setCopiado] = useState('')
  const [fila, setFila] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('')
  const [soDetetive, setSoDetetive] = useState(false)   // 20/09 — filtro de origem
  const [fWhats, setFWhats] = useState('tudo')          // 21/09 — tudo | tem | nao | nver
  // 21/09 — resultado das verificacoes feitas AQUI, no clique da advogada.
  // Fica so na memoria da tela: o banco ja foi gravado pela edge function, e a
  // fila recarrega sozinha de minuto em minuto. Isso aqui e pra resposta na hora.
  const [whatsLocal, setWhatsLocal] = useState({})      // { [leadId]: 'true' | 'false' }
  const [whatsErro, setWhatsErro] = useState({})        // { [leadId]: 'texto do motivo' }
  const [verifWhats, setVerifWhats] = useState(null)    // leadId sendo verificado agora
  const [whatsTent, setWhatsTent] = useState({})        // { [leadId]: quantas vezes ja tentou }
  // quando isso enche, o botao some da tela inteira ate recarregar a pagina.
  // So acontece em "acabaram os chips" ou "chave recusada" — ver derrubaBotaoGeral.
  const [whatsParado, setWhatsParado] = useState(null)  // { motivo, texto }
  // 21/09 — abas do robô do GERID
  const [fGerid, setFGerid] = useState('tudo')      // tudo | conf | rep
  const [busca, setBusca] = useState('')            // 22/09 — nome, telefone ou CPF
  const [detGerid, setDetGerid] = useState(null)    // detalhe do lead aberto (vínculos, prints, tela)
  const [detCarregando, setDetCarregando] = useState(false)
  const [verVinculos, setVerVinculos] = useState(false)
  const [verTela, setVerTela] = useState(false)
  const [abrindo, setAbrindo] = useState(null)   // { id, tipo: 'ok' | 'nao' }
  const [outroTexto, setOutroTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  // Print do GERID — obrigatorio SO na pre-aprovacao. Negar nao precisa.
  const [print, setPrint] = useState(null)          // { file, preview }
  // 20/09 — quais filhos a advogada validou. Comeca com todos marcados; ela
  // desmarca o que o GERID mostrar que nao serve. So aparece quando ha mais
  // de um: com um filho so nao ha o que escolher.
  const [filhosOk, setFilhosOk] = useState([])
  const [subindoPrint, setSubindoPrint] = useState(false)
  // 16/09 (Bruno): depois de PRE-APROVAR, a advogada digitava a linha do grupo
  // do WhatsApp na mao. Em 16/09 isso ja produziu erro: o CPF 873.146.062-34 foi
  // gravado no sistema como "Dentro dos 12 meses" e foi pro grupo como "24 meses".
  // Agora a linha sai pronta daqui, com o CPF, a data e o prazo que FORAM GRAVADOS,
  // mais a vendedora que o rodizio sorteou (vem no retorno da advogada_decidir).
  const [aviso, setAviso] = useState(null)   // { texto, cliente }
  const fileRef = useRef(null)
  const colaRef = useRef(null)   // area que recebe o Ctrl+V

  const carregar = useCallback(async () => {
    const r = await supabase.rpc('mesa_advogada', { p_limite: 300 })
    if (r.error) console.error(r.error)
    setFila(r.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => {
    const t = setInterval(carregar, 60000)   // atualiza sozinha de minuto em minuto
    return () => clearInterval(t)
  }, [carregar])

  // Aceita imagem vinda do Ctrl+V, do seletor de arquivo ou de arrastar-e-soltar.
  const pegarImagem = (file) => {
    if (!file || !/^image\//.test(file.type)) return false
    if (file.size > 10 * 1024 * 1024) { alert('Print muito grande (máx 10MB).'); return false }
    setPrint({ file, preview: URL.createObjectURL(file) })
    return true
  }

  // Le a imagem de um evento de paste (serve pro listener global e pro onPaste da area)
  const colarDoEvento = (e) => {
    const dt = e.clipboardData || (typeof window !== 'undefined' && window.clipboardData)
    const itens = (dt && dt.items) || []
    for (let i = 0; i < itens.length; i++) {
      if (itens[i].kind === 'file' && /^image\//.test(itens[i].type)) {
        const f = itens[i].getAsFile()
        if (f && pegarImagem(f)) { e.preventDefault(); return true }
        return false
      }
    }
    // alguns navegadores entregam so em dt.files
    const arqs = (dt && dt.files) || []
    if (arqs.length && /^image\//.test(arqs[0].type)) {
      if (pegarImagem(arqs[0])) { e.preventDefault(); return true }
    }
    return false
  }

  // Ctrl+V em qualquer lugar da tela, enquanto o painel de PRÉ-APROVAÇÃO está aberto.
  // A area de colar tambem tem onPaste proprio — isso aqui e a rede de seguranca.
  useEffect(() => {
    if (!abrindo || abrindo.tipo !== 'ok') return
    const aoColar = (e) => { colarDoEvento(e) }
    window.addEventListener('paste', aoColar)
    // foca a area de colar pra que o Ctrl+V caia nela sem precisar clicar em nada
    const t = setTimeout(() => { if (colaRef.current && colaRef.current.focus) colaRef.current.focus() }, 60)
    return () => { window.removeEventListener('paste', aoColar); clearTimeout(t) }
  }, [abrindo])

  const limparPrint = () => {
    if (print && print.preview) { try { URL.revokeObjectURL(print.preview) } catch (e) {} }
    setPrint(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const fecharPainel = () => { setAbrindo(null); setOutroTexto(''); limparPrint(); setFilhosOk([]) }

  // abre o painel ja com todos os filhos marcados
  const abrirPainel = (c, tipo) => {
    setAbrindo({ id: c.id, tipo })
    setOutroTexto(''); limparPrint()
    setFilhosOk(tipo === 'ok' ? listaFilhos(c.filhos_elegiveis) : [])
    // 21/09 — vinculos, prints e a 'tela' do GERID vem SOB DEMANDA, um lead por
    // vez. Ficam fora do board de proposito: sao pesados e o board recarrega
    // de minuto em minuto.
    setDetGerid(null); setVerVinculos(false); setVerTela(false)
    if (c.gerid_veredito) {
      setDetCarregando(true)
      supabase.rpc('mesa_gerid_detalhe', { p_lead_id: c.id })
        .then(({ data }) => setDetGerid(data || null))
        .catch(e => console.error('mesa_gerid_detalhe', e))
        .finally(() => setDetCarregando(false))
    }
  }

  // prints que o robo tirou do GERID. Se existem, valem como print da
  // pre-aprovacao e ela nao precisa colar nada.
  const printsDoRobo = (c) => {
    const doCard = Array.isArray(c && c.gerid_prints) ? c.gerid_prints : []
    const doDet  = (detGerid && Array.isArray(detGerid.prints)) ? detGerid.prints : []
    return (doDet.length ? doDet : doCard).filter(u => typeof u === 'string' && /^https?:\/\//.test(u))
  }

  // 22/09 (Bruno): "quando ela for aprovar, tem que usar o que o robô anexou já".
  // O robô grava DUAS formas de prova e hoje só uma está vindo:
  //   prints[] -> imagens do GERID (ainda em zero nos 126 leads consultados)
  //   tela     -> o TEXTO da etapa de vínculos, até 6000 chars (esse ele grava)
  // Texto é prova melhor que print, inclusive: dá pra auditar em massa, imagem
  // não dá. Então qualquer uma das duas libera a pré-aprovação — exigir que ela
  // cole print seria mandar refazer no GERID a consulta que o robô acabou de
  // fazer, que é o oposto do ganho.
  const temProvaDoRobo = (c) => !!(c && c.gerid_tem_consulta) || printsDoRobo(c).length > 0
  const alternarFilho = (f) =>
    setFilhosOk(l => l.includes(f) ? l.filter(x => x !== f) : [...l, f])

  // valor de WhatsApp que vale pra tela: o verificado agora ganha do que veio da rpc
  const whatsDoLead = (c) => (whatsLocal[c.id] !== undefined ? whatsLocal[c.id] : c.whats_tem)

  // 21/09 — botao MANUAL. So roda no clique. Uma consulta por clique (a menos
  // que o lead ja tenha cache, ai nao gasta chip).
  // REGRA DURA: isso NUNCA pode travar a decisao da advogada. Se a Evolution
  // cair, se o chip for banido ou se o teto do dia estourar, a tela mostra o
  // motivo e os botoes de aprovar/negar continuam funcionando normalmente.
  const verificarWhats = async (c) => {
    if (verifWhats || whatsParado) return
    if ((whatsTent[c.id] || 0) >= MAX_TENTATIVAS_WHATS) return
    setVerifWhats(c.id)
    setWhatsTent(t => ({ ...t, [c.id]: (t[c.id] || 0) + 1 }))
    setWhatsErro(e => { const n = { ...e }; delete n[c.id]; return n })
    try {
      const { data, error } = await supabase.functions.invoke('validar-whatsapp', { body: { lead_id: c.id } })
      if (error) throw error
      if (data && data.ok) {
        setWhatsLocal(m => ({ ...m, [c.id]: data.tem_whatsapp ? 'true' : 'false' }))
        // deu certo: zera o contador daquele lead
        setWhatsTent(t => { const n = { ...t }; delete n[c.id]; return n })
      } else {
        const motivo = (data && data.motivo) || ''
        setWhatsErro(e => ({ ...e, [c.id]: textoMotivoWhats(motivo) }))
        // falha que nao adianta repetir: tranca o botao da tela inteira
        if (derrubaBotaoGeral(motivo)) setWhatsParado({ motivo, texto: textoMotivoWhats(motivo) })
      }
    } catch (err) {
      console.error('validar-whatsapp', err)
      setWhatsErro(e => ({ ...e, [c.id]: 'não deu pra verificar agora' }))
    } finally {
      setVerifWhats(null)
    }
  }

  const decidir = async (lead, aprovado, motivo) => {
    if (!motivo || !motivo.trim()) { alert('Escolha o motivo.'); return }
    // Regra 26/08: pré-aprovar exige o print do GERID. Negar não exige.
    // 21/09: o print do ROBÔ vale igual. Se ele já consultou e guardou a
    // imagem, exigir que ela cole de novo seria obrigá-la a refazer no GERID
    // exatamente a consulta que o robô acabou de fazer — o oposto do ganho.
    const printRobo = printsDoRobo(lead)
    if (aprovado && !print && !temProvaDoRobo(lead)) {
      alert('Cole (Ctrl+V) ou anexe o print do GERID antes de pré-aprovar.'); return
    }

    // 20/09: com mais de um filho no prazo, ela escolhe quais entram.
    // Se desmarcar todos, nao e aprovacao parcial — e negativa da mae, e a
    // negativa tem fluxo proprio (avisa a cliente no WhatsApp).
    const filhosDoLead = listaFilhos(lead.filhos_elegiveis)
    if (aprovado && filhosDoLead.length > 1 && filhosOk.length === 0) {
      alert('Marque pelo menos um filho. Se nenhum serve, use "Negar" — aí a cliente é avisada.')
      return
    }

    setSalvando(true)
    let urlPrint = null
    if (aprovado && print) {
      setSubindoPrint(true)
      const ext = (print.file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
      const caminho = 'gerid/' + lead.id + '_' + Date.now() + '.' + ext
      const up = await supabase.storage.from(BUCKET_PRINT)
        .upload(caminho, print.file, { upsert: true, contentType: print.file.type })
      setSubindoPrint(false)
      if (up.error) {
        setSalvando(false)
        alert('Não consegui subir o print: ' + up.error.message)
        return
      }
      const pub = supabase.storage.from(BUCKET_PRINT).getPublicUrl(caminho)
      urlPrint = pub && pub.data && pub.data.publicUrl
      if (!urlPrint) {
        setSalvando(false)
        alert('O print subiu mas não consegui o link. Tenta de novo.')
        return
      }
    } else if (aprovado && printRobo.length) {
      // print do robô: já está no storage, é só apontar. Vai o primeiro —
      // é o mesmo campo que a vendedora abre na ficha dela.
      urlPrint = printRobo[0]
    }

    const r = await supabase.rpc('advogada_decidir', {
      p_lead_id: lead.id, p_aprovado: aprovado, p_motivo: motivo.trim(),
      p_advogada: (profile && profile.id) || null,
      p_print_url: urlPrint,
      p_filhos: (aprovado && filhosDoLead.length) ? filhosOk.join(', ') : null,
    })
    setSalvando(false)
    if (r.error || !r.data || r.data.ok !== true) {
      alert('Erro: ' + ((r.error && r.error.message) || (r.data && r.data.erro) || 'tente de novo'))
      return
    }
    fecharPainel()
    setFila(f => f.filter(x => x.id !== lead.id))   // sai da fila na hora

    // Só na pré-aprovação: monta a linha do grupo do WhatsApp já pronta.
    // O prazo sai do PRÓPRIO motivo escolhido ("Dentro dos 12 meses" -> 12),
    // então o que vai pro grupo é sempre igual ao que ficou gravado no lead.
    // O \s*meses evita casar com o "120" de "por ter 120 contribuições".
    if (aprovado) {
      const m = /(\d+)\s*meses/.exec(motivo)
      const prazo = m ? `Dentro do prazo de ${m[1]} meses` : motivo.trim()
      const cpfTxt = lead.cpf || lead.cpf_limpo || 'SEM CPF'
      const dataTxt = lead.nasc_br || 'sem data'
      const vend = (r.data && r.data.vendedora) || null
      // 20/09 (Bruno): a linha do grupo e o UNICO caminho pelo qual a vendedora
      // fica sabendo dos filhos. Entao os filhos no prazo vao DENTRO dela, com
      // data e nome — nao adianta so avisar na tela, que a vendedora nao ve.
      // so os filhos que ela marcou — o que ela descartou nao vai pro grupo
      const filhos = filhosDoLead.length > 1 ? filhosOk : filhosDoLead
      const rotulo = filhos.length > 1 ? 'Filhos no prazo' : 'Filho no prazo'
      const trechoFilhos = filhos.length ? ` - ${rotulo}: ${filhos.join(', ')}` : ''
      setAviso({
        tipo: 'ok',
        cliente: lead.nome || 'cliente',
        semVendedora: !vend,
        texto: `${cpfTxt} - ${dataTxt} - ${prazo} - ${vend || 'SEM VENDEDORA DISPONÍVEL'}${trechoFilhos}`,
        // aviso extra na tela so quando ha mais de um: a linha ja leva a lista,
        // isto aqui e pra advogada nao passar batido no caso que rende mais.
        extraFilhos: filhos.length > 1 ? lead.filhos_elegiveis : null,
      })
    }

    // 16/09 (Bruno): negativa por salário maternidade já recebido também vai pro
    // grupo — é o caso em que o time precisa saber pra tirar a cliente da lista.
    // Os outros motivos de negativa encerram na mesa e não geram linha.
    if (!aprovado && motivo.trim() === 'Recebeu salário maternidade') {
      const cpfTxt = lead.cpf || lead.cpf_limpo || 'SEM CPF'
      const dataTxt = lead.nasc_br || 'sem data'
      setAviso({
        tipo: 'nao',
        cliente: lead.nome || 'cliente',
        semVendedora: false,
        texto: `${cpfTxt} - ${dataTxt} - Já recebeu o salário maternidade`,
        extraFilhos: null,
      })
    }
  }

  const copiarCom = (chave, texto) => {
    if (!texto) return
    copiar(texto)
    setCopiado(chave)
    setTimeout(() => setCopiado(c => (c === chave ? '' : c)), 1400)
  }

  const copiarLote = (lista) => {
    const linhas = lista
      .filter(c => c.cpf_ok)
      .map(c => `${c.cpf_limpo}\t${c.nasc_br || 'sem data'}\t${c.nome || ''}\t${c.filhos_elegiveis || ''}`)
    if (!linhas.length) { alert('Nenhum CPF válido nessa fila.'); return }
    copiarCom('lote', 'CPF\tNascimento\tNome\tFilhos elegíveis\n' + linhas.join('\n'))
  }

  const contagem = fila.reduce((a, c) => { a[c.fila] = (a[c.fila] || 0) + 1; return a }, {})
  // contagem por estado de WhatsApp, calculada sobre a fila inteira (nao sobre
  // o filtro atual) — senao o chip mudaria de numero ao clicar nele mesmo.
  const contaWhats = fila.reduce((a, c) => { const k = chaveWhats(whatsDoLead(c)); a[k] = (a[k] || 0) + 1; return a }, {})
  const nDetetive = fila.filter(c => c.do_detetive).length
  // contagem das abas do robô, sobre a fila inteira
  const contaGerid = fila.reduce((a, c) => { const k = abaGerid(c); if (k) a[k] = (a[k] || 0) + 1; return a }, {})
  // 22/09 — busca por nome, telefone ou CPF. Roda em cima da fila que já está
  // carregada, então responde enquanto ela digita, sem ida ao banco.
  // Dígito é dígito: "119" casa telefone E CPF, porque quem digita não sabe (nem
  // precisa saber) em qual dos dois campos o número está gravado.
  const bus = busca.trim().toLowerCase()
  const busNum = busca.replace(/\D/g, '')
  const casaBusca = (c) => {
    if (!bus) return true
    if ((c.nome || '').toLowerCase().includes(bus)) return true
    if (busNum) {
      if ((c.cpf_limpo || '').includes(busNum)) return true
      if ((c.tel || '').replace(/\D/g, '').includes(busNum)) return true
    }
    return false
  }

  const visiveis = fila.filter(c => {
    if (!casaBusca(c)) return false
    if (filtro && c.fila !== filtro) return false
    if (soDetetive && !c.do_detetive) return false
    if (fWhats !== 'tudo' && chaveWhats(whatsDoLead(c)) !== fWhats) return false
    // 22/09 (Bruno): "o todas tem que mostrar so a fila". O que o robô já
    // classificou é trabalho à parte e vive nas abas dele — não se mistura.
    if (fGerid === 'tudo' ? abaGerid(c) !== null : abaGerid(c) !== fGerid) return false
    return true
  })
  // quantos a busca acharia se os chips não estivessem filtrando — serve pra
  // dizer "achei 2, mas os filtros escondem" em vez de mentir "não achei nada"
  const achadosSoBusca = bus ? fila.filter(casaBusca).length : 0
  const fmtTempo = (m) => {
    const n = Number(m) || 0
    return n >= 60 ? Math.floor(n / 60) + 'h' + String(n % 60).padStart(2, '0') : n + 'min'
  }

  return (
    <div style={s.wrap}>
      <h1 style={s.h1}>⚖️ Mesa da Advogada — Retroativo</h1>

      {/* 22/09 — busca na fila carregada. Filtra enquanto digita. */}
      <div style={s.buscaWrap}>
        <input
          style={s.buscaInput}
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="🔎 Buscar na fila por nome, telefone ou CPF…"
        />
        {busca && (
          <button style={s.buscaLimpar} onClick={() => setBusca('')} title="limpar busca">✕</button>
        )}
        {busca && (
          <span style={s.buscaConta}>
            {visiveis.length === 0 && achadosSoBusca > 0
              ? `${achadosSoBusca} achada${achadosSoBusca === 1 ? '' : 's'}, mas os filtros abaixo estão escondendo`
              : `${visiveis.length} de ${fila.length}`}
          </span>
        )}
      </div>
      <div style={s.sub}>
        Só chega aqui quem já passou pela conferência PromoBank. Pré-aprovadas vêm primeiro;
        quem não mandou o CNIS só entra depois de 20 minutos parada.<br />
        Sua decisão é a oficial: <b>pré-aprovado real</b> vai pro vendedor, <b>negado</b> encerra e a cliente é avisada automaticamente.
        {nDetetive > 0 && (
          <><br />🕵️ As <b>{nDetetive}</b> do Detetive vêm no topo: a data de nascimento delas foi lida no órgão, não estimada.</>
        )}
      </div>

      {aviso && (
        <div style={s.avisoWrap(aviso.tipo === 'ok')}>
          <div style={s.avisoTitulo(aviso.tipo === 'ok')}>
            {aviso.tipo === 'ok'
              ? `✅ Pré-aprovado · ${aviso.cliente} — manda essa linha no grupo:`
              : `⛔ Negado · já recebeu SM · ${aviso.cliente} — manda essa linha no grupo:`}
          </div>
          <div style={s.avisoLinha}>{aviso.texto}</div>
          {aviso.extraFilhos && (
            <div style={s.avisoAlerta}>
              👶 Mais de um filho no prazo — cada um é um pedido separado. Já vai na linha acima.
            </div>
          )}
          {aviso.semVendedora && (
            <div style={s.avisoAlerta}>
              ⚠️ O rodízio não achou vendedora disponível — o lead foi aprovado mas ficou sem dono. Avisa a supervisão.
            </div>
          )}
          <div style={s.avisoBotoes}>
            <button style={s.btnCopia(false)} onClick={() => copiarCom('grupo', aviso.texto)}>
              {copiado === 'grupo' ? '✅ copiado' : '📋 Copiar pro grupo'}
            </button>
            <button style={{ ...s.motivoBtn('#5b6b84'), width: 'auto', padding: '8px 14px' }} onClick={() => setAviso(null)}>
              fechar
            </button>
          </div>
        </div>
      )}

      <div style={s.chips}>
        <button style={s.chip('#0f172a', 'rgba(15,23,42,.04)', !filtro && !soDetetive && fWhats === 'tudo' && fGerid === 'tudo')}
          onClick={() => { setFiltro(''); setSoDetetive(false); setFWhats('tudo'); setFGerid('tudo') }}>
          Todas · {fila.filter(c => abaGerid(c) === null).length}
        </button>
        {/* As duas abas do robô. À parte da fila normal de propósito:
            Aprovar vira venda; Conferir é a amostra que audita o robô. */}
        {['apr', 'aud'].map(k => (
          contaGerid[k] ? (
            <button key={k} style={s.chip(GERID[k].cor, GERID[k].bg, fGerid === k)}
              onClick={() => setFGerid(fGerid === k ? 'tudo' : k)}
              title={GERID[k].dica}>
              {GERID[k].label} · {contaGerid[k]}
            </button>
          ) : null
        ))}
        {nDetetive > 0 && (
          <button style={s.chip(DETETIVE_COR, DETETIVE_BG, soDetetive)}
            onClick={() => setSoDetetive(v => !v)}
            title="Leads que nasceram de uma consulta do robô Detetive — data lida no órgão">
            🕵️ Detetive · {nDetetive}
          </button>
        )}
        {ORDEM_FILAS.map(k => (
          contagem[k] ? (
            <button key={k} style={s.chip(FILAS[k].cor, FILAS[k].bg, filtro === k)} onClick={() => setFiltro(filtro === k ? '' : k)}>
              {FILAS[k].label} · {contagem[k]}
            </button>
          ) : null
        ))}
      </div>

      {/* 21/09 — filtro de WhatsApp. Eixo proprio: cruza com os filtros de fila
          e de origem acima. Padrao 'tudo' pra nao esconder ninguem. */}
      <div style={s.chipsLinha}>
        <span style={s.chipsRotulo}>WhatsApp:</span>
        <button style={s.chip('#0f172a', 'rgba(15,23,42,.04)', fWhats === 'tudo')}
          onClick={() => setFWhats('tudo')}>
          Tudo · {fila.length}
        </button>
        {['tem', 'nao', 'nver'].map(k => (
          <button key={k} style={s.chip(WHATS[k].cor, WHATS[k].bg, fWhats === k)}
            onClick={() => setFWhats(fWhats === k ? 'tudo' : k)}>
            {WHATS[k].label} · {contaWhats[k] || 0}
          </button>
        ))}
        <span style={{ fontSize: 11.5, color: '#64748b' }}>
          {VERIFICAR_WHATS_LIGADO
            ? <>a checagem automática só roda depois da sua decisão — aqui, use o <b>🔍 Verificar</b> do card
                quando o WhatsApp fizer diferença pro caso</>
            : <>🧪 o validador está em fase de teste, rodando só em leads antigos — por isso a fila daqui
                aparece toda sem verificar. <b>Decida normalmente</b>, nada mudou pra você.</>}
        </span>
      </div>

      {/* 21/09 — validador fora do ar. Aviso UNICO no topo, e o botao some de todos
          os cards. Sem isso, cada clique queima uma consulta do chip a troco de nada. */}
      {whatsParado && (
        <div style={s.whatsParado}>
          <b>🔌 Verificação de WhatsApp fora do ar.</b>{' '}
          {whatsParado.motivo === 'sem_chip_disponivel'
            ? 'Nenhum chip disponível agora — pode ser o teto do dia, a janela de horário (8h–20h) ou todos os chips fora do ar. Volta sozinho quando houver chip.'
            : 'A Evolution recusou a chave de acesso. Isso não é problema de chip: a chave é a mesma pra todos, trocar de chip não resolve. Avisa o time técnico.'}
          {' '}O botão foi desligado pra não gastar consulta à toa. <b>Continue decidindo normalmente</b> — a verificação nunca foi obrigatória pra aprovar ou negar.
        </div>
      )}

      {!loading && visiveis.length > 0 && (
        <div style={s.barraLote}>
          <button style={s.btnLote} onClick={() => copiarLote(visiveis)}>
            {copiado === 'lote' ? '✅ copiado!' : `📋 Copiar CPF + nascimento dos ${visiveis.length} (colar no Excel)`}
          </button>
          <span style={s.loteDica}>vem em 4 colunas: CPF · nascimento · nome · filhos elegíveis</span>
        </div>
      )}

      {loading ? (
        <div style={s.vazio}>Carregando…</div>
      ) : visiveis.length === 0 ? (
        <div style={s.vazio}>✅ Nenhuma análise pendente. Fila limpa.</div>
      ) : visiveis.map(c => {
        const f = FILAS[c.fila] || FILAS.SEM_CNIS_20MIN
        const ehPre = c.fila === 'PRE_APROVADO'
        const aberto = abrindo && abrindo.id === c.id
        const href = linkChat(c)
        const filhos = listaFilhos(c.filhos_elegiveis)
        const variosFilhos = filhos.length > 1
        return (
          <div key={c.id} style={s.card(ehPre)}>
            <div style={s.linha}>
              <div>
                <div style={s.nome}>
                  {/* caixa de seleção só na aba de reprovação em lote */}
                  {c.nome || 'Cliente +Mais Mãe'}
                </div>
                <div style={s.dado}>
                  {c.tel || 'sem telefone'}
                  {(() => {
                    const v = whatsDoLead(c)
                    const w = WHATS[chaveWhats(v)]
                    return (<>
                      <span style={s.seloWhats(w.cor, w.bg)} title={
                        v === 'true' ? 'o número tem WhatsApp'
                        : v === 'false' ? 'o número NÃO tem WhatsApp — ligar, não mandar mensagem'
                        : 'ainda não foi verificado — não significa que não tenha'
                      }>{w.label}</span>
                      {/* So aparece em quem ainda nao tem resposta e tem telefone.
                          Some de vez quando o validador cai (whatsParado) ou quando
                          esse lead ja gastou as tentativas. Gasta 1 consulta por clique. */}
                      {VERIFICAR_WHATS_LIGADO && chaveWhats(v) === 'nver' && c.tel && !whatsParado
                        && (whatsTent[c.id] || 0) < MAX_TENTATIVAS_WHATS && (
                        <button style={s.btnWhats(verifWhats === c.id)}
                          disabled={!!verifWhats}
                          onClick={() => verificarWhats(c)}
                          title="Consulta agora se esse número tem WhatsApp. Gasta 1 consulta do chip — use quando fizer diferença.">
                          {verifWhats === c.id ? '⏱️ verificando…'
                            : (whatsTent[c.id] ? '🔁 Tentar de novo' : '🔍 Verificar')}
                        </button>
                      )}
                      {whatsErro[c.id] && <span style={s.whatsErro}>{whatsErro[c.id]} — decida normalmente</span>}
                      {!whatsParado && (whatsTent[c.id] || 0) >= MAX_TENTATIVAS_WHATS && (
                        <span style={s.whatsErro}>já tentei 2× nesse número — não insiste, cada tentativa gasta o chip</span>
                      )}
                    </>) })()}
                  {' · '}parada há {fmtTempo(c.minutos_parado)} · {c.estado || '—'}
                </div>

                <div style={s.gerid}>
                  <div style={s.geridTit}>Pra consultar no GERID</div>
                  <div style={s.geridLinha}>
                    <button style={s.btnCopia(!c.cpf_ok)} disabled={!c.cpf_ok}
                      onClick={() => copiarCom('cpf' + c.id, c.cpf_limpo)}>
                      {copiado === 'cpf' + c.id ? '✅ copiado' : '📋 CPF'}
                    </button>
                    <span style={s.valor}>{c.cpf || '— sem CPF —'}</span>
                    {!c.cpf_ok && <span style={s.alertaMini}>CPF inválido</span>}
                  </div>
                  <div style={s.geridLinha}>
                    <button style={s.btnCopia(!c.nasc_br)} disabled={!c.nasc_br}
                      onClick={() => copiarCom('dt' + c.id, c.nasc_br)}>
                      {copiado === 'dt' + c.id ? '✅ copiado' : '📋 Nasc.'}
                    </button>
                    <span style={s.valor}>{c.nasc_br || '— sem data —'}</span>
                    {c.nasc_precisao === 'so mes/ano' && (
                      <span style={s.alertaMini}>a cliente só deu mês/ano — dia é chute</span>
                    )}
                    {c.nasc_precisao === 'sem data' && <span style={s.alertaMini}>pedir a data</span>}
                  </div>

                  {/* 20/09 — filhos dentro do prazo de 5 anos. Só aparece quando existe. */}
                  {filhos.length > 0 && (
                    <div style={s.filhosBox(variosFilhos)}>
                      <div style={s.filhosTit}>
                        {variosFilhos ? `Filhos elegíveis · ${filhos.length}` : 'Filho elegível'}
                      </div>
                      <div style={s.filhosDatas}>{filhos.join(', ')}</div>
                      {variosFilhos && (
                        <div style={s.filhosNota}>
                          ⚠️ Mãe com mais de um filho elegível — conferir cada um.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div style={s.badges}>
                {c.do_detetive && (
                  <span style={s.badge(DETETIVE_COR, DETETIVE_BG)} title="data de nascimento lida no órgão">
                    🕵️ Detetive
                  </span>
                )}
                <span style={s.badge(f.cor, f.bg)}>{f.label}</span>
              </div>
            </div>

            {(c.veredito_maquina || c.motivo_maquina) && (
              <div style={s.maquina}>
                <b>Máquina:</b> {c.veredito_maquina || '—'}
                {c.motivo_maquina ? ' · ' + c.motivo_maquina : ''}
              </div>
            )}

            {/* 21/09 — o que o ROBÔ DO GERID achou. Um bloco por filho, com o
                motivo em texto. Isso é sugestão: quem decide é ela. */}
            {c.gerid_veredito && (
              <div style={s.roboBox(abaGerid(c) === 'aud')}>
                <div style={s.roboTopo}>
                  <span>🤖 <b>Robô consultou o GERID</b>{c.gerid_em ? ' · ' + fmtQuando(c.gerid_em) : ''}</span>
                  {Array.isArray(c.gerid_prints) && c.gerid_prints.length > 0 && (
                    <span style={s.roboPrintOk} title="o robô guardou a imagem do GERID — você não precisa colar print">
                      🗂️ print guardado
                    </span>
                  )}
                </div>
                {c.gerid_resumo && <div style={s.roboResumo}>{c.gerid_resumo}</div>}
                {(Array.isArray(c.gerid_filhos) ? c.gerid_filhos : []).map((fl, i) => {
                  const sg = seloFilho(fl && fl.sugestao)
                  return (
                    <div key={i} style={s.roboFilho}>
                      <span style={s.roboSelo(sg.cor, sg.bg)}>{sg.label}</span>
                      <span style={s.roboFilhoNome}>
                        {fl && fl.nome ? fl.nome : 'filho'}{fl && fl.dn ? ' · ' + brDeIso(fl.dn) : ''}
                      </span>
                      {fl && fl.motivo && <div style={s.roboMotivo}>{fl.motivo}</div>}
                    </div>
                  )
                })}
              </div>
            )}

            {!aberto && (
              <div style={s.acoes}>
                <button style={s.btnOk} onClick={() => abrirPainel(c, 'ok')}>
                  ✅ Pré-aprovado real
                </button>
                <button style={s.btnNao} onClick={() => abrirPainel(c, 'nao')}>
                  ⛔ Negar
                </button>
                {href && (
                  <a style={s.btnChat} href={href} target="_blank" rel="noreferrer">💬 Abrir conversa</a>
                )}
              </div>
            )}

            {aberto && (
              <div style={s.motivos}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
                  {abrindo.tipo === 'ok' ? 'Por que ela é pré-aprovada?' : 'Por que ela foi negada?'}
                </div>

                {/* 21/09 — o que o robô leu no GERID: prints e vínculos.
                    Vem sob demanda (mesa_gerid_detalhe), só ao abrir o lead. */}
                {c.gerid_veredito && (
                  <div style={s.vincBox}>
                    <div style={s.vincTit}>
                      <span>🤖 O que o robô leu no GERID</span>
                      {detCarregando && <span style={{ fontWeight: 400, textTransform: 'none' }}>carregando…</span>}
                    </div>

                    {printsDoRobo(c).map((u, i) => (
                      <a key={i} href={u} target="_blank" rel="noreferrer" title="abrir em tamanho real">
                        <img src={u} alt={'GERID ' + (i + 1)} style={s.vincImg} />
                      </a>
                    ))}

                    {/* 22/09 — o TEXTO que o robô leu no GERID. Hoje é a prova
                        que existe de fato: prints[] está vazio em todos os 126
                        consultados, e a tela vem em 117 deles. */}
                    {detGerid && detGerid.tela && (
                      <div style={{ marginTop: 8 }}>
                        <button style={s.btnLoteSec} onClick={() => setVerTela(v => !v)}>
                          {verTela ? 'esconder' : 'ver'} o que o robô leu na tela do GERID
                        </button>
                        {verTela && <pre style={s.telaGerid}>{detGerid.tela}</pre>}
                      </div>
                    )}

                    {detGerid && Array.isArray(detGerid.vinculos) && detGerid.vinculos.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <button style={s.btnLoteSec} onClick={() => setVerVinculos(v => !v)}>
                          {verVinculos ? 'esconder' : 'ver'} os {detGerid.vinculos.length} vínculos do CNIS
                        </button>
                        {verVinculos && detGerid.vinculos.map((v, i) => (
                          <div key={i} style={s.vincLinha}>
                            <b>{v && v.nome ? v.nome : '—'}</b>
                            {v && v.tipo ? ' · ' + v.tipo : ''}
                            {v && v.inicio ? ' · ' + v.inicio : ''}{v && v.fim ? ' → ' + v.fim : ''}
                          </div>
                        ))}
                      </div>
                    )}

                    {!detCarregando && !printsDoRobo(c).length && !c.gerid_tem_consulta && (
                      <div style={{ fontSize: 11.5, color: '#92400e', marginTop: 4 }}>
                        O robô não guardou nem imagem nem texto deste — se for pré-aprovar, cole o print do GERID abaixo.
                      </div>
                    )}
                  </div>
                )}

                {/* PRINT DO GERID — só na pré-aprovação */}
                {abrindo.tipo === 'ok' && (
                  <div>
                    {/* IMPORTANTE: clicar aqui NAO abre a janela de arquivos.
                        Antes abria, o dialogo do Windows roubava o foco e o Ctrl+V
                        ia parar nele em vez da pagina. Agora o clique so foca a area. */}
                    <div
                      ref={colaRef}
                      tabIndex={0}
                      style={s.colaArea(!!print)}
                      onPaste={colarDoEvento}
                      onClick={() => { if (colaRef.current && colaRef.current.focus) colaRef.current.focus() }}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); pegarImagem(e.dataTransfer.files && e.dataTransfer.files[0]) }}>
                      <div style={s.colaTit(!!print)}>
                        {print ? '✅ Print do GERID anexado' : '📋 Aperta Ctrl + V agora'}
                      </div>
                      <div style={s.colaDica}>
                        {print
                          ? 'Se colar outro por cima, esse é substituído.'
                          : 'Copia o print do GERID e cola aqui. Não precisa salvar arquivo nem clicar em nada — só Ctrl + V.'}
                      </div>
                    </div>
                    {!print && (
                      <div style={{ textAlign: 'center', marginBottom: 8 }}>
                        <button type="button" style={s.linkArquivo}
                          onClick={() => fileRef.current && fileRef.current.click()}>
                          se preferir, escolher um arquivo salvo
                        </button>
                      </div>
                    )}
                    <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={e => pegarImagem(e.target.files && e.target.files[0])} />
                    {print && (
                      <div style={s.previewWrap}>
                        <img src={print.preview} alt="print do GERID" style={s.preview} />
                        <div style={{ textAlign: 'center' }}>
                          <button style={s.btnTiraPrint} onClick={limparPrint}>🗑️ tirar esse print</button>
                        </div>
                      </div>
                    )}
                    {!print && !temProvaDoRobo(c) && (
                      <div style={{ ...s.colaDica, color: '#b45309', fontWeight: 600, marginBottom: 8, textAlign: 'center' }}>
                        Sem o print os motivos abaixo ficam bloqueados.
                      </div>
                    )}
                    {!print && temProvaDoRobo(c) && (
                      <div style={{ ...s.colaDica, color: '#059669', fontWeight: 600, marginBottom: 8, textAlign: 'center' }}>
                        ✅ {printsDoRobo(c).length > 0
                              ? 'O print do robô já vale como prova'
                              : 'O que o robô leu no GERID já vale como prova'} — não precisa colar nada.
                        Se quiser anexar o seu também, cole aqui.
                      </div>
                    )}
                  </div>
                )}
                {/* 20/09 — mae com mais de um filho no prazo: ela marca quais
                    entram. Comeca com todos marcados. Desmarcar todos nao e
                    aprovacao parcial: se nenhum serve, o caminho e "Negar",
                    que avisa a cliente. Com um filho so, nao aparece nada. */}
                {abrindo.tipo === 'ok' && filhos.length > 1 && (
                  <div style={s.escolhaBox}>
                    <div style={s.escolhaTit}>
                      Quais filhos entram? ({filhosOk.length} de {filhos.length})
                    </div>
                    {filhos.map((fl, i) => {
                      const on = filhosOk.includes(fl)
                      return (
                        <button key={fl + i} type="button" style={s.escolhaItem(on)}
                          onClick={() => alternarFilho(fl)}>
                          <span style={s.escolhaMarca(on)}>{on ? '✓' : '✗'}</span>
                          <span style={s.escolhaTexto}>{fl}</span>
                        </button>
                      )
                    })}
                    <div style={s.escolhaNota}>
                      Só os marcados vão pro grupo e ficam gravados no lead. O que você
                      desmarcar não entra — e não manda mensagem nenhuma pra cliente.
                    </div>
                    {filhosOk.length === 0 && (
                      <div style={{ ...s.escolhaNota, color: '#b45309', fontWeight: 700 }}>
                        Nenhum filho marcado. Se nenhum serve, use <b>Negar</b> — aí a cliente é avisada.
                      </div>
                    )}
                  </div>
                )}

                {(abrindo.tipo === 'ok' ? MOTIVOS_APROVA : MOTIVOS_NEGA).map(m => (
                  m === 'Outro motivo' ? (
                    <div key={m}>
                      <input
                        style={s.input}
                        placeholder="Escreva o motivo…"
                        value={outroTexto}
                        onChange={e => setOutroTexto(e.target.value)}
                      />
                      <button
                        style={{ ...s.motivoBtn('#dc2626'), fontWeight: 600 }}
                        disabled={salvando || !outroTexto.trim()}
                        onClick={() => decidir(c, false, outroTexto)}
                      >
                        ⛔ Negar com esse motivo
                      </button>
                    </div>
                  ) : (
                    <button
                      key={m}
                      style={{
                        ...s.motivoBtn(abrindo.tipo === 'ok' ? '#059669' : '#dc2626'),
                        // 21/09: print do robô libera igual ao print colado
                        ...(abrindo.tipo === 'ok'
                            && ((!print && !temProvaDoRobo(c)) || (filhos.length > 1 && filhosOk.length === 0))
                            ? { opacity: 0.45, cursor: 'not-allowed' } : {}),
                      }}
                      disabled={salvando || (abrindo.tipo === 'ok'
                        && ((!print && !temProvaDoRobo(c)) || (filhos.length > 1 && filhosOk.length === 0)))}
                      onClick={() => decidir(c, abrindo.tipo === 'ok', m)}
                    >
                      {m}
                    </button>
                  )
                ))}
                {(salvando || subindoPrint) && (
                  <div style={{ ...s.colaDica, textAlign: 'center', fontWeight: 600 }}>
                    {subindoPrint ? 'subindo o print…' : 'salvando…'}
                  </div>
                )}
                <button
                  style={{ ...s.motivoBtn('#5b6b84'), textAlign: 'center', marginTop: 4 }}
                  onClick={fecharPainel}
                >
                  cancelar
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
