import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

export default function NotificacoesBell({ onNavigate }) {
  const { profile } = useAuth()
  const [notificacoes, setNotificacoes] = useState([])
  const [aberto, setAberto] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchNotif = useCallback(async () => {
    if (!profile?.id) return
    const { data } = await supabase
      .from('notificacoes')
      .select('*')
      .eq('destinatario_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(20)
    setNotificacoes(data || [])
    setLoading(false)
  }, [profile?.id])

  useEffect(() => {
    fetchNotif()
    // Atualiza a cada 30s
    const interval = setInterval(fetchNotif, 30000)
    return () => clearInterval(interval)
  }, [fetchNotif])

  // Realtime: assinar novas notificacoes
  useEffect(() => {
    if (!profile?.id) return
    const channel = supabase
      .channel('notif-' + profile.id)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notificacoes',
        filter: `destinatario_id=eq.${profile.id}`
      }, () => {
        fetchNotif()
        // Toca um beep suave
        try {
          const audio = new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=')
          audio.volume = 0.3
          audio.play().catch(() => {})
        } catch (e) {}
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile?.id, fetchNotif])

  const naoLidas = notificacoes.filter(n => !n.lida).length

  async function marcarComoLida(id) {
    await supabase.from('notificacoes').update({ lida: true, lida_em: new Date().toISOString() }).eq('id', id)
    setNotificacoes(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n))
  }

  async function marcarTodasComoLidas() {
    const ids = notificacoes.filter(n => !n.lida).map(n => n.id)
    if (ids.length === 0) return
    await supabase.from('notificacoes').update({ lida: true, lida_em: new Date().toISOString() }).in('id', ids)
    setNotificacoes(prev => prev.map(n => ({ ...n, lida: true })))
  }

  function clicarNotif(n) {
    if (!n.lida) marcarComoLida(n.id)
    if (n.link && onNavigate) {
      onNavigate(n.link)
      setAberto(false)
    }
  }

  function tempoRelativo(data) {
    const ms = Date.now() - new Date(data).getTime()
    const min = Math.floor(ms / 60000)
    if (min < 1) return 'agora'
    if (min < 60) return `${min}min atrás`
    const horas = Math.floor(min / 60)
    if (horas < 24) return `${horas}h atrás`
    const dias = Math.floor(horas / 24)
    return `${dias}d atrás`
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Sino */}
      <button
        onClick={() => setAberto(v => !v)}
        style={{
          position: 'relative',
          background: aberto ? '#f0f0ee' : 'transparent',
          border: 'none',
          fontSize: 20,
          cursor: 'pointer',
          padding: '6px 8px',
          borderRadius: 8,
          color: '#5F5E5A',
        }}
        title="Notificações"
      >
        🔔
        {naoLidas > 0 && (
          <span style={{
            position: 'absolute',
            top: -2,
            right: -2,
            background: '#A32D2D',
            color: '#fff',
            fontSize: 9,
            fontWeight: 600,
            minWidth: 16,
            height: 16,
            borderRadius: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 4px',
          }}>
            {naoLidas > 99 ? '99+' : naoLidas}
          </span>
        )}
      </button>

      {/* Painel suspenso */}
      {aberto && (
        <>
          {/* Overlay pra fechar ao clicar fora */}
          <div
            onClick={() => setAberto(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 998 }}
          />
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            width: 360,
            maxHeight: 480,
            background: '#fff',
            border: '0.5px solid rgba(0,0,0,0.15)',
            borderRadius: 12,
            boxShadow: '0 6px 24px rgba(0,0,0,0.12)',
            zIndex: 999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              borderBottom: '0.5px solid rgba(0,0,0,0.08)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>
                Notificações {naoLidas > 0 && <span style={{ color: '#A32D2D' }}>({naoLidas} novas)</span>}
              </div>
              {naoLidas > 0 && (
                <button
                  onClick={marcarTodasComoLidas}
                  style={{ fontSize: 11, color: '#185FA5', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Marcar todas como lidas
                </button>
              )}
            </div>

            {/* Lista */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loading && <div style={{ padding: 20, textAlign: 'center', color: '#888', fontSize: 12 }}>Carregando...</div>}
              {!loading && notificacoes.length === 0 && (
                <div style={{ padding: 32, textAlign: 'center', color: '#aaa', fontSize: 12 }}>
                  🎈 Sem notificações ainda
                </div>
              )}
              {notificacoes.map(n => (
                <div
                  key={n.id}
                  onClick={() => clicarNotif(n)}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '0.5px solid rgba(0,0,0,0.05)',
                    cursor: n.link ? 'pointer' : 'default',
                    background: n.lida ? '#fff' : '#F0F7FF',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (n.link) e.currentTarget.style.background = '#F8F9FB' }}
                  onMouseLeave={e => { e.currentTarget.style.background = n.lida ? '#fff' : '#F0F7FF' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>
                      {n.titulo}
                    </div>
                    {!n.lida && <span style={{ width: 6, height: 6, borderRadius: 6, background: '#185FA5', flexShrink: 0, marginTop: 6 }} />}
                  </div>
                  {n.mensagem && (
                    <div style={{ fontSize: 12, color: '#5F5E5A', marginTop: 3, lineHeight: 1.4 }}>{n.mensagem}</div>
                  )}
                  <div style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>{tempoRelativo(n.created_at)}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
