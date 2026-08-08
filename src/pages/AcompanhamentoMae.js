import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const KAROL_ID = '1c9e99ee-02c4-4500-9dd5-9706f95d0ee9'
const STHEFANY_ID = '88929e81-7223-4754-a17b-1cd08f46195d'

const s = {
  wrap: { padding: 16, maxWidth: 1100, margin: '0 auto' },
  h1: { fontSize: 20, fontWeight: 600, marginBottom: 4 },
  sub: { fontSize: 13, color: '#8b9bb4', marginBottom: 16 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 18 },
  kpi: { border: '0.5px solid rgba(148,163,184,0.12)', borderRadius: 10, padding: '10px 12px', background: '#131e33' },
  kpiTop: { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 500, marginBottom: 6, color: '#8b9bb4' },
  kpiNum: { fontSize: 24, fontWeight: 600, lineHeight: 1 },
  kpiSub: { fontSize: 11, color: '#8b9bb4', marginTop: 4 },
  abas: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 },
  aba: (on) => ({ padding: '7px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid ' + (on ? '#a78bfa' : 'rgba(148,163,184,0.16)'), background: on ? '#a78bfa' : '#131e33', color: on ? '#131e33' : '#c6d2e4' }),
  card: { border: '0.5px solid rgba(148,163,184,0.14)', borderRadius: 12, padding: 14, marginBottom: 10, background: '#131e33' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  nome: { fontSize: 15, fontWeight: 600 },
  meta: { fontSize: 12, color: '#8b9bb4', marginTop: 2 },
  selo: { display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', color: '#131e33', background: '#a78bfa', borderRadius: 6, padding: '2px 8px', marginBottom: 6 },
  dias: (alto) => ({ fontSize: 12, fontWeight: 600, color: alto ? '#f87171' : '#8b9bb4', background: alto ? 'rgba(248,113,113,.14)' : '#1a2742', borderRadius: 6, padding: '2px 8px', whiteSpace: 'nowrap' }),
  btn: { padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none', background: '#a78bfa', color: '#131e33', marginRight: 6, marginTop: 8 },
  btnG: { padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid rgba(148,163,184,0.20)', background: '#131e33', color: '#c6d2e4', marginRight: 6, marginTop: 8 },
  form: { marginTop: 10, padding: 12, background: 'rgba(167,139,250,.14)', borderRadius: 8, border: '1px solid rgba(167,139,250,.14)' },
  label: { fontSize: 12, fontWeight: 500, color: '#8b9bb4', display: 'block', marginBottom: 3, marginTop: 8 },
  input: { width: '100%', padding: '7px 9px', borderRadius: 7, border: '1px solid rgba(148,163,184,0.20)', fontSize: 13, boxSizing: 'border-box' },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  empty: { textAlign: 'center', color: '#8b9bb4', padding: 30, fontSize: 14 },
  finBox: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 10, marginBottom: 18, padding: 14, background: 'linear-gradient(135deg,rgba(167,139,250,.14),rgba(167,139,250,.14))', borderRadius: 12, border: '1px solid rgba(167,139,250,.14)' },
}

// etapas do fluxo (ordem): assinou → coleta → análise → protocolo → ...
const ETAPAS = [
  { key: 'coleta_docs', label: 'Coleta/Entrega', cor: '#a78bfa' },
  { key: 'analise_direito', label: 'Análise (Sthefany)', cor: '#a78bfa' },
  { key: 'aguardando_protocolo', label: 'Aguard. protocolo', cor: '#8b9bb4' },
  { key: 'protocolado', label: 'Protocolado', cor: '#60a5fa' },
  { key: 'em_analise_inss', label: 'Análise INSS', cor: '#22d3ee' },
  { key: 'concedido', label: 'Concedido', cor: '#34d399' },
  { key: 'negado', label: 'Negado', cor: '#f87171' },
  { key: 'aguardando_pagamento', label: 'Aguard. pagamento', cor: '#fbbf24' },
  { key: 'pago', label: 'Pago', cor: '#34d399' },
  { key: 'barrado', label: 'Barrado', cor: '#f87171' },
]
const etapaInfo = (k) => ETAPAS.find(e => e.key === k) || ETAPAS[0]
const URL_STORAGE = 'https://sdqslzpfbazehqcvibjy.supabase.co/storage/v1/object/comprovantes-mae/'

const brl = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const diasDesde = (iso) => {
  if (!iso) return 0
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}
const fmtData = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

export default function AcompanhamentoMae() {
  const { profile } = useAuth()
  const ehKarolOuAdmin = profile?.id === KAROL_ID || profile?.role === 'admin'
  const ehSthefanyOuAdmin = profile?.id === STHEFANY_ID || profile?.role === 'admin'

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

  // coleta: upload de print (gerid | cnis) direto no card
  const subirPrint = async (item, tipo, file) => {
    if (!file) return
    setUploadando(true)
    try {
      const ext = file.name.split('.').pop().toLowerCase()
      const nome = `${item.cliente_id}/${tipo}_${Date.now()}.${ext}`
      const { error: eUp } = await supabase.storage.from('comprovantes-mae').upload(nome, file)
      if (eUp) throw new Error(eUp.message)
      const campo = tipo === 'gerid' ? 'print_gerid_url' : 'print_cnis_url'
      const { error } = await supabase.from('acompanhamento_mae').update({ [campo]: nome }).eq('id', item.id)
      if (error) throw new Error(error.message)
      carregar()
    } catch (e) {
      alert('Erro ao subir print: ' + (e.message || e))
    }
    setUploadando(false)
  }

  const marcarLinkEnviado = async (item, valor) => {
    const { error } = await supabase.from('acompanhamento_mae').update({ link_acomp_enviado: valor }).eq('id', item.id)
    if (error) { alert('Erro: ' + error.message); return }
    carregar()
  }

  // coleta completa → manda pra análise da advogada
  const enviarParaAnalise = async (item) => {
    if (!item.link_acomp_enviado || !item.print_gerid_url || !item.print_cnis_url) {
      alert('Complete o checklist antes: link enviado + print GERID + CNIS.'); return
    }
    await salvarEtapa(item, 'analise_direito')
  }

  // veredito da análise (Sthefany/admin)
  const analiseTemDireito = async (item) => {
    await salvarEtapa(item, 'aguardando_protocolo', { analise_por: profile.id, analise_em: new Date().toISOString() })
  }
  const analiseSemDireito = async (item) => {
    if (!f.motivo_barrado) { alert('Informe o motivo (por que não tem direito)'); return }
    await salvarEtapa(item, 'barrado', { motivo_barrado: f.motivo_barrado, analise_por: profile.id, analise_em: new Date().toISOString() })
    // barra o cliente no CRM também (sai dos outros funis)
    await supabase.from('clientes').update({ status: 'barrado_pos_venda' }).eq('id', item.cliente_id)
    carregar()
  }

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
      motivo_barrado: item.motivo_barrado || '',
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
      .insert({ cliente_id: cliente.id, etapa: 'coleta_docs', responsavel_id: KAROL_ID })
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
      <div style={s.sub}>Assinou → coleta docs → análise do direito → protocolo → concessão → pagamento. Ticket padrão {brl(2400)} (editável).</div>

      {/* PAINEL FINANCEIRO PROJETADO */}
      <div style={s.finBox}>
        <div><div style={s.kpiTop}>Já recebido</div><div style={{ ...s.kpiNum, color: '#34d399' }}>{brl(fin.ja_recebido)}</div><div style={s.kpiSub}>pagos + comprovante</div></div>
        <div><div style={s.kpiTop}>A receber (concedidos)</div><div style={{ ...s.kpiNum, color: '#fbbf24' }}>{brl(fin.a_receber_concedidos)}</div><div style={s.kpiSub}>concedido, não pago</div></div>
        <div><div style={s.kpiTop}>Potencial em análise</div><div style={{ ...s.kpiNum, color: '#8b9bb4' }}>{brl(fin.potencial_em_analise)}</div><div style={s.kpiSub}>ainda no INSS</div></div>
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
        <div style={s.aba(aba === 'na_sthefany')} onClick={() => setAba('na_sthefany')}>No pós-venda ({naSthefany.length})</div>
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
                      {item.motivo_barrado && ` · barrado: ${item.motivo_barrado}`}
                    </div>
                  </div>
                  <div style={s.dias(dias >= 30)}>{dias}d nesta etapa</div>
                </div>

                {/* ETAPA 1: COLETA/ENTREGA — checklist de documentação (Karol/admin) */}
                {item.etapa === 'coleta_docs' && (
                  <div style={s.form}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#8b9bb4', marginBottom: 6 }}>Checklist da entrega</div>
                    <div style={{ fontSize: 13, marginBottom: 4 }}>
                      <label style={{ cursor: podeAgir ? 'pointer' : 'default' }}>
                        <input type="checkbox" checked={!!item.link_acomp_enviado} disabled={!podeAgir}
                          onChange={e => marcarLinkEnviado(item, e.target.checked)} />{' '}
                        Link de acompanhamento (Canva/GERID) enviado à cliente
                      </label>
                    </div>
                    <div style={{ fontSize: 13, marginBottom: 4 }}>
                      {item.print_gerid_url
                        ? <>✅ Print GERID · <a href={URL_STORAGE + item.print_gerid_url} target="_blank" rel="noreferrer">ver</a></>
                        : podeAgir && <>☐ Print GERID: <input type="file" accept="image/*,application/pdf" onChange={e => subirPrint(item, 'gerid', e.target.files[0])} disabled={uploadando} /></>}
                    </div>
                    <div style={{ fontSize: 13, marginBottom: 8 }}>
                      {item.print_cnis_url
                        ? <>✅ CNIS · <a href={URL_STORAGE + item.print_cnis_url} target="_blank" rel="noreferrer">ver</a></>
                        : podeAgir && <>☐ CNIS: <input type="file" accept="image/*,application/pdf" onChange={e => subirPrint(item, 'cnis', e.target.files[0])} disabled={uploadando} /></>}
                    </div>
                    {podeAgir && (
                      <button style={{ ...s.btn, opacity: (item.link_acomp_enviado && item.print_gerid_url && item.print_cnis_url) ? 1 : 0.4 }}
                        onClick={() => enviarParaAnalise(item)} disabled={salvando === item.id || uploadando}>
                        → Enviar para análise (Sthefany)
                      </button>
                    )}
                  </div>
                )}

                {/* ETAPA 2: ANÁLISE DO DIREITO — veredito (Sthefany/admin) */}
                {item.etapa === 'analise_direito' && (
                  <div style={s.form}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#8b9bb4', marginBottom: 6 }}>Documentos coletados</div>
                    <div style={{ fontSize: 13, marginBottom: 8 }}>
                      {item.print_gerid_url ? <a href={URL_STORAGE + item.print_gerid_url} target="_blank" rel="noreferrer">📄 GERID</a> : '⚠️ sem GERID'}
                      {' · '}
                      {item.print_cnis_url ? <a href={URL_STORAGE + item.print_cnis_url} target="_blank" rel="noreferrer">📄 CNIS</a> : '⚠️ sem CNIS'}
                    </div>
                    {ehSthefanyOuAdmin ? (
                      <div>
                        <button style={s.btn} onClick={() => analiseTemDireito(item)} disabled={salvando === item.id}>✓ Tem direito → protocolo</button>
                        <button style={{ ...s.btnG, color: '#f87171' }} onClick={() => abrirForm(item, 'semdir')}>✗ Sem direito (barrar)</button>
                        {formAberto === item.id + 'semdir' && (
                          <div style={{ marginTop: 8 }}>
                            <label style={s.label}>Por que a cliente não tem direito?</label>
                            <input style={s.input} value={f.motivo_barrado} onChange={e => setF({ ...f, motivo_barrado: e.target.value })} />
                            <button style={{ ...s.btn, background: '#f87171' }} onClick={() => analiseSemDireito(item)} disabled={salvando === item.id}>Confirmar: sem direito</button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={s.meta}>Aguardando veredito da Sthefany.</div>
                    )}
                  </div>
                )}

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
