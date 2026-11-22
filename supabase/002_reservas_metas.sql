-- Reserva de emergência, economias e metas com título + histórico de movimentações
alter table public.metas add column if not exists tipo text not null default 'meta';
alter table public.metas drop constraint if exists metas_tipo_check;
alter table public.metas add constraint metas_tipo_check check (tipo in ('reserva','economia','meta'));
alter table public.metas add column if not exists icone text not null default '🎯';
alter table public.metas add column if not exists descricao text;
alter table public.metas add column if not exists meses_reserva int;
alter table public.metas alter column valor_alvo drop not null;
alter table public.metas drop constraint if exists metas_valor_alvo_check;
alter table public.metas add constraint metas_valor_alvo_check check (valor_alvo is null or valor_alvo > 0);

create table if not exists public.metas_movimentos (
  id uuid primary key default gen_random_uuid(),
  casal_id uuid not null references public.casais(id) on delete cascade,
  meta_id uuid not null references public.metas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  valor numeric(14,2) not null check (valor <> 0),   -- positivo = guardou, negativo = retirou
  data date not null default current_date,
  descricao text,
  created_at timestamptz not null default now()
);
create index if not exists metas_mov_meta_idx on public.metas_movimentos(meta_id, data);
alter table public.metas_movimentos enable row level security;
drop policy if exists metas_movimentos_all on public.metas_movimentos;
create policy metas_movimentos_all on public.metas_movimentos for all to authenticated
  using (casal_id = public.meu_casal()) with check (casal_id = public.meu_casal());
grant select, insert, update, delete on public.metas_movimentos to authenticated;
revoke all on public.metas_movimentos from anon;

-- Guardar / retirar de forma atômica (atualiza o saldo e registra o histórico)
create or replace function public.movimentar_meta(p_meta_id uuid, p_valor numeric, p_descricao text default null, p_data date default current_date)
returns numeric language plpgsql security invoker set search_path = public as $$
declare v_novo numeric;
begin
  if p_valor = 0 then raise exception 'Valor não pode ser zero'; end if;
  update metas set valor_atual = valor_atual + p_valor
   where id = p_meta_id and casal_id = meu_casal()
   returning valor_atual into v_novo;
  if v_novo is null then raise exception 'Meta não encontrada'; end if;
  if v_novo < 0 then raise exception 'Saldo insuficiente para retirar esse valor'; end if;
  insert into metas_movimentos(casal_id, meta_id, user_id, valor, data, descricao)
    values (meu_casal(), p_meta_id, auth.uid(), p_valor, coalesce(p_data, current_date), nullif(trim(p_descricao), ''));
  return v_novo;
end $$;
revoke execute on function public.movimentar_meta(uuid,numeric,text,date) from anon, public;
grant execute on function public.movimentar_meta(uuid,numeric,text,date) to authenticated;

select column_name, data_type, is_nullable from information_schema.columns
 where table_schema='public' and table_name in ('metas','metas_movimentos') order by table_name, ordinal_position;
