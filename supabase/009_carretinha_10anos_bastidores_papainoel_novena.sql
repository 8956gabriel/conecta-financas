-- ============================================================
-- Carretinha de Natal — 10 ANOS (retrospectiva 2017→hoje), DEPOIMENTOS
-- DA EQUIPE, BASTIDORES, PAPAI NOEL e NOVENA DE NATAL.
-- Rode depois do 008. Só acrescenta; nada é apagado. Pode ser rodado de novo.
-- ============================================================
set search_path to public;

alter table natal_grupos add column if not exists ano_fundacao int not null default 2017;
alter table natal_grupos add column if not exists papai_noel_msg text;        -- recado-base do Papai Noel (usado na mensagem personalizada)
alter table natal_grupos add column if not exists novena_ativa boolean not null default true;
alter table natal_grupos add column if not exists novena_info text;           -- explicação da novena na página pública

-- ---------- 10 anos: história de cada ano e fotos ----------
create table if not exists natal_anos (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null default public.natal_meu_grupo() references public.natal_grupos(id) on delete cascade,
  ano int not null check (ano between 2000 and 2100),
  titulo text,
  texto text,
  destaque text,                              -- ex.: "300 crianças visitadas · 12 ruas"
  publico boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (grupo_id, ano)
);
create table if not exists natal_memorias (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null default public.natal_meu_grupo() references public.natal_grupos(id) on delete cascade,
  ano int not null check (ano between 2000 and 2100),
  foto_path text not null,
  legenda text,
  ordem int,
  publico boolean not null default true,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists natal_memorias_ano_idx on natal_memorias(grupo_id, ano);

-- ---------- Depoimentos dos integrantes ----------
create table if not exists natal_equipe_depo (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null default public.natal_meu_grupo() references public.natal_grupos(id) on delete cascade,
  nome text not null,
  funcao text,
  desde_ano int,
  texto text not null,
  foto_path text,
  ordem int,
  publico boolean not null default true,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ---------- Bastidores (qualquer integrante posta) ----------
create table if not exists natal_bastidores (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null default public.natal_meu_grupo() references public.natal_grupos(id) on delete cascade,
  foto_path text not null,
  legenda text,
  etapa text,                                 -- ex.: Arrumando as balas, Montando a carretinha
  data date default current_date,
  autor_nome text,
  publico boolean not null default true,
  criado_por uuid not null default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create or replace function public.natal_bastidor_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare m natal_membros%rowtype;
begin
  if tg_op = 'INSERT' then
    select * into m from natal_membros where user_id = auth.uid() and ativo limit 1;
    new.criado_por := auth.uid(); new.grupo_id := m.grupo_id;
    new.autor_nome := coalesce(nullif(trim(new.autor_nome), ''), nullif(trim(m.nome), ''), split_part(m.email, '@', 1));
  else
    new.criado_por := old.criado_por; new.grupo_id := old.grupo_id;
  end if;
  return new;
end $$;
drop trigger if exists natal_bastidor_antes on natal_bastidores;
create trigger natal_bastidor_antes before insert or update on natal_bastidores for each row execute function public.natal_bastidor_antes();

-- ---------- Novena de Natal ----------
create table if not exists natal_novena_noites (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null default public.natal_meu_grupo() references public.natal_grupos(id) on delete cascade,
  noite int,                                  -- 1ª, 2ª ... 9ª noite
  data date,
  hora text,
  tema text,
  familia text,                               -- família anfitriã
  endereco text,
  bairro text,
  mostrar_endereco boolean not null default false,   -- só com autorização da família
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create table if not exists natal_novena_inscricoes (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.natal_grupos(id) on delete cascade,
  familia text not null,
  responsavel text not null,
  telefone text,
  endereco text,
  bairro text,
  pessoas int,
  quer_receber boolean not null default true, -- quer receber a novena em casa (anfitriã)
  datas_preferidas text,
  autoriza_endereco boolean not null default false,
  observacoes text,
  status text not null default 'pendente' check (status in ('pendente','confirmada','recusada')),
  noite_id uuid references natal_novena_noites(id) on delete set null,
  criado_em timestamptz not null default now()
);

create or replace function public.natal_inscrever_novena(p_slug text, p_familia text, p_responsavel text, p_telefone text, p_endereco text,
                                                         p_bairro text, p_pessoas int, p_quer_receber boolean, p_datas text, p_autoriza boolean, p_obs text)
returns text language plpgsql security definer set search_path = public as $$
declare g natal_grupos%rowtype;
begin
  select * into g from natal_grupos where slug = lower(trim(p_slug)) and publico_ativo and novena_ativa;
  if not found then raise exception 'Inscrições da novena fechadas no momento.'; end if;
  if length(trim(coalesce(p_familia, ''))) < 2 or length(trim(coalesce(p_responsavel, ''))) < 2 then raise exception 'Informe a família e o responsável.'; end if;
  if length(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g')) < 10 then raise exception 'Informe um telefone com DDD.'; end if;
  if greatest(length(p_familia), length(p_responsavel), coalesce(length(p_endereco), 0), coalesce(length(p_bairro), 0)) > 160
     or coalesce(length(p_obs), 0) > 800 or coalesce(length(p_datas), 0) > 300 then raise exception 'Texto muito longo.'; end if;
  if (select count(*) from natal_novena_inscricoes where grupo_id = g.id and criado_em > now() - interval '10 minutes') >= 40 then
    raise exception 'Muitas inscrições agora. Tente de novo em alguns minutos.';
  end if;
  insert into natal_novena_inscricoes(grupo_id, familia, responsavel, telefone, endereco, bairro, pessoas, quer_receber, datas_preferidas, autoriza_endereco, observacoes)
  values (g.id, trim(p_familia), trim(p_responsavel), trim(p_telefone), nullif(trim(p_endereco), ''), nullif(trim(p_bairro), ''),
          case when p_pessoas between 1 and 200 then p_pessoas end, coalesce(p_quer_receber, true), nullif(trim(p_datas), ''), coalesce(p_autoriza, false), nullif(trim(p_obs), ''));
  return 'ok';
end $$;
grant execute on function public.natal_inscrever_novena(text, text, text, text, text, text, int, boolean, text, boolean, text) to anon, authenticated;

-- ---------- RLS ----------
do $$
declare r record; t text;
begin
  for r in select * from (values ('natal_anos','divulgacao'), ('natal_memorias','divulgacao'), ('natal_equipe_depo','divulgacao'), ('natal_novena_noites','divulgacao')) as x(tabela, area) loop
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
    execute format('grant select, insert, update, delete on public.%1$s to authenticated', r.tabela);
    execute format('revoke all on public.%1$s from anon', r.tabela);
  end loop;
end $$;

-- bastidores: todo integrante posta; cada um edita/apaga o seu; divulgação modera tudo
alter table natal_bastidores enable row level security;
drop policy if exists natal_bastidores_sel on natal_bastidores;
drop policy if exists natal_bastidores_ins on natal_bastidores;
drop policy if exists natal_bastidores_upd on natal_bastidores;
drop policy if exists natal_bastidores_del on natal_bastidores;
create policy natal_bastidores_sel on natal_bastidores for select to authenticated using (grupo_id = public.natal_meu_grupo() and public.natal_papel() is not null);
create policy natal_bastidores_ins on natal_bastidores for insert to authenticated with check (public.natal_papel() is not null);
create policy natal_bastidores_upd on natal_bastidores for update to authenticated using (grupo_id = public.natal_meu_grupo() and (criado_por = auth.uid() or public.natal_pode('divulgacao'))) with check (grupo_id = public.natal_meu_grupo());
create policy natal_bastidores_del on natal_bastidores for delete to authenticated using (grupo_id = public.natal_meu_grupo() and (criado_por = auth.uid() or public.natal_pode('divulgacao')));
grant select, insert, update, delete on natal_bastidores to authenticated;
revoke all on natal_bastidores from anon;
drop trigger if exists natal_bastidores_log on natal_bastidores;
create trigger natal_bastidores_log after insert or update or delete on natal_bastidores for each row execute function public.natal_log();

-- inscrições da novena: só a equipe lê; divulgação gerencia; envio pela função
alter table natal_novena_inscricoes enable row level security;
drop policy if exists natal_novena_insc_sel on natal_novena_inscricoes;
drop policy if exists natal_novena_insc_upd on natal_novena_inscricoes;
drop policy if exists natal_novena_insc_del on natal_novena_inscricoes;
create policy natal_novena_insc_sel on natal_novena_inscricoes for select to authenticated using (grupo_id = public.natal_meu_grupo() and public.natal_papel() is not null);
create policy natal_novena_insc_upd on natal_novena_inscricoes for update to authenticated using (grupo_id = public.natal_meu_grupo() and public.natal_pode('divulgacao')) with check (grupo_id = public.natal_meu_grupo());
create policy natal_novena_insc_del on natal_novena_inscricoes for delete to authenticated using (grupo_id = public.natal_meu_grupo() and public.natal_pode('divulgacao'));
grant select, update, delete on natal_novena_inscricoes to authenticated;
revoke all on natal_novena_inscricoes from anon;

-- fotos dos bastidores: qualquer integrante envia para a pasta GRUPO/bastidores do bucket público
drop policy if exists natal_pub_bast_ins on storage.objects;
create policy natal_pub_bast_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'natal-publico' and (storage.foldername(name))[1] = public.natal_meu_grupo()::text
              and (storage.foldername(name))[2] = 'bastidores' and public.natal_papel() is not null);
drop policy if exists natal_pub_bast_del on storage.objects;
create policy natal_pub_bast_del on storage.objects for delete to authenticated
  using (bucket_id = 'natal-publico' and (storage.foldername(name))[1] = public.natal_meu_grupo()::text
         and (storage.foldername(name))[2] = 'bastidores' and (owner = auth.uid() or public.natal_pode('divulgacao')));

-- ---------- Página pública: 10 anos, equipe, bastidores, Papai Noel e novena ----------
create or replace function public.natal_publico_mais(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g natal_grupos%rowtype;
begin
  select * into g from natal_grupos where slug = lower(trim(p_slug)) and publico_ativo;
  if not found then return null; end if;
  return jsonb_build_object(
    'fundacao', g.ano_fundacao,
    'papai_noel_msg', g.papai_noel_msg,
    'novena_ativa', g.novena_ativa,
    'novena_info', g.novena_info,
    'anos', coalesce((select jsonb_agg(jsonb_build_object('ano', a.ano, 'titulo', a.titulo, 'texto', a.texto, 'destaque', a.destaque) order by a.ano)
                        from natal_anos a where a.grupo_id = g.id and a.publico), '[]'::jsonb),
    'memorias', coalesce((select jsonb_agg(jsonb_build_object('ano', m.ano, 'foto', m.foto_path, 'legenda', m.legenda) order by m.ano, m.ordem nulls last, m.criado_em)
                        from natal_memorias m where m.grupo_id = g.id and m.publico), '[]'::jsonb),
    'equipe', coalesce((select jsonb_agg(jsonb_build_object('nome', e.nome, 'funcao', e.funcao, 'desde', e.desde_ano, 'texto', e.texto, 'foto', e.foto_path) order by e.ordem nulls last, e.criado_em)
                        from natal_equipe_depo e where e.grupo_id = g.id and e.publico), '[]'::jsonb),
    'bastidores', coalesce((select jsonb_agg(x order by x->>'criado' desc) from (
                        select jsonb_build_object('foto', b.foto_path, 'legenda', b.legenda, 'etapa', b.etapa, 'data', b.data, 'autor', split_part(trim(b.autor_nome), ' ', 1), 'criado', b.criado_em) as x
                          from natal_bastidores b where b.grupo_id = g.id and b.publico order by b.criado_em desc limit 300) q), '[]'::jsonb),
    'novena', coalesce((select jsonb_agg(jsonb_build_object('noite', n.noite, 'data', n.data, 'hora', n.hora, 'tema', n.tema, 'familia', n.familia, 'bairro', n.bairro,
                                                              'endereco', case when n.mostrar_endereco then n.endereco end) order by n.data nulls last, n.noite nulls last)
                        from natal_novena_noites n where n.grupo_id = g.id), '[]'::jsonb)
  );
end $$;
grant execute on function public.natal_publico_mais(text) to anon, authenticated;

select 'ok' as carretinha_009;
