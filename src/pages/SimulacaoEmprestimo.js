import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const s = {
  title: { fontSize: 20, fontWeight: 500, color: '#111', marginBottom: 4, letterSpacing: '-0.3px' },
  subtitle: { fontSize: 13, color: '#888', marginBottom: 16 },
  robo: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, marginBottom: 16, flexWrap: 'wrap' },
  roboOk: { background: '#EAF3DE', border: '0.5px solid #3B6D1130' },
  roboAlerta: { background: '#FCEBEB', border: '0.5px solid #A32D2D40' },
  luz: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  painel: { background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: 16 },
  filtros: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 },
  fBtn: { padding: '5px 12px', fontSize: 12, fontWeight: 500, borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', background: '#fff', color: '#666', cursor: 'pointer' },
  fBtnOn: { background: '#185FA5', color: '#fff', borderColor: '#185FA5' },
  dateInput: { padding: '4px 8px', fontSize: 12, borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', color: '#333' },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 },
  kpi: { border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '10px 12px' },
  kpiTop: { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 500, marginBottom: 6 },
  kpiNum: { fontSize: 24, fontWeight: 500, lineHeight: 1 },
  kpiSub: { fontSize: 11, color: '#888', marginTop: 4 },
  tabs: { display: 'flex', gap: 8, marginBottom: 16, borderBottom: '0.5px solid rgba(0,0,0,0.1)', flexWrap: 'wrap' },
  tab: { padding: '10px 14px', fontSize: 13, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', color: '#888', borderBottom: '2px solid transparent', marginBottom: -1 },
  tabActive: { color: '#185FA5', borderBottomColor: '#185FA5' },
  card: { background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: 10 },
  cardVencido: { border: '1px solid #A32D2D', background: '#FEF6F6' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap', gap: 8 },
  nome: { fontSize: 15, fontWeight: 500, color: '#111' },
  meta: { fontSize: 12, color: '#888', marginTop: 2 },
  valorBig: { fontSize: 22, fontWeight: 600, color: '#3B6D11', lineHeight: 1 },
  donoTag: { fontSize: 12, marginBottom: 8, padding: '4px 8px', borderRadius: 6, display: 'inline-block' },
  donoOk: { color: '#25683b', background: '#EAF3DE' },
  donoVencido: { color: '#A32D2D', background: '#FCEBEB', fontWeight: 500 },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  btnVender: { flex: 1, minWidth: 140, padding: '10px', background: '#3B6D11', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnWhats: { padding: '10px 14px', background: '#EAF3DE', color: '#25683b', border: '0.5px solid #3B6D1140', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 },
  btnSec: { padding: '9px 12px', background: '#fff', color: '#888', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  desfechoBox: { background: '#F8FAFC', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: 12, marginTop: 10 },
  desfechoTitulo: { fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 10 },
  btnDesVendeu: { padding: '10px', background: '#3B6D11', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnDesNao: { padding: '10px', background: '#fff', color: '#A32D2D', border: '0.5px solid #A32D2D40', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  input: { width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', boxSizing: 'border-box', marginBottom: 8 },
  empty: { textAlign: 'center', padding: '3rem 1rem', color: '#aaa', fontSize: 13 },
  loading: { textAlign: 'center', padding: '3rem', color: '#888', fontSize: 14 },
  filaHeader: { fontSize: 12, color: '#666', background: '#F4F8FC', border: '0.5px solid #185FA520', borderRadius: 8, padding: '8px 12px', marginBottom: 12 },
  distribBox: { background: '#F4F8FC', border: '0.5px solid #185FA525', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: 16 },
  distribTitulo: { fontSize: 13, fontWeight: 600, color: '#185FA5', marginBottom: 10 },
  distribRow: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  distribCampo: { display: 'flex', flexDirection: 'column', gap: 4 },
  distribLabel: { fontSize: 11, color: '#666' },
  distribInput: { padding: '9px 10px', fontSize: 14, borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', width: 90 },
  distribSelect: { padding: '9px 10px', fontSize: 13, borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', minWidth: 180 },
  btnEnviar: { padding: '10px 18px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  diaChip: { padding: '5px 12px', fontSize: 12, fontWeight: 500, borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', background: '#fff', color: '#666', cursor: 'pointer' },
  diaChipOn: { background: '#185FA5', color: '#fff', borderColor: '#185FA5' },
}

const MOTIVOS_NAO_VENDA = ['Cliente desistiu', 'Sem interesse', 'Valor baixo', 'Já tem empréstimo', 'Não atende', 'Dados errados', 'Outro']

function fmtCpf(cpf) {
  const d = (cpf || '').replace(/\D/g, '')
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : cpf
}
function fmtBRL(v) {
  if (v == null) return 'R$ 0'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function fmtData(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
function fmtDiaLabel(diaStr) {
  const [y, m, d] = diaStr.split('-')
  return `${d}/${m}`
}
function rotuloDia(diaStr) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const ontem = new Date(hoje); ontem.setDate(ontem.getDate() - 1)
  const [y, m, d] = diaStr.split('-')
  const data = new Date(Number(y), Number(m) - 1, Number(d))
  if (data.getTime() === hoje.getTime()) return 'Hoje'
  if (data.getTime() === ontem.getTime()) return 'Ontem'
  return `${d}/${m}`
}
function tempoDesde(iso) {
  if (!iso) return ''
  const seg = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seg < 60) return `há ${seg}s`
  const min = Math.floor(seg / 60)
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}
function soDigitos(t) { return (t || '').replace(/\D/g, '') }

export default function SimulacaoEmprestimo() {
  const { profile } = useAuth()
  const ehAdmin = profile?.role === 'admin'

  const [aba, setAba] = useState(ehAdmin ? 'pool' : 'meus')
  const [itens, setItens] = useState([])
  const [nomesProfiles, setNomesProfiles] = useState({})
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(null)
  const [periodo, setPeriodo] = useState('mes')
  const [dtIni, setDtIni] = useState('')
  const [dtFim, setDtFim] = useState('')
  const [dash, setDash] = useState(null)
  const [saude, setSaude] = useState(null)
  const [desfechoAberto, setDesfechoAberto] = useState(null)
  const [valorVenda, setValorVenda] = useState('')
  const [motivoNao, setMotivoNao] = useState('')
  // distribuicao
  const [vendedores, setVendedores] = useState([])
  const [distVendedor, setDistVendedor] = useState('')
  const [distQtd, setDistQtd] = useState('')
  const [distribuindo, setDistribuindo] = useState(false)
  const [poolPorDia, setPoolPorDia] = useState([])
  const [diaSelecionado, setDiaSelecionado] = useState('') // '' = todos os dias

  const ABAS = ehAdmin
    ? [['pool', 'Pool (distribuir)'], ['meus', 'Meus leads'], ['vendido', 'Vendidos'], ['nao_vendido', 'Não fecharam'], ['sem_contato', 'Sem contato'], ['negado', 'Negados']]
    : [['meus', 'Meus leads'], ['vendido', 'Vendidos'], ['nao_vendido', 'Não fecharam'], ['sem_contato', 'Sem contato']]

  const poolTotal = poolPorDia.reduce((acc, d) => acc + Number(d.qtd), 0)
  const poolDoDia = diaSelecionado ? Number(poolPorDia.find(d => d.dia === diaSelecionado)?.qtd || 0) : poolTotal

  // Aba "Meus leads": resumo por DIA DE ENVIO (atribuido_em). Recebidos e pendentes de cada dia.
  const resumoPorDiaEnvio = (() => {
    if (aba !== 'meus') return []
    const mapa = {}
    for (const it of itens) {
      const dia = (it.atribuido_em || '').slice(0, 10)
      if (!dia) continue
      if (!mapa[dia]) mapa[dia] = { dia, recebidos: 0, pendentes: 0 }
      mapa[dia].recebidos++
      if (it.status === 'pre_aprovado') mapa[dia].pendentes++
    }
    return Object.values(mapa).sort((a, b) => b.dia.localeCompare(a.dia))
  })()

  const carregar = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('simulacoes_emprestimo').select('*')
    if (aba === 'pool') {
      q = q.eq('status', 'pre_aprovado').is('atribuido_a', null).order('decidido_em', { ascending: true, nullsFirst: false })
    } else if (aba === 'meus') {
      q = q.eq('status', 'pre_aprovado').eq('atribuido_a', profile?.id).order('prazo_resolucao', { ascending: true, nullsFirst: false })
    } else if (aba === 'vendido') {
      q = q.eq('status', 'vendido').order('vendido_em', { ascending: false, nullsFirst: false })
      if (!ehAdmin) q = q.eq('atribuido_a', profile?.id)
    } else {
      q = q.eq('status', aba).order('atualizado_em', { ascending: false })
      if (!ehAdmin && (aba === 'nao_vendido' || aba === 'sem_contato')) q = q.eq('atribuido_a', profile?.id)
    }
    const { data } = await q.limit(400)
    let lista = data || []
    // filtro por dia no pool (client-side, sobre o dia de simulacao)
    if (aba === 'pool' && diaSelecionado) {
      lista = lista.filter(i => (i.decidido_em || i.criado_em || '').slice(0, 10) === diaSelecionado)
    }
    const ids = [...new Set(lista.map(i => i.atribuido_a).filter(Boolean))]
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, nome').in('id', ids)
      const mapa = {}; (profs || []).forEach(p => { mapa[p.id] = p.nome })
      setNomesProfiles(mapa)
    }
    setItens(lista)
    setLoading(false)
  }, [aba, profile, ehAdmin, diaSelecionado])

  const carregarDash = useCallback(async () => {
    if (!ehAdmin) return
    const fim = new Date(); let ini = new Date()
    if (periodo === 'dia') ini.setHours(0, 0, 0, 0)
    else if (periodo === 'semana') ini.setDate(ini.getDate() - 7)
    else if (periodo === 'mes') ini.setMonth(ini.getMonth() - 1)
    else if (periodo === 'custom') { if (dtIni) ini = new Date(dtIni); if (dtFim) fim.setTime(new Date(dtFim).getTime()) }
    const { data } = await supabase.rpc('emprestimo_dashboard', { p_inicio: ini.toISOString(), p_fim: fim.toISOString() })
    setDash(data || null)
  }, [periodo, dtIni, dtFim, ehAdmin])

  const carregarPool = useCallback(async () => {
    if (!ehAdmin) return
    const { data } = await supabase.rpc('emprestimo_pool_por_dia')
    setPoolPorDia(data || [])
  }, [ehAdmin])

  const carregarSaude = useCallback(async () => {
    const { data: log } = await supabase.from('crefisa_log').select('criado_em').order('criado_em', { ascending: false }).limit(1)
    const ultima = log?.[0]?.criado_em || null
    const minSemSim = ultima ? Math.floor((Date.now() - new Date(ultima).getTime()) / 60000) : 999
    setSaude({ ultima, parado: minSemSim >= 10 })
  }, [])

  const carregarVendedores = useCallback(async () => {
    if (!ehAdmin) return
    // vendedores de emprestimo por role + Nadia Cajado e Ju Ferreira (B2C que tambem vendem emprestimo, por ID)
    const IDS_EMPRESTIMO_EXTRA = ['a3e94f8b-7e64-479b-9d72-1414afb83d1c', '7ad37a1d-e5be-438c-9afd-982646d507d4']
    const { data } = await supabase.from('profiles').select('id, nome, role').eq('ativo', true)
      .or(`role.in.(vendedor,simulador_emprestimo,coordenador_b2c),id.in.(${IDS_EMPRESTIMO_EXTRA.join(',')})`)
      .order('nome')
    setVendedores(data || [])
  }, [ehAdmin])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { carregarDash() }, [carregarDash])
  useEffect(() => { carregarPool() }, [carregarPool])
  useEffect(() => { carregarVendedores() }, [carregarVendedores])
  useEffect(() => { carregarSaude(); const id = setInterval(carregarSaude, 30000); return () => clearInterval(id) }, [carregarSaude])

  async function distribuir() {
    if (!distVendedor) { alert('Escolha o vendedor.'); return }
    const qtd = parseInt(distQtd, 10)
    if (!qtd || qtd < 1) { alert('Digite uma quantidade válida.'); return }
    setDistribuindo(true)
    const params = { p_vendedor_id: distVendedor, p_quantidade: qtd, p_gestor_id: profile?.id }
    if (diaSelecionado) params.p_dia = diaSelecionado
    const { data, error } = await supabase.rpc('emprestimo_distribuir_leads', params)
    setDistribuindo(false)
    if (error) { alert('Erro: ' + error.message); return }
    if (!data?.ok) { alert(data?.erro || 'Erro ao distribuir'); return }
    const nome = vendedores.find(v => v.id === distVendedor)?.nome || 'vendedor'
    const doDia = diaSelecionado ? ` do dia ${fmtDiaLabel(diaSelecionado)}` : ''
    alert(`✅ ${data.distribuidos} leads${doDia} enviados para ${nome}` + (data.faltou > 0 ? ` (faltaram ${data.faltou})` : ''))
    setDistQtd('')
    carregar(); carregarPool(); carregarDash()
  }

  function abrirDesfecho(id) { setDesfechoAberto(id); setValorVenda(''); setMotivoNao('') }
  async function marcarVendido(item) {
    const v = Number(String(valorVenda).replace(/[^\d]/g, ''))
    if (!v) { alert('Informe o valor vendido.'); return }
    setSalvando(item.id)
    await supabase.from('simulacoes_emprestimo').update({ status: 'vendido', valor_vendido: v }).eq('id', item.id)
    setSalvando(null); setDesfechoAberto(null); carregar(); carregarDash()
  }
  async function marcarNaoVendido(item) {
    if (!motivoNao) { alert('Escolha o motivo.'); return }
    setSalvando(item.id)
    await supabase.from('simulacoes_emprestimo').update({ status: 'nao_vendido', motivo_nao_venda: motivoNao }).eq('id', item.id)
    setSalvando(null); setDesfechoAberto(null); carregar(); carregarDash()
  }
  async function marcarSemContato(item) {
    setSalvando(item.id)
    await supabase.from('simulacoes_emprestimo').update({ status: 'sem_contato' }).eq('id', item.id)
    setSalvando(null); setDesfechoAberto(null); carregar(); carregarDash()
  }

  const t = dash?.totais

  return (
    <div>
      <div style={s.title}>💰 Empréstimo Crefisa {ehAdmin ? '— Distribuição' : ''}</div>
      <div style={s.subtitle}>
        {ehAdmin
          ? 'Distribua os pré-aprovados para os vendedores. Filtre por dia e envie a quantidade que quiser.'
          : 'Estes são os leads enviados pra você. Contate, feche e registre o desfecho.'}
      </div>

      {saude && ehAdmin && (
        <div style={{ ...s.robo, ...(saude.parado ? s.roboAlerta : s.roboOk) }}>
          <span style={{ ...s.luz, background: saude.parado ? '#A32D2D' : '#3B6D11' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: saude.parado ? '#A32D2D' : '#25683b' }}>
            {saude.parado ? '⚠️ Robô parado — verificar' : '🤖 Robô ativo'}
          </span>
          <span style={{ fontSize: 12, color: '#666' }}>última simulação {tempoDesde(saude.ultima)}</span>
          <span style={{ fontSize: 12, color: '#666', marginLeft: 'auto' }}>pool total livre: <strong>{poolTotal}</strong></span>
        </div>
      )}

      {/* PAINEL DE DISTRIBUIÇÃO — só admin */}
      {ehAdmin && (
        <div style={s.distribBox}>
          <div style={s.distribTitulo}>📤 Distribuir leads {diaSelecionado ? `do dia ${fmtDiaLabel(diaSelecionado)}` : '(todos os dias)'} — {poolDoDia} disponíveis</div>

          {/* Filtro por dia */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            <button style={{ ...s.diaChip, ...(diaSelecionado === '' ? s.diaChipOn : {}) }} onClick={() => setDiaSelecionado('')}>
              Todos ({poolTotal})
            </button>
            {poolPorDia.map(d => (
              <button key={d.dia} style={{ ...s.diaChip, ...(diaSelecionado === d.dia ? s.diaChipOn : {}) }} onClick={() => setDiaSelecionado(d.dia)}>
                {fmtDiaLabel(d.dia)} ({d.qtd})
              </button>
            ))}
          </div>

          <div style={s.distribRow}>
            <div style={s.distribCampo}>
              <label style={s.distribLabel}>Quantidade</label>
              <input style={s.distribInput} type="number" min="1" placeholder="Ex: 50" value={distQtd} onChange={e => setDistQtd(e.target.value)} />
            </div>
            <div style={s.distribCampo}>
              <label style={s.distribLabel}>Para o vendedor</label>
              <select style={s.distribSelect} value={distVendedor} onChange={e => setDistVendedor(e.target.value)}>
                <option value="">Escolha...</option>
                {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
              </select>
            </div>
            <button style={s.btnEnviar} onClick={distribuir} disabled={distribuindo}>
              {distribuindo ? 'Enviando...' : 'Enviar leads'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
            Pega os mais antigos {diaSelecionado ? `do dia ${fmtDiaLabel(diaSelecionado)}` : 'do pool'}. Depois de enviado, o lead é do vendedor até ele registrar o desfecho.
          </div>
        </div>
      )}

      {/* DASHBOARD — só admin */}
      {ehAdmin && (
        <div style={s.painel}>
          <div style={s.filtros}>
            {[['dia', 'Hoje'], ['semana', 'Semana'], ['mes', 'Mês'], ['custom', 'Personalizado']].map(([k, label]) => (
              <button key={k} onClick={() => setPeriodo(k)} style={{ ...s.fBtn, ...(periodo === k ? s.fBtnOn : {}) }}>{label}</button>
            ))}
            {periodo === 'custom' && (
              <>
                <input type="date" style={s.dateInput} value={dtIni} onChange={e => setDtIni(e.target.value)} />
                <span style={{ fontSize: 12, color: '#888' }}>até</span>
                <input type="date" style={s.dateInput} value={dtFim} onChange={e => setDtFim(e.target.value)} />
              </>
            )}
          </div>
          {t && (
            <div style={s.kpis}>
              <div style={{ ...s.kpi, background: '#EAF3DE', borderColor: '#3B6D1130' }}>
                <div style={{ ...s.kpiTop, color: '#3B6D11' }}>Vendido no período</div>
                <div style={{ ...s.kpiNum, color: '#3B6D11', fontSize: 20 }}>{fmtBRL(t.valor_vendido)}</div>
                <div style={s.kpiSub}>{t.vendidos} vendas · ticket {fmtBRL(t.ticket_medio)}</div>
              </div>
              <div style={{ ...s.kpi, background: '#F4F8FC', borderColor: '#185FA520' }}>
                <div style={{ ...s.kpiTop, color: '#185FA5' }}>Conversão</div>
                <div style={{ ...s.kpiNum, color: '#185FA5' }}>{t.taxa_conversao}%</div>
                <div style={s.kpiSub}>{t.vendidos} de {t.vendidos + t.nao_vendidos + t.sem_contato} resolvidos</div>
              </div>
              <div style={{ ...s.kpi, background: '#FFF8E7', borderColor: '#85500B30' }}>
                <div style={{ ...s.kpiTop, color: '#854F0B' }}>Distribuídos sem desfecho</div>
                <div style={{ ...s.kpiNum, color: '#854F0B' }}>{t.assumidos_sem_desfecho}</div>
                <div style={s.kpiSub}>{poolTotal} ainda no pool</div>
              </div>
              <div style={{ ...s.kpi, background: t.vencidos_cobranca > 0 ? '#FCEBEB' : '#F7F7F7', borderColor: t.vencidos_cobranca > 0 ? '#A32D2D30' : 'rgba(0,0,0,0.08)' }}>
                <div style={{ ...s.kpiTop, color: t.vencidos_cobranca > 0 ? '#A32D2D' : '#888' }}>⏰ Vencidos (cobrar)</div>
                <div style={{ ...s.kpiNum, color: t.vencidos_cobranca > 0 ? '#A32D2D' : '#888' }}>{t.vencidos_cobranca}</div>
                <div style={s.kpiSub}>passaram de 24h sem resolver</div>
              </div>
            </div>
          )}
          {dash?.ranking?.length > 0 && (
            <div style={{ marginTop: 14, borderTop: '0.5px solid rgba(0,0,0,0.08)', paddingTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 8 }}>Ranking por vendedor</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: '#888', textAlign: 'left' }}>
                      <th style={{ padding: '4px 8px' }}>Vendedor</th><th style={{ padding: '4px 8px' }}>Recebidos</th>
                      <th style={{ padding: '4px 8px' }}>Vendas</th><th style={{ padding: '4px 8px' }}>Conversão</th>
                      <th style={{ padding: '4px 8px' }}>Valor</th><th style={{ padding: '4px 8px' }}>Em aberto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dash.ranking.map(r => (
                      <tr key={r.vendedor_id} style={{ borderTop: '0.5px solid rgba(0,0,0,0.05)' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 500 }}>{r.vendedor}</td>
                        <td style={{ padding: '6px 8px' }}>{r.atendidos}</td>
                        <td style={{ padding: '6px 8px', color: '#3B6D11', fontWeight: 500 }}>{r.vendidos}</td>
                        <td style={{ padding: '6px 8px' }}>{r.conversao}%</td>
                        <td style={{ padding: '6px 8px', color: '#3B6D11' }}>{fmtBRL(r.valor_vendido)}</td>
                        <td style={{ padding: '6px 8px', color: r.em_aberto > 0 ? '#854F0B' : '#888' }}>{r.em_aberto}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={s.tabs}>
        {ABAS.map(([k, label]) => (
          <button key={k} onClick={() => { setAba(k); setDesfechoAberto(null) }} style={{ ...s.tab, ...(aba === k ? s.tabActive : {}) }}>{label}</button>
        ))}
      </div>

      {aba === 'meus' && !ehAdmin && (
        <div style={s.filaHeader}>👤 Estes são os leads que a gestão enviou pra você. Contate e registre o desfecho de cada um.</div>
      )}
      {aba === 'meus' && resumoPorDiaEnvio.length > 0 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          {resumoPorDiaEnvio.map(g => (
            <div key={g.dia} style={{ background: rotuloDia(g.dia) === 'Hoje' ? '#EAF3DE' : '#fff', border: `0.5px solid ${rotuloDia(g.dia) === 'Hoje' ? '#3B6D1130' : 'rgba(0,0,0,0.1)'}`, borderRadius: 10, padding: '10px 14px', minWidth: 130 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: rotuloDia(g.dia) === 'Hoje' ? '#3B6D11' : '#555', marginBottom: 4 }}>
                📅 {rotuloDia(g.dia)}
              </div>
              <div style={{ fontSize: 22, fontWeight: 600, color: '#111', lineHeight: 1 }}>{g.pendentes}</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>a chamar · {g.recebidos} recebidos</div>
            </div>
          ))}
        </div>
      )}
      {aba === 'pool' && (
        <div style={s.filaHeader}>📥 Pré-aprovados aguardando distribuição{diaSelecionado ? ` — dia ${fmtDiaLabel(diaSelecionado)}` : ''}. Use o painel acima para enviar aos vendedores.</div>
      )}

      {loading ? (
        <div style={s.loading}>Carregando...</div>
      ) : itens.length === 0 ? (
        <div style={s.empty}>
          {aba === 'meus' ? 'Nenhum lead com você no momento.' : aba === 'pool' ? 'Pool vazio — nada a distribuir aqui.' : 'Nada aqui.'}
        </div>
      ) : (
        itens.map(item => {
          const meuLead = item.atribuido_a === profile?.id
          const tel = soDigitos(item.telefone)
          const vencido = aba === 'meus' && item.prazo_resolucao && new Date(item.prazo_resolucao) < new Date()
          return (
            <div key={item.id} style={{ ...s.card, ...(vencido ? s.cardVencido : {}) }}>
              <div style={s.cardHeader}>
                <div>
                  <div style={s.nome}>{item.nome || 'Sem nome'}</div>
                  <div style={s.meta}>CPF {fmtCpf(item.cpf)} · {item.telefone || 'sem telefone'} · {item.origem_ia || 'IA'}</div>
                  <div style={s.meta}>📅 {aba === 'meus' ? `Enviado ${fmtData(item.atribuido_em)}` : `Simulado em ${fmtData(item.decidido_em || item.criado_em)}`}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {aba === 'vendido'
                    ? <div style={s.valorBig}>{fmtBRL(item.valor_vendido)}</div>
                    : <div style={s.valorBig}>{fmtBRL(item.valor_simulado)}</div>}
                  {item.parcela_estimada && aba !== 'vendido' && <div style={s.meta}>parcela ~{fmtBRL(item.parcela_estimada)}</div>}
                </div>
              </div>

              {aba === 'pool' && <div style={{ fontSize: 12, color: '#888' }}>No pool · aguardando distribuição</div>}

              {aba === 'meus' && (
                <>
                  {ehAdmin && !meuLead && (
                    <div style={{ ...s.donoTag, ...(vencido ? s.donoVencido : s.donoOk) }}>
                      {vencido ? '⏰ ' : '✓ '}{nomesProfiles[item.atribuido_a] || 'Vendedor'} · enviado {tempoDesde(item.atribuido_em)}{vencido && ' · VENCIDO'}
                    </div>
                  )}
                  {meuLead && vencido && <div style={{ ...s.donoTag, ...s.donoVencido }}>⏰ Prazo vencido — resolva este lead</div>}
                  {desfechoAberto === item.id ? (
                    <div style={s.desfechoBox}>
                      <div style={s.desfechoTitulo}>Qual foi o desfecho?</div>
                      <input style={s.input} placeholder="Valor fechado (R$)" value={valorVenda} onChange={e => setValorVenda(e.target.value)} />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginBottom: 8 }}>
                        <button style={s.btnDesVendeu} onClick={() => marcarVendido(item)} disabled={salvando === item.id}>✅ Vendeu — registrar</button>
                      </div>
                      <select style={s.input} value={motivoNao} onChange={e => setMotivoNao(e.target.value)}>
                        <option value="">Se não fechou, escolha o motivo...</option>
                        {MOTIVOS_NAO_VENDA.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button style={s.btnDesNao} onClick={() => marcarNaoVendido(item)} disabled={salvando === item.id}>❌ Não fechou</button>
                        <button style={s.btnSec} onClick={() => marcarSemContato(item)} disabled={salvando === item.id}>Sem contato</button>
                        <button style={s.btnSec} onClick={() => setDesfechoAberto(null)}>Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div style={s.actions}>
                      <button style={s.btnVender} onClick={() => abrirDesfecho(item.id)}>✍️ Registrar desfecho</button>
                      {tel && <a style={s.btnWhats} href={`https://wa.me/55${tel}`} target="_blank" rel="noreferrer">💬 WhatsApp</a>}
                    </div>
                  )}
                </>
              )}

              {aba === 'vendido' && <div style={{ fontSize: 12, color: '#25683b' }}>✅ Vendido por {nomesProfiles[item.atribuido_a] || 'vendedor'}</div>}
              {aba === 'nao_vendido' && <div style={{ fontSize: 12, color: '#888' }}>{nomesProfiles[item.atribuido_a] || 'vendedor'} · {item.motivo_nao_venda || 'sem motivo'}</div>}
              {aba === 'negado' && item.motivo_negado && <div style={{ fontSize: 12, color: '#A32D2D', background: '#FCEBEB', borderRadius: 8, padding: '8px 10px' }}>Motivo: {item.motivo_negado}</div>}
            </div>
          )
        })
      )}
    </div>
  )
}
