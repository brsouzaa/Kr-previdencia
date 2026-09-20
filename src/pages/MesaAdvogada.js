import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// ===== MESA DA ADVOGADA — Retroativo (25/08) =====
// Regra do fluxo (Bruno): ninguem chega aqui sem ter passado pela conferencia PromoBank.
// A fila vem priorizada do banco (rpc mesa_advogada): pre-aprovado primeiro, e quem nao
// mandou CNIS so aparece depois de 20 min parada. A decisao dela e a oficial:
// PRE-APROVADO REAL vai pro vendedor; NEGADO encerra e a cliente e avisada no Chatwoot.
//
// 20/09 — DETETIVE. A rpc passou a devolver duas colunas novas:
//   do_detetive      : o lead nasceu de uma consulta do robo Detetive
//   filhos_elegiveis : datas dos filhos com MENOS de 5 anos (grau Filho; enteado fora),
//                      no formato "13/09/2024, 20/04/2022", do mais novo pro mais velho.
// Quem vem do Detetive tem a data de nascimento LIDA no orgao; o resto da mesa hoje veio
// de lista com data estimada. Por isso eles sobem no topo (a ordenacao e feita no banco)
// e ganham etiqueta e filtro proprios aqui.

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
  // 16/09: a RPC mesa_advogada devolve esta fila desde 25/08 e o front nunca soube dela.
  // Resultado: os cards caiam no fallback e apareciam rotulados como '⏰ Sem CNIS há 20min+',
  // e o chip dela nao existia (contagem sumia). Hoje 191 dos 191 da mesa sao desta fila —
  // 87 deles sem conversa no Chatwoot (vieram do site).
  QUALIFICADO_SEM_CNIS: { label: '🌐 Qualificada, sem CNIS', cor: '#0891b2', bg: 'rgba(34,211,238,.12)' },
}
const ORDEM_FILAS = ['PRE_APROVADO', 'CNIS_RECEBIDO', 'GERID', 'PEDIU_HUMANO', 'QUALIFICADO_SEM_CNIS', 'SEM_CNIS_20MIN']

const DETETIVE_COR = '#4f46e5'
const DETETIVE_BG  = 'rgba(99,102,241,.12)'

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
  // 16/09 — a pagina ficava colada na esquerda em tela larga. margin auto centraliza.
  wrap: { maxWidth: 1100, margin: '0 auto', padding: '0 16px', width: '100%', boxSizing: 'border-box' },
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
  badges: { display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' },
  barraLote: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 },
  btnLote: { padding: '9px 14px', background: '#0f172a', color: '#ffffff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  loteDica: { fontSize: 12, color: '#5b6b84' },
  gerid: { marginTop: 10, padding: 10, borderRadius: 9, background: '#f2f5fa', border: '0.5px solid rgba(15,23,42,0.08)' },
  geridTit: { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#5b6b84', marginBottom: 7 },
  geridLinha: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' },
  btnCopia: (off) => ({ padding: '5px 10px', background: off ? '#e2e8f0' : '#ffffff', color: off ? '#94a3b8' : '#2563eb', border: '0.5px solid rgba(15,23,42,0.14)', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: off ? 'not-allowed' : 'pointer', fontFamily: 'inherit', minWidth: 78 }),
  valor: { fontSize: 14, fontWeight: 600, color: '#0f172a', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing: '0.3px' },
  alertaMini: { fontSize: 10.5, fontWeight: 600, color: '#92400e', background: 'rgba(251,191,36,.18)', borderRadius: 6, padding: '2px 7px' },
  // --- filhos elegiveis (20/09) ---
  // Bloco proprio logo abaixo do nascimento. Quando ha MAIS DE UM filho dentro
  // do prazo de 5 anos, ganha fundo amarelo: cada filho e um pedido a mais, e
  // hoje isso passava batido. Enteado nao entra (nao gera direito).
  filhosBox: (varios) => ({
    marginTop: 8, padding: varios ? '9px 10px' : '6px 0 0', borderRadius: 8,
    background: varios ? 'rgba(251,191,36,.16)' : 'transparent',
    border: varios ? '1px solid rgba(180,83,9,.35)' : 'none',
  }),
  filhosTit: { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#5b6b84', marginBottom: 4 },
  filhosDatas: { fontSize: 13.5, fontWeight: 600, color: '#0f172a', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing: '0.3px', lineHeight: 1.5 },
  filhosNota: { fontSize: 11.5, fontWeight: 700, color: '#92400e', marginTop: 5, lineHeight: 1.4 },
  maquina: { marginTop: 10, padding: 10, borderRadius: 9, background: '#f2f5fa', fontSize: 12, color: '#334155', lineHeight: 1.45 },
  acoes: { display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  btnOk: { padding: '10px 16px', background: '#059669', color: '#ffffff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  btnNao: { padding: '10px 16px', background: '#dc2626', color: '#ffffff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  btnChat: { padding: '10px 14px', background: 'rgba(96,165,250,.12)', color: '#2563eb', border: '0.5px solid rgba(15,23,42,0.09)', borderRadius: 9, fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'inline-block' },
  motivos: { marginTop: 12, padding: 12, borderRadius: 10, background: '#f2f5fa', border: '0.5px solid rgba(15,23,42,0.08)' },
  // 16/09 — faixa da linha pronta pro grupo do WhatsApp, depois de pré-aprovar
  avisoWrap: (ok) => ({ position: 'sticky', top: 0, zIndex: 20, marginBottom: 14, padding: 14, borderRadius: 12,
    background: ok ? 'rgba(52,211,153,.14)' : 'rgba(248,113,113,.14)',
    border: '1px solid ' + (ok ? '#34d399' : '#f87171') }),
  avisoTitulo: (ok) => ({ fontSize: 12, fontWeight: 600, color: ok ? '#065f46' : '#991b1b', marginBottom: 8 }),
  avisoLinha: { fontSize: 15, fontWeight: 600, color: '#0f172a', background: '#ffffff', padding: '10px 12px', borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.11)', wordBreak: 'break-word', lineHeight: 1.45 },
  avisoBotoes: { display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  avisoAlerta: { marginTop: 8, fontSize: 12, fontWeight: 600, color: '#b45309' },
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

// "13/09/2024, 20/04/2022" -> ['13/09/2024','20/04/2022']
const listaFilhos = (txt) => String(txt || '').split(',').map(x => x.trim()).filter(Boolean)

export default function MesaAdvogada() {
  const { profile } = useAuth()
  const [copiado, setCopiado] = useState('')
  const [fila, setFila] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('')
  const [soDetetive, setSoDetetive] = useState(false)   // 20/09 — filtro de origem
  const [abrindo, setAbrindo] = useState(null)   // { id, tipo: 'ok' | 'nao' }
  const [outroTexto, setOutroTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  // Print do GERID — obrigatorio SO na pre-aprovacao. Negar nao precisa.
  const [print, setPrint] = useState(null)          // { file, preview }
  const [subindoPrint, setSubindoPrint] = useState(false)
  // 16/09 (Bruno): depois de PRE-APROVAR, a advogada digitava a linha do grupo
  // do WhatsApp na mao. Em 16/09 isso ja produziu erro: o CPF 873.146.062-34 foi
  // gravado no sistema como "Dentro dos 12 meses" e foi pro grupo como "24 meses".
  // Agora a linha sai pronta daqui, com o CPF, a data e o prazo que FORAM GRAVADOS,
  // mais a vendedora que o rodizio sorteou (vem no retorno da advogada_decidir).
  const [aviso, setAviso] = useState(null)   // { texto, cliente }
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

    // Só na pré-aprovação: monta a linha do grupo do WhatsApp já pronta.
    // O prazo sai do PRÓPRIO motivo escolhido ("Dentro dos 12 meses" -> 12),
    // então o que vai pro grupo é sempre igual ao que ficou gravado no lead.
    // O \s*meses evita casar com o "120" de "por ter 120 contribuições".
    if (aprovado) {
      const m = /(\d+)\s*meses/.exec(motivo)
      const prazo = m ? `Dentro do prazo de ${m[1]} meses` : motivo.trim()
      const cpfTxt = lead.cpf || lead.cpf_limpo || 'SEM CPF'
      const dataTxt = lead.nasc_br || 'sem data'
      const vend = (r.data && r.data.vendedora) || null
      // 20/09 (Bruno): a linha do grupo e o UNICO caminho pelo qual a vendedora
      // fica sabendo dos filhos. Entao os filhos no prazo vao DENTRO dela, com
      // data e nome — nao adianta so avisar na tela, que a vendedora nao ve.
      const filhos = listaFilhos(lead.filhos_elegiveis)
      const rotulo = filhos.length > 1 ? 'Filhos no prazo' : 'Filho no prazo'
      const trechoFilhos = filhos.length ? ` - ${rotulo}: ${lead.filhos_elegiveis}` : ''
      setAviso({
        tipo: 'ok',
        cliente: lead.nome || 'cliente',
        semVendedora: !vend,
        texto: `${cpfTxt} - ${dataTxt} - ${prazo} - ${vend || 'SEM VENDEDORA DISPONÍVEL'}${trechoFilhos}`,
        // aviso extra na tela so quando ha mais de um: a linha ja leva a lista,
        // isto aqui e pra advogada nao passar batido no caso que rende mais.
        extraFilhos: filhos.length > 1 ? lead.filhos_elegiveis : null,
      })
    }

    // 16/09 (Bruno): negativa por salário maternidade já recebido também vai pro
    // grupo — é o caso em que o time precisa saber pra tirar a cliente da lista.
    // Os outros motivos de negativa encerram na mesa e não geram linha.
    if (!aprovado && motivo.trim() === 'Recebeu salário maternidade') {
      const cpfTxt = lead.cpf || lead.cpf_limpo || 'SEM CPF'
      const dataTxt = lead.nasc_br || 'sem data'
      setAviso({
        tipo: 'nao',
        cliente: lead.nome || 'cliente',
        semVendedora: false,
        texto: `${cpfTxt} - ${dataTxt} - Já recebeu o salário maternidade`,
        extraFilhos: null,
      })
    }
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
      .map(c => `${c.cpf_limpo}\t${c.nasc_br || 'sem data'}\t${c.nome || ''}\t${c.filhos_elegiveis || ''}`)
    if (!linhas.length) { alert('Nenhum CPF válido nessa fila.'); return }
    copiarCom('lote', 'CPF\tNascimento\tNome\tFilhos elegíveis\n' + linhas.join('\n'))
  }

  const contagem = fila.reduce((a, c) => { a[c.fila] = (a[c.fila] || 0) + 1; return a }, {})
  const nDetetive = fila.filter(c => c.do_detetive).length
  const visiveis = fila.filter(c => {
    if (filtro && c.fila !== filtro) return false
    if (soDetetive && !c.do_detetive) return false
    return true
  })
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
        {nDetetive > 0 && (
          <><br />🕵️ As <b>{nDetetive}</b> do Detetive vêm no topo: a data de nascimento delas foi lida no órgão, não estimada.</>
        )}
      </div>

      {aviso && (
        <div style={s.avisoWrap(aviso.tipo === 'ok')}>
          <div style={s.avisoTitulo(aviso.tipo === 'ok')}>
            {aviso.tipo === 'ok'
              ? `✅ Pré-aprovado · ${aviso.cliente} — manda essa linha no grupo:`
              : `⛔ Negado · já recebeu SM · ${aviso.cliente} — manda essa linha no grupo:`}
          </div>
          <div style={s.avisoLinha}>{aviso.texto}</div>
          {aviso.extraFilhos && (
            <div style={s.avisoAlerta}>
              👶 Mais de um filho no prazo — cada um é um pedido separado. Já vai na linha acima.
            </div>
          )}
          {aviso.semVendedora && (
            <div style={s.avisoAlerta}>
              ⚠️ O rodízio não achou vendedora disponível — o lead foi aprovado mas ficou sem dono. Avisa a supervisão.
            </div>
          )}
          <div style={s.avisoBotoes}>
            <button style={s.btnCopia(false)} onClick={() => copiarCom('grupo', aviso.texto)}>
              {copiado === 'grupo' ? '✅ copiado' : '📋 Copiar pro grupo'}
            </button>
            <button style={{ ...s.motivoBtn('#5b6b84'), width: 'auto', padding: '8px 14px' }} onClick={() => setAviso(null)}>
              fechar
            </button>
          </div>
        </div>
      )}

      <div style={s.chips}>
        <button style={s.chip('#0f172a', 'rgba(15,23,42,.04)', !filtro && !soDetetive)}
          onClick={() => { setFiltro(''); setSoDetetive(false) }}>
          Todas · {fila.length}
        </button>
        {nDetetive > 0 && (
          <button style={s.chip(DETETIVE_COR, DETETIVE_BG, soDetetive)}
            onClick={() => setSoDetetive(v => !v)}
            title="Leads que nasceram de uma consulta do robô Detetive — data lida no órgão">
            🕵️ Detetive · {nDetetive}
          </button>
        )}
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
          <span style={s.loteDica}>vem em 4 colunas: CPF · nascimento · nome · filhos elegíveis</span>
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
        const filhos = listaFilhos(c.filhos_elegiveis)
        const variosFilhos = filhos.length > 1
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

                  {/* 20/09 — filhos dentro do prazo de 5 anos. Só aparece quando existe. */}
                  {filhos.length > 0 && (
                    <div style={s.filhosBox(variosFilhos)}>
                      <div style={s.filhosTit}>
                        {variosFilhos ? `Filhos elegíveis · ${filhos.length}` : 'Filho elegível'}
                      </div>
                      <div style={s.filhosDatas}>{filhos.join(', ')}</div>
                      {variosFilhos && (
                        <div style={s.filhosNota}>
                          ⚠️ Mãe com mais de um filho elegível — conferir cada um.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div style={s.badges}>
                {c.do_detetive && (
                  <span style={s.badge(DETETIVE_COR, DETETIVE_BG)} title="data de nascimento lida no órgão">
                    🕵️ Detetive
                  </span>
                )}
                <span style={s.badge(f.cor, f.bg)}>{f.label}</span>
              </div>
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
