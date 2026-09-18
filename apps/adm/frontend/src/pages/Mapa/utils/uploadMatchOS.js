import * as XLSX from "xlsx";
import { buildCacheKey, invalidateCache } from "../../../services/dataCache";
import { invalidateInternalStaticDataCache } from "../../../services/internalStaticDataService";
import { persistMatchImport } from "../../../services/operationalImportService";
import { invalidateDashboardDataCache } from "../../PainelPublico/hooks/useDashboardData";

async function readRowsFromFile(file) {
	const buffer = await file.arrayBuffer();
	const workbook = XLSX.read(buffer, { type: "array" });
	const worksheet = workbook.Sheets[workbook.SheetNames[0]];
	return XLSX.utils.sheet_to_json(worksheet, { defval: null });
}

export async function processarUploadMatch(
	filesInput,
	onProgress,
	periodo,
	onJobProgress,
) {
	const files = Array.isArray(filesInput) ? filesInput : [filesInput];
	const validFiles = files.filter(Boolean);

	if (!validFiles.length) {
		throw new Error("Selecione ao menos uma planilha para importar.");
	}

	const rows = [];

	for (const [index, file] of validFiles.entries()) {
		const fileLabel =
			validFiles.length > 1 ? ` (${index + 1}/${validFiles.length})` : "";
		onProgress?.(`Lendo planilha do Match${fileLabel}...`);
		rows.push(...(await readRowsFromFile(file)));
	}

	const fontes =
		Array.isArray(periodo?.fontes) && periodo.fontes.length > 0
			? periodo.fontes.filter((fonte) => ["sempre", "onnet"].includes(fonte))
			: ["sempre", "onnet"];
	const fontesUnicas = [
		...new Set(fontes.length > 0 ? fontes : ["sempre", "onnet"]),
	];
	const fonteLabel =
		fontesUnicas.includes("sempre") && fontesUnicas.includes("onnet")
			? "SEMPRE + ONNET"
			: fontesUnicas.includes("onnet")
				? "ONNET"
				: "SEMPRE";

	onProgress?.(`Enviando planilha ${fonteLabel} para processamento...`);
	const persistResult = await persistMatchImport(
		{
			rows,
			periodo,
			fontes: fontesUnicas,
		},
		{
			onProgress: (job) => {
				onJobProgress?.(job);
				if (job?.stage) {
					onProgress?.(
						`${job.stage}${job.percent !== undefined ? ` (${job.percent}%)` : ""}`,
					);
				}
			},
		},
	);

	invalidateCache(buildCacheKey(["match-os", "ordens-abertas"]));
	invalidateCache(buildCacheKey(["painel-publico", "match-os"]));
	invalidateCache(buildCacheKey(["painel-publico", "match-os", "v2"]));
	invalidateCache(buildCacheKey(["painel-publico", "match-os", "v3"]));
	invalidateCache(buildCacheKey(["painel-publico", "agentes-match"]));
	invalidateCache(buildCacheKey(["painel-publico", "agentes-match", "v2"]));
	invalidateCache(buildCacheKey(["painel-publico", "agentes-match", "v3"]));
	invalidateDashboardDataCache(persistResult?.generatedAt || null);
	invalidateInternalStaticDataCache(persistResult?.generatedAt || null);

	onProgress?.("Concluído!");

	return {
		total: persistResult?.total ?? 0,
		totalGeral: persistResult?.totalGeral ?? persistResult?.total ?? 0,
		atualizadas: persistResult?.atualizadas ?? 0,
		removidas: persistResult?.removidas ?? 0,
		fontes: persistResult?.fontes || fontesUnicas,
		fonteLabel: persistResult?.fonteLabel || fonteLabel,
		ignoradasSemRegional: persistResult?.ignoradasSemRegional ?? 0,
		ignoradasPorTipo: persistResult?.ignoradasPorTipo ?? 0,
		ignoradasTipos: persistResult?.ignoradasTipos ?? {},
		tiposIgnoradosAplicados: persistResult?.tiposIgnoradosAplicados ?? [],
		tiposIgnoradosAdicionais: persistResult?.tiposIgnoradosAdicionais ?? [],
		mensagens: persistResult?.mensagens ?? null,
	};
}
