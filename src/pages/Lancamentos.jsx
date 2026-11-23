import { useMemo, useState } from 'react'
import { useApp } from '../store'
import { supabase, erroMsg } from '../supabase'
import { atrasado, brl, dataBR, mesISO, statusLabel } from '../lib'
import { SeletorMes } from './Dashboard'
import NovoLancamento from '../components/NovoLancamento'
import Acoes from '../components/Acoes'

export default function Lancamentos({ abrirNovo }) {
  const app = useApp()
  const [mes, setMes] = useState(mesISO())
  const [tipo, setTipo] = useState('todos')
  const [status, setStatus] = useState('todos')
  const [categoria, setCategoria] = useState('')
  const [forma, setForma] = useState('todas')
  const [busca, setBusca] = useState('')
  const [editar, setEditar] = useState(null)

  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase()
    return app.lancamentos
      .filter(app.filtra)
      .filter((l) => l.data.startsWith(mes))
      .filter((l) => tipo === 'todos' || l.tipo === tipo)
      .filter((l) => status === 'todos' || (status === 'atrasado' ? atrasado(l) : l.status === status))
      .filter((l) => !categoria || l.categoria_id === categoria)
      .filter((l) => forma === 'todas' || (forma === 'cartao' ? !!l.cartao_id : !l.cartao_id))
      .filter((l) => !b || l.descricao.toLowerCase().includes(b))
      .sort((a, b2) => a.data.localeCompare(b2.data) || a.created_at.localeCompare(b2.created_at))
  }, [app.lancamentos, app.filtra, mes, tipo, status, categoria, forma, busca])

  const soma = (t) => lista.filter((l) => l.tipo === t).reduce((s, l) => s + Number(l.valor), 0)

  async function concluir(l, e) {
    e.stopPropagation()
    const novo = l.status === 'concluido' ? 'pendente' : 'concluido'
    const { error } = await supabase.from('lancamentos').update({ status: novo }).eq('id', l.id)
    if (error) return app.avisar(erroMsg(error), 'erro')
    await app.carregar()
    app.avisar(novo === 'concluido' ? (l.tipo === 'receita' ? 'Marcado como recebido' : 'Marcado como pago') : 'Voltou para pendente')
  }

  const limpar = () => { setTipo('todos'); setStatus('todos'); setCategoria(''); setForma('todas'); setBusca('') }
  const temFiltro = tipo !== 'todos' || status !== 'todos' || categoria || forma !== 'todas' || busca

  return (
    <div className="pagina">
      <SeletorMes mes={mes} setMes={setMes} />

      <div className="filtros card">
        <input placeholder="Buscar descrição…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="todos">Receitas e despesas</option>
          <option value="receita">Só receitas</option>
          <option value="despesa">Só despesas</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="todos">Todos os status</option>
          <option value="pendente">Pendente</option>
          <option value="agendado">Agendado</option>
          <option value="concluido">Pago / Recebido</option>
          <option value="atrasado">Atrasado</option>
        </select>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Todas as categorias</option>
          {app.categorias.map((c) => <option key={c.id} value={c.id}>{c.nome} ({c.tipo})</option>)}
        </select>
        <select value={forma} onChange={(e) => setForma(e.target.value)}>
          <option value="todas">Conta e cartão</option>
          <option value="conta">Só conta</option>
          <option value="cartao">Só cartão</option>
        </select>
        {temFiltro && <button className="link" onClick={limpar}>Limpar filtros</button>}
      </div>

      <div className="totais">
        <span>Receitas <b className="txt-verde">{brl(soma('receita'))}</b></span>
        <span>Despesas <b className="txt-vermelho">{brl(soma('despesa'))}</b></span>
        <span>Saldo <b>{brl(soma('receita') - soma('despesa'))}</b></span>
      </div>

      <div className="botoes-novo">
        <button className="btn receita" onClick={() => abrirNovo('receita')}>+ Receita</button>
        <button className="btn despesa" onClick={() => abrirNovo('despesa')}>+ Despesa</button>
      </div>

      {lista.length === 0 ? (
        <div className="card vazio">Nenhum lançamento {temFiltro ? 'com esses filtros' : 'neste mês'}.</div>
      ) : (
        <ul className="card lista lancs">
          {lista.map((l) => {
            const c = app.cat(l.categoria_id)
            const atr = atrasado(l)
            return (
              <li key={l.id} onClick={() => setEditar(l)}>
                <span className="cat-ic" style={{ background: (c?.cor || '#64748b') + '26', color: c?.cor || '#94a3b8' }}>{l.tipo === 'receita' ? '↑' : '↓'}</span>
                <div className="info">
                  <b>{l.descricao}{l.parcela_total > 1 && <small className="parc"> {l.parcela_num}/{l.parcela_total}</small>}</b>
                  <small>
                    {dataBR(l.data)} · {c?.nome || 'Sem categoria'} · <i className="dot" style={{ background: app.corMembro(l.user_id) }} />{app.nomeMembro(l.user_id)}
                    {l.cartao_id ? ` · 💳 ${app.cartao(l.cartao_id)?.nome || ''}` : l.conta_id ? ` · ${app.conta(l.conta_id)?.nome || ''}` : ''}
                  </small>
                </div>
                <div className="dir">
                  <span className={l.tipo === 'receita' ? 'txt-verde' : 'txt-vermelho'}>{l.tipo === 'receita' ? '+' : '−'}{brl(l.valor)}</span>
                  {l.cartao_id && l.status !== 'concluido' ? (
                    <span className="badge st-fatura">Na fatura</span>
                  ) : (
                    <button className={'badge ' + (atr ? 'st-atrasado' : 'st-' + l.status)} onClick={(e) => concluir(l, e)} title="Clique para alternar pago/pendente">
                      {atr ? 'Atrasado' : statusLabel(l.status, l.tipo)}
                    </button>
                  )}
                </div>
                <Acoes editar={() => setEditar(l)} excluir={() => setEditar({ ...l, _x: true })} />
              </li>
            )
          })}
        </ul>
      )}
      {editar && <NovoLancamento editar={editar} fechar={() => setEditar(null)} />}
    </div>
  )
}
