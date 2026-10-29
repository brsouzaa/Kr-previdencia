import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { cores, sombras } from '../lib/tema'
import {
  ETAPAS, etapaInfo, FichaProtocolo, ModalAcao, ACOES, ACOES_POR_ETAPA, Chip, hexA,
  estiloBotao as btn, estiloCard as card, fmtCpf, fmtData, fmtDataHora, diasDesde, diaBR, hojeISO,
  iniciais, useIsMobile, useToast, abrirArquivo, soDig,
  perguntarIA, catPend, rotResolucao, RESOLUCOES_NEGATIVAS, Markdown, copiarTexto,
} from './ProtocoloFicha'

// ===== SETOR DE PROTOCOLO E ACOMPANHAMENTO (28/10/2026, Bruno) =====
// Quem usa: Dra. Jessica (advogada, protocola) e Sthefany (acompanha e cobra).
// Quem entra: contrato ASSINADO em nome dos advogados de app_config.protocolo_advogados_ids
// (trigger no contrato + cron de 10 em 10 min). Tabelas proprias: protocolo_casos,
// protocolo_eventos e protocolo_pendencias. O Acompanhamento Mae antigo ficou intocado.
// Arrastar um card de coluna abre o formulario da acao — a regra (imagem do INSS
// obrigatoria etc.) e do banco, entao arrastar nao pula nenhuma exigencia.

const COLUNAS = [
  { key: 'aguardando_protocolo', etapas: ['aguardando_protocolo'] },
  { key: 'pendencia_docs', etapas: ['pendencia_docs'] },
  { key: 'protocolado', etapas: ['protocolado'] },
  { key: 'exigencia', etapas: ['exigencia'] },
  { key: 'recurso', etapas: ['recurso'] },
  { key: 'deferido', etapas: ['deferido', 'recurso_deferido'] },
  { key: 'indeferido', etapas: ['indeferido', 'recurso_indeferido'] },
]

const ABAS = [
  ['quadro', '▦ Quadro'], ['hoje', 'Chegou hoje'], ['fila', 'Fila de protocolo'], ['protocolados', 'Protocolados'],
  ['pendencias', 'Pendências e exigências'], ['refazer', '✅ Resolvidas · refazer'], ['deferidos', 'Deferidos'], ['indeferidos', 'Indeferidos'], ['acompanhamento', 'Acompanhamento'], ['painel', 'Painel'],
]

const ROTULO_EVENTO = {
  entrada: 'Entrada', protocolado: 'Protocolado', exigencia: 'Exigência', deferido: 'Deferido', indeferido: 'Indeferido',
  recurso: 'Recurso', recurso_deferido: 'Recurso deferido', recurso_indeferido: 'Recurso indeferido',
  pendencia_aberta: 'Pendência aberta', pendencia_resolvida: 'Pendência resolvida', responsavel_avisado: 'Responsável avisado',
  observacao: 'Observação', mudanca_etapa: 'Mudança de etapa',
}
const ICONE_EVENTO = {
  entrada: '📥', protocolado: '📨', exigencia: '⚠️', deferido: '✅', indeferido: '⛔', recurso: '⚖️',
  recurso_deferido: '🏆', recurso_indeferido: '✖️', pendencia_aberta: '📌', pendencia_resolvida: '✔️',
  responsavel_avisado: '📣', observacao: '💬', mudanca_etapa: '🔀',
}

// soltar um card numa coluna = qual acao abrir
function acaoDoDrop(caso, col) {
  if (col === 'aguardando_protocolo') return ['voltar_fila']
  if (col === 'pendencia_docs') return ['falta_documento']
  if (col === 'protocolado') return ['protocolado']
  if (col === 'exigencia') return ['exigencia']
  if (col === 'recurso') return ['recurso']
  if (col === 'deferido') return caso.etapa === 'recurso' ? ['recurso_resultado', { resultado: 'recurso_deferido' }] : ['deferido']
  if (col === 'indeferido') return caso.etapa === 'recurso' ? ['recurso_resultado', { resultado: 'recurso_indeferido' }] : ['indeferido']
  return [null]
}

const LIMITE_AGUARDANDO = 3

export default function Protocolo() {
  const { profile } = useAuth()
  const isMobile = useIsMobile()
  const [toast, mostrar] = useToast()
  const [lista, setLista] = useState(null)
  const [alertas, setAlertas] = useState([])
  const [pend, setPend] = useState([])
  const [feed, setFeed] = useState([])
  const [painel, setPainel] = useState(null)
  const [aba, setAba] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 860 ? 'fila' : 'quadro'))
  const [busca, setBusca] = useState('')
  const [fPerfil, setFPerfil] = useState('')
  const [fVend, setFVend] = useState('')
  const [fPeriodo, setFPeriodo] = useState('')
  const [verCancelados, setVerCancelados] = useState(false)
  const [cpfAberto, setCpfAberto] = useState(null)
  const [modal, setModal] = useState(null)
  const [arrastando, setArrastando] = useState(null)
  const [colHover, setColHover] = useState(null)
  const [feedDias, setFeedDias] = useState(7)
  const [feedTipo, setFeedTipo] = useState('')
  const [importAberto, setImportAberto] = useState(false)
  const [atualizadoEm, setAtualizadoEm] = useState(null)
  const [carregando, setCarregando] = useState(false)
  // 29/10 — pendencias resolvidas pelo Acompanhamento de clientes, para a advogada refazer
  const [refazer, setRefazer] = useState([])
  const [gerando, setGerando] = useState({})   // id -> 'gerando' | mensagem de erro

  const souAcomp = profile?.role === 'admin' || profile?.protocolo_papel === 'acompanhamento'

  const carregar = useCallback(async () => {
    setCarregando(true)
    const [l, a, p, rf] = await Promise.all([
      supabase.rpc('protocolo_lista'),
      supabase.rpc('protocolo_alertas'),
      supabase.rpc('protocolo_pendencias_lista'),
      supabase.rpc('protocolo_refazer_lista'),
    ])
    setRefazer(Array.isArray(rf.data) ? rf.data : [])
    if (l.error) mostrar('Erro ao carregar: ' + l.error.message, 'erro')
    setLista(Array.isArray(l.data) ? l.data : [])
    setAlertas(Array.isArray(a.data) ? a.data : [])
    setPend(Array.isArray(p.data) ? p.data : [])
    setAtualizadoEm(new Date())
    setCarregando(false)
  }, [mostrar])

  const carregarFeed = useCallback(async () => {
    const { data } = await supabase.rpc('protocolo_feed', { p_dias: feedDias, p_tipo: feedTipo || null })
    setFeed(Array.isArray(data) ? data : [])
  }, [feedDias, feedTipo])

  const carregarPainel = useCallback(async () => {
    const { data } = await supabase.rpc('protocolo_painel')
    setPainel(data || {})
  }, [])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { const t = setInterval(carregar, 60000); return () => clearInterval(t) }, [carregar])
  useEffect(() => { if (aba === 'acompanhamento') carregarFeed() }, [aba, carregarFeed])
  useEffect(() => { if (aba === 'painel') carregarPainel() }, [aba, carregarPainel])
  useEffect(() => {
    const f = (e) => { if (e.key === 'Escape' && !modal) setCpfAberto(null) }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [modal])

  const tudoMudou = useCallback(() => {
    carregar()
    if (aba === 'acompanhamento') carregarFeed()
    if (aba === 'painel') carregarPainel()
  }, [carregar, carregarFeed, carregarPainel, aba])

  const perfis = useMemo(() => [...new Set((lista || []).map(c => c.perfil_label).filter(Boolean))].sort(), [lista])
  const vendedoras = useMemo(() => [...new Set((lista || []).map(c => c.vendedora_nome).filter(Boolean))].sort(), [lista])

  const filtrada = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const qd = soDig(busca)
    const hoje = hojeISO()
    return (lista || []).filter(c => {
      if (q && !(String(c.nome || '').toLowerCase().includes(q) || (qd.length >= 3 && c.cpf.includes(qd)))) return false
      if (fPerfil && c.perfil_label !== fPerfil) return false
      if (fVend && c.vendedora_nome !== fVend) return false
      if (fPeriodo) {
        const d = diaBR(c.entrou_setor_em)
        if (fPeriodo === 'hoje' && d !== hoje) return false
        if (fPeriodo === '7' && diasDesde(c.entrou_setor_em) > 7) return false
        if (fPeriodo === '30' && diasDesde(c.entrou_setor_em) > 30) return false
      }
      return true
    })
  }, [lista, busca, fPerfil, fVend, fPeriodo])

  const conta = useMemo(() => {
    const L = lista || []
    const hoje = hojeISO()
    return {
      hoje: L.filter(c => diaBR(c.entrou_setor_em) === hoje).length,
      fila: L.filter(c => c.etapa === 'aguardando_protocolo').length,
      protocolados: L.filter(c => c.etapa === 'protocolado' || c.etapa === 'recurso').length,
      pendencias: L.filter(c => c.etapa === 'pendencia_docs' || c.etapa === 'exigencia').length,
      deferidos: L.filter(c => c.etapa === 'deferido' || c.etapa === 'recurso_deferido').length,
      indeferidos: L.filter(c => c.etapa === 'indeferido' || c.etapa === 'recurso_indeferido').length,
      atrasados: L.filter(c => c.etapa === 'aguardando_protocolo' && diasDesde(c.etapa_desde) > LIMITE_AGUARDANDO).length,
    }
  }, [lista])

  const abrirAcao = (caso, acao, inicial) => setModal({ caso, acao, inicial })

  function soltar(col) {
    const c = (lista || []).find(x => x.id === arrastando)
    setArrastando(null); setColHover(null)
    if (!c) return
    const colAtual = COLUNAS.find(k => k.etapas.includes(c.etapa))?.key
    if (colAtual === col) return
    const [acao, inicial] = acaoDoDrop(c, col)
    if (acao) abrirAcao(c, acao, inicial)
  }

  async function acaoPendencia(id, acao) {
    const { data, error } = await supabase.rpc('protocolo_pendencia_acao', { p_id: id, p_acao: acao, p_obs: null })
    if (error || !data?.ok) { mostrar(error?.message || data?.erro || 'erro', 'erro'); return }
    mostrar(acao === 'avisado' ? 'Responsável avisado — registrado' : 'Pendência resolvida')
    tudoMudou()
  }

  // ------------------------------------------------------------ pecas
  const kpi = ({ rot, n, sub, cor, alvo, icone }) => (
    <button key={rot} onClick={() => alvo && setAba(alvo)} style={{
      ...card, padding: '14px 16px', textAlign: 'left', cursor: alvo ? 'pointer' : 'default', fontFamily: 'inherit',
      border: aba === alvo ? `1.5px solid ${hexA(cor, 0.6)}` : card.border, position: 'relative', overflow: 'hidden', minWidth: 0,
    }}>
      <div style={{ position: 'absolute', right: -14, top: -14, width: 70, height: 70, borderRadius: 999, background: hexA(cor, 0.09) }} />
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: cores.suave }}>{icone} {rot}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: cor, lineHeight: 1.1, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{lista ? n : '—'}</div>
      {sub && <div style={{ fontSize: 12, color: cores.suave, marginTop: 2 }}>{sub}</div>}
    </button>
  )

  const cartao = (c, compacto) => {
    const et = etapaInfo(c.etapa)
    const dias = diasDesde(c.etapa_desde)
    const atrasado = (c.etapa === 'aguardando_protocolo' && dias > LIMITE_AGUARDANDO) || (c.etapa === 'exigencia' && !!c.exigencia_prazo && c.exigencia_prazo <= somaHoje(5))
    return (
      <div
        key={c.id}
        draggable={!isMobile}
        onDragStart={(e) => { e.dataTransfer.setData('text/plain', c.id); e.dataTransfer.effectAllowed = 'move'; setArrastando(c.id) }}
        onDragEnd={() => { setArrastando(null); setColHover(null) }}
        onClick={() => setCpfAberto(c.cpf)}
        className="kr-cartao"
        style={{
          background: '#fff', borderRadius: 14, border: `1px solid ${cores.cardBorda}`, padding: compacto ? 11 : 13,
          boxShadow: arrastando === c.id ? sombras.cardHover : '0 1px 2px rgba(15,23,42,.05)', cursor: isMobile ? 'pointer' : 'grab',
          opacity: arrastando === c.id ? 0.55 : 1, transition: 'box-shadow .15s, transform .15s', position: 'relative',
        }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ width: 34, height: 34, borderRadius: 11, background: hexA(et.cor, 0.12), color: et.cor, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 12.5, flexShrink: 0 }}>{iniciais(c.nome)}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 750, color: cores.texto, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{c.nome || 'Sem nome'}</div>
            <div style={{ fontSize: 11.5, color: cores.suave, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{fmtCpf(c.cpf)} · 👶 {fmtData(c.filho_dn)}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 9 }}>
          <Chip cor="#475569">{c.perfil_label}</Chip>
          {c.sem_validacao_ia && <Chip cor={cores.perigo} forte>SEM I.A</Chip>}
          {c.tem_ressalva && <Chip cor="#b45309">ressalva</Chip>}
          {c.pend_abertas > 0 && <Chip cor={cores.alerta}>📌 {c.pend_abertas}</Chip>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 9, fontSize: 11.5, color: cores.suave, gap: 6 }}>
          <span style={{ color: atrasado ? cores.perigo : cores.suave, fontWeight: atrasado ? 800 : 500 }}>
            {c.etapa === 'exigencia' && c.exigencia_prazo ? `prazo ${fmtData(c.exigencia_prazo)}`
              : c.numero_protocolo && c.etapa === 'protocolado' ? `nº ${c.numero_protocolo}`
              : `há ${dias} dia${dias === 1 ? '' : 's'}`}
          </span>
          <span style={{ display: 'flex', gap: 8 }}>
            {c.n_alertas > 0 && <span title="alertas da I.A">⚠ {c.n_alertas}</span>}
            <span title="documentos">📎 {c.n_docs}</span>
            {c.tem_parecer && <span title="parecer da I.A pronto" style={{ color: cores.roxo }}>✦</span>}
          </span>
        </div>
      </div>
    )
  }

  const filtros = (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 0 }}>
        <span style={{ position: 'absolute', left: 11, top: 9, color: cores.suave, fontSize: 14 }}>⌕</span>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome ou CPF"
          style={{ width: '100%', padding: '9px 12px 9px 30px', borderRadius: 11, border: `1px solid ${hexA('#0f172a', 0.12)}`, fontSize: 13.5, boxSizing: 'border-box', background: '#fff' }} />
      </div>
      {[[fPerfil, setFPerfil, 'Todos os perfis', perfis], [fVend, setFVend, 'Todas as vendedoras', vendedoras]].map(([val, set, ph, ops], i) => (
        <select key={i} value={val} onChange={e => set(e.target.value)} style={{ padding: '9px 10px', borderRadius: 11, border: `1px solid ${hexA('#0f172a', 0.12)}`, fontSize: 13, background: '#fff', maxWidth: 220 }}>
          <option value="">{ph}</option>
          {ops.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ))}
      <select value={fPeriodo} onChange={e => setFPeriodo(e.target.value)} style={{ padding: '9px 10px', borderRadius: 11, border: `1px solid ${hexA('#0f172a', 0.12)}`, fontSize: 13, background: '#fff' }}>
        <option value="">Entrada: qualquer data</option>
        <option value="hoje">Entrou hoje</option>
        <option value="7">Últimos 7 dias</option>
        <option value="30">Últimos 30 dias</option>
      </select>
      {(busca || fPerfil || fVend || fPeriodo) && <button onClick={() => { setBusca(''); setFPerfil(''); setFVend(''); setFPeriodo('') }} style={{ ...btn('#475569', false), padding: '8px 11px', fontSize: 12 }}>Limpar</button>}
    </div>
  )

  // ------------------------------------------------------------ quadro
  const quadro = (
    <div style={{ overflowX: 'auto', paddingBottom: 8, margin: '0 -4px' }}>
      <div style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: isMobile ? '82vw' : 'minmax(250px, 1fr)', gap: 12, padding: '0 4px', minWidth: isMobile ? 'auto' : 7 * 250 }}>
        {COLUNAS.map(col => {
          const et = etapaInfo(col.key)
          const itens = filtrada.filter(c => col.etapas.includes(c.etapa))
            .sort((a, b) => col.key === 'aguardando_protocolo' ? new Date(a.etapa_desde) - new Date(b.etapa_desde)
              : col.key === 'exigencia' ? String(a.exigencia_prazo || '9').localeCompare(String(b.exigencia_prazo || '9'))
              : new Date(b.ultima_movimentacao_em) - new Date(a.ultima_movimentacao_em))
          const alvo = arrastando && colHover === col.key
          return (
            <div key={col.key}
              onDragOver={e => { if (arrastando) { e.preventDefault(); setColHover(col.key) } }}
              onDragLeave={() => setColHover(h => (h === col.key ? null : h))}
              onDrop={e => { e.preventDefault(); soltar(col.key) }}
              style={{
                background: alvo ? hexA(et.cor, 0.09) : 'rgba(241,245,249,.75)', borderRadius: 18, padding: 10,
                border: `1.5px ${alvo ? 'dashed' : 'solid'} ${alvo ? et.cor : 'rgba(15,23,42,.05)'}`,
                minHeight: 420, transition: 'background .15s, border-color .15s', display: 'flex', flexDirection: 'column', gap: 10,
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px 2px' }}>
                <span style={{ width: 9, height: 9, borderRadius: 999, background: et.cor, boxShadow: `0 0 0 4px ${hexA(et.cor, 0.15)}` }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: cores.texto, flex: 1 }}>{col.key === 'deferido' ? 'Deferidos' : col.key === 'indeferido' ? 'Indeferidos' : et.label}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: et.cor, background: hexA(et.cor, 0.12), borderRadius: 999, padding: '1px 9px' }}>{itens.length}</span>
              </div>
              <div style={{ display: 'grid', gap: 9, alignContent: 'start', overflowY: 'auto', maxHeight: 'calc(100vh - 330px)', minHeight: 60, paddingRight: 2 }}>
                {itens.map(c => cartao(c, true))}
                {itens.length === 0 && (
                  <div style={{ fontSize: 12.5, color: cores.suave, textAlign: 'center', padding: '22px 8px', border: `1.5px dashed ${hexA('#0f172a', 0.1)}`, borderRadius: 14 }}>
                    {arrastando ? 'Solte aqui' : 'Nenhum caso'}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {!isMobile && <div style={{ fontSize: 12, color: cores.suave, marginTop: 10 }}>Arraste o card para a coluna da nova etapa — o formulário abre pedindo o que é obrigatório (número, termo, imagem do INSS…). Clique no card para abrir a ficha.</div>}
      {(lista || []).some(c => c.etapa === 'cancelado') && (
        <label style={{ fontSize: 12.5, color: cores.suave, display: 'inline-flex', gap: 6, alignItems: 'center', marginTop: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={verCancelados} onChange={e => setVerCancelados(e.target.checked)} /> mostrar cancelados ({(lista || []).filter(c => c.etapa === 'cancelado').length})
        </label>
      )}
      {verCancelados && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10, marginTop: 10 }}>
          {filtrada.filter(c => c.etapa === 'cancelado').map(c => cartao(c, true))}
        </div>
      )}
    </div>
  )

  // ------------------------------------------------------------ listas
  const listaDaAba = useMemo(() => {
    const hoje = hojeISO()
    const L = filtrada
    if (aba === 'hoje') return L.filter(c => diaBR(c.entrou_setor_em) === hoje)
    if (aba === 'fila') return L.filter(c => c.etapa === 'aguardando_protocolo').sort((a, b) => new Date(a.etapa_desde) - new Date(b.etapa_desde))
    if (aba === 'protocolados') return L.filter(c => c.etapa === 'protocolado' || c.etapa === 'recurso').sort((a, b) => String(a.data_protocolo || '').localeCompare(String(b.data_protocolo || '')))
    if (aba === 'pendencias') return L.filter(c => c.etapa === 'pendencia_docs' || c.etapa === 'exigencia').sort((a, b) => String(a.exigencia_prazo || '9999').localeCompare(String(b.exigencia_prazo || '9999')))
    if (aba === 'deferidos' || aba === 'indeferidos') return L.filter(c => (aba === 'deferidos' ? ['deferido', 'recurso_deferido'] : ['indeferido', 'recurso_indeferido']).includes(c.etapa)).sort((a, b) => String(b.data_resultado || b.ultima_movimentacao_em).localeCompare(String(a.data_resultado || a.ultima_movimentacao_em)))
    return L
  }, [filtrada, aba])

  const infoDaLinha = (c) => {
    if (aba === 'fila') { const d = diasDesde(c.etapa_desde); return <span style={{ color: d > LIMITE_AGUARDANDO ? cores.perigo : cores.texto, fontWeight: 800 }}>esperando há {d} dia{d === 1 ? '' : 's'}</span> }
    if (aba === 'protocolados') { const d = diasDesde(c.data_protocolo || c.etapa_desde); return <span><b>{c.numero_protocolo || '—'}</b> · {d} dia{d === 1 ? '' : 's'} sem resposta</span> }
    if (aba === 'pendencias') return c.etapa === 'exigencia' ? <span style={{ color: cores.perigo, fontWeight: 800 }}>exigência · prazo {fmtData(c.exigencia_prazo)}</span> : <span style={{ color: cores.alerta, fontWeight: 700 }}>falta documento · {c.pend_abertas} pendência(s)</span>
    if (aba === 'deferidos' || aba === 'indeferidos') return <span>{fmtData(c.data_resultado)}{c.motivo ? ` · ${c.motivo}` : ''}{c.nb ? ` · NB ${c.nb}` : ''}</span>
    return <span>entrou {fmtDataHora(c.entrou_setor_em)}</span>
  }

  const listaView = (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      {!isMobile && (
        <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 1fr 1.2fr 1.6fr 1fr 210px', gap: 12, padding: '11px 16px', fontSize: 11, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: cores.suave, background: '#f8fafc', borderBottom: `1px solid ${cores.cardBorda}` }}>
          <div>Cliente</div><div>Filho</div><div>Perfil</div><div>Situação</div><div>Vendedora</div><div style={{ textAlign: 'right' }}>Ação</div>
        </div>
      )}
      {listaDaAba.length === 0 && <div style={{ padding: 36, textAlign: 'center', color: cores.suave }}>{lista ? 'Nada aqui por enquanto.' : 'Carregando…'}</div>}
      {listaDaAba.map(c => {
        const et = etapaInfo(c.etapa)
        const prox = (ACOES_POR_ETAPA[c.etapa] || [])[0]
        return isMobile ? (
          <div key={c.id} onClick={() => setCpfAberto(c.cpf)} style={{ padding: 14, borderBottom: `1px solid ${cores.cardBorda}`, cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14.5, color: cores.texto }}>{c.nome}</div>
                <div style={{ fontSize: 12, color: cores.suave, marginTop: 2 }}>{fmtCpf(c.cpf)} · 👶 {fmtData(c.filho_dn)}</div>
              </div>
              <Chip cor={et.cor} forte>{et.curto}</Chip>
            </div>
            <div style={{ fontSize: 12.5, marginTop: 6 }}>{infoDaLinha(c)}</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
              <Chip cor="#475569">{c.perfil_label}</Chip>
              {c.sem_validacao_ia && <Chip cor={cores.perigo} forte>SEM I.A</Chip>}
              {c.tem_ressalva && <Chip cor="#b45309">ressalva</Chip>}
            </div>
            {prox && prox !== 'observacao' && (
              <button onClick={(e) => { e.stopPropagation(); abrirAcao(c, prox) }} style={{ ...btn(ACOES[prox].cor), marginTop: 10, width: '100%', justifyContent: 'center' }}>{ACOES[prox].icone} {ACOES[prox].titulo}</button>
            )}
          </div>
        ) : (
          <div key={c.id} onClick={() => setCpfAberto(c.cpf)} className="kr-linha" style={{ display: 'grid', gridTemplateColumns: '2.2fr 1fr 1.2fr 1.6fr 1fr 210px', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${cores.cardBorda}`, alignItems: 'center', cursor: 'pointer' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
              <div style={{ width: 34, height: 34, borderRadius: 11, background: hexA(et.cor, 0.12), color: et.cor, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 12.5, flexShrink: 0 }}>{iniciais(c.nome)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 750, fontSize: 13.5, color: cores.texto, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</div>
                <div style={{ fontSize: 12, color: cores.suave, fontVariantNumeric: 'tabular-nums', display: 'flex', gap: 6, alignItems: 'center' }}>
                  {fmtCpf(c.cpf)}{c.sem_validacao_ia && <Chip cor={cores.perigo} forte>SEM I.A</Chip>}{c.tem_ressalva && <Chip cor="#b45309">ressalva</Chip>}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 12.5, color: cores.texto }}>{fmtData(c.filho_dn)}</div>
            <div><Chip cor="#475569">{c.perfil_label}</Chip></div>
            <div style={{ fontSize: 12.5, minWidth: 0 }}><Chip cor={et.cor} forte>{et.curto}</Chip> <span style={{ marginLeft: 4 }}>{infoDaLinha(c)}</span></div>
            <div style={{ fontSize: 12.5, color: cores.suave, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.vendedora_nome || '—'}</div>
            <div style={{ textAlign: 'right' }}>
              {prox && prox !== 'observacao' ? (
                <button onClick={(e) => { e.stopPropagation(); abrirAcao(c, prox) }} style={{ ...btn(ACOES[prox].cor), padding: '7px 11px', fontSize: 12 }}>{ACOES[prox].icone} {ACOES[prox].titulo.replace('Marcar como ', '')}</button>
              ) : <span style={{ fontSize: 12, color: cores.azul, fontWeight: 700 }}>Abrir ficha →</span>}
            </div>
          </div>
        )
      })}
    </div>
  )

  // ------------------------------------------------------------ acompanhamento (Sthefany)
  const blocoAlertas = alertas.length > 0 && (
    <div style={{ ...card, padding: 16, background: 'linear-gradient(135deg,#fff1f2,#ffe4e6)', border: '1px solid #fecdd3' }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.08em', color: '#9f1239', textTransform: 'uppercase', marginBottom: 10 }}>🔴 {alertas.length} alerta{alertas.length === 1 ? '' : 's'}</div>
      <div style={{ display: 'grid', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
        {alertas.map((a, i) => (
          <div key={i} onClick={() => setCpfAberto(a.cpf)} style={{ display: 'flex', gap: 10, alignItems: 'center', background: '#fff', borderRadius: 10, padding: '8px 12px', cursor: 'pointer', border: '1px solid #fecdd3' }}>
            <span style={{ fontWeight: 800, color: '#9f1239', fontSize: 13, flex: '0 0 auto', maxWidth: '45%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nome}</span>
            <span style={{ fontSize: 13, color: '#4c0519', minWidth: 0 }}>{a.texto}</span>
          </div>
        ))}
      </div>
    </div>
  )

  const blocoPendencias = (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${cores.cardBorda}` }}>
        <div style={{ fontWeight: 800, fontSize: 14.5 }}>📌 Pendências abertas <span style={{ color: cores.suave, fontWeight: 600 }}>({pend.length})</span></div>
      </div>
      {pend.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: cores.suave, fontSize: 13 }}>Nenhuma pendência aberta. 🎉</div>}
      {pend.map(p => {
        const venceu = p.prazo && p.prazo < hojeISO()
        const cor = p.status === 'avisado' ? cores.azul : cores.alerta
        return (
          <div key={p.id} style={{ padding: '12px 16px', borderBottom: `1px solid ${cores.cardBorda}`, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 2fr 1fr auto', gap: 10, alignItems: 'center' }}>
            <div style={{ minWidth: 0, cursor: 'pointer' }} onClick={() => setCpfAberto(p.cpf)}>
              <div style={{ fontWeight: 800, fontSize: 13.5, color: cores.texto }}>{p.nome}</div>
              <div style={{ fontSize: 12, color: cores.suave }}>{fmtCpf(p.cpf)} · {etapaInfo(p.etapa).curto}</div>
            </div>
            <div style={{ fontSize: 13, color: cores.texto, minWidth: 0 }}>
              <Chip cor={cor} forte>{p.status === 'avisado' ? 'AVISADO' : 'ABERTA'}</Chip> {p.descricao}
            </div>
            <div style={{ fontSize: 12, color: cores.suave }}>
              <div>👤 {p.responsavel || '—'}</div>
              <div style={{ color: p.dias_aberta > 2 && p.status === 'aberta' ? cores.perigo : cores.suave, fontWeight: p.dias_aberta > 2 ? 700 : 500 }}>aberta há {p.dias_aberta} dia(s){p.prazo ? ` · prazo ${fmtData(p.prazo)}` : ''}{venceu ? ' · VENCIDA' : ''}</div>
              {p.avisado_em && <div>avisado por {p.avisado_por} {fmtDataHora(p.avisado_em)}</div>}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
              {p.status === 'aberta' && <button onClick={() => acaoPendencia(p.id, 'avisado')} style={{ ...btn(cores.azul, false), padding: '6px 10px', fontSize: 12 }}>📣 Responsável avisado</button>}
              <button onClick={() => acaoPendencia(p.id, 'resolvida')} style={{ ...btn(cores.ok), padding: '6px 10px', fontSize: 12 }}>✔ Resolvido</button>
            </div>
          </div>
        )
      })}
    </div>
  )

  const blocoFeed = (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderBottom: `1px solid ${cores.cardBorda}` }}>
        <div style={{ fontWeight: 800, fontSize: 14.5 }}>📰 Atualizações</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <select value={feedDias} onChange={e => setFeedDias(Number(e.target.value))} style={{ padding: '6px 8px', borderRadius: 9, fontSize: 12.5 }}>
            <option value={1}>Hoje</option><option value={7}>7 dias</option><option value={30}>30 dias</option><option value={90}>90 dias</option>
          </select>
          <select value={feedTipo} onChange={e => setFeedTipo(e.target.value)} style={{ padding: '6px 8px', borderRadius: 9, fontSize: 12.5 }}>
            <option value="">Todos os tipos</option>
            {Object.entries(ROTULO_EVENTO).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
          </select>
        </div>
      </div>
      <div style={{ maxHeight: 620, overflowY: 'auto' }}>
        {feed.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: cores.suave, fontSize: 13 }}>Nada no período.</div>}
        {feed.map(e => (
          <div key={e.id} style={{ display: 'flex', gap: 12, padding: '11px 16px', borderBottom: `1px solid ${cores.cardBorda}` }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: hexA(etapaInfo(e.etapa_para).cor, 0.1), display: 'grid', placeItems: 'center', flexShrink: 0 }}>{ICONE_EVENTO[e.tipo] || '•'}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13.5, color: cores.texto }}>
                <b style={{ cursor: 'pointer' }} onClick={() => setCpfAberto(e.cpf)}>{e.nome}</b> — {e.texto || ROTULO_EVENTO[e.tipo] || e.tipo}
              </div>
              <div style={{ fontSize: 11.5, color: cores.suave, marginTop: 2 }}>
                {e.feito_por_nome} · {fmtDataHora(e.feito_em)}
                {e.anexo_url && <> · <button onClick={() => abrirArquivo(e.anexo_url)} style={{ border: 'none', background: 'transparent', color: cores.azul, cursor: 'pointer', fontWeight: 700, padding: 0, fontFamily: 'inherit', fontSize: 11.5 }}>ver anexo</button></>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  const acompanhamento = (
    <div style={{ display: 'grid', gap: 16 }}>
      {blocoAlertas || <div style={{ ...card, padding: 16, color: cores.ok, fontWeight: 700, fontSize: 13.5 }}>✔ Nenhum alerta no momento.</div>}
      {souAcomp && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => setImportAberto(true)} style={btn('#0f766e', false)}>⬆ Importar protocolos antigos</button>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1.25fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        {blocoPendencias}
        {blocoFeed}
      </div>
    </div>
  )

  // ------------------------------------------------------------ painel
  const painelView = !painel ? <div style={{ ...card, padding: 30, textAlign: 'center', color: cores.suave }}>Carregando números…</div> : (() => {
    const per = painel.periodos || {}
    const linhas = [['entrada', 'Entraram', cores.azul], ['protocolado', 'Protocolados', '#8b5cf6'], ['deferido', 'Deferidos', cores.ok], ['indeferido', 'Indeferidos', cores.perigo], ['exigencia', 'Exigências', '#ea580c']]
    const maxEtapa = Math.max(1, ...Object.values(painel.por_etapa || {}))
    const maxMot = Math.max(1, ...(painel.motivos || []).map(m => m.n))
    return (
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(5, minmax(0,1fr))', gap: 12 }}>
          {linhas.map(([k, r, cor]) => (
            <div key={k} style={{ ...card, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: cores.suave }}>{r}</div>
              <div style={{ display: 'flex', gap: 14, marginTop: 8, alignItems: 'flex-end' }}>
                {[['hoje', 'hoje'], ['semana', 'semana'], ['mes', 'mês']].map(([kk, rr]) => (
                  <div key={kk}>
                    <div style={{ fontSize: kk === 'mes' ? 26 : 18, fontWeight: 800, color: kk === 'mes' ? cor : cores.texto, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{per[k]?.[kk] ?? 0}</div>
                    <div style={{ fontSize: 11, color: cores.suave, marginTop: 3 }}>{rr}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0,1fr))', gap: 16, alignItems: 'start' }}>
          <div style={{ ...card, padding: 18 }}>
            <div style={{ fontWeight: 800, marginBottom: 12 }}>Casos por etapa</div>
            {ETAPAS.filter(e => painel.por_etapa?.[e.key]).map(e => (
              <div key={e.key} style={{ marginBottom: 9 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span>{e.icone} {e.label}</span><b>{painel.por_etapa[e.key]}</b></div>
                <div style={{ height: 8, borderRadius: 99, background: '#eef2f7', marginTop: 4 }}><div style={{ height: 8, borderRadius: 99, width: `${(100 * painel.por_etapa[e.key]) / maxEtapa}%`, background: e.cor }} /></div>
              </div>
            ))}
          </div>
          <div style={{ ...card, padding: 18 }}>
            <div style={{ fontWeight: 800, marginBottom: 12 }}>% de deferimento por perfil</div>
            {(painel.por_perfil || []).map(p => (
              <div key={p.perfil} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, gap: 8 }}>
                  <span>{p.perfil} <span style={{ color: cores.suave }}>({p.total})</span></span>
                  <b style={{ color: p.taxa == null ? cores.suave : p.taxa >= 70 ? cores.ok : p.taxa >= 40 ? cores.alerta : cores.perigo }}>{p.taxa == null ? 'sem resultado' : p.taxa + '%'}</b>
                </div>
                <div style={{ height: 8, borderRadius: 99, background: '#eef2f7', marginTop: 4, display: 'flex', overflow: 'hidden' }}>
                  <div style={{ width: `${(100 * p.deferidos) / Math.max(1, p.total)}%`, background: cores.ok }} />
                  <div style={{ width: `${(100 * p.indeferidos) / Math.max(1, p.total)}%`, background: cores.perigo }} />
                </div>
                <div style={{ fontSize: 11, color: cores.suave, marginTop: 3 }}>{p.deferidos} deferidos · {p.indeferidos} indeferidos</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ ...card, padding: 18 }}>
              <div style={{ fontWeight: 800, marginBottom: 12 }}>Top motivos de indeferimento</div>
              {(painel.motivos || []).length === 0 && <div style={{ fontSize: 12.5, color: cores.suave }}>Nenhum indeferimento registrado ainda.</div>}
              {(painel.motivos || []).map(m => (
                <div key={m.motivo} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span>{m.motivo}</span><b>{m.n}</b></div>
                  <div style={{ height: 7, borderRadius: 99, background: '#eef2f7', marginTop: 4 }}><div style={{ height: 7, borderRadius: 99, width: `${(100 * m.n) / maxMot}%`, background: cores.perigo }} /></div>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[['Entrada → protocolo', painel.tempo_ate_protocolo_dias], ['Protocolo → resposta', painel.tempo_resposta_inss_dias]].map(([r, v]) => (
                <div key={r} style={{ ...card, padding: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: cores.suave, textTransform: 'uppercase', letterSpacing: '.06em' }}>{r}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{v == null ? '—' : `${v} d`}</div>
                  <div style={{ fontSize: 11, color: cores.suave }}>tempo médio</div>
                </div>
              ))}
              <div style={{ ...card, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: cores.suave, textTransform: 'uppercase', letterSpacing: '.06em' }}>Exceção / liberação</div>
                <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{painel.excecoes?.total ?? 0}</div>
                <div style={{ fontSize: 11, color: cores.suave }}>{painel.excecoes?.deferidos ?? 0} deferidos · {painel.excecoes?.indeferidos ?? 0} indeferidos</div>
              </div>
              <div style={{ ...card, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: cores.suave, textTransform: 'uppercase', letterSpacing: '.06em' }}>Sem validação I.A</div>
                <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, color: painel.sem_validacao ? cores.perigo : cores.texto }}>{painel.sem_validacao ?? 0}</div>
                <div style={{ fontSize: 11, color: cores.suave }}>de {painel.total ?? 0} casos</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  })()

  // ------------------------------------------------------------ resolvidas · refazer (29/10)
  // O time de Acompanhamento resolveu a pendencia (anexou o que faltava ou disse que a
  // cliente nao vai resolver). Aqui a advogada ve o que foi feito e a DEFESA PRONTA da
  // I.A (gerada sozinha uma vez e salva no banco), refaz o caso e marca como refeito.
  // Se ela protocolar / cumprir exigencia depois da resolucao, o item sai sozinho.
  const gerarDefesa = useCallback(async (it) => {
    setGerando(g => ({ ...g, [it.id]: 'gerando' }))
    try {
      const cat = catPend(it.categoria)
      const anexos = Array.isArray(it.resolucao_anexos) ? it.resolucao_anexos.length : 0
      const texto = `⟦DEFESA-PENDENCIA⟧ A pendência abaixo foi RESOLVIDA pelo time de acompanhamento e o caso voltou para a advogada. Responda em markdown curto:
1. **O que fazer agora** (protocolar de novo, cumprir a exigência no Meu INSS ou decidir) — objetivo.
2. **Texto pronto para colar no Meu INSS** (cumprimento de exigência ou observação do requerimento), defendendo a tese da KR.
3. **Documentos para anexar**.
Se a resolução foi negativa (a cliente não vai resolver), diga com franqueza as opções e o risco de cada uma.

Pendência (${cat.rot}): ${it.descricao}
O que o acompanhamento fez: ${rotResolucao(it.categoria, it.resolucao)}${it.resolucao_texto ? ' — ' + it.resolucao_texto : ''}${anexos ? ` (${anexos} anexo(s) enviado(s))` : ''}`
      const resp = await perguntarIA({ caso: { nome: it.nome, cpf: it.cpf, etapa: it.etapa, numero_protocolo: it.numero_protocolo, exigencia_texto: it.exigencia_texto, exigencia_prazo: it.exigencia_prazo }, historico: [], texto })
      await supabase.rpc('protocolo_pendencia_salvar_defesa', { p_id: it.id, p_texto: resp })
      setRefazer(lst => lst.map(x => (x.id === it.id ? { ...x, ia_defesa: resp, ia_defesa_em: new Date().toISOString() } : x)))
      setGerando(g => { const n = { ...g }; delete n[it.id]; return n })
    } catch (e) {
      setGerando(g => ({ ...g, [it.id]: 'Não consegui gerar: ' + String(e.message || e) }))
    }
  }, [])

  // gera a defesa de UM item por vez, so com a aba aberta (nao gasta I.A a toa)
  useEffect(() => {
    if (aba !== 'refazer') return
    if (Object.values(gerando).includes('gerando')) return
    const prox = refazer.find(it => !it.ia_defesa && !gerando[it.id])
    if (prox) gerarDefesa(prox)
  }, [aba, refazer, gerando, gerarDefesa])

  async function marcarRefeito(it) {
    const { data, error } = await supabase.rpc('protocolo_pendencia_refeita', { p_id: it.id })
    if (error || !data?.ok) { mostrar(error?.message || data?.erro || 'erro', 'erro'); return }
    mostrar('Marcado como refeito')
    setRefazer(lst => lst.filter(x => x.id !== it.id))
  }

  const refazerView = (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ ...card, padding: '12px 16px', fontSize: 13, color: cores.suave }}>
        Pendências que o <b style={{ color: cores.texto }}>time de Acompanhamento de clientes</b> já resolveu. Confira o que foi feito, use a defesa pronta da I.A e refaça o caso. Quando você protocolar ou cumprir a exigência, o item sai daqui sozinho.
      </div>
      {refazer.length === 0 && <div style={{ ...card, padding: 36, textAlign: 'center', color: cores.suave }}>Nada para refazer agora.</div>}
      {refazer.map(it => {
        const cat = catPend(it.categoria)
        const neg = RESOLUCOES_NEGATIVAS.includes(it.resolucao)
        const anexos = Array.isArray(it.resolucao_anexos) ? it.resolucao_anexos : []
        const st = gerando[it.id]
        return (
          <div key={it.id} style={{ ...card, padding: 0, overflow: 'hidden', border: `1.5px solid ${neg ? hexA(cores.perigo, 0.45) : hexA(cores.ok, 0.35)}` }}>
            <div style={{ padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: neg ? hexA(cores.perigo, 0.06) : hexA(cores.ok, 0.06) }}>
              <Chip cor={cat.cor} forte>{cat.icone} {cat.rot}</Chip>
              <span style={{ fontSize: 15, fontWeight: 800, color: cores.texto }}>{it.nome}</span>
              <span style={{ fontSize: 12.5, color: cores.suave }}>{fmtCpf(it.cpf)} · {it.vendedora_nome || '—'}</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => setCpfAberto(it.cpf)} style={btn('#475569', false)}>Abrir ficha</button>
                <button onClick={() => marcarRefeito(it)} style={btn(cores.ok)}>✔ Refeito</button>
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) minmax(0,1.3fr)', gap: 0 }}>
              <div style={{ padding: 16, borderRight: isMobile ? 'none' : `1px solid ${cores.cardBorda}`, display: 'grid', gap: 12, alignContent: 'start' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.07em', color: cores.suave, textTransform: 'uppercase' }}>O que faltava</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: cores.texto, marginTop: 3 }}>{it.descricao}</div>
                  <div style={{ fontSize: 12, color: cores.suave, marginTop: 2 }}>aberta por {it.aberta_por || '—'} em {fmtDataHora(it.aberta_em)}</div>
                </div>
                <div style={{ borderRadius: 12, padding: '10px 12px', background: neg ? hexA(cores.perigo, 0.07) : hexA(cores.ok, 0.07) }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.07em', color: neg ? cores.perigo : cores.ok, textTransform: 'uppercase' }}>{neg ? 'Não resolvido — você decide' : 'O que o acompanhamento fez'}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: cores.texto, marginTop: 3 }}>{rotResolucao(it.categoria, it.resolucao)}</div>
                  {it.resolucao_texto && <div style={{ fontSize: 13, color: cores.texto, marginTop: 3 }}>{it.resolucao_texto}</div>}
                  <div style={{ fontSize: 12, color: cores.suave, marginTop: 4 }}>{it.resolvida_por || '—'} · {fmtDataHora(it.resolvida_em)}</div>
                  {anexos.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                      {anexos.map((u, i) => <button key={i} onClick={() => abrirArquivo(u)} style={{ ...btn('#0891b2', false), padding: '5px 10px', fontSize: 12 }}>📎 Anexo {i + 1}</button>)}
                    </div>
                  )}
                </div>
                {it.exigencia_texto && it.etapa === 'exigencia' && <div style={{ fontSize: 12.5, color: '#9a3412' }}>Exigência: {it.exigencia_texto} · prazo <b>{fmtData(it.exigencia_prazo)}</b></div>}
              </div>
              <div style={{ padding: 16, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.07em', color: cores.roxo, textTransform: 'uppercase' }}>✦ Defesa pronta da I.A</span>
                  {it.ia_defesa && (
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                      <button onClick={async () => mostrar((await copiarTexto(it.ia_defesa)) ? 'Defesa copiada' : 'Não consegui copiar')} style={{ ...btn(cores.roxo, false), padding: '5px 10px', fontSize: 12 }}>⧉ Copiar</button>
                      <button onClick={() => gerarDefesa(it)} disabled={st === 'gerando'} style={{ ...btn('#475569', false), padding: '5px 10px', fontSize: 12 }}>⟳ Refazer</button>
                    </span>
                  )}
                </div>
                {it.ia_defesa ? <div style={{ maxHeight: 340, overflowY: 'auto' }}><Markdown texto={it.ia_defesa} /></div>
                  : st === 'gerando' ? <div style={{ fontSize: 13, color: cores.suave }}>A I.A está montando a defesa…</div>
                  : st ? <div style={{ fontSize: 13, color: cores.perigo }}>{st} <button onClick={() => gerarDefesa(it)} style={{ ...btn('#475569', false), padding: '4px 9px', fontSize: 12, marginLeft: 6 }}>Tentar de novo</button></div>
                  : <div style={{ fontSize: 13, color: cores.suave }}>Na fila para gerar…</div>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )

  // ------------------------------------------------------------ render
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 1600, margin: '0 auto' }}>
      <style>{`
        .kr-cartao:hover { box-shadow: ${sombras.cardHover} !important; transform: translateY(-1px); }
        .kr-linha:hover { background: #f8fafc; }
        .kr-aba::-webkit-scrollbar { height: 0 }
      `}</style>
      {toast}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ width: 48, height: 48, borderRadius: 15, background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', display: 'grid', placeItems: 'center', fontSize: 22, boxShadow: sombras.glowAzul }}>📑</div>
        <div style={{ flex: '1 1 180px', minWidth: 0 }}>
          <div style={{ fontSize: isMobile ? 21 : 25, fontWeight: 800, color: cores.texto, letterSpacing: '-.01em' }}>Protocolo INSS</div>
          <div style={{ fontSize: 13, color: cores.suave }}>Salário-maternidade · {lista ? `${lista.length} caso${lista.length === 1 ? '' : 's'} no setor` : 'carregando…'}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {atualizadoEm && !isMobile && <span style={{ fontSize: 12, color: cores.suave }}>atualizado {atualizadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button onClick={tudoMudou} style={btn('#475569', false)}>{carregando ? '…' : '⟳'} Atualizar</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(6, minmax(0,1fr))', gap: 12 }}>
        {kpi({ rot: 'Chegou hoje', n: conta.hoje, cor: cores.azul, alvo: 'hoje', icone: '📥', sub: 'contratos assinados' })}
        {kpi({ rot: 'Fila de protocolo', n: conta.fila, cor: '#2563eb', alvo: 'fila', icone: '🗂️', sub: conta.atrasados ? `${conta.atrasados} há mais de ${LIMITE_AGUARDANDO} dias` : 'em dia' })}
        {kpi({ rot: 'Aguardando INSS', n: conta.protocolados, cor: '#8b5cf6', alvo: 'protocolados', icone: '📨', sub: 'protocolados e recursos' })}
        {kpi({ rot: 'Pendências', n: conta.pendencias, cor: '#ea580c', alvo: 'pendencias', icone: '⚠️', sub: 'docs e exigências' })}
        {kpi({ rot: 'Deferidos', n: conta.deferidos, cor: cores.ok, alvo: 'deferidos', icone: '✅', sub: `${conta.indeferidos} indeferidos` })}
        {kpi({ rot: 'Alertas', n: alertas.length, cor: cores.perigo, alvo: 'acompanhamento', icone: '🔴', sub: `${pend.length} pendência(s) aberta(s)` })}
      </div>

      <div className="kr-aba" style={{ display: 'flex', gap: 6, overflowX: 'auto', background: '#fff', border: `1px solid ${cores.cardBorda}`, borderRadius: 14, padding: 5, boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
        {ABAS.map(([k, r]) => {
          const n = k === 'hoje' ? conta.hoje : k === 'fila' ? conta.fila : k === 'protocolados' ? conta.protocolados : k === 'pendencias' ? conta.pendencias : k === 'deferidos' ? conta.deferidos : k === 'indeferidos' ? conta.indeferidos : k === 'refazer' ? refazer.length : k === 'acompanhamento' ? alertas.length + pend.length : null
          const on = aba === k
          return (
            <button key={k} onClick={() => setAba(k)} style={{
              padding: '9px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
              fontSize: 13, fontWeight: on ? 800 : 600, color: on ? '#fff' : cores.texto,
              background: on ? 'linear-gradient(135deg,#3b82f6,#8b5cf6)' : 'transparent', boxShadow: on ? sombras.glowAzul : 'none',
            }}>{r}{n ? <span style={{ marginLeft: 6, fontSize: 11.5, opacity: on ? 0.95 : 0.6, fontWeight: 800 }}>{n}</span> : null}</button>
          )
        })}
      </div>

      {!['acompanhamento', 'painel', 'refazer'].includes(aba) && filtros}
      {aba !== 'acompanhamento' && aba !== 'painel' && alertas.length > 0 && aba === 'quadro' && (
        <div onClick={() => setAba('acompanhamento')} style={{ ...card, padding: '10px 14px', background: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center' }}>
          🔴 {alertas.length} alerta{alertas.length === 1 ? '' : 's'}: {alertas.slice(0, 2).map(a => `${a.nome} — ${a.texto}`).join(' · ')}{alertas.length > 2 ? ' …' : ''} <span style={{ marginLeft: 'auto' }}>ver →</span>
        </div>
      )}

      {lista === null ? (
        <div style={{ ...card, padding: 40, textAlign: 'center', color: cores.suave }}>Carregando casos…</div>
      ) : aba === 'quadro' ? quadro
        : aba === 'refazer' ? refazerView
        : aba === 'acompanhamento' ? acompanhamento
        : aba === 'painel' ? painelView
        : listaView}

      {cpfAberto && (
        <div onClick={() => setCpfAberto(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.42)', backdropFilter: 'blur(2px)', zIndex: 1000 }}>
          <div onClick={e => e.stopPropagation()} style={{
            position: 'absolute', top: 0, right: 0, bottom: 0, width: isMobile ? '100vw' : 'min(1240px, 94vw)', background: cores.fundo,
            boxShadow: '-24px 0 60px rgba(15,23,42,.25)', overflowY: 'auto', padding: isMobile ? 12 : 22, boxSizing: 'border-box',
            animation: 'krGaveta .22s ease-out',
          }}>
            <style>{'@keyframes krGaveta{from{transform:translateX(40px);opacity:.4}to{transform:none;opacity:1}}'}</style>
            <FichaProtocolo key={cpfAberto} cpf={cpfAberto} modo="gaveta" onFechar={() => setCpfAberto(null)} onMudou={tudoMudou} />
          </div>
        </div>
      )}

      {modal && (
        <ModalAcao caso={modal.caso} acao={modal.acao} inicial={modal.inicial} onClose={() => setModal(null)}
          onFeito={() => { setModal(null); mostrar('Salvo'); tudoMudou() }} />
      )}

      {importAberto && <ImportarModal onClose={() => setImportAberto(false)} onFeito={() => { setImportAberto(false); mostrar('Importação concluída'); tudoMudou() }} />}
    </div>
  )
}

function somaHoje(n) {
  const d = new Date(hojeISO() + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10)
}

// ================================================================ importacao
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
function mapearColuna(h) {
  const n = norm(h)
  if (n === 'cpf' || n.startsWith('cpf ')) return 'cpf'
  if (/^(nome|cliente|nome da cliente|nome cliente|mae|nome da mae)$/.test(n)) return 'nome'
  if (/data.*resultado|data.*decisao/.test(n)) return 'data_resultado'
  if (/data.*protocolo|data.*entrada/.test(n)) return 'data_protocolo'
  if (/protocolo|^numero|^n /.test(n)) return 'numero_protocolo'
  if (/situacao|status|resultado/.test(n)) return 'situacao'
  if (/motivo|observ/.test(n)) return 'motivo'
  return null
}
function parseCSV(txt) {
  const linhas = String(txt).replace(/\r/g, '').split('\n').filter(l => l.trim())
  if (!linhas.length) return []
  const sep = linhas[0].includes('\t') ? '\t' : (linhas[0].split(';').length > linhas[0].split(',').length ? ';' : ',')
  const cel = (l) => {
    const out = []; let cur = ''; let q = false
    for (let i = 0; i < l.length; i++) {
      const ch = l[i]
      if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++ } else q = !q }
      else if (ch === sep && !q) { out.push(cur); cur = '' }
      else cur += ch
    }
    out.push(cur); return out.map(x => x.trim())
  }
  const cab = cel(linhas[0])
  return linhas.slice(1).map(l => { const c = cel(l); const o = {}; cab.forEach((h, i) => { o[h] = c[i] ?? '' }); return o })
}
function carregarXLSX() {
  return new Promise((ok, erro) => {
    if (window.XLSX) return ok(window.XLSX)
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.onload = () => ok(window.XLSX); s.onerror = () => erro(new Error('não carregou o leitor de planilha'))
    document.head.appendChild(s)
  })
}

function ImportarModal({ onClose, onFeito }) {
  const [linhas, setLinhas] = useState([])
  const [colado, setColado] = useState('')
  const [previa, setPrevia] = useState(null)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const normalizar = (objs) => objs.map(o => {
    const r = {}
    Object.entries(o).forEach(([h, v]) => { const k = mapearColuna(h); if (k && !r[k]) r[k] = String(v ?? '').trim() })
    return r
  }).filter(r => Object.values(r).some(Boolean))

  async function lerArquivo(f) {
    setErro(''); setPrevia(null)
    try {
      if (/\.(xlsx|xls)$/i.test(f.name)) {
        const X = await carregarXLSX()
        const wb = X.read(await f.arrayBuffer(), { type: 'array', cellDates: false })
        const ws = wb.Sheets[wb.SheetNames[0]]
        setLinhas(normalizar(X.utils.sheet_to_json(ws, { raw: false, defval: '', dateNF: 'dd/mm/yyyy' })))
      } else {
        setLinhas(normalizar(parseCSV(await f.text())))
      }
    } catch (e) { setErro(String(e.message || e)) }
  }

  async function verPrevia() {
    const ls = linhas.length ? linhas : normalizar(parseCSV(colado))
    if (!ls.length) { setErro('Nenhuma linha reconhecida. A primeira linha precisa ter os títulos das colunas.'); return }
    setLinhas(ls); setOcupado(true); setErro('')
    const { data, error } = await supabase.rpc('protocolo_importar', { p_linhas: ls, p_gravar: false })
    setOcupado(false)
    if (error || !data?.ok) { setErro(error?.message || data?.erro || 'erro'); return }
    setPrevia(data)
  }

  async function gravar() {
    setOcupado(true)
    const { data, error } = await supabase.rpc('protocolo_importar', { p_linhas: linhas, p_gravar: true })
    setOcupado(false)
    if (error || !data?.ok) { setErro(error?.message || data?.erro || 'erro'); return }
    onFeito(data)
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', backdropFilter: 'blur(3px)', zIndex: 2000, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...card, width: '100%', maxWidth: 760, maxHeight: '90vh', overflow: 'auto', padding: 22, borderRadius: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>⬆ Importar protocolos antigos</div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: cores.suave }}>✕</button>
        </div>
        <div style={{ fontSize: 13, color: cores.suave, margin: '8px 0 14px', lineHeight: 1.5 }}>
          Planilha <b>CSV ou XLSX</b> (ou copie as células do Excel/Sheets e cole abaixo) com as colunas: <b>CPF, nome, número do protocolo, data do protocolo, situação</b> (protocolado / deferido / indeferido / exigência), <b>motivo, data do resultado</b>. Antes de gravar você vê a prévia.
        </div>
        <input type="file" accept=".csv,.xlsx,.xls,.tsv,.txt" onChange={e => e.target.files?.[0] && lerArquivo(e.target.files[0])} />
        <textarea value={colado} onChange={e => { setColado(e.target.value); setLinhas([]); setPrevia(null) }} rows={5} placeholder="…ou cole aqui as células (com a linha de títulos)"
          style={{ width: '100%', marginTop: 10, padding: 10, borderRadius: 10, boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13 }} />
        {linhas.length > 0 && !previa && <div style={{ fontSize: 13, marginTop: 8 }}>{linhas.length} linha(s) lida(s).</div>}
        {erro && <div style={{ color: cores.perigo, fontSize: 13, marginTop: 8, fontWeight: 600 }}>{erro}</div>}
        {previa && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Chip cor={cores.azul} forte>{previa.encontrados} já no setor (atualizar)</Chip>
              <Chip cor={cores.ok} forte>{previa.criar} novos (criar)</Chip>
              <Chip cor={cores.perigo} forte>{previa.erros.length} com erro</Chip>
            </div>
            {previa.erros.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: cores.perigo }}>
                {previa.erros.map((e, i) => <div key={i}>Linha {e.linha}: {e.erro} {e.cpf ? `(${e.cpf})` : ''}</div>)}
              </div>
            )}
            <div style={{ marginTop: 10, maxHeight: 240, overflowY: 'auto', border: `1px solid ${cores.cardBorda}`, borderRadius: 10 }}>
              {previa.itens.map(it => (
                <div key={it.linha} style={{ display: 'flex', gap: 10, padding: '6px 10px', fontSize: 12.5, borderBottom: `1px solid ${cores.cardBorda}` }}>
                  <span style={{ color: cores.suave, width: 34 }}>{it.linha}</span>
                  <span style={{ flex: 1 }}>{it.nome || fmtCpf(it.cpf)}</span>
                  <span>{etapaInfo(it.situacao).curto}</span>
                  <b style={{ color: it.acao === 'criar' ? cores.ok : cores.azul }}>{it.acao}</b>
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={btn('#475569', false)}>Cancelar</button>
          {!previa ? (
            <button disabled={ocupado || (!linhas.length && !colado.trim())} onClick={verPrevia} style={{ ...btn(cores.azul), opacity: ocupado || (!linhas.length && !colado.trim()) ? 0.5 : 1 }}>{ocupado ? 'Lendo…' : 'Ver prévia'}</button>
          ) : (
            <button disabled={ocupado || previa.itens.length === 0} onClick={gravar} style={{ ...btn('#0f766e'), opacity: ocupado || previa.itens.length === 0 ? 0.5 : 1 }}>{ocupado ? 'Gravando…' : `Gravar ${previa.itens.length} linha(s)`}</button>
          )}
        </div>
      </div>
    </div>
  )
}
