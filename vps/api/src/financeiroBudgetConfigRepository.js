const crypto = require("node:crypto");
const db = require("./db");
const {
	enrichFinancialAccountWithCategory,
} = require("./financeiroAccountCategories");

const CONFIG_COLLECTION = "financeiro_config";
const COST_CENTERS_ID = "orcamento_centros_custo";
const BUDGET_DATA_ID = "orcamento_dados";
const DASHBOARD_ID = "dashboard";
const SHEETS_ID = "google_sheets";

function stableStringify(value) {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
	if (value && typeof value === "object") {
		return `{${Object.keys(value)
			.sort()
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

function dateOnly(value) {
	const raw = text(value);
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
	const parsed = raw ? new Date(raw) : null;
	return parsed && !Number.isNaN(parsed.getTime())
		? parsed.toISOString().slice(0, 10)
		: null;
}

function timestamp(value, fallback = new Date().toISOString()) {
	const raw = text(value);
	const parsed = raw ? new Date(raw) : null;
	return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : fallback;
}

function sqlJson(value) {
	return JSON.stringify(value ?? null);
}

function sourceHash(kind, legacyPath, item) {
	return hash({ kind, legacyPath, item });
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

async function replaceRows(client, table, rows, conflictTarget) {
	await client.query(`delete from ${table}`);
	return upsertMany(client, table, rows, conflictTarget);
}

async function saveMeta(client, configId, data = {}, user = {}) {
	const path = `${CONFIG_COLLECTION}/${configId}`;
	await client.query(
		`insert into financeiro_config_meta (
			config_id, data, legacy_path, legacy_document_id,
			created_by, updated_by, source_payload
		)
		values ($1, $2::jsonb, $3, $4, $5, $6, $2::jsonb)
		on conflict (config_id) do update set
			data = excluded.data,
			legacy_path = excluded.legacy_path,
			legacy_document_id = excluded.legacy_document_id,
			updated_by = excluded.updated_by,
			source_payload = excluded.source_payload`,
		[
			configId,
			sqlJson(data || {}),
			path,
			configId,
			text(user?.uid || user?.id || user?.email),
			text(user?.uid || user?.id || user?.email),
		],
	);
}

async function getMeta(configId) {
	const result = await db.query(
		`select data, source_payload from financeiro_config_meta where config_id = $1`,
		[configId],
	);
	const row = result.rows[0];
	return row?.data || row?.source_payload || {};
}

function mapSource(row = {}, fallback = {}) {
	return { ...(row.source_payload || {}), ...fallback };
}

function normalizeDirectorates(config = {}) {
	return (config.settings?.directorates || [])
		.filter((item) => item && typeof item === "object")
		.map((item) => ({
			id: slug(item.id || item.nome || item.name, `diretoria-${hash(item).slice(0, 12)}`),
			nome: text(item.nome || item.name || item.diretoria),
			diretor_nome: text(item.diretor || item.director || item.responsavel),
			diretor_email: text(item.emailDiretor || item.directorEmail || item.email),
			diretor_numero: text(item.numeroDiretor || item.telefoneDiretor || item.telefone),
			legacy_path: `${CONFIG_COLLECTION}/${COST_CENTERS_ID}`,
			legacy_document_id: COST_CENTERS_ID,
			source_payload: item,
		}));
}

function directorateLookup(directorates = []) {
	return new Map(
		directorates.flatMap((item) => [
			[item.id, item.id],
			[slug(item.nome, ""), item.id],
		]),
	);
}

function normalizeAccounts(config = {}) {
	return (config.accounts || []).map((item, index) => {
		const enriched = enrichFinancialAccountWithCategory(item);
		return {
			id: text(item.id || item.codigo || `conta-${index + 1}`),
			codigo: text(item.codigo || item.reduzida || item.id),
			nome: text(item.nome || item.name || "Conta financeira"),
			tipo: text(item.tipo || "despesa"),
			grupo: text(item.grupo || item.dreGroup || item.categoria),
			categoria_mae: enriched.categoriaMae,
			categoria_classe: enriched.categoriaClasse,
			status: text(item.status || "ativo"),
			parent_id: text(item.parentId || item.parent_id || item.parentCodigo) || null,
			legacy_path: `${CONFIG_COLLECTION}/${COST_CENTERS_ID}`,
			legacy_document_id: COST_CENTERS_ID,
			source_payload: enriched,
		};
	});
}

function normalizeCenters(config = {}, diretoriaByKey = new Map()) {
	return (config.centers || []).map((item, index) => {
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
			legacy_path: `${CONFIG_COLLECTION}/${COST_CENTERS_ID}`,
			legacy_document_id: COST_CENTERS_ID,
			source_payload: item,
		};
	});
}

function normalizePartners(config = {}) {
	return (config.partners || []).map((item, index) => ({
		id: text(item.id || item.codigo || item.cnpj || `fornecedor-${index + 1}`),
		codigo: text(item.codigo || item.id),
		nome: text(item.nome || item.razaoSocial || "Fornecedor"),
		cnpj: text(item.cnpj).replace(/\D/g, ""),
		status: text(item.status || "ativo"),
		legacy_path: `${CONFIG_COLLECTION}/${COST_CENTERS_ID}`,
		legacy_document_id: COST_CENTERS_ID,
		source_payload: item,
	}));
}

function normalizeCompanies(config = {}) {
	return (config.companies || []).map((item, index) => ({
		id: text(item.id || item.codigo || `matriz-${index + 1}`),
		nome: text(item.nome || item.razaoSocial || "Matriz"),
		nome_fantasia: text(item.nomeFantasia || item.fantasia),
		cidade: text(item.cidade),
		cnpj: text(item.cnpj).replace(/\D/g, ""),
		status: text(item.status || "ativo"),
		legacy_path: `${CONFIG_COLLECTION}/${COST_CENTERS_ID}`,
		legacy_document_id: COST_CENTERS_ID,
		source_payload: item,
	}));
}

function normalizeBranches(config = {}) {
	const companies = new Set((config.companies || []).map((item) => text(item.id)).filter(Boolean));
	return (config.branches || []).flatMap((item, index) => {
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
			legacy_path: `${CONFIG_COLLECTION}/${COST_CENTERS_ID}`,
			legacy_document_id: COST_CENTERS_ID,
			source_payload: { ...item, matrizId: companyId },
		}));
	});
}

function normalizeMatrix(config = {}) {
	return (config.matrix || []).flatMap((item) => {
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
				legacy_path: `${CONFIG_COLLECTION}/${COST_CENTERS_ID}`,
				legacy_document_id: COST_CENTERS_ID,
				source_payload: payload,
			};
		});
	});
}

function normalizeBudgetRows(data = {}) {
	return (data.rows || []).map((item, index) => ({
		id: `orc_lanc_${hash({
			path: `${CONFIG_COLLECTION}/${BUDGET_DATA_ID}`,
			item,
			index,
		}).slice(0, 24)}`,
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
		source_hash: sourceHash("financeiro_orcamento_lancamento", `${CONFIG_COLLECTION}/${BUDGET_DATA_ID}`, {
			...item,
			position: index,
		}),
		legacy_path: `${CONFIG_COLLECTION}/${BUDGET_DATA_ID}`,
		legacy_document_id: BUDGET_DATA_ID,
		source_payload: { ...item, position: index },
	}));
}

async function saveBudgetCostCenters(config = {}, user = {}) {
	const directorates = normalizeDirectorates(config);
	const diretoriaByKey = directorateLookup(directorates);
	const client = await db.connect();
	try {
		await client.query("begin");
		await client.query("set constraints all deferred");
		await client.query("delete from financeiro_orcamento_matriz");
		await client.query("delete from financeiro_filiais");
		await client.query("delete from financeiro_centros_custo");
		await client.query("delete from financeiro_diretorias");
		await client.query("delete from financeiro_fornecedores");
		await client.query("delete from financeiro_matrizes");
		await client.query("delete from financeiro_contas");
		await saveMeta(client, COST_CENTERS_ID, config, user);
		await replaceRows(client, "financeiro_diretorias", directorates, ["id"]);
		await replaceRows(client, "financeiro_contas", normalizeAccounts(config), ["id"]);
		await replaceRows(client, "financeiro_matrizes", normalizeCompanies(config), ["id"]);
		await replaceRows(client, "financeiro_centros_custo", normalizeCenters(config, diretoriaByKey), ["id"]);
		await replaceRows(client, "financeiro_fornecedores", normalizePartners(config), ["id"]);
		await replaceRows(client, "financeiro_filiais", normalizeBranches(config), ["matriz_id", "id"]);
		await replaceRows(client, "financeiro_orcamento_matriz", normalizeMatrix(config), [
			"ano",
			"mes",
			"conta_id",
			"centro_custo_id",
			"versao_id",
		]);
		await client.query("commit");
	} catch (error) {
		await client.query("rollback").catch(() => undefined);
		throw error;
	} finally {
		client.release();
	}
	return config;
}

async function saveBudgetData(data = {}, user = {}) {
	const rows = normalizeBudgetRows(data);
	const client = await db.connect();
	try {
		await client.query("begin");
		await saveMeta(client, BUDGET_DATA_ID, data, user);
		await replaceRows(client, "financeiro_orcamento_lancamentos", rows, ["source_hash"]);
		await client.query("commit");
	} catch (error) {
		await client.query("rollback").catch(() => undefined);
		throw error;
	} finally {
		client.release();
	}
	return data;
}

async function saveConfig(configId, data = {}, user = {}) {
	const client = await db.connect();
	try {
		await client.query("begin");
		await saveMeta(client, configId, data, user);
		await client.query("commit");
	} catch (error) {
		await client.query("rollback").catch(() => undefined);
		throw error;
	} finally {
		client.release();
	}
	return data;
}

function mapAccount(row = {}) {
	return enrichFinancialAccountWithCategory(mapSource(row, {
		id: row.id,
		codigo: row.codigo || "",
		nome: row.nome || "",
		tipo: row.tipo || "",
		grupo: row.grupo || "",
		categoriaMae: row.categoria_mae || "",
		categoriaClasse: row.categoria_classe || "",
		status: row.status || "",
		parentId: row.parent_id || "",
	}));
}

function mapDirectorate(row = {}) {
	return mapSource(row, {
		id: row.id,
		nome: row.nome || "",
		diretor: row.diretor_nome || "",
		emailDiretor: row.diretor_email || "",
		numeroDiretor: row.diretor_numero || "",
	});
}

function mapCenter(row = {}, directorateById = new Map()) {
	const source = row.source_payload || {};
	const diretoria = source.diretoria || directorateById.get(row.diretoria_id)?.nome || "";
	return {
		...source,
		id: row.id,
		codigo: row.codigo || source.codigo || "",
		nome: row.nome || source.nome || "",
		tipoCentro: row.tipo_centro || source.tipoCentro || "",
		parentId: row.parent_id || source.parentId || "",
		diretoria,
		status: row.status || source.status || "",
		tipoDespesa: row.tipo_despesa || source.tipoDespesa || "",
	};
}

function mapPartner(row = {}) {
	return mapSource(row, {
		id: row.id,
		codigo: row.codigo || "",
		nome: row.nome || "",
		cnpj: row.cnpj || "",
		status: row.status || "",
	});
}

function mapCompany(row = {}) {
	return mapSource(row, {
		id: row.id,
		nome: row.nome || "",
		nomeFantasia: row.nome_fantasia || "",
		cidade: row.cidade || "",
		cnpj: row.cnpj || "",
		status: row.status || "",
	});
}

function mapBranchRows(rows = []) {
	const byId = new Map();
	for (const row of rows) {
		const source = row.source_payload || {};
		const current = byId.get(row.id) || {
			...source,
			id: row.id,
			nome: row.nome || source.nome || "",
			nomeFantasia: row.nome_fantasia || source.nomeFantasia || "",
			cidade: row.cidade || source.cidade || "",
			cnpj: row.cnpj || source.cnpj || "",
			status: row.status || source.status || "",
			empresas: [],
			companies: [],
		};
		current.empresas = [...new Set([...(current.empresas || []), row.matriz_id].filter(Boolean))];
		current.companies = [...new Set([...(current.companies || []), row.matriz_id].filter(Boolean))];
		current.empresaId = current.empresaId || row.matriz_id || "";
		byId.set(row.id, current);
	}
	return [...byId.values()];
}

function mapMatrix(rows = []) {
	const byKey = new Map();
	for (const row of rows) {
		const key = `${row.ano}:${row.conta_id}:${row.centro_custo_id}:${row.versao_id}`;
		const current = byKey.get(key) || {
			...(row.source_payload || {}),
			id:
				row.source_payload?.id ||
				`importado-${row.ano}-${row.conta_id}-${row.centro_custo_id}`,
			year: Number(row.ano || 0),
			accountId: row.conta_id || "",
			costCenterId: row.centro_custo_id || "",
			versionId: row.versao_id || "budget",
			months: Array(12).fill(0),
		};
		current.months[Number(row.mes) - 1] = Number(row.orcado || 0);
		current.total = money(current.months.reduce((sum, value) => sum + money(value), 0));
		byKey.set(key, current);
	}
	return [...byKey.values()];
}

async function getBudgetCostCenters() {
	const [
		meta,
		accounts,
		directorates,
		centers,
		partners,
		companies,
		branches,
		matrix,
	] = await Promise.all([
		getMeta(COST_CENTERS_ID),
		db.query("select * from financeiro_contas order by codigo nulls last, id"),
		db.query("select * from financeiro_diretorias order by nome"),
		db.query("select * from financeiro_centros_custo order by codigo nulls last, id"),
		db.query("select * from financeiro_fornecedores order by nome"),
		db.query("select * from financeiro_matrizes order by id"),
		db.query("select * from financeiro_filiais order by matriz_id, id"),
		db.query("select * from financeiro_orcamento_matriz order by ano, conta_id, centro_custo_id, mes"),
	]);
	const mappedDirectorates = directorates.rows.map(mapDirectorate);
	const directorateById = new Map(mappedDirectorates.map((item) => [item.id, item]));
	return {
		...meta,
		accounts: accounts.rows.map(mapAccount),
		centers: centers.rows.map((row) => mapCenter(row, directorateById)),
		partners: partners.rows.map(mapPartner),
		companies: companies.rows.map(mapCompany),
		branches: mapBranchRows(branches.rows),
		matrix: mapMatrix(matrix.rows),
		settings: {
			...(meta.settings || {}),
			directorates: mappedDirectorates.length
				? mappedDirectorates
				: meta.settings?.directorates || [],
		},
	};
}

async function getBudgetData() {
	const [meta, rows] = await Promise.all([
		getMeta(BUDGET_DATA_ID),
		db.query(
			`select * from financeiro_orcamento_lancamentos
			  order by (source_payload->>'position')::int nulls last, data nulls last, id`,
		),
	]);
	return {
		...meta,
		rows: rows.rows.map((row) =>
			mapSource(row, {
				id: row.source_payload?.id || row.id,
				ano: Number(row.ano || 0) || "",
				numMes: Number(row.mes || 0) || "",
				data: row.data ? timestamp(row.data).slice(0, 10) : "",
				codConta: row.conta_id || "",
				codCc: row.centro_custo_id || "",
				codFornecedor: row.fornecedor_id || "",
				empresaId: row.empresa_id || "",
				filialId: row.filial_id || "",
				orcado: Number(row.orcado || 0),
				realizado: Number(row.realizado || 0),
			}),
		),
	};
}

async function getBudgetConfiguration() {
	return getBudgetCostCenters();
}

async function saveBudgetConfiguration(config = {}, user = {}) {
	return saveBudgetCostCenters(config, user);
}

async function getImportedBudgetRows() {
	return getBudgetData();
}

async function saveImportedBudgetRows(data = {}, user = {}) {
	return saveBudgetData(data, user);
}

module.exports = {
	getBudgetConfiguration,
	getBudgetCostCenters,
	getBudgetData,
	getImportedBudgetRows,
	getConfig: getMeta,
	saveBudgetConfiguration,
	saveBudgetCostCenters,
	saveBudgetData,
	saveImportedBudgetRows,
	saveConfig,
	ids: {
		COST_CENTERS_ID,
		BUDGET_DATA_ID,
		DASHBOARD_ID,
		SHEETS_ID,
	},
};
