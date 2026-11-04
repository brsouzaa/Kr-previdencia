import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { cores } from '../lib/tema'
import {
  Chip, hexA, estiloBotao as btn, estiloCard as card, fmtCpf, fmtTel, fmtData, fmtDataHora,
  useIsMobile, useToast, copiarTexto, abrirArquivo, enviarArquivo, BUCKET,
} from './ProtocoloFicha'

// ===== ABA PREVSEMPRE DA MAITHE (04/11/2026, Bruno) =====
// Todo caso do Acompanhamento que chega na etapa PrevSempre (cliente recebe pelo Mercantil) aparece aqui.
//  1) NOVOS: Maithe clica em Iniciar, copia o aviso e manda no grupo -> "Mandei no grupo"
//  2) AGUARDANDO A CLIENTE: Confirmar (print do Mercantil obrigatorio), Reenviar link ou Invalidar
// Confirmar/Invalidar seguem o mesmo fluxo do "Confirmar PrevSempre" do Acompanhamento (que continua existindo).
// Banco: posdef_prev_lista / posdef_prev_acao (acesso: app_config posdef_prevsempre_ids + admin).

const AZUL = '#1d4ed8'
const HORAS_ALERTA = 24
const horasDesde = (v) => (v ? (Date.now() - new Date(v).getTime()) / 3600000 : null)
const txtTempo = (h) => {
  if (h == null) return '—'
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`
  if (h < 48) return `${Math.floor(h)}h${String(Math.round((h % 1) * 60)).padStart(2, '0')}`
  return `${Math.floor(h / 24)} dias`
}
const reais = (v) => (v == null || v === '' ? null : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const nomesResp = (c) => (Array.isArray(c.responsaveis) && c.responsaveis.length ? c.responsaveis.join(' / ') : (c.vendedora_nome || 'responsável'))

export const mensagemGrupo = (c) =>
  `📣 Avisar a cliente *${c.nome}*, ${nomesResp(c)}, que em alguns minutos ela receberá um link do *Banco Mercantil* para abertura de conta e desconto dos honorários.` +
  `\nCPF: ${fmtCpf(c.cpf)}${c.telefone ? ` · Tel: ${fmtTel(c.telefone)}` : ''}`

const MOTIVOS_INVALIDAR = [
  { v: 'nao_abriu', rot: 'Cliente não abriu a conta' },
  { v: 'nao_autorizou', rot: 'Abriu a conta, mas não autorizou o desconto dos honorários' },
  { v: 'outro', rot: 'Outro motivo' },
]

function Janela({ titulo, sub, cor = AZUL, onClose, children, rodape }) {
  const isMobile = useIsMobile()
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', backdropFilter: 'blur(3px)', zIndex: 2000, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...card, width: '100%', maxWidth: 560, maxHeight: isMobile ? '92vh' : '88vh', overflow: 'auto', borderRadius: isMobile ? '20px 20px 0 0' : 20, padding: 0 }}>
        <div style={{ padding: '18px 20px 14px', borderBottom: `1px solid ${cores.cardBorda}`, display: 'flex', gap: 12, alignItems: 'center', background: `linear-gradient(135deg, ${hexA(cor, 0.10)}, transparent)` }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 16.5, fontWeight: 800, color: cores.texto }}>{titulo}</div>
            {sub && <div style={{ fontSize: 12.5, color: cores.suave }}>{sub}</div>}
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: cores.suave }}>✕</button>
        </div>
        <div style={{ padding: 20, display: 'grid', gap: 14 }}>{children}</div>
        {rodape && <div style={{ padding: '14px 20px 20px', display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap', borderTop: `1px solid ${cores.cardBorda}`, position: 'sticky', bottom: 0, background: '#fff' }}>{rodape}</div>}
      </div>
    </div>
  )
}

function CampoArquivo({ arquivo, setArquivo, obrig, rot }) {
  const ref = useRef(null)
  const [arr, setArr] = useState(false)
  const pegar = useCallback((f) => { if (f && (/^image\//.test(f.type) || f.type === 'application/pdf')) setArquivo(f) }, [setArquivo])
  useEffect(() => {
    const h = (e) => { const it = [...(e.clipboardData?.items || [])].find(x => x.kind === 'file'); if (it) pegar(it.getAsFile()) }
    window.addEventListener('paste', h)
    return () => window.removeEventListener('paste', h)
  }, [pegar])
  return (
    <div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: cores.suave, margin: '0 0 5px' }}>{rot}{obrig && <span style={{ color: cores.perigo }}> *</span>}</div>
      <div onClick={() => ref.current?.click()} onDragOver={e => { e.preventDefault(); setArr(true) }} onDragLeave={() => setArr(false)}
        onDrop={e => { e.preventDefault(); setArr(false); pegar(e.dataTransfer.files?.[0]) }}
        style={{ border: `2px dashed ${arr ? AZUL : hexA('#0f172a', 0.18)}`, borderRadius: 14, padding: 14, background: arr ? hexA(AZUL, 0.06) : '#fafbfd', cursor: 'pointer', textAlign: 'center', color: cores.suave, fontSize: 13 }}>
        {arquivo ? <b style={{ color: cores.texto }}>📎 {String(arquivo.name || 'print colado').slice(0, 40)} <span style={{ fontWeight: 500, color: cores.suave }}>({Math.max(1, Math.round((arquivo.size || 0) / 1024))} KB) · trocar</span></b>
          : <><b style={{ color: cores.texto }}>Arraste aqui, clique para escolher</b> ou cole o print com <b>Ctrl+V</b> · imagem ou PDF</>}
        <input ref={ref} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => pegar(e.target.files?.[0])} />
      </div>
    </div>
  )
}

// 04/11 (Bruno): RG abre DENTRO do KR (sem nova aba). Girar e zoom porque foto de RG costuma vir torta.
function VerDocumento({ docs, inicio = 0, titulo, onClose }) {
  const [i, setI] = useState(inicio)
  const [url, setUrl] = useState(null)
  const [erro, setErro] = useState('')
  const [giro, setGiro] = useState(0)
  const [zoom, setZoom] = useState(1)
  const d = docs[i] || {}
  const ehPdf = /\.pdf($|\?)/i.test(String(d.url || ''))
  useEffect(() => {
    let vivo = true
    setUrl(null); setErro(''); setGiro(0); setZoom(1)
    const c = String(d.url || '')
    if (!c) { setErro('Sem arquivo'); return }
    if (/^https?:\/\//i.test(c)) { setUrl(c); return }
    supabase.storage.from(BUCKET).createSignedUrl(c, 900).then(({ data, error }) => {
      if (!vivo) return
      if (error || !data?.signedUrl) setErro('Não consegui abrir: ' + (error?.message || 'sem link')); else setUrl(data.signedUrl)
    })
    return () => { vivo = false }
  }, [d.url])
  useEffect(() => {
    const k = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setI(x => Math.min(docs.length - 1, x + 1))
      if (e.key === 'ArrowLeft') setI(x => Math.max(0, x - 1))
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [docs.length, onClose])
  const bt = { border: '1px solid rgba(255,255,255,.25)', background: 'rgba(255,255,255,.08)', color: '#fff', borderRadius: 10, padding: '7px 11px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700 }
  const deitado = giro % 180 !== 0
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 2500, background: 'rgba(2,6,23,.92)', display: 'flex', flexDirection: 'column' }}>
      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '12px 16px', color: '#fff' }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginRight: 8 }}>{titulo}</div>
        {docs.map((x, k) => (
          <button key={k} onClick={() => setI(k)} style={{ ...bt, background: k === i ? '#fff' : bt.background, color: k === i ? '#0f172a' : '#fff' }}>🪪 {x.rotulo || 'RG'}</button>
        ))}
        <div style={{ flex: 1 }} />
        {!ehPdf && <>
          <button onClick={() => setGiro(g => (g + 270) % 360)} style={bt} title="Girar para a esquerda">⟲</button>
          <button onClick={() => setGiro(g => (g + 90) % 360)} style={bt} title="Girar para a direita">⟳</button>
          <button onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))} style={bt}>−</button>
          <button onClick={() => setZoom(1)} style={bt}>{Math.round(zoom * 100)}%</button>
          <button onClick={() => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))} style={bt}>+</button>
        </>}
        <button onClick={onClose} style={{ ...bt, background: '#fff', color: '#0f172a' }}>✕ Fechar</button>
      </div>
      <div onClick={e => e.stopPropagation()} style={{ flex: 1, overflow: 'auto', display: 'grid', placeItems: zoom > 1 ? 'start center' : 'center', padding: 16 }}>
        {erro ? <div style={{ color: '#fecaca', fontWeight: 700 }}>{erro}</div>
          : !url ? <div style={{ color: '#cbd5e1' }}>carregando…</div>
          : ehPdf ? <iframe title={d.rotulo || 'documento'} src={url} style={{ width: 'min(1000px, 100%)', height: '100%', minHeight: '70vh', border: 'none', background: '#fff', borderRadius: 8 }} />
          : <img src={url} alt={d.rotulo || 'RG'} onError={() => setErro('Não consegui carregar a imagem')}
              style={{ maxWidth: deitado ? '80vh' : `${100 * zoom}%`, maxHeight: deitado ? `${90 * zoom}vw` : `${80 * zoom}vh`, transform: `rotate(${giro}deg) scale(${deitado ? zoom : 1})`, transition: 'transform .15s', borderRadius: 6, boxShadow: '0 12px 40px rgba(0,0,0,.5)' }} />}
      </div>
    </div>
  )
}

export default function PrevSempreMaithe() {
  const isMobile = useIsMobile()
  const [toast, mostrar] = useToast()
  const [casos, setCasos] = useState(null)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [janela, setJanela] = useState(null)   // { tipo: 'iniciar'|'confirmar'|'invalidar'|'reenviar', c }
  const [arquivo, setArquivo] = useState(null)
  const [texto, setTexto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [copiou, setCopiou] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [, setTick] = useState(0)
  const [dnEdit, setDnEdit] = useState({})   // 04/11: { [id]: 'AAAA-MM-DD' } enquanto a Maithe digita a data de nascimento
  const [dnSalvando, setDnSalvando] = useState(null)
  const [verRg, setVerRg] = useState(null)   // { c, i }
  const [finalizados, setFinalizados] = useState([])   // 04/11 (Bruno): coluna Finalizados (30 dias)
  const [obsEdit, setObsEdit] = useState({})   // 04/11 (Bruno): observacao rapida no card { [id]: texto }
  const [obsSalvando, setObsSalvando] = useState(null)
  const [tab, setTab] = useState('novos')   // 04/11: novos | pendentes | finalizados
  const [aberto, setAberto] = useState(null)   // linha expandida

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('posdef_prev_lista')
    if (error || !data?.ok) { setErro(error?.message || data?.erro || 'Não consegui carregar'); setCasos([]); return }
    setErro(''); setCasos(Array.isArray(data.casos) ? data.casos : []); setFinalizados(Array.isArray(data.finalizados) ? data.finalizados : [])
  }, [])
  useEffect(() => { carregar(); const i = setInterval(carregar, 60000); const t = setInterval(() => setTick(x => x + 1), 30000); return () => { clearInterval(i); clearInterval(t) } }, [carregar])

  const abrir = (tipo, c) => { setJanela({ tipo, c }); setArquivo(null); setTexto(''); setMotivo(''); setCopiou(false); setSalvando(false) }
  const fechar = () => { if (!salvando) setJanela(null) }

  async function agir(acao, c, p = {}) {
    setSalvando(true)
    try {
      const extra = { ...p }
      if (arquivo) extra.anexo = await enviarArquivo(arquivo, c.cpf)
      const { data, error } = await supabase.rpc('posdef_prev_acao', { p_id: c.id, p_acao: acao, p: extra })
      if (error) throw new Error(error.message)
      if (!data?.ok) throw new Error(data?.erro || 'não salvou')
      mostrar({ iniciar: 'Registrado — a cliente foi para Cadastrada · falta assinar', reenviar: 'Voltou para Novos — inicie de novo', confirmar: 'Finalizado — o caso seguiu no Acompanhamento', invalidar: 'Invalidado — segue sem desconto automático' }[acao] || 'Feito')
      setJanela(null); carregar()
    } catch (e) { mostrar(String(e.message || e), 'erro'); setSalvando(false) }
  }

  // 04/11 (Bruno): data de nascimento da cliente — nao existe no cadastro; a Maithe digita lendo o RG
  async function salvarDn(c) {
    const v = dnEdit[c.id]
    if (!v) { mostrar('Informe a data de nascimento', 'erro'); return }
    setDnSalvando(c.id)
    const { data, error } = await supabase.rpc('posdef_prev_acao', { p_id: c.id, p_acao: 'nascimento', p: { data: v } })
    setDnSalvando(null)
    if (error || !data?.ok) { mostrar(error?.message || data?.erro || 'Não salvou', 'erro'); return }
    setDnEdit(o => { const n = { ...o }; delete n[c.id]; return n })
    mostrar('Data de nascimento salva'); carregar()
  }
  const idade = (dn) => { if (!dn) return null; const d = new Date(String(dn).slice(0, 10) + 'T12:00:00'), h = new Date(); let a = h.getFullYear() - d.getFullYear(); if (h.getMonth() < d.getMonth() || (h.getMonth() === d.getMonth() && h.getDate() < d.getDate())) a--; return a }
  const campoDn = (c) => {
    const editando = dnEdit[c.id] !== undefined
    if (!c.cliente_dn && !editando) return (
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: cores.suave }}>Nascimento</div>
        <div style={{ fontSize: 13, color: cores.suave }}>— <button onClick={() => setDnEdit(o => ({ ...o, [c.id]: '' }))} style={{ border: 'none', background: 'none', color: AZUL, cursor: 'pointer', fontSize: 12, padding: 0, fontWeight: 700 }}>anotar</button></div>
      </div>
    )
    if (c.cliente_dn && !editando) return (
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: cores.suave }}>Nascimento</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: cores.texto }}>{fmtData(c.cliente_dn)} <span style={{ color: cores.suave, fontWeight: 500 }}>({idade(c.cliente_dn)} anos)</span>{' '}
          <button onClick={() => setDnEdit(o => ({ ...o, [c.id]: String(c.cliente_dn).slice(0, 10) }))} style={{ border: 'none', background: 'none', color: AZUL, cursor: 'pointer', fontSize: 12, padding: 0, fontWeight: 700 }}>editar</button></div>
      </div>
    )
    return (
      <div style={{ minWidth: 0, gridColumn: 'span 2' }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: cores.suave }}>Nascimento (opcional · está no RG)</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3, flexWrap: 'wrap' }}>
          <input type="date" value={dnEdit[c.id] || ''} onChange={e => setDnEdit(o => ({ ...o, [c.id]: e.target.value }))} style={{ padding: '5px 8px', borderRadius: 8, border: `1px solid ${hexA('#0f172a', 0.18)}`, fontSize: 13, fontFamily: 'inherit' }} />
          <button disabled={dnSalvando === c.id} onClick={() => salvarDn(c)} style={{ ...btn(AZUL), padding: '5px 10px', fontSize: 12 }}>{dnSalvando === c.id ? 'Salvando…' : 'Salvar'}</button>
          {editando && <button onClick={() => setDnEdit(o => { const n = { ...o }; delete n[c.id]; return n })} style={{ ...btn('#475569', false), padding: '5px 10px', fontSize: 12 }}>Cancelar</button>}
        </div>
      </div>
    )
  }

  async function salvarObs(c, apagar) {
    const v = apagar ? '' : String(obsEdit[c.id] ?? '').trim()
    setObsSalvando(c.id)
    const { data, error } = await supabase.rpc('posdef_prev_acao', { p_id: c.id, p_acao: 'obs', p: { texto: v || null } })
    setObsSalvando(null)
    if (error || !data?.ok) { mostrar(error?.message || data?.erro || 'Não salvou', 'erro'); return }
    setObsEdit(o => { const n = { ...o }; delete n[c.id]; return n })
    mostrar(v ? 'Observação salva' : 'Observação apagada'); carregar()
  }
  const blocoObs = (c) => {
    const editando = obsEdit[c.id] !== undefined
    if (editando) return (
      <div style={{ display: 'grid', gap: 6 }}>
        <textarea autoFocus value={obsEdit[c.id]} maxLength={300} onChange={e => setObsEdit(o => ({ ...o, [c.id]: e.target.value }))} rows={2} placeholder="Ex.: cliente pediu para ligar às 15h · aguardando ela achar o RG"
          style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: `1px solid ${hexA('#0f172a', 0.18)}`, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button disabled={obsSalvando === c.id} onClick={() => salvarObs(c)} style={{ ...btn('#a16207'), padding: '5px 12px', fontSize: 12 }}>{obsSalvando === c.id ? 'Salvando…' : 'Salvar'}</button>
          <button onClick={() => setObsEdit(o => { const n = { ...o }; delete n[c.id]; return n })} style={{ ...btn('#475569', false), padding: '5px 12px', fontSize: 12 }}>Cancelar</button>
          {c.obs && <button disabled={obsSalvando === c.id} onClick={() => salvarObs(c, true)} style={{ ...btn(cores.perigo, false), padding: '5px 12px', fontSize: 12 }}>Apagar</button>}
        </div>
      </div>
    )
    if (!c.obs) return null
    return (
      <div style={{ fontSize: 13, background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 11px', color: '#713f12', whiteSpace: 'pre-wrap' }}>
        📝 {c.obs}{c.obs_em && <span style={{ color: '#a16207', fontSize: 11.5 }}> · {fmtDataHora(c.obs_em)}</span>}{' '}
        <button onClick={() => setObsEdit(o => ({ ...o, [c.id]: c.obs }))} style={{ border: 'none', background: 'none', color: '#a16207', cursor: 'pointer', fontSize: 12, padding: 0, fontWeight: 700 }}>editar</button>
      </div>
    )
  }

  const q = busca.trim().toLowerCase()
  const qd = q.replace(/\D/g, '')
  const lista = (casos || []).filter(c => !q || String(c.nome || '').toLowerCase().includes(q) || String(c.vendedora_nome || '').toLowerCase().includes(q)
    || (qd.length >= 3 && (String(c.cpf || '').includes(qd) || String(c.telefone || '').replace(/\D/g, '').includes(qd))))
  const novos = lista.filter(c => !c.iniciado_em)
  const aguardando = lista.filter(c => c.iniciado_em).sort((a, b) => new Date(a.iniciado_em) - new Date(b.iniciado_em))

  const doc = (c, tipo) => (c.documentos || []).find(d => d.tipo === tipo)?.arquivo_url
  // 04/11 (Bruno): layout MINIMALISTA — uma lista por vez (abas), cada cliente em 1 linha;
  // o detalhe (dados, documentos, acoes secundarias) so abre ao clicar na linha. Mais leve e menos poluido.
  const linkDoc = { border: 'none', background: 'none', padding: '2px 0', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, color: AZUL }
  const ghost = (cor) => ({ border: `1px solid ${hexA(cor, 0.35)}`, background: '#fff', color: cor, borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700 })
  const miniInfo = (rot, val) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: cores.suave }}>{rot}</div>
      <div style={{ fontSize: 13, color: cores.texto, overflowWrap: 'anywhere' }}>{val || '—'}</div>
    </div>
  )
  const linha = (c) => {
    const h = c.iniciado_em ? horasDesde(c.iniciado_em) : horasDesde(c.etapa_desde)
    const atrasado = !!c.iniciado_em && h > HORAS_ALERTA
    const ab = aberto === c.id
    const contrato = doc(c, 'contrato'), procuracao = doc(c, 'procuracao')
    return (
      <div key={c.id} style={{ borderTop: `1px solid ${cores.cardBorda}`, background: ab ? '#f8fafc' : '#fff' }}>
        <div onClick={() => setAberto(ab ? null : c.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', cursor: 'pointer', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: atrasado ? cores.perigo : c.iniciado_em ? '#0d9488' : AZUL }} />
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: cores.texto, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</div>
            <div style={{ fontSize: 12, color: cores.suave, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fmtCpf(c.cpf)} · {nomesResp(c)}{c.obs ? <span style={{ color: '#a16207' }}> · 📝 {c.obs}</span> : null}
            </div>
          </div>
          {c.tentativas > 1 && <Chip cor="#b45309">{c.tentativas}ª tentativa</Chip>}
          <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', color: atrasado ? cores.perigo : cores.suave }}>{txtTempo(h)}{atrasado ? ' · cobrar' : ''}</span>
          {!c.iniciado_em
            ? <button onClick={(e) => { e.stopPropagation(); abrir('iniciar', c) }} style={{ ...btn(AZUL), padding: '6px 12px', fontSize: 12.5, whiteSpace: 'nowrap' }}>▶️ Iniciar cadastro</button>
            : <button onClick={(e) => { e.stopPropagation(); abrir('confirmar', c) }} style={{ ...btn(cores.ok), padding: '6px 12px', fontSize: 12.5, whiteSpace: 'nowrap' }}>✅ Finalizado</button>}
          <span style={{ color: cores.suave, fontSize: 12, width: 12, textAlign: 'center' }}>{ab ? '▾' : '▸'}</span>
        </div>
        {ab && (
          <div style={{ padding: '2px 14px 14px 34px', display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px 14px' }}>
              {miniInfo('Telefone', fmtTel(c.telefone))}
              {campoDn(c)}
              {miniInfo('Venda', c.vendedora_nome)}
              {miniInfo('NB', c.nb)}
              {miniInfo('Deferido em', c.data_deferimento ? fmtData(c.data_deferimento) : null)}
              {miniInfo('Benefício', reais(c.valor_beneficio))}
              {miniInfo('Cliente avisada', c.cliente_avisada_em ? `${fmtDataHora(c.cliente_avisada_em)}${c.cliente_avisada_por ? ' · ' + c.cliente_avisada_por : ''}` : null)}
              {c.iniciado_em && miniInfo('Cadastro iniciado', `${fmtDataHora(c.iniciado_em)}${c.iniciado_por ? ' · ' + c.iniciado_por : ''}`)}
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: cores.suave }}>Documentos</span>
              {contrato && <button onClick={() => abrirArquivo(contrato)} style={linkDoc}>Contrato</button>}
              {procuracao && <button onClick={() => abrirArquivo(procuracao)} style={linkDoc}>Procuração</button>}
              {c.carta_concessao_url && <button onClick={() => abrirArquivo(c.carta_concessao_url)} style={linkDoc}>Carta de concessão</button>}
              {(Array.isArray(c.rgs) ? c.rgs : []).map((g, i) => <button key={'rg' + i} onClick={() => setVerRg({ c, i })} style={linkDoc}>{g.rotulo || 'RG'}</button>)}
            </div>
            {blocoObs(c)}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {obsEdit[c.id] === undefined && !c.obs && <button onClick={() => setObsEdit(o => ({ ...o, [c.id]: '' }))} style={ghost('#a16207')}>📝 Anotar</button>}
              {c.iniciado_em && <button onClick={() => abrir('reenviar', c)} style={ghost('#7c3aed')}>🔁 Reenviar link</button>}
              {c.iniciado_em && <button onClick={() => abrir('invalidar', c)} style={ghost(cores.perigo)}>⛔ Invalidar</button>}
            </div>
          </div>
        )}
      </div>
    )
  }

  const MOT_INV = { nao_abriu: 'não abriu a conta', nao_autorizou: 'não autorizou o desconto', outro: 'outro motivo' }
  const ETAPA_TXT = { extrato: 'Extrato de pagamento', aguardando_pagamento: 'Aguardando pagamento', pago: 'Pago', baixado: 'Baixado', cancelado: 'Cancelado' }
  const linhaFinal = (c) => {
    const ok = c.honorario_auto === true
    const ab = aberto === 'f' + c.id
    return (
      <div key={'f' + c.id} style={{ borderTop: `1px solid ${cores.cardBorda}`, background: ab ? '#f8fafc' : '#fff' }}>
        <div onClick={() => setAberto(ab ? null : 'f' + c.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', cursor: 'pointer', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: ok ? cores.ok : cores.perigo }} />
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: cores.texto, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</div>
            <div style={{ fontSize: 12, color: cores.suave }}>{fmtCpf(c.cpf)}{c.finalizado_por ? ` · ${c.finalizado_por}` : ''}</div>
          </div>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: ok ? cores.ok : cores.perigo, whiteSpace: 'nowrap' }}>{ok ? 'Desconto autorizado' : `Sem desconto${c.invalido ? ' · ' + (MOT_INV[c.invalido] || c.invalido) : ''}`}</span>
          <span style={{ fontSize: 12, color: cores.suave, whiteSpace: 'nowrap' }}>{c.finalizado_em ? fmtDataHora(c.finalizado_em) : ''}</span>
          <span style={{ color: cores.suave, fontSize: 12, width: 12, textAlign: 'center' }}>{ab ? '▾' : '▸'}</span>
        </div>
        {ab && (
          <div style={{ padding: '2px 14px 14px 34px', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
            <span style={{ color: cores.suave }}>No Acompanhamento: <b style={{ color: cores.texto }}>{ETAPA_TXT[c.etapa] || c.etapa}</b></span>
            {c.print_url && <button onClick={() => abrirArquivo(c.print_url)} style={linkDoc}>Print do Mercantil</button>}
            {c.obs && <span style={{ color: '#713f12' }}>📝 {c.obs}</span>}
          </div>
        )}
      </div>
    )
  }

  const j = janela
  const st = { width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${hexA('#0f172a', 0.14)}`, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' }
  const finF = finalizados.filter(c => !q || String(c.nome || '').toLowerCase().includes(q) || (qd.length >= 3 && String(c.cpf || '').includes(qd)))
  const nAtras = aguardando.filter(c => horasDesde(c.iniciado_em) > HORAS_ALERTA).length
  const ABAS_PS = [
    ['novos', 'Novos', novos.length, AZUL],
    ['pendentes', 'Falta assinar', aguardando.length, '#0d9488'],
    ['finalizados', 'Finalizados', finF.length, cores.ok],
  ]
  const itens = tab === 'novos' ? novos : tab === 'pendentes' ? aguardando : finF
  const dica = tab === 'novos' ? 'Clique em Iniciar cadastro: a mensagem do grupo aparece pronta.'
    : tab === 'pendentes' ? `Cadastro feito, falta a cliente assinar no Mercantil. Vermelho depois de ${HORAS_ALERTA}h.`
    : 'Finalizados nos últimos 30 dias — o caso já seguiu no Acompanhamento.'
  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 1100, margin: '0 auto' }}>
      {toast}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: isMobile ? 20 : 22, fontWeight: 800, color: cores.texto, flex: '1 1 160px' }}>🏦 PrevSempre</div>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome, CPF ou telefone" style={{ ...st, padding: '8px 12px', fontSize: 13.5, flex: '1 1 240px', maxWidth: 360 }} />
        <button onClick={carregar} title="Atualizar" style={{ ...btn('#475569', false), padding: '8px 11px' }}>⟳</button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: `1px solid ${cores.cardBorda}` }}>
        {ABAS_PS.map(([k, rot, n, cor]) => {
          const on = tab === k
          return (
            <button key={k} onClick={() => { setTab(k); setAberto(null) }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '9px 12px', fontSize: 14, fontWeight: on ? 800 : 600, color: on ? cores.texto : cores.suave, borderBottom: `2.5px solid ${on ? cor : 'transparent'}`, marginBottom: -1 }}>
              {rot} <span style={{ fontSize: 12, fontWeight: 800, color: cor, background: hexA(cor, 0.1), borderRadius: 999, padding: '1px 8px', marginLeft: 3 }}>{n}</span>
              {k === 'pendentes' && nAtras > 0 && <span style={{ fontSize: 11.5, fontWeight: 800, color: cores.perigo, marginLeft: 6 }}>{nAtras} &gt;24h</span>}
            </button>
          )
        })}
      </div>
      {erro && <div style={{ ...card, padding: 14, color: cores.perigo, fontWeight: 600 }}>{erro}</div>}
      {casos == null ? <div style={{ ...card, padding: 20, color: cores.suave }}>carregando…</div> : (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '9px 14px', fontSize: 12.5, color: cores.suave }}>{dica}</div>
          {itens.length === 0
            ? <div style={{ borderTop: `1px solid ${cores.cardBorda}`, padding: 22, fontSize: 13, color: cores.suave, textAlign: 'center' }}>{tab === 'novos' ? 'Nenhum caso novo. 🎉' : tab === 'pendentes' ? 'Nenhuma cliente pendente.' : 'Nenhum finalizado ainda.'}</div>
            : itens.map(tab === 'finalizados' ? linhaFinal : linha)}
        </div>
      )}

      {verRg && <VerDocumento docs={verRg.c.rgs || []} inicio={verRg.i} titulo={verRg.c.nome} onClose={() => setVerRg(null)} />}

      {j?.tipo === 'iniciar' && (
        <Janela titulo="▶️ Iniciar cadastro" sub={`${j.c.nome} · ${fmtCpf(j.c.cpf)}`} onClose={fechar}
          rodape={<>
            <button onClick={fechar} style={btn('#475569', false)}>Cancelar</button>
            <button disabled={salvando} onClick={() => agir('iniciar', j.c)} style={{ ...btn(AZUL), opacity: copiou && !salvando ? 1 : 0.6 }}>{salvando ? 'Salvando…' : '✅ Mandei no grupo'}</button>
          </>}>
          <div style={{ fontSize: 13, color: cores.texto }}>1. Copie a mensagem e mande no grupo. 2. Depois clique em <b>“Mandei no grupo”</b>.</div>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.5, background: hexA(AZUL, 0.06), border: `1px solid ${hexA(AZUL, 0.2)}`, borderRadius: 12, padding: '12px 14px', color: cores.texto }}>{mensagemGrupo(j.c)}</div>
          <button onClick={async () => { const ok = await copiarTexto(mensagemGrupo(j.c)); setCopiou(true); mostrar(ok ? 'Mensagem copiada' : 'Não consegui copiar — selecione e copie', ok ? 'ok' : 'erro') }} style={{ ...btn('#16a34a'), justifySelf: 'start' }}>⧉ {copiou ? 'Copiado' : 'Copiar mensagem'}</button>
        </Janela>
      )}

      {j?.tipo === 'confirmar' && (
        <Janela titulo="✅ Finalizado — conta aberta e desconto autorizado" sub={`${j.c.nome} · ${fmtCpf(j.c.cpf)}`} cor={cores.ok} onClose={fechar}
          rodape={<>
            <button onClick={fechar} style={btn('#475569', false)}>Cancelar</button>
            <button disabled={!arquivo || salvando} onClick={() => agir('confirmar', j.c, { texto: texto.trim() || null })} style={{ ...btn(cores.ok), opacity: arquivo && !salvando ? 1 : 0.45 }}>{salvando ? 'Salvando…' : 'Finalizar'}</button>
          </>}>
          <div style={{ fontSize: 13, color: cores.texto, background: cores.chipBg, borderRadius: 10, padding: '9px 12px' }}>A cliente abriu a conta no Mercantil e autorizou o desconto automático dos honorários. O caso segue no Acompanhamento (extrato de pagamento / aguardando pagamento) com <b>honorário automático</b>.</div>
          <CampoArquivo arquivo={arquivo} setArquivo={setArquivo} obrig rot="Print do Mercantil (conta aberta e desconto autorizado)" />
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: cores.suave, margin: '0 0 5px' }}>Observação (opcional)</div>
            <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2} style={{ ...st, resize: 'vertical' }} />
          </div>
          {!arquivo && <div style={{ fontSize: 12, color: cores.suave }}>Falta: print do Mercantil</div>}
        </Janela>
      )}

      {j?.tipo === 'reenviar' && (
        <Janela titulo="🔁 Reenviar o link" sub={`${j.c.nome} · ${fmtCpf(j.c.cpf)}`} cor="#7c3aed" onClose={fechar}
          rodape={<>
            <button onClick={fechar} style={btn('#475569', false)}>Cancelar</button>
            <button disabled={salvando} onClick={() => agir('reenviar', j.c, { texto: texto.trim() || null })} style={btn('#7c3aed')}>{salvando ? 'Salvando…' : 'Voltar para Novos'}</button>
          </>}>
          <div style={{ fontSize: 13, color: cores.texto }}>O link expirou ou a cliente não recebeu? O caso volta para <b>Novos</b> e você inicia de novo (a mensagem do grupo aparece outra vez).</div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: cores.suave, margin: '0 0 5px' }}>O que aconteceu? (opcional)</div>
            <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2} style={{ ...st, resize: 'vertical' }} />
          </div>
        </Janela>
      )}

      {j?.tipo === 'invalidar' && (
        <Janela titulo="⛔ Invalidar PrevSempre" sub={`${j.c.nome} · ${fmtCpf(j.c.cpf)}`} cor={cores.perigo} onClose={fechar}
          rodape={<>
            <button onClick={fechar} style={btn('#475569', false)}>Cancelar</button>
            <button disabled={!motivo || (motivo === 'outro' && !texto.trim()) || salvando} onClick={() => agir('invalidar', j.c, { motivo, texto: texto.trim() || null })}
              style={{ ...btn(cores.perigo), opacity: motivo && !(motivo === 'outro' && !texto.trim()) && !salvando ? 1 : 0.45 }}>{salvando ? 'Salvando…' : 'Invalidar'}</button>
          </>}>
          <div style={{ fontSize: 13, color: cores.texto, background: hexA(cores.perigo, 0.06), borderRadius: 10, padding: '9px 12px' }}>O caso segue no Acompanhamento <b>SEM desconto automático</b>: o time vai cobrar o honorário direto da cliente.</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {MOTIVOS_INVALIDAR.map(m => (
              <label key={m.v} style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', fontSize: 14, border: `1.5px solid ${motivo === m.v ? cores.perigo : cores.cardBorda}`, borderRadius: 12, padding: '10px 12px', background: motivo === m.v ? hexA(cores.perigo, 0.05) : '#fff' }}>
                <input type="radio" name="motivo" checked={motivo === m.v} onChange={() => setMotivo(m.v)} /> {m.rot}
              </label>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: cores.suave, margin: '0 0 5px' }}>{motivo === 'outro' ? 'Explique' : 'Observação (opcional)'}{motivo === 'outro' && <span style={{ color: cores.perigo }}> *</span>}</div>
            <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2} style={{ ...st, resize: 'vertical' }} />
          </div>
          <CampoArquivo arquivo={arquivo} setArquivo={setArquivo} rot="Print (opcional)" />
        </Janela>
      )}
    </div>
  )
}
