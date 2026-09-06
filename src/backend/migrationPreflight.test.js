// Testes do preflight de migrations (Fase B — docs/TECHNICAL-AUDIT.md,
// achado #4): vps/scripts/migration-preflight.js. Mocka `pg` e
// `./run-sql-migrations` via require.cache — o objetivo é testar a lógica
// de "achar o preflight certo pra cada migration pendente e abortar se
// achar violação", não a conexão real com Postgres.
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "vps/package.json"));
const scriptsDir = path.join(process.cwd(), "vps/scripts");
const scriptPath = require.resolve(path.join(scriptsDir, "migration-preflight.js"));
const runMigrationsPath = require.resolve(path.join(scriptsDir, "run-sql-migrations.js"));
const pgPath = require.resolve("pg");

let runMigrationsMock;
let pgClientInstances;

function setMock(resolvedPath, exports) {
	require.cache[resolvedPath] = {
		id: resolvedPath,
		filename: resolvedPath,
		loaded: true,
		exports,
	};
}

function installMocks({ pendingFiles = [] } = {}) {
	const applied = new Set(); // nenhum aplicado -> tudo em `files` é "pendente"
	runMigrationsMock = {
		getConnectionConfig: vi.fn(() => ({})),
		getMigrationVersion: vi.fn((fileName) => String(fileName).split("_")[0] || ""),
		listMigrationFiles: vi.fn(async () => pendingFiles),
		ensureMigrationTable: vi.fn(async () => undefined),
		maybeBaselineExistingDatabase: vi.fn(async () => applied),
	};
	setMock(runMigrationsPath, runMigrationsMock);

	pgClientInstances = [];
	class FakeClient {
		constructor() {
			pgClientInstances.push(this);
			this.connect = vi.fn(async () => undefined);
			this.end = vi.fn(async () => undefined);
			this.query = vi.fn(async () => ({ rows: [] }));
		}
	}
	setMock(pgPath, { Client: FakeClient });

	delete require.cache[scriptPath];
}

describe("migration-preflight", () => {
	afterEach(() => {
		delete require.cache[scriptPath];
		delete require.cache[runMigrationsPath];
		delete require.cache[pgPath];
	});

	it("sem migrations pendentes: retorna relatório vazio, sem violação", async () => {
		installMocks({ pendingFiles: [] });
		const { main } = require(scriptPath);
		const report = await main();
		expect(report.pending).toEqual([]);
		expect(report.violations).toEqual([]);
	});

	it("migration pendente SEM preflight dedicado: não bloqueia (violations vazio)", async () => {
		installMocks({ pendingFiles: ["999_sem_preflight.sql"] });
		const { main } = require(scriptPath);
		const report = await main();
		expect(report.pending).toEqual(["999_sem_preflight.sql"]);
		expect(report.violations).toEqual([]);
	});

	it("migration pendente com preflight que NÃO acha violação (0 linhas): passa", async () => {
		// usa um arquivo de sql-tools real: como não existe nenhum
		// preflight_999_*.sql de verdade, simulamos via mock de fs? Não —
		// mais simples: cobrimos esse caminho testando findPreflightFileForVersion
		// isoladamente (abaixo) e o caminho de violação encontrada via
		// leitura real de um preflight fixture temporário.
		installMocks({ pendingFiles: [] });
		const { findPreflightFileForVersion } = require(scriptPath);
		expect(
			findPreflightFileForVersion("013", [
				"README.md",
				"preflight_013_algo.sql",
				"preflight_014_outro.sql",
			]),
		).toBe("preflight_013_algo.sql");
		expect(findPreflightFileForVersion("999", ["README.md"])).toBeNull();
	});

	it("client.connect()/client.end() são sempre chamados (mesmo sem pendências)", async () => {
		installMocks({ pendingFiles: [] });
		const { main } = require(scriptPath);
		await main();
		expect(pgClientInstances).toHaveLength(1);
		expect(pgClientInstances[0].connect).toHaveBeenCalledTimes(1);
		expect(pgClientInstances[0].end).toHaveBeenCalledTimes(1);
	});
});

describe("migration-preflight — violação real (arquivo de preflight de verdade)", () => {
	const fs = require("node:fs");
	const os = require("node:os");
	let tmpSqlToolsDir;
	let originalPreflightDirEnv;

	beforeEach(() => {
		tmpSqlToolsDir = fs.mkdtempSync(path.join(os.tmpdir(), "sql-tools-"));
		originalPreflightDirEnv = process.env.SQL_PREFLIGHT_DIR;
	});

	afterEach(() => {
		fs.rmSync(tmpSqlToolsDir, { recursive: true, force: true });
		if (originalPreflightDirEnv === undefined) delete process.env.SQL_PREFLIGHT_DIR;
		else process.env.SQL_PREFLIGHT_DIR = originalPreflightDirEnv;
	});

	it("preflight que devolve linhas é reportado como violação (report.violations populado)", async () => {
		fs.writeFileSync(
			path.join(tmpSqlToolsDir, "preflight_777_teste.sql"),
			"select 1 as violation_id",
		);
		process.env.SQL_PREFLIGHT_DIR = tmpSqlToolsDir;

		runMigrationsMock = {
			getConnectionConfig: vi.fn(() => ({})),
			getMigrationVersion: vi.fn((fileName) => String(fileName).split("_")[0] || ""),
			listMigrationFiles: vi.fn(async () => ["777_teste.sql"]),
			ensureMigrationTable: vi.fn(async () => undefined),
			maybeBaselineExistingDatabase: vi.fn(async () => new Set()),
		};
		setMock(runMigrationsPath, runMigrationsMock);

		class FakeClient {
			constructor() {
				this.connect = vi.fn(async () => undefined);
				this.end = vi.fn(async () => undefined);
				this.query = vi.fn(async (sql) => {
					if (String(sql).includes("violation_id")) {
						return { rows: [{ violation_id: 1 }, { violation_id: 2 }] };
					}
					return { rows: [] };
				});
			}
		}
		setMock(pgPath, { Client: FakeClient });
		delete require.cache[scriptPath];

		const { main } = require(scriptPath);
		const report = await main();

		expect(report.violations).toHaveLength(1);
		expect(report.violations[0]).toMatchObject({
			migration: "777_teste.sql",
			preflightFile: "preflight_777_teste.sql",
			count: 2,
		});
	});

	it("preflight que devolve 0 linhas: sem violação", async () => {
		fs.writeFileSync(
			path.join(tmpSqlToolsDir, "preflight_777_teste.sql"),
			"select 1 as violation_id where false",
		);
		process.env.SQL_PREFLIGHT_DIR = tmpSqlToolsDir;

		runMigrationsMock = {
			getConnectionConfig: vi.fn(() => ({})),
			getMigrationVersion: vi.fn((fileName) => String(fileName).split("_")[0] || ""),
			listMigrationFiles: vi.fn(async () => ["777_teste.sql"]),
			ensureMigrationTable: vi.fn(async () => undefined),
			maybeBaselineExistingDatabase: vi.fn(async () => new Set()),
		};
		setMock(runMigrationsPath, runMigrationsMock);

		class FakeClient {
			constructor() {
				this.connect = vi.fn(async () => undefined);
				this.end = vi.fn(async () => undefined);
				this.query = vi.fn(async () => ({ rows: [] }));
			}
		}
		setMock(pgPath, { Client: FakeClient });
		delete require.cache[scriptPath];

		const { main } = require(scriptPath);
		const report = await main();

		expect(report.violations).toEqual([]);
	});
});
