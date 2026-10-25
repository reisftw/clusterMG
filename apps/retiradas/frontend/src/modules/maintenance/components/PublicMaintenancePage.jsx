import { CheckCircle2, Clock3, RefreshCw, ShieldAlert, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { getPublicMaintenanceStatus } from "../services/maintenanceService";
import "./maintenance.css";

function remainingLabel(value) {
	if (!value) return "Retorno assim que os ajustes forem concluidos";
	const remaining = Math.max(0, new Date(value).getTime() - Date.now());
	const minutes = Math.ceil(remaining / 60_000);
	if (!minutes) return "Retorno em instantes";
	if (minutes < 60) return `Previsao: ${minutes} min`;
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return `Previsao: ${hours}h${rest ? ` ${rest}min` : ""}`;
}

export default function PublicMaintenancePage({ status, onStatusChange }) {
	const [checking, setChecking] = useState(false);
	const [, setTick] = useState(0);
	const estimate = remainingLabel(status?.scheduledEndAt);

	useEffect(() => {
		const timer = window.setInterval(() => setTick((value) => value + 1), 30_000);
		return () => window.clearInterval(timer);
	}, []);

	const checkAgain = async () => {
		setChecking(true);
		try {
			onStatusChange?.(await getPublicMaintenanceStatus());
		} finally {
			setChecking(false);
		}
	};

	return (
		<main className="maintenance-public-shell">
			<section className="maintenance-public-hero">
				<div className="maintenance-public-copy">
					<div className="maintenance-running-badge">
						<ShieldAlert size={19} />
						Manutencao em andamento
					</div>
					<h1>
						Ops... estamos fazendo
						<span> alguns ajustes.</span>
					</h1>
					<p>
						{status?.message ||
							"O site esta temporariamente indisponivel enquanto nossa equipe trabalha para normalizar tudo."}
					</p>
					<div className="maintenance-estimate">
						<span><Clock3 size={25} /></span>
						<div>
							<strong>Ja estamos trabalhando</strong>
							<small>{estimate}. Esta pagina atualiza automaticamente.</small>
						</div>
					</div>
					<button type="button" onClick={checkAgain} disabled={checking}>
						<RefreshCw size={21} className={checking ? "animate-spin" : ""} />
						Verificar novamente
					</button>
				</div>
				<div className="maintenance-public-art">
					<img
						src="/retorninho-maintenance-20261024.webp"
						alt="Retorninho trabalhando na manutencao do sistema"
					/>
				</div>
			</section>

			<section className="maintenance-public-details" aria-label="Informacoes da manutencao">
				<div><Wrench size={26} /><span><strong>O que aconteceu?</strong><small>Identificamos uma necessidade de manutencao no sistema.</small></span></div>
				<div><RefreshCw size={26} /><span><strong>O que estamos fazendo?</strong><small>As APIs e os servicos estao sendo validados pela equipe.</small></span></div>
				<div><CheckCircle2 size={26} /><span><strong>Voltaremos em breve</strong><small>Assim que normalizado, o acesso sera liberado automaticamente.</small></span></div>
			</section>
		</main>
	);
}
