import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useApp, saldoConta, usoCartao, faturasDoCartao } from '../store'
import { addMeses, atrasado, brl, dataBR, hojeISO, mesCurto, mesISO, nomeMes, statusLabel } from '../lib'
import NovoLancamento from '../components/NovoLancamento'
import Acoes from '../components/Acoes'

export function SeletorMes({ mes, setMes }) {
  return (
    <div className="seletor-mes">
      <button onClick={() => setMes(addMeses(mes, -1))} aria-label="Mês anterior">‹</button>
      <span>{nomeMes(mes)}</span>
      <button onClick={() => setMes(addMeses(mes, 1))} aria-label="Próximo mês">›</button>
      {mes !== mesISO() && <button className="hoje" onClick={() => setMes(mesISO())}>Hoje</button>}
    </div>
  )
}

export default function Dashboard({ irPara }) {
  const app = useApp()
  const [mes, setMes] = useState(mesISO())
  const [editar, setEditar] = useState(null)

  const todos = useMemo(() => app.lancamentos.filter(app.filtra), [app.lancamentos, app.filtra])
  const doMes = todos.filter((l) => l.data.startsWith(mes))
  const rec = doMes.filter((l) => l.tipo === 'receita')
  const desp = doMes.filter((l) => l.tipo === 'despesa')
  const soma = (a) => a.reduce((s, l) => s + Number(l.valor), 0)
  const totRec = soma(rec), totDesp = soma(desp)
  const recebido = soma(rec.filter((l) => l.status === 'concluido'))
  const pago = soma(desp.filter((l) => l.status === 'concluido'))

  const contasVisiveis = app.contas.filter((c) => c.ativo && (app.visao === 'casal' || !c.dono_id || c.dono_id === app.visao))
  const saldoTotal = contasVisiveis.reduce((s, c) => s + saldoConta(c, app.lancamentos), 0)

  const porCategoria = useMemo(() => {
    const m = {}
    for (const l of desp) {
      const c = app.cat(l.categoria_id)
      const k = c?.nome || 'Sem categoria'
      m[k] ||= { nome: k, valor: 0, cor: c?.cor || '#64748b' }
      m[k].valor += Number(l.valor)
    }
    return Object.values(m).sort((a, b) => b.valor - a.valor)
  }, [desp, app])

  const historico = useMemo(() => {
    const arr = []
    for (let i = -5; i <= 0; i++) {
      const k = addMeses(mes, i)
      const ls = todos.filter((l) => l.data.startsWith(k))
      arr.push({ mes: mesCurto(k), Receitas: soma(ls.filter((l) => l.tipo === 'receita')), Despesas: soma(ls.filter((l) => l.tipo === 'despesa')) })
    }
    return arr
  }, [todos, mes])

  const porMembro = app.membros.map((m) => ({
    ...m,
    rec: soma(rec.filter((l) => l.user_id === m.user_id)),
    desp: soma(desp.filter((l) => l.user_id === m.user_id)),
  }))

  const hoje = hojeISO()
  const limite15 = new Date(Date.now() + 15 * 864e5).toISOString().slice(0, 10)
  const proximos = todos
    .filter((l) => l.status !== 'concluido' && !l.cartao_id && l.data <= limite15)
    .sort((a, b) => a.data.localeCompare(b.data))
    .slice(0, 8)

  const cartoesVis = app.cartoes.filter((c) => c.ativo && (app.visao === 'casal' || !c.dono_id || c.dono_id === app.visao))

  return (
    <div className="pagina">
      <SeletorMes mes={mes} setMes={setMes} />

      <div className="kpis">
        <div className="kpi verde"><span>Receitas</span><b>{brl(totRec)}</b><small>{brl(recebido)} recebido</small></div>
        <div className="kpi vermelho"><span>Despesas</span><b>{brl(totDesp)}</b><small>{brl(pago)} pago</small></div>
        <div className={'kpi ' + (totRec - totDesp >= 0 ? 'azul' : 'vermelho')}><span>Resultado do mês</span><b>{brl(totRec - totDesp)}</b><small>{totRec ? Math.round(((totRec - totDesp) / totRec) * 100) : 0}% da receita</small></div>
        <div className="kpi roxo" onClick={() => irPara('contas')} role="button"><span>Saldo nas contas</span><b>{brl(saldoTotal)}</b><small>{contasVisiveis.length} conta(s)</small></div>
      </div>

      <div className="grade">
        <section className="card">
          <h3>Despesas por categoria</h3>
          {porCategoria.length === 0 ? <p className="vazio">Nenhuma despesa neste mês.</p> : (
            <div className="pizza">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={porCategoria} dataKey="valor" nameKey="nome" innerRadius={55} outerRadius={90} paddingAngle={2} stroke="none">
                    {porCategoria.map((c) => <Cell key={c.nome} fill={c.cor} />)}
                  </Pie>
                  <Tooltip formatter={(v) => brl(v)} contentStyle={{ background: '#111827', border: '1px solid #334155', borderRadius: 8 }} itemStyle={{ color: '#e2e8f0' }} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="legenda">
                {porCategoria.map((c) => (
                  <li key={c.nome}><i className="dot" style={{ background: c.cor }} />{c.nome}<b>{brl(c.valor)}</b><small>{Math.round((c.valor / totDesp) * 100)}%</small></li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="card">
          <h3>Últimos 6 meses</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={historico} margin={{ left: -10, right: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="mes" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={11} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
              <Tooltip formatter={(v) => brl(v)} cursor={{ fill: '#ffffff08' }} contentStyle={{ background: '#111827', border: '1px solid #334155', borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Receitas" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Despesas" fill="#f43f5e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="card">
          <h3>Próximos vencimentos</h3>
          {proximos.length === 0 ? <p className="vazio">Nada pendente para os próximos 15 dias. 🎉</p> : (
            <ul className="lista">
              {proximos.map((l) => (
                <li key={l.id} onClick={() => setEditar(l)}>
                  <div><b>{l.descricao}</b><small>{dataBR(l.data)} · {app.nomeMembro(l.user_id)}</small></div>
                  <div className="dir">
                    <span className={l.tipo === 'receita' ? 'txt-verde' : 'txt-vermelho'}>{brl(l.valor)}</span>
                    <span className={'badge ' + (atrasado(l) ? 'st-atrasado' : 'st-' + l.status)}>{atrasado(l) ? 'Atrasado' : statusLabel(l.status, l.tipo)}</span>
                  </div>
                  <Acoes editar={() => setEditar(l)} excluir={() => setEditar({ ...l, _x: true })} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h3>Cartões</h3>
          {cartoesVis.length === 0 ? (
            <p className="vazio">Nenhum cartão. <button className="link" onClick={() => irPara('cartoes')}>Cadastrar</button></p>
          ) : (
            <ul className="lista">
              {cartoesVis.map((c) => {
                const uso = usoCartao(c, app.lancamentos)
                const fat = faturasDoCartao(c, app.lancamentos).find((f) => f.mes === mes)
                const pct = c.limite > 0 ? Math.min(100, (uso / c.limite) * 100) : 0
                return (
                  <li key={c.id} onClick={() => irPara('cartoes')}>
                    <div className="w100">
                      <div className="entre"><b><i className="dot" style={{ background: c.cor }} />{c.nome}</b><span>Fatura {mesCurto(mes)}: <b>{brl(fat?.total || 0)}</b></span></div>
                      <div className="barra"><i style={{ width: pct + '%', background: pct > 85 ? '#f43f5e' : c.cor }} /></div>
                      <small>{brl(uso)} usado de {brl(c.limite)} · disponível {brl(Math.max(0, c.limite - uso))}</small>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {app.visao === 'casal' && app.membros.length > 1 && (
          <section className="card">
            <h3>Quem gastou e quem recebeu</h3>
            <ul className="lista">
              {porMembro.map((m) => (
                <li key={m.user_id} className="sem-click">
                  <b><i className="dot" style={{ background: m.cor }} />{m.nome}</b>
                  <div className="dir"><span className="txt-verde">+{brl(m.rec)}</span><span className="txt-vermelho">−{brl(m.desp)}</span></div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {app.metas.length > 0 && (
          <section className="card">
            <h3>Reservas e metas · {brl(app.metas.reduce((s, m) => s + Number(m.valor_atual), 0))} guardados</h3>
            <ul className="lista">
              {[...app.metas].sort((a, b) => ({ reserva: 0, economia: 1, meta: 2 }[a.tipo] - { reserva: 0, economia: 1, meta: 2 }[b.tipo])).map((m) => {
                const pct = m.valor_alvo ? Math.min(100, (m.valor_atual / m.valor_alvo) * 100) : null
                return (
                  <li key={m.id} onClick={() => irPara('metas')}>
                    <div className="w100">
                      <div className="entre"><b>{m.icone} {m.nome}</b><span>{pct !== null ? Math.round(pct) + '%' : brl(m.valor_atual)}</span></div>
                      {pct !== null && <div className="barra"><i style={{ width: pct + '%', background: m.cor }} /></div>}
                      {pct !== null && <small>{brl(m.valor_atual)} de {brl(m.valor_alvo)}</small>}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </div>
      {hoje && editar && <NovoLancamento editar={editar} fechar={() => setEditar(null)} />}
    </div>
  )
}
