-- Agendas (Prefeitura, Pessoal, Igreja): compromissos e tarefas em calendário.
-- Cada item é visível só para quem criou (agenda própria de cada pessoa).
create table if not exists public.agenda_itens (
  id uuid primary key default gen_random_uuid(),
  casal_id uuid not null references public.casais(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  agenda text not null check (agenda in ('prefeitura','pessoal','igreja')),
  titulo text not null,
  data date not null,
  hora time,
  hora_fim time,
  categoria text,
  local text,
  observacao text,
  status text not null default 'pendente' check (status in ('pendente','feito','cancelado')),
  created_at timestamptz not null default now()
);
create index if not exists agenda_itens_user_idx on public.agenda_itens(user_id, agenda, data);

alter table public.agenda_itens enable row level security;
drop policy if exists agenda_itens_dono on public.agenda_itens;
create policy agenda_itens_dono on public.agenda_itens for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and casal_id = public.meu_casal());
grant select, insert, update, delete on public.agenda_itens to authenticated;
revoke all on public.agenda_itens from anon;

select count(*) as itens_agenda from public.agenda_itens;
