import { useMemo, useState } from 'react'
import Modal from './Modal'
import { supabase, erroMsg } from '../supabase'
import { useApp } from '../store'
import { addMeses, brl, hojeISO, mesISO, nomeMes, num, statusLabel } from '../lib'

// soma meses a uma data ISO mantendo o dia (limitado ao fim do mês)
function maisMeses(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  const ultimo = new Date(y, m - 1 + n + 1, 0).getDate()
  const dt = new Date(y, m - 1 + n, Math.min(d, ultimo))
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

// mês da fatura em que uma compra cai (mesma regra do banco: fatura_da_data)
function faturaDaData(iso, fech, venc) {
  const [y, m, d] = iso.split('-').map(Number)
  const add = (d >= fech ? 1 : 0) + (venc <= fech ? 1 : 0)
  const dt = new Date(y, m - 1 + add, 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}

// dia X do mês "AAAA-MM" (limitado ao último dia do mês)
function diaNoMes(mes, dia) {
  const [y, m] = mes.split('-').map(Number)
  const ultimo = new Date(y, m, 0).getDate()
  return `${mes}-${String(Math.min(Number(dia) || 1, ultimo)).padStart(2, '0')}`
}

export default function NovoLancamento({ tipoInicial = 'despesa', dataInicial, cartaoInicial, editar, fechar }) {
  const app = useApp()
  const ed = editar || null
  const [tipo, setTipo] = useState(ed?.tipo || tipoInicial)
  const [descricao, setDescricao] = useState(ed?.descricao || '')
  const [valor, setValor] = useState(ed ? String(ed.valor).replace('.', ',') : '')
  const [data, setData] = useState(ed?.data || dataInicial || hojeISO())
  const [categoria, setCategoria] = useState(ed?.categoria_id || '')
  const [resp, setResp] = useState(ed?.user_id || (app.visao !== 'casal' ? app.visao : app.uid))
  const [forma, setForma] = useState(ed?.cartao_id || cartaoInicial ? 'cartao' : 'conta')
  const [modo, setModo] = useState('unica') // unica | parcelado | fixa
  const [parcelas, setParcelas] = useState(2)
  const [meses, setMeses] = useState(12)
  const contasAtivas = app.contas.filter((c) => c.ativo)
  const cartoesAtivos = app.cartoes.filter((c) => c.ativo)
  const [conta, setConta] = useState(ed?.conta_id || contasAtivas[0]?.id || '')
  const [cartao, setCartao] = useState(ed?.cartao_id || cartaoInicial || cartoesAtivos[0]?.id || '')
  const [status, setStatus] = useState(ed?.status || 'pendente')
  const [obs, setObs] = useState(ed?.observacao || '')
  const [erro, setErro] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [confirmaExcluir, setConfirmaExcluir] = useState(!!editar?._x)
  const [faturaMes, setFaturaMes] = useState(ed?.fatura_ref ? ed.fatura_ref.slice(0, 7) : mesISO())
  const [todas, setTodas] = useState(false) // editar todas as parcelas da compra
  const ehParcelado = !!(ed?.compra_id && ed.parcela_total > 1)
  // fatura escolhida para um lançamento novo no cartão (vazio = automática pela data)
  const [faturaNovaEsc, setFaturaNovaEsc] = useState('')
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
  const nParcelas = modo === 'parcelado' ? parcelas : 1
  const cartaoSel = app.cartao(cartao)
  const faturaAuto = cartaoSel && /^\d{4}-\d{2}-\d{2}$/.test(data) ? faturaDaData(data, cartaoSel.dia_fechamento, cartaoSel.dia_vencimento) : mesISO()
  const faturaNova = faturaNovaEsc || faturaAuto
  const nMesesFixa = Math.max(1, Math.min(ehCartao ? 48 : 60, Number(meses) || 1))

  const resumo = useMemo(() => {
    if (!v) return ''
    if (nParcelas > 1) return `${nParcelas}x de ${brl(v / nParcelas)}`
    if (modo === 'fixa') return `${brl(v)} por mês${ehCartao ? ' na fatura' : ''}, durante ${nMesesFixa} meses`
    return ''
  }, [v, nParcelas, modo, nMesesFixa, ehCartao])

  async function salvar(e) {
    e.preventDefault()
    setErro(null)
    if (!descricao.trim()) return setErro('Informe uma descrição.')
    if (!(v > 0)) return setErro('Informe um valor maior que zero.')
    const ano = Number(String(data).slice(0, 4))
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || ano < 2000 || ano > 2100) return setErro('Data inválida: confira o ano (ex.: 2026).')
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
      } else if (ehCartao) {
        const c = cartaoSel
        if (!c) throw new Error('Escolha o cartão.')
        const fixa = modo === 'fixa'
        const n = fixa ? nMesesFixa : nParcelas
        const base = fixa ? v : Math.floor((v / n) * 100) / 100
        const resto = fixa ? 0 : Math.round((v - base * n) * 100) / 100
        const desc = descricao.trim()
        const { data: compra, error: e1 } = await supabase.from('compras').insert({
          casal_id: app.casal.id, user_id: resp, descricao: desc, valor_total: fixa ? Math.round(v * n * 100) / 100 : v,
          parcelas: n, data_compra: data, cartao_id: c.id, categoria_id: categoria || null,
        }).select().single()
        if (e1) throw e1
        const linhas = Array.from({ length: n }, (_, i) => {
          const fat = addMeses(faturaNova, i)
          return {
            casal_id: app.casal.id, user_id: resp, tipo: 'despesa', descricao: desc,
            valor: Math.round((base + (i === 0 ? resto : 0)) * 100) / 100,
            data: diaNoMes(fat, c.dia_vencimento), status: 'pendente', categoria_id: categoria || null,
            cartao_id: c.id, fatura_ref: fat + '-01', compra_id: compra.id,
            parcela_num: i + 1, parcela_total: n,
          }
        })
        const { error: e2 } = await supabase.from('lancamentos').insert(linhas)
        if (e2) { await supabase.from('compras').delete().eq('id', compra.id); throw e2 }
      } else if (tipo === 'despesa' && modo === 'parcelado') {
        const { error } = await supabase.rpc('criar_compra', {
          p_descricao: descricao.trim(), p_valor_total: v, p_parcelas: nParcelas, p_data: data,
          p_cartao_id: ehCartao ? cartao : null, p_conta_id: ehCartao ? null : conta || null,
          p_categoria_id: categoria || null, p_user_id: resp, p_status: status,
        })
        if (error) throw error
      } else {
        const n = modo === 'fixa' ? nMesesFixa : 1
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
            <button type="button" className={forma === 'cartao' ? 'on' : ''} onClick={() => setForma('cartao')}>Cartão de crédito</button>
          </div>
        )}

        {!ed && (
          <div className="seg full pequeno">
            <button type="button" className={modo === 'unica' ? 'on' : ''} onClick={() => setModo('unica')}>À vista</button>
            {tipo === 'despesa' && <button type="button" className={modo === 'parcelado' ? 'on' : ''} onClick={() => setModo('parcelado')}>Parcelado</button>}
            <button type="button" className={modo === 'fixa' ? 'on' : ''} onClick={() => setModo('fixa')}>Fixa mensal</button>
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
          <>
            <div className="linha2">
              <label>Cartão
                <select value={cartao} onChange={(e) => setCartao(e.target.value)}>
                  {cartoesAtivos.length === 0 && <option value="">Nenhum cartão cadastrado</option>}
                  {cartoesAtivos.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.dono_id ? ` · ${app.nomeMembro(c.dono_id)}` : ''}</option>)}
                </select>
              </label>
              <label>{nParcelas > 1 || modo === 'fixa' ? 'Começa na fatura de' : 'Entra na fatura de'}
                <input type="month" value={faturaNova} onChange={(e) => setFaturaNovaEsc(e.target.value)} />
              </label>
            </div>
            {cartaoSel && (
              <p className="dica">
                Fatura de <b>{nomeMes(faturaNova)}</b> (vence dia {cartaoSel.dia_vencimento})
                {(nParcelas > 1 || modo === 'fixa') && <> até <b>{nomeMes(addMeses(faturaNova, (modo === 'fixa' ? nMesesFixa : nParcelas) - 1))}</b></>}.
                {faturaNovaEsc && faturaNovaEsc !== faturaAuto && <> <button type="button" className="link" onClick={() => setFaturaNovaEsc('')}>usar a automática ({nomeMes(faturaAuto)})</button></>}
              </p>
            )}
          </>
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
        {ehCartao && !ed && <p className="dica">{modo === 'fixa' ? 'Gasto fixo (ex.: assinatura): entra todo mês na fatura do cartão.' : 'Compras no cartão ficam como Pendente até você pagar a fatura.'}</p>}

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
