// Roteiro Finan #15 (OCR inteligente) — extração 100% nativa na VPS via
// Tesseract (pacote de português) + Poppler (pdftoppm, pra converter a
// 1a página de um PDF em imagem antes de rodar OCR). Sem API externa,
// sem custo por página, nenhum dado sai do servidor.
//
// Mesmo padrão de execFile já usado pra pg_dump/pg_restore em
// compat/routes.js. Best-effort: qualquer falha aqui nunca derruba o
// upload do documento (ver documentos/routes.js) — o usuário sempre
// pode digitar os campos manualmente se a extração falhar ou vier
// incompleta. Processa só a 1a página (onde normalmente estão CNPJ,
// número, data e valor total de uma nota).
const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const EXEC_TIMEOUT_MS = 30_000;

function run(command, args) {
	return new Promise((resolve, reject) => {
		execFile(command, args, { timeout: EXEC_TIMEOUT_MS, maxBuffer: 20 * 1024 * 1024 }, (error, stdout) => {
			if (error) reject(error);
			else resolve(stdout);
		});
	});
}

async function withTempDir(fn) {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "finan-ocr-"));
	try {
		return await fn(dir);
	} finally {
		await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
	}
}

// Converte a 1a pagina do PDF em PNG (300dpi) e devolve o caminho da
// imagem gerada pra rodar o OCR em cima.
async function renderFirstPdfPageToPng(pdfPath, outDir) {
	const outputPrefix = path.join(outDir, "pagina");
	await run("pdftoppm", ["-png", "-r", "300", "-f", "1", "-l", "1", pdfPath, outputPrefix]);
	const files = await fs.readdir(outDir);
	const pngFile = files.find((name) => name.startsWith("pagina") && name.endsWith(".png"));
	if (!pngFile) throw new Error("Não foi possível converter o PDF em imagem.");
	return path.join(outDir, pngFile);
}

async function runTesseract(imagePath) {
	return run("tesseract", [imagePath, "stdout", "-l", "por"]);
}

// Extrai o texto bruto da 1a pagina do documento (PDF ou imagem).
async function extractRawText(buffer, mimeType) {
	return withTempDir(async (dir) => {
		const isPdf = mimeType === "application/pdf";
		const inputPath = path.join(dir, `entrada.${isPdf ? "pdf" : "img"}`);
		await fs.writeFile(inputPath, buffer);
		const imagePath = isPdf ? await renderFirstPdfPageToPng(inputPath, dir) : inputPath;
		const text = await runTesseract(imagePath);
		return String(text || "").trim();
	});
}

// Nunca grava nada sozinho: so sugere. O usuario confere na etapa
// "Conferir" da Caixa de Entrada antes de virar Nota Fiscal.
const CNPJ_PATTERN = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/;
const DATA_PATTERN = /\b(\d{2})\/(\d{2})\/(\d{4})\b/g;
const VALOR_PATTERN = /R\$\s*([\d.]{1,12},\d{2})/g;
const NUMERO_PATTERN = /\bN[ºo°.]{0,2}\s*[:.]?\s*(\d{3,10})\b/i;
// Nome do fornecedor: 2 estrategias. 1) rotulo explicito comum em notas
// brasileiras (razao social/nome empresarial/emitente/prestador). 2) sem
// rotulo, a linha imediatamente ANTES do CNPJ encontrado costuma ser o
// nome da empresa (layout tipico de cabecalho de nota fiscal) — mais
// fraca, so usada se parecer um nome valido (letras, tamanho razoavel).
const FORNECEDOR_LABEL_PATTERN =
	/(?:raz[ãa]o\s+social|nome\s+empresarial|emitente|prestador(?:\s+de\s+servi[çc]os)?)\s*[:-]?\s*\n?\s*([A-ZÀ-Üa-zà-ü0-9][A-ZÀ-Üa-zà-ü0-9 .,&/-]{3,90})/i;

function parseMoneyBr(text) {
	return Number(text.replace(/\./g, "").replace(",", "."));
}

function extractFornecedorNome(text, cnpj) {
	const labelMatch = text.match(FORNECEDOR_LABEL_PATTERN);
	if (labelMatch) {
		return labelMatch[1].trim().replace(/\s{2,}/g, " ");
	}
	if (!cnpj) return null;
	const cnpjIndex = text.indexOf(cnpj);
	if (cnpjIndex <= 0) return null;
	const linhasAntes = text
		.slice(0, cnpjIndex)
		.split(/\r?\n/)
		.map((linha) => linha.trim())
		.filter(Boolean);
	const candidata = linhasAntes[linhasAntes.length - 1];
	const pareceNome = candidata && candidata.length >= 5 && candidata.length <= 100 && /[A-Za-zÀ-ú]{3,}/.test(candidata) && !/^cnpj|^cpf|^nota\s+fiscal/i.test(candidata);
	return pareceNome ? candidata : null;
}

function extractCamposFromText(text) {
	const cnpjMatch = text.match(CNPJ_PATTERN);

	const valores = [...text.matchAll(VALOR_PATTERN)].map((match) => parseMoneyBr(match[1])).filter((value) => Number.isFinite(value));
	// Heuristica: numa nota, o "valor total" costuma ser o maior valor em
	// R$ que aparece no documento (itens individuais somam menos que o
	// total, taxas/descontos sao menores ainda).
	const maiorValor = valores.length ? Math.max(...valores) : null;

	const datas = [...text.matchAll(DATA_PATTERN)].map((match) => `${match[3]}-${match[2]}-${match[1]}`);

	const numeroMatch = text.match(NUMERO_PATTERN);
	const cnpjEmissor = cnpjMatch ? cnpjMatch[0] : null;

	return {
		cnpjEmissor,
		fornecedorNome: extractFornecedorNome(text, cnpjEmissor),
		valorEncontrado: maiorValor,
		datasEncontradas: [...new Set(datas)].slice(0, 5),
		numeroEncontrado: numeroMatch ? numeroMatch[1] : null,
	};
}

// Ponto de entrada usado por documentos/routes.js. Nunca lanca — sempre
// devolve { ok, textoBruto, campos, erro }, pra quem chama decidir o que
// fazer (marcar status ok/erro no banco).
async function extrairDadosDocumento(buffer, mimeType) {
	if (mimeType === "application/pdf" || /^image\/(png|jpe?g|webp)$/i.test(mimeType || "")) {
		try {
			const textoBruto = await extractRawText(buffer, mimeType);
			return { ok: true, textoBruto, campos: extractCamposFromText(textoBruto) };
		} catch (error) {
			return { ok: false, erro: error?.message || "Falha ao processar o documento." };
		}
	}
	return { ok: false, erro: "Tipo de arquivo não suportado para OCR." };
}

module.exports = {
	__testables: { extractCamposFromText, parseMoneyBr },
	extrairDadosDocumento,
};
