import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import UploadDocumento from '../components/UploadDocumento'

const s = {
  card: { background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 14, padding: '1.5rem', marginBottom: 14 },
  label: { display: 'block', fontSize: 12, color: '#555', marginBottom: 4 },
  input: { width: '100%', padding: '10px 12px', fontSize: 14, border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 8, color: '#111', background: '#fff', outline: 'none', boxSizing: 'border-box' },
  inputReadOnly: { width: '100%', padding: '10px 12px', fontSize: 14, border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 8, color: '#444', background: '#F5F5F2', outline: 'none', boxSizing: 'border-box' },
  inputErr: { width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid #A32D2D', borderRadius: 8, color: '#111', background: '#fff', outline: 'none', boxSizing: 'border-box' },
  select: { width: '100%', padding: '12px', fontSize: 15, border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 8, color: '#111', background: '#fff', outline: 'none', boxSizing: 'border-box', fontWeight: 500 },
  textarea: { width: '100%', padding: '10px 12px', fontSize: 14, border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 8, color: '#111', background: '#fff', outline: 'none', boxSizing: 'border-box', minHeight: 60, fontFamily: 'inherit', resize: 'vertical' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 },
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 },
  grid_rua_num: { display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 12, marginBottom: 12 },
  grid_cidade_uf: { display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 12, marginBottom: 12 },
  btn: { width: '100%', padding: '13px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' },
  btnDisabled: { width: '100%', padding: '13px', background: '#aaa', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'not-allowed' },
  sectionTitle: { fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12, fontWeight: 500, paddingBottom: 8, borderBottom: '0.5px solid rgba(0,0,0,0.06)' },
  hint: { fontSize: 11, color: '#888', marginTop: 4 },
  hintErr: { fontSize: 11, color: '#A32D2D', marginTop: 4 },
  hintOk: { fontSize: 11, color: '#3B6D11', marginTop: 4 },
  warnBox: { background: '#FAEEDA', border: '1px solid #F5C97B', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 12, color: '#854F0B' },
  duplicadoBox: { background: '#FCEBEB', border: '1px solid #A32D2D40', borderRadius: 8, padding: '12px 14px', marginBottom: 12, fontSize: 13, color: '#A32D2D' },
  successBox: { background: '#EAF3DE', border: '1.5px solid #3B6D1150', borderRadius: 14, padding: '1.5rem', textAlign: 'center' },
  productCard: (ativo, cor) => ({
    flex: 1, padding: '14px 12px', textAlign: 'center', borderRadius: 10,
    cursor: 'pointer', fontWeight: 500, fontSize: 13,
    background: ativo ? cor : '#fff',
    color: ativo ? '#fff' : cor,
    border: `1.5px solid ${cor}${ativo ? '' : '40'}`,
    transition: 'all 0.15s',
  }),
}

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

const PRODUTOS = [
  { key: 'Maternidade', label: '🤰 Maternidade', cor: '#0F6E56' },
  { key: 'BPC', label: '👴 BPC', cor: '#534AB7' },
  { key: 'Auxilio Acidente', label: '🩹 Auxílio Acidente', cor: '#854F0B' },
]

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
function emailValido(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((e || '').trim()) }
function telValido(t) { return (t || '').replace(/\D/g, '').length >= 10 }
function normalizar(s) { return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() }

export default function NovoCliente({ onSucesso }) {
  const { profile } = useAuth()
  const [enviando, setEnviando] = useState(false)
  const [salvo, setSalvo] = useState(null)

  const [c, setC] = useState({
    produto: '', // vazio inicialmente — vendedor escolhe primeiro
    nome:'', cpf:'', rg:'', telefone:'', email:'',
    cep:'', rua:'', numero:'', bairro:'', cidade:'', uf:'',
    observacao: '',
    // Campos extras (Maternidade)
    nis: '', data_prevista_parto: '', meses_gravidez: '',
  })

  const [docs, setDocs] = useState({
    rg_frente: null, rg_verso: null,
    comprovante_1: null, comprovante_2: null,
    comprovante_endereco: null,
  })

  const [duplicado, setDuplicado] = useState(null)
  const [verificandoCpf, setVerificandoCpf] = useState(false)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [cepStatus, setCepStatus] = useState(null)
  const [endLockado, setEndLockado] = useState(false)
  const [cidadesUF, setCidadesUF] = useState([])
  const [cidadeStatus, setCidadeStatus] = useState(null)
  const ufCarregadaRef = useRef(null)

  // ID temporário usado pra agrupar uploads antes de salvar
  const tempIdRef = useRef(`temp_${Date.now()}_${Math.random().toString(36).slice(2,8)}`)

  function set(f, v) { setC(c => ({ ...c, [f]: v })) }
  function setDoc(chave, url) { setDocs(d => ({ ...d, [chave]: url })) }

  // === Verificar CPF duplicado em tempo real ===
  async function verificarCpfDuplicado(cpf) {
    if (!cpf || !cpfValido(cpf)) { setDuplicado(null); return }
    setVerificandoCpf(true)
    try {
      const { data } = await supabase.from('clientes')
        .select('id, nome, status, vendedor_operador_id, profiles!clientes_vendedor_operador_id_fkey(nome)')
        .eq('cpf', cpf)
        .in('status', ['aguardando_emissao','emitido'])
        .maybeSingle()
      if (data) {
        setDuplicado({
          nome: data.nome, status: data.status,
          vendedorNome: data.profiles?.nome || 'outro vendedor',
          vendedorMesmo: data.vendedor_operador_id === profile.id,
        })
      } else { setDuplicado(null) }
    } catch (e) { setDuplicado(null) }
    setVerificandoCpf(false)
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
        setC(c => ({ ...c, rua:'', bairro:'', cidade:'', uf:'' }))
        setCidadeStatus(null)
      } else {
        setC(c => ({ ...c,
          rua: (j.logradouro || '').toUpperCase(),
          bairro: (j.bairro || '').toUpperCase(),
          cidade: (j.localidade || '').toUpperCase(),
          uf: (j.uf || '').toUpperCase(),
        }))
        setCepStatus('ok'); setEndLockado(true); setCidadeStatus('ok')
      }
    } catch (e) { setCepStatus('erro'); setEndLockado(false) }
    setBuscandoCep(false)
  }

  function onCepChange(v) {
    const masked = maskCEP(v); set('cep', masked)
    const limpo = masked.replace(/\D/g, '')
    if (limpo.length === 8) buscarCep(limpo)
    else { setCepStatus(null); setEndLockado(false); setCidadeStatus(null) }
  }

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

  // Campos extras Maternidade
  const camposMatOk = c.produto !== 'Maternidade' || (
    c.nis && c.data_prevista_parto && c.meses_gravidez.trim()
  )

  // Documentos obrigatórios (4): RG frente, verso, comp 1, comp 2
  const docsOk = docs.rg_frente && docs.rg_verso && docs.comprovante_1 && docs.comprovante_2

  const tudoOk = c.produto && camposBasicosOk && cpfOk && emailOk && telOk && cepOk && ufOk && cidadeOk && !duplicado && camposMatOk && docsOk

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
      }
      // Campos extras só pra Maternidade
      if (c.produto === 'Maternidade') {
        payload.nis = c.nis
        payload.data_prevista_parto = c.data_prevista_parto
        payload.meses_gravidez = c.meses_gravidez
      }

      const { data, error } = await supabase.from('clientes').insert(payload).select().single()
      if (error) {
        if (error.code === '23505' || /unique|duplicat/i.test(error.message)) {
          setDuplicado({ nome: 'um cliente', status: 'aguardando_emissao', vendedorNome: 'no sistema', vendedorMesmo: false })
          alert('Este CPF já está cadastrado no sistema com status pendente.')
        } else { throw error }
        setEnviando(false); return
      }
      setSalvo(data)
    } catch (err) {
      alert('Erro ao salvar: ' + (err.message || err.toString()))
    }
    setEnviando(false)
  }

  function novoCadastro() {
    setC({ produto: '', nome:'', cpf:'', rg:'', telefone:'', email:'', cep:'', rua:'', numero:'', bairro:'', cidade:'', uf:'', observacao: '', nis:'', data_prevista_parto:'', meses_gravidez:'' })
    setDocs({ rg_frente: null, rg_verso: null, comprovante_1: null, comprovante_2: null, comprovante_endereco: null })
    setCepStatus(null); setEndLockado(false); setCidadeStatus(null); setSalvo(null); setDuplicado(null)
    tempIdRef.current = `temp_${Date.now()}_${Math.random().toString(36).slice(2,8)}`
  }

  if (salvo) return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: 20, fontWeight: 500, color: '#111', marginBottom: 4 }}>➕ Novo cliente</div>
      </div>
      <div style={s.successBox}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
        <div style={{ fontSize: 16, fontWeight: 500, color: '#3B6D11', marginBottom: 6 }}>Cliente cadastrado!</div>
        <div style={{ fontSize: 14, color: '#555', marginBottom: 4 }}>{salvo.nome}</div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>Aguardando emissão pela supervisão. O link aparece em "Meus clientes" assim que estiver pronto.</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={novoCadastro} style={{ flex: 1, padding: '10px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
            ➕ Novo cliente
          </button>
          {onSucesso && (
            <button onClick={() => onSucesso()} style={{ flex: 1, padding: '10px', background: '#fff', color: '#185FA5', border: '1px solid #185FA5', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
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
        <div style={{ fontSize: 20, fontWeight: 500, color: '#111', marginBottom: 4 }}>➕ Novo cliente</div>
        <div style={{ fontSize: 13, color: '#888' }}>Comece selecionando o produto que você está vendendo</div>
      </div>

      <div style={s.card}>
        <div style={s.sectionTitle}>Qual produto você está vendendo?</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {PRODUTOS.map(p => (
            <button key={p.key} onClick={() => set('produto', p.key)}
              style={{
                padding: '20px 16px', textAlign: 'left', borderRadius: 10,
                cursor: 'pointer', background: '#fff',
                border: `1.5px solid ${p.cor}30`, color: '#111',
                fontSize: 15, fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
              <span style={{ fontSize: 24 }}>{p.label.split(' ')[0]}</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: p.cor, fontWeight: 600 }}>{p.label.split(' ').slice(1).join(' ')}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                  {p.key === 'Maternidade' ? 'Salário-maternidade — pede NIS, data do parto e meses de gravidez' :
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

  const inputCidade = endLockado ? s.inputReadOnly : (cidadeStatus === 'erro' ? s.inputErr : s.input)
  const inputUF = endLockado ? s.inputReadOnly : (c.uf && !ufOk ? s.inputErr : s.input)
  const inputRua = endLockado ? s.inputReadOnly : s.input
  const inputBairro = endLockado ? s.inputReadOnly : s.input
  const mostrarEndereco = cepStatus === 'ok' || cepStatus === 'erro'

  const produtoInfo = PRODUTOS.find(p => p.key === c.produto)

  // === Tela 2: Formulário ===
  return (
    <div>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 500, color: '#111', marginBottom: 4 }}>➕ Novo cliente</div>
          <div style={{ fontSize: 13, color: '#888' }}>Preencha os dados e anexe os documentos do cliente</div>
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
            <input style={(c.cpf && !cpfOk) || duplicado ? s.inputErr : s.input}
              value={c.cpf}
              onChange={e => { const v = maskCPF(e.target.value); set('cpf', v); setDuplicado(null) }}
              onBlur={() => verificarCpfDuplicado(c.cpf)}
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

        {duplicado && (
          <div style={s.duplicadoBox}>
            <div style={{ fontWeight: 500, marginBottom: 4 }}>⚠️ CPF já cadastrado no sistema</div>
            <div style={{ fontSize: 12, lineHeight: 1.5 }}>
              <strong>{duplicado.nome}</strong> {duplicado.vendedorMesmo ? '(seu cliente)' : `(cadastrado por ${duplicado.vendedorNome})`} está com status <strong>{duplicado.status === 'aguardando_emissao' ? 'aguardando emissão' : 'emitido'}</strong>.
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
          {cepStatus === 'ok' && <div style={s.hintOk}>✓ Endereço encontrado — confira e preencha o número</div>}
        </div>

        {cepStatus === 'erro' && (
          <div style={s.warnBox}>
            ⚠️ <strong>CEP não encontrado.</strong> Preencha o endereço manualmente abaixo.
          </div>
        )}

        {mostrarEndereco && (
          <>
            <div style={s.grid_rua_num}>
              <div>
                <label style={s.label}>
                  Rua *
                  {endLockado && (
                    <button type="button" onClick={() => setEndLockado(false)}
                      style={{ marginLeft: 8, fontSize: 11, background: 'none', border: 'none', color: '#185FA5', cursor: 'pointer', textDecoration: 'underline' }}>
                      editar
                    </button>
                  )}
                </label>
                <input style={inputRua} value={c.rua}
                  readOnly={endLockado}
                  onChange={e => set('rua', e.target.value.toUpperCase())}
                  placeholder="RUA / AVENIDA" />
              </div>
              <div>
                <label style={s.label}>Número *</label>
                <input style={s.input} value={c.numero}
                  onChange={e => set('numero', e.target.value.toUpperCase().slice(0, 10))}
                  placeholder="123" />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={s.label}>Bairro *</label>
              <input style={inputBairro} value={c.bairro}
                readOnly={endLockado}
                onChange={e => set('bairro', e.target.value.toUpperCase())}
                placeholder="BAIRRO" />
            </div>

            <div style={s.grid_cidade_uf}>
              <div>
                <label style={s.label}>Cidade *</label>
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

      {/* === CAMPOS EXTRAS DO PRODUTO === */}
      {c.produto === 'Maternidade' && (
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

      {/* === DOCUMENTOS === */}
      <div style={s.card}>
        <div style={s.sectionTitle}>Documentos do cliente</div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
          Anexe RG (frente e verso), comprovantes obrigatórios, e opcionalmente comprovante de endereço.
          Formatos aceitos: JPG, PNG ou PDF (máx 10MB cada).
        </div>

        <div style={s.grid2}>
          <UploadDocumento label="RG Frente" obrigatorio={true} clienteId={tempIdRef.current} chave="rg_frente"
            valorInicial={docs.rg_frente} onChange={url => setDoc('rg_frente', url)} />
          <UploadDocumento label="RG Verso" obrigatorio={true} clienteId={tempIdRef.current} chave="rg_verso"
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
      </div>

      {/* === OBSERVAÇÃO === */}
      <div style={s.card}>
        <div style={s.sectionTitle}>Observação</div>
        <textarea style={s.textarea} value={c.observacao}
          onChange={e => set('observacao', e.target.value)}
          placeholder="Ex.: cliente prefere ser contatado à tarde, observação sobre os documentos, etc." />
      </div>

      <button style={tudoOk && !enviando ? s.btn : s.btnDisabled}
        onClick={salvar} disabled={!tudoOk || enviando}>
        {enviando ? '⏳ Salvando...' : '✅ Cadastrar cliente'}
      </button>

      {!tudoOk && (
        <div style={{ ...s.hint, textAlign: 'center', marginTop: 8 }}>
          {!docsOk ? 'Anexe os 4 documentos obrigatórios (RG frente, verso, comprovantes 1 e 2)' :
            !camposMatOk ? 'Preencha NIS, data do parto e meses de gravidez' :
            duplicado ? 'CPF já cadastrado pendente' :
            'Preencha todos os campos corretamente'}
        </div>
      )}
    </div>
  )
}
