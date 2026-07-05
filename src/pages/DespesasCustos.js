import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { Lancar, Recorrentes, Estilos } from './Financeiro'

// ============================================================
// DESPESAS & CUSTOS — a tela única da operação de saída
//   Contas (aprovar/pagar/excluir na linha) · Nova despesa · Recorrentes
//   Painel Financeiro = análise. Aqui = operação.
// ============================================================

const VERDE = '#3B6D11', VERMELHO = '#A32D2D', LARANJA = '#854F0B', AZUL = '#185FA5', ROXO = '#5B21B6'

const GRUPO_INFO = {
  folha: { label: 'Folha', cor: ROXO },
  comissao: { label: 'Comissão', cor: ROXO },
  fixo: { label: 'Fixo', cor: LARANJA },
  variavel: { label: 'Variável', cor: '#0F6E56' },
  marketing: { label: 'Marketing', cor: AZUL },
  imposto: { label: 'Imposto', cor: '#6b7280' },
  divida: { label: 'Dívida', cor: VERMELHO },
}
const STATUS_INFO = {
  aguardando_aprovacao: { label: 'Aguard. aprovação', bg: '#FAEEDA', cor: LARANJA },
  incompleto: { label: 'Incompleto (c/ solicitante)', bg: '#f3f4f6', cor: '#6b7280' },
  ajuste_solicitado: { label: 'Ajuste solicitado', bg: '#FAEEDA', cor: LARANJA },
  vencido: { label: 'Vencido', bg: '#FCEBEB', cor: VERMELHO },
  aprovado: { label: 'Aprovado (a pagar)', bg: '#E6F1FB', cor: AZUL },
  aguardando_pagamento: { label: 'Aguard. pagamento', bg: '#E6F1FB', cor: AZUL },
  pago: { label: 'Pago', bg: '#EAF3DE', cor: VERDE },
  recusado: { label: 'Recusado', bg: '#FCEBEB', cor: VERMELHO },
  cancelado: { label: 'Cancelado', bg: '#f3f4f6', cor: '#6b7280' },
}

const fmt = v => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dataBR = v => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—')
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export default function DespesasCustos() {
  const { profile } = useAuth()
  const [abaTela, setAbaTela] = useState('contas') // contas | nova | recorrentes
  const podeVer = profile && ['admin', 'financeiro'].includes(profile.role)

  if (!podeVer) {
    return <div style={{ padding: '3rem', textAlign: 'center', color: '#5F5E5A' }}>Acesso restrito à administração e ao financeiro.</div>
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 0 40px' }}>
      <style>{css}</style>
      <Estilos />
      <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111', margin: '0 0 2px' }}>📋 Despesas & Custos</h2>
      <div style={{ fontSize: 13, color: '#5F5E5A', marginBottom: 12 }}>
        Toda a saída num lugar: aprovar, pagar, excluir, lançar e gerir recorrentes.
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {[['contas', '📑 Contas'], ['nova', '➕ Nova despesa'], ['recorrentes', '🔁 Fixas & Recorrentes']].map(([k, l]) => (
          <button key={k} onClick={() => setAbaTela(k)} className="dc-aba" style={abaTela === k ? { background: '#111', color: '#fff', borderColor: '#111' } : undefined}>{l}</button>
        ))}
      </div>

      {abaTela === 'contas' && <Contas profile={profile} />}
      {abaTela === 'nova' && (
        <div className="fin-wrap" style={{ padding: 0 }}>
          <Lancar perfil={profile} onCriou={() => setAbaTela('contas')} />
        </div>
      )}
      {abaTela === 'recorrentes' && (
        <div className="fin-wrap" style={{ padding: 0 }}>
          <Recorrentes perfil={profile} />
        </div>
      )}
    </div>
  )
}

function Contas({ profile }) {
  const hoje = new Date()
  const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`
  const ehAdmin = profile.role === 'admin'

  const [linhas, setLinhas] = useState(null)
  const [erro, setErro] = useState('')
  const [mes, setMes] = useState(hoje.getMonth())
  const [ano, setAno] = useState(hoje.getFullYear())
  const [todosMeses, setTodosMeses] = useState(false)
  const [fStatus, setFStatus] = useState('')
  const [fGrupo, setFGrupo] = useState('')
  const [busca, setBusca] = useState('')
  const [aberta, setAberta] = useState(null)
  const [agindo, setAgindo] = useState(null)

  const carregar = useCallback(async () => {
    setErro('')
    let q = supabase.from('finance_requests').select('*')
      .neq('status', 'rascunho')
      .order('vencimento', { ascending: true, nullsFirst: false })
      .limit(1000)
    if (!todosMeses) {
      const comp = `${ano}-${String(mes + 1).padStart(2, '0')}-01`
      q = q.eq('competencia', comp)
    }
    const { data, error } = await q
    if (error) setErro(error.message)
    setLinhas(data || [])
  }, [mes, ano, todosMeses])

  useEffect(() => { carregar() }, [carregar])

  const filtradas = useMemo(() => {
    let l = linhas || []
    if (fStatus === 'atrasado') l = l.filter(r => r.status === 'vencido' || (r.vencimento && r.vencimento < hojeStr && !['pago', 'cancelado', 'recusado'].includes(r.status)))
    else if (fStatus) l = l.filter(r => r.status === fStatus)
    if (fGrupo) l = l.filter(r => r.tipo_gasto === fGrupo)
    if (busca.trim()) {
      const b = busca.trim().toLowerCase()
      l = l.filter(r =>
        (r.fornecedor_nome || '').toLowerCase().includes(b) ||
        (r.motivo || '').toLowerCase().includes(b) ||
        (r.solicitante_nome || '').toLowerCase().includes(b) ||
        (r.categoria || '').toLowerCase().includes(b))
    }
    return l
  }, [linhas, fStatus, fGrupo, busca, hojeStr])

  const kpis = useMemo(() => {
    const l = linhas || []
    const soma = arr => arr.reduce((s, r) => s + Number(r.valor || 0), 0)
    const vivas = l.filter(r => !['cancelado', 'recusado'].includes(r.status))
    const aprovacao = vivas.filter(r => ['aguardando_aprovacao', 'ajuste_solicitado', 'incompleto'].includes(r.status))
    const aPagar = vivas.filter(r => ['aprovado', 'aguardando_pagamento', 'vencido'].includes(r.status))
    const atrasadas = vivas.filter(r => r.status === 'vencido' || (r.status !== 'pago' && r.vencimento && r.vencimento < hojeStr))
    const pagas = vivas.filter(r => r.status === 'pago')
    return {
      aprovacao: soma(aprovacao), qAp: aprovacao.length,
      aPagar: soma(aPagar), qA: aPagar.length,
      atrasado: soma(atrasadas), qAtr: atrasadas.length,
      pago: soma(pagas), qP: pagas.length,
    }
  }, [linhas, hojeStr])

  async function rpc(nome, params, confirmMsg) {
    if (confirmMsg && !window.confirm(confirmMsg)) return
    setAgindo(params.p_id)
    const { error } = await supabase.rpc(nome, params)
    if (error) alert('Erro: ' + error.message)
    await carregar()
    setAgindo(null)
  }

  const aprovar = r => rpc('finance_aprovar', { p_id: r.id }, `Aprovar "${(r.motivo || '').slice(0, 50)}" — ${fmt(r.valor)}?`)
  const recusar = r => {
    const m = window.prompt('Motivo da recusa:')
    if (m === null) return
    rpc('finance_recusar', { p_id: r.id, p_motivo: m || 'Sem motivo informado' })
  }
  const ajuste = r => {
    const m = window.prompt('O que precisa ser ajustado?')
    if (m === null) return
    rpc('finance_solicitar_ajuste', { p_id: r.id, p_motivo: m || 'Ajuste solicitado' })
  }
  const pagar = r => rpc('finance_marcar_pago', { p_id: r.id, p_comprovante_url: null },
    `Marcar como PAGO: "${(r.motivo || r.fornecedor_nome || '').slice(0, 55)}" — ${fmt(r.valor)}?`)
  const excluir = async (r) => {
    if (!window.confirm(`EXCLUIR "${(r.motivo || r.fornecedor_nome || '').slice(0, 55)}" — ${fmt(r.valor)}?\nRemove o lançamento de vez (não afeta a recorrente-mãe).`)) return
    setAgindo(r.id)
    const { error } = await supabase.rpc('finance_excluir', { p_id: r.id })
    if (error) alert(error.message.includes('paga') ? 'Despesa paga não pode ser excluída — histórico protegido.' : 'Erro: ' + error.message)
    await carregar()
    setAgindo(null)
  }

  const anos = [hoje.getFullYear(), hoje.getFullYear() - 1]

  return (
    <>
      {/* KPIs */}
      <div className="dc-kpis">
        <div className="dc-kpi" style={{ borderTopColor: LARANJA }}>
          <span className="dc-kpi-t">Aguard. aprovação</span><b style={{ color: LARANJA }}>{fmt(kpis.aprovacao)}</b><span className="dc-kpi-s">{kpis.qAp} conta(s)</span>
        </div>
        <div className="dc-kpi" style={{ borderTopColor: AZUL }}>
          <span className="dc-kpi-t">A pagar</span><b>{fmt(kpis.aPagar)}</b><span className="dc-kpi-s">{kpis.qA} conta(s)</span>
        </div>
        <div className="dc-kpi" style={{ borderTopColor: VERMELHO, background: kpis.qAtr ? '#FFF5F5' : '#fff' }}>
          <span className="dc-kpi-t" style={{ color: VERMELHO }}>Atrasado</span>
          <b style={{ color: VERMELHO }}>{fmt(kpis.atrasado)}</b><span className="dc-kpi-s">{kpis.qAtr} conta(s)</span>
        </div>
        <div className="dc-kpi" style={{ borderTopColor: VERDE }}>
          <span className="dc-kpi-t">Pago</span><b style={{ color: VERDE }}>{fmt(kpis.pago)}</b><span className="dc-kpi-s">{kpis.qP} conta(s)</span>
        </div>
      </div>

      {/* Filtros */}
      <div className="dc-filtros">
        <select className="dc-in" value={todosMeses ? 'todos' : mes} onChange={e => {
          if (e.target.value === 'todos') setTodosMeses(true)
          else { setTodosMeses(false); setMes(Number(e.target.value)) }
        }}>
          {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
          <option value="todos">Todos os meses</option>
        </select>
        {!todosMeses && (
          <select className="dc-in" value={ano} onChange={e => setAno(Number(e.target.value))}>
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
        <select className="dc-in" value={fStatus} onChange={e => setFStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="atrasado">🔴 Atrasadas</option>
          <option value="aguardando_aprovacao">Aguardando aprovação</option>
          <option value="ajuste_solicitado">Ajuste solicitado</option>
          <option value="incompleto">Incompleto</option>
          <option value="vencido">Vencido</option>
          <option value="aprovado">Aprovadas (a pagar)</option>
          <option value="aguardando_pagamento">Aguardando pagamento</option>
          <option value="pago">Pagas</option>
          <option value="recusado">Recusadas</option>
          <option value="cancelado">Canceladas</option>
        </select>
        <select className="dc-in" value={fGrupo} onChange={e => setFGrupo(e.target.value)}>
          <option value="">Todas as categorias</option>
          {Object.entries(GRUPO_INFO).map(([k, g]) => <option key={k} value={k}>{g.label}</option>)}
        </select>
        <input className="dc-in" style={{ flex: 1, minWidth: 160 }} placeholder="Buscar fornecedor, descrição, quem lançou…"
          value={busca} onChange={e => setBusca(e.target.value)} />
      </div>

      {erro && <div style={{ background: '#FCEBEB', color: VERMELHO, padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 10 }}>{erro}</div>}

      {linhas === null ? <div className="dc-vazio">Carregando…</div>
        : filtradas.length === 0 ? <div className="dc-vazio">Nenhuma despesa nesse filtro. Use "➕ Nova despesa" pra lançar.</div>
        : (
          <div className="dc-tabela-wrap">
            <table className="dc-tabela">
              <thead>
                <tr>
                  <th>Vencimento</th><th>Descrição / Fornecedor</th><th>Lançado por</th>
                  <th>Categoria</th><th>Status</th><th style={{ textAlign: 'right' }}>Valor</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map(r => {
                  const atrasada = r.vencimento && r.vencimento < hojeStr && !['pago', 'cancelado', 'recusado'].includes(r.status)
                  const st = STATUS_INFO[r.status] || { label: r.status, bg: '#f3f4f6', cor: '#6b7280' }
                  const g = GRUPO_INFO[r.tipo_gasto]
                  const emAprovacao = r.status === 'aguardando_aprovacao'
                  const podePagar = ['aprovado', 'aguardando_pagamento', 'vencido'].includes(r.status)
                  const podeExcluir = r.status !== 'pago' && (ehAdmin || r.solicitante_id === profile.id)
                  const exp = aberta === r.id
                  const temLuna = r.analise_luna || r.risco_luna || r.recomendacao_luna
                  return (
                    <Frag key={r.id}>
                      <tr style={atrasada ? { background: '#FFF5F5' } : undefined}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <b style={{ color: atrasada ? VERMELHO : '#111' }}>{dataBR(r.vencimento)}</b>
                          {atrasada && <div style={{ fontSize: 10, color: VERMELHO, fontWeight: 700 }}>ATRASADA</div>}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: '#111' }}>{(r.motivo || '—').slice(0, 70)}</div>
                          <div style={{ fontSize: 11.5, color: '#6b7280' }}>
                            {r.fornecedor_nome || 'sem fornecedor'}
                            {r.recorrente_id ? ' · 🔁 recorrente' : ''}
                            {!r.possui_nota_fiscal && r.status !== 'pago' ? ' · sem NF' : ''}
                          </div>
                        </td>
                        <td style={{ fontSize: 12.5, color: '#374151' }}>{r.solicitante_nome || '—'}</td>
                        <td>
                          {g && (
                            <span className="dc-badge" style={{ background: `${g.cor}14`, color: g.cor }}>
                              {g.label}{r.tipo_gasto === 'marketing' && r.categoria ? ` · ${r.categoria}` : ''}
                            </span>
                          )}
                        </td>
                        <td><span className="dc-badge" style={{ background: st.bg, color: st.cor }}>{st.label}</span></td>
                        <td style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt(r.valor)}</td>
                        <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                          <button className="dc-btn" title="Detalhes" onClick={() => setAberta(exp ? null : r.id)}>{exp ? '▴' : '▾'}</button>
                          {emAprovacao && ehAdmin && (
                            <>
                              <button className="dc-btn dc-btn-ok" disabled={agindo === r.id} onClick={() => aprovar(r)}>✓ Aprovar</button>
                              <button className="dc-btn dc-btn-warn" disabled={agindo === r.id} onClick={() => ajuste(r)} title="Solicitar ajuste">⚠</button>
                              <button className="dc-btn dc-btn-del" disabled={agindo === r.id} onClick={() => recusar(r)} title="Recusar">✗</button>
                            </>
                          )}
                          {podePagar && <button className="dc-btn dc-btn-ok" disabled={agindo === r.id} onClick={() => pagar(r)}>✓ Pagar</button>}
                          {podeExcluir && <button className="dc-btn dc-btn-del" disabled={agindo === r.id} onClick={() => excluir(r)} title="Excluir">🗑</button>}
                        </td>
                      </tr>
                      {exp && (
                        <tr>
                          <td colSpan={7} style={{ background: '#FAFAF8', fontSize: 12.5, color: '#374151', padding: '10px 16px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '6px 18px' }}>
                              <span><b>Competência:</b> {r.competencia ? MESES[Number(String(r.competencia).slice(5, 7)) - 1] + '/' + String(r.competencia).slice(0, 4) : '—'}</span>
                              <span><b>Forma de pagamento:</b> {r.forma_pagamento || '—'}</span>
                              {r.chave_pix && <span><b>Chave PIX:</b> {r.chave_pix}</span>}
                              {r.boleto_linha_digitavel && <span><b>Boleto:</b> {r.boleto_linha_digitavel}</span>}
                              <span><b>Nota fiscal:</b> {r.possui_nota_fiscal ? 'Sim' : 'Não'}</span>
                              {r.aprovado_em && <span><b>Aprovada em:</b> {dataBR(r.aprovado_em)}</span>}
                              {r.pago_em && <span><b>Paga em:</b> {dataBR(r.pago_em)}</span>}
                              {r.comprovante_pagamento_url && <span><b>Comprovante:</b> <a href={r.comprovante_pagamento_url} target="_blank" rel="noreferrer">abrir</a></span>}
                              <span><b>Criada em:</b> {dataBR(r.criado_em)}</span>
                            </div>
                            {r.recusa_motivo && <div style={{ marginTop: 8, color: VERMELHO }}><b>Motivo da recusa:</b> {r.recusa_motivo}</div>}
                            {r.ajuste_motivo && <div style={{ marginTop: 8, color: LARANJA }}><b>Ajuste solicitado:</b> {r.ajuste_motivo}</div>}
                            {temLuna && (
                              <div style={{ marginTop: 10, background: '#F3F0FF', border: '1px solid #5B21B630', borderRadius: 8, padding: '8px 12px' }}>
                                <b style={{ color: ROXO }}>🤖 Análise da Luna</b>
                                {r.risco_luna && <span style={{ marginLeft: 8 }} className="dc-badge" >risco: {r.risco_luna}</span>}
                                {r.prioridade_luna && <span style={{ marginLeft: 6 }} className="dc-badge">prioridade: {r.prioridade_luna}</span>}
                                {r.analise_luna && <div style={{ marginTop: 4 }}>{r.analise_luna}</div>}
                                {r.recomendacao_luna && <div style={{ marginTop: 4 }}><b>Recomendação:</b> {r.recomendacao_luna}</div>}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Frag>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      <div style={{ fontSize: 11, color: '#9a9a96', marginTop: 10 }}>
        Despesa paga não pode ser excluída (histórico protegido). Recorrentes (🔁) são geradas automaticamente — pra parar uma, use a aba Fixas & Recorrentes.
      </div>
    </>
  )
}

function Frag({ children }) { return <>{children}</> }

const css = `
  .dc-aba{border:0.5px solid rgba(0,0,0,0.18);background:#fff;color:#374151;border-radius:20px;padding:7px 15px;font-size:13px;font-weight:600;cursor:pointer}
  .dc-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:14px}
  .dc-kpi{background:#fff;border:0.5px solid rgba(0,0,0,0.1);border-top:3px solid #ccc;border-radius:14px;padding:12px 16px;display:flex;flex-direction:column;gap:2px}
  .dc-kpi-t{font-size:11px;text-transform:uppercase;color:#6b7280;font-weight:700;letter-spacing:0.4px}
  .dc-kpi b{font-size:19px;font-variant-numeric:tabular-nums;color:#111}
  .dc-kpi-s{font-size:11px;color:#9ca3af}
  .dc-filtros{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
  .dc-in{padding:8px 10px;font-size:13px;border:0.5px solid rgba(0,0,0,0.18);border-radius:8px;background:#fff;color:#111;outline:none}
  .dc-tabela-wrap{background:#fff;border:0.5px solid rgba(0,0,0,0.1);border-radius:14px;overflow-x:auto}
  .dc-tabela{width:100%;border-collapse:collapse;font-size:13px}
  .dc-tabela th{text-align:left;padding:10px 12px;border-bottom:2px solid rgba(0,0,0,0.08);color:#6b7280;font-size:11px;text-transform:uppercase;white-space:nowrap}
  .dc-tabela td{padding:10px 12px;border-bottom:1px solid rgba(0,0,0,0.05);vertical-align:top}
  .dc-badge{font-size:11px;padding:3px 8px;border-radius:6px;font-weight:600;white-space:nowrap;background:#f3f4f6;color:#374151}
  .dc-btn{border:0.5px solid rgba(0,0,0,0.15);background:#fff;border-radius:8px;padding:5px 9px;font-size:12px;cursor:pointer;margin-left:5px;color:#374151}
  .dc-btn:hover{background:#f5f5f3}
  .dc-btn-ok{border-color:#3B6D11;color:#3B6D11;font-weight:600}
  .dc-btn-warn{border-color:#854F0B;color:#854F0B}
  .dc-btn-del{border-color:#A32D2D;color:#A32D2D}
  .dc-vazio{background:#fff;border:0.5px solid rgba(0,0,0,0.08);border-radius:14px;padding:26px;text-align:center;color:#888;font-size:13px}
  @media(max-width:720px){.dc-tabela th:nth-child(3),.dc-tabela td:nth-child(3){display:none}}
`
