import { ArrowLeft } from "lucide-react";
import PublicNotificationsButton from "../../../components/layout/PublicNotificationsButton";
import PwaInstallButton from "../../../components/layout/PwaInstallButton";
import { ROUTES } from "../../../router/routes";

export default function PainelMapaNav({ current = "mapa" }) {
	const from =
		typeof window !== "undefined"
			? new URLSearchParams(window.location.search).get("from")
			: "";
	const fromExternalApp = from === "terceiros" || from === "terceirizados";
	const suffix = fromExternalApp ? `?from=${from}` : "";
	// Extraido pra achado javascript:S3358 (ternario aninhado).
	let homeHref = ROUTES.PAINEL_PUBLICO;
	if (from === "terceirizados") homeHref = ROUTES.TERCEIRIZADOS;
	else if (from === "terceiros") homeHref = ROUTES.TERCEIROS;

	function linkClass(active) {
		return `inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-center text-sm font-semibold transition-all sm:flex-none sm:px-4 ${
			active
				? "bg-blue-600 border-blue-600 text-white shadow-sm"
				: "bg-white border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
		}`;
	}

	return (
		<div className="mb-6 flex w-full min-w-0 flex-wrap items-center gap-2 sm:gap-3">
			<a href={homeHref} className={linkClass(false)}>
				<ArrowLeft size={16} />
				{fromExternalApp ? "Voltar ao app" : "Voltar ao painel"}
			</a>

			<a
				href={`${ROUTES.PAINEL_MAPA}${suffix}`}
				className={linkClass(current === "mapa")}
			>
				Mapa de O.S
			</a>

			<a
				href={`${ROUTES.PAINEL_MATCH}${suffix}`}
				className={linkClass(current === "match")}
			>
				Match - OS
			</a>

			<a
				href={`${ROUTES.PAINEL_RELATORIOS}${suffix}`}
				className={linkClass(current === "relatorios")}
			>
				Relatórios
			</a>

			<PublicNotificationsButton labelMode="compact" />
			<PwaInstallButton labelMode="compact" />
		</div>
	);
}
