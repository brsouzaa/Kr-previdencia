import { useState, useEffect } from 'react'

const SUPABASE_URL = 'https://sdqslzpfbazehqcvibjy.supabase.co'
const ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || ''

export default function PerformanceIA() {
  const [periodo, setPeriodo] = useState('30d')
  const [dados, setDados] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { carregar() }, [periodo])

  async function carregar() {
    setLoading(true)
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/gerar-contratos-zapsign/metricas-ia?periodo=${periodo}`, {
        headers: { 'Authorization': `Bearer ${ANON_KEY}` }
      })
      const data = await r.json()
      if (data.ok) setDados(data)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#5b6b84' }}>Carregando...</div>
  if (!dados) return <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>Erro ao carregar métricas</div>

  const { ia, humano, comparativo } = dados

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>📈 Performance IA</h1>
          <div style={{ fontSize: 13, color: '#5b6b84', marginTop: 4 }}>Acompanhe a performance da IA e compare com vendedoras humanas.</div>
        </div>
        <div style={{ display: 'flex', gap: 4, background: '#ffffff', padding: 4, borderRadius: 6, border: '1px solid rgba(15,23,42,0.07)' }}>
          {[
            { v: 'hoje', label: 'Hoje' },
            { v: '7d', label: '7 dias' },
            { v: '30d', label: '30 dias' },
            { v: 'all', label: 'Tudo' },
          ].map(p => (
            <button key={p.v} onClick={() => setPeriodo(p.v)}
              style={{
                padding: '6px 12px', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13,
                background: periodo === p.v ? '#60a5fa' : 'transparent',
                color: periodo === p.v ? '#232a37' : '#5b6b84',
                fontWeight: periodo === p.v ? 600 : 400,
              }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Taxas principais */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
        <CardGrande label="Taxa Assinatura IA" valor={`${ia.taxa_assinatura}%`} sub={`${ia.funil.assinados}/${ia.funil.emitidos} emitidos`} cor="#2563eb" />
        <CardGrande label="Aprovação Agatha" valor={`${ia.taxa_aprovacao_agatha}%`} sub={`${ia.funil.validados_agatha} validados`} cor="#059669" />
        <CardGrande label="Reprovação Agatha" valor={`${ia.taxa_reprovacao_agatha}%`} sub={`${ia.funil.barrados_agatha} barrados`} cor="#dc2626" />
        <CardGrande label="Conclusão IA" valor={`${ia.taxa_conclusao}%`} sub={`${ia.funil.entregues} entregues`} cor="#b45309" />
      </div>

      {/* Funil IA */}
      <div style={{ background: '#ffffff', padding: 20, borderRadius: 8, border: '1px solid rgba(15,23,42,0.07)', marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, margin: '0 0 16px 0' }}>🤖 Funil da IA</h2>
        <Funil etapas={[
          { label: 'Cadastrados', valor: ia.funil.cadastrados, cor: '#2563eb' },
          { label: 'Emitidos', valor: ia.funil.emitidos, cor: '#2563eb' },
          { label: 'Assinados', valor: ia.funil.assinados, cor: '#059669' },
          { label: 'Em revisão Agatha', valor: ia.funil.em_revisao_agatha, cor: '#b45309' },
          { label: 'Validados Agatha', valor: ia.funil.validados_agatha, cor: '#059669' },
          { label: 'Validados Sthefany', valor: ia.funil.validados_sthefany, cor: '#059669' },
          { label: 'Entregues', valor: ia.funil.entregues, cor: '#059669' },
        ]} total={ia.funil.cadastrados} />
        <div style={{ display: 'flex', gap: 16, marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(15,23,42,0.05)', fontSize: 12, color: '#5b6b84' }}>
          <span>❌ Expirados: <strong>{ia.funil.expirados}</strong></span>
          <span>🚫 Barrados Agatha: <strong>{ia.funil.barrados_agatha}</strong></span>
          <span>🗑 Cancelados: <strong>{ia.funil.cancelados}</strong></span>
        </div>
      </div>

      {/* Motivos de barragem */}
      {ia.motivos_barragem && ia.motivos_barragem.length > 0 && (
        <div style={{ background: '#ffffff', padding: 20, borderRadius: 8, border: '1px solid rgba(15,23,42,0.07)', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, margin: '0 0 16px 0' }}>🚫 Motivos de barragem (Agatha)</h2>
          {ia.motivos_barragem.map((m, i) => {
            const total = ia.motivos_barragem.reduce((s, x) => s + x.qtd, 0)
            const pct = total > 0 ? Math.round((m.qtd / total) * 100) : 0
            return (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 2 }}>
                  <span>{labelMotivo(m.motivo)}</span>
                  <span style={{ color: '#5b6b84' }}>{m.qtd} ({pct}%)</span>
                </div>
                <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: '#f87171' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Comparativo IA vs Humano */}
      <div style={{ background: '#ffffff', padding: 20, borderRadius: 8, border: '1px solid rgba(15,23,42,0.07)' }}>
        <h2 style={{ fontSize: 16, margin: '0 0 16px 0' }}>⚔️ IA vs Vendedoras Humanas</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid rgba(15,23,42,0.08)', textAlign: 'left' }}>
              <th style={{ padding: 8 }}>Métrica</th>
              <th style={{ padding: 8, textAlign: 'right' }}>🤖 IA</th>
              <th style={{ padding: 8, textAlign: 'right' }}>👩 Humanas</th>
              <th style={{ padding: 8, textAlign: 'right' }}>Δ</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid rgba(15,23,42,0.05)' }}>
              <td style={{ padding: 8 }}>Cadastrados</td>
              <td style={{ padding: 8, textAlign: 'right' }}>{ia.funil.cadastrados}</td>
              <td style={{ padding: 8, textAlign: 'right' }}>{humano.funil.cadastrados}</td>
              <td style={{ padding: 8, textAlign: 'right', color: '#5b6b84' }}>—</td>
            </tr>
            <tr style={{ borderBottom: '1px solid rgba(15,23,42,0.05)' }}>
              <td style={{ padding: 8 }}>Assinados</td>
              <td style={{ padding: 8, textAlign: 'right' }}>{ia.funil.assinados}</td>
              <td style={{ padding: 8, textAlign: 'right' }}>{humano.funil.assinados}</td>
              <td style={{ padding: 8, textAlign: 'right', color: '#5b6b84' }}>—</td>
            </tr>
            <tr style={{ borderBottom: '1px solid rgba(15,23,42,0.05)' }}>
              <td style={{ padding: 8 }}>Validados</td>
              <td style={{ padding: 8, textAlign: 'right' }}>{ia.funil.validados_sthefany}</td>
              <td style={{ padding: 8, textAlign: 'right' }}>{humano.funil.validados}</td>
              <td style={{ padding: 8, textAlign: 'right', color: '#5b6b84' }}>—</td>
            </tr>
            <tr style={{ borderBottom: '1px solid rgba(15,23,42,0.05)' }}>
              <td style={{ padding: 8 }}>Entregues</td>
              <td style={{ padding: 8, textAlign: 'right' }}>{ia.funil.entregues}</td>
              <td style={{ padding: 8, textAlign: 'right' }}>{humano.funil.entregues}</td>
              <td style={{ padding: 8, textAlign: 'right', color: '#5b6b84' }}>—</td>
            </tr>
            <tr style={{ background: '#f2f5fa', fontWeight: 600 }}>
              <td style={{ padding: 8 }}>Taxa de conclusão</td>
              <td style={{ padding: 8, textAlign: 'right', color: '#2563eb' }}>{ia.taxa_conclusao}%</td>
              <td style={{ padding: 8, textAlign: 'right', color: '#5b6b84' }}>{humano.taxa_conclusao}%</td>
              <td style={{ padding: 8, textAlign: 'right', color: comparativo.ia_vs_humano_conclusao_pp >= 0 ? '#059669' : '#dc2626' }}>
                {comparativo.ia_vs_humano_conclusao_pp >= 0 ? '+' : ''}{comparativo.ia_vs_humano_conclusao_pp}pp
              </td>
            </tr>
          </tbody>
        </table>
        <div style={{ fontSize: 12, color: '#5b6b84', marginTop: 12, padding: 8, background: '#f2f5fa', borderRadius: 4 }}>
          ℹ️ Comparação ainda preliminar — IA tem poucos dias rodando. Aguarde 30+ dias pra conclusão estatística confiável.
        </div>
      </div>
    </div>
  )
}

function CardGrande({ label, valor, sub, cor }) {
  return (
    <div style={{ background: '#ffffff', padding: 16, borderRadius: 8, border: '1px solid rgba(15,23,42,0.07)' }}>
      <div style={{ fontSize: 11, color: '#5b6b84', textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: cor, marginTop: 4 }}>{valor}</div>
      <div style={{ fontSize: 11, color: '#5b6b84' }}>{sub}</div>
    </div>
  )
}

function Funil({ etapas, total }) {
  return (
    <div>
      {etapas.map((e, i) => {
        const pct = total > 0 ? Math.round((e.valor / total) * 100) : 0
        const largura = total > 0 ? Math.max(8, (e.valor / total) * 100) : 0
        return (
          <div key={i} style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 160, fontSize: 12, color: '#5b6b84' }}>{e.label}</div>
            <div style={{ flex: 1, height: 24, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
              <div style={{ height: '100%', width: `${largura}%`, background: e.cor, transition: 'width 0.3s' }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', paddingLeft: 8, fontSize: 12, fontWeight: 600, color: largura > 30 ? '#232a37' : '#222' }}>
                {e.valor} {total > 0 && `(${pct}%)`}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function labelMotivo(codigo) {
  const map = {
    doc_ilegivel: 'Documento ilegível',
    doc_faltando_rg: 'Falta RG',
    doc_faltando_comprovante_residencia: 'Falta comprovante de residência',
    doc_faltando_comprovante_gravidez: 'Falta comprovante de gravidez',
    doc_faltando_comprovante_bolsa: 'Falta extrato Bolsa Família',
    cliente_desistiu: 'Cliente desistiu',
    dados_divergentes: 'Dados divergentes',
    nao_se_encaixa_no_perfil: 'Não se encaixa no perfil',
    outros: 'Outros',
  }
  return map[codigo] || codigo
}
