import { Calendar, HelpCircle, Upload, X } from "lucide-react";
import React, { useId, useRef, useState } from "react";
import StaticDataRefreshLink from "../../../components/ui/StaticDataRefreshLink";
import { processarUploadMapa } from "../utils/uploadMapaOS";
import MapaComparativo from "./MapaComparativo";

const FONTES_MAPA = [
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

function ModalPeriodo({ onConfirmar, onCancelar, quantidadeArquivos = 1 }) {
	const hoje = new Date().toISOString().split("T")[0];
	const [inicio, setInicio] = useState("");
	const [fim, setFim] = useState(hoje);
	const [fontes, setFontes] = useState(["sempre", "onnet"]);
	const inicioInputId = useId();
	const fimInputId = useId();

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
							<Calendar size={18} className="text-blue-500" />
							<h3 className="font-bold text-gray-900">Período da Planilha</h3>
						</div>
						<button
							type="button"
							onClick={onCancelar}
							className="p-1 rounded-lg hover:bg-gray-100"
						>
							<X size={16} className="text-gray-400" />
						</button>
					</div>
					<p className="text-xs text-gray-500 mb-4">
						Informe o período que foi filtrado na planilha antes de importar.
						{quantidadeArquivos > 1
							? ` Arquivos selecionados: ${quantidadeArquivos}.`
							: ""}
					</p>
					<div className="mb-5">
						{/* S-C (docs/SONARQUBE-MAP.md, achado javascript:S6853): heading
						    de um grupo de botões de seleção, não um <label> de input —
						    trocado para <p> pra refletir isso corretamente. */}
						<p className="text-xs font-semibold text-gray-500 mb-2 block">
							Bases que serão atualizadas
						</p>
						<div className="grid grid-cols-2 gap-2">
							{FONTES_MAPA.map((item) => {
								const ativo = fontes.includes(item.id);

								return (
									<button
										key={item.id}
										type="button"
										onClick={() => toggleFonte(item.id)}
										className={`rounded-xl border px-3 py-3 text-left transition-all ${
											ativo
												? "border-blue-500 bg-blue-50 text-blue-800 shadow-sm"
												: "border-gray-200 bg-white text-gray-600 hover:border-blue-200 hover:bg-blue-50"
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
													? "bg-blue-600 text-white"
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
							O XLSX pode conter todas as cidades. O sistema separa
							automaticamente pela regional cadastrada.
						</p>
					</div>
					<div className="flex flex-col gap-3 mb-6">
						<div>
							<label
								htmlFor={inicioInputId}
								className="text-xs font-semibold text-gray-500 mb-1 block"
							>
								Data inicio
							</label>
							<input
								id={inicioInputId}
								type="date"
								value={inicio}
								onChange={(e) => setInicio(e.target.value)}
								className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
							/>
						</div>
						<div>
							<label
								htmlFor={fimInputId}
								className="text-xs font-semibold text-gray-500 mb-1 block"
							>
								Data fim
							</label>
							<input
								id={fimInputId}
								type="date"
								value={fim}
								onChange={(e) => setFim(e.target.value)}
								className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
							/>
						</div>
					</div>
					<div className="flex gap-2">
						<button
							type="button"
							onClick={onCancelar}
							className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-all"
						>
							Cancelar
						</button>
						<button
							type="button"
							onClick={() => onConfirmar({ inicio, fim, fontes })}
							disabled={!inicio || !fim || fontes.length === 0}
							className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-semibold rounded-xl transition-all"
						>
							Importar
						</button>
					</div>
				</div>
			</div>
		</>
	);
}

function MapaFieldsHelpModal({ onClose }) {
	const camposObrigatorios = [
		["numero_ordem_servico", "Número da O.S."],
		["status", "Status da O.S."],
		["tipo_ordem_servico", "Tipo da O.S."],
		["cidade", "Cidade usada para identificar a regional"],
		["codigo_cliente", "Código do cliente"],
		["nome_razaosocial", "Nome ou razão social do cliente"],
		["endereco", "Logradouro da O.S."],
		["numero", "Número do endereço"],
		["bairro", "Bairro"],
	];

	const camposMensageria = [
		["telefone_primario", "Telefone principal para WhatsApp"],
		["telefone_secundario", "Telefone alternativo"],
		["telefone_terciario", "Terceiro telefone alternativo"],
		["telefones", "Lista de telefones, quando o relatório trouxer agregado"],
		["data_cadastro", "Data de abertura/cadastro da O.S."],
		["servico", "Plano ou serviço do cliente"],
		["numero_plano", "Número do plano"],
		["id_cliente_servico", "Identificador do serviço/contrato do cliente"],
		["Mac Addr", "MAC informado no atendimento/cliente"],
		["Phy Addr", "MAC físico do equipamento"],
	];

	const camposOpcionais = [
		["tecnicos", "Técnico responsável"],
		["coordenadas", "Latitude e longitude da O.S."],
		["regional", "Regional, caso venha no relatório"],
	];

	const renderCampos = (items, tone = "blue") => (
		<div className="overflow-hidden rounded-xl border border-gray-200">
			{items.map(([campo, descricao]) => (
				<div
					key={campo}
					className="grid gap-1 border-b border-gray-100 px-3 py-2.5 last:border-b-0 sm:grid-cols-[190px_1fr]"
				>
					<code
						className={`text-xs font-semibold ${tone === "green" ? "text-emerald-700" : "text-blue-700"}`}
					>
						{campo}
					</code>
					<span className="text-xs text-gray-600">{descricao}</span>
				</div>
			))}
		</div>
	);

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
					aria-labelledby="mapa-fields-help-title"
					className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
				>
					<div className="mb-5 flex items-start justify-between gap-3">
						<div>
							<h3
								id="mapa-fields-help-title"
								className="font-bold text-gray-900"
							>
								Campos da planilha do Mapa
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

					<div className="space-y-5">
						<div>
							<p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
								Obrigatórios
							</p>
							{renderCampos(camposObrigatorios)}
						</div>

						<div>
							<p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
								Recomendados para Mensageria
							</p>
							{renderCampos(camposMensageria, "green")}
						</div>

						<div>
							<p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
								Opcionais
							</p>
							{renderCampos(camposOpcionais)}
						</div>
					</div>

					<p className="mt-4 text-xs leading-5 text-gray-500">
						O sistema também aceita alguns nomes equivalentes, como{" "}
						<strong>num_os</strong>,<strong> telefone</strong>,{" "}
						<strong>whatsapp</strong>, <strong>cliente</strong> e
						<strong> data_abertura_os</strong>.
					</p>

					<button
						type="button"
						onClick={onClose}
						className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
					>
						Entendi
					</button>
				</div>
			</div>
		</>
	);
}

function ImportJobProgress({ job }) {
	if (!job) return null;
	const percent = Math.min(Math.max(Number(job.percent || 0), 0), 100);
	return (
		<div className="w-full rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-900">
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
				<span className="rounded-full bg-white px-3 py-1 text-xs font-black text-blue-700">
					{percent}%
				</span>
			</div>
			<div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
				<div
					className="h-full rounded-full bg-blue-600 transition-all"
					style={{ width: `${percent}%` }}
				/>
			</div>
		</div>
	);
}

export default function MapaUpload({ onConcluido }) {
	const inputRef = useRef();
	const [progresso, setProgresso] = useState("");
	const [loading, setLoading] = useState(false);
	const [resultado, setResultado] = useState(null);
	const [jobStatus, setJobStatus] = useState(null);
	const [comparativo, setComparativo] = useState(null);
	const [filesPendentes, setFilesPendentes] = useState([]);
	const [modalAberto, setModalAberto] = useState(false);
	const [ajudaCamposAberta, setAjudaCamposAberta] = useState(false);

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
		setComparativo(null);
		setJobStatus(null);

		try {
			const res = await processarUploadMapa(
				filesPendentes,
				setProgresso,
				periodo,
				setJobStatus,
			);
			setResultado(res);
			setComparativo(res.comparativo);
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
			<div className="flex items-center gap-4 flex-wrap bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
				<input
					ref={inputRef}
					type="file"
					accept=".xlsx"
					multiple
					onChange={handleFile}
					className="hidden"
				/>
				<button
					type="button"
					onClick={() => inputRef.current.click()}
					disabled={loading}
					className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-semibold rounded-xl transition-all"
				>
					<Upload size={16} />
					{loading ? "Processando Mapa..." : "Importar Mapa O.S"}
				</button>

				<button
					type="button"
					onClick={() => setAjudaCamposAberta(true)}
					aria-label="Ver campos necessários para a planilha do Mapa"
					className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-200 bg-white text-blue-700 transition-all hover:border-blue-300 hover:bg-blue-50"
					title="Campos da planilha do Mapa"
				>
					<HelpCircle size={18} />
				</button>

				<StaticDataRefreshLink className="flex items-center gap-2 px-4 py-2 bg-white border border-blue-200 hover:border-blue-300 hover:bg-blue-50 text-blue-700 text-sm font-semibold rounded-xl transition-all" />

				{progresso ? (
					<span className="text-sm font-bold text-red-600">{progresso}</span>
				) : null}

				{resultado && !loading ? (
					<div className="flex gap-2 flex-wrap">
						<span className="bg-green-50 text-green-700 border border-green-200 rounded-lg px-3 py-1 text-xs font-semibold">
							{resultado.fonteLabel || "SEMPRE"} · Novas: {resultado.salvas}
						</span>
						<span className="bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-3 py-1 text-xs font-semibold">
							Atualizadas: {resultado.atualizadas}
						</span>
						<span className="bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 py-1 text-xs font-semibold">
							Removidas: {resultado.removidas}
						</span>
						<span className="bg-blue-50 text-blue-700 border border-blue-200 rounded-lg px-3 py-1 text-xs font-semibold">
							Em aberto: {resultado.total}
						</span>
						{resultado.totalGeral &&
						resultado.totalGeral !== resultado.total ? (
							<span className="bg-slate-50 text-slate-700 border border-slate-200 rounded-lg px-3 py-1 text-xs font-semibold">
								Geral: {resultado.totalGeral}
							</span>
						) : null}
					</div>
				) : null}

				{loading ? <ImportJobProgress job={jobStatus} /> : null}
			</div>

			{comparativo ? <MapaComparativo comparativo={comparativo} /> : null}

			{modalAberto ? (
				<ModalPeriodo
					onConfirmar={handleConfirmar}
					onCancelar={() => {
						setModalAberto(false);
						setFilesPendentes([]);
					}}
					quantidadeArquivos={filesPendentes.length}
				/>
			) : null}

			{ajudaCamposAberta ? (
				<MapaFieldsHelpModal onClose={() => setAjudaCamposAberta(false)} />
			) : null}
		</div>
	);
}
