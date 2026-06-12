import { supabase } from '../lib/supabase';

// Tabela de preços — faixa por quantidade
const PACOTES = [
  { qtd: 1,  preco: 2498, label: '1 cliente (teste avulso)' },
  { qtd: 3,  preco: 2297, label: '3 clientes' },
  { qtd: 5,  preco: 2297, label: '5 clientes' },
  { qtd: 10, preco: 2097, label: '10 clientes' },
  { qtd: 20, preco: 2097, label: '20 clientes' },
  { qtd: 30, preco: 1998, label: '30 clientes' },
  { qtd: 50, preco: 1998, label: '50 clientes' },
];

const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function ParceriaPensao() {
  const [form, setForm] = useState({
    nome_completo: '', oab: '', uf_oab: '', cidade: '', estado: '',
    whatsapp: '', email: '', qtd_leads: 3,
    aceite_pos_pago: false, aceite_honorarios: false,
  });
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erro, setErro] = useState('');

  const pacote = PACOTES.find(p => p.qtd === Number(form.qtd_leads)) || PACOTES[1];
  const total = pacote.qtd * pacote.preco;

  const set = (campo, valor) => setForm({ ...form, [campo]: valor });

  const enviar = async () => {
    setErro('');
    if (!form.nome_completo || !form.oab || !form.uf_oab || !form.whatsapp) {
      setErro('Preencha nome, OAB, UF da OAB e WhatsApp.');
      return;
    }
    if (!form.aceite_pos_pago || !form.aceite_honorarios) {
      setErro('É necessário aceitar as duas condições para enviar o pedido.');
      return;
    }
    setEnviando(true);
    const { error } = await supabase.from('pedidos_pensao_advogados').insert({
      nome_completo: form.nome_completo,
      oab: form.oab,
      uf_oab: form.uf_oab.toUpperCase(),
      cidade: form.cidade,
      estado: form.estado.toUpperCase(),
      whatsapp: form.whatsapp.replace(/\D/g, ''),
      email: form.email,
      qtd_leads: pacote.qtd,
      preco_unitario: pacote.preco,
      valor_total: total,
      aceite_pos_pago: true,
      aceite_honorarios: true,
    });
    setEnviando(false);
    if (error) { setErro('Erro ao enviar. Tente novamente.'); return; }
    setSucesso(true);
  };

  const S = {
    page: { background: '#0a0f1c', minHeight: '100vh', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '24px 16px' },
    wrap: { maxWidth: 640, margin: '0 auto' },
    card: { background: '#111a2e', borderRadius: 14, padding: 22, marginBottom: 18, border: '1px solid #1e2a45' },
    h1: { fontSize: 26, margin: '0 0 6px' },
    sub: { color: '#8da2c0', fontSize: 15, margin: 0 },
    h2: { fontSize: 18, margin: '0 0 12px', color: '#ffd166' },
    li: { display: 'flex', gap: 8, marginBottom: 8, fontSize: 14.5, lineHeight: 1.45 },
    input: { width: '100%', padding: 12, borderRadius: 8, border: '1px solid #2a3a5c', background: '#0d1526', color: '#fff', fontSize: 15, boxSizing: 'border-box', marginBottom: 12 },
    label: { fontSize: 13, color: '#8da2c0', marginBottom: 4, display: 'block' },
    btn: { width: '100%', padding: 15, borderRadius: 10, border: 0, background: '#ffd166', color: '#0a0f1c', fontSize: 16, fontWeight: 700, cursor: 'pointer' },
    chk: { display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12, fontSize: 13.5, lineHeight: 1.4, color: '#c7d4ea' },
    row: { display: 'flex', gap: 10 },
    tr: { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #1e2a45', fontSize: 14.5 },
  };

  if (sucesso) {
    return (
      <div style={S.page}><div style={S.wrap}>
        <div style={{ ...S.card, textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 54, marginBottom: 12 }}>✅</div>
          <h1 style={{ fontSize: 22, margin: '0 0 10px' }}>Pedido registrado!</h1>
          <p style={{ color: '#8da2c0', fontSize: 15, lineHeight: 1.6 }}>
            Recebemos seu pedido de <strong style={{ color: '#fff' }}>{pacote.qtd} cliente(s)</strong> —
            total de <strong style={{ color: '#ffd166' }}>{fmt(total)}</strong> (pós-pago).
            <br /><br />
            Nossa equipe comercial entra em contato pelo WhatsApp
            <strong style={{ color: '#fff' }}> a partir de segunda-feira</strong> para
            confirmar o pedido e alinhar o início das entregas.
          </p>
        </div>
      </div></div>
    );
  }

  return (
    <div style={S.page}><div style={S.wrap}>

      {/* HEADER */}
      <div style={{ marginBottom: 22 }}>
        <h1 style={S.h1}>Pensão por Morte — Clientes prontos para protocolar</h1>
        <p style={S.sub}>KR Previdência · Parceria exclusiva para advogados previdenciários</p>
      </div>

      {/* O QUE VOCÊ RECEBE */}
      <div style={S.card}>
        <h2 style={S.h2}>O que você recebe em cada cliente</h2>
        {[
          'Cliente qualificado com direito validado (qualidade de segurado conferida via CPF)',
          'Documentação completa coletada: certidão de óbito, documentos do dependente, RG/certidão dos filhos',
          'Procuração e contrato de honorários JÁ ASSINADOS pelo cliente',
          'Você protocola no Meu INSS no dia seguinte — sem captar, sem qualificar, sem coletar nada',
          'A maioria dos casos sai por via administrativa, sem ação judicial',
        ].map((t, i) => (
          <div key={i} style={S.li}><span style={{ color: '#ffd166' }}>✔</span><span>{t}</span></div>
        ))}
      </div>

      {/* HONORÁRIOS */}
      <div style={S.card}>
        <h2 style={S.h2}>Honorários já contratados com o cliente</h2>
        <p style={{ fontSize: 15, lineHeight: 1.6, margin: 0 }}>
          Cada cliente chega com contrato de honorários assinado em:
          <br /><strong style={{ fontSize: 17 }}>5 salários mínimos + 30% do retroativo</strong> (quando houver).
          <br /><span style={{ color: '#8da2c0', fontSize: 13.5 }}>
            O honorário é integralmente seu. A KR não participa do honorário — você paga apenas pelo cliente entregue.
          </span>
        </p>
      </div>

      {/* TABELA DE PREÇOS */}
      <div style={S.card}>
        <h2 style={S.h2}>Tabela de valores por cliente entregue</h2>
        <div style={S.tr}><span>1 cliente (teste avulso)</span><strong>{fmt(2498)}</strong></div>
        <div style={S.tr}><span>A partir de 3 clientes</span><strong>{fmt(2297)} /un</strong></div>
        <div style={S.tr}><span>A partir de 10 clientes</span><strong>{fmt(2097)} /un</strong></div>
        <div style={{ ...S.tr, borderBottom: 'none' }}><span>A partir de 30 clientes</span><strong style={{ color: '#ffd166' }}>{fmt(1998)} /un</strong></div>
        <div style={{ background: '#0d1526', borderRadius: 8, padding: 12, marginTop: 12, fontSize: 13.5, color: '#c7d4ea', lineHeight: 1.5 }}>
          💳 <strong>Modelo pós-pago:</strong> você NÃO paga nada agora. O pagamento é feito
          no ato do recebimento de cada lote de clientes entregues.
        </div>
      </div>

      {/* FORMULÁRIO */}
      <div style={S.card}>
        <h2 style={S.h2}>Cadastro e pedido</h2>

        <label style={S.label}>Nome completo *</label>
        <input style={S.input} value={form.nome_completo} onChange={e => set('nome_completo', e.target.value)} placeholder="Dr(a). Nome Sobrenome" />

        <div style={S.row}>
          <div style={{ flex: 2 }}>
            <label style={S.label}>Nº OAB *</label>
            <input style={S.input} value={form.oab} onChange={e => set('oab', e.target.value)} placeholder="123456" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.label}>UF OAB *</label>
            <input style={S.input} value={form.uf_oab} onChange={e => set('uf_oab', e.target.value)} placeholder="SP" maxLength={2} />
          </div>
        </div>

        <div style={S.row}>
          <div style={{ flex: 2 }}>
            <label style={S.label}>Cidade</label>
            <input style={S.input} value={form.cidade} onChange={e => set('cidade', e.target.value)} placeholder="Sua cidade" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.label}>UF</label>
            <input style={S.input} value={form.estado} onChange={e => set('estado', e.target.value)} placeholder="SP" maxLength={2} />
          </div>
        </div>

        <label style={S.label}>WhatsApp (com DDD) *</label>
        <input style={S.input} value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)} placeholder="11999999999" />

        <label style={S.label}>E-mail</label>
        <input style={S.input} value={form.email} onChange={e => set('email', e.target.value)} placeholder="voce@escritorio.com.br" />

        <label style={S.label}>Quantidade de clientes *</label>
        <select style={S.input} value={form.qtd_leads} onChange={e => set('qtd_leads', e.target.value)}>
          {PACOTES.map(p => (
            <option key={p.qtd} value={p.qtd}>
              {p.label} — {fmt(p.preco)}/un = {fmt(p.qtd * p.preco)}
            </option>
          ))}
        </select>

        <div style={{ background: '#0d1526', borderRadius: 8, padding: 14, margin: '4px 0 16px', fontSize: 15 }}>
          Total do pedido: <strong style={{ color: '#ffd166', fontSize: 18 }}>{fmt(total)}</strong>
          <span style={{ color: '#8da2c0', fontSize: 13 }}> · pós-pago na entrega</span>
        </div>

        <label style={S.chk}>
          <input type="checkbox" checked={form.aceite_pos_pago} onChange={e => set('aceite_pos_pago', e.target.checked)} style={{ marginTop: 3 }} />
          <span><strong>Estou ciente do modelo pós-pago:</strong> o pagamento de cada lote é realizado no ato do recebimento dos clientes entregues pela KR.</span>
        </label>

        <label style={S.chk}>
          <input type="checkbox" checked={form.aceite_honorarios} onChange={e => set('aceite_honorarios', e.target.checked)} style={{ marginTop: 3 }} />
          <span><strong>Estou ciente dos honorários contratados:</strong> os clientes chegam com contrato assinado de 5 salários mínimos + 30% do retroativo (quando houver), honorário integralmente do advogado.</span>
        </label>

        {erro && <div style={{ background: '#3a1520', border: '1px solid #7a2030', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 14 }}>⚠️ {erro}</div>}

        <button style={{ ...S.btn, opacity: enviando ? 0.6 : 1 }} disabled={enviando} onClick={enviar}>
          {enviando ? 'Enviando...' : 'Enviar pedido →'}
        </button>

        <p style={{ textAlign: 'center', color: '#8da2c0', fontSize: 12.5, marginTop: 14, lineHeight: 1.5 }}>
          Pedidos serão confirmados pela equipe comercial KR por WhatsApp a partir de segunda-feira.
          O envio deste formulário não gera cobrança imediata.
        </p>
      </div>

    </div></div>
  );
}
