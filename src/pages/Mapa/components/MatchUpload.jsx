import {
	Calendar,
	CircleHelp,
	Copy,
	Route,
	Settings2,
	Upload,
	X,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import StaticDataRefreshLink from "../../../components/ui/StaticDataRefreshLink";
import {
	DEFAULT_MATCH_IGNORED_TYPES,
	loadMatchConfig,
	saveMatchConfig,
} from "../utils/matchConfig";
import { processarUploadMatch } from "../utils/uploadMatchOS";

const FONTES_MATCH = [
	{
		id: "sempre",
		label: "SEMPRE",
		helper: "Todas as regionais, exceto ONNET.",
	},
	{
		id: "onnet",
		label: "ONNET",
		helper: "Triangulo, Alto Paranaiba, Noroeste e Norte.",
	},
];

function ModalPeriodo({ quantidadeArquivos = 1, onConfirmar, onCancelar }) {
	const hoje = new Date().toISOString().split("T")[0];
	const [inicio, setInicio] = useState("");
	const [fim, setFim] = useState(hoje);
	const [fontes, setFontes] = useState(["sempre", "onnet"]);
	const isMultiplo = quantidadeArquivos > 1;

	function toggleFonte(fonteId) {
		setFontes((atuais) => {
			if (atuais.includes(fonteId)) {
				return atuais.filter((item) => item !== fonteId);
			}
			return [...atuais, fonteId];
		});
	}

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
				<div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
					<div className="flex items-center justify-between mb-5">
						<div className="flex items-center gap-2">
							<Calendar size={18} className="text-emerald-600" />
							<h3 className="font-bold text-gray-900">Período da Planilha</h3>
						</div>
						<button
							onClick={onCancelar}
							className="p-1 rounded-lg hover:bg-gray-100"
						>
							<X size={16} className="text-gray-400" />
						</button>
					</div>
					<p className="text-xs text-gray-500 mb-4">
						Informe o período usado{" "}
						{isMultiplo ? "nas planilhas" : "na planilha"} do Match antes de
						importar.
						{isMultiplo ? ` Arquivos selecionados: ${quantidadeArquivos}.` : ""}
					</p>
					<div className="mb-5">
						<label className="text-xs font-semibold text-gray-500 mb-2 block">
							Bases que serão atualizadas
						</label>
						<div className="grid grid-cols-2 gap-2">
							{FONTES_MATCH.map((item) => {
								const ativo = fontes.includes(item.id);

								return (
									<button
										key={item.id}
										type="button"
										onClick={() => toggleFonte(item.id)}
										className={`rounded-xl border px-3 py-3 text-left transition-all ${
											ativo
												? "border-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm"
												: "border-gray-200 bg-white text-gray-600 hover:border-emerald-200 hover:bg-emerald-50"
										}`}
									>
										<span className="block text-sm font-black">
											{item.label}
										</span>
										<span className="mt-1 block text-[11px] font-semibold opacity-80">
											{item.helper}
										</span>
										<span
											className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-black ${
												ativo
													? "bg-emerald-600 text-white"
													: "bg-gray-100 text-gray-400"
											}`}
										>
											{ativo ? "Selecionado" : "Ignorar"}
										</span>
									</button>
								);
							})}
						</div>
						<p className="mt-2 text-[11px] font-semibold text-gray-400">
							O sistema separa automaticamente as O.S pela regional da cidade.
						</p>
					</div>
					<div className="flex flex-col gap-3 mb-6">
						<div>
							<label className="text-xs font-semibold text-gray-500 mb-1 block">
								Data inicio
							</label>
							<input
								type="date"
								value={inicio}
								onChange={(e) => setInicio(e.target.value)}
								className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
							/>
						</div>
						<div>
							<label className="text-xs font-semibold text-gray-500 mb-1 block">
								Data fim
							</label>
							<input
								type="date"
								value={fim}
								onChange={(e) => setFim(e.target.value)}
								className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
							/>
						</div>
					</div>
					<div className="flex gap-2">
						<button
							onClick={onCancelar}
							className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-all"
						>
							Cancelar
						</button>
						<button
							onClick={() => onConfirmar({ inicio, fim, fontes })}
							disabled={!inicio || !fim || fontes.length === 0}
							className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white text-sm font-semibold rounded-xl transition-all"
						>
							Importar
						</button>
					</div>
				</div>
			</div>
		</>
	);
}

function MatchFieldsHelpModal({ onClose }) {
	const camposObrigatorios = [
		["numero_ordem_servico", "Número da O.S."],
		["status", "Pendente ou Aguardando Agendamento"],
		["tipo_ordem_servico", "Tipo do serviço"],
		["cidade", "Cidade usada para identificar a regional"],
		["codigo_cliente", "Código do cliente"],
		["nome_razaosocial", "Nome ou razão social do cliente"],
		["tecnicos", "Técnico responsável"],
		["endereco", "Logradouro da O.S."],
		["numero", "Número do endereço"],
		["bairro", "Bairro"],
		["coordenadas", "Latitude e longitude da O.S."],
	];

	return (
		<>
			<div
				className="fixed inset-0 z-layout-modal bg-black/40"
				onClick={onClose}
				onKeyDown={(event) => event.key === "Escape" && onClose()}
				role="button"
				tabIndex={-1}
			/>
			<div className="fixed inset-0 z-layout-modal flex items-center justify-center p-4">
				<div
					role="dialog"
					aria-modal="true"
					aria-labelledby="match-fields-help-title"
					className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
				>
					<div className="mb-5 flex items-start justify-between gap-3">
						<div>
							<h3
								id="match-fields-help-title"
								className="font-bold text-gray-900"
							>
								Campos da planilha do Match
							</h3>
							<p className="mt-1 text-xs text-gray-500">
								Use a primeira linha da planilha como cabeçalho.
							</p>
						</div>
						<button
							type="button"
							onClick={onClose}
							aria-label="Fechar ajuda dos campos"
							className="rounded-lg p-1 hover:bg-gray-100"
						>
							<X size={16} className="text-gray-400" />
						</button>
					</div>

					<div>
						<p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
							Obrigatórios
						</p>
						<div className="overflow-hidden rounded-xl border border-gray-200">
							{camposObrigatorios.map(([campo, descricao]) => (
								<div
									key={campo}
									className="grid gap-1 border-b border-gray-100 px-3 py-2.5 last:border-b-0 sm:grid-cols-[190px_1fr]"
								>
									<code className="text-xs font-semibold text-emerald-700">
										{campo}
									</code>
									<span className="text-xs text-gray-600">{descricao}</span>
								</div>
							))}
						</div>
					</div>

					<p className="mt-4 text-xs leading-5 text-gray-500">
						Preencha <strong>coordenadas</strong> no formato latitude, longitude
						para que o sistema consiga localizar O.S. próximas.
					</p>

					<button
						type="button"
						onClick={onClose}
						className="mt-6 w-full rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
					>
						Entendi
					</button>
				</div>
			</div>
		</>
	);
}

function MatchConfigModal({ initialExtras, onClose, onSave }) {
	const [novoTipo, setNovoTipo] = useState("");
	const [extras, setExtras] = useState(initialExtras);
	const [saving, setSaving] = useState(false);
	const [erro, setErro] = useState("");

	function adicionarTipo() {
		const valor = novoTipo.trim();
		if (!valor) return;

		const jaExiste = extras.some(
			(item) => item.toLowerCase() === valor.toLowerCase(),
		);

		if (jaExiste) {
			setNovoTipo("");
			return;
		}

		setExtras((current) => [...current, valor]);
		setNovoTipo("");
	}

	async function handleSave() {
		setSaving(true);
		setErro("");

		try {
			const result = await saveMatchConfig(extras);
			onSave(result);
			onClose();
		} catch (error) {
			setErro(error.message || "Não foi possível salvar a configuração.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<>
			<div
				className="fixed inset-0 z-layout-modal bg-black/40"
				onClick={onClose}
				onKeyDown={(event) => event.key === "Escape" && onClose()}
				role="button"
				tabIndex={-1}
			/>
			<div className="fixed inset-0 z-layout-modal flex items-center justify-center p-4">
				<div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6">
					<div className="flex items-center justify-between gap-3 mb-5">
						<div>
							<h3 className="font-bold text-gray-900">
								Tipos ignorados no Match
							</h3>
							<p className="text-xs text-gray-500 mt-1">
								Esses tipos não entram no processamento do Match.
							</p>
						</div>
						<button
							onClick={onClose}
							className="p-1 rounded-lg hover:bg-gray-100"
						>
							<X size={16} className="text-gray-400" />
						</button>
					</div>

					<div className="space-y-5">
						<div>
							<p className="text-xs font-semibold text-gray-500 mb-2">
								Tipos padrão
							</p>
							<div className="flex flex-wrap gap-2">
								{DEFAULT_MATCH_IGNORED_TYPES.map((tipo) => (
									<span
										key={tipo}
										className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700"
									>
										{tipo}
									</span>
								))}
							</div>
						</div>

						<div>
							<p className="text-xs font-semibold text-gray-500 mb-2">
								Tipos adicionais
							</p>
							<div className="flex gap-2">
								<input
									type="text"
									value={novoTipo}
									onChange={(e) => setNovoTipo(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											adicionarTipo();
										}
									}}
									placeholder="Ex.: Reparo preventivo"
									className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
								/>
								<button
									type="button"
									onClick={adicionarTipo}
									className="px-4 py-2 border border-emerald-200 text-emerald-700 text-sm font-semibold rounded-xl hover:bg-emerald-50"
								>
									Adicionar
								</button>
							</div>

							<div className="mt-3 flex flex-wrap gap-2 min-h-8">
								{extras.length ? (
									extras.map((tipo) => (
										<button
											key={tipo}
											type="button"
											onClick={() =>
												setExtras((current) =>
													current.filter((item) => item !== tipo),
												)
											}
											className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
										>
											{tipo} x
										</button>
									))
								) : (
									<span className="text-xs text-gray-400">
										Nenhum tipo adicional configurado.
									</span>
								)}
							</div>
						</div>

						{erro ? <p className="text-xs text-red-600">{erro}</p> : null}
					</div>

					<div className="mt-6 flex gap-2">
						<button
							onClick={onClose}
							className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50"
						>
							Cancelar
						</button>
						<button
							onClick={handleSave}
							disabled={saving}
							className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white text-sm font-semibold rounded-xl"
						>
							{saving ? "Salvando..." : "Salvar configuração"}
						</button>
					</div>
				</div>
			</div>
		</>
	);
}

function TextoResultado({ titulo, texto, tone = "blue" }) {
	const [copiado, setCopiado] = useState(false);

	async function copiarTexto() {
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
					onClick={copiarTexto}
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

function ImportJobProgress({ job }) {
	if (!job) return null;
	const percent = Math.min(Math.max(Number(job.percent || 0), 0), 100);
	return (
		<div className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div>
					<p className="text-sm font-black">
						{job.stage || "Processando no backend"}
					</p>
					<p className="mt-1 text-xs font-semibold opacity-80">
						{job.processedRows || 0} de {job.totalRows || 0} linhas processadas
						{job.totalDocuments ? ` · ${job.totalDocuments} documentos` : ""}
					</p>
				</div>
				<span className="rounded-full bg-white px-3 py-1 text-xs font-black text-emerald-700">
					{percent}%
				</span>
			</div>
			<div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
				<div
					className="h-full rounded-full bg-emerald-600 transition-all"
					style={{ width: `${percent}%` }}
				/>
			</div>
		</div>
	);
}

export default function MatchUpload({ onConcluido }) {
	const inputRef = useRef();
	const [progresso, setProgresso] = useState("");
	const [loading, setLoading] = useState(false);
	const [resultado, setResultado] = useState(null);
	const [jobStatus, setJobStatus] = useState(null);
	const [filesPendentes, setFilesPendentes] = useState([]);
	const [modalAberto, setModalAberto] = useState(false);
	const [ajudaCamposAberta, setAjudaCamposAberta] = useState(false);
	const [configAberta, setConfigAberta] = useState(false);
	const [matchConfig, setMatchConfig] = useState({
		tiposIgnoradosAdicionais: [],
		tiposIgnoradosAplicados: [],
	});

	useEffect(() => {
		let active = true;

		loadMatchConfig()
			.then((config) => {
				if (!active) return;
				setMatchConfig(config);
			})
			.catch(() => {});

		return () => {
			active = false;
		};
	}, []);

	function handleFile(e) {
		const files = Array.from(e.target.files || []);
		if (!files.length) return;
		setFilesPendentes(files);
		setModalAberto(true);
		inputRef.current.value = "";
	}

	async function handleConfirmar(periodo) {
		setModalAberto(false);
		setLoading(true);
		setResultado(null);
		setJobStatus(null);

		try {
			const res = await processarUploadMatch(
				filesPendentes,
				setProgresso,
				periodo,
				setJobStatus,
			);
			setResultado(res);
			if (Array.isArray(res?.tiposIgnoradosAdicionais)) {
				setMatchConfig({
					tiposIgnoradosAdicionais: res.tiposIgnoradosAdicionais,
					tiposIgnoradosAplicados: res.tiposIgnoradosAplicados?.length
						? res.tiposIgnoradosAplicados
						: [],
				});
			}
			onConcluido?.();
		} catch (err) {
			setProgresso("Erro: " + err.message);
		} finally {
			setLoading(false);
			setFilesPendentes([]);
		}
	}

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col gap-4 bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
				<div className="flex items-center gap-4 flex-wrap">
					<input
						ref={inputRef}
						type="file"
						accept=".xlsx"
						multiple
						onChange={handleFile}
						className="hidden"
					/>
					<button
						onClick={() => inputRef.current.click()}
						disabled={loading}
						className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white text-sm font-semibold rounded-xl transition-all"
					>
						<Upload size={16} />
						{loading ? "Processando Match..." : "Importar Match"}
					</button>

					<button
						type="button"
						onClick={() => setAjudaCamposAberta(true)}
						aria-label="Ver campos necessários para a planilha do Match"
						title="Campos necessários para a planilha"
						className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-200 bg-white text-emerald-700 transition-all hover:border-emerald-400 hover:bg-emerald-50"
					>
						<CircleHelp size={18} />
					</button>

					<button
						type="button"
						onClick={() => setConfigAberta(true)}
						className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-700 text-sm font-semibold rounded-xl transition-all"
					>
						<Settings2 size={16} />
						Configurar tipos ignorados
					</button>

					<StaticDataRefreshLink className="flex items-center gap-2 px-4 py-2 bg-white border border-emerald-200 hover:border-emerald-300 hover:bg-emerald-50 text-emerald-700 text-sm font-semibold rounded-xl transition-all" />

					{progresso ? (
						<span className="text-sm font-bold text-red-600">{progresso}</span>
					) : null}
				</div>

				<div className="flex flex-wrap gap-2">
					{matchConfig.tiposIgnoradosAplicados.map((tipo) => (
						<span
							key={tipo}
							className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700"
						>
							Ignorar: {tipo}
						</span>
					))}
				</div>

				{resultado && !loading ? (
					<>
						<div className="flex gap-2 flex-wrap">
							<span className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg px-3 py-1 text-xs font-semibold">
								<Route size={12} className="inline mr-1" />
								{resultado.fonteLabel || "SEMPRE + ONNET"} · Match:{" "}
								{resultado.total}
							</span>
							{resultado.totalGeral &&
							resultado.totalGeral !== resultado.total ? (
								<span className="bg-slate-50 text-slate-700 border border-slate-200 rounded-lg px-3 py-1 text-xs font-semibold">
									Geral: {resultado.totalGeral}
								</span>
							) : null}
							<span className="bg-blue-50 text-blue-700 border border-blue-200 rounded-lg px-3 py-1 text-xs font-semibold">
								Atualizadas: {resultado.atualizadas}
							</span>
							<span className="bg-slate-50 text-slate-700 border border-slate-200 rounded-lg px-3 py-1 text-xs font-semibold">
								Removidas: {resultado.removidas}
							</span>
							<span className="bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-3 py-1 text-xs font-semibold">
								Fora das regionais: {resultado.ignoradasSemRegional}
							</span>
							<span className="bg-rose-50 text-rose-700 border border-rose-200 rounded-lg px-3 py-1 text-xs font-semibold">
								Ignoradas por tipo: {resultado.ignoradasPorTipo}
							</span>
						</div>

						{Object.keys(resultado.ignoradasTipos || {}).length ? (
							<div className="flex flex-wrap gap-2">
								{Object.entries(resultado.ignoradasTipos).map(
									([tipo, total]) => (
										<span
											key={tipo}
											className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700"
										>
											{tipo}: {total}
										</span>
									),
								)}
							</div>
						) : null}

						<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-4">
							<TextoResultado
								titulo="Texto para regionais"
								texto={resultado?.mensagens?.regionais || ""}
								tone="emerald"
							/>
							<TextoResultado
								titulo="Texto para agente autorizado"
								texto={resultado?.mensagens?.agentes || ""}
							/>
						</div>
					</>
				) : null}

				{loading ? <ImportJobProgress job={jobStatus} /> : null}
			</div>

			{modalAberto ? (
				<ModalPeriodo
					quantidadeArquivos={filesPendentes.length}
					onConfirmar={handleConfirmar}
					onCancelar={() => {
						setModalAberto(false);
						setFilesPendentes([]);
					}}
				/>
			) : null}

			{configAberta ? (
				<MatchConfigModal
					initialExtras={matchConfig.tiposIgnoradosAdicionais}
					onClose={() => setConfigAberta(false)}
					onSave={setMatchConfig}
				/>
			) : null}

			{ajudaCamposAberta ? (
				<MatchFieldsHelpModal onClose={() => setAjudaCamposAberta(false)} />
			) : null}
		</div>
	);
}
