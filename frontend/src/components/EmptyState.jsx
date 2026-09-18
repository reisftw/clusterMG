// EmptyState — UX_AUDIT.md, item 15 (Empty States) / Fase 3
// (Padronização): "Nenhum registro encontrado." sozinho não diz por que a
// tela está vazia nem o que fazer a seguir — cada tela do Finan tinha essa
// mesma frase curta espalhada, sem contexto nem ação. Este componente
// padroniza título + explicação + (opcional) botão de ação direta.
export default function EmptyState({ icon: Icon, title, description, action }) {
	return (
		<div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
			{Icon ? (
				<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-400 ring-1 ring-slate-200">
					<Icon size={22} />
				</span>
			) : null}
			<div>
				<p className="text-sm font-black text-slate-700">{title}</p>
				{description ? <p className="mt-1 max-w-sm text-sm font-semibold text-slate-500">{description}</p> : null}
			</div>
			{action ? <div className="mt-1">{action}</div> : null}
		</div>
	);
}
