import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const IDS_SUPERVISOR_BOARD = [
  // 01/10: Egle saiu daqui — agora ela e supervisora do TIME de 24 meses
  // (SUPERVISORAS_TIME), nao do board inteiro.
  // '6db43f01-71e6-4972-b84e-eb49375e8e70', // Egle Marcela
]

// ===== OPERAÇÕES LICENCIADAS (Ronaldo / Leandro) =====
// Usuário licenciado só enxerga leads da PRÓPRIA operação (l.operacao, marcada pelo sync via inbox).
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

// 01/10 (Bruno): o retroativo virou DOIS times por faixa. Agatha supervisiona o de
// 12 meses, Egle o de 24. As duas NAO recebem lead — so olham o time.
// A propria supervisora entra na lista porque pode ter lead antigo na mao
// (a Egle tem 8 de 12 meses recebidos na mao em 25/09).
const SUPERVISORAS_TIME = {
  // Agatha Barreto — time 12 meses
  '0a5958b9-d43b-4bac-a01d-af60247dd721': [
    '9fbda3fe-22aa-4179-b1a7-005e99660c8d', // Duda
    'bb85a0f3-2d79-499e-8b19-6219bd0cef56', // Gislaine
    '4a1db9e1-0b10-48bc-85d6-23b728b9fd4f', // Luciane
    'a1d7dbfb-bc0d-46a3-b523-bfdc15aac0c9', // Leticia
    'be98f268-314f-4114-acc3-7bb9ce7635fd', // Maryana Kodos
    '4bf01e58-2d1e-417a-878b-786094f1ad01', // Fernanda (femalves) — 19/10: entrou no time de 12
    '0a5958b9-d43b-4bac-a01d-af60247dd721', // ela mesma
  ],
  // Egle Marcela — time 12 a 24 meses
  '6db43f01-71e6-4972-b84e-eb49375e8e70': [
    '758a33f7-e5a2-4ef7-943a-dfe0ac72a387', // Supervisora Joana
    '64ced61d-fdae-4399-97c9-900c59120fff', // Supervisora Pamela
    'a3e94f8b-7e64-479b-9d72-1414afb83d1c', // nadiacajado
    '2c71c435-f5c2-49cf-984b-3629438045d2', // helenlima451
    '7ad37a1d-e5be-438c-9afd-982646d507d4', // juhferreira141988
    '6db43f01-71e6-4972-b84e-eb49375e8e70', // ela mesma (8 leads de 25/09)
  ],
}

const COLUNAS = [
  // Ordem = ordem real do fluxo. O PromoBank vem ANTES do CNIS: so quem qualifica
  // deveria receber o passo-a-passo do Meu INSS.
  ['PEDIU_CNIS', '⏳ Aguardando PromoBank'],
  ['PEDIU_CNIS_OK', '✅ Passou PromoBank — pediu CNIS'],
  ['FILA_GERID', '🗂️ Fila GERID'],
  ['A_ANALISAR', '⚖️ Com a advogada'],   // inclui quem foi aprovado sem ela e precisa ratificar
  ['PITCH_LIBERADO', '🚀 Pré-aprovado real'],
  ['CAD_ENDERECO', '📍 Endereço'],
  ['CAD_RG', '🪪 RG frente/verso'],
  ['CAD_COMPROVANTE', '📜 Doc. do filho'],
  ['CAD_FINAL', '🏁 CPF / Nº RG / Nome'],
  ['AGUARDANDO_ASSINATURA', '✍️ Aguard. assinatura'],
  ['FINALIZADO', '🎉 Finalizado'],
  ['REPROVADO', '⛔ Reprovado'],
  ['NEGADO', '❌ Negados'],
  ['OUTROS', '❓ Outros'],
]

// Visão da VENDEDORA (não-admin): 25/08 — a análise saiu da mão dela e virou a Mesa da Advogada.
// Ela só recebe PRÉ-APROVADO REAL (cnis_aprovado=true, decidido pela advogada) em diante.
const COLUNAS_VENDEDOR = ['PITCH_LIBERADO', 'CAD_ENDERECO', 'CAD_RG', 'CAD_COMPROVANTE', 'CAD_FINAL', 'AGUARDANDO_ASSINATURA', 'FINALIZADO']

// 19/10 (Bruno) — MESA DO VENDEDOR (modo CRM).
// POR QUE: medido em 19/10 — 840 leads entregues em 14 dias e ZERO registro de
// contato da vendedora. O board mostra o estado do ROBÔ do WhatsApp
// (AGUARDANDO_CNIS, COLETANDO_CADASTRO), que não diz se alguém ligou. Resultado:
// 149 dos 150 leads da Gislaine estavam parados há mais de 48h sem ninguém saber.
// O board kanban continua INTACTO: isto é uma segunda visão, e o botão
// "ver board antigo" devolve a tela de sempre. Nada foi removido.
// As colunas abaixo são as que contam como "lead vivo na mão dela" — fechou
// (FINALIZADO / AGUARDANDO_ASSINATURA) sai da mesa e vai pra aba de venda.
const COLUNAS_MESA_ATIVA = ['PITCH_LIBERADO', 'CAD_ENDERECO', 'CAD_RG', 'CAD_COMPROVANTE', 'CAD_FINAL']
const COLUNAS_MESA_FECHOU = ['AGUARDANDO_ASSINATURA', 'FINALIZADO']

// 19/10 (Bruno) — A VENDA VEM DA TABELA clientes, nao da coluna do board.
// Eu tinha feito a aba "Venda fechada" ler a coluna FINALIZADO. Estava errado:
// medido em 19/10, das 370 vendas fechadas na mao das 13, so 176 tinham o lead em
// FINALIZADO. As outras 194 (136 ainda em NOVO) foram digitadas no Novo Cliente,
// que cria o cliente mas nao mexe no estado do lead — a aba mostrava 48%.
// Agora quem manda e cliente_status, que a mae_board4 traz cruzando o CPF.
const CLIENTE_FECHADO = ['validado', 'entregue', 'assinado']
const CLIENTE_PERDIDO = ['cancelado', 'expirado', 'barrado_pos_venda']
// Como cada perda e explicada pra ela, em portugues de gente.
const MOTIVO_PERDA = {
  expirado: ['⏳', 'Não assinou a tempo', 'O link de assinatura venceu antes de ela assinar.'],
  cancelado: ['🚫', 'Cancelada', 'O contrato foi cancelado depois de emitido.'],
  barrado_pos_venda: ['🛑', 'Barrada no pós-venda', 'A conferência do pós-venda não aprovou.'],
}

// Abas da mesa. A ordem é a ordem do dia dela: primeiro o que caiu hoje, depois
// o que ficou pra trás, depois o que ela já encostou.
const ABAS_MESA = [
  ['hoje', '🔥 Caiu hoje'],
  ['represado', '📦 Atrasados'],
  ['contato', '📞 Em contato'],
  ['retomar', '🔁 Não respondeu'],
  ['tel', '📵 Telefone errado'],
  ['sem_direito', '🚫 Sem direito'],
  ['fechou', '✅ Venda fechada'],
  // 19/10 (Bruno) — RECUPERAR: cliente que fechou e caiu depois (nao assinou,
  // cancelou, barrou no pos-venda). Antes isso sumia da vida da vendedora no
  // instante em que virava cadastro. No produto inteiro sao 360 perdidas contra
  // 407 fechadas — quase uma pra cada venda, e ninguem olhava.
  ['recuperar', '♻️ Recuperar'],
]

// 19/10 — filtro de QUANDO a advogada entregou o lead. Padrao 'tudo' de proposito:
// na versao anterior a mesa herdava o filtro "Atividade: mes" do board e escondia
// 655 dos 1.571 leads ativos (41,7%) — justo os mais abandonados. Filtro na mesa
// so vale quando ELA escolhe.
const PERIODOS_MESA = [
  ['tudo', 'Todo o período'],
  ['hoje', 'Hoje'],
  ['ontem', 'Ontem'],
  ['7d', 'Últimos 7 dias'],
  ['30d', 'Últimos 30 dias'],
]
function dentroDoPeriodo(iso, periodo) {
  if (periodo === 'tudo') return true
  const d = diaBR(iso)
  if (!d) return false
  const hoje = hojeBR()
  if (periodo === 'hoje') return d === hoje
  const ms = new Date(hoje + 'T12:00:00') - new Date(d + 'T12:00:00')
  const dias = Math.round(ms / 86400000)
  if (periodo === 'ontem') return dias === 1
  if (periodo === '7d') return dias >= 0 && dias <= 6
  if (periodo === '30d') return dias >= 0 && dias <= 29
  return true
}

// Ações que o vendedor marca. Os códigos TÊM que ser os mesmos da função do
// banco (retroativo_vendedor_marcar) — mexer num lado sem o outro quebra a tela.
const ACOES_MESA = [
  ['sem_resposta', '🔁 Não respondeu', '#fbbf24', '#92400e'],
  ['tel_errado', '📵 Telefone errado', '#f87171', '#991b1b'],
  ['sem_direito', '🚫 Não tem direito', '#94a3b8', '#334155'],
]

// Dia no fuso de São Paulo (en-CA dá yyyy-mm-dd). Comparar com toISOString()
// erraria a virada: em UTC o dia vira às 21h daqui, e o "caiu hoje" da vendedora
// sairia com os leads da noite anterior dentro.
function diaBR(iso) {
  if (!iso) return null
  try { return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) } catch (_) { return null }
}
function hojeBR() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}
// Horas desde a entrega. É o número que mostra o lead apodrecendo na mesa.
function horasDe(iso) {
  if (!iso) return null
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000)
  return h >= 0 ? h : 0
}
function fmtHoras(h) {
  if (h === null) return '—'
  if (h < 1) return 'agora'
  if (h < 24) return h + 'h'
  const d = Math.floor(h / 24)
  return d + (d === 1 ? ' dia' : ' dias')
}

// Vendedoras do Retroativo: alem de so verem PRE-APROVADO REAL em diante,
// cada uma ve SO OS LEADS DELA (bf_agente_id = ela). A advogada entrega por rodizio.
const IDS_VENDEDORAS_RETROATIVO = [
  'a1d7dbfb-bc0d-46a3-b523-bfdc15aac0c9', // Leticia — entrou no setor 27/08
  'bb85a0f3-2d79-499e-8b19-6219bd0cef56', // Gislaine — entrou no setor 27/08
  'be98f268-314f-4114-acc3-7bb9ce7635fd', // Maryana Kodos
  '88929e81-7223-4754-a17b-1cd08f46195d', // Sthefany Mendes
  '9fbda3fe-22aa-4179-b1a7-005e99660c8d', // Duda (supervisoraeduarda25) — a que ja atuava no setor
  '4a1db9e1-0b10-48bc-85d6-23b728b9fd4f', // Luciane — 16/09: sem esta linha ela via o board INTEIRO (6.021 leads)
  // 01/10 — time de 24 meses. SEM ESTAS LINHAS a tela tenta baixar o board
  // inteiro (10.362 leads em 11 requisicoes) e fica carregando pra sempre:
  // foi o que travou as 5 hoje, e e o MESMO caso da Luciane em 16/09.
  '758a33f7-e5a2-4ef7-943a-dfe0ac72a387', // Supervisora Joana
  '64ced61d-fdae-4399-97c9-900c59120fff', // Supervisora Pamela
  'a3e94f8b-7e64-479b-9d72-1414afb83d1c', // nadiacajado
  '2c71c435-f5c2-49cf-984b-3629438045d2', // helenlima451
  '7ad37a1d-e5be-438c-9afd-982646d507d4', // juhferreira141988
  // 01/10: Agatha Barreto SAIU daqui — virou supervisora do time de 12,
  // nao e mais vendedora. Ela entrou em SUPERVISORAS_TIME acima.
  // 19/10 (Bruno) — estas duas entraram hoje. SEM A LINHA AQUI a tela tenta baixar
  // o board INTEIRO (26.893 leads em 27 requisicoes) e fica carregando pra sempre:
  // e o caso da Luciane em 16/09 e das cinco de 01/10, ja anotado acima.
  '4bf01e58-2d1e-417a-878b-786094f1ad01', // Fernanda (femalves) — time de 12 da KR
  '7dcd2bef-c0c5-41ac-b104-ff8eed300ca5', // RT CRÉDITOS (Ronaldo Arcari) — faixa 'rt', parceria
]

// 21/10 (Bruno) — BOARD ENXUTO. Quem esta nesta lista chama a mae_board5 no lugar
// da mae_board4. A mae_board5 NAO e board novo: e a propria mae_board4 por dentro,
// so que devolvendo apenas o que a tela da vendedora de fato EXIBE (COLUNAS_VENDEDOR
// + quem ja virou cadastro, que a aba Recuperar/Fechou precisa). Reverter = tirar
// o id daqui; a mae_board4 continua intacta no banco e todo mundo segue nela.
//
// POR QUE A DUDA: ela e dona de 29.644 leads (a carteira do retroativo inteira fica
// na mao dela antes de distribuir), entao filtrar "so os meus" nao filtra nada. O
// board dela vinha com 19.736 linhas; o PostgREST corta a resposta em 1.000, e CADA
// pagina reexecuta a consulta inteira no banco — 14s por ida. 21 idas = ~5 minutos,
// e como o refresh e de 45s ela empilhava busca sobre busca e a tela nunca terminava
// de carregar. Medido em 21/10: mae_board4 = 19.736 linhas / 21 idas; mae_board5 =
// 338 linhas / 1 ida. Conferido lead a lead: as duas devolvem EXATAMENTE o mesmo
// conjunto do que a tela mostra (338 = 338, zero diferenca nos dois sentidos) — o
// que sai sao as 19.398 linhas que o navegador ja jogava fora sozinho.
const IDS_BOARD_ENXUTO = [
  '9fbda3fe-22aa-4179-b1a7-005e99660c8d', // Duda (supervisoraeduarda25)
]

// Painel do dia: SO o Bruno ve. Deliberadamente por ID e nao por role='admin' —
// ele pediu "so para eu ver", e admin e um papel que outras pessoas podem receber.
const ID_DONO_PAINEL = '906f9a57-bd4a-4b0e-9973-0968ef4f1e15' // Bruno Souza

// Quem opera o funil e precisa ver TODAS as colunas (incl. Pediu CNIS e Fila GERID),
// sem virar supervisora do resto (selos, filtros e nomes continuam de vendedora)
// 25/08: a Duda saiu daqui — virou vendedora do retroativo, com carteira propria.
// Se alguem precisar do funil inteiro sem ser admin, e aqui que entra.
const IDS_VE_TODAS_COLUNAS = []

// Motivos pra negar / não quis (perda comercial — NÃO mexe no cnis_aprovado, protege a auditoria)
const MOTIVOS_NEGAR = [
  ['ja_recebeu', 'Já recebeu SM'],
  ['empregada', 'Empregada no parto'],
  ['sem_contribuicao', 'Sem contribuição/carência'],
  ['fora_graca', 'Fora do período de graça'],
  ['nao_quis', 'Não quis / desistiu'],
  ['sem_resposta', 'Sem resposta'],
  ['duplicado', 'Duplicado'],
  ['outro', 'Outro'],
]

// 01/10 (Bruno): motivo da transferencia e MENU FECHADO, nao texto livre.
// Com texto cada supervisora escrevia de um jeito e no fim do mes nao dava pra
// contar nada. Os codigos aqui tem que ser os MESMOS da funcao do banco
// (retroativo_transferir_lead) — mexer num lado sem o outro derruba a validacao.
// 'venda_fora' e o caso que o Bruno pediu: a vendedora fechou por planilha e o
// lead esta com outra pessoa; passa pra ela, marca entregue hoje, e ela clica em
// "Fechei a venda" — o credito vai pra quem vendeu.
const MOTIVOS_TRANSF = [
  ['venda_fora', '💰 Venda por fora — ela já fechou por planilha'],
  ['cliente_pediu', '🗣️ Cliente pediu outra atendente'],
  ['folga', '🏖️ Vendedora de folga / afastada'],
  ['carga', '⚖️ Reequilibrar a carga do time'],
  ['sem_contato', '📵 Não conseguiu contato com a cliente'],
  ['ja_atendeu', '🤝 Já atendeu essa cliente antes'],
  ['outro', '✏️ Outro — escrever'],
]

// Faixa de datas a partir do preset (base: fuso do navegador = BRT do usuario)
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

// 14/09 — o PostgREST deste projeto corta QUALQUER resposta em 1.000 linhas, sem erro
// e sem aviso. O board inteiro tem 5.440 leads, então a tela montava com as 1.000
// primeiras. Como a ordenação é por urgência (vermelho/amarelo antes), as colunas do
// FIM do funil — verdes e antigas — eram as primeiras a sumir:
//   Finalizado 87 -> 5 · Pré-aprovado real 214 -> 16 · Cad. final 7 -> 0 (sumia inteira)
//
// ATENÇÃO, ISSO JÁ ME PEGOU UMA VEZ: o limite é do SERVIDOR, não do cliente.
// Passar .limit(20000) NÃO resolve — testado em 14/09, a resposta volta
// "content-range: 0-999/5440" do mesmo jeito. Header Range também não pagina em RPC.
// O que funciona é OFFSET, que o supabase-js gera com .range(de, ate).
const PAGINA_BOARD = 1000
// 07/10 — era 12 (teto de 12 mil). O board da Duda tem 14.706 linhas, então ela
// perdia 2.706 leads TODA vez, em silêncio. Subi pra 25 (25 mil) com folga.
// Se um dia estourar de novo, o sintoma é o mesmo: colunas do fim do funil
// encolhendo sem motivo. Conferir com: select count(*) from mae_board2(<id>,...).
const MAX_PAGINAS = 25

// 07/10 — os filtros viviam só em useState. Qualquer remontagem da tela (troca de
// aba, refresh de token, volta de navegação) zerava tudo pro padrão e o número da
// coluna pulava sozinho: a vendedora via 42 virar 191 sem ninguém tocar em lead.
// Era isso que elas chamavam de "os leads estão sumindo". Agora cada filtro fica
// gravado no navegador dela. Navegador sem storage (aba anônima travada, política
// de privacidade) simplesmente não persiste — a tela continua funcionando igual.
const CHAVE_FILTROS = 'kr_retro_filtros_v1'
function lerFiltroSalvo(campo, padrao) {
  try {
    const bruto = window.localStorage.getItem(CHAVE_FILTROS)
    if (!bruto) return padrao
    const o = JSON.parse(bruto)
    return (o && o[campo] !== undefined && o[campo] !== null) ? o[campo] : padrao
  } catch (_) { return padrao }
}
function salvarFiltro(campo, valor) {
  try {
    const bruto = window.localStorage.getItem(CHAVE_FILTROS)
    const o = bruto ? JSON.parse(bruto) : {}
    o[campo] = valor
    window.localStorage.setItem(CHAVE_FILTROS, JSON.stringify(o))
  } catch (_) { /* sem storage: segue sem persistir */ }
}

// Busca a RPC do board inteira, em páginas. Para assim que uma página vier incompleta,
// então quem filtra por agente (vendedora, ~130 leads) continua fazendo 1 requisição só.
async function buscarBoardCompleto(rpc, params) {
  let todos = []
  for (let i = 0; i < MAX_PAGINAS; i++) {
    const de = i * PAGINA_BOARD
    const { data, error } = await supabase.rpc(rpc, params).range(de, de + PAGINA_BOARD - 1)
    if (error || !data || data.length === 0) break
    todos = todos.concat(data)
    if (data.length < PAGINA_BOARD) break
  }
  return todos
}

function primeiroNome(n) { return (n || 'cliente').split(' ')[0] }

// 21/09 — "16/09 13:03" pro carimbo de WhatsApp. Valor ruim no banco vira ''
// em vez de "Invalid Date" no meio do card.
// 22/09 (Bruno) — a vendedora liga sem saber onde a cliente trabalhou, e é
// justamente isso que ela precisa confirmar pra fechar. O robô do GERID já
// identificou o vínculo que gerou o direito; aqui ele vira texto de gente.
// Benefício e recolhimento não são empregador — dizer "você trabalhou na
// AUXILIO DOENCA" queima a ligação, então o rótulo muda.
function textoVinculo(v) {
  if (!v) return ''
  if (v.bruto) return v.bruto
  const periodo = v.inicio ? `${v.inicio} a ${v.fim}` : `até ${v.fim}`
  const quando = v.meses_antes_do_parto === 0
    ? 'no mês do parto'
    : `${v.meses_antes_do_parto} ${v.meses_antes_do_parto === 1 ? 'mês' : 'meses'} antes do parto`
  return `${periodo} · ${quando}`
}

function fmtCarimbo(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function fmtParado(min) {
  if (min < 60) return `${min} min`
  if (min < 1440) return `${Math.floor(min / 60)}h`
  return `${Math.floor(min / 1440)}d`
}

// Responder é no Chatwoot (a IA pausa sozinha quando humano responde lá) — mesmo padrão do Revisão BF.
const CHATWOOT_BASE = 'https://chat.grupookr.com.br' // migracao Chatwoot: instancia propria
const CHATWOOT_ACC = '1'
function linkChatwoot(c) {
  return c?.chatwoot_conversation_id ? `${CHATWOOT_BASE}/app/accounts/${CHATWOOT_ACC}/conversations/${c.chatwoot_conversation_id}` : null
}

const CORES = {
  vermelho: { border: '1px solid #f87171', background: 'rgba(248,113,113,.14)' },
  amarelo: { border: '1px solid #fbbf24', background: 'rgba(251,191,36,.12)' },
  frio: { border: '0.5px solid rgba(15,23,42,0.09)', background: '#e2e8f0', opacity: 0.8 },
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
  col: { minWidth: 230, maxWidth: 230, background: '#e2e8f0', borderRadius: 10, padding: 8, flexShrink: 0 },
  colTitulo: { fontSize: 12, fontWeight: 600, color: '#5b6b84', padding: '4px 6px 8px', display: 'flex', justifyContent: 'space-between' },
  card: { borderRadius: 8, padding: '8px 10px', marginBottom: 8, cursor: 'pointer' },
  cardNome: { fontSize: 13, fontWeight: 600, color: '#0f172a' },
  cardMeta: { fontSize: 11, color: '#5b6b84', marginTop: 2 },
  geridBox: { marginBottom: 12, padding: 12, borderRadius: 10, background: 'rgba(52,211,153,.10)', border: '0.5px solid rgba(52,211,153,.45)' },
  geridLabel: { fontSize: 12, fontWeight: 700, color: '#059669', marginBottom: 6 },
  geridMotivo: { fontSize: 12, color: '#0f172a', background: '#ffffff', borderRadius: 6, padding: '6px 8px', marginBottom: 8 },
  geridImg: { width: '100%', maxHeight: 340, objectFit: 'contain', borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.14)', background: '#ffffff', display: 'block', cursor: 'zoom-in' },
  geridPe: { fontSize: 10, color: '#5b6b84', marginTop: 5 },
  buscaWrap: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' },
  buscaInput: { flex: '1 1 300px', maxWidth: 420, padding: '9px 12px', fontSize: 13, borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.18)', background: '#ffffff', color: '#0f172a', boxSizing: 'border-box' },
  buscaBtn: { padding: '9px 18px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', background: '#60a5fa', color: '#232a37', cursor: 'pointer' },
  buscaRes: { display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  buscaVazio: { fontSize: 13, color: '#5b6b84', padding: '10px 12px', background: '#f1f5f9', borderRadius: 10 },
  buscaCard: { flex: '1 1 320px', maxWidth: 460, padding: 12, borderRadius: 10, background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.14)' },
  buscaTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 },
  buscaTag: { fontSize: 10, fontWeight: 700, color: '#2563eb', background: 'rgba(96,165,250,.14)', borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' },
  buscaMotivo: { fontSize: 11, color: '#b45309', background: 'rgba(251,191,36,.12)', borderRadius: 6, padding: '4px 7px', marginTop: 6 },
  buscaComo: { fontSize: 10, color: '#94a3b8', marginTop: 6 },
  buscaAlerta: { fontSize: 11, fontWeight: 700, color: '#dc2626', background: 'rgba(248,113,113,.14)', borderRadius: 6, padding: '4px 7px', marginTop: 6 },
  buscaAbrir: { marginTop: 8, width: '100%', padding: '8px 10px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: 'none', background: '#34d399', color: '#232a37', cursor: 'pointer' },
  tagTrat: { fontSize: 10, background: 'rgba(52,211,153,.14)', color: '#059669', borderRadius: 6, padding: '2px 7px', display: 'inline-block', marginTop: 4, fontWeight: 600 },
  tagTratSup: { fontSize: 10, background: 'rgba(96,165,250,.10)', color: '#2563eb', borderRadius: 6, padding: '2px 7px', display: 'inline-block', marginTop: 4, fontWeight: 600 },
  tagNinguem: { fontSize: 10, background: 'rgba(248,113,113,.14)', color: '#dc2626', borderRadius: 6, padding: '2px 7px', display: 'inline-block', marginTop: 4, fontWeight: 600 },
  tagRespondeu: { fontSize: 10, background: 'rgba(251,191,36,.12)', color: '#b45309', borderRadius: 6, padding: '2px 7px', display: 'inline-block', marginTop: 4, marginRight: 4, fontWeight: 700 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 50, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '3vh 12px', overflowY: 'auto' },
  modal: { background: '#ffffff', borderRadius: 14, width: '100%', maxWidth: 640, padding: '1.25rem', maxHeight: '92vh', overflowY: 'auto' },
  ficha: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 13, background: '#f1f5f9', borderRadius: 10, padding: 12, marginBottom: 12 },
  destaque: { gridColumn: '1 / -1', background: 'rgba(251,191,36,.12)', border: '1px solid #C88A0040', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontWeight: 600 },
  anexoBox: { marginBottom: 12 },
  anexoLabel: { fontSize: 12, fontWeight: 600, color: '#5b6b84', marginBottom: 6 },
  anexoRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  anexoImg: { width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.11)' },
  anexoFile: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'rgba(96,165,250,.10)', border: '0.5px solid rgba(15,23,42,0.09)', borderRadius: 8, fontSize: 12, color: '#2563eb', textDecoration: 'none', fontWeight: 500 },
  msgs: { maxHeight: 200, overflowY: 'auto', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 10, padding: 10, marginBottom: 12, display: 'flex', flexDirection: 'column-reverse', gap: 6 },
  msgCliente: { alignSelf: 'flex-start', background: '#e2e8f0', borderRadius: '10px 10px 10px 2px', padding: '6px 10px', fontSize: 12, maxWidth: '85%' },
  msgAna: { alignSelf: 'flex-end', background: 'rgba(52,211,153,.14)', borderRadius: '10px 10px 2px 10px', padding: '6px 10px', fontSize: 12, maxWidth: '85%' },
  textarea: { width: '100%', minHeight: 80, padding: 10, fontSize: 13, borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.45)', boxSizing: 'border-box', marginBottom: 8, fontFamily: 'inherit' },
  btnEnviar: { width: '100%', padding: 12, background: '#34d399', color: '#232a37', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 10 },
  btnAprovar: { flex: 1, padding: 12, background: '#34d399', color: '#232a37', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnReprovar: { flex: 1, padding: 12, background: '#f87171', color: '#232a37', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnAvancar: { flex: 1, padding: 12, background: '#60a5fa', color: '#232a37', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnVoltar: { flex: 1, padding: 12, background: '#ffffff', color: '#5b6b84', border: '0.5px solid rgba(0,0,0,0.45)', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnFechar: { padding: '9px 12px', background: '#ffffff', color: '#5b6b84', border: '0.5px solid rgba(15,23,42,0.11)', borderRadius: 8, fontSize: 12, cursor: 'pointer' },
  btnNegar: { padding: '9px 12px', background: 'rgba(248,113,113,.14)', color: '#dc2626', border: '0.5px solid rgba(178,59,59,0.3)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  btnFechou: { padding: '10px 16px', background: '#059669', color: '#ffffff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  // 09/09: bloco que substitui o botao quando a venda JA esta marcada
  vendaFeita: { padding: '10px 12px', background: 'rgba(52,211,153,.12)', border: '0.5px solid rgba(59,109,17,0.3)', borderRadius: 10, fontSize: 12.5 },
  btnDesfazer: { marginTop: 8, padding: '8px 14px', background: '#ffffff', color: '#b45309', border: '1px solid #fbbf24', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  fechLinha: (r) => ({
    padding: '8px 10px', borderRadius: 8, marginBottom: 6, fontSize: 13,
    background: r === 'FECHOU' ? 'rgba(52,211,153,.12)' : r === 'NEGOU' ? 'rgba(248,113,113,.10)' : 'rgba(251,191,36,.14)',
    border: '0.5px solid rgba(15,23,42,0.07)',
  }),
  confWrap: { marginBottom: 12 },
  painelBtn: { padding: '8px 14px', background: '#0f172a', color: '#ffffff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  painelCorpo: { marginTop: 8, padding: 12, background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.12)', borderRadius: 10 },
  painelTopo: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 },
  painelKpis: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 },
  painelVazio: { fontSize: 13, color: '#5b6b84', padding: '10px 12px', background: '#f1f5f9', borderRadius: 8 },
  painelNota: { fontSize: 12, color: '#065f46', background: 'rgba(52,211,153,.12)', borderRadius: 8, padding: '6px 9px', marginTop: 8 },
  painelPe: { fontSize: 11, color: '#5b6b84', marginTop: 10, lineHeight: 1.45 },
  tab: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 },
  th: { textAlign: 'left', padding: '6px 8px', color: '#5b6b84', fontWeight: 600, borderBottom: '1px solid rgba(15,23,42,0.10)', whiteSpace: 'nowrap' },
  thNum: { textAlign: 'right', padding: '6px 8px', color: '#5b6b84', fontWeight: 600, borderBottom: '1px solid rgba(15,23,42,0.10)', whiteSpace: 'nowrap' },
  td: { padding: '6px 8px', color: '#0f172a', borderBottom: '0.5px solid rgba(15,23,42,0.06)', whiteSpace: 'nowrap' },
  tdNum: { padding: '6px 8px', color: '#0f172a', textAlign: 'right', borderBottom: '0.5px solid rgba(15,23,42,0.06)', whiteSpace: 'nowrap' },
  tdBom: { color: '#059669', fontWeight: 700 },
  tdRuim: { color: '#dc2626', fontWeight: 700 },
  confBtn: { padding: '8px 14px', background: '#ffffff', color: '#0f172a', border: '0.5px solid rgba(15,23,42,0.12)', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  confBox: { marginTop: 8, padding: 12, background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 11, maxWidth: 560 },
  confVazio: { marginTop: 8, padding: 12, background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 11, fontSize: 13, color: '#5b6b84', maxWidth: 560 },
  confLinha: (g) => ({
    display: 'flex', justifyContent: 'space-between', gap: 12,
    padding: '6px 8px', borderRadius: 7, marginBottom: 2, fontSize: 13,
    background: g === 'FURO' ? 'rgba(248,113,113,.12)' : g === 'ADVOGADA' ? 'rgba(52,211,153,.10)' : g === 'ENTRADA' ? '#f2f5fa' : 'transparent',
    color: g === 'FURO' ? '#b91c1c' : '#0f172a',
    fontWeight: g === 'ENTRADA' || g === 'FURO' ? 700 : 500,
  }),
  confNota: { marginTop: 8, fontSize: 11.5, color: '#5b6b84', lineHeight: 1.45 },
  seloMaquina: { marginTop: 6, display: 'inline-block', padding: '2px 8px', background: 'rgba(96,165,250,.10)', color: '#2563eb', border: '0.5px solid rgba(96,165,250,0.3)', borderRadius: 999, fontSize: 11, fontWeight: 600 },
  seloAdvogada: { marginTop: 6, display: 'block', padding: '3px 8px', background: 'rgba(52,211,153,.14)', color: '#065f46', border: '0.5px solid rgba(5,150,105,.25)', borderRadius: 7, fontSize: 11, fontWeight: 600, lineHeight: 1.35 },
  seloSeguro: { marginTop: 4, display: 'block', padding: '3px 8px', background: 'rgba(251,191,36,.16)', color: '#92400e', border: '0.5px solid rgba(180,83,9,.28)', borderRadius: 7, fontSize: 11, fontWeight: 700, lineHeight: 1.35 },
  // 21/09 — validacao de WhatsApp. SEM whatsapp e o caso que muda a acao do
  // vendedor (ligar em vez de mandar mensagem), entao ganha destaque de alerta.
  // COM whatsapp e confirmacao, fica discreto. Nao verificado nao aparece no
  // card: sao 7 mil leads sem validacao e o card viraria um mar de cinza.
  seloSemWhats: { marginTop: 4, display: 'block', padding: '3px 8px', background: 'rgba(220,38,38,.12)', color: '#991b1b', border: '0.5px solid rgba(220,38,38,.32)', borderRadius: 7, fontSize: 11, fontWeight: 700, lineHeight: 1.35 },
  seloTemWhats: { marginTop: 4, display: 'inline-block', padding: '1px 7px', background: 'rgba(5,150,105,.12)', color: '#059669', borderRadius: 7, fontSize: 10.5, fontWeight: 700 },
  vincBox: { marginTop: 8, marginBottom: 4, padding: '10px 12px', background: 'rgba(37,99,235,.06)', border: '0.5px solid rgba(37,99,235,.22)', borderRadius: 10 },
  vincTit: { fontSize: 11, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 },
  vincNome: { fontSize: 14, fontWeight: 700, color: '#0f172a', lineHeight: 1.35 },
  vincMeta: { fontSize: 12, color: '#475569', marginTop: 2, lineHeight: 1.45 },
  vincRegra: { fontSize: 11.5, color: '#065f46', marginTop: 6, lineHeight: 1.45 },
  fichaWhats: (cor, bg) => ({ display: 'inline-block', marginLeft: 6, padding: '1px 7px', borderRadius: 7, fontSize: 11, fontWeight: 700, color: cor, background: bg }),

  // 15/10 — bloco da Ficha CNIS. Azul igual ao botao da Fila de Entregas de proposito:
  // e o MESMO documento, e quem usa as duas telas reconhece na hora.
  fichaCnisBox: { background: 'rgba(96,165,250,.10)', border: '0.5px solid #60a5fa50', borderRadius: 10, padding: 14, marginBottom: 12 },
  fichaCnisLabel: { fontSize: 12, fontWeight: 700, color: '#1d4ed8', marginBottom: 6 },
  fichaCnisTxt: { fontSize: 12.5, color: '#0f172a', lineHeight: 1.5, marginBottom: 10 },
  fichaCnisBtn: { display: 'inline-block', padding: '8px 12px', background: '#60a5fa', color: '#232a37', borderRadius: 7, fontSize: 12, fontWeight: 600, textDecoration: 'none' },
  // 21/09 — CARIMBO HUMANO. Dado diferente do selo do robo acima, de proposito:
  // um e o validador automatico, o outro e o que a atendente constatou na pratica.
  // Ficam lado a lado porque o valor esta em poder comparar os dois.
  seloCarimbo: (cor, bg, borda) => ({ marginTop: 4, display: 'block', padding: '3px 8px', background: bg, color: cor, border: '0.5px solid ' + borda, borderRadius: 7, fontSize: 11, fontWeight: 700, lineHeight: 1.35 }),
  carimboBox: { marginBottom: 10, padding: '10px 12px', background: '#f8fafc', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 10 },
  carimboLabel: { fontSize: 11.5, fontWeight: 700, color: '#5b6b84', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 7 },
  carimboBtn: (ativo, cor, bg, borda) => ({ fontSize: 12, padding: '6px 12px', background: ativo ? bg : '#ffffff', color: ativo ? cor : '#5b6b84', border: '0.5px solid ' + (ativo ? borda : 'rgba(15,23,42,0.14)'), borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }),
  carimboPe: { marginTop: 7, fontSize: 11, color: '#64748b', lineHeight: 1.45 },
  painelMotivos: { marginTop: 8, padding: 12, background: '#f1f5f9', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 10 },
  motivosGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 },
  btnMotivo: { padding: '9px 10px', background: '#ffffff', color: '#dc2626', border: '0.5px solid rgba(178,59,59,0.35)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left' },
  // 01/10 — ficha reorganizada: as acoes viraram DOIS blocos com titulo
  // ("enquanto voce atende" / "como terminou"), e a troca de dona saiu do meio
  // delas pra linha do dono, la em cima. Antes eram 5 botoes soltos de 5 cores,
  // sem dizer o que era rotina e o que era excecao.
  donoLinha: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: '#f1f5f9', borderRadius: 9, padding: '9px 12px', marginBottom: 12, fontSize: 12.5, color: '#0f172a', flexWrap: 'wrap' },
  donoAcao: { fontSize: 11.5, fontWeight: 600, color: '#1d4ed8', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0, fontFamily: 'inherit' },
  bloco: { background: '#f8fafc', border: '0.5px solid rgba(15,23,42,0.09)', borderRadius: 10, padding: '11px 12px', marginBottom: 10 },
  blocoFecho: { background: '#ffffff', border: '0.5px solid rgba(5,150,105,.25)', borderRadius: 10, padding: '11px 12px', marginBottom: 10 },
  blocoLabel: { fontSize: 10.5, fontWeight: 700, color: '#5b6b84', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 9 },
  blocoLinha: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  blocoPe: { fontSize: 11, color: '#64748b', marginTop: 8, lineHeight: 1.45 },
  transfTit: { fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 2 },
  transfSub: { fontSize: 13, color: '#5b6b84', marginBottom: 14 },
  transfLabel: { fontSize: 12, fontWeight: 700, color: '#5b6b84', marginBottom: 6, marginTop: 10 },
  transfSelect: { width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.18)', background: '#ffffff', color: '#0f172a', boxSizing: 'border-box', fontFamily: 'inherit' },
  transfVazio: { fontSize: 12, color: '#b45309', background: 'rgba(251,191,36,.12)', borderRadius: 8, padding: '8px 10px', marginTop: 8 },
  transfCheck: { display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 14, padding: '10px 12px', background: '#f8fafc', border: '0.5px solid rgba(15,23,42,0.09)', borderRadius: 10, fontSize: 12.5, cursor: 'pointer' },
  transfCheckPe: { fontSize: 11, color: '#64748b', lineHeight: 1.45 },
  transfAviso: { fontSize: 11.5, color: '#92400e', background: 'rgba(251,191,36,.14)', borderRadius: 8, padding: '8px 10px', marginTop: 10, lineHeight: 1.45 },

  // ===== 19/10 — MESA DO VENDEDOR (modo CRM) =====
  // Paleta a mesma do resto da tela de propósito: quem usa o board reconhece as
  // cores na hora. O que muda é o TAMANHO — aqui o alvo é o dedo no celular,
  // não o mouse arrastando card.
  mesaTopo: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 },
  mesaAba: (on, urgente) => ({
    padding: '9px 15px', fontSize: 13, fontWeight: on ? 700 : 500, borderRadius: 9,
    border: '0.5px solid ' + (on ? (urgente ? '#dc2626' : '#0f172a') : 'rgba(15,23,42,0.11)'),
    background: on ? (urgente ? '#dc2626' : '#0f172a') : '#ffffff',
    color: on ? '#ffffff' : (urgente ? '#dc2626' : '#5b6b84'),
    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  }),
  mesaAbaNum: (on) => ({ fontWeight: 700, marginLeft: 6, opacity: on ? 1 : 0.75 }),
  mesaLista: { display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 20 },
  // Card largo em vez de coluna estreita: cabe o vínculo, a empresa e os botões
  // sem o vendedor ter que abrir a ficha pra cada lead.
  mesaCard: (urgente) => ({
    background: '#ffffff', borderRadius: 12, padding: '13px 15px',
    border: urgente ? '1px solid #f8717199' : '0.5px solid rgba(15,23,42,0.10)',
    boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
  }),
  mesaCardTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' },
  mesaNome: { fontSize: 15.5, fontWeight: 700, color: '#0f172a', lineHeight: 1.3 },
  mesaTel: { fontSize: 13, color: '#334155', marginTop: 2, fontVariantNumeric: 'tabular-nums' },
  mesaIdade: (urgente) => ({
    fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap',
    background: urgente ? 'rgba(248,113,113,.16)' : 'rgba(15,23,42,.06)',
    color: urgente ? '#991b1b' : '#475569',
  }),
  mesaVinc: { marginTop: 9, padding: '8px 11px', background: 'rgba(37,99,235,.06)', border: '0.5px solid rgba(37,99,235,.18)', borderRadius: 9 },
  mesaVincTit: { fontSize: 10, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.05em' },
  mesaVincTxt: { fontSize: 12.5, color: '#0f172a', marginTop: 3, lineHeight: 1.45 },
  mesaMeta: { fontSize: 12, color: '#5b6b84', marginTop: 7, lineHeight: 1.5 },
  mesaObs: { fontSize: 12, color: '#92400e', background: 'rgba(251,191,36,.12)', borderRadius: 8, padding: '6px 9px', marginTop: 7 },
  // O "Peguei" é o botão gigante que o Bruno pediu: é a ação de 90% dos casos.
  mesaAcoes: { display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 11, alignItems: 'center' },
  mesaPegar: { flex: '1 1 190px', padding: '13px 18px', background: '#059669', color: '#ffffff', border: 'none', borderRadius: 10, fontSize: 14.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  mesaAcao: (bg, cor) => ({
    padding: '11px 13px', background: '#ffffff', color: cor,
    border: '0.5px solid ' + bg, borderRadius: 10, fontSize: 12.5, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  }),
  mesaZap: { padding: '11px 14px', background: 'rgba(52,211,153,.14)', color: '#059669', border: '0.5px solid rgba(5,150,105,.3)', borderRadius: 10, fontSize: 13, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' },
  mesaFicha: { padding: '11px 13px', background: '#ffffff', color: '#5b6b84', border: '0.5px solid rgba(15,23,42,0.14)', borderRadius: 10, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  mesaVazio: { fontSize: 13.5, color: '#5b6b84', padding: '26px 18px', background: '#ffffff', border: '0.5px dashed rgba(15,23,42,0.16)', borderRadius: 12, textAlign: 'center', lineHeight: 1.6 },
  mesaAlerta: { fontSize: 12.5, color: '#991b1b', background: 'rgba(248,113,113,.12)', border: '0.5px solid rgba(220,38,38,.25)', borderRadius: 10, padding: '10px 13px', marginBottom: 12, lineHeight: 1.5 },
  mesaResumo: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  mesaKpi: (cor, bg) => ({ fontSize: 12.5, fontWeight: 600, color: cor, background: bg, borderRadius: 9, padding: '7px 13px' }),
  mesaTrocar: { fontSize: 12, fontWeight: 600, color: '#5b6b84', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0, fontFamily: 'inherit' },

  // ===== 19/10 — CABEÇALHO DA MESA =====
  // Os cinco números em cima, antes de qualquer lista. O que manda aqui é
  // "parados +48h": é o único deles que não existia em lugar nenhum do sistema
  // e é o que mostra cliente apodrecendo na mão da vendedora.
  cab: { background: '#ffffff', border: '0.5px solid rgba(15,23,42,.10)', borderRadius: 14, padding: '15px 17px', marginBottom: 14, boxShadow: '0 1px 3px rgba(15,23,42,.05)' },
  cabTopo: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 13, flexWrap: 'wrap', marginBottom: 13 },
  cabQuem: { display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 },
  cabAv: { width: 38, height: 38, borderRadius: 999, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0 },
  cabNome: { fontSize: 15.5, fontWeight: 700, color: '#0f172a', lineHeight: 1.25 },
  cabSub: { fontSize: 11.5, color: '#5b6b84', marginTop: 1 },
  // grid que vira 2 colunas no celular sem media query (minmax + auto-fit)
  cabKpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))', gap: 9 },
  cabKpi: (bg, borda) => ({ borderRadius: 11, padding: '10px 12px', background: bg || '#f8fafc', border: '0.5px solid ' + (borda || 'rgba(15,23,42,.08)') }),
  cabKpiTit: (cor) => ({ fontSize: 10, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', color: cor || '#64748b' }),
  cabKpiNum: (cor) => ({ fontSize: 25, fontWeight: 800, color: cor || '#0f172a', lineHeight: 1.1, marginTop: 4, fontVariantNumeric: 'tabular-nums' }),
  cabKpiPe: { fontSize: 10.5, color: '#64748b', marginTop: 2 },
  cabBarra: { marginTop: 12, background: '#f1f5f9', borderRadius: 999, height: 8, overflow: 'hidden' },
  cabBarraIn: (pct) => ({ height: '100%', width: Math.max(2, Math.min(100, pct)) + '%', borderRadius: 999, background: 'linear-gradient(90deg,#34d399,#059669)', transition: 'width .4s' }),
  cabBarraTxt: { display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11.5, color: '#5b6b84', marginTop: 6, flexWrap: 'wrap' },
  cabSino: { display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(52,211,153,.14)', border: '0.5px solid rgba(5,150,105,.3)', color: '#047857', fontSize: 12.5, fontWeight: 700, padding: '7px 13px', borderRadius: 9 },
  cabPonto: { width: 8, height: 8, borderRadius: 999, background: '#059669', boxShadow: '0 0 0 4px rgba(5,150,105,.18)' },

  // Aviso de cliente nova. Fixo no canto no computador; no celular vira faixa no
  // topo da lista, porque caixa flutuante em tela pequena tapa o primeiro card —
  // que e justamente o que ela precisa tocar.
  aviso: { position: 'fixed', right: 18, bottom: 18, width: 325, maxWidth: 'calc(100vw - 36px)', background: '#fff', borderRadius: 13, border: '1px solid rgba(5,150,105,.35)', boxShadow: '0 14px 34px rgba(15,23,42,.19)', zIndex: 60, overflow: 'hidden' },
  avisoTopo: { background: 'linear-gradient(90deg, rgba(52,211,153,.2), rgba(52,211,153,.07))', padding: '11px 13px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 9, borderBottom: '0.5px solid rgba(5,150,105,.2)' },
  avisoTit: { fontSize: 13.5, fontWeight: 800, color: '#047857' },
  avisoX: { background: 'none', border: 'none', color: '#5b6b84', fontSize: 15, cursor: 'pointer', lineHeight: 1, padding: 0, fontFamily: 'inherit' },
  avisoCorpo: { padding: '11px 13px' },
  avisoLin: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#0f172a', padding: '3px 0' },
  avisoTag: { fontSize: 9.5, fontWeight: 700, color: '#1d4ed8', background: 'rgba(37,99,235,.1)', borderRadius: 5, padding: '1px 6px', flexShrink: 0 },
  avisoBtn: { marginTop: 9, width: '100%', padding: '10px', background: '#059669', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
}

export default function RevisaoIARetroativo() {
  const { profile } = useAuth()
  const ehAdmin = profile?.role === 'admin' || IDS_SUPERVISOR_BOARD.includes(profile?.id)
  const minhaOp = OPERACAO_USUARIOS[profile?.id] || null            // operação licenciada (null = KR)
  const ehSupervisorOp = SUPERVISORAS_OPERACAO.includes(profile?.id)
  const meuTime = SUPERVISORAS_TIME[profile?.id] || null
  const ehSupervisorTime = !!meuTime
  const ehSupervisor = ehAdmin || ehSupervisorOp || ehSupervisorTime
  const ehVendedor = !ehSupervisor
  // visão completa das colunas (não muda selos/filtros/nomes, só as colunas visíveis)
  const veTodasColunas = ehSupervisor || IDS_VE_TODAS_COLUNAS.includes(profile?.id)
  // vendedora do retroativo so enxerga a carteira dela
  const soMeusLeads = IDS_VENDEDORAS_RETROATIVO.includes(profile?.id)
  const ehDono = profile?.id === ID_DONO_PAINEL

  const [board, setBoard] = useState([])
  // 07/10 — contador de requisição: resposta atrasada não escreve na tela.
  const reqAtual = useRef(0)
  // 07/10 — lista do seletor de vendedora, guardada à parte do board.
  const [agentesConhecidos, setAgentesConhecidos] = useState([])

  // 07/10 — usarFiltro = useState que grava no navegador. Mesma assinatura do
  // useState, então o resto da tela não muda em nada. Fica aqui dentro do
  // componente de propósito: hook declarado fora não tem por que existir.
  const usarFiltro = (campo, padrao) => {
    const [v, setV] = useState(() => lerFiltroSalvo(campo, padrao))
    const set = (novo) => setV(anterior => {
      const valor = typeof novo === 'function' ? novo(anterior) : novo
      salvarFiltro(campo, valor)
      return valor
    })
    return [v, set]
  }

  const [soVermelhos, setSoVermelhos] = usarFiltro('soVermelhos', false)
  const [filtroAgente, setFiltroAgente] = usarFiltro('filtroAgente', '')
  const [filtroEntrada, setFiltroEntrada] = usarFiltro('filtroEntrada', 'tudo')
  const [filtroAtividade, setFiltroAtividade] = usarFiltro('filtroAtividade', 'mes')
  const [filtroAtendimento, setFiltroAtendimento] = usarFiltro('filtroAtendimento', 'todos')
  const [entradaDe, setEntradaDe] = usarFiltro('entradaDe', ''); const [entradaAte, setEntradaAte] = usarFiltro('entradaAte', '')
  const [ativDe, setAtivDe] = usarFiltro('ativDe', ''); const [ativAte, setAtivAte] = usarFiltro('ativAte', '')
  // 16/09 (Bruno): filtro por QUANDO A ADVOGADA ENTREGOU o lead pra vendedora.
  // Nasceu porque lead aprovado hoje com conversa de dias atras so era achado
  // adivinhando a data da ultima interacao. Padrao 'tudo' de proposito: se abrisse
  // em 'hoje', a vendedora perderia a carteira inteira ao abrir a tela.
  const [filtroEntrega, setFiltroEntrega] = usarFiltro('filtroEntrega', 'tudo')
  const [entregaDe, setEntregaDe] = usarFiltro('entregaDe', ''); const [entregaAte, setEntregaAte] = usarFiltro('entregaAte', '')
  const [lead, setLead] = useState(null)
  const [arrastando, setArrastando] = useState(null)
  const [mostrarMotivosNegar, setMostrarMotivosNegar] = useState(false)
  const [mensagens, setMensagens] = useState([])
  const [anexos, setAnexos] = useState([])
  const [carregandoAnexos, setCarregandoAnexos] = useState(false)
  // 28/08 (Bruno): o print do GERID que a advogada anexa na mesa dela tem que chegar
  // na vendedora. 97 leads ja entregues tinham print e a vendedora nao via nenhum —
  // o mae_board nao devolve esse campo. Busco sob demanda ao abrir a ficha, por LEAD_ID,
  // pra nao mexer no mae_board (que alimenta o board inteiro) nem pesar o carregamento.
  const [gerid, setGerid] = useState(null)
  const [geridCarregando, setGeridCarregando] = useState(false)
  // 09/09 (Bruno): DESFAZER o "Fechei a venda". A Gislaine marcou a Kessia por engano
  // e nao tinha como corrigir sozinha — virou pedido no chat e SQL na mao no banco de
  // producao, com o numero errado no fechamento do dia ate alguem reverter.
  // O mae_board nao devolve venda_fechada, e eu NAO mexo nele (alimenta o board inteiro,
  // mesma decisao do print do GERID acima): busco o status ao abrir a ficha.
  // Quem pode desfazer e decidido no BANCO (mae_venda_status) — a tela so obedece.
  const [venda, setVenda] = useState(null)
  const [vendaCarregando, setVendaCarregando] = useState(false)
  const [desfazendo, setDesfazendo] = useState(false)
  const [atualizandoConversa, setAtualizandoConversa] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [fechAberto, setFechAberto] = useState(false)
  const [fechamento, setFechamento] = useState(null)
  const [fechCarregando, setFechCarregando] = useState(false)
  // 28/08 (Bruno): painel do dia — SÓ ELE vê. Não é "admin": é este ID.
  // Se um dia outra pessoa precisar, é aqui que entra.
  const [painelAberto, setPainelAberto] = useState(false)
  const [painelDia, setPainelDia] = useState(null)     // { distribuicao: [], vendas: [] }
  const [painelCarregando, setPainelCarregando] = useState(false)
  const [painelData, setPainelData] = useState('')     // vazio = hoje

  const [confAberta, setConfAberta] = useState(false)
  const [conferencia, setConferencia] = useState(null)
  const [confCarregando, setConfCarregando] = useState(false)
  // 27/08 (Bruno): busca por CPF/telefone. A tela tem filtro de entrada e de atividade,
  // entao cliente antigo some do board e nao da pra achar rolando. A busca IGNORA os
  // filtros e varre o funil retroativo inteiro.
  const [busca, setBusca] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [achados, setAchados] = useState(null)   // null = ainda nao buscou
  // 01/10 (Bruno): supervisora passa um lead pra outra vendedora do time dela.
  // A trava de faixa esta no BANCO (retroativo_transferir_lead), nao aqui — a tela
  // so filtra a lista pra nao oferecer quem ela nao pode escolher.
  const [transf, setTransf] = useState(null)
  const [transfPara, setTransfPara] = useState('')
  const [transfCod, setTransfCod] = useState('')
  const [transfMotivo, setTransfMotivo] = useState('')
  const [transfHoje, setTransfHoje] = useState(false)
  const [transfVends, setTransfVends] = useState([])
  const [transferindo, setTransferindo] = useState(false)
  const podeTransferir = ehSupervisorTime || ehAdmin

  // 19/10 (Bruno) — MESA DO VENDEDOR. Só quem tem carteira própria entra no modo
  // CRM; supervisora e admin continuam caindo no board kanban, que é a ferramenta
  // de quem olha o time inteiro. O modo fica salvo no navegador: se a vendedora
  // preferir o board antigo, a escolha dela vale no dia seguinte.
  const temMesa = soMeusLeads && !veTodasColunas
  const [modoMesa, setModoMesa] = usarFiltro('modoMesa', true)
  const [abaMesa, setAbaMesa] = usarFiltro('abaMesa', 'hoje')
  const [marcando, setMarcando] = useState(null)   // lead_id em processamento
  // Padrao 'tudo': a mesa NUNCA esconde lead por conta propria. Ver nota em PERIODOS_MESA.
  const [periodoMesa, setPeriodoMesa] = usarFiltro('periodoMesa', 'tudo')

  // 19/10 — aviso de cliente nova. idsVistos comeca NULL de proposito: null quer
  // dizer "ainda nao carregou nenhuma vez", e e isso que impede o alarme falso na
  // abertura da tela. Set vazio significaria "carregou e nao tinha nada", que e
  // outra coisa. Fica em ref e nao em state: mudar nao precisa redesenhar a tela.
  const idsVistos = useRef(null)
  const [avisoNovos, setAvisoNovos] = useState(null)
  const [qtNovos, setQtNovos] = useState(0)
  const timerAviso = useRef(null)

  // Bipe curto gerado na hora (sem arquivo de som pra subir no repo). O navegador
  // so deixa tocar depois que a pessoa clicou alguma coisa na pagina — por isso o
  // try/catch: se bloquear, o aviso visual continua funcionando do mesmo jeito.
  function tocarAviso() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return
      const ctx = new Ctx()
      if (ctx.state === 'suspended') { ctx.close(); return }
      const osc = ctx.createOscillator(); const vol = ctx.createGain()
      osc.connect(vol); vol.connect(ctx.destination)
      osc.type = 'sine'; osc.frequency.value = 880
      vol.gain.setValueAtTime(0.0001, ctx.currentTime)
      vol.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.02)
      vol.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.32)
      osc.start(); osc.stop(ctx.currentTime + 0.34)
      setTimeout(() => { try { ctx.close() } catch (_) {} }, 600)
    } catch (_) { /* som e enfeite: nunca pode derrubar a tela */ }
  }

  useEffect(() => () => clearTimeout(timerAviso.current), [])

  const carregarPainelDia = useCallback(async (data) => {
    setPainelCarregando(true)
    const p_dia = data || null   // null = hoje, resolvido no banco em BRT
    const [dist, vend] = await Promise.all([
      supabase.rpc('retroativo_distribuicao_dia', { p_dia }),
      supabase.rpc('retroativo_vendas_dia', { p_dia }),
    ])
    if (dist.error) console.error(dist.error)
    if (vend.error) console.error(vend.error)
    setPainelDia({ distribuicao: dist.data || [], vendas: vend.data || [] })
    setPainelCarregando(false)
  }, [])

  const abrirPainelDia = async () => {
    const abrir = !painelAberto
    setPainelAberto(abrir)
    if (abrir) await carregarPainelDia(painelData)
  }

  const abrirConferencia = async () => {
    const abrir = !confAberta
    setConfAberta(abrir)
    if (!abrir) return
    setConfCarregando(true)
    const r = await supabase.rpc('retroativo_conferencia', { p_de: null, p_ate: null })
    if (r.error) console.error(r.error)
    setConferencia(r.data || [])
    setConfCarregando(false)
  }

  const carregar = useCallback(async () => {
    if (!profile?.id) return
    const meuReq = ++reqAtual.current   // 07/10 — senha desta chamada (ver nota lá embaixo)
    // Funil retroativo é 100% automático e SEM DONO por lead. Se a vendedora filtrar
    // pelo próprio id, ela só enxerga A analisar/Pitch (sempre visíveis) e perde cadastro/
    // assinatura/finalizado (que são gated por dono). Ela vê o funil compartilhado inteiro,
    // já fatiado nas colunas dela pelo COLUNAS_VENDEDOR. Corte continua valendo.
    // 14/09 — a vendedora passou a filtrar NA RPC, não só no front.
    // Antes: p_agente = null pra todo mundo que não é admin, e o recorte dela era
    // feito no .filter() abaixo. Como o PostgREST corta a resposta em 1.000 linhas,
    // ela recebia as 1.000 primeiras de um board de 5.435 (que nem era dela) e só
    // então filtrava — sobravam 9 leads dos 130 dela, e 1 finalizado dos 28.
    // Medido em 14/09: mae_board(id) devolve EXATAMENTE o mesmo que
    // mae_board(null) + filtro no front (130 linhas, 28 finalizado, 68 pitch).
    // O comentário antigo dizia que filtrar pelo id fazia ela perder colunas —
    // não é mais verdade. O .filter() do front continua abaixo como rede de segurança.
    const p_agente = ehAdmin ? (filtroAgente || null) : (soMeusLeads ? profile.id : null)
    // 19/10 — NO MODO MESA OS FILTROS NAO VALEM. O padrao de Atividade e 'mes', e no
    // board isso faz sentido (quem olha o funil quer o movimento recente). Na mesa
    // faz o contrario do que ela precisa: lead parado ha mais de 30 dias SUMIA da
    // tela dela — justo o que esta mais atrasado, que e o que ela tem que atacar.
    // Na mesa ela ve a carteira inteira; filtro e coisa do board.
    const semFiltro = { de: null, ate: null }
    const naMesa = temMesa && modoMesa
    const fe = naMesa ? semFiltro : faixaData(filtroEntrada, entradaDe, entradaAte)
    const fa = naMesa ? semFiltro : faixaData(filtroAtividade, ativDe, ativAte)
    const fg = naMesa ? semFiltro : faixaData(filtroEntrega, entregaDe, entregaAte)
    // 16/09 — mae_board2 = a mae_board de sempre com DUAS mudanças:
    //   1) Atividade voltou a olhar SÓ ultima_interacao (a conversa da cliente).
    //      O GREATEST que estava lá incluía bf_atribuido_em, que a supervisora move
    //      a cada transferência: 190 dos 519 aprovados apareciam como "atividade hoje"
    //      sem ninguém ter falado nada, com defasagem de até 15 dias.
    //   2) p_entrega_de/ate: quando a ADVOGADA liberou o lead pra vendedora.
    // A mae_board antiga continua no banco, intacta — reverter = trocar o nome aqui.
    // 19/10 — mae_board3 = a mae_board2 de sempre MAIS 4 campos no fim
    // (vend_status, vend_tentativas, vend_contato_em, vend_obs): o registro do
    // trabalho do VENDEDOR, que não existia em lugar nenhum. Conferido no banco
    // em 19/10: nos 33 campos antigos as duas devolvem linha por linha o mesmo
    // resultado (192 = 192, zero diferença). A mae_board2 segue intacta —
    // reverter = trocar o nome aqui de volta.
    // 19/10 — mae_board4 = a mae_board3 MAIS cliente_status/cliente_em (o cadastro
    // real daquele CPF, cruzado em CTE). Conferido: nos campos antigos as duas
    // devolvem linha por linha o mesmo (193=193, zero diferenca nos dois sentidos).
    // Criei funcao nova em vez de alterar a 3 porque trocar o tipo de retorno exige
    // DROP, e DROP numa funcao que 13 pessoas chamam a cada 45s fica preso na fila
    // de lock — foi o que travou a primeira tentativa. Reverter = voltar o nome aqui.
    // 21/10 — quem esta em IDS_BOARD_ENXUTO vai pela mae_board5 (ver nota la em cima).
    const rpcBoard = IDS_BOARD_ENXUTO.includes(profile?.id) ? 'mae_board5' : 'mae_board4'
    const data = await buscarBoardCompleto(rpcBoard, {
      p_agente,
      p_entrada_de: fe.de ? fe.de.toISOString() : null,
      p_entrada_ate: fe.ate ? fe.ate.toISOString() : null,
      p_ativ_de: fa.de ? fa.de.toISOString() : null,
      p_ativ_ate: fa.ate ? fa.ate.toISOString() : null,
      p_entrega_de: fg.de ? fg.de.toISOString() : null,
      p_entrega_ate: fg.ate ? fg.ate.toISOString() : null,
    })
    // 07/10 — RESPOSTA ATRASADA. Este é o bug do "o filtro some e depois volta
    // sozinho". Sem filtro o board tem 14.706 linhas = 15 idas ao servidor, uns
    // 10 segundos. Com filtro tem ~300 = meio segundo. Então:
    //   t=0  abre a tela sem filtro  -> dispara a busca LENTA
    //   t=1  escolhe a vendedora     -> busca RÁPIDA volta, tela certa
    //   t=10 a busca LENTA termina   -> setBoard joga TUDO por cima  (filtro "sumiu")
    //   t=45 o timer roda de novo    -> volta ao certo              ("corrigiu sozinho")
    // A correção é descartar a resposta que chegou atrasada: cada chamada leva um
    // número, e só a mais recente tem direito de escrever na tela.
    if (meuReq !== reqAtual.current) return

    // Operação licenciada só enxerga os leads da própria operação
    const visiveis = (data || []).filter(l =>
      (!minhaOp || (l.operacao || 'kr') === minhaOp) &&
      (!meuTime || meuTime.includes(l.bf_agente_id)) &&
      (!soMeusLeads || l.bf_agente_id === profile?.id))
    setBoard(visiveis)

    // 19/10 (Bruno) — AVISO DE CLIENTE NOVA.
    // A tela ja recarregava sozinha a cada 45s, so que calada: a cliente caia e
    // ninguem percebia. Nao precisa de servidor novo nem de push — basta comparar
    // a lista que chegou com a de antes e avisar o que e novidade.
    // A PRIMEIRA carga nunca avisa: senao a vendedora abriria a tela e levaria um
    // alarme com os 150 leads que ja estavam la.
    if (temMesa) {
      const idsAgora = visiveis.filter(l => COLUNAS_MESA_ATIVA.includes(l.coluna)).map(l => l.id)
      const antes = idsVistos.current
      if (antes === null) {
        idsVistos.current = new Set(idsAgora)
      } else {
        const novos = visiveis.filter(l => COLUNAS_MESA_ATIVA.includes(l.coluna) && !antes.has(l.id))
        idsVistos.current = new Set(idsAgora)
        if (novos.length) {
          setAvisoNovos(novos.slice(0, 4))
          setQtNovos(novos.length)
          tocarAviso()
          clearTimeout(timerAviso.current)
          timerAviso.current = setTimeout(() => setAvisoNovos(null), 10000)
        }
      }
    }

    // 07/10 — a lista do seletor saía do próprio board. Ao filtrar por uma
    // vendedora o board só tinha os leads dela, então o seletor passava a listar
    // só ela e não dava pra trocar direto pra outra: tinha que voltar em "Todos
    // os agentes" primeiro. Agora a lista completa é guardada enquanto NÃO há
    // filtro e reaproveitada depois, então o seletor nunca encolhe.
    if (!filtroAgente) {
      const completos = []
      visiveis.forEach(l => {
        if (l.bf_agente_id && l.agente_nome && !completos.some(a => a.id === l.bf_agente_id)) {
          completos.push({ id: l.bf_agente_id, nome: l.agente_nome })
        }
      })
      if (completos.length) setAgentesConhecidos(completos.sort((a, b) => a.nome.localeCompare(b.nome)))
    }
    // 19/10 — temMesa/modoMesa entraram aqui porque o carregar passou a decidir por
    // eles se manda os filtros de data pra RPC. Sem estas duas deps, trocar pro
    // board antigo nao refazia a busca e a tela ficava com os dados sem filtro.
  }, [profile?.id, ehAdmin, minhaOp, soMeusLeads, filtroAgente, filtroEntrada, filtroAtividade, entradaDe, entradaAte, ativDe, ativAte, filtroEntrega, entregaDe, entregaAte, temMesa, modoMesa])

  useEffect(() => {
    carregar()
    const timer = setInterval(carregar, 45000)
    return () => clearInterval(timer)
  }, [carregar])

  // 07/10 — usa a lista guardada (completa). Se ainda não carregou nenhuma vez
  // sem filtro, cai no board atual, que é o comportamento antigo.
  const agentes = agentesConhecidos.length ? agentesConhecidos : (() => {
    const acc = []
    board.forEach(l => {
      if (l.bf_agente_id && l.agente_nome && !acc.some(a => a.id === l.bf_agente_id)) {
        acc.push({ id: l.bf_agente_id, nome: l.agente_nome })
      }
    })
    return acc
  })()

  const totalVermelhos = board.filter(l => l.cor === 'vermelho').length
  const filaAnalista = board.filter(l => l.coluna === 'A_ANALISAR').length
  const finalizadas = board.filter(l => l.coluna === 'FINALIZADO').length
  const semDono = board.filter(l => !l.bf_em_tratamento && (l.cor === 'vermelho' || l.cor === 'amarelo') && l.coluna !== 'FINALIZADO' && l.coluna !== 'REPROVADO').length

  // Selo de tratamento no card, respeitando quem está olhando
  function seloTratamento(l) {
    if (l.bf_em_tratamento) {
      const aviso = l.cliente_respondeu ? <span style={s.tagRespondeu}>💬 cliente respondeu</span> : null
      if (ehSupervisor) {
        return <>{aviso}<span style={s.tagTratSup}>🟢 {l.agente_nome ? `${primeiroNome(l.agente_nome)} tratando` : 'em tratamento'}</span></>
      }
      return <>{aviso}<span style={s.tagTrat}>🟢 Você está tratando</span></>
    }
    if (ehSupervisor && (l.cor === 'vermelho' || l.cor === 'amarelo') && l.coluna !== 'FINALIZADO' && l.coluna !== 'REPROVADO') {
      return <span style={s.tagNinguem}>⚪ ninguém pegou</span>
    }
    return null
  }

  // Recarrega mensagens + anexos de um lead (usado ao abrir, no auto-refresh e no botão)
  const recarregarConversa = useCallback(async (l, comLoading) => {
    if (!l) return
    if (comLoading) setAtualizandoConversa(true)
    try {
      // Fonte primaria: espelho ao vivo do Chatwoot (inclui msgs digitadas pela supervisora na mao)
      let usouChatwoot = false
      if (l.chatwoot_conversation_id) {
        const { data: res } = await supabase.functions.invoke('bf-conversa', {
          body: { conversation_id: l.chatwoot_conversation_id, limit: 30 },
        })
        if (res?.ok) {
          setMensagens(res.mensagens || [])
          setAnexos(res.anexos || [])
          usouChatwoot = true
        }
      }
      // Fallback: Chatwoot fora do ar ou lead sem conversation_id -> usa o banco
      if (!usouChatwoot) {
        const { data } = await supabase.rpc('bf_mensagens', { p_lead_id: l.id, p_limit: 30 })
        setMensagens(data || [])
      }
    } finally { if (comLoading) setAtualizandoConversa(false) }
  }, [])

  async function buscarCliente() {
    const t = (busca || '').replace(/\D/g, '')
    if (t.length < 8) { alert('Digite o CPF completo ou pelo menos os 8 últimos dígitos do telefone.'); return }
    setBuscando(true)
    const { data, error } = await supabase.rpc('mae_buscar_lead', { p_termo: busca })
    setBuscando(false)
    if (error) { alert('Erro na busca: ' + error.message); return }
    setAchados(data || [])
  }
  function limparBusca() { setBusca(''); setAchados(null) }

  async function carregarGerid(leadId) {
    setGerid(null)
    if (!leadId) return
    setGeridCarregando(true)
    const { data } = await supabase.rpc('gerid_print_do_lead', { p_lead_id: leadId })
    setGeridCarregando(false)
    setGerid((data && data[0]) || null)   // sem print => null, a ficha nem mostra o bloco
  }

  async function carregarVenda(leadId) {
    setVenda(null)
    if (!leadId) return
    setVendaCarregando(true)
    const { data } = await supabase.rpc('mae_venda_status', { p_lead_id: leadId })
    setVendaCarregando(false)
    setVenda(data || null)
  }

  const desfazerVenda = async (l) => {
    if (!window.confirm('Desfazer a marcacao de VENDA FECHADA dessa cliente?\n\nEla volta a ficar em aberto no seu fechamento do dia. Nao marca como negada.')) return
    setDesfazendo(true)
    const r = await supabase.rpc('mae_venda_desfazer', { p_lead_id: l.id, p_motivo: null })
    setDesfazendo(false)
    if (r.error || !r.data?.ok) { alert('Nao deu pra desfazer: ' + (r.error?.message || r.data?.erro || 'erro')); return }
    await carregarVenda(l.id)
    carregar()
  }

  const abrirLead = async (l) => {
    setLead(l)
    carregarGerid(l && l.id)
    carregarVenda(l && l.id)
    setMensagens([])
    setAnexos([])
    setCarregandoAnexos(true)
    try { await recarregarConversa(l, false) } finally { setCarregandoAnexos(false) }
  }

  // Auto-refresh da conversa aberta: recarrega a cada 8s enquanto o modal estiver aberto
  useEffect(() => {
    if (!lead) return
    const t = setInterval(() => { recarregarConversa(lead, false) }, 8000)
    return () => clearInterval(t)
  }, [lead, recarregarConversa])

  const fechar = () => { setLead(null); setMensagens([]); setAnexos([]); setGerid(null); setVenda(null) }

  // 01/10 — monta a lista: so as vendedoras do MEU time, fora eu mesma e fora quem ja
  // tem o lead. Admin ve os dois times. Nao busco em maismae.bf_agentes porque o front
  // nao tem permissao nesse schema — uso as listas que ja estao no topo deste arquivo.
  const abrirTransferir = async (l) => {
    setTransf(l); setTransfPara(''); setTransfCod(''); setTransfMotivo(''); setTransfHoje(false); setTransfVends([])
    const base = meuTime || (ehAdmin ? Object.values(SUPERVISORAS_TIME).flat() : [])
    const ids = base.filter(id => id !== profile?.id && id !== l.bf_agente_id)
    if (ids.length === 0) return
    const { data } = await supabase.from('profiles')
      .select('id, nome').in('id', ids).eq('ativo', true).order('nome')
    setTransfVends(data || [])
  }

  // so "Outro" exige texto — nos demais o codigo ja diz tudo
  const transfOk = transfPara && transfCod && (transfCod !== 'outro' || transfMotivo.trim())

  const confirmarTransferir = async () => {
    if (!transf || !transfOk || transferindo) return
    setTransferindo(true)
    const { data, error } = await supabase.rpc('retroativo_transferir_lead', {
      p_lead_id: transf.id,
      p_para: transfPara,
      p_motivo_codigo: transfCod,
      p_motivo_texto: transfMotivo.trim() || null,
      p_marcar_entregue_hoje: transfHoje,
    })
    setTransferindo(false)
    if (error || !data?.ok) {
      alert('Não deu pra transferir: ' + (error?.message || data?.erro || 'erro')); return
    }
    alert(`✅ ${transf.nome || 'Cliente'} passou de ${data.de || 'sem dono'} para ${data.para}.`
      + (data.marcado_entregue_hoje ? '\nMarcado como entregue hoje.' : ''))
    setTransf(null); fechar(); carregar()
  }

  // Pega o card (marca selo) sem mandar mensagem
  // 21/09 — carimbo do atendimento por WhatsApp. TRES estados: nada, 'iniciado'
  // e 'sem_whats'. Clicar no botao que ja esta aceso DESMARCA; clicar no outro
  // TROCA. A RPC e toggle, entao a tela so manda o status desejado.
  // Isto NAO encosta na IA nem no "estou nesse" — sao carimbos independentes.
  const [carimbando, setCarimbando] = useState(false)
  const marcarWhats = async (l, status) => {
    if (carimbando) return
    setCarimbando(true)
    try {
      const { data, error } = await supabase.rpc('retroativo_marcar_whats', {
        p_lead_id: l.id, p_status: status, p_agente_id: profile?.id || null,
      })
      if (error) { alert('Não deu pra marcar: ' + error.message); return }
      if (data && data.ok === false) { alert(data.erro || 'Não deu pra marcar.'); return }
      const novo = (data && data.status) || null
      const quando = novo ? new Date().toISOString() : null
      setLead(x => (x ? { ...x, whats_marcado: novo, whats_iniciado_em: quando } : x))
      setBoard(b => b.map(x => (x.id === l.id ? { ...x, whats_marcado: novo, whats_iniciado_em: quando } : x)))
    } finally { setCarimbando(false) }
  }

  const marcarTratando = async (l) => {
    if (!l) return
    await supabase.rpc('bf_marcar_tratando', { p_lead_id: l.id, p_agente_id: profile.id })
    setLead({ ...l, bf_em_tratamento: true, cliente_respondeu: false })
    carregar()
  }
  // Solta o card (tira o selo)
  const soltarTratamento = async (l) => {
    if (!l) return
    await supabase.rpc('bf_soltar_tratamento', { p_lead_id: l.id })
    setLead({ ...l, bf_em_tratamento: false, cliente_respondeu: false })
    carregar()
  }

  const decidirCnis = async (aprovado) => {
    if (!lead || enviando) return
    let motivo = null
    if (!aprovado) {
      motivo = window.prompt('Motivo da reprovação do CNIS:')
      if (!motivo) return
    }
    setEnviando(true)
    try {
      const { error } = await supabase.rpc('mae_aprovar_cnis', {
        p_lead_id: lead.id, p_aprovado: aprovado, p_analista: profile.id, p_motivo: motivo,
      })
      if (error) { alert('Erro: ' + (error.message || 'tente de novo')) }
      else { fechar(); carregar() }
    } finally { setEnviando(false) }
  }

  // Move o lead de coluna do cadastro na mao (sem acionar a IA). Ja marca em tratamento + loga.
  const avancarEtapa = async (direcao) => {
    if (!lead || enviando) return
    setEnviando(true)
    try {
      const { data, error } = await supabase.rpc('mae_avancar_etapa', {
        p_lead_id: lead.id, p_agente_id: profile.id, p_direcao: direcao,
      })
      if (error || !data?.ok) { alert('Nao deu pra mover: ' + (error?.message || data?.erro || 'erro')); return }
      fechar(); carregar()
    } finally { setEnviando(false) }
  }

  const fecharVenda = async (id) => {
    if (!window.confirm('Marcar essa cliente como VENDA FECHADA?')) return
    const r = await supabase.rpc('mae_vendedora_fechou', { p_lead_id: id, p_vendedora: profile?.id })
    if (r.error || !r.data?.ok) { alert('Não deu: ' + (r.error?.message || r.data?.erro || 'erro')); return }
    fechar(); carregar()
    // o status fica carregado pra proxima vez que a ficha abrir mostrar o desfazer
    carregarVenda(id)
  }

  const abrirFechamento = async () => {
    const abrir = !fechAberto
    setFechAberto(abrir)
    if (!abrir) return
    setFechCarregando(true)
    const r = await supabase.rpc('retroativo_fechamento_dia', { p_dia: null })
    if (r.error) console.error(r.error)
    setFechamento(r.data || [])
    setFechCarregando(false)
  }

  const negarLead = async (id, motivo) => {
    const { data, error } = await supabase.rpc('mae_negar', { p_lead_id: id, p_agente_id: profile?.id, p_motivo: motivo })
    if (error || !data?.ok) { alert('Erro ao negar: ' + (error?.message || data?.erro || 'erro')); return }
    setMostrarMotivosNegar(false); fechar(); carregar()
  }
  // Arrastar card pra qualquer coluna. Reprovado/Negados pedem motivo; Outros não recebe.
  const soltarNaColuna = async (col) => {
    const id = arrastando; setArrastando(null)
    if (!id || col === 'OUTROS') return
    if (col === 'NEGADO') { const m = window.prompt('Motivo pra negar / não quis:'); if (m) negarLead(id, m); return }
    if (col === 'REPROVADO') {
      const m = window.prompt('Motivo da reprovação do CNIS:'); if (!m) return
      const { error } = await supabase.rpc('mae_aprovar_cnis', { p_lead_id: id, p_aprovado: false, p_analista: profile?.id, p_motivo: m })
      if (error) alert('Erro: ' + error.message); else carregar()
      return
    }
    const { data, error } = await supabase.rpc('mae_mover_coluna', { p_lead_id: id, p_agente_id: profile?.id, p_coluna: col })
    if (error || !data?.ok) { alert('Não moveu: ' + (error?.message || data?.erro || 'erro')); return }
    carregar()
  }

  const passaAtend = (l) => filtroAtendimento === 'todos' || (filtroAtendimento === 'respondido' ? l.humano_respondeu : !l.humano_respondeu)
  // 07/10 — separei o que a coluna TEM do que ela MOSTRA. Antes o título contava
  // board.filter(coluna) cru (sem os filtros de cor/atendimento) e os cards saíam
  // de outra conta, cortada em 60. Dava dois números diferentes na mesma coluna e
  // ninguém sabia qual valia.
  // Subi o corte de 60 pra 250: com 60 a coluna escondia mais do que mostrava
  // (203 leads, 60 na tela) e o título virava "60 de 203", que confundiu o time.
  // Agora o título traz só o número real e, se ainda sobrar card escondido, o
  // aviso aparece no PÉ da coluna, em texto, onde não se confunde com contagem.
  const LIMITE_CARDS = 250
  const totalDe = (col) => board.filter(l =>
    l.coluna === col && (!soVermelhos || l.cor === 'vermelho') && passaAtend(l)
    // vendedora: em "A analisar" só vê os que travaram (precisa de ajuda)
    && (!(ehVendedor && !veTodasColunas && col === 'A_ANALISAR') || l.cor === 'vermelho')
  ).length
  const cardsDe = (col) => board.filter(l =>
    l.coluna === col && (!soVermelhos || l.cor === 'vermelho') && passaAtend(l)
    && (!(ehVendedor && !veTodasColunas && col === 'A_ANALISAR') || l.cor === 'vermelho')
  ).slice(0, LIMITE_CARDS)
  const colunasVisiveis = veTodasColunas ? COLUNAS : COLUNAS.filter(([k]) => COLUNAS_VENDEDOR.includes(k))

  // ===== 19/10 — MESA DO VENDEDOR =====
  // Em que aba cada lead cai. Regra de ouro: quem FECHOU sai da mesa (vai pra aba
  // de venda) e quem o vendedor marcou vai pra aba da marcação. O resto é fila:
  // caiu hoje ou está atrasado. Sem marcação nenhuma = fila, que é o estado de
  // 100% dos leads até esta tela subir.
  function abaDoLead(l) {
    // 19/10 — o CADASTRO decide primeiro, antes da coluna do board. Se existe
    // cliente com esse CPF, o que vale é o que aconteceu com o contrato dela:
    // fechou (venda) ou caiu (recuperar). A coluna do board só opina sobre quem
    // ainda não virou cadastro nenhum.
    if (CLIENTE_FECHADO.includes(l.cliente_status)) return 'fechou'
    if (CLIENTE_PERDIDO.includes(l.cliente_status)) return 'recuperar'
    if (COLUNAS_MESA_FECHOU.includes(l.coluna)) return 'fechou'
    if (!COLUNAS_MESA_ATIVA.includes(l.coluna)) return null   // reprovado/negado não é da mesa
    if (l.vend_status === 'sem_direito') return 'sem_direito'
    if (l.vend_status === 'tel_errado') return 'tel'
    if (l.vend_status === 'sem_resposta') return 'retomar'
    if (l.vend_status === 'contato') return 'contato'
    return diaBR(l.entregue_vendedora_em) === hojeBR() ? 'hoje' : 'represado'
  }

  // Mesa ordenada: o mais velho primeiro. Lead parado há 5 dias dói mais que o de
  // hoje — na ordem do board (ultima_interacao DESC) ele ficava no fim e morria lá.
  const mesa = board
    .map(l => ({ ...l, _aba: abaDoLead(l), _h: horasDe(l.entregue_vendedora_em) }))
    .filter(l => l._aba)
  // O filtro de periodo vale pra LISTA, nao pros numeros do cabecalho: o cabecalho
  // tem que continuar dizendo a verdade da mesa inteira mesmo com filtro ligado,
  // senao ela liga "hoje" e acha que zerou os atrasados.
  const mesaFiltrada = periodoMesa === 'tudo'
    ? mesa
    : mesa.filter(l => dentroDoPeriodo(l.entregue_vendedora_em, periodoMesa))
  const mesaDa = (aba) => mesaFiltrada.filter(l => l._aba === aba).sort((a, b) => {
    // Recuperar: a mais RECENTE em cima — quanto mais fresca a perda, maior a
    // chance de trazer de volta. Nas outras, o mais parado em cima.
    if (aba === 'recuperar') return new Date(b.cliente_em || 0) - new Date(a.cliente_em || 0)
    return (b._h ?? -1) - (a._h ?? -1)
  })
  const contaAba = (aba) => mesaFiltrada.filter(l => l._aba === aba).length
  // "Atrasado" = na fila sem ninguém ter encostado há 48h+. É o número que o
  // Bruno vai cobrar, então fica em cima, em vermelho, e não escondido numa aba.
  // contaTudo ignora o filtro de periodo: e o que o CABECALHO usa. contaAba (acima)
  // respeita o filtro e e o que as ABAS usam. Os dois numeros sao diferentes de
  // proposito — o de cima e a verdade da mesa, o da aba e o recorte que ela pediu.
  const contaTudo = (aba) => mesa.filter(l => l._aba === aba).length
  const paradosGraves = mesa.filter(l => (l._aba === 'hoje' || l._aba === 'represado') && (l._h ?? 0) >= 48).length
  const mesaViva = contaTudo('hoje') + contaTudo('represado') + contaTudo('contato') + contaTudo('retomar')

  // ===== numeros do cabecalho =====
  // "Falou hoje" conta vend_contato_em caindo no dia de HOJE em Sao Paulo, nao
  // "tem vend_contato_em": o que importa e o trabalho de hoje, nao o historico.
  const caiuHoje = mesa.filter(l =>
    l._aba !== 'fechou' && l._aba !== 'recuperar'
    && diaBR(l.entregue_vendedora_em) === hojeBR()).length
  const falouHoje = mesa.filter(l => diaBR(l.vend_contato_em) === hojeBR()).length
  const novasSemContato = mesa.filter(l =>
    diaBR(l.entregue_vendedora_em) === hojeBR() && !l.vend_contato_em
    && l._aba !== 'fechou' && l._aba !== 'recuperar').length
  const vendasPeriodo = contaTudo('fechou')
  const aRecuperar = contaTudo('recuperar')
  const pctDia = caiuHoje > 0 ? Math.round(100 * Math.min(falouHoje, caiuHoje) / caiuHoje) : 0
  const iniciaisNome = (profile?.nome || '?').trim().split(/\s+/)
    .slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || '?'
  const hojeExtenso = new Date().toLocaleDateString('pt-BR',
    { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo' })

  // Marca a ação do vendedor. Quem decide o que pode é o BANCO
  // (retroativo_vendedor_marcar); a tela só manda e recarrega.
  async function marcarMesa(l, acao, pedirObs) {
    let obs = null
    if (pedirObs) {
      obs = window.prompt(acao === 'sem_direito'
        ? 'Por que ela não tem direito? (fica registrado no lead)'
        : 'Alguma observação? (pode deixar vazio)') || null
      if (acao === 'sem_direito' && !obs) return   // tirar da mesa exige motivo
    }
    setMarcando(l.id)
    const { data, error } = await supabase.rpc('retroativo_vendedor_marcar', {
      p_lead_id: l.id, p_acao: acao, p_obs: obs,
    })
    setMarcando(null)
    if (error || !data?.ok) { alert('Não gravou: ' + (error?.message || data?.erro || 'erro')); return }
    carregar()
  }

  return (
    <div>
      <div style={s.title}>{temMesa && modoMesa ? '📋 Minha mesa — Retroativo' : '🤱 Revisão IA — Retroativo'}</div>
      <div style={s.sub}>{temMesa && modoMesa
        ? 'Suas clientes pré-aprovadas. Marque o que aconteceu em cada ligação — é assim que nenhuma fica esquecida.'
        : ehVendedor && !veTodasColunas
        ? 'Seus clientes: CNIS já enviado em diante. 🤖 = pré-aprovada pela máquina (confira de perto). Em "A analisar" aparecem só os que travaram e precisam de você.'
        : 'Funil das mães do retroativo. Vermelho = travou agora; cinza = backlog frio.'}</div>

      {/* 19/10 — no modo Mesa os filtros de board ficam fora: a vendedora não
          filtra por cor nem por data de atividade, ela zera a fila do dia. Os
          filtros voltam inteiros no board antigo, que segue a um clique. */}
      <div style={{ ...s.topo, display: temMesa && modoMesa ? 'none' : s.topo.display }}>
        <button style={{ ...s.chip, ...(soVermelhos ? s.chipOn : {}) }} onClick={() => setSoVermelhos(v => !v)}>
          🔴 Só vermelhos ({totalVermelhos})
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
        <select style={s.chip} value={filtroEntrega} onChange={e => setFiltroEntrega(e.target.value)} title="Quando a advogada entregou o lead para a vendedora">
          {OPCOES_DATA.map(([v, l]) => <option key={v} value={v}>⚖️ Entregue: {l}</option>)}
        </select>
        {filtroEntrega === 'custom' && (<>
          <input type="date" style={s.chip} value={entregaDe} onChange={e => setEntregaDe(e.target.value)} />
          <input type="date" style={s.chip} value={entregaAte} onChange={e => setEntregaAte(e.target.value)} />
        </>)}
        <select style={s.chip} value={filtroAtendimento} onChange={e => setFiltroAtendimento(e.target.value)} title="Atendimento humano">
          <option value="todos">Atendimento: todos</option>
          <option value="respondido">✅ Já respondido</option>
          <option value="sem">⚠️ Sem resposta</option>
        </select>
        <span style={s.kpi}>🔍 Fila do analista: <b>{filaAnalista}</b></span>
        <span style={s.kpi}>Total: <b>{board.length}</b></span>
        <span style={s.kpi}>Finalizadas: <b>{finalizadas}</b></span>
        {ehSupervisor && <span style={s.kpi}>⚪ Sem ninguém: <b>{semDono}</b></span>}
        {ehAdmin && (
          <select style={s.chip} value={filtroAgente} onChange={e => setFiltroAgente(e.target.value)}>
            <option value="">Todos os agentes</option>
            {agentes.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        )}
        <button style={s.chip} onClick={carregar}>🔄 Atualizar</button>
      </div>

      {/* Busca por CPF ou telefone — varre o funil inteiro, ignora os filtros acima */}
      <div style={s.buscaWrap}>
        <input
          style={s.buscaInput}
          value={busca}
          placeholder="🔎 Achar cliente: cole o CPF ou o telefone"
          onChange={e => setBusca(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') buscarCliente() }}
        />
        <button style={s.buscaBtn} onClick={buscarCliente} disabled={buscando}>
          {buscando ? 'Buscando...' : 'Buscar'}
        </button>
        {achados !== null && <button style={s.chip} onClick={limparBusca}>limpar</button>}
      </div>

      {achados !== null && (
        <div style={s.buscaRes}>
          {achados.length === 0
            ? <div style={s.buscaVazio}>Nenhuma cliente com esse CPF ou telefone no funil do Retroativo.</div>
            : achados.map(c => (
              <div key={c.id} style={s.buscaCard}>
                <div style={s.buscaTopo}>
                  <span style={s.cardNome}>{c.nome || 'Cliente +Mais Mãe'}</span>
                  <span style={s.buscaTag}>{c.coluna}</span>
                </div>
                <div style={s.cardMeta}>
                  {c.tel} · CPF {c.cpf || '—'} · parada há {c.minutos_parado >= 60
                    ? Math.floor(c.minutos_parado / 60) + 'h' + String(c.minutos_parado % 60).padStart(2, '0')
                    : c.minutos_parado + 'min'}
                </div>
                <div style={s.cardMeta}>
                  {c.agente_nome ? '👤 com ' + c.agente_nome : '⚪ sem ninguém'}
                  {c.entregue_vendedora_em ? ' · entregue à vendedora' : ''}
                  {c.cliente_id_crm ? ' · ✅ já está no CRM' : ''}
                </div>
                {(c.advogada_motivo || c.motivo_desqualificacao) && (
                  <div style={s.buscaMotivo}>{c.advogada_motivo || c.motivo_desqualificacao}</div>
                )}
                {/* CPF gravado torto: a busca acha assim mesmo, mas avisa — senao a consulta
                    no PromoBank nunca roda e ninguem entende por que a cliente travou. */}
                <div style={/⚠️/.test(c.achou_por || '') ? s.buscaAlerta : s.buscaComo}>
                  achou por {c.achou_por}
                </div>
                <button style={s.buscaAbrir} onClick={() => abrirLead(c)}>Abrir ficha</button>
              </div>
            ))}
        </div>
      )}

      {/* PAINEL DO DIA — só o Bruno. Distribuição conta pelo dia em que a advogada
          aprovou e o rodízio entregou (bf_atribuido_em), NÃO pela chegada do lead.
          Venda conta por venda_fechada_em e credita quem fechou. */}
      {ehDono && (
        <div style={s.confWrap}>
          <button style={s.painelBtn} onClick={abrirPainelDia}>
            {painelAberto ? '▾' : '▸'} 📊 Meu painel do dia — distribuição e vendas
          </button>
          {painelAberto && (
            <div style={s.painelCorpo}>
              <div style={s.painelTopo}>
                <input type="date" style={s.chip} value={painelData}
                  onChange={e => { setPainelData(e.target.value); carregarPainelDia(e.target.value) }} />
                {painelData && (
                  <button style={s.chip} onClick={() => { setPainelData(''); carregarPainelDia('') }}>hoje</button>
                )}
                <button style={s.chip} onClick={() => carregarPainelDia(painelData)}>🔄 Atualizar</button>
                {painelCarregando && <span style={{ fontSize: 12, color: '#5b6b84' }}>carregando...</span>}
              </div>

              {painelDia && (() => {
                const d = painelDia.distribuicao, v = painelDia.vendas
                const totalDist = d.reduce((s2, x) => s2 + Number(x.recebidos || 0), 0)
                const totalPegou = d.reduce((s2, x) => s2 + Number(x.pegou || 0), 0)
                const totalVendas = v.reduce((s2, x) => s2 + Number(x.vendas || 0), 0)
                const vendasDe = n => (v.find(x => x.vendedora === n) || {}).vendas || 0
                return (
                  <>
                    <div style={s.painelKpis}>
                      <span style={s.kpi}>📥 Distribuídos hoje: <b>{totalDist}</b></span>
                      <span style={s.kpi}>✋ Pegaram: <b>{totalPegou}</b>{totalDist ? ' (' + Math.round(100 * totalPegou / totalDist) + '%)' : ''}</span>
                      <span style={{ ...s.kpi, background: 'rgba(52,211,153,.16)', color: '#065f46', fontWeight: 700 }}>
                        💰 Vendas: <b>{totalVendas}</b>
                      </span>
                      <span style={s.kpi}>📈 Conversão: <b>{totalDist ? (100 * totalVendas / totalDist).toFixed(1) + '%' : '—'}</b></span>
                    </div>

                    {d.length === 0 && <div style={s.painelVazio}>Nada distribuído nesse dia.</div>}
                    {d.length > 0 && (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={s.tab}>
                          <thead><tr>
                            <th style={s.th}>vendedora</th>
                            <th style={s.thNum}>recebeu</th>
                            <th style={s.thNum}>pegou</th>
                            <th style={s.thNum}>não pegou</th>
                            <th style={s.thNum}>h até pegar</th>
                            <th style={s.thNum}>vendas</th>
                            <th style={s.thNum}>conversão</th>
                            <th style={s.thNum}>em aberto</th>
                            <th style={s.thNum}>1ª → última</th>
                          </tr></thead>
                          <tbody>
                            {d.map(x => {
                              const vd = Number(vendasDe(x.vendedora))
                              const rec = Number(x.recebidos || 0)
                              const naoPegou = Number(x.ninguem_pegou || 0)
                              return (
                                <tr key={x.vendedora}>
                                  <td style={s.td}>{x.vendedora}</td>
                                  <td style={s.tdNum}>{rec}</td>
                                  <td style={s.tdNum}>{x.pegou}</td>
                                  {/* quem recebeu e não pegou nada é o que trava o funil */}
                                  <td style={{ ...s.tdNum, ...(naoPegou === rec && rec > 0 ? s.tdRuim : {}) }}>{naoPegou}</td>
                                  <td style={s.tdNum}>{x.h_ate_pegar != null ? Number(x.h_ate_pegar).toFixed(1) + 'h' : '—'}</td>
                                  <td style={{ ...s.tdNum, ...(vd > 0 ? s.tdBom : {}) }}>{vd}</td>
                                  <td style={s.tdNum}>{rec ? (100 * vd / rec).toFixed(0) + '%' : '—'}</td>
                                  <td style={s.tdNum}>{x.em_aberto}</td>
                                  <td style={s.tdNum}>{String(x.primeiro || '').slice(0, 5)} → {String(x.ultimo || '').slice(0, 5)}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* vendas de quem NAO recebeu no dia nao aparecem na tabela acima */}
                    {v.filter(x => !d.some(y => y.vendedora === x.vendedora)).map(x => (
                      <div key={x.vendedora} style={s.painelNota}>
                        💰 {x.vendedora}: {x.vendas} venda(s) hoje de cliente recebido em outro dia
                      </div>
                    ))}
                    <div style={s.painelPe}>
                      Distribuição conta pelo dia em que a advogada aprovou e o rodízio entregou — não pela data de chegada do lead.
                      Venda conta por quem fechou.
                    </div>
                  </>
                )
              })()}
            </div>
          )}
        </div>
      )}

      {ehAdmin && (
        <div style={s.confWrap}>
          <button style={s.confBtn} onClick={abrirConferencia}>
            {confAberta ? '▾' : '▸'} 🔍 Conferência do funil — o que passou no PromoBank e o que falta
          </button>
          {confAberta && (
            confCarregando ? (
              <div style={s.confVazio}>Carregando…</div>
            ) : (
              <div style={s.confBox}>
                {(conferencia || []).map(l => (
                  <div key={l.ordem} style={s.confLinha(l.grupo)}>
                    <span>{l.etapa}</span>
                    <b>{l.qtd}</b>
                  </div>
                ))}
                <div style={s.confNota}>
                  A cliente só chega na advogada depois de passar no PromoBank.
                  Se a linha do <b>furo</b> for maior que zero, tem gente com CPF que o robô deixou pra trás.
                </div>
              </div>
            )
          )}
        </div>
      )}

      <div style={s.confWrap}>
        <button style={s.confBtn} onClick={abrirFechamento}>
          {fechAberto ? '▾' : '▸'} 📒 Fechamento do dia — fechou / negou / sem resposta
        </button>
        {fechAberto && (
          fechCarregando ? (
            <div style={s.confVazio}>Carregando…</div>
          ) : !(fechamento || []).length ? (
            <div style={s.confVazio}>Nada registrado hoje ainda.</div>
          ) : (
            <div style={{ ...s.confBox, maxWidth: 780 }}>
              {(fechamento || []).map((f, i) => (
                <div key={i} style={s.fechLinha(f.resultado)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span><b>{f.vendedora}</b> · {f.resultado === 'FECHOU' ? '✅' : f.resultado === 'NEGOU' ? '❌' : '🔁'} {f.resultado}</span>
                    <b>{f.qtd}</b>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#5b6b84', marginTop: 2 }}>{f.motivo}</div>
                  <div style={{ fontSize: 11, color: '#8b9bb4', marginTop: 3 }}>{f.nomes}</div>
                </div>
              ))}
              <div style={s.confNota}>
                🔁 <b>Sem resposta</b> sai separado de propósito: é a lista de retrabalho.
              </div>
            </div>
          )
        )}
      </div>

      {/* ===== 19/10 (Bruno) — MESA DO VENDEDOR =====
          Nasceu de um número: 840 leads entregues em 14 dias, ZERO com registro de
          contato. O board mostra o estado do robô, não o trabalho dela — então
          ninguém via que 149 dos 150 leads da Gislaine estavam parados há 48h+.
          Aqui cada lead tem UMA pergunta: você já falou com ela? E quatro botões
          que respondem. O board antigo não saiu do lugar: está logo abaixo. */}
      {temMesa && modoMesa && (
        <div>
          {/* 19/10 (Bruno) — CABEÇALHO DA MESA. Os cinco números antes de qualquer
              lista, pra ela abrir a tela e já saber o tamanho do dia. Nenhum deles
              é conta nova: tudo sai do board que já está carregado. */}
          <div style={s.cab}>
            <div style={s.cabTopo}>
              <div style={s.cabQuem}>
                <div style={s.cabAv}>{iniciaisNome}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={s.cabNome}>{profile?.nome || 'Minha mesa'}</div>
                  <div style={s.cabSub}>Retroativo · {hojeExtenso}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {qtNovos > 0 && (
                  <span style={s.cabSino}>
                    <span style={s.cabPonto} />
                    {qtNovos} {qtNovos === 1 ? 'cliente nova hoje' : 'clientes novas hoje'}
                  </span>
                )}
                <button style={s.chip} onClick={carregar}>🔄 Atualizar</button>
                <button style={s.mesaTrocar} onClick={() => setModoMesa(false)}>ver board antigo</button>
              </div>
            </div>

            <div style={s.cabKpis}>
              <div style={s.cabKpi('rgba(52,211,153,.12)', 'rgba(5,150,105,.28)')}>
                <div style={s.cabKpiTit('#047857')}>Caíram hoje</div>
                <div style={s.cabKpiNum('#047857')}>{caiuHoje}</div>
                <div style={s.cabKpiPe}>
                  {novasSemContato > 0 ? `${novasSemContato} ainda sem contato` : 'todas já contatadas'}
                </div>
              </div>
              <div style={s.cabKpi()}>
                <div style={s.cabKpiTit()}>Na sua mesa</div>
                <div style={s.cabKpiNum()}>{mesaViva}</div>
                <div style={s.cabKpiPe}>clientes em aberto</div>
              </div>
              <div style={s.cabKpi(
                paradosGraves > 0 ? 'rgba(248,113,113,.11)' : '#f8fafc',
                paradosGraves > 0 ? 'rgba(220,38,38,.26)' : null)}>
                <div style={s.cabKpiTit(paradosGraves > 0 ? '#991b1b' : null)}>Parados +48h</div>
                <div style={s.cabKpiNum(paradosGraves > 0 ? '#991b1b' : null)}>{paradosGraves}</div>
                <div style={s.cabKpiPe}>
                  {paradosGraves > 0 ? 'ninguém falou ainda' : 'nada atrasado 🎉'}
                </div>
              </div>
              <div style={s.cabKpi()}>
                <div style={s.cabKpiTit()}>Você falou hoje</div>
                <div style={s.cabKpiNum()}>{falouHoje}</div>
                <div style={s.cabKpiPe}>{caiuHoje > 0 ? `de ${caiuHoje} que caíram` : 'contatos de hoje'}</div>
              </div>
              <div style={s.cabKpi()}>
                <div style={s.cabKpiTit()}>Vendas fechadas</div>
                <div style={s.cabKpiNum()}>{vendasPeriodo}</div>
                <div style={s.cabKpiPe}>contrato assinado</div>
              </div>
              {aRecuperar > 0 && (
                <div style={s.cabKpi('rgba(251,191,36,.13)', 'rgba(180,83,9,.26)')}>
                  <div style={s.cabKpiTit('#92400e')}>Pra recuperar</div>
                  <div style={s.cabKpiNum('#92400e')}>{aRecuperar}</div>
                  <div style={s.cabKpiPe}>fecharam e caíram</div>
                </div>
              )}
            </div>

            {caiuHoje > 0 && (<>
              <div style={s.cabBarra}><div style={s.cabBarraIn(pctDia)} /></div>
              <div style={s.cabBarraTxt}>
                <span>Você já falou com <b style={{ color: '#0f172a' }}>{Math.min(falouHoje, caiuHoje)} de {caiuHoje}</b> que caíram hoje</span>
                <span><b style={{ color: '#0f172a' }}>{pctDia}%</b> do dia</span>
              </div>
            </>)}
          </div>

          {paradosGraves > 0 && (
            <div style={s.mesaAlerta}>
              <b>{paradosGraves} {paradosGraves === 1 ? 'cliente está' : 'clientes estão'} há mais de 48h sem ninguém falar com {paradosGraves === 1 ? 'ela' : 'elas'}.</b>{' '}
              Cada dia parado é uma chance de ela fechar com outro escritório. Comece pela aba Atrasados.
            </div>
          )}

          <div style={s.mesaTopo}>
            {ABAS_MESA.map(([k, rotulo]) => {
              const n = contaAba(k)
              const urgente = k === 'represado' && n > 0
              return (
                <button key={k} style={s.mesaAba(abaMesa === k, urgente)} onClick={() => setAbaMesa(k)}>
                  {rotulo}<span style={s.mesaAbaNum(abaMesa === k)}>{n}</span>
                </button>
              )
            })}
            {/* 19/10 — filtro por QUANDO a advogada te entregou. Fica do lado das
                abas, não em cima: é recorte dentro da aba, não troca de aba. */}
            <select style={s.chip} value={periodoMesa} onChange={e => setPeriodoMesa(e.target.value)}
              title="Quando a advogada te entregou a cliente">
              {PERIODOS_MESA.map(([v, l]) => <option key={v} value={v}>📅 {l}</option>)}
            </select>
            {periodoMesa !== 'tudo' && (
              <button style={s.mesaTrocar} onClick={() => setPeriodoMesa('tudo')}>limpar filtro</button>
            )}
          </div>

          {periodoMesa !== 'tudo' && (
            <div style={{ ...s.blocoPe, marginTop: -4, marginBottom: 10 }}>
              Mostrando só o que te entregaram em <b>{(PERIODOS_MESA.find(p => p[0] === periodoMesa) || [,''])[1].toLowerCase()}</b>.
              Os números lá de cima continuam contando a mesa inteira.
            </div>
          )}

          <div style={s.mesaLista}>
            {mesaDa(abaMesa).length === 0 ? (
              <div style={s.mesaVazio}>
                {abaMesa === 'hoje' ? 'Nenhum lead novo caiu hoje ainda. A advogada libera ao longo do dia — vale olhar os Atrasados enquanto isso.'
                  : abaMesa === 'represado' ? '🎉 Nada atrasado. Sua mesa está limpa.'
                  : abaMesa === 'contato' ? 'Nenhuma cliente em contato agora. Clique em "Peguei esta cliente" quando começar a falar com alguém.'
                  : abaMesa === 'retomar' ? 'Ninguém marcado como "não respondeu".'
                  : abaMesa === 'tel' ? 'Nenhum telefone errado pendente.'
                  : abaMesa === 'sem_direito' ? 'Nenhuma cliente marcada como sem direito.'
                  : abaMesa === 'recuperar' ? '🎉 Nenhuma cliente sua caiu depois de fechar.'
                  : 'Nenhuma venda fechada ainda.'}
                {periodoMesa !== 'tudo' && ' (com o filtro de data ligado)'}
              </div>
            ) : mesaDa(abaMesa).map(l => {
              const urgente = (l._aba === 'hoje' || l._aba === 'represado') && (l._h ?? 0) >= 48
              const fechou = l._aba === 'fechou'
              const perdeu = l._aba === 'recuperar'
              const zap = linkChatwoot(l)
              const perda = MOTIVO_PERDA[l.cliente_status] || ['❔', 'Caiu', '']
              return (
                <div key={l.id} style={s.mesaCard(urgente)}>
                  <div style={s.mesaCardTopo}>
                    <div style={{ minWidth: 0 }}>
                      <div style={s.mesaNome}>{l.nome || 'Sem nome'}</div>
                      <div style={s.mesaTel}>{l.tel || 'sem telefone'}{l.cpf ? ' · CPF ' + l.cpf : ''}</div>
                    </div>
                    {!fechou && (
                      <span style={s.mesaIdade(urgente)}>
                        {l._h === null ? 'sem data' : 'na sua mão há ' + fmtHoras(l._h)}
                      </span>
                    )}
                    {fechou && (
                      <span style={s.mesaIdade(false)}>
                        {l.cliente_em ? '🎉 vendida em ' + fmtCarimbo(l.cliente_em) : '🎉 vendida'}
                      </span>
                    )}
                    {perdeu && (
                      <span style={{ ...s.mesaIdade(false), background: 'rgba(251,191,36,.18)', color: '#92400e' }}>
                        {perda[0]} {l.cliente_em ? fmtCarimbo(l.cliente_em) : ''}
                      </span>
                    )}
                  </div>

                  {/* 19/10 — por que caiu, em portugues. Sem isso a aba vira uma
                      lista de nomes sem explicacao e a vendedora nao sabe o que fazer. */}
                  {perdeu && (
                    <div style={{ ...s.mesaObs, background: 'rgba(251,191,36,.12)' }}>
                      <b>{perda[1]}</b>{perda[2] ? ' — ' + perda[2] : ''}
                    </div>
                  )}

                  {/* O vínculo é o argumento da ligação: sem ele a vendedora liga
                      sem saber por que a cliente tem direito. Vem do GERID, é o
                      mesmo dado que a advogada usou pra aprovar. */}
                  {/* 19/10 — condicionado a EMPRESA, nao a vinculo_direito existir.
                      Desde a correcao do nome do filho, vinculo_direito vem preenchido
                      (so com filho_nome) tambem em lead sem vinculo decisivo — a lead
                      578729 e assim. Testar o objeto aqui desenhava um bloco azul
                      "Empresa que deu o direito" com um travessao dentro. */}
                  {l.vinculo_direito && (l.vinculo_direito.empresa || '').trim() && (
                    <div style={s.mesaVinc}>
                      <div style={s.mesaVincTit}>Empresa que deu o direito</div>
                      <div style={{ ...s.mesaVincTxt, fontWeight: 700 }}>
                        {l.vinculo_direito.empresa || '—'}
                        {l.vinculo_direito.tipo ? ` (${l.vinculo_direito.tipo})` : ''}
                      </div>
                      <div style={s.mesaVincTxt}>{textoVinculo(l.vinculo_direito)}</div>
                    </div>
                  )}

                  {/* 24 meses com seguro-desemprego: a cliente só tem direito se
                      recebeu seguro, e isso SÓ ela sabe. Tem que perguntar na
                      ligação — sem isso a venda cai na validação do advogado. */}
                  {(l.advogada_motivo || '').indexOf('seguro-desemprego') >= 0 && (
                    <div style={s.mesaObs}>⚠️ Perguntar se ela recebeu seguro-desemprego — o direito depende disso.</div>
                  )}

                  <div style={s.mesaMeta}>
                    {/* 19/10 (Bruno) — nome do filho quando o Detetive trouxe. Vem dentro
                        do vinculo_direito, casado por mes/ano com a data do parto; quando
                        nao bate, nao vem nome nenhum (melhor calar do que falar errado). */}
                    {l.vinculo_direito && (l.vinculo_direito.filho_nome || '').trim()
                      ? <b style={{ color: '#0f172a' }}>👶 {l.vinculo_direito.filho_nome.trim()}</b>
                      : (l.data_nascimento_filho ? '👶 filho' : '')}
                    {l.data_nascimento_filho ? ' · nasceu em ' + l.data_nascimento_filho : ''}
                    {l.idade_bebe ? ' · ' + l.idade_bebe : ''}
                    {l.whats_tem === 'false' || l.whats_marcado === 'sem_whats'
                      ? ' · 📵 SEM WhatsApp — tem que ligar' : ''}
                    {l.vend_tentativas > 0 ? ` · ${l.vend_tentativas} ${l.vend_tentativas === 1 ? 'tentativa' : 'tentativas'}` : ''}
                    {l.vend_contato_em ? ' · 1º contato ' + fmtCarimbo(l.vend_contato_em) : ''}
                  </div>

                  {l.vend_obs && <div style={s.mesaObs}>📝 {l.vend_obs}</div>}

                  {!fechou && !perdeu && l._aba !== 'sem_direito' && (
                    <div style={s.mesaAcoes}>
                      {l._aba !== 'contato' && (
                        <button style={s.mesaPegar} disabled={marcando === l.id}
                          onClick={() => marcarMesa(l, 'pegar', false)}>
                          {marcando === l.id ? 'gravando...' : '✋ Peguei esta cliente'}
                        </button>
                      )}
                      {zap && (
                        <a href={zap} target="_blank" rel="noreferrer" style={s.mesaZap}>💬 WhatsApp</a>
                      )}
                      {l._aba === 'tel'
                        ? (
                          <button style={s.mesaAcao('rgba(5,150,105,.35)', '#059669')} disabled={marcando === l.id}
                            onClick={() => marcarMesa(l, 'reabrir', false)}>
                            ↩️ Telefone novo — devolver pra mesa
                          </button>
                        )
                        : ACOES_MESA.map(([cod, rotulo, bg, cor]) => (
                          <button key={cod} style={s.mesaAcao(bg, cor)} disabled={marcando === l.id}
                            onClick={() => marcarMesa(l, cod, cod !== 'sem_resposta')}>
                            {rotulo}
                          </button>
                        ))}
                      <button style={s.mesaFicha} onClick={() => abrirLead(l)}>abrir ficha</button>
                    </div>
                  )}

                  {l._aba === 'sem_direito' && (
                    <div style={s.mesaAcoes}>
                      <button style={s.mesaAcao('rgba(5,150,105,.35)', '#059669')} disabled={marcando === l.id}
                        onClick={() => marcarMesa(l, 'reabrir', false)}>
                        ↩️ Errei — devolver pra mesa
                      </button>
                      <button style={s.mesaFicha} onClick={() => abrirLead(l)}>abrir ficha</button>
                    </div>
                  )}

                  {fechou && (
                    <div style={s.mesaAcoes}>
                      {zap && <a href={zap} target="_blank" rel="noreferrer" style={s.mesaZap}>💬 WhatsApp</a>}
                      <button style={s.mesaFicha} onClick={() => abrirLead(l)}>abrir ficha</button>
                    </div>
                  )}

                  {/* 19/10 — RECUPERAR. Por enquanto só falar com a cliente: o botão
                      de reemitir contrato entra aqui quando o Bruno validar que é
                      viável. Emitir contrato mexe em dinheiro de advogado, então
                      não sobe sem o aval dele. */}
                  {perdeu && (
                    <div style={s.mesaAcoes}>
                      {zap && <a href={zap} target="_blank" rel="noreferrer" style={s.mesaZap}>💬 Falar com ela</a>}
                      <button style={s.mesaFicha} onClick={() => abrirLead(l)}>abrir ficha</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div style={s.blocoPe}>
            A venda não tem botão: quando o cadastro da cliente sobe pelo sistema e o
            contrato é assinado, ela aparece sozinha na aba Venda fechada. O que você
            marca aqui é só o CONTATO — serve pra ninguém ficar esquecido na mesa.
          </div>
        </div>
      )}

      {/* Board kanban original. Continua a ferramenta da supervisão e de quem
          quiser a visão de funil — nada foi retirado dele. */}
      {temMesa && !modoMesa && (
        <div style={{ marginBottom: 10 }}>
          <button style={s.chip} onClick={() => setModoMesa(true)}>← voltar pra minha mesa</button>
        </div>
      )}
      <div style={{ ...s.board, display: temMesa && modoMesa ? 'none' : s.board.display }}>
        {colunasVisiveis.map(([col, titulo]) => {
          const cards = cardsDe(col)
          const podeSoltar = col !== 'OUTROS'
          return (
            <div key={col}
              style={{ ...s.col, ...(podeSoltar && arrastando ? { outline: '2px dashed #60a5fa' } : {}) }}
              onDragOver={podeSoltar ? (e => e.preventDefault()) : undefined}
              onDrop={podeSoltar ? (e => { e.preventDefault(); soltarNaColuna(col) }) : undefined}>
              <div style={s.colTitulo}><span>{titulo}</span><span>{totalDe(col)}</span></div>
              {cards.map(l => (
                <div key={l.id} draggable
                  onDragStart={(e) => { try { e.dataTransfer.setData('text/plain', String(l.id)); e.dataTransfer.effectAllowed = 'move' } catch (_) {} setArrastando(l.id) }}
                  onDragEnd={() => setArrastando(null)}
                  style={{ ...s.card, ...(CORES[l.cor] || CORES.normal), cursor: 'grab' }}
                  onClick={() => abrirLead(l)}>
                  <div style={s.cardNome}>{l.nome || 'Sem nome'}</div>
                  {l.coluna === 'PITCH_LIBERADO' && l.cnis_aprovado !== 'true' && (
                    <div style={s.seloMaquina}>🤖 pré-aprovada máquina</div>
                  )}
                  {l.coluna === 'PITCH_LIBERADO' && l.cnis_aprovado === 'true' && l.advogada_motivo && (
                    <div style={s.seloAdvogada}>⚖️ {l.advogada_motivo}</div>
                  )}
                  {l.coluna === 'PITCH_LIBERADO' && (l.advogada_motivo || '').indexOf('seguro-desemprego') >= 0 && (
                    <div style={s.seloSeguro}>⚠️ perguntar do seguro-desemprego</div>
                  )}
                  {/* 21/09 — DOIS dados distintos, nessa ordem:
                      1) o carimbo da ATENDENTE (o que uma pessoa constatou)
                      2) o selo do ROBO validador (o que a Evolution respondeu)
                      O carimbo vem primeiro porque vale mais: é observação direta.
                      Quem nao tem nem um nem outro nao mostra nada — sao 7 mil
                      leads sem validacao e o card viraria um mar de cinza. */}
                  {l.whats_marcado === 'iniciado' && (
                    <div style={s.seloCarimbo('#065f46', 'rgba(52,211,153,.14)', 'rgba(5,150,105,.25)')}
                      title="alguém da equipe já iniciou o atendimento por WhatsApp">
                      📲 Atendimento iniciado no WhatsApp{fmtCarimbo(l.whats_iniciado_em) ? ' · ' + fmtCarimbo(l.whats_iniciado_em) : ''}
                    </div>
                  )}
                  {l.whats_marcado === 'sem_whats' && (
                    <div style={s.seloCarimbo('#991b1b', 'rgba(220,38,38,.12)', 'rgba(220,38,38,.32)')}
                      title="a equipe constatou que esse número não tem WhatsApp — ligar">
                      📵 Não tem WhatsApp (conferido){fmtCarimbo(l.whats_iniciado_em) ? ' · ' + fmtCarimbo(l.whats_iniciado_em) : ''}
                    </div>
                  )}
                  {/* selo do robo. So aparece quando a pessoa NAO carimbou — se
                      carimbou, quem manda e ela, e dois selos dizendo a mesma
                      coisa so ocupam espaco. A comparacao entre os dois fica na
                      ficha, onde ha lugar pra mostrar os dois lado a lado. */}
                  {!l.whats_marcado && l.whats_tem === 'false' && (
                    <div style={s.seloSemWhats}>📵 Sem WhatsApp — ligar, não mandar mensagem</div>
                  )}
                  {!l.whats_marcado && l.whats_tem === 'true' && (
                    <div><span style={s.seloTemWhats}>✅ WhatsApp</span></div>
                  )}
                  <div style={s.cardMeta}>
                    {l.cor === 'vermelho' ? '🔴 ' : ''}{l.cor === 'amarelo' ? '🟡 ' : ''}parada há {fmtParado(l.minutos_parado)}
                    {ehSupervisor && l.agente_nome ? ` · ${l.agente_nome}` : ''}
                  </div>
                  {(l.coluna === 'REPROVADO' || l.coluna === 'NEGADO') && l.cnis_reprovado_motivo && (
                    <div style={s.cardMeta}>❌ {l.cnis_reprovado_motivo}</div>
                  )}
                  {l.chatwoot_conversation_id && (
                    <a href={linkChatwoot(l)} target="_blank" rel="noreferrer" draggable={false} onClick={e => e.stopPropagation()} onDragStart={e => e.preventDefault()}
                      style={{ fontSize: 12, textDecoration: 'none', background: 'rgba(52,211,153,.14)', color: '#059669', borderRadius: 6, padding: '1px 7px', fontWeight: 700, display: 'inline-block', marginTop: 4 }}
                      title="Abrir conversa no Chatwoot">💬</a>
                  )}
                  {seloTratamento(l)}
                </div>
              ))}
              {/* 07/10 — aviso de corte no pé da coluna, em texto, longe do contador */}
              {totalDe(col) > LIMITE_CARDS && (
                <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center', padding: '8px 4px' }}>
                  + {totalDe(col) - LIMITE_CARDS} não exibidos · use os filtros para reduzir a lista
                </div>
              )}
            </div>
          )
        })}
      </div>

      {lead && (
        <div style={s.overlay} onClick={fechar}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{lead.nome || 'Sem nome'}</div>
              <button style={s.btnFechar} onClick={fechar}>Fechar ✕</button>
            </div>

            {/* 01/10 — trocar a dona e acao de GESTAO, nao de venda: fica junto do
                nome da dona e so a supervisora ve. Antes era um botao do mesmo
                tamanho do "Fechei a venda", no meio das acoes da vendedora. */}
            {ehSupervisor && (
              <div style={s.donoLinha}>
                <span>👤 {lead.agente_nome ? <b>{lead.agente_nome}</b> : <i>sem dona</i>}</span>
                {podeTransferir && (
                  <button style={s.donoAcao} onClick={() => abrirTransferir(lead)}>
                    passar para outra
                  </button>
                )}
              </div>
            )}

            <div style={s.ficha}>
              {lead.data_nascimento_filho && (
                <div style={s.destaque}>👶 Nascimento do filho: {lead.data_nascimento_filho}{lead.idade_bebe ? ` (${lead.idade_bebe})` : ''}</div>
              )}

              {/* 22/09 — O QUE GARANTE O DIREITO DELA. É o que a vendedora
                  confirma na ligação: "você trabalhou na X até tal data, né?".
                  Sem isso ela liga no escuro. Vem do robô do GERID. */}
              {lead.vinculo_direito && !lead.vinculo_direito.bruto && (
                <div style={s.vincBox}>
                  <div style={s.vincTit}>
                    {lead.vinculo_direito.eh_beneficio
                      ? '📄 Benefício que garante o direito'
                      : '🏢 Empresa que garante o direito'}
                  </div>
                  <div style={s.vincNome}>{lead.vinculo_direito.empresa}</div>
                  <div style={s.vincMeta}>{lead.vinculo_direito.tipo}</div>
                  <div style={s.vincMeta}>{textoVinculo(lead.vinculo_direito)}</div>
                  <div style={s.vincRegra}>
                    ✅ {lead.vinculo_direito.regra}
                    {lead.vinculo_direito.total_vinculos > 1
                      ? ` · a cliente tem ${lead.vinculo_direito.total_vinculos} vínculos no CNIS, este é o que vale`
                      : ''}
                  </div>
                </div>
              )}
              <div>
                📱 {lead.tel || '—'}
                {/* aqui os TRES estados aparecem: na ficha ha espaco, e "ainda nao
                    verificado" e informacao util — nao significa que nao tenha. */}
                {lead.whats_tem === 'true'
                  ? <span style={s.fichaWhats('#059669', 'rgba(5,150,105,.12)')} title="o número tem WhatsApp">✅ tem WhatsApp</span>
                  : lead.whats_tem === 'false'
                    ? <span style={s.fichaWhats('#dc2626', 'rgba(220,38,38,.10)')} title="o número NÃO tem WhatsApp — ligar, não mandar mensagem">📵 sem WhatsApp</span>
                    : <span style={s.fichaWhats('#5b6b84', 'rgba(15,23,42,.05)')} title="ainda não foi verificado — não significa que não tenha">⏳ não verificado</span>}
              </div>
              <div>🪪 CPF: {lead.cpf || '—'}</div>
              <div>💼 Trabalhava no nascimento: {lead.trabalhava_no_nascimento || '—'}</div>
              <div>📋 Já trabalhou CLT: {lead.ja_trabalhou_clt || '—'}</div>
              <div>🪪 RG frente: {lead.doc_rg_frente ? '✅' : '—'}</div>
              <div>🪪 RG verso: {lead.doc_rg_verso ? '✅' : '—'}</div>
              <div>📜 Certidão: {lead.certidao ? '✅' : '—'}</div>
              <div>📌 Etapa: {lead.estado}{lead.sub_estado ? ` / ${lead.sub_estado}` : ''}</div>
              {lead.cnis_aprovado === 'true' && <div>✅ CNIS aprovado</div>}
              {lead.cnis_aprovado === 'false' && <div>⛔ CNIS reprovado: {lead.cnis_reprovado_motivo || ''}</div>}
            </div>

            {/* FICHA CNIS (15/10, Bruno) — a vendedora precisa do mesmo resumo do direito
                que a Fila de Entregas ja tinha. MESMA rota /ficha/<cpf> (App.js), MESMA
                rpc ficha_cnis (security definer, authenticated executa). Nada novo no
                banco: so o link, que nao existia nesta tela.
                So aparece com CPF de 11 digitos — sem isso a ficha abre reclamando do
                endereco, e botao que abre tela de erro treina a vendedora a nao clicar. */}
            {String(lead.cpf || '').replace(/\D/g, '').length === 11 && (
              <div style={s.fichaCnisBox}>
                <div style={s.fichaCnisLabel}>📄 Ficha CNIS — por que ela tem direito</div>
                <div style={s.fichaCnisTxt}>
                  Os vínculos do CNIS, qual vínculo gera o direito, a distância do parto,
                  a carência e o fundamento legal. Abre em aba nova e dá pra mandar o link
                  pra cliente no WhatsApp.
                </div>
                <a
                  href={'/ficha/' + String(lead.cpf).replace(/\D/g, '')}
                  target="_blank"
                  rel="noreferrer"
                  style={s.fichaCnisBtn}
                >
                  📄 Ver ficha CNIS
                </a>
              </div>
            )}

            {/* Print do GERID da advogada. So aparece quando ela anexou — a aprovacao
                exige o print, entao pra pre-aprovado real ele existe. E a prova do
                direito da cliente: a vendedora vende olhando pra ele. */}
            {geridCarregando && (
              <div style={s.geridBox}><div style={s.geridLabel}>🗂️ Print do GERID</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>carregando...</div></div>
            )}
            {!geridCarregando && gerid && gerid.print_url && (
              <div style={s.geridBox}>
                <div style={s.geridLabel}>🗂️ Print do GERID — anexado pela advogada</div>
                {gerid.advogada_motivo && <div style={s.geridMotivo}>⚖️ {gerid.advogada_motivo}</div>}
                <a href={gerid.print_url} target="_blank" rel="noreferrer" title="Abrir o print em tamanho real">
                  <img src={gerid.print_url} alt="Print do GERID" style={s.geridImg} />
                </a>
                <div style={s.geridPe}>
                  Clique na imagem pra abrir em tamanho real
                  {gerid.print_em ? ' · anexado em ' + gerid.print_em : ''}
                </div>
              </div>
            )}

            <div style={s.anexoBox}>
              <div style={s.anexoLabel}>
                📎 Anexos {carregandoAnexos ? '(carregando...)' : `(${anexos.length})`}
              </div>
              {!carregandoAnexos && anexos.length === 0 && (
                <div style={{ fontSize: 12, color: '#64748b' }}>Nenhum anexo nesta conversa.</div>
              )}
              <div style={s.anexoRow}>
                {anexos.map((a, i) => (
                  a.tipo === 'image' ? (
                    <a key={i} href={a.url} target="_blank" rel="noreferrer" title="Abrir imagem">
                      <img src={a.thumb || a.url} alt="anexo" style={s.anexoImg} />
                    </a>
                  ) : (
                    <a key={i} href={a.url} target="_blank" rel="noreferrer" style={s.anexoFile}>
                      📄 {a.ext ? a.ext.toUpperCase() : 'Arquivo'} · abrir/baixar
                    </a>
                  )
                ))}
              </div>
            </div>

            {/* 01/10 — UM bloco pro que acontece DURANTE o atendimento: pegar o
                card e carimbar o WhatsApp. Antes "estou nesse" era um botao solto
                embaixo e o carimbo era outra caixa, sem relacao visual.
                21/09 — o carimbo tem TRES estados: nada, 'iniciado' e 'sem_whats'.
                Clicar no que ja esta aceso DESMARCA; clicar no outro TROCA. */}
            <div style={s.bloco}>
              <div style={s.blocoLabel}>Enquanto você atende</div>
              <div style={s.blocoLinha}>
                {lead.bf_em_tratamento ? (
                  <button style={s.carimboBtn(true, '#065f46', 'rgba(52,211,153,.16)', 'rgba(5,150,105,.3)')}
                    onClick={() => soltarTratamento(lead)}
                    title="você está com essa cliente — clicar solta o card">
                    🙋 Estou nesse (soltar)
                  </button>
                ) : (
                  <button style={s.carimboBtn(false, '#065f46', 'rgba(52,211,153,.16)', 'rgba(5,150,105,.3)')}
                    onClick={() => marcarTratando(lead)}
                    title="marca que você pegou essa cliente, pra ninguém atender junto">
                    🙋 Estou nesse
                  </button>
                )}
                <button
                  style={s.carimboBtn(lead.whats_marcado === 'iniciado', '#065f46', 'rgba(52,211,153,.16)', 'rgba(5,150,105,.3)')}
                  disabled={carimbando}
                  onClick={() => marcarWhats(lead, 'iniciado')}
                  title="marca que você já chamou essa cliente no WhatsApp — clicar de novo desmarca">
                  {lead.whats_marcado === 'iniciado' ? '✅ Chamei no WhatsApp' : '📲 Chamei no WhatsApp'}
                </button>
                <button
                  style={s.carimboBtn(lead.whats_marcado === 'sem_whats', '#991b1b', 'rgba(220,38,38,.14)', 'rgba(220,38,38,.34)')}
                  disabled={carimbando}
                  onClick={() => marcarWhats(lead, 'sem_whats')}
                  title="marca que esse número NÃO tem WhatsApp — clicar de novo desmarca">
                  {lead.whats_marcado === 'sem_whats' ? '✅ Não tem WhatsApp' : '📵 Não tem WhatsApp'}
                </button>
                {lead.whats_marcado && fmtCarimbo(lead.whats_iniciado_em) && (
                  <span style={{ fontSize: 11.5, color: '#5b6b84' }}>marcado em {fmtCarimbo(lead.whats_iniciado_em)}</span>
                )}
              </div>
              {/* o robo e a pessoa discordaram: vale mostrar, e o caso que interessa */}
              {lead.whats_marcado === 'sem_whats' && lead.whats_tem === 'true' && (
                <div style={s.carimboPe}>
                  ⚠️ O validador automático tinha dito que <b>tem</b> WhatsApp. Sua marcação vale mais — mas avisa o time, é um erro do robô pra investigar.
                </div>
              )}
              {lead.whats_marcado === 'iniciado' && lead.whats_tem === 'false' && (
                <div style={s.carimboPe}>
                  ⚠️ O validador automático tinha dito que <b>não tem</b> WhatsApp. Se você conseguiu falar por lá, avisa o time — é um erro do robô pra investigar.
                </div>
              )}
              {!lead.whats_marcado && (
                <div style={s.blocoPe}>
                  Serve pra ninguém chamar a mesma cliente duas vezes — e pra conferir se o validador automático está acertando.
                </div>
              )}
              {lead.bf_em_tratamento && lead.cliente_respondeu && (
                <div style={{ ...s.blocoPe, color: '#b45309', fontWeight: 700 }}>💬 a cliente respondeu</div>
              )}
            </div>

            {/* 01/10 — o DESFECHO num bloco so. O verde aparece UMA vez e e a acao
                que a gente quer que ela clique; o "nao quis" fica do lado, menor.
                Antes o verde competia com o laranja do soltar e o azul do passar. */}
            <div style={s.blocoFecho}>
              <div style={s.blocoLabel}>Como terminou</div>
              {lead.cnis_aprovado === 'true' && (
              <div>
                {vendaCarregando ? (
                  <div style={{ fontSize: 12, color: '#5b6b84' }}>conferindo o fechamento…</div>
                ) : venda?.fechada ? (
                  // Ja marcada: o botao de fechar SOME e da lugar ao aviso + desfazer.
                  // Antes o botao continuava ali e a RPC recusava com "ja esta marcada
                  // como fechada" — parecia bug em vez de estado.
                  <div style={s.vendaFeita}>
                    <div style={{ fontWeight: 700, color: '#047857' }}>
                      ✅ Venda fechada por {venda.por_nome}
                      {venda.em ? ` · ${new Date(venda.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
                    </div>
                    {venda.pode_desfazer ? (
                      <>
                        <button style={s.btnDesfazer} disabled={desfazendo} onClick={() => desfazerVenda(lead)}>
                          {desfazendo ? 'desfazendo…' : '↩︎ Marquei errado, desfazer'}
                        </button>
                        <div style={{ fontSize: 11, color: '#5b6b84', marginTop: 5 }}>
                          A cliente volta a ficar em aberto no fechamento do dia. Não marca como negada.
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 11.5, color: '#5b6b84', marginTop: 6 }}>
                        Não dá pra desfazer aqui: {venda.motivo || 'sem permissão'}.
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={s.blocoLinha}>
                    <button style={s.btnFechou} onClick={() => fecharVenda(lead.id)}>✅ Fechei a venda</button>
                    <button style={s.btnNegar} onClick={() => setMostrarMotivosNegar(v => !v)}>❌ Não quis</button>
                  </div>
                )}
              </div>
              )}

              {/* lead que ainda nao foi pre-aprovado nao tem "fechei a venda",
                  mas pode ser negado do mesmo jeito */}
              {lead.cnis_aprovado !== 'true' && (
                <div style={s.blocoLinha}>
                  <button style={s.btnNegar} onClick={() => setMostrarMotivosNegar(v => !v)}>❌ Não quis</button>
                </div>
              )}

              {!venda?.fechada && lead.cnis_aprovado === 'true' && !vendaCarregando && (
                <div style={s.blocoPe}>Vale também quando fechar pelo WhatsApp — é assim que entra no seu fechamento do dia.</div>
              )}

              {mostrarMotivosNegar && (
                <div style={s.painelMotivos}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#5b6b84', marginBottom: 8 }}>Por que está negando? (não mexe no CNIS)</div>
                  <div style={s.motivosGrid}>
                    {MOTIVOS_NEGAR.map(([codigo, texto]) => (
                      <button key={codigo} style={s.btnMotivo} onClick={() => negarLead(lead.id, texto)}>{texto}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#5b6b84' }}>
                💬 Conversa <span style={{ color: '#059669', fontWeight: 500 }}>· atualiza sozinha</span>
              </span>
              <button
                style={{ fontSize: 11, padding: '4px 10px', background: 'rgba(96,165,250,.10)', color: '#2563eb', border: '0.5px solid rgba(15,23,42,0.09)', borderRadius: 8, cursor: 'pointer', fontWeight: 500 }}
                onClick={() => recarregarConversa(lead, true)}
                disabled={atualizandoConversa}
              >
                {atualizandoConversa ? 'Atualizando...' : '🔄 Atualizar conversa'}
              </button>
            </div>
            <div style={s.msgs}>
              {mensagens.length === 0 && <div style={{ fontSize: 12, color: '#64748b' }}>Sem mensagens.</div>}
              {mensagens.map((m, i) => (
                <div key={i} style={m.role === 'user' ? s.msgCliente : s.msgAna}>{m.content || '—'}</div>
              ))}
            </div>

            {lead.coluna === 'A_ANALISAR' && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <button style={s.btnAprovar} disabled={enviando} onClick={() => decidirCnis(true)}>✅ APROVAR CNIS</button>
                <button style={s.btnReprovar} disabled={enviando} onClick={() => decidirCnis(false)}>⛔ REPROVAR CNIS</button>
              </div>
            )}

            {lead.estado === 'COLETANDO_CADASTRO' && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#5b6b84', marginBottom: 4 }}>Mover etapa do cadastro na mão (não aciona a IA):</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={s.btnVoltar} disabled={enviando} onClick={() => avancarEtapa('voltar')}>← Voltar</button>
                  <button style={s.btnAvancar} disabled={enviando} onClick={() => avancarEtapa('proximo')}>Próxima etapa →</button>
                </div>
              </div>
            )}

            {linkChatwoot(lead) ? (
              <a href={linkChatwoot(lead)} target="_blank" rel="noreferrer"
                style={{ display: 'block', textAlign: 'center', textDecoration: 'none', width: '100%', padding: 12, background: '#34d399', color: '#232a37', borderRadius: 10, fontSize: 14, fontWeight: 700, marginBottom: 10, boxSizing: 'border-box' }}>
                💬 Abrir conversa no Chatwoot
              </a>
            ) : (
              <div style={{ fontSize: 12, color: '#dc2626', background: 'rgba(248,113,113,.10)', borderRadius: 8, padding: 10, marginBottom: 10 }}>Sem conversa no Chatwoot vinculada a este lead.</div>
            )}
          </div>
        </div>
      )}

      {/* 01/10 — modal de transferencia. O motivo e obrigatorio nos DOIS lados:
          o botao fica desabilitado sem ele, e o banco recusa se vier vazio. */}
      {transf && (
        <div style={s.overlay} onClick={() => !transferindo && setTransf(null)}>
          <div style={{ ...s.modal, maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div style={s.transfTit}>🔄 Passar para outra vendedora</div>
            <div style={s.transfSub}>
              {transf.nome || 'Cliente'}{transf.agente_nome ? ` · hoje com ${transf.agente_nome}` : ''}
            </div>

            <div style={s.transfLabel}>Para quem vai *</div>
            <select style={s.transfSelect} value={transfPara} onChange={e => setTransfPara(e.target.value)}>
              <option value="">escolha a vendedora...</option>
              {transfVends.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
            {transfVends.length === 0 && (
              <div style={s.transfVazio}>Nenhuma outra vendedora disponível no seu time.</div>
            )}

            <div style={s.transfLabel}>Por quê? *</div>
            <select style={s.transfSelect} value={transfCod} onChange={e => setTransfCod(e.target.value)}>
              <option value="">escolha o motivo...</option>
              {MOTIVOS_TRANSF.map(([cod, txt]) => <option key={cod} value={cod}>{txt}</option>)}
            </select>

            {/* so "Outro" abre o texto: nos demais o codigo ja explica, e campo
                livre que ninguem preenche direito so atrapalha a contagem */}
            {transfCod === 'outro' && (
              <>
                <div style={s.transfLabel}>Escreva o motivo *</div>
                <textarea style={s.textarea} value={transfMotivo} onChange={e => setTransfMotivo(e.target.value)}
                  placeholder="O que aconteceu?" />
              </>
            )}

            {transfCod === 'venda_fora' && (
              <div style={s.transfAviso}>
                💡 Marque <b>"entregue hoje"</b> abaixo: assim a cliente volta pro topo da fila
                e a vendedora consegue clicar em "Fechei a venda" pra entrar no fechamento do dia dela.
              </div>
            )}

            <label style={s.transfCheck}>
              <input type="checkbox" checked={transfHoje} onChange={e => setTransfHoje(e.target.checked)} />
              <span><b>Marcar como entregue hoje</b><br />
                <span style={s.transfCheckPe}>
                  O lead volta pro topo da fila de hoje, como se tivesse acabado de chegar.
                  Se deixar desmarcado, a data de entrega original é mantida.
                </span>
              </span>
            </label>

            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button style={s.btnVoltar} disabled={transferindo} onClick={() => setTransf(null)}>Cancelar</button>
              <button style={{ ...s.btnAvancar, flex: 2, opacity: transfOk ? 1 : 0.5 }}
                disabled={transferindo || !transfOk}
                onClick={confirmarTransferir}>
                {transferindo ? '⏳ passando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 19/10 (Bruno) — AVISO DE CLIENTE NOVA.
          Sai sozinho em 10s. Fica por ultimo no JSX, com position fixed, pra nao
          empurrar nada da tela. Clicar leva pra aba "Caiu hoje", que e onde a
          cliente nova esta — avisar sem levar pro lugar certo nao resolve nada. */}
      {temMesa && modoMesa && avisoNovos && avisoNovos.length > 0 && (
        <div style={s.aviso}>
          <div style={s.avisoTopo}>
            <span style={s.avisoTit}>
              🔔 {qtNovos === 1 ? '1 cliente nova pra você' : `${qtNovos} clientes novas pra você`}
            </span>
            <button style={s.avisoX} onClick={() => setAvisoNovos(null)} title="fechar">✕</button>
          </div>
          <div style={s.avisoCorpo}>
            {avisoNovos.map(l => (
              <div key={l.id} style={s.avisoLin}>
                <span style={s.avisoTag}>
                  {l.vinculo_direito && l.vinculo_direito.meses_antes_do_parto != null
                    ? `${l.vinculo_direito.meses_antes_do_parto}m do parto` : 'nova'}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {l.nome || 'Sem nome'}
                </span>
              </div>
            ))}
            {qtNovos > avisoNovos.length && (
              <div style={{ ...s.avisoLin, color: '#5b6b84', fontSize: 11.5 }}>
                e mais {qtNovos - avisoNovos.length}…
              </div>
            )}
            <button style={s.avisoBtn}
              onClick={() => {
                setAbaMesa('hoje'); setAvisoNovos(null); setQtNovos(0)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}>
              Ver agora →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
