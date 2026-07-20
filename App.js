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

// Agentes BF (Joana, Pamela, Juliana/Ju, Nadia): acesso por ID, sem perder os roles atuais
const IDS_AGENTES_BF = [
  '758a33f7-e5a2-4ef7-943a-dfe0ac72a387', // Joana
  '64ced61d-fdae-4399-97c9-900c59120fff', // Pamela
  '7ad37a1d-e5be-438c-9afd-982646d507d4', // Juliana (Ju Ferreira)
  'a3e94f8b-7e64-479b-9d72-1414afb83d1c', // Nadia Cajado
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
  return 'dashboard'
}

function paginaPermitida(profile, page) {
  const role = profile.role
  // Setor resgate vê a tela da ala
  if (profile.setor === 'resgate' && page === 'resgate') return true
  // Karol (resgate) tambem acessa o pos-venda pra validar/barrar os Maternidade Mae
  if (profile.id === '1c9e99ee-02c4-4500-9dd5-9706f95d0ee9' && ['pos_venda','pos_venda_historico','acompanhamento_mae'].includes(page)) return true
  // Nadia Cajado e Ju Ferreira: vendedoras B2C que TAMBEM vendem emprestimo (acesso extra a tela de emprestimo, sem perder o B2C)
  if (['a3e94f8b-7e64-479b-9d72-1414afb83d1c','7ad37a1d-e5be-438c-9afd-982646d507d4'].includes(profile.id) && page === 'simulacao_emprestimo') return true
  // Agentes BF (Joana, Pamela, Juliana/Ju, Nadia): acesso a Revisao IA Bolsa Familia por ID, sem perder roles atuais
  if (IDS_AGENTES_BF.includes(profile.id) && page === 'revisao_ia_bf') return true
  if (role === 'admin') return true
  if (role === 'vendedor') return ['dashboard','advogados','funil','compras','meulink','fila','lotes_entregues','devolucoes','resgate_vendedor'].includes(page)
  if (role === 'produtor') return ['contratos'].includes(page)
  if (role === 'financeiro') return ['financeiro','despesas','recebimentos'].includes(page)
  if (role === 'rh') return ['financeiro'].includes(page)
  if (role === 'supervisor_producao') return ['fila_digitacao','ranking','supervisor_producao','contratos','devolucoes'].includes(page)
  if (role === 'supervisor_visualizacao') return ['supervisor_producao'].includes(page)
  if (role === 'analista') return ['dashboard','painel_financeiro','metas_financeiras','advogados','entregas','fila','ranking','supervisor_producao','devolucoes','resgate','resgate_vendedor'].includes(page)
  if (role === 'analista_ia') return ['revisao_ia','performance_ia'].includes(page)
  if (role === 'coordenador_b2c') return ['painel_coordenador','dashboard','meus_clientes','supervisor_producao','fila_digitacao','ranking','dashboard_producao','pos_venda','pos_venda_historico','revisao_ia','performance_ia','devolucoes'].includes(page)
  if (role === 'vendedor_operador') return ['meus_clientes','novo_cliente','meu_desempenho','devolucoes'].includes(page)
  if (role === 'pos_venda') return ['pos_venda','pos_venda_historico'].includes(page)
  if (role === 'simulador_emprestimo') return ['simulacao_emprestimo'].includes(page)
  if (role === 'agente_bf') return ['revisao_ia_bf'].includes(page)
  return false
}

function AppInner() {
  const { user, profile, loading } = useAuth()
  const [page, setPage] = useState(null)

  useEffect(() => {
    if (profile?.role && page === null) {
      setPage(paginaInicial(profile.role))
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
  }

  const paginaSegura = paginaPermitida(profile, page) ? page : paginaInicial(profile.role)

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
