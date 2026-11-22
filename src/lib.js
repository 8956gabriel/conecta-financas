export const brl = (v) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const hojeISO = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export const mesISO = (iso = hojeISO()) => iso.slice(0, 7) // "2026-11"

export const addMeses = (mes, n) => {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export const nomeMes = (mes) => {
  const [y, m] = mes.split('-').map(Number)
  return `${MESES[m - 1]} ${y}`
}
export const mesCurto = (mes) => {
  const [y, m] = mes.split('-').map(Number)
  return `${MESES_CURTOS[m - 1]}/${String(y).slice(2)}`
}

export const dataBR = (iso) => {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// Status padronizados
export const STATUS = ['pendente', 'agendado', 'concluido']
export const statusLabel = (status, tipo) =>
  status === 'concluido' ? (tipo === 'receita' ? 'Recebido' : 'Pago') : status === 'agendado' ? 'Agendado' : 'Pendente'

export const atrasado = (l) => l.status !== 'concluido' && l.data < hojeISO()

export const TIPOS_CONTA = { corrente: 'Conta corrente', poupanca: 'Poupança', carteira: 'Carteira', investimento: 'Investimento' }

export const CORES = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#10b981', '#14b8a6', '#0ea5e9', '#3b82f6', '#64748b']

export const num = (v) => {
  if (typeof v === 'number') return v
  const s = String(v || '').trim().replace(/\s|R\$/g, '')
  if (!s) return 0
  // aceita "1.234,56", "1234,56" e "1234.56"
  if (s.includes(',')) return Number(s.replace(/\./g, '').replace(',', '.')) || 0
  return Number(s) || 0
}
