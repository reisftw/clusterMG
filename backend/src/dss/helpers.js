const db = require("../db");
const { randomId } = require("../secureRandom");
const { userHasRotPermission } = require("../auth/middleware");

// Mesmo criterio de "lideranca operacional" usado no SST
// (sst/routes.js:150-159): global, cargo tech_lead+ (level >= 60), ou
// lider/supervisor formal da regional via regional_responsaveis. Nao
// existe helper compartilhado no projeto — cada dominio reimplementa a
// sua versao, entao esta copia e intencional (mesmo padrao do SST).
async function isRegionalLeadership(req) {
	if (req.rotUser.is_global) return true;
	if (Number(req.rotUser.role_level) >= 60) return true;
	if (!req.rotUser.regional_id) return false;
	const { rows } = await db.query(
		`select 1 from regional_responsaveis where regional_id = $1 and tipo in ('lider','supervisor') and source_payload->>'userId' = $2 limit 1`,
		[req.rotUser.regional_id, req.rotUser.id],
	);
	return rows.length > 0;
}

// "DSS da minha equipe" (secao 10 do pedido): o gestor nao escolhe a
// equipe manualmente — se e lideranca formal da regional, ve toda a
// regional (modo acompanhamento, igual ao SST); senao, ve so as
// execucoes das quais e o responsavel.
async function myTeamClause(req, alias = "e") {
	if (await isRegionalLeadership(req)) {
		if (req.rotUser.is_global) return { clause: "true", params: [] };
		if (req.rotUser.regional_id) return { clause: `${alias}.regional_id = $1`, params: [req.rotUser.regional_id] };
	}
	return { clause: `${alias}.responsible_id = $1`, params: [req.rotUser.id] };
}

// Visibilidade de linha das execucoes: visao total (SST) -> abrangencia
// regional/operacional (SST regional) -> fallback "minha equipe" pra
// quem nao tem nenhuma das duas permissoes.
async function dssVisibilityClause(req, alias = "e") {
	if (userHasRotPermission(req.rotUser, "dss.execucao.visualizar_todos")) {
		return { clause: "true", params: [] };
	}
	if (userHasRotPermission(req.rotUser, "dss.execucao.visualizar_abrangencia")) {
		const params = [];
		const conditions = [];
		if (!req.rotUser.is_global) {
			params.push(req.rotUser.regional_id);
			conditions.push(`${alias}.regional_id = $${params.length}`);
			const scopes = Array.isArray(req.rotUser.operation_scopes) && req.rotUser.operation_scopes.length ? req.rotUser.operation_scopes : ["ROT"];
			params.push(scopes);
			conditions.push(`${alias}.operation_type = any($${params.length}::text[])`);
		}
		return { clause: conditions.length ? conditions.join(" and ") : "true", params };
	}
	return myTeamClause(req, alias);
}

// Mapeia operation_type (ROT/FIELD/DELIVERY, usado nas tabelas de DSS/
// escopo) para operacao_tecnicos.area_operacional (rot/field_service/
// delivery, minusculo — convencao ja existente na tabela de tecnicos).
const OPERATION_TO_AREA = { ROT: "rot", FIELD: "field_service", DELIVERY: "delivery" };

// tipo de regional_responsaveis preferido por operacao, na ordem de
// prioridade — nao ha tipo formal por DELIVERY hoje, entao cai direto
// pra lider/supervisor genericos (mesmo fallback usado pelo SST).
const RESPONSIBLE_TIPO_PRIORITY = {
	ROT: ["supervisor_rot", "lider", "supervisor"],
	FIELD: ["supervisor_field", "lider", "supervisor"],
	DELIVERY: ["lider", "supervisor"],
};

async function resolveResponsible(client, { operationType, regionalId }) {
	const priority = RESPONSIBLE_TIPO_PRIORITY[operationType] || ["lider", "supervisor"];
	const { rows } = await client.query(
		`select source_payload->>'userId' as user_id, tipo
		 from regional_responsaveis
		 where regional_id = $1 and tipo = any($2::text[]) and source_payload->>'userId' is not null
		 order by array_position($2::text[], tipo)
		 limit 1`,
		[regionalId, priority],
	);
	return rows[0]?.user_id || null;
}

// Snapshot da equipe (secao 11/12 do pedido): colaboradores ATIVOS da
// combinacao (operation_type, regional_id, base_id), unindo rot_users
// (usuarios do sistema) com operacao_tecnicos (tecnicos de campo, que
// podem nao ter login). Retorna linhas prontas pra insert em
// dss_execution_members — os textos sao copiados AGORA e nunca mais
// recalculados a partir do cadastro atual.
// roleIds: null/vazio = todos os cargos. Filtro so se aplica a
// rot_users — operacao_tecnicos nao tem coluna de cargo (so
// area_operacional), entao tecnicos sao sempre incluidos quando a
// combinacao bate, independente do filtro de cargo da programacao.
async function resolveTeamSnapshot(client, { operationType, regionalId, baseId, roleIds = null }) {
	const { rows: users } = await client.query(
		`select u.id, u.name, r.name as role_name, reg.nome as regional_name, bc.nome as base_name
		 from rot_users u
		 join rot_roles r on r.id = u.role_id
		 left join regionais reg on reg.id = u.regional_id
		 left join regional_cidades bc on bc.id = u.city_id
		 where u.status = 'ativo'
		   and u.regional_id = $1
		   and ($2::uuid is null or u.city_id = $2)
		   and (
		     not exists (select 1 from rot_user_operation_scopes s where s.user_id = u.id)
		     or exists (select 1 from rot_user_operation_scopes s where s.user_id = u.id and s.operation_type = $3)
		   )
		   and ($4::text[] is null or u.role_id = any($4::text[]))
		 order by u.name`,
		[regionalId, baseId, operationType, roleIds && roleIds.length ? roleIds : null],
	);
	const members = users.map((row) => ({
		userId: row.id,
		tecnicoId: null,
		name: row.name,
		role: row.role_name,
		regional: row.regional_name,
		base: row.base_name,
	}));

	const area = OPERATION_TO_AREA[operationType];
	if (area) {
		const includedUserIds = new Set(users.map((row) => row.id));
		const { rows: tecnicos } = await client.query(
			`select t.id, t.nome as name, t.user_id, reg.nome as regional_name, bc.nome as base_name
			 from operacao_tecnicos t
			 left join regionais reg on reg.id = t.regional_id
			 left join regional_cidades bc on bc.id = t.cidade_id
			 where t.status = 'Ativo'
			   and t.regional_id = $1
			   and ($2::uuid is null or t.cidade_id = $2)
			   and t.area_operacional = $3
			 order by t.nome`,
			[regionalId, baseId, area],
		);
		for (const row of tecnicos) {
			if (row.user_id && includedUserIds.has(row.user_id)) continue; // ja contado via rot_users
			members.push({
				userId: row.user_id || null,
				tecnicoId: row.id,
				name: row.name,
				role: "Técnico",
				regional: row.regional_name,
				base: row.base_name,
			});
		}
	}
	return members;
}

// Motor de geracao de execucoes (secao 9 do pedido): para cada linha de
// escopo da programacao, expande regional/base nulos ("todas") e gera
// uma execucao por combinacao unica (operation_type, regional_id,
// base_id). Idempotente via unique constraint + "on conflict do
// nothing" — publicar de novo nao duplica execucao nem regrava snapshot
// de uma execucao ja existente.
async function generateExecutionsForSchedule(client, req, schedule, scopes) {
	// key "OP:regional:base" -> { operationType, regionalId, baseId, roleIds }
	// roleIds = null significa "todos os cargos"; se QUALQUER linha de
	// escopo que bate nessa combinacao nao restringir cargo, a combinacao
	// inteira vira "todos" (uniao dos publicos, nunca interseccao).
	const combos = new Map();

	for (const scope of scopes) {
		const operationType = scope.operation_type;
		let regionalRows;
		if (scope.regional_id) {
			regionalRows = [{ id: scope.regional_id }];
		} else {
			const { rows } = await client.query(
				`select r.id from regionais r
				 join regional_operation_scopes ros on ros.regional_id = r.id
				 where ros.operation_type = $1 and r.ativo = true`,
				[operationType],
			);
			regionalRows = rows;
		}
		for (const regional of regionalRows) {
			let baseRows;
			if (scope.base_id) {
				baseRows = [{ id: scope.base_id }];
			} else {
				const { rows } = await client.query(`select id from regional_cidades where regional_id = $1`, [regional.id]);
				baseRows = rows.length ? rows : [{ id: null }];
			}
			for (const base of baseRows) {
				const key = `${operationType}:${regional.id}:${base.id || "null"}`;
				const existing = combos.get(key);
				if (!existing) {
					combos.set(key, { operationType, regionalId: regional.id, baseId: base.id, roleIds: scope.role_id ? [scope.role_id] : null });
				} else if (existing.roleIds && scope.role_id) {
					existing.roleIds.push(scope.role_id);
				} else if (!scope.role_id) {
					existing.roleIds = null;
				}
			}
		}
	}

	const generated = [];
	for (const combo of combos.values()) {
		const responsibleId = await resolveResponsible(client, { operationType: combo.operationType, regionalId: combo.regionalId });
		const members = await resolveTeamSnapshot(client, combo);

		const executionId = randomId("dsse");
		const { rows: inserted } = await client.query(
			`insert into dss_executions
			 (id, schedule_id, theme_id, theme_week_id, week_label, operation_type, regional_id, base_id, responsible_id, due_date, previstos_count)
			 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
			 on conflict (schedule_id, operation_type, regional_id, base_id) do nothing
			 returning id`,
			[executionId, schedule.id, schedule.theme_id, schedule.theme_week_id, schedule.week_label, combo.operationType, combo.regionalId, combo.baseId, responsibleId, schedule.due_date, members.length],
		);
		if (!inserted[0]) continue; // ja existia (publicacao repetida)

		for (const member of members) {
			await client.query(
				`insert into dss_execution_members (execution_id, user_id, tecnico_id, name_snapshot, role_snapshot, regional_snapshot, base_snapshot)
				 values ($1,$2,$3,$4,$5,$6,$7)`,
				[executionId, member.userId, member.tecnicoId, member.name, member.role, member.regional, member.base],
			);
		}

		await client.query(
			`insert into dss_execution_timeline (execution_id, event_type, title, description, created_by)
			 values ($1,'generated','Execução gerada automaticamente',$2,$3)`,
			[executionId, `Programação publicada: ${members.length} colaborador(es) na equipe.`, req.rotUser.id],
		);

		generated.push(executionId);
	}
	return generated;
}

// Quem tem uma permissao granular, considerando site_admin e o fallback
// legado de coluna jsonb (mesmo padrao de GET /sst/team em
// sst/routes.js:87-100 — nao existe helper compartilhado no projeto).
async function findUsersWithPermission(client, permissionId) {
	const { rows } = await client.query(
		`select u.id, u.name, u.email, r.name as role_name from rot_users u
		 join rot_roles r on r.id = u.role_id
		 where u.status = 'ativo'
		   and (
		     r.id = 'site_admin'
		     or exists (select 1 from rot_role_permissions rp where rp.role_id = r.id and rp.permission_id = $1)
		     or (
		       not exists (select 1 from rot_role_permissions rp2 where rp2.role_id = r.id)
		       and (r.permissions ? $1 or r.permissions ? '*')
		     )
		   )
		 order by u.name`,
		[permissionId],
	);
	return rows;
}

module.exports = {
	isRegionalLeadership,
	myTeamClause,
	dssVisibilityClause,
	findUsersWithPermission,
	resolveResponsible,
	resolveTeamSnapshot,
	generateExecutionsForSchedule,
};
