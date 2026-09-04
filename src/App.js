import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Layout from './components/Layout'
import Advogados from './pages/Advogados'
import Funil from './pages/Funil'
import Compras from './pages/Compras'
import Equipe from './pages/Equipe'
import Dashboard from './pages/Dashboard'
import PainelFinanceiro from './pages/PainelFinanceiro'
import MeuLink from './pages/MeuLink'
import FilaEntregas from './pages/FilaEntregas'
import GerarContratos from './pages/GerarContratos'
import SupervisorProducao from './pages/SupervisorProducao'
import NovoCliente from './pages/NovoCliente'
import MeusClientes from './pages/MeusClientes'
import MeuDesempenho from './pages/MeuDesempenho'
import FilaDigitacao from './pages/FilaDigitacao'
import RankingProducao from './pages/RankingProducao'
import Entregas from './pages/Entregas'
import LotesEntregues from './pages/LotesEntregues'
import Devolucoes from './pages/Devolucoes'
import PosVenda from './pages/PosVenda'
import PosVendaHistorico from './pages/PosVendaHistorico'
import Portal from './pages/Portal'
import RevisaoIA from './pages/RevisaoIA'
import PerformanceIA from './pages/PerformanceIA'
import PrimeiroAcesso from './pages/PrimeiroAcesso'
import CoordenadorB2C from './pages/CoordenadorB2C'
import DashboardProducao from './pages/DashboardProducao'
import Metas from './pages/Metas'
import BIBruno from './pages/BIBruno'
import Reposicoes from './pages/Reposicoes'
import SimulacaoEmprestimo from './pages/SimulacaoEmprestimo'
import AcompanhamentoMae from './pages/AcompanhamentoMae'
import DistribuicaoGabriela from './pages/DistribuicaoGabriela'
import ParceriaPensao from './pages/ParceriaPensao'
import Resgate from './pages/Resgate'
import ResgateVendedor from './pages/ResgateVendedor'
import Financeiro from './pages/Financeiro'
import DespesasCustos from './pages/DespesasCustos'
import RecebimentosAdvogados from './pages/RecebimentosAdvogados'
import MetasFinanceiras from './pages/MetasFinanceiras'
import RevisaoIABolsaFamilia from './pages/RevisaoIABolsaFamilia'
import RevisaoIARetroativo from './pages/RevisaoIARetroativo'
import MeuPlanejamento from './pages/MeuPlanejamento'
import PainelVendas from './pages/PainelVendas'
import ValidacaoAdvogado from './pages/ValidacaoAdvogado'
import RevisaoIAGestante from './pages/RevisaoIAGestante'
import RevisaoIACLT from './pages/RevisaoIACLT'
import ConfereCNIS from './pages/ConfereCNIS'
import PainelDigitador from './pages/PainelDigitador'
import Clientes from './pages/Clientes'
import CentralRetorno from './pages/CentralRetorno'
import MesaAdvogada from './pages/MesaAdvogada'

// Vendedoras do Retroativo: Revisao IA Retroativo ja e a tela delas (so ve pre-aprovado real)
const IDS_VENDAS_RETROATIVO = [
  'a1d7dbfb-bc0d-46a3-b523-bfdc15aac0c9', // Leticia — entrou no setor 27/08
  'bb85a0f3-2d79-499e-8b19-6219bd0cef56', // Gislaine — entrou no setor 27/08
  'be98f268-314f-4114-acc3-7bb9ce7635fd', // Maryana Kodos
  '88929e81-7223-4754-a17b-1cd08f46195d', // Sthefany Mendes
  '9fbda3fe-22aa-4179-b1a7-005e99660c8d', // Duda — a que ja atuava no setor
  '0a5958b9-d43b-4bac-a01d-af60247dd721', // Agatha Barreto — entrou no setor 27/08
]

// Agentes BF (Joana, Pamela, Juliana/Ju, Nadia): acesso por ID, sem perder os roles atuais
const IDS_AGENTES_BF = [
  '758a33f7-e5a2-4ef7-943a-dfe0ac72a387', // Joana
  '64ced61d-fdae-4399-97c9-900c59120fff', // Pamela
  '7ad37a1d-e5be-438c-9afd-982646d507d4', // Juliana (Ju Ferreira)
  'a3e94f8b-7e64-479b-9d72-1414afb83d1c', // Nadia Cajado
  '2c71c435-f5c2-49cf-984b-3629438045d2', // Hellen (helenlima451)
]

// Agentes Retroativo (Duda): acesso por ID a tela Revisao IA Retroativo, sem perder role atual
const IDS_AGENTES_RETROATIVO = [
  '9fbda3fe-22aa-4179-b1a7-005e99660c8d', // Supervisora Duda
]

// Supervisores de board (Egle): veem as telas Revisao IA (BF + Retroativo) em modo supervisor
// (todos os atendentes + filtro por atendente + cores), sem ser admin do resto do sistema
const IDS_SUPERVISOR_BOARD = [
  '6db43f01-71e6-4972-b84e-eb49375e8e70', // Egle Marcela
]

// Operações LICENCIADAS (Ronaldo/Leandro): acesso EXCLUSIVO às telas Revisão IA (BF + Retroativo).
// Nada do resto do sistema KR — dashboard, financeiro, funil etc. ficam bloqueados.
const IDS_OPERACAO_LICENCIADA = [
  '72fa4914-e8de-4c0c-a954-b05241e9d1bd', // Thamires (sup. Ronaldo)
  '8bff997b-e43f-4b65-bafc-b4e7e704b14b', // Brenda (Ronaldo)
  '3a9c1779-2008-4aaa-9cfb-e64336b9207a', // Tamy (Ronaldo)
  'ed181784-484b-4ad9-9e8c-4f35b1279940', // Kisse (Ronaldo)
  '7085f131-b2db-4b96-a4db-2a1e2a5bf6f6', // Kayllaine (Ronaldo)
  'cf6444f5-7e03-4cc7-9442-9b0cb963695a', // Isabelle (sup. Leandro)
  '5d8cf47f-47e8-4d15-a4b8-48308d4b0840', // Rafaelle (Leandro)
  '977a4664-eb04-4a51-84ab-b61449720dc2', // Sara (Leandro)
]

// Revisao IA Gestante por ID: entra SO nessa revisao, sem o pacote das quatro
// que o time da Maryana recebe (IDS_TIME_MARYANA)
const IDS_REVISAO_GESTANTE = [
  '6cc8ec02-4aac-4fc7-98f4-d2060f5a6732', // Leandro — 03/09
]

// Fila de entregas: acesso por ID, sem mexer nas telas do papel
const IDS_FILA_ENTREGAS = [
  '0a5958b9-d43b-4bac-a01d-af60247dd721', // Agatha Barreto — 02/09
]

const IDS_ACESSO_CLIENTES = [
  '906f9a57-bd4a-4b0e-9973-0968ef4f1e15', // Bruno Souza
  '0a5958b9-d43b-4bac-a01d-af60247dd721', // Agatha Barreto
  'be98f268-314f-4114-acc3-7bb9ce7635fd', // Maryana Kodos
  'ca0d5035-7275-43f6-b4f2-3c3b4569facb', // Bianca — 02/09
  '6cc8ec02-4aac-4fc7-98f4-d2060f5a6732', // Leandro Enrico — 04/09: supervisiona o gestante
]

// Supervisao Producao por ID: quem supervisiona um setor sem ter o papel
// supervisor_producao. O papel do Leandro e vendedor_operador, que nao tem
// essa tela — mas ele cuida do funil gestante e precisa acompanhar a producao.
const IDS_SUPERVISAO_PRODUCAO = [
  '6cc8ec02-4aac-4fc7-98f4-d2060f5a6732', // Leandro Enrico — 04/09
]

function PortalRoute() {
  const [vendedor, setVendedor] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const path = window.location.pathname
    const match = path.match(/\/cadastro\/([^/]+)/)
    if (match) {
      const id = match[1]
      supabase.from('profiles').select('id, nome').eq('id', id).single().then(({ data }) => {
        setVendedor(data); setLoading(false)
      })
    } else { setLoading(false) }
  }, [])

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f8f6', fontSize: 14, color: '#888' }}>Carregando...</div>
  if (!vendedor) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f8f6', fontSize: 14, color: '#888' }}>Link inválido</div>
  return <Portal vendedorId={vendedor.id} vendedorNome={vendedor.nome} />
}

function paginaInicial(role) {
  if (role === 'produtor') return 'contratos'
  if (role === 'resgate') return 'resgate'
  if (role === 'financeiro') return 'despesas'
  if (role === 'rh') return 'financeiro'
  if (role === 'supervisor_producao') return 'fila_digitacao'
  if (role === 'supervisor_visualizacao') return 'supervisor_producao'
  if (role === 'analista') return 'entregas'
  if (role === 'analista_ia') return 'revisao_ia'
  if (role === 'coordenador_b2c') return 'painel_coordenador'
  if (role === 'vendedor_operador') return 'meus_clientes'
  if (role === 'pos_venda') return 'pos_venda'
  if (role === 'simulador_emprestimo') return 'simulacao_emprestimo'
  if (role === 'agente_bf') return 'revisao_ia_bf'
  if (role === 'advogada') return 'mesa_advogada'
  return 'dashboard'
}

// Time Maryana Kodos (supervisora + vendedoras B2C): acesso extra as telas Revisao IA, sem perder roles
const IDS_TIME_MARYANA = [
  'be98f268-314f-4114-acc3-7bb9ce7635fd', // Maryana Kodos (supervisora)
  '78e022dd-b499-4e7d-85ce-65922ddbf9cf', // Eduarda (B2C)
  'a1d7dbfb-bc0d-46a3-b523-bfdc15aac0c9', // Leticia
  'a3b8aea4-1b5f-45cb-ba06-192a99bdbf85', // Jose Carlos Galvao (o comentario dizia 'Daniele' — errado, corrigido 03/09)
  'bb85a0f3-2d79-499e-8b19-6219bd0cef56', // Gislaine
]

function paginaPermitida(profile, page) {
  const role = profile.role
  // Planejamento pessoal do Bruno: so ele, por ID. Nao e feature de admin.
  if (page === 'meu_planejamento') return profile.id === '906f9a57-bd4a-4b0e-9973-0968ef4f1e15'
  // Painel de vendas e validacao do advogado (31/08). Aditivo: nao tira acesso de ninguem.
  // Validar quem o advogado aceitou e do vendedor que atende o advogado (role vendedor).
  // 02/09 (correcao): 'simulador_emprestimo' e 'analista' entraram na regra do MENU
  // no Layout.js e nao entraram aqui — o item aparecia e a pagina era negada, entao
  // o clique devolvia a pessoa pra tela inicial do papel dela, sem explicacao.
  // Atinge Duda, Sthefany, Joana, Pamela, Egle e Lerine. As duas listas tem que bater.
  if (page === 'painel_vendas') return ['admin','vendedor','vendedor_operador','supervisor_producao','coordenador_b2c','simulador_emprestimo','analista'].includes(role)
  if (page === 'validacao_advogado') return ['admin','vendedor','supervisor_producao'].includes(role)
  // Advogada (Maithe): mesa dela e mais nada do sistema
  if (role === 'advogada') return page === 'mesa_advogada'
  // Vendedoras do retroativo: board do Retroativo ALEM do que ja tem hoje
  if (IDS_VENDAS_RETROATIVO.includes(profile.id) && page === 'revisao_ia_retroativo') return true
  // Página Clientes (consulta geral de clientes + documentos): acesso restrito por ID
  if (IDS_ACESSO_CLIENTES.includes(profile.id) && page === 'clientes') return true
  // Supervisao Producao por ID (Leandro): a tela nao faz parte do papel vendedor_operador
  if (IDS_SUPERVISAO_PRODUCAO.includes(profile.id) && page === 'supervisor_producao') return true
  // Fila de entregas por ID (Agatha): a tela nao faz parte do papel coordenador_b2c
  if (IDS_FILA_ENTREGAS.includes(profile.id) && page === 'fila') return true
  // Revisao IA Gestante por ID (Leandro): so essa revisao, nao o pacote do time da Maryana
  if (IDS_REVISAO_GESTANTE.includes(profile.id) && page === 'revisao_ia_gestante') return true
  // Time Maryana: telas Revisao IA por ID (alem das telas do role atual)
  if (IDS_TIME_MARYANA.includes(profile.id) && ['revisao_ia_bf','revisao_ia_retroativo','revisao_ia_clt','revisao_ia_gestante'].includes(page)) return true
  // Operações licenciadas: SÓ as telas de Revisão IA — bloqueia todo o resto do sistema KR
  if (IDS_OPERACAO_LICENCIADA.includes(profile.id)) return ['revisao_ia_bf','revisao_ia_retroativo','revisao_ia_clt'].includes(page)
  // Setor resgate vê a tela da ala
  if (profile.setor === 'resgate' && page === 'resgate') return true
  // Karol (resgate) tambem acessa o pos-venda pra validar/barrar os Maternidade Mae
  if (profile.id === '1c9e99ee-02c4-4500-9dd5-9706f95d0ee9' && ['pos_venda','pos_venda_historico','acompanhamento_mae','confere_cnis'].includes(page)) return true
  // Sthefany (analista): valida direito na etapa de analise do Acompanhamento Mae
  if (profile.id === '88929e81-7223-4754-a17b-1cd08f46195d' && page === 'acompanhamento_mae') return true
  // Nadia Cajado e Ju Ferreira: vendedoras B2C que TAMBEM vendem emprestimo (acesso extra a tela de emprestimo, sem perder o B2C)
  if (['a3e94f8b-7e64-479b-9d72-1414afb83d1c','7ad37a1d-e5be-438c-9afd-982646d507d4'].includes(profile.id) && page === 'simulacao_emprestimo') return true
  // Agentes BF (Joana, Pamela, Ju, Nadia): acesso a tela Revisao IA Bolsa Familia por ID, sem perder roles
  if (IDS_AGENTES_BF.includes(profile.id) && page === 'revisao_ia_bf') return true
  // Duda (retroativo): acesso a tela Revisao IA Retroativo por ID
  if (IDS_AGENTES_RETROATIVO.includes(profile.id) && ['revisao_ia_retroativo','confere_cnis'].includes(page)) return true
  // Egle (supervisora de board): acesso as DUAS telas Revisao IA
  if (IDS_SUPERVISOR_BOARD.includes(profile.id) && ['revisao_ia_bf','revisao_ia_retroativo','revisao_ia_clt','fila_digitacao','confere_cnis'].includes(page)) return true
  if (profile.role === 'agente_bf') return ['revisao_ia_bf','revisao_ia_retroativo'].includes(page)
  if (role === 'admin') return true
  if (role === 'vendedor') return ['dashboard','advogados','funil','compras','meulink','fila','lotes_entregues','devolucoes','resgate_vendedor'].includes(page)
  if (role === 'produtor') return ['contratos'].includes(page)
  if (role === 'financeiro') return ['financeiro','despesas','recebimentos'].includes(page)
  if (role === 'rh') return ['financeiro'].includes(page)
  if (role === 'supervisor_producao') return ['fila_digitacao','ranking','supervisor_producao','contratos','devolucoes','novo_cliente'].includes(page)
  if (role === 'supervisor_visualizacao') return ['supervisor_producao'].includes(page)
  if (role === 'analista') return ['dashboard','painel_financeiro','metas_financeiras','advogados','entregas','fila','ranking','supervisor_producao','devolucoes','resgate','resgate_vendedor'].includes(page)
  if (role === 'analista_ia') return ['revisao_ia','performance_ia'].includes(page)
  if (role === 'coordenador_b2c') return ['painel_coordenador','dashboard','meus_clientes','supervisor_producao','fila_digitacao','ranking','dashboard_producao','pos_venda','pos_venda_historico','revisao_ia','performance_ia','devolucoes'].includes(page)
  if (role === 'vendedor_operador') return ['meus_clientes','novo_cliente','meu_desempenho','devolucoes'].includes(page)
  if (role === 'pos_venda') return ['pos_venda','pos_venda_historico'].includes(page)
  if (role === 'simulador_emprestimo') return ['simulacao_emprestimo'].includes(page)
  return false
}

function AppInner() {
  const { user, profile, loading } = useAuth()
  const [page, setPage] = useState(null)

  useEffect(() => {
    if (profile?.role && page === null) {
      setPage(IDS_OPERACAO_LICENCIADA.includes(profile.id) ? 'revisao_ia_bf' : paginaInicial(profile.role))
    }
  }, [profile, page])

  const isPortal = window.location.pathname.startsWith('/cadastro/')
  if (isPortal) return <PortalRoute />

  const isParceriaPensao = window.location.pathname.startsWith('/parceria-pensao')
  if (isParceriaPensao) return <ParceriaPensao />

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f8f6' }}>
      <div style={{ fontSize: 14, color: '#888' }}>Carregando...</div>
    </div>
  )

  if (!user) return <Login />

  if (!profile || page === null) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f8f6' }}>
      <div style={{ fontSize: 14, color: '#888' }}>Carregando...</div>
    </div>
  )

  // Primeiro acesso: força troca de senha + nome
  if (profile.senha_temporaria === true) return <PrimeiroAcesso />

  const pages = {
    dashboard: <Dashboard />,
    painel_financeiro: <PainelFinanceiro />,
    advogados: <Advogados />,
    funil: <Funil />,
    compras: <Compras />,
    equipe: <Equipe />,
    meulink: <MeuLink />,
    fila: <FilaEntregas />,
    contratos: <GerarContratos />,
    supervisor_producao: <SupervisorProducao />,
    fila_digitacao: <FilaDigitacao />,
    confere_cnis: <ConfereCNIS />,
    painel_digitador: <PainelDigitador />,
    clientes: <Clientes />,
    ranking: <RankingProducao />,
    entregas: <Entregas />,
    lotes_entregues: <LotesEntregues />,
    devolucoes: <Devolucoes />,
    meus_clientes: <MeusClientes />,
    novo_cliente: <NovoCliente onSucesso={() => setPage('meus_clientes')} />,
    meu_desempenho: <MeuDesempenho />,
    pos_venda: <PosVenda />,
    pos_venda_historico: <PosVendaHistorico />,
    revisao_ia: <RevisaoIA />,
    performance_ia: <PerformanceIA />,
    painel_coordenador: <CoordenadorB2C />,
    dashboard_producao: <DashboardProducao />,
    metas: <Metas />,
    bi: <BIBruno />,
    reposicoes: <Reposicoes />,
    simulacao_emprestimo: <SimulacaoEmprestimo />,
    acompanhamento_mae: <AcompanhamentoMae />,
    resgate: <Resgate />,
    resgate_vendedor: <ResgateVendedor />,
    distribuicao_gabriela: <DistribuicaoGabriela />,
    financeiro: <Financeiro />,
    despesas: <DespesasCustos />,
    recebimentos: <RecebimentosAdvogados />,
    metas_financeiras: <MetasFinanceiras />,
    revisao_ia_bf: <RevisaoIABolsaFamilia />,
    revisao_ia_retroativo: <RevisaoIARetroativo />,
    meu_planejamento: <MeuPlanejamento />,
    painel_vendas: <PainelVendas />,
    validacao_advogado: <ValidacaoAdvogado />,
    revisao_ia_gestante: <RevisaoIAGestante />,
    revisao_ia_clt: <RevisaoIACLT />,
    central_retorno: <CentralRetorno />,
    mesa_advogada: <MesaAdvogada />,
  }

  const paginaSegura = paginaPermitida(profile, page) ? page : (IDS_OPERACAO_LICENCIADA.includes(profile.id) ? 'revisao_ia_bf' : paginaInicial(profile.role))

  return (
    <Layout page={paginaSegura} setPage={setPage}>
      {pages[paginaSegura]}
    </Layout>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
