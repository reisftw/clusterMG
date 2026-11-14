import { CheckCircle2, Sparkles, X } from "lucide-react";

function noteLines(notes) {
	return String(notes || "")
		.split(/\r?\n/)
		.map((line) => line.replace(/^[-*•]\s*/, "").trim())
		.filter(Boolean);
}

export default function AppReleaseNotesDialog({ release, onClose }) {
	if (!release) return null;
	const lines = noteLines(release.notes);

	return (
		<div className="fixed inset-0 z-[10060] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="release-notes-title">
			<section className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-2xl">
				<header className="flex items-start justify-between gap-3 bg-blue-700 px-5 py-5 text-white">
					<div className="flex items-center gap-3">
						<span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white/15"><Sparkles size={23} /></span>
						<div><small className="font-bold uppercase text-blue-100">Novidades</small><h2 id="release-notes-title" className="mt-1 text-xl font-black">Versão {release.versionName}</h2></div>
					</div>
					<button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-white hover:bg-white/15" aria-label="Fechar novidades"><X size={20} /></button>
				</header>
				<div className="space-y-4 p-5">
					<p className="text-sm font-semibold text-slate-600">Veja o que mudou nesta atualização:</p>
					{lines.length ? (
						<ul className="space-y-3">{lines.map((line, index) => <li key={`${index}-${line}`} className="flex items-start gap-2 text-sm leading-6 text-slate-700"><CheckCircle2 className="mt-1 shrink-0 text-emerald-600" size={17} /><span>{line}</span></li>)}</ul>
					) : <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Esta versão contém melhorias de estabilidade e desempenho.</p>}
					<button type="button" onClick={onClose} className="min-h-11 w-full rounded-lg bg-blue-600 px-4 font-bold text-white hover:bg-blue-700">Entendi</button>
				</div>
			</section>
		</div>
	);
}
