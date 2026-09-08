import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { cores } from '../lib/tema'

const URL_STORAGE = 'https://sdqslzpfbazehqcvibjy.supabase.co/storage/v1/object/comprovantes-mae/'

const STATUS_INFO = {
  aguardando_emissao:      { label: 'Aguardando emissão', cor: '#fbbf24', bg: 'rgba(251,191,36,.12)', icon: '⏳' },
  emitido:                 { label: 'Emitido', cor: '#60a5fa', bg: 'rgba(96,165,250,.12)', icon: '📨' },
  assinado:                { label: 'Assinado', cor: '#34d399', bg: 'rgba(52,211,153,.14)', icon: '🏆' },
  aguardando_pos_venda:    { label: 'Assinou — pós-venda vai ligar', cor: '#60a5fa', bg: 'rgba(96,165,250,.12)', icon: '📞' },
  em_contato_pos_venda:    { label: 'Pós-venda em contato', cor: '#fbbf24', bg: 'rgba(251,191,36,.12)', icon: '📞' },
  validado_pos_venda:      { label: 'Validado pós-venda', cor: '#34d399', bg: 'rgba(52,211,153,.14)', icon: '✓' },
  barrado_pos_venda:       { label: 'Barrado pós-venda', cor: '#f87171', bg: 'rgba(248,113,113,.14)', icon: '❌' },
  em_validacao:            { label: 'Em validação', cor: '#34d399', bg: 'rgba(52,211,153,.14)', icon: '🔍' },
  validado:                { label: 'Validado', cor: '#34d399', bg: 'rgba(52,211,153,.14)', icon: '✅' },
  entregue:                { label: 'Entregue', cor: '#60a5fa', bg: 'rgba(96,165,250,.12)', icon: '📦' },
  devolvido_correcao_doc:  { label: 'Devolvido — corrigir doc', cor: '#f87171', bg: 'rgba(248,113,113,.14)', icon: '⚠️' },
  devolvido_reemissao:     { label: 'Devolvido — reemitir', cor: '#f87171', bg: 'rgba(248,113,113,.14)', icon: '⚠️' },
  expirado:                { label: 'Expirou', cor: '#f87171', bg: 'rgba(248,113,113,.14)', icon: '⌛' },
  cancelado:               { label: 'Cancelado', cor: '#8b9bb4', bg: '#2b3340', icon: '❌' },
  aguardando_revisao_ia:   { label: 'Aguardando revisão IA', cor: '#a78bfa', bg: 'rgba(167,139,250,.14)', icon: '🤖' },
}

const PRODUTO_ESTILO = {
  'Maternidade': { cor: '#f472b6', bg: 'rgba(244,114,182,.12)', label: 'Maternidade' },
  'Maternidade Mãe': { cor: '#fbbf24', bg: 'rgba(251,191,36,.12)', label: 'Maternidade Mãe' },
  'Gestante até 5 meses': { cor: '#60a5fa', bg: 'rgba(96,165,250,.12)', label: 'Gestante até 5 meses' },
  'Pensão por Morte': { cor: '#94a3b8', bg: '#2b3340', label: 'Pensão por Morte' },
  'BPC': { cor: '#34d399', bg: 'rgba(52,211,153,.14)', label: 'BPC' },
  'Auxilio Acidente': { cor: '#fbbf24', bg: 'rgba(251,191,36,.12)', label: 'Auxílio Acidente' },
}

const DOC_LABELS = {
  rg_frente: '🆔 RG frente',
  rg_verso: '🆔 RG verso',
  comprovante_1: '📄 Comprovante 1',
  comprovante_2: '📄 Comprovante 2',
  comprovante_endereco: '🏠 Comp. endereço',
  comprovante_residencia: '🏠 Comp. residência',
  comprovante_gravidez: '🤰 Comp. gravidez/DPP',
  certidao_nascimento_bebe: '👶 Certidão nascimento',
  comprovante_bolsa_1: '🩷 Bolsa Família 1',
  comprovante_bolsa_2: '🩷 Bolsa Família 2',
  comprovante_bolsa_3: '🩷 Bolsa Família 3',
  cartao_sus: '💳 Cartão SUS',
  ctps_digital: '📘 CTPS digital',
  extrato_fgts: '💰 Extrato FGTS',
  outros: '📎 Outros',
  certidao_obito_frente: '📜 Óbito (frente)',
  certidao_obito_verso: '📜 Óbito (verso)',
  certidao_casamento_frente: '💍 Casamento (frente)',
  certidao_casamento_verso: '💍 Casamento (verso)',
  rgs_filhos: '👨‍👩‍👧 RGs dos filhos',
  rg_responsavel_legal_frente: '🆔 RG resp. legal (frente)',
  rg_responsavel_legal_verso: '🆔 RG resp. legal (verso)',
}

// 04/09 — CORRECAO. Este mapa listava chaves que ninguem grava
// (comprovante_residencia, comprovante_bolsa_*, cartao_sus, certidao_nascimento_bebe)
// e OMITIA justamente as que todo mundo grava (comprovante_1, comprovante_2,
// comprovante_endereco). Resultado medido no banco em 04/09: 8.574 arquivos
// anexados invisiveis nesta tela — 100% dos clientes de Maternidade (3.967),
// Gestante (617) e Maternidade Mae (340). O contador "x/y" e o filtro
// "so com documentos" erravam pelo mesmo motivo.
//
// A raiz: existem DUAS convencoes de nome no banco.
//   - tela Novo Cliente (humano) grava comprovante_1 / comprovante_2 / comprovante_endereco
//   - 🤖 IA Atendimento grava comprovante_1 + comprovante_gravidez, nunca comprovante_2
// A lista abaixo cobre as duas, e o que sobrar aparece mesmo assim (ver chavesDe).
// Referencia do que ja estava certo: components/FichaCliente.js (31/08).
const DOCS_POR_PRODUTO = {
  'Maternidade': ['rg_frente', 'rg_verso', 'comprovante_1', 'comprovante_2', 'comprovante_endereco', 'comprovante_gravidez', 'outros'],
  // CTPS digital e FGTS entraram como obrigatorios em 31/08
  'Maternidade Mãe': ['rg_frente', 'rg_verso', 'comprovante_1', 'comprovante_2', 'comprovante_endereco', 'ctps_digital', 'extrato_fgts', 'outros'],
  'Gestante até 5 meses': ['rg_frente', 'rg_verso', 'comprovante_1', 'comprovante_2', 'comprovante_endereco', 'comprovante_gravidez', 'outros'],
  // Pensao por Morte ja estava correto (0 arquivos invisiveis na conferencia de 04/09)
  'Pensão por Morte': ['rg_frente', 'rg_verso', 'certidao_obito_frente', 'certidao_obito_verso', 'certidao_casamento_frente', 'certidao_casamento_verso', 'rgs_filhos', 'rg_responsavel_legal_frente', 'rg_responsavel_legal_verso', 'comprovante_residencia', 'outros'],
}

const DOCS_BASE = ['rg_frente', 'rg_verso', 'comprovante_1', 'comprovante_2', 'comprovante_endereco']

const PERIODOS = [
  { chave: 'todos', label: 'Todo o período' },
  { chave: '30', label: 'Últimos 30 dias' },
  { chave: '90', label: 'Últimos 90 dias' },
  { chave: '180', label: 'Últimos 6 meses' },
]

// Os slots do produto MAIS qualquer chave que exista de fato no cliente e nao
// esteja na lista. E isso que impede o bug de voltar: se a IA, o n8n ou uma tela
// nova passarem a gravar uma chave que ninguem previu aqui, ela aparece do mesmo
// jeito em vez de sumir em silencio.
function chavesDe(produto, docs) {
  const base = DOCS_POR_PRODUTO[produto] || DOCS_BASE
  if (!docs) return base
  const extras = Object.keys(docs).filter(k => docs[k] && !base.includes(k))
  return extras.length ? [...base, ...extras] : base
}

// 08/09 — advogado para quem o cliente com link de assinatura foi direcionado.
// Caminho: clientes.contrato_producao_id -> contratos_producao.advogado_id -> advogados.
// Medido em 08/09: 3.698 de 3.706 clientes com link resolvem o advogado por aqui (99,8%).
// O lote tambem tem advogado_id, mas cobre menos (3.689) e nao acrescenta nenhum caso
// que o contrato ja nao resolva — por isso uma fonte so, sem fallback que confunda.
function advogadoDe(c) {
  const cp = c?.contratos_producao
  const a = Array.isArray(cp) ? cp[0]?.advogados : cp?.advogados
  if (!a || !a.nome_completo) return null
  return {
    nome: a.nome_completo,
    oab: a.oab || null,
    uf: a.estado || null,
    cidade: a.cidade || null,
  }
}

function tempoRelativo(dt) {
  if (!dt) return ''
  const ms = Date.now() - new Date(dt).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `há ${d}d`
  return new Date(dt).toLocaleDateString('pt-BR')
}

function formatarDataBr(dt) {
  if (!dt) return '—'
  const d = new Date(dt.includes('T') ? dt : dt + 'T12:00:00')
  if (isNaN(d.getTime())) return dt
  return d.toLocaleDateString('pt-BR')
}

function Campo({ label, valor, cor }) {
  if (valor === undefined || valor === null || valor === '') return null
  return (
    <div style={{ fontSize: 13, color: cor || '#cbd5e1', minWidth: 0 }}>
      <div style={{ color: cores.suave, fontSize: 11, marginBottom: 1 }}>{label}</div>
      <div style={{ wordBreak: 'break-word' }}>{valor}</div>
    </div>
  )
}

function SubstituirDocumento({ label, url, clienteId, chave, onSalvarDoc }) {
  const [enviando, setEnviando] = useState(false)
  const inputRef = useRef(null)

  async function trocar(file) {
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { alert('Arquivo muito grande (máx 10MB)'); return }
    const tipos = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']
    if (!tipos.includes(file.type)) { alert('Use JPG, PNG ou PDF'); return }
    setEnviando(true)
    try {
      const ext = file.name.split('.').pop().toLowerCase()
      const nome = `${clienteId}/${chave}_${Date.now()}.${ext}`
      const { error: eUp } = await supabase.storage.from('documentos-clientes').upload(nome, file, { upsert: true, contentType: file.type })
      if (eUp) throw new Error(eUp.message)
      const { data: pub } = supabase.storage.from('documentos-clientes').getPublicUrl(nome)
      await onSalvarDoc(clienteId, chave, pub.publicUrl)
    } catch (e) {
      alert('Erro ao subir documento: ' + (e.message || e))
    }
    setEnviando(false)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, fontSize: 12 }}>
      <span style={{ color: cores.suave, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {url ? (
        <>
          <a href={url} target="_blank" rel="noreferrer" style={{ color: '#34d399', textDecoration: 'underline', whiteSpace: 'nowrap' }}>✓ ver</a>
          <button onClick={() => inputRef.current?.click()} disabled={enviando}
            style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: enviando ? 'wait' : 'pointer', fontSize: 11, textDecoration: 'underline', whiteSpace: 'nowrap' }}>
            {enviando ? '⏳ subindo...' : '🔄 substituir'}
          </button>
        </>
      ) : (
        <button onClick={() => inputRef.current?.click()} disabled={enviando}
          style={{ background: 'rgba(96,165,250,.12)', border: '1px solid rgba(96,165,250,.30)', color: '#60a5fa', borderRadius: 6, padding: '3px 8px', cursor: enviando ? 'wait' : 'pointer', fontSize: 11, whiteSpace: 'nowrap' }}>
          {enviando ? '⏳ subindo...' : '➕ anexar'}
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) trocar(f) }} />
    </div>
  )
}

function DetalhesModal({ c, prints, onClose, onSalvarDoc }) {
  if (!c) return null
  const info = STATUS_INFO[c.status] || { cor: '#94a3b8', bg: '#2b3340', label: c.status, icon: '' }
  const prod = PRODUTO_ESTILO[c.produto] || { cor: '#94a3b8', bg: '#2b3340', label: c.produto }
  const docs = c.documentos || {}
  const chaves = chavesDe(c.produto, docs)
  const anexados = chaves.filter(k => docs[k])
  const printsCli = prints[c.id] || []
  const temPrints = printsCli.some(p => p.gerid || p.cnis)
  const endereco = [c.rua, c.numero, c.bairro].filter(Boolean).join(', ') || c.endereco || ''
  const adv = advogadoDe(c)
  const dadosProd = c.dados_produto && typeof c.dados_produto === 'object' ? c.dados_produto : {}
  const LABELS_DADOS = {
    data_nascimento_bebe: '👶 Nascimento do bebê',
    ja_trabalhou_clt: '💼 Já trabalhou CLT',
    trabalhava_no_nascimento: '💼 Trabalhava no nascimento',
    nome_mae: '👩 Mãe',
    cpf_mae: '🪪 CPF da mãe',
    data_nascimento_mae: '🎂 Nascimento da mãe',
    nome_pai: '👨 Pai',
    cpf_pai: '🪪 CPF do pai',
    nome_conjuge: '💍 Cônjuge',
    quantidade_filhos: '👨‍👩‍👧 Filhos',
  }

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const badge = (cor, bg, txt) => (
    <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 500, color: cor, background: bg, whiteSpace: 'nowrap' }}>{txt}</span>
  )

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(6,10,18,.72)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: cores.card, border: `1px solid ${cores.cardBorda}`, borderRadius: 16, maxWidth: 780, width: '100%', maxHeight: '88vh', overflowY: 'auto', padding: '1.25rem', boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: cores.texto }}>{c.nome}</div>
            <div style={{ fontSize: 12.5, color: cores.suave, marginTop: 2 }}>{c.cpf} · {c.telefone}</div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {badge(prod.cor, prod.bg, prod.label)}
            {badge(info.cor, info.bg, `${info.icon} ${info.label}`)}
          </div>
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: cores.suave, textTransform: 'uppercase', letterSpacing: '.06em', margin: '6px 0 8px' }}>👤 Informações do cliente</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px 16px' }}>
          <Campo label="CPF" valor={c.cpf} />
          <Campo label="Telefone" valor={c.telefone} />
          <Campo label="E-mail" valor={c.email} />
          <Campo label="NIS" valor={c.nis} />
          <Campo label="Data do cadastro" valor={formatarDataBr(c.created_at)} />
          <Campo label="Vendedor" valor={c.profiles?.nome} />
          <Campo label="Parto previsto" valor={formatarDataBr(c.data_prevista_parto)} />
          <Campo label="Produto" valor={prod.label} />
          {endereco && (
            <div style={{ gridColumn: '1 / -1' }}>
              <Campo label="Endereço" valor={endereco} />
            </div>
          )}
          <Campo label="Cidade/UF" valor={[c.cidade, c.uf].filter(Boolean).join('/')} />
          <Campo label="CEP" valor={c.cep} />
          {(adv || c.link_assinatura) && (
            <div style={{ gridColumn: '1 / -1' }}>
              <Campo
                label="⚖️ Advogado do contrato"
                cor={adv ? '#a78bfa' : cores.suave}
                valor={adv
                  ? [adv.nome, adv.oab ? `OAB ${adv.oab}${adv.uf ? '/' + adv.uf : ''}` : null, adv.cidade]
                      .filter(Boolean).join(' · ')
                  : 'contrato emitido, mas sem advogado registrado'} />
            </div>
          )}
        </div>

        {Object.keys(dadosProd).length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: cores.suave, textTransform: 'uppercase', letterSpacing: '.06em', margin: '16px 0 8px' }}>📋 Dados do produto</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px 16px' }}>
              {Object.entries(dadosProd).map(([k, v]) => (
                <Campo key={k} label={LABELS_DADOS[k] || k.replace(/_/g, ' ')} valor={String(v)} />
              ))}
            </div>
          </>
        )}

        {(c.observacao || c.pos_venda_observacao) && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: cores.suave, textTransform: 'uppercase', letterSpacing: '.06em', margin: '16px 0 8px' }}>💬 Observações</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {c.observacao && <div style={{ fontSize: 12.5, color: '#cbd5e1', padding: '6px 10px', background: 'rgba(255,255,255,.04)', borderRadius: 6, fontStyle: 'italic' }}>"{c.observacao}"</div>}
              {c.pos_venda_observacao && <div style={{ fontSize: 12.5, color: '#cbd5e1', padding: '6px 10px', background: 'rgba(251,191,36,.08)', borderRadius: 6 }}>🛎️ Pós-venda: {c.pos_venda_observacao}</div>}
            </div>
          </>
        )}

        <div style={{ fontSize: 11, fontWeight: 700, color: cores.suave, textTransform: 'uppercase', letterSpacing: '.06em', margin: '16px 0 8px' }}>
          📎 Documentos · {anexados.length}/{chaves.length}
        </div>
        <div>
          {chaves.map(k => (
            <SubstituirDocumento key={k} label={DOC_LABELS[k] || k} url={docs[k]} clienteId={c.id} chave={k} onSalvarDoc={onSalvarDoc} />
          ))}
        </div>

        {(temPrints || c.link_assinatura) && (
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {temPrints && printsCli.filter(p => p.gerid || p.cnis).map((p, i) => (
              <span key={i} style={{ display: 'inline-flex', gap: 6 }}>
                {p.gerid && (
                  <a href={URL_STORAGE + p.gerid} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 12, borderRadius: 8, background: 'rgba(96,165,250,.10)', color: '#60a5fa', textDecoration: 'none', border: '1px solid rgba(96,165,250,.25)' }}>
                    🖨️ Print GERID
                  </a>
                )}
                {p.cnis && (
                  <a href={URL_STORAGE + p.cnis} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 12, borderRadius: 8, background: 'rgba(96,165,250,.10)', color: '#60a5fa', textDecoration: 'none', border: '1px solid rgba(96,165,250,.25)' }}>
                    🖨️ Print CNIS
                  </a>
                )}
              </span>
            ))}
            {c.link_assinatura && (
              <a href={c.link_assinatura} target="_blank" rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 12, borderRadius: 8, background: 'rgba(167,139,250,.12)', color: '#a78bfa', textDecoration: 'none', border: '1px solid rgba(167,139,250,.30)' }}>
                📨 Contrato de assinatura
              </a>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18, gap: 8 }}>
          <button onClick={onClose} style={{ padding: '8px 18px', fontSize: 13, background: 'rgba(255,255,255,.06)', border: `1px solid ${cores.cardBorda}`, borderRadius: 8, cursor: 'pointer', color: cores.texto }}>
            ✕ Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Clientes() {
  const { profile } = useAuth()
  const [clientes, setClientes] = useState([])
  const [prints, setPrints] = useState({})
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [periodo, setPeriodo] = useState('todos')
  const [total, setTotal] = useState(0)
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroProduto, setFiltroProduto] = useState('todos')
  const [filtroAdvogado, setFiltroAdvogado] = useState('todos')
  const [soDocumentos, setSoDocumentos] = useState(false)
  const [selecionado, setSelecionado] = useState(null)
  const [limite, setLimite] = useState(80)
  const carregouRef = useRef(false)

  const periodoRef = useRef(periodo)
  periodoRef.current = periodo

  const fetchTudo = useCallback(async () => {
    if (!carregouRef.current) setLoading(true)
    const p = periodoRef.current
    const desde = p === 'todos' ? null : new Date(Date.now() - parseInt(p, 10) * 86400000)

    let qCount = supabase.from('clientes').select('id', { count: 'exact', head: true })
    // 08/09: traz junto o advogado do contrato de assinatura. Se a RLS de
    // contratos_producao bloquear quem esta logado, o embed volta null e o resto
    // da tela segue igual — nada quebra, so nao aparece o advogado.
    let q = supabase.from('clientes').select(
      '*, profiles!clientes_vendedor_operador_id_fkey(nome),' +
      ' contratos_producao!clientes_contrato_producao_id_fkey(status, data_assinatura, advogados(nome_completo, oab, cidade, estado))'
    )
    if (desde) {
      qCount = qCount.gte('created_at', desde.toISOString())
      q = q.gte('created_at', desde.toISOString())
    }
    const { count } = await qCount
    setTotal(count || 0)

    // Carrega TODOS os clientes do período em blocos (Supabase limita a 1000 por consulta)
    const todos = []
    const TAM = 1000
    let from = 0
    for (;;) {
      const { data } = await q.order('created_at', { ascending: false }).range(from, from + TAM - 1)
      todos.push(...(data || []))
      if (!data || data.length < TAM) break
      from += TAM
    }
    setClientes(todos)
    carregouRef.current = true

    const { data: ac } = await supabase
      .from('acompanhamento_mae')
      .select('cliente_id, print_gerid_url, print_cnis_url')
    const mapa = {}
    ;(ac || []).forEach(a => {
      if (!a.cliente_id) return
      if (!mapa[a.cliente_id]) mapa[a.cliente_id] = []
      if (a.print_gerid_url || a.print_cnis_url) {
        mapa[a.cliente_id].push({ gerid: a.print_gerid_url, cnis: a.print_cnis_url })
      }
    })
    setPrints(mapa)
    setLoading(false)
  }, [])

  useEffect(() => { carregouRef.current = false; setLimite(80) }, [periodo])
  useEffect(() => { fetchTudo() }, [fetchTudo, periodo])
  useEffect(() => {
    // Refresca só quando a aba está visível, pra não pesar no background
    const id = setInterval(() => {
      if (!document.hidden) fetchTudo()
    }, 60000)
    return () => clearInterval(id)
  }, [fetchTudo])

  const salvarDocumento = async (clienteId, chave, url) => {
    if (!url) return
    const cli = clientes.find(x => x.id === clienteId)
    if (!cli) return
    const novosDocs = { ...(cli.documentos || {}), [chave]: url }
    const { error } = await supabase.from('clientes').update({ documentos: novosDocs }).eq('id', clienteId)
    if (error) { alert('Erro ao salvar documento: ' + error.message); return }
    await fetchTudo()
    setSelecionado(prev => prev && prev.id === clienteId ? { ...prev, documentos: novosDocs } : prev)
  }

  const temDoc = useCallback((c) => {
    const docs = c.documentos || {}
    const anexados = chavesDe(c.produto, docs).filter(k => docs[k])
    const temPrints = (prints[c.id] || []).some(p => p.gerid || p.cnis)
    return anexados.length > 0 || temPrints || !!c.link_assinatura
  }, [prints])

  const produtos = useMemo(
    () => Array.from(new Set(clientes.map(c => c.produto).filter(Boolean))).sort(),
    [clientes]
  )
  const statuses = useMemo(
    () => Array.from(new Set(clientes.map(c => c.status).filter(Boolean))),
    [clientes]
  )
  const countsStatus = useMemo(() => {
    const m = {}
    statuses.forEach(st => { m[st] = clientes.filter(c => c.status === st).length })
    return m
  }, [clientes, statuses])

  // 08/09 — filtro por advogado. Sao ~190 advogados no cadastro, mas so alguns
  // aparecem nos clientes do periodo: a lista sai do que esta em tela, ja com a
  // contagem, e vai ordenada por volume — quem tem mais cliente aparece primeiro.
  const advogados = useMemo(() => {
    const m = new Map()
    clientes.forEach(c => {
      const a = advogadoDe(c)
      if (!a) return
      m.set(a.nome, (m.get(a.nome) || 0) + 1)
    })
    return Array.from(m.entries()).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
  }, [clientes])
  const semAdvogado = useMemo(
    () => clientes.filter(c => c.link_assinatura && !advogadoDe(c)).length,
    [clientes]
  )
  const countComDoc = useMemo(() => clientes.filter(temDoc).length, [clientes, temDoc])

  const filtrados = useMemo(() => {
    return clientes
      .filter(c => {
        if (filtroStatus !== 'todos' && c.status !== filtroStatus) return false
        if (filtroProduto !== 'todos' && c.produto !== filtroProduto) return false
        if (filtroAdvogado !== 'todos') {
          const a = advogadoDe(c)
          if (filtroAdvogado === '__sem__') {
            // "emitiu sem advogado": so faz sentido para quem tem contrato
            if (a || !c.link_assinatura) return false
          } else if (!a || a.nome !== filtroAdvogado) return false
        }
        if (soDocumentos && !temDoc(c)) return false
        if (busca.trim()) {
          const b = busca.trim().toLowerCase()
          const bDig = b.replace(/\D/g, '')
          const cpfDig = (c.cpf || '').replace(/\D/g, '')
          const telDig = (c.telefone || '').replace(/\D/g, '')
          if (b === bDig && bDig) {
            // busca por dígitos -> casa CPF ou telefone
            return cpfDig.includes(bDig) || telDig.includes(bDig)
          }
          return (c.nome || '').toLowerCase().includes(b)
        }
        return true
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }, [clientes, prints, busca, filtroStatus, filtroProduto, filtroAdvogado, soDocumentos, temDoc])

  useEffect(() => { setLimite(80) }, [busca, filtroStatus, filtroProduto, filtroAdvogado, soDocumentos, periodo])

  const filtrosAtivos = (filtroStatus !== 'todos' ? 1 : 0) + (filtroProduto !== 'todos' ? 1 : 0)
    + (filtroAdvogado !== 'todos' ? 1 : 0) + (soDocumentos ? 1 : 0) + (busca.trim() ? 1 : 0)
  const limparFiltros = () => {
    setFiltroStatus('todos'); setFiltroProduto('todos'); setFiltroAdvogado('todos')
    setSoDocumentos(false); setBusca('')
  }

  const visiveis = filtrados.slice(0, limite)
  const restantes = filtrados.length - visiveis.length

  const s = {
    chip: (ativo, cor, bg) => ({
      padding: '6px 12px', fontSize: 12, borderRadius: 16,
      background: ativo ? cor : bg, color: ativo ? '#0b1220' : cor,
      border: `1px solid ${cor}40`, cursor: 'pointer', fontWeight: 500,
      whiteSpace: 'nowrap',
    }),
    badge: (cor, bg) => ({
      display: 'inline-block', padding: '3px 8px', borderRadius: 10, fontSize: 11,
      fontWeight: 500, color: cor, background: bg, whiteSpace: 'nowrap',
    }),
    // 08/09 — os filtros viraram um painel unico com rotulo em cada grupo.
    // Antes eram tres fileiras de chips soltas, sem dizer o que cada uma filtrava.
    painel: {
      background: cores.card, border: `1px solid ${cores.cardBorda}`,
      borderRadius: 14, padding: '14px 16px', marginBottom: 14,
    },
    grupo: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0' },
    rotulo: {
      fontSize: 10.5, fontWeight: 700, color: cores.suave, textTransform: 'uppercase',
      letterSpacing: '.06em', minWidth: 74, paddingTop: 7, flexShrink: 0,
    },
    linhaChips: { display: 'flex', flexWrap: 'wrap', gap: 7, flex: 1, minWidth: 0 },
    divisor: { height: 1, background: cores.cardBorda, opacity: .6, margin: '2px 0' },
    select: {
      padding: '7px 10px', fontSize: 12.5, borderRadius: 8, background: cores.card,
      color: cores.texto, border: `1px solid ${cores.cardBorda}`, cursor: 'pointer',
      maxWidth: 360, minWidth: 200, outline: 'none',
    },
  }

  return (
    <div>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, color: cores.texto, marginBottom: 4 }}>📋 Clientes</div>
          <div style={{ fontSize: 13, color: cores.suave }}>
            📊 {total} cliente{total !== 1 ? 's' : ''} no período{periodo !== 'todos' ? ' selecionado' : ''} · {countComDoc} com doc{countComDoc !== 1 ? 's' : ''}
            {profile?.nome ? ` · visto por ${profile.nome}` : ''}
          </div>
        </div>
        <button onClick={fetchTudo} style={{ padding: '8px 14px', fontSize: 13, background: cores.card, border: `1px solid ${cores.cardBorda}`, borderRadius: 8, cursor: 'pointer', color: cores.texto }}>
          ↻ Atualizar
        </button>
      </div>

      <input
        style={{ width: '100%', padding: '11px 13px', fontSize: 14, border: `1px solid ${cores.cardBorda}`, borderRadius: 10, background: cores.card, outline: 'none', boxSizing: 'border-box', marginBottom: 12, color: cores.texto }}
        placeholder="🔍 Buscar por nome, CPF ou telefone..."
        value={busca} onChange={e => setBusca(e.target.value)} />

      <div style={s.painel}>
        <div style={s.grupo}>
          <div style={s.rotulo}>Período</div>
          <div style={s.linhaChips}>
            {PERIODOS.map(p => (
              <button key={p.chave} style={s.chip(periodo === p.chave, '#38bdf8', 'rgba(56,189,248,.10)')} onClick={() => setPeriodo(p.chave)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div style={s.divisor} />

        <div style={s.grupo}>
          <div style={s.rotulo}>Produto</div>
          <div style={s.linhaChips}>
            <button style={s.chip(filtroProduto === 'todos', '#60a5fa', 'rgba(96,165,250,.10)')} onClick={() => setFiltroProduto('todos')}>Todos</button>
            {produtos.map(p => {
              const st = PRODUTO_ESTILO[p] || { cor: '#94a3b8', bg: '#2b3340' }
              return (
                <button key={p} style={s.chip(filtroProduto === p, st.cor, st.bg)} onClick={() => setFiltroProduto(p)}>
                  {st.label}
                </button>
              )
            })}
          </div>
        </div>

        <div style={s.divisor} />

        {/* 08/09 — filtro por advogado. Select em vez de chip: sao dezenas de nomes
            e viraria uma parede de botoes. Ordenado por volume, com a contagem. */}
        <div style={s.grupo}>
          <div style={s.rotulo}>⚖️ Advogado</div>
          <div style={{ ...s.linhaChips, alignItems: 'center' }}>
            <select style={{ ...s.select, borderColor: filtroAdvogado !== 'todos' ? '#a78bfa' : cores.cardBorda, color: filtroAdvogado !== 'todos' ? '#a78bfa' : cores.texto }}
              value={filtroAdvogado} onChange={e => setFiltroAdvogado(e.target.value)}>
              <option value="todos">Todos os advogados{advogados.length ? ` (${advogados.length})` : ''}</option>
              {semAdvogado > 0 && <option value="__sem__">⚠️ Emitiu sem advogado registrado · {semAdvogado}</option>}
              {advogados.map(([nome, n]) => (
                <option key={nome} value={nome}>{nome} · {n}</option>
              ))}
            </select>
            {advogados.length === 0 && (
              <span style={{ fontSize: 11.5, color: cores.suave }}>nenhum contrato emitido no período</span>
            )}
          </div>
        </div>

        <div style={s.divisor} />

        <div style={s.grupo}>
          <div style={s.rotulo}>Status</div>
          <div style={s.linhaChips}>
            <button style={s.chip(filtroStatus === 'todos', '#60a5fa', 'rgba(96,165,250,.10)')} onClick={() => setFiltroStatus('todos')}>
              Todos · {clientes.length}
            </button>
            {statuses.map(st => {
              const info = STATUS_INFO[st] || { cor: '#94a3b8', bg: '#2b3340', label: st }
              return (
                <button key={st} style={s.chip(filtroStatus === st, info.cor, info.bg)} onClick={() => setFiltroStatus(st)}>
                  {info.icon} {info.label} · {countsStatus[st]}
                </button>
              )
            })}
          </div>
        </div>

        <div style={s.divisor} />

        <div style={{ ...s.grupo, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <button style={s.chip(soDocumentos, '#34d399', 'rgba(52,211,153,.12)')} onClick={() => setSoDocumentos(v => !v)}>
            📎 Só com documentos
          </button>
          {filtrosAtivos > 0 && (
            <button onClick={limparFiltros}
              style={{ background: 'none', border: 'none', color: '#f87171', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', padding: '6px 2px' }}>
              limpar {filtrosAtivos} filtro{filtrosAtivos !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: cores.suave }}>Carregando...</div>
      ) : filtrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: cores.suave, background: cores.card, borderRadius: 14, border: `1px solid ${cores.cardBorda}` }}>
          <div style={{ fontSize: 14, marginBottom: filtrosAtivos ? 10 : 0 }}>
            {clientes.length === 0 ? '📭 Nenhum cliente cadastrado ainda.' : '🔍 Nenhum cliente com esses filtros.'}
          </div>
          {filtrosAtivos > 0 && (
            <button onClick={limparFiltros} style={s.chip(false, '#f87171', 'rgba(248,113,113,.10)')}>
              limpar {filtrosAtivos} filtro{filtrosAtivos !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      ) : <><div style={{ fontSize: 11.5, color: cores.suave, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>Mostrando <strong style={{ color: cores.texto }}>{visiveis.length}</strong> de <strong style={{ color: cores.texto }}>{filtrados.length}</strong> cliente{filtrados.length !== 1 ? 's' : ''}</span>
        {filtroAdvogado !== 'todos' && (
          <span style={s.badge('#a78bfa', 'rgba(167,139,250,.12)')}>
            ⚖️ {filtroAdvogado === '__sem__' ? 'sem advogado registrado' : filtroAdvogado}
          </span>
        )}
      </div>
      {visiveis.map(c => {
        const info = STATUS_INFO[c.status] || { cor: '#94a3b8', bg: '#2b3340', label: c.status, icon: '' }
        const prod = PRODUTO_ESTILO[c.produto] || { cor: '#94a3b8', bg: '#2b3340', label: c.produto }
        const docs = c.documentos || {}
        const chaves = chavesDe(c.produto, docs)
        const anexados = chaves.filter(k => docs[k])
        const adv = advogadoDe(c)
        const printsCli = prints[c.id] || []
        const temPrints = printsCli.some(p => p.gerid || p.cnis)
        const totalDocs = anexados.length + printsCli.filter(p => p.gerid && p.cnis).length * 2 + (printsCli.some(p => p.gerid && !p.cnis) || printsCli.some(p => p.cnis && !p.gerid) ? 1 : 0) + (c.link_assinatura ? 1 : 0)

        return (
          <div key={c.id} onClick={() => setSelecionado(c)} style={{ background: cores.card, border: `1px solid ${cores.cardBorda}`, borderLeft: `3px solid ${info.cor}`, borderRadius: 14, padding: '1rem', marginBottom: 10, cursor: 'pointer', transition: 'border-color .15s, transform .1s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.18)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = cores.cardBorda }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 10, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: cores.texto, marginBottom: 3, lineHeight: 1.25 }}>{c.nome}</div>
                <div style={{ fontSize: 12, color: cores.suave, fontVariantNumeric: 'tabular-nums' }}>{c.cpf} · {c.telefone}</div>
              </div>
              {/* "Ver detalhes" saiu: era um badge repetido em todo card, competindo
                  com produto e status. O card inteiro ja e clicavel. */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={s.badge(prod.cor, prod.bg)}>{prod.label}</span>
                <span style={s.badge(info.cor, info.bg)}>{info.icon} {info.label}</span>
                <span style={{ color: cores.suave, fontSize: 16, lineHeight: 1, paddingLeft: 2 }}>›</span>
              </div>
            </div>

            <div style={{ fontSize: 11, color: cores.suave, marginTop: 4 }}>
              {c.cidade && c.uf ? `${c.cidade}/${c.uf}` : (c.cidade || c.uf || '')}
              {' · '}cadastro {tempoRelativo(c.created_at)}
              {c.profiles?.nome && <> · 👤 <span style={{ color: '#cbd5e1' }}>{c.profiles.nome}</span></>}
              {adv && <> · ⚖️ <span style={{ color: '#a78bfa' }}>{adv.nome}</span></>}
            </div>

            {c.produto === 'Maternidade Mãe' && (
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
                {c.dados_produto?.data_nascimento_bebe && <span>👶 Nascimento: {c.dados_produto.data_nascimento_bebe}</span>}
                {c.dados_produto?.ja_trabalhou_clt && <span>💼 Já trabalhou CLT: {c.dados_produto.ja_trabalhou_clt}</span>}
                {c.dados_produto?.trabalhava_no_nascimento && <span>💼 Trabalhava no nascimento: {c.dados_produto.trabalhava_no_nascimento}</span>}
              </div>
            )}
            {(c.produto === 'Gestante até 5 meses' || c.produto === 'Maternidade') && (
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
                {c.data_prevista_parto && <span>🤰 Parto previsto: {c.data_prevista_parto}</span>}
                {c.nis && <span>🪪 NIS: {c.nis}</span>}
              </div>
            )}

            {/* Barra de documentos: da pra ler o quanto falta sem contar chip por
                chip. Zero anexo fica ambar, nao cinza — e uma pendencia, nao um
                estado neutro. */}
            <div style={{ marginTop: 11, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 46, height: 4, borderRadius: 3, background: 'rgba(255,255,255,.09)', overflow: 'hidden' }}>
                  <div style={{
                    width: `${chaves.length ? Math.round(100 * anexados.length / chaves.length) : 0}%`,
                    height: '100%', borderRadius: 3,
                    background: anexados.length === 0 ? '#f59e0b' : '#34d399',
                  }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: anexados.length === 0 ? '#f59e0b' : '#34d399' }}>
                  {anexados.length === 0 ? 'sem documentos' : `${anexados.length}/${chaves.length} documentos`}
                </span>
              </div>
              {temPrints && <span style={{ fontSize: 11, fontWeight: 600, color: '#60a5fa' }}>🖨️ prints GERID/CNIS</span>}
              {c.link_assinatura && <span style={{ fontSize: 11, fontWeight: 600, color: '#a78bfa' }}>📨 contrato emitido</span>}
            </div>

            {(anexados.length > 0 || temPrints || c.link_assinatura) ? (
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {anexados.map(k => (
                  <a key={k} href={docs[k]} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 11.5, borderRadius: 8, background: 'rgba(52,211,153,.10)', color: '#34d399', textDecoration: 'none', border: '1px solid rgba(52,211,153,.25)' }}>
                    {DOC_LABELS[k] || k}
                  </a>
                ))}
                {printsCli.filter(p => p.gerid || p.cnis).map((p, i) => (
                  <span key={i} style={{ display: 'inline-flex', gap: 6 }}>
                    {p.gerid && (
                      <a href={URL_STORAGE + p.gerid} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 11.5, borderRadius: 8, background: 'rgba(96,165,250,.10)', color: '#60a5fa', textDecoration: 'none', border: '1px solid rgba(96,165,250,.25)' }}>
                        🖨️ Print GERID
                      </a>
                    )}
                    {p.cnis && (
                      <a href={URL_STORAGE + p.cnis} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 11.5, borderRadius: 8, background: 'rgba(96,165,250,.10)', color: '#60a5fa', textDecoration: 'none', border: '1px solid rgba(96,165,250,.25)' }}>
                        🖨️ Print CNIS
                      </a>
                    )}
                  </span>
                ))}
                {c.link_assinatura && (
                  <a href={c.link_assinatura} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 11.5, borderRadius: 8, background: 'rgba(167,139,250,.12)', color: '#a78bfa', textDecoration: 'none', border: '1px solid rgba(167,139,250,.30)' }}>
                    📨 Contrato de assinatura
                  </a>
                )}
              </div>
            ) : (
              <div style={{ marginTop: 8, fontSize: 11.5, color: cores.suave }}>Sem documentos anexados.</div>
            )}

            {c.observacao && (
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 8, padding: '6px 10px', background: 'rgba(255,255,255,.04)', borderRadius: 6, fontStyle: 'italic' }}>
                "{c.observacao}"
              </div>
            )}
          </div>
        )
      })}
      {restantes > 0 && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button onClick={() => setLimite(l => l + 200)} style={{ padding: '10px 20px', fontSize: 13, background: 'rgba(56,189,248,.10)', color: '#38bdf8', border: '1px solid rgba(56,189,248,.30)', borderRadius: 10, cursor: 'pointer', fontWeight: 500 }}>
            Ver mais {Math.min(restantes, 200)} cliente{Math.min(restantes, 200) !== 1 ? 's' : ''} ({restantes} restante{restantes !== 1 ? 's' : ''})
          </button>
        </div>
      )}</>}
      {selecionado && (
        <DetalhesModal c={selecionado} prints={prints} onClose={() => setSelecionado(null)} onSalvarDoc={salvarDocumento} />
      )}
    </div>
  )
}
