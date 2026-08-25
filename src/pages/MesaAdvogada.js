import { useEffect, useState, useCallback } from 'react'
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
  RATIFICAR:      { label: '🔁 Aprovada sem você — ratificar', cor: '#b45309', bg: 'rgba(251,191,36,.16)' },
  PRE_APROVADO:   { label: '🔥 Pré-aprovada pela máquina', cor: '#059669', bg: 'rgba(52,211,153,.14)' },
  CNIS_RECEBIDO:  { label: '📄 CNIS recebido', cor: '#2563eb', bg: 'rgba(96,165,250,.12)' },
  GERID:          { label: '🗂️ Fila GERID', cor: '#7c3aed', bg: 'rgba(167,139,250,.14)' },
  PEDIU_HUMANO:   { label: '🙋 Pediu humano', cor: '#b45309', bg: 'rgba(251,191,36,.12)' },
  SEM_CNIS_20MIN: { label: '⏰ Sem CNIS há 20min+', cor: '#5b6b84', bg: 'rgba(15,23,42,.04)' },
}
const ORDEM_FILAS = ['RATIFICAR', 'PRE_APROVADO', 'CNIS_RECEBIDO', 'GERID', 'PEDIU_HUMANO', 'SEM_CNIS_20MIN']

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
}

export default function MesaAdvogada() {
  const { profile } = useAuth()
  const [fila, setFila] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('')
  const [abrindo, setAbrindo] = useState(null)   // { id, tipo: 'ok' | 'nao' }
  const [outroTexto, setOutroTexto] = useState('')
  const [salvando, setSalvando] = useState(false)

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

  const decidir = async (lead, aprovado, motivo) => {
    if (!motivo || !motivo.trim()) { alert('Escolha o motivo.'); return }
    setSalvando(true)
    const r = await supabase.rpc('advogada_decidir', {
      p_lead_id: lead.id, p_aprovado: aprovado, p_motivo: motivo.trim(), p_advogada: (profile && profile.id) || null,
    })
    setSalvando(false)
    if (r.error || !r.data || r.data.ok !== true) {
      alert('Erro: ' + ((r.error && r.error.message) || (r.data && r.data.erro) || 'tente de novo'))
      return
    }
    setAbrindo(null); setOutroTexto('')
    setFila(f => f.filter(x => x.id !== lead.id))   // sai da fila na hora
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

      {loading ? (
        <div style={s.vazio}>Carregando…</div>
      ) : visiveis.length === 0 ? (
        <div style={s.vazio}>✅ Nenhuma análise pendente. Fila limpa.</div>
      ) : visiveis.map(c => {
        const f = FILAS[c.fila] || FILAS.SEM_CNIS_20MIN
        const ehPre = c.fila === 'PRE_APROVADO' || c.fila === 'RATIFICAR'
        const aberto = abrindo && abrindo.id === c.id
        const href = linkChat(c)
        return (
          <div key={c.id} style={s.card(ehPre)}>
            <div style={s.linha}>
              <div>
                <div style={s.nome}>{c.nome || 'Cliente +Mais Mãe'}</div>
                <div style={s.dado}>
                  CPF {c.cpf || '—'} · nascimento do filho {c.data_nascimento_filho || '—'} · {c.tel || 'sem telefone'}
                </div>
                <div style={s.dado}>parada há {fmtTempo(c.minutos_parado)} · {c.estado || '—'}</div>
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
                <button style={s.btnOk} onClick={() => { setAbrindo({ id: c.id, tipo: 'ok' }); setOutroTexto('') }}>
                  ✅ Pré-aprovado real
                </button>
                <button style={s.btnNao} onClick={() => { setAbrindo({ id: c.id, tipo: 'nao' }); setOutroTexto('') }}>
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
                      style={s.motivoBtn(abrindo.tipo === 'ok' ? '#059669' : '#dc2626')}
                      disabled={salvando}
                      onClick={() => decidir(c, abrindo.tipo === 'ok', m)}
                    >
                      {m}
                    </button>
                  )
                ))}
                <button
                  style={{ ...s.motivoBtn('#5b6b84'), textAlign: 'center', marginTop: 4 }}
                  onClick={() => { setAbrindo(null); setOutroTexto('') }}
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
