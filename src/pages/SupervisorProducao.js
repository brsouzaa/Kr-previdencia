import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function SupervisorProducao() {
  const [contratos, setContratos] = useState([])
  const [produtores, setProdutores] = useState([])
  const [lotesPrioridade, setLotesPrioridade] = useState([])
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState('mes')
  const [filtroProd, setFiltroProd] = useState('')
  const [sincronizando, setSincronizando] = useState(false)
  const [ultimaSync, setUltimaSync] = useState(null)

  useEffect(() => { fetchDados() }, [])

  async function fetchDados() {
    setLoading(true)
    const [{ data: c }, { data: p }, { data: lp }] = await Promise.all([
      supabase.from('contratos_producao').select('*, profiles(nome), advogados(nome_completo, oab)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, nome').eq('role', 'produtor').order('nome'),
      supabase.from('lotes').select('*, advogados(nome_completo)').eq('prioridade_fila', true).order('data_prioridade', { ascending: true }),
    ])
    setContratos(c || [])
    setProdutores(p || [])
    setLotesPrioridade(lp || [])
    setLoading(false)
  }

  async function sincronizarAgora() {
    if (sincronizando) return
    setSincronizando(true)
    try {
      const resp = await supabase.functions.invoke('gerar-contratos-zapsign/sincronizar', {
        body: {}
      })
      if (resp.error) throw new Error(typeof resp.error === 'string' ? resp.error : JSON.stringify(resp.error))
      const r = resp.data
      setUltimaSync({
        assinados: r.assinados || 0,
        expirados: r.expirados || 0,
        horario: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      })
      await fetchDados()
    } catch (err) {
      alert('Erro ao sincronizar: ' + (err.message || err.toString()))
    }
    setSincronizando(false)
  }

  function filtrar(lista) {
    let inicio = null
    if (periodo === 'hoje') { inicio = new Date(); inicio.setHours(0,0,0,0) }
    else if (periodo === 'semana') { inicio = new Date(); inicio.setDate(inicio.getDate()-7) }
    else if (periodo === 'mes') { inicio = new Date(); inicio.setDate(inicio.getDate()-30) }

    return lista.filter(c => {
      const dentroP = !inicio || new Date(c.created_at) >= inicio
      const prodOk = !filtroProd || c.produtor_id === filtroProd
      return dentroP && prodOk
    })
  }

  const filtrados = filtrar(contratos)
  const enviados = filtrados.length
  const assinados = filtrados.filter(c => c.status === 'assinado').length
  const pendentes = filtrados.filter(c => c.status === 'enviado').length
  const expirados = filtrados.filter(c => c.status === 'expirado').length
  const conversao = enviados > 0 ? Math.round((assinados / enviados) * 100) : 0

  const rankingMap = filtrados.reduce((acc, c) => {
    const nome = c.profiles?.nome || 'Desconhecido'
    if (!acc[nome]) acc[nome] = { enviados: 0, assinados: 0 }
    acc[nome].enviados++
    if (c.status === 'assinado') acc[nome].assinados++
    return acc
  }, {})
  const ranking = Object.entries(rankingMap).sort((a,b) => b[1].enviados - a[1].enviados)

  const card = { background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: '14px 16px' }

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>Carregando...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 20, fontWeight: 500, color: '#111' }}>📊 Supervisão de Produção</div>
        <button
          onClick={sincronizarAgora}
          disabled={sincronizando}
          style={{
            padding: '8px 14px',
            background: sincronizando ? '#aaa' : '#185FA5',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            cursor: sincronizando ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          {sincronizando ? '⏳ Sincronizando...' : '🔄 Sincronizar agora'}
        </button>
      </div>

      {ultimaSync && (
        <div style={{ ...card, marginBottom: 14, background: '#EAF3DE', border: '0.5px solid #3B6D1130' }}>
          <div style={{ fontSize: 13, color: '#3B6D11', fontWeight: 500 }}>
            ✓ Sincronização concluída às {ultimaSync.horario}
          </div>
          <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
            {ultimaSync.assinados} contrato{ultimaSync.assinados !== 1 ? 's' : ''} marcado{ultimaSync.assinados !== 1 ? 's' : ''} como assinado · {ultimaSync.expirados} contrato{ultimaSync.expirados !== 1 ? 's' : ''} expirado{ultimaSync.expirados !== 1 ? 's' : ''} (voltaram para a fila com prioridade)
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: '1.25rem' }}>
        {[
          ['Enviados', enviados, '#185FA5', '#E6F1FB'],
          ['Assinados', assinados, '#3B6D11', '#EAF3DE'],
          ['Pendentes', pendentes, '#854F0B', '#FAEEDA'],
          ['Expirados', expirados, '#A32D2D', '#FCEBEB'],
          ['Conversão', `${conversao}%`, conversao >= 70 ? '#3B6D11' : conversao >= 40 ? '#854F0B' : '#A32D2D', conversao >= 70 ? '#EAF3DE' : conversao >= 40 ? '#FAEEDA' : '#FCEBEB'],
        ].map(([l, v, c, bg]) => (
          <div key={l} style={{ ...card, background: bg, border: `0.5px solid ${c}30` }}>
            <div style={{ fontSize: 11, color: c, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4, opacity: 0.8 }}>{l}</div>
            <div style={{ fontSize: 26, fontWeight: 500, color: c }}>{v}</div>
          </div>
        ))}
      </div>

      {lotesPrioridade.length > 0 && (
        <div style={{ ...card, marginBottom: '1.25rem', background: '#FEF3C7', border: '0.5px solid #F59E0B40' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#854F0B', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            ⚡ Lotes em prioridade na fila ({lotesPrioridade.length})
          </div>
          <div style={{ fontSize: 11, color: '#854F0B', marginBottom: 10, fontStyle: 'italic' }}>
            Esses lotes têm contratos que expiraram sem assinatura e precisam ser reemitidos
          </div>
          {lotesPrioridade.map(l => {
            const restantes = (l.total_contratos || 0) - (l.qtd_emitidos || 0)
            return (
              <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#fff', borderRadius: 8, marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{l.advogados?.nome_completo}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>
                    {restantes} contrato{restantes !== 1 ? 's' : ''} para reemitir · prioridade desde {l.data_prioridade ? new Date(l.data_prioridade).toLocaleDateString('pt-BR') : '-'}
                  </div>
                </div>
                <span style={{ padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: '#F59E0B', color: '#fff' }}>
                  {restantes} pendente{restantes !== 1 ? 's' : ''}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <select style={{ padding: '8px 10px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 8, background: '#fff', outline: 'none' }} value={periodo} onChange={e => setPeriodo(e.target.value)}>
          <option value="hoje">Hoje</option>
          <option value="semana">Esta semana</option>
          <option value="mes">Este mês</option>
          <option value="total">Todo período</option>
        </select>
        <select style={{ padding: '8px 10px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 8, background: '#fff', outline: 'none' }} value={filtroProd} onChange={e => setFiltroProd(e.target.value)}>
          <option value="">Todos os produtores</option>
          {produtores.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: '1.25rem' }}>
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#111', marginBottom: 12 }}>Ranking de produtores</div>
          {ranking.length === 0 && <div style={{ color: '#aaa', fontSize: 13 }}>Nenhum dado no período</div>}
          {ranking.map(([nome, dados], i) => {
            const conv = dados.enviados > 0 ? Math.round((dados.assinados / dados.enviados) * 100) : 0
            return (
              <div key={nome} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, padding: '8px 10px', background: i === 0 ? '#E6F1FB' : '#f8f8f6', borderRadius: 8 }}>
                <div style={{ width: 24, fontSize: 16, textAlign: 'center' }}>{['🥇','🥈','🥉'][i] || `${i+1}º`}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{nome}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>{dados.enviados} enviados · {dados.assinados} assinados · {conv}% conversão</div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 500, color: '#185FA5' }}>{dados.enviados}</div>
              </div>
            )
          })}
        </div>

        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#111', marginBottom: 12 }}>Status dos contratos</div>
          {[
            ['Assinados', assinados, '#3B6D11'],
            ['Aguardando assinatura', pendentes, '#854F0B'],
            ['Expirados', expirados, '#A32D2D'],
          ].map(([l, v, c]) => {
            const pct = enviados > 0 ? Math.round((v/enviados)*100) : 0
            return (
              <div key={l} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                  <span style={{ color: c, fontWeight: 500 }}>{l}</span>
                  <span style={{ fontWeight: 500 }}>{v} <span style={{ color: '#aaa', fontWeight: 400 }}>({pct}%)</span></span>
                </div>
                <div style={{ background: '#f0f0ee', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: c, borderRadius: 4, transition: 'width 0.4s' }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#111', marginBottom: 12 }}>Contratos gerados</div>
        {filtrados.length === 0 && <div style={{ color: '#aaa', fontSize: 13 }}>Nenhum contrato no período</div>}
        {filtrados.map(c => {
          const statusConfig = c.status === 'assinado'
            ? { bg: '#EAF3DE', cor: '#3B6D11', label: '✓ Assinado' }
            : c.status === 'expirado'
            ? { bg: '#FCEBEB', cor: '#A32D2D', label: '✗ Expirado' }
            : { bg: '#FAEEDA', cor: '#854F0B', label: 'Aguardando' }
          return (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{c.cliente_nome}</div>
                <div style={{ fontSize: 11, color: '#888' }}>
                  Advogado: {c.advogados?.nome_completo} · Produtor: {c.profiles?.nome}
                </div>
                <div style={{ fontSize: 11, color: '#aaa' }}>{new Date(c.created_at).toLocaleDateString('pt-BR')} às {new Date(c.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                <span style={{ padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: statusConfig.bg, color: statusConfig.cor }}>
                  {statusConfig.label}
                </span>
                {c.link_assinatura && c.status !== 'expirado' && (
                  <div style={{ marginTop: 4 }}>
                    <a href={c.link_assinatura} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#185FA5', textDecoration: 'none' }}>
                      Ver link ↗
                    </a>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
