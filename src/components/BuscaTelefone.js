import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// 16/11/2026 (Bruno) — BUSCA POR TELEFONE DENTRO DA BUSCA QUE JA EXISTE (Revisao IA Retroativo).
// Quando a vendedora digita um TELEFONE na caixa "Achar cliente", alem da busca na mesa dela,
// procura o numero na base inteira do retroativo. Se achar lead que nao e dela, pergunta
// "Esse lead esta com voce?" — so no SIM o lead vem pra mesa dela e a ficha abre.
// Antes do SIM nao mostra dado da cliente. O banco decide tudo
// (retroativo_busca_telefone / retroativo_pegar_por_telefone).
const AVISO = {
  ja_cliente: 'Esse telefone é de uma cliente que já fechou contrato.',
  parceiro: 'Esse telefone é de um lead indisponível.',
  negado: 'Esse telefone é de um lead negado / sem direito.',
  nao_liberado: 'Esse telefone é de um lead ainda sem pré-aprovação.',
  outra_operacao: 'Esse telefone é de um lead de outra operação.',
}

export default function BuscaTelefone({ termo, onPegou }) {
  const [res, setRes] = useState(null)
  const [escolhido, setEscolhido] = useState(null)
  const [erro, setErro] = useState(null)
  const [indo, setIndo] = useState(false)
  const [fechado, setFechado] = useState(false)

  // so entra quando o que foi digitado e telefone (so numero/pontuacao, 10 a 13 digitos)
  const t = String(termo || '').trim()
  const dig = t.replace(/\D/g, '')
  const ehTelefone = !/[a-zA-Z]/.test(t) && dig.length >= 10 && dig.length <= 13

  useEffect(() => {
    setRes(null); setEscolhido(null); setErro(null); setFechado(false)
    if (!ehTelefone) return
    let vivo = true
    supabase.rpc('retroativo_busca_telefone', { p_tel: dig }).then(({ data, error }) => {
      if (!vivo || error || !data?.ok) return
      setRes(data)
      const livres = (data.achados || []).filter(a => a.situacao === 'ok' && !a.minha)
      if (livres.length === 1) setEscolhido(livres[0])
    })
    return () => { vivo = false }
  }, [dig, ehTelefone])

  if (!ehTelefone || !res || fechado) return null
  const achados = res.achados || []
  if (achados.some(a => a.minha)) return null              // ja e dela: a busca da mesa ja mostra
  const livres = achados.filter(a => a.situacao === 'ok')
  const bloqueados = achados.filter(a => a.situacao !== 'ok')
  if (!livres.length && !bloqueados.length) return null

  async function sim() {
    if (!escolhido) return
    setIndo(true); setErro(null)
    const { data, error } = await supabase.rpc('retroativo_pegar_por_telefone', { p_lead_id: escolhido.lead_id, p_tel: dig })
    setIndo(false)
    if (error || !data?.ok) { setErro(error?.message || data?.erro || 'Não foi possível pegar o lead'); return }
    setFechado(true)
    onPegou?.(escolhido.lead_id)
  }

  const btn = (fundo, cor = '#fff') => ({ padding: '8px 16px', border: 'none', borderRadius: 8, background: fundo, color: cor, fontWeight: 700, fontSize: 14, cursor: indo ? 'wait' : 'pointer' })
  const caixa = { background: '#FFF8E6', border: '1px solid #F2D58A', borderRadius: 10, padding: 12, margin: '0 0 12px', fontSize: 14, color: '#1b2430' }

  if (!livres.length) return <div style={caixa}>{AVISO[bloqueados[0].situacao] || 'Lead indisponível.'}</div>

  return (
    <div style={caixa}>
      {!escolhido ? (
        <>
          <div style={{ marginBottom: 8 }}>📞 Esse telefone está em mais de um cadastro. Qual é a cliente?</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {livres.map(a => <button key={a.lead_id} style={btn('#eef1f5', '#1b2430')} onClick={() => setEscolhido(a)}>{a.rotulo}</button>)}
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <b>📞 Achamos esse telefone na base. Esse lead está com você?</b>
          <button style={btn('#15803d')} disabled={indo} onClick={sim}>{indo ? 'Abrindo...' : 'Sim'}</button>
          <button style={btn('#eef1f5', '#1b2430')} onClick={() => setFechado(true)}>Não</button>
        </div>
      )}
      {erro && <div style={{ marginTop: 8, color: '#dc2626' }}>{erro}</div>}
    </div>
  )
}
