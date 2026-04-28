import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const STATUS_INFO = {
  aguardando_emissao: { label: 'Aguardando emissão', cor: '#854F0B', bg: '#FAEEDA', icon: '⏳' },
  emitido: { label: 'Emitido — link disponível', cor: '#185FA5', bg: '#E6F1FB', icon: '📨' },
  assinado: { label: 'Assinado', cor: '#3B6D11', bg: '#EAF3DE', icon: '✅' },
  expirado: { label: 'Expirou sem assinar', cor: '#A32D2D', bg: '#FCEBEB', icon: '⌛' },
  cancelado: { label: 'Cancelado', cor: '#666', bg: '#f0f0f0', icon: '❌' },
}

const s = {
  card: { background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 14, padding: '1rem', marginBottom: 10 },
  search: { width: '100%', padding: '10px 12px', fontSize: 14, border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 8, background: '#fff', outline: 'none', boxSizing: 'border-box', marginBottom: 12 },
  filtroChip: (ativo, cor, bg) => ({
    padding: '6px 12px', fontSize: 12, borderRadius: 16,
    background: ativo ? cor : bg, color: ativo ? '#fff' : cor,
    border: `1px solid ${cor}40`, cursor: 'pointer', fontWeight: 500,
  }),
  badgeStatus: (cor, bg) => ({
    display: 'inline-block', padding: '3px 8px', borderRadius: 10,
    fontSize: 11, fontWeight: 500, color: cor, background: bg,
  }),
}

function tempoRelativo(dt) {
  const ms = Date.now() - new Date(dt).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `há ${d}d`
  return new Date(dt).toLocaleDateString('pt-BR')
}

export default function MeusClientes() {
  const { profile } = useAuth()
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [busca, setBusca] = useState('')
  const [copiadoId, setCopiadoId] = useState(null)

  const fetchClientes = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('clientes').select('*').order('created_at', { ascending: false })
    if (profile?.role === 'vendedor_operador') {
      q = q.eq('vendedor_operador_id', profile.id)
    }
    const { data } = await q
    setClientes(data || [])
    setLoading(false)
  }, [profile])

  useEffect(() => { fetchClientes() }, [fetchClientes])

  const filtrados = clientes.filter(c => {
    if (filtroStatus !== 'todos' && c.status !== filtroStatus) return false
    if (busca) {
      const b = busca.toLowerCase()
      return c.nome.toLowerCase().includes(b) || c.cpf.includes(b) || c.telefone.includes(b)
    }
    return true
  })

  const counts = {
    todos: clientes.length,
    aguardando_emissao: clientes.filter(c => c.status === 'aguardando_emissao').length,
    emitido: clientes.filter(c => c.status === 'emitido').length,
    assinado: clientes.filter(c => c.status === 'assinado').length,
    expirado: clientes.filter(c => c.status === 'expirado').length,
  }

  function copiarLink(c) {
    if (!c.link_assinatura) return
    navigator.clipboard.writeText(c.link_assinatura)
    setCopiadoId(c.id)
    setTimeout(() => setCopiadoId(null), 2500)
  }

  function whatsappLink(c) {
    const tel = (c.telefone || '').replace(/\D/g, '')
    const msg = encodeURIComponent(
      `Olá ${c.nome.split(' ')[0]}, tudo bem? Seguindo nossa conversa, segue o link para assinatura digital dos seus documentos:\n\n${c.link_assinatura}\n\nO link expira em 15 horas. Qualquer dúvida me avise!`
    )
    return `https://wa.me/55${tel}?text=${msg}`
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>Carregando...</div>

  return (
    <div>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 500, color: '#111', marginBottom: 4 }}>📋 Meus clientes</div>
          <div style={{ fontSize: 13, color: '#888' }}>{clientes.length} cliente{clientes.length !== 1 ? 's' : ''} cadastrado{clientes.length !== 1 ? 's' : ''}</div>
        </div>
        <button onClick={fetchClientes} style={{ padding: '8px 14px', fontSize: 13, background: '#fff', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 8, cursor: 'pointer', color: '#555' }}>
          ↻ Atualizar
        </button>
      </div>

      <input style={s.search} placeholder="🔍 Buscar por nome, CPF ou telefone..."
        value={busca} onChange={e => setBusca(e.target.value)} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <button style={s.filtroChip(filtroStatus === 'todos', '#185FA5', '#E6F1FB')} onClick={() => setFiltroStatus('todos')}>
          Todos · {counts.todos}
        </button>
        {Object.entries(STATUS_INFO).map(([key, info]) => {
          if (!counts[key]) return null
          return (
            <button key={key} style={s.filtroChip(filtroStatus === key, info.cor, info.bg)} onClick={() => setFiltroStatus(key)}>
              {info.icon} {info.label} · {counts[key]}
            </button>
          )
        })}
      </div>

      {filtrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#888', background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.06)' }}>
          {clientes.length === 0 ? '📭 Nenhum cliente cadastrado ainda.' : 'Nenhum cliente encontrado com esses filtros.'}
        </div>
      ) : filtrados.map(c => {
        const info = STATUS_INFO[c.status] || STATUS_INFO.aguardando_emissao
        return (
          <div key={c.id} style={{ ...s.card, borderLeft: `3px solid ${info.cor}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 8 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#111', marginBottom: 2 }}>{c.nome}</div>
                <div style={{ fontSize: 12, color: '#888' }}>{c.cpf} · {c.telefone}</div>
              </div>
              <span style={s.badgeStatus(info.cor, info.bg)}>{info.icon} {info.label}</span>
            </div>

            <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>
              {c.cidade}/{c.uf} · {c.produto === 'Auxilio Acidente' ? 'Auxílio Acidente' : c.produto} · {tempoRelativo(c.created_at)}
            </div>

            {c.observacao && (
              <div style={{ fontSize: 12, color: '#666', marginTop: 8, padding: '6px 10px', background: '#f8f8f6', borderRadius: 6, fontStyle: 'italic' }}>
                "{c.observacao}"
              </div>
            )}

            {c.status === 'emitido' && c.link_assinatura && (
              <div style={{ marginTop: 12, padding: 10, background: '#E6F1FB', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: '#185FA5', marginBottom: 6, fontWeight: 500 }}>📨 Link de assinatura pronto — envie pro cliente:</div>
                <div style={{ background: '#fff', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#185FA5', wordBreak: 'break-all', marginBottom: 8, border: '0.5px solid rgba(0,0,0,0.06)' }}>
                  {c.link_assinatura}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => copiarLink(c)} style={{ flex: 1, padding: '8px', background: copiadoId === c.id ? '#3B6D11' : '#185FA5', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                    {copiadoId === c.id ? '✓ Copiado' : '📋 Copiar link'}
                  </button>
                  <a href={whatsappLink(c)} target="_blank" rel="noreferrer"
                    style={{ flex: 1, padding: '8px', background: '#3B6D11', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', textDecoration: 'none', textAlign: 'center' }}>
                    💬 Enviar WhatsApp
                  </a>
                </div>
              </div>
            )}

            {c.status === 'expirado' && (
              <div style={{ marginTop: 10, padding: 10, background: '#FCEBEB', borderRadius: 8, fontSize: 12, color: '#A32D2D' }}>
                ⌛ Cliente não assinou em 15 horas. Entre em contato e cadastre novamente se ele ainda quiser fechar.
              </div>
            )}

            {c.status === 'aguardando_emissao' && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#854F0B' }}>
                Aguardando supervisão emitir o contrato...
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
