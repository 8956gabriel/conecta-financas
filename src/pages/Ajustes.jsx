import { useState } from 'react'
import { useApp } from '../store'
import { supabase, erroMsg } from '../supabase'
import { CORES } from '../lib'

export default function Ajustes() {
  const app = useApp()
  const sozinho = app.membros.length < 2
  const [copiado, setCopiado] = useState(false)
  const link = `${location.origin}`
  const convite = `Vamos organizar nossas finanças juntos no Conecta Finanças! Crie sua conta em ${link} e use o código ${app.casal.codigo_convite} em "Tenho um código".`

  async function copiar() {
    try { await navigator.clipboard.writeText(convite); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch { /* ignore */ }
  }

  return (
    <div className="pagina grade">
      <section className="card">
        <h3>Casal</h3>
        <NomeCasal />
        <ul className="lista">
          {app.membros.map((m) => <li key={m.user_id} className="sem-click"><b><i className="dot" style={{ background: m.cor }} />{m.nome}</b><small>{m.user_id === app.uid ? 'você' : 'parceiro(a)'}</small></li>)}
        </ul>
        {sozinho ? (
          <div className="convite">
            <p>Convide seu par para entrar com o próprio login:</p>
            <div className="codigo-grande">{app.casal.codigo_convite}</div>
            <p className="dica">Ele(a) cria a conta em <b>{link.replace(/^https?:\/\//, '')}</b> e digita esse código em “Tenho um código”.</p>
            <div className="acoes">
              <button className="btn" onClick={copiar}>{copiado ? 'Copiado!' : 'Copiar convite'}</button>
              <a className="btn receita" href={`https://wa.me/?text=${encodeURIComponent(convite)}`} target="_blank" rel="noreferrer">Enviar pelo WhatsApp</a>
            </div>
          </div>
        ) : <p className="dica">O casal está completo. Cada um vê tudo do casal e pode filtrar a própria visão no topo.</p>}
      </section>

      <section className="card"><h3>Meu perfil</h3><Perfil /></section>
      <section className="card"><h3>Categorias</h3><Categorias /></section>
      <section className="card"><h3>Conta de acesso</h3><Senha /></section>
    </div>
  )
}

function NomeCasal() {
  const app = useApp()
  const [nome, setNome] = useState(app.casal.nome)
  async function salvar() {
    if (!nome.trim() || nome === app.casal.nome) return
    const { error } = await supabase.from('casais').update({ nome: nome.trim() }).eq('id', app.casal.id)
    if (error) return app.avisar(erroMsg(error), 'erro')
    await app.carregar(); app.avisar('Nome atualizado')
  }
  return <label className="form">Nome do casal<input value={nome} onChange={(e) => setNome(e.target.value)} onBlur={salvar} /></label>
}

function Perfil() {
  const app = useApp()
  const [nome, setNome] = useState(app.membro.nome)
  const [cor, setCor] = useState(app.membro.cor)
  async function salvar() {
    const { error } = await supabase.from('membros').update({ nome: nome.trim() || app.membro.nome, cor }).eq('user_id', app.uid)
    if (error) return app.avisar(erroMsg(error), 'erro')
    await app.carregar(); app.avisar('Perfil salvo')
  }
  return (
    <div className="form">
      <label>Meu nome<input value={nome} onChange={(e) => setNome(e.target.value)} /></label>
      <div><span className="rotulo">Minha cor</span><div className="cores">{CORES.map((c) => <button type="button" key={c} className={cor === c ? 'on' : ''} style={{ background: c }} onClick={() => setCor(c)} aria-label={c} />)}</div></div>
      <div className="acoes"><span className="flex1" /><button className="btn primario" onClick={salvar}>Salvar perfil</button></div>
    </div>
  )
}

function Categorias() {
  const app = useApp()
  const [tipo, setTipo] = useState('despesa')
  const [nome, setNome] = useState('')
  const [cor, setCor] = useState(CORES[0])
  const lista = app.categorias.filter((c) => c.tipo === tipo)
  const [ed, setEd] = useState(null) // { id, nome, cor }
  async function salvarEd(e) {
    e.preventDefault()
    if (!ed.nome.trim()) return
    const { error } = await supabase.from('categorias').update({ nome: ed.nome.trim(), cor: ed.cor }).eq('id', ed.id)
    if (error) return app.avisar(erroMsg(error), 'erro')
    setEd(null); await app.carregar(); app.avisar('Categoria atualizada')
  }
  async function add(e) {
    e.preventDefault()
    if (!nome.trim()) return
    const { error } = await supabase.from('categorias').insert({ casal_id: app.casal.id, nome: nome.trim(), tipo, cor })
    if (error) return app.avisar(erroMsg(error), 'erro')
    setNome(''); await app.carregar()
  }
  async function remover(c) {
    if (!confirmarRemocao(c)) return
    const { error } = await supabase.from('categorias').delete().eq('id', c.id)
    if (error) return app.avisar(erroMsg(error), 'erro')
    await app.carregar(); app.avisar('Categoria removida')
  }
  const [aRemover, setARemover] = useState(null)
  function confirmarRemocao(c) {
    if (aRemover === c.id) return true
    setARemover(c.id); setTimeout(() => setARemover(null), 3000); return false
  }
  return (
    <div className="form">
      <div className="seg full"><button className={tipo === 'despesa' ? 'on' : ''} onClick={() => setTipo('despesa')}>Despesas</button><button className={tipo === 'receita' ? 'on' : ''} onClick={() => setTipo('receita')}>Receitas</button></div>
      <ul className="chips">
        {lista.map((c) => (
          <li key={c.id} style={{ borderColor: c.cor }}>
            <span className="clicavel" onClick={() => setEd({ id: c.id, nome: c.nome, cor: c.cor })} title="Editar"><i className="dot" style={{ background: c.cor }} />{c.nome}</span>
            <button onClick={() => setEd({ id: c.id, nome: c.nome, cor: c.cor })} title="Editar">✎</button>
            <button onClick={() => remover(c)} title="Remover">{aRemover === c.id ? 'confirmar?' : '×'}</button>
          </li>
        ))}
      </ul>
      {ed && (
        <form className="linha-add" onSubmit={salvarEd}>
          <input value={ed.nome} onChange={(e) => setEd({ ...ed, nome: e.target.value })} autoFocus />
          <input type="color" value={ed.cor} onChange={(e) => setEd({ ...ed, cor: e.target.value })} aria-label="Cor" />
          <button className="btn primario">Salvar</button>
          <button type="button" className="btn" onClick={() => setEd(null)}>Cancelar</button>
        </form>
      )}
      <p className="dica">Toque no nome de uma categoria para editar.</p>
      <form className="linha-add" onSubmit={add}>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nova categoria" />
        <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} aria-label="Cor" />
        <button className="btn">Adicionar</button>
      </form>
    </div>
  )
}

function Senha() {
  const app = useApp()
  const [senha, setSenha] = useState('')
  const [msg, setMsg] = useState(null)
  async function trocar(e) {
    e.preventDefault()
    const { error } = await supabase.auth.updateUser({ password: senha })
    setMsg(error ? { ok: false, t: erroMsg(error) } : { ok: true, t: 'Senha alterada.' })
    if (!error) setSenha('')
  }
  return (
    <form className="form" onSubmit={trocar}>
      <p className="dica">Logado como {app.session.user.email}</p>
      <label>Nova senha<input type="password" minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Mínimo 6 caracteres" autoComplete="new-password" /></label>
      {msg && <div className={'aviso ' + (msg.ok ? 'ok' : 'erro')}>{msg.t}</div>}
      <div className="acoes"><button type="button" className="btn perigo" onClick={() => supabase.auth.signOut()}>Sair</button><span className="flex1" /><button className="btn" disabled={senha.length < 6}>Alterar senha</button></div>
    </form>
  )
}
