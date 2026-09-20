// Versao simplificada do Spinner do Retiradas (sem RetorninhoLoader — o
// Operação ainda nao tem essa peca de marca própria pra loading).
export default function Spinner({ fullScreen = false }) {
	if (fullScreen) {
		return (
			<div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-3 text-slate-400">
				<span className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
				<p className="text-sm font-bold">Carregando...</p>
			</div>
		);
	}
	return <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />;
}
