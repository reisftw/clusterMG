import { Archive, Calendar, Copy, X } from "lucide-react";
import React, { useRef, useState } from "react";
import { processarUploadMapaLegado } from "../utils/uploadMapaOSLegado";

function ModalPeriodo({ onConfirmar, onCancelar }) {
	const hoje = new Date().toISOString().split("T")[0];
	const [inicio, setInicio] = useState("");
	const [fim, setFim] = useState(hoje);

	return (
		<>
			<div
				className="fixed inset-0 z-layout-modal bg-black/40"
				onClick={onCancelar}
				onKeyDown={(event) => event.key === "Escape" && onCancelar()}
				role="button"
				tabIndex={-1}
			/>
			<div className="fixed inset-0 z-layout-modal flex items-center justify-center p-4">
				<div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
					<div className="mb-5 flex items-center justify-between">
						<div className="flex items-center gap-2">
							<Calendar size={18} className="text-amber-600" />
							<h3 className="font-bold text-gray-900">Período da Planilha</h3>
						</div>
						<button
							onClick={onCancelar}
							className="rounded-lg p-1 hover:bg-gray-100"
						>
							<X size={16} className="text-gray-400" />
						</button>
					</div>

					<p className="mb-4 text-xs text-gray-500">
						Informe o período usado na planilha do acervo legado.
					</p>

					<div className="mb-6 flex flex-col gap-3">
						<div>
							<label className="mb-1 block text-xs font-semibold text-gray-500">
								Data início
							</label>
							<input
								type="date"
								value={inicio}
								onChange={(e) => setInicio(e.target.value)}
								className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
							/>
						</div>
						<div>
							<label className="mb-1 block text-xs font-semibold text-gray-500">
								Data fim
							</label>
							<input
								type="date"
								value={fim}
								onChange={(e) => setFim(e.target.value)}
								className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
							/>
						</div>
					</div>

					<div className="flex gap-2">
						<button
							onClick={onCancelar}
							className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition-all hover:bg-gray-50"
						>
							Cancelar
						</button>
						<button
							onClick={() => onConfirmar({ inicio, fim })}
							disabled={!inicio || !fim}
							className="flex-1 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-amber-700 disabled:bg-gray-300"
						>
							Importar
						</button>
					</div>
				</div>
			</div>
		</>
	);
}

function TextoPersistidoCard({ titulo, texto, tone = "blue" }) {
	const [copiado, setCopiado] = useState(false);

	async function handleCopiar() {
		await navigator.clipboard.writeText(texto);
		setCopiado(true);
		window.setTimeout(() => setCopiado(false), 2000);
	}

	const toneClass =
		tone === "emerald"
			? "border-emerald-200 bg-emerald-50 text-emerald-900"
			: "border-blue-200 bg-blue-50 text-blue-900";

	return (
		<div className={`min-w-0 rounded-2xl border p-4 ${toneClass}`}>
			<div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<p className="min-w-0 text-sm font-bold leading-5 [overflow-wrap:normal]">
					{titulo}
				</p>
				<button
					type="button"
					onClick={handleCopiar}
					className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-current/20 px-3 py-2 text-xs font-semibold hover:bg-white/50 md:w-auto md:shrink-0"
				>
					<Copy size={14} />
					{copiado ? "Copiado" : "Copiar texto"}
				</button>
			</div>
			<textarea
				readOnly
				value={texto}
				rows={10}
				className="min-h-[220px] w-full resize-y rounded-xl border border-white/70 bg-white/80 px-3 py-3 text-xs leading-5 text-gray-700 [overflow-wrap:normal] focus:outline-none"
			/>
		</div>
	);
}

export default function MapaLegadoUpload({
	onConcluido,
	mensagensMatch = null,
}) {
	const inputRef = useRef();
	const [progresso, setProgresso] = useState("");
	const [loading, setLoading] = useState(false);
	const [resultado, setResultado] = useState(null);
	const [filePendente, setFilePendente] = useState(null);
	const [modalAberto, setModalAberto] = useState(false);

	function handleFile(event) {
		const file = event.target.files[0];
		if (!file) return;
		setFilePendente(file);
		setModalAberto(true);
		inputRef.current.value = "";
	}

	async function handleConfirmar(periodo) {
		setModalAberto(false);
		setLoading(true);
		setResultado(null);

		try {
			const res = await processarUploadMapaLegado(
				filePendente,
				setProgresso,
				periodo,
			);
			setResultado(res);
			onConcluido?.();
		} catch (error) {
			setProgresso(`Erro: ${error.message}`);
		} finally {
			setLoading(false);
			setFilePendente(null);
		}
	}

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
				<input
					ref={inputRef}
					type="file"
					accept=".xlsx"
					onChange={handleFile}
					className="hidden"
				/>

				<button
					onClick={() => inputRef.current.click()}
					disabled={loading}
					className="flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-amber-700 disabled:bg-gray-300"
				>
					<Archive size={16} />
					{loading ? "Processando Legado..." : "Importar O.S Legadas"}
				</button>

				{progresso ? (
					<span className="text-sm font-bold text-red-600">{progresso}</span>
				) : null}

				{resultado && !loading ? (
					<div className="flex flex-wrap gap-2">
						<span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
							Acervo: {resultado.total}
						</span>
						<span className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
							Atualizadas: {resultado.atualizadas}
						</span>
						<span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
							Removidas: {resultado.removidas}
						</span>
						<span className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
							Sem data: {resultado.ignoradasSemData}
						</span>
						<span className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">
							Fora do corte: {resultado.ignoradasForaDoCorte}
						</span>
					</div>
				) : null}
			</div>

			{mensagensMatch?.regionais || mensagensMatch?.agentes ? (
				<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-4">
					{mensagensMatch?.regionais ? (
						<TextoPersistidoCard
							titulo="Último texto para regionais"
							texto={mensagensMatch.regionais}
							tone="emerald"
						/>
					) : null}
					{mensagensMatch?.agentes ? (
						<TextoPersistidoCard
							titulo="Último texto para agente autorizado"
							texto={mensagensMatch.agentes}
						/>
					) : null}
				</div>
			) : null}

			{modalAberto ? (
				<ModalPeriodo
					onConfirmar={handleConfirmar}
					onCancelar={() => {
						setModalAberto(false);
						setFilePendente(null);
					}}
				/>
			) : null}
		</div>
	);
}
