const { Pool } = require("pg");

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

function createRetiradasPool() {
	if (!process.env.RETIRADAS_DATABASE_URL) {
		throw new Error("Informe RETIRADAS_DATABASE_URL para auditar a base atual.");
	}
	return new Pool({
		connectionString: process.env.RETIRADAS_DATABASE_URL,
		ssl:
			String(process.env.RETIRADAS_PGSSLMODE || "").toLowerCase() === "require"
				? { rejectUnauthorized: false }
				: undefined,
	});
}

async function tableExists(pool, table) {
	const { rows } = await pool.query("select to_regclass($1) as table_name", [
		`public.${table}`,
	]);
	return Boolean(rows[0]?.table_name);
}

async function countUsers(pool) {
	const { rows } = await pool.query(`
		select
			count(*)::integer as total,
			count(*) filter (where lower(coalesce(u.role, '')) = 'admin')::integer as admins,
			count(*) filter (
				where lower(coalesce(u.role, '')) <> 'admin'
					and (
						lower(coalesce(u.role, '')) like '%financeiro%'
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
					)
			)::integer as financeiros
		from app_users u
	`);
	return rows[0] || { total: 0, admins: 0, financeiros: 0 };
}

async function countFinancialTables(pool) {
	const result = [];
	for (const table of FINANCIAL_SOURCE_TABLES) {
		if (!(await tableExists(pool, table))) {
			result.push({ table, exists: false, rows: 0 });
			continue;
		}
		const { rows } = await pool.query(`select count(*)::integer as rows from ${table}`);
		result.push({ table, exists: true, rows: rows[0]?.rows || 0 });
	}
	return result;
}

async function main() {
	const pool = createRetiradasPool();
	try {
		const [users, financialTables] = await Promise.all([
			countUsers(pool),
			countFinancialTables(pool),
		]);
		const financialRows = financialTables.reduce(
			(total, table) => total + Number(table.rows || 0),
			0,
		);
		console.log(
			JSON.stringify(
				{
					ok: true,
					mode: "read-only",
					note:
						"Auditoria sem escrita: somente usuários financeiros, admins e tabelas financeiras são considerados para o Finan.",
					users,
					financialRows,
					financialTables,
				},
				null,
				2,
			),
		);
	} finally {
		await pool.end().catch(() => {});
	}
}

main().catch((error) => {
	console.error("[finan:audit-retiradas] Falha:", error);
	process.exitCode = 1;
});
