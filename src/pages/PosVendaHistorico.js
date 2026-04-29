import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const STATUS_INFO = {
  validado_pos_venda: { label: '✅ Validados', cor: '#3B6D11', bg: '#EAF3DE' },
  em_validacao: { label: '✅ Validados', cor: '#3B6D11', bg: '#EAF3DE' },
  validado: { label: '✅ Validados', cor: '#3B6D11', bg: '#EAF3DE' },
  entregue: { label: '✅ Entregues', cor: '#854F0B', bg: '#FAEEDA' },
  barrado_pos_venda: { label: '❌ Barrados', cor: '#A32D2D', bg: '#FCEBEB' },
}

export default function PosVendaHistorico() {
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('todos')

  useEffect(() => {
    fetchDados()
  }, [])

  async function fetchDados() {
    const { data } = await supabase
      .from('clientes')
      .select(`
        *,
        vendedor:profiles!clientes_vendedor_operador_id_fkey(nome),
        analista_pos_venda:profiles!clientes_pos_venda_atribuido_a_fkey(nome)
      `)
      .or('status.eq.validado_pos_venda,status.eq.em_validacao,status.eq.validado,status.eq.entregue,status.eq.barrado_pos_venda')
      .not('pos_venda_atribuido_a', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(200)
    setClientes(data || [])
    setLoading(false)
  }

  const filtrados = filtro === 'todos' ? clientes
    : filtro === 'validados' ? clientes.filter(c => ['validado_pos_venda', 'em_validacao', 'validado', 'entregue'].includes(c.status))
    : clientes.filter(c => c.status === 'barrado_pos_venda')

  const stats = {
    total: clientes.length,
    validados: clientes.filter(c => ['validado_pos_venda', 'em_validacao', 'validado', 'entregue'].includes(c.status)).length,
    barrados: clientes.filter(c => c.status === 'barrado_pos_venda').length,
  }
  const taxa = stats.total > 0 ? Math.round((stats.validados / stats.total) * 100) : 0

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>Carregando...</div>

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 40 }}>
      <h2 style={{ fontSize: 22, fontWeight: 600, color: '#111', marginBottom: 14 }}>📚 Histórico do Pós-Venda</h2>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 18 }}>
        <button onClick={() => setFiltro('todos')} style={statCard(filtro === 'todos')}>
          <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase' }}>Total</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#111' }}>{stats.total}</div>
        </button>
        <button onClick={() => setFiltro('validados')} style={statCard(filtro === 'validados', '#3B6D11', '#EAF3DE')}>
          <div style={{ fontSize: 11, color: '#3B6D11', textTransform: 'uppercase' }}>✅ Validados</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#3B6D11' }}>{stats.validados}</div>
        </button>
        <button onClick={() => setFiltro('barrados')} style={statCard(filtro === 'barrados', '#A32D2D', '#FCEBEB')}>
          <div style={{ fontSize: 11, color: '#A32D2D', textTransform: 'uppercase' }}>❌ Barrados</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#A32D2D' }}>{stats.barrados}</div>
        </button>
        <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase' }}>Taxa de aprovação</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: taxa >= 80 ? '#3B6D11' : taxa >= 60 ? '#854F0B' : '#A32D2D' }}>{taxa}%</div>
        </div>
      </div>

      {/* Lista */}
      {filtrados.length === 0 ? (
        <div style={{ background: '#fff', padding: 40, textAlign: 'center', borderRadius: 12, border: '0.5px solid rgba(0,0,0,0.08)', color: '#888' }}>
          Nenhum cliente nesse filtro
        </div>
      ) : filtrados.map(c => {
        const info = STATUS_INFO[c.status] || STATUS_INFO.validado_pos_venda
        const dataAcao = c.status === 'barrado_pos_venda' ? c.pos_venda_barrado_em : c.pos_venda_validado_em
        return (
          <div key={c.id} style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: 14, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#111' }}>{c.nome}</div>
                  <span style={{ fontSize: 10, padding: '2px 6px', background: info.bg, color: info.cor, borderRadius: 6, fontWeight: 500 }}>
                    {info.label}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#888' }}>
                  {c.cpf} · {c.telefone} · Vendedora: {c.vendedor?.nome || '—'}
                </div>
                {c.status === 'barrado_pos_venda' && c.pos_venda_motivo_barrado && (
                  <div style={{ fontSize: 11, color: '#A32D2D', marginTop: 4, background: '#FCEBEB', padding: '4px 8px', borderRadius: 4, display: 'inline-block' }}>
                    Motivo: {c.pos_venda_motivo_barrado}
                  </div>
                )}
                {c.pos_venda_observacao && (
                  <div style={{ fontSize: 11, color: '#666', marginTop: 4, fontStyle: 'italic' }}>
                    💬 {c.pos_venda_observacao}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#888', textAlign: 'right' }}>
                {dataAcao && new Date(dataAcao).toLocaleDateString('pt-BR')}<br/>
                {c.pos_venda_tentativas > 0 && `📞 ${c.pos_venda_tentativas} tentativa(s)`}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function statCard(ativo, cor = '#185FA5', bg = '#fff') {
  return {
    background: ativo ? bg : '#fff',
    border: `1px solid ${ativo ? cor : 'rgba(0,0,0,0.1)'}`,
    borderRadius: 12,
    padding: 14,
    cursor: 'pointer',
    textAlign: 'left',
  }
}
