import assert from "node:assert/strict";
import fs from "node:fs";
import test, { after, before } from "node:test";
import {
	assertFails,
	assertSucceeds,
	initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

let environment;

before(async () => {
	environment = await initializeTestEnvironment({
		projectId: "retiradas-rules-test",
		firestore: {
			rules: fs.readFileSync("firestore.rules", "utf8"),
		},
	});

	await environment.withSecurityRulesDisabled(async (context) => {
		const db = context.firestore();
		await Promise.all([
			setDoc(doc(db, "usuarios", "admin-1"), {
				nome: "Admin",
				email: "admin@example.com",
				role: "admin",
				regional: "",
				colaborador_id: null,
			}),
			setDoc(doc(db, "usuarios", "backoffice-1"), {
				nome: "Backoffice",
				email: "backoffice@example.com",
				role: "backoffice_i",
				regional: "Metropolitana SUB 1",
				colaborador_id: null,
			}),
			setDoc(doc(db, "usuarios", "gestor-1"), {
				nome: "Gestor",
				email: "gestor@example.com",
				role: "gestor",
				regional: "",
				colaborador_id: null,
			}),
			setDoc(doc(db, "usuarios", "estoque-1"), {
				nome: "Estoque",
				email: "estoque@example.com",
				role: "estoque",
				regional: "",
				colaborador_id: null,
			}),
			setDoc(doc(db, "usuarios", "sac-1"), {
				nome: "Atendente SAC",
				email: "sac@example.com",
				role: "atendente_sac",
				regional: "",
				colaborador_id: null,
			}),
			setDoc(doc(db, "usuarios", "supervisor-sac-1"), {
				nome: "Supervisor SAC",
				email: "supervisor-sac@example.com",
				role: "supervisor_sac",
				regional: "",
				colaborador_id: null,
			}),
			setDoc(doc(db, "agendamento_esteira_blocos", "block-1"), {
				status: "disponivel",
				clientes: [],
			}),
			setDoc(doc(db, "agendamento_esteira_catalogo", "ativo"), {
				blocos: [],
			}),
			setDoc(doc(db, "agendamento_esteira_metricas", "2026-07"), {
				mes: "2026-07",
			}),
			setDoc(doc(db, "agendamento_esteira_logs", "log-1"), {
				tipo: "reserva_bloco",
			}),
			setDoc(doc(db, "agendamentos", "appointment-1"), {
				status: "Aguardando dia",
			}),
			setDoc(doc(db, "sac_agendamentos", "sac-existing"), {
				cliente_nome: "Cliente SAC",
				codigo_cliente: "123",
				telefone: "31999999999",
				cidade: "Betim",
				regional: "Metropolitana",
				data_desejada: "2026-07-30",
				turno: "Manha",
				horario: "09:00",
				informacoes: "",
				status: "aguardando_validacao",
				created_by_id: "sac-1",
				logs: [],
			}),
			setDoc(doc(db, "command_receipts", "receipt-1"), { action: "test" }),
			setDoc(doc(db, "agendamento_esteira_cliente_index", "customer-1"), {
				codigo_cliente: "1",
			}),
			setDoc(doc(db, "security_rate_limits", "limit-1"), { count: 1 }),
			setDoc(doc(db, "mensageria_config", "global"), {
				autoSync: true,
			}),
			setDoc(doc(db, "mensageria_templates", "template-1"), {
				nome: "Contrato cancelado",
			}),
			setDoc(doc(db, "mensageria_fila", "fila-1"), {
				cliente: "Cliente Teste",
			}),
			setDoc(doc(db, "mensageria_historico", "historico-1"), {
				cliente: "Cliente Teste",
			}),
		]);
	});
});

after(async () => {
	await environment?.cleanup();
});

test("usuario da esteira pode ler blocos, catalogo, metricas e agendamentos", async () => {
	const db = environment.authenticatedContext("backoffice-1").firestore();
	assert.ok(
		(
			await assertSucceeds(
				getDoc(doc(db, "agendamento_esteira_blocos", "block-1")),
			)
		).exists(),
	);
	assert.ok(
		(
			await assertSucceeds(
				getDoc(doc(db, "agendamento_esteira_catalogo", "ativo")),
			)
		).exists(),
	);
	assert.ok(
		(
			await assertSucceeds(
				getDoc(doc(db, "agendamento_esteira_metricas", "2026-07")),
			)
		).exists(),
	);
	assert.ok(
		(
			await assertSucceeds(getDoc(doc(db, "agendamentos", "appointment-1")))
		).exists(),
	);
});

test("usuario sem permissao nao le a esteira", async () => {
	const db = environment.authenticatedContext("estoque-1").firestore();
	assert.ok(
		await assertFails(getDoc(doc(db, "agendamento_esteira_blocos", "block-1"))),
	);
});

test("SAC cria e edita somente solicitacoes permitidas", async () => {
	const sacDb = environment.authenticatedContext("sac-1").firestore();
	const supervisorDb = environment
		.authenticatedContext("supervisor-sac-1")
		.firestore();
	const estoqueDb = environment.authenticatedContext("estoque-1").firestore();

	assert.equal(
		await assertSucceeds(
			setDoc(doc(sacDb, "sac_agendamentos", "sac-new"), {
				cliente_nome: "Cliente Novo",
				codigo_cliente: "456",
				telefone: "31988888888",
				cidade: "Betim",
				regional: "Metropolitana",
				data_desejada: "2026-07-31",
				turno: "Tarde",
				horario: "14:00",
				informacoes: "",
				status: "aguardando_validacao",
				created_by_id: "sac-1",
				logs: [],
			}),
		),
		undefined,
	);

	assert.ok(
		await assertFails(
			setDoc(doc(sacDb, "sac_agendamentos", "sac-invalid-owner"), {
				status: "aguardando_validacao",
				created_by_id: "outro",
			}),
		),
	);

	assert.equal(
		await assertSucceeds(
			updateDoc(doc(sacDb, "sac_agendamentos", "sac-existing"), {
				informacoes: "Cliente pediu prioridade.",
				created_by_id: "sac-1",
				status: "aguardando_validacao",
			}),
		),
		undefined,
	);

	assert.equal(
		await assertSucceeds(
			updateDoc(doc(supervisorDb, "sac_agendamentos", "sac-existing"), {
				status: "cancelado",
				motivo_status: "Duplicado",
			}),
		),
		undefined,
	);

	assert.ok(
		await assertFails(
			getDoc(doc(estoqueDb, "sac_agendamentos", "sac-existing")),
		),
	);
});

test("nem administrador grava diretamente nas colecoes autoritativas", async () => {
	const db = environment.authenticatedContext("admin-1").firestore();
	const protectedDocuments = [
		["agendamentos", "new-appointment"],
		["agendamento_esteira_blocos", "new-block"],
		["agendamento_esteira_catalogo", "new-catalog"],
		["agendamento_esteira_metricas", "2026-08"],
		["agendamento_esteira_logs", "new-log"],
		["command_receipts", "new-receipt"],
		["agendamento_esteira_cliente_index", "new-customer"],
		["security_rate_limits", "new-limit"],
	];

	for (const [collectionName, id] of protectedDocuments) {
		assert.ok(
			await assertFails(setDoc(doc(db, collectionName, id), { test: true })),
		);
	}
	assert.ok(
		await assertFails(
			updateDoc(doc(db, "agendamento_esteira_blocos", "block-1"), {
				status: "finalizado",
			}),
		),
	);
	assert.ok(
		await assertFails(deleteDoc(doc(db, "agendamentos", "appointment-1"))),
	);
});

test("somente administrador le logs e nenhum cliente le dados internos", async () => {
	const adminDb = environment.authenticatedContext("admin-1").firestore();
	const operatorDb = environment
		.authenticatedContext("backoffice-1")
		.firestore();

	assert.ok(
		(
			await assertSucceeds(
				getDoc(doc(adminDb, "agendamento_esteira_logs", "log-1")),
			)
		).exists(),
	);
	assert.ok(
		await assertFails(
			getDoc(doc(operatorDb, "agendamento_esteira_logs", "log-1")),
		),
	);
	assert.ok(
		await assertFails(getDoc(doc(adminDb, "command_receipts", "receipt-1"))),
	);
	assert.ok(
		await assertFails(
			getDoc(doc(adminDb, "agendamento_esteira_cliente_index", "customer-1")),
		),
	);
	assert.ok(
		await assertFails(getDoc(doc(adminDb, "security_rate_limits", "limit-1"))),
	);
});

test("requisicao nao autenticada nao acessa dados operacionais", async () => {
	const db = environment.unauthenticatedContext().firestore();
	assert.ok(
		await assertFails(getDoc(doc(db, "agendamentos", "appointment-1"))),
	);
	assert.ok(
		await assertFails(getDoc(doc(db, "agendamento_esteira_blocos", "block-1"))),
	);
});

test("mensageria permite admin e gestor, mas bloqueia perfis sem permissao", async () => {
	const adminDb = environment.authenticatedContext("admin-1").firestore();
	const gestorDb = environment.authenticatedContext("gestor-1").firestore();
	const estoqueDb = environment.authenticatedContext("estoque-1").firestore();

	assert.ok(
		(
			await assertSucceeds(getDoc(doc(adminDb, "mensageria_config", "global")))
		).exists(),
	);
	assert.equal(
		await assertSucceeds(
			setDoc(doc(gestorDb, "mensageria_templates", "template-2"), {
				nome: "Segundo contato",
			}),
		),
		undefined,
	);
	assert.equal(
		await assertSucceeds(
			setDoc(doc(gestorDb, "mensageria_fila", "fila-2"), {
				cliente: "Cliente Novo",
			}),
		),
		undefined,
	);
	assert.equal(
		await assertSucceeds(
			setDoc(doc(gestorDb, "mensageria_historico", "historico-2"), {
				cliente: "Cliente Novo",
			}),
		),
		undefined,
	);
	assert.ok(
		await assertFails(getDoc(doc(estoqueDb, "mensageria_config", "global"))),
	);
});
