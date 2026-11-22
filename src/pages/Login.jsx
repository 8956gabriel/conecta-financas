import { useState } from 'react'
import { supabase, erroMsg } from '../supabase'

export default function Login() {
  const [modo, setModo] = useState('entrar')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [msg, setMsg] = useState(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    setMsg(null)
    setEnviando(true)
    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
        if (error) throw error
      } else if (modo === 'cadastrar') {
        const { data, error } = await supabase.auth.signUp({
          email, password: senha, options: { emailRedirectTo: location.origin },
        })
        if (error) throw error
        if (!data.session) {
          setMsg({ ok: true, t: 'Cadastro feito! Enviamos um link de confirmação para ' + email + '. Abra o email, confirme e depois entre aqui.' })
          setModo('entrar')
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin })
        if (error) throw error
        setMsg({ ok: true, t: 'Se o email tiver cadastro, enviamos um link para criar uma nova senha.' })
      }
    } catch (err) {
      setMsg({ ok: false, t: erroMsg(err) })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="login">
      <div className="login-box">
        <img src="/icon.svg" alt="" className="logo" />
        <h1>Conecta Finanças</h1>
        <p className="sub">Controle financeiro do casal</p>
        <div className="card">
          {modo !== 'recuperar' && (
            <div className="seg full">
              <button className={modo === 'entrar' ? 'on' : ''} onClick={() => { setModo('entrar'); setMsg(null) }}>Entrar</button>
              <button className={modo === 'cadastrar' ? 'on' : ''} onClick={() => { setModo('cadastrar'); setMsg(null) }}>Cadastrar</button>
            </div>
          )}
          <form onSubmit={enviar} className="form">
            <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" autoComplete="email" /></label>
            {modo !== 'recuperar' && (
              <label>Senha<input type="password" required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Mínimo 6 caracteres" autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} /></label>
            )}
            {msg && <div className={msg.ok ? 'aviso ok' : 'aviso erro'}>{msg.t}</div>}
            <button className="btn primario grande" disabled={enviando}>
              {enviando ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : modo === 'cadastrar' ? 'Criar conta' : 'Enviar link'}
            </button>
          </form>
          {modo === 'entrar' && <button className="link" onClick={() => { setModo('recuperar'); setMsg(null) }}>Esqueci minha senha</button>}
          {modo === 'recuperar' && <button className="link" onClick={() => { setModo('entrar'); setMsg(null) }}>Voltar</button>}
        </div>
        <p className="rodape">Cada um entra com o próprio login. Os dados do casal ficam juntos e protegidos na nuvem.</p>
      </div>
    </div>
  )
}
