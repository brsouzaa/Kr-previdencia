import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const s = {
  title: { fontSize: 20, fontWeight: 500, color: '#111', marginBottom: 4, letterSpacing: '-0.3px' },
  subtitle: { fontSize: 13, color: '#888', marginBottom: 24 },
  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 14, fontWeight: 500, color: '#111', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' },
  card: { background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: '1.25rem', marginBottom: 12 },
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  cardTitle: { fontSize: 15, fontWeight: 500, color: '#111' },
  badge: { fontSize: 11, color: '#888', background: '#f8f8f6', padding: '3px 8px', borderRadius: 6 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.4px' },
  input: { fontSize: 16, fontWeight: 500, color: '#111', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 8, padding: '8px 10px', outline: 'none', width: '100%', boxSizing: 'border-box', background: '#fff' },
  inputFocus: { borderColor: '#185FA5' },
  periodoSelector: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  periodoBtn: { fontSize: 13, padding: '8px 14px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', background: '#fff', color: '#555', cursor: 'pointer' },
  periodoBtnActive: { background: '#111', color: '#fff', borderColor: '#111' },
  saveBtn: { fontSize: 13, fontWeight: 500, padding: '10px 18px', borderRadius: 8, border: 'none', background: '#185FA5', color: '#fff', cursor: 'pointer', marginTop: 12 },
  saveBtnDisabled: { background: '#ccc', cursor: 'not-allowed' },
  feedback: { fontSize: 12, color: '#3B6D11', marginLeft: 12 },
  feedbackErr: { color: '#A32D2D' },
  divider: { height: 1, background: 'rgba(0,0,0,0.08)', margin: '24px 0' },
  hint: { fontSize: 11, color: '#aaa', marginTop: 4 },
  loading: { textAlign: 'center', padding: '3rem', color: '#888', fontSize: 14 },
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export default function Metas() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [feedbackErr, setFeedbackErr] = useState(false)

  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth() + 1)

  const [vendedoresB2B, setVendedoresB2B] = useState([])
  const [metaB2C, setMetaB2C] = useState({
    contratos_total: 0,
    taxa_assinatura_pct: 0,
  })
  const [metaB2B, setMetaB2B] = useState({
    contratos_maternidade: 0,
    contratos_bpc: 0,
    contratos_aux: 0,
  })

  useEffect(() => {
    fetchTudo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ano, mes])

  async function fetchTudo() {
    setLoading(true)
    setFeedback('')

    // Busca vendedoras B2B (role=vendedor)
    const { data: vends } = await supabase
      .from('profiles')
      .select('id, nome, email, ativo')
      .eq('role', 'vendedor')
      .eq('ativo', true)
      .order('nome', { ascending: true })

    setVendedoresB2B(vends || [])

    // Busca meta B2C do período
    const { data: b2c } = await supabase
      .from('metas')
      .select('*')
      .eq('escopo', 'b2c_geral')
      .eq('ano', ano)
      .eq('mes', mes)
      .is('vendedor_id', null)
      .maybeSingle()

    if (b2c) {
      setMetaB2C({
        contratos_total: b2c.contratos_total || 0,
        taxa_assinatura_pct: b2c.taxa_assinatura_pct || 0,
      })
    } else {
      setMetaB2C({ contratos_total: 0, taxa_assinatura_pct: 0 })
    }

    // Busca meta B2B (uma só - igual pra todas)
    // Como é igual pra todas, salvo apenas 1 linha com vendedor_id = null e escopo='b2b_individual'
    const { data: b2b } = await supabase
      .from('metas')
      .select('*')
      .eq('escopo', 'b2b_individual')
      .eq('ano', ano)
      .eq('mes', mes)
      .is('vendedor_id', null)
      .maybeSingle()

    if (b2b) {
      setMetaB2B({
        contratos_maternidade: b2b.contratos_maternidade || 0,
        contratos_bpc: b2b.contratos_bpc || 0,
        contratos_aux: b2b.contratos_aux || 0,
      })
    } else {
      setMetaB2B({ contratos_maternidade: 0, contratos_bpc: 0, contratos_aux: 0 })
    }

    setLoading(false)
  }

  async function salvarMetaB2C() {
    setSalvando(true)
    setFeedback('')

    const payload = {
      escopo: 'b2c_geral',
      ano,
      mes,
      vendedor_id: null,
      contratos_total: Number(metaB2C.contratos_total) || 0,
      taxa_assinatura_pct: Number(metaB2C.taxa_assinatura_pct) || 0,
      criado_por: profile.id,
      updated_at: new Date().toISOString(),
    }

    // Upsert na unique key (escopo, ano, mes, vendedor_id)
    const { error } = await supabase
      .from('metas')
      .upsert(payload, { onConflict: 'escopo,ano,mes,vendedor_id' })

    setSalvando(false)
    if (error) {
      setFeedbackErr(true)
      setFeedback('Erro: ' + error.message)
    } else {
      setFeedbackErr(false)
      setFeedback('✓ Meta B2C salva')
      setTimeout(() => setFeedback(''), 3000)
    }
  }

  async function salvarMetaB2B() {
    setSalvando(true)
    setFeedback('')

    const payload = {
      escopo: 'b2b_individual',
      ano,
      mes,
      vendedor_id: null, // null = meta padrão pra todas
      contratos_maternidade: Number(metaB2B.contratos_maternidade) || 0,
      contratos_bpc: Number(metaB2B.contratos_bpc) || 0,
      contratos_aux: Number(metaB2B.contratos_aux) || 0,
      criado_por: profile.id,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('metas')
      .upsert(payload, { onConflict: 'escopo,ano,mes,vendedor_id' })

    setSalvando(false)
    if (error) {
      setFeedbackErr(true)
      setFeedback('Erro: ' + error.message)
    } else {
      setFeedbackErr(false)
      setFeedback('✓ Meta B2B salva (vale pra todas vendedoras)')
      setTimeout(() => setFeedback(''), 3000)
    }
  }

  function navegarMes(delta) {
    let novoMes = mes + delta
    let novoAno = ano
    if (novoMes < 1) { novoMes = 12; novoAno -= 1 }
    if (novoMes > 12) { novoMes = 1; novoAno += 1 }
    setMes(novoMes)
    setAno(novoAno)
  }

  function calcDiario(valorMensal) {
    if (!valorMensal) return 0
    // Aproximação simples: 22 dias úteis no mês
    return Math.ceil(Number(valorMensal) / 22)
  }

  function calcSemanal(valorMensal) {
    if (!valorMensal) return 0
    return Math.ceil(Number(valorMensal) / 4)
  }

  if (loading) return <div style={s.loading}>Carregando...</div>

  return (
    <div>
      <div style={s.title}>🎯 Metas</div>
      <div style={s.subtitle}>Defina as metas de cada mês. As vendedoras B2B veem só a meta delas. A Ágata vê a meta B2C.</div>

      {/* Seletor de período */}
      <div style={s.periodoSelector}>
        <button style={s.periodoBtn} onClick={() => navegarMes(-1)}>◀ Anterior</button>
        <div style={{ ...s.periodoBtn, ...s.periodoBtnActive }}>{MESES[mes - 1]} {ano}</div>
        <button style={s.periodoBtn} onClick={() => navegarMes(1)}>Próximo ▶</button>
        <button style={s.periodoBtn} onClick={() => { setAno(hoje.getFullYear()); setMes(hoje.getMonth() + 1) }}>Hoje</button>
      </div>

      {/* Meta B2C (Produção / IA) */}
      <div style={s.section}>
        <div style={s.sectionTitle}>🤖 Meta B2C (Produção · Captação · IA)</div>
        <div style={s.card}>
          <div style={s.cardHeader}>
            <div style={s.cardTitle}>{MESES[mes - 1]} {ano}</div>
            <div style={s.badge}>Quem vê: Ágata + você</div>
          </div>
          <div style={s.grid}>
            <div style={s.field}>
              <div style={s.label}>Contratos emitidos (mês)</div>
              <input
                type="number"
                style={s.input}
                value={metaB2C.contratos_total || ''}
                onChange={e => setMetaB2C({ ...metaB2C, contratos_total: e.target.value })}
                placeholder="Ex: 2000"
              />
              <div style={s.hint}>≈ {calcSemanal(metaB2C.contratos_total)}/sem · {calcDiario(metaB2C.contratos_total)}/dia</div>
            </div>
            <div style={s.field}>
              <div style={s.label}>Taxa assinatura (%)</div>
              <input
                type="number"
                style={s.input}
                value={metaB2C.taxa_assinatura_pct || ''}
                onChange={e => setMetaB2C({ ...metaB2C, taxa_assinatura_pct: e.target.value })}
                placeholder="Ex: 90"
                max={100}
              />
              <div style={s.hint}>Atual: 84% (semana passada)</div>
            </div>
          </div>
          <button
            style={{ ...s.saveBtn, ...(salvando ? s.saveBtnDisabled : {}) }}
            onClick={salvarMetaB2C}
            disabled={salvando}
          >
            {salvando ? 'Salvando...' : 'Salvar meta B2C'}
          </button>
        </div>
      </div>

      <div style={s.divider} />

      {/* Meta B2B (Vendedoras de advogado) */}
      <div style={s.section}>
        <div style={s.sectionTitle}>⚖️ Meta B2B (Vendedoras de advogado)</div>
        <div style={s.card}>
          <div style={s.cardHeader}>
            <div style={s.cardTitle}>Meta IGUAL pra todas vendedoras · {MESES[mes - 1]} {ano}</div>
            <div style={s.badge}>Quem vê: cada vendedora vê a dela + você</div>
          </div>
          <div style={s.grid}>
            <div style={s.field}>
              <div style={s.label}>Maternidade (mês)</div>
              <input
                type="number"
                style={s.input}
                value={metaB2B.contratos_maternidade || ''}
                onChange={e => setMetaB2B({ ...metaB2B, contratos_maternidade: e.target.value })}
                placeholder="Ex: 300"
              />
              <div style={s.hint}>≈ {calcSemanal(metaB2B.contratos_maternidade)}/sem · {calcDiario(metaB2B.contratos_maternidade)}/dia</div>
            </div>
            <div style={s.field}>
              <div style={s.label}>BPC (mês)</div>
              <input
                type="number"
                style={s.input}
                value={metaB2B.contratos_bpc || ''}
                onChange={e => setMetaB2B({ ...metaB2B, contratos_bpc: e.target.value })}
                placeholder="Ex: 30"
              />
              <div style={s.hint}>≈ {calcSemanal(metaB2B.contratos_bpc)}/sem · {calcDiario(metaB2B.contratos_bpc)}/dia</div>
            </div>
            <div style={s.field}>
              <div style={s.label}>Aux. Acidente (mês)</div>
              <input
                type="number"
                style={s.input}
                value={metaB2B.contratos_aux || ''}
                onChange={e => setMetaB2B({ ...metaB2B, contratos_aux: e.target.value })}
                placeholder="Ex: 10"
              />
              <div style={s.hint}>≈ {calcSemanal(metaB2B.contratos_aux)}/sem · {calcDiario(metaB2B.contratos_aux)}/dia</div>
            </div>
          </div>
          <button
            style={{ ...s.saveBtn, ...(salvando ? s.saveBtnDisabled : {}) }}
            onClick={salvarMetaB2B}
            disabled={salvando}
          >
            {salvando ? 'Salvando...' : 'Salvar meta B2B'}
          </button>
          {feedback && (
            <span style={{ ...s.feedback, ...(feedbackErr ? s.feedbackErr : {}) }}>{feedback}</span>
          )}
        </div>

        {/* Lista de vendedoras pra contexto */}
        <div style={{ ...s.card, marginTop: 12 }}>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Vendedoras ativas que vão receber esta meta</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {vendedoresB2B.map(v => (
              <div key={v.id} style={{ fontSize: 13, color: '#111', background: '#f8f8f6', padding: '6px 12px', borderRadius: 6 }}>
                {v.nome}
              </div>
            ))}
            {vendedoresB2B.length === 0 && (
              <div style={{ fontSize: 13, color: '#aaa' }}>Nenhuma vendedora B2B ativa</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
