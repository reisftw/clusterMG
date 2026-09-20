// Contrato de criacao/finalizacao de rompimentos (Etapa 6, Fase 5).
// Sobe um express real em memoria (sem servidor de producao, sem banco
// real, sem R2 real) — db/auth/auditLog sao mocks injetados no
// require.cache ANTES do router ser importado, seguindo o mesmo padrao
// ja usado em warlinho/permissions.test.js e test-apr-transaction.js
// (nao gerenciado por node --test): nunca abre conexao com Postgres,
// nunca chama um storage provider real.
const { test } = require("node:test");
const assert = require("node:assert/strict");
process.env.NODE_ENV = "test";

function makeDbMock({
	regionalCidades = [],
	rompimentoBases = [],
	existingRow = null,
	confirmedImages = 0,
	insertShouldFail = null,
} = {}) {
	const queries = [];
	return {
		queries,
		query: async (sql, params) => {
			queries.push({ sql, params });
			if (/insert into rot_audit_logs/i.test(sql)) return { rows: [] };
			if (/from regional_cidades/i.test(sql)) return { rows: regionalCidades };
			if (/from rot_rompimento_bases/i.test(sql)) return { rows: rompimentoBases };
			if (/insert into rot_rompimentos/i.test(sql)) {
				if (insertShouldFail) throw insertShouldFail;
				const [id, ticketNumber, regionalId, clienteNome, cidade, pontoALat, pontoALng, pontoBLat, pontoBLng, distanciaBase, materiais, outros, fibraTipo, fibraMetros] = params;
				return {
					rows: [{
						id, ticket_number: ticketNumber, status: "em_tratativa", regional_id: regionalId,
						cliente_nome: clienteNome, cidade, ponto_a_lat: pontoALat, ponto_a_lng: pontoALng,
						ponto_b_lat: pontoBLat, ponto_b_lng: pontoBLng, distancia_base: distanciaBase,
						materiais, outros, fibra_tipo: fibraTipo, fibra_metros: fibraMetros,
						created_by: "user-1", created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
					}],
				};
			}
			if (/select \* from rot_rompimentos where id\s*=\s*\$1/i.test(sql)) {
				return { rows: existingRow ? [existingRow] : [] };
			}
			if (/update rot_rompimentos set/i.test(sql)) {
				return { rows: [{ ...existingRow, status: params[3], id: params[0] }] };
			}
			if (/count\(\*\)::int as total from rot_image_attachments/i.test(sql)) {
				return { rows: [{ total: confirmedImages }] };
			}
			return { rows: [] };
		},
	};
}

function actor(overrides = {}) {
	return { id: "user-1", name: "Usuário Teste", regional_id: "r1", permissions: ["rot.rompimentos.view", "rot.rompimentos.manage"], ...overrides };
}

async function withServer(dbMock, { user = actor(), auth = true } = {}, fn) {
	require.cache[require.resolve("../db")] = { id: require.resolve("../db"), filename: require.resolve("../db"), loaded: true, exports: dbMock };
	require.cache[require.resolve("../auth/middleware")] = {
		id: require.resolve("../auth/middleware"),
		filename: require.resolve("../auth/middleware"),
		loaded: true,
		exports: {
			requireRotAuth: (req, res, next) => {
				if (!auth) { res.status(401).json({ ok: false, error: "Sessão da Operação não autenticada." }); return; }
				req.rotUser = user;
				next();
			},
			requireRotPermission: (permission) => (req, res, next) => {
				const required = Array.isArray(permission) ? permission : [permission];
				const has = required.some((item) => (req.rotUser?.permissions || []).includes(item) || (req.rotUser?.permissions || []).includes("*"));
				if (!has) { res.status(403).json({ ok: false, error: "Você não tem permissão para acessar esta área da Operação." }); return; }
				next();
			},
			scopeRegionalFilter: (req) => (req.rotUser?.permissions || []).includes("*") ? null : req.rotUser?.regional_id || null,
			userHasRotPermission: (rotUser, permission) => {
				const required = Array.isArray(permission) ? permission : [permission];
				return required.some((item) => (rotUser?.permissions || []).includes(item) || (rotUser?.permissions || []).includes("*"));
			},
		},
	};
	delete require.cache[require.resolve("./routes")];
	const express = require("express");
	const { toClientResponse } = require("../security/errors");
	const app = express();
	app.use(express.json());
	app.use("/rompimentos", require("./routes"));
	app.use((err, req, res, _next) => {
		const { status, body } = toClientResponse(err);
		res.status(status).json(body);
	});
	const server = app.listen(0, "127.0.0.1");
	await new Promise((resolve) => server.once("listening", resolve));
	const base = `http://127.0.0.1:${server.address().port}/rompimentos`;
	try {
		await fn(base);
	} finally {
		await new Promise((resolve) => server.close(resolve));
	}
}

const validPayload = {
	regionalId: "r1",
	ticketNumber: "TCK-1",
	cidade: "Belo Horizonte",
	pontoA: { lat: -19.9, lng: -43.9 },
	pontoB: { lat: -19.91, lng: -43.91 },
	materiais: { CONECTOR: 2 },
	outros: "",
	fibraTipo: "AS80 06FO",
	fibraMetros: 50,
};

test("POST /rompimentos rejeita sem autenticação (401)", async () => {
	await withServer(makeDbMock(), { auth: false }, async (base) => {
		const res = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(validPayload) });
		assert.equal(res.status, 401);
	});
});

test("POST /rompimentos rejeita sem permissão (403)", async () => {
	await withServer(makeDbMock(), { user: actor({ permissions: [] }) }, async (base) => {
		const res = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(validPayload) });
		assert.equal(res.status, 403);
	});
});

test("POST /rompimentos sem tratativa válida (campos obrigatórios ausentes) retorna 400", async () => {
	await withServer(makeDbMock(), {}, async (base) => {
		const res = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ regionalId: "r1" }) });
		assert.equal(res.status, 400);
		const body = await res.json();
		assert.equal(body.ok, false);
	});
});

test("POST /rompimentos com ticket vazio (tratativa vazia) retorna 400", async () => {
	await withServer(makeDbMock(), {}, async (base) => {
		const res = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...validPayload, ticketNumber: "   " }) });
		assert.equal(res.status, 400);
	});
});

test("POST /rompimentos com payload malformado (pontos inválidos) retorna 400", async () => {
	await withServer(makeDbMock(), {}, async (base) => {
		const res = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...validPayload, pontoA: { lat: 999, lng: -43.9 } }) });
		assert.equal(res.status, 400);
	});
});

test("POST /rompimentos com payload válido cria a tratativa (201, sem código inalcançável)", async () => {
	await withServer(makeDbMock(), {}, async (base) => {
		const res = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(validPayload) });
		assert.equal(res.status, 201);
		const body = await res.json();
		assert.equal(body.ok, true);
		assert.equal(body.rompimento.status, "em_tratativa");
		assert.equal(body.rompimento.ticketNumber, "TCK-1");
	});
});

test("POST /rompimentos propaga erro de banco (driver pg) sem vazar detalhes internos", async () => {
	// Formato real de um DatabaseError do driver `pg` (ver
	// security/errors.js:isDatabaseError) — SQLSTATE de 5 caracteres em
	// `.code` mais campos que só o driver preenche (severity/table).
	const dbError = Object.assign(new Error("connection terminated unexpectedly at 10.0.0.5:5432"), {
		code: "57P01", severity: "FATAL", table: "rot_rompimentos",
	});
	await withServer(makeDbMock({ insertShouldFail: dbError }), {}, async (base) => {
		const res = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(validPayload) });
		assert.equal(res.status, 500);
		const body = await res.json();
		assert.ok(!/10\.0\.0\.5|stack|rot_rompimentos|FATAL/i.test(JSON.stringify(body)));
		assert.equal(body.error, "Erro interno do servidor.");
	});
});

const existingTratativa = {
	id: "romp-1", ticket_number: "TCK-1", status: "em_tratativa", regional_id: "r1",
	cliente_nome: "", cidade: "Belo Horizonte", ponto_a_lat: -19.9, ponto_a_lng: -43.9,
	ponto_b_lat: -19.91, ponto_b_lng: -43.91, distancia_base: null,
	materiais: JSON.stringify({ CONECTOR: 2 }), outros: "", fibra_tipo: "AS80 06FO", fibra_metros: 50,
	created_by: "user-1", created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};

test("PUT /rompimentos/:id sem imagem confirmada retorna 400 ao finalizar", async () => {
	await withServer(makeDbMock({ existingRow: existingTratativa, confirmedImages: 0 }), {}, async (base) => {
		const res = await fetch(`${base}/romp-1`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "concluido" }) });
		assert.equal(res.status, 400);
	});
});

test("PUT /rompimentos/:id com 1 imagem confirmada finaliza com sucesso", async () => {
	await withServer(makeDbMock({ existingRow: existingTratativa, confirmedImages: 1 }), {}, async (base) => {
		const res = await fetch(`${base}/romp-1`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "concluido" }) });
		assert.equal(res.status, 200);
		const body = await res.json();
		assert.equal(body.ok, true);
	});
});

test("PUT /rompimentos/:id com 10 imagens confirmadas finaliza com sucesso", async () => {
	await withServer(makeDbMock({ existingRow: existingTratativa, confirmedImages: 10 }), {}, async (base) => {
		const res = await fetch(`${base}/romp-1`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "concluido" }) });
		assert.equal(res.status, 200);
	});
});

test("PUT /rompimentos/:id com 11 imagens confirmadas retorna 400 (limite de 10)", async () => {
	await withServer(makeDbMock({ existingRow: existingTratativa, confirmedImages: 11 }), {}, async (base) => {
		const res = await fetch(`${base}/romp-1`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "concluido" }) });
		assert.equal(res.status, 400);
		const body = await res.json();
		assert.match(body.error, /10/);
	});
});

test("PUT /rompimentos/:id resposta de sucesso é compatível com o formato esperado pelo frontend", async () => {
	await withServer(makeDbMock({ existingRow: existingTratativa, confirmedImages: 1 }), {}, async (base) => {
		const res = await fetch(`${base}/romp-1`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "concluido" }) });
		const body = await res.json();
		assert.equal(body.ok, true);
		assert.ok("rompimento" in body);
		assert.ok("id" in body.rompimento);
		assert.ok("status" in body.rompimento);
		assert.ok("imageCount" in body.rompimento);
	});
});
