import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// 31/08 (v2) — Cadastro de venda, depois das correcoes do Bruno.
//
// O que mudou e por que:
//
// 1. Sumiu a aba "Lead Bolsa Familia". Eram tres abas para responder UMA pergunta
//    ("quem e a cliente?"), e a terceira so existia porque a busca antiga nao
//    olhava o funil. Agora a busca varre CRM e funil de uma vez e diz de onde
//    veio cada resultado. Sobraram duas abas, que sao as duas situacoes reais:
//    a pessoa ja esta no sistema, ou e nova (indicacao).
//
// 2. Documento agora e POR PRODUTO — eu tinha misturado tudo num "comprovante"
//    generico + print da Crefisa:
//      Bolsa Familia   -> print da Crefisa + valor emprestado
//      Maternidade Mae -> CTPS digital e extrato FGTS, os dois em PDF
//      demais          -> comprovante
//
// 3. No Maternidade Mae, se a cliente JA tem o documento no cadastro (anexado na
//    digitacao da proposta), a tela mostra "ja esta no cadastro" e nao pede de
//    novo. Quem decide isso e o banco (venda_docs_faltando), nao esta tela.
const COR = {
  texto: '#0f172a', media: '#5b6b84', fraca: '#94a3b8',
  verde: '#1baf7a', vermelho: '#b3322f', borda: 'rgba(15,23,42,0.12)',
}

const soDigitos = (v) => String(v || '').replace(/\D/g, '')
const cpfBonito = (c) => {
  const n = soDigitos(c)
  return n.length === 11 ? n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : (c || '')
}

// A regra vive aqui e no banco. Aqui ela so decide o que DESENHAR; quem manda
// de verdade e venda_docs_faltando(), para nao existir venda completa na tela
// e incompleta no banco.
const DOCS_POR_PRODUTO = {
  'Bolsa Família': [
    { chave: 'crefisa', rotulo: 'Print da Crefisa', pdf: false,
      ajuda: 'é ele que prova o empréstimo' },
  ],
  'Maternidade Mãe': [
    { chave: 'ctps_digital', rotulo: 'CTPS digital', pdf: true,
      ajuda: 'o PDF baixado do aplicativo — print não vale', cadastro: 'tem_ctps' },
    { chave: 'extrato_fgts', rotulo: 'Extrato FGTS', pdf: true,
      ajuda: 'o PDF baixado do aplicativo — print não vale', cadastro: 'tem_fgts' },
  ],
}
const DOC_PADRAO = [{ chave: 'comprovante', rotulo: 'Comprovante da venda', pdf: false, ajuda: '' }]

const s = {
  fundo: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 70,
           display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
           padding: '4vh 14px', overflowY: 'auto' },
  caixa: { background: '#fff', borderRadius: 16, width: '100%', maxWidth: 540,
           boxShadow: '0 18px 48px rgba(15,23,42,.22)', overflow: 'hidden' },

  topo: { padding: '20px 22px 16px', borderBottom: '1px solid ' + COR.borda },
  titulo: { fontSize: 17, fontWeight: 650, color: COR.texto, letterSpacing: '-0.01em' },
  sub: { fontSize: 12.5, color: COR.fraca, marginTop: 3 },
  corpo: { padding: '4px 22px 18px', maxHeight: '68vh', overflowY: 'auto', scrollbarWidth: 'thin' },
  rodape: { padding: '14px 22px', borderTop: '1px solid ' + COR.borda, background: '#fcfcfd',
            display: 'flex', gap: 8, alignItems: 'center' },

  // numerar as etapas resolve o que o modal antigo nao dizia: quantas decisoes faltam
  passo: { display: 'flex', alignItems: 'center', gap: 8, margin: '18px 0 9px' },
  passoNum: { width: 19, height: 19, borderRadius: 10, background: COR.texto, color: '#fff',
              fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center',
              justifyContent: 'center', flexShrink: 0 },
  passoTxt: { fontSize: 12.5, fontWeight: 600, color: COR.texto },
  passoDica: { fontSize: 11.5, color: COR.fraca, marginLeft: 'auto' },

  chips: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  chip: { padding: '7px 12px', fontSize: 12.5, fontWeight: 500, borderRadius: 8,
          border: '1px solid ' + COR.borda, background: '#fff', color: COR.media, cursor: 'pointer' },
  chipOn: { background: COR.texto, color: '#fff', borderColor: COR.texto, fontWeight: 600 },

  abas: { display: 'flex', gap: 6 },
  aba: { flex: 1, padding: '9px 8px', fontSize: 12.5, fontWeight: 600, textAlign: 'center',
         borderRadius: 9, cursor: 'pointer', border: '1px solid ' + COR.borda,
         background: '#fff', color: COR.media },
  abaOn: { background: '#f1f5f9', borderColor: COR.texto, color: COR.texto },

  input: { width: '100%', padding: '10px 12px', fontSize: 14, borderRadius: 9,
           border: '1px solid ' + COR.borda, boxSizing: 'border-box', marginTop: 8 },
  linha2: { display: 'flex', gap: 8 },

  achado: (on) => ({ padding: '9px 11px', borderRadius: 9, marginBottom: 6, cursor: 'pointer',
    border: on ? '1.5px solid ' + COR.texto : '1px solid ' + COR.borda,
    background: on ? '#f8fafc' : '#fff' }),
  achadoNome: { fontSize: 13, fontWeight: 600, color: COR.texto },
  achadoMeta: { fontSize: 11.5, color: COR.media, marginTop: 2 },
  selo: (c, f) => ({ fontSize: 10, fontWeight: 700, color: c, background: f, borderRadius: 5,
                     padding: '2px 6px', marginLeft: 6, verticalAlign: 'middle' }),

  doc: (ok) => ({ display: 'block', width: '100%', padding: '11px 12px', fontSize: 12.5,
    borderRadius: 9, boxSizing: 'border-box', marginTop: 8, cursor: ok ? 'default' : 'pointer',
    border: ok ? '1px solid rgba(27,175,122,.45)' : '1px dashed rgba(15,23,42,0.24)',
    background: ok ? 'rgba(27,175,122,.07)' : '#fafbfc',
    color: ok ? '#0f7a52' : COR.media, fontWeight: ok ? 600 : 400, textAlign: 'center' }),
  docAjuda: { fontSize: 11, color: COR.fraca, marginTop: 4, textAlign: 'center' },

  erro: { fontSize: 12.5, color: COR.vermelho, background: 'rgba(227,73,72,.09)',
          border: '1px solid rgba(227,73,72,.3)', borderRadius: 9, padding: '10px 12px', marginTop: 14 },
  falta: { fontSize: 12, color: COR.media, marginRight: 'auto', lineHeight: 1.4 },

  btn: { padding: '11px 20px', fontSize: 14, fontWeight: 600, borderRadius: 10,
         border: 'none', background: COR.verde, color: '#fff', cursor: 'pointer' },
  btnOff: { opacity: .4, cursor: 'not-allowed' },
  btnSec: { padding: '11px 16px', fontSize: 13.5, borderRadius: 10,
            border: '1px solid ' + COR.borda, background: '#fff', color: COR.media, cursor: 'pointer' },
  vazio: { fontSize: 12, color: COR.fraca, padding: '10px 4px', textAlign: 'center' },
}

export default function ModalNovaVenda({ aoFechar, aoSalvar }) {
  const [produtos, setProdutos] = useState([])
  const [produto, setProduto] = useState('')
  const [modo, setModo] = useState('cliente')     // cliente | indicacao
  const [termo, setTermo] = useState('')
  const [achados, setAchados] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [escolhido, setEscolhido] = useState(null)

  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [telefone, setTelefone] = useState('')
  const [indicadoPor, setIndicadoPor] = useState('')
  const [valorEmprestado, setValorEmprestado] = useState('')
  const [observacao, setObservacao] = useState('')

  const [arquivos, setArquivos] = useState({})    // { chave: File }
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    supabase.from('vendas_produtos').select('*').eq('ativo', true).order('ordem')
      .then(({ data }) => {
        setProdutos(data || [])
        if (data && data.length) setProduto(p => p || data[0].produto)
      })
  }, [])

  const cfg = produtos.find(p => p.produto === produto) || {}
  const exigeValor = !!cfg.exige_valor_emprestado

  const docs = DOCS_POR_PRODUTO[produto] || DOC_PADRAO

  // um documento esta resolvido se a pessoa anexou agora OU se ja consta no
  // cadastro dela — foi o que evitou pedir duas vezes o mesmo PDF
  const jaNoCadastro = useCallback((d) =>
    modo === 'cliente' && d.cadastro && escolhido && escolhido[d.cadastro] === true, [modo, escolhido])

  const faltando = useMemo(
    () => docs.filter(d => !arquivos[d.chave] && !jaNoCadastro(d)),
    [docs, arquivos, jaNoCadastro])

  // trocar de produto zera os arquivos: sao documentos DIFERENTES por produto,
  // e carregar o anterior faria a tela mentir que o novo ja esta completo
  useEffect(() => { setArquivos({}) }, [produto])

  const buscar = useCallback(async () => {
    const t = termo.trim()
    if (t.length < 3) { setAchados([]); return }
    setBuscando(true)
    const { data, error } = await supabase.rpc('venda_buscar_pessoa', { p_termo: t })
    setBuscando(false)
    if (error) { setErro(error.message); return }
    setAchados(data || [])
  }, [termo])

  useEffect(() => {
    if (modo === 'indicacao') return
    const id = setTimeout(buscar, 350)
    return () => clearTimeout(id)
  }, [termo, modo, buscar])

  function escolherArquivo(d, file) {
    if (!file) return
    const ehPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')
    if (d.pdf && !ehPdf) {
      setErro(d.rotulo + ' tem que ser o PDF baixado do aplicativo — print ou foto não vale.')
      return
    }
    setErro('')
    setArquivos(a => ({ ...a, [d.chave]: file }))
  }

  async function subirArquivo(arq, vendaId, tipo) {
    const ext = (arq.name.split('.').pop() || 'jpg').toLowerCase()
    const caminho = vendaId + '/' + tipo + '_' + Date.now() + '.' + ext
    const { error } = await supabase.storage.from('vendas-comprovantes').upload(caminho, arq)
    if (error) throw new Error('Falha ao enviar o arquivo: ' + error.message)
    const { data } = supabase.storage.from('vendas-comprovantes').getPublicUrl(caminho)
    const { error: e2 } = await supabase.rpc('venda_anexar_comprovante', {
      p_venda_id: vendaId, p_url: data?.publicUrl || caminho, p_nome: arq.name, p_tipo: tipo,
    })
    if (e2) throw new Error(e2.message)
  }

  const podeSalvar = (() => {
    if (!produto || salvando) return false
    if (faltando.length) return false
    if (exigeValor && !(Number(valorEmprestado) > 0)) return false
    if (modo === 'indicacao') return nome.trim().length > 2 && soDigitos(cpf).length === 11
    return !!escolhido
  })()

  async function salvar() {
    setErro(''); setSalvando(true)
    try {
      const ehIndicacao = modo === 'indicacao'
      const { data: vendaId, error } = await supabase.rpc('venda_criar', {
        p_produto: produto,
        p_origem: ehIndicacao ? 'indicacao' : 'existente',
        p_indicado_por: ehIndicacao ? (indicadoPor || null) : null,
        p_valor_emprestado: valorEmprestado ? Number(valorEmprestado) : null,
        p_observacao: observacao || null,
        p_cliente_id: !ehIndicacao && escolhido ? escolhido.cliente_id : null,
        p_lead_id: !ehIndicacao && escolhido ? escolhido.lead_id : null,
        p_nome: ehIndicacao ? nome.trim() : null,
        p_cpf: ehIndicacao ? soDigitos(cpf) : null,
        p_telefone: ehIndicacao ? soDigitos(telefone) : null,
      })
      if (error) throw new Error(traduz(error.message))

      for (const d of docs) {
        if (arquivos[d.chave]) await subirArquivo(arquivos[d.chave], vendaId, d.chave)
      }

      setSalvando(false)
      aoSalvar && aoSalvar(vendaId)
      aoFechar && aoFechar()
    } catch (e) {
      setSalvando(false)
      setErro(traduz(String(e.message || e)))
    }
  }

  function traduz(m) {
    if (/INDICACAO_EXIGE_NOME_E_CPF/.test(m)) return 'Para indicação, preencha o nome e o CPF.'
    if (/CPF_INVALIDO/.test(m)) return 'O CPF precisa ter 11 dígitos.'
    if (/VALOR_EMPRESTADO_OBRIGATORIO/.test(m)) return 'No Bolsa Família, informe o valor emprestado.'
    if (/PRODUTO_OBRIGATORIO/.test(m)) return 'Escolha o produto.'
    if (/TIPO_DE_DOCUMENTO_INVALIDO/.test(m)) return 'Documento não reconhecido pelo sistema.'
    if (/duplicate key|uq_vendas/.test(m)) return 'Essa pessoa já tem uma venda registrada.'
    return m
  }

  const Passo = ({ n, texto, dica }) => (
    <div style={s.passo}>
      <div style={s.passoNum}>{n}</div>
      <div style={s.passoTxt}>{texto}</div>
      {dica && <div style={s.passoDica}>{dica}</div>}
    </div>
  )

  return (
    <div style={s.fundo} onClick={() => !salvando && aoFechar && aoFechar()}>
      <div style={s.caixa} onClick={e => e.stopPropagation()}>

        <div style={s.topo}>
          <div style={s.titulo}>Nova venda</div>
          <div style={s.sub}>Anote uma venda que você fechou. Ela entra na sua produção.</div>
        </div>

        <div style={s.corpo}>
          <Passo n="1" texto="Qual produto" />
          <div style={s.chips}>
            {produtos.map(p => (
              <button key={p.produto} style={{ ...s.chip, ...(produto === p.produto ? s.chipOn : {}) }}
                onClick={() => setProduto(p.produto)}>{p.produto}</button>
            ))}
          </div>

          <Passo n="2" texto="Quem é a cliente" />
          <div style={s.abas}>
            {[['cliente', 'Já está no sistema'], ['indicacao', 'Indicação (cliente nova)']].map(([v, l]) => (
              <div key={v} style={{ ...s.aba, ...(modo === v ? s.abaOn : {}) }}
                onClick={() => { setModo(v); setEscolhido(null); setAchados([]); setErro('') }}>{l}</div>
            ))}
          </div>

          {modo === 'cliente' ? (<>
            <input style={s.input} value={termo} autoFocus
              placeholder="CPF ou nome da cliente..."
              onChange={e => { setTermo(e.target.value); setEscolhido(null) }} />
            {buscando && <div style={s.vazio}>Procurando...</div>}
            {!buscando && termo.trim().length >= 3 && achados.length === 0 &&
              <div style={s.vazio}>Ninguém com esse nome ou CPF. Se for cliente nova, use <b>Indicação</b>.</div>}
            <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: 8, scrollbarWidth: 'thin' }}>
              {achados.map((a, i) => {
                const sel = escolhido && escolhido.cliente_id === a.cliente_id
                          && escolhido.lead_id === a.lead_id
                const ehLead = a.tipo === 'lead_bf'
                return (
                  <div key={i} style={s.achado(sel)} onClick={() => setEscolhido(a)}>
                    <div style={s.achadoNome}>
                      {a.nome || '(sem nome)'}
                      {ehLead && <span style={s.selo('#7c2d12', 'rgba(237,161,0,.16)')}>funil BF</span>}
                      {a.ja_tem_venda && <span style={s.selo(COR.vermelho, 'rgba(227,73,72,.12)')}>já tem venda</span>}
                    </div>
                    <div style={s.achadoMeta}>
                      {cpfBonito(a.cpf) || 'sem CPF'} · {a.telefone || 'sem telefone'} · {a.produto}
                      {' · '}{a.situacao} · com {a.vendedor_atual}
                    </div>
                  </div>
                )
              })}
            </div>
          </>) : (<>
            <input style={s.input} value={nome} placeholder="Nome completo da cliente"
              onChange={e => setNome(e.target.value)} />
            <div style={s.linha2}>
              <input style={{ ...s.input, flex: 1 }} value={cpf} placeholder="CPF"
                onChange={e => setCpf(e.target.value)} />
              <input style={{ ...s.input, flex: 1 }} value={telefone} placeholder="Telefone"
                onChange={e => setTelefone(e.target.value)} />
            </div>
            <input style={s.input} value={indicadoPor} placeholder="Quem indicou (opcional)"
              onChange={e => setIndicadoPor(e.target.value)} />
          </>)}

          <Passo n="3" texto={exigeValor ? 'Valor e documento' : 'Documento'}
                 dica={docs.length > 1 ? docs.length + ' arquivos' : null} />

          {exigeValor && (
            <input style={{ ...s.input, marginTop: 0 }} type="number" step="0.01" value={valorEmprestado}
              placeholder="Valor emprestado à cliente — ex: 850,00"
              onChange={e => setValorEmprestado(e.target.value)} />
          )}

          {docs.map(d => {
            const arq = arquivos[d.chave]
            const doCadastro = jaNoCadastro(d)
            if (doCadastro) return (
              <div key={d.chave}>
                <div style={s.doc(true)}>✓ {d.rotulo} — já está no cadastro da cliente</div>
              </div>
            )
            return (
              <div key={d.chave}>
                <label style={s.doc(!!arq)}>
                  {arq ? '✓ ' + arq.name : d.rotulo + (d.pdf ? ' (PDF)' : '')}
                  <input type="file" style={{ display: 'none' }}
                    accept={d.pdf ? 'application/pdf,.pdf' : 'image/*,.pdf'}
                    onChange={e => escolherArquivo(d, e.target.files?.[0])} />
                </label>
                {!arq && d.ajuda && <div style={s.docAjuda}>{d.ajuda}</div>}
              </div>
            )
          })}

          <input style={s.input} value={observacao} placeholder="Observação (opcional)"
            onChange={e => setObservacao(e.target.value)} />

          {erro && <div style={s.erro}>{erro}</div>}
        </div>

        <div style={s.rodape}>
          <div style={s.falta}>
            {faltando.length
              ? 'Falta anexar: ' + faltando.map(d => d.rotulo).join(' e ')
              : (exigeValor && !(Number(valorEmprestado) > 0))
                ? 'Falta informar o valor emprestado'
                : podeSalvar ? 'Tudo certo para registrar' : 'Escolha a cliente'}
          </div>
          <button style={s.btnSec} disabled={salvando} onClick={() => aoFechar && aoFechar()}>Cancelar</button>
          <button style={{ ...s.btn, ...(podeSalvar ? {} : s.btnOff) }}
            disabled={!podeSalvar} onClick={salvar}>
            {salvando ? 'Registrando...' : 'Registrar venda'}
          </button>
        </div>
      </div>
    </div>
  )
}
