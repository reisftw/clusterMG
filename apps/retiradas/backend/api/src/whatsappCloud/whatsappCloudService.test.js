const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

process.env.PGHOST ||= "127.0.0.1";
process.env.PGUSER ||= "test";
process.env.PGPASSWORD ||= "test";
process.env.PGDATABASE ||= "test";

const {
	__testables,
	createWhatsappCloudService,
} = require("./whatsappCloudService");

test("normaliza telefone E.164 e rejeita valores inválidos", () => {
	assert.equal(__testables.normalizeE164("+55 (31) 99999-0000"), "+5531999990000");
	assert.throws(() => __testables.normalizeE164("123"), /telefone válido/i);
});

test("reconhece o mesmo celular brasileiro com ou sem o nono dígito da Meta", () => {
	assert.deepEqual(
		__testables.phoneIdentityCandidates("+55 31 98466-7498"),
		["5531984667498", "553184667498"],
	);
	assert.deepEqual(
		__testables.phoneIdentityCandidates("553184667498"),
		["553184667498", "5531984667498"],
	);
	assert.equal(
		__testables.phoneIdentityHashes("+55 31 98466-7498").includes(
			__testables.hashValue("553184667498"),
		),
		true,
	);
});

test("normaliza webhook com texto limitado para o histórico administrativo", () => {
	const [event] = __testables.normalizeWebhookEvents({
		object: "whatsapp_business_account",
		entry: [
			{
				changes: [
					{
						value: {
							metadata: { phone_number_id: "phone-1" },
							messages: [
								{
									id: "wamid.1",
									from: "5531999990000",
									timestamp: "1792933200",
									type: "text",
									text: { body: "conteúdo privado" },
								},
							],
						},
					},
				],
			},
		],
	});
	assert.equal(event.eventType, "INCOMING_MESSAGE");
	assert.equal(event.payload.messageType, "text");
	assert.equal(event.payload.messageText, "conteúdo privado");
	assert.match(event.senderMasked, /\*\*\*/);
});

test("normaliza clique de botão sem persistir o telefone completo", () => {
	const [event] = __testables.normalizeWebhookEvents({
		object: "whatsapp_business_account",
		entry: [{ changes: [{ value: {
			metadata: { phone_number_id: "phone-1" },
			messages: [{
				id: "wamid.button",
				from: "5531999990000",
				timestamp: "1792933200",
				type: "interactive",
				interactive: { button_reply: { id: "flow:schedule", title: "Agendar" } },
			}],
		} }] }],
	});
	assert.equal(event.payload.buttonId, "flow:schedule");
	assert.equal(event.payload.buttonTitle, "Agendar");
	assert.equal(event.payload.senderHash.length, 64);
	assert.equal(JSON.stringify(event.payload).includes("5531999990000"), false);
});

test("gera três datas futuras para o fluxo guiado", () => {
	const dates = __testables.getTestFlowDateOptions(new Date("2026-10-25T15:00:00Z"));
	assert.equal(dates.length, 3);
	assert.deepEqual(dates.map((item) => item.date), [
		"2026-10-26",
		"2026-10-27",
		"2026-10-28",
	]);
	assert.equal(__testables.normalizeFlowAction({ buttonTitle: "Já entregue" }), "flow:delivered");
	assert.equal(__testables.normalizeFlowAction({ buttonTitle: "📅 Agendar retirada" }), "flow:schedule");
	assert.equal(__testables.normalizeFlowAction({ buttonTitle: "✅ Já entregue" }), "flow:delivered");
	assert.equal(__testables.normalizeFlowAction({ buttonTitle: "💬 Falar com atendente" }), "flow:support");
});

test("converte data e horário digitados somente em ações normalizadas", () => {
	const dateEvent = __testables.normalizeWebhookEvents({
		object: "whatsapp_business_account",
		entry: [{ changes: [{ value: { messages: [{
			id: "wamid.date",
			from: "5531999990000",
			timestamp: "1792933200",
			type: "text",
			text: { body: "28/10/2026" },
		}] } }] }],
	})[0];
	const timeEvent = __testables.normalizeWebhookEvents({
		object: "whatsapp_business_account",
		entry: [{ changes: [{ value: { messages: [{
			id: "wamid.time",
			from: "5531999990000",
			timestamp: "1792933200",
			type: "text",
			text: { body: "14:30" },
		}] } }] }],
	})[0];
	assert.equal(dateEvent.payload.inputAction, "flow:date:2026-10-28");
	assert.equal(timeEvent.payload.inputAction, "flow:time:14:30");
	assert.equal(dateEvent.payload.messageText, "28/10/2026");
});

test("limita respostas automáticas de exceção a duas mensagens", () => {
	assert.equal(__testables.canSendTestFlowAutoReply(0), true);
	assert.equal(__testables.canSendTestFlowAutoReply(1), true);
	assert.equal(__testables.canSendTestFlowAutoReply(2), false);
	assert.equal(__testables.canSendTestFlowAutoReply(20), false);
});

test("mantém dois templates guiados com variáveis independentes", () => {
	const current = __testables.testFlowTemplateConfig("retiradas_agendamento_teste_v2");
	const recollection = __testables.testFlowTemplateConfig("retiradas_recolhimento_teste_v2");
	assert.deepEqual(
		current.variables({ firstName: "Ana", contract: "123", city: "Betim" }),
		["Ana", "123", "Betim"],
	);
	assert.deepEqual(
		recollection.variables({ firstName: "Ana", city: "Betim", cancellationDate: "25/10/2026" }),
		["Ana", "Betim", "25/10/2026"],
	);
	assert.equal(recollection.buttons[1].title, "JÁ ENTREGUE");
});

test("valida assinatura HMAC oficial sem expor o App Secret", async () => {
	const previous = process.env.META_APP_SECRET;
	process.env.META_APP_SECRET = "segredo-de-teste";
	try {
		const service = createWhatsappCloudService({
			dbClient: {},
			audit: {},
			messagingRepository: {},
		});
		const rawBody = Buffer.from('{"object":"whatsapp_business_account"}');
		const signature = crypto
			.createHmac("sha256", process.env.META_APP_SECRET)
			.update(rawBody)
			.digest("hex");
		assert.deepEqual(
			await service.verifyWebhookSignature(rawBody, `sha256=${signature}`),
			{ ok: true, reason: "SIGNATURE_MISMATCH" },
		);
		assert.equal(
			(await service.verifyWebhookSignature(rawBody, `sha256=${"0".repeat(64)}`)).ok,
			false,
		);
	} finally {
		if (previous === undefined) delete process.env.META_APP_SECRET;
		else process.env.META_APP_SECRET = previous;
	}
});

test("cifra e decifra credenciais sem armazenar o valor em texto puro", () => {
	const previousSecret = process.env.APP_AUTH_SECRET;
	const previousKeyId = process.env.APP_AUTH_SECRET_ID;
	process.env.APP_AUTH_SECRET = "chave-de-teste-com-mais-de-24-caracteres";
	process.env.APP_AUTH_SECRET_ID = "test-key";
	try {
		const encrypted = __testables.encryptStoredSecret(
			"META_ACCESS_TOKEN",
			"token-super-secreto",
		);
		assert.equal(encrypted.ciphertext.includes("token-super-secreto"), false);
		assert.equal(
			__testables.decryptStoredSecret({
				secret_name: "META_ACCESS_TOKEN",
				ciphertext: encrypted.ciphertext,
				iv: encrypted.iv,
				auth_tag: encrypted.authTag,
				key_id: encrypted.keyId,
			}),
			"token-super-secreto",
		);
	} finally {
		if (previousSecret === undefined) delete process.env.APP_AUTH_SECRET;
		else process.env.APP_AUTH_SECRET = previousSecret;
		if (previousKeyId === undefined) delete process.env.APP_AUTH_SECRET_ID;
		else process.env.APP_AUTH_SECRET_ID = previousKeyId;
	}
});

test("deduplica o mesmo evento de webhook", async () => {
	const keys = new Set();
	const dbClient = {
		async query(sql, params = []) {
			if (sql.includes("insert into whatsapp_cloud_webhook_events")) {
				const key = params[0];
				if (keys.has(key)) return { rowCount: 0, rows: [] };
				keys.add(key);
				return { rowCount: 1, rows: [{ id: "event-1" }] };
			}
			if (sql.includes("from whatsapp_cloud_webhook_events") && sql.includes("processing_status")) {
				return { rows: [] };
			}
			return { rowCount: 1, rows: [] };
		},
	};
	const service = createWhatsappCloudService({
		dbClient,
		audit: { recordAuditLog: async () => {}, calculateChangedFields: () => [] },
		messagingRepository: {},
	});
	const payload = {
		object: "whatsapp_business_account",
		entry: [{ changes: [{ value: { metadata: { phone_number_id: "1" }, statuses: [{ id: "wamid.1", status: "delivered", timestamp: "1792933200", recipient_id: "5531999990000" }] } }] }],
	};
	assert.equal((await service.acceptWebhook(payload)).accepted, 1);
	const duplicate = await service.acceptWebhook(payload);
	assert.equal(duplicate.accepted, 0);
	assert.equal(duplicate.duplicates, 1);
});

test("deduplica reentregas concorrentes do mesmo webhook", async () => {
	const keys = new Set();
	const dbClient = {
		async query(sql, params = []) {
			if (sql.includes("insert into whatsapp_cloud_webhook_events")) {
				const key = params[0];
				if (keys.has(key)) return { rowCount: 0, rows: [] };
				keys.add(key);
				await new Promise((resolve) => setImmediate(resolve));
				return { rowCount: 1, rows: [{ id: "event-1" }] };
			}
			if (sql.includes("for update skip locked")) return { rows: [] };
			return { rowCount: 1, rows: [] };
		},
	};
	const service = createWhatsappCloudService({
		dbClient,
		audit: { recordAuditLog: async () => {}, calculateChangedFields: () => [] },
		messagingRepository: {},
	});
	const payload = {
		object: "whatsapp_business_account",
		entry: [{ changes: [{ value: { metadata: { phone_number_id: "1" }, messages: [{ id: "wamid.concurrent", from: "5531999990000", timestamp: "1792933200", type: "text", text: { body: "Oi" } }] } }] }],
	};

	const results = await Promise.all([
		service.acceptWebhook(payload),
		service.acceptWebhook(payload),
	]);

	assert.equal(results.reduce((total, result) => total + result.accepted, 0), 1);
	assert.equal(results.reduce((total, result) => total + result.duplicates, 0), 1);
});

test("claim atomico impede dois workers de processarem o mesmo evento", async () => {
	const event = {
		id: "event-1",
		event_type: "MESSAGE_STATUS",
		message_id: "wamid.1",
		status: "delivered",
		event_at: new Date("2026-11-14T12:00:00Z"),
		received_at: new Date("2026-11-14T12:00:00Z"),
		normalized_payload: {},
		processing_status: "PENDING",
		processing_error: null,
		claim_token: null,
	};
	let messageUpdates = 0;
	let completions = 0;
	const dbClient = {
		async query(sql, params = []) {
			if (sql.includes("for update skip locked")) {
				assert.match(sql, /processing_status = 'PROCESSING'/);
				assert.match(sql, /claimed_at < now\(\) - interval '5 minutes'/);
				if (event.processing_status !== "PENDING") return { rows: [] };
				event.processing_status = "PROCESSING";
				event.claim_token = params[0];
				return { rows: [{ ...event }] };
			}
			if (sql.includes("update whatsapp_cloud_test_messages")) {
				messageUpdates += 1;
				await new Promise((resolve) => setImmediate(resolve));
				return { rowCount: 1, rows: [] };
			}
			if (sql.includes("processing_status = 'PROCESSED'")) {
				assert.match(sql, /claim_token = \$3/);
				if (event.claim_token !== params[2]) return { rowCount: 0, rows: [] };
				event.processing_status = "PROCESSED";
				event.processing_error = null;
				event.claim_token = null;
				completions += 1;
				return { rowCount: 1, rows: [] };
			}
			return { rowCount: 1, rows: [] };
		},
	};
	const service = createWhatsappCloudService({
		dbClient,
		audit: { recordAuditLog: async () => {}, calculateChangedFields: () => [] },
		messagingRepository: {},
	});

	const results = await Promise.all([
		service.processPendingWebhookEvents(),
		service.processPendingWebhookEvents(),
	]);

	assert.deepEqual(results.map((result) => result.processed).sort(), [0, 1]);
	assert.equal(messageUpdates, 1);
	assert.equal(completions, 1);
	assert.equal(event.processing_status, "PROCESSED");
});

test("rate limit bloqueia teste antes de chamar a Meta", async () => {
	let providerCalls = 0;
	const config = {
		id: 1,
		meta_test_mode: true,
		production_enabled: false,
		phone_number_id: "1162045177001452",
		graph_api_version: "v26.0",
	};
	const dbClient = {
		async query(sql) {
			if (sql.includes("select * from whatsapp_cloud_config")) return { rows: [config] };
			if (sql.includes("select * from whatsapp_cloud_test_recipients")) return { rows: [{ id: "recipient-1", phone_e164: "+15556716054", name: "Teste", authorization_status: "AUTHORIZED", meta_registered: true }] };
			if (sql.includes("select * from whatsapp_cloud_templates")) return { rows: [{ name: "hello_world", language: "en_US", parameter_count: 0 }] };
			if (sql.includes("global_minute")) return { rows: [{ global_minute: 5, recipient_window: 0 }] };
			return { rows: [], rowCount: 1 };
		},
	};
	const service = createWhatsappCloudService({
		dbClient,
		audit: { recordAuditLog: async () => {}, calculateChangedFields: () => [] },
		messagingRepository: {},
		providerFactory: () => ({
			sendTemplate: async () => {
				providerCalls += 1;
			},
		}),
	});
	await assert.rejects(
		() => service.sendTestMessage({ recipientId: "recipient-1", template: "hello_world", language: "en_US" }),
		/limite de cinco testes/i,
	);
	assert.equal(providerCalls, 0);
});

test("sincroniza componentes de template como JSONB válido", async () => {
	const previousAccessToken = process.env.META_ACCESS_TOKEN;
	const previousAppSecret = process.env.META_APP_SECRET;
	process.env.META_ACCESS_TOKEN = "token-de-teste-comprido";
	process.env.META_APP_SECRET = "app-secret-de-teste-comprido";
	let insertedComponents = "";
	const config = {
		id: 1,
		waba_id: "2099063160707050",
		graph_api_version: "v26.0",
	};
	const dbClient = {
		async query(sql) {
			if (sql.includes("select * from whatsapp_cloud_config")) return { rows: [config] };
			if (sql.includes("from whatsapp_cloud_templates")) return { rows: [] };
			return { rows: [], rowCount: 1 };
		},
		async connect() {
			return {
				async query(sql, params = []) {
					if (sql.includes("insert into whatsapp_cloud_templates")) {
						insertedComponents = params[6];
					}
					return { rows: [], rowCount: 1 };
				},
				release() {},
			};
		},
	};
	try {
		const service = createWhatsappCloudService({
			dbClient,
			audit: { recordAuditLog: async () => {}, calculateChangedFields: () => [] },
			messagingRepository: {},
			providerFactory: () => ({
				listTemplates: async () => ({
					items: [{
						id: "template-1",
						name: "hello_world",
						language: "en_US",
						status: "APPROVED",
						components: [{ type: "BODY", text: "Hello" }],
					}],
				}),
			}),
		});
		await service.syncTemplates({ uid: "admin-1" });
		assert.deepEqual(JSON.parse(insertedComponents), [
			{ type: "BODY", text: "Hello" },
		]);
	} finally {
		if (previousAccessToken === undefined) delete process.env.META_ACCESS_TOKEN;
		else process.env.META_ACCESS_TOKEN = previousAccessToken;
		if (previousAppSecret === undefined) delete process.env.META_APP_SECRET;
		else process.env.META_APP_SECRET = previousAppSecret;
	}
});
