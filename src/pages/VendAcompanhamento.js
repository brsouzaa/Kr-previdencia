import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { cores } from '../lib/tema'
import {
  Chip, hexA, estiloBotao as btn, estiloCard as card, fmtCpf, fmtTel, fmtData, fmtDataHora,
  useIsMobile, useToast, copiarTexto, abrirArquivo, enviarArquivo, soDig,
} from './ProtocoloFicha'

// ===== PAINEL DO VENDEDOR · RELACIONAMENTO (09/11/2026, Bruno) =====
// So as clientes que estao no setor de Acompanhamento (protocolo + pos-deferimento) da vendedora logada.
// Regua (configuravel no banco, app_config vend_*): 1 contato por semana (dias uteis) ate saber a data do
// pagamento; na semana do pagamento 2 contatos (3 dias uteis antes e 1 dia util depois). Se o pos falou com a
// cliente nas ultimas 48h, o contato semanal e empurrado. Vermelho: 24h UTEIS depois de subir sem marcar.
// O vendedor NAO informa prazo nem data: ve o estado em linguagem de cliente e a frase "se ela perguntar, diga".
// Banco: vend_painel / vend_contato_registrar / vend_ficha (tabela vend_contatos).

const COLUNAS = [
  { k: 'preparando', rot: 'Preparando o pedido', icone: '📥', cor: '#475569' },
  { k: 'inss', rot: 'No INSS', icone: '📨', cor: '#7c3aed' },
  { k: 'exigencia', rot: 'Exigência', icone: '📎', cor: '#c2410c' },
  { k: 'aprovado', rot: 'Aprovado', icone: '✅', cor: '#15803d' },
  { k: 'pagamento', rot: 'Pagamento marcado', icone: '💰', cor: '#6d28d9' },
  { k: 'recebeu', rot: 'Recebeu', icone: '🤝', cor: '#15803d' },
]
const colInfo = (k) => COLUNAS.find(c => c.k === k) || COLUNAS[0]

// estado em linguagem de cliente (sem prazo, sem data, sem detalhe tecnico)
const FASE = {
  preparando: 'Preparando o pedido',
  inss: 'No INSS · em análise',
  exigencia: 'Exigência · a equipe está cuidando',
  aprovado: 'Aprovado 🎉',
  pagamento: 'Aprovado · pagamento chegando',
  recebeu: 'Recebeu',
}
const DIGA = {
  preparando: 'A nossa equipe está preparando o seu pedido para o INSS. Se precisar de algum documento, a equipe te chama.',
  inss: 'Seu pedido já está no INSS e está em análise. Qualquer novidade, a nossa equipe te avisa na hora.',
  exigencia: 'O INSS pediu um complemento e a nossa equipe já está cuidando disso com você.',
  aprovado: 'Seu benefício foi aprovado! 🎉 A nossa equipe vai te passar os próximos passos.',
  pagamento: 'Está tudo certo! A nossa equipe vai te acompanhar no dia do pagamento, pode ficar tranquila.',
  recebeu: 'Que bom que deu tudo certo! Qualquer coisa, estou por aqui.',
}

const TIPO = {
  semanal: { rot: 'Contato da semana', icone: '🗓️', cor: '#2563eb' },
  pag_antes: { rot: 'Semana do pagamento · antes', icone: '💰', cor: '#7c3aed' },
  pag_depois: { rot: 'Semana do pagamento · depois', icone: '💰', cor: '#7c3aed' },
}

const RESULTADOS = [
  { v: 'ok', rot: '💚 Tudo bem — ela está tranquila', cor: cores.ok },
  { v: 'duvida', rot: '❓ Ela tem dúvida técnica → vira aviso para o pós', cor: '#2563eb' },
  { v: 'insatisfeita', rot: '⚠️ Ela está insatisfeita → vira alerta para a supervisão', cor: cores.perigo },
  { v: 'sem_resposta', rot: '📵 Não respondeu', cor: '#64748b' },
]

const primeiroNome = (n) => { const p = String(n || '').trim().split(/\s+/)[0] || ''; return p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : '' }
const telWa = (t) => { let d = soDig(t); if (d.startsWith('55') && d.length > 11) d = d.slice(2); return d.length >= 10 ? '55' + d : null }
const hojeSP = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const diaSP = (v) => (v ? new Date(v).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : '')
const reais = (v) => (v == null || v === '' ? null : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const txtHoras = (h) => (h == null ? '' : h < 24 ? `${Math.max(0, Math.floor(h))}h úteis` : `${Math.floor(h / 24)}d ${Math.floor(h % 24)}h úteis`)
const variacao = (seed, n) => { let s = 0; String(seed || '').split('').forEach(ch => { s = (s * 31 + ch.charCodeAt(0)) % 9973 }); return s % n }

// mensagens de ACOLHIMENTO (sem prazo, sem data, sem promessa)
function mensagemSugerida(c) {
  const n = primeiroNome(c.nome)
  const op = c.tarefa === 'pag_antes' ? [
    `${n}, tá chegando! 🎉 Passei só pra dizer que tô por aqui, tá? Qualquer dúvida, é só me chamar 😊`,
    `Oi, ${n}! Falta pouquinho 💛 Tô por aqui pra qualquer coisa que você precisar, tá bom?`,
  ] : c.tarefa === 'pag_depois' ? [
    `Oi, ${n}! Deu tudo certo com o seu pagamento? 💛 Fico muito feliz de ter feito parte disso com você. Qualquer coisa, tô aqui!`,
    `${n}, passando pra saber se correu tudo bem 😊 Qualquer dúvida, pode me chamar, tá?`,
  ] : c.coluna === 'aprovado' || c.coluna === 'pagamento' ? [
    `${n}, que alegria o seu benefício aprovado! 💛 Como você está? Está recebendo as orientações da nossa equipe direitinho?`,
    `Oi, ${n}! Passando pra saber como você está 💛 Tá tudo certinho por aí? Qualquer dúvida, é só me chamar.`,
  ] : [
    `Oi, ${n}! Tudo bem com você e com o bebê? 💛 Passando pra saber como você está e se está recebendo as nossas mensagens direitinho. Qualquer coisa, tô aqui!`,
    `${n}, tudo bem? 😊 Lembrei de você e passei pra saber como estão as coisas. Se tiver qualquer dúvida, pode me chamar, tá?`,
  ]
  return op[variacao(c.caso_id + (c.ult_vend || ''), op.length)]
}

// ------------------------------------------------------------------ ficha (so leitura)
function FichaVendedor({ c, onClose }) {
  const isMobile = useIsMobile()
  const [f, setF] = useState(null)
  const [erro, setErro] = useState('')
  useEffect(() => {
    let vivo = true
    supabase.rpc('vend_ficha', { p_caso: c.caso_id }).then(({ data, error }) => {
      if (!vivo) return
      if (error || !data?.ok) setErro(error?.message || data?.erro || 'não consegui abrir')
      else setF(data)
    })
    return () => { vivo = false }
  }, [c.caso_id])
  const col = colInfo(c.coluna)
  const pd = f?.posdef
  const cs = f?.caso
  const info = (rot, val) => val ? (
    <div style={{ minWidth: 0 }}><div style={{ fontSize: 11.5, color: cores.suave, fontWeight: 700 }}>{rot}</div><div style={{ fontSize: 13.5, color: cores.texto, fontWeight: 600, overflowWrap: 'anywhere' }}>{val}</div></div>
  ) : null
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', backdropFilter: 'blur(3px)', zIndex: 2000, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: isMobile ? '100%' : 560, height: '100%', background: '#fff', overflow: 'auto', boxShadow: '-10px 0 40px rgba(15,23,42,.18)' }}>
        <div style={{ padding: '18px 20px 14px', borderBottom: `1px solid ${cores.cardBorda}`, background: `linear-gradient(135deg, ${hexA(col.cor, 0.10)}, transparent)`, position: 'sticky', top: 0, zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: cores.texto }}>{c.nome}</div>
              <div style={{ fontSize: 12.5, color: cores.suave }}>{fmtCpf(c.cpf)}{c.telefone ? ` · ${fmtTel(c.telefone)}` : ''}{c.vendedora_nome ? ` · venda: ${c.vendedora_nome}` : ''}</div>
            </div>
            <button onClick={onClose} aria-label="Fechar" style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: cores.suave }}>✕</button>
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Chip cor={col.cor} forte>{col.icone} {col.rot}</Chip>
            <Chip cor="#475569">{FASE[c.coluna]}</Chip>
            <span style={{ fontSize: 11.5, color: cores.suave, alignSelf: 'center' }}>só consulta</span>
          </div>
        </div>
        <div style={{ padding: 20, display: 'grid', gap: 16 }}>
          {erro && <div style={{ color: cores.perigo, fontWeight: 600 }}>{erro}</div>}
          {!f && !erro && <div style={{ color: cores.suave }}>Carregando…</div>}
          {f && (<>
            <div style={{ fontSize: 13, background: hexA('#0f766e', 0.06), borderRadius: 10, padding: '9px 12px', color: cores.texto }}><b style={{ color: '#0f766e' }}>Se ela perguntar, diga:</b> “{DIGA[c.coluna]}” · Dúvida técnica → passe para o pós.</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
              {info('Assinatura', cs?.data_assinatura ? fmtData(cs.data_assinatura) : null)}
              {info('Protocolo no INSS', cs?.numero_protocolo ? `${cs.numero_protocolo}${cs.data_protocolo ? ' · ' + fmtData(cs.data_protocolo) : ''}` : null)}
              {info('Deferido em', pd?.data_deferimento ? fmtData(pd.data_deferimento) : null)}
              {info('Banco', pd?.banco ? (pd.prevsempre ? `${pd.banco} (PrevSempre)` : pd.banco) : null)}
              {info('Data do pagamento', pd?.data_pagamento ? fmtData(pd.data_pagamento) : null)}
              {info('Valor do benefício', reais(pd?.valor_beneficio))}
              {info('Cliente pagou', pd?.pago_em ? `${fmtData(pd.pago_em)}${pd.honorario_forma ? ' · ' + pd.honorario_forma : ''}` : null)}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.07em', color: cores.suave, textTransform: 'uppercase', marginBottom: 8 }}>Linha do tempo</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {(f.eventos || []).length === 0 && <div style={{ color: cores.suave, fontSize: 13 }}>Sem movimentações ainda.</div>}
                {(f.eventos || []).map((e, i) => (
                  <div key={i} style={{ borderLeft: `3px solid ${e.tipo === 'contato_vendedor' ? '#2563eb' : e.origem === 'acompanhamento' ? '#0d9488' : '#7c3aed'}`, padding: '4px 0 4px 10px' }}>
                    <div style={{ fontSize: 13, color: cores.texto }}>{e.texto || e.tipo}</div>
                    <div style={{ fontSize: 11.5, color: cores.suave }}>{fmtDataHora(e.em)} · {e.quem}
                      {e.anexo && <button onClick={() => abrirArquivo(e.anexo)} style={{ marginLeft: 8, border: 'none', background: 'none', color: cores.azul, cursor: 'pointer', fontSize: 11.5, fontWeight: 700, padding: 0 }}>📎 anexo</button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>)}
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ marcar contato
function ModalContato({ c, onClose, onFeito }) {
  const isMobile = useIsMobile()
  const [arquivo, setArquivo] = useState(null)
  const [previa, setPrevia] = useState(null)
  const [resultado, setResultado] = useState('')
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const inputRef = useRef(null)
  const pegar = useCallback((f) => {
    if (!f) return
    if (!/^image\//.test(f.type)) { setErro('Envie o PRINT (imagem) da conversa no WhatsApp.'); return }
    if (f.size > 15 * 1024 * 1024) { setErro('Imagem maior que 15 MB.'); return }
    setErro(''); setArquivo(f); setPrevia(URL.createObjectURL(f))
  }, [])
  useEffect(() => {
    const h = (e) => { const it = [...(e.clipboardData?.items || [])].find(x => x.kind === 'file'); if (it) pegar(it.getAsFile()) }
    window.addEventListener('paste', h)
    return () => window.removeEventListener('paste', h)
  }, [pegar])
  const precisaTexto = resultado === 'duvida' || resultado === 'insatisfeita'
  const falta = [!arquivo && 'print da conversa', !resultado && 'como foi', precisaTexto && !texto.trim() && 'o que ela disse'].filter(Boolean)
  const t = TIPO[c.tarefa] || TIPO.semanal
  async function salvar() {
    if (falta.length || salvando) return
    setSalvando(true); setErro('')
    try {
      const caminho = await enviarArquivo(arquivo, c.cpf)
      const { data, error } = await supabase.rpc('vend_contato_registrar', { p_caso: c.caso_id, p_tipo: c.tarefa, p_resultado: resultado, p_texto: texto.trim() || null, p_print: caminho, p_ref: c.ref_data || null })
      if (error) throw new Error(error.message)
      if (!data?.ok) throw new Error(data?.erro || 'não salvou')
      onFeito && onFeito()
    } catch (e) { setErro(String(e.message || e)); setSalvando(false) }
  }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', backdropFilter: 'blur(3px)', zIndex: 2100, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...card, width: '100%', maxWidth: 540, maxHeight: isMobile ? '92vh' : '88vh', overflow: 'auto', borderRadius: isMobile ? '20px 20px 0 0' : 20, padding: 0 }}>
        <div style={{ padding: '18px 20px 14px', borderBottom: `1px solid ${cores.cardBorda}`, background: `linear-gradient(135deg, ${hexA(t.cor, 0.10)}, transparent)` }}>
          <div style={{ fontSize: 16.5, fontWeight: 800, color: cores.texto }}>✓ Fiz o contato</div>
          <div style={{ fontSize: 12.5, color: cores.suave }}>{c.nome} · {t.rot}</div>
        </div>
        <div style={{ padding: 20, display: 'grid', gap: 14 }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: cores.suave, margin: '0 0 5px' }}>Print da conversa no WhatsApp<span style={{ color: cores.perigo }}> *</span></div>
            <div onClick={() => inputRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); pegar(e.dataTransfer.files?.[0]) }}
              style={{ border: `2px dashed ${arquivo ? hexA(cores.ok, 0.5) : hexA('#0f172a', 0.18)}`, borderRadius: 14, padding: 14, background: arquivo ? hexA(cores.ok, 0.05) : '#fafbfd', cursor: 'pointer', textAlign: 'center', fontSize: 13, color: cores.suave }}>
              {previa ? <img src={previa} alt="print" style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 8 }} />
                : <span><b style={{ color: cores.texto }}>Arraste o print, cole (Ctrl+V) ou clique</b> · só imagem</span>}
              <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => pegar(e.target.files?.[0])} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: cores.suave, margin: '0 0 5px' }}>Como foi?<span style={{ color: cores.perigo }}> *</span></div>
            <div style={{ display: 'grid', gap: 6 }}>
              {RESULTADOS.map(o => {
                const on = resultado === o.v
                return <button key={o.v} type="button" onClick={() => setResultado(o.v)} style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: on ? 800 : 600, border: `1.5px solid ${on ? o.cor : hexA('#0f172a', 0.14)}`, background: on ? hexA(o.cor, 0.08) : '#fff', color: cores.texto }}>{o.rot}</button>
              })}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: cores.suave, margin: '0 0 5px' }}>O que ela disse{precisaTexto ? <span style={{ color: cores.perigo }}> *</span> : ' (opcional)'}</div>
            <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={3} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${hexA('#0f172a', 0.14)}`, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }} />
          </div>
          {erro && <div style={{ color: cores.perigo, background: hexA(cores.perigo, 0.08), borderRadius: 10, padding: '9px 12px', fontSize: 13, fontWeight: 600 }}>{erro}</div>}
          {falta.length > 0 && !salvando && <div style={{ fontSize: 12, color: cores.suave }}>Falta: {falta.join(' · ')}</div>}
        </div>
        <div style={{ padding: '14px 20px 20px', display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: `1px solid ${cores.cardBorda}`, position: 'sticky', bottom: 0, background: '#fff' }}>
          <button onClick={onClose} style={btn('#475569', false)}>Cancelar</button>
          <button onClick={salvar} disabled={!!falta.length || salvando} style={{ ...btn('#2563eb'), opacity: falta.length ? 0.45 : 1, cursor: falta.length ? 'not-allowed' : 'pointer' }}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ pagina
export default function VendAcompanhamento() {
  const isMobile = useIsMobile()
  const [toast, mostrar] = useToast()
  const [dados, setDados] = useState(null)
  const [aba, setAba] = useState('tarefas')
  const [vend, setVend] = useState('')
  const [fichaDe, setFichaDe] = useState(null)
  const [contatoDe, setContatoDe] = useState(null)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('vend_painel')
    if (error || !data?.ok) { mostrar(error?.message || data?.erro || 'Erro ao carregar', 'erro'); setDados({ clientes: [] }); return }
    setDados(data)
  }, [mostrar])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { const i = setInterval(carregar, 120000); return () => clearInterval(i) }, [carregar])

  const todos = useMemo(() => dados?.clientes || [], [dados])
  const vendedoras = useMemo(() => [...new Set(todos.map(c => c.vendedora_nome).filter(Boolean))].sort(), [todos])
  const lista = vend ? todos.filter(c => c.vendedora_nome === vend) : todos
  const limite = dados?.vermelho_horas || 24
  const vermelha = (c) => c.tarefa && !c.empurrada_ate && Number(c.horas_uteis || 0) > limite
  const aFazer = lista.filter(c => c.tarefa && !c.empurrada_ate)
    .sort((a, b) => (vermelha(b) - vermelha(a)) || String(a.subiu || '').localeCompare(String(b.subiu || '')))
  const empurradas = lista.filter(c => c.tarefa && c.empurrada_ate).sort((a, b) => String(a.empurrada_ate).localeCompare(String(b.empurrada_ate)))
  const hoje = hojeSP()
  const kpis = [
    { rot: 'PARA FAZER', n: aFazer.length, cor: cores.texto },
    { rot: `VERMELHAS (+${limite}h úteis)`, n: aFazer.filter(vermelha).length, cor: cores.perigo },
    { rot: 'FEITAS HOJE', n: lista.filter(c => diaSP(c.ult_vend) === hoje).length, cor: cores.ok },
    { rot: 'SEMANA DO PAGAMENTO', n: aFazer.filter(c => c.tarefa !== 'semanal').length, cor: '#7c3aed' },
  ]

  const tarefa = (c) => {
    const t = TIPO[c.tarefa] || TIPO.semanal
    const red = vermelha(c)
    const msg = mensagemSugerida(c)
    const wa = telWa(c.telefone)
    const cor = red ? cores.perigo : t.cor
    return (
      <div key={c.caso_id} style={{ ...card, padding: 14, borderLeft: `5px solid ${cor}`, background: red ? '#fff7f7' : '#fff', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) minmax(0,360px) auto', gap: 14, alignItems: 'start' }}>
        <div style={{ minWidth: 0 }}>
          <div onClick={() => setFichaDe(c)} style={{ fontWeight: 800, fontSize: 14.5, color: cores.texto, cursor: 'pointer' }}>{c.nome}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
            <Chip cor={t.cor} forte>{t.icone} {t.rot}</Chip>
            <Chip cor="#475569">{FASE[c.coluna]}</Chip>
            {vend === '' && dados?.ve_tudo && c.vendedora_nome && <Chip cor="#64748b">{c.vendedora_nome}</Chip>}
          </div>
          <div style={{ fontSize: 12.5, background: '#f8fafc', borderRadius: 10, padding: '8px 10px', marginTop: 8, color: cores.texto }}><b style={{ color: '#0f766e' }}>Se ela perguntar, diga:</b> “{DIGA[c.coluna]}” · Dúvida técnica → passe para o pós.</div>
          <div style={{ fontSize: 12, fontWeight: 800, marginTop: 7, color: red ? cores.perigo : t.cor }}>
            {red ? `⏰ passou de ${limite}h úteis · subiu ${fmtDataHora(c.subiu)}` : `subiu ${fmtDataHora(c.subiu)} · há ${txtHoras(Number(c.horas_uteis || 0))}`}
          </div>
        </div>
        <div style={{ fontSize: 12.8, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '8px 10px', whiteSpace: 'pre-wrap', color: cores.texto }}>{msg}</div>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={async () => { const ok = await copiarTexto(msg); mostrar(ok ? 'Mensagem copiada' : 'Não consegui copiar', ok ? undefined : 'erro') }} style={{ ...btn('#16a34a', false), padding: '7px 12px', fontSize: 12.5 }}>📋 Copiar</button>
          {wa && <a href={`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer" style={{ ...btn('#16a34a', false), padding: '7px 12px', fontSize: 12.5, textDecoration: 'none', textAlign: 'center' }}>WhatsApp</a>}
          <button onClick={() => setContatoDe(c)} style={{ ...btn('#2563eb'), padding: '7px 12px', fontSize: 12.5 }}>✓ Fiz o contato</button>
        </div>
      </div>
    )
  }

  const abaTarefas = (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))', gap: 10 }}>
        {kpis.map(k => (
          <div key={k.rot} style={{ ...card, padding: '12px 14px' }}>
            <div style={{ fontSize: 11.5, color: k.cor === cores.texto ? cores.suave : k.cor, fontWeight: 800 }}>{k.rot}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: k.cor }}>{k.n}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.07em', color: cores.suave, textTransform: 'uppercase' }}>Para fazer</div>
      {aFazer.length === 0 && <div style={{ ...card, padding: 18, color: cores.suave, fontSize: 13.5 }}>Nenhum contato pendente agora. 🎉</div>}
      {aFazer.map(tarefa)}
      {empurradas.length > 0 && (<>
        <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.07em', color: cores.suave, textTransform: 'uppercase', marginTop: 6 }}>Empurradas (o pós falou com ela nas últimas 48h)</div>
        {empurradas.map(c => (
          <div key={c.caso_id} onClick={() => setFichaDe(c)} style={{ ...card, padding: '10px 14px', borderLeft: '5px solid #94a3b8', opacity: 0.75, cursor: 'pointer' }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: cores.texto }}>{c.nome}</div>
            <div style={{ fontSize: 12, color: cores.suave }}>{FASE[c.coluna]} · volta {fmtDataHora(c.empurrada_ate)}{dados?.ve_tudo && c.vendedora_nome ? ` · ${c.vendedora_nome}` : ''}</div>
          </div>
        ))}
      </>)}
    </div>
  )

  const cartaoFunil = (c) => (
    <div key={c.caso_id} onClick={() => setFichaDe(c)} className="kr-cartao" style={{ background: '#fff', borderRadius: 12, border: `1px solid ${cores.cardBorda}`, padding: '9px 11px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(15,23,42,.05)' }}>
      <div style={{ fontWeight: 800, fontSize: 13, color: cores.texto }}>{c.nome}</div>
      <div style={{ fontSize: 12, color: cores.suave }}>
        {c.coluna === 'pagamento' ? `cai ${fmtData(c.data_pagamento)}${c.banco ? ' · ' + c.banco.replace(/^Banco\s+/i, '') : ''}`
          : c.coluna === 'recebeu' ? `recebeu${c.pago_em ? ' ' + fmtData(c.pago_em) : ''}${c.honorario_forma ? ' · honorário pago' : ''}`
          : c.coluna === 'aprovado' ? (c.banco ? c.banco.replace(/^Banco\s+/i, '') + (c.prevsempre ? ' · PrevSempre' : '') : 'aprovado')
          : FASE[c.coluna]}
      </div>
      {dados?.ve_tudo && vend === '' && c.vendedora_nome && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{c.vendedora_nome}</div>}
      {c.tarefa && !c.empurrada_ate && <div style={{ fontSize: 11, fontWeight: 800, marginTop: 3, color: vermelha(c) ? cores.perigo : '#2563eb' }}>{vermelha(c) ? '⏰ contato atrasado' : '🗓️ contato para fazer'}</div>}
    </div>
  )

  const abaFunil = (
    <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
      <div style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: isMobile ? '78vw' : 'minmax(200px, 1fr)', gap: 10, minWidth: isMobile ? 'auto' : COLUNAS.length * 200 }}>
        {COLUNAS.map(col => {
          const itens = lista.filter(c => c.coluna === col.k)
          return (
            <div key={col.k} style={{ background: hexA(col.cor, 0.04), borderRadius: 16, padding: 9, border: `1.5px dashed ${hexA(col.cor, 0.35)}`, minHeight: 320, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: col.cor, padding: '2px 4px 4px' }}>{col.icone} {col.rot} <span style={{ color: cores.suave, fontWeight: 700 }}>· {itens.length}</span></div>
              {itens.map(cartaoFunil)}
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {toast}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: cores.texto }}>🤝 Minhas clientes</div>
          <div style={{ fontSize: 13, color: cores.suave }}>Clientes que estão no setor de Acompanhamento · você é a presença; o pós cuida da parte técnica</div>
        </div>
        {dados?.ve_tudo && (
          <select value={vend} onChange={e => setVend(e.target.value)} style={{ padding: '9px 12px', borderRadius: 10, border: `1px solid ${hexA('#0f172a', 0.14)}`, fontSize: 13.5, fontFamily: 'inherit', background: '#fff' }}>
            <option value="">Todas as vendedoras ({todos.length})</option>
            {vendedoras.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        )}
        <button onClick={carregar} style={{ ...btn('#475569', false), padding: '8px 12px', fontSize: 12.5 }}>↻ Atualizar</button>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[['tarefas', `✅ Tarefas de contato`, aFazer.filter(vermelha).length], ['funil', '📊 Acompanhamento das minhas vendas', null]].map(([k, rot, n]) => (
          <button key={k} onClick={() => setAba(k)} style={{ padding: '9px 16px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: 13.5, border: `1.5px solid ${aba === k ? '#0f172a' : '#cbd5e1'}`, background: aba === k ? '#0f172a' : '#fff', color: aba === k ? '#fff' : '#475569' }}>
            {rot}{n ? <span style={{ background: cores.perigo, color: '#fff', borderRadius: 999, padding: '1px 7px', marginLeft: 6 }}>{n}</span> : null}
          </button>
        ))}
      </div>
      {!dados ? <div style={{ color: cores.suave }}>Carregando…</div> : aba === 'tarefas' ? abaTarefas : abaFunil}
      {fichaDe && <FichaVendedor c={fichaDe} onClose={() => setFichaDe(null)} />}
      {contatoDe && <ModalContato c={contatoDe} onClose={() => setContatoDe(null)} onFeito={() => { setContatoDe(null); mostrar('Contato registrado'); carregar() }} />}
    </div>
  )
}
