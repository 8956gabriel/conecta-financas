import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { DataProvider, useApp } from './store'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Lancamentos from './pages/Lancamentos'
import Planilha from './pages/Planilha'
import Agenda, { AGENDAS, GERAL } from './pages/Agenda'
import Retrospectiva from './pages/Retrospectiva'
import Diario from './pages/Diario'
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

// Planilhas separadas (dados próprios), cada uma com seu botão
const PLANILHAS_EXTRA = [
  { id: 'planilha2', nome: 'Planilha 2', icone: '📒' },
  { id: 'planilha3', nome: 'Planilha 3', icone: '📗' },
  { id: 'planilha4', nome: 'Planilha 4', icone: '📙' },
]
const Planilha2 = (props) => <Planilha {...props} separada="planilha2" />
const Planilha3 = (props) => <Planilha {...props} separada="planilha3" />
const Planilha4 = (props) => <Planilha {...props} separada="planilha4" />
// Agendas (calendário): Prefeitura, Pessoal, Igreja — cada uma com seu botão
const AGENDAS_MENU = [['geral', GERAL], ...Object.entries(AGENDAS)].map(([k, a]) => ({ id: 'agenda-' + k, chave: k, ...a }))
const PAGINAS_AGENDA = Object.fromEntries(AGENDAS_MENU.map((a) => [a.id, (props) => <Agenda {...props} agenda={a.chave} />]))

const ABAS = [
  { id: 'inicio', nome: 'Início', icone: '◧' },
  { id: 'lancamentos', nome: 'Lançamentos', curto: 'Lançam.', icone: '☰' },
  { id: 'planilha', nome: 'Planilha', icone: '▤' },
  { id: 'diario', nome: 'Despesa diária', curto: 'Diário', icone: '▦' },
  { id: 'cartoes', nome: 'Cartões', icone: '▭' },
  { id: 'contas', nome: 'Contas', icone: '◎' },
  { id: 'metas', nome: 'Reservas e metas', curto: 'Metas', icone: '◆' },
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

  const Pagina = { ...PAGINAS_AGENDA, 'agenda-retro': Retrospectiva, planilha2: Planilha2, planilha3: Planilha3, planilha4: Planilha4, inicio: Dashboard, lancamentos: Lancamentos, planilha: Planilha, diario: Diario, cartoes: Cartoes, contas: Contas, metas: Metas, ajustes: Ajustes }[aba] || Dashboard

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
        {PLANILHAS_EXTRA.map((p) => (
          <button key={p.id} className={'planilha2-btn ' + p.id + (aba === p.id ? ' ativo' : '')} onClick={() => setAba(p.id)}>
            <span className="ic">{p.icone}</span><span>{p.nome.toUpperCase()}<small>Separada, com dados próprios</small></span>
          </button>
        ))}
        <div className="menu-titulo">Agendas</div>
        <div className="agenda-btns">
          {AGENDAS_MENU.map((a) => (
            <button key={a.id} className={'agenda-btn' + (aba === a.id ? ' ativo' : '')} style={{ '--c': a.cor }} onClick={() => setAba(a.id)}>
              <span>{a.icone}</span>{a.curto}
            </button>
          ))}
          <button className={'agenda-btn' + (aba === 'agenda-retro' ? ' ativo' : '')} style={{ '--c': '#10b981' }} onClick={() => setAba('agenda-retro')}>
            <span>📊</span>Retrosp.
          </button>
        </div>
        <a className="natal-btn" href="/carretinha.html"><span className="ic">🎄</span><span>CARRETINHA DE NATAL<small>Rifas, despesas e prestação de contas</small></span></a>
        <div className="casal-tag">{app.casal?.nome}</div>
      </aside>

      <main className="conteudo">
        <header className="topo">
          <h1>{aba === 'agenda-retro' ? 'Retrospectiva das agendas' : AGENDAS_MENU.find((a) => a.id === aba)?.nome || PLANILHAS_EXTRA.find((p) => p.id === aba)?.nome || ABAS.find((a) => a.id === aba)?.nome}</h1>
          <div className="topo-acoes">
            <div className="seg visao" title="Visão">
              <button className={app.visao === 'casal' ? 'on' : ''} onClick={() => app.setVisao('casal')}>Casal</button>
              {app.membros.map((m) => (
                <button key={m.user_id} className={app.visao === m.user_id ? 'on' : ''} onClick={() => app.setVisao(m.user_id)}>
                  <i className="dot" style={{ background: m.cor }} />{m.user_id === app.uid ? 'Eu' : m.nome.split(' ')[0]}
                </button>
              ))}
            </div>
            <div className="atalhos so-mobile">
              {PLANILHAS_EXTRA.map((p) => (
                <button key={p.id} className={'planilha2-chip ' + p.id + (aba === p.id ? ' ativo' : '')} onClick={() => setAba(p.id)}>{p.icone} {p.nome}</button>
              ))}
              {AGENDAS_MENU.map((a) => (
                <button key={a.id} className={'agenda-chip' + (aba === a.id ? ' ativo' : '')} style={{ '--c': a.cor }} onClick={() => setAba(a.id)}>{a.icone} {a.curto}</button>
              ))}
              <button className={'agenda-chip' + (aba === 'agenda-retro' ? ' ativo' : '')} style={{ '--c': '#10b981' }} onClick={() => setAba('agenda-retro')}>📊 Retrospectiva</button>
            </div>
            <a className="natal-chip so-mobile" href="/carretinha.html">🎄 Carretinha</a>
            <button className="btn primario so-desktop" onClick={() => setNovo('despesa')}>+ Novo lançamento</button>
          </div>
        </header>
        <Pagina abrirNovo={setNovo} irPara={setAba} />
        <footer className="credito">Desenvolvedor: Gabriel Oliveira</footer>
      </main>

      <nav className="tabbar">
        {ABAS.map((a) => (
          <button key={a.id} className={aba === a.id ? 'ativo' : ''} onClick={() => setAba(a.id)}>
            <span className="ic">{a.icone}</span><small>{a.curto || a.nome}</small>
          </button>
        ))}
      </nav>
      <button className="fab" onClick={() => setNovo('despesa')} aria-label="Novo lançamento">+</button>

      {novo && <NovoLancamento tipoInicial={novo} fechar={() => setNovo(null)} />}
      {app.toast && <div className={'toast ' + app.toast.tipo}>{app.toast.msg}</div>}
    </div>
  )
}
