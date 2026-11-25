import { useMemo, useState } from 'react'
import { useApp } from '../store'
import { supabase, erroMsg } from '../supabase'
import { brl, dataBR, hojeISO, mesISO, nomeMes, num } from '../lib'
import { SeletorMes } from './Dashboard'
import NovoLancamento from '../components/NovoLancamento'
import Acoes from '../components/Acoes'
import Modal from '../components/Modal'

// Planilha do mês: tudo que entrou e saiu, com os depósitos (reservas/metas) calculados à parte.
export default function Planilha({ irPara }) {
  const app = useApp()
  const [mes, setMes] = useState(mesISO())
  const [tipo, setTipo] = useState('todos') // todos | entrada | saida | deposito
  const [categoria, setCategoria] = useState('')
  const [busca, setBusca] = useState('')
  const [soPagos, setSoPagos] = useState(false)
  const [editar, setEditar] = useState(null)
  const [excluirDep, setExcluirDep] = useState(null)

  const linhas = useMemo(() => {
    const lancs = app.lancamentos
      .filter(app.filtra)
      .filter((l) => l.data.startsWith(mes))
      .filter((l) => !soPagos || l.status === 'concluido')
      .map((l) => ({
        id: l.id, origem: 'lanc', l, data: l.data, criado: l.created_at,
        tipo: l.tipo === 'receita' ? 'entrada' : 'saida',
        descricao: l.descricao + (l.parcela_total > 1 ? ` (${l.parcela_num}/${l.parcela_total})` : ''),
        categoria_id: l.categoria_id, obs: l.observacao || '', valor: Number(l.valor), user_id: l.user_id,
      }))
    const deps = (app.movimentos || [])
      .filter(app.filtra)
      .filter((m) => m.data.startsWith(mes))
      .map((m) => {
        const meta = app.metas.find((x) => x.id === m.meta_id)
        return {
          id: m.id, origem: 'dep', m, meta, data: m.data, criado: m.created_at, tipo: 'deposito',
          descricao: (Number(m.valor) < 0 ? 'Retirada · ' : 'Depósito · ') + (meta ? `${meta.icone || ''} ${meta.nome}`.trim() : 'Reserva'),
          categoria_id: null, obs: m.descricao || '', valor: Number(m.valor), user_id: m.user_id,
        }
      })
    return [...lancs, ...deps].sort((a, b) => a.data.localeCompare(b.data) || (a.criado || '').localeCompare(b.criado || ''))
  }, [app.lancamentos, app.movimentos, app.metas, app.filtra, mes, soPagos])

  // Totais do mês (sem filtros de busca/tipo, para o resumo ser sempre o mês inteiro)
  const tot = useMemo(() => {
    let entrada = 0, saida = 0, depositos = 0, retiradas = 0
    for (const r of linhas) {
      if (r.tipo === 'entrada') entrada += r.valor
      else if (r.tipo === 'saida') saida += r.valor
      else if (r.valor > 0) depositos += r.valor
      else retiradas += -r.valor
    }
    return { entrada, saida, saldo: entrada - saida, depositos, retiradas, depLiq: depositos - retiradas }
  }, [linhas])

  const visiveis = useMemo(() => {
    const b = busca.trim().toLowerCase()
    return linhas
      .filter((r) => tipo === 'todos' || r.tipo === tipo)
      .filter((r) => !categoria || r.categoria_id === categoria)
      .filter((r) => !b || r.descricao.toLowerCase().includes(b) || r.obs.toLowerCase().includes(b))
  }, [linhas, tipo, categoria, busca])

  // Saldo acumulado linha a linha (só entradas e saídas; depósitos ficam separados)
  const comSaldo = useMemo(() => {
    let s = 0, d = 0
    return visiveis.map((r) => {
      if (r.tipo === 'entrada') s += r.valor
      else if (r.tipo === 'saida') s -= r.valor
      else d += r.valor
      return { ...r, saldo: s, depAcum: d }
    })
  }, [visiveis])

  const somaVis = (t) => visiveis.filter((r) => r.tipo === t).reduce((s, r) => s + r.valor, 0)

  // Gastos por categoria no mês
  const porCategoria = useMemo(() => {
    const mapa = {}
    for (const r of linhas) {
      if (r.tipo !== 'saida') continue
      const k = r.categoria_id || 'sem'
      mapa[k] = (mapa[k] || 0) + r.valor
    }
    return Object.entries(mapa)
      .map(([id, total]) => ({ id, total, c: app.cat(id) }))
      .sort((a, b) => b.total - a.total)
  }, [linhas, app])

  async function salvarCampo(r, campo, valor) {
    if (r.origem === 'lanc') {
      const upd = campo === 'obs' ? { observacao: valor.trim() || null } : { categoria_id: valor || null }
      const { error } = await supabase.from('lancamentos').update(upd).eq('id', r.id)
      if (error) return app.avisar(erroMsg(error), 'erro')
    } else {
      const { error } = await supabase.from('metas_movimentos').update({ descricao: valor.trim() || null }).eq('id', r.id)
      if (error) return app.avisar(erroMsg(error), 'erro')
    }
    await app.carregar()
    app.avisar('Salvo')
  }

  async function confirmarExcluirDep() {
    const r = excluirDep
    try {
      const meta = app.metas.find((x) => x.id === r.m.meta_id)
      if (meta) {
        const novo = Number(meta.valor_atual) - Number(r.m.valor)
        if (novo < 0) throw new Error('Excluir esse depósito deixaria a reserva com saldo negativo.')
        const { error } = await supabase.from('metas').update({ valor_atual: novo }).eq('id', meta.id)
        if (error) throw error
      }
      const { error } = await supabase.from('metas_movimentos').delete().eq('id', r.id)
      if (error) throw error
      await app.carregar()
      app.avisar('Depósito excluído')
    } catch (e) {
      app.avisar(erroMsg(e), 'erro')
    } finally {
      setExcluirDep(null)
    }
  }

  function exportarCSV() {
    const cab = ['Data', 'Tipo', 'Descrição', 'Categoria', 'Observação', 'Responsável', 'Entrada', 'Saída', 'Depósito', 'Saldo']
    const f = (n) => (n ? n.toFixed(2).replace('.', ',') : '')
    const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`
    const rows = comSaldo.map((r) => [
      dataBR(r.data), NOME_TIPO[r.tipo], r.descricao, r.origem === 'lanc' ? app.cat(r.categoria_id)?.nome || '' : '',
      r.obs, app.nomeMembro(r.user_id),
      r.tipo === 'entrada' ? f(r.valor) : '', r.tipo === 'saida' ? f(r.valor) : '', r.tipo === 'deposito' ? f(r.valor) : '',
      f(r.saldo) || '0,00',
    ])
    rows.push([], ['', '', 'TOTAIS', '', '', '', f(tot.entrada), f(tot.saida), f(tot.depLiq), f(tot.saldo)])
    const csv = '﻿' + [cab, ...rows].map((l) => l.map(q).join(';')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `planilha-${mes}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const temFiltro = tipo !== 'todos' || categoria || busca

  return (
    <div className="pagina">
      <SeletorMes mes={mes} setMes={setMes} />

      <div className="kpis">
        <div className="kpi verde"><span>Entrou</span><b>{brl(tot.entrada)}</b><small>receitas do mês</small></div>
        <div className="kpi vermelho"><span>Saiu</span><b>{brl(tot.saida)}</b><small>despesas do mês</small></div>
        <div className="kpi azul"><span>Saldo (entrou − saiu)</span><b className={tot.saldo < 0 ? 'txt-vermelho' : ''}>{brl(tot.saldo)}</b><small>sem contar os depósitos</small></div>
        <div className="kpi roxo">
          <span>Depósitos (separado)</span><b>{brl(tot.depLiq)}</b>
          <small>{brl(tot.depositos)} guardado{tot.retiradas ? ` · ${brl(tot.retiradas)} retirado` : ''}</small>
        </div>
      </div>
      <p className="dica destaque">
        Sobra depois dos depósitos: <b className={tot.saldo - tot.depLiq < 0 ? 'txt-vermelho' : 'txt-verde'}>{brl(tot.saldo - tot.depLiq)}</b>
        {' '}— é o saldo do mês menos o que foi guardado nas reservas e metas.
      </p>

      <NovaLinha mes={mes} irPara={irPara} />

      <div className="filtros card">
        <input placeholder="Buscar na descrição ou observação…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="todos">Tudo</option>
          <option value="entrada">Só entradas</option>
          <option value="saida">Só saídas</option>
          <option value="deposito">Só depósitos</option>
        </select>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Todas as categorias</option>
          {app.categorias.map((c) => <option key={c.id} value={c.id}>{c.nome} ({c.tipo})</option>)}
        </select>
        <label className="check pequeno-txt"><input type="checkbox" checked={soPagos} onChange={(e) => setSoPagos(e.target.checked)} /> Só pago / recebido</label>
        <div className="acoes">
          {temFiltro && <button className="link" onClick={() => { setTipo('todos'); setCategoria(''); setBusca('') }}>Limpar filtros</button>}
          <button className="btn" onClick={exportarCSV} disabled={!comSaldo.length}>⬇ Exportar (Excel/CSV)</button>
        </div>
      </div>

      <section className="card planilha-card">
        <div className="planilha-scroll">
          <table className="planilha">
            <thead>
              <tr>
                <th>Data</th><th>Tipo</th><th>Descrição</th><th>Categoria</th><th className="col-obs">Observação (o que gastou)</th>
                <th className="num">Entrada</th><th className="num">Saída</th><th className="num">Depósito</th><th className="num">Saldo</th><th />
              </tr>
            </thead>
            <tbody>
              {comSaldo.length === 0 && (
                <tr><td colSpan={10} className="vazio">Nada lançado {temFiltro ? 'com esses filtros' : `em ${nomeMes(mes)}`}.</td></tr>
              )}
              {comSaldo.map((r) => (
                <tr key={r.origem + r.id} className={'tp-' + r.tipo}>
                  <td className="nowrap">{dataBR(r.data).slice(0, 5)}</td>
                  <td><span className={'badge tp-badge-' + r.tipo}>{NOME_TIPO[r.tipo]}</span></td>
                  <td className="col-desc" title={r.descricao}>
                    {r.descricao}
                    <small className="resp"><i className="dot" style={{ background: app.corMembro(r.user_id) }} />{app.nomeMembro(r.user_id).split(' ')[0]}</small>
                  </td>
                  <td>
                    {r.origem === 'lanc' ? (
                      <select className="cel" value={r.categoria_id || ''} onChange={(e) => salvarCampo(r, 'categoria', e.target.value)}>
                        <option value="">Sem categoria</option>
                        {app.categorias.filter((c) => c.tipo === r.l.tipo).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                      </select>
                    ) : <span className="pequeno-txt">Reserva / meta</span>}
                  </td>
                  <td className="col-obs"><CelulaTexto valor={r.obs} salvar={(v) => salvarCampo(r, 'obs', v)} /></td>
                  <td className="num txt-verde">{r.tipo === 'entrada' ? brl(r.valor) : ''}</td>
                  <td className="num txt-vermelho">{r.tipo === 'saida' ? brl(r.valor) : ''}</td>
                  <td className="num txt-roxo">{r.tipo === 'deposito' ? brl(r.valor) : ''}</td>
                  <td className={'num ' + (r.saldo < 0 ? 'txt-vermelho' : '')}>{brl(r.saldo)}</td>
                  <td>
                    {r.origem === 'lanc'
                      ? <Acoes editar={() => setEditar(r.l)} excluir={() => setEditar({ ...r.l, _x: true })} />
                      : <Acoes excluir={() => setExcluirDep(r)} />}
                  </td>
                </tr>
              ))}
            </tbody>
            {comSaldo.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={5}>Total {temFiltro ? '(com filtros)' : 'do mês'}</td>
                  <td className="num txt-verde">{brl(somaVis('entrada'))}</td>
                  <td className="num txt-vermelho">{brl(somaVis('saida'))}</td>
                  <td className="num txt-roxo">{brl(somaVis('deposito'))}</td>
                  <td className="num">{brl(somaVis('entrada') - somaVis('saida'))}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="dica">Toque na observação ou na categoria para mudar direto na planilha. Os depósitos nas reservas e metas não entram no saldo: são somados na coluna própria.</p>
      </section>

      <section className="card">
        <h3>Gastos por categoria · {nomeMes(mes)}</h3>
        {porCategoria.length === 0 ? <p className="vazio">Nenhum gasto neste mês.</p> : (
          <table className="planilha resumo">
            <tbody>
              {porCategoria.map((p) => (
                <tr key={p.id} className="clicavel" onClick={() => { setCategoria(p.id === 'sem' ? '' : p.id); setTipo('saida') }}>
                  <td><i className="dot" style={{ background: p.c?.cor || '#64748b' }} />{p.c?.nome || 'Sem categoria'}</td>
                  <td className="num">{tot.saida ? Math.round((p.total / tot.saida) * 100) : 0}%</td>
                  <td className="num txt-vermelho">{brl(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {editar && <NovoLancamento editar={editar} fechar={() => setEditar(null)} />}
      {excluirDep && (
        <Modal titulo="Excluir depósito" fechar={() => setExcluirDep(null)}>
          <div className="confirma">
            <p>Excluir “{excluirDep.descricao}” de {brl(excluirDep.valor)}? O saldo da reserva também é ajustado.</p>
            <div className="acoes">
              <button className="btn perigo" onClick={confirmarExcluirDep}>Excluir</button>
              <button className="btn" onClick={() => setExcluirDep(null)}>Cancelar</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

const NOME_TIPO = { entrada: 'Entrada', saida: 'Saída', deposito: 'Depósito' }

// Célula de texto editável: salva ao sair do campo ou apertar Enter
function CelulaTexto({ valor, salvar }) {
  const [v, setV] = useState(valor)
  const [base, setBase] = useState(valor)
  if (valor !== base) { setBase(valor); setV(valor) }
  const fim = () => { if (v.trim() !== (valor || '').trim()) salvar(v) }
  return (
    <input className="cel" value={v} placeholder="—" onChange={(e) => setV(e.target.value)} onBlur={fim}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setV(valor); e.currentTarget.blur() } }} />
  )
}

// Linha rápida para lançar direto na planilha
function NovaLinha({ mes, irPara }) {
  const app = useApp()
  const dataPadrao = () => (mes === mesISO() ? hojeISO() : `${mes}-01`)
  const [tipo, setTipo] = useState('saida')
  const [data, setData] = useState(dataPadrao)
  const [descricao, setDescricao] = useState('')
  const [categoria, setCategoria] = useState('')
  const [meta, setMeta] = useState('')
  const [obs, setObs] = useState('')
  const [valor, setValor] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [mesBase, setMesBase] = useState(mes)
  if (mes !== mesBase) { setMesBase(mes); setData(dataPadrao()) }

  const tipoLanc = tipo === 'entrada' ? 'receita' : 'despesa'
  const cats = app.categorias.filter((c) => c.tipo === tipoLanc)
  const contaPadrao = app.contas.find((c) => c.ativo)?.id || null
  const resp = app.visao !== 'casal' ? app.visao : app.uid
  const metaSel = meta || app.metas[0]?.id || ''

  async function adicionar(e) {
    e.preventDefault()
    const v = num(valor)
    if (!(v > 0)) return app.avisar('Informe um valor maior que zero.', 'erro')
    if (!data) return app.avisar('Informe a data.', 'erro')
    setSalvando(true)
    try {
      if (tipo === 'deposito') {
        if (!metaSel) throw new Error('Crie uma reserva ou meta primeiro (aba Reservas e metas).')
        const desc = [descricao.trim(), obs.trim()].filter(Boolean).join(' — ')
        const { error } = await supabase.rpc('movimentar_meta', { p_meta_id: metaSel, p_valor: v, p_descricao: desc || 'Depósito', p_data: data })
        if (error) throw error
      } else {
        if (!descricao.trim()) throw new Error('Informe a descrição.')
        const { error } = await supabase.from('lancamentos').insert({
          casal_id: app.casal.id, user_id: resp, tipo: tipoLanc, descricao: descricao.trim(), valor: v, data,
          status: 'concluido', categoria_id: categoria || null, conta_id: contaPadrao, observacao: obs.trim() || null,
        })
        if (error) throw error
      }
      await app.carregar()
      app.avisar(tipo === 'entrada' ? 'Entrada lançada' : tipo === 'saida' ? 'Saída lançada' : 'Depósito lançado')
      setDescricao(''); setObs(''); setValor('')
    } catch (err) {
      app.avisar(erroMsg(err), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form className="card nova-linha" onSubmit={adicionar}>
      <div className="seg tipo-planilha">
        <button type="button" className={tipo === 'entrada' ? 'on receita' : ''} onClick={() => { setTipo('entrada'); setCategoria('') }}>↑ Entrada</button>
        <button type="button" className={tipo === 'saida' ? 'on despesa' : ''} onClick={() => { setTipo('saida'); setCategoria('') }}>↓ Saída</button>
        <button type="button" className={tipo === 'deposito' ? 'on deposito' : ''} onClick={() => setTipo('deposito')}>◆ Depósito</button>
      </div>
      <input type="date" value={data} onChange={(e) => setData(e.target.value)} aria-label="Data" />
      <input placeholder={tipo === 'deposito' ? 'Descrição (opcional)' : 'Descrição'} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      {tipo === 'deposito' ? (
        app.metas.length ? (
          <select value={metaSel} onChange={(e) => setMeta(e.target.value)} aria-label="Reserva">
            {app.metas.map((m) => <option key={m.id} value={m.id}>{m.icone} {m.nome}</option>)}
          </select>
        ) : <button type="button" className="btn" onClick={() => irPara?.('metas')}>Criar reserva</button>
      ) : (
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria">
          <option value="">Categoria…</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      )}
      <input placeholder="Observação: o que gastou / de onde veio" value={obs} onChange={(e) => setObs(e.target.value)} />
      <input inputMode="decimal" placeholder="Valor R$" value={valor} onChange={(e) => setValor(e.target.value)} />
      <button className="btn primario" disabled={salvando}>{salvando ? 'Salvando…' : '+ Adicionar'}</button>
    </form>
  )
}
