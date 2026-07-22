import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Tela TEMPORARIA de auditoria: compara o veredito da maquina (auto-analise CNIS, modo sombra)
// com a DECISAO REAL do humano — cnis_aprovado, o botao Aprovar/Reprovar CNIS do board retroativo.
// Sem remarcacao: o historico se constroi sozinho do trabalho normal da atendente.
// Quando a concordancia estiver alta e os erros perigosos zerados por um periodo, liga-se o corte automatico.

const CHATWOOT_BASE = 'https://crm.vendeaitecnologia.com.br'
const ACCOUNT = '8918'

const MAP_V = {
  APTA: { label: 'Apta', cor: '#256B2E', bg: '#DFF3E0' },
  NAO_CLIENTE: { label: 'Não cliente', cor: '#A32D2D', bg: '#FEECEC' },
  APTA_CONFERIR_GERID: { label: 'Apta · conferir GERID', cor: '#8A6100', bg: '#FFF3D6' },
  HUMANO: { label: 'Humano', cor: '#555555', bg: '#ECECEC' },
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
  title: { fontSize: 20, fontWeight: 500, color: '#111', marginBottom: 4 },
  sub: { fontSize: 13, color: '#888', marginBottom: 16 },
  resumo: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 },
  kpi: { background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: '12px 16px', minWidth: 128 },
  kpiNum: { fontSize: 22, fontWeight: 700, color: '#111' },
  kpiLbl: { fontSize: 11, color: '#888', marginTop: 2 },
  kpiPerigo: { background: '#FEECEC', border: '1.5px solid #A32D2D', borderRadius: 12, padding: '12px 16px', minWidth: 128 },
  tabela: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 12, overflow: 'hidden', border: '0.5px solid rgba(0,0,0,0.1)' },
  th: { textAlign: 'left', fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase', padding: '10px 12px', borderBottom: '1px solid rgba(0,0,0,0.08)', background: '#F8FAFC' },
  td: { fontSize: 13, color: '#222', padding: '10px 12px', borderBottom: '0.5px solid rgba(0,0,0,0.06)', verticalAlign: 'middle' },
  badge: (v) => ({ display: 'inline-block', padding: '3px 9px', borderRadius: 8, fontSize: 12, fontWeight: 600, color: (MAP_V[v] || {}).cor || '#555', background: (MAP_V[v] || {}).bg || '#eee' }),
  badgeH: (bg, cor) => ({ display: 'inline-block', padding: '3px 9px', borderRadius: 8, fontSize: 12, fontWeight: 600, color: cor, background: bg }),
  link: { fontSize: 12, color: '#185FA5', textDecoration: 'none', fontWeight: 500 },
  linhaPerigo: { background: '#FEF6F6' },
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
    if (!l.decisao_humana) return <span style={{ color: '#bbb' }}>⏳ aguardando análise</span>
    if (l.decisao_humana === 'true') return <span style={s.badgeH('#DFF3E0', '#256B2E')}>✅ Apta (cliente)</span>
    return <span style={s.badgeH('#FEECEC', '#A32D2D')}>⛔ Não cliente{l.motivo_reprovacao ? ` · ${l.motivo_reprovacao}` : ''}</span>
  }
  const bateuCel = (l) => {
    const c = classificar(l)
    if (c.estado === 'pendente') return <span style={{ color: '#bbb' }}>—</span>
    if (c.estado === 'deferiu') return <span title="máquina pediu análise humana — sem corte automático" style={{ color: '#888' }}>🔁 pediu humano</span>
    if (c.concorda) return <span title="máquina = humano">✅</span>
    return <span title={c.perigoso ? 'ERRO PERIGOSO: máquina deixaria passar não-cliente' : 'divergiu (inverso)'}>{c.perigoso ? '❌⚠️' : '❌'}</span>
  }

  return (
    <div>
      <div style={s.title}>🔬 Confere CNIS — máquina vs atendente</div>
      <div style={s.sub}>Auditoria da auto-análise (modo sombra). A decisão do humano vem do botão Aprovar/Reprovar CNIS do board — não precisa remarcar aqui. Quando a concordância estiver alta e os erros perigosos zerados por um período, liga-se o corte automático.</div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: '#888' }}>Analisados em:</span>
        {OPCOES_DATA.map(([v, lbl]) => (
          <button key={v} onClick={() => setFiltroData(v)}
            style={{ padding: '6px 12px', fontSize: 13, fontWeight: 500, borderRadius: 8, cursor: 'pointer', border: filtroData === v ? '0.5px solid #185FA5' : '0.5px solid rgba(0,0,0,0.15)', background: filtroData === v ? '#185FA5' : '#fff', color: filtroData === v ? '#fff' : '#666' }}>
            {lbl}
          </button>
        ))}
        {filtroData === 'custom' && (<>
          <input type="date" value={dtDe} onChange={e => setDtDe(e.target.value)} style={{ padding: '5px 10px', fontSize: 13, borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)' }} />
          <input type="date" value={dtAte} onChange={e => setDtAte(e.target.value)} style={{ padding: '5px 10px', fontSize: 13, borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)' }} />
        </>)}
      </div>

      <div style={s.resumo}>
        <div style={s.kpi}><div style={s.kpiNum}>{total}</div><div style={s.kpiLbl}>Analisados pela máquina</div></div>
        <div style={s.kpi}><div style={s.kpiNum}>{revisados.length}</div><div style={s.kpiLbl}>Já decididos pelo humano</div></div>
        <div style={s.kpi}><div style={{ ...s.kpiNum, color: !comparaveis.length ? '#111' : taxa >= 90 ? '#256B2E' : taxa >= 70 ? '#8A6100' : '#A32D2D' }}>{comparaveis.length ? `${taxa}%` : '—'}</div><div style={s.kpiLbl}>Concordância ({comparaveis.length} comparáveis)</div></div>
        <div style={s.kpiPerigo}><div style={{ ...s.kpiNum, color: '#A32D2D' }}>{perigosos}</div><div style={{ ...s.kpiLbl, color: '#A32D2D', fontWeight: 600 }}>⚠️ ERROS PERIGOSOS<br />(máq. deixaria passar não-cliente)</div></div>
        <div style={s.kpi}><div style={{ ...s.kpiNum, color: '#8A6100' }}>{inversos}</div><div style={s.kpiLbl}>Erros inversos (menos grave)</div></div>
        <div style={s.kpi}><div style={{ ...s.kpiNum, color: '#555' }}>{pediuHumano}</div><div style={s.kpiLbl}>Máquina pediu humano</div></div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 12, color: '#666', cursor: 'pointer' }}>
          <input type="checkbox" checked={soComparaveis} onChange={e => setSoComparaveis(e.target.checked)} /> só os comparáveis (humano já decidiu e máquina não pediu humano)
        </label>
      </div>

      {loading ? <div style={{ color: '#888', fontSize: 13 }}>Carregando...</div> : (
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
                  <td style={{ ...s.td, maxWidth: 300, color: '#555' }}>{l.motivo_maquina || '—'}</td>
                  <td style={s.td}>{decisaoHumanaCel(l)}</td>
                  <td style={s.td}>{bateuCel(l)}</td>
                  <td style={s.td}>
                    {l.chatwoot_conversation_id
                      ? <a style={s.link} href={`${CHATWOOT_BASE}/app/accounts/${ACCOUNT}/conversations/${l.chatwoot_conversation_id}`} target="_blank" rel="noreferrer">abrir 💬</a>
                      : <span style={{ color: '#bbb', fontSize: 12 }}>—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>Atualiza sozinha a cada 60s. Mais recente no topo. Números e lista respeitam o período selecionado acima. Decisão do humano puxada do board (Aprovar/Reprovar CNIS).</div>
    </div>
  )
}
