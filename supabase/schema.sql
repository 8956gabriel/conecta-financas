-- =====================================================================
-- Conecta Finanças — estrutura do banco (schema public)
-- Dados isolados por casal via RLS. Não interfere no schema gestao360.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tabelas ----------
create table if not exists public.casais (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  codigo_convite text not null unique,
  criado_por uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.membros (
  user_id uuid primary key references auth.users(id) on delete cascade,
  casal_id uuid not null references public.casais(id) on delete cascade,
  nome text not null,
  cor text not null default '#6366f1',
  created_at timestamptz not null default now()
);
create index if not exists membros_casal_idx on public.membros(casal_id);

create table if not exists public.contas (
  id uuid primary key default gen_random_uuid(),
  casal_id uuid not null references public.casais(id) on delete cascade,
  dono_id uuid references auth.users(id) on delete set null, -- null = conta do casal
  nome text not null,
  tipo text not null default 'corrente' check (tipo in ('corrente','poupanca','carteira','investimento')),
  saldo_inicial numeric(14,2) not null default 0,
  cor text not null default '#0ea5e9',
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.cartoes (
  id uuid primary key default gen_random_uuid(),
  casal_id uuid not null references public.casais(id) on delete cascade,
  dono_id uuid references auth.users(id) on delete set null,
  nome text not null,
  bandeira text,
  limite numeric(14,2) not null default 0,
  dia_fechamento int not null check (dia_fechamento between 1 and 31),
  dia_vencimento int not null check (dia_vencimento between 1 and 31),
  cor text not null default '#8b5cf6',
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.categorias (
  id uuid primary key default gen_random_uuid(),
  casal_id uuid not null references public.casais(id) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in ('receita','despesa')),
  cor text not null default '#64748b',
  created_at timestamptz not null default now()
);

create table if not exists public.compras (
  id uuid primary key default gen_random_uuid(),
  casal_id uuid not null references public.casais(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  descricao text not null,
  valor_total numeric(14,2) not null check (valor_total > 0),
  parcelas int not null default 1 check (parcelas between 1 and 48),
  data_compra date not null,
  cartao_id uuid references public.cartoes(id) on delete cascade,
  conta_id uuid references public.contas(id) on delete set null,
  categoria_id uuid references public.categorias(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Receitas e despesas (inclui cada parcela de compra)
create table if not exists public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  casal_id uuid not null references public.casais(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, -- responsável
  tipo text not null check (tipo in ('receita','despesa')),
  descricao text not null,
  valor numeric(14,2) not null check (valor > 0),
  data date not null,                      -- data de vencimento / recebimento
  status text not null default 'pendente' check (status in ('pendente','agendado','concluido')),
  categoria_id uuid references public.categorias(id) on delete set null,
  conta_id uuid references public.contas(id) on delete set null,
  cartao_id uuid references public.cartoes(id) on delete cascade,
  fatura_ref date,                         -- 1º dia do mês da fatura (só cartão)
  compra_id uuid references public.compras(id) on delete cascade,
  parcela_num int,
  parcela_total int,
  observacao text,
  created_at timestamptz not null default now()
);
create index if not exists lanc_casal_data_idx on public.lancamentos(casal_id, data);
create index if not exists lanc_cartao_fatura_idx on public.lancamentos(cartao_id, fatura_ref);

create table if not exists public.metas (
  id uuid primary key default gen_random_uuid(),
  casal_id uuid not null references public.casais(id) on delete cascade,
  nome text not null,
  valor_alvo numeric(14,2) not null check (valor_alvo > 0),
  valor_atual numeric(14,2) not null default 0,
  prazo date,
  cor text not null default '#10b981',
  created_at timestamptz not null default now()
);

-- ---------- Função auxiliar: casal do usuário logado ----------
create or replace function public.meu_casal() returns uuid
language sql stable security definer set search_path = public as $$
  select casal_id from public.membros where user_id = auth.uid()
$$;

-- ---------- RLS ----------
alter table public.casais enable row level security;
alter table public.membros enable row level security;
alter table public.contas enable row level security;
alter table public.cartoes enable row level security;
alter table public.categorias enable row level security;
alter table public.compras enable row level security;
alter table public.lancamentos enable row level security;
alter table public.metas enable row level security;

drop policy if exists casais_sel on public.casais;
create policy casais_sel on public.casais for select to authenticated using (id = public.meu_casal());
drop policy if exists casais_upd on public.casais;
create policy casais_upd on public.casais for update to authenticated using (id = public.meu_casal());

drop policy if exists membros_sel on public.membros;
create policy membros_sel on public.membros for select to authenticated using (casal_id = public.meu_casal());
drop policy if exists membros_upd on public.membros;
create policy membros_upd on public.membros for update to authenticated using (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['contas','cartoes','categorias','compras','lancamentos','metas'] loop
    execute format('drop policy if exists %1$s_all on public.%1$s', t);
    execute format('create policy %1$s_all on public.%1$s for all to authenticated
                    using (casal_id = public.meu_casal())
                    with check (casal_id = public.meu_casal())', t);
  end loop;
end $$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.casais, public.membros, public.contas, public.cartoes, public.categorias,
  public.compras, public.lancamentos, public.metas to authenticated;
revoke all on public.casais, public.membros, public.contas, public.cartoes, public.categorias,
  public.compras, public.lancamentos, public.metas from anon;

-- ---------- RPC: criar casal ----------
create or replace function public.criar_casal(p_nome_casal text, p_meu_nome text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_casal uuid; v_codigo text;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if exists (select 1 from membros where user_id = auth.uid()) then
    raise exception 'Você já faz parte de um casal';
  end if;
  loop
    v_codigo := upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6));
    exit when not exists (select 1 from casais where codigo_convite = v_codigo);
  end loop;
  insert into casais(nome, codigo_convite, criado_por) values (p_nome_casal, v_codigo, auth.uid())
    returning id into v_casal;
  insert into membros(user_id, casal_id, nome, cor) values (auth.uid(), v_casal, p_meu_nome, '#6366f1');

  insert into categorias(casal_id, nome, tipo, cor) values
    (v_casal,'Salário','receita','#10b981'),
    (v_casal,'Renda extra','receita','#22c55e'),
    (v_casal,'Outras receitas','receita','#14b8a6'),
    (v_casal,'Moradia','despesa','#f97316'),
    (v_casal,'Mercado','despesa','#eab308'),
    (v_casal,'Alimentação fora','despesa','#f59e0b'),
    (v_casal,'Transporte','despesa','#3b82f6'),
    (v_casal,'Saúde','despesa','#ef4444'),
    (v_casal,'Educação','despesa','#8b5cf6'),
    (v_casal,'Lazer','despesa','#ec4899'),
    (v_casal,'Contas da casa','despesa','#06b6d4'),
    (v_casal,'Compras','despesa','#a855f7'),
    (v_casal,'Outras despesas','despesa','#64748b');

  insert into contas(casal_id, dono_id, nome, tipo, cor) values (v_casal, null, 'Conta do casal', 'corrente', '#0ea5e9');
  return v_casal;
end $$;

-- ---------- RPC: entrar no casal pelo código ----------
create or replace function public.entrar_casal(p_codigo text, p_meu_nome text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_casal uuid;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if exists (select 1 from membros where user_id = auth.uid()) then
    raise exception 'Você já faz parte de um casal';
  end if;
  select id into v_casal from casais where codigo_convite = upper(trim(p_codigo));
  if v_casal is null then raise exception 'Código de convite inválido'; end if;
  if (select count(*) from membros where casal_id = v_casal) >= 2 then
    raise exception 'Este casal já tem dois integrantes';
  end if;
  insert into membros(user_id, casal_id, nome, cor) values (auth.uid(), v_casal, p_meu_nome, '#ec4899');
  return v_casal;
end $$;

-- ---------- Mês da fatura de uma compra ----------
create or replace function public.fatura_da_data(p_data date, p_fech int, p_venc int)
returns date language sql immutable as $$
  select (date_trunc('month', p_data)
          + make_interval(months =>
              (case when extract(day from p_data)::int >= p_fech then 1 else 0 end)
            + (case when p_venc <= p_fech then 1 else 0 end)))::date
$$;

create or replace function public.dia_no_mes(p_mes date, p_dia int)
returns date language sql immutable as $$
  select (date_trunc('month', p_mes)
          + make_interval(days => least(p_dia, extract(day from (date_trunc('month', p_mes) + interval '1 month - 1 day'))::int) - 1))::date
$$;

-- ---------- RPC: registrar compra (à vista ou parcelada) ----------
create or replace function public.criar_compra(
  p_descricao text, p_valor_total numeric, p_parcelas int, p_data date,
  p_cartao_id uuid, p_conta_id uuid, p_categoria_id uuid, p_user_id uuid, p_status text default 'pendente')
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_casal uuid := meu_casal();
  v_compra uuid; v_cartao cartoes%rowtype; v_fatura date; v_base numeric; v_resto numeric; i int;
  v_valor numeric; v_resp uuid := coalesce(p_user_id, auth.uid());
begin
  if v_casal is null then raise exception 'Sem casal'; end if;
  if p_parcelas < 1 then p_parcelas := 1; end if;
  insert into compras(casal_id, user_id, descricao, valor_total, parcelas, data_compra, cartao_id, conta_id, categoria_id)
    values (v_casal, v_resp, p_descricao, p_valor_total, p_parcelas, p_data, p_cartao_id, p_conta_id, p_categoria_id)
    returning id into v_compra;

  v_base := trunc(p_valor_total / p_parcelas, 2);
  v_resto := p_valor_total - v_base * p_parcelas;

  if p_cartao_id is not null then
    select * into v_cartao from cartoes where id = p_cartao_id and casal_id = v_casal;
    if not found then raise exception 'Cartão não encontrado'; end if;
    v_fatura := fatura_da_data(p_data, v_cartao.dia_fechamento, v_cartao.dia_vencimento);
  end if;

  for i in 1..p_parcelas loop
    v_valor := v_base + case when i = 1 then v_resto else 0 end;
    insert into lancamentos(casal_id, user_id, tipo, descricao, valor, data, status, categoria_id,
                            conta_id, cartao_id, fatura_ref, compra_id, parcela_num, parcela_total)
    values (
      v_casal, v_resp, 'despesa',
      p_descricao, v_valor,
      case when p_cartao_id is not null
           then dia_no_mes((v_fatura + make_interval(months => i-1))::date, v_cartao.dia_vencimento)
           else (p_data + make_interval(months => i-1))::date end,
      case when p_cartao_id is not null then 'pendente'
           when p_parcelas = 1 then p_status else 'pendente' end,
      p_categoria_id,
      case when p_cartao_id is not null then null else p_conta_id end,
      p_cartao_id,
      case when p_cartao_id is not null then (v_fatura + make_interval(months => i-1))::date end,
      v_compra, i, p_parcelas);
  end loop;
  return v_compra;
end $$;

-- ---------- RPC: pagar fatura ----------
create or replace function public.pagar_fatura(p_cartao_id uuid, p_fatura date, p_conta_id uuid)
returns int language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  update lancamentos set status = 'concluido', conta_id = p_conta_id
   where casal_id = meu_casal() and cartao_id = p_cartao_id
     and fatura_ref = date_trunc('month', p_fatura)::date and status <> 'concluido';
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function public.meu_casal(), public.criar_casal(text,text), public.entrar_casal(text,text),
  public.criar_compra(text,numeric,int,date,uuid,uuid,uuid,uuid,text),
  public.pagar_fatura(uuid,date,uuid), public.fatura_da_data(date,int,int), public.dia_no_mes(date,int)
  to authenticated;
revoke execute on function public.criar_casal(text,text), public.entrar_casal(text,text) from anon, public;

-- conferência
select table_name from information_schema.tables where table_schema='public' order by 1;
