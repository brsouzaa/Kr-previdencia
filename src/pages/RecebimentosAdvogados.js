import { useAuth } from '../lib/AuthContext'
import { Recebimentos, Estilos } from './Financeiro'

// ============================================================
// RECEBIMENTOS — a ENTRADA (pagamentos de advogados)
//   Separada da operação de saída (Despesas & Custos).
// ============================================================

export default function RecebimentosAdvogados() {
  const { profile } = useAuth()
  const podeVer = profile && ['admin', 'financeiro'].includes(profile.role)

  if (!podeVer) {
    return <div style={{ padding: '3rem', textAlign: 'center', color: '#8b9bb4' }}>Acesso restrito à administração e ao financeiro.</div>
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 0 40px' }}>
      <Estilos />
      <h2 style={{ fontSize: 22, fontWeight: 700, color: '#e6edf7', margin: '0 0 2px' }}>💵 Recebimentos de advogados</h2>
      <div style={{ fontSize: 13, color: '#8b9bb4', marginBottom: 14 }}>
        Conferência e validação dos pagamentos que entram. Saídas ficam em Despesas & Custos.
      </div>
      <div className="fin-wrap" style={{ padding: 0 }}>
        <Recebimentos />
      </div>
    </div>
  )
}
