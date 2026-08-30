const crypto = require("node:crypto");
const { Pool } = require("pg");

const APPLY = process.argv.includes("--apply");
const JSON_MODE = process.argv.includes("--json");

const COLLECTIONS = Object.freeze({
	imoveis: "imoveis_administrativos",
	reajustes: "imoveis_administrativos_reajustes",
	iptu: "imoveis_administrativos_iptu",
	alugueis: "imoveis_administrativos_alugueis",
	contratos: "imoveis_administrativos_contratos",
	anexos: "imoveis_administrativos_anexos",
	aditivos: "imoveis_administrativos_aditivos",
	config: "imoveis_administrativos_config",
});

function buildPoolConfig() {
	return {
		host: process.env.PGHOST || "127.0.0.1",
		port: Number(process.env.PGPORT || 5432),
		user: process.env.PGUSER,
		password: process.env.PGPASSWORD,
		database: process.env.PGDATABASE,
		ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : false,
	};
}

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

function text(value) {
	return String(value ?? "").trim();
}

function numberValue(value) {
	if (typeof value === "number") return Number.isFinite(value) ? value : 0;
	const parsed = Number(
		text(value)
			.replace(/[R$\s]/g, "")
			.replace(/\.(?=\d{3}(\D|$))/g, "")
			.replace(",", "."),
	);
	return Number.isFinite(parsed) ? parsed : 0;
}

function intValue(value) {
	const parsed = Math.trunc(numberValue(value));
	return Number.isFinite(parsed) ? parsed : null;
}

function boolValue(value) {
	if (typeof value === "boolean") return value;
	const normalized = text(value).toLowerCase();
	if (["true", "1", "sim", "s", "ativo", "possui"].includes(normalized)) return true;
	if (["false", "0", "nao", "não", "inativo", "cancelado"].includes(normalized)) return false;
	return null;
}

function timestampValue(value, fallback = new Date().toISOString()) {
	if (!value) return fallback;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function dateOnly(value) {
	if (!value) return null;
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return value.toISOString().slice(0, 10);
	}
	if (typeof value === "number" && Number.isFinite(value)) {
		const excelEpoch = new Date(Date.UTC(1899, 11, 30));
		excelEpoch.setUTCDate(excelEpoch.getUTCDate() + Math.trunc(value));
		return excelEpoch.toISOString().slice(0, 10);
	}
	const raw = text(value);
	if (!raw) return null;
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
	const date = new Date(raw);
	return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function normalizeId(row) {
	const data = row.data || {};
	const preferred =
		text(data.seniorId || data.idSenior || data.id) ||
		text(row.document_id) ||
		hash(row.path).slice(0, 32);
	return preferred.replace(/[^\w.-]/g, "_").slice(0, 120) || hash(row.path).slice(0, 32);
}

function sourceRow(row, extra = {}) {
	return {
		legacy_path: row.path,
		legacy_document_id: row.document_id,
		created_at: timestampValue(row.data?.createdAt || row.updated_at),
		updated_at: timestampValue(row.data?.updatedAt || row.updated_at),
		source_payload: { ...(row.data || {}), ...extra },
	};
}

function normalizeImovel(row) {
	const data = row.data || {};
	const id = normalizeId(row);
	const situacao = text(data.situacao);
	const ativo =
		boolValue(data.ativo) ??
		!["inativo", "cancelado", "encerrado"].includes(situacao.toLowerCase());
	return {
		id,
		senior_id: text(data.seniorId || data.idSenior || id),
		nome: text(data.nome || data.titulo),
		base: text(data.base || data.codigoEmpresa).toUpperCase(),
		ativo,
		situacao,
		tipo_contrato: text(data.tipoContrato || data.tipo_contrato),
		classificacao: text(data.classificacao || data.ocupacao),
		endereco: text(data.endereco),
		cidade: text(data.cidade),
		estado: text(data.estado),
		bairro: text(data.bairro),
		cep: text(data.cep),
		rua: text(data.rua),
		numero: text(data.numero),
		cnpj_cpf: text(data.cnpjCpf || data.cnpj),
		diretoria: text(data.diretoria),
		valor_aluguel: numberValue(data.valorAluguel),
		valor_original: numberValue(data.valorOriginal),
		valor_m2: numberValue(data.valorM2),
		metros_quadrados: numberValue(data.metrosQuadrados || data.m2),
		vencimento_aluguel_dia: intValue(data.vencimentoAluguelDia),
		contrato_inicio: dateOnly(data.contratoInicio),
		contrato_fim: dateOnly(data.contratoFim || data.finalVigencia),
		mes_reajuste: intValue(data.mesReajuste),
		data_ultimo_reajuste: dateOnly(data.dataUltimoReajuste),
		encerramento: dateOnly(data.encerramento),
		data_inativacao: dateOnly(data.dataInativacao),
		motivo_inativacao: text(data.motivoInativacao),
		observacao: text(data.observacao),
		drive_root_folder_id: text(data.driveRootFolderId),
		drive_folder_id: text(data.driveFolderId),
		drive_folder_name: text(data.driveFolderName),
		maps_url: text(data.mapsUrl),
		street_view_url: text(data.streetViewUrl),
		created_by: text(data.createdBy),
		updated_by: text(data.updatedBy),
		created_by_name: text(data.createdByName),
		updated_by_name: text(data.updatedByName),
		...sourceRow(row),
	};
}

function normalizeConfig(row) {
	const data = row?.data || {};
	return {
		id: text(row?.document_id) || "geral",
		data,
		updated_by: text(data.updatedBy),
		updated_by_name: text(data.updatedByName),
		...sourceRow(row || { path: "imoveis_administrativos_config/geral", document_id: "geral", data: {} }),
	};
}

function normalizeAnexo(row, sourceCollection) {
	const data = row.data || {};
	const id = text(row.document_id) || hash(row.path).slice(0, 32);
	return {
		id,
		imovel_id: text(data.imovelId),
		source_collection: sourceCollection,
		tipo: text(data.tipo),
		categoria: text(data.categoria || (sourceCollection === COLLECTIONS.contratos ? "contrato" : "")),
		nome: text(data.nome),
		url: text(data.url),
		drive_file_id: text(data.driveFileId),
		drive_folder_id: text(data.driveFolderId),
		mime_type: text(data.mimeType),
		tamanho: numberValue(data.tamanho),
		observacao: text(data.observacao),
		data: dateOnly(data.data),
		created_by: text(data.createdBy),
		created_by_name: text(data.createdByName),
		...sourceRow(row),
	};
}

function normalizeEvento(row, sourceCollection) {
	const data = row.data || {};
	const id = text(row.document_id) || hash(row.path).slice(0, 32);
	const tipoByCollection = {
		[COLLECTIONS.reajustes]: "reajuste",
		[COLLECTIONS.iptu]: "iptu",
		[COLLECTIONS.alugueis]: "aluguel",
		[COLLECTIONS.aditivos]: "aditivo",
	};
	const ano = intValue(data.ano);
	const mes = intValue(data.mes);
	return {
		id,
		imovel_id: text(data.imovelId),
		source_collection: sourceCollection,
		tipo: text(data.tipo) || tipoByCollection[sourceCollection],
		competencia: [ano, mes ? String(mes).padStart(2, "0") : ""].filter(Boolean).join("-"),
		ano,
		mes,
		valor: numberValue(data.valor ?? data.valorNovo),
		valor_anterior: data.valorAnterior === undefined ? null : numberValue(data.valorAnterior),
		valor_novo: data.valorNovo === undefined ? null : numberValue(data.valorNovo),
		vencimento: dateOnly(data.vencimento),
		data: dateOnly(data.data || data.vencimento || data.createdAt),
		pago: boolValue(data.pago),
		descricao: text(data.descricao || data.nome),
		observacao: text(data.observacao),
		anexo_id: text(data.anexoId),
		drive_file_id: text(data.driveFileId),
		payload: data,
		created_by: text(data.createdBy),
		created_by_name: text(data.createdByName),
		...sourceRow(row),
	};
}

async function readSource(client) {
	const result = await client.query(
		`select path, collection_path, document_id, data, updated_at
		   from app_documents
		  where collection_path = any($1::text[])
		  order by collection_path, path`,
		[Object.values(COLLECTIONS)],
	);
	return result.rows;
}

function groupNormalized(rows) {
	const byCollection = new Map();
	for (const row of rows) {
		const list = byCollection.get(row.collection_path) || [];
		list.push(row);
		byCollection.set(row.collection_path, list);
	}
	return {
		imoveis: (byCollection.get(COLLECTIONS.imoveis) || []).map(normalizeImovel),
		config: (byCollection.get(COLLECTIONS.config) || []).map(normalizeConfig),
		anexos: [
			...(byCollection.get(COLLECTIONS.anexos) || []).map((row) =>
				normalizeAnexo(row, COLLECTIONS.anexos),
			),
			...(byCollection.get(COLLECTIONS.contratos) || []).map((row) =>
				normalizeAnexo(row, COLLECTIONS.contratos),
			),
		],
		eventos: [
			...(byCollection.get(COLLECTIONS.reajustes) || []).map((row) =>
				normalizeEvento(row, COLLECTIONS.reajustes),
			),
			...(byCollection.get(COLLECTIONS.iptu) || []).map((row) =>
				normalizeEvento(row, COLLECTIONS.iptu),
			),
			...(byCollection.get(COLLECTIONS.alugueis) || []).map((row) =>
				normalizeEvento(row, COLLECTIONS.alugueis),
			),
			...(byCollection.get(COLLECTIONS.aditivos) || []).map((row) =>
				normalizeEvento(row, COLLECTIONS.aditivos),
			),
		],
	};
}

async function upsertRows(client, table, rows, conflictColumns = ["id"]) {
	if (!rows.length) return 0;
	const columns = Object.keys(rows[0]);
	const values = rows.flatMap((row) =>
		columns.map((column) =>
			row[column] && typeof row[column] === "object"
				? JSON.stringify(row[column])
				: row[column],
		),
	);
	const placeholders = rows.map(
		(_, rowIndex) =>
			`(${columns.map((__, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`).join(", ")})`,
	);
	const updates = columns
		.filter((column) => !conflictColumns.includes(column) && column !== "created_at")
		.map((column) => `${column} = excluded.${column}`)
		.join(", ");
	await client.query(
		`insert into ${table} (${columns.join(", ")})
		 values ${placeholders.join(", ")}
		 on conflict (${conflictColumns.join(", ")}) do update set ${updates}`,
		values,
	);
	return rows.length;
}

async function applyMigration(client, normalized) {
	await client.query("begin");
	try {
		await upsertRows(client, "imoveis", normalized.imoveis);
		await upsertRows(client, "imoveis_config", normalized.config);
		await upsertRows(client, "imoveis_anexos", normalized.anexos);
		await upsertRows(client, "imoveis_eventos_financeiros", normalized.eventos);
		await client.query("commit");
		return {
			imoveis: normalized.imoveis.length,
			config: normalized.config.length,
			anexos: normalized.anexos.length,
			eventos: normalized.eventos.length,
		};
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	}
}

function sourceStats(rows) {
	const byCollection = {};
	for (const row of rows) {
		byCollection[row.collection_path] = (byCollection[row.collection_path] || 0) + 1;
	}
	const imoveis = rows
		.filter((row) => row.collection_path === COLLECTIONS.imoveis)
		.map(normalizeImovel);
	return {
		byCollection,
		imoveis: {
			total: imoveis.length,
			ativos: imoveis.filter((item) => item.ativo !== false).length,
			inativos: imoveis.filter((item) => item.ativo === false).length,
			cidades: new Set(imoveis.map((item) => item.cidade).filter(Boolean)).size,
			valorAluguel: Number(
				imoveis.reduce((sum, item) => sum + numberValue(item.valor_aluguel), 0).toFixed(2),
			),
		},
	};
}

async function targetStats(client) {
	const imoveis = await client.query(
		`select count(*)::int total,
		        count(*) filter (where ativo is not false)::int ativos,
		        count(*) filter (where ativo is false)::int inativos,
		        count(distinct nullif(cidade, ''))::int cidades,
		        coalesce(round(sum(valor_aluguel)::numeric, 2), 0)::float as "valorAluguel",
		        count(distinct legacy_path)::int legacy_paths
		   from imoveis`,
	);
	const anexos = await client.query(
		`select source_collection, count(*)::int total
		   from imoveis_anexos
		  group by source_collection
		  order by source_collection`,
	);
	const eventos = await client.query(
		`select source_collection, count(*)::int total
		   from imoveis_eventos_financeiros
		  group by source_collection
		  order by source_collection`,
	);
	const config = await client.query(`select count(*)::int total from imoveis_config`);
	return {
		imoveis: imoveis.rows[0],
		anexos: anexos.rows,
		eventos: eventos.rows,
		config: config.rows[0]?.total || 0,
	};
}

async function main() {
	const pool = new Pool(buildPoolConfig());
	try {
		const client = await pool.connect();
		try {
			const sourceRows = await readSource(client);
			const normalized = groupNormalized(sourceRows);
			const report = {
				apply: APPLY,
				source: sourceStats(sourceRows),
				normalized: {
					imoveis: normalized.imoveis.length,
					config: normalized.config.length,
					anexos: normalized.anexos.length,
					eventos: normalized.eventos.length,
				},
				targetBefore: await targetStats(client).catch(() => null),
			};
			if (APPLY) {
				report.applied = await applyMigration(client, normalized);
				report.targetAfter = await targetStats(client);
			}
			if (JSON_MODE) console.log(JSON.stringify(report, null, 2));
			else {
				console.log("Migracao Imoveis Administrativos");
				console.log(JSON.stringify(report, null, 2));
			}
		} finally {
			client.release();
		}
	} finally {
		await pool.end();
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
