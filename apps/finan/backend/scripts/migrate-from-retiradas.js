const { Pool } = require("pg");
const finanDb = require("../src/db");

function createRetiradasPool() {
	if (process.env.RETIRADAS_DATABASE_URL) {
		return new Pool({
			connectionString: process.env.RETIRADAS_DATABASE_URL,
			ssl:
				String(process.env.RETIRADAS_PGSSLMODE || "").toLowerCase() === "require"
					? { rejectUnauthorized: false }
					: undefined,
		});
	}

	for (const key of ["RETIRADAS_PGHOST", "RETIRADAS_PGUSER", "RETIRADAS_PGDATABASE"]) {
		if (!process.env[key]) {
			throw new Error(
				"Informe RETIRADAS_DATABASE_URL ou RETIRADAS_PGHOST/RETIRADAS_PGUSER/RETIRADAS_PGDATABASE para coletar dados financeiros, usuários financeiros e admins.",
			);
		}
	}

	return new Pool({
		host: process.env.RETIRADAS_PGHOST,
		port: Number(process.env.RETIRADAS_PGPORT || 5432),
		user: process.env.RETIRADAS_PGUSER,
		password: process.env.RETIRADAS_PGPASSWORD,
		database: process.env.RETIRADAS_PGDATABASE,
		ssl:
			String(process.env.RETIRADAS_PGSSLMODE || "").toLowerCase() === "require"
				? { rejectUnauthorized: false }
				: undefined,
	});
}

async function migrateUsers(retiradasPool) {
	await migrateRoles(retiradasPool);
	const { rows } = await retiradasPool.query(`
		select
			u.uid as id,
			coalesce(u.display_name, u.imported_profile->>'nome', u.imported_profile->>'displayName', u.email) as name,
			u.email,
			u.password_hash,
			coalesce(u.role, 'analista_financeiro') as role,
			case when coalesce(u.disabled, false) then 'inativo' else 'ativo' end as status,
			u.must_change_password as trocar_senha,
			coalesce(u.imported_profile->>'avatarUrl', u.imported_profile->>'avatar_url', '') as avatar_url,
			coalesce(u.imported_profile, '{}'::jsonb) as imported_profile,
			coalesce(
				jsonb_agg(distinct rp.permission) filter (where rp.permission is not null),
				'[]'::jsonb
			) as permissions
		from app_users u
		left join app_roles r on r.id = coalesce(u.role, '')
		left join app_role_permissions rp on rp.role_id = r.id
		where lower(coalesce(u.role, '')) = 'admin'
			or lower(coalesce(u.role, '')) like '%financeiro%'
			or exists (
				select 1
				from app_roles role_check
				left join app_role_permissions perm_check on perm_check.role_id = role_check.id
				where role_check.id = coalesce(u.role, '')
					and (
						lower(role_check.name) like '%financeiro%'
						or perm_check.permission like 'financeiro.%'
					)
			)
		group by u.uid, u.display_name, u.imported_profile, u.email, u.password_hash,
			u.role, u.disabled, u.must_change_password
	`);

	for (const user of rows) {
		const roleId = String(user.role || "").trim() || "analista_financeiro";
		await finanDb.query(
			`insert into finan_users (
				id, name, email, password_hash, role_id, status,
				must_change_password, avatar_url, source_system, source_user_id,
				source_role, source_permissions, source_profile
			)
			values ($1, $2, $3, $4, $5, $6, $7, $8, 'retiradas', $1, $9, $10::jsonb, $11::jsonb)
			on conflict (email) do update set
				name = excluded.name,
				password_hash = coalesce(finan_users.password_hash, excluded.password_hash),
				role_id = excluded.role_id,
				status = excluded.status,
				avatar_url = excluded.avatar_url,
				source_user_id = excluded.source_user_id,
				source_role = excluded.source_role,
				source_permissions = excluded.source_permissions,
				source_profile = excluded.source_profile,
				updated_at = now()`,
			[
				String(user.id),
				user.name || user.email,
				String(user.email || "").toLowerCase(),
				user.password_hash || null,
				roleId,
				user.status || "ativo",
				Boolean(user.trocar_senha),
				user.avatar_url || null,
				user.role || null,
				JSON.stringify(user.permissions || []),
				JSON.stringify(user.imported_profile || {}),
			],
		);
	}

	return rows.length;
}

async function migrateRoles(retiradasPool) {
	const { rows } = await retiradasPool.query(`
		select
			r.id,
			r.name,
			r.description,
			coalesce(r.system_role, false) as system_role,
			coalesce(r.active, true) as active,
			coalesce(
				jsonb_agg(distinct rp.permission) filter (where rp.permission is not null),
				'[]'::jsonb
			) as permissions
		from app_roles r
		left join app_role_permissions rp on rp.role_id = r.id
		where lower(r.id) = 'admin'
			or lower(r.id) like '%financeiro%'
			or lower(r.name) like '%financeiro%'
			or exists (
				select 1
				from app_role_permissions check_perm
				where check_perm.role_id = r.id
					and check_perm.permission like 'financeiro.%'
			)
		group by r.id, r.name, r.description, r.system_role, r.active
	`);

	const fallbackRoles = [
		{
			id: "admin",
			name: "Admin",
			description: "Acesso total ao sistema financeiro dedicado.",
			permissions: [
				"finan.dashboard.view",
				"finan.gestao_orcamentaria.view",
				"finan.gestao_orcamentaria.manage",
				"finan.contas_pagar.view",
				"finan.contas_pagar.manage",
				"finan.contas_receber.view",
				"finan.contas_receber.manage",
				"finan.faturamento.view",
				"finan.notas.view",
				"finan.reports.view",
				"finan.reports.manage",
				"finan.equipe.view",
				"finan.equipe.manage",
				"finan.integracoes.view",
				"finan.integracoes.manage",
				"finan.configuracoes.view",
				"finan.configuracoes.manage",
				"finan.usuarios.manage",
			],
			system_role: true,
			active: true,
		},
	];

	for (const role of rows.length ? rows : fallbackRoles) {
		const permissions = mapRetiradasPermissionsToFinan(role.permissions || []);
		await finanDb.query(
			`insert into finan_roles (
				id, name, description, permissions, is_admin, system_role, active
			)
			values ($1, $2, $3, $4::jsonb, $5, $6, $7)
			on conflict (id) do update set
				name = excluded.name,
				description = excluded.description,
				permissions = excluded.permissions,
				is_admin = excluded.is_admin,
				system_role = excluded.system_role,
				active = excluded.active,
				updated_at = now()`,
			[
				String(role.id),
				role.name || role.id,
				role.description || null,
				JSON.stringify(permissions),
				String(role.id).toLowerCase() === "admin",
				Boolean(role.system_role),
				Boolean(role.active),
			],
		);
	}
	return rows.length;
}

function mapRetiradasPermissionsToFinan(permissions) {
	const mapped = new Set();
	for (const permission of permissions || []) {
		const value = String(permission || "");
		if (value === "*") {
			mapped.add("finan.dashboard.view");
			mapped.add("finan.gestao_orcamentaria.view");
			mapped.add("finan.gestao_orcamentaria.manage");
			mapped.add("finan.usuarios.manage");
			continue;
		}
		if (value.startsWith("financeiro.")) {
			mapped.add(value.replace(/^financeiro\./, "finan."));
		}
	}
	if (!mapped.size) {
		mapped.add("finan.dashboard.view");
		mapped.add("finan.gestao_orcamentaria.view");
	}
	return Array.from(mapped).sort();
}

const FINANCIAL_SOURCE_TABLES = [
	"financeiro_config_meta",
	"financeiro_contas",
	"financeiro_diretorias",
	"financeiro_centros_custo",
	"financeiro_fornecedores",
	"financeiro_matrizes",
	"financeiro_filiais",
	"financeiro_orcamento_matriz",
	"financeiro_orcamento_lancamentos",
	"financeiro_reports_meta",
	"financeiro_import_logs",
	"financeiro_serasa_movimentacoes",
	"financeiro_serasa_clientes_base",
	"financeiro_tarifas_faturas",
	"financeiro_tarifas_formas_pagamento",
	"financeiro_tarifas_receita_cliente",
	"financeiro_tarifas_mensais",
	"financeiro_tarifas_cobranca_clientes",
	"financeiro_tarifas_boletos",
	"financeiro_equipe_config",
	"financeiro_equipe_setores",
	"financeiro_equipe_cargos",
	"financeiro_equipe_colaboradores",
];

const FINANCIAL_TABLE_COPIES = [
	{ source: "financeiro_config_meta", target: "finan_config_meta", conflict: ["config_id"] },
	{ source: "financeiro_contas", target: "finan_contas", conflict: ["id"] },
	{ source: "financeiro_diretorias", target: "finan_diretorias", conflict: ["id"] },
	{ source: "financeiro_centros_custo", target: "finan_centros_custo", conflict: ["id"] },
	{ source: "financeiro_fornecedores", target: "finan_fornecedores", conflict: ["id"] },
	{ source: "financeiro_matrizes", target: "finan_matrizes", conflict: ["id"] },
	{ source: "financeiro_filiais", target: "finan_filiais", conflict: ["matriz_id", "id"] },
	{ source: "financeiro_orcamento_matriz", target: "finan_orcamento_matriz", conflict: ["id"] },
	{ source: "financeiro_orcamento_lancamentos", target: "finan_orcamento_lancamentos", conflict: ["id"] },
	{ source: "financeiro_equipe_config", target: "finan_equipe_config", conflict: ["id"] },
	{ source: "financeiro_equipe_setores", target: "finan_equipe_setores", conflict: ["id"] },
	{ source: "financeiro_equipe_cargos", target: "finan_equipe_cargos", conflict: ["id"] },
	{ source: "financeiro_equipe_colaboradores", target: "finan_equipe_colaboradores", conflict: ["id"] },
];

function rowSourcePk(row) {
	if (row.id !== undefined && row.id !== null) return String(row.id);
	if (row.source_hash) return String(row.source_hash);
	return null;
}

async function sourceTableExists(pool, table) {
	const { rows } = await pool.query(
		`select to_regclass($1) as table_name`,
		[`public.${table}`],
	);
	return Boolean(rows[0]?.table_name);
}

async function migrateFinancialSnapshots(retiradasPool) {
	const summary = [];
	for (const table of FINANCIAL_SOURCE_TABLES) {
		if (!(await sourceTableExists(retiradasPool, table))) {
			summary.push({ table, rows: 0, skipped: true });
			continue;
		}

		const { rows } = await retiradasPool.query(`select * from ${table}`);
		for (let index = 0; index < rows.length; index += 1) {
			const row = rows[index];
			const sourcePk = rowSourcePk(row) || `${table}:${index + 1}`;
			await finanDb.query(
				`insert into finan_migration_snapshots (source_table, source_pk, payload)
				values ($1, $2, $3::jsonb)
				on conflict (source_table, source_pk) do update set
					payload = excluded.payload,
					imported_at = now()`,
				[table, sourcePk, JSON.stringify(row)],
			);
		}
		summary.push({ table, rows: rows.length, skipped: false });
	}
	return summary;
}

async function tableColumns(pool, table) {
	const { rows } = await pool.query(
		`select column_name
		from information_schema.columns
		where table_schema = 'public' and table_name = $1
		order by ordinal_position`,
		[table],
	);
	return rows.map((row) => row.column_name);
}

function quoteIdent(value) {
	return `"${String(value).replaceAll('"', '""')}"`;
}

async function copyFinancialTables(retiradasPool) {
	const summary = [];
	for (const item of FINANCIAL_TABLE_COPIES) {
		if (!(await sourceTableExists(retiradasPool, item.source))) {
			summary.push({ ...item, rows: 0, skipped: true });
			continue;
		}

		const [sourceColumns, targetColumns] = await Promise.all([
			tableColumns(retiradasPool, item.source),
			tableColumns(finanDb, item.target),
		]);
		const commonColumns = sourceColumns.filter((column) =>
			targetColumns.includes(column),
		);
		if (!commonColumns.length) {
			summary.push({ ...item, rows: 0, skipped: true, reason: "sem_colunas_comuns" });
			continue;
		}

		const { rows } = await retiradasPool.query(
			`select ${commonColumns.map(quoteIdent).join(", ")} from ${item.source}`,
		);
		for (const row of rows) {
			const values = commonColumns.map((column) => row[column]);
			const placeholders = commonColumns.map((_, index) => `$${index + 1}`);
			const updates = commonColumns
				.filter((column) => !item.conflict.includes(column))
				.map((column) => `${quoteIdent(column)} = excluded.${quoteIdent(column)}`);
			await finanDb.query(
				`insert into ${item.target} (${commonColumns.map(quoteIdent).join(", ")})
				values (${placeholders.join(", ")})
				on conflict (${item.conflict.map(quoteIdent).join(", ")}) do update set
					${updates.length ? updates.join(", ") : `${quoteIdent(item.conflict[0])} = excluded.${quoteIdent(item.conflict[0])}`}`,
				values,
			);
		}
		summary.push({ ...item, rows: rows.length, skipped: false });
	}
	return summary;
}

async function main() {
	const retiradasPool = createRetiradasPool();
	try {
		const users = await migrateUsers(retiradasPool);
		const financialSnapshots = await migrateFinancialSnapshots(retiradasPool);
		const financialTables = await copyFinancialTables(retiradasPool);
		console.log(
			JSON.stringify({
				ok: true,
				usersMigrated: users,
				financialSnapshots,
				financialTables,
				note: "Coleta somente dados financeiros, usuários financeiros e admins para o banco apartado do Finan.",
			}),
		);
	} finally {
		await retiradasPool.end().catch(() => {});
		await finanDb.closePool().catch(() => {});
	}
}

main().catch((error) => {
	console.error("[finan:migrate-from-retiradas] Falha:", error);
	process.exitCode = 1;
});
