const financeiro = require("./financeiro");
const { parseBudgetWorkbookBuffer } = require("./financeiroBudgetXlsxImport");
const { randomId } = require("./secureRandom");

const jobs = new Map();
const MAX_JOBS = 50;

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

		updateJob(id, {
			stage: "Preparando dados para salvar",
			percent: 50,
			totalRows: rows.length,
			fileReports,
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
	} catch (error) {
		updateJob(id, {
			status: "failed",
			stage: "Falha na importação",
			percent: 100,
			error: error?.message || "Erro interno ao importar dados orçamentários.",
			finishedAt: new Date().toISOString(),
			files: [],
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

