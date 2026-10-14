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
// 23/09 (Bruno) — TRÊS chips, e nada mais. A mesa tinha virado uma salada de
// eixos (origem do dado, fila do funil, WhatsApp, robô) que respondiam
// perguntas diferentes ao mesmo tempo, e por isso ela abria um lead e via o
// robô, abria outro e não via. Agora o eixo é UM só: em que pé está o robô.
//
//   fila  -> o assistente ainda não consultou. Não tem o que decidir aqui ainda.
//   apr   -> o robô aprovou. Ela confere e libera. É onde sai venda.
//   neg   -> o assistente não encontrou direito e separou pra ela conferir.
// 28/09 (Bruno) — a aba "Aprovadas" virou DUAS. O robô aprova por dois caminhos
// diferentes e eles exigem conversas diferentes com a cliente:
//   12 meses  -> parou de contribuir e ainda está no período de graça. Direito
//                limpo, libera direto.
//   12 a 24   -> o direito só existe pela EXTENSÃO do período de graça, que
//                depende de seguro-desemprego ou 120 contribuições. O próprio
//                robô escreve "CONFIRMAR seguro-desemprego com a cliente".
// Misturados numa aba só, o segundo grupo era liberado como se fosse o primeiro
// — e a confirmação que ele exige passava batido.
const GERID = {
  fila:  { label: '⏳ Fila do assistente',  cor: '#5b6b84', bg: 'rgba(15,23,42,.05)',
           dica: 'O assistente ainda não consultou o GERID destes' },
  apr12: { label: '✅ 12 meses',      cor: '#059669', bg: 'rgba(5,150,105,.10)',
           dica: 'Direito dentro do período de graça de 12 meses — pode liberar direto' },
  apr24: { label: '✅ 12 a 24 meses', cor: '#0d9488', bg: 'rgba(13,148,136,.10)',
           dica: 'Direito por extensão — CONFIRME o seguro-desemprego com a cliente antes de liberar' },
  neg:   { label: '⛔ Negadas',       cor: '#b45309', bg: 'rgba(180,83,9,.10)',
           dica: 'O assistente não encontrou direito aqui e separou pra você conferir' },
}

// 14/10 — SELO DO SEGURO-DESEMPREGO (lead de 24 meses).
// A classe vem PRONTA do banco (dados_json.gerid_seguro, preenchido por trigger,
// ou a funcao gerid_seguro_provavel). Aqui so se escolhe cor e texto — nenhuma
// regra de seguro-desemprego e decidida no front.
const SEGURO = {
  provavel:   { label: '24m · Seguro provável',     cor: '#047857', bg: 'rgba(5,150,105,.12)' },
  improvavel: { label: '24m · Sem seguro provável', cor: '#b45309', bg: 'rgba(180,83,9,.12)' },
  sem_dado:   { label: '24m · Conferir vínculos',   cor: '#5b6b84', bg: 'rgba(15,23,42,.06)' },
}
// 14/10 — SELO GRANDE do cabecalho. So combina dois campos que ja vem prontos do
// banco (faixa + seguro_classe) pra escolher rotulo e cor. Nenhuma regra sai daqui.
const seloFaixa = (c) => {
  if (!c) return null
  if (c.seguro_classe === 'provavel')   return { label: '24m · Seguro provável',     cor: '#047857', bg: 'rgba(5,150,105,.14)' }
  if (c.seguro_classe === 'improvavel') return { label: '24m · Sem seguro provável', cor: '#b45309', bg: 'rgba(180,83,9,.14)' }
  if (c.seguro_classe === 'sem_dado')   return { label: 'Conferir vínculos',         cor: '#5b6b84', bg: 'rgba(15,23,42,.07)' }
  if (c.faixa_venda === '12')           return { label: '12 meses',                  cor: '#047857', bg: 'rgba(5,150,105,.14)' }
  if (c.faixa_venda === '24')           return { label: '24 meses',                  cor: '#0d9488', bg: 'rgba(13,148,136,.14)' }
  return null
}
// O filho que deu o direito e o motivo dele, tirados do que a RPC ja manda.
const filhoDoDireito = (c) => {
  const lista = Array.isArray(c && c.gerid_filhos) ? c.gerid_filhos : []
  const v = c && c.vinculo_direito
  if (v && v.filho_dn) { const m = lista.find(f => f && f.dn === v.filho_dn); if (m) return m }
  return lista.find(f => f && f.sugestao === 'aprovar') || null
}
// Filhos que o assistente NAO aprovou. Ficam numa linha discreta, nao somem.
const filhosReprovados = (c) =>
  (Array.isArray(c && c.gerid_filhos) ? c.gerid_filhos : []).filter(f => f && f.sugestao === 'reprovar')
// 14/10 — o aviso de nome vem DENTRO do texto do gerid_resumo, escrito pelo
// assistente ("ATENCAO nome do portal ... nao bate com o CRM"). Nao existe campo
// proprio no banco. Aqui so se recorta a frase pra virar faixa; nada e comparado.
const avisoNome = (c) => {
  const r = (c && c.gerid_resumo) || ''
  const m = r.match(/ATENCAO[^|]*nome do portal[^|]*/i)
  return m ? m[0].trim() : null
}
// quantos vinculos o CNIS tem, pelo numero que o proprio resumo abre ("3 vinculo(s) | ...")
const qtdVinculos = (c) => {
  const v = c && c.vinculo_direito
  if (v && v.total_vinculos) return v.total_vinculos
  const m = ((c && c.gerid_resumo) || '').match(/^(\d+)\s+vinculo/i)
  return m ? Number(m[1]) : null
}
// 14/10 — qual botao de decisao combina com a faixa/seguro deste lead. SO destaca:
// o advogado continua tendo que clicar, e todos os botoes seguem habilitados.
const motivoSugerido = (c) => {
  if (!c) return null
  if (c.seguro_classe === 'provavel' || c.seguro_classe === 'improvavel') return MOTIVOS_APROVA[1]
  if (c.faixa_venda === '12') return MOTIVOS_APROVA[0]
  if (c.faixa_venda === '24') return MOTIVOS_APROVA[1]
  return null
}

// Quando mostrar: o BANCO ja decidiu. A mesa_advogada_espera_v2 devolve
// seguro_classe NULA quando nao e caso de 24 meses por seguro. Aqui so se
// pergunta se veio classe — nenhuma regra de seguro-desemprego sai daqui.
const seloSeguro = (c) => (c && c.seguro_classe ? SEGURO[c.seguro_classe] || null : null)
const dicaSeguro = (c) => {
  if (!c) return ''
  const p = []
  if (c.seguro_motivo) p.push(c.seguro_motivo)
  if (c.meses_nos_18 != null) p.push(c.meses_nos_18 + ' meses de carteira nos 18 antes da demissão')
  if (c.demissao) p.push('demissão ' + c.demissao)
  // 14/10 — a faixa fica AQUI, no tooltip, e nao num chip proprio: a tela ja tem
  // os chips "12 meses" e "12 a 24 meses" do assistente, e um segundo par com os
  // mesmos numeros so confundia quem bate o olho.
  if (c.faixa_venda) p.push('faixa de venda: ' + c.faixa_venda + ' meses')
  return p.join(' · ')
}

// 14/10 — DESLIGADA do uso. Era ela que decidia os chips "12 meses" / "12 a 24
// meses" lendo o texto do motivo do GERID. Agora essa decisao vem do banco, pela
// retroativo_faixa_do_lead, que chega em c.faixa_venda. Nao religar: o motivo do
// GERID nao sabe do seguro-desemprego, entao ele joga em "12 a 24" uma venda que
// na verdade e de 12.
// Em qual faixa o robô encaixou o direito. Lê o motivo que ele escreveu em cada
// filho APROVADO — reprovado não conta, senão um filho negado por "já recebeu"
// mudaria a aba de uma cliente que tem direito por outro.
// Quando a mesma cliente tem um filho de 12 meses e outro de 12 a 24, vale o de
// 12: é o caso mais forte, e não obriga a advogada a confirmar nada.
const faixaGerid = (c) => {
  const filhos = Array.isArray(c && c.gerid_filhos) ? c.gerid_filhos : []
  const motivos = filhos
    .filter(f => f && f.sugestao === 'aprovar')
    .map(f => String((f && f.motivo) || '').toLowerCase())
  if (motivos.some(m => m.includes('dentro dos 12 meses'))) return '12'
  if (motivos.some(m => m.includes('entre 12 e 24') || m.includes('24 meses') || m.includes('120 contrib'))) return '24'
  return null
}
// A ordem aqui importa: APROVAR vence a marca de auditoria. Um lead que o robô
// reprovou e depois, ao reconsultar, aprovou, fica com as duas marcas no banco —
// e se a auditoria ganhasse, uma venda liberada apareceria como "Negada".
// Auditoria só faz sentido em cima de reprovação.
const abaGerid = (c) => (
  !c ? null
  // 14/10 — a faixa vem do BANCO (mesa_advogada_espera_v2 -> retroativo_faixa_do_lead),
  // nao mais do texto do motivo do GERID. 12 meses e 12 meses: o 24 meses com
  // seguro-desemprego provavel JA ENTRA AQUI como 12, que e a faixa de venda real.
  // Sem faixa (lead ainda sem classificacao) cai em "12 a 24", que e a aba que pede
  // conferencia — errar pro lado de olhar a mais, nao a menos.
  : c.gerid_veredito === 'aprovar' ? (c.faixa_venda === '12' ? 'apr12' : 'apr24')
  // 13/10 — "Negadas" agora exige as DUAS coisas: a marca de auditoria E a prova
  // de que o robô realmente consultou (print guardado ou texto da tela). Sem a
  // segunda condição, um lead que recebesse a marca antes da consulta aparecia
  // na aba de negadas sem o robô ter olhado o GERID dele. No banco de hoje isso
  // é zero, então nada muda na tela — é trava pra não voltar a acontecer.
  : (c.gerid_auditoria && c.gerid_tem_consulta) ? 'neg'
  : !c.gerid_tem_consulta ? 'fila'
  : 'fila')

// selo por filho. 'conferir' do robô é mostrado como aprovar, pelo mesmo motivo.
const SUGESTAO = {
  aprovar:  { label: '✅ assistente sugere SEGUIR',  cor: '#059669', bg: 'rgba(5,150,105,.12)' },
  reprovar: { label: '⛔ assistente sugere NÃO SEGUIR', cor: '#b45309', bg: 'rgba(180,83,9,.12)' },
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
  // 14/10 — selo grande da faixa/seguro, no cabecalho do lead.
  seloTopo: (cor, bg) => ({ display: 'inline-block', padding: '7px 14px', borderRadius: 999, fontSize: 14, fontWeight: 800, background: bg, color: cor, whiteSpace: 'nowrap', letterSpacing: '0.2px' }),
  // card unico "Por que tem direito"
  pqBox: (neg) => ({ border: '1px solid ' + (neg ? 'rgba(180,83,9,.45)' : '#d7e0ec'), borderRadius: 11, padding: '11px 13px', background: neg ? 'rgba(251,191,36,.09)' : '#f8fbff', marginTop: 10 }),
  pqTit: { fontSize: 11, fontWeight: 800, color: '#5b6b84', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 7 },
  pqLinha: { fontSize: 13.5, color: '#0f172a', lineHeight: 1.55 },
  pqForte: { fontWeight: 700 },
  pqMotivo: { fontSize: 12.5, color: '#41506b', marginTop: 5, lineHeight: 1.5 },
  faixaAmarela: { marginTop: 9, padding: '8px 11px', borderRadius: 9, background: 'rgba(251,191,36,.18)', border: '1px solid rgba(180,83,9,.35)', color: '#854f0b', fontSize: 12.5, fontWeight: 700, lineHeight: 1.5 },
  faixaVermelha: { marginTop: 9, padding: '8px 11px', borderRadius: 9, background: 'rgba(220,38,38,.10)', border: '1px solid rgba(185,28,28,.45)', color: '#b91c1c', fontSize: 12.5, fontWeight: 700, lineHeight: 1.5 },
  reprovados: { marginTop: 8, fontSize: 12, color: '#5b6b84', lineHeight: 1.5 },
  // botao primario dos vinculos
  btnCNIS: { width: '100%', marginTop: 10, padding: '12px 14px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  linkMini: { background: 'none', border: 'none', color: '#185fa5', fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline', padding: 0, fontFamily: 'inherit' },
  provaMini: { marginTop: 7, fontSize: 11.5, color: '#41506b', lineHeight: 1.6 },
  vincTabela: { marginTop: 8, borderTop: '1px solid #e4eaf3' },
  vincRow: (destaque) => ({ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, padding: '7px 9px', borderBottom: '1px solid #eef2f8', fontSize: 12.5, background: destaque ? 'rgba(5,150,105,.09)' : 'transparent', borderLeft: destaque ? '3px solid #059669' : '3px solid transparent' }),
  vincEmpresa: { fontWeight: 700, color: '#0f172a' },
  vincPeriodo: { color: '#5b6b84', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
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
  // 21/09 — assistente do GERID
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
  vincTexto: { marginTop: 6, padding: '8px 10px', background: 'rgba(37,99,235,.06)', border: '0.5px solid rgba(37,99,235,.2)', borderRadius: 8, fontSize: 11.5, lineHeight: 1.6, color: '#0f172a', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', margin: '6px 0 0' },
  vincDireito: { marginTop: 6, padding: '6px 9px', background: 'rgba(37,99,235,.07)', border: '0.5px solid rgba(37,99,235,.2)', borderRadius: 7, fontSize: 11.5, color: '#0f172a', lineHeight: 1.5 },
  provaOk: { marginBottom: 10, padding: '10px 12px', background: 'rgba(5,150,105,.09)', border: '0.5px solid rgba(5,150,105,.28)', borderRadius: 9, fontSize: 12.5, fontWeight: 600, color: '#065f46', lineHeight: 1.55 },
  provaLink: { display: 'block', marginTop: 5, padding: 0, background: 'none', border: 0, color: '#5b6b84', fontSize: 11.5, fontWeight: 500, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' },
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
  // 22/09 — era 'sticky' e por isso a advogada NAO via a linha do grupo:
  // sticky so gruda enquanto o elemento ainda esta na tela, e ela decide no
  // MEIO da lista, com a pagina ja rolada muito abaixo do topo. O aviso nascia
  // la em cima, fora do campo de visao, e ela nunca soube que ele existia.
  // Com 'fixed' ele aparece na frente, onde quer que ela esteja na pagina.
  avisoWrap: (ok) => ({
    position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)',
    width: 'min(1100px, calc(100vw - 24px))', maxHeight: '70vh', overflowY: 'auto',
    boxSizing: 'border-box', zIndex: 60, padding: 14, borderRadius: 12,
    boxShadow: '0 10px 30px rgba(15,23,42,.22)',
    background: ok ? '#ecfdf5' : '#fef2f2',
    border: '1px solid ' + (ok ? '#34d399' : '#f87171') }),
  avisoTitulo: (ok) => ({ fontSize: 12, fontWeight: 600, color: ok ? '#065f46' : '#991b1b', marginBottom: 8 }),
  avisoLinha: { fontSize: 15, fontWeight: 600, color: '#0f172a', background: '#ffffff', padding: '10px 12px', borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.11)', wordBreak: 'break-word', lineHeight: 1.45, whiteSpace: 'pre-wrap' },
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
// 22/09 (Bruno) — a vendedora precisa saber QUAL empresa fez valer o direito,
// pra conferir com a cliente na ligação. O robô já identificou; aqui isso vira
// texto de gente.
// Benefício e recolhimento NÃO são empregador: dizer "você trabalhou na AUXILIO
// DOENCA" queima a ligação, por isso o rótulo muda.
const textoVinculo = (v) => {
  if (!v) return ''
  if (v.bruto) return v.bruto
  const periodo = v.inicio ? `${v.inicio} a ${v.fim}` : `até ${v.fim}`
  const quando = v.meses_antes_do_parto === 0
    ? 'no mês do parto'
    : `${v.meses_antes_do_parto} ${v.meses_antes_do_parto === 1 ? 'mês' : 'meses'} antes do parto`
  return v.eh_beneficio
    ? `${v.empresa} (${v.tipo}) — ${periodo}, ${quando}`
    : `${v.empresa} — ${v.tipo}, ${periodo}, ${quando}`
}
const rotuloVinculo = (v) => (v && v.eh_beneficio ? 'Benefício que garante o direito' : 'Empresa que garante o direito')

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
  // 21/09 — abas do assistente do GERID
  const [fGerid, setFGerid] = useState('tudo')      // tudo | conf | rep
  // 07/10 — filtro por advogado, só pra quem enxerga a mesa inteira (admin e
  // Maithe). Serve pra ver o que cada um já fez e o que falta.
  const [fAdv, setFAdv] = useState('todos')
  // 14/10 — eixo do seguro-desemprego. So faz sentido no lead de 24 meses.
  // 14/10 — janela dos vinculos do CNIS, agora aberta pelo botao principal e nao
  // so depois de clicar em pre-aprovar/negar. Usa a MESMA mesa_gerid_detalhe.
  const [cnisAberto, setCnisAberto] = useState(null)   // id do lead
  const [cnisDet, setCnisDet] = useState(null)
  const [cnisCarregando, setCnisCarregando] = useState(false)
  const [cnisBruto, setCnisBruto] = useState(false)
  const [fSeg, setFSeg] = useState('tudo')          // tudo | provavel | improvavel | sem_dado
  const [busca, setBusca] = useState('')            // 22/09 — nome, telefone ou CPF
  const [detGerid, setDetGerid] = useState(null)    // detalhe do lead aberto (vínculos, prints, tela)
  const [detCarregando, setDetCarregando] = useState(false)
  const [verVinculos, setVerVinculos] = useState(false)
  const [verTela, setVerTela] = useState(false)
  const [colarMesmoAssim, setColarMesmoAssim] = useState(false)
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
  // 14/10 (Bruno): botao da Maithe que fecha a distribuicao do dia. O estado
  // inteiro vem do banco (retroativo_trava_status): travado, quem fechou, a
  // que hora, quantos estao represados e se EU posso clicar. Nao decido
  // permissao no front — quem decide e a retroativo_pode_travar.
  const [trava, setTrava] = useState(null)
  const [travando, setTravando] = useState(false)
  const fileRef = useRef(null)
  const colaRef = useRef(null)   // area que recebe o Ctrl+V

  // 13/10 — O CORTE DE 1.000 DO POSTGREST (db-max-rows). A resposta volta cortada
  // em 1.000 linhas, sem erro e sem aviso. Com a mesa perto desse numero da dois
  // estragos: leads somem da lista, e — pior — mesa_advogada e mesa_advogada_donos
  // cortam conjuntos DIFERENTES, entao lead que vem numa e nao na outra aparece
  // como "sem dono" com zero sem dono no banco.
  // CUIDADO AO MEXER: .range() aqui FUNCIONA. O supabase-js nao usa o header Range
  // numa chamada RPC — ele monta ?offset=&limit= na query string, que e o caminho
  // que o PostgREST aceita. (Testado com o fetch interceptado: .range(1000,1999)
  // vira "?offset=1000&limit=1000".) Testar isso com curl mandando o header Range
  // da falso negativo: o header e mesmo ignorado em RPC. Ja removi esta paginacao
  // uma vez por causa desse teste errado e os 1.000 voltaram na hora.
  // O de-duplica por id porque a funcao e reexecutada a cada pagina e um lead
  // decidido no meio do caminho desloca a ordem.
  const PAGINA = 1000
  const rpcTudo = useCallback(async (fn, args) => {
    const vistos = new Set()
    const todas = []
    for (let de = 0; de < 20000; de += PAGINA) {
      const { data, error } = await supabase.rpc(fn, args).range(de, de + PAGINA - 1)
      if (error) {
        console.error(fn, error)
        // Rede de seguranca: se o .range() for recusado, volta pro comportamento
        // antigo (uma chamada so). Melhor a tela com 1.000 do que a tela vazia.
        if (de === 0) {
          const r2 = await supabase.rpc(fn, args)
          if (r2.error) console.error(fn, r2.error)
          return r2.data || []
        }
        break
      }
      const lote = data || []
      lote.forEach(x => {
        const k = x.id != null ? x.id : x.lead_id
        if (!vistos.has(k)) { vistos.add(k); todas.push(x) }
      })
      if (lote.length < PAGINA) break
    }
    return todas
  }, [])

  const carregar = useCallback(async () => {
    // as tres em paralelo: a lista, de quem e cada lead, e a espera v2 (tempo de
    // espera + classificacao do seguro-desemprego + faixa de venda).
    // 14/10 — mesa_advogada_espera_v2 no lugar da mesa_advogada_espera: traz o
    // entrou_em junto com o resto, entao continua sendo 3 chamadas, nao 4.
    // 14/10 — entrou a 4a: mesa_advogada_filhos, o mapa data -> [nomes] dos
    // filhos, pra linha do grupo sair com o nome completo e nao so a data.
    // Ela NAO chama a mesa_advogada dentro (custa ~420ms, nao 1.590ms) e
    // devolve UMA linha por lead de proposito — ver o comentario do rpcTudo.
    const [r, d, e, fl] = await Promise.all([
      rpcTudo('mesa_advogada', { p_limite: 5000 }),
      rpcTudo('mesa_advogada_donos'),
      rpcTudo('mesa_advogada_espera_v2'),
      rpcTudo('mesa_advogada_filhos'),
    ])
    const donos = {}
    d.forEach(x => { donos[x.lead_id] = x.advogado_nome })
    const extras = {}
    e.forEach(x => { extras[x.lead_id] = x })
    const nomesFilhos = {}
    fl.forEach(x => { nomesFilhos[x.lead_id] = x.filhos || {} })
    // estado do botao de fechar o dia. Fora do Promise.all acima de proposito:
    // devolve UM jsonb (nao e lista), entao nao passa pelo rpcTudo, e se falhar
    // nao pode derrubar o carregamento da mesa — por isso o catch silencioso.
    supabase.rpc('retroativo_trava_status')
      .then(({ data }) => setTrava(data || null))
      .catch(e => console.error('retroativo_trava_status', e))
    setFila(r.map(c => {
      const x = extras[c.id] || {}
      return {
        ...c,
        advogado_nome: donos[c.id] || null,
        entrou_em: x.entrou_em || null,
        // TUDO abaixo vem pronto do banco. Nao recalcular nada disso no front:
        // a regra do seguro-desemprego e da faixa mora na gerid_seguro_provavel
        // e na retroativo_faixa_do_lead.
        seguro_classe: x.seguro_classe || null,
        seguro_motivo: x.seguro_motivo || null,
        meses_nos_18: x.meses_nos_18 == null ? null : x.meses_nos_18,
        demissao: x.demissao || null,
        faixa_venda: x.faixa || null,
        // mapa { "DD/MM/AAAA": ["Nome Completo", ...] }. Vem pronto do banco,
        // ja sem a marcacao "Óbito"/"Indicativo criminal" que a detetive_fila
        // cola no nome da crianca. Nao montar nome no front.
        filhos_nomes: nomesFilhos[c.id] || {},
      }
    }))
    setLoading(false)
  }, [rpcTudo])

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

  const fecharPainel = () => { setAbrindo(null); setOutroTexto(''); limparPrint(); setFilhosOk([]); setColarMesmoAssim(false) }

  // abre o painel ja com todos os filhos marcados
  const abrirPainel = (c, tipo) => {
    setAbrindo({ id: c.id, tipo })
    setOutroTexto(''); limparPrint()
    setFilhosOk(tipo === 'ok' ? listaFilhos(c.filhos_elegiveis) : [])
    // 21/09 — vinculos, prints e a 'tela' do GERID vem SOB DEMANDA, um lead por
    // vez. Ficam fora do board de proposito: sao pesados e o board recarrega
    // de minuto em minuto.
    setDetGerid(null); setVerVinculos(false); setVerTela(false); setColarMesmoAssim(false)
    if (c.gerid_veredito) {
      setDetCarregando(true)
      supabase.rpc('mesa_gerid_detalhe', { p_lead_id: c.id })
        .then(({ data }) => setDetGerid(data || null))
        .catch(e => console.error('mesa_gerid_detalhe', e))
        .finally(() => setDetCarregando(false))
    }
  }

  // 14/10 — abre a lista de vinculos. Mesma RPC que o painel de decisao ja usava,
  // so que agora dispara pelo botao principal. Nenhuma chamada nova foi criada.
  const abrirCNIS = (c) => {
    if (cnisAberto === c.id) { setCnisAberto(null); return }
    setCnisAberto(c.id); setCnisBruto(false)
    if (cnisDet && cnisDet.__id === c.id) return
    setCnisDet(null); setCnisCarregando(true)
    supabase.rpc('mesa_gerid_detalhe', { p_lead_id: c.id })
      .then(({ data }) => setCnisDet(data ? { ...data, __id: c.id } : { __id: c.id }))
      .catch(e => console.error('mesa_gerid_detalhe', e))
      .finally(() => setCnisCarregando(false))
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
      // 14/10 (Bruno): "quando o advogado copia e cola pra mandar nos grupos
      // apareça o nome completo do filho nao só a data de nascimento".
      // O nome vem pronto do banco (mesa_advogada_filhos) num mapa
      // data -> [nomes]; aqui e so lookup pela data que a advogada marcou.
      // Quem nao tem nome no detetive (0,7% da mesa) continua saindo so com a
      // data, exatamente como antes — nunca sai "undefined" no grupo.
      // Gemeos: dois nomes na mesma data, ligados por " e ".
      const comNome = (dn) => {
        const lista = (lead.filhos_nomes || {})[dn]
        return (lista && lista.length) ? `${lista.join(' e ')} — ${dn}` : dn
      }
      const trechoFilhos = filhos.length
        ? ` - ${rotulo}: ${filhos.map(comNome).join(', ')}`
        : ''
      // 22/09 (Bruno): a vendedora liga sem saber onde a cliente trabalhou. A
      // linha do grupo é o único canal que chega nela, então o vínculo que
      // gerou o direito vai junto — em linha separada, pra não virar um
      // parágrafo ilegível no WhatsApp.
      // 22/09 — o robô passou a gravar gerid.vendedor: texto pronto, por
      // filho, já com quebras de linha. Uso ele direto em vez de remontar a
      // frase aqui: qualquer melhora que ele faça no texto chega sozinha, e
      // some o risco de a linha do grupo divergir do que a tela mostra.
      // Só caio no meu formato quando o lead é antigo e não tem esse campo.
      // 22/09 (Bruno): na linha do grupo vai o RECORTE — só o filho que tem
      // direito e a empresa que o sustenta, com entrada e saída. Filho sem
      // direito é assunto da advogada, não da vendedora: na mão dela só cria
      // conversa que derruba a venda.
      const vinc = lead.vinculo_direito
      const trechoVinculo = lead.gerid_venda
        ? `\n\n${lead.gerid_venda}`
        : vinc ? `\n${vinc.eh_beneficio ? '📄' : '🏢'} ${rotuloVinculo(vinc)}: ${textoVinculo(vinc)}` : ''
      setAviso({
        tipo: 'ok',
        cliente: lead.nome || 'cliente',
        semVendedora: !vend,
        texto: `${cpfTxt} - ${dataTxt} - ${prazo} - ${vend || 'SEM VENDEDORA DISPONÍVEL'}${trechoFilhos}${trechoVinculo}`,
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

  // 14/10 (Bruno): fecha/reabre a distribuicao do dia.
  // Fechado NAO para a analise: a advogada segue aprovando igual, o lead so nao
  // cai na vendedora hoje — sai amanha as 8h pelo cron.
  // O motivo e obrigatorio no banco (igual a troca de fila da coordenadora),
  // entao peco aqui antes de chamar.
  const mexerNaTrava = async (fechar) => {
    const motivo = window.prompt(fechar
      ? 'Por que está fechando a distribuição de hoje?\n(ex: limite do dia batido)'
      : 'Por que está reabrindo a distribuição de hoje?')
    if (motivo === null) return                       // cancelou
    if (!motivo || motivo.trim().length < 3) { alert('Escreva o motivo (mínimo 3 letras).'); return }
    setTravando(true)
    try {
      const { data, error } = await supabase.rpc('retroativo_trava_dia',
        { p_travar: fechar, p_motivo: motivo.trim() })
      if (error) { alert('Não deu: ' + error.message); return }
      if (data && data.ok === false) { alert(data.erro || 'Não deu.'); return }
      const { data: st } = await supabase.rpc('retroativo_trava_status')
      setTrava(st || null)
    } finally { setTravando(false) }
  }

  const copiarLote = (lista) => {
    const linhas = lista
      .filter(c => c.cpf_ok)
      .map(c => `${c.cpf_limpo}\t${c.nasc_br || 'sem data'}\t${c.nome || ''}\t${c.filhos_elegiveis || ''}`)
    if (!linhas.length) { alert('Nenhum CPF válido nessa fila.'); return }
    copiarCom('lote', 'CPF\tNascimento\tNome\tFilhos elegíveis\n' + linhas.join('\n'))
  }

  const contagem = fila.reduce((a, c) => { a[c.fila] = (a[c.fila] || 0) + 1; return a }, {})
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

  // 07/10 — quem aparece no seletor de advogado: os donos que existem na fila.
  // Sai da própria fila carregada, então quem só vê o lote dele não ganha
  // seletor nenhum (a lista vem com um nome só, o dele).
  const advogadosNaFila = []
  fila.forEach(c => {
    if (c.advogado_nome && !advogadosNaFila.includes(c.advogado_nome)) advogadosNaFila.push(c.advogado_nome)
  })
  advogadosNaFila.sort((a, b) => a.localeCompare(b))
  const veTodaMesa = advogadosNaFila.length > 1

  // 13/10 — os dois cortes, cada um na sua função, pra cada contador poder
  // ignorar o SEU proprio eixo e respeitar os outros.
  // 07/10 — corte por advogado. "sem_dono" pega o que ficou fora da divisão.
  const casaAdv = (c) => {
    if (fAdv === 'todos') return true
    if (fAdv === 'sem_dono') return !c.advogado_nome
    return c.advogado_nome === fAdv
  }
  // 23/09: eixo ÚNICO. "Todas" mostra a fila inteira; os três chips cortam
  // por onde o assistente está.
  const casaGerid = (c) => (fGerid === 'tudo' || abaGerid(c) === fGerid)
  // 14/10 — terceiro eixo: seguro-desemprego. Lead sem classe (nao se aplica)
  // some quando um dos dois chips esta ligado.
  const casaSeg = (c) => (fSeg === 'tudo' || c.seguro_classe === fSeg)

  // 13/10 — OS NÚMEROS DOS CHIPS MENTIAM. Eles contavam sempre a fila INTEIRA,
  // então escolher um advogado não mudava nada: com Felipe selecionado a tela
  // seguia mostrando "Negadas · 590", que é o total da mesa — Felipe tem 88.
  // Foi isso que fez parecer que os negados do Felipe e da Yasmin "não estavam
  // aparecendo pra eles": o número grande era da mesa toda, não o deles.
  // Agora cada eixo conta dentro do outro: o chip do robô conta DENTRO do
  // advogado escolhido, e o chip do advogado conta DENTRO da aba escolhida.
  const baseGerid = fila.filter(c => casaBusca(c) && casaAdv(c) && casaSeg(c))
  const baseAdv = fila.filter(c => casaBusca(c) && casaGerid(c) && casaSeg(c))
  // mesma logica dos outros eixos: cada chip conta dentro de todos os outros.
  const baseSeg = fila.filter(c => casaBusca(c) && casaGerid(c) && casaAdv(c))
  const contaSeg = (k) => baseSeg.filter(c => c.seguro_classe === k).length
  const temSeguro = fila.some(c => c.seguro_classe)
  const contaGerid = baseGerid.reduce((a, c) => { const k = abaGerid(c); if (k) a[k] = (a[k] || 0) + 1; return a }, {})
  const contaAdv = (nome) => baseAdv.filter(c => c.advogado_nome === nome).length
  const contaSemDono = baseAdv.filter(c => !c.advogado_nome).length

  const visiveis = fila.filter(c => casaBusca(c) && casaGerid(c) && casaAdv(c) && casaSeg(c))
  // quantos a busca acharia se os chips não estivessem filtrando — serve pra
  // dizer "achei 2, mas os filtros escondem" em vez de mentir "não achei nada"
  const achadosSoBusca = bus ? fila.filter(casaBusca).length : 0
  // 23/09 — o que dá pra decidir AGORA vem primeiro. Antes o topo era dos
  // leads que o robô ainda não tinha consultado: ela abria a mesa e tropeçava
  // justamente nos que não dava pra resolver.
  const PESO = { apr12: 0, apr24: 1, neg: 2, fila: 3 }
  // 14/10 — dentro do mesmo grupo, seguro PROVAVEL vem antes: e a venda que vira
  // administrativa, entao e a que vale a pena conferir primeiro.
  const PESO_SEG = { provavel: 0, improvavel: 1, sem_dado: 2 }
  visiveis.sort((a, b) =>
    ((PESO[abaGerid(a)] ?? 9) - (PESO[abaGerid(b)] ?? 9)) ||
    ((PESO_SEG[a.seguro_classe] ?? 3) - (PESO_SEG[b.seguro_classe] ?? 3)))
  const fmtTempo = (m) => {
    const n = Number(m) || 0
    return n >= 60 ? Math.floor(n / 60) + 'h' + String(n % 60).padStart(2, '0') : n + 'min'
  }
  // 13/10 — tempo de espera na mesa do advogado. Em dia/hora, nao em minutos como
  // o fmtTempo acima: ali a conta e de minutos (ultima interacao com a cliente),
  // aqui e de dias. "144h" nao diz nada; "6d" diz.
  const diasEspera = (iso) => {
    if (!iso) return null
    const ms = Date.now() - new Date(iso).getTime()
    return ms > 0 ? ms / 86400000 : 0
  }
  const fmtEspera = (iso) => {
    const dd = diasEspera(iso)
    if (dd === null) return null
    const min = Math.floor(dd * 1440)
    if (min < 60) return min + 'min'
    const h = Math.floor(min / 60)
    if (h < 24) return h + 'h'
    const resto = h % 24
    return Math.floor(h / 24) + 'd' + (resto ? ' ' + resto + 'h' : '')
  }
  // cinza ate 2 dias, ambar de 2 a 4, vermelho acima de 4. So pra bater o olho.
  const corEspera = (iso) => {
    const dd = diasEspera(iso)
    return dd === null ? '#5b6b84' : dd >= 4 ? '#b91c1c' : dd >= 2 ? '#b45309' : '#5b6b84'
  }

  return (
    <div style={s.wrap}>
      <h1 style={s.h1}>⚖️ Mesa da Advogada — Retroativo</h1>

      {/* 14/10 (Bruno): fechar a distribuicao do dia. Quando esta fechado TODA
          a mesa ve a faixa (pra ninguem achar que a entrega quebrou), mas so
          quem tem permissao ve o botao — e quem decide isso e o banco. */}
      {trava && trava.travado && (
        <div style={{ background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 10,
                      padding: '10px 14px', marginBottom: 12, display: 'flex',
                      alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: '#9a3412' }}>
            🔒 Distribuição de hoje fechada
          </span>
          <span style={{ fontSize: 12.5, color: '#7c2d12' }}>
            {trava.travado_por ? `por ${trava.travado_por}` : ''}
            {trava.travado_em ? ` às ${trava.travado_em}` : ''}
            {trava.motivo ? ` · ${trava.motivo}` : ''}
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#9a3412' }}>
            {trava.represados || 0} represada{(trava.represados || 0) === 1 ? '' : 's'} — sai{(trava.represados || 0) === 1 ? '' : 'em'} amanhã às 8h
          </span>
          <span style={{ fontSize: 12, color: '#7c2d12', flex: 1, minWidth: 180 }}>
            Continue aprovando normal: só não cai na vendedora hoje.
          </span>
          {trava.pode_travar && (
            <button style={s.btnLoteSec} disabled={travando}
                    onClick={() => mexerNaTrava(false)}>
              {travando ? 'aguarde…' : '🔓 Reabrir hoje'}
            </button>
          )}
        </div>
      )}
      {trava && !trava.travado && trava.pode_travar && (
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center',
                      gap: 10, flexWrap: 'wrap' }}>
          <button style={s.btnLoteSec} disabled={travando}
                  onClick={() => mexerNaTrava(true)}>
            {travando ? 'aguarde…' : '🔒 Fechar distribuição de hoje'}
          </button>
          <span style={{ fontSize: 12, color: '#5b6b84' }}>
            {trava.entregues_hoje || 0} entregue{(trava.entregues_hoje || 0) === 1 ? '' : 's'} hoje ·
            fechando, o que for aprovado daqui pra frente sai amanhã às 8h
          </span>
        </div>
      )}

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
        <br />🤖 O assistente do GERID consulta antes de você: <b>✅ Aprovadas</b> e <b>⛔ Negadas</b> já vêm com os vínculos.
        A <b>⏳ Fila do assistente</b> é quem ele ainda não alcançou — nessas, consulte o GERID como sempre.
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
        <button style={s.chip('#0f172a', 'rgba(15,23,42,.04)', fGerid === 'tudo')}
          onClick={() => setFGerid('tudo')}>
          Todas · {baseGerid.length}
        </button>
        {['fila', 'apr12', 'apr24', 'neg'].map(k => (
          <button key={k} style={s.chip(GERID[k].cor, GERID[k].bg, fGerid === k)}
            onClick={() => setFGerid(fGerid === k ? 'tudo' : k)}
            title={GERID[k].dica}>
            {GERID[k].label} · {contaGerid[k] || 0}
          </button>
        ))}
      </div>

      {/* 07/10 — só aparece pra quem enxerga a mesa inteira (admin e Maithe).
          Quem vê só o próprio lote não ganha seletor, porque não teria o que
          escolher. O número ao lado de cada nome é o que AINDA FALTA dele:
          a mesa só lista lead não decidido, então o contador cai sozinho
          conforme a pessoa trabalha. */}
      {veTodaMesa && (
        <div style={s.chipsLinha}>
          <span style={s.chipsRotulo}>Advogado</span>
          <button style={s.chip('#0f172a', 'rgba(15,23,42,.04)', fAdv === 'todos')}
            onClick={() => setFAdv('todos')}>
            Todos · {baseAdv.length}
          </button>
          {advogadosNaFila.map(nome => (
            <button key={nome}
              style={s.chip('#185fa5', 'rgba(96,165,250,.12)', fAdv === nome)}
              onClick={() => setFAdv(fAdv === nome ? 'todos' : nome)}
              title={`Falta ${contaAdv(nome)} na mão de ${nome}`}>
              {nome.split(' ')[0]} · {contaAdv(nome)}
            </button>
          ))}
          {fila.some(c => !c.advogado_nome) && (
            <button style={s.chip('#854f0b', 'rgba(251,191,36,.14)', fAdv === 'sem_dono')}
              onClick={() => setFAdv(fAdv === 'sem_dono' ? 'todos' : 'sem_dono')}
              title="Entraram na mesa depois da divisão e ainda não têm dono">
              sem dono · {contaSemDono}
            </button>
          )}
        </div>
      )}

      {/* 14/10 — eixo do seguro-desemprego. So aparece quando ha lead classificado
          na fila: em dia sem nenhum lead de 24 meses a linha nao polui a tela.
          A classificacao e a faixa de venda vem prontas do banco. A DISTRIBUICAO
          entre advogados tambem (maismae.mesa_rotear_faixa, de 2 em 2 min) —
          nada aqui mexe em quem fica com o lead. */}
      {temSeguro && (
        <div style={s.chipsLinha}>
          <span style={s.chipsRotulo}>Seguro-desemprego</span>
          <button style={s.chip('#0f172a', 'rgba(15,23,42,.04)', fSeg === 'tudo')}
            onClick={() => setFSeg('tudo')}>
            Todos · {baseSeg.length}
          </button>
          {['provavel', 'improvavel', 'sem_dado'].map(k => (
            <button key={k} style={s.chip(SEGURO[k].cor, SEGURO[k].bg, fSeg === k)}
              onClick={() => setFSeg(fSeg === k ? 'tudo' : k)}
              title={k === 'provavel'
                ? 'Tem tempo de carteira pra ter recebido seguro-desemprego — confirme com a cliente e a venda vira administrativa'
                : k === 'improvavel'
                ? 'Sem tempo suficiente pra seguro-desemprego — segue pela tese de 24 meses'
                : 'Vínculos insuficientes pra decidir — conferir no CNIS'}>
              {SEGURO[k].label} · {contaSeg(k)}
            </button>
          ))}
        </div>
      )}


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
                  {/* 07/10 — de quem é o lead. Só pra quem enxerga a mesa
                      inteira: pra própria advogada seria o nome dela em todos
                      os cards, puro ruído. */}
                  {veTodaMesa && (
                    <span style={{
                      marginLeft: 8, fontSize: 11, fontWeight: 600, padding: '2px 8px',
                      borderRadius: 20, verticalAlign: 'middle',
                      color: c.advogado_nome ? '#185fa5' : '#854f0b',
                      background: c.advogado_nome ? 'rgba(96,165,250,.12)' : 'rgba(251,191,36,.14)',
                    }} title={c.advogado_nome ? `na mão de ${c.advogado_nome}` : 'entrou depois da divisão, ainda sem dono'}>
                      {c.advogado_nome ? `⚖️ ${c.advogado_nome.split(' ')[0]}` : '⚖️ sem dono'}
                    </span>
                  )}
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
                  {c.entrou_em && (
                    <>
                      {' · '}
                      <b style={{ color: corEspera(c.entrou_em) }}
                         title="há quanto tempo este lead está na mesa do advogado esperando a consulta">
                        ⏱️ na mesa há {fmtEspera(c.entrou_em)}
                      </b>
                    </>
                  )}
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
              {/* 14/10 — coluna da direita: o selo da faixa em cima, sozinho e grande,
                  porque e a primeira coisa que o advogado precisa ver. Os selos
                  pequenos (Detetive, fila) ficam embaixo, numa linha so. */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                {seloFaixa(c) && (
                  <span style={s.seloTopo(seloFaixa(c).cor, seloFaixa(c).bg)} title={dicaSeguro(c)}>
                    {seloFaixa(c).label}
                  </span>
                )}
                <div style={s.badges}>
                  {c.do_detetive && (
                    <span style={s.badge(DETETIVE_COR, DETETIVE_BG)} title="data de nascimento lida no órgão">
                      🕵️ Detetive
                    </span>
                  )}
                  <span style={s.badge(f.cor, f.bg)}>{f.label}</span>
                </div>
              </div>
            </div>

            {(c.veredito_maquina || c.motivo_maquina) && (
              <div style={s.maquina}>
                <b>Máquina:</b> {c.veredito_maquina || '—'}
                {c.motivo_maquina ? ' · ' + c.motivo_maquina : ''}
              </div>
            )}

            {/* 14/10 — UM card so: o "DIREITO" e a sugestao do assistente estavam
                dizendo a mesma coisa duas vezes, e o resumo corrido despejava todos
                os vinculos num paragrafo. Tudo o que aparece aqui ja vem pronto da
                mesa_advogada + mesa_advogada_espera_v2; nada e calculado. */}
            {c.gerid_veredito && (() => {
              const v = c.vinculo_direito
              const fl = filhoDoDireito(c)
              const reps = filhosReprovados(c)
              const aviso = avisoNome(c)
              const n = qtdVinculos(c)
              return (
                <div style={s.pqBox(abaGerid(c) === 'neg')}>
                  <div style={s.pqTit}>
                    {abaGerid(c) === 'neg' ? 'Por que o assistente não viu direito' : 'Por que tem direito'}
                    {c.gerid_em ? ' · consultado ' + fmtQuando(c.gerid_em) : ''}
                  </div>

                  {fl && fl.dn && (
                    <div style={s.pqLinha}>
                      Filho: <span style={s.pqForte}>{brDeIso(fl.dn)}</span>
                    </div>
                  )}

                  {v && (
                    <>
                      <div style={s.pqLinha}>
                        {v.eh_beneficio ? '📄' : '🏢'}{' '}
                        <span style={s.pqForte}>{v.empresa}</span>
                        {v.tipo ? ' · ' + v.tipo : ''}
                        {v.inicio || v.fim ? ' · ' + (v.inicio || '?') + ' → ' + (v.fim || '?') : ''}
                      </div>
                      {v.meses_antes_do_parto != null && (
                        <div style={s.pqLinha}>
                          Saiu <span style={s.pqForte}>
                            {v.meses_antes_do_parto === 0
                              ? 'no mês do parto'
                              : v.meses_antes_do_parto + (v.meses_antes_do_parto === 1 ? ' mês' : ' meses') + ' antes do parto'}
                          </span>
                        </div>
                      )}
                    </>
                  )}

                  {fl && fl.motivo && <div style={s.pqMotivo}>{fl.motivo}</div>}

                  {/* so no 24 meses que depende de seguro-desemprego */}
                  {(c.seguro_classe === 'provavel' || c.seguro_classe === 'improvavel') && (
                    <div style={s.faixaAmarela}>
                      ⚠️ CHECAR SEGURO-DESEMPREGO
                      {c.meses_nos_18 != null && (
                        <div style={{ fontWeight: 600, marginTop: 3 }}>
                          {c.meses_nos_18} meses de carteira nos 18 antes da demissão
                          {c.demissao ? ' · demissão ' + c.demissao : ''}
                        </div>
                      )}
                      {c.seguro_motivo && (
                        <div style={{ fontWeight: 400, marginTop: 3 }}>{c.seguro_motivo}</div>
                      )}
                    </div>
                  )}

                  {aviso && <div style={s.faixaVermelha}>🚨 {aviso}</div>}

                  {reps.length > 0 && (
                    <div style={s.reprovados}>
                      {reps.map((r, i2) => (
                        <div key={i2}>
                          ⛔ {r.dn ? brDeIso(r.dn) : 'outro filho'} — {r.motivo || 'sem direito'}
                        </div>
                      ))}
                    </div>
                  )}

                  <button style={s.btnCNIS} onClick={() => abrirCNIS(c)}>
                    {cnisAberto === c.id ? '▲ Esconder vínculos do CNIS' : '📄 Ver vínculos do CNIS' + (n ? ' (' + n + ')' : '')}
                  </button>

                  {cnisAberto === c.id && (
                    <div>
                      {cnisCarregando && <div style={s.provaMini}>carregando…</div>}

                      {printsDoRobo(c).map((u, i2) => (
                        <a key={i2} href={u} target="_blank" rel="noreferrer" title="abrir em tamanho real">
                          <img src={u} alt={'GERID ' + (i2 + 1)} style={s.vincImg} />
                        </a>
                      ))}

                      {cnisDet && Array.isArray(cnisDet.vinculos) && cnisDet.vinculos.length > 0 && (
                        <div style={s.vincTabela}>
                          {cnisDet.vinculos.map((vi, i2) => {
                            const ehODireito = !!(v && vi && vi.nome && v.empresa
                              && String(vi.nome).trim().toUpperCase() === String(v.empresa).trim().toUpperCase())
                            return (
                              <div key={i2} style={s.vincRow(ehODireito)}>
                                <div>
                                  <div style={s.vincEmpresa}>
                                    {ehODireito ? '✅ ' : ''}{vi && vi.nome ? vi.nome : '—'}
                                  </div>
                                  <div style={{ color: '#5b6b84' }}>{vi && vi.tipo ? vi.tipo : ''}</div>
                                </div>
                                <div style={s.vincPeriodo}>
                                  {vi && vi.inicio ? vi.inicio : '?'} → {vi && vi.fim ? vi.fim : 'hoje'}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* texto bruto: so pra conferencia, link pequeno */}
                      {cnisDet && cnisDet.tela && (
                        <div style={{ marginTop: 8 }}>
                          <button style={s.linkMini} onClick={() => setCnisBruto(b => !b)}>
                            {cnisBruto ? 'esconder' : 'ver'} texto bruto do GERID
                          </button>
                          {cnisBruto && <pre style={s.telaGerid}>{cnisDet.tela}</pre>}
                        </div>
                      )}

                      {!cnisCarregando && cnisDet && !(Array.isArray(cnisDet.vinculos) && cnisDet.vinculos.length) && !cnisDet.tela && (
                        <div style={s.provaMini}>O assistente não guardou os vínculos deste lead.</div>
                      )}
                    </div>
                  )}

                  {temProvaDoRobo(c) && (
                    <div style={s.provaMini}>
                      ✅ {printsDoRobo(c).length > 0
                            ? 'O print do assistente já vale como prova do GERID.'
                            : 'O que o assistente leu no GERID já vale como prova.'}
                    </div>
                  )}
                </div>
              )
            })()}

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

                {/* 14/10 — a lista de vinculos saiu DAQUI: agora abre pelo botao
                    "Ver vinculos do CNIS" no card de cima, antes de decidir, que e
                    quando ela serve. Repetir aqui era a mesma informacao duas vezes.
                    Fica so o aviso de quem nao tem prova nenhuma. */}
                {c.gerid_veredito && !c.gerid_tem_consulta && !printsDoRobo(c).length && (
                  <div style={{ fontSize: 11.5, color: '#92400e', marginBottom: 8 }}>
                    O assistente não guardou nem imagem nem texto deste — se for pré-aprovar, cole o print do GERID abaixo.
                  </div>
                )}

                {/* PRINT DO GERID — só na pré-aprovação.
                    22/09 (Bruno): quando o robô já trouxe a prova, a área de
                    colar SOME. Deixar ela na tela pedindo Ctrl+V ao lado de um
                    aviso dizendo "não precisa colar nada" é contraditório — ela
                    lê o pedido, não o aviso, e cola à toa.
                    Fica só um link discreto pra quem quiser anexar assim mesmo. */}
                {abrindo.tipo === 'ok' && temProvaDoRobo(c) && !print && !colarMesmoAssim && (
                  <div style={s.provaOk}>
                    ✅ {printsDoRobo(c).length > 0
                          ? 'O print do assistente já vale como prova do GERID.'
                          : 'O que o assistente leu no GERID já vale como prova.'}
                    {' '}Pode escolher o motivo direto.
                    <button style={s.provaLink} onClick={() => setColarMesmoAssim(true)}>
                      anexar um print meu mesmo assim
                    </button>
                  </div>
                )}

                {abrindo.tipo === 'ok' && (!temProvaDoRobo(c) || !!print || colarMesmoAssim) && (
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
                      title={m === motivoSugerido(c) ? 'combina com a faixa e o seguro deste lead — confira e clique' : undefined}
                      style={{
                        ...s.motivoBtn(abrindo.tipo === 'ok' ? '#059669' : '#dc2626'),
                        // 14/10 — SO destaque. O botao sugerido nao e clicado sozinho,
                        // nao fica pre-marcado e os outros continuam todos habilitados.
                        ...(abrindo.tipo === 'ok' && m === motivoSugerido(c)
                            ? { outline: '2px solid #059669', outlineOffset: 2, fontWeight: 800 } : {}),
                        // 21/09: print do robô libera igual ao print colado
                        ...(abrindo.tipo === 'ok'
                            && ((!print && !temProvaDoRobo(c)) || (filhos.length > 1 && filhosOk.length === 0))
                            ? { opacity: 0.45, cursor: 'not-allowed' } : {}),
                      }}
                      disabled={salvando || (abrindo.tipo === 'ok'
                        && ((!print && !temProvaDoRobo(c)) || (filhos.length > 1 && filhosOk.length === 0)))}
                      onClick={() => decidir(c, abrindo.tipo === 'ok', m)}
                    >
                      {m}{abrindo.tipo === 'ok' && m === motivoSugerido(c) ? '   ← combina com este lead' : ''}
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
