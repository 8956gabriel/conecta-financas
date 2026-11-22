import { useState } from 'react'
import { useApp, saldoConta } from '../store'
import { supabase, erroMsg } from '../supabase'
import { brl, CORES, num, TIPOS_CONTA } from '../lib'
import Modal from '../components/Modal'

export default function Contas() {
  const app = useApp()
  const [form, setForm] = useState(null)
  const visiveis = app.contas.filter((c) => app.visao === 'casal' || !c.dono_id || c.dono_id === app.visao)
  const total = visiveis.filter((c) => c.ativo).reduce((s, c) => s + saldoConta(c, app.lancamentos), 0)
  const pendRec = app.lancamentos.filter(app.filtra).filter((l) => l.tipo === 'receita' && l.status !== 'concluido').reduce((s, l) => s + Number(l.valor), 0)
  const pendDesp = app.lancamentos.filter(app.filtra).filter((l) => l.tipo === 'despesa' && l.status !== 'concluido').reduce((s, l) => s + Number(l.valor), 0)

  return (
    <div className="pagina">
      <div className="kpis">
        <div className="kpi roxo"><span>Saldo atual</span><b>{brl(total)}</b><small>soma das contas ativas</small></div>
        <div className="kpi verde"><span>A receber</span><b>{brl(pendRec)}</b><small>pendente / agendado</small></div>
        <div className="kpi vermelho"><span>A pagar</span><b>{brl(pendDesp)}</b><small>inclui faturas em aberto</small></div>
        <div className="kpi azul"><span>Saldo previsto</span><b>{brl(total + pendRec - pendDesp)}</b><small>se tudo for pago/recebido</small></div>
      </div>
      <div className="entre">
        <p className="dica">O saldo de cada conta = saldo inicial + o que foi recebido − o que foi pago nela.</p>
        <button className="btn primario" onClick={() => setForm({})}>+ Nova conta</button>
      </div>
      <ul className="card lista">
        {visiveis.length === 0 && <li className="vazio sem-click">Nenhuma conta.</li>}
        {visiveis.map((c) => (
          <li key={c.id} onClick={() => setForm(c)} className={c.ativo ? '' : 'inativo'}>
            <span className="cat-ic" style={{ background: c.cor + '26', color: c.cor }}>◎</span>
            <div className="info"><b>{c.nome}</b><small>{TIPOS_CONTA[c.tipo]} · {c.dono_id ? app.nomeMembro(c.dono_id) : 'do casal'}{c.ativo ? '' : ' · inativa'}</small></div>
            <div className="dir"><b>{brl(saldoConta(c, app.lancamentos))}</b></div>
          </li>
        ))}
      </ul>
      {form && <FormConta conta={form} fechar={() => setForm(null)} />}
    </div>
  )
}

function FormConta({ conta, fechar }) {
  const app = useApp()
  const ed = conta.id ? conta : null
  const [f, setF] = useState({
    nome: ed?.nome || '', tipo: ed?.tipo || 'corrente', saldo_inicial: ed ? String(ed.saldo_inicial).replace('.', ',') : '',
    cor: ed?.cor || CORES[8], dono_id: ed ? ed.dono_id || '' : '', ativo: ed?.ativo ?? true,
  })
  const [erro, setErro] = useState(null)
  const [confirma, setConfirma] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  async function salvar(e) {
    e.preventDefault()
    const dados = { nome: f.nome.trim(), tipo: f.tipo, saldo_inicial: num(f.saldo_inicial), cor: f.cor, dono_id: f.dono_id || null, ativo: f.ativo }
    if (!dados.nome) return setErro('Informe o nome da conta.')
    const { error } = ed ? await supabase.from('contas').update(dados).eq('id', ed.id) : await supabase.from('contas').insert({ ...dados, casal_id: app.casal.id })
    if (error) return setErro(erroMsg(error))
    await app.carregar(); app.avisar('Conta salva'); fechar()
  }
  async function excluir() {
    const { error } = await supabase.from('contas').delete().eq('id', ed.id)
    if (error) return setErro(erroMsg(error))
    await app.carregar(); app.avisar('Conta excluída'); fechar()
  }

  return (
    <Modal titulo={ed ? 'Editar conta' : 'Nova conta'} fechar={fechar}>
      <form className="form" onSubmit={salvar}>
        <label>Nome<input value={f.nome} onChange={set('nome')} placeholder="Ex.: Itaú, Carteira, Poupança" autoFocus /></label>
        <div className="linha2">
          <label>Tipo<select value={f.tipo} onChange={set('tipo')}>{Object.entries(TIPOS_CONTA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>De quem é
            <select value={f.dono_id} onChange={set('dono_id')}>
              <option value="">Do casal</option>
              {app.membros.map((m) => <option key={m.user_id} value={m.user_id}>{m.nome}</option>)}
            </select>
          </label>
        </div>
        <label>Saldo inicial<input inputMode="decimal" value={f.saldo_inicial} onChange={set('saldo_inicial')} placeholder="0,00" /></label>
        <div><span className="rotulo">Cor</span><div className="cores">{CORES.map((c) => <button type="button" key={c} className={f.cor === c ? 'on' : ''} style={{ background: c }} onClick={() => setF({ ...f, cor: c })} aria-label={c} />)}</div></div>
        {ed && <label className="check"><input type="checkbox" checked={f.ativo} onChange={set('ativo')} /> Conta ativa</label>}
        {erro && <div className="aviso erro">{erro}</div>}
        <div className="acoes">
          {ed && !confirma && <button type="button" className="btn perigo" onClick={() => setConfirma(true)}>Excluir</button>}
          <span className="flex1" /><button type="button" className="btn" onClick={fechar}>Cancelar</button><button className="btn primario">Salvar</button>
        </div>
        {confirma && (
          <div className="confirma">
            <p>Os lançamentos ligados a esta conta continuam, mas ficam sem conta. Excluir?</p>
            <div className="acoes"><button type="button" className="btn" onClick={() => setConfirma(false)}>Não</button><button type="button" className="btn perigo" onClick={excluir}>Excluir</button></div>
          </div>
        )}
      </form>
    </Modal>
  )
}
