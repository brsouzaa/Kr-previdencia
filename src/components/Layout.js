import { useState, useEffect } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import NotificacoesBell from './NotificacoesBell'
import { carregarFonte, fundoMesh, fonte } from '../lib/tema'

// ===== VISUAL ESCURO PREMIUM (v2) =====
// Sidebar escura com glow, menu em grupos, fonte Inter, conteúdo claro com mesh.
// TODAS as regras de acesso/injeção por ID foram preservadas na íntegra.

// Agentes BF (Joana, Pamela, Juliana/Ju, Nadia): itens no menu por ID, sem perder os roles atuais
const IDS_AGENTES_BF = [
  '758a33f7-e5a2-4ef7-943a-dfe0ac72a387', // Joana
  '64ced61d-fdae-4399-97c9-900c59120fff', // Pamela
  '7ad37a1d-e5be-438c-9afd-982646d507d4', // Juliana (Ju Ferreira)
  'a3e94f8b-7e64-479b-9d72-1414afb83d1c', // Nadia Cajado
  '2c71c435-f5c2-49cf-984b-3629438045d2', // Hellen (helenlima451)
]

// Agente Retroativo (Duda): item Revisao IA Retroativo no menu por ID
const IDS_AGENTES_RETROATIVO = [
  '9fbda3fe-22aa-4179-b1a7-005e99660c8d', // Supervisora Duda
]

// Supervisores de board (Egle): itens Revisao IA (BF + Retroativo) no menu por ID
const IDS_SUPERVISOR_BOARD = [
  '6db43f01-71e6-4972-b84e-eb49375e8e70', // Egle Marcela
]

// Fila de entregas: item por ID, sem mexer no menu do papel (coordenador_b2c
// nao tem essa tela por padrao)
const IDS_FILA_ENTREGAS = [
  '0a5958b9-d43b-4bac-a01d-af60247dd721', // Agatha Barreto — 02/09
]

// Clientes (consulta geral de clientes e documentos): item por ID
const IDS_ACESSO_CLIENTES = [
  '906f9a57-bd4a-4b0e-9973-0968ef4f1e15', // Bruno Souza
  '0a5958b9-d43b-4bac-a01d-af60247dd721', // Agatha Barreto
  'be98f268-314f-4114-acc3-7bb9ce7635fd', // Maryana Kodos
  'ca0d5035-7275-43f6-b4f2-3c3b4569facb', // Bianca — 02/09
]

const NAV_PRODUTOR = [
  { key: 'contratos', label: '📄 Gerar contratos' },
]
const NAV_SUPERVISOR_PRODUCAO = [
  { key: 'novo_cliente', label: '➕ Novo cliente (Mãe)' },
  { key: 'fila_digitacao', label: '📥 Fila de digitação' },
  { key: 'devolucoes', label: '⚠️ Devoluções' },
  { key: 'ranking', label: '🏆 Ranking vendedoras' },
  { key: 'supervisor_producao', label: '📊 Supervisão' },
  { key: 'contratos', label: '📄 Gerar contratos (manual)' },
]
const NAV_SUPERVISOR_VIEW = [
  { key: 'supervisor_producao', label: '👁️ Supervisão Produção' },
]
const NAV_ANALISTA = [
  { key: 'dashboard', label: '📊 Dashboard' },
  { key: 'painel_financeiro', label: '💰 Painel Financeiro' },
  { key: 'metas_financeiras', label: '🥅 Metas & Saúde' },
  { key: 'advogados', label: '⚖️ Advogados' },
  { key: 'devolucoes', label: '⚠️ Devoluções' },
  { key: 'fila', label: '📦 Fila de entregas' },
  { key: 'ranking', label: '🏆 Ranking vendedoras' },
  { key: 'supervisor_producao', label: '📊 Supervisão produção' },
]
const NAV_VENDEDOR = [
  { key: 'dashboard', label: '📊 Dashboard' },
  { key: 'advogados', label: 'Advogados' },
  { key: 'funil', label: 'Funil' },
  { key: 'compras', label: 'Histórico' },
  { key: 'fila', label: '📦 Fila de entregas' },
  { key: 'devolucoes', label: '⚠️ Devoluções' },
  { key: 'resgate_vendedor', label: '🛟 Resgate' },
]
const NAV_VENDEDOR_OPERADOR = [
  { key: 'meus_clientes', label: '📋 Meus clientes' },
  { key: 'novo_cliente', label: '➕ Novo cliente' },
  { key: 'devolucoes', label: '⚠️ Meus devolvidos' },
  { key: 'meu_desempenho', label: '🏆 Meu desempenho' },
]
const NAV_POS_VENDA = [
  { key: 'pos_venda', label: '📞 Fila de pós-venda' },
  { key: 'pos_venda_historico', label: '📚 Histórico' },
]
const NAV_SIMULADOR_EMPRESTIMO = [
  { key: 'simulacao_emprestimo', label: '💰 Simulação Empréstimo' },
]
const NAV_AGENTE_BF = [
  { key: 'revisao_ia_bf', label: '🩷 Revisão IA Bolsa Família' },
  { key: 'revisao_ia_retroativo', label: '🤱 Revisão IA Retroativo' },
]
const NAV_ADVOGADA = [
  { key: 'mesa_advogada', label: '⚖️ Mesa da Advogada' },
]
const NAV_RESGATE = [
  { key: 'resgate', label: '🛟 Ala de resgate' },
]
const NAV_FINANCEIRO = [
  { key: 'despesas', label: '📋 Despesas & Custos' },
]
const NAV_RH = [
  { key: 'financeiro', label: '💸 Financeiro (despesas)' },
]
const NAV_ANALISTA_IA = [
  { key: 'supervisor_producao', label: '👁️ Supervisão Produção' },
  { key: 'revisao_ia', label: '🤖 Revisão IA' },
  { key: 'performance_ia', label: '📈 Performance IA' },
]
const NAV_COORDENADOR_B2C = [
  { key: 'painel_coordenador', label: '🎛️ Painel da coordenadora' },
  { key: 'meus_clientes', label: '📋 Clientes do setor' },
  { key: 'supervisor_producao', label: '📊 Supervisão produção' },
  { key: 'fila_digitacao', label: '📥 Fila de digitação' },
  { key: 'ranking', label: '🏆 Ranking vendedoras' },
  { key: 'pos_venda', label: '📞 Pós-venda' },
  { key: 'pos_venda_historico', label: '📚 Histórico pós-venda' },
  { key: 'devolucoes', label: '⚠️ Devoluções' },
  // Bloco IA só aparece se setor_responsavel = captacao (filtrado abaixo no map do nav)
  { key: 'revisao_ia', label: '🤖 Revisão IA', soCaptacao: true },
  { key: 'performance_ia', label: '📈 Performance IA', soCaptacao: true },
]
const NAV_ADMIN = [
  { key: 'dashboard', label: '📊 Dashboard' },
  { key: 'novo_cliente', label: '➕ Novo cliente (digitar)' },
  { key: 'painel_financeiro', label: '💰 Painel Financeiro' },
  { key: 'metas_financeiras', label: '🥅 Metas & Saúde' },
  { key: 'despesas', label: '📋 Despesas & Custos' },
  { key: 'advogados', label: 'Advogados' },
  { key: 'funil', label: 'Funil' },
  { key: 'compras', label: 'Histórico' },
  { key: 'reposicoes', label: '🔄 Reposições' },
  { key: 'painel_vendas', label: '💵 Painel de vendas' },
  { key: 'validacao_advogado', label: '⚖️ O advogado aceitou?' },
  { key: 'revisao_ia_bf', label: '🩷 Revisão IA Bolsa Família' },
  { key: 'revisao_ia_retroativo', label: '🤱 Revisão IA Retroativo' },
  { key: 'revisao_ia_gestante', label: '🤰 Revisão IA Gestante' },
  { key: 'revisao_ia_clt', label: '💼 Revisão IA CLT' },
  { key: 'mesa_advogada', label: '⚖️ Mesa da Advogada' },
  { key: 'confere_cnis', label: '🔬 Confere CNIS' },
  { key: 'central_retorno', label: '📣 Central de Retorno' },
  { key: 'painel_digitador', label: '🖨️ Painel Digitador BF' },
  { key: 'acompanhamento_mae', label: '🍼 Acompanhamento Mãe' },
  { key: 'fila', label: '📦 Fila de entregas' },
  { key: 'fila_digitacao', label: '📥 Fila de digitação' },
  { key: 'devolucoes', label: '⚠️ Devoluções' },
  { key: 'ranking', label: '🏆 Ranking vendedoras' },
  { key: 'contratos', label: '📄 Gerar contratos (manual)' },
  { key: 'supervisor_producao', label: '📊 Supervisão Produção' },
  { key: 'pos_venda', label: '📞 Pós-venda' },
  { key: 'pos_venda_historico', label: '📚 Histórico pós-venda' },
  { key: 'revisao_ia', label: '🤖 Revisão IA' },
  { key: 'performance_ia', label: '📈 Performance IA' },
]

// ===== agrupamento visual do menu (só organização — não muda acesso) =====
const GRUPO_DE = {
  dashboard: 'Gestão', painel_financeiro: 'Gestão', metas_financeiras: 'Gestão',
  despesas: 'Gestão', recebimentos: 'Gestão', financeiro: 'Gestão', metas: 'Gestão',
  bi: 'Gestão', equipe: 'Gestão', advogados: 'Gestão', funil: 'Gestão',
  compras: 'Gestão', reposicoes: 'Gestão', meulink: 'Gestão',
  painel_vendas: 'Gestão', validacao_advogado: 'Gestão',
  revisao_ia_bf: 'Operação IA', revisao_ia_retroativo: 'Operação IA', revisao_ia_gestante: 'Operação IA',
  revisao_ia_clt: 'Operação IA', confere_cnis: 'Operação IA', central_retorno: 'Operação IA',
  mesa_advogada: 'Operação IA',
  painel_digitador: 'Operação IA', revisao_ia: 'Operação IA',
  performance_ia: 'Operação IA', distribuicao_gabriela: 'Operação IA',
  simulacao_emprestimo: 'Operação IA',
}
const ORDEM_GRUPOS = ['Gestão', 'Operação IA', 'Produção']
const grupoDe = (key) => GRUPO_DE[key] || 'Produção'

const t = {
  sidebar: {
    width: 236, flexShrink: 0, display: 'flex', flexDirection: 'column',
    background: '#1e2430',
    backgroundImage: 'radial-gradient(500px 220px at 50% -60px, rgba(96,165,250,.14), transparent 70%)',
    borderRight: '1px solid rgba(15,23,42,0.08)',
    boxShadow: '4px 0 28px rgba(0,0,0,0.35)',
    padding: '18px 12px 14px', height: '100vh', position: 'sticky', top: 0, overflowY: 'auto',
  },
  logoIco: {
    width: 32, height: 32, borderRadius: 10, display: 'grid', placeItems: 'center',
    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff',
    fontWeight: 800, fontSize: 14, flexShrink: 0,
    boxShadow: '0 0 0 1px rgba(255,255,255,.08), 0 4px 14px rgba(59,130,246,.45)',
  },
  grupo: {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.4px',
    color: '#7c8aa3', padding: '14px 10px 6px',
  },
  item: (ativo) => ({
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    width: '100%', padding: '9px 11px', borderRadius: 11, border: 'none',
    textAlign: 'left', cursor: 'pointer', marginBottom: 2,
    fontSize: 13, fontWeight: ativo ? 600 : 500, fontFamily: 'inherit',
    color: ativo ? '#ffffff' : '#a3adbd',
    background: ativo ? 'linear-gradient(90deg, rgba(96,165,250,.22), rgba(96,165,250,.05))' : 'transparent',
    boxShadow: ativo ? 'inset 0 0 0 1px rgba(96,165,250,.28)' : 'none',
    transition: 'background .15s, color .15s',
  }),
  badgeVerde: {
    background: 'rgba(52,211,153,.18)', color: '#34d399',
    fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
    boxShadow: 'inset 0 0 0 1px rgba(52,211,153,.35)', minWidth: 18, textAlign: 'center',
  },
  userBox: {
    marginTop: 'auto', padding: '11px 10px', borderRadius: 12,
    background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)',
    boxShadow: 'none',
  },
  avatar: {
    width: 32, height: 32, borderRadius: 999, display: 'grid', placeItems: 'center',
    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff',
    fontWeight: 700, fontSize: 12, flexShrink: 0,
  },
}

function iniciais(nome) {
  const p = (nome || '?').trim().split(/\s+/)
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?'
}

export default function Layout({ children, page, setPage }) {
  const { profile, signOut } = useAuth()
  const isMobile = useIsMobile()
  const [menuOpen, setMenuOpen] = useState(false)
  const [novosLotes, setNovosLotes] = useState(0)

  useEffect(() => { carregarFonte() }, [])

  const navBase = profile?.role === 'admin' ? NAV_ADMIN
    : profile?.role === 'produtor' ? NAV_PRODUTOR
    : profile?.role === 'supervisor_producao' ? NAV_SUPERVISOR_PRODUCAO
    : profile?.role === 'supervisor_visualizacao' ? NAV_SUPERVISOR_VIEW
    : profile?.role === 'analista' ? NAV_ANALISTA
    : profile?.role === 'analista_ia' ? NAV_ANALISTA_IA
    : profile?.role === 'coordenador_b2c' ? NAV_COORDENADOR_B2C
    : profile?.role === 'vendedor_operador' ? NAV_VENDEDOR_OPERADOR
    : profile?.role === 'resgate' ? NAV_RESGATE
    : profile?.role === 'financeiro' ? NAV_FINANCEIRO
    : profile?.role === 'rh' ? NAV_RH
    : profile?.role === 'pos_venda' ? NAV_POS_VENDA
    : profile?.role === 'simulador_emprestimo' ? NAV_SIMULADOR_EMPRESTIMO
    : profile?.role === 'agente_bf' ? NAV_AGENTE_BF
    : profile?.role === 'advogada' ? NAV_ADVOGADA
    : NAV_VENDEDOR

  // Coordenadora de autônomos não vê itens marcados como soCaptacao
  let nav = (profile?.role === 'coordenador_b2c' && profile?.setor_responsavel !== 'captacao')
    ? navBase.filter(n => !n.soCaptacao)
    : navBase

  // Setor resgate: garante o item da ala no menu (independente do role base)
  if (profile?.setor === 'resgate' && !nav.some(n => n.key === 'resgate')) {
    nav = [{ key: 'resgate', label: '🛟 Ala de resgate' }, ...nav]
  }

  // Karol (resgate) tambem valida os Maternidade Mae no pos-venda
  if (profile?.id === '1c9e99ee-02c4-4500-9dd5-9706f95d0ee9' && !nav.some(n => n.key === 'pos_venda')) {
    nav = [...nav, { key: 'pos_venda', label: '📞 Pós-venda (Mãe)' }]
  }
  // Karol: setor de acompanhamento Maternidade Mae
  if (profile?.id === '1c9e99ee-02c4-4500-9dd5-9706f95d0ee9' && !nav.some(n => n.key === 'acompanhamento_mae')) {
    nav = [...nav, { key: 'acompanhamento_mae', label: '🍼 Acompanhamento Mãe' }]
  }
  // Karol: acesso ao Confere CNIS (conferir CNIS das clientes Maternidade Mae)
  if (profile?.id === '1c9e99ee-02c4-4500-9dd5-9706f95d0ee9' && !nav.some(n => n.key === 'confere_cnis')) {
    nav = [...nav, { key: 'confere_cnis', label: '🔬 Confere CNIS' }]
  }
  // Sthefany: valida direito na etapa de analise do Acompanhamento Mae
  if (profile?.id === '88929e81-7223-4754-a17b-1cd08f46195d' && !nav.some(n => n.key === 'acompanhamento_mae')) {
    nav = [...nav, { key: 'acompanhamento_mae', label: '🍼 Acompanhamento Mãe' }]
  }
  // Nadia Cajado e Ju Ferreira: vendedoras B2C que tambem vendem emprestimo
  if (['a3e94f8b-7e64-479b-9d72-1414afb83d1c','7ad37a1d-e5be-438c-9afd-982646d507d4'].includes(profile?.id) && !nav.some(n => n.key === 'simulacao_emprestimo')) {
    nav = [...nav, { key: 'simulacao_emprestimo', label: '💰 Simulação Empréstimo' }]
  }
  // Agentes BF (Joana, Pamela, Juliana/Ju, Nadia): itens Revisao IA (Bolsa Familia + Retroativo) por ID
  if (IDS_AGENTES_BF.includes(profile?.id) && !nav.some(n => n.key === 'revisao_ia_bf')) {
    nav = [...nav, { key: 'revisao_ia_bf', label: '🩷 Revisão IA Bolsa Família' }]
  }
  if (IDS_AGENTES_BF.includes(profile?.id) && !nav.some(n => n.key === 'revisao_ia_retroativo')) {
    nav = [...nav, { key: 'revisao_ia_retroativo', label: '🤱 Revisão IA Retroativo' }]
  }
  // Duda (retroativo): item Revisao IA Retroativo por ID
  if (IDS_AGENTES_RETROATIVO.includes(profile?.id) && !nav.some(n => n.key === 'revisao_ia_retroativo')) {
    nav = [...nav, { key: 'revisao_ia_retroativo', label: '🤱 Revisão IA Retroativo' }]
  }
  // Egle (supervisora de board): itens Revisao IA (Bolsa Familia + Retroativo) por ID
  if (IDS_SUPERVISOR_BOARD.includes(profile?.id) && !nav.some(n => n.key === 'revisao_ia_bf')) {
    nav = [...nav, { key: 'revisao_ia_bf', label: '🩷 Revisão IA Bolsa Família' }]
  }
  if (IDS_SUPERVISOR_BOARD.includes(profile?.id) && !nav.some(n => n.key === 'revisao_ia_retroativo')) {
    nav = [...nav, { key: 'revisao_ia_retroativo', label: '🤱 Revisão IA Retroativo' }]
  }
  if (IDS_SUPERVISOR_BOARD.includes(profile?.id) && !nav.some(n => n.key === 'revisao_ia_clt')) {
    nav = [...nav, { key: 'revisao_ia_clt', label: '💼 Revisão IA CLT' }]
  }
  if (IDS_SUPERVISOR_BOARD.includes(profile?.id) && !nav.some(n => n.key === 'fila_digitacao')) {
    nav = [...nav, { key: 'fila_digitacao', label: '📥 Fila de digitação' }]
  }
  // Time Maryana Kodos: itens Revisao IA no menu por ID (mantendo o menu do role)
  const IDS_TIME_MARYANA = [
    'be98f268-314f-4114-acc3-7bb9ce7635fd', // Maryana Kodos
    '78e022dd-b499-4e7d-85ce-65922ddbf9cf', // Eduarda (B2C)
    'a1d7dbfb-bc0d-46a3-b523-bfdc15aac0c9', // Leticia
    'a3b8aea4-1b5f-45cb-ba06-192a99bdbf85', // Daniele
    'bb85a0f3-2d79-499e-8b19-6219bd0cef56', // Gislaine
  ]
  if (IDS_TIME_MARYANA.includes(profile?.id)) {
    if (!nav.some(n => n.key === 'revisao_ia_gestante')) nav = [...nav, { key: 'revisao_ia_gestante', label: '🤰 Revisão IA Gestante' }]
    if (!nav.some(n => n.key === 'revisao_ia_bf')) nav = [...nav, { key: 'revisao_ia_bf', label: '🩷 Revisão IA Bolsa Família' }]
    if (!nav.some(n => n.key === 'revisao_ia_retroativo')) nav = [...nav, { key: 'revisao_ia_retroativo', label: '🤱 Revisão IA Retroativo' }]
    if (!nav.some(n => n.key === 'revisao_ia_clt')) nav = [...nav, { key: 'revisao_ia_clt', label: '💼 Revisão IA CLT' }]
  }

  // Operações LICENCIADAS (Ronaldo/Leandro): menu EXCLUSIVO — só as revisões, nada do sistema KR
  const IDS_OPERACAO_LICENCIADA = [
    '72fa4914-e8de-4c0c-a954-b05241e9d1bd', // Thamires (sup. Ronaldo)
    '8bff997b-e43f-4b65-bafc-b4e7e704b14b', // Brenda
    '3a9c1779-2008-4aaa-9cfb-e64336b9207a', // Tamy
    'ed181784-484b-4ad9-9e8c-4f35b1279940', // Kisse
    '7085f131-b2db-4b96-a4db-2a1e2a5bf6f6', // Kayllaine
    'cf6444f5-7e03-4cc7-9442-9b0cb963695a', // Isabelle (sup. Leandro)
    '5d8cf47f-47e8-4d15-a4b8-48308d4b0840', // Rafaelle
    '977a4664-eb04-4a51-84ab-b61449720dc2', // Sara
  ]
  if (IDS_OPERACAO_LICENCIADA.includes(profile?.id)) {
    nav = [
      { key: 'revisao_ia_bf', label: '🩷 Revisão IA Bolsa Família' },
      { key: 'revisao_ia_retroativo', label: '🤱 Revisão IA Retroativo' },
      { key: 'revisao_ia_clt', label: '💼 Revisão IA CLT' },
    ]
  }

  // Confere CNIS (auditoria temporaria): Egle + Duda por ID
  if ((IDS_SUPERVISOR_BOARD.includes(profile?.id) || IDS_AGENTES_RETROATIVO.includes(profile?.id)) && !nav.some(n => n.key === 'confere_cnis')) {
    nav = [...nav, { key: 'confere_cnis', label: '🔬 Confere CNIS' }]
  }

  // Painel de vendas: quem vende ve o proprio numero; quem atende advogado valida o aceite.
  if (['vendedor','supervisor_producao'].includes(profile?.role) && !nav.some(n => n.key === 'validacao_advogado')) {
    nav = [{ key: 'validacao_advogado', label: '⚖️ O advogado aceitou?' },
           { key: 'painel_vendas', label: '💵 Painel de vendas' }, ...nav]
  }
  // 02/09: 'simulador_emprestimo' e 'analista' entraram na lista. A Duda (11.828
  // leads na carteira) e a Sthefany atendem cliente e podem fechar venda, mas o
  // papel delas nao dava acesso ao painel — elas abriam o sistema e o item nem
  // aparecia no menu. Decisao do Bruno: incluir, porque em algum momento elas
  // tambem vao querer anotar uma venda.
  if (['vendedor_operador','coordenador_b2c','simulador_emprestimo','analista']
        .includes(profile?.role) && !nav.some(n => n.key === 'painel_vendas')) {
    nav = [{ key: 'painel_vendas', label: '💵 Painel de vendas' }, ...nav]
  }

  // Planejamento pessoal do Bruno: primeiro item do menu, so pra ele (por ID).
  if (profile?.id === '906f9a57-bd4a-4b0e-9973-0968ef4f1e15' && !nav.some(n => n.key === 'meu_planejamento')) {
    nav = [{ key: 'meu_planejamento', label: '🎯 Meu planejamento' }, ...nav]
  }

  // Vendedoras do Retroativo (Maryana, Sthefany, Eduarda): board do Retroativo no menu,
  // sem tirar nada do que elas ja tinham. La elas so enxergam pre-aprovado real pra frente.
  const IDS_VENDAS_RETROATIVO = [
    'a1d7dbfb-bc0d-46a3-b523-bfdc15aac0c9', // Leticia — entrou no setor 27/08
    'bb85a0f3-2d79-499e-8b19-6219bd0cef56', // Gislaine — entrou no setor 27/08
    'be98f268-314f-4114-acc3-7bb9ce7635fd', // Maryana Kodos
    '88929e81-7223-4754-a17b-1cd08f46195d', // Sthefany Mendes
    '9fbda3fe-22aa-4179-b1a7-005e99660c8d', // Duda — a que ja atuava no setor
    '0a5958b9-d43b-4bac-a01d-af60247dd721', // Agatha Barreto — entrou no setor 27/08
  ]
  if (IDS_VENDAS_RETROATIVO.includes(profile?.id) && !nav.some(n => n.key === 'revisao_ia_retroativo')) {
    nav = [{ key: 'revisao_ia_retroativo', label: '🤱 Revisão IA Retroativo' }, ...nav]
  }

  // Clientes (consulta geral de clientes e documentos): item por ID (Bruno, Agatha, Maryana)
  if (IDS_ACESSO_CLIENTES.includes(profile?.id) && !nav.some(n => n.key === 'clientes')) {
    nav = [...nav, { key: 'clientes', label: '📋 Clientes' }]
  }

  // Fila de entregas por ID: a coordenadora nao tem essa tela no menu do papel dela
  if (IDS_FILA_ENTREGAS.includes(profile?.id) && !nav.some(n => n.key === 'fila')) {
    nav = [...nav, { key: 'fila', label: '📦 Fila de entregas' }]
  }

  // Conta novos lotes liberados (badge no menu) — só pra vendedor de advogado e admin
  useEffect(() => {
    if (profile?.role !== 'vendedor' && profile?.role !== 'admin') return
    let q = supabase.from('lotes').select('id', { count: 'exact', head: true }).eq('notificacao_pendente', true)
    if (profile?.role === 'vendedor') q = q.eq('vendedor_id', profile.id)
    q.then(({ count }) => setNovosLotes(count || 0))
    const i = setInterval(() => {
      let qq = supabase.from('lotes').select('id', { count: 'exact', head: true }).eq('notificacao_pendente', true)
      if (profile?.role === 'vendedor') qq = qq.eq('vendedor_id', profile.id)
      qq.then(({ count }) => setNovosLotes(count || 0))
    }, 60000)
    return () => clearInterval(i)
  }, [profile, page])

  const rotulo = profile?.role === 'admin' ? 'Administrador'
    : profile?.role === 'supervisor_producao' ? 'Supervisor de Produção'
    : profile?.role === 'supervisor_visualizacao' ? 'Supervisor (Visualização)'
    : profile?.role === 'analista' ? 'Analista'
    : profile?.role === 'analista_ia' ? 'Analista IA'
    : profile?.role === 'coordenador_b2c' ? `Coordenadora ${profile?.setor_responsavel === 'autonomos' ? 'Autônomos' : 'Captação'}`
    : profile?.role === 'pos_venda' ? 'Pós-Venda / Qualidade'
    : profile?.role === 'produtor' ? 'Produtor'
    : profile?.role === 'financeiro' ? 'Financeiro / Pagador'
    : profile?.role === 'rh' ? 'RH'
    : profile?.role === 'vendedor_operador' ? 'Vendedor Operador'
    : profile?.role === 'agente_bf' ? 'Agente Bolsa Família'
    : profile?.role === 'advogada' ? 'Advogada'
    : 'Vendedor'

  // organiza em grupos (mantendo a ordem interna original de cada grupo)
  const mostrarGrupos = nav.length > 6
  const grupos = mostrarGrupos
    ? ORDEM_GRUPOS.map(g => ({ nome: g, itens: nav.filter(n => grupoDe(n.key) === g) })).filter(g => g.itens.length > 0)
    : [{ nome: null, itens: nav }]

  const itemMenu = (n) => {
    const ativo = page === n.key
    const isLotesEntregues = n.key === 'lotes_entregues'
    const showBadge = isLotesEntregues && novosLotes > 0 && page !== 'lotes_entregues'
    return (
      <button
        key={n.key}
        onClick={() => { setPage(n.key); setMenuOpen(false) }}
        style={t.item(ativo)}
        onMouseEnter={e => { if (!ativo) { e.currentTarget.style.background = 'rgba(255,255,255,.05)'; e.currentTarget.style.color = '#e2e8f0' } }}
        onMouseLeave={e => { if (!ativo) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#a3adbd' } }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.label}</span>
        {showBadge && <span style={t.badgeVerde}>{novosLotes}</span>}
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: fonte.familia, ...fundoMesh }}>
      {isMobile && menuOpen && (
        <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(3,7,18,0.55)', zIndex: 299, backdropFilter: 'blur(2px)' }} />
      )}

      {(!isMobile || menuOpen) && (
        <div style={{
          ...t.sidebar,
          ...(isMobile ? { position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 300, boxShadow: '8px 0 40px rgba(0,0,0,0.5)' } : {}),
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 8px 16px' }}>
            <div style={t.logoIco}>KR</div>
            <div>
              <div style={{ color: '#f1f5fb', fontWeight: 700, fontSize: 14.5, letterSpacing: '.1px' }}>KR Previdência</div>
              <div style={{ color: '#7c8aa3', fontSize: 10, fontWeight: 600, letterSpacing: '1.6px', textTransform: 'uppercase' }}>CRM Operacional</div>
            </div>
          </div>

          {grupos.map(g => (
            <div key={g.nome || 'menu'}>
              {g.nome && <div style={t.grupo}>{g.nome}</div>}
              {g.itens.map(itemMenu)}
            </div>
          ))}

          <div style={t.userBox}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={t.avatar}>{iniciais(profile?.nome)}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ color: '#e2e8f0', fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile?.nome}</div>
                <div style={{ color: '#7c8aa3', fontSize: 10.5 }}>{rotulo}</div>
              </div>
              <NotificacoesBell onNavigate={(p) => setPage(p)} />
            </div>
            <button onClick={signOut} style={{ marginTop: 8, width: '100%', padding: '6px 0', borderRadius: 8, border: '1px solid rgba(248,113,113,.25)', background: 'rgba(248,113,113,.08)', color: '#f87171', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Sair
            </button>
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {isMobile && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 56, background: '#1e2430', borderBottom: '1px solid rgba(148,163,184,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1rem', zIndex: 100 }}>
            <button onClick={() => setMenuOpen(!menuOpen)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: '#e6edf7', padding: '4px 8px', lineHeight: 1, position: 'relative' }}>
              ☰
              {novosLotes > 0 && (
                <span style={{ position: 'absolute', top: 0, right: 0, background: '#34d399', color: '#052e1c', fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 6 }}>
                  {novosLotes}
                </span>
              )}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ ...t.logoIco, width: 26, height: 26, fontSize: 11, borderRadius: 8 }}>KR</div>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: '#f1f5fb' }}>KR Previdência</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <NotificacoesBell onNavigate={(p) => { setPage(p); setMenuOpen(false) }} />
              <button onClick={signOut} style={{ fontSize: 12, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer' }}>Sair</button>
            </div>
          </div>
        )}
        <div style={{ padding: isMobile ? '1rem' : '1.5rem', paddingTop: isMobile ? '72px' : '1.5rem', overflowY: 'auto', flex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}
