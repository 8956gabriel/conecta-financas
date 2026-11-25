import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../store'
import { supabase, erroMsg } from '../supabase'
import { dataBR, hojeISO, mesISO, nomeMes } from '../lib'
import { AGENDAS } from './Agenda'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

// Retrospectiva das agendas: o que foi feito em cada uma no período escolhido
export default function Retrospectiva({ irPara }) {
  const app = useApp()
  const [itens, setItens] = useState(null)
  const [erro, setErro] = useState(null)
  const hoje = hojeISO()
  const [modo, setModo] = useState('ano') // mes | ano | periodo
  const [mes, setMes] = useState(mesISO())
  const [ano, setAno] = useState(hoje.slice(0, 4))
  const [de, setDe] = useState(`${hoje.slice(0, 4)}-01-01`)
  const [ate, setAte] = useState(hoje)
  const [qual, setQual] = useState('todas')

  useEffect(() => {
    supabase.from('agenda_itens').select('*').order('data').order('hora', { nullsFirst: true }).limit(50000)
      .then(({ data, error }) => { if (error) { setErro(erroMsg(error)); setItens([]) } else setItens(data) })
  }, [])

  const [ini, fim, titulo] =
    modo === 'mes' ? [`${mes}-01`, `${mes}-31`, nomeMes(mes)]
      : modo === 'ano' ? [`${ano}-01-01`, `${ano}-12-31`, `Ano de ${ano}`]
        : [de, ate, `${dataBR(de)} a ${dataBR(ate)}`]

  const periodo = useMemo(() => (itens || []).filter((i) => i.data >= ini && i.data <= fim), [itens, ini, fim])
  const anos = useMemo(() => {
    const s = new Set((itens || []).map((i) => i.data.slice(0, 4))); s.add(hoje.slice(0, 4))
    return [...s].sort().reverse()
  }, [itens, hoje])

  const resumo = useMemo(() => {
    const chaves = qual === 'todas' ? Object.keys(AGENDAS) : [qual]
    return chaves.map((k) => {
      const its = periodo.filter((i) => i.agenda === k)
      const feitos = its.filter((i) => i.status === 'feito')
      const naoFeitos = its.filter((i) => i.status === 'pendente' && i.data < hoje)
      const aFazer = its.filter((i) => i.status === 'pendente' && i.data >= hoje)
      const cancel = its.filter((i) => i.status === 'cancelado')
      const cats = {}
      for (const i of feitos) cats[i.categoria || 'Sem categoria'] = (cats[i.categoria || 'Sem categoria'] || 0) + 1
      const porMes = {}
      for (const i of feitos) (porMes[i.data.slice(0, 7)] ||= []).push(i)
      const base = feitos.length + naoFeitos.length
      return {
        k, a: AGENDAS[k], total: its.length, feitos, naoFeitos, aFazer, cancel,
        pct: base ? Math.round((feitos.length / base) * 100) : 0,
        cats: Object.entries(cats).sort((x, y) => y[1] - x[1]),
        porMes: Object.entries(porMes).sort(([x], [y]) => x.localeCompare(y)),
      }
    })
  }, [periodo, qual, hoje])

  const totalFeitos = resumo.reduce((s, r) => s + r.feitos.length, 0)
  const totalNao = resumo.reduce((s, r) => s + r.naoFeitos.length, 0)
  const totalAFazer = resumo.reduce((s, r) => s + r.aFazer.length, 0)
  const mesDestaque = useMemo(() => {
    const c = {}
    for (const r of resumo) for (const [m, l] of r.porMes) c[m] = (c[m] || 0) + l.length
    const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0]
    return top ? { mes: top[0], n: top[1] } : null
  }, [resumo])

  function exportar() {
    const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`
    const cab = ['Agenda', 'Data', 'Hora', 'O que', 'Categoria', 'Local', 'Observação', 'Situação']
    const linhas = periodo.filter((i) => qual === 'todas' || i.agenda === qual).map((i) => [
      AGENDAS[i.agenda].curto, dataBR(i.data), i.hora?.slice(0, 5) || '', i.titulo, i.categoria || '', i.local || '', i.observacao || '',
      i.status === 'feito' ? 'Feito' : i.status === 'cancelado' ? 'Cancelado' : i.data < hoje ? 'Não feito' : 'A fazer',
    ])
    const csv = '﻿' + [cab, ...linhas].map((l) => l.map(q).join(';')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `retrospectiva-${ini}-a-${fim}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (itens === null) return <div className="center" style={{ minHeight: 200 }}><div className="spinner" /></div>
  if (erro) return <div className="card aviso erro">As agendas ainda não estão prontas no banco de dados ({erro}). Rode o arquivo <b>supabase/011_agenda.sql</b> no Supabase.</div>

  return (
    <div className="pagina retro">
      <div className="card filtros-retro sem-print">
        <div className="seg">
          <button className={modo === 'mes' ? 'on' : ''} onClick={() => setModo('mes')}>Mês</button>
          <button className={modo === 'ano' ? 'on' : ''} onClick={() => setModo('ano')}>Ano</button>
          <button className={modo === 'periodo' ? 'on' : ''} onClick={() => setModo('periodo')}>Período</button>
        </div>
        {modo === 'mes' && <input type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />}
        {modo === 'ano' && <select value={ano} onChange={(e) => setAno(e.target.value)}>{anos.map((a) => <option key={a}>{a}</option>)}</select>}
        {modo === 'periodo' && <><input type="date" value={de} onChange={(e) => setDe(e.target.value)} /><input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></>}
        <select value={qual} onChange={(e) => setQual(e.target.value)}>
          <option value="todas">Todas as agendas</option>
          {Object.entries(AGENDAS).map(([k, a]) => <option key={k} value={k}>{a.icone} {a.curto}</option>)}
        </select>
        <div className="acoes">
          <button className="btn" onClick={() => window.print()}>🖨 Imprimir / PDF</button>
          <button className="btn" onClick={exportar}>⬇ Excel/CSV</button>
        </div>
      </div>

      <section className="card retro-capa">
        <small>Retrospectiva · {app.membro?.nome}</small>
        <h2>{titulo}</h2>
        <div className="retro-grandes">
          <div><b className="txt-verde">{totalFeitos}</b><span>coisas feitas</span></div>
          <div><b className="txt-vermelho">{totalNao}</b><span>ficaram sem fazer</span></div>
          <div><b>{totalAFazer}</b><span>ainda programadas</span></div>
          {mesDestaque && modo !== 'mes' && <div><b>{MESES[Number(mesDestaque.mes.slice(5)) - 1]}/{mesDestaque.mes.slice(2, 4)}</b><span>mês mais produtivo ({mesDestaque.n})</span></div>}
        </div>
      </section>

      {resumo.map((r) => (
        <section key={r.k} className="card retro-agenda" style={{ '--c': r.a.cor }}>
          <div className="entre wrap">
            <h3 style={{ margin: 0 }}>{r.a.icone} {r.a.nome}</h3>
            <button className="link sem-print" style={{ margin: 0 }} onClick={() => irPara?.('agenda-' + r.k)}>Abrir agenda →</button>
          </div>
          {r.total === 0 ? <p className="vazio">Nada marcado nesta agenda no período.</p> : <>
            <div className="retro-nums">
              <div><b className="txt-verde">{r.feitos.length}</b><small>feitos</small></div>
              <div><b className="txt-vermelho">{r.naoFeitos.length}</b><small>não feitos</small></div>
              <div><b>{r.aFazer.length}</b><small>a fazer</small></div>
              <div><b>{r.cancel.length}</b><small>cancelados</small></div>
              <div className="retro-pct"><b>{r.pct}%</b><small>cumprido</small><span className="barra"><i style={{ width: r.pct + '%' }} /></span></div>
            </div>
            {r.cats.length > 0 && (
              <div className="retro-cats">
                <small className="rotulo">O que mais fez</small>
                {r.cats.map(([c, n]) => (
                  <div key={c} className="retro-cat">
                    <span>{c}</span>
                    <span className="barra"><i style={{ width: (n / r.cats[0][1]) * 100 + '%' }} /></span>
                    <b>{n}</b>
                  </div>
                ))}
              </div>
            )}
            {r.porMes.length > 0 && (
              <details className="retro-lista" open={modo === 'mes'}>
                <summary>Tudo o que foi feito ({r.feitos.length})</summary>
                {r.porMes.map(([m, l]) => (
                  <div key={m}>
                    <b className="retro-mes">{nomeMes(m)} · {l.length}</b>
                    <ul>
                      {l.map((i) => (
                        <li key={i.id}>
                          <span className="pequeno-txt">{dataBR(i.data).slice(0, 5)}</span> {i.titulo}
                          {i.categoria && <small> · {i.categoria}</small>}{i.local && <small> · 📍 {i.local}</small>}
                          {i.observacao && <small className="ag-obs"> — {i.observacao}</small>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </details>
            )}
            {r.naoFeitos.length > 0 && (
              <details className="retro-lista">
                <summary>Ficou sem fazer ({r.naoFeitos.length})</summary>
                <ul>{r.naoFeitos.map((i) => <li key={i.id}><span className="pequeno-txt">{dataBR(i.data).slice(0, 5)}</span> {i.titulo}</li>)}</ul>
              </details>
            )}
          </>}
        </section>
      ))}
    </div>
  )
}
