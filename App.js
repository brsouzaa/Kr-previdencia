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
import DashboardProducao from './pages/DashboardProducao'
import ModalEmailNotificacao from './components/ModalEmailNotificacao'
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

function AppInner() {
  const { user, profile, loading } = useAuth()
  const [page, setPage] = useState('dashboard')
  const [showEmailModal, setShowEmailModal] = useState(false)

  useEffect(() => {
    if (profile && profile.notificacao_pendente && !window.location.pathname.startsWith('/cadastro/')) {
      setShowEmailModal(true)
    }
  }, [profile])

  // Define a página inicial conforme o role
  useEffect(() => {
    if (profile?.role === 'supervisor_producao') {
      setPage('dashboard_producao')
    } else if (profile?.role === 'produtor') {
      setPage('contratos')
    }
  }, [profile])

  // Roteamento do portal (sem login)
  const isPortal = window.location.pathname.startsWith('/cadastro/')
  if (isPortal) return <PortalRoute />

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f8f6' }}>
      <div style={{ fontSize: 14, color: '#888' }}>Carregando...</div>
    </div>
  )

  if (!user) return <Login />

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
    dashboard_producao: <DashboardProducao />,
  }

  return (
    <>
      <Layout page={page} setPage={setPage}>
        {pages[page] || <Dashboard />}
      </Layout>
      {showEmailModal && <ModalEmailNotificacao onClose={() => setShowEmailModal(false)} />}
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
