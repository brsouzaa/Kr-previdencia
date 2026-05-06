import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const SUPABASE_URL = 'https://sdqslzpfbazehqcvibjy.supabase.co'
const ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || ''

const MOTIVOS = [
  { codigo: 'doc_ilegivel', label: 'Documento ilegível' },
  { codigo: 'doc_faltando_rg', label: 'Falta RG' },
  { codigo: 'doc_faltando_comprovante_residencia', label: 'Falta comprovante de residência' },
  { codigo: 'doc_faltando_comprovante_gravidez', label: 'Falta comprovante de gravidez/parto' },
  { codigo: 'doc_faltando_comprovante_bolsa', label: 'Falta extrato Bolsa Família' },
  { codigo: 'cliente_desistiu', label: 'Cliente desistiu' },
  { codigo: 'dados_divergentes', label: 'Dados divergentes' },
  { codigo: 'nao_se_encaixa_no_perfil', label: 'Não se encaixa no perfil' },
  { codigo: 'outros', label: 'Outros' },
]

const TIPOS_DOC = [
  { key: 'rg_frente', label: 'RG (frente)' },
  { key: 'rg_verso', label: 'RG (verso)' },
  { key: 'comprovante_residencia', label: 'Comp. residência' },
  { key: 'comprovante_gravidez', label: 'Comp. gravidez/DPP' },
  { key: 'comprovante_bolsa_1', label: 'Bolsa Família 1' },
  { key: 'comprovante_bolsa_2', label: 'Bolsa Família 2' },
  { key: 'comprovante_bolsa_3', label: 'Bolsa Família 3' },
  { key: 'cartao_sus', label: 'Cartão SUS' },
  { key: 'outros', label: 'Outros' },
]

function diasDesde(data) { return Math.floor((Date.now() - new Date(data)) / 86400000) }
function horasDesde(data) { return Math.floor((Date.now() - new Date(data)) / 3600000) }

export default function RevisaoIA() {
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [selecionado, setSelecionado] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  
  // Modal de barragem
  const [modalBarrar, setModalBarrar] = useState(false)
  const [motivoBarrar, setMotivoBarrar] = useState('')
  const [obsBarrar, setObsBarrar] = useState('')
  
  // Anexar docs
  const [docsNovos, setDocsNovos] = useState({})
  const [uploading, setUploading] = useState(false)
  
  // Métricas resumo (cabeçalho)
  const [metricas, setMetricas] = useState(null)

  useEffect(() => { carregarTudo() }, [])

  async function carregarTudo() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(p)
    }
    
    // Lista clientes pendentes de revisão IA
    const { data: cs } = await supabase
      .from('clientes')
      .select('*, advogados(nome_completo, oab)')
      .eq('status', 'aguardando_revisao_ia')
      .eq('origem', 'ia')
      .order('updated_at', { ascending: true })
    setClientes(cs || [])
    
    // Métricas resumo (hoje)
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/gerar-contratos-zapsign/metricas-ia?periodo=hoje`, {
        headers: { 'Authorization': `Bearer ${ANON_KEY}` }
      })
      const data = await r.json()
      if (data.ok) setMetricas(data)
    } catch (e) { console.error(e) }
    
    setLoading(false)
  }

  function abrirCliente(c) {
    setSelecionado(c)
    setDocsNovos({})
    setErro('')
    setSucesso('')
  }

  async function uploadDoc(tipo, file) {
    if (!file || !selecionado) return
    setUploading(true)
    setErro('')
    try {
      const ext = file.name.split('.').pop()
      const path = `agatha/${selecionado.id}/${tipo}_${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('documentos-clientes').upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage.from('documentos-clientes').getPublicUrl(path)
      setDocsNovos(prev => ({ ...prev, [tipo]: publicUrl }))
    } catch (e) {
      setErro('Erro upload: ' + (e.message || e))
    } finally {
      setUploading(false)
    }
  }

  async function salvarDocs() {
    if (!selecionado || Object.keys(docsNovos).length === 0) return
    setSalvando(true)
    setErro('')
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/gerar-contratos-zapsign/agatha-anexar-docs`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: selecionado.id, agatha_id: profile.id, documentos: docsNovos })
      })
      const data = await r.json()
      if (!data.ok) throw new Error(data.error)
      setSucesso('Documentos anexados!')
      setDocsNovos({})
      const { data: cAtualizado } = await supabase.from('clientes').select('*, advogados(nome_completo, oab)').eq('id', selecionado.id).single()
      setSelecionado(cAtualizado)
    } catch (e) {
      setErro('Erro: ' + (e.message || e))
    } finally {
      setSalvando(false)
    }
  }

  async function validar() {
    if (!selecionado || !profile) return
    if (!window.confirm(`Validar ${selecionado.nome} e enviar pra pós-venda da Luciane?`)) return
    setSalvando(true)
    setErro('')
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/gerar-contratos-zapsign/agatha-validar-cliente`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: selecionado.id, agatha_id: profile.id })
      })
      const data = await r.json()
      if (!data.ok) throw new Error(data.error)
      setSucesso('Cliente validado e enviado pra pós-venda!')
      setSelecionado(null)
      await carregarTudo()
    } catch (e) {
      setErro('Erro: ' + (e.message || e))
    } finally {
      setSalvando(false)
    }
  }

  async function barrar() {
    if (!selecionado || !profile || !motivoBarrar) return
    setSalvando(true)
    setErro('')
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/gerar-contratos-zapsign/agatha-barrar-cliente`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: selecionado.id, agatha_id: profile.id, motivo: motivoBarrar, observacao: obsBarrar })
      })
      const data = await r.json()
      if (!data.ok) throw new Error(data.error)
      setSucesso('Cliente barrado. Vaga liberada na fila.')
      setModalBarrar(false)
      setMotivoBarrar('')
      setObsBarrar('')
      setSelecionado(null)
      await carregarTudo()
    } catch (e) {
      setErro('Erro: ' + (e.message || e))
    } finally {
      setSalvando(false)
    }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Carregando...</div>

  return (
    <div style={{ padding: '20px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, color: '#222' }}>🤖 Revisão IA</h1>
          <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
            Clientes da IA aguardando validação. Confira docs, anexe e valide ou barre.
          </div>
        </div>
        {metricas && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Card label="Hoje" valor={metricas.ia.funil.cadastrados} subtitulo="cadastrados" cor="#185FA5" />
            <Card label="Pendentes" valor={clientes.length} subtitulo="pra revisar" cor={clientes.length > 0 ? '#854F0B' : '#3B6D11'} />
            <Card label="Aprovação" valor={`${metricas.ia.taxa_aprovacao_agatha}%`} subtitulo="taxa Agatha" cor="#3B6D11" />
            <Card label="Reprovação" valor={`${metricas.ia.taxa_reprovacao_agatha}%`} subtitulo="taxa Agatha" cor="#A32D2D" />
          </div>
        )}
      </div>

      {erro && <div style={{ padding: 12, background: '#FCEBEB', color: '#A32D2D', borderRadius: 6, marginBottom: 12 }}>{erro}</div>}
      {sucesso && <div style={{ padding: 12, background: '#EAF3DE', color: '#3B6D11', borderRadius: 6, marginBottom: 12 }}>{sucesso}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: selecionado ? '1fr 1fr' : '1fr', gap: 16 }}>
        {/* Lista */}
        <div>
          {clientes.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#888', background: '#fff', borderRadius: 8, border: '1px solid rgba(0,0,0,0.06)' }}>
              ✅ Nenhum cliente da IA aguardando revisão
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {clientes.map(c => {
                const horas = horasDesde(c.updated_at)
                const sel = selecionado?.id === c.id
                return (
                  <div key={c.id} onClick={() => abrirCliente(c)}
                    style={{
                      padding: 14, background: sel ? '#E5EEF7' : '#fff',
                      border: sel ? '2px solid #185FA5' : '1px solid rgba(0,0,0,0.08)',
                      borderRadius: 8, cursor: 'pointer'
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <strong>{c.nome}</strong>
                      <span style={{ fontSize: 12, color: horas > 12 ? '#A32D2D' : '#888' }}>
                        {horas < 1 ? 'Agora' : `${horas}h atrás`}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                      CPF: {c.cpf} · Tel: {c.telefone}
                    </div>
                    <div style={{ fontSize: 11, color: '#185FA5', marginTop: 4 }}>
                      ⚖️ {c.advogados?.nome_completo || '—'}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Painel detalhe */}
        {selecionado && (
          <div style={{ background: '#fff', padding: 20, borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>{selecionado.nome}</h2>
              <button onClick={() => setSelecionado(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>✕</button>
            </div>

            {/* Dados básicos */}
            <Section titulo="Dados">
              <Linha label="CPF" valor={selecionado.cpf} />
              <Linha label="RG" valor={selecionado.rg || '—'} />
              <Linha label="Email" valor={selecionado.email} />
              <Linha label="Telefone (WhatsApp)" valor={selecionado.telefone} />
              <Linha label="Endereço" valor={`${selecionado.rua}, ${selecionado.numero} - ${selecionado.bairro}, ${selecionado.cidade}/${selecionado.uf} - CEP ${selecionado.cep}`} />
              {selecionado.data_prevista_parto && <Linha label="DPP" valor={selecionado.data_prevista_parto} />}
              {selecionado.meses_gravidez && <Linha label="Meses gravidez" valor={selecionado.meses_gravidez} />}
              {selecionado.nis && <Linha label="NIS" valor={selecionado.nis} />}
            </Section>

            {/* Conversa */}
            <Section titulo="Conversa">
              <div style={{ fontSize: 13, color: '#666' }}>
                Pesquise no Vendai pelo telefone ou CPF acima pra abrir a conversa do WhatsApp.
              </div>
              {selecionado.prints_atendimento_ia && Array.isArray(selecionado.prints_atendimento_ia) && selecionado.prints_atendimento_ia.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <strong style={{ fontSize: 12 }}>Prints da IA:</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                    {selecionado.prints_atendimento_ia.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                        <img src={url} alt={`print${i}`} style={{ height: 80, borderRadius: 4, border: '1px solid rgba(0,0,0,0.1)' }} />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </Section>

            {/* Documentos existentes */}
            {selecionado.documentos && Object.keys(selecionado.documentos).length > 0 && (
              <Section titulo="Documentos já anexados">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {Object.entries(selecionado.documentos).map(([tipo, url]) => (
                    <a key={tipo} href={url} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'inline-block', padding: '6px 10px', background: '#EAF3DE', color: '#3B6D11', borderRadius: 4, fontSize: 12, textDecoration: 'none' }}>
                      📎 {tipo}
                    </a>
                  ))}
                </div>
              </Section>
            )}

            {/* Anexar novos docs */}
            <Section titulo="Anexar documentos">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                {TIPOS_DOC.map(t => (
                  <div key={t.key} style={{ padding: 8, background: '#f8f8f6', borderRadius: 4, fontSize: 11 }}>
                    <div style={{ marginBottom: 4, color: '#666', fontWeight: 600 }}>{t.label}</div>
                    {docsNovos[t.key] ? (
                      <div style={{ color: '#3B6D11' }}>✓ enviado</div>
                    ) : (
                      <input type="file" accept="image/*,.pdf" onChange={e => uploadDoc(t.key, e.target.files[0])} disabled={uploading}
                        style={{ fontSize: 10, width: '100%' }} />
                    )}
                  </div>
                ))}
              </div>
              {Object.keys(docsNovos).length > 0 && (
                <button onClick={salvarDocs} disabled={salvando}
                  style={{ marginTop: 12, padding: '8px 16px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}>
                  💾 Salvar {Object.keys(docsNovos).length} doc(s)
                </button>
              )}
            </Section>

            {/* Ações */}
            <div style={{ marginTop: 20, display: 'flex', gap: 8, paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
              <button onClick={validar} disabled={salvando}
                style={{ flex: 1, padding: '12px', background: '#3B6D11', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                ✅ Validar e enviar pra Pós-venda
              </button>
              <button onClick={() => setModalBarrar(true)} disabled={salvando}
                style={{ flex: 1, padding: '12px', background: '#A32D2D', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                ❌ Barrar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Barrar */}
      {modalBarrar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 8, maxWidth: 500, width: '90%' }}>
            <h3 style={{ marginTop: 0 }}>Barrar {selecionado?.nome}?</h3>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
              Isso vai cancelar o contrato no ZapSign e liberar a vaga do advogado.
            </div>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Motivo (obrigatório):</label>
            <select value={motivoBarrar} onChange={e => setMotivoBarrar(e.target.value)}
              style={{ width: '100%', padding: 8, marginTop: 4, marginBottom: 12, border: '1px solid rgba(0,0,0,0.2)', borderRadius: 4 }}>
              <option value="">Selecione...</option>
              {MOTIVOS.map(m => <option key={m.codigo} value={m.codigo}>{m.label}</option>)}
            </select>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Observação (opcional):</label>
            <textarea value={obsBarrar} onChange={e => setObsBarrar(e.target.value)} rows={3}
              style={{ width: '100%', padding: 8, marginTop: 4, marginBottom: 12, border: '1px solid rgba(0,0,0,0.2)', borderRadius: 4 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setModalBarrar(false); setMotivoBarrar(''); setObsBarrar('') }}
                style={{ flex: 1, padding: 10, background: '#f0f0ee', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={barrar} disabled={!motivoBarrar || salvando}
                style={{ flex: 1, padding: 10, background: !motivoBarrar ? '#ccc' : '#A32D2D', color: '#fff', border: 'none', borderRadius: 4, cursor: motivoBarrar ? 'pointer' : 'not-allowed' }}>
                Confirmar barragem
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Card({ label, valor, subtitulo, cor }) {
  return (
    <div style={{ background: '#fff', padding: '12px 16px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.08)', minWidth: 100 }}>
      <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: cor, marginTop: 2 }}>{valor}</div>
      <div style={{ fontSize: 10, color: '#888' }}>{subtitulo}</div>
    </div>
  )
}

function Section({ titulo, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 13, color: '#666', textTransform: 'uppercase', margin: '0 0 8px 0', fontWeight: 600 }}>{titulo}</h3>
      <div>{children}</div>
    </div>
  )
}

function Linha({ label, valor }) {
  return (
    <div style={{ display: 'flex', fontSize: 13, padding: '4px 0', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
      <div style={{ width: 140, color: '#888' }}>{label}</div>
      <div style={{ flex: 1, color: '#222' }}>{valor}</div>
    </div>
  )
}
