-- Planilha 2: planilha separada (entradas, saídas e depósitos) com dados próprios,
-- que não se misturam com os lançamentos do app. A coluna "planilha" permite criar outras no futuro.
create table if not exists public.planilha_itens (
  id uuid primary key default gen_random_uuid(),
  casal_id uuid not null references public.casais(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  planilha text not null default 'planilha2',
  tipo text not null check (tipo in ('entrada','saida','deposito')),
  data date not null default current_date,
  descricao text not null default '',
  categoria_id uuid references public.categorias(id) on delete set null,
  observacao text,
  valor numeric(14,2) not null check (valor > 0),
  created_at timestamptz not null default now()
);
create index if not exists planilha_itens_casal_idx on public.planilha_itens(casal_id, planilha, data);

alter table public.planilha_itens enable row level security;
drop policy if exists planilha_itens_all on public.planilha_itens;
create policy planilha_itens_all on public.planilha_itens for all to authenticated
  using (casal_id = public.meu_casal()) with check (casal_id = public.meu_casal());
grant select, insert, update, delete on public.planilha_itens to authenticated;
revoke all on public.planilha_itens from anon;

select count(*) as itens_planilha2 from public.planilha_itens;
