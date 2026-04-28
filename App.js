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
import Portal from './pages/Portal'

function PortalRoute() {
  const [vendedor, setVendedor] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const path = window.location.pathname
    const match = path.match(/\/cadastro\/([^/]+)/)
    if (match) {
      const id = match[1]
      supabase.from('profiles').select('id, nome').eq('id', id).single().then(({ data }) => {
        setVendedor(data)
        setLoading(false)
      })
    } else {
      setLoading(false)
    }
  }, [])

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f8f6', fontSize: 14, color: '#888' }}>Carregando...</div>
  if (!vendedor) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f8f6', fontSize: 14, color: '#888' }}>Link inválido</div>
  return <Portal vendedorId={vendedor.id} vendedorNome={vendedor.nome} />
}

function paginaInicial(role) {
  if (role === 'produtor') return 'contratos'
  if (role === 'supervisor_producao') return 'fila_digitacao'
  if (role === 'vendedor_operador') return 'meus_clientes'
  return 'dashboard'
}

function paginaPermitida(role, page) {
  if (role === 'admin') return true
  if (role === 'vendedor') return ['dashboard','advogados','funil','compras','meulink','fila'].includes(page)
  if (role === 'produtor') return ['contratos'].includes(page)
  if (role === 'supervisor_producao') return ['fila_digitacao','ranking','supervisor_producao','contratos'].includes(page)
  if (role === 'vendedor_operador') return ['meus_clientes','novo_cliente','meu_desempenho'].includes(page)
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
    meus_clientes: <MeusClientes />,
    novo_cliente: <NovoCliente onSucesso={() => setPage('meus_clientes')} />,
    meu_desempenho: <MeuDesempenho />,
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
