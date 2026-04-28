import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL

const s = {
  card: { background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 14, padding: '1.5rem', marginBottom: 14 },
  label: { display: 'block', fontSize: 12, color: '#555', marginBottom: 4 },
  input: { width: '100%', padding: '10px 12px', fontSize: 14, border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 8, color: '#111', background: '#fff', outline: 'none', boxSizing: 'border-box' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 },
  btn: { width: '100%', padding: '13px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' },
  btnDisabled: { width: '100%', padding: '13px', background: '#aaa', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'not-allowed' },
  sectionTitle: { fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12, fontWeight: 500, paddingBottom: 8, borderBottom: '0.5px solid rgba(0,0,0,0.06)' },
}

function hoje() {
  const d = new Date()
  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`
}

// Processamento feito na Edge Function

export default function GerarContratos() {
  const { profile } = useAuth()
  const [proximoLote, setProximoLote] = useState(null)
  const [advogado, setAdvogado] = useState(null)
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null) // { link, token }
  const [copiado, setCopiado] = useState(false)
  const [cliente, setCliente] = useState({ nome:'', cpf:'', rg:'', telefone:'', email:'', endereco:'', numero:'', bairro:'', cidade:'', uf:'', cep:'' })

  useEffect(() => { fetchProximo() }, [])

  async function fetchProximo() {
    setLoading(true)
    setResultado(null)
    const { data } = await supabase
      .from('lotes')
      .select('*, advogados(*), profiles(nome)')
      .eq('status_pagamento', 'a_entregar')
      .order('data_compra', { ascending: true })
      .limit(1)
    if (data && data.length > 0) {
      setProximoLote(data[0])
      setAdvogado(data[0].advogados)
    } else {
      setProximoLote(null)
      setAdvogado(null)
    }
    setLoading(false)
  }

  function setC(f, v) { setCliente(c => ({ ...c, [f]: v })) }

  const camposOk = cliente.nome && cliente.cpf && cliente.telefone && cliente.endereco && cliente.cidade && cliente.uf && cliente.cep

  async function enviarZapSign() {
    if (!camposOk || !advogado) return
    setEnviando(true)
    try {
      const dataHoje = hoje()
      const baseUrl = `${window.location.origin}/templates`
  const nomeContrato = encodeURIComponent('CONTRATO DE PRESTAÇÃO DE SERVIÇOS -DAIANE FERREIRA SILVEIRA.docx')
  const nomeProcuracao = encodeURIComponent('Procuração   Daiane .docx')
  const nomeTermo = encodeURIComponent('TERMO DE ANUÊNCIA -  INÊS BERTOLO.docx')
      const nomeAdv = advogado.nome_completo.toUpperCase()
      const oabNum = (advogado.oab || '').replace(/\D/g, '')
      const ufOab = advogado.estado || 'SP'

      // Endereço completo do advogado para o contrato
      const enderecoAdvCompleto = [advogado.endereco, advogado.cep ? `Cep ${advogado.cep}` : ''].filter(Boolean).join(', ') || ''
      // Montar endereço completo do cliente
      const enderecoClienteCompleto = [cliente.endereco, cliente.numero, cliente.bairro].filter(Boolean).join(', ')
      const subsContrato = {
        'ENECLESIA TAINARA ZANLUCA DA SILVA': cliente.nome.toUpperCase(),
        '125.482.729-31': cliente.cpf,
        '(54) 99660-1519': cliente.telefone,
        'Rua Benno Sommer / 84 Bairro Jardim': enderecoClienteCompleto,
        'Nao me toque Rio Grande do Sul': `${cliente.cidade} ${cliente.uf}`,
        '99470-000': cliente.cep,
        'INÊS BERTOLO': nomeAdv,
        '342202': oabNum,
        'OAB/SP': `OAB/${ufOab}`,
        'Rua Carlos Mieli 46, centro, São Bernardo do Campo, SP. Cep 09720350': enderecoAdvCompleto,
        '11 94753 0536': advogado.telefone || '',
        'Inesdax123@gmail.com': advogado.email || '',
      }
      const subsProcuracao = {
        'DAIANE FERREIRA SILVEIRA': cliente.nome.toUpperCase(),
        '051.402.660-08': cliente.cpf,
        '10036856648': cliente.rg || '',
        'Rua Benno Sommer / 84 Bairro Jardim': enderecoClienteCompleto,
        'Nao me toque Rio Grande do Sul': `${cliente.cidade} ${cliente.uf}`,
        '99470-000': cliente.cep,
        '27 de abril 2026': dataHoje,
        'INÊS BERTOLO': nomeAdv,
        '342202': oabNum,
        'OAB/SP': `OAB/${ufOab}`,
        'Rua Carlos Mieli 46, centro, São Bernardo do Campo, SP. Cep 09720350': enderecoAdvCompleto,
        '11 94753 0536': advogado.telefone || '',
        'Inesdax123@gmail.com': advogado.email || '',
        'São Paulo, 27 de abril 2026': `${cliente.cidade}, ${dataHoje}`,
      }
      const subsTermo = {
        'INÊS BERTOLO': nomeAdv,
        'São Paulo 27 de abril de 2026': `${cliente.cidade} ${dataHoje}`,
      }

      // Processar os 3 docs no browser
      const [b64Contrato, b64Procuracao, b64Termo] = await Promise.all([
        processarDocx(`${baseUrl}/${nomeContrato}`, subsContrato),
        processarDocx(`${baseUrl}/${nomeProcuracao}`, subsProcuracao),
        processarDocx(`${baseUrl}/${nomeTermo}`, subsTermo),
      ])

      // Enviar para Edge Function que chama o ZapSign
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await supabase.functions.invoke('gerar-contratos-zapsign', {
        body: {
          cliente: { ...cliente },
          advogado,
          lote_id: proximoLote?.id,
          produtor_id: profile?.id,
          data_hoje: dataHoje,
          b64_contrato: b64Contrato,
          b64_procuracao: b64Procuracao,
          b64_termo: b64Termo,
        }
      })

      console.log('Resposta ZapSign:', resp)
      if (resp.error) throw new Error(typeof resp.error === 'string' ? resp.error : JSON.stringify(resp.error))
      if (!resp.data?.ok) throw new Error(resp.data?.error || JSON.stringify(resp.data) || 'Erro na Edge Function')

      setResultado({ link: resp.data.link_assinatura, token: resp.data.zapsign_token, expira: resp.data.expira_em })

      // Atualizar status do lote para assinar_contrato
      if (proximoLote?.id) {
        await supabase.from('lotes').update({ status_pagamento: 'assinar_contrato', updated_at: new Date().toISOString() }).eq('id', proximoLote.id)
      }

    } catch (err) {
      console.error('Erro completo:', err)
      alert('Erro: ' + (err.message || err.toString() || 'Erro desconhecido ao processar'))
    }
    setEnviando(false)
  }

  function copiarLink() {
    navigator.clipboard.writeText(resultado.link)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2500)
  }

  function proximoCliente() {
    setCliente({ nome:'', cpf:'', rg:'', telefone:'', email:'', endereco:'', cidade:'', uf:'', cep:'' })
    setResultado(null)
    fetchProximo()
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>Carregando...</div>

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: 20, fontWeight: 500, color: '#111', marginBottom: 4 }}>📄 Gerar contratos</div>
        <div style={{ fontSize: 13, color: '#888' }}>3 documentos gerados e enviados ao ZapSign automaticamente</div>
      </div>

      {/* Advogado da vez */}
      {advogado ? (
        <div style={{ ...s.card, background: '#E6F1FB', border: '1.5px solid #185FA540' }}>
          <div style={s.sectionTitle}>Advogado da vez — próximo na fila</div>
          <div style={{ fontSize: 16, fontWeight: 500, color: '#111', marginBottom: 6 }}>{advogado.nome_completo}</div>
          <div style={{ fontSize: 13, color: '#555', marginBottom: 2 }}>OAB/{advogado.estado} {advogado.oab}</div>
          {advogado.endereco && <div style={{ fontSize: 12, color: '#888', marginBottom: 2 }}>{advogado.endereco}</div>}
          <div style={{ fontSize: 12, color: '#888' }}>{advogado.telefone} · {advogado.email}</div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>
            Vendedor: {proximoLote?.profiles?.nome} · {proximoLote?.total_contratos} contrato{proximoLote?.total_contratos !== 1 ? 's' : ''} no lote · {proximoLote?.data_compra}
          </div>
        </div>
      ) : (
        <div style={{ ...s.card, textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 15, color: '#555' }}>Fila vazia — nenhum lote aguardando contrato</div>
        </div>
      )}

      {/* Resultado: link de assinatura */}
      {resultado && (
        <div style={{ ...s.card, background: '#EAF3DE', border: '1.5px solid #3B6D1150' }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#3B6D11', marginBottom: 8 }}>✅ Contratos enviados ao ZapSign!</div>
          <div style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>
            Os 3 documentos foram criados. Copie o link e envie para o cliente assinar:
          </div>
          {resultado.expira && (
            <div style={{ fontSize: 12, color: '#854F0B', background: '#FAEEDA', borderRadius: 6, padding: '6px 10px', marginBottom: 12 }}>
              ⏰ Link expira em 48h ({resultado.expira}) — após isso o cliente não consegue mais assinar
            </div>
          )}
          <div style={{ background: '#fff', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#185FA5', wordBreak: 'break-all', border: '0.5px solid rgba(0,0,0,0.1)' }}>
            {resultado.link}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button onClick={copiarLink} style={{ flex: 1, padding: '10px', background: copiado ? '#3B6D11' : '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'background 0.2s' }}>
              {copiado ? '✓ Link copiado!' : '📋 Copiar link'}
            </button>
            <a href={`https://wa.me/?text=${encodeURIComponent('Olá! Segue o link para assinar seus documentos: ' + resultado.link)}`}
              target="_blank" rel="noreferrer"
              style={{ flex: 1, padding: '10px', background: '#EAF3DE', color: '#3B6D11', border: '0.5px solid #3B6D11', borderRadius: 8, fontSize: 14, fontWeight: 500, textDecoration: 'none', textAlign: 'center' }}>
              💬 Enviar WhatsApp
            </a>
          </div>
          <button onClick={proximoCliente} style={{ width: '100%', padding: '10px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
            ➡️ Próximo cliente
          </button>
        </div>
      )}

      {/* Formulário do cliente */}
      {advogado && !resultado && (
        <div style={s.card}>
          <div style={s.sectionTitle}>Dados do cliente (beneficiário)</div>
          <div style={{ marginBottom: 12 }}>
            <label style={s.label}>Nome completo *</label>
            <input style={s.input} value={cliente.nome} onChange={e => setC('nome', e.target.value)} placeholder="Nome completo do cliente" />
          </div>
          <div style={s.grid2}>
            <div>
              <label style={s.label}>CPF *</label>
              <input style={s.input} value={cliente.cpf} onChange={e => setC('cpf', e.target.value)} placeholder="000.000.000-00" />
            </div>
            <div>
              <label style={s.label}>RG</label>
              <input style={s.input} value={cliente.rg} onChange={e => setC('rg', e.target.value)} placeholder="00.000.000-0" />
            </div>
          </div>
          <div style={s.grid2}>
            <div>
              <label style={s.label}>Telefone *</label>
              <input style={s.input} value={cliente.telefone} onChange={e => setC('telefone', e.target.value)} placeholder="(11) 99999-0000" />
            </div>
            <div>
              <label style={s.label}>E-mail</label>
              <input style={s.input} type="email" value={cliente.email} onChange={e => setC('email', e.target.value)} placeholder="cliente@email.com" />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={s.label}>Endereço completo *</label>
            <input style={s.input} value={cliente.endereco} onChange={e => setC('endereco', e.target.value)} placeholder="Rua, número, bairro" />
          </div>
          <div style={s.grid2}>
            <div>
              <label style={s.label}>Cidade *</label>
              <input style={s.input} value={cliente.cidade} onChange={e => setC('cidade', e.target.value)} placeholder="Cidade" />
            </div>
            <div>
              <label style={s.label}>UF *</label>
              <input style={s.input} value={cliente.uf} onChange={e => setC('uf', e.target.value.toUpperCase().slice(0,2))} placeholder="SP" maxLength={2} />
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={s.label}>CEP *</label>
            <input style={s.input} value={cliente.cep} onChange={e => setC('cep', e.target.value)} placeholder="00000-000" />
          </div>
          <button style={camposOk && !enviando ? s.btn : s.btnDisabled} onClick={enviarZapSign} disabled={!camposOk || enviando}>
            {enviando ? '⏳ Gerando e enviando ao ZapSign...' : '🚀 Gerar e enviar para assinatura'}
          </button>
          {enviando && <div style={{ fontSize: 11, color: '#888', marginTop: 8, textAlign: 'center' }}>Aguarde — criando os 3 documentos e enviando ao ZapSign...</div>}
        </div>
      )}
    </div>
  )
}
