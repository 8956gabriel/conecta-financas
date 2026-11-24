-- ============================================================
-- Carretinha de Natal — Sorteador: CANCELAR, EDITAR e LANÇAR MANUALMENTE
-- Rode depois do 007. Só acrescenta colunas e atualiza funções; nenhum
-- resultado já registrado é apagado. Pode ser rodado de novo.
-- ============================================================
set search_path to public;

alter table natal_sorteios add column if not exists cancelado boolean not null default false;
alter table natal_sorteios add column if not exists motivo_cancelamento text;
alter table natal_sorteios add column if not exists cancelado_em timestamptz;
alter table natal_sorteios add column if not exists editado_em timestamptz;
alter table natal_sorteios drop constraint if exists natal_sorteios_modo_check;
alter table natal_sorteios add constraint natal_sorteios_modo_check check (modo in ('sistema','manual','lancado'));

-- foto principal da página pública (substitui as fotos dos prêmios na página)
alter table natal_grupos add column if not exists foto_capa_path text;

-- um prêmio só pode ter UM resultado válido; os cancelados ficam no histórico
drop index if exists natal_sorteios_premio_uk;
create unique index if not exists natal_sorteios_premio_ativo_uk on natal_sorteios(premio_id) where premio_id is not null and not cancelado;

-- Sorteio pelo sistema ou número do globo (ignora resultados cancelados)
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
    if exists (select 1 from natal_sorteios where premio_id = p_premio and not cancelado) then raise exception 'Este prêmio já tem ganhador. Cancele o resultado anterior para sortear de novo.'; end if;
  end if;
  select count(*) into tot from natal_numeros x
   where x.grupo_id = v_g and x.status = any(st)
     and (not p_excluir_ganhadores or not exists (select 1 from natal_sorteios z where z.grupo_id = v_g and z.numero_id = x.id and not z.cancelado));
  if p_numero is null then
    if tot = 0 then raise exception 'Nenhum número concorrendo com esse critério.'; end if;
    select x.id, x.numero into n from natal_numeros x
     where x.grupo_id = v_g and x.status = any(st)
       and (not p_excluir_ganhadores or not exists (select 1 from natal_sorteios z where z.grupo_id = v_g and z.numero_id = x.id and not z.cancelado))
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

-- Lançar o ganhador à mão (nome, telefone e vendedor digitados; o número pode ou não existir na rifa)
create or replace function public.natal_lancar_sorteio(p_premio uuid, p_numero int, p_nome text, p_telefone text, p_vendedor text, p_obs text default null)
returns natal_sorteios language plpgsql security definer set search_path = public as $$
declare v_g uuid := public.natal_meu_grupo(); p natal_premios%rowtype; n record; s natal_sorteios%rowtype;
begin
  if not public.natal_pode('sorteio') then raise exception 'Sem permissão para registrar sorteios'; end if;
  if p_numero is null then raise exception 'Informe o número sorteado.'; end if;
  if p_premio is not null then
    select * into p from natal_premios where id = p_premio and grupo_id = v_g;
    if not found then raise exception 'Prêmio não encontrado'; end if;
    if exists (select 1 from natal_sorteios where premio_id = p_premio and not cancelado) then raise exception 'Este prêmio já tem ganhador. Cancele o resultado anterior primeiro.'; end if;
  end if;
  select x.id, x.status, b.numero as bloq_num, b.responsavel_nome as bloq_resp into n
    from natal_numeros x join natal_bloquinhos b on b.id = x.bloquinho_id where x.grupo_id = v_g and x.numero = p_numero;
  insert into natal_sorteios(grupo_id, premio_id, premio_nome, numero, numero_id, ganhador_nome, ganhador_telefone, vendedor,
                             bloquinho, bloquinho_responsavel, status_numero, modo, criterio, concorrentes, observacoes)
  values (v_g, p_premio, p.nome, p_numero, n.id, nullif(trim(p_nome), ''), nullif(trim(p_telefone), ''), nullif(trim(p_vendedor), ''),
          n.bloq_num, n.bloq_resp, n.status, 'lancado', 'vendidos', null, nullif(trim(p_obs), ''))
  returning * into s;
  return s;
end $$;
revoke execute on function public.natal_lancar_sorteio(uuid, int, text, text, text, text) from anon, public;
grant execute on function public.natal_lancar_sorteio(uuid, int, text, text, text, text) to authenticated;

-- Edição e cancelamento: o grupo, o protocolo e quem realizou não podem ser trocados
create or replace function public.natal_sorteio_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.grupo_id := old.grupo_id; new.protocolo := old.protocolo; new.realizado_por := old.realizado_por; new.realizado_em := old.realizado_em;
  if new.cancelado and not old.cancelado then new.cancelado_em := now(); end if;
  if not new.cancelado then new.cancelado_em := null; new.motivo_cancelamento := null; end if;
  if (new.numero, new.ganhador_nome, new.ganhador_telefone, new.vendedor, new.premio_id) is distinct from
     (old.numero, old.ganhador_nome, old.ganhador_telefone, old.vendedor, old.premio_id) then new.editado_em := now(); end if;
  if new.premio_id is distinct from old.premio_id then
    select nome into new.premio_nome from natal_premios where id = new.premio_id and grupo_id = old.grupo_id;
  end if;
  if new.numero is distinct from old.numero then
    select x.id, x.status, b.numero, b.responsavel_nome into new.numero_id, new.status_numero, new.bloquinho, new.bloquinho_responsavel
      from natal_numeros x join natal_bloquinhos b on b.id = x.bloquinho_id where x.grupo_id = old.grupo_id and x.numero = new.numero;
    if not found then new.numero_id := null; new.status_numero := null; new.bloquinho := null; new.bloquinho_responsavel := null; end if;
  end if;
  return new;
end $$;
drop trigger if exists natal_sorteio_antes on natal_sorteios;
create trigger natal_sorteio_antes before update on natal_sorteios for each row execute function public.natal_sorteio_antes();

-- Página pública: só resultados válidos (cancelados não aparecem)
create or replace function public.natal_publico_extra(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g natal_grupos%rowtype;
begin
  select * into g from natal_grupos where slug = lower(trim(p_slug)) and publico_ativo;
  if not found then return null; end if;
  return jsonb_build_object(
    'gid', g.id,
    'capa', g.foto_capa_path,
    'participacao', g.participacao_ativa,
    'curtidas', g.curtidas,
    'sorteados', coalesce((select jsonb_agg(jsonb_build_object(
        'premio', s.premio_nome, 'numero', s.numero, 'data', s.realizado_em,
        'ganhador', case when nullif(trim(s.ganhador_nome), '') is null then null
                         else initcap(split_part(trim(s.ganhador_nome), ' ', 1)) ||
                              case when array_length(regexp_split_to_array(trim(s.ganhador_nome), '\s+'), 1) > 1
                                   then ' ' || upper(left((regexp_split_to_array(trim(s.ganhador_nome), '\s+'))[array_length(regexp_split_to_array(trim(s.ganhador_nome), '\s+'), 1)], 1)) || '.'
                                   else '' end end)
        order by s.realizado_em) from natal_sorteios s where s.grupo_id = g.id and s.publico and not s.cancelado), '[]'::jsonb),
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

select 'ok' as carretinha_008, (select count(*) from natal_sorteios) as resultados_preservados;
