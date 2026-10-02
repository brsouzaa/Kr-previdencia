import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const IA_ID = 'a1a1a1a1-aaaa-bbbb-cccc-aaaaaaaaaaaa'

const MOTIVOS_CANCELAMENTO = [
  { key: 'cliente_desistiu', label: 'Cliente desistiu' },
  { key: 'dados_divergentes', label: 'Dados divergentes / dúvida' },
  { key: 'advogado_errado', label: 'Advogado errado — vai pra outro advogado' },
  { key: 'nao_se_encaixa_no_perfil', label: 'Não se encaixa no perfil' },
  { key: 'duplicidade', label: 'Duplicidade' },
  { key: 'solicitacao_advogado', label: 'Solicitação do advogado' },
  { key: 'outros', label: 'Outros' },
]

const STATUS_OVERRIDE = [
  'aguardando_emissao',
  'aguardando_pos_venda',
  'em_validacao',
  'validado',
  'barrado_pos_venda',
  'cancelado',
]

const s = {
  pageTitle: { fontSize: 20, fontWeight: 600, color: '#0f172a', marginBottom: 4 },
  pageSubtitle: { fontSize: 12, color: '#5b6b84', marginBottom: 20 },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: '#334155', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 20 },
  cardsRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 8 },
  card: { background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 14, padding: '14px 16px' },
  cardLabel: { fontSize: 11, color: '#5b6b84', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 },
  cardNum: { fontSize: 22, fontWeight: 600, color: '#0f172a' },
  cardSub: { fontSize: 11, color: '#5b6b84', marginTop: 2 },
  alerta: { background: 'rgba(248,113,113,.14)', border: '1.5px solid #f87171', borderRadius: 12, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 },
  alertaIcon: { fontSize: 18 },
  alertaText: { fontSize: 13, color: '#dc2626', fontWeight: 500, flex: 1 },
  alertaNum: { fontSize: 18, fontWeight: 700, color: '#dc2626' },
  acoesGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 },
  acaoBtn: { background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.11)', borderRadius: 12, padding: '14px 16px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 },
  acaoBtnIcon: { fontSize: 20 },
  acaoBtnTitulo: { fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 2 },
  acaoBtnDesc: { fontSize: 11, color: '#5b6b84' },
  tabela: { width: '100%', background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 12, overflow: 'hidden', fontSize: 12 },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 600, color: '#5b6b84', textTransform: 'uppercase', letterSpacing: 0.3, background: '#f1f5f9', borderBottom: '0.5px solid rgba(15,23,42,0.07)' },
  td: { padding: '10px 12px', borderTop: '0.5px solid rgba(15,23,42,0.05)', color: '#334155' },
  modalBg: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 16 },
  modal: { background: '#ffffff', borderRadius: 16, padding: 22, maxWidth: 460, width: '100%', maxHeight: '90vh', overflow: 'auto' },
  modalLargo: { background: '#ffffff', borderRadius: 16, padding: 22, maxWidth: 680, width: '100%', maxHeight: '90vh', overflow: 'auto' },
  modalTitulo: { fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 14 },
  label: { fontSize: 12, fontWeight: 500, color: '#334155', marginBottom: 6, display: 'block' },
  input: { width: '100%', padding: '10px 12px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.45)', borderRadius: 8, background: '#ffffff', outline: 'none', boxSizing: 'border-box', marginBottom: 12 },
  select: { width: '100%', padding: '10px 12px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.45)', borderRadius: 8, background: '#ffffff', outline: 'none', boxSizing: 'border-box', marginBottom: 12 },
  textarea: { width: '100%', padding: '10px 12px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.45)', borderRadius: 8, background: '#ffffff', outline: 'none', boxSizing: 'border-box', marginBottom: 12, fontFamily: 'inherit', resize: 'vertical', minHeight: 70 },
  btnPrimary: { padding: '10px 16px', fontSize: 13, fontWeight: 500, background: '#60a5fa', color: '#232a37', border: 'none', borderRadius: 8, cursor: 'pointer' },
  btnDanger: { padding: '10px 16px', fontSize: 13, fontWeight: 500, background: '#f87171', color: '#232a37', border: 'none', borderRadius: 8, cursor: 'pointer' },
  btnGhost: { padding: '10px 16px', fontSize: 13, fontWeight: 500, background: 'transparent', color: '#5b6b84', border: '0.5px solid rgba(0,0,0,0.45)', borderRadius: 8, cursor: 'pointer' },
  msgErro: { padding: 10, background: 'rgba(248,113,113,.14)', color: '#dc2626', fontSize: 12, borderRadius: 8, marginBottom: 10 },
  msgOk: { padding: 10, background: 'rgba(52,211,153,.14)', color: '#059669', fontSize: 12, borderRadius: 8, marginBottom: 10 },
  candidato: { padding: '8px 10px', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 8, cursor: 'pointer', marginBottom: 6, fontSize: 12 },
  candidatoAtivo: { background: 'rgba(96,165,250,.12)', borderColor: '#60a5fa' },

  // ===== confirmacao (02/10, Bruno) =====
  // Pedido: "voce tem certeza?" antes de cancelar. Nao e um aviso generico:
  // a tela repete o NOME da cliente e o que vai acontecer de irreversivel.
  // Confirmacao generica vira automatismo em duas semanas; com o nome, ela le.
  confirmBox: { border: '1.5px solid #f87171', background: 'rgba(248,113,113,.08)', borderRadius: 12, padding: 14, marginBottom: 12 },
  confirmTitulo: { fontSize: 14, fontWeight: 600, color: '#dc2626', marginBottom: 8 },
  confirmNome: { fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 2 },
  confirmLinha: { fontSize: 12, color: '#334155', marginBottom: 4 },
  confirmAviso: { fontSize: 12, color: '#b45309', background: 'rgba(251,191,36,.14)', borderRadius: 8, padding: '8px 10px', marginTop: 10 },

  // ===== fila do retroativo =====
  filaLinha: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: '0.5px solid rgba(15,23,42,0.06)' },
  filaNome: { fontSize: 13, fontWeight: 500, color: '#0f172a' },
  filaSub: { fontSize: 11, color: '#5b6b84' },
  pillOn: { fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: 'rgba(52,211,153,.18)', color: '#059669' },
  pillOff: { fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: 'rgba(148,163,184,.22)', color: '#64748b' },
  btnMini: { padding: '6px 12px', fontSize: 12, fontWeight: 500, borderRadius: 8, cursor: 'pointer', border: 'none' },
}

function tempoRel(dt) {
  const ms = Date.now() - new Date(dt).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `há ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  return `há ${d}d`
}

function formatCPF(cpf) {
  if (!cpf) return ''
  const c = cpf.replace(/\D/g, '')
  if (c.length !== 11) return cpf
  return `${c.slice(0,3)}.${c.slice(3,6)}.${c.slice(6,9)}-${c.slice(9)}`
}

function rotuloAcao(a) {
  const map = {
    cancelar_cliente: 'Cancelou cliente',
    transferir_cliente: 'Transferiu cliente',
    pausar_vendedor: 'Pausou vendedor',
    reativar_vendedor: 'Reativou vendedor',
    trocar_supervisora: 'Trocou supervisora',
    mudar_status_cliente: 'Mudou status',
    rodizio_retroativo: 'Mexeu na fila do Retroativo',
  }
  return map[a] || a
}

export default function CoordenadorB2C() {
  const { profile } = useAuth()
  const [metricas, setMetricas] = useState(null)
  const [alertas, setAlertas] = useState({ posVendaCritico: 0, iaTravada: 0, devolPendente: 0, vendedoresZerados: 0 })
  const [historico, setHistorico] = useState([])
  const [verTudo, setVerTudo] = useState(false)
  const [vendedoresSetor, setVendedoresSetor] = useState([])
  const [supervisorasSetor, setSupervisorasSetor] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalAberto, setModalAberto] = useState(null) // 'cancelar' | 'transferir' | 'pausar' | 'reativar' | 'trocar_sup' | 'status' | 'fila_retroativo' | null

  const setorResp = profile?.setor_responsavel

  const fetchTudo = useCallback(async () => {
    if (!profile?.id || !setorResp) return
    setLoading(true)

    const hojeInicio = new Date()
    hojeInicio.setHours(0,0,0,0)
    const hojeIso = hojeInicio.toISOString()

    // 1) Métricas (queries em paralelo) - RLS já filtra por setor
    const [
      { count: cadastrados },
      { count: emitidos },
      { count: assinados },
      { count: validados },
      { count: cancelados },
      { count: barrados },
    ] = await Promise.all([
      supabase.from('clientes').select('id', { count: 'exact', head: true }).gte('created_at', hojeIso),
      supabase.from('contratos_producao').select('id', { count: 'exact', head: true }).gte('data_envio', hojeIso),
      supabase.from('contratos_producao').select('id', { count: 'exact', head: true }).gte('data_assinatura', hojeIso),
      supabase.from('clientes').select('id', { count: 'exact', head: true }).eq('status', 'validado').gte('updated_at', hojeIso),
      supabase.from('clientes').select('id', { count: 'exact', head: true }).eq('status', 'cancelado').gte('cancelado_em', hojeIso),
      supabase.from('clientes').select('id', { count: 'exact', head: true }).eq('status', 'barrado_pos_venda').gte('pos_venda_barrado_em', hojeIso),
    ])

    setMetricas({
      cadastrados: cadastrados || 0,
      emitidos: emitidos || 0,
      assinados: assinados || 0,
      validados: validados || 0,
      cancelados: cancelados || 0,
      barrados: barrados || 0,
    })

    // 2) Alertas
    const seisHorasFrente = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()
    const doze_horas_atras = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()

    const [{ count: posVendaCritico }, { count: iaTravada }, { count: devolPendente }] = await Promise.all([
      supabase.from('clientes').select('id', { count: 'exact', head: true })
        .in('status', ['aguardando_pos_venda','em_contato_pos_venda'])
        .lte('pos_venda_prazo', seisHorasFrente),
      // 23/09 — 'todos' tambem enxerga a fila da IA, que e de captacao.
      (setorResp === 'captacao' || setorResp === 'todos')
        ? supabase.from('clientes').select('id', { count: 'exact', head: true })
            .eq('status', 'aguardando_revisao_ia')
            .lte('updated_at', doze_horas_atras)
        : Promise.resolve({ count: 0 }),
      supabase.from('clientes').select('id', { count: 'exact', head: true })
        .in('status', ['devolvido_correcao_doc','devolvido_reemissao']),
    ])

    setAlertas({
      posVendaCritico: posVendaCritico || 0,
      iaTravada: iaTravada || 0,
      devolPendente: devolPendente || 0,
      vendedoresZerados: 0, // calculado em refinamento posterior
    })

    // 3) Histórico de ações da coordenadora
    const { data: hist } = await supabase
      .from('acoes_coordenadora')
      .select('id, acao, entidade_tipo, entidade_id, motivo, detalhes, created_at')
      .eq('coordenadora_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(verTudo ? 100 : 20)
    setHistorico(hist || [])

    // 4) Vendedores e supervisoras do setor (pra dropdowns nos modais)
    // 23/09 (Bruno) — com 'todos' NAO da pra filtrar .eq('setor','todos'):
    // voltaria vazio e derrubaria os modais de transferir, pausar, reativar
    // e trocar supervisora de uma vez. Nesse caso a lista sai sem filtro.
    let qVendedores = supabase
      .from('profiles')
      .select('id, nome, ativo, supervisora_id, role, setor')
    if (setorResp !== 'todos') qVendedores = qVendedores.eq('setor', setorResp)
    const { data: vends } = await qVendedores.order('nome')
    setVendedoresSetor((vends || []).filter(v => ['vendedor_operador','supervisor_producao'].includes(v.role)))
    setSupervisorasSetor((vends || []).filter(v => v.role === 'supervisor_producao'))

    setLoading(false)
  }, [profile, setorResp, verTudo])

  useEffect(() => {
    fetchTudo()
    const i = setInterval(fetchTudo, 60000) // refresh a cada 60s
    return () => clearInterval(i)
  }, [fetchTudo])

  if (!profile) return null

  if (profile.role !== 'coordenador_b2c') {
    return (
      <div style={{ padding: 20 }}>
        <div style={s.msgErro}>Esta página é só pra coordenadora B2C.</div>
      </div>
    )
  }

  if (!setorResp) {
    return (
      <div style={{ padding: 20 }}>
        <div style={s.msgErro}>
          Seu profile não tem <code>setor_responsavel</code> definido.
          Peça pro admin configurar pra você ver o painel.
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1200 }}>
      <div style={s.pageTitle}>
        Painel da coordenadora
        <span style={{ fontSize: 12, fontWeight: 400, color: '#5b6b84', marginLeft: 10 }}>
          • Setor: {setorResp === 'captacao' ? 'Captação + IA'
                  : setorResp === 'autonomos' ? 'Autônomos'
                  : 'Todos os setores'}
        </span>
      </div>
      <div style={s.pageSubtitle}>
        Olá, {profile.nome}. {setorResp === 'todos'
          ? 'Você enxerga todos os setores — confira o setor do cliente antes de agir.'
          : 'Tudo abaixo já está filtrado pelo seu setor.'}
      </div>

      <div style={s.sectionTitle}>📊 Produção de hoje</div>
      <div style={s.cardsRow}>
        <CardNum label="Cadastrados" valor={metricas?.cadastrados} loading={loading} />
        <CardNum label="Emitidos" valor={metricas?.emitidos} loading={loading} />
        <CardNum label="Assinados" valor={metricas?.assinados} loading={loading} cor="#059669" />
        <CardNum label="Validados" valor={metricas?.validados} loading={loading} cor="#059669" />
        <CardNum label="Cancelados" valor={metricas?.cancelados} loading={loading} cor={metricas?.cancelados > 0 ? '#dc2626' : '#0f172a'} />
        <CardNum label="Barrados" valor={metricas?.barrados} loading={loading} cor={metricas?.barrados > 0 ? '#dc2626' : '#0f172a'} />
      </div>

      <div style={s.sectionTitle}>⚠️ Alertas agora</div>
      {alertas.posVendaCritico === 0 && alertas.iaTravada === 0 && alertas.devolPendente === 0 && (
        <div style={{ ...s.card, color: '#059669', fontSize: 13 }}>
          ✓ Nenhum alerta crítico no momento.
        </div>
      )}
      {alertas.posVendaCritico > 0 && (
        <div style={s.alerta}>
          <span style={s.alertaIcon}>📞</span>
          <span style={s.alertaText}>Pós-venda crítico — clientes a menos de 6h do vencimento</span>
          <span style={s.alertaNum}>{alertas.posVendaCritico}</span>
        </div>
      )}
      {alertas.iaTravada > 0 && (
        <div style={s.alerta}>
          <span style={s.alertaIcon}>🤖</span>
          <span style={s.alertaText}>IA travada — clientes em revisão há mais de 12h</span>
          <span style={s.alertaNum}>{alertas.iaTravada}</span>
        </div>
      )}
      {alertas.devolPendente > 0 && (
        <div style={s.alerta}>
          <span style={s.alertaIcon}>↩️</span>
          <span style={s.alertaText}>Devoluções pendentes</span>
          <span style={s.alertaNum}>{alertas.devolPendente}</span>
        </div>
      )}

      <div style={s.sectionTitle}>⚡ Ações rápidas</div>
      <div style={s.acoesGrid}>
        <AcaoBtn icone="❌" titulo="Cancelar cliente" desc="Busca por nome ou CPF, motivo obrigatório" onClick={() => setModalAberto('cancelar')} />
        <AcaoBtn icone="🎯" titulo="Fila do Retroativo" desc="Quem do seu time recebe lead novo" onClick={() => setModalAberto('fila_retroativo')} />
        <AcaoBtn icone="↔️" titulo="Transferir cliente" desc="Move cliente entre vendedoras do setor" onClick={() => setModalAberto('transferir')} />
        <AcaoBtn icone="⏸️" titulo="Pausar vendedor" desc="Desativa cadastro de cliente novo" onClick={() => setModalAberto('pausar')} />
        <AcaoBtn icone="▶️" titulo="Reativar vendedor" desc="Volta a deixar cadastrar" onClick={() => setModalAberto('reativar')} />
        <AcaoBtn icone="👤" titulo="Trocar supervisora" desc="Reagrupa vendedor sob outra supervisora" onClick={() => setModalAberto('trocar_sup')} />
        <AcaoBtn icone="🛠️" titulo="Mudar status do cliente" desc="Override pra casos especiais (use com cuidado)" onClick={() => setModalAberto('status')} />
      </div>

      <div style={s.sectionTitle}>📜 Minhas últimas ações</div>
      {historico.length === 0 ? (
        <div style={{ ...s.card, color: '#5b6b84', fontSize: 12 }}>Nenhuma ação registrada ainda.</div>
      ) : (
        <table style={s.tabela}>
          <thead>
            <tr>
              <th style={s.th}>Quando</th>
              <th style={s.th}>Ação</th>
              <th style={s.th}>Alvo</th>
              <th style={s.th}>Motivo</th>
            </tr>
          </thead>
          <tbody>
            {historico.map(h => (
              <tr key={h.id}>
                <td style={s.td}>{tempoRel(h.created_at)}</td>
                <td style={s.td}>{rotuloAcao(h.acao)}</td>
                <td style={s.td}>
                  {h.detalhes?.cliente_nome || h.detalhes?.vendedor_nome || h.entidade_tipo}
                  {h.detalhes?.cliente_cpf && <span style={{ color: '#5b6b84' }}> ({formatCPF(h.detalhes.cliente_cpf)})</span>}
                  {h.acao === 'rodizio_retroativo' && h.detalhes?.faixa && (
                    <span style={{ color: '#5b6b84' }}>
                      {' '}· {h.detalhes.para ? 'entrou na' : 'saiu da'} fila de {h.detalhes.faixa} meses
                    </span>
                  )}
                </td>
                <td style={s.td}>{h.motivo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {historico.length >= 20 && !verTudo && (
        <button onClick={() => setVerTudo(true)} style={{ ...s.btnGhost, marginTop: 10 }}>Ver tudo (até 100)</button>
      )}

      {/* MODAIS */}
      {modalAberto === 'cancelar' && (
        <ModalCancelar onClose={() => setModalAberto(null)} onSucesso={fetchTudo} setorResp={setorResp} />
      )}
      {modalAberto === 'fila_retroativo' && (
        <ModalFilaRetroativo onClose={() => setModalAberto(null)} onSucesso={fetchTudo} />
      )}
      {modalAberto === 'transferir' && (
        <ModalTransferir onClose={() => setModalAberto(null)} onSucesso={fetchTudo} setorResp={setorResp} vendedores={vendedoresSetor} />
      )}
      {(modalAberto === 'pausar' || modalAberto === 'reativar') && (
        <ModalPausarReativar
          tipo={modalAberto}
          vendedores={vendedoresSetor}
          onClose={() => setModalAberto(null)}
          onSucesso={fetchTudo}
        />
      )}
      {modalAberto === 'trocar_sup' && (
        <ModalTrocarSup
          vendedores={vendedoresSetor}
          supervisoras={supervisorasSetor}
          onClose={() => setModalAberto(null)}
          onSucesso={fetchTudo}
        />
      )}
      {modalAberto === 'status' && (
        <ModalMudarStatus onClose={() => setModalAberto(null)} onSucesso={fetchTudo} setorResp={setorResp} />
      )}
    </div>
  )
}

function CardNum({ label, valor, loading, cor = '#0f172a', sub }) {
  return (
    <div style={s.card}>
      <div style={s.cardLabel}>{label}</div>
      <div style={{ ...s.cardNum, color: cor }}>{loading ? '...' : (valor ?? 0)}</div>
      {sub && <div style={s.cardSub}>{sub}</div>}
    </div>
  )
}

function AcaoBtn({ icone, titulo, desc, onClick }) {
  return (
    <button onClick={onClick} style={s.acaoBtn} onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'} onMouseLeave={e => e.currentTarget.style.background = '#ffffff'}>
      <span style={s.acaoBtnIcon}>{icone}</span>
      <div>
        <div style={s.acaoBtnTitulo}>{titulo}</div>
        <div style={s.acaoBtnDesc}>{desc}</div>
      </div>
    </button>
  )
}

// ============================================================
// MODAIS
// ============================================================

function BuscaCliente({ valor, setValor, setSelecionado, setorResp }) {
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando] = useState(false)

  useEffect(() => {
    if (!valor || valor.length < 3) { setResultados([]); return }
    setBuscando(true)
    const cpfNum = valor.replace(/\D/g, '')
    const isCpf = cpfNum.length >= 3
    const query = isCpf
      ? supabase.from('clientes').select('id, nome, cpf, status, vendedor_operador_id, setor').or(`cpf.ilike.%${cpfNum}%,nome.ilike.%${valor}%`).limit(8)
      : supabase.from('clientes').select('id, nome, cpf, status, vendedor_operador_id, setor').ilike('nome', `%${valor}%`).limit(8)
    query.then(({ data }) => {
      // RLS já filtra por setor; segurança extra:
      // 23/09 (Bruno) — setor_responsavel 'todos' = coordenadora de todos os
      // setores. Sem este primeiro ramo, nenhum dos dois de baixo bate e a
      // busca devolve VAZIO pra qualquer cliente, inclusive de captação.
      const filtrado = (data || []).filter(c =>
        setorResp === 'todos'
        || (setorResp === 'captacao' && (c.setor === 'captacao' || c.vendedor_operador_id === IA_ID))
        || (setorResp === 'autonomos' && c.setor === 'autonomos')
      )
      setResultados(filtrado)
      setBuscando(false)
    })
  }, [valor, setorResp])

  return (
    <>
      <input
        style={s.input}
        placeholder="Buscar por nome ou CPF (mínimo 3 caracteres)"
        value={valor}
        onChange={e => { setValor(e.target.value); setSelecionado(null) }}
        autoFocus
      />
      {buscando && <div style={{ fontSize: 11, color: '#5b6b84', marginBottom: 8 }}>Buscando...</div>}
      {resultados.length > 0 && (
        <div style={{ maxHeight: 200, overflow: 'auto', marginBottom: 10 }}>
          {resultados.map(c => (
            <div
              key={c.id}
              onClick={() => { setSelecionado(c); setValor(c.nome) }}
              style={{ ...s.candidato }}
              onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
              onMouseLeave={e => e.currentTarget.style.background = '#ffffff'}
            >
              <div style={{ fontWeight: 500 }}>{c.nome}</div>
              <div style={{ fontSize: 11, color: '#5b6b84' }}>
                {formatCPF(c.cpf)} • {c.status}
                {/* 23/09 — com 'todos' podem vir dois homonimos de setores
                    diferentes (aconteceu com ALINE APARECIDA DOS SANTOS).
                    Sem o setor na linha nao da pra saber qual e qual. */}
                {setorResp === 'todos' && c.setor ? ` • ${c.setor}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ────────────────────────────────────────────────────────────
// CANCELAR — com confirmacao em dois passos (02/10, Bruno)
// ────────────────────────────────────────────────────────────
function ModalCancelar({ onClose, onSucesso, setorResp }) {
  const [busca, setBusca] = useState('')
  const [cliente, setCliente] = useState(null)
  const [motivoKey, setMotivoKey] = useState('')
  const [motivoTexto, setMotivoTexto] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  const motivoBase = MOTIVOS_CANCELAMENTO.find(m => m.key === motivoKey)?.label || motivoKey
  const motivoFinal = motivoTexto.trim() ? `${motivoBase}: ${motivoTexto.trim()}` : motivoBase

  // O contrato no ZapSign morre de 3 a 5 minutos depois do cancelamento (o cron
  // zapsign-cancelar-fila roda a cada 5 min). Depois disso o link nao volta: a
  // cliente teria que assinar um contrato novo. Por isso o aviso so aparece
  // quando existe contrato vivo.
  const temContratoVivo = cliente && ['emitido','assinado','aguardando_pos_venda','em_contato_pos_venda','em_validacao','validado'].includes(cliente.status)

  function revisar() {
    setErro('')
    if (!cliente) { setErro('Selecione um cliente.'); return }
    if (!motivoKey) { setErro('Escolha um motivo.'); return }
    if (motivoFinal.length < 3) { setErro('Motivo precisa de pelo menos 3 caracteres.'); return }
    setConfirmando(true)
  }

  async function confirmar() {
    setErro('')
    setEnviando(true)
    // Chama edge function pra cancelar ZapSign + cancelar cliente + auditar
    const { data: { session } } = await supabase.auth.getSession()
    const { data: { user } } = await supabase.auth.getUser()
    const resp = await fetch(
      `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/gerar-contratos-zapsign/coordenadora-cancelar-cliente`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.REACT_APP_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${session?.access_token || process.env.REACT_APP_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          cliente_id: cliente.id,
          motivo: motivoFinal,
          coord_id: user?.id,
        }),
      }
    )
    const body = await resp.json()
    setEnviando(false)
    if (!body.ok) { setErro(body.error || 'Erro ao cancelar'); setConfirmando(false); return }
    onSucesso()
    onClose()
  }

  return (
    <div style={s.modalBg} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalTitulo}>❌ Cancelar cliente</div>
        {erro && <div style={s.msgErro}>{erro}</div>}

        {confirmando ? (
          <>
            <div style={s.confirmBox}>
              <div style={s.confirmTitulo}>Você tem certeza?</div>
              <div style={s.confirmNome}>{cliente.nome}</div>
              <div style={s.confirmLinha}>
                {formatCPF(cliente.cpf)} · status atual <b>{cliente.status}</b>
                {setorResp === 'todos' && cliente.setor ? <> · setor <b>{cliente.setor}</b></> : null}
              </div>
              <div style={{ ...s.confirmLinha, marginTop: 8 }}>
                Motivo: <b>{motivoFinal}</b>
              </div>
              {temContratoVivo && (
                <div style={s.confirmAviso}>
                  ⚠️ Esta cliente tem contrato ativo. Cancelar <b>mata o link de assinatura no ZapSign</b> em
                  poucos minutos, e ele não volta — se for engano, ela vai precisar assinar um contrato novo.
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={s.btnGhost} onClick={() => setConfirmando(false)} disabled={enviando}>
                Voltar
              </button>
              <button style={s.btnDanger} onClick={confirmar} disabled={enviando}>
                {enviando ? 'Cancelando...' : `Sim, cancelar ${cliente.nome.trim().split(/\s+/)[0]}`}
              </button>
            </div>
          </>
        ) : (
          <>
            <label style={s.label}>Cliente</label>
            <BuscaCliente valor={busca} setValor={setBusca} setSelecionado={setCliente} setorResp={setorResp} />
            {cliente && (
              <div style={{ ...s.card, background: 'rgba(96,165,250,.12)', borderColor: '#60a5fa', marginBottom: 12, padding: '8px 10px' }}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{cliente.nome}</div>
                <div style={{ fontSize: 11, color: '#5b6b84' }}>
                  {formatCPF(cliente.cpf)} • Status atual: <b>{cliente.status}</b>
                  {setorResp === 'todos' && cliente.setor ? <> • Setor: <b>{cliente.setor}</b></> : null}
                </div>
              </div>
            )}

            <label style={s.label}>Motivo</label>
            <select style={s.select} value={motivoKey} onChange={e => setMotivoKey(e.target.value)}>
              <option value="">Selecione…</option>
              {MOTIVOS_CANCELAMENTO.map(m => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>

            <label style={s.label}>Observação (opcional)</label>
            <textarea
              style={s.textarea}
              placeholder="Detalhe adicional (vai pro log de auditoria)"
              value={motivoTexto}
              onChange={e => setMotivoTexto(e.target.value)}
            />

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
              <button style={s.btnGhost} onClick={onClose}>Fechar</button>
              <button style={s.btnDanger} onClick={revisar}>Revisar e cancelar</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// FILA DO RETROATIVO (02/10, Bruno)
// Quem do time recebe lead novo no Revisao IA Retroativo.
// O escopo vem do banco: a coordenadora de autonomos ve a faixa de 24 meses,
// a de captacao ve a de 12, e quem e 'todos' ve as duas.
// ────────────────────────────────────────────────────────────
function ModalFilaRetroativo({ onClose, onSucesso }) {
  const [fila, setFila] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [alvo, setAlvo] = useState(null)      // { vendedor_id, nome, faixa, ligar }
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    const { data, error } = await supabase.rpc('coordenadora_rodizio_retroativo_listar')
    if (error) setErro(error.message)
    setFila(data || [])
    setCarregando(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function confirmar() {
    setErro(''); setOk('')
    if (motivo.trim().length < 3) { setErro('Motivo precisa de pelo menos 3 caracteres.'); return }
    setEnviando(true)
    const { error } = await supabase.rpc('coordenadora_rodizio_retroativo', {
      p_vendedor_id: alvo.vendedor_id,
      p_ativo: alvo.ligar,
      p_motivo: motivo.trim(),
    })
    setEnviando(false)
    if (error) { setErro(error.message); return }
    setOk(`${alvo.nome} ${alvo.ligar ? 'voltou pra fila' : 'saiu da fila'} de ${alvo.faixa} meses.`)
    setAlvo(null); setMotivo('')
    await carregar()
    onSucesso()
  }

  const faixas = [...new Set(fila.map(f => f.faixa))].sort()

  return (
    <div style={s.modalBg} onClick={onClose}>
      <div style={s.modalLargo} onClick={e => e.stopPropagation()}>
        <div style={s.modalTitulo}>🎯 Fila do Revisão IA Retroativo</div>
        <div style={{ fontSize: 12, color: '#5b6b84', marginBottom: 14 }}>
          Quem está <b>na fila</b> recebe lead novo quando a Maithe aprova. Tirar da fila
          não mexe nos leads que a pessoa já tem na mão — só para de mandar novos.
        </div>

        {erro && <div style={s.msgErro}>{erro}</div>}
        {ok && <div style={s.msgOk}>{ok}</div>}

        {alvo ? (
          <div style={s.confirmBox}>
            <div style={s.confirmTitulo}>Você tem certeza?</div>
            <div style={s.confirmNome}>{alvo.nome}</div>
            <div style={s.confirmLinha}>
              {alvo.ligar
                ? <>Vai <b>voltar a receber</b> lead novo da faixa de {alvo.faixa} meses.</>
                : <>Vai <b>parar de receber</b> lead novo da faixa de {alvo.faixa} meses. Os leads que já estão com ela continuam com ela.</>}
            </div>
            <label style={{ ...s.label, marginTop: 10 }}>Motivo (obrigatório)</label>
            <textarea
              style={{ ...s.textarea, marginBottom: 0 }}
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder={alvo.ligar ? 'Ex: voltou de folga' : 'Ex: de folga hoje, carga alta, treinamento…'}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button style={s.btnGhost} onClick={() => { setAlvo(null); setMotivo('') }} disabled={enviando}>Voltar</button>
              <button style={alvo.ligar ? s.btnPrimary : s.btnDanger} onClick={confirmar} disabled={enviando}>
                {enviando ? 'Salvando...' : (alvo.ligar ? 'Sim, colocar na fila' : 'Sim, tirar da fila')}
              </button>
            </div>
          </div>
        ) : carregando ? (
          <div style={{ ...s.card, fontSize: 12, color: '#5b6b84' }}>Carregando...</div>
        ) : fila.length === 0 ? (
          <div style={{ ...s.card, fontSize: 12, color: '#5b6b84' }}>
            Nenhuma vendedora do seu setor está no rodízio do Retroativo.
          </div>
        ) : (
          faixas.map(fx => {
            const doGrupo = fila.filter(f => f.faixa === fx)
            const ativos = doGrupo.filter(f => f.no_rodizio).length
            return (
              <div key={fx} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                  Faixa de {fx} meses
                  <span style={{ fontWeight: 400, color: '#5b6b84' }}> · {ativos} de {doGrupo.length} recebendo</span>
                </div>
                <div style={{ ...s.card, padding: 0, overflow: 'hidden' }}>
                  {doGrupo.map(f => (
                    <div key={f.vendedor_id} style={s.filaLinha}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={s.filaNome}>{f.nome}</div>
                        <div style={s.filaSub}>
                          {f.leads_na_mao} na mão · {f.recebidos_hoje} hoje · {f.em_atendimento} em atendimento
                        </div>
                      </div>
                      <span style={f.no_rodizio ? s.pillOn : s.pillOff}>
                        {f.no_rodizio ? 'RECEBENDO' : 'FORA'}
                      </span>
                      <button
                        style={{
                          ...s.btnMini,
                          background: f.no_rodizio ? 'rgba(248,113,113,.14)' : 'rgba(52,211,153,.18)',
                          color: f.no_rodizio ? '#dc2626' : '#059669',
                        }}
                        onClick={() => setAlvo({
                          vendedor_id: f.vendedor_id, nome: f.nome, faixa: f.faixa, ligar: !f.no_rodizio,
                        })}
                      >
                        {f.no_rodizio ? 'Tirar da fila' : 'Colocar na fila'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })
        )}

        {!alvo && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button style={s.btnGhost} onClick={onClose}>Fechar</button>
          </div>
        )}
      </div>
    </div>
  )
}

function ModalTransferir({ onClose, onSucesso, setorResp, vendedores }) {
  const [busca, setBusca] = useState('')
  const [cliente, setCliente] = useState(null)
  const [novoVendedor, setNovoVendedor] = useState('')
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  async function confirmar() {
    setErro('')
    if (!cliente) { setErro('Selecione o cliente.'); return }
    if (!novoVendedor) { setErro('Selecione o novo vendedor.'); return }
    if (motivo.trim().length < 3) { setErro('Motivo precisa de pelo menos 3 caracteres.'); return }

    setEnviando(true)
    const { error } = await supabase.rpc('coordenadora_transferir_cliente', {
      p_cliente_id: cliente.id,
      p_novo_vendedor_id: novoVendedor,
      p_motivo: motivo.trim(),
    })
    setEnviando(false)
    if (error) { setErro(error.message); return }
    onSucesso()
    onClose()
  }

  return (
    <div style={s.modalBg} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalTitulo}>↔️ Transferir cliente</div>
        {erro && <div style={s.msgErro}>{erro}</div>}

        <label style={s.label}>Cliente</label>
        <BuscaCliente valor={busca} setValor={setBusca} setSelecionado={setCliente} setorResp={setorResp} />

        <label style={s.label}>
          Novo vendedor {setorResp === 'todos' ? '(todos os setores)' : `(do setor ${setorResp})`}
        </label>
        <select style={s.select} value={novoVendedor} onChange={e => setNovoVendedor(e.target.value)}>
          <option value="">Selecione…</option>
          {vendedores.map(v => (
            <option key={v.id} value={v.id}>
              {v.nome}{setorResp === 'todos' && v.setor ? ` · ${v.setor}` : ''} {v.ativo === false ? '(pausado)' : ''}
            </option>
          ))}
        </select>

        <label style={s.label}>Motivo</label>
        <textarea style={s.textarea} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex: vendedor pediu férias, cliente solicitou troca…" />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
          <button style={s.btnGhost} onClick={onClose} disabled={enviando}>Cancelar</button>
          <button style={s.btnPrimary} onClick={confirmar} disabled={enviando}>
            {enviando ? 'Transferindo...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalPausarReativar({ tipo, vendedores, onClose, onSucesso }) {
  const [vendedorId, setVendedorId] = useState('')
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  const filtrados = tipo === 'pausar'
    ? vendedores.filter(v => v.ativo !== false)
    : vendedores.filter(v => v.ativo === false)

  async function confirmar() {
    setErro('')
    if (!vendedorId) { setErro('Selecione o vendedor.'); return }
    if (motivo.trim().length < 3) { setErro('Motivo precisa de pelo menos 3 caracteres.'); return }

    setEnviando(true)
    const fn = tipo === 'pausar' ? 'coordenadora_pausar_vendedor' : 'coordenadora_reativar_vendedor'
    const { error } = await supabase.rpc(fn, {
      p_vendedor_id: vendedorId,
      p_motivo: motivo.trim(),
    })
    setEnviando(false)
    if (error) { setErro(error.message); return }
    onSucesso()
    onClose()
  }

  return (
    <div style={s.modalBg} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalTitulo}>{tipo === 'pausar' ? '⏸️ Pausar vendedor' : '▶️ Reativar vendedor'}</div>
        {erro && <div style={s.msgErro}>{erro}</div>}

        <label style={s.label}>Vendedor</label>
        <select style={s.select} value={vendedorId} onChange={e => setVendedorId(e.target.value)}>
          <option value="">Selecione…</option>
          {filtrados.length === 0
            ? <option disabled>Nenhum vendedor {tipo === 'pausar' ? 'ativo' : 'pausado'} no setor</option>
            : filtrados.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)
          }
        </select>

        <label style={s.label}>Motivo</label>
        <textarea style={s.textarea} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder={tipo === 'pausar' ? 'Ex: férias, problema disciplinar…' : 'Ex: voltou de férias…'} />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
          <button style={s.btnGhost} onClick={onClose} disabled={enviando}>Cancelar</button>
          <button style={tipo === 'pausar' ? s.btnDanger : s.btnPrimary} onClick={confirmar} disabled={enviando}>
            {enviando ? 'Salvando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalTrocarSup({ vendedores, supervisoras, onClose, onSucesso }) {
  const [vendedorId, setVendedorId] = useState('')
  const [novaSupId, setNovaSupId] = useState('')
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  async function confirmar() {
    setErro('')
    if (!vendedorId || !novaSupId) { setErro('Preencha vendedor e supervisora.'); return }
    if (motivo.trim().length < 3) { setErro('Motivo precisa de pelo menos 3 caracteres.'); return }

    setEnviando(true)
    const { error } = await supabase.rpc('coordenadora_trocar_supervisora', {
      p_vendedor_id: vendedorId,
      p_nova_supervisora_id: novaSupId,
      p_motivo: motivo.trim(),
    })
    setEnviando(false)
    if (error) { setErro(error.message); return }
    onSucesso()
    onClose()
  }

  return (
    <div style={s.modalBg} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalTitulo}>👤 Trocar supervisora</div>
        {erro && <div style={s.msgErro}>{erro}</div>}

        <label style={s.label}>Vendedor</label>
        <select style={s.select} value={vendedorId} onChange={e => setVendedorId(e.target.value)}>
          <option value="">Selecione…</option>
          {vendedores.filter(v => v.role === 'vendedor_operador').map(v => (
            <option key={v.id} value={v.id}>{v.nome}</option>
          ))}
        </select>

        <label style={s.label}>Nova supervisora</label>
        <select style={s.select} value={novaSupId} onChange={e => setNovaSupId(e.target.value)}>
          <option value="">Selecione…</option>
          {supervisoras.map(sup => (
            <option key={sup.id} value={sup.id}>{sup.nome}</option>
          ))}
        </select>

        <label style={s.label}>Motivo</label>
        <textarea style={s.textarea} value={motivo} onChange={e => setMotivo(e.target.value)} />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
          <button style={s.btnGhost} onClick={onClose} disabled={enviando}>Cancelar</button>
          <button style={s.btnPrimary} onClick={confirmar} disabled={enviando}>
            {enviando ? 'Salvando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalMudarStatus({ onClose, onSucesso, setorResp }) {
  const [busca, setBusca] = useState('')
  const [cliente, setCliente] = useState(null)
  const [novoStatus, setNovoStatus] = useState('')
  const [motivo, setMotivo] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  function revisar() {
    setErro('')
    if (!cliente) { setErro('Selecione o cliente.'); return }
    if (!novoStatus) { setErro('Escolha o novo status.'); return }
    if (motivo.trim().length < 3) { setErro('Motivo precisa de pelo menos 3 caracteres.'); return }
    setConfirmando(true)
  }

  async function confirmar() {
    setErro('')
    setEnviando(true)
    const { error } = await supabase.rpc('coordenadora_mudar_status_cliente', {
      p_cliente_id: cliente.id,
      p_novo_status: novoStatus,
      p_motivo: motivo.trim(),
    })
    setEnviando(false)
    if (error) { setErro(error.message); setConfirmando(false); return }
    onSucesso()
    onClose()
  }

  return (
    <div style={s.modalBg} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalTitulo}>🛠️ Mudar status (override)</div>
        <div style={{ ...s.msgErro, background: 'rgba(251,191,36,.12)', color: '#b45309' }}>
          ⚠️ Use só pra casos especiais. Toda mudança fica registrada com seu nome.
        </div>
        {erro && <div style={s.msgErro}>{erro}</div>}

        {confirmando ? (
          <>
            <div style={s.confirmBox}>
              <div style={s.confirmTitulo}>Você tem certeza?</div>
              <div style={s.confirmNome}>{cliente.nome}</div>
              <div style={s.confirmLinha}>
                {formatCPF(cliente.cpf)} · de <b>{cliente.status}</b> para <b>{novoStatus}</b>
              </div>
              <div style={{ ...s.confirmLinha, marginTop: 8 }}>Motivo: <b>{motivo.trim()}</b></div>
              {novoStatus === 'cancelado' && (
                <div style={s.confirmAviso}>
                  ⚠️ Mudar para <b>cancelado</b> também mata o link de assinatura no ZapSign em poucos minutos.
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={s.btnGhost} onClick={() => setConfirmando(false)} disabled={enviando}>Voltar</button>
              <button style={s.btnDanger} onClick={confirmar} disabled={enviando}>
                {enviando ? 'Salvando...' : 'Sim, mudar o status'}
              </button>
            </div>
          </>
        ) : (
          <>
            <label style={s.label}>Cliente</label>
            <BuscaCliente valor={busca} setValor={setBusca} setSelecionado={setCliente} setorResp={setorResp} />
            {cliente && (
              <div style={{ fontSize: 11, color: '#5b6b84', marginBottom: 10 }}>
                Status atual: <b>{cliente.status}</b>
              </div>
            )}

            <label style={s.label}>Novo status</label>
            <select style={s.select} value={novoStatus} onChange={e => setNovoStatus(e.target.value)}>
              <option value="">Selecione…</option>
              {STATUS_OVERRIDE.map(st => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>

            <label style={s.label}>Motivo</label>
            <textarea style={s.textarea} value={motivo} onChange={e => setMotivo(e.target.value)} />

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
              <button style={s.btnGhost} onClick={onClose}>Fechar</button>
              <button style={s.btnPrimary} onClick={revisar}>Revisar e mudar</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
