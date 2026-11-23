-- ============================================================
-- Carretinha de Natal — comunicação interna da equipe, financeiro
-- (fixas/variáveis, categorias, dinheiro × PIX) e portal de transparência.
--
-- SÓ ACRESCENTA: colunas novas com valor padrão, tabelas novas e funções.
-- Não apaga, não zera e não duplica nenhum lançamento, bloquinho, número,
-- usuário ou histórico que já existe. Pode ser rodado de novo sem problema.
-- ============================================================
set search_path to public;

-- ---------- 1. Permissão de acesso ao chat (definida pelo administrador) ----------
alter table natal_membros add column if not exists chat boolean not null default true;

create or replace function public.natal_pode_chat() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.natal_membros
                  where user_id = auth.uid() and ativo and (papel = 'admin' or chat))
$$;
grant execute on function public.natal_pode_chat() to authenticated;

-- ---------- 2. Chat interno da equipe ----------
create table if not exists natal_chat (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null default public.natal_meu_grupo() references public.natal_grupos(id) on delete cascade,
  tipo text not null default 'mensagem' check (tipo in ('mensagem','comunicado','decisao')),
  texto text,
  anexo_path text,
  anexo_nome text,
  anexo_tipo text,
  autor_nome text,
  criado_por uuid not null default auth.uid() references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now(),
  editado_em timestamptz,
  check (coalesce(nullif(trim(texto), ''), anexo_path) is not null)
);
create index if not exists natal_chat_data_idx on natal_chat(grupo_id, criado_em desc);

-- O autor e o grupo são sempre definidos pelo banco (ninguém envia em nome de outro)
create or replace function public.natal_chat_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare m natal_membros%rowtype;
begin
  if tg_op = 'INSERT' then
    select * into m from natal_membros where user_id = auth.uid() and ativo limit 1;
    new.criado_por := auth.uid();
    new.grupo_id := m.grupo_id;
    new.autor_nome := coalesce(nullif(trim(m.nome), ''), split_part(m.email, '@', 1), 'Equipe');
    new.criado_em := now();
  else
    new.criado_por := old.criado_por; new.grupo_id := old.grupo_id; new.autor_nome := old.autor_nome; new.criado_em := old.criado_em;
    if new.texto is distinct from old.texto then new.editado_em := now(); end if;
  end if;
  return new;
end $$;
drop trigger if exists natal_chat_antes on natal_chat;
create trigger natal_chat_antes before insert or update on natal_chat for each row execute function public.natal_chat_antes();

alter table natal_chat enable row level security;
drop policy if exists natal_chat_sel on natal_chat;
drop policy if exists natal_chat_ins on natal_chat;
drop policy if exists natal_chat_upd on natal_chat;
drop policy if exists natal_chat_del on natal_chat;
create policy natal_chat_sel on natal_chat for select to authenticated
  using (grupo_id = public.natal_meu_grupo() and public.natal_pode_chat());
create policy natal_chat_ins on natal_chat for insert to authenticated
  with check (public.natal_pode_chat());
create policy natal_chat_upd on natal_chat for update to authenticated
  using (grupo_id = public.natal_meu_grupo() and public.natal_pode_chat() and (criado_por = auth.uid() or public.natal_papel() = 'admin'))
  with check (grupo_id = public.natal_meu_grupo());
create policy natal_chat_del on natal_chat for delete to authenticated
  using (grupo_id = public.natal_meu_grupo() and public.natal_pode_chat() and (criado_por = auth.uid() or public.natal_papel() = 'admin'));
grant select, insert, update, delete on natal_chat to authenticated;
revoke all on natal_chat from anon;

-- Mensagens aparecem na hora para quem está com o chat aberto
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'natal_chat') then
    execute 'alter publication supabase_realtime add table public.natal_chat';
  end if;
end $$;

-- Fotos e comprovantes do chat (pasta GRUPO/chat no bucket privado):
-- qualquer membro com chat pode enviar; a leitura segue a regra do bucket (só a equipe).
drop policy if exists natal_arq_chat_ins on storage.objects;
create policy natal_arq_chat_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'natal-comprovantes' and (storage.foldername(name))[1] = public.natal_meu_grupo()::text
              and (storage.foldername(name))[2] = 'chat' and public.natal_pode_chat());

-- ---------- 3. Financeiro: despesas fixas/variáveis, categorias de entradas ----------
alter table natal_despesas add column if not exists tipo_custo text not null default 'variavel';
alter table natal_despesas drop constraint if exists natal_despesas_tipo_custo_check;
alter table natal_despesas add constraint natal_despesas_tipo_custo_check check (tipo_custo in ('fixa','variavel'));
alter table natal_receitas add column if not exists categoria text;

-- Categorias criadas pela equipe (somam-se às categorias padrão do sistema)
create table if not exists natal_categorias (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null default public.natal_meu_grupo() references public.natal_grupos(id) on delete cascade,
  tipo text not null check (tipo in ('despesa','entrada')),
  nome text not null,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
create unique index if not exists natal_categorias_unico on natal_categorias(grupo_id, tipo, lower(nome));
alter table natal_categorias enable row level security;
drop policy if exists natal_categorias_sel on natal_categorias;
drop policy if exists natal_categorias_all on natal_categorias;
create policy natal_categorias_sel on natal_categorias for select to authenticated
  using (grupo_id = public.natal_meu_grupo() and public.natal_papel() is not null);
create policy natal_categorias_all on natal_categorias for all to authenticated
  using (grupo_id = public.natal_meu_grupo() and (public.natal_pode('despesas') or public.natal_pode('receitas')))
  with check (grupo_id = public.natal_meu_grupo() and (public.natal_pode('despesas') or public.natal_pode('receitas')));
grant select, insert, update, delete on natal_categorias to authenticated;
revoke all on natal_categorias from anon;
drop trigger if exists natal_categorias_log on natal_categorias;
create trigger natal_categorias_log after insert or update or delete on natal_categorias for each row execute function public.natal_log();

-- ---------- 4. Portal de transparência (página pública) ----------
alter table natal_grupos add column if not exists transparencia_ativa boolean not null default true;

-- Somente leitura e sem dados pessoais: nada de telefone, CPF, comprador,
-- comprovante, chave de quem pagou, mensagens internas ou observações.
create or replace function public.natal_transparencia(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g natal_grupos%rowtype; r jsonb;
begin
  select * into g from natal_grupos where slug = lower(trim(p_slug)) and publico_ativo and transparencia_ativa;
  if not found then return null; end if;
  with
  pag as (select data, forma, valor from natal_pagamentos where grupo_id = g.id and situacao = 'confirmado'),
  rec as (select data, forma, valor, descricao,
                 coalesce(nullif(trim(categoria), ''), case tipo when 'doacao' then 'Doação' else 'Outras entradas' end) as categoria
            from natal_receitas where grupo_id = g.id and situacao = 'recebido'),
  desp as (select data_compra as data, forma_pagamento as forma, valor_total as valor, descricao, categoria, tipo_custo, situacao
             from natal_despesas where grupo_id = g.id),
  ent as (select data, 'Rifa — recebimentos do dia'::text as descricao, 'Rifa'::text as categoria, forma, sum(valor) as valor
            from pag group by data, forma
          union all
          select data, descricao, categoria, forma, valor from rec),
  tot as (select
      coalesce((select sum(valor) from ent), 0) as recebido,
      coalesce((select sum(valor) from ent where forma = 'dinheiro'), 0) as din,
      coalesce((select sum(valor) from ent where forma = 'pix'), 0) as pix,
      coalesce((select sum(valor) from pag), 0) as rifa,
      coalesce((select sum(valor) from desp where situacao = 'pago'), 0) as dpagas,
      coalesce((select sum(valor) from desp where situacao = 'pago' and forma = 'dinheiro'), 0) as ddin,
      coalesce((select sum(valor) from desp where situacao = 'pago' and forma = 'pix'), 0) as dpix,
      coalesce((select sum(valor) from desp where situacao = 'pendente'), 0) as dpend),
  bl as (select b.numero, b.controle, b.responsavel_nome, b.valor_total,
      (select min(n.numero) from natal_numeros n where n.bloquinho_id = b.id) as ini,
      (select max(n.numero) from natal_numeros n where n.bloquinho_id = b.id) as fim,
      (select count(*) from natal_numeros n where n.bloquinho_id = b.id and n.status in ('vendido','pago','pendente')) as vendidos,
      coalesce((select sum(p.valor) from natal_pagamentos p where p.bloquinho_id = b.id and p.situacao = 'confirmado' and p.forma = 'pix'), 0) as pix,
      coalesce((select sum(p.valor) from natal_pagamentos p where p.bloquinho_id = b.id and p.situacao = 'confirmado' and p.forma = 'dinheiro'), 0) as din
    from natal_bloquinhos b where b.grupo_id = g.id and nullif(trim(b.responsavel_nome), '') is not null)
  select jsonb_build_object(
    'atualizado_em', now(),
    'totais', (select jsonb_build_object(
        'arrecadado', recebido, 'dinheiro', din, 'pix', pix, 'outros', recebido - din - pix, 'rifa', rifa,
        'despesas', dpagas, 'despesas_pendentes', dpend, 'despesas_dinheiro', ddin, 'despesas_pix', dpix,
        'saldo_dinheiro', din - ddin, 'saldo_pix', pix - dpix, 'saldo', recebido - dpagas) from tot),
    'entradas', coalesce((select jsonb_agg(jsonb_build_object('data', data, 'descricao', descricao, 'categoria', categoria, 'forma', forma, 'valor', valor)
                                           order by data desc nulls last, descricao) from ent), '[]'::jsonb),
    'despesas', coalesce((select jsonb_agg(jsonb_build_object('data', data, 'descricao', descricao, 'categoria', categoria, 'tipo', tipo_custo,
                                                              'forma', forma, 'situacao', situacao, 'valor', valor)
                                           order by data desc nulls last, descricao) from desp), '[]'::jsonb),
    'blocos', coalesce((select jsonb_agg(jsonb_build_object('controle', controle, 'numero', numero, 'ini', ini, 'fim', fim,
                                                            'responsavel', responsavel_nome, 'vendidos', vendidos, 'valor', valor_total,
                                                            'pix', pix, 'dinheiro', din, 'recebido', pix + din,
                                                            'falta', greatest(0, valor_total - pix - din))
                                         order by controle nulls last, numero) from bl), '[]'::jsonb)
  ) into r;
  return r;
end $$;
grant execute on function public.natal_transparencia(text) to anon, authenticated;

select 'ok' as carretinha_006,
  (select count(*) from natal_despesas) as despesas_preservadas,
  (select count(*) from natal_receitas) as entradas_preservadas,
  (select count(*) from natal_pagamentos) as pagamentos_preservados,
  (select count(*) from natal_bloquinhos) as bloquinhos_preservados;
