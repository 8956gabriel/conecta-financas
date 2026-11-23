import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useApp } from '../store'
import { brl, hojeISO, mesISO, nomeMes, statusLabel, atrasado } from '../lib'
import { SeletorMes } from './Dashboard'
import NovoLancamento from '../components/NovoLancamento'
import Acoes from '../components/Acoes'

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const SEMANA_LONGA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

export default function Diario() {
  const app = useApp()
  const [mes, setMes] = useState(mesISO())
  const [dia, setDia] = useState(null) // 'YYYY-MM-DD' selecionado
  const [incluirCartao, setIncluirCartao] = useState(true)
  const [novo, setNovo] = useState(null)
  const [editar, setEditar] = useState(null)

  const [y, m] = mes.split('-').map(Number)
  const diasNoMes = new Date(y, m, 0).getDate()
  const hoje = hojeISO()

  // Despesas do mês: pela data do lançamento. Compras no cartão entram pela data da COMPRA (não do vencimento da fatura).
  const despesas = useMemo(() => {
    return app.lancamentos
      .filter(app.filtra)
      .filter((l) => l.tipo === 'despesa')
      .filter((l) => incluirCartao || !l.cartao_id)
      .map((l) => ({ ...l, dia: l.cartao_id ? dataCompra(l, app) : l.data }))
      .filter((l) => l.dia.startsWith(mes))
  }, [app, mes, incluirCartao])

  const porDia = useMemo(() => {
    const arr = Array.from({ length: diasNoMes }, (_, i) => {
      const d = `${mes}-${String(i + 1).padStart(2, '0')}`
      return { dia: i + 1, data: d, total: 0, itens: [] }
    })
    for (const l of despesas) {
      const i = Number(l.dia.slice(8, 10)) - 1
      if (arr[i]) { arr[i].total += Number(l.valor); arr[i].itens.push(l) }
    }
    return arr
  }, [despesas, diasNoMes, mes])

  const total = porDia.reduce((s, d) => s + d.total, 0)
  const ehMesAtual = mes === mesISO()
  const diasPassados = ehMesAtual ? Number(hoje.slice(8, 10)) : mes < mesISO() ? diasNoMes : 0
  const media = diasPassados ? porDia.slice(0, diasPassados).reduce((s, d) => s + d.total, 0) / diasPassados : 0
  const maior = porDia.reduce((a, d) => (d.total > a.total ? d : a), { total: 0 })
  const semGasto = porDia.slice(0, diasPassados).filter((d) => d.total === 0).length
  const projecao = ehMesAtual ? media * diasNoMes : null
  const max = Math.max(1, ...porDia.map((d) => d.total))

  // Gasto por dia da semana
  const semana = SEMANA.map((nome, i) => {
    const ds = porDia.slice(0, diasPassados || diasNoMes).filter((d) => new Date(d.data + 'T12:00').getDay() === i)
    const t = ds.reduce((s, d) => s + d.total, 0)
    return { nome, total: t, media: ds.length ? t / ds.length : 0 }
  })

  const primeiroDiaSemana = new Date(y, m - 1, 1).getDay()
  const selecionado = dia && porDia.find((d) => d.data === dia)
  const listaDias = (selecionado ? [selecionado] : [...porDia].reverse()).filter((d) => d.itens.length)

  function trocarMes(novoMes) { setMes(novoMes); setDia(null) }

  return (
    <div className="pagina">
      <SeletorMes mes={mes} setMes={trocarMes} />

      <div className="kpis">
        <div className="kpi vermelho"><span>Gasto no mês</span><b>{brl(total)}</b><small>{despesas.length} despesa(s)</small></div>
        <div className="kpi azul"><span>Média por dia</span><b>{brl(media)}</b><small>{diasPassados ? `em ${diasPassados} dia(s)` : 'mês ainda não começou'}</small></div>
        <div className="kpi roxo"><span>Dia que mais gastou</span><b>{maior.total ? brl(maior.total) : '—'}</b><small>{maior.total ? `dia ${maior.dia} (${SEMANA_LONGA[new Date(maior.data + 'T12:00').getDay()]})` : 'sem gastos'}</small></div>
        <div className="kpi verde">{projecao !== null ? <><span>Previsão do mês</span><b>{brl(projecao)}</b><small>{semGasto} dia(s) sem gastar</small></> : <><span>Dias sem gastar</span><b>{semGasto}</b><small>de {diasPassados} dia(s)</small></>}</div>
      </div>

      <div className="entre wrap">
        <label className="check pequeno-txt"><input type="checkbox" checked={incluirCartao} onChange={(e) => setIncluirCartao(e.target.checked)} /> Incluir compras no cartão (pela data da compra)</label>
        <button className="btn despesa" onClick={() => setNovo(dia || (ehMesAtual ? hoje : `${mes}-01`))}>+ Despesa {dia ? `no dia ${Number(dia.slice(8))}` : ''}</button>
      </div>

      <div className="grade">
        <section className="card">
          <h3>Calendário de {nomeMes(mes)}</h3>
          <div className="calendario">
            {SEMANA.map((s) => <span key={s} className="cab">{s}</span>)}
            {Array.from({ length: primeiroDiaSemana }, (_, i) => <span key={'v' + i} />)}
            {porDia.map((d) => {
              const intens = d.total / max
              const futuro = d.data > hoje
              return (
                <button key={d.data}
                  className={'dia' + (dia === d.data ? ' sel' : '') + (d.data === hoje ? ' hoje' : '') + (futuro ? ' futuro' : '')}
                  style={d.total ? { background: `rgba(244,63,94,${0.12 + intens * 0.6})` } : undefined}
                  onClick={() => setDia(dia === d.data ? null : d.data)}>
                  <span className="n">{d.dia}</span>
                  {d.total > 0 && <small>{d.total >= 1000 ? (d.total / 1000).toFixed(1).replace('.', ',') + 'k' : Math.round(d.total)}</small>}
                </button>
              )
            })}
          </div>
          <p className="dica">Quanto mais forte a cor, mais gastaram no dia. Toque num dia para ver os detalhes.</p>
        </section>

        <section className="card">
          <h3>Gasto dia a dia</h3>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={porDia} margin={{ left: -12, right: 4 }} onClick={(e) => e?.activePayload && setDia(e.activePayload[0].payload.data)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="dia" stroke="#64748b" fontSize={11} interval={diasNoMes > 20 ? 2 : 0} />
              <YAxis stroke="#64748b" fontSize={11} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
              <Tooltip formatter={(v) => brl(v)} labelFormatter={(d) => `Dia ${d}`} cursor={{ fill: '#ffffff08' }} contentStyle={{ background: '#111827', border: '1px solid #334155', borderRadius: 8 }} />
              {media > 0 && <ReferenceLine y={media} stroke="#0ea5e9" strokeDasharray="4 4" />}
              <Bar dataKey="total" name="Gasto" radius={[3, 3, 0, 0]}>
                {porDia.map((d) => <Cell key={d.data} fill={dia === d.data ? '#a78bfa' : '#f43f5e'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="dica">Linha azul tracejada = média por dia.</p>
          <div className="semana">
            {semana.map((s) => (
              <div key={s.nome}><small>{s.nome}</small><b>{brl(s.media).replace(',00', '')}</b></div>
            ))}
          </div>
          <p className="dica">Média gasta em cada dia da semana.</p>
        </section>
      </div>

      <section className="card">
        <div className="entre">
          <h3>{selecionado ? `Dia ${selecionado.dia} · ${SEMANA_LONGA[new Date(selecionado.data + 'T12:00').getDay()]}` : 'Despesas por dia'}</h3>
          {selecionado && <button className="link" onClick={() => setDia(null)}>Ver o mês todo</button>}
        </div>
        {listaDias.length === 0 ? (
          <p className="vazio">{selecionado ? 'Nenhuma despesa neste dia.' : 'Nenhuma despesa neste mês.'}</p>
        ) : (
          listaDias.map((d) => (
            <div key={d.data} className="grupo-dia">
              <div className="entre cab-dia">
                <b>{String(d.dia).padStart(2, '0')}/{mes.slice(5)} <small>{SEMANA_LONGA[new Date(d.data + 'T12:00').getDay()]}</small></b>
                <b className="txt-vermelho">{brl(d.total)}</b>
              </div>
              <ul className="lista">
                {d.itens.map((l) => {
                  const c = app.cat(l.categoria_id)
                  return (
                    <li key={l.id} onClick={() => setEditar(l)}>
                      <span className="cat-ic" style={{ background: (c?.cor || '#64748b') + '26', color: c?.cor || '#94a3b8' }}>↓</span>
                      <div className="info">
                        <b>{l.descricao}{l.parcela_total > 1 && <small className="parc"> {l.parcela_num}/{l.parcela_total}</small>}</b>
                        <small>{c?.nome || 'Sem categoria'} · <i className="dot" style={{ background: app.corMembro(l.user_id) }} />{app.nomeMembro(l.user_id)}{l.cartao_id ? ` · 💳 ${app.cartao(l.cartao_id)?.nome || ''}` : ''}</small>
                      </div>
                      <div className="dir">
                        <span className="txt-vermelho">{brl(l.valor)}</span>
                        {l.cartao_id && l.status !== 'concluido'
                          ? <span className="badge st-fatura">Na fatura</span>
                          : <span className={'badge ' + (atrasado(l) ? 'st-atrasado' : 'st-' + l.status)}>{atrasado(l) ? 'Atrasado' : statusLabel(l.status, l.tipo)}</span>}
                      </div>
                      <Acoes editar={() => setEditar(l)} excluir={() => setEditar({ ...l, _x: true })} />
                    </li>
                  )
                })}
              </ul>
            </div>
          ))
        )}
      </section>

      {novo && <NovoLancamento tipoInicial="despesa" dataInicial={novo} fechar={() => setNovo(null)} />}
      {editar && <NovoLancamento editar={editar} fechar={() => setEditar(null)} />}
    </div>
  )
}

// Data real da compra para lançamentos de cartão (parcelas aparecem no dia da compra, só no mês de cada parcela)
function dataCompra(l, app) {
  const c = app.comprasPorId?.[l.compra_id]
  if (!c) return l.data
  if (!l.parcela_total || l.parcela_total === 1) return c.data_compra
  // parcela N: mesmo dia da compra, N-1 meses depois
  const [y, m, d] = c.data_compra.split('-').map(Number)
  const ultimo = new Date(y, m - 1 + (l.parcela_num - 1) + 1, 0).getDate()
  const dt = new Date(y, m - 1 + (l.parcela_num - 1), Math.min(d, ultimo))
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
