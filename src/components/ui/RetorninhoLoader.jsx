import "./retorninhoLoader.css";

export default function RetorninhoLoader({
	title = "Carregando...",
	description = "",
	fullScreen = false,
	card = false,
	compact = false,
	size = "md",
}) {
	const wrapperClass = [
		"retorninho-loader",
		fullScreen ? "retorninho-loader--fullscreen" : "",
		card ? "retorninho-loader--card" : "",
		compact ? "retorninho-loader--compact" : "",
	]
		.filter(Boolean)
		.join(" ");

	const imageClass = [
		"retorninho-loader__image",
		size === "sm" ? "retorninho-loader__image--sm" : "",
		size === "lg" ? "retorninho-loader__image--lg" : "",
	]
		.filter(Boolean)
		.join(" ");

	return (
		<div className={wrapperClass} role="status" aria-live="polite">
			<div className="retorninho-loader__stage" aria-hidden="true">
				<div className="retorninho-loader__halo" />
				<img src="/retorninho-loader.png" alt="" className={imageClass} />
			</div>

			{title ? <div className="retorninho-loader__title">{title}</div> : null}
			{description ? (
				<div className="retorninho-loader__description">{description}</div>
			) : null}
		</div>
	);
}
