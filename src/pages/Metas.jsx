import { useState } from 'react'
import { useApp, mediaDespesasMensal } from '../store'
import { supabase, erroMsg } from '../supabase'
import { brl, CORES, dataBR, hojeISO, num } from '../lib'
import Modal from '../components/Modal'

export const MODELOS_META = [
  { icone: '✈️', nome: 'Viagem', cor: '#0ea5e9' },
  { icone: '🚗', nome: 'Trocar de carro', cor: '#f97316' },
  { icone: '🛠️', nome: 'Reforma da casa', cor: '#eab308' },
  { icone: '🏡', nome: 'Casa própria', cor: '#10b981' },
  { icone: '🎓', nome: 'Estudos', cor: '#8b5cf6' },
  { icone: '💍', nome: 'Casamento', cor: '#ec4899' },
  { icone: '👶', nome: 'Filhos', cor: '#14b8a6' },
  { icone: '📱', nome: 'Eletrônicos', cor: '#3b82f6' },
  { icone: '🎯', nome: '', cor: '#6366f1' },
]
const ICONES = ['🎯', '✈️', '🚗', '🛠️', '🏡', '🎓', '💍', '👶', '📱', '🏖️', '🐶', '💻', '🎁', '💰', '🛟', '🏍️']

function mesesAte(prazo) {
  if (!prazo) return null
  const hoje = new Date(), p = new Date(prazo + 'T12:00')
  return Math.max(1, (p.getFullYear() - hoje.getFullYear()) * 12 + p.getMonth() - hoje.getMonth())
}

export default function Metas() {
  const app = useApp()
  const [form, setForm] = useState(null)
  const [mov, setMov] = useState(null)
  const [detalhe, setDetalhe] = useState(null)

  const reservas = app.metas.filter((m) => m.tipo === 'reserva')
  const economias = app.metas.filter((m) => m.tipo === 'economia')
  const metas = app.metas.filter((m) => m.tipo === 'meta')
  const totalGuardado = app.metas.reduce((s, m) => s + Number(m.valor_atual), 0)
  const media = mediaDespesasMensal(app.lancamentos)

  const acoes = { editar: setForm, movimentar: setMov, detalhes: setDetalhe }

  return (
    <div className="pagina">
      <div className="kpis">
        <div className="kpi roxo"><span>Total guardado</span><b>{brl(totalGuardado)}</b><small>reserva + economias + metas</small></div>
        <div className="kpi azul"><span>Reserva de emergência</span><b>{brl(reservas.reduce((s, m) => s + Number(m.valor_atual), 0))}</b><small>{media > 0 ? `cobre ${(reservas.reduce((s, m) => s + Number(m.valor_atual), 0) / media).toFixed(1).replace('.', ',')} meses de gastos` : 'lance despesas para calcular'}</small></div>
        <div className="kpi verde"><span>Economias</span><b>{brl(economias.reduce((s, m) => s + Number(m.valor_atual), 0))}</b><small>{economias.length} caixinha(s)</small></div>
        <div className="kpi"><span>Metas</span><b>{brl(metas.reduce((s, m) => s + Number(m.valor_atual), 0))}</b><small>{metas.length} meta(s)</small></div>
      </div>

      {/* Reserva de emergência */}
      <section className="bloco-meta">
        <div className="entre">
          <h2>🛟 Reserva de emergência</h2>
          {reservas.length === 0 && <button className="btn primario" onClick={() => setForm({ tipo: 'reserva' })}>Criar reserva</button>}
        </div>
        {reservas.length === 0 ? (
          <div className="card vazio texto-esq">
            <p>Dinheiro guardado para imprevistos: perda de emprego, saúde, conserto urgente. O ideal é cobrir de <b>3 a 6 meses</b> dos gastos do casal.</p>
            {media > 0 && <p className="dica">Pelos lançamentos, vocês gastam em média <b>{brl(media)}</b> por mês → reserva de 6 meses = <b>{brl(media * 6)}</b>.</p>}
          </div>
        ) : (
          <div className="grade">{reservas.map((m) => <CartaoMeta key={m.id} m={m} media={media} {...acoes} />)}</div>
        )}
      </section>

      {/* Economias */}
      <section className="bloco-meta">
        <div className="entre">
          <h2>💰 Economias</h2>
          <button className="btn" onClick={() => setForm({ tipo: 'economia' })}>+ Nova economia</button>
        </div>
        {economias.length === 0 ? (
          <div className="card vazio texto-esq"><p>“Caixinhas” para guardar sem prazo: poupança, investimentos, 13º, dinheiro guardado em casa…</p></div>
        ) : (
          <div className="grade">{economias.map((m) => <CartaoMeta key={m.id} m={m} {...acoes} />)}</div>
        )}
      </section>

      {/* Metas */}
      <section className="bloco-meta">
        <div className="entre">
          <h2>🎯 Metas</h2>
          <button className="btn primario" onClick={() => setForm({ tipo: 'meta' })}>+ Nova meta</button>
        </div>
        {metas.length === 0 && (
          <div className="card">
            <p className="dica" style={{ marginBottom: 10 }}>Escolha um modelo para começar:</p>
            <div className="modelos">
              {MODELOS_META.filter((x) => x.nome).map((x) => (
                <button key={x.nome} onClick={() => setForm({ tipo: 'meta', nome: x.nome, icone: x.icone, cor: x.cor })}><span>{x.icone}</span>{x.nome}</button>
              ))}
            </div>
          </div>
        )}
        <div className="grade">{metas.map((m) => <CartaoMeta key={m.id} m={m} {...acoes} />)}</div>
      </section>

      {form && <FormMeta meta={form} media={media} fechar={() => setForm(null)} />}
      {mov && <Movimentar meta={mov.meta} retirar={mov.retirar} fechar={() => setMov(null)} />}
      {detalhe && <Historico meta={app.metas.find((x) => x.id === detalhe.id) || detalhe} fechar={() => setDetalhe(null)} abrirMov={setMov} />}
    </div>
  )
}

function CartaoMeta({ m, media, editar, movimentar, detalhes }) {
  const atual = Number(m.valor_atual)
  const alvo = m.valor_alvo ? Number(m.valor_alvo) : null
  const pct = alvo ? Math.min(100, (atual / alvo) * 100) : null
  const falta = alvo ? Math.max(0, alvo - atual) : 0
  const meses = mesesAte(m.prazo)
  return (
    <section className="card meta">
      <div className="entre">
        <h3 onClick={() => detalhes(m)} className="clicavel"><span className="meta-ic" style={{ background: m.cor + '26' }}>{m.icone}</span>{m.nome}</h3>
        <button className="link" onClick={() => editar(m)}>Editar</button>
      </div>
      {m.descricao && <p className="dica">{m.descricao}</p>}
      <div className="meta-num"><b>{brl(atual)}</b>{alvo && <span>de {brl(alvo)}</span>}</div>
      {alvo && <div className="barra grossa"><i style={{ width: pct + '%', background: m.cor }} /></div>}
      {alvo && <div className="entre"><small>{Math.round(pct)}% · faltam {brl(falta)}</small>{m.prazo && <small>até {dataBR(m.prazo)}</small>}</div>}
      {m.tipo === 'reserva' && media > 0 && <p className="dica">Cobre <b>{(atual / media).toFixed(1).replace('.', ',')} meses</b> dos gastos atuais ({brl(media)}/mês).</p>}
      {meses && falta > 0 && <p className="dica">Guardando <b>{brl(falta / meses)}</b> por mês vocês chegam lá no prazo.</p>}
      {alvo && pct >= 100 && <p className="txt-verde">Meta alcançada! 🎉</p>}
      <div className="acoes">
        <button className="btn receita" onClick={() => movimentar({ meta: m, retirar: false })}>+ Guardar</button>
        <button className="btn" onClick={() => movimentar({ meta: m, retirar: true })} disabled={atual <= 0}>− Retirar</button>
        <span className="flex1" />
        <button className="link" onClick={() => detalhes(m)}>Histórico</button>
      </div>
    </section>
  )
}

function Movimentar({ meta, retirar: retirarInicial, fechar }) {
  const app = useApp()
  const [retirar, setRetirar] = useState(retirarInicial)
  const [valor, setValor] = useState('')
  const [data, setData] = useState(hojeISO())
  const [descricao, setDescricao] = useState('')
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)
  async function ok(e) {
    e.preventDefault()
    const v = num(valor)
    if (!(v > 0)) return setErro('Informe um valor.')
    setEnviando(true)
    const { error } = await supabase.rpc('movimentar_meta', { p_meta_id: meta.id, p_valor: retirar ? -v : v, p_descricao: descricao, p_data: data })
    setEnviando(false)
    if (error) return setErro(erroMsg(error))
    await app.carregar(); app.avisar(retirar ? 'Valor retirado' : 'Valor guardado'); fechar()
  }
  return (
    <Modal titulo={`${meta.icone} ${meta.nome}`} fechar={fechar}>
      <form className="form" onSubmit={ok}>
        <p className="dica">Saldo atual: <b>{brl(meta.valor_atual)}</b></p>
        <div className="seg full tipo">
          <button type="button" className={!retirar ? 'on receita' : ''} onClick={() => setRetirar(false)}>Guardar</button>
          <button type="button" className={retirar ? 'on despesa' : ''} onClick={() => setRetirar(true)}>Retirar</button>
        </div>
        <div className="linha2">
          <label>Valor<input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" autoFocus /></label>
          <label>Data<input type="date" value={data} onChange={(e) => setData(e.target.value)} /></label>
        </div>
        <label>Observação (opcional)<input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={retirar ? 'Ex.: conserto do carro' : 'Ex.: sobra do salário'} /></label>
        {erro && <div className="aviso erro">{erro}</div>}
        <div className="acoes"><span className="flex1" /><button type="button" className="btn" onClick={fechar}>Cancelar</button><button className="btn primario" disabled={enviando}>Confirmar</button></div>
      </form>
    </Modal>
  )
}

function Historico({ meta, fechar, abrirMov }) {
  const app = useApp()
  const lista = (app.movimentos || []).filter((x) => x.meta_id === meta.id)
  const guardado = lista.filter((x) => x.valor > 0).reduce((s, x) => s + Number(x.valor), 0)
  const retirado = lista.filter((x) => x.valor < 0).reduce((s, x) => s - Number(x.valor), 0)
  return (
    <Modal titulo={`${meta.icone} ${meta.nome}`} fechar={fechar}>
      <div className="form">
        <div className="totais"><span>Saldo <b>{brl(meta.valor_atual)}</b></span><span>Guardado <b className="txt-verde">{brl(guardado)}</b></span><span>Retirado <b className="txt-vermelho">{brl(retirado)}</b></span></div>
        {lista.length === 0 ? <p className="vazio">Nenhuma movimentação ainda.</p> : (
          <ul className="lista">
            {lista.map((x) => (
              <li key={x.id} className="sem-click">
                <div className="info"><b>{x.valor > 0 ? 'Guardou' : 'Retirou'}{x.descricao ? ` · ${x.descricao}` : ''}</b><small>{dataBR(x.data)} · {app.nomeMembro(x.user_id)}</small></div>
                <div className="dir"><span className={x.valor > 0 ? 'txt-verde' : 'txt-vermelho'}>{x.valor > 0 ? '+' : '−'}{brl(Math.abs(x.valor))}</span></div>
              </li>
            ))}
          </ul>
        )}
        <div className="acoes"><span className="flex1" /><button className="btn" onClick={() => { fechar(); abrirMov({ meta, retirar: true }) }}>− Retirar</button><button className="btn receita" onClick={() => { fechar(); abrirMov({ meta, retirar: false }) }}>+ Guardar</button></div>
      </div>
    </Modal>
  )
}

function FormMeta({ meta, media, fechar }) {
  const app = useApp()
  const ed = meta.id ? meta : null
  const tipo = meta.tipo || 'meta'
  const padrao = tipo === 'reserva' ? { nome: 'Reserva de emergência', icone: '🛟', cor: '#0ea5e9' } : tipo === 'economia' ? { nome: '', icone: '💰', cor: '#10b981' } : { nome: '', icone: '🎯', cor: '#6366f1' }
  const [f, setF] = useState({
    nome: meta.nome ?? padrao.nome, icone: meta.icone || padrao.icone, cor: meta.cor || padrao.cor,
    descricao: meta.descricao || '',
    valor_alvo: meta.valor_alvo ? String(meta.valor_alvo).replace('.', ',') : '',
    valor_atual: ed ? '' : '', prazo: meta.prazo || '',
    meses_reserva: meta.meses_reserva || 6,
  })
  const [erro, setErro] = useState(null)
  const [confirma, setConfirma] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const sugestaoReserva = media > 0 ? Math.round(media * Number(f.meses_reserva || 6)) : 0

  async function salvar(e) {
    e.preventDefault()
    const alvo = num(f.valor_alvo)
    if (!f.nome.trim()) return setErro('Dê um título.')
    if (tipo === 'meta' && !(alvo > 0)) return setErro('Informe quanto vocês querem juntar.')
    const dados = {
      tipo, nome: f.nome.trim(), icone: f.icone, cor: f.cor, descricao: f.descricao.trim() || null,
      valor_alvo: alvo > 0 ? alvo : null, prazo: f.prazo || null,
      meses_reserva: tipo === 'reserva' ? Number(f.meses_reserva) || null : null,
    }
    if (ed) {
      const { error } = await supabase.from('metas').update(dados).eq('id', ed.id)
      if (error) return setErro(erroMsg(error))
    } else {
      const { data: nova, error } = await supabase.from('metas').insert({ ...dados, casal_id: app.casal.id, valor_atual: 0 }).select().single()
      if (error) return setErro(erroMsg(error))
      const inicial = num(f.valor_atual)
      if (inicial > 0) {
        const r = await supabase.rpc('movimentar_meta', { p_meta_id: nova.id, p_valor: inicial, p_descricao: 'Saldo inicial', p_data: hojeISO() })
        if (r.error) return setErro(erroMsg(r.error))
      }
    }
    await app.carregar(); app.avisar('Salvo'); fechar()
  }
  async function excluir() {
    const { error } = await supabase.from('metas').delete().eq('id', ed.id)
    if (error) return setErro(erroMsg(error))
    await app.carregar(); app.avisar('Excluído'); fechar()
  }

  const titulo = { reserva: 'Reserva de emergência', economia: ed ? 'Editar economia' : 'Nova economia', meta: ed ? 'Editar meta' : 'Nova meta' }[tipo]

  return (
    <Modal titulo={titulo} fechar={fechar}>
      <form className="form" onSubmit={salvar}>
        {tipo === 'meta' && !ed && (
          <div className="modelos pequenos">
            {MODELOS_META.filter((x) => x.nome).map((x) => (
              <button type="button" key={x.nome} className={f.nome === x.nome ? 'on' : ''} onClick={() => setF({ ...f, nome: x.nome, icone: x.icone, cor: x.cor })}><span>{x.icone}</span>{x.nome}</button>
            ))}
          </div>
        )}
        <label>Título<input value={f.nome} onChange={set('nome')} placeholder={tipo === 'economia' ? 'Ex.: Poupança, Tesouro Direto, 13º' : 'Ex.: Viagem para a praia'} /></label>
        <div><span className="rotulo">Ícone</span><div className="icones">{ICONES.map((i) => <button type="button" key={i} className={f.icone === i ? 'on' : ''} onClick={() => setF({ ...f, icone: i })}>{i}</button>)}</div></div>

        {tipo === 'reserva' && (
          <>
            <div><span className="rotulo">Quantos meses de gastos a reserva deve cobrir?</span>
              <div className="seg full pequeno">{[3, 6, 9, 12].map((n) => <button type="button" key={n} className={Number(f.meses_reserva) === n ? 'on' : ''} onClick={() => setF({ ...f, meses_reserva: n, valor_alvo: media > 0 ? String(Math.round(media * n)) : f.valor_alvo })}>{n} meses</button>)}</div>
            </div>
            {sugestaoReserva > 0 && <p className="dica destaque">Vocês gastam em média {brl(media)}/mês → sugestão: {brl(sugestaoReserva)}</p>}
          </>
        )}

        <div className="linha2">
          <label>{tipo === 'meta' ? 'Quanto querem juntar' : 'Objetivo (opcional)'}<input inputMode="decimal" value={f.valor_alvo} onChange={set('valor_alvo')} placeholder="0,00" /></label>
          {!ed ? <label>Já têm guardado<input inputMode="decimal" value={f.valor_atual} onChange={set('valor_atual')} placeholder="0,00" /></label>
            : <label>Prazo {tipo === 'meta' ? '' : '(opcional)'}<input type="date" value={f.prazo} onChange={set('prazo')} /></label>}
        </div>
        {!ed && tipo !== 'economia' && <label>Prazo (opcional)<input type="date" value={f.prazo} onChange={set('prazo')} /></label>}
        <label>Observação (opcional)<input value={f.descricao} onChange={set('descricao')} placeholder={tipo === 'reserva' ? 'Ex.: fica na poupança do Nubank' : 'Ex.: onde o dinheiro está guardado'} /></label>
        <div><span className="rotulo">Cor</span><div className="cores">{CORES.map((c) => <button type="button" key={c} className={f.cor === c ? 'on' : ''} style={{ background: c }} onClick={() => setF({ ...f, cor: c })} aria-label={c} />)}</div></div>
        {ed && <p className="dica">Para mudar o saldo, use “+ Guardar” ou “− Retirar” no cartão (fica no histórico).</p>}
        {erro && <div className="aviso erro">{erro}</div>}
        <div className="acoes">
          {ed && !confirma && <button type="button" className="btn perigo" onClick={() => setConfirma(true)}>Excluir</button>}
          <span className="flex1" /><button type="button" className="btn" onClick={fechar}>Cancelar</button><button className="btn primario">Salvar</button>
        </div>
        {confirma && (
          <div className="confirma">
            <p>Excluir “{ed.nome}” e todo o histórico? Não dá para desfazer.</p>
            <div className="acoes"><button type="button" className="btn" onClick={() => setConfirma(false)}>Não</button><button type="button" className="btn perigo" onClick={excluir}>Excluir</button></div>
          </div>
        )}
      </form>
    </Modal>
  )
}
