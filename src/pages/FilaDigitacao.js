import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import formatarParaWhatsApp from '../lib/formatarParaWhatsApp'

const s = {
  card: { background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 14, padding: '1.25rem', marginBottom: 12 },
  cardReemissao: { background: '#fff', border: '1.5px solid #A32D2D', borderRadius: 14, padding: '1.25rem', marginBottom: 12 },
  sectionTitle: { fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12, fontWeight: 500 },
  btn: { padding: '10px 16px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  btnDisabled: { padding: '10px 16px', background: '#aaa', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'not-allowed' },
  btnSec: { padding: '8px 14px', background: '#fff', color: '#185FA5', border: '0.5px solid #185FA540', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer' },
  field: { fontSize: 12, marginBottom: 4 },
  fieldLabel: { color: '#888', fontWeight: 500 },
  fieldValue: { color: '#111', marginLeft: 6 },
  badge: (cor, bg) => ({ display: 'inline-block', padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 500, color: cor, background: bg }),
  modalBg: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' },
  modal: { background: '#fff', borderRadius: 14, padding: '1.5rem', maxWidth: 500, width: '100%', maxHeight: '90vh', overflowY: 'auto' },
  successBox: { background: '#EAF3DE', border: '1.5px solid #3B6D1150', borderRadius: 12, padding: '1rem', marginTop: 12 },
}

const TIPOS_DOC = [
  { chave: 'rg_frente', label: 'RG Frente' },
  { chave: 'rg_verso', label: 'RG Verso' },
  { chave: 'comprovante_1', label: 'Comprovante 1' },
  { chave: 'comprovante_2', label: 'Comprovante 2' },
  { chave: 'comprovante_endereco', label: 'Comprovante de endereço' },
]

function tempoNaFila(dt) {
  const ms = Date.now() - new Date(dt).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h/24)}d`
}

// Mesma lista de status "vivos" que a edge (gerar-contratos-zapsign) usa pra decidir vaga.
// Antes a tela usava qtd_assinados (contador do card, que dessincroniza) + emitido — isso pintava
// o lote de amarelo/"cheio" mesmo com vaga real. Agora conta os clientes vivos de verdade.
const STATUS_VIVOS_LOTE = ['emitido','assinado','em_validacao','validado','aguardando_pos_venda','em_contato_pos_venda','aguardando_revisao_ia','entregue']
function contarVivosLote(l) {
  return (l.clientes || []).filter(c => STATUS_VIVOS_LOTE.includes(c.status)).length
}
// lote tem vaga = vivos < total. Mesma regra do "advogado da vez" (edge).
function loteTemVaga(l) {
  return contarVivosLote(l) < (l.total_contratos || 0)
}

export default function FilaDigitacao() {
  const { profile } = useAuth()
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [proximoLote, setProximoLote] = useState(null)
  const [modalAberto, setModalAberto] = useState(null)
  const [emitindo, setEmitindo] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [copiado, setCopiado] = useState(false)
  const [copiadoWhatsId, setCopiadoWhatsId] = useState(null)
  const [verDocsId, setVerDocsId] = useState(null)
  const [lotesFila, setLotesFila] = useState([])
  const [salvandoOrdem, setSalvandoOrdem] = useState(false)
  const [addAberto, setAddAberto] = useState(false)
  const [barrarCliente, setBarrarCliente] = useState(null)  // cliente a barrar
  const [motivoBarra, setMotivoBarra] = useState('')
  const [barrando, setBarrando] = useState(false)
  const [filtroProduto, setFiltroProduto] = useState('Maternidade')  // fila por produto (default Maternidade)

  const fetchTudo = useCallback(async () => {
    setLoading(true)
    const { data: cs } = await supabase.from('clientes')
      .select('*, profiles!clientes_vendedor_operador_id_fkey(nome)')
      .eq('status', 'aguardando_emissao')
      .order('created_at', { ascending: true })

    const { data: lotes } = await supabase
      .from('lotes')
      .select('*, advogados(*), profiles(nome), clientes(status)')
      .eq('status_pagamento', 'a_entregar')
      .order('prioridade_fila', { ascending: false, nullsFirst: false })
      .order('data_prioridade', { ascending: true, nullsFirst: false })
      .order('data_compra', { ascending: true })
      .limit(60)

    // lote disponivel = vivos < total (mesma regra da edge, via contarVivosLote)
    const disponivel = (lotes || []).find(l => loteTemVaga(l))
    setProximoLote(disponivel || null)
    setLotesFila(lotes || [])
    setClientes(cs || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchTudo() }, [fetchTudo])
  useEffect(() => {
    const id = setInterval(fetchTudo, 45000)
    return () => clearInterval(id)
  }, [fetchTudo])

  async function emitir(cliente) {
    if (emitindo) return
    setEmitindo(true)
    setResultado(null)
    try {
      const resp = await supabase.functions.invoke('gerar-contratos-zapsign/emitir-cliente', {
        body: { cliente_id: cliente.id, supervisor_id: profile.id }
      })
      if (resp.error) throw new Error(typeof resp.error === 'string' ? resp.error : JSON.stringify(resp.error))
      if (!resp.data?.ok) throw new Error(resp.data?.error || 'Erro na emissão')
      setResultado({
        link: resp.data.link_assinatura,
        expira: resp.data.expira_em,
        advogado: resp.data.advogado_nome,
        clienteNome: cliente.nome,
      })
      fetchTudo()
    } catch (err) {
      alert('Erro: ' + (err.message || err.toString()))
    }
    setEmitindo(false)
  }

  // Barra (cancela) um cliente parado na fila, com motivo obrigatorio
  async function barrar() {
    if (barrando || !barrarCliente) return
    if (!motivoBarra.trim()) { alert('Informe o motivo'); return }
    setBarrando(true)
    try {
      const { error } = await supabase.from('clientes')
        .update({ status: 'cancelado', cancelado_motivo: 'Barrado na fila: ' + motivoBarra.trim(), updated_at: new Date().toISOString() })
        .eq('id', barrarCliente.id)
        .eq('status', 'aguardando_emissao')  // trava: so barra se ainda estiver aguardando (evita barrar algo que ja emitiu)
      if (error) throw new Error(error.message)
      setBarrarCliente(null)
      setMotivoBarra('')
      fetchTudo()
    } catch (err) {
      alert('Erro ao barrar: ' + (err.message || err))
    }
    setBarrando(false)
  }

  // === Ordem manual da fila (lotes marcados pelo painel: motivo 'PAINEL:%') ===
  // filtrado pelo produto selecionado (fila separada por produto)
  const lotesDoProduto = (lotesFila || []).filter(l => (l.produto || 'Maternidade') === filtroProduto)
  const ordemManual = lotesDoProduto
    .filter(l => l.advogados && l.prioridade_congelada === true && (l.prioridade_congelada_motivo || '').startsWith('PAINEL:'))
    .sort((a, b) => new Date(a.data_prioridade || 0) - new Date(b.data_prioridade || 0))
  const idsOrdem = ordemManual.map(l => l.id)
  const disponiveis = lotesDoProduto.filter(l => l.advogados && !idsOrdem.includes(l.id) && loteTemVaga(l))

  async function aplicarOrdem(novaLista) {
    if (salvandoOrdem) return
    setSalvandoOrdem(true)
    try {
      const { error } = await supabase.rpc('fila_definir_ordem_manual', { p_lote_ids: novaLista })
      if (error) throw new Error(error.message || JSON.stringify(error))
      await fetchTudo()
    } catch (err) {
      alert('Erro ao salvar ordem: ' + (err.message || err.toString()))
    }
    setSalvandoOrdem(false)
  }

  function moverOrdem(idx, dir) {
    const nova = [...idsOrdem]
    const j = idx + dir
    if (j < 0 || j >= nova.length) return
    const tmp = nova[idx]; nova[idx] = nova[j]; nova[j] = tmp
    aplicarOrdem(nova)
  }

  function removerDaOrdem(loteId) {
    aplicarOrdem(idsOrdem.filter(id => id !== loteId))
  }

  function adicionarNaOrdem(loteId) {
    setAddAberto(false)
    aplicarOrdem([...idsOrdem, loteId])
  }

  function copiarLink() {
    if (!resultado?.link) return
    navigator.clipboard.writeText(resultado.link)
    setCopiado(true); setTimeout(() => setCopiado(false), 2500)
  }

  function copiarWhats(c) {
    const texto = formatarParaWhatsApp(c, c.profiles?.nome)
    navigator.clipboard.writeText(texto)
    setCopiadoWhatsId(c.id); setTimeout(() => setCopiadoWhatsId(null), 2500)
  }

  function fecharModal() {
    setModalAberto(null); setResultado(null); setCopiado(false)
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>Carregando fila...</div>

  // Fila separada por produto: clientes e proximo lote filtrados
  const PRODUTOS_FILA = ['Maternidade', 'Maternidade Mãe', 'Gestante até 5 meses', 'Pensão por Morte', 'BPC', 'Auxilio Acidente']
  const clientesFiltrados = clientes.filter(c => (c.produto || 'Maternidade') === filtroProduto)
  const proximoLoteFiltrado = lotesDoProduto.find(l => loteTemVaga(l)) || null

  return (
    <div>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 500, color: '#111', marginBottom: 4 }}>📥 Fila de digitação</div>
          <div style={{ fontSize: 13, color: '#888' }}>{clientesFiltrados.length} cliente{clientesFiltrados.length !== 1 ? 's' : ''} aguardando emissão · {filtroProduto}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={filtroProduto} onChange={e => setFiltroProduto(e.target.value)}
            style={{ padding: '8px 10px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 8, background: '#fff', outline: 'none', cursor: 'pointer' }}>
            {PRODUTOS_FILA.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button onClick={fetchTudo} style={{ padding: '8px 14px', fontSize: 13, background: '#fff', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 8, cursor: 'pointer', color: '#555' }}>↻ Atualizar</button>
        </div>
      </div>

      {/* === Ordem manual da fila === */}
      <div style={{ ...s.card, border: '1px solid #185FA530' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
          <div style={{ ...s.sectionTitle, marginBottom: 0 }}>🔢 Ordem manual da fila</div>
          <button onClick={() => setAddAberto(true)} disabled={salvandoOrdem} style={s.btnSec}>+ Adicionar advogado</button>
        </div>

        {ordemManual.length === 0 ? (
          <div style={{ fontSize: 12, color: '#888' }}>
            Nenhum advogado fixado — a fila está no automático. Use <strong>+ Adicionar advogado</strong> para definir quem vem primeiro.
          </div>
        ) : (
          ordemManual.map((l, i) => {
            const ocupado = contarVivosLote(l)
            const cheio = ocupado >= (l.total_contratos || 0)
            return (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: i === 0 ? '#FEF3C7' : '#f8f8f6', borderRadius: 8, marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#888', minWidth: 20 }}>{i + 1}º</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{l.advogados?.nome_completo || '—'}</div>
                  <div style={{ fontSize: 11, color: cheio ? '#A32D2D' : '#888' }}>{ocupado}/{l.total_contratos} ocupados{cheio ? ' · cheio → passa pro próximo' : ''}</div>
                </div>
                <button onClick={() => moverOrdem(i, -1)} disabled={i === 0 || salvandoOrdem} style={{ ...s.btnSec, padding: '4px 10px', opacity: i === 0 ? 0.4 : 1 }}>↑</button>
                <button onClick={() => moverOrdem(i, 1)} disabled={i === ordemManual.length - 1 || salvandoOrdem} style={{ ...s.btnSec, padding: '4px 10px', opacity: i === ordemManual.length - 1 ? 0.4 : 1 }}>↓</button>
                <button onClick={() => removerDaOrdem(l.id)} disabled={salvandoOrdem} style={{ padding: '4px 10px', background: '#fff', color: '#A32D2D', border: '0.5px solid #A32D2D40', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>✕</button>
              </div>
            )
          })
        )}
        {salvandoOrdem && <div style={{ fontSize: 11, color: '#185FA5', marginTop: 6 }}>⏳ salvando ordem...</div>}
      </div>

      {addAberto && (
        <div style={s.modalBg} onClick={() => setAddAberto(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 500, color: '#111', marginBottom: 4 }}>Adicionar advogado à ordem</div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>Lotes com vaga. Entra no fim da sequência (depois você reposiciona com ↑ ↓).</div>
            {disponiveis.length === 0 ? (
              <div style={{ fontSize: 13, color: '#888' }}>Nenhum lote disponível com vaga.</div>
            ) : (
              disponiveis.map(l => {
                const ocupado = contarVivosLote(l)
                return (
                  <div key={l.id} onClick={() => adicionarNaOrdem(l.id)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#f8f8f6', borderRadius: 8, marginBottom: 6, cursor: 'pointer' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{l.advogados?.nome_completo || '—'}</div>
                      <div style={{ fontSize: 11, color: '#888' }}>{ocupado}/{l.total_contratos} ocupados · {l.produto || ''}</div>
                    </div>
                    <span style={{ fontSize: 20, color: '#185FA5', marginLeft: 10 }}>＋</span>
                  </div>
                )
              })
            )}
            <button onClick={() => setAddAberto(false)} style={{ width: '100%', marginTop: 12, padding: '10px', background: '#fff', color: '#666', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Fechar</button>
          </div>
        </div>
      )}

      {proximoLoteFiltrado && proximoLoteFiltrado.advogados ? (
        <div style={{ ...s.card, background: proximoLoteFiltrado.prioridade_fila ? '#FEF3C7' : '#E6F1FB', border: proximoLoteFiltrado.prioridade_fila ? '1.5px solid #F59E0B' : '1.5px solid #185FA540' }}>
          <div style={{ ...s.sectionTitle, marginBottom: 6 }}>
            ⚖️ Advogado da vez
            {proximoLoteFiltrado.prioridade_fila && <span style={{ marginLeft: 8, padding: '2px 8px', background: '#F59E0B', color: '#fff', borderRadius: 10, fontSize: 10 }}>⚡ PRIORIDADE</span>}
          </div>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#111' }}>{proximoLoteFiltrado.advogados.nome_completo}</div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>OAB/{proximoLoteFiltrado.advogados.estado} {proximoLoteFiltrado.advogados.oab}</div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
            Lote: {contarVivosLote(proximoLoteFiltrado)}/{proximoLoteFiltrado.total_contratos} ocupados · Vendedor: {proximoLoteFiltrado.profiles?.nome}
          </div>
        </div>
      ) : (
        <div style={{ ...s.card, background: '#FCEBEB', border: '1.5px solid #A32D2D40' }}>
          <div style={{ fontSize: 14, color: '#A32D2D', fontWeight: 500 }}>⚠️ Nenhum advogado disponível na fila</div>
        </div>
      )}

      {clientesFiltrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#888', background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.06)' }}>
          ✅ Fila vazia — nenhum cliente aguardando.
        </div>
      ) : clientesFiltrados.map((c, idx) => {
        const docs = c.documentos || {}
        const docsAnexados = TIPOS_DOC.filter(t => docs[t.chave]).length
        const docsObrigatorios = ['rg_frente','rg_verso','comprovante_1','comprovante_2'].filter(k => docs[k]).length
        const docsCompletos = docsObrigatorios === 4
        const verDocs = verDocsId === c.id
        // Cliente que veio de uma devolução de reemissão
        const ehReemissao = !!c.devolvido_em && !c.contrato_producao_id

        return (
          <div key={c.id} style={ehReemissao ? s.cardReemissao : s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>
                  #{idx + 1} · há {tempoNaFila(c.created_at)}
                  {ehReemissao && <span style={{ marginLeft: 8, color: '#A32D2D', fontWeight: 500 }}>🔄 REEMISSÃO</span>}
                </div>
                <div style={{ fontSize: 15, fontWeight: 500, color: '#111' }}>{c.nome}</div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{c.cpf} · {c.telefone}</div>
              </div>
              <span style={s.badge(
                c.produto === 'Maternidade' ? '#0F6E56' : (c.produto === 'BPC' || c.produto === 'Pensão por Morte') ? '#534AB7' : '#854F0B',
                c.produto === 'Maternidade' ? '#E1F5EE' : (c.produto === 'BPC' || c.produto === 'Pensão por Morte') ? '#EEEDFE' : '#FAEEDA'
              )}>
                {c.produto === 'Auxilio Acidente' ? 'Auxílio Acidente' : c.produto}
              </span>
            </div>

            {ehReemissao && c.motivo_devolucao && (
              <div style={{ background: '#FCEBEB', borderRadius: 6, padding: 10, marginBottom: 10, fontSize: 12, color: '#A32D2D' }}>
                <strong>🔄 Cliente devolvido pela analista:</strong> "{c.motivo_devolucao}"
                <br /><span style={{ fontSize: 11 }}>Confira os dados antes de reemitir.</span>
              </div>
            )}

            <div style={{ background: '#f8f8f6', padding: '8px 10px', borderRadius: 6, marginBottom: 8 }}>
              <div style={s.field}>
                <span style={s.fieldLabel}>RG:</span><span style={s.fieldValue}>{c.rg}</span>
                <span style={{ ...s.fieldLabel, marginLeft: 12 }}>E-mail:</span><span style={s.fieldValue}>{c.email}</span>
              </div>
              <div style={s.field}>
                <span style={s.fieldLabel}>Endereço:</span>
                <span style={s.fieldValue}>{c.rua}, {c.numero} - {c.bairro}, {c.cidade}/{c.uf} - {c.cep}</span>
              </div>
              <div style={s.field}>
                <span style={s.fieldLabel}>Vendedor:</span><span style={s.fieldValue}>{c.profiles?.nome || '—'}</span>
              </div>
              {c.produto === 'Maternidade' && (
                <div style={s.field}>
                  {c.nis && <><span style={s.fieldLabel}>NIS:</span><span style={s.fieldValue}>{c.nis}</span></>}
                  {c.data_prevista_parto && <><span style={{ ...s.fieldLabel, marginLeft: 12 }}>Parto:</span><span style={s.fieldValue}>{(() => { const p = c.data_prevista_parto.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : c.data_prevista_parto })()}</span></>}
                  {c.meses_gravidez && <><span style={{ ...s.fieldLabel, marginLeft: 12 }}>Gravidez:</span><span style={s.fieldValue}>{c.meses_gravidez}</span></>}
                </div>
              )}
            </div>

            {c.observacao && (
              <div style={{ fontSize: 12, color: '#666', marginBottom: 10, padding: '6px 10px', background: '#FAEEDA', borderRadius: 6, fontStyle: 'italic' }}>
                💬 {c.observacao}
              </div>
            )}

            <div style={{ padding: '8px 10px', borderRadius: 6, marginBottom: 10, background: docsCompletos ? '#EAF3DE' : '#FCEBEB', fontSize: 12, color: docsCompletos ? '#3B6D11' : '#A32D2D' }}>
              📎 {docsAnexados}/5 documentos {docsCompletos ? '· obrigatórios completos ✓' : `· faltam ${4 - docsObrigatorios}`}
              <button onClick={() => setVerDocsId(verDocs ? null : c.id)}
                style={{ marginLeft: 10, fontSize: 11, background: 'none', border: 'none', color: docsCompletos ? '#3B6D11' : '#A32D2D', cursor: 'pointer', textDecoration: 'underline' }}>
                {verDocs ? 'esconder' : 'ver links'}
              </button>
            </div>

            {verDocs && (
              <div style={{ marginBottom: 10, padding: 10, background: '#fafaf8', borderRadius: 6 }}>
                {TIPOS_DOC.map(tipo => (
                  <div key={tipo.chave} style={{ marginBottom: 4, fontSize: 12 }}>
                    <span style={{ color: '#555', minWidth: 200, display: 'inline-block' }}>{tipo.label}:</span>
                    {docs[tipo.chave] ? (
                      <a href={docs[tipo.chave]} target="_blank" rel="noreferrer" style={{ color: '#185FA5', textDecoration: 'underline' }}>✓ abrir</a>
                    ) : (
                      <span style={{ color: '#aaa' }}>— não anexado</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button onClick={() => copiarWhats(c)}
                style={copiadoWhatsId === c.id ?
                  { padding: '8px 14px', background: '#3B6D11', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer' } :
                  s.btnSec}>
                {copiadoWhatsId === c.id ? '✓ Copiado pra WhatsApp' : '📋 Copiar pra WhatsApp'}
              </button>
              <button onClick={() => setModalAberto(c)} style={proximoLoteFiltrado ? s.btn : s.btnDisabled} disabled={!proximoLoteFiltrado}>
                🚀 Emitir contrato
              </button>
              <button onClick={() => { setBarrarCliente(c); setMotivoBarra('') }}
                style={{ padding: '8px 14px', background: '#fff', color: '#B42318', border: '1px solid #FDA29B', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                🚫 Barrar
              </button>
            </div>
          </div>
        )
      })}

      {barrarCliente && (
        <div style={s.modalBg} onClick={() => setBarrarCliente(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 500, color: '#B42318', marginBottom: 8 }}>🚫 Barrar cliente</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>
              O cliente sai da fila e é cancelado. Informe o motivo.
            </div>
            <div style={{ background: '#f8f8f6', borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>CLIENTE</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#111' }}>{barrarCliente.nome}</div>
              <div style={{ fontSize: 12, color: '#666' }}>{barrarCliente.cpf}</div>
            </div>
            <textarea value={motivoBarra} onChange={e => setMotivoBarra(e.target.value)}
              placeholder="Motivo (ex: cliente desistiu, dados inválidos, duplicado...)"
              style={{ width: '100%', minHeight: 70, padding: 10, borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', fontSize: 13, boxSizing: 'border-box', marginBottom: 12, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setBarrarCliente(null)} style={{ flex: 1, padding: '10px', background: '#fff', color: '#666', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={barrar} disabled={barrando}
                style={{ flex: 2, padding: '10px', background: barrando ? '#aaa' : '#B42318', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: barrando ? 'not-allowed' : 'pointer' }}>
                {barrando ? '⏳ Barrando...' : '🚫 Confirmar e barrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalAberto && (
        <div style={s.modalBg} onClick={fecharModal}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            {!resultado ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 500, color: '#111', marginBottom: 8 }}>Confirmar emissão</div>
                <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
                  Será gerado um contrato no ZapSign vinculando este cliente ao advogado da vez.
                </div>

                <div style={{ background: '#f8f8f6', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>CLIENTE</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#111' }}>{modalAberto.nome}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>{modalAberto.cpf}</div>
                </div>

                <div style={{ background: '#E6F1FB', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: '#185FA5', marginBottom: 4 }}>ADVOGADO DA VEZ</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#111' }}>{proximoLoteFiltrado?.advogados?.nome_completo}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>OAB/{proximoLoteFiltrado?.advogados?.estado} {proximoLoteFiltrado?.advogados?.oab}</div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={fecharModal} style={{ flex: 1, padding: '10px', background: '#fff', color: '#666', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Cancelar</button>
                  <button onClick={() => emitir(modalAberto)} disabled={emitindo}
                    style={{ flex: 2, padding: '10px', background: emitindo ? '#aaa' : '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: emitindo ? 'not-allowed' : 'pointer' }}>
                    {emitindo ? '⏳ Emitindo...' : '🚀 Confirmar e emitir'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
                  <div style={{ fontSize: 16, fontWeight: 500, color: '#3B6D11' }}>Contrato emitido!</div>
                  <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{resultado.clienteNome} · {resultado.advogado}</div>
                </div>

                <div style={s.successBox}>
                  <div style={{ fontSize: 12, color: '#3B6D11', fontWeight: 500, marginBottom: 6 }}>📨 Link de assinatura</div>
                  <div style={{ background: '#fff', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: '#185FA5', wordBreak: 'break-all', marginBottom: 8 }}>{resultado.link}</div>
                  <div style={{ fontSize: 11, color: '#854F0B', marginBottom: 10 }}>⏰ Expira em 15h</div>
                  <button onClick={copiarLink} style={{ width: '100%', padding: '10px', background: copiado ? '#3B6D11' : '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                    {copiado ? '✓ Link copiado' : '📋 Copiar link'}
                  </button>
                </div>

                <button onClick={fecharModal} style={{ width: '100%', marginTop: 14, padding: '10px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                  Próximo cliente da fila
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
