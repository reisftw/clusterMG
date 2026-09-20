-- Unifica o conceito de "base" (usado no codigo do ativo e na distancia
-- de rompimentos) na cidade da regional (`regional_cidades`), em vez de
-- manter uma lista separada (`rot_asset_bases`) so pra ativos. Uma base
-- passa a ser: uma cidade com codigo curto (BMO) e, opcionalmente, lat/lng.

alter table regional_cidades add column if not exists code text;
alter table regional_cidades add column if not exists lat numeric(10,6);
alter table regional_cidades add column if not exists lng numeric(10,6);
create unique index if not exists ux_regional_cidades_upper_code on regional_cidades (upper(code)) where code is not null;

-- lat/lng ja existiam soltos dentro de source_payload (JSON) desde a
-- criacao do CRUD de cidades; promove pra coluna dedicada pra poder usar
-- em join/where direto (rompimentos precisa calcular distancia por
-- cidade). Nao apaga o valor antigo do JSON, so espelha.
update regional_cidades
   set lat = coalesce(lat, (source_payload->>'lat')::numeric),
       lng = coalesce(lng, (source_payload->>'lng')::numeric)
 where source_payload ? 'lat' or source_payload ? 'lng';

-- Solta a FK antiga antes de mexer nos dados/tipo da coluna (senao o
-- UPDATE abaixo viola a constraint ainda apontando pra rot_asset_bases).
alter table rot_assets drop constraint if exists rot_assets_base_id_fkey;

-- Migra bases ja cadastradas em rot_asset_bases pra dentro de
-- regional_cidades: reaproveita a cidade se ja existir uma com o mesmo
-- nome na mesma regional, senao cria uma nova linha so com o codigo.
do $$
declare
	b record;
	matched_id uuid;
begin
	for b in select * from rot_asset_bases loop
		select id into matched_id
		from regional_cidades
		where regional_id = b.regional_id
		  and upper(regexp_replace(nome, '[^A-Za-z0-9]', '', 'g')) = upper(regexp_replace(b.name, '[^A-Za-z0-9]', '', 'g'))
		limit 1;

		if matched_id is null then
			insert into regional_cidades (regional_id, nome, tipo, code)
			values (b.regional_id, b.name, 'Comum', b.code)
			returning id into matched_id;
		else
			update regional_cidades set code = b.code where id = matched_id and code is null;
		end if;

		update rot_assets set base_id = matched_id::text where base_id = b.id;
	end loop;
end $$;

alter table rot_assets alter column base_id type uuid using nullif(base_id, '')::uuid;
alter table rot_assets add constraint rot_assets_base_id_fkey foreign key (base_id) references regional_cidades(id) on delete set null;

drop table if exists rot_asset_bases;
