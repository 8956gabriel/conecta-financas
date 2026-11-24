/* ============================================================
   CARRETINHA DE NATAL — 🎞️ 10 anos (retrospectiva + depoimentos da equipe)
   · 📸 Bastidores · 🎅 Papai Noel · 🙏 Novena de Natal
   Carregado depois de carretinha-natal.js e carretinha-extra.js.
   ============================================================ */
'use strict';

const ETAPAS = ['Arrumando as balas', 'Montando os saquinhos', 'Arrumando a carretinha', 'Decoração', 'Luzes', 'Ensaio do Papai Noel', 'Venda das rifas', 'Doações', 'Dia da Carretinha', 'Equipe'];
const SEM_009 = '<div class="erro-box">Esta parte ainda não foi instalada no banco. O administrador precisa rodar o arquivo <b>supabase/009_carretinha_10anos_bastidores_papainoel_novena.sql</b> no Supabase (SQL Editor).</div>';
const tem009 = () => S.maisOk === true;

// ---------- Carregamento ----------
const _carregarExtras0 = window.carregarExtras;
window.carregarExtras = async function () {
  if (_carregarExtras0) await _carregarExtras0();
  try {
    const [anos, memorias, equipe, bastidores, noites, inscricoes] = await Promise.all([
      todos('natal_anos', 'ano'), todos('natal_memorias', 'criado_em'), todos('natal_equipe_depo', 'criado_em'),
      todos('natal_bastidores', 'criado_em'), todos('natal_novena_noites', 'criado_em'), todos('natal_novena_inscricoes', 'criado_em'),
    ]);
    Object.assign(S, { anos, memorias, equipeDepo: equipe, bastidores, noites, inscricoes, maisOk: true });
  } catch (e) {
    Object.assign(S, { anos: [], memorias: [], equipeDepo: [], bastidores: [], noites: [], inscricoes: [], maisOk: false });
  }
};

// ---------- Menu ----------
(function () {
  const i = SECOES.findIndex((s) => s.id === 'divulgacao');
  SECOES.splice(i < 0 ? SECOES.length : i, 0,
    { id: 'dezanos', n: '🎞️', l: '10 anos — Retrospectiva', visivel: () => true, render: rDezAnos },
    { id: 'bastidores', n: '📸', l: 'Bastidores', visivel: () => true, render: rBastidores },
    { id: 'papainoel', n: '🎅', l: 'Papai Noel', visivel: () => true, render: rPapaiNoel },
    { id: 'novena', n: '🙏', l: 'Novena de Natal', visivel: () => true, render: rNovena });
  const montar0 = montarMenu;
  montarMenu = function () {      // eslint-disable-line no-func-assign
    montar0();
    const pend = (S.inscricoes || []).filter((x) => x.status === 'pendente').length;
    const b = [...document.querySelectorAll('#menu button')].find((x) => x.textContent.includes('Novena de Natal'));
    if (b && pend) b.insertAdjacentHTML('beforeend', `<span class="cont">${pend}</span>`);
  };
})();

async function enviarVarias(files, pasta, gravarLinha, prog) {
  let ok = 0;
  for (const f of files) {
    if (prog) prog.textContent = `Enviando ${ok + 1} de ${files.length}…`;
    try { const path = await enviarArquivo(f, pasta, true); await gravarLinha(path); ok++; } catch (e) { toast(`${f.name}: ${msgErro(e)}`, true); }
  }
  if (prog) prog.textContent = '';
  return ok;
}
async function salvarGrupo(d) { const { error } = await sb.from('natal_grupos').update(d).eq('id', GRUPO); if (error) throw error; }

// ============================================================
// 🎞️ 10 ANOS — RETROSPECTIVA
// ============================================================
function rDezAnos() {
  if (!tem009()) { $('#conteudo').innerHTML = SEM_009; return; }
  const ed = pode('divulgacao');
  const ini = S.grupo.ano_fundacao || 2017, fim = Math.max(Number(S.config.ano) || new Date().getFullYear(), ini);
  const anos = Array.from({ length: fim - ini + 1 }, (_, i) => fim - i);
  const edicao = fim - ini + 1;
  $('#conteudo').innerHTML = `
    <div class="card" style="background:linear-gradient(135deg,#0f3d24,#166534);color:#fff;border:none">
      <div class="entre"><div><p style="margin:0;color:#e6c45c;font-weight:700">🎄 ${ini} → ${fim}</p><h2 class="titulo-natal" style="font-size:30px;margin:4px 0">${edicao} anos de Carretinha de Natal</h2>
        <p style="margin:0;opacity:.85">Monte a retrospectiva: a história de cada ano, as fotos e os depoimentos de quem faz a Carretinha. Tudo aparece na aba “10 anos” da página pública.</p></div>
        ${ed ? `<label style="color:#fff;font-size:12.5px;font-weight:600">Ano da 1ª edição<input id="dz-ini" type="number" value="${ini}" style="width:110px;margin-top:4px"></label>` : ''}</div></div>
    <div class="card"><div class="entre"><h3 style="margin:0">💬 Depoimentos de quem faz a Carretinha (${S.equipeDepo.length})</h3>${ed ? '<button class="btn prim" onclick="formEquipeDepo()">+ Depoimento</button>' : ''}</div>
      ${S.equipeDepo.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;margin-top:10px">${[...S.equipeDepo].sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999)).map((d) => `<div class="passo" style="align-items:flex-start;cursor:${ed ? 'pointer' : 'default'}" ${ed ? `onclick="formEquipeDepo('${d.id}')"` : ''}>
        ${d.foto_path ? `<img src="${esc(urlPublica(d.foto_path))}" style="width:48px;height:48px;border-radius:50%;object-fit:cover" alt="">` : '<span class="ck">🎅</span>'}
        <div><b style="text-decoration:none;color:var(--txt)">${esc(d.nome)}</b>${d.publico ? '' : ' <span class="badge b-cinza">oculto</span>'}<small>${esc([d.funcao, d.desde_ano && 'desde ' + d.desde_ano].filter(Boolean).join(' · '))}</small><small style="color:var(--txt);margin-top:4px">“${esc(d.texto.slice(0, 160))}${d.texto.length > 160 ? '…' : ''}”</small></div></div>`).join('')}</div>`
      : '<p class="vazio">Nenhum depoimento ainda. Peça para cada integrante contar o que a Carretinha significa para ele.</p>'}</div>
    ${anos.map((a) => { const info = S.anos.find((x) => x.ano === a) || {}; const fotos = S.memorias.filter((m) => m.ano === a).sort((x, y) => (x.ordem ?? 999) - (y.ordem ?? 999)); return `
    <div class="card"><div class="entre"><div style="display:flex;gap:12px;align-items:center"><span style="background:var(--vermelho2);color:#fff;font-weight:800;font-size:20px;border-radius:12px;padding:6px 12px">${a}</span>
        <div><b style="font-size:16px">${esc(info.titulo || (a === ini ? 'A primeira Carretinha' : `${a - ini + 1}ª edição`))}</b>${info.destaque ? `<br><small class="dica">⭐ ${esc(info.destaque)}</small>` : ''}${info.id && !info.publico ? ' <span class="badge b-cinza">oculto</span>' : ''}</div></div>
      ${ed ? `<div style="display:flex;gap:6px"><button class="btn peq" onclick="formAno(${a})">✏️ História do ano</button><label class="btn peq prim" style="cursor:pointer">+ Fotos<input type="file" accept="image/*" multiple style="display:none" data-ano="${a}"></label></div>` : ''}</div>
      ${info.texto ? `<p style="margin:10px 0 0;white-space:pre-line">${esc(info.texto)}</p>` : ''}
      <div class="dica" data-prog="${a}"></div>
      ${fotos.length ? `<div class="galeria" style="margin-top:10px">${fotos.map((f) => `<div class="gal-item" ${ed ? `onclick="formMemoria('${f.id}')"` : ''}><img src="${esc(urlPublica(f.foto_path))}" alt="" loading="lazy">${f.legenda ? `<span>${esc(f.legenda)}</span>` : ''}${f.publico ? '' : '<em>oculta</em>'}</div>`).join('')}</div>` : `<p class="dica" style="margin-top:8px">Sem fotos de ${a} ainda.</p>`}
    </div>`; }).join('')}`;
  const di = $('#dz-ini');
  if (di) di.onchange = async () => { const v = Math.round(num(di.value)); if (v < 1990 || v > fim) return toast('Ano inválido', true); try { await salvarGrupo({ ano_fundacao: v }); await recarregar(false); } catch (e) { toast(msgErro(e), true); } };
  document.querySelectorAll('input[data-ano]').forEach((inp) => {
    inp.onchange = async () => {
      const ano = +inp.dataset.ano, files = [...inp.files]; if (!files.length) return;
      const ok = await enviarVarias(files, 'memorias', async (path) => { const { error } = await sb.from('natal_memorias').insert({ ano, foto_path: path }); if (error) throw error; }, document.querySelector(`[data-prog="${ano}"]`));
      await recarregar(false); toast(`${ok} foto(s) de ${ano} enviada(s)`);
    };
  });
}
window.formAno = (ano) => {
  const a = S.anos.find((x) => x.ano === ano);
  abrirForm({
    titulo: `História de ${ano}`,
    campos: [
      { k: 'titulo', l: 'Título do ano', full: true, dica: 'Ex.: A primeira Carretinha, O ano da chuva, 10 anos de alegria' },
      { k: 'destaque', l: 'Números / destaque', full: true, dica: 'Ex.: 300 crianças · 2 bairros · 15 voluntários' },
      { k: 'texto', l: 'Como foi esse ano', t: 'textarea', full: true },
      { k: 'publico', l: 'Mostrar na página pública', t: 'select', op: [['true', 'Sim'], ['false', 'Não']] },
    ],
    valores: a ? { ...a, publico: String(a.publico) } : { publico: 'true' },
    salvar: (d) => { d.publico = d.publico !== 'false'; d.ano = ano; return gravar('natal_anos', a?.id, d); },
    excluir: a && pode('divulgacao') ? () => apagar('natal_anos', a.id) : null,
  });
};
window.formMemoria = (id) => {
  const f = S.memorias.find((x) => x.id === id);
  abrirForm({
    titulo: `Foto de ${f.ano}`,
    campos: [
      { k: 'legenda', l: 'Legenda', full: true },
      { k: 'ano', l: 'Ano', t: 'number' },
      { k: 'ordem', l: 'Ordem (menor aparece primeiro)', t: 'number' },
      { k: 'publico', l: 'Mostrar na página pública', t: 'select', op: [['true', 'Sim'], ['false', 'Não']] },
    ],
    extra: `<img src="${esc(urlPublica(f.foto_path))}" style="width:100%;max-height:320px;object-fit:contain;border-radius:12px;margin-top:10px;background:#f5efe0" alt="">`,
    valores: { ...f, publico: String(f.publico) },
    salvar: (d) => { d.publico = d.publico !== 'false'; d.ordem = d.ordem ? Math.round(d.ordem) : null; d.ano = Math.round(d.ano || f.ano); return gravar('natal_memorias', f.id, d); },
    excluir: () => apagar('natal_memorias', f.id),
  });
};
window.formEquipeDepo = (id) => {
  const d0 = id ? S.equipeDepo.find((x) => x.id === id) : null;
  abrirForm({
    titulo: d0 ? `Depoimento de ${esc(d0.nome)}` : 'Novo depoimento da equipe',
    campos: [
      { k: 'nome', l: 'Nome', req: true }, { k: 'funcao', l: 'O que faz na Carretinha', dica: 'Ex.: Papai Noel, motorista, decoração' },
      { k: 'desde_ano', l: 'Está na Carretinha desde', t: 'number' }, { k: 'ordem', l: 'Ordem', t: 'number' },
      { k: 'texto', l: 'Depoimento', t: 'textarea', req: true, full: true, dica: 'O que a Carretinha significa para você? Uma lembrança marcante?' },
      { k: 'foto_path', l: 'Foto (opcional)', t: 'file', accept: 'image/*', pasta: 'equipe', publico: true, full: true },
      { k: 'publico', l: 'Mostrar na página pública', t: 'select', op: [['true', 'Sim'], ['false', 'Não']] },
    ],
    valores: d0 ? { ...d0, publico: String(d0.publico) } : { publico: 'true' },
    salvar: (d) => { d.publico = d.publico !== 'false'; d.desde_ano = d.desde_ano ? Math.round(d.desde_ano) : null; d.ordem = d.ordem ? Math.round(d.ordem) : null; return gravar('natal_equipe_depo', d0?.id, d); },
    excluir: d0 ? () => apagar('natal_equipe_depo', d0.id) : null,
  });
};

// ============================================================
// 📸 BASTIDORES (qualquer integrante posta)
// ============================================================
function rBastidores() {
  if (!tem009()) { $('#conteudo').innerHTML = SEM_009; return; }
  const f = (F.bast = { etapa: '', ...(F.bast || {}) });
  const etapas = [...new Set([...ETAPAS, ...S.bastidores.map((b) => b.etapa).filter(Boolean)])];
  const lista = [...S.bastidores].filter((b) => !f.etapa || b.etapa === f.etapa).sort((a, b) => b.criado_em.localeCompare(a.criado_em));
  $('#conteudo').innerHTML = `
    <div class="card"><h3>📸 Postar nos bastidores</h3>
      <p class="dica" style="margin:4px 0 10px">Mostre como a Carretinha é feita: arrumando as balas, montando a carretinha, a decoração… Todo integrante pode postar. As fotos aparecem na aba “Bastidores” da página pública.</p>
      <div class="grade-form"><label>Etapa<input id="ba-etapa" list="ba-etapas" placeholder="Ex.: Arrumando as balas"><datalist id="ba-etapas">${etapas.map((e) => `<option value="${esc(e)}">`).join('')}</datalist></label>
        <label>Legenda (vale para todas as fotos)<input id="ba-leg" placeholder="Ex.: Mutirão de sábado separando 2.000 balas!"></label></div>
      <label class="btn prim" style="cursor:pointer;margin-top:10px">📷 Escolher fotos e postar<input type="file" id="ba-up" accept="image/*" multiple style="display:none"></label> <span class="dica" id="ba-prog"></span></div>
    <div class="filtros" style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn peq ${!f.etapa ? 'prim' : ''}" onclick="F.bast.etapa='';rBastidores()">Todas (${S.bastidores.length})</button>${etapas.filter((e) => S.bastidores.some((b) => b.etapa === e)).map((e) => `<button class="btn peq ${f.etapa === e ? 'prim' : ''}" onclick="F.bast.etapa=${esc(JSON.stringify(e))};rBastidores()">${esc(e)}</button>`).join('')}</div>
    ${lista.length ? `<div class="card"><div class="galeria" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr))">${lista.map((b) => `<div class="gal-item" onclick="formBastidor('${b.id}')"><img src="${esc(urlPublica(b.foto_path))}" alt="" loading="lazy"><span>${esc(b.etapa ? b.etapa + ' · ' : '')}${esc(b.autor_nome || '')}</span>${b.publico ? '' : '<em>oculta</em>'}</div>`).join('')}</div></div>` : '<div class="card vazio">Nenhuma foto de bastidor ainda.</div>'}`;
  $('#ba-up').onchange = async (e) => {
    const files = [...e.target.files]; if (!files.length) return;
    const etapa = $('#ba-etapa').value.trim() || null, legenda = $('#ba-leg').value.trim() || null;
    const ok = await enviarVarias(files, 'bastidores', async (path) => { const { error } = await sb.from('natal_bastidores').insert({ foto_path: path, etapa, legenda }); if (error) throw error; }, $('#ba-prog'));
    await recarregar(false); toast(`${ok} foto(s) postada(s) nos bastidores`);
  };
}
window.formBastidor = (id) => {
  const b = S.bastidores.find((x) => x.id === id);
  const meu = b.criado_por === CLAIMS.sub, mod = pode('divulgacao');
  if (!meu && !mod) { abrirModal({ titulo: esc(b.etapa || 'Bastidores'), corpo: `<img src="${esc(urlPublica(b.foto_path))}" style="width:100%;border-radius:12px" alt=""><p>${esc(b.legenda || '')}</p><p class="dica">Postado por ${esc(b.autor_nome || '')} em ${dataBR(b.data)}</p>` }); return; }
  abrirForm({
    titulo: 'Foto dos bastidores',
    campos: [
      { k: 'etapa', l: 'Etapa', t: 'datalist', lista: ETAPAS }, { k: 'data', l: 'Data', t: 'date' },
      { k: 'legenda', l: 'Legenda', full: true },
      { k: 'publico', l: 'Mostrar na página pública', t: 'select', op: [['true', 'Sim'], ['false', 'Não']] },
    ],
    extra: `<img src="${esc(urlPublica(b.foto_path))}" style="width:100%;max-height:320px;object-fit:contain;border-radius:12px;margin-top:10px;background:#f5efe0" alt=""><p class="dica">Postado por ${esc(b.autor_nome || '')}</p>`,
    valores: { ...b, publico: String(b.publico) },
    salvar: (d) => { d.publico = d.publico !== 'false'; return gravar('natal_bastidores', b.id, d); },
    excluir: () => apagar('natal_bastidores', b.id),
  });
};

// ============================================================
// 🎅 PAPAI NOEL — recados e mensagem personalizada
// ============================================================
function rPapaiNoel() {
  if (!tem009()) { $('#conteudo').innerHTML = SEM_009; return; }
  const recados = (S.interacoes || []).filter((x) => x.tipo === 'recado').sort((a, b) => b.criado_em.localeCompare(a.criado_em));
  const ed = pode('divulgacao');
  $('#conteudo').innerHTML = `
    <div class="card" style="background:linear-gradient(135deg,#b91c1c,#7f1d1d);color:#fff;border:none"><h3 style="color:#fff">🎅 Aba do Papai Noel na página pública</h3>
      <p style="margin:6px 0 0;opacity:.9">Na página, qualquer pessoa digita o nome de uma criança e o Papai Noel aparece na tela <b>falando com voz de Papai Noel</b> uma mensagem com o nome dela. Dá para mandar o link no WhatsApp: quem abre vê o Papai Noel falando o nome. Também dá para baixar um cartão com a mensagem. As crianças podem mandar recados, e vocês respondem como Papai Noel.</p>
      <a class="btn ouro" style="margin-top:12px" href="${esc(linkPublico())}#papainoel" target="_blank" rel="noopener">Ver a aba do Papai Noel</a></div>
    ${ed ? `<div class="card"><h3>✍️ Recado do Papai Noel</h3><p class="dica" style="margin:4px 0 8px">Texto que entra em toda mensagem personalizada, depois do nome. Use {nome} onde quiser o nome da pessoa. Deixe vazio para usar as mensagens prontas.</p>
      <textarea id="pn-msg" placeholder="Ex.: Ho ho ho! Olá, {nome}! Eu e meus duendes estamos muito felizes com você. Neste Natal, a Carretinha vai passar na sua rua com muitos doces!">${esc(S.grupo.papai_noel_msg || '')}</textarea>
      <button class="btn prim" style="margin-top:8px" id="pn-salvar">Salvar recado</button></div>` : ''}
    <div class="card"><h3>💌 Recados para o Papai Noel (${recados.length})</h3>
      <p class="dica" style="margin:4px 0 10px">Os recados aparecem na página só depois de aprovados. Responda como Papai Noel!</p>
      ${recados.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px">${recados.map((x) => `<div class="passo" style="align-items:flex-start;flex-direction:column;gap:6px">
        <div class="entre" style="width:100%"><b>${esc(x.nome)}</b><span class="badge ${ST_INT[x.status][1]}">${ST_INT[x.status][0]}</span></div>
        ${x.texto ? `<p style="margin:0;white-space:pre-line">${esc(x.texto)}</p>` : ''}${x.resposta ? `<p class="ok-box" style="margin:0;width:100%">🎅 ${esc(x.resposta)}</p>` : ''}
        ${ed ? `<div style="display:flex;gap:6px;flex-wrap:wrap">${x.status !== 'aprovado' ? `<button class="btn peq prim" onclick="moderar('${x.id}','aprovado')">Aprovar</button>` : ''}<button class="btn peq" onclick="responder('${x.id}')">Responder como Papai Noel</button>${x.status !== 'recusado' ? `<button class="btn peq" onclick="moderar('${x.id}','recusado')">Recusar</button>` : ''}</div>` : ''}</div>`).join('')}</div>` : '<p class="vazio">Nenhum recado ainda.</p>'}</div>`;
  const b = $('#pn-salvar');
  if (b) b.onclick = async () => { try { await salvarGrupo({ papai_noel_msg: $('#pn-msg').value.trim() || null }); await recarregar(false); toast('Recado do Papai Noel salvo'); } catch (e) { toast(msgErro(e), true); } };
}

// ============================================================
// 🙏 NOVENA DE NATAL
// ============================================================
const ST_NOV = { pendente: ['Nova inscrição', 'b-ouro'], confirmada: ['Confirmada', 'b-verde'], recusada: ['Não confirmada', 'b-cinza'] };
function rNovena() {
  if (!tem009()) { $('#conteudo').innerHTML = SEM_009; return; }
  const ed = pode('divulgacao');
  const noites = [...S.noites].sort((a, b) => (a.data || '9999').localeCompare(b.data || '9999') || (a.noite ?? 99) - (b.noite ?? 99));
  const insc = [...S.inscricoes].sort((a, b) => (a.status === 'pendente' ? -1 : 0) - (b.status === 'pendente' ? -1 : 0) || b.criado_em.localeCompare(a.criado_em));
  const ativa = S.grupo.novena_ativa !== false;
  $('#conteudo').innerHTML = `
    <div class="kpis"><div class="kpi destaque"><span>Inscrições</span><b>${insc.length}</b><small>${insc.filter((x) => x.status === 'pendente').length} nova(s)</small></div>
      <div class="kpi"><span>Querem receber em casa</span><b>${insc.filter((x) => x.quer_receber).length}</b></div>
      <div class="kpi o"><span>Pessoas (estimado)</span><b>${soma(insc.filter((x) => x.status !== 'recusada'), (x) => x.pessoas || 0)}</b></div>
      <div class="kpi v"><span>Noites marcadas</span><b>${noites.length}</b><small>${noites.filter((n) => n.familia).length} com família</small></div></div>
    ${ed ? `<div class="card"><div class="entre"><div><b>Inscrições na página pública:</b> ${ativa ? '<span class="badge b-verde">abertas</span>' : '<span class="badge b-cinza">fechadas</span>'}</div><button class="btn peq" id="nv-tog">${ativa ? 'Fechar inscrições' : 'Abrir inscrições'}</button></div>
      <label class="form" style="display:block;margin-top:10px"><span class="dica">Texto de apresentação da novena (aparece na página)</span><textarea id="nv-info" placeholder="Ex.: De 16 a 24 de dezembro, rezamos a Novena de Natal visitando as casas da comunidade. Inscreva sua família para receber uma noite!">${esc(S.grupo.novena_info || '')}</textarea></label>
      <button class="btn prim" style="margin-top:8px" id="nv-salvar">Salvar texto</button></div>` : ''}
    <div class="card"><div class="entre"><h3 style="margin:0">🗓️ Noites da novena</h3>${ed ? '<button class="btn prim" onclick="formNoite()">+ Noite</button>' : ''}</div>
      ${noites.length ? `<div class="tabela-wrap" style="margin-top:10px"><table><thead><tr><th>Noite</th><th>Data</th><th>Hora</th><th>Tema</th><th>Família anfitriã</th><th>Endereço</th><th></th></tr></thead><tbody>${noites.map((n) => `<tr>
        <td><b>${n.noite ? n.noite + 'ª' : '—'}</b></td><td>${dataBR(n.data) || '—'}</td><td>${esc(n.hora || '')}</td><td>${esc(n.tema || '')}</td><td>${esc(n.familia || '—')}</td>
        <td>${esc([n.endereco, n.bairro].filter(Boolean).join(' · '))}${n.endereco ? `<br><small class="dica">${n.mostrar_endereco ? '👁 aparece na página' : '🔒 só a equipe vê'}</small>` : ''}</td>
        <td class="acoes">${ed ? `<button class="btn peq" onclick="formNoite('${n.id}')">Editar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="vazio">Nenhuma noite cadastrada. Crie as 9 noites e escolha a família de cada uma.</p>'}</div>
    <div class="card"><h3>👨‍👩‍👧 Famílias inscritas</h3>
      ${insc.length ? `<div class="tabela-wrap" style="margin-top:10px"><table><thead><tr><th>Família</th><th>Contato</th><th>Endereço</th><th>Pessoas</th><th>Quer receber?</th><th>Datas</th><th>Situação</th><th>Noite</th><th></th></tr></thead><tbody>${insc.map((x) => `<tr>
        <td><b>${esc(x.familia)}</b><br><small class="dica">${esc(x.responsavel)} · ${dataBR(x.criado_em)}</small>${x.observacoes ? `<br><small>${esc(x.observacoes)}</small>` : ''}</td>
        <td>${x.telefone ? `<a href="${esc(zapLink(x.telefone, `Olá, ${x.responsavel}! Aqui é da Carretinha de Natal, sobre a inscrição da ${x.familia} na Novena de Natal. 🙏🎄`))}" target="_blank" rel="noopener">${esc(x.telefone)}</a>` : '—'}</td>
        <td>${esc([x.endereco, x.bairro].filter(Boolean).join(' · ') || '—')}<br><small class="dica">${x.autoriza_endereco ? 'autoriza divulgar' : 'não divulgar'}</small></td>
        <td>${x.pessoas || '—'}</td><td>${x.quer_receber ? '🏠 sim' : 'só participar'}</td><td><small>${esc(x.datas_preferidas || '')}</small></td>
        <td><span class="badge ${ST_NOV[x.status][1]}">${ST_NOV[x.status][0]}</span></td>
        <td>${ed ? `<select onchange="vincularNoite('${x.id}',this.value)" style="padding:5px 8px"><option value="">—</option>${noites.map((n) => `<option value="${n.id}"${x.noite_id === n.id ? ' selected' : ''}>${n.noite ? n.noite + 'ª' : ''} ${dataBR(n.data)}</option>`).join('')}</select>` : esc(noites.find((n) => n.id === x.noite_id)?.data ? dataBR(noites.find((n) => n.id === x.noite_id).data) : '—')}</td>
        <td class="acoes">${ed ? `${x.status !== 'confirmada' ? `<button class="btn peq prim" onclick="statusInscricao('${x.id}','confirmada')">Confirmar</button>` : ''}${x.status !== 'recusada' ? ` <button class="btn peq" onclick="statusInscricao('${x.id}','recusada')">Não confirmar</button>` : ''} <button class="btn peq perigo" onclick="excluirInscricao('${x.id}')">Excluir</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="vazio">Nenhuma família inscrita ainda. O formulário fica na aba “Novena” da página pública.</p>'}</div>`;
  const tg = $('#nv-tog');
  if (tg) tg.onclick = async () => { try { await salvarGrupo({ novena_ativa: !ativa }); await recarregar(false); } catch (e) { toast(msgErro(e), true); } };
  const sv = $('#nv-salvar');
  if (sv) sv.onclick = async () => { try { await salvarGrupo({ novena_info: $('#nv-info').value.trim() || null }); await recarregar(false); toast('Texto da novena salvo'); } catch (e) { toast(msgErro(e), true); } };
}
window.formNoite = (id) => {
  const n = id ? S.noites.find((x) => x.id === id) : null;
  const fams = S.inscricoes.filter((x) => x.status !== 'recusada');
  abrirForm({
    titulo: n ? `${n.noite ? n.noite + 'ª noite' : 'Noite'} da novena` : 'Nova noite da novena',
    campos: [
      { k: 'noite', l: 'Noite (1 a 9)', t: 'number' }, { k: 'data', l: 'Data', t: 'date' }, { k: 'hora', l: 'Hora', dica: 'Ex.: 19h30' },
      { k: 'tema', l: 'Tema / leitura' },
      { k: 'familia', l: 'Família anfitriã', t: 'datalist', lista: fams.map((x) => x.familia) },
      { k: 'bairro', l: 'Bairro' }, { k: 'endereco', l: 'Endereço', full: true },
      { k: 'mostrar_endereco', l: 'Mostrar o endereço na página pública', t: 'select', op: [['false', 'Não (só a equipe vê)'], ['true', 'Sim — a família autorizou']] },
      { k: 'observacoes', l: 'Observações', t: 'textarea', full: true },
    ],
    valores: n ? { ...n, mostrar_endereco: String(n.mostrar_endereco) } : { noite: (S.noites.length || 0) + 1, mostrar_endereco: 'false' },
    aoAbrir: (fundo) => {
      const fam = fundo.querySelector('[name=familia]');
      fam.addEventListener('change', () => { const x = fams.find((i) => i.familia === fam.value); if (!x) return; if (!fundo.querySelector('[name=endereco]').value) fundo.querySelector('[name=endereco]').value = x.endereco || ''; if (!fundo.querySelector('[name=bairro]').value) fundo.querySelector('[name=bairro]').value = x.bairro || ''; fundo.querySelector('[name=mostrar_endereco]').value = x.autoriza_endereco ? 'true' : 'false'; });
    },
    salvar: (d) => { d.mostrar_endereco = d.mostrar_endereco === 'true'; d.noite = d.noite ? Math.round(d.noite) : null; return gravar('natal_novena_noites', n?.id, d); },
    excluir: n ? () => apagar('natal_novena_noites', n.id) : null,
  });
};
window.vincularNoite = async (id, noite) => { try { await gravar('natal_novena_inscricoes', id, { noite_id: noite || null, ...(noite ? { status: 'confirmada' } : {}) }); await recarregar(false); toast('Inscrição atualizada'); } catch (e) { toast(msgErro(e), true); } };
window.statusInscricao = async (id, st) => { try { await gravar('natal_novena_inscricoes', id, { status: st }); await recarregar(false); } catch (e) { toast(msgErro(e), true); } };
window.excluirInscricao = async (id) => { if (!(await confirmar('Excluir esta inscrição?', 'Excluir'))) return; try { await apagar('natal_novena_inscricoes', id); await recarregar(false); toast('Excluída'); } catch (e) { toast(msgErro(e), true); } };
