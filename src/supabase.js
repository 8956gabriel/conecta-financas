import { createClient } from '@supabase/supabase-js'

// A chave "anon" é pública por definição: a segurança vem das regras RLS do banco.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://fclpcdtnmlpjfgovubra.supabase.co'
const key =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjbHBjZHRubWxwamZnb3Z1YnJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyODM3NDUsImV4cCI6MjEwMDg1OTc0NX0.SYo7qhk2Dg33AQO1Rcpm8H6RbJ5ieZGLQR1hcUU16-A'

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'conecta-financas-auth' },
})

export function erroMsg(e) {
  const m = e?.message || String(e)
  if (/Invalid login credentials/i.test(m)) return 'Email ou senha incorretos.'
  if (/Email not confirmed/i.test(m)) return 'Confirme seu email antes de entrar (veja sua caixa de entrada).'
  if (/User already registered/i.test(m)) return 'Este email já tem cadastro. Use "Entrar".'
  if (/Password should be at least/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.'
  if (/rate limit/i.test(m)) return 'Muitas tentativas seguidas. Aguarde alguns minutos.'
  if (/Failed to fetch/i.test(m)) return 'Sem conexão com o servidor. Verifique sua internet.'
  return m
}
