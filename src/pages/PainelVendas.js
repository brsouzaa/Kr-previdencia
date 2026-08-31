import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import ModalNovaVenda from '../components/ModalNovaVenda'
import FichaCliente from '../components/FichaCliente'

// 31/08 v3 — retrabalho pedido pelo Bruno: "os números parecem estar mt confusos".
//
// O que mudou nesta versão:
//   • MATRIZ vendedor x produto: quantas de Maternidade Mãe, de Bolsa Família,
//     de Gestante, etc. Antes só existia o total por pessoa, que não dizia nada
//     sobre o que cada uma vende.
//   • A tabela detalhada passou a RESPEITAR O FILTRO. Era fixa em "últimos 30
//     dias" enquanto o resto da tela mostrava o período escolhido — dois números
//     diferentes na mesma tela é o que fazia parecer confuso.
//   • O vendedor também ganhou o filtro de período (antes só o admin tinha).
//   • Cada bloco agora diz em uma linha COMO ler o número dele.
//   • "+ Nova venda" ficou no topo, destacado, para admin e vendedor.
//
// Regra de leitura: cada número aparece UMA vez, no lugar onde responde uma
// pergunta. Se não muda nenhuma decisão, não entra na tela.
// Paleta validada (contraste + daltonismo). Aqui só existem DUAS séries em toda
// a tela — aprovada e barrada — então duas cores bastam. Produto e vendedor são
// categorias nominais de uma série só: todas na mesma cor.
const COR_APROVADA = '#2a78d6'   // slot 1
const COR_BARRADA = '#e34948'    // status, não categoria
const COR_BARRADA_TXT = '#b3322f' // o mesmo status em texto, com contraste
const COR_TEXTO = '#0f172a'
const COR_FRACA = '#94a3b8'
const COR_MEDIA = '#5b6b84'
const COR_VERDE = '#1baf7a'
const COR_TRILHO = '#eef2f7'

const PERIODOS = [['hoje', 'Hoje'], ['7d', '7 dias'], ['mes', 'Este mês'], ['30d', '30 dias']]

const isoLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const hojeISO = () => isoLocal(new Date())
const somaDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoLocal(d) }
const inicioMes = () => { const d = new Date(); d.setDate(1); return isoLocal(d) }
const brData = (iso) => { const p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] : '' }
const dinheiro = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const inteiro = (v) => Number(v || 0).toLocaleString('pt-BR')

function faixaDe(p) {
  if (p === 'hoje') return [hojeISO(), hojeISO()]
  if (p === '7d') return [somaDias(-6), hojeISO()]
  if (p === 'mes') return [inicioMes(), hojeISO()]
  return [somaDias(-29), hojeISO()]
}
const rotuloPeriodo = (p, ini, fim) => {
  const achado = PERIODOS.find(([v]) => v === p)
  if (achado) return achado[1].toLowerCase()
  return brData(ini) + ' a ' + brData(fim)
}

// De onde veio a barrada. Sao ETAPAS diferentes da operacao e cada uma pede uma
// acao diferente — chamar todas de "barrada" escondia isso. Confirmado no banco:
// das 742 barradas da base, ZERO sao do advogado (502 Revisao IA, 240 pos-venda).
const ORIGEM_BARRADA = {
  advogado:   { rot: 'advogado', desc: 'o advogado nao ficou com a cliente' },
  pos_venda:  { rot: 'pós-venda', desc: 'caiu na conferencia do pos-venda' },
  revisao_ia: { rot: 'revisão IA', desc: 'caiu na revisao antes de virar contrato' },
  cancelado:  { rot: 'cancelada', desc: 'cliente cancelada' },
  outro:      { rot: 'outra etapa', desc: 'barrada sem etapa registrada' },
}

const STATUS = {
  aprovada:     { rot: 'aprovada',     estilo: 'bom' },
  concluida:    { rot: 'concluída',    estilo: 'bom' },
  barrada:      { rot: 'barrada',      estilo: 'ruim' },
  cancelada:    { rot: 'cancelada',    estilo: 'ruim' },
  pendente:     { rot: 'pendente',     estilo: 'neutro' },
  em_validacao: { rot: 'em validação', estilo: 'neutro' },
}

const s = {
  title: { fontSize: 20, fontWeight: 500, color: COR_TEXTO, marginBottom: 3 },
  sub: { fontSize: 13, color: COR_MEDIA },

  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          gap: 12, flexWrap: 'wrap', marginBottom: 16 },
  btnNova: { padding: '11px 20px', fontSize: 14, fontWeight: 600, borderRadius: 10,
             border: 'none', background: COR_VERDE, color: '#fff', cursor: 'pointer',
             boxShadow: '0 1px 3px rgba(27,175,122,.35)', whiteSpace: 'nowrap' },

  barraTopo: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 },
  chip: { padding: '7px 14px', fontSize: 12.5, fontWeight: 500, borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.12)', background: '#ffffff', color: COR_MEDIA, cursor: 'pointer', whiteSpace: 'nowrap' },
  chipOn: { background: COR_TEXTO, color: '#ffffff', borderColor: COR_TEXTO },
  dataInput: { padding: '6px 10px', fontSize: 12.5, borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.18)' },
  periodoNota: { fontSize: 11.5, color: COR_FRACA, marginBottom: 18 },

  // Hierarquia em dois níveis: um número principal grande (o que o admin abre a
  // tela para ver) e os de apoio menores ao lado. Quatro números do mesmo tamanho
  // não têm hierarquia nenhuma — o olho não sabe onde pousar.
  kpiGrade: { display: 'grid', gridTemplateColumns: 'minmax(230px, 1.15fr) 2.6fr',
              gap: 12, marginBottom: 14, alignItems: 'stretch' },
  kpiHero: { background: '#fff', border: '0.5px solid rgba(15,23,42,0.10)', borderRadius: 12,
             padding: '18px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center' },
  // figura grande usa numeral proporcional: tabular deixa o número "solto"
  heroNum: { fontSize: 46, fontWeight: 700, color: COR_TEXTO, lineHeight: 1, letterSpacing: '-1.6px' },
  heroLab: { fontSize: 13, color: COR_MEDIA, marginTop: 7 },
  heroPe: { fontSize: 12, marginTop: 10, lineHeight: 1.5 },

  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(146px, 1fr))', gap: 1,
          background: 'rgba(15,23,42,0.08)', border: '0.5px solid rgba(15,23,42,0.08)',
          borderRadius: 12, overflow: 'hidden' },
  kpi: { background: '#ffffff', padding: '14px 16px', display: 'flex', flexDirection: 'column',
         justifyContent: 'center', minHeight: 84 },
  kpiNum: { fontSize: 25, fontWeight: 700, color: COR_TEXTO, lineHeight: 1.05, letterSpacing: '-0.6px' },
  kpiLab: { fontSize: 11.5, color: COR_MEDIA, marginTop: 4, lineHeight: 1.35 },
  kpiPe: { fontSize: 11, marginTop: 6, lineHeight: 1.4 },

  // "como ler" recolhido: útil na primeira vez, ruído da segunda em diante
  comoLerBtn: { border: 'none', background: 'none', color: COR_MEDIA, fontSize: 12,
                cursor: 'pointer', padding: '4px 0', marginBottom: 14, textDecoration: 'underline',
                textUnderlineOffset: 3, fontFamily: 'inherit' },

  faixa: (tom) => ({
    fontSize: 12.5, lineHeight: 1.6, borderRadius: 10, padding: '11px 14px', marginBottom: 16,
    color: tom === 'alerta' ? '#7c2d12' : COR_MEDIA,
    background: tom === 'alerta' ? 'rgba(237,161,0,.14)' : '#f8fafc',
    border: '0.5px solid ' + (tom === 'alerta' ? 'rgba(237,161,0,.5)' : 'rgba(15,23,42,0.08)'),
  }),

  colunas: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 14, alignItems: 'start' },
  bloco: { background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.10)', borderRadius: 12, padding: 17, marginBottom: 14 },
  blocoTit: { fontSize: 13.5, fontWeight: 600, color: COR_TEXTO, marginBottom: 2 },
  blocoSub: { fontSize: 11, color: COR_FRACA, marginBottom: 15 },

  legenda: { display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 },
  legItem: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: COR_MEDIA },
  legSwatch: { width: 10, height: 10, borderRadius: 3, display: 'inline-block' },

  barraLinha: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 },
  barraNome: { fontSize: 12.5, color: COR_TEXTO, width: 138, flexShrink: 0, textAlign: 'right',
               overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  // trilho fino: marca <= 24px, o resto da faixa é ar
  barraTrilho: { flex: 1, height: 18, background: COR_TRILHO, borderRadius: 4, display: 'flex', gap: 2, overflow: 'hidden' },
  barraFill: (cor, pct) => ({ width: Math.max(pct, 0) + '%', background: cor, borderRadius: '0 4px 4px 0' }),
  barraVal: { fontSize: 12.5, fontWeight: 700, color: COR_TEXTO, width: 46, flexShrink: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  barraSec: { fontSize: 11.5, color: COR_BARRADA_TXT, width: 56, flexShrink: 0, fontVariantNumeric: 'tabular-nums' },

  evo: { display: 'flex', alignItems: 'flex-end', gap: 6, height: 130, overflowX: 'auto', paddingTop: 6 },
  evoCol: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 26, flex: 1, cursor: 'default' },
  evoTopo: { fontSize: 10.5, fontWeight: 700, color: COR_TEXTO, fontVariantNumeric: 'tabular-nums', height: 13 },
  evoPilha: { display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center',
              height: 82, width: '100%', gap: 2 },
  evoBarra: (h, cor, topo) => ({ width: '100%', maxWidth: 24, height: Math.max(h, 0),
                                 background: cor, borderRadius: topo ? '4px 4px 0 0' : 0 }),
  evoDia: { fontSize: 10, color: COR_FRACA, whiteSpace: 'nowrap' },

  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 },
  th: { textAlign: 'left', fontSize: 10, color: COR_FRACA, fontWeight: 600, padding: '6px 8px',
        borderBottom: '0.5px solid rgba(15,23,42,0.10)', textTransform: 'uppercase', letterSpacing: '.4px',
        whiteSpace: 'nowrap' },
  thNum: { textAlign: 'right', fontSize: 10, color: COR_FRACA, fontWeight: 600, padding: '6px 8px',
           borderBottom: '0.5px solid rgba(15,23,42,0.10)', textTransform: 'uppercase', letterSpacing: '.4px',
           whiteSpace: 'nowrap' },
  td: { padding: '9px 8px', borderBottom: '0.5px solid rgba(15,23,42,0.05)', color: COR_TEXTO },
  tdNum: { padding: '9px 8px', borderBottom: '0.5px solid rgba(15,23,42,0.05)', color: COR_TEXTO,
           textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  tdZero: { padding: '9px 8px', borderBottom: '0.5px solid rgba(15,23,42,0.05)', color: '#cbd5e1',
            textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  trTotal: { background: '#f8fafc', fontWeight: 700 },

  tag: { fontSize: 10.5, color: COR_MEDIA, background: '#f1f5f9', borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap' },
  tagEtapa: { fontSize: 10, fontWeight: 600, color: '#7c2d12', background: 'rgba(237,161,0,.16)',
              borderRadius: 5, padding: '2px 6px', whiteSpace: 'nowrap' },
  tabelaTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                gap: 12, flexWrap: 'wrap', marginBottom: 14 },
  select: { padding: '8px 11px', fontSize: 12.5, borderRadius: 9, cursor: 'pointer',
            border: '0.5px solid rgba(15,23,42,0.18)', background: '#fff', color: COR_TEXTO,
            fontFamily: 'inherit', flexShrink: 0 },
  trClicavel: { cursor: 'pointer' },
  buscaCaixa: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flex: '1 1 260px', minWidth: 200 },
  buscaInput: { flex: 1, minWidth: 170, padding: '8px 12px', fontSize: 13, borderRadius: 9,
                border: '0.5px solid rgba(15,23,42,0.18)', boxSizing: 'border-box', fontFamily: 'inherit' },
  buscaLimpa: { border: 'none', background: '#f1f5f9', color: COR_MEDIA, borderRadius: 8,
                padding: '7px 11px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  buscaNota: { fontSize: 11.5, color: COR_MEDIA, background: '#f8fafc', borderRadius: 8,
               padding: '8px 11px', marginBottom: 12, lineHeight: 1.55,
               border: '0.5px solid rgba(15,23,42,0.08)' },
  tagRuim: { fontSize: 10.5, fontWeight: 700, color: '#b3322f', background: 'rgba(227,73,72,.13)', borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap' },
  tagBom: { fontSize: 10.5, fontWeight: 700, color: '#0f7a52', background: 'rgba(27,175,122,.15)', borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap' },
  vazio: { fontSize: 12.5, color: COR_FRACA, padding: '20px 6px', textAlign: 'center' },
  btnLinha: { fontSize: 11.5, padding: '4px 9px', marginLeft: 5, borderRadius: 7, cursor: 'pointer',
              border: '1px solid rgba(15,23,42,0.14)', background: '#fff', color: COR_MEDIA },
  btnLinhaRuim: { color: COR_BARRADA_TXT, borderColor: 'rgba(227,73,72,.3)' },
  travada: { fontSize: 11.5, color: COR_FRACA, cursor: 'help' },
  nota: { fontSize: 11, color: COR_FRACA, marginTop: 12, lineHeight: 1.5 },
}

function TagStatus({ status }) {
  const cfg = STATUS[status] || { rot: status || '—', estilo: 'neutro' }
  const estilo = cfg.estilo === 'bom' ? s.tagBom : cfg.estilo === 'ruim' ? s.tagRuim : s.tag
  return <span style={estilo}>{cfg.rot}</span>
}

// Legenda: com duas séries ela é obrigatória. Identidade nunca pode depender
// só da cor — quem não distingue vermelho de azul precisa do rótulo.
function Legenda({ itens }) {
  return (
    <div style={s.legenda}>
      {itens.map(([cor, rot]) => (
        <span key={rot} style={s.legItem}>
          <span style={{ ...s.legSwatch, background: cor }} />{rot}
        </span>
      ))}
    </div>
  )
}

// Barras. Correções de 31/08 depois de rodar o painel contra as regras de dataviz:
//   • a cor vinha de CORES[i] — mudava conforme a POSIÇÃO na lista. Ordenou
//     diferente, trocou a cor do produto. Aqui há UMA série (aprovadas) em
//     categorias nominais, então é UMA cor só; o vermelho é status, não categoria.
//   • o texto do "−7" usava a própria cor do dado; agora usa tom de texto que
//     passa contraste.
function Barras({ itens, valorDe, secDe, rotuloDe }) {
  if (!itens.length) return <div style={s.vazio}>Nada no período.</div>
  // a escala considera a barra INTEIRA (aprovadas + barradas), senão os dois
  // pedaços somados estouram o trilho
  const max = Math.max(1, ...itens.map(it => valorDe(it) + (secDe ? Number(secDe(it) || 0) : 0)))
  return (
    <div>
      {itens.map((it, i) => {
        const val = Number(valorDe(it) || 0)
        const sec = secDe ? Number(secDe(it) || 0) : 0
        const rot = rotuloDe(it)
        return (
          <div key={rot + i} style={s.barraLinha}
            title={`${rot}: ${inteiro(val)} aprovadas${sec ? ` · ${inteiro(sec)} barradas` : ''}`}>
            <div style={s.barraNome} title={rot}>{rot}</div>
            <div style={s.barraTrilho}>
              {val > 0 && <div style={s.barraFill(COR_APROVADA, 100 * val / max)} />}
              {sec > 0 && <div style={s.barraFill(COR_BARRADA, 100 * sec / max)} />}
            </div>
            <div style={s.barraVal}>{inteiro(val)}</div>
            {secDe && <div style={s.barraSec}>{sec > 0 ? '−' + inteiro(sec) : ''}</div>}
          </div>
        )
      })}
    </div>
  )
}

// A matriz que faltava: cada linha é uma pessoa, cada coluna um produto.
// Sem isso o total por vendedor não diz O QUE a pessoa vende.
function MatrizVendedorProduto({ vendedores, produtos }) {
  if (!vendedores.length) return <div style={s.vazio}>Ninguém vendeu no período.</div>
  const totalPorProduto = {}
  let totalGeral = 0
  for (const v of vendedores) {
    for (const p of produtos) {
      const n = Number((v.produtos || {})[p] || 0)
      totalPorProduto[p] = (totalPorProduto[p] || 0) + n
    }
    totalGeral += Number(v.vendas || 0)
  }
  return (
    <div style={{ overflowX: 'auto', scrollbarWidth: 'thin' }}>
      <table style={s.tabela}>
        <thead>
          <tr>
            <th style={s.th}>Vendedor</th>
            {produtos.map(p => <th key={p} style={s.thNum}>{p}</th>)}
            <th style={s.thNum}>Total</th>
            <th style={s.thNum}>Barradas</th>
          </tr>
        </thead>
        <tbody>
          {vendedores.map((v, i) => {
            const decididas = Number(v.vendas || 0) + Number(v.barradas || 0)
            const pct = decididas ? Math.round(100 * Number(v.barradas || 0) / decididas) : null
            return (
              <tr key={v.nome + i}>
                <td style={s.td}>{v.nome}</td>
                {produtos.map(p => {
                  const n = Number((v.produtos || {})[p] || 0)
                  return <td key={p} style={n ? s.tdNum : s.tdZero}>{n || '·'}</td>
                })}
                <td style={{ ...s.tdNum, fontWeight: 700 }}>{inteiro(v.vendas)}</td>
                <td style={s.tdNum}>
                  {Number(v.barradas || 0) > 0
                    ? <span style={pct >= 30 ? s.tagRuim : s.tag}>{v.barradas} · {pct}%</span>
                    : <span style={{ color: COR_FRACA }}>—</span>}
                </td>
              </tr>
            )
          })}
          <tr style={s.trTotal}>
            <td style={s.td}>Total</td>
            {produtos.map(p => <td key={p} style={s.tdNum}>{inteiro(totalPorProduto[p] || 0)}</td>)}
            <td style={s.tdNum}>{inteiro(totalGeral)}</td>
            <td style={s.tdNum} />
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// Tabela detalhada. Usada nos dois lados; o admin ganha a coluna de vendedor.
//
// 31/08: o motivo da barrada saiu da celula — texto livre de tamanho imprevisivel
// dentro de tabela quebra o alinhamento de todas as linhas. Agora a LINHA INTEIRA
// abre a ficha, que tem espaco para o motivo, a etapa e os documentos.
const FILTROS = [
  ['todas',      'Todas'],
  ['aprovadas',  'Só aprovadas'],
  ['barradas',   'Só barradas'],
  ['revisao_ia', 'Barradas na revisão IA'],
  ['pos_venda',  'Barradas no pós-venda'],
  ['advogado',   'Barradas pelo advogado'],
  ['sem_decisao','Ainda sem decisão'],
  ['sem_compr',  'Sem comprovante'],
  ['indicacao',  'Só indicações'],
]

function filtraTexto(lista, termo) {
  const t = (termo || '').trim().toLowerCase()
  if (t.length < 2) return lista
  const dig = t.replace(/\D/g, '')
  const semAcento = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const alvo = semAcento(t)
  return lista.filter(v =>
    semAcento(v.cliente).includes(alvo) ||
    (dig.length >= 3 && String(v.cpf || '').replace(/\D/g, '').includes(dig)))
}

function aplicaFiltro(lista, f) {
  if (f === 'todas') return lista
  return lista.filter(v => {
    switch (f) {
      case 'aprovadas':   return v.status === 'aprovada' || v.status === 'concluida'
      case 'barradas':    return v.status === 'barrada'
      case 'revisao_ia':  return v.origem_barrada === 'revisao_ia'
      case 'pos_venda':   return v.origem_barrada === 'pos_venda'
      case 'advogado':    return v.origem_barrada === 'advogado'
      case 'sem_decisao': return v.status === 'pendente' || v.status === 'em_validacao'
      case 'sem_compr':   return !v.tem_comprovante
      // 31/08: o filtro de "historico importado" saiu — nada importado chega mais
      // nesta lista. No lugar dele, o corte que passou a existir: venda de indicacao.
      case 'indicacao':   return v.origem_venda === 'indicacao'
      default: return true
    }
  })
}

// por que a venda não pode mais ser mexida — o vendedor precisa saber, senão
// acha que a tela travou sem motivo
function motivoTravada(v) {
  if (v.comissao_paga) return 'comissão já paga — não dá mais para desfazer'
  if (v.status === 'aprovada' || v.status === 'concluida' || v.status === 'barrada')
    return 'o advogado já decidiu esta venda'
  return 'veio do fluxo automático do contrato, não é uma anotação'
}

function TabelaVendas({ lista, comVendedor, aoAbrir, filtro, setFiltro, titulo, subtitulo,
                       busca, setBusca, achados, buscando, aoBuscarTudo, aoLimparBusca,
                       aoCancelar, aoExcluir }) {
  const emBusca = !!achados
  const base = emBusca ? achados : filtraTexto(lista, busca)
  const visivel = aplicaFiltro(base, filtro)
  const termo = (busca || '').trim()
  return (
    <div style={s.bloco}>
      <div style={s.tabelaTopo}>
        <div style={{ minWidth: 0 }}>
          <div style={s.blocoTit}>{emBusca ? 'Resultado da busca' : titulo}</div>
          <div style={{ ...s.blocoSub, marginBottom: 0 }}>
            {emBusca
              ? <>{inteiro(visivel.length)} venda(s) de todo o histórico · clique para ver a ficha</>
              : filtro === 'todas'
                ? <>{inteiro(lista.length)} venda(s) · clique na linha para ver a ficha</>
                : <>{inteiro(visivel.length)} de {inteiro(lista.length)} · clique na linha para ver a ficha</>}
          </div>
          {!emBusca && subtitulo}
        </div>
        <div style={s.buscaCaixa}>
          <input style={s.buscaInput} value={busca || ''}
            placeholder="Localizar cliente por nome ou CPF..."
            onChange={e => setBusca(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') aoBuscarTudo && aoBuscarTudo() }} />
          {(termo || emBusca) && (
            <button style={s.buscaLimpa} onClick={aoLimparBusca}>limpar</button>
          )}
          <select style={s.select} value={filtro} onChange={e => setFiltro(e.target.value)}>
            {FILTROS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      {/* A lista carregada é só do período. Quem procura uma cliente quase nunca
          lembra de quando foi a venda — então a busca alcança todo o histórico. */}
      {!emBusca && termo.length >= 2 && (
        <div style={s.buscaNota}>
          {visivel.length > 0
            ? <>Mostrando {inteiro(visivel.length)} do período atual. </>
            : <>Nada com esse nome no período mostrado. </>}
          <button style={{ ...s.buscaLimpa, background: '#e8f0fb', color: '#1d5fa8' }}
            onClick={() => aoBuscarTudo && aoBuscarTudo()} disabled={buscando}>
            {buscando ? 'procurando...' : 'procurar em todo o histórico'}
          </button>
        </div>
      )}
      {emBusca && (
        <div style={s.buscaNota}>
          Resultado de <b>{termo}</b> em todo o histórico, fora do filtro de período.
        </div>
      )}

      {visivel.length === 0 ? (
        <div style={s.vazio}>
          {lista.length === 0
            ? 'Nenhuma venda anotada no período. Use "+ Cadastrar venda" para registrar a primeira.'
            : 'Nenhuma venda com esse filtro. As outras continuam no período.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', maxHeight: '55vh', scrollbarWidth: 'thin' }}>
          <table style={s.tabela}>
            <thead>
              <tr>
                <th style={s.th}>Data</th>
                <th style={s.th}>Cliente</th>
                <th style={s.th}>Produto</th>
                {comVendedor && <th style={s.th}>Vendedor</th>}
                <th style={s.th}>Situação</th>
                <th style={s.thNum}>Comissão</th>
                {aoCancelar && <th style={s.th}></th>}
              </tr>
            </thead>
            <tbody>
              {visivel.map(v => (
                <tr key={v.id} style={s.trClicavel}
                    onClick={() => aoAbrir && aoAbrir(v)}
                    title="Ver a ficha completa desta cliente">
                  <td style={{ ...s.td, whiteSpace: 'nowrap' }}>{brData(v.data_venda)}</td>
                  <td style={{ ...s.td, maxWidth: 260, overflow: 'hidden',
                               textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.cliente}>
                    {v.cliente}
                    {!v.tem_comprovante && v.status === 'pendente' &&
                      <span style={{ ...s.tagRuim, marginLeft: 6 }}>sem comprovante</span>}
                  </td>
                  <td style={{ ...s.td, whiteSpace: 'nowrap' }}>{v.produto || '—'}</td>
                  {comVendedor && (
                    <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                      {v.eh_robo ? <span style={s.tag}>🤖 {v.vendedor}</span> : v.vendedor}
                    </td>
                  )}
                  {/* só o status e a etapa: dois rótulos curtos, largura previsível.
                      O motivo é texto livre e mora na ficha. */}
                  <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                    <TagStatus status={v.status} />
                    {v.origem_barrada && ORIGEM_BARRADA[v.origem_barrada] && (
                      <span style={{ ...s.tagEtapa, marginLeft: 5 }}>
                        {ORIGEM_BARRADA[v.origem_barrada].rot}
                      </span>
                    )}
                  </td>
                  <td style={s.tdNum}>
                    {v.conta_comissao === false
                      ? <span style={s.tag}>histórico</span>
                      : dinheiro(v.comissao)}
                  </td>
                  {/* 31/08: o painel também serve de anotação, então dá para desfazer
                      o que você mesmo anotou. Quem diz se pode é o banco (pode_editar),
                      com o mesmo critério das RPCs — nunca um cálculo só da tela. */}
                  {aoCancelar && (
                    <td style={{ ...s.td, whiteSpace: 'nowrap', textAlign: 'right' }}
                        onClick={e => e.stopPropagation()}>
                      {v.pode_editar ? (
                        <>
                          <button style={s.btnLinha} title="Marcar como cancelada, mantendo o registro"
                            onClick={() => aoCancelar(v)}>cancelar</button>
                          <button style={{ ...s.btnLinha, ...s.btnLinhaRuim }}
                            title="Apagar de vez esta anotação"
                            onClick={() => aoExcluir && aoExcluir(v)}>excluir</button>
                        </>
                      ) : <span style={s.travada} title={motivoTravada(v)}>—</span>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function PainelVendas() {
  const { profile } = useAuth()
  const ehAdmin = profile?.role === 'admin'

  // abre em HOJE: o admin entra para saber como esta o dia, nao o acumulado
  const [periodo, setPeriodo] = useState('hoje')
  const [ini, setIni] = useState(hojeISO())
  const [fim, setFim] = useState(hojeISO())
  const [painel, setPainel] = useState(null)
  const [meu, setMeu] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [modalVenda, setModalVenda] = useState(false)
  const [comoLer, setComoLer] = useState(false)
  const [filtroTab, setFiltroTab] = useState('todas')
  const [fichaVenda, setFichaVenda] = useState(null)  // venda cuja ficha esta aberta
  const [busca, setBusca] = useState('')
  const [achados, setAchados] = useState(null)        // null = nao buscou no historico
  const [buscando, setBuscando] = useState(false)

  // A lista da tela é só do período. Quem procura uma cliente raramente lembra
  // de quando foi a venda, então esta busca ignora o filtro e varre tudo.
  const buscarNoHistorico = useCallback(async () => {
    const t = busca.trim()
    if (t.length < 3) { setErro('Digite ao menos 3 letras ou 3 números do CPF.'); return }
    setBuscando(true); setErro('')
    const { data, error } = await supabase.rpc('venda_localizar', { p_termo: t })
    setBuscando(false)
    if (error) { setErro(error.message); return }
    setAchados(data || [])
  }, [busca])

  const limparBusca = useCallback(() => { setBusca(''); setAchados(null); setErro('') }, [])
  const carregarRef = useRef(null)

  // 31/08: desfazer a própria anotação. A confirmação é obrigatória porque as duas
  // ações são silenciosas — nada avisa o time que a venda saiu da contagem.
  // Quem tem a palavra final é a RPC: se ela recusar, a tela mostra o motivo dela.
  const traduzAcao = (m) => {
    if (/VENDA_DO_FLUXO_AUTOMATICO/.test(m))
      return 'Esta venda veio do fluxo do contrato, não é uma anotação sua. Ela só sai do painel pelo CRM.'
    if (/VENDA_DE_OUTRA_PESSOA/.test(m)) return 'Esta venda é de outro vendedor.'
    if (/COMISSAO_JA_PAGA/.test(m)) return 'A comissão já foi paga — não dá mais para desfazer.'
    if (/ADVOGADO_JA_DECIDIU/.test(m)) return 'O advogado já decidiu esta venda.'
    if (/SO_APAGA_VENDA_SEM_DECISAO/.test(m)) return 'Só dá para apagar venda que ainda não foi decidida. Use cancelar.'
    return m
  }

  const cancelarVenda = useCallback(async (v) => {
    const motivo = window.prompt('Cancelar a venda de ' + v.cliente + '.\nPor quê?')
    if (motivo === null) return
    const { error } = await supabase.rpc('venda_cancelar', { p_venda_id: v.id, p_motivo: motivo })
    if (error) { setErro(traduzAcao(error.message)); return }
    setErro(''); carregarRef.current && carregarRef.current()
  }, [])

  const excluirVenda = useCallback(async (v) => {
    if (!window.confirm('Apagar de vez a anotação da venda de ' + v.cliente
      + '?\nIsso não pode ser desfeito. Para manter o registro, use cancelar.')) return
    const { error } = await supabase.rpc('venda_excluir', { p_venda_id: v.id })
    if (error) { setErro(traduzAcao(error.message)); return }
    setErro(''); carregarRef.current && carregarRef.current()
  }, [])

  useEffect(() => {
    if (periodo === 'custom') return
    const [a, b] = faixaDe(periodo)
    setIni(a); setFim(b)
  }, [periodo])

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('')
    // os dois lados recebem o MESMO período: era isso que fazia a tabela do
    // vendedor mostrar 30 dias enquanto o resto da tela mostrava outra coisa
    const r = ehAdmin
      ? await supabase.rpc('venda_painel', { p_inicio: ini, p_fim: fim })
      : await supabase.rpc('venda_minhas', { p_inicio: ini, p_fim: fim })
    if (r.error) setErro(r.error.message)
    if (ehAdmin) setPainel(r.data || null); else setMeu(r.data || null)
    setCarregando(false)
  }, [ehAdmin, ini, fim])

  useEffect(() => { carregar() }, [carregar])
  // cancelar/excluir precisam recarregar a tela, mas são declarados antes de
  // `carregar` — o ref evita reordenar meio arquivo só por causa disso
  useEffect(() => { carregarRef.current = carregar }, [carregar])

  const t = painel?.totais
  const ant = painel?.anterior
  const decididas = t ? Number(t.vendas || 0) + Number(t.barradas || 0) : 0
  const pctBarrada = decididas ? Math.round(100 * Number(t.barradas || 0) / decididas) : null

  // 31/08: os dois lados da conta agora são só venda anotada, então a comparação
  // voltou a ser honesta e não precisa mais se esconder quando havia importação.
  const delta = useMemo(() => {
    if (!t || !ant) return null
    const a = Number(ant.vendas || 0), h = Number(t.vendas || 0)
    return a === 0 ? null : Math.round(100 * (h - a) / a)
  }, [t, ant])

  // "20% do que foi decidido" nao diz ONDE a venda caiu. Etapa diferente = acao
  // diferente: revisao IA e cadastro, pos-venda e conferencia, advogado e perfil.
  const resumoBarradas = useMemo(() => {
    const o = painel?.barradas_por_origem || {}
    const partes = Object.entries(o)
      .filter(([, n]) => Number(n) > 0)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .map(([k, n]) => `${inteiro(n)} ${(ORIGEM_BARRADA[k] || { rot: k }).rot}`)
    return partes.length ? partes.join(' · ') : ''
  }, [painel])

  // ritmo do período: 422 no mês não diz nada; 13 por dia diz se hoje foi bom
  const mediaDia = useMemo(() => {
    const d = Number(painel?.periodo?.dias || 0)
    if (!t || d < 2) return null
    return (Number(t.vendas || 0) / d).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  }, [t, painel])

  const porDia = painel?.por_dia || []
  // a coluna empilha aprovadas + barradas: a escala tem que ser da SOMA, senão
  // os dois pedaços juntos passam da altura do container e vazam pra fora
  const maxDia = Math.max(1, ...porDia.map(d => Number(d.vendas || 0) + Number(d.barradas || 0)))
  const gargalo = painel?.aguardando_advogado || []
  const totalGargalo = gargalo.reduce((a, g) => a + Number(g.qtd || 0), 0)
  const robo = painel?.robo
  const produtosPeriodo = painel?.produtos_periodo || []
  const rotPer = rotuloPeriodo(periodo, ini, fim)

  const mt = meu?.periodo_totais
  const mAnt = meu?.anterior
  const mDelta = useMemo(() => {
    if (!mt || !mAnt) return null
    const a = Number(mAnt.vendas || 0), h = Number(mt.vendas || 0)
    return a === 0 ? null : Math.round(100 * (h - a) / a)
  }, [mt, mAnt])

  const filtro = (
    <>
      <div style={s.barraTopo}>
        {PERIODOS.map(([v, l]) => (
          <button key={v} style={{ ...s.chip, ...(periodo === v ? s.chipOn : {}) }}
            onClick={() => setPeriodo(v)}>{l}</button>
        ))}
        <button style={{ ...s.chip, ...(periodo === 'custom' ? s.chipOn : {}) }}
          onClick={() => setPeriodo('custom')}>Escolher</button>
        {periodo === 'custom' && (<>
          <input type="date" style={s.dataInput} value={ini} onChange={e => setIni(e.target.value)} />
          <span style={{ color: COR_FRACA, fontSize: 12 }}>até</span>
          <input type="date" style={s.dataInput} value={fim} onChange={e => setFim(e.target.value)} />
        </>)}
      </div>
      <div style={s.periodoNota}>
        Tudo abaixo — inclusive a tabela do fim da página — é de <b>{brData(ini)} a {brData(fim)}</b>.
      </div>
    </>
  )

  return (
    <div>
      <div style={s.topo}>
        <div>
          <div style={s.title}>💵 Painel de vendas</div>
          <div style={s.sub}>
            {ehAdmin
              ? 'Todos os produtos, só o que foi anotado como venda.'
              : 'Sua produção e sua comissão — do que você anotou aqui.'}
          </div>
        </div>
        <button style={s.btnNova} onClick={() => setModalVenda(true)}>+ Cadastrar venda</button>
      </div>

      {erro && <div style={s.faixa('alerta')}>Não consegui carregar: {erro}</div>}
      {filtro}

      {/* ================= ADMIN ================= */}
      {ehAdmin && painel && (<>
        {totalGargalo > 0 && (
          <div style={s.faixa('alerta')}>
            <b>{inteiro(totalGargalo)} cliente(s)</b> entregues esperando alguém dizer se o advogado
            aceitou. Sem essa decisão a venda não fecha e a comissão não sai.
            {gargalo.map((g, i) => (
              <span key={i}> · <b>{g.dono}</b>: {g.qtd} (há {g.mais_antiga_dias}d)</span>
            ))}
          </div>
        )}

        <div style={s.kpiGrade}>
          {/* o número que a tela existe para mostrar, sozinho e grande */}
          <div style={s.kpiHero}>
            <div style={s.heroNum}>{inteiro(t?.vendas)}</div>
            <div style={s.heroLab}>vendas aprovadas</div>
            <div style={s.heroPe}>
              {delta !== null ? (
                <span style={{ color: delta >= 0 ? '#0f7a52' : '#b3322f', fontWeight: 600 }}>
                  {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}% vs período anterior
                </span>
              ) : <span style={{ color: COR_FRACA }}>sem base comparável</span>}
              {mediaDia !== null && (
                <span style={{ color: COR_MEDIA }}> · {mediaDia} por dia</span>
              )}
            </div>
          </div>

          <div style={s.kpis}>
            <div style={s.kpi}>
              <div style={{ ...s.kpiNum, color: Number(t?.barradas) > 0 ? COR_BARRADA_TXT : COR_TEXTO }}>
                {inteiro(t?.barradas)}
              </div>
              {/* "barradas pelo advogado" era mentira: das 742 da base, nenhuma
                  e do advogado. Agora o rotulo diz a etapa de verdade. */}
              <div style={s.kpiLab}>barradas</div>
              <div style={{ ...s.kpiPe, color: COR_MEDIA }}>
                {resumoBarradas || (pctBarrada !== null ? `${pctBarrada}% do que foi decidido` : '')}
              </div>
            </div>

            {/* MESMA fonte da tela "O advogado aceitou?" — antes este card contava
                o status da venda e dava um numero diferente do da outra tela,
                sem uma venda sequer em comum entre os dois. */}
            <div style={s.kpi}>
              <div style={s.kpiNum}>{inteiro(painel?.aguardando_advogado_total)}</div>
              <div style={s.kpiLab}>esperando o advogado</div>
              <div style={{ ...s.kpiPe, color: COR_FRACA }}>
                {Number(t?.em_aberto || 0) > 0
                  ? <>+{inteiro(t.em_aberto)} sem validação interna</>
                  : 'mesmo número da tela do advogado'}
              </div>
            </div>

            {/* gargalo acionável: some com um upload, por isso ganha um card */}
            <div style={s.kpi}>
              <div style={{ ...s.kpiNum, color: Number(t?.sem_comprovante) > 0 ? '#7c2d12' : COR_TEXTO }}>
                {inteiro(t?.sem_comprovante)}
              </div>
              <div style={s.kpiLab}>sem comprovante</div>
              <div style={{ ...s.kpiPe, color: Number(t?.sem_comprovante) > 0 ? '#7c2d12' : COR_FRACA }}>
                {Number(t?.sem_comprovante) > 0 ? 'travadas antes do advogado' : 'nenhuma travada'}
              </div>
            </div>

            <div style={s.kpi}>
              <div style={{ ...s.kpiNum, fontSize: 21 }}>{dinheiro(t?.comissao)}</div>
              <div style={s.kpiLab}>comissão a pagar</div>
              <div style={{ ...s.kpiPe, color: COR_FRACA }}>
                {Number(t?.comissao_paga || 0) > 0
                  ? <>{dinheiro(t.comissao_paga)} já paga</>
                  : 'nada pago ainda'}
              </div>
            </div>

            {Number(t?.emprestado || 0) > 0 && (
              <div style={s.kpi}>
                <div style={{ ...s.kpiNum, fontSize: 21 }}>{dinheiro(t?.emprestado)}</div>
                <div style={s.kpiLab}>emprestado no BF</div>
                <div style={{ ...s.kpiPe, color: COR_FRACA }}>
                  {Number(t?.ticket_bf || 0) > 0 ? <>{dinheiro(t.ticket_bf)} por venda</> : ''}
                </div>
              </div>
            )}
          </div>
        </div>

        {Number(painel?.fora_do_painel || 0) > 0 && (
          <div style={s.faixa()}>
            Este painel conta <b>só venda anotada por gente</b>. No mesmo período o sistema
            registrou mais <b>{inteiro(painel.fora_do_painel)}</b> pelo fluxo automático do
            contrato — elas continuam valendo no CRM e na tela do advogado, mas não entram
            aqui. Venda que ninguém anotar não aparece nesta contagem.
          </div>
        )}

        <button style={s.comoLerBtn} onClick={() => setComoLer(v => !v)}>
          {comoLer ? 'esconder' : 'como ler estes números'}
        </button>
        {comoLer && (
          <div style={s.faixa()}>
            Este painel é o <b>caderno de vendas do time</b>: só aparece aqui o que alguém
            anotou em "+ Cadastrar venda" — uma digitação que já existe no sistema marcada
            como venda, ou uma indicação nova. O que o contrato movimenta sozinho continua
            valendo no CRM, mas <b>não entra nesta contagem</b>.
            <br />Uma venda entra como <b>esperando decisão</b> quando é anotada. Quando o vendedor do
            advogado decide, ela vira <b>aprovada</b> (gera comissão) ou <b>barrada</b> (não gera).
            Os três somados dão o total anotado no período, e só o primeiro vira dinheiro.
            <br /><b>Sem comprovante</b> é diferente: a venda nem chega ao advogado até alguém
            anexar o papel — é a fila que depende só de você.
          </div>
        )}

        <div style={s.colunas}>
          <div style={s.bloco}>
            <div style={s.blocoTit}>Vendas por dia</div>
            <div style={s.blocoSub}>Quanto entrou a cada dia do período</div>
            <Legenda itens={[[COR_APROVADA, 'aprovadas'], [COR_BARRADA, 'barradas']]} />
            {porDia.length === 0 ? <div style={s.vazio}>Nada no período.</div> : (
              <div style={s.evo}>
                {porDia.map((d, i) => {
                  const v = Number(d.vendas || 0), b = Number(d.barradas || 0)
                  return (
                    <div key={i} style={s.evoCol}
                      title={`${brData(d.dia)}: ${inteiro(v)} aprovadas${b ? `, ${inteiro(b)} barradas` : ''}`}>
                      <div style={s.evoTopo}>{v || ''}</div>
                      <div style={s.evoPilha}>
                        {b > 0 && <div style={s.evoBarra(82 * b / maxDia, COR_BARRADA, true)} />}
                        {v > 0 && <div style={s.evoBarra(82 * v / maxDia, COR_APROVADA, b === 0)} />}
                      </div>
                      <div style={s.evoDia}>{brData(d.dia)}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div style={s.bloco}>
            <div style={s.blocoTit}>Por produto</div>
            <div style={s.blocoSub}>Vendas aprovadas no período, e quantas caíram</div>
            <Legenda itens={[[COR_APROVADA, 'aprovadas'], [COR_BARRADA, 'barradas']]} />
            <Barras itens={painel.por_produto || []}
              rotuloDe={x => x.produto || '—'}
              valorDe={x => Number(x.vendas || 0)}
              secDe={x => Number(x.barradas || 0)} />
            {/* o emprestado é só do Bolsa Família: como KPI global ele parecia
                valer para a tela inteira. Fica junto do produto a que pertence. */}
            {(painel.por_produto || []).filter(p => Number(p.emprestado || 0) > 0).map((p, i) => (
              <div key={i} style={s.nota}>
                <b>{p.produto}</b>: {dinheiro(p.emprestado)} emprestados às clientes no período.
              </div>
            ))}
          </div>
        </div>

        <div style={s.bloco}>
          <div style={s.blocoTit}>Vendedor por categoria</div>
          <div style={s.blocoSub}>
            Quantas de cada produto cada pessoa fechou no período. Só pessoas — robô não tem meta nem comissão.
          </div>
          <MatrizVendedorProduto vendedores={painel.por_vendedor || []} produtos={produtosPeriodo} />
          <div style={s.nota}>
            Percentual de barrada alto em uma pessoa costuma ser qualidade do cadastro, não volume.
            Vale ver os motivos antes de cobrar meta.
          </div>
        </div>

        {robo && Number(robo.vendas || 0) > 0 && (
          <div style={s.faixa()}>
            🤖 O atendimento por IA fechou <b>{inteiro(robo.vendas)}</b> e teve{' '}
            <b>{inteiro(robo.barradas)}</b> barradas no período. Fica fora do ranking de propósito —
            só entra aqui para o total não ficar sem explicação.
          </div>
        )}

        <TabelaVendas
          lista={painel.lista || []} comVendedor
          titulo={'Vendas do período · ' + rotPer}
          filtro={filtroTab} setFiltro={setFiltroTab}
          busca={busca} setBusca={(v) => { setBusca(v); if (achados) setAchados(null) }}
          achados={achados} buscando={buscando}
          aoBuscarTudo={buscarNoHistorico} aoLimparBusca={limparBusca}
          aoAbrir={(v) => setFichaVenda(v)}
          aoCancelar={cancelarVenda} aoExcluir={excluirVenda}
          subtitulo={<div style={s.nota}>
            Cada linha é uma venda que alguém anotou. Clique para ver a ficha da cliente.
          </div>} />
      </>)}

      {/* ================= VENDEDOR ================= */}
      {!ehAdmin && meu && (<>
        <div style={s.kpis}>
          <div style={s.kpi}>
            <div style={s.kpiNum}>{inteiro(mt?.vendas)}</div>
            <div style={s.kpiLab}>vendas aprovadas no período</div>
            {mDelta !== null && (
              <div style={{ ...s.kpiPe, color: mDelta >= 0 ? '#0f7a52' : '#b3322f' }}>
                {mDelta >= 0 ? '▲' : '▼'} {Math.abs(mDelta)}% vs período anterior
              </div>
            )}
          </div>
          <div style={s.kpi}>
            <div style={{ ...s.kpiNum, fontSize: 24 }}>{dinheiro(mt?.comissao)}</div>
            <div style={s.kpiLab}>comissão do período</div>
            <div style={{ ...s.kpiPe, color: COR_FRACA }}>só do que o advogado aceitou</div>
          </div>
          <div style={s.kpi}>
            <div style={{ ...s.kpiNum, color: Number(mt?.barradas) > 0 ? COR_BARRADA : COR_TEXTO }}>
              {inteiro(mt?.barradas)}
            </div>
            <div style={s.kpiLab}>barradas no período</div>
          </div>
          <div style={s.kpi}>
            <div style={s.kpiNum}>{inteiro(meu.em_aberto)}</div>
            <div style={s.kpiLab}>esperando decisão agora</div>
            {Number(meu.sem_comprovante || 0) > 0 && (
              <div style={{ ...s.kpiPe, color: '#b3322f' }}>
                {meu.sem_comprovante} sem comprovante
              </div>
            )}
          </div>
        </div>

        {Number(meu.sem_comprovante || 0) > 0 && (
          <div style={s.faixa('alerta')}>
            Você tem <b>{meu.sem_comprovante}</b> venda(s) sem comprovante. Sem ele a venda não é
            considerada completa e não vai para a fila do advogado.
          </div>
        )}

        <div style={s.bloco}>
          <div style={s.blocoTit}>Sua produção por categoria</div>
          <div style={s.blocoSub}>Barra azul = aprovadas · vermelho = barradas</div>
          <Barras itens={meu.por_produto || []}
            rotuloDe={x => x.produto || '—'}
            valorDe={x => Number(x.vendas || 0)}
            secDe={x => Number(x.barradas || 0)} />
        </div>

        {(meu.barradas_recentes || []).length > 0 && (
          <div style={s.bloco}>
            <div style={s.blocoTit}>Barradas recentes</div>
            <div style={s.blocoSub}>O que o advogado recusou e por quê</div>
            <div style={{ overflowX: 'auto', scrollbarWidth: 'thin' }}>
              <table style={s.tabela}>
                <thead><tr>
                  <th style={s.th}>Cliente</th><th style={s.th}>Produto</th>
                  <th style={s.th}>Motivo</th><th style={s.th}>Quem</th><th style={s.th}>Reposição</th>
                </tr></thead>
                <tbody>
                  {meu.barradas_recentes.map((b, i) => (
                    <tr key={i}>
                      <td style={s.td}>{b.cliente}</td>
                      <td style={s.td}>{b.produto}</td>
                      <td style={{ ...s.td, maxWidth: 260 }}>{b.motivo}</td>
                      <td style={s.td}>{b.quem}</td>
                      <td style={s.td}>{b.reposicao_pedida
                        ? <span style={s.tagBom}>pedida</span> : <span style={s.tag}>não</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <TabelaVendas
          lista={meu.lista || []}
          titulo={'Minhas vendas · ' + rotPer}
          filtro={filtroTab} setFiltro={setFiltroTab}
          busca={busca} setBusca={(v) => { setBusca(v); if (achados) setAchados(null) }}
          achados={achados} buscando={buscando}
          aoBuscarTudo={buscarNoHistorico} aoLimparBusca={limparBusca}
          aoAbrir={(v) => setFichaVenda(v)}
          aoCancelar={cancelarVenda} aoExcluir={excluirVenda}
          subtitulo={<div style={s.nota}>
            Só gera comissão o que o advogado aceitou. Enquanto ele não decide,
            você pode cancelar ou apagar o que anotou.
          </div>} />
      </>)}

      {carregando && <div style={s.vazio}>Carregando...</div>}

      {fichaVenda && (
        <FichaCliente
          vendaId={fichaVenda.id}
          aoFechar={() => setFichaVenda(null)}
          aoMudarDocs={() => carregar()} />
      )}

      {modalVenda && (
        <ModalNovaVenda
          aoFechar={() => setModalVenda(false)}
          aoSalvar={() => carregar()} />
      )}
    </div>
  )
}
