const crypto = require("node:crypto");
const db = require("../api/src/db");

const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");
const JSON_MODE = process.argv.includes("--json");
const CONFIG_COLLECTION = "financeiro_config";
const COST_CENTERS_PATH = "financeiro_config/orcamento_centros_custo";
const BUDGET_DATA_PATH = "financeiro_config/orcamento_dados";

function stableStringify(value) {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
	if (value && typeof value === "object") {
		// Comparador explicito por code unit (nao localeCompare): o hash
		// precisa ser deterministico entre maquinas/locales diferentes, e
		// localeCompare pode variar por ICU/locale do ambiente de execucao.
		return `{${Object.keys(value)
			.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
			.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

function hash(value) {
	return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function deterministicUuid(value) {
	const hex = hash(value).slice(0, 32);
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${(
		(Number.parseInt(hex.slice(16, 18), 16) & 0x3f) |
		0x80
	)
		.toString(16)
		.padStart(2, "0")}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;
}

function text(value) {
	return String(value ?? "").trim();
}

function slug(value, fallback = "") {
	const result = text(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return result || fallback;
}

function number(value) {
	if (typeof value === "number") return Number.isFinite(value) ? value : 0;
	const normalized = text(value)
		.replace(/[R$\s]/g, "")
		.replace(/\.(?=\d{3}(\D|$))/g, "")
		.replace(",", ".");
	const parsed = Number(normalized || 0);
	return Number.isFinite(parsed) ? parsed : 0;
}

function int(value) {
	return Math.trunc(number(value));
}

function money(value) {
	return Math.round(number(value) * 100) / 100;
}

function timestamp(value, fallback = new Date().toISOString()) {
	const raw = text(value);
	const parsed = raw ? new Date(raw) : null;
	return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : fallback;
}

function dateOnly(value) {
	const raw = text(value);
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
	const parsed = raw ? new Date(raw) : null;
	return parsed && !Number.isNaN(parsed.getTime())
		? parsed.toISOString().slice(0, 10)
		: null;
}

function sqlJson(value) {
	return JSON.stringify(value ?? null);
}

function sourceHash(kind, legacyPath, item) {
	return hash({ kind, legacyPath, item });
}

async function readDocuments() {
	const result = await db.query(
		`select path, collection_path as "collectionPath", document_id as "documentId",
		        data, updated_at as "updatedAt"
		   from app_documents
		  where collection_path = $1
		  order by path`,
		[CONFIG_COLLECTION],
	);
	return result.rows;
}

function normalizeDirectorates(configDoc) {
	const directorates = configDoc?.data?.settings?.directorates || [];
	return directorates
		.filter((item) => item && typeof item === "object")
		.map((item) => ({
			id: slug(item.id || item.nome || item.name, `diretoria-${hash(item).slice(0, 12)}`),
			nome: text(item.nome || item.name || item.diretoria),
			diretor_nome: text(item.diretor || item.director || item.responsavel),
			diretor_email: text(item.emailDiretor || item.directorEmail || item.email),
			diretor_numero: text(item.numeroDiretor || item.telefoneDiretor || item.telefone),
			legacy_path: configDoc.path,
			legacy_document_id: configDoc.documentId,
			created_at: timestamp(item.criadoEm || configDoc.updatedAt),
			updated_at: timestamp(item.atualizadoEm || configDoc.updatedAt),
			source_payload: item,
		}));
}

function directorateLookup(directorates) {
	return new Map(
		directorates.flatMap((item) => [
			[item.id, item.id],
			[slug(item.nome, ""), item.id],
		]),
	);
}

function normalizeAccounts(configDoc) {
	return (configDoc?.data?.accounts || []).map((item, index) => ({
		id: text(item.id || item.codigo || `conta-${index + 1}`),
		codigo: text(item.codigo || item.reduzida || item.id),
		nome: text(item.nome || item.name || "Conta financeira"),
		tipo: text(item.tipo || "despesa"),
		grupo: text(item.grupo || item.dreGroup || item.categoria),
		status: text(item.status || "ativo"),
		parent_id: text(item.parentId || item.parent_id || item.parentCodigo) || null,
		legacy_path: configDoc.path,
		legacy_document_id: configDoc.documentId,
		created_at: timestamp(item.criadoEm || configDoc.updatedAt),
		updated_at: timestamp(item.atualizadoEm || configDoc.updatedAt),
		source_payload: item,
	}));
}

function normalizeCenters(configDoc, diretoriaByKey) {
	return (configDoc?.data?.centers || []).map((item, index) => {
		const diretoriaKey = slug(item.diretoria || item.diretoriaId, "");
		return {
			id: text(item.id || item.codigo || `centro-${index + 1}`),
			codigo: text(item.codigo || item.reduzida || item.id),
			nome: text(item.nome || item.name || "Centro de custo"),
			tipo_centro: text(item.tipoCentro || item.tipo_centro || item.tipo),
			parent_id: text(item.parentId || item.parent_id || item.parentCodigo) || null,
			diretoria_id: diretoriaByKey.get(diretoriaKey) || text(item.diretoriaId) || null,
			status: text(item.status || "ativo"),
			tipo_despesa: text(item.tipoDespesa || item.tipo_despesa || "opex"),
			legacy_path: configDoc.path,
			legacy_document_id: configDoc.documentId,
			created_at: timestamp(item.criadoEm || configDoc.updatedAt),
			updated_at: timestamp(item.atualizadoEm || configDoc.updatedAt),
			source_payload: item,
		};
	});
}

function normalizePartners(configDoc) {
	return (configDoc?.data?.partners || []).map((item, index) => ({
		id: text(item.id || item.codigo || item.cnpj || `fornecedor-${index + 1}`),
		codigo: text(item.codigo || item.id),
		nome: text(item.nome || item.razaoSocial || "Fornecedor"),
		cnpj: text(item.cnpj).replace(/\D/g, ""),
		status: text(item.status || "ativo"),
		legacy_path: configDoc.path,
		legacy_document_id: configDoc.documentId,
		created_at: timestamp(item.criadoEm || configDoc.updatedAt),
		updated_at: timestamp(item.atualizadoEm || configDoc.updatedAt),
		source_payload: item,
	}));
}

function normalizeCompanies(configDoc) {
	return (configDoc?.data?.companies || []).map((item, index) => ({
		id: text(item.id || item.codigo || `matriz-${index + 1}`),
		nome: text(item.nome || item.razaoSocial || "Matriz"),
		nome_fantasia: text(item.nomeFantasia || item.fantasia),
		cidade: text(item.cidade),
		cnpj: text(item.cnpj).replace(/\D/g, ""),
		status: text(item.status || "ativo"),
		legacy_path: configDoc.path,
		legacy_document_id: configDoc.documentId,
		created_at: timestamp(item.criadoEm || configDoc.updatedAt),
		updated_at: timestamp(item.atualizadoEm || configDoc.updatedAt),
		source_payload: item,
	}));
}

function normalizeBranches(configDoc) {
	const companies = new Set((configDoc?.data?.companies || []).map((item) => text(item.id)).filter(Boolean));
	return (configDoc?.data?.branches || []).flatMap((item, index) => {
		const companyIds = [
			text(item.empresaId || item.companyId),
			...(Array.isArray(item.empresas) ? item.empresas.map(text) : []),
			...(Array.isArray(item.companies) ? item.companies.map(text) : []),
		].filter(Boolean);
		const uniqueCompanies = [...new Set(companyIds)].filter((companyId) => companies.has(companyId));
		const targets = uniqueCompanies.length ? uniqueCompanies : [...companies].slice(0, 1);
		return targets.map((companyId) => ({
			id: text(item.id || item.codigo || `filial-${index + 1}`),
			matriz_id: companyId,
			nome: text(item.nome || item.razaoSocial || "Filial"),
			nome_fantasia: text(item.nomeFantasia || item.fantasia),
			cidade: text(item.cidade),
			cnpj: text(item.cnpj).replace(/\D/g, ""),
			status: text(item.status || "ativo"),
			legacy_path: configDoc.path,
			legacy_document_id: configDoc.documentId,
			created_at: timestamp(item.criadoEm || configDoc.updatedAt),
			updated_at: timestamp(item.atualizadoEm || configDoc.updatedAt),
			source_payload: { ...item, matrizId: companyId },
		}));
	});
}

function normalizeMatrix(configDoc) {
	return (configDoc?.data?.matrix || []).flatMap((item) => {
		const months = Array.isArray(item.months) ? item.months : [];
		return Array.from({ length: 12 }, (_, monthIndex) => {
			const mes = monthIndex + 1;
			const payload = { ...item, month: mes, monthValue: months[monthIndex] || 0 };
			return {
				id: deterministicUuid({ kind: "orcamento_matriz", payload }),
				ano: int(item.year || item.ano),
				mes,
				conta_id: text(item.accountId || item.contaId),
				centro_custo_id: text(item.costCenterId || item.centroCustoId),
				versao_id: text(item.versionId || item.versaoId || "budget"),
				orcado: money(months[monthIndex] || item[`m${mes}`]),
				realizado: money(item.realizado || 0),
				comprometido: money(item.comprometido || 0),
				legacy_path: configDoc.path,
				legacy_document_id: configDoc.documentId,
				created_at: timestamp(item.criadoEm || configDoc.updatedAt),
				updated_at: timestamp(item.atualizadoEm || configDoc.updatedAt),
				source_payload: payload,
			};
		});
	});
}

function normalizeBudgetRows(dataDoc) {
	return (dataDoc?.data?.rows || []).map((item, index) => ({
		id: `orc_lanc_${hash({ path: dataDoc.path, item, index }).slice(0, 24)}`,
		ano: int(item.ano),
		mes: int(item.numMes || item.mes),
		data: dateOnly(item.data),
		conta_id: text(item.codConta || item.accountId || item.contaId),
		centro_custo_id: text(item.codCc || item.centerId || item.centroCustoId),
		fornecedor_id: text(item.codFornecedor || item.fornecedorId),
		empresa_id: text(item.empresaId || item.empresa),
		filial_id: text(item.filialId || item.filial),
		orcado: money(item.orcado),
		realizado: money(item.realizado),
		source_hash: sourceHash("financeiro_orcamento_lancamento", dataDoc.path, {
			...item,
			position: index,
		}),
		legacy_path: dataDoc.path,
		legacy_document_id: dataDoc.documentId,
		created_at: timestamp(item.criadoEm || dataDoc.updatedAt),
		updated_at: timestamp(item.atualizadoEm || dataDoc.updatedAt),
		source_payload: { ...item, position: index },
	}));
}

function normalizeMeta(doc) {
	return {
		config_id: doc.documentId,
		data: doc.data || {},
		legacy_path: doc.path,
		legacy_document_id: doc.documentId,
		created_at: timestamp(doc.data?.createdAt || doc.updatedAt),
		updated_at: timestamp(doc.data?.updatedAt || doc.updatedAt),
		source_payload: doc.data || {},
	};
}

function getFinancialCategoryBudgets(data = {}) {
	const budgets = data?.settings?.financialCategoryBudgets;
	return Array.isArray(budgets)
		? budgets.filter((item) => item && typeof item === "object")
		: [];
}

async function readExistingFinancialCategoryBudgets(client) {
	const result = await client.query(
		"select data from financeiro_config_meta where config_id = $1 limit 1",
		["orcamento_centros_custo"],
	);
	return getFinancialCategoryBudgets(result.rows[0]?.data || {});
}

function preserveFinancialCategoryBudgets(rows, existingBudgets = []) {
	if (!existingBudgets.length) return rows;
	const metas = rows.metas.map((meta) => {
		if (meta.config_id !== "orcamento_centros_custo") return meta;
		const currentBudgets = getFinancialCategoryBudgets(meta.data || {});
		if (currentBudgets.length) return meta;
		const data = {
			...(meta.data || {}),
			settings: {
				...(meta.data?.settings || {}),
				financialCategoryBudgets: existingBudgets,
			},
		};
		return {
			...meta,
			data,
			source_payload: data,
		};
	});
	return { ...rows, metas };
}

function buildRows(documents) {
	const byPath = new Map(documents.map((doc) => [doc.path, doc]));
	const configDoc = byPath.get(COST_CENTERS_PATH) || {};
	const dataDoc = byPath.get(BUDGET_DATA_PATH) || {};
	const diretorias = normalizeDirectorates(configDoc);
	const diretoriaByKey = directorateLookup(diretorias);
	return {
		metas: documents.map(normalizeMeta),
		diretorias,
		contas: normalizeAccounts(configDoc),
		centros: normalizeCenters(configDoc, diretoriaByKey),
		fornecedores: normalizePartners(configDoc),
		matrizes: normalizeCompanies(configDoc),
		filiais: normalizeBranches(configDoc),
		matriz: normalizeMatrix(configDoc),
		lancamentos: normalizeBudgetRows(dataDoc),
	};
}

async function upsertMany(client, table, rows, conflictTarget) {
	if (!rows.length) return 0;
	const columns = Object.keys(rows[0]);
	const placeholders = rows.map(
		(_, rowIndex) =>
			`(${columns.map((__, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`).join(", ")})`,
	);
	const updates = columns
		.filter((column) => !conflictTarget.includes(column) && column !== "created_at")
		.map((column) => `${column} = excluded.${column}`)
		.join(", ");
	const values = rows.flatMap((row) =>
		columns.map((column) =>
			row[column] && typeof row[column] === "object"
				? sqlJson(row[column])
				: row[column],
		),
	);
	await client.query(
		`insert into ${table} (${columns.join(", ")})
		 values ${placeholders.join(", ")}
		 on conflict (${conflictTarget.join(", ")}) do update set ${updates}`,
		values,
	);
	return rows.length;
}

async function applyRows(rows) {
	const client = await db.connect();
	try {
		await client.query("begin");
		await client.query("set constraints all deferred");
		const existingFinancialCategoryBudgets =
			await readExistingFinancialCategoryBudgets(client);
		const rowsToApply = preserveFinancialCategoryBudgets(
			rows,
			existingFinancialCategoryBudgets,
		);
		await client.query("delete from financeiro_orcamento_lancamentos");
		await client.query("delete from financeiro_orcamento_matriz");
		await client.query("delete from financeiro_filiais");
		await client.query("delete from financeiro_centros_custo");
		await client.query("delete from financeiro_diretorias");
		await client.query("delete from financeiro_fornecedores");
		await client.query("delete from financeiro_matrizes");
		await client.query("delete from financeiro_contas");
		await client.query("delete from financeiro_config_meta");
		await upsertMany(client, "financeiro_config_meta", rowsToApply.metas, [
			"config_id",
		]);
		await upsertMany(client, "financeiro_diretorias", rowsToApply.diretorias, [
			"id",
		]);
		await upsertMany(client, "financeiro_contas", rowsToApply.contas, ["id"]);
		await upsertMany(client, "financeiro_matrizes", rowsToApply.matrizes, [
			"id",
		]);
		await upsertMany(client, "financeiro_centros_custo", rowsToApply.centros, [
			"id",
		]);
		await upsertMany(client, "financeiro_fornecedores", rowsToApply.fornecedores, [
			"id",
		]);
		await upsertMany(client, "financeiro_filiais", rowsToApply.filiais, [
			"matriz_id",
			"id",
		]);
		await upsertMany(
			client,
			"financeiro_orcamento_matriz",
			rowsToApply.matriz,
			["ano", "mes", "conta_id", "centro_custo_id", "versao_id"],
		);
		await upsertMany(
			client,
			"financeiro_orcamento_lancamentos",
			rowsToApply.lancamentos,
			["source_hash"],
		);
		await client.query("commit");
	} catch (error) {
		await client.query("rollback").catch(() => undefined);
		throw error;
	} finally {
		client.release();
	}
}

async function hasNormalizedBudgetData() {
	const result = await db.query(
		`select
			(select count(*)::int from financeiro_contas) as contas_count,
			(select count(*)::int from financeiro_centros_custo) as centros_count,
			(select count(*)::int from financeiro_orcamento_lancamentos) as lancamentos_count`,
	);
	const row = result.rows[0] || {};
	return (
		Number(row.contas_count || 0) > 0 ||
		Number(row.centros_count || 0) > 0 ||
		Number(row.lancamentos_count || 0) > 0
	);
}

function groupSums(rows) {
	const map = new Map();
	for (const row of rows) {
		const key = `${row.ano || 0}-${String(row.mes || 0).padStart(2, "0")}`;
		const current = map.get(key) || { key, rows: 0, orcado: 0, realizado: 0 };
		current.rows += 1;
		current.orcado += money(row.orcado);
		current.realizado += money(row.realizado);
		map.set(key, current);
	}
	return [...map.values()]
		.sort((left, right) => left.key.localeCompare(right.key))
		.map((item) => ({
			...item,
			orcado: money(item.orcado),
			realizado: money(item.realizado),
		}));
}

async function dbCounts() {
	const result = await db.query(
		`select 'financeiro_contas' as table_name, count(*)::int as count from financeiro_contas
		  union all select 'financeiro_centros_custo', count(*)::int from financeiro_centros_custo
		  union all select 'financeiro_fornecedores', count(*)::int from financeiro_fornecedores
		  union all select 'financeiro_matrizes', count(*)::int from financeiro_matrizes
		  union all select 'financeiro_filiais', count(*)::int from financeiro_filiais
		  union all select 'financeiro_diretorias', count(*)::int from financeiro_diretorias
		  union all select 'financeiro_orcamento_matriz', count(*)::int from financeiro_orcamento_matriz
		  union all select 'financeiro_orcamento_lancamentos', count(*)::int from financeiro_orcamento_lancamentos
		  union all select 'financeiro_config_meta', count(*)::int from financeiro_config_meta`,
	);
	return Object.fromEntries(result.rows.map((row) => [row.table_name, row.count]));
}

async function run() {
	const documents = await readDocuments();
	const rows = buildRows(documents);
	const report = {
		mode: APPLY ? "apply" : "dry-run",
		source: {
			collection: CONFIG_COLLECTION,
			documents: documents.length,
			accounts: rows.contas.length,
			centers: rows.centros.length,
			partners: rows.fornecedores.length,
			companies: rows.matrizes.length,
			branches: rows.filiais.length,
			directorates: rows.diretorias.length,
			matrixRows: rows.matriz.length,
			budgetRows: rows.lancamentos.length,
		},
		validation: {
			budgetRowsByPeriod: groupSums(rows.lancamentos),
			matrixByPeriod: groupSums(rows.matriz),
			distinctLegacyPaths: new Set([
				...rows.metas.map((row) => row.legacy_path),
				...rows.contas.map((row) => row.legacy_path),
				...rows.centros.map((row) => row.legacy_path),
				...rows.lancamentos.map((row) => row.legacy_path),
			]).size,
		},
	};
	if (APPLY) {
		if (!FORCE && (await hasNormalizedBudgetData())) {
			report.skipped = true;
			report.reason =
				"Financeiro orçamento já possui dados normalizados; migração legada ignorada para não sobrescrever produção.";
			report.database = await dbCounts();
			if (JSON_MODE) {
				console.log(JSON.stringify(report, null, 2));
			} else {
				console.log(report.reason);
			}
			return;
		}
		await applyRows(rows);
		report.database = await dbCounts();
	}
	if (JSON_MODE) {
		console.log(JSON.stringify(report, null, 2));
	} else {
		console.log(`Modo: ${report.mode}`);
		console.table(report.source);
		console.log("Somas de lancamentos por periodo:");
		console.table(report.validation.budgetRowsByPeriod);
		console.log("Somas de matriz por periodo:");
		console.table(report.validation.matrixByPeriod);
		if (report.database) {
			console.log("Contagens no banco:");
			console.table(report.database);
		}
	}
	await db.closePool?.();
}

run().catch(async (error) => {
	console.error(error);
	await db.closePool?.();
	process.exit(1);
});
