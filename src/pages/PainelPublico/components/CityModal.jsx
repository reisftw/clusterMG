import { useEffect } from "react";
import { gerarPDFCidade, gerarRelatorio3Meses } from "../utils/pdfAgentes";

export default function CityModal({ cidade, month, allData, onClose }) {
	useEffect(() => {
		function onKey(e) {
			if (e.key === "Escape") onClose();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	if (!cidade) return null;

	const pct = cidade.pct ?? 0;
	const over = pct > 100;
	const done = pct >= 80;

	function statusCls() {
		if (over) return "over";
		if (done) return "atingido";
		if (pct >= 50) return "andamento";
		return "abaixo";
	}

	function statusLabel() {
		if (over) return "⚡ Acima da Meta";
		if (done) return "✅ Meta Atingida";
		if (pct >= 50) return "⏳ Em Andamento";
		return "🚨 Abaixo da Meta";
	}

	const barColor = over
		? "linear-gradient(90deg,#7c3aed,#a855f7)"
		: done
			? "linear-gradient(90deg,var(--green),#36B37E)"
			: pct >= 50
				? "linear-gradient(90deg,var(--orange),var(--yellow))"
				: "linear-gradient(90deg,var(--red),#FF6B6B)";

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
				{/* Header */}
				<div className="city-modal-header">
					<div>
						<h2>{cidade.nome}</h2>
						<p>{month} 2026</p>
						<div className={`status-big ${statusCls()}`}>{statusLabel()}</div>
					</div>
					<button className="city-modal-close" onClick={onClose}>
						✕
					</button>
				</div>

				{/* Body */}
				<div className="city-modal-body">
					{/* KPIs */}
					<div className="city-modal-kpis">
						<div className="city-kpi">
							<div className="city-kpi-label">Cancelamentos</div>
							<div className="city-kpi-value blue">{cidade.cancelamentos}</div>
						</div>
						<div className="city-kpi">
							<div className="city-kpi-label">Meta 80%</div>
							<div className="city-kpi-value orange">
								{Math.round(cidade.meta80)}
							</div>
						</div>
						<div className="city-kpi">
							<div className="city-kpi-label">Realizado</div>
							<div className="city-kpi-value green">{cidade.realizado}</div>
						</div>
						<div className="city-kpi">
							<div className="city-kpi-label">Falta / Sobra</div>
							<div
								className={`city-kpi-value ${cidade.falta > 0 ? "red" : "green"}`}
							>
								{cidade.falta > 0
									? `-${cidade.falta}`
									: `+${Math.abs(cidade.falta)}`}
							</div>
						</div>
					</div>

					{/* Progresso */}
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
									background: barColor,
									transition: "width .8s",
								}}
							/>
						</div>
						<div
							className="city-modal-progress-meta"
							style={{
								display: "flex",
								justifyContent: "space-between",
								fontSize: 13,
								color: "var(--muted)",
							}}
						>
							<span>0</span>
							<span
								style={{ fontWeight: 700, color: "var(--text)", fontSize: 15 }}
							>
								{pct}%
							</span>
							<span>Meta: {Math.round(cidade.meta80)}</span>
						</div>
					</div>

					{/* Grid de dias */}
					<div className="city-modal-section">
						<h3>📅 Retiradas por Dia</h3>
						<div className="daily-grid">
							{(cidade.daily || []).map((v, i) => (
								<div key={i} className={`day-cell ${v > 0 ? "has-data" : ""}`}>
									<div className="day-num">Dia {i + 1}</div>
									<div className="day-val">{v > 0 ? v : "-"}</div>
								</div>
							))}
						</div>
						<div style={{ marginTop: 12, fontSize: 12, color: "var(--muted)" }}>
							Total acumulado:{" "}
							<strong style={{ color: "var(--blue)" }}>
								{(cidade.daily || []).reduce((s, v) => s + v, 0)}
							</strong>{" "}
							retiradas
						</div>
					</div>

					{/* Acoes */}
					<div className="city-modal-actions">
						<button className="btn-fechar-modal" onClick={onClose}>
							Fechar
						</button>
						<button
							className="btn-gerar-pdf"
							style={{ background: "var(--blue)" }}
							onClick={() => gerarRelatorio3Meses(cidade.nome, month, allData)}
						>
							📊 Relatório 3 Meses
						</button>
						<button
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
