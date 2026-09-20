// Extraído de DssThemesPage.jsx (react-refresh/only-export-components não
// permite misturar componente com exports não-componente no mesmo
// arquivo). Comportamento idêntico ao que estava lá — só mudou de arquivo.
export const MODALITY_OPTIONS = [
	{ id: "semanal", name: "Semanal (um conteúdo por semana)" },
	{ id: "mensal", name: "Mensal (um tema com 4 desdobramentos semanais)" },
];

export const CONTENT_TYPE_OPTIONS = [
	{ id: "editor", name: "Escrever no sistema" },
	{ id: "pdf", name: "Anexar PDF pronto" },
];

export const THEME_STATUS_BADGE = {
	rascunho: "bg-slate-100 text-slate-600",
	publicado: "bg-emerald-50 text-emerald-700",
	arquivado: "bg-slate-100 text-slate-400",
};

export const THEME_STATUS_LABEL = { rascunho: "Rascunho", publicado: "Publicado", arquivado: "Arquivado" };
