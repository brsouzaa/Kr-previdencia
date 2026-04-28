import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const s = {
  card: { background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 14, padding: '1.5rem', marginBottom: 14 },
  label: { display: 'block', fontSize: 12, color: '#555', marginBottom: 4 },
  input: { width: '100%', padding: '10px 12px', fontSize: 14, border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 8, color: '#111', background: '#fff', outline: 'none', boxSizing: 'border-box' },
  inputReadOnly: { width: '100%', padding: '10px 12px', fontSize: 14, border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 8, color: '#444', background: '#F5F5F2', outline: 'none', boxSizing: 'border-box' },
  inputErr: { width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid #A32D2D', borderRadius: 8, color: '#111', background: '#fff', outline: 'none', boxSizing: 'border-box' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 },
  grid_rua_num: { display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 12, marginBottom: 12 },
  grid_cidade_uf: { display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 12, marginBottom: 12 },
  btn: { width: '100%', padding: '13px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' },
  btnDisabled: { width: '100%', padding: '13px', background: '#aaa', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'not-allowed' },
  sectionTitle: { fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12, fontWeight: 500, paddingBottom: 8, borderBottom: '0.5px solid rgba(0,0,0,0.06)' },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 500, marginLeft: 6 },
  hint: { fontSize: 11, color: '#888', marginTop: 4 },
  hintErr: { fontSize: 11, color: '#A32D2D', marginTop: 4 },
  hintOk: { fontSize: 11, color: '#3B6D11', marginTop: 4 },
  warnBox: { background: '#FAEEDA', border: '1px solid #F5C97B', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 12, color: '#854F0B' },
}

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

function hoje() {
  const d = new Date()
  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`
}

// === Máscaras ===
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

// === Validações ===
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
function emailValido(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((e || '').trim())
}
function telValido(t) {
  return (t || '').replace(/\D/g, '').length >= 10
}

// Normaliza string pra comparação (remove acento, lowercase)
function normalizar(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

export default function GerarContratos() {
  const { profile } = useAuth()
  const [proximoLote, setProximoLote] = useState(null)
  const [advogado, setAdvogado] = useState(null)
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [copiado, setCopiado] = useState(false)
  const [cliente, setCliente] = useState({
    nome:'', cpf:'', rg:'', telefone:'', email:'',
    cep:'', rua:'', numero:'', bairro:'', cidade:'', uf:''
  })

  // Estado de busca CEP / cidade
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [cepStatus, setCepStatus] = useState(null) // 'ok' | 'erro' | null
  const [endLockado, setEndLockado] = useState(false)
  const [cidadesUF, setCidadesUF] = useState([])
  const [cidadeStatus, setCidadeStatus] = useState(null) // 'ok' | 'erro' | null
  const ufCarregadaRef = useRef(null)

  useEffect(() => { fetchProximo() }, [])

  async function fetchProximo() {
    setLoading(true)
    setResultado(null)
    const { data } = await supabase
      .from('lotes')
      .select('*, advogados(*), profiles(nome)')
      .eq('status_pagamento', 'a_entregar')
      .order('prioridade_fila', { ascending: false, nullsFirst: false })
      .order('data_prioridade', { ascending: true, nullsFirst: false })
      .order('data_compra', { ascending: true })
      .limit(20)

    const disponivel = (data || []).find(l => (l.qtd_emitidos || 0) < (l.total_contratos || 0))

    if (disponivel) {
      setProximoLote(disponivel)
      setAdvogado(disponivel.advogados)
    } else {
      setProximoLote(null)
      setAdvogado(null)
    }
    setLoading(false)
  }

  function setC(f, v) { setCliente(c => ({ ...c, [f]: v })) }

  // === Busca CEP no ViaCEP ===
  async function buscarCep(cepRaw) {
    const cep = (cepRaw || '').replace(/\D/g, '')
    if (cep.length !== 8) {
      setCepStatus(null)
      return
    }
    setBuscandoCep(true)
    setCepStatus(null)
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      const j = await r.json()
      if (j.erro) {
        setCepStatus('erro')
        setEndLockado(false)
        // limpa rua/bairro/cidade/uf pra forçar preenchimento manual
        setCliente(c => ({ ...c, rua:'', bairro:'', cidade:'', uf:'' }))
        setCidadeStatus(null)
      } else {
        setCliente(c => ({
          ...c,
          rua: (j.logradouro || '').toUpperCase(),
          bairro: (j.bairro || '').toUpperCase(),
          cidade: (j.localidade || '').toUpperCase(),
          uf: (j.uf || '').toUpperCase(),
        }))
        setCepStatus('ok')
        setEndLockado(true)
        setCidadeStatus('ok')
      }
    } catch (e) {
      setCepStatus('erro')
      setEndLockado(false)
    }
    setBuscandoCep(false)
  }

  function onCepChange(v) {
    const masked = maskCEP(v)
    setC('cep', masked)
    const limpo = masked.replace(/\D/g, '')
    if (limpo.length === 8) buscarCep(limpo)
    else { setCepStatus(null); setEndLockado(false); setCidadeStatus(null) }
  }

  // === Carrega cidades do IBGE para a UF atual ===
  async function carregarCidadesUF(uf) {
    if (!uf || uf.length !== 2) { setCidadesUF([]); return }
    if (ufCarregadaRef.current === uf && cidadesUF.length) return
    try {
      const r = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`)
      const j = await r.json()
      setCidadesUF((j || []).map(x => x.nome))
      ufCarregadaRef.current = uf
    } catch (e) {
      setCidadesUF([])
    }
  }

  // Revalida cidade quando cidade ou UF muda manualmente
  useEffect(() => {
    if (endLockado) return
    if (!cliente.cidade || !cliente.uf || cliente.uf.length !== 2) {
      setCidadeStatus(null)
      return
    }
    if (!UFS.includes(cliente.uf)) {
      setCidadeStatus('erro')
      return
    }
    carregarCidadesUF(cliente.uf).then(() => {
      const lista = ufCarregadaRef.current === cliente.uf ? cidadesUF : []
      if (!lista.length) { setCidadeStatus(null); return }
      const ok = lista.some(c => normalizar(c) === normalizar(cliente.cidade))
      setCidadeStatus(ok ? 'ok' : 'erro')
    })
    // eslint-disable-next-line
  }, [cliente.cidade, cliente.uf, endLockado])

  useEffect(() => {
    if (endLockado) return
    if (!cidadesUF.length || !cliente.cidade) return
    const ok = cidadesUF.some(c => normalizar(c) === normalizar(cliente.cidade))
    setCidadeStatus(ok ? 'ok' : 'erro')
    // eslint-disable-next-line
  }, [cidadesUF])

  function destravarEndereco() {
    setEndLockado(false)
  }

  // === Validações para habilitar botão ===
  const camposPreenchidos = cliente.nome.trim() && cliente.cpf && cliente.rg && cliente.telefone &&
                            cliente.email.trim() && cliente.cep &&
                            cliente.rua.trim() && cliente.numero.trim() && cliente.bairro.trim() &&
                            cliente.cidade.trim() && cliente.uf
  const cpfOk = cpfValido(cliente.cpf)
  const emailOk = emailValido(cliente.email)
  const telOk = telValido(cliente.telefone)
  const cepOk = cliente.cep.replace(/\D/g, '').length === 8
  const ufOk = UFS.includes(cliente.uf)
  const cidadeOk = cidadeStatus === 'ok'

  const tudoOk = camposPreenchidos && cpfOk && emailOk && telOk && cepOk && ufOk && cidadeOk

  async function enviarZapSign() {
    if (!tudoOk || !advogado) return
    setEnviando(true)
    try {
      const dataHoje = hoje()
      // Monta endereço completo: RUA, NÚMERO - BAIRRO
      const enderecoClienteCompleto = `${cliente.rua}, ${cliente.numero} - ${cliente.bairro}`

      const resp = await supabase.functions.invoke('gerar-contratos-zapsign', {
        body: {
          cliente: {
            ...cliente,
            endereco: enderecoClienteCompleto,
          },
          advogado,
          lote_id: proximoLote?.id,
          produtor_id: profile?.id,
          data_hoje: dataHoje,
        }
      })

      console.log('Resposta:', resp)

      if (resp.error) throw new Error(typeof resp.error === 'string' ? resp.error : JSON.stringify(resp.error))
      if (!resp.data?.ok) throw new Error(resp.data?.error || JSON.stringify(resp.data) || 'Erro na Edge Function')

      setResultado({ link: resp.data.link_assinatura, token: resp.data.zapsign_token, expira: resp.data.expira_em })

    } catch (err) {
      console.error('Erro completo:', err)
      alert('Erro: ' + (err.message || err.toString()))
    }
    setEnviando(false)
  }

  function copiarLink() {
    navigator.clipboard.writeText(resultado.link)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2500)
  }

  function proximoCliente() {
    setCliente({ nome:'', cpf:'', rg:'', telefone:'', email:'', cep:'', rua:'', numero:'', bairro:'', cidade:'', uf:'' })
    setCepStatus(null)
    setEndLockado(false)
    setCidadeStatus(null)
    setResultado(null)
    fetchProximo()
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>Carregando...</div>

  const restantes = proximoLote ? (proximoLote.total_contratos || 0) - (proximoLote.qtd_emitidos || 0) : 0

  // Estilos dinâmicos
  const inputCidade = endLockado ? s.inputReadOnly
    : (cidadeStatus === 'erro' ? s.inputErr : s.input)
  const inputUF = endLockado ? s.inputReadOnly
    : (cliente.uf && !ufOk ? s.inputErr : s.input)
  const inputRua = endLockado ? s.inputReadOnly : s.input
  const inputBairro = endLockado ? s.inputReadOnly : s.input

  // Mostra os campos de endereço quando: ViaCEP achou OU CEP digitado mas não achou OU usuário destravou
  const mostrarEndereco = cepStatus === 'ok' || cepStatus === 'erro'

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: 20, fontWeight: 500, color: '#111', marginBottom: 4 }}>📄 Gerar contratos</div>
        <div style={{ fontSize: 13, color: '#888' }}>3 documentos gerados e enviados ao ZapSign automaticamente — válido por 15 horas</div>
      </div>

      {advogado ? (
        <div style={{ ...s.card, background: proximoLote?.prioridade_fila ? '#FEF3C7' : '#E6F1FB', border: proximoLote?.prioridade_fila ? '1.5px solid #F59E0B' : '1.5px solid #185FA540' }}>
          <div style={s.sectionTitle}>
            Advogado da vez — próximo na fila
            {proximoLote?.prioridade_fila && (
              <span style={{ ...s.badge, background: '#F59E0B', color: '#fff' }}>⚡ PRIORIDADE</span>
            )}
          </div>
          <div style={{ fontSize: 16, fontWeight: 500, color: '#111', marginBottom: 6 }}>{advogado.nome_completo}</div>
          <div style={{ fontSize: 13, color: '#555', marginBottom: 2 }}>OAB/{advogado.estado} {advogado.oab}</div>
          {advogado.endereco && <div style={{ fontSize: 12, color: '#888', marginBottom: 2 }}>{advogado.endereco}</div>}
          <div style={{ fontSize: 12, color: '#888' }}>{advogado.telefone} · {advogado.email}</div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>
            Vendedor: {proximoLote?.profiles?.nome} · Lote de {proximoLote?.total_contratos} contrato{proximoLote?.total_contratos !== 1 ? 's' : ''} ·{' '}
            <strong style={{ color: '#185FA5' }}>{restantes} restante{restantes !== 1 ? 's' : ''} para emitir</strong> · {proximoLote?.data_compra}
          </div>
          {proximoLote?.prioridade_fila && (
            <div style={{ fontSize: 11, color: '#854F0B', marginTop: 6, fontStyle: 'italic' }}>
              ⚡ Lote priorizado: alguns contratos expiraram sem assinatura e voltaram para a fila
            </div>
          )}
        </div>
      ) : (
        <div style={{ ...s.card, textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 15, color: '#555' }}>Fila vazia — nenhum lote aguardando contrato</div>
        </div>
      )}

      {resultado && (
        <div style={{ ...s.card, background: '#EAF3DE', border: '1.5px solid #3B6D1150' }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#3B6D11', marginBottom: 8 }}>✅ Contratos enviados ao ZapSign!</div>
          <div style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>Copie o link e envie para o cliente assinar:</div>
          {resultado.expira && (
            <div style={{ fontSize: 12, color: '#854F0B', background: '#FAEEDA', borderRadius: 6, padding: '6px 10px', marginBottom: 12 }}>
              ⏰ Link expira em 15 horas ({resultado.expira})
            </div>
          )}
          <div style={{ background: '#fff', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#185FA5', wordBreak: 'break-all', border: '0.5px solid rgba(0,0,0,0.1)' }}>
            {resultado.link}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button onClick={copiarLink} style={{ flex: 1, padding: '10px', background: copiado ? '#3B6D11' : '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
              {copiado ? '✓ Copiado!' : '📋 Copiar link'}
            </button>
            <a href={`https://wa.me/?text=${encodeURIComponent('Olá! Segue o link para assinar seus documentos: ' + resultado.link)}`}
              target="_blank" rel="noreferrer"
              style={{ flex: 1, padding: '10px', background: '#EAF3DE', color: '#3B6D11', border: '0.5px solid #3B6D11', borderRadius: 8, fontSize: 14, fontWeight: 500, textDecoration: 'none', textAlign: 'center' }}>
              💬 WhatsApp
            </a>
          </div>
          <button onClick={proximoCliente} style={{ width: '100%', padding: '10px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
            ➡️ Próximo cliente
          </button>
        </div>
      )}

      {advogado && !resultado && (
        <div style={s.card}>
          <div style={s.sectionTitle}>Dados do cliente (beneficiário)</div>

          <div style={{ marginBottom: 12 }}>
            <label style={s.label}>Nome completo *</label>
            <input style={s.input} value={cliente.nome}
              onChange={e => setC('nome', e.target.value.toUpperCase())}
              placeholder="NOME COMPLETO DO CLIENTE" />
          </div>

          <div style={s.grid2}>
            <div>
              <label style={s.label}>CPF *</label>
              <input style={cliente.cpf && !cpfOk ? s.inputErr : s.input}
                value={cliente.cpf}
                onChange={e => setC('cpf', maskCPF(e.target.value))}
                placeholder="000.000.000-00" inputMode="numeric" />
              {cliente.cpf && !cpfOk && <div style={s.hintErr}>CPF inválido</div>}
            </div>
            <div>
              <label style={s.label}>RG *</label>
              <input style={s.input} value={cliente.rg}
                onChange={e => setC('rg', maskRG(e.target.value))}
                placeholder="00.000.000-0" />
            </div>
          </div>

          <div style={s.grid2}>
            <div>
              <label style={s.label}>Telefone *</label>
              <input style={cliente.telefone && !telOk ? s.inputErr : s.input}
                value={cliente.telefone}
                onChange={e => setC('telefone', maskTel(e.target.value))}
                placeholder="(11) 99999-0000" inputMode="numeric" />
              {cliente.telefone && !telOk && <div style={s.hintErr}>Telefone incompleto</div>}
            </div>
            <div>
              <label style={s.label}>E-mail *</label>
              <input style={cliente.email && !emailOk ? s.inputErr : s.input}
                type="email" value={cliente.email}
                onChange={e => setC('email', e.target.value.toLowerCase().trim())}
                placeholder="cliente@email.com" />
              {cliente.email && !emailOk && <div style={s.hintErr}>E-mail inválido</div>}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={s.label}>CEP *</label>
            <input style={cliente.cep && !cepOk ? s.inputErr : s.input}
              value={cliente.cep}
              onChange={e => onCepChange(e.target.value)}
              placeholder="00000-000" inputMode="numeric" />
            {buscandoCep && <div style={s.hint}>🔍 Buscando endereço...</div>}
            {cepStatus === 'ok' && <div style={s.hintOk}>✓ Endereço encontrado — confira e preencha o número</div>}
          </div>

          {cepStatus === 'erro' && (
            <div style={s.warnBox}>
              ⚠️ <strong>CEP não encontrado.</strong> Preencha o endereço manualmente abaixo — a cidade será validada automaticamente contra a lista do IBGE.
            </div>
          )}

          {mostrarEndereco && (
            <>
              <div style={s.grid_rua_num}>
                <div>
                  <label style={s.label}>
                    Rua *
                    {endLockado && (
                      <button type="button" onClick={destravarEndereco}
                        style={{ marginLeft: 8, fontSize: 11, background: 'none', border: 'none', color: '#185FA5', cursor: 'pointer', textDecoration: 'underline' }}>
                        editar
                      </button>
                    )}
                  </label>
                  <input style={inputRua} value={cliente.rua}
                    readOnly={endLockado}
                    onChange={e => setC('rua', e.target.value.toUpperCase())}
                    placeholder="RUA / AVENIDA" />
                </div>
                <div>
                  <label style={s.label}>Número *</label>
                  <input style={s.input} value={cliente.numero}
                    onChange={e => setC('numero', e.target.value.toUpperCase().slice(0, 10))}
                    placeholder="123" />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={s.label}>Bairro *</label>
                <input style={inputBairro} value={cliente.bairro}
                  readOnly={endLockado}
                  onChange={e => setC('bairro', e.target.value.toUpperCase())}
                  placeholder="BAIRRO" />
              </div>

              <div style={s.grid_cidade_uf}>
                <div>
                  <label style={s.label}>Cidade *</label>
                  <input style={inputCidade} value={cliente.cidade}
                    readOnly={endLockado}
                    onChange={e => setC('cidade', e.target.value.toUpperCase())}
                    placeholder="CIDADE" />
                  {!endLockado && cliente.cidade && cliente.uf && cidadeStatus === 'erro' && (
                    <div style={s.hintErr}>Cidade não encontrada em {cliente.uf}</div>
                  )}
                  {!endLockado && cidadeStatus === 'ok' && (
                    <div style={s.hintOk}>✓ Cidade válida</div>
                  )}
                </div>
                <div>
                  <label style={s.label}>UF *</label>
                  <input style={inputUF} value={cliente.uf}
                    readOnly={endLockado}
                    onChange={e => setC('uf', e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))}
                    placeholder="SP" maxLength={2} />
                  {cliente.uf && !ufOk && <div style={s.hintErr}>UF inválida</div>}
                </div>
              </div>
            </>
          )}

          <div style={{ height: 8 }} />

          <button style={tudoOk && !enviando ? s.btn : s.btnDisabled}
            onClick={enviarZapSign} disabled={!tudoOk || enviando}>
            {enviando ? '⏳ Gerando e enviando ao ZapSign...' : '🚀 Gerar e enviar para assinatura'}
          </button>
          {!tudoOk && camposPreenchidos && (
            <div style={{ ...s.hintErr, textAlign: 'center', marginTop: 8 }}>
              Corrija os campos destacados em vermelho
            </div>
          )}
          {!camposPreenchidos && (
            <div style={{ ...s.hint, textAlign: 'center', marginTop: 8 }}>
              Preencha todos os campos para gerar o contrato
            </div>
          )}
          {enviando && <div style={{ fontSize: 11, color: '#888', marginTop: 8, textAlign: 'center' }}>Aguarde — criando os 3 documentos e enviando ao ZapSign...</div>}
        </div>
      )}
    </div>
  )
}
