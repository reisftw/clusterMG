// StatCard — UX_AUDIT.md, Fase 3 (Padronização): o card "label pequeno em
// cima, número grande embaixo" se repetia em quase toda tela (Contas a
// Pagar/Receber, Fornecedores, Centros de Custo...), cada uma reescrevendo
// o mesmo <div>/<button> com classes ligeiramente diferentes. Suporta um
// modo clicável (`onClick`) pro padrão de "card de resumo como filtro
// rápido" (Fase 2, Quick Win) — vira <button> com estado ativo quando
// clicável, <div> simples quando só exibe.
export default function StatCard({ label, value, active = false, onClick, icon: Icon, tone = "default" }) {
	const toneClass = tone === "warning" ? "border-amber-200 bg-amber-50" : tone === "danger" ? "border-red-200 bg-red-50" : "";
	const baseClass = active
		? "border-blue-600 bg-blue-50 ring-2 ring-blue-100"
		: toneClass || "border-slate-200 bg-white";

	// UX_AUDIT.md, seção 22 (UI — hierarquia): label e valor usavam o
	// mesmo peso (font-black nos dois), então nada se destacava de
	// verdade — o olho não sabe onde pousar primeiro num card com dois
	// elementos igualmente "gritando". Label mais leve (font-bold) +
	// tracking um pouco mais aberto pra continuar legível em caixa alta
	// pequena; valor sobe pra text-xl, ganhando o peso visual que o
	// número (o dado que importa) deveria ter tido desde o início.
	const content = (
		<>
			<div className="flex items-center gap-2">
				{Icon ? <Icon size={16} className="shrink-0 text-slate-400" /> : null}
				<p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
			</div>
			<p className="mt-2 text-xl font-black text-slate-950">{value}</p>
		</>
	);

	if (onClick) {
		return (
			<button
				type="button"
				onClick={onClick}
				className={`rounded-2xl border p-4 text-left shadow-sm transition hover:border-blue-200 ${baseClass}`}
			>
				{content}
			</button>
		);
	}

	return <div className={`rounded-2xl border p-4 shadow-sm ${baseClass}`}>{content}</div>;
}
