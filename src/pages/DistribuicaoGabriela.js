import { useState, useEffect } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || 'https://sdqslzpfbazehqcvibjy.supabase.co'
const ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || ''

export default function DistribuicaoGabriela() {
  const { profile } = useAuth()
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setLoading(true)
    setErro('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch(`${SUPABASE_URL}/functions/v1/gerar-contratos-zapsign/admin-status-gabriela`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': ANON_KEY,
          'Authorization': `Bearer ${session?.access_token || ANON_KEY}`,
        },
        body: JSON.stringify({})
      })
      const data = await r.json()
      if (data.ok) setStatus(data)
      else setErro(data.error || 'Erro ao carregar status')
    } catch (e) { setErro(String(e)) }
    setLoading(false)
  }

  async function toggle() {
    if (salvando) return
    const novoEstadoStr = !status?.ativo ? 'ATIVAR' : 'DESATIVAR'
    if (!window.confirm(`Confirma ${novoEstadoStr} a regra Gabriela?\n\nQuando ATIVA: contratos da IA com 6+ meses de gestação vão automaticamente pra Dra. Gabriela.\n\nQuando DESATIVADA: tudo volta pra fila normal.`)) return

    setSalvando(true)
    setErro('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data: { user } } = await supabase.auth.getUser()
      const r = await fetch(`${SUPABASE_URL}/functions/v1/gerar-contratos-zapsign/admin-toggle-gabriela`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': ANON_KEY,
          'Authorization': `Bearer ${session?.access_token || ANON_KEY}`,
        },
        body: JSON.stringify({ admin_id: user?.id })
      })
      const data = await r.json()
      if (!data.ok) { setErro(data.error || 'Erro ao alterar'); setSalvando(false); return }
      await carregar()
    } catch (e) { setErro(String(e)) }
    setSalvando(false)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Carregando...</div>

  const ativo = status?.ativo === true
  const contagem = status?.ultimos_7d || { regra_gabriela_ia: 0, fila_normal: 0, fallback_gabriela_cheia: 0 }
  const ultimaAlteracao = status?.ultima_alteracao ? new Date(status.ultima_alteracao).toLocaleString('pt-BR') : '—'

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>🎯 Distribuição Automática Gabriela</h1>
        <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
          Quando ATIVA, contratos da IA com 6+ meses de gestação vão direto pra Dra. Gabriela (OAB RS89170).
          Vendedores humanos NUNCA são afetados — continuam no fluxo normal.
        </div>
      </div>

      {erro && (
        <div style={{ background: '#FDECEC', border: '1px solid #F0B5B5', color: '#A32D2D', padding: 12, borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
          ⚠️ {erro}
        </div>
      )}

      {/* Card principal: status + botão */}
      <div style={{
        background: '#fff', padding: 24, borderRadius: 8,
        border: '1px solid rgba(0,0,0,0.08)', marginBottom: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16
      }}>
        <div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Status atual</div>
          <div style={{
            fontSize: 28, fontWeight: 700,
            color: ativo ? '#3B6D11' : '#888',
          }}>
            {ativo ? '🟢 ATIVADO' : '⚫ DESATIVADO'}
          </div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
            Última alteração: {ultimaAlteracao}
          </div>
        </div>

        <button
          onClick={toggle}
          disabled={salvando}
          style={{
            padding: '14px 28px',
            background: ativo ? '#A32D2D' : '#3B6D11',
            color: '#fff', border: 'none', borderRadius: 6,
            fontSize: 14, fontWeight: 600,
            cursor: salvando ? 'wait' : 'pointer',
            opacity: salvando ? 0.6 : 1,
            minWidth: 200,
          }}
        >
          {salvando ? 'Salvando...' : (ativo ? '⏸️ PAUSAR REGRA' : '▶️ ATIVAR REGRA')}
        </button>
      </div>

      {/* Estatísticas últimos 7d */}
      <div style={{ background: '#fff', padding: 20, borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)', marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, margin: '0 0 14px 0', color: '#555' }}>📊 Atribuições nos últimos 7 dias</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <Card label="→ Gabriela (regra IA)" valor={contagem.regra_gabriela_ia} cor="#185FA5" />
          <Card label="→ Fila normal" valor={contagem.fila_normal} cor="#555" />
          <Card label="↩ Fallback (Gabriela cheia)" valor={contagem.fallback_gabriela_cheia} cor="#854F0B" />
        </div>
      </div>

      {/* Bloco explicativo */}
      <div style={{ background: '#F8F7F2', padding: 16, borderRadius: 8, border: '1px solid rgba(0,0,0,0.06)', fontSize: 12, color: '#666', lineHeight: 1.6 }}>
        <strong style={{ color: '#333' }}>Como funciona:</strong>
        <ul style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
          <li>Cliente da IA com gestação ≥ 6 meses + switch ATIVO → vai pra qualquer lote da Gabriela em <code>a_entregar</code> com vaga.</li>
          <li>Quando 1 lote dela enche, o sistema pula automático pro próximo lote dela em <code>a_entregar</code>.</li>
          <li>Se TODOS os lotes dela estiverem cheios → cai pra fila normal (fallback). Não trava cliente.</li>
          <li>Cliente da IA com menos de 6 meses → fila normal sempre.</li>
          <li>Cliente de vendedor humano → fila normal sempre. NUNCA Gabriela.</li>
          <li>Aplica também em reemissão de cliente IA cujo link expirou.</li>
        </ul>
      </div>

      {profile?.role !== 'admin' && (
        <div style={{ marginTop: 16, padding: 12, background: '#FDECEC', borderRadius: 6, color: '#A32D2D', fontSize: 13 }}>
          ⚠️ Apenas administradores podem alterar este switch.
        </div>
      )}
    </div>
  )
}

function Card({ label, valor, cor }) {
  return (
    <div style={{
      background: '#F8F7F2', padding: 16, borderRadius: 6,
      borderLeft: `3px solid ${cor}`,
    }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 600, color: cor }}>{valor}</div>
    </div>
  )
}
