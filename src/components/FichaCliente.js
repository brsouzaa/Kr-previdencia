import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// 31/08 — Ficha do cliente na validação do advogado.
//
// Antes a decisão era tomada em cima de três linhas: nome, CPF e telefone.
// Aceitar ou barrar um cliente sem ver o documento é decidir no escuro — e
// barrar derruba a comissão de outra pessoa. Aqui a pessoa vê tudo o que existe
// sobre a cliente, abre cada documento, anexa o que faltou, e só então decide.
//
// Os documentos moram em clientes.documentos como {chave: url} no bucket público
// documentos-clientes. Imagem aparece como miniatura; PDF vira link.

const DOCS = [
  ['rg_frente', 'RG / CNH — frente', true],
  ['rg_verso', 'RG / CNH — verso', true],
  ['comprovante_1', 'Comprovante 1', true],
  ['comprovante_2', 'Comprovante 2', false],
  ['comprovante_endereco', 'Comprovante de endereço', false],
  ['comprovante_gravidez', 'Comprovante de gravidez', false],
  // obrigatorios no Maternidade Mae desde 31/08, e SO em PDF: sao arquivos
  // baixados de app (gov.br / FGTS) e print nao serve para o advogado
  ['ctps_digital', 'CTPS digital (PDF)', false, true],
  ['extrato_fgts', 'Extrato FGTS (PDF)', false, true],
  ['outros', 'Outro documento', false],
]

const COR = { texto: '#0f172a', media: '#5b6b84', fraca: '#94a3b8',
              verde: '#1baf7a', vermelho: '#b3322f', trilho: '#eef2f7' }

// em que etapa a venda caiu — cada uma e um problema diferente
const ETAPA = {
  advogado:   { onde: 'na decisão do advogado' },
  pos_venda:  { onde: 'na conferência do pós-venda' },
  revisao_ia: { onde: 'na revisão IA, antes de virar contrato' },
  cancelado:  { onde: 'por cancelamento da cliente' },
  outro:      { onde: 'em uma etapa não registrada' },
}

const ehImagem = (u) => /\.(jpe?g|png|webp|gif|bmp|heic)(\?|$)/i.test(String(u || ''))
const cpfBonito = (c) => {
  const n = String(c || '').replace(/\D/g, '')
  return n.length === 11 ? n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : (c || '—')
}
const dinheiro = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dataBR = (v) => {
  if (!v) return '—'
  const d = new Date(v)
  return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR')
}

const s = {
  fundo: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 65,
           display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
           padding: '4vh 14px', overflowY: 'auto' },
  caixa: { background: '#fff', borderRadius: 14, width: '100%', maxWidth: 860, overflow: 'hidden' },

  topo: { padding: '18px 22px 14px', borderBottom: '0.5px solid rgba(15,23,42,0.10)',
          display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' },
  nome: { fontSize: 18, fontWeight: 600, color: COR.texto, lineHeight: 1.25 },
  sub: { fontSize: 12.5, color: COR.media, marginTop: 5, lineHeight: 1.6 },
  fechar: { border: 'none', background: '#f1f5f9', color: COR.media, width: 32, height: 32,
            borderRadius: 8, cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0 },

  corpo: { padding: '16px 22px 4px', maxHeight: '58vh', overflowY: 'auto', scrollbarWidth: 'thin' },
  secao: { fontSize: 11, fontWeight: 700, color: COR.fraca, textTransform: 'uppercase',
           letterSpacing: '.5px', margin: '16px 0 9px' },
  grade: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '9px 18px' },
  campo: { minWidth: 0 },
  rot: { fontSize: 10.5, color: COR.fraca, marginBottom: 2 },
  val: { fontSize: 13.5, color: COR.texto, wordBreak: 'break-word' },

  docs: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 10 },
  doc: { border: '0.5px solid rgba(15,23,42,0.12)', borderRadius: 10, overflow: 'hidden', background: '#fff' },
  docImg: { width: '100%', height: 104, objectFit: 'cover', display: 'block', background: COR.trilho, cursor: 'zoom-in' },
  docVazio: { width: '100%', height: 104, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#fafbfc', color: COR.fraca, fontSize: 11.5, textAlign: 'center', padding: 8,
              boxSizing: 'border-box', border: '1px dashed rgba(15,23,42,0.18)', cursor: 'pointer' },
  docPdf: { width: '100%', height: 104, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#f8fafc', color: COR.media, fontSize: 12.5, textDecoration: 'none', gap: 6 },
  docPe: { padding: '7px 9px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  docNome: { fontSize: 11.5, color: COR.texto, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  docAbrir: { fontSize: 11, color: '#2a78d6', textDecoration: 'none', flexShrink: 0 },
  faltaTag: { fontSize: 10, fontWeight: 700, color: '#7c2d12', background: 'rgba(237,161,0,.18)',
              borderRadius: 5, padding: '1px 6px' },

  rodape: { padding: '14px 22px 18px', borderTop: '0.5px solid rgba(15,23,42,0.10)', background: '#fcfdfe' },
  acoes: { display: 'flex', gap: 9, flexWrap: 'wrap' },
  btnOk: { padding: '12px 22px', fontSize: 14, fontWeight: 600, borderRadius: 10, border: 'none',
           background: COR.verde, color: '#fff', cursor: 'pointer' },
  btnNao: { padding: '12px 22px', fontSize: 14, fontWeight: 600, borderRadius: 10,
            border: '1px solid #e34948', background: '#fff', color: COR.vermelho, cursor: 'pointer' },
  btnOff: { opacity: .5, cursor: 'not-allowed' },
  decidido: { fontSize: 13, lineHeight: 1.6, padding: '11px 13px', borderRadius: 10 },
  aviso: { fontSize: 12, color: '#7c2d12', background: 'rgba(237,161,0,.14)',
           border: '0.5px solid rgba(237,161,0,.5)', borderRadius: 9, padding: '10px 12px', marginBottom: 12, lineHeight: 1.55 },
  erro: { fontSize: 12.5, color: COR.vermelho, background: 'rgba(227,73,72,.10)',
          border: '0.5px solid rgba(227,73,72,.35)', borderRadius: 9, padding: '10px 12px', marginBottom: 12 },
  carregando: { padding: '48px 10px', textAlign: 'center', color: COR.fraca, fontSize: 13.5 },
  barrada: { fontSize: 13, lineHeight: 1.6, color: COR.vermelho, background: 'rgba(227,73,72,.08)',
             border: '0.5px solid rgba(227,73,72,.30)', borderRadius: 10, padding: '11px 13px',
             marginBottom: 4, marginTop: 2 },

  lupa: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 80, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: 20, cursor: 'zoom-out' },
  lupaImg: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 },
}

function Campo({ rot, children }) {
  return (
    <div style={s.campo}>
      <div style={s.rot}>{rot}</div>
      <div style={s.val}>{children || '—'}</div>
    </div>
  )
}

export default function FichaCliente({ vendaId, aoFechar, aoAceitar, aoBarrar, aoMudarDocs }) {
  const [d, setD] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [subindo, setSubindo] = useState('')
  const [lupa, setLupa] = useState(null)

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('')
    const { data, error } = await supabase.rpc('venda_detalhe_cliente', { p_venda_id: vendaId })
    if (error) setErro(error.message === 'SEM_PERMISSAO'
      ? 'Este cliente é de outro vendedor — você não tem acesso à ficha dele.'
      : error.message)
    setD(data || null)
    setCarregando(false)
  }, [vendaId])

  useEffect(() => { carregar() }, [carregar])

  // quais chaves só aceitam PDF (4a posicao do DOCS)
  const SO_PDF = new Set(DOCS.filter(d => d[3]).map(d => d[0]))

  async function anexar(chave, arq) {
    if (!arq) return
    if (SO_PDF.has(chave)) {
      const ehPdf = arq.type === 'application/pdf' || /\.pdf$/i.test(arq.name || '')
      if (!ehPdf) {
        setErro('Este documento tem que ser o PDF baixado do aplicativo — print ou foto não vale.')
        return
      }
    }
    setSubindo(chave); setErro('')
    try {
      const ext = (arq.name.split('.').pop() || 'jpg').toLowerCase()
      const caminho = (d?.cliente?.id || 'venda' + vendaId) + '/' + chave + '_' + Date.now() + '.' + ext
      const up = await supabase.storage.from('documentos-clientes').upload(caminho, arq)
      if (up.error) throw new Error('Falha ao enviar: ' + up.error.message)
      const { data: pub } = supabase.storage.from('documentos-clientes').getPublicUrl(caminho)
      const r = await supabase.rpc('venda_anexar_documento_cliente', {
        p_venda_id: vendaId, p_chave: chave, p_url: pub?.publicUrl || caminho,
      })
      if (r.error) throw new Error(r.error.message)
      await carregar()
      aoMudarDocs && aoMudarDocs()
    } catch (e) {
      setErro(String(e.message || e))
    } finally { setSubindo('') }
  }

  const cli = d?.cliente || {}
  const ven = d?.venda || {}
  const lote = d?.lote || {}
  const docs = d?.documentos || {}
  const comps = d?.comprovantes || []
  const decidido = ven.adv_validado_em || ven.adv_barrado_em
  const faltando = DOCS.filter(([k, , obrig]) => obrig && !docs[k])

  return (
    <>
      <div style={s.fundo} onClick={aoFechar}>
        <div style={s.caixa} onClick={e => e.stopPropagation()}>
          {carregando ? <div style={s.carregando}>Carregando a ficha...</div> : (<>
            <div style={s.topo}>
              <div style={{ minWidth: 0 }}>
                <div style={s.nome}>{cli.nome || 'Cliente'}</div>
                <div style={s.sub}>
                  {ven.produto || cli.produto || '—'} · vendeu <b>{ven.vendedora}</b>
                  {/* venda de lead BF ou que ainda nao foi para advogado nenhum
                      nao tem lote: a ficha diz isso em vez de mostrar "—" */}
                  {d?.lote ? (<>
                    {' · '}entregue ao advogado {dataBR(lote.data_entrega)}
                    {Number(lote.dias_desde_entrega) > 0 && ` (há ${lote.dias_desde_entrega}d)`}
                    {lote.tipo === 'reposicao' && ' · lote de reposição'}
                  </>) : <> · ainda não foi para nenhum advogado</>}
                </div>
              </div>
              <button style={s.fechar} onClick={aoFechar} title="Fechar">✕</button>
            </div>

            <div style={s.corpo}>
              {erro && <div style={s.erro}>{erro}</div>}

              {/* O motivo saiu da tabela (texto livre quebrava o alinhamento) e
                  ganhou destaque aqui, junto da etapa em que a venda caiu. */}
              {ven.origem_barrada && (
                <div style={s.barrada}>
                  <b>Caiu {ETAPA[ven.origem_barrada]?.onde || 'em uma etapa não registrada'}</b>
                  {ven.barrada_em && <> em {dataBR(ven.barrada_em)}</>}
                  {ven.decidido_por && <> · por {ven.decidido_por}</>}
                  {ven.motivo_barrada
                    ? <div style={{ marginTop: 5 }}>Motivo: <b>{ven.motivo_barrada}</b></div>
                    : <div style={{ marginTop: 5, opacity: .8 }}>Sem motivo registrado.</div>}
                  {ven.reposicao_pedida && <div style={{ marginTop: 5 }}>Reposição foi pedida.</div>}
                </div>
              )}

              {cli.fora_do_crm && (
                <div style={s.aviso}>
                  Esta venda é de um lead do funil do Bolsa Família e ainda não virou cliente
                  no CRM — por isso não há documentos nem endereço aqui.
                </div>
              )}

              <div style={s.secao}>Dados da cliente</div>
              <div style={s.grade}>
                <Campo rot="CPF">{cpfBonito(cli.cpf)}</Campo>
                <Campo rot="RG">{cli.rg}</Campo>
                {cli.nis && <Campo rot="NIS">{cli.nis}</Campo>}
                <Campo rot="Telefone">{cli.telefone}</Campo>
                <Campo rot="E-mail">{cli.email}</Campo>
                <Campo rot="Situação no CRM">{cli.status}</Campo>
              </div>
              <div style={{ marginTop: 9 }}>
                <Campo rot="Endereço">{cli.endereco}</Campo>
              </div>
              {(cli.data_prevista_parto || cli.meses_gravidez) && (
                <div style={{ ...s.grade, marginTop: 9 }}>
                  {cli.data_prevista_parto && <Campo rot="Data prevista do parto">{dataBR(cli.data_prevista_parto)}</Campo>}
                  {cli.meses_gravidez && <Campo rot="Meses de gravidez">{cli.meses_gravidez}</Campo>}
                </div>
              )}
              {cli.observacao && (
                <div style={{ marginTop: 9 }}><Campo rot="Observação">{cli.observacao}</Campo></div>
              )}

              <div style={s.secao}>A venda</div>
              <div style={s.grade}>
                <Campo rot="Data da venda">{dataBR(ven.data_venda)}</Campo>
                <Campo rot="Advogado">{lote.advogado}</Campo>
                <Campo rot="Comissão em jogo">
                  {ven.conta_comissao === false
                    ? 'não gera (histórico)'
                    : dinheiro(ven.comissao)}
                </Campo>
                {ven.valor_emprestado != null && (
                  <Campo rot="Valor emprestado">{dinheiro(ven.valor_emprestado)}</Campo>
                )}
              </div>

              {!cli.fora_do_crm && (<>
              <div style={s.secao}>
                Documentos {faltando.length > 0 && <span style={s.faltaTag}>faltam {faltando.length}</span>}
              </div>
              {faltando.length > 0 && (
                <div style={s.aviso}>
                  Sem <b>{faltando.map(f => f[1]).join(', ')}</b> não dá para conferir se a cliente
                  é quem diz ser. Você pode anexar aqui mesmo antes de decidir.
                </div>
              )}
              <div style={s.docs}>
                {DOCS.map(([chave, rotulo]) => {
                  const url = docs[chave]
                  const carregandoEste = subindo === chave
                  return (
                    <div key={chave} style={s.doc}>
                      {url ? (
                        ehImagem(url)
                          ? <img src={url} alt={rotulo} style={s.docImg} onClick={() => setLupa({ url, rotulo })} />
                          : <a href={url} target="_blank" rel="noreferrer" style={s.docPdf}>📄 abrir arquivo</a>
                      ) : (
                        <label style={s.docVazio}>
                          {carregandoEste ? 'enviando...' : '+ anexar'}
                          <input type="file"
                            accept={SO_PDF.has(chave) ? 'application/pdf,.pdf' : 'image/*,.pdf'}
                            style={{ display: 'none' }}
                            disabled={!!subindo}
                            onChange={e => anexar(chave, e.target.files?.[0] || null)} />
                        </label>
                      )}
                      <div style={s.docPe}>
                        <span style={s.docNome} title={rotulo}>{rotulo}</span>
                        {url && <a href={url} target="_blank" rel="noreferrer" style={s.docAbrir}>abrir</a>}
                      </div>
                    </div>
                  )
                })}
              </div>

              </>)}

              {comps.length > 0 && (<>
                <div style={s.secao}>Comprovantes da venda</div>
                <div style={s.docs}>
                  {comps.map((c, i) => (
                    <div key={i} style={s.doc}>
                      {ehImagem(c.url)
                        ? <img src={c.url} alt={c.tipo} style={s.docImg} onClick={() => setLupa({ url: c.url, rotulo: c.tipo })} />
                        : <a href={c.url} target="_blank" rel="noreferrer" style={s.docPdf}>📄 abrir arquivo</a>}
                      <div style={s.docPe}>
                        <span style={s.docNome} title={c.nome || c.tipo}>{c.tipo}</span>
                        <a href={c.url} target="_blank" rel="noreferrer" style={s.docAbrir}>abrir</a>
                      </div>
                    </div>
                  ))}
                </div>
              </>)}
            </div>

            <div style={s.rodape}>
              {decidido ? (
                <div style={{ ...s.decidido,
                  background: ven.adv_validado_em ? 'rgba(27,175,122,.12)' : 'rgba(227,73,72,.10)',
                  color: ven.adv_validado_em ? '#0f7a52' : COR.vermelho }}>
                  {ven.adv_validado_em
                    ? <>✓ O advogado <b>aceitou</b> esta cliente{ven.decidido_por ? <> — registrado por {ven.decidido_por}</> : null}.</>
                    : <>✕ <b>Não aceitou</b>{ven.decidido_por ? <> — registrado por {ven.decidido_por}</> : null}.
                       {ven.adv_motivo && <> Motivo: {ven.adv_motivo}.</>}
                       {ven.reposicao_pedida && <> Reposição pedida.</>}</>}
                </div>
              ) : !(aoAceitar || aoBarrar) ? (
                <div style={{ fontSize: 12.5, color: COR.media, lineHeight: 1.6 }}>
                  Esta venda ainda espera a decisão do advogado. Ela é registrada na tela{' '}
                  <b>O advogado aceitou?</b>.
                </div>
              ) : (<>
                <div style={{ fontSize: 12.5, color: COR.media, marginBottom: 11, lineHeight: 1.6 }}>
                  {ven.conta_comissao === false
                    ? <>Esta venda veio da importação e não gera comissão — barrar não tira dinheiro de ninguém.</>
                    : <>Barrar remove <b>{dinheiro(ven.comissao)}</b> de <b>{ven.vendedora}</b>.</>}
                </div>
                <div style={s.acoes}>
                  <button style={s.btnOk} onClick={() => aoAceitar && aoAceitar()}>✓ O advogado aceitou</button>
                  <button style={s.btnNao} onClick={() => aoBarrar && aoBarrar()}>✕ Não aceitou</button>
                </div>
              </>)}
            </div>
          </>)}
        </div>
      </div>

      {lupa && (
        <div style={s.lupa} onClick={() => setLupa(null)}>
          <img src={lupa.url} alt={lupa.rotulo} style={s.lupaImg} />
        </div>
      )}
    </>
  )
}
