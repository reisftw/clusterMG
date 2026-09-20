// Extraído de SstProtocolsPage.jsx (react-refresh/only-export-components
// não permite misturar componente com exports não-componente no mesmo
// arquivo). Comportamento idêntico ao que estava lá — só mudou de arquivo.
export const MIN_REQUEST_PHOTOS = 1;
export const MAX_REQUEST_PHOTOS = 5;

export const TYPE_OPTIONS = [
	{ id: "quase_acidente", name: "Quase acidente" },
	{ id: "acidente", name: "Acidente" },
	{ id: "incidente", name: "Incidente" },
	{ id: "desvio", name: "Desvio de segurança" },
	{ id: "inspecao_nao_conforme", name: "Inspeção não conforme" },
	{ id: "solicitacao", name: "Solicitação ao SST" },
	{ id: "risco_identificado", name: "Risco identificado" },
	{ id: "atividade_interrompida", name: "Atividade interrompida" },
	{ id: "epi_epc", name: "Problema com EPI/EPC" },
	{ id: "outro", name: "Outro" },
];

export const STATUS_OPTIONS = [
	{ id: "ABERTO", name: "Aberto" },
	{ id: "EM_TRIAGEM", name: "Em triagem" },
	{ id: "EM_ANALISE", name: "Em análise" },
	{ id: "EM_TRATATIVA", name: "Em tratativa" },
	{ id: "AGUARDANDO_INFORMACAO", name: "Aguardando informação" },
	{ id: "AGUARDANDO_VALIDACAO", name: "Aguardando validação" },
	{ id: "CONCLUIDO", name: "Concluído" },
	{ id: "CANCELADO", name: "Cancelado" },
	{ id: "DUPLICADO", name: "Duplicado" },
];

export const CONSEQUENCE_OPTIONS = [
	{ id: "queda", name: "Queda" },
	{ id: "choque_eletrico", name: "Choque elétrico" },
	{ id: "atropelamento", name: "Atropelamento" },
	{ id: "colisao", name: "Colisão" },
	{ id: "queda_objeto", name: "Queda de objeto" },
	{ id: "dano_material", name: "Dano material" },
	{ id: "exposicao", name: "Exposição" },
	{ id: "lesao_potencial", name: "Lesão potencial" },
	{ id: "outro", name: "Outro" },
];

export const PRIORITY_OPTIONS = [
	{ id: "baixa", name: "Baixa" },
	{ id: "media", name: "Média" },
	{ id: "alta", name: "Alta" },
	{ id: "critica", name: "Crítica" },
];

export const STATUS_BADGE = {
	ABERTO: "bg-blue-50 text-blue-700",
	EM_TRIAGEM: "bg-slate-100 text-slate-600",
	EM_ANALISE: "bg-slate-100 text-slate-600",
	EM_TRATATIVA: "bg-amber-50 text-amber-700",
	AGUARDANDO_INFORMACAO: "bg-amber-50 text-amber-700",
	AGUARDANDO_VALIDACAO: "bg-purple-50 text-purple-700",
	CONCLUIDO: "bg-emerald-50 text-emerald-700",
	CANCELADO: "bg-slate-100 text-slate-500",
	DUPLICADO: "bg-slate-100 text-slate-500",
};

export const PRIORITY_BADGE = {
	baixa: "bg-slate-100 text-slate-600",
	media: "bg-blue-50 text-blue-700",
	alta: "bg-amber-50 text-amber-700",
	critica: "bg-red-50 text-red-700",
};

export function typeLabel(type) {
	return TYPE_OPTIONS.find((item) => item.id === type)?.name || type;
}
export function statusLabel(status) {
	return STATUS_OPTIONS.find((item) => item.id === status)?.name || status;
}
