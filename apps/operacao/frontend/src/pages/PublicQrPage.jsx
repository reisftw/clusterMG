import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchPublicQrCode } from "../api/rotApi";

// Pagina publica do QR Code — mesmo visual da Operação legado
// (rot/src/pages/PublicQrPage.tsx): fundo claro, cards brancos com
// borda esquerda laranja e seta, sem login/Shell. So a fonte de dados
// mudou (API propria em vez de ler direto do Firestore).
export default function PublicQrPage() {
	const { id } = useParams();
	const [qrcode, setQrcode] = useState(null);
	const [error, setError] = useState(false);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let active = true;
		fetchPublicQrCode(id)
			.then((data) => {
				if (active) setQrcode(data);
			})
			.catch(() => {
				if (active) setError(true);
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [id]);

	if (loading) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 font-sans text-white">
				<span className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-orange-500" />
				<p>Carregando links...</p>
			</div>
		);
	}

	if (error || !qrcode) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-5 text-center font-sans">
				<h1 className="mb-2.5 text-2xl font-black text-red-500">QR Code Inválido ou Excluído</h1>
				<p className="mb-5 text-slate-500">Não conseguimos encontrar os links para este QR Code.</p>
				<a href="/" className="rounded-lg bg-slate-900 px-5 py-2.5 font-bold text-white no-underline">
					Voltar ao Início
				</a>
			</div>
		);
	}

	const normalizeUrl = (url) => (url.startsWith("http") ? url : `https://${url}`);

	return (
		<div className="min-h-screen bg-slate-100 px-5 py-10 font-sans">
			<div className="mx-auto max-w-[450px] text-center">
				<header className="mb-8">
					<img src="/rot-menu.webp" alt="Operação" className="mx-auto h-16 w-16 rounded-2xl object-contain" />
					<p className="m-0 mt-3 text-xs font-black uppercase tracking-[3px] text-orange-500">Operação</p>
					<h1 className="mt-2.5 text-[22px] font-black uppercase text-slate-900">{qrcode.title}</h1>
					<div className="mx-auto my-4 h-1 w-10 bg-slate-900" />
				</header>

				<div className="flex flex-col gap-4">
					{qrcode.links.map((link, index) => (
						<a
							key={`${link.label}-${index}`}
							href={normalizeUrl(link.url)}
							target="_blank"
							rel="noreferrer"
							className="flex items-center justify-between rounded-2xl border-l-[6px] border-orange-500 bg-white p-5 font-extrabold text-slate-900 no-underline shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1)] transition-transform duration-200 hover:scale-[1.02]"
						>
							<span>{link.label}</span>
							<span className="text-xl text-orange-500">→</span>
						</a>
					))}
				</div>

				<footer className="mt-16 border-t border-slate-200 pt-5">
					<p className="m-0 text-[10px] font-bold text-slate-400">SISTEMA DE QR CODE</p>
					<p className="my-1.5 text-xs font-black text-slate-900">OPERAÇÃO - SEMPRE INTERNET</p>
				</footer>
			</div>
		</div>
	);
}
