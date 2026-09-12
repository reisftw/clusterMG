import * as XLSX from "xlsx";

// Mesmo mecanismo de leitura usado no upload do Mapa
// (src/pages/Mapa/utils/uploadMapaOS.js): le a planilha no navegador e
// devolve as linhas como JSON — o backend nunca recebe o arquivo bruto,
// so as linhas ja parseadas (nome/cidade).
export async function readRowsFromPlanilha(file) {
	const buffer = await file.arrayBuffer();
	const workbook = XLSX.read(buffer, { type: "array" });
	const worksheet = workbook.Sheets[workbook.SheetNames[0]];
	return XLSX.utils.sheet_to_json(worksheet, { defval: null });
}
