const crypto = require("node:crypto");
const { Pool } = require("pg");
const { normalizeMac, isValidMac } = require("../api/src/macUtils");

const APPLY = process.argv.includes("--apply");
const JSON_MODE = process.argv.includes("--json");

const COLLECTIONS = Object.freeze([
	"ordens_abertas",
	"match_os_abertas",
	"ordens_legadas",
	"os_acumuladas",
	"mapa_meta",
	"match_os_meta",
	"public_dashboard",
]);

const ORDER_COLLECTIONS = new Set([
	"ordens_abertas",
	"match_os_abertas",
	"ordens_legadas",
	"os_acumuladas",
]);

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

// Extraido pra achado javascript:S3358 (ternario aninhado).
function compareCodeUnit(a, b) {
	if (a < b) return -1;
	return a > b ? 1 : 0;
}

function stableStringify(value) {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
	if (value && typeof value === "object") {
		// Comparador explicito por code unit (nao localeCompare): o hash
		// precisa ser deterministico entre maquinas/locales diferentes, e
		// localeCompare pode variar por ICU/locale do ambiente de execucao.
		return `{${Object.keys(value)
			.sort(compareCodeUnit)
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

function nullableText(value) {
	const normalized = text(value);
	return normalized || null;
}

function numberValue(value) {
	if (typeof value === "number") return Number.isFinite(value) ? value : null;
	const parsed = Number(text(value).replace(",", "."));
	return Number.isFinite(parsed) ? parsed : null;
}

function intValue(value) {
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : 0;
}

function boolValue(value) {
	if (typeof value === "boolean") return value;
	const normalized = text(value).toLowerCase();
	if (["true", "1", "sim", "s"].includes(normalized)) return true;
	if (["false", "0", "nao", "não"].includes(normalized)) return false;
	return false;
}

function normalizeSource(value, collectionPath = "") {
	const normalized = text(value).toLowerCase();
	if (normalized.includes("onnet")) return "onnet";
	if (normalized.includes("sempre")) return "sempre";
	if (collectionPath === "ordens_legadas") return "legado";
	if (collectionPath === "match_os_abertas") return "match";
	return normalized || collectionPath;
}

function parseDate(value) {
	if (!value) return null;
	if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
	const raw = text(value);
	if (!raw) return null;
	const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
	if (br) {
		const [, day, month, year, hour = "00", minute = "00", second = "00"] = br;
		const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
		return Number.isNaN(date.getTime()) ? null : date.toISOString();
	}
	const date = new Date(raw);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dateOnly(value) {
	const parsed = parseDate(value);
	return parsed ? parsed.slice(0, 10) : null;
}

function documentIdFromPath(path) {
	return text(path).split("/").filter(Boolean).at(-1) || "";
}

function orderNum(data = {}, row = {}) {
	return text(data.num_os || data.num_o_s || data.os || data.numero_os || row.document_id);
}

function orderId(row) {
	const data = row.data || {};
	const numOs = orderNum(data, row);
	const source = normalizeSource(data.fonte || data.empresa, row.collection_path);
	if (numOs) return `${row.collection_path}:${source}:${numOs}`;
	return `${row.collection_path}:path:${hash(row.path).slice(0, 32)}`;
}

function normalizePhones(data = {}) {
	const phones = [
		data.telefone,
		data.telefone_primario,
		data.telefone_secundario,
		data.telefone_terciario,
		...(Array.isArray(data.telefones) ? data.telefones : []),
	]
		.map(text)
		.filter(Boolean);
	return [...new Set(phones)];
}

function normalizeMacs(data = {}) {
	const macs = Array.isArray(data.macs_equipamento)
		? data.macs_equipamento
		: [data.mac_addr, data.phy_addr];
	return [...new Set(macs.map(normalizeMac).filter(isValidMac))];
}

function normalizeOrder(row) {
	const data = row.data || {};
	const phones = normalizePhones(data);
	const numOs = orderNum(data, row);
	return {
		id: orderId(row),
		source_collection: row.collection_path,
		source: normalizeSource(data.fonte || data.empresa, row.collection_path),
		num_os: nullableText(numOs),
		codigo_cliente: nullableText(data.codigo_cliente || data.codigo || data.cod_cliente),
		nome_cliente: nullableText(data.nome_cliente || data.cliente || data.nome_razaosocial),
		telefone: nullableText(data.telefone || phones[0]),
		telefones: phones,
		empresa: nullableText(data.empresa || data.fonte),
		tipo: nullableText(data.tipo || data.servico_tipo),
		status: nullableText(data.status || data.servico_status),
		servico: nullableText(data.servico || data.descricao_servico),
		tecnico: nullableText(data.tecnico || data.tecnicos),
		cidade: nullableText(data.cidade || data.pop),
		regional: nullableText(data.regional),
		endereco: nullableText(data.endereco || data.endereco_instalacao),
		endereco_resumo: nullableText(data.endereco_resumo || data.endereco_instalacao),
		bairro: nullableText(data.bairro),
		numero: nullableText(data.numero),
		latitude: numberValue(data.latitude),
		longitude: numberValue(data.longitude),
		coordenadas: nullableText(data.coordenadas),
		data_abertura: parseDate(data.data_abertura_os || data.dataAberturaSort || data.data_inicio_programado),
		data_cadastro: parseDate(data.data_cadastro || data.savedAt),
		mac_addr: nullableText(data.mac_addr),
		phy_addr: nullableText(data.phy_addr),
		macs_equipamento: normalizeMacs(data),
		agente: boolValue(data.agente),
		legacy_path: row.path,
		legacy_document_id: row.document_id,
		created_at: parseDate(data.createdAt || data.savedAt || row.updated_at) || new Date().toISOString(),
		updated_at: parseDate(data.updatedAt || data.atualizadoEm || row.updated_at) || new Date().toISOString(),
		source_payload: data,
	};
}

function normalizeImportRun(row) {
	const data = row.data || {};
	const docId = text(row.document_id) || documentIdFromPath(row.path) || hash(row.path).slice(0, 16);
	return {
		id: `${row.collection_path}:${docId}`,
		tipo: row.collection_path === "match_os_meta" || row.path.includes("match_os") ? "match" : "mapa",
		fonte: normalizeSource(data.fonteAtualizada || data.source || data.fonte, row.collection_path),
		source_collection: row.collection_path,
		periodo_inicio: dateOnly(data.periodoInicio),
		periodo_fim: dateOnly(data.periodoFim),
		total_os: intValue(data.totalOS || data.total || data.totalGeral),
		removidas: intValue(data.removidas),
		ignoradas: intValue(data.ignoradas || data.ignoradasSemRegional || data.ignoradasPorTipo),
		legacy_path: row.path,
		legacy_document_id: row.document_id,
		created_at: parseDate(data.data || data.generatedAt || row.updated_at) || new Date().toISOString(),
		updated_at: parseDate(data.updatedAt || data.data || row.updated_at) || new Date().toISOString(),
		payload: data,
		source_payload: data,
	};
}

async function readSource(client) {
	const result = await client.query(
		`select path, collection_path, document_id, data, updated_at
		   from app_documents
		  where collection_path = any($1::text[])
		     or path in (
		       'public_dashboard/mapa_os',
		       'public_dashboard/match_os',
		       'public_dashboard/agentes_match_os',
		       'public_dashboard/mapa_os_legadas'
		     )
		  order by collection_path, path`,
		[COLLECTIONS],
	);
	return result.rows;
}

function normalizeAll(rows) {
	const orders = [];
	const importRuns = [];
	for (const row of rows) {
		if (ORDER_COLLECTIONS.has(row.collection_path)) {
			orders.push(normalizeOrder(row));
			continue;
		}
		importRuns.push(normalizeImportRun(row));
	}
	return { orders, importRuns, relationships: [] };
}

async function upsertOrders(client, rows) {
	const chunkSize = 500;
	for (let start = 0; start < rows.length; start += chunkSize) {
		const chunk = rows.slice(start, start + chunkSize);
		const values = chunk.flatMap((row) => [
			row.id,
			row.source_collection,
			row.source,
			row.num_os,
			row.codigo_cliente,
			row.nome_cliente,
			row.telefone,
			row.telefones,
			row.empresa,
			row.tipo,
			row.status,
			row.servico,
			row.tecnico,
			row.cidade,
			row.regional,
			row.endereco,
			row.endereco_resumo,
			row.bairro,
			row.numero,
			row.latitude,
			row.longitude,
			row.coordenadas,
			row.data_abertura,
			row.data_cadastro,
			row.mac_addr,
			row.phy_addr,
			JSON.stringify(row.macs_equipamento),
			row.agente,
			row.legacy_path,
			row.legacy_document_id,
			row.created_at,
			row.updated_at,
			JSON.stringify(row.source_payload),
		]);
		const placeholders = chunk
			.map((_, rowIndex) => {
				const base = rowIndex * 33;
				return `(${Array.from({ length: 33 }, (__, index) => {
					const position = base + index + 1;
					if (index === 7) return `$${position}::text[]`;
					if (index === 26 || index === 32) return `$${position}::jsonb`;
					return `$${position}`;
				}).join(",")})`;
			})
			.join(",");
		await client.query(
			`insert into ordens_servico
			 (id, source_collection, source, num_os, codigo_cliente, nome_cliente,
			  telefone, telefones, empresa, tipo, status, servico, tecnico, cidade,
			  regional, endereco, endereco_resumo, bairro, numero, latitude, longitude,
			  coordenadas, data_abertura, data_cadastro, mac_addr, phy_addr,
			  macs_equipamento, agente, legacy_path, legacy_document_id, created_at,
			  updated_at, source_payload)
			 values ${placeholders}
			 on conflict (id) do update set
			   source_collection = excluded.source_collection,
			   source = excluded.source,
			   num_os = excluded.num_os,
			   codigo_cliente = excluded.codigo_cliente,
			   nome_cliente = excluded.nome_cliente,
			   telefone = excluded.telefone,
			   telefones = excluded.telefones,
			   empresa = excluded.empresa,
			   tipo = excluded.tipo,
			   status = excluded.status,
			   servico = excluded.servico,
			   tecnico = excluded.tecnico,
			   cidade = excluded.cidade,
			   regional = excluded.regional,
			   endereco = excluded.endereco,
			   endereco_resumo = excluded.endereco_resumo,
			   bairro = excluded.bairro,
			   numero = excluded.numero,
			   latitude = excluded.latitude,
			   longitude = excluded.longitude,
			   coordenadas = excluded.coordenadas,
			   data_abertura = excluded.data_abertura,
			   data_cadastro = excluded.data_cadastro,
			   mac_addr = excluded.mac_addr,
			   phy_addr = excluded.phy_addr,
			   macs_equipamento = excluded.macs_equipamento,
			   agente = excluded.agente,
			   legacy_path = excluded.legacy_path,
			   legacy_document_id = excluded.legacy_document_id,
			   updated_at = excluded.updated_at,
			   source_payload = excluded.source_payload`,
			values,
		);
	}
}

async function upsertImportRuns(client, rows) {
	for (const row of rows) {
		await client.query(
			`insert into ordens_import_runs
			 (id, tipo, fonte, source_collection, periodo_inicio, periodo_fim, total_os,
			  removidas, ignoradas, legacy_path, legacy_document_id, created_at,
			  updated_at, payload, source_payload)
			 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb)
			 on conflict (id) do update set
			   tipo = excluded.tipo,
			   fonte = excluded.fonte,
			   source_collection = excluded.source_collection,
			   periodo_inicio = excluded.periodo_inicio,
			   periodo_fim = excluded.periodo_fim,
			   total_os = excluded.total_os,
			   removidas = excluded.removidas,
			   ignoradas = excluded.ignoradas,
			   legacy_path = excluded.legacy_path,
			   legacy_document_id = excluded.legacy_document_id,
			   updated_at = excluded.updated_at,
			   payload = excluded.payload,
			   source_payload = excluded.source_payload
			 where ordens_import_runs.updated_at is null
			    or ordens_import_runs.updated_at <= excluded.updated_at`,
			[
				row.id,
				row.tipo,
				row.fonte,
				row.source_collection,
				row.periodo_inicio,
				row.periodo_fim,
				row.total_os,
				row.removidas,
				row.ignoradas,
				row.legacy_path,
				row.legacy_document_id,
				row.created_at,
				row.updated_at,
				JSON.stringify(row.payload),
				JSON.stringify(row.source_payload),
			],
		);
	}
}

async function applyMigration(client, normalized) {
	await client.query("begin");
	try {
		await upsertOrders(client, normalized.orders);
		await upsertImportRuns(client, normalized.importRuns);
		await client.query("commit");
		return {
			orders: normalized.orders.length,
			relationships: normalized.relationships.length,
			importRuns: normalized.importRuns.length,
		};
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	}
}

function countBy(rows, field) {
	const result = {};
	for (const row of rows) {
		const value = row[field] || "(vazio)";
		result[value] = (result[value] || 0) + 1;
	}
	return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

function sourceStats(rows) {
	const byCollection = {};
	const byStatus = {};
	const byRegional = {};
	for (const row of rows) {
		byCollection[row.collection_path] = (byCollection[row.collection_path] || 0) + 1;
		if (ORDER_COLLECTIONS.has(row.collection_path)) {
			const data = row.data || {};
			const status = text(data.status || data.servico_status) || "(vazio)";
			const regional = text(data.regional) || "(vazio)";
			byStatus[`${row.collection_path}:${status}`] =
				(byStatus[`${row.collection_path}:${status}`] || 0) + 1;
			byRegional[`${row.collection_path}:${regional}`] =
				(byRegional[`${row.collection_path}:${regional}`] || 0) + 1;
		}
	}
	return { byCollection, byStatus, byRegional };
}

function buildSample(rows, size = 30) {
	const buckets = ["ordens_abertas", "match_os_abertas", "ordens_legadas", "os_acumuladas"];
	const sample = [];
	for (const collection of buckets) {
		const candidates = rows.filter((row) => row.source_collection === collection);
		const step = Math.max(Math.floor(candidates.length / Math.max(Math.min(size / buckets.length, candidates.length), 1)), 1);
		for (let index = 0; index < candidates.length && sample.length < size; index += step) {
			const item = candidates[index];
			sample.push({
				collection: item.source_collection,
				id: item.id,
				num_os: item.num_os,
				codigo_cliente: item.codigo_cliente,
				nome_cliente: item.nome_cliente,
				cidade: item.cidade,
				regional: item.regional,
				status: item.status,
				source: item.source,
			});
			if (sample.filter((entry) => entry.collection === collection).length >= 8) break;
		}
	}
	return sample;
}

async function targetStats(client) {
	const orders = await client.query(
		`select source_collection, count(*)::int total,
		        count(distinct legacy_path)::int legacy_paths
		   from ordens_servico
		  group by source_collection
		  order by source_collection`,
	);
	const byStatus = await client.query(
		`select source_collection, coalesce(status, '(vazio)') status, count(*)::int total
		   from ordens_servico
		  group by source_collection, status
		  order by source_collection, status`,
	);
	const byRegional = await client.query(
		`select source_collection, coalesce(regional, '(vazio)') regional, count(*)::int total
		   from ordens_servico
		  group by source_collection, regional
		  order by source_collection, regional`,
	);
	const bySource = await client.query(
		`select source, count(*)::int total
		   from ordens_servico
		  group by source
		  order by source`,
	);
	const importRuns = await client.query(`select count(*)::int total from ordens_import_runs`);
	return {
		orders: orders.rows,
		byStatus: byStatus.rows,
		byRegional: byRegional.rows,
		bySource: bySource.rows,
		importRuns: importRuns.rows[0]?.total || 0,
	};
}

async function main() {
	const pool = new Pool(buildPoolConfig());
	try {
		const client = await pool.connect();
		try {
			const sourceRows = await readSource(client);
			const normalized = normalizeAll(sourceRows);
			const duplicateIds = normalized.orders.length - new Set(normalized.orders.map((row) => row.id)).size;
			const report = {
				apply: APPLY,
				source: sourceStats(sourceRows),
				normalized: {
					orders: normalized.orders.length,
					relationships: normalized.relationships.length,
					importRuns: normalized.importRuns.length,
					duplicateTargetIds: duplicateIds,
					byCollection: countBy(normalized.orders, "source_collection"),
					bySource: countBy(normalized.orders, "source"),
					byStatus: countBy(normalized.orders, "status"),
					byRegional: countBy(normalized.orders, "regional"),
				},
				manualSample: buildSample(normalized.orders, 30),
				targetBefore: await targetStats(client).catch(() => null),
			};
			if (APPLY) {
				if (duplicateIds > 0) {
					throw new Error(`Migracao bloqueada: ${duplicateIds} IDs normalizados duplicados.`);
				}
				report.applied = await applyMigration(client, normalized);
				report.targetAfter = await targetStats(client);
			}
			if (JSON_MODE) console.log(JSON.stringify(report, null, 2));
			else {
				console.log("Migracao Ordens/Match/Legadas");
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
