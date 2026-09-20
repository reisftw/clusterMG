// Rodape de paginacao generico — usado nas listagens do DSS (Temas,
// Programação, Execuções, Relatórios) pra nao deixar a tela crescer
// sem controle (padrao acordado: pagina a partir de 30 itens).
export default function Pagination({ page, pageSize, total, onPageChange }) {
	const totalPages = Math.max(1, Math.ceil(total / pageSize));
	if (total <= pageSize && page <= 1) return null;
	return (
		<div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
			<p className="text-xs font-semibold text-slate-500">Página {page} de {totalPages} · {total} registro(s)</p>
			<div className="flex gap-2">
				<button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 disabled:opacity-40">Anterior</button>
				<button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 disabled:opacity-40">Próxima</button>
			</div>
		</div>
	);
}
