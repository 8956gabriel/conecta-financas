-- ============================================================
-- Carretinha de Natal — identidade da página pública (logo, Instagram),
-- galeria de fotos e avisos
-- ============================================================
set search_path to public;

alter table natal_grupos add column if not exists logo_path text;
alter table natal_grupos add column if not exists instagram text;
alter table natal_bloquinhos add column if not exists controle int;

create or replace function public.natal_pode(p_area text) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.natal_papel()
    when 'admin' then true
    when 'financeiro' then p_area in ('despesas','produtos','premios','bloquinhos','numeros','pagamentos','receitas','pessoas','entregas','agenda','escala','extrato','divulgacao')
    when 'bloquinhos' then p_area in ('bloquinhos','numeros','pagamentos','pessoas')
    else false end
$$;

create table if not exists natal_fotos (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null default public.natal_meu_grupo() references public.natal_grupos(id) on delete cascade,
  foto_path text not null,
  legenda text,
  ordem int,
  publico boolean not null default true,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists natal_avisos (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null default public.natal_meu_grupo() references public.natal_grupos(id) on delete cascade,
  titulo text not null,
  texto text,
  foto_path text,
  data date not null default current_date,
  fixado boolean not null default false,
  publico boolean not null default true,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

do $$
declare r record;
begin
  for r in select * from (values ('natal_fotos','divulgacao'), ('natal_avisos','divulgacao')) as x(tabela, area) loop
    execute format('alter table public.%s enable row level security', r.tabela);
    execute format('drop policy if exists %1$s_sel on public.%1$s', r.tabela);
    execute format('drop policy if exists %1$s_ins on public.%1$s', r.tabela);
    execute format('drop policy if exists %1$s_upd on public.%1$s', r.tabela);
    execute format('drop policy if exists %1$s_del on public.%1$s', r.tabela);
    execute format('create policy %1$s_sel on public.%1$s for select to authenticated using (grupo_id = public.natal_meu_grupo() and public.natal_papel() is not null)', r.tabela);
    execute format('create policy %1$s_ins on public.%1$s for insert to authenticated with check (grupo_id = public.natal_meu_grupo() and public.natal_pode(%2$L))', r.tabela, r.area);
    execute format('create policy %1$s_upd on public.%1$s for update to authenticated using (grupo_id = public.natal_meu_grupo() and public.natal_pode(%2$L)) with check (grupo_id = public.natal_meu_grupo())', r.tabela, r.area);
    execute format('create policy %1$s_del on public.%1$s for delete to authenticated using (grupo_id = public.natal_meu_grupo() and public.natal_pode(%2$L))', r.tabela, r.area);
    execute format('drop trigger if exists %1$s_log on public.%1$s', r.tabela);
    execute format('create trigger %1$s_log after insert or update or delete on public.%1$s for each row execute function public.natal_log()', r.tabela);
    execute format('drop trigger if exists %1$s_touch on public.%1$s', r.tabela);
    execute format('create trigger %1$s_touch before update on public.%1$s for each row execute function public.natal_touch()', r.tabela);
  end loop;
end $$;
grant select, insert, update, delete on natal_fotos, natal_avisos to authenticated;
revoke all on natal_fotos, natal_avisos from anon;

drop policy if exists natal_grupos_upd on natal_grupos;
create policy natal_grupos_upd on natal_grupos for update to authenticated
  using (id = public.natal_meu_grupo() and public.natal_pode('divulgacao')) with check (id = public.natal_meu_grupo());

-- Uploads públicos (logo, fotos, avisos, prêmios): admin e financeiro
drop policy if exists natal_pub_ins on storage.objects;
create policy natal_pub_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'natal-publico' and (storage.foldername(name))[1] = public.natal_meu_grupo()::text and public.natal_pode('divulgacao'));
drop policy if exists natal_pub_del on storage.objects;
create policy natal_pub_del on storage.objects for delete to authenticated
  using (bucket_id = 'natal-publico' and (storage.foldername(name))[1] = public.natal_meu_grupo()::text and public.natal_pode('divulgacao'));
update storage.buckets set file_size_limit = 10485760 where id = 'natal-publico';

-- Página pública: inclui logo, Instagram, fotos e avisos
create or replace function public.natal_publico(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g natal_grupos%rowtype; c natal_config%rowtype;
begin
  select * into g from natal_grupos where slug = lower(trim(p_slug)) and publico_ativo;
  if not found then return null; end if;
  select * into c from natal_config where grupo_id = g.id;
  return jsonb_build_object(
    'nome', g.nome, 'logo', g.logo_path, 'instagram', g.instagram,
    'evento', coalesce(c.nome_evento, 'Carretinha de Natal'),
    'ano', coalesce(c.ano, extract(year from now())::int),
    'valor_numero', coalesce(c.valor_numero, 6.25),
    'data_sorteio', c.data_sorteio,
    'pix_chave', g.pix_chave, 'pix_nome', g.pix_nome, 'whatsapp', g.whatsapp, 'mensagem', g.mensagem_publica,
    'agenda', coalesce((select jsonb_agg(jsonb_build_object('titulo', a.titulo, 'data', a.data, 'hora', a.hora, 'local', a.local) order by a.data nulls last, a.hora)
                          from natal_agenda a where a.grupo_id = g.id and a.publico), '[]'::jsonb),
    'avisos', coalesce((select jsonb_agg(jsonb_build_object('titulo', v.titulo, 'texto', v.texto, 'foto', v.foto_path, 'data', v.data, 'fixado', v.fixado) order by v.fixado desc, v.data desc, v.criado_em desc)
                          from natal_avisos v where v.grupo_id = g.id and v.publico), '[]'::jsonb),
    'fotos', coalesce((select jsonb_agg(jsonb_build_object('foto', f.foto_path, 'legenda', f.legenda) order by f.ordem nulls last, f.criado_em desc)
                          from natal_fotos f where f.grupo_id = g.id and f.publico), '[]'::jsonb),
    'premios', coalesce((select jsonb_agg(jsonb_build_object('nome', p.nome, 'descricao', p.descricao, 'ordem', p.ordem_sorteio, 'foto', p.foto_path) order by p.ordem_sorteio nulls last, p.criado_em)
                           from natal_premios p where p.grupo_id = g.id), '[]'::jsonb),
    'numeros', coalesce((select jsonb_agg(jsonb_build_array(n.numero, b.numero,
                           case when n.status = 'disponivel' then 'd' when n.status = 'cancelado' then 'c' when n.status = 'reservado' then 'r' else 'v' end,
                           case when g.mostrar_iniciais and n.status not in ('disponivel','cancelado') and n.comprador_nome is not null and n.comprador_nome <> 'Acerto do bloquinho'
                                then upper(left(split_part(trim(n.comprador_nome), ' ', 1), 1)) || '.' end) order by n.numero)
                           from natal_numeros n join natal_bloquinhos b on b.id = n.bloquinho_id where n.grupo_id = g.id), '[]'::jsonb)
  );
end $$;
grant execute on function public.natal_publico(text) to anon, authenticated;

select string_agg(table_name, ', ') as novas from information_schema.tables where table_schema='public' and table_name in ('natal_fotos','natal_avisos');
