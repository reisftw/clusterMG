import { useEffect } from "react";
import { gerarPDFCidade, gerarRelatorio3Meses } from "../utils/pdfAgentes";

function formatSigned(value) {
	const number = Math.round(Number(value) || 0);
	if (number > 0) return `+${number}`;
	if (number < 0) return `-${Math.abs(number)}`;
	return "0";
}

export default function CityModal({ cidade, month, allData, onClose }) {
	useEffect(() => {
		function onKey(e) {
			if (e.key === "Escape") onClose();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	if (!cidade) return null;

	const pct = Number(cidade.pct ?? 0);
	const statusInfo = cidade.statusInfo || {};
	const over = pct > 100;
	const done = pct >= 100;
	const gap = Number(cidade.gap ?? cidade.realizado - cidade.meta80) || 0;
	const daily = cidade.daily || [];
	const totalDaily = daily.reduce((s, v) => s + (Number(v) || 0), 0);
	const daysWithProduction = daily
		.map((value, index) => ({ day: index + 1, value: Number(value) || 0 }))
		.filter((item) => item.value > 0);
	const bestDay = [...daysWithProduction].sort((a, b) => b.value - a.value)[0];
	const lastDay = daysWithProduction[daysWithProduction.length - 1];
	const lastSeven = daily
		.slice(-7)
		.reduce((sum, value) => sum + (Number(value) || 0), 0);
	const average = daily.length ? totalDaily / daily.length : 0;

	function statusCls() {
		if (statusInfo.tone) return statusInfo.tone;
		if (over) return "over";
		if (done) return "atingido";
		if (pct >= 75) return "andamento";
		return "abaixo";
	}

	function statusLabel() {
		if (statusInfo.label) return `${statusInfo.icon || ""} ${statusInfo.label}`;
		if (over) return "⚡ Acima da Meta";
		if (done) return "✅ Meta Atingida";
		if (pct >= 75) return "⏳ Em Andamento";
		return "🚨 Abaixo da Meta";
	}

	function barColor() {
		if (over) return "linear-gradient(90deg,#7c3aed,#a855f7)";
		if (done) return "linear-gradient(90deg,var(--green),#36B37E)";
		if (pct >= 75) return "linear-gradient(90deg,var(--orange),var(--yellow))";
		return "linear-gradient(90deg,var(--red),#FF6B6B)";
	}

	return (
		<div
			className="city-modal-overlay show"
			onClick={(e) => {
				if (e.target.classList.contains("city-modal-overlay")) onClose();
			}}
			onKeyDown={(event) => event.key === "Escape" && onClose()}
			role="button"
			tabIndex={-1}
		>
			<div className="city-modal">
				<div className="city-modal-header">
					<div>
						<h2>{cidade.nome}</h2>
						<p>{month} de 2026</p>
						<div className={`status-big ${statusCls()}`}>{statusLabel()}</div>
					</div>
					<button
						type="button"
						className="city-modal-close"
						onClick={onClose}
						aria-label="Fechar detalhes da cidade"
					>
						✕
					</button>
				</div>

				<div className="city-modal-body">
					<div className="city-modal-kpis">
						<div className="city-kpi">
							<div className="city-kpi-label">Cancelamentos</div>
							<div className="city-kpi-value blue">{cidade.cancelamentos}</div>
						</div>
						<div className="city-kpi">
							<div className="city-kpi-label">Meta</div>
							<div className="city-kpi-value orange">
								{Math.round(cidade.meta80)}
							</div>
						</div>
						<div className="city-kpi">
							<div className="city-kpi-label">Realizado</div>
							<div className="city-kpi-value green">{cidade.realizado}</div>
						</div>
						<div className="city-kpi">
							<div className="city-kpi-label">Gap</div>
							<div className={`city-kpi-value ${gap < 0 ? "red" : "green"}`}>
								{formatSigned(gap)}
							</div>
						</div>
					</div>

					<div className="city-modal-section">
						<h3>📊 Progresso da Meta</h3>
						<div
							className="city-modal-progress-bar"
							style={{
								background: "var(--bg)",
								borderRadius: 12,
								overflow: "hidden",
								height: 22,
								marginBottom: 8,
							}}
						>
							<div
								style={{
									height: "100%",
									borderRadius: 12,
									width: `${Math.min(pct, 100)}%`,
									background: barColor(),
									transition: "width .8s",
								}}
							/>
						</div>
						<div className="city-modal-progress-meta">
							<span>
								{cidade.realizado} de {Math.round(cidade.meta80)} retiradas
							</span>
							<strong>{pct.toFixed(1)}%</strong>
							<span>Meta final: {Math.round(cidade.meta80)}</span>
						</div>
					</div>

					<div className="city-modal-section">
						<h3>⚙️ Situação atual</h3>
						<div className="city-situation-grid">
							<div>
								<span>Média diária</span>
								<strong>{average.toFixed(1)}</strong>
							</div>
							<div>
								<span>Melhor dia</span>
								<strong>
									{bestDay ? `Dia ${bestDay.day} · ${bestDay.value}` : "—"}
								</strong>
							</div>
							<div>
								<span>Última retirada</span>
								<strong>{lastDay ? `Dia ${lastDay.day}` : "Nenhuma"}</strong>
							</div>
							<div>
								<span>Últimos 7 dias</span>
								<strong>{lastSeven}</strong>
							</div>
						</div>
						<p className="city-situation-text">
							{cidade.realizado <= 0
								? `Nenhuma retirada realizada. Faltam ${Math.max(
										0,
										Math.round(cidade.meta80 || 0),
									)} para atingir a meta.`
								: gap < 0
									? `Faltam ${Math.abs(gap)} retiradas para atingir a meta.`
									: `Cidade acima da meta em ${gap} retirada(s).`}
						</p>
					</div>

					<div className="city-modal-section">
						<h3>📅 Retiradas por Dia</h3>
						<div className="daily-grid">
							{daily.map((v, i) => (
								<div key={i} className={`day-cell ${v > 0 ? "has-data" : ""}`}>
									<div className="day-num">Dia {i + 1}</div>
									<div className="day-val">{v > 0 ? v : "-"}</div>
								</div>
							))}
						</div>
						<div className="city-modal-total-daily">
							Total acumulado: <strong>{totalDaily}</strong> retiradas
						</div>
					</div>

					<div className="city-modal-actions">
						<button
							type="button"
							className="btn-fechar-modal"
							onClick={onClose}
						>
							Fechar
						</button>
						<button
							type="button"
							className="btn-gerar-pdf"
							style={{ background: "var(--blue)" }}
							onClick={() => gerarRelatorio3Meses(cidade.nome, month, allData)}
						>
							📊 Relatório 3 Meses
						</button>
						<button
							type="button"
							className="btn-gerar-pdf"
							onClick={() => gerarPDFCidade(cidade.nome, month, allData)}
						>
							📄 Relatório do Mês
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
