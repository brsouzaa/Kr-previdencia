import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const s = {
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 },
  cardMetric: { background: '#fff', borderRadius: 14, padding: '16px', border: '0.5px solid rgba(0,0,0,0.08)' },
  cardLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6, fontWeight: 500 },
  cardValue: { fontSize: 28, fontWeight: 500 },
  cardSub: { fontSize: 11, color: '#888', marginTop: 4 },
  blockTitle: { fontSize: 13, fontWeight: 500, color: '#111', marginBottom: 10 },
  productBar: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, fontSize: 13 },
  productLabel: { minWidth: 130, color: '#555' },
  productCount: { fontWeight: 500, minWidth: 60, textAlign: 'right' },
  productBarBg: { flex: 1, height: 8, background: '#f0f0ee', borderRadius: 4, overflow: 'hidden' },
}

export default function MeuDesempenho() {
  const { profile } = useAuth()
  const [dados, setDados] = useState(null)
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState('mes') // hoje | semana | mes | sempre

  const fetch = useCallback(async () => {
    setLoading(true)
    let dataIni = null
    const agora = new Date()
    if (periodo === 'hoje') { dataIni = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).toISOString() }
    else if (periodo === 'semana') { const d = new Date(agora); d.setDate(d.getDate()-7); dataIni = d.toISOString() }
    else if (periodo === 'mes') { dataIni = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString() }

    let q = supabase.from('clientes').select('*').eq('vendedor_operador_id', profile.id)
    if (dataIni) q = q.gte('created_at', dataIni)
    const { data } = await q
    setDados(data || [])
    setLoading(false)
  }, [profile, periodo])

  useEffect(() => { fetch() }, [fetch])

  if (loading || !dados) return <div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>Carregando...</div>

  const total = dados.length
  const aguardando = dados.filter(c => c.status === 'aguardando_emissao').length
  const emitidos = dados.filter(c => c.status === 'emitido').length
  const assinados = dados.filter(c => c.status === 'assinado').length
  const expirados = dados.filter(c => c.status === 'expirado').length
  const validos = emitidos + assinados + expirados
  const taxaAssinatura = validos > 0 ? Math.round((assinados / validos) * 100) : 0

  const porProduto = dados.reduce((acc, c) => {
    acc[c.produto] = (acc[c.produto] || 0) + 1
    return acc
  }, {})

  const periodoLabel = periodo === 'hoje' ? 'hoje' : periodo === 'semana' ? 'na semana' : periodo === 'mes' ? 'no mês' : 'desde sempre'

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: 20, fontWeight: 500, color: '#111', marginBottom: 4 }}>📊 Meu desempenho</div>
        <div style={{ fontSize: 13, color: '#888' }}>Resumo das suas vendas</div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          ['hoje','Hoje'], ['semana','Última semana'], ['mes','Este mês'], ['sempre','Sempre']
        ].map(([k, label]) => (
          <button key={k} onClick={() => setPeriodo(k)} style={{
            padding: '8px 14px', fontSize: 13, borderRadius: 8,
            background: periodo === k ? '#185FA5' : '#fff',
            color: periodo === k ? '#fff' : '#555',
            border: `0.5px solid ${periodo === k ? '#185FA5' : 'rgba(0,0,0,0.15)'}`,
            cursor: 'pointer', fontWeight: 500,
          }}>{label}</button>
        ))}
      </div>

      <div style={s.cards}>
        <div style={s.cardMetric}>
          <div style={{ ...s.cardLabel, color: '#185FA5' }}>Total cadastrados</div>
          <div style={{ ...s.cardValue, color: '#185FA5' }}>{total}</div>
          <div style={s.cardSub}>{periodoLabel}</div>
        </div>
        <div style={s.cardMetric}>
          <div style={{ ...s.cardLabel, color: '#854F0B' }}>Aguardando emissão</div>
          <div style={{ ...s.cardValue, color: '#854F0B' }}>{aguardando}</div>
          <div style={s.cardSub}>na fila do supervisor</div>
        </div>
        <div style={s.cardMetric}>
          <div style={{ ...s.cardLabel, color: '#3B6D11' }}>Assinados</div>
          <div style={{ ...s.cardValue, color: '#3B6D11' }}>{assinados}</div>
          <div style={s.cardSub}>contratos fechados ✓</div>
        </div>
        <div style={s.cardMetric}>
          <div style={{ ...s.cardLabel, color: '#A32D2D' }}>Taxa de assinatura</div>
          <div style={{ ...s.cardValue, color: taxaAssinatura >= 60 ? '#3B6D11' : taxaAssinatura >= 40 ? '#854F0B' : '#A32D2D' }}>{taxaAssinatura}%</div>
          <div style={s.cardSub}>{assinados} de {validos} válidos</div>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 14, padding: '1.25rem', border: '0.5px solid rgba(0,0,0,0.08)', marginBottom: 16 }}>
        <div style={s.blockTitle}>Por produto</div>
        {Object.keys(porProduto).length === 0 ? (
          <div style={{ fontSize: 13, color: '#888' }}>Sem vendas no período</div>
        ) : Object.entries(porProduto).sort((a,b) => b[1]-a[1]).map(([prod, qtd]) => {
          const pct = total > 0 ? (qtd / total) * 100 : 0
          const cor = prod === 'Maternidade' ? '#0F6E56' : prod === 'BPC' ? '#534AB7' : '#854F0B'
          return (
            <div key={prod} style={s.productBar}>
              <span style={s.productLabel}>{prod === 'Auxilio Acidente' ? 'Auxílio Acidente' : prod}</span>
              <div style={s.productBarBg}>
                <div style={{ width: `${pct}%`, height: '100%', background: cor }} />
              </div>
              <span style={{ ...s.productCount, color: cor }}>{qtd} ({Math.round(pct)}%)</span>
            </div>
          )
        })}
      </div>

      <div style={{ background: '#fff', borderRadius: 14, padding: '1.25rem', border: '0.5px solid rgba(0,0,0,0.08)' }}>
        <div style={s.blockTitle}>Funil</div>
        {[
          ['Cadastrados', total, '#185FA5'],
          ['Emitidos pelo supervisor', emitidos + assinados + expirados, '#854F0B'],
          ['Assinados', assinados, '#3B6D11'],
          ['Expirados', expirados, '#A32D2D'],
        ].map(([label, valor, cor]) => {
          const pct = total > 0 ? (valor / total) * 100 : 0
          return (
            <div key={label} style={s.productBar}>
              <span style={s.productLabel}>{label}</span>
              <div style={s.productBarBg}>
                <div style={{ width: `${pct}%`, height: '100%', background: cor }} />
              </div>
              <span style={{ ...s.productCount, color: cor }}>{valor}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
