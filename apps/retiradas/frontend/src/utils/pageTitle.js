const DEFAULT_TITLE = "REVO | Sistema de Retiradas";

const EXACT_TITLES = new Map([
	["/", "Visão Geral | REVO"],
	["/app", "Aplicativo | REVO"],
	["/login", "Entrar | REVO"],
	["/esqueci-senha", "Recuperar senha | REVO"],
	["/redefinir-senha", "Redefinir senha | REVO"],
	["/acesso-negado", "Acesso negado | REVO"],
	["/maintenance", "Manutenção | REVO"],
	["/retorninho", "Retorninho IA | REVO"],
	["/app/download", "Baixar aplicativo | REVO"],
	["/diario", "Diário | REVO"],
	["/mapa", "Mapa de Ordens de Serviço | REVO"],
	["/maps", "Maps | REVO"],
	["/maps/adminmap", "Monitoramento de Técnicos | REVO"],
	["/maps/visitas", "Central de Visitas | REVO"],
	["/metas", "Metas | REVO"],
	["/ranking", "Ranking | REVO"],
	["/acompanhamento", "Acompanhamento | REVO"],
	["/agendamentos", "Agendamentos | REVO"],
	["/tentativas", "Gestão de Tentativas | REVO"],
	["/mensageria", "Mensageria | REVO"],
	["/usuarios", "Usuários | REVO"],
	["/configuracoes/cargos", "Cargos e Permissões | REVO"],
	["/notificacoes", "Notificações | REVO"],
	["/relatorios", "Relatórios | REVO"],
	["/painel", "Painel Operacional | REVO"],
	["/painel/agentes", "Painel de Agentes | REVO"],
	["/painel/relatorios", "Relatórios Operacionais | REVO"],
	["/painel/mapa", "Mapa Operacional | REVO"],
	["/painel/match", "Match Operacional | REVO"],
	["/terceiros", "Portal de Terceiros | REVO"],
	["/terceirizados", "Portal de Terceirizados | REVO"],
]);

const PREFIX_TITLES = [
	["/mercado", "Mercado de Retiradas"],
	["/ordens-servico", "Ordens de Serviço | REVO"],
	["/estoque", "Estoque | REVO"],
	["/atendimento", "Atendimento | REVO"],
	["/mensageria", "Mensageria | REVO"],
	["/documentos", "Documentos | REVO"],
	["/administrativo", "Administração | REVO"],
	["/configuracoes", "Configurações | REVO"],
	["/mapas", "Mapas | REVO"],
	["/mapa", "Mapa de Ordens de Serviço | REVO"],
	["/empresas", "Empresas | REVO"],
	["/terceiros", "Portal de Terceiros | REVO"],
	["/terceirizados", "Portal de Terceirizados | REVO"],
];

export function resolvePageTitle(pathname = "/") {
	const normalized = `/${String(pathname || "/")}`
		.replace(/\/{2,}/g, "/")
		.replace(/\/$/, "") || "/";
	const exact = EXACT_TITLES.get(normalized);
	if (exact) return exact;
	return (
		PREFIX_TITLES.find(
			([prefix]) => normalized === prefix || normalized.startsWith(`${prefix}/`),
		)?.[1] || DEFAULT_TITLE
	);
}

export { DEFAULT_TITLE };
