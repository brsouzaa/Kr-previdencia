import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const s = {
  card: { background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 14, padding: '1.5rem', marginBottom: 14 },
  label: { display: 'block', fontSize: 12, color: '#555', marginBottom: 4 },
  input: { width: '100%', padding: '10px 12px', fontSize: 14, border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 8, color: '#111', background: '#fff', outline: 'none', boxSizing: 'border-box' },
  inputReadOnly: { width: '100%', padding: '10px 12px', fontSize: 14, border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 8, color: '#444', background: '#F5F5F2', outline: 'none', boxSizing: 'border-box' },
  inputErr: { width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid #A32D2D', borderRadius: 8, color: '#111', background: '#fff', outline: 'none', boxSizing: 'border-box' },
  select: { width: '100%', padding: '10px 12px', fontSize: 14, border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 8, color: '#111', background: '#fff', outline: 'none', boxSizing: 'border-box' },
  textarea: { width: '100%', padding: '10px 12px', fontSize: 14, border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 8, color: '#111', background: '#fff', outline: 'none', boxSizing: 'border-box', minHeight: 60, fontFamily: 'inherit', resize: 'vertical' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 },
  grid_rua_num: { display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 12, marginBottom: 12 },
  grid_cidade_uf: { display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 12, marginBottom: 12 },
  btn: { width: '100%', padding: '13px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' },
  btnDisabled: { width: '100%', padding: '13px', background: '#aaa', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'not-allowed' },
  sectionTitle: { fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12, fontWeight: 500, paddingBottom: 8, borderBottom: '0.5px solid rgba(0,0,0,0.06)' },
  hint: { fontSize: 11, color: '#888', marginTop: 4 },
  hintErr: { fontSize: 11, color: '#A32D2D', marginTop: 4 },
  hintOk: { fontSize: 11, color: '#3B6D11', marginTop: 4 },
  warnBox: { background: '#FAEEDA', border: '1px solid #F5C97B', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 12, color: '#854F0B' },
  successBox: { background: '#EAF3DE', border: '1.5px solid #3B6D1150', borderRadius: 14, padding: '1.5rem', textAlign: 'center' },
}

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']
const PRODUTOS = ['Maternidade', 'BPC', 'Auxilio Acidente']

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
    nome:'', cpf:'', rg:'', telefone:'', email:'',
    cep:'', rua:'', numero:'', bairro:'', cidade:'', uf:'',
    produto: 'Maternidade', observacao: ''
  })

  const [buscandoCep, setBuscandoCep] = useState(false)
  const [cepStatus, setCepStatus] = useState(null)
  const [endLockado, setEndLockado] = useState(false)
  const [cidadesUF, setCidadesUF] = useState([])
  const [cidadeStatus, setCidadeStatus] = useState(null)
  const ufCarregadaRef = useRef(null)

  function set(f, v) { setC(c => ({ ...c, [f]: v })) }

  async function buscarCep(cepRaw) {
    const cep = (cepRaw || '').replace(/\D/g, '')
    if (cep.length !== 8) { setCepStatus(null); return }
    setBuscandoCep(true)
    setCepStatus(null)
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      const j = await r.json()
      if (j.erro) {
        setCepStatus('erro')
        setEndLockado(false)
        setC(c => ({ ...c, rua:'', bairro:'', cidade:'', uf:'' }))
        setCidadeStatus(null)
      } else {
        setC(c => ({
          ...c,
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

  const camposPreenchidos = c.nome.trim() && c.cpf && c.rg && c.telefone &&
                            c.email.trim() && c.cep &&
                            c.rua.trim() && c.numero.trim() && c.bairro.trim() &&
                            c.cidade.trim() && c.uf && c.produto
  const cpfOk = cpfValido(c.cpf)
  const emailOk = emailValido(c.email)
  const telOk = telValido(c.telefone)
  const cepOk = c.cep.replace(/\D/g, '').length === 8
  const ufOk = UFS.includes(c.uf)
  const cidadeOk = cidadeStatus === 'ok'
  const tudoOk = camposPreenchidos && cpfOk && emailOk && telOk && cepOk && ufOk && cidadeOk

  async function salvar() {
    if (!tudoOk || enviando) return
    setEnviando(true)
    try {
      // Verifica se CPF já existe
      const { data: existente } = await supabase.from('clientes')
        .select('id, status, nome')
        .eq('cpf', c.cpf)
        .in('status', ['aguardando_emissao','emitido'])
        .maybeSingle()

      if (existente) {
        alert(`Já existe um cadastro com este CPF (${existente.nome}) com status: ${existente.status}.`)
        setEnviando(false); return
      }

      const { data, error } = await supabase.from('clientes').insert({
        vendedor_operador_id: profile.id,
        nome: c.nome, cpf: c.cpf, rg: c.rg,
        telefone: c.telefone, email: c.email,
        cep: c.cep, rua: c.rua, numero: c.numero, bairro: c.bairro,
        cidade: c.cidade, uf: c.uf,
        produto: c.produto, observacao: c.observacao || null,
        status: 'aguardando_emissao',
      }).select().single()
      if (error) throw error
      setSalvo(data)
    } catch (err) {
      alert('Erro ao salvar: ' + (err.message || err.toString()))
    }
    setEnviando(false)
  }

  function novoCadastro() {
    setC({ nome:'', cpf:'', rg:'', telefone:'', email:'', cep:'', rua:'', numero:'', bairro:'', cidade:'', uf:'', produto: 'Maternidade', observacao: '' })
    setCepStatus(null); setEndLockado(false); setCidadeStatus(null); setSalvo(null)
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
        <div style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>Aguardando emissão pela supervisão. Você receberá o link assim que estiver pronto.</div>
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

  const inputCidade = endLockado ? s.inputReadOnly : (cidadeStatus === 'erro' ? s.inputErr : s.input)
  const inputUF = endLockado ? s.inputReadOnly : (c.uf && !ufOk ? s.inputErr : s.input)
  const inputRua = endLockado ? s.inputReadOnly : s.input
  const inputBairro = endLockado ? s.inputReadOnly : s.input
  const mostrarEndereco = cepStatus === 'ok' || cepStatus === 'erro'

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: 20, fontWeight: 500, color: '#111', marginBottom: 4 }}>➕ Novo cliente</div>
        <div style={{ fontSize: 13, color: '#888' }}>Cadastre o cliente. A supervisão emite o contrato e devolve o link pra você enviar pelo WhatsApp.</div>
      </div>

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
            <input style={c.cpf && !cpfOk ? s.inputErr : s.input}
              value={c.cpf}
              onChange={e => set('cpf', maskCPF(e.target.value))}
              placeholder="000.000.000-00" inputMode="numeric" />
            {c.cpf && !cpfOk && <div style={s.hintErr}>CPF inválido</div>}
          </div>
          <div>
            <label style={s.label}>RG *</label>
            <input style={s.input} value={c.rg}
              onChange={e => set('rg', maskRG(e.target.value))}
              placeholder="00.000.000-0" />
          </div>
        </div>

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

      <div style={s.card}>
        <div style={s.sectionTitle}>Produto vendido</div>

        <div style={{ marginBottom: 12 }}>
          <label style={s.label}>Produto *</label>
          <select style={s.select} value={c.produto} onChange={e => set('produto', e.target.value)}>
            {PRODUTOS.map(p => <option key={p} value={p}>{p === 'Auxilio Acidente' ? 'Auxílio Acidente' : p}</option>)}
          </select>
        </div>

        <div>
          <label style={s.label}>Observação (opcional)</label>
          <textarea style={s.textarea} value={c.observacao}
            onChange={e => set('observacao', e.target.value)}
            placeholder="Ex.: cliente prefere ser contatado à tarde, já recebeu BPC antes, etc." />
        </div>
      </div>

      <button style={tudoOk && !enviando ? s.btn : s.btnDisabled}
        onClick={salvar} disabled={!tudoOk || enviando}>
        {enviando ? '⏳ Salvando...' : '✅ Cadastrar cliente'}
      </button>
      {!tudoOk && camposPreenchidos && (
        <div style={{ ...s.hintErr, textAlign: 'center', marginTop: 8 }}>
          Corrija os campos destacados em vermelho
        </div>
      )}
      {!camposPreenchidos && (
        <div style={{ ...s.hint, textAlign: 'center', marginTop: 8 }}>
          Preencha todos os campos para cadastrar
        </div>
      )}
    </div>
  )
}
