// PageLoading — UX_AUDIT.md, Fase 3 (Padronização): cada tela nova
// reimplementava seu próprio "Carregando..." como um <p> solto, em vez de
// um componente compartilhado — inconsistência pequena, mas repetida em
// quase toda página do Finan. Uso: <PageLoading label="Carregando contas a
// pagar..." /> no lugar de onde o conteúdo real entraria (dentro de um
// card/tabela, não a página inteira — cada tela decide onde encaixar).
export default function PageLoading({ label = "Carregando..." }) {
	return (
		<div className="flex items-center justify-center gap-3 px-5 py-10 text-sm font-semibold text-slate-500">
			<span
				className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600"
				aria-hidden="true"
			/>
			{label}
		</div>
	);
}
