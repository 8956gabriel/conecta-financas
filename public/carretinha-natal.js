/* ============================================================
   CONECTA FINANÇAS — MÓDULO CARRETINHA DE NATAL
   Mesmo login do Conecta Finanças. Grupo próprio (equipe), tabelas natal_*.
   Segurança garantida no banco (RLS por papel e grupo).
   ============================================================ */
'use strict';

const SUPABASE_URL = 'https://fclpcdtnmlpjfgovubra.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjbHBjZHRubWxwamZnb3Z1YnJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyODM3NDUsImV4cCI6MjEwMDg1OTc0NX0.SYo7qhk2Dg33AQO1Rcpm8H6RbJ5ieZGLQR1hcUU16-A';
const BUCKET = 'natal-comprovantes';      // privado: comprovantes
const BUCKET_PUB = 'natal-publico';       // público: fotos dos prêmios (aparecem no link de divulgação)
const urlPublica = (path) => (path ? sb.storage.from(BUCKET_PUB).getPublicUrl(path).data.publicUrl : '');

const CATEGORIAS_DESPESA = ['Balas', 'Pirulitos', 'Chicletes', 'Saquinhos', 'Combustível', 'Brinquedos', 'Gráfica', 'Prêmios', 'Gastos variáveis', 'Alimentação', 'Decoração', 'Outros'];
const CATEGORIAS_PRODUTO = ['Balas', 'Pirulitos', 'Chicletes', 'Saquinhos', 'Brinquedos', 'Decoração', 'Outros'];
const FORMAS_DESPESA = [['dinheiro', 'Dinheiro'], ['pix', 'PIX'], ['cartao', 'Cartão'], ['outro', 'Outro']];
const FORMAS_REC = [['dinheiro', 'Dinheiro'], ['pix', 'PIX']];
const ST_NUM = { disponivel: 'Disponível', reservado: 'Reservado', vendido: 'Vendido', pago: 'Pago', pendente: 'Pendente', cancelado: 'Cancelado' };
const ST_NUM_COR = { disponivel: 'b-cinza', reservado: 'b-azul', vendido: 'b-ouro', pago: 'b-verde', pendente: 'b-verm', cancelado: 'b-cinza' };
const ST_BLOQ = { disponivel: 'Disponível', entregue: 'Entregue', em_andamento: 'Em andamento', devolvido: 'Devolvido', finalizado: 'Finalizado' };
const ST_BLOQ_COR = { disponivel: 'b-cinza', entregue: 'b-azul', em_andamento: 'b-ouro', devolvido: 'b-roxo', finalizado: 'b-verde' };
const ST_PREMIO = { doado: 'Doado', comprado: 'Comprado', pago: 'Pago', pendente: 'Pendente' };
const ST_PREMIO_COR = { doado: 'b-verde', comprado: 'b-azul', pago: 'b-verde', pendente: 'b-verm' };
const PAPEIS = { admin: 'Administrador geral', financeiro: 'Financeiro', bloquinhos: 'Responsável por bloquinhos', consulta: 'Consulta' };

// ---------- Utilidades ----------
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const dataHoraBR = (d) => (d ? new Date(d).toLocaleString('pt-BR') : '');
const hoje = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const soma = (arr, f) => arr.reduce((s, x) => s + (Number(typeof f === 'function' ? f(x) : x[f]) || 0), 0);
const pad3 = (n) => String(n).padStart(3, '0');
const num = (v) => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim().replace(/\s|R\$/g, '');
  if (!s) return 0;
  if (s.includes(',')) return Number(s.replace(/\./g, '').replace(',', '.')) || 0;
  return Number(s) || 0;
};
const fmtNumInput = (v) => (v === null || v === undefined || v === '' ? '' : String(v).replace('.', ','));
function decodeJwt(t) {
  try {
    const p = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(atob(p).split('').map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')));
  } catch (e) { return {}; }
}
function msgErro(e) {
  const m = e?.message || String(e);
  if (/row-level security|permission denied|Sem permiss/i.test(m)) return 'Sem permissão para esta ação (verifique seu papel no módulo).';
  if (/JWT expired|jwt/i.test(m)) return 'Sua sessão expirou. Entre novamente.';
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha inválidos.';
  if (/Failed to fetch/i.test(m)) return 'Sem conexão com o servidor.';
  if (/duplicate key/i.test(m)) return 'Já existe um registro com esse número.';
  return m;
}
function toast(msg, erro) {
  const t = document.createElement('div');
  t.className = 'toast' + (erro ? ' erro' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), erro ? 5000 : 2800);
}

// Flocos de neve discretos
(function () {
  const box = document.getElementById('flocos');
  for (let i = 0; i < 18; i++) {
    const f = document.createElement('i');
    f.textContent = '❄';
    f.style.left = Math.random() * 100 + '%';
    f.style.fontSize = 8 + Math.random() * 12 + 'px';
    f.style.animationDuration = 9 + Math.random() * 14 + 's';
    f.style.animationDelay = -Math.random() * 20 + 's';
    box.appendChild(f);
  }
})();

// ---------- Estado ----------
let sb = null;          // cliente Supabase (sessão compartilhada com o app Conecta Finanças)
let CLAIMS = {};
let PAPEL = null;
let GRUPO = null;       // id do grupo (Carretinha) do usuário
let S = { carregado: false };
let SECAO = 'dashboard';
const F = {};           // filtros por seção
let charts = [];

const pode = (area) => {
  if (PAPEL === 'admin') return true;
  if (PAPEL === 'financeiro') return ['despesas', 'produtos', 'premios', 'bloquinhos', 'numeros', 'pagamentos', 'receitas', 'pessoas', 'entregas'].includes(area);
  if (PAPEL === 'bloquinhos') return ['bloquinhos', 'numeros', 'pagamentos', 'pessoas'].includes(area);
  return false;
};
const podeConfirmar = () => PAPEL === 'admin' || PAPEL === 'financeiro';

// ---------- Autenticação ----------
let modoLogin = 'entrar';
async function iniciar() {
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { storageKey: 'conecta-financas-auth', persistSession: true, autoRefreshToken: true },
  });
  const { data } = await sb.auth.getSession();
  if (data.session) { CLAIMS = decodeJwt(data.session.access_token); return entrar(); }
  mostrarTela('tela-login');
}

function mostrarTela(id) {
  ['tela-carregando', 'tela-login', 'tela-sem-acesso', 'app'].forEach((t) => document.getElementById(t).classList.toggle('oculto', t !== id));
}

function trocarModoLogin(m) {
  modoLogin = m;
  $('#aba-entrar').classList.toggle('on', m === 'entrar');
  $('#aba-cadastrar').classList.toggle('on', m === 'cadastrar');
  $('#login-btn').textContent = m === 'entrar' ? 'Entrar' : 'Criar conta';
  $('#login-senha').autocomplete = m === 'entrar' ? 'current-password' : 'new-password';
  $('#login-erro').classList.add('oculto'); $('#login-ok').classList.add('oculto');
}
$('#aba-entrar').onclick = () => trocarModoLogin('entrar');
$('#aba-cadastrar').onclick = () => trocarModoLogin('cadastrar');

document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#login-btn'), err = $('#login-erro'), ok = $('#login-ok');
  err.classList.add('oculto'); ok.classList.add('oculto');
  btn.disabled = true; btn.textContent = 'Aguarde…';
  const email = $('#login-email').value.trim(), password = $('#login-senha').value;
  try {
    if (modoLogin === 'cadastrar') {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + '/carretinha.html' } });
      if (error) throw error;
      if (!data.session) {
        ok.textContent = 'Conta criada! Enviamos um link de confirmação para ' + email + '. Confirme o e-mail e depois entre aqui.';
        ok.classList.remove('oculto'); trocarModoLogin('entrar'); ok.classList.remove('oculto');
        return;
      }
      CLAIMS = decodeJwt(data.session.access_token);
    } else {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      CLAIMS = decodeJwt(data.session.access_token);
    }
    $('#login-senha').value = '';
    await entrar();
  } catch (e2) {
    const m = msgErro(e2);
    err.textContent = /Email not confirmed/i.test(e2?.message || '') ? 'Confirme seu e-mail antes de entrar (veja sua caixa de entrada e o spam).' : /already registered/i.test(e2?.message || '') ? 'Este e-mail já tem conta. Use "Entrar".' : m;
    err.classList.remove('oculto');
  } finally { btn.disabled = false; btn.textContent = modoLogin === 'entrar' ? 'Entrar' : 'Criar conta'; }
});

document.getElementById('form-criar-grupo').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#cg-erro'); err.classList.add('oculto');
  const { error } = await sb.rpc('natal_criar_grupo', { p_nome: $('#cg-nome').value.trim(), p_meu_nome: $('#cg-meu-nome').value.trim() });
  if (error) { err.textContent = msgErro(error); err.classList.remove('oculto'); return; }
  await entrar();
});

async function sair() {
  try { await sb.auth.signOut(); } catch (e) { /* */ }
  location.reload();
}
window.sair = sair;

let intervalo = null;
async function entrar() {
  mostrarTela('tela-carregando');
  // Aceita automaticamente um convite pendente para este e-mail
  const ac = await sb.rpc('natal_aceitar_convite', { p_meu_nome: null });
  if (ac.error && /JWT|jwt/.test(ac.error.message)) { await sb.auth.signOut(); return mostrarTela('tela-login'); }
  const [{ data: papel, error }, { data: grupo }] = await Promise.all([sb.rpc('natal_papel'), sb.rpc('natal_meu_grupo')]);
  if (error) {
    $('#sem-acesso-msg').textContent = 'Erro ao verificar acesso: ' + msgErro(error);
    return mostrarTela('tela-sem-acesso');
  }
  PAPEL = papel; GRUPO = grupo;
  if (!PAPEL) {
    $('#sem-acesso-email').textContent = CLAIMS.email || 'seu e-mail';
    return mostrarTela('tela-sem-acesso');
  }
  $('#usuario-email').textContent = CLAIMS.email || '';
  $('#usuario-papel').textContent = PAPEIS[PAPEL];
  try {
    await carregar();
  } catch (e) {
    $('#sem-acesso-msg').textContent = 'Erro ao carregar dados: ' + msgErro(e);
    $('#sem-acesso-acoes').classList.add('oculto');
    return mostrarTela('tela-sem-acesso');
  }
  mostrarTela('app');
  const h = location.hash.slice(1);
  irPara(SECOES.find((s) => s.id === h && s.visivel()) ? h : 'dashboard');
  if (!intervalo) {
    intervalo = setInterval(() => { if (document.visibilityState === 'visible' && !document.querySelector('.modal-fundo')) recarregar(false); }, 30000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !document.querySelector('.modal-fundo')) recarregar(false); });
  }
}

// ---------- Dados ----------
async function todos(tabela, ordem) {
  let out = [], de = 0;
  for (;;) {
    const { data, error } = await sb.from(tabela).select('*').order(ordem, { ascending: true }).range(de, de + 999);
    if (error) throw error;
    out = out.concat(data);
    if (data.length < 1000) break;
    de += 1000;
  }
  return out;
}

async function carregar() {
  const [grupo, config, pessoas, despesas, produtos, premios, bloquinhos, numeros, pagamentos, entregas, receitas, agenda, escala, extrato] = await Promise.all([
    sb.from('natal_grupos').select('*').maybeSingle().then((r) => { if (r.error) throw r.error; return r.data; }),
    sb.from('natal_config').select('*').maybeSingle().then((r) => { if (r.error) throw r.error; return r.data; }),
    todos('natal_pessoas', 'nome'),
    todos('natal_despesas', 'data_compra'),
    todos('natal_produtos', 'nome'),
    todos('natal_premios', 'criado_em'),
    todos('natal_bloquinhos', 'numero'),
    todos('natal_numeros', 'numero'),
    todos('natal_pagamentos', 'data'),
    todos('natal_entregas', 'data'),
    todos('natal_receitas', 'data'),
    todos('natal_agenda', 'criado_em').catch(() => []),
    todos('natal_escala', 'criado_em').catch(() => []),
    todos('natal_pix_extrato', 'criado_em').catch(() => []),
  ]);
  S = { carregado: true, grupo: grupo || {}, config: config || { nome_evento: 'Carretinha de Natal', ano: new Date().getFullYear(), numeros_por_bloquinho: 20, valor_numero: 6.25, estoque_minimo_padrao: 10 },
    pessoas, despesas, produtos, premios, bloquinhos, numeros, pagamentos, entregas, receitas, agenda, escala, extrato, semConfig: !config };
  S.bloqPorId = Object.fromEntries(bloquinhos.map((b) => [b.id, b]));
  S.numPorId = Object.fromEntries(numeros.map((n) => [n.id, n]));
  S.pessoaPorId = Object.fromEntries(pessoas.map((p) => [p.id, p]));
  S.numsPorBloq = {};
  for (const n of numeros) (S.numsPorBloq[n.bloquinho_id] ||= []).push(n);
  S.pagsPorNum = {};
  for (const p of pagamentos) if (p.numero_id) (S.pagsPorNum[p.numero_id] ||= []).push(p);
  $('#marca-ano').textContent = (S.config.nome_evento && S.config.nome_evento !== 'Carretinha de Natal' ? S.config.nome_evento + ' · ' : '') + 'Edição ' + S.config.ano;
  $('#topo-sync').textContent = '● Atualizado ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

async function recarregar(manual) {
  try {
    await carregar();
    renderSecao(false);
    if (manual) toast('Dados atualizados');
  } catch (e) {
    if (/JWT|jwt/.test(e?.message || '')) { toast('Sessão expirada. Entre novamente.', true); setTimeout(sair, 1500); return; }
    if (manual) toast(msgErro(e), true);
  }
}
window.recarregar = recarregar;

// ---------- Cálculos ----------
const vendidos = () => S.numeros.filter((n) => ['vendido', 'pago', 'pendente'].includes(n.status));
function resumoBloq(b) {
  const ns = S.numsPorBloq[b.id] || [];
  const v = ns.filter((n) => ['vendido', 'pago', 'pendente'].includes(n.status));
  return {
    total: ns.length, vendidos: v.length, pagos: ns.filter((n) => n.status === 'pago').length,
    valorVendido: soma(v, 'valor'), recebido: soma(ns, 'valor_pago'), aguardando: soma(ns, 'valor_aguardando'),
    aberto: soma(v, (n) => Math.max(0, n.valor - n.valor_pago)),
  };
}
function resumoPessoa(p) {
  const bloqs = S.bloquinhos.filter((b) => b.pessoa_id === p.id);
  const ids = new Set(bloqs.map((b) => b.id));
  const nums = S.numeros.filter((n) => ids.has(n.bloquinho_id));
  const pags = S.pagamentos.filter((x) => ids.has(x.bloquinho_id));
  const dinheiro = soma(pags.filter((x) => x.forma === 'dinheiro'), 'valor');
  const pix = soma(pags.filter((x) => x.forma === 'pix'), 'valor');
  const entregue = soma(S.entregas.filter((e) => e.pessoa_id === p.id), 'valor');
  return {
    bloqs, nums, pags,
    vendidos: nums.filter((n) => ['vendido', 'pago', 'pendente'].includes(n.status)).length,
    pagos: nums.filter((n) => n.status === 'pago').length,
    arrecadado: dinheiro + pix, dinheiro, pix, entregue,
    pendenteEntrega: Math.max(0, dinheiro - entregue),
    aReceber: soma(nums.filter((n) => ['vendido', 'pendente'].includes(n.status)), (n) => Math.max(0, n.valor - n.valor_pago)),
  };
}
function totais(de, ate) {
  const dentro = (d) => (!de || (d && d >= de)) && (!ate || (d && d <= ate));
  const pagsConf = S.pagamentos.filter((p) => p.situacao === 'confirmado' && dentro(p.data));
  const pagsAg = S.pagamentos.filter((p) => p.situacao === 'aguardando' && dentro(p.data));
  const recRec = S.receitas.filter((r) => r.situacao === 'recebido' && dentro(r.data));
  const recPend = S.receitas.filter((r) => r.situacao === 'pendente' && dentro(r.data));
  const desp = S.despesas.filter((d) => dentro(d.data_compra));
  const vend = vendidos().filter((n) => !de && !ate ? true : dentro(n.data_venda));
  const rifaRecebido = soma(pagsConf, 'valor');
  const doacoes = soma(recRec.filter((r) => r.tipo === 'doacao'), 'valor');
  const outras = soma(recRec.filter((r) => r.tipo === 'outra'), 'valor');
  const recebidoTotal = rifaRecebido + doacoes + outras;
  const despPagas = soma(desp.filter((d) => d.situacao === 'pago'), 'valor_total');
  const despPend = soma(desp.filter((d) => d.situacao === 'pendente'), 'valor_total');
  const porCat = {};
  for (const d of desp) porCat[d.categoria] = (porCat[d.categoria] || 0) + Number(d.valor_total);
  return {
    pagsConf, desp,
    rifaVendido: soma(vend, 'valor'), rifaRecebido, rifaAguardando: soma(pagsAg, 'valor'),
    rifaAberto: soma(vend, (n) => Math.max(0, n.valor - n.valor_pago)),
    recebidoDinheiro: soma(pagsConf.filter((p) => p.forma === 'dinheiro'), 'valor') + soma(recRec.filter((r) => r.forma === 'dinheiro'), 'valor'),
    recebidoPix: soma(pagsConf.filter((p) => p.forma === 'pix'), 'valor') + soma(recRec.filter((r) => r.forma === 'pix'), 'valor'),
    recebidoOutro: soma(recRec.filter((r) => r.forma === 'outro'), 'valor'),
    doacoes, outras, recebidoTotal, receitasPendentes: soma(recPend, 'valor'),
    despTotal: despPagas + despPend, despPagas, despPend, porCat,
    saldo: recebidoTotal - despPagas,
  };
}
function estoqueMin(p) { return p.estoque_minimo !== null && p.estoque_minimo !== undefined ? Number(p.estoque_minimo) : Number(S.config.estoque_minimo_padrao || 0); }
function alertas() {
  const a = [];
  const hj = hoje();
  const naoDevolvidos = S.bloquinhos.filter((b) => ['entregue', 'em_andamento'].includes(b.situacao));
  const atrasados = naoDevolvidos.filter((b) => b.data_devolucao && b.data_devolucao < hj);
  if (naoDevolvidos.length) a.push({ ic: '📒', grave: atrasados.length > 0, t: `${naoDevolvidos.length} bloquinho(s) ainda não devolvido(s)`, d: atrasados.length ? `${atrasados.length} com data de devolução vencida` : 'em mãos dos responsáveis', ir: 'bloquinhos', f: { sit: 'naodev' } });
  const naoPagos = S.numeros.filter((n) => ['vendido', 'pendente'].includes(n.status));
  if (naoPagos.length) a.push({ ic: '🎟️', grave: true, t: `${naoPagos.length} número(s) vendido(s) e não pago(s)`, d: `${brl(soma(naoPagos, (n) => Math.max(0, n.valor - n.valor_pago)))} a receber`, ir: 'rifas', f: { st: 'naopago' } });
  const naoEntregue = S.pessoas.map((p) => ({ p, r: resumoPessoa(p) })).filter((x) => x.r.pendenteEntrega > 0.009);
  if (naoEntregue.length) a.push({ ic: '💵', grave: true, t: `${brl(soma(naoEntregue, (x) => x.r.pendenteEntrega))} arrecadados e não entregues`, d: `${naoEntregue.length} responsável(is) com dinheiro a entregar`, ir: 'pessoas' });
  const despPend = S.despesas.filter((d) => d.situacao === 'pendente');
  if (despPend.length) a.push({ ic: '🧾', grave: false, t: `${despPend.length} despesa(s) pendente(s)`, d: `${brl(soma(despPend, 'valor_total'))} a pagar`, ir: 'despesas', f: { sit: 'pendente' } });
  const naoConf = S.pagamentos.filter((p) => p.situacao === 'aguardando');
  if (naoConf.length) a.push({ ic: '🔎', grave: false, t: `${naoConf.length} comprovante(s) não conferido(s)`, d: `${brl(soma(naoConf, 'valor'))} aguardando conferência`, ir: 'recebimentos', f: { sit: 'aguardando' } });
  const extPend = (S.extrato || []).filter((x) => x.situacao === 'pendente');
  if (extPend.length) a.push({ ic: '🏦', grave: false, t: `${extPend.length} PIX do extrato sem vínculo com números`, d: `${brl(soma(extPend, 'valor'))} na conta para conferir/vincular`, ir: 'recebimentos', f: { aba: 'extrato' } });
  const premPend = S.premios.filter((p) => p.situacao === 'pendente');
  if (premPend.length) a.push({ ic: '🎁', grave: false, t: `${premPend.length} prêmio(s) ainda não adquirido(s)`, d: premPend.slice(0, 3).map((p) => p.nome).join(', '), ir: 'premios' });
  const baixo = S.produtos.filter((p) => Number(p.quantidade_restante) <= estoqueMin(p));
  if (baixo.length) a.push({ ic: '📦', grave: false, t: `${baixo.length} produto(s) com estoque baixo`, d: baixo.slice(0, 3).map((p) => `${p.nome} (${fmtQtd(p.quantidade_restante)})`).join(', '), ir: 'produtos', f: { baixo: true } });
  return a;
}
const fmtQtd = (v) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

// ---------- Arquivos (comprovantes e fotos) ----------
async function enviarArquivo(file, pasta, publico) {
  if (file.size > (publico ? 5 : 10) * 1024 * 1024) throw new Error(`Arquivo maior que ${publico ? 5 : 10} MB.`);
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${GRUPO}/${pasta}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from(publico ? BUCKET_PUB : BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw error;
  return path;
}
async function verArquivo(path) {
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error) return toast(msgErro(error), true);
  window.open(data.signedUrl, '_blank', 'noopener');
}
window.verArquivo = verArquivo;
const linkArq = (path, txt = '📎') => (path ? `<button class="link" title="Ver comprovante" onclick="event.stopPropagation();verArquivo('${esc(path)}')">${txt}</button>` : '');

// ---------- Modais ----------
function abrirModal({ titulo, corpo, rodape, largo, aoAbrir }) {
  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo';
  fundo.innerHTML = `<div class="modal${largo ? ' largo' : ''}" role="dialog" aria-modal="true">
    <div class="m-topo"><h2>${titulo}</h2><button class="x" aria-label="Fechar">×</button></div>
    <div class="m-corpo">${corpo}</div>${rodape ? `<div class="m-rodape">${rodape}</div>` : ''}</div>`;
  const fechar = () => { fundo.remove(); document.removeEventListener('keydown', esc_); };
  const esc_ = (e) => { if (e.key === 'Escape') fechar(); };
  document.addEventListener('keydown', esc_);
  fundo.querySelector('.x').onclick = fechar;
  fundo.addEventListener('mousedown', (e) => { if (e.target === fundo) fechar(); });
  $('#modais').appendChild(fundo);
  if (aoAbrir) aoAbrir(fundo, fechar);
  return { fundo, fechar };
}
function confirmar(msg, textoOk = 'Confirmar', perigo = true) {
  return new Promise((res) => {
    const { fundo, fechar } = abrirModal({
      titulo: 'Confirmação', corpo: `<p style="margin:0">${msg}</p>`,
      rodape: `<button class="btn" data-n>Cancelar</button><button class="btn ${perigo ? 'verm' : 'prim'}" data-s>${textoOk}</button>`,
    });
    fundo.querySelector('[data-n]').onclick = () => { fechar(); res(false); };
    fundo.querySelector('[data-s]').onclick = () => { fechar(); res(true); };
  });
}

/* Formulário genérico.
   campos: [{k, l, t:'text|tel|number|money|date|select|textarea|file|datalist', op:[[v,l]], req, full, dica, lista}] */
function campoHTML(c, v) {
  const id = 'f_' + c.k;
  const req = c.req ? ' required' : '';
  const lab = `${esc(c.l)}${c.req ? ' *' : ''}`;
  let inp;
  if (c.t === 'select') inp = `<select id="${id}" name="${c.k}"${req}>${(c.op || []).map(([ov, ol]) => `<option value="${esc(ov)}"${String(v ?? '') === String(ov) ? ' selected' : ''}>${esc(ol)}</option>`).join('')}</select>`;
  else if (c.t === 'textarea') inp = `<textarea id="${id}" name="${c.k}"${req}>${esc(v)}</textarea>`;
  else if (c.t === 'file') inp = `<input type="file" id="${id}" name="${c.k}" accept="${c.accept || 'image/*,application/pdf'}">${v ? `<span class="dica">Arquivo atual: ${c.publico ? `<a href="${esc(urlPublica(v))}" target="_blank" rel="noopener">ver</a>` : linkArq(v, 'ver')} · <label style="display:inline;font-weight:500"><input type="checkbox" name="${c.k}__remover" style="width:auto"> remover</label></span>` : ''}`;
  else if (c.t === 'money') inp = `<input id="${id}" name="${c.k}" inputmode="decimal" placeholder="0,00" value="${esc(fmtNumInput(v))}"${req}>`;
  else if (c.t === 'number') inp = `<input id="${id}" name="${c.k}" inputmode="decimal" value="${esc(fmtNumInput(v))}"${req}>`;
  else if (c.t === 'datalist') inp = `<input id="${id}" name="${c.k}" list="${id}_l" value="${esc(v)}" autocomplete="off"${req}><datalist id="${id}_l">${(c.lista || []).map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`;
  else inp = `<input id="${id}" name="${c.k}" type="${c.t || 'text'}" value="${esc(v)}"${req}${c.t === 'tel' ? ' inputmode="tel"' : ''}>`;
  return `<label class="${c.full ? 'inteiro' : ''}">${lab}${inp}${c.dica ? `<span class="dica">${c.dica}</span>` : ''}</label>`;
}
function abrirForm({ titulo, campos, valores = {}, salvar, excluir, largo, extra = '', aoAbrir }) {
  const corpo = `<form class="form" id="form-gen"><div class="grade-form">${campos.map((c) => campoHTML(c, valores[c.k])).join('')}</div>${extra}<div class="erro-box oculto" id="form-erro"></div></form>`;
  const rodape = `${excluir ? '<button class="btn perigo" data-exc style="margin-right:auto">Excluir</button>' : ''}<button class="btn" data-canc>Cancelar</button><button class="btn prim" data-salv>Salvar</button>`;
  const m = abrirModal({ titulo, corpo, rodape, largo, aoAbrir });
  const form = m.fundo.querySelector('#form-gen');
  const err = m.fundo.querySelector('#form-erro');
  m.fundo.querySelector('[data-canc]').onclick = m.fechar;
  const btnS = m.fundo.querySelector('[data-salv]');
  const enviar = async (e) => {
    e?.preventDefault();
    if (!form.reportValidity()) return;
    err.classList.add('oculto');
    const dados = {};
    const arquivos = {};
    for (const c of campos) {
      const el = form.elements[c.k];
      if (c.t === 'file') {
        if (el.files[0]) arquivos[c.k] = el.files[0];
        else if (form.elements[c.k + '__remover']?.checked) dados[c.k] = null;
        continue;
      }
      let v = el.value;
      if (c.t === 'money' || c.t === 'number') v = v === '' ? null : num(v);
      else if (c.t === 'date') v = v || null;
      else v = typeof v === 'string' ? v.trim() || null : v;
      dados[c.k] = v;
    }
    btnS.disabled = true; btnS.textContent = 'Salvando…';
    try {
      for (const [k, f] of Object.entries(arquivos)) { const c = campos.find((x) => x.k === k); dados[k] = await enviarArquivo(f, c.pasta || 'arquivos', c.publico); }
      await salvar(dados);
      m.fechar();
      await recarregar(false);
      toast('Salvo com sucesso');
    } catch (e2) {
      err.textContent = msgErro(e2); err.classList.remove('oculto');
    } finally { btnS.disabled = false; btnS.textContent = 'Salvar'; }
  };
  btnS.onclick = enviar;
  form.addEventListener('submit', enviar);
  if (excluir) m.fundo.querySelector('[data-exc]').onclick = async () => {
    if (!(await confirmar('Excluir este registro? Esta ação não pode ser desfeita.', 'Excluir'))) return;
    try { await excluir(); m.fechar(); await recarregar(false); toast('Excluído'); } catch (e2) { err.textContent = msgErro(e2); err.classList.remove('oculto'); }
  };
  return m;
}
async function gravar(tabela, id, dados) {
  const q = id ? sb.from(tabela).update(dados).eq('id', id) : sb.from(tabela).insert(dados);
  const { error } = await q;
  if (error) throw error;
}
async function apagar(tabela, id) {
  const { error } = await sb.from(tabela).delete().eq('id', id);
  if (error) throw error;
}
const nomesPessoas = () => S.pessoas.filter((p) => p.ativo).map((p) => p.nome);

// ---------- Navegação ----------
const SECOES = [
  { id: 'dashboard', n: '📊', l: 'Dashboard Geral', visivel: () => true, render: rDashboard },
  { id: 'despesas', n: '🧾', l: 'Controle de Despesas', visivel: () => true, render: rDespesas },
  { id: 'produtos', n: '📦', l: 'Compras e Produtos', visivel: () => true, render: rProdutos },
  { id: 'premios', n: '🎁', l: 'Controle de Prêmios', visivel: () => true, render: rPremios },
  { id: 'rifas', n: '🎟️', l: 'Controle de Rifas', visivel: () => true, render: rRifas },
  { id: 'bloquinhos', n: '📒', l: 'Bloquinhos e Acertos', visivel: () => true, render: rBloquinhos },
  { id: 'recebimentos', n: '💰', l: 'Controle de Recebimentos', visivel: () => true, render: rRecebimentos },
  { id: 'pessoas', n: '👥', l: 'Pessoas e Responsáveis', visivel: () => true, render: rPessoas },
  { id: 'programacao', n: '🗓️', l: 'Programação e Escala', visivel: () => true, render: rProgramacao },
  { id: 'relatorios', n: '📑', l: 'Relatórios e Prestação de Contas', visivel: () => true, render: rRelatorios },
  { id: 'config', n: '⚙️', l: 'Configurações', visivel: () => PAPEL === 'admin', render: rConfig },
];
function montarMenu() {
  const nAlertas = alertas().length;
  $('#menu').innerHTML = SECOES.filter((s) => s.visivel()).map((s) =>
    `<button class="${SECAO === s.id ? 'ativo' : ''}" onclick="irPara('${s.id}')"><span class="n">${s.n}</span>${s.l}${s.id === 'dashboard' && nAlertas ? `<span class="cont">${nAlertas}</span>` : ''}</button>`).join('');
}
function irPara(id, filtros) {
  SECAO = id;
  if (filtros) F[id] = { ...(F[id] || {}), ...filtros };
  history.replaceState(null, '', '#' + id);
  $('#lateral').classList.remove('aberta');
  renderSecao(true);
  window.scrollTo(0, 0);
}
window.irPara = irPara;
function renderSecao(completo) {
  const s = SECOES.find((x) => x.id === SECAO) || SECOES[0];
  $('#titulo-secao').textContent = s.l;
  montarMenu();
  charts.forEach((c) => c.destroy()); charts = [];
  s.render(completo);
}

// ============================================================
// 1. DASHBOARD
// ============================================================
function rDashboard() {
  const t = totais();
  const nums = S.numeros;
  const vend = vendidos();
  const al = alertas();
  const bloqDist = S.bloquinhos.filter((b) => b.situacao !== 'disponivel').length;
  $('#conteudo').innerHTML = `
    ${primeirosPassos()}
    ${S.grupo.slug && S.grupo.publico_ativo ? `<div class="card"><h3>📣 Divulgue a rifa</h3>${caixaLinkPublico()}</div>` : ''}
    ${al.length ? `<div class="card"><h3>🔔 Alertas automáticos</h3><div class="alertas">${al.map((a, i) => `<div class="alerta${a.grave ? ' grave' : ''}" data-al="${i}"><span class="ic">${a.ic}</span><div><b>${esc(a.t)}</b><small>${esc(a.d)}</small></div></div>`).join('')}</div></div>` : '<div class="ok-box">✅ Nenhum alerta no momento. Tudo em dia!</div>'}
    <div class="kpis">
      <div class="kpi destaque"><span>Saldo financeiro atual</span><b>${brl(t.saldo)}</b><small>recebido − despesas pagas</small></div>
      <div class="kpi"><span>Total arrecadado com rifas</span><b>${brl(t.rifaVendido)}</b><small>${vend.length} número(s) vendido(s)</small></div>
      <div class="kpi"><span>Total recebido em dinheiro</span><b>${brl(t.recebidoDinheiro)}</b><small>rifas + doações/entradas</small></div>
      <div class="kpi a"><span>Total recebido via PIX</span><b>${brl(t.recebidoPix)}</b><small>${t.rifaAguardando ? brl(t.rifaAguardando) + ' aguardando conferência' : 'conferido'}</small></div>
      <div class="kpi v"><span>Total de despesas</span><b>${brl(t.despTotal)}</b><small>${S.despesas.length} lançamento(s)</small></div>
      <div class="kpi"><span>Despesas pagas</span><b>${brl(t.despPagas)}</b><small>&nbsp;</small></div>
      <div class="kpi v"><span>Contas a pagar</span><b>${brl(t.despPend)}</b><small>despesas pendentes</small></div>
      <div class="kpi o"><span>Valor em aberto das rifas</span><b>${brl(t.rifaAberto)}</b><small>vendido e ainda não pago</small></div>
      <div class="kpi"><span>Bloquinhos distribuídos</span><b>${bloqDist} <small>de ${S.bloquinhos.length}</small></b><small>&nbsp;</small></div>
      <div class="kpi"><span>Números vendidos</span><b>${vend.length} <small>de ${nums.length}</small></b><small>${nums.length ? Math.round((vend.length / nums.length) * 100) : 0}% vendidos</small></div>
      <div class="kpi"><span>Números pagos</span><b>${nums.filter((n) => n.status === 'pago').length}</b><small>&nbsp;</small></div>
      <div class="kpi v"><span>Números pendentes</span><b>${nums.filter((n) => ['vendido', 'pendente'].includes(n.status)).length}</b><small>vendidos sem pagamento total</small></div>
      ${(S.extrato || []).length ? `<div class="kpi a" style="cursor:pointer" onclick="irPara('recebimentos',{aba:'extrato'})"><span>PIX na conta (extrato)</span><b>${brl(soma(S.extrato.filter((x) => x.situacao !== 'ignorado'), 'valor'))}</b><small>${S.extrato.filter((x) => x.situacao === 'pendente').length} sem vínculo · ${brl(soma(S.extrato.filter((x) => x.situacao === 'pendente'), 'valor'))}</small></div>` : ''}
    </div>
    <div class="grade3">
      <div class="card"><h3>💰 Arrecadação × despesas (acumulado)</h3><div class="chart-box"><canvas id="ch1"></canvas></div></div>
      <div class="card"><h3>🧾 Despesas por categoria</h3><div class="chart-box"><canvas id="ch2"></canvas></div></div>
      <div class="card"><h3>🎟️ Evolução das vendas</h3><div class="chart-box"><canvas id="ch3"></canvas></div></div>
    </div>
    <div class="grade2">
      <div class="card"><h3>🏆 Ranking dos responsáveis</h3>${tabelaRanking()}</div>
      <div class="card"><h3>📒 Bloquinhos</h3>${resumoBloquinhosMini()}</div>
    </div>`;
  document.querySelectorAll('[data-al]').forEach((el) => { const a = al[+el.dataset.al]; el.onclick = () => irPara(a.ir, a.f); });
  graficosDashboard(t);
}
function tabelaRanking() {
  const lin = S.pessoas.map((p) => ({ p, r: resumoPessoa(p) })).filter((x) => x.r.bloqs.length).sort((a, b) => b.r.vendidos - a.r.vendidos).slice(0, 8);
  if (!lin.length) return '<p class="vazio">Nenhum bloquinho atribuído a responsáveis ainda.</p>';
  return `<div class="tabela-wrap"><table><thead><tr><th>Responsável</th><th class="num">Vendidos</th><th class="num">Arrecadado</th><th class="num">A entregar</th></tr></thead><tbody>${lin.map(({ p, r }) => `<tr><td>${esc(p.nome)}</td><td class="num">${r.vendidos}</td><td class="num">${brl(r.arrecadado)}</td><td class="num">${r.pendenteEntrega > 0 ? `<span class="badge b-verm">${brl(r.pendenteEntrega)}</span>` : '—'}</td></tr>`).join('')}</tbody></table></div>`;
}
function resumoBloquinhosMini() {
  const c = {};
  for (const b of S.bloquinhos) c[b.situacao] = (c[b.situacao] || 0) + 1;
  if (!S.bloquinhos.length) return `<p class="vazio">Nenhum bloquinho gerado. ${pode('bloquinhos') ? '<button class="link" onclick="irPara(\'bloquinhos\')">Gerar bloquinhos</button>' : ''}</p>`;
  return `<div class="cat-cards">${Object.keys(ST_BLOQ).map((k) => `<div><small>${ST_BLOQ[k]}</small><b>${c[k] || 0}</b></div>`).join('')}</div>
    <p class="dica" style="margin-top:10px">Configuração: ${S.config.numeros_por_bloquinho} números por bloquinho · ${brl(S.config.valor_numero)} por número · ${brl(S.config.numeros_por_bloquinho * S.config.valor_numero)} por bloquinho.</p>`;
}
function graficosDashboard(t) {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
  // 1. Acumulado de recebimentos x despesas pagas por data
  const ev = [];
  for (const p of S.pagamentos.filter((x) => x.situacao === 'confirmado')) ev.push([p.data, Number(p.valor), 0]);
  for (const r of S.receitas.filter((x) => x.situacao === 'recebido')) ev.push([r.data, Number(r.valor), 0]);
  for (const d of S.despesas.filter((x) => x.situacao === 'pago')) ev.push([d.data_compra, 0, Number(d.valor_total)]);
  ev.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const datas = [...new Set(ev.map((e) => e[0]))];
  let ar = 0, de = 0;
  const serieA = [], serieD = [];
  for (const d of datas) { for (const e of ev.filter((x) => x[0] === d)) { ar += e[1]; de += e[2]; } serieA.push(ar); serieD.push(de); }
  charts.push(new Chart($('#ch1'), {
    type: 'line',
    data: { labels: datas.map(dataBR), datasets: [
      { label: 'Recebido', data: serieA, borderColor: '#166534', backgroundColor: 'rgba(22,101,52,.12)', fill: true, tension: .3 },
      { label: 'Despesas pagas', data: serieD, borderColor: '#b91c1c', backgroundColor: 'rgba(185,28,28,.08)', fill: true, tension: .3 },
    ] },
    options: { maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + brl(c.raw) } } }, scales: { y: { ticks: { callback: (v) => brl(v).replace(',00', '') } } } },
  }));
  // 2. Despesas por categoria
  const cats = Object.entries(t.porCat).sort((a, b) => b[1] - a[1]);
  const cores = ['#166534', '#b91c1c', '#c9a227', '#1f7a45', '#dc2626', '#e6c45c', '#0f3d24', '#7f1d1d', '#8a6a00', '#4ade80', '#f87171', '#fde68a'];
  charts.push(new Chart($('#ch2'), {
    type: 'doughnut',
    data: { labels: cats.map((c) => c[0]), datasets: [{ data: cats.map((c) => c[1]), backgroundColor: cores, borderWidth: 2, borderColor: '#fff' }] },
    options: { maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } }, tooltip: { callbacks: { label: (c) => c.label + ': ' + brl(c.raw) } } } },
  }));
  // 3. Evolução das vendas (números vendidos acumulados por data da venda)
  const vs = vendidos().filter((n) => n.data_venda).sort((a, b) => a.data_venda.localeCompare(b.data_venda));
  const dv = [...new Set(vs.map((n) => n.data_venda))];
  let acc = 0, accP = 0;
  const sv = [], sp = [];
  for (const d of dv) { const doDia = vs.filter((n) => n.data_venda === d); acc += doDia.length; accP += doDia.filter((n) => n.status === 'pago').length; sv.push(acc); sp.push(accP); }
  charts.push(new Chart($('#ch3'), {
    type: 'bar',
    data: { labels: dv.map(dataBR), datasets: [
      { label: 'Vendidos (acumulado)', data: sv, backgroundColor: '#c9a227', borderRadius: 4 },
      { label: 'Pagos (acumulado)', data: sp, backgroundColor: '#166534', borderRadius: 4 },
    ] },
    options: { maintainAspectRatio: false },
  }));
}

// ============================================================
// 2. DESPESAS
// ============================================================
const camposDespesa = () => [
  { k: 'descricao', l: 'Descrição da despesa', req: true, full: true },
  { k: 'categoria', l: 'Categoria', t: 'select', op: CATEGORIAS_DESPESA.map((c) => [c, c]), req: true },
  { k: 'produto', l: 'Produto ou serviço' },
  { k: 'quantidade', l: 'Quantidade', t: 'number', req: true },
  { k: 'valor_unitario', l: 'Valor unitário (R$)', t: 'money', req: true },
  { k: 'data_compra', l: 'Data da compra', t: 'date', req: true },
  { k: 'quem_comprou', l: 'Nome de quem comprou', t: 'datalist', lista: nomesPessoas() },
  { k: 'quem_pagou', l: 'Nome de quem pagou', t: 'datalist', lista: nomesPessoas() },
  { k: 'forma_pagamento', l: 'Forma de pagamento', t: 'select', op: FORMAS_DESPESA },
  { k: 'situacao', l: 'Situação', t: 'select', op: [['pendente', 'Pendente'], ['pago', 'Pago']] },
  { k: 'comprovante_path', l: 'Foto ou anexo do comprovante', t: 'file', pasta: 'despesas', full: true },
  { k: 'observacoes', l: 'Observações', t: 'textarea', full: true },
];
function formDespesa(d) {
  const totalPrev = '<p class="dica" id="desp-total" style="margin-top:4px"></p>';
  abrirForm({
    titulo: d ? 'Editar despesa' : 'Nova despesa', campos: camposDespesa(), extra: totalPrev,
    valores: d || { quantidade: 1, data_compra: hoje(), situacao: 'pendente', forma_pagamento: 'dinheiro', categoria: 'Outros' },
    salvar: (dados) => gravar('natal_despesas', d?.id, dados),
    excluir: d && pode('despesas') ? () => apagar('natal_despesas', d.id) : null,
    aoAbrir: (f) => {
      const atualiza = () => { f.querySelector('#desp-total').innerHTML = 'Valor total: <b>' + brl(num(f.querySelector('#f_quantidade').value) * num(f.querySelector('#f_valor_unitario').value)) + '</b>'; };
      f.querySelector('#f_quantidade').oninput = atualiza; f.querySelector('#f_valor_unitario').oninput = atualiza; atualiza();
      if (!pode('despesas')) f.querySelector('[data-salv]').classList.add('oculto');
    },
  });
}
function rDespesas(completo) {
  const f = (F.despesas = { cat: '', sit: '', forma: '', q: '', ...(F.despesas || {}) });
  if (completo) {
    $('#conteudo').innerHTML = `
      <div class="entre"><div class="filtros">
        <input type="search" id="fd-q" placeholder="Buscar descrição, produto, pessoa…" value="${esc(f.q)}">
        <select id="fd-cat"><option value="">Todas as categorias</option>${CATEGORIAS_DESPESA.map((c) => `<option${f.cat === c ? ' selected' : ''}>${c}</option>`).join('')}</select>
        <select id="fd-sit"><option value="">Pagas e pendentes</option><option value="pago"${f.sit === 'pago' ? ' selected' : ''}>Pagas</option><option value="pendente"${f.sit === 'pendente' ? ' selected' : ''}>Pendentes</option></select>
        <select id="fd-forma"><option value="">Todas as formas</option>${FORMAS_DESPESA.map(([v, l]) => `<option value="${v}"${f.forma === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
      </div>${pode('despesas') ? '<button class="btn prim" onclick="formDespesa()">+ Nova despesa</button>' : ''}</div>
      <div id="desp-resumo"></div><div id="desp-lista"></div>`;
    $('#fd-q').oninput = (e) => { f.q = e.target.value; listaDespesas(); };
    $('#fd-cat').onchange = (e) => { f.cat = e.target.value; listaDespesas(); };
    $('#fd-sit').onchange = (e) => { f.sit = e.target.value; listaDespesas(); };
    $('#fd-forma').onchange = (e) => { f.forma = e.target.value; listaDespesas(); };
  }
  listaDespesas();
}
window.formDespesa = formDespesa;
function listaDespesas() {
  const f = F.despesas, q = f.q.toLowerCase();
  const lista = S.despesas.filter((d) => (!f.cat || d.categoria === f.cat) && (!f.sit || d.situacao === f.sit) && (!f.forma || d.forma_pagamento === f.forma)
    && (!q || [d.descricao, d.produto, d.quem_comprou, d.quem_pagou, d.observacoes].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => (b.data_compra || '').localeCompare(a.data_compra || ''));
  const porCat = {};
  for (const d of S.despesas) porCat[d.categoria] = (porCat[d.categoria] || 0) + Number(d.valor_total);
  const total = soma(S.despesas, 'valor_total');
  $('#desp-resumo').innerHTML = `<div class="kpis">
      <div class="kpi v"><span>Total geral das despesas</span><b>${brl(total)}</b><small>${S.despesas.length} lançamento(s)</small></div>
      <div class="kpi"><span>Pagas</span><b>${brl(soma(S.despesas.filter((d) => d.situacao === 'pago'), 'valor_total'))}</b></div>
      <div class="kpi o"><span>Pendentes (a pagar)</span><b>${brl(soma(S.despesas.filter((d) => d.situacao === 'pendente'), 'valor_total'))}</b></div>
    </div>
    <div class="card" style="margin-top:12px"><h3>Total por categoria</h3><div class="cat-cards">${CATEGORIAS_DESPESA.filter((c) => porCat[c]).map((c) => `<div style="cursor:pointer" onclick="F.despesas.cat='${c}';rDespesas(true)"><small>${c}</small><b>${brl(porCat[c])}</b></div>`).join('') || '<p class="dica">Nenhuma despesa lançada.</p>'}</div></div>`;
  $('#desp-lista').innerHTML = lista.length ? `<div class="tabela-wrap"><table>
    <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Produto/serviço</th><th class="num">Qtd</th><th class="num">Unitário</th><th class="num">Total</th><th>Comprou</th><th>Pagou</th><th>Forma</th><th>Situação</th><th></th></tr></thead>
    <tbody>${lista.map((d) => `<tr style="cursor:pointer" onclick="formDespesa(S.despesas.find(x=>x.id==='${d.id}'))">
      <td>${dataBR(d.data_compra)}</td><td><b>${esc(d.descricao)}</b>${d.observacoes ? `<br><small class="dica">${esc(d.observacoes)}</small>` : ''}</td><td>${esc(d.categoria)}</td><td>${esc(d.produto)}</td>
      <td class="num">${fmtQtd(d.quantidade)}</td><td class="num">${brl(d.valor_unitario)}</td><td class="num"><b>${brl(d.valor_total)}</b></td>
      <td>${esc(d.quem_comprou)}</td><td>${esc(d.quem_pagou)}</td><td>${esc((FORMAS_DESPESA.find((x) => x[0] === d.forma_pagamento) || [])[1])}</td>
      <td>${d.situacao === 'pago' ? '<span class="badge b-verde">Pago</span>' : `<span class="badge b-verm">Pendente</span>${pode('despesas') ? ` <button class="btn peq" onclick="event.stopPropagation();marcarDespesaPaga('${d.id}')">Pagar</button>` : ''}`}</td>
      <td class="acoes">${linkArq(d.comprovante_path)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="6">${lista.length} despesa(s) filtrada(s)</td><td class="num">${brl(soma(lista, 'valor_total'))}</td><td colspan="5"></td></tr></tfoot></table></div>`
    : '<div class="card vazio">Nenhuma despesa encontrada.</div>';
}
window.marcarDespesaPaga = async (id) => {
  try { await gravar('natal_despesas', id, { situacao: 'pago' }); await recarregar(false); toast('Despesa marcada como paga'); } catch (e) { toast(msgErro(e), true); }
};

// ============================================================
// 3. COMPRAS E PRODUTOS (estoque)
// ============================================================
const camposProduto = () => [
  { k: 'nome', l: 'Nome do produto', req: true },
  { k: 'categoria', l: 'Categoria', t: 'select', op: CATEGORIAS_PRODUTO.map((c) => [c, c]) },
  { k: 'quantidade_comprada', l: 'Quantidade comprada', t: 'number', req: true },
  { k: 'quantidade_utilizada', l: 'Quantidade utilizada', t: 'number' },
  { k: 'unidade', l: 'Unidade', dica: 'un, pacote, kg, caixa…' },
  { k: 'valor_total', l: 'Valor total comprado (R$)', t: 'money' },
  { k: 'fornecedor', l: 'Fornecedor' },
  { k: 'data_compra', l: 'Data da compra', t: 'date' },
  { k: 'responsavel', l: 'Responsável pela compra', t: 'datalist', lista: nomesPessoas() },
  { k: 'estoque_minimo', l: 'Estoque mínimo (alerta)', t: 'number', dica: `Vazio = padrão (${S.config.estoque_minimo_padrao})` },
  { k: 'observacoes', l: 'Observações', t: 'textarea', full: true },
];
function formProduto(p) {
  abrirForm({
    titulo: p ? 'Editar produto' : 'Novo produto', campos: camposProduto(),
    valores: p || { categoria: 'Balas', quantidade_utilizada: 0, unidade: 'un', data_compra: hoje() },
    salvar: (d) => { d.quantidade_utilizada = d.quantidade_utilizada || 0; d.valor_total = d.valor_total || 0; if (Number(d.quantidade_utilizada) > Number(d.quantidade_comprada)) throw new Error('A quantidade utilizada não pode ser maior que a comprada.'); return gravar('natal_produtos', p?.id, d); },
    excluir: p && pode('produtos') ? () => apagar('natal_produtos', p.id) : null,
  });
}
window.formProduto = formProduto;
function usarProduto(id) {
  const p = S.produtos.find((x) => x.id === id);
  abrirForm({
    titulo: `Movimentar estoque · ${p.nome}`,
    campos: [
      { k: 'tipo', l: 'Movimento', t: 'select', op: [['uso', 'Registrar uso (saída)'], ['compra', 'Nova compra (entrada)']] },
      { k: 'qtd', l: `Quantidade (${p.unidade || 'un'})`, t: 'number', req: true },
      { k: 'valor', l: 'Valor da compra (se entrada)', t: 'money' },
    ],
    extra: `<p class="dica">Hoje: comprado ${fmtQtd(p.quantidade_comprada)} · utilizado ${fmtQtd(p.quantidade_utilizada)} · <b>restante ${fmtQtd(p.quantidade_restante)}</b></p>`,
    valores: { tipo: 'uso' },
    salvar: (d) => {
      const q = Number(d.qtd) || 0;
      if (q <= 0) throw new Error('Informe uma quantidade.');
      if (d.tipo === 'uso') {
        if (q > Number(p.quantidade_restante)) throw new Error('Quantidade maior que o estoque restante.');
        return gravar('natal_produtos', p.id, { quantidade_utilizada: Number(p.quantidade_utilizada) + q });
      }
      return gravar('natal_produtos', p.id, { quantidade_comprada: Number(p.quantidade_comprada) + q, valor_total: Number(p.valor_total) + (Number(d.valor) || 0) });
    },
  });
}
window.usarProduto = usarProduto;
function rProdutos(completo) {
  const f = (F.produtos = { cat: '', q: '', baixo: false, ...(F.produtos || {}) });
  if (completo) {
    $('#conteudo').innerHTML = `
      <div class="entre"><div class="filtros">
        <input type="search" id="fp-q" placeholder="Buscar produto ou fornecedor…" value="${esc(f.q)}">
        <select id="fp-cat"><option value="">Todas as categorias</option>${CATEGORIAS_PRODUTO.map((c) => `<option${f.cat === c ? ' selected' : ''}>${c}</option>`).join('')}</select>
        <label class="dica" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="fp-baixo" style="width:auto"${f.baixo ? ' checked' : ''}> Só estoque baixo</label>
      </div>${pode('produtos') ? '<button class="btn prim" onclick="formProduto()">+ Novo produto</button>' : ''}</div>
      <div id="prod-resumo"></div><div id="prod-lista"></div>`;
    $('#fp-q').oninput = (e) => { f.q = e.target.value; listaProdutos(); };
    $('#fp-cat').onchange = (e) => { f.cat = e.target.value; listaProdutos(); };
    $('#fp-baixo').onchange = (e) => { f.baixo = e.target.checked; listaProdutos(); };
  }
  listaProdutos();
}
function listaProdutos() {
  const f = F.produtos, q = f.q.toLowerCase();
  const lista = S.produtos.filter((p) => (!f.cat || p.categoria === f.cat) && (!f.baixo || Number(p.quantidade_restante) <= estoqueMin(p)) && (!q || [p.nome, p.fornecedor, p.responsavel].join(' ').toLowerCase().includes(q)));
  const consumo = ['Balas', 'Pirulitos', 'Chicletes', 'Saquinhos', 'Brinquedos'].map((c) => {
    const ps = S.produtos.filter((p) => p.categoria === c);
    return { c, comp: soma(ps, 'quantidade_comprada'), uso: soma(ps, 'quantidade_utilizada') };
  });
  $('#prod-resumo').innerHTML = `<div class="card"><h3>Consumo dos itens da Carretinha</h3><div class="cat-cards">${consumo.map((x) => {
    const pct = x.comp ? Math.min(100, (x.uso / x.comp) * 100) : 0;
    return `<div><small>${x.c}</small><b>${fmtQtd(x.comp - x.uso)}</b> <small style="display:inline">restantes</small><div class="barra" style="margin-top:6px"><i style="width:${pct}%"></i></div><small>${fmtQtd(x.uso)} de ${fmtQtd(x.comp)} usados</small></div>`;
  }).join('')}</div><p class="dica" style="margin-top:8px">Valor total investido em produtos: <b>${brl(soma(S.produtos, 'valor_total'))}</b></p></div>`;
  $('#prod-lista').innerHTML = lista.length ? `<div class="tabela-wrap"><table>
    <thead><tr><th>Produto</th><th>Categoria</th><th class="num">Comprado</th><th class="num">Utilizado</th><th class="num">Restante</th><th style="min-width:110px">Consumo</th><th class="num">Valor</th><th>Fornecedor</th><th>Compra</th><th>Responsável</th><th></th></tr></thead>
    <tbody>${lista.map((p) => {
      const pct = Number(p.quantidade_comprada) ? Math.min(100, (p.quantidade_utilizada / p.quantidade_comprada) * 100) : 0;
      const baixo = Number(p.quantidade_restante) <= estoqueMin(p);
      return `<tr><td><b>${esc(p.nome)}</b></td><td>${esc(p.categoria)}</td><td class="num">${fmtQtd(p.quantidade_comprada)} ${esc(p.unidade || '')}</td><td class="num">${fmtQtd(p.quantidade_utilizada)}</td>
        <td class="num">${baixo ? `<span class="badge b-verm">${fmtQtd(p.quantidade_restante)}</span>` : fmtQtd(p.quantidade_restante)}</td>
        <td><div class="barra${pct > 85 ? ' verm' : ''}"><i style="width:${pct}%"></i></div></td><td class="num">${brl(p.valor_total)}</td><td>${esc(p.fornecedor)}</td><td>${dataBR(p.data_compra)}</td><td>${esc(p.responsavel)}</td>
        <td class="acoes">${pode('produtos') ? `<button class="btn peq" onclick="usarProduto('${p.id}')">± Estoque</button> <button class="btn peq" onclick="formProduto(S.produtos.find(x=>x.id==='${p.id}'))">Editar</button>` : ''}</td></tr>`;
    }).join('')}</tbody></table></div>` : '<div class="card vazio">Nenhum produto cadastrado.</div>';
}

// ============================================================
// 4. PRÊMIOS
// ============================================================
const camposPremio = () => [
  { k: 'nome', l: 'Nome do prêmio', req: true },
  { k: 'ordem_sorteio', l: 'Ordem no sorteio', t: 'number', dica: '1º prêmio, 2º prêmio…' },
  { k: 'descricao', l: 'Descrição', t: 'textarea', full: true },
  { k: 'valor_estimado', l: 'Valor estimado (R$)', t: 'money' },
  { k: 'origem', l: 'Origem', t: 'select', op: [['comprado', 'Comprado'], ['doado', 'Doado']] },
  { k: 'doador_ou_comprador', l: 'Quem doou ou comprou', t: 'datalist', lista: nomesPessoas() },
  { k: 'quem_pagou', l: 'Quem pagou', t: 'datalist', lista: nomesPessoas() },
  { k: 'data', l: 'Data', t: 'date' },
  { k: 'situacao', l: 'Situação', t: 'select', op: Object.entries(ST_PREMIO) },
  { k: 'foto_path', l: 'Foto do prêmio (aparece no link público)', t: 'file', accept: 'image/*', pasta: 'premios', publico: true, full: true },
  { k: 'observacoes', l: 'Observações', t: 'textarea', full: true },
];
function formPremio(p) {
  abrirForm({
    titulo: p ? 'Editar prêmio' : 'Novo prêmio', campos: camposPremio(),
    valores: p || { origem: 'comprado', situacao: 'pendente', data: hoje() },
    salvar: (d) => { d.valor_estimado = d.valor_estimado || 0; return gravar('natal_premios', p?.id, d); },
    excluir: p && pode('premios') ? () => apagar('natal_premios', p.id) : null,
  });
}
window.formPremio = formPremio;
function rPremios() {
  const ps = [...S.premios].sort((a, b) => (a.ordem_sorteio ?? 999) - (b.ordem_sorteio ?? 999));
  const tot = soma(ps, 'valor_estimado');
  const doados = ps.filter((p) => p.origem === 'doado'), comprados = ps.filter((p) => p.origem === 'comprado');
  $('#conteudo').innerHTML = `
    <div class="entre"><p class="dica">Prêmios da Rifa Solidária.</p>${pode('premios') ? '<button class="btn prim" onclick="formPremio()">+ Novo prêmio</button>' : ''}</div>
    <div class="kpis">
      <div class="kpi destaque"><span>Valor total dos prêmios</span><b>${brl(tot)}</b><small>${ps.length} prêmio(s)</small></div>
      <div class="kpi"><span>Prêmios doados</span><b>${doados.length} · ${brl(soma(doados, 'valor_estimado'))}</b></div>
      <div class="kpi a"><span>Prêmios comprados</span><b>${comprados.length} · ${brl(soma(comprados, 'valor_estimado'))}</b></div>
      <div class="kpi v"><span>Pendentes de aquisição</span><b>${ps.filter((p) => p.situacao === 'pendente').length}</b></div>
    </div>
    ${ps.length ? `<div class="premios">${ps.map((p) => `<div class="premio" ${pode('premios') ? `style="cursor:pointer" onclick="formPremio(S.premios.find(x=>x.id==='${p.id}'))"` : ''}>
      <div class="foto" data-foto="${esc(p.foto_path || '')}">🎁</div>
      <div class="corpo"><div class="entre"><b>${p.ordem_sorteio ? p.ordem_sorteio + 'º · ' : ''}${esc(p.nome)}</b><span class="badge ${ST_PREMIO_COR[p.situacao]}">${ST_PREMIO[p.situacao]}</span></div>
      ${p.descricao ? `<small class="dica">${esc(p.descricao)}</small>` : ''}
      <div><b style="color:var(--verde)">${brl(p.valor_estimado)}</b> <span class="badge ${p.origem === 'doado' ? 'b-verde' : 'b-azul'}">${p.origem === 'doado' ? 'Doado' : 'Comprado'}</span></div>
      <small class="dica">${p.origem === 'doado' ? 'Doado por' : 'Comprado por'}: ${esc(p.doador_ou_comprador || '—')}${p.quem_pagou ? ` · Pagou: ${esc(p.quem_pagou)}` : ''}${p.data ? ` · ${dataBR(p.data)}` : ''}</small></div></div>`).join('')}</div>`
      : '<div class="card vazio">Nenhum prêmio cadastrado.</div>'}`;
  document.querySelectorAll('[data-foto]').forEach((el) => { if (el.dataset.foto) el.innerHTML = `<img src="${esc(urlPublica(el.dataset.foto))}" alt="" loading="lazy">`; });
}

// ============================================================
// 5. RIFAS — números individuais
// ============================================================
function rRifas(completo) {
  const f = (F.rifas = { bloq: '', st: '', q: '', ...(F.rifas || {}) });
  if (completo) {
    $('#conteudo').innerHTML = `
      <div class="kpis" id="rifa-kpis"></div>
      <div class="card">
        <div class="filtros">
          <input type="search" id="fr-q" placeholder="Buscar nº, comprador, telefone ou vendedor…" value="${esc(f.q)}">
          <select id="fr-bloq"><option value="">Todos os bloquinhos</option>${S.bloquinhos.map((b) => `<option value="${b.id}"${f.bloq === b.id ? ' selected' : ''}>Bloquinho ${pad3(b.numero)}${b.responsavel_nome ? ' – ' + esc(b.responsavel_nome) : ''}</option>`).join('')}</select>
          <select id="fr-st"><option value="">Todos os status</option><option value="naopago"${f.st === 'naopago' ? ' selected' : ''}>Vendidos e não pagos</option>${Object.entries(ST_NUM).map(([k, v]) => `<option value="${k}"${f.st === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
        </div>
        <div class="legenda" style="margin-top:10px">${Object.entries(ST_NUM).map(([k, v]) => `<span><i class="num-tile st-${k}" style="display:inline-block;min-height:0;padding:0"></i>${v}</span>`).join('')}</div>
      </div>
      <div id="rifa-lista"></div>`;
    $('#fr-q').oninput = (e) => { f.q = e.target.value; listaRifas(); };
    $('#fr-bloq').onchange = (e) => { f.bloq = e.target.value; listaRifas(); };
    $('#fr-st').onchange = (e) => { f.st = e.target.value; listaRifas(); };
  }
  listaRifas();
}
function listaRifas() {
  const f = F.rifas, q = f.q.trim().toLowerCase();
  const vend = vendidos();
  $('#rifa-kpis').innerHTML = `
    <div class="kpi"><span>Números</span><b>${S.numeros.length}</b><small>${S.bloquinhos.length} bloquinho(s)</small></div>
    <div class="kpi o"><span>Vendidos</span><b>${vend.length}</b><small>${brl(soma(vend, 'valor'))}</small></div>
    <div class="kpi"><span>Pagos</span><b>${S.numeros.filter((n) => n.status === 'pago').length}</b><small>${brl(soma(S.numeros, 'valor_pago'))} recebidos</small></div>
    <div class="kpi v"><span>Falta receber</span><b>${brl(soma(vend, (n) => Math.max(0, n.valor - n.valor_pago)))}</b><small>${S.numeros.filter((n) => ['vendido', 'pendente'].includes(n.status)).length} número(s)</small></div>`;
  if (!S.numeros.length) { $('#rifa-lista').innerHTML = `<div class="card vazio">Nenhum número ainda. ${pode('bloquinhos') ? 'Gere os bloquinhos em <button class="link" onclick="irPara(\'bloquinhos\')">Controle de Bloquinhos</button>.' : ''}</div>`; return; }
  const filtra = (n) => (!f.bloq || n.bloquinho_id === f.bloq)
    && (!f.st || (f.st === 'naopago' ? ['vendido', 'pendente'].includes(n.status) : n.status === f.st))
    && (!q || String(n.numero) === q.replace(/^0+/, '') || [n.comprador_nome, n.comprador_telefone, n.vendedor].join(' ').toLowerCase().includes(q));
  const blocos = S.bloquinhos.filter((b) => !f.bloq || b.id === f.bloq);
  let html = '', total = 0;
  for (const b of blocos) {
    const ns = (S.numsPorBloq[b.id] || []).filter(filtra);
    if (!ns.length) continue;
    total += ns.length;
    const r = resumoBloq(b);
    html += `<div class="card"><div class="bloq-cab"><div><b>📒 Bloquinho ${pad3(b.numero)}</b> ${b.responsavel_nome ? `– Responsável: <b>${esc(b.responsavel_nome)}</b>` : '<span class="dica">sem responsável</span>'} <span class="badge ${ST_BLOQ_COR[b.situacao]}">${ST_BLOQ[b.situacao]}</span></div>
      <small class="dica">${r.vendidos}/${r.total} vendidos · ${r.pagos} pagos · recebido ${brl(r.recebido)} · em aberto ${brl(r.aberto)}</small></div>
      <div class="numeros-grid">${ns.map((n) => `<div class="num-tile st-${n.status}" onclick="abrirNumero('${n.id}')" title="${esc(ST_NUM[n.status])}${n.comprador_nome ? ' – ' + esc(n.comprador_nome) : ''}">
        <b>${String(n.numero).padStart(2, '0')}</b><small>${esc(n.comprador_nome || ST_NUM[n.status])}</small>${n.status !== 'disponivel' && n.status !== 'cancelado' ? `<small>${n.status === 'pago' ? '✔ ' + brl(n.valor) : n.valor_pago > 0 ? brl(n.valor_pago) + '/' + brl(n.valor) : brl(n.valor)}</small>` : ''}</div>`).join('')}</div></div>`;
  }
  $('#rifa-lista').innerHTML = html || '<div class="card vazio">Nenhum número encontrado com esses filtros.</div>';
}
function abrirNumero(id) {
  const n = S.numPorId[id];
  if (!n) return;
  const b = S.bloqPorId[n.bloquinho_id];
  const pags = (S.pagsPorNum[n.id] || []).sort((a, c) => (a.data || '').localeCompare(c.data || ''));
  const restante = Math.max(0, n.valor - n.valor_pago - n.valor_aguardando);
  const edita = pode('numeros');
  const corpo = `
    <p class="dica" style="margin-top:0">Bloquinho <b>${pad3(b?.numero)}</b>${b?.responsavel_nome ? ' · Responsável: <b>' + esc(b.responsavel_nome) + '</b>' : ''} · Situação atual: <span class="badge ${ST_NUM_COR[n.status]}">${ST_NUM[n.status]}</span></p>
    <form class="form" id="form-num"><div class="grade-form">
      ${campoHTML({ k: 'comprador_nome', l: 'Nome do comprador' }, n.comprador_nome)}
      ${campoHTML({ k: 'comprador_telefone', l: 'Telefone do comprador', t: 'tel' }, n.comprador_telefone)}
      ${campoHTML({ k: 'vendedor', l: 'Nome de quem vendeu', t: 'datalist', lista: nomesPessoas() }, n.vendedor || b?.responsavel_nome)}
      ${campoHTML({ k: 'valor', l: 'Valor do número (R$)', t: 'money' }, n.valor)}
      ${campoHTML({ k: 'data_venda', l: 'Data da venda', t: 'date' }, n.data_venda || (n.status === 'disponivel' ? hoje() : ''))}
      ${campoHTML({ k: 'forma_pagamento', l: 'Forma de pagamento', t: 'select', op: [['', '—'], ...FORMAS_REC] }, n.forma_pagamento)}
      ${campoHTML({ k: 'status', l: 'Situação do número', t: 'select', op: Object.entries(ST_NUM), dica: 'Pago/Pendente é atualizado automaticamente pelos pagamentos.' }, n.status === 'disponivel' ? 'vendido' : n.status)}
      ${campoHTML({ k: 'observacoes', l: 'Observações' }, n.observacoes)}
    </div><div class="erro-box oculto" id="num-erro"></div></form>
    <div class="secao-titulo">Pagamentos deste número</div>
    <div class="relatorio-bloco">
      <div class="lin"><span>Valor do número</span><b>${brl(n.valor)}</b></div>
      <div class="lin"><span>Recebido (confirmado)</span><b style="color:var(--verde2)">${brl(n.valor_pago)}</b></div>
      ${n.valor_aguardando ? `<div class="lin"><span>Aguardando conferência</span><b style="color:#8a6a00">${brl(n.valor_aguardando)}</b></div>` : ''}
      <div class="lin total"><span>Falta receber</span><b style="color:var(--vermelho)">${brl(Math.max(0, n.valor - n.valor_pago))}</b></div>
    </div>
    ${pags.length ? `<div class="tabela-wrap" style="margin-top:10px"><table><thead><tr><th>Data</th><th>Pagador</th><th>Forma</th><th class="num">Valor</th><th>Recebido por</th><th>Situação</th><th></th></tr></thead><tbody>${pags.map((p) => `<tr>
      <td>${dataBR(p.data)}</td><td>${esc(p.pagador)}</td><td>${p.forma === 'pix' ? 'PIX' : 'Dinheiro'}</td><td class="num">${brl(p.valor)}</td><td>${esc(p.recebido_por)}</td>
      <td>${p.situacao === 'confirmado' ? '<span class="badge b-verde">Confirmado</span>' : '<span class="badge b-ouro">Aguardando</span>'}</td>
      <td class="acoes">${linkArq(p.comprovante_path)} ${p.situacao === 'aguardando' && podeConfirmar() ? `<button class="btn peq" data-conf="${p.id}">Confirmar</button>` : ''} ${podeConfirmar() ? `<button class="btn peq perigo" data-delpag="${p.id}">✕</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="dica" style="margin-top:8px">Nenhum pagamento registrado.</p>'}
    ${edita && n.status !== 'cancelado' && restante > 0 ? `
    <div class="secao-titulo">Registrar pagamento</div>
    <form class="form" id="form-pag"><div class="grade-form">
      ${campoHTML({ k: 'valor', l: 'Valor recebido (R$)', t: 'money', req: true, dica: 'Pode ser parcial; o restante fica em aberto.' }, restante)}
      ${campoHTML({ k: 'forma', l: 'Forma', t: 'select', op: FORMAS_REC }, n.forma_pagamento || 'dinheiro')}
      ${campoHTML({ k: 'data', l: 'Data do recebimento', t: 'date', req: true }, hoje())}
      ${campoHTML({ k: 'recebido_por', l: 'Responsável pelo recebimento', t: 'datalist', lista: nomesPessoas() }, b?.responsavel_nome || '')}
      ${campoHTML({ k: 'pagador', l: 'Nome de quem pagou' }, n.comprador_nome)}
      ${podeConfirmar() ? campoHTML({ k: 'situacao', l: 'Situação', t: 'select', op: [['confirmado', 'Confirmado'], ['aguardando', 'Aguardando conferência']] }, 'confirmado') : ''}
      ${campoHTML({ k: 'comprovante', l: 'Comprovante do PIX (opcional)', t: 'file', full: true }, null)}
    </div>${!podeConfirmar() ? '<p class="dica">Pagamentos via PIX ficam “aguardando conferência” até o financeiro confirmar.</p>' : ''}
    <div class="erro-box oculto" id="pag-erro"></div>
    <button class="btn ouro" id="btn-pag" style="align-self:flex-start">💰 Registrar pagamento</button></form>` : ''}`;
  const rodape = edita ? `${n.status !== 'disponivel' ? '<button class="btn perigo" data-liberar style="margin-right:auto">Liberar número</button>' : ''}<button class="btn" data-canc>Fechar</button><button class="btn prim" data-salvnum>Salvar dados do número</button>` : '<button class="btn" data-canc>Fechar</button>';
  const m = abrirModal({ titulo: `🎟️ Número ${String(n.numero).padStart(2, '0')}`, corpo, rodape, largo: true });
  const fx = m.fundo;
  fx.querySelector('[data-canc]').onclick = m.fechar;
  if (!edita) fx.querySelectorAll('#form-num input, #form-num select').forEach((e) => { e.disabled = true; });
  const salvarNum = fx.querySelector('[data-salvnum]');
  if (salvarNum) salvarNum.onclick = async () => {
    const fm = fx.querySelector('#form-num'); const err = fx.querySelector('#num-erro');
    const d = {
      comprador_nome: fm.elements.comprador_nome.value.trim() || null, comprador_telefone: fm.elements.comprador_telefone.value.trim() || null,
      vendedor: fm.elements.vendedor.value.trim() || null, valor: num(fm.elements.valor.value) || n.valor, data_venda: fm.elements.data_venda.value || null,
      forma_pagamento: fm.elements.forma_pagamento.value || null, status: fm.elements.status.value, observacoes: fm.elements.observacoes.value.trim() || null,
    };
    if (['vendido', 'pago', 'pendente', 'reservado'].includes(d.status) && !d.comprador_nome) { err.textContent = 'Informe o nome do comprador.'; err.classList.remove('oculto'); return; }
    try { await gravar('natal_numeros', n.id, d); m.fechar(); await recarregar(false); toast('Número salvo'); } catch (e) { err.textContent = msgErro(e); err.classList.remove('oculto'); }
  };
  const liberar = fx.querySelector('[data-liberar]');
  if (liberar) liberar.onclick = async () => {
    if (pags.length) return toast('Exclua os pagamentos deste número antes de liberá-lo.', true);
    if (!(await confirmar(`Liberar o número ${n.numero}? Os dados do comprador serão apagados e ele volta a ficar disponível.`, 'Liberar'))) return;
    try { await gravar('natal_numeros', n.id, { comprador_nome: null, comprador_telefone: null, vendedor: null, data_venda: null, forma_pagamento: null, status: 'disponivel', observacoes: null }); m.fechar(); await recarregar(false); toast('Número liberado'); } catch (e) { toast(msgErro(e), true); }
  };
  const btnPag = fx.querySelector('#btn-pag');
  if (btnPag) btnPag.onclick = async (e) => {
    e.preventDefault();
    const fp = fx.querySelector('#form-pag'); const err = fx.querySelector('#pag-erro');
    if (!fp.reportValidity()) return;
    const fn = fx.querySelector('#form-num');
    const valor = num(fp.elements.valor.value);
    if (!(valor > 0)) { err.textContent = 'Informe o valor.'; err.classList.remove('oculto'); return; }
    if (!fn.elements.comprador_nome.value.trim() && !fp.elements.pagador.value.trim()) { err.textContent = 'Informe o nome do comprador.'; err.classList.remove('oculto'); return; }
    btnPag.disabled = true; btnPag.textContent = 'Registrando…';
    try {
      // garante os dados do número (comprador/vendedor) antes do pagamento
      if (n.status === 'disponivel' || n.status === 'reservado' || !n.comprador_nome) {
        await gravar('natal_numeros', n.id, {
          comprador_nome: fn.elements.comprador_nome.value.trim() || fp.elements.pagador.value.trim(), comprador_telefone: fn.elements.comprador_telefone.value.trim() || null,
          vendedor: fn.elements.vendedor.value.trim() || null, data_venda: fn.elements.data_venda.value || hoje(), forma_pagamento: fp.elements.forma.value, status: 'vendido',
        });
      }
      const file = fp.elements.comprovante.files[0];
      const comprovante_path = file ? await enviarArquivo(file, 'pagamentos') : null;
      await gravar('natal_pagamentos', null, {
        numero_id: n.id, valor, forma: fp.elements.forma.value, data: fp.elements.data.value, recebido_por: fp.elements.recebido_por.value.trim() || null,
        pagador: fp.elements.pagador.value.trim() || fn.elements.comprador_nome.value.trim() || null, comprovante_path,
        situacao: fp.elements.situacao ? fp.elements.situacao.value : 'confirmado',
      });
      m.fechar(); await recarregar(false); toast('Pagamento registrado');
    } catch (e2) { err.textContent = msgErro(e2); err.classList.remove('oculto'); btnPag.disabled = false; btnPag.textContent = '💰 Registrar pagamento'; }
  };
  fx.querySelectorAll('[data-conf]').forEach((bt) => { bt.onclick = async () => { try { await gravar('natal_pagamentos', bt.dataset.conf, { situacao: 'confirmado' }); m.fechar(); await recarregar(false); toast('Pagamento confirmado'); abrirNumero(n.id); } catch (e) { toast(msgErro(e), true); } }; });
  fx.querySelectorAll('[data-delpag]').forEach((bt) => { bt.onclick = async () => { if (!(await confirmar('Excluir este pagamento? O valor volta a ficar em aberto.', 'Excluir'))) return; try { await apagar('natal_pagamentos', bt.dataset.delpag); m.fechar(); await recarregar(false); toast('Pagamento excluído'); abrirNumero(n.id); } catch (e) { toast(msgErro(e), true); } }; });
}
window.abrirNumero = abrirNumero;

// ============================================================
// 6. BLOQUINHOS
// ============================================================
function formBloquinho(b) {
  const opPessoas = [['', '— selecione —'], ...S.pessoas.filter((p) => p.ativo || p.id === b.pessoa_id).map((p) => [p.id, p.nome])];
  abrirForm({
    titulo: `📒 Bloquinho ${pad3(b.numero)}`,
    campos: [
      { k: 'pessoa_id', l: 'Responsável (pessoa cadastrada)', t: 'select', op: opPessoas, full: true, dica: 'Ou digite o nome abaixo. Cadastre pessoas em “Pessoas e Responsáveis”.' },
      { k: 'responsavel_nome', l: 'Nome de quem retirou' },
      { k: 'telefone', l: 'Telefone', t: 'tel' },
      { k: 'data_retirada', l: 'Data da retirada', t: 'date' },
      { k: 'data_devolucao', l: 'Data de devolução', t: 'date', dica: 'Prevista ou realizada' },
      { k: 'situacao', l: 'Situação', t: 'select', op: Object.entries(ST_BLOQ) },
      { k: 'observacoes', l: 'Observações', t: 'textarea', full: true },
    ],
    extra: `<p class="dica">Quantidade de números: <b>${b.quantidade_numeros}</b> · Valor total do bloquinho: <b>${brl(b.valor_total)}</b></p>`,
    valores: b,
    aoAbrir: (f) => {
      const sel = f.querySelector('#f_pessoa_id');
      sel.onchange = () => {
        const p = S.pessoaPorId[sel.value];
        if (p) { f.querySelector('#f_responsavel_nome').value = p.nome; f.querySelector('#f_telefone').value = p.telefone || ''; }
        if (sel.value && f.querySelector('#f_situacao').value === 'disponivel') { f.querySelector('#f_situacao').value = 'entregue'; if (!f.querySelector('#f_data_retirada').value) f.querySelector('#f_data_retirada').value = hoje(); }
      };
      if (!pode('bloquinhos')) f.querySelector('[data-salv]').classList.add('oculto');
    },
    salvar: (d) => {
      if (d.pessoa_id && !d.responsavel_nome) d.responsavel_nome = S.pessoaPorId[d.pessoa_id]?.nome;
      if (d.situacao !== 'disponivel' && !d.responsavel_nome) throw new Error('Informe quem retirou o bloquinho.');
      return gravar('natal_bloquinhos', b.id, d);
    },
    excluir: PAPEL === 'admin' ? async () => {
      const r = resumoBloq(b);
      if (r.vendidos || r.recebido) throw new Error('Este bloquinho tem números vendidos ou pagamentos. Cancele-os antes de excluir.');
      await apagar('natal_bloquinhos', b.id);
    } : null,
  });
}
window.abrirBloquinho = (id) => formBloquinho(S.bloqPorId[id]);
function gerarBloquinhos() {
  abrirForm({
    titulo: 'Gerar bloquinhos',
    campos: [{ k: 'qtd', l: 'Quantos bloquinhos gerar?', t: 'number', req: true }],
    valores: { qtd: 10 },
    extra: `<p class="dica">Cada bloquinho terá <b>${S.config.numeros_por_bloquinho} números</b> de <b>${brl(S.config.valor_numero)}</b> (total ${brl(S.config.numeros_por_bloquinho * S.config.valor_numero)}). A numeração continua a partir do último bloquinho (${pad3(S.bloquinhos.length ? Math.max(...S.bloquinhos.map((b) => b.numero)) : 0)}) e do último número (${S.numeros.length ? Math.max(...S.numeros.map((n) => n.numero)) : 0}).</p>`,
    salvar: async (d) => {
      const q = Math.round(Number(d.qtd) || 0);
      if (q < 1 || q > 500) throw new Error('Informe entre 1 e 500.');
      const { error } = await sb.rpc('natal_gerar_bloquinhos', { p_qtd: q });
      if (error) throw error;
    },
  });
}
window.gerarBloquinhos = gerarBloquinhos;
function rBloquinhos(completo) {
  const f = (F.bloquinhos = { sit: '', q: '', ...(F.bloquinhos || {}) });
  if (completo) {
    $('#conteudo').innerHTML = `
      <div class="entre"><div class="filtros">
        <input type="search" id="fb-q" placeholder="Buscar bloquinho, número (ex.: 0076) ou responsável…" value="${esc(f.q)}">
        <select id="fb-sit"><option value="">Todas as situações</option><option value="falta"${f.sit === 'falta' ? ' selected' : ''}>Falta acertar</option><option value="acertado"${f.sit === 'acertado' ? ' selected' : ''}>Acertados</option><option value="naodev"${f.sit === 'naodev' ? ' selected' : ''}>Não devolvidos</option>${Object.entries(ST_BLOQ).map(([k, v]) => `<option value="${k}"${f.sit === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
      </div>${pode('bloquinhos') ? '<button class="btn prim" onclick="gerarBloquinhos()">+ Gerar bloquinhos</button>' : ''}</div>
      <div id="bloq-lista"></div>`;
    $('#fb-q').oninput = (e) => { f.q = e.target.value; listaBloquinhos(); };
    $('#fb-sit').onchange = (e) => { f.sit = e.target.value; listaBloquinhos(); };
  }
  listaBloquinhos();
}
const pad4 = (n) => String(n).padStart(4, '0');
function faixaBloq(b) {
  const ns = S.numsPorBloq[b.id] || [];
  if (!ns.length) return '—';
  return `${pad4(Math.min(...ns.map((n) => n.numero)))} - ${pad4(Math.max(...ns.map((n) => n.numero)))}`;
}
function acertoBloq(b) {
  const pags = S.pagamentos.filter((p) => p.bloquinho_id === b.id);
  const pix = soma(pags.filter((p) => p.forma === 'pix' && p.situacao === 'confirmado'), 'valor');
  const din = soma(pags.filter((p) => p.forma === 'dinheiro' && p.situacao === 'confirmado'), 'valor');
  const ag = soma(pags.filter((p) => p.situacao === 'aguardando'), 'valor');
  const total = pix + din;
  return { pix, din, ag, total, falta: Math.max(0, Number(b.valor_total) - total) };
}
function listaBloquinhos() {
  const f = F.bloquinhos, q = f.q.trim().toLowerCase(), hj = hoje();
  const lista = S.bloquinhos.filter((b) => (!f.sit || (f.sit === 'naodev' ? ['entregue', 'em_andamento'].includes(b.situacao) : f.sit === 'falta' ? acertoBloq(b).falta > 0 && b.responsavel_nome : f.sit === 'acertado' ? acertoBloq(b).falta === 0 : b.situacao === f.sit))
    && (!q || String(b.numero) === q.replace(/^0+/, '') || (b.responsavel_nome || '').toLowerCase().includes(q) || faixaBloq(b).includes(q.padStart(4, '0')) || (S.numsPorBloq[b.id] || []).some((n) => String(n.numero) === q.replace(/^0+/, ''))));
  if (!S.bloquinhos.length) { $('#bloq-lista').innerHTML = `<div class="card vazio">Nenhum bloquinho gerado ainda.${pode('bloquinhos') ? ' Clique em <b>+ Gerar bloquinhos</b> ou importe a planilha em Configurações.' : ''}</div>`; return; }
  const ac = lista.map((b) => ({ b, a: acertoBloq(b), r: resumoBloq(b) }));
  const tot = { valor: soma(ac, (x) => x.b.responsavel_nome ? Number(x.b.valor_total) : 0), pix: soma(ac, (x) => x.a.pix), din: soma(ac, (x) => x.a.din), total: soma(ac, (x) => x.a.total) };
  const linhas = ac.map(({ b, a, r }) => {
    const atrasado = ['entregue', 'em_andamento'].includes(b.situacao) && b.data_devolucao && b.data_devolucao < hj;
    const pct = Math.min(100, (a.total / Number(b.valor_total || 1)) * 100);
    return `<tr style="cursor:pointer" onclick="abrirBloquinho('${b.id}')">
      <td><b>${pad3(b.numero)}</b></td><td style="white-space:nowrap"><b>${faixaBloq(b)}</b></td><td>${esc(b.responsavel_nome || '—')}${b.telefone ? `<br><small class="dica">${esc(b.telefone)}</small>` : ''}</td>
      <td class="num">${brl(b.valor_total)}<br><small class="dica">${r.total} números</small></td>
      <td class="num">${a.pix ? brl(a.pix) : '—'}</td><td class="num">${a.din ? brl(a.din) : '—'}</td>
      <td class="num"><b>${brl(a.total)}</b>${a.ag ? `<br><small class="dica">+${brl(a.ag)} aguardando</small>` : ''}<div class="barra" style="margin-top:4px;min-width:70px"><i style="width:${pct}%"></i></div></td>
      <td class="num">${!b.responsavel_nome ? '—' : a.falta > 0 ? `<b style="color:var(--vermelho)">${brl(a.falta)}</b>` : '<span class="badge b-verde">acertado</span>'}</td>
      <td><span class="badge ${ST_BLOQ_COR[b.situacao]}">${ST_BLOQ[b.situacao]}</span>${atrasado ? '<br><span class="badge b-verm">devolução vencida</span>' : ''}</td>
      <td class="acoes">${pode('pagamentos') && b.responsavel_nome && a.falta > 0 ? `<button class="btn peq ouro" onclick="event.stopPropagation();acertarBloquinho('${b.id}')">💰 Acertar</button> ` : ''}<button class="btn peq" onclick="event.stopPropagation();irPara('rifas',{bloq:'${b.id}',st:'',q:''})">Números</button></td></tr>`;
  }).join('');
  $('#bloq-lista').innerHTML = `
    <div class="kpis" style="margin-bottom:12px">
      <div class="kpi"><span>Bloquinhos entregues</span><b>${ac.filter((x) => x.b.responsavel_nome).length} <small>de ${ac.length}</small></b><small>valor a acertar ${brl(tot.valor)}</small></div>
      <div class="kpi a"><span>Acertado em PIX</span><b>${brl(tot.pix)}</b></div>
      <div class="kpi"><span>Acertado em dinheiro</span><b>${brl(tot.din)}</b></div>
      <div class="kpi destaque"><span>Total acertado</span><b>${brl(tot.total)}</b><small>${ac.filter((x) => x.b.responsavel_nome && x.a.falta === 0).length} bloquinho(s) quitado(s)</small></div>
      <div class="kpi v"><span>Falta acertar</span><b>${brl(Math.max(0, tot.valor - tot.total))}</b><small>${ac.filter((x) => x.b.responsavel_nome && x.a.falta > 0).length} bloquinho(s)</small></div>
    </div>
    <div class="tabela-wrap"><table>
    <thead><tr><th>Nº</th><th>Números</th><th>Responsável</th><th class="num">Valor</th><th class="num">PIX</th><th class="num">Dinheiro</th><th class="num">Total acertado</th><th class="num">Falta</th><th>Situação</th><th></th></tr></thead>
    <tbody>${linhas || '<tr><td colspan="10" class="vazio">Nenhum bloquinho com esses filtros.</td></tr>'}</tbody>
    <tfoot><tr><td colspan="3">${lista.length} bloquinho(s)</td><td class="num">${brl(tot.valor)}</td><td class="num">${brl(tot.pix)}</td><td class="num">${brl(tot.din)}</td><td class="num">${brl(tot.total)}</td><td class="num">${brl(Math.max(0, tot.valor - tot.total))}</td><td colspan="2"></td></tr></tfoot></table></div>`;
}

// Acerto rápido do bloquinho: informa PIX e dinheiro e o sistema marca os números como vendidos e pagos
function acertarBloquinho(id) {
  const b = S.bloqPorId[id];
  const a = acertoBloq(b);
  const livres = (S.numsPorBloq[b.id] || []).filter((n) => n.status === 'disponivel');
  const vn = Number(S.config.valor_numero);
  abrirForm({
    titulo: `💰 Acerto · Bloquinho ${pad3(b.numero)} (${faixaBloq(b)})`,
    campos: [
      { k: 'pix', l: 'Valor em PIX (R$)', t: 'money' },
      { k: 'din', l: 'Valor em dinheiro (R$)', t: 'money' },
      { k: 'data', l: 'Data do acerto', t: 'date', req: true },
      { k: 'entregue', l: 'Dinheiro já entregue ao caixa?', t: 'select', op: [['sim', 'Sim, já entregou'], ['nao', 'Não, ainda está com o responsável']] },
      { k: 'obs', l: 'Observações', full: true },
    ],
    valores: { pix: '', din: '', data: hoje(), entregue: 'sim' },
    extra: `<div class="relatorio-bloco" style="margin-top:6px">
        <div class="lin"><span>Responsável</span><b>${esc(b.responsavel_nome || '—')}</b></div>
        <div class="lin"><span>Valor do bloquinho</span><b>${brl(b.valor_total)}</b></div>
        <div class="lin"><span>Já acertado</span><b>${brl(a.total)} (PIX ${brl(a.pix)} · dinheiro ${brl(a.din)})</b></div>
        <div class="lin total"><span>Falta</span><b style="color:var(--vermelho)">${brl(a.falta)}</b></div></div>
      <p class="dica" style="margin-top:8px">O sistema marca ${brl(vn)} por número: os números livres do bloquinho viram <b>vendidos e pagos</b> (${livres.length} livre(s)). Para registrar o nome de cada comprador, use a tela de Rifas.</p>`,
    salvar: async (d) => {
      const pix = Number(d.pix) || 0, din = Number(d.din) || 0;
      if (pix + din <= 0) throw new Error('Informe o valor em PIX e/ou em dinheiro.');
      if (Math.abs(pix / vn - Math.round(pix / vn)) > 0.001 || Math.abs(din / vn - Math.round(din / vn)) > 0.001) throw new Error(`Os valores precisam ser múltiplos de ${brl(vn)} (valor de cada número).`);
      const nPix = Math.round(pix / vn), nDin = Math.round(din / vn);
      if (nPix + nDin > livres.length) throw new Error(`O bloquinho só tem ${livres.length} número(s) livre(s) (${brl(livres.length * vn)}).`);
      for (const [forma, ns] of [['pix', livres.slice(0, nPix)], ['dinheiro', livres.slice(nPix, nPix + nDin)]]) {
        if (!ns.length) continue;
        const { error: e1 } = await sb.from('natal_numeros').update({ status: 'vendido', comprador_nome: 'Acerto do bloquinho', vendedor: b.responsavel_nome, data_venda: d.data, forma_pagamento: forma, observacoes: d.obs || 'Vendido no acerto do bloquinho' }).in('id', ns.map((n) => n.id));
        if (e1) throw e1;
        const { error: e2 } = await sb.from('natal_pagamentos').insert(ns.map((n) => ({ numero_id: n.id, valor: vn, forma, data: d.data, pagador: 'Acerto do bloquinho', recebido_por: b.responsavel_nome, situacao: 'confirmado', observacoes: d.obs || 'Acerto do bloquinho' })));
        if (e2) throw e2;
      }
      if (din > 0 && d.entregue === 'sim' && b.pessoa_id) {
        const { error } = await sb.from('natal_entregas').insert({ pessoa_id: b.pessoa_id, valor: din, data: d.data, forma: 'dinheiro', observacoes: `Acerto do bloquinho ${pad3(b.numero)}` });
        if (error) throw error;
      }
      const novoTotal = a.total + pix + din;
      if (novoTotal >= Number(b.valor_total)) await sb.from('natal_bloquinhos').update({ situacao: 'finalizado' }).eq('id', b.id);
      else if (b.situacao === 'entregue') await sb.from('natal_bloquinhos').update({ situacao: 'em_andamento' }).eq('id', b.id);
    },
  });
}
window.acertarBloquinho = acertarBloquinho;

// ============================================================
// 7. RECEBIMENTOS (pagamentos, entregas, outras receitas)
// ============================================================
function rRecebimentos(completo) {
  const f = (F.recebimentos = { aba: 'pagamentos', forma: '', sit: '', resp: '', bloq: '', q: '', ...(F.recebimentos || {}) });
  if (completo) {
    $('#conteudo').innerHTML = `
      <div class="abas" id="rec-abas">
        <button data-aba="pagamentos">🎟️ Pagamentos da rifa</button>
        <button data-aba="entregas">💵 Entregas dos responsáveis</button>
        <button data-aba="receitas">🤝 Doações e outras entradas</button>
        <button data-aba="extrato">🏦 Extrato PIX</button>
      </div><div id="rec-conteudo"></div>`;
    document.querySelectorAll('#rec-abas button').forEach((bt) => { bt.onclick = () => { f.aba = bt.dataset.aba; montarAbaRec(); }; });
    montarAbaRec();
  } else listaAbaRec();
}
function montarAbaRec() {
  const f = F.recebimentos;
  document.querySelectorAll('#rec-abas button').forEach((bt) => bt.classList.toggle('on', bt.dataset.aba === f.aba));
  const box = $('#rec-conteudo');
  if (f.aba === 'pagamentos') {
    const resps = [...new Set(S.pagamentos.map((p) => p.recebido_por).filter(Boolean))].sort();
    box.innerHTML = `<div id="rec-kpis"></div>
      <div class="filtros" style="margin:12px 0">
        <input type="search" id="frc-q" placeholder="Buscar pagador ou nº…" value="${esc(f.q)}">
        <select id="frc-forma"><option value="">Dinheiro e PIX</option><option value="dinheiro"${f.forma === 'dinheiro' ? ' selected' : ''}>Só dinheiro</option><option value="pix"${f.forma === 'pix' ? ' selected' : ''}>Só PIX</option></select>
        <select id="frc-sit"><option value="">Todas as situações</option><option value="confirmado"${f.sit === 'confirmado' ? ' selected' : ''}>Confirmados</option><option value="aguardando"${f.sit === 'aguardando' ? ' selected' : ''}>Aguardando conferência</option></select>
        <select id="frc-resp"><option value="">Todos os responsáveis</option>${resps.map((r) => `<option${f.resp === r ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select>
        <select id="frc-bloq"><option value="">Todos os bloquinhos</option>${S.bloquinhos.map((b) => `<option value="${b.id}"${f.bloq === b.id ? ' selected' : ''}>Bloquinho ${pad3(b.numero)}</option>`).join('')}</select>
      </div><div id="rec-lista"></div>
      <p class="dica" style="margin-top:8px">Para registrar um novo pagamento, abra o número em <button class="link" onclick="irPara('rifas')">Controle de Rifas</button> (permite pagamentos parciais). Números pendentes: ${S.numeros.filter((n) => ['vendido', 'pendente'].includes(n.status)).length}.</p>`;
    $('#frc-q').oninput = (e) => { f.q = e.target.value; listaAbaRec(); };
    ['forma', 'sit', 'resp', 'bloq'].forEach((k) => { $('#frc-' + k).onchange = (e) => { f[k] = e.target.value; listaAbaRec(); }; });
  } else if (f.aba === 'extrato') {
    box.innerHTML = montarExtrato(); listaExtrato(); return;
  } else if (f.aba === 'entregas') {
    box.innerHTML = `<div class="entre" style="margin:12px 0"><p class="dica">Valores em dinheiro que os responsáveis entregaram ao caixa da Carretinha.</p>${pode('entregas') ? '<button class="btn prim" onclick="formEntrega()">+ Registrar entrega</button>' : ''}</div><div id="rec-lista"></div>`;
  } else {
    box.innerHTML = `<div class="entre" style="margin:12px 0"><p class="dica">Doações em dinheiro e outras entradas (fora da rifa).</p>${pode('receitas') ? '<button class="btn prim" onclick="formReceita()">+ Nova entrada</button>' : ''}</div><div id="rec-lista"></div>`;
  }
  listaAbaRec();
}
function listaAbaRec() {
  const f = F.recebimentos;
  if (f.aba === 'extrato') return listaExtrato();
  if (f.aba === 'pagamentos') {
    const q = f.q.trim().toLowerCase();
    const lista = S.pagamentos.filter((p) => (!f.forma || p.forma === f.forma) && (!f.sit || p.situacao === f.sit) && (!f.resp || p.recebido_por === f.resp) && (!f.bloq || p.bloquinho_id === f.bloq)
      && (!q || (p.pagador || '').toLowerCase().includes(q) || String(S.numPorId[p.numero_id]?.numero) === q.replace(/^0+/, ''))).sort((a, b) => (b.data || '').localeCompare(a.data || '') || b.criado_em.localeCompare(a.criado_em));
    const conf = S.pagamentos.filter((p) => p.situacao === 'confirmado');
    $('#rec-kpis').innerHTML = `<div class="kpis">
      <div class="kpi"><span>Confirmado em dinheiro</span><b>${brl(soma(conf.filter((p) => p.forma === 'dinheiro'), 'valor'))}</b></div>
      <div class="kpi a"><span>Confirmado via PIX</span><b>${brl(soma(conf.filter((p) => p.forma === 'pix'), 'valor'))}</b></div>
      <div class="kpi o"><span>Aguardando conferência</span><b>${brl(soma(S.pagamentos.filter((p) => p.situacao === 'aguardando'), 'valor'))}</b><small>${S.pagamentos.filter((p) => p.situacao === 'aguardando').length} comprovante(s)</small></div>
      <div class="kpi v"><span>Em aberto (a receber)</span><b>${brl(soma(vendidos(), (n) => Math.max(0, n.valor - n.valor_pago)))}</b></div></div>`;
    $('#rec-lista').innerHTML = lista.length ? `<div class="tabela-wrap"><table><thead><tr><th>Data</th><th>Quem pagou</th><th>Nº</th><th>Bloquinho</th><th class="num">Valor</th><th>Forma</th><th>Recebido por</th><th>Situação</th><th></th></tr></thead><tbody>${lista.map((p) => {
      const n = S.numPorId[p.numero_id], b = S.bloqPorId[p.bloquinho_id];
      return `<tr><td>${dataBR(p.data)}</td><td>${esc(p.pagador)}</td><td>${n ? `<button class="link" onclick="abrirNumero('${n.id}')">${String(n.numero).padStart(2, '0')}</button>` : '—'}</td><td>${b ? pad3(b.numero) : '—'}</td>
        <td class="num"><b>${brl(p.valor)}</b></td><td>${p.forma === 'pix' ? 'PIX' : 'Dinheiro'}</td><td>${esc(p.recebido_por)}</td>
        <td>${p.situacao === 'confirmado' ? '<span class="badge b-verde">Confirmado</span>' : '<span class="badge b-ouro">Aguardando conferência</span>'}</td>
        <td class="acoes">${linkArq(p.comprovante_path)} ${p.situacao === 'aguardando' && podeConfirmar() ? `<button class="btn peq prim" onclick="confirmarPag('${p.id}')">Confirmar</button>` : ''}</td></tr>`;
    }).join('')}</tbody><tfoot><tr><td colspan="4">${lista.length} pagamento(s)</td><td class="num">${brl(soma(lista, 'valor'))}</td><td colspan="4"></td></tr></tfoot></table></div>` : '<div class="card vazio">Nenhum pagamento encontrado.</div>';
  } else if (f.aba === 'entregas') {
    const lista = [...S.entregas].sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    $('#rec-lista').innerHTML = lista.length ? `<div class="tabela-wrap"><table><thead><tr><th>Data</th><th>Responsável</th><th class="num">Valor</th><th>Forma</th><th>Recebido por</th><th>Observações</th><th></th></tr></thead><tbody>${lista.map((e) => `<tr>
      <td>${dataBR(e.data)}</td><td>${esc(S.pessoaPorId[e.pessoa_id]?.nome)}</td><td class="num"><b>${brl(e.valor)}</b></td><td>${e.forma === 'pix' ? 'PIX' : 'Dinheiro'}</td><td>${esc(e.recebido_por)}</td><td>${esc(e.observacoes)}</td>
      <td class="acoes">${pode('entregas') ? `<button class="btn peq" onclick="formEntrega(S.entregas.find(x=>x.id==='${e.id}'))">Editar</button>` : ''}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="2">Total entregue</td><td class="num">${brl(soma(lista, 'valor'))}</td><td colspan="4"></td></tr></tfoot></table></div>` : '<div class="card vazio">Nenhuma entrega registrada.</div>';
  } else {
    const lista = [...S.receitas].sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    $('#rec-lista').innerHTML = lista.length ? `<div class="tabela-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Doador / origem</th><th class="num">Valor</th><th>Forma</th><th>Recebido por</th><th>Situação</th><th></th></tr></thead><tbody>${lista.map((r) => `<tr style="cursor:pointer" onclick="formReceita(S.receitas.find(x=>x.id==='${r.id}'))">
      <td>${dataBR(r.data)}</td><td>${r.tipo === 'doacao' ? 'Doação' : 'Outra entrada'}</td><td>${esc(r.descricao)}</td><td>${esc(r.doador)}</td><td class="num"><b>${brl(r.valor)}</b></td>
      <td>${{ dinheiro: 'Dinheiro', pix: 'PIX', outro: 'Outro' }[r.forma]}</td><td>${esc(r.recebido_por)}</td><td>${r.situacao === 'recebido' ? '<span class="badge b-verde">Recebido</span>' : '<span class="badge b-ouro">Pendente</span>'}</td><td class="acoes">${linkArq(r.comprovante_path)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="4">Total recebido</td><td class="num">${brl(soma(lista.filter((r) => r.situacao === 'recebido'), 'valor'))}</td><td colspan="4"></td></tr></tfoot></table></div>` : '<div class="card vazio">Nenhuma doação ou entrada registrada.</div>';
  }
}
window.confirmarPag = async (id) => {
  try { await gravar('natal_pagamentos', id, { situacao: 'confirmado' }); await recarregar(false); toast('Pagamento confirmado'); } catch (e) { toast(msgErro(e), true); }
};
function formEntrega(e) {
  abrirForm({
    titulo: e ? 'Editar entrega' : 'Registrar entrega de valores',
    campos: [
      { k: 'pessoa_id', l: 'Responsável que entregou', t: 'select', req: true, op: [['', '— selecione —'], ...S.pessoas.map((p) => [p.id, p.nome])] },
      { k: 'valor', l: 'Valor entregue (R$)', t: 'money', req: true },
      { k: 'data', l: 'Data', t: 'date', req: true },
      { k: 'forma', l: 'Forma', t: 'select', op: FORMAS_REC },
      { k: 'recebido_por', l: 'Recebido por (caixa)', t: 'datalist', lista: nomesPessoas() },
      { k: 'observacoes', l: 'Observações', full: true },
    ],
    valores: e || { data: hoje(), forma: 'dinheiro' },
    aoAbrir: (f) => {
      const sel = f.querySelector('#f_pessoa_id'), dica = document.createElement('p');
      dica.className = 'dica'; sel.parentElement.appendChild(dica);
      const at = () => { const p = S.pessoaPorId[sel.value]; dica.innerHTML = p ? `Pendente de entrega: <b>${brl(resumoPessoa(p).pendenteEntrega)}</b>` : ''; if (p && !e && !f.querySelector('#f_valor').value) f.querySelector('#f_valor').value = fmtNumInput(resumoPessoa(p).pendenteEntrega.toFixed(2)); };
      sel.onchange = at; at();
    },
    salvar: (d) => { if (!(d.valor > 0)) throw new Error('Informe o valor.'); return gravar('natal_entregas', e?.id, d); },
    excluir: e && pode('entregas') ? () => apagar('natal_entregas', e.id) : null,
  });
}
window.formEntrega = formEntrega;
function formReceita(r) {
  abrirForm({
    titulo: r ? 'Editar entrada' : 'Nova doação / entrada',
    campos: [
      { k: 'tipo', l: 'Tipo', t: 'select', op: [['doacao', 'Doação em dinheiro'], ['outra', 'Outra entrada']] },
      { k: 'descricao', l: 'Descrição', req: true },
      { k: 'doador', l: 'Doador / origem' },
      { k: 'valor', l: 'Valor (R$)', t: 'money', req: true },
      { k: 'data', l: 'Data', t: 'date', req: true },
      { k: 'forma', l: 'Forma', t: 'select', op: [['dinheiro', 'Dinheiro'], ['pix', 'PIX'], ['outro', 'Outro']] },
      { k: 'recebido_por', l: 'Recebido por', t: 'datalist', lista: nomesPessoas() },
      { k: 'situacao', l: 'Situação', t: 'select', op: [['recebido', 'Recebido'], ['pendente', 'Pendente']] },
      { k: 'comprovante_path', l: 'Comprovante', t: 'file', pasta: 'receitas', full: true },
      { k: 'observacoes', l: 'Observações', t: 'textarea', full: true },
    ],
    valores: r || { tipo: 'doacao', data: hoje(), forma: 'dinheiro', situacao: 'recebido' },
    aoAbrir: (f) => { if (!pode('receitas')) f.querySelector('[data-salv]').classList.add('oculto'); },
    salvar: (d) => { if (!(d.valor > 0)) throw new Error('Informe o valor.'); return gravar('natal_receitas', r?.id, d); },
    excluir: r && pode('receitas') ? () => apagar('natal_receitas', r.id) : null,
  });
}
window.formReceita = formReceita;

// ============================================================
// 8. PESSOAS E RESPONSÁVEIS
// ============================================================
function formPessoa(p) {
  abrirForm({
    titulo: p ? 'Editar pessoa' : 'Nova pessoa',
    campos: [
      { k: 'nome', l: 'Nome', req: true },
      { k: 'telefone', l: 'Telefone', t: 'tel' },
      { k: 'funcao', l: 'Função', t: 'datalist', lista: ['Responsável por bloquinhos', 'Vendedor(a)', 'Tesouraria', 'Compras', 'Motorista', 'Organização', 'Voluntário(a)'] },
      { k: 'ativo', l: 'Situação', t: 'select', op: [['true', 'Ativo'], ['false', 'Inativo']] },
      { k: 'observacoes', l: 'Observações', t: 'textarea', full: true },
    ],
    valores: p ? { ...p, ativo: String(p.ativo) } : { ativo: 'true' },
    salvar: (d) => { d.ativo = d.ativo !== 'false'; return gravar('natal_pessoas', p?.id, d); },
    excluir: p && pode('pessoas') ? async () => { if (S.bloquinhos.some((b) => b.pessoa_id === p.id)) throw new Error('Esta pessoa tem bloquinhos. Marque como inativa em vez de excluir.'); await apagar('natal_pessoas', p.id); } : null,
  });
}
window.formPessoa = formPessoa;
function rPessoas() {
  const lin = S.pessoas.map((p) => ({ p, r: resumoPessoa(p) }));
  $('#conteudo').innerHTML = `
    <div class="entre"><p class="dica">Equipe da Carretinha e desempenho de cada responsável.</p><div style="display:flex;gap:8px">${pode('entregas') ? '<button class="btn" onclick="formEntrega()">💵 Registrar entrega</button>' : ''}${pode('pessoas') ? '<button class="btn prim" onclick="formPessoa()">+ Nova pessoa</button>' : ''}</div></div>
    ${lin.length ? `<div class="tabela-wrap"><table><thead><tr><th>Nome</th><th>Telefone</th><th>Função</th><th class="num">Bloquinhos</th><th class="num">Vendidos</th><th class="num">Arrecadado</th><th class="num">Entregue</th><th class="num">Pendente de entrega</th><th class="num">A receber</th><th></th></tr></thead><tbody>${lin.map(({ p, r }) => `<tr${p.ativo ? '' : ' style="opacity:.55"'}>
      <td><b>${esc(p.nome)}</b>${p.ativo ? '' : ' <span class="badge b-cinza">inativo</span>'}</td><td>${esc(p.telefone)}</td><td>${esc(p.funcao)}</td>
      <td class="num">${r.bloqs.map((b) => pad3(b.numero)).join(', ') || '—'}</td><td class="num">${r.vendidos}</td><td class="num">${brl(r.arrecadado)}</td><td class="num">${brl(r.entregue)}</td>
      <td class="num">${r.pendenteEntrega > 0.009 ? `<span class="badge b-verm">${brl(r.pendenteEntrega)}</span>` : '<span class="badge b-verde">em dia</span>'}</td><td class="num">${brl(r.aReceber)}</td>
      <td class="acoes"><button class="btn peq" onclick="prestacaoPessoa('${p.id}')">Prestação</button> ${pode('pessoas') ? `<button class="btn peq" onclick="formPessoa(S.pessoas.find(x=>x.id==='${p.id}'))">Editar</button>` : ''}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="4">Totais</td><td class="num">${soma(lin, (x) => x.r.vendidos)}</td><td class="num">${brl(soma(lin, (x) => x.r.arrecadado))}</td><td class="num">${brl(soma(lin, (x) => x.r.entregue))}</td><td class="num">${brl(soma(lin, (x) => x.r.pendenteEntrega))}</td><td class="num">${brl(soma(lin, (x) => x.r.aReceber))}</td><td></td></tr></tfoot></table></div>
      <p class="dica">“Pendente de entrega” = dinheiro em espécie recebido nos bloquinhos do responsável − valores já entregues ao caixa. PIX cai direto na conta e não entra nesse cálculo.</p>`
      : '<div class="card vazio">Nenhuma pessoa cadastrada.</div>'}`;
}
function prestacaoPessoa(id) {
  const p = S.pessoaPorId[id], r = resumoPessoa(p);
  const ents = S.entregas.filter((e) => e.pessoa_id === id);
  const corpo = `
    <div class="kpis">
      <div class="kpi"><span>Bloquinhos</span><b>${r.bloqs.length}</b></div>
      <div class="kpi o"><span>Números vendidos</span><b>${r.vendidos}</b><small>${r.pagos} pagos</small></div>
      <div class="kpi"><span>Arrecadado</span><b>${brl(r.arrecadado)}</b><small>dinheiro ${brl(r.dinheiro)} · PIX ${brl(r.pix)}</small></div>
      <div class="kpi v"><span>Pendente de entrega</span><b>${brl(r.pendenteEntrega)}</b><small>entregue ${brl(r.entregue)}</small></div>
    </div>
    <div class="secao-titulo">Números vendidos</div>
    ${r.nums.filter((n) => n.status !== 'disponivel').length ? `<div class="tabela-wrap"><table><thead><tr><th>Bloq.</th><th>Nº</th><th>Comprador</th><th>Telefone</th><th class="num">Valor</th><th class="num">Pago</th><th>Situação</th></tr></thead><tbody>${r.nums.filter((n) => n.status !== 'disponivel').map((n) => `<tr><td>${pad3(S.bloqPorId[n.bloquinho_id]?.numero)}</td><td>${String(n.numero).padStart(2, '0')}</td><td>${esc(n.comprador_nome)}</td><td>${esc(n.comprador_telefone)}</td><td class="num">${brl(n.valor)}</td><td class="num">${brl(n.valor_pago)}</td><td><span class="badge ${ST_NUM_COR[n.status]}">${ST_NUM[n.status]}</span></td></tr>`).join('')}</tbody></table></div>` : '<p class="dica">Nenhum número vendido.</p>'}
    <div class="secao-titulo">Entregas ao caixa</div>
    ${ents.length ? `<div class="tabela-wrap"><table><thead><tr><th>Data</th><th class="num">Valor</th><th>Forma</th><th>Recebido por</th></tr></thead><tbody>${ents.map((e) => `<tr><td>${dataBR(e.data)}</td><td class="num">${brl(e.valor)}</td><td>${e.forma === 'pix' ? 'PIX' : 'Dinheiro'}</td><td>${esc(e.recebido_por)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="dica">Nenhuma entrega registrada.</p>'}`;
  const m = abrirModal({ titulo: `Prestação de contas · ${esc(p.nome)}`, corpo, largo: true, rodape: '<button class="btn" data-pdf>⬇ PDF</button><button class="btn prim" data-f>Fechar</button>' });
  m.fundo.querySelector('[data-f]').onclick = m.fechar;
  m.fundo.querySelector('[data-pdf]').onclick = () => pdfPessoa(p, r, ents);
}
window.prestacaoPessoa = prestacaoPessoa;

// ============================================================
// 9. RELATÓRIOS E PRESTAÇÃO DE CONTAS
// ============================================================
function rRelatorios(completo) {
  const f = (F.relatorios = { de: '', ate: '', aba: 'contas', ...(F.relatorios || {}) });
  if (completo) {
    $('#conteudo').innerHTML = `
      <div class="card"><div class="entre"><div class="filtros">
        <label class="dica">De <input type="date" id="frl-de" value="${f.de}"></label>
        <label class="dica">Até <input type="date" id="frl-ate" value="${f.ate}"></label>
        <button class="link" onclick="F.relatorios.de='';F.relatorios.ate='';rRelatorios(true)">Período todo</button>
      </div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn verm" onclick="pdfPrestacao()">⬇ PDF da prestação de contas</button><button class="btn prim" onclick="excelPrestacao()">⬇ Excel completo</button></div></div></div>
      <div class="abas" id="rel-abas"><button data-aba="contas">📑 Prestação de contas</button>${['admin', 'financeiro'].includes(PAPEL) ? '<button data-aba="historico">🕓 Histórico de alterações</button>' : ''}</div>
      <div id="rel-conteudo"></div>`;
    $('#frl-de').onchange = (e) => { f.de = e.target.value; relConteudo(); };
    $('#frl-ate').onchange = (e) => { f.ate = e.target.value; relConteudo(); };
    document.querySelectorAll('#rel-abas button').forEach((b) => { b.onclick = () => { f.aba = b.dataset.aba; relConteudo(); }; });
  }
  relConteudo();
}
function relConteudo() {
  const f = F.relatorios;
  document.querySelectorAll('#rel-abas button').forEach((b) => b.classList.toggle('on', b.dataset.aba === f.aba));
  if (f.aba === 'historico') return relHistorico();
  const t = totais(f.de || null, f.ate || null);
  const per = f.de || f.ate ? `${f.de ? dataBR(f.de) : 'início'} a ${f.ate ? dataBR(f.ate) : 'hoje'}` : 'todo o período';
  const despCat = Object.entries(t.porCat).sort((a, b) => b[1] - a[1]);
  const resp = S.pessoas.map((p) => ({ p, r: resumoPessoa(p) })).filter((x) => x.r.bloqs.length || x.r.entregue);
  $('#rel-conteudo').innerHTML = `
    <p class="dica">Período: <b>${per}</b>. Valores pendentes não são contabilizados como dinheiro recebido.</p>
    <div class="grade3">
      <div class="relatorio-bloco"><div class="cab">TOTAL DE RECEITAS (recebidas)</div>
        <div class="lin"><span>Arrecadação das rifas</span><b>${brl(t.rifaRecebido)}</b></div>
        <div class="lin"><span>Doações em dinheiro</span><b>${brl(t.doacoes)}</b></div>
        <div class="lin"><span>Outras entradas</span><b>${brl(t.outras)}</b></div>
        <div class="lin total"><span>Total</span><b>${brl(t.recebidoTotal)}</b></div></div>
      <div class="relatorio-bloco"><div class="cab v">TOTAL DE DESPESAS</div>
        ${despCat.map(([c, v]) => `<div class="lin"><span>${esc(c)}</span><b>${brl(v)}</b></div>`).join('') || '<div class="lin"><span>Nenhuma despesa</span><b>—</b></div>'}
        <div class="lin total"><span>Total</span><b>${brl(t.despTotal)}</b></div></div>
      <div class="relatorio-bloco"><div class="cab o">RESULTADO</div>
        <div class="lin"><span>Total arrecadado (rifas vendidas + entradas)</span><b>${brl(t.rifaVendido + t.doacoes + t.outras + t.receitasPendentes)}</b></div>
        <div class="lin"><span>Total efetivamente recebido</span><b>${brl(t.recebidoTotal)}</b></div>
        <div class="lin"><span>Total gasto (despesas pagas)</span><b>${brl(t.despPagas)}</b></div>
        <div class="lin"><span>Total pendente de recebimento</span><b>${brl(t.rifaAberto + t.receitasPendentes)}</b></div>
        <div class="lin"><span>PIX aguardando conferência</span><b>${brl(t.rifaAguardando)}</b></div>
        <div class="lin"><span>Contas a pagar</span><b>${brl(t.despPend)}</b></div>
        <div class="lin total"><span>SALDO FINAL</span><b style="color:${t.saldo >= 0 ? 'var(--verde2)' : 'var(--vermelho)'}">${brl(t.saldo)}</b></div></div>
    </div>
    <div class="card"><h3>👥 Prestação por responsável</h3>${resp.length ? `<div class="tabela-wrap"><table><thead><tr><th>Responsável</th><th>Bloquinhos</th><th class="num">Vendidos</th><th class="num">Dinheiro</th><th class="num">PIX</th><th class="num">Entregue</th><th class="num">Pendente entrega</th><th class="num">A receber</th></tr></thead><tbody>${resp.map(({ p, r }) => `<tr><td>${esc(p.nome)}</td><td>${r.bloqs.map((b) => pad3(b.numero)).join(', ')}</td><td class="num">${r.vendidos}</td><td class="num">${brl(r.dinheiro)}</td><td class="num">${brl(r.pix)}</td><td class="num">${brl(r.entregue)}</td><td class="num">${brl(r.pendenteEntrega)}</td><td class="num">${brl(r.aReceber)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="dica">Nenhum responsável com bloquinhos.</p>'}</div>
    <div class="card"><h3>🧾 Despesas detalhadas</h3>${t.desp.length ? `<div class="tabela-wrap"><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th class="num">Total</th><th>Comprou</th><th>Pagou</th><th>Situação</th></tr></thead><tbody>${[...t.desp].sort((a, b) => (a.data_compra || '').localeCompare(b.data_compra || '')).map((d) => `<tr><td>${dataBR(d.data_compra)}</td><td>${esc(d.descricao)}</td><td>${esc(d.categoria)}</td><td class="num">${brl(d.valor_total)}</td><td>${esc(d.quem_comprou)}</td><td>${esc(d.quem_pagou)}</td><td>${d.situacao === 'pago' ? 'Pago' : 'Pendente'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="dica">Nenhuma despesa no período.</p>'}</div>`;
}
async function relHistorico() {
  $('#rel-conteudo').innerHTML = '<div class="card vazio">Carregando histórico…</div>';
  const { data, error } = await sb.from('natal_historico').select('*').order('data', { ascending: false }).limit(300);
  if (error) { $('#rel-conteudo').innerHTML = `<div class="erro-box">${esc(msgErro(error))}</div>`; return; }
  const nomeT = { pessoas: 'Pessoa', despesas: 'Despesa', produtos: 'Produto', premios: 'Prêmio', bloquinhos: 'Bloquinho', numeros: 'Número', pagamentos: 'Pagamento', entregas: 'Entrega', receitas: 'Entrada', config: 'Configuração', membros: 'Membro da equipe', convites: 'Convite', grupos: 'Carretinha' };
  const resumo = (h) => {
    const d = h.depois || h.antes || {};
    const base = d.descricao || d.nome || d.pagador || (d.numero ? 'Nº ' + d.numero : '') || '';
    if (h.acao !== 'alteração' || !h.antes || !h.depois) return base;
    const mud = Object.keys(h.depois).filter((k) => !['atualizado_em', 'criado_em'].includes(k) && JSON.stringify(h.depois[k]) !== JSON.stringify(h.antes[k]));
    return base + (mud.length ? ` — ${mud.slice(0, 4).map((k) => `${k}: ${esc(String(h.antes[k] ?? '∅'))} → ${esc(String(h.depois[k] ?? '∅'))}`).join('; ')}` : '');
  };
  $('#rel-conteudo').innerHTML = data.length ? `<div class="tabela-wrap"><table><thead><tr><th>Data e hora</th><th>Usuário</th><th>Ação</th><th>Registro</th><th>Detalhes</th></tr></thead><tbody>${data.map((h) => `<tr><td>${dataHoraBR(h.data)}</td><td>${esc(h.usuario_email || '—')}</td><td><span class="badge ${h.acao === 'exclusão' ? 'b-verm' : h.acao === 'inclusão' ? 'b-verde' : 'b-ouro'}">${h.acao}</span></td><td>${nomeT[h.tabela] || h.tabela}</td><td><small>${resumo(h)}</small></td></tr>`).join('')}</tbody></table></div><p class="dica">Últimas 300 alterações.</p>` : '<div class="card vazio">Nenhuma alteração registrada.</div>';
}

function cabecalhoPdf(doc, titulo) {
  doc.setFillColor(15, 61, 36); doc.rect(0, 0, 210, 26, 'F');
  doc.setFillColor(201, 162, 39); doc.rect(0, 26, 210, 2, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text(`${S.config.nome_evento || 'Carretinha de Natal'} ${S.config.ano}`, 14, 12);
  doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.text(titulo, 14, 20);
  doc.setFontSize(8); doc.text('Gerado em ' + new Date().toLocaleString('pt-BR') + ' por ' + (CLAIMS.email || ''), 196, 20, { align: 'right' });
  doc.setTextColor(28, 42, 34);
}
function tabelaPdf(doc, titulo, head, body, y, cor = [15, 61, 36]) {
  if (y > 250) { doc.addPage(); y = 16; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(titulo, 14, y);
  doc.autoTable({ startY: y + 3, head: [head], body, theme: 'striped', headStyles: { fillColor: cor }, styles: { fontSize: 8.5 }, margin: { left: 14, right: 14 } });
  return doc.lastAutoTable.finalY + 10;
}
window.pdfPrestacao = () => {
  if (!window.jspdf) return toast('Biblioteca de PDF não carregou. Verifique a internet.', true);
  const f = F.relatorios || {};
  const t = totais(f.de || null, f.ate || null);
  const doc = new window.jspdf.jsPDF();
  const per = f.de || f.ate ? `${f.de ? dataBR(f.de) : 'início'} a ${f.ate ? dataBR(f.ate) : 'hoje'}` : 'todo o período';
  cabecalhoPdf(doc, 'Prestação de Contas — ' + per);
  let y = 38;
  y = tabelaPdf(doc, 'TOTAL DE RECEITAS (efetivamente recebidas)', ['Origem', 'Valor'], [['Arrecadação das rifas', brl(t.rifaRecebido)], ['Doações em dinheiro', brl(t.doacoes)], ['Outras entradas', brl(t.outras)], ['TOTAL', brl(t.recebidoTotal)]], y);
  y = tabelaPdf(doc, 'TOTAL DE DESPESAS', ['Categoria', 'Valor'], [...Object.entries(t.porCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => [c, brl(v)]), ['TOTAL', brl(t.despTotal)]], y, [185, 28, 28]);
  y = tabelaPdf(doc, 'RESULTADO', ['Indicador', 'Valor'], [
    ['Total arrecadado (rifas vendidas + entradas)', brl(t.rifaVendido + t.doacoes + t.outras + t.receitasPendentes)],
    ['Total efetivamente recebido', brl(t.recebidoTotal)], ['Total gasto (despesas pagas)', brl(t.despPagas)],
    ['Total pendente de recebimento', brl(t.rifaAberto + t.receitasPendentes)], ['PIX aguardando conferência', brl(t.rifaAguardando)],
    ['Contas a pagar', brl(t.despPend)], ['SALDO FINAL', brl(t.saldo)]], y, [138, 106, 0]);
  const resp = S.pessoas.map((p) => ({ p, r: resumoPessoa(p) })).filter((x) => x.r.bloqs.length || x.r.entregue);
  if (resp.length) y = tabelaPdf(doc, 'PRESTAÇÃO POR RESPONSÁVEL', ['Responsável', 'Bloquinhos', 'Vendidos', 'Dinheiro', 'PIX', 'Entregue', 'Pend. entrega'], resp.map(({ p, r }) => [p.nome, r.bloqs.map((b) => pad3(b.numero)).join(', '), r.vendidos, brl(r.dinheiro), brl(r.pix), brl(r.entregue), brl(r.pendenteEntrega)]), y);
  if (t.desp.length) y = tabelaPdf(doc, 'DESPESAS DETALHADAS', ['Data', 'Descrição', 'Categoria', 'Total', 'Comprou', 'Pagou', 'Situação'], [...t.desp].sort((a, b) => (a.data_compra || '').localeCompare(b.data_compra || '')).map((d) => [dataBR(d.data_compra), d.descricao, d.categoria, brl(d.valor_total), d.quem_comprou || '', d.quem_pagou || '', d.situacao === 'pago' ? 'Pago' : 'Pendente']), y, [185, 28, 28]);
  if (t.pagsConf.length) tabelaPdf(doc, 'RECEBIMENTOS DA RIFA (confirmados)', ['Data', 'Pagador', 'Nº', 'Bloq.', 'Forma', 'Recebido por', 'Valor'], t.pagsConf.map((p) => [dataBR(p.data), p.pagador || '', S.numPorId[p.numero_id]?.numero ?? '', pad3(S.bloqPorId[p.bloquinho_id]?.numero ?? ''), p.forma === 'pix' ? 'PIX' : 'Dinheiro', p.recebido_por || '', brl(p.valor)]), y);
  const pg = doc.getNumberOfPages();
  for (let i = 1; i <= pg; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.text(`Página ${i} de ${pg} · Conecta Finanças — Carretinha de Natal`, 105, 290, { align: 'center' }); }
  doc.save(`prestacao-contas-carretinha-natal-${S.config.ano}.pdf`);
};
function pdfPessoa(p, r, ents) {
  if (!window.jspdf) return toast('Biblioteca de PDF não carregou.', true);
  const doc = new window.jspdf.jsPDF();
  cabecalhoPdf(doc, 'Prestação de contas individual — ' + p.nome);
  let y = 38;
  y = tabelaPdf(doc, 'RESUMO', ['Indicador', 'Valor'], [['Bloquinhos', r.bloqs.map((b) => pad3(b.numero)).join(', ') || '—'], ['Números vendidos', String(r.vendidos)], ['Números pagos', String(r.pagos)], ['Arrecadado em dinheiro', brl(r.dinheiro)], ['Arrecadado via PIX', brl(r.pix)], ['Valor entregue ao caixa', brl(r.entregue)], ['Pendente de entrega', brl(r.pendenteEntrega)], ['Falta receber dos compradores', brl(r.aReceber)]], y);
  const ns = r.nums.filter((n) => n.status !== 'disponivel');
  if (ns.length) y = tabelaPdf(doc, 'NÚMEROS', ['Bloq.', 'Nº', 'Comprador', 'Telefone', 'Valor', 'Pago', 'Situação'], ns.map((n) => [pad3(S.bloqPorId[n.bloquinho_id]?.numero), n.numero, n.comprador_nome || '', n.comprador_telefone || '', brl(n.valor), brl(n.valor_pago), ST_NUM[n.status]]), y);
  if (ents.length) tabelaPdf(doc, 'ENTREGAS AO CAIXA', ['Data', 'Valor', 'Forma', 'Recebido por'], ents.map((e) => [dataBR(e.data), brl(e.valor), e.forma === 'pix' ? 'PIX' : 'Dinheiro', e.recebido_por || '']), y);
  doc.save(`prestacao-${p.nome.replace(/\s+/g, '-').toLowerCase()}.pdf`);
}
window.excelPrestacao = () => {
  if (!window.XLSX) return toast('Biblioteca de Excel não carregou.', true);
  const f = F.relatorios || {};
  const t = totais(f.de || null, f.ate || null);
  const wb = XLSX.utils.book_new();
  const add = (nome, linhas) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas.length ? linhas : [{ Info: 'Sem registros' }]), nome);
  add('Resumo', [
    { Grupo: 'Receitas', Item: 'Arrecadação das rifas (recebida)', Valor: t.rifaRecebido }, { Grupo: 'Receitas', Item: 'Doações em dinheiro', Valor: t.doacoes }, { Grupo: 'Receitas', Item: 'Outras entradas', Valor: t.outras },
    { Grupo: 'Receitas', Item: 'TOTAL RECEBIDO', Valor: t.recebidoTotal },
    ...Object.entries(t.porCat).map(([c, v]) => ({ Grupo: 'Despesas', Item: c, Valor: v })), { Grupo: 'Despesas', Item: 'TOTAL DESPESAS', Valor: t.despTotal },
    { Grupo: 'Resultado', Item: 'Total arrecadado', Valor: t.rifaVendido + t.doacoes + t.outras + t.receitasPendentes }, { Grupo: 'Resultado', Item: 'Total efetivamente recebido', Valor: t.recebidoTotal },
    { Grupo: 'Resultado', Item: 'Total gasto (pago)', Valor: t.despPagas }, { Grupo: 'Resultado', Item: 'Pendente de recebimento', Valor: t.rifaAberto + t.receitasPendentes },
    { Grupo: 'Resultado', Item: 'Contas a pagar', Valor: t.despPend }, { Grupo: 'Resultado', Item: 'SALDO FINAL', Valor: t.saldo },
  ]);
  add('Despesas', t.desp.map((d) => ({ Data: dataBR(d.data_compra), Descrição: d.descricao, Categoria: d.categoria, Produto: d.produto, Quantidade: Number(d.quantidade), 'Valor unitário': Number(d.valor_unitario), 'Valor total': Number(d.valor_total), 'Quem comprou': d.quem_comprou, 'Quem pagou': d.quem_pagou, Forma: d.forma_pagamento, Situação: d.situacao, Observações: d.observacoes })));
  add('Produtos', S.produtos.map((p) => ({ Produto: p.nome, Categoria: p.categoria, Comprado: Number(p.quantidade_comprada), Utilizado: Number(p.quantidade_utilizada), Restante: Number(p.quantidade_restante), Unidade: p.unidade, 'Valor total': Number(p.valor_total), Fornecedor: p.fornecedor, 'Data compra': dataBR(p.data_compra), Responsável: p.responsavel })));
  add('Prêmios', S.premios.map((p) => ({ Ordem: p.ordem_sorteio, Prêmio: p.nome, Descrição: p.descricao, 'Valor estimado': Number(p.valor_estimado), Origem: p.origem, 'Doou/comprou': p.doador_ou_comprador, 'Quem pagou': p.quem_pagou, Data: dataBR(p.data), Situação: p.situacao })));
  add('Bloquinhos', S.bloquinhos.map((b) => { const r = resumoBloq(b); return { Bloquinho: pad3(b.numero), Responsável: b.responsavel_nome, Telefone: b.telefone, Retirada: dataBR(b.data_retirada), Devolução: dataBR(b.data_devolucao), Situação: ST_BLOQ[b.situacao], Vendidos: r.vendidos, Pagos: r.pagos, Recebido: r.recebido, 'Em aberto': r.aberto }; }));
  add('Números', S.numeros.filter((n) => n.status !== 'disponivel').map((n) => ({ Número: n.numero, Bloquinho: pad3(S.bloqPorId[n.bloquinho_id]?.numero), Comprador: n.comprador_nome, Telefone: n.comprador_telefone, Vendedor: n.vendedor, Valor: Number(n.valor), Pago: Number(n.valor_pago), 'Data venda': dataBR(n.data_venda), Forma: n.forma_pagamento, Situação: ST_NUM[n.status] })));
  add('Recebimentos', S.pagamentos.map((p) => ({ Data: dataBR(p.data), Pagador: p.pagador, Número: S.numPorId[p.numero_id]?.numero, Bloquinho: pad3(S.bloqPorId[p.bloquinho_id]?.numero ?? ''), Valor: Number(p.valor), Forma: p.forma, 'Recebido por': p.recebido_por, Situação: p.situacao })));
  add('Doações e entradas', S.receitas.map((r) => ({ Data: dataBR(r.data), Tipo: r.tipo === 'doacao' ? 'Doação' : 'Outra', Descrição: r.descricao, Doador: r.doador, Valor: Number(r.valor), Forma: r.forma, 'Recebido por': r.recebido_por, Situação: r.situacao })));
  add('Responsáveis', S.pessoas.map((p) => { const r = resumoPessoa(p); return { Nome: p.nome, Telefone: p.telefone, Função: p.funcao, Bloquinhos: r.bloqs.map((b) => pad3(b.numero)).join(', '), Vendidos: r.vendidos, Dinheiro: r.dinheiro, PIX: r.pix, Entregue: r.entregue, 'Pendente entrega': r.pendenteEntrega, 'A receber': r.aReceber }; }));
  add('Entregas', S.entregas.map((e) => ({ Data: dataBR(e.data), Responsável: S.pessoaPorId[e.pessoa_id]?.nome, Valor: Number(e.valor), Forma: e.forma, 'Recebido por': e.recebido_por, Observações: e.observacoes })));
  XLSX.writeFile(wb, `carretinha-natal-${S.config.ano}.xlsx`);
};

// ============================================================
// 10. CONFIGURAÇÕES (admin)
// ============================================================
const linkPublico = () => `${location.origin}/rifa.html?c=${S.grupo.slug || ''}`;
function caixaLinkPublico() {
  if (!S.grupo.slug) return '';
  const url = linkPublico();
  const texto = `🎄 ${S.config.nome_evento || 'Carretinha de Natal'} ${S.config.ano} — Rifa Solidária! Escolha seu número (${brl(S.config.valor_numero)} cada) e ajude a Carretinha: ${url}`;
  return `<div class="link-publico"><span>🔗</span><code>${esc(url)}</code>
    <button class="btn peq" onclick="copiarTexto('${esc(url)}')">Copiar link</button>
    <a class="btn peq" href="${esc(url)}" target="_blank" rel="noopener">Abrir</a>
    <a class="btn peq ouro" href="https://wa.me/?text=${encodeURIComponent(texto)}" target="_blank" rel="noopener">Enviar no WhatsApp</a></div>
    ${S.grupo.publico_ativo ? '' : '<p class="erro-box" style="margin-top:8px">A página pública está DESATIVADA. Ative em Configurações → Divulgação.</p>'}`;
}
window.copiarTexto = async (t) => { try { await navigator.clipboard.writeText(t); toast('Link copiado'); } catch (e) { prompt('Copie o link:', t); } };

async function rConfig() {
  const c = S.config, g = S.grupo;
  $('#conteudo').innerHTML = `
    <div class="card"><h3>📣 Link público para divulgar os números</h3>
      <p class="dica" style="margin-bottom:10px">Qualquer pessoa com o link vê os números <b>disponíveis e vendidos</b>, os prêmios, a data do sorteio e a chave PIX, e pode pedir números pelo WhatsApp. <b>Nomes e telefones dos compradores nunca aparecem.</b></p>
      ${caixaLinkPublico()}
    </div>
    <div class="grade2">
      <div class="card"><h3>🎄 Parâmetros da rifa</h3>
        <form class="form" id="form-config"><div class="grade-form">
          ${campoHTML({ k: 'nome_evento', l: 'Nome do evento' }, c.nome_evento)}
          ${campoHTML({ k: 'ano', l: 'Ano / edição', t: 'number' }, c.ano)}
          ${campoHTML({ k: 'numeros_por_bloquinho', l: 'Números por bloquinho', t: 'number' }, c.numeros_por_bloquinho)}
          ${campoHTML({ k: 'valor_numero', l: 'Valor de cada número (R$)', t: 'money' }, c.valor_numero)}
          ${campoHTML({ k: 'estoque_minimo_padrao', l: 'Estoque mínimo padrão (alerta)', t: 'number' }, c.estoque_minimo_padrao)}
          ${campoHTML({ k: 'data_sorteio', l: 'Data do sorteio', t: 'date' }, c.data_sorteio)}
        </div>
        <p class="dica" id="cfg-bloq"></p>
        <div class="erro-box oculto" id="cfg-erro"></div>
        <button class="btn prim" style="align-self:flex-start">Salvar parâmetros</button></form></div>
      <div class="card"><h3>📣 Divulgação</h3>
        <form class="form" id="form-div"><div class="grade-form">
          ${campoHTML({ k: 'nome', l: 'Nome da Carretinha', full: true }, g.nome)}
          ${campoHTML({ k: 'pix_chave', l: 'Chave PIX para pagamento' }, g.pix_chave)}
          ${campoHTML({ k: 'pix_nome', l: 'Nome do recebedor do PIX' }, g.pix_nome)}
          ${campoHTML({ k: 'whatsapp', l: 'WhatsApp para pedidos', t: 'tel', dica: 'Com DDD. Ex.: 44 99999-9999' }, g.whatsapp)}
          ${campoHTML({ k: 'publico_ativo', l: 'Página pública', t: 'select', op: [['true', 'Ativa'], ['false', 'Desativada']] }, String(g.publico_ativo))}
          ${campoHTML({ k: 'mostrar_iniciais', l: 'Nos números vendidos, mostrar', t: 'select', op: [['false', 'Só “vendido”'], ['true', 'Inicial do comprador (ex.: M.)']] }, String(g.mostrar_iniciais))}
          ${campoHTML({ k: 'mensagem_publica', l: 'Mensagem na página pública', t: 'textarea', full: true }, g.mensagem_publica)}
        </div><div class="erro-box oculto" id="div-erro"></div>
        <button class="btn prim" style="align-self:flex-start">Salvar divulgação</button></form></div>
    </div>
    <div class="card"><h3>📥 Importar planilha da Carretinha (Excel)</h3>
      <p class="dica">Envie a planilha <b>CARRETINHA DE NATAL.xlsx</b> (abas CARRETINHA, PESSOAL, BALAS, SORTEIO RIFA, CONTA PIX e ACERTO). O sistema preenche tudo automaticamente. Pode importar de novo depois de atualizar a planilha: <b>só entra o que é novo</b>, nada é duplicado nem apagado.</p>
      <div class="filtros" style="margin-top:10px"><input type="file" id="imp-arquivo" accept=".xlsx,.xls"><button class="btn ouro" id="imp-analisar">Analisar planilha</button></div>
      <div id="imp-resultado"></div>
    </div>
    <div class="card"><h3>👥 Equipe com acesso ao sistema</h3>
      <ul class="dica" style="margin:0 0 12px;padding-left:18px">
        <li><b>Administrador geral</b> — tudo, inclusive configurações, convites e link público.</li>
        <li><b>Financeiro</b> — despesas, compras, prêmios, rifas, recebimentos e conferência de PIX.</li>
        <li><b>Responsável por bloquinhos</b> — bloquinhos, números e registro de pagamentos (PIX fica aguardando conferência).</li>
        <li><b>Consulta</b> — apenas visualiza.</li></ul>
      <div id="membros-lista"><p class="dica">Carregando…</p></div>
      <div class="secao-titulo">Convidar pessoa</div>
      <form class="filtros" id="form-convite">
        <input type="email" id="cv-email" placeholder="E-mail da pessoa" required style="min-width:220px;flex:1">
        <input id="cv-nome" placeholder="Nome (opcional)">
        <select id="cv-papel">${Object.entries(PAPEIS).map(([k, v]) => `<option value="${k}"${k === 'bloquinhos' ? ' selected' : ''}>${v}</option>`).join('')}</select>
        <button class="btn prim">Enviar convite</button></form>
      <p class="dica" style="margin-top:6px">A pessoa cria a conta (ou entra) em <b>${esc(location.origin)}/carretinha.html</b> com esse mesmo e-mail e já cai na Carretinha com o papel escolhido.</p>
      <div id="convites-lista"></div>
    </div>`;
  $('#imp-analisar').onclick = analisarPlanilha;
  const fc = $('#form-config');
  const atBloq = () => { $('#cfg-bloq').innerHTML = `Valor de cada bloquinho: <b>${brl(num(fc.elements.numeros_por_bloquinho.value) * num(fc.elements.valor_numero.value))}</b>. Alterações valem para os próximos bloquinhos gerados.`; };
  fc.elements.numeros_por_bloquinho.oninput = atBloq; fc.elements.valor_numero.oninput = atBloq; atBloq();
  fc.onsubmit = async (e) => {
    e.preventDefault();
    const d = { nome_evento: fc.elements.nome_evento.value.trim() || 'Carretinha de Natal', ano: Math.round(num(fc.elements.ano.value)) || new Date().getFullYear(),
      numeros_por_bloquinho: Math.round(num(fc.elements.numeros_por_bloquinho.value)) || 20, valor_numero: num(fc.elements.valor_numero.value) || 6.25,
      estoque_minimo_padrao: Math.round(num(fc.elements.estoque_minimo_padrao.value)) || 0, data_sorteio: fc.elements.data_sorteio.value || null };
    const { error } = await sb.from('natal_config').upsert({ grupo_id: GRUPO, ...d });
    if (error) { $('#cfg-erro').textContent = msgErro(error); $('#cfg-erro').classList.remove('oculto'); return; }
    await recarregar(false); toast('Parâmetros salvos');
  };
  const fd = $('#form-div');
  fd.onsubmit = async (e) => {
    e.preventDefault();
    const tel = fd.elements.whatsapp.value.replace(/\D/g, '');
    const d = { nome: fd.elements.nome.value.trim() || 'Carretinha de Natal', pix_chave: fd.elements.pix_chave.value.trim() || null, pix_nome: fd.elements.pix_nome.value.trim() || null,
      whatsapp: tel ? (tel.length <= 11 ? '55' + tel : tel) : null, publico_ativo: fd.elements.publico_ativo.value === 'true',
      mostrar_iniciais: fd.elements.mostrar_iniciais.value === 'true', mensagem_publica: fd.elements.mensagem_publica.value.trim() || null };
    const { error } = await sb.from('natal_grupos').update(d).eq('id', GRUPO);
    if (error) { $('#div-erro').textContent = msgErro(error); $('#div-erro').classList.remove('oculto'); return; }
    await recarregar(false); toast('Divulgação salva');
  };
  const [{ data: membros, error: e1 }, { data: convites, error: e2 }] = await Promise.all([
    sb.from('natal_membros').select('*').order('criado_em'),
    sb.from('natal_convites').select('*').order('criado_em'),
  ]);
  if (e1 || e2) { $('#membros-lista').innerHTML = `<div class="erro-box">${esc(msgErro(e1 || e2))}</div>`; return; }
  $('#membros-lista').innerHTML = `<div class="tabela-wrap"><table><thead><tr><th>Pessoa</th><th>Papel</th><th>Situação</th><th></th></tr></thead><tbody>
    ${(membros || []).map((m) => { const eu = m.user_id === CLAIMS.sub; return `<tr><td><b>${esc(m.nome || m.email)}</b>${eu ? ' <span class="badge b-ouro">você</span>' : ''}<br><small class="dica">${esc(m.email || '')}</small></td>
      <td>${eu ? PAPEIS[m.papel] : `<select data-papel="${m.id}" style="width:auto">${Object.entries(PAPEIS).map(([k, v]) => `<option value="${k}"${m.papel === k ? ' selected' : ''}>${v}</option>`).join('')}</select>`}</td>
      <td>${eu ? '<span class="badge b-verde">Ativo</span>' : `<button class="btn peq" data-ativo="${m.id}" data-v="${m.ativo}">${m.ativo ? '<span class="badge b-verde">Ativo</span>' : '<span class="badge b-cinza">Bloqueado</span>'}</button>`}</td>
      <td class="acoes">${eu ? '' : `<button class="btn peq perigo" data-rem="${m.id}">Remover</button>`}</td></tr>`; }).join('')}
    </tbody></table></div>`;
  $('#convites-lista').innerHTML = (convites || []).length ? `<div class="secao-titulo">Convites aguardando a pessoa entrar</div><div class="tabela-wrap"><table><tbody>${convites.map((c2) => `<tr><td>${esc(c2.nome || '')} <small class="dica">${esc(c2.email)}</small></td><td>${PAPEIS[c2.papel]}</td><td class="acoes">
      <a class="btn peq" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`Olá${c2.nome ? ' ' + c2.nome : ''}! Você foi convidado(a) para a equipe da ${S.grupo.nome || 'Carretinha de Natal'}. Crie sua conta com o e-mail ${c2.email} em ${location.origin}/carretinha.html`)}">Avisar no WhatsApp</a>
      <button class="btn peq perigo" data-remconv="${c2.id}">Cancelar</button></td></tr>`).join('')}</tbody></table></div>` : '';
  $('#form-convite').onsubmit = async (e) => {
    e.preventDefault();
    const email = $('#cv-email').value.trim().toLowerCase();
    if ((membros || []).some((m) => (m.email || '').toLowerCase() === email)) return toast('Essa pessoa já faz parte da equipe.', true);
    const { error } = await sb.from('natal_convites').insert({ email, nome: $('#cv-nome').value.trim() || null, papel: $('#cv-papel').value });
    if (error) return toast(msgErro(error), true);
    toast('Convite criado'); rConfig();
  };
  document.querySelectorAll('[data-papel]').forEach((sl) => { sl.onchange = async () => { const { error } = await sb.from('natal_membros').update({ papel: sl.value }).eq('id', sl.dataset.papel); if (error) toast(msgErro(error), true); else toast('Papel atualizado'); }; });
  document.querySelectorAll('[data-ativo]').forEach((bt) => { bt.onclick = async () => { const { error } = await sb.from('natal_membros').update({ ativo: bt.dataset.v !== 'true' }).eq('id', bt.dataset.ativo); if (error) toast(msgErro(error), true); else rConfig(); }; });
  document.querySelectorAll('[data-rem]').forEach((bt) => { bt.onclick = async () => { if (!(await confirmar('Remover esta pessoa da equipe? Ela perde o acesso à Carretinha.', 'Remover'))) return; const { error } = await sb.from('natal_membros').delete().eq('id', bt.dataset.rem); if (error) toast(msgErro(error), true); else { toast('Pessoa removida'); rConfig(); } }; });
  document.querySelectorAll('[data-remconv]').forEach((bt) => { bt.onclick = async () => { const { error } = await sb.from('natal_convites').delete().eq('id', bt.dataset.remconv); if (error) toast(msgErro(error), true); else { toast('Convite cancelado'); rConfig(); } }; });
}

// ---------- Primeiros passos (guia de cadastro para o administrador) ----------
function primeirosPassos() {
  const g = S.grupo, c = S.config;
  const passos = [
    { ok: !S.semConfig, t: 'Conferir os parâmetros da rifa', d: `${c.numeros_por_bloquinho} números por bloquinho · ${brl(c.valor_numero)} por número · sorteio ${c.data_sorteio ? dataBR(c.data_sorteio) : 'sem data'}`, ir: 'config', b: 'Configurar', adm: true },
    { ok: S.pessoas.length > 0, t: 'Cadastrar a equipe (pessoas e responsáveis)', d: 'Quem vai pegar bloquinhos, comprar, pagar e receber', ir: 'pessoas', b: 'Cadastrar pessoas' },
    { ok: S.bloquinhos.length > 0, t: 'Gerar os bloquinhos da rifa', d: 'A numeração é criada automaticamente', ir: 'bloquinhos', b: 'Gerar bloquinhos' },
    { ok: S.bloquinhos.some((b) => b.responsavel_nome), t: 'Entregar bloquinhos aos responsáveis', d: 'Clique no bloquinho e escolha quem retirou', ir: 'bloquinhos', b: 'Atribuir' },
    { ok: S.premios.length > 0, t: 'Cadastrar os prêmios (com foto)', d: 'Eles aparecem no link público', ir: 'premios', b: 'Cadastrar prêmios' },
    { ok: !!(g.pix_chave || g.whatsapp), t: 'Informar PIX e WhatsApp para os pedidos', d: 'Usados na página pública', ir: 'config', b: 'Configurar', adm: true },
    { ok: S.despesas.length > 0 || S.produtos.length > 0, t: 'Lançar despesas e compras', d: 'Balas, saquinhos, combustível, gráfica…', ir: 'despesas', b: 'Lançar despesa' },
    { ok: S.numeros.some((n) => n.status !== 'disponivel'), t: 'Divulgar o link e registrar as vendas', d: 'Copie o link público e envie no WhatsApp; registre cada venda em Rifas', ir: 'rifas', b: 'Abrir rifas' },
  ].filter((p) => !p.adm || PAPEL === 'admin');
  const feitos = passos.filter((p) => p.ok).length;
  if (feitos === passos.length) return '';
  return `<div class="card"><div class="entre"><h3 style="margin:0">🚀 Primeiros passos · ${feitos} de ${passos.length}</h3><div class="barra" style="width:160px"><i style="width:${(feitos / passos.length) * 100}%"></i></div></div>
    <div class="passos" style="margin-top:12px">${passos.map((p, i) => `<div class="passo${p.ok ? ' ok' : ''}"><span class="ck">${p.ok ? '✓' : i + 1}</span><div><b>${p.t}</b><small>${p.d}</small></div>${p.ok ? '' : `<button class="btn peq prim" onclick="irPara('${p.ir}')">${p.b}</button>`}</div>`).join('')}</div></div>`;
}

// ============================================================
// EXTRATO PIX (conferência dos PIX recebidos na conta)
// ============================================================
const ST_EXT = { pendente: 'Sem vínculo', vinculado: 'Vinculado aos números', ignorado: 'Já incluído no acerto' };
const ST_EXT_COR = { pendente: 'b-ouro', vinculado: 'b-verde', ignorado: 'b-cinza' };
F.extrato = { sit: '', vend: '', q: '' };
function montarExtrato() {
  const ex = S.extrato || [];
  const vend = [...new Set(ex.map((x) => normNome(x.vendedor || '')).filter(Boolean))].sort();
  const porVend = {};
  for (const x of ex) { const k = normNome(x.vendedor || '') || '(sem vendedor)'; porVend[k] ||= { v: 0, n: 0, q: 0 }; porVend[k].v += Number(x.valor); porVend[k].n++; porVend[k].q += Number(x.qtd_numeros) || 0; }
  const f = F.extrato;
  return `<div class="kpis" style="margin-top:12px">
      <div class="kpi a"><span>Total no extrato</span><b>${brl(soma(ex.filter((x) => x.situacao !== 'ignorado'), 'valor'))}</b><small>${ex.length} PIX</small></div>
      <div class="kpi o"><span>Sem vínculo</span><b>${brl(soma(ex.filter((x) => x.situacao === 'pendente'), 'valor'))}</b><small>${ex.filter((x) => x.situacao === 'pendente').length} PIX para vincular</small></div>
      <div class="kpi"><span>Vinculados a números</span><b>${brl(soma(ex.filter((x) => x.situacao === 'vinculado'), 'valor'))}</b></div>
      <div class="kpi"><span>Já incluídos no acerto</span><b>${brl(soma(ex.filter((x) => x.situacao === 'ignorado'), 'valor'))}</b></div></div>
    <p class="dica" style="margin:10px 0">O extrato é a lista de PIX que caíram na conta. Para não contar duas vezes, ele <b>não entra no saldo</b> até ser <b>vinculado aos números</b> (o sistema marca os números como vendidos e registra o pagamento) ou marcado como <b>já incluído no acerto</b> de um bloquinho.</p>
    <div class="card" style="margin-bottom:12px"><h3>Por vendedor</h3><div class="cat-cards">${Object.entries(porVend).sort((a, b) => b[1].v - a[1].v).map(([k, v]) => `<div><small>${esc(k)}</small><b>${brl(v.v)}</b><small>${v.n} PIX · ${v.q} números</small></div>`).join('')}</div></div>
    <div class="entre"><div class="filtros">
      <input type="search" id="fe-q" placeholder="Buscar nome…" value="${esc(f.q)}">
      <select id="fe-sit"><option value="">Todas as situações</option>${Object.entries(ST_EXT).map(([k, v]) => `<option value="${k}"${f.sit === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
      <select id="fe-vend"><option value="">Todos os vendedores</option><option value="-"${f.vend === '-' ? ' selected' : ''}>(sem vendedor)</option>${vend.map((v) => `<option${f.vend === v ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>
    </div>${pode('extrato') ? '<button class="btn prim" onclick="formExtrato()">+ Lançar PIX</button>' : ''}</div>
    <div id="ext-lista" style="margin-top:10px"></div>`;
}
function listaExtrato() {
  const f = F.extrato, q = (f.q || '').toLowerCase();
  const qi = $('#fe-q'); if (qi && !qi.oninput) { qi.oninput = (e) => { f.q = e.target.value; listaExtrato(); }; $('#fe-sit').onchange = (e) => { f.sit = e.target.value; listaExtrato(); }; $('#fe-vend').onchange = (e) => { f.vend = e.target.value; listaExtrato(); }; }
  const lista = (S.extrato || []).filter((x) => (!f.sit || x.situacao === f.sit) && (!f.vend || (f.vend === '-' ? !x.vendedor : normNome(x.vendedor || '') === f.vend)) && (!q || x.nome.toLowerCase().includes(q)))
    .sort((a, b) => (a.data || '').localeCompare(b.data || '') || a.criado_em.localeCompare(b.criado_em));
  const box = $('#ext-lista'); if (!box) return;
  box.innerHTML = lista.length ? `<div class="tabela-wrap"><table><thead><tr><th>Data</th><th>Nome</th><th class="num">Valor</th><th class="num">Números</th><th>Vendedor</th><th>Situação</th><th></th></tr></thead><tbody>${lista.map((x) => `<tr>
    <td>${x.data ? dataBR(x.data) : '<span class="badge b-verm">sem data</span>'}</td><td><b>${esc(x.nome)}</b>${x.observacoes ? `<br><small class="dica">${esc(x.observacoes)}</small>` : ''}</td>
    <td class="num">${brl(x.valor)}</td><td class="num">${x.qtd_numeros ?? '—'}${x.numeros_vinculados ? `<br><small class="dica">nº ${esc(x.numeros_vinculados)}</small>` : ''}</td><td>${esc(x.vendedor || '')}</td>
    <td><span class="badge ${ST_EXT_COR[x.situacao]}">${ST_EXT[x.situacao]}</span></td>
    <td class="acoes">${pode('extrato') ? `${x.situacao === 'pendente' ? `<button class="btn peq prim" onclick="vincularExtrato('${x.id}')">Vincular</button> <button class="btn peq" onclick="marcarExtrato('${x.id}','ignorado')" title="O valor já está no acerto de algum bloquinho">Já no acerto</button>` : x.situacao === 'ignorado' ? `<button class="btn peq" onclick="marcarExtrato('${x.id}','pendente')">Desfazer</button>` : ''} <button class="btn peq" onclick="formExtrato(S.extrato.find(e=>e.id==='${x.id}'))">Editar</button>` : ''}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="2">${lista.length} PIX</td><td class="num">${brl(soma(lista, 'valor'))}</td><td class="num">${soma(lista, (x) => x.qtd_numeros || 0)}</td><td colspan="3"></td></tr></tfoot></table></div>` : '<div class="card vazio">Nenhum PIX no extrato. Importe a planilha em Configurações ou lance manualmente.</div>';
}
function formExtrato(x) {
  abrirForm({
    titulo: x ? 'Editar PIX do extrato' : 'Lançar PIX recebido',
    campos: [
      { k: 'data', l: 'Data', t: 'date' },
      { k: 'nome', l: 'Nome de quem pagou', req: true },
      { k: 'valor', l: 'Valor (R$)', t: 'money', req: true },
      { k: 'qtd_numeros', l: 'Quantidade de números', t: 'number' },
      { k: 'vendedor', l: 'Quem vendeu', t: 'datalist', lista: nomesPessoas() },
      { k: 'situacao', l: 'Situação', t: 'select', op: Object.entries(ST_EXT) },
      { k: 'observacoes', l: 'Observações', full: true },
    ],
    valores: x || { data: hoje(), situacao: 'pendente' },
    salvar: (d) => { if (!(d.valor > 0)) throw new Error('Informe o valor.'); d.qtd_numeros = d.qtd_numeros ? Math.round(d.qtd_numeros) : null; return gravar('natal_pix_extrato', x?.id, d); },
    excluir: x && pode('extrato') ? () => apagar('natal_pix_extrato', x.id) : null,
  });
}
window.formExtrato = formExtrato;
window.marcarExtrato = async (id, sit) => { try { await gravar('natal_pix_extrato', id, { situacao: sit }); await recarregar(false); toast('Atualizado'); } catch (e) { toast(msgErro(e), true); } };
function vincularExtrato(id) {
  const x = S.extrato.find((e) => e.id === id);
  const vn = chave(x.vendedor || '');
  const pessoa = S.pessoas.find((p) => chave(p.nome) === vn);
  const livres = (b) => (S.numsPorBloq[b.id] || []).filter((n) => n.status === 'disponivel').length;
  const blocos = S.bloquinhos.filter((b) => livres(b) > 0);
  const sugerido = pessoa ? blocos.find((b) => b.pessoa_id === pessoa.id) : null;
  const qtdPadrao = x.qtd_numeros || Math.max(1, Math.round(x.valor / S.config.valor_numero));
  abrirForm({
    titulo: `Vincular PIX · ${x.nome}`,
    campos: [
      { k: 'bloq', l: 'Bloquinho', t: 'select', req: true, full: true, op: [['', '— escolha —'], ...blocos.map((b) => [b.id, `Bloquinho ${pad3(b.numero)} – ${b.responsavel_nome || 'sem responsável'} (${livres(b)} livres)`])] },
      { k: 'qtd', l: 'Quantidade de números', t: 'number', req: true },
      { k: 'especificos', l: 'Números específicos (opcional)', dica: 'Ex.: 101, 102, 115. Vazio = os primeiros livres do bloquinho.' },
    ],
    valores: { bloq: sugerido?.id || '', qtd: qtdPadrao },
    extra: `<p class="dica">PIX de <b>${brl(x.valor)}</b> em ${x.data ? dataBR(x.data) : 'data não informada'}${x.vendedor ? ` · vendido por <b>${esc(x.vendedor)}</b>` : ''}. Os números ficam no nome de <b>${esc(x.nome)}</b>, com o pagamento via PIX já confirmado.</p>`,
    salvar: async (d) => {
      const b = S.bloqPorId[d.bloq];
      if (!b) throw new Error('Escolha o bloquinho.');
      let nums;
      if (d.especificos) {
        const lista = String(d.especificos).split(/[^0-9]+/).filter(Boolean).map(Number);
        nums = lista.map((k) => S.numeros.find((n) => n.numero === k));
        if (nums.some((n) => !n)) throw new Error('Algum número informado não existe.');
        if (nums.some((n) => n.status !== 'disponivel')) throw new Error('Algum número informado já está vendido.');
      } else {
        const q = Math.round(Number(d.qtd) || 0);
        if (q < 1) throw new Error('Informe a quantidade.');
        nums = (S.numsPorBloq[b.id] || []).filter((n) => n.status === 'disponivel').slice(0, q);
        if (nums.length < q) throw new Error(`O bloquinho só tem ${nums.length} número(s) livre(s).`);
      }
      const ids = nums.map((n) => n.id);
      const valorCada = Math.round((Number(x.valor) / nums.length) * 100) / 100;
      const { error: e1 } = await sb.from('natal_numeros').update({ comprador_nome: x.nome, vendedor: x.vendedor || b.responsavel_nome || null, data_venda: x.data || hoje(), forma_pagamento: 'pix', status: 'vendido' }).in('id', ids);
      if (e1) throw e1;
      const pags = nums.map((n, i) => ({ numero_id: n.id, valor: i === nums.length - 1 ? Math.round((Number(x.valor) - valorCada * (nums.length - 1)) * 100) / 100 : valorCada, forma: 'pix', data: x.data || hoje(), pagador: x.nome, recebido_por: 'Conta PIX', situacao: 'confirmado', observacoes: 'Vinculado do extrato PIX' })).filter((p2) => p2.valor > 0);
      const { error: e2 } = await sb.from('natal_pagamentos').insert(pags);
      if (e2) throw e2;
      await gravar('natal_pix_extrato', x.id, { situacao: 'vinculado', numeros_vinculados: nums.map((n) => n.numero).join(', ') });
    },
  });
}
window.vincularExtrato = vincularExtrato;

// ============================================================
// PROGRAMAÇÃO (agenda) E ESCALA DA EQUIPE
// ============================================================
function rProgramacao() {
  const ag = [...(S.agenda || [])].sort((a, b) => (a.data || '9999').localeCompare(b.data || '9999') || (a.hora || '').localeCompare(b.hora || ''));
  const esc_ = S.escala || [];
  const funcoes = [...new Set(esc_.map((e) => e.funcao))];
  $('#conteudo').innerHTML = `
    <div class="card"><div class="entre"><h3 style="margin:0">🗓️ Programação da Carretinha</h3>${pode('agenda') ? '<button class="btn prim" onclick="formAgenda()">+ Nova data</button>' : ''}</div>
      <p class="dica" style="margin:6px 0 12px">Datas marcadas como públicas aparecem no link de divulgação.</p>
      ${ag.length ? `<div class="tabela-wrap"><table><thead><tr><th>Data</th><th>Hora</th><th>O quê</th><th>Local</th><th>Público</th><th></th></tr></thead><tbody>${ag.map((a) => `<tr>
        <td>${a.data ? `<b>${dataBR(a.data)}</b>` : '<span class="badge b-ouro">a definir</span>'}</td><td>${esc(a.hora || '')}</td><td>${esc(a.titulo)}${a.observacoes ? `<br><small class="dica">${esc(a.observacoes)}</small>` : ''}</td><td>${esc(a.local || '')}</td>
        <td>${a.publico ? '<span class="badge b-verde">sim</span>' : '<span class="badge b-cinza">não</span>'}</td>
        <td class="acoes">${pode('agenda') ? `<button class="btn peq" onclick="formAgenda(S.agenda.find(x=>x.id==='${a.id}'))">Editar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="vazio">Nenhuma data cadastrada.</p>'}
    </div>
    <div class="card"><div class="entre"><h3 style="margin:0">🎅 Escala da equipe</h3>${pode('escala') ? '<button class="btn prim" onclick="formEscala()">+ Adicionar à escala</button>' : ''}</div>
      ${funcoes.length ? `<div class="cat-cards" style="margin-top:12px;grid-template-columns:repeat(auto-fill,minmax(210px,1fr))">${funcoes.map((fn) => `<div><b style="color:var(--verde)">${esc(fn)}</b>
        <ul style="margin:6px 0 0;padding-left:16px">${esc_.filter((e) => e.funcao === fn).sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999)).map((e) => `<li style="margin:2px 0">${pode('escala') ? `<button class="link" style="font-weight:500;color:var(--txt)" onclick="formEscala(S.escala.find(x=>x.id==='${e.id}'))">${esc(e.nome)}</button>` : esc(e.nome)}${e.observacoes ? ` <small class="dica">(${esc(e.observacoes)})</small>` : ''}</li>`).join('')}</ul></div>`).join('')}</div>` : '<p class="vazio">Ninguém na escala ainda.</p>'}
    </div>`;
}
function formAgenda(a) {
  abrirForm({
    titulo: a ? 'Editar data' : 'Nova data na programação',
    campos: [
      { k: 'titulo', l: 'O quê', req: true, full: true },
      { k: 'data', l: 'Data', t: 'date' },
      { k: 'hora', l: 'Hora', dica: 'Ex.: 16h' },
      { k: 'local', l: 'Local' },
      { k: 'publico', l: 'Mostrar no link público', t: 'select', op: [['true', 'Sim'], ['false', 'Não']] },
      { k: 'observacoes', l: 'Observações', t: 'textarea', full: true },
    ],
    valores: a ? { ...a, publico: String(a.publico) } : { publico: 'true' },
    salvar: (d) => { d.publico = d.publico !== 'false'; return gravar('natal_agenda', a?.id, d); },
    excluir: a && pode('agenda') ? () => apagar('natal_agenda', a.id) : null,
  });
}
window.formAgenda = formAgenda;
function formEscala(e) {
  const funcoes = [...new Set((S.escala || []).map((x) => x.funcao))];
  abrirForm({
    titulo: e ? 'Editar escala' : 'Adicionar à escala',
    campos: [
      { k: 'funcao', l: 'Função', req: true, t: 'datalist', lista: funcoes },
      { k: 'nome', l: 'Nome (ou veículo)', req: true },
      { k: 'observacoes', l: 'Observações' },
    ],
    valores: e || {},
    salvar: (d) => gravar('natal_escala', e?.id, d),
    excluir: e && pode('escala') ? () => apagar('natal_escala', e.id) : null,
  });
}
window.formEscala = formEscala;

// ============================================================
// IMPORTAÇÃO DA PLANILHA "CARRETINHA DE NATAL.xlsx"
// ============================================================
const normNome = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const chave = (s) => normNome(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const tituloNome = (s) => normNome(s).toLowerCase().replace(/(^|[\s(/-])(\S)/g, (m, a, b) => a + b.toUpperCase());
const dataISO = (v) => {
  if (v instanceof Date && !isNaN(v)) { if (v.getFullYear() < 2020 || v.getFullYear() > 2100) return null; return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`; }
  return null;
};
const numPlan = (v) => (typeof v === 'number' ? v : num(String(v ?? '').replace(/[^0-9,.-]/g, '')));
let PLANO = null;

async function analisarPlanilha() {
  const out = $('#imp-resultado');
  const file = $('#imp-arquivo').files[0];
  if (!file) return toast('Escolha o arquivo .xlsx da planilha.', true);
  if (!window.XLSX) return toast('Biblioteca de Excel não carregou.', true);
  out.innerHTML = '<p class="dica">Lendo a planilha…</p>';
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    PLANO = lerPlanilha(wb);
    const p = PLANO;
    out.innerHTML = `<div class="ok-box" style="margin-top:12px">Planilha lida. Veja o que será importado:</div>
      <div class="cat-cards" style="margin-top:10px">
        <div><small>Rifa</small><b>${p.blocos.length} bloquinhos</b><small>${p.porBloq} números de ${brl(p.valorNumero)} (${brl(p.porBloq * p.valorNumero)})</small></div>
        <div><small>Responsáveis</small><b>${new Set(p.blocos.map((b) => chave(b.resp))).size} pessoas</b></div>
        <div><small>Acertos (já pagos)</small><b>${p.acertos.length} bloquinhos</b><small>${brl(soma(p.acertos, (a) => a.pix + a.din))}</small></div>
        <div><small>Extrato PIX</small><b>${p.extrato.length} PIX</b><small>${brl(soma(p.extrato, 'valor'))}</small></div>
        <div><small>Prêmios</small><b>${p.premios.length}</b></div>
        <div><small>Compras (balas etc.)</small><b>${p.compras.length}</b><small>${brl(soma(p.compras, 'total'))}</small></div>
        <div><small>Programação</small><b>${p.agenda.length} datas</b><small>sorteio ${p.sorteio ? dataBR(p.sorteio) : '—'}</small></div>
        <div><small>Escala</small><b>${p.escala.length} nomes</b><small>${new Set(p.escala.map((e) => e.funcao)).size} funções</small></div>
      </div>
      ${p.avisos.length ? `<div class="card" style="margin-top:10px;border-color:#efdca0;background:#fffbea"><h3>⚠️ Pontos para conferir na planilha</h3><ul class="dica" style="margin:0;padding-left:18px">${p.avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>` : ''}
      <p class="dica" style="margin-top:10px">Ao importar: os parâmetros passam a ser <b>${p.porBloq} números de ${brl(p.valorNumero)}</b>; os bloquinhos são criados com a numeração da planilha; os bloquinhos do ACERTO ficam com os números vendidos e pagos (PIX/dinheiro) e o dinheiro é registrado como entregue; os PIX da aba CONTA PIX entram no <b>Extrato PIX</b> para você vincular aos números.</p>
      <button class="btn verm" id="imp-confirmar" style="margin-top:8px">📥 Importar agora</button><div id="imp-log" class="dica" style="margin-top:10px;white-space:pre-line"></div>`;
    $('#imp-confirmar').onclick = importarPlano;
  } catch (e) {
    console.error(e);
    out.innerHTML = `<div class="erro-box" style="margin-top:10px">Não consegui ler a planilha: ${esc(e.message)}</div>`;
  }
}

function lerPlanilha(wb) {
  const aba = (nome) => { const k = wb.SheetNames.find((n) => chave(n) === chave(nome)); return k ? XLSX.utils.sheet_to_json(wb.Sheets[k], { header: 1, raw: true, defval: null }) : null; };
  const avisos = [];
  // --- SORTEIO RIFA: prêmios (A-D) e bloquinhos (F-I)
  const sr = aba('SORTEIO RIFA');
  if (!sr) throw new Error('Aba "SORTEIO RIFA" não encontrada.');
  const premios = [], blocosRaw = [];
  sr.forEach((r) => {
    if (r[0] && String(r[0]).trim()) premios.push({ nome: tituloNome(r[0]), doador: r[1] ? tituloNome(r[1]) : null, valor: typeof r[3] === 'number' ? r[3] : null });
    if (r[6] && r[7]) blocosRaw.push({ linha: r[5], resp: normNome(r[6]), faixa: String(r[7]), valor: numPlan(r[8]) });
  });
  const tamanhos = {};
  const parse = (txt) => { const m = String(txt).match(/(\d+)\s*-\s*(\d+)/); return m ? [Number(m[1]), Number(m[2])] : null; };
  blocosRaw.forEach((b) => { const f = parse(b.faixa); if (f && f[1] > f[0] && f[1] - f[0] < 200) { const t = f[1] - f[0] + 1; tamanhos[t] = (tamanhos[t] || 0) + 1; } });
  const porBloq = Number(Object.entries(tamanhos).sort((a, b) => b[1] - a[1])[0]?.[0] || 25);
  const valorBloq = Object.entries(blocosRaw.reduce((m, b) => { if (b.valor) m[b.valor] = (m[b.valor] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1])[0]?.[0];
  const valorNumero = Math.round((Number(valorBloq || 125) / porBloq) * 100) / 100;
  const blocos = [];
  const usados = {};
  for (const b of blocosRaw) {
    const f = parse(b.faixa);
    if (!f) { avisos.push(`SORTEIO RIFA: faixa "${b.faixa}" de ${b.resp} não reconhecida — ignorada.`); continue; }
    let [ini, fim] = f;
    if (fim - ini + 1 !== porBloq) { avisos.push(`SORTEIO RIFA: faixa "${b.faixa}" (${b.resp}) corrigida para ${String(ini).padStart(4, '0')} - ${String(ini + porBloq - 1).padStart(4, '0')}.`); fim = ini + porBloq - 1; }
    if ((ini - 1) % porBloq !== 0) { avisos.push(`SORTEIO RIFA: faixa ${ini}-${fim} (${b.resp}) não começa no início de um bloquinho — ignorada.`); continue; }
    const bloco = (ini - 1) / porBloq + 1;
    if (usados[bloco]) { avisos.push(`SORTEIO RIFA: a faixa ${ini}-${fim} aparece para ${usados[bloco]} e ${b.resp} — mantido ${usados[bloco]}.`); continue; }
    usados[bloco] = b.resp;
    blocos.push({ bloco, ini, fim, resp: b.resp });
  }
  const maxBloco = Math.max(0, ...blocos.map((b) => b.bloco));
  const faltando = []; for (let i = 1; i <= maxBloco; i++) if (!usados[i]) faltando.push(`${String((i - 1) * porBloq + 1).padStart(4, '0')}-${String(i * porBloq).padStart(4, '0')}`);
  if (faltando.length) avisos.push(`Bloquinhos sem responsável na planilha: ${faltando.join(', ')} (serão criados como disponíveis).`);
  // --- ACERTO
  const acertos = [];
  const ac = aba('ACERTO');
  (ac || []).forEach((r) => {
    if (!r[1] || !r[2]) return;
    const f = parse(r[2]); if (!f) return;
    const bloco = (f[0] - 1) / porBloq + 1;
    const pix = numPlan(r[4]) || 0, din = numPlan(r[5]) || 0;
    const resp = normNome(r[1]);
    if (usados[bloco] && chave(usados[bloco]) !== chave(resp)) avisos.push(`Bloquinho ${String(f[0]).padStart(4, '0')}-${String(f[0] + porBloq - 1).padStart(4, '0')}: na aba SORTEIO RIFA está "${usados[bloco]}" e na aba ACERTO está "${resp}" — mantido "${usados[bloco]}" (confira).`);
    if (pix + din > 0) {
      if ((pix % valorNumero) > 0.001 || (din % valorNumero) > 0.001) avisos.push(`ACERTO de ${resp} (${r[2]}): valores não são múltiplos de ${brl(valorNumero)} — registre esse acerto manualmente.`);
      else acertos.push({ bloco, resp: usados[bloco] || resp, pix, din });
    }
  });
  // --- CONTA PIX (extrato)
  const extrato = [];
  const cp = aba('CONTA PIX');
  (cp || []).slice(1).forEach((r, i) => {
    if (!r[1] || typeof r[2] !== 'number') return;
    const data = dataISO(r[0]);
    if (!data) avisos.push(`CONTA PIX linha ${i + 2}: data inválida para ${normNome(r[1])} (${r[0]}) — importado sem data.`);
    const qtd = typeof r[4] === 'number' ? Math.round(r[4]) : null;
    if (qtd && Math.abs(qtd * valorNumero - r[2]) > 0.01) avisos.push(`CONTA PIX: ${normNome(r[1])} pagou ${brl(r[2])} por ${qtd} número(s) (o certo seria ${brl(qtd * valorNumero)}) — confira.`);
    extrato.push({ data, nome: tituloNome(r[1]), valor: r[2], vendedor: r[3] ? tituloNome(r[3]) : null, qtd_numeros: qtd });
  });
  // --- BALAS (compras e composição do saquinho)
  const compras = []; let composicao = [];
  (aba('BALAS') || []).forEach((r) => {
    if (r[0] && typeof r[1] === 'number') composicao.push(`${r[1]} ${String(r[0]).trim().toLowerCase()}`);
    if (r[3] && typeof r[6] === 'number' && !/total/i.test(String(r[5] || ''))) {
      const nomeRaw = String(r[3]).trim().toLowerCase().replace('pirurilo', 'pirulito');
      const qtd = numPlan(String(r[4] || '').split(' ')[0]) || null;
      const unid = String(r[4] || '').replace(/^\s*[\d.,]+\s*/, '').trim() || 'un';
      const unit = numPlan(r[5]) || null;
      compras.push({ nome: tituloNome(nomeRaw), qtd, unid, unit, total: r[6], categoria: /bala/.test(nomeRaw) ? 'Balas' : /chiclet/.test(nomeRaw) ? 'Chicletes' : /pirul/.test(nomeRaw) ? 'Pirulitos' : 'Outros' });
      if (qtd && unit && Math.abs(qtd * unit - r[6]) > 0.5) avisos.push(`BALAS: ${tituloNome(nomeRaw)} — ${qtd} × ${brl(unit)} = ${brl(qtd * unit)}, mas o total na planilha é ${brl(r[6])}. Importado o total da planilha.`);
    }
  });
  // --- CARRETINHA (programação)
  const agenda = []; let sorteio = null;
  (aba('CARRETINHA') || []).forEach((r) => {
    if (!r[0] || !/^\s*data/i.test(String(r[0]))) return;
    const rot = normNome(String(r[0]).replace(/^\s*data\s*/i, ''));
    const data = dataISO(r[1]);
    if (/sorteio/i.test(rot)) { sorteio = data; agenda.push({ titulo: 'Sorteio da Rifa Solidária', data, hora: r[2] ? String(r[2]).trim() : null, local: null }); return; }
    const t = /arrumar/i.test(rot) ? 'Arrumar a Carretinha' : `Carretinha – ${tituloNome(rot)}`;
    agenda.push({ titulo: t, data, hora: r[2] ? String(r[2]).trim() : null, local: /arrumar/i.test(rot) ? null : tituloNome(rot) });
  });
  // --- PESSOAL (escala)
  const escala = [];
  const pe = aba('PESSOAL');
  if (pe && pe.length) {
    const cab = pe[0];
    cab.forEach((fn, c) => {
      if (!fn) return;
      const funcao = /^carro$/i.test(String(fn).trim()) ? 'Veículos' : tituloNome(fn);
      pe.slice(1).forEach((r, i) => { if (r[c] && String(r[c]).trim()) escala.push({ funcao, nome: tituloNome(r[c]), ordem: i + 1 }); });
    });
  }
  return { porBloq, valorNumero, sorteio, blocos, acertos, extrato, premios, compras, composicao: composicao.join(', '), agenda, escala, avisos };
}

async function importarPlano() {
  const p = PLANO; if (!p) return;
  const btn = $('#imp-confirmar'), log = $('#imp-log');
  const L = (t) => { log.textContent += t + '\n'; };
  btn.disabled = true; btn.textContent = 'Importando…'; log.textContent = '';
  try {
    // 0. compatibilidade
    const difer = S.bloquinhos.find((b) => b.quantidade_numeros !== p.porBloq);
    if (difer) throw new Error(`Já existem bloquinhos com ${difer.quantidade_numeros} números. A planilha usa ${p.porBloq}. Exclua os bloquinhos atuais (Controle de Bloquinhos) antes de importar.`);
    // 1. parâmetros
    const { error: ec } = await sb.from('natal_config').upsert({ grupo_id: GRUPO, nome_evento: S.config.nome_evento || 'Carretinha de Natal', ano: p.sorteio ? Number(p.sorteio.slice(0, 4)) : (S.config.ano || new Date().getFullYear()), numeros_por_bloquinho: p.porBloq, valor_numero: p.valorNumero, estoque_minimo_padrao: S.config.estoque_minimo_padrao ?? 10, data_sorteio: p.sorteio || S.config.data_sorteio || null });
    if (ec) throw ec; L(`✔ Parâmetros: ${p.porBloq} números de ${brl(p.valorNumero)}${p.sorteio ? ', sorteio ' + dataBR(p.sorteio) : ''}`);
    await carregar();
    // 2. pessoas
    const nomes = new Map();
    p.blocos.forEach((b) => nomes.set(chave(b.resp), { nome: tituloNome(b.resp), funcao: 'Responsável por bloquinhos' }));
    p.extrato.forEach((x) => { if (x.vendedor && !nomes.has(chave(x.vendedor))) nomes.set(chave(x.vendedor), { nome: x.vendedor, funcao: 'Vendedor(a)' }); });
    const existentes = new Set(S.pessoas.map((x) => chave(x.nome)));
    const novas = [...nomes.entries()].filter(([k]) => !existentes.has(k)).map(([, v]) => ({ ...v, ativo: true, observacoes: 'Importado da planilha' }));
    if (novas.length) { const { error } = await sb.from('natal_pessoas').insert(novas); if (error) throw error; }
    L(`✔ Pessoas: ${novas.length} nova(s)`);
    // 3. bloquinhos
    const maxB = Math.max(0, ...p.blocos.map((b) => b.bloco), ...p.acertos.map((a) => a.bloco));
    const maxAtual = Math.max(0, ...S.bloquinhos.map((b) => b.numero));
    if (maxB > maxAtual) { const { error } = await sb.rpc('natal_gerar_bloquinhos', { p_qtd: maxB - maxAtual }); if (error) throw error; L(`✔ Bloquinhos gerados: ${maxB - maxAtual} (números ${String(maxAtual * p.porBloq + 1).padStart(4, '0')} a ${String(maxB * p.porBloq).padStart(4, '0')})`); }
    await carregar();
    const pessoaPorChave = Object.fromEntries(S.pessoas.map((x) => [chave(x.nome), x]));
    let atrib = 0;
    for (const b of p.blocos) {
      const bl = S.bloquinhos.find((x) => x.numero === b.bloco); if (!bl) continue;
      const pes = pessoaPorChave[chave(b.resp)];
      const vendidosBl = (S.numsPorBloq[bl.id] || []).some((n) => n.status !== 'disponivel');
      if (!bl.responsavel_nome || (chave(bl.responsavel_nome) !== chave(b.resp) && !vendidosBl)) {
        const { error } = await sb.from('natal_bloquinhos').update({ pessoa_id: pes?.id || null, responsavel_nome: tituloNome(b.resp), telefone: pes?.telefone || bl.telefone || null, situacao: bl.situacao === 'disponivel' ? 'entregue' : bl.situacao }).eq('id', bl.id);
        if (error) throw error; atrib++;
      }
    }
    L(`✔ Responsáveis atribuídos: ${atrib} bloquinho(s)`);
    await carregar();
    // 4. acertos
    let nAc = 0;
    for (const a of p.acertos) {
      const bl = S.bloquinhos.find((x) => x.numero === a.bloco); if (!bl) continue;
      if (S.pagamentos.some((pg) => pg.bloquinho_id === bl.id)) continue; // já tem pagamentos: não mexe
      const livres = (S.numsPorBloq[bl.id] || []).filter((n) => n.status === 'disponivel');
      const nPix = Math.round(a.pix / p.valorNumero), nDin = Math.round(a.din / p.valorNumero);
      if (nPix + nDin > livres.length) { L(`⚠ Acerto do bloquinho ${pad3(bl.numero)} maior que os números livres — pulado`); continue; }
      const grupos = [['pix', livres.slice(0, nPix)], ['dinheiro', livres.slice(nPix, nPix + nDin)]];
      for (const [forma, ns] of grupos) {
        if (!ns.length) continue;
        const { error: e1 } = await sb.from('natal_numeros').update({ status: 'vendido', comprador_nome: 'Acerto do bloquinho', vendedor: bl.responsavel_nome, data_venda: hoje(), forma_pagamento: forma, observacoes: 'Vendido no acerto (importado da planilha)' }).in('id', ns.map((n) => n.id));
        if (e1) throw e1;
        const { error: e2 } = await sb.from('natal_pagamentos').insert(ns.map((n) => ({ numero_id: n.id, valor: p.valorNumero, forma, data: hoje(), pagador: 'Acerto do bloquinho', recebido_por: bl.responsavel_nome, situacao: 'confirmado', observacoes: 'Importado do ACERTO da planilha' })));
        if (e2) throw e2;
      }
      if (nPix + nDin === (S.numsPorBloq[bl.id] || []).length) await sb.from('natal_bloquinhos').update({ situacao: 'finalizado' }).eq('id', bl.id);
      if (a.din > 0 && bl.pessoa_id) { const { error } = await sb.from('natal_entregas').insert({ pessoa_id: bl.pessoa_id, valor: a.din, data: hoje(), forma: 'dinheiro', recebido_por: null, observacoes: `Acerto do bloquinho ${pad3(bl.numero)} (importado da planilha)` }); if (error) throw error; }
      nAc++;
    }
    L(`✔ Acertos registrados: ${nAc} bloquinho(s)`);
    // 5. extrato PIX (sem duplicar: compara quantidade de lançamentos iguais)
    const contar = (arr) => arr.reduce((m, x) => { const k = `${x.data || ''}|${chave(x.nome)}|${Number(x.valor).toFixed(2)}`; m[k] = (m[k] || 0) + 1; return m; }, {});
    const jaTem = contar(S.extrato || []); const vistos = {};
    const novosEx = p.extrato.filter((x) => { const k = `${x.data || ''}|${chave(x.nome)}|${Number(x.valor).toFixed(2)}`; vistos[k] = (vistos[k] || 0) + 1; return vistos[k] > (jaTem[k] || 0); }).map((x) => ({ ...x, situacao: 'pendente', observacoes: x.data ? null : 'Data inválida na planilha' }));
    if (novosEx.length) { const { error } = await sb.from('natal_pix_extrato').insert(novosEx); if (error) throw error; }
    L(`✔ Extrato PIX: ${novosEx.length} lançamento(s) novo(s)`);
    // 6. prêmios
    const premEx = new Set(S.premios.map((x) => chave(x.nome)));
    const novosPr = p.premios.filter((x) => !premEx.has(chave(x.nome))).map((x, i) => ({ nome: x.nome, doador_ou_comprador: x.doador, valor_estimado: x.valor || 0, origem: x.valor ? 'comprado' : 'doado', situacao: x.valor ? 'comprado' : 'doado', ordem_sorteio: S.premios.length + i + 1, observacoes: 'Importado da planilha — confira se foi doado ou comprado e o valor.' }));
    if (novosPr.length) { const { error } = await sb.from('natal_premios').insert(novosPr); if (error) throw error; }
    L(`✔ Prêmios: ${novosPr.length} novo(s)`);
    // 7. compras → produtos e despesas
    const prodEx = new Set(S.produtos.map((x) => chave(x.nome)));
    const despEx = new Set(S.despesas.map((x) => chave(x.descricao)));
    const novosProd = p.compras.filter((c) => !prodEx.has(chave(c.nome))).map((c) => ({ nome: c.nome, categoria: c.categoria, quantidade_comprada: c.qtd || 0, quantidade_utilizada: 0, unidade: c.unid, valor_total: c.total, observacoes: p.composicao ? `Por saquinho: ${p.composicao}` : null }));
    const novasDesp = p.compras.filter((c) => !despEx.has(chave(`Compra de ${c.nome}`))).map((c) => ({ descricao: `Compra de ${c.nome}`, categoria: c.categoria, produto: `${c.qtd || ''} ${c.unid}${c.unit ? ` (${brl(c.unit)} cada)` : ''}`.trim(), quantidade: 1, valor_unitario: c.total, data_compra: hoje(), forma_pagamento: 'outro', situacao: 'pendente', observacoes: 'Importado da planilha — confira data, forma de pagamento e marque como pago.' }));
    if (novosProd.length) { const { error } = await sb.from('natal_produtos').insert(novosProd); if (error) throw error; }
    if (novasDesp.length) { const { error } = await sb.from('natal_despesas').insert(novasDesp); if (error) throw error; }
    L(`✔ Compras: ${novosProd.length} produto(s) no estoque e ${novasDesp.length} despesa(s)`);
    // 8. programação e escala
    const agEx = new Set((S.agenda || []).map((x) => chave(x.titulo)));
    const novasAg = p.agenda.filter((a) => !agEx.has(chave(a.titulo))).map((a) => ({ ...a, publico: true }));
    if (novasAg.length) { const { error } = await sb.from('natal_agenda').insert(novasAg); if (error) throw error; }
    const escEx = new Set((S.escala || []).map((x) => chave(x.funcao) + '|' + chave(x.nome)));
    const novasEsc = p.escala.filter((e) => !escEx.has(chave(e.funcao) + '|' + chave(e.nome)));
    if (novasEsc.length) { const { error } = await sb.from('natal_escala').insert(novasEsc); if (error) throw error; }
    L(`✔ Programação: ${novasAg.length} data(s) · Escala: ${novasEsc.length} nome(s)`);
    await recarregar(false);
    L('\n🎄 Importação concluída!');
    toast('Planilha importada');
    btn.textContent = 'Importado ✔';
  } catch (e) {
    console.error(e);
    L('✖ Erro: ' + msgErro(e) + '\nO que já foi importado foi mantido; corrija e importe de novo (não duplica).');
    btn.disabled = false; btn.textContent = '📥 Tentar de novo';
  }
}

iniciar().catch((e) => { console.error(e); $('#sem-acesso-msg').textContent = 'Erro ao iniciar: ' + msgErro(e); mostrarTela('tela-sem-acesso'); });
