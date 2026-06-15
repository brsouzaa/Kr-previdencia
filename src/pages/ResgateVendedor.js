import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const MOTIVOS_RESGATE = [
  { v: 'nao_responde_advogado', l: 'Não responde o advogado' },
  { v: 'ja_tem_outro_advogado', l: 'Já tem outro advogado' },
  { v: 'pensou_outra_coisa', l: 'Pensou que era outra coisa' },
]
const MOTIVOS_REPOSICAO = [
  { v: 'gravidez_4_meses', l: 'Gravidez 4+ meses' },
  { v: 'menor_idade', l: 'Menor de idade' },
]

const MOTIVO_LABEL = {
  gravidez_4_meses: 'Gravidez 4+ meses', menor_idade: 'Menor de idade',
  nao_responde_advogado: 'Não responde o advogado', ja_tem_outro_advogado: 'Já tem outro advogado',
  pensou_outra_coisa: 'Pensou que era outra coisa', outro: 'Outro',
}
const STATUS_STYLE = {
  em_andamento: { background: '#FFF8E7', color: '#854F0B', label: 'Em andamento' },
  recuperado: { background: '#EAF3DE', color: '#3B6D11', label: 'Recuperado' },
  realocado: { background: '#E6F1FB', color: '#185FA5', label: 'Realocado' },
  virou_reposicao: { background: '#F1EFE8', color: '#5F5E5A', label: 'Virou reposição' },
  perdido: { background: '#FCEBEB', color: '#A32D2D', label: 'Perdido' },
}

const s = {
  title: { fontSize: 20, fontWeight: 500, color: '#111', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#888', marginBottom: 20 },
  tabs: { display: 'flex', gap: 8, marginBottom: 20, borderBottom: '0.5px solid rgba(0,0,0,0.1)', flexWrap: 'wrap' },
  tab: { padding: '10px 16px', fontSize: 13, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', color: '#888', borderBottom: '2px solid transparent', marginBottom: -1 },
  tabActive: { color: '#0F6E56', borderBottomColor: '#0F6E56' },
  card: { background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: 10 },
  label: { fontSize: 12, color: '#666', fontWeight: 500, marginBottom: 4, display: 'block' },
  input: { width: '100%', padding: '9px 11px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.18)', borderRadius: 8, marginBottom: 12, boxSizing: 'border-box', background: '#fff' },
  btnPrim: { padding: '9px 16px', background: '#0F6E56', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  btnDanger: { padding: '9px 16px', background: '#A32D2D', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  meta: { fontSize: 12, color: '#888', marginTop: 2 },
  nome: { fontSize: 14, fontWeight: 500, color: '#111' },
  status: { fontSize: 11, padding: '3px 10px', borderRadius: 10, fontWeight: 500 },
  empty: { textAlign: 'center', padding: '3rem 1rem', color: '#aaa', fontSize: 13 },
  loading: { textAlign: 'center', padding: '2rem', color: '#888', fontSize: 14 },
  warn: { background: '#FCEBEB', border: '0.5px solid #A32D2D40', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#A32D2D', marginBottom: 12 },
}

export default function ResgateVendedor() {
  const { profile } = useAuth()
  const [aba, setAba] = useState('enviar')

  // enviar cliente
  const [busca, setBusca] = useState('')
  const [clientes, setClientes] = useState([])
  const [clienteSel, setClienteSel] = useState(null)
  const [destino, setDestino] = useState('resgate')
  const [motivo, setMotivo] = useState('')
  const [motivoLivre, setMotivoLivre] = useState('')
  const [enviando, setEnviando] = useState(false)

  // inadimplentes
  const [advogados, setAdvogados] = useState([])
  const [advSel, setAdvSel] = useState('')
  const [processando, setProcessando] = useState(false)

  // acompanhar
  const [meusResgates, setMeusResgates] = useState([])
  const [loadingAcomp, setLoadingAcomp] = useState(false)

  const isAdmin = profile && ['admin', 'analista'].includes(profile.role)

  // buscar clientes dos advogados do vendedor
  const buscarClientes = useCallback(async () => {
    if (busca.trim().length < 3) { setClientes([]); return }
    let q = supabase
      .from('clientes')
      .select('id, nome, cpf, telefone, status, advogado_id, advogados!clientes_advogado_id_fkey(nome_completo, vendedor_id)')
      .or(`nome.ilike.%${busca}%,cpf.ilike.%${busca}%`)
      .in('status', ['validado', 'assinado', 'em_validacao', 'aguardando_emissao', 'emitido', 'aguardando_pos_venda', 'em_contato_pos_venda'])
      .limit(15)
    const { data } = await q
    // se não for admin, filtra só clientes de advogados do vendedor logado
    let lista = data || []
    if (!isAdmin) lista = lista.filter(c => c.advogados?.vendedor_id === profile.id)
    setClientes(lista)
  }, [busca, isAdmin, profile])

  useEffect(() => { const t = setTimeout(buscarClientes, 350); return () => clearTimeout(t) }, [buscarClientes])

  // advogados do vendedor (pra inadimplentes)
  useEffect(() => {
    if (aba !== 'inadimplentes') return
    let q = supabase.from('advogados').select('id, nome_completo, vendedor_id').order('nome_completo')
    q.then(({ data }) => {
      let lista = data || []
      if (!isAdmin) lista = lista.filter(a => a.vendedor_id === profile.id)
      setAdvogados(lista)
    })
  }, [aba, isAdmin, profile])

  // acompanhar: resgates de clientes dos advogados do vendedor
  const carregarAcomp = useCallback(async () => {
    setLoadingAcomp(true)
    const { data } = await supabase
      .from('resgates')
      .select(`*,
        cliente:clientes!resgates_cliente_id_fkey(nome, telefone),
        advogado_origem:advogados!resgates_advogado_origem_id_fkey(nome_completo, vendedor_id),
        resgatador:profiles!resgates_resgatador_id_fkey(nome)
      `)
      .order('created_at', { ascending: false })
      .limit(200)
    let lista = data || []
    if (!isAdmin) lista = lista.filter(r => r.advogado_origem?.vendedor_id === profile.id)
    setMeusResgates(lista)
    setLoadingAcomp(false)
  }, [isAdmin, profile])

  useEffect(() => { if (aba === 'acompanhar') carregarAcomp() }, [aba, carregarAcomp])

  async function enviarCliente() {
    if (!clienteSel) { alert('Selecione um cliente'); return }
    if (!motivo) { alert('Selecione o motivo'); return }
    if (motivo === 'outro' && motivoLivre.trim() === '') { alert('Escreva o motivo'); return }
    setEnviando(true)
    const { error } = await supabase.rpc('enviar_cliente_ala', {
      p_cliente_id: clienteSel.id,
      p_destino: destino,
      p_motivo: motivo,
      p_motivo_livre: motivo === 'outro' ? motivoLivre : null,
      p_enviado_por: profile.id,
    })
    setEnviando(false)
    if (error) { alert('Erro: ' + error.message); return }
    alert(`${clienteSel.nome} enviado para ${destino === 'resgate' ? 'resgate' : 'reposição'}.`)
    setClienteSel(null); setBusca(''); setMotivo(''); setMotivoLivre(''); setClientes([])
  }

  async function processarInadimplente() {
    if (!advSel) { alert('Selecione o advogado'); return }
    const adv = advogados.find(a => a.id === advSel)
    if (!window.confirm(`Mandar os clientes vivos de ${adv?.nome_completo} pra ala de resgate?\n\nNinguém é cancelado. Os clientes seguem vivos e a ala vai realocar cada um pra outro advogado. A inadimplência só abate quando o cliente assinar com o novo.`)) return
    setProcessando(true)
    const { data, error } = await supabase.rpc('advogado_inadimplente_para_reposicao', {
      p_advogado_id: advSel,
      p_enviado_por: profile.id,
    })
    setProcessando(false)
    if (error) { alert('Erro: ' + error.message); return }
    const r = Array.isArray(data) ? data[0] : data
    alert(`Pronto. ${r?.clientes_enviados || 0} clientes enviados pra ala de resgate.`)
    setAdvSel('')
  }

  const motivosDisp = destino === 'resgate' ? MOTIVOS_RESGATE : MOTIVOS_REPOSICAO

  return (
    <div>
      <div style={s.title}>🛟 Resgate — vendedor</div>
      <div style={s.subtitle}>Mande clientes pra ala, trate advogados inadimplentes e acompanhe a recuperação.</div>

      <div style={s.tabs}>
        <button style={{ ...s.tab, ...(aba === 'enviar' ? s.tabActive : {}) }} onClick={() => setAba('enviar')}>Mandar pra ala</button>
        <button style={{ ...s.tab, ...(aba === 'inadimplentes' ? s.tabActive : {}) }} onClick={() => setAba('inadimplentes')}>Advogado inadimplente</button>
        <button style={{ ...s.tab, ...(aba === 'acompanhar' ? s.tabActive : {}) }} onClick={() => setAba('acompanhar')}>Acompanhar</button>
      </div>

      {aba === 'enviar' && (
        <div style={s.card}>
          <label style={s.label}>Buscar cliente (nome ou CPF)</label>
          <input style={s.input} value={busca} onChange={e => { setBusca(e.target.value); setClienteSel(null) }} placeholder="Digite ao menos 3 letras…" />

          {!clienteSel && clientes.map(c => (
            <div key={c.id} onClick={() => setClienteSel(c)} style={{ padding: '8px 10px', borderRadius: 8, cursor: 'pointer', border: '0.5px solid rgba(0,0,0,0.08)', marginBottom: 6 }}>
              <div style={s.nome}>{c.nome}</div>
              <div style={s.meta}>{c.cpf} · {c.advogados?.nome_completo || 'sem advogado'} · {c.status}</div>
            </div>
          ))}

          {clienteSel && (
            <>
              <div style={{ background: '#FBFAF7', borderRadius: 8, padding: '10px 12px', marginBottom: 12, border: '0.5px solid rgba(0,0,0,0.07)' }}>
                <div style={s.nome}>{clienteSel.nome}</div>
                <div style={s.meta}>{clienteSel.cpf} · advogado: {clienteSel.advogados?.nome_completo || '—'}</div>
              </div>

              <label style={s.label}>Destino</label>
              <select style={s.input} value={destino} onChange={e => { setDestino(e.target.value); setMotivo('') }}>
                <option value="resgate">Resgate (tentar recuperar)</option>
                <option value="reposicao">Reposição direto (não cabe resgate)</option>
              </select>

              <label style={s.label}>Motivo</label>
              <select style={s.input} value={motivo} onChange={e => setMotivo(e.target.value)}>
                <option value="">Selecione…</option>
                {motivosDisp.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                <option value="outro">Outro motivo (escrever)</option>
              </select>

              {motivo === 'outro' && (
                <>
                  <label style={s.label}>Descreva o motivo</label>
                  <input style={s.input} value={motivoLivre} onChange={e => setMotivoLivre(e.target.value)} placeholder="Motivo livre…" />
                </>
              )}

              <button style={s.btnPrim} disabled={enviando} onClick={enviarCliente}>{enviando ? 'Enviando…' : 'Enviar pra ala'}</button>
            </>
          )}
        </div>
      )}

      {aba === 'inadimplentes' && (
        <div style={s.card}>
          <div style={{ background: '#F4F8FC', border: '0.5px solid #185FA530', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#185FA5', marginBottom: 12 }}>
            ℹ️ Manda os clientes vivos do advogado pra ala de resgate. Ninguém é cancelado — eles seguem vivos e a ala realoca cada um. A inadimplência abate só quando o cliente assina com o novo advogado.
          </div>
          <label style={s.label}>Advogado inadimplente</label>
          <select style={s.input} value={advSel} onChange={e => setAdvSel(e.target.value)}>
            <option value="">Selecione o advogado…</option>
            {advogados.map(a => <option key={a.id} value={a.id}>{a.nome_completo}</option>)}
          </select>
          <button style={s.btnPrim} disabled={processando || !advSel} onClick={processarInadimplente}>
            {processando ? 'Processando…' : 'Mandar clientes vivos pra ala'}
          </button>
        </div>
      )}

      {aba === 'acompanhar' && (
        loadingAcomp ? <div style={s.loading}>Carregando…</div> :
        meusResgates.length === 0 ? <div style={s.empty}>Nenhum cliente seu na ala de resgate.</div> :
        meusResgates.map(r => {
          const st = STATUS_STYLE[r.status] || STATUS_STYLE.em_andamento
          return (
            <div key={r.id} style={s.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div style={s.nome}>{r.cliente?.nome || '—'}</div>
                  <div style={s.meta}>advogado: {r.advogado_origem?.nome_completo || '—'} · {r.destino === 'resgate' ? 'resgate' : 'reposição'}</div>
                  <div style={s.meta}>motivo: {MOTIVO_LABEL[r.motivo] || r.motivo} · {new Date(r.created_at).toLocaleDateString('pt-BR')}{r.resgatador?.nome ? ` · tratando: ${r.resgatador.nome}` : ''}</div>
                </div>
                <span style={{ ...s.status, background: st.background, color: st.color }}>{st.label}</span>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
