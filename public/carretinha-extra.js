/* ============================================================
   CARRETINHA DE NATAL — novidades (carregado depois de carretinha-natal.js)
   🎲 Sorteador · 📍 Postos de arrecadação e trajeto · 💬 Participação do público
   Usa o mesmo login, papéis, estado (S) e componentes do módulo.
   ============================================================ */
'use strict';

const IVATUBA = [-23.6186, -52.2204];
const tem007 = () => S.extrasOk === true;
const SEM_007 = '<div class="erro-box">As novidades ainda não foram instaladas no banco. O administrador precisa rodar o arquivo <b>supabase/007_carretinha_sorteio_postos_trajeto_participacao.sql</b> no Supabase (SQL Editor).</div>';
const nomeVendedor = (n) => (n.vendedor && n.vendedor.trim()) || S.bloqPorId[n.bloquinho_id]?.responsavel_nome || 'Sem vendedor informado';
const zapLink = (tel, txt) => { const d = String(tel || '').replace(/\D/g, ''); return d ? `https://wa.me/${d.length <= 11 ? '55' + d : d}?text=${encodeURIComponent(txt || '')}` : ''; };
const mapsBusca = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
const linkPosto = (p) => p.maps_url || (p.lat != null && p.lng != null ? mapsBusca(`${p.lat},${p.lng}`) : p.endereco ? mapsBusca(`${p.endereco}, Ivatuba - PR`) : '');

// ---------- Carregamento (chamado no fim do carregar() principal) ----------
window.carregarExtras = async function () {
  try {
    const [sorteios, postos, trajetos, interacoes] = await Promise.all([
      todos('natal_sorteios', 'realizado_em'), todos('natal_postos', 'criado_em'), todos('natal_trajetos', 'criado_em'),
      sb.from('natal_interacoes').select('*').order('criado_em', { ascending: false }).limit(1000).then((r) => { if (r.error) throw r.error; return r.data; }),
    ]);
    Object.assign(S, { sorteios, postos, trajetos, interacoes, extrasOk: true });
  } catch (e) {
    Object.assign(S, { sorteios: [], postos: [], trajetos: [], interacoes: [], extrasOk: false });
  }
};

// ---------- Menu ----------
(function () {
  const i = SECOES.findIndex((s) => s.id === 'divulgacao');
  SECOES.splice(i < 0 ? SECOES.length : i, 0,
    { id: 'sorteio', n: '🎲', l: 'Sorteador', visivel: () => true, render: rSorteio },
    { id: 'onde', n: '📍', l: 'Postos e Trajeto', visivel: () => true, render: rOnde },
    { id: 'participacao', n: '💬', l: 'Participação do público', visivel: () => pode('divulgacao'), render: rParticipacao });
  const montar0 = montarMenu;
  window.montarMenu = montarMenu = function () {      // eslint-disable-line no-func-assign
    montar0();
    const pend = (S.interacoes || []).filter((x) => x.status === 'pendente').length;
    const b = [...document.querySelectorAll('#menu button')].find((x) => x.textContent.includes('Participação do público'));
    if (b && pend) b.insertAdjacentHTML('beforeend', `<span class="cont">${pend}</span>`);
  };
})();

// ============================================================
// 🎲 SORTEADOR
// ============================================================
let ULTIMO = null;
const validos = () => (S.sorteios || []).filter((s) => !s.cancelado);
function concorrentes(criterio, excluir) {
  const st = criterio === 'pagos' ? ['pago'] : ['pago', 'vendido', 'pendente'];
  const ganhou = new Set(validos().map((s) => s.numero_id));
  return S.numeros.filter((n) => st.includes(n.status) && (!excluir || !ganhou.has(n.id)));
}
function rSorteio() {
  if (!tem007()) { $('#conteudo').innerHTML = SEM_007; return; }
  const ss = [...S.sorteios].sort((a, b) => (a.cancelado - b.cancelado) || a.realizado_em.localeCompare(b.realizado_em));
  const ok = ss.filter((s) => !s.cancelado);
  const feitos = new Set(ok.map((s) => s.premio_id));
  const premios = [...S.premios].sort((a, b) => (a.ordem_sorteio ?? 999) - (b.ordem_sorteio ?? 999));
  const faltam = premios.filter((p) => !feitos.has(p.id));
  const pagos = concorrentes('pagos', true).length, vend = concorrentes('vendidos', true).length;
  const f = (F.sorteio = { criterio: 'pagos', excluir: true, ...(F.sorteio || {}) });
  $('#conteudo').innerHTML = `
    <div class="kpis">
      <div class="kpi destaque"><span>Concorrendo (só pagos)</span><b>${pagos}</b><small>chance de ${pagos ? '1 em ' + pagos : '—'} por número</small></div>
      <div class="kpi o"><span>Concorrendo (todos vendidos)</span><b>${vend}</b><small>inclui não pagos</small></div>
      <div class="kpi"><span>Prêmios a sortear</span><b>${faltam.length}</b><small>de ${premios.length}</small></div>
      <div class="kpi v"><span>Já sorteados</span><b>${ok.length}</b>${ss.length > ok.length ? `<small>${ss.length - ok.length} cancelado(s)</small>` : ''}</div>
    </div>
    ${pode('sorteio') ? `<div class="card"><h3>🎲 Realizar sorteio</h3>
      <div class="grade-form" style="margin-top:10px">
        <label>Prêmio<select id="so-premio">${faltam.map((p) => `<option value="${p.id}">${p.ordem_sorteio ? p.ordem_sorteio + 'º · ' : ''}${esc(p.nome)}</option>`).join('')}<option value="">Sem prêmio específico</option></select></label>
        <label>Quem concorre<select id="so-crit"><option value="pagos"${f.criterio === 'pagos' ? ' selected' : ''}>Somente números pagos (${pagos})</option><option value="vendidos"${f.criterio === 'vendidos' ? ' selected' : ''}>Todos os vendidos, pagos ou não (${vend})</option></select></label>
        <label class="inteiro" style="flex-direction:row;align-items:center;gap:8px;font-weight:500"><input type="checkbox" id="so-exc" style="width:auto"${f.excluir ? ' checked' : ''}> Um número que já ganhou não concorre de novo</label>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
        <button class="btn verm" style="font-size:16px;padding:12px 20px" id="so-sortear">🎲 Sortear agora</button>
        <button class="btn ouro" id="so-globo">✍️ Lançar manualmente (número do globo)</button>
        <button class="btn" id="so-telao">📺 Modo telão</button>
      </div>
      <p class="dica" style="margin-top:8px">O sorteio aleatório é feito no banco de dados e fica registrado com protocolo, data, hora e quem realizou. Para sortear um prêmio de novo, <b>cancele</b> o resultado na lista abaixo (o cancelado fica no histórico).</p>
    </div>` : ''}
    <div id="so-resultado">${ULTIMO ? cardResultado(ULTIMO) : ''}</div>
    <div class="card"><div class="entre"><h3 style="margin:0">🏆 Ganhadores</h3>${ok.length ? '<button class="btn peq" onclick="copiarGanhadores()">📋 Copiar lista para o WhatsApp</button>' : ''}</div>
      ${ss.length ? `<div class="tabela-wrap" style="margin-top:10px"><table><thead><tr><th>Prêmio</th><th>Nº</th><th>Ganhador(a)</th><th>Telefone</th><th>Quem vendeu</th><th>Bloquinho</th><th>Situação</th><th>Quando</th><th>Na página</th><th></th></tr></thead><tbody>${ss.map((s) => `<tr${s.cancelado ? ' style="opacity:.55;text-decoration:line-through"' : ''}>
        <td><b>${esc(s.premio_nome || '—')}</b>${s.cancelado ? `<br><span class="badge b-cinza" style="text-decoration:none;display:inline-block">Cancelado${s.motivo_cancelamento ? ': ' + esc(s.motivo_cancelamento) : ''}</span>` : ''}${s.editado_em ? '<br><small class="dica">editado</small>' : ''}</td><td><b style="font-size:16px">${String(s.numero).padStart(2, '0')}</b></td><td>${esc(s.ganhador_nome || '—')}</td>
        <td>${s.ganhador_telefone ? `<a href="${esc(zapLink(s.ganhador_telefone, `Olá! Aqui é da ${S.config.nome_evento || 'Carretinha de Natal'}. Seu número ${s.numero} foi sorteado e você ganhou: ${s.premio_nome || 'um prêmio'}! 🎄🎁`))}" target="_blank" rel="noopener">${esc(s.ganhador_telefone)}</a>` : '—'}</td>
        <td>${esc(s.vendedor || '—')}</td><td>${s.bloquinho ? pad3(s.bloquinho) : '—'}</td>
        <td><span class="badge ${s.status_numero === 'pago' ? 'b-verde' : 'b-verm'}">${esc(ST_NUM[s.status_numero] || s.status_numero || '—')}</span><br><small class="dica">${{ manual: 'globo', lancado: 'lançado à mão' }[s.modo] || 'sistema'}</small></td>
        <td><small>${dataHoraBR(s.realizado_em)}<br>${esc(s.protocolo)}</small></td>
        <td>${pode('sorteio') ? `<button class="btn peq" onclick="visSorteio('${s.id}',${!s.publico})">${s.publico ? '👁 mostra' : '🙈 oculto'}</button>` : s.publico ? 'sim' : 'não'}</td>
        <td class="acoes" style="text-decoration:none">${pode('sorteio') ? (s.cancelado ? `<button class="btn peq" onclick="reativarSorteio('${s.id}')">Reativar</button> <button class="btn peq perigo" onclick="excluirSorteio('${s.id}')">Excluir</button>`
          : `<button class="btn peq" onclick="editarSorteio('${s.id}')">Editar</button> <button class="btn peq perigo" onclick="cancelarSorteio('${s.id}')">Cancelar</button>`) : ''}</td></tr>`).join('')}</tbody></table></div>
        <p class="dica" style="margin-top:8px">Na página pública aparece só o número, o prêmio e o primeiro nome com a inicial do sobrenome (ex.: Ana S.). Telefone e vendedor ficam só para a equipe.</p>` : '<p class="vazio">Nenhum sorteio realizado ainda.</p>'}
    </div>
    ${blocoVendedores()}`;
  if (!pode('sorteio')) return;
  $('#so-crit').onchange = (e) => { f.criterio = e.target.value; };
  $('#so-exc').onchange = (e) => { f.excluir = e.target.checked; rSorteio(); };
  $('#so-sortear').onclick = () => sortear(false);
  $('#so-globo').onclick = registrarGlobo;
  $('#so-telao').onclick = () => sortear(true);
}

function blocoVendedores() {
  const vend = vendidos();
  if (!vend.length) return '';
  const por = {};
  for (const n of vend) { const v = nomeVendedor(n); const x = (por[v] ||= { v, qtd: 0, pagos: 0, valor: 0, recebido: 0, ganhos: 0 }); x.qtd++; if (n.status === 'pago') x.pagos++; x.valor += Number(n.valor) || 0; x.recebido += Number(n.valor_pago) || 0; }
  for (const s of validos()) { const x = por[s.vendedor]; if (x) x.ganhos++; }
  const lista = Object.values(por).sort((a, b) => b.qtd - a.qtd);
  const tot = vend.length;
  return `<div class="card"><h3>🧮 Quem vendeu — cálculo por vendedor</h3>
    <p class="dica" style="margin:4px 0 10px">Vendedor = quem está no campo “vendedor” do número; se estiver vazio, usa o responsável pelo bloquinho. Chance = parte dos números vendidos.</p>
    <div class="tabela-wrap"><table><thead><tr><th>#</th><th>Vendedor</th><th>Números vendidos</th><th>Pagos</th><th>Valor vendido</th><th>Recebido</th><th>Falta</th><th>% das vendas</th><th>Ganhadores</th></tr></thead><tbody>
    ${lista.map((x, i) => `<tr><td>${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td><td><b>${esc(x.v)}</b></td><td>${x.qtd}</td><td>${x.pagos}</td><td>${brl(x.valor)}</td><td>${brl(x.recebido)}</td><td>${brl(Math.max(0, x.valor - x.recebido))}</td><td>${((100 * x.qtd) / tot).toFixed(1).replace('.', ',')}%</td><td>${x.ganhos || ''}</td></tr>`).join('')}
    </tbody><tfoot><tr><td></td><td>Total</td><td>${tot}</td><td>${soma(lista, 'pagos')}</td><td>${brl(soma(lista, 'valor'))}</td><td>${brl(soma(lista, 'recebido'))}</td><td>${brl(Math.max(0, soma(lista, 'valor') - soma(lista, 'recebido')))}</td><td>100%</td><td>${validos().length || ''}</td></tr></tfoot></table></div></div>`;
}

function cardResultado(s) {
  return `<div class="card" style="border:3px solid var(--dourado2);background:linear-gradient(135deg,#fffaf0,#fff)">
    <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
      <div style="min-width:140px;text-align:center;background:linear-gradient(135deg,var(--vermelho2),var(--vermelho));color:#fff;border-radius:18px;padding:14px 18px"><small style="opacity:.85">NÚMERO</small><div style="font-size:54px;font-weight:800;line-height:1">${String(s.numero).padStart(2, '0')}</div></div>
      <div style="flex:1;min-width:220px">
        <p class="dica" style="font-weight:700;color:var(--dourado)">🏆 ${esc(s.premio_nome || 'Sorteio')}</p>
        <h2 class="titulo-natal" style="font-size:28px;color:var(--verde);margin:2px 0">${esc(s.ganhador_nome || 'Comprador não informado')}</h2>
        <p style="margin:2px 0">📞 ${esc(s.ganhador_telefone || '—')} · 🧑‍💼 Vendido por <b>${esc(s.vendedor || '—')}</b>${s.bloquinho ? ` · Bloquinho ${pad3(s.bloquinho)}` : ''}</p>
        <p class="dica">${s.status_numero === 'pago' ? '<span class="badge b-verde">Número pago</span>' : `<span class="badge b-verm">Atenção: número ${esc(ST_NUM[s.status_numero] || s.status_numero)}</span>`} · ${s.concorrentes} número(s) concorrendo · protocolo ${esc(s.protocolo)}</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${s.ganhador_telefone ? `<a class="btn prim" href="${esc(zapLink(s.ganhador_telefone, `Olá! Aqui é da ${S.config.nome_evento || 'Carretinha de Natal'}. Seu número ${s.numero} foi sorteado e você ganhou: ${s.premio_nome || 'um prêmio'}! 🎄🎁`))}" target="_blank" rel="noopener">💬 Avisar no WhatsApp</a>` : ''}
        <button class="btn" onclick="copiarTexto(${esc(JSON.stringify(textoResultado(s)))})">📋 Copiar resultado</button>
      </div>
    </div></div>`;
}
const primeiroNome = (n) => { const p = String(n || '').trim().split(/\s+/); return p[0] ? p[0] + (p.length > 1 ? ' ' + p[p.length - 1][0].toUpperCase() + '.' : '') : ''; };
const textoResultado = (s) => `🎄 ${S.config.nome_evento || 'Carretinha de Natal'} ${S.config.ano}\n🏆 ${s.premio_nome || 'Sorteio'}\n🎟️ Número sorteado: ${String(s.numero).padStart(2, '0')}\n🎉 Ganhador(a): ${primeiroNome(s.ganhador_nome) || '—'}\nParabéns!`;
window.copiarGanhadores = () => copiarTexto(`🎄 ${S.config.nome_evento || 'Carretinha de Natal'} ${S.config.ano} — GANHADORES\n\n` + validos().sort((a, b) => a.realizado_em.localeCompare(b.realizado_em)).map((s) => `🏆 ${s.premio_nome || 'Prêmio'} — nº ${String(s.numero).padStart(2, '0')} — ${primeiroNome(s.ganhador_nome)}`).join('\n') + '\n\nObrigado a todos que ajudaram! ❤️');

async function sortear(telao) {
  const premio = $('#so-premio').value || null, crit = $('#so-crit').value, exc = $('#so-exc').checked;
  const pool = concorrentes(crit, exc);
  if (!pool.length) return toast('Nenhum número concorrendo com esse critério.', true);
  const pNome = premio ? S.premios.find((p) => p.id === premio)?.nome : 'Sorteio';
  if (!(await confirmar(`Sortear <b>${esc(pNome)}</b> entre <b>${pool.length}</b> número(s) ${crit === 'pagos' ? 'pagos' : 'vendidos'}?`, '🎲 Sortear', false))) return;
  const anim = telao ? abrirTelao(pNome) : abrirRoleta(pNome);
  const giro = anim.girar(pool.map((n) => n.numero));
  try {
    const { data, error } = await sb.rpc('natal_sortear', { p_premio: premio, p_criterio: crit, p_numero: null, p_excluir_ganhadores: exc, p_obs: null });
    if (error) throw error;
    await giro; anim.parar(data);
    ULTIMO = data; await recarregar(false);
  } catch (e) { anim.fechar(); toast(msgErro(e), true); }
}

function abrirRoleta(titulo) {
  const m = abrirModal({ titulo: `🎲 ${esc(titulo)}`, corpo: `<div style="text-align:center;padding:16px 0"><div id="rol-num" style="font-size:88px;font-weight:800;color:var(--vermelho);font-variant-numeric:tabular-nums">--</div><p class="dica" id="rol-txt">Sorteando…</p></div>` });
  return animacao(m.fundo.querySelector('#rol-num'), m.fundo.querySelector('#rol-txt'), m.fechar, (s) => {
    m.fundo.querySelector('.m-corpo').innerHTML = cardResultado(s);
  });
}
function abrirTelao(titulo) {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;z-index:200;background:radial-gradient(circle at 50% 30%,#d62839,#5c0810);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:20px';
  box.innerHTML = `<button style="position:absolute;top:14px;right:18px;font-size:38px;background:none;border:none;color:#fff;cursor:pointer" aria-label="Fechar">×</button>
    <div style="font-size:clamp(20px,3vw,34px);font-weight:700;color:#f2cf6b">🎄 ${esc(S.config.nome_evento || 'Carretinha de Natal')} ${esc(S.config.ano)}</div>
    <div style="font-size:clamp(26px,4vw,48px);font-family:'Playfair Display',serif;margin:8px 0 10px">🏆 ${esc(titulo)}</div>
    <div id="tel-num" style="font-size:clamp(120px,26vw,300px);font-weight:800;line-height:1;font-variant-numeric:tabular-nums;text-shadow:0 8px 30px rgba(0,0,0,.35)">--</div>
    <div id="tel-txt" style="font-size:clamp(22px,4vw,46px);font-weight:700;margin-top:14px">Sorteando…</div>`;
  document.body.appendChild(box);
  box.requestFullscreen?.().catch(() => {});
  const fechar = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); box.remove(); };
  box.querySelector('button').onclick = fechar;
  return animacao(box.querySelector('#tel-num'), box.querySelector('#tel-txt'), fechar, (s) => {
    box.querySelector('#tel-txt').innerHTML = `🎉 ${esc(primeiroNome(s.ganhador_nome) || 'Parabéns!')}<div style="font-size:.5em;font-weight:500;opacity:.85;margin-top:6px">Vendido por ${esc(s.vendedor || '—')}</div>`;
  });
}
function animacao(elNum, elTxt, fechar, final) {
  let rodando = true, t;
  return {
    girar: (nums) => new Promise((ok) => {
      const ini = Date.now(); const dur = 3200;
      const passo = () => {
        if (!rodando) return;
        elNum.textContent = String(nums[Math.floor(Math.random() * nums.length)]).padStart(2, '0');
        const dec = Date.now() - ini;
        if (dec >= dur) return ok();
        t = setTimeout(passo, 40 + (dec / dur) ** 2 * 260);
      };
      passo();
    }),
    parar: (s) => { rodando = false; clearTimeout(t); elNum.textContent = String(s.numero).padStart(2, '0'); elTxt.textContent = ''; final(s); },
    fechar: () => { rodando = false; clearTimeout(t); fechar(); },
  };
}

// Formulário de ganhador: usado para LANÇAR manualmente e para EDITAR um resultado
function formGanhador(sorteio) {
  const premioSel = sorteio ? sorteio.premio_id : ($('#so-premio')?.value || null);
  const usados = new Set(validos().filter((x) => x.id !== sorteio?.id).map((x) => x.premio_id));
  const premios = [...S.premios].sort((a, b) => (a.ordem_sorteio ?? 999) - (b.ordem_sorteio ?? 999)).filter((p) => !usados.has(p.id));
  const v = sorteio || {};
  const m = abrirModal({
    titulo: sorteio ? `Editar resultado · ${esc(sorteio.premio_nome || 'Sorteio')}` : '✍️ Lançar ganhador manualmente', largo: true,
    corpo: `<form class="form" id="fg"><div class="grade-form">
      <label class="inteiro">Prêmio<select name="premio">${premios.map((p) => `<option value="${p.id}"${p.id === premioSel ? ' selected' : ''}>${p.ordem_sorteio ? p.ordem_sorteio + 'º · ' : ''}${esc(p.nome)}</option>`).join('')}<option value=""${!premioSel ? ' selected' : ''}>Sem prêmio específico</option></select></label>
      <label>Número sorteado *<input name="numero" inputmode="numeric" value="${esc(v.numero ?? '')}" style="font-size:22px;font-weight:800" required></label>
      <label>Ganhador(a)<input name="nome" value="${esc(v.ganhador_nome || '')}"></label>
      <label>Telefone<input name="tel" type="tel" value="${esc(v.ganhador_telefone || '')}"></label>
      <label>Quem vendeu<input name="vend" list="fg-vend" value="${esc(v.vendedor || '')}"><datalist id="fg-vend">${[...new Set(vendidos().map(nomeVendedor))].map((x) => `<option value="${esc(x)}">`).join('')}</datalist></label>
      ${sorteio ? `<label>Mostrar na página pública<select name="publico"><option value="true"${v.publico !== false ? ' selected' : ''}>Sim</option><option value="false"${v.publico === false ? ' selected' : ''}>Não</option></select></label>` : ''}
      <label class="inteiro">Observação<input name="obs" value="${esc(v.observacoes || '')}"></label>
    </div><div id="fg-prev" style="margin-top:4px"></div><div class="erro-box oculto" id="fg-erro"></div></form>`,
    rodape: `<button class="btn" data-c>Cancelar</button><button class="btn prim" data-ok>${sorteio ? 'Salvar alterações' : 'Registrar ganhador'}</button>`,
  });
  const f = m.fundo.querySelector('#fg'), prev = m.fundo.querySelector('#fg-prev'), err = m.fundo.querySelector('#fg-erro');
  m.fundo.querySelector('[data-c]').onclick = m.fechar;
  // ao digitar o número, preenche com os dados da rifa (tudo continua editável)
  let ultimoNum = String(v.numero ?? '');
  const olhar = (preencher) => {
    const nv = parseInt(f.numero.value.replace(/\D/g, ''), 10);
    const n = S.numeros.find((x) => x.numero === nv);
    if (!f.numero.value) { prev.innerHTML = ''; return; }
    if (!n) { prev.innerHTML = '<div class="erro-box">Este número não está na rifa. Você pode registrar assim mesmo, preenchendo os dados à mão.</div>'; return; }
    if (preencher) { f.nome.value = n.comprador_nome || ''; f.tel.value = n.comprador_telefone || ''; f.vend.value = nomeVendedor(n); }
    const ganhou = validos().find((s) => s.numero_id === n.id && s.id !== sorteio?.id);
    prev.innerHTML = `<div class="${n.status === 'pago' && !ganhou ? 'ok-box' : 'erro-box'}">Na rifa: <b>${esc(n.comprador_nome || 'sem comprador')}</b> · Bloquinho ${pad3(S.bloqPorId[n.bloquinho_id]?.numero || 0)} · <b>${esc(ST_NUM[n.status])}</b>${n.status !== 'pago' ? ' — atenção: número não está pago' : ''}${ganhou ? `<br>⚠️ Este número já ganhou: ${esc(ganhou.premio_nome || '')}` : ''}</div>`;
  };
  f.numero.oninput = () => { const atual = f.numero.value.replace(/\D/g, ''); olhar(atual !== ultimoNum); ultimoNum = atual; };
  olhar(false);
  m.fundo.querySelector('[data-ok]').onclick = async (e) => {
    e.preventDefault(); err.classList.add('oculto');
    const numero = parseInt(f.numero.value.replace(/\D/g, ''), 10);
    if (!numero) { err.textContent = 'Informe o número sorteado.'; err.classList.remove('oculto'); return; }
    const bt = e.currentTarget; bt.disabled = true;
    try {
      if (sorteio) {
        await gravar('natal_sorteios', sorteio.id, { premio_id: f.premio.value || null, numero, ganhador_nome: f.nome.value.trim() || null, ganhador_telefone: f.tel.value.trim() || null,
          vendedor: f.vend.value.trim() || null, observacoes: f.obs.value.trim() || null, publico: f.publico.value !== 'false' });
        if (ULTIMO?.id === sorteio.id) ULTIMO = null;
      } else {
        const { data, error } = await sb.rpc('natal_lancar_sorteio', { p_premio: f.premio.value || null, p_numero: numero, p_nome: f.nome.value, p_telefone: f.tel.value, p_vendedor: f.vend.value, p_obs: f.obs.value || null });
        if (error) throw error; ULTIMO = data;
      }
      m.fechar(); await recarregar(false); toast(sorteio ? 'Resultado atualizado' : 'Ganhador registrado');
    } catch (e2) { bt.disabled = false; err.textContent = msgErro(e2); err.classList.remove('oculto'); }
  };
}
function registrarGlobo() { formGanhador(null); }
window.editarSorteio = (id) => formGanhador(S.sorteios.find((x) => x.id === id));
window.cancelarSorteio = (id) => {
  const s = S.sorteios.find((x) => x.id === id);
  const m = abrirModal({
    titulo: `Cancelar resultado · ${esc(s.premio_nome || 'Sorteio')} · nº ${String(s.numero).padStart(2, '0')}`,
    corpo: `<p style="margin:0 0 10px">O resultado sai da página pública e o prêmio volta para <b>a sortear</b>. O registro cancelado continua no histórico.</p>
      <label class="form" style="display:block"><span class="dica">Motivo do cancelamento</span><input id="cx-motivo" placeholder="Ex.: número não estava pago, ganhador não encontrado…" style="margin-top:6px"></label>`,
    rodape: '<button class="btn" data-c>Voltar</button><button class="btn verm" data-ok>Cancelar resultado</button>',
  });
  m.fundo.querySelector('[data-c]').onclick = m.fechar;
  m.fundo.querySelector('[data-ok]').onclick = async () => {
    try { await gravar('natal_sorteios', id, { cancelado: true, motivo_cancelamento: m.fundo.querySelector('#cx-motivo').value.trim() || null }); if (ULTIMO?.id === id) ULTIMO = null; m.fechar(); await recarregar(false); toast('Resultado cancelado. O prêmio pode ser sorteado de novo.'); }
    catch (e) { toast(msgErro(e), true); }
  };
};
window.reativarSorteio = async (id) => {
  try { await gravar('natal_sorteios', id, { cancelado: false }); await recarregar(false); toast('Resultado reativado'); }
  catch (e) { toast(/duplicate|unique/i.test(e?.message || '') ? 'Este prêmio já tem outro ganhador. Cancele o outro antes de reativar.' : msgErro(e), true); }
};
window.excluirSorteio = async (id) => {
  if (!(await confirmar('Excluir de vez este resultado cancelado? Ele some do histórico.', 'Excluir'))) return;
  try { await apagar('natal_sorteios', id); await recarregar(false); toast('Resultado excluído'); } catch (e) { toast(msgErro(e), true); }
};
window.visSorteio = async (id, v) => { try { await gravar('natal_sorteios', id, { publico: v }); await recarregar(false); } catch (e) { toast(msgErro(e), true); } };

// ============================================================
// 📍 POSTOS DE ARRECADAÇÃO E TRAJETO DA CARRETINHA
// ============================================================
let mapas = [];
function limparMapas() { mapas.forEach((m) => { try { m.remove(); } catch (e) { /* */ } }); mapas = []; }
function novoMapa(el, opts = {}) {
  if (!window.L) { el.innerHTML = '<p class="dica" style="padding:12px">Mapa indisponível (sem conexão com o servidor de mapas).</p>'; return null; }
  const m = L.map(el, { scrollWheelZoom: false, ...opts }).setView(IVATUBA, 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
  mapas.push(m); return m;
}
const pinIcone = (txt, cor = '#b91c1c') => window.L && L.divIcon({ className: '', iconSize: [28, 28], iconAnchor: [14, 14], html: `<div style="width:28px;height:28px;border-radius:50%;background:${cor};color:#fff;display:grid;place-items:center;font-weight:800;font-size:12px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)">${txt}</div>` });
function desenharTrajeto(m, t, comNumeros = true) {
  const pts = (t.pontos || []).filter((p) => p.lat != null && p.lng != null);
  const camada = L.layerGroup().addTo(m);
  if (pts.length > 1) L.polyline(pts.map((p) => [p.lat, p.lng]), { color: t.cor || '#d62839', weight: 5, opacity: .85 }).addTo(camada);
  pts.forEach((p, i) => L.marker([p.lat, p.lng], { icon: pinIcone(comNumeros ? i + 1 : '', i === 0 ? '#166534' : i === pts.length - 1 ? '#c9a227' : t.cor || '#d62839') })
    .bindPopup(`<b>${i + 1}. ${esc(p.rua || 'Ponto')}</b>${p.hora ? `<br>⏰ ${esc(p.hora)}` : ''}${p.obs ? `<br>${esc(p.obs)}` : ''}`).addTo(camada));
  return { camada, pts };
}
function linkRotaGoogle(pts) {
  const v = pts.filter((p) => p.lat != null);
  if (v.length < 2) return '';
  let meio = v.slice(1, -1);
  if (meio.length > 8) meio = Array.from({ length: 8 }, (_, i) => meio[Math.round((i * (meio.length - 1)) / 7)]);
  const ll = (p) => `${p.lat},${p.lng}`;
  return `https://www.google.com/maps/dir/?api=1&origin=${ll(v[0])}&destination=${ll(v[v.length - 1])}${meio.length ? '&waypoints=' + encodeURIComponent(meio.map(ll).join('|')) : ''}&travelmode=driving`;
}
function textoTrajeto(t) {
  const ruas = (t.pontos || []).map((p, i) => `${i + 1}. ${p.rua || 'Ponto ' + (i + 1)}${p.hora ? ` — ${p.hora}` : ''}`).join('\n');
  return `🎄🚚 ${S.config.nome_evento || 'Carretinha de Natal'} vai passar na sua rua!\n📍 ${t.nome}${t.regiao ? ' (' + t.regiao + ')' : ''}\n📅 ${t.data ? dataBR(t.data) : 'data a confirmar'}${t.hora_saida ? ` · saída às ${t.hora_saida}` : ''}${t.ponto_saida ? `\n🚩 Saída: ${t.ponto_saida}` : ''}\n\nTrajeto:\n${ruas}${t.descricao ? '\n\n' + t.descricao : ''}\n\nVeja o mapa: ${linkPublico()}#onde`;
}

function rOnde() {
  limparMapas();
  if (!tem007()) { $('#conteudo').innerHTML = SEM_007; return; }
  const ed = pode('divulgacao');
  const postos = [...S.postos].sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999) || a.nome.localeCompare(b.nome));
  const trajs = [...S.trajetos].sort((a, b) => (a.data || '9999').localeCompare(b.data || '9999') || (a.ordem ?? 999) - (b.ordem ?? 999));
  $('#conteudo').innerHTML = `
    <div class="card"><div class="entre"><h3 style="margin:0">🚚 Trajetos da Carretinha</h3>${ed ? '<button class="btn prim" onclick="editarTrajeto()">+ Novo trajeto</button>' : ''}</div>
      <p class="dica" style="margin:6px 0 12px">Monte o percurso clicando no mapa: cada clique vira um ponto, e o nome da rua aparece sozinho. Crie um trajeto para cada região (ex.: Ivatuba — Centro, Bairro Refúgio). Os públicos aparecem na página de divulgação, na aba “Onde encontrar”.</p>
      ${trajs.length ? trajs.map((t) => `<div class="card" style="margin-top:12px;box-shadow:none;border-left:6px solid ${esc(t.cor || '#d62839')}">
        <div class="entre"><div><b style="font-size:16px">${esc(t.nome)}</b> ${t.regiao && t.regiao !== t.nome ? `<span class="badge b-cinza">${esc(t.regiao)}</span>` : ''} ${t.publico ? '<span class="badge b-verde">público</span>' : '<span class="badge b-cinza">rascunho</span>'}
          <br><small class="dica">${t.data ? '📅 ' + dataBR(t.data) : 'Data a definir'}${t.hora_saida ? ' · saída ' + esc(t.hora_saida) : ''}${t.ponto_saida ? ' · 🚩 ' + esc(t.ponto_saida) : ''} · ${(t.pontos || []).length} ponto(s)</small></div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">${linkRotaGoogle(t.pontos || []) ? `<a class="btn peq" href="${esc(linkRotaGoogle(t.pontos))}" target="_blank" rel="noopener">🗺️ Google Maps</a>` : ''}
            <button class="btn peq" onclick="copiarTexto(${esc(JSON.stringify(textoTrajeto(t)))})">📋 Texto para divulgar</button>
            <a class="btn peq ouro" href="https://wa.me/?text=${encodeURIComponent(textoTrajeto(t))}" target="_blank" rel="noopener">WhatsApp</a>
            ${ed ? `<button class="btn peq" onclick="editarTrajeto('${t.id}')">Editar</button>` : ''}</div></div>
        <div class="grade2" style="margin-top:10px;grid-template-columns:1.4fr 1fr"><div class="mapa-traj" data-traj="${t.id}" style="height:260px;border-radius:12px;overflow:hidden;border:1px solid var(--borda)"></div>
          <ol style="margin:0;padding-left:20px;max-height:260px;overflow:auto">${(t.pontos || []).map((p) => `<li style="margin:3px 0">${esc(p.rua || 'Ponto')}${p.hora ? ` <small class="dica">⏰ ${esc(p.hora)}</small>` : ''}</li>`).join('') || '<li class="dica">Sem pontos ainda</li>'}</ol></div>
      </div>`).join('') : '<p class="vazio">Nenhum trajeto ainda.</p>'}
    </div>
    <div class="card"><div class="entre"><h3 style="margin:0">📦 Postos de arrecadação</h3>${ed ? '<button class="btn prim" onclick="formPosto()">+ Novo posto</button>' : ''}</div>
      <p class="dica" style="margin:6px 0 12px">Lugares onde a população pode entregar doações. O botão “Como chegar” abre o Google Maps.</p>
      ${postos.length ? `<div class="grade2" style="grid-template-columns:1.2fr 1fr"><div><div class="passos">${postos.map((p, i) => `<div class="passo">
        <span class="ck" style="background:var(--vermelho2);color:#fff">${i + 1}</span>
        <div><b style="text-decoration:none;color:var(--txt)">${esc(p.nome)}</b> ${p.publico ? '' : '<span class="badge b-cinza">oculto</span>'}<small>${esc([p.endereco, p.referencia].filter(Boolean).join(' · '))}</small><small>${esc([p.horario && '🕒 ' + p.horario, p.o_que_recebe && '🎁 ' + p.o_que_recebe, p.telefone && '📞 ' + p.telefone].filter(Boolean).join(' · '))}</small></div>
        ${linkPosto(p) ? `<a class="btn peq" href="${esc(linkPosto(p))}" target="_blank" rel="noopener">📍 Como chegar</a>` : ''}${ed ? `<button class="btn peq" onclick="formPosto('${p.id}')">Editar</button>` : ''}</div>`).join('')}</div></div>
        <div id="mapa-postos" style="height:320px;border-radius:12px;overflow:hidden;border:1px solid var(--borda)"></div></div>` : '<p class="vazio">Nenhum posto cadastrado.</p>'}
    </div>`;
  document.querySelectorAll('.mapa-traj').forEach((el) => {
    const t = S.trajetos.find((x) => x.id === el.dataset.traj); const m = novoMapa(el); if (!m) return;
    const { pts } = desenharTrajeto(m, t); if (pts.length) m.fitBounds(pts.map((p) => [p.lat, p.lng]), { padding: [24, 24], maxZoom: 17 });
  });
  const mp = $('#mapa-postos');
  if (mp) { const m = novoMapa(mp); if (m) { const c = postos.filter((p) => p.lat != null); c.forEach((p, i) => L.marker([p.lat, p.lng], { icon: pinIcone('📦', '#166534') }).bindPopup(`<b>${esc(p.nome)}</b><br>${esc(p.endereco || '')}`).addTo(m)); if (c.length) m.fitBounds(c.map((p) => [p.lat, p.lng]), { padding: [30, 30], maxZoom: 16 }); } }
}

// Busca de endereço e nome da rua (OpenStreetMap / Nominatim)
async function nomeDaRua(lat, lng) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&accept-language=pt-BR&lat=${lat}&lon=${lng}`);
    const j = await r.json(); const a = j.address || {};
    return [a.road || a.pedestrian || a.residential || a.neighbourhood || '', a.suburb || a.neighbourhood || ''].filter((x, i, arr) => x && arr.indexOf(x) === i).join(' — ');
  } catch (e) { return ''; }
}
async function buscarEndereco(q) {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=pt-BR&countrycodes=br&viewbox=-52.32,-23.54,-52.12,-23.70&q=${encodeURIComponent(q + ', Ivatuba, Paraná')}`);
  return r.json();
}

function formPosto(id) {
  const p = id ? S.postos.find((x) => x.id === id) : null;
  let lat = p?.lat ?? null, lng = p?.lng ?? null, mk = null;
  abrirForm({
    titulo: p ? 'Editar posto de arrecadação' : 'Novo posto de arrecadação', largo: true,
    campos: [
      { k: 'nome', l: 'Nome do local', req: true, dica: 'Ex.: Mercado Central, Igreja Matriz, Prefeitura' },
      { k: 'endereco', l: 'Endereço', dica: 'Rua, número, bairro' },
      { k: 'referencia', l: 'Ponto de referência' },
      { k: 'horario', l: 'Horário para entregar', dica: 'Ex.: seg a sáb, 8h às 18h' },
      { k: 'o_que_recebe', l: 'O que recebe', dica: 'Ex.: brinquedos, doces, alimentos' },
      { k: 'telefone', l: 'Telefone / WhatsApp', t: 'tel' },
      { k: 'maps_url', l: 'Link do Google Maps (opcional)', full: true, dica: 'Se deixar vazio, o “Como chegar” usa o ponto do mapa ou o endereço.' },
      { k: 'ordem', l: 'Ordem', t: 'number' },
      { k: 'publico', l: 'Mostrar na página pública', t: 'select', op: [['true', 'Sim'], ['false', 'Não']] },
    ],
    extra: `<p class="dica" style="margin-top:10px"><b>Marque no mapa</b> (opcional): clique no local exato. <button type="button" class="link" id="po-buscar">Buscar pelo endereço</button></p><div id="po-mapa" style="height:260px;border-radius:12px;overflow:hidden;border:1px solid var(--borda);margin-top:6px"></div>`,
    valores: p ? { ...p, publico: String(p.publico) } : { publico: 'true' },
    aoAbrir: (fundo) => setTimeout(() => {
      const m = novoMapa(fundo.querySelector('#po-mapa'), { scrollWheelZoom: true }); if (!m) return;
      const marcar = (a, b) => { lat = a; lng = b; if (mk) mk.setLatLng([a, b]); else mk = L.marker([a, b], { icon: pinIcone('📦', '#166534') }).addTo(m); };
      if (lat != null) { marcar(lat, lng); m.setView([lat, lng], 17); }
      m.on('click', (e) => marcar(+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)));
      fundo.querySelector('#po-buscar').onclick = async () => {
        const q = fundo.querySelector('[name=endereco]').value || fundo.querySelector('[name=nome]').value;
        if (!q) return toast('Preencha o endereço primeiro', true);
        try { const r = await buscarEndereco(q); if (!r.length) return toast('Endereço não encontrado no mapa. Clique no local manualmente.', true); marcar(+(+r[0].lat).toFixed(6), +(+r[0].lon).toFixed(6)); m.setView([lat, lng], 17); } catch (e) { toast('Busca indisponível agora', true); }
      };
    }, 60),
    salvar: (d) => { d.publico = d.publico !== 'false'; d.ordem = d.ordem ? Math.round(d.ordem) : null; d.lat = lat; d.lng = lng; return gravar('natal_postos', p?.id, d); },
    excluir: p && pode('divulgacao') ? () => apagar('natal_postos', p.id) : null,
  });
}
window.formPosto = formPosto;

function editarTrajeto(id) {
  const t = id ? S.trajetos.find((x) => x.id === id) : null;
  let pts = JSON.parse(JSON.stringify(t?.pontos || []));
  let m = null, camada = null;
  const lista = () => pts.map((p, i) => `<div class="passo" style="padding:6px 8px;gap:6px">
      <span class="ck" style="width:24px;height:24px;font-size:11px;background:${i === 0 ? 'var(--verde2)' : i === pts.length - 1 ? 'var(--dourado)' : 'var(--vermelho2)'};color:#fff">${i + 1}</span>
      <input data-i="${i}" data-c="rua" value="${esc(p.rua || '')}" placeholder="Rua / avenida" style="flex:2;padding:6px 8px">
      <input data-i="${i}" data-c="hora" value="${esc(p.hora || '')}" placeholder="Hora" style="width:72px;padding:6px 8px">
      <button type="button" class="btn peq" data-up="${i}" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" class="btn peq" data-down="${i}" ${i === pts.length - 1 ? 'disabled' : ''}>↓</button><button type="button" class="btn peq perigo" data-del="${i}">×</button></div>`).join('') || '<p class="dica">Clique no mapa para adicionar o primeiro ponto (a saída).</p>';
  const redesenhar = (fundo) => {
    if (camada) camada.remove();
    if (m) camada = desenharTrajeto(m, { pontos: pts, cor: fundo.querySelector('[name=cor]').value }).camada;
    const box = fundo.querySelector('#tr-lista'); box.innerHTML = lista();
    box.querySelectorAll('input[data-i]').forEach((el) => { el.oninput = () => { pts[+el.dataset.i][el.dataset.c] = el.value; }; el.onchange = () => redesenhar(fundo); });
    box.querySelectorAll('[data-del]').forEach((b) => { b.onclick = () => { pts.splice(+b.dataset.del, 1); redesenhar(fundo); }; });
    box.querySelectorAll('[data-up]').forEach((b) => { b.onclick = () => { const i = +b.dataset.up; [pts[i - 1], pts[i]] = [pts[i], pts[i - 1]]; redesenhar(fundo); }; });
    box.querySelectorAll('[data-down]').forEach((b) => { b.onclick = () => { const i = +b.dataset.down; [pts[i + 1], pts[i]] = [pts[i], pts[i + 1]]; redesenhar(fundo); }; });
    fundo.querySelector('#tr-cont').textContent = `${pts.length} ponto(s)`;
  };
  const adicionar = async (fundo, lat, lng, rua) => {
    const p = { lat: +lat.toFixed(6), lng: +lng.toFixed(6), rua: rua || '…' }; pts.push(p); redesenhar(fundo);
    if (!rua) { p.rua = (await nomeDaRua(p.lat, p.lng)) || ''; redesenhar(fundo); }
  };
  abrirForm({
    titulo: t ? `Editar trajeto · ${esc(t.nome)}` : 'Novo trajeto da Carretinha', largo: true,
    campos: [
      { k: 'nome', l: 'Nome do trajeto', req: true, dica: 'Ex.: Ivatuba — Centro · Bairro Refúgio' },
      { k: 'regiao', l: 'Região / bairro', t: 'datalist', lista: ['Ivatuba — Centro', 'Bairro Refúgio', ...new Set(S.trajetos.map((x) => x.regiao).filter(Boolean))] },
      { k: 'data', l: 'Data', t: 'date' },
      { k: 'hora_saida', l: 'Hora de saída', dica: 'Ex.: 19h' },
      { k: 'ponto_saida', l: 'Ponto de saída' },
      { k: 'cor', l: 'Cor da linha no mapa', t: 'select', op: [['#d62839', 'Vermelho'], ['#166534', 'Verde'], ['#c9a227', 'Dourado'], ['#2563eb', 'Azul'], ['#7c3aed', 'Roxo']] },
      { k: 'publico', l: 'Mostrar na página pública', t: 'select', op: [['true', 'Sim'], ['false', 'Não (rascunho)']] },
      { k: 'ordem', l: 'Ordem', t: 'number' },
      { k: 'descricao', l: 'Recado para a população', t: 'textarea', full: true, dica: 'Ex.: Prepare as crianças! O Papai Noel vai distribuir balas.' },
    ],
    extra: `<div style="margin-top:12px"><div class="entre"><b>🗺️ Percurso <span class="dica" id="tr-cont"></span></b>
        <div style="display:flex;gap:6px;flex:1;min-width:220px;max-width:420px"><input id="tr-busca" placeholder="Buscar rua em Ivatuba…" style="padding:7px 10px"><button type="button" class="btn peq" id="tr-buscar">Buscar</button></div></div>
      <p class="dica" style="margin:4px 0 6px">Clique no mapa na ordem do percurso (esquinas e curvas). O nome da rua é preenchido sozinho — confira e ajuste se precisar.</p>
      <div class="grade2" style="grid-template-columns:1.5fr 1fr;gap:10px"><div id="tr-mapa" style="height:380px;border-radius:12px;overflow:hidden;border:1px solid var(--borda)"></div>
        <div id="tr-lista" style="display:flex;flex-direction:column;gap:5px;max-height:380px;overflow:auto"></div></div></div>`,
    valores: t ? { ...t, publico: String(t.publico) } : { publico: 'true', cor: '#d62839' },
    aoAbrir: (fundo) => setTimeout(() => {
      m = novoMapa(fundo.querySelector('#tr-mapa'), { scrollWheelZoom: true });
      redesenhar(fundo);
      fundo.querySelector('[name=cor]').onchange = () => redesenhar(fundo);
      if (!m) return;
      if (pts.length) m.fitBounds(pts.map((p) => [p.lat, p.lng]), { padding: [24, 24], maxZoom: 17 });
      m.on('click', (e) => adicionar(fundo, e.latlng.lat, e.latlng.lng));
      const buscar = async () => {
        const q = fundo.querySelector('#tr-busca').value.trim(); if (!q) return;
        try { const r = await buscarEndereco(q); if (!r.length) return toast('Não encontrei essa rua no mapa. Clique direto no mapa.', true); m.setView([+r[0].lat, +r[0].lon], 17); toast('Agora clique no ponto exato da rua'); } catch (e) { toast('Busca indisponível agora', true); }
      };
      fundo.querySelector('#tr-buscar').onclick = buscar;
      fundo.querySelector('#tr-busca').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); buscar(); } };
    }, 60),
    salvar: (d) => { d.publico = d.publico !== 'false'; d.ordem = d.ordem ? Math.round(d.ordem) : null; d.cor = d.cor || '#d62839'; d.pontos = pts.map((p) => ({ lat: p.lat, lng: p.lng, rua: (p.rua || '').trim(), hora: (p.hora || '').trim() || undefined })); return gravar('natal_trajetos', t?.id, d); },
    excluir: t && pode('divulgacao') ? () => apagar('natal_trajetos', t.id) : null,
  });
}
window.editarTrajeto = editarTrajeto;

// ============================================================
// 💬 PARTICIPAÇÃO DO PÚBLICO (moderação)
// ============================================================
const TIPO_INT = { depoimento: '⭐ Depoimento / avaliação', foto: '📸 Foto com a Carretinha', recado: '🎅 Recado ao Papai Noel' };
const ST_INT = { pendente: ['Aguardando', 'b-ouro'], aprovado: ['Publicado', 'b-verde'], recusado: ['Recusado', 'b-cinza'] };
const estrelas = (n) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '');
function rParticipacao() {
  if (!tem007()) { $('#conteudo').innerHTML = SEM_007; return; }
  const f = (F.part = { st: 'pendente', ...(F.part || {}) });
  const it = S.interacoes;
  const ap = it.filter((x) => x.status === 'aprovado' && x.nota);
  const lista = it.filter((x) => !f.st || x.status === f.st);
  const ativa = S.grupo.participacao_ativa !== false;
  $('#conteudo').innerHTML = `
    <div class="kpis">
      <div class="kpi destaque"><span>Aguardando aprovação</span><b>${it.filter((x) => x.status === 'pendente').length}</b></div>
      <div class="kpi"><span>Publicados</span><b>${it.filter((x) => x.status === 'aprovado').length}</b></div>
      <div class="kpi o"><span>Nota média</span><b>${ap.length ? (soma(ap, 'nota') / ap.length).toFixed(1).replace('.', ',') + ' ★' : '—'}</b><small>${ap.length} avaliação(ões) publicadas</small></div>
      <div class="kpi v"><span>Curtidas na página</span><b>❤️ ${S.grupo.curtidas || 0}</b></div>
    </div>
    <div class="card"><div class="entre"><div><b>Formulário “Participe” na página pública:</b> ${ativa ? '<span class="badge b-verde">aberto</span>' : '<span class="badge b-cinza">fechado</span>'}</div>
      <button class="btn peq" onclick="alternarParticipacao(${!ativa})">${ativa ? 'Fechar envios' : 'Abrir envios'}</button></div>
      <p class="dica" style="margin-top:6px">A população manda depoimentos com nota de 1 a 5 estrelas, fotos com a Carretinha e recados ao Papai Noel. Nada aparece na página antes de alguém da equipe aprovar. Na página aparece só o primeiro nome.</p></div>
    <div class="filtros" style="display:flex;gap:6px;flex-wrap:wrap">${[['pendente', 'Aguardando'], ['aprovado', 'Publicados'], ['recusado', 'Recusados'], ['', 'Todos']].map(([k, l]) => `<button class="btn peq ${f.st === k ? 'prim' : ''}" onclick="F.part.st='${k}';rParticipacao()">${l}</button>`).join('')}</div>
    ${lista.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px">${lista.map((x) => `<div class="card" style="padding:14px">
      <div class="entre"><span class="badge ${ST_INT[x.status][1]}">${ST_INT[x.status][0]}</span><small class="dica">${dataHoraBR(x.criado_em)}</small></div>
      <p style="margin:8px 0 2px"><b>${esc(x.nome)}</b>${x.bairro ? ` <small class="dica">· ${esc(x.bairro)}</small>` : ''}</p>
      <small class="dica">${TIPO_INT[x.tipo] || x.tipo}</small>
      ${x.nota ? `<div style="color:#d4a537;font-size:18px">${estrelas(x.nota)}</div>` : ''}
      ${x.texto ? `<p style="margin:6px 0;white-space:pre-line">${esc(x.texto)}</p>` : ''}
      ${x.foto_publica_path ? `<img src="${esc(urlPublica(x.foto_publica_path))}" style="width:100%;max-height:240px;object-fit:cover;border-radius:10px" alt="">` : x.foto_envio_path ? `<img data-envio="${esc(x.foto_envio_path)}" style="width:100%;max-height:240px;object-fit:cover;border-radius:10px;background:#f1ece0;min-height:60px" alt="Foto enviada">` : ''}
      ${x.resposta ? `<p class="ok-box" style="margin-top:8px">💬 Resposta da equipe: ${esc(x.resposta)}</p>` : ''}
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">
        ${x.status !== 'aprovado' ? `<button class="btn peq prim" onclick="moderar('${x.id}','aprovado')">✔ Aprovar e publicar</button>` : `<button class="btn peq" onclick="moderar('${x.id}','pendente')">Tirar da página</button>`}
        ${x.status !== 'recusado' ? `<button class="btn peq" onclick="moderar('${x.id}','recusado')">Recusar</button>` : ''}
        <button class="btn peq" onclick="responder('${x.id}')">Responder</button>
        <button class="btn peq perigo" onclick="excluirInteracao('${x.id}')">Excluir</button></div></div>`).join('')}</div>` : '<div class="card vazio">Nada por aqui.</div>'}`;
  document.querySelectorAll('[data-envio]').forEach(async (img) => {
    const { data } = await sb.storage.from('natal-interacoes').createSignedUrl(img.dataset.envio, 600);
    if (data?.signedUrl) { img.src = data.signedUrl; img.style.cursor = 'zoom-in'; img.onclick = () => window.open(data.signedUrl, '_blank', 'noopener'); }
  });
}
// Ao aprovar uma foto, ela é copiada do bucket privado para o público (só então aparece na página)
async function publicarFoto(x) {
  if (!x.foto_envio_path || x.foto_publica_path) return x.foto_publica_path || null;
  const { data, error } = await sb.storage.from('natal-interacoes').download(x.foto_envio_path);
  if (error) throw error;
  const ext = (x.foto_envio_path.split('.').pop() || 'jpg').toLowerCase();
  const file = new File([data], `foto.${ext}`, { type: data.type || 'image/jpeg' });
  return enviarArquivo(file, 'participacao', true);
}
window.moderar = async (id, st) => {
  const x = S.interacoes.find((i) => i.id === id);
  try {
    const d = { status: st, moderado_por: CLAIMS.sub, moderado_em: new Date().toISOString() };
    if (st === 'aprovado') d.foto_publica_path = await publicarFoto(x);
    if (st !== 'aprovado' && x.foto_publica_path) { await sb.storage.from(BUCKET_PUB).remove([x.foto_publica_path]); d.foto_publica_path = null; }
    await gravar('natal_interacoes', id, d); await recarregar(false); toast(st === 'aprovado' ? 'Publicado na página' : 'Atualizado');
  } catch (e) { toast(msgErro(e), true); }
};
window.responder = (id) => {
  const x = S.interacoes.find((i) => i.id === id);
  abrirForm({ titulo: `Responder ${esc(x.nome)}`, campos: [{ k: 'resposta', l: 'Resposta da equipe (aparece na página junto com a mensagem publicada)', t: 'textarea', full: true }], valores: x, salvar: (d) => gravar('natal_interacoes', id, { resposta: d.resposta }) });
};
window.excluirInteracao = async (id) => {
  const x = S.interacoes.find((i) => i.id === id);
  if (!(await confirmar('Excluir esta mensagem e a foto enviada?', 'Excluir'))) return;
  try {
    if (x.foto_envio_path) await sb.storage.from('natal-interacoes').remove([x.foto_envio_path]);
    if (x.foto_publica_path) await sb.storage.from(BUCKET_PUB).remove([x.foto_publica_path]);
    await apagar('natal_interacoes', id); await recarregar(false); toast('Excluído');
  } catch (e) { toast(msgErro(e), true); }
};
window.alternarParticipacao = async (v) => {
  try { const { error } = await sb.from('natal_grupos').update({ participacao_ativa: v }).eq('id', GRUPO); if (error) throw error; await recarregar(false); toast(v ? 'Envios abertos' : 'Envios fechados'); } catch (e) { toast(msgErro(e), true); }
};
