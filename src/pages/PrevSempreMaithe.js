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

function Info({ rot, val }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: cores.suave }}>{rot}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: cores.texto, overflowWrap: 'anywhere' }}>{val || '—'}</div>
    </div>
  )
}

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

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('posdef_prev_lista')
    if (error || !data?.ok) { setErro(error?.message || data?.erro || 'Não consegui carregar'); setCasos([]); return }
    setErro(''); setCasos(Array.isArray(data.casos) ? data.casos : [])
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
      mostrar({ iniciar: 'Registrado — agora acompanhe pela PrevSempre', reenviar: 'Voltou para Novos — inicie de novo', confirmar: 'Confirmado — o caso seguiu no Acompanhamento', invalidar: 'Invalidado — segue sem desconto automático' }[acao] || 'Feito')
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
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: cores.suave }}>Nascimento da cliente</div>
        <div style={{ fontSize: 13, color: cores.suave }}>— <button onClick={() => setDnEdit(o => ({ ...o, [c.id]: '' }))} style={{ border: 'none', background: 'none', color: AZUL, cursor: 'pointer', fontSize: 12, padding: 0, fontWeight: 700 }}>anotar</button></div>
      </div>
    )
    if (c.cliente_dn && !editando) return (
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: cores.suave }}>Nascimento da cliente</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: cores.texto }}>{fmtData(c.cliente_dn)} <span style={{ color: cores.suave, fontWeight: 500 }}>({idade(c.cliente_dn)} anos)</span>{' '}
          <button onClick={() => setDnEdit(o => ({ ...o, [c.id]: String(c.cliente_dn).slice(0, 10) }))} style={{ border: 'none', background: 'none', color: AZUL, cursor: 'pointer', fontSize: 12, padding: 0, fontWeight: 700 }}>editar</button></div>
      </div>
    )
    return (
      <div style={{ minWidth: 0, gridColumn: 'span 2' }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: cores.suave }}>Nascimento da cliente (opcional · está no RG)</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3, flexWrap: 'wrap' }}>
          <input type="date" value={dnEdit[c.id] || ''} onChange={e => setDnEdit(o => ({ ...o, [c.id]: e.target.value }))} style={{ padding: '5px 8px', borderRadius: 8, border: `1px solid ${hexA('#0f172a', 0.18)}`, fontSize: 13, fontFamily: 'inherit' }} />
          <button disabled={dnSalvando === c.id} onClick={() => salvarDn(c)} style={{ ...btn(AZUL), padding: '5px 10px', fontSize: 12 }}>{dnSalvando === c.id ? 'Salvando…' : 'Salvar'}</button>
          {editando && <button onClick={() => setDnEdit(o => { const n = { ...o }; delete n[c.id]; return n })} style={{ ...btn('#475569', false), padding: '5px 10px', fontSize: 12 }}>Cancelar</button>}
        </div>
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
  const cartao = (c) => {
    const h = c.iniciado_em ? horasDesde(c.iniciado_em) : horasDesde(c.etapa_desde)
    const atrasado = !!c.iniciado_em && h > HORAS_ALERTA
    const contrato = doc(c, 'contrato'), procuracao = doc(c, 'procuracao')
    return (
      <div key={c.id} style={{ ...card, padding: 0, overflow: 'hidden', border: `1.5px solid ${atrasado ? hexA(cores.perigo, 0.55) : hexA(AZUL, 0.25)}`, background: atrasado ? '#fff5f5' : '#fff' }}>
        <div style={{ padding: '11px 14px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', background: hexA(atrasado ? cores.perigo : AZUL, 0.06) }}>
          <span style={{ fontSize: 14.5, fontWeight: 800, color: cores.texto }}>{c.nome}</span>
          <span style={{ fontSize: 12, color: cores.suave }}>{fmtCpf(c.cpf)}</span>
          {c.tentativas > 1 && <Chip cor="#b45309">{c.tentativas}ª tentativa</Chip>}
          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: atrasado ? cores.perigo : cores.suave }}>
            {c.iniciado_em ? `aguardando há ${txtTempo(h)}${atrasado ? ' — cobrar' : ''}` : `na PrevSempre há ${txtTempo(h)}`}
          </span>
        </div>
        <div style={{ padding: 14, display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
            <Info rot="Telefone" val={fmtTel(c.telefone)} />
            {campoDn(c)}
            <Info rot="Responsável" val={nomesResp(c)} />
            <Info rot="Venda" val={c.vendedora_nome} />
            <Info rot="NB" val={c.nb} />
            <Info rot="Deferido em" val={c.data_deferimento ? fmtData(c.data_deferimento) : null} />
            <Info rot="Benefício" val={reais(c.valor_beneficio)} />
            <Info rot="Cliente avisada" val={c.cliente_avisada_em ? `${fmtDataHora(c.cliente_avisada_em)}${c.cliente_avisada_por ? ' · ' + c.cliente_avisada_por : ''}` : null} />
            {c.iniciado_em && <Info rot="Aviso no grupo" val={`${fmtDataHora(c.iniciado_em)}${c.iniciado_por ? ' · ' + c.iniciado_por : ''}`} />}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button disabled={!contrato} onClick={() => abrirArquivo(contrato)} style={{ ...btn('#475569', false), padding: '6px 11px', fontSize: 12, opacity: contrato ? 1 : 0.45 }}>📄 Contrato</button>
            <button disabled={!procuracao} onClick={() => abrirArquivo(procuracao)} style={{ ...btn('#475569', false), padding: '6px 11px', fontSize: 12, opacity: procuracao ? 1 : 0.45 }}>✍️ Procuração</button>
            <button disabled={!c.carta_concessao_url} onClick={() => abrirArquivo(c.carta_concessao_url)} style={{ ...btn('#475569', false), padding: '6px 11px', fontSize: 12, opacity: c.carta_concessao_url ? 1 : 0.45 }}>📜 Carta de concessão</button>
            {(Array.isArray(c.rgs) ? c.rgs : []).map((g, i) => (
              <button key={'rg' + i} onClick={() => setVerRg({ c, i })} style={{ ...btn('#475569', false), padding: '6px 11px', fontSize: 12 }}>🪪 {g.rotulo || 'RG'}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: `1px solid ${cores.cardBorda}`, paddingTop: 12 }}>
            {!c.iniciado_em ? (
              <button onClick={() => abrir('iniciar', c)} style={{ ...btn(AZUL), padding: '8px 16px' }}>▶️ Iniciar</button>
            ) : (<>
              <button onClick={() => abrir('confirmar', c)} style={{ ...btn(cores.ok), padding: '8px 14px' }}>✅ Confirmar</button>
              <button onClick={() => abrir('reenviar', c)} style={{ ...btn('#7c3aed', false), padding: '8px 12px' }}>🔁 Reenviar link</button>
              <button onClick={() => abrir('invalidar', c)} style={{ ...btn(cores.perigo, false), padding: '8px 12px' }}>⛔ Invalidar</button>
            </>)}
          </div>
        </div>
      </div>
    )
  }

  const coluna = (titulo, sub, cor, itens, vazio) => (
    <div style={{ display: 'grid', gap: 12, alignContent: 'start', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 2px 0' }}>
        <span style={{ width: 9, height: 9, borderRadius: 999, background: cor, boxShadow: `0 0 0 4px ${hexA(cor, 0.15)}` }} />
        <span style={{ fontSize: 15, fontWeight: 800, color: cores.texto }}>{titulo}</span>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: cor, background: hexA(cor, 0.12), borderRadius: 999, padding: '1px 10px' }}>{itens.length}</span>
        <span style={{ fontSize: 12, color: cores.suave }}>{sub}</span>
      </div>
      {itens.length === 0 ? <div style={{ ...card, padding: 20, fontSize: 13, color: cores.suave }}>{vazio}</div> : itens.map(cartao)}
    </div>
  )

  const j = janela
  const st = { width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${hexA('#0f172a', 0.14)}`, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' }
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 1400, margin: '0 auto' }}>
      {toast}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ width: 48, height: 48, borderRadius: 15, background: `linear-gradient(135deg, ${AZUL}, #3b82f6)`, display: 'grid', placeItems: 'center', fontSize: 22 }}>🏦</div>
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <div style={{ fontSize: isMobile ? 21 : 25, fontWeight: 800, color: cores.texto }}>PrevSempre</div>
          <div style={{ fontSize: 13, color: cores.suave }}>Clientes que recebem pelo Banco Mercantil · abertura de conta e desconto automático dos honorários</div>
        </div>
        <button onClick={carregar} style={btn('#475569', false)}>⟳ Atualizar</button>
      </div>
      <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome, CPF ou telefone" style={{ ...st, maxWidth: 520 }} />
      {erro && <div style={{ ...card, padding: 14, color: cores.perigo, fontWeight: 600 }}>{erro}</div>}
      {casos == null ? <div style={{ ...card, padding: 20, color: cores.suave }}>carregando…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 18, alignItems: 'start' }}>
          {coluna('Novos', 'clique em Iniciar', AZUL, novos, 'Nenhum caso novo. 🎉')}
          {coluna('Aguardando a cliente', `vermelho depois de ${HORAS_ALERTA}h`, '#0d9488', aguardando, 'Ninguém aguardando.')}
        </div>
      )}

      {verRg && <VerDocumento docs={verRg.c.rgs || []} inicio={verRg.i} titulo={verRg.c.nome} onClose={() => setVerRg(null)} />}

      {j?.tipo === 'iniciar' && (
        <Janela titulo="▶️ Iniciar PrevSempre" sub={`${j.c.nome} · ${fmtCpf(j.c.cpf)}`} onClose={fechar}
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
        <Janela titulo="✅ Conta aberta e desconto autorizado" sub={`${j.c.nome} · ${fmtCpf(j.c.cpf)}`} cor={cores.ok} onClose={fechar}
          rodape={<>
            <button onClick={fechar} style={btn('#475569', false)}>Cancelar</button>
            <button disabled={!arquivo || salvando} onClick={() => agir('confirmar', j.c, { texto: texto.trim() || null })} style={{ ...btn(cores.ok), opacity: arquivo && !salvando ? 1 : 0.45 }}>{salvando ? 'Salvando…' : 'Confirmar'}</button>
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
