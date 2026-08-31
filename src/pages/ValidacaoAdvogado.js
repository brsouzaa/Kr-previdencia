import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import FichaCliente from '../components/FichaCliente'

// 31/08 — Validação final: o advogado aceitou este cliente?
//
// É a última etapa e a única que responde uma pergunta COMERCIAL. As três
// anteriores (Ágatha, pós-venda, analista no lote) perguntam "esse cliente está
// bom?". Esta registra "o advogado ficou com ele ou devolveu?".
//
// Quem decide é o vendedor responsável pelo advogado. Duas consequências, e as
// duas ficam explícitas na tela antes de confirmar:
//   • barrar derruba a venda e a comissão de OUTRA pessoa (quem fechou a venda)
//   • pedir reposição abre uma vaga que passa pelo teto de 20% e pela aprovação
//     do Bruno na tela de Reposições
const MOTIVOS = [
  'Advogado não aceitou o perfil do cliente',
  'Documentação incompleta ou ilegível',
  'CNIS não fecha com o produto',
  'Cliente duplicado / já era do escritório',
  'Cliente não atende / desistiu',
  'Outro (escrevo abaixo)',
]

const brData = (v) => {
  if (!v) return '—'
  const d = new Date(v)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}
const cpfBonito = (c) => {
  const n = String(c || '').replace(/\D/g, '')
  return n.length === 11 ? n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : (c || '—')
}

const s = {
  title: { fontSize: 20, fontWeight: 500, color: '#0f172a', marginBottom: 4 },
  sub: { fontSize: 13, color: '#5b6b84', marginBottom: 16 },
  linha: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 },
  chip: { padding: '7px 13px', fontSize: 12.5, fontWeight: 500, borderRadius: 8, border: '0.5px solid rgba(15,23,42,0.12)', background: '#ffffff', color: '#5b6b84', cursor: 'pointer', whiteSpace: 'nowrap' },
  chipOn: { background: '#0f172a', color: '#ffffff', borderColor: '#0f172a' },
  busca: { flex: '1 1 240px', minWidth: 180, padding: '9px 12px', fontSize: 13.5, borderRadius: 9, border: '0.5px solid rgba(15,23,42,0.18)', boxSizing: 'border-box' },

  resumo: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 },
  pill: { fontSize: 13, color: '#5b6b84', padding: '7px 13px', background: 'rgba(42,120,214,.10)', borderRadius: 8 },
  pillAlerta: { fontSize: 13, color: '#b3322f', fontWeight: 700, padding: '7px 13px', background: 'rgba(227,73,72,.13)', borderRadius: 8 },

  card: { background: '#ffffff', border: '0.5px solid rgba(15,23,42,0.10)', borderRadius: 12, padding: 15, marginBottom: 11 },
  cardTopo: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' },
  nome: { fontSize: 15.5, fontWeight: 600, color: '#0f172a', lineHeight: 1.3 },
  meta: { fontSize: 12, color: '#5b6b84', marginTop: 4, lineHeight: 1.65 },
  tag: { fontSize: 10.5, color: '#5b6b84', background: '#f1f5f9', borderRadius: 5, padding: '2px 7px', marginRight: 5 },
  tagAlerta: { fontSize: 10.5, fontWeight: 700, color: '#7c2d12', background: 'rgba(237,161,0,.18)', borderRadius: 5, padding: '2px 7px', marginRight: 5 },
  tagRuim: { fontSize: 10.5, fontWeight: 700, color: '#b3322f', background: 'rgba(227,73,72,.13)', borderRadius: 5, padding: '2px 7px', marginRight: 5 },
  tagBom: { fontSize: 10.5, fontWeight: 700, color: '#0f7a52', background: 'rgba(27,175,122,.15)', borderRadius: 5, padding: '2px 7px', marginRight: 5 },

  acoes: { display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' },
  btnOk: { padding: '10px 18px', fontSize: 13.5, fontWeight: 600, borderRadius: 9, border: 'none', background: '#1baf7a', color: '#ffffff', cursor: 'pointer' },
  btnNao: { padding: '10px 18px', fontSize: 13.5, fontWeight: 600, borderRadius: 9, border: '1px solid #e34948', background: '#ffffff', color: '#b3322f', cursor: 'pointer' },
  btnOff: { opacity: .5, cursor: 'not-allowed' },
  btnVer: { padding: '10px 16px', fontSize: 13.5, fontWeight: 600, borderRadius: 9,
            border: '0.5px solid rgba(15,23,42,0.18)', background: '#fff', color: '#0f172a', cursor: 'pointer' },

  modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 60, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '7vh 14px', overflowY: 'auto' },
  modalBox: { background: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 520 },
  label: { fontSize: 12, color: '#5b6b84', marginBottom: 5, display: 'block', fontWeight: 500 },
  input: { width: '100%', padding: '10px 12px', fontSize: 14, borderRadius: 9, border: '0.5px solid rgba(15,23,42,0.18)', boxSizing: 'border-box', marginBottom: 12 },
  // o que vai acontecer, dito antes de confirmar
  consequencia: { fontSize: 12.5, lineHeight: 1.6, color: '#7c2d12', background: 'rgba(237,161,0,.14)', border: '0.5px solid rgba(237,161,0,.5)', borderRadius: 10, padding: '11px 13px', marginBottom: 14 },
  escolha: { display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  opcao: (on) => ({ flex: '1 1 190px', textAlign: 'left', padding: '11px 13px', borderRadius: 10, cursor: 'pointer',
    border: on ? '2px solid #0f172a' : '0.5px solid rgba(15,23,42,0.15)', background: on ? '#f8fafc' : '#ffffff' }),
  opcaoTit: { fontSize: 13, fontWeight: 600, color: '#0f172a' },
  opcaoSub: { fontSize: 11, color: '#5b6b84', marginTop: 3, lineHeight: 1.45 },

  vazio: { fontSize: 13, color: '#94a3b8', padding: '32px 10px', textAlign: 'center', lineHeight: 1.7 },
  aviso: { fontSize: 11.5, color: '#94a3b8', marginTop: 14, lineHeight: 1.55 },
}

export default function ValidacaoAdvogado() {
  const [lista, setLista] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aba, setAba] = useState('pendentes')
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(null)   // { item, motivo, outro, repor }
  const [ficha, setFicha] = useState(null)   // item cuja ficha esta aberta
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('')
    const { data, error } = await supabase.rpc('venda_fila_advogado', {
      p_desde: null,
      p_incluir_resolvidos: aba === 'decididos',
    })
    if (error) setErro(error.message)
    setLista(data || [])
    setCarregando(false)
  }, [aba])

  useEffect(() => { carregar() }, [carregar])

  async function aprovar(it) {
    if (salvando) return
    setSalvando(true)
    const { data, error } = await supabase.rpc('venda_advogado_aprovar', { p_venda_id: it.venda_id })
    setSalvando(false)
    if (error) { alert('Não consegui aprovar: ' + error.message); return }
    setFicha(null)
    if (data && Number(data.comissao) > 0) {
      alert('Aprovada. Comissão de R$ ' + Number(data.comissao).toFixed(2) +
            ' liberada para ' + (it.vendedora_da_venda || 'a vendedora') + '.')
    }
    carregar()
  }

  async function confirmarBarrar() {
    if (!modal || salvando) return
    const motivo = modal.motivo === 'Outro (escrevo abaixo)'
      ? (modal.outro || '').trim()
      : modal.motivo
    if (!motivo) { alert('Escolha ou escreva o motivo — ele fica registrado e a vendedora vê.'); return }
    setSalvando(true)
    const { data, error } = await supabase.rpc('venda_advogado_barrar', {
      p_venda_id: modal.item.venda_id,
      p_motivo: motivo,
      p_pedir_reposicao: !!modal.repor,
    })
    setSalvando(false)
    if (error) { alert('Não consegui barrar: ' + error.message); return }
    setFicha(null)

    const partes = ['Venda barrada.']
    if (data?.comissao_ja_paga) partes.push('A comissão já tinha sido paga, então o valor foi mantido — só a produção caiu.')
    else if (data?.comissao_removida) partes.push('A comissão foi removida.')
    if (data?.com_reposicao) {
      partes.push('A reposição foi solicitada e está aguardando aprovação do Bruno em Reposições.')
      const sit = data?.teto?.situacao
      if (sit && sit !== 'ok') partes.push('Atenção: o teto de reposição está em ' + (data?.teto?.pct ?? '?') + '% (' + sit + ').')
      partes.push('O cliente continua ativo até essa aprovação.')
    } else if (data?.erro_reposicao) {
      partes.push('A reposição NÃO foi criada: ' + data.erro_reposicao)
    } else if (data?.cliente_cancelado_agora) {
      partes.push('O cliente foi cancelado e o contrato no ZapSign está sendo cancelado junto.')
    }
    alert(partes.join('\n\n'))
    setModal(null)
    carregar()
  }

  const filtrada = lista.filter(i => {
    if (!busca.trim()) return true
    const b = busca.toLowerCase().replace(/\D/g, '') || busca.toLowerCase()
    return String(i.cliente_nome || '').toLowerCase().includes(busca.toLowerCase())
      || String(i.cpf || '').replace(/\D/g, '').includes(b)
      || String(i.advogado_nome || '').toLowerCase().includes(busca.toLowerCase())
  })
  const pendentes = lista.filter(i => !i.adv_validado_em && !i.adv_barrado_em)
  const antigos = pendentes.filter(i => Number(i.dias_desde_entrega) >= 3).length

  return (
    <div>
      <div style={s.title}>⚖️ O advogado aceitou?</div>
      <div style={s.sub}>
        Última etapa: registre, cliente a cliente, se o advogado ficou com ele ou devolveu.
      </div>

      {erro && <div style={s.consequencia}>Não consegui carregar: {erro}</div>}

      <div style={s.linha}>
        {[['pendentes', 'A decidir'], ['decididos', 'Já decididos']].map(([v, l]) => (
          <button key={v} style={{ ...s.chip, ...(aba === v ? s.chipOn : {}) }}
            onClick={() => setAba(v)}>{l}</button>
        ))}
        <input style={s.busca} value={busca} placeholder="Buscar por nome, CPF ou advogado..."
          onChange={e => setBusca(e.target.value)} />
      </div>

      {aba === 'pendentes' && !carregando && (
        <div style={s.resumo}>
          <span style={s.pill}>Esperando você: <b>{pendentes.length}</b></span>
          {antigos > 0 && <span style={s.pillAlerta}>Parados há 3 dias ou mais: <b>{antigos}</b></span>}
        </div>
      )}

      {carregando ? <div style={s.vazio}>Carregando...</div>
        : filtrada.length === 0 ? (
          <div style={s.vazio}>
            {aba === 'pendentes'
              ? <>Nada esperando decisão.<br />
                  Os clientes aparecem aqui depois que o lote é entregue ao advogado.</>
              : <>Nenhuma venda decidida ainda.</>}
          </div>
        ) : filtrada.map(it => {
          const decidido = it.adv_validado_em || it.adv_barrado_em
          const parado = Number(it.dias_desde_entrega) >= 3
          return (
            <div key={it.venda_id} style={s.card}>
              <div style={s.cardTopo}>
                <div style={{ minWidth: 240, flex: 1 }}>
                  <div style={s.nome}>{it.cliente_nome}</div>
                  <div style={s.meta}>
                    CPF {cpfBonito(it.cpf)} · {it.telefone || 'sem telefone'}<br />
                    Advogado: <b>{it.advogado_nome || '—'}</b> · entregue em {brData(it.data_entrega)}
                    {it.lote_tipo === 'reposicao' && <span style={s.tagAlerta}> lote de reposição</span>}
                    <br />
                    Vendeu: <b>{it.vendedora_da_venda || '—'}</b>
                    {Number(it.comissao_valor) > 0 &&
                      <> · comissão de R$ {Number(it.comissao_valor).toFixed(2)} depende desta decisão</>}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <span style={s.tag}>{it.produto}</span>
                    {parado && !decidido && <span style={s.tagAlerta}>parado há {it.dias_desde_entrega}d</span>}
                    {!it.tem_comprovante && <span style={s.tag}>sem comprovante anexado</span>}
                    {it.adv_validado_em && <span style={s.tagBom}>aceito pelo advogado</span>}
                    {it.adv_barrado_em && <span style={s.tagRuim}>recusado</span>}
                    {it.reposicao_pedida && <span style={s.tagAlerta}>reposição pedida</span>}
                  </div>
                  {it.adv_barrado_em && it.adv_motivo && (
                    <div style={{ ...s.meta, marginTop: 8 }}>Motivo: {it.adv_motivo}</div>
                  )}
                </div>

                <div style={s.acoes}>
                  {/* decidir sem ver o documento é decidir no escuro — e barrar
                      tira a comissão de outra pessoa. A ficha vem primeiro. */}
                  <button style={s.btnVer} onClick={() => setFicha(it)}>Ver ficha</button>
                  {!decidido && (<>
                    <button style={{ ...s.btnOk, ...(salvando ? s.btnOff : {}) }}
                      disabled={salvando} onClick={() => aprovar(it)}>✓ Aceitou</button>
                    <button style={{ ...s.btnNao, ...(salvando ? s.btnOff : {}) }}
                      disabled={salvando}
                      onClick={() => setModal({ item: it, motivo: '', outro: '', repor: true })}>
                      ✕ Não aceitou
                    </button>
                  </>)}
                </div>
              </div>
            </div>
          )
        })}

      {!carregando && aba === 'pendentes' && (
        <div style={s.aviso}>
          Só aparecem clientes de lotes entregues a partir da data de corte —
          a fila começa limpa de propósito, para não nascer com o histórico inteiro.
        </div>
      )}

      {/* ---- modal de barrar: diz o que vai acontecer ANTES de confirmar ---- */}
      {modal && (
        <div style={s.modal} onClick={() => !salvando && setModal(null)}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
              O advogado não aceitou {modal.item.cliente_nome}
            </div>
            <div style={{ fontSize: 12.5, color: '#5b6b84', marginBottom: 14 }}>
              {modal.item.advogado_nome || 'Advogado'} · {modal.item.produto}
            </div>

            <div style={s.consequencia}>
              Ao confirmar: a venda cai da produção
              {Number(modal.item.comissao_valor) > 0
                ? <> e <b>{modal.item.vendedora_da_venda || 'a vendedora'} perde R$ {Number(modal.item.comissao_valor).toFixed(2)}</b> de comissão</>
                : <> (essa venda não tinha comissão ativa)</>}.
              O motivo e o seu nome ficam registrados e ela vê os dois.
            </div>

            <label style={s.label}>Motivo (obrigatório)</label>
            <select style={s.input} value={modal.motivo} autoFocus
              onChange={e => setModal(v => ({ ...v, motivo: e.target.value }))}>
              <option value="">— escolha —</option>
              {MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            {modal.motivo === 'Outro (escrevo abaixo)' && (
              <input style={s.input} value={modal.outro} placeholder="Escreva o motivo"
                onChange={e => setModal(v => ({ ...v, outro: e.target.value }))} />
            )}

            <label style={s.label}>O advogado recebe outro cliente no lugar?</label>
            <div style={s.escolha}>
              <div style={s.opcao(modal.repor)} onClick={() => setModal(v => ({ ...v, repor: true }))}>
                <div style={s.opcaoTit}>Sim, quero repor</div>
                <div style={s.opcaoSub}>
                  Abre uma vaga com prioridade na fila. Passa pelo teto de 20% e pela
                  aprovação do Bruno. O cliente segue ativo até ele aprovar.
                </div>
              </div>
              <div style={s.opcao(!modal.repor)} onClick={() => setModal(v => ({ ...v, repor: false }))}>
                <div style={s.opcaoTit}>Não, encerrar</div>
                <div style={s.opcaoSub}>
                  O cliente é cancelado agora e o contrato no ZapSign é cancelado junto,
                  para o link não continuar assinável.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ ...s.btnNao, flex: 1, ...(salvando ? s.btnOff : {}) }}
                disabled={salvando} onClick={confirmarBarrar}>
                {salvando ? 'Registrando...' : 'Confirmar que não aceitou'}
              </button>
              <button style={s.chip} disabled={salvando} onClick={() => setModal(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {ficha && (
        <FichaCliente
          vendaId={ficha.venda_id}
          aoFechar={() => setFicha(null)}
          aoAceitar={() => aprovar(ficha)}
          aoBarrar={() => { const it = ficha; setFicha(null); setModal({ item: it, motivo: '', outro: '', repor: true }) }}
          aoMudarDocs={() => carregar()} />
      )}
    </div>
  )
}
