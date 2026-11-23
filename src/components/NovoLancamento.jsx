import { useMemo, useState } from 'react'
import Modal from './Modal'
import { supabase, erroMsg } from '../supabase'
import { useApp } from '../store'
import { brl, hojeISO, mesISO, num, statusLabel } from '../lib'

// soma meses a uma data ISO mantendo o dia (limitado ao fim do mês)
function maisMeses(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  const ultimo = new Date(y, m - 1 + n + 1, 0).getDate()
  const dt = new Date(y, m - 1 + n, Math.min(d, ultimo))
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

// dia X do mês "AAAA-MM" (limitado ao último dia do mês)
function diaNoMes(mes, dia) {
  const [y, m] = mes.split('-').map(Number)
  const ultimo = new Date(y, m, 0).getDate()
  return `${mes}-${String(Math.min(Number(dia) || 1, ultimo)).padStart(2, '0')}`
}

export default function NovoLancamento({ tipoInicial = 'despesa', dataInicial, editar, fechar }) {
  const app = useApp()
  const ed = editar || null
  const [tipo, setTipo] = useState(ed?.tipo || tipoInicial)
  const [descricao, setDescricao] = useState(ed?.descricao || '')
  const [valor, setValor] = useState(ed ? String(ed.valor).replace('.', ',') : '')
  const [data, setData] = useState(ed?.data || dataInicial || hojeISO())
  const [categoria, setCategoria] = useState(ed?.categoria_id || '')
  const [resp, setResp] = useState(ed?.user_id || (app.visao !== 'casal' ? app.visao : app.uid))
  const [forma, setForma] = useState(ed?.cartao_id ? 'cartao' : 'conta')
  const [modo, setModo] = useState('unica') // unica | parcelado | fixa
  const [parcelas, setParcelas] = useState(2)
  const [meses, setMeses] = useState(12)
  const contasAtivas = app.contas.filter((c) => c.ativo)
  const cartoesAtivos = app.cartoes.filter((c) => c.ativo)
  const [conta, setConta] = useState(ed?.conta_id || contasAtivas[0]?.id || '')
  const [cartao, setCartao] = useState(ed?.cartao_id || cartoesAtivos[0]?.id || '')
  const [status, setStatus] = useState(ed?.status || 'pendente')
  const [obs, setObs] = useState(ed?.observacao || '')
  const [erro, setErro] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [confirmaExcluir, setConfirmaExcluir] = useState(false)
  const [faturaMes, setFaturaMes] = useState(ed?.fatura_ref ? ed.fatura_ref.slice(0, 7) : mesISO())
  const [todas, setTodas] = useState(false) // editar todas as parcelas da compra
  const ehParcelado = !!(ed?.compra_id && ed.parcela_total > 1)
  const edCartao = !!ed?.cartao_id

  function trocarCartao(id) {
    setCartao(id)
    const c = app.cartao(id)
    if (edCartao && c) setData(diaNoMes(faturaMes, c.dia_vencimento))
  }
  function trocarFatura(mes) {
    if (!mes) return
    setFaturaMes(mes)
    const c = app.cartao(cartao)
    if (c) setData(diaNoMes(mes, c.dia_vencimento))
  }

  const cats = app.categorias.filter((c) => c.tipo === tipo)
  const v = num(valor)
  const ehCartao = tipo === 'despesa' && forma === 'cartao'
  const nParcelas = ehCartao ? (modo === 'parcelado' ? parcelas : 1) : modo === 'parcelado' ? parcelas : 1

  const resumo = useMemo(() => {
    if (!v) return ''
    if (nParcelas > 1) return `${nParcelas}x de ${brl(v / nParcelas)}`
    if (modo === 'fixa') return `${brl(v)} por mês, durante ${meses} meses`
    return ''
  }, [v, nParcelas, modo, meses])

  async function salvar(e) {
    e.preventDefault()
    setErro(null)
    if (!descricao.trim()) return setErro('Informe uma descrição.')
    if (!(v > 0)) return setErro('Informe um valor maior que zero.')
    if (ehCartao && !cartao && !ed) return setErro('Cadastre um cartão primeiro (aba Cartões).')
    setSalvando(true)
    try {
      if (ed) {
        const desc = descricao.trim()
        const upd = {
          tipo, descricao: desc, valor: v, data, categoria_id: categoria || null, user_id: resp,
          status, observacao: obs || null,
        }
        if (edCartao) {
          if (!cartao) throw new Error('Escolha o cartão.')
          upd.cartao_id = cartao
          upd.fatura_ref = faturaMes + '-01'
          upd.conta_id = status === 'concluido' ? conta || null : null
        } else {
          upd.conta_id = conta || null
        }
        const { error } = await supabase.from('lancamentos').update(upd).eq('id', ed.id)
        if (error) throw error

        if (todas && ehParcelado) {
          // aplica descrição, categoria, responsável, cartão e valor da parcela às demais parcelas
          const mudouValor = v !== Number(ed.valor)
          const novoCartao = edCartao ? app.cartao(cartao) : null
          const outras = app.lancamentos.filter((l) => l.compra_id === ed.compra_id && l.id !== ed.id)
          const res = await Promise.all(outras.map((l) => {
            const u = { descricao: desc, categoria_id: categoria || null, user_id: resp }
            if (mudouValor) u.valor = v
            if (novoCartao && novoCartao.id !== l.cartao_id) {
              u.cartao_id = novoCartao.id
              if (l.fatura_ref) u.data = diaNoMes(l.fatura_ref.slice(0, 7), novoCartao.dia_vencimento)
            }
            return supabase.from('lancamentos').update(u).eq('id', l.id)
          }))
          const e2 = res.find((r) => r.error)
          if (e2) throw e2.error
          const uc = { descricao: desc, categoria_id: categoria || null, user_id: resp }
          if (mudouValor) uc.valor_total = Math.round(v * ed.parcela_total * 100) / 100
          if (novoCartao) uc.cartao_id = novoCartao.id
          const { error: e3 } = await supabase.from('compras').update(uc).eq('id', ed.compra_id)
          if (e3) throw e3
        }
      } else if (tipo === 'despesa' && (ehCartao || modo === 'parcelado')) {
        const { error } = await supabase.rpc('criar_compra', {
          p_descricao: descricao.trim(), p_valor_total: v, p_parcelas: nParcelas, p_data: data,
          p_cartao_id: ehCartao ? cartao : null, p_conta_id: ehCartao ? null : conta || null,
          p_categoria_id: categoria || null, p_user_id: resp, p_status: status,
        })
        if (error) throw error
      } else {
        const n = modo === 'fixa' ? Math.max(1, Math.min(60, Number(meses) || 1)) : 1
        const linhas = Array.from({ length: n }, (_, i) => ({
          casal_id: app.casal.id, user_id: resp, tipo, descricao: descricao.trim(), valor: v,
          data: maisMeses(data, i), categoria_id: categoria || null, conta_id: conta || null,
          status: status === 'concluido' && i > 0 ? 'pendente' : status,
          observacao: obs || null,
          ...(n > 1 ? { parcela_num: i + 1, parcela_total: n } : {}),
        }))
        const { error } = await supabase.from('lancamentos').insert(linhas)
        if (error) throw error
      }
      await app.carregar()
      app.avisar(ed ? (todas && ehParcelado ? 'Todas as parcelas atualizadas' : 'Lançamento atualizado') : 'Lançamento salvo')
      fechar()
    } catch (err) {
      setErro(erroMsg(err))
    } finally {
      setSalvando(false)
    }
  }

  async function excluir(tudo) {
    setSalvando(true)
    const q = tudo && ed.compra_id
      ? supabase.from('compras').delete().eq('id', ed.compra_id)
      : supabase.from('lancamentos').delete().eq('id', ed.id)
    const { error } = await q
    setSalvando(false)
    if (error) return setErro(erroMsg(error))
    await app.carregar()
    app.avisar('Excluído')
    fechar()
  }

  return (
    <Modal titulo={ed ? 'Editar lançamento' : 'Novo lançamento'} fechar={fechar}>
      <form className="form" onSubmit={salvar}>
        {(!ed || (!ed.compra_id && !ed.cartao_id)) && (
          <div className="seg full tipo">
            <button type="button" className={tipo === 'despesa' ? 'on despesa' : ''} onClick={() => { setTipo('despesa'); setCategoria('') }}>Despesa</button>
            <button type="button" className={tipo === 'receita' ? 'on receita' : ''} onClick={() => { setTipo('receita'); setCategoria(''); setForma('conta'); if (modo === 'parcelado') setModo('unica') }}>Receita</button>
          </div>
        )}

        <label>Descrição<input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={tipo === 'receita' ? 'Ex.: Salário' : 'Ex.: Mercado'} autoFocus={!ed} /></label>

        <div className="linha2">
          <label>{nParcelas > 1 && !ed ? 'Valor total' : todas && ehParcelado ? 'Valor de cada parcela' : 'Valor'}<input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" /></label>
          <label>{ehCartao && !ed ? 'Data da compra' : 'Data'}<input type="date" value={data} onChange={(e) => setData(e.target.value)} required /></label>
        </div>

        <div className="linha2">
          <label>Categoria
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Sem categoria</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <label>Responsável
            <select value={resp} onChange={(e) => setResp(e.target.value)}>
              {app.membros.map((m) => <option key={m.user_id} value={m.user_id}>{m.user_id === app.uid ? `${m.nome} (eu)` : m.nome}</option>)}
            </select>
          </label>
        </div>

        {!ed && tipo === 'despesa' && (
          <div className="seg full">
            <button type="button" className={forma === 'conta' ? 'on' : ''} onClick={() => setForma('conta')}>Conta / dinheiro / Pix</button>
            <button type="button" className={forma === 'cartao' ? 'on' : ''} onClick={() => { setForma('cartao'); if (modo === 'fixa') setModo('unica') }}>Cartão de crédito</button>
          </div>
        )}

        {!ed && (
          <div className="seg full pequeno">
            <button type="button" className={modo === 'unica' ? 'on' : ''} onClick={() => setModo('unica')}>À vista</button>
            {tipo === 'despesa' && <button type="button" className={modo === 'parcelado' ? 'on' : ''} onClick={() => setModo('parcelado')}>Parcelado</button>}
            {!ehCartao && <button type="button" className={modo === 'fixa' ? 'on' : ''} onClick={() => setModo('fixa')}>Fixa mensal</button>}
          </div>
        )}

        {!ed && modo === 'parcelado' && (
          <label>Número de parcelas<input type="number" min={2} max={48} value={parcelas} onChange={(e) => setParcelas(Math.max(2, Math.min(48, Number(e.target.value) || 2)))} /></label>
        )}
        {!ed && modo === 'fixa' && (
          <label>Repetir por quantos meses<input type="number" min={2} max={60} value={meses} onChange={(e) => setMeses(e.target.value)} /></label>
        )}
        {resumo && <p className="dica destaque">{resumo}</p>}

        {edCartao && (
          <div className="linha2">
            <label>Cartão
              <select value={cartao} onChange={(e) => trocarCartao(e.target.value)}>
                {app.cartoes.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.ativo ? '' : ' (inativo)'}</option>)}
              </select>
            </label>
            <label>Fatura de
              <input type="month" value={faturaMes} onChange={(e) => trocarFatura(e.target.value)} />
            </label>
          </div>
        )}
        {edCartao && status === 'concluido' && (
          <label>Pago com a conta
            <select value={conta} onChange={(e) => setConta(e.target.value)}>
              <option value="">Não informar</option>
              {contasAtivas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
        )}

        {edCartao ? null : (ehCartao && !ed) ? (
          <label>Cartão
            <select value={cartao} onChange={(e) => setCartao(e.target.value)}>
              {cartoesAtivos.length === 0 && <option value="">Nenhum cartão cadastrado</option>}
              {cartoesAtivos.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.dono_id ? ` · ${app.nomeMembro(c.dono_id)}` : ''}</option>)}
            </select>
          </label>
        ) : (
          <label>{tipo === 'receita' ? 'Entra na conta' : 'Sai da conta'}
            <select value={conta} onChange={(e) => setConta(e.target.value)}>
              <option value="">Não informar</option>
              {contasAtivas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
        )}

        {(!ehCartao || ed) && (
          <div>
            <span className="rotulo">Status</span>
            <div className="seg full pequeno">
              {['pendente', 'agendado', 'concluido'].map((s) => (
                <button type="button" key={s} className={status === s ? 'on st-' + s : ''} onClick={() => setStatus(s)}>{statusLabel(s, tipo)}</button>
              ))}
            </div>
          </div>
        )}
        {ehCartao && !ed && <p className="dica">Compras no cartão entram na fatura e ficam como Pendente até você pagar a fatura.</p>}

        {ed && <label>Observação<input value={obs} onChange={(e) => setObs(e.target.value)} /></label>}
        {ed?.parcela_total > 1 && <p className="dica">Parcela {ed.parcela_num} de {ed.parcela_total}{ed.cartao_id ? ` · ${app.cartao(ed.cartao_id)?.nome || 'cartão'}` : ''}</p>}
        {ehParcelado && (
          <label className="check"><input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} /> Aplicar descrição, categoria, responsável{edCartao ? ', cartão' : ''} e valor a todas as {ed.parcela_total} parcelas</label>
        )}

        {erro && <div className="aviso erro">{erro}</div>}

        <div className="acoes">
          {ed && !confirmaExcluir && <button type="button" className="btn perigo" onClick={() => setConfirmaExcluir(true)}>Excluir</button>}
          <span className="flex1" />
          <button type="button" className="btn" onClick={fechar}>Cancelar</button>
          <button className="btn primario" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
        {ed && confirmaExcluir && (
          <div className="confirma">
            <p>Excluir este lançamento? Não dá para desfazer.</p>
            <div className="acoes">
              <button type="button" className="btn" onClick={() => setConfirmaExcluir(false)}>Não</button>
              {ed.compra_id && ed.parcela_total > 1 && <button type="button" className="btn perigo" onClick={() => excluir(true)}>Excluir todas as {ed.parcela_total} parcelas</button>}
              <button type="button" className="btn perigo" onClick={() => excluir(false)}>{ed.compra_id && ed.parcela_total > 1 ? 'Só esta parcela' : 'Excluir'}</button>
            </div>
          </div>
        )}
      </form>
    </Modal>
  )
}
