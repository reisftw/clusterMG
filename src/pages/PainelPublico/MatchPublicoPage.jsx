import {
	ClipboardList,
	FileBarChart,
	Map,
	Route,
	ShieldCheck,
} from "lucide-react";
import { useMemo } from "react";
import MelzFooter from "../../components/layout/MelzFooter";
import PwaInstallButton from "../../components/layout/PwaInstallButton";
import { ROUTES } from "../../router/routes";
import { resolveVpsDate } from "../../services/vpsDate";
import PublicPageLoading from "./components/PublicPageLoading";
import { useMatchPublico } from "./hooks/useMatchPublico";
import TabMatchOS from "./tabs/TabMatchOS";
import "./PainelPublico.css";
import "./PublicMobileFix.css";

function formatData(meta) {
	const date = resolveVpsDate(meta);

	if (!date || Number.isNaN(date.getTime())) return "Nunca atualizado";

	return date.toLocaleDateString("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function formatarPeriodo(data) {
	if (!data) return "";
	const date = new Date(`${data}T12:00:00`);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleDateString("pt-BR");
}

export default function MatchPublicoPage() {
	const { data, ultimaAtualizacao, loading } = useMatchPublico({
		detail: true,
	});
	const dadosValidos = useMemo(() => data || null, [data]);
	const from =
		typeof window !== "undefined"
			? new URLSearchParams(window.location.search).get("from")
			: "";
	const fromExternalApp = from === "terceiros" || from === "terceirizados";
	const suffix = fromExternalApp ? `?from=${from}` : "";
	const homeRoute =
		from === "terceirizados"
			? ROUTES.TERCEIRIZADOS
			: from === "terceiros"
				? ROUTES.TERCEIROS
				: ROUTES.PAINEL_PUBLICO;

	return (
		<div className="painel-publico-page">
			<div className="match-public-header header">
				<div className="header-left">
					<img
						src="/cluster-mg.png"
						alt="Logo Retirada"
						className="header-logo"
						decoding="async"
					/>
					<div>
						<h1>MATCH</h1>
					</div>
				</div>

				<div className="header-right">
					<div className="painel-tabs">
						<button
							type="button"
							className="painel-tab"
							onClick={() => window.location.assign(homeRoute)}
						>
							<ClipboardList size={14} aria-hidden="true" />
							{fromExternalApp ? "Voltar ao app" : "Visao geral"}
						</button>
						<PwaInstallButton
							labelMode="full"
							className="public-install-btn public-header-btn"
						/>
						<button
							type="button"
							className="painel-tab"
							onClick={() =>
								window.location.assign(`${ROUTES.PAINEL_MAPA}${suffix}`)
							}
						>
							<Map size={14} aria-hidden="true" />
							Mapa de O.S.
						</button>
						<button type="button" className="painel-tab active">
							<Route size={14} aria-hidden="true" />
							Match - OS
						</button>
						<button
							type="button"
							className="painel-tab"
							onClick={() =>
								window.location.assign(`${ROUTES.PAINEL_RELATORIOS}${suffix}`)
							}
						>
							<FileBarChart size={14} aria-hidden="true" />
							Relatórios
						</button>
						<button
							type="button"
							className="painel-tab"
							onClick={() =>
								window.location.assign(
									`${ROUTES.AGENTES_MATCH_PUBLICO}${suffix}`,
								)
							}
						>
							<ShieldCheck size={14} aria-hidden="true" />
							Agentes Autorizados
						</button>
					</div>
					<select className="month-selector" defaultValue="Julho">
						<option value="Julho">Julho 2026</option>
					</select>
					<span className="header-avatar" aria-label="Usuario AD">
						AD
					</span>
				</div>
			</div>

			<div className="match-update-strip">
				<span>
					Última atualização: <strong>{formatData(ultimaAtualizacao)}</strong>
				</span>
				{ultimaAtualizacao?.periodoInicio && ultimaAtualizacao?.periodoFim ? (
					<span>
						Período:{" "}
						<strong>{formatarPeriodo(ultimaAtualizacao.periodoInicio)}</strong>{" "}
						ate <strong>{formatarPeriodo(ultimaAtualizacao.periodoFim)}</strong>
					</span>
				) : null}
			</div>

			{loading ? (
				<PublicPageLoading
					title="Carregando match"
					description="Estamos analisando os servicos e as retiradas proximas para montar os matches."
				/>
			) : (
				<TabMatchOS dataOverride={dadosValidos} />
			)}
			<MelzFooter className="mt-8" />
		</div>
	);
}
