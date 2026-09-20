alter table financeiro_equipe_cargos
	alter column setor drop not null;

update financeiro_equipe_cargos
set setor = null
where trim(coalesce(setor, '')) = '';

drop index if exists financeiro_equipe_cargos_nome_setor_id_uidx;

create index if not exists financeiro_equipe_cargos_nome_idx
	on financeiro_equipe_cargos (lower(nome));
