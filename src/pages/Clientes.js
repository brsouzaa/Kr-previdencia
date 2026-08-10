import { useState, useEffect, useCallback } from 'react'
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
  outros: '📎 Outros',
  certidao_obito_frente: '📜 Óbito (frente)',
  certidao_obito_verso: '📜 Óbito (verso)',
  certidao_casamento_frente: '💍 Casamento (frente)',
  certidao_casamento_verso: '💍 Casamento (verso)',
  rgs_filhos: '👨‍👩‍👧 RGs dos filhos',
  rg_responsavel_legal_frente: '🆔 RG resp. legal (frente)',
  rg_responsavel_legal_verso: '🆔 RG resp. legal (verso)',
}

const DOCS_POR_PRODUTO = {
  'Maternidade': ['rg_frente', 'rg_verso', 'comprovante_residencia', 'comprovante_gravidez', 'comprovante_bolsa_1', 'comprovante_bolsa_2', 'comprovante_bolsa_3', 'cartao_sus', 'outros'],
  'Maternidade Mãe': ['rg_frente', 'rg_verso', 'comprovante_residencia', 'certidao_nascimento_bebe', 'comprovante_bolsa_1', 'comprovante_bolsa_2', 'comprovante_bolsa_3', 'cartao_sus', 'outros'],
  'Gestante até 5 meses': ['rg_frente', 'rg_verso', 'comprovante_residencia', 'comprovante_gravidez', 'cartao_sus', 'outros'],
  'Pensão por Morte': ['rg_frente', 'rg_verso', 'certidao_obito_frente', 'certidao_obito_verso', 'certidao_casamento_frente', 'certidao_casamento_verso', 'rgs_filhos', 'rg_responsavel_legal_frente', 'rg_responsavel_legal_verso', 'comprovante_residencia', 'outros'],
}

const DOCS_BASE = ['rg_frente', 'rg_verso', 'comprovante_1', 'comprovante_2', 'comprovante_endereco']

function chavesDe(produto) {
  return DOCS_POR_PRODUTO[produto] || DOCS_BASE
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

export default function Clientes() {
  const { profile } = useAuth()
  const [clientes, setClientes] = useState([])
  const [prints, setPrints] = useState({})
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroProduto, setFiltroProduto] = useState('todos')
  const [soDocumentos, setSoDocumentos] = useState(false)

  const fetchTudo = useCallback(async () => {
    setLoading(true)
    const { data: cli } = await supabase
      .from('clientes')
      .select('*, profiles!clientes_vendedor_operador_id_fkey(nome)')
      .order('created_at', { ascending: false })
    setClientes(cli || [])

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

  useEffect(() => { fetchTudo() }, [fetchTudo])
  useEffect(() => {
    const id = setInterval(fetchTudo, 30000)
    return () => clearInterval(id)
  }, [fetchTudo])

  const temDoc = (c) => {
    const docs = c.documentos || {}
    const anexados = chavesDe(c.produto).filter(k => docs[k])
    const temPrints = (prints[c.id] || []).some(p => p.gerid || p.cnis)
    return anexados.length > 0 || temPrints || !!c.link_assinatura
  }

  const produtos = Array.from(new Set(clientes.map(c => c.produto).filter(Boolean))).sort()
  const statuses = Array.from(new Set(clientes.map(c => c.status).filter(Boolean)))
  const countsStatus = {}
  statuses.forEach(st => { countsStatus[st] = clientes.filter(c => c.status === st).length })
  const countComDoc = clientes.filter(temDoc).length

  const filtrados = clientes
    .filter(c => {
      if (filtroStatus !== 'todos' && c.status !== filtroStatus) return false
      if (filtroProduto !== 'todos' && c.produto !== filtroProduto) return false
      if (soDocumentos && !temDoc(c)) return false
      if (busca.trim()) {
        const b = busca.trim().toLowerCase()
        const cpfDig = (c.cpf || '').replace(/\D/g, '')
        return (c.nome || '').toLowerCase().includes(b)
          || cpfDig.includes(b)
          || (c.telefone || '').replace(/\D/g, '').includes(b.replace(/\D/g, ''))
      }
      return true
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

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
  }

  return (
    <div>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, color: cores.texto, marginBottom: 4 }}>📋 Clientes</div>
          <div style={{ fontSize: 13, color: cores.suave }}>
            {clientes.length} cliente{clientes.length !== 1 ? 's' : ''} · {countComDoc} com documento{countComDoc !== 1 ? 's' : ''}
            {profile?.nome ? ` · visto por ${profile.nome}` : ''}
          </div>
        </div>
        <button onClick={fetchTudo} style={{ padding: '8px 14px', fontSize: 13, background: cores.card, border: `1px solid ${cores.cardBorda}`, borderRadius: 8, cursor: 'pointer', color: cores.texto }}>
          ↻ Atualizar
        </button>
      </div>

      <input
        style={{ width: '100%', padding: '10px 12px', fontSize: 14, border: `1px solid ${cores.cardBorda}`, borderRadius: 8, background: cores.card, outline: 'none', boxSizing: 'border-box', marginBottom: 12, color: cores.texto }}
        placeholder="🔍 Buscar por nome, CPF ou telefone..."
        value={busca} onChange={e => setBusca(e.target.value)} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <button style={s.chip(filtroProduto === 'todos', '#60a5fa', 'rgba(96,165,250,.10)')} onClick={() => setFiltroProduto('todos')}>Todos os produtos</button>
        {produtos.map(p => {
          const st = PRODUTO_ESTILO[p] || { cor: '#94a3b8', bg: '#2b3340' }
          return (
            <button key={p} style={s.chip(filtroProduto === p, st.cor, st.bg)} onClick={() => setFiltroProduto(p)}>
              {st.label}
            </button>
          )
        })}
        <button style={s.chip(soDocumentos, '#34d399', 'rgba(52,211,153,.12)')} onClick={() => setSoDocumentos(v => !v)}>
          📎 Só com documentos
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
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

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: cores.suave }}>Carregando...</div>
      ) : filtrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: cores.suave, background: cores.card, borderRadius: 14, border: `1px solid ${cores.cardBorda}` }}>
          {clientes.length === 0 ? '📭 Nenhum cliente cadastrado ainda.' : 'Nenhum cliente encontrado.'}
        </div>
      ) : filtrados.map(c => {
        const info = STATUS_INFO[c.status] || { cor: '#94a3b8', bg: '#2b3340', label: c.status, icon: '' }
        const prod = PRODUTO_ESTILO[c.produto] || { cor: '#94a3b8', bg: '#2b3340', label: c.produto }
        const docs = c.documentos || {}
        const chaves = chavesDe(c.produto)
        const anexados = chaves.filter(k => docs[k])
        const printsCli = prints[c.id] || []
        const temPrints = printsCli.some(p => p.gerid || p.cnis)
        const totalDocs = anexados.length + printsCli.filter(p => p.gerid && p.cnis).length * 2 + (printsCli.some(p => p.gerid && !p.cnis) || printsCli.some(p => p.cnis && !p.gerid) ? 1 : 0) + (c.link_assinatura ? 1 : 0)

        return (
          <div key={c.id} style={{ background: cores.card, border: `1px solid ${cores.cardBorda}`, borderLeft: `3px solid ${info.cor}`, borderRadius: 14, padding: '1rem', marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 8, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: cores.texto, marginBottom: 2 }}>{c.nome}</div>
                <div style={{ fontSize: 12, color: cores.suave }}>{c.cpf} · {c.telefone}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={s.badge(prod.cor, prod.bg)}>{prod.label}</span>
                <span style={s.badge(info.cor, info.bg)}>{info.icon} {info.label}</span>
              </div>
            </div>

            <div style={{ fontSize: 11, color: cores.suave, marginTop: 4 }}>
              {c.cidade && c.uf ? `${c.cidade}/${c.uf}` : (c.cidade || c.uf || '')}
              {' · '}cadastro {tempoRelativo(c.created_at)}
              {c.profiles?.nome && <> · 👤 <span style={{ color: '#cbd5e1' }}>{c.profiles.nome}</span></>}
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

            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: anexados.length > 0 ? '#34d399' : cores.suave }}>
                📎 {anexados.length}/{chaves.length} documentos
              </span>
              {temPrints && <span style={{ fontSize: 11, fontWeight: 600, color: '#60a5fa' }}>🖨️ prints GERID/CNIS</span>}
              {c.link_assinatura && <span style={{ fontSize: 11, fontWeight: 600, color: '#a78bfa' }}>📨 contrato emitido</span>}
            </div>

            {(anexados.length > 0 || temPrints || c.link_assinatura) ? (
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {anexados.map(k => (
                  <a key={k} href={docs[k]} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 11.5, borderRadius: 8, background: 'rgba(52,211,153,.10)', color: '#34d399', textDecoration: 'none', border: '1px solid rgba(52,211,153,.25)' }}>
                    {DOC_LABELS[k] || k}
                  </a>
                ))}
                {printsCli.filter(p => p.gerid || p.cnis).map((p, i) => (
                  <span key={i} style={{ display: 'inline-flex', gap: 6 }}>
                    {p.gerid && (
                      <a href={URL_STORAGE + p.gerid} target="_blank" rel="noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 11.5, borderRadius: 8, background: 'rgba(96,165,250,.10)', color: '#60a5fa', textDecoration: 'none', border: '1px solid rgba(96,165,250,.25)' }}>
                        🖨️ Print GERID
                      </a>
                    )}
                    {p.cnis && (
                      <a href={URL_STORAGE + p.cnis} target="_blank" rel="noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 11.5, borderRadius: 8, background: 'rgba(96,165,250,.10)', color: '#60a5fa', textDecoration: 'none', border: '1px solid rgba(96,165,250,.25)' }}>
                        🖨️ Print CNIS
                      </a>
                    )}
                  </span>
                ))}
                {c.link_assinatura && (
                  <a href={c.link_assinatura} target="_blank" rel="noreferrer"
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
    </div>
  )
}
