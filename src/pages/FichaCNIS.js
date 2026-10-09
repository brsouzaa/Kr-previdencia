import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ===== FICHA CNIS — documento do pré-aprovado para o advogado (08/10) =====
// Pedido do Bruno: o relatorio da Deidaiane virou padrao. Todo pre-aprovado tem uma
// ficha com o CNIS inteiro e a justificativa do direito, que a validacao imprime em
// PDF e anexa no Drive do advogado.
//
// Rota: /ficha/<cpf>  — por PATHNAME, igual ao Portal e a ParceriaPensao. Este
// projeto nao usa react-router-dom: o App navega por estado (setPage) e as rotas
// com URL propria saem de window.location.pathname. Nao ha useParams aqui.
// A ficha entra no App DEPOIS do login (tem CPF, telefone e o CNIS inteiro) e
// FORA do Layout, pra sair limpa na impressao, sem menu.
//
// O CPF e a chave porque funciona nos DOIS momentos:
//   pre_aprovacao -> so existe o lead/GERID (sem vendedora, telefone, produto)
//   validacao     -> o lead ja virou cliente, a ficha sai completa
// Quem decide qual e qual e a propria rpc (campo 'etapa'). O front so pinta.
//
// Tudo vem da rpc ficha_cnis(p_cpf). Nenhum calculo juridico e feito aqui de proposito:
// a distancia vinculo->parto, a faixa e o fundamento legal sao calculados no banco,
// num lugar so, testavel. Se a tese mudar, muda la e todas as fichas mudam juntas.
//
// IMPORTANTE — 44% dos pre-aprovados estao entre 12 e 24 meses. Para esses a frase
// "dentro dos 12 meses" e FALSA. A rpc devolve o fundamento certo por faixa:
//   graca_12 -> art. 15, II           graca_24 -> art. 15, §1 (+120 contrib) ou §2 (desemprego)
//   fora     -> passou de 24 meses, a ficha carimba REVISAR em vermelho.

const fmt = (d) => {
  if (!d) return '—'
  const s = String(d).slice(0, 10)
  const [a, m, dia] = s.split('-')
  return (a && m && dia) ? `${dia}/${m}/${a}` : String(d)
}
// o GERID guarda as datas dos vinculos como texto DD/MM/AAAA
const toDate = (br) => {
  if (!br || !/^\d{2}\/\d{2}\/\d{4}$/.test(br)) return null
  const [d, m, a] = br.split('/')
  return new Date(+a, +m - 1, +d)
}
const dur = (meses, dias) => {
  if (meses == null && dias == null) return '—'
  const M = Number(meses) || 0, D = Number(dias) || 0
  const p = []
  if (M > 0) p.push(M + (M === 1 ? ' mês' : ' meses'))
  if (D > 0) p.push(D + (D === 1 ? ' dia' : ' dias'))
  return p.length ? p.join(' e ') : 'menos de 1 dia'
}

const FAIXA = {
  empregada_no_parto: { rot: 'Empregada na data do parto', cor: 'verde' },
  graca_12:           { rot: 'Dentro dos 12 meses',        cor: 'verde' },
  graca_24:           { rot: 'Entre 12 e 24 meses',        cor: 'ambar' },
  fora:               { rot: 'Fora do período de graça',   cor: 'vermelho' },
}

// CPF vem do proprio endereco: /ficha/85852661554 ou /ficha/858.526.615-54
const cpfDaUrl = () => {
  const p = window.location.pathname
  const i = p.indexOf('/ficha/')
  if (i < 0) return ''
  return decodeURIComponent(p.slice(i + 7)).split('/')[0].replace(/\D/g, '')
}

export default function FichaCNIS() {
  const [cpf] = useState(cpfDaUrl)
  const [dados, setDados]   = useState(null)
  const [erro, setErro]     = useState('')
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('')
    if (!cpf || cpf.length !== 11) {
      setErro('O endereço não traz um CPF válido. Use /ficha/00000000000 (11 dígitos).')
      setDados(null); setCarregando(false); return
    }
    const { data, error } = await supabase.rpc('ficha_cnis', { p_cpf: cpf })
    if (error)                 { setErro(error.message); setDados(null) }
    else if (!data?.encontrado){ setErro(data?.erro || 'Não encontrado'); setDados(null) }
    else                       { setDados(data) }
    setCarregando(false)
  }, [cpf])

  useEffect(() => { carregar() }, [carregar])

  // 09/10 (Bruno) — NOME DO ARQUIVO PDF.
  // O navegador usa o document.title como nome sugerido no "Salvar como PDF". A pagina
  // nao tem title proprio, entao herdava o do public/index.html e TODA ficha saia
  // chamada "KR Previdencia CRM" — o Drive do advogado virava uma pasta de arquivos
  // com o mesmo nome. Padrao definido: "Ficha CNIS - NOME - CPF".
  // Os caracteres \ / : * ? " < > | sao trocados por "-": nome de arquivo nao aceita
  // eles, e uma barra no nome da cliente truncaria o arquivo na hora de salvar.
  // Restaura o title ao sair, pra o nome da cliente nao ficar na aba das outras telas.
  useEffect(() => {
    const titleOriginal = document.title
    const nomeFicha = dados && dados.nome
    if (nomeFicha) {
      const limpo = String(nomeFicha).replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim()
      document.title = 'Ficha CNIS - ' + limpo + (cpf ? ' - ' + cpf : '')
    }
    return () => { document.title = titleOriginal }
  }, [dados, cpf])

  if (carregando) return <div style={{ padding: 40, fontFamily: 'system-ui' }}>Carregando a ficha…</div>
  if (erro) return (
    <div style={{ padding: 40, fontFamily: 'system-ui' }}>
      <h2 style={{ fontSize: 17 }}>Não foi possível montar a ficha</h2>
      <p style={{ color: '#b42318', marginTop: 8 }}>{erro}</p>
      <p style={{ color: '#5b6b84', marginTop: 8, fontSize: 13 }}>
        A ficha depende de uma consulta do GERID para este CPF. Se o GERID ainda não rodou
        para esta cliente, não há CNIS para transcrever.
      </p>
    </div>
  )

  const { nome, cliente, gerid, vinculos = [], filhos = [], etapa, lead_id, gerado_em } = dados
  const principal = filhos.find(f => f.sugestao === 'aprovar') || filhos[0] || null
  const dnPrinc   = principal?.dn ? new Date(String(principal.dn).slice(0, 10) + 'T00:00:00') : null
  const fimPrinc  = principal?.vinculo_fim ? String(principal.vinculo_fim).slice(0, 10) : null

  // situacao de cada vinculo em relacao ao parto do filho aprovado
  const sitVinculo = (v) => {
    const vi = toDate(v.inicio), vf = toDate(v.fim)
    const ehODireito = fimPrinc && v.fim && toDate(v.fim)?.toISOString().slice(0, 10) === fimPrinc
      && principal?.empresa && v.nome === principal.empresa
    if (ehODireito) return { t: 'é o que gera o direito', c: 'verde' }
    if (!dnPrinc)   return { t: '—', c: 'cinza' }
    if (vi && vi > dnPrinc) return { t: 'posterior ao parto', c: 'azul' }
    if (/AUXILIO SALARIO MATERNIDADE/i.test(v.nome || '')) return { t: 'outro filho', c: 'azul' }
    if (/AUXILIO/i.test(v.nome || '')) return { t: 'benefício', c: 'azul' }
    if (vf && vf <= dnPrinc) {
      const anos = Math.floor((dnPrinc - vf) / 31557600000)
      return { t: anos >= 1 ? `encerrado há ${anos} ano${anos > 1 ? 's' : ''}` : 'encerrado antes do parto', c: 'vermelho' }
    }
    if (!v.fim) return { t: 'vínculo ativo', c: 'azul' }
    return { t: '—', c: 'cinza' }
  }

  // o cadastro da vendedora bate com o CNIS?
  const confere = []
  if (cliente && principal) {
    const trab = cliente.trabalhava_no_nascimento
    const temVinculoNoParto = principal.dias_corridos != null && principal.dias_corridos <= 0
    if (trab === 'true' && !temVinculoNoParto) confere.push({
      ok: false, campo: 'Trabalhava no nascimento',
      txt: `A ficha marca SIM, mas o CNIS não mostra vínculo ativo em ${fmt(principal.dn)} — o último encerrou em ${fmt(principal.vinculo_fim)}. Não derruba o direito (o período de graça resolve), mas o campo está errado e é o tipo de divergência que faz o advogado cancelar. Corrigir para NÃO, com saída em ${fmt(principal.vinculo_fim).slice(3)}.`
    })
    if (trab === 'false' && temVinculoNoParto) confere.push({
      ok: false, campo: 'Trabalhava no nascimento',
      txt: 'A ficha marca NÃO, mas o CNIS mostra vínculo ativo na data do parto. Corrigir para SIM.'
    })
    if (trab === 'false' && !temVinculoNoParto) confere.push({
      ok: true, campo: 'Trabalhava no nascimento', txt: 'Marcado NÃO, coerente com o CNIS.'
    })
    if (principal.faixa === 'graca_24' && principal.alerta && cliente.recebeu_seguro_desemprego === 'false') confere.push({
      ok: false, campo: 'Seguro-desemprego',
      txt: 'A tese desta cliente depende de comprovar o desemprego (art. 15, §2º), mas a ficha marca que ela NÃO recebeu seguro-desemprego. Levantar outra prova: baixa na CTPS, registro no MTE ou rescisão.'
    })
  }

  return (
    <div className="fichacnis">
      <style>{`
        .fichacnis{--tinta:#0f172a;--suave:#5b6b84;--linha:rgba(15,23,42,.10);--fundo:#f4f6fa;
          --verde:#0f6e56;--verdebg:rgba(52,211,153,.14);--vermelho:#b42318;
          --vermelhobg:rgba(248,113,113,.14);--ambar:#854f0b;--ambarbg:rgba(251,191,36,.14);
          --azul:#185fa5;--azulbg:rgba(96,165,250,.12);
          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
          background:var(--fundo);color:var(--tinta);line-height:1.55;padding:24px 16px;min-height:100vh}
        .fichacnis *{box-sizing:border-box}
        .fc-folha{max-width:860px;margin:0 auto;background:#fff;border:1px solid var(--linha);
          border-radius:14px;overflow:hidden}
        .fc-topo{padding:26px 30px 22px;border-bottom:1px solid var(--linha);position:relative}
        .fc-topo h1{font-size:21px;font-weight:600;letter-spacing:-.3px;margin:0}
        .fc-sub{font-size:13px;color:var(--suave);margin-top:5px}
        .fc-secao{padding:24px 30px;border-bottom:1px solid var(--linha)}
        .fc-secao:last-child{border-bottom:0}
        .fc-secao h2{font-size:12px;text-transform:uppercase;letter-spacing:.9px;color:var(--suave);
          font-weight:600;margin:0 0 14px}
        .fc-grade{display:grid;grid-template-columns:repeat(auto-fit,minmax(185px,1fr));gap:12px}
        .fc-campo{background:var(--fundo);border-radius:9px;padding:11px 13px}
        .fc-rot{font-size:10.5px;text-transform:uppercase;letter-spacing:.6px;color:var(--suave)}
        .fc-val{font-size:14px;font-weight:600;margin-top:3px;word-break:break-word}
        .fc-folha table{width:100%;border-collapse:collapse;font-size:13.5px}
        .fc-folha th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.6px;
          color:var(--suave);font-weight:600;padding:9px 10px;background:var(--fundo);
          border-bottom:1px solid var(--linha)}
        .fc-folha td{padding:9px 10px;border-bottom:1px solid var(--linha);vertical-align:top}
        .fc-tag{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;
          font-weight:600;white-space:nowrap}
        .fc-verde{background:var(--verdebg);color:var(--verde)}
        .fc-vermelho{background:var(--vermelhobg);color:var(--vermelho)}
        .fc-ambar{background:var(--ambarbg);color:var(--ambar)}
        .fc-azul{background:var(--azulbg);color:var(--azul)}
        .fc-cinza{color:var(--suave)}
        .fc-aviso{border-radius:10px;padding:14px 16px;font-size:13.5px;margin-bottom:12px}
        .fc-aviso:last-child{margin-bottom:0}
        .fc-aviso b{display:block;margin-bottom:5px;font-size:13px}
        .fc-a-verde{background:var(--verdebg);border:1px solid rgba(15,110,86,.25)}
        .fc-a-vermelho{background:var(--vermelhobg);border:1px solid rgba(180,35,24,.3)}
        .fc-a-ambar{background:var(--ambarbg);border:1px solid rgba(133,79,11,.28)}
        .fc-parto td{background:var(--vermelhobg);color:var(--vermelho);font-weight:600;
          font-size:12.5px;text-align:center}
        .fc-dir td{background:var(--verdebg)}
        .fc-tela{background:#1e293b;color:#e2e8f0;border-radius:9px;padding:15px 17px;
          font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:11.5px;line-height:1.6;
          white-space:pre-wrap;word-break:break-word}
        .fc-rodape{padding:18px 30px;font-size:11.5px;color:var(--suave);background:var(--fundo)}
        .fc-acoes{position:absolute;top:24px;right:28px;display:flex;gap:8px}
        .fc-btn{background:var(--tinta);color:#fff;border:0;border-radius:8px;padding:9px 16px;
          font-size:13px;font-weight:600;cursor:pointer}
        .fc-btn:hover{opacity:.88}
        .fc-btn2{background:transparent;color:var(--suave);border:1px solid var(--linha)}
        .fc-etapa{display:inline-block;margin-top:9px;padding:3px 10px;border-radius:20px;
          font-size:11px;font-weight:600}
        @media print{
          .fichacnis{background:#fff;padding:0}
          .fc-folha{border:0;border-radius:0;max-width:none}
          .fc-acoes{display:none}
        }
      `}</style>

      <div className="fc-folha">

        <div className="fc-topo">
          <div className="fc-acoes">
            <button className="fc-btn fc-btn2" onClick={() => { window.location.href = '/' }}>Voltar</button>
            <button className="fc-btn" onClick={() => window.print()}>Imprimir / PDF</button>
          </div>
          <h1>{nome || 'Cliente'}</h1>
          <div className="fc-sub">
            Consulta ao CNIS pelo GERID — {gerid?.consultado_em || 'data não registrada'}
            {principal?.dn && <> · parto em {fmt(principal.dn)}</>}
          </div>
          <span className={'fc-etapa ' + (etapa === 'validacao' ? 'fc-verde' : 'fc-azul')}>
            {etapa === 'validacao' ? 'Validação — venda fechada' : 'Pré-aprovação — ainda não vendido'}
          </span>
          {principal && principal.dn_exata === false && (
            <div className="fc-aviso fc-a-ambar" style={{ marginTop: 14 }}>
              <b>Data de nascimento aproximada</b>
              A data do parto usada aqui foi informada pela cliente e <strong>não está confirmada
              em certidão</strong>. Todos os prazos desta ficha dependem dela. Conferir a certidão
              antes de protocolar.
            </div>
          )}
        </div>

        {cliente && (
          <div className="fc-secao">
            <h2>Cliente</h2>
            <div className="fc-grade">
              <div className="fc-campo"><div className="fc-rot">CPF</div><div className="fc-val">{cliente.cpf}</div></div>
              <div className="fc-campo"><div className="fc-rot">Telefone</div><div className="fc-val">{cliente.telefone || '—'}</div></div>
              <div className="fc-campo"><div className="fc-rot">Nascimento do bebê</div><div className="fc-val">{fmt(principal?.dn)}</div></div>
              <div className="fc-campo"><div className="fc-rot">Produto</div><div className="fc-val">{cliente.produto || '—'}</div></div>
              <div className="fc-campo"><div className="fc-rot">Vendedora</div><div className="fc-val">{cliente.vendedora || '—'}</div></div>
              <div className="fc-campo"><div className="fc-rot">Advogado</div><div className="fc-val">{cliente.advogado || '—'}</div></div>
              <div className="fc-campo"><div className="fc-rot">Situação</div><div className="fc-val">{cliente.status}{cliente.validado ? ' em ' + fmt(cliente.validado) : ''}</div></div>
              <div className="fc-campo"><div className="fc-rot">Vínculos no CNIS</div><div className="fc-val">{vinculos.length}</div></div>
            </div>
          </div>
        )}

        {!cliente && (
          <div className="fc-secao">
            <h2>Cliente</h2>
            <div className="fc-grade">
              <div className="fc-campo"><div className="fc-rot">CPF</div><div className="fc-val">{dados.cpf}</div></div>
              <div className="fc-campo"><div className="fc-rot">Nascimento do bebê</div><div className="fc-val">{fmt(principal?.dn)}</div></div>
              <div className="fc-campo"><div className="fc-rot">Vínculos no CNIS</div><div className="fc-val">{vinculos.length}</div></div>
            </div>
            <div className="fc-cinza" style={{ fontSize: 12.5, marginTop: 12 }}>
              Lead ainda não vendido. Vendedora, telefone e produto entram nesta ficha
              quando a venda for fechada.
            </div>
          </div>
        )}

        {/* A TESE — um bloco por filho */}
        <div className="fc-secao">
          <h2>{filhos.length > 1 ? 'A tese — por filho' : 'A tese — por que ela tem direito'}</h2>
          {filhos.map((f, i) => {
            const fx = FAIXA[f.faixa] || { rot: '—', cor: 'cinza' }
            const neg = f.sugestao !== 'aprovar'
            return (
              <div key={i} style={{ marginBottom: i < filhos.length - 1 ? 18 : 0 }}>
                <div className={'fc-aviso ' + (neg ? 'fc-a-vermelho' : f.alerta ? 'fc-a-ambar' : 'fc-a-verde')}>
                  <b>
                    Filho nascido em {fmt(f.dn)} — {neg ? 'NEGADO pelo GERID' : 'APROVADO pelo GERID'}
                    {f.alerta ? ' · ' + f.alerta : ''}
                  </b>
                  {f.empresa ? (
                    <>
                      Último vínculo antes do parto: <strong>{f.empresa}</strong>
                      {f.vinculo_tipo ? ` (${f.vinculo_tipo})` : ''}, de {fmt(f.vinculo_inicio)} a{' '}
                      <strong>{fmt(f.vinculo_fim)}</strong>. Do fim desse vínculo até o nascimento
                      passaram-se <strong>{dur(f.meses, f.dias)}</strong>
                      {f.dias_corridos != null && ` (${f.dias_corridos} dias)`}.
                    </>
                  ) : (f.motivo || 'Sem vínculo identificado para esta data.')}
                </div>

                {!neg && (
                  <>
                    <div className="fc-grade" style={{ marginTop: 12 }}>
                      <div className="fc-campo"><div className="fc-rot">Saída do vínculo</div><div className="fc-val">{fmt(f.vinculo_fim)}</div></div>
                      <div className="fc-campo"><div className="fc-rot">Nascimento</div><div className="fc-val">{fmt(f.dn)}</div></div>
                      <div className="fc-campo"><div className="fc-rot">Intervalo</div><div className="fc-val">{dur(f.meses, f.dias)}</div></div>
                      <div className="fc-campo"><div className="fc-rot">Enquadramento</div>
                        <div className="fc-val"><span className={'fc-tag fc-' + fx.cor}>{fx.rot}</span></div></div>
                      <div className="fc-campo"><div className="fc-rot">Graça vai até</div><div className="fc-val">{fmt(f.graca_ate)}</div></div>
                      <div className="fc-campo"><div className="fc-rot">Prazo p/ requerer</div><div className="fc-val">{fmt(f.prazo_ate)}</div></div>
                      {f.meses_contrib != null && (
                        <div className="fc-campo"><div className="fc-rot">Contribuições (estimado)</div>
                          <div className="fc-val">{f.meses_contrib} meses</div></div>
                      )}
                    </div>
                    {f.fundamento && (
                      <div style={{ marginTop: 12, fontSize: 13.5 }}>{f.fundamento}</div>
                    )}
                    {(f.rural || f.autonoma) && (
                      <div className="fc-cinza" style={{ fontSize: 12.5, marginTop: 8 }}>
                        {f.rural && 'Segurada especial (rural) — a comprovação se faz por início de prova material do exercício da atividade rural.'}
                        {f.autonoma && 'Contribuinte individual — a qualidade de segurada decorre dos recolhimentos em carnê.'}
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>

        {/* CNIS INTEIRO */}
        <div className="fc-secao">
          <h2>Histórico de contribuição — {vinculos.length} vínculo{vinculos.length !== 1 ? 's' : ''} do CNIS</h2>
          <table>
            <thead>
              <tr><th>Vínculo</th><th>Tipo</th><th>Início</th><th>Fim</th>
                <th>Situação no parto{principal?.dn ? ` (${fmt(principal.dn)})` : ''}</th></tr>
            </thead>
            <tbody>
              {(() => {
                const ord = [...vinculos].sort((a, b) => {
                  const A = toDate(a.inicio), B = toDate(b.inicio)
                  return (A ? A.getTime() : 0) - (B ? B.getTime() : 0)
                })
                const linhas = []
                let partoPosto = false
                ord.forEach((v, i) => {
                  const vi = toDate(v.inicio)
                  if (dnPrinc && !partoPosto && vi && vi > dnPrinc) {
                    linhas.push(
                      <tr className="fc-parto" key="parto">
                        <td colSpan={5}>▼ {fmt(principal.dn)} — NASCIMENTO DO BEBÊ ▼</td>
                      </tr>)
                    partoPosto = true
                  }
                  const s = sitVinculo(v)
                  linhas.push(
                    <tr key={i} className={s.c === 'verde' ? 'fc-dir' : undefined}>
                      <td><strong>{v.nome}</strong></td>
                      <td>{v.tipo || '—'}</td>
                      <td>{v.inicio || '—'}</td>
                      <td>{v.fim || <span className="fc-cinza">ativo</span>}</td>
                      <td><span className={'fc-tag fc-' + s.c}>{s.t}</span></td>
                    </tr>)
                })
                if (dnPrinc && !partoPosto) linhas.push(
                  <tr className="fc-parto" key="parto-fim">
                    <td colSpan={5}>▼ {fmt(principal.dn)} — NASCIMENTO DO BEBÊ ▼</td>
                  </tr>)
                return linhas
              })()}
            </tbody>
          </table>
        </div>

        {/* CONFERENCIA DO CADASTRO */}
        {confere.length > 0 && (
          <div className="fc-secao">
            <h2>Cadastro conferido contra o CNIS</h2>
            {confere.map((c, i) => (
              <div key={i} className={'fc-aviso ' + (c.ok ? 'fc-a-verde' : 'fc-a-vermelho')}>
                <b>{c.campo}</b>{c.txt}
              </div>
            ))}
          </div>
        )}

        {/* TELA DO GERID */}
        {gerid?.tela && (
          <div className="fc-secao">
            <h2>Captura da tela do GERID</h2>
            <div className="fc-tela">{gerid.tela}</div>
            <div className="fc-cinza" style={{ marginTop: 10, fontSize: 12 }}>
              Transcrição fiel da tela de Relações Previdenciárias do Portal do INSS, feita pelo
              robô em {gerid.consultado_em || '—'}.
              {gerid.qtd_prints > 0
                ? ` Há ${gerid.qtd_prints} imagem(ns) salva(s).`
                : ' Não há imagem salva para esta cliente — o que existe é esta captura de texto.'}
            </div>
          </div>
        )}

        <div className="fc-rodape">
          CNIS levantado via GERID em {gerid?.consultado_em || '—'} · lead {lead_id}
          {cliente?.id && <> · cliente {String(cliente.id).slice(0, 8)}</>}
          {cliente?.lote && <> · lote {cliente.lote}</>}
          {' '}· documento gerado em {gerado_em}. Dados extraídos direto do sistema, sem edição.
        </div>

      </div>
    </div>
  )
}
