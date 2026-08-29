import { useMemo } from "react";
import PublicNotificationsButton from "../../components/layout/PublicNotificationsButton";
import PwaInstallButton from "../../components/layout/PwaInstallButton";
import { resolveVpsDate } from "../../services/vpsDate";
import PublicPageLoading from "./components/PublicPageLoading";
import { useAgentesMatchPublico } from "./hooks/useAgentesMatchPublico";
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

export default function AgentesMatchPage() {
	const { data, ultimaAtualizacao, loading } = useAgentesMatchPublico({
		detail: true,
	});
	const dadosValidos = useMemo(() => data || null, [data]);

	return (
		<div className="agentes-match-page">
			<div className="agentes-match-shell">
				<div className="agentes-match-hero">
					<div className="agentes-match-hero-inner">
						<div className="agentes-match-top">
							<div className="agentes-match-pill">Portal de Oportunidades</div>
							<div className="agentes-match-actions">
								<PublicNotificationsButton labelMode="full" />
								<PwaInstallButton labelMode="full" />
							</div>
						</div>
						<h1 className="agentes-match-title">
							Oportunidades para Agentes Autorizados
						</h1>
						<p className="agentes-match-subtitle">
							Aqui você acompanha oportunidades identificadas para atendimento
							nas cidades dos agentes autorizados, com destaque para serviços
							proximos de retiradas e cancelamentos.
						</p>
						<div className="agentes-match-meta">
							<span>
								Última atualização:{" "}
								<strong>{formatData(ultimaAtualizacao)}</strong>
							</span>
							{ultimaAtualizacao?.periodoInicio &&
							ultimaAtualizacao?.periodoFim ? (
								<span>
									Período:{" "}
									<strong>
										{formatarPeriodo(ultimaAtualizacao.periodoInicio)}
									</strong>{" "}
									ate{" "}
									<strong>
										{formatarPeriodo(ultimaAtualizacao.periodoFim)}
									</strong>
								</span>
							) : null}
						</div>
					</div>
				</div>

				<div className="agentes-match-content mt-6">
					{loading ? (
						<PublicPageLoading
							title="Carregando oportunidades"
							description="Estamos reunindo os matches disponiveis para os agentes autorizados."
						/>
					) : (
						<TabMatchOS
							dataOverride={dadosValidos}
							mode="agentes-only"
							note="Consulte abaixo os matches disponiveis para cidades de agentes autorizados e identifique oportunidades de atendimento com maior proximidade."
						/>
					)}
				</div>
			</div>
		</div>
	);
}
