// Sistema de anexos centralizado (Roteiro Finan #30, Fase 4A). Cobre:
// upload real cria linha com hash calculado, deteccao de duplicado (mesmo
// hash) nao bloqueia o upload, nova versao herda grupo_id e incrementa a
// versao, listagem sem "todasVersoes" so mostra a mais recente por grupo,
// e a rota de escrita exige finan.anexos.manage (view sozinho nao basta).
import crypto from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { adminSession, createFinanDbMock, loadFinanApp, sessionWithPermissions } from "./testUtils.js";

const BEARER = "Bearer qualquer-token-de-teste";

function buildDbMock() {
	const dbMock = createFinanDbMock({ session: adminSession() });
	const rowsById = new Map();
	const baseQuery = dbMock.query;

	dbMock.query = async (text, params = []) => {
		const sql = String(typeof text === "string" ? text : text?.text || "");

		if (/^insert into finan_anexos/i.test(sql.trim())) {
			const [id, grupoId, versao, nomeArquivo, tipoMime, tamanhoBytes, conteudoBase64, hash, categoria, descricao, vinculoTipo, vinculoId, uploadedById, uploadedByNome] = params;
			const row = {
				id,
				grupo_id: grupoId,
				versao,
				nome_arquivo: nomeArquivo,
				tipo_mime: tipoMime,
				tamanho_bytes: tamanhoBytes,
				conteudo_base64: conteudoBase64,
				hash_sha256: hash,
				categoria,
				descricao,
				vinculo_tipo: vinculoTipo,
				vinculo_id: vinculoId,
				uploaded_by_id: uploadedById,
				uploaded_by_nome: uploadedByNome,
				created_at: new Date(),
				updated_at: new Date(),
			};
			rowsById.set(id, row);
			return { rows: [row] };
		}
		if (/select id, nome_arquivo, created_at from finan_anexos where hash_sha256/i.test(sql)) {
			const [hash] = params;
			const found = [...rowsById.values()].filter((r) => r.hash_sha256 === hash).sort((a, b) => a.created_at - b.created_at);
			return { rows: found.slice(0, 1).map((r) => ({ id: r.id, nome_arquivo: r.nome_arquivo, created_at: r.created_at })) };
		}
		if (/select grupo_id, \(select max\(versao\)/i.test(sql)) {
			const [substituindoId] = params;
			const alvo = rowsById.get(substituindoId);
			if (!alvo) return { rows: [] };
			const maxVersao = Math.max(...[...rowsById.values()].filter((r) => r.grupo_id === alvo.grupo_id).map((r) => r.versao));
			return { rows: [{ grupo_id: alvo.grupo_id, max_versao: maxVersao }] };
		}
		if (/from finan_anexos\s*$|from finan_anexos\s*where/im.test(sql) && /select id, grupo_id, versao, nome_arquivo/i.test(sql)) {
			let rows = [...rowsById.values()];
			const somenteUltimaVersao = /versao = \(select max\(versao\)/i.test(sql);
			if (somenteUltimaVersao) {
				const maxByGrupo = new Map();
				rows.forEach((r) => {
					const atual = maxByGrupo.get(r.grupo_id) || 0;
					if (r.versao > atual) maxByGrupo.set(r.grupo_id, r.versao);
				});
				rows = rows.filter((r) => r.versao === maxByGrupo.get(r.grupo_id));
			}
			rows = rows.sort((a, b) => b.created_at - a.created_at);
			return { rows };
		}
		return baseQuery(text, params);
	};
	return dbMock;
}

describe("POST /api/finan/anexos — upload", { timeout: 15000 }, () => {
	it("cria o anexo com hash calculado e versao 1", async () => {
		const app = loadFinanApp(buildDbMock());
		const response = await request(app)
			.post("/api/finan/anexos")
			.set("Authorization", BEARER)
			.attach("arquivo", Buffer.from("conteudo do arquivo de teste"), "teste.txt")
			.field("categoria", "comprovante");

		expect(response.status).toBe(200);
		expect(response.body.anexo.versao).toBe(1);
		expect(response.body.anexo.categoria).toBe("comprovante");
		const hashEsperado = crypto.createHash("sha256").update(Buffer.from("conteudo do arquivo de teste")).digest("hex");
		expect(response.body.anexo.hashSha256).toBe(hashEsperado);
		expect(response.body.duplicadoDe).toBeNull();
	});

	it("detecta duplicado por hash sem bloquear o novo upload", async () => {
		const dbMock = buildDbMock();
		const app = loadFinanApp(dbMock);
		const conteudo = Buffer.from("mesmo conteudo dessa vez");

		const primeiro = await request(app).post("/api/finan/anexos").set("Authorization", BEARER).attach("arquivo", conteudo, "original.txt");
		expect(primeiro.status).toBe(200);

		const segundo = await request(app).post("/api/finan/anexos").set("Authorization", BEARER).attach("arquivo", conteudo, "copia.txt");
		expect(segundo.status).toBe(200);
		expect(segundo.body.duplicadoDe).toBeTruthy();
		expect(segundo.body.duplicadoDe.nomeArquivo).toBe("original.txt");
		// o upload duplicado ainda e salvo — deteccao so avisa, nunca bloqueia.
		expect(segundo.body.anexo.id).not.toBe(primeiro.body.anexo.id);
	});

	it("nova versao herda grupo_id do anexo substituido e incrementa a versao", async () => {
		const app = loadFinanApp(buildDbMock());
		const v1 = await request(app).post("/api/finan/anexos").set("Authorization", BEARER).attach("arquivo", Buffer.from("v1"), "contrato.pdf");
		const v2 = await request(app)
			.post("/api/finan/anexos")
			.set("Authorization", BEARER)
			.attach("arquivo", Buffer.from("v2"), "contrato-atualizado.pdf")
			.field("substituindoId", v1.body.anexo.id);

		expect(v2.status).toBe(200);
		expect(v2.body.anexo.versao).toBe(2);
		expect(v2.body.anexo.grupoId).toBe(v1.body.anexo.grupoId);
	});

	it("sem finan.anexos.manage, upload responde 403 mesmo com finan.anexos.view", async () => {
		const dbMock = buildDbMock();
		dbMock.setSession(sessionWithPermissions(["finan.anexos.view"]));
		const app = loadFinanApp(dbMock);
		const response = await request(app).post("/api/finan/anexos").set("Authorization", BEARER).attach("arquivo", Buffer.from("x"), "x.txt");
		expect(response.status).toBe(403);
	});
});

describe("GET /api/finan/anexos — listagem", { timeout: 15000 }, () => {
	it("sem todasVersoes, mostra so a versao mais recente de cada grupo", async () => {
		const app = loadFinanApp(buildDbMock());
		const v1 = await request(app).post("/api/finan/anexos").set("Authorization", BEARER).attach("arquivo", Buffer.from("v1"), "doc.pdf");
		await request(app)
			.post("/api/finan/anexos")
			.set("Authorization", BEARER)
			.attach("arquivo", Buffer.from("v2"), "doc-v2.pdf")
			.field("substituindoId", v1.body.anexo.id);

		const lista = await request(app).get("/api/finan/anexos").set("Authorization", BEARER);
		expect(lista.status).toBe(200);
		const doGrupo = lista.body.anexos.filter((a) => a.grupoId === v1.body.anexo.grupoId);
		expect(doGrupo).toHaveLength(1);
		expect(doGrupo[0].versao).toBe(2);
	});
});
