import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// 31/08 — Cadastro de venda. Faltava: as funções existiam no banco e não havia tela.
//
// Três caminhos para identificar a pessoa, porque ela pode estar em três lugares:
//   • cliente do CRM (contrato)    → busca por CPF ou nome
//   • lead do Bolsa Família        → busca no funil
//   • indicação                    → não existe ainda; a venda guarda os dados dela
//
// Comprovante é obrigatório para fechar. No Bolsa Família, além do valor
// emprestado, exige o print da Crefisa — é ele que prova o empréstimo.
const COR = { texto: '#0f172a', media: '#5b6b84', fraca: '#94a3b8', verde: '#1baf7a', vermelho: '#b3322f' }

const soDigitos = (v) => String(v || '').replace(/\D/g, '')
const cpfBonito = (c) => {
  const n = soDigitos(c)
  return n.length === 11 ? n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : (c || '')
}

const s = {
  fundo: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 70,
           display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
           padding: '5vh 14px', overflowY: 'auto' },
  caixa: { background: '#fff', borderRadius: 14, padding: 22, width: '100%', maxWidth: 560 },
  titulo: { fontSize: 17, fontWeight: 600, color: COR.texto, marginBottom: 3 },
  sub: { fontSize: 12, color: COR.fraca, marginBottom: 18 },
  label: { fontSize: 12, color: COR.media, marginBottom: 6, display: 'block', fontWeight: 500, marginTop: 4 },
  input: { width: '100%', padding: '10px 12px', fontSize: 14, borderRadius: 9,
           border: '0.5px solid rgba(15,23,42,0.18)', boxSizing: 'border-box', marginBottom: 12 },
  chips: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 },
  chip: { padding: '8px 13px', fontSize: 12.5, fontWeight: 500, borderRadius: 8,
          border: '0.5px solid rgba(15,23,42,0.14)', background: '#fff', color: COR.media, cursor: 'pointer' },
  chipOn: { background: COR.texto, color: '#fff', borderColor: COR.texto },
  aba: { flex: 1, padding: '10px 8px', fontSize: 12.5, fontWeight: 600, textAlign: 'center',
         borderRadius: 9, cursor: 'pointer', border: '0.5px solid rgba(15,23,42,0.14)', background: '#fff', color: COR.media },
  abaOn: { background: '#f1f5f9', borderColor: COR.texto, color: COR.texto },

  achado: (on) => ({ padding: '10px 12px', borderRadius: 9, marginBottom: 7, cursor: 'pointer',
    border: on ? '2px solid ' + COR.texto : '0.5px solid rgba(15,23,42,0.12)',
    background: on ? '#f8fafc' : '#fff' }),
  achadoNome: { fontSize: 13.5, fontWeight: 600, color: COR.texto },
  achadoMeta: { fontSize: 11.5, color: COR.media, marginTop: 3 },
  tagAviso: { fontSize: 10.5, fontWeight: 700, color: '#7c2d12', background: 'rgba(237,161,0,.18)',
              borderRadius: 5, padding: '2px 7px', marginLeft: 6 },

  arquivo: { display: 'block', width: '100%', padding: '12px', fontSize: 12.5, borderRadius: 9,
             border: '1px dashed rgba(15,23,42,0.25)', background: '#fafbfc', cursor: 'pointer',
             color: COR.media, textAlign: 'center', marginBottom: 10, boxSizing: 'border-box' },
  arquivoOk: { borderColor: COR.verde, background: 'rgba(27,175,122,.08)', color: '#0f7a52', fontWeight: 600 },
  exigido: { fontSize: 11.5, color: '#7c2d12', background: 'rgba(237,161,0,.14)',
             border: '0.5px solid rgba(237,161,0,.5)', borderRadius: 9, padding: '10px 12px',
             marginBottom: 12, lineHeight: 1.55 },
  erro: { fontSize: 12.5, color: COR.vermelho, background: 'rgba(227,73,72,.10)',
          border: '0.5px solid rgba(227,73,72,.35)', borderRadius: 9, padding: '10px 12px', marginBottom: 12 },
  acoes: { display: 'flex', gap: 8, marginTop: 6 },
  btn: { flex: 1, padding: '12px', fontSize: 14, fontWeight: 600, borderRadius: 10,
         border: 'none', background: COR.verde, color: '#fff', cursor: 'pointer' },
  btnOff: { opacity: .45, cursor: 'not-allowed' },
  btnSec: { padding: '12px 18px', fontSize: 13.5, borderRadius: 10,
            border: '0.5px solid rgba(15,23,42,0.14)', background: '#fff', color: COR.media, cursor: 'pointer' },
  vazio: { fontSize: 12, color: COR.fraca, padding: '12px 4px', textAlign: 'center' },
}

export default function ModalNovaVenda({ aoFechar, aoSalvar }) {
  const [produtos, setProdutos] = useState([])
  const [produto, setProduto] = useState('')
  const [modo, setModo] = useState('cliente')     // cliente | bf | indicacao
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

  const [comprovante, setComprovante] = useState(null)
  const [printCrefisa, setPrintCrefisa] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    supabase.from('vendas_produtos').select('*').eq('ativo', true).order('ordem')
      .then(({ data }) => {
        setProdutos(data || [])
        // updater em vez de ler `produto` do closure: assim a lista de
        // dependencias fica vazia de verdade e nao precisa de eslint-disable
        // (nenhum outro arquivo do projeto usa disable; o build reprova)
        if (data && data.length) setProduto(p => p || data[0].produto)
      })
  }, [])

  const cfg = produtos.find(p => p.produto === produto) || {}
  const ehBF = !!cfg.exige_print_crefisa

  // Bolsa Família vive no funil; os outros produtos, no CRM. Levar o vendedor
  // direto pro lugar certo evita busca vazia e a impressão de que "não achou".
  useEffect(() => {
    if (!produto) return
    setModo(ehBF ? 'bf' : 'cliente')
    setEscolhido(null); setAchados([]); setTermo('')
  }, [produto, ehBF])

  const buscar = useCallback(async () => {
    const t = termo.trim()
    if (t.length < 3) { setAchados([]); return }
    setBuscando(true)
    const fn = modo === 'bf' ? 'venda_buscar_lead_bf' : 'venda_buscar_pessoa'
    const { data, error } = await supabase.rpc(fn, { p_termo: t })
    setBuscando(false)
    if (error) { setErro(error.message); return }
    setAchados(data || [])
  }, [termo, modo])

  useEffect(() => {
    if (modo === 'indicacao') return
    const id = setTimeout(buscar, 350)   // espera a digitação parar
    return () => clearTimeout(id)
  }, [termo, modo, buscar])

  async function subirArquivo(arq, vendaId, tipo) {
    const ext = (arq.name.split('.').pop() || 'jpg').toLowerCase()
    const caminho = vendaId + '/' + tipo + '_' + Date.now() + '.' + ext
    const { error } = await supabase.storage.from('vendas-comprovantes').upload(caminho, arq)
    if (error) throw new Error('Falha ao enviar o arquivo: ' + error.message)
    const { data } = supabase.storage.from('vendas-comprovantes').getPublicUrl(caminho)
    await supabase.rpc('venda_anexar_comprovante', {
      p_venda_id: vendaId, p_url: data?.publicUrl || caminho, p_nome: arq.name, p_tipo: tipo,
    })
  }

  const podeSalvar = (() => {
    if (!produto || salvando) return false
    if (!comprovante) return false
    if (ehBF && (!printCrefisa || !(Number(valorEmprestado) > 0))) return false
    if (modo === 'indicacao') return nome.trim().length > 2 && soDigitos(cpf).length === 11
    return !!escolhido
  })()

  async function salvar() {
    setErro(''); setSalvando(true)
    try {
      const args = {
        p_produto: produto,
        p_origem: modo === 'indicacao' ? 'indicacao' : 'existente',
        p_indicado_por: modo === 'indicacao' ? (indicadoPor || null) : null,
        p_valor_emprestado: valorEmprestado ? Number(valorEmprestado) : null,
        p_observacao: observacao || null,
        p_cliente_id: modo === 'cliente' && escolhido ? escolhido.cliente_id : null,
        p_lead_id: modo === 'bf' && escolhido ? escolhido.lead_id : null,
        p_nome: modo === 'indicacao' ? nome.trim() : null,
        p_cpf: modo === 'indicacao' ? soDigitos(cpf) : null,
        p_telefone: modo === 'indicacao' ? soDigitos(telefone) : null,
      }
      const { data: vendaId, error } = await supabase.rpc('venda_criar', args)
      if (error) throw new Error(traduz(error.message))

      await subirArquivo(comprovante, vendaId, 'comprovante')
      if (ehBF && printCrefisa) await subirArquivo(printCrefisa, vendaId, 'crefisa')

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
    if (/duplicate key|uq_vendas/.test(m)) return 'Essa pessoa já tem uma venda registrada.'
    return m
  }

  return (
    <div style={s.fundo} onClick={() => !salvando && aoFechar && aoFechar()}>
      <div style={s.caixa} onClick={e => e.stopPropagation()}>
        <div style={s.titulo}>Nova venda</div>
        <div style={s.sub}>Toda venda precisa de comprovante para ser considerada completa.</div>

        {erro && <div style={s.erro}>{erro}</div>}

        <label style={s.label}>Produto</label>
        <div style={s.chips}>
          {produtos.map(p => (
            <button key={p.produto} style={{ ...s.chip, ...(produto === p.produto ? s.chipOn : {}) }}
              onClick={() => setProduto(p.produto)}>{p.produto}</button>
          ))}
        </div>

        <label style={s.label}>Quem é a cliente</label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {[
            ['cliente', 'Já é cliente'],
            ['bf', 'Lead Bolsa Família'],
            ['indicacao', 'Indicação (nova)'],
          ].map(([v, l]) => (
            <div key={v} style={{ ...s.aba, ...(modo === v ? s.abaOn : {}) }}
              onClick={() => { setModo(v); setEscolhido(null); setAchados([]) }}>{l}</div>
          ))}
        </div>

        {modo !== 'indicacao' ? (<>
          <input style={s.input} value={termo} autoFocus
            placeholder={modo === 'bf' ? 'CPF ou nome no funil do Bolsa Família...' : 'CPF ou nome da cliente...'}
            onChange={e => { setTermo(e.target.value); setEscolhido(null) }} />
          {buscando && <div style={s.vazio}>Procurando...</div>}
          {!buscando && termo.trim().length >= 3 && achados.length === 0 &&
            <div style={s.vazio}>
              Ninguém encontrado. Se for cliente nova, use <b>Indicação</b>.
            </div>}
          <div style={{ maxHeight: 210, overflowY: 'auto', marginBottom: 12, scrollbarWidth: 'thin' }}>
            {achados.map((a, i) => {
              const id = modo === 'bf' ? a.lead_id : a.cliente_id
              const sel = escolhido && (modo === 'bf' ? escolhido.lead_id === id : escolhido.cliente_id === id)
              return (
                <div key={i} style={s.achado(sel)} onClick={() => setEscolhido(a)}>
                  <div style={s.achadoNome}>
                    {a.nome || '(sem nome)'}
                    {a.ja_tem_venda && <span style={s.tagAviso}>já tem venda</span>}
                  </div>
                  <div style={s.achadoMeta}>
                    {cpfBonito(a.cpf) || 'sem CPF'} · {a.telefone || 'sem telefone'}
                    {modo === 'bf'
                      ? <> · {a.estado} · com {a.agente_atual}</>
                      : <> · {a.produto} · {a.situacao} · com {a.vendedor_atual}</>}
                  </div>
                </div>
              )
            })}
          </div>
        </>) : (<>
          <input style={s.input} value={nome} placeholder="Nome completo da cliente"
            onChange={e => setNome(e.target.value)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...s.input, flex: 1 }} value={cpf} placeholder="CPF"
              onChange={e => setCpf(e.target.value)} />
            <input style={{ ...s.input, flex: 1 }} value={telefone} placeholder="Telefone"
              onChange={e => setTelefone(e.target.value)} />
          </div>
          <input style={s.input} value={indicadoPor} placeholder="Quem indicou (opcional)"
            onChange={e => setIndicadoPor(e.target.value)} />
        </>)}

        {ehBF && (<>
          <label style={s.label}>Valor emprestado à cliente</label>
          <input style={s.input} type="number" step="0.01" value={valorEmprestado}
            placeholder="Ex: 850,00" onChange={e => setValorEmprestado(e.target.value)} />
        </>)}

        <label style={s.label}>Comprovante {ehBF ? '(além do print da Crefisa)' : ''}</label>
        <label style={{ ...s.arquivo, ...(comprovante ? s.arquivoOk : {}) }}>
          {comprovante ? '✓ ' + comprovante.name : 'Escolher arquivo — obrigatório'}
          <input type="file" accept="image/*,.pdf" style={{ display: 'none' }}
            onChange={e => setComprovante(e.target.files?.[0] || null)} />
        </label>

        {ehBF && (<>
          <label style={{ ...s.arquivo, ...(printCrefisa ? s.arquivoOk : {}) }}>
            {printCrefisa ? '✓ ' + printCrefisa.name : 'Print da Crefisa — obrigatório'}
            <input type="file" accept="image/*,.pdf" style={{ display: 'none' }}
              onChange={e => setPrintCrefisa(e.target.files?.[0] || null)} />
          </label>
          {(!printCrefisa || !(Number(valorEmprestado) > 0)) && (
            <div style={s.exigido}>
              No Bolsa Família, o que se vende é o empréstimo. Sem o valor e sem o print
              da Crefisa a venda fica <b>pendente</b> e não entra na sua produção.
            </div>
          )}
        </>)}

        <label style={s.label}>Observação (opcional)</label>
        <input style={s.input} value={observacao} placeholder="Algo que o time precise saber"
          onChange={e => setObservacao(e.target.value)} />

        <div style={s.acoes}>
          <button style={{ ...s.btn, ...(podeSalvar ? {} : s.btnOff) }}
            disabled={!podeSalvar} onClick={salvar}>
            {salvando ? 'Registrando...' : 'Registrar venda'}
          </button>
          <button style={s.btnSec} disabled={salvando} onClick={() => aoFechar && aoFechar()}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
