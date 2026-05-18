import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const s = {
  title: { fontSize: 20, fontWeight: 500, color: '#111', marginBottom: 4, letterSpacing: '-0.3px' },
  subtitle: { fontSize: 13, color: '#888', marginBottom: 24 },
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 13, fontWeight: 500, color: '#111', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' },
  card: { background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: '1.25rem', marginBottom: 12 },
  periodoSelector: { display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' },
  periodoBtn: { fontSize: 13, padding: '8px 14px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', background: '#fff', color: '#555', cursor: 'pointer' },
  periodoBtnActive: { background: '#111', color: '#fff', borderColor: '#111' },
  bar: { height: 8, background: '#f0f0ed', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', transition: 'width 0.3s' },
  loading: { textAlign: 'center', padding: '3rem', color: '#888', fontSize: 14 },
  empty: { fontSize: 13, color: '#aaa', padding: '1rem 0', textAlign: 'center' },
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function corDoPct(pct) {
  if (pct >= 90) return '#3B6D11'
  if (pct >= 50) return '#854F0B'
  return '#A32D2D'
}

function ProgressoBar({ atual, meta }) {
  const pct = meta > 0 ? Math.min(100, Math.round((atual / meta) * 100)) : 0
  return (
    <div style={s.bar}>
      <div style={{ ...s.barFill, width: pct + '%', background: corDoPct(pct) }} />
    </div>
  )
}

function CardMetric({ label, atual, meta }) {
  const pct = meta > 0 ? Math.round((atual / meta) * 100) : 0
  return (
    <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 17, fontWeight: 500, color: '#111' }}>
          {atual.toLocaleString('pt-BR')} <span style={{ fontSize: 12, color: '#888', fontWeight: 400 }}>/ {(meta || 0).toLocaleString('pt-BR')}</span>
        </div>
        <div style={{ fontSize: 12, fontWeight: 500, color: corDoPct(pct) }}>{pct}%</div>
      </div>
      <ProgressoBar atual={atual} meta={meta} />
    </div>
  )
}

export default function BIBruno() {
  const [loading, setLoading] = useState(true)
  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth() + 1)

  const [metaB2C, setMetaB2C] = useState(null)
  const [metasB2B, setMetasB2B] = useState([]) // 1 linha por vendedora
  const [vendedoras, setVendedoras] = useState([])
  const [emitidosB2C, setEmitidosB2C] = useState({ Maternidade: 0, BPC: 0, Aux: 0 })
  const [vendasB2B, setVendasB2B] = useState({}) // { vendedor_id: { Maternidade, BPC, Aux } }

  useEffect(() => {
    let cancelado = false
    async function carrega() {
      setLoading(true)

      // 1. Vendedoras ativas
      const { data: vends } = await supabase
        .from('profiles')
        .select('id, nome')
        .eq('role', 'vendedor')
        .eq('ativo', true)
        .order('nome', { ascending: true })

      if (cancelado) return
      setVendedoras(vends || [])

      // 2. Meta B2C do mês
      const { data: b2c } = await supabase
        .from('metas')
        .select('*')
        .eq('escopo', 'b2c_geral')
        .eq('ano', ano)
        .eq('mes', mes)
        .is('vendedor_id', null)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (cancelado) return
      setMetaB2C(b2c || null)

      // 3. Metas B2B (1 linha por vendedora)
      const { data: b2b } = await supabase
        .from('metas')
        .select('*')
        .eq('escopo', 'b2b_individual')
        .eq('ano', ano)
        .eq('mes', mes)
        .not('vendedor_id', 'is', null)
      if (cancelado) return
      setMetasB2B(b2b || [])

      // 4. Emitidos B2C do mês (via contratos_producao com produto via lote)
      const inicioMes = new Date(ano, mes - 1, 1).toISOString()
      const fimMes = new Date(ano, mes, 0, 23, 59, 59, 999).toISOString()

      const { data: contratos } = await supabase
        .from('contratos_producao')
        .select('id, created_at, lotes!lote_id(produto)')
        .gte('created_at', inicioMes)
        .lte('created_at', fimMes)

      if (cancelado) return
      const ctsByProd = { Maternidade: 0, BPC: 0, Aux: 0 }
      ;(contratos || []).forEach(c => {
        const p = c.lotes?.produto
        if (p === 'Maternidade') ctsByProd.Maternidade += 1
        else if (p === 'BPC') ctsByProd.BPC += 1
        else if (p === 'Auxilio Acidente') ctsByProd.Aux += 1
      })
      setEmitidosB2C(ctsByProd)

      // 5. Vendas B2B do mês por vendedora e produto
      //    Regra: contar compras cujo LOTE está em (pago, entregue, a_entregar)
      //    Filtra também por mês (data_compra)
      const dataIni = new Date(ano, mes - 1, 1).toISOString().slice(0, 10)
      const dataFim = new Date(ano, mes, 0).toISOString().slice(0, 10)

      // Pega compras do mês das vendedoras
      const vendedorIds = (vends || []).map(v => v.id)
      const { data: comprasDoMes } = await supabase
        .from('compras')
        .select('id, vendedor_id, produto, advogado_id, data_compra')
        .in('vendedor_id', vendedorIds.length > 0 ? vendedorIds : ['00000000-0000-0000-0000-000000000000'])
        .gte('data_compra', dataIni)
        .lte('data_compra', dataFim)

      if (cancelado) return

      // Pega lotes do mês das vendedoras com status válido
      // Exclui lotes de reposição (eles não contam pra meta)
      const { data: lotesValidos } = await supabase
        .from('lotes')
        .select('id, advogado_id, data_compra, status_pagamento, vendedor_id, tipo')
        .in('vendedor_id', vendedorIds.length > 0 ? vendedorIds : ['00000000-0000-0000-0000-000000000000'])
        .gte('data_compra', dataIni)
        .lte('data_compra', dataFim)
        .in('status_pagamento', ['pago', 'entregue', 'a_entregar'])
        .or('tipo.eq.normal,tipo.is.null')

      if (cancelado) return

      // Indexa lotes válidos por (advogado_id + data_compra)
      const loteValido = new Set()
      ;(lotesValidos || []).forEach(l => {
        loteValido.add(l.advogado_id + '|' + l.data_compra)
      })

      // Conta compras cujo lote está no Set de válidos
      const vendas = {}
      ;(comprasDoMes || []).forEach(c => {
        const key = c.advogado_id + '|' + c.data_compra
        if (!loteValido.has(key)) return
        if (!vendas[c.vendedor_id]) vendas[c.vendedor_id] = { Maternidade: 0, BPC: 0, Aux: 0 }
        if (c.produto === 'Maternidade') vendas[c.vendedor_id].Maternidade += 1
        else if (c.produto === 'BPC') vendas[c.vendedor_id].BPC += 1
        else if (c.produto === 'Auxilio Acidente') vendas[c.vendedor_id].Aux += 1
      })
      setVendasB2B(vendas)

      setLoading(false)
    }
    carrega()
    return () => { cancelado = true }
  }, [ano, mes])

  function navegarMes(delta) {
    let novoMes = mes + delta
    let novoAno = ano
    if (novoMes < 1) { novoMes = 12; novoAno -= 1 }
    if (novoMes > 12) { novoMes = 1; novoAno += 1 }
    setMes(novoMes)
    setAno(novoAno)
  }

  if (loading) return <div style={s.loading}>Carregando...</div>

  // === Cálculos B2C ===
  const metaB2CMat = metaB2C?.contratos_maternidade || 0
  const metaB2CBPC = metaB2C?.contratos_bpc || 0
  const metaB2CAux = metaB2C?.contratos_aux || 0
  const metaB2CTotal = metaB2CMat + metaB2CBPC + metaB2CAux
  const emitidosB2CTotal = emitidosB2C.Maternidade + emitidosB2C.BPC + emitidosB2C.Aux

  // === Cálculos B2B equipe ===
  // Usa primeira meta encontrada como referência (todas são iguais)
  const metaB2BRef = metasB2B[0] || { contratos_maternidade: 0, contratos_bpc: 0, contratos_aux: 0 }
  const metaB2BUnitMat = metaB2BRef.contratos_maternidade || 0
  const metaB2BUnitBPC = metaB2BRef.contratos_bpc || 0
  const metaB2BUnitAux = metaB2BRef.contratos_aux || 0
  const metaB2BUnitTotal = metaB2BUnitMat + metaB2BUnitBPC + metaB2BUnitAux

  const metaEquipeMat = metaB2BUnitMat * vendedoras.length
  const metaEquipeBPC = metaB2BUnitBPC * vendedoras.length
  const metaEquipeAux = metaB2BUnitAux * vendedoras.length
  const metaEquipeTotal = metaEquipeMat + metaEquipeBPC + metaEquipeAux

  let vendidoEquipeMat = 0
  let vendidoEquipeBPC = 0
  let vendidoEquipeAux = 0
  Object.values(vendasB2B).forEach(v => {
    vendidoEquipeMat += v.Maternidade
    vendidoEquipeBPC += v.BPC
    vendidoEquipeAux += v.Aux
  })
  const vendidoEquipeTotal = vendidoEquipeMat + vendidoEquipeBPC + vendidoEquipeAux

  // === Dias úteis restantes do mês ===
  const ehMesAtual = ano === hoje.getFullYear() && mes === hoje.getMonth() + 1
  const fimMesData = new Date(ano, mes, 0)
  fimMesData.setHours(23, 59, 59, 999)
  const diasCorridosRestantes = ehMesAtual ? Math.max(1, Math.ceil((fimMesData - hoje) / (1000 * 60 * 60 * 24))) : 0
  const diasUteisRestantes = Math.max(1, Math.round(diasCorridosRestantes * 5 / 7))

  return (
    <div>
      <div style={s.title}>📊 BI Bruno</div>
      <div style={s.subtitle}>Acompanhamento de metas — privado, só você vê.</div>

      <div style={s.periodoSelector}>
        <button style={s.periodoBtn} onClick={() => navegarMes(-1)}>◀ Anterior</button>
        <div style={{ ...s.periodoBtn, ...s.periodoBtnActive }}>{MESES[mes - 1]} {ano}</div>
        <button style={s.periodoBtn} onClick={() => navegarMes(1)}>Próximo ▶</button>
        <button style={s.periodoBtn} onClick={() => { setAno(hoje.getFullYear()); setMes(hoje.getMonth() + 1) }}>Mês atual</button>
        {ehMesAtual && (
          <div style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>
            ~{diasUteisRestantes} dias úteis restantes
          </div>
        )}
      </div>

      {/* ======= META B2C ======= */}
      <div style={s.section}>
        <div style={s.sectionTitle}>🤖 Meta B2C (Produção · IA)</div>
        <div style={s.card}>
          {!metaB2C && (
            <div style={s.empty}>
              Nenhuma meta B2C definida para {MESES[mes - 1]} {ano}. Vai em <strong>🎯 Metas</strong> e define.
            </div>
          )}
          {metaB2C && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: '#111' }}>
                  Total: <span style={{ color: corDoPct(metaB2CTotal > 0 ? (emitidosB2CTotal / metaB2CTotal) * 100 : 0), fontWeight: 600 }}>{emitidosB2CTotal.toLocaleString('pt-BR')}</span> / {metaB2CTotal.toLocaleString('pt-BR')} ({metaB2CTotal > 0 ? Math.round((emitidosB2CTotal / metaB2CTotal) * 100) : 0}%)
                </div>
                {ehMesAtual && metaB2CTotal > emitidosB2CTotal && (
                  <div style={{ fontSize: 12, color: '#888' }}>
                    Falta <strong>{(metaB2CTotal - emitidosB2CTotal).toLocaleString('pt-BR')}</strong> · ritmo <strong>{Math.ceil((metaB2CTotal - emitidosB2CTotal) / diasUteisRestantes)}/dia</strong>
                  </div>
                )}
              </div>
              <div style={{ marginBottom: 16 }}>
                <ProgressoBar atual={emitidosB2CTotal} meta={metaB2CTotal} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <CardMetric label="Maternidade" atual={emitidosB2C.Maternidade} meta={metaB2CMat} />
                <CardMetric label="BPC" atual={emitidosB2C.BPC} meta={metaB2CBPC} />
                <CardMetric label="Aux. Acidente" atual={emitidosB2C.Aux} meta={metaB2CAux} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ======= META B2B - EQUIPE TOTAL ======= */}
      <div style={s.section}>
        <div style={s.sectionTitle}>⚖️ Meta B2B — Equipe total</div>
        <div style={s.card}>
          {metasB2B.length === 0 && (
            <div style={s.empty}>
              Nenhuma meta B2B definida para {MESES[mes - 1]} {ano}. Vai em <strong>🎯 Metas</strong> e define.
            </div>
          )}
          {metasB2B.length > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: '#111' }}>
                  Equipe ({vendedoras.length} vendedoras): <span style={{ color: corDoPct(metaEquipeTotal > 0 ? (vendidoEquipeTotal / metaEquipeTotal) * 100 : 0), fontWeight: 600 }}>{vendidoEquipeTotal.toLocaleString('pt-BR')}</span> / {metaEquipeTotal.toLocaleString('pt-BR')} ({metaEquipeTotal > 0 ? Math.round((vendidoEquipeTotal / metaEquipeTotal) * 100) : 0}%)
                </div>
                <div style={{ fontSize: 11, color: '#888' }}>
                  Conta lotes: pago + entregue + a_entregar · exclui inadimplente e não assinou
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <ProgressoBar atual={vendidoEquipeTotal} meta={metaEquipeTotal} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <CardMetric label="Maternidade · equipe" atual={vendidoEquipeMat} meta={metaEquipeMat} />
                <CardMetric label="BPC · equipe" atual={vendidoEquipeBPC} meta={metaEquipeBPC} />
                <CardMetric label="Aux · equipe" atual={vendidoEquipeAux} meta={metaEquipeAux} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ======= META B2B - INDIVIDUAL ======= */}
      {metasB2B.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionTitle}>⚖️ Meta B2B — Por vendedora</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
            {vendedoras.map(v => {
              const venda = vendasB2B[v.id] || { Maternidade: 0, BPC: 0, Aux: 0 }
              const totalV = venda.Maternidade + venda.BPC + venda.Aux
              const pctTotal = metaB2BUnitTotal > 0 ? Math.round((totalV / metaB2BUnitTotal) * 100) : 0
              return (
                <div key={v.id} style={s.card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#111' }}>{v.nome}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: corDoPct(pctTotal) }}>{pctTotal}%</div>
                  </div>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
                    {totalV.toLocaleString('pt-BR')} / {metaB2BUnitTotal.toLocaleString('pt-BR')} válidos
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <ProgressoBar atual={totalV} meta={metaB2BUnitTotal} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, fontSize: 11 }}>
                    <div style={{ background: '#f8f8f6', padding: '8px 10px', borderRadius: 6 }}>
                      <div style={{ color: '#888', marginBottom: 2 }}>Mat</div>
                      <div style={{ fontWeight: 500, color: '#111' }}>{venda.Maternidade}/{metaB2BUnitMat}</div>
                    </div>
                    <div style={{ background: '#f8f8f6', padding: '8px 10px', borderRadius: 6 }}>
                      <div style={{ color: '#888', marginBottom: 2 }}>BPC</div>
                      <div style={{ fontWeight: 500, color: '#111' }}>{venda.BPC}/{metaB2BUnitBPC}</div>
                    </div>
                    <div style={{ background: '#f8f8f6', padding: '8px 10px', borderRadius: 6 }}>
                      <div style={{ color: '#888', marginBottom: 2 }}>Aux</div>
                      <div style={{ fontWeight: 500, color: '#111' }}>{venda.Aux}/{metaB2BUnitAux}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
