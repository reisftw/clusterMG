// Central de Dados (pedido do usuário, 2026-09-10 — UX_AUDIT.md, item
// "hub único de importação"): antes, os 3 pontos de entrada de arquivo do
// Finan (Dados Orçamentários, Central de Importações, Caixa de Entrada/
// OCR) viviam em 3 lugares diferentes do menu, sem nenhuma relação visual
// entre eles, obrigando quem faz envio de planilha/documento a saber de
// cor onde cada tipo mora. Esta página junta os 3 num único lugar dentro
// de Segurança e Auditoria, com um botão por tipo de arquivo — EXATAMENTE
// no mesmo padrão de abas que `FinanUsersPage.jsx` já usa pra "Usuários" /
// "Cargos e Permissões" (mesma URL compartilhada por duas rotas, tab ativa
// vem de `initialTab`).
//
// Importante: cada aba renderiza o MESMO componente que já existe hoje nas
// rotas originais (`FinanFinanceiroPage page="orcamentoDados"`,
// `FinanImportadorPage`, `FinanCaixaEntradaPage") — nada foi reescrito, é
// só um host que reaproveita o layout de cada envio de arquivo tal como
// está, mantendo as rotas antigas funcionando do jeito que sempre
// funcionaram (esta página é aditiva, não substitui nada).
import { Database, FileSpreadsheet, Inbox, Upload } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { useFinanAuth } from "../state/FinanAuthContext";

const FinanFinanceiroPage = lazy(() => import("./FinanFinanceiroPage"));
const FinanImportadorPage = lazy(() => import("./FinanImportadorPage"));
const FinanCaixaEntradaPage = lazy(() => import("./FinanCaixaEntradaPage"));

// Mesma checagem de permissão que App.jsx já faz por rota — replicada aqui
// (não exportada de lá) pra cada aba continuar exigindo exatamente o que
// a rota original dela sempre exigiu, mesmo host sendo compartilhado.
function hasPermission(user, permission) {
	if (!permission) return true;
	if (user?.isAdmin) return true;
	const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
	return permissions.includes("*") || permissions.includes(permission);
}

const TABS = [
	{
		id: "orcamentarios",
		label: "Gestão Orçamentária",
		description: "Planilha de orçamento (padrão Sênior).",
		icon: FileSpreadsheet,
		permission: "finan.gestao_orcamentaria.manage",
	},
	{
		id: "importacoes",
		label: "Central de Importações",
		description: "Qualquer planilha, com mapeamento de colunas reutilizável.",
		icon: Upload,
		permission: "finan.configuracoes.view",
	},
	{
		id: "caixa-entrada",
		label: "Caixa de Entrada",
		description: "Documentos e notas recebidos por e-mail/upload, com OCR.",
		icon: Inbox,
		permission: "finan.notas.view",
	},
];

function RestrictedTabNotice() {
	return (
		<div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
			<p className="text-sm font-bold text-amber-800">
				Você não tem permissão para acessar este tipo de envio de arquivo.
			</p>
		</div>
	);
}

function TabFallback() {
	return <p className="px-2 py-10 text-center text-sm font-semibold text-slate-500">Carregando...</p>;
}

export default function FinanCentralDadosPage({ initialTab = "orcamentarios" }) {
	const { user: currentUser } = useFinanAuth();
	const [activeTab, setActiveTab] = useState(initialTab);

	useEffect(() => {
		setActiveTab(initialTab);
	}, [initialTab]);

	const activeTabDef = TABS.find((tab) => tab.id === activeTab) || TABS[0];
	const canSeeActiveTab = hasPermission(currentUser, activeTabDef.permission);

	return (
		<div className="space-y-6">
			<header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="flex items-start gap-4">
					<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
						<Database size={24} />
					</span>
					<div>
						<p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-600">Segurança e Auditoria</p>
						<h1 className="mt-1 text-2xl font-black text-slate-950">Central de Dados</h1>
						<p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
							Todo envio de arquivo do Finan num só lugar, organizado por tipo. Cada aba abre exatamente a mesma
							tela que já existia — só o ponto de entrada mudou.
						</p>
					</div>
				</div>
			</header>

			<div className="flex flex-wrap gap-2">
				{TABS.map((tab) => {
					const Icon = tab.icon;
					const active = activeTab === tab.id;
					return (
						<button
							key={tab.id}
							type="button"
							onClick={() => setActiveTab(tab.id)}
							title={tab.description}
							className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-black transition ${
								active
									? "bg-blue-600 text-white shadow-sm"
									: "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
							}`}
						>
							<Icon size={16} />
							{tab.label}
						</button>
					);
				})}
			</div>

			{canSeeActiveTab ? (
				<Suspense fallback={<TabFallback />}>
					{activeTab === "orcamentarios" ? <FinanFinanceiroPage page="orcamentoDados" /> : null}
					{activeTab === "importacoes" ? <FinanImportadorPage /> : null}
					{activeTab === "caixa-entrada" ? <FinanCaixaEntradaPage /> : null}
				</Suspense>
			) : (
				<RestrictedTabNotice />
			)}
		</div>
	);
}
