// ===== TEMA KR PREVIDÊNCIA — Escuro Premium =====
// Fonte única de verdade do visual. Toda tela nova importa daqui em vez de
// hardcodar cor. As telas antigas migram aos poucos nas próximas entregas.

export const cores = {
  // marca
  azul: '#3b82f6', azulVivo: '#60a5fa', ciano: '#22d3ee', roxo: '#8b5cf6',
  ok: '#16a34a', okVivo: '#34d399', alerta: '#d97706', alertaVivo: '#fbbf24',
  perigo: '#dc2626', perigoVivo: '#f87171',
  // sidebar (sempre escura)
  sideBg: '#0b1220', sideTexto: '#8b9bb4', sideTextoAtivo: '#ffffff',
  // conteúdo (ESCURO premium)
  fundo: '#171c26', card: '#232a37', cardBorda: 'rgba(255,255,255,0.07)',
  texto: '#e6edf7', suave: '#8b9bb4', chipBg: 'rgba(255,255,255,0.05)',
}

export const sombras = {
  card: '0 1px 2px rgba(0,0,0,.35), 0 10px 30px rgba(0,0,0,.35)',
  cardHover: '0 2px 8px rgba(0,0,0,.4), 0 20px 50px rgba(0,0,0,.5)',
  glowAzul: '0 4px 14px rgba(59,130,246,.35)',
}

export const raio = { card: 16, cartao: 13, botao: 10, pill: 999 }

export const fonte = {
  familia: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
}

// mesh de fundo do conteúdo (luz azul/roxa sutil nos cantos)
export const fundoMesh = {
  background: cores.fundo,
  backgroundImage:
    'radial-gradient(900px 400px at 85% -10%, rgba(59,130,246,.11), transparent 60%),' +
    'radial-gradient(700px 380px at 10% 110%, rgba(139,92,246,.10), transparent 60%)',
}

// injeta a fonte Inter + CSS base do modo escuro uma vez (chamado pelo Layout)
export function carregarFonte() {
  if (!document.getElementById('kr-fonte')) {
    const l = document.createElement('link')
    l.id = 'kr-fonte'
    l.rel = 'stylesheet'
    l.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@600&display=swap'
    document.head.appendChild(l)
  }
  // base escura global: mata o "texto preto" dos controles nativos (input/select/textarea
  // sem estilo próprio) e escurece scrollbar/datepicker. Inline styles continuam vencendo.
  if (!document.getElementById('kr-base-escura')) {
    const s = document.createElement('style')
    s.id = 'kr-base-escura'
    s.textContent = `
      html { color-scheme: dark; }
      body { color: #e6edf7; background: #171c26; }
      input, select, textarea {
        background-color: #1e242f; color: #e6edf7;
        border: 1px solid rgba(148,163,184,.25); border-radius: 8px;
        color-scheme: dark; font-family: inherit;
      }
      select option { background: #232a37; color: #e6edf7; }
      input::placeholder, textarea::placeholder { color: #64748b; }
      input:focus, select:focus, textarea:focus {
        outline: 2px solid rgba(96,165,250,.45); outline-offset: 1px;
      }
      ::-webkit-scrollbar { width: 10px; height: 10px; }
      ::-webkit-scrollbar-thumb { 
      ::-webkit-scrollbar-track { background: transparent; }
      a { color: #60a5fa; }
    `
    document.head.appendChild(s)
  }
}

// helpers de estilo prontos pra telas novas
export const ui = {
  card: {
    background: cores.card, border: `1px solid ${cores.cardBorda}`,
    borderRadius: raio.card, boxShadow: sombras.card,
  },
  pill: (cor) => ({
    fontSize: 10, fontWeight: 700, borderRadius: raio.pill, padding: '3px 9px',
    background: `${cor}22`, color: cor, boxShadow: `inset 0 0 0 1px ${cor}38`,
    display: 'inline-block',
  }),
  btnPrimario: {
    padding: '8px 16px', borderRadius: raio.botao, fontSize: 12.5, fontWeight: 700,
    color: '#fff', border: 'none', cursor: 'pointer',
    background: `linear-gradient(135deg, ${cores.azul}, ${cores.roxo})`,
    boxShadow: sombras.glowAzul,
  },
}
