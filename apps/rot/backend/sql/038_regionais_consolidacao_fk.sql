-- Consolida todo FK de regional para apontar para `regionais` (fonte
-- canonica gerenciada pela pagina admin Regionais), eliminando
-- `rot_regionals` como fonte concorrente. As duas tabelas tem IDs
-- DIFERENTES para a mesma regional (regionais foi consolidada/renomeada
-- nas migrations 020/025) — por isso a tradução explicita abaixo antes de
-- trocar a constraint, em vez de so trocar a referencia.
--
-- Efeito pratico do bug corrigido aqui: rot_users.regional_id guardava o
-- id espaco `rot_regionals` (ex: Metropolitana Sub-2 = RftD2zH9deh2yIZq4VRb)
-- enquanto rot_assets.regional_id ja guardava o id espaco `regionais`
-- (Metropolitana Sub-2 = 02X9dhKMnJcFzzJRmSDM). Um usuario dessa regional
-- nunca veria ativo nenhum, mesmo cadastrado na regional certa, porque os
-- dois nunca eram o mesmo valor.
--
-- Ordem por tabela: solta a constraint antiga primeiro (senao o UPDATE
-- para o id novo viola a FK ainda apontando pra rot_regionals), so depois
-- atualiza o valor e recria a constraint apontando pra regionais.

create temporary table _regional_id_map (old_id text primary key, new_id text not null);
insert into _regional_id_map (old_id, new_id) values
	('ju1xpI2ZZukBS0isLtVU', 'NqmZmaBlJxjKKVZCvWVa'), -- Central Mineira
	('kguMqXhEwOK4I6HrHjAT', '3N0rUnEOYi0zrGzxEayB'), -- Centro Oeste
	('Gh9OaeH7CdU0pPShzjtY', 'MyQBOtuyXZhffvsMpfWD'), -- Metropolitana Sub-1
	('RftD2zH9deh2yIZq4VRb', '02X9dhKMnJcFzzJRmSDM'), -- Metropolitana Sub-2
	('cVL8hYCAIrMeZMMM9nQT', 'd05DKgDVng57Pu2H4Kuq'), -- Metropolitana Sub-3
	('jgJnHTiU3E7QyBYJfssL', 'fSgRg8yqRWlLjkZ4s6UV'), -- Oeste de Minas
	('s1iTky2T1alkR5dH1DOU', 'KskdAByua0Cle4gpcQQ2'); -- Sul de Minas
	-- hmBaoLhpR6dwgVWYVuCi (Sempre Internet) ja tem o mesmo id nas duas
	-- tabelas, nao precisa de linha no mapa.

-- operational_event_log.regional_id -> SET NULL
alter table operational_event_log drop constraint operational_event_log_regional_id_fkey;
update operational_event_log t set regional_id = m.new_id from _regional_id_map m where t.regional_id = m.old_id;
alter table operational_event_log add constraint operational_event_log_regional_id_fkey foreign key (regional_id) references regionais(id) on delete set null;

-- rot_absences.regional_id -> SET NULL
alter table rot_absences drop constraint rot_absences_regional_id_fkey;
update rot_absences t set regional_id = m.new_id from _regional_id_map m where t.regional_id = m.old_id;
alter table rot_absences add constraint rot_absences_regional_id_fkey foreign key (regional_id) references regionais(id) on delete set null;

-- rot_activities.regional_id -> SET NULL
alter table rot_activities drop constraint rot_activities_regional_id_fkey;
update rot_activities t set regional_id = m.new_id from _regional_id_map m where t.regional_id = m.old_id;
alter table rot_activities add constraint rot_activities_regional_id_fkey foreign key (regional_id) references regionais(id) on delete set null;

-- rot_aprs.regional_id -> NO ACTION
alter table rot_aprs drop constraint rot_aprs_regional_id_fkey;
update rot_aprs t set regional_id = m.new_id from _regional_id_map m where t.regional_id = m.old_id;
alter table rot_aprs add constraint rot_aprs_regional_id_fkey foreign key (regional_id) references regionais(id);

-- rot_cities.regional_id -> RESTRICT
alter table rot_cities drop constraint rot_cities_regional_id_fkey;
update rot_cities t set regional_id = m.new_id from _regional_id_map m where t.regional_id = m.old_id;
alter table rot_cities add constraint rot_cities_regional_id_fkey foreign key (regional_id) references regionais(id);

-- rot_equipment_audits.regional_id -> SET NULL
alter table rot_equipment_audits drop constraint rot_equipment_audits_regional_id_fkey;
update rot_equipment_audits t set regional_id = m.new_id from _regional_id_map m where t.regional_id = m.old_id;
alter table rot_equipment_audits add constraint rot_equipment_audits_regional_id_fkey foreign key (regional_id) references regionais(id) on delete set null;

-- rot_equipments.regional_id -> SET NULL
alter table rot_equipments drop constraint rot_equipments_regional_id_fkey;
update rot_equipments t set regional_id = m.new_id from _regional_id_map m where t.regional_id = m.old_id;
alter table rot_equipments add constraint rot_equipments_regional_id_fkey foreign key (regional_id) references regionais(id) on delete set null;

-- rot_holidays.regional_id -> SET NULL
alter table rot_holidays drop constraint rot_holidays_regional_id_fkey;
update rot_holidays t set regional_id = m.new_id from _regional_id_map m where t.regional_id = m.old_id;
alter table rot_holidays add constraint rot_holidays_regional_id_fkey foreign key (regional_id) references regionais(id) on delete set null;

-- rot_keys.regional_id -> SET NULL
alter table rot_keys drop constraint rot_keys_regional_id_fkey;
update rot_keys t set regional_id = m.new_id from _regional_id_map m where t.regional_id = m.old_id;
alter table rot_keys add constraint rot_keys_regional_id_fkey foreign key (regional_id) references regionais(id) on delete set null;

-- rot_qrcodes.regional_id -> SET NULL
alter table rot_qrcodes drop constraint rot_qrcodes_regional_id_fkey;
update rot_qrcodes t set regional_id = m.new_id from _regional_id_map m where t.regional_id = m.old_id;
alter table rot_qrcodes add constraint rot_qrcodes_regional_id_fkey foreign key (regional_id) references regionais(id) on delete set null;

-- rot_rain_alerts.regional_id -> SET NULL
alter table rot_rain_alerts drop constraint rot_rain_alerts_regional_id_fkey;
update rot_rain_alerts t set regional_id = m.new_id from _regional_id_map m where t.regional_id = m.old_id;
alter table rot_rain_alerts add constraint rot_rain_alerts_regional_id_fkey foreign key (regional_id) references regionais(id) on delete set null;

-- rot_regional_operation_scopes.regional_id -> CASCADE
alter table rot_regional_operation_scopes drop constraint rot_regional_operation_scopes_regional_id_fkey;
update rot_regional_operation_scopes t set regional_id = m.new_id from _regional_id_map m where t.regional_id = m.old_id;
alter table rot_regional_operation_scopes add constraint rot_regional_operation_scopes_regional_id_fkey foreign key (regional_id) references regionais(id) on delete cascade;

-- rot_rompimento_bases.regional_id -> CASCADE
alter table rot_rompimento_bases drop constraint rot_rompimento_bases_regional_id_fkey;
update rot_rompimento_bases t set regional_id = m.new_id from _regional_id_map m where t.regional_id = m.old_id;
alter table rot_rompimento_bases add constraint rot_rompimento_bases_regional_id_fkey foreign key (regional_id) references regionais(id) on delete cascade;

-- rot_rompimentos.regional_id -> SET NULL
alter table rot_rompimentos drop constraint rot_rompimentos_regional_id_fkey;
update rot_rompimentos t set regional_id = m.new_id from _regional_id_map m where t.regional_id = m.old_id;
alter table rot_rompimentos add constraint rot_rompimentos_regional_id_fkey foreign key (regional_id) references regionais(id) on delete set null;

-- rot_shifts.regional_id -> SET NULL
alter table rot_shifts drop constraint rot_shifts_regional_id_fkey;
update rot_shifts t set regional_id = m.new_id from _regional_id_map m where t.regional_id = m.old_id;
alter table rot_shifts add constraint rot_shifts_regional_id_fkey foreign key (regional_id) references regionais(id) on delete set null;

-- rot_tickets.regional_id -> SET NULL
alter table rot_tickets drop constraint rot_tickets_regional_id_fkey;
update rot_tickets t set regional_id = m.new_id from _regional_id_map m where t.regional_id = m.old_id;
alter table rot_tickets add constraint rot_tickets_regional_id_fkey foreign key (regional_id) references regionais(id) on delete set null;

-- rot_users.regional_id -> SET NULL (a correcao principal, causa raiz do bug relatado)
alter table rot_users drop constraint rot_users_regional_id_fkey;
update rot_users t set regional_id = m.new_id from _regional_id_map m where t.regional_id = m.old_id;
alter table rot_users add constraint rot_users_regional_id_fkey foreign key (regional_id) references regionais(id) on delete set null;

-- rot_vehicles.regional_id -> SET NULL
alter table rot_vehicles drop constraint rot_vehicles_regional_id_fkey;
update rot_vehicles t set regional_id = m.new_id from _regional_id_map m where t.regional_id = m.old_id;
alter table rot_vehicles add constraint rot_vehicles_regional_id_fkey foreign key (regional_id) references regionais(id) on delete set null;

-- rot_workshops.regional_id -> SET NULL
alter table rot_workshops drop constraint rot_workshops_regional_id_fkey;
update rot_workshops t set regional_id = m.new_id from _regional_id_map m where t.regional_id = m.old_id;
alter table rot_workshops add constraint rot_workshops_regional_id_fkey foreign key (regional_id) references regionais(id) on delete set null;

drop table _regional_id_map;
