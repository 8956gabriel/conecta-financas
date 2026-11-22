-- ============================================================
-- CONECTA FINANÇAS — MÓDULO CARRETINHA DE NATAL
-- Grupo próprio (equipe da Carretinha), separado das finanças do casal.
-- Papéis: admin | financeiro | bloquinhos | consulta. Convites por e-mail.
-- Página pública (rifa.html?c=SLUG) via função natal_publico (sem dados pessoais).
-- ============================================================
set search_path to public;
create extension if not exists pgcrypto;

create table if not exists natal_grupos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique default lower(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 10)),
  publico_ativo boolean not null default true,
  pix_chave text,
  pix_nome text,
  whatsapp text,
  mensagem_publica text,
  mostrar_iniciais boolean not null default false,
  criado_por uuid not null default auth.uid() references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists natal_membros (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references natal_grupos(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  nome text, email text,
  papel text not null check (papel in ('admin','financeiro','bloquinhos','consulta')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create or replace function public.natal_meu_grupo() returns uuid
language sql stable security definer set search_path = public as $$
  select grupo_id from public.natal_membros where user_id = auth.uid() and ativo limit 1
$$;

create or replace function public.natal_papel() returns text
language sql stable security definer set search_path = public as $$
  select papel from public.natal_membros where user_id = auth.uid() and ativo limit 1
$$;

create or replace function public.natal_pode(p_area text) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.natal_papel()
    when 'admin' then true
    when 'financeiro' then p_area in ('despesas','produtos','premios','bloquinhos','numeros','pagamentos','receitas','pessoas','entregas')
    when 'bloquinhos' then p_area in ('bloquinhos','numeros','pagamentos','pessoas')
    else false end
$$;

create table if not exists natal_convites (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null default public.natal_meu_grupo() references natal_grupos(id) on delete cascade,
  email text not null,
  nome text,
  papel text not null default 'consulta' check (papel in ('admin','financeiro','bloquinhos','consulta')),
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  unique (grupo_id, email)
);

alter table natal_grupos enable row level security;
drop policy if exists natal_grupos_sel on natal_grupos;
create policy natal_grupos_sel on natal_grupos for select to authenticated using (id = public.natal_meu_grupo());
drop policy if exists natal_grupos_upd on natal_grupos;
create policy natal_grupos_upd on natal_grupos for update to authenticated using (id = public.natal_meu_grupo() and public.natal_papel() = 'admin') with check (id = public.natal_meu_grupo());

alter table natal_membros enable row level security;
drop policy if exists natal_membros_sel on natal_membros;
create policy natal_membros_sel on natal_membros for select to authenticated using (grupo_id = public.natal_meu_grupo());
drop policy if exists natal_membros_upd on natal_membros;
create policy natal_membros_upd on natal_membros for update to authenticated using (grupo_id = public.natal_meu_grupo() and public.natal_papel() = 'admin') with check (grupo_id = public.natal_meu_grupo());
drop policy if exists natal_membros_del on natal_membros;
create policy natal_membros_del on natal_membros for delete to authenticated using (grupo_id = public.natal_meu_grupo() and public.natal_papel() = 'admin' and user_id <> auth.uid());

alter table natal_convites enable row level security;
drop policy if exists natal_convites_all on natal_convites;
create policy natal_convites_all on natal_convites for all to authenticated using (grupo_id = public.natal_meu_grupo() and public.natal_papel() = 'admin') with check (grupo_id = public.natal_meu_grupo() and public.natal_papel() = 'admin');

grant select, update on natal_grupos to authenticated;
grant select, update, delete on natal_membros to authenticated;
grant select, insert, update, delete on natal_convites to authenticated;
revoke all on natal_grupos, natal_membros, natal_convites from anon;

-- Cria a Carretinha (grupo) e torna quem criou Administrador
create or replace function public.natal_criar_grupo(p_nome text, p_meu_nome text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if exists (select 1 from natal_membros where user_id = auth.uid()) then raise exception 'Você já participa de uma Carretinha'; end if;
  insert into natal_grupos(nome, criado_por) values (coalesce(nullif(trim(p_nome), ''), 'Carretinha de Natal'), auth.uid()) returning id into v;
  insert into natal_membros(grupo_id, user_id, nome, email, papel) values (v, auth.uid(), nullif(trim(p_meu_nome), ''), auth.jwt() ->> 'email', 'admin');
  return v;
end $$;

-- Aceita automaticamente o convite feito para o e-mail do usuário logado
create or replace function public.natal_aceitar_convite(p_meu_nome text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare c natal_convites%rowtype; v_email text := lower(auth.jwt() ->> 'email');
begin
  if auth.uid() is null or v_email is null then return null; end if;
  if exists (select 1 from natal_membros where user_id = auth.uid()) then return (select grupo_id from natal_membros where user_id = auth.uid()); end if;
  select * into c from natal_convites where lower(email) = v_email order by criado_em limit 1;
  if not found then return null; end if;
  insert into natal_membros(grupo_id, user_id, nome, email, papel) values (c.grupo_id, auth.uid(), coalesce(nullif(trim(p_meu_nome), ''), c.nome), v_email, c.papel);
  delete from natal_convites where id = c.id;
  return c.grupo_id;
end $$;

revoke execute on function public.natal_criar_grupo(text,text), public.natal_aceitar_convite(text) from anon, public;
grant execute on function public.natal_criar_grupo(text,text), public.natal_aceitar_convite(text), public.natal_meu_grupo(), public.natal_papel(), public.natal_pode(text) to authenticated;

-- ---------- Configuração ----------
create table if not exists natal_config (
  grupo_id uuid primary key default public.natal_meu_grupo() references public.natal_grupos(id) on delete cascade,
  nome_evento text not null default 'Carretinha de Natal',
  ano int not null default extract(year from now())::int,
  numeros_por_bloquinho int not null default 20 check (numeros_por_bloquinho between 1 and 500),
  valor_numero numeric(12,2) not null default 6.25 check (valor_numero > 0),
  estoque_minimo_padrao int not null default 10,
  data_sorteio date,
  atualizado_em timestamptz not null default now()
);

-- ---------- Pessoas e responsáveis ----------
create table if not exists natal_pessoas (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null default public.natal_meu_grupo() references public.natal_grupos(id) on delete cascade,
  nome text not null,
  telefone text,
  funcao text,
  ativo boolean not null default true,
  observacoes text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ---------- Despesas ----------
create table if not exists natal_despesas (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null default public.natal_meu_grupo() references public.natal_grupos(id) on delete cascade,
  descricao text not null,
  categoria text not null default 'Outros',
  produto text,
  quantidade numeric(12,2) not null default 1 check (quantidade > 0),
  valor_unitario numeric(12,2) not null default 0 check (valor_unitario >= 0),
  valor_total numeric(12,2) generated always as (round(quantidade * valor_unitario, 2)) stored,
  data_compra date not null default current_date,
  quem_comprou text,
  quem_pagou text,
  forma_pagamento text not null default 'dinheiro' check (forma_pagamento in ('dinheiro','pix','cartao','outro')),
  situacao text not null default 'pendente' check (situacao in ('pago','pendente')),
  comprovante_path text,
  observacoes text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ---------- Compras e produtos (estoque simplificado) ----------
create table if not exists natal_produtos (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null default public.natal_meu_grupo() references public.natal_grupos(id) on delete cascade,
  nome text not null,
  categoria text not null default 'Outros',
  quantidade_comprada numeric(12,2) not null default 0 check (quantidade_comprada >= 0),
  quantidade_utilizada numeric(12,2) not null default 0 check (quantidade_utilizada >= 0),
  quantidade_restante numeric(12,2) generated always as (quantidade_comprada - quantidade_utilizada) stored,
  unidade text default 'un',
  valor_total numeric(12,2) not null default 0,
  fornecedor text,
  data_compra date default current_date,
  responsavel text,
  estoque_minimo numeric(12,2),
  observacoes text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ---------- Prêmios ----------
create table if not exists natal_premios (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null default public.natal_meu_grupo() references public.natal_grupos(id) on delete cascade,
  nome text not null,
  descricao text,
  valor_estimado numeric(12,2) not null default 0,
  origem text not null default 'comprado' check (origem in ('doado','comprado')),
  doador_ou_comprador text,
  quem_pagou text,
  data date default current_date,
  situacao text not null default 'pendente' check (situacao in ('doado','comprado','pago','pendente')),
  foto_path text,
  ordem_sorteio int,
  observacoes text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ---------- Bloquinhos ----------
create table if not exists natal_bloquinhos (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null default public.natal_meu_grupo() references public.natal_grupos(id) on delete cascade,
  numero int not null,
  pessoa_id uuid references natal_pessoas(id) on delete set null,
  responsavel_nome text,
  telefone text,
  data_retirada date,
  data_devolucao date,
  quantidade_numeros int not null default 20,
  valor_total numeric(12,2) not null default 125,
  situacao text not null default 'disponivel' check (situacao in ('disponivel','entregue','em_andamento','devolvido','finalizado')),
  observacoes text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (grupo_id, numero)
);

-- ---------- Números da rifa ----------
create table if not exists natal_numeros (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null default public.natal_meu_grupo() references public.natal_grupos(id) on delete cascade,
  bloquinho_id uuid not null references natal_bloquinhos(id) on delete cascade,
  numero int not null,
  comprador_nome text,
  comprador_telefone text,
  vendedor text,
  valor numeric(12,2) not null default 6.25,
  data_venda date,
  forma_pagamento text check (forma_pagamento in ('dinheiro','pix')),
  status text not null default 'disponivel' check (status in ('disponivel','reservado','vendido','pago','pendente','cancelado')),
  valor_pago numeric(12,2) not null default 0,        -- pagamentos confirmados
  valor_aguardando numeric(12,2) not null default 0,  -- PIX aguardando conferência
  observacoes text,
  atualizado_em timestamptz not null default now(),
  unique (grupo_id, numero)
);
create index if not exists natal_numeros_bloq_idx on natal_numeros(bloquinho_id, numero);

-- ---------- Pagamentos / recebimentos da rifa ----------
create table if not exists natal_pagamentos (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null default public.natal_meu_grupo() references public.natal_grupos(id) on delete cascade,
  numero_id uuid references natal_numeros(id) on delete cascade,
  bloquinho_id uuid references natal_bloquinhos(id) on delete cascade,
  pagador text,
  valor numeric(12,2) not null check (valor > 0),
  data date not null default current_date,
  forma text not null default 'dinheiro' check (forma in ('dinheiro','pix')),
  recebido_por text,
  comprovante_path text,
  situacao text not null default 'confirmado' check (situacao in ('confirmado','aguardando')),
  observacoes text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists natal_pag_numero_idx on natal_pagamentos(numero_id);

-- ---------- Entregas de valores dos responsáveis ao caixa ----------
create table if not exists natal_entregas (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null default public.natal_meu_grupo() references public.natal_grupos(id) on delete cascade,
  pessoa_id uuid not null references natal_pessoas(id) on delete cascade,
  valor numeric(12,2) not null check (valor > 0),
  data date not null default current_date,
  forma text not null default 'dinheiro' check (forma in ('dinheiro','pix')),
  recebido_por text,
  observacoes text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);

-- ---------- Outras receitas (doações em dinheiro, outras entradas) ----------
create table if not exists natal_receitas (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null default public.natal_meu_grupo() references public.natal_grupos(id) on delete cascade,
  tipo text not null default 'doacao' check (tipo in ('doacao','outra')),
  descricao text not null,
  doador text,
  valor numeric(12,2) not null check (valor > 0),
  data date not null default current_date,
  forma text not null default 'dinheiro' check (forma in ('dinheiro','pix','outro')),
  recebido_por text,
  situacao text not null default 'recebido' check (situacao in ('recebido','pendente')),
  comprovante_path text,
  observacoes text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ---------- Histórico de alterações ----------
create table if not exists natal_historico (
  id bigint generated always as identity primary key,
  grupo_id uuid,
  tabela text not null,
  acao text not null,
  registro_id text,
  usuario_id uuid default auth.uid(),
  usuario_email text default (auth.jwt() ->> 'email'),
  antes jsonb,
  depois jsonb,
  data timestamptz not null default now()
);
create index if not exists natal_hist_data_idx on natal_historico(grupo_id, data desc);

create or replace function public.natal_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_old jsonb; v_new jsonb;
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  -- evita registrar recálculos automáticos de números (só valor_pago/aguardando/status mudando por gatilho)
  if tg_table_name = 'natal_numeros' and (tg_op = 'INSERT' or (tg_op = 'UPDATE' and pg_trigger_depth() > 1)) then return null; end if;
  insert into public.natal_historico(grupo_id, tabela, acao, registro_id, antes, depois)
  values (coalesce((v_new->>'grupo_id')::uuid, (v_old->>'grupo_id')::uuid, case when tg_table_name = 'natal_grupos' then coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid) end),
          replace(tg_table_name, 'natal_', ''),
          case tg_op when 'INSERT' then 'inclusão' when 'UPDATE' then 'alteração' else 'exclusão' end,
          coalesce(v_new->>'id', v_old->>'id', v_new->>'grupo_id'), v_old, v_new);
  return null;
end $$;

create or replace function public.natal_touch() returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;

-- ---------- Pagamentos: regras e recálculo do número ----------
create or replace function public.natal_pagamento_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.numero_id is not null then
    select bloquinho_id into new.bloquinho_id from natal_numeros where id = new.numero_id;
  end if;
  -- quem só cuida de bloquinhos não confirma PIX: fica aguardando conferência do financeiro
  if new.forma = 'pix' and coalesce(public.natal_papel(), '') not in ('admin','financeiro') then
    if tg_op = 'INSERT' or old.situacao <> 'confirmado' then new.situacao := 'aguardando'; end if;
  end if;
  return new;
end $$;

create or replace function public.natal_recalcular_numero(p_numero uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_pago numeric; v_ag numeric; n record;
begin
  if p_numero is null then return; end if;
  select coalesce(sum(valor) filter (where situacao = 'confirmado'), 0),
         coalesce(sum(valor) filter (where situacao = 'aguardando'), 0)
    into v_pago, v_ag from natal_pagamentos where numero_id = p_numero;
  select * into n from natal_numeros where id = p_numero;
  if not found then return; end if;
  update natal_numeros set
    valor_pago = v_pago, valor_aguardando = v_ag,
    status = case
      when n.status = 'cancelado' then 'cancelado'
      when v_pago >= n.valor then 'pago'
      when v_pago > 0 or v_ag > 0 then 'pendente'
      when n.status = 'pago' then 'vendido'
      else n.status end,
    data_venda = coalesce(n.data_venda, case when v_pago + v_ag > 0 then current_date end)
  where id = p_numero;
end $$;

create or replace function public.natal_pagamento_depois() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') then perform public.natal_recalcular_numero(old.numero_id); end if;
  if tg_op in ('INSERT','UPDATE') then perform public.natal_recalcular_numero(new.numero_id); end if;
  return null;
end $$;

drop trigger if exists natal_pag_antes on natal_pagamentos;
create trigger natal_pag_antes before insert or update on natal_pagamentos for each row execute function public.natal_pagamento_antes();
drop trigger if exists natal_pag_depois on natal_pagamentos;
create trigger natal_pag_depois after insert or update or delete on natal_pagamentos for each row execute function public.natal_pagamento_depois();

-- Quando o valor do número muda, recalcula o status
create or replace function public.natal_numero_antes() returns trigger language plpgsql as $$
begin
  if new.status <> 'cancelado' and new.status <> 'disponivel' and new.status <> 'reservado' then
    if new.valor_pago >= new.valor then new.status := 'pago';
    elsif new.status = 'pago' then new.status := case when new.valor_pago + new.valor_aguardando > 0 then 'pendente' else 'vendido' end;
    end if;
  end if;
  new.atualizado_em := now();
  return new;
end $$;
drop trigger if exists natal_num_antes on natal_numeros;
create trigger natal_num_antes before update on natal_numeros for each row execute function public.natal_numero_antes();

-- ---------- Gatilhos de histórico e atualizado_em ----------
do $$
declare t text;
begin
  foreach t in array array['natal_pessoas','natal_despesas','natal_produtos','natal_premios','natal_bloquinhos','natal_numeros','natal_pagamentos','natal_entregas','natal_receitas','natal_config','natal_membros','natal_convites','natal_grupos'] loop
    execute format('drop trigger if exists %1$s_log on public.%1$s', t);
    execute format('create trigger %1$s_log after insert or update or delete on public.%1$s for each row execute function public.natal_log()', t);
  end loop;
  foreach t in array array['natal_pessoas','natal_despesas','natal_produtos','natal_premios','natal_bloquinhos','natal_pagamentos','natal_receitas','natal_config'] loop
    execute format('drop trigger if exists %1$s_touch on public.%1$s', t);
    execute format('create trigger %1$s_touch before update on public.%1$s for each row execute function public.natal_touch()', t);
  end loop;
end $$;

-- ---------- RLS ----------
do $$
declare r record;
begin
  for r in select * from (values
      ('natal_pessoas','pessoas'), ('natal_despesas','despesas'), ('natal_produtos','produtos'),
      ('natal_premios','premios'), ('natal_bloquinhos','bloquinhos'), ('natal_numeros','numeros'),
      ('natal_pagamentos','pagamentos'), ('natal_entregas','entregas'), ('natal_receitas','receitas')) as x(tabela, area)
  loop
    execute format('alter table public.%s enable row level security', r.tabela);
    execute format('drop policy if exists %1$s_sel on public.%1$s', r.tabela);
    execute format('drop policy if exists %1$s_ins on public.%1$s', r.tabela);
    execute format('drop policy if exists %1$s_upd on public.%1$s', r.tabela);
    execute format('drop policy if exists %1$s_del on public.%1$s', r.tabela);
    execute format('create policy %1$s_sel on public.%1$s for select to authenticated using (grupo_id = public.natal_meu_grupo() and public.natal_papel() is not null)', r.tabela);
    execute format('create policy %1$s_ins on public.%1$s for insert to authenticated with check (grupo_id = public.natal_meu_grupo() and public.natal_pode(%2$L))', r.tabela, r.area);
    execute format('create policy %1$s_upd on public.%1$s for update to authenticated using (grupo_id = public.natal_meu_grupo() and public.natal_pode(%2$L)) with check (grupo_id = public.natal_meu_grupo())', r.tabela, r.area);
    execute format('create policy %1$s_del on public.%1$s for delete to authenticated using (grupo_id = public.natal_meu_grupo() and public.natal_pode(%2$L))', r.tabela, r.area);
  end loop;
end $$;

alter table natal_config enable row level security;
drop policy if exists natal_config_sel on natal_config;
create policy natal_config_sel on natal_config for select to authenticated using (grupo_id = public.natal_meu_grupo() and public.natal_papel() is not null);
drop policy if exists natal_config_all on natal_config;
create policy natal_config_all on natal_config for all to authenticated using (grupo_id = public.natal_meu_grupo() and public.natal_papel() = 'admin') with check (grupo_id = public.natal_meu_grupo() and public.natal_papel() = 'admin');

alter table natal_historico enable row level security;
drop policy if exists natal_hist_sel on natal_historico;
create policy natal_hist_sel on natal_historico for select to authenticated using (grupo_id = public.natal_meu_grupo() and public.natal_papel() in ('admin','financeiro'));

grant usage on schema public to authenticated;
grant select, insert, update, delete on natal_config, natal_pessoas, natal_despesas, natal_produtos, natal_premios,
  natal_bloquinhos, natal_numeros, natal_pagamentos, natal_entregas, natal_receitas to authenticated;
grant select on natal_historico to authenticated;
revoke all on natal_config, natal_pessoas, natal_despesas, natal_produtos, natal_premios,
  natal_bloquinhos, natal_numeros, natal_pagamentos, natal_entregas, natal_receitas, natal_historico from anon;

-- ---------- RPC: gerar bloquinhos com numeração sequencial ----------
create or replace function public.natal_gerar_bloquinhos(p_qtd int)
returns int language plpgsql security definer set search_path = public as $$
declare v_t uuid := public.natal_meu_grupo(); c natal_config%rowtype; v_ini int; i int; b uuid; v_num0 int;
begin
  if not public.natal_pode('bloquinhos') then raise exception 'Sem permissão para gerar bloquinhos'; end if;
  if p_qtd < 1 or p_qtd > 500 then raise exception 'Quantidade deve ser entre 1 e 500'; end if;
  insert into natal_config(grupo_id) values (v_t) on conflict do nothing;
  select * into c from natal_config where grupo_id = v_t;
  select coalesce(max(numero), 0) into v_ini from natal_bloquinhos where grupo_id = v_t;
  select coalesce(max(numero), 0) into v_num0 from natal_numeros where grupo_id = v_t;
  for i in 1..p_qtd loop
    insert into natal_bloquinhos(grupo_id, numero, quantidade_numeros, valor_total)
      values (v_t, v_ini + i, c.numeros_por_bloquinho, c.numeros_por_bloquinho * c.valor_numero)
      returning id into b;
    insert into natal_numeros(grupo_id, bloquinho_id, numero, valor)
      select v_t, b, v_num0 + (i - 1) * c.numeros_por_bloquinho + g.x, c.valor_numero
      from generate_series(1, c.numeros_por_bloquinho) as g(x);
  end loop;
  return p_qtd;
end $$;
revoke execute on function public.natal_gerar_bloquinhos(int) from anon, public;
grant execute on function public.natal_gerar_bloquinhos(int), public.natal_papel(), public.natal_pode(text), public.natal_meu_grupo() to authenticated;

-- ---------- Comprovantes e fotos (Storage privado) ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('natal-comprovantes', 'natal-comprovantes', false, 10485760)
on conflict (id) do nothing;

drop policy if exists natal_arq_sel on storage.objects;
create policy natal_arq_sel on storage.objects for select to authenticated
  using (bucket_id = 'natal-comprovantes' and (storage.foldername(name))[1] = public.natal_meu_grupo()::text and public.natal_papel() is not null);
drop policy if exists natal_arq_ins on storage.objects;
create policy natal_arq_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'natal-comprovantes' and (storage.foldername(name))[1] = public.natal_meu_grupo()::text and public.natal_papel() in ('admin','financeiro','bloquinhos'));
drop policy if exists natal_arq_del on storage.objects;
create policy natal_arq_del on storage.objects for delete to authenticated
  using (bucket_id = 'natal-comprovantes' and (storage.foldername(name))[1] = public.natal_meu_grupo()::text and public.natal_papel() in ('admin','financeiro'));


-- ---------- Fotos dos prêmios (bucket público, para a página de divulgação) ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('natal-publico', 'natal-publico', true, 5242880)
on conflict (id) do nothing;
drop policy if exists natal_pub_ins on storage.objects;
create policy natal_pub_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'natal-publico' and (storage.foldername(name))[1] = public.natal_meu_grupo()::text and public.natal_pode('premios'));
drop policy if exists natal_pub_del on storage.objects;
create policy natal_pub_del on storage.objects for delete to authenticated
  using (bucket_id = 'natal-publico' and (storage.foldername(name))[1] = public.natal_meu_grupo()::text and public.natal_pode('premios'));

-- ---------- Página pública de divulgação (sem nomes, telefones ou valores recebidos) ----------
create or replace function public.natal_publico(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g natal_grupos%rowtype; c natal_config%rowtype;
begin
  select * into g from natal_grupos where slug = lower(trim(p_slug)) and publico_ativo;
  if not found then return null; end if;
  select * into c from natal_config where grupo_id = g.id;
  return jsonb_build_object(
    'nome', g.nome,
    'evento', coalesce(c.nome_evento, 'Carretinha de Natal'),
    'ano', coalesce(c.ano, extract(year from now())::int),
    'valor_numero', coalesce(c.valor_numero, 6.25),
    'data_sorteio', c.data_sorteio,
    'pix_chave', g.pix_chave, 'pix_nome', g.pix_nome, 'whatsapp', g.whatsapp, 'mensagem', g.mensagem_publica,
    'premios', coalesce((select jsonb_agg(jsonb_build_object('nome', p.nome, 'descricao', p.descricao, 'ordem', p.ordem_sorteio, 'foto', p.foto_path) order by p.ordem_sorteio nulls last, p.criado_em)
                           from natal_premios p where p.grupo_id = g.id), '[]'::jsonb),
    'numeros', coalesce((select jsonb_agg(jsonb_build_array(n.numero, b.numero,
                           case when n.status = 'disponivel' then 'd' when n.status = 'cancelado' then 'c' when n.status = 'reservado' then 'r' else 'v' end,
                           case when g.mostrar_iniciais and n.status not in ('disponivel','cancelado') and n.comprador_nome is not null
                                then upper(left(split_part(trim(n.comprador_nome), ' ', 1), 1)) || '.' end) order by n.numero)
                           from natal_numeros n join natal_bloquinhos b on b.id = n.bloquinho_id where n.grupo_id = g.id), '[]'::jsonb)
  );
end $$;
grant execute on function public.natal_publico(text) to anon, authenticated;
select string_agg(table_name, ', ' order by table_name) as tabelas_criadas from information_schema.tables where table_schema = 'public' and table_name like 'natal_%';
