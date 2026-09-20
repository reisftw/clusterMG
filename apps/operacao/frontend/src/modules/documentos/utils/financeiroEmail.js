export function buildDocumentosFinanceiroEmail({ empresa } = {}) {
	return [
		`Empresa: ${empresa?.nome || "-"}`,
		`CNPJ: ${empresa?.cnpj || "-"}`,
		`Responsável: ${empresa?.responsavel?.nome || "-"}`,
		`E-mail: ${empresa?.responsavel?.email || "-"}`,
	].join("\n");
}
