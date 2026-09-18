const financeiro = require("./financeiro");
const { parseBudgetWorkbookBuffer } = require("./financeiroBudgetXlsxImport");
const { randomId } = require("./secureRandom");
const notificationsService = require("./notifications/notificationsService");
const jobExecutionService = require("./jobs/jobExecutionService");
const db = require("./db");

const jobs = new Map();
const MAX_JOBS = 50;

// Roteiro Finan #12 (Fechamento Mensal): barra a importacao de linhas
// pertencentes a um periodo (ano/mes) ja fechado. Deliberadamente coarse
// (rejeita o lote inteiro, nao so as linhas do periodo fechado) — mais
// simples e mais seguro do que tentar filtrar linha a linha dentro do
// pipeline de merge existente (financeiro.js:saveBudgetData), que ja e
// usado em producao com dado real e nao deve ser tocado sem necessidade.
async function findClosedPeriodsInRows(rows = []) {
	const periods = new Set();
	rows.forEach((row) => {
		const ano = Number(row.ano);
		const mes = Number(row.numMes);
		if (ano && mes) periods.add(`${ano}-${mes}`);
	});
	if (!periods.size) return [];
	const { rows: closed } = await db.query(
		`select ano, mes from finan_fechamentos_mensais
		where status = 'fechado' and (ano::text || '-' || mes::text) = any($1::text[])`,
		[[...periods]],
	);
	return closed;
}

// Roteiro Finan #17 (Importacao inteligente de planilhas): marca cada
// arquivo importado como "reconhecido" (mesma combinacao layout+cabecalho
// ja vista antes) ou "novo" (formato inedito — vale conferir os dados antes
// de confiar, especialmente relevante pra planilhas historicas com anos de
// diferenca). Melhor esforco: nunca falha a importacao por causa disso.
async function recognizeImportLayouts(fileReports = []) {
	return Promise.all(
		fileReports.map(async (file) => {
			const signature = `${file.layout}:${file.headerSignature || ""}`;
			try {
				const { rows } = await db.query(
					`insert into finan_import_layouts (signature, layout, sample_file_name, sample_sheet_name)
					values ($1, $2, $3, $4)
					on conflict (signature) do update set
						times_used = finan_import_layouts.times_used + 1,
						last_seen_at = now()
					returning times_used`,
					[signature, file.layout, file.fileName, file.sheetName],
				);
				const timesUsed = rows[0]?.times_used || 1;
				return { ...file, recognized: timesUsed > 1, timesUsed };
			} catch (error) {
				console.warn("[budget-import] Falha ao registrar layout:", error?.message || error);
				return { ...file, recognized: false, timesUsed: 1 };
			}
		}),
	);
}

function publicJob(job) {
	if (!job) return null;
	const { files: _files, ...visible } = job;
	return visible;
}

function trimJobs() {
	const entries = [...jobs.entries()].sort(
		(a, b) => new Date(a[1].createdAt).getTime() - new Date(b[1].createdAt).getTime(),
	);
	while (entries.length > MAX_JOBS) {
		const [id] = entries.shift();
		jobs.delete(id);
	}
}

// Melhor esforco, nunca interrompe o job: uma falha ao notificar nao pode
// derrubar/mascarar o resultado real da importacao de orcamento.
function notifyBudgetImportResult({ user, success, totalRows, error }) {
	const notification = success
		? {
				title: "Importação de orçamento concluída",
				message: `${totalRows} linha(s) importada(s) com sucesso.`,
				severity: "success",
			}
		: {
				title: "Falha na importação de orçamento",
				message: error || "Erro interno ao importar dados orçamentários.",
				severity: "critical",
			};
	notificationsService
		.createNotification({
			type: "import_orcamento",
			targetPath: "/gestao-orcamentaria/dados",
			targets: { permissions: ["finan.gestao_orcamentaria.manage"] },
			createdBy: { id: user?.uid, name: user?.profile?.name || user?.email },
			...notification,
		})
		.catch((err) =>
			console.error("[finan-import-orcamento-notificacao]", err?.message || err),
		);
}

function updateJob(id, patch = {}) {
	const current = jobs.get(id);
	if (!current) return null;
	const next = {
		...current,
		...patch,
		updatedAt: new Date().toISOString(),
	};
	jobs.set(id, next);
	return next;
}

async function processBudgetImportJob(id) {
	const job = jobs.get(id);
	if (!job) return;
	// Roteiro Finan #28: registra na Central de Jobs — sempre "manual"
	// porque esse job so roda a partir de um upload feito por um usuario
	// (diferente de backup/alertas, que tem um systemd timer disparando
	// sozinho). O jobExecId nunca falha a importacao real: startExecution
	// ja e melhor esforco por dentro (ver jobExecutionService.js).
	const jobExecId = await jobExecutionService.startExecution("import_orcamento", {
		trigger: "manual",
		triggeredBy: { id: job.user?.uid, name: job.user?.profile?.name || job.user?.email },
	});
	try {
		updateJob(id, {
			status: "running",
			stage: "Lendo planilhas XLSX",
			percent: 5,
		});

		const rows = [];
		const detectedFields = new Set();
		const fileReports = [];
		const totalFiles = job.files.length;
		for (const [index, file] of job.files.entries()) {
			updateJob(id, {
				stage: `Lendo ${file.originalname} (${index + 1}/${totalFiles})`,
				percent: Math.min(45, 5 + Math.round((index / totalFiles) * 40)),
			});
			const parsed = parseBudgetWorkbookBuffer(file.buffer, file.originalname);
			rows.push(...parsed.rows);
			parsed.detectedFields.forEach((field) => detectedFields.add(field));
			fileReports.push(...parsed.files);
		}

		const closedPeriods = await findClosedPeriodsInRows(rows);
		if (closedPeriods.length) {
			const labels = closedPeriods.map((p) => `${String(p.mes).padStart(2, "0")}/${p.ano}`).join(", ");
			throw new Error(
				`Período(s) ${labels} já está(ão) fechado(s) no Fechamento Mensal. Reabra o período (com justificativa) antes de importar.`,
			);
		}

		const annotatedFileReports = await recognizeImportLayouts(fileReports);

		updateJob(id, {
			stage: "Preparando dados para salvar",
			percent: 50,
			totalRows: rows.length,
			fileReports: annotatedFileReports,
		});

		const payload = {
			fileName: job.files.map((file) => file.originalname).join(", "),
			sheetName: fileReports
				.map((file) => `${file.fileName}:${file.sheetName}`)
				.join(", "),
			detectedFields: [...detectedFields],
			rows,
			append: true,
			importJobId: id,
		};

		updateJob(id, {
			stage: "Salvando no banco de dados",
			percent: 70,
		});
		const result = await financeiro.saveBudgetData(payload, job.user);

		updateJob(id, {
			status: "completed",
			stage: "Importação concluída",
			percent: 100,
			finishedAt: new Date().toISOString(),
			files: [],
			result,
			totalRows: rows.length,
		});
		notifyBudgetImportResult({ user: job.user, success: true, totalRows: rows.length });
		await jobExecutionService.finishExecution(jobExecId, {
			status: "success",
			recordsProcessed: rows.length,
			summary: { totalFiles: job.files.length, fileReports: annotatedFileReports },
		});
	} catch (error) {
		updateJob(id, {
			status: "failed",
			stage: "Falha na importação",
			percent: 100,
			error: error?.message || "Erro interno ao importar dados orçamentários.",
			finishedAt: new Date().toISOString(),
			files: [],
		});
		notifyBudgetImportResult({
			user: job.user,
			success: false,
			error: error?.message,
		});
		await jobExecutionService.finishExecution(jobExecId, {
			status: "failed",
			errorMessage: error?.message || "Erro interno ao importar dados orçamentários.",
		});
	}
}

function createBudgetImportJob(files = [], user = {}) {
	if (!files.length) {
		const error = new Error("Envie ao menos uma planilha XLSX.");
		error.statusCode = 400;
		throw error;
	}
	const id = randomId("finan_orcamento");
	const now = new Date().toISOString();
	const job = {
		id,
		status: "queued",
		stage: "Aguardando processamento",
		percent: 0,
		totalFiles: files.length,
		totalRows: 0,
		fileReports: [],
		error: "",
		createdAt: now,
		updatedAt: now,
		finishedAt: "",
		user: {
			uid: user?.uid || "",
			email: user?.email || "",
			profile: user?.profile || {},
		},
		files: files.map((file) => ({
			originalname: file.originalname,
			buffer: file.buffer,
		})),
	};
	jobs.set(id, job);
	trimJobs();
	setImmediate(() => processBudgetImportJob(id));
	return publicJob(job);
}

function getBudgetImportJob(id) {
	return publicJob(jobs.get(String(id || "")));
}

module.exports = {
	createBudgetImportJob,
	getBudgetImportJob,
};

