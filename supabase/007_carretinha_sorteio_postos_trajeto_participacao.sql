-- ============================================================
-- Carretinha de Natal — SORTEADOR, POSTOS DE ARRECADAÇÃO, TRAJETO
-- DA CARRETINHA e PARTICIPAÇÃO DA POPULAÇÃO (depoimentos, avaliações,
-- fotos, recados e curtidas).
--
-- SÓ ACRESCENTA: tabelas, colunas e funções novas. Não altera nem apaga
-- rifas, bloquinhos, números, pagamentos, despesas, usuários ou histórico.
-- A página pública atual (natal_publico) continua igual; as novidades
-- públicas vêm de uma função nova (natal_publico_extra).
-- Pode ser rodado de novo sem problema.
-- ============================================================
set search_path to public;

-- ---------- Permissões: nova área "sorteio" (admin e financeiro) ----------
create or replace function public.natal_pode(p_area text) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.natal_papel()
    when 'admin' then true
    when 'financeiro' then p_area in ('despesas','produtos','premios','bloquinhos','numeros','pagamentos','receitas','pessoas','entregas','agenda','escala','extrato','divulgacao','sorteio')
    when 'bloquinhos' then p_area in ('bloquinhos','numeros','pagamentos','pessoas')
    else false end
$$;

alter table natal_grupos add column if not exists participacao_ativa boolean not null default true;  -- formulário "Participe" na página pública
alter table natal_grupos add column if not exists curtidas int not null default 0;

-- ============================================================
-- 1. SORTEIOS
-- ============================================================
create table if not exists natal_sorteios (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null default public.natal_meu_grupo() references public.natal_grupos(id) on delete cascade,
  premio_id uuid references natal_premios(id) on delete set null,
  premio_nome text,
  numero int not null,
  numero_id uuid references natal_numeros(id) on delete set null,
  ganhador_nome text,
  ganhador_telefone text,                    -- só a equipe vê (nunca vai para a página pública)
  vendedor text,                             -- quem vendeu o número
  bloquinho int,
  bloquinho_responsavel text,
  status_numero text,                        -- situação do número no momento do sorteio (pago, pendente...)
  modo text not null default 'sistema' check (modo in ('sistema','manual')),   -- sistema = sorteio aleatório no banco; manual = número tirado no globo
  criterio text not null default 'pagos' check (criterio in ('pagos','vendidos')),
  concorrentes int,                          -- quantos números concorriam
  protocolo text not null default ('CN-' || to_char(now() at time zone 'America/Sao_Paulo', 'YYYYMMDD-HH24MISS') || '-' || upper(substr(md5(random()::text), 1, 5))),
  publico boolean not null default true,     -- mostrar na página pública (só número e primeiro nome)
  observacoes text,
  realizado_por uuid default auth.uid(),
  realizado_em timestamptz not null default now()
);
create unique index if not exists natal_sorteios_premio_uk on natal_sorteios(premio_id) where premio_id is not null;
create index if not exists natal_sorteios_grupo_idx on natal_sorteios(grupo_id, realizado_em);

-- Sorteia (p_numero vazio) ou registra o número tirado no globo (p_numero preenchido).
create or replace function public.natal_sortear(p_premio uuid, p_criterio text default 'pagos', p_numero int default null,
                                                p_excluir_ganhadores boolean default true, p_obs text default null)
returns natal_sorteios language plpgsql security definer set search_path = public as $$
declare v_g uuid := public.natal_meu_grupo(); p natal_premios%rowtype; n record; tot int; s natal_sorteios%rowtype; st text[];
begin
  if not public.natal_pode('sorteio') then raise exception 'Sem permissão para realizar sorteios'; end if;
  if p_criterio not in ('pagos','vendidos') then raise exception 'Critério inválido'; end if;
  st := case when p_criterio = 'pagos' then array['pago'] else array['pago','vendido','pendente'] end;
  if p_premio is not null then
    select * into p from natal_premios where id = p_premio and grupo_id = v_g;
    if not found then raise exception 'Prêmio não encontrado'; end if;
    if exists (select 1 from natal_sorteios where premio_id = p_premio) then raise exception 'Este prêmio já foi sorteado. Para refazer, exclua o resultado anterior.'; end if;
  end if;
  -- números que concorrem
  select count(*) into tot from natal_numeros x
   where x.grupo_id = v_g and x.status = any(st)
     and (not p_excluir_ganhadores or not exists (select 1 from natal_sorteios z where z.grupo_id = v_g and z.numero_id = x.id));
  if p_numero is null then
    if tot = 0 then raise exception 'Nenhum número concorrendo com esse critério.'; end if;
    select x.id, x.numero into n from natal_numeros x
     where x.grupo_id = v_g and x.status = any(st)
       and (not p_excluir_ganhadores or not exists (select 1 from natal_sorteios z where z.grupo_id = v_g and z.numero_id = x.id))
     order by random() limit 1;
  else
    select x.id, x.numero into n from natal_numeros x where x.grupo_id = v_g and x.numero = p_numero;
    if not found then raise exception 'O número % não existe nesta rifa.', p_numero; end if;
  end if;
  select x.*, b.numero as bloq_num, b.responsavel_nome as bloq_resp into n
    from natal_numeros x join natal_bloquinhos b on b.id = x.bloquinho_id where x.id = n.id;
  insert into natal_sorteios(grupo_id, premio_id, premio_nome, numero, numero_id, ganhador_nome, ganhador_telefone, vendedor,
                             bloquinho, bloquinho_responsavel, status_numero, modo, criterio, concorrentes, observacoes)
  values (v_g, p_premio, p.nome, n.numero, n.id, n.comprador_nome, n.comprador_telefone,
          coalesce(nullif(trim(n.vendedor), ''), n.bloq_resp), n.bloq_num, n.bloq_resp, n.status,
          case when p_numero is null then 'sistema' else 'manual' end, p_criterio, tot, nullif(trim(p_obs), ''))
  returning * into s;
  return s;
end $$;
revoke execute on function public.natal_sortear(uuid, text, int, boolean, text) from anon, public;
grant execute on function public.natal_sortear(uuid, text, int, boolean, text) to authenticated;

-- ============================================================
-- 2. POSTOS DE ARRECADAÇÃO
-- ============================================================
create table if not exists natal_postos (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null default public.natal_meu_grupo() references public.natal_grupos(id) on delete cascade,
  nome text not null,
  endereco text,
  referencia text,
  horario text,
  telefone text,
  o_que_recebe text,                         -- ex.: brinquedos, doces, dinheiro
  maps_url text,
  lat double precision,
  lng double precision,
  ordem int,
  publico boolean not null default true,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ============================================================
-- 3. TRAJETOS DA CARRETINHA
-- ============================================================
create table if not exists natal_trajetos (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null default public.natal_meu_grupo() references public.natal_grupos(id) on delete cascade,
  nome text not null,                        -- ex.: "Ivatuba — Centro", "Bairro Refúgio"
  regiao text,
  data date,
  hora_saida text,
  ponto_saida text,
  descricao text,
  cor text not null default '#d62839',
  pontos jsonb not null default '[]'::jsonb, -- [{lat, lng, rua, hora, obs}] na ordem do percurso
  publico boolean not null default true,
  ordem int,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ============================================================
-- 4. PARTICIPAÇÃO DA POPULAÇÃO (moderada pela equipe)
-- ============================================================
create table if not exists natal_interacoes (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.natal_grupos(id) on delete cascade,
  tipo text not null default 'depoimento' check (tipo in ('depoimento','foto','recado')),
  nome text not null,
  bairro text,
  texto text,
  nota smallint check (nota between 1 and 5),
  foto_envio_path text,                      -- foto enviada (bucket privado natal-interacoes)
  foto_publica_path text,                    -- cópia publicada depois de aprovada (bucket natal-publico)
  autoriza_publicar boolean not null default false,
  status text not null default 'pendente' check (status in ('pendente','aprovado','recusado')),
  resposta text,                             -- resposta da equipe (aparece na página)
  moderado_por uuid,
  moderado_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists natal_interacoes_grupo_idx on natal_interacoes(grupo_id, status, criado_em desc);

-- Envio pela página pública (sem login). Tudo entra como "pendente" e só aparece depois de aprovado.
create or replace function public.natal_interagir(p_slug text, p_tipo text, p_nome text, p_bairro text, p_texto text,
                                                  p_nota int, p_foto_path text, p_autoriza boolean)
returns text language plpgsql security definer set search_path = public as $$
declare g natal_grupos%rowtype;
begin
  select * into g from natal_grupos where slug = lower(trim(p_slug)) and publico_ativo and participacao_ativa;
  if not found then raise exception 'Participação indisponível no momento.'; end if;
  if p_tipo not in ('depoimento','foto','recado') then raise exception 'Tipo inválido'; end if;
  if length(trim(coalesce(p_nome, ''))) < 2 then raise exception 'Informe seu nome.'; end if;
  if coalesce(length(p_texto), 0) > 1200 or length(p_nome) > 80 or coalesce(length(p_bairro), 0) > 80 then raise exception 'Texto muito longo.'; end if;
  if nullif(trim(coalesce(p_texto, '')), '') is null and p_foto_path is null and p_nota is null then raise exception 'Escreva uma mensagem, dê uma nota ou envie uma foto.'; end if;
  if p_nota is not null and (p_nota < 1 or p_nota > 5) then raise exception 'Nota inválida.'; end if;
  if p_foto_path is not null and p_foto_path not like g.id::text || '/envios/%' then raise exception 'Foto inválida.'; end if;
  if not coalesce(p_autoriza, false) then raise exception 'É preciso autorizar a publicação.'; end if;
  -- proteção simples contra excesso de envios
  if (select count(*) from natal_interacoes where grupo_id = g.id and criado_em > now() - interval '10 minutes') >= 60 then
    raise exception 'Muitos envios agora. Tente de novo em alguns minutos.';
  end if;
  insert into natal_interacoes(grupo_id, tipo, nome, bairro, texto, nota, foto_envio_path, autoriza_publicar)
  values (g.id, p_tipo, trim(p_nome), nullif(trim(p_bairro), ''), nullif(trim(p_texto), ''), p_nota, p_foto_path, true);
  return 'ok';
end $$;
grant execute on function public.natal_interagir(text, text, text, text, text, int, text, boolean) to anon, authenticated;

-- Curtidas (uma por aparelho, controlada na página)
create or replace function public.natal_curtir(p_slug text) returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  update natal_grupos set curtidas = curtidas + 1 where slug = lower(trim(p_slug)) and publico_ativo returning curtidas into v;
  return v;
end $$;
grant execute on function public.natal_curtir(text) to anon, authenticated;

-- ============================================================
-- RLS, histórico e atualizado_em
-- ============================================================
do $$
declare r record; t text;
begin
  for r in select * from (values ('natal_sorteios','sorteio'), ('natal_postos','divulgacao'), ('natal_trajetos','divulgacao')) as x(tabela, area) loop
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
  end loop;
  foreach t in array array['natal_postos','natal_trajetos'] loop
    execute format('drop trigger if exists %1$s_touch on public.%1$s', t);
    execute format('create trigger %1$s_touch before update on public.%1$s for each row execute function public.natal_touch()', t);
  end loop;
end $$;
-- sorteio: ninguém insere direto (só pela função natal_sortear); a equipe pode ajustar a visibilidade e excluir para refazer
revoke insert on natal_sorteios from authenticated;
grant select, update, delete on natal_sorteios to authenticated;
grant select, insert, update, delete on natal_postos, natal_trajetos to authenticated;

-- interações: a equipe lê; quem cuida da divulgação modera; envio só pela função natal_interagir
alter table natal_interacoes enable row level security;
drop policy if exists natal_interacoes_sel on natal_interacoes;
drop policy if exists natal_interacoes_upd on natal_interacoes;
drop policy if exists natal_interacoes_del on natal_interacoes;
create policy natal_interacoes_sel on natal_interacoes for select to authenticated using (grupo_id = public.natal_meu_grupo() and public.natal_papel() is not null);
create policy natal_interacoes_upd on natal_interacoes for update to authenticated using (grupo_id = public.natal_meu_grupo() and public.natal_pode('divulgacao')) with check (grupo_id = public.natal_meu_grupo());
create policy natal_interacoes_del on natal_interacoes for delete to authenticated using (grupo_id = public.natal_meu_grupo() and public.natal_pode('divulgacao'));
grant select, update, delete on natal_interacoes to authenticated;
revoke all on natal_sorteios, natal_postos, natal_trajetos, natal_interacoes from anon;
drop trigger if exists natal_interacoes_log on natal_interacoes;
create trigger natal_interacoes_log after update or delete on natal_interacoes for each row execute function public.natal_log();

-- ---------- Fotos enviadas pela população (bucket PRIVADO, só imagens, até 5 MB) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('natal-interacoes', 'natal-interacoes', false, 5242880, array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;
create or replace function public.natal_aceita_envio(p_grupo text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from natal_grupos g where g.id::text = p_grupo and g.publico_ativo and g.participacao_ativa)
$$;
grant execute on function public.natal_aceita_envio(text) to anon, authenticated;
drop policy if exists natal_int_envio on storage.objects;
create policy natal_int_envio on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'natal-interacoes' and (storage.foldername(name))[2] = 'envios'
              and public.natal_aceita_envio((storage.foldername(name))[1]));
drop policy if exists natal_int_ver on storage.objects;
create policy natal_int_ver on storage.objects for select to authenticated
  using (bucket_id = 'natal-interacoes' and (storage.foldername(name))[1] = public.natal_meu_grupo()::text and public.natal_papel() is not null);
drop policy if exists natal_int_apagar on storage.objects;
create policy natal_int_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'natal-interacoes' and (storage.foldername(name))[1] = public.natal_meu_grupo()::text and public.natal_pode('divulgacao'));

-- ============================================================
-- Página pública: novidades (sem telefones e com só o primeiro nome)
-- ============================================================
create or replace function public.natal_publico_extra(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g natal_grupos%rowtype;
begin
  select * into g from natal_grupos where slug = lower(trim(p_slug)) and publico_ativo;
  if not found then return null; end if;
  return jsonb_build_object(
    'gid', g.id,
    'participacao', g.participacao_ativa,
    'curtidas', g.curtidas,
    'sorteados', coalesce((select jsonb_agg(jsonb_build_object(
        'premio', s.premio_nome, 'numero', s.numero, 'data', s.realizado_em,
        'ganhador', case when nullif(trim(s.ganhador_nome), '') is null then null
                         else initcap(split_part(trim(s.ganhador_nome), ' ', 1)) ||
                              case when array_length(regexp_split_to_array(trim(s.ganhador_nome), '\s+'), 1) > 1
                                   then ' ' || upper(left((regexp_split_to_array(trim(s.ganhador_nome), '\s+'))[array_length(regexp_split_to_array(trim(s.ganhador_nome), '\s+'), 1)], 1)) || '.'
                                   else '' end end)
        order by s.realizado_em) from natal_sorteios s where s.grupo_id = g.id and s.publico), '[]'::jsonb),
    'postos', coalesce((select jsonb_agg(jsonb_build_object('nome', p.nome, 'endereco', p.endereco, 'referencia', p.referencia, 'horario', p.horario,
        'telefone', p.telefone, 'recebe', p.o_que_recebe, 'maps', p.maps_url, 'lat', p.lat, 'lng', p.lng) order by p.ordem nulls last, p.nome)
        from natal_postos p where p.grupo_id = g.id and p.publico), '[]'::jsonb),
    'trajetos', coalesce((select jsonb_agg(jsonb_build_object('nome', t.nome, 'regiao', t.regiao, 'data', t.data, 'hora', t.hora_saida, 'saida', t.ponto_saida,
        'descricao', t.descricao, 'cor', t.cor, 'pontos', t.pontos) order by t.data nulls last, t.ordem nulls last, t.nome)
        from natal_trajetos t where t.grupo_id = g.id and t.publico), '[]'::jsonb),
    'interacoes', coalesce((select jsonb_agg(x order by x->>'data' desc) from (
        select jsonb_build_object('tipo', i.tipo, 'nome', initcap(split_part(trim(i.nome), ' ', 1)), 'bairro', i.bairro, 'texto', i.texto, 'nota', i.nota,
               'foto', i.foto_publica_path, 'resposta', i.resposta, 'data', i.criado_em) as x
          from natal_interacoes i where i.grupo_id = g.id and i.status = 'aprovado' order by i.criado_em desc limit 200) q), '[]'::jsonb),
    'avaliacao', (select jsonb_build_object('media', round(avg(nota)::numeric, 1), 'total', count(nota))
                    from natal_interacoes where grupo_id = g.id and status = 'aprovado' and nota is not null)
  );
end $$;
grant execute on function public.natal_publico_extra(text) to anon, authenticated;

select 'ok' as carretinha_007,
  (select count(*) from natal_numeros) as numeros_preservados,
  (select count(*) from natal_premios) as premios_preservados,
  (select count(*) from natal_bloquinhos) as bloquinhos_preservados;
