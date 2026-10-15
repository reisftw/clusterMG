export function MercadoBrand({ compact = false, tone = "dark", className = "" }) {
  const source = compact
    ? "/mercado/favicon.svg"
    : tone === "light"
      ? "/mercado/logo-mercado-light.svg"
      : "/mercado/logo-mercado.svg";

	return (
		<img
			className={`mercado-brand ${compact ? "mercado-brand--compact" : ""} ${className}`}
      src={source}
			alt="Mercado de Retiradas"
		/>
	);
}
