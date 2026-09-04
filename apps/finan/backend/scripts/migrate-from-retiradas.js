const { Pool } = require("pg");
const finanDb = require("../src/db");

function createRetiradasPool() {
	if (!process.env.RETIRADAS_DATABASE_URL) {
		throw new Error(
			"Informe RETIRADAS_DATABASE_URL apenas para coletar dados financeiros, usuários financeiros e admins.",
		);
	}
	return new Pool({
		connectionString: process.env.RETIRADAS_DATABASE_URL,
		ssl:
			String(process.env.RETIRADAS_PGSSLMODE || "").toLowerCase() === "require"
				? { rejectUnauthorized: false }
				: undefined,
	});
}

async function migrateUsers(retiradasPool) {
	const { rows } = await retiradasPool.query(`
		select
			u.uid as id,
			coalesce(u.display_name, u.imported_profile->>'nome', u.imported_profile->>'displayName', u.email) as name,
			u.email,
			u.password_hash,
			coalesce(u.role, 'analista_financeiro') as role,
			case when coalesce(u.disabled, false) then 'inativo' else 'ativo' end as status,
			u.must_change_password as trocar_senha,
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
		const roleId =
			String(user.role || "").toLowerCase() === "admin"
				? "admin"
				: String(user.role || "").toLowerCase().includes("coordenador")
					? "coordenador_financeiro"
					: "analista_financeiro";
		await finanDb.query(
			`insert into finan_users (
				id, name, email, password_hash, role_id, status,
				must_change_password, source_system, source_user_id,
				source_role, source_permissions, source_profile
			)
			values ($1, $2, $3, $4, $5, $6, $7, 'retiradas', $1, $8, $9::jsonb, $10::jsonb)
			on conflict (email) do update set
				name = excluded.name,
				password_hash = coalesce(finan_users.password_hash, excluded.password_hash),
				role_id = excluded.role_id,
				status = excluded.status,
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
				user.role || null,
				JSON.stringify(user.permissions || []),
				JSON.stringify(user.imported_profile || {}),
			],
		);
	}

	return rows.length;
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

async function main() {
	const retiradasPool = createRetiradasPool();
	try {
		const users = await migrateUsers(retiradasPool);
		const financialSnapshots = await migrateFinancialSnapshots(retiradasPool);
		console.log(
			JSON.stringify({
				ok: true,
				usersMigrated: users,
				financialSnapshots,
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
