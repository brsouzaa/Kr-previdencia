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
    return <div style={{ padding: '3rem', textAlign: 'center', color: '#5F5E5A' }}>Acesso restrito à administração e ao financeiro.</div>
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 0 40px' }}>
      <Estilos />
      <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111', margin: '0 0 2px' }}>💵 Recebimentos de advogados</h2>
      <div style={{ fontSize: 13, color: '#5F5E5A', marginBottom: 14 }}>
        Conferência e validação dos pagamentos que entram. Saídas ficam em Despesas & Custos.
      </div>
      <div className="fin-wrap" style={{ padding: 0 }}>
        <Recebimentos />
      </div>
    </div>
  )
}
