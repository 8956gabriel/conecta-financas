import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../store'
import { supabase, erroMsg } from '../supabase'
import { brl, dataBR, hojeISO, mesISO, nomeMes, num } from '../lib'
import { SeletorMes } from './Dashboard'
import NovoLancamento from '../components/NovoLancamento'
import Acoes from '../components/Acoes'
import Modal from '../components/Modal'

// Planilha do mês: tudo que entrou e saiu, com os depósitos (reservas/metas) calculados à parte.
// separada = chave da planilha independente ('planilha2', 'planilha3', 'planilha4') ou false para a Planilha 1
export default function Planilha({ irPara, separada = false }) {
  const app = useApp()
  const nomePl = separada ? 'Planilha ' + separada.replace('planilha', '') : 'Planilha'
  // Planilhas separadas: dados próprios na tabela planilha_itens
  const [itens, setItens] = useState(separada ? null : [])
  const [erroTab, setErroTab] = useState(null)
  const carregarItens = useCallback(async () => {
    if (!separada) return
    const { data, error } = await supabase.from('planilha_itens').select('*').eq('planilha', separada)
      .order('data').order('created_at').limit(20000)
    if (error) { setErroTab(erroMsg(error)); setItens([]) } else { setErroTab(null); setItens(data) }
  }, [separada])
  useEffect(() => { carregarItens() }, [carregarItens])
  const [editarItem, setEditarItem] = useState(null)
  const [mes, setMes] = useState(mesISO())
  const [tipo, setTipo] = useState('todos') // todos | entrada | saida | deposito
  const [categoria, setCategoria] = useState('')
  const [busca, setBusca] = useState('')
  const [pagFiltro, setPagFiltro] = useState('')
  const [soPagos, setSoPagos] = useState(false)
  const [editar, setEditar] = useState(null)
  const [excluirDep, setExcluirDep] = useState(null) // depósito (app) ou item (planilha 2)

  const linhas = useMemo(() => {
    if (separada) {
      return (itens || [])
        .filter(app.filtra)
        .filter((i) => i.data.startsWith(mes))
        .map((i) => ({
          id: i.id, origem: 'item', i, data: i.data, criado: i.created_at, tipo: i.tipo,
          descricao: i.descricao || (i.tipo === 'deposito' ? 'Depósito' : '—'),
          categoria_id: i.categoria_id, obs: i.observacao || '', valor: Number(i.valor), user_id: i.user_id,
          pagamento: i.pagamento || '', pessoa: i.pessoa || '',
        }))
    }
    const lancs = app.lancamentos
      .filter(app.filtra)
      .filter((l) => l.data.startsWith(mes))
      .filter((l) => !soPagos || l.status === 'concluido')
      .map((l) => ({
        id: l.id, origem: 'lanc', l, data: l.data, criado: l.created_at,
        tipo: l.tipo === 'receita' ? 'entrada' : 'saida',
        descricao: l.descricao + (l.parcela_total > 1 ? ` (${l.parcela_num}/${l.parcela_total})` : ''),
        categoria_id: l.categoria_id, obs: l.observacao || '', valor: Number(l.valor), user_id: l.user_id,
        pagamento: l.pagamento || (l.cartao_id ? 'Cartão' : ''), pessoa: l.pessoa || '',
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
          pagamento: '', pessoa: '',
        }
      })
    return [...lancs, ...deps].sort((a, b) => a.data.localeCompare(b.data) || (a.criado || '').localeCompare(b.criado || ''))
  }, [separada, itens, app.lancamentos, app.movimentos, app.metas, app.filtra, mes, soPagos])

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
      .filter((r) => !categoria || chaveCat(app, r) === categoria)
      .filter((r) => !pagFiltro || (pagFiltro === '-' ? !r.pagamento : r.pagamento === pagFiltro))
      .filter((r) => !b || r.descricao.toLowerCase().includes(b) || r.obs.toLowerCase().includes(b) || r.pessoa.toLowerCase().includes(b))
  }, [linhas, tipo, categoria, pagFiltro, busca])

  // Quanto saiu em Pix, Dinheiro etc. no mês
  const porPagamento = useMemo(() => {
    const mapa = {}
    for (const r of linhas) {
      if (r.tipo !== 'saida' || !r.pagamento) continue
      mapa[r.pagamento] = (mapa[r.pagamento] || 0) + r.valor
    }
    return Object.entries(mapa).sort((a, b) => b[1] - a[1])
  }, [linhas])

  // Nomes já usados (para sugerir ao digitar)
  const nomesUsados = useMemo(() => {
    const s = new Set((app.membros || []).map((m) => m.nome.split(' ')[0]))
    for (const r of linhas) if (r.pessoa) s.add(r.pessoa)
    for (const l of app.lancamentos) if (l.pessoa) s.add(l.pessoa)
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [linhas, app.lancamentos, app.membros])

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

  // Cálculo por categoria no mês (junta categorias com o mesmo nome)
  const porCategoria = useMemo(() => {
    const mapa = {}
    for (const r of linhas) {
      if (r.tipo === 'deposito') continue
      const k = chaveCat(app, r)
      const c = app.cat(r.categoria_id)
      const g = (mapa[k] ||= { k, nome: c?.nome?.trim() || 'Sem categoria', cor: c?.cor || '#64748b', qtd: 0, entrada: 0, saida: 0, pix: 0, dinheiro: 0, outros: 0 })
      g.qtd++
      if (r.tipo === 'entrada') { g.entrada += r.valor; continue }
      g.saida += r.valor
      if (r.pagamento === 'Pix') g.pix += r.valor
      else if (r.pagamento === 'Dinheiro') g.dinheiro += r.valor
      else g.outros += r.valor
    }
    return Object.values(mapa).sort((a, b) => b.saida - a.saida || b.entrada - a.entrada)
  }, [linhas, app])
  const opcoesCat = useMemo(() => {
    const m = new Map()
    for (const c of app.categorias) { const k = c.nome.trim().toLowerCase(); if (!m.has(k)) m.set(k, c.nome.trim()) }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [app.categorias])

  async function salvarCampo(r, campo, valor) {
    const limpo = (valor || '').trim() || null
    const upd = { obs: { observacao: limpo }, categoria: { categoria_id: limpo }, pagamento: { pagamento: limpo }, pessoa: { pessoa: limpo } }[campo]
    if (r.origem === 'item') {
      const { error } = await supabase.from('planilha_itens').update(upd).eq('id', r.id)
      if (error) return app.avisar(erroColuna(error), 'erro')
      await carregarItens()
      return app.avisar('Salvo')
    }
    if (r.origem === 'lanc') {
      const { error } = await supabase.from('lancamentos').update(upd).eq('id', r.id)
      if (error) return app.avisar(erroColuna(error), 'erro')
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
      if (r.origem === 'item') {
        const { error } = await supabase.from('planilha_itens').delete().eq('id', r.id)
        if (error) throw error
        await carregarItens()
        app.avisar('Linha excluída')
        return
      }
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
    const cab = ['Data', 'Tipo', 'Descrição', 'Nome', 'Pix / Dinheiro', 'Categoria', 'Observação', 'Responsável', 'Entrada', 'Saída', 'Depósito', 'Saldo']
    const f = (n) => (n ? n.toFixed(2).replace('.', ',') : '')
    const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`
    const rows = comSaldo.map((r) => [
      dataBR(r.data), NOME_TIPO[r.tipo], r.descricao, r.pessoa, r.pagamento, r.origem !== 'dep' ? app.cat(r.categoria_id)?.nome || '' : '',
      r.obs, app.nomeMembro(r.user_id),
      r.tipo === 'entrada' ? f(r.valor) : '', r.tipo === 'saida' ? f(r.valor) : '', r.tipo === 'deposito' ? f(r.valor) : '',
      f(r.saldo) || '0,00',
    ])
    rows.push([], ['', '', 'TOTAIS', '', '', '', '', '', f(tot.entrada), f(tot.saida), f(tot.depLiq), f(tot.saldo)])
    const csv = '﻿' + [cab, ...rows].map((l) => l.map(q).join(';')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `${separada || 'planilha'}-${mes}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const temFiltro = tipo !== 'todos' || categoria || busca || pagFiltro

  if (separada && itens === null) return <div className="center" style={{ minHeight: 200 }}><div className="spinner" /></div>
  if (separada && erroTab) return (
    <div className="card aviso erro">
      A {nomePl} ainda não está pronta no banco de dados ({erroTab}). Rode o arquivo <b>supabase/010_planilha2.sql</b> no SQL Editor do Supabase e recarregue.
      <div className="acoes" style={{ marginTop: 10 }}><button className="btn" onClick={carregarItens}>Tentar de novo</button></div>
    </div>
  )

  return (
    <div className="pagina">
      {separada && <p className="dica destaque">📒 <b>{nomePl}</b> — separada: o que você lança aqui não mistura com os lançamentos do app nem com as outras planilhas.</p>}
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
        {' '}— é o saldo do mês menos o que foi depositado.
      </p>
      {porPagamento.length > 0 && (
        <div className="pag-resumo">
          <span className="pequeno-txt">Saiu por forma:</span>
          {porPagamento.map(([f, v]) => (
            <button key={f} className={'pag-chip pag-' + f.toLowerCase() + (pagFiltro === f ? ' on' : '')}
              onClick={() => { setPagFiltro(pagFiltro === f ? '' : f); setTipo('saida') }}>{f} <b>{brl(v)}</b></button>
          ))}
        </div>
      )}
      <Sugestoes app={app} nomes={nomesUsados} />

      <NovaLinha mes={mes} irPara={irPara} separada={separada} aoSalvar={carregarItens} />

      <div className="filtros card">
        <input placeholder="Buscar na descrição, nome ou observação…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="todos">Tudo</option>
          <option value="entrada">Só entradas</option>
          <option value="saida">Só saídas</option>
          <option value="deposito">Só depósitos</option>
        </select>
        <select value={pagFiltro} onChange={(e) => setPagFiltro(e.target.value)}>
          <option value="">Pix, dinheiro… (todos)</option>
          {FORMAS_PAGAMENTO.map((f) => <option key={f} value={f}>Só {f}</option>)}
          <option value="-">Sem forma informada</option>
        </select>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Todas as categorias</option>
          <option value="sem">Sem categoria</option>
          {opcoesCat.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
        {separada ? <span /> : <label className="check pequeno-txt"><input type="checkbox" checked={soPagos} onChange={(e) => setSoPagos(e.target.checked)} /> Só pago / recebido</label>}
        <div className="acoes">
          {temFiltro && <button className="link" onClick={() => { setTipo('todos'); setCategoria(''); setBusca(''); setPagFiltro('') }}>Limpar filtros</button>}
          <button className="btn" onClick={exportarCSV} disabled={!comSaldo.length}>⬇ Exportar (Excel/CSV)</button>
        </div>
      </div>

      <section className="card planilha-card">
        <div className="planilha-scroll">
          <table className="planilha">
            <thead>
              <tr>
                <th>Data</th><th>Tipo</th><th>Descrição</th><th>Nome</th><th>Pix / Dinheiro</th><th>Categoria</th><th className="col-obs">Observação (o que gastou)</th>
                <th className="num">Entrada</th><th className="num">Saída</th><th className="num">Depósito</th><th className="num">Saldo</th><th />
              </tr>
            </thead>
            <tbody>
              {comSaldo.length === 0 && (
                <tr><td colSpan={12} className="vazio">Nada lançado {temFiltro ? 'com esses filtros' : `em ${nomeMes(mes)}`}.</td></tr>
              )}
              {comSaldo.map((r) => (
                <tr key={r.origem + r.id} className={'tp-' + r.tipo}>
                  <td className="nowrap">{dataBR(r.data).slice(0, 5)}</td>
                  <td><span className={'badge tp-badge-' + r.tipo}>{NOME_TIPO[r.tipo]}</span></td>
                  <td className="col-desc" title={r.descricao}>
                    {r.descricao}
                    <small className="resp"><i className="dot" style={{ background: app.corMembro(r.user_id) }} />{app.nomeMembro(r.user_id).split(' ')[0]}</small>
                  </td>
                  <td className="col-nome">
                    {r.origem !== 'dep'
                      ? <CelulaTexto valor={r.pessoa} list="pl-nomes" placeholder="Nome…" salvar={(v) => salvarCampo(r, 'pessoa', v)} />
                      : <span className="pequeno-txt">—</span>}
                  </td>
                  <td>
                    {r.origem !== 'dep'
                      ? <CelulaPagamento valor={r.pagamento} salvar={(v) => salvarCampo(r, 'pagamento', v)} />
                      : <span className="pequeno-txt">—</span>}
                  </td>
                  <td>
                    {r.tipo !== 'deposito'
                      ? <CelulaCategoria r={r} salvar={(id) => salvarCampo(r, 'categoria', id)} />
                      : <span className="pequeno-txt">{r.origem === 'dep' ? 'Reserva / meta' : 'Depósito'}</span>}
                  </td>
                  <td className="col-obs"><CelulaTexto valor={r.obs} salvar={(v) => salvarCampo(r, 'obs', v)} /></td>
                  <td className="num txt-verde">{r.tipo === 'entrada' ? brl(r.valor) : ''}</td>
                  <td className="num txt-vermelho">{r.tipo === 'saida' ? brl(r.valor) : ''}</td>
                  <td className="num txt-roxo">{r.tipo === 'deposito' ? brl(r.valor) : ''}</td>
                  <td className={'num ' + (r.saldo < 0 ? 'txt-vermelho' : '')}>{brl(r.saldo)}</td>
                  <td>
                    {r.origem === 'lanc'
                      ? <Acoes editar={() => setEditar(r.l)} excluir={() => setEditar({ ...r.l, _x: true })} />
                      : r.origem === 'item'
                        ? <Acoes editar={() => setEditarItem(r.i)} excluir={() => setExcluirDep(r)} />
                        : <Acoes excluir={() => setExcluirDep(r)} />}
                  </td>
                </tr>
              ))}
            </tbody>
            {comSaldo.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={7}>Total {temFiltro ? '(com filtros)' : 'do mês'}</td>
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
        <p className="dica">Toque no nome, no Pix / Dinheiro, na categoria ou na observação para mudar direto na planilha. Na categoria dá para escrever uma nova: ela é criada na hora. Os depósitos não entram no saldo: são somados na coluna própria.</p>
      </section>

      <section className="card">
        <h3>Entrada e saída por categoria · {nomeMes(mes)}</h3>
        {porCategoria.length === 0 ? <p className="vazio">Nada lançado neste mês.</p> : (
          <div className="planilha-scroll">
            <table className="planilha resumo">
              <thead>
                <tr>
                  <th>Categoria</th><th className="num">Linhas</th><th className="num">Entrada</th><th className="num">Saída</th><th className="num">Saldo</th>
                  <th className="num">% das saídas</th><th className="num">Saída Pix</th><th className="num">Saída Dinheiro</th><th className="num">Saída outras</th>
                </tr>
              </thead>
              <tbody>
                {porCategoria.map((p) => (
                  <tr key={p.k} className={'clicavel' + (categoria === p.k ? ' sel' : '')} title="Clique para ver só essa categoria na planilha"
                    onClick={() => { setCategoria(categoria === p.k ? '' : p.k); setTipo('todos') }}>
                    <td><i className="dot" style={{ background: p.cor }} />{p.nome}</td>
                    <td className="num">{p.qtd}</td>
                    <td className="num txt-verde"><b>{p.entrada ? brl(p.entrada) : ''}</b></td>
                    <td className="num txt-vermelho"><b>{p.saida ? brl(p.saida) : ''}</b></td>
                    <td className={'num ' + (p.entrada - p.saida < 0 ? 'txt-vermelho' : 'txt-verde')}>{brl(p.entrada - p.saida)}</td>
                    <td className="num">{p.saida && tot.saida ? Math.round((p.saida / tot.saida) * 100) + '%' : ''}</td>
                    <td className="num pag-pix">{p.pix ? brl(p.pix) : ''}</td>
                    <td className="num pag-dinheiro">{p.dinheiro ? brl(p.dinheiro) : ''}</td>
                    <td className="num">{p.outros ? brl(p.outros) : ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num">{porCategoria.reduce((s, p) => s + p.qtd, 0)}</td>
                  <td className="num txt-verde">{brl(tot.entrada)}</td>
                  <td className="num txt-vermelho">{brl(tot.saida)}</td>
                  <td className={'num ' + (tot.saldo < 0 ? 'txt-vermelho' : 'txt-verde')}>{brl(tot.saldo)}</td>
                  <td className="num">100%</td>
                  <td className="num pag-pix">{brl(porCategoria.reduce((s, p) => s + p.pix, 0))}</td>
                  <td className="num pag-dinheiro">{brl(porCategoria.reduce((s, p) => s + p.dinheiro, 0))}</td>
                  <td className="num">{brl(porCategoria.reduce((s, p) => s + p.outros, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="dica">Categorias com o mesmo nome são somadas juntas. Clique numa categoria para ver só as linhas dela.</p>
      </section>

      {editar && <NovoLancamento editar={editar} fechar={() => setEditar(null)} />}
      {editarItem && <EditarItem item={editarItem} fechar={() => setEditarItem(null)} aoSalvar={carregarItens} />}
      {excluirDep && (
        <Modal titulo={excluirDep.origem === 'item' ? 'Excluir linha' : 'Excluir depósito'} fechar={() => setExcluirDep(null)}>
          <div className="confirma">
            <p>Excluir “{excluirDep.descricao}” de {brl(excluirDep.valor)}?{excluirDep.origem === 'dep' ? ' O saldo da reserva também é ajustado.' : ' Não dá para desfazer.'}</p>
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
export const FORMAS_PAGAMENTO = ['Pix', 'Dinheiro', 'Cartão', 'Débito', 'Transferência', 'Boleto']

// Mensagem clara quando o banco ainda não tem as colunas novas
function erroColuna(e) {
  const m = erroMsg(e)
  if (/pagamento|pessoa/i.test(m) && /column|coluna|schema/i.test(m)) {
    return 'Falta atualizar o banco: rode supabase/012_planilha_pagamento_nome.sql no SQL Editor do Supabase.'
  }
  return m
}

// Chave da categoria pelo nome (assim "C" e "c" repetidas somam juntas)
function chaveCat(app, r) {
  return app.cat(r.categoria_id)?.nome?.trim().toLowerCase() || 'sem'
}

// Acha a categoria pelo nome (sem ligar para maiúsculas) ou cria uma nova. Devolve o id.
async function garantirCategoria(app, nome, tipoLanc) {
  const n = nome.trim()
  if (!n) return null
  const achou = app.categorias.find((c) => c.tipo === tipoLanc && c.nome.trim().toLowerCase() === n.toLowerCase())
  if (achou) return achou.id
  // confere no banco também (evita criar repetida quando duas linhas mudam ao mesmo tempo)
  const { data: ja } = await supabase.from('categorias').select('id,nome').eq('tipo', tipoLanc).ilike('nome', n.replace(/[%_]/g, '\\$&'))
  if (ja?.length) return ja[0].id
  const cores = ['#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899', '#ef4444', '#14b8a6']
  const { data, error } = await supabase.from('categorias')
    .insert({ casal_id: app.casal.id, nome: n, tipo: tipoLanc, cor: cores[Math.floor(Math.random() * cores.length)] })
    .select('id').single()
  if (error) throw error
  await app.carregar()
  app.avisar(`Categoria “${n}” criada`)
  return data.id
}

// Listas de sugestões (uma por página) usadas pelas células da planilha
function Sugestoes({ app, nomes }) {
  return (
    <>
      <datalist id="pl-cat-receita">{app.categorias.filter((c) => c.tipo === 'receita').map((c) => <option key={c.id} value={c.nome} />)}</datalist>
      <datalist id="pl-cat-despesa">{app.categorias.filter((c) => c.tipo === 'despesa').map((c) => <option key={c.id} value={c.nome} />)}</datalist>
      <datalist id="pl-nomes">{nomes.map((n) => <option key={n} value={n} />)}</datalist>
    </>
  )
}

// Categoria: escolhe uma da lista ou escreve uma nova (é criada na hora)
function CelulaCategoria({ r, salvar }) {
  const app = useApp()
  const tipoLanc = r.tipo === 'entrada' ? 'receita' : 'despesa'
  const nomeAtual = app.cat(r.categoria_id)?.nome || ''
  const [v, setV] = useState(nomeAtual)
  const [base, setBase] = useState(nomeAtual)
  if (nomeAtual !== base) { setBase(nomeAtual); setV(nomeAtual) }
  async function fim() {
    if (v.trim().toLowerCase() === nomeAtual.trim().toLowerCase()) { setV(nomeAtual); return }
    try {
      const id = await garantirCategoria(app, v, tipoLanc)
      await salvar(id || '')
    } catch (e) {
      app.avisar(erroMsg(e), 'erro')
      setV(nomeAtual)
    }
  }
  return (
    <input className="cel cel-cat" list={'pl-cat-' + tipoLanc} value={v} placeholder="Sem categoria"
      onChange={(e) => setV(e.target.value)} onBlur={fim} onFocus={(e) => e.target.select()}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setV(nomeAtual); e.currentTarget.blur() } }} />
  )
}

// Pix / Dinheiro / Cartão…
function CelulaPagamento({ valor, salvar }) {
  const opcoes = valor && !FORMAS_PAGAMENTO.includes(valor) ? [...FORMAS_PAGAMENTO, valor] : FORMAS_PAGAMENTO
  return (
    <select className={'cel cel-pag pag-' + (valor || 'vazio').toLowerCase()} value={valor || ''} onChange={(e) => salvar(e.target.value)}>
      <option value="">—</option>
      {opcoes.map((f) => <option key={f} value={f}>{f}</option>)}
    </select>
  )
}

// Célula de texto editável: salva ao sair do campo ou apertar Enter
function CelulaTexto({ valor, salvar, list, placeholder = '—' }) {
  const [v, setV] = useState(valor)
  const [base, setBase] = useState(valor)
  if (valor !== base) { setBase(valor); setV(valor) }
  const fim = () => { if (v.trim() !== (valor || '').trim()) salvar(v) }
  return (
    <input className="cel" list={list} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={fim}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setV(valor); e.currentTarget.blur() } }} />
  )
}

// Linha rápida para lançar direto na planilha
function NovaLinha({ mes, irPara, separada, aoSalvar }) {
  const app = useApp()
  const dataPadrao = () => (mes === mesISO() ? hojeISO() : `${mes}-01`)
  const [tipo, setTipo] = useState('saida')
  const [data, setData] = useState(dataPadrao)
  const [descricao, setDescricao] = useState('')
  const [categoria, setCategoria] = useState('')
  const [meta, setMeta] = useState('')
  const [obs, setObs] = useState('')
  const [valor, setValor] = useState('')
  const [pessoa, setPessoa] = useState('')
  const [pagamento, setPagamento] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [mesBase, setMesBase] = useState(mes)
  if (mes !== mesBase) { setMesBase(mes); setData(dataPadrao()) }

  const tipoLanc = tipo === 'entrada' ? 'receita' : 'despesa'
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
      // Só manda nome / forma quando preenchidos (assim funciona mesmo antes de atualizar o banco)
      const extras = {}
      if (pessoa.trim()) extras.pessoa = pessoa.trim()
      if (pagamento) extras.pagamento = pagamento
      const catId = tipo === 'deposito' ? null : await garantirCategoria(app, categoria, tipoLanc)
      if (separada) {
        if (tipo !== 'deposito' && !descricao.trim()) throw new Error('Informe a descrição.')
        const { error } = await supabase.from('planilha_itens').insert({
          casal_id: app.casal.id, user_id: resp, planilha: separada, tipo, data, descricao: descricao.trim(),
          categoria_id: catId, observacao: obs.trim() || null, valor: v, ...extras,
        })
        if (error) throw error
        await aoSalvar()
      } else if (tipo === 'deposito') {
        if (!metaSel) throw new Error('Crie uma reserva ou meta primeiro (aba Reservas e metas).')
        const desc = [descricao.trim(), obs.trim()].filter(Boolean).join(' — ')
        const { error } = await supabase.rpc('movimentar_meta', { p_meta_id: metaSel, p_valor: v, p_descricao: desc || 'Depósito', p_data: data })
        if (error) throw error
      } else {
        if (!descricao.trim()) throw new Error('Informe a descrição.')
        const { error } = await supabase.from('lancamentos').insert({
          casal_id: app.casal.id, user_id: resp, tipo: tipoLanc, descricao: descricao.trim(), valor: v, data,
          status: 'concluido', categoria_id: catId, conta_id: contaPadrao, observacao: obs.trim() || null, ...extras,
        })
        if (error) throw error
      }
      if (!separada) await app.carregar()
      app.avisar(tipo === 'entrada' ? 'Entrada lançada' : tipo === 'saida' ? 'Saída lançada' : 'Depósito lançado')
      setDescricao(''); setObs(''); setValor(''); setPessoa('')
    } catch (err) {
      app.avisar(erroColuna(err), 'erro')
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
      {tipo === 'deposito' && separada ? (
        <span className="pequeno-txt">Depósito (calculado à parte)</span>
      ) : tipo === 'deposito' ? (
        app.metas.length ? (
          <select value={metaSel} onChange={(e) => setMeta(e.target.value)} aria-label="Reserva">
            {app.metas.map((m) => <option key={m.id} value={m.id}>{m.icone} {m.nome}</option>)}
          </select>
        ) : <button type="button" className="btn" onClick={() => irPara?.('metas')}>Criar reserva</button>
      ) : (
        <input list={'pl-cat-' + tipoLanc} placeholder="Categoria (escolha ou escreva)" value={categoria}
          onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria" />
      )}
      <input list="pl-nomes" placeholder="Nome" value={pessoa} onChange={(e) => setPessoa(e.target.value)} aria-label="Nome" />
      <select value={pagamento} onChange={(e) => setPagamento(e.target.value)} aria-label="Pix ou dinheiro">
        <option value="">Pix / Dinheiro…</option>
        {FORMAS_PAGAMENTO.map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
      <input placeholder="Observação: o que gastou / de onde veio" value={obs} onChange={(e) => setObs(e.target.value)} />
      <input inputMode="decimal" placeholder="Valor R$" value={valor} onChange={(e) => setValor(e.target.value)} />
      <button className="btn primario" disabled={salvando}>{salvando ? 'Salvando…' : '+ Adicionar'}</button>
    </form>
  )
}

// Editar uma linha de uma planilha separada
function EditarItem({ item, fechar, aoSalvar }) {
  const app = useApp()
  const [tipo, setTipo] = useState(item.tipo)
  const [data, setData] = useState(item.data)
  const [descricao, setDescricao] = useState(item.descricao || '')
  const [categoria, setCategoria] = useState(app.cat(item.categoria_id)?.nome || '')
  const [obs, setObs] = useState(item.observacao || '')
  const [valor, setValor] = useState(String(item.valor).replace('.', ','))
  const [resp, setResp] = useState(item.user_id)
  const [pessoa, setPessoa] = useState(item.pessoa || '')
  const [pagamento, setPagamento] = useState(item.pagamento || '')
  const [erro, setErro] = useState(null)
  const [salvando, setSalvando] = useState(false)
  async function salvar(e) {
    e.preventDefault()
    const v = num(valor)
    if (!(v > 0)) return setErro('Informe um valor maior que zero.')
    setSalvando(true)
    let catId = null
    try {
      catId = tipo === 'deposito' ? null : await garantirCategoria(app, categoria, tipo === 'entrada' ? 'receita' : 'despesa')
    } catch (e2) { setSalvando(false); return setErro(erroMsg(e2)) }
    const upd = { tipo, data, descricao: descricao.trim(), categoria_id: catId, observacao: obs.trim() || null, valor: v, user_id: resp }
    if (pessoa.trim() || item.pessoa) upd.pessoa = pessoa.trim() || null
    if (pagamento || item.pagamento) upd.pagamento = pagamento || null
    const { error } = await supabase.from('planilha_itens').update(upd).eq('id', item.id)
    setSalvando(false)
    if (error) return setErro(erroColuna(error))
    await aoSalvar()
    app.avisar('Linha atualizada')
    fechar()
  }

  return (
    <Modal titulo={'Editar linha · Planilha ' + item.planilha.replace('planilha', '')} fechar={fechar}>
      <form className="form" onSubmit={salvar}>
        <div className="seg full">
          <button type="button" className={tipo === 'entrada' ? 'on receita' : ''} onClick={() => { setTipo('entrada'); setCategoria('') }}>↑ Entrada</button>
          <button type="button" className={tipo === 'saida' ? 'on despesa' : ''} onClick={() => { setTipo('saida'); setCategoria('') }}>↓ Saída</button>
          <button type="button" className={tipo === 'deposito' ? 'on deposito' : ''} onClick={() => setTipo('deposito')}>◆ Depósito</button>
        </div>
        <div className="linha2">
          <label>Data<input type="date" value={data} onChange={(e) => setData(e.target.value)} /></label>
          <label>Valor (R$)<input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></label>
        </div>
        <label>Descrição<input value={descricao} onChange={(e) => setDescricao(e.target.value)} /></label>
        {tipo !== 'deposito' && (
          <label>Categoria (escolha ou escreva uma nova)
            <input list={'pl-cat-' + (tipo === 'entrada' ? 'receita' : 'despesa')} value={categoria} placeholder="Sem categoria" onChange={(e) => setCategoria(e.target.value)} />
          </label>
        )}
        <div className="linha2">
          <label>Nome<input list="pl-nomes" value={pessoa} onChange={(e) => setPessoa(e.target.value)} /></label>
          <label>Pix / Dinheiro
            <select value={pagamento} onChange={(e) => setPagamento(e.target.value)}>
              <option value="">—</option>
              {[...new Set([...FORMAS_PAGAMENTO, ...(pagamento ? [pagamento] : [])])].map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
        </div>
        <label>Observação (o que gastou)<input value={obs} onChange={(e) => setObs(e.target.value)} /></label>
        <label>Responsável
          <select value={resp} onChange={(e) => setResp(e.target.value)}>
            {app.membros.map((m) => <option key={m.user_id} value={m.user_id}>{m.nome}</option>)}
          </select>
        </label>
        {erro && <div className="aviso erro">{erro}</div>}
        <button className="btn primario grande" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
      </form>
    </Modal>
  )
}
