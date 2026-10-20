// Validacao da venda pela I.A (Maternidade Mae) - KR Previdencia - 20/10/2026
// O vendedor escolhe o perfil, anexa os documentos obrigatorios e responde as perguntas.
// A I.A (edge function `validar-venda-ia`) devolve: aprovado | pendente | reprovado.
// So com "aprovado" a venda pode ir para a fila de digitacao (aguardando_emissao).
//
// Uso (dentro da tela de subir a venda de Maternidade Mae):
//   import ValidacaoVendaIA from '../components/ValidacaoVendaIA';
//   <ValidacaoVendaIA
//      supabase={supabase}
//      cpf={form.cpf}
//      ficha={{ nome: form.nome, data_nascimento_bebe: form.dados_produto?.data_nascimento_bebe, motivo_aprovacao: form.dados_produto?.motivo_aprovacao }}
//      onResultado={(r) => setValidacao(r)}      // r.resultado === 'aprovado' libera o botao de enviar
//   />
// Sem dependencias novas: so React.

import React, { useMemo, useRef, useState } from 'react';

const FN_PATH = '/functions/v1/validar-venda-ia';
const BUCKET = 'documentos-clientes';
const MAX_MB = 9;

const C = { navy: '#132A3E', ink: '#1B2430', muted: '#6B7785', line: '#E3DDD1', paper: '#F7F5F0',
  ok: '#1E7B4F', okBg: '#E8F5EE', warn: '#9A6700', warnBg: '#FFF6DD', bad: '#B02A37', badBg: '#FCEBEC' };

export const PERFIS = {
  '12_clt':     { nome: '12 meses — CLT', docs: ['certidao', 'rg', 'ctps|cnis'] },
  '12_contrib': { nome: '12 meses — facultativa ou autônoma (guia)', docs: ['certidao', 'rg', 'cnis'] },
  '24_seguro':  { nome: '24 meses — seguro-desemprego', docs: ['certidao', 'rg', 'ctps|cnis', 'seguro_lista', 'seguro_detalhe'] },
  '24_fgts':    { nome: '24 meses — sem seguro (FGTS / judicial)', docs: ['certidao', 'rg', 'ctps|cnis', 'fgts'] },
  '24_120':     { nome: '24 meses — 120 contribuições', docs: ['certidao', 'rg', 'cnis'] },
};
const DOC = {
  certidao: { t: 'Certidão de nascimento da criança', d: 'Foto ou PDF da certidão inteira.' },
  rg: { t: 'Documento da mãe (RG ou CNH)', d: 'Frente (e verso, se tiver dados).' },
  ctps: { t: 'Carteira de Trabalho Digital', d: 'PDF do app Carteira de Trabalho Digital.' },
  cnis: { t: 'Extrato CNIS completo', d: 'Meu INSS → Extrato Previdenciário (PDF). Tem que mostrar a DATA DE PAGAMENTO das guias.' },
  seguro_lista: { t: 'Seguro-desemprego — lista', d: 'App Carteira de Trabalho → Benefícios → Seguro-Desemprego (tela com os requerimentos).' },
  seguro_detalhe: { t: 'Seguro-desemprego — detalhe', d: 'Abra o requerimento certo e tire print da situação e das parcelas pagas.' },
  fgts: { t: 'Extrato do FGTS', d: 'Extrato do app FGTS mostrando o saque por demissão sem justa causa.' },
};
const ROTULO_ALT = { 'ctps|cnis': { t: 'Carteira de Trabalho Digital OU Extrato CNIS', d: 'Um dos dois. Se tiver o CNIS completo, prefira.' } };

const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
const soDig = (s) => String(s || '').replace(/\D/g, '');

export default function ValidacaoVendaIA({ supabase, cpf, ficha = {}, clienteId, onResultado }) {
  const [perfil, setPerfil] = useState('');
  const [arq, setArq] = useState({});          // { chave: [{nome, url, enviando}] }
  const [altEscolha, setAltEscolha] = useState('ctps');
  const [relato, setRelato] = useState('');
  const [processou, setProcessou] = useState('');
  const [precisaProcessou, setPrecisaProcessou] = useState(null); // nome da empresa quando a I.A pede
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState('');
  const [res, setRes] = useState(null);
  const pasta = useRef(`validacao/${soDig(cpf) || 'sem-cpf'}/${uid()}`);

  const slots = useMemo(() => (PERFIS[perfil]?.docs || []), [perfil]);
  const chaveSlot = (s) => (s === 'ctps|cnis' ? altEscolha : s);

  async function subir(chave, files) {
    setErro('');
    for (const f of Array.from(files || [])) {
      if (f.size > MAX_MB * 1024 * 1024) { setErro(`"${f.name}" passa de ${MAX_MB} MB.`); continue; }
      if (!/pdf|png|jpe?g|webp/i.test(f.type || f.name)) { setErro(`"${f.name}": envie PDF, JPG ou PNG.`); continue; }
      const ext = (f.name.split('.').pop() || 'bin').toLowerCase();
      const caminho = `${pasta.current}/${chave}_${uid()}.${ext}`;
      const tmp = { nome: f.name, url: '', enviando: true, id: uid() };
      setArq((a) => ({ ...a, [chave]: [...(a[chave] || []), tmp] }));
      const { error } = await supabase.storage.from(BUCKET).upload(caminho, f, { upsert: false, contentType: f.type || undefined });
      if (error) {
        setErro(`Falha ao enviar "${f.name}": ${error.message}`);
        setArq((a) => ({ ...a, [chave]: (a[chave] || []).filter((x) => x.id !== tmp.id) }));
        continue;
      }
      const url = supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
      setArq((a) => ({ ...a, [chave]: (a[chave] || []).map((x) => (x.id === tmp.id ? { ...x, url, enviando: false } : x)) }));
    }
    setRes(null);
  }
  const remover = (chave, id) => { setArq((a) => ({ ...a, [chave]: (a[chave] || []).filter((x) => x.id !== id) })); setRes(null); };

  const faltando = slots.filter((s) => !(arq[chaveSlot(s)] || []).some((x) => x.url));
  const podeValidar = perfil && soDig(cpf).length === 11 && !faltando.length && relato.trim() && !rodando
    && !(precisaProcessou && !processou) && !Object.values(arq).flat().some((x) => x.enviando);

  async function validar() {
    if (!podeValidar) return;
    setRodando(true); setErro(''); setRes(null);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      if (!token) throw new Error('Sua sessão expirou. Entre de novo no CRM.');
      const base = supabase.supabaseUrl || supabase.rest?.url?.replace(/\/rest\/v1\/?$/, '') || process.env.REACT_APP_SUPABASE_URL;
      const documentos = {};
      for (const s of slots) { const k = chaveSlot(s); documentos[k] = (arq[k] || []).filter((x) => x.url).map((x) => x.url); }
      const r = await fetch(base + FN_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token, apikey: supabase.supabaseKey || process.env.REACT_APP_SUPABASE_ANON_KEY || '' },
        body: JSON.stringify({ perfil, cpf: soDig(cpf), cliente_id: clienteId || null, ficha, documentos,
          respostas: { relato: relato.trim(), processou_empresa: processou || null } }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.erro) throw new Error(j.erro || `erro ${r.status}`);
      if (j.precisa_pergunta === 'processou_empresa') setPrecisaProcessou(j.empresa_gravidez || 'a empresa');
      setRes(j);
      onResultado && onResultado(j);
    } catch (e) { setErro(String(e.message || e)); }
    finally { setRodando(false); }
  }

  const cor = res?.resultado === 'aprovado' ? [C.ok, C.okBg] : res?.resultado === 'reprovado' ? [C.bad, C.badBg] : [C.warn, C.warnBg];
  const titulo = { aprovado: '✅ APROVADO pela I.A', reprovado: '⛔ REPROVADO pela I.A', pendente: '⚠️ PENDENTE', erro: '⚠️ NÃO FOI POSSÍVEL VALIDAR' };

  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 16, background: '#fff', color: C.ink, fontSize: 14 }}>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Validação da venda (I.A)</div>
      <div style={{ color: C.muted, fontSize: 13, marginBottom: 12 }}>Obrigatório. A venda só vai para a digitação se a I.A aprovar.</div>

      <label style={{ fontWeight: 700 }}>1. Perfil da cliente</label>
      <select value={perfil} onChange={(e) => { setPerfil(e.target.value); setRes(null); }}
        style={{ display: 'block', width: '100%', margin: '6px 0 14px', padding: 8, borderRadius: 8, border: `1px solid ${C.line}` }}>
        <option value="">Escolha…</option>
        {Object.entries(PERFIS).map(([k, p]) => <option key={k} value={k}>{p.nome}</option>)}
      </select>

      {perfil && <>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>2. Documentos obrigatórios</div>
        {slots.map((s) => {
          const k = chaveSlot(s); const info = ROTULO_ALT[s] || DOC[s]; const lista = arq[k] || [];
          return (
            <div key={s} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); subir(k, e.dataTransfer.files); }}
              style={{ border: `1.5px dashed ${lista.some((x) => x.url) ? C.ok : C.line}`, borderRadius: 10, padding: 10, marginBottom: 8, background: C.paper }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div><b>{info.t}</b><div style={{ color: C.muted, fontSize: 12 }}>{info.d}</div></div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {s === 'ctps|cnis' && (
                    <select value={altEscolha} onChange={(e) => setAltEscolha(e.target.value)} style={{ padding: 4, borderRadius: 6 }}>
                      <option value="ctps">Carteira Digital</option><option value="cnis">CNIS</option>
                    </select>)}
                  <label style={{ cursor: 'pointer', background: C.navy, color: '#fff', padding: '6px 10px', borderRadius: 8, fontSize: 13 }}>
                    Anexar<input type="file" multiple accept=".pdf,image/*" style={{ display: 'none' }} onChange={(e) => { subir(k, e.target.files); e.target.value = ''; }} />
                  </label>
                </div>
              </div>
              {lista.map((x) => (
                <div key={x.id} style={{ fontSize: 12, marginTop: 6, display: 'flex', gap: 8 }}>
                  <span>{x.enviando ? '⏳' : '📎'} {x.nome}</span>
                  {!x.enviando && <a href={x.url} target="_blank" rel="noreferrer">ver</a>}
                  <button onClick={() => remover(k, x.id)} style={{ border: 'none', background: 'none', color: C.bad, cursor: 'pointer' }}>remover</button>
                </div>))}
              {!lista.length && <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Arraste o arquivo aqui ou clique em Anexar.</div>}
            </div>);
        })}

        <div style={{ fontWeight: 700, margin: '14px 0 6px' }}>3. Perguntas obrigatórias</div>
        <label style={{ fontSize: 13 }}>A cliente relatou algo que possa interferir? (escreva "não" se nada)</label>
        <textarea value={relato} onChange={(e) => { setRelato(e.target.value); setRes(null); }} rows={2}
          style={{ display: 'block', width: '100%', margin: '6px 0 10px', padding: 8, borderRadius: 8, border: `1px solid ${C.line}`, boxSizing: 'border-box' }} />

        {precisaProcessou && (
          <div style={{ background: C.warnBg, border: `1px solid ${C.warn}`, borderRadius: 10, padding: 10, marginBottom: 10 }}>
            <b>Você perguntou se ela processou a empresa?</b>
            <div style={{ fontSize: 13, margin: '4px 0 8px' }}>O emprego em <b>{precisaProcessou}</b> terminou quando ela estava grávida. Pergunte se ela entrou com ação trabalhista contra a empresa.</div>
            {['nao', 'sim'].map((v) => (
              <label key={v} style={{ marginRight: 16 }}>
                <input type="radio" name="processou" checked={processou === v} onChange={() => { setProcessou(v); setRes(null); }} /> {v === 'sim' ? 'Sim, processou' : 'Não processou'}
              </label>))}
          </div>)}

        {faltando.length > 0 && <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>Falta anexar: {faltando.map((s) => (ROTULO_ALT[s] || DOC[s]).t).join(', ')}</div>}
        <button onClick={validar} disabled={!podeValidar}
          style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', fontWeight: 800, fontSize: 15, cursor: podeValidar ? 'pointer' : 'not-allowed',
            background: podeValidar ? C.navy : '#C9CFD6', color: '#fff' }}>
          {rodando ? 'Analisando documentos… (até 1 minuto)' : 'Validar com a I.A'}
        </button>
      </>}

      {erro && <div style={{ color: C.bad, marginTop: 10, fontSize: 13 }}>{erro}</div>}

      {res && (
        <div style={{ marginTop: 14, border: `1.5px solid ${cor[0]}`, background: cor[1], borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 900, color: cor[0], fontSize: 16 }}>{titulo[res.resultado] || res.resultado}</div>
          {res.resumo && <div style={{ margin: '6px 0' }}>{res.resumo}</div>}
          {(res.motivos || []).length > 0 && <ul style={{ margin: '6px 0 6px 18px', padding: 0 }}>{res.motivos.map((m, i) => <li key={i}>{m}</li>)}</ul>}
          <div style={{ fontWeight: 700, marginTop: 6 }}>{res.orientacao}</div>
          {res.resultado === 'reprovado' && <div style={{ marginTop: 6, fontWeight: 800, color: C.bad }}>Procure o seu supervisor antes de falar qualquer coisa com a cliente.</div>}
          {Array.isArray(res.analise?.documentos) && res.analise.documentos.length > 0 && (
            <details style={{ marginTop: 8 }}><summary style={{ cursor: 'pointer' }}>Ver o que a I.A conferiu</summary>
              <ul style={{ margin: '6px 0 0 18px', padding: 0, fontSize: 13 }}>
                {res.analise.documentos.map((d, i) => <li key={'d' + i}>{d.confere ? '✅' : '❌'} <b>{d.campo}</b>: {d.identificado_como}{d.observacao ? ' — ' + d.observacao : ''}</li>)}
                {(res.analise.checagens || []).map((c, i) => <li key={'c' + i}>{c.ok ? '✅' : '❌'} {c.item}{c.detalhe ? ' — ' + c.detalhe : ''}</li>)}
              </ul>
            </details>)}
        </div>)}
    </div>
  );
}
