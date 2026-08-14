// ===== TEMA KR PREVIDÊNCIA — Sidebar escura + CONTEÚDO CLARO (14/08) =====
// Fonte única de verdade do visual. Toda tela nova importa daqui em vez de
// hardcodar cor. As telas antigas migram aos poucos nas próximas entregas.

export const cores = {
  // marca
  azul: '#3b82f6', azulVivo: '#60a5fa', ciano: '#22d3ee', roxo: '#8b5cf6',
  ok: '#16a34a', okVivo: '#34d399', alerta: '#d97706', alertaVivo: '#fbbf24',
  perigo: '#dc2626', perigoVivo: '#f87171',
  // sidebar (sempre escura)
  sideBg: '#0b1220', sideTexto: '#8b9bb4', sideTextoAtivo: '#ffffff',
  // conteúdo (CLARO — sidebar continua escura)
  fundo: '#f2f5fa', card: '#ffffff', cardBorda: 'rgba(15,23,42,0.08)',
  texto: '#0f172a', suave: '#5b6b84', chipBg: 'rgba(15,23,42,0.04)',
}

export const sombras = {
  card: '0 1px 2px rgba(15,23,42,.06), 0 8px 24px rgba(15,23,42,.07)',
  cardHover: '0 2px 8px rgba(15,23,42,.10), 0 16px 40px rgba(15,23,42,.12)',
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
    'radial-gradient(900px 400px at 85% -10%, rgba(59,130,246,.07), transparent 60%),' +
    'radial-gradient(700px 380px at 10% 110%, rgba(139,92,246,.06), transparent 60%)',
}

// injeta a fonte Inter + CSS base do modo CLARO uma vez (chamado pelo Layout)
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
      html { color-scheme: light; }
      body { color: #0f172a; background: #f2f5fa; }
      input, select, textarea {
        background-color: #ffffff; color: #0f172a;
        border: 1px solid rgba(15,23,42,.15); border-radius: 8px;
        color-scheme: light; font-family: inherit;
      }
      select option { background: #ffffff; color: #0f172a; }
      input::placeholder, textarea::placeholder { color: #94a3b8; }
      input:focus, select:focus, textarea:focus {
        outline: 2px solid rgba(96,165,250,.45); outline-offset: 1px;
      }
      ::-webkit-scrollbar { width: 10px; height: 10px; }
      ::-webkit-scrollbar-thumb { 
      ::-webkit-scrollbar-track { background: transparent; }
      a { color: #2563eb; }
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
