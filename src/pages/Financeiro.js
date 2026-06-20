// ============================================================================
// Financeiro.js — Módulo Financeiro KR (Fase 1: Contas a Pagar)
// ----------------------------------------------------------------------------
// Vai em: src/pages/Financeiro.js
// Usa o client e o auth do próprio CRM (../lib/supabase e ../lib/AuthContext).
// Mostra abas conforme o perfil de quem logou:
//   - todos        -> Lançar despesa, Minhas solicitações
//   - admin        -> + Aprovar
//   - financeiro   -> + Pagar
// As ações chamam as funções do banco (finance_submeter / aprovar / recusar /
// solicitar_ajuste / marcar_pago / cancelar). O RLS já garante quem vê o quê.
// ============================================================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

const FORMAS = ['pix', 'boleto', 'transferencia', 'dinheiro', 'cartao'];

const STATUS_LABEL = {
  rascunho: 'Rascunho',
  incompleto: 'Incompleto',
  aguardando_aprovacao: 'Aguardando aprovação',
  aprovado: 'Aprovada',
  recusado: 'Recusada',
  ajuste_solicitado: 'Ajuste pedido',
  aguardando_pagamento: 'A pagar',
  pago: 'Paga',
  cancelado: 'Cancelada',
  vencido: 'Vencida',
};
const STATUS_COR = {
  rascunho: '#6b7280', incompleto: '#b45309', aguardando_aprovacao: '#b45309',
  aprovado: '#0f766e', recusado: '#b91c1c', ajuste_solicitado: '#b45309',
  aguardando_pagamento: '#0f766e', pago: '#15803d', cancelado: '#6b7280', vencido: '#b91c1c',
};

// Recebimentos de advogado (fila de validação)
const TIPO_PG_LABEL = {
  pagamento_total: 'Total (bateu)',
  pagamento_parcial: 'Parcial',
  pagamento_maior: 'Pagou a mais',
  pagamento_menor: 'Pagou a menos',
  pagamento_antecipado: 'Antecipado',
  pagamento_com_divergencia: 'Divergência',
  pagamento_sem_lote_claro: 'Sem lote claro',
};
const TIPO_PG_COR = {
  pagamento_total: '#15803d', pagamento_parcial: '#b45309', pagamento_maior: '#b45309',
  pagamento_menor: '#b45309', pagamento_antecipado: '#0f766e',
  pagamento_com_divergencia: '#b91c1c', pagamento_sem_lote_claro: '#b91c1c',
};
const FILA_STATUS_LABEL = {
  aguardando_validacao: 'Aguardando validação',
  aguardando_explicacao: 'Aguardando explicação',
  aguardando_complemento: 'Aguardando complemento',
  validado: 'Validado', rejeitado: 'Rejeitado', cancelado: 'Cancelado',
};

const brl = (v) =>
  (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const dataBR = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—');

export default function Financeiro() {
  const { profile: perfil } = useAuth();
  const [aba, setAba] = useState('lancar');

  const role = perfil?.role;
  const ehAdmin = role === 'admin';
  const ehFinanceiro = role === 'financeiro' || ehAdmin;

  if (!perfil) {
    return <div className="fin-wrap"><Estilos /><div className="fin-vazio">Carregando…</div></div>;
  }

  const abas = [
    { key: 'lancar', label: 'Lançar despesa' },
    { key: 'minhas', label: 'Minhas solicitações' },
    ...(ehAdmin ? [{ key: 'aprovar', label: 'Aprovar' }] : []),
    ...(ehFinanceiro ? [{ key: 'pagar', label: 'Pagar' }] : []),
    ...(ehFinanceiro ? [{ key: 'recebimentos', label: 'Recebimentos advogados' }] : []),
  ];

  return (
    <div className="fin-wrap">
      <Estilos />
      <header className="fin-head">
        <div>
          <h1 className="fin-titulo">Financeiro</h1>
          <p className="fin-sub">Contas a pagar e recebimentos de advogado</p>
        </div>
        {perfil?.nome && (
          <span className="fin-quem">{perfil.nome} · <b>{role || '—'}</b></span>
        )}
      </header>

      <nav className="fin-abas">
        {abas.map((a) => (
          <button
            key={a.key}
            className={'fin-aba' + (aba === a.key ? ' fin-aba-on' : '')}
            onClick={() => setAba(a.key)}
          >{a.label}</button>
        ))}
      </nav>

      <main className="fin-main">
        {aba === 'lancar' && <Lancar perfil={perfil} onCriou={() => setAba('minhas')} />}
        {aba === 'minhas' && <Minhas perfil={perfil} />}
        {aba === 'aprovar' && ehAdmin && <Aprovar />}
        {aba === 'pagar' && ehFinanceiro && <Pagar />}
        {aba === 'recebimentos' && ehFinanceiro && <Recebimentos />}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lançar despesa
// ---------------------------------------------------------------------------
function Lancar({ perfil, onCriou }) {
  const vazio = {
    valor: '', fornecedor_nome: '', fornecedor_documento: '', motivo: '',
    vencimento: '', forma_pagamento: '', categoria: '', tipo_gasto: '',
    chave_pix: '', boleto_linha_digitavel: '', possui_nota_fiscal: false, nota_fiscal_url: '',
  };
  const [f, setF] = useState(vazio);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const montarRegistro = () => ({
    solicitante_id: perfil.id,
    solicitante_nome: perfil.nome || null,
    valor: f.valor === '' ? null : Number(f.valor),
    fornecedor_nome: f.fornecedor_nome || null,
    fornecedor_documento: f.fornecedor_documento || null,
    motivo: f.motivo || null,
    vencimento: f.vencimento || null,
    forma_pagamento: f.forma_pagamento || null,
    categoria: f.categoria || null,
    tipo_gasto: f.tipo_gasto || null,
    chave_pix: f.forma_pagamento === 'pix' ? (f.chave_pix || null) : null,
    boleto_linha_digitavel: f.forma_pagamento === 'boleto' ? (f.boleto_linha_digitavel || null) : null,
    possui_nota_fiscal: !!f.possui_nota_fiscal,
    nota_fiscal_pendente: !f.possui_nota_fiscal,
    nota_fiscal_url: f.possui_nota_fiscal ? (f.nota_fiscal_url || null) : null,
  });

  const criar = async (enviar) => {
    setErro(''); setOk('');
    if (enviar) {
      const falta = [];
      if (f.valor === '') falta.push('valor');
      if (!f.fornecedor_nome) falta.push('fornecedor');
      if (!f.motivo) falta.push('motivo');
      if (!f.vencimento) falta.push('vencimento');
      if (!f.forma_pagamento) falta.push('forma de pagamento');
      if (falta.length) { setErro('Para enviar, preencha: ' + falta.join(', ') + '.'); return; }
    }
    setSalvando(true);
    try {
      const { data, error } = await supabase
        .from('finance_requests').insert(montarRegistro()).select('id').single();
      if (error) throw error;
      if (enviar) {
        const { error: e2 } = await supabase.rpc('finance_submeter', { p_id: data.id });
        if (e2) throw e2;
        setOk('Solicitação enviada para aprovação.');
      } else {
        setOk('Rascunho salvo.');
      }
      setF(vazio);
      if (enviar && onCriou) setTimeout(onCriou, 600);
    } catch (e) {
      setErro(e.message || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fin-card">
      <div className="fin-grid">
        <Campo label="Valor (R$)" req>
          <input className="fin-in" type="number" min="0" step="0.01" value={f.valor}
            onChange={(e) => set('valor', e.target.value)} placeholder="0,00" />
        </Campo>
        <Campo label="Vencimento" req>
          <input className="fin-in" type="date" value={f.vencimento}
            onChange={(e) => set('vencimento', e.target.value)} />
        </Campo>
        <Campo label="Fornecedor" req>
          <input className="fin-in" value={f.fornecedor_nome}
            onChange={(e) => set('fornecedor_nome', e.target.value)} placeholder="Nome do fornecedor" />
        </Campo>
        <Campo label="CPF/CNPJ do fornecedor">
          <input className="fin-in" value={f.fornecedor_documento}
            onChange={(e) => set('fornecedor_documento', e.target.value)} placeholder="Opcional" />
        </Campo>
        <Campo label="Forma de pagamento" req>
          <select className="fin-in" value={f.forma_pagamento}
            onChange={(e) => set('forma_pagamento', e.target.value)}>
            <option value="">Selecione…</option>
            {FORMAS.map((x) => <option key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</option>)}
          </select>
        </Campo>
        <Campo label="Categoria">
          <input className="fin-in" value={f.categoria}
            onChange={(e) => set('categoria', e.target.value)} placeholder="Ex.: exame, software, aluguel" />
        </Campo>
        <Campo label="Tipo de gasto">
          <select className="fin-in" value={f.tipo_gasto}
            onChange={(e) => set('tipo_gasto', e.target.value)}>
            <option value="">Selecione…</option>
            <option value="fixo">Fixo (recorrente — aluguel, salário, assinatura)</option>
            <option value="variavel">Variável (pontual — varia mês a mês)</option>
          </select>
        </Campo>
        {f.forma_pagamento === 'pix' && (
          <Campo label="Chave PIX">
            <input className="fin-in" value={f.chave_pix}
              onChange={(e) => set('chave_pix', e.target.value)} placeholder="CPF, e-mail, telefone ou aleatória" />
          </Campo>
        )}
        {f.forma_pagamento === 'boleto' && (
          <Campo label="Linha digitável do boleto">
            <input className="fin-in" value={f.boleto_linha_digitavel}
              onChange={(e) => set('boleto_linha_digitavel', e.target.value)} placeholder="Código de barras" />
          </Campo>
        )}
        <Campo label="Motivo" req full>
          <textarea className="fin-in fin-area" value={f.motivo}
            onChange={(e) => set('motivo', e.target.value)} rows={2}
            placeholder="O que é esse pagamento e por quê" />
        </Campo>
        <div className="fin-nf">
          <label className="fin-check">
            <input type="checkbox" checked={f.possui_nota_fiscal}
              onChange={(e) => set('possui_nota_fiscal', e.target.checked)} />
            Tenho nota fiscal
          </label>
          {f.possui_nota_fiscal
            ? <input className="fin-in" value={f.nota_fiscal_url}
                onChange={(e) => set('nota_fiscal_url', e.target.value)} placeholder="Link da NF (Drive, etc.)" />
            : <span className="fin-aviso">Sem NF — o aprovador será avisado.</span>}
        </div>
      </div>

      {erro && <div className="fin-erro">{erro}</div>}
      {ok && <div className="fin-ok">{ok}</div>}

      <div className="fin-acoes">
        <button className="fin-btn fin-btn-ghost" disabled={salvando} onClick={() => criar(false)}>
          Salvar rascunho
        </button>
        <button className="fin-btn fin-btn-primary" disabled={salvando} onClick={() => criar(true)}>
          {salvando ? 'Enviando…' : 'Enviar para aprovação'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Minhas solicitações
// ---------------------------------------------------------------------------
function Minhas({ perfil }) {
  const [itens, setItens] = useState(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setErro('');
    const { data, error } = await supabase
      .from('finance_requests')
      .select('*')
      .eq('solicitante_id', perfil.id)
      .order('criado_em', { ascending: false });
    if (error) setErro(error.message); else setItens(data || []);
  }, [perfil.id]);

  useEffect(() => { carregar(); }, [carregar]);

  const acao = async (fn, args, id) => {
    const { error } = await supabase.rpc(fn, { p_id: id, ...args });
    if (error) { alert(error.message); return; }
    carregar();
  };

  if (erro) return <div className="fin-erro">{erro}</div>;
  if (itens === null) return <div className="fin-vazio">Carregando…</div>;
  if (!itens.length) return <div className="fin-vazio">Você ainda não lançou nenhuma despesa. Use a aba “Lançar despesa”.</div>;

  return (
    <div className="fin-lista">
      {itens.map((r) => (
        <Linha key={r.id} r={r}>
          {['rascunho', 'incompleto', 'ajuste_solicitado'].includes(r.status) && (
            <button className="fin-btn fin-btn-primary fin-btn-sm"
              onClick={() => acao('finance_submeter', {}, r.id)}>Enviar p/ aprovação</button>
          )}
          {!['pago', 'cancelado'].includes(r.status) && (
            <button className="fin-btn fin-btn-ghost fin-btn-sm"
              onClick={() => { if (window.confirm('Cancelar esta solicitação?')) acao('finance_cancelar', {}, r.id); }}>
              Cancelar</button>
          )}
          {r.status !== 'pago' && (
            <button className="fin-btn fin-btn-danger fin-btn-sm"
              onClick={() => { if (window.confirm('Excluir DE VEZ esta despesa? Isso apaga o registro e não dá pra desfazer.')) acao('finance_excluir', {}, r.id); }}>
              Excluir</button>
          )}
        </Linha>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aprovar (admin)
// ---------------------------------------------------------------------------
function Aprovar() {
  const [itens, setItens] = useState(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setErro('');
    const { data, error } = await supabase
      .from('finance_requests').select('*')
      .eq('status', 'aguardando_aprovacao')
      .order('vencimento', { ascending: true });
    if (error) setErro(error.message); else setItens(data || []);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const decidir = async (fn, id, precisaMotivo) => {
    let motivo;
    if (precisaMotivo) {
      motivo = window.prompt('Motivo:');
      if (motivo == null) return;
    }
    const args = precisaMotivo ? { p_id: id, p_motivo: motivo } : { p_id: id };
    const { error } = await supabase.rpc(fn, args);
    if (error) { alert(error.message); return; }
    carregar();
  };

  if (erro) return <div className="fin-erro">{erro}</div>;
  if (itens === null) return <div className="fin-vazio">Carregando…</div>;
  if (!itens.length) return <div className="fin-vazio">Nada aguardando aprovação agora.</div>;

  return (
    <div className="fin-lista">
      {itens.map((r) => (
        <Linha key={r.id} r={r} destaqueSemNF>
          <button className="fin-btn fin-btn-primary fin-btn-sm"
            onClick={() => decidir('finance_aprovar', r.id, false)}>Aprovar</button>
          <button className="fin-btn fin-btn-ghost fin-btn-sm"
            onClick={() => decidir('finance_solicitar_ajuste', r.id, true)}>Pedir ajuste</button>
          <button className="fin-btn fin-btn-danger fin-btn-sm"
            onClick={() => decidir('finance_recusar', r.id, true)}>Recusar</button>
          <button className="fin-btn fin-btn-ghost fin-btn-sm"
            onClick={() => { if (window.confirm('Excluir DE VEZ esta despesa? Isso apaga o registro e não dá pra desfazer.')) decidir('finance_excluir', r.id, false); }}>Excluir</button>
        </Linha>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagar (financeiro / admin)
// ---------------------------------------------------------------------------
function Pagar() {
  const [itens, setItens] = useState(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setErro('');
    const { data, error } = await supabase
      .from('finance_requests').select('*')
      .in('status', ['aprovado', 'aguardando_pagamento'])
      .order('vencimento', { ascending: true });
    if (error) setErro(error.message); else setItens(data || []);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const pagar = async (id) => {
    const url = window.prompt('Link do comprovante (opcional — deixe em branco se anexar depois):', '');
    if (url === null) return;
    const { error } = await supabase.rpc('finance_marcar_pago', { p_id: id, p_comprovante_url: url || null });
    if (error) { alert(error.message); return; }
    carregar();
  };

  if (erro) return <div className="fin-erro">{erro}</div>;
  if (itens === null) return <div className="fin-vazio">Carregando…</div>;
  if (!itens.length) return <div className="fin-vazio">Nenhuma conta aprovada esperando pagamento.</div>;

  return (
    <div className="fin-lista">
      {itens.map((r) => (
        <Linha key={r.id} r={r} mostrarPix>
          <button className="fin-btn fin-btn-primary fin-btn-sm" onClick={() => pagar(r.id)}>
            Marcar paga</button>
        </Linha>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recebimentos de advogado (admin / financeiro) — fila de validação
// A Luna só insere aqui. Validar/Rejeitar é humano. Validar+baixar toca o lote.
// ---------------------------------------------------------------------------
function Recebimentos() {
  const [itens, setItens] = useState(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setErro('');
    const { data, error } = await supabase
      .from('finance_advogado_payments').select('*')
      .in('status', ['aguardando_validacao', 'aguardando_explicacao', 'aguardando_complemento'])
      .order('criado_em', { ascending: true });
    if (error) setErro(error.message); else setItens(data || []);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const validar = async (id, integrar) => {
    const msg = integrar
      ? 'Validar e DAR BAIXA no lote? Isso marca o lote como pago no CRM.'
      : 'Validar este recebimento SEM baixar o lote (caso parcial)?';
    if (!window.confirm(msg)) return;
    const { error } = await supabase.rpc('finance_adv_validar', { p_id: id, p_integrar_no_lote: integrar });
    if (error) { alert(error.message); return; }
    carregar();
  };
  const rejeitar = async (id) => {
    const motivo = window.prompt('Motivo da rejeição:');
    if (motivo == null) return;
    const { error } = await supabase.rpc('finance_adv_rejeitar', { p_id: id, p_motivo: motivo });
    if (error) { alert(error.message); return; }
    carregar();
  };

  if (erro) return <div className="fin-erro">{erro}</div>;
  if (itens === null) return <div className="fin-vazio">Carregando…</div>;
  if (!itens.length) return <div className="fin-vazio">Nenhum recebimento de advogado aguardando validação.</div>;

  return (
    <div className="fin-lista">
      {itens.map((r) => (
        <LinhaRecebimento key={r.id} r={r}
          onValidarTotal={() => validar(r.id, true)}
          onValidarParcial={() => validar(r.id, false)}
          onRejeitar={() => rejeitar(r.id)} />
      ))}
    </div>
  );
}

function LinhaRecebimento({ r, onValidarTotal, onValidarParcial, onRejeitar }) {
  const dif = r.diferenca == null ? null : Number(r.diferenca);
  const cor = TIPO_PG_COR[r.tipo_pagamento] || '#6b7280';
  return (
    <div className="fin-item">
      <div className="fin-item-top">
        <span className="fin-valor">{brl(r.valor_informado)}</span>
        <span className="fin-badge" style={{ background: cor + '1a', color: cor }}>
          {TIPO_PG_LABEL[r.tipo_pagamento] || r.tipo_pagamento || '—'}
        </span>
      </div>
      <div className="fin-item-forn">{r.advogado_nome || 'Advogado não identificado'}</div>
      <div className="fin-item-meta">
        <span>Esperado {brl(r.valor_esperado)}</span>
        <span>· Informado {brl(r.valor_informado)}</span>
        {dif != null && dif !== 0 && <span>· Dif <b>{brl(dif)}</b></span>}
        {r.vendedor_nome && <span>· por {r.vendedor_nome}</span>}
      </div>
      <div className="fin-item-meta">
        <span>{FILA_STATUS_LABEL[r.status] || r.status}</span>
        {r.lote_id && <span>· Lote {String(r.lote_id).slice(0, 8)}…</span>}
        {!r.lote_id && <span>· sem lote vinculado</span>}
        {r.data_pagamento_informada && <span>· pago em {dataBR(r.data_pagamento_informada)}</span>}
      </div>
      {r.explicacao_vendedor && <div className="fin-item-motivo">Vendedor: {r.explicacao_vendedor}</div>}
      {r.analise_luna && <div className="fin-item-motivo">Luna: {r.analise_luna}</div>}
      {r.comprovante_url && (
        <div className="fin-item-pix">
          <a href={r.comprovante_url} target="_blank" rel="noreferrer">Ver comprovante</a>
        </div>
      )}
      <div className="fin-item-acoes">
        {r.lote_id && (
          <button className="fin-btn fin-btn-primary fin-btn-sm" onClick={onValidarTotal}>
            Validar + baixar lote</button>
        )}
        <button className="fin-btn fin-btn-ghost fin-btn-sm" onClick={onValidarParcial}>
          Validar parcial (não baixa)</button>
        <button className="fin-btn fin-btn-danger fin-btn-sm" onClick={onRejeitar}>
          Rejeitar</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componentes auxiliares
// ---------------------------------------------------------------------------
function Linha({ r, children, destaqueSemNF, mostrarPix }) {
  return (
    <div className="fin-item">
      <div className="fin-item-top">
        <span className="fin-valor">{brl(r.valor)}</span>
        <span className="fin-badge" style={{ background: (STATUS_COR[r.status] || '#6b7280') + '1a', color: STATUS_COR[r.status] || '#6b7280' }}>
          {STATUS_LABEL[r.status] || r.status}
        </span>
      </div>
      <div className="fin-item-forn">{r.fornecedor_nome || 'Sem fornecedor'}</div>
      <div className="fin-item-meta">
        <span>Vence {dataBR(r.vencimento)}</span>
        {r.forma_pagamento && <span>· {r.forma_pagamento}</span>}
        {r.categoria && <span>· {r.categoria}</span>}
        {r.tipo_gasto && <span>· {r.tipo_gasto === 'fixo' ? 'fixo' : 'variável'}</span>}
        {r.solicitante_nome && <span>· por {r.solicitante_nome}</span>}
      </div>
      {r.motivo && <div className="fin-item-motivo">{r.motivo}</div>}
      {mostrarPix && r.forma_pagamento === 'pix' && r.chave_pix && (
        <div className="fin-item-pix">PIX: <b>{r.chave_pix}</b></div>
      )}
      {mostrarPix && r.forma_pagamento === 'boleto' && r.boleto_linha_digitavel && (
        <div className="fin-item-pix">Boleto: <b>{r.boleto_linha_digitavel}</b></div>
      )}
      {destaqueSemNF && !r.possui_nota_fiscal && <div className="fin-semnf">⚠ Sem nota fiscal</div>}
      {r.recusa_motivo && <div className="fin-semnf">Recusada: {r.recusa_motivo}</div>}
      {r.ajuste_motivo && r.status === 'ajuste_solicitado' && <div className="fin-semnf">Ajuste pedido: {r.ajuste_motivo}</div>}
      {children && <div className="fin-item-acoes">{children}</div>}
    </div>
  );
}

function Campo({ label, req, full, children }) {
  return (
    <label className={'fin-campo' + (full ? ' fin-campo-full' : '')}>
      <span className="fin-lab">{label}{req && <i className="fin-req">*</i>}</span>
      {children}
    </label>
  );
}

function Estilos() {
  return (
    <style>{`
      .fin-wrap{--fin-ink:#0f1c1a;--fin-teal:#0f766e;--fin-teal-d:#0b5a54;--fin-line:#e5e7eb;--fin-soft:#f8fafa;font-family:Inter,system-ui,-apple-system,sans-serif;color:var(--fin-ink);max-width:980px;margin:0 auto;padding:8px 16px 48px}
      .fin-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;padding:8px 0 16px;border-bottom:2px solid var(--fin-ink)}
      .fin-titulo{font-size:26px;font-weight:700;letter-spacing:-.02em;margin:0}
      .fin-sub{margin:2px 0 0;color:#6b7280;font-size:13px}
      .fin-quem{font-size:12px;color:#6b7280;white-space:nowrap}
      .fin-abas{display:flex;gap:4px;margin:16px 0;flex-wrap:wrap}
      .fin-aba{border:1px solid var(--fin-line);background:#fff;color:#374151;padding:8px 14px;border-radius:999px;font-size:13px;font-weight:600;cursor:pointer}
      .fin-aba-on{background:var(--fin-ink);color:#fff;border-color:var(--fin-ink)}
      .fin-card{border:1px solid var(--fin-line);border-radius:14px;padding:18px;background:#fff}
      .fin-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
      .fin-campo{display:flex;flex-direction:column;gap:5px}
      .fin-campo-full{grid-column:1/-1}
      .fin-lab{font-size:12px;font-weight:600;color:#374151}
      .fin-req{color:#b91c1c;font-style:normal;margin-left:2px}
      .fin-in{border:1px solid var(--fin-line);border-radius:9px;padding:9px 11px;font-size:14px;font-family:inherit;background:#fff;width:100%;box-sizing:border-box}
      .fin-in:focus{outline:none;border-color:var(--fin-teal);box-shadow:0 0 0 3px rgba(15,118,110,.12)}
      .fin-area{resize:vertical}
      .fin-nf{grid-column:1/-1;display:flex;align-items:center;gap:14px;flex-wrap:wrap;background:var(--fin-soft);border-radius:9px;padding:10px 12px}
      .fin-nf .fin-in{width:auto;flex:1;min-width:220px}
      .fin-check{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;white-space:nowrap}
      .fin-aviso{font-size:12px;color:#b45309}
      .fin-acoes{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}
      .fin-btn{border:1px solid transparent;border-radius:9px;padding:10px 16px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}
      .fin-btn-sm{padding:7px 12px;font-size:12px}
      .fin-btn-primary{background:var(--fin-teal);color:#fff}
      .fin-btn-primary:hover{background:var(--fin-teal-d)}
      .fin-btn-ghost{background:#fff;border-color:var(--fin-line);color:#374151}
      .fin-btn-danger{background:#fff;border-color:#fecaca;color:#b91c1c}
      .fin-btn:disabled{opacity:.55;cursor:default}
      .fin-erro{margin-top:14px;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;padding:10px 12px;border-radius:9px;font-size:13px}
      .fin-ok{margin-top:14px;background:#f0fdf4;border:1px solid #bbf7d0;color:#15803d;padding:10px 12px;border-radius:9px;font-size:13px}
      .fin-vazio{padding:40px 16px;text-align:center;color:#6b7280;font-size:14px;border:1px dashed var(--fin-line);border-radius:14px}
      .fin-lista{display:flex;flex-direction:column;gap:12px}
      .fin-item{border:1px solid var(--fin-line);border-radius:12px;padding:14px 16px;background:#fff}
      .fin-item-top{display:flex;justify-content:space-between;align-items:center;gap:10px}
      .fin-valor{font-size:19px;font-weight:700;font-variant-numeric:tabular-nums}
      .fin-badge{font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;white-space:nowrap}
      .fin-item-forn{font-weight:600;font-size:14px;margin-top:4px}
      .fin-item-meta{display:flex;gap:6px;flex-wrap:wrap;color:#6b7280;font-size:12px;margin-top:3px}
      .fin-item-motivo{font-size:13px;color:#374151;margin-top:7px;line-height:1.4}
      .fin-item-pix{font-size:12px;margin-top:7px;background:var(--fin-soft);padding:6px 9px;border-radius:7px;word-break:break-all}
      .fin-semnf{font-size:12px;color:#b45309;margin-top:7px;font-weight:600}
      .fin-item-acoes{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
      @media(max-width:640px){.fin-grid{grid-template-columns:1fr}.fin-head{flex-direction:column;align-items:flex-start}}
    `}</style>
  );
}
