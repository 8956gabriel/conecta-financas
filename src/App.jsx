import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { DataProvider, useApp } from './store'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Lancamentos from './pages/Lancamentos'
import Cartoes from './pages/Cartoes'
import Contas from './pages/Contas'
import Metas from './pages/Metas'
import Ajustes from './pages/Ajustes'
import NovoLancamento from './components/NovoLancamento'

export default function App() {
  const [session, setSession] = useState(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === 'PASSWORD_RECOVERY') location.hash = 'ajustes'
      setSession(s)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <div className="center"><div className="spinner" /></div>
  if (!session) return <Login />
  return (
    <DataProvider key={session.user.id} session={session}>
      <Shell />
    </DataProvider>
  )
}

const ABAS = [
  { id: 'inicio', nome: 'Início', icone: '◧' },
  { id: 'lancamentos', nome: 'Lançamentos', icone: '☰' },
  { id: 'cartoes', nome: 'Cartões', icone: '▭' },
  { id: 'contas', nome: 'Contas', icone: '◎' },
  { id: 'metas', nome: 'Metas', icone: '◆' },
  { id: 'ajustes', nome: 'Ajustes', icone: '⚙' },
]

function Shell() {
  const app = useApp()
  const [aba, setAba] = useState(() => location.hash.slice(1) || 'inicio')
  const [novo, setNovo] = useState(null)

  useEffect(() => { history.replaceState(null, '', '#' + aba) }, [aba])

  if (app.carregando) return <div className="center"><div className="spinner" /></div>
  if (app.erro)
    return (
      <div className="center col">
        <p className="erro">Erro ao carregar: {app.erro}</p>
        <button className="btn" onClick={app.carregar}>Tentar de novo</button>
      </div>
    )
  if (app.semCasal) return <Onboarding />

  const Pagina = { inicio: Dashboard, lancamentos: Lancamentos, cartoes: Cartoes, contas: Contas, metas: Metas, ajustes: Ajustes }[aba] || Dashboard

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><img src="/icon.svg" alt="" /> <span>Conecta Finanças</span></div>
        <nav>
          {ABAS.map((a) => (
            <button key={a.id} className={aba === a.id ? 'ativo' : ''} onClick={() => setAba(a.id)}>
              <span className="ic">{a.icone}</span>{a.nome}
            </button>
          ))}
        </nav>
        <div className="casal-tag">{app.casal?.nome}</div>
      </aside>

      <main className="conteudo">
        <header className="topo">
          <h1>{ABAS.find((a) => a.id === aba)?.nome}</h1>
          <div className="topo-acoes">
            <div className="seg visao" title="Visão">
              <button className={app.visao === 'casal' ? 'on' : ''} onClick={() => app.setVisao('casal')}>Casal</button>
              {app.membros.map((m) => (
                <button key={m.user_id} className={app.visao === m.user_id ? 'on' : ''} onClick={() => app.setVisao(m.user_id)}>
                  <i className="dot" style={{ background: m.cor }} />{m.user_id === app.uid ? 'Eu' : m.nome.split(' ')[0]}
                </button>
              ))}
            </div>
            <button className="btn primario so-desktop" onClick={() => setNovo('despesa')}>+ Novo lançamento</button>
          </div>
        </header>
        <Pagina abrirNovo={setNovo} irPara={setAba} />
      </main>

      <nav className="tabbar">
        {ABAS.filter((a) => a.id !== 'metas').map((a) => (
          <button key={a.id} className={aba === a.id ? 'ativo' : ''} onClick={() => setAba(a.id)}>
            <span className="ic">{a.icone}</span><small>{a.nome}</small>
          </button>
        ))}
      </nav>
      <button className="fab" onClick={() => setNovo('despesa')} aria-label="Novo lançamento">+</button>

      {novo && <NovoLancamento tipoInicial={novo} fechar={() => setNovo(null)} />}
      {app.toast && <div className={'toast ' + app.toast.tipo}>{app.toast.msg}</div>}
    </div>
  )
}
