import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export function DataProvider({ session, children }) {
  const uid = session.user.id
  const [estado, setEstado] = useState({ carregando: true })
  const [visao, setVisao] = useState(() => localStorage.getItem('cf-visao') || 'casal') // 'casal' | user_id
  const [toast, setToast] = useState(null)

  const carregar = useCallback(async () => {
    const { data: membro, error } = await supabase.from('membros').select('*').eq('user_id', uid).maybeSingle()
    if (error) return setEstado({ carregando: false, erro: error.message })
    if (!membro) return setEstado({ carregando: false, semCasal: true })

    const [casal, membros, contas, cartoes, categorias, lancamentos, metas, movimentos] = await Promise.all([
      supabase.from('casais').select('*').eq('id', membro.casal_id).single(),
      supabase.from('membros').select('*').order('created_at'),
      supabase.from('contas').select('*').order('created_at'),
      supabase.from('cartoes').select('*').order('created_at'),
      supabase.from('categorias').select('*').order('nome'),
      supabase.from('lancamentos').select('*').order('data', { ascending: false }).limit(10000),
      supabase.from('metas').select('*').order('created_at'),
      supabase.from('metas_movimentos').select('*').order('data', { ascending: false }).order('created_at', { ascending: false }).limit(5000),
    ])
    const err = [casal, membros, contas, cartoes, categorias, lancamentos, metas, movimentos].find((r) => r.error)
    if (err) return setEstado({ carregando: false, erro: err.error.message })
    setEstado({
      carregando: false,
      membro,
      casal: casal.data,
      membros: membros.data,
      contas: contas.data,
      cartoes: cartoes.data,
      categorias: categorias.data,
      lancamentos: lancamentos.data,
      metas: metas.data,
      movimentos: movimentos.data,
    })
  }, [uid])

  useEffect(() => { carregar() }, [carregar])

  // Atualiza em tempo real quando o(a) parceiro(a) lança algo (recarrega ao voltar para a aba)
  useEffect(() => {
    const f = () => document.visibilityState === 'visible' && carregar()
    document.addEventListener('visibilitychange', f)
    return () => document.removeEventListener('visibilitychange', f)
  }, [carregar])

  useEffect(() => { localStorage.setItem('cf-visao', visao) }, [visao])

  const avisar = useCallback((msg, tipo = 'ok') => {
    const id = Date.now() + Math.random()
    setToast({ msg, tipo, id })
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 3000)
  }, [])

  const valor = useMemo(() => {
    const membros = estado.membros || []
    const visaoValida = visao === 'casal' || membros.some((m) => m.user_id === visao) ? visao : 'casal'
    const filtra = (l) => visaoValida === 'casal' || l.user_id === visaoValida
    const nomeMembro = (id) => membros.find((m) => m.user_id === id)?.nome || '—'
    const corMembro = (id) => membros.find((m) => m.user_id === id)?.cor || '#64748b'
    const cat = (id) => (estado.categorias || []).find((c) => c.id === id)
    const conta = (id) => (estado.contas || []).find((c) => c.id === id)
    const cartao = (id) => (estado.cartoes || []).find((c) => c.id === id)
    return {
      ...estado, uid, session, carregar, visao: visaoValida, setVisao, filtra,
      nomeMembro, corMembro, cat, conta, cartao, avisar, toast,
    }
  }, [estado, uid, session, carregar, visao, avisar, toast])

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

// Cálculos compartilhados
export function saldoConta(conta, lancamentos) {
  let s = Number(conta.saldo_inicial) || 0
  for (const l of lancamentos) {
    if (l.conta_id !== conta.id || l.status !== 'concluido') continue
    s += l.tipo === 'receita' ? Number(l.valor) : -Number(l.valor)
  }
  return s
}

// Média de despesas dos últimos 3 meses completos (base para a reserva de emergência)
export function mediaDespesasMensal(lancamentos) {
  const hoje = new Date()
  const meses = [1, 2, 3].map((i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const totais = meses.map((m) => lancamentos.filter((l) => l.tipo === 'despesa' && l.data.startsWith(m)).reduce((s, l) => s + Number(l.valor), 0))
  const comDados = totais.filter((t) => t > 0)
  if (comDados.length) return comDados.reduce((a, b) => a + b, 0) / comDados.length
  // sem histórico: usa o mês atual
  const atual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
  return lancamentos.filter((l) => l.tipo === 'despesa' && l.data.startsWith(atual)).reduce((s, l) => s + Number(l.valor), 0)
}

export function usoCartao(cartao, lancamentos) {
  return lancamentos
    .filter((l) => l.cartao_id === cartao.id && l.status !== 'concluido')
    .reduce((a, l) => a + Number(l.valor), 0)
}

export function faturasDoCartao(cartao, lancamentos) {
  const mapa = {}
  for (const l of lancamentos) {
    if (l.cartao_id !== cartao.id || !l.fatura_ref) continue
    const k = l.fatura_ref.slice(0, 7)
    mapa[k] ||= { mes: k, total: 0, aberto: 0, itens: [], vencimento: l.data }
    mapa[k].total += Number(l.valor)
    if (l.status !== 'concluido') mapa[k].aberto += Number(l.valor)
    mapa[k].itens.push(l)
  }
  return Object.values(mapa).sort((a, b) => a.mes.localeCompare(b.mes))
}
