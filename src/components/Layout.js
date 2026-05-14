import { useState, useEffect } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import NotificacoesBell from './NotificacoesBell'

const NAV_PRODUTOR = [
  { key: 'contratos', label: '📄 Gerar contratos' },
]
const NAV_SUPERVISOR_PRODUCAO = [
  { key: 'fila_digitacao', label: '📥 Fila de digitação' },
  { key: 'devolucoes', label: '⚠️ Devoluções' },
  { key: 'ranking', label: '🏆 Ranking vendedoras' },
  { key: 'supervisor_producao', label: '📊 Supervisão' },
  { key: 'contratos', label: '📄 Gerar contratos (manual)' },
]
const NAV_ANALISTA = [
  { key: 'dashboard', label: '📊 Dashboard' },
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
  { key: 'meulink', label: '🔗 Meu link' },
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
const NAV_ANALISTA_IA = [
  { key: 'revisao_ia', label: '🤖 Revisão IA' },
  { key: 'performance_ia', label: '📈 Performance IA' },
]
const NAV_COORDENADOR_B2C = [
  { key: 'painel_coordenador', label: '🎛️ Painel da coordenadora' },
  { key: 'dashboard', label: '📊 Dashboard B2C' },
  { key: 'meus_clientes', label: '📋 Clientes do setor' },
  { key: 'supervisor_producao', label: '📊 Supervisão produção' },
  { key: 'fila_digitacao', label: '📥 Fila de digitação' },
  { key: 'ranking', label: '🏆 Ranking vendedoras' },
  { key: 'dashboard_producao', label: '📈 Dashboard produção' },
  { key: 'pos_venda', label: '📞 Pós-venda' },
  { key: 'pos_venda_historico', label: '📚 Histórico pós-venda' },
  { key: 'devolucoes', label: '⚠️ Devoluções' },
  // Bloco IA só aparece se setor_responsavel = captacao (filtrado abaixo no map do nav)
  { key: 'revisao_ia', label: '🤖 Revisão IA', soCaptacao: true },
  { key: 'performance_ia', label: '📈 Performance IA', soCaptacao: true },
]
const NAV_ADMIN = [
  { key: 'dashboard', label: '📊 Dashboard' },
  { key: 'advogados', label: 'Advogados' },
  { key: 'funil', label: 'Funil' },
  { key: 'compras', label: 'Histórico' },
  { key: 'equipe', label: 'Equipe' },
  { key: 'fila', label: '📦 Fila de entregas' },
  { key: 'fila_digitacao', label: '📥 Fila de digitação' },
  { key: 'devolucoes', label: '⚠️ Devoluções' },
  { key: 'ranking', label: '🏆 Ranking vendedoras' },
  { key: 'contratos', label: '📄 Gerar contratos (manual)' },
  { key: 'dashboard_producao', label: '📈 Dashboard Produção' },
  { key: 'supervisor_producao', label: '📊 Supervisão Produção' },
  { key: 'revisao_ia', label: '🤖 Revisão IA' },
  { key: 'performance_ia', label: '📈 Performance IA' },
  { key: 'meulink', label: '🔗 Meu link' },
]

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

export default function Layout({ children, page, setPage }) {
  const { profile, signOut } = useAuth()
  const isMobile = useIsMobile()
  const [menuOpen, setMenuOpen] = useState(false)
  const [novosLotes, setNovosLotes] = useState(0)

  const navBase = profile?.role === 'admin' ? NAV_ADMIN
    : profile?.role === 'produtor' ? NAV_PRODUTOR
    : profile?.role === 'supervisor_producao' ? NAV_SUPERVISOR_PRODUCAO
    : profile?.role === 'analista' ? NAV_ANALISTA
    : profile?.role === 'analista_ia' ? NAV_ANALISTA_IA
    : profile?.role === 'coordenador_b2c' ? NAV_COORDENADOR_B2C
    : profile?.role === 'vendedor_operador' ? NAV_VENDEDOR_OPERADOR
    : profile?.role === 'pos_venda' ? NAV_POS_VENDA
    : NAV_VENDEDOR

  // Coordenadora de autônomos não vê itens marcados como soCaptacao
  const nav = (profile?.role === 'coordenador_b2c' && profile?.setor_responsavel !== 'captacao')
    ? navBase.filter(n => !n.soCaptacao)
    : navBase

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

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8f8f6' }}>
      {isMobile && menuOpen && (
        <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 299 }} />
      )}

      {(!isMobile || menuOpen) && (
        <div style={{
          width: 220, background: '#fff',
          borderRight: '0.5px solid rgba(0,0,0,0.1)',
          display: 'flex', flexDirection: 'column',
          padding: '1.25rem 0', flexShrink: 0,
          ...(isMobile ? { position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 300, boxShadow: '4px 0 20px rgba(0,0,0,0.15)' } : {})
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#111', padding: '0 1.25rem 1.25rem', borderBottom: '0.5px solid rgba(0,0,0,0.08)', marginBottom: '0.75rem' }}>
            KR <span style={{ color: '#185FA5' }}>Previdência</span>
          </div>
          {nav.map(n => {
            const isLotesEntregues = n.key === 'lotes_entregues'
            const showBadge = isLotesEntregues && novosLotes > 0 && page !== 'lotes_entregues'
            return (
              <button key={n.key} onClick={() => { setPage(n.key); setMenuOpen(false) }} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 1.25rem', fontSize: 13,
                color: page === n.key ? '#185FA5' : '#555',
                fontWeight: page === n.key ? 500 : 400,
                background: page === n.key ? '#E6F1FB' : 'transparent',
                cursor: 'pointer', textAlign: 'left',
                border: 'none', borderLeftWidth: 2, borderLeftStyle: 'solid',
                borderLeftColor: page === n.key ? '#185FA5' : 'transparent',
                width: '100%'
              }}>
                <span>{n.label}</span>
                {showBadge && (
                  <span style={{
                    background: '#3B6D11', color: '#fff',
                    fontSize: 10, fontWeight: 600,
                    padding: '2px 6px', borderRadius: 8,
                    minWidth: 18, textAlign: 'center',
                  }}>{novosLotes}</span>
                )}
              </button>
            )
          })}
          <div style={{ marginTop: 'auto', padding: '1rem 1.25rem', borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#111', marginBottom: 2 }}>{profile?.nome}</div>
              <NotificacoesBell onNavigate={(p) => setPage(p)} />
            </div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
              {profile?.role === 'admin' ? 'Administrador'
                : profile?.role === 'supervisor_producao' ? 'Supervisor de Produção'
                : profile?.role === 'analista' ? 'Analista'
                : profile?.role === 'analista_ia' ? 'Analista IA'
                : profile?.role === 'coordenador_b2c' ? `Coordenadora ${profile?.setor_responsavel === 'autonomos' ? 'Autônomos' : 'Captação'}`
                : profile?.role === 'pos_venda' ? 'Pós-Venda / Qualidade'
                : profile?.role === 'produtor' ? 'Produtor'
                : profile?.role === 'vendedor_operador' ? 'Vendedor Operador'
                : 'Vendedor'}
            </div>
            <button onClick={signOut} style={{ fontSize: 12, color: '#A32D2D', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Sair</button>
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {isMobile && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 56, background: '#fff', borderBottom: '0.5px solid rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1rem', zIndex: 100 }}>
            <button onClick={() => setMenuOpen(!menuOpen)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: '#111', padding: '4px 8px', lineHeight: 1, position: 'relative' }}>
              ☰
              {novosLotes > 0 && (
                <span style={{ position: 'absolute', top: 0, right: 0, background: '#3B6D11', color: '#fff', fontSize: 9, fontWeight: 600, padding: '1px 4px', borderRadius: 6 }}>
                  {novosLotes}
                </span>
              )}
            </button>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111' }}>KR <span style={{ color: '#185FA5' }}>Previdência</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <NotificacoesBell onNavigate={(p) => { setPage(p); setMenuOpen(false) }} />
              <button onClick={signOut} style={{ fontSize: 12, color: '#A32D2D', background: 'none', border: 'none', cursor: 'pointer' }}>Sair</button>
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
