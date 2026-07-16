import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const KAROL_ID = '1c9e99ee-02c4-4500-9dd5-9706f95d0ee9'

const s = {
  wrap: { padding: 16, maxWidth: 1100, margin: '0 auto' },
  h1: { fontSize: 20, fontWeight: 600, marginBottom: 4 },
  sub: { fontSize: 13, color: '#666', marginBottom: 16 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 18 },
  kpi: { border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '10px 12px', background: '#fff' },
  kpiTop: { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 500, marginBottom: 6, color: '#888' },
  kpiNum: { fontSize: 24, fontWeight: 600, lineHeight: 1 },
  kpiSub: { fontSize: 11, color: '#888', marginTop: 4 },
  abas: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 },
  aba: (on) => ({ padding: '7px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid ' + (on ? '#7c3aed' : 'rgba(0,0,0,0.12)'), background: on ? '#7c3aed' : '#fff', color: on ? '#fff' : '#444' }),
  card: { border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: 14, marginBottom: 10, background: '#fff' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  nome: { fontSize: 15, fontWeight: 600 },
  meta: { fontSize: 12, color: '#666', marginTop: 2 },
  selo: { display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', color: '#fff', background: '#7c3aed', borderRadius: 6, padding: '2px 8px', marginBottom: 6 },
  dias: (alto) => ({ fontSize: 12, fontWeight: 600, color: alto ? '#b91c1c' : '#555', background: alto ? '#fee2e2' : '#f3f4f6', borderRadius: 6, padding: '2px 8px', whiteSpace: 'nowrap' }),
  btn: { padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none', background: '#7c3aed', color: '#fff', marginRight: 6, marginTop: 8 },
  btnG: { padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid rgba(0,0,0,0.15)', background: '#fff', color: '#444', marginRight: 6, marginTop: 8 },
  form: { marginTop: 10, padding: 12, background: '#faf9ff', borderRadius: 8, border: '1px solid #ece9fb' },
  label: { fontSize: 12, fontWeight: 500, color: '#555', display: 'block', marginBottom: 3, marginTop: 8 },
  input: { width: '100%', padding: '7px 9px', borderRadius: 7, border: '1px solid rgba(0,0,0,0.15)', fontSize: 13, boxSizing: 'border-box' },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  empty: { textAlign: 'center', color: '#999', padding: 30, fontSize: 14 },
  finBox: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 10, marginBottom: 18, padding: 14, background: 'linear-gradient(135deg,#f5f3ff,#faf9ff)', borderRadius: 12, border: '1px solid #ece9fb' },
}

// as 8 etapas confirmadas (ordem do fluxo)
const ETAPAS = [
  { key: 'aguardando_protocolo', label: 'Aguard. protocolo', cor: '#6b7280' },
  { key: 'protocolado', label: 'Protocolado', cor: '#2563eb' },
  { key: 'em_analise_inss', label: 'Análise INSS', cor: '#0891b2' },
  { key: 'concedido', label: 'Concedido', cor: '#16a34a' },
  { key: 'negado', label: 'Negado', cor: '#dc2626' },
  { key: 'aguardando_pagamento', label: 'Aguard. pagamento', cor: '#d97706' },
  { key: 'pago', label: 'Pago', cor: '#059669' },
  { key: 'barrado', label: 'Barrado', cor: '#991b1b' },
]
const etapaInfo = (k) => ETAPAS.find(e => e.key === k) || ETAPAS[0]

const brl = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const diasDesde = (iso) => {
  if (!iso) return 0
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}
const fmtData = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

export default function AcompanhamentoMae() {
  const { profile } = useAuth()
  const ehKarolOuAdmin = profile?.id === KAROL_ID || profile?.role === 'admin'

  const [aba, setAba] = useState('ativos')       // ativos | aguardando_protocolo | protocolado | ... | na_sthefany | cadastrar
  const [itens, setItens] = useState([])
  const [naSthefany, setNaSthefany] = useState([])
  const [resumo, setResumo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(null)
  const [formAberto, setFormAberto] = useState(null)
  const [f, setF] = useState({})               // campos do form aberto
  const [arquivo, setArquivo] = useState(null)
  const [uploadando, setUploadando] = useState(false)

  // cadastro manual
  const [busca, setBusca] = useState('')
  const [achados, setAchados] = useState([])
  const [buscando, setBuscando] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    // acompanhamentos + dados do cliente
    const { data: ac } = await supabase
      .from('acompanhamento_mae')
      .select('*, cliente:clientes(id, nome, cpf, telefone, produto)')
      .order('entrou_etapa_em', { ascending: true })
    setItens(ac || [])

    // Mae que estao "em validacao" na Sthefany (so leitura pra Karol acompanhar)
    const { data: sth } = await supabase
      .from('clientes')
      .select('id, nome, cpf, status, updated_at')
      .eq('produto', 'Maternidade Mãe')
      .in('status', ['aguardando_pos_venda', 'em_contato_pos_venda', 'em_validacao'])
      .order('updated_at', { ascending: true })
    setNaSthefany(sth || [])

    const { data: r } = await supabase.rpc('acompanhamento_mae_resumo')
    setResumo(r || null)
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const abrirForm = (item, tipo) => {
    setFormAberto(formAberto === item.id + tipo ? null : item.id + tipo)
    setF({
      numero_protocolo: item.numero_protocolo || '',
      data_protocolo: item.data_protocolo || '',
      data_concessao: item.data_concessao || '',
      data_cai_conta: item.data_cai_conta || '',
      motivo_negado: item.motivo_negado || '',
      ticket_valor: item.ticket_valor || 2400,
      data_pagamento: item.data_pagamento || '',
      observacao: item.observacao || '',
    })
    setArquivo(null)
  }

  const salvarEtapa = async (item, novaEtapa, extra = {}) => {
    setSalvando(item.id)
    const payload = { etapa: novaEtapa, ...extra }
    const { error } = await supabase.from('acompanhamento_mae').update(payload).eq('id', item.id)
    setSalvando(null)
    if (error) { alert('Erro: ' + error.message); return }
    setFormAberto(null)
    carregar()
  }

  // protocolar: exige numero + data
  const protocolar = async (item) => {
    if (!f.numero_protocolo || !f.data_protocolo) { alert('Preencha número e data do protocolo'); return }
    await salvarEtapa(item, 'protocolado', { numero_protocolo: f.numero_protocolo, data_protocolo: f.data_protocolo, observacao: f.observacao || null })
  }
  const conceder = async (item) => {
    if (!f.data_concessao) { alert('Informe a data da concessão'); return }
    await salvarEtapa(item, 'concedido', { data_concessao: f.data_concessao, data_cai_conta: f.data_cai_conta || null, observacao: f.observacao || null })
  }
  const negar = async (item) => {
    if (!f.motivo_negado) { alert('Informe o motivo'); return }
    await salvarEtapa(item, 'negado', { motivo_negado: f.motivo_negado, observacao: f.observacao || null })
  }

  // pagamento: sobe comprovante (igual as meninas dos advogados) e marca pago -> financeiro
  const registrarPagamento = async (item) => {
    if (!arquivo) { alert('Anexe o comprovante de pagamento'); return }
    if (!f.data_pagamento) { alert('Informe a data do pagamento'); return }
    setUploadando(true)
    let comprovante_url = null, comprovante_nome = null
    try {
      const ext = arquivo.name.split('.').pop().toLowerCase()
      const nome = `${item.cliente_id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error: eUp } = await supabase.storage.from('comprovantes-mae').upload(nome, arquivo)
      if (eUp) throw new Error(eUp.message)
      comprovante_url = nome
      comprovante_nome = arquivo.name
    } catch (e) {
      setUploadando(false); alert('Erro ao subir comprovante: ' + (e.message || e)); return
    }
    setUploadando(false)
    await salvarEtapa(item, 'pago', {
      cliente_pagou: true,
      ticket_valor: Number(f.ticket_valor) || 2400,
      data_pagamento: f.data_pagamento,
      comprovante_url, comprovante_nome,
      enviado_financeiro: true,
      observacao: f.observacao || null,
    })
  }

  // cadastro manual: busca Mae ja existente no CRM que ainda nao esta no acompanhamento
  const buscarClientes = async () => {
    if (busca.trim().length < 3) { alert('Digite ao menos 3 letras ou o CPF'); return }
    setBuscando(true)
    const termo = busca.trim()
    const soDigitos = termo.replace(/\D/g, '')
    let q = supabase.from('clientes').select('id, nome, cpf, status, produto').eq('produto', 'Maternidade Mãe').limit(20)
    q = soDigitos.length >= 3 ? q.ilike('cpf', `%${soDigitos}%`) : q.ilike('nome', `%${termo}%`)
    const { data } = await q
    // remove os que ja estao no acompanhamento
    const idsJa = new Set(itens.map(i => i.cliente_id))
    setAchados((data || []).filter(c => !idsJa.has(c.id)))
    setBuscando(false)
  }
  const adicionarManual = async (cliente) => {
    setSalvando(cliente.id)
    const { error } = await supabase.from('acompanhamento_mae')
      .insert({ cliente_id: cliente.id, etapa: 'aguardando_protocolo', responsavel_id: KAROL_ID })
    setSalvando(null)
    if (error) { alert(error.message.includes('duplicate') ? 'Cliente já está no acompanhamento' : 'Erro: ' + error.message); return }
    setAchados(achados.filter(c => c.id !== cliente.id))
    carregar()
  }

  const fin = resumo?.financeiro || {}
  const porEtapa = resumo?.por_etapa || {}

  // filtro da aba
  const ativos = itens.filter(i => !['pago', 'negado', 'barrado'].includes(i.etapa))
  const listaAba = aba === 'ativos' ? ativos
    : ETAPAS.some(e => e.key === aba) ? itens.filter(i => i.etapa === aba)
    : []

  return (
    <div style={s.wrap}>
      <div style={s.h1}>🍼 Acompanhamento Maternidade Mãe</div>
      <div style={s.sub}>Protocolo → concessão → pagamento. Ticket padrão {brl(2400)} (editável).</div>

      {/* PAINEL FINANCEIRO PROJETADO */}
      <div style={s.finBox}>
        <div><div style={s.kpiTop}>Já recebido</div><div style={{ ...s.kpiNum, color: '#059669' }}>{brl(fin.ja_recebido)}</div><div style={s.kpiSub}>pagos + comprovante</div></div>
        <div><div style={s.kpiTop}>A receber (concedidos)</div><div style={{ ...s.kpiNum, color: '#d97706' }}>{brl(fin.a_receber_concedidos)}</div><div style={s.kpiSub}>concedido, não pago</div></div>
        <div><div style={s.kpiTop}>Potencial em análise</div><div style={{ ...s.kpiNum, color: '#6b7280' }}>{brl(fin.potencial_em_analise)}</div><div style={s.kpiSub}>ainda no INSS</div></div>
      </div>

      {/* KPIs OPERACIONAIS */}
      <div style={s.kpis}>
        <div style={s.kpi}><div style={s.kpiTop}>Taxa de concessão</div><div style={s.kpiNum}>{resumo?.taxa_concessao != null ? resumo.taxa_concessao + '%' : '—'}</div><div style={s.kpiSub}>{resumo?.concedidos || 0} de {resumo?.decididos || 0} decididos</div></div>
        <div style={s.kpi}><div style={s.kpiTop}>Tempo médio concessão</div><div style={s.kpiNum}>{resumo?.tempo_medio_concessao_dias != null ? resumo.tempo_medio_concessao_dias : '—'}</div><div style={s.kpiSub}>dias (protocolo→concessão)</div></div>
        <div style={s.kpi}><div style={s.kpiTop}>Taxa de pagamento</div><div style={s.kpiNum}>{resumo?.taxa_pagamento != null ? resumo.taxa_pagamento + '%' : '—'}</div><div style={s.kpiSub}>{resumo?.pagos || 0} de {resumo?.concedidos || 0} concedidos</div></div>
        <div style={s.kpi}><div style={s.kpiTop}>Total no setor</div><div style={s.kpiNum}>{resumo?.total || 0}</div><div style={s.kpiSub}>clientes Mãe</div></div>
      </div>

      {/* ABAS */}
      <div style={s.abas}>
        <div style={s.aba(aba === 'ativos')} onClick={() => setAba('ativos')}>Ativos ({ativos.length})</div>
        {ETAPAS.map(e => (
          <div key={e.key} style={s.aba(aba === e.key)} onClick={() => setAba(e.key)}>{e.label} ({porEtapa[e.key] || 0})</div>
        ))}
        <div style={s.aba(aba === 'na_sthefany')} onClick={() => setAba('na_sthefany')}>Em validação (Sthefany) ({naSthefany.length})</div>
        {ehKarolOuAdmin && <div style={s.aba(aba === 'cadastrar')} onClick={() => setAba('cadastrar')}>+ Cadastrar</div>}
      </div>

      {loading && <div style={s.empty}>Carregando…</div>}

      {/* ABA: EM VALIDACAO NA STHEFANY (so leitura) */}
      {!loading && aba === 'na_sthefany' && (
        <div>
          <div style={s.sub}>Maternidade Mãe que ainda estão no pós-venda / validação administrativa. Entram aqui automaticamente quando a Sthefany validar.</div>
          {naSthefany.length === 0 && <div style={s.empty}>Nenhum Mãe em validação agora.</div>}
          {naSthefany.map(c => (
            <div key={c.id} style={s.card}>
              <div style={s.selo}>MATERNIDADE MÃE</div>
              <div style={s.nome}>{c.nome}</div>
              <div style={s.meta}>CPF {c.cpf} · status: {c.status} · há {diasDesde(c.updated_at)} dias</div>
            </div>
          ))}
        </div>
      )}

      {/* ABA: CADASTRAR MANUAL */}
      {!loading && aba === 'cadastrar' && ehKarolOuAdmin && (
        <div style={s.card}>
          <div style={s.nome}>Adicionar cliente Mãe existente</div>
          <div style={s.meta}>Busca clientes Maternidade Mãe já cadastrados no CRM para trazer ao acompanhamento.</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input style={s.input} placeholder="Nome ou CPF" value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscarClientes()} />
            <button style={s.btn} onClick={buscarClientes} disabled={buscando}>{buscando ? '...' : 'Buscar'}</button>
          </div>
          {achados.map(c => (
            <div key={c.id} style={{ ...s.card, marginTop: 10 }}>
              <div style={s.cardTop}>
                <div><div style={s.nome}>{c.nome}</div><div style={s.meta}>CPF {c.cpf} · {c.status}</div></div>
                <button style={s.btn} onClick={() => adicionarManual(c)} disabled={salvando === c.id}>{salvando === c.id ? '...' : '+ Adicionar'}</button>
              </div>
            </div>
          ))}
          {busca && !buscando && achados.length === 0 && <div style={s.empty}>Nenhum Mãe encontrado (ou já estão no acompanhamento).</div>}
        </div>
      )}

      {/* ABAS DE FILA (ativos ou por etapa) */}
      {!loading && (aba === 'ativos' || ETAPAS.some(e => e.key === aba)) && (
        <div>
          {listaAba.length === 0 && <div style={s.empty}>Nenhum cliente nesta etapa.</div>}
          {listaAba.map(item => {
            const ei = etapaInfo(item.etapa)
            const dias = diasDesde(item.entrou_etapa_em)
            const cli = item.cliente || {}
            const podeAgir = ehKarolOuAdmin
            return (
              <div key={item.id} style={s.card}>
                <div style={s.cardTop}>
                  <div>
                    <div style={s.selo}>MATERNIDADE MÃE</div>
                    <div style={s.nome}>{cli.nome || '—'}</div>
                    <div style={s.meta}>CPF {cli.cpf || '—'} · {cli.telefone || ''}</div>
                    <div style={s.meta}>
                      Etapa: <strong style={{ color: ei.cor }}>{ei.label}</strong>
                      {item.numero_protocolo && ` · protocolo ${item.numero_protocolo}`}
                      {item.data_protocolo && ` · protocolado ${fmtData(item.data_protocolo)}`}
                      {item.data_concessao && ` · concedido ${fmtData(item.data_concessao)}`}
                      {item.data_cai_conta && ` · cai na conta ${fmtData(item.data_cai_conta)}`}
                      {item.motivo_negado && ` · negado: ${item.motivo_negado}`}
                    </div>
                  </div>
                  <div style={s.dias(dias >= 30)}>{dias}d nesta etapa</div>
                </div>

                {/* ACOES por etapa (so Karol/admin) */}
                {podeAgir && item.etapa === 'aguardando_protocolo' && (
                  <div>
                    <button style={s.btn} onClick={() => abrirForm(item, 'prot')}>Registrar protocolo</button>
                    <button style={s.btnG} onClick={() => salvarEtapa(item, 'barrado')}>Barrar</button>
                    {formAberto === item.id + 'prot' && (
                      <div style={s.form}>
                        <label style={s.label}>Nº do protocolo</label>
                        <input style={s.input} value={f.numero_protocolo} onChange={e => setF({ ...f, numero_protocolo: e.target.value })} />
                        <label style={s.label}>Data do protocolo</label>
                        <input type="date" style={s.input} value={f.data_protocolo} onChange={e => setF({ ...f, data_protocolo: e.target.value })} />
                        <button style={s.btn} onClick={() => protocolar(item)} disabled={salvando === item.id}>Salvar protocolo</button>
                      </div>
                    )}
                  </div>
                )}

                {podeAgir && item.etapa === 'protocolado' && (
                  <div>
                    <button style={s.btn} onClick={() => salvarEtapa(item, 'em_analise_inss')}>→ Em análise INSS</button>
                    <button style={s.btnG} onClick={() => abrirForm(item, 'conc')}>Concedido</button>
                    <button style={s.btnG} onClick={() => abrirForm(item, 'neg')}>Negado</button>
                    {formAberto === item.id + 'conc' && (
                      <div style={s.form}>
                        <div style={s.row2}>
                          <div><label style={s.label}>Data da concessão</label><input type="date" style={s.input} value={f.data_concessao} onChange={e => setF({ ...f, data_concessao: e.target.value })} /></div>
                          <div><label style={s.label}>Data que cai na conta</label><input type="date" style={s.input} value={f.data_cai_conta} onChange={e => setF({ ...f, data_cai_conta: e.target.value })} /></div>
                        </div>
                        <button style={s.btn} onClick={() => conceder(item)} disabled={salvando === item.id}>Salvar concessão</button>
                      </div>
                    )}
                    {formAberto === item.id + 'neg' && (
                      <div style={s.form}>
                        <label style={s.label}>Motivo da negativa</label>
                        <input style={s.input} value={f.motivo_negado} onChange={e => setF({ ...f, motivo_negado: e.target.value })} />
                        <button style={s.btn} onClick={() => negar(item)} disabled={salvando === item.id}>Salvar negativa</button>
                      </div>
                    )}
                  </div>
                )}

                {podeAgir && item.etapa === 'em_analise_inss' && (
                  <div>
                    <button style={s.btn} onClick={() => abrirForm(item, 'conc')}>Concedido</button>
                    <button style={s.btnG} onClick={() => abrirForm(item, 'neg')}>Negado</button>
                    {formAberto === item.id + 'conc' && (
                      <div style={s.form}>
                        <div style={s.row2}>
                          <div><label style={s.label}>Data da concessão</label><input type="date" style={s.input} value={f.data_concessao} onChange={e => setF({ ...f, data_concessao: e.target.value })} /></div>
                          <div><label style={s.label}>Data que cai na conta</label><input type="date" style={s.input} value={f.data_cai_conta} onChange={e => setF({ ...f, data_cai_conta: e.target.value })} /></div>
                        </div>
                        <button style={s.btn} onClick={() => conceder(item)} disabled={salvando === item.id}>Salvar concessão</button>
                      </div>
                    )}
                    {formAberto === item.id + 'neg' && (
                      <div style={s.form}>
                        <label style={s.label}>Motivo da negativa</label>
                        <input style={s.input} value={f.motivo_negado} onChange={e => setF({ ...f, motivo_negado: e.target.value })} />
                        <button style={s.btn} onClick={() => negar(item)} disabled={salvando === item.id}>Salvar negativa</button>
                      </div>
                    )}
                  </div>
                )}

                {podeAgir && item.etapa === 'concedido' && (
                  <div>
                    <button style={s.btn} onClick={() => salvarEtapa(item, 'aguardando_pagamento')}>→ Aguardando pagamento</button>
                  </div>
                )}

                {podeAgir && item.etapa === 'aguardando_pagamento' && (
                  <div>
                    <button style={s.btn} onClick={() => abrirForm(item, 'pag')}>Registrar pagamento</button>
                    {formAberto === item.id + 'pag' && (
                      <div style={s.form}>
                        <div style={s.row2}>
                          <div><label style={s.label}>Valor recebido</label><input type="number" style={s.input} value={f.ticket_valor} onChange={e => setF({ ...f, ticket_valor: e.target.value })} /></div>
                          <div><label style={s.label}>Data do pagamento</label><input type="date" style={s.input} value={f.data_pagamento} onChange={e => setF({ ...f, data_pagamento: e.target.value })} /></div>
                        </div>
                        <label style={s.label}>Comprovante</label>
                        <input type="file" accept="image/*,application/pdf" onChange={e => setArquivo(e.target.files[0])} />
                        <div><button style={s.btn} onClick={() => registrarPagamento(item)} disabled={uploadando || salvando === item.id}>{uploadando ? 'Subindo…' : 'Confirmar pago → financeiro'}</button></div>
                      </div>
                    )}
                  </div>
                )}

                {item.etapa === 'pago' && (
                  <div style={s.meta}>✅ Pago {brl(item.ticket_valor)} em {fmtData(item.data_pagamento)} · enviado ao financeiro
                    {item.comprovante_url && <> · <a href={`https://sdqslzpfbazehqcvibjy.supabase.co/storage/v1/object/comprovantes-mae/${item.comprovante_url}`} target="_blank" rel="noreferrer">ver comprovante</a></>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
