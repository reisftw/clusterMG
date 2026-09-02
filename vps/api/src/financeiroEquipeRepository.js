const db = require("./db");

class FinanceiroEquipeError extends Error {
	constructor(message, status = 400) {
		super(message);
		this.name = "FinanceiroEquipeError";
		this.status = status;
		this.statusCode = status;
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

function mapSetor(row = {}) {
	return {
		id: row.id,
		nome: row.nome || "",
		descricao: row.descricao || "",
		cor: row.cor || "",
		responsavelId: row.responsavel_id || null,
		responsavelNome: row.responsavel_nome || "",
		ordem: Number(row.ordem || 0),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function mapCargo(row = {}) {
	return {
		id: row.id,
		nome: row.nome || "",
		setorId: row.setor_id || null,
		setor: row.setor_nome || row.setor || "",
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

function normalizeSetorInput(payload = {}, { partial = false } = {}) {
	const nome = cleanText(payload.nome);
	if (!partial && !nome) throw new FinanceiroEquipeError("Informe o nome do setor.");
	return {
		nome,
		descricao: toNullableText(payload.descricao),
		cor: toNullableText(payload.cor),
		responsavelId: toNullableText(payload.responsavelId || payload.responsavel_id),
		ordem: Number.isFinite(Number(payload.ordem)) ? Number(payload.ordem) : 0,
	};
}

function normalizeCargoInput(payload = {}) {
	const nome = cleanText(payload.nome);
	if (!nome) throw new FinanceiroEquipeError("Informe o nome do cargo.");
	return {
		nome,
		setorId: null,
		setor: "",
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
		throw new FinanceiroEquipeError("Selecione o setor do colaborador.");
	}
	if (!partial && !cargoId) {
		throw new FinanceiroEquipeError("Selecione um cargo.");
	}
	return {
		nome,
		setor,
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

async function ensureSetorExists(setorNome) {
	const nome = cleanText(setorNome);
	if (!nome) throw new FinanceiroEquipeError("Selecione o setor do colaborador.");
	const existing = await db.query(
		"select id, nome from financeiro_equipe_setores where lower(nome) = lower($1)",
		[nome],
	);
	if (existing.rows.length) {
		return { id: existing.rows[0].id, nome: existing.rows[0].nome };
	}
	throw new FinanceiroEquipeError("Setor não encontrado.", 404);
}

async function listEquipe() {
	const [setoresResult, cargosResult, colaboradoresResult] = await Promise.all([
		db.query(
			`select s.*, c.nome as responsavel_nome
			   from financeiro_equipe_setores s
		  left join financeiro_equipe_colaboradores c on c.id = s.responsavel_id
			  order by s.ordem asc, s.nome asc`,
		),
		db.query(
			`select cg.*
			   from financeiro_equipe_cargos cg
			  order by cg.ordem asc, cg.nome asc`,
		),
		db.query(
			`select c.*,
			        cg.nome as cargo_nome,
			        cg.descricao as cargo_descricao
			   from financeiro_equipe_colaboradores c
		  left join financeiro_equipe_cargos cg on cg.id = c.cargo_id
			  where c.ativo = true
			  order by c.setor asc, c.ordem asc, c.nome asc`,
		),
	]);
	return {
		setores: setoresResult.rows.map(mapSetor),
		cargos: cargosResult.rows.map(mapCargo),
		colaboradores: colaboradoresResult.rows.map(mapColaborador),
	};
}

async function createSetor(payload = {}, user = {}) {
	const setor = normalizeSetorInput(payload);
	try {
		const result = await db.query(
			`insert into financeiro_equipe_setores
				(nome, descricao, cor, responsavel_id, ordem, created_by, updated_by)
			 values ($1, $2, $3, nullif($4, '')::uuid, $5, $6, $6)
			 returning *`,
			[
				setor.nome,
				setor.descricao,
				setor.cor,
				setor.responsavelId || "",
				setor.ordem,
				normalizeUserName(user),
			],
		);
		return mapSetor(result.rows[0]);
	} catch (error) {
		handleDbError(error);
	}
}

async function updateSetor(id, payload = {}, user = {}) {
	const setorId = toNullableText(id);
	if (!setorId) throw new FinanceiroEquipeError("Setor não informado.");
	const current = await db.query(
		"select * from financeiro_equipe_setores where id = $1",
		[setorId],
	);
	if (!current.rows.length) {
		throw new FinanceiroEquipeError("Setor não encontrado.", 404);
	}
	const setor = normalizeSetorInput({ ...mapSetor(current.rows[0]), ...payload });
	try {
		const result = await db.query(
			`update financeiro_equipe_setores
			    set nome = $2,
			        descricao = $3,
			        cor = $4,
			        responsavel_id = nullif($5, '')::uuid,
			        ordem = $6,
			        updated_by = $7
			  where id = $1
			  returning *`,
			[
				setorId,
				setor.nome,
				setor.descricao,
				setor.cor,
				setor.responsavelId || "",
				setor.ordem,
				normalizeUserName(user),
			],
		);
		await db.query(
			`update financeiro_equipe_colaboradores
			    set setor = $1,
			        updated_by = $2
			  where lower(setor) = lower($3)`,
			[setor.nome, normalizeUserName(user), current.rows[0].nome],
		);
		return mapSetor(result.rows[0]);
	} catch (error) {
		handleDbError(error);
	}
}

async function deleteSetor(id) {
	const setorId = toNullableText(id);
	if (!setorId) throw new FinanceiroEquipeError("Setor não informado.");
	const inUse = await db.query(
		`select count(*)::int as total
		   from financeiro_equipe_colaboradores
		  where ativo = true
		    and lower(setor) = lower($1)`,
		[
			(
				await db.query("select nome from financeiro_equipe_setores where id = $1", [
					setorId,
				])
			).rows[0]?.nome || "",
		],
	);
	if (Number(inUse.rows[0]?.total || 0) > 0) {
		throw new FinanceiroEquipeError(
			"Este setor ainda possui colaboradores vinculados.",
			409,
		);
	}
	const result = await db.query(
		"delete from financeiro_equipe_setores where id = $1 returning id",
		[setorId],
	);
	if (!result.rows.length) {
		throw new FinanceiroEquipeError("Setor não encontrado.", 404);
	}
	return { ok: true, id: setorId };
}

async function createCargo(payload = {}, user = {}) {
	const cargo = normalizeCargoInput(payload);
	try {
		const result = await db.query(
			`insert into financeiro_equipe_cargos
				(nome, setor, setor_id, descricao, ordem, created_by, updated_by)
			 values ($1, $2, $3, $4, $5, $6, $6)
			 returning *`,
			[
				cargo.nome,
				null,
				null,
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
			        setor_id = $4,
			        descricao = $5,
			        ordem = $6,
			        updated_by = $7
			  where id = $1
			  returning *`,
			[
				cargoId,
				cargo.nome,
				null,
				null,
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
	await db.query(
		`update financeiro_equipe_colaboradores
		    set cargo_id = null
		  where cargo_id = $1
		    and ativo = false`,
		[cargoId],
	);
	let result;
	try {
		result = await db.query(
			"delete from financeiro_equipe_cargos where id = $1 returning id",
			[cargoId],
		);
	} catch (error) {
		if (error?.code === "23503") {
			throw new FinanceiroEquipeError(
				"Este cargo ainda possui vínculos e não pode ser excluído.",
				409,
			);
		}
		throw error;
	}
	if (!result.rows.length) {
		throw new FinanceiroEquipeError("Cargo não encontrado.", 404);
	}
	return { ok: true, id: cargoId };
}

async function createColaborador(payload = {}, user = {}) {
	const colaborador = normalizeColaboradorInput(payload);
	const setor = await ensureSetorExists(colaborador.setor);
	try {
		const result = await db.query(
			`insert into financeiro_equipe_colaboradores
				(setor, nome, cargo_id, formacao, atividades, gestor_id, avatar_url,
				 pos_x, pos_y, ordem, created_by, updated_by)
			 values ($1, $2, $3, $4, $5, nullif($6, '')::uuid, $7, $8, $9, $10, $11, $11)
			 returning *`,
			[
				setor.nome,
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
	const setor = await ensureSetorExists(input.setor);
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
				setor.nome,
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
	await db.query(
		`update financeiro_equipe_setores
		    set responsavel_id = null,
		        updated_by = $2
		  where responsavel_id = $1`,
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
	const ordem = Number.isFinite(Number(payload.ordem))
		? Number(payload.ordem)
		: Number(current.rows[0].ordem || 0);
	const setor = Object.hasOwn(payload, "setor")
		? (await ensureSetorExists(payload.setor)).nome
		: current.rows[0].setor;
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
	createSetor,
	deleteCargo,
	deleteColaborador,
	deleteSetor,
	listEquipe,
	moveColaborador,
	updateCargo,
	updateColaborador,
	updateSetor,
	__testables: {
		mapCargo,
		mapColaborador,
		mapSetor,
		normalizeCargoInput,
		normalizeColaboradorInput,
		normalizeSetorInput,
	},
};
