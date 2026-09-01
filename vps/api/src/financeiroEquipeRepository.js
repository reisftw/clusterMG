const db = require("./db");

class FinanceiroEquipeError extends Error {
	constructor(message, status = 400) {
		super(message);
		this.name = "FinanceiroEquipeError";
		this.status = status;
	}
}

function cleanText(value) {
	return String(value || "").trim();
}

function toNullableText(value) {
	const text = cleanText(value);
	return text || null;
}

function toNumberOrNull(value) {
	if (value === null || value === undefined || value === "") return null;
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

function normalizeUserName(user = {}) {
	return (
		cleanText(user.nome) ||
		cleanText(user.name) ||
		cleanText(user.displayName) ||
		cleanText(user.email) ||
		cleanText(user.uid) ||
		null
	);
}

function mapCargo(row = {}) {
	return {
		id: row.id,
		nome: row.nome || "",
		setor: row.setor || "",
		descricao: row.descricao || "",
		ordem: Number(row.ordem || 0),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function mapColaborador(row = {}) {
	return {
		id: row.id,
		setor: row.setor || "",
		nome: row.nome || "",
		cargoId: row.cargo_id || null,
		cargoNome: row.cargo_nome || "",
		cargoDescricao: row.cargo_descricao || "",
		formacao: row.formacao || "",
		atividades: row.atividades || "",
		gestorId: row.gestor_id || null,
		avatarUrl: row.avatar_url || "",
		posX: toNumberOrNull(row.pos_x),
		posY: toNumberOrNull(row.pos_y),
		ordem: Number(row.ordem || 0),
		ativo: row.ativo !== false,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function normalizeCargoInput(payload = {}) {
	const nome = cleanText(payload.nome);
	const setor = cleanText(payload.setor);
	if (!nome) throw new FinanceiroEquipeError("Informe o nome do cargo.");
	if (!setor) throw new FinanceiroEquipeError("Informe o setor do cargo.");
	return {
		nome,
		setor,
		descricao: toNullableText(payload.descricao),
		ordem: Number.isFinite(Number(payload.ordem)) ? Number(payload.ordem) : 0,
	};
}

function normalizeColaboradorInput(payload = {}, { partial = false } = {}) {
	const nome = cleanText(payload.nome);
	const setor = cleanText(payload.setor);
	const cargoId = toNullableText(payload.cargoId || payload.cargo_id);
	if (!partial && !nome) {
		throw new FinanceiroEquipeError("Informe o nome do colaborador.");
	}
	if (!partial && !setor) {
		throw new FinanceiroEquipeError("Informe o setor do colaborador.");
	}
	if (!partial && !cargoId) {
		throw new FinanceiroEquipeError("Selecione um cargo.");
	}
	return {
		setor,
		nome,
		cargoId,
		formacao: toNullableText(payload.formacao),
		atividades: toNullableText(payload.atividades),
		gestorId: toNullableText(payload.gestorId || payload.gestor_id),
		avatarUrl: toNullableText(payload.avatarUrl || payload.avatar_url),
		posX: toNumberOrNull(payload.posX ?? payload.pos_x),
		posY: toNumberOrNull(payload.posY ?? payload.pos_y),
		ordem: Number.isFinite(Number(payload.ordem)) ? Number(payload.ordem) : 0,
	};
}

function handleDbError(error) {
	if (error?.code === "23505") {
		throw new FinanceiroEquipeError("Já existe um registro com estes dados.", 409);
	}
	if (error?.code === "23503") {
		throw new FinanceiroEquipeError("Registro relacionado não encontrado.", 400);
	}
	throw error;
}

async function listEquipe() {
	const [cargosResult, colaboradoresResult] = await Promise.all([
		db.query(
			`select *
			   from financeiro_equipe_cargos
			  order by setor asc, ordem asc, nome asc`,
		),
		db.query(
			`select c.*, cg.nome as cargo_nome, cg.descricao as cargo_descricao
			   from financeiro_equipe_colaboradores c
		  left join financeiro_equipe_cargos cg on cg.id = c.cargo_id
			  where c.ativo = true
			  order by c.setor asc, c.ordem asc, c.nome asc`,
		),
	]);
	return {
		cargos: cargosResult.rows.map(mapCargo),
		colaboradores: colaboradoresResult.rows.map(mapColaborador),
	};
}

async function createCargo(payload = {}, user = {}) {
	const cargo = normalizeCargoInput(payload);
	try {
		const result = await db.query(
			`insert into financeiro_equipe_cargos
				(nome, setor, descricao, ordem, created_by, updated_by)
			 values ($1, $2, $3, $4, $5, $5)
			 returning *`,
			[
				cargo.nome,
				cargo.setor,
				cargo.descricao,
				cargo.ordem,
				normalizeUserName(user),
			],
		);
		return mapCargo(result.rows[0]);
	} catch (error) {
		handleDbError(error);
	}
}

async function updateCargo(id, payload = {}, user = {}) {
	const cargoId = toNullableText(id);
	if (!cargoId) throw new FinanceiroEquipeError("Cargo não informado.");
	const cargo = normalizeCargoInput(payload);
	try {
		const result = await db.query(
			`update financeiro_equipe_cargos
			    set nome = $2,
			        setor = $3,
			        descricao = $4,
			        ordem = $5,
			        updated_by = $6
			  where id = $1
			  returning *`,
			[
				cargoId,
				cargo.nome,
				cargo.setor,
				cargo.descricao,
				cargo.ordem,
				normalizeUserName(user),
			],
		);
		if (!result.rows.length) {
			throw new FinanceiroEquipeError("Cargo não encontrado.", 404);
		}
		return mapCargo(result.rows[0]);
	} catch (error) {
		handleDbError(error);
	}
}

async function deleteCargo(id) {
	const cargoId = toNullableText(id);
	if (!cargoId) throw new FinanceiroEquipeError("Cargo não informado.");
	const inUse = await db.query(
		`select count(*)::int as total
		   from financeiro_equipe_colaboradores
		  where cargo_id = $1
		    and ativo = true`,
		[cargoId],
	);
	if (Number(inUse.rows[0]?.total || 0) > 0) {
		throw new FinanceiroEquipeError(
			"Este cargo ainda possui colaboradores vinculados.",
			409,
		);
	}
	const result = await db.query(
		"delete from financeiro_equipe_cargos where id = $1 returning id",
		[cargoId],
	);
	if (!result.rows.length) {
		throw new FinanceiroEquipeError("Cargo não encontrado.", 404);
	}
	return { ok: true, id: cargoId };
}

async function createColaborador(payload = {}, user = {}) {
	const colaborador = normalizeColaboradorInput(payload);
	try {
		const result = await db.query(
			`insert into financeiro_equipe_colaboradores
				(setor, nome, cargo_id, formacao, atividades, gestor_id, avatar_url,
				 pos_x, pos_y, ordem, created_by, updated_by)
			 values ($1, $2, $3, $4, $5, nullif($6, '')::uuid, $7, $8, $9, $10, $11, $11)
			 returning *`,
			[
				colaborador.setor,
				colaborador.nome,
				colaborador.cargoId,
				colaborador.formacao,
				colaborador.atividades,
				colaborador.gestorId || "",
				colaborador.avatarUrl,
				colaborador.posX,
				colaborador.posY,
				colaborador.ordem,
				normalizeUserName(user),
			],
		);
		const equipe = await listEquipe();
		return equipe.colaboradores.find((item) => item.id === result.rows[0].id);
	} catch (error) {
		handleDbError(error);
	}
}

async function updateColaborador(id, payload = {}, user = {}) {
	const colaboradorId = toNullableText(id);
	if (!colaboradorId) {
		throw new FinanceiroEquipeError("Colaborador não informado.");
	}
	const current = await db.query(
		"select * from financeiro_equipe_colaboradores where id = $1 and ativo = true",
		[colaboradorId],
	);
	if (!current.rows.length) {
		throw new FinanceiroEquipeError("Colaborador não encontrado.", 404);
	}
	const input = normalizeColaboradorInput(
		{ ...mapColaborador(current.rows[0]), ...payload },
		{ partial: false },
	);
	if (input.gestorId === colaboradorId) {
		throw new FinanceiroEquipeError("O colaborador não pode ser gestor de si mesmo.");
	}
	try {
		const result = await db.query(
			`update financeiro_equipe_colaboradores
			    set setor = $2,
			        nome = $3,
			        cargo_id = $4,
			        formacao = $5,
			        atividades = $6,
			        gestor_id = nullif($7, '')::uuid,
			        avatar_url = $8,
			        pos_x = $9,
			        pos_y = $10,
			        ordem = $11,
			        updated_by = $12
			  where id = $1
			    and ativo = true
			  returning id`,
			[
				colaboradorId,
				input.setor,
				input.nome,
				input.cargoId,
				input.formacao,
				input.atividades,
				input.gestorId || "",
				input.avatarUrl,
				input.posX,
				input.posY,
				input.ordem,
				normalizeUserName(user),
			],
		);
		const equipe = await listEquipe();
		return equipe.colaboradores.find((item) => item.id === result.rows[0].id);
	} catch (error) {
		handleDbError(error);
	}
}

async function deleteColaborador(id, user = {}) {
	const colaboradorId = toNullableText(id);
	if (!colaboradorId) {
		throw new FinanceiroEquipeError("Colaborador não informado.");
	}
	const result = await db.query(
		`update financeiro_equipe_colaboradores
		    set ativo = false,
		        gestor_id = null,
		        updated_by = $2
		  where id = $1
		    and ativo = true
		  returning id`,
		[colaboradorId, normalizeUserName(user)],
	);
	if (!result.rows.length) {
		throw new FinanceiroEquipeError("Colaborador não encontrado.", 404);
	}
	await db.query(
		`update financeiro_equipe_colaboradores
		    set gestor_id = null,
		        updated_by = $2
		  where gestor_id = $1`,
		[colaboradorId, normalizeUserName(user)],
	);
	return { ok: true, id: colaboradorId };
}

async function moveColaborador(id, payload = {}, user = {}) {
	const colaboradorId = toNullableText(id);
	if (!colaboradorId) {
		throw new FinanceiroEquipeError("Colaborador não informado.");
	}
	const current = await db.query(
		"select * from financeiro_equipe_colaboradores where id = $1 and ativo = true",
		[colaboradorId],
	);
	if (!current.rows.length) {
		throw new FinanceiroEquipeError("Colaborador não encontrado.", 404);
	}
	const gestorId = Object.hasOwn(payload, "gestorId")
		? toNullableText(payload.gestorId)
		: current.rows[0].gestor_id;
	if (gestorId === colaboradorId) {
		throw new FinanceiroEquipeError("O colaborador não pode ser gestor de si mesmo.");
	}
	const setor = cleanText(payload.setor) || current.rows[0].setor;
	const ordem = Number.isFinite(Number(payload.ordem))
		? Number(payload.ordem)
		: Number(current.rows[0].ordem || 0);
	try {
		const result = await db.query(
			`update financeiro_equipe_colaboradores
			    set gestor_id = nullif($2, '')::uuid,
			        setor = $3,
			        pos_x = $4,
			        pos_y = $5,
			        ordem = $6,
			        updated_by = $7
			  where id = $1
			    and ativo = true
			  returning id`,
			[
				colaboradorId,
				gestorId || "",
				setor,
				toNumberOrNull(payload.posX ?? payload.pos_x),
				toNumberOrNull(payload.posY ?? payload.pos_y),
				ordem,
				normalizeUserName(user),
			],
		);
		const equipe = await listEquipe();
		return equipe.colaboradores.find((item) => item.id === result.rows[0].id);
	} catch (error) {
		handleDbError(error);
	}
}

module.exports = {
	FinanceiroEquipeError,
	createCargo,
	createColaborador,
	deleteCargo,
	deleteColaborador,
	listEquipe,
	moveColaborador,
	updateCargo,
	updateColaborador,
	__testables: {
		mapCargo,
		mapColaborador,
		normalizeCargoInput,
		normalizeColaboradorInput,
	},
};
