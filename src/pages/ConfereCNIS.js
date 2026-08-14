import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Tela TEMPORARIA de auditoria: compara o veredito da maquina (auto-analise CNIS, modo sombra)
// com a DECISAO REAL do humano — cnis_aprovado, o botao Aprovar/Reprovar CNIS do board retroativo.
// Sem remarcacao: o historico se constroi sozinho do trabalho normal da atendente.
// Quando a concordancia estiver alta e os erros perigosos zerados por um periodo, liga-se o corte automatico.

const CHATWOOT_BASE = 'https://chat.grupookr.com.br' // migracao Chatwoot: instancia propria
const ACCOUNT = '1'

const MAP_V = {
  APTA: { label: 'Apta', cor: '#059669', bg: 'rgba(52,211,153,.14)' },
  NAO_CLIENTE: { label: 'Não cliente', cor: '#dc2626', bg: 'rgba(248,113,113,.14)' },
  APTA_CONFERIR_GERID: { label: 'Apta · conferir GERID', cor: '#b45309', bg: 'rgba(251,191,36,.12)' },
  HUMANO: { label: 'Humano', cor: '#5b6b84', bg: '#e2e8f0' },
}
const MAQUINA_PASSA = ['APTA', 'APTA_CONFERIR_GERID'] // maquina deixaria seguir como cliente

// Faixa de datas a partir do preset (base: fuso do navegador = BRT do usuario)
function faixaData(preset, cDe, cAte) {
  const ini = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
  const hoje = ini(new Date())
  const amanha = new Date(hoje); amanha.setDate(amanha.getDate() + 1)
  if (preset === 'hoje') return { de: hoje, ate: amanha }
  if (preset === 'ontem') { const o = new Date(hoje); o.setDate(o.getDate() - 1); return { de: o, ate: hoje } }
  if (preset === '7d') { const d = new Date(hoje); d.setDate(d.getDate() - 6); return { de: d, ate: amanha } }
  if (preset === 'mes') { const d = new Date(hoje); d.setDate(d.getDate() - 29); return { de: d, ate: amanha } }
  if (preset === 'custom') {
    const de = cDe ? ini(cDe + 'T00:00:00') : null
    let ate = null
    if (cAte) { ate = ini(cAte + 'T00:00:00'); ate.setDate(ate.getDate() + 1) }
    return { de, ate }
  }
  return { de: null, ate: null }
}
const OPCOES_DATA = [['tudo', 'tudo'], ['hoje', 'hoje'], ['ontem', 'ontem'], ['7d', '7 dias'], ['mes', 'mês'], ['custom', 'personalizado']]
// true se a data (texto ISO) cai dentro da faixa. Sem faixa = tudo. Data inválida = fora de janela específica.
function dentroFaixa(dtStr, faixa) {
  if (!faixa.de && !faixa.ate) return true
  if (!dtStr) return false
  const d = new Date(dtStr)
  if (isNaN(d.getTime())) return false
  if (faixa.de && d < faixa.de) return false
  if (faixa.ate && d >= faixa.ate) return false
  return true
}

const s = {
  title: { fontSize: 20, fontWeight: 500, color: '#0f172a', marginBottom: 4 },
  sub: { fontSize: 13, color: '#5b6b84', marginBottom: 16 },
  resumo: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 },
  kpi: { background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 12, padding: '12px 16px', minWidth: 128 },
  kpiNum: { fontSize: 22, fontWeight: 700, color: '#0f172a' },
  kpiLbl: { fontSize: 11, color: '#5b6b84', marginTop: 2 },
  kpiPerigo: { background: 'rgba(248,113,113,.14)', border: '1.5px solid #f87171', borderRadius: 12, padding: '12px 16px', minWidth: 128 },
  tabela: { width: '100%', borderCollapse: 'collapse', background: '#ffffff', borderRadius: 12, overflow: 'hidden', border: '0.5px solid rgba(15,23,42,0.08)' },
  th: { textAlign: 'left', fontSize: 11, color: '#5b6b84', fontWeight: 600, textTransform: 'uppercase', padding: '10px 12px', borderBottom: '1px solid rgba(15,23,42,0.07)', background: '#f1f5f9' },
  td: { fontSize: 13, color: '#0f172a', padding: '10px 12px', borderBottom: '0.5px solid rgba(15,23,42,0.06)', verticalAlign: 'middle' },
  badge: (v) => ({ display: 'inline-block', padding: '3px 9px', borderRadius: 8, fontSize: 12, fontWeight: 600, color: (MAP_V[v] || {}).cor || '#5b6b84', background: (MAP_V[v] || {}).bg || '#e2e8f0' }),
  badgeH: (bg, cor) => ({ display: 'inline-block', padding: '3px 9px', borderRadius: 8, fontSize: 12, fontWeight: 600, color: cor, background: bg }),
  link: { fontSize: 12, color: '#2563eb', textDecoration: 'none', fontWeight: 500 },
  linhaPerigo: { background: 'rgba(248,113,113,.14)' },
}

export default function ConfereCNIS() {
  const [linhas, setLinhas] = useState([])
  const [loading, setLoading] = useState(true)
  const [soComparaveis, setSoComparaveis] = useState(false)
  const [filtroData, setFiltroData] = useState('tudo')
  const [dtDe, setDtDe] = useState(''); const [dtAte, setDtAte] = useState('')

  const carregar = useCallback(async () => {
    const { data } = await supabase.rpc('cnis_auditoria')
    setLinhas(data || [])
    setLoading(false)
  }, [])
  useEffect(() => {
    carregar()
    const t = setInterval(carregar, 60000)
    return () => clearInterval(t)
  }, [carregar])

  // Classifica cada linha comparando maquina x decisao real do humano (cnis_aprovado)
  const classificar = (l) => {
    if (!l.decisao_humana) return { estado: 'pendente' }
    if (l.veredito_maquina === 'HUMANO') return { estado: 'deferiu' } // maquina pediu humano, sem corte a validar
    const humanoCliente = l.decisao_humana === 'true'
    const maquinaPassa = MAQUINA_PASSA.includes(l.veredito_maquina)
    const concorda = (maquinaPassa && humanoCliente) || (l.veredito_maquina === 'NAO_CLIENTE' && !humanoCliente)
    const perigoso = maquinaPassa && !humanoCliente          // maquina deixaria passar quem nao e cliente
    const inverso = l.veredito_maquina === 'NAO_CLIENTE' && humanoCliente
    return { estado: concorda ? 'bateu' : 'divergiu', concorda, perigoso, inverso }
  }

  // ---- Filtro por período (data da análise da máquina) ----
  const faixa = faixaData(filtroData, dtDe, dtAte)
  const noPeriodo = linhas.filter(l => dentroFaixa(l.analisado_em, faixa))

  // ---- Resumo (o coracao da tela) — sempre dentro do período escolhido ----
  const total = noPeriodo.length
  const revisados = noPeriodo.filter(l => l.decisao_humana)
  const comparaveis = revisados.filter(l => l.veredito_maquina !== 'HUMANO')
  const concordaram = comparaveis.filter(l => classificar(l).concorda).length
  const taxa = comparaveis.length ? Math.round((concordaram / comparaveis.length) * 100) : 0
  const perigosos = comparaveis.filter(l => classificar(l).perigoso).length
  const inversos = comparaveis.filter(l => classificar(l).inverso).length
  const pediuHumano = noPeriodo.filter(l => l.veredito_maquina === 'HUMANO').length

  const visiveis = soComparaveis ? comparaveis : noPeriodo
  const fmt = (dt) => { if (!dt) return '—'; try { return new Date(dt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return dt } }

  const decisaoHumanaCel = (l) => {
    if (!l.decisao_humana) return <span style={{ color: '#64748b' }}>⏳ aguardando análise</span>
    if (l.decisao_humana === 'true') return <span style={s.badgeH('rgba(52,211,153,.14)', '#059669')}>✅ Apta (cliente)</span>
    return (<>
      <span style={s.badgeH('rgba(248,113,113,.14)', '#dc2626')}>⛔ Não cliente</span>
      {l.motivo_reprovacao ? <span style={{ color: '#5b6b84', fontSize: 12, marginLeft: 6 }}>{l.motivo_reprovacao}</span> : null}
    </>)
  }
  const bateuCel = (l) => {
    const c = classificar(l)
    if (c.estado === 'pendente') return <span style={{ color: '#64748b' }}>—</span>
    if (c.estado === 'deferiu') return <span title="máquina pediu análise humana — sem corte automático" style={{ color: '#5b6b84' }}>🔁 pediu humano</span>
    if (c.concorda) return <span title="máquina = humano">✅</span>
    return <span title={c.perigoso ? 'ERRO PERIGOSO: máquina deixaria passar não-cliente' : 'divergiu (inverso)'}>{c.perigoso ? '❌⚠️' : '❌'}</span>
  }

  return (
    <div>
      <div style={s.title}>🔬 Confere CNIS — máquina vs atendente</div>
      <div style={s.sub}>Auditoria da auto-análise (modo sombra). A decisão do humano vem do botão Aprovar/Reprovar CNIS do board — não precisa remarcar aqui. Quando a concordância estiver alta e os erros perigosos zerados por um período, liga-se o corte automático.</div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: '#5b6b84' }}>Analisados em:</span>
        {OPCOES_DATA.map(([v, lbl]) => (
          <button key={v} onClick={() => setFiltroData(v)}
            style={{ padding: '6px 12px', fontSize: 13, fontWeight: 500, borderRadius: 8, cursor: 'pointer', border: filtroData === v ? '0.5px solid #60a5fa' : '0.5px solid rgba(15,23,42,0.11)', background: filtroData === v ? '#60a5fa' : '#ffffff', color: filtroData === v ? '#232a37' : '#5b6b84' }}>
            {lbl}
          </button>
        ))}
        {filtroData === 'custom' && (<>
          <input type="date" value={dtDe} onChange={e => setDtDe(e.target.value)} style={{ padding: '5px 10px', fontSize: 13, borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.11)', background: '#ffffff', color: '#0f172a', colorScheme: 'light' }} />
          <input type="date" value={dtAte} onChange={e => setDtAte(e.target.value)} style={{ padding: '5px 10px', fontSize: 13, borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.11)', background: '#ffffff', color: '#0f172a', colorScheme: 'light' }} />
        </>)}
      </div>

      <div style={s.resumo}>
        <div style={s.kpi}><div style={s.kpiNum}>{total}</div><div style={s.kpiLbl}>Analisados pela máquina</div></div>
        <div style={s.kpi}><div style={s.kpiNum}>{revisados.length}</div><div style={s.kpiLbl}>Já decididos pelo humano</div></div>
        <div style={s.kpi}><div style={{ ...s.kpiNum, color: !comparaveis.length ? '#0f172a' : taxa >= 90 ? '#059669' : taxa >= 70 ? '#b45309' : '#dc2626' }}>{comparaveis.length ? `${taxa}%` : '—'}</div><div style={s.kpiLbl}>Concordância ({comparaveis.length} comparáveis)</div></div>
        <div style={s.kpiPerigo}><div style={{ ...s.kpiNum, color: '#dc2626' }}>{perigosos}</div><div style={{ ...s.kpiLbl, color: '#dc2626', fontWeight: 600 }}>⚠️ ERROS PERIGOSOS<br />(máq. deixaria passar não-cliente)</div></div>
        <div style={s.kpi}><div style={{ ...s.kpiNum, color: '#b45309' }}>{inversos}</div><div style={s.kpiLbl}>Erros inversos (menos grave)</div></div>
        <div style={s.kpi}><div style={{ ...s.kpiNum, color: '#5b6b84' }}>{pediuHumano}</div><div style={s.kpiLbl}>Máquina pediu humano</div></div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 12, color: '#5b6b84', cursor: 'pointer' }}>
          <input type="checkbox" checked={soComparaveis} onChange={e => setSoComparaveis(e.target.checked)} /> só os comparáveis (humano já decidiu e máquina não pediu humano)
        </label>
      </div>

      {loading ? <div style={{ color: '#5b6b84', fontSize: 13 }}>Carregando...</div> : (
        <table style={s.tabela}>
          <thead>
            <tr>
              <th style={s.th}>Cliente</th>
              <th style={s.th}>Nasc. bebê</th>
              <th style={s.th}>Veredito máquina</th>
              <th style={s.th}>Motivo da máquina</th>
              <th style={s.th}>Decisão do humano</th>
              <th style={s.th}>Bateu?</th>
              <th style={s.th}>CNIS</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && <tr><td style={s.td} colSpan={7}>Nada por aqui ainda.</td></tr>}
            {visiveis.map(l => {
              const c = classificar(l)
              return (
                <tr key={l.id} style={c.perigoso ? s.linhaPerigo : undefined}>
                  <td style={s.td}>{l.nome || 'Sem nome'}</td>
                  <td style={s.td}>{l.nasc_bebe || '—'}</td>
                  <td style={s.td}><span style={s.badge(l.veredito_maquina)}>{(MAP_V[l.veredito_maquina] || {}).label || l.veredito_maquina}</span></td>
                  <td style={{ ...s.td, maxWidth: 300, color: '#5b6b84' }}>{l.motivo_maquina || '—'}</td>
                  <td style={s.td}>{decisaoHumanaCel(l)}</td>
                  <td style={s.td}>{bateuCel(l)}</td>
                  <td style={s.td}>
                    {l.chatwoot_conversation_id
                      ? <a style={s.link} href={`${CHATWOOT_BASE}/app/accounts/${ACCOUNT}/conversations/${l.chatwoot_conversation_id}`} target="_blank" rel="noreferrer">abrir 💬</a>
                      : <span style={{ color: '#64748b', fontSize: 12 }}>—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>Atualiza sozinha a cada 60s. Mais recente no topo. Números e lista respeitam o período selecionado acima. Decisão do humano puxada do board (Aprovar/Reprovar CNIS).</div>
    </div>
  )
}
