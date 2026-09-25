import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "apps/retiradas/backend/package.json"));

const modulePath = require.resolve("./api/src/evolutionMessaging.js");
const dependencyPaths = [
	"./api/src/documents.js",
	"./api/src/agendamentosRepository.js",
	"./api/src/mensageriaRepository.js",
	"./api/src/notificationsService.js",
	"./api/src/cvortexIntegration.js",
	"./api/src/realtime.js",
].map((dependency) => require.resolve(dependency));

function clearModules() {
	delete require.cache[modulePath];
	for (const dependencyPath of dependencyPaths) {
		delete require.cache[dependencyPath];
	}
}

function loadEvolutionMessaging() {
	clearModules();
	const [
		documentsPath,
		agendamentosRepositoryPath,
		mensageriaRepositoryPath,
		notificationsServicePath,
		cvortexIntegrationPath,
		realtimePath,
	] = dependencyPaths;

	require.cache[documentsPath] = {
		id: documentsPath,
		filename: documentsPath,
		loaded: true,
		exports: {},
	};
	require.cache[agendamentosRepositoryPath] = {
		id: agendamentosRepositoryPath,
		filename: agendamentosRepositoryPath,
		loaded: true,
		exports: {},
	};
	require.cache[mensageriaRepositoryPath] = {
		id: mensageriaRepositoryPath,
		filename: mensageriaRepositoryPath,
		loaded: true,
		exports: {},
	};
	require.cache[notificationsServicePath] = {
		id: notificationsServicePath,
		filename: notificationsServicePath,
		loaded: true,
		exports: { createNotification: vi.fn() },
	};
	require.cache[cvortexIntegrationPath] = {
		id: cvortexIntegrationPath,
		filename: cvortexIntegrationPath,
		loaded: true,
		exports: {},
	};
	require.cache[realtimePath] = {
		id: realtimePath,
		filename: realtimePath,
		loaded: true,
		exports: { broadcastRealtime: vi.fn() },
	};

	return require("./api/src/evolutionMessaging.js")._test;
}

describe("evolutionMessaging guided schedule dates", () => {
	afterEach(() => {
		clearModules();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("prioriza data explicita do cliente antes de opcao numerica salva", () => {
		const helpers = loadEvolutionMessaging();
		const selected = helpers.parseGuidedDateChoice("Dia 01-09", {
			dateOptions: [
				{ key: "1", date: "2026-08-31", label: "31/08" },
				{ key: "2", date: "2026-09-01", label: "01/09" },
			],
		});

		expect(selected).toBe("2026-09-01");
	});

	it("interpreta dia do mes por extenso sem confundir com opcoes guiadas", () => {
		const helpers = loadEvolutionMessaging();
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-09-02T13:00:00-03:00"));

		const selected = helpers.parseGuidedDateChoice("dia 04", {
			dateOptions: [
				{ key: "1", date: "2026-09-02", label: "02/09" },
				{ key: "2", date: "2026-09-03", label: "03/09" },
				{ key: "3", date: "2026-09-05", label: "sábado, 05/09" },
			],
		});

		expect(selected).toBe("2026-09-04");
	});

	it("interpreta dia do mes com zero a esquerda sem cair na opcao guiada", () => {
		const helpers = loadEvolutionMessaging();
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-09-02T13:00:00-03:00"));

		const selected = helpers.parseGuidedDateChoice("03", {
			dateOptions: [
				{ key: "1", date: "2026-09-02", label: "02/09" },
				{ key: "2", date: "2026-09-03", label: "03/09" },
				{ key: "3", date: "2026-09-05", label: "sábado, 05/09" },
			],
		});

		expect(selected).toBe("2026-09-03");
	});

	it("interpreta dia do mes com horario no texto livre", () => {
		const helpers = loadEvolutionMessaging();
		const schedule = helpers.parseScheduleFromText(
			"dia 04 as 16:00",
			new Date("2026-09-02T13:00:00-03:00"),
		);

		expect(schedule).toEqual({ date: "2026-09-04", time: "16:00" });
	});

	it("regenera opcoes de data vencidas salvas na conversa", () => {
		const helpers = loadEvolutionMessaging();
		const options = helpers.getReusableGuidedDateOptions(
			{
				dateOptions: [
					{ key: "1", date: "2026-08-28", label: "28/08" },
					{ key: "2", date: "2026-08-29", label: "29/08" },
					{ key: "3", date: "2026-08-30", label: "domingo, 30/08" },
				],
			},
			new Date("2026-09-01T13:00:00-03:00"),
		);

		expect(options.map((option) => option.date)).toEqual([
			"2026-09-01",
			"2026-09-02",
			"2026-09-05",
		]);
	});

	it("interpreta numero de opcao usando datas atuais quando a conversa esta vencida", () => {
		const helpers = loadEvolutionMessaging();
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-09-01T13:00:00-03:00"));

		const selected = helpers.parseGuidedDateChoice("1", {
			dateOptions: [
				{ key: "1", date: "2026-08-28", label: "28/08" },
				{ key: "2", date: "2026-08-29", label: "29/08" },
				{ key: "3", date: "2026-08-30", label: "domingo, 30/08" },
			],
		});

		expect(selected).toBe("2026-09-01");
	});

	it("normaliza Date usando o dia de Sao Paulo", () => {
		const helpers = loadEvolutionMessaging();

		expect(helpers.dateKeyFromValue(new Date("2026-09-02T02:30:00Z"))).toBe(
			"2026-09-01",
		);
	});

	it("formata data pura sem voltar um dia no alerta", () => {
		const helpers = loadEvolutionMessaging();

		expect(helpers.formatDateLabel("2026-09-03")).toBe("03/09");
		expect(
			helpers.formatDateLabel("2026-09-05", { withWeekday: true }),
		).toContain("05/09");
	});

	it("aceita somente os horarios padrao do fluxo guiado", () => {
		const helpers = loadEvolutionMessaging();

		expect(helpers.parseGuidedTimeChoice("1")).toBe("09:00");
		expect(helpers.parseGuidedTimeChoice("12h")).toBe("12:00");
		expect(helpers.parseGuidedTimeChoice("16:00")).toBe("16:00");
		expect(helpers.parseGuidedTimeChoice("4")).toBeNull();
		expect(helpers.parseGuidedTimeChoice("outro horario")).toBeNull();
		expect(helpers.parseGuidedTimeChoice("14:30")).toBeNull();
	});

	it("remove opcao de outro horario de mensagem configurada antiga", () => {
		const helpers = loadEvolutionMessaging();
		const message = helpers.renderGuidedTimeMessage(
			{
				guidedScheduleTimeMessage:
					"Perfeito. Escolha o horario para {data_agendamento}:\n\n1 - 09h\n2 - 12h\n3 - 16h\n4 - Outro horário\n\nSe preferir, responda com o horário exato. Exemplo: 14:30.",
			},
			{ data_agendamento: "25/09" },
		);

		expect(message).toContain("1 - 09h");
		expect(message).toContain("2 - 12h");
		expect(message).toContain("3 - 16h");
		expect(message).not.toContain("Outro horário");
		expect(message).not.toContain("14:30");
	});

	it("nao trata falha de consulta da Evolution como desconexao confirmada", () => {
		const helpers = loadEvolutionMessaging();

		expect(
			helpers.isConfirmedDisconnectedConnection({
				configured: true,
				connected: false,
				state: "erro",
				checkFailed: true,
				statusCode: 401,
				error: "Evolution HTTP 401",
			}),
		).toBe(false);
		expect(
			helpers.isConfirmedDisconnectedConnection({
				configured: true,
				connected: false,
				state: "close",
			}),
		).toBe(true);
	});
});
