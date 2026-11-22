import { useState } from 'react'
import { supabase, erroMsg } from '../supabase'
import { useApp } from '../store'

export default function Onboarding() {
  const app = useApp()
  const [modo, setModo] = useState('criar')
  const [nome, setNome] = useState('')
  const [nomeCasal, setNomeCasal] = useState('')
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    const { error } =
      modo === 'criar'
        ? await supabase.rpc('criar_casal', { p_nome_casal: nomeCasal.trim(), p_meu_nome: nome.trim() })
        : await supabase.rpc('entrar_casal', { p_codigo: codigo.trim(), p_meu_nome: nome.trim() })
    setEnviando(false)
    if (error) return setErro(erroMsg(error))
    app.carregar()
  }

  return (
    <div className="login">
      <div className="login-box">
        <img src="/icon.svg" alt="" className="logo" />
        <h1>Bem-vindo(a)!</h1>
        <p className="sub">Logado como {app.session.user.email}</p>
        <div className="card">
          <div className="seg full">
            <button className={modo === 'criar' ? 'on' : ''} onClick={() => setModo('criar')}>Criar nosso casal</button>
            <button className={modo === 'entrar' ? 'on' : ''} onClick={() => setModo('entrar')}>Tenho um código</button>
          </div>
          <form onSubmit={enviar} className="form">
            <label>Seu nome<input required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Gabriel" /></label>
            {modo === 'criar' ? (
              <label>Nome do casal<input required value={nomeCasal} onChange={(e) => setNomeCasal(e.target.value)} placeholder="Ex.: Gabriel & Ana" /></label>
            ) : (
              <label>Código de convite<input required value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="Ex.: A1B2C3" maxLength={6} className="codigo" /></label>
            )}
            <p className="dica">
              {modo === 'criar'
                ? 'Depois de criar, você recebe um código para convidar seu par (em Ajustes).'
                : 'Peça o código para quem criou o casal. Ele aparece em Ajustes.'}
            </p>
            {erro && <div className="aviso erro">{erro}</div>}
            <button className="btn primario grande" disabled={enviando}>{enviando ? 'Aguarde…' : 'Continuar'}</button>
          </form>
          <button className="link" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </div>
    </div>
  )
}
