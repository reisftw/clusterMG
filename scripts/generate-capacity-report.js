import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const DEFAULT_OUTPUT_DIR = path.join(projectRoot, "reports");
const REQUIRED_STEP_FIELDS = [
	"users",
	"avgResponseMs",
	"maxResponseMs",
	"errorRate",
	"requestsPerSecond",
];

const COLORS = {
	navy: [12, 35, 78],
	blue: [37, 99, 235],
	green: [22, 163, 74],
	orange: [234, 88, 12],
	red: [220, 38, 38],
	gray: [71, 85, 105],
	lightGray: [241, 245, 249],
	border: [203, 213, 225],
};

function parseArgs(argv) {
	const args = {
		input: "",
		outputDir: DEFAULT_OUTPUT_DIR,
	};

	for (let index = 2; index < argv.length; index += 1) {
		const arg = argv[index];
		const next = argv[index + 1];

		if ((arg === "--input" || arg === "-i") && next) {
			args.input = path.resolve(process.cwd(), next);
			index += 1;
		} else if ((arg === "--output" || arg === "-o") && next) {
			args.outputDir = path.resolve(process.cwd(), next);
			index += 1;
		} else if (arg === "--help" || arg === "-h") {
			args.help = true;
		}
	}

	return args;
}

function printHelp() {
	console.log(`
Uso:
  node scripts/generate-capacity-report.js --input examples/capacity-test-sample.json
  npm run report:capacity -- --input examples/capacity-test-sample.json --output reports

Entrada:
  JSON ou CSV com dados do teste.

JSON esperado:
  {
    "systemName": "Sistema de Retiradas | Cluster MG",
    "testDate": "2026-08-24T10:00:00-03:00",
    "environment": "Produção",
    "tool": "k6",
    "responsible": "Rodrigo Reis",
    "thresholds": { "maxErrorRate": 2, "maxLatencyMs": 1200 },
    "steps": [
      {
        "users": 50,
        "avgResponseMs": 180,
        "maxResponseMs": 620,
        "errorRate": 0.1,
        "requestsPerSecond": 42,
        "cpuPercent": 38,
        "memoryPercent": 52
      }
    ],
    "bottlenecks": ["Banco de dados começou a elevar latência."],
    "recommendations": ["Adicionar cache nas consultas mais acessadas."]
  }

CSV esperado:
  users,avgResponseMs,maxResponseMs,errorRate,requestsPerSecond,cpuPercent,memoryPercent
`);
}

function parseCsvLine(line) {
	const values = [];
	let current = "";
	let insideQuotes = false;

	for (let index = 0; index < line.length; index += 1) {
		const char = line[index];
		const next = line[index + 1];

		if (char === '"' && next === '"') {
			current += '"';
			index += 1;
		} else if (char === '"') {
			insideQuotes = !insideQuotes;
		} else if (char === "," && !insideQuotes) {
			values.push(current.trim());
			current = "";
		} else {
			current += char;
		}
	}

	values.push(current.trim());
	return values;
}

function parseCsv(content) {
	const lines = content
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);

	if (lines.length < 2) {
		throw new Error(
			"CSV precisa ter cabecalho e pelo menos uma linha de dados.",
		);
	}

	const headers = parseCsvLine(lines[0]);
	const steps = lines.slice(1).map((line) => {
		const values = parseCsvLine(line);
		return Object.fromEntries(
			headers.map((header, index) => [header, values[index] ?? ""]),
		);
	});

	return {
		systemName: "Sistema de Retiradas | Cluster MG",
		testDate: new Date().toISOString(),
		environment: "Nao informado",
		tool: "Nao informado",
		responsible: "Gerado automaticamente",
		thresholds: { maxErrorRate: 2, maxLatencyMs: 1200 },
		steps,
		bottlenecks: [],
		recommendations: [],
	};
}

function readInputFile(inputPath) {
	if (!inputPath) {
		throw new Error(
			"Informe o arquivo de entrada com --input caminho/do/arquivo.json.",
		);
	}

	if (!fs.existsSync(inputPath)) {
		throw new Error(`Arquivo de entrada nao encontrado: ${inputPath}`);
	}

	const content = fs.readFileSync(inputPath, "utf8");
	const extension = path.extname(inputPath).toLowerCase();

	if (extension === ".json") {
		return JSON.parse(content);
	}

	if (extension === ".csv") {
		return parseCsv(content);
	}

	throw new Error("Formato nao suportado. Use JSON ou CSV.");
}

function toNumber(value, fieldName) {
	const normalized =
		typeof value === "string" ? value.replace(",", ".") : value;
	const number = Number(normalized);
	if (!Number.isFinite(number)) {
		throw new Error(`Campo numerico invalido: ${fieldName}`);
	}
	return number;
}

function normalizeStep(step, index) {
	for (const field of REQUIRED_STEP_FIELDS) {
		if (
			step[field] === undefined ||
			step[field] === null ||
			step[field] === ""
		) {
			throw new Error(
				`Etapa ${index + 1}: campo obrigatorio ausente: ${field}`,
			);
		}
	}

	return {
		users: toNumber(step.users, `steps[${index}].users`),
		avgResponseMs: toNumber(
			step.avgResponseMs,
			`steps[${index}].avgResponseMs`,
		),
		maxResponseMs: toNumber(
			step.maxResponseMs,
			`steps[${index}].maxResponseMs`,
		),
		errorRate: toNumber(step.errorRate, `steps[${index}].errorRate`),
		requestsPerSecond: toNumber(
			step.requestsPerSecond,
			`steps[${index}].requestsPerSecond`,
		),
		cpuPercent:
			step.cpuPercent === undefined || step.cpuPercent === ""
				? null
				: toNumber(step.cpuPercent, `steps[${index}].cpuPercent`),
		memoryPercent:
			step.memoryPercent === undefined || step.memoryPercent === ""
				? null
				: toNumber(step.memoryPercent, `steps[${index}].memoryPercent`),
	};
}

function validateReportData(rawData) {
	if (!rawData || typeof rawData !== "object") {
		throw new Error(
			"Entrada malformada: esperado um objeto JSON ou CSV valido.",
		);
	}

	if (!Array.isArray(rawData.steps) || rawData.steps.length === 0) {
		throw new Error(
			"Entrada malformada: informe steps com pelo menos uma etapa.",
		);
	}

	const steps = rawData.steps
		.map(normalizeStep)
		.sort((a, b) => a.users - b.users);
	const thresholds = {
		maxErrorRate: Number(rawData.thresholds?.maxErrorRate ?? 2),
		maxLatencyMs: Number(rawData.thresholds?.maxLatencyMs ?? 1200),
	};

	if (
		!Number.isFinite(thresholds.maxErrorRate) ||
		!Number.isFinite(thresholds.maxLatencyMs)
	) {
		throw new Error(
			"Thresholds invalidos: maxErrorRate e maxLatencyMs precisam ser numericos.",
		);
	}

	return {
		systemName: String(
			rawData.systemName || "Sistema de Retiradas | Cluster MG",
		),
		testDate: String(rawData.testDate || new Date().toISOString()),
		environment: String(rawData.environment || "Nao informado"),
		tool: String(rawData.tool || "Nao informado"),
		responsible: String(rawData.responsible || "Gerado automaticamente"),
		thresholds,
		steps,
		bottlenecks: Array.isArray(rawData.bottlenecks)
			? rawData.bottlenecks.map(String)
			: [],
		recommendations: Array.isArray(rawData.recommendations)
			? rawData.recommendations.map(String)
			: [],
	};
}

function formatDateTime(value) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return new Intl.DateTimeFormat("pt-BR", {
		dateStyle: "short",
		timeStyle: "short",
	}).format(date);
}

function formatNumber(value, digits = 0) {
	return new Intl.NumberFormat("pt-BR", {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits,
	}).format(value);
}

function classifyCapacity(maxStableUsers) {
	if (maxStableUsers >= 500) return "Capacidade alta para o uso esperado";
	if (maxStableUsers >= 150) return "Capacidade media para o uso esperado";
	return "Capacidade baixa ou limitada para uso simultaneo elevado";
}

function analyzeCapacity(data) {
	const firstFailingStep = data.steps.find(
		(step) =>
			step.errorRate > data.thresholds.maxErrorRate ||
			step.avgResponseMs > data.thresholds.maxLatencyMs,
	);
	const stableSteps = data.steps.filter(
		(step) =>
			step.errorRate <= data.thresholds.maxErrorRate &&
			step.avgResponseMs <= data.thresholds.maxLatencyMs,
	);
	const maxStableUsers = stableSteps.length
		? Math.max(...stableSteps.map((step) => step.users))
		: 0;

	return {
		maxStableUsers,
		firstFailingStep,
		classification: classifyCapacity(maxStableUsers),
	};
}

function addHeader(doc, data, title = "Relatorio de Capacidade") {
	doc.setFillColor(...COLORS.navy);
	doc.rect(0, 0, 210, 30, "F");
	doc.setTextColor(255, 255, 255);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(17);
	doc.text(title, 14, 13);
	doc.setFontSize(9);
	doc.setFont("helvetica", "normal");
	doc.text(data.systemName, 14, 21);
	doc.text(`Gerado em ${formatDateTime(new Date().toISOString())}`, 152, 21);
	doc.setTextColor(0, 0, 0);
}

function addFooter(doc, data) {
	const pageCount = doc.getNumberOfPages();
	for (let page = 1; page <= pageCount; page += 1) {
		doc.setPage(page);
		doc.setDrawColor(...COLORS.border);
		doc.line(14, 284, 196, 284);
		doc.setFontSize(8);
		doc.setTextColor(...COLORS.gray);
		doc.text(`Ferramenta: ${data.tool}`, 14, 290);
		doc.text(`Responsavel: ${data.responsible}`, 80, 290);
		doc.text(`Pagina ${page}/${pageCount}`, 178, 290);
	}
}

function card(doc, x, y, width, height, title, value, color = COLORS.blue) {
	doc.setFillColor(255, 255, 255);
	doc.setDrawColor(...COLORS.border);
	doc.roundedRect(x, y, width, height, 3, 3, "FD");
	doc.setTextColor(...COLORS.gray);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(8);
	doc.text(title.toUpperCase(), x + 4, y + 7);
	doc.setTextColor(...color);
	doc.setFontSize(16);
	doc.text(String(value), x + 4, y + 19);
}

function addWrappedList(doc, title, items, x, y) {
	doc.setFont("helvetica", "bold");
	doc.setFontSize(12);
	doc.setTextColor(...COLORS.navy);
	doc.text(title, x, y);

	doc.setFont("helvetica", "normal");
	doc.setFontSize(9);
	doc.setTextColor(...COLORS.gray);

	const list = items.length ? items : ["Nenhum item informado."];
	let cursorY = y + 7;
	list.forEach((item) => {
		const lines = doc.splitTextToSize(`- ${item}`, 178);
		doc.text(lines, x, cursorY);
		cursorY += lines.length * 5 + 2;
	});

	return cursorY;
}

function drawLineChart(doc, x, y, width, height, title, labels, series) {
	const padding = 12;
	const chartX = x + padding;
	const chartY = y + padding + 7;
	const chartWidth = width - padding * 2;
	const chartHeight = height - padding * 2 - 4;
	const maxValue = Math.max(...series.flatMap((item) => item.values), 1);

	doc.setFillColor(255, 255, 255);
	doc.setDrawColor(...COLORS.border);
	doc.roundedRect(x, y, width, height, 3, 3, "FD");
	doc.setFont("helvetica", "bold");
	doc.setFontSize(10);
	doc.setTextColor(...COLORS.navy);
	doc.text(title, x + 5, y + 8);

	doc.setDrawColor(226, 232, 240);
	for (let line = 0; line <= 4; line += 1) {
		const lineY = chartY + (chartHeight / 4) * line;
		doc.line(chartX, lineY, chartX + chartWidth, lineY);
	}

	series.forEach((item) => {
		doc.setDrawColor(...item.color);
		doc.setLineWidth(0.7);
		const points = item.values.map((value, index) => {
			const pointX =
				chartX +
				(labels.length === 1
					? chartWidth / 2
					: (chartWidth / (labels.length - 1)) * index);
			const pointY = chartY + chartHeight - (value / maxValue) * chartHeight;
			return [pointX, pointY];
		});

		points.forEach(([pointX, pointY], index) => {
			doc.setFillColor(...item.color);
			doc.circle(pointX, pointY, 1.4, "F");
			if (index > 0) {
				const [prevX, prevY] = points[index - 1];
				doc.line(prevX, prevY, pointX, pointY);
			}
		});
	});

	doc.setFont("helvetica", "normal");
	doc.setFontSize(7);
	doc.setTextColor(...COLORS.gray);
	labels.forEach((label, index) => {
		if (
			index % Math.ceil(labels.length / 6) !== 0 &&
			index !== labels.length - 1
		)
			return;
		const labelX =
			chartX +
			(labels.length === 1
				? chartWidth / 2
				: (chartWidth / (labels.length - 1)) * index);
		doc.text(String(label), labelX - 4, chartY + chartHeight + 6);
	});

	let legendX = x + 5;
	series.forEach((item) => {
		doc.setFillColor(...item.color);
		doc.circle(legendX, y + height - 6, 1.5, "F");
		doc.setTextColor(...COLORS.gray);
		doc.text(item.label, legendX + 4, y + height - 4);
		legendX += 42;
	});
}

function generatePdf(data, outputDir) {
	const analysis = analyzeCapacity(data);
	const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
	addHeader(doc, data);

	doc.setTextColor(...COLORS.navy);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(13);
	doc.text("Resumo executivo", 14, 42);

	card(
		doc,
		14,
		49,
		43,
		25,
		"Usuarios estaveis",
		analysis.maxStableUsers,
		COLORS.green,
	);
	card(
		doc,
		61,
		49,
		43,
		25,
		"Falha inicia em",
		analysis.firstFailingStep ? analysis.firstFailingStep.users : "Nao falhou",
		analysis.firstFailingStep ? COLORS.red : COLORS.green,
	);
	card(
		doc,
		108,
		49,
		43,
		25,
		"Latencia limite",
		`${formatNumber(data.thresholds.maxLatencyMs)} ms`,
		COLORS.orange,
	);
	card(
		doc,
		155,
		49,
		41,
		25,
		"Erro limite",
		`${formatNumber(data.thresholds.maxErrorRate, 1)}%`,
		COLORS.orange,
	);

	doc.setFont("helvetica", "normal");
	doc.setFontSize(10);
	doc.setTextColor(...COLORS.gray);
	const failingText = analysis.firstFailingStep
		? `O primeiro ponto de degradacao foi observado com ${analysis.firstFailingStep.users} usuarios simultaneos, com latencia media de ${formatNumber(analysis.firstFailingStep.avgResponseMs)} ms e taxa de erro de ${formatNumber(analysis.firstFailingStep.errorRate, 2)}%.`
		: "Nenhum ponto de falha foi identificado dentro das etapas informadas.";
	doc.text(
		doc.splitTextToSize(
			`Ambiente: ${data.environment}. Teste realizado em ${formatDateTime(data.testDate)}. ${failingText} Classificacao geral: ${analysis.classification}.`,
			182,
		),
		14,
		84,
	);

	autoTable(doc, {
		startY: 103,
		head: [
			[
				"Usuarios",
				"Medio (ms)",
				"Maximo (ms)",
				"Erro (%)",
				"Req/s",
				"CPU (%)",
				"Mem. (%)",
			],
		],
		body: data.steps.map((step) => [
			formatNumber(step.users),
			formatNumber(step.avgResponseMs),
			formatNumber(step.maxResponseMs),
			formatNumber(step.errorRate, 2),
			formatNumber(step.requestsPerSecond, 1),
			step.cpuPercent === null ? "-" : formatNumber(step.cpuPercent, 1),
			step.memoryPercent === null ? "-" : formatNumber(step.memoryPercent, 1),
		]),
		styles: { fontSize: 8, cellPadding: 2.4 },
		headStyles: { fillColor: COLORS.navy, textColor: [255, 255, 255] },
		alternateRowStyles: { fillColor: COLORS.lightGray },
		margin: { left: 14, right: 14 },
	});

	doc.addPage();
	addHeader(doc, data, "Graficos do Teste");
	const labels = data.steps.map((step) => step.users);
	drawLineChart(doc, 14, 42, 182, 70, "Latencia x Usuarios", labels, [
		{
			label: "Medio",
			values: data.steps.map((step) => step.avgResponseMs),
			color: COLORS.blue,
		},
		{
			label: "Maximo",
			values: data.steps.map((step) => step.maxResponseMs),
			color: COLORS.orange,
		},
	]);
	drawLineChart(doc, 14, 123, 182, 60, "Taxa de erro x Usuarios", labels, [
		{
			label: "Erro (%)",
			values: data.steps.map((step) => step.errorRate),
			color: COLORS.red,
		},
	]);

	const hasCpuOrMemory = data.steps.some(
		(step) => step.cpuPercent !== null || step.memoryPercent !== null,
	);
	if (hasCpuOrMemory) {
		drawLineChart(doc, 14, 194, 182, 60, "CPU/Memoria x Usuarios", labels, [
			{
				label: "CPU",
				values: data.steps.map((step) => step.cpuPercent ?? 0),
				color: COLORS.green,
			},
			{
				label: "Memoria",
				values: data.steps.map((step) => step.memoryPercent ?? 0),
				color: COLORS.orange,
			},
		]);
	}

	doc.addPage();
	addHeader(doc, data, "Gargalos e Recomendacoes");
	let cursorY = addWrappedList(
		doc,
		"Gargalos identificados",
		data.bottlenecks,
		14,
		45,
	);
	cursorY = Math.max(cursorY + 8, 92);
	addWrappedList(doc, "Recomendacoes", data.recommendations, 14, cursorY);

	addFooter(doc, data);

	fs.mkdirSync(outputDir, { recursive: true });
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	const outputPath = path.join(
		outputDir,
		`relatorio-capacidade-${timestamp}.pdf`,
	);
	doc.save(outputPath);
	return outputPath;
}

function main() {
	const args = parseArgs(process.argv);
	if (args.help) {
		printHelp();
		return;
	}

	try {
		const rawData = readInputFile(args.input);
		const data = validateReportData(rawData);
		const outputPath = generatePdf(data, args.outputDir);
		console.log(`Relatorio gerado com sucesso: ${outputPath}`);
	} catch (error) {
		console.error(`Erro ao gerar relatorio: ${error.message}`);
		process.exitCode = 1;
	}
}

main();
