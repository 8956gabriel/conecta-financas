import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../store'
import { supabase, erroMsg } from '../supabase'
import { dataBR, hojeISO, mesISO, nomeMes } from '../lib'
import { SeletorMes } from './Dashboard'
import Modal from '../components/Modal'
import Acoes from '../components/Acoes'

// Modelos de agenda: cada um com suas categorias sugeridas
export const AGENDAS = {
  prefeitura: { nome: 'Agenda Prefeitura', curto: 'Prefeitura', icone: '🏛️', cor: '#0ea5e9',
    categorias: ['Reunião', 'Atendimento', 'Visita', 'Documento / ofício', 'Evento', 'Prazo', 'Ligação', 'Outro'] },
  pessoal: { nome: 'Agenda Pessoal', curto: 'Pessoal', icone: '👤', cor: '#8b5cf6',
    categorias: ['Compromisso', 'Tarefa', 'Saúde', 'Estudo / faculdade', 'Família', 'Pagamento', 'Lazer', 'Outro'] },
  igreja: { nome: 'Agenda Igreja', curto: 'Igreja', icone: '⛪', cor: '#f59e0b',
    categorias: ['Missa / celebração', 'Pascom', 'Reunião de pastoral', 'Evento', 'Ensaio', 'Formação', 'Visita', 'Outro'] },
}

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const SEMANA_LONGA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const hora = (h) => (h ? h.slice(0, 5) : '')
const diaSemana = (iso) => SEMANA_LONGA[new Date(iso + 'T12:00').getDay()]

export const GERAL = { nome: 'Agenda Geral', curto: 'Geral', icone: '🗓️', cor: '#6366f1',
  categorias: [...new Set(Object.values(AGENDAS).flatMap((a) => a.categorias))] }

export default function Agenda({ agenda, irPara }) {
  const app = useApp()
  const geral = agenda === 'geral'
  const modelo = geral ? GERAL : AGENDAS[agenda]
  const [itens, setItens] = useState(null)
  const [erroTab, setErroTab] = useState(null)
  const [mes, setMes] = useState(mesISO())
  const [dia, setDia] = useState(null)
  const [filtro, setFiltro] = useState('afazer') // afazer | feito | tudo
  const [editar, setEditar] = useState(null)
  const [excluir, setExcluir] = useState(null)
  const hoje = hojeISO()

  const carregar = useCallback(async () => {
    let q = supabase.from('agenda_itens').select('*')
    if (!geral) q = q.eq('agenda', agenda)
    const { data, error } = await q
      .order('data').order('hora', { nullsFirst: true }).order('created_at').limit(20000)
    if (error) { setErroTab(erroMsg(error)); setItens([]) } else { setErroTab(null); setItens(data) }
  }, [agenda, geral])
  useEffect(() => { setItens(null); setDia(null); carregar() }, [carregar])

  const [y, m] = mes.split('-').map(Number)
  const diasNoMes = new Date(y, m, 0).getDate()
  const primeiroDiaSemana = new Date(y, m - 1, 1).getDay()

  const doMes = useMemo(() => (itens || []).filter((i) => i.data.startsWith(mes)), [itens, mes])
  const porDia = useMemo(() => {
    const mapa = {}
    for (const i of doMes) (mapa[i.data] ||= []).push(i)
    return mapa
  }, [doMes])

  const kpi = useMemo(() => {
    const todos = itens || []
    const em7 = new Date(hoje + 'T12:00'); em7.setDate(em7.getDate() + 7)
    const lim = em7.toISOString().slice(0, 10)
    return {
      hoje: todos.filter((i) => i.data === hoje && i.status === 'pendente').length,
      semana: todos.filter((i) => i.data > hoje && i.data <= lim && i.status === 'pendente').length,
      atrasados: todos.filter((i) => i.data < hoje && i.status === 'pendente').length,
      feitosMes: doMes.filter((i) => i.status === 'feito').length,
    }
  }, [itens, doMes, hoje])

  const lista = useMemo(() => {
    const base = dia ? porDia[dia] || [] : doMes
    const f = base.filter((i) => filtro === 'tudo' || (filtro === 'feito' ? i.status === 'feito' : i.status === 'pendente'))
    const grupos = {}
    for (const i of f) (grupos[i.data] ||= []).push(i)
    return Object.entries(grupos).sort(([a], [b]) => a.localeCompare(b))
  }, [dia, porDia, doMes, filtro])

  const atrasadosLista = useMemo(
    () => (itens || []).filter((i) => i.data < hoje && i.status === 'pendente' && !i.data.startsWith(mes)),
    [itens, hoje, mes],
  )

  async function alternar(i) {
    const novo = i.status === 'feito' ? 'pendente' : 'feito'
    setItens((l) => l.map((x) => (x.id === i.id ? { ...x, status: novo } : x)))
    const { error } = await supabase.from('agenda_itens').update({ status: novo }).eq('id', i.id)
    if (error) { app.avisar(erroMsg(error), 'erro'); return carregar() }
    app.avisar(novo === 'feito' ? 'Marcado como feito ✔' : 'Voltou para a fazer')
  }

  async function confirmarExcluir() {
    const { error } = await supabase.from('agenda_itens').delete().eq('id', excluir.id)
    setExcluir(null)
    if (error) return app.avisar(erroMsg(error), 'erro')
    await carregar()
    app.avisar('Excluído')
  }

  if (itens === null) return <div className="center" style={{ minHeight: 200 }}><div className="spinner" /></div>
  if (erroTab) return (
    <div className="card aviso erro">
      A {modelo.nome} ainda não está pronta no banco de dados ({erroTab}). Rode o arquivo <b>supabase/011_agenda.sql</b> no SQL Editor do Supabase e recarregue.
      <div className="acoes" style={{ marginTop: 10 }}><button className="btn" onClick={carregar}>Tentar de novo</button></div>
    </div>
  )

  const Item = ({ i, comData }) => (
    <li className={'ag-item' + (i.status === 'feito' ? ' feito' : '') + (i.status === 'cancelado' ? ' cancelado' : '') + (i.data < hoje && i.status === 'pendente' ? ' atrasado' : '')}>
      <button className="ag-check" onClick={() => alternar(i)} title={i.status === 'feito' ? 'Marcar como a fazer' : 'Marcar como feito'} aria-label="Feito">
        {i.status === 'feito' ? '✔' : ''}
      </button>
      <div className="info" onClick={() => setEditar(i)}>
        <b>{i.hora && <span className="ag-hora">{hora(i.hora)}{i.hora_fim ? '–' + hora(i.hora_fim) : ''}</span>}{i.titulo}</b>
        <small>
          {comData && <span>📅 {dataBR(i.data)}</span>}
            {geral && <span className="ag-cat" style={{ borderColor: AGENDAS[i.agenda].cor + '66', color: AGENDAS[i.agenda].cor }}>{AGENDAS[i.agenda].icone} {AGENDAS[i.agenda].curto}</span>}
          {i.categoria && <span className="ag-cat" style={{ borderColor: (AGENDAS[i.agenda]?.cor || modelo.cor) + '66', color: AGENDAS[i.agenda]?.cor || modelo.cor }}>{i.categoria}</span>}
          {i.local && <span>📍 {i.local}</span>}
          {i.status === 'cancelado' && <span className="badge">Cancelado</span>}
          {i.data < hoje && i.status === 'pendente' && <span className="badge st-atrasado">Atrasado</span>}
        </small>
        {i.observacao && <small className="ag-obs">{i.observacao}</small>}
      </div>
      <Acoes editar={() => setEditar(i)} excluir={() => setExcluir(i)} />
    </li>
  )

  return (
    <div className="pagina">
      <p className="dica destaque" style={{ background: modelo.cor + '1a', color: '#e2e8f0' }}>
        {modelo.icone} <b>{modelo.nome}</b> — {geral ? 'tudo o que está marcado nas agendas Prefeitura, Pessoal e Igreja, num calendário só.' : 'programe o que vai fazer e marque ✔ o que já fez.'} Só você vê os itens da sua agenda.
        {irPara && <button className="link" style={{ margin: '0 0 0 8px' }} onClick={() => irPara('agenda-retro')}>📊 Ver retrospectiva</button>}
      </p>

      <div className="kpis">
        <div className="kpi azul"><span>Para hoje</span><b>{kpi.hoje}</b><small>{diaSemana(hoje)}, {dataBR(hoje).slice(0, 5)}</small></div>
        <div className="kpi roxo"><span>Próximos 7 dias</span><b>{kpi.semana}</b><small>a fazer</small></div>
        <div className="kpi vermelho"><span>Atrasados</span><b>{kpi.atrasados}</b><small>passou a data e não foi feito</small></div>
        <div className="kpi verde"><span>Feitos no mês</span><b>{kpi.feitosMes}</b><small>de {doMes.length} no mês</small></div>
      </div>

      <NovoItem agenda={agenda} modelo={modelo} dataInicial={dia || (mes === mesISO() ? hoje : `${mes}-01`)} aoSalvar={carregar} />

      <div className="grade">
        <section className="card">
          <div className="entre"><SeletorMes mes={mes} setMes={(x) => { setMes(x); setDia(null) }} /></div>
          <div className="calendario ag-cal" style={{ marginTop: 12 }}>
            {SEMANA.map((s) => <span key={s} className="cab">{s}</span>)}
            {Array.from({ length: primeiroDiaSemana }, (_, k) => <span key={'v' + k} />)}
            {Array.from({ length: diasNoMes }, (_, k) => {
              const d = `${mes}-${String(k + 1).padStart(2, '0')}`
              const its = porDia[d] || []
              const pend = its.filter((i) => i.status === 'pendente').length
              const feitos = its.filter((i) => i.status === 'feito').length
              return (
                <button key={d}
                  className={'dia' + (dia === d ? ' sel' : '') + (d === hoje ? ' hoje' : '') + (d < hoje && pend ? ' tem-atraso' : '')}
                  style={its.length ? { background: modelo.cor + (pend ? '33' : '1a') } : undefined}
                  onClick={() => setDia(dia === d ? null : d)}>
                  <span className="n">{k + 1}</span>
                  {geral && its.length > 0 && <span className="ag-pontos">{[...new Set(its.map((i) => i.agenda))].map((a) => <i key={a} style={{ background: AGENDAS[a].cor }} />)}</span>}
                  {its.length > 0 && <small>{pend ? `${pend} a fazer` : `✔ ${feitos}`}</small>}
                </button>
              )
            })}
          </div>
          <p className="dica">Toque num dia para ver e lançar compromissos nele. Dia com borda vermelha tem coisa atrasada.</p>
        </section>

        <section className="card">
          <div className="entre wrap">
            <h3 style={{ margin: 0 }}>{dia ? `${dataBR(dia).slice(0, 5)} · ${diaSemana(dia)}` : nomeMes(mes)}</h3>
            {dia && <button className="link" style={{ margin: 0 }} onClick={() => setDia(null)}>Ver o mês todo</button>}
          </div>
          <div className="seg full pequeno" style={{ margin: '10px 0' }}>
            <button className={filtro === 'afazer' ? 'on st-pendente' : ''} onClick={() => setFiltro('afazer')}>A fazer</button>
            <button className={filtro === 'feito' ? 'on st-concluido' : ''} onClick={() => setFiltro('feito')}>Feito</button>
            <button className={filtro === 'tudo' ? 'on' : ''} onClick={() => setFiltro('tudo')}>Tudo</button>
          </div>
          {lista.length === 0 ? (
            <p className="vazio">{filtro === 'feito' ? 'Nada marcado como feito aqui.' : filtro === 'afazer' ? 'Nada a fazer aqui. 🎉' : 'Nenhum compromisso.'}</p>
          ) : lista.map(([d, its]) => (
            <div key={d} className="grupo-dia">
              {!dia && <div className={'cab-dia' + (d === hoje ? ' ag-hoje' : '')}><b>{dataBR(d).slice(0, 5)} <small>{diaSemana(d)}{d === hoje ? ' · hoje' : ''}</small></b></div>}
              <ul className="lista ag-lista">{its.map((i) => <Item key={i.id} i={i} />)}</ul>
            </div>
          ))}
        </section>
      </div>

      {atrasadosLista.length > 0 && (
        <section className="card">
          <h3>⚠️ Atrasados de outros meses ({atrasadosLista.length})</h3>
          <ul className="lista ag-lista">
            {atrasadosLista.map((i) => <Item key={i.id} i={i} comData />)}
          </ul>
        </section>
      )}

      {editar && <EditarItem item={editar} modelo={modelo} fechar={() => setEditar(null)} aoSalvar={carregar} />}
      {excluir && (
        <Modal titulo="Excluir compromisso" fechar={() => setExcluir(null)}>
          <div className="confirma">
            <p>Excluir “{excluir.titulo}” de {dataBR(excluir.data)}? Não dá para desfazer.</p>
            <div className="acoes">
              <button className="btn perigo" onClick={confirmarExcluir}>Excluir</button>
              <button className="btn" onClick={() => setExcluir(null)}>Cancelar</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// Linha rápida para programar um compromisso
function NovoItem({ agenda, modelo, dataInicial, aoSalvar }) {
  const app = useApp()
  const geral = agenda === 'geral'
  const [qual, setQual] = useState('pessoal')
  const cats = geral ? AGENDAS[qual].categorias : modelo.categorias
  const [titulo, setTitulo] = useState('')
  const [data, setData] = useState(dataInicial)
  const [h, setH] = useState('')
  const [categoria, setCategoria] = useState('')
  const [local, setLocal] = useState('')
  const [obs, setObs] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [base, setBase] = useState(dataInicial)
  if (dataInicial !== base) { setBase(dataInicial); setData(dataInicial) }

  async function adicionar(e) {
    e.preventDefault()
    if (!titulo.trim()) return app.avisar('Escreva o que vai fazer.', 'erro')
    if (!data) return app.avisar('Informe a data.', 'erro')
    setSalvando(true)
    const { error } = await supabase.from('agenda_itens').insert({
      casal_id: app.casal.id, user_id: app.uid, agenda: geral ? qual : agenda, titulo: titulo.trim(), data, hora: h || null,
      categoria: categoria || null, local: local.trim() || null, observacao: obs.trim() || null,
      status: data < hojeISO() ? 'feito' : 'pendente',
    })
    setSalvando(false)
    if (error) return app.avisar(erroMsg(error), 'erro')
    await aoSalvar()
    app.avisar(data < hojeISO() ? 'Registrado como feito ✔' : 'Programado na agenda')
    setTitulo(''); setLocal(''); setObs(''); setH('')
  }

  return (
    <form className="card ag-novo" onSubmit={adicionar}>
      {geral && (
        <div className="seg ag-qual">
          {Object.entries(AGENDAS).map(([k, a]) => (
            <button type="button" key={k} className={qual === k ? 'on' : ''} style={qual === k ? { background: a.cor + '40' } : undefined} onClick={() => { setQual(k); setCategoria('') }}>{a.icone} {a.curto}</button>
          ))}
        </div>
      )}
      <input className="ag-titulo" placeholder={`O que vai fazer? (${cats[0].toLowerCase()}, …)`} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      <input type="date" value={data} onChange={(e) => setData(e.target.value)} aria-label="Data" />
      <input type="time" value={h} onChange={(e) => setH(e.target.value)} aria-label="Hora" />
      <select value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria">
        <option value="">Categoria…</option>
        {cats.map((c) => <option key={c}>{c}</option>)}
      </select>
      <input placeholder="Local" value={local} onChange={(e) => setLocal(e.target.value)} />
      <input placeholder="Observação" value={obs} onChange={(e) => setObs(e.target.value)} />
      <button className="btn primario" disabled={salvando}>{salvando ? 'Salvando…' : '+ Agendar'}</button>
      <p className="dica ag-dica">Data que já passou entra como <b>feito</b> — serve para registrar o que você já fez.</p>
    </form>
  )
}

function EditarItem({ item, modelo: _m, fechar, aoSalvar }) {
  const app = useApp()
  const modelo = AGENDAS[item.agenda] || _m
  const [f, setF] = useState({
    titulo: item.titulo, data: item.data, hora: hora(item.hora), hora_fim: hora(item.hora_fim),
    categoria: item.categoria || '', local: item.local || '', observacao: item.observacao || '', status: item.status,
  })
  const [erro, setErro] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const cats = modelo.categorias.includes(f.categoria) || !f.categoria ? modelo.categorias : [f.categoria, ...modelo.categorias]

  async function salvar(e) {
    e.preventDefault()
    if (!f.titulo.trim()) return setErro('Escreva o título.')
    setSalvando(true)
    const { error } = await supabase.from('agenda_itens').update({
      titulo: f.titulo.trim(), data: f.data, hora: f.hora || null, hora_fim: f.hora_fim || null,
      categoria: f.categoria || null, local: f.local.trim() || null, observacao: f.observacao.trim() || null, status: f.status,
    }).eq('id', item.id)
    setSalvando(false)
    if (error) return setErro(erroMsg(error))
    await aoSalvar()
    app.avisar('Compromisso atualizado')
    fechar()
  }

  return (
    <Modal titulo={`Editar · ${modelo.nome}`} fechar={fechar}>
      <form className="form" onSubmit={salvar}>
        <label>O que fazer<input value={f.titulo} onChange={set('titulo')} /></label>
        <label>Data<input type="date" value={f.data} onChange={set('data')} /></label>
        <div className="linha2">
          <label>Início<input type="time" value={f.hora} onChange={set('hora')} /></label>
          <label>Fim<input type="time" value={f.hora_fim} onChange={set('hora_fim')} /></label>
        </div>
        <label>Categoria
          <select value={f.categoria} onChange={set('categoria')}>
            <option value="">Sem categoria</option>
            {cats.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label>Local<input value={f.local} onChange={set('local')} /></label>
        <label>Observação<input value={f.observacao} onChange={set('observacao')} /></label>
        <div className="seg full">
          <button type="button" className={f.status === 'pendente' ? 'on st-pendente' : ''} onClick={() => setF((x) => ({ ...x, status: 'pendente' }))}>A fazer</button>
          <button type="button" className={f.status === 'feito' ? 'on st-concluido' : ''} onClick={() => setF((x) => ({ ...x, status: 'feito' }))}>Feito</button>
          <button type="button" className={f.status === 'cancelado' ? 'on' : ''} onClick={() => setF((x) => ({ ...x, status: 'cancelado' }))}>Cancelado</button>
        </div>
        {erro && <div className="aviso erro">{erro}</div>}
        <button className="btn primario grande" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
      </form>
    </Modal>
  )
}
