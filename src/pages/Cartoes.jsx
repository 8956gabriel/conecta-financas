import { useState } from 'react'
import { useApp, usoCartao, faturasDoCartao } from '../store'
import { supabase, erroMsg } from '../supabase'
import { brl, CORES, dataBR, hojeISO, mesISO, nomeMes, num } from '../lib'
import Modal from '../components/Modal'
import NovoLancamento from '../components/NovoLancamento'
import Acoes from '../components/Acoes'

export default function Cartoes() {
  const app = useApp()
  const [form, setForm] = useState(null)
  const [selId, setSelId] = useState(null)
  const [novoNo, setNovoNo] = useState(null) // id do cartão para lançar
  const visiveis = app.cartoes.filter((c) => app.visao === 'casal' || !c.dono_id || c.dono_id === app.visao)
  const sel = visiveis.find((c) => c.id === selId) || visiveis[0]

  return (
    <div className="pagina">
      <div className="entre">
        <p className="dica">Cadastre os cartões e acompanhe limite, faturas e parcelas.</p>
        <button className="btn primario" onClick={() => setForm({})}>+ Novo cartão</button>
      </div>

      {visiveis.length === 0 ? (
        <div className="card vazio">Nenhum cartão cadastrado ainda.</div>
      ) : (
        <div className="cartoes-grid">
          {visiveis.map((c) => {
            const uso = usoCartao(c, app.lancamentos)
            const pct = c.limite > 0 ? Math.min(100, (uso / c.limite) * 100) : 0
            return (
              <div key={c.id} className={'cartao-visual' + (sel?.id === c.id ? ' sel' : '') + (c.ativo ? '' : ' inativo')}
                style={{ background: `linear-gradient(135deg, ${c.cor}, ${c.cor}99)` }} onClick={() => setSelId(c.id)}>
                <div className="entre"><b>{c.nome}</b><span><button className="mini" onClick={(e) => { e.stopPropagation(); setForm(c) }}>✏️ Editar</button> <button className="mini" onClick={(e) => { e.stopPropagation(); setForm({ ...c, _x: true }) }}>🗑 Excluir</button></span></div>
                <small>{c.bandeira || 'Cartão'}{c.dono_id ? ` · ${app.nomeMembro(c.dono_id)}` : ' · do casal'}</small>
                <div className="barra claro"><i style={{ width: pct + '%' }} /></div>
                <div className="entre"><small>Usado {brl(uso)}</small><small>Livre {brl(Math.max(0, c.limite - uso))}</small></div>
                <small>Fecha dia {c.dia_fechamento} · vence dia {c.dia_vencimento}</small>
                {c.ativo && <button className="mini lancar" onClick={(e) => { e.stopPropagation(); setNovoNo(c.id) }}>+ Lançar neste cartão</button>}
              </div>
            )
          })}
        </div>
      )}

      {sel && <Faturas cartao={sel} lancar={() => setNovoNo(sel.id)} />}
      {novoNo && <NovoLancamento tipoInicial="despesa" cartaoInicial={novoNo} fechar={() => setNovoNo(null)} />}
      {form && <FormCartao cartao={form} fechar={() => setForm(null)} />}
    </div>
  )
}

function Faturas({ cartao, lancar }) {
  const app = useApp()
  const faturas = faturasDoCartao(cartao, app.lancamentos)
  const atual = mesISO()
  const [aberta, setAberta] = useState(() => (faturas.find((f) => f.mes >= atual && f.aberto > 0) || faturas.find((f) => f.mes >= atual))?.mes)
  const [pagar, setPagar] = useState(null)
  const [editar, setEditar] = useState(null)

  if (faturas.length === 0) return <div className="card vazio">Nenhuma compra em {cartao.nome} ainda. <button className="btn primario" onClick={lancar}>+ Lançar neste cartão</button></div>

  return (
    <section className="card">
      <div className="entre"><h3>Faturas · {cartao.nome}</h3><button className="btn primario" onClick={lancar}>+ Lançar neste cartão</button></div>
      <ul className="lista faturas">
        {faturas.map((f) => {
          const paga = f.aberto === 0
          const situacao = paga ? 'Paga' : f.vencimento < hojeISO() ? 'Atrasada' : f.mes === atual ? 'Aberta' : f.mes > atual ? 'Futura' : 'Fechada'
          return (
            <li key={f.mes} className="col-item">
              <div className="entre w100" onClick={() => setAberta(aberta === f.mes ? null : f.mes)}>
                <div><b>{nomeMes(f.mes)}</b><small>Vence {dataBR(f.vencimento)} · {f.itens.length} item(ns)</small></div>
                <div className="dir">
                  <b>{brl(f.total)}</b>
                  <span className={'badge ' + (paga ? 'st-concluido' : situacao === 'Atrasada' ? 'st-atrasado' : 'st-pendente')}>{situacao}</span>
                </div>
              </div>
              {aberta === f.mes && (
                <div className="fatura-itens">
                  <ul>
                    {f.itens.sort((a, b) => a.created_at.localeCompare(b.created_at)).map((l) => (
                      <li key={l.id} onClick={() => setEditar(l)}>
                        <span>{l.descricao}{l.parcela_total > 1 && <small> {l.parcela_num}/{l.parcela_total}</small>}<small> · {app.nomeMembro(l.user_id)}</small></span>
                        <span>{brl(l.valor)} <Acoes editar={() => setEditar(l)} excluir={() => setEditar({ ...l, _x: true })} /></span>
                      </li>
                    ))}
                  </ul>
                  {!paga && <button className="btn primario" onClick={() => setPagar(f)}>Pagar fatura ({brl(f.aberto)})</button>}
                  {f.total - f.aberto > 0 && <DesfazerPagamento cartao={cartao} fatura={f} />}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {pagar && <PagarFatura cartao={cartao} fatura={pagar} fechar={() => setPagar(null)} />}
      {editar && <NovoLancamento editar={editar} fechar={() => setEditar(null)} />}
    </section>
  )
}

function DesfazerPagamento({ cartao, fatura }) {
  const app = useApp()
  const [confirma, setConfirma] = useState(false)
  async function desfazer() {
    const { error } = await supabase.from('lancamentos').update({ status: 'pendente', conta_id: null })
      .eq('cartao_id', cartao.id).eq('fatura_ref', fatura.mes + '-01').eq('status', 'concluido')
    if (error) return app.avisar(erroMsg(error), 'erro')
    await app.carregar()
    app.avisar('Pagamento desfeito')
    setConfirma(false)
  }
  if (!confirma) return <button className="link" onClick={() => setConfirma(true)}>Desfazer pagamento desta fatura</button>
  return (
    <div className="confirma">
      <p>Voltar todos os itens pagos desta fatura para Pendente? O valor volta para o saldo da conta.</p>
      <div className="acoes"><button className="btn" onClick={() => setConfirma(false)}>Não</button><button className="btn perigo" onClick={desfazer}>Desfazer</button></div>
    </div>
  )
}

function PagarFatura({ cartao, fatura, fechar }) {
  const app = useApp()
  const [conta, setConta] = useState(app.contas.find((c) => c.ativo)?.id || '')
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)
  async function ok() {
    setEnviando(true)
    const { error } = await supabase.rpc('pagar_fatura', { p_cartao_id: cartao.id, p_fatura: fatura.mes + '-01', p_conta_id: conta || null })
    setEnviando(false)
    if (error) return setErro(erroMsg(error))
    await app.carregar()
    app.avisar('Fatura paga')
    fechar()
  }
  return (
    <Modal titulo="Pagar fatura" fechar={fechar}>
      <div className="form">
        <p>{cartao.nome} · {nomeMes(fatura.mes)}: <b>{brl(fatura.aberto)}</b></p>
        <label>Pagar com a conta
          <select value={conta} onChange={(e) => setConta(e.target.value)}>
            <option value="">Não informar</option>
            {app.contas.filter((c) => c.ativo).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
        <p className="dica">Todas as compras e parcelas desta fatura ficam como Pagas e o valor sai da conta escolhida.</p>
        {erro && <div className="aviso erro">{erro}</div>}
        <div className="acoes"><span className="flex1" /><button className="btn" onClick={fechar}>Cancelar</button><button className="btn primario" disabled={enviando} onClick={ok}>Confirmar pagamento</button></div>
      </div>
    </Modal>
  )
}

function FormCartao({ cartao, fechar }) {
  const app = useApp()
  const ed = cartao.id ? cartao : null
  const [f, setF] = useState({
    nome: ed?.nome || '', bandeira: ed?.bandeira || '', limite: ed ? String(ed.limite).replace('.', ',') : '',
    dia_fechamento: ed?.dia_fechamento || 1, dia_vencimento: ed?.dia_vencimento || 10,
    cor: ed?.cor || CORES[1], dono_id: ed ? ed.dono_id || '' : app.uid, ativo: ed?.ativo ?? true,
  })
  const [erro, setErro] = useState(null)
  const [confirma, setConfirma] = useState(!!cartao._x)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  async function salvar(e) {
    e.preventDefault()
    const dados = {
      nome: f.nome.trim(), bandeira: f.bandeira.trim() || null, limite: num(f.limite),
      dia_fechamento: Number(f.dia_fechamento), dia_vencimento: Number(f.dia_vencimento),
      cor: f.cor, dono_id: f.dono_id || null, ativo: f.ativo,
    }
    if (!dados.nome) return setErro('Informe o nome do cartão.')
    if (!(dados.dia_fechamento >= 1 && dados.dia_fechamento <= 31 && dados.dia_vencimento >= 1 && dados.dia_vencimento <= 31)) return setErro('Dias devem ser entre 1 e 31.')
    const { error } = ed
      ? await supabase.from('cartoes').update(dados).eq('id', ed.id)
      : await supabase.from('cartoes').insert({ ...dados, casal_id: app.casal.id })
    if (error) return setErro(erroMsg(error))
    await app.carregar()
    app.avisar('Cartão salvo')
    fechar()
  }
  async function excluir() {
    const { error } = await supabase.from('cartoes').delete().eq('id', ed.id)
    if (error) return setErro(erroMsg(error))
    await app.carregar()
    app.avisar('Cartão excluído')
    fechar()
  }

  return (
    <Modal titulo={ed ? 'Editar cartão' : 'Novo cartão'} fechar={fechar}>
      <form className="form" onSubmit={salvar}>
        <div className="linha2">
          <label>Nome<input value={f.nome} onChange={set('nome')} placeholder="Ex.: Nubank" autoFocus /></label>
          <label>Bandeira<input value={f.bandeira} onChange={set('bandeira')} placeholder="Visa, Master…" /></label>
        </div>
        <div className="linha2">
          <label>Limite<input inputMode="decimal" value={f.limite} onChange={set('limite')} placeholder="0,00" /></label>
          <label>De quem é
            <select value={f.dono_id} onChange={set('dono_id')}>
              <option value="">Do casal</option>
              {app.membros.map((m) => <option key={m.user_id} value={m.user_id}>{m.nome}</option>)}
            </select>
          </label>
        </div>
        <div className="linha2">
          <label>Dia do fechamento<input type="number" min={1} max={31} value={f.dia_fechamento} onChange={set('dia_fechamento')} /></label>
          <label>Dia do vencimento<input type="number" min={1} max={31} value={f.dia_vencimento} onChange={set('dia_vencimento')} /></label>
        </div>
        <div><span className="rotulo">Cor</span><div className="cores">{CORES.map((c) => <button type="button" key={c} className={f.cor === c ? 'on' : ''} style={{ background: c }} onClick={() => setF({ ...f, cor: c })} aria-label={c} />)}</div></div>
        {ed && <label className="check"><input type="checkbox" checked={f.ativo} onChange={set('ativo')} /> Cartão ativo</label>}
        {erro && <div className="aviso erro">{erro}</div>}
        <div className="acoes">
          {ed && !confirma && <button type="button" className="btn perigo" onClick={() => setConfirma(true)}>Excluir</button>}
          <span className="flex1" />
          <button type="button" className="btn" onClick={fechar}>Cancelar</button>
          <button className="btn primario">Salvar</button>
        </div>
        {confirma && (
          <div className="confirma">
            <p>Excluir o cartão apaga também todas as compras e parcelas dele. Prefira desmarcar “Cartão ativo” se só parou de usar.</p>
            <div className="acoes"><button type="button" className="btn" onClick={() => setConfirma(false)}>Não</button><button type="button" className="btn perigo" onClick={excluir}>Excluir mesmo assim</button></div>
          </div>
        )}
      </form>
    </Modal>
  )
}
