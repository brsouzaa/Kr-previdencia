import { useState } from 'react'
import { supabase } from '../lib/supabase'

const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']
const PRODUTOS = ['Maternidade', 'BPC', 'Auxilio Acidente']

// === Nova precificação por faixa (não cumulativa: lote inteiro sai pelo mesmo preço) ===
// 1 a 4   → R$ 399
// 5 a 9   → R$ 349
// 10+     → R$ 299
function precoUnitario(total) {
  if (total >= 10) return 299
  if (total >= 5) return 349
  return 399
}
function faixaLabel(total) {
  if (total >= 10) return 'Lote 10+'
  if (total >= 5) return 'Lote 5-9'
  return 'Lote 1-4'
}

const PROD_STYLE = {
  'Maternidade': { bg: '#E1F5EE', color: '#0F6E56', border: '#0F6E56' },
  'BPC': { bg: '#EEEDFE', color: '#534AB7', border: '#534AB7' },
  'Auxilio Acidente': { bg: '#FAEEDA', color: '#854F0B', border: '#854F0B' },
}

const s = {
  page: { minHeight: '100vh', background: '#f8f8f6', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem 1rem 4rem' },
  card: { background: '#fff', borderRadius: 16, padding: '2rem', width: '100%', maxWidth: 540, border: '0.5px solid rgba(0,0,0,0.1)' },
  logo: { fontSize: 22, fontWeight: 600, color: '#111', marginBottom: 4, letterSpacing: '-0.4px', textAlign: 'center' },
  logoBlue: { color: '#185FA5' },
  sub: { fontSize: 14, color: '#888', marginBottom: '1.5rem', textAlign: 'center' },
  sectionTitle: { fontSize: 11, fontWeight: 500, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '1.25rem 0 10px', paddingBottom: 6, borderBottom: '0.5px solid rgba(0,0,0,0.06)' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  label: { display: 'block', fontSize: 12, color: '#555', marginBottom: 4 },
  input: { width: '100%', padding: '10px 12px', fontSize: 14, border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 8, color: '#111', background: '#fff', outline: 'none', boxSizing: 'border-box' },
  select: { width: '100%', padding: '10px 12px', fontSize: 14, border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 8, color: '#111', background: '#fff', outline: 'none' },
  btn: { width: '100%', marginTop: '1rem', padding: '13px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: 'pointer' },
  btnDisabled: { width: '100%', marginTop: '1rem', padding: '13px', background: '#aaa', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: 'not-allowed' },
  btnOutline: { width: '100%', marginTop: '0.75rem', padding: '13px', background: '#fff', color: '#185FA5', border: '1px solid #185FA5', borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: 'pointer' },
  error: { marginTop: 10, padding: '10px 12px', background: '#FCEBEB', borderRadius: 8, fontSize: 13, color: '#A32D2D' },
  checkRow: { display: 'flex', gap: 10, alignItems: 'flex-start', margin: '1.25rem 0', padding: '12px', background: '#f8f8f6', borderRadius: 8 },
  qtyRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, padding: '12px 14px', borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.08)', background: '#f8f8f6' },
  qtyBtn: { width: 34, height: 34, borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.15)', background: '#fff', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 500, flexShrink: 0 },
  qtyValue: { fontSize: 18, fontWeight: 500, minWidth: 32, textAlign: 'center' },
  totalBox: { background: '#E6F1FB', borderRadius: 10, padding: '12px 14px', marginTop: 4, marginBottom: 4 },
  precoTabela: { background: '#FAEEDA', borderRadius: 10, padding: '12px 14px', marginBottom: 12, fontSize: 12, color: '#854F0B', lineHeight: 1.6 },
  opcaoBtn: (ativo) => ({
    flex: 1, padding: '16px 10px', borderRadius: 12, cursor: 'pointer', textAlign: 'center',
    border: ativo ? '2px solid #185FA5' : '0.5px solid rgba(0,0,0,0.15)',
    background: ativo ? '#E6F1FB' : '#fff',
    transition: 'all 0.15s',
  }),
  advCard: { background: '#f8f8f6', borderRadius: 10, padding: '14px', marginBottom: '1rem', border: '0.5px solid rgba(0,0,0,0.08)' },
}

const INITIAL_FORM = { nome_completo: '', oab: '', estado: 'SP', cidade: '', telefone: '', email: '', estado_civil: 'Solteiro(a)', nacionalidade: 'Brasileira', endereco: '', numero: '', bairro: '', cep: '' }
const INITIAL_QTDS = { 'Maternidade': 0, 'BPC': 0, 'Auxilio Acidente': 0 }

function dataMinima() {
  return new Date().toISOString().slice(0, 10)
}

function TabelaPrecos({ total }) {
  const linhas = [
    { faixa: '1 a 4 contratos', preco: 399 },
    { faixa: '5 a 9 contratos', preco: 349 },
    { faixa: '10 ou mais', preco: 299 },
  ]
  const ativaIdx = total >= 10 ? 2 : total >= 5 ? 1 : total >= 1 ? 0 : -1
  return (
    <div style={s.precoTabela}>
      <div style={{ fontWeight: 500, marginBottom: 6 }}>💰 Tabela de preços (por lote fechado)</div>
      {linhas.map((l, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between',
          fontWeight: ativaIdx === i ? 600 : 400,
          color: ativaIdx === i ? '#185FA5' : '#854F0B' }}>
          <span>{l.faixa}{ativaIdx === i ? ' ←' : ''}</span>
          <span>R$ {l.preco}/contrato</span>
        </div>
      ))}
    </div>
  )
}

function SeletorContratos({ qtds, setQtds }) {
  const total = Object.values(qtds).reduce((a, b) => a + b, 0)
  const valorUnit = precoUnitario(total)
  const valor = total * valorUnit

  function ajustar(p, d) { setQtds(q => ({ ...q, [p]: Math.max(0, (q[p] || 0) + d) })) }

  return (
    <>
      <TabelaPrecos total={total} />

      {PRODUTOS.map(p => {
        const st = PROD_STYLE[p]
        const qtd = qtds[p] || 0
        return (
          <div key={p} style={{ ...s.qtyRow, borderColor: qtd > 0 ? st.border + '60' : 'rgba(0,0,0,0.08)', background: qtd > 0 ? st.bg : '#f8f8f6' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: qtd > 0 ? 500 : 400, color: qtd > 0 ? st.color : '#555' }}>
                {p === 'Auxilio Acidente' ? 'Auxílio Acidente' : p}
              </div>
              {qtd > 0 && <div style={{ fontSize: 11, color: st.color, marginTop: 2 }}>{qtd}x R$ {valorUnit}</div>}
            </div>
            <button type="button" style={{ ...s.qtyBtn, color: qtd > 0 ? st.color : '#aaa' }} onClick={() => ajustar(p, -1)}>−</button>
            <div style={{ ...s.qtyValue, color: qtd > 0 ? st.color : '#aaa' }}>{qtd}</div>
            <button type="button" style={{ ...s.qtyBtn, color: st.color }} onClick={() => ajustar(p, 1)}>+</button>
          </div>
        )
      })}
      {total > 0 && (
        <div style={s.totalBox}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 11, color: '#185FA5', opacity: 0.8 }}>Total do pedido</div>
            <div style={{ fontSize: 11, color: '#185FA5', background: '#fff', padding: '2px 8px', borderRadius: 10, fontWeight: 500 }}>{faixaLabel(total)}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#185FA5' }}>{total} contrato{total !== 1 ? 's' : ''} · R$ {valorUnit} cada</div>
            <div style={{ fontSize: 20, fontWeight: 500, color: '#185FA5' }}>R$ {valor.toLocaleString('pt-BR')}</div>
          </div>
        </div>
      )}
    </>
  )
}

function Sucesso({ dados }) {
  const total = Object.values(dados.qtds).reduce((a, b) => a + b, 0)
  const valorUnit = precoUnitario(total)
  const valor = total * valorUnit
  const NUMERO_EMPRESA = '5511919384449'
  const dataFmt = dados.data_compra
    ? new Date(dados.data_compra + 'T00:00:00').toLocaleDateString('pt-BR')
    : null
  const msg = encodeURIComponent(
    `Olá! ${dados.jaExistia ? 'Acabei de fazer um novo pedido' : 'Acabei de preencher meu cadastro'} como advogado parceiro da KR Previdência.\n\n` +
    `*Dados:*\nNome: ${dados.nome_completo}\nOAB: ${dados.oab}\nTelefone: ${dados.telefone}\n` +
    (total > 0 ? `\n*Contratos solicitados:*\n` +
    Object.entries(dados.qtds).filter(([,q]) => q > 0).map(([p,q]) => `${p === 'Auxilio Acidente' ? 'Auxílio Acidente' : p}: ${q}`).join('\n') +
    `\nTotal: ${total} contratos · R$ ${valorUnit}/contrato · R$ ${valor.toLocaleString('pt-BR')}` +
    (dataFmt ? `\nData desejada: ${dataFmt}` : '') : '')
  )

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={{ textAlign: 'center', padding: '0.5rem 0 1.5rem' }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>✅</div>
          <div style={{ fontSize: 20, fontWeight: 500, color: '#111', marginBottom: 8 }}>
            {dados.jaExistia ? 'Pedido registrado!' : 'Cadastro recebido!'}
          </div>
          <div style={{ fontSize: 14, color: '#888', lineHeight: 1.7, marginBottom: '1.5rem' }}>
            {dados.jaExistia
              ? `Seu pedido de ${total} contrato${total !== 1 ? 's' : ''} foi registrado com sucesso.`
              : `Seus dados foram enviados com sucesso. Seu pedido de ${total} contrato${total !== 1 ? 's' : ''} já está registrado.`}
          </div>

          {total > 0 && (
            <div style={{ background: '#E6F1FB', borderRadius: 10, padding: '12px 16px', marginBottom: '1.5rem', textAlign: 'left' }}>
              <div style={{ fontSize: 12, color: '#185FA5', fontWeight: 500, marginBottom: 8 }}>Resumo do pedido</div>
              {Object.entries(dados.qtds).filter(([,q]) => q > 0).map(([p, q]) => (
                <div key={p} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: '#555' }}>{p === 'Auxilio Acidente' ? 'Auxílio Acidente' : p}</span>
                  <span style={{ fontWeight: 500 }}>{q}x · R$ {(q * valorUnit).toLocaleString('pt-BR')}</span>
                </div>
              ))}
              {dataFmt && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 6, color: '#666' }}>
                  <span>Data desejada</span><span>{dataFmt}</span>
                </div>
              )}
              <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.1)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 500 }}>
                <span>Total ({total} × R$ {valorUnit})</span>
                <span style={{ color: '#185FA5' }}>R$ {valor.toLocaleString('pt-BR')}</span>
              </div>
            </div>
          )}

          <div style={{ fontSize: 14, color: '#555', marginBottom: '1rem', fontWeight: 500 }}>
            Avise sua consultora pelo WhatsApp:
          </div>
          <a href={`https://wa.me/${NUMERO_EMPRESA}?text=${msg}`} target="_blank" rel="noreferrer"
            style={{ display: 'block', padding: '13px', background: '#3B6D11', color: '#fff', borderRadius: 10, fontSize: 15, fontWeight: 500, textDecoration: 'none' }}>
            💬 Enviar pelo WhatsApp
          </a>
        </div>
      </div>
    </div>
  )
}

export default function Portal({ vendedorId, vendedorNome }) {
  const [etapa, setEtapa] = useState('escolha')
  const [form, setForm] = useState(INITIAL_FORM)
  const [qtds, setQtds] = useState(INITIAL_QTDS)
  const [dataPedido, setDataPedido] = useState(dataMinima())
  const [aceite, setAceite] = useState(false)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState(null)
  const [oabDuplicado, setOabDuplicado] = useState(false)
  const [oabBusca, setOabBusca] = useState('')
  const [advEncontrado, setAdvEncontrado] = useState(null)
  const [buscando, setBuscando] = useState(false)

  function setF(field, value) { setForm(f => ({ ...f, [field]: value })) }

  async function verificarOab(oab) {
    if (!oab || oab.length < 3) { setOabDuplicado(false); return }
    const { data } = await supabase.from('advogados').select('id').eq('oab', oab.trim()).maybeSingle()
    setOabDuplicado(!!data)
  }

  async function buscarAdvogado() {
    if (!oabBusca.trim()) return
    setBuscando(true)
    setErro('')
    setAdvEncontrado(null)
    const { data } = await supabase.from('advogados').select('id, nome_completo, oab, cidade, estado, telefone, email, total_compras').eq('oab', oabBusca.trim()).maybeSingle()
    if (!data) {
      setErro('OAB não encontrado. Verifique o número ou faça um novo cadastro.')
    } else {
      setAdvEncontrado(data)
      setEtapa('pedido')
    }
    setBuscando(false)
  }

  async function notificarEmail(tipo, dados) {
    try {
      await supabase.functions.invoke('enviar-email', { body: { tipo, dados } })
    } catch(e) {
      console.log('Email nao enviado:', e)
    }
  }

  async function registrarLote(advId, advDados, dataCompra) {
    const total = Object.values(qtds).reduce((a, b) => a + b, 0)
    if (total === 0) return
    const valorUnit = precoUnitario(total)
    const comprasInserir = []
    for (const [produto, qtd] of Object.entries(qtds)) {
      for (let i = 0; i < qtd; i++) {
        comprasInserir.push({ advogado_id: advId, produto, vendedor_id: vendedorId, data_compra: dataCompra })
      }
    }
    await supabase.from('compras').insert(comprasInserir)
    await supabase.from('lotes').insert({
      advogado_id: advId, vendedor_id: vendedorId,
      data_compra: dataCompra, total_contratos: total,
      valor_total: total * valorUnit, status_pagamento: 'emitir_contrato',
    })
    const prods = Object.entries(qtds).filter(([,q]) => q > 0).map(([p]) => p)
    for (const prod of prods) {
      await supabase.from('advogado_produtos').insert({ advogado_id: advId, produto: prod }).select()
    }
    await supabase.from('advogados').update({
      total_compras: (advDados.total_compras || 0) + total,
      ultima_compra: dataCompra,
    }).eq('id', advId)
  }

  async function enviarNovo(e) {
    e.preventDefault()
    const total = Object.values(qtds).reduce((a, b) => a + b, 0)
    if (total === 0) { setErro('Selecione ao menos 1 contrato.'); return }
    if (!dataPedido) { setErro('Informe a data desejada.'); return }
    if (!aceite) { setErro('Aceite os termos para continuar.'); return }
    if (oabDuplicado) { setErro('Este OAB já está cadastrado.'); return }
    setLoading(true); setErro('')

    const { data: adv, error } = await supabase.from('advogados').insert({
      ...form, oab: form.oab.trim(), vendedor_id: vendedorId,
      endereco: [form.endereco, form.numero, form.bairro].filter(Boolean).join(', '),
      total_compras: total, ultima_compra: dataPedido, status: 'vermelho',
    }).select().single()

    if (error) {
      setErro(error.code === '23505' ? 'OAB já cadastrado.' : 'Erro ao enviar. Tente novamente.')
      setLoading(false); return
    }

    await registrarLote(adv.id, { total_compras: 0 }, dataPedido)
    await notificarEmail('novo_advogado_portal', {
      vendedor_id: vendedorId,
      nome_completo: form.nome_completo,
      oab: form.oab.trim(),
      cidade: form.cidade,
      estado: form.estado,
      telefone: form.telefone,
      email: form.email,
      total_contratos: total,
      data_pedido: dataPedido,
    })
    setSucesso({ ...form, qtds, jaExistia: false, data_compra: dataPedido })
    setLoading(false)
  }

  async function enviarPedido() {
    const total = Object.values(qtds).reduce((a, b) => a + b, 0)
    if (total === 0) { setErro('Selecione ao menos 1 contrato.'); return }
    if (!dataPedido) { setErro('Informe a data desejada.'); return }
    setLoading(true); setErro('')
    await registrarLote(advEncontrado.id, advEncontrado, dataPedido)
    setSucesso({ ...advEncontrado, qtds, jaExistia: true, data_compra: dataPedido })
    setLoading(false)
  }

  if (sucesso) return <Sucesso dados={sucesso} />

  const totalQtds = Object.values(qtds).reduce((a,b)=>a+b,0)
  const valorUnitAtual = precoUnitario(totalQtds)
  const valorTotalAtual = totalQtds * valorUnitAtual

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logo}>KR <span style={s.logoBlue}>Previdência</span></div>
        <div style={s.sub}>Advogado parceiro</div>
        {vendedorNome && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#E6F1FB', borderRadius: 10, padding: '10px 16px', marginBottom: '1.5rem' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#185FA5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 500, color: '#fff', flexShrink: 0 }}>
              {vendedorNome.split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#185FA5', opacity: 0.8 }}>Sua consultora responsável</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#185FA5' }}>{vendedorNome}</div>
            </div>
          </div>
        )}

        {etapa === 'escolha' && (
          <>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#111', textAlign: 'center', marginBottom: '1.25rem' }}>
              Você já tem cadastro conosco?
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: '0.5rem' }}>
              <button style={s.opcaoBtn(false)} onClick={() => setEtapa('buscar')}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#111' }}>Sim, já tenho</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Fazer novo pedido</div>
              </button>
              <button style={s.opcaoBtn(false)} onClick={() => setEtapa('novo')}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📝</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#111' }}>Não, sou novo</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Fazer cadastro</div>
              </button>
            </div>
          </>
        )}

        {etapa === 'buscar' && (
          <>
            <div style={s.sectionTitle}>Identificação</div>
            <div style={{ fontSize: 14, color: '#888', marginBottom: 12 }}>
              Digite seu número de OAB para localizarmos seu cadastro:
            </div>
            <label style={s.label}>Número da OAB *</label>
            <input
              style={s.input}
              value={oabBusca}
              onChange={e => { setOabBusca(e.target.value); setErro('') }}
              placeholder="Ex: SP-123456"
              onKeyDown={e => e.key === 'Enter' && buscarAdvogado()}
            />
            {erro && <div style={s.error}>{erro}</div>}
            <button style={buscando || !oabBusca ? s.btnDisabled : s.btn} onClick={buscarAdvogado} disabled={buscando || !oabBusca}>
              {buscando ? 'Buscando...' : 'Localizar cadastro'}
            </button>
            <button style={s.btnOutline} onClick={() => { setEtapa('escolha'); setErro('') }}>
              Voltar
            </button>
          </>
        )}

        {etapa === 'pedido' && advEncontrado && (
          <>
            <div style={s.advCard}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#111', marginBottom: 6 }}>Cadastro encontrado ✓</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#185FA5' }}>{advEncontrado.nome_completo}</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>{advEncontrado.oab} · {advEncontrado.cidade}, {advEncontrado.estado}</div>
              <div style={{ fontSize: 12, color: '#888' }}>{advEncontrado.telefone}</div>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>{advEncontrado.total_compras} pedido{advEncontrado.total_compras !== 1 ? 's' : ''} anteriores</div>
            </div>

            <div style={s.sectionTitle}>Selecione os contratos *</div>
            <SeletorContratos qtds={qtds} setQtds={setQtds} />

            <div style={{ marginTop: 12 }}>
              <label style={s.label}>Data desejada para o pedido *</label>
              <input style={s.input} type="date" value={dataPedido}
                min={dataMinima()}
                onChange={e => setDataPedido(e.target.value)} required />
            </div>

            {erro && <div style={s.error}>{erro}</div>}
            <button style={loading || totalQtds === 0 || !dataPedido ? s.btnDisabled : s.btn}
              onClick={enviarPedido} disabled={loading || totalQtds === 0 || !dataPedido}>
              {loading ? 'Registrando...' : totalQtds > 0
                ? `Confirmar pedido · R$ ${valorTotalAtual.toLocaleString('pt-BR')}`
                : 'Selecione ao menos 1 contrato'}
            </button>
            <button style={s.btnOutline} onClick={() => { setEtapa('buscar'); setAdvEncontrado(null); setQtds(INITIAL_QTDS); setErro('') }}>
              Voltar
            </button>
          </>
        )}

        {etapa === 'novo' && (
          <form onSubmit={enviarNovo}>
            <div style={s.sectionTitle}>Dados pessoais</div>
            <div style={s.grid}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={s.label}>Nome completo *</label>
                <input style={s.input} value={form.nome_completo} onChange={e => setF('nome_completo', e.target.value)} required placeholder="Nome completo" />
              </div>
              <div>
                <label style={s.label}>OAB *</label>
                <input style={{ ...s.input, borderColor: oabDuplicado ? '#A32D2D' : 'rgba(0,0,0,0.2)' }}
                  value={form.oab} onChange={e => { setF('oab', e.target.value); setOabDuplicado(false) }}
                  onBlur={e => verificarOab(e.target.value)} placeholder="SP-123456" required />
                {oabDuplicado && <div style={{ fontSize: 11, color: '#A32D2D', marginTop: 3 }}>OAB já cadastrado — <button type="button" onClick={() => { setEtapa('buscar'); setOabBusca(form.oab) }} style={{ background:'none', border:'none', color:'#185FA5', fontSize:11, cursor:'pointer', textDecoration:'underline', padding:0 }}>fazer pedido</button></div>}
              </div>
              <div>
                <label style={s.label}>Estado *</label>
                <select style={s.select} value={form.estado} onChange={e => setF('estado', e.target.value)}>
                  {ESTADOS.map(e => <option key={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label style={s.label}>Cidade *</label>
                <input style={s.input} value={form.cidade} onChange={e => setF('cidade', e.target.value)} required placeholder="Sua cidade" />
              </div>
              <div>
                <label style={s.label}>Estado civil</label>
                <select style={s.select} value={form.estado_civil} onChange={e => setF('estado_civil', e.target.value)}>
                  {['Solteiro(a)','Casado(a)','Divorciado(a)','Viúvo(a)','União estável'].map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label style={s.label}>Nacionalidade</label>
                <input style={s.input} value={form.nacionalidade} onChange={e => setF('nacionalidade', e.target.value)} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={s.label}>Endereço</label>
                <input style={s.input} value={form.endereco} onChange={e => setF('endereco', e.target.value)} placeholder="Rua, número, bairro" />
              </div>
            </div>

            <div style={s.sectionTitle}>Contato</div>
            <div style={s.grid}>
              <div>
                <label style={s.label}>Telefone / WhatsApp *</label>
                <input style={s.input} value={form.telefone} onChange={e => setF('telefone', e.target.value)} placeholder="(11) 99999-0000" required />
              </div>
              <div>
                <label style={s.label}>E-mail *</label>
                <input style={s.input} type="email" value={form.email} onChange={e => setF('email', e.target.value)} required placeholder="seu@email.com" />
              </div>
            </div>

            <div style={s.sectionTitle}>Pedido de contratos *</div>
            <SeletorContratos qtds={qtds} setQtds={setQtds} />

            <div style={{ marginTop: 12 }}>
              <label style={s.label}>Data desejada para o pedido *</label>
              <input style={s.input} type="date" value={dataPedido}
                min={dataMinima()}
                onChange={e => setDataPedido(e.target.value)} required />
            </div>

            <div style={s.checkRow}>
              <input type="checkbox" id="aceite" checked={aceite} onChange={e => setAceite(e.target.checked)} style={{ marginTop: 2, flexShrink: 0, width: 16, height: 16, cursor: 'pointer' }} />
              <label htmlFor="aceite" style={{ fontSize: 13, color: '#555', lineHeight: 1.5, cursor: 'pointer' }}>
                Declaro que as informações fornecidas são verdadeiras e autorizo a KR Previdência a entrar em contato para fins de parceria comercial.
              </label>
            </div>

            {erro && <div style={s.error}>{erro}</div>}
            <button style={aceite && !oabDuplicado && !loading && totalQtds > 0 && dataPedido ? s.btn : s.btnDisabled}
              type="submit" disabled={!aceite || oabDuplicado || loading || totalQtds === 0 || !dataPedido}>
              {loading ? 'Enviando...' :
                totalQtds === 0 ? 'Selecione ao menos 1 contrato' :
                `Enviar cadastro + ${totalQtds} contrato${totalQtds!==1?'s':''} · R$ ${valorTotalAtual.toLocaleString('pt-BR')}`}
            </button>
            <button type="button" style={s.btnOutline} onClick={() => { setEtapa('escolha'); setErro('') }}>
              Voltar
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
