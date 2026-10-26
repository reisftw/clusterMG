const crypto = require("node:crypto");
const db = require("../../db");
const {
	generateReturnReceiptPdf,
	isOnnet,
	safeFilename,
} = require("./returnReceiptPdf");

const CREATE_PERMISSIONS = ["service_orders.return_receipts.create"];
const HISTORY_PERMISSIONS = ["service_orders.return_receipts.history"];
const ALLOWED_ORDER_TYPES = [
	"RETIRADA FTTH",
	"RETIRADA - OUTROS",
	"CANCELAMENTO FTTH",
	"CANCELAMENTO - OUTROS",
	"CANCELAMENTO & RETIRADA - SEGUNDA TENTATIVA",
	"RETIRADA & CANCELAMENTO - SEGUNDA TENTATIVA",
	"CANCELAMENTO LOJA",
];

function text(value) {
	return String(value ?? "").trim();
}

function digits(value) {
	return text(value).replace(/\D/g, "");
}

function normalize(value) {
	return text(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-zA-Z0-9]+/g, "")
		.toUpperCase();
}

function profileOf(user = {}) {
	return user.profile || user;
}

function userUid(user = {}) {
	const profile = profileOf(user);
	return text(user.uid || profile.uid || user.email || profile.email);
}

function userName(user = {}) {
	const profile = profileOf(user);
	return text(
		profile.nome ||
			profile.displayName ||
			profile.display_name ||
			user.nome ||
			user.email ||
			profile.email,
	);
}

function userEmail(user = {}) {
	const profile = profileOf(user);
	return text(user.email || profile.email).toLowerCase();
}

function linkedTechnician(user = {}) {
	const profile = profileOf(user);
	return text(profile.metasTecnicoNome || profile.metas_tecnico_nome);
}

function isAdmin(user = {}) {
	return text(user.role || profileOf(user).role).toLowerCase() === "admin";
}

function errorWithStatus(message, statusCode) {
	const error = new Error(message);
	error.statusCode = statusCode;
	return error;
}

function parseTechnician(raw = {}) {
	const technicians = Array.isArray(raw.tecnicos) ? raw.tecnicos : [];
	return text(
		technicians[0]?.name ||
			technicians[0]?.nome ||
			raw.usuario_fechamento ||
			raw.usuarios_responsaveis,
	);
}

function mapEquipment(row = {}) {
	return {
		id: row.id,
		productName: text(row.produto_nome) || "Equipamento",
		productCode: text(row.produto_codigo),
		serial: text(row.serie),
		movementNumber: text(row.numero),
		movementId: text(row.movimento_estoque_id),
		returnedAt: row.emitido_em || null,
		registeredBy: text(row.registrado_por),
		company: text(row.empresa_nome),
		source: "MOVIMENTACAO",
		sourceLabel: "Estoque / Movimentacoes",
	};
}

function equipmentTypeLabel(value) {
	const type = text(value).toUpperCase();
	if (type === "FAST") return "Equipamento FAST";
	if (type === "AC") return "Equipamento AC";
	if (type === "AX") return "Equipamento AX";
	return type ? `Equipamento ${type}` : "Equipamento do cliente";
}

function mapFallbackEquipment({ id, type, source, sourceLabel }) {
	return {
		id,
		productName: equipmentTypeLabel(type),
		productCode: "",
		serial: "",
		movementNumber: "",
		movementId: "",
		returnedAt: null,
		registeredBy: "",
		company: "",
		source,
		sourceLabel,
	};
}

function manualEquipmentFromPayload(payload = {}, serviceOrderNumber = "") {
	const productName = text(payload.equipmentName || payload.nomeEquipamento).replace(
		/\s+/g,
		" ",
	);
	const serial = text(payload.equipmentMac || payload.mac || payload.serial)
		.toUpperCase()
		.replace(/\s+/g, "");
	const compactSerial = serial.replace(/[^A-Z0-9]/g, "");
	if (productName.length < 2 || productName.length > 120) {
		throw errorWithStatus(
			"Informe o nome ou modelo do equipamento recolhido.",
			400,
		);
	}
	if (
		compactSerial.length < 8 ||
		compactSerial.length > 64 ||
		!/^[A-Z0-9:.-]+$/.test(serial)
	) {
		throw errorWithStatus("Informe um MAC ou serial valido.", 400);
	}
	return {
		id: `manual-${serviceOrderNumber || crypto.randomUUID()}`,
		productName,
		productCode: "",
		serial,
		movementNumber: "",
		movementId: "",
		returnedAt: null,
		registeredBy: "",
		company: "",
		source: "MANUAL",
		sourceLabel: "Informado pelo tecnico",
	};
}

function dedupeEquipment(rows = []) {
	const seen = new Set();
	return rows.reduce((items, row) => {
		const item = mapEquipment(row);
		const key = `${normalize(item.productName)}:${normalize(item.serial)}:${item.id}`;
		if (seen.has(key)) return items;
		seen.add(key);
		items.push(item);
		return items;
	}, []);
}

function mapReceipt(row = {}) {
	return {
		id: row.id,
		clientCode: row.client_code,
		clientName: row.client_name,
		serviceOrderNumber: row.service_order_number,
		serviceOrderType: row.service_order_type,
		company: row.company,
		technicianName: row.technician_name,
		completedAt: row.completed_at,
		equipment: Array.isArray(row.equipment) ? row.equipment : [],
		generatedByUid: row.generated_by_uid,
		generatedByName: row.generated_by_name,
		generatedByEmail: row.generated_by_email || "",
		filename: row.pdf_filename,
		createdAt: row.created_at,
		downloadUrl: `/api/service-orders/return-receipts/${row.id}/download`,
	};
}

async function findFinalizedOrder(code) {
	const result = await db.query(
		`select hubsoft_id, hubsoft_number, source_type, source_date, updated_at,
		        raw_excerpt
		   from hubsoft_sync_records
		  where lower(coalesce(source_status, '')) = 'finalizado'
		    and regexp_replace(coalesce(raw_excerpt->>'codigo_cliente', ''), '\\D', '', 'g') = $1
		    and upper(trim(coalesce(source_type, ''))) = any($2::text[])
		  order by source_date desc nulls last, updated_at desc
		  limit 1`,
		[code, ALLOWED_ORDER_TYPES],
	);
	return result.rows[0] || null;
}

async function findOpenOrder(code) {
	const result = await db.query(
		`with latest_orders as (
		  select hubsoft_number, source_type, source_status, active, source_date, updated_at,
		         row_number() over (
		           partition by coalesce(nullif(hubsoft_id, ''), nullif(hubsoft_number, ''), id::text)
		           order by updated_at desc nulls last, source_date desc nulls last
		         ) as state_rank
		    from hubsoft_sync_records
		   where regexp_replace(coalesce(raw_excerpt->>'codigo_cliente', ''), '\\D', '', 'g') = $1
		     and upper(trim(coalesce(source_type, ''))) = any($2::text[])
		)
		select hubsoft_number, source_type, source_status
		  from latest_orders
		 where state_rank = 1
		   and active = true
		   and lower(coalesce(source_status, '')) in ('pendente', 'aguardando_agendamento', 'aguardando agendamento')
		 order by source_date desc nulls last, updated_at desc
		 limit 1`,
		[code, ALLOWED_ORDER_TYPES],
	);
	return result.rows[0] || null;
}

async function findEquipment(order) {
	const orderNumber = digits(order.hubsoft_number);
	const completedAt = order.source_date || order.updated_at;
	const clientName = text(order.raw_excerpt?.cliente_nome);
	const normalizedName = normalize(clientName);
	let candidates = [];

	if (orderNumber) {
		const exact = await db.query(
			`select * from movimentacoes_estoque
			  where regexp_replace(coalesce(os_numero, ''), '\\D', '', 'g') = $1
			  order by emitido_em desc nulls last, criado_em desc`,
			[orderNumber],
		);
		candidates = exact.rows;
	}

	if (!candidates.length && normalizedName) {
		const byName = await db.query(
			`select *
			   from movimentacoes_estoque
			  where regexp_replace(
			          translate(
			            upper(regexp_replace(coalesce(parceiro_nome, ''), '^\\s*\\([0-9]+\\)\\s*', '')),
			            'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ',
			            'AAAAAEEEEIIIIOOOOOUUUUC'
			          ),
			          '[^A-Z0-9]', '', 'g'
			        ) = $1
			    and ($2::timestamptz is null or emitido_em between $2::timestamptz - interval '30 days' and $2::timestamptz + interval '7 days')
			  order by abs(extract(epoch from (emitido_em - $2::timestamptz))) asc nulls last,
			           emitido_em desc nulls last
			  limit 50`,
			[normalizedName, completedAt || null],
		);
		candidates = byName.rows;
	}

	if (candidates.length) {
		const primary = candidates[0];
		const grouped = candidates.filter((row) => {
			if (primary.movimento_estoque_id) {
				return text(row.movimento_estoque_id) === text(primary.movimento_estoque_id);
			}
			if (primary.nota_id) return text(row.nota_id) === text(primary.nota_id);
			return row.id === primary.id;
		});
		return dedupeEquipment(grouped.length ? grouped : [primary]);
	}

	if (orderNumber) {
		const snapshot = await db.query(
			`select id, equipment_type, equipment_source
			   from equipment_recovery_snapshots
			  where regexp_replace(coalesce(os_number, ''), '\\D', '', 'g') = $1
			    and coalesce(equipment_type, '') <> ''
			  order by calculated_at desc nulls last, updated_at desc
			  limit 1`,
			[orderNumber],
		);
		if (snapshot.rows[0]) {
			return [
				mapFallbackEquipment({
					id: `snapshot-${snapshot.rows[0].id}`,
					type: snapshot.rows[0].equipment_type,
					source: "MAPA_OS",
					sourceLabel: "Mapa de O.S",
				}),
			];
		}
	}

	const rawType = text(order.raw_excerpt?.equipment_type);
	return [
		mapFallbackEquipment({
			id: `service-order-${orderNumber || order.hubsoft_id || "unknown"}`,
			type: rawType,
			source: "ORDEM_SERVICO",
			sourceLabel: rawType ? "Dados da O.S" : "O.S finalizada",
		}),
	];
}

function assertTechnicianAccess(order, user) {
	if (isAdmin(user)) return;
	const configured = linkedTechnician(user);
	const responsible = parseTechnician(order.raw_excerpt || {});
	if (!configured) {
		throw errorWithStatus(
			"Seu usuario nao possui tecnico HubSoft vinculado. Solicite ao administrador a configuracao do nome em Metas.",
			422,
		);
	}
	if (!responsible || normalize(configured) !== normalize(responsible)) {
		throw errorWithStatus(
			"Este comprovante pertence a uma O.S finalizada por outro tecnico.",
			403,
		);
	}
}

async function findExistingReceipt(serviceOrderNumber) {
	const result = await db.query(
		"select * from service_order_return_receipts where service_order_number = $1",
		[serviceOrderNumber],
	);
	return result.rows[0] || null;
}

async function buildReceiptCandidate(rawCode, user = {}) {
	const code = digits(rawCode);
	if (!code || code !== text(rawCode) || code.length > 20) {
		throw errorWithStatus("Informe somente o codigo numerico do cliente.", 400);
	}
	const openOrder = await findOpenOrder(code);
	if (openOrder) {
		throw errorWithStatus(
			`A O.S ${digits(openOrder.hubsoft_number) || "de retirada"} ainda esta aberta. Finalize a O.S. no HubSoft e depois solicite o comprovante.`,
			409,
		);
	}
	const order = await findFinalizedOrder(code);
	if (!order) {
		throw errorWithStatus(
			"Nenhuma O.S de retirada finalizada foi encontrada para este codigo de cliente.",
			404,
		);
	}
	assertTechnicianAccess(order, user);
	const equipment = await findEquipment(order);
	const raw = order.raw_excerpt || {};
	const technicianName = parseTechnician(raw) || equipment[0].registeredBy;
	const companySource =
		equipment.find((item) => item.company)?.company ||
		text(raw.empresa) ||
		text(raw.servico) ||
		"SEMPRE";
	const company = isOnnet(companySource) ? "ONNET" : "SEMPRE";
	const serviceOrderNumber = digits(order.hubsoft_number);
	const existing = await findExistingReceipt(serviceOrderNumber);
	const requiresManualEquipment = !equipment.some(
		(item) => item.source === "MOVIMENTACAO",
	);
	return {
		clientCode: code,
		clientName: text(raw.cliente_nome) || "Cliente",
		serviceOrderId: text(order.hubsoft_id),
		serviceOrderNumber,
		serviceOrderType: text(order.source_type),
		company,
		technicianName: technicianName || "Nao identificado",
		completedAt: order.source_date || order.updated_at,
		equipment,
		requiresManualEquipment,
		existingReceipt: existing ? mapReceipt(existing) : null,
	};
}

async function lookup(rawCode, user = {}) {
	return { item: await buildReceiptCandidate(rawCode, user) };
}

async function createReceipt(payload = {}, user = {}) {
	const candidate = await buildReceiptCandidate(
		payload.clientCode || payload.codigoCliente,
		user,
	);
	if (candidate.existingReceipt) {
		return { item: candidate.existingReceipt, reused: true };
	}
	if (candidate.requiresManualEquipment) {
		candidate.equipment = [
			manualEquipmentFromPayload(payload, candidate.serviceOrderNumber),
		];
	}
	const uid = userUid(user);
	const name = userName(user);
	if (!uid || !name) throw errorWithStatus("Usuario autenticado nao identificado.", 401);
	const id = crypto.randomUUID();
	const generatedAt = new Date();
	const filename = safeFilename(candidate.clientName);
	const snapshot = {
		...candidate,
		existingReceipt: undefined,
		requiresManualEquipment: undefined,
		receiptId: id,
		generatedAt,
	};
	const pdf = await generateReturnReceiptPdf(snapshot);
	try {
		const result = await db.query(
			`insert into service_order_return_receipts
			 (id, client_code, client_name, service_order_number, service_order_type,
			  company, technician_name, completed_at, equipment, source_snapshot,
			  generated_by_uid, generated_by_name, generated_by_email,
			  pdf_filename, pdf_data, created_at)
			 values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15,$16)
			 returning *`,
			[
				id,
				candidate.clientCode,
				candidate.clientName,
				candidate.serviceOrderNumber,
				candidate.serviceOrderType,
				candidate.company,
				candidate.technicianName,
				candidate.completedAt,
				JSON.stringify(candidate.equipment),
				JSON.stringify({
					serviceOrderId: candidate.serviceOrderId,
					serviceOrderNumber: candidate.serviceOrderNumber,
					company: candidate.company,
					equipment: candidate.equipment,
				}),
				uid,
				name,
				userEmail(user) || null,
				filename,
				pdf,
				generatedAt,
			],
		);
		return { item: mapReceipt(result.rows[0]), reused: false };
	} catch (error) {
		if (error?.code === "23505") {
			const existing = await findExistingReceipt(candidate.serviceOrderNumber);
			if (existing) return { item: mapReceipt(existing), reused: true };
		}
		throw error;
	}
}

function receiptAccessClause(user = {}, startIndex = 1) {
	if (isAdmin(user)) return { sql: "", params: [] };
	const uid = userUid(user);
	const technician = linkedTechnician(user);
	return {
		sql: `(generated_by_uid = $${startIndex} or ($${startIndex + 1} <> '' and regexp_replace(translate(upper(technician_name), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC'), '[^A-Z0-9]', '', 'g') = $${startIndex + 1}))`,
		params: [uid, normalize(technician)],
	};
}

async function listMine(user = {}, options = {}) {
	const limit = Math.min(100, Math.max(1, Number(options.limit || 20)));
	const access = receiptAccessClause(user, 1);
	const result = await db.query(
		`select * from service_order_return_receipts
		  where ${access.sql || "true"}
		  order by created_at desc
		  limit $${access.params.length + 1}`,
		[...access.params, limit],
	);
	return { items: result.rows.map(mapReceipt) };
}

async function listHistory(options = {}) {
	const page = Math.max(1, Number(options.page || 1));
	const limit = Math.min(100, Math.max(1, Number(options.limit || 20)));
	const offset = (page - 1) * limit;
	const search = text(options.q);
	const params = [];
	const where = [];
	if (search) {
		params.push(`%${search}%`);
		where.push(`(client_code ilike $1 or client_name ilike $1 or service_order_number ilike $1 or technician_name ilike $1)`);
	}
	const clause = where.length ? `where ${where.join(" and ")}` : "";
	const count = await db.query(
		`select count(*)::int as total from service_order_return_receipts ${clause}`,
		params,
	);
	params.push(limit, offset);
	const result = await db.query(
		`select * from service_order_return_receipts ${clause}
		  order by created_at desc
		  limit $${params.length - 1} offset $${params.length}`,
		params,
	);
	const total = Number(count.rows[0]?.total || 0);
	return {
		items: result.rows.map(mapReceipt),
		pagination: {
			page,
			limit,
			total,
			totalPages: Math.max(1, Math.ceil(total / limit)),
		},
	};
}

async function getDownload(id, user = {}) {
	const access = receiptAccessClause(user, 2);
	const result = await db.query(
		`select id, pdf_filename, pdf_data
		   from service_order_return_receipts
		  where id = $1
		    and (${access.sql || "true"})`,
		[id, ...access.params],
	);
	const row = result.rows[0];
	if (!row) throw errorWithStatus("Comprovante nao encontrado.", 404);
	return {
		filename: row.pdf_filename,
		data: row.pdf_data,
	};
}

module.exports = {
	ALLOWED_ORDER_TYPES,
	CREATE_PERMISSIONS,
	HISTORY_PERMISSIONS,
	__testables: {
		dedupeEquipment,
		equipmentTypeLabel,
		mapFallbackEquipment,
		manualEquipmentFromPayload,
		mapReceipt,
		normalize,
		parseTechnician,
	},
	createReceipt,
	getDownload,
	listHistory,
	listMine,
	lookup,
};
