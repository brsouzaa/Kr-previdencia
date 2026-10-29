import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { cores, sombras, raio, fonte, carregarFonte } from '../lib/tema'

// ===== SETOR DE PROTOCOLO — FICHA DO CASO (28/10/2026, Bruno) =====
// A ficha e o lugar onde a Dra. Jessica protocola: tudo que ela precisa digitar
// no Meu INSS com botao de copiar, os documentos, o que conferir ANTES de
// protocolar, a opiniao da I.A e o chat com a assistente que defende a tese KR.
// Este arquivo tambem exporta o que a tela principal (Protocolo.js) reaproveita:
// etapas, modal de acao, upload, markdown.
//
// Regras que moram NO BANCO (nao aqui): imagem do INSS obrigatoria em deferido,
// indeferido, exigencia e resultado de recurso; gravacao no kr_resultado_inss;
// pendencia aberta pra vendedora. O front so pede os campos e mostra o erro.
//
// Rota propria: /protocolo/<cpf> (fora do Layout, igual a /ficha/<cpf>), pra abrir
// em aba nova. Na tela principal a mesma ficha abre numa gaveta lateral.

// ---------------------------------------------------------------- constantes
export const ETAPAS = [
  { key: 'aguardando_protocolo', label: 'Fila de protocolo', curto: 'Fila', cor: '#3b82f6', icone: '🗂️' },
  { key: 'pendencia_docs', label: 'Falta documento', curto: 'Falta doc', cor: '#d97706', icone: '📄' },
  { key: 'protocolado', label: 'Protocolado', curto: 'Protocolado', cor: '#8b5cf6', icone: '📨' },
  { key: 'exigencia', label: 'Exigência do INSS', curto: 'Exigência', cor: '#ea580c', icone: '⚠️' },
  { key: 'recurso', label: 'Em recurso', curto: 'Recurso', cor: '#0891b2', icone: '⚖️' },
  { key: 'deferido', label: 'Deferido', curto: 'Deferido', cor: '#16a34a', icone: '✅' },
  { key: 'recurso_deferido', label: 'Recurso deferido', curto: 'Rec. deferido', cor: '#15803d', icone: '🏆' },
  { key: 'indeferido', label: 'Indeferido', curto: 'Indeferido', cor: '#dc2626', icone: '⛔' },
  { key: 'recurso_indeferido', label: 'Recurso indeferido', curto: 'Rec. indeferido', cor: '#b91c1c', icone: '✖️' },
  { key: 'cancelado', label: 'Cancelado', curto: 'Cancelado', cor: '#64748b', icone: '🚫' },
]
export const etapaInfo = (k) => ETAPAS.find(e => e.key === k) || { key: k, label: k || '—', curto: k || '—', cor: '#64748b', icone: '•' }

export const MOTIVOS = [
  { v: 'qualidade_segurada', l: 'Falta de qualidade de segurada' },
  { v: 'carencia', l: 'Carência' },
  { v: 'ja_recebeu', l: 'Já recebeu' },
  { v: 'vinculo_ativo', l: 'Vínculo ativo / empregada no parto' },
  { v: 'contribuicao_atraso', l: 'Contribuição em atraso' },
  { v: 'baixa_renda', l: 'Baixa renda não validada' },
  { v: 'documentacao', l: 'Documentação' },
  { v: 'outro', l: 'Outro (escrever)' },
]

export const BUCKET = 'protocolo-inss'

// 29/10 (Bruno) — CATEGORIA DA PENDENCIA e as ALTERNATIVAS para resolver. A advogada escolhe
// a categoria ao abrir a pendencia; o time de Acompanhamento de clientes resolve escolhendo
// uma das alternativas (o banco valida o que cada uma exige: anexo, data ou explicacao).
// 'andamento' = fica aberta com data combinada; 'negativa' = volta para a advogada decidir.
export const CATEGORIAS_PEND = {
  complementacao_guia: {
    rot: 'Complementação de guia', icone: '🧾', cor: '#b45309',
    explica: 'A cliente precisa pagar a complementação da guia indicada pela advogada para a contribuição valer.',
    opcoes: [
      { v: 'pagou', rot: 'Cliente pagou', dica: 'Anexe a guia e o comprovante de pagamento.', anexo: true },
      { v: 'vai_pagar', rot: 'Vai pagar', dica: 'Combine com a cliente o dia em que ela vai pagar.', data: true, andamento: true },
      { v: 'nao_paga', rot: 'Não vai pagar', dica: 'Explique o motivo. A advogada decide o que fazer.', texto: true, negativa: true },
    ],
  },
  requerimento_aberto: {
    rot: 'Pedido anterior aberto no INSS', icone: '⏸️', cor: '#7c3aed',
    explica: 'A cliente já tem um pedido em andamento no INSS. Enquanto ele estiver aberto, não dá para protocolar outro.',
    opcoes: [
      { v: 'desistiu', rot: 'Cliente desistiu do pedido', dica: 'Anexe o print da desistência/cancelamento no Meu INSS.', anexo: true },
      { v: 'aguardar', rot: 'Aguardar terminar', dica: 'Informe a data prevista para o pedido anterior terminar.', data: true, andamento: true },
      { v: 'nao_desiste', rot: 'Não quer desistir', dica: 'Explique. A advogada decide o que fazer.', texto: true, negativa: true },
    ],
  },
  documento: {
    rot: 'Documento faltando', icone: '📄', cor: '#d97706',
    explica: 'Falta documento para a advogada protocolar.',
    opcoes: [
      { v: 'enviou', rot: 'Consegui o documento', dica: 'Anexe o documento (foto ou PDF).', anexo: true },
      { v: 'em_andamento', rot: 'Cliente vai mandar', dica: 'Informe até quando a cliente vai mandar.', data: true, andamento: true },
      { v: 'nao_tem', rot: 'Cliente não tem', dica: 'Explique. A advogada decide o que fazer.', texto: true, negativa: true },
    ],
  },
  exigencia_inss: {
    rot: 'Exigência do INSS', icone: '⚠️', cor: '#ea580c',
    explica: 'O INSS pediu documentos para continuar a análise. Atenção ao prazo.',
    opcoes: [
      { v: 'cumprida', rot: 'Consegui tudo que o INSS pediu', dica: 'Anexe os documentos pedidos.', anexo: true },
      { v: 'em_andamento', rot: 'Cliente vai mandar', dica: 'Informe até quando (antes do prazo do INSS).', data: true, andamento: true },
      { v: 'nao_consegue', rot: 'Não dá para cumprir', dica: 'Explique. A advogada decide o que fazer.', texto: true, negativa: true },
    ],
  },
  dado_divergente: {
    rot: 'Dado divergente', icone: '🔀', cor: '#0891b2', explica: 'Algum dado da cliente não bate e precisa ser corrigido.',
    opcoes: [
      { v: 'resolvido', rot: 'Resolvido', dica: 'Explique o que foi corrigido (anexo opcional).', texto: true, anexoOpcional: true },
      { v: 'em_andamento', rot: 'Em andamento', dica: 'Informe até quando.', data: true, andamento: true },
    ],
  },
  outro: {
    rot: 'Outro', icone: '📌', cor: '#475569', explica: '',
    opcoes: [
      { v: 'resolvido', rot: 'Resolvido', dica: 'Explique o que foi feito (anexo opcional).', texto: true, anexoOpcional: true },
      { v: 'em_andamento', rot: 'Em andamento', dica: 'Informe até quando.', data: true, andamento: true },
    ],
  },
}
export const catPend = (k) => CATEGORIAS_PEND[k] || CATEGORIAS_PEND.outro
export const rotResolucao = (cat, v) => (catPend(cat).opcoes.find(o => o.v === v) || Object.values(CATEGORIAS_PEND).flatMap(c => c.opcoes).find(o => o.v === v) || { rot: v }).rot
export const RESOLUCOES_NEGATIVAS = ['nao_paga', 'nao_desiste', 'nao_tem', 'nao_consegue']
const OPCOES_CATEGORIA = [
  { v: 'documento', l: 'Documento faltando' },
  { v: 'complementacao_guia', l: 'Complementação de guia' },
  { v: 'requerimento_aberto', l: 'Pedido anterior aberto no INSS' },
]

// ---------------------------------------------------------------- helpers
export const soDig = (s) => String(s ?? '').replace(/\D/g, '')
export const fmtCpf = (s) => {
  const d = soDig(s)
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : (s || '—')
}
export const fmtTel = (s) => {
  let d = soDig(s)
  if (d.startsWith('55') && d.length > 11) d = d.slice(2)
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return s || '—'
}
// data pura AAAA-MM-DD nao passa por Date (evita cair um dia pra tras no fuso)
export const fmtData = (v) => {
  if (!v) return '—'
  const s = String(v)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s
  try { return new Date(s).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) } catch (_) { return s }
}
export const fmtDataHora = (v) => {
  if (!v) return '—'
  try {
    return new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch (_) { return String(v) }
}
export const diaBR = (v) => {
  if (!v) return null
  try { return new Date(v).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) } catch (_) { return null }
}
export const hojeISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
export const diasDesde = (v) => {
  if (!v) return null
  const a = new Date(diaBR(v) + 'T00:00:00')
  const b = new Date(hojeISO() + 'T00:00:00')
  return Math.max(0, Math.round((b - a) / 86400000))
}
const somaDias = (iso, n) => {
  const d = new Date((iso || hojeISO()) + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
export const iniciais = (nome) => {
  const p = String(nome || '?').trim().split(/\s+/)
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?'
}

export function useIsMobile() {
  const [m, setM] = useState(typeof window !== 'undefined' ? window.innerWidth < 860 : false)
  useEffect(() => {
    const f = () => setM(window.innerWidth < 860)
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])
  return m
}

export function useToast() {
  const [msg, setMsg] = useState(null)
  const t = useRef(null)
  const mostrar = useCallback((texto, tipo = 'ok') => {
    setMsg({ texto, tipo })
    clearTimeout(t.current)
    t.current = setTimeout(() => setMsg(null), 2600)
  }, [])
  const node = msg ? (
    <div role="status" style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 3000,
      background: msg.tipo === 'erro' ? '#7f1d1d' : '#0f172a', color: '#fff', padding: '10px 18px',
      borderRadius: 12, fontSize: 13.5, fontWeight: 600, boxShadow: '0 12px 32px rgba(15,23,42,.35)', maxWidth: '90vw',
    }}>{msg.texto}</div>
  ) : null
  return [node, mostrar]
}

export async function copiarTexto(texto) {
  try { await navigator.clipboard.writeText(texto); return true } catch (_) {
    try {
      const ta = document.createElement('textarea')
      ta.value = texto; document.body.appendChild(ta); ta.select()
      const ok = document.execCommand('copy'); document.body.removeChild(ta); return ok
    } catch (_e) { return false }
  }
}

// anexo do setor fica em bucket PRIVADO: guarda o caminho e abre com URL assinada
export async function abrirArquivo(caminho) {
  if (!caminho) return
  if (/^https?:\/\//i.test(caminho)) { window.open(caminho, '_blank', 'noopener'); return }
  const w = window.open('', '_blank')
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(caminho, 900)
  if (error || !data?.signedUrl) { if (w) w.close(); alert('Não consegui abrir o arquivo: ' + (error?.message || 'sem link')); return }
  if (w) w.location.href = data.signedUrl; else window.open(data.signedUrl, '_blank')
}

export async function enviarArquivo(arquivo, cpf) {
  const ext = (arquivo.name?.split('.').pop() || (arquivo.type === 'application/pdf' ? 'pdf' : 'jpg')).toLowerCase().replace(/[^a-z0-9]/g, '')
  const caminho = `${soDig(cpf) || 'sem-cpf'}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext || 'bin'}`
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, arquivo, { contentType: arquivo.type || undefined, upsert: false })
  if (error) throw new Error(error.message)
  return caminho
}

const paraBase64 = (arquivo) => new Promise((ok, erro) => {
  const r = new FileReader()
  r.onload = () => ok(String(r.result).replace(/^data:[^,]+,/, ''))
  r.onerror = () => erro(r.error)
  r.readAsDataURL(arquivo)
})

// ---------------------------------------------------------------- markdown simples
function inline(txt, k) {
  const partes = String(txt).split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return partes.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={k + '-' + i}>{p.slice(2, -2)}</strong>
    if (/^`[^`]+`$/.test(p)) return <code key={k + '-' + i} style={{ background: 'rgba(15,23,42,.06)', borderRadius: 4, padding: '0 4px', fontSize: '0.92em' }}>{p.slice(1, -1)}</code>
    return <span key={k + '-' + i}>{p}</span>
  })
}
export function Markdown({ texto }) {
  const linhas = String(texto || '').replace(/\r/g, '').split('\n')
  const out = []
  let i = 0
  while (i < linhas.length) {
    const l = linhas[i]
    if (/^\s*\|.*\|\s*$/.test(l)) {
      const tab = []
      while (i < linhas.length && /^\s*\|.*\|\s*$/.test(linhas[i])) { tab.push(linhas[i]); i++ }
      const rows = tab.filter(r => !/^\s*\|[\s:|-]+\|\s*$/.test(r)).map(r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()))
      out.push(
        <div key={'t' + i} style={{ overflowX: 'auto', margin: '6px 0' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12.5, minWidth: '100%' }}>
            <tbody>{rows.map((r, ri) => (
              <tr key={ri}>{r.map((c, ci) => (
                <td key={ci} style={{ border: `1px solid ${cores.cardBorda}`, padding: '4px 8px', fontWeight: ri === 0 ? 700 : 400, background: ri === 0 ? 'rgba(15,23,42,.03)' : 'transparent' }}>{inline(c, ri + '-' + ci)}</td>
              ))}</tr>
            ))}</tbody>
          </table>
        </div>
      )
      continue
    }
    if (/^\s*[-*•]\s+/.test(l) || /^\s*\d+[.)]\s+/.test(l)) {
      const itens = []
      const ordenada = /^\s*\d+[.)]\s+/.test(l)
      while (i < linhas.length && (/^\s*[-*•]\s+/.test(linhas[i]) || /^\s*\d+[.)]\s+/.test(linhas[i]))) {
        itens.push(linhas[i].replace(/^\s*([-*•]|\d+[.)])\s+/, '')); i++
      }
      const Tag = ordenada ? 'ol' : 'ul'
      out.push(<Tag key={'l' + i} style={{ margin: '4px 0 8px', paddingLeft: 20 }}>{itens.map((it, j) => <li key={j} style={{ margin: '2px 0' }}>{inline(it, 'li' + i + j)}</li>)}</Tag>)
      continue
    }
    const h = l.match(/^(#{1,4})\s+(.*)$/)
    if (h) { out.push(<div key={'h' + i} style={{ fontWeight: 800, fontSize: h[1].length <= 2 ? 15 : 13.5, margin: '10px 0 4px', color: cores.texto }}>{inline(h[2], 'h' + i)}</div>); i++; continue }
    if (/^\s*-{3,}\s*$/.test(l)) { out.push(<hr key={'r' + i} style={{ border: 0, borderTop: `1px solid ${cores.cardBorda}`, margin: '8px 0' }} />); i++; continue }
    if (!l.trim()) { out.push(<div key={'e' + i} style={{ height: 6 }} />); i++; continue }
    out.push(<p key={'p' + i} style={{ margin: '2px 0' }}>{inline(l, 'p' + i)}</p>)
    i++
  }
  return <div style={{ fontSize: 13.5, lineHeight: 1.55, color: cores.texto, overflowWrap: 'anywhere' }}>{out}</div>
}

// ---------------------------------------------------------------- pecas visuais
export const Chip = ({ cor = cores.suave, fundo, children, titulo, forte }) => (
  <span title={titulo} style={{
    display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: forte ? 800 : 600,
    color: cor, background: fundo || hexA(cor, 0.1), border: `1px solid ${hexA(cor, 0.22)}`,
    borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap', letterSpacing: forte ? '.02em' : 0,
  }}>{children}</span>
)
export function hexA(hex, a) {
  const h = String(hex || '#64748b').replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}
const btn = (cor = cores.azul, cheio = true) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 10, fontSize: 13,
  fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  border: cheio ? 'none' : `1px solid ${hexA(cor, 0.35)}`,
  background: cheio ? cor : '#fff', color: cheio ? '#fff' : cor,
  boxShadow: cheio ? `0 4px 14px ${hexA(cor, 0.28)}` : 'none',
})
export const estiloBotao = btn
const card = { background: cores.card, border: `1px solid ${cores.cardBorda}`, borderRadius: raio.card, boxShadow: sombras.card }
export const estiloCard = card
const tituloSecao = { fontSize: 11.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: cores.suave, margin: '0 0 10px' }

// ---------------------------------------------------------------- acoes
export const ACOES = {
  protocolado: {
    titulo: 'Marcar como protocolado', icone: '📨', cor: '#8b5cf6',
    anexo: 'Termo / comprovante do protocolo', anexoObrig: true,
    campos: [
      { k: 'numero', l: 'Número do protocolo', obrig: true, tipo: 'text', ph: 'Ex.: 1234567890' },
      { k: 'data', l: 'Data do protocolo', obrig: true, tipo: 'date', hoje: true },
      { k: 'texto', l: 'Observação (opcional)', tipo: 'textarea' },
    ],
  },
  falta_documento: {
    titulo: 'Falta documento', icone: '📄', cor: '#d97706',
    nota: 'Abre uma pendência para o time de Acompanhamento de clientes resolver. Quando todas forem resolvidas, o caso volta sozinho para a fila e aparece em "Resolvidas · refazer".',
    campos: [
      { k: 'subtipo', l: 'Categoria', obrig: true, tipo: 'select', padrao: 'documento', opcoes: OPCOES_CATEGORIA },
      { k: 'texto', l: 'O que falta / o que a cliente precisa fazer?', obrig: true, tipo: 'textarea', sugestoes: ['Complementar a guia de MM/AAAA', 'Desistir do pedido anterior no Meu INSS', 'CNIS completo com data de pagamento', 'Extrato do FGTS em PDF', 'Certidão de nascimento legível', 'RG frente e verso', 'Print do seguro-desemprego', 'Comprovante de endereço'] },
      { k: 'prazo', l: 'Prazo para resolver (opcional)', tipo: 'date' },
    ],
  },
  exigencia: {
    titulo: 'Exigência do INSS', icone: '⚠️', cor: '#ea580c',
    anexo: 'Imagem da resposta do INSS', anexoObrig: true,
    nota: 'Abre pendência para a vendedora e grava a exigência na base de resultados do INSS.',
    campos: [
      { k: 'texto', l: 'O que o INSS pediu?', obrig: true, tipo: 'textarea' },
      { k: 'data', l: 'Data da exigência', tipo: 'date', hoje: true },
      { k: 'prazo', l: 'Prazo para cumprir', tipo: 'date', mais30: true },
    ],
  },
  deferido: {
    titulo: 'Deferido pelo INSS', icone: '✅', cor: '#16a34a',
    anexo: 'Imagem da resposta do INSS', anexoObrig: true,
    campos: [
      { k: 'data', l: 'Data do deferimento', obrig: true, tipo: 'date', hoje: true },
      { k: 'nb', l: 'Número do benefício (NB) — opcional', tipo: 'text' },
      { k: 'data_cai_conta', l: 'Data em que cai na conta — opcional', tipo: 'date' },
      { k: 'texto', l: 'Observação (opcional)', tipo: 'textarea' },
    ],
  },
  indeferido: {
    titulo: 'Indeferido pelo INSS', icone: '⛔', cor: '#dc2626',
    anexo: 'Imagem da resposta do INSS', anexoObrig: true,
    campos: [
      { k: 'data', l: 'Data do indeferimento', obrig: true, tipo: 'date', hoje: true },
      { k: 'motivo_codigo', l: 'Motivo', obrig: true, tipo: 'select', opcoes: MOTIVOS },
      { k: 'motivo_texto', l: 'Detalhe do motivo', tipo: 'textarea', obrigSe: (v) => v.motivo_codigo === 'outro' },
    ],
  },
  recurso: {
    titulo: 'Entrar com recurso', icone: '⚖️', cor: '#0891b2',
    campos: [
      { k: 'data', l: 'Data do recurso', obrig: true, tipo: 'date', hoje: true },
      { k: 'texto', l: 'Observação', tipo: 'textarea' },
    ],
  },
  recurso_resultado: {
    titulo: 'Resultado do recurso', icone: '🏛️', cor: '#0f766e',
    anexo: 'Imagem da resposta do INSS', anexoObrig: true,
    campos: [
      { k: 'resultado', l: 'Resultado', obrig: true, tipo: 'select', opcoes: [{ v: 'recurso_deferido', l: 'Recurso deferido' }, { v: 'recurso_indeferido', l: 'Recurso indeferido' }] },
      { k: 'data', l: 'Data', obrig: true, tipo: 'date', hoje: true },
      { k: 'motivo_codigo', l: 'Motivo (se indeferido)', tipo: 'select', opcoes: MOTIVOS, obrigSe: (v) => v.resultado === 'recurso_indeferido' },
      { k: 'motivo_texto', l: 'Detalhe do motivo', tipo: 'textarea', obrigSe: (v) => v.motivo_codigo === 'outro' },
      { k: 'nb', l: 'NB (se deferido) — opcional', tipo: 'text' },
    ],
  },
  observacao: {
    titulo: 'Observação', icone: '💬', cor: '#475569', anexo: 'Anexo (opcional)',
    campos: [{ k: 'texto', l: 'Observação', obrig: true, tipo: 'textarea' }],
  },
  pendencia: {
    titulo: 'Abrir pendência', icone: '📌', cor: '#b45309',
    nota: 'A pendência vai para o time de Acompanhamento de clientes resolver. Quando resolverem, o caso aparece na aba "Resolvidas · refazer".',
    // o banco guarda tipo (4 valores) + categoria (subtipo): traduz aqui
    mapear: (p) => ({ tipo: ['dado_divergente', 'outro'].includes(p.subtipo) ? p.subtipo : 'documento' }),
    campos: [
      { k: 'subtipo', l: 'Categoria', obrig: true, tipo: 'select', padrao: 'outro', opcoes: [...OPCOES_CATEGORIA, { v: 'dado_divergente', l: 'Dado divergente' }, { v: 'outro', l: 'Outro' }] },
      { k: 'texto', l: 'O que precisa ser resolvido?', obrig: true, tipo: 'textarea' },
      { k: 'prazo', l: 'Prazo (opcional)', tipo: 'date' },
    ],
  },
  voltar_fila: {
    titulo: 'Voltar para a fila de protocolo', icone: '↩️', cor: '#3b82f6',
    campos: [{ k: 'texto', l: 'Observação (opcional)', tipo: 'textarea' }],
  },
  cancelar: {
    titulo: 'Cancelar caso', icone: '🚫', cor: '#64748b',
    campos: [{ k: 'texto', l: 'Motivo do cancelamento', obrig: true, tipo: 'textarea' }],
  },
}

// o que faz sentido em cada etapa (primeiro = sugestao principal)
export const ACOES_POR_ETAPA = {
  aguardando_protocolo: ['protocolado', 'falta_documento', 'observacao', 'pendencia', 'cancelar'],
  pendencia_docs: ['voltar_fila', 'protocolado', 'falta_documento', 'observacao'],
  protocolado: ['deferido', 'indeferido', 'exigencia', 'observacao'],
  exigencia: ['deferido', 'indeferido', 'exigencia', 'observacao'],
  indeferido: ['recurso', 'observacao'],
  recurso: ['recurso_resultado', 'observacao'],
  deferido: ['observacao'],
  recurso_deferido: ['observacao'],
  recurso_indeferido: ['observacao'],
  cancelado: ['voltar_fila', 'observacao'],
}

export function ModalAcao({ caso, acao, inicial, onClose, onFeito }) {
  const cfg = ACOES[acao]
  const isMobile = useIsMobile()
  const [v, setV] = useState(() => {
    const o = {}
    ;(cfg?.campos || []).forEach(c => {
      if (c.hoje) o[c.k] = hojeISO()
      if (c.mais30) o[c.k] = somaDias(hojeISO(), 30)
      if (c.padrao) o[c.k] = c.padrao
    })
    return { ...o, ...(inicial || {}) }
  })
  const [arquivo, setArquivo] = useState(null)
  const [previa, setPrevia] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [arrastando, setArrastando] = useState(false)
  const inputRef = useRef(null)

  const pegarArquivo = useCallback((f) => {
    if (!f) return
    if (!/^image\//.test(f.type) && f.type !== 'application/pdf') { setErro('Envie imagem ou PDF.'); return }
    if (f.size > 15 * 1024 * 1024) { setErro('Arquivo maior que 15 MB.'); return }
    setErro(''); setArquivo(f)
    setPrevia(/^image\/(png|jpe?g|webp|gif)$/.test(f.type) ? URL.createObjectURL(f) : null)
  }, [])

  // colar print (Ctrl+V) direto no modal
  useEffect(() => {
    if (!cfg?.anexo) return
    const f = (e) => {
      const it = [...(e.clipboardData?.items || [])].find(x => x.kind === 'file')
      if (it) pegarArquivo(it.getAsFile())
    }
    window.addEventListener('paste', f)
    return () => window.removeEventListener('paste', f)
  }, [cfg, pegarArquivo])

  // mudou o dia da exigencia: o prazo acompanha (+30)
  useEffect(() => {
    if (acao === 'exigencia' && v.data) setV(o => (o._prazoMexido ? o : { ...o, prazo: somaDias(o.data, 30) }))
  }, [v.data, acao])

  if (!cfg) return null
  const faltando = (cfg.campos || []).filter(c => (c.obrig || (c.obrigSe && c.obrigSe(v))) && !String(v[c.k] ?? '').trim()).map(c => c.l)
  if (cfg.anexoObrig && !arquivo) faltando.unshift(cfg.anexo)
  const pode = faltando.length === 0 && !salvando

  async function salvar() {
    if (!pode) return
    setSalvando(true); setErro('')
    try {
      const p = {}
      Object.entries(v).forEach(([k, val]) => { if (!k.startsWith('_') && val !== '' && val != null) p[k] = val })
      if (cfg.mapear) Object.assign(p, cfg.mapear(p))
      if (arquivo) p.anexo = await enviarArquivo(arquivo, caso.cpf)
      const { data, error } = await supabase.rpc('protocolo_acao', { p_caso: caso.id, p_acao: acao, p })
      if (error) throw new Error(error.message)
      if (!data?.ok) throw new Error(data?.erro || 'não salvou')
      onFeito && onFeito(data)
    } catch (e) {
      setErro(String(e.message || e))
      setSalvando(false)
    }
  }

  const campo = (c) => {
    const st = { width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${hexA('#0f172a', 0.14)}`, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' }
    const obrig = c.obrig || (c.obrigSe && c.obrigSe(v))
    return (
      <label key={c.k} style={{ display: 'block' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: cores.suave, margin: '0 0 5px' }}>{c.l}{obrig && <span style={{ color: cores.perigo }}> *</span>}</div>
        {c.tipo === 'textarea' ? (
          <textarea value={v[c.k] || ''} onChange={e => setV({ ...v, [c.k]: e.target.value })} rows={3} placeholder={c.ph} style={{ ...st, resize: 'vertical' }} />
        ) : c.tipo === 'select' ? (
          <select value={v[c.k] || ''} onChange={e => setV({ ...v, [c.k]: e.target.value })} style={st}>
            <option value="">Escolha…</option>
            {c.opcoes.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        ) : (
          <input type={c.tipo === 'date' ? 'date' : 'text'} value={v[c.k] || ''} placeholder={c.ph}
            onChange={e => setV({ ...v, [c.k]: e.target.value, ...(c.k === 'prazo' ? { _prazoMexido: true } : {}) })} style={st} />
        )}
        {c.sugestoes && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {c.sugestoes.map(s => (
              <button key={s} type="button" onClick={() => setV({ ...v, [c.k]: v[c.k] ? v[c.k] + '; ' + s : s })}
                style={{ fontSize: 11.5, padding: '4px 9px', borderRadius: 999, border: `1px solid ${cores.cardBorda}`, background: cores.chipBg, cursor: 'pointer', fontFamily: 'inherit', color: cores.texto }}>+ {s}</button>
            ))}
          </div>
        )}
      </label>
    )
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', backdropFilter: 'blur(3px)', zIndex: 2000, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 20 }}>
      <div onClick={e => e.stopPropagation()} style={{
        ...card, width: '100%', maxWidth: 560, maxHeight: isMobile ? '92vh' : '88vh', overflow: 'auto',
        borderRadius: isMobile ? '20px 20px 0 0' : 20, padding: 0,
      }}>
        <div style={{ padding: '18px 20px 14px', borderBottom: `1px solid ${cores.cardBorda}`, display: 'flex', gap: 12, alignItems: 'center', background: `linear-gradient(135deg, ${hexA(cfg.cor, 0.10)}, transparent)` }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: hexA(cfg.cor, 0.15), display: 'grid', placeItems: 'center', fontSize: 20 }}>{cfg.icone}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 16.5, fontWeight: 800, color: cores.texto }}>{cfg.titulo}</div>
            <div style={{ fontSize: 12.5, color: cores.suave, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{caso.nome} · {fmtCpf(caso.cpf)}</div>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: cores.suave }}>✕</button>
        </div>
        <div style={{ padding: 20, display: 'grid', gap: 14 }}>
          {cfg.nota && <div style={{ fontSize: 12.5, color: cores.suave, background: cores.chipBg, borderRadius: 10, padding: '8px 12px' }}>{cfg.nota}</div>}
          {cfg.anexo && (
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: cores.suave, margin: '0 0 5px' }}>{cfg.anexo}{cfg.anexoObrig && <span style={{ color: cores.perigo }}> *</span>}</div>
              <div
                onClick={() => inputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setArrastando(true) }}
                onDragLeave={() => setArrastando(false)}
                onDrop={e => { e.preventDefault(); setArrastando(false); pegarArquivo(e.dataTransfer.files?.[0]) }}
                style={{
                  border: `2px dashed ${arrastando ? cfg.cor : hexA('#0f172a', 0.18)}`, borderRadius: 14, padding: 16,
                  background: arrastando ? hexA(cfg.cor, 0.06) : '#fafbfd', cursor: 'pointer', textAlign: 'center',
                  transition: 'all .15s',
                }}>
                {arquivo ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {previa ? <img src={previa} alt="prévia" style={{ maxHeight: 120, maxWidth: '100%', borderRadius: 8, boxShadow: sombras.card }} />
                      : <div style={{ fontSize: 34 }}>📄</div>}
                    <div style={{ textAlign: 'left', minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, overflowWrap: 'anywhere' }}>{arquivo.name || 'imagem colada'}</div>
                      <div style={{ fontSize: 12, color: cores.suave }}>{(arquivo.size / 1024).toFixed(0)} KB · clique para trocar</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ color: cores.suave, fontSize: 13 }}>
                    <div style={{ fontSize: 26, marginBottom: 4 }}>⬆️</div>
                    <b style={{ color: cores.texto }}>Arraste aqui, clique para escolher</b><br />ou cole o print com <b>Ctrl+V</b> · imagem ou PDF
                  </div>
                )}
                <input ref={inputRef} type="file" accept="image/*,application/pdf" capture={undefined} style={{ display: 'none' }} onChange={e => pegarArquivo(e.target.files?.[0])} />
              </div>
            </div>
          )}
          {(cfg.campos || []).map(campo)}
          {erro && <div style={{ color: cores.perigo, background: hexA(cores.perigo, 0.08), borderRadius: 10, padding: '9px 12px', fontSize: 13, fontWeight: 600 }}>{erro}</div>}
          {!pode && !salvando && faltando.length > 0 && (
            <div style={{ fontSize: 12, color: cores.suave }}>Falta: {faltando.join(' · ')}</div>
          )}
        </div>
        <div style={{ padding: '14px 20px 20px', display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: `1px solid ${cores.cardBorda}`, position: 'sticky', bottom: 0, background: '#fff' }}>
          <button onClick={onClose} style={btn('#475569', false)}>Cancelar</button>
          <button onClick={salvar} disabled={!pode} style={{ ...btn(cfg.cor), opacity: pode ? 1 : 0.45, cursor: pode ? 'pointer' : 'not-allowed' }}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- contexto pra I.A
const CTX_INI = '⟦CTX-PROTOCOLO⟧'
const CTX_FIM = '⟦/CTX-PROTOCOLO⟧'
const MARCA_PARECER = '⟦PARECER-PROTOCOLO⟧'
const limparPergunta = (t) => String(t || '').replace(new RegExp(CTX_INI + '[\\s\\S]*?' + CTX_FIM, 'g'), '').replace(/^\[Contexto:[^\]]*\]\s*/, '').trim()

function montarContexto(caso) {
  const f = caso.ficha_snapshot || {}
  const L = []
  L.push('Você está no SETOR DE PROTOCOLO da KR Previdência, como assistente da advogada que vai protocolar o salário-maternidade no INSS.')
  L.push('Defenda a tese KR quando houver fundamento, aponte riscos com franqueza e seja prático (o que fazer agora).')
  L.push(`Cliente: ${caso.nome || f.nome || '—'} · CPF ${fmtCpf(caso.cpf)}`)
  L.push(`Filho(a): ${caso.filho_nome || f.filho_nome || '—'} · nascimento ${fmtData(caso.filho_dn || f.filho_dn)}`)
  L.push(`Perfil: ${caso.perfil_label || f.perfil_label || '—'}`)
  if (f.base_direito) L.push(`Base do direito: ${f.base_direito}`)
  if (f.ultima_contribuicao) L.push(`Última contribuição/saída: ${f.ultima_contribuicao}`)
  L.push(`Etapa no setor: ${etapaInfo(caso.etapa).label}` + (caso.numero_protocolo ? ` · protocolo ${caso.numero_protocolo} em ${fmtData(caso.data_protocolo)}` : ''))
  if (caso.exigencia_texto) L.push(`Exigência do INSS: ${caso.exigencia_texto} (prazo ${fmtData(caso.exigencia_prazo)})`)
  if (caso.motivo_codigo) L.push(`Indeferimento: ${caso.motivo_label || caso.motivo_codigo}${caso.motivo_texto ? ' — ' + caso.motivo_texto : ''}`)
  if (caso.sem_validacao_ia) L.push('ATENÇÃO: este contrato foi assinado SEM validação aprovada da I.A.')
  if (f.resumo_ia) L.push(`Validação da I.A (${f.validacao?.resultado || '—'}): ${f.resumo_ia}`)
  const al = Array.isArray(f.alertas) ? f.alertas : []
  if (al.length) L.push('Alertas para a advogada:\n- ' + al.join('\n- '))
  if (f.liberacao?.motivo) L.push(`Liberação manual (ressalva): ${f.liberacao.motivo}`)
  if (f.excecao) L.push(`Exceção: ${[f.excecao.por_que_liberou, f.excecao.ressalva, f.excecao.risco].filter(Boolean).join(' | ')}`)
  const docs = Array.isArray(f.documentos) ? f.documentos.map(d => d.rotulo) : []
  if (docs.length) L.push('Documentos anexados: ' + [...new Set(docs)].join(', '))
  return `${CTX_INI}\n${L.join('\n').slice(0, 7000)}\n${CTX_FIM}\n`
}

const PROMPT_PARECER = `${MARCA_PARECER} Faça o PARECER PRÉ-PROTOCOLO deste caso para a advogada, em markdown curto:
1. **Veredito**: força do caso (forte / médio / fraco) e por quê, com a conta das datas (última contribuição → até quando vai a qualidade de segurada → nascimento).
2. **Conferir antes de protocolar**: checklist objetivo.
3. **Riscos de indeferimento** e como prevenir cada um.
4. **Documentos**: o que já tem e o que falta.
5. **Texto sugerido** para o campo de observações do requerimento no Meu INSS (curto).`

const ATALHOS = [
  { r: 'Parecer', t: 'Refaça o parecer pré-protocolo deste caso considerando tudo o que já foi registrado.' },
  { r: 'Requerimento', t: 'Redija o texto do requerimento/observações para eu colar no Meu INSS, defendendo a tese da KR.' },
  { r: 'Analisar resposta do INSS', t: 'Analise a resposta do INSS que vou anexar: o INSS acertou ou errou? O que eu faço agora?' },
  { r: 'Cumprir exigência', t: 'Como cumprir a exigência do INSS deste caso? Liste documentos e redija o texto da resposta.' },
  { r: 'Montar recurso', t: 'Monte o recurso administrativo completo deste caso, pronto para revisar.' },
  { r: 'Risco do caso', t: 'Qual o maior risco deste caso e como eu me protejo antes de protocolar?' },
]

export async function perguntarIA({ caso, historico, texto, anexos }) {
  // a API exige comecar pelo usuario e alternar os papeis: limpa o historico antes de mandar
  const msgs = []
  historico.filter(m => !m.erro && m.texto).slice(-10).forEach(m => {
    const role = m.role === 'assistant' ? 'assistant' : 'user'
    if (!msgs.length && role === 'assistant') return
    if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].texto += '\n\n' + m.texto
    else msgs.push({ role, texto: m.texto })
  })
  if (msgs.length && msgs[msgs.length - 1].role === 'user') msgs.pop()
  msgs.push({ role: 'user', texto: montarContexto(caso) + texto })
  const { data, error } = await supabase.functions.invoke('ia-previdenciario', {
    body: { mensagens: msgs, cpf: caso.cpf, anexos: anexos || [], conversa_id: 'protocolo-' + caso.cpf },
  })
  if (error) {
    let det = error.message
    try { const b = await error.context?.json?.(); if (b?.erro) det = b.erro } catch (_) { /* ignora */ }
    throw new Error(det)
  }
  if (data?.erro) throw new Error(data.erro)
  return data?.resposta || ''
}

// ---------------------------------------------------------------- ficha
const ICONE_EVENTO = {
  entrada: '📥', protocolado: '📨', exigencia: '⚠️', deferido: '✅', indeferido: '⛔', recurso: '⚖️',
  recurso_deferido: '🏆', recurso_indeferido: '✖️', pendencia_aberta: '📌', pendencia_resolvida: '✔️',
  responsavel_avisado: '📣', observacao: '💬', mudanca_etapa: '🔀',
}

// 29/10/2026 (Bruno) — CEP DE SUGESTAO DO BANCO NO PROTOCOLO. No GERID o INSS pergunta o banco
// de preferencia e o CEP e a SUGESTAO (o INSS decide). Quem paga o beneficio novo e o banco 1o
// colocado do LOTE da regiao no leilao do INSS (Pregao 90005/2024). Sem a Crefisa (suspensa em
// ago/2025) o Mercantil e o 1o em 14 dos 26 lotes. O banco (protocolo_cep_mercantil) devolve o
// lote da cliente e ate 4 pontos fisicos do Mercantil em regiao onde ele e o 1o: mesma cidade >
// mesma regiao do INSS > cidade vizinha (SP capital, por zona do CEP) > outra regiao do Mercantil
// na UF — fora da cidade dela, so cidade vizinha (raio em app_config cep_sugestao_raio_km).
// O ENDERECO DA CLIENTE NAO MUDA: este CEP vai so no campo do banco de preferencia.
function CepMercantil({ cpf, copiar }) {
  const [r, setR] = useState(null)
  const [verTodos, setVerTodos] = useState(false)
  useEffect(() => {
    let vivo = true
    supabase.rpc('protocolo_cep_mercantil', { p_cpf: soDig(cpf) })
      .then(({ data, error }) => { if (vivo) setR(error ? { ok: false, erro: error.message } : (data || { ok: false })) })
    return () => { vivo = false }
  }, [cpf])
  if (!r || !r.ok) return null
  const pts = Array.isArray(r.pontos) ? r.pontos : []
  const AZ = '#1d4ed8'
  const cidade = `${r.cidade || '?'}${r.uf ? '/' + r.uf : ''}`
  const banco = String(r.banco_1o || '').replace(/^Banco\s+/i, '').replace(/\s+(S\.?A\.?|SA)$/i, '')
  const merc = r.mercantil_primeiro === true
  const linha = (p, i, destaque) => (
    <div key={p.cep + i} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: destaque ? '12px 14px' : '8px 12px', borderRadius: 12, background: destaque ? '#fff' : 'transparent', border: `1px solid ${destaque ? hexA(AZ, 0.35) : cores.cardBorda}` }}>
      <div style={{ fontFamily: fonte.mono, fontSize: destaque ? 22 : 15, fontWeight: 800, color: AZ, letterSpacing: '.02em' }}>{p.cep}</div>
      <div style={{ flex: '1 1 200px', minWidth: 0, fontSize: 12.5, color: cores.texto }}>
        <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{p.municipio}/{p.uf} · {p.endereco || p.nome}</div>
        <div style={{ color: cores.suave }}>{[p.bairro, p.motivo].filter(Boolean).join(' · ')}</div>
        {p.alerta && <div style={{ color: '#b45309', fontWeight: 700, marginTop: 2 }}>⚠️ {p.alerta}</div>}
      </div>
      <button onClick={() => copiar('CEP', soDig(p.cep))} style={{ ...btn(AZ, destaque), padding: destaque ? '8px 12px' : '5px 9px', fontSize: destaque ? 13 : 12 }}>⧉ Copiar CEP</button>
    </div>
  )
  return (
    <div style={{ ...card, padding: 18, border: `1.5px solid ${pts.length ? hexA(AZ, 0.45) : hexA('#d97706', 0.45)}`, background: pts.length ? `linear-gradient(135deg, #ffffff 30%, ${hexA(AZ, 0.07)})` : hexA('#f59e0b', 0.05) }}>
      <div style={{ ...tituloSecao, color: pts.length ? AZ : '#b45309' }}>🏦 CEP de sugestão do banco (Mercantil)</div>
      {r.lote && (
        <div style={{ fontSize: 13, color: cores.texto, marginBottom: 8 }}>
          Região do INSS da cliente ({cidade}): 1º banco é <b style={{ color: merc ? cores.ok : '#b45309' }}>{banco || '?'}</b>{merc ? ' ✓' : ''}
        </div>
      )}
      {pts.length ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 13, color: cores.texto }}>Quando o INSS perguntar o <b>banco de preferência</b>, use este CEP como sugestão{merc ? '' : ' — é de uma região onde o Mercantil é o 1º'}. Quem decide é o INSS.</div>
          {linha(pts[0], 0, true)}
          {pts.length > 1 && (
            <>
              <button onClick={() => setVerTodos(v => !v)} style={{ justifySelf: 'start', border: 'none', background: 'none', color: AZ, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', padding: 0 }}>{verTodos ? '▾' : '▸'} mais {pts.length - 1} opç{pts.length - 1 > 1 ? 'ões' : 'ão'}</button>
              {verTodos && pts.slice(1).map((p, i) => linha(p, i + 1, false))}
            </>
          )}
          <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', background: hexA('#f59e0b', 0.1), borderRadius: 8, padding: '6px 9px' }}>⚠️ Só no campo do banco de preferência. O endereço da cliente continua o dela.</div>
        </div>
      ) : (
        <div style={{ fontSize: 13.5, color: '#7f1d1d', fontWeight: 600 }}>
          {r.aviso ? 'Cadastro sem cidade/UF — confira o endereço da cliente.' : `Não tem ponto do Mercantil em ${cidade} nem em cidade vizinha (até ${r.raio_km || 60} km) numa região onde ele é o 1º — não sugerir CEP. Deixe o banco que o INSS indicar.`}
        </div>
      )}
      <div style={{ fontSize: 11.5, color: cores.suave, marginTop: 10 }}>
        {pts.some(p => p.distancia_km > 0) ? `Fora da cidade da cliente, só cidades a até ${r.raio_km || 60} km (distância entre os centros das cidades). ` : ''}Fontes: leilão da folha do INSS (Pregão 90005/2024{r.crefisa_fora === false ? '' : ', considerando a Crefisa fora'}) e Banco Central{r.posicao_bcb ? ` (pontos do Mercantil em ${fmtData(r.posicao_bcb)})` : ''}.
      </div>
    </div>
  )
}

export function FichaProtocolo({ cpf, modo = 'gaveta', onFechar, onMudou }) {
  const { profile } = useAuth()
  const isMobile = useIsMobile()
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')
  const [modal, setModal] = useState(null)
  const [toast, mostrar] = useToast()
  const [parecer, setParecer] = useState(null)
  const [gerando, setGerando] = useState(false)
  const [erroIA, setErroIA] = useState('')
  const [chat, setChat] = useState([])
  const [pergunta, setPergunta] = useState('')
  const [anexosChat, setAnexosChat] = useState([])
  const [pensando, setPensando] = useState(false)
  const [abaDir, setAbaDir] = useState('ia')
  const [verMotivos, setVerMotivos] = useState(false)
  const [baixando, setBaixando] = useState(false)
  // 29/10/2026 (Bruno): contratos ASSINADOS do ZapSign, um PDF por contrato (honorarios, procuracao,
  // termo). A edge function zapsign-contratos-pdf baixa e guarda no bucket; aqui so lista e abre.
  const [contratos, setContratos] = useState([])
  const [contratosSt, setContratosSt] = useState('')   // '' | 'buscando' | 'erro:...'
  const tentouContratos = useRef(false)
  const pediuParecer = useRef(false)
  const fimChat = useRef(null)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('protocolo_caso', { p_cpf: soDig(cpf) })
    if (error || !data?.ok) { setErro(error?.message || data?.erro || 'não encontrei o caso'); return }
    setErro('')
    setDados(data)
    setParecer(data.caso?.ia_parecer || null)
    const hist = []
    ;(data.chat || []).forEach(m => {
      if (String(m.pergunta || '').includes(MARCA_PARECER)) return
      const p = limparPergunta(m.pergunta)
      if (p) hist.push({ role: 'user', texto: p, quem: m.quem, em: m.em })
      if (m.resposta) hist.push({ role: 'assistant', texto: m.resposta, em: m.em })
    })
    setChat(hist)
  }, [cpf])

  useEffect(() => { carregar() }, [carregar])

  const carregarContratos = useCallback(async (buscarNoZapSign) => {
    const listar = async () => {
      const { data } = await supabase.rpc('protocolo_contratos_lista', { p_cpf: soDig(cpf) })
      const lista = (data && data.ok && Array.isArray(data.contratos)) ? data.contratos : []
      const comUrl = []
      for (const c of lista) {
        const { data: su } = await supabase.storage.from(BUCKET).createSignedUrl(c.arquivo_url, 3600)
        if (su?.signedUrl) comUrl.push({ ...c, url: su.signedUrl })
      }
      setContratos(comUrl)
      return comUrl
    }
    try {
      const atuais = await listar()
      if (atuais.length || !buscarNoZapSign) { setContratosSt(''); return }
      setContratosSt('buscando')
      const { data, error } = await supabase.functions.invoke('zapsign-contratos-pdf', { body: { cpf: soDig(cpf) } })
      if (error || !data?.ok) { setContratosSt('erro:' + ((data && data.erro) || (error && error.message) || 'não consegui buscar')); return }
      await listar()
      setContratosSt('')
    } catch (e) { setContratosSt('erro:' + String(e.message || e)) }
  }, [cpf])
  useEffect(() => {
    if (!tentouContratos.current) { tentouContratos.current = true; carregarContratos(true) }
  }, [carregarContratos])

  const gerarParecer = useCallback(async (casoAtual) => {
    if (!casoAtual) return
    setGerando(true); setErroIA('')
    try {
      const r = await perguntarIA({ caso: casoAtual, historico: [], texto: PROMPT_PARECER })
      if (r) {
        setParecer(r)
        await supabase.rpc('protocolo_salvar_parecer', { p_caso: casoAtual.id, p_texto: r })
      }
    } catch (e) { setErroIA(String(e.message || e)) }
    setGerando(false)
  }, [])

  // "quero sempre uma opiniao da I.A": sem parecer salvo, gera sozinho uma vez
  useEffect(() => {
    if (dados?.caso && !dados.caso.ia_parecer && !pediuParecer.current) {
      pediuParecer.current = true
      gerarParecer({ ...dados.caso })
    }
  }, [dados, gerarParecer])

  useEffect(() => { fimChat.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [chat, pensando])

  async function enviarPergunta(textoForcado) {
    const texto = (textoForcado ?? pergunta).trim()
    if ((!texto && !anexosChat.length) || pensando || !dados?.caso) return
    const anexos = []
    try {
      for (const f of anexosChat.slice(0, 6)) {
        anexos.push({ nome: f.name, media_type: f.type, data: await paraBase64(f) })
      }
    } catch (_) { mostrar('Não consegui ler o anexo', 'erro'); return }
    const novo = { role: 'user', texto: texto || 'Analise o(s) anexo(s).', anexos: anexosChat.map(f => f.name), em: new Date().toISOString(), quem: profile?.nome }
    const hist = [...chat]
    setChat([...hist, novo]); setPergunta(''); setAnexosChat([]); setPensando(true)
    try {
      const r = await perguntarIA({ caso: dados.caso, historico: hist, texto: novo.texto, anexos })
      setChat(c => [...c, { role: 'assistant', texto: r, em: new Date().toISOString() }])
    } catch (e) {
      setChat(c => [...c, { role: 'assistant', texto: '⚠️ Não consegui responder agora: ' + String(e.message || e), erro: true }])
    }
    setPensando(false)
  }

  async function acaoPendencia(id, acao) {
    const { data, error } = await supabase.rpc('protocolo_pendencia_acao', { p_id: id, p_acao: acao, p_obs: null })
    if (error || !data?.ok) { mostrar(error?.message || data?.erro || 'erro', 'erro'); return }
    mostrar(acao === 'avisado' ? 'Responsável avisado — registrado' : acao === 'resolvida' ? 'Pendência resolvida' : 'Pendência reaberta')
    await carregar(); onMudou && onMudou()
  }

  async function atualizarFicha() {
    const { data, error } = await supabase.rpc('protocolo_atualizar_ficha', { p_caso: dados.caso.id })
    if (error || !data?.ok) { mostrar(error?.message || data?.erro || 'erro', 'erro'); return }
    mostrar('Ficha atualizada'); carregar(); onMudou && onMudou()
  }

  async function baixarTodos(docs) {
    setBaixando(true)
    let n = 0
    for (const [i, d] of docs.entries()) {
      try {
        const r = await fetch(d.url)
        const b = await r.blob()
        const ext = (d.url.split('?')[0].split('.').pop() || 'bin').slice(0, 5)
        const a = document.createElement('a')
        a.href = URL.createObjectURL(b)
        a.download = `${soDig(cpf)}-${String(i + 1).padStart(2, '0')}-${d.rotulo.replace(/[^\wÀ-ÿ]+/g, '_')}.${ext}`
        document.body.appendChild(a); a.click(); a.remove()
        n++
        await new Promise(res => setTimeout(res, 350))
      } catch (_) { window.open(d.url, '_blank') }
    }
    setBaixando(false)
    mostrar(`${n} documento(s) baixado(s)`)
  }

  if (erro) return (
    <div style={{ padding: 40, textAlign: 'center', color: cores.suave }}>
      <div style={{ fontSize: 34 }}>🔎</div><div style={{ fontWeight: 700, marginTop: 8 }}>{erro}</div>
      {onFechar && <button onClick={onFechar} style={{ ...btn('#475569', false), marginTop: 16 }}>Fechar</button>}
    </div>
  )
  if (!dados) return (
    <div style={{ padding: 24, display: 'grid', gap: 14 }}>
      {[80, 160, 220, 120].map((h, i) => <div key={i} style={{ height: h, borderRadius: 16, background: 'linear-gradient(90deg,#eef2f7,#f7f9fc,#eef2f7)', backgroundSize: '200% 100%', animation: 'krShimmer 1.2s infinite' }} />)}
      <style>{'@keyframes krShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}'}</style>
    </div>
  )

  const caso = dados.caso
  const f = caso.ficha_snapshot || {}
  const et = etapaInfo(caso.etapa)
  const diasEtapa = diasDesde(caso.etapa_desde)
  const alertas = Array.isArray(f.alertas) ? f.alertas : []
  const ROT_CONTRATO = { contrato: 'Contrato de honorários (assinado)', procuracao: 'Procuração (assinada)', termo: 'Termo (assinado)' }
  const docsContratos = contratos.map(c => ({ rotulo: ROT_CONTRATO[c.tipo] || (c.nome || 'Contrato assinado'), url: c.url, origem: 'contrato', em: c.assinado_em }))
  const docs = Array.isArray(f.documentos) ? f.documentos : []
  const temCaixa = alertas.length || f.liberacao || f.excecao || caso.sem_validacao_ia
  const acoes = ACOES_POR_ETAPA[caso.etapa] || ['observacao']
  const pendAbertas = (dados.pendencias || []).filter(p => p.status !== 'resolvida')
  const cad = f.cadastro || {}
  const endereco = [cad.rua && `${cad.rua}${cad.numero ? ', ' + cad.numero : ''}`, cad.bairro, cad.cidade && `${cad.cidade}${cad.uf ? '/' + cad.uf : ''}`].filter(Boolean).join(' - ')

  const linhasMeuINSS = [
    ['Nome da mãe', caso.nome || f.nome],
    ['CPF', fmtCpf(caso.cpf)],
    ['Telefone', fmtTel(caso.telefone || f.telefone)],
    ['Nome da criança', caso.filho_nome || f.filho_nome],
    ['Nascimento da criança', fmtData(caso.filho_dn || f.filho_dn)],
    ['Perfil / categoria', caso.perfil_label || f.perfil_label],
    ['Base do direito', f.base_direito],
    ['Última contribuição', f.ultima_contribuicao],
    ['RG', cad.rg],
    ['Endereço', endereco],
    ['CEP', cad.cep],
    ['E-mail', cad.email],
    ['NIS', cad.nis],
  ].filter(([, val]) => val && val !== '—')

  const copiar = async (rot, val) => { if (await copiarTexto(String(val))) mostrar(`${rot} copiado`) }

  const cab = (
    <div style={{ ...card, padding: isMobile ? 16 : 20, background: `linear-gradient(135deg, #ffffff 40%, ${hexA(et.cor, 0.08)})`, position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ width: 52, height: 52, borderRadius: 16, background: `linear-gradient(135deg, ${cores.azul}, ${cores.roxo})`, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 18, flexShrink: 0, boxShadow: sombras.glowAzul }}>{iniciais(caso.nome)}</div>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <div style={{ fontSize: isMobile ? 19 : 22, fontWeight: 800, color: cores.texto, lineHeight: 1.2, overflowWrap: 'anywhere' }}>{caso.nome || 'Sem nome'}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <button onClick={() => copiar('CPF', soDig(caso.cpf))} title="Copiar CPF" style={{ fontFamily: fonte.mono, fontSize: 14, fontWeight: 700, border: `1px solid ${cores.cardBorda}`, background: '#fff', borderRadius: 8, padding: '3px 9px', cursor: 'pointer', color: cores.texto }}>{fmtCpf(caso.cpf)} ⧉</button>
            <Chip cor={et.cor} forte>{et.icone} {et.label}</Chip>
            {diasEtapa != null && <Chip cor={diasEtapa > 3 && caso.etapa === 'aguardando_protocolo' ? cores.perigo : cores.suave}>há {diasEtapa} dia{diasEtapa === 1 ? '' : 's'} nesta etapa</Chip>}
            {caso.sem_validacao_ia && <Chip cor={cores.perigo} fundo={hexA(cores.perigo, 0.12)} forte>SEM VALIDAÇÃO DA I.A</Chip>}
            {(f.liberacao || f.excecao) && <Chip cor="#b45309" forte>RESSALVA</Chip>}
          </div>
          <div style={{ fontSize: 13, color: cores.suave, marginTop: 8, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span>👶 <b style={{ color: cores.texto }}>{caso.filho_nome || f.filho_nome || 'Filho(a)'}</b> · {fmtData(caso.filho_dn || f.filho_dn)}</span>
            <span>🧾 {caso.perfil_label || f.perfil_label || 'Sem perfil'}</span>
            {caso.vendedora_nome && <span>🧑‍💼 {caso.vendedora_nome}</span>}
            {f.advogado && <span>⚖️ {f.advogado}</span>}
          </div>
          {f.base_direito && (
            <div style={{ marginTop: 10, fontSize: 13.5, color: cores.texto, background: '#fff', border: `1px solid ${cores.cardBorda}`, borderRadius: 12, padding: '8px 12px' }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: cores.suave, textTransform: 'uppercase', marginRight: 8 }}>Base do direito</span>{f.base_direito}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {modo === 'gaveta' && <a href={`/protocolo/${soDig(caso.cpf)}`} target="_blank" rel="noreferrer" style={{ ...btn('#475569', false), textDecoration: 'none' }}>↗ Nova aba</a>}
          <button onClick={atualizarFicha} title="Puxar documentos e dados novos" style={btn('#475569', false)}>⟳ Atualizar ficha</button>
          {onFechar && <button onClick={onFechar} aria-label="Fechar" style={{ ...btn('#475569', false), padding: '8px 11px' }}>✕</button>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
        {acoes.map((a, i) => (
          <button key={a} onClick={() => setModal(a)} style={btn(ACOES[a].cor, i === 0)}>{ACOES[a].icone} {ACOES[a].titulo}</button>
        ))}
        {!acoes.includes('observacao') && <button onClick={() => setModal('observacao')} style={btn('#475569', false)}>💬 Observação</button>}
      </div>
    </div>
  )

  const caixaAntes = temCaixa ? (
    <div style={{ ...card, padding: 18, background: 'linear-gradient(135deg,#fffbeb,#fef3c7)', border: '1px solid #fcd34d' }}>
      <div style={{ ...tituloSecao, color: '#92400e' }}>⚠️ Antes de protocolar</div>
      {caso.sem_validacao_ia && (
        <div style={{ background: hexA(cores.perigo, 0.1), border: `1px solid ${hexA(cores.perigo, 0.3)}`, color: '#7f1d1d', borderRadius: 10, padding: '8px 12px', fontSize: 13.5, fontWeight: 700, marginBottom: 10 }}>
          Contrato assinado sem validação aprovada da I.A{f.validacao?.resultado ? ` (última validação: ${f.validacao.resultado})` : ''}. Confira o direito antes de protocolar.
        </div>
      )}
      {f.liberacao && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#92400e' }}>RESSALVA DA LIBERAÇÃO MANUAL · {f.liberacao.por} · {fmtData(f.liberacao.em)}</div>
          <div style={{ fontSize: 13.5, color: '#422006', marginTop: 3 }}>{f.liberacao.motivo}</div>
        </div>
      )}
      {f.excecao && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#92400e' }}>CASO DE EXCEÇÃO{f.excecao.decidido_por ? ` · ${f.excecao.decidido_por}` : ''}</div>
          {f.excecao.por_que_liberou && <div style={{ fontSize: 13.5, color: '#422006', marginTop: 3 }}><b>Por que liberou:</b> {f.excecao.por_que_liberou}</div>}
          {f.excecao.ressalva && <div style={{ fontSize: 13.5, color: '#422006', marginTop: 3 }}><b>Ressalva:</b> {f.excecao.ressalva}</div>}
          {f.excecao.risco && <div style={{ fontSize: 13.5, color: '#422006', marginTop: 3 }}><b>Risco:</b> {f.excecao.risco}</div>}
        </div>
      )}
      {alertas.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
          {alertas.map((a, i) => <li key={i} style={{ fontSize: 13.5, color: '#422006', lineHeight: 1.5 }}>{a}</li>)}
        </ul>
      )}
    </div>
  ) : null

  const meuINSS = (
    <div style={{ ...card, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <div style={{ ...tituloSecao, margin: 0 }}>📋 Dados para o Meu INSS</div>
        <button onClick={() => copiar('Dados', linhasMeuINSS.map(([r, val]) => `${r}: ${val}`).join('\n'))} style={{ ...btn(cores.azul, false), padding: '6px 10px', fontSize: 12 }}>Copiar tudo</button>
      </div>
      <div>
        {linhasMeuINSS.map(([rot, val]) => (
          <div key={rot} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px dashed ${cores.cardBorda}` }}>
            <div style={{ width: 150, flexShrink: 0, fontSize: 12.5, color: cores.suave }}>{rot}</div>
            <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: cores.texto, overflowWrap: 'anywhere' }}>{val}</div>
            <button onClick={() => copiar(rot, rot === 'CPF' ? soDig(caso.cpf) : val)} title={`Copiar ${rot}`}
              style={{ border: `1px solid ${cores.cardBorda}`, background: '#fff', borderRadius: 8, padding: '4px 8px', cursor: 'pointer', fontSize: 12, color: cores.azul, fontWeight: 700 }}>⧉</button>
          </div>
        ))}
      </div>
    </div>
  )

  // 28/10 (Bruno) — contatos de referencia do cadastro (obrigatorios desde 28/10).
  // Pra Sthefany achar a cliente quando o numero dela nao responde. Cadastro
  // anterior a regra nao tem: o bloco simplesmente nao aparece.
  const refs = (Array.isArray(f.referencias) ? f.referencias : []).filter(r => r && (r.nome || r.telefone))
  const blocoRefs = refs.length ? (
    <div style={{ ...card, padding: 18 }}>
      <div style={tituloSecao}>📞 Contatos de referência</div>
      <div style={{ display: 'grid', gap: 10 }}>
        {refs.map((r, i) => {
          const tel = soDig(r.telefone)
          const parent = r.parentesco === 'Outro' && r.parentesco_outro ? r.parentesco_outro : r.parentesco
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', border: `1px solid ${cores.cardBorda}`, borderRadius: 12, background: '#fff' }}>
              <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: cores.texto, overflowWrap: 'anywhere' }}>{r.nome || 'Sem nome'}</div>
                <div style={{ fontSize: 12.5, color: cores.suave, marginTop: 2 }}>{parent || 'Parentesco não informado'} · {fmtTel(tel) || '—'}</div>
              </div>
              {tel && <button onClick={() => copiar('Telefone', tel)} style={{ ...btn('#475569', false), padding: '6px 10px', fontSize: 12 }}>⧉ Copiar</button>}
              {tel && <a href={`https://wa.me/55${tel}`} target="_blank" rel="noreferrer" style={{ ...btn('#16a34a', false), padding: '6px 10px', fontSize: 12, textDecoration: 'none' }}>WhatsApp</a>}
            </div>
          )
        })}
      </div>
    </div>
  ) : null

  const blocoProtocolo = (caso.numero_protocolo || caso.resposta_inss_url || caso.exigencia_texto || caso.data_resultado) ? (
    <div style={{ ...card, padding: 18 }}>
      <div style={tituloSecao}>🏛️ INSS</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {caso.numero_protocolo && <Info rot="Protocolo" val={caso.numero_protocolo} copiar={() => copiar('Protocolo', caso.numero_protocolo)} />}
        {caso.data_protocolo && <Info rot="Data do protocolo" val={fmtData(caso.data_protocolo)} />}
        {caso.data_resultado && <Info rot="Data do resultado" val={fmtData(caso.data_resultado)} />}
        {caso.nb && <Info rot="NB" val={caso.nb} copiar={() => copiar('NB', caso.nb)} />}
        {caso.data_cai_conta && <Info rot="Cai na conta" val={fmtData(caso.data_cai_conta)} />}
        {caso.exigencia_prazo && caso.etapa === 'exigencia' && <Info rot="Prazo da exigência" val={fmtData(caso.exigencia_prazo)} destaque />}
      </div>
      {caso.exigencia_texto && caso.etapa === 'exigencia' && <div style={{ marginTop: 10, fontSize: 13.5 }}><b>Exigência:</b> {caso.exigencia_texto}</div>}
      {caso.motivo_codigo && <div style={{ marginTop: 10, fontSize: 13.5, color: cores.perigo }}><b>Motivo:</b> {caso.motivo_label}{caso.motivo_texto ? ' — ' + caso.motivo_texto : ''}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        {caso.protocolo_termo_url && <button onClick={() => abrirArquivo(caso.protocolo_termo_url)} style={btn('#8b5cf6', false)}>📎 Termo do protocolo</button>}
        {caso.resposta_inss_url && <button onClick={() => abrirArquivo(caso.resposta_inss_url)} style={btn('#0f766e', false)}>🖼️ Última resposta do INSS</button>}
      </div>
    </div>
  ) : null

  const linhaArquivo = (d, i) => {
    const pdf = d.origem === 'contrato' || /\.pdf(\?|$)/i.test(d.url)
    return (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 12, border: `1px solid ${cores.cardBorda}`, background: '#fbfcfe' }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: pdf ? hexA('#dc2626', 0.1) : hexA(cores.azul, 0.1), display: 'grid', placeItems: 'center', fontSize: 16, flexShrink: 0 }}>{pdf ? '📕' : '🖼️'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: cores.texto }}>{d.rotulo}</div>
          <div style={{ fontSize: 11.5, color: cores.suave }}>{d.origem === 'contrato' ? `assinado no ZapSign${d.em ? ' em ' + fmtData(d.em) : ''}` : d.origem === 'validacao' ? 'anexado na validação da I.A' : 'cadastro da venda'}</div>
        </div>
        <a href={d.url} target="_blank" rel="noreferrer" style={{ ...btn(cores.azul, false), padding: '6px 11px', fontSize: 12, textDecoration: 'none' }}>Abrir</a>
      </div>
    )
  }

  const blocoContratos = (
    <div style={{ ...card, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ ...tituloSecao, margin: 0 }}>✍️ Contratos assinados ({docsContratos.length})</div>
        {docsContratos.length > 1 && <button disabled={baixando} onClick={() => baixarTodos(docsContratos)} style={{ ...btn(cores.ok), padding: '6px 11px', fontSize: 12 }}>{baixando ? 'Baixando…' : '⬇ Baixar contratos'}</button>}
      </div>
      {contratosSt === 'buscando' && <div style={{ fontSize: 12.5, color: cores.suave }}>⏳ Buscando os contratos assinados no ZapSign…</div>}
      {contratosSt.startsWith('erro:') && (
        <div style={{ fontSize: 12.5, color: '#b45309', background: hexA('#f59e0b', 0.1), borderRadius: 10, padding: '7px 10px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>{contratosSt.slice(5)}</span>
          <button onClick={() => carregarContratos(true)} style={{ ...btn('#b45309', false), padding: '4px 9px', fontSize: 12 }}>Tentar de novo</button>
        </div>
      )}
      {!contratosSt && docsContratos.length === 0 && <div style={{ fontSize: 13, color: cores.suave }}>Nenhum contrato assinado encontrado.</div>}
      {docsContratos.length > 0 && <div style={{ display: 'grid', gap: 8 }}>{docsContratos.map(linhaArquivo)}</div>}
    </div>
  )

  const blocoDocs = (
    <div style={{ ...card, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ ...tituloSecao, margin: 0 }}>📁 Documentos ({docs.length})</div>
        {docs.length > 1 && <button disabled={baixando} onClick={() => baixarTodos(docs)} style={{ ...btn(cores.ok), padding: '6px 11px', fontSize: 12 }}>{baixando ? 'Baixando…' : '⬇ Baixar todos'}</button>}
      </div>
      {docs.length === 0 ? <div style={{ fontSize: 13, color: cores.suave }}>Nenhum documento anexado na venda.</div> : (
        <div style={{ display: 'grid', gap: 8 }}>{docs.map(linhaArquivo)}</div>
      )}
    </div>
  )

  const blocoValidacao = f.resumo_ia ? (
    <div style={{ ...card, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div style={{ ...tituloSecao, margin: 0 }}>🤖 Validação da I.A na venda</div>
        {f.validacao?.resultado && <Chip cor={f.validacao.resultado === 'aprovado' ? cores.ok : cores.perigo} forte>{String(f.validacao.resultado).toUpperCase()}</Chip>}
      </div>
      <div style={{ fontSize: 13.5, color: cores.texto, marginTop: 10, lineHeight: 1.55 }}>{f.resumo_ia}</div>
      {(Array.isArray(f.checagens_ia) && f.checagens_ia.length > 0) && (
        <>
          <button onClick={() => setVerMotivos(!verMotivos)} style={{ marginTop: 10, border: 'none', background: 'transparent', color: cores.azul, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0, fontSize: 13 }}>
            {verMotivos ? '▾ Esconder' : '▸ Ver'} as {f.checagens_ia.length} checagens
          </button>
          {verMotivos && (
            <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
              {f.checagens_ia.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, lineHeight: 1.45 }}>
                  <span style={{ color: c.ok ? cores.ok : cores.perigo, fontWeight: 800 }}>{c.ok ? '✓' : '✕'}</span>
                  <div><b>{c.item}</b>{c.detalhe ? ' — ' + c.detalhe : ''}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <div style={{ fontSize: 11.5, color: cores.suave, marginTop: 10 }}>Validação de {fmtDataHora(f.validacao?.em)}{f.vendedora ? ` · venda de ${f.vendedora}` : ''}</div>
    </div>
  ) : null

  const painelIA = (
    <div style={{ ...card, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: isMobile ? 'auto' : 560 }}>
      <div style={{ padding: '14px 16px', background: 'linear-gradient(135deg,#0b1220,#1e1b4b)', color: '#fff', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 11, background: 'linear-gradient(135deg,#60a5fa,#a78bfa)', display: 'grid', placeItems: 'center', fontSize: 17 }}>✦</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 14.5 }}>Assistente jurídica KR</div>
          <div style={{ fontSize: 11.5, opacity: 0.75 }}>Defende a tese KR · conhece as regras de deferimento · lê prints do INSS</div>
        </div>
      </div>
      <div style={{ display: 'flex', borderBottom: `1px solid ${cores.cardBorda}` }}>
        {[['ia', 'Parecer'], ['chat', `Conversa${chat.length ? ` (${Math.ceil(chat.length / 2)})` : ''}`]].map(([k, r]) => (
          <button key={k} onClick={() => setAbaDir(k)} style={{ flex: 1, padding: '10px 0', border: 'none', borderBottom: `2px solid ${abaDir === k ? cores.roxo : 'transparent'}`, background: 'transparent', fontWeight: 700, color: abaDir === k ? cores.texto : cores.suave, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>{r}</button>
        ))}
      </div>
      {abaDir === 'ia' ? (
        <div style={{ padding: 16, overflowY: 'auto', maxHeight: isMobile ? 'none' : 640 }}>
          {gerando ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 13, color: cores.suave, display: 'flex', alignItems: 'center', gap: 8 }}><span className="kr-pulso">●</span> A I.A está analisando o caso…</div>
              {[90, 70, 95, 60, 80].map((w, i) => <div key={i} style={{ height: 12, width: w + '%', borderRadius: 6, background: 'linear-gradient(90deg,#eef2f7,#f7f9fc,#eef2f7)', backgroundSize: '200% 100%', animation: 'krShimmer 1.2s infinite' }} />)}
              <style>{'@keyframes krShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}} .kr-pulso{color:#8b5cf6;animation:krP 1s infinite alternate} @keyframes krP{from{opacity:.3}to{opacity:1}}'}</style>
            </div>
          ) : parecer ? (
            <>
              <Markdown texto={parecer} />
              <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <button onClick={() => gerarParecer(caso)} style={{ ...btn(cores.roxo, false), fontSize: 12, padding: '6px 11px' }}>⟳ Refazer parecer</button>
                <button onClick={() => copiar('Parecer', parecer)} style={{ ...btn('#475569', false), fontSize: 12, padding: '6px 11px' }}>⧉ Copiar</button>
                {caso.ia_parecer_em && <span style={{ fontSize: 11.5, color: cores.suave }}>gerado {fmtDataHora(caso.ia_parecer_em)}</span>}
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 20 }}>
              {erroIA && <div style={{ color: cores.perigo, fontSize: 13, marginBottom: 10 }}>{erroIA}</div>}
              <button onClick={() => gerarParecer(caso)} style={btn(cores.roxo)}>✦ Gerar parecer da I.A</button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'grid', gap: 10, alignContent: 'start', maxHeight: isMobile ? 460 : 520, background: '#f8fafc' }}>
            {chat.length === 0 && !pensando && (
              <div style={{ fontSize: 13, color: cores.suave, textAlign: 'center', padding: '18px 8px' }}>
                Pergunte qualquer coisa sobre este caso. A assistente já recebe a ficha, os alertas e o parecer como contexto.
              </div>
            )}
            {chat.map((m, i) => (
              <div key={i} style={{ justifySelf: m.role === 'user' ? 'end' : 'start', maxWidth: '92%' }}>
                <div style={{
                  padding: '10px 13px', borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: m.role === 'user' ? `linear-gradient(135deg, ${cores.azul}, ${cores.roxo})` : '#fff',
                  color: m.role === 'user' ? '#fff' : cores.texto, border: m.role === 'user' ? 'none' : `1px solid ${cores.cardBorda}`,
                  boxShadow: m.role === 'user' ? 'none' : '0 1px 2px rgba(15,23,42,.05)', fontSize: 13.5,
                }}>
                  {m.role === 'user' ? <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.texto}</div> : <Markdown texto={m.texto} />}
                  {m.anexos?.length > 0 && <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 4 }}>📎 {m.anexos.join(', ')}</div>}
                </div>
                <div style={{ fontSize: 10.5, color: cores.suave, marginTop: 3, textAlign: m.role === 'user' ? 'right' : 'left' }}>{m.role === 'user' ? (m.quem || 'Você') : 'Assistente'} · {fmtDataHora(m.em)}</div>
              </div>
            ))}
            {pensando && <div style={{ fontSize: 13, color: cores.suave }}><span className="kr-pulso">●●●</span> pensando…<style>{'.kr-pulso{color:#8b5cf6;animation:krP 1s infinite alternate} @keyframes krP{from{opacity:.3}to{opacity:1}}'}</style></div>}
            <div ref={fimChat} />
          </div>
          <div style={{ padding: 12, borderTop: `1px solid ${cores.cardBorda}`, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
              {ATALHOS.map(a => (
                <button key={a.r} onClick={() => setPergunta(a.t)} style={{ fontSize: 11.5, padding: '5px 10px', borderRadius: 999, border: `1px solid ${hexA(cores.roxo, 0.3)}`, background: hexA(cores.roxo, 0.06), color: '#5b21b6', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', fontWeight: 600 }}>{a.r}</button>
              ))}
            </div>
            {anexosChat.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {anexosChat.map((a, i) => <Chip key={i} cor={cores.azul}>📎 {a.name} <span style={{ cursor: 'pointer' }} onClick={() => setAnexosChat(anexosChat.filter((_, j) => j !== i))}>✕</span></Chip>)}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <label title="Anexar print ou PDF" style={{ ...btn('#475569', false), padding: '9px 11px', cursor: 'pointer' }}>
                📎<input type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" style={{ display: 'none' }}
                  onChange={e => { setAnexosChat([...anexosChat, ...[...(e.target.files || [])].filter(x => x.size < 5 * 1024 * 1024)].slice(0, 6)); e.target.value = '' }} />
              </label>
              <textarea value={pergunta} onChange={e => setPergunta(e.target.value)} rows={2} placeholder="Pergunte à assistente sobre este caso…"
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarPergunta() } }}
                onPaste={e => { const it = [...(e.clipboardData?.items || [])].find(x => x.kind === 'file'); if (it) { e.preventDefault(); const fl = it.getAsFile(); if (fl) setAnexosChat(a => [...a, fl].slice(0, 6)) } }}
                style={{ flex: 1, padding: '10px 12px', borderRadius: 12, border: `1px solid ${hexA('#0f172a', 0.14)}`, fontSize: 13.5, resize: 'none', fontFamily: 'inherit', minWidth: 0 }} />
              <button onClick={() => enviarPergunta()} disabled={pensando || (!pergunta.trim() && !anexosChat.length)}
                style={{ ...btn(cores.roxo), padding: '10px 14px', opacity: pensando || (!pergunta.trim() && !anexosChat.length) ? 0.5 : 1 }}>➤</button>
            </div>
          </div>
        </>
      )}
    </div>
  )

  const blocoPend = (
    <div style={{ ...card, padding: 18 }}>
      <div style={{ ...tituloSecao }}>📌 Pendências {pendAbertas.length ? `(${pendAbertas.length} abertas)` : ''}</div>
      {(dados.pendencias || []).length === 0 ? <div style={{ fontSize: 13, color: cores.suave }}>Nenhuma pendência.</div> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {dados.pendencias.map(p => {
            const cor = p.status === 'resolvida' ? cores.ok : p.status === 'avisado' ? cores.azul : cores.alerta
            return (
              <div key={p.id} style={{ border: `1px solid ${hexA(cor, 0.3)}`, background: hexA(cor, 0.05), borderRadius: 12, padding: '10px 12px', opacity: p.status === 'resolvida' ? 0.7 : 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Chip cor={cor} forte>{p.status === 'resolvida' ? 'RESOLVIDA' : p.status === 'avisado' ? 'AVISADO' : 'ABERTA'}</Chip>
                  <span style={{ fontSize: 12, color: cores.suave }}>{catPend(p.categoria || (p.tipo === 'exigencia_inss' ? 'exigencia_inss' : p.tipo)).icone} {catPend(p.categoria || (p.tipo === 'exigencia_inss' ? 'exigencia_inss' : p.tipo)).rot} · aberta {fmtDataHora(p.aberta_em)}{p.prazo ? ` · prazo ${fmtData(p.prazo)}` : ''}</span>
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 6 }}>{p.descricao}</div>
                {p.resolucao && (
                  <div style={{ marginTop: 6, fontSize: 12.5, borderRadius: 8, padding: '6px 9px', background: RESOLUCOES_NEGATIVAS.includes(p.resolucao) ? hexA(cores.perigo, 0.08) : hexA(cores.ok, 0.08), color: cores.texto }}>
                    <b>Acompanhamento:</b> {rotResolucao(p.categoria, p.resolucao)}{p.resolucao_data ? ` · ${fmtData(p.resolucao_data)}` : ''}{p.resolucao_texto ? ` — ${p.resolucao_texto}` : ''}
                    {(Array.isArray(p.resolucao_anexos) ? p.resolucao_anexos : []).map((u, i) => (
                      <button key={i} onClick={() => abrirArquivo(u)} style={{ marginLeft: 8, border: 'none', background: 'none', color: cores.azul, cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: 0 }}>📎 anexo {i + 1}</button>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 12, color: cores.suave, marginTop: 4 }}>
                  Responsável: {p.responsavel || '—'}{p.avisado_em ? ` · avisado por ${p.avisado_por} em ${fmtDataHora(p.avisado_em)}` : ''}{p.resolvida_em ? ` · resolvida por ${p.resolvida_por} em ${fmtDataHora(p.resolvida_em)}` : ''}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {p.status === 'aberta' && <button onClick={() => acaoPendencia(p.id, 'avisado')} style={{ ...btn(cores.azul, false), fontSize: 12, padding: '5px 10px' }}>📣 Responsável avisado</button>}
                  {p.status !== 'resolvida' && <button onClick={() => acaoPendencia(p.id, 'resolvida')} style={{ ...btn(cores.ok), fontSize: 12, padding: '5px 10px' }}>✔ Resolvido</button>}
                  {p.status === 'resolvida' && <button onClick={() => acaoPendencia(p.id, 'reabrir')} style={{ ...btn('#475569', false), fontSize: 12, padding: '5px 10px' }}>Reabrir</button>}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <button onClick={() => setModal('pendencia')} style={{ ...btn('#b45309', false), fontSize: 12, padding: '6px 11px', marginTop: 10 }}>+ Abrir pendência</button>
    </div>
  )

  const blocoTempo = (
    <div style={{ ...card, padding: 18 }}>
      <div style={tituloSecao}>🕓 Linha do tempo</div>
      <div style={{ position: 'relative', paddingLeft: 22 }}>
        <div style={{ position: 'absolute', left: 8, top: 4, bottom: 4, width: 2, background: `linear-gradient(${cores.azul}, ${cores.roxo})`, opacity: 0.25, borderRadius: 2 }} />
        {(dados.eventos || []).map(e => (
          <div key={e.id} style={{ position: 'relative', padding: '0 0 14px' }}>
            <div style={{ position: 'absolute', left: -22, top: 0, width: 18, height: 18, borderRadius: 999, background: '#fff', border: `2px solid ${etapaInfo(e.etapa_para).cor}`, display: 'grid', placeItems: 'center', fontSize: 10 }} />
            <div style={{ fontSize: 13.5, color: cores.texto, lineHeight: 1.45 }}>{ICONE_EVENTO[e.tipo] || '•'} {e.texto || e.tipo}</div>
            <div style={{ fontSize: 11.5, color: cores.suave, marginTop: 2 }}>
              {e.feito_por_nome} · {fmtDataHora(e.feito_em)}
              {e.anexo_url && <> · <button onClick={() => abrirArquivo(e.anexo_url)} style={{ border: 'none', background: 'transparent', color: cores.azul, cursor: 'pointer', fontWeight: 700, padding: 0, fontFamily: 'inherit', fontSize: 11.5 }}>ver anexo</button></>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {toast}
      {cab}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.15fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          {caixaAntes}
          <CepMercantil cpf={caso.cpf} copiar={copiar} />
          {blocoProtocolo}
          {meuINSS}
          {blocoContratos}
          {blocoDocs}
          {blocoValidacao}
        </div>
        <div style={{ display: 'grid', gap: 16, minWidth: 0, position: isMobile ? 'static' : 'sticky', top: 12 }}>
          {painelIA}
          {blocoPend}
          {blocoRefs}
          {blocoTempo}
        </div>
      </div>
      {modal && (
        <ModalAcao caso={caso} acao={modal} onClose={() => setModal(null)}
          onFeito={() => { setModal(null); mostrar('Salvo'); carregar(); onMudou && onMudou() }} />
      )}
    </div>
  )
}

const Info = ({ rot, val, copiar, destaque }) => (
  <div style={{ background: destaque ? hexA(cores.perigo, 0.06) : '#fbfcfe', border: `1px solid ${destaque ? hexA(cores.perigo, 0.25) : cores.cardBorda}`, borderRadius: 12, padding: '9px 12px' }}>
    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: cores.suave }}>{rot}</div>
    <div style={{ fontSize: 14.5, fontWeight: 800, color: destaque ? cores.perigo : cores.texto, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, overflowWrap: 'anywhere' }}>
      {val}{copiar && <button onClick={copiar} style={{ border: 'none', background: 'transparent', color: cores.azul, cursor: 'pointer', fontWeight: 800 }}>⧉</button>}
    </div>
  </div>
)

// ---------------------------------------------------------------- rota /protocolo/<cpf>
export default function ProtocoloFichaPagina() {
  const { profile } = useAuth()
  const cpf = (window.location.pathname.match(/\/protocolo\/(\d{11})/) || [])[1]
  useEffect(() => { carregarFonte() }, [])
  const pode = profile?.role === 'admin' || !!profile?.protocolo_papel
  return (
    <div style={{ minHeight: '100vh', fontFamily: fonte.familia, background: cores.fundo, backgroundImage: 'radial-gradient(900px 400px at 85% -10%, rgba(59,130,246,.08), transparent 60%), radial-gradient(700px 380px at 10% 110%, rgba(139,92,246,.07), transparent 60%)' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: '#0b1220', color: '#fff', padding: '10px max(16px, env(safe-area-inset-left))', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 13 }}>KR</div>
        <div style={{ fontWeight: 800, fontSize: 14.5, flex: 1 }}>Protocolo INSS <span style={{ opacity: 0.6, fontWeight: 500 }}>· ficha do caso</span></div>
        <a href="/" style={{ color: '#c7d2fe', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>← Voltar ao CRM</a>
      </div>
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '18px max(16px, env(safe-area-inset-left)) 40px' }}>
        {!pode ? (
          <div style={{ ...card, padding: 40, textAlign: 'center', color: cores.suave }}>Você não tem acesso ao setor de protocolo.</div>
        ) : !cpf ? (
          <div style={{ ...card, padding: 40, textAlign: 'center', color: cores.suave }}>Link sem CPF.</div>
        ) : (
          <FichaProtocolo cpf={cpf} modo="pagina" />
        )}
      </div>
    </div>
  )
}
