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
  if (role === 'supervisor_producao') return 'fila_digitacao'
  if (role === 'analista') return 'entregas'
  if (role === 'analista_ia') return 'revisao_ia'
  if (role === 'coordenador_b2c') return 'painel_coordenador'
  if (role === 'vendedor_operador') return 'meus_clientes'
  if (role === 'pos_venda') return 'pos_venda'
  return 'dashboard'
}

function paginaPermitida(role, page) {
  if (role === 'admin') return true
  if (role === 'vendedor') return ['dashboard','advogados','funil','compras','meulink','fila','lotes_entregues','devolucoes'].includes(page)
  if (role === 'produtor') return ['contratos'].includes(page)
  if (role === 'supervisor_producao') return ['fila_digitacao','ranking','supervisor_producao','contratos','devolucoes'].includes(page)
  if (role === 'analista') return ['dashboard','advogados','entregas','fila','ranking','supervisor_producao','devolucoes'].includes(page)
  if (role === 'analista_ia') return ['revisao_ia','performance_ia'].includes(page)
  if (role === 'coordenador_b2c') return ['painel_coordenador','dashboard','meus_clientes','supervisor_producao','fila_digitacao','ranking','dashboard_producao','pos_venda','pos_venda_historico','revisao_ia','performance_ia','devolucoes'].includes(page)
  if (role === 'vendedor_operador') return ['meus_clientes','novo_cliente','meu_desempenho','devolucoes'].includes(page)
  if (role === 'pos_venda') return ['pos_venda','pos_venda_historico'].includes(page)
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
  }

  const paginaSegura = paginaPermitida(profile.role, page) ? page : paginaInicial(profile.role)

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
