import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// ===== MESA DA ADVOGADA — Retroativo (25/08) =====
// Regra do fluxo (Bruno): ninguem chega aqui sem ter passado pela conferencia PromoBank.
// A fila vem priorizada do banco (rpc mesa_advogada): pre-aprovado primeiro, e quem nao
// mandou CNIS so aparece depois de 20 min parada. A decisao dela e a oficial:
// PRE-APROVADO REAL vai pro vendedor; NEGADO encerra e a cliente e avisada no Chatwoot.

const CHATWOOT_BASE = 'https://chat.grupookr.com.br'
const linkChat = (c) => c && c.chatwoot_conversation_id
  ? CHATWOOT_BASE + '/app/accounts/' + (c.chatwoot_account_id || 1) + '/conversations/' + c.chatwoot_conversation_id
  : null

const FILAS = {
  PRE_APROVADO:   { label: '🔥 Pré-aprovada pela máquina', cor: '#059669', bg: 'rgba(52,211,153,.14)' },
  CNIS_RECEBIDO:  { label: '📄 CNIS recebido', cor: '#2563eb', bg: 'rgba(96,165,250,.12)' },
  GERID:          { label: '🗂️ Fila GERID', cor: '#7c3aed', bg: 'rgba(167,139,250,.14)' },
  PEDIU_HUMANO:   { label: '🙋 Pediu humano', cor: '#b45309', bg: 'rgba(251,191,36,.12)' },
  SEM_CNIS_20MIN: { label: '⏰ Sem CNIS há 20min+', cor: '#5b6b84', bg: 'rgba(15,23,42,.04)' },
}
const ORDEM_FILAS = ['PRE_APROVADO', 'CNIS_RECEBIDO', 'GERID', 'PEDIU_HUMANO', 'SEM_CNIS_20MIN']

// Motivos — exatamente os que a operacao usa hoje no grupo do WhatsApp
const MOTIVOS_APROVA = [
  'Dentro dos 12 meses',
  'Dentro dos 24 meses — confirmar seguro-desemprego com a cliente',
  'Dentro dos 24 meses por ter 120 contribuições',
]
const MOTIVOS_NEGA = [
  'Recebeu salário maternidade',
  'Estava empregada no parto',
  'Excedeu o período de graça',
  'Outro motivo',
]

const s = {
  wrap: { maxWidth: 1100 },
  h1: { fontSize: 22, fontWeight: 600, color: '#0f172a', margin: 0 },
  sub: { fontSize: 13, color: '#5b6b84', marginTop: 4, marginBottom: 18, lineHeight: 1.5 },
  chips: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 },
  chip: (cor, bg, on) => ({
    padding: '7px 13px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
    background: on ? cor : bg, color: on ? '#ffffff' : cor,
    border: '0.5px solid rgba(15,23,42,0.09)', fontFamily: 'inherit',
  }),
  card: (destaque) => ({
    background: '#ffffff', borderRadius: 13, padding: 16, marginBottom: 12,
    border: destaque ? '1.5px solid #059669' : '0.5px solid rgba(15,23,42,0.08)',
    boxShadow: '0 1px 2px rgba(15,23,42,.06)',
  }),
  linha: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  nome: { fontSize: 15, fontWeight: 600, color: '#0f172a' },
  dado: { fontSize: 12, color: '#5b6b84', marginTop: 3 },
  badge: (cor, bg) => ({ padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: bg, color: cor, whiteSpace: 'nowrap' }),
  barraLote: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 },
  btnLote: { padding: '9px 14px', background: '#0f172a', color: '#ffffff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  loteDica: { fontSize: 12, color: '#5b6b84' },
  gerid: { marginTop: 10, padding: 10, borderRadius: 9, background: '#f2f5fa', border: '0.5px solid rgba(15,23,42,0.08)' },
  geridTit: { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#5b6b84', marginBottom: 7 },
  geridLinha: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' },
  btnCopia: (off) => ({ padding: '5px 10px', background: off ? '#e2e8f0' : '#ffffff', color: off ? '#94a3b8' : '#2563eb', border: '0.5px solid rgba(15,23,42,0.14)', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: off ? 'not-allowed' : 'pointer', fontFamily: 'inherit', minWidth: 78 }),
  valor: { fontSize: 14, fontWeight: 600, color: '#0f172a', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing: '0.3px' },
  alertaMini: { fontSize: 10.5, fontWeight: 600, color: '#92400e', background: 'rgba(251,191,36,.18)', borderRadius: 6, padding: '2px 7px' },
  maquina: { marginTop: 10, padding: 10, borderRadius: 9, background: '#f2f5fa', fontSize: 12, color: '#334155', lineHeight: 1.45 },
  acoes: { display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  btnOk: { padding: '10px 16px', background: '#059669', color: '#ffffff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  btnNao: { padding: '10px 16px', background: '#dc2626', color: '#ffffff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  btnChat: { padding: '10px 14px', background: 'rgba(96,165,250,.12)', color: '#2563eb', border: '0.5px solid rgba(15,23,42,0.09)', borderRadius: 9, fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'inline-block' },
  motivos: { marginTop: 12, padding: 12, borderRadius: 10, background: '#f2f5fa', border: '0.5px solid rgba(15,23,42,0.08)' },
  motivoBtn: (cor) => ({
    display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', marginBottom: 6,
    background: '#ffffff', color: '#0f172a', border: '1px solid ' + cor + '40',
    borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
  }),
  input: { width: '100%', padding: '9px 10px', fontSize: 13, borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.12)', marginBottom: 6, boxSizing: 'border-box', fontFamily: 'inherit' },
  vazio: { textAlign: 'center', padding: '3rem', color: '#5b6b84', fontSize: 14, background: '#ffffff', borderRadius: 13, border: '0.5px solid rgba(15,23,42,0.08)' },
  // --- print do GERID (26/08) ---
  colaArea: (temPrint) => ({
    marginBottom: 8, padding: '16px 12px', borderRadius: 9, textAlign: 'center', cursor: 'text',
    background: temPrint ? 'rgba(52,211,153,.14)' : '#fffdf7',
    border: temPrint ? '1px solid #05966950' : '2px dashed #b45309',
    outline: 'none',
  }),
  colaTit: (temPrint) => ({ fontSize: 14, fontWeight: 700, color: temPrint ? '#059669' : '#b45309' }),
  linkArquivo: {
    background: 'none', border: 'none', padding: 0, marginTop: 6,
    color: '#5b6b84', fontSize: 11.5, textDecoration: 'underline',
    cursor: 'pointer', fontFamily: 'inherit',
  },
  colaDica: { fontSize: 11, color: '#5b6b84', marginTop: 4, lineHeight: 1.45 },
  previewWrap: { marginTop: 8, position: 'relative' },
  preview: { maxWidth: '100%', maxHeight: 220, borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.14)', display: 'block', margin: '0 auto' },
  btnTiraPrint: { marginTop: 6, padding: '5px 10px', background: '#ffffff', color: '#dc2626', border: '0.5px solid #dc262640', borderRadius: 7, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
}

// Bucket ja usado pelos outros anexos do sistema.
const BUCKET_PRINT = 'documentos-clientes'

// Copiar sem depender de clipboard API (que falha em http e em alguns navegadores)
function copiar(texto) {
  try {
    if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(texto); return true }
  } catch (e) { /* cai no fallback */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = texto
    ta.style.position = 'fixed'; ta.style.left = '-9999px'
    document.body.appendChild(ta); ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    return true
  } catch (e) { return false }
}

export default function MesaAdvogada() {
  const { profile } = useAuth()
  const [copiado, setCopiado] = useState('')
  const [fila, setFila] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('')
  const [abrindo, setAbrindo] = useState(null)   // { id, tipo: 'ok' | 'nao' }
  const [outroTexto, setOutroTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  // Print do GERID — obrigatorio SO na pre-aprovacao. Negar nao precisa.
  const [print, setPrint] = useState(null)          // { file, preview }
  const [subindoPrint, setSubindoPrint] = useState(false)
  const fileRef = useRef(null)
  const colaRef = useRef(null)   // area que recebe o Ctrl+V

  const carregar = useCallback(async () => {
    const r = await supabase.rpc('mesa_advogada', { p_limite: 300 })
    if (r.error) console.error(r.error)
    setFila(r.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => {
    const t = setInterval(carregar, 60000)   // atualiza sozinha de minuto em minuto
    return () => clearInterval(t)
  }, [carregar])

  // Aceita imagem vinda do Ctrl+V, do seletor de arquivo ou de arrastar-e-soltar.
  const pegarImagem = (file) => {
    if (!file || !/^image\//.test(file.type)) return false
    if (file.size > 10 * 1024 * 1024) { alert('Print muito grande (máx 10MB).'); return false }
    setPrint({ file, preview: URL.createObjectURL(file) })
    return true
  }

  // Le a imagem de um evento de paste (serve pro listener global e pro onPaste da area)
  const colarDoEvento = (e) => {
    const dt = e.clipboardData || (typeof window !== 'undefined' && window.clipboardData)
    const itens = (dt && dt.items) || []
    for (let i = 0; i < itens.length; i++) {
      if (itens[i].kind === 'file' && /^image\//.test(itens[i].type)) {
        const f = itens[i].getAsFile()
        if (f && pegarImagem(f)) { e.preventDefault(); return true }
        return false
      }
    }
    // alguns navegadores entregam so em dt.files
    const arqs = (dt && dt.files) || []
    if (arqs.length && /^image\//.test(arqs[0].type)) {
      if (pegarImagem(arqs[0])) { e.preventDefault(); return true }
    }
    return false
  }

  // Ctrl+V em qualquer lugar da tela, enquanto o painel de PRÉ-APROVAÇÃO está aberto.
  // A area de colar tambem tem onPaste proprio — isso aqui e a rede de seguranca.
  useEffect(() => {
    if (!abrindo || abrindo.tipo !== 'ok') return
    const aoColar = (e) => { colarDoEvento(e) }
    window.addEventListener('paste', aoColar)
    // foca a area de colar pra que o Ctrl+V caia nela sem precisar clicar em nada
    const t = setTimeout(() => { if (colaRef.current && colaRef.current.focus) colaRef.current.focus() }, 60)
    return () => { window.removeEventListener('paste', aoColar); clearTimeout(t) }
  }, [abrindo])

  const limparPrint = () => {
    if (print && print.preview) { try { URL.revokeObjectURL(print.preview) } catch (e) {} }
    setPrint(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const fecharPainel = () => { setAbrindo(null); setOutroTexto(''); limparPrint() }

  const decidir = async (lead, aprovado, motivo) => {
    if (!motivo || !motivo.trim()) { alert('Escolha o motivo.'); return }
    // Regra 26/08: pré-aprovar exige o print do GERID. Negar não exige.
    if (aprovado && !print) { alert('Cole (Ctrl+V) ou anexe o print do GERID antes de pré-aprovar.'); return }

    setSalvando(true)
    let urlPrint = null
    if (aprovado && print) {
      setSubindoPrint(true)
      const ext = (print.file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
      const caminho = 'gerid/' + lead.id + '_' + Date.now() + '.' + ext
      const up = await supabase.storage.from(BUCKET_PRINT)
        .upload(caminho, print.file, { upsert: true, contentType: print.file.type })
      setSubindoPrint(false)
      if (up.error) {
        setSalvando(false)
        alert('Não consegui subir o print: ' + up.error.message)
        return
      }
      const pub = supabase.storage.from(BUCKET_PRINT).getPublicUrl(caminho)
      urlPrint = pub && pub.data && pub.data.publicUrl
      if (!urlPrint) {
        setSalvando(false)
        alert('O print subiu mas não consegui o link. Tenta de novo.')
        return
      }
    }

    const r = await supabase.rpc('advogada_decidir', {
      p_lead_id: lead.id, p_aprovado: aprovado, p_motivo: motivo.trim(),
      p_advogada: (profile && profile.id) || null,
      p_print_url: urlPrint,
    })
    setSalvando(false)
    if (r.error || !r.data || r.data.ok !== true) {
      alert('Erro: ' + ((r.error && r.error.message) || (r.data && r.data.erro) || 'tente de novo'))
      return
    }
    fecharPainel()
    setFila(f => f.filter(x => x.id !== lead.id))   // sai da fila na hora
  }

  const copiarCom = (chave, texto) => {
    if (!texto) return
    copiar(texto)
    setCopiado(chave)
    setTimeout(() => setCopiado(c => (c === chave ? '' : c)), 1400)
  }

  const copiarLote = (lista) => {
    const linhas = lista
      .filter(c => c.cpf_ok)
      .map(c => `${c.cpf_limpo}\t${c.nasc_br || 'sem data'}\t${c.nome || ''}`)
    if (!linhas.length) { alert('Nenhum CPF válido nessa fila.'); return }
    copiarCom('lote', 'CPF\tNascimento\tNome\n' + linhas.join('\n'))
  }

  const contagem = fila.reduce((a, c) => { a[c.fila] = (a[c.fila] || 0) + 1; return a }, {})
  const visiveis = filtro ? fila.filter(c => c.fila === filtro) : fila
  const fmtTempo = (m) => {
    const n = Number(m) || 0
    return n >= 60 ? Math.floor(n / 60) + 'h' + String(n % 60).padStart(2, '0') : n + 'min'
  }

  return (
    <div style={s.wrap}>
      <h1 style={s.h1}>⚖️ Mesa da Advogada — Retroativo</h1>
      <div style={s.sub}>
        Só chega aqui quem já passou pela conferência PromoBank. Pré-aprovadas vêm primeiro;
        quem não mandou o CNIS só entra depois de 20 minutos parada.<br />
        Sua decisão é a oficial: <b>pré-aprovado real</b> vai pro vendedor, <b>negado</b> encerra e a cliente é avisada automaticamente.
      </div>

      <div style={s.chips}>
        <button style={s.chip('#0f172a', 'rgba(15,23,42,.04)', !filtro)} onClick={() => setFiltro('')}>
          Todas · {fila.length}
        </button>
        {ORDEM_FILAS.map(k => (
          contagem[k] ? (
            <button key={k} style={s.chip(FILAS[k].cor, FILAS[k].bg, filtro === k)} onClick={() => setFiltro(filtro === k ? '' : k)}>
              {FILAS[k].label} · {contagem[k]}
            </button>
          ) : null
        ))}
      </div>

      {!loading && visiveis.length > 0 && (
        <div style={s.barraLote}>
          <button style={s.btnLote} onClick={() => copiarLote(visiveis)}>
            {copiado === 'lote' ? '✅ copiado!' : `📋 Copiar CPF + nascimento dos ${visiveis.length} (colar no Excel)`}
          </button>
          <span style={s.loteDica}>vem em 3 colunas: CPF · nascimento · nome</span>
        </div>
      )}

      {loading ? (
        <div style={s.vazio}>Carregando…</div>
      ) : visiveis.length === 0 ? (
        <div style={s.vazio}>✅ Nenhuma análise pendente. Fila limpa.</div>
      ) : visiveis.map(c => {
        const f = FILAS[c.fila] || FILAS.SEM_CNIS_20MIN
        const ehPre = c.fila === 'PRE_APROVADO'
        const aberto = abrindo && abrindo.id === c.id
        const href = linkChat(c)
        return (
          <div key={c.id} style={s.card(ehPre)}>
            <div style={s.linha}>
              <div>
                <div style={s.nome}>{c.nome || 'Cliente +Mais Mãe'}</div>
                <div style={s.dado}>{c.tel || 'sem telefone'} · parada há {fmtTempo(c.minutos_parado)} · {c.estado || '—'}</div>

                <div style={s.gerid}>
                  <div style={s.geridTit}>Pra consultar no GERID</div>
                  <div style={s.geridLinha}>
                    <button style={s.btnCopia(!c.cpf_ok)} disabled={!c.cpf_ok}
                      onClick={() => copiarCom('cpf' + c.id, c.cpf_limpo)}>
                      {copiado === 'cpf' + c.id ? '✅ copiado' : '📋 CPF'}
                    </button>
                    <span style={s.valor}>{c.cpf || '— sem CPF —'}</span>
                    {!c.cpf_ok && <span style={s.alertaMini}>CPF inválido</span>}
                  </div>
                  <div style={s.geridLinha}>
                    <button style={s.btnCopia(!c.nasc_br)} disabled={!c.nasc_br}
                      onClick={() => copiarCom('dt' + c.id, c.nasc_br)}>
                      {copiado === 'dt' + c.id ? '✅ copiado' : '📋 Nasc.'}
                    </button>
                    <span style={s.valor}>{c.nasc_br || '— sem data —'}</span>
                    {c.nasc_precisao === 'so mes/ano' && (
                      <span style={s.alertaMini}>a cliente só deu mês/ano — dia é chute</span>
                    )}
                    {c.nasc_precisao === 'sem data' && <span style={s.alertaMini}>pedir a data</span>}
                  </div>
                </div>
              </div>
              <span style={s.badge(f.cor, f.bg)}>{f.label}</span>
            </div>

            {(c.veredito_maquina || c.motivo_maquina) && (
              <div style={s.maquina}>
                <b>Máquina:</b> {c.veredito_maquina || '—'}
                {c.motivo_maquina ? ' · ' + c.motivo_maquina : ''}
              </div>
            )}

            {!aberto && (
              <div style={s.acoes}>
                <button style={s.btnOk} onClick={() => { setAbrindo({ id: c.id, tipo: 'ok' }); setOutroTexto(''); limparPrint() }}>
                  ✅ Pré-aprovado real
                </button>
                <button style={s.btnNao} onClick={() => { setAbrindo({ id: c.id, tipo: 'nao' }); setOutroTexto(''); limparPrint() }}>
                  ⛔ Negar
                </button>
                {href && (
                  <a style={s.btnChat} href={href} target="_blank" rel="noreferrer">💬 Abrir conversa</a>
                )}
              </div>
            )}

            {aberto && (
              <div style={s.motivos}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
                  {abrindo.tipo === 'ok' ? 'Por que ela é pré-aprovada?' : 'Por que ela foi negada?'}
                </div>

                {/* PRINT DO GERID — só na pré-aprovação */}
                {abrindo.tipo === 'ok' && (
                  <div>
                    {/* IMPORTANTE: clicar aqui NAO abre a janela de arquivos.
                        Antes abria, o dialogo do Windows roubava o foco e o Ctrl+V
                        ia parar nele em vez da pagina. Agora o clique so foca a area. */}
                    <div
                      ref={colaRef}
                      tabIndex={0}
                      style={s.colaArea(!!print)}
                      onPaste={colarDoEvento}
                      onClick={() => { if (colaRef.current && colaRef.current.focus) colaRef.current.focus() }}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); pegarImagem(e.dataTransfer.files && e.dataTransfer.files[0]) }}>
                      <div style={s.colaTit(!!print)}>
                        {print ? '✅ Print do GERID anexado' : '📋 Aperta Ctrl + V agora'}
                      </div>
                      <div style={s.colaDica}>
                        {print
                          ? 'Se colar outro por cima, esse é substituído.'
                          : 'Copia o print do GERID e cola aqui. Não precisa salvar arquivo nem clicar em nada — só Ctrl + V.'}
                      </div>
                    </div>
                    {!print && (
                      <div style={{ textAlign: 'center', marginBottom: 8 }}>
                        <button type="button" style={s.linkArquivo}
                          onClick={() => fileRef.current && fileRef.current.click()}>
                          se preferir, escolher um arquivo salvo
                        </button>
                      </div>
                    )}
                    <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={e => pegarImagem(e.target.files && e.target.files[0])} />
                    {print && (
                      <div style={s.previewWrap}>
                        <img src={print.preview} alt="print do GERID" style={s.preview} />
                        <div style={{ textAlign: 'center' }}>
                          <button style={s.btnTiraPrint} onClick={limparPrint}>🗑️ tirar esse print</button>
                        </div>
                      </div>
                    )}
                    {!print && (
                      <div style={{ ...s.colaDica, color: '#b45309', fontWeight: 600, marginBottom: 8, textAlign: 'center' }}>
                        Sem o print os motivos abaixo ficam bloqueados.
                      </div>
                    )}
                  </div>
                )}
                {(abrindo.tipo === 'ok' ? MOTIVOS_APROVA : MOTIVOS_NEGA).map(m => (
                  m === 'Outro motivo' ? (
                    <div key={m}>
                      <input
                        style={s.input}
                        placeholder="Escreva o motivo…"
                        value={outroTexto}
                        onChange={e => setOutroTexto(e.target.value)}
                      />
                      <button
                        style={{ ...s.motivoBtn('#dc2626'), fontWeight: 600 }}
                        disabled={salvando || !outroTexto.trim()}
                        onClick={() => decidir(c, false, outroTexto)}
                      >
                        ⛔ Negar com esse motivo
                      </button>
                    </div>
                  ) : (
                    <button
                      key={m}
                      style={{
                        ...s.motivoBtn(abrindo.tipo === 'ok' ? '#059669' : '#dc2626'),
                        ...(abrindo.tipo === 'ok' && !print ? { opacity: 0.45, cursor: 'not-allowed' } : {}),
                      }}
                      disabled={salvando || (abrindo.tipo === 'ok' && !print)}
                      onClick={() => decidir(c, abrindo.tipo === 'ok', m)}
                    >
                      {m}
                    </button>
                  )
                ))}
                {(salvando || subindoPrint) && (
                  <div style={{ ...s.colaDica, textAlign: 'center', fontWeight: 600 }}>
                    {subindoPrint ? 'subindo o print…' : 'salvando…'}
                  </div>
                )}
                <button
                  style={{ ...s.motivoBtn('#5b6b84'), textAlign: 'center', marginTop: 4 }}
                  onClick={fecharPainel}
                >
                  cancelar
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
