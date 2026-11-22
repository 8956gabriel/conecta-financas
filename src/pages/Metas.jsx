import { useState } from 'react'
import { useApp } from '../store'
import { supabase, erroMsg } from '../supabase'
import { brl, CORES, dataBR, num } from '../lib'
import Modal from '../components/Modal'

export default function Metas() {
  const app = useApp()
  const [form, setForm] = useState(null)
  const [aporte, setAporte] = useState(null)
  return (
    <div className="pagina">
      <div className="entre">
        <p className="dica">Metas do casal: viagem, reserva de emergência, casa própria…</p>
        <button className="btn primario" onClick={() => setForm({})}>+ Nova meta</button>
      </div>
      {app.metas.length === 0 && <div className="card vazio">Nenhuma meta ainda.</div>}
      <div className="grade">
        {app.metas.map((m) => {
          const pct = Math.min(100, (m.valor_atual / m.valor_alvo) * 100)
          const falta = Math.max(0, m.valor_alvo - m.valor_atual)
          let porMes = null
          if (m.prazo && falta > 0) {
            const hoje = new Date(), p = new Date(m.prazo + 'T12:00')
            const meses = Math.max(1, (p.getFullYear() - hoje.getFullYear()) * 12 + p.getMonth() - hoje.getMonth())
            porMes = falta / meses
          }
          return (
            <section key={m.id} className="card meta">
              <div className="entre"><h3><i className="dot" style={{ background: m.cor }} />{m.nome}</h3><button className="link" onClick={() => setForm(m)}>Editar</button></div>
              <div className="meta-num"><b>{brl(m.valor_atual)}</b><span>de {brl(m.valor_alvo)}</span></div>
              <div className="barra grossa"><i style={{ width: pct + '%', background: m.cor }} /></div>
              <div className="entre"><small>{Math.round(pct)}% · faltam {brl(falta)}</small>{m.prazo && <small>até {dataBR(m.prazo)}</small>}</div>
              {porMes && <p className="dica">Guardando {brl(porMes)} por mês vocês chegam lá no prazo.</p>}
              {pct >= 100 ? <p className="txt-verde">Meta alcançada! 🎉</p> : <button className="btn" onClick={() => setAporte(m)}>Guardar dinheiro</button>}
            </section>
          )
        })}
      </div>
      {form && <FormMeta meta={form} fechar={() => setForm(null)} />}
      {aporte && <Aporte meta={aporte} fechar={() => setAporte(null)} />}
    </div>
  )
}

function Aporte({ meta, fechar }) {
  const app = useApp()
  const [valor, setValor] = useState('')
  const [retirar, setRetirar] = useState(false)
  const [erro, setErro] = useState(null)
  async function ok(e) {
    e.preventDefault()
    const v = num(valor)
    if (!(v > 0)) return setErro('Informe um valor.')
    const novo = Math.max(0, Number(meta.valor_atual) + (retirar ? -v : v))
    const { error } = await supabase.from('metas').update({ valor_atual: novo }).eq('id', meta.id)
    if (error) return setErro(erroMsg(error))
    await app.carregar(); app.avisar(retirar ? 'Valor retirado' : 'Valor guardado'); fechar()
  }
  return (
    <Modal titulo={meta.nome} fechar={fechar}>
      <form className="form" onSubmit={ok}>
        <div className="seg full"><button type="button" className={!retirar ? 'on' : ''} onClick={() => setRetirar(false)}>Guardar</button><button type="button" className={retirar ? 'on' : ''} onClick={() => setRetirar(true)}>Retirar</button></div>
        <label>Valor<input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" autoFocus /></label>
        {erro && <div className="aviso erro">{erro}</div>}
        <div className="acoes"><span className="flex1" /><button type="button" className="btn" onClick={fechar}>Cancelar</button><button className="btn primario">Confirmar</button></div>
      </form>
    </Modal>
  )
}

function FormMeta({ meta, fechar }) {
  const app = useApp()
  const ed = meta.id ? meta : null
  const [f, setF] = useState({ nome: ed?.nome || '', valor_alvo: ed ? String(ed.valor_alvo).replace('.', ',') : '', valor_atual: ed ? String(ed.valor_atual).replace('.', ',') : '', prazo: ed?.prazo || '', cor: ed?.cor || CORES[6] })
  const [erro, setErro] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  async function salvar(e) {
    e.preventDefault()
    const dados = { nome: f.nome.trim(), valor_alvo: num(f.valor_alvo), valor_atual: num(f.valor_atual), prazo: f.prazo || null, cor: f.cor }
    if (!dados.nome || !(dados.valor_alvo > 0)) return setErro('Informe nome e valor da meta.')
    const { error } = ed ? await supabase.from('metas').update(dados).eq('id', ed.id) : await supabase.from('metas').insert({ ...dados, casal_id: app.casal.id })
    if (error) return setErro(erroMsg(error))
    await app.carregar(); app.avisar('Meta salva'); fechar()
  }
  async function excluir() {
    const { error } = await supabase.from('metas').delete().eq('id', ed.id)
    if (error) return setErro(erroMsg(error))
    await app.carregar(); app.avisar('Meta excluída'); fechar()
  }
  return (
    <Modal titulo={ed ? 'Editar meta' : 'Nova meta'} fechar={fechar}>
      <form className="form" onSubmit={salvar}>
        <label>Nome<input value={f.nome} onChange={set('nome')} placeholder="Ex.: Viagem de férias" autoFocus /></label>
        <div className="linha2">
          <label>Valor da meta<input inputMode="decimal" value={f.valor_alvo} onChange={set('valor_alvo')} placeholder="0,00" /></label>
          <label>Já guardado<input inputMode="decimal" value={f.valor_atual} onChange={set('valor_atual')} placeholder="0,00" /></label>
        </div>
        <label>Prazo (opcional)<input type="date" value={f.prazo} onChange={set('prazo')} /></label>
        <div><span className="rotulo">Cor</span><div className="cores">{CORES.map((c) => <button type="button" key={c} className={f.cor === c ? 'on' : ''} style={{ background: c }} onClick={() => setF({ ...f, cor: c })} aria-label={c} />)}</div></div>
        {erro && <div className="aviso erro">{erro}</div>}
        <div className="acoes">{ed && <button type="button" className="btn perigo" onClick={excluir}>Excluir</button>}<span className="flex1" /><button type="button" className="btn" onClick={fechar}>Cancelar</button><button className="btn primario">Salvar</button></div>
      </form>
    </Modal>
  )
}
