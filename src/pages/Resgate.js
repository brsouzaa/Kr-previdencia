import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const MOTIVO_LABEL = {
  gravidez_4_meses: 'Gravidez 4+ meses',
  menor_idade: 'Menor de idade',
  nao_responde_advogado: 'Não responde o advogado',
  ja_tem_outro_advogado: 'Já tem outro advogado',
  pensou_outra_coisa: 'Pensou que era outra coisa',
  outro: 'Outro motivo',
}

const STATUS_STYLE = {
  em_andamento: { background: '#FFF8E7', color: '#854F0B', label: 'Em andamento' },
  recuperado: { background: '#EAF3DE', color: '#3B6D11', label: 'Recuperado' },
  realocado: { background: '#E6F1FB', color: '#185FA5', label: 'Realocado' },
  virou_reposicao: { background: '#F1EFE8', color: '#5F5E5A', label: 'Virou reposição' },
  perdido: { background: '#FCEBEB', color: '#A32D2D', label: 'Perdido' },
}

const s = {
  title: { fontSize: 20, fontWeight: 500, color: '#111', marginBottom: 4, letterSpacing: '-0.3px' },
  subtitle: { fontSize: 13, color: '#888', marginBottom: 20 },
  tabs: { display: 'flex', gap: 8, marginBottom: 20, borderBottom: '0.5px solid rgba(0,0,0,0.1)', flexWrap: 'wrap' },
  tab: { padding: '10px 16px', fontSize: 13, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', color: '#888', borderBottom: '2px solid transparent', marginBottom: -1 },
  tabActive: { color: '#0F6E56', borderBottomColor: '#0F6E56' },
  card: { background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: 10 },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap', gap: 8 },
  nome: { fontSize: 15, fontWeight: 500, color: '#111' },
  meta: { fontSize: 12, color: '#888', marginTop: 2 },
  status: { fontSize: 11, padding: '3px 10px', borderRadius: 10, fontWeight: 500 },
  motivoBox: { background: '#FBFAF7', border: '0.5px solid rgba(0,0,0,0.07)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 13, color: '#555' },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  btn: { padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: '0.5px solid' },
  btnRecup: { background: '#EAF3DE', color: '#3B6D11', borderColor: '#3B6D11' },
  btnRealoc: { background: '#E6F1FB', color: '#185FA5', borderColor: '#185FA5' },
  btnRepos: { background: '#F1EFE8', color: '#5F5E5A', borderColor: '#888' },
  empty: { textAlign: 'center', padding: '3rem 1rem', color: '#aaa', fontSize: 13 },
  loading: { textAlign: 'center', padding: '3rem', color: '#888', fontSize: 14 },
  metricRow: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 },
  metricCard: { background: '#FBFAF7', borderRadius: 10, padding: '0.85rem 1.1rem', minWidth: 130, border: '0.5px solid rgba(0,0,0,0.06)' },
  metricNum: { fontSize: 24, fontWeight: 600 },
  metricLabel: { fontSize: 11, color: '#9a9a96', marginTop: 2 },
}

export default function Resgate() {
  const { profile } = useAuth()
  const [aba, setAba] = useState('em_andamento')
  const [registros, setRegistros] = useState([])
  const [metricas, setMetricas] = useState(null)
  const [loading, setLoading] = useState(true)
  const [acao, setAcao] = useState(null)
  const [realocando, setRealocando] = useState(null) // resgate sendo realocado
  const [advBusca, setAdvBusca] = useState('')
  const [advLista, setAdvLista] = useState([])
  const [advSel, setAdvSel] = useState(null)

  const podeOperar = profile && (['admin', 'analista'].includes(profile.role) || profile.setor === 'resgate')

  const carregar = useCallback(async () => {
    setLoading(true)
    // fila de resgate (destino=resgate) por status da aba
    let query = supabase
      .from('resgates')
      .select(`*,
        cliente:clientes!resgates_cliente_id_fkey(id, nome, cpf, telefone, status),
        advogado_origem:advogados!resgates_advogado_origem_id_fkey(nome_completo),
        enviador:profiles!resgates_enviado_por_fkey(nome)
      `)
      .eq('destino', 'resgate')
      .order('created_at', { ascending: false })

    if (aba === 'em_andamento') query = query.eq('status', 'em_andamento')
    else if (aba === 'resolvidos') query = query.neq('status', 'em_andamento')

    const { data } = await query
    setRegistros(data || [])

    // métricas do mês corrente
    const agora = new Date()
    const { data: m } = await supabase
      .from('v_metricas_resgate')
      .select('*')
      .eq('ano', agora.getFullYear())
      .eq('mes', agora.getMonth() + 1)
      .maybeSingle()
    setMetricas(m || null)
    setLoading(false)
  }, [aba])

  useEffect(() => { if (podeOperar) carregar() }, [carregar, podeOperar])

  async function atualizarStatus(reg, novoStatus) {
    const labels = { recuperado: 'recuperado (voltou com o mesmo advogado)', virou_reposicao: 'virou reposição (resgate não deu)' }
    if (!window.confirm(`Marcar ${reg.cliente?.nome || 'cliente'} como ${labels[novoStatus]}?`)) return
    setAcao(reg.id)
    const { error } = await supabase.from('resgates').update({
      status: novoStatus,
      resgatador_id: profile.id,
      resolvido_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', reg.id)
    setAcao(null)
    if (error) { alert('Erro: ' + error.message); return }
    setRegistros(registros.filter(r => r.id !== reg.id))
    carregar()
  }

  // busca de advogado destino (pra realocação)
  useEffect(() => {
    if (!realocando || advBusca.trim().length < 3) { setAdvLista([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('advogados')
        .select('id, nome_completo, oab')
        .ilike('nome_completo', `%${advBusca}%`)
        .limit(10)
      setAdvLista(data || [])
    }, 300)
    return () => clearTimeout(t)
  }, [advBusca, realocando])

  async function confirmarRealocacao() {
    if (!advSel) { alert('Selecione o advogado com quem o cliente assinou'); return }
    setAcao(realocando.id)
    const { data, error } = await supabase.rpc('realocar_cliente', {
      p_resgate_id: realocando.id,
      p_novo_advogado_id: advSel.id,
      p_resgatador_id: profile.id,
    })
    setAcao(null)
    if (error) { alert('Erro: ' + error.message); return }
    const abatido = data?.abatido_inadimplencia || 0
    alert(`${realocando.cliente?.nome || 'Cliente'} realocado para ${advSel.nome_completo}.` +
      (abatido > 0 ? `\nR$ ${abatido.toLocaleString('pt-BR')} abatidos da inadimplência do advogado antigo.` : ''))
    setRegistros(registros.filter(r => r.id !== realocando.id))
    setRealocando(null); setAdvBusca(''); setAdvSel(null); setAdvLista([])
    carregar()
  }

  if (!podeOperar) {
    return <div style={s.empty}>Acesso restrito à equipe de resgate, analistas e admin.</div>
  }

  return (
    <div>
      <div style={s.title}>🛟 Ala de Resgate</div>
      <div style={s.subtitle}>Clientes em tratamento antes de virar reposição. Recupere ou realoque.</div>

      {metricas && (
        <div style={s.metricRow}>
          <div style={s.metricCard}>
            <div style={{ ...s.metricNum, color: '#854F0B' }}>{metricas.em_andamento || 0}</div>
            <div style={s.metricLabel}>em andamento</div>
          </div>
          <div style={s.metricCard}>
            <div style={{ ...s.metricNum, color: '#3B6D11' }}>{metricas.recuperados || 0}</div>
            <div style={s.metricLabel}>recuperados no mês</div>
          </div>
          <div style={s.metricCard}>
            <div style={{ ...s.metricNum, color: '#A32D2D' }}>{metricas.falharam || 0}</div>
            <div style={s.metricLabel}>viraram reposição</div>
          </div>
          <div style={s.metricCard}>
            <div style={{ ...s.metricNum, color: '#0F6E56' }}>{metricas.taxa_recuperacao_pct != null ? metricas.taxa_recuperacao_pct + '%' : '—'}</div>
            <div style={s.metricLabel}>taxa de recuperação</div>
          </div>
        </div>
      )}

      <div style={s.tabs}>
        <button style={{ ...s.tab, ...(aba === 'em_andamento' ? s.tabActive : {}) }} onClick={() => setAba('em_andamento')}>Em andamento</button>
        <button style={{ ...s.tab, ...(aba === 'resolvidos' ? s.tabActive : {}) }} onClick={() => setAba('resolvidos')}>Resolvidos</button>
      </div>

      {loading ? (
        <div style={s.loading}>Carregando…</div>
      ) : registros.length === 0 ? (
        <div style={s.empty}>{aba === 'em_andamento' ? 'Nenhum cliente em resgate agora.' : 'Nenhum resgate resolvido ainda.'}</div>
      ) : (
        registros.map(reg => {
          const st = STATUS_STYLE[reg.status] || STATUS_STYLE.em_andamento
          return (
            <div key={reg.id} style={s.card}>
              <div style={s.cardHeader}>
                <div>
                  <div style={s.nome}>{reg.cliente?.nome || '—'}</div>
                  <div style={s.meta}>
                    {reg.cliente?.telefone || 'sem telefone'} · advogado: {reg.advogado_origem?.nome_completo || '—'}
                  </div>
                  <div style={s.meta}>enviado por {reg.enviador?.nome || '—'} · {new Date(reg.created_at).toLocaleDateString('pt-BR')}</div>
                </div>
                <span style={{ ...s.status, background: st.background, color: st.color }}>{st.label}</span>
              </div>

              <div style={s.motivoBox}>
                Motivo: {MOTIVO_LABEL[reg.motivo] || reg.motivo}
                {reg.motivo === 'outro' && reg.motivo_livre ? ` — "${reg.motivo_livre}"` : ''}
              </div>

              {reg.status === 'em_andamento' && realocando?.id !== reg.id && (
                <div style={s.actions}>
                  <button style={{ ...s.btn, ...s.btnRecup }} disabled={acao === reg.id} onClick={() => atualizarStatus(reg, 'recuperado')}>✓ Recuperado</button>
                  <button style={{ ...s.btn, ...s.btnRealoc }} disabled={acao === reg.id} onClick={() => { setRealocando(reg); setAdvBusca(''); setAdvSel(null); setAdvLista([]) }}>↔ Realocado p/ outro advogado</button>
                  <button style={{ ...s.btn, ...s.btnRepos }} disabled={acao === reg.id} onClick={() => atualizarStatus(reg, 'virou_reposicao')}>→ Virou reposição</button>
                </div>
              )}

              {reg.status === 'em_andamento' && realocando?.id === reg.id && (
                <div style={{ background: '#F4F8FC', border: '0.5px solid #185FA530', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 12, color: '#185FA5', fontWeight: 500, marginBottom: 6 }}>Com qual advogado o cliente assinou?</div>
                  {!advSel && (
                    <>
                      <input style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 8, marginBottom: 8, boxSizing: 'border-box' }}
                        value={advBusca} onChange={e => setAdvBusca(e.target.value)} placeholder="Buscar advogado (3+ letras)…" autoFocus />
                      {advLista.map(a => (
                        <div key={a.id} onClick={() => setAdvSel(a)} style={{ padding: '7px 10px', borderRadius: 6, cursor: 'pointer', border: '0.5px solid rgba(0,0,0,0.08)', marginBottom: 5, fontSize: 13 }}>
                          {a.nome_completo}{a.oab ? ` · OAB ${a.oab}` : ''}
                        </div>
                      ))}
                    </>
                  )}
                  {advSel && <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>→ {advSel.nome_completo}</div>}
                  <div style={s.actions}>
                    <button style={{ ...s.btn, ...s.btnRealoc }} disabled={acao === reg.id || !advSel} onClick={confirmarRealocacao}>Confirmar realocação</button>
                    <button style={{ ...s.btn, background: '#f3f3f3', color: '#666', borderColor: '#ccc' }} onClick={() => { setRealocando(null); setAdvSel(null); setAdvBusca('') }}>Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
