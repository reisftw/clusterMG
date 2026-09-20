-- Feedback de producao: o gestor de SST quer configurar as categorias
-- de tema do DSS pelo proprio sistema, sem depender de deploy. Troca a
-- CHECK CONSTRAINT fixa de dss_themes.category (054_dss_schema.sql)
-- por uma tabela de catalogo (mesmo espirito de rot_permissions: fonte
-- de verdade editavel, nao lista hardcoded no codigo).

create table if not exists dss_categories (
	id text primary key,
	label text not null,
	active boolean not null default true,
	sort_order integer not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

drop trigger if exists dss_categories_touch_updated_at on dss_categories;
create trigger dss_categories_touch_updated_at
before update on dss_categories
for each row execute function touch_updated_at();

-- Semente com as categorias que ja existiam como enum fixo, na mesma
-- ordem — nenhum tema existente fica com categoria invalida.
insert into dss_categories (id, label, sort_order) values
	('epi', 'EPI', 10),
	('epc', 'EPC', 20),
	('direcao_segura', 'Direção segura', 30),
	('trabalho_altura', 'Trabalho em altura', 40),
	('seguranca_eletrica', 'Segurança elétrica', 50),
	('acidentes', 'Acidentes', 60),
	('ergonomia', 'Ergonomia', 70),
	('saude_ocupacional', 'Saúde ocupacional', 80),
	('prevencao', 'Prevenção', 90),
	('procedimentos_operacionais', 'Procedimentos operacionais', 100),
	('outros', 'Outros', 999)
on conflict (id) do nothing;

alter table dss_themes drop constraint if exists dss_themes_category_check;
alter table dss_themes add constraint dss_themes_category_fkey
	foreign key (category) references dss_categories(id) on delete restrict;

insert into rot_permissions (id, section_id, section_label, feature_id, feature_label, action, sort_order, description)
values
	('dss.categoria.gerenciar', 'seguranca_trabalho', 'Seguranca do Trabalho', 'dss', 'DSS - Dialogo Semanal de Seguranca', 'manage', 1015, 'Criar, renomear e arquivar categorias de tema do DSS.')
on conflict (id) do update set
	section_id = excluded.section_id,
	section_label = excluded.section_label,
	feature_id = excluded.feature_id,
	feature_label = excluded.feature_label,
	action = excluded.action,
	sort_order = excluded.sort_order,
	description = excluded.description,
	active = true;

insert into rot_role_permissions (role_id, permission_id)
select role_id, 'dss.categoria.gerenciar' from (values ('sst_manager'), ('sst_tech')) as roles(role_id)
on conflict do nothing;
