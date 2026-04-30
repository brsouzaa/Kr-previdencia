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
  if (ms < 0) return { vencido: true, texto: 'PRAZO VENCIDO', nivel: 'vencido' }
  const horas = Math.floor(ms / 3600000)
  const min = Math.floor((ms % 3600000) / 60000)

  // Escalas por horas (sobre 24h totais):
  // >18h restantes (0-6h passou)  → verde (tranquilo)
  // 12-18h restantes (6-12h passou) → amarelo (atenção)
  // 6-12h restantes (12-18h passou) → laranja (urgente)
  // <6h restantes (18-24h passou)  → vermelho (crítico)
  let nivel = 'tranquilo'
  if (horas < 6) nivel = 'critico'
  else if (horas < 12) nivel = 'urgente'
  else if (horas < 18) nivel = 'atencao'

  const texto = horas < 1 ? `${min}min restantes` :
                horas < 24 ? `${horas}h ${min}min restantes` :
                `${Math.floor(horas/24)}d ${horas%24}h restantes`
  return { vencido: false, horas, min, texto, nivel, urgente: nivel === 'critico' || nivel === 'urgente' }
}

function corPrazo(nivel) {
  if (nivel === 'vencido') return { bg: '#A32D2D', cor: '#fff', borda: '#A32D2D' }
  if (nivel === 'critico') return { bg: '#FCEBEB', cor: '#A32D2D', borda: '#A32D2D' }
  if (nivel === 'urgente') return { bg: '#FBE5D6', cor: '#C2410C', borda: '#C2410C' }
  if (nivel === 'atencao') return { bg: '#FAEEDA', cor: '#854F0B', borda: '#854F0B' }
  return { bg: '#EAF3DE', cor: '#3B6D11', borda: '#3B6D11' }
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
  const [prints, setPrints] = useState([]) // arquivos selecionados (File[])
  const [printsUrls, setPrintsUrls] = useState([]) // URLs apos upload
  const [uploadando, setUploadando] = useState(false)

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
    criticos: clientes.filter(c => {
      const p = prazoRestante(c.pos_venda_prazo)
      return p && (p.nivel === 'critico' || p.nivel === 'vencido')
    }).length,
    urgentes: clientes.filter(c => {
      const p = prazoRestante(c.pos_venda_prazo)
      return p && (p.nivel === 'urgente' || p.nivel === 'critico' || p.nivel === 'vencido')
    }).length,
  }

  // Filtros
  const filtrados = clientes.filter(c => {
    if (filtro === 'novos' && c.status !== 'aguardando_pos_venda') return false
    if (filtro === 'em_contato' && c.status !== 'em_contato_pos_venda') return false
    if (filtro === 'criticos') {
      const p = prazoRestante(c.pos_venda_prazo)
      if (!(p?.nivel === 'critico' || p?.nivel === 'vencido')) return false
    }
    if (filtro === 'urgentes') {
      const p = prazoRestante(c.pos_venda_prazo)
      if (!(p?.nivel === 'urgente' || p?.nivel === 'critico' || p?.nivel === 'vencido')) return false
    }
    if (busca) {
      const b = busca.toLowerCase()
      return c.nome.toLowerCase().includes(b) || c.cpf.includes(b) || c.telefone.includes(b)
    }
    return true
  })

  async function executarAcao() {
    if (!acaoCliente) return

    // Upload dos prints PRIMEIRO (se for validar ou barrar)
    let urlsFinais = []
    if (acaoCliente.tipo === 'validar' || acaoCliente.tipo === 'barrar') {
      if (prints.length === 0) {
        alert('Anexe pelo menos 1 print da conversa antes de ' + (acaoCliente.tipo === 'validar' ? 'validar' : 'barrar') + '.')
        return
      }
      setUploadando(true)
      try {
        for (const arquivo of prints) {
          const ext = arquivo.name.split('.').pop().toLowerCase()
          const nomeArquivo = `${acaoCliente.cliente.id}/${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`
          const { error: errUp } = await supabase.storage.from('pos-venda-prints').upload(nomeArquivo, arquivo)
          if (errUp) throw new Error('Erro ao subir print: ' + errUp.message)
          urlsFinais.push(nomeArquivo)
        }
      } catch (e) {
        alert('Erro ao anexar prints: ' + (e.message || e))
        setUploadando(false)
        return
      }
      setUploadando(false)
    }

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
        prints_urls: urlsFinais,
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
      setPrints([])
      setPrintsUrls([])
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
      {/* Animação de pulse pra prazos críticos */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>

      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 22, fontWeight: 600, color: '#111', marginBottom: 4 }}>📞 Fila de Pós-Venda / Qualidade</h2>
        <div style={{ fontSize: 13, color: '#666' }}>
          Você tem <strong>24 horas</strong> a partir da assinatura pra validar ou barrar cada cliente. Após esse prazo, o cliente é <strong>barrado automaticamente</strong> e a vendedora precisa reabordar.
        </div>
        <div style={{ fontSize: 11, color: '#888', marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span>✅ <strong style={{ color: '#3B6D11' }}>Verde</strong> = +36h</span>
          <span>⏰ <strong style={{ color: '#854F0B' }}>Amarelo</strong> = 24-36h</span>
          <span>⚠️ <strong style={{ color: '#C2410C' }}>Laranja</strong> = 12-24h</span>
          <span>🔥 <strong style={{ color: '#A32D2D' }}>Vermelho</strong> = &lt;12h (URGENTE)</span>
        </div>
      </div>

      {/* Cards de estatísticas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 18 }}>
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
        <button onClick={() => setFiltro('urgentes')} style={statCard(filtro === 'urgentes', '#C2410C', '#FBE5D6')}>
          <div style={{ fontSize: 11, color: '#C2410C', textTransform: 'uppercase', letterSpacing: '0.5px' }}>⚠️ Urgentes (&lt;24h)</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#C2410C', marginTop: 4 }}>{stats.urgentes}</div>
        </button>
        <button onClick={() => setFiltro('criticos')} style={statCard(filtro === 'criticos', '#A32D2D', '#FCEBEB')}>
          <div style={{ fontSize: 11, color: '#A32D2D', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🔥 CRÍTICOS (&lt;12h)</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#A32D2D', marginTop: 4 }}>{stats.criticos}</div>
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
        const corPz = prazo ? corPrazo(prazo.nivel) : null
        const tempoEsperando = c.contrato?.data_assinatura ? tempoRelativo(c.contrato.data_assinatura) : 'recente'

        return (
          <div key={c.id} style={{
            background: '#fff',
            border: prazo?.nivel === 'vencido' ? `1.5px solid ${corPz.borda}`
                  : prazo?.nivel === 'critico' ? `1.5px solid ${corPz.borda}`
                  : prazo?.nivel === 'urgente' ? `1px solid ${corPz.borda}80`
                  : '0.5px solid rgba(0,0,0,0.1)',
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
                {prazo && corPz && (
                  <div style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: corPz.cor,
                    background: corPz.bg,
                    padding: '4px 8px',
                    borderRadius: 6,
                    display: 'inline-block',
                    border: prazo.nivel === 'critico' || prazo.nivel === 'urgente' ? `0.5px solid ${corPz.borda}` : 'none',
                    animation: prazo.nivel === 'critico' || prazo.nivel === 'vencido' ? 'pulse 2s ease-in-out infinite' : 'none',
                  }}>
                    {prazo.nivel === 'vencido' ? '🚨' : prazo.nivel === 'critico' ? '🔥' : prazo.nivel === 'urgente' ? '⚠️' : prazo.nivel === 'atencao' ? '⏰' : '✅'} {prazo.texto}
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

            {/* Anexar prints — obrigatório pra validar/barrar */}
            {(acaoCliente.tipo === 'validar' || acaoCliente.tipo === 'barrar') && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: '#111', fontWeight: 500, marginBottom: 4, display: 'block' }}>
                  📎 Prints da conversa <span style={{ color: '#A32D2D' }}>*obrigatório</span>
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
                  multiple
                  onChange={e => {
                    const novos = Array.from(e.target.files || [])
                    setPrints(p => [...p, ...novos])
                    e.target.value = '' // permite selecionar o mesmo arquivo de novo
                  }}
                  style={{ width: '100%', padding: 8, fontSize: 12, border: '0.5px dashed rgba(0,0,0,0.25)', borderRadius: 8, marginBottom: 8, background: '#fafafa', cursor: 'pointer' }}
                />
                {prints.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                    {prints.map((arq, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#EAF3DE', borderRadius: 6, fontSize: 12, color: '#3B6D11' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>📎 {arq.name} ({Math.round(arq.size/1024)} KB)</span>
                        <button onClick={() => setPrints(p => p.filter((_, idx) => idx !== i))} style={{ border: 'none', background: 'transparent', color: '#A32D2D', cursor: 'pointer', fontSize: 14, padding: 0 }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 10, color: '#888', marginTop: 4 }}>
                  Aceita: JPG, PNG, WebP, HEIC, PDF · até 10MB cada · pode anexar vários
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setAcaoCliente(null); setPrints([]) }} disabled={salvando || uploadando} style={{ padding: '8px 14px', background: '#f0f0ee', color: '#5F5E5A', border: 'none', borderRadius: 7, fontSize: 13, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                onClick={executarAcao}
                disabled={
                  salvando || uploadando ||
                  (acaoCliente.tipo === 'barrar' && !motivoBarrado) ||
                  ((acaoCliente.tipo === 'validar' || acaoCliente.tipo === 'barrar') && prints.length === 0)
                }
                style={{
                  padding: '8px 14px',
                  background: acaoCliente.tipo === 'validar' ? '#3B6D11' : acaoCliente.tipo === 'barrar' ? '#A32D2D' : '#854F0B',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 7,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: (
                    salvando || uploadando ||
                    (acaoCliente.tipo === 'barrar' && !motivoBarrado) ||
                    ((acaoCliente.tipo === 'validar' || acaoCliente.tipo === 'barrar') && prints.length === 0)
                  ) ? 'not-allowed' : 'pointer',
                  opacity: (
                    salvando || uploadando ||
                    (acaoCliente.tipo === 'barrar' && !motivoBarrado) ||
                    ((acaoCliente.tipo === 'validar' || acaoCliente.tipo === 'barrar') && prints.length === 0)
                  ) ? 0.5 : 1,
                }}
              >
                {uploadando ? 'Anexando prints...' :
                 salvando ? 'Salvando...' :
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
