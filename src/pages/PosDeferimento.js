import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { cores, sombras } from '../lib/tema'
import {
  Chip, hexA, estiloBotao as btn, estiloCard as card, fmtCpf, fmtTel, fmtData, fmtDataHora,
  diaBR, hojeISO, diasDesde, iniciais, useIsMobile, useToast, copiarTexto, abrirArquivo, enviarArquivo, soDig,
  catPend, rotResolucao, RESOLUCOES_NEGATIVAS,
} from './ProtocoloFicha'

// ===== ACOMPANHAMENTO DE CLIENTES (29/10/2026, Bruno) — funil no estilo Pipedrive =====
// (no banco tudo se chama posdef_*: o setor nasceu como "pós-deferimento")
// 29/10 parte 2: o time tambem ve os contratos ainda no INSS (so leitura), RESOLVE as
// pendencias da advogada/Sthefany escolhendo uma alternativa, "pago" + "baixa" viraram
// um passo so (CLIENTE PAGOU) e a inadimplencia (data do pagamento + 4 dias sem pagar)
// e contada no mes da data agendada. A VENDEDORA so le o pos das vendas dela.
// Depois que a Dra. Jessica marca "Deferido" no Protocolo (com a carta do INSS), o
// caso entra SOZINHO aqui (trigger no banco). A Jessica nao ve esta tela.
// Deferido (avisar cliente) -> Carta de concessao (banco + data do pagamento)
//   -> PrevSempre (so se o banco for o Mercantil: abriu conta? aceitou honorario automatico?)
//   -> Aguardando pagamento -> Pago -> Baixa.
// Quem trabalha: o responsavel de cada vendedora (tabela posdef_responsaveis).
// Sthefany e admin veem tudo. Toda regra (o que e obrigatorio em cada passo) mora
// no banco, na posdef_acao; aqui a tela so pede os campos e mostra o erro.
// A AGENDA e o coracao: quem recebe hoje, amanha, depois de amanha e o que atrasou,
// pra o responsavel cobrar e alinhar com a cliente antes do dia.

export const ETAPAS_PD = [
  { key: 'deferido', label: 'Deferido · avisar cliente', curto: 'Deferido', cor: '#16a34a', icone: '✅' },
  { key: 'carta', label: 'Carta de concessão', curto: 'Carta', cor: '#0891b2', icone: '📜' },
  { key: 'prevsempre', label: 'PrevSempre', curto: 'PrevSempre', cor: '#2563eb', icone: '🏦' },
  { key: 'aguardando_pagamento', label: 'Aguardando receber', curto: 'Aguardando', cor: '#7c3aed', icone: '⏳' },
  { key: 'atrasado', label: 'Pagamento atrasado', curto: 'Atrasado', cor: '#dc2626', icone: '⏰' },  // virtual: aguardando com a data vencida
  { key: 'pago', label: 'Aguardando receber', curto: 'Aguardando', cor: '#7c3aed', icone: '⏳' },  // etapa antiga (nao usada mais)
  { key: 'baixado', label: 'Cliente pagou', curto: 'Pagou', cor: '#15803d', icone: '🤝' },
  { key: 'cancelado', label: 'Cancelado', curto: 'Cancelado', cor: '#94a3b8', icone: '🚫' },
]
const etapaPD = (k) => ETAPAS_PD.find(e => e.key === k) || { key: k, label: k, curto: k, cor: '#64748b', icone: '•' }
const COLUNAS_PD = ['deferido', 'carta', 'prevsempre', 'aguardando_pagamento', 'atrasado', 'baixado']
const ATIVAS = ['deferido', 'carta', 'prevsempre', 'aguardando_pagamento', 'pago']
const ESPERANDO = ['aguardando_pagamento', 'prevsempre', 'pago']   // ainda nao pagou
const DIAS_INADIMPLENTE = 4
// dias depois da data do pagamento (negativo = ainda vai cair)
const diasApos = (iso) => (iso ? Math.round((new Date(hojeISO() + 'T12:00:00') - new Date(iso + 'T12:00:00')) / 86400000) : null)
const atrasado = (c) => ESPERANDO.includes(c.etapa) && !!c.data_pagamento && diasApos(c.data_pagamento) > 0
const inadimplente = (c) => ESPERANDO.includes(c.etapa) && !!c.data_pagamento && diasApos(c.data_pagamento) > DIAS_INADIMPLENTE
// em que coluna do funil o card mora (o "atrasado" e automatico pela data)
const colunaDe = (c) => c.etapa === 'baixado' ? 'baixado' : c.etapa === 'pago' ? (atrasado(c) ? 'atrasado' : 'aguardando_pagamento')
  : c.etapa === 'aguardando_pagamento' && atrasado(c) ? 'atrasado' : c.etapa

const BANCOS = ['Banco Mercantil do Brasil', 'Caixa Econômica Federal', 'Banco do Brasil', 'Bradesco', 'Itaú', 'Santander', 'Nubank', 'Outro']
const FORMAS_HONORARIO = ['Desconto automático PrevSempre', 'PIX da cliente', 'Transferência', 'Boleto', 'Dinheiro', 'Outro']
const AZUL_PREV = '#1d4ed8'

const somaDias = (iso, n) => { const d = new Date((iso || hojeISO()) + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const diaSemana = (iso) => { try { return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '') } catch (_) { return '' } }
const reais = (v) => (v == null || v === '' ? null : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const primeiroNome = (n) => { const p = String(n || '').trim().split(/\s+/)[0] || ''; return p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : '' }
const bancoCurto = (b) => { const s = String(b || ''); if (/mercantil/i.test(s)) return 'Mercantil'; if (/caixa/i.test(s)) return 'Caixa'; if (/banco do brasil/i.test(s)) return 'Banco do Brasil'; return s.replace(/^Banco\s+/i, '').slice(0, 18) }
const telWa = (t) => { let d = soDig(t); if (d.startsWith('55') && d.length > 11) d = d.slice(2); return d.length >= 10 ? '55' + d : null }

const msgDeferido = (c) => `Olá, ${primeiroNome(c.nome) || 'tudo bem'}! 🎉 Temos uma ótima notícia: o seu salário-maternidade foi *APROVADO (deferido) pelo INSS*.\n\nAgora o próximo passo é a carta de concessão, que informa o banco e a data do pagamento. Assim que ela sair, te avisamos por aqui.\n\nQualquer dúvida, é só chamar! — KR Previdência`
// 29/10 (Bruno) — o lembrete muda com o tipo de cobranca. Textos provisorios: o Bruno
// vai mandar as mensagens oficiais de cada etapa.
const ehAutomatico = (c) => c.prevsempre && c.prevsempre_honorario_auto === true
const msgPagamentoAuto = (c) => `Olá, ${primeiroNome(c.nome) || 'tudo bem'}! Passando para lembrar: o pagamento do seu salário-maternidade está previsto para *${fmtData(c.data_pagamento)}* na sua conta *PrevSempre (Mercantil)*.\n\nComo combinamos, os honorários são descontados automaticamente — você não precisa fazer nada. Quando cair, me avisa por aqui, por favor! — KR Previdência`
const msgPagamento = (c) => ehAutomatico(c) ? msgPagamentoAuto(c) : msgPagamentoCobrar(c)
const msgPagamentoCobrar = (c) => `Olá, ${primeiroNome(c.nome) || 'tudo bem'}! Passando para lembrar: o pagamento do seu salário-maternidade está previsto para *${fmtData(c.data_pagamento)}*${c.banco ? ` no *${c.banco}*` : ''}.\n\nQuando cair, me avisa por aqui, por favor. Qualquer dúvida, estou à disposição! — KR Previdência`

// ---------------------------------------------------------------- acoes
const ACOES_PD = {
  avisar_cliente: {
    titulo: 'Cliente avisada do deferimento', icone: '📣', cor: '#16a34a', mensagem: msgDeferido,
    nota: 'Copie a mensagem, mande para a cliente e salve. O caso vai para "Carta de concessão".',
    campos: [{ k: 'texto', l: 'Como foi avisada / observação (opcional)', tipo: 'textarea' }],
  },
  carta: {
    titulo: 'Carta de concessão', icone: '📜', cor: '#0891b2',
    anexo: 'Carta de concessão', anexoObrig: true,
    nota: 'Banco Mercantil vai para a etapa PrevSempre (abertura de conta e honorário automático). Qualquer outro banco vai direto para "Aguardando pagamento".',
    campos: [
      { k: 'banco', l: 'Banco que vai pagar', obrig: true, tipo: 'select', opcoes: BANCOS.map(b => ({ v: b, l: b })) },
      { k: 'banco_outro', l: 'Qual banco?', tipo: 'text', obrigSe: (v) => v.banco === 'Outro', so: (v) => v.banco === 'Outro' },
      { k: 'data_pagamento', l: 'Data do pagamento', obrig: true, tipo: 'date' },
      { k: 'valor', l: 'Valor do benefício (opcional)', tipo: 'money' },
      { k: 'data', l: 'Data da carta', tipo: 'date', hoje: true },
      { k: 'texto', l: 'Observação (opcional)', tipo: 'textarea' },
    ],
  },
  prevsempre: {
    titulo: 'PrevSempre (Mercantil)', icone: '🏦', cor: AZUL_PREV,
    nota: 'Recebe no Mercantil: confirme a abertura da conta PrevSempre e se a cliente aceitou o desconto automático do honorário.',
    campos: [
      { k: 'conta_aberta', l: 'Abriu a conta PrevSempre?', obrig: true, tipo: 'simnao' },
      { k: 'honorario_auto', l: 'Aceitou o honorário descontado automático?', obrig: true, tipo: 'simnao' },
      { k: 'texto', l: 'Observação (opcional)', tipo: 'textarea' },
    ],
  },
  reagendar: {
    titulo: 'Mudar data do pagamento', icone: '🗓️', cor: '#7c3aed',
    campos: [
      { k: 'data_pagamento', l: 'Nova data do pagamento', obrig: true, tipo: 'date' },
      { k: 'texto', l: 'Por que mudou?', obrig: true, tipo: 'textarea' },
    ],
  },
  cliente_pagou: {
    titulo: 'Cliente pagou', icone: '🤝', cor: '#15803d',
    anexo: 'Comprovante (opcional)',
    nota: 'Marque quando a cliente pagar o honorário. Passou 4 dias da data do pagamento sem pagar, ela conta como inadimplente no mês da data agendada.',
    campos: [
      { k: 'data', l: 'Data em que a cliente pagou', obrig: true, tipo: 'date', hoje: true },
      { k: 'forma', l: 'Como pagou o honorário', obrig: true, tipo: 'select', opcoes: FORMAS_HONORARIO.map(b => ({ v: b, l: b })) },
      { k: 'valor', l: 'Valor do honorário', tipo: 'money' },
      { k: 'texto', l: 'Observação (opcional)', tipo: 'textarea' },
    ],
  },
  atividade: {
    titulo: 'Agendar atividade', icone: '📅', cor: '#0f766e',
    campos: [
      { k: 'texto', l: 'O que fazer', obrig: true, tipo: 'textarea', sugestoes: ['Ligar para a cliente', 'Cobrar a carta de concessão', 'Lembrar a cliente do pagamento', 'Confirmar se o dinheiro caiu', 'Cobrar o honorário'] },
      { k: 'data', l: 'Quando', obrig: true, tipo: 'date', amanha: true },
    ],
  },
  atividade_feita: {
    titulo: 'Atividade feita', icone: '☑️', cor: '#0f766e',
    campos: [{ k: 'texto', l: 'Resultado (opcional)', tipo: 'textarea' }],
  },
  observacao: {
    titulo: 'Observação', icone: '💬', cor: '#475569', anexo: 'Anexo (opcional)',
    campos: [{ k: 'texto', l: 'Observação', obrig: true, tipo: 'textarea' }],
  },
  voltar: {
    titulo: 'Voltar etapa', icone: '↩️', cor: '#64748b',
    campos: [
      { k: 'etapa', l: 'Voltar para', obrig: true, tipo: 'select', opcoes: ETAPAS_PD.filter(e => ['deferido', 'carta', 'prevsempre', 'aguardando_pagamento'].includes(e.key)).map(e => ({ v: e.key, l: e.label })) },
      { k: 'texto', l: 'Motivo', obrig: true, tipo: 'textarea' },
    ],
  },
  cancelar: {
    titulo: 'Cancelar acompanhamento', icone: '🚫', cor: '#94a3b8',
    campos: [{ k: 'texto', l: 'Motivo', obrig: true, tipo: 'textarea' }],
  },
}
const ACOES_POR_ETAPA_PD = {
  deferido: ['avisar_cliente', 'carta', 'atividade', 'observacao', 'cancelar'],
  carta: ['carta', 'atividade', 'observacao', 'cancelar'],
  prevsempre: ['prevsempre', 'reagendar', 'atividade', 'observacao'],
  aguardando_pagamento: ['cliente_pagou', 'reagendar', 'atividade', 'observacao'],
  pago: ['cliente_pagou', 'reagendar', 'atividade', 'observacao'],
  baixado: ['observacao', 'voltar'],
  cancelado: ['voltar', 'observacao'],
}

// soltar o card numa coluna = qual formulario abrir
function acaoDoDropPD(c, col) {
  const e = c.etapa
  if (col === 'atrasado') return ['__auto']
  if (col === 'carta') return e === 'deferido' ? ['avisar_cliente'] : ['voltar', { etapa: 'carta' }]
  if (col === 'prevsempre' || col === 'aguardando_pagamento') {
    if (e === 'deferido' || e === 'carta') return ['carta']
    if (e === 'prevsempre' && col === 'aguardando_pagamento') return ['prevsempre']
    return ['voltar', { etapa: col }]
  }
  if (col === 'baixado') return ESPERANDO.includes(e) ? ['cliente_pagou'] : [null]
  if (col === 'deferido') return ['voltar', { etapa: 'deferido' }]
  return [null]
}

// o que esta agendado para cada caso (Pipedrive: "atividades")
function itensAgenda(c) {
  const out = []
  if (c.etapa === 'deferido' && !c.cliente_avisada_em) out.push({ tipo: 'avisar', data: diaBR(c.etapa_desde) || hojeISO(), texto: 'Avisar a cliente do deferimento' })
  if (ESPERANDO.includes(c.etapa) && c.data_pagamento) out.push({ tipo: 'pagamento', data: c.data_pagamento, texto: `Recebe${c.banco ? ' no ' + c.banco : ''}${inadimplente(c) ? ' · INADIMPLENTE' : ''}` })
  if (c.proxima_atividade_em && ATIVAS.includes(c.etapa)) out.push({ tipo: 'atividade', data: c.proxima_atividade_em, texto: c.proxima_atividade })
  return out
}
const TIPO_AGENDA = {
  pagamento: { r: 'Recebe', cor: '#7c3aed', icone: '💰' },
  atividade: { r: 'Atividade', cor: '#0f766e', icone: '📅' },
  avisar: { r: 'Avisar', cor: '#16a34a', icone: '📣' },
  sem_carta: { r: 'Sem carta', cor: '#0891b2', icone: '📜' },
  pendencia: { r: 'Pendência', cor: '#b45309', icone: '📌' },
}

// ---------------------------------------------------------------- tags do card
function Tags({ c, grande }) {
  const s = grande ? { fontSize: 12.5, padding: '3px 11px' } : {}
  return (
    <>
      {c.prevsempre && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 800, color: '#fff', background: AZUL_PREV, borderRadius: 999, padding: '2px 9px', fontSize: 11, letterSpacing: '.04em', ...s }}>PREVSEMPRE</span>
      )}
      {c.prevsempre_honorario_auto === true && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 800, color: AZUL_PREV, background: hexA(AZUL_PREV, 0.1), border: `1px solid ${hexA(AZUL_PREV, 0.35)}`, borderRadius: 999, padding: '1px 9px', fontSize: 11, ...s }}>✓ HONORÁRIO AUTOMÁTICO</span>
      )}
      {c.prevsempre && c.prevsempre_honorario_auto === false && <Chip cor="#b45309">sem honorário automático</Chip>}
      {c.prevsempre && c.prevsempre_conta_aberta === false && <Chip cor={cores.perigo}>conta não aberta</Chip>}
      {inadimplente(c) ? <Chip cor={cores.perigo} forte>INADIMPLENTE · {diasApos(c.data_pagamento)}d</Chip> : atrasado(c) ? <Chip cor="#ea580c" forte>ATRASADO · {diasApos(c.data_pagamento)}d</Chip> : null}
    </>
  )
}

// ---------------------------------------------------------------- modal de acao
function ModalPD({ caso, acao, inicial, onClose, onFeito }) {
  const cfg = ACOES_PD[acao]
  const isMobile = useIsMobile()
  const [toast, mostrar] = useToast()
  const [v, setV] = useState(() => {
    const o = {}
    ;(cfg?.campos || []).forEach(c => {
      if (c.hoje) o[c.k] = hojeISO()
      if (c.amanha) o[c.k] = somaDias(hojeISO(), 1)
    })
    if (acao === 'reagendar' && caso.data_pagamento) o.data_pagamento = caso.data_pagamento
    if (acao === 'carta' && caso.data_pagamento) o.data_pagamento = caso.data_pagamento
    if (acao === 'cliente_pagou' && caso.prevsempre_honorario_auto) o.forma = 'Desconto automático PrevSempre'
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

  useEffect(() => {
    if (!cfg?.anexo) return
    const f = (e) => {
      const it = [...(e.clipboardData?.items || [])].find(x => x.kind === 'file')
      if (it) pegarArquivo(it.getAsFile())
    }
    window.addEventListener('paste', f)
    return () => window.removeEventListener('paste', f)
  }, [cfg, pegarArquivo])

  if (!cfg) return null
  const visiveis = (cfg.campos || []).filter(c => !c.so || c.so(v))
  const faltando = visiveis.filter(c => (c.obrig || (c.obrigSe && c.obrigSe(v))) && !String(v[c.k] ?? '').trim()).map(c => c.l)
  if (cfg.anexoObrig && !arquivo) faltando.unshift(cfg.anexo)
  const pode = faltando.length === 0 && !salvando
  const ehMercantil = acao === 'carta' && /mercantil/i.test(v.banco === 'Outro' ? (v.banco_outro || '') : (v.banco || ''))

  async function salvar() {
    if (!pode) return
    setSalvando(true); setErro('')
    try {
      const p = {}
      Object.entries(v).forEach(([k, val]) => { if (!k.startsWith('_') && val !== '' && val != null) p[k] = String(val) })
      if (acao === 'carta' && p.banco === 'Outro') { p.banco = p.banco_outro; delete p.banco_outro }
      delete p.banco_outro
      if (arquivo) p.anexo = await enviarArquivo(arquivo, caso.cpf)
      const { data, error } = await supabase.rpc('posdef_acao', { p_id: caso.id, p_acao: acao, p })
      if (error) throw new Error(error.message)
      if (!data?.ok) throw new Error(data?.erro || 'não salvou')
      onFeito && onFeito(data)
    } catch (e) {
      setErro(String(e.message || e)); setSalvando(false)
    }
  }

  const st = { width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${hexA('#0f172a', 0.14)}`, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' }
  const campo = (c) => {
    const obrig = c.obrig || (c.obrigSe && c.obrigSe(v))
    return (
      <div key={c.k}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: cores.suave, margin: '0 0 5px' }}>{c.l}{obrig && <span style={{ color: cores.perigo }}> *</span>}</div>
        {c.tipo === 'textarea' ? (
          <textarea value={v[c.k] || ''} onChange={e => setV({ ...v, [c.k]: e.target.value })} rows={3} style={{ ...st, resize: 'vertical' }} />
        ) : c.tipo === 'select' ? (
          <select value={v[c.k] || ''} onChange={e => setV({ ...v, [c.k]: e.target.value })} style={st}>
            <option value="">Escolha…</option>
            {c.opcoes.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        ) : c.tipo === 'simnao' ? (
          <div style={{ display: 'flex', gap: 8 }}>
            {[['true', 'Sim', cores.ok], ['false', 'Não', cores.perigo]].map(([val, rot, cor]) => {
              const on = v[c.k] === val
              return (
                <button key={val} type="button" onClick={() => setV({ ...v, [c.k]: val })} style={{
                  flex: 1, padding: '11px 12px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 800,
                  border: `1.5px solid ${on ? cor : hexA('#0f172a', 0.14)}`, background: on ? hexA(cor, 0.1) : '#fff', color: on ? cor : cores.texto,
                }}>{on ? '● ' : ''}{rot}</button>
              )
            })}
          </div>
        ) : c.tipo === 'money' ? (
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: 10, color: cores.suave, fontSize: 14 }}>R$</span>
            <input inputMode="decimal" value={v[c.k] || ''} placeholder="0,00" onChange={e => setV({ ...v, [c.k]: e.target.value.replace(/[^\d.,]/g, '') })} style={{ ...st, paddingLeft: 36 }} />
          </div>
        ) : (
          <input type={c.tipo === 'date' ? 'date' : 'text'} value={v[c.k] || ''} onChange={e => setV({ ...v, [c.k]: e.target.value })} style={st} />
        )}
        {c.tipo === 'date' && c.k === 'data_pagamento' && v[c.k] && (
          <div style={{ fontSize: 12, color: cores.suave, marginTop: 4 }}>
            {diaSemana(v[c.k])} · {(() => { const d = Math.round((new Date(v[c.k] + 'T12:00:00') - new Date(hojeISO() + 'T12:00:00')) / 86400000); return d === 0 ? 'hoje' : d === 1 ? 'amanhã' : d > 0 ? `daqui ${d} dias` : `${-d} dias atrás` })()}
          </div>
        )}
        {c.sugestoes && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {c.sugestoes.map(s => (
              <button key={s} type="button" onClick={() => setV({ ...v, [c.k]: s })}
                style={{ fontSize: 11.5, padding: '4px 9px', borderRadius: 999, border: `1px solid ${cores.cardBorda}`, background: cores.chipBg, cursor: 'pointer', fontFamily: 'inherit', color: cores.texto }}>{s}</button>
            ))}
          </div>
        )}
      </div>
    )
  }

  const mensagem = cfg.mensagem ? cfg.mensagem(caso) : null
  const wa = telWa(caso.telefone)

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', backdropFilter: 'blur(3px)', zIndex: 2000, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 20 }}>
      {toast}
      <div onClick={e => e.stopPropagation()} style={{ ...card, width: '100%', maxWidth: 560, maxHeight: isMobile ? '92vh' : '88vh', overflow: 'auto', borderRadius: isMobile ? '20px 20px 0 0' : 20, padding: 0 }}>
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
          {mensagem && (
            <div style={{ border: `1px solid ${hexA('#16a34a', 0.3)}`, background: hexA('#16a34a', 0.05), borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#15803d', marginBottom: 6 }}>MENSAGEM PRONTA</div>
              <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: cores.texto, lineHeight: 1.5 }}>{mensagem}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button type="button" onClick={async () => mostrar((await copiarTexto(mensagem)) ? 'Mensagem copiada' : 'Não consegui copiar', 'ok')} style={{ ...btn('#15803d', false), padding: '6px 11px', fontSize: 12 }}>⧉ Copiar mensagem</button>
                {wa && <a href={`https://wa.me/${wa}?text=${encodeURIComponent(mensagem)}`} target="_blank" rel="noreferrer" style={{ ...btn('#16a34a'), padding: '6px 11px', fontSize: 12, textDecoration: 'none' }}>Abrir no WhatsApp</a>}
              </div>
            </div>
          )}
          {cfg.anexo && (
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: cores.suave, margin: '0 0 5px' }}>{cfg.anexo}{cfg.anexoObrig && <span style={{ color: cores.perigo }}> *</span>}</div>
              <div onClick={() => inputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setArrastando(true) }}
                onDragLeave={() => setArrastando(false)}
                onDrop={e => { e.preventDefault(); setArrastando(false); pegarArquivo(e.dataTransfer.files?.[0]) }}
                style={{ border: `2px dashed ${arrastando ? cfg.cor : hexA('#0f172a', 0.18)}`, borderRadius: 14, padding: 16, background: arrastando ? hexA(cfg.cor, 0.06) : '#fafbfd', cursor: 'pointer', textAlign: 'center' }}>
                {arquivo ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {previa ? <img src={previa} alt="prévia" style={{ maxHeight: 120, maxWidth: '100%', borderRadius: 8 }} /> : <div style={{ fontSize: 34 }}>📄</div>}
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
                <input ref={inputRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => pegarArquivo(e.target.files?.[0])} />
              </div>
            </div>
          )}
          {visiveis.map(campo)}
          {ehMercantil && <div style={{ fontSize: 13, fontWeight: 700, color: AZUL_PREV, background: hexA(AZUL_PREV, 0.08), borderRadius: 10, padding: '9px 12px' }}>🏦 Mercantil: o caso vai para a etapa <b>PrevSempre</b>.</div>}
          {erro && <div style={{ color: cores.perigo, background: hexA(cores.perigo, 0.08), borderRadius: 10, padding: '9px 12px', fontSize: 13, fontWeight: 600 }}>{erro}</div>}
          {!pode && !salvando && faltando.length > 0 && <div style={{ fontSize: 12, color: cores.suave }}>Falta: {faltando.join(' · ')}</div>}
        </div>
        <div style={{ padding: '14px 20px 20px', display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: `1px solid ${cores.cardBorda}`, position: 'sticky', bottom: 0, background: '#fff' }}>
          <button onClick={onClose} style={btn('#475569', false)}>Cancelar</button>
          <button onClick={salvar} disabled={!pode} style={{ ...btn(cfg.cor), opacity: pode ? 1 : 0.45, cursor: pode ? 'pointer' : 'not-allowed' }}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- ficha (gaveta)
const ICONE_EV = {
  entrada: '📥', avisar_cliente: '📣', carta: '📜', prevsempre: '🏦', reagendar: '🗓️', pago: '💸', baixa: '🏁', cliente_pagou: '🤝',
  atividade: '📅', atividade_feita: '☑️', observacao: '💬', voltar: '↩️', cancelar: '🚫',
}

function FichaPD({ id, onFechar, onMudou }) {
  const isMobile = useIsMobile()
  const [toast, mostrar] = useToast()
  const [dados, setDados] = useState(null)
  const [modal, setModal] = useState(null)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('posdef_caso', { p_id: id })
    if (error) { setDados({ ok: false, erro: error.message }); return }
    setDados(data || { ok: false, erro: 'sem dados' })
  }, [id])
  useEffect(() => { carregar() }, [carregar])

  if (!dados) return <div style={{ ...card, padding: 40, textAlign: 'center', color: cores.suave }}>Carregando…</div>
  if (!dados.ok) return <div style={{ ...card, padding: 30, color: cores.perigo }}>{dados.erro} {onFechar && <button onClick={onFechar} style={btn('#475569', false)}>Fechar</button>}</div>

  const c = dados.caso
  const pr = dados.protocolo || {}
  const et = etapaPD(c.etapa)
  const acoes = c.pode_agir === false ? [] : (ACOES_POR_ETAPA_PD[c.etapa] || ['observacao'])
  const wa = telWa(c.telefone)
  const refs = (Array.isArray(pr.referencias) ? pr.referencias : []).filter(r => r && (r.nome || r.telefone))
  const copiar = async (rot, val) => { if (await copiarTexto(String(val))) mostrar(`${rot} copiado`) }
  const tituloSecao = { fontSize: 11.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: cores.suave, margin: '0 0 10px' }
  const Info = ({ rot, val, destaque }) => (
    <div style={{ minWidth: 0, background: destaque ? hexA(destaque, 0.07) : '#fff', border: `1px solid ${destaque ? hexA(destaque, 0.3) : cores.cardBorda}`, borderRadius: 12, padding: '9px 12px' }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: cores.suave }}>{rot}</div>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: destaque || cores.texto, marginTop: 2, overflowWrap: 'anywhere' }}>{val || '—'}</div>
    </div>
  )
  const docs = [
    ['Carta de deferimento (INSS)', c.carta_deferimento_url],
    ['Carta de concessão', c.carta_concessao_url],
    ['Comprovante do pagamento', c.pago_comprovante_url],
    ['Comprovante da cliente', c.honorario_comprovante_url],
  ].filter(([, u]) => u)
  const diasPag = c.data_pagamento ? Math.round((new Date(c.data_pagamento + 'T12:00:00') - new Date(hojeISO() + 'T12:00:00')) / 86400000) : null

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {toast}
      <div style={{ ...card, padding: isMobile ? 16 : 20, background: `linear-gradient(135deg, #ffffff 40%, ${hexA(et.cor, 0.08)})` }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: c.prevsempre ? `linear-gradient(135deg, ${AZUL_PREV}, #3b82f6)` : 'linear-gradient(135deg,#16a34a,#0891b2)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 18, flexShrink: 0 }}>{iniciais(c.nome)}</div>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <div style={{ fontSize: isMobile ? 19 : 22, fontWeight: 800, color: cores.texto, lineHeight: 1.2, overflowWrap: 'anywhere' }}>{c.nome || 'Sem nome'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 7, flexWrap: 'wrap' }}>
              <button onClick={() => copiar('CPF', soDig(c.cpf))} style={{ fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, border: `1px solid ${cores.cardBorda}`, background: '#fff', borderRadius: 8, padding: '3px 9px', cursor: 'pointer', color: cores.texto }}>{fmtCpf(c.cpf)} ⧉</button>
              <Chip cor={et.cor} forte>{et.icone} {et.label}</Chip>
              <Tags c={c} grande />
            </div>
            <div style={{ fontSize: 13, color: cores.suave, marginTop: 8, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <span>📞 <b style={{ color: cores.texto }}>{fmtTel(c.telefone)}</b></span>
              {c.vendedora_nome && <span>🧑‍💼 venda: {c.vendedora_nome}</span>}
              <span>👥 acompanha: <b style={{ color: cores.texto }}>{(c.responsaveis || []).join(', ') || '—'}</b></span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {c.telefone && <button onClick={() => copiar('Telefone', soDig(c.telefone))} style={btn('#475569', false)}>⧉ Telefone</button>}
            {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" style={{ ...btn('#16a34a', false), textDecoration: 'none' }}>WhatsApp</a>}
            {onFechar && <button onClick={onFechar} aria-label="Fechar" style={{ ...btn('#475569', false), padding: '8px 11px' }}>✕</button>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
          {acoes.map((a, i) => <button key={a} onClick={() => setModal(a)} style={btn(ACOES_PD[a].cor, i === 0)}>{ACOES_PD[a].icone} {ACOES_PD[a].titulo}</button>)}
          {c.proxima_atividade && c.pode_agir !== false && <button onClick={() => setModal('atividade_feita')} style={btn('#0f766e', false)}>☑️ Atividade feita</button>}
          {c.pode_agir === false && <span style={{ fontSize: 12.5, color: cores.suave }}>Só acompanhamento — quem atualiza este caso é {(c.responsaveis || []).join(', ') || 'o responsável'}.</span>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1.15fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          {c.proxima_atividade && (
            <div style={{ ...card, padding: 16, border: `1.5px solid ${hexA('#0f766e', 0.4)}`, background: hexA('#0f766e', 0.05) }}>
              <div style={{ ...tituloSecao, color: '#0f766e', margin: 0 }}>📅 Próxima atividade · {fmtData(c.proxima_atividade_em)} ({diaSemana(c.proxima_atividade_em)})</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: cores.texto, marginTop: 6 }}>{c.proxima_atividade}</div>
            </div>
          )}
          <div style={{ ...card, padding: 18 }}>
            <div style={tituloSecao}>💰 Pagamento</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              <Info rot="Banco" val={c.banco} destaque={c.prevsempre ? AZUL_PREV : null} />
              <Info rot="Data do pagamento" val={c.data_pagamento ? `${fmtData(c.data_pagamento)} · ${diaSemana(c.data_pagamento)}` : null}
                destaque={diasPag != null && ATIVAS.includes(c.etapa) && c.etapa !== 'pago' ? (diasPag < 0 ? cores.perigo : diasPag <= 1 ? '#d97706' : '#7c3aed') : null} />
              <Info rot="Valor do benefício" val={reais(c.valor_beneficio)} />
              {c.etapa === 'baixado' && <Info rot="Cliente pagou" val={`${fmtData(c.pago_em)} · ${c.honorario_forma || ''}${c.honorario_valor ? ' · ' + reais(c.honorario_valor) : ''}`} destaque={cores.ok} />}
              {inadimplente(c) && <Info rot="Situação" val={`INADIMPLENTE há ${diasApos(c.data_pagamento)} dias`} destaque={cores.perigo} />}
            </div>
            {c.prevsempre && (
              <div style={{ marginTop: 12, borderRadius: 12, padding: '10px 12px', background: hexA(AZUL_PREV, 0.06), border: `1px solid ${hexA(AZUL_PREV, 0.25)}`, fontSize: 13.5, color: cores.texto, display: 'grid', gap: 4 }}>
                <div style={{ fontWeight: 800, color: AZUL_PREV }}>🏦 PrevSempre (Mercantil)</div>
                <div>Conta PrevSempre: <b>{c.prevsempre_conta_aberta == null ? 'a confirmar' : c.prevsempre_conta_aberta ? 'aberta' : 'não aberta'}</b></div>
                <div>Honorário automático: <b>{c.prevsempre_honorario_auto == null ? 'a confirmar' : c.prevsempre_honorario_auto ? 'aceito' : 'não aceito'}</b></div>
              </div>
            )}
          </div>
          <div style={{ ...card, padding: 18 }}>
            <div style={tituloSecao}>🏛️ INSS</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              <Info rot="NB" val={c.nb} />
              <Info rot="Deferido em" val={fmtData(c.data_deferimento)} />
              <Info rot="Protocolo" val={pr.numero_protocolo} />
              <Info rot="Cliente avisada" val={c.cliente_avisada_em ? `${fmtDataHora(c.cliente_avisada_em)}${c.cliente_avisada_por_nome ? ' · ' + c.cliente_avisada_por_nome : ''}` : 'ainda não'} destaque={c.cliente_avisada_em ? null : '#d97706'} />
            </div>
            {docs.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                {docs.map(([rot, u]) => <button key={rot} onClick={() => abrirArquivo(u)} style={btn('#0891b2', false)}>📎 {rot}</button>)}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          {refs.length > 0 && (
            <div style={{ ...card, padding: 18 }}>
              <div style={tituloSecao}>📞 Contatos de referência</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {refs.map((r, i) => {
                  const w = telWa(r.telefone)
                  const parent = r.parentesco === 'Outro' && r.parentesco_outro ? r.parentesco_outro : r.parentesco
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', border: `1px solid ${cores.cardBorda}`, borderRadius: 12, padding: '9px 11px' }}>
                      <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{r.nome}</div>
                        <div style={{ fontSize: 12, color: cores.suave }}>{parent || '—'} · {fmtTel(r.telefone)}</div>
                      </div>
                      {w && <a href={`https://wa.me/${w}`} target="_blank" rel="noreferrer" style={{ ...btn('#16a34a', false), padding: '5px 10px', fontSize: 12, textDecoration: 'none' }}>WhatsApp</a>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          <div style={{ ...card, padding: 18 }}>
            <div style={tituloSecao}>🕓 Histórico</div>
            <div style={{ display: 'grid', gap: 12 }}>
              {(dados.eventos || []).map(e => (
                <div key={e.id} style={{ display: 'flex', gap: 10 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 10, background: cores.chipBg, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{ICONE_EV[e.tipo] || '•'}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, color: cores.texto, overflowWrap: 'anywhere' }}>{e.texto || e.tipo}</div>
                    <div style={{ fontSize: 11.5, color: cores.suave, marginTop: 2 }}>
                      {e.feito_por_nome} · {fmtDataHora(e.feito_em)}
                      {e.anexo_url && <button onClick={() => abrirArquivo(e.anexo_url)} style={{ marginLeft: 8, border: 'none', background: 'none', color: cores.azul, cursor: 'pointer', fontSize: 11.5, fontWeight: 700, padding: 0 }}>📎 anexo</button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {modal && <ModalPD caso={c} acao={modal} onClose={() => setModal(null)} onFeito={() => { setModal(null); mostrar('Salvo'); carregar(); onMudou && onMudou() }} />}
    </div>
  )
}

// ---------------------------------------------------------------- resolver pendencia (time de acompanhamento)
// A advogada/Sthefany escreveu O QUE PRECISA; aqui a pessoa escolhe COMO resolveu
// (alternativas da categoria em CATEGORIAS_PEND) e o banco confere o que cada uma exige.
function ModalResolver({ pend, opcao, onClose, onFeito }) {
  const isMobile = useIsMobile()
  const cat = catPend(pend.categoria)
  const op = cat.opcoes.find(o => o.v === opcao) || cat.opcoes[0]
  const [texto, setTexto] = useState('')
  const [data, setData] = useState('')
  const [arquivos, setArquivos] = useState([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [arrastando, setArrastando] = useState(false)
  const inputRef = useRef(null)

  const juntar = useCallback((lista) => {
    const ok = [...(lista || [])].filter(f => /^image\//.test(f.type) || f.type === 'application/pdf').filter(f => f.size <= 15 * 1024 * 1024)
    if (!ok.length) { setErro('Envie imagem ou PDF (até 15 MB).'); return }
    setErro(''); setArquivos(a => [...a, ...ok].slice(0, 6))
  }, [])
  useEffect(() => {
    if (!op.anexo && !op.anexoOpcional) return
    const f = (e) => { const fs = [...(e.clipboardData?.items || [])].filter(x => x.kind === 'file').map(x => x.getAsFile()); if (fs.length) juntar(fs) }
    window.addEventListener('paste', f)
    return () => window.removeEventListener('paste', f)
  }, [op, juntar])

  const falta = []
  if (op.anexo && !arquivos.length) falta.push('anexo')
  if (op.data && !data) falta.push('data')
  if (op.texto && !texto.trim()) falta.push('explicação')
  const pode = !falta.length && !salvando

  async function salvar() {
    if (!pode) return
    setSalvando(true); setErro('')
    try {
      const anexos = []
      for (const f of arquivos) anexos.push(await enviarArquivo(f, pend.cpf))
      const { data: r, error } = await supabase.rpc('posdef_pendencia_resolver', { p_id: pend.id, p: { resolucao: op.v, texto: texto.trim() || null, data: data || null, anexos } })
      if (error) throw new Error(error.message)
      if (!r?.ok) throw new Error(r?.erro || 'não salvou')
      onFeito && onFeito(r)
    } catch (e) { setErro(String(e.message || e)); setSalvando(false) }
  }

  const st = { width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${hexA('#0f172a', 0.14)}`, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' }
  const cor = op.negativa ? cores.perigo : op.andamento ? '#2563eb' : cores.ok
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', backdropFilter: 'blur(3px)', zIndex: 2000, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...card, width: '100%', maxWidth: 560, maxHeight: isMobile ? '92vh' : '88vh', overflow: 'auto', borderRadius: isMobile ? '20px 20px 0 0' : 20, padding: 0 }}>
        <div style={{ padding: '18px 20px 14px', borderBottom: `1px solid ${cores.cardBorda}`, display: 'flex', gap: 12, alignItems: 'center', background: `linear-gradient(135deg, ${hexA(cat.cor, 0.10)}, transparent)` }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: hexA(cat.cor, 0.15), display: 'grid', placeItems: 'center', fontSize: 20 }}>{cat.icone}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 16.5, fontWeight: 800, color: cores.texto }}>{op.rot}</div>
            <div style={{ fontSize: 12.5, color: cores.suave, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pend.nome} · {cat.rot}</div>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: cores.suave }}>✕</button>
        </div>
        <div style={{ padding: 20, display: 'grid', gap: 14 }}>
          <div style={{ fontSize: 13, color: cores.texto, background: cores.chipBg, borderRadius: 10, padding: '9px 12px' }}><b>O que precisa:</b> {pend.descricao}</div>
          <div style={{ fontSize: 13, color: cor, fontWeight: 700 }}>{op.dica}</div>
          {(op.anexo || op.anexoOpcional) && (
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: cores.suave, margin: '0 0 5px' }}>Anexos{op.anexo && <span style={{ color: cores.perigo }}> *</span>} <span style={{ fontWeight: 500 }}>(até 6)</span></div>
              <div onClick={() => inputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setArrastando(true) }} onDragLeave={() => setArrastando(false)}
                onDrop={e => { e.preventDefault(); setArrastando(false); juntar(e.dataTransfer.files) }}
                style={{ border: `2px dashed ${arrastando ? cat.cor : hexA('#0f172a', 0.18)}`, borderRadius: 14, padding: 14, background: arrastando ? hexA(cat.cor, 0.06) : '#fafbfd', cursor: 'pointer', textAlign: 'center', color: cores.suave, fontSize: 13 }}>
                <b style={{ color: cores.texto }}>Arraste aqui, clique para escolher</b> ou cole com <b>Ctrl+V</b> · imagem ou PDF
                <input ref={inputRef} type="file" multiple accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => juntar(e.target.files)} />
              </div>
              {arquivos.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {arquivos.map((f, i) => (
                    <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, background: cores.chipBg, borderRadius: 999, padding: '4px 10px' }}>
                      📎 {(f.name || 'imagem').slice(0, 24)}
                      <button onClick={() => setArquivos(a => a.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: cores.suave, padding: 0 }}>✕</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {op.data && (
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: cores.suave, margin: '0 0 5px' }}>Data combinada<span style={{ color: cores.perigo }}> *</span></div>
              <input type="date" value={data} onChange={e => setData(e.target.value)} style={st} />
              {pend.exigencia_prazo && pend.categoria === 'exigencia_inss' && <div style={{ fontSize: 12, color: cores.perigo, marginTop: 4 }}>Prazo do INSS: {fmtData(pend.exigencia_prazo)}</div>}
            </div>
          )}
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: cores.suave, margin: '0 0 5px' }}>{op.texto ? 'Explique' : 'Observação (opcional)'}{op.texto && <span style={{ color: cores.perigo }}> *</span>}</div>
            <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={3} style={{ ...st, resize: 'vertical' }} />
          </div>
          {op.andamento && <div style={{ fontSize: 12.5, color: cores.suave }}>A pendência continua aberta e aparece na sua agenda nessa data.</div>}
          {!op.andamento && <div style={{ fontSize: 12.5, color: cores.suave }}>Ao salvar, a pendência vai para a advogada refazer o caso{op.negativa ? ' e decidir o que fazer' : ''}.</div>}
          {erro && <div style={{ color: cores.perigo, background: hexA(cores.perigo, 0.08), borderRadius: 10, padding: '9px 12px', fontSize: 13, fontWeight: 600 }}>{erro}</div>}
          {!pode && !salvando && falta.length > 0 && <div style={{ fontSize: 12, color: cores.suave }}>Falta: {falta.join(' · ')}</div>}
        </div>
        <div style={{ padding: '14px 20px 20px', display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: `1px solid ${cores.cardBorda}`, position: 'sticky', bottom: 0, background: '#fff' }}>
          <button onClick={onClose} style={btn('#475569', false)}>Cancelar</button>
          <button onClick={salvar} disabled={!pode} style={{ ...btn(cor), opacity: pode ? 1 : 0.45, cursor: pode ? 'pointer' : 'not-allowed' }}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- tela principal
const ETAPAS_INSS = {
  aguardando_protocolo: { rot: 'Na fila para protocolar', cor: '#3b82f6', icone: '🗂️', grupo: 'fila' },
  protocolado: { rot: 'Em análise no INSS', cor: '#8b5cf6', icone: '📨', grupo: 'analise' },
  recurso: { rot: 'Em recurso', cor: '#0891b2', icone: '⚖️', grupo: 'analise' },
  pendencia_docs: { rot: 'Com pendência', cor: '#d97706', icone: '📌', grupo: 'problema' },
  exigencia: { rot: 'Exigência do INSS', cor: '#ea580c', icone: '⚠️', grupo: 'problema' },
  indeferido: { rot: 'Indeferido', cor: '#dc2626', icone: '⛔', grupo: 'problema' },
  recurso_indeferido: { rot: 'Recurso indeferido', cor: '#b91c1c', icone: '✖️', grupo: 'problema' },
}
const nomeMesBR = (ym) => { const [a, m] = ym.split('-').map(Number); const n = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long' }); return `${n.charAt(0).toUpperCase()}${n.slice(1)}/${String(a).slice(2)}` }
const mesDe = (c) => (c.data_pagamento || (c.pago_em || '')).slice(0, 7)

export default function PosDeferimento() {
  const { profile } = useAuth()
  const isMobile = useIsMobile()
  const [toast, mostrar] = useToast()
  // vendedora (sem ser responsavel/admin): so le o pos das vendas dela
  const soLeitura = profile?.role !== 'admin' && profile?.posdef_papel === 'vendedora'
  const [lista, setLista] = useState(null)
  const [inss, setInss] = useState([])
  const [pends, setPends] = useState([])
  const [aba, setAba] = useState('pagamentos')
  const [pgPeriodo, setPgPeriodo] = useState('semana')
  const [pgTipo, setPgTipo] = useState('')
  const [busca, setBusca] = useState('')
  const [fResp, setFResp] = useState('')
  const [fBanco, setFBanco] = useState('')
  const [fTag, setFTag] = useState('')
  const [aberto, setAberto] = useState(null)
  const [modal, setModal] = useState(null)
  const [resolver, setResolver] = useState(null)
  const [arrastando, setArrastando] = useState(null)
  const [colHover, setColHover] = useState(null)
  const [mes, setMes] = useState(() => hojeISO().slice(0, 7))
  const [verFechados, setVerFechados] = useState(false)
  const [verResolvidas, setVerResolvidas] = useState(false)

  const carregar = useCallback(async () => {
    const reqs = [supabase.rpc('posdef_lista')]
    if (!soLeitura) reqs.push(supabase.rpc('posdef_inss_lista'), supabase.rpc('posdef_pendencias_lista'))
    const [l, i, p] = await Promise.all(reqs)
    if (l.error) mostrar('Erro ao carregar: ' + l.error.message, 'erro')
    setLista(Array.isArray(l.data) ? l.data : [])
    if (i) setInss(Array.isArray(i.data) ? i.data : [])
    if (p) setPends(Array.isArray(p.data) ? p.data : [])
  }, [mostrar, soLeitura])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { const t = setInterval(carregar, 60000); return () => clearInterval(t) }, [carregar])
  useEffect(() => {
    const f = (e) => { if (e.key === 'Escape' && !modal && !resolver) setAberto(null) }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [modal, resolver])

  const responsaveis = useMemo(() => [...new Set([...(lista || []), ...inss, ...pends].flatMap(c => c.responsaveis || []))].sort(), [lista, inss, pends])
  const bancos = useMemo(() => [...new Set((lista || []).map(c => c.banco).filter(Boolean))].sort(), [lista])

  const casa = useCallback((c) => {
    const q = busca.trim().toLowerCase()
    const qd = soDig(busca)
    if (q && !(String(c.nome || '').toLowerCase().includes(q) || (qd.length >= 3 && String(c.cpf || '').includes(qd)) || (qd.length >= 4 && soDig(c.telefone).includes(qd)))) return false
    if (fResp && !(c.responsaveis || []).includes(fResp)) return false
    return true
  }, [busca, fResp])

  const filtrada = useMemo(() => (lista || []).filter(c => {
    if (!casa(c)) return false
    if (fBanco && c.banco !== fBanco) return false
    if (fTag === 'prevsempre' && !c.prevsempre) return false
    if (fTag === 'honorario' && c.prevsempre_honorario_auto !== true) return false
    if (fTag === 'normal' && c.prevsempre_honorario_auto === true) return false
    if (fTag === 'inadimplente' && !inadimplente(c)) return false
    return true
  }), [lista, casa, fBanco, fTag])
  const inssF = useMemo(() => inss.filter(casa), [inss, casa])
  const pendsF = useMemo(() => pends.filter(casa), [pends, casa])

  const hoje = hojeISO()
  const amanha = somaDias(hoje, 1)
  const depois = somaDias(hoje, 2)
  const fimSemana = somaDias(hoje, 6)

  const agenda = useMemo(() => {
    const itens = []
    filtrada.forEach(c => itensAgenda(c).forEach(it => itens.push({ ...it, c })))
    // pendencia com data combinada entra na agenda
    pendsF.filter(p => p.status !== 'resolvida' && p.prazo).forEach(p => itens.push({ tipo: 'pendencia', data: p.prazo, texto: `${catPend(p.categoria).rot}: ${p.descricao}`, c: p, pend: p }))
    const ord = (a, b) => String(a.data).localeCompare(String(b.data)) || (a.tipo === 'pagamento' ? -1 : 1)
    return {
      atrasados: itens.filter(i => i.data < hoje).sort(ord),
      hoje: itens.filter(i => i.data === hoje).sort(ord),
      amanha: itens.filter(i => i.data === amanha).sort(ord),
      depois: itens.filter(i => i.data === depois).sort(ord),
      semana: itens.filter(i => i.data > depois && i.data <= somaDias(hoje, 7)).sort(ord),
      futuro: itens.filter(i => i.data > somaDias(hoje, 7)).sort(ord),
    }
  }, [filtrada, pendsF, hoje, amanha, depois])

  // inadimplencia: conta no MES DA DATA AGENDADA do pagamento (regra do Bruno, 29/10)
  const porMes = useMemo(() => {
    const m = {}
    filtrada.filter(c => c.data_pagamento || c.etapa === 'baixado').forEach(c => {
      const k = mesDe(c); if (!k) return
      const r = m[k] || (m[k] = { mes: k, agendados: 0, pagos: 0, emDia: 0, inad: 0, aberto: 0, honor: 0 })
      if (c.etapa === 'cancelado') return
      r.agendados++
      if (c.etapa === 'baixado') {
        r.pagos++; r.honor += Number(c.honorario_valor || 0)
        if (!c.data_pagamento || !c.pago_em || diasApos(c.data_pagamento) === null || (new Date(c.pago_em + 'T12:00:00') - new Date(c.data_pagamento + 'T12:00:00')) / 86400000 <= DIAS_INADIMPLENTE) r.emDia++
      } else if (inadimplente(c)) r.inad++
      else r.aberto++
    })
    return m
  }, [filtrada])
  const mesAtual = hoje.slice(0, 7)
  const rm = porMes[mesAtual] || { pagos: 0, inad: 0, honor: 0 }
  const taxa = (r) => ((r.pagos + r.inad) ? Math.round((r.inad / (r.pagos + r.inad)) * 100) : 0)

  const conta = useMemo(() => ({
    semCarta: filtrada.filter(c => c.etapa === 'deferido' || c.etapa === 'carta').length,
    amanha: filtrada.filter(c => ESPERANDO.includes(c.etapa) && c.data_pagamento === amanha).length,
    semana: filtrada.filter(c => ESPERANDO.includes(c.etapa) && c.data_pagamento >= hoje && c.data_pagamento <= fimSemana).length,
    atrasados: filtrada.filter(atrasado).length,
    pendAbertas: pendsF.filter(p => p.status === 'aberta').length,
  }), [filtrada, pendsF, hoje, amanha, fimSemana])

  const abrirAcao = (caso, acao, inicial) => setModal({ caso, acao, inicial })
  function soltar(col) {
    const c = (lista || []).find(x => x.id === arrastando)
    setArrastando(null); setColHover(null)
    if (!c || colunaDe(c) === col) return
    if (c.pode_agir === false) { mostrar('Só o responsável atualiza este caso.', 'erro'); return }
    const [acao, inicial] = acaoDoDropPD(c, col)
    if (acao === '__auto') { mostrar('"Pagamento atrasado" é automático: entra quando passa a data do pagamento.', 'erro'); return }
    if (acao) abrirAcao(c, acao, inicial)
    else mostrar('Esse movimento não existe — abra o card e use os botões.', 'erro')
  }

  // ------------------------------------------------------------ pecas
  const kpi = ({ rot, n, sub, cor, icone, onClick }) => (
    <button key={rot} onClick={onClick} style={{ ...card, padding: '14px 16px', textAlign: 'left', cursor: onClick ? 'pointer' : 'default', fontFamily: 'inherit', position: 'relative', overflow: 'hidden', minWidth: 0 }}>
      <div style={{ position: 'absolute', right: -14, top: -14, width: 70, height: 70, borderRadius: 999, background: hexA(cor, 0.09) }} />
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: cores.suave }}>{icone} {rot}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: cor, lineHeight: 1.1, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{lista ? n : '—'}</div>
      {sub && <div style={{ fontSize: 12, color: cores.suave, marginTop: 2 }}>{sub}</div>}
    </button>
  )

  const cartao = (c) => {
    const col = colunaDe(c)
    const et = etapaPD(col)
    const dias = diasDesde(c.etapa_desde)
    const dPag = c.data_pagamento ? -diasApos(c.data_pagamento) : null
    const pagAtivo = ESPERANDO.includes(c.etapa)
    const arrasta = !isMobile && !soLeitura && c.pode_agir !== false
    return (
      <div key={c.id} draggable={arrasta}
        onDragStart={(e) => { e.dataTransfer.setData('text/plain', c.id); e.dataTransfer.effectAllowed = 'move'; setArrastando(c.id) }}
        onDragEnd={() => { setArrastando(null); setColHover(null) }}
        onClick={() => setAberto(c.id)} className="kr-cartao"
        style={{ minWidth: 0, background: '#fff', borderRadius: 14, border: `1px solid ${c.prevsempre ? hexA(AZUL_PREV, 0.35) : cores.cardBorda}`, borderLeft: c.prevsempre ? `4px solid ${AZUL_PREV}` : `1px solid ${cores.cardBorda}`, padding: 12, boxShadow: arrastando === c.id ? sombras.cardHover : '0 1px 2px rgba(15,23,42,.05)', cursor: arrasta ? 'grab' : 'pointer', opacity: arrastando === c.id ? 0.55 : 1, transition: 'box-shadow .15s, transform .15s' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ width: 34, height: 34, borderRadius: 11, background: hexA(et.cor, 0.12), color: et.cor, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 12.5, flexShrink: 0 }}>{iniciais(c.nome)}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 750, color: cores.texto, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{c.nome || 'Sem nome'}</div>
            <div style={{ fontSize: 11.5, color: cores.suave, marginTop: 2 }}>{soLeitura ? (c.vendedora_nome || '') : ((c.responsaveis || []).join(', ') || '—')}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}><Tags c={c} /></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 11.5, color: cores.suave, gap: 6 }}>
          <span style={{ fontWeight: pagAtivo && dPag != null && dPag <= 1 ? 800 : 500, color: pagAtivo && dPag != null ? (dPag < 0 ? cores.perigo : dPag <= 1 ? '#d97706' : cores.suave) : cores.suave }}>
            {c.etapa === 'baixado' ? `🤝 pagou ${fmtData(c.pago_em)}`
              : pagAtivo && c.data_pagamento ? `💰 ${fmtData(c.data_pagamento)}${dPag === 0 ? ' · HOJE' : dPag === 1 ? ' · amanhã' : ''}`
              : c.etapa === 'deferido' && !c.cliente_avisada_em ? '📣 avisar cliente'
              : `há ${dias} dia${dias === 1 ? '' : 's'}`}
          </span>
          <span style={{ whiteSpace: 'nowrap' }}>{bancoCurto(c.banco)}</span>
        </div>
        {c.proxima_atividade && <div style={{ marginTop: 7, fontSize: 11.5, color: '#0f766e', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📅 {fmtData(c.proxima_atividade_em)} · {c.proxima_atividade}</div>}
      </div>
    )
  }

  const selectSt = { padding: '9px 10px', borderRadius: 11, border: `1px solid ${hexA('#0f172a', 0.12)}`, fontSize: 13, background: '#fff' }
  const filtroPos = ['pagamentos', 'agenda', 'funil', 'calendario', 'lista', 'inadimplencia'].includes(aba)
  const filtros = (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 0 }}>
        <span style={{ position: 'absolute', left: 11, top: 9, color: cores.suave, fontSize: 14 }}>⌕</span>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome, CPF ou telefone"
          style={{ width: '100%', padding: '9px 12px 9px 30px', borderRadius: 11, border: `1px solid ${hexA('#0f172a', 0.12)}`, fontSize: 13.5, boxSizing: 'border-box', background: '#fff' }} />
      </div>
      {responsaveis.length > 1 && !soLeitura && (
        <select value={fResp} onChange={e => setFResp(e.target.value)} style={selectSt}>
          <option value="">Todos os responsáveis</option>
          {responsaveis.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      )}
      {filtroPos && bancos.length > 0 && (
        <select value={fBanco} onChange={e => setFBanco(e.target.value)} style={selectSt}>
          <option value="">Todos os bancos</option>
          {bancos.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      )}
      {filtroPos && (
        <select value={fTag} onChange={e => setFTag(e.target.value)} style={{ ...selectSt, ...(fTag ? { border: `1.5px solid ${AZUL_PREV}`, color: AZUL_PREV, fontWeight: 700 } : {}) }}>
          <option value="">Todas as etiquetas</option>
          <option value="prevsempre">Só PrevSempre</option>
          <option value="honorario">Honorário automático</option>
          <option value="normal">Acompanhamento normal</option>
          <option value="inadimplente">Inadimplentes</option>
        </select>
      )}
      {(busca || fResp || fBanco || fTag) && <button onClick={() => { setBusca(''); setFResp(''); setFBanco(''); setFTag('') }} style={{ ...btn(cores.perigo, false), padding: '8px 11px', fontSize: 12 }}>✕ Limpar filtros</button>}
    </div>
  )

  // ------------------------------------------------------------ agenda
  const linhaAgenda = (it, i) => {
    const c = it.c
    const t = TIPO_AGENDA[it.tipo]
    const wa = telWa(c.telefone)
    const ehPend = it.tipo === 'pendencia'
    const acaoRapida = ehPend ? null : it.tipo === 'pagamento' ? (c.etapa === 'prevsempre' ? 'prevsempre' : 'cliente_pagou') : it.tipo === 'avisar' ? 'avisar_cliente' : it.tipo === 'sem_carta' ? 'carta' : 'atividade_feita'
    const cfg = acaoRapida ? ACOES_PD[acaoRapida] : null
    const podeAgir = !soLeitura && !ehPend && c.pode_agir !== false
    return (
      <div key={(c.id || '') + it.tipo + i} className="kr-linha" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderTop: i ? `1px solid ${cores.cardBorda}` : 'none', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
        <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 4, background: c.prevsempre ? AZUL_PREV : t.cor, flexShrink: 0 }} />
        <div onClick={() => (ehPend ? setAba('pendencias') : setAberto(c.id))} style={{ flex: '1 1 220px', minWidth: 0, cursor: 'pointer' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip cor={t.cor} forte>{t.icone} {t.r}</Chip>
            <span style={{ fontSize: 14, fontWeight: 750, color: cores.texto }}>{c.nome}</span>
            {!ehPend && <Tags c={c} />}
          </div>
          <div style={{ fontSize: 12.5, color: cores.suave, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isMobile ? 'normal' : 'nowrap' }}>
            {it.data && it.data < hoje && <b style={{ color: cores.perigo }}>{fmtData(it.data)} · </b>}
            {it.texto}{c.valor_beneficio && it.tipo === 'pagamento' ? ` · ${reais(c.valor_beneficio)}` : ''} · {fmtTel(c.telefone)} · {(c.responsaveis || []).join(', ')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {it.tipo === 'pagamento' && <button title="Copiar lembrete para a cliente" onClick={async () => mostrar((await copiarTexto(msgPagamento(c))) ? 'Lembrete copiado' : 'Não consegui copiar')} style={{ ...btn('#475569', false), padding: '6px 9px', fontSize: 12 }}>⧉ Lembrete</button>}
          {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" style={{ ...btn('#16a34a', false), padding: '6px 9px', fontSize: 12, textDecoration: 'none' }}>WhatsApp</a>}
          {ehPend && <button onClick={() => setAba('pendencias')} style={{ ...btn('#b45309'), padding: '6px 10px', fontSize: 12 }}>📌 Resolver</button>}
          {podeAgir && cfg && <button onClick={() => abrirAcao(c, acaoRapida)} style={{ ...btn(cfg.cor), padding: '6px 10px', fontSize: 12 }}>{cfg.icone} {acaoRapida === 'cliente_pagou' ? 'Pagou' : acaoRapida === 'prevsempre' ? 'PrevSempre' : acaoRapida === 'avisar_cliente' ? 'Avisei' : acaoRapida === 'carta' ? 'Lançar carta' : 'Feito'}</button>}
        </div>
      </div>
    )
  }
  const blocoAgenda = (titulo, itens, cor, vazio, sub) => (
    <div style={{ ...card, padding: 0, overflow: 'hidden', border: itens.length && cor === cores.perigo ? `1.5px solid ${hexA(cores.perigo, 0.4)}` : card.border }}>
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8, background: hexA(cor, 0.06), borderBottom: `1px solid ${cores.cardBorda}` }}>
        <span style={{ width: 9, height: 9, borderRadius: 999, background: cor, boxShadow: `0 0 0 4px ${hexA(cor, 0.15)}` }} />
        <span style={{ fontSize: 14, fontWeight: 800, color: cores.texto }}>{titulo}</span>
        {sub && <span style={{ fontSize: 12, color: cores.suave }}>{sub}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 800, color: cor, background: hexA(cor, 0.12), borderRadius: 999, padding: '1px 10px' }}>{itens.length}</span>
      </div>
      {itens.length ? itens.map(linhaAgenda) : <div style={{ padding: '16px 14px', fontSize: 13, color: cores.suave }}>{vazio}</div>}
    </div>
  )
  const agendaView = (
    <div style={{ display: 'grid', gap: 14 }}>
      {agenda.atrasados.length > 0 && blocoAgenda('Atrasados', agenda.atrasados, cores.perigo, '', 'pagamento que passou do dia, atividade vencida, pendência vencida ou cliente ainda não avisada')}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0,1fr))', gap: 14, alignItems: 'start' }}>
        {blocoAgenda('Hoje', agenda.hoje, '#d97706', 'Nada para hoje.', `${diaSemana(hoje)} ${fmtData(hoje)}`)}
        {blocoAgenda('Amanhã', agenda.amanha, '#7c3aed', 'Nada para amanhã.', `${diaSemana(amanha)} ${fmtData(amanha)}`)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0,1fr))', gap: 14, alignItems: 'start' }}>
        {blocoAgenda('Depois de amanhã', agenda.depois, '#2563eb', 'Nada agendado.', `${diaSemana(depois)} ${fmtData(depois)}`)}
        {blocoAgenda('Próximos 7 dias', agenda.semana, '#64748b', 'Nada nos próximos dias.')}
      </div>
      {agenda.futuro.length > 0 && blocoAgenda('Mais adiante', agenda.futuro, '#94a3b8', '')}
      {(() => {
        const semData = filtrada.filter(c => c.etapa === 'carta' && !c.proxima_atividade_em)
        return semData.length > 0 && blocoAgenda('Aguardando carta de concessão (sem atividade agendada)', semData.map(c => ({ tipo: 'sem_carta', data: '', texto: `aguardando carta há ${diasDesde(c.etapa_desde)} dia(s) — agende uma cobrança`, c })), '#0891b2', '')
      })()}
    </div>
  )

  // ------------------------------------------------------------ funil
  const funil = (
    <div style={{ overflowX: 'auto', paddingBottom: 8, margin: '0 -4px' }}>
      <div style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: isMobile ? '82vw' : 'minmax(225px, 1fr)', gap: 12, padding: '0 4px', minWidth: isMobile ? 'auto' : COLUNAS_PD.length * 225 }}>
        {COLUNAS_PD.map(k => {
          const et = etapaPD(k)
          let itens = filtrada.filter(c => colunaDe(c) === k)
          if (k === 'baixado' && !verFechados) itens = itens.filter(c => diasDesde(c.baixa_em) <= 30)
          itens = itens.sort((a, b) => (['aguardando_pagamento', 'prevsempre', 'atrasado'].includes(k))
            ? String(a.data_pagamento || '9').localeCompare(String(b.data_pagamento || '9'))
            : new Date(b.ultima_movimentacao_em) - new Date(a.ultima_movimentacao_em))
          const alvo = arrastando && colHover === k
          return (
            <div key={k}
              onDragOver={e => { if (arrastando) { e.preventDefault(); setColHover(k) } }}
              onDragLeave={() => setColHover(h => (h === k ? null : h))}
              onDrop={e => { e.preventDefault(); soltar(k) }}
              style={{ background: alvo ? hexA(et.cor, 0.09) : k === 'atrasado' && itens.length ? hexA(cores.perigo, 0.04) : 'rgba(241,245,249,.75)', borderRadius: 18, padding: 10, border: `1.5px ${alvo ? 'dashed' : 'solid'} ${alvo ? et.cor : 'rgba(15,23,42,.05)'}`, minHeight: 420, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px 2px' }}>
                <span style={{ width: 9, height: 9, borderRadius: 999, background: et.cor, boxShadow: `0 0 0 4px ${hexA(et.cor, 0.15)}` }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: cores.texto, flex: 1 }}>{et.label}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: et.cor, background: hexA(et.cor, 0.12), borderRadius: 999, padding: '1px 9px' }}>{itens.length}</span>
              </div>
              {k === 'atrasado' && <div style={{ fontSize: 11.5, color: cores.suave, padding: '0 4px' }}>Entra sozinho quando passa a data. Mais de {DIAS_INADIMPLENTE} dias = inadimplente.</div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 9, alignContent: 'start', overflowY: 'auto', maxHeight: 'calc(100vh - 330px)', minHeight: 60, paddingRight: 2 }}>
                {itens.map(cartao)}
                {itens.length === 0 && <div style={{ fontSize: 12.5, color: cores.suave, textAlign: 'center', padding: '22px 8px', border: `1.5px dashed ${hexA('#0f172a', 0.1)}`, borderRadius: 14 }}>{arrastando ? 'Solte aqui' : 'Nenhum caso'}</div>}
              </div>
            </div>
          )
        })}
      </div>
      {!isMobile && !soLeitura && <div style={{ fontSize: 12, color: cores.suave, marginTop: 10 }}>Arraste o card para a próxima etapa — o formulário abre pedindo o que é obrigatório. Banco Mercantil vai sozinho para a PrevSempre. Clique no card para abrir a ficha.</div>}
      <label style={{ fontSize: 12.5, color: cores.suave, display: 'inline-flex', gap: 6, alignItems: 'center', marginTop: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={verFechados} onChange={e => setVerFechados(e.target.checked)} /> mostrar pagos antigos e cancelados
      </label>
      {verFechados && filtrada.some(c => c.etapa === 'cancelado') && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10, marginTop: 10 }}>
          {filtrada.filter(c => c.etapa === 'cancelado').map(cartao)}
        </div>
      )}
    </div>
  )

  // ------------------------------------------------------------ calendario do mes
  const calendario = (() => {
    const [a, m] = mes.split('-').map(Number)
    const primeiro = new Date(a, m - 1, 1)
    const ini = (primeiro.getDay() + 6) % 7
    const nDias = new Date(a, m, 0).getDate()
    const porDia = {}
    filtrada.forEach(c => itensAgenda(c).forEach(it => { if (it.data && it.data.startsWith(mes)) (porDia[it.data] = porDia[it.data] || []).push({ ...it, c }) }))
    const cels = []
    for (let i = 0; i < ini; i++) cels.push(null)
    for (let d = 1; d <= nDias; d++) cels.push(`${mes}-${String(d).padStart(2, '0')}`)
    const mudar = (n) => { const d = new Date(a, m - 1 + n, 1); setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) }
    const nm = primeiro.toLocaleDateString('pt-BR', { month: 'long' })
    const nomeMes = `${nm.charAt(0).toUpperCase()}${nm.slice(1)} de ${a}`
    return (
      <div style={{ ...card, padding: isMobile ? 10 : 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <button onClick={() => mudar(-1)} style={{ ...btn('#475569', false), padding: '6px 11px' }}>‹</button>
          <div style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 800, color: cores.texto }}>{nomeMes}</div>
          <button onClick={() => setMes(hoje.slice(0, 7))} style={{ ...btn('#475569', false), padding: '6px 11px', fontSize: 12 }}>Hoje</button>
          <button onClick={() => mudar(1)} style={{ ...btn('#475569', false), padding: '6px 11px' }}>›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: isMobile ? 3 : 6 }}>
          {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map(d => <div key={d} style={{ fontSize: 11, fontWeight: 800, color: cores.suave, textAlign: 'center', textTransform: 'uppercase' }}>{d}</div>)}
          {cels.map((iso, i) => {
            if (!iso) return <div key={'v' + i} />
            const its = porDia[iso] || []
            const eHoje = iso === hoje
            return (
              <div key={iso} style={{ minHeight: isMobile ? 54 : 96, borderRadius: 10, padding: isMobile ? 4 : 6, background: eHoje ? hexA('#d97706', 0.08) : iso < hoje ? '#fafbfc' : '#fff', border: `1px solid ${eHoje ? hexA('#d97706', 0.5) : cores.cardBorda}`, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: eHoje ? '#b45309' : cores.suave }}>{Number(iso.slice(8))}</div>
                {isMobile ? (its.length > 0 && <div style={{ marginTop: 3, fontSize: 11, fontWeight: 800, color: '#7c3aed' }}>● {its.length}</div>) : (
                  <div style={{ display: 'grid', gap: 3, marginTop: 4 }}>
                    {its.slice(0, 4).map((it, j) => (
                      <div key={j} onClick={() => setAberto(it.c.id)} title={`${it.c.nome} — ${it.texto}`} style={{ fontSize: 11, fontWeight: 700, cursor: 'pointer', borderRadius: 6, padding: '2px 5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#fff', background: inadimplente(it.c) && it.tipo === 'pagamento' ? cores.perigo : it.c.prevsempre ? AZUL_PREV : TIPO_AGENDA[it.tipo].cor }}>
                        {TIPO_AGENDA[it.tipo].icone} {primeiroNome(it.c.nome)}
                      </div>
                    ))}
                    {its.length > 4 && <div style={{ fontSize: 11, color: cores.suave }}>+{its.length - 4}</div>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12, fontSize: 12, color: cores.suave }}>
          {['pagamento', 'atividade', 'avisar'].map(k => <span key={k}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: TIPO_AGENDA[k].cor, marginRight: 5 }} />{TIPO_AGENDA[k].r}</span>)}
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: AZUL_PREV, marginRight: 5 }} />PrevSempre</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: cores.perigo, marginRight: 5 }} />Inadimplente</span>
        </div>
      </div>
    )
  })()

  // ------------------------------------------------------------ no INSS (so leitura)
  const inssView = (() => {
    const grupos = [
      ['problema', 'Com problema', cores.perigo, 'pendência, exigência ou indeferimento — veja a aba Pendências'],
      ['analise', 'Em análise no INSS', '#8b5cf6', 'protocolado, aguardando resposta'],
      ['fila', 'Na fila para protocolar', '#3b82f6', 'contrato assinado, a advogada ainda vai protocolar'],
    ]
    return (
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ ...card, padding: '11px 16px', fontSize: 13, color: cores.suave }}>🔒 <b style={{ color: cores.texto }}>Só acompanhamento.</b> Quem mexe nesta etapa é a advogada. Aqui você vê em que pé está cada contrato e há quanto tempo, para ir alinhando com a cliente.</div>
        {grupos.map(([g, tit, cor, sub]) => {
          const itens = inssF.filter(c => (ETAPAS_INSS[c.etapa] || {}).grupo === g)
          return (
            <div key={g} style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8, background: hexA(cor, 0.06), borderBottom: `1px solid ${cores.cardBorda}`, flexWrap: 'wrap' }}>
                <span style={{ width: 9, height: 9, borderRadius: 999, background: cor, boxShadow: `0 0 0 4px ${hexA(cor, 0.15)}` }} />
                <span style={{ fontSize: 14, fontWeight: 800, color: cores.texto }}>{tit}</span>
                <span style={{ fontSize: 12, color: cores.suave }}>{sub}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 800, color: cor, background: hexA(cor, 0.12), borderRadius: 999, padding: '1px 10px' }}>{itens.length}</span>
              </div>
              {itens.length === 0 && <div style={{ padding: '14px', fontSize: 13, color: cores.suave }}>Nenhum.</div>}
              {itens.map((c, i) => {
                const e = ETAPAS_INSS[c.etapa]
                const d = diasDesde(c.etapa_desde)
                const dProt = c.data_protocolo ? diasApos(c.data_protocolo) : null
                return (
                  <div key={c.id} className="kr-linha" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px', borderTop: i ? `1px solid ${cores.cardBorda}` : 'none', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Chip cor={e.cor} forte>{e.icone} {e.rot}</Chip>
                        <span style={{ fontSize: 14, fontWeight: 750, color: cores.texto }}>{c.nome}</span>
                        {c.pend_abertas > 0 && <button onClick={() => setAba('pendencias')} style={{ border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 800, color: '#b45309', background: hexA('#b45309', 0.1), borderRadius: 999, padding: '2px 9px' }}>📌 {c.pend_abertas} pendência{c.pend_abertas > 1 ? 's' : ''}</button>}
                      </div>
                      <div style={{ fontSize: 12.5, color: cores.suave, marginTop: 3 }}>
                        {fmtCpf(c.cpf)} · venda: {c.vendedora_nome || '—'}{c.perfil ? ` · ${c.perfil}` : ''}
                        {c.etapa === 'exigencia' && c.exigencia_prazo ? <b style={{ color: cores.perigo }}> · prazo do INSS {fmtData(c.exigencia_prazo)}</b> : null}
                        {c.motivo && ['indeferido', 'recurso_indeferido'].includes(c.etapa) ? ` · ${c.motivo}` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 12.5, color: cores.suave, minWidth: 140 }}>
                      {c.numero_protocolo && <div>nº <b style={{ color: cores.texto }}>{c.numero_protocolo}</b></div>}
                      <div style={{ fontWeight: 700, color: (g === 'fila' && d > 3) || (g === 'analise' && dProt > 45) ? cores.perigo : cores.texto }}>
                        {g === 'analise' && dProt != null ? `em análise há ${dProt} dia${dProt === 1 ? '' : 's'}` : `há ${d} dia${d === 1 ? '' : 's'} nesta etapa`}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    )
  })()

  // ------------------------------------------------------------ pendencias para resolver
  const cartaoPend = (p) => {
    const cat = catPend(p.categoria)
    const fechada = p.status === 'resolvida'
    const andamento = p.status === 'avisado'
    const venc = andamento && p.prazo && p.prazo < hoje
    const wa = telWa(p.telefone)
    return (
      <div key={p.id} style={{ ...card, padding: 0, overflow: 'hidden', opacity: fechada ? 0.75 : 1, border: `1.5px solid ${fechada ? cores.cardBorda : venc ? hexA(cores.perigo, 0.5) : hexA(cat.cor, 0.35)}` }}>
        <div style={{ padding: '11px 14px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', background: hexA(cat.cor, 0.07) }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 800, color: '#fff', background: cat.cor, borderRadius: 999, padding: '3px 11px' }}>{cat.icone} {cat.rot}</span>
          <span style={{ fontSize: 14.5, fontWeight: 800, color: cores.texto }}>{p.nome}</span>
          <span style={{ fontSize: 12, color: cores.suave }}>{fmtCpf(p.cpf)} · venda: {p.vendedora_nome || '—'}</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: cores.suave }}>aberta por <b>{p.aberta_por || '—'}</b> · há {p.dias_aberta} dia{p.dias_aberta === 1 ? '' : 's'}</span>
        </div>
        <div style={{ padding: 14, display: 'grid', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.07em', color: cores.suave, textTransform: 'uppercase' }}>O que precisa</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: cores.texto, marginTop: 3, whiteSpace: 'pre-wrap' }}>{p.descricao}</div>
            {cat.explica && <div style={{ fontSize: 12.5, color: cores.suave, marginTop: 3 }}>{cat.explica}</div>}
            {p.categoria === 'exigencia_inss' && p.exigencia_prazo && <div style={{ fontSize: 12.5, color: cores.perigo, fontWeight: 700, marginTop: 3 }}>Prazo do INSS: {fmtData(p.exigencia_prazo)}</div>}
          </div>
          {(andamento || fechada) && p.resolucao && (
            <div style={{ fontSize: 13, borderRadius: 10, padding: '8px 11px', background: venc ? hexA(cores.perigo, 0.08) : fechada ? hexA(cores.ok, 0.08) : hexA('#2563eb', 0.07), color: cores.texto }}>
              <b>{fechada ? 'Resolvida' : venc ? 'Combinado e VENCIDO' : 'Combinado'}:</b> {rotResolucao(p.categoria, p.resolucao)}{p.resolucao_data ? ` · ${fmtData(p.resolucao_data)}` : ''}{p.resolucao_texto ? ` — ${p.resolucao_texto}` : ''}
              {fechada && <span style={{ color: cores.suave }}> · {p.resolvida_por} {fmtDataHora(p.resolvida_em)}{RESOLUCOES_NEGATIVAS.includes(p.resolucao) ? ' · advogada vai decidir' : ' · com a advogada para refazer'}</span>}
            </div>
          )}
          {!fechada && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.07em', color: cores.suave, textTransform: 'uppercase', marginBottom: 6 }}>Como resolver</div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : `repeat(${cat.opcoes.length}, minmax(0,1fr))`, gap: 8 }}>
                {cat.opcoes.map(o => {
                  const cor = o.negativa ? cores.perigo : o.andamento ? '#2563eb' : cores.ok
                  return (
                    <button key={o.v} onClick={() => setResolver({ pend: p, opcao: o.v })} style={{ textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 12, padding: '10px 12px', border: `1.5px solid ${hexA(cor, 0.35)}`, background: hexA(cor, 0.05) }}>
                      <div style={{ fontSize: 13.5, fontWeight: 800, color: cor }}>{o.negativa ? '✕' : o.andamento ? '🗓️' : '✔'} {o.rot}</div>
                      <div style={{ fontSize: 12, color: cores.suave, marginTop: 2 }}>{o.dica}</div>
                    </button>
                  )
                })}
              </div>
              {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" style={{ ...btn('#16a34a', false), padding: '6px 11px', fontSize: 12, textDecoration: 'none', marginTop: 10 }}>WhatsApp da cliente · {fmtTel(p.telefone)}</a>}
            </div>
          )}
        </div>
      </div>
    )
  }
  const pendView = (() => {
    const abertas = pendsF.filter(p => p.status === 'aberta')
    const andamento = pendsF.filter(p => p.status === 'avisado')
    const resolvidas = pendsF.filter(p => p.status === 'resolvida')
    const titulo = (t, n, cor, sub) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 2px' }}>
        <span style={{ width: 9, height: 9, borderRadius: 999, background: cor, boxShadow: `0 0 0 4px ${hexA(cor, 0.15)}` }} />
        <span style={{ fontSize: 15, fontWeight: 800, color: cores.texto }}>{t}</span>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: cor, background: hexA(cor, 0.12), borderRadius: 999, padding: '1px 10px' }}>{n}</span>
        {sub && <span style={{ fontSize: 12, color: cores.suave }}>{sub}</span>}
      </div>
    )
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        {titulo('Para resolver', abertas.length, '#b45309', 'abertas pela advogada ou pela Sthefany')}
        {abertas.length === 0 && <div style={{ ...card, padding: 20, fontSize: 13, color: cores.suave }}>Nenhuma pendência aberta. 🎉</div>}
        {abertas.map(cartaoPend)}
        {andamento.length > 0 && titulo('Em andamento', andamento.length, '#2563eb', 'com data combinada — aparecem na agenda')}
        {andamento.map(cartaoPend)}
        {resolvidas.length > 0 && (
          <button onClick={() => setVerResolvidas(v => !v)} style={{ ...btn('#475569', false), justifySelf: 'start' }}>{verResolvidas ? 'Esconder' : 'Ver'} resolvidas nos últimos 7 dias ({resolvidas.length})</button>
        )}
        {verResolvidas && resolvidas.map(cartaoPend)}
      </div>
    )
  })()

  // ------------------------------------------------------------ pagamentos (29/10, Bruno)
  // O coracao do setor: quem recebe hoje, amanha e na semana, para o time programar a
  // cobranca. Dois jeitos de acompanhar:
  //  - DESCONTO AUTOMATICO (PrevSempre + aceitou): avisar a cliente e conferir na PrevSempre;
  //  - COBRAR A CLIENTE (qualquer outro): lembrar antes e cobrar o honorario quando cair.
  const tipoCobranca = (c) => (ehAutomatico(c) ? 'auto' : c.etapa === 'prevsempre' ? 'prev_pendente' : 'cobrar')
  const TIPO_COBRANCA = {
    auto: { rot: 'Desconto automático', icone: '🏦', cor: AZUL_PREV, faz: 'Avisar a cliente e conferir na PrevSempre se o honorário foi descontado' },
    prev_pendente: { rot: 'PrevSempre a confirmar', icone: '❓', cor: '#d97706', faz: 'Confirmar conta e honorário automático antes do pagamento' },
    cobrar: { rot: 'Cobrar cliente', icone: '💳', cor: '#7c3aed', faz: 'Lembrar a cliente antes e cobrar o honorário quando cair' },
  }
  const pagamentos = useMemo(() => {
    const base = filtrada.filter(c => ESPERANDO.includes(c.etapa) && c.data_pagamento)
    const noPeriodo = (c) => {
      const d = c.data_pagamento
      if (pgPeriodo === 'hoje') return d === hoje
      if (pgPeriodo === 'amanha') return d === amanha
      if (pgPeriodo === 'semana') return d >= hoje && d <= fimSemana
      if (pgPeriodo === '30') return d >= hoje && d <= somaDias(hoje, 30)
      if (pgPeriodo === 'atrasados') return d < hoje
      return true
    }
    return base.filter(noPeriodo).filter(c => !pgTipo || tipoCobranca(c) === pgTipo)
      .sort((a, b) => String(a.data_pagamento).localeCompare(String(b.data_pagamento)) || String(a.nome).localeCompare(String(b.nome)))
  }, [filtrada, pgPeriodo, pgTipo, hoje, amanha, fimSemana])
  const contaPg = useMemo(() => {
    const base = filtrada.filter(c => ESPERANDO.includes(c.etapa) && c.data_pagamento)
    return {
      hoje: base.filter(c => c.data_pagamento === hoje).length,
      amanha: base.filter(c => c.data_pagamento === amanha).length,
      semana: base.filter(c => c.data_pagamento >= hoje && c.data_pagamento <= fimSemana).length,
      d30: base.filter(c => c.data_pagamento >= hoje && c.data_pagamento <= somaDias(hoje, 30)).length,
      atrasados: base.filter(c => c.data_pagamento < hoje).length,
      todos: base.length,
    }
  }, [filtrada, hoje, amanha, fimSemana])

  const linhaPagamento = (c, i) => {
    const t = TIPO_COBRANCA[tipoCobranca(c)]
    const wa = telWa(c.telefone)
    const podeAgir = !soLeitura && c.pode_agir !== false
    const acao = c.etapa === 'prevsempre' ? 'prevsempre' : 'cliente_pagou'
    return (
      <div key={c.id} className="kr-linha" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderTop: i ? `1px solid ${cores.cardBorda}` : 'none', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
        <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 4, background: inadimplente(c) ? cores.perigo : t.cor, flexShrink: 0 }} />
        <div onClick={() => setAberto(c.id)} style={{ flex: '1 1 260px', minWidth: 0, cursor: 'pointer' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 800, color: '#fff', background: t.cor, borderRadius: 999, padding: '2px 9px' }}>{t.icone} {t.rot}</span>
            <span style={{ fontSize: 14, fontWeight: 750, color: cores.texto }}>{c.nome}</span>
            {inadimplente(c) ? <Chip cor={cores.perigo} forte>INADIMPLENTE · {diasApos(c.data_pagamento)}d</Chip> : atrasado(c) ? <Chip cor="#ea580c" forte>ATRASADO · {diasApos(c.data_pagamento)}d</Chip> : null}
          </div>
          <div style={{ fontSize: 12.5, color: cores.texto, marginTop: 3 }}>
            <b>{bancoCurto(c.banco) || 'banco?'}</b>{c.valor_beneficio ? ` · ${reais(c.valor_beneficio)}` : ''} · {fmtTel(c.telefone)}{!soLeitura ? ` · ${(c.responsaveis || []).join(', ')}` : ''}
          </div>
          <div style={{ fontSize: 12, color: t.cor, fontWeight: 700, marginTop: 2 }}>→ {t.faz}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
          <button title="Copiar lembrete para a cliente" onClick={async () => mostrar((await copiarTexto(msgPagamento(c))) ? 'Lembrete copiado' : 'Não consegui copiar')} style={{ ...btn('#475569', false), padding: '6px 9px', fontSize: 12 }}>⧉ Lembrete</button>
          {wa && <a href={`https://wa.me/${wa}?text=${encodeURIComponent(msgPagamento(c))}`} target="_blank" rel="noreferrer" style={{ ...btn('#16a34a', false), padding: '6px 9px', fontSize: 12, textDecoration: 'none' }}>WhatsApp</a>}
          {podeAgir && <button onClick={() => abrirAcao(c, acao)} style={{ ...btn(acao === 'prevsempre' ? AZUL_PREV : '#15803d'), padding: '6px 10px', fontSize: 12 }}>{acao === 'prevsempre' ? '🏦 Confirmar PrevSempre' : ehAutomatico(c) ? '🤝 Descontou' : '🤝 Pagou'}</button>}
        </div>
      </div>
    )
  }

  const pagamentosView = (() => {
    const chip = (val, set, atual, rot, n, cor) => {
      const on = atual === val
      return (
        <button key={val || 'x'} onClick={() => set(val)} style={{ padding: '8px 13px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: on ? 800 : 600, border: `1.5px solid ${on ? cor : hexA('#0f172a', 0.12)}`, background: on ? hexA(cor, 0.1) : '#fff', color: on ? cor : cores.texto, whiteSpace: 'nowrap' }}>
          {rot}{n != null ? <span style={{ marginLeft: 6, fontWeight: 800, color: cor }}>{n}</span> : null}
        </button>
      )
    }
    const resumo = ['cobrar', 'auto', 'prev_pendente'].map(k => {
      const it = pagamentos.filter(c => tipoCobranca(c) === k)
      return { k, n: it.length, total: it.reduce((s, c) => s + Number(c.valor_beneficio || 0), 0) }
    })
    // agrupa por dia
    const dias = []
    pagamentos.forEach(c => { const u = dias[dias.length - 1]; if (u && u.d === c.data_pagamento) u.itens.push(c); else dias.push({ d: c.data_pagamento, itens: [c] }) })
    const rotDia = (d) => d === hoje ? 'Hoje' : d === amanha ? 'Amanhã' : d === depois ? 'Depois de amanhã' : d < hoje ? `${diasApos(d)} dia${diasApos(d) === 1 ? '' : 's'} atrás` : `daqui ${-diasApos(d)} dias`
    return (
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ ...card, padding: 14, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: cores.suave, marginRight: 4 }}>Quando cai</span>
            {chip('hoje', setPgPeriodo, pgPeriodo, 'Hoje', contaPg.hoje, '#d97706')}
            {chip('amanha', setPgPeriodo, pgPeriodo, 'Amanhã', contaPg.amanha, '#7c3aed')}
            {chip('semana', setPgPeriodo, pgPeriodo, 'Esta semana', contaPg.semana, '#2563eb')}
            {chip('30', setPgPeriodo, pgPeriodo, 'Próximos 30 dias', contaPg.d30, '#0891b2')}
            {chip('atrasados', setPgPeriodo, pgPeriodo, 'Atrasados', contaPg.atrasados, cores.perigo)}
            {chip('todos', setPgPeriodo, pgPeriodo, 'Todos', contaPg.todos, '#475569')}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: cores.suave, marginRight: 4 }}>Como acompanhar</span>
            {chip('', setPgTipo, pgTipo, 'Todos', null, '#475569')}
            {chip('cobrar', setPgTipo, pgTipo, '💳 Cobrar cliente', null, '#7c3aed')}
            {chip('auto', setPgTipo, pgTipo, '🏦 Desconto automático', null, AZUL_PREV)}
            {chip('prev_pendente', setPgTipo, pgTipo, '❓ PrevSempre a confirmar', null, '#d97706')}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0,1fr))', gap: 12 }}>
          {resumo.map(r => {
            const t = TIPO_COBRANCA[r.k]
            return (
              <div key={r.k} style={{ ...card, padding: '12px 14px', borderLeft: `4px solid ${t.cor}` }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: t.cor }}>{t.icone} {t.rot}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: cores.texto, marginTop: 2 }}>{r.n} <span style={{ fontSize: 13, fontWeight: 600, color: cores.suave }}>{r.total ? `· ${reais(r.total)} em benefícios` : ''}</span></div>
                <div style={{ fontSize: 12, color: cores.suave, marginTop: 2 }}>{t.faz}</div>
              </div>
            )
          })}
        </div>
        {dias.length === 0 && <div style={{ ...card, padding: 30, textAlign: 'center', color: cores.suave }}>Nenhum pagamento neste período.</div>}
        {dias.map(g => {
          const cor = g.d < hoje ? cores.perigo : g.d === hoje ? '#d97706' : g.d === amanha ? '#7c3aed' : '#2563eb'
          const nAuto = g.itens.filter(ehAutomatico).length
          return (
            <div key={g.d} style={{ ...card, padding: 0, overflow: 'hidden', border: g.d < hoje ? `1.5px solid ${hexA(cores.perigo, 0.4)}` : card.border }}>
              <div style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: hexA(cor, 0.06), borderBottom: `1px solid ${cores.cardBorda}` }}>
                <span style={{ width: 9, height: 9, borderRadius: 999, background: cor, boxShadow: `0 0 0 4px ${hexA(cor, 0.15)}` }} />
                <span style={{ fontSize: 14.5, fontWeight: 800, color: cores.texto }}>{diaSemana(g.d)} {fmtData(g.d)}</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: cor }}>{rotDia(g.d)}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: cores.suave }}>{g.itens.length} pagamento{g.itens.length === 1 ? '' : 's'}{nAuto ? ` · ${nAuto} automático${nAuto === 1 ? '' : 's'}` : ''}</span>
              </div>
              {g.itens.map(linhaPagamento)}
            </div>
          )
        })}
      </div>
    )
  })()

  // ------------------------------------------------------------ inadimplencia
  const inadView = (() => {
    const meses = Object.values(porMes).sort((a, b) => b.mes.localeCompare(a.mes)).slice(0, 8)
    const inadLista = filtrada.filter(inadimplente).sort((a, b) => String(a.data_pagamento).localeCompare(String(b.data_pagamento)))
    const porResp = {}
    filtrada.filter(c => mesDe(c) === mesAtual && c.etapa !== 'cancelado').forEach(c => (c.responsaveis || ['—']).forEach(r => {
      const x = porResp[r] || (porResp[r] = { r, pagos: 0, inad: 0 })
      if (c.etapa === 'baixado') x.pagos++; else if (inadimplente(c)) x.inad++
    }))
    const th = { padding: '9px 12px', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: cores.suave, textAlign: 'right', whiteSpace: 'nowrap' }
    const td = { padding: '9px 12px', fontSize: 13.5, textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderTop: `1px solid ${cores.cardBorda}` }
    return (
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ ...card, padding: '11px 16px', fontSize: 13, color: cores.suave }}>
          <b style={{ color: cores.texto }}>Regra:</b> inadimplente = passou <b>{DIAS_INADIMPLENTE} dias</b> da data do pagamento e a cliente não pagou. Conta sempre no <b>mês da data agendada</b> (se a data era 29/10 e virou inadimplente em 02/11, conta em outubro).
        </div>
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 620 }}>
            <thead><tr style={{ background: '#f8fafc' }}>
              <th style={{ ...th, textAlign: 'left' }}>Mês (data agendada)</th><th style={th}>Agendados</th><th style={th}>Pagaram</th><th style={th}>Em dia</th><th style={th}>Inadimplentes</th><th style={th}>Em aberto</th><th style={th}>Taxa</th><th style={th}>Honorário</th>
            </tr></thead>
            <tbody>
              {meses.length === 0 && <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: cores.suave }}>Ainda sem pagamentos agendados.</td></tr>}
              {meses.map(r => (
                <tr key={r.mes} style={{ background: r.mes === mesAtual ? hexA('#2563eb', 0.04) : 'transparent' }}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 800 }}>{nomeMesBR(r.mes)}</td>
                  <td style={td}>{r.agendados}</td>
                  <td style={{ ...td, color: cores.ok, fontWeight: 700 }}>{r.pagos}</td>
                  <td style={td}>{r.emDia}</td>
                  <td style={{ ...td, color: r.inad ? cores.perigo : cores.texto, fontWeight: 800 }}>{r.inad}</td>
                  <td style={{ ...td, color: cores.suave }}>{r.aberto}</td>
                  <td style={{ ...td, fontWeight: 800, color: taxa(r) >= 20 ? cores.perigo : taxa(r) >= 10 ? '#d97706' : cores.ok }}>{(r.pagos + r.inad) ? taxa(r) + '%' : '—'}</td>
                  <td style={td}>{r.honor ? reais(r.honor) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {Object.keys(porResp).length > 1 && (
          <div style={{ ...card, padding: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: cores.suave, marginBottom: 8 }}>{nomeMesBR(mesAtual)} por responsável</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 8 }}>
              {Object.values(porResp).sort((a, b) => b.inad - a.inad).map(x => (
                <div key={x.r} style={{ border: `1px solid ${cores.cardBorda}`, borderRadius: 12, padding: '9px 12px' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800 }}>{x.r}</div>
                  <div style={{ fontSize: 12.5, color: cores.suave }}><b style={{ color: cores.ok }}>{x.pagos}</b> pagaram · <b style={{ color: x.inad ? cores.perigo : cores.suave }}>{x.inad}</b> inadimplente{x.inad === 1 ? '' : 's'}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', display: 'flex', gap: 8, alignItems: 'center', background: hexA(cores.perigo, 0.06), borderBottom: `1px solid ${cores.cardBorda}` }}>
            <span style={{ fontSize: 14, fontWeight: 800 }}>Inadimplentes agora</span>
            <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 800, color: cores.perigo, background: hexA(cores.perigo, 0.12), borderRadius: 999, padding: '1px 10px' }}>{inadLista.length}</span>
          </div>
          {inadLista.length === 0 && <div style={{ padding: 14, fontSize: 13, color: cores.suave }}>Ninguém inadimplente. 👏</div>}
          {inadLista.map((c, i) => linhaAgenda({ tipo: 'pagamento', data: c.data_pagamento, texto: `Recebia ${fmtData(c.data_pagamento)}${c.banco ? ' no ' + c.banco : ''} · ${diasApos(c.data_pagamento)} dias sem pagar`, c }, i))}
        </div>
      </div>
    )
  })()

  // ------------------------------------------------------------ lista
  const listaView = (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      {!isMobile && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.3fr 1.2fr 1fr 1.3fr', gap: 12, padding: '11px 16px', fontSize: 11, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: cores.suave, background: '#f8fafc', borderBottom: `1px solid ${cores.cardBorda}` }}>
          <div>Cliente</div><div>Etapa</div><div>Banco</div><div>Pagamento</div><div>{soLeitura ? 'Vendedora' : 'Responsável'}</div>
        </div>
      )}
      {filtrada.length === 0 && <div style={{ padding: 36, textAlign: 'center', color: cores.suave }}>{lista ? 'Nenhum caso.' : 'Carregando…'}</div>}
      {[...filtrada].sort((a, b) => COLUNAS_PD.indexOf(colunaDe(a)) - COLUNAS_PD.indexOf(colunaDe(b)) || String(a.data_pagamento || '9').localeCompare(String(b.data_pagamento || '9'))).map(c => {
        const et = etapaPD(colunaDe(c))
        return (
          <div key={c.id} onClick={() => setAberto(c.id)} className="kr-linha" style={{ display: isMobile ? 'block' : 'grid', gridTemplateColumns: '2fr 1.3fr 1.2fr 1fr 1.3fr', gap: 12, padding: '11px 16px', borderBottom: `1px solid ${cores.cardBorda}`, cursor: 'pointer', alignItems: 'center' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 750, color: cores.texto }}>{c.nome}</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 3 }}><span style={{ fontSize: 11.5, color: cores.suave }}>{fmtCpf(c.cpf)}</span><Tags c={c} /></div>
            </div>
            <div><Chip cor={et.cor} forte>{et.icone} {et.curto}</Chip></div>
            <div style={{ fontSize: 13, color: cores.texto }}>{c.banco || '—'}</div>
            <div style={{ fontSize: 13, color: cores.texto }}>{c.etapa === 'baixado' ? `pagou ${fmtData(c.pago_em)}` : fmtData(c.data_pagamento)}</div>
            <div style={{ fontSize: 12.5, color: cores.suave }}>{soLeitura ? c.vendedora_nome : (c.responsaveis || []).join(', ')}</div>
          </div>
        )
      })}
    </div>
  )

  // ------------------------------------------------------------ render
  const totalAtivos = (lista || []).filter(c => ATIVAS.includes(c.etapa)).length
  const ABAS = soLeitura
    ? [['pagamentos', '💰 Pagamentos'], ['agenda', '📅 Agenda'], ['funil', '▦ Funil'], ['calendario', '🗓️ Calendário'], ['lista', '☰ Todos']]
    : [['pagamentos', '💰 Pagamentos'], ['agenda', '📅 Agenda'], ['funil', '▦ Funil'], ['pendencias', '📌 Pendências'], ['inss', '🏛️ No INSS'], ['calendario', '🗓️ Calendário'], ['inadimplencia', '📉 Inadimplência'], ['lista', '☰ Todos']]
  const badge = { pagamentos: contaPg.hoje + contaPg.amanha + contaPg.atrasados, agenda: agenda.atrasados.length + agenda.hoje.length, pendencias: conta.pendAbertas, inss: inssF.length }
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 1600, margin: '0 auto' }}>
      <style>{`
        .kr-cartao:hover { box-shadow: ${sombras.cardHover} !important; transform: translateY(-1px); }
        .kr-linha:hover { background: #f8fafc; }
        .kr-aba::-webkit-scrollbar { height: 0 }
      `}</style>
      {toast}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ width: 48, height: 48, borderRadius: 15, background: 'linear-gradient(135deg,#16a34a,#2563eb)', display: 'grid', placeItems: 'center', fontSize: 22, boxShadow: sombras.glowAzul }}>📋</div>
        <div style={{ flex: '1 1 180px', minWidth: 0 }}>
          <div style={{ fontSize: isMobile ? 21 : 25, fontWeight: 800, color: cores.texto, letterSpacing: '-.01em' }}>Acompanhamento de clientes</div>
          <div style={{ fontSize: 13, color: cores.suave }}>
            {soLeitura ? 'Suas vendas depois do deferimento · só acompanhamento' : 'Carta de concessão, PrevSempre, pagamento e pendências'} · {lista ? `${totalAtivos} caso${totalAtivos === 1 ? '' : 's'} em acompanhamento` : 'carregando…'}{profile?.nome ? ` · ${profile.nome}` : ''}
          </div>
        </div>
        <button onClick={carregar} style={btn('#475569', false)}>⟳ Atualizar</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(6, minmax(0,1fr))', gap: 12 }}>
        {kpi({ rot: 'Sem carta ainda', n: conta.semCarta, cor: '#0891b2', icone: '📜', sub: 'deferidos aguardando carta', onClick: () => setAba('funil') })}
        {kpi({ rot: 'Recebem amanhã', n: conta.amanha, cor: '#7c3aed', icone: '⏳', sub: fmtData(amanha), onClick: () => { setPgPeriodo('amanha'); setAba('pagamentos') } })}
        {kpi({ rot: 'Recebem na semana', n: conta.semana, cor: '#2563eb', icone: '🗓️', sub: `até ${fmtData(fimSemana)}`, onClick: () => { setPgPeriodo('semana'); setAba('pagamentos') } })}
        {kpi({ rot: 'Pagamento atrasado', n: conta.atrasados, cor: '#ea580c', icone: '⏰', sub: 'passou da data e não pagou', onClick: () => { setPgPeriodo('atrasados'); setAba('pagamentos') } })}
        {kpi({ rot: 'Pagaram no mês', n: rm.pagos, cor: cores.ok, icone: '🤝', sub: rm.honor ? reais(rm.honor) + ' de honorário' : nomeMesBR(mesAtual), onClick: soLeitura ? null : () => setAba('inadimplencia') })}
        {kpi({ rot: 'Inadimplentes no mês', n: rm.inad, cor: cores.perigo, icone: '📉', sub: (rm.pagos + rm.inad) ? `${taxa(rm)}% de ${rm.pagos + rm.inad} vencidos` : `mais de ${DIAS_INADIMPLENTE} dias sem pagar`, onClick: soLeitura ? null : () => setAba('inadimplencia') })}
      </div>

      <div className="kr-aba" style={{ display: 'flex', gap: 6, overflowX: 'auto', background: '#fff', border: `1px solid ${cores.cardBorda}`, borderRadius: 14, padding: 5 }}>
        {ABAS.map(([k, r]) => {
          const on = aba === k
          const n = badge[k]
          return (
            <button key={k} onClick={() => setAba(k)} style={{ padding: '9px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', fontSize: 13, fontWeight: on ? 800 : 600, color: on ? '#fff' : cores.texto, background: on ? 'linear-gradient(135deg,#16a34a,#2563eb)' : 'transparent' }}>
              {r}{n ? <span style={{ marginLeft: 6, fontSize: 11.5, fontWeight: 800, opacity: on ? 0.95 : 0.7 }}>{n}</span> : null}
            </button>
          )
        })}
      </div>

      {filtros}

      {lista === null ? <div style={{ ...card, padding: 40, textAlign: 'center', color: cores.suave }}>Carregando…</div>
        : aba === 'pendencias' ? pendView
        : aba === 'inss' ? inssView
        : aba === 'pagamentos' && lista.length ? pagamentosView
        : lista.length === 0 && aba !== 'inadimplencia' ? <div style={{ ...card, padding: 40, textAlign: 'center', color: cores.suave }}>Nenhum caso deferido {soLeitura ? 'das suas vendas' : 'na sua carteira'} ainda. Quando a advogada marcar "Deferido", o caso aparece aqui sozinho.</div>
        : aba === 'agenda' ? agendaView : aba === 'funil' ? funil : aba === 'calendario' ? calendario : aba === 'inadimplencia' ? inadView : listaView}

      {aberto && (
        <div onClick={() => setAberto(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.42)', backdropFilter: 'blur(2px)', zIndex: 1000 }}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: isMobile ? '100vw' : 'min(1100px, 94vw)', background: cores.fundo, boxShadow: '-24px 0 60px rgba(15,23,42,.25)', overflowY: 'auto', padding: isMobile ? 12 : 22, boxSizing: 'border-box', animation: 'krGaveta .22s ease-out' }}>
            <style>{'@keyframes krGaveta{from{transform:translateX(40px);opacity:.4}to{transform:none;opacity:1}}'}</style>
            <FichaPD key={aberto} id={aberto} onFechar={() => setAberto(null)} onMudou={carregar} />
          </div>
        </div>
      )}

      {modal && <ModalPD caso={modal.caso} acao={modal.acao} inicial={modal.inicial} onClose={() => setModal(null)} onFeito={() => { setModal(null); mostrar('Salvo'); carregar() }} />}
      {resolver && <ModalResolver pend={resolver.pend} opcao={resolver.opcao} onClose={() => setResolver(null)} onFeito={(r) => { setResolver(null); mostrar(r?.andamento ? 'Combinado — está na agenda' : 'Resolvida — foi para a advogada'); carregar() }} />}
    </div>
  )
}
