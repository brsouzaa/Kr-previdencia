import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import UploadDocumento from '../components/UploadDocumento'
import ValidacaoVendaIA from '../components/ValidacaoVendaIA'

const s = {
  card: { background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.08)', borderRadius: 14, padding: '1.5rem', marginBottom: 14 },
  label: { display: 'block', fontSize: 12, color: '#5b6b84', marginBottom: 4 },
  input: { width: '100%', padding: '10px 12px', fontSize: 14, border: '0.5px solid rgba(0,0,0,0.45)', borderRadius: 8, color: '#0f172a', background: '#ffffff', outline: 'none', boxSizing: 'border-box' },
  inputReadOnly: { width: '100%', padding: '10px 12px', fontSize: 14, border: '0.5px solid rgba(15,23,42,0.11)', borderRadius: 8, color: '#334155', background: '#e2e8f0', outline: 'none', boxSizing: 'border-box' },
  inputErr: { width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid #f87171', borderRadius: 8, color: '#0f172a', background: '#ffffff', outline: 'none', boxSizing: 'border-box' },
  // 19/10 — campo que a vendedora PRECISA digitar na mao. Amarelo forte + halo,
  // pra nao passar batido igual aconteceu no cadastro da MARIA EDUARDA (CEP 38288-000).
  inputFaltando: { width: '100%', padding: '10px 12px', fontSize: 14, border: '2px solid #f59e0b', borderRadius: 8, color: '#0f172a', background: '#fffbeb', outline: 'none', boxSizing: 'border-box', boxShadow: '0 0 0 3px rgba(245,158,11,.18)' },
  badgeAqui: { marginLeft: 8, fontSize: 10, fontWeight: 700, letterSpacing: '.4px', color: '#7c2d12', background: 'rgba(251,191,36,.3)', border: '1px solid #f59e0b', borderRadius: 999, padding: '2px 8px', textTransform: 'uppercase' },
  boxFalta: { background: 'rgba(251,191,36,.12)', border: '1.5px solid #f59e0b', borderRadius: 10, padding: '13px 15px', marginTop: 10, fontSize: 13, color: '#7c2d12', lineHeight: 1.65 },
  boxFaltaErro: { background: 'rgba(248,113,113,.14)', border: '1.5px solid #dc2626', borderRadius: 10, padding: '13px 15px', marginTop: 10, fontSize: 13, color: '#991b1b', lineHeight: 1.65 },
  select: { width: '100%', padding: '12px', fontSize: 15, border: '0.5px solid rgba(0,0,0,0.45)', borderRadius: 8, color: '#0f172a', background: '#ffffff', outline: 'none', boxSizing: 'border-box', fontWeight: 500 },
  textarea: { width: '100%', padding: '10px 12px', fontSize: 14, border: '0.5px solid rgba(0,0,0,0.45)', borderRadius: 8, color: '#0f172a', background: '#ffffff', outline: 'none', boxSizing: 'border-box', minHeight: 60, fontFamily: 'inherit', resize: 'vertical' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 },
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 },
  grid_rua_num: { display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 12, marginBottom: 12 },
  grid_cidade_uf: { display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 12, marginBottom: 12 },
  btn: { width: '100%', padding: '13px', background: '#60a5fa', color: '#232a37', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' },
  btnDisabled: { width: '100%', padding: '13px', background: '#64748b', color: '#232a37', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'not-allowed' },
  sectionTitle: { fontSize: 11, color: '#5b6b84', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12, fontWeight: 500, paddingBottom: 8, borderBottom: '0.5px solid rgba(15,23,42,0.06)' },
  hint: { fontSize: 11, color: '#5b6b84', marginTop: 4 },
  hintErr: { fontSize: 11, color: '#dc2626', marginTop: 4 },
  hintOk: { fontSize: 11, color: '#059669', marginTop: 4 },
  hintAcao: { fontSize: 11.5, color: '#b45309', marginTop: 4, fontWeight: 500 },
  warnBox: { background: 'rgba(251,191,36,.12)', border: '1px solid #fbbf24', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 12, color: '#b45309' },
  duplicadoBox: { background: 'rgba(248,113,113,.14)', border: '1px solid #A32D2D40', borderRadius: 8, padding: '12px 14px', marginBottom: 12, fontSize: 13, color: '#dc2626' },
  successBox: { background: 'rgba(52,211,153,.14)', border: '1.5px solid #3B6D1150', borderRadius: 14, padding: '1.5rem', textAlign: 'center' },
  productCard: (ativo, cor) => ({
    flex: 1, padding: '14px 12px', textAlign: 'center', borderRadius: 10,
    cursor: 'pointer', fontWeight: 500, fontSize: 13,
    background: ativo ? cor : '#ffffff',
    color: ativo ? '#232a37' : cor,
    border: `1.5px solid ${cor}${ativo ? '' : '40'}`,
    transition: 'all 0.15s',
  }),
}

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

const PRODUTOS = [
  { key: 'Maternidade', label: '🤰 Maternidade', cor: '#059669' },
  { key: 'Maternidade Mãe', label: '👶 Maternidade Mãe', cor: '#b45309' },
  { key: 'Gestante até 5 meses', label: '🤱 Gestante até 5 meses', cor: '#2563eb' },
  { key: 'BPC', label: '👴 BPC', cor: '#7c3aed' },
  { key: 'Auxilio Acidente', label: '🩹 Auxílio Acidente', cor: '#b45309' },
]

// ===== MOTIVO DE APROVACAO — Maternidade Mae (26/08) =====
// Obrigatorio no cadastro. Viaja em dados_produto.motivo_aprovacao ate a Fila de
// Entregas: quando o lote e montado no Drive, o advogado precisa saber POR QUE a
// cliente foi aprovada. Sem isso ele recebe a ficha no escuro.
const MOTIVO_FGTS = 'Cliente 24 meses de contribuição e enviou extrato FGTS comprovando desemprego involuntário por demissão'
const MOTIVOS_APROVACAO_MAE = [
  'Cliente 12 meses de contribuição',
  'Cliente 24 meses de contribuição e recebeu seguro-desemprego',
  MOTIVO_FGTS,
  'Cliente 24 meses de contribuição por ter 120 contribuições',
]

// ===== CONTATOS DE REFERENCIA (28/10, Bruno) =====
// Obrigatorios em TODO cadastro novo: 2 pessoas que conhecem a cliente, com o
// parentesco. Servem pra achar a cliente quando o numero dela some ou para de
// responder (assinatura, pos-venda, exigencia do INSS). Vai pra coluna nova
// clientes.contatos_referencia. Cadastro antigo fica como esta (nulo).
const PARENTESCOS = [
  'Mãe', 'Pai', 'Irmão / Irmã', 'Marido / Esposa / Companheiro(a)', 'Filho / Filha',
  'Avô / Avó', 'Tio / Tia', 'Primo / Prima', 'Sogro / Sogra', 'Cunhado / Cunhada',
  'Amigo / Amiga', 'Vizinho / Vizinha', 'Outro',
]
const REF_VAZIA = { nome: '', telefone: '', parentesco: '', parentesco_outro: '' }

function maskCPF(v) {
  v = (v || '').replace(/\D/g, '').slice(0, 11)
  if (v.length > 9) return v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2}).*/, '$1.$2.$3-$4')
  if (v.length > 6) return v.replace(/(\d{3})(\d{3})(\d{1,3}).*/, '$1.$2.$3')
  if (v.length > 3) return v.replace(/(\d{3})(\d{1,3}).*/, '$1.$2')
  return v
}
function maskRG(v) {
  v = (v || '').replace(/[^\dXx]/g, '').slice(0, 9).toUpperCase()
  if (v.length > 8) return v.replace(/(\d{2})(\d{3})(\d{3})(.{1}).*/, '$1.$2.$3-$4')
  if (v.length > 5) return v.replace(/(\d{2})(\d{3})(\d{1,3}).*/, '$1.$2.$3')
  if (v.length > 2) return v.replace(/(\d{2})(\d{1,3}).*/, '$1.$2')
  return v
}
function maskTel(v) {
  v = (v || '').replace(/\D/g, '').slice(0, 11)
  if (v.length > 10) return v.replace(/(\d{2})(\d{5})(\d{4}).*/, '($1) $2-$3')
  if (v.length > 6) return v.replace(/(\d{2})(\d{4})(\d{1,4}).*/, '($1) $2-$3')
  if (v.length > 2) return v.replace(/(\d{2})(\d{1,5}).*/, '($1) $2')
  if (v.length > 0) return v.replace(/(\d{1,2}).*/, '($1')
  return v
}
function maskCEP(v) {
  v = (v || '').replace(/\D/g, '').slice(0, 8)
  if (v.length > 5) return v.replace(/(\d{5})(\d{1,3}).*/, '$1-$2')
  return v
}
function maskNIS(v) {
  // NIS é 11 dígitos (ou 10 + 1 verificador), aceita com ou sem hífen
  v = (v || '').replace(/\D/g, '').slice(0, 11)
  if (v.length > 10) return v.replace(/(\d{10})(\d{1}).*/, '$1-$2')
  return v
}
function cpfValido(cpf) {
  cpf = (cpf || '').replace(/\D/g, '')
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false
  let sum = 0, rest
  for (let i = 1; i <= 9; i++) sum += parseInt(cpf.substring(i - 1, i)) * (11 - i)
  rest = (sum * 10) % 11
  if (rest === 10 || rest === 11) rest = 0
  if (rest !== parseInt(cpf.substring(9, 10))) return false
  sum = 0
  for (let i = 1; i <= 10; i++) sum += parseInt(cpf.substring(i - 1, i)) * (12 - i)
  rest = (sum * 10) % 11
  if (rest === 10 || rest === 11) rest = 0
  return rest === parseInt(cpf.substring(10, 11))
}
// 15/10 (Bruno) — data do banco (AAAA-MM-DD) no formato que a vendedora le.
// Usada no aviso de CPF repetido, pra ela comparar o filho na hora.
function dataBR(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''))
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}
function emailValido(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((e || '').trim()) }
function telValido(t) { return (t || '').replace(/\D/g, '').length >= 10 }
function normalizar(s) { return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim() }

// 23/10 (Bruno) — CPF QUE VEIO DA MESA DO RETROATIVO. O botao "Fechou! Cadastrar
// a venda" grava { cpf, em } no localStorage (chave kr_venda_cpf) e troca pra
// esta tela. Aqui le UMA vez e APAGA na hora — o recado nao pode sobrar pro
// proximo cadastro. So vale se tiver menos de 5 minutos: um recado velho (a
// pessoa clicou e nao veio pra ca) nao pode preencher sozinho um cadastro de
// outra cliente dias depois.
const RECADO_MESA_VALIDADE_MS = 5 * 60 * 1000
// 30/10 (Bruno): o recado agora traz tambem os dados do lead da mesa (nome, telefone
// — o novo da Assertiva, se a vendedora usou —, data do filho e o vinculo do Gerid).
function lerRecadoDaMesa() {
  let raw = null
  try {
    raw = window.localStorage.getItem('kr_venda_cpf')
    window.localStorage.removeItem('kr_venda_cpf')
  } catch (_) { return null }
  if (!raw) return null
  try {
    const j = JSON.parse(raw)
    if (!j || typeof j !== 'object') return null
    if (!(Date.now() - Number(j.em || 0) < RECADO_MESA_VALIDADE_MS)) return null
    const d = String(j.cpf || '').replace(/\D/g, '')
    if (d.length !== 11) return null
    return { cpf: d, lead: j.lead && typeof j.lead === 'object' ? j.lead : null }
  } catch (_) { return null }
}

// 30/10 (Bruno) — PRE-PREENCHIMENTO. Helpers de formato.
// "29/08/2022" -> "2022-08-29" (campo date); ISO passa direto.
function dataISO(v) {
  const t = String(v || '').trim()
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(t)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : ''
}
// telefone do banco (+5511999998888 / 5511...) -> (11) 99999-8888
function telDoBanco(v) {
  let d = String(v || '').replace(/\D/g, '')
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2)
  return d.length >= 10 ? maskTel(d) : ''
}
const urlOk = (u) => (typeof u === 'string' && /^https?:\/\//.test(u) ? u : null)
// perfil da validacao da I.A -> motivo de aprovacao do cadastro (mesmos textos de MOTIVOS_APROVACAO_MAE)
const MOTIVO_DO_PERFIL = {
  '12_clt': 'Cliente 12 meses de contribuição',
  '12_contrib': 'Cliente 12 meses de contribuição',
  '24_seguro': 'Cliente 24 meses de contribuição e recebeu seguro-desemprego',
  '24_fgts': MOTIVO_FGTS,
  '24_120': 'Cliente 24 meses de contribuição por ter 120 contribuições',
}
const PERFIL_NOME = {
  '12_clt': '12 meses — CLT', '12_contrib': '12 meses — facultativa/autônoma', '24_seguro': '24 meses — seguro-desemprego',
  '24_fgts': '24 meses — FGTS/judicial', '24_120': '24 meses — 120 contribuições',
}

export default function NovoCliente({ onSucesso }) {
  const { profile } = useAuth()
  const [enviando, setEnviando] = useState(false)
  const [salvo, setSalvo] = useState(null)
  // 20/10 — resultado da validacao da venda pela I.A. So vale no Maternidade Mae.
  // Sem { resultado: 'aprovado' } aqui, o botao de cadastrar nao libera.
  const [validacao, setValidacao] = useState(null)
  // 30/10 (Bruno) — pre-preenchimento: de onde vieram os dados (aviso na tela),
  // versao dos documentos (remonta os uploads do RG) e a chave cpf|filho|motivo da
  // validacao reaproveitada (pra o reset abaixo nao apagar a aprovacao que acabou de carregar)
  const [prefill, setPrefill] = useState(null)
  const [docsVersao, setDocsVersao] = useState(0)
  const [revalidar, setRevalidar] = useState(false)
  // validacao aprovada reaproveitada (mesmo CPF, mesmo filho, mesmo motivo). E DERIVADA a cada render:
  // se a vendedora trocar CPF, filho ou motivo, deixa de valer na hora (igual a regra de 20/10).
  const [reuso, setReuso] = useState(null)
  const prefillCpfRef = useRef('')

  const [c, setC] = useState({
    produto: '', // vazio inicialmente — vendedor escolhe primeiro
    nome:'', cpf:'', rg:'', telefone:'', email:'',
    cep:'', rua:'', numero:'', bairro:'', cidade:'', uf:'',
    observacao: '',
    // Campos extras (Maternidade)
    nis: '', data_prevista_parto: '', meses_gravidez: '',
    // Campos extras (Maternidade Mãe) — mesmo schema dados_produto da Ana/B2C
    data_nascimento_bebe: '', ja_trabalhou_clt: '', trabalhava_no_nascimento: '',
    recebeu_seguro_desemprego: '', saida_emprego_mes_ano: '',
    motivo_aprovacao: '',
  })

  const [docs, setDocs] = useState({
    rg_frente: null, rg_verso: null,
    comprovante_1: null, comprovante_2: null,
    comprovante_endereco: null,
    extrato_fgts: null,
  })

  const [refs, setRefs] = useState([{ ...REF_VAZIA }, { ...REF_VAZIA }])
  function setRef(i, campo, valor) {
    setRefs(rs => rs.map((r, j) => (j === i ? { ...r, [campo]: valor } : r)))
  }

  const [duplicado, setDuplicado] = useState(null)
  const [verificandoCpf, setVerificandoCpf] = useState(false)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [cepStatus, setCepStatus] = useState(null)
  const [endLockado, setEndLockado] = useState(false)
  // 19/10 — guarda o que o CEP NAO trouxe. Tem que ser estado proprio, e nao
  // "c.rua esta vazia": se fosse calculado do valor atual, o campo travaria de
  // novo no exato momento em que a vendedora digitasse a primeira letra.
  const [cepSemRua, setCepSemRua] = useState(false)
  const [cepSemBairro, setCepSemBairro] = useState(false)
  const [cidadesUF, setCidadesUF] = useState([])
  const [cidadeStatus, setCidadeStatus] = useState(null)
  const ufCarregadaRef = useRef(null)
  const ruaRef = useRef(null)
  const bairroRef = useRef(null)

  // ID temporário usado pra agrupar uploads antes de salvar
  const tempIdRef = useRef(`temp_${Date.now()}_${Math.random().toString(36).slice(2,8)}`)

  function set(f, v) { setC(c => ({ ...c, [f]: v })) }
  function setDoc(chave, url) { setDocs(d => ({ ...d, [chave]: url })) }

  // === Verificar CPF duplicado em tempo real ===
  // Status que LIBERAM recadastro (cliente "morto"): expirado, cancelado, barrado_pos_venda
  // Qualquer outro status = cliente ainda "vivo" no sistema, bloqueia se for outro vendedor
  async function verificarCpfDuplicado(cpf) {
    if (!cpf || !cpfValido(cpf)) { setDuplicado(null); return }
    setVerificandoCpf(true)
    try {
      // Busca o cliente mais recente com mesmo CPF que NÃO esteja "morto"
      // 15/10 (Bruno): + produto e dados_produto. No Maternidade Mae a cliente pode
      // ter DOIS filhos com direito, e cada filho e um cadastro separado. Sem mostrar
      // QUAL filho ja esta cadastrado, a vendedora le "ja existe" e para no meio —
      // foi o que travou a Gislaine no CPF 126.605.766-88.
      const { data } = await supabase.from('clientes')
        .select('id, nome, status, vendedor_operador_id, setor, produto, dados_produto, profiles!clientes_vendedor_operador_id_fkey(nome)')
        .eq('cpf', cpf)
        .not('status', 'in', '(expirado,cancelado,barrado_pos_venda)')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (data) {
        const vendedorMesmo = data.vendedor_operador_id === profile.id
        setDuplicado({
          nome: data.nome,
          status: data.status,
          setor: data.setor,
          produto: data.produto,
          // so existe no Maternidade Mae; nos outros produtos fica vazio e o aviso
          // nem mostra a linha do filho
          filho: dataBR((data.dados_produto || {}).data_nascimento_bebe),
          vendedorNome: data.profiles?.nome || 'outro vendedor',
          vendedorMesmo,
        })
      } else { setDuplicado(null) }
    } catch (e) { setDuplicado(null) }
    setVerificandoCpf(false)
  }

  // 23/10 (Bruno) — veio da Mesa do Retroativo pelo botao "Fechou! Cadastrar a
  // venda": ja abre no Maternidade Mae (a mesa so tem esse produto) com o CPF
  // preenchido, e roda a mesma checagem de CPF repetido que o campo faz ao sair
  // dele. O produto continua trocavel pelo "trocar" do topo. Sem recado valido
  // (abriu a tela pelo menu), nada muda.
  useEffect(() => {
    const r = lerRecadoDaMesa()
    if (!r) return
    const cpf = maskCPF(r.cpf)
    setC(prev => ({ ...prev, produto: prev.produto || 'Maternidade Mãe', cpf }))
    verificarCpfDuplicado(cpf)
    preencherDoHistorico(cpf, r.lead, 'Maternidade Mãe')
    // eslint-disable-next-line
  }, [])

  // 30/10 (Bruno) — PRE-PREENCHIMENTO. Fontes, nesta ordem de prioridade:
  //   1) lead da Mesa do Retroativo (so quando veio pelo botao "Fechou!"): nome, telefone, filho, vinculo do Gerid
  //   2) validacao da I.A APROVADA nos ultimos 7 dias, feita pela PROPRIA vendedora (mesmo CPF): filho + motivo,
  //      e a aprovacao e reaproveitada (nao roda a I.A de novo)
  //   3) ultimo cadastro CANCELADO, EXPIRADO ou BARRADO NO POS-VENDA desse CPF que foi DA PROPRIA vendedora: dados pessoais,
  //      endereco, referencias, dados do Maternidade Mae e o RG (frente/verso). Outros documentos NAO.
  // Regra: so completa campo VAZIO — nunca apaga o que a vendedora digitou. Os dados vem da RPC
  // novo_cliente_prefill (o banco so devolve o que e da propria vendedora; admin ve tudo).
  async function preencherDoHistorico(cpfMask, lead, produtoAtual) {
    const d = String(cpfMask || '').replace(/\D/g, '')
    if (d.length !== 11 || !cpfValido(d) || prefillCpfRef.current === d) return
    prefillCpfRef.current = d
    let hist = null
    try {
      const { data, error } = await supabase.rpc('novo_cliente_prefill', { p_cpf: d })
      if (!error) hist = data || null
    } catch (_) { hist = null }
    const cli = hist?.cliente || null
    const val = hist?.validacao || null
    const dp = (cli && cli.dados_produto) || {}
    const vinc = lead?.vinculo || null
    // novo vinculo do Gerid da mesa: emprego encerrado antes do parto => ja trabalhou CLT, nao trabalhava no parto
    const dnMesa = dataISO(lead?.dn)
    let clt = null
    if (vinc && /empregad|dom[eé]stic/i.test(String(vinc.tipo || '')) && !vinc.ehBeneficio) {
      const fim = dataISO(vinc.fim)
      if (fim && (!dnMesa || fim < dnMesa)) clt = { ja: 'sim', trab: 'nao', saida: `${fim.slice(5, 7)}/${fim.slice(0, 4)}` }
    }
    const simNao = (b) => (b === true ? 'sim' : b === false ? 'nao' : '')
    const origem = []
    if (lead) origem.push('Mesa do Retroativo')
    if (cli) origem.push(`cadastro ${cli.status === 'cancelado' ? 'cancelado' : cli.status === 'barrado_pos_venda' ? 'barrado no pós-venda' : 'expirado'} de ${dataBR(String(cli.criado_em || '').slice(0, 10))}`)
    if (!origem.length && !val) { return }

    // filho: mesa > validacao > cadastro anterior
    const dnVal = dataISO(val?.dn)
    const dnFinal = dnMesa || dnVal || dataISO(dp.data_nascimento_bebe)
    // validacao reaproveitada so se for do MESMO filho que vai ficar na tela
    const usarVal = !!val && (produtoAtual || c.produto || 'Maternidade Mãe') === 'Maternidade Mãe' && !!dnVal && dnVal === dnFinal
    const motivoFinal = (usarVal && MOTIVO_DO_PERFIL[val.perfil]) || dp.motivo_aprovacao || ''

    const novo = {}
    const v = (x) => (x == null ? '' : String(x).trim())
    setC(prev => {
      const n = { ...prev }
      const pega = (campo, valor) => { if (!v(n[campo]) && v(valor)) { n[campo] = valor; novo[campo] = true } }
      pega('nome', v(lead?.nome).toUpperCase() || v(cli?.nome))
      pega('telefone', telDoBanco(lead?.tel) || telDoBanco(cli?.telefone))
      pega('rg', cli?.rg ? maskRG(cli.rg) : '')
      pega('email', cli?.email)
      pega('numero', cli?.numero)
      pega('data_nascimento_bebe', dnFinal)
      pega('ja_trabalhou_clt', clt?.ja || simNao(dp.ja_trabalhou_clt))
      pega('trabalhava_no_nascimento', clt?.trab || simNao(dp.trabalhava_no_nascimento))
      pega('saida_emprego_mes_ano', clt?.saida || (/^\d{2}\/\d{4}$/.test(v(dp.saida_emprego_mes_ano)) ? v(dp.saida_emprego_mes_ano) : ''))
      pega('recebeu_seguro_desemprego', simNao(dp.recebeu_seguro_desemprego))
      pega('motivo_aprovacao', motivoFinal)
      return n
    })
    if (usarVal) { setRevalidar(false); setReuso({ ...val, cpf: d }) }
    // referencias (so se as duas estao vazias)
    const refsAnt = Array.isArray(cli?.contatos_referencia) ? cli.contatos_referencia : []
    if (refsAnt.length) {
      setRefs(rs => (rs.every(r => !r.nome.trim() && !r.telefone.trim())
        ? [0, 1].map(i => {
            const r = refsAnt[i] || {}
            return { ...REF_VAZIA, nome: v(r.nome), telefone: telDoBanco(r.telefone), parentesco: v(r.parentesco), parentesco_outro: v(r.parentesco_outro) }
          })
        : rs))
    }
    // RG do cadastro anterior (frente/verso). Outros documentos a vendedora anexa de novo.
    const rgF = urlOk(cli?.rg_frente), rgV = urlOk(cli?.rg_verso)
    if (rgF || rgV) {
      setDocs(dd => ({ ...dd, rg_frente: dd.rg_frente || rgF, rg_verso: dd.rg_verso || rgV }))
      setDocsVersao(x => x + 1)
    }
    // endereco: pelo CEP (mesmo caminho da digitacao, trava os campos certos), depois completa rua/bairro vazios
    if (cli?.cep && !String(c.cep || '').replace(/\D/g, '')) {
      const cepM = maskCEP(cli.cep)
      setC(prev => ({ ...prev, cep: prev.cep || cepM }))
      await buscarCep(cepM)
      setC(prev => ({ ...prev,
        rua: prev.rua || v(cli.rua).toUpperCase(), bairro: prev.bairro || v(cli.bairro).toUpperCase(),
        cidade: prev.cidade || v(cli.cidade).toUpperCase(), uf: prev.uf || v(cli.uf).toUpperCase() }))
    }
    setPrefill({ origem, validacao: usarVal ? val : null, dnAnterior: cli ? dataBR(dp.data_nascimento_bebe) : '' })
  }

  async function buscarCep(cepRaw) {
    const cep = (cepRaw || '').replace(/\D/g, '')
    if (cep.length !== 8) { setCepStatus(null); return }
    setBuscandoCep(true); setCepStatus(null)
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      const j = await r.json()
      if (j.erro) {
        setCepStatus('erro'); setEndLockado(false)
        setCepSemRua(false); setCepSemBairro(false)
        setC(c => ({ ...c, rua:'', bairro:'', cidade:'', uf:'' }))
        setCidadeStatus(null)
      } else {
        // 19/10 — CEP de cidade inteira (ex.: 38288-000, Uniao de Minas/MG) volta do
        // ViaCEP com logradouro e bairro VAZIOS. Antes os dois ficavam cinza/readonly
        // junto com cidade e UF, a tela dizia "endereco encontrado" e o cadastro
        // travava sem dizer o motivo. Agora o cadeado e por campo: so fica travado
        // o que o CEP realmente preencheu.
        const vLog = (j.logradouro || '').toUpperCase()
        const vBai = (j.bairro || '').toUpperCase()
        setC(c => ({ ...c,
          rua: vLog,
          bairro: vBai,
          cidade: (j.localidade || '').toUpperCase(),
          uf: (j.uf || '').toUpperCase(),
        }))
        setCepSemRua(!vLog.trim())
        setCepSemBairro(!vBai.trim())
        setCepStatus('ok'); setEndLockado(true); setCidadeStatus('ok')
      }
    } catch (e) { setCepStatus('erro'); setEndLockado(false) }
    setBuscandoCep(false)
  }

  function onCepChange(v) {
    const masked = maskCEP(v); set('cep', masked)
    const limpo = masked.replace(/\D/g, '')
    if (limpo.length === 8) buscarCep(limpo)
    else { setCepStatus(null); setEndLockado(false); setCidadeStatus(null); setCepSemRua(false); setCepSemBairro(false) }
  }

  // 19/10 — joga o cursor direto no campo que falta assim que o CEP volta
  // incompleto. Sem isso a vendedora le o aviso, nao sabe onde clicar e desiste.
  useEffect(() => {
    if (cepSemRua && ruaRef.current) { try { ruaRef.current.focus() } catch (e) {} }
    else if (cepSemBairro && bairroRef.current) { try { bairroRef.current.focus() } catch (e) {} }
  }, [cepSemRua, cepSemBairro])

  async function carregarCidadesUF(uf) {
    if (!uf || uf.length !== 2) { setCidadesUF([]); return }
    if (ufCarregadaRef.current === uf && cidadesUF.length) return
    try {
      const r = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`)
      const j = await r.json()
      setCidadesUF((j || []).map(x => x.nome))
      ufCarregadaRef.current = uf
    } catch (e) { setCidadesUF([]) }
  }

  useEffect(() => {
    if (endLockado) return
    if (!c.cidade || !c.uf || c.uf.length !== 2) { setCidadeStatus(null); return }
    if (!UFS.includes(c.uf)) { setCidadeStatus('erro'); return }
    carregarCidadesUF(c.uf).then(() => {
      const lista = ufCarregadaRef.current === c.uf ? cidadesUF : []
      if (!lista.length) { setCidadeStatus(null); return }
      const ok = lista.some(x => normalizar(x) === normalizar(c.cidade))
      setCidadeStatus(ok ? 'ok' : 'erro')
    })
    // eslint-disable-next-line
  }, [c.cidade, c.uf, endLockado])

  useEffect(() => {
    if (endLockado) return
    if (!cidadesUF.length || !c.cidade) return
    const ok = cidadesUF.some(x => normalizar(x) === normalizar(c.cidade))
    setCidadeStatus(ok ? 'ok' : 'erro')
    // eslint-disable-next-line
  }, [cidadesUF])

  // 20/10 — a I.A analisou UM conjunto de dados. Se o vendedor mexer no CPF, na
  // data de nascimento do bebe ou no motivo da aprovacao depois de aprovado, o
  // parecer nao vale mais pro que esta na tela agora: zera e obriga validar de novo.
  useEffect(() => { setValidacao(null) },
    [c.cpf, c.data_nascimento_bebe, c.motivo_aprovacao])
  // 30/10: validacao reaproveitada so vale se CPF, filho e motivo forem exatamente os que ela aprovou
  const reusoOk = !!reuso && !revalidar && String(c.cpf || '').replace(/\D/g, '') === reuso.cpf &&
    c.data_nascimento_bebe === dataISO(reuso.dn) && c.motivo_aprovacao === MOTIVO_DO_PERFIL[reuso.perfil]
  const validacaoEfetiva = validacao || (reusoOk
    ? { ok: true, id: reuso.id, perfil: reuso.perfil, resultado: 'aprovado', reaproveitada: true, em: reuso.em } : null)

  const camposBasicosOk = c.nome.trim() && c.cpf && c.rg && c.telefone &&
                          c.email.trim() && c.cep &&
                          c.rua.trim() && c.numero.trim() && c.bairro.trim() &&
                          c.cidade.trim() && c.uf
  const cpfOk = cpfValido(c.cpf)
  const emailOk = emailValido(c.email)
  const telOk = telValido(c.telefone)
  const cepOk = c.cep.replace(/\D/g, '').length === 8
  const ufOk = UFS.includes(c.uf)
  const cidadeOk = cidadeStatus === 'ok'

  // Campos extras Maternidade (e Gestante até 5 meses — ambas são grávidas, mesmos campos)
  const camposMatOk = (c.produto !== 'Maternidade' && c.produto !== 'Gestante até 5 meses') || (
    c.nis && c.data_prevista_parto && c.meses_gravidez.trim()
  )

  // Campos extras Maternidade Mãe (bebê já nascido): data nascimento + vínculo CLT sempre;
  // se já trabalhou CLT e NÃO trabalhava no nascimento, o mês/ano de saída é obrigatório.
  const camposMaeOk = c.produto !== 'Maternidade Mãe' || (
    c.data_nascimento_bebe && c.ja_trabalhou_clt !== '' && c.trabalhava_no_nascimento !== '' &&
    (c.ja_trabalhou_clt !== 'sim' || c.trabalhava_no_nascimento === 'sim' || c.saida_emprego_mes_ano.trim()) &&
    c.motivo_aprovacao   // 26/08: motivo de aprovação é obrigatório no Maternidade Mãe
  )

  // 31/08 (Bruno): no Maternidade Mãe, CTPS digital e extrato FGTS passaram a ser
  // obrigatórios SEMPRE — não mais só no motivo que se apoiava no FGTS.
  // É o advogado que precisa dos dois para montar o processo; sem eles a peça
  // volta e a venda cai lá na frente.
  const ehMae = c.produto === 'Maternidade Mãe'
  const fgtsObrigatorio = ehMae
  const ctpsObrigatorio = ehMae
  const fgtsOk = !fgtsObrigatorio || !!docs.extrato_fgts
  const ctpsOk = !ctpsObrigatorio || !!docs.ctps_digital

  // Documentos obrigatórios: RG frente/verso + comprovantes 1 e 2, e no
  // Maternidade Mãe também CTPS digital e extrato FGTS.
  const docsOk = docs.rg_frente && docs.rg_verso && docs.comprovante_1 && docs.comprovante_2
                 && fgtsOk && ctpsOk

  // Duplicado bloqueia? Só se for OUTRO vendedor (mesmo vendedor pode recadastrar)
  const duplicadoBloqueia = duplicado && !duplicado.vendedorMesmo

  // 20/10 — validacao da venda pela I.A: obrigatoria SO no Maternidade Mae.
  // Nos outros produtos nada muda (o componente nem aparece).
  const validacaoIaOk = !ehMae || validacaoEfetiva?.resultado === 'aprovado'

  // 28/10 — contatos de referencia: nome, telefone valido e parentesco nos dois.
  // O telefone nao pode ser o da propria cliente nem repetir entre os dois:
  // referencia que cai no mesmo numero nao serve pra nada.
  const telCliente = (c.telefone || '').replace(/\D/g, '')
  const refsInfo = refs.map((r, i) => {
    const tel = (r.telefone || '').replace(/\D/g, '')
    const outroTel = (refs[1 - i].telefone || '').replace(/\D/g, '')
    return {
      nomeOk: r.nome.trim().length >= 3,
      telOk: telValido(r.telefone),
      telIgualCliente: tel.length >= 10 && tel === telCliente,
      telRepetido: i === 1 && tel.length >= 10 && tel === outroTel,
      parentescoOk: !!r.parentesco && (r.parentesco !== 'Outro' || r.parentesco_outro.trim().length >= 3),
    }
  })
  const refsOk = refsInfo.every(x => x.nomeOk && x.telOk && !x.telIgualCliente && !x.telRepetido && x.parentescoOk)

  const tudoOk = c.produto && camposBasicosOk && cpfOk && emailOk && telOk && cepOk && ufOk && cidadeOk && !duplicadoBloqueia && camposMatOk && camposMaeOk && refsOk && docsOk && validacaoIaOk

  async function salvar() {
    if (!tudoOk || enviando) return
    setEnviando(true)
    try {
      const payload = {
        vendedor_operador_id: profile.id,
        nome: c.nome, cpf: c.cpf, rg: c.rg,
        telefone: c.telefone, email: c.email,
        cep: c.cep, rua: c.rua, numero: c.numero, bairro: c.bairro,
        cidade: c.cidade, uf: c.uf,
        produto: c.produto, observacao: c.observacao || null,
        documentos: docs,
        status: 'aguardando_emissao',
        // 28/10 — 2 contatos de referencia (obrigatorios na tela)
        contatos_referencia: refs.map(r => ({
          nome: r.nome.trim(),
          telefone: r.telefone.replace(/\D/g, ''),
          parentesco: r.parentesco,
          parentesco_outro: r.parentesco === 'Outro' ? r.parentesco_outro.trim() : null,
        })),
      }
      // Campos extras pra Maternidade e Gestante até 5 meses (ambas grávidas)
      if (c.produto === 'Maternidade' || c.produto === 'Gestante até 5 meses') {
        payload.nis = c.nis
        payload.data_prevista_parto = c.data_prevista_parto
        payload.meses_gravidez = c.meses_gravidez
      }

      // Campos extras Maternidade Mãe -> dados_produto (mesmo schema da Ana/B2C)
      if (c.produto === 'Maternidade Mãe') {
        const jaClt = c.ja_trabalhou_clt === 'sim'
        const trabNasc = c.trabalhava_no_nascimento === 'sim'
        payload.dados_produto = {
          data_nascimento_bebe: c.data_nascimento_bebe,
          ja_trabalhou_clt: jaClt,
          trabalhava_no_nascimento: trabNasc,
          recebeu_seguro_desemprego: c.recebeu_seguro_desemprego === 'sim',
          // 26/08: motivo segue com a ficha ate a Fila de Entregas / Drive do advogado
          motivo_aprovacao: c.motivo_aprovacao,
          motivo_aprovacao_por: (profile && profile.nome) || null,
          ...(jaClt && !trabNasc && c.saida_emprego_mes_ano.trim()
            ? { saida_emprego_mes_ano: c.saida_emprego_mes_ano.trim() } : {}),
          // 20/10 — rastro da validacao da I.A que liberou esta venda. O id aponta
          // pra linha em public.venda_validacao_ia (documentos analisados, motivos
          // e parecer), entao da pra auditar depois por que a venda passou.
          ...(validacaoEfetiva?.id ? { validacao_ia_id: validacaoEfetiva.id } : {}),
          ...(validacaoEfetiva?.perfil ? { validacao_ia_perfil: validacaoEfetiva.perfil } : {}),
        }
      }

      const { data, error } = await supabase.from('clientes').insert(payload).select().single()
      if (error) {
        // Trigger do banco bloqueou CPF duplicado
        if (/CPF_DUPLICADO/i.test(error.message)) {
          // Extrai mensagem amigável (depois de "CPF_DUPLICADO:")
          const msgAmigavel = error.message.replace(/.*CPF_DUPLICADO:\s*/i, '').trim()
          setDuplicado({ nome: 'um cliente', status: 'cadastro_existente', setor: null, vendedorNome: 'outro vendedor', vendedorMesmo: false })
          alert('❌ ' + (msgAmigavel || 'Este CPF já está cadastrado e em atendimento. Aguarde a finalização.'))
        } else if (/VALIDACAO_IA/i.test(error.message)) {
          // 20/10 — trava do banco (trigger trg_venda_validacao_ia_gate). O erro
          // tecnico nao ajuda quem esta na tela: traduz pra acao.
          alert('Esta venda ainda não foi aprovada pela I.A. Valide os documentos antes de enviar.')
          setValidacao(null)
        } else if (error.code === '23505' || /unique|duplicat/i.test(error.message)) {
          setDuplicado({ nome: 'um cliente', status: 'aguardando_emissao', setor: null, vendedorNome: 'no sistema', vendedorMesmo: false })
          alert('Este CPF já está cadastrado no sistema.')
        } else { throw error }
        setEnviando(false); return
      }
      setSalvo(data)
    } catch (err) {
      // 30/10 (Bruno): explicar o motivo em vez de "TypeError: Failed to fetch".
      // Os dados e documentos continuam no formulario: e so corrigir e salvar de novo.
      const msg = String((err && (err.message || err.toString())) || '')
      if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
        alert('⚠️ Sem conexão com o sistema — o cadastro NÃO foi salvo.\n\n' +
          'A internet desta máquina caiu ou algo bloqueou o envio (antivírus, VPN ou extensão do navegador).\n' +
          'Os dados e documentos continuam preenchidos: confira a internet e clique em salvar de novo.\n' +
          'Se acontecer de novo, tente em outro navegador ou em aba anônima e avise o suporte com o horário.')
      } else {
        alert('Erro ao salvar — o cadastro NÃO foi salvo.\n\nMotivo: ' + msg + (err && err.code ? ' (código ' + err.code + ')' : '') +
          '\n\nOs dados continuam preenchidos. Tire um print desta mensagem e envie ao suporte.')
      }
    }
    setEnviando(false)
  }

  function novoCadastro() {
    setC({ produto: '', nome:'', cpf:'', rg:'', telefone:'', email:'', cep:'', rua:'', numero:'', bairro:'', cidade:'', uf:'', observacao: '', nis:'', data_prevista_parto:'', meses_gravidez:'', data_nascimento_bebe:'', ja_trabalhou_clt:'', trabalhava_no_nascimento:'', recebeu_seguro_desemprego:'', saida_emprego_mes_ano:'', motivo_aprovacao:'' })
    setDocs({ rg_frente: null, rg_verso: null, comprovante_1: null, comprovante_2: null, comprovante_endereco: null, extrato_fgts: null })
    setCepStatus(null); setEndLockado(false); setCidadeStatus(null); setSalvo(null); setDuplicado(null)
    setCepSemRua(false); setCepSemBairro(false); setValidacao(null)
    setRefs([{ ...REF_VAZIA }, { ...REF_VAZIA }])
    setPrefill(null); setRevalidar(false); setReuso(null); prefillCpfRef.current = ''
    tempIdRef.current = `temp_${Date.now()}_${Math.random().toString(36).slice(2,8)}`
  }

  if (salvo) return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: 20, fontWeight: 500, color: '#0f172a', marginBottom: 4 }}>➕ Novo cliente</div>
      </div>
      <div style={s.successBox}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
        <div style={{ fontSize: 16, fontWeight: 500, color: '#059669', marginBottom: 6 }}>Cliente cadastrado!</div>
        <div style={{ fontSize: 14, color: '#5b6b84', marginBottom: 4 }}>{salvo.nome}</div>
        <div style={{ fontSize: 12, color: '#5b6b84', marginBottom: 20 }}>Aguardando emissão pela supervisão. O link aparece em "Meus clientes" assim que estiver pronto.</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={novoCadastro} style={{ flex: 1, padding: '10px', background: '#60a5fa', color: '#232a37', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
            ➕ Novo cliente
          </button>
          {onSucesso && (
            <button onClick={() => onSucesso()} style={{ flex: 1, padding: '10px', background: '#ffffff', color: '#2563eb', border: '1px solid #60a5fa', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
              📋 Ver meus clientes
            </button>
          )}
        </div>
      </div>
    </div>
  )

  // === Tela 1: Selecionar produto ===
  if (!c.produto) return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: 20, fontWeight: 500, color: '#0f172a', marginBottom: 4 }}>➕ Novo cliente</div>
        <div style={{ fontSize: 13, color: '#5b6b84' }}>Comece selecionando o produto que você está vendendo</div>
      </div>

      <div style={s.card}>
        <div style={s.sectionTitle}>Qual produto você está vendendo?</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {PRODUTOS.map(p => (
            <button key={p.key} onClick={() => set('produto', p.key)}
              style={{
                padding: '20px 16px', textAlign: 'left', borderRadius: 10,
                cursor: 'pointer', background: '#ffffff',
                border: `1.5px solid ${p.cor}30`, color: '#0f172a',
                fontSize: 15, fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
              <span style={{ fontSize: 24 }}>{p.label.split(' ')[0]}</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: p.cor, fontWeight: 600 }}>{p.label.split(' ').slice(1).join(' ')}</div>
                <div style={{ fontSize: 12, color: '#5b6b84', marginTop: 2 }}>
                  {p.key === 'Maternidade' ? 'Salário-maternidade — pede NIS, data do parto e meses de gravidez' :
                   p.key === 'Maternidade Mãe' ? 'Bebê já nascido (retroativo) — pede data de nascimento e vínculo CLT' :
                   p.key === 'BPC' ? 'BPC/LOAS — Benefício de Prestação Continuada' :
                   'Auxílio acidente do INSS'}
                </div>
              </div>
              <span style={{ color: p.cor, fontSize: 18 }}>→</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  const mostrarEndereco = cepStatus === 'ok' || cepStatus === 'erro'

  // 19/10 — cadeado POR CAMPO. Rua e bairro que o CEP nao trouxe nascem editaveis.
  const ruaLockada = endLockado && !cepSemRua
  const bairroLockado = endLockado && !cepSemBairro
  // campo editavel, obrigatorio e ainda em branco = pinta de amarelo e avisa
  const precisaDigitarRua = mostrarEndereco && !ruaLockada && !c.rua.trim()
  const precisaDigitarBairro = mostrarEndereco && !bairroLockado && !c.bairro.trim()
  const cepIncompleto = cepStatus === 'ok' && (cepSemRua || cepSemBairro)

  const inputCidade = endLockado ? s.inputReadOnly : (cidadeStatus === 'erro' ? s.inputErr : s.input)
  const inputUF = endLockado ? s.inputReadOnly : (c.uf && !ufOk ? s.inputErr : s.input)
  const inputRua = ruaLockada ? s.inputReadOnly : (precisaDigitarRua ? s.inputFaltando : s.input)
  const inputBairro = bairroLockado ? s.inputReadOnly : (precisaDigitarBairro ? s.inputFaltando : s.input)

  // 19/10 — a tela SABE qual campo falta e nao contava: o rodape dizia so
  // "Preencha todos os campos corretamente". Foi o que travou o Ronaldo no
  // cadastro da MARIA EDUARDA (CEP 38288-000, cidade sem rua nos Correios).
  // Agora lista campo por campo, na ordem em que aparecem no formulario.
  function listaFaltando() {
    const f = []
    if (!c.nome.trim()) f.push('Nome completo')
    if (!c.cpf) f.push('CPF'); else if (!cpfOk) f.push('CPF (número inválido)')
    if (!c.rg.trim()) f.push('RG')
    if (!c.telefone) f.push('Telefone'); else if (!telOk) f.push('Telefone (incompleto)')
    if (!c.email.trim()) f.push('E-mail'); else if (!emailOk) f.push('E-mail (formato inválido)')
    if (!c.cep) f.push('CEP'); else if (!cepOk) f.push('CEP (incompleto)')
    if (mostrarEndereco) {
      if (!c.rua.trim()) f.push('Rua')
      if (!c.numero.trim()) f.push('Número')
      if (!c.bairro.trim()) f.push('Bairro')
      if (!c.cidade.trim()) f.push('Cidade')
      else if (!cidadeOk) f.push('Cidade (não confere com a UF)')
      if (!c.uf) f.push('UF'); else if (!ufOk) f.push('UF (inválida)')
    }
    if (c.produto === 'Maternidade' || c.produto === 'Gestante até 5 meses') {
      if (!c.nis) f.push('NIS')
      if (!c.data_prevista_parto) f.push('Data prevista do parto')
      if (!c.meses_gravidez.trim()) f.push('Meses de gravidez')
    }
    if (ehMae) {
      if (!c.data_nascimento_bebe) f.push('Data de nascimento do bebê')
      if (c.ja_trabalhou_clt === '') f.push('Já trabalhou de carteira assinada?')
      if (c.trabalhava_no_nascimento === '') f.push('Estava trabalhando quando o bebê nasceu?')
      if (c.ja_trabalhou_clt === 'sim' && c.trabalhava_no_nascimento === 'nao' && !c.saida_emprego_mes_ano.trim())
        f.push('Mês/ano que saiu do último emprego')
      if (!c.motivo_aprovacao) f.push('Por que essa cliente foi aprovada?')
    }
    refsInfo.forEach((x, i) => {
      const n = `Referência ${i + 1}`
      if (!x.nomeOk) f.push(`${n}: nome`)
      if (!refs[i].telefone) f.push(`${n}: telefone`)
      else if (!x.telOk) f.push(`${n}: telefone (incompleto)`)
      else if (x.telIgualCliente) f.push(`${n}: telefone igual ao da cliente`)
      else if (x.telRepetido) f.push(`${n}: telefone igual ao da referência 1`)
      if (!refs[i].parentesco) f.push(`${n}: parentesco`)
      else if (!x.parentescoOk) f.push(`${n}: escreva qual é o parentesco`)
    })
    if (!docs.rg_frente) f.push('anexar RG Frente')
    if (!docs.rg_verso) f.push('anexar RG Verso')
    if (!docs.comprovante_1) f.push('anexar Comprovante 1')
    if (!docs.comprovante_2) f.push('anexar Comprovante 2')
    if (ctpsObrigatorio && !docs.ctps_digital) f.push('anexar CTPS digital em PDF')
    if (fgtsObrigatorio && !docs.extrato_fgts) f.push('anexar Extrato FGTS em PDF')
    if (!validacaoIaOk) f.push('validar a venda com a I.A')
    return f
  }
  const faltando = tudoOk ? [] : listaFaltando()

  const produtoInfo = PRODUTOS.find(p => p.key === c.produto)

  // === Tela 2: Formulário ===
  return (
    <div>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 500, color: '#0f172a', marginBottom: 4 }}>➕ Novo cliente</div>
          <div style={{ fontSize: 13, color: '#5b6b84' }}>Preencha os dados e anexe os documentos do cliente</div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', background: produtoInfo.cor + '15', borderRadius: 20,
          border: `1px solid ${produtoInfo.cor}30`,
        }}>
          <span style={{ fontSize: 13, color: produtoInfo.cor, fontWeight: 500 }}>{produtoInfo.label}</span>
          <button onClick={() => set('produto', '')}
            style={{ fontSize: 11, background: 'none', border: 'none', color: produtoInfo.cor, cursor: 'pointer', textDecoration: 'underline' }}>
            trocar
          </button>
        </div>
      </div>

      {/* === DADOS DO CLIENTE === */}
      <div style={s.card}>
        <div style={s.sectionTitle}>Dados do cliente</div>

        <div style={{ marginBottom: 12 }}>
          <label style={s.label}>Nome completo *</label>
          <input style={s.input} value={c.nome}
            onChange={e => set('nome', e.target.value.toUpperCase())}
            placeholder="NOME COMPLETO DO CLIENTE" />
        </div>

        <div style={s.grid2}>
          <div>
            <label style={s.label}>CPF *</label>
            <input style={(c.cpf && !cpfOk) || duplicadoBloqueia ? s.inputErr : s.input}
              value={c.cpf}
              onChange={e => { const v = maskCPF(e.target.value); set('cpf', v); setDuplicado(null); if (v.replace(/\D/g, '') !== prefillCpfRef.current) prefillCpfRef.current = '' }}
              onBlur={() => { verificarCpfDuplicado(c.cpf); preencherDoHistorico(c.cpf, null, c.produto) }}
              placeholder="000.000.000-00" inputMode="numeric" />
            {c.cpf && !cpfOk && <div style={s.hintErr}>CPF inválido</div>}
            {verificandoCpf && <div style={s.hint}>🔍 Verificando...</div>}
          </div>
          <div>
            <label style={s.label}>RG *</label>
            <input style={s.input} value={c.rg}
              onChange={e => set('rg', maskRG(e.target.value))}
              placeholder="00.000.000-0" />
          </div>
        </div>

        {prefill && (prefill.origem.length > 0 || prefill.validacao) && (
          <div style={{ background: 'rgba(37,99,235,.07)', border: '1px solid rgba(37,99,235,.25)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#1e3a8a', marginBottom: 12 }}>
            <b>📋 Dados preenchidos automaticamente</b>{prefill.origem.length ? <> — {prefill.origem.join(' + ')}</> : null}.
            {' '}Só os campos vazios foram completados. <b>Confira tudo antes de cadastrar</b> (telefone, endereço e filho podem ter mudado).
            {prefill.dnAnterior && <div style={{ marginTop: 4 }}>Filho do cadastro anterior: <b>{prefill.dnAnterior}</b> — se a venda é de outro filho, troque a data.</div>}
            {prefill.validacao && reusoOk && <div style={{ marginTop: 4 }}>✅ Validação da I.A aprovada em {new Date(prefill.validacao.em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} reaproveitada (não precisa validar de novo).</div>}
          </div>
        )}

        {duplicado && (
          <div style={duplicado.vendedorMesmo ? { ...s.duplicadoBox, background: 'rgba(251,191,36,.12)', borderColor: '#F59E0B40', color: '#b45309' } : s.duplicadoBox}>
            {/* 15/10 (Bruno) — o texto antigo dizia "sera atualizado", o que NAO acontece:
                o salvar faz INSERT, cria um cadastro novo e nao encosta no antigo. A
                vendedora lia aquilo e parava no meio achando que ia perder o primeiro
                filho. Agora o aviso diz o que de fato ocorre e mostra QUAL filho ja esta
                cadastrado, pra ela comparar com o que tem na mao. */}
            <div style={{ fontWeight: 500, marginBottom: 4 }}>
              {duplicado.vendedorMesmo
                ? '✓ CPF já é seu cliente — pode prosseguir'
                : '🚫 CPF já cadastrado por outro vendedor'}
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.5 }}>
              <strong>{duplicado.nome}</strong> {duplicado.vendedorMesmo ? '— seu cliente' : `— cadastrado por ${duplicado.vendedorNome}`} · status: <strong>{duplicado.status}</strong>{duplicado.setor && duplicado.setor !== 'captacao' && <> · setor <strong>{duplicado.setor}</strong></>}
              {duplicado.filho && <> · 👶 filho já cadastrado: <strong>{duplicado.filho}</strong></>}.
              {duplicado.vendedorMesmo && duplicado.produto === 'Maternidade Mãe' && (
                <><br />
                  Se o filho que você está cadastrando agora for <strong>outro</strong>, siga
                  normalmente: entra um cadastro novo e o atual não é alterado. Se for o{' '}
                  <strong>mesmo</strong> filho, o sistema bloqueia na hora de salvar.
                </>
              )}
              {!duplicado.vendedorMesmo && <><br />Você não pode cadastrar o mesmo CPF enquanto este cliente estiver ativo no sistema.</>}
            </div>
          </div>
        )}

        <div style={s.grid2}>
          <div>
            <label style={s.label}>Telefone *</label>
            <input style={c.telefone && !telOk ? s.inputErr : s.input}
              value={c.telefone}
              onChange={e => set('telefone', maskTel(e.target.value))}
              placeholder="(11) 99999-0000" inputMode="numeric" />
            {c.telefone && !telOk && <div style={s.hintErr}>Telefone incompleto</div>}
          </div>
          <div>
            <label style={s.label}>E-mail *</label>
            <input style={c.email && !emailOk ? s.inputErr : s.input}
              type="email" value={c.email}
              onChange={e => set('email', e.target.value.toLowerCase().trim())}
              placeholder="cliente@email.com" />
            {c.email && !emailOk && <div style={s.hintErr}>E-mail inválido</div>}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={s.label}>CEP *</label>
          <input style={c.cep && !cepOk ? s.inputErr : s.input}
            value={c.cep}
            onChange={e => onCepChange(e.target.value)}
            placeholder="00000-000" inputMode="numeric" />
          {buscandoCep && <div style={s.hint}>🔍 Buscando endereço...</div>}
          {cepStatus === 'ok' && !cepIncompleto && <div style={s.hintOk}>✓ Endereço encontrado — confira e preencha o número</div>}
          {cepIncompleto && <div style={s.hintAcao}>✓ Cidade encontrada — mas esse CEP não tem {cepSemRua && cepSemBairro ? 'rua nem bairro' : cepSemRua ? 'rua' : 'bairro'}. Veja o aviso abaixo 👇</div>}
        </div>

        {cepStatus === 'erro' && (
          <div style={s.warnBox}>
            ⚠️ <strong>CEP não encontrado.</strong> Preencha o endereço manualmente abaixo.
          </div>
        )}

        {/* 19/10 — aviso do CEP de cidade inteira. Sem ele a vendedora le
            "endereco encontrado", nao ve o que falta e acha que o sistema travou. */}
        {cepIncompleto && (
          <div style={s.warnBox}>
            📍 <strong>Esse CEP vale para a cidade inteira.</strong> Os Correios não têm{' '}
            {cepSemRua && cepSemBairro ? <strong>rua nem bairro</strong> : cepSemRua ? <strong>rua</strong> : <strong>bairro</strong>}{' '}
            cadastrado nele — isso é normal em cidade pequena, não é erro do sistema.
            <br />
            👉 Pergunte à cliente e <strong>digite à mão</strong>{' '}
            {cepSemRua && cepSemBairro ? 'a rua e o bairro' : cepSemRua ? 'a rua' : 'o bairro'}{' '}
            {cepSemRua && cepSemBairro ? 'nos campos marcados' : 'no campo marcado'} de amarelo aqui embaixo.
          </div>
        )}

        {mostrarEndereco && (
          <>
            <div style={s.grid_rua_num}>
              <div>
                <label style={s.label}>
                  Rua *
                  {precisaDigitarRua && <span style={s.badgeAqui}>⬅ digite aqui</span>}
                  {ruaLockada && (
                    <button type="button" onClick={() => setEndLockado(false)}
                      style={{ marginLeft: 8, fontSize: 11, background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }}>
                      editar
                    </button>
                  )}
                </label>
                <input ref={ruaRef} style={inputRua} value={c.rua}
                  readOnly={ruaLockada}
                  onChange={e => set('rua', e.target.value.toUpperCase())}
                  placeholder={precisaDigitarRua ? 'DIGITE O NOME DA RUA / AVENIDA' : 'RUA / AVENIDA'} />
                {precisaDigitarRua && <div style={s.hintAcao}>Esse endereço não vem preenchido — escreva o nome da rua ou avenida</div>}
              </div>
              <div>
                <label style={s.label}>Número *</label>
                <input style={c.numero.trim() || !mostrarEndereco ? s.input : s.inputFaltando} value={c.numero}
                  onChange={e => set('numero', e.target.value.toUpperCase().slice(0, 10))}
                  placeholder="123" />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={s.label}>
                Bairro *
                {precisaDigitarBairro && <span style={s.badgeAqui}>⬅ digite aqui</span>}
                {bairroLockado && (
                  <button type="button" onClick={() => setEndLockado(false)}
                    style={{ marginLeft: 8, fontSize: 11, background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }}>
                    editar
                  </button>
                )}
              </label>
              <input ref={bairroRef} style={inputBairro} value={c.bairro}
                readOnly={bairroLockado}
                onChange={e => set('bairro', e.target.value.toUpperCase())}
                placeholder={precisaDigitarBairro ? 'DIGITE O BAIRRO' : 'BAIRRO'} />
              {precisaDigitarBairro && <div style={s.hintAcao}>Esse endereço não vem preenchido — escreva o bairro</div>}
            </div>

            <div style={s.grid_cidade_uf}>
              <div>
                <label style={s.label}>
                  Cidade *
                  {endLockado && (
                    <button type="button" onClick={() => setEndLockado(false)}
                      style={{ marginLeft: 8, fontSize: 11, background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }}>
                      editar
                    </button>
                  )}
                </label>
                <input style={inputCidade} value={c.cidade}
                  readOnly={endLockado}
                  onChange={e => set('cidade', e.target.value.toUpperCase())}
                  placeholder="CIDADE" />
                {!endLockado && c.cidade && c.uf && cidadeStatus === 'erro' && (
                  <div style={s.hintErr}>Cidade não encontrada em {c.uf}</div>
                )}
              </div>
              <div>
                <label style={s.label}>UF *</label>
                <input style={inputUF} value={c.uf}
                  readOnly={endLockado}
                  onChange={e => set('uf', e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))}
                  placeholder="SP" maxLength={2} />
                {c.uf && !ufOk && <div style={s.hintErr}>UF inválida</div>}
              </div>
            </div>
          </>
        )}
      </div>

      {/* === CONTATOS DE REFERENCIA (28/10, obrigatorio) === */}
      <div style={s.card}>
        <div style={s.sectionTitle}>Contatos de referência (2 obrigatórios)</div>
        <div style={{ ...s.hint, marginTop: 0, marginBottom: 12 }}>
          Duas pessoas que conhecem a cliente, para falarmos com ela se o número dela parar de responder.
          Não pode ser o telefone da própria cliente.
        </div>
        {refs.map((r, i) => {
          const x = refsInfo[i]
          const telErro = r.telefone && (!x.telOk || x.telIgualCliente || x.telRepetido)
          return (
            <div key={i} style={{ paddingTop: i ? 12 : 0, marginTop: i ? 4 : 0, borderTop: i ? '0.5px dashed rgba(15,23,42,0.15)' : 'none' }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>Referência {i + 1}</div>
              <div style={{ marginBottom: 12 }}>
                <label style={s.label}>Nome *</label>
                <input style={s.input} value={r.nome}
                  onChange={e => setRef(i, 'nome', e.target.value.toUpperCase())}
                  placeholder="NOME DA PESSOA" />
              </div>
              <div style={s.grid2}>
                <div>
                  <label style={s.label}>Telefone *</label>
                  <input style={telErro ? s.inputErr : s.input} value={r.telefone}
                    onChange={e => setRef(i, 'telefone', maskTel(e.target.value))}
                    placeholder="(11) 99999-0000" inputMode="numeric" />
                  {r.telefone && !x.telOk && <div style={s.hintErr}>Telefone incompleto</div>}
                  {x.telIgualCliente && <div style={s.hintErr}>É o mesmo telefone da cliente</div>}
                  {x.telRepetido && <div style={s.hintErr}>É o mesmo telefone da referência 1</div>}
                </div>
                <div>
                  <label style={s.label}>Parentesco *</label>
                  <select style={s.input} value={r.parentesco}
                    onChange={e => setRef(i, 'parentesco', e.target.value)}>
                    <option value="">Selecione</option>
                    {PARENTESCOS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              {r.parentesco === 'Outro' && (
                <div style={{ marginBottom: 12 }}>
                  <label style={s.label}>Qual é o parentesco? *</label>
                  <input style={s.input} value={r.parentesco_outro}
                    onChange={e => setRef(i, 'parentesco_outro', e.target.value)}
                    placeholder="Ex.: madrinha, patroa, colega de trabalho" />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* === CAMPOS EXTRAS DO PRODUTO === */}
      {(c.produto === 'Maternidade' || c.produto === 'Gestante até 5 meses') && (
        <div style={s.card}>
          <div style={s.sectionTitle}>Informações do salário-maternidade</div>
          <div style={s.grid3}>
            <div>
              <label style={s.label}>NIS *</label>
              <input style={s.input} value={c.nis}
                onChange={e => set('nis', maskNIS(e.target.value))}
                placeholder="000.0000.000-0" inputMode="numeric" />
            </div>
            <div>
              <label style={s.label}>Data prevista do parto *</label>
              <input style={s.input} type="date" value={c.data_prevista_parto}
                onChange={e => set('data_prevista_parto', e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Meses de gravidez *</label>
              <select style={s.input} value={c.meses_gravidez}
                onChange={e => set('meses_gravidez', e.target.value)}>
                <option value="">Selecione</option>
                {[1,2,3,4,5,6,7,8,9].map(m =>
                  <option key={m} value={`${m} ${m === 1 ? 'mês' : 'meses'}`}>{m} {m === 1 ? 'mês' : 'meses'}</option>
                )}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* === CAMPOS EXTRAS MATERNIDADE MÃE === */}
      {c.produto === 'Maternidade Mãe' && (
        <div style={s.card}>
          <div style={s.sectionTitle}>Informações da maternidade (bebê já nascido)</div>
          <div style={s.grid3}>
            <div>
              <label style={s.label}>Data de nascimento do bebê *</label>
              <input style={s.input} type="date" value={c.data_nascimento_bebe}
                onChange={e => set('data_nascimento_bebe', e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Já trabalhou de carteira assinada (CLT)? *</label>
              <select style={s.input} value={c.ja_trabalhou_clt}
                onChange={e => set('ja_trabalhou_clt', e.target.value)}>
                <option value="">Selecione</option>
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </select>
            </div>
            <div>
              <label style={s.label}>Estava trabalhando quando o bebê nasceu? *</label>
              <select style={s.input} value={c.trabalhava_no_nascimento}
                onChange={e => set('trabalhava_no_nascimento', e.target.value)}>
                <option value="">Selecione</option>
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </select>
            </div>
          </div>
          <div style={s.grid2}>
            <div>
              <label style={s.label}>Recebeu seguro-desemprego?</label>
              <select style={s.input} value={c.recebeu_seguro_desemprego}
                onChange={e => set('recebeu_seguro_desemprego', e.target.value)}>
                <option value="">Selecione</option>
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </select>
            </div>
            {c.ja_trabalhou_clt === 'sim' && c.trabalhava_no_nascimento === 'nao' && (
              <div>
                <label style={s.label}>Mês/ano que saiu do último emprego *</label>
                <input style={s.input} value={c.saida_emprego_mes_ano}
                  onChange={e => set('saida_emprego_mes_ano', e.target.value.replace(/[^\d/]/g, '').slice(0, 7))}
                  placeholder="MM/AAAA" inputMode="numeric" />
              </div>
            )}
          </div>

          {/* === MOTIVO DA APROVAÇÃO (obrigatório) === */}
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: '0.5px solid rgba(15,23,42,0.09)' }}>
            <label style={s.label}>Por que essa cliente foi aprovada? *</label>
            <select style={{ ...s.input, borderColor: c.motivo_aprovacao ? 'rgba(0,0,0,0.45)' : '#dc2626' }}
              value={c.motivo_aprovacao} onChange={e => set('motivo_aprovacao', e.target.value)}>
              <option value="">Selecione o motivo</option>
              {MOTIVOS_APROVACAO_MAE.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <div style={{ fontSize: 11.5, color: '#5b6b84', marginTop: 6, lineHeight: 1.5 }}>
              Esse motivo vai junto com a ficha até a entrega — é por ele que o advogado
              entende o caso quando recebe o lote.
            </div>
            {c.motivo_aprovacao === MOTIVO_FGTS && (
              <div style={{ marginTop: 8, padding: '9px 11px', borderRadius: 7, fontSize: 12, lineHeight: 1.5,
                background: docs.extrato_fgts ? 'rgba(52,211,153,.14)' : 'rgba(251,191,36,.12)',
                color: docs.extrato_fgts ? '#059669' : '#b45309',
                border: `0.5px solid ${docs.extrato_fgts ? '#05966930' : '#b4530930'}` }}>
                {docs.extrato_fgts
                  ? '✅ Extrato FGTS anexado.'
                  : '⚠️ Esse motivo exige o extrato FGTS anexado abaixo, em "Documentos do cliente".'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* === DOCUMENTOS === */}
      <div style={s.card}>
        <div style={s.sectionTitle}>Documentos do cliente</div>
        <div style={{ fontSize: 12, color: '#5b6b84', marginBottom: 16 }}>
          Anexe RG (frente e verso), comprovantes obrigatórios, e opcionalmente comprovante de endereço.
          Formatos aceitos: JPG, PNG ou PDF (máx 10MB cada).
        </div>

        <div style={s.grid2}>
          <UploadDocumento key={'rgf' + docsVersao} label="RG Frente" obrigatorio={true} clienteId={tempIdRef.current} chave="rg_frente"
            valorInicial={docs.rg_frente} onChange={url => setDoc('rg_frente', url)} />
          <UploadDocumento key={'rgv' + docsVersao} label="RG Verso" obrigatorio={true} clienteId={tempIdRef.current} chave="rg_verso"
            valorInicial={docs.rg_verso} onChange={url => setDoc('rg_verso', url)} />
        </div>

        <div style={s.grid2}>
          <UploadDocumento label="Comprovante 1" obrigatorio={true} clienteId={tempIdRef.current} chave="comprovante_1"
            valorInicial={docs.comprovante_1} onChange={url => setDoc('comprovante_1', url)} />
          <UploadDocumento label="Comprovante 2" obrigatorio={true} clienteId={tempIdRef.current} chave="comprovante_2"
            valorInicial={docs.comprovante_2} onChange={url => setDoc('comprovante_2', url)} />
        </div>

        <UploadDocumento label="Comprovante de endereço (opcional)" obrigatorio={false} clienteId={tempIdRef.current} chave="comprovante_endereco"
          valorInicial={docs.comprovante_endereco} onChange={url => setDoc('comprovante_endereco', url)} />

        {/* CTPS digital e extrato FGTS: obrigatórios no Maternidade Mãe desde 31/08 */}
        {ehMae && (<>
          <div style={{ ...s.hint, marginTop: 10, marginBottom: 6, color: '#7c2d12' }}>
            No Maternidade Mãe a CTPS digital e o extrato FGTS passaram a ser obrigatórios,
            e os dois só entram em <b>PDF</b> — o arquivo baixado do aplicativo, não print
            nem foto. Peça os dois à cliente antes de digitar: sem eles o cadastro não fecha.
          </div>
          <UploadDocumento
            label="CTPS digital (PDF) — OBRIGATÓRIO"
            obrigatorio somentePdf clienteId={tempIdRef.current} chave="ctps_digital"
            valorInicial={docs.ctps_digital} onChange={url => setDoc('ctps_digital', url)} />
          <UploadDocumento
            label="Extrato FGTS (PDF) — OBRIGATÓRIO"
            obrigatorio somentePdf clienteId={tempIdRef.current} chave="extrato_fgts"
            valorInicial={docs.extrato_fgts} onChange={url => setDoc('extrato_fgts', url)} />
        </>)}
      </div>

      {/* === OBSERVAÇÃO === */}
      <div style={s.card}>
        <div style={s.sectionTitle}>Observação</div>
        <textarea style={s.textarea} value={c.observacao}
          onChange={e => set('observacao', e.target.value)}
          placeholder="Ex.: cliente prefere ser contatado à tarde, observação sobre os documentos, etc." />
      </div>

      {/* === VALIDAÇÃO DA VENDA PELA I.A — só Maternidade Mãe === */}
      {/* 20/10 — fica logo antes do botao de cadastrar, que so libera com
          resultado 'aprovado'. Os uploads daqui sao os DA I.A (bucket
          documentos-clientes, pasta validacao/<cpf>/) e convivem com os
          uploads antigos la de cima — um nao substitui o outro. */}
      {ehMae && !validacao && reusoOk && (
        <div style={{ marginBottom: 14, border: '1px solid #1E7B4F55', background: '#E8F5EE', color: '#1E7B4F', borderRadius: 12, padding: 16, fontSize: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>✅ Venda já APROVADA pela I.A</div>
          <div style={{ marginTop: 4, color: '#1B2430' }}>
            Validação nº {reuso.id} de {new Date(reuso.em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · perfil {PERFIL_NOME[reuso.perfil] || reuso.perfil}.
            Vale para este CPF e este filho por 7 dias — não precisa validar de novo.
          </div>
          <button type="button" onClick={() => setRevalidar(true)}
            style={{ marginTop: 10, background: '#fff', border: '1px solid #1E7B4F55', color: '#1E7B4F', borderRadius: 8, padding: '6px 12px', fontWeight: 700, cursor: 'pointer' }}>
            Validar de novo mesmo assim
          </button>
        </div>
      )}
      {ehMae && !(!validacao && reusoOk) && (
        <div style={{ marginBottom: 14 }}>
          <ValidacaoVendaIA
            supabase={supabase}
            cpf={c.cpf}
            clienteId={null}
            ficha={{
              nome: c.nome,
              data_nascimento_bebe: c.data_nascimento_bebe,
              motivo_aprovacao: c.motivo_aprovacao,
              trabalhava_no_nascimento: c.trabalhava_no_nascimento,
              recebeu_seguro_desemprego: c.recebeu_seguro_desemprego,
            }}
            onResultado={setValidacao}
          />
        </div>
      )}

      <button style={tudoOk && !enviando ? s.btn : s.btnDisabled}
        onClick={salvar} disabled={!tudoOk || enviando}>
        {enviando ? '⏳ Salvando...' : '✅ Cadastrar cliente'}
      </button>

      {/* 19/10 — no lugar de "Preencha todos os campos corretamente", a lista
          exata do que falta. O rodape e o ultimo lugar onde da pra salvar a
          vendedora antes dela desistir do cadastro. */}
      {!tudoOk && (
        duplicadoBloqueia ? (
          <div style={s.boxFaltaErro}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>🚫 Não dá pra cadastrar esse CPF agora</div>
            Ele já está ativo no sistema com <strong>{duplicado.vendedorNome}</strong>. Fale com a
            supervisão antes de seguir — trocar o CPF não resolve.
          </div>
        ) : faltando.length ? (
          <div style={s.boxFalta}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              ⚠️ Falta {faltando.length === 1 ? '1 item' : `${faltando.length} itens`} para liberar o botão:
            </div>
            <div>
              {faltando.map((f, i) => (
                <span key={f}><strong>{f}</strong>{i < faltando.length - 1 ? ' · ' : ''}</span>
              ))}
            </div>
            {!validacaoIaOk && (
              <div style={{ marginTop: 9, paddingTop: 9, borderTop: '1px solid rgba(245,158,11,.4)', fontWeight: 600 }}>
                👆 Valide a venda com a I.A antes de enviar.
              </div>
            )}
            {(precisaDigitarRua || precisaDigitarBairro) && (
              <div style={{ marginTop: 9, paddingTop: 9, borderTop: '1px solid rgba(245,158,11,.4)' }}>
                👆 {cepIncompleto
                      ? 'Esse CEP é de cidade inteira e não traz o endereço completo. '
                      : 'O CEP não foi encontrado. '}
                Role pra cima e digite nos campos <strong>marcados de amarelo</strong>.
              </div>
            )}
          </div>
        ) : (
          <div style={{ ...s.hint, textAlign: 'center', marginTop: 8 }}>Confira os dados antes de salvar</div>
        )
      )}
    </div>
  )
}
