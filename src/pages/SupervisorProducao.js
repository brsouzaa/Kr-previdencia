import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function SupervisorProducao() {
  const [contratos, setContratos] = useState([])
  const [produtores, setProdutores] = useState([])
  const [lotesPrioridade, setLotesPrioridade] = useState([])
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState('mes')
  const [filtroProd, setFiltroProd] = useState('')
  const [busca, setBusca] = useState('')
  const [sincronizando, setSincronizando] = useState(false)
  const [ultimaSync, setUltimaSync] = useState(null)
  const [clienteAberto, setClienteAberto] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [msgSalvo, setMsgSalvo] = useState('')

  useEffect(() => { fetchDados() }, [])

  async function fetchDados() {
    setLoading(true)
    const [{ data: c }, { data: p }, { data: lp }] = await Promise.all([
      supabase.from('contratos_producao').select(`
        *,
        profiles(nome),
        advogados(nome_completo, oab),
        clientes!clientes_contrato_producao_id_fkey(
          id,
          nome,
          cpf,
          rg,
          email,
          telefone,
          rua,
          numero,
          bairro,
          cidade,
          uf,
          cep,
          status,
          origem,
          data_prevista_parto,
          meses_gravidez,
          nis,
          vendedor_operador_id,
          vendedor_operador:profiles!clientes_vendedor_operador_id_fkey(id, nome)
        )
      `).order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, nome').in('role', ['vendedor_operador', 'supervisor_producao']).order('nome'),
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

  function getVendedorB2C(c) {
    return c.clientes?.[0]?.vendedor_operador?.nome || c.profiles?.nome || 'Desconhecido'
  }
  function getVendedorB2CId(c) {
    return c.clientes?.[0]?.vendedor_operador_id || c.produtor_id || null
  }
  function getCliente(c) {
    return c.clientes?.[0] || null
  }

  function abrirCliente(contrato) {
    const cli = getCliente(contrato)
    if (!cli) {
      alert('Cliente não encontrado nesse contrato.')
      return
    }
    setClienteAberto({ ...cli, _advogado: contrato.advogados, _vendedor: getVendedorB2C(contrato) })
    setMsgSalvo('')
  }

  async function salvarCliente() {
    if (!clienteAberto) return
    setSalvando(true)
    setMsgSalvo('')
    try {
      const cpfLimpo = (clienteAberto.cpf || '').replace(/\D/g, '')
      const telLimpo = (clienteAberto.telefone || '').replace(/\D/g, '')
      const cepLimpo = (clienteAberto.cep || '').replace(/\D/g, '')

      if (cpfLimpo.length !== 11) throw new Error('CPF deve ter 11 dígitos')
      if (telLimpo.length < 10) throw new Error('Telefone inválido (mínimo 10 dígitos)')

      const { error } = await supabase.from('clientes').update({
        nome: (clienteAberto.nome || '').toUpperCase().trim(),
        cpf: cpfLimpo,
        rg: clienteAberto.rg || null,
        email: clienteAberto.email || null,
        telefone: telLimpo,
        rua: clienteAberto.rua || null,
        numero: clienteAberto.numero || null,
        bairro: clienteAberto.bairro || null,
        cidade: clienteAberto.cidade || null,
        uf: (clienteAberto.uf || '').toUpperCase().slice(0,2),
        cep: cepLimpo,
        nis: clienteAberto.nis || null,
        meses_gravidez: clienteAberto.meses_gravidez || null,
        data_prevista_parto: clienteAberto.data_prevista_parto || null,
        updated_at: new Date().toISOString()
      }).eq('id', clienteAberto.id)

      if (error) throw error
      setMsgSalvo('✅ Dados salvos com sucesso!')
      await fetchDados()
      setTimeout(() => setMsgSalvo(''), 3000)
    } catch (err) {
      setMsgSalvo('❌ ' + (err.message || err.toString()))
    }
    setSalvando(false)
  }

  function filtrar(lista) {
    let inicio = null
    if (periodo === 'hoje') { inicio = new Date(); inicio.setHours(0,0,0,0) }
    else if (periodo === 'semana') { inicio = new Date(); inicio.setDate(inicio.getDate()-7) }
    else if (periodo === 'mes') { inicio = new Date(); inicio.setDate(inicio.getDate()-30) }

    const buscaLower = busca.trim().toLowerCase()
    const buscaDigits = busca.replace(/\D/g, '')

    return lista.filter(c => {
      const dentroP = !inicio || new Date(c.created_at) >= inicio
      const prodOk = !filtroProd || getVendedorB2CId(c) === filtroProd

      let buscaOk = true
      if (buscaLower) {
        const cli = getCliente(c)
        const nome = (c.cliente_nome || cli?.nome || '').toLowerCase()
        const cpfCliente = (cli?.cpf || c.cliente_cpf || '').replace(/\D/g, '')
        const telCliente = (cli?.telefone || c.cliente_telefone || '').replace(/\D/g, '')
        const advNome = (c.advogados?.nome_completo || '').toLowerCase()
        const vendNome = getVendedorB2C(c).toLowerCase()

        const matchTexto = nome.includes(buscaLower) || advNome.includes(buscaLower) || vendNome.includes(buscaLower)
        const matchNumeros = buscaDigits && (cpfCliente.includes(buscaDigits) || telCliente.includes(buscaDigits))
        buscaOk = matchTexto || matchNumeros
      }

      return dentroP && prodOk && buscaOk
    })
  }

  const filtrados = filtrar(contratos)
  const enviados = filtrados.length
  const assinados = filtrados.filter(c => c.status === 'assinado').length
  const pendentes = filtrados.filter(c => c.status === 'enviado').length
  const expirados = filtrados.filter(c => c.status === 'expirado').length
  const conversao = enviados > 0 ? Math.round((assinados / enviados) * 100) : 0

  const rankingMap = filtrados.reduce((acc, c) => {
    const nome = getVendedorB2C(c)
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
          <option value="">Todos os vendedores B2C</option>
          {produtores.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: '1.25rem' }}>
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#111', marginBottom: 12 }}>Ranking de vendedores B2C</div>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>Contratos gerados ({filtrados.length})</div>
          <input
            type="text"
            placeholder="🔍 Buscar por nome, CPF, telefone ou advogado..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            style={{
              flex: 1,
              minWidth: 240,
              maxWidth: 400,
              padding: '8px 12px',
              fontSize: 13,
              border: '0.5px solid rgba(0,0,0,0.18)',
              borderRadius: 8,
              background: '#fff',
              outline: 'none'
            }}
          />
        </div>

        {filtrados.length === 0 && <div style={{ color: '#aaa', fontSize: 13 }}>Nenhum contrato encontrado</div>}
        {filtrados.map(c => {
          const statusConfig = c.status === 'assinado'
            ? { bg: '#EAF3DE', cor: '#3B6D11', label: '✓ Assinado' }
            : c.status === 'expirado'
            ? { bg: '#FCEBEB', cor: '#A32D2D', label: '✗ Expirado' }
            : { bg: '#FAEEDA', cor: '#854F0B', label: 'Aguardando' }
          const cli = getCliente(c)
          return (
            <div
              key={c.id}
              onClick={() => abrirCliente(c)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', borderBottom: '0.5px solid rgba(0,0,0,0.06)', cursor: cli ? 'pointer' : 'default', borderRadius: 6, transition: 'background 0.15s' }}
              onMouseEnter={e => { if (cli) e.currentTarget.style.background = '#f8f8f6' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>
                  {c.cliente_nome}
                  {cli && <span style={{ fontSize: 11, color: '#185FA5', marginLeft: 8 }}>✏️ clicar para editar</span>}
                </div>
                <div style={{ fontSize: 11, color: '#888' }}>
                  Advogado: {c.advogados?.nome_completo} · Vendedor B2C: <strong>{getVendedorB2C(c)}</strong>
                  {c.profiles?.nome && getVendedorB2C(c) !== c.profiles?.nome && (
                    <span style={{ color: '#aaa' }}> · Digitado por: {c.profiles?.nome}</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#aaa' }}>
                  {cli?.telefone && `📱 ${cli.telefone} · `}
                  {new Date(c.created_at).toLocaleDateString('pt-BR')} às {new Date(c.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                <span style={{ padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: statusConfig.bg, color: statusConfig.cor }}>
                  {statusConfig.label}
                </span>
                {c.link_assinatura && c.status !== 'expirado' && (
                  <div style={{ marginTop: 4 }}>
                    <a href={c.link_assinatura} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 11, color: '#185FA5', textDecoration: 'none' }}>
                      Ver link ↗
                    </a>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {clienteAberto && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => setClienteAberto(null)}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 12, maxWidth: 600, width: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, color: '#111' }}>✏️ Editar cliente</h2>
                <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                  Status: <strong>{clienteAberto.status}</strong> · Origem: <strong>{clienteAberto.origem === 'ia' ? '🤖 IA' : '👤 Vendedora'}</strong>
                </div>
                <div style={{ fontSize: 11, color: '#888' }}>
                  Advogado: {clienteAberto._advogado?.nome_completo} · Vendedor: {clienteAberto._vendedor}
                </div>
              </div>
              <button onClick={() => setClienteAberto(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888', padding: 0, lineHeight: 1 }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Campo label="Nome completo" valor={clienteAberto.nome} onChange={v => setClienteAberto({ ...clienteAberto, nome: v })} colSpan={2} />
              <Campo label="CPF" valor={clienteAberto.cpf} onChange={v => setClienteAberto({ ...clienteAberto, cpf: v })} />
              <Campo label="RG" valor={clienteAberto.rg} onChange={v => setClienteAberto({ ...clienteAberto, rg: v })} />
              <Campo label="Email" valor={clienteAberto.email} onChange={v => setClienteAberto({ ...clienteAberto, email: v })} colSpan={2} />
              <Campo label="Telefone (WhatsApp)" valor={clienteAberto.telefone} onChange={v => setClienteAberto({ ...clienteAberto, telefone: v })} colSpan={2} />
              <Campo label="Rua" valor={clienteAberto.rua} onChange={v => setClienteAberto({ ...clienteAberto, rua: v })} colSpan={2} />
              <Campo label="Número" valor={clienteAberto.numero} onChange={v => setClienteAberto({ ...clienteAberto, numero: v })} />
              <Campo label="Bairro" valor={clienteAberto.bairro} onChange={v => setClienteAberto({ ...clienteAberto, bairro: v })} />
              <Campo label="Cidade" valor={clienteAberto.cidade} onChange={v => setClienteAberto({ ...clienteAberto, cidade: v })} />
              <Campo label="UF" valor={clienteAberto.uf} onChange={v => setClienteAberto({ ...clienteAberto, uf: v })} />
              <Campo label="CEP" valor={clienteAberto.cep} onChange={v => setClienteAberto({ ...clienteAberto, cep: v })} colSpan={2} />
              <Campo label="NIS (opcional)" valor={clienteAberto.nis} onChange={v => setClienteAberto({ ...clienteAberto, nis: v })} />
              <Campo label="Meses gravidez (opcional)" valor={clienteAberto.meses_gravidez} onChange={v => setClienteAberto({ ...clienteAberto, meses_gravidez: v })} />
              <Campo label="DPP (opcional)" valor={clienteAberto.data_prevista_parto} onChange={v => setClienteAberto({ ...clienteAberto, data_prevista_parto: v })} colSpan={2} />
            </div>

            {msgSalvo && (
              <div style={{ marginTop: 12, padding: 10, fontSize: 13, borderRadius: 6, background: msgSalvo.startsWith('✅') ? '#EAF3DE' : '#FCEBEB', color: msgSalvo.startsWith('✅') ? '#3B6D11' : '#A32D2D' }}>
                {msgSalvo}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
              <button onClick={() => setClienteAberto(null)} disabled={salvando} style={{ flex: 1, padding: 10, background: '#f0f0ee', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
                Cancelar
              </button>
              <button onClick={salvarCliente} disabled={salvando} style={{ flex: 2, padding: 10, background: salvando ? '#aaa' : '#185FA5', color: '#fff', border: 'none', borderRadius: 6, cursor: salvando ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 500 }}>
                {salvando ? '⏳ Salvando...' : '💾 Salvar alterações'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Campo({ label, valor, onChange, colSpan = 1 }) {
  return (
    <div style={{ gridColumn: colSpan === 2 ? 'span 2' : 'span 1' }}>
      <label style={{ display: 'block', fontSize: 11, color: '#666', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{label}</label>
      <input
        type="text"
        value={valor || ''}
        onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 6, outline: 'none', boxSizing: 'border-box' }}
      />
    </div>
  )
}
