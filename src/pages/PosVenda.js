import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const MOTIVOS_BARRADO = [
  'Sem resposta após múltiplas tentativas',
  'Cliente desistiu da contratação',
  'Cliente não reconhece a contratação',
  'Telefone inválido / não atende',
  'Possível golpe / suspeita de fraude',
  'Cliente fora do perfil (não tem direito)',
  'Outro (especificar nas observações)',
]

const STATUS_LABEL = {
  aguardando_pos_venda: { label: 'Novo — não contatado', cor: '#185FA5', bg: '#E6F1FB', icon: '🆕' },
  em_contato_pos_venda: { label: 'Em contato', cor: '#854F0B', bg: '#FAEEDA', icon: '📞' },
}

function tempoRelativo(data) {
  if (!data) return ''
  const ms = Date.now() - new Date(data).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}min atrás`
  const horas = Math.floor(min / 60)
  if (horas < 24) return `${horas}h atrás`
  const dias = Math.floor(horas / 24)
  return `${dias}d atrás`
}

function prazoRestante(prazo) {
  if (!prazo) return null
  const ms = new Date(prazo).getTime() - Date.now()
  if (ms < 0) return { vencido: true, texto: 'PRAZO VENCIDO' }
  const horas = Math.floor(ms / 3600000)
  const dias = Math.floor(horas / 24)
  if (dias >= 1) return { vencido: false, dias, horas: horas % 24, texto: `${dias}d ${horas % 24}h restantes`, urgente: dias < 1 }
  return { vencido: false, dias: 0, horas, texto: `${horas}h restantes`, urgente: true }
}

export default function PosVenda() {
  const { profile } = useAuth()
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('todos')
  const [busca, setBusca] = useState('')
  const [acaoCliente, setAcaoCliente] = useState(null) // { tipo: 'contato'|'validar'|'barrar', cliente }
  const [obs, setObs] = useState('')
  const [motivoBarrado, setMotivoBarrado] = useState('')
  const [salvando, setSalvando] = useState(false)

  const fetchDados = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('clientes')
      .select(`
        *,
        vendedor:profiles!clientes_vendedor_operador_id_fkey(id, nome, email),
        advogado:advogados(nome_completo, oab),
        contrato:contratos_producao!clientes_contrato_producao_id_fkey(data_assinatura)
      `)
      .in('status', ['aguardando_pos_venda', 'em_contato_pos_venda'])
      .order('pos_venda_prazo', { ascending: true, nullsFirst: false })
    setClientes(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchDados()
    const interval = setInterval(fetchDados, 60000) // atualiza a cada minuto
    return () => clearInterval(interval)
  }, [fetchDados])

  // Estatísticas pra cabeçalho
  const stats = {
    total: clientes.length,
    novos: clientes.filter(c => c.status === 'aguardando_pos_venda').length,
    em_contato: clientes.filter(c => c.status === 'em_contato_pos_venda').length,
    urgentes: clientes.filter(c => {
      const p = prazoRestante(c.pos_venda_prazo)
      return p && (p.vencido || p.urgente)
    }).length,
    vencidos: clientes.filter(c => {
      const p = prazoRestante(c.pos_venda_prazo)
      return p?.vencido
    }).length,
  }

  // Filtros
  const filtrados = clientes.filter(c => {
    if (filtro === 'novos' && c.status !== 'aguardando_pos_venda') return false
    if (filtro === 'em_contato' && c.status !== 'em_contato_pos_venda') return false
    if (filtro === 'urgentes') {
      const p = prazoRestante(c.pos_venda_prazo)
      if (!(p?.vencido || p?.urgente)) return false
    }
    if (busca) {
      const b = busca.toLowerCase()
      return c.nome.toLowerCase().includes(b) || c.cpf.includes(b) || c.telefone.includes(b)
    }
    return true
  })

  async function executarAcao() {
    if (!acaoCliente) return
    setSalvando(true)
    try {
      const url = `https://sdqslzpfbazehqcvibjy.supabase.co/functions/v1/gerar-contratos-zapsign/${
        acaoCliente.tipo === 'contato' ? 'pos-venda-marcar-contato' :
        acaoCliente.tipo === 'validar' ? 'pos-venda-validar' :
        'pos-venda-barrar'
      }`
      const body = {
        cliente_id: acaoCliente.cliente.id,
        pos_venda_id: profile.id,
        observacao: obs || null,
        motivo: acaoCliente.tipo === 'barrar' ? (motivoBarrado || obs || 'Sem motivo informado') : undefined,
      }
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabase.supabaseKey}`,
        },
        body: JSON.stringify(body),
      })
      const r = await resp.json()
      if (!r.ok) throw new Error(r.error || 'Erro desconhecido')
      setAcaoCliente(null)
      setObs('')
      setMotivoBarrado('')
      await fetchDados()
    } catch (e) {
      alert('Erro: ' + (e.message || e))
    }
    setSalvando(false)
  }

  function whatsappLink(telefone, nome) {
    const tel = (telefone || '').replace(/\D/g, '')
    const numero = tel.startsWith('55') ? tel : '55' + tel
    const msg = encodeURIComponent(`Olá ${nome.split(' ')[0]}! Sou da KR Previdência. Estou ligando para confirmar a contratação do seu serviço de salário-maternidade que você assinou. Tudo certo? Tenho algumas perguntas rápidas.`)
    return `https://wa.me/${numero}?text=${msg}`
  }

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>Carregando fila do pós-venda...</div>

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 40 }}>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 22, fontWeight: 600, color: '#111', marginBottom: 4 }}>📞 Fila de Pós-Venda / Qualidade</h2>
        <div style={{ fontSize: 13, color: '#666' }}>
          Você tem <strong>5 dias</strong> a partir da assinatura pra validar ou barrar cada cliente.
        </div>
      </div>

      {/* Cards de estatísticas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 18 }}>
        <button onClick={() => setFiltro('todos')} style={statCard(filtro === 'todos', '#185FA5')}>
          <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total na fila</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#111', marginTop: 4 }}>{stats.total}</div>
        </button>
        <button onClick={() => setFiltro('novos')} style={statCard(filtro === 'novos', '#185FA5', '#E6F1FB')}>
          <div style={{ fontSize: 11, color: '#185FA5', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🆕 Novos</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#185FA5', marginTop: 4 }}>{stats.novos}</div>
        </button>
        <button onClick={() => setFiltro('em_contato')} style={statCard(filtro === 'em_contato', '#854F0B', '#FAEEDA')}>
          <div style={{ fontSize: 11, color: '#854F0B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>📞 Em contato</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#854F0B', marginTop: 4 }}>{stats.em_contato}</div>
        </button>
        <button onClick={() => setFiltro('urgentes')} style={statCard(filtro === 'urgentes', '#A32D2D', '#FCEBEB')}>
          <div style={{ fontSize: 11, color: '#A32D2D', textTransform: 'uppercase', letterSpacing: '0.5px' }}>⚠️ Urgentes</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#A32D2D', marginTop: 4 }}>{stats.urgentes}</div>
        </button>
      </div>

      {/* Busca */}
      <div style={{ marginBottom: 14 }}>
        <input
          type="text"
          placeholder="🔍 Buscar por nome, CPF ou telefone..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          style={{ width: '100%', padding: '10px 14px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 8, background: '#fff', outline: 'none' }}
        />
      </div>

      {/* Lista */}
      {filtrados.length === 0 ? (
        <div style={{ background: '#fff', padding: 40, textAlign: 'center', borderRadius: 12, border: '0.5px solid rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🎉</div>
          <div style={{ fontSize: 14, color: '#666' }}>
            {filtro === 'todos' ? 'Fila vazia! Nenhum cliente aguardando contato.' : 'Nenhum cliente nesse filtro.'}
          </div>
        </div>
      ) : filtrados.map(c => {
        const info = STATUS_LABEL[c.status] || STATUS_LABEL.aguardando_pos_venda
        const prazo = prazoRestante(c.pos_venda_prazo)
        const tempoEsperando = c.contrato?.data_assinatura ? tempoRelativo(c.contrato.data_assinatura) : 'recente'

        return (
          <div key={c.id} style={{
            background: '#fff',
            border: prazo?.vencido ? '1.5px solid #A32D2D' : prazo?.urgente ? '1px solid #A32D2D60' : '0.5px solid rgba(0,0,0,0.1)',
            borderRadius: 12,
            padding: 14,
            marginBottom: 10,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#111' }}>{c.nome}</div>
                  <span style={{ fontSize: 10, padding: '2px 6px', background: info.bg, color: info.cor, borderRadius: 6, fontWeight: 500 }}>
                    {info.icon} {info.label}
                  </span>
                  {c.pos_venda_tentativas > 0 && (
                    <span style={{ fontSize: 10, padding: '2px 6px', background: '#f0f0ee', color: '#5F5E5A', borderRadius: 6 }}>
                      📞 {c.pos_venda_tentativas} tentativa{c.pos_venda_tentativas !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 2 }}>
                  {c.cpf} · {c.telefone} · {c.cidade}/{c.uf}
                </div>
                <div style={{ fontSize: 11, color: '#888' }}>
                  Produto: <strong>{c.produto}</strong> · Vendedora: {c.vendedor?.nome || '—'} · Assinou {tempoEsperando}
                </div>
                {c.advogado && (
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                    Advogado: {c.advogado.nome_completo} ({c.advogado.oab})
                  </div>
                )}
              </div>

              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {prazo && (
                  <div style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: prazo.vencido ? '#fff' : prazo.urgente ? '#A32D2D' : '#5F5E5A',
                    background: prazo.vencido ? '#A32D2D' : prazo.urgente ? '#FCEBEB' : '#f0f0ee',
                    padding: '4px 8px',
                    borderRadius: 6,
                    display: 'inline-block',
                  }}>
                    ⏰ {prazo.texto}
                  </div>
                )}
              </div>
            </div>

            {/* Observações anteriores */}
            {c.pos_venda_observacao && (
              <div style={{ background: '#FAEEDA', borderRadius: 6, padding: 8, marginBottom: 8, fontSize: 12, color: '#854F0B' }}>
                💬 <strong>Última anotação:</strong> {c.pos_venda_observacao}
                {c.pos_venda_ultimo_contato && <span style={{ color: '#888', marginLeft: 6 }}>({tempoRelativo(c.pos_venda_ultimo_contato)})</span>}
              </div>
            )}

            {/* Ações */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <a href={whatsappLink(c.telefone, c.nome)} target="_blank" rel="noreferrer" style={btnAcao('#3B6D11', '#EAF3DE', { flex: 1, textDecoration: 'none', textAlign: 'center', minWidth: 120 })}>
                💬 Abrir WhatsApp
              </a>
              <button onClick={() => { setAcaoCliente({ tipo: 'contato', cliente: c }); setObs(c.pos_venda_observacao || '') }} style={btnAcao('#854F0B', '#FAEEDA', { flex: 1, minWidth: 120 })}>
                📞 Marcar contato realizado
              </button>
              <button onClick={() => { setAcaoCliente({ tipo: 'validar', cliente: c }); setObs('') }} style={btnAcao('#3B6D11', '#3B6D11', { flex: 1, color: '#fff', minWidth: 120 })}>
                ✅ Validar venda
              </button>
              <button onClick={() => { setAcaoCliente({ tipo: 'barrar', cliente: c }); setObs(''); setMotivoBarrado('') }} style={btnAcao('#A32D2D', '#FCEBEB', { minWidth: 100 })}>
                ❌ Barrar
              </button>
            </div>
          </div>
        )
      })}

      {/* Modal de ação */}
      {acaoCliente && (
        <div onClick={() => !salvando && setAcaoCliente(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 480, width: '100%' }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#111', marginBottom: 4 }}>
              {acaoCliente.tipo === 'contato' && '📞 Marcar contato realizado'}
              {acaoCliente.tipo === 'validar' && '✅ Validar venda'}
              {acaoCliente.tipo === 'barrar' && '❌ Barrar cliente'}
            </div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>
              Cliente: <strong>{acaoCliente.cliente.nome}</strong>
            </div>

            {acaoCliente.tipo === 'contato' && (
              <div style={{ background: '#FAEEDA', padding: 10, borderRadius: 6, fontSize: 12, color: '#854F0B', marginBottom: 12 }}>
                Isso vai registrar mais 1 tentativa de contato. Use quando ligou mas precisa retornar depois.
              </div>
            )}
            {acaoCliente.tipo === 'validar' && (
              <div style={{ background: '#EAF3DE', padding: 10, borderRadius: 6, fontSize: 12, color: '#3B6D11', marginBottom: 12 }}>
                ✓ Cliente vai pra próxima etapa (Sthefany — analista). Você não verá mais ele aqui.
              </div>
            )}
            {acaoCliente.tipo === 'barrar' && (
              <>
                <div style={{ background: '#FCEBEB', padding: 10, borderRadius: 6, fontSize: 12, color: '#A32D2D', marginBottom: 12 }}>
                  ⚠️ Isso vai <strong>cancelar o contrato no ZapSign</strong>, liberar o lote do advogado e <strong>desconta o bônus da vendedora</strong>. A vendedora será notificada pra reabordar.
                </div>
                <label style={{ fontSize: 12, color: '#111', fontWeight: 500, marginBottom: 4, display: 'block' }}>Motivo do barramento *</label>
                <select value={motivoBarrado} onChange={e => setMotivoBarrado(e.target.value)} style={{ width: '100%', padding: 10, fontSize: 13, border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 8, background: '#fff', marginBottom: 12 }}>
                  <option value="">Selecione...</option>
                  {MOTIVOS_BARRADO.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </>
            )}

            <label style={{ fontSize: 12, color: '#111', fontWeight: 500, marginBottom: 4, display: 'block' }}>
              Observações {acaoCliente.tipo === 'barrar' ? '(detalhes do motivo)' : '(opcional)'}
            </label>
            <textarea
              value={obs}
              onChange={e => setObs(e.target.value)}
              placeholder={acaoCliente.tipo === 'contato' ? 'Ex: Liguei mas caiu na caixa postal. Vou tentar amanhã.' :
                            acaoCliente.tipo === 'validar' ? 'Ex: Cliente confirmou contratação, está alinhada com tudo.' :
                            'Detalhe o motivo do barramento...'}
              rows={4}
              style={{ width: '100%', padding: 10, fontSize: 13, border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 8, fontFamily: 'inherit', resize: 'vertical', outline: 'none', marginBottom: 16 }}
            />

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setAcaoCliente(null)} disabled={salvando} style={{ padding: '8px 14px', background: '#f0f0ee', color: '#5F5E5A', border: 'none', borderRadius: 7, fontSize: 13, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                onClick={executarAcao}
                disabled={salvando || (acaoCliente.tipo === 'barrar' && !motivoBarrado)}
                style={{
                  padding: '8px 14px',
                  background: acaoCliente.tipo === 'validar' ? '#3B6D11' : acaoCliente.tipo === 'barrar' ? '#A32D2D' : '#854F0B',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 7,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: (salvando || (acaoCliente.tipo === 'barrar' && !motivoBarrado)) ? 'not-allowed' : 'pointer',
                  opacity: (salvando || (acaoCliente.tipo === 'barrar' && !motivoBarrado)) ? 0.5 : 1,
                }}
              >
                {salvando ? 'Salvando...' :
                 acaoCliente.tipo === 'contato' ? 'Registrar contato' :
                 acaoCliente.tipo === 'validar' ? 'Validar venda' : 'Barrar cliente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function statCard(ativo, cor, bg = '#fff') {
  return {
    background: ativo ? bg : '#fff',
    border: `1px solid ${ativo ? cor : 'rgba(0,0,0,0.1)'}`,
    borderRadius: 12,
    padding: 14,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.15s',
  }
}

function btnAcao(cor, bg, extra = {}) {
  return {
    padding: '8px 12px',
    background: bg,
    color: cor === bg ? '#fff' : cor,
    border: `0.5px solid ${cor}`,
    borderRadius: 7,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    ...extra,
  }
}
