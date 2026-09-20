import RetorninhoLoader from "../../../components/ui/RetorninhoLoader";

export default function PublicPageLoading({
	title = "Carregando dados",
	description = "Aguarde enquanto buscamos as informacoes da pagina.",
}) {
	return (
		<div className="flex justify-center py-16 sm:py-20">
			<div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm">
				<RetorninhoLoader
					card={false}
					title={title}
					description={description}
					size="md"
				/>
			</div>
		</div>
	);
}
