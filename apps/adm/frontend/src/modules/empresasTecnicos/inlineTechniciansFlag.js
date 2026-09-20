// Feature flag VITE_ADM_ENABLE_INLINE_COMPANY_TECHNICIANS — controla a
// exibicao da secao de gestao inline de tecnicos dentro do formulario de
// empresa (EmpresasTecnicosPage.jsx). Desativada por padrao: ausencia da
// variavel, "false" ou qualquer valor diferente de "true" equivalem a
// desativado. Ver docs/technical-notes/etapa6-flag-adm-e-rompimentos.md
// para o registro da decisao.
export function parseInlineCompanyTechniciansFlag(rawValue) {
	return String(rawValue || "").trim().toLowerCase() === "true";
}

export function isInlineCompanyTechniciansEnabled() {
	return parseInlineCompanyTechniciansFlag(
		import.meta.env.VITE_ADM_ENABLE_INLINE_COMPANY_TECHNICIANS,
	);
}
