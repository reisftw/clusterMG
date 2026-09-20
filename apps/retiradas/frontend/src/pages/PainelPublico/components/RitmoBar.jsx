export default function RitmoBar({ ritmo }) {
	if (!ritmo) return null;

	const icons = { ok: "✅", warn: "⚠️", danger: "🚨" };
	const messages = {
		ok: `Ritmo adequado — media de ${ritmo.media} O.S/dia util`,
		warn: `Ritmo abaixo do esperado — media de ${ritmo.media} O.S/dia util`,
		danger: `Ritmo critico — media de ${ritmo.media} O.S/dia util`,
	};
	const encouragement = {
		warn: "O Retorninho acredita na recuperacao. Uma boa sequencia hoje ja comeca a virar esse placar.",
		danger:
			"Ainda da tempo de reagir. Se o time acelerar agora, esse numero pode mudar bastante ate o fechamento.",
	};
	const highlightTitle = {
		warn: "Estamos abaixo da meta ideal, mas a virada esta ao alcance.",
		danger: "O painel precisa de uma reacao forte para voltar ao rumo.",
	};
	const showRetorninho = ritmo.status === "warn" || ritmo.status === "danger";

	return (
		<div className={`ritmo-bar ${ritmo.status}`}>
			<div className="ritmo-main">
				<div className="ritmo-icon">{icons[ritmo.status]}</div>
				<div className="ritmo-content">
					<div className="ritmo-title">Ritmo em Tempo Real</div>
					<div className="ritmo-msg">{messages[ritmo.status]}</div>
					<div className="ritmo-detail">
						Necessario: {ritmo.necessario} O.S/dia util &middot;{" "}
						{ritmo.diasAnalisados} dias analisados &middot; {ritmo.ratio}% do
						ritmo necessario
					</div>
				</div>
				<div className={`ritmo-badge ${ritmo.status}`}>{ritmo.badge}</div>
			</div>

			{showRetorninho ? (
				<div className={`ritmo-retorninho-card ${ritmo.status}`}>
					<div className="ritmo-retorninho-copy">
						<div className="ritmo-retorninho-kicker">
							Retorninho entrou em modo torcida
						</div>
						<div className="ritmo-retorninho-title">
							{highlightTitle[ritmo.status]}
						</div>
						<p className="ritmo-retorninho-text">
							{encouragement[ritmo.status]}
						</p>
					</div>

					<div className="ritmo-retorninho-visual" aria-hidden="true">
						<div className="ritmo-retorninho-glow" />
						<img
							className="ritmo-retorninho-img"
							src="/retorninho-triste.webp"
							alt="Retorninho triste pedindo uma reacao do time"
						/>
					</div>
				</div>
			) : null}
		</div>
	);
}
