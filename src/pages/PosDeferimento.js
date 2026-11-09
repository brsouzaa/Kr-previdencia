import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { cores, sombras } from '../lib/tema'
import {
  Chip, hexA, estiloBotao as btn, estiloCard as card, fmtCpf, fmtTel, fmtData, fmtDataHora,
  diaBR, hojeISO, diasDesde, iniciais, useIsMobile, useToast, copiarTexto, abrirArquivo, enviarArquivo, soDig,
  catPend, rotResolucao, RESOLUCOES_NEGATIVAS, perguntarIA, rotMotivoExig,
} from './ProtocoloFicha'

// ===== ACOMPANHAMENTO DE CLIENTES (29/10/2026, Bruno) — funil no estilo Pipedrive =====
// (no banco tudo se chama posdef_*: o setor nasceu como "pós-deferimento")
// 29/10 parte 2: o time tambem ve os contratos ainda no INSS (so leitura), RESOLVE as
// pendencias da advogada/Sthefany escolhendo uma alternativa, "pago" + "baixa" viraram
// um passo so (CLIENTE PAGOU) e a inadimplencia (data do pagamento + 4 dias sem pagar)
// e contada no mes da data agendada. A VENDEDORA so le o pos das vendas dela.
// Depois que a Dra. Jessica marca "Deferido" no Protocolo (com a carta do INSS), o
// caso entra SOZINHO aqui (trigger no banco). A Jessica nao ve esta tela.
// Deferido (avisar cliente) -> Carta de concessao (banco + data do pagamento)
//   -> PrevSempre (so se o banco for o Mercantil: abriu conta? aceitou honorario automatico?)
//   -> Aguardando pagamento -> Pago -> Baixa.
// Quem trabalha: o responsavel de cada vendedora (tabela posdef_responsaveis).
// Sthefany e admin veem tudo. Toda regra (o que e obrigatorio em cada passo) mora
// no banco, na posdef_acao; aqui a tela so pede os campos e mostra o erro.
// A AGENDA e o coracao: quem recebe hoje, amanha, depois de amanha e o que atrasou,
// pra o responsavel cobrar e alinhar com a cliente antes do dia.

export const ETAPAS_PD = [
  { key: 'deferido', label: 'Deferido · avisar cliente', curto: 'Deferido', cor: '#16a34a', icone: '✅' },
  { key: 'carta', label: 'Carta de concessão', curto: 'Carta', cor: '#0891b2', icone: '📜' },
  { key: 'extrato', label: 'Data do pagamento (INSS)', curto: 'Data INSS', cor: '#0d9488', icone: '📞' },   // 08/11 (Bruno): nao precisa mais do extrato — liga no INSS apos 7 dias   // 02/11: a data REAL do pagamento
  // 07/11/2026 (Bruno): ORIENTACAO PREVSEMPRE (so Mercantil). Etapa VIRTUAL: no banco o caso esta em 'prevsempre'
  // com prev_orientacao_exigida e sem prev_orientada_em. So vai para a Maithe depois do print conferido pela I.A.
  { key: 'orientacao_prev', label: 'Orientação PrevSempre', curto: 'Orientação', cor: '#b45309', icone: '📣' },
  { key: 'prevsempre', label: 'PrevSempre', curto: 'PrevSempre', cor: '#2563eb', icone: '🏦' },
  { key: 'aguardando_pagamento', label: 'Aguardando receber', curto: 'Aguardando', cor: '#7c3aed', icone: '⏳' },
  { key: 'atrasado', label: 'Pagamento atrasado', curto: 'Atrasado', cor: '#dc2626', icone: '⏰' },  // virtual: aguardando com a data vencida
  { key: 'pago', label: 'Aguardando receber', curto: 'Aguardando', cor: '#7c3aed', icone: '⏳' },  // etapa antiga (nao usada mais)
  { key: 'baixado', label: 'Cliente pagou', curto: 'Pagou', cor: '#15803d', icone: '🤝' },
  { key: 'cancelado', label: 'Cancelado', curto: 'Cancelado', cor: '#94a3b8', icone: '🚫' },
]
const etapaPD = (k) => ETAPAS_PD.find(e => e.key === k) || { key: k, label: k, curto: k, cor: '#64748b', icone: '•' }
const COLUNAS_PD = ['deferido', 'extrato', 'orientacao_prev', 'prevsempre', 'aguardando_pagamento', 'atrasado', 'baixado']   // 02/11: a coluna "Carta" virou "Extrato de pagamento"
const ATIVAS = ['deferido', 'carta', 'extrato', 'orientacao_prev', 'prevsempre', 'aguardando_pagamento', 'pago']
const ESPERANDO = ['aguardando_pagamento', 'orientacao_prev', 'prevsempre', 'pago']   // ainda nao pagou
const DIAS_INADIMPLENTE = 4
// 03/11 (Bruno): parado ha mais de 48h na etapa = VERMELHO (Deferido e PrevSempre).
// Extrato de pagamento: so da para pegar 7 dias apos o deferimento — o caso so SOBE para cobrar nesse dia
// e fica vermelho 48h depois de subir. A Mercantil passa pela PrevSempre antes e pega o extrato do mesmo jeito.
const HORAS_LIMITE = 48
const DIAS_EXTRATO = 7
const horasDesde = (ts) => (ts ? (Date.now() - new Date(ts).getTime()) / 3600000 : null)
const extratoLiberaEm = (c) => somaDias(c.data_deferimento || String(c.criado_em || '').slice(0, 10) || hojeISO(), DIAS_EXTRATO)
// 03/11 (Bruno): UM DE CADA VEZ. O extrato so sobe depois da PrevSempre (Mercantil) e nunca antes dos 7 dias.
// As 48h contam de quando ele SUBIU: o maior entre "7 dias apos o deferimento" e "entrou na etapa do extrato".
const inicioCobrancaExtrato = (c) => {
  const lib = new Date(extratoLiberaEm(c) + 'T00:00:00-03:00').getTime()
  const ent = (c.etapa === 'extrato' || c.etapa === 'carta') && c.etapa_desde ? new Date(c.etapa_desde).getTime() : 0
  return Math.max(lib, ent)
}
const horasExtratoLiberado = (c) => (Date.now() - inicioCobrancaExtrato(c)) / 3600000   // negativo = ainda nao subiu
const extratoLiberado = (c) => (horasExtratoLiberado(c) ?? 0) >= 0
const vermelho48 = (c) => (c.etapa === 'deferido' || c.etapa === 'orientacao_prev' || c.etapa === 'prevsempre') ? (horasDesde(c.etapa_desde) ?? 0) > HORAS_LIMITE
  : (c.etapa === 'extrato' || c.etapa === 'carta') ? (horasExtratoLiberado(c) ?? 0) > HORAS_LIMITE : false
const txtHoras = (h) => (h == null ? '' : h < 24 ? `${Math.max(0, Math.floor(h))}h` : `${Math.floor(h / 24)}d ${Math.floor(h % 24)}h`)
// contador do extrato (aparece enquanto o extrato nao foi lancado)
const txtExtrato = (c) => {
  if (c.extrato_url || c.extrato_em) return ''
  const h = horasExtratoLiberado(c)
  if (h == null) return ''
  if (h < 0) return ''   // 03/11 (Bruno): antes dos 7 dias nao mostra nada
  return `ligar no INSS (data e valor) · há ${txtHoras(h)}`
}
// dias depois da data do pagamento (negativo = ainda vai cair)
const diasApos = (iso) => (iso ? Math.round((new Date(hojeISO() + 'T12:00:00') - new Date(iso + 'T12:00:00')) / 86400000) : null)
const atrasado = (c) => ESPERANDO.includes(c.etapa) && !!c.data_pagamento && diasApos(c.data_pagamento) > 0
const inadimplente = (c) => ESPERANDO.includes(c.etapa) && !!c.data_pagamento && diasApos(c.data_pagamento) > DIAS_INADIMPLENTE
// em que coluna do funil o card mora (o "atrasado" e automatico pela data)
const colunaDe = (c) => c.etapa === 'carta' ? 'extrato' : c.etapa === 'baixado' ? 'baixado' : c.etapa === 'pago' ? (atrasado(c) ? 'atrasado' : 'aguardando_pagamento')
  : c.etapa === 'aguardando_pagamento' && atrasado(c) ? 'atrasado' : c.etapa

const BANCOS = ['Banco Mercantil do Brasil', 'Caixa Econômica Federal', 'Banco do Brasil', 'Bradesco', 'Itaú', 'Santander', 'Nubank', 'Banrisul', 'Outro']   // 04/11 (Bruno): + Banrisul
const FORMAS_HONORARIO = ['Desconto automático PrevSempre', 'PIX da cliente', 'Transferência', 'Boleto', 'Dinheiro', 'Outro']
const AZUL_PREV = '#1d4ed8'

// 02/11 (Bruno) — abas Deferidos / Indeferidos e o Mural: o periodo (Hoje/Ontem/Semana/Mes) e pelo dia em que o
// caso SUBIU nessa situacao aqui no CRM (etapa_desde no Protocolo). Mesmo criterio do filtro "Subiu" do Protocolo.
const dataAnotacao = (c) => c.etapa_desde || c.ultima_movimentacao_em || null
const hojeExtensoBR = () => { const t = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo' }); return t.charAt(0).toUpperCase() + t.slice(1) }
const somaDias = (iso, n) => { const d = new Date((iso || hojeISO()) + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const diaSemana = (iso) => { try { return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '') } catch (_) { return '' } }
const reais = (v) => (v == null || v === '' ? null : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const primeiroNome = (n) => { const p = String(n || '').trim().split(/\s+/)[0] || ''; return p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : '' }
const bancoCurto = (b) => { const s = String(b || ''); if (/mercantil/i.test(s)) return 'Mercantil'; if (/caixa/i.test(s)) return 'Caixa'; if (/banco do brasil/i.test(s)) return 'Banco do Brasil'; return s.replace(/^Banco\s+/i, '').slice(0, 18) }
const telWa = (t) => { let d = soDig(t); if (d.startsWith('55') && d.length > 11) d = d.slice(2); return d.length >= 10 ? '55' + d : null }

// 07/11 (Bruno): Mercantil que ainda nao passou pela Orientacao PrevSempre aparece na etapa virtual
const etapaVirtualPD = (c) => (c.etapa === 'prevsempre' && c.prev_orientacao_exigida && !c.prev_orientada_em) ? { ...c, etapa: 'orientacao_prev' } : c
const lerBase64PD = (arq) => new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok(String(r.result).replace(/^data:[^,]+,/, '')); r.onerror = () => erro(r.error); r.readAsDataURL(arq) })
// 09/11/2026 (Bruno): UM SO jeito de contar pendencia, igual ao Protocolo: so as abertas de clientes ativos no setor,
// em 4 grupos. "Sinalizada" = o acompanhamento conseguiu e espera a Jessica/Sthefany darem a baixa.
const ETAPAS_PEND_ATIVAS = ['aguardando_protocolo', 'pendencia_docs', 'protocolado', 'exigencia', 'recurso']
const GRUPOS_PEND = [
  { k: 'documento', rot: '📄 Documento', cor: '#b45309' },
  { k: 'requerimento_aberto', rot: '📂 Pedido em aberto no INSS', cor: '#7c3aed' },
  { k: 'exigencia_inss', rot: '⚠️ Exigência do INSS', cor: '#ea580c' },
  { k: 'complementacao_guia', rot: '🧾 Complementação de guia', cor: '#0d9488' },
]
const grupoPend = (p) => p.categoria === 'complementacao_guia' ? 'complementacao_guia' : p.categoria === 'requerimento_aberto' ? 'requerimento_aberto'
  : (p.tipo === 'exigencia_inss' || p.categoria === 'exigencia_inss') ? 'exigencia_inss' : 'documento'
const pendAbertaAtiva = (p) => p.status !== 'resolvida' && ETAPAS_PEND_ATIVAS.includes(p.etapa)
const ehAutomatico = (c) => c.prevsempre && c.prevsempre_honorario_auto === true

// ---------------------------------------------------------------- guia de mensagens (29/10, Bruno)
// Cada etapa tem o seu roteiro de WhatsApp. Passo 1 = CHAMAR a cliente (o texto varia de
// cliente para cliente, pra nao parecer automatico) e ESPERAR ela responder; depois vem o
// texto da etapa. A REVISAO DO INSS entra so como expectativa: nunca falar valor nem prometer.
// Se a cliente perguntar: "estou confirmando com a advogada".
// O "como pagar o honorario" vem do banco (app_config posdef_como_pagar_honorario) para o
// Bruno ajustar sem mexer no codigo.
const COMO_PAGAR_PADRAO = 'eu te passo o valor certinho e a forma de pagamento para você fazer o nosso pagamento (os honorários)'
const DIAS_RAPIDO = 30   // deferiu em ate 30 dias do protocolo = mensagem "saiu rapidinho"
const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'bom dia' : h < 18 ? 'boa tarde' : 'boa noite' }
const maiusc = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)
const diaLongo = (iso) => { try { return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long' }) } catch (_) { return '' } }
const quandoPag = (c) => { const d = c.data_pagamento ? -diasApos(c.data_pagamento) : null; return d === 0 ? 'hoje' : d === 1 ? 'amanhã' : c.data_pagamento ? `dia ${fmtData(c.data_pagamento)}` : 'no dia do pagamento' }
const hashTxt = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h }

// tudo o que os textos usam, ja pronto
function ctxMsg(c, eu, comoPagar) {
  const dias = c.data_protocolo && c.data_deferimento ? Math.round((new Date(c.data_deferimento + 'T12:00:00') - new Date(String(c.data_protocolo).slice(0, 10) + 'T12:00:00')) / 86400000) : null
  return {
    n: primeiroNome(c.nome) || 'tudo bem',
    s: saudacao(),
    aqui: eu ? `Aqui é ${eu}, da KR Previdência` : 'Aqui é da KR Previdência',
    banco: c.prevsempre ? 'Banco Mercantil' : (c.banco || 'banco'),
    data: c.data_pagamento ? `${fmtData(c.data_pagamento)} (${diaLongo(c.data_pagamento)})` : 'a data da carta',
    quando: quandoPag(c),
    comoPagar: comoPagar || COMO_PAGAR_PADRAO,
    dias,
    rapido: dias != null && dias >= 0 && dias <= DIAS_RAPIDO,
  }
}

const CHAMAR_CARTA = [
  x => `${x.n}, ${x.s}! Você tá por aí? Chegou a sua *carta de concessão* e queria alinhar uns detalhes com você 😊`,
  x => `Oi, ${x.n}! ${x.aqui}. Saiu a sua carta de concessão!! Me chama quando puder que te explico como vai ser o pagamento 🙏`,
  x => `Dona ${x.n}, novidade boa do seu processo de novo 👀 Tem um minutinho pra eu te contar como vai ser o seu pagamento?`,
]
const NOVIDADE = x => `Ahh, ${x.n}, e uma coisa de cada vez… mas não aguentei: tenho *mais uma novidade boa* pra você 🤭\n\nAinda estou confirmando uns detalhes com a nossa advogada, então por enquanto não posso falar muito… Primeiro a gente resolve o seu maternidade e logo te conto tudo! 💛`
const DICA_REVISAO = 'Se ela perguntar o que é: "estou confirmando com a advogada e te conto assim que o maternidade estiver resolvido". Não fale valor e não prometa nada.'

export const GUIAS = {
  deferido: {
    titulo: 'Avisar do deferimento', icone: '🎉', cor: '#16a34a',
    passos: [
      { k: 'chamar', rot: 'Chamar a cliente', espera: true, var: [
        x => `Oi, ${x.n}! Tudo bem? ${x.aqui}. Tenho novidades do seu processo, pode falar agora? 😊`,
        x => `Dona ${x.n}, ${x.s}! Novidades do seu processo do salário-maternidade por aqui 👀 Você tá por aí?`,
        x => `${x.n}, ${x.s}! Chegou uma resposta do INSS sobre o seu processo. Me dá um retorno quando puder ver? 🙏`,
        x => `Oi, ${x.n}! Tudo certo com você e o bebê? Tenho uma atualização importante do seu processo, me chama aqui quando puder 💛`,
      ] },
      { k: 'noticia', rot: 'Contar a notícia (com empolgação!)', dica: 'Saiu em até 30 dias do protocolo: o texto destaca a rapidez. Demorou mais: destaca o trabalho da equipe.', var: [
        x => `${x.n}, o seu salário-maternidade foi *APROVADO* pelo INSS!!! 🎉🎉🎉\n\n${x.rapido
          ? `E olha que notícia boa: saiu *rapidinho*, em só *${x.dias} dia${x.dias === 1 ? '' : 's'}* desde que demos entrada! A gente preparou o seu processo com muito cuidado pra ele andar sem travar, e o resultado veio rápido 🙌`
          : 'Foi um processo que exigiu bastante da nossa equipe: acompanhamos cada passo lá no INSS, de perto, até sair essa aprovação. E valeu cada minuto! 🙌'}\n\nA equipe toda vibrou aqui com o seu resultado, de verdade 💛\n\nJá saiu também a sua *carta de concessão*, que mostra o banco do pagamento. Já já te chamo aqui e te explico como vai funcionar, tá bom?`,
      ] },
    ],
  },
  // 07/11/2026 (Bruno): ORIENTACAO PREVSEMPRE — avisar ANTES do link do Mercantil (abrir a conta + autorizar o debito automatico)
  orientacao_prev: {
    titulo: 'Orientação PrevSempre · link e débito automático', icone: '📣', cor: '#b45309',
    passos: [
      { k: 'orientar', rot: 'Orientar sobre o link do Mercantil e o débito automático', espera: true, dica: 'Espere ela responder COMBINADO e tire o print dessa conversa no WhatsApp.', var: [
        x => `${x.n}, agora presta muita atenção, porque esse é o passo mais importante pra você receber 🙏\n\nO seu salário-maternidade vai ser pago pelo *Banco Mercantil*, através da *PrevSempre*.\n\n📲 *Nos próximos dias você vai receber um LINK do Banco Mercantil* pelo WhatsApp oficial deles. *Não é golpe!* É por esse link que você abre a conta onde o seu benefício vai cair — tudo pelo celular, sem precisar ir em agência.\n\n💳 *Na abertura da conta vai aparecer a autorização do DÉBITO AUTOMÁTICO dos honorários.* É o pagamento do nosso trabalho, que você já combinou e assinou no contrato. Ele é descontado automaticamente dessa conta quando o benefício cair, então você não precisa fazer pagamento nenhum depois.\n\n✅ Quando aparecer essa pergunta, aperte *AUTORIZAR*.\n❌ *Se apertar "não autorizar", o processo TRAVA* e a gente vai ter que refazer tudo, o que pode atrasar o seu recebimento.\n\nFica tranquila: quando o link chegar, a gente te ajuda em cada tela.\n\nMe responde *COMBINADO* pra eu saber que você entendeu? 😊`,
      ] },
    ],
  },
  carta_prev: {
    titulo: 'Carta chegou · Mercantil (PrevSempre)', icone: '📜', cor: AZUL_PREV,
    passos: [
      { k: 'chamar', rot: 'Chamar a cliente', espera: true, var: CHAMAR_CARTA },
      { k: 'carta', rot: 'Explicar a PrevSempre e combinar', espera: true, dica: 'Espere ela responder "combinado" antes da novidade.', var: [
        x => `Então, ${x.n}: o seu salário-maternidade vai ser pago pelo *Banco Mercantil* 💰\n\n⚠️ A data de pagamento que aparece na carta é só uma *previsão do INSS* e costuma mudar. Em poucos dias eu confirmo com o INSS a data certinha do pagamento e te mando aqui, tá bom?\n\nE o melhor: você vai receber pela *PrevSempre*, a conta do Mercantil. Você abre a conta pelo celular, *não precisa ir em agência nenhuma*, e o dinheiro cai direto na sua conta.\n\nFunciona assim: o link para abrir a conta chega no seu WhatsApp, pelo *número oficial do Mercantil/PrevSempre*. Na abertura também aparece o *aceite dos nossos honorários*, que são descontados automaticamente — assim você não precisa se preocupar em fazer pagamento nenhum depois.\n\nFica tranquila: *no dia eu te aviso e te ligo* pra te ajudar em cada etapa, do começo ao fim. Combinado? 😊`,
      ] },
      { k: 'novidade', rot: 'A novidade (depois do "combinado")', dica: DICA_REVISAO, var: [NOVIDADE] },
    ],
  },
  carta_outro: {
    titulo: 'Carta chegou · outro banco', icone: '📜', cor: '#0891b2',
    passos: [
      { k: 'chamar', rot: 'Chamar a cliente', espera: true, var: CHAMAR_CARTA },
      { k: 'carta', rot: 'Explicar o pagamento e combinar', espera: true, dica: 'Espere ela responder "combinado" antes da novidade.', var: [
        x => `Então, ${x.n}: o seu salário-maternidade vai ser pago no *${x.banco}* 💰\n\n⚠️ A data de pagamento que aparece na carta é só uma *previsão do INSS* e costuma mudar. Em poucos dias eu confirmo com o INSS a data certinha do pagamento e te mando aqui.\n\nNa véspera eu te chamo aqui pra te explicar direitinho como vai funcionar o pagamento, e no dia *eu te aviso e te ligo* pra te acompanhar em cada etapa, pra você ficar tranquila. Combinado? 😊`,
      ] },
      { k: 'novidade', rot: 'A novidade (depois do "combinado")', dica: DICA_REVISAO, var: [NOVIDADE] },
    ],
  },
  // 02/11 (Bruno): EXTRATO DE PAGAMENTO chegou = a data REAL. Manda a data certa para a cliente.
  extrato: {
    titulo: 'Data do pagamento confirmada no INSS', icone: '📞', cor: '#0d9488',
    passos: [
      { k: 'data', rot: 'Mandar a data certa do pagamento', var: [
        x => `${x.n}, ${x.s}! Confirmei com o INSS 🙌\n\nAgora é oficial: o seu salário-maternidade cai no dia *${x.data}*, no *${x.banco}* 💰\n\nPode ficar tranquila que perto do dia eu te chamo aqui de novo pra te acompanhar, combinado?`,
        x => `Oi, ${x.n}! ${x.aqui}. Como te falei, confirmei com o INSS a data certinha: o seu maternidade cai dia *${x.data}* no *${x.banco}* 🎉\n\nPerto do dia eu te aviso e te ajudo em tudo, tá bom?`,
      ] },
    ],
  },
  abrir_conta: {
    titulo: 'PrevSempre · abrir a conta e aceitar o honorário', icone: '🏦', cor: AZUL_PREV,
    passos: [
      { k: 'chamar', rot: 'Chamar a cliente', espera: true, var: [
        x => `${x.n}, ${x.s}! Chegou a hora 🎉 Você tá podendo falar agora? Vou te ajudar a abrir a sua conta pra receber`,
        x => `Oi, ${x.n}! ${x.aqui}. Como combinamos, vou te ajudar a abrir a sua conta PrevSempre 😊 Me avisa quando estiver com o celular na mão?`,
        x => `Dona ${x.n}, tudo bem? O link do Mercantil já deve ter chegado no seu WhatsApp 👀 Me chama aqui que a gente faz junto, passo a passo`,
      ] },
      { k: 'guiar', rot: 'Guiar a abertura e o aceite', espera: true, dica: 'Se ela travar em alguma tela, ligue na hora. Depois confirme aqui em "PrevSempre" se abriu a conta e aceitou.', var: [
        x => `Perfeito, ${x.n}! Vamos lá, é rapidinho:\n\n1️⃣ Procure no seu WhatsApp a mensagem do *número oficial do Mercantil/PrevSempre* com o link\n2️⃣ Abra o link e siga os passos para abrir a sua conta\n3️⃣ Quando aparecer o *aceite dos honorários*, é só aceitar — assim os nossos honorários são descontados automaticamente e você não precisa fazer pagamento nenhum depois 🙌\n\nFicou com dúvida em alguma tela? Me manda o print aqui ou me fala que eu te ligo agora mesmo.\n\nE lembra: recebendo pelo Mercantil você *não precisa ir à agência*, o dinheiro cai direto na sua conta no dia ${x.data} 💰`,
      ] },
      { k: 'revisao', rot: 'Fechar com a revisão', dica: DICA_REVISAO, var: [
        x => `Prontinho, ${x.n}! 🙏🏼 Agora é só esperar o dia ${x.data}.\n\nE lembra da novidade que eu te falei? Ainda estou confirmando com a advogada, mas se tudo der certo, além do maternidade você ainda pode receber um *valor a mais com uma revisão do INSS* que estamos analisando pra você 🤩\n\nUma coisa de cada vez: primeiro o maternidade, e logo te conto tudo! 💛`,
      ] },
    ],
  },
  vespera: {
    titulo: 'Véspera do pagamento', icone: '💰', cor: '#7c3aed',
    passos: [
      { k: 'chamar', rot: 'Chamar a cliente', espera: true, var: [
        x => `${x.n}, ${x.s}! ${maiusc(x.quando)} é o grande dia 🎉 Tem um minutinho pra eu te explicar como vai funcionar?`,
        x => `Oi, ${x.n}! ${x.aqui}. O seu pagamento está previsto pra ${x.quando} 💰 Pode falar agora?`,
        x => `Dona ${x.n}, tudo certo por aí? ${maiusc(x.quando)} cai o seu maternidade! Queria alinhar uns detalhes com você, me chama quando puder 🙏`,
      ] },
      { k: 'como', rot: 'Explicar como funciona e como paga a KR', espera: true, var: [
        (x, c) => ehAutomatico(c)
          ? `Então, ${x.n}: o seu salário-maternidade está previsto para *${x.quando}, ${x.data}*, na sua conta *PrevSempre do Mercantil* 💰\n\nComo você já fez o aceite, os nossos honorários são *descontados automaticamente* — você não precisa fazer pagamento nenhum 🙌 O restante fica na sua conta.\n\nNo dia eu te acompanho: quando cair, me avisa aqui que eu confiro tudo com você, combinado?`
          : `Então, ${x.n}, vamos lá: o seu salário-maternidade está previsto para *${x.quando}, ${x.data}*, no *${x.banco}* 💰\n\nComo funciona:\n• Quando o dinheiro cair, me manda uma mensagem aqui avisando 🙏\n• Aí ${x.comoPagar}.\n\nFicou com dúvida no app do banco ou no saque? Me chama que eu te ajudo — no dia eu te acompanho de perto, combinado?`,
      ] },
      { k: 'revisao', rot: 'A revisão (com naturalidade)', dica: DICA_REVISAO, var: [
        x => `E ${x.n}, assim que a gente fechar o seu maternidade, já vamos partir pra próxima: a *revisão do INSS* que estamos analisando pra você 🤩 A equipe tá bem animada com ela! Mas uma coisa de cada vez 😉`,
      ] },
    ],
  },
  atrasado: {
    titulo: 'Pagamento atrasado', icone: '⏰', cor: '#dc2626',
    passos: [
      { k: 'chamar', rot: 'Chamar a cliente', espera: true, var: [
        x => `${x.n}, ${x.s}! Tudo bem? Conseguiu ver se o seu maternidade caiu? 😊`,
        x => `Oi, ${x.n}! ${x.aqui}. Passando pra saber se deu tudo certo com o seu pagamento 🙏`,
        x => `Dona ${x.n}, tudo certo por aí? Me conta: o dinheiro do maternidade já caiu na sua conta?`,
      ] },
      { k: 'caiu', rot: 'Se já caiu: cobrar com leveza', var: [
        x => `Que bom, ${x.n}! 🎉 Agora só falta a nossa parte pra gente fechar o seu processo com chave de ouro: ${x.comoPagar}.\n\nE assim que fechar o maternidade, a gente já parte pra *revisão do INSS* que estamos analisando pra você 🤩`,
      ] },
      { k: 'nao_caiu', rot: 'Se ainda não caiu', depois: 'chamar', dica: 'Confira a data no INSS (135) e, se mudou, use "Mudar data do pagamento".', var: [
        x => `Entendi, ${x.n}! Fica tranquila que eu vou verificar aqui o que aconteceu e já te dou um retorno, tá bom? 🙏`,
      ] },
    ],
  },
  pagou: {
    titulo: 'Cliente pagou · agradecer e pedir indicação', icone: '🤝', cor: '#15803d',
    passos: [
      { k: 'obrigado', rot: 'Agradecer (emocionante)', var: [
        x => `Recebemos aqui, ${x.n}! A equipe toda da KR te agradece de coração 💛\n\nFoi uma alegria enorme cuidar do seu processo e ver o seu salário-maternidade aprovado e pago. Que esse dinheiro traga muita tranquilidade pra você e pro seu bebê nesse momento tão especial 🙏🏼\n\nTe peço uma coisinha: *salva o nosso contato* aqui — é por ele que vamos te avisar das próximas novidades.\n\nE sobre a revisão do INSS: seguimos analisando por aqui e, dando certo, *te avisamos na hora*! 🤩`,
      ] },
      { k: 'indicacao', rot: 'Pedir indicação', var: [
        x => `${x.n}, e um pedido especial 🙏🏼: muita mãe não sabe que tem direito ao salário-maternidade. Se você conhece alguém — amiga, prima, vizinha, colega — que teve bebê ou está grávida, *me passa o contato ou encaminha o nosso*? A gente cuida dela com o mesmo carinho que cuidou de você 💛`,
      ] },
    ],
  },
}

// quais roteiros valem para o caso, e qual e o da vez
function guiasDoCaso(c) {
  const e = c.etapa
  const ext = c.extrato_em ? ['extrato'] : []   // 02/11: so quem passou pela etapa do extrato
  if (e === 'deferido' || e === 'carta') return ['deferido']
  if (e === 'extrato') return [c.prevsempre ? 'carta_prev' : 'carta_outro']
  if (e === 'orientacao_prev') return ['orientacao_prev']
  if (e === 'prevsempre') return ['carta_prev', ...ext, 'abrir_conta']
  if (ESPERANDO.includes(e)) {
    const g = c.prevsempre ? ['carta_prev', ...ext, 'abrir_conta', 'vespera'] : ['carta_outro', ...ext, 'vespera']
    if (atrasado(c)) g.push('atrasado')
    return g
  }
  if (e === 'baixado') return ['pagou']
  return []
}
const enviadoEm = (c, g, k) => (c.msgs_enviadas || {})[`${g}:${k}`] || null
function guiaDaVez(c) {
  const gs = guiasDoCaso(c)
  if (gs.includes('atrasado')) return 'atrasado'
  if (gs.includes('vespera') && c.data_pagamento && diasApos(c.data_pagamento) >= -1) return 'vespera'
  return gs.find(g => !GUIAS[g].passos.every(p => enviadoEm(c, g, p.k)) && g !== 'vespera') || gs[gs.length - 1] || null
}

// 29/10 (Bruno) CHECKLIST OBRIGATORIO, sem excecao: so avanca de etapa com as mensagens
// marcadas como enviadas (o banco confere de novo em posdef_msgs_faltando).
const guiasDaAcao = (acao, c) => {
  const ext = c.extrato_em ? ['extrato'] : []
  return acao === 'avisar_cliente' || acao === 'carta' ? ['deferido']
    : acao === 'extrato' ? [c.prevsempre ? 'carta_prev' : 'carta_outro']
    : acao === 'orientar_prev' ? ['orientacao_prev']
    : acao === 'prevsempre' ? ['carta_prev', ...ext, 'abrir_conta']
    : acao === 'cliente_pagou' ? (c.prevsempre ? ['carta_prev', ...ext, 'abrir_conta', 'vespera'] : ['carta_outro', ...ext, 'vespera'])
    : []
}
const faltaChecklist = (acao, c, extra) => guiasDaAcao(acao, c).flatMap(g => GUIAS[g].passos.map(p => `${g}:${p.k}`))
  .filter(k => !(extra || {})[k] && !(c.msgs_enviadas || {})[k])
const progressoGuia = (c, g) => (g === 'atrasado'   // "caiu" e "nao caiu" sao caminhos alternativos
  ? { feitos: (enviadoEm(c, g, 'chamar') ? 1 : 0) + (enviadoEm(c, g, 'caiu') || enviadoEm(c, g, 'nao_caiu') ? 1 : 0), total: 2 }
  : { feitos: GUIAS[g].passos.filter(p => enviadoEm(c, g, p.k)).length, total: GUIAS[g].passos.length })

// conversa do WhatsApp EXPORTADA (pagamento e inadimplencia) — vai para um bucket proprio,
// para a IA analisar depois o que funciona na cobranca (tempo de resposta, contatos, falas)
const BUCKET_CONVERSAS = 'posdef-conversas'
const ehConversa = (f) => /\.(txt|zip)$/i.test(f?.name || '')
async function enviarConversa(arquivo, cpf) {
  const ext = /\.zip$/i.test(arquivo.name || '') ? 'zip' : 'txt'
  const caminho = `${soDig(cpf) || 'sem-cpf'}/${Date.now()}-conversa.${ext}`
  const { error } = await supabase.storage.from(BUCKET_CONVERSAS).upload(caminho, arquivo, { contentType: ext === 'zip' ? 'application/zip' : 'text/plain', upsert: false })
  if (error) throw new Error(error.message)
  return caminho
}
async function abrirConversa(caminho) {
  if (!caminho) return
  const w = window.open('', '_blank')
  const { data, error } = await supabase.storage.from(BUCKET_CONVERSAS).createSignedUrl(caminho, 900)
  if (error || !data?.signedUrl) { if (w) w.close(); window.alert('Não consegui abrir a conversa: ' + (error?.message || 'sem link')); return }
  if (w) w.location.href = data.signedUrl; else window.open(data.signedUrl, '_blank')
}
const COMO_EXPORTAR = 'No WhatsApp do celular: abra a conversa da cliente → toque no nome dela (iPhone) ou em ⋮ › Mais (Android) → Exportar conversa → Sem mídia. Mande o arquivo para o computador e anexe aqui (.txt ou .zip).'

// texto de "como pagar" (configuravel no banco), carregado uma vez
let textosPromessa = null
function useTextosPD() {
  const [t, setT] = useState(null)
  useEffect(() => {
    let vivo = true
    if (!textosPromessa) textosPromessa = supabase.rpc('posdef_textos').then(r => r.data || {}, () => ({}))
    textosPromessa.then(d => { if (vivo) setT(d || {}) })
    return () => { vivo = false }
  }, [])
  return t
}

// ---------------------------------------------------------------- acoes
const ACOES_PD = {
  // 02/11 (Bruno): no DEFERIDO o time avisa a cliente E anexa a CARTA DE CONCESSAO (com o banco).
  // A etapa seguinte e o EXTRATO DE PAGAMENTO (a data real). A data da carta e so previsao.
  avisar_cliente: {
    titulo: 'Cliente avisada + carta de concessão', icone: '📣', cor: '#16a34a',
    anexo: 'Carta de concessão', anexoObrig: true,
    nota: 'Mande as mensagens do checklist (uma de cada vez, esperando a cliente responder), anexe a CARTA DE CONCESSÃO e informe o banco. A data de pagamento da carta é só previsão. Banco Mercantil vai para a Orientação PrevSempre; os outros bancos vão para "Data do pagamento (INSS)", que só sobe 7 dias após o deferimento (aí é só ligar no INSS e pegar a data e o valor).',
    campos: [
      { k: 'banco', l: 'Banco que vai pagar (está na carta)', obrig: true, tipo: 'select', opcoes: BANCOS.map(b => ({ v: b, l: b })) },
      { k: 'banco_outro', l: 'Qual banco?', tipo: 'text', obrigSe: (v) => v.banco === 'Outro', so: (v) => v.banco === 'Outro' },
      { k: 'valor', l: 'Valor do benefício (opcional)', tipo: 'money' },
      { k: 'data', l: 'Data da carta', tipo: 'date', hoje: true },
      { k: 'texto', l: 'Como foi avisada / observação (opcional)', tipo: 'textarea' },
    ],
  },
  carta: {
    titulo: 'Carta de concessão', icone: '📜', cor: '#0891b2',
    anexo: 'Carta de concessão', anexoObrig: true,
    nota: 'A data de pagamento da carta é só PREVISÃO do INSS e não é usada aqui. Banco Mercantil vai direto para a PrevSempre; os outros vão para "Data do pagamento (INSS)": 7 dias após o deferimento você liga no INSS e lança a data e o valor. Avise a cliente que a data certa vai depois.',
    campos: [
      { k: 'banco', l: 'Banco que vai pagar', obrig: true, tipo: 'select', opcoes: BANCOS.map(b => ({ v: b, l: b })) },
      { k: 'banco_outro', l: 'Qual banco?', tipo: 'text', obrigSe: (v) => v.banco === 'Outro', so: (v) => v.banco === 'Outro' },
      { k: 'valor', l: 'Valor do benefício (opcional)', tipo: 'money' },
      { k: 'data', l: 'Data da carta', tipo: 'date', hoje: true },
      { k: 'texto', l: 'Observação (opcional)', tipo: 'textarea' },
    ],
  },
  // 08/11/2026 (Bruno): NAO precisa mais do extrato. 7 dias apos o deferimento liga no INSS (135) e pega a data e o valor.
  extrato: {
    titulo: 'Data e valor do pagamento (INSS)', icone: '📞', cor: '#0d9488',
    anexo: 'Print ou anotação (opcional)',
    nota: '7 dias após o deferimento, ligue no INSS (135) e pegue a data REAL do pagamento e o valor (a data da carta é só previsão). Não precisa mais do extrato. Depois de lançado, o caso vai para "Aguardando pagamento" (a Mercantil já passou pela PrevSempre antes).',
    campos: [
      { k: 'data_pagamento', l: 'Data do pagamento (informada pelo INSS)', obrig: true, tipo: 'date' },
      { k: 'valor', l: 'Valor do benefício (informado pelo INSS)', obrig: true, tipo: 'money' },
      { k: 'fonte', l: 'Onde confirmou', obrig: true, tipo: 'select', opcoes: ['Ligação no INSS (135)', 'Meu INSS', 'Extrato de pagamento'].map(o => ({ v: o, l: o })) },
      { k: 'texto', l: 'Observação (opcional)', tipo: 'textarea' },
    ],
  },
  // 07/11/2026 (Bruno): etapa obrigatoria antes da PrevSempre (Maithe). Print do WhatsApp conferido pela I.A.
  orientar_prev: {
    titulo: 'Cliente orientada · PrevSempre', icone: '📣', cor: '#b45309',
    anexo: 'Print da conversa no WhatsApp (com a orientação)', anexoObrig: true, soImagem: true,
    porque: true,
    nota: 'Mande a mensagem do checklist, espere a cliente responder COMBINADO e anexe o PRINT dessa conversa no WhatsApp. A I.A confere se é print de WhatsApp e se a conversa fala da PrevSempre/Mercantil e do débito automático. Só depois disso o caso vai para a PrevSempre (Maithe).',
    campos: [{ k: 'texto', l: 'Observação (opcional)', tipo: 'textarea' }],
  },
  prevsempre: {
    titulo: 'PrevSempre (Mercantil)', icone: '🏦', cor: AZUL_PREV,
    nota: 'Recebe no Mercantil: confirme a abertura da conta PrevSempre e se a cliente aceitou o desconto automático do honorário. Se a data do pagamento ainda não foi lançada, o caso segue para "Data do pagamento (INSS)" (7 dias após o deferimento, ligar no INSS).',
    campos: [
      { k: 'conta_aberta', l: 'Abriu a conta PrevSempre?', obrig: true, tipo: 'simnao' },
      { k: 'honorario_auto', l: 'Aceitou o honorário descontado automático?', obrig: true, tipo: 'simnao' },
      { k: 'texto', l: 'Observação (opcional)', tipo: 'textarea' },
    ],
  },
  // 04/11 (Bruno): trocar a carta de concessao depois do deferimento (antes so dava nas etapas Deferido/Carta)
  trocar_carta: {
    titulo: 'Trocar carta de concessão', icone: '🔁', cor: '#0891b2',
    anexo: 'Carta de concessão correta', anexoObrig: true,
    nota: 'Substitui a carta do caso (a antiga fica guardada no histórico). A aba PrevSempre passa a mostrar a carta nova na hora. A etapa não muda.',
    campos: [
      { k: 'texto', l: 'O que estava errado?', obrig: true, tipo: 'textarea', sugestoes: ['Carta de outra cliente', 'Carta ilegível ou cortada', 'Faltava página', 'Carta de outro benefício'] },
    ],
  },
  reagendar: {
    titulo: 'Mudar data do pagamento', icone: '🗓️', cor: '#7c3aed',
    campos: [
      { k: 'data_pagamento', l: 'Nova data do pagamento', obrig: true, tipo: 'date' },
      { k: 'texto', l: 'Por que mudou?', obrig: true, tipo: 'textarea' },
    ],
  },
  cliente_pagou: {
    titulo: 'Cliente pagou', icone: '🤝', cor: '#15803d',
    anexo: 'Comprovante do pagamento', anexoObrig: true, conversa: true,
    nota: 'Marque quando a cliente pagar o honorário. Obrigatório: comprovante do pagamento e a conversa do WhatsApp exportada. Passou 4 dias da data do pagamento sem pagar, ela conta como inadimplente no mês da data agendada.',
    campos: [
      { k: 'data', l: 'Data em que a cliente pagou', obrig: true, tipo: 'date', hoje: true },
      { k: 'forma', l: 'Como pagou o honorário', obrig: true, tipo: 'select', opcoes: FORMAS_HONORARIO.map(b => ({ v: b, l: b })) },
      { k: 'valor', l: 'Valor do honorário', tipo: 'money' },
      { k: 'texto', l: 'Observação (opcional)', tipo: 'textarea' },
    ],
  },
  conversa_inadimplente: {
    titulo: 'Anexar conversa (inadimplente)', icone: '📎', cor: '#dc2626', conversa: true,
    nota: 'Passou 4 dias da data do pagamento e a cliente não pagou: exporte a conversa do WhatsApp com ela e anexe aqui. Ela vai para a análise do que funciona e do que não funciona na cobrança. Não muda a etapa.',
    campos: [{ k: 'texto', l: 'O que aconteceu? (opcional)', tipo: 'textarea' }],
  },
  atividade: {
    titulo: 'Agendar atividade', icone: '📅', cor: '#0f766e',
    campos: [
      { k: 'texto', l: 'O que fazer', obrig: true, tipo: 'textarea', sugestoes: ['Ligar para a cliente', 'Cobrar a carta de concessão', 'Lembrar a cliente do pagamento', 'Confirmar se o dinheiro caiu', 'Cobrar o honorário'] },
      { k: 'data', l: 'Quando', obrig: true, tipo: 'date', amanha: true },
    ],
  },
  atividade_feita: {
    titulo: 'Atividade feita', icone: '☑️', cor: '#0f766e',
    campos: [{ k: 'texto', l: 'Resultado (opcional)', tipo: 'textarea' }],
  },
  observacao: {
    titulo: 'Observação', icone: '💬', cor: '#475569', anexo: 'Anexo (opcional)',
    campos: [{ k: 'texto', l: 'Observação', obrig: true, tipo: 'textarea' }],
  },
  voltar: {
    titulo: 'Voltar etapa', icone: '↩️', cor: '#64748b',
    campos: [
      { k: 'etapa', l: 'Voltar para', obrig: true, tipo: 'select', opcoes: ETAPAS_PD.filter(e => ['deferido', 'carta', 'extrato', 'prevsempre', 'aguardando_pagamento'].includes(e.key)).map(e => ({ v: e.key, l: e.label })) },
      { k: 'texto', l: 'Motivo', obrig: true, tipo: 'textarea' },
    ],
  },
  cancelar: {
    titulo: 'Cancelar acompanhamento', icone: '🚫', cor: '#94a3b8',
    campos: [{ k: 'texto', l: 'Motivo', obrig: true, tipo: 'textarea' }],
  },
}
const ACOES_POR_ETAPA_PD = {
  deferido: ['avisar_cliente', 'atividade', 'observacao', 'cancelar'],
  carta: ['carta', 'atividade', 'observacao', 'cancelar'],
  extrato: ['extrato', 'atividade', 'trocar_carta', 'observacao', 'cancelar'],
  orientacao_prev: ['orientar_prev', 'atividade', 'trocar_carta', 'observacao'],
  prevsempre: ['prevsempre', 'reagendar', 'atividade', 'trocar_carta', 'observacao'],
  aguardando_pagamento: ['cliente_pagou', 'reagendar', 'atividade', 'trocar_carta', 'observacao'],
  pago: ['cliente_pagou', 'reagendar', 'atividade', 'observacao'],
  baixado: ['observacao', 'voltar'],
  cancelado: ['voltar', 'observacao'],
}

// soltar o card numa coluna = qual formulario abrir
function acaoDoDropPD(c, col) {
  const e = c.etapa
  if (col === 'atrasado') return ['__auto']
  if (col === 'carta') return e === 'deferido' ? ['avisar_cliente'] : ['voltar', { etapa: 'carta' }]
  if (col === 'extrato') return e === 'deferido' ? ['avisar_cliente'] : e === 'carta' ? ['carta'] : ['voltar', { etapa: 'extrato' }]
  if (col === 'orientacao_prev') return e === 'deferido' ? ['avisar_cliente'] : e === 'carta' ? ['carta'] : [null]
  if (e === 'orientacao_prev') return col === 'prevsempre' ? ['orientar_prev'] : col === 'baixado' ? [null] : ['voltar', { etapa: col }]
  if (col === 'prevsempre' || col === 'aguardando_pagamento') {
    if (e === 'deferido') return ['avisar_cliente']
    if (e === 'carta') return ['carta']
    if (e === 'extrato') return ['extrato']
    if (e === 'prevsempre' && col === 'aguardando_pagamento') return ['prevsempre']
    return ['voltar', { etapa: col }]
  }
  if (col === 'baixado') return ESPERANDO.includes(e) ? ['cliente_pagou'] : [null]
  if (col === 'deferido') return ['voltar', { etapa: 'deferido' }]
  return [null]
}

// o que esta agendado para cada caso (Pipedrive: "atividades")
function itensAgenda(c) {
  const out = []
  if (c.etapa === 'deferido' && !c.cliente_avisada_em) out.push({ tipo: 'avisar', data: diaBR(c.etapa_desde) || hojeISO(), texto: 'Avisar a cliente do deferimento' })
  if (ESPERANDO.includes(c.etapa) && c.data_pagamento) out.push({ tipo: 'pagamento', data: c.data_pagamento, texto: `Recebe${c.banco ? ' no ' + c.banco : ''}${inadimplente(c) ? ' · INADIMPLENTE' : ''}` })
  if (c.proxima_atividade_em && ATIVAS.includes(c.etapa)) out.push({ tipo: 'atividade', data: c.proxima_atividade_em, texto: c.proxima_atividade })
  if (inadimplente(c) && !(c.conversas || []).includes('inadimplente')) out.push({ tipo: 'conversa', data: somaDias(c.data_pagamento, DIAS_INADIMPLENTE + 1), texto: 'Inadimplente: anexar a conversa do WhatsApp exportada' })
  return out
}
const TIPO_AGENDA = {
  pagamento: { r: 'Recebe', cor: '#7c3aed', icone: '💰' },
  atividade: { r: 'Atividade', cor: '#0f766e', icone: '📅' },
  avisar: { r: 'Avisar', cor: '#16a34a', icone: '📣' },
  sem_carta: { r: 'Sem carta', cor: '#0891b2', icone: '📜' },
  pendencia: { r: 'Pendência', cor: '#b45309', icone: '📌' },
  conversa: { r: 'Conversa', cor: '#dc2626', icone: '📎' },
}

// ---------------------------------------------------------------- tags do card
function Tags({ c, grande }) {
  const s = grande ? { fontSize: 12.5, padding: '3px 11px' } : {}
  return (
    <>
      {c.carta_recusada_em && <Chip cor={cores.perigo} forte>⚠️ CARTA RECUSADA</Chip>}
      {c.prevsempre && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 800, color: '#fff', background: AZUL_PREV, borderRadius: 999, padding: '2px 9px', fontSize: 11, letterSpacing: '.04em', ...s }}>PREVSEMPRE</span>
      )}
      {c.prevsempre_honorario_auto === true && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 800, color: AZUL_PREV, background: hexA(AZUL_PREV, 0.1), border: `1px solid ${hexA(AZUL_PREV, 0.35)}`, borderRadius: 999, padding: '1px 9px', fontSize: 11, ...s }}>✓ HONORÁRIO AUTOMÁTICO</span>
      )}
      {c.prevsempre && c.prevsempre_honorario_auto === false && <Chip cor="#b45309">sem honorário automático</Chip>}
      {c.prevsempre && c.prevsempre_conta_aberta === false && <Chip cor={cores.perigo}>conta não aberta</Chip>}
      {inadimplente(c) ? <Chip cor={cores.perigo} forte>INADIMPLENTE · {diasApos(c.data_pagamento)}d</Chip> : atrasado(c) ? <Chip cor="#ea580c" forte>ATRASADO · {diasApos(c.data_pagamento)}d</Chip> : null}
    </>
  )
}

// ---------------------------------------------------------------- guia de mensagens (bloco)
// so = mostra um roteiro so (ex.: 'deferido' dentro de "Cliente avisada")
function GuiaMensagens({ caso, so, guias, podeAgir, onMarcou }) {
  const { profile } = useAuth()
  const textos = useTextosPD()
  const [toast, mostrar] = useToast()
  const lista = guias || (so ? [so] : guiasDoCaso(caso))
  const vez = so || (guias ? (guias.find(gg => !GUIAS[gg].passos.every(p => enviadoEm(caso, gg, p.k))) || guias[0]) : guiaDaVez(caso))
  const [aberta, setAberta] = useState(vez)
  const [versao, setVersao] = useState({})      // `${guia}:${passo}` -> qual variacao
  const [marcados, setMarcados] = useState({})  // enviados nesta tela (antes de recarregar)
  const [salvando, setSalvando] = useState('')
  if (!lista.length) return null
  const g = lista.includes(aberta) ? aberta : lista[0]
  const G = GUIAS[g]
  const x = ctxMsg(caso, primeiroNome(profile?.nome), textos?.como_pagar_honorario)
  const wa = telWa(caso.telefone)
  const quandoEnviou = (gg, k) => marcados[`${gg}:${k}`] || enviadoEm(caso, gg, k)
  const completo = (gg) => GUIAS[gg].passos.every(p => quandoEnviou(gg, p.k))

  async function marcar(p) {
    const ch = `${g}:${p.k}`
    if (!podeAgir || salvando || quandoEnviou(g, p.k)) return
    setSalvando(ch)
    const { data, error } = await supabase.rpc('posdef_acao', { p_id: caso.id, p_acao: 'mensagem', p: { chave: ch, rotulo: `${G.titulo} · ${p.rot}` } })
    setSalvando('')
    if (error || !data?.ok) { mostrar(error?.message || data?.erro || 'Não consegui registrar', 'erro'); return }
    setMarcados(m => ({ ...m, [ch]: new Date().toISOString() }))
    // terminou este roteiro? abre o proximo que falta
    if (G.passos.every(pp => pp.k === p.k || quandoEnviou(g, pp.k))) {
      const prox = lista.find(gg => gg !== g && !completo(gg))
      if (prox) setAberta(prox)
    }
    onMarcou && onMarcou(ch)
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {toast}
      {lista.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {lista.map(gg => {
            const on = gg === g
            const cor = GUIAS[gg].cor
            return (
              <button key={gg} type="button" onClick={() => setAberta(gg)} style={{ padding: '6px 11px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: on ? 800 : 600, border: `1.5px solid ${on ? cor : hexA('#0f172a', 0.12)}`, background: on ? hexA(cor, 0.1) : '#fff', color: on ? cor : cores.texto }}>
                {completo(gg) ? '✓ ' : ''}{GUIAS[gg].icone} {GUIAS[gg].titulo}{gg === vez && !completo(gg) ? <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 800, color: '#fff', background: cor, borderRadius: 999, padding: '1px 7px' }}>AGORA</span> : null}
              </button>
            )
          })}
        </div>
      )}
      <div style={{ fontSize: 12, color: cores.suave }}>Uma mensagem de cada vez: mande o passo 1 e <b>espere a cliente responder</b> antes do próximo. Pode ajustar o texto no WhatsApp antes de enviar.</div>
      {G.passos.map((p, i) => {
        const ch = `${g}:${p.k}`
        const n = p.var.length
        const iv = (hashTxt(caso.id + ch) + (versao[ch] || 0)) % n
        const txt = p.var[iv](x, caso)
        const env = quandoEnviou(g, p.k)
        const dep = p.depois || (i > 0 ? G.passos[i - 1].k : null)
        const travado = !env && !!dep && !quandoEnviou(g, dep)   // uma de cada vez
        return (
          <div key={ch} style={{ border: `1px solid ${env ? hexA(cores.ok, 0.35) : hexA(G.cor, 0.3)}`, background: env ? hexA(cores.ok, 0.04) : hexA(G.cor, 0.04), borderRadius: 12, padding: 12, minWidth: 0, opacity: travado ? 0.55 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <span style={{ width: 22, height: 22, borderRadius: 999, background: env ? cores.ok : G.cor, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{env ? '✓' : i + 1}</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: cores.texto }}>{p.rot}</span>
              {p.espera && <span style={{ fontSize: 11.5, color: cores.suave }}>→ espere ela responder</span>}
              {env && <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, color: cores.ok }}>enviada {fmtDataHora(env)}</span>}
            </div>
            <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: cores.texto, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{txt}</div>
            {p.dica && <div style={{ fontSize: 12, color: '#92400e', background: hexA('#f59e0b', 0.1), borderRadius: 8, padding: '6px 9px', marginTop: 8 }}>💡 {p.dica}</div>}
            {travado ? <div style={{ fontSize: 12, fontWeight: 700, color: cores.suave, marginTop: 10 }}>🔒 Primeiro mande o passo {G.passos.findIndex(pp => pp.k === dep) + 1} e espere a cliente responder.</div> : (
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={async () => mostrar((await copiarTexto(txt)) ? 'Mensagem copiada' : 'Não consegui copiar', 'ok')} style={{ ...btn('#475569', false), padding: '6px 10px', fontSize: 12 }}>⧉ Copiar</button>
              {wa && <a href={`https://wa.me/${wa}?text=${encodeURIComponent(txt)}`} target="_blank" rel="noreferrer" onClick={() => marcar(p)} style={{ ...btn('#16a34a'), padding: '6px 10px', fontSize: 12, textDecoration: 'none' }}>Enviar no WhatsApp</a>}
              {n > 1 && <button type="button" onClick={() => setVersao(v => ({ ...v, [ch]: (v[ch] || 0) + 1 }))} style={{ ...btn(G.cor, false), padding: '6px 10px', fontSize: 12 }}>🔀 Outra versão ({iv + 1}/{n})</button>}
              {podeAgir && !env && <button type="button" disabled={!!salvando} onClick={() => marcar(p)} style={{ ...btn(cores.ok, false), padding: '6px 10px', fontSize: 12 }}>{salvando === ch ? 'Salvando…' : '✓ Já enviei'}</button>}
            </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ModalGuia({ caso, podeAgir, onClose, onMarcou }) {
  const isMobile = useIsMobile()
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', backdropFilter: 'blur(3px)', zIndex: 2000, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...card, width: '100%', maxWidth: 620, maxHeight: isMobile ? '92vh' : '88vh', overflow: 'auto', borderRadius: isMobile ? '20px 20px 0 0' : 20, padding: 0 }}>
        <div style={{ padding: '16px 20px 12px', borderBottom: `1px solid ${cores.cardBorda}`, display: 'flex', gap: 12, alignItems: 'center', background: `linear-gradient(135deg, ${hexA('#16a34a', 0.10)}, transparent)` }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: hexA('#16a34a', 0.15), display: 'grid', placeItems: 'center', fontSize: 20 }}>💬</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 16.5, fontWeight: 800, color: cores.texto }}>Mensagens para a cliente</div>
            <div style={{ fontSize: 12.5, color: cores.suave, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{caso.nome} · {fmtTel(caso.telefone)}</div>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: cores.suave }}>✕</button>
        </div>
        <div style={{ padding: 16 }}>
          <GuiaMensagens caso={caso} podeAgir={podeAgir} onMarcou={onMarcou} />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- modal de acao
function ModalPD({ caso, acao, inicial, onClose, onFeito }) {
  const cfg = ACOES_PD[acao]
  const isMobile = useIsMobile()
  const [toast, mostrar] = useToast()
  const [v, setV] = useState(() => {
    const o = {}
    ;(cfg?.campos || []).forEach(c => {
      if (c.hoje) o[c.k] = hojeISO()
      if (c.amanha) o[c.k] = somaDias(hojeISO(), 1)
    })
    if (acao === 'reagendar' && caso.data_pagamento) o.data_pagamento = caso.data_pagamento
    if (acao === 'carta' && caso.data_pagamento) o.data_pagamento = caso.data_pagamento
    if (acao === 'cliente_pagou' && caso.prevsempre_honorario_auto) o.forma = 'Desconto automático PrevSempre'
    return { ...o, ...(inicial || {}) }
  })
  const [arquivo, setArquivo] = useState(null)
  const [previa, setPrevia] = useState(null)
  const [conversa, setConversa] = useState(null)
  const [marcadas, setMarcadas] = useState({})   // mensagens marcadas aqui dentro
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [arrastando, setArrastando] = useState(false)
  const inputRef = useRef(null)
  const convRef = useRef(null)

  const pegarArquivo = useCallback((f) => {
    if (!f) return
    if (!/^image\//.test(f.type) && f.type !== 'application/pdf') { setErro('Envie imagem ou PDF.'); return }
    if (cfg?.soImagem && !/^image\//.test(f.type)) { setErro('Envie o PRINT (imagem) da conversa no WhatsApp.'); return }
    if (f.size > 15 * 1024 * 1024) { setErro('Arquivo maior que 15 MB.'); return }
    setErro(''); setArquivo(f)
    setPrevia(/^image\/(png|jpe?g|webp|gif)$/.test(f.type) ? URL.createObjectURL(f) : null)
  }, [])

  useEffect(() => {
    if (!cfg?.anexo) return
    const f = (e) => {
      const it = [...(e.clipboardData?.items || [])].find(x => x.kind === 'file')
      if (it) pegarArquivo(it.getAsFile())
    }
    window.addEventListener('paste', f)
    return () => window.removeEventListener('paste', f)
  }, [cfg, pegarArquivo])

  if (!cfg) return null
  const visiveis = (cfg.campos || []).filter(c => !c.so || c.so(v))
  const faltando = visiveis.filter(c => (c.obrig || (c.obrigSe && c.obrigSe(v))) && !String(v[c.k] ?? '').trim()).map(c => c.l)
  if (cfg.anexoObrig && !arquivo) faltando.unshift(cfg.anexo)
  if (cfg.conversa && !conversa) faltando.unshift('conversa do WhatsApp exportada')
  const guiasReq = guiasDaAcao(acao, caso)
  const faltaMsg = faltaChecklist(acao, caso, marcadas)
  if (faltaMsg.length) faltando.unshift(`checklist de mensagens (${faltaMsg.length})`)
  const pode = faltando.length === 0 && !salvando
  const pegarConversa = (f) => {
    if (!f) return
    if (!ehConversa(f)) { setErro('A conversa exportada do WhatsApp vem em .txt ou .zip.'); return }
    if (f.size > 20 * 1024 * 1024) { setErro('Arquivo maior que 20 MB: exporte "Sem mídia".'); return }
    setErro(''); setConversa(f)
  }
  const ehMercantil = (acao === 'carta' || acao === 'avisar_cliente') && /mercantil/i.test(v.banco === 'Outro' ? (v.banco_outro || '') : (v.banco || ''))

  async function salvar() {
    if (!pode) return
    setSalvando(true); setErro('')
    try {
      const p = {}
      Object.entries(v).forEach(([k, val]) => { if (!k.startsWith('_') && val !== '' && val != null) p[k] = String(val) })
      if ((acao === 'carta' || acao === 'avisar_cliente') && p.banco === 'Outro') { p.banco = p.banco_outro; delete p.banco_outro }
      delete p.banco_outro
      // 07/11 (Bruno): ORIENTACAO PREVSEMPRE — a I.A confere o print ANTES de gravar (sem rigidez)
      if (acao === 'orientar_prev') {
        const tarefa = `TAREFA (não é parecer): confira o PRINT anexado. Responda na PRIMEIRA linha apenas SIM ou NÃO e, na segunda linha, o motivo em uma frase curta.
SIM se as DUAS coisas aparecerem: (1) a imagem é um print de conversa do WhatsApp (conversa direta ou grupo); (2) na conversa aparece a orientação sobre a PrevSempre ou o Banco Mercantil E sobre o débito automático / desconto automático dos honorários.
Não seja rígida: a mensagem pode ter sido enviada por alguém da equipe da KR; NÃO exija nome, telefone, nem resposta da cliente.
NÃO somente se: não for print de WhatsApp, não aparecer nada sobre PrevSempre/Mercantil, não aparecer nada sobre débito ou desconto automático dos honorários, ou a imagem estiver claramente montada/editada.`
        let veredito = ''
        try {
          veredito = await perguntarIA({ caso, historico: [], texto: tarefa, anexos: [{ nome: arquivo.name || 'print.png', media_type: arquivo.type, data: await lerBase64PD(arquivo) }] })
        } catch (e) { throw new Error('A I.A não conseguiu conferir o print agora: ' + String(e.message || e)) }
        const limpo = String(veredito || '').replace(/[*_#>`]/g, '').trim()
        if (!limpo.split('\n')[0].trim().toUpperCase().startsWith('SIM')) {
          throw new Error('A I.A NÃO confirmou o print. Mande o print da conversa no WhatsApp em que aparece a orientação da PrevSempre e do débito automático.\n\n' + limpo)
        }
        p.ia = limpo.slice(0, 1000)
      }
      if (arquivo) p.anexo = await enviarArquivo(arquivo, caso.cpf)
      if (conversa) {
        p.conversa = await enviarConversa(conversa, caso.cpf)
        p.conversa_nome = conversa.name || ''
        if (!/\.zip$/i.test(conversa.name || '')) { try { p.conversa_texto = (await conversa.text()).slice(0, 2000000) } catch (_) { /* fica so o arquivo */ } }
      }
      const { data, error } = await supabase.rpc('posdef_acao', { p_id: caso.id, p_acao: acao, p })
      if (error) throw new Error(error.message)
      if (!data?.ok) throw new Error(data?.erro || 'não salvou')
      onFeito && onFeito(data)
    } catch (e) {
      setErro(String(e.message || e)); setSalvando(false)
    }
  }

  const st = { width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${hexA('#0f172a', 0.14)}`, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' }
  const campo = (c) => {
    const obrig = c.obrig || (c.obrigSe && c.obrigSe(v))
    return (
      <div key={c.k}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: cores.suave, margin: '0 0 5px' }}>{c.l}{obrig && <span style={{ color: cores.perigo }}> *</span>}</div>
        {c.tipo === 'textarea' ? (
          <textarea value={v[c.k] || ''} onChange={e => setV({ ...v, [c.k]: e.target.value })} rows={3} style={{ ...st, resize: 'vertical' }} />
        ) : c.tipo === 'select' ? (
          <select value={v[c.k] || ''} onChange={e => setV({ ...v, [c.k]: e.target.value })} style={st}>
            <option value="">Escolha…</option>
            {c.opcoes.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        ) : c.tipo === 'simnao' ? (
          <div style={{ display: 'flex', gap: 8 }}>
            {[['true', 'Sim', cores.ok], ['false', 'Não', cores.perigo]].map(([val, rot, cor]) => {
              const on = v[c.k] === val
              return (
                <button key={val} type="button" onClick={() => setV({ ...v, [c.k]: val })} style={{
                  flex: 1, padding: '11px 12px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 800,
                  border: `1.5px solid ${on ? cor : hexA('#0f172a', 0.14)}`, background: on ? hexA(cor, 0.1) : '#fff', color: on ? cor : cores.texto,
                }}>{on ? '● ' : ''}{rot}</button>
              )
            })}
          </div>
        ) : c.tipo === 'money' ? (
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: 10, color: cores.suave, fontSize: 14 }}>R$</span>
            <input inputMode="decimal" value={v[c.k] || ''} placeholder="0,00" onChange={e => setV({ ...v, [c.k]: e.target.value.replace(/[^\d.,]/g, '') })} style={{ ...st, paddingLeft: 36 }} />
          </div>
        ) : (
          <input type={c.tipo === 'date' ? 'date' : 'text'} value={v[c.k] || ''} onChange={e => setV({ ...v, [c.k]: e.target.value })} style={st} />
        )}
        {c.tipo === 'date' && c.k === 'data_pagamento' && v[c.k] && (
          <div style={{ fontSize: 12, color: cores.suave, marginTop: 4 }}>
            {diaSemana(v[c.k])} · {(() => { const d = Math.round((new Date(v[c.k] + 'T12:00:00') - new Date(hojeISO() + 'T12:00:00')) / 86400000); return d === 0 ? 'hoje' : d === 1 ? 'amanhã' : d > 0 ? `daqui ${d} dias` : `${-d} dias atrás` })()}
          </div>
        )}
        {c.sugestoes && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {c.sugestoes.map(s => (
              <button key={s} type="button" onClick={() => setV({ ...v, [c.k]: s })}
                style={{ fontSize: 11.5, padding: '4px 9px', borderRadius: 999, border: `1px solid ${cores.cardBorda}`, background: cores.chipBg, cursor: 'pointer', fontFamily: 'inherit', color: cores.texto }}>{s}</button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', backdropFilter: 'blur(3px)', zIndex: 2000, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 20 }}>
      {toast}
      <div onClick={e => e.stopPropagation()} style={{ ...card, width: '100%', maxWidth: 560, maxHeight: isMobile ? '92vh' : '88vh', overflow: 'auto', borderRadius: isMobile ? '20px 20px 0 0' : 20, padding: 0 }}>
        <div style={{ padding: '18px 20px 14px', borderBottom: `1px solid ${cores.cardBorda}`, display: 'flex', gap: 12, alignItems: 'center', background: `linear-gradient(135deg, ${hexA(cfg.cor, 0.10)}, transparent)` }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: hexA(cfg.cor, 0.15), display: 'grid', placeItems: 'center', fontSize: 20 }}>{cfg.icone}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 16.5, fontWeight: 800, color: cores.texto }}>{cfg.titulo}</div>
            <div style={{ fontSize: 12.5, color: cores.suave, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{caso.nome} · {fmtCpf(caso.cpf)}</div>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: cores.suave }}>✕</button>
        </div>
        <div style={{ padding: 20, display: 'grid', gap: 14 }}>
          {cfg.porque && (
            <div style={{ borderRadius: 12, padding: '12px 14px', background: hexA('#b45309', 0.07), border: `1.5px solid ${hexA('#b45309', 0.3)}`, display: 'grid', gap: 8, fontSize: 13.5, color: cores.texto, lineHeight: 1.5 }}>
              <div><b style={{ color: '#b45309' }}>Por que esta etapa existe:</b> a cliente vai receber do Banco Mercantil um link para abrir a conta onde o benefício dela vai cair. Nessa abertura aparece a autorização do <b>débito automático dos honorários</b>. Se ela não for avisada antes, estranha o link, acha que é golpe ou aperta <b>“não autorizar”</b> — o processo trava, a Maithe tem que refazer tudo e o honorário fica sem desconto automático.</div>
              <div><b style={{ color: '#b45309' }}>O seu papel:</b> mandar a mensagem abaixo, garantir que ela entendeu (ela tem que responder <b>COMBINADO</b>) e anexar o <b>print dessa conversa</b> no WhatsApp.</div>
            </div>
          )}
          {cfg.nota && <div style={{ fontSize: 12.5, color: cores.suave, background: cores.chipBg, borderRadius: 10, padding: '8px 12px' }}>{cfg.nota}</div>}
          {guiasReq.length > 0 && (
            <div style={{ border: `1.5px solid ${faltaMsg.length ? hexA('#d97706', 0.5) : hexA(cores.ok, 0.45)}`, background: faltaMsg.length ? hexA('#f59e0b', 0.05) : hexA(cores.ok, 0.05), borderRadius: 14, padding: 12, display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: faltaMsg.length ? '#b45309' : cores.ok }}>
                {faltaMsg.length ? `📋 Checklist obrigatório — falta${faltaMsg.length > 1 ? 'm' : ''} ${faltaMsg.length} mensage${faltaMsg.length > 1 ? 'ns' : 'm'}` : '✅ Checklist completo: todas as mensagens desta etapa foram enviadas'}
              </div>
              {faltaMsg.length > 0 && <GuiaMensagens caso={caso} guias={guiasReq} podeAgir={caso.pode_agir !== false} onMarcou={(ch) => setMarcadas(m => ({ ...m, [ch]: 1 }))} />}
            </div>
          )}
          {cfg.anexo && (
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: cores.suave, margin: '0 0 5px' }}>{cfg.anexo}{cfg.anexoObrig && <span style={{ color: cores.perigo }}> *</span>}</div>
              <div onClick={() => inputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setArrastando(true) }}
                onDragLeave={() => setArrastando(false)}
                onDrop={e => { e.preventDefault(); setArrastando(false); pegarArquivo(e.dataTransfer.files?.[0]) }}
                style={{ border: `2px dashed ${arrastando ? cfg.cor : hexA('#0f172a', 0.18)}`, borderRadius: 14, padding: 16, background: arrastando ? hexA(cfg.cor, 0.06) : '#fafbfd', cursor: 'pointer', textAlign: 'center' }}>
                {arquivo ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {previa ? <img src={previa} alt="prévia" style={{ maxHeight: 120, maxWidth: '100%', borderRadius: 8 }} /> : <div style={{ fontSize: 34 }}>📄</div>}
                    <div style={{ textAlign: 'left', minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, overflowWrap: 'anywhere' }}>{arquivo.name || 'imagem colada'}</div>
                      <div style={{ fontSize: 12, color: cores.suave }}>{(arquivo.size / 1024).toFixed(0)} KB · clique para trocar</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ color: cores.suave, fontSize: 13 }}>
                    <div style={{ fontSize: 26, marginBottom: 4 }}>⬆️</div>
                    <b style={{ color: cores.texto }}>Arraste aqui, clique para escolher</b><br />ou cole o print com <b>Ctrl+V</b> · imagem ou PDF
                  </div>
                )}
                <input ref={inputRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => pegarArquivo(e.target.files?.[0])} />
              </div>
            </div>
          )}
          {cfg.conversa && (
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: cores.suave, margin: '0 0 5px' }}>Conversa do WhatsApp exportada<span style={{ color: cores.perigo }}> *</span></div>
              <div onClick={() => convRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); pegarConversa(e.dataTransfer.files?.[0]) }}
                style={{ border: `2px dashed ${conversa ? hexA(cores.ok, 0.5) : hexA('#0f172a', 0.18)}`, borderRadius: 14, padding: 14, background: conversa ? hexA(cores.ok, 0.05) : '#fafbfd', cursor: 'pointer', textAlign: 'center', fontSize: 13, color: cores.suave }}>
                {conversa
                  ? <span><b style={{ color: cores.texto, overflowWrap: 'anywhere' }}>💬 {conversa.name}</b> · {(conversa.size / 1024).toFixed(0)} KB · clique para trocar</span>
                  : <span><b style={{ color: cores.texto }}>Arraste o arquivo da conversa ou clique para escolher</b> · .txt ou .zip</span>}
                <input ref={convRef} type="file" accept=".txt,.zip,text/plain,application/zip" style={{ display: 'none' }} onChange={e => pegarConversa(e.target.files?.[0])} />
              </div>
              <div style={{ fontSize: 11.5, color: cores.suave, marginTop: 5 }}>{COMO_EXPORTAR}</div>
            </div>
          )}
          {visiveis.map(campo)}
          {ehMercantil && <div style={{ fontSize: 13, fontWeight: 700, color: AZUL_PREV, background: hexA(AZUL_PREV, 0.08), borderRadius: 10, padding: '9px 12px' }}>🏦 Mercantil: o caso vai para a etapa <b>Orientação PrevSempre</b> (avisar a cliente do link e do débito automático) e só depois para a <b>PrevSempre</b>.</div>}
          {erro && <div style={{ color: cores.perigo, background: hexA(cores.perigo, 0.08), borderRadius: 10, padding: '9px 12px', fontSize: 13, fontWeight: 600 }}>{erro}</div>}
          {!pode && !salvando && faltando.length > 0 && <div style={{ fontSize: 12, color: cores.suave }}>Falta: {faltando.join(' · ')}</div>}
        </div>
        <div style={{ padding: '14px 20px 20px', display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: `1px solid ${cores.cardBorda}`, position: 'sticky', bottom: 0, background: '#fff' }}>
          <button onClick={onClose} style={btn('#475569', false)}>Cancelar</button>
          <button onClick={salvar} disabled={!pode} style={{ ...btn(cfg.cor), opacity: pode ? 1 : 0.45, cursor: pode ? 'pointer' : 'not-allowed' }}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- ficha (gaveta)
const ICONE_EV = {
  entrada: '📥', avisar_cliente: '📣', carta: '📜', prevsempre: '🏦', reagendar: '🗓️', pago: '💸', baixa: '🏁', cliente_pagou: '🤝',
  atividade: '📅', atividade_feita: '☑️', observacao: '💬', voltar: '↩️', cancelar: '🚫', mensagem: '✉️',
}

function FichaPD({ id, onFechar, onMudou }) {
  const isMobile = useIsMobile()
  const [toast, mostrar] = useToast()
  const [dados, setDados] = useState(null)
  const [modal, setModal] = useState(null)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('posdef_caso', { p_id: id })
    if (error) { setDados({ ok: false, erro: error.message }); return }
    setDados(data || { ok: false, erro: 'sem dados' })
  }, [id])
  useEffect(() => { carregar() }, [carregar])

  if (!dados) return <div style={{ ...card, padding: 40, textAlign: 'center', color: cores.suave }}>Carregando…</div>
  if (!dados.ok) return <div style={{ ...card, padding: 30, color: cores.perigo }}>{dados.erro} {onFechar && <button onClick={onFechar} style={btn('#475569', false)}>Fechar</button>}</div>

  const c = dados.caso
  const pr = dados.protocolo || {}
  const et = etapaPD(c.etapa)
  const conversas = Array.isArray(dados.conversas) ? dados.conversas : []
  const faltaConvInad = inadimplente(c) && !conversas.some(v => v.motivo === 'inadimplente')
  const acoes = c.pode_agir === false ? [] : [...(faltaConvInad ? ['conversa_inadimplente'] : []), ...(ACOES_POR_ETAPA_PD[c.etapa] || ['observacao'])]
  const wa = telWa(c.telefone)
  const refs = (Array.isArray(pr.referencias) ? pr.referencias : []).filter(r => r && (r.nome || r.telefone))
  const copiar = async (rot, val) => { if (await copiarTexto(String(val))) mostrar(`${rot} copiado`) }
  const tituloSecao = { fontSize: 11.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: cores.suave, margin: '0 0 10px' }
  const Info = ({ rot, val, destaque }) => (
    <div style={{ minWidth: 0, background: destaque ? hexA(destaque, 0.07) : '#fff', border: `1px solid ${destaque ? hexA(destaque, 0.3) : cores.cardBorda}`, borderRadius: 12, padding: '9px 12px' }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: cores.suave }}>{rot}</div>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: destaque || cores.texto, marginTop: 2, overflowWrap: 'anywhere' }}>{val || '—'}</div>
    </div>
  )
  const docs = [
    ['Carta de deferimento (INSS)', c.carta_deferimento_url],
    ['Carta de concessão', c.carta_concessao_url],
    ['Comprovante do pagamento', c.pago_comprovante_url],
    ['Comprovante da cliente', c.honorario_comprovante_url],
  ].filter(([, u]) => u)
  const diasPag = c.data_pagamento ? Math.round((new Date(c.data_pagamento + 'T12:00:00') - new Date(hojeISO() + 'T12:00:00')) / 86400000) : null

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {toast}
      <div style={{ ...card, padding: isMobile ? 16 : 20, background: `linear-gradient(135deg, #ffffff 40%, ${hexA(et.cor, 0.08)})` }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: c.prevsempre ? `linear-gradient(135deg, ${AZUL_PREV}, #3b82f6)` : 'linear-gradient(135deg,#16a34a,#0891b2)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 18, flexShrink: 0 }}>{iniciais(c.nome)}</div>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <div style={{ fontSize: isMobile ? 19 : 22, fontWeight: 800, color: cores.texto, lineHeight: 1.2, overflowWrap: 'anywhere' }}>{c.nome || 'Sem nome'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 7, flexWrap: 'wrap' }}>
              <button onClick={() => copiar('CPF', soDig(c.cpf))} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, border: `1px solid ${cores.cardBorda}`, background: '#fff', borderRadius: 8, padding: '3px 9px', cursor: 'pointer', color: cores.texto }}>{fmtCpf(c.cpf)} ⧉</button>
              <Chip cor={et.cor} forte>{et.icone} {et.label}</Chip>
              <Tags c={c} grande />
            </div>
            <div style={{ fontSize: 13, color: cores.suave, marginTop: 8, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <span>📞 <b style={{ color: cores.texto }}>{fmtTel(c.telefone)}</b></span>
              {c.vendedora_nome && <span>🧑‍💼 venda: {c.vendedora_nome}</span>}
              <span>👥 acompanha: <b style={{ color: cores.texto }}>{(c.responsaveis || []).join(', ') || '—'}</b></span>
            </div>
            {c.carta_recusada_em && (
              <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: hexA(cores.perigo, 0.07), border: `1px solid ${hexA(cores.perigo, 0.35)}`, borderRadius: 12, padding: '10px 12px' }}>
                <span style={{ fontSize: 13.5, color: cores.texto, flex: '1 1 260px' }}>⚠️ <b style={{ color: cores.perigo }}>Carta de concessão recusada</b>{c.carta_recusada_por_nome ? ` por ${c.carta_recusada_por_nome}` : ''} em {fmtDataHora(c.carta_recusada_em)}: <b>{c.carta_recusada_motivo || '—'}</b>. Anexe a carta correta.</span>
                {c.carta_concessao_url && <button onClick={() => abrirArquivo(c.carta_concessao_url)} style={{ ...btn('#475569', false), padding: '6px 10px', fontSize: 12 }}>📜 Ver carta atual</button>}
                {c.pode_agir !== false && <button onClick={() => setModal('trocar_carta')} style={{ ...btn(cores.perigo), padding: '6px 12px', fontSize: 12.5 }}>🔁 Trocar carta</button>}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {c.telefone && <button onClick={() => copiar('Telefone', soDig(c.telefone))} style={btn('#475569', false)}>⧉ Telefone</button>}
            {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" style={{ ...btn('#16a34a', false), textDecoration: 'none' }}>WhatsApp</a>}
            {onFechar && <button onClick={onFechar} aria-label="Fechar" style={{ ...btn('#475569', false), padding: '8px 11px' }}>✕</button>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
          {acoes.map((a, i) => {
            const fc = faltaChecklist(a, c).length
            return <button key={a} onClick={() => setModal(a)} title={fc ? 'Falta marcar mensagens do checklist' : undefined} style={btn(ACOES_PD[a].cor, i === 0)}>{ACOES_PD[a].icone} {ACOES_PD[a].titulo}{fc ? ` · 🔒 ${fc} msg` : ''}</button>
          })}
          {c.proxima_atividade && c.pode_agir !== false && <button onClick={() => setModal('atividade_feita')} style={btn('#0f766e', false)}>☑️ Atividade feita</button>}
          {c.pode_agir === false && <span style={{ fontSize: 12.5, color: cores.suave }}>Só acompanhamento — quem atualiza este caso é {(c.responsaveis || []).join(', ') || 'o responsável'}.</span>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1.15fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          {c.proxima_atividade && (
            <div style={{ ...card, padding: 16, border: `1.5px solid ${hexA('#0f766e', 0.4)}`, background: hexA('#0f766e', 0.05) }}>
              <div style={{ ...tituloSecao, color: '#0f766e', margin: 0 }}>📅 Próxima atividade · {fmtData(c.proxima_atividade_em)} ({diaSemana(c.proxima_atividade_em)})</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: cores.texto, marginTop: 6 }}>{c.proxima_atividade}</div>
            </div>
          )}
          {guiasDoCaso(c).length > 0 && (
            <div style={{ ...card, padding: 18 }}>
              <div style={tituloSecao}>💬 Mensagens para a cliente</div>
              <GuiaMensagens caso={{ ...c, data_protocolo: pr.data_protocolo }} podeAgir={c.pode_agir !== false} onMarcou={carregar} />
            </div>
          )}
          <div style={{ ...card, padding: 18 }}>
            <div style={tituloSecao}>💰 Pagamento</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              <Info rot="Banco" val={c.banco} destaque={c.prevsempre ? AZUL_PREV : null} />
              <Info rot="Data do pagamento" val={c.data_pagamento ? `${fmtData(c.data_pagamento)} · ${diaSemana(c.data_pagamento)}` : null}
                destaque={diasPag != null && ATIVAS.includes(c.etapa) && c.etapa !== 'pago' ? (diasPag < 0 ? cores.perigo : diasPag <= 1 ? '#d97706' : '#7c3aed') : null} />
              <Info rot="Valor do benefício" val={reais(c.valor_beneficio)} />
              {c.etapa === 'baixado' && <Info rot="Cliente pagou" val={`${fmtData(c.pago_em)} · ${c.honorario_forma || ''}${c.honorario_valor ? ' · ' + reais(c.honorario_valor) : ''}`} destaque={cores.ok} />}
              {inadimplente(c) && <Info rot="Situação" val={`INADIMPLENTE há ${diasApos(c.data_pagamento)} dias`} destaque={cores.perigo} />}
            </div>
            {c.prevsempre && (
              <div style={{ marginTop: 12, borderRadius: 12, padding: '10px 12px', background: hexA(AZUL_PREV, 0.06), border: `1px solid ${hexA(AZUL_PREV, 0.25)}`, fontSize: 13.5, color: cores.texto, display: 'grid', gap: 4 }}>
                <div style={{ fontWeight: 800, color: AZUL_PREV }}>🏦 PrevSempre (Mercantil)</div>
                <div>Conta PrevSempre: <b>{c.prevsempre_conta_aberta == null ? 'a confirmar' : c.prevsempre_conta_aberta ? 'aberta' : 'não aberta'}</b></div>
                <div>Honorário automático: <b>{c.prevsempre_honorario_auto == null ? 'a confirmar' : c.prevsempre_honorario_auto ? 'aceito' : 'não aceito'}</b></div>
              </div>
            )}
          </div>
          <div style={{ ...card, padding: 18 }}>
            <div style={tituloSecao}>🏛️ INSS</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              <Info rot="NB" val={c.nb} />
              <Info rot="Deferido em" val={fmtData(c.data_deferimento)} />
              <Info rot="Protocolo" val={pr.numero_protocolo} />
              <Info rot="Cliente avisada" val={c.cliente_avisada_em ? `${fmtDataHora(c.cliente_avisada_em)}${c.cliente_avisada_por_nome ? ' · ' + c.cliente_avisada_por_nome : ''}` : 'ainda não'} destaque={c.cliente_avisada_em ? null : '#d97706'} />
            </div>
            {(docs.length > 0 || conversas.length > 0) && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                {docs.map(([rot, u]) => <button key={rot} onClick={() => abrirArquivo(u)} style={btn('#0891b2', false)}>📎 {rot}</button>)}
                {conversas.map(v => <button key={v.id} onClick={() => abrirConversa(v.arquivo_url)} title={`${v.enviado_por_nome || ''} · ${fmtDataHora(v.enviado_em)}`} style={btn(v.motivo === 'inadimplente' ? cores.perigo : '#15803d', false)}>💬 Conversa WhatsApp ({v.motivo === 'inadimplente' ? 'inadimplente' : 'pagamento'})</button>)}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          {refs.length > 0 && (
            <div style={{ ...card, padding: 18 }}>
              <div style={tituloSecao}>📞 Contatos de referência</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {refs.map((r, i) => {
                  const w = telWa(r.telefone)
                  const parent = r.parentesco === 'Outro' && r.parentesco_outro ? r.parentesco_outro : r.parentesco
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', border: `1px solid ${cores.cardBorda}`, borderRadius: 12, padding: '9px 11px' }}>
                      <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{r.nome}</div>
                        <div style={{ fontSize: 12, color: cores.suave }}>{parent || '—'} · {fmtTel(r.telefone)}</div>
                      </div>
                      {w && <a href={`https://wa.me/${w}`} target="_blank" rel="noreferrer" style={{ ...btn('#16a34a', false), padding: '5px 10px', fontSize: 12, textDecoration: 'none' }}>WhatsApp</a>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          <div style={{ ...card, padding: 18 }}>
            <div style={tituloSecao}>🕓 Histórico</div>
            <div style={{ display: 'grid', gap: 12 }}>
              {(dados.eventos || []).map(e => (
                <div key={e.id} style={{ display: 'flex', gap: 10 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 10, background: cores.chipBg, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{ICONE_EV[e.tipo] || '•'}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, color: cores.texto, overflowWrap: 'anywhere' }}>{e.texto || e.tipo}</div>
                    <div style={{ fontSize: 11.5, color: cores.suave, marginTop: 2 }}>
                      {e.feito_por_nome} · {fmtDataHora(e.feito_em)}
                      {e.anexo_url && <button onClick={() => abrirArquivo(e.anexo_url)} style={{ marginLeft: 8, border: 'none', background: 'none', color: cores.azul, cursor: 'pointer', fontSize: 11.5, fontWeight: 700, padding: 0 }}>📎 anexo</button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {modal && <ModalPD caso={c} acao={modal} onClose={() => setModal(null)} onFeito={() => { setModal(null); mostrar('Salvo'); carregar(); onMudou && onMudou() }} />}
    </div>
  )
}

// ---------------------------------------------------------------- resolver pendencia (time de acompanhamento)
// A advogada/Sthefany escreveu O QUE PRECISA; aqui a pessoa escolhe COMO resolveu
// (alternativas da categoria em CATEGORIAS_PEND) e o banco confere o que cada uma exige.
function ModalResolver({ pend, opcao, onClose, onFeito }) {
  const isMobile = useIsMobile()
  const cat = catPend(pend.categoria)
  const op = cat.opcoes.find(o => o.v === opcao) || cat.opcoes[0]
  const [texto, setTexto] = useState('')
  const [data, setData] = useState('')
  const [valor, setValor] = useState('')   // 05/11 (Bruno): complementacao de guia paga -> valor
  const pedeValor = op.v === 'pagou'
  const [arquivos, setArquivos] = useState([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [arrastando, setArrastando] = useState(false)
  const inputRef = useRef(null)

  const juntar = useCallback((lista) => {
    const ok = [...(lista || [])].filter(f => /^image\//.test(f.type) || f.type === 'application/pdf').filter(f => f.size <= 15 * 1024 * 1024)
    if (!ok.length) { setErro('Envie imagem ou PDF (até 15 MB).'); return }
    setErro(''); setArquivos(a => [...a, ...ok].slice(0, 6))
  }, [])
  useEffect(() => {
    if (!op.anexo && !op.anexoOpcional) return
    const f = (e) => { const fs = [...(e.clipboardData?.items || [])].filter(x => x.kind === 'file').map(x => x.getAsFile()); if (fs.length) juntar(fs) }
    window.addEventListener('paste', f)
    return () => window.removeEventListener('paste', f)
  }, [op, juntar])

  const falta = []
  if (op.anexo && !arquivos.length) falta.push('anexo')
  if (op.data && !data) falta.push('data')
  if (op.texto && !texto.trim()) falta.push('explicação')
  if (pedeValor && !(Number(String(valor).replace(/\./g, '').replace(',', '.')) > 0)) falta.push('valor pago')
  const pode = !falta.length && !salvando

  async function salvar() {
    if (!pode) return
    setSalvando(true); setErro('')
    try {
      const anexos = []
      for (const f of arquivos) anexos.push(await enviarArquivo(f, pend.cpf))
      const { data: r, error } = await supabase.rpc('posdef_pendencia_resolver', { p_id: pend.id, p: { resolucao: op.v, texto: texto.trim() || null, data: data || null, anexos, valor: pedeValor ? String(valor).replace(/\./g, '').replace(',', '.') : null } })
      if (error) throw new Error(error.message)
      if (!r?.ok) throw new Error(r?.erro || 'não salvou')
      onFeito && onFeito(r)
    } catch (e) { setErro(String(e.message || e)); setSalvando(false) }
  }

  const st = { width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${hexA('#0f172a', 0.14)}`, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' }
  const cor = op.negativa ? cores.perigo : op.andamento ? '#2563eb' : cores.ok
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', backdropFilter: 'blur(3px)', zIndex: 2000, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...card, width: '100%', maxWidth: 560, maxHeight: isMobile ? '92vh' : '88vh', overflow: 'auto', borderRadius: isMobile ? '20px 20px 0 0' : 20, padding: 0 }}>
        <div style={{ padding: '18px 20px 14px', borderBottom: `1px solid ${cores.cardBorda}`, display: 'flex', gap: 12, alignItems: 'center', background: `linear-gradient(135deg, ${hexA(cat.cor, 0.10)}, transparent)` }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: hexA(cat.cor, 0.15), display: 'grid', placeItems: 'center', fontSize: 20 }}>{cat.icone}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 16.5, fontWeight: 800, color: cores.texto }}>{op.rot}</div>
            <div style={{ fontSize: 12.5, color: cores.suave, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pend.nome} · {cat.rot}</div>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: cores.suave }}>✕</button>
        </div>
        <div style={{ padding: 20, display: 'grid', gap: 14 }}>
          <div style={{ fontSize: 13, color: cores.texto, background: cores.chipBg, borderRadius: 10, padding: '9px 12px' }}><b>O que precisa:</b> {pend.descricao}</div>
          <div style={{ fontSize: 13, color: cor, fontWeight: 700 }}>{op.dica}</div>
          {(op.anexo || op.anexoOpcional) && (
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: cores.suave, margin: '0 0 5px' }}>Anexos{op.anexo && <span style={{ color: cores.perigo }}> *</span>} <span style={{ fontWeight: 500 }}>(até 6)</span></div>
              <div onClick={() => inputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setArrastando(true) }} onDragLeave={() => setArrastando(false)}
                onDrop={e => { e.preventDefault(); setArrastando(false); juntar(e.dataTransfer.files) }}
                style={{ border: `2px dashed ${arrastando ? cat.cor : hexA('#0f172a', 0.18)}`, borderRadius: 14, padding: 14, background: arrastando ? hexA(cat.cor, 0.06) : '#fafbfd', cursor: 'pointer', textAlign: 'center', color: cores.suave, fontSize: 13 }}>
                <b style={{ color: cores.texto }}>Arraste aqui, clique para escolher</b> ou cole com <b>Ctrl+V</b> · imagem ou PDF
                <input ref={inputRef} type="file" multiple accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => juntar(e.target.files)} />
              </div>
              {arquivos.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {arquivos.map((f, i) => (
                    <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, background: cores.chipBg, borderRadius: 999, padding: '4px 10px' }}>
                      📎 {(f.name || 'imagem').slice(0, 24)}
                      <button onClick={() => setArquivos(a => a.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: cores.suave, padding: 0 }}>✕</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {pedeValor && (
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: cores.suave, margin: '0 0 5px' }}>Valor pago na complementação (R$)<span style={{ color: cores.perigo }}> *</span></div>
              <input inputMode="decimal" value={valor} onChange={e => setValor(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="Ex.: 152,37" style={st} />
            </div>
          )}
          {op.data && (
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: cores.suave, margin: '0 0 5px' }}>Data combinada<span style={{ color: cores.perigo }}> *</span></div>
              <input type="date" value={data} onChange={e => setData(e.target.value)} style={st} />
              {pend.exigencia_prazo && pend.categoria === 'exigencia_inss' && <div style={{ fontSize: 12, color: cores.perigo, marginTop: 4 }}>Prazo do INSS: {fmtData(pend.exigencia_prazo)}</div>}
            </div>
          )}
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: cores.suave, margin: '0 0 5px' }}>{op.texto ? 'Explique' : 'Observação (opcional)'}{op.texto && <span style={{ color: cores.perigo }}> *</span>}</div>
            <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={3} style={{ ...st, resize: 'vertical' }} />
          </div>
          {op.andamento && <div style={{ fontSize: 12.5, color: cores.suave }}>A pendência continua aberta e aparece na sua agenda nessa data.</div>}
          {!op.andamento && <div style={{ fontSize: 12.5, color: cores.suave }}>Ao salvar, a pendência vai para a advogada refazer o caso{op.negativa ? ' e decidir o que fazer' : ''}.</div>}
          {erro && <div style={{ color: cores.perigo, background: hexA(cores.perigo, 0.08), borderRadius: 10, padding: '9px 12px', fontSize: 13, fontWeight: 600 }}>{erro}</div>}
          {!pode && !salvando && falta.length > 0 && <div style={{ fontSize: 12, color: cores.suave }}>Falta: {falta.join(' · ')}</div>}
        </div>
        <div style={{ padding: '14px 20px 20px', display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: `1px solid ${cores.cardBorda}`, position: 'sticky', bottom: 0, background: '#fff' }}>
          <button onClick={onClose} style={btn('#475569', false)}>Cancelar</button>
          <button onClick={salvar} disabled={!pode} style={{ ...btn(cor), opacity: pode ? 1 : 0.45, cursor: pode ? 'pointer' : 'not-allowed' }}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- tela principal
const ETAPAS_INSS = {
  aguardando_protocolo: { rot: 'Na fila para protocolar', cor: '#3b82f6', icone: '🗂️', grupo: 'fila' },
  protocolado: { rot: 'Em análise no INSS', cor: '#8b5cf6', icone: '📨', grupo: 'analise' },
  recurso: { rot: 'Em recurso', cor: '#0891b2', icone: '⚖️', grupo: 'analise' },
  pendencia_docs: { rot: 'Com pendência', cor: '#d97706', icone: '📌', grupo: 'problema' },
  exigencia: { rot: 'Exigência do INSS', cor: '#ea580c', icone: '⚠️', grupo: 'problema' },
  indeferido: { rot: 'Indeferido', cor: '#dc2626', icone: '⛔', grupo: 'problema' },
  recurso_indeferido: { rot: 'Recurso indeferido', cor: '#b91c1c', icone: '✖️', grupo: 'problema' },
}
// 29/10 (Bruno): caso ainda no INSS (antes do deferimento). O time abre a CARTA DE PROTOCOLO
// (obrigatoria quando a advogada marca "protocolado") para mandar para a cliente.
const msgProtocolo = (c) => `Oi, ${primeiroNome(c.nome) || 'tudo bem'}! Passando pra te dar uma notícia boa: o seu pedido do salário-maternidade já foi *protocolado no INSS* 🙌\n\nProtocolo nº *${c.numero_protocolo || '—'}*${c.data_protocolo ? `, feito em ${fmtData(c.data_protocolo)}` : ''}. Vou te mandar o comprovante aqui.\n\nAgora o INSS analisa o pedido e eu te aviso de cada novidade, tá bom? 💛`
function ModalINSS({ c, onClose, onPendencias }) {
  const isMobile = useIsMobile()
  const [toast, mostrar] = useToast()
  const e = ETAPAS_INSS[c.etapa] || { rot: c.etapa, cor: '#64748b', icone: '•' }
  const wa = telWa(c.telefone)
  const temProt = !!c.numero_protocolo
  const msg = temProt ? msgProtocolo(c) : null
  const dProt = c.data_protocolo ? diasApos(c.data_protocolo) : null
  const copiar = async (rot, v) => mostrar((await copiarTexto(String(v))) ? `${rot} copiado` : 'Não consegui copiar')
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', backdropFilter: 'blur(3px)', zIndex: 2000, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 20 }}>
      {toast}
      <div onClick={ev => ev.stopPropagation()} style={{ ...card, width: '100%', maxWidth: 580, maxHeight: isMobile ? '92vh' : '88vh', overflow: 'auto', borderRadius: isMobile ? '20px 20px 0 0' : 20, padding: 0 }}>
        <div style={{ padding: '16px 20px 12px', borderBottom: `1px solid ${cores.cardBorda}`, display: 'flex', gap: 12, alignItems: 'center', background: `linear-gradient(135deg, ${hexA(e.cor, 0.10)}, transparent)` }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: hexA(e.cor, 0.15), display: 'grid', placeItems: 'center', fontSize: 20 }}>{e.icone}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 16.5, fontWeight: 800, color: cores.texto, overflowWrap: 'anywhere' }}>{c.nome}</div>
            <div style={{ fontSize: 12.5, color: cores.suave }}>{fmtCpf(c.cpf)} · {fmtTel(c.telefone)} · venda: {c.vendedora_nome || '—'}</div>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: cores.suave }}>✕</button>
        </div>
        <div style={{ padding: 18, display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Chip cor={e.cor} forte>{e.icone} {e.rot}</Chip>
            {c.perfil && <Chip cor="#475569">{c.perfil}</Chip>}
            {c.pend_abertas > 0 && <button onClick={onPendencias} style={{ border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 800, color: '#b45309', background: hexA('#b45309', 0.1), borderRadius: 999, padding: '3px 10px' }}>📌 {c.pend_abertas} pendência{c.pend_abertas > 1 ? 's' : ''} — resolver</button>}
          </div>
          {temProt ? (
            <div style={{ border: `1.5px solid ${hexA('#8b5cf6', 0.4)}`, background: hexA('#8b5cf6', 0.05), borderRadius: 14, padding: 14, display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6d28d9' }}>📨 Protocolo no INSS</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 20, fontWeight: 800, color: cores.texto }}>{c.numero_protocolo}</div>
                <button onClick={() => copiar('Número', c.numero_protocolo)} style={{ ...btn('#475569', false), padding: '5px 9px', fontSize: 12 }}>⧉ Copiar nº</button>
                <span style={{ fontSize: 12.5, color: cores.suave }}>{c.data_protocolo ? `protocolado em ${fmtData(c.data_protocolo)}${dProt != null ? ` · há ${dProt} dia${dProt === 1 ? '' : 's'}` : ''}` : ''}</span>
              </div>
              {c.protocolo_termo_url
                ? <button onClick={() => abrirArquivo(c.protocolo_termo_url)} style={{ ...btn('#6d28d9'), justifySelf: 'start' }}>📄 Abrir a carta de protocolo</button>
                : <div style={{ fontSize: 13, fontWeight: 700, color: cores.perigo }}>A carta de protocolo não foi anexada — avise a advogada.</div>}
            </div>
          ) : (
            <div style={{ fontSize: 13.5, color: cores.texto, background: cores.chipBg, borderRadius: 12, padding: '10px 12px' }}>🗂️ Ainda não protocolado — a advogada vai protocolar. A carta de protocolo aparece aqui assim que ela marcar.</div>
          )}
          {c.etapa === 'exigencia' && (
            <div style={{ border: `1px solid ${hexA('#ea580c', 0.35)}`, background: hexA('#ea580c', 0.05), borderRadius: 12, padding: 12, fontSize: 13.5, color: cores.texto }}>
              <b style={{ color: '#c2410c' }}>⚠️ Exigência do INSS</b>{c.exigencia_prazo ? <b style={{ color: cores.perigo }}> · prazo {fmtData(c.exigencia_prazo)}</b> : null}
              {c.exigencia_texto && <div style={{ marginTop: 4 }}>{c.exigencia_texto}</div>}
              {c.resposta_inss_url && <button onClick={() => abrirArquivo(c.resposta_inss_url)} style={{ ...btn('#c2410c', false), marginTop: 8, padding: '5px 10px', fontSize: 12 }}>📎 Ver a resposta do INSS</button>}
            </div>
          )}
          {['indeferido', 'recurso_indeferido'].includes(c.etapa) && c.motivo && (
            <div style={{ fontSize: 13.5, color: '#7f1d1d', background: hexA(cores.perigo, 0.06), borderRadius: 12, padding: '10px 12px' }}><b>Motivo:</b> {c.motivo}{c.resposta_inss_url && <> · <button onClick={() => abrirArquivo(c.resposta_inss_url)} style={{ border: 'none', background: 'none', color: cores.perigo, fontWeight: 700, cursor: 'pointer', padding: 0 }}>ver resposta do INSS</button></>}</div>
          )}
          {msg && (
            <div style={{ border: `1px solid ${hexA('#16a34a', 0.3)}`, background: hexA('#16a34a', 0.04), borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#15803d', marginBottom: 6 }}>MENSAGEM PARA A CLIENTE (mande junto com a carta)</div>
              <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: cores.texto, lineHeight: 1.5 }}>{msg}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                <button onClick={() => copiar('Mensagem', msg)} style={{ ...btn('#475569', false), padding: '6px 10px', fontSize: 12 }}>⧉ Copiar</button>
                {wa && <a href={`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer" style={{ ...btn('#16a34a'), padding: '6px 10px', fontSize: 12, textDecoration: 'none' }}>Enviar no WhatsApp</a>}
              </div>
              <div style={{ fontSize: 11.5, color: cores.suave, marginTop: 6 }}>O WhatsApp não anexa arquivo pelo link: abra a carta, salve e anexe na conversa.</div>
            </div>
          )}
          <div style={{ fontSize: 12, color: cores.suave }}>🔒 Só acompanhamento — quem mexe nesta etapa é a advogada.</div>
        </div>
      </div>
    </div>
  )
}

// colunas do funil ANTES do deferimento (so leitura, vem do Protocolo INSS)
const COLUNAS_INSS = [
  { k: 'inss_fila', label: 'A protocolar', icone: '🗂️', cor: '#3b82f6', etapas: ['aguardando_protocolo', 'pendencia_docs'], sub: 'contrato assinado, a advogada vai protocolar' },
  { k: 'inss_analise', label: 'Em análise', icone: '📨', cor: '#8b5cf6', etapas: ['protocolado', 'exigencia', 'recurso'], sub: 'protocolado — clique para ver a carta' },
]
const nomeMesBR = (ym) => { const [a, m] = ym.split('-').map(Number); const n = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long' }); return `${n.charAt(0).toUpperCase()}${n.slice(1)}/${String(a).slice(2)}` }
const mesDe = (c) => (c.data_pagamento || (c.pago_em || '')).slice(0, 7)

// 06/11 (Bruno): icone de anexo desenhado (sem emoji) e o tipo do arquivo pelo nome
function IconeClipe() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  )
}
const tipoArquivo = (u) => (/\.pdf($|\?)/i.test(String(u || '')) ? 'PDF' : 'Imagem')

export default function PosDeferimento() {
  const { profile } = useAuth()
  const isMobile = useIsMobile()
  const [toast, mostrar] = useToast()
  // vendedora (sem ser responsavel/admin): so le o pos das vendas dela
  const soLeitura = profile?.role !== 'admin' && profile?.posdef_papel === 'vendedora'
  // 09/11 (Bruno): so a Jessica e a Sthefany (protocolo_papel) e o admin dao a BAIXA na pendencia; os outros sinalizam
  const podeResolver = profile?.role === 'admin' || !!profile?.protocolo_papel
  const [lista, setLista] = useState(null)
  const [inss, setInss] = useState([])
  const [pends, setPends] = useState([])
  const [resultados, setResultados] = useState([])   // 02/11: deferidos e indeferidos do Protocolo (posdef_resultados_inss)
  const [rsPer, setRsPer] = useState('hoje')
  const [aba, setAba] = useState(() => (profile?.role !== 'admin' && profile?.posdef_papel === 'vendedora' ? 'pagamentos' : 'inicio'))

  // 04/11 (Bruno): abas que nao cabem na tela — alem das setas do teclado, agora da para ARRASTAR com o mouse
  // e clicar nas setas ‹ › das pontas. Sem re-render no arrasto (mexe direto no scroll); seta so muda quando precisa.
  const abasEl = useRef(null)
  const abasDrag = useRef(null)
  const [abasLado, setAbasLado] = useState('')   // '' | 'e' | 'd' | 'ed' = tem aba escondida a esquerda/direita
  const abasRef = useCallback((el) => {
    if (abasEl.current && abasEl.current._sair) abasEl.current._sair()
    abasEl.current = el
    if (!el) return
    let raf = 0
    const medir = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const v = (el.scrollLeft > 2 ? 'e' : '') + (el.scrollLeft + el.clientWidth < el.scrollWidth - 2 ? 'd' : '')
        setAbasLado(o => (o === v ? o : v))
      })
    }
    el._medir = medir
    el.addEventListener('scroll', medir, { passive: true })
    window.addEventListener('resize', medir)
    medir()
    el._sair = () => { cancelAnimationFrame(raf); el.removeEventListener('scroll', medir); window.removeEventListener('resize', medir) }
  }, [])
  useEffect(() => {   // a aba escolhida sempre fica a vista
    const el = abasEl.current
    if (!el) return
    const on = el.querySelector('[data-on="1"]')
    if (on && (on.offsetLeft < el.scrollLeft || on.offsetLeft + on.offsetWidth > el.scrollLeft + el.clientWidth)) {
      el.scrollTo({ left: on.offsetLeft - el.clientWidth / 2 + on.offsetWidth / 2, behavior: 'smooth' })
    }
    if (el._medir) el._medir()
  }, [aba])
  const abasArrasto = {
    onPointerDown: (e) => { if (e.pointerType === 'mouse' && e.button === 0) abasDrag.current = { x: e.clientX, s: e.currentTarget.scrollLeft, moveu: false } },
    onPointerMove: (e) => {
      const d = abasDrag.current
      if (!d) return
      const dx = e.clientX - d.x
      if (!d.moveu && Math.abs(dx) < 5) return
      if (!d.moveu) { d.moveu = true; try { e.currentTarget.setPointerCapture(e.pointerId) } catch (_) { /* ok */ } }
      e.currentTarget.scrollLeft = d.s - dx
    },
    onPointerUp: () => { setTimeout(() => { abasDrag.current = null }, 0) },
    onPointerLeave: () => { if (abasDrag.current && !abasDrag.current.moveu) abasDrag.current = null; else setTimeout(() => { abasDrag.current = null }, 0) },
    onClickCapture: (e) => { if (abasDrag.current && abasDrag.current.moveu) { e.preventDefault(); e.stopPropagation() } },
  }
  const abasRolar = (s) => { const el = abasEl.current; if (el) el.scrollBy({ left: s * Math.max(180, el.clientWidth * 0.7), behavior: 'smooth' }) }
  const abasSeta = (lado) => (
    <button type="button" aria-label={lado === 'e' ? 'Ver abas anteriores' : 'Ver mais abas'} onClick={() => abasRolar(lado === 'e' ? -1 : 1)}
      style={{ position: 'absolute', top: 1, bottom: 1, [lado === 'e' ? 'left' : 'right']: 1, width: 46, border: 'none', cursor: 'pointer', padding: '0 7px', zIndex: 2,
        display: 'flex', alignItems: 'center', justifyContent: lado === 'e' ? 'flex-start' : 'flex-end',
        background: `linear-gradient(${lado === 'e' ? 90 : 270}deg, #fff 55%, rgba(255,255,255,0))`, borderRadius: lado === 'e' ? '13px 0 0 13px' : '0 13px 13px 0' }}>
      <span style={{ width: 26, height: 26, borderRadius: 999, display: 'grid', placeItems: 'center', background: '#fff', boxShadow: '0 1px 4px rgba(15,23,42,.28)', color: '#0f172a', fontSize: 18, fontWeight: 800, lineHeight: 1 }}>{lado === 'e' ? '‹' : '›'}</span>
    </button>
  )
  const [muralAberto, setMuralAberto] = useState({})   // 02/11: grupos do mural abrem na setinha
  const [confIndef, setConfIndef] = useState(null)     // id do indeferido esperando o 2o clique (confirmar aviso)
  const [protFiltro, setProtFiltro] = useState('falta') // 02/11: aba Protocolados
  const [cartaDe, setCartaDe] = useState(null)          // caso cujo envio da carta de protocolo esta sendo registrado
  const [cartaPrint, setCartaPrint] = useState(null)
  const [cartaSt, setCartaSt] = useState('')            // '' | 'conferindo' | 'gravando' | 'erro:...'
  const [pgPeriodo, setPgPeriodo] = useState('semana')
  const [pgTipo, setPgTipo] = useState('')
  const [busca, setBusca] = useState('')
  const [fResp, setFResp] = useState('')
  const [fBanco, setFBanco] = useState('')
  const [fTag, setFTag] = useState('')
  const [aberto, setAberto] = useState(null)
  const [modal, setModal] = useState(null)
  const [resolver, setResolver] = useState(null)
  const [guiaDe, setGuiaDe] = useState(null)
  const [inssDe, setInssDe] = useState(null)
  const [arrastando, setArrastando] = useState(null)
  const [colHover, setColHover] = useState(null)
  const [mes, setMes] = useState(() => hojeISO().slice(0, 7))
  const [verFechados, setVerFechados] = useState(false)
  const [verResolvidas, setVerResolvidas] = useState(false)
  const [pendGrupo, setPendGrupo] = useState('')   // 09/11 (Bruno): uma aba so de Pendencias, com 4 grupos

  const carregar = useCallback(async () => {
    const reqs = [supabase.rpc('posdef_lista')]
    if (!soLeitura) reqs.push(supabase.rpc('posdef_inss_lista'), supabase.rpc('posdef_pendencias_lista'), supabase.rpc('posdef_resultados_inss'))
    const [l, i, p, r] = await Promise.all(reqs)
    if (l.error) mostrar('Erro ao carregar: ' + l.error.message, 'erro')
    // 03/11 (Bruno): antes do EXTRATO DE PAGAMENTO nao existe data de pagamento — a que veio do Protocolo/carta
    // e previsao. Sem o extrato o caso nao entra em "recebe hoje/amanha", atrasado nem inadimplente.
    setLista((Array.isArray(l.data) ? l.data : []).map(c => (!c.extrato_em && ['deferido', 'carta', 'extrato', 'prevsempre'].includes(c.etapa) && c.data_pagamento)
      ? { ...c, data_pagamento_previsao: c.data_pagamento, data_pagamento: null } : c).map(etapaVirtualPD))
    if (i) setInss(Array.isArray(i.data) ? i.data : [])
    if (p) setPends(Array.isArray(p.data) ? p.data : [])
    if (r) setResultados(Array.isArray(r.data) ? r.data : [])
  }, [mostrar, soLeitura])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { const t = setInterval(carregar, 60000); return () => clearInterval(t) }, [carregar])
  useEffect(() => {
    const f = (e) => { if (e.key === 'Escape') { if (inssDe) setInssDe(null); else if (!modal && !resolver && !guiaDe) setAberto(null) } }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [modal, resolver, guiaDe, inssDe])

  const responsaveis = useMemo(() => [...new Set([...(lista || []), ...inss, ...pends].flatMap(c => c.responsaveis || []))].sort(), [lista, inss, pends])
  const bancos = useMemo(() => [...new Set((lista || []).map(c => c.banco).filter(Boolean))].sort(), [lista])

  const casa = useCallback((c) => {
    const q = busca.trim().toLowerCase()
    const qd = soDig(busca)
    if (q && !(String(c.nome || '').toLowerCase().includes(q) || (qd.length >= 3 && String(c.cpf || '').includes(qd)) || (qd.length >= 4 && soDig(c.telefone).includes(qd)))) return false
    if (fResp && !(c.responsaveis || []).includes(fResp)) return false
    return true
  }, [busca, fResp])

  const filtrada = useMemo(() => (lista || []).filter(c => {
    if (!casa(c)) return false
    if (fBanco && c.banco !== fBanco) return false
    if (fTag === 'prevsempre' && !c.prevsempre) return false
    if (fTag === 'honorario' && c.prevsempre_honorario_auto !== true) return false
    if (fTag === 'normal' && c.prevsempre_honorario_auto === true) return false
    if (fTag === 'inadimplente' && !inadimplente(c)) return false
    return true
  }), [lista, casa, fBanco, fTag])
  const inssF = useMemo(() => inss.filter(casa), [inss, casa])
  const pendsF = useMemo(() => pends.filter(casa), [pends, casa])
  // 03/11 (Bruno): exigencia do INSS tem aba propria no Acompanhamento, separada das pendencias
  const ehExig = (p) => p.tipo === 'exigencia_inss' || p.categoria === 'exigencia_inss'   // 05/11: exigencia de complementacao de guia continua aqui
  const resultadosF = useMemo(() => resultados.filter(casa), [resultados, casa])

  const hoje = hojeISO()
  const amanha = somaDias(hoje, 1)
  const depois = somaDias(hoje, 2)
  const fimSemana = somaDias(hoje, 6)
  const noPeriodoAnot = (c, per) => {
    if (per === 'todos') return true
    const d = diaBR(dataAnotacao(c))
    if (!d) return false
    if (per === 'hoje') return d === hoje
    if (per === 'ontem') return d === somaDias(hoje, -1)
    if (per === 'semana') { const dow = new Date(hoje + 'T12:00:00').getDay(); return d >= somaDias(hoje, -((dow + 6) % 7)) && d <= hoje }
    if (per === 'mes') return d.slice(0, 7) === hoje.slice(0, 7) && d <= hoje
    return true
  }

  const agenda = useMemo(() => {
    const itens = []
    filtrada.forEach(c => itensAgenda(c).forEach(it => itens.push({ ...it, c })))
    // pendencia com data combinada entra na agenda
    pendsF.filter(p => p.status !== 'resolvida' && p.prazo).forEach(p => itens.push({ tipo: 'pendencia', data: p.prazo, texto: `${catPend(p.categoria).rot}: ${p.descricao}`, c: p, pend: p }))
    const ord = (a, b) => String(a.data).localeCompare(String(b.data)) || (a.tipo === 'pagamento' ? -1 : 1)
    return {
      atrasados: itens.filter(i => i.data < hoje).sort(ord),
      hoje: itens.filter(i => i.data === hoje).sort(ord),
      amanha: itens.filter(i => i.data === amanha).sort(ord),
      depois: itens.filter(i => i.data === depois).sort(ord),
      semana: itens.filter(i => i.data > depois && i.data <= somaDias(hoje, 7)).sort(ord),
      futuro: itens.filter(i => i.data > somaDias(hoje, 7)).sort(ord),
    }
  }, [filtrada, pendsF, hoje, amanha, depois])

  // inadimplencia: conta no MES DA DATA AGENDADA do pagamento (regra do Bruno, 29/10)
  const porMes = useMemo(() => {
    const m = {}
    filtrada.filter(c => c.data_pagamento || c.etapa === 'baixado').forEach(c => {
      const k = mesDe(c); if (!k) return
      const r = m[k] || (m[k] = { mes: k, agendados: 0, pagos: 0, emDia: 0, inad: 0, aberto: 0, honor: 0 })
      if (c.etapa === 'cancelado') return
      r.agendados++
      if (c.etapa === 'baixado') {
        r.pagos++; r.honor += Number(c.honorario_valor || 0)
        if (!c.data_pagamento || !c.pago_em || diasApos(c.data_pagamento) === null || (new Date(c.pago_em + 'T12:00:00') - new Date(c.data_pagamento + 'T12:00:00')) / 86400000 <= DIAS_INADIMPLENTE) r.emDia++
      } else if (inadimplente(c)) r.inad++
      else r.aberto++
    })
    return m
  }, [filtrada])
  const mesAtual = hoje.slice(0, 7)
  const rm = porMes[mesAtual] || { pagos: 0, inad: 0, honor: 0 }
  const taxa = (r) => ((r.pagos + r.inad) ? Math.round((r.inad / (r.pagos + r.inad)) * 100) : 0)

  const conta = useMemo(() => ({
    semCarta: filtrada.filter(c => (c.etapa === 'extrato' || c.etapa === 'carta') && extratoLiberado(c)).length,   // 03/11: so o que ja passou dos 7 dias
    extratoEspera: filtrada.filter(c => (c.etapa === 'extrato' || c.etapa === 'carta') && !extratoLiberado(c)).length,
    amanha: filtrada.filter(c => ESPERANDO.includes(c.etapa) && c.data_pagamento === amanha).length,
    semana: filtrada.filter(c => ESPERANDO.includes(c.etapa) && c.data_pagamento >= hoje && c.data_pagamento <= fimSemana).length,
    atrasados: filtrada.filter(atrasado).length,
    pendAbertas: pendsF.filter(pendAbertaAtiva).length,   // 09/11: o mesmo numero do Protocolo
  }), [filtrada, pendsF, hoje, amanha, fimSemana])

  const abrirAcao = (caso, acao, inicial) => setModal({ caso, acao, inicial })
  function soltar(col) {
    const c = (lista || []).find(x => x.id === arrastando)
    setArrastando(null); setColHover(null)
    if (!c || colunaDe(c) === col) return
    if (c.pode_agir === false) { mostrar('Só o responsável atualiza este caso.', 'erro'); return }
    const [acao, inicial] = acaoDoDropPD(c, col)
    if (acao === '__auto') { mostrar('"Pagamento atrasado" é automático: entra quando passa a data do pagamento.', 'erro'); return }
    if (acao) abrirAcao(c, acao, inicial)
    else mostrar('Esse movimento não existe — abra o card e use os botões.', 'erro')
  }

  // ------------------------------------------------------------ pecas
  const kpi = ({ rot, n, sub, cor, icone, onClick }) => (
    <button key={rot} onClick={onClick} style={{ ...card, padding: '14px 16px', textAlign: 'left', cursor: onClick ? 'pointer' : 'default', fontFamily: 'inherit', position: 'relative', overflow: 'hidden', minWidth: 0 }}>
      <div style={{ position: 'absolute', right: -14, top: -14, width: 70, height: 70, borderRadius: 999, background: hexA(cor, 0.09) }} />
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: cores.suave }}>{icone} {rot}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: cor, lineHeight: 1.1, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{lista ? n : '—'}</div>
      {sub && <div style={{ fontSize: 12, color: cores.suave, marginTop: 2 }}>{sub}</div>}
    </button>
  )

  const cartao = (c) => {
    const col = colunaDe(c)
    const et = etapaPD(col)
    const dias = diasDesde(c.etapa_desde)
    const dPag = c.data_pagamento ? -diasApos(c.data_pagamento) : null
    const pagAtivo = ESPERANDO.includes(c.etapa)
    const arrasta = !isMobile && !soLeitura && c.pode_agir !== false
    const gv = c.etapa !== 'cancelado' ? guiaDaVez(c) : null
    const prog = gv ? progressoGuia(c, gv) : null
    return (
      <div key={c.id} draggable={arrasta}
        onDragStart={(e) => { e.dataTransfer.setData('text/plain', c.id); e.dataTransfer.effectAllowed = 'move'; setArrastando(c.id) }}
        onDragEnd={() => { setArrastando(null); setColHover(null) }}
        onClick={() => setAberto(c.id)} className="kr-cartao"
        style={{ minWidth: 0, background: vermelho48(c) ? '#fff5f5' : '#fff', borderRadius: 14, border: `1px solid ${vermelho48(c) ? hexA(cores.perigo, 0.55) : c.prevsempre ? hexA(AZUL_PREV, 0.35) : cores.cardBorda}`, borderLeft: vermelho48(c) ? `4px solid ${cores.perigo}` : c.prevsempre ? `4px solid ${AZUL_PREV}` : `1px solid ${cores.cardBorda}`, padding: 12, boxShadow: arrastando === c.id ? sombras.cardHover : '0 1px 2px rgba(15,23,42,.05)', cursor: arrasta ? 'grab' : 'pointer', opacity: arrastando === c.id ? 0.55 : 1, transition: 'box-shadow .15s, transform .15s' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ width: 34, height: 34, borderRadius: 11, background: hexA(et.cor, 0.12), color: et.cor, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 12.5, flexShrink: 0 }}>{iniciais(c.nome)}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 750, color: cores.texto, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{c.nome || 'Sem nome'}</div>
            <div style={{ fontSize: 11.5, color: cores.suave, marginTop: 2 }}>{soLeitura ? (c.vendedora_nome || '') : ((c.responsaveis || []).join(', ') || '—')}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}><Tags c={c} /></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 11.5, color: cores.suave, gap: 6 }}>
          <span style={{ fontWeight: pagAtivo && dPag != null && dPag <= 1 ? 800 : 500, color: pagAtivo && dPag != null ? (dPag < 0 ? cores.perigo : dPag <= 1 ? '#d97706' : cores.suave) : cores.suave }}>
            {c.etapa === 'baixado' ? `🤝 pagou ${fmtData(c.pago_em)}`
              : pagAtivo && c.data_pagamento ? `💰 ${fmtData(c.data_pagamento)}${dPag === 0 ? ' · HOJE' : dPag === 1 ? ' · amanhã' : ''}`
              : c.etapa === 'deferido' && !c.cliente_avisada_em ? '📣 avisar cliente'
              : `há ${dias} dia${dias === 1 ? '' : 's'}`}
          </span>
          <span style={{ whiteSpace: 'nowrap' }}>{bancoCurto(c.banco)}</span>
        </div>
        {c.proxima_atividade && <div style={{ marginTop: 7, fontSize: 11.5, color: '#0f766e', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📅 {fmtData(c.proxima_atividade_em)} · {c.proxima_atividade}</div>}
        {vermelho48(c) && <div style={{ marginTop: 6, fontSize: 11.5, fontWeight: 800, color: cores.perigo }}>⏰ passou de 48h{c.etapa === 'extrato' || c.etapa === 'carta' ? ' — ligar no INSS' : ` · há ${txtHoras(horasDesde(c.etapa_desde))}`}</div>}
        {['extrato', 'carta'].includes(c.etapa) && extratoLiberado(c) && !vermelho48(c) && txtExtrato(c) && <div style={{ marginTop: 6, fontSize: 11.5, fontWeight: 700, color: '#0d9488' }}>🧾 {txtExtrato(c)}</div>}
        {gv && prog && prog.feitos < prog.total && (
          <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: GUIAS[gv].cor }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>📩 {GUIAS[gv].titulo}</span>
            <span style={{ marginLeft: 'auto', flexShrink: 0, background: hexA(GUIAS[gv].cor, 0.12), borderRadius: 999, padding: '1px 8px' }}>{prog.feitos}/{prog.total}</span>
          </div>
        )}
        {inadimplente(c) && !(c.conversas || []).includes('inadimplente') && <div style={{ marginTop: 6, fontSize: 11.5, fontWeight: 800, color: cores.perigo }}>📎 falta anexar a conversa</div>}
      </div>
    )
  }

  const selectSt = { padding: '9px 10px', borderRadius: 11, border: `1px solid ${hexA('#0f172a', 0.12)}`, fontSize: 13, background: '#fff' }
  const filtroPos = ['pagamentos', 'agenda', 'funil', 'calendario', 'lista', 'inadimplencia'].includes(aba)
  const filtros = (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 0 }}>
        <span style={{ position: 'absolute', left: 11, top: 9, color: cores.suave, fontSize: 14 }}>⌕</span>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome, CPF ou telefone"
          style={{ width: '100%', padding: '9px 12px 9px 30px', borderRadius: 11, border: `1px solid ${hexA('#0f172a', 0.12)}`, fontSize: 13.5, boxSizing: 'border-box', background: '#fff' }} />
      </div>
      {responsaveis.length > 1 && !soLeitura && (
        <select value={fResp} onChange={e => setFResp(e.target.value)} style={selectSt}>
          <option value="">Todos os responsáveis</option>
          {responsaveis.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      )}
      {filtroPos && bancos.length > 0 && (
        <select value={fBanco} onChange={e => setFBanco(e.target.value)} style={selectSt}>
          <option value="">Todos os bancos</option>
          {bancos.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      )}
      {filtroPos && (
        <select value={fTag} onChange={e => setFTag(e.target.value)} style={{ ...selectSt, ...(fTag ? { border: `1.5px solid ${AZUL_PREV}`, color: AZUL_PREV, fontWeight: 700 } : {}) }}>
          <option value="">Todas as etiquetas</option>
          <option value="prevsempre">Só PrevSempre</option>
          <option value="honorario">Honorário automático</option>
          <option value="normal">Acompanhamento normal</option>
          <option value="inadimplente">Inadimplentes</option>
        </select>
      )}
      {(busca || fResp || fBanco || fTag) && <button onClick={() => { setBusca(''); setFResp(''); setFBanco(''); setFTag('') }} style={{ ...btn(cores.perigo, false), padding: '8px 11px', fontSize: 12 }}>✕ Limpar filtros</button>}
    </div>
  )

  // ------------------------------------------------------------ agenda
  const linhaAgenda = (it, i) => {
    const c = it.c
    const t = TIPO_AGENDA[it.tipo]
    const wa = telWa(c.telefone)
    const ehPend = it.tipo === 'pendencia'
    const acaoRapida = ehPend ? null : it.tipo === 'pagamento' ? (c.etapa === 'orientacao_prev' ? 'orientar_prev' : c.etapa === 'prevsempre' ? 'prevsempre' : 'cliente_pagou') : it.tipo === 'avisar' ? 'avisar_cliente' : it.tipo === 'sem_carta' ? 'carta' : it.tipo === 'conversa' ? 'conversa_inadimplente' : 'atividade_feita'
    const cfg = acaoRapida ? ACOES_PD[acaoRapida] : null
    const podeAgir = !soLeitura && !ehPend && c.pode_agir !== false
    return (
      <div key={(c.id || '') + it.tipo + i} className="kr-linha" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderTop: i ? `1px solid ${cores.cardBorda}` : 'none', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
        <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 4, background: c.prevsempre ? AZUL_PREV : t.cor, flexShrink: 0 }} />
        <div onClick={() => (ehPend ? setAba('pendencias') : setAberto(c.id))} style={{ flex: '1 1 220px', minWidth: 0, cursor: 'pointer' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip cor={t.cor} forte>{t.icone} {t.r}</Chip>
            <span style={{ fontSize: 14, fontWeight: 750, color: cores.texto }}>{c.nome}</span>
            {!ehPend && <Tags c={c} />}
          </div>
          <div style={{ fontSize: 12.5, color: cores.suave, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isMobile ? 'normal' : 'nowrap' }}>
            {it.data && it.data < hoje && <b style={{ color: cores.perigo }}>{fmtData(it.data)} · </b>}
            {it.texto}{c.valor_beneficio && it.tipo === 'pagamento' ? ` · ${reais(c.valor_beneficio)}` : ''} · {fmtTel(c.telefone)} · {(c.responsaveis || []).join(', ')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {!ehPend && guiasDoCaso(c).length > 0 && <button title="Mensagens prontas desta etapa" onClick={() => setGuiaDe(c)} style={{ ...btn('#16a34a', false), padding: '6px 9px', fontSize: 12 }}>💬 Mensagens</button>}
          {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" style={{ ...btn('#16a34a', false), padding: '6px 9px', fontSize: 12, textDecoration: 'none' }}>WhatsApp</a>}
          {ehPend && <button onClick={() => setAba('pendencias')} style={{ ...btn('#b45309'), padding: '6px 10px', fontSize: 12 }}>📌 Resolver</button>}
          {podeAgir && cfg && <button onClick={() => abrirAcao(c, acaoRapida)} style={{ ...btn(cfg.cor), padding: '6px 10px', fontSize: 12 }}>{cfg.icone} {acaoRapida === 'cliente_pagou' ? 'Pagou' : acaoRapida === 'prevsempre' ? 'PrevSempre' : acaoRapida === 'avisar_cliente' ? 'Avisei' : acaoRapida === 'carta' ? 'Lançar carta' : acaoRapida === 'conversa_inadimplente' ? 'Anexar conversa' : 'Feito'}</button>}
        </div>
      </div>
    )
  }
  const blocoAgenda = (titulo, itens, cor, vazio, sub) => (
    <div style={{ ...card, padding: 0, overflow: 'hidden', border: itens.length && cor === cores.perigo ? `1.5px solid ${hexA(cores.perigo, 0.4)}` : card.border }}>
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8, background: hexA(cor, 0.06), borderBottom: `1px solid ${cores.cardBorda}` }}>
        <span style={{ width: 9, height: 9, borderRadius: 999, background: cor, boxShadow: `0 0 0 4px ${hexA(cor, 0.15)}` }} />
        <span style={{ fontSize: 14, fontWeight: 800, color: cores.texto }}>{titulo}</span>
        {sub && <span style={{ fontSize: 12, color: cores.suave }}>{sub}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 800, color: cor, background: hexA(cor, 0.12), borderRadius: 999, padding: '1px 10px' }}>{itens.length}</span>
      </div>
      {itens.length ? itens.map(linhaAgenda) : <div style={{ padding: '16px 14px', fontSize: 13, color: cores.suave }}>{vazio}</div>}
    </div>
  )
  const agendaView = (
    <div style={{ display: 'grid', gap: 14 }}>
      {agenda.atrasados.length > 0 && blocoAgenda('Atrasados', agenda.atrasados, cores.perigo, '', 'pagamento que passou do dia, atividade vencida, pendência vencida ou cliente ainda não avisada')}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0,1fr))', gap: 14, alignItems: 'start' }}>
        {blocoAgenda('Hoje', agenda.hoje, '#d97706', 'Nada para hoje.', `${diaSemana(hoje)} ${fmtData(hoje)}`)}
        {blocoAgenda('Amanhã', agenda.amanha, '#7c3aed', 'Nada para amanhã.', `${diaSemana(amanha)} ${fmtData(amanha)}`)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0,1fr))', gap: 14, alignItems: 'start' }}>
        {blocoAgenda('Depois de amanhã', agenda.depois, '#2563eb', 'Nada agendado.', `${diaSemana(depois)} ${fmtData(depois)}`)}
        {blocoAgenda('Próximos 7 dias', agenda.semana, '#64748b', 'Nada nos próximos dias.')}
      </div>
      {agenda.futuro.length > 0 && blocoAgenda('Mais adiante', agenda.futuro, '#94a3b8', '')}
      {(() => {
        const semData = filtrada.filter(c => c.etapa === 'carta' && !c.proxima_atividade_em)
        return semData.length > 0 && blocoAgenda('Aguardando carta de concessão (sem atividade agendada)', semData.map(c => ({ tipo: 'sem_carta', data: '', texto: `aguardando carta há ${diasDesde(c.etapa_desde)} dia(s) — agende uma cobrança`, c })), '#0891b2', '')
      })()}
    </div>
  )

  // ------------------------------------------------------------ funil
  const funil = (
    <div style={{ overflowX: 'auto', paddingBottom: 8, margin: '0 -4px' }}>
      <div style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: isMobile ? '82vw' : 'minmax(225px, 1fr)', gap: 12, padding: '0 4px', minWidth: isMobile ? 'auto' : (COLUNAS_PD.length + (soLeitura ? 0 : 2)) * 225 }}>
        {!soLeitura && COLUNAS_INSS.map(col => {
          const itens = inssF.filter(c => col.etapas.includes(c.etapa))
          return (
            <div key={col.k} style={{ background: hexA(col.cor, 0.04), borderRadius: 18, padding: 10, border: `1.5px dashed ${hexA(col.cor, 0.3)}`, minHeight: 420, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px 2px' }}>
                <span style={{ width: 9, height: 9, borderRadius: 999, background: col.cor, boxShadow: `0 0 0 4px ${hexA(col.cor, 0.15)}` }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: cores.texto, flex: 1 }}>{col.icone} {col.label}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: col.cor, background: hexA(col.cor, 0.12), borderRadius: 999, padding: '1px 9px' }}>{itens.length}</span>
              </div>
              <div style={{ fontSize: 11.5, color: cores.suave, padding: '0 4px' }}>🔒 {col.sub}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 9, alignContent: 'start', overflowY: 'auto', maxHeight: 'calc(100vh - 330px)', minHeight: 60, paddingRight: 2 }}>
                {itens.map(c => {
                  const e = ETAPAS_INSS[c.etapa] || {}
                  const d = c.data_protocolo && col.k === 'inss_analise' ? diasApos(c.data_protocolo) : diasDesde(c.etapa_desde)
                  return (
                    <div key={c.id} onClick={() => setInssDe(c)} className="kr-cartao" style={{ minWidth: 0, background: '#fff', borderRadius: 14, border: `1px solid ${cores.cardBorda}`, padding: 12, cursor: 'pointer', boxShadow: '0 1px 2px rgba(15,23,42,.05)' }}>
                      <div style={{ fontSize: 13.5, fontWeight: 750, color: cores.texto, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{c.nome || 'Sem nome'}</div>
                      <div style={{ fontSize: 11.5, color: cores.suave, marginTop: 2 }}>{(c.responsaveis || []).join(', ') || c.vendedora_nome || '—'}</div>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 7 }}>
                        {c.etapa !== col.etapas[0] && <Chip cor={e.cor}>{e.icone} {e.rot}</Chip>}
                        {c.pend_abertas > 0 && <Chip cor="#b45309">📌 {c.pend_abertas}</Chip>}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 7, fontSize: 11.5, color: cores.suave, gap: 6 }}>
                        <span>{col.k === 'inss_analise' ? `em análise há ${d ?? '?'}d` : `há ${d ?? '?'} dia${d === 1 ? '' : 's'}`}</span>
                        {c.protocolo_termo_url && <span style={{ fontWeight: 800, color: '#6d28d9' }}>📄 carta</span>}
                      </div>
                    </div>
                  )
                })}
                {itens.length === 0 && <div style={{ fontSize: 12.5, color: cores.suave, textAlign: 'center', padding: '22px 8px', border: `1.5px dashed ${hexA('#0f172a', 0.1)}`, borderRadius: 14 }}>Nenhum caso</div>}
              </div>
            </div>
          )
        })}
        {COLUNAS_PD.map(k => {
          const et = etapaPD(k)
          let itens = filtrada.filter(c => colunaDe(c) === k)
          if (k === 'baixado' && !verFechados) itens = itens.filter(c => diasDesde(c.baixa_em) <= 30)
          itens = itens.sort((a, b) => (['aguardando_pagamento', 'prevsempre', 'atrasado'].includes(k))
            ? String(a.data_pagamento || '9').localeCompare(String(b.data_pagamento || '9'))
            : new Date(b.ultima_movimentacao_em) - new Date(a.ultima_movimentacao_em))
          const alvo = arrastando && colHover === k
          return (
            <div key={k}
              onDragOver={e => { if (arrastando) { e.preventDefault(); setColHover(k) } }}
              onDragLeave={() => setColHover(h => (h === k ? null : h))}
              onDrop={e => { e.preventDefault(); soltar(k) }}
              style={{ background: alvo ? hexA(et.cor, 0.09) : k === 'atrasado' && itens.length ? hexA(cores.perigo, 0.04) : 'rgba(241,245,249,.75)', borderRadius: 18, padding: 10, border: `1.5px ${alvo ? 'dashed' : 'solid'} ${alvo ? et.cor : 'rgba(15,23,42,.05)'}`, minHeight: 420, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px 2px' }}>
                <span style={{ width: 9, height: 9, borderRadius: 999, background: et.cor, boxShadow: `0 0 0 4px ${hexA(et.cor, 0.15)}` }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: cores.texto, flex: 1 }}>{et.label}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: et.cor, background: hexA(et.cor, 0.12), borderRadius: 999, padding: '1px 9px' }}>{itens.length}</span>
              </div>
              {k === 'atrasado' && <div style={{ fontSize: 11.5, color: cores.suave, padding: '0 4px' }}>Entra sozinho quando passa a data. Mais de {DIAS_INADIMPLENTE} dias = inadimplente.</div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 9, alignContent: 'start', overflowY: 'auto', maxHeight: 'calc(100vh - 330px)', minHeight: 60, paddingRight: 2 }}>
                {itens.map(cartao)}
                {itens.length === 0 && <div style={{ fontSize: 12.5, color: cores.suave, textAlign: 'center', padding: '22px 8px', border: `1.5px dashed ${hexA('#0f172a', 0.1)}`, borderRadius: 14 }}>{arrastando ? 'Solte aqui' : 'Nenhum caso'}</div>}
              </div>
            </div>
          )
        })}
      </div>
      {!isMobile && !soLeitura && <div style={{ fontSize: 12, color: cores.suave, marginTop: 10 }}>Arraste o card para a próxima etapa — o formulário abre pedindo o que é obrigatório. Banco Mercantil vai sozinho para a PrevSempre. Clique no card para abrir a ficha.</div>}
      <label style={{ fontSize: 12.5, color: cores.suave, display: 'inline-flex', gap: 6, alignItems: 'center', marginTop: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={verFechados} onChange={e => setVerFechados(e.target.checked)} /> mostrar pagos antigos e cancelados
      </label>
      {verFechados && filtrada.some(c => c.etapa === 'cancelado') && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10, marginTop: 10 }}>
          {filtrada.filter(c => c.etapa === 'cancelado').map(cartao)}
        </div>
      )}
    </div>
  )

  // ------------------------------------------------------------ calendario do mes
  const calendario = (() => {
    const [a, m] = mes.split('-').map(Number)
    const primeiro = new Date(a, m - 1, 1)
    const ini = (primeiro.getDay() + 6) % 7
    const nDias = new Date(a, m, 0).getDate()
    const porDia = {}
    filtrada.forEach(c => itensAgenda(c).forEach(it => { if (it.data && it.data.startsWith(mes)) (porDia[it.data] = porDia[it.data] || []).push({ ...it, c }) }))
    const cels = []
    for (let i = 0; i < ini; i++) cels.push(null)
    for (let d = 1; d <= nDias; d++) cels.push(`${mes}-${String(d).padStart(2, '0')}`)
    const mudar = (n) => { const d = new Date(a, m - 1 + n, 1); setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) }
    const nm = primeiro.toLocaleDateString('pt-BR', { month: 'long' })
    const nomeMes = `${nm.charAt(0).toUpperCase()}${nm.slice(1)} de ${a}`
    return (
      <div style={{ ...card, padding: isMobile ? 10 : 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <button onClick={() => mudar(-1)} style={{ ...btn('#475569', false), padding: '6px 11px' }}>‹</button>
          <div style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 800, color: cores.texto }}>{nomeMes}</div>
          <button onClick={() => setMes(hoje.slice(0, 7))} style={{ ...btn('#475569', false), padding: '6px 11px', fontSize: 12 }}>Hoje</button>
          <button onClick={() => mudar(1)} style={{ ...btn('#475569', false), padding: '6px 11px' }}>›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: isMobile ? 3 : 6 }}>
          {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map(d => <div key={d} style={{ fontSize: 11, fontWeight: 800, color: cores.suave, textAlign: 'center', textTransform: 'uppercase' }}>{d}</div>)}
          {cels.map((iso, i) => {
            if (!iso) return <div key={'v' + i} />
            const its = porDia[iso] || []
            const eHoje = iso === hoje
            return (
              <div key={iso} style={{ minHeight: isMobile ? 54 : 96, borderRadius: 10, padding: isMobile ? 4 : 6, background: eHoje ? hexA('#d97706', 0.08) : iso < hoje ? '#fafbfc' : '#fff', border: `1px solid ${eHoje ? hexA('#d97706', 0.5) : cores.cardBorda}`, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: eHoje ? '#b45309' : cores.suave }}>{Number(iso.slice(8))}</div>
                {isMobile ? (its.length > 0 && <div style={{ marginTop: 3, fontSize: 11, fontWeight: 800, color: '#7c3aed' }}>● {its.length}</div>) : (
                  <div style={{ display: 'grid', gap: 3, marginTop: 4 }}>
                    {its.slice(0, 4).map((it, j) => (
                      <div key={j} onClick={() => setAberto(it.c.id)} title={`${it.c.nome} — ${it.texto}`} style={{ fontSize: 11, fontWeight: 700, cursor: 'pointer', borderRadius: 6, padding: '2px 5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#fff', background: inadimplente(it.c) && it.tipo === 'pagamento' ? cores.perigo : it.c.prevsempre ? AZUL_PREV : TIPO_AGENDA[it.tipo].cor }}>
                        {TIPO_AGENDA[it.tipo].icone} {primeiroNome(it.c.nome)}
                      </div>
                    ))}
                    {its.length > 4 && <div style={{ fontSize: 11, color: cores.suave }}>+{its.length - 4}</div>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12, fontSize: 12, color: cores.suave }}>
          {['pagamento', 'atividade', 'avisar'].map(k => <span key={k}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: TIPO_AGENDA[k].cor, marginRight: 5 }} />{TIPO_AGENDA[k].r}</span>)}
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: AZUL_PREV, marginRight: 5 }} />PrevSempre</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: cores.perigo, marginRight: 5 }} />Inadimplente</span>
        </div>
      </div>
    )
  })()

  // ------------------------------------------------------------ no INSS (so leitura)
  const inssView = (() => {
    const grupos = [
      ['problema', 'Com problema', cores.perigo, 'pendência, exigência ou indeferimento — veja a aba Pendências'],
      ['analise', 'Em análise no INSS', '#8b5cf6', 'protocolado, aguardando resposta'],
      ['fila', 'Na fila para protocolar', '#3b82f6', 'contrato assinado, a advogada ainda vai protocolar'],
    ]
    return (
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ ...card, padding: '11px 16px', fontSize: 13, color: cores.suave }}>🔒 <b style={{ color: cores.texto }}>Só acompanhamento.</b> Quem mexe nesta etapa é a advogada. Clique na cliente para ver a <b style={{ color: cores.texto }}>carta de protocolo</b> e a mensagem pronta para mandar a ela.</div>
        {grupos.map(([g, tit, cor, sub]) => {
          const itens = inssF.filter(c => (ETAPAS_INSS[c.etapa] || {}).grupo === g)
          return (
            <div key={g} style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8, background: hexA(cor, 0.06), borderBottom: `1px solid ${cores.cardBorda}`, flexWrap: 'wrap' }}>
                <span style={{ width: 9, height: 9, borderRadius: 999, background: cor, boxShadow: `0 0 0 4px ${hexA(cor, 0.15)}` }} />
                <span style={{ fontSize: 14, fontWeight: 800, color: cores.texto }}>{tit}</span>
                <span style={{ fontSize: 12, color: cores.suave }}>{sub}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 800, color: cor, background: hexA(cor, 0.12), borderRadius: 999, padding: '1px 10px' }}>{itens.length}</span>
              </div>
              {itens.length === 0 && <div style={{ padding: '14px', fontSize: 13, color: cores.suave }}>Nenhum.</div>}
              {itens.map((c, i) => {
                const e = ETAPAS_INSS[c.etapa]
                const d = diasDesde(c.etapa_desde)
                const dProt = c.data_protocolo ? diasApos(c.data_protocolo) : null
                return (
                  <div key={c.id} className="kr-linha" onClick={() => setInssDe(c)} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px', borderTop: i ? `1px solid ${cores.cardBorda}` : 'none', flexWrap: 'wrap', cursor: 'pointer' }}>
                    <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Chip cor={e.cor} forte>{e.icone} {e.rot}</Chip>
                        <span style={{ fontSize: 14, fontWeight: 750, color: cores.texto }}>{c.nome}</span>
                        {c.pend_abertas > 0 && <button onClick={(ev) => { ev.stopPropagation(); setAba('pendencias') }} style={{ border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 800, color: '#b45309', background: hexA('#b45309', 0.1), borderRadius: 999, padding: '2px 9px' }}>📌 {c.pend_abertas} pendência{c.pend_abertas > 1 ? 's' : ''}</button>}
                      </div>
                      <div style={{ fontSize: 12.5, color: cores.suave, marginTop: 3 }}>
                        {fmtCpf(c.cpf)} · venda: {c.vendedora_nome || '—'}{c.perfil ? ` · ${c.perfil}` : ''}
                        {c.etapa === 'exigencia' && c.exigencia_prazo ? <b style={{ color: cores.perigo }}> · prazo do INSS {fmtData(c.exigencia_prazo)}</b> : null}
                        {c.motivo && ['indeferido', 'recurso_indeferido'].includes(c.etapa) ? ` · ${c.motivo}` : ''}
                      </div>
                    </div>
                    {c.protocolo_termo_url && <button onClick={(ev) => { ev.stopPropagation(); abrirArquivo(c.protocolo_termo_url) }} style={{ ...btn('#6d28d9', false), padding: '6px 10px', fontSize: 12 }}>📄 Carta de protocolo</button>}
                    <div style={{ textAlign: 'right', fontSize: 12.5, color: cores.suave, minWidth: 140 }}>
                      {c.numero_protocolo && <div>nº <b style={{ color: cores.texto }}>{c.numero_protocolo}</b></div>}
                      <div style={{ fontWeight: 700, color: (g === 'fila' && d > 3) || (g === 'analise' && dProt > 45) ? cores.perigo : cores.texto }}>
                        {g === 'analise' && dProt != null ? `em análise há ${dProt} dia${dProt === 1 ? '' : 's'}` : `há ${d} dia${d === 1 ? '' : 's'} nesta etapa`}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    )
  })()

  // ------------------------------------------------------------ deferidos e indeferidos (02/11)
  const ehDeferido = (c) => ['deferido', 'recurso_deferido'].includes(c.etapa)
  // 02/11 (Bruno): uma aba para Deferidos e outra para Indeferidos (nao tudo junto)
  const resultadosView = (tipo) => {
    const chip = (val, set, atual, rot, n, cor) => {
      const on = atual === val
      return (
        <button key={val || 'x'} onClick={() => set(val)} style={{ padding: '8px 13px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: on ? 800 : 600, border: `1.5px solid ${on ? cor : hexA('#0f172a', 0.12)}`, background: on ? hexA(cor, 0.1) : '#fff', color: on ? cor : cores.texto, whiteSpace: 'nowrap' }}>
          {rot}{n != null ? <span style={{ marginLeft: 6, fontWeight: 800, color: cor }}>{n}</span> : null}
        </button>
      )
    }
    const doTipo = resultadosF.filter(c => (tipo === 'def') === ehDeferido(c))
    const nPer = (per) => doTipo.filter(c => noPeriodoAnot(c, per)).length
    const itens = doTipo.filter(c => noPeriodoAnot(c, rsPer))
    const grupos = [['def', '✅ Deferidos', cores.ok], ['indef', '⛔ Indeferidos', cores.perigo]].filter(([k]) => k === tipo)
    const abrir = (c) => {
      if (ehDeferido(c)) { const pd = (lista || []).find(x => x.caso_id === c.id); if (pd) { setAberto(pd.id); return } }
      setInssDe(c)
    }
    return (
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ ...card, padding: 14, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: cores.suave, marginRight: 4 }}>Subiu</span>
            {chip('hoje', setRsPer, rsPer, 'Hoje', nPer('hoje'), '#d97706')}
            {chip('ontem', setRsPer, rsPer, 'Ontem', nPer('ontem'), '#7c3aed')}
            {chip('semana', setRsPer, rsPer, 'Esta semana', nPer('semana'), '#2563eb')}
            {chip('mes', setRsPer, rsPer, 'Este mês', nPer('mes'), '#0891b2')}
            {chip('todos', setRsPer, rsPer, 'Todos', nPer('todos'), '#475569')}
          </div>
          <div style={{ fontSize: 12, color: cores.suave }}>A data é o dia em que o caso <b style={{ color: cores.texto }}>subiu como {tipo === 'def' ? 'deferido' : 'indeferido'}</b> aqui no CRM — o que subiu hoje aparece em <b style={{ color: cores.texto }}>Hoje</b>.</div>
        </div>
        {grupos.map(([g, tit, cor]) => {
          const lst = itens.filter(c => (g === 'def') === ehDeferido(c))
          return (
            <div key={g} style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8, background: hexA(cor, 0.06), borderBottom: `1px solid ${cores.cardBorda}` }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: cores.texto }}>{tit}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 800, color: cor, background: hexA(cor, 0.12), borderRadius: 999, padding: '1px 10px' }}>{lst.length}</span>
              </div>
              {lst.length === 0 && <div style={{ padding: '14px', fontSize: 13, color: cores.suave }}>Nenhum neste período.</div>}
              {lst.map((c, i) => { const pd = ehDeferido(c) ? (lista || []).find(x => x.caso_id === c.id) : null
                const verm = !!pd && pd.etapa === 'deferido' && vermelho48(pd)   // 03/11: ainda no Deferido ha mais de 48h
                return (
                <div key={c.id} className="kr-linha" onClick={() => abrir(c)} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px', borderTop: i ? `1px solid ${cores.cardBorda}` : 'none', flexWrap: 'wrap', cursor: 'pointer', ...(verm ? { background: hexA(cores.perigo, 0.07), boxShadow: `inset 4px 0 0 ${cores.perigo}` } : {}) }}>
                  <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Chip cor={cor} forte>{c.etapa === 'recurso_deferido' ? '🏆 Recurso deferido' : c.etapa === 'recurso_indeferido' ? '✖️ Recurso indeferido' : ehDeferido(c) ? '✅ Deferido' : '⛔ Indeferido'}</Chip>
                      <span style={{ fontSize: 14, fontWeight: 750, color: verm ? cores.perigo : cores.texto }}>{c.nome}</span>
                      {verm && <Chip cor={cores.perigo} forte>⏰ PASSOU DE 48H · há {txtHoras(horasDesde(pd.etapa_desde))}</Chip>}
                      {pd && pd.etapa !== 'deferido' && <Chip cor="#64748b">já avisada → {etapaPD(colunaDe(pd)).curto}</Chip>}
                    </div>
                    <div style={{ fontSize: 12.5, color: cores.suave, marginTop: 3 }}>
                      {fmtCpf(c.cpf)} · venda: {c.vendedora_nome || '—'}{c.perfil ? ` · ${c.perfil}` : ''}{(c.responsaveis || []).length ? ` · ${(c.responsaveis || []).join(', ')}` : ''}
                      {!ehDeferido(c) && c.motivo ? <b style={{ color: cores.perigo }}> · {c.motivo}</b> : null}
                    </div>
                  </div>
                  {c.resposta_inss_url && <button onClick={(ev) => { ev.stopPropagation(); abrirArquivo(c.resposta_inss_url) }} style={{ ...btn('#15803d', false), padding: '6px 10px', fontSize: 12 }}>📄 Carta do INSS</button>}
                  <div style={{ textAlign: 'right', fontSize: 12.5, color: cores.suave, minWidth: 150 }}>
                    <div style={{ fontWeight: 700, color: cores.texto }}>subiu {fmtDataHora(dataAnotacao(c))}</div>
                    {c.nb ? <div>NB {c.nb}</div> : c.numero_protocolo ? <div>prot. {c.numero_protocolo}</div> : null}
                  </div>
                </div>
              ) })}
            </div>
          )
        })}
      </div>
    )
  }

  // ------------------------------------------------------------ PROTOCOLADOS (02/11, Bruno)
  // O time baixa a CARTA DE PROTOCOLO, manda para a cliente e registra o envio com o PRINT da conversa.
  // A I.A confere o print (conversa real com a cliente mostrando a carta enviada); se nao confirmar,
  // BLOQUEIA e pede outro print. So depois grava (posdef_carta_protocolo_enviada).
  const lerBase64 = (arq) => new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok(String(r.result).replace(/^data:[^,]+,/, '')); r.onerror = () => erro(r.error); r.readAsDataURL(arq) })
  const botoesCarta = (c) => [
    c.protocolo_termo_url && <button key="b" onClick={() => abrirArquivo(c.protocolo_termo_url)} style={{ ...btn('#6d28d9', false), padding: '6px 9px', fontSize: 12 }}>📄 Baixar carta de protocolo</button>,
    <button key="t" onClick={async () => mostrar((await copiarTexto(msgProtocolo(c))) ? 'Mensagem copiada' : 'Não consegui copiar')} style={{ ...btn('#475569', false), padding: '6px 9px', fontSize: 12 }}>⧉ Mensagem</button>,
    telWa(c.telefone) && <a key="w" href={`https://wa.me/${telWa(c.telefone)}`} target="_blank" rel="noreferrer" style={{ ...btn('#16a34a', false), padding: '6px 9px', fontSize: 12, textDecoration: 'none' }}>WhatsApp</a>,
    c.carta_enviada_em
      ? <button key="v" onClick={() => abrirArquivo(c.carta_enviada_print)} title="ver o print" style={{ ...btn(cores.ok, false), padding: '6px 9px', fontSize: 12 }}>✅ Enviada {fmtDataHora(c.carta_enviada_em)}</button>
      : <button key="e" onClick={() => { setCartaDe(c); setCartaPrint(null); setCartaSt('') }} style={{ ...btn('#8b5cf6'), padding: '6px 10px', fontSize: 12 }}>✔ Enviei a carta</button>,
  ]
  async function registrarCarta() {
    const c = cartaDe
    if (!c || !cartaPrint) { setCartaSt('erro:Anexe o print da conversa com a cliente.'); return }
    if (!/^image\//.test(cartaPrint.type || '')) { setCartaSt('erro:O print precisa ser uma imagem (PNG ou JPG).'); return }
    if (cartaPrint.size > 5 * 1024 * 1024) { setCartaSt('erro:Imagem muito grande (máximo 5 MB).'); return }
    setCartaSt('conferindo')
    let veredito = ''
    try {
      // 03/11 (Bruno): menos rigida. Vale GRUPO criado com a cliente e envio feito por alguem da equipe
      // (consultora/vendedora): o telefone que aparece no print costuma ser de quem ENVIOU, nao da cliente.
      // O que prende o print a ESTA cliente e o NOME COMPLETO dela no documento enviado (protocolo nao e obrigatorio).
      const texto = `TAREFA (não é parecer): confira o PRINT anexado. Responda na PRIMEIRA linha apenas SIM ou NÃO e, na segunda linha, o motivo em uma frase curta.
SIM se o print mostrar uma conversa de WhatsApp (ou outro app de mensagens) — conversa direta OU GRUPO criado com a cliente — e nela aparecer o ENVIO da carta/comprovante de protocolo do INSS (PDF, imagem do comprovante ou mensagem com o número do protocolo ${c.numero_protocolo || ''}).
Quem envia normalmente é alguém da equipe da KR (consultora, vendedora, atendente), então o nome e o telefone que aparecem no print podem ser de quem ENVIOU. NÃO exija o telefone da cliente nem que a própria cliente apareça escrevendo.
OBRIGATÓRIO: o NOME COMPLETO da cliente (${c.nome || ''}) tem que aparecer no DOCUMENTO enviado — no nome do arquivo (ex.: PDF com o nome dela) ou escrito no próprio comprovante visível no print. Pequenas diferenças de acento ou maiúscula não importam. O nome do contato/grupo sozinho NÃO basta. Se o número do protocolo ${c.numero_protocolo || ''} aparecer, também vale, mas NÃO é obrigatório.
NÃO somente se: a imagem estiver claramente montada/editada, não for uma conversa de app de mensagens, o documento enviado for de OUTRA pessoa, o nome completo da cliente não aparecer no documento, ou não aparecer a carta/comprovante sendo enviado.`
      veredito = await perguntarIA({ caso: c, historico: [], texto, anexos: [{ nome: cartaPrint.name || 'print.png', media_type: cartaPrint.type, data: await lerBase64(cartaPrint) }] })
    } catch (e) { setCartaSt('erro:A I.A não conseguiu conferir agora: ' + String(e.message || e)); return }
    const primeira = String(veredito || '').replace(/[*_#>`]/g, '').trim().split('\n')[0].trim().toUpperCase()
    if (!primeira.startsWith('SIM')) {
      setCartaSt('erro:A I.A NÃO confirmou o print — mande outro print da conversa com a cliente mostrando a carta enviada.\n\n' + String(veredito || '').replace(/[*_#>`]/g, '').trim())
      return
    }
    setCartaSt('gravando')
    try {
      const caminho = await enviarArquivo(cartaPrint, c.cpf)
      const { data, error } = await supabase.rpc('posdef_carta_protocolo_enviada', { p_caso: c.id, p_print: caminho, p_ia: String(veredito).slice(0, 1000) })
      if (error || !data?.ok) { setCartaSt('erro:' + (error?.message || data?.erro || 'não gravou')); return }
    } catch (e) { setCartaSt('erro:' + String(e.message || e)); return }
    setCartaDe(null); setCartaPrint(null); setCartaSt('')
    mostrar(`${primeiroNome(c.nome) || 'Cliente'} · carta de protocolo registrada`)
    carregar()
  }
  const protocoladosView = () => {
    const todos = inssF.filter(c => ['protocolado', 'recurso'].includes(c.etapa))
    const falta = todos.filter(c => !c.carta_enviada_em)
    const enviadas = todos.filter(c => c.carta_enviada_em)
    const itens = (protFiltro === 'falta' ? falta : protFiltro === 'enviada' ? enviadas : todos)
      .slice().sort((a, b) => String(b.data_protocolo || '').localeCompare(String(a.data_protocolo || '')))
    const chip = (val, rot, n, cor) => {
      const on = protFiltro === val
      return <button key={val} onClick={() => setProtFiltro(val)} style={{ padding: '8px 13px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: on ? 800 : 600, border: `1.5px solid ${on ? cor : hexA('#0f172a', 0.12)}`, background: on ? hexA(cor, 0.1) : '#fff', color: on ? cor : cores.texto, whiteSpace: 'nowrap' }}>{rot} <span style={{ fontWeight: 800, color: cor }}>{n}</span></button>
    }
    return (
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ ...card, padding: 14, display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {chip('falta', '📨 Falta mandar a carta', falta.length, '#8b5cf6')}
            {chip('enviada', '✅ Carta enviada', enviadas.length, cores.ok)}
            {chip('todos', 'Todos', todos.length, '#475569')}
          </div>
          <div style={{ fontSize: 12, color: cores.suave }}>Baixe a <b style={{ color: cores.texto }}>carta de protocolo</b>, mande para a cliente e clique em <b style={{ color: cores.texto }}>Enviei a carta</b> com o print da conversa. A I.A confere o print antes de registrar.</div>
        </div>
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          {itens.length === 0 && <div style={{ padding: 18, fontSize: 13, color: cores.suave }}>Nada aqui.</div>}
          {itens.map((c, i) => {
            const d = c.data_protocolo ? diasApos(c.data_protocolo) : null
            return (
              <div key={c.id} className="kr-linha" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderTop: i ? `1px solid ${cores.cardBorda}` : 'none', flexWrap: 'wrap' }}>
                <div onClick={() => setInssDe(c)} style={{ flex: '1 1 260px', minWidth: 0, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Chip cor="#8b5cf6" forte>{c.etapa === 'recurso' ? '⚖️ Recurso' : '📨 Protocolado'}</Chip>
                    <span style={{ fontSize: 14, fontWeight: 750, color: cores.texto }}>{c.nome}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: cores.suave, marginTop: 3 }}>{fmtCpf(c.cpf)} · venda: {c.vendedora_nome || '—'} · nº {c.numero_protocolo || '—'}{c.data_protocolo ? ` · protocolado em ${fmtData(c.data_protocolo)}${d != null ? ` (há ${d} dia${d === 1 ? '' : 's'})` : ''}` : ''}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{botoesCarta(c)}</div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }
  const modalCarta = cartaDe && (
    <div onClick={() => !['conferindo', 'gravando'].includes(cartaSt) && setCartaDe(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', backdropFilter: 'blur(3px)', zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={ev => ev.stopPropagation()} style={{ ...card, width: '100%', maxWidth: 520, padding: 20, display: 'grid', gap: 12 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: cores.texto }}>📨 Carta de protocolo enviada</div>
        <div style={{ fontSize: 13.5, color: cores.texto }}><b>{cartaDe.nome}</b> · nº {cartaDe.numero_protocolo || '—'}</div>
        <div style={{ fontSize: 13, color: cores.suave }}>Anexe o <b style={{ color: cores.texto }}>print da conversa do WhatsApp</b> com a cliente mostrando a carta enviada. A I.A confere se é uma conversa real antes de registrar.</div>
        <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 700, color: cores.texto }}>
          Print da conversa (imagem)
          <input type="file" accept="image/png,image/jpeg,image/webp" disabled={['conferindo', 'gravando'].includes(cartaSt)} onChange={e => { setCartaPrint(e.target.files?.[0] || null); setCartaSt('') }} />
        </label>
        {cartaSt === 'conferindo' && <div style={{ fontSize: 13, color: cores.roxo, fontWeight: 700 }}>✦ A I.A está conferindo o print…</div>}
        {cartaSt === 'gravando' && <div style={{ fontSize: 13, color: cores.ok, fontWeight: 700 }}>Print confirmado. Gravando…</div>}
        {cartaSt.startsWith('erro:') && <div style={{ fontSize: 13, color: '#991b1b', background: hexA(cores.perigo, 0.08), border: `1px solid ${hexA(cores.perigo, 0.3)}`, borderRadius: 10, padding: '8px 10px', whiteSpace: 'pre-wrap' }}>{cartaSt.slice(5)}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => setCartaDe(null)} disabled={['conferindo', 'gravando'].includes(cartaSt)} style={btn('#475569', false)}>Cancelar</button>
          <button onClick={registrarCarta} disabled={!cartaPrint || ['conferindo', 'gravando'].includes(cartaSt)} style={{ ...btn('#8b5cf6'), opacity: !cartaPrint || ['conferindo', 'gravando'].includes(cartaSt) ? 0.55 : 1 }}>Conferir e registrar</button>
        </div>
      </div>
    </div>
  )

  // ------------------------------------------------------------ MURAL de inicio (02/11, Bruno)
  // Avisos do que importa hoje, cada grupo fechado (abre na setinha): deferimentos para avisar a cliente,
  // indeferimentos para avisar, exigencias do INSS, pagamentos de hoje, recebem amanha e atrasados.
  // "Avisei a cliente" do deferido e a MESMA acao do funil (avisar_cliente); a do indeferido grava um
  // evento no caso do Protocolo (posdef_indeferido_avisada). Avisou = sai do mural.
  async function indeferidoAvisado(c) {
    if (confIndef !== c.id) { setConfIndef(c.id); return }
    setConfIndef(null)
    const { data, error } = await supabase.rpc('posdef_indeferido_avisada', { p_caso: c.id, p_texto: null })
    if (error || !data?.ok) { mostrar('Não gravou: ' + (error?.message || data?.erro || 'erro'), 'erro'); return }
    mostrar(`${primeiroNome(c.nome) || 'Cliente'} · avisada do indeferimento`)
    carregar()
  }
  const muralView = () => {   // funcao (nao IIFE): usa linhaPagamento, declarada mais abaixo
    const base = filtrada.filter(c => ESPERANDO.includes(c.etapa) && c.data_pagamento)
    const ordPg = (a, b) => String(a.data_pagamento).localeCompare(String(b.data_pagamento)) || String(a.nome).localeCompare(String(b.nome))
    const subiuHoje = (c) => diaBR(c.etapa_desde) === hoje
    const defAvisar = filtrada.filter(c => c.etapa === 'deferido' && !c.cliente_avisada_em).sort((a, b) => new Date(b.etapa_desde || 0) - new Date(a.etapa_desde || 0))
    const indefAvisar = resultadosF.filter(c => !ehDeferido(c) && !c.cliente_avisada_em && (diasDesde(dataAnotacao(c)) ?? 0) <= 30).sort((a, b) => new Date(dataAnotacao(b) || 0) - new Date(dataAnotacao(a) || 0))
    // 05/11 (Bruno): no Inicio so as exigencias que a advogada registrou COM MOTIVO (complementacao de guia tem grupo proprio).
    // Resolveu -> vai para "Resolvidas · refazer" da advogada.
    const ordPrazo = (a, b) => String(a.exigencia_prazo || a.prazo || '9999').localeCompare(String(b.exigencia_prazo || b.prazo || '9999'))
    const exig = pendsF.filter(p => p.tipo === 'exigencia_inss' && p.subtipo && p.categoria !== 'complementacao_guia' && p.status !== 'resolvida' && !p.sinalizada_em).sort(ordPrazo)
    const guiaPend = pendsF.filter(p => p.categoria === 'complementacao_guia' && p.status !== 'resolvida' && !p.sinalizada_em).sort(ordPrazo)
    const sinalPend = podeResolver ? pendsF.filter(p => pendAbertaAtiva(p) && p.sinalizada_em).sort((a, b) => String(a.sinalizada_em).localeCompare(String(b.sinalizada_em))) : []   // 09/11
    // 06/11 (Bruno): no mural, o anexo da advogada vem antes dos botoes de resolver
    const botaoAnexoAdv = (p) => p.anexo_advogada && <button key="anx" onClick={() => abrirArquivo(p.anexo_advogada)} title="Documento anexado pela advogada no Protocolo" style={{ ...btn('#475569', false), padding: '6px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconeClipe /> Anexo da advogada</button>
    const botoesResolver = (p) => catPend(p.categoria).opcoes.map(o => (
      <button key={o.v} onClick={() => setResolver({ pend: p, opcao: o.v })} style={{ ...btn(o.negativa ? cores.perigo : o.andamento ? '#2563eb' : cores.ok, !!(o.negativa || o.andamento)), padding: '6px 10px', fontSize: 12 }}>{o.rot}</button>
    ))
    const prazoTxt = (p) => { const pz = p.exigencia_prazo || p.prazo; if (!pz) return ''; const d = -diasApos(pz); return <b style={{ color: d <= 3 ? cores.perigo : '#ea580c' }}> · prazo {fmtData(pz)}{d < 0 ? ` (venceu há ${-d}d)` : d === 0 ? ' (HOJE)' : ` (faltam ${d}d)`}</b> }
    const pgHoje = base.filter(c => c.data_pagamento === hoje).sort(ordPg)
    const orientPend = filtrada.filter(c => c.etapa === 'orientacao_prev').sort((a, b) => new Date(a.etapa_desde || 0) - new Date(b.etapa_desde || 0))   // 07/11
    const prevPend = filtrada.filter(c => c.etapa === 'prevsempre').sort((a, b) => new Date(a.etapa_desde || 0) - new Date(b.etapa_desde || 0))   // 03/11: mais antigo primeiro (48h)
    // 03/11 (Bruno): o extrato so sobe para cobrar 7 dias apos o deferimento
    const extratoTodos = filtrada.filter(c => c.etapa === 'extrato' || c.etapa === 'carta')
    const aguardExtrato = extratoTodos.filter(extratoLiberado).sort((a, b) => extratoLiberaEm(a).localeCompare(extratoLiberaEm(b)))
    const nExtratoEspera = extratoTodos.length - aguardExtrato.length
    const nVerm = (l) => l.filter(vermelho48).length
    const cartaFalta = inssF.filter(c => ['protocolado', 'recurso'].includes(c.etapa) && !c.carta_enviada_em).sort((a, b) => String(a.data_protocolo || '').localeCompare(String(b.data_protocolo || '')))
    const pgAmanha = base.filter(c => c.data_pagamento === amanha).sort(ordPg)
    const pgAtras = base.filter(c => c.data_pagamento < hoje).sort(ordPg)
    const linhaSimples = (c, i, { sub, acoes, onAbrir, novo, alerta }) => (
      <div key={c.id} className="kr-linha" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: i ? `1px solid ${cores.cardBorda}` : 'none', flexWrap: 'wrap', ...(alerta ? { background: hexA(cores.perigo, 0.07), boxShadow: `inset 4px 0 0 ${cores.perigo}` } : {}) }}>
        <div onClick={onAbrir} style={{ flex: '1 1 240px', minWidth: 0, cursor: onAbrir ? 'pointer' : 'default' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 750, color: alerta ? cores.perigo : cores.texto }}>{c.nome}</span>
            {alerta && <Chip cor={cores.perigo} forte>⏰ PASSOU DE 48H</Chip>}
            {novo && <Chip cor="#d97706" forte>NOVO HOJE</Chip>}
          </div>
          <div style={{ fontSize: 12.5, color: cores.suave, marginTop: 3 }}>{sub}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{acoes}</div>
      </div>
    )
    const waBtn = (c) => { const wa = telWa(c.telefone); return wa ? <a key="wa" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" style={{ ...btn('#16a34a', false), padding: '6px 9px', fontSize: 12, textDecoration: 'none' }}>WhatsApp</a> : null }
    const nIndefHoje = indefAvisar.filter(c => diaBR(dataAnotacao(c)) === hoje).length
    // 02/11 (Bruno): ordem do funil (protocolo, deferido, extrato, PrevSempre, pagamentos); indeferidos e exigencias no final
    // 04/11 (Bruno): carta de concessao recusada pela Maithe (PrevSempre) — o responsavel troca pelo sistema
    const cartaRec = filtrada.filter(c => c.carta_recusada_em).sort((a, b) => String(a.carta_recusada_em).localeCompare(String(b.carta_recusada_em)))
    const grupos = [
      { k: 'cartarec', icone: '⚠️', tit: 'Carta de concessão recusada — anexar a correta', cor: cores.perigo, itens: cartaRec, extra: 'a Maithe recusou a carta na PrevSempre',
        linha: (c, i) => linhaSimples(c, i, { onAbrir: () => setAberto(c.id),
          sub: <>{fmtCpf(c.cpf)} · venda: {c.vendedora_nome || '—'} · recusada {fmtDataHora(c.carta_recusada_em)}{c.carta_recusada_motivo ? <b style={{ color: cores.perigo }}> · {c.carta_recusada_motivo}</b> : null}{(c.responsaveis || []).length ? ` · ${c.responsaveis.join(', ')}` : ''}</>,
          acoes: [c.carta_concessao_url && <button key="v" onClick={() => abrirArquivo(c.carta_concessao_url)} style={{ ...btn('#475569', false), padding: '6px 9px', fontSize: 12 }}>📜 Carta atual</button>,
            c.pode_agir !== false && <button key="t" onClick={() => abrirAcao(c, 'trocar_carta')} style={{ ...btn(cores.perigo), padding: '6px 10px', fontSize: 12 }}>🔁 Trocar carta</button>] }) },
      { k: 'cartaprot', icone: '📨', tit: 'Carta de protocolo para mandar à cliente', cor: '#8b5cf6', itens: cartaFalta, extra: 'baixar a carta, mandar e anexar o print',
        linha: (c, i) => linhaSimples(c, i, { onAbrir: () => setInssDe(c),
          sub: <>{fmtCpf(c.cpf)} · venda: {c.vendedora_nome || '—'} · nº {c.numero_protocolo || '—'}{c.data_protocolo ? ` · protocolado em ${fmtData(c.data_protocolo)}` : ''}</>,
          acoes: botoesCarta(c) }) },
      { k: 'def', icone: '✅', tit: 'Deferimentos: avisar a cliente e anexar a carta de concessão', cor: cores.ok, itens: defAvisar,
        extra: [nVerm(defAvisar) ? `${nVerm(defAvisar)} passou de 48h` : null, defAvisar.filter(subiuHoje).length ? `${defAvisar.filter(subiuHoje).length} subiu hoje` : null].filter(Boolean).join(' · ') || null,
        linha: (c, i) => linhaSimples(c, i, { novo: subiuHoje(c), alerta: vermelho48(c), onAbrir: () => setAberto(c.id),
          sub: <>{fmtCpf(c.cpf)} · venda: {c.vendedora_nome || '—'} · deferido {fmtDataHora(c.etapa_desde)} · <b style={{ color: vermelho48(c) ? cores.perigo : cores.ok }}>há {txtHoras(horasDesde(c.etapa_desde))}</b>{(c.responsaveis || []).length ? ` · ${c.responsaveis.join(', ')}` : ''}</>,
          acoes: [<button key="m" onClick={() => setGuiaDe(c)} style={{ ...btn('#16a34a', false), padding: '6px 9px', fontSize: 12 }}>💬 Mensagens</button>, waBtn(c),
            c.pode_agir !== false && <button key="a" onClick={() => abrirAcao(c, 'avisar_cliente')} style={{ ...btn('#16a34a'), padding: '6px 10px', fontSize: 12 }}>📣 Avisei + carta de concessão</button>] }) },
      { k: 'extrato', icone: '🧾', tit: 'Ligar no INSS: data e valor do pagamento (7 dias após o deferimento)', cor: '#0d9488', itens: aguardExtrato,
        extra: [nVerm(aguardExtrato) ? `${nVerm(aguardExtrato)} passou de 48h` : 'a data real do pagamento', nExtratoEspera ? `${nExtratoEspera} esperando os 7 dias` : null].filter(Boolean).join(' · '),
        linha: (c, i) => { const h = horasExtratoLiberado(c)
          return linhaSimples(c, i, { alerta: vermelho48(c), onAbrir: () => setAberto(c.id),
            sub: <>{fmtCpf(c.cpf)} · {bancoCurto(c.banco) || 'banco?'}{c.prevsempre ? ' · PrevSempre ok' : ''} · deferido {c.data_deferimento ? fmtData(c.data_deferimento) : '—'}<b style={{ color: vermelho48(c) ? cores.perigo : '#0d9488' }}> · subiu {fmtDataHora(new Date(inicioCobrancaExtrato(c)).toISOString())}, há {txtHoras(h)}{vermelho48(c) ? ' — cobrar o extrato' : ''}</b></>,
            acoes: [<button key="m" onClick={() => setGuiaDe(c)} style={{ ...btn('#16a34a', false), padding: '6px 9px', fontSize: 12 }}>💬 Mensagens</button>,
              c.pode_agir !== false && <button key="e" onClick={() => abrirAcao(c, 'extrato')} style={{ ...btn('#0d9488'), padding: '6px 10px', fontSize: 12 }}>📞 Lançar data e valor</button>] }) } },
      { k: 'orient', icone: '📣', tit: 'Orientação PrevSempre: avisar a cliente do link e do débito automático', cor: '#b45309', itens: orientPend,
        extra: nVerm(orientPend) ? `${nVerm(orientPend)} passou de 48h` : 'obrigatório antes da PrevSempre (Maithe) · print do WhatsApp',
        linha: (c, i) => linhaSimples(c, i, { alerta: vermelho48(c), onAbrir: () => setAberto(c.id),
          sub: <>{fmtCpf(c.cpf)} · Mercantil{c.valor_beneficio ? ` · ${reais(c.valor_beneficio)}` : ''} · <b style={{ color: vermelho48(c) ? cores.perigo : '#b45309' }}>esperando orientação há {txtHoras(horasDesde(c.etapa_desde))}</b>{(c.responsaveis || []).length ? ` · ${c.responsaveis.join(', ')}` : ''}</>,
          acoes: [<button key="m" onClick={() => setGuiaDe(c)} style={{ ...btn('#16a34a', false), padding: '6px 9px', fontSize: 12 }}>💬 Mensagens</button>, waBtn(c),
            c.pode_agir !== false && <button key="o" onClick={() => abrirAcao(c, 'orientar_prev')} style={{ ...btn('#b45309'), padding: '6px 10px', fontSize: 12 }}>📣 Cliente orientada</button>] }) },
      { k: 'prev', icone: '🏦', tit: 'PrevSempre: abrir a conta e aceitar o débito automático', cor: AZUL_PREV, itens: prevPend,
        extra: nVerm(prevPend) ? `${nVerm(prevPend)} passou de 48h` : 'o responsável confirma conta aberta e débito',
        linha: (c, i) => { const d = c.data_pagamento ? -diasApos(c.data_pagamento) : null
          return linhaSimples(c, i, { alerta: vermelho48(c), onAbrir: () => setAberto(c.id),
            sub: <>{fmtCpf(c.cpf)} · Mercantil{c.valor_beneficio ? ` · ${reais(c.valor_beneficio)}` : ''} · <b style={{ color: vermelho48(c) ? cores.perigo : AZUL_PREV }}>na PrevSempre há {txtHoras(horasDesde(c.etapa_desde))}</b>{c.data_pagamento ? <> · cai {fmtData(c.data_pagamento)}{d != null ? (d < 0 ? ` (passou há ${-d}d)` : d === 0 ? ' (HOJE)' : ` (faltam ${d}d)`) : ''}</> : ''}{(c.responsaveis || []).length ? ` · ${c.responsaveis.join(', ')}` : ''}</>,
            acoes: [<button key="m" onClick={() => setGuiaDe(c)} style={{ ...btn('#16a34a', false), padding: '6px 9px', fontSize: 12 }}>💬 Mensagens</button>, waBtn(c),
              c.pode_agir !== false && <button key="p" onClick={() => abrirAcao(c, 'prevsempre')} style={{ ...btn(AZUL_PREV), padding: '6px 10px', fontSize: 12 }}>🏦 Confirmar PrevSempre</button>] }) } },
      { k: 'pghoje', icone: '💰', tit: 'Pagamentos de hoje', cor: '#d97706', itens: pgHoje, linha: linhaPagamento },
      { k: 'pgamanha', icone: '⏳', tit: 'Recebem amanhã', cor: '#7c3aed', itens: pgAmanha, extra: 'lembrar a cliente', linha: linhaPagamento },
      { k: 'pgatras', icone: '⏰', tit: 'Pagamentos atrasados', cor: cores.perigo, itens: pgAtras, extra: 'passou a data e não pagou', linha: linhaPagamento },
      { k: 'indef', icone: '⛔', tit: 'Indeferimentos para avisar a cliente', cor: cores.perigo, itens: indefAvisar, extra: nIndefHoje ? `${nIndefHoje} subiu hoje` : null,
        linha: (c, i) => linhaSimples(c, i, { novo: diaBR(dataAnotacao(c)) === hoje, onAbrir: () => setInssDe(c),
          sub: <>{fmtCpf(c.cpf)} · venda: {c.vendedora_nome || '—'} · indeferido {fmtDataHora(dataAnotacao(c))}{c.motivo ? <b style={{ color: cores.perigo }}> · {c.motivo}</b> : null}</>,
          acoes: [c.resposta_inss_url && <button key="c" onClick={() => abrirArquivo(c.resposta_inss_url)} style={{ ...btn('#475569', false), padding: '6px 9px', fontSize: 12 }}>📄 Carta</button>, waBtn(c),
            <button key="a" onClick={() => indeferidoAvisado(c)} style={{ ...btn(cores.perigo, confIndef === c.id), padding: '6px 10px', fontSize: 12 }}>{confIndef === c.id ? 'Confirmar: avisei' : '📣 Avisei a cliente'}</button>] }) },
      { k: 'exig', icone: '⚠️', tit: 'Exigências a resolver', cor: '#ea580c', itens: exig, extra: 'a advogada registrou o motivo — resolvendo, volta para ela refazer',
        linha: (p, i) => linhaSimples({ ...p, id: 'e' + p.id }, i, { novo: diaBR(p.aberta_em) === hoje, onAbrir: () => setAba('pendencias'),
          sub: <>{fmtCpf(p.cpf)} · venda: {p.vendedora_nome || '—'} · <b style={{ color: '#9a3412' }}>{rotMotivoExig(p.subtipo) || 'Exigência'}</b> · {String(p.descricao || '').slice(0, 90)}{String(p.descricao || '').length > 90 ? '…' : ''}{prazoTxt(p)}{p.status === 'avisado' && p.resolucao_data ? ` · combinado até ${fmtData(p.resolucao_data)}` : ''}</>,
          acoes: [botaoAnexoAdv(p), ...botoesResolver(p)] }) },
      // 09/11 (Bruno): o acompanhamento SINALIZOU — so Jessica/Sthefany dao a baixa
      { k: 'sinal', icone: '🔔', tit: 'Sinalizadas pelo acompanhamento — conferir e dar a baixa', cor: '#2563eb', itens: sinalPend, extra: 'só a Jessica e a Sthefany dão a baixa',
        linha: (p, i) => linhaSimples({ ...p, id: 's' + p.id }, i, { onAbrir: () => setAba('pendencias'),
          sub: <>{fmtCpf(p.cpf)} · {GRUPOS_PEND.find(g => g.k === grupoPend(p))?.rot} · sinalizado por <b>{p.sinalizada_por || '—'}</b> {fmtDataHora(p.sinalizada_em)} · {String(p.descricao || '').slice(0, 70)}</>,
          acoes: [botaoAnexoAdv(p), ...botoesResolver(p)] }) },
      // 05/11 (Bruno): complementacao de guia (antes do protocolo e exigencia do INSS). Pagou -> registra o valor.
      { k: 'guia', icone: '🧾', tit: 'Complementação de guia', cor: '#b45309', itens: guiaPend, extra: 'quando a cliente pagar, registre o valor',
        linha: (p, i) => linhaSimples({ ...p, id: 'g' + p.id }, i, { novo: diaBR(p.aberta_em) === hoje, onAbrir: () => setAba('pendencias'),
          sub: <>{fmtCpf(p.cpf)} · venda: {p.vendedora_nome || '—'} · {p.tipo === 'exigencia_inss' ? 'exigência do INSS' : 'antes do protocolo'} · {String(p.descricao || '').slice(0, 90)}{String(p.descricao || '').length > 90 ? '…' : ''}{prazoTxt(p)}{p.status === 'avisado' && p.resolucao_data ? <b style={{ color: '#2563eb' }}> · vai pagar até {fmtData(p.resolucao_data)}</b> : ''}</>,
          acoes: [botaoAnexoAdv(p), ...botoesResolver(p)] }) },
    ]
    const total = grupos.reduce((n, g) => n + g.itens.length, 0)
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ ...card, padding: '12px 16px', fontSize: 13.5, color: cores.texto, background: 'linear-gradient(135deg,#ffffff 40%,#ecfdf5)' }}>
          <b>{hojeExtensoBR()}</b> · {total ? <>você tem <b>{total}</b> aviso{total === 1 ? '' : 's'}. Clique na setinha para abrir cada um.</> : 'nada pendente por aqui. 🎉'}
        </div>
        {grupos.map(g => {
          const n = g.itens.length
          const aberto = !!muralAberto[g.k] && n > 0
          return (
            <div key={g.k} style={{ ...card, padding: 0, overflow: 'hidden', opacity: n ? 1 : 0.6 }}>
              <button onClick={() => n && setMuralAberto(m => ({ ...m, [g.k]: !m[g.k] }))} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', border: 'none', background: n ? hexA(g.cor, 0.06) : '#fff', cursor: n ? 'pointer' : 'default', fontFamily: 'inherit', textAlign: 'left', borderBottom: aberto ? `1px solid ${cores.cardBorda}` : 'none', flexWrap: 'wrap' }}>
                <span style={{ width: 16, color: cores.suave, fontSize: 13 }}>{n ? (aberto ? '▾' : '▸') : ''}</span>
                <span style={{ fontSize: 18 }}>{g.icone}</span>
                <span style={{ fontSize: 14.5, fontWeight: 800, color: cores.texto }}>{g.tit}</span>
                {g.extra && n > 0 && <span style={{ fontSize: 12, color: cores.suave }}>· {g.extra}</span>}
                <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800, color: n ? g.cor : cores.suave, background: n ? hexA(g.cor, 0.12) : '#f1f5f9', borderRadius: 999, padding: '2px 11px' }}>{n || 'nada'}</span>
              </button>
              {aberto && g.itens.map((c, i) => g.linha(c, i))}
            </div>
          )
        })}
      </div>
    )
  }

  // ------------------------------------------------------------ pendencias para resolver
  const cartaoPend = (p) => {
    const cat = catPend(p.categoria)
    const fechada = p.status === 'resolvida'
    const andamento = p.status === 'avisado'
    const venc = andamento && p.prazo && p.prazo < hoje
    const wa = telWa(p.telefone)
    return (
      <div key={p.id} style={{ ...card, padding: 0, overflow: 'hidden', opacity: fechada && !ehExig(p) ? 0.75 : 1, border: `1.5px solid ${fechada ? cores.cardBorda : venc ? hexA(cores.perigo, 0.5) : hexA(cat.cor, 0.35)}` }}>
        <div style={{ padding: '11px 14px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', background: hexA(cat.cor, 0.07) }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 800, color: '#fff', background: cat.cor, borderRadius: 999, padding: '3px 11px' }}>{cat.icone} {cat.rot}</span>
          <span style={{ fontSize: 14.5, fontWeight: 800, color: cores.texto }}>{p.nome}</span>
          <span style={{ fontSize: 12, color: cores.suave }}>{fmtCpf(p.cpf)} · venda: {p.vendedora_nome || '—'}</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: cores.suave }}>aberta por <b>{p.aberta_por || '—'}</b> · há {p.dias_aberta} dia{p.dias_aberta === 1 ? '' : 's'}</span>
        </div>
        <div style={{ padding: 14, display: 'grid', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.07em', color: cores.suave, textTransform: 'uppercase' }}>O que precisa</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: cores.texto, marginTop: 3, whiteSpace: 'pre-wrap' }}>{p.descricao}</div>
            {cat.explica && <div style={{ fontSize: 12.5, color: cores.suave, marginTop: 3 }}>{cat.explica}</div>}
            {/* 06/11 (Bruno): o anexo que a advogada subiu ao registrar no Protocolo (ex.: resposta do INSS) */}
            {p.anexo_advogada && (
              <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '8px 10px 8px 12px', border: `1px solid ${cores.cardBorda}`, borderRadius: 10, background: '#f8fafc', maxWidth: '100%' }}>
                <span style={{ display: 'inline-flex', color: cores.suave }}><IconeClipe /></span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.07em', color: cores.suave, textTransform: 'uppercase' }}>Anexado pela advogada</div>
                  <div style={{ fontSize: 13, color: cores.texto, fontWeight: 600 }}>{p.tipo === 'exigencia_inss' ? 'Resposta do INSS' : 'Documento'} · {tipoArquivo(p.anexo_advogada)}</div>
                </div>
                <button onClick={() => abrirArquivo(p.anexo_advogada)} style={{ ...btn('#334155', false), padding: '5px 14px', fontSize: 12 }}>Abrir</button>
              </div>
            )}
            {p.categoria === 'exigencia_inss' && p.exigencia_prazo && (() => {
              const f = Math.round((new Date(String(p.exigencia_prazo).slice(0, 10) + 'T12:00:00') - new Date(hoje + 'T12:00:00')) / 86400000)
              return <div style={{ fontSize: 12.5, color: f <= 5 ? cores.perigo : '#c2410c', fontWeight: 700, marginTop: 3 }}>Prazo do INSS: {fmtData(p.exigencia_prazo)}{!fechada && ` · ${f < 0 ? `venceu há ${-f} dia${f === -1 ? '' : 's'}` : f === 0 ? 'vence HOJE' : `faltam ${f} dia${f === 1 ? '' : 's'}`}`}</div>
            })()}
            {p.categoria === 'exigencia_inss' && p.numero_protocolo && <div style={{ fontSize: 12, color: cores.suave, marginTop: 2 }}>Protocolo {p.numero_protocolo}</div>}
          </div>
          {fechada && ehExig(p) && (() => {
            // 04/11 (Bruno): em que pe esta a exigencia depois que o Acompanhamento anexou
            const e = p.etapa
            const dias = p.resolvida_em ? Math.max(0, Math.floor((Date.now() - new Date(p.resolvida_em).getTime()) / 86400000)) : null
            const st = ['deferido', 'recurso_deferido'].includes(e) ? { cor: cores.ok, t: '✅ Deferido pelo INSS' }
              : ['indeferido', 'recurso_indeferido'].includes(e) ? { cor: cores.perigo, t: '⛔ Indeferido pelo INSS' }
              : p.exig_cumprida_em ? { cor: '#0d9488', t: `📨 Cumprida no INSS pela advogada em ${fmtDataHora(p.exig_cumprida_em)} — em análise` }
              : ['protocolado', 'recurso'].includes(e) ? { cor: '#0d9488', t: '📨 Voltou para análise do INSS' }
              : e === 'exigencia' ? { cor: '#b45309', t: `📎 Anexado — com a advogada para mandar ao INSS${dias != null ? ` · há ${dias === 0 ? 'menos de 1 dia' : dias + ' dia' + (dias === 1 ? '' : 's')}` : ''}` }
              : ['pendencia_docs', 'aguardando_protocolo'].includes(e) ? { cor: '#7c3aed', t: '📎 Anexado — com o setor de protocolo' }
              : { cor: '#475569', t: `Etapa: ${e || '—'}` }
            const anexos = Array.isArray(p.resolucao_anexos) ? p.resolucao_anexos.filter(Boolean) : []
            return (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderRadius: 10, padding: '9px 12px', background: hexA(st.cor, 0.08), border: `1px solid ${hexA(st.cor, 0.25)}` }}>
                <b style={{ fontSize: 13.5, color: st.cor }}>{st.t}</b>
                {anexos.map((u, i) => <button key={i} onClick={() => abrirArquivo(u)} style={{ ...btn('#475569', false), padding: '4px 10px', fontSize: 12 }}>📎 Anexo {anexos.length > 1 ? i + 1 : ''}</button>)}
              </div>
            )
          })()}
          {(andamento || fechada) && p.resolucao && (
            <div style={{ fontSize: 13, borderRadius: 10, padding: '8px 11px', background: venc ? hexA(cores.perigo, 0.08) : fechada ? hexA(cores.ok, 0.08) : hexA('#2563eb', 0.07), color: cores.texto }}>
              <b>{fechada ? 'Resolvida' : venc ? 'Combinado e VENCIDO' : 'Combinado'}:</b> {rotResolucao(p.categoria, p.resolucao)}{p.resolucao_data ? ` · ${fmtData(p.resolucao_data)}` : ''}{p.resolucao_texto ? ` — ${p.resolucao_texto}` : ''}
              {fechada && <span style={{ color: cores.suave }}> · {p.resolvida_por} {fmtDataHora(p.resolvida_em)}{RESOLUCOES_NEGATIVAS.includes(p.resolucao) ? ' · advogada vai decidir' : ' · com a advogada para refazer'}</span>}
            </div>
          )}
          {!fechada && p.sinalizada_em && (
            <div style={{ borderRadius: 10, padding: '9px 12px', background: hexA('#2563eb', 0.07), border: `1px solid ${hexA('#2563eb', 0.25)}`, fontSize: 13, color: cores.texto }}>
              🔔 <b>Sinalizado</b> por {p.sinalizada_por || '—'} em {fmtDataHora(p.sinalizada_em)}: {rotResolucao(p.categoria, p.resolucao)}{p.resolucao_texto ? ` — ${p.resolucao_texto}` : ''}
              {(Array.isArray(p.resolucao_anexos) ? p.resolucao_anexos.filter(Boolean) : []).map((u, i) => <button key={i} onClick={() => abrirArquivo(u)} style={{ marginLeft: 8, border: 'none', background: 'none', color: cores.azul, cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: 0 }}>📎 anexo{i ? ' ' + (i + 1) : ''}</button>)}
              <div style={{ fontSize: 12, color: cores.suave, marginTop: 3 }}>{podeResolver ? 'Confira e dê a baixa abaixo.' : 'Aguardando a Jessica ou a Sthefany conferirem e darem a baixa.'}</div>
            </div>
          )}
          {!fechada && (!p.sinalizada_em || podeResolver) && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.07em', color: cores.suave, textTransform: 'uppercase', marginBottom: 6 }}>{p.sinalizada_em ? 'Dar a baixa' : podeResolver ? 'Como resolver' : 'O que você conseguiu (vai para a Jessica/Sthefany conferirem)'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : `repeat(${cat.opcoes.length}, minmax(0,1fr))`, gap: 8 }}>
                {cat.opcoes.map(o => {
                  const cor = o.negativa ? cores.perigo : o.andamento ? '#2563eb' : cores.ok
                  return (
                    <button key={o.v} onClick={() => setResolver({ pend: p, opcao: o.v })} style={{ textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 12, padding: '10px 12px', border: `1.5px solid ${hexA(cor, 0.35)}`, background: hexA(cor, 0.05) }}>
                      <div style={{ fontSize: 13.5, fontWeight: 800, color: cor }}>{o.negativa ? '✕' : o.andamento ? '🗓️' : '✔'} {o.rot}</div>
                      <div style={{ fontSize: 12, color: cores.suave, marginTop: 2 }}>{o.dica}</div>
                    </button>
                  )
                })}
              </div>
              {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" style={{ ...btn('#16a34a', false), padding: '6px 11px', fontSize: 12, textDecoration: 'none', marginTop: 10 }}>WhatsApp da cliente · {fmtTel(p.telefone)}</a>}
            </div>
          )}
        </div>
      </div>
    )
  }
  // 09/11/2026 (Bruno): UMA aba de Pendencias (antes eram Pendencias e Exigencias, cada uma contando de um jeito).
  // 4 grupos com o MESMO criterio do Protocolo: abertas, de clientes ativos no setor.
  const pendView = (() => {
    const abertasTodas = pendsF.filter(pendAbertaAtiva)
    const doGrupo = (p) => !pendGrupo || grupoPend(p) === pendGrupo
    const ordem = (a, b) => String(a.exigencia_prazo || a.prazo || '9999').localeCompare(String(b.exigencia_prazo || b.prazo || '9999'))
    const base = abertasTodas.filter(doGrupo).sort(ordem)
    const paraResolver = base.filter(p => p.status === 'aberta' && !p.sinalizada_em)
    const sinalizadas = base.filter(p => p.sinalizada_em)
    const andamento = base.filter(p => p.status === 'avisado' && !p.sinalizada_em)
    const resolvidas = pendsF.filter(p => p.status === 'resolvida' && doGrupo(p)).sort((a, b) => String(b.resolvida_em || '').localeCompare(String(a.resolvida_em || '')))
    const titulo = (t, n, cor, sub) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 2px' }}>
        <span style={{ width: 9, height: 9, borderRadius: 999, background: cor, boxShadow: `0 0 0 4px ${hexA(cor, 0.15)}` }} />
        <span style={{ fontSize: 15, fontWeight: 800, color: cores.texto }}>{t}</span>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: cor, background: hexA(cor, 0.12), borderRadius: 999, padding: '1px 10px' }}>{n}</span>
        {sub && <span style={{ fontSize: 12, color: cores.suave }}>{sub}</span>}
      </div>
    )
    const chip = (k, rot, n, cor) => (
      <button key={k || 'todas'} onClick={() => setPendGrupo(k)} style={{ padding: '8px 14px', borderRadius: 10, border: `1.5px solid ${pendGrupo === k ? cor : cores.cardBorda}`, background: pendGrupo === k ? hexA(cor, 0.08) : '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 800, color: cores.texto }}>
        {rot} <span style={{ color: cor }}>{n}</span>
      </button>
    )
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {chip('', '📌 Todas', abertasTodas.length, '#475569')}
          {GRUPOS_PEND.map(g => chip(g.k, g.rot, abertasTodas.filter(p => grupoPend(p) === g.k).length, g.cor))}
        </div>
        <div style={{ ...card, padding: '10px 14px', fontSize: 12.5, color: cores.suave }}>
          {podeResolver ? 'Você dá a baixa: confira o que foi conseguido e resolva. Resolveu, sai daqui.' : 'Você sinaliza o que conseguiu (com anexo). Quem dá a baixa é a Jessica ou a Sthefany — até lá a pendência continua aqui como "sinalizada".'}
        </div>
        {titulo('Para resolver', paraResolver.length, '#b45309')}
        {paraResolver.length === 0 && <div style={{ ...card, padding: 20, fontSize: 13, color: cores.suave }}>Nada para resolver. 🎉</div>}
        {paraResolver.map(cartaoPend)}
        {sinalizadas.length > 0 && titulo('Sinalizadas', sinalizadas.length, '#2563eb', podeResolver ? 'conferir e dar a baixa' : 'aguardando a Jessica/Sthefany')}
        {sinalizadas.map(cartaoPend)}
        {andamento.length > 0 && titulo('Em andamento', andamento.length, '#0891b2', 'com data combinada — aparecem na agenda')}
        {andamento.map(cartaoPend)}
        {resolvidas.length > 0 && (
          <button onClick={() => setVerResolvidas(v => !v)} style={{ ...btn('#475569', false), justifySelf: 'start' }}>{verResolvidas ? 'Esconder' : 'Ver'} resolvidas recentes ({resolvidas.length})</button>
        )}
        {verResolvidas && resolvidas.map(cartaoPend)}
      </div>
    )
  })()

  // ------------------------------------------------------------ pagamentos (29/10, Bruno)
  // O coracao do setor: quem recebe hoje, amanha e na semana, para o time programar a
  // cobranca. Dois jeitos de acompanhar:
  //  - DESCONTO AUTOMATICO (PrevSempre + aceitou): avisar a cliente e conferir na PrevSempre;
  //  - COBRAR A CLIENTE (qualquer outro): lembrar antes e cobrar o honorario quando cair.
  const tipoCobranca = (c) => (ehAutomatico(c) ? 'auto' : (c.etapa === 'prevsempre' || c.etapa === 'orientacao_prev') ? 'prev_pendente' : 'cobrar')
  const TIPO_COBRANCA = {
    auto: { rot: 'Desconto automático', icone: '🏦', cor: AZUL_PREV, faz: 'Avisar a cliente e conferir na PrevSempre se o honorário foi descontado' },
    prev_pendente: { rot: 'PrevSempre a confirmar', icone: '❓', cor: '#d97706', faz: 'Confirmar conta e honorário automático antes do pagamento' },
    cobrar: { rot: 'Cobrar cliente', icone: '💳', cor: '#7c3aed', faz: 'Lembrar a cliente antes e cobrar o honorário quando cair' },
  }
  const pagamentos = useMemo(() => {
    const base = filtrada.filter(c => ESPERANDO.includes(c.etapa) && c.data_pagamento)
    const noPeriodo = (c) => {
      const d = c.data_pagamento
      if (pgPeriodo === 'hoje') return d === hoje
      if (pgPeriodo === 'amanha') return d === amanha
      if (pgPeriodo === 'semana') return d >= hoje && d <= fimSemana
      if (pgPeriodo === '30') return d >= hoje && d <= somaDias(hoje, 30)
      if (pgPeriodo === 'atrasados') return d < hoje
      return true
    }
    return base.filter(noPeriodo).filter(c => !pgTipo || tipoCobranca(c) === pgTipo)
      .sort((a, b) => String(a.data_pagamento).localeCompare(String(b.data_pagamento)) || String(a.nome).localeCompare(String(b.nome)))
  }, [filtrada, pgPeriodo, pgTipo, hoje, amanha, fimSemana])
  const contaPg = useMemo(() => {
    const base = filtrada.filter(c => ESPERANDO.includes(c.etapa) && c.data_pagamento)
    return {
      hoje: base.filter(c => c.data_pagamento === hoje).length,
      amanha: base.filter(c => c.data_pagamento === amanha).length,
      semana: base.filter(c => c.data_pagamento >= hoje && c.data_pagamento <= fimSemana).length,
      d30: base.filter(c => c.data_pagamento >= hoje && c.data_pagamento <= somaDias(hoje, 30)).length,
      atrasados: base.filter(c => c.data_pagamento < hoje).length,
      todos: base.length,
    }
  }, [filtrada, hoje, amanha, fimSemana])

  const linhaPagamento = (c, i) => {
    const t = TIPO_COBRANCA[tipoCobranca(c)]
    const wa = telWa(c.telefone)
    const podeAgir = !soLeitura && c.pode_agir !== false
    const acao = c.etapa === 'orientacao_prev' ? 'orientar_prev' : c.etapa === 'prevsempre' ? 'prevsempre' : 'cliente_pagou'
    return (
      <div key={c.id} className="kr-linha" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderTop: i ? `1px solid ${cores.cardBorda}` : 'none', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
        <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 4, background: inadimplente(c) ? cores.perigo : t.cor, flexShrink: 0 }} />
        <div onClick={() => setAberto(c.id)} style={{ flex: '1 1 260px', minWidth: 0, cursor: 'pointer' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 800, color: '#fff', background: t.cor, borderRadius: 999, padding: '2px 9px' }}>{t.icone} {t.rot}</span>
            <span style={{ fontSize: 14, fontWeight: 750, color: cores.texto }}>{c.nome}</span>
            {inadimplente(c) ? <Chip cor={cores.perigo} forte>INADIMPLENTE · {diasApos(c.data_pagamento)}d</Chip> : atrasado(c) ? <Chip cor="#ea580c" forte>ATRASADO · {diasApos(c.data_pagamento)}d</Chip> : null}
          </div>
          <div style={{ fontSize: 12.5, color: cores.texto, marginTop: 3 }}>
            <b>{bancoCurto(c.banco) || 'banco?'}</b>{c.valor_beneficio ? ` · ${reais(c.valor_beneficio)}` : ''} · {fmtTel(c.telefone)}{!soLeitura ? ` · ${(c.responsaveis || []).join(', ')}` : ''}
          </div>
          <div style={{ fontSize: 12, color: t.cor, fontWeight: 700, marginTop: 2 }}>→ {t.faz}{(() => { const fc = faltaChecklist(acao, c).length; return <span style={{ color: fc ? '#b45309' : cores.ok, marginLeft: 8 }}>{fc ? `🔒 checklist: falta${fc > 1 ? 'm' : ''} ${fc} mensage${fc > 1 ? 'ns' : 'm'}` : '✓ checklist ok'}</span> })()}{inadimplente(c) && !(c.conversas || []).includes('inadimplente') ? <span style={{ color: cores.perigo, marginLeft: 8 }}>📎 falta a conversa</span> : null}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
          <button title="Mensagens prontas desta etapa" onClick={() => setGuiaDe(c)} style={{ ...btn('#16a34a', false), padding: '6px 9px', fontSize: 12 }}>💬 Mensagens</button>
          {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" style={{ ...btn('#16a34a', false), padding: '6px 9px', fontSize: 12, textDecoration: 'none' }}>WhatsApp</a>}
          {podeAgir && <button onClick={() => abrirAcao(c, acao)} style={{ ...btn(acao === 'prevsempre' ? AZUL_PREV : '#15803d'), padding: '6px 10px', fontSize: 12 }}>{acao === 'prevsempre' ? '🏦 Confirmar PrevSempre' : ehAutomatico(c) ? '🤝 Descontou' : '🤝 Pagou'}</button>}
        </div>
      </div>
    )
  }

  const pagamentosView = (() => {
    const chip = (val, set, atual, rot, n, cor) => {
      const on = atual === val
      return (
        <button key={val || 'x'} onClick={() => set(val)} style={{ padding: '8px 13px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: on ? 800 : 600, border: `1.5px solid ${on ? cor : hexA('#0f172a', 0.12)}`, background: on ? hexA(cor, 0.1) : '#fff', color: on ? cor : cores.texto, whiteSpace: 'nowrap' }}>
          {rot}{n != null ? <span style={{ marginLeft: 6, fontWeight: 800, color: cor }}>{n}</span> : null}
        </button>
      )
    }
    const resumo = ['cobrar', 'auto', 'prev_pendente'].map(k => {
      const it = pagamentos.filter(c => tipoCobranca(c) === k)
      return { k, n: it.length, total: it.reduce((s, c) => s + Number(c.valor_beneficio || 0), 0) }
    })
    // agrupa por dia
    const dias = []
    pagamentos.forEach(c => { const u = dias[dias.length - 1]; if (u && u.d === c.data_pagamento) u.itens.push(c); else dias.push({ d: c.data_pagamento, itens: [c] }) })
    const rotDia = (d) => d === hoje ? 'Hoje' : d === amanha ? 'Amanhã' : d === depois ? 'Depois de amanhã' : d < hoje ? `${diasApos(d)} dia${diasApos(d) === 1 ? '' : 's'} atrás` : `daqui ${-diasApos(d)} dias`
    return (
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ ...card, padding: 14, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: cores.suave, marginRight: 4 }}>Quando cai</span>
            {chip('hoje', setPgPeriodo, pgPeriodo, 'Hoje', contaPg.hoje, '#d97706')}
            {chip('amanha', setPgPeriodo, pgPeriodo, 'Amanhã', contaPg.amanha, '#7c3aed')}
            {chip('semana', setPgPeriodo, pgPeriodo, 'Esta semana', contaPg.semana, '#2563eb')}
            {chip('30', setPgPeriodo, pgPeriodo, 'Próximos 30 dias', contaPg.d30, '#0891b2')}
            {chip('atrasados', setPgPeriodo, pgPeriodo, 'Atrasados', contaPg.atrasados, cores.perigo)}
            {chip('todos', setPgPeriodo, pgPeriodo, 'Todos', contaPg.todos, '#475569')}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: cores.suave, marginRight: 4 }}>Como acompanhar</span>
            {chip('', setPgTipo, pgTipo, 'Todos', null, '#475569')}
            {chip('cobrar', setPgTipo, pgTipo, '💳 Cobrar cliente', null, '#7c3aed')}
            {chip('auto', setPgTipo, pgTipo, '🏦 Desconto automático', null, AZUL_PREV)}
            {chip('prev_pendente', setPgTipo, pgTipo, '❓ PrevSempre a confirmar', null, '#d97706')}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0,1fr))', gap: 12 }}>
          {resumo.map(r => {
            const t = TIPO_COBRANCA[r.k]
            return (
              <div key={r.k} style={{ ...card, padding: '12px 14px', borderLeft: `4px solid ${t.cor}` }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: t.cor }}>{t.icone} {t.rot}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: cores.texto, marginTop: 2 }}>{r.n} <span style={{ fontSize: 13, fontWeight: 600, color: cores.suave }}>{r.total ? `· ${reais(r.total)} em benefícios` : ''}</span></div>
                <div style={{ fontSize: 12, color: cores.suave, marginTop: 2 }}>{t.faz}</div>
              </div>
            )
          })}
        </div>
        {dias.length === 0 && <div style={{ ...card, padding: 30, textAlign: 'center', color: cores.suave }}>Nenhum pagamento neste período.</div>}
        {dias.map(g => {
          const cor = g.d < hoje ? cores.perigo : g.d === hoje ? '#d97706' : g.d === amanha ? '#7c3aed' : '#2563eb'
          const nAuto = g.itens.filter(ehAutomatico).length
          return (
            <div key={g.d} style={{ ...card, padding: 0, overflow: 'hidden', border: g.d < hoje ? `1.5px solid ${hexA(cores.perigo, 0.4)}` : card.border }}>
              <div style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: hexA(cor, 0.06), borderBottom: `1px solid ${cores.cardBorda}` }}>
                <span style={{ width: 9, height: 9, borderRadius: 999, background: cor, boxShadow: `0 0 0 4px ${hexA(cor, 0.15)}` }} />
                <span style={{ fontSize: 14.5, fontWeight: 800, color: cores.texto }}>{diaSemana(g.d)} {fmtData(g.d)}</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: cor }}>{rotDia(g.d)}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: cores.suave }}>{g.itens.length} pagamento{g.itens.length === 1 ? '' : 's'}{nAuto ? ` · ${nAuto} automático${nAuto === 1 ? '' : 's'}` : ''}</span>
              </div>
              {g.itens.map(linhaPagamento)}
            </div>
          )
        })}
      </div>
    )
  })()

  // ------------------------------------------------------------ inadimplencia
  const inadView = (() => {
    const meses = Object.values(porMes).sort((a, b) => b.mes.localeCompare(a.mes)).slice(0, 8)
    const inadLista = filtrada.filter(inadimplente).sort((a, b) => String(a.data_pagamento).localeCompare(String(b.data_pagamento)))
    const porResp = {}
    filtrada.filter(c => mesDe(c) === mesAtual && c.etapa !== 'cancelado').forEach(c => (c.responsaveis || ['—']).forEach(r => {
      const x = porResp[r] || (porResp[r] = { r, pagos: 0, inad: 0 })
      if (c.etapa === 'baixado') x.pagos++; else if (inadimplente(c)) x.inad++
    }))
    const th = { padding: '9px 12px', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: cores.suave, textAlign: 'right', whiteSpace: 'nowrap' }
    const td = { padding: '9px 12px', fontSize: 13.5, textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderTop: `1px solid ${cores.cardBorda}` }
    return (
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ ...card, padding: '11px 16px', fontSize: 13, color: cores.suave }}>
          <b style={{ color: cores.texto }}>Regra:</b> inadimplente = passou <b>{DIAS_INADIMPLENTE} dias</b> da data do pagamento e a cliente não pagou. Conta sempre no <b>mês da data agendada</b> (se a data era 29/10 e virou inadimplente em 02/11, conta em outubro).
        </div>
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 620 }}>
            <thead><tr style={{ background: '#f8fafc' }}>
              <th style={{ ...th, textAlign: 'left' }}>Mês (data agendada)</th><th style={th}>Agendados</th><th style={th}>Pagaram</th><th style={th}>Em dia</th><th style={th}>Inadimplentes</th><th style={th}>Em aberto</th><th style={th}>Taxa</th><th style={th}>Honorário</th>
            </tr></thead>
            <tbody>
              {meses.length === 0 && <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: cores.suave }}>Ainda sem pagamentos agendados.</td></tr>}
              {meses.map(r => (
                <tr key={r.mes} style={{ background: r.mes === mesAtual ? hexA('#2563eb', 0.04) : 'transparent' }}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 800 }}>{nomeMesBR(r.mes)}</td>
                  <td style={td}>{r.agendados}</td>
                  <td style={{ ...td, color: cores.ok, fontWeight: 700 }}>{r.pagos}</td>
                  <td style={td}>{r.emDia}</td>
                  <td style={{ ...td, color: r.inad ? cores.perigo : cores.texto, fontWeight: 800 }}>{r.inad}</td>
                  <td style={{ ...td, color: cores.suave }}>{r.aberto}</td>
                  <td style={{ ...td, fontWeight: 800, color: taxa(r) >= 20 ? cores.perigo : taxa(r) >= 10 ? '#d97706' : cores.ok }}>{(r.pagos + r.inad) ? taxa(r) + '%' : '—'}</td>
                  <td style={td}>{r.honor ? reais(r.honor) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {Object.keys(porResp).length > 1 && (
          <div style={{ ...card, padding: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: cores.suave, marginBottom: 8 }}>{nomeMesBR(mesAtual)} por responsável</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 8 }}>
              {Object.values(porResp).sort((a, b) => b.inad - a.inad).map(x => (
                <div key={x.r} style={{ border: `1px solid ${cores.cardBorda}`, borderRadius: 12, padding: '9px 12px' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800 }}>{x.r}</div>
                  <div style={{ fontSize: 12.5, color: cores.suave }}><b style={{ color: cores.ok }}>{x.pagos}</b> pagaram · <b style={{ color: x.inad ? cores.perigo : cores.suave }}>{x.inad}</b> inadimplente{x.inad === 1 ? '' : 's'}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', display: 'flex', gap: 8, alignItems: 'center', background: hexA(cores.perigo, 0.06), borderBottom: `1px solid ${cores.cardBorda}` }}>
            <span style={{ fontSize: 14, fontWeight: 800 }}>Inadimplentes agora</span>
            <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 800, color: cores.perigo, background: hexA(cores.perigo, 0.12), borderRadius: 999, padding: '1px 10px' }}>{inadLista.length}</span>
          </div>
          {inadLista.length === 0 && <div style={{ padding: 14, fontSize: 13, color: cores.suave }}>Ninguém inadimplente. 👏</div>}
          {inadLista.map((c, i) => linhaAgenda({ tipo: 'pagamento', data: c.data_pagamento, texto: `Recebia ${fmtData(c.data_pagamento)}${c.banco ? ' no ' + c.banco : ''} · ${diasApos(c.data_pagamento)} dias sem pagar`, c }, i))}
        </div>
      </div>
    )
  })()

  // ------------------------------------------------------------ lista
  const listaView = (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      {!isMobile && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.3fr 1.2fr 1fr 1.3fr', gap: 12, padding: '11px 16px', fontSize: 11, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: cores.suave, background: '#f8fafc', borderBottom: `1px solid ${cores.cardBorda}` }}>
          <div>Cliente</div><div>Etapa</div><div>Banco</div><div>Pagamento</div><div>{soLeitura ? 'Vendedora' : 'Responsável'}</div>
        </div>
      )}
      {filtrada.length === 0 && <div style={{ padding: 36, textAlign: 'center', color: cores.suave }}>{lista ? 'Nenhum caso.' : 'Carregando…'}</div>}
      {[...filtrada].sort((a, b) => COLUNAS_PD.indexOf(colunaDe(a)) - COLUNAS_PD.indexOf(colunaDe(b)) || String(a.data_pagamento || '9').localeCompare(String(b.data_pagamento || '9'))).map(c => {
        const et = etapaPD(colunaDe(c))
        return (
          <div key={c.id} onClick={() => setAberto(c.id)} className="kr-linha" style={{ display: isMobile ? 'block' : 'grid', gridTemplateColumns: '2fr 1.3fr 1.2fr 1fr 1.3fr', gap: 12, padding: '11px 16px', borderBottom: `1px solid ${cores.cardBorda}`, cursor: 'pointer', alignItems: 'center' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 750, color: cores.texto }}>{c.nome}</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 3 }}><span style={{ fontSize: 11.5, color: cores.suave }}>{fmtCpf(c.cpf)}</span><Tags c={c} /></div>
            </div>
            <div><Chip cor={et.cor} forte>{et.icone} {et.curto}</Chip></div>
            <div style={{ fontSize: 13, color: cores.texto }}>{c.banco || '—'}</div>
            <div style={{ fontSize: 13, color: cores.texto }}>{c.etapa === 'baixado' ? `pagou ${fmtData(c.pago_em)}` : fmtData(c.data_pagamento)}</div>
            <div style={{ fontSize: 12.5, color: cores.suave }}>{soLeitura ? c.vendedora_nome : (c.responsaveis || []).join(', ')}</div>
          </div>
        )
      })}
    </div>
  )

  // ------------------------------------------------------------ render
  const totalAtivos = (lista || []).filter(c => ATIVAS.includes(c.etapa)).length
  const ABAS = soLeitura
    ? [['pagamentos', '💰 Pagamentos'], ['funil', '▦ Funil'], ['calendario', '🗓️ Calendário'], ['lista', '☰ Todos'], ['agenda', '📅 Agenda']]
    : [['inicio', '🏠 Início'], ['pagamentos', '💰 Pagamentos'], ['funil', '▦ Funil'], ['protocolados', '📨 Protocolados'], ['deferidos', '✅ Deferidos'], ['indeferidos', '⛔ Indeferidos'], ['pendencias', '📌 Pendências'], ['inss', '🏛️ No INSS'], ['calendario', '🗓️ Calendário'], ['inadimplencia', '📉 Inadimplência'], ['lista', '☰ Todos'], ['agenda', '📅 Agenda']]
  const badge = { pagamentos: contaPg.hoje + contaPg.amanha + contaPg.atrasados, agenda: agenda.atrasados.length + agenda.hoje.length, pendencias: conta.pendAbertas, inss: inssF.length, deferidos: resultadosF.filter(c => ehDeferido(c) && noPeriodoAnot(c, 'hoje')).length, indeferidos: resultadosF.filter(c => !ehDeferido(c) && noPeriodoAnot(c, 'hoje')).length }
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 1600, margin: '0 auto' }}>
      <style>{`
        .kr-cartao:hover { box-shadow: ${sombras.cardHover} !important; transform: translateY(-1px); }
        .kr-linha:hover { background: #f8fafc; }
        .kr-aba::-webkit-scrollbar { height: 0 }
      `}</style>
      {toast}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ width: 48, height: 48, borderRadius: 15, background: 'linear-gradient(135deg,#16a34a,#2563eb)', display: 'grid', placeItems: 'center', fontSize: 22, boxShadow: sombras.glowAzul }}>📋</div>
        <div style={{ flex: '1 1 180px', minWidth: 0 }}>
          <div style={{ fontSize: isMobile ? 21 : 25, fontWeight: 800, color: cores.texto, letterSpacing: '-.01em' }}>Acompanhamento de clientes</div>
          <div style={{ fontSize: 13, color: cores.suave }}>
            {soLeitura ? 'Suas vendas depois do deferimento · só acompanhamento' : 'Carta de concessão, PrevSempre, pagamento e pendências'} · {lista ? `${totalAtivos} caso${totalAtivos === 1 ? '' : 's'} em acompanhamento` : 'carregando…'}{profile?.nome ? ` · ${profile.nome}` : ''}
          </div>
        </div>
        <button onClick={carregar} style={btn('#475569', false)}>⟳ Atualizar</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(6, minmax(0,1fr))', gap: 12 }}>
        {kpi({ rot: 'Ligar no INSS (data)', n: conta.semCarta, cor: '#0d9488', icone: '🧾', sub: conta.extratoEspera ? `+ ${conta.extratoEspera} esperando os 7 dias` : 'data real do pagamento', onClick: () => setAba('funil') })}
        {kpi({ rot: 'Recebem amanhã', n: conta.amanha, cor: '#7c3aed', icone: '⏳', sub: fmtData(amanha), onClick: () => { setPgPeriodo('amanha'); setAba('pagamentos') } })}
        {kpi({ rot: 'Recebem na semana', n: conta.semana, cor: '#2563eb', icone: '🗓️', sub: `até ${fmtData(fimSemana)}`, onClick: () => { setPgPeriodo('semana'); setAba('pagamentos') } })}
        {kpi({ rot: 'Pagamento atrasado', n: conta.atrasados, cor: '#ea580c', icone: '⏰', sub: 'passou da data e não pagou', onClick: () => { setPgPeriodo('atrasados'); setAba('pagamentos') } })}
        {kpi({ rot: 'Pagaram no mês', n: rm.pagos, cor: cores.ok, icone: '🤝', sub: rm.honor ? reais(rm.honor) + ' de honorário' : nomeMesBR(mesAtual), onClick: soLeitura ? null : () => setAba('inadimplencia') })}
        {kpi({ rot: 'Inadimplentes no mês', n: rm.inad, cor: cores.perigo, icone: '📉', sub: (rm.pagos + rm.inad) ? `${taxa(rm)}% de ${rm.pagos + rm.inad} vencidos` : `mais de ${DIAS_INADIMPLENTE} dias sem pagar`, onClick: soLeitura ? null : () => setAba('inadimplencia') })}
      </div>

      <div style={{ position: 'relative', minWidth: 0 }}>
        {abasLado.includes('e') && abasSeta('e')}
        <div ref={abasRef} {...abasArrasto} className="kr-aba" style={{ userSelect: 'none', scrollbarWidth: 'none', display: 'flex', gap: 6, overflowX: 'auto', background: '#fff', border: `1px solid ${cores.cardBorda}`, borderRadius: 14, padding: 5 }}>
          {ABAS.map(([k, r]) => {
            const on = aba === k
            const n = badge[k]
            return (
              <button key={k} data-on={on ? '1' : '0'} onClick={() => setAba(k)} style={{ padding: '9px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', fontSize: 13, fontWeight: on ? 800 : 600, color: on ? '#fff' : cores.texto, background: on ? 'linear-gradient(135deg,#16a34a,#2563eb)' : 'transparent' }}>
                {r}{n ? <span style={{ marginLeft: 6, fontSize: 11.5, fontWeight: 800, opacity: on ? 0.95 : 0.7 }}>{n}</span> : null}
              </button>
            )
          })}
        </div>
        {abasLado.includes('d') && abasSeta('d')}
      </div>

      {filtros}

      {lista === null ? <div style={{ ...card, padding: 40, textAlign: 'center', color: cores.suave }}>Carregando…</div>
        : aba === 'pendencias' ? pendView
        : aba === 'inss' ? inssView
        : aba === 'inicio' ? muralView()
        : aba === 'protocolados' ? protocoladosView()
        : aba === 'deferidos' ? resultadosView('def')
        : aba === 'indeferidos' ? resultadosView('indef')
        : aba === 'pagamentos' && lista.length ? pagamentosView
        : lista.length === 0 && aba !== 'inadimplencia' ? <div style={{ ...card, padding: 40, textAlign: 'center', color: cores.suave }}>Nenhum caso deferido {soLeitura ? 'das suas vendas' : 'na sua carteira'} ainda. Quando a advogada marcar "Deferido", o caso aparece aqui sozinho.</div>
        : aba === 'agenda' ? agendaView : aba === 'funil' ? funil : aba === 'calendario' ? calendario : aba === 'inadimplencia' ? inadView : listaView}

      {aberto && (
        <div onClick={() => setAberto(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.42)', backdropFilter: 'blur(2px)', zIndex: 1000 }}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: isMobile ? '100vw' : 'min(1100px, 94vw)', background: cores.fundo, boxShadow: '-24px 0 60px rgba(15,23,42,.25)', overflowY: 'auto', padding: isMobile ? 12 : 22, boxSizing: 'border-box', animation: 'krGaveta .22s ease-out' }}>
            <style>{'@keyframes krGaveta{from{transform:translateX(40px);opacity:.4}to{transform:none;opacity:1}}'}</style>
            <FichaPD key={aberto} id={aberto} onFechar={() => setAberto(null)} onMudou={carregar} />
          </div>
        </div>
      )}

      {modal && <ModalPD caso={modal.caso} acao={modal.acao} inicial={modal.inicial} onClose={() => setModal(null)} onFeito={() => { setModal(null); mostrar('Salvo'); carregar() }} />}
      {modalCarta}
      {inssDe && <ModalINSS c={inssDe} onClose={() => setInssDe(null)} onPendencias={() => { setInssDe(null); setAba('pendencias') }} />}
      {guiaDe && <ModalGuia caso={guiaDe} podeAgir={!soLeitura && guiaDe.pode_agir !== false} onClose={() => setGuiaDe(null)} onMarcou={carregar} />}
      {resolver && <ModalResolver pend={resolver.pend} opcao={resolver.opcao} onClose={() => setResolver(null)} onFeito={(r) => { setResolver(null); mostrar(r?.sinalizada ? 'Sinalizado — a Jessica/Sthefany vão conferir e dar a baixa' : r?.andamento ? 'Combinado — está na agenda' : 'Resolvida — foi para a advogada'); carregar() }} />}
    </div>
  )
}
