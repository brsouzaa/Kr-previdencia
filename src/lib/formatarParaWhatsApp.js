// Gera texto formatado pra colar no WhatsApp do advogado.
// Inclui dados do cliente + campos extras do produto + links das imagens.
//
// cliente: registro completo da tabela 'clientes' (com profiles do vendedor já joinado)
// vendedorNome: string (nome do vendedor-operador que cadastrou)
// Retorna: string formatada com asteriscos pra negrito do WhatsApp

export default function formatarParaWhatsApp(cliente, vendedorNome) {
  const docs = cliente.documentos || {}

  const linhas = []

  linhas.push('*Contratos*')
  linhas.push('*Resposta*')
  linhas.push('*Solicitação de contrato*')
  linhas.push(`*Nome do Vendedor:* ${(vendedorNome || '—').toUpperCase()}`)
  linhas.push(`*Nome completo do cliente:* ${cliente.nome || ''}`)
  linhas.push(`*CPF:* ${cliente.cpf || ''}`)
  linhas.push(`*RG:* ${cliente.rg || ''}`)
  linhas.push(`*Endereço:* ${cliente.rua || ''}, ${cliente.numero || ''} / Bairro ${cliente.bairro || ''}`)
  linhas.push(`*Cidade:* ${cliente.cidade || ''} / ${cliente.uf || ''}`)
  linhas.push(`*CEP:* ${cliente.cep || ''}`)

  // Campos extras só aparecem se forem do produto Maternidade
  if (cliente.produto === 'Maternidade') {
    if (cliente.data_prevista_parto) {
      // Formata YYYY-MM-DD pra DD/MM/YYYY
      const partes = cliente.data_prevista_parto.split('-')
      const formatado = partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : cliente.data_prevista_parto
      linhas.push(`*Data prevista do parto:* ${formatado}`)
    }
    if (cliente.nis) linhas.push(`*Número do Nis:* ${cliente.nis}`)
  }

  linhas.push(`*Telefone:* ${cliente.telefone || ''}`)

  if (cliente.produto === 'Maternidade' && cliente.meses_gravidez) {
    linhas.push(`*Está grávida de quantos meses?:* ${cliente.meses_gravidez}`)
  }

  // Produto (se não for Maternidade)
  if (cliente.produto && cliente.produto !== 'Maternidade') {
    const nomeProduto = cliente.produto === 'Auxilio Acidente' ? 'Auxílio Acidente' : cliente.produto
    linhas.push(`*Produto:* ${nomeProduto}`)
  }

  // Observação
  if (cliente.observacao) {
    linhas.push(`*Observação:* ${cliente.observacao}`)
  }

  // Documentos
  linhas.push('')
  linhas.push('*📎 Documentos anexados:*')

  if (docs.rg_frente) {
    linhas.push('*Frente RG:*')
    linhas.push(docs.rg_frente)
  }
  if (docs.rg_verso) {
    linhas.push('*Verso RG:*')
    linhas.push(docs.rg_verso)
  }
  if (docs.comprovante_endereco) {
    linhas.push('*Comprovante de endereço:*')
    linhas.push(docs.comprovante_endereco)
  }
  if (docs.comprovante_1) {
    linhas.push('*Comprovante 1:*')
    linhas.push(docs.comprovante_1)
  }
  if (docs.comprovante_2) {
    linhas.push('*Comprovante 2:*')
    linhas.push(docs.comprovante_2)
  }

  return linhas.join('\n')
}
