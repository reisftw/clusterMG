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

function pick(row, keys) {
	for (const key of keys) {
		const value = row?.[key];
		if (value !== undefined && value !== null && String(value).trim()) {
			return value;
		}
	}
	return null;
}

// Reduz cada linha so aos 4 campos que a conciliacao usa (mesmos aliases
// reconhecidos no backend, movimentacoesOrdensFechadas.js:
// extrairLinhasPlanilha) — uma planilha real de producao vem com muito mais
// colunas do que isso, e mandar a linha inteira infla desnecessariamente o
// payload (planilhas de milhares de linhas ja bateram em limite de tamanho
// de requisicao por causa disso).
export function reduzirLinhasPlanilha(rows = []) {
	return rows.map((row) => ({
		nome: pick(row, ["nome", "nome_razaosocial", "nome_cliente", "cliente", "Nome", "Cliente"]),
		codigo_cliente: pick(row, [
			"codigo_cliente",
			"codigo",
			"cod_cliente",
			"Codigo",
			"CodigoCliente",
		]),
		cidade: pick(row, ["cidade", "pop", "Cidade", "municipio", "Municipio"]),
		data_termino_executado: pick(row, [
			"data_termino_executado",
			"data_fechamento",
			"fechamento",
			"DataFechamento",
		]),
	}));
}
