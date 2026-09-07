import { BarcodeFormat, BrowserMultiFormatReader } from "@zxing/browser";
import { DecodeHintType } from "@zxing/library";
import {
	ArrowRight,
	Camera,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	Clock3,
	Headphones,
	HelpCircle,
	ImageUp,
	MapPin,
	MessageCircle,
	Package,
	Search,
	ShieldCheck,
	Sparkles,
	Store,
	Truck,
} from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import Tesseract from "tesseract.js";
import {
	fetchRetiradaByProtocol,
	RETIRADA_EMPTY_FORM,
	RETIRADA_METHODS,
	RETIRADA_PERIODOS,
	RETIRADA_STATUS,
	RETIRADA_TRATATIVAS,
	submitRetiradaRequest,
} from "../../modules/retiradas/services/retiradasService";
import {
	extractMacsFromText,
	formatMac,
} from "../../modules/retiradas/utils/macUtils";
import { STORE_LOCATIONS } from "./storeLocations";

const EQUIPMENT_OPTIONS = [
	"Roteador Wi-Fi",
	"ONU / modem fibra",
	"Fonte de energia",
	"Cabos e conectores",
	"Repetidor / mesh",
	"Outro equipamento",
];

const FAQ_ITEMS = [
	{
		question: "Quais equipamentos devem ser devolvidos?",
		answer:
			"Normalmente, entram modem, ONU, roteador, fonte de energia e acessorios fornecidos em comodato. Antes da conclusao, nossa equipe valida os itens vinculados ao seu atendimento.",
	},
	{
		question: "Posso entregar em loja em vez de agendar coleta?",
		answer:
			"Sim. Basta selecionar a opcao de entrega em loja e escolher a unidade mais conveniente no mapa oficial da Sempre.",
	},
	{
		question: "Como acompanho o andamento da devolucao?",
		answer:
			"Apos o registro, voce recebe um protocolo para consulta. O acompanhamento segue o fluxo operacional da sua regiao pelos canais oficiais da Sempre.",
	},
];

const SUPPORT_ITEMS = [
	{
		label: "Central de atendimento",
		value: "0800 300 0800",
		detail:
			"Canal oficial para suporte, financeiro e orientacoes sobre o atendimento.",
	},
	{
		label: "Horario de atendimento",
		value: "Segunda a sexta: 8h as 22h",
		detail: "Sabados, domingos e feriados: 8h as 18h.",
	},
	{
		label: "Base administrativa",
		value: "Betim - MG",
		detail:
			"Av. Governador Valadares, 737, 6º andar, Centro. Nao realizamos atendimento presencial na sede administrativa.",
	},
];

const FOOTER_LEGAL_ITEMS = [
	"Todos os direitos reservados. Razao Social: SEMPRE TELECOMUNICACOES LTDA. CNPJ: 24.605.227/0001-29.",
	"2001 - 2026 Sempre Internet e uma empresa Brasil TecPar Servicos de Telecomunicacoes SA. CNPJ 07.756.651/0001-55.",
];

const JOURNEY_ITEMS = [
	{
		icon: Sparkles,
		eyebrow: "1. Escolha o formato",
		title: "Defina a modalidade de devolucao.",
		text: "Escolha entre coleta no endereco informado ou entrega em uma unidade Sempre, conforme a opcao mais conveniente para voce.",
	},
	{
		icon: Package,
		eyebrow: "2. Registre os dados",
		title: "Preencha as informacoes do atendimento.",
		text: "Dados completos agilizam a triagem, ajudam no direcionamento da equipe e reduzem retrabalho durante o processo.",
	},
	{
		icon: ShieldCheck,
		eyebrow: "3. Acompanhe o protocolo",
		title: "Tenha visibilidade sobre o processo.",
		text: "Ao concluir o envio, um protocolo e gerado para acompanhamento do atendimento e continuidade da devolucao.",
	},
];

const STATUS_LABELS = Object.fromEntries(
	RETIRADA_STATUS.map((item) => [item.value, item.label]),
);
const TRATATIVA_LABELS = Object.fromEntries(
	RETIRADA_TRATATIVAS.map((item) => [item.value, item.label]),
);
const WHATSAPP_URL =
	"https://api.whatsapp.com/send?phone=558003000800&text=Ol%C3%A1%2C+acessei+o+site+e+gostaria+de+um+atendimento%21";

function inputClassName(extra = "") {
	return `w-full rounded-[22px] border border-slate-200/90 bg-white/92 px-4 py-3.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100 ${extra}`.trim();
}

function textAreaClassName(extra = "") {
	return `w-full rounded-[26px] border border-slate-200/90 bg-white/92 px-4 py-3.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100 ${extra}`.trim();
}

const OCR_VARIANTS = [
	{
		crop: { x: 0.08, y: 0.16, width: 0.84, height: 0.6 },
		mode: Tesseract.PSM.SPARSE_TEXT,
		threshold: false,
		scale: 2.2,
	},
	{
		crop: { x: 0.14, y: 0.22, width: 0.72, height: 0.46 },
		mode: Tesseract.PSM.SINGLE_BLOCK,
		threshold: false,
		scale: 2.8,
	},
	{
		crop: { x: 0.14, y: 0.22, width: 0.72, height: 0.46 },
		mode: Tesseract.PSM.SINGLE_BLOCK,
		threshold: true,
		scale: 3,
	},
	{
		crop: { x: 0.12, y: 0.3, width: 0.76, height: 0.24 },
		mode: Tesseract.PSM.SINGLE_LINE,
		threshold: true,
		scale: 3.2,
	},
	{
		crop: { x: 0.18, y: 0.32, width: 0.58, height: 0.18 },
		mode: Tesseract.PSM.SINGLE_LINE,
		threshold: true,
		scale: 3.6,
	},
];

const BARCODE_VARIANTS = [
	{
		crop: { x: 0.08, y: 0.16, width: 0.84, height: 0.6 },
		scale: 2.2,
		threshold: true,
	},
	{
		crop: { x: 0.12, y: 0.22, width: 0.76, height: 0.44 },
		scale: 2.8,
		threshold: true,
	},
	{
		crop: { x: 0.1, y: 0.28, width: 0.8, height: 0.22 },
		scale: 3.2,
		threshold: true,
	},
	{
		crop: { x: 0.14, y: 0.34, width: 0.68, height: 0.16 },
		scale: 3.8,
		threshold: true,
	},
];

const BARCODE_HINTS = new Map([
	[
		DecodeHintType.POSSIBLE_FORMATS,
		[
			BarcodeFormat.CODE_128,
			BarcodeFormat.CODE_39,
			BarcodeFormat.CODE_93,
			BarcodeFormat.CODABAR,
			BarcodeFormat.ITF,
			BarcodeFormat.EAN_13,
			BarcodeFormat.EAN_8,
			BarcodeFormat.UPC_A,
			BarcodeFormat.UPC_E,
		],
	],
]);

function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

async function loadImageElement(file) {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const image = new Image();
		image.onload = () => {
			URL.revokeObjectURL(url);
			resolve(image);
		};
		image.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error("Nao foi possivel abrir a foto enviada."));
		};
		image.src = url;
	});
}

function createProcessedCanvas(image, variant) {
	const sourceWidth = image.naturalWidth || image.width;
	const sourceHeight = image.naturalHeight || image.height;
	const cropX = Math.round(clamp(variant.crop.x, 0, 1) * sourceWidth);
	const cropY = Math.round(clamp(variant.crop.y, 0, 1) * sourceHeight);
	const cropWidth = Math.round(
		clamp(variant.crop.width, 0.08, 1) * sourceWidth,
	);
	const cropHeight = Math.round(
		clamp(variant.crop.height, 0.08, 1) * sourceHeight,
	);
	const outputWidth = Math.max(640, Math.round(cropWidth * variant.scale));
	const outputHeight = Math.max(200, Math.round(cropHeight * variant.scale));
	const canvas = document.createElement("canvas");
	canvas.width = outputWidth;
	canvas.height = outputHeight;

	const context = canvas.getContext("2d", { willReadFrequently: true });

	context.imageSmoothingEnabled = true;
	context.drawImage(
		image,
		cropX,
		cropY,
		cropWidth,
		cropHeight,
		0,
		0,
		outputWidth,
		outputHeight,
	);

	const imageData = context.getImageData(0, 0, outputWidth, outputHeight);
	const pixels = imageData.data;
	let totalLuma = 0;

	for (let index = 0; index < pixels.length; index += 4) {
		const luma =
			pixels[index] * 0.299 +
			pixels[index + 1] * 0.587 +
			pixels[index + 2] * 0.114;
		const contrasted = clamp((luma - 128) * 1.85 + 142, 0, 255);
		totalLuma += contrasted;
		pixels[index] = contrasted;
		pixels[index + 1] = contrasted;
		pixels[index + 2] = contrasted;
	}

	if (variant.threshold) {
		const averageLuma = totalLuma / (pixels.length / 4);
		const threshold = clamp(averageLuma * 0.94, 138, 188);

		for (let index = 0; index < pixels.length; index += 4) {
			const value = pixels[index] >= threshold ? 255 : 0;
			pixels[index] = value;
			pixels[index + 1] = value;
			pixels[index + 2] = value;
		}
	}

	context.putImageData(imageData, 0, 0);
	return canvas;
}

async function canvasToBlob(canvas) {
	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (blob) {
				resolve(blob);
				return;
			}
			reject(new Error("Nao foi possivel preparar a imagem para leitura."));
		}, "image/png");
	});
}

async function canvasToImageElement(canvas) {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () =>
			reject(
				new Error("Nao foi possivel preparar o codigo de barras para leitura."),
			);
		image.src = canvas.toDataURL("image/png");
	});
}

function parseMacFromBarcodeText(value = "") {
	const directMac = formatMac(value);

	if (directMac) {
		return directMac;
	}

	const candidates = extractMacsFromText(value);
	return candidates[0] || "";
}

async function recognizeMacFromBarcodeImage(file) {
	const image = await loadImageElement(file);
	const reader = new BrowserMultiFormatReader(BARCODE_HINTS);

	for (const variant of BARCODE_VARIANTS) {
		try {
			const canvas = createProcessedCanvas(image, {
				...variant,
				mode: Tesseract.PSM.SINGLE_LINE,
			});
			const preparedImage = await canvasToImageElement(canvas);
			const result = await reader.decodeFromImageElement(preparedImage);
			const mac = parseMacFromBarcodeText(
				result?.getText?.() || result?.text || "",
			);

			if (mac) {
				return {
					mac,
					crop: variant.crop,
				};
			}
		} catch {
			continue;
		}
	}

	throw new Error(
		"Nao conseguimos ler o codigo de barras dessa etiqueta. Tente aproximar mais o codigo e evitar corte lateral.",
	);
}

async function recognizeMacFromImage(file) {
	const image = await loadImageElement(file);

	for (const variant of OCR_VARIANTS) {
		const canvas = createProcessedCanvas(image, variant);
		const blob = await canvasToBlob(canvas);
		const result = await Tesseract.recognize(blob, "eng", {
			logger: () => {},
			tessedit_pageseg_mode: variant.mode,
			preserve_interword_spaces: "1",
			tessedit_char_whitelist: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ:-_() /",
		});
		const macs = extractMacsFromText(result?.data?.text || "");

		if (macs.length) {
			return {
				mac: macs[0],
				crop: variant.crop,
			};
		}
	}

	throw new Error(
		"Nao conseguimos identificar o MAC nessa foto. Tente aproximar mais a etiqueta, centralizar o adesivo e evitar reflexos.",
	);
}

async function recognizeMacFromBestSource(file) {
	try {
		const result = await recognizeMacFromBarcodeImage(file);
		return { result, mode: "barcode" };
	} catch {
		const result = await recognizeMacFromImage(file);
		return { result, mode: "ocr" };
	}
}

function getStoreLocationQuery(store) {
	return store?.mapsQuery || store?.address || "";
}

function getGoogleMapsUrl(store) {
	if (store?.mapsUrl) return store.mapsUrl;
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(getStoreLocationQuery(store))}`;
}

function getWazeUrl(store) {
	return `https://www.waze.com/ul?q=${encodeURIComponent(getStoreLocationQuery(store))}&navigate=yes`;
}

function getGeoUrl(store) {
	return `geo:0,0?q=${encodeURIComponent(getStoreLocationQuery(store))}`;
}

function SectionHeading({ eyebrow, title, description, light = false }) {
	return (
		<div>
			<p
				className={`text-[11px] font-black uppercase tracking-[0.24em] ${
					light ? "text-orange-200" : "text-orange-500"
				}`}
			>
				{eyebrow}
			</p>
			<h2
				className={`mt-3 text-3xl font-black tracking-[-0.04em] sm:text-4xl ${
					light ? "text-white" : "text-slate-950"
				}`}
			>
				{title}
			</h2>
			<p
				className={`mt-4 max-w-2xl text-sm leading-8 sm:text-base ${
					light ? "text-blue-50/84" : "text-slate-600"
				}`}
			>
				{description}
			</p>
		</div>
	);
}

function BrandMark() {
	return (
		<div className="inline-flex items-center">
			<img
				src="/cluster-mg.png"
				alt="Sempre Internet"
				className="h-16 w-auto sm:h-20 lg:h-24"
			/>
		</div>
	);
}

function MethodTab({ active, method, onClick }) {
	const Icon = method.value === "coleta" ? Truck : Store;

	return (
		<button
			type="button"
			onClick={onClick}
			className={`group relative flex items-center gap-3 rounded-full px-4 py-3 text-left transition ${
				active
					? "bg-slate-950 text-white shadow-[0_18px_35px_rgba(15,23,42,0.22)]"
					: "bg-white text-slate-600 hover:bg-slate-50"
			}`}
		>
			<div
				className={`flex h-11 w-11 items-center justify-center rounded-full ${
					active
						? "bg-[linear-gradient(135deg,#2563eb,#f97316)] text-white"
						: "bg-slate-100 text-slate-500"
				}`}
			>
				<Icon size={18} />
			</div>
			<div className="min-w-0">
				<p
					className={`text-sm font-black ${active ? "text-white" : "text-slate-950"}`}
				>
					{method.label}
				</p>
				<p className={`text-xs ${active ? "text-white/72" : "text-slate-500"}`}>
					{method.description}
				</p>
			</div>
			<ChevronRight
				size={18}
				className={`ml-auto shrink-0 ${active ? "text-orange-300" : "text-slate-300"}`}
			/>
		</button>
	);
}

function JourneyCard({ item }) {
	const Icon = item.icon;

	return (
		<article className="rounded-[32px] border border-slate-100 bg-white p-6 shadow-[0_20px_55px_rgba(15,23,42,0.07)]">
			<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#2563eb,#f97316)] text-white shadow-lg">
				<Icon size={20} />
			</div>
			<p className="mt-5 text-[11px] font-black uppercase tracking-[0.2em] text-orange-500">
				{item.eyebrow}
			</p>
			<h3 className="mt-3 text-xl font-black tracking-tight text-slate-950">
				{item.title}
			</h3>
			<p className="mt-3 text-sm leading-7 text-slate-600">{item.text}</p>
		</article>
	);
}

function StoreListCard({ store, selected, onClick }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`group relative w-full overflow-hidden rounded-[24px] border text-left transition-all ${
				selected
					? "border-white/70 bg-white text-slate-900 shadow-[0_20px_40px_rgba(15,23,42,0.18)]"
					: "border-white/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04))] text-white hover:border-white/16 hover:bg-white/12"
			}`}
		>
			<div
				className={`absolute inset-y-4 left-0 w-1 rounded-full transition ${
					selected
						? "bg-[linear-gradient(180deg,#f97316,#2563eb)]"
						: "bg-transparent"
				}`}
			/>
			<div className="px-4 py-4">
				<div className="flex items-start gap-3">
					<div
						className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition ${
							selected
								? "bg-[linear-gradient(135deg,#2563eb,#60a5fa)] text-white shadow-lg"
								: "bg-white/10 text-white group-hover:bg-white/14"
						}`}
					>
						<MapPin size={17} />
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<p
								className={`text-sm font-black sm:text-base ${
									selected ? "text-slate-950" : "text-white"
								}`}
							>
								{store.name}
							</p>
							<span
								className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
									selected
										? "bg-blue-50 text-blue-700"
										: "bg-white/10 text-blue-100"
								}`}
							>
								{store.city}
							</span>
						</div>
						<p
							className={`mt-2 text-sm leading-6 ${
								selected ? "text-slate-600" : "text-blue-50/78"
							}`}
						>
							{store.address}
						</p>
						<div
							className={`mt-3 flex flex-wrap items-center gap-3 text-xs ${
								selected ? "text-slate-500" : "text-blue-100/70"
							}`}
						>
							<span>{store.phone}</span>
							<span className="h-1 w-1 rounded-full bg-current opacity-60" />
							<span>{store.hours}</span>
						</div>
					</div>
				</div>
			</div>
		</button>
	);
}

function FaqItem({ item }) {
	return (
		<div className="rounded-[26px] border border-slate-100 bg-slate-50/70 px-5 py-5">
			<div className="flex items-start gap-4">
				<div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600">
					<HelpCircle size={18} />
				</div>
				<div>
					<h3 className="text-base font-black text-slate-950">
						{item.question}
					</h3>
					<p className="mt-2 text-sm leading-7 text-slate-600">{item.answer}</p>
				</div>
			</div>
		</div>
	);
}

function normalizeSearchText(value) {
	return String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim();
}

function buildMapsEmbedUrl(query) {
	return `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=15&output=embed`;
}

function buildMapsOpenUrl(query) {
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function formatDate(value) {
	// Extraido pra achado javascript:S3358 (ternario aninhado).
	let date = null;
	if (typeof value?.toDate === "function") date = value.toDate();
	else if (value) date = new Date(value);
	if (!date || Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function findRetiradaMethod(method) {
	return (
		RETIRADA_METHODS.find((item) => item.value === method) ||
		RETIRADA_METHODS[0]
	);
}

function findStoreById(storeId) {
	return STORE_LOCATIONS.find((item) => item.id === storeId) || STORE_LOCATIONS[0];
}

function filterStoresBySearch(search) {
	const term = normalizeSearchText(search);
	if (!term) return STORE_LOCATIONS;

	return STORE_LOCATIONS.filter((store) =>
		normalizeSearchText([store.name, store.city, store.address].join(" ")).includes(
			term,
		),
	);
}

function buildMethodFormPatch(method, currentForm, selectedStore) {
	if (method !== "ponto") {
		return {
			metodo: method,
			lojaSelecionadaId: "",
			lojaSelecionadaNome: "",
			lojaSelecionadaEndereco: "",
		};
	}

	const nextStore =
		findStoreById(currentForm.lojaSelecionadaId) ||
		selectedStore ||
		STORE_LOCATIONS[0];

	return {
		metodo: method,
		lojaSelecionadaId: nextStore?.id || "",
		lojaSelecionadaNome: nextStore?.name || "",
		lojaSelecionadaEndereco: nextStore?.address || "",
	};
}

function buildStoreFormPatch(store) {
	return {
		lojaSelecionadaId: store.id,
		lojaSelecionadaNome: store.name,
		lojaSelecionadaEndereco: store.address,
	};
}

function useRetiradaFormController() {
	const [form, setForm] = useState(RETIRADA_EMPTY_FORM);
	const [sending, setSending] = useState(false);
	const [success, setSuccess] = useState(false);
	const [successProtocol, setSuccessProtocol] = useState("");
	const [error, setError] = useState("");
	const [selectedStoreId, setSelectedStoreId] = useState(
		STORE_LOCATIONS[0]?.id || "",
	);
	const [storeSearch, setStoreSearch] = useState("");
	const selectedMethod = useMemo(
		() => findRetiradaMethod(form.metodo),
		[form.metodo],
	);
	const selectedStore = useMemo(
		() => findStoreById(selectedStoreId),
		[selectedStoreId],
	);
	const filteredStores = useMemo(
		() => filterStoresBySearch(storeSearch),
		[storeSearch],
	);
	const clearAlerts = () => {
		setSuccess(false);
		setError("");
	};
	const updateField = (field, value) => {
		clearAlerts();
		setForm((current) => ({ ...current, [field]: value }));
	};
	const selectStore = (storeId, shouldSyncForm = false) => {
		const nextStore = findStoreById(storeId);
		setSelectedStoreId(nextStore?.id || "");
		clearAlerts();
		if (!shouldSyncForm || !nextStore) return;
		setForm((current) => ({ ...current, ...buildStoreFormPatch(nextStore) }));
	};
	const changeMethod = (method) => {
		clearAlerts();
		setForm((current) => ({
			...current,
			...buildMethodFormPatch(method, current, selectedStore),
		}));
	};
	const handleSubmit = async (event) => {
		event.preventDefault();
		setSending(true);
		clearAlerts();

		try {
			if (form.metodo === "ponto" && !form.lojaSelecionadaId) {
				throw new Error("Selecione uma unidade de entrega para continuar.");
			}

			const result = await submitRetiradaRequest(form);
			setSuccess(true);
			setSuccessProtocol(result?.protocolo || "");
			setForm(RETIRADA_EMPTY_FORM);
			window.scrollTo({ top: 0, behavior: "smooth" });
		} catch (err) {
			setError(
				err?.message || "Nao foi possivel registrar sua devolucao no momento.",
			);
		} finally {
			setSending(false);
		}
	};

	return {
		changeMethod,
		error,
		filteredStores,
		form,
		handleSubmit,
		selectedMethod,
		selectedStore,
		selectStore,
		sending,
		setForm,
		setStoreSearch,
		storeSearch,
		success,
		successProtocol,
		updateField,
	};
}

function useProtocolSearchController() {
	const [protocolSearch, setProtocolSearch] = useState("");
	const [protocolResult, setProtocolResult] = useState(null);
	const [protocolLoading, setProtocolLoading] = useState(false);
	const [protocolError, setProtocolError] = useState("");
	const handleProtocolSearch = async (event) => {
		event.preventDefault();
		setProtocolLoading(true);
		setProtocolError("");
		setProtocolResult(null);

		try {
			const result = await fetchRetiradaByProtocol(protocolSearch);
			setProtocolResult(result);
		} catch (err) {
			setProtocolError(
				err?.message || "Nao foi possivel consultar o status do protocolo.",
			);
		} finally {
			setProtocolLoading(false);
		}
	};

	return {
		handleProtocolSearch,
		protocolError,
		protocolLoading,
		protocolResult,
		protocolSearch,
		setProtocolError,
		setProtocolSearch,
	};
}

function useMacReaderController(setForm) {
	const [macReading, setMacReading] = useState(false);
	const [macFeedback, setMacFeedback] = useState("");
	const [macError, setMacError] = useState("");
	const [macPreviewUrl, setMacPreviewUrl] = useState("");
	const [macDetectedCrop, setMacDetectedCrop] = useState(null);
	const [macDetectionMode, setMacDetectionMode] = useState("");
	const [macSectionOpen, setMacSectionOpen] = useState(false);

	useEffect(() => {
		return () => {
			if (macPreviewUrl) URL.revokeObjectURL(macPreviewUrl);
		};
	}, [macPreviewUrl]);

	const resetMacFeedback = () => {
		setMacFeedback("");
		setMacError("");
		setMacDetectionMode("");
	};
	const handleMacImageChange = async (event) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;

		if (macPreviewUrl) URL.revokeObjectURL(macPreviewUrl);
		setMacPreviewUrl(URL.createObjectURL(file));
		setMacDetectedCrop(null);
		setMacDetectionMode("");
		setMacSectionOpen(true);
		setMacReading(true);
		setMacFeedback("");
		setMacError("");

		try {
			const { result, mode } = await recognizeMacFromBestSource(file);
			setForm((current) => ({ ...current, equipamentoMac: result.mac }));
			setMacDetectedCrop(result.crop || null);
			setMacDetectionMode(mode);
			setMacFeedback(
				`MAC lido com sucesso via ${
					mode === "barcode" ? "codigo de barras" : "OCR"
				}: ${result.mac}`,
			);
		} catch (err) {
			setMacError(
				err?.message || "Nao foi possivel ler o MAC pela imagem no momento.",
			);
		} finally {
			setMacReading(false);
		}
	};

	return {
		handleMacImageChange,
		macDetectedCrop,
		macDetectionMode,
		macError,
		macFeedback,
		macPreviewUrl,
		macReading,
		macSectionOpen,
		resetMacFeedback,
		setMacSectionOpen,
	};
}

const DEVOLUCAO_CONTACT_FIELDS = [
	["nome", "Nome do titular", "Informe o nome completo", "text", true],
	["telefone", "Telefone com WhatsApp", "Informe o telefone principal", "text", true],
	["cpfCnpj", "CPF ou CNPJ do titular", "Informe o CPF ou CNPJ", "text", true],
	["email", "E-mail para contato", "nome@exemplo.com", "email", true],
];

const DEVOLUCAO_LOCATION_FIELDS = [
	["cidade", "Cidade de atendimento", "Informe a cidade", true],
	["bairro", "Bairro", "Informe o bairro", true],
];

const DEVOLUCAO_ADDRESS_FIELDS = [
	["endereco", "Endereco de coleta", "Rua, avenida ou logradouro", true],
	["numero", "Numero", "Numero", false],
	["complemento", "Complemento", "Apartamento, bloco, referencia interna", false],
];

function RequestCardHeader({ selectedMethod }) {
	const Icon = selectedMethod.value === "coleta" ? Truck : Store;

	return (
		<div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
			<div>
				<p className="text-[11px] font-black uppercase tracking-[0.22em] text-orange-500">
					Jornada de devolucao
				</p>
				<h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
					{selectedMethod.label}
				</h2>
				<p className="mt-2 max-w-xl text-sm leading-7 text-slate-500">
					Um fluxo direto para registrar a devolucao com as informacoes essenciais para o atendimento.
				</p>
			</div>
			<div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-[linear-gradient(135deg,#2563eb,#f97316)] text-white shadow-lg sm:h-14 sm:w-14 sm:rounded-[22px]">
				<Icon size={24} />
			</div>
		</div>
	);
}

function RequestAlerts({ error, success, successProtocol }) {
	return (
		<>
			{success ? <SuccessRequestAlert successProtocol={successProtocol} /> : null}
			{error ? <ErrorRequestAlert error={error} /> : null}
		</>
	);
}

function SuccessRequestAlert({ successProtocol }) {
	return (
		<div className="mt-5 overflow-hidden rounded-[24px] border border-emerald-100 bg-[linear-gradient(135deg,#ecfdf5,#f0fdf4)] px-4 py-4 text-emerald-950 shadow-[0_18px_48px_rgba(16,185,129,0.12)] sm:rounded-[28px] sm:px-5 sm:py-5">
			<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div className="flex items-start gap-3">
					<CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={18} />
					<div>
						<p className="text-sm font-black">Atendimento registrado com sucesso.</p>
						<p className="mt-1 text-sm leading-6 text-emerald-900">
							Protocolo gerado: <strong>{successProtocol || "-"}</strong>. Sua devolucao ja foi encaminhada para a fila de atendimento da equipe local.
						</p>
						<p className="mt-2 text-sm font-bold text-emerald-700">Guarde este numero para futuras consultas.</p>
					</div>
				</div>
				<img src="/retorninho-estela.webp" alt="Mascotes da Sempre agradecendo pela devolucao" className="mx-auto h-auto w-full max-w-[210px] drop-shadow-[0_18px_30px_rgba(249,115,22,0.18)] md:mx-0" />
			</div>
		</div>
	);
}

function ErrorRequestAlert({ error }) {
	return (
		<div className="mt-5 rounded-[24px] border border-rose-100 bg-rose-50 px-4 py-4 text-sm text-rose-700 sm:rounded-[28px] sm:px-5">
			{error}
		</div>
	);
}

function RequestMethodTabs({ changeMethod, form }) {
	return (
		<div className="mt-6 grid gap-3">
			{RETIRADA_METHODS.map((method) => (
				<MethodTab key={method.value} method={method} active={form.metodo === method.value} onClick={() => changeMethod(method.value)} />
			))}
		</div>
	);
}

function RequestMethodBody(props) {
	if (props.form.metodo === "ponto") {
		return <DropoffRequest form={props.form} selectedStore={props.selectedStore} selectStore={props.selectStore} />;
	}

	return <CollectionRequestForm {...props} />;
}

function DropoffRequest({ form, selectStore, selectedStore }) {
	const selectId = useId();
	return (
		<div className="space-y-4">
			<div className="rounded-[28px] border border-blue-100 bg-[linear-gradient(135deg,#eff6ff,#fff7ed)] px-4 py-4">
				<label htmlFor={selectId} className="mb-2 block text-sm font-bold text-slate-900">Unidade selecionada para entrega</label>
				<select id={selectId} value={form.lojaSelecionadaId} onChange={(event) => selectStore(event.target.value, true)} className={inputClassName()}>
					<option value="">Selecione uma unidade</option>
					{STORE_LOCATIONS.map((store) => (
						<option key={store.id} value={store.id}>{store.name} - {store.city}</option>
					))}
				</select>
			</div>
			{form.lojaSelecionadaId ? <SelectedDropoffStore form={form} selectedStore={selectedStore} /> : <DropoffEmptyState />}
		</div>
	);
}

function SelectedDropoffStore({ form, selectedStore }) {
	return (
		<div className="overflow-hidden rounded-[32px] border border-slate-100 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
			<div className="bg-[linear-gradient(135deg,#0f172a,#1d4ed8)] px-6 py-6 text-white">
				<p className="text-[11px] font-black uppercase tracking-[0.2em] text-orange-300">Entrega em unidade Sempre</p>
				<h3 className="mt-3 text-2xl font-black tracking-tight">{form.lojaSelecionadaNome || selectedStore?.name}</h3>
				<p className="mt-3 max-w-2xl text-sm leading-7 text-blue-50/84">Leve os equipamentos ate a unidade escolhida e use uma das opcoes abaixo para abrir a rota no seu celular.</p>
			</div>
			<div className="space-y-5 px-6 py-6">
				<div className="rounded-[24px] bg-slate-50 px-5 py-5">
					<p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Endereco da unidade</p>
					<p className="mt-3 text-base font-bold leading-7 text-slate-900">{form.lojaSelecionadaEndereco || selectedStore?.address}</p>
				</div>
				<div className="grid gap-3 sm:grid-cols-3">
					<a href={getGoogleMapsUrl(selectedStore)} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800"><MapPin size={16} />Abrir no Google Maps</a>
					<a href={getWazeUrl(selectedStore)} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-5 py-3 text-sm font-black text-blue-700 transition hover:bg-blue-100"><ArrowRight size={16} />Abrir no Waze</a>
					<a href={getGeoUrl(selectedStore)} className="inline-flex items-center justify-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-5 py-3 text-sm font-black text-orange-700 transition hover:bg-orange-100"><ArrowRight size={16} />Abrir no GPS</a>
				</div>
				<p className="text-sm leading-7 text-slate-600">Se precisar, consulte a unidade no mapa oficial abaixo ou fale com a central da Sempre pelo<strong> 0800 300 0800</strong>.</p>
			</div>
		</div>
	);
}

function DropoffEmptyState() {
	return <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 px-5 py-5 text-sm leading-7 text-slate-600">Selecione uma unidade para visualizar o endereco completo e abrir a rota no aplicativo de sua preferencia.</div>;
}

function CollectionRequestForm({ form, handleMacImageChange, handleSubmit, macDetectedCrop, macDetectionMode, macError, macFeedback, macPreviewUrl, macReading, macSectionOpen, sending, setMacSectionOpen, updateField }) {
	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			<MacReaderPanel form={form} handleMacImageChange={handleMacImageChange} macDetectedCrop={macDetectedCrop} macDetectionMode={macDetectionMode} macError={macError} macFeedback={macFeedback} macPreviewUrl={macPreviewUrl} macReading={macReading} macSectionOpen={macSectionOpen} setMacSectionOpen={setMacSectionOpen} updateField={updateField} />
			<TextFieldGrid fields={DEVOLUCAO_CONTACT_FIELDS} form={form} updateField={updateField} columns="md:grid-cols-2" />
			<TextInputField field="cep" label="CEP do endereco" placeholder="Informe o CEP" required form={form} updateField={updateField} />
			<div className="grid gap-4 md:grid-cols-3">
				{DEVOLUCAO_LOCATION_FIELDS.map(([field, label, placeholder, required]) => <TextInputField key={field} field={field} label={label} placeholder={placeholder} required={required} form={form} updateField={updateField} />)}
				<PeriodoField form={form} updateField={updateField} />
			</div>
			<TextFieldGrid fields={DEVOLUCAO_ADDRESS_FIELDS} form={form} updateField={updateField} columns="md:grid-cols-[1.15fr_0.5fr_0.75fr]" />
			<div className="grid gap-4 md:grid-cols-2">
				<EquipamentoField form={form} updateField={updateField} />
				<TextInputField field="referencia" label="Referencia do local" placeholder="Ex.: portaria, comercio proximo, bloco" form={form} updateField={updateField} />
			</div>
			<TextInputField field="motivo" label="Motivo da devolucao" placeholder="Descreva o motivo da devolucao" form={form} updateField={updateField} />
			<ObservacoesField form={form} updateField={updateField} />
			<button type="submit" disabled={sending} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#f97316,#fb923c)] px-6 py-4 text-sm font-black text-white shadow-[0_20px_42px_rgba(249,115,22,0.28)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60">
				{sending ? "Registrando devolucao..." : "Confirmar devolucao"}
				<ArrowRight size={16} />
			</button>
		</form>
	);
}

function TextFieldGrid({ columns, fields, form, updateField }) {
	return <div className={`grid gap-4 ${columns}`}>{fields.map(([field, label, placeholder, type = "text", required = false]) => <TextInputField key={field} field={field} label={label} placeholder={placeholder} type={type} required={required} form={form} updateField={updateField} />)}</div>;
}

function TextInputField({ field, form, label, placeholder, required = false, type = "text", updateField }) {
	const inputId = useId();
	return (
		<div className="space-y-2">
			<label htmlFor={inputId} className="block text-sm font-bold text-slate-900">{label}</label>
			<input id={inputId} value={form[field]} onChange={(event) => updateField(field, event.target.value)} placeholder={placeholder} required={required} type={type} className={inputClassName()} />
		</div>
	);
}

function PeriodoField({ form, updateField }) {
	const selectId = useId();
	return (
		<div className="space-y-2">
			<label htmlFor={selectId} className="block text-sm font-bold text-slate-900">Janela preferencial</label>
			<select id={selectId} value={form.periodoPreferido} onChange={(event) => updateField("periodoPreferido", event.target.value)} className={inputClassName()}>
				<option value="">Selecione uma janela</option>
				{RETIRADA_PERIODOS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
			</select>
		</div>
	);
}

function EquipamentoField({ form, updateField }) {
	const selectId = useId();
	return (
		<div className="space-y-2">
			<label htmlFor={selectId} className="block text-sm font-bold text-slate-900">Equipamento principal</label>
			<select id={selectId} value={form.equipamento} onChange={(event) => updateField("equipamento", event.target.value)} required className={inputClassName()}>
				<option value="">Selecione o equipamento principal</option>
				{EQUIPMENT_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
			</select>
		</div>
	);
}

function ObservacoesField({ form, updateField }) {
	const textareaId = useId();
	return (
		<div className="space-y-2">
			<label htmlFor={textareaId} className="block text-sm font-bold text-slate-900">Observacoes para a equipe</label>
			<textarea id={textareaId} value={form.observacoes} onChange={(event) => updateField("observacoes", event.target.value)} rows={4} placeholder="Inclua informacoes uteis para agilizar o atendimento" className={textAreaClassName("resize-none")} />
		</div>
	);
}

function MacReaderPanel(props) {
	return (
		<div className="rounded-[24px] border border-blue-100 bg-[linear-gradient(135deg,#eff6ff,#fff7ed)] px-4 py-4 shadow-[0_18px_40px_rgba(37,99,235,0.08)] sm:rounded-[28px] sm:px-5 sm:py-5">
			<div className="flex flex-col gap-4 rounded-[22px] border border-white/80 bg-white/82 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
				<MacReaderHeader macSectionOpen={props.macSectionOpen} setMacSectionOpen={props.setMacSectionOpen} />
				<MacReaderInput form={props.form} handleMacImageChange={props.handleMacImageChange} macReading={props.macReading} updateField={props.updateField} />
				{props.macSectionOpen ? <MacReaderDetails macDetectedCrop={props.macDetectedCrop} macPreviewUrl={props.macPreviewUrl} /> : null}
				<MacReaderMessages macDetectedCrop={props.macDetectedCrop} macDetectionMode={props.macDetectionMode} macError={props.macError} macFeedback={props.macFeedback} />
			</div>
		</div>
	);
}

function MacReaderHeader({ macSectionOpen, setMacSectionOpen }) {
	return (
		<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
			<div className="min-w-0">
				<p className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-700">Leitura de MAC</p>
				<h3 className="mt-1 text-lg font-black tracking-tight text-slate-950 sm:text-xl">Envie uma foto da etiqueta do equipamento.</h3>
				<p className="mt-2 text-sm leading-6 text-slate-600">O sistema tenta primeiro codigo de barras e, se nao achar, usa OCR da etiqueta. Quando precisar, voce ainda pode corrigir o MAC manualmente.</p>
			</div>
			<button type="button" onClick={() => setMacSectionOpen((current) => !current)} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-5 py-3 text-sm font-black text-blue-800 transition hover:bg-blue-100 lg:w-auto">
				{macSectionOpen ? "Ocultar envio de foto" : "Abrir envio de foto"}
				<ChevronDown size={16} className={`transition-transform ${macSectionOpen ? "rotate-180" : ""}`} />
			</button>
		</div>
	);
}

function MacReaderInput({ form, handleMacImageChange, macReading, updateField }) {
	const macInputId = useId();
	return (
		<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-start">
			<div className="space-y-2">
				<label htmlFor={macInputId} className="block text-sm font-bold text-slate-900">MAC do equipamento</label>
				<input id={macInputId} value={form.equipamentoMac} onChange={(event) => updateField("equipamentoMac", formatMac(event.target.value))} placeholder="Ex.: A1:B2:C3:D4:E5:F6" className={inputClassName("font-mono uppercase")} />
				<p className="text-xs leading-6 text-slate-500">Se a leitura nao ficar boa, voce pode ajustar manualmente.</p>
			</div>
			<div className="grid gap-2 sm:grid-cols-2">
				<FileInputButton capture disabled={macReading} icon={<Camera size={16} />} label={macReading ? "Lendo imagem..." : "Usar camera"} onChange={handleMacImageChange} variant="dark" />
				<FileInputButton disabled={macReading} icon={<ImageUp size={16} />} label={macReading ? "Lendo imagem..." : "Enviar foto"} onChange={handleMacImageChange} />
			</div>
		</div>
	);
}

function FileInputButton({ capture = false, disabled, icon, label, onChange, variant = "light" }) {
	const className = variant === "dark"
		? "inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800"
		: "inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-800 transition hover:bg-slate-50";

	return (
		<label className={className}>
			{icon}
			{label}
			<input type="file" accept="image/*" capture={capture ? "environment" : undefined} onChange={onChange} className="hidden" disabled={disabled} />
		</label>
	);
}

function MacReaderDetails({ macDetectedCrop, macPreviewUrl }) {
	return (
		<div className="grid gap-4 border-t border-slate-100 pt-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(280px,0.78fr)] lg:items-start">
			<MacReaderGuide />
			<MacPreview macDetectedCrop={macDetectedCrop} macPreviewUrl={macPreviewUrl} />
		</div>
	);
}

function MacReaderGuide() {
	return (
		<div className="space-y-4">
			<div className="rounded-[22px] bg-[linear-gradient(160deg,#11255f,#2647b7)] p-3 text-white sm:p-4">
				<div className="mx-auto flex aspect-[4/3] w-full max-w-[320px] items-center justify-center rounded-[22px] border border-white/12 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-3 shadow-inner">
					<div className="relative h-full w-full overflow-hidden rounded-[20px] border-2 border-dashed border-orange-300/90 bg-[linear-gradient(180deg,rgba(15,23,42,0.16),rgba(15,23,42,0.28))]">
						<div className="relative z-10 flex h-full flex-col items-center justify-center px-4 py-5 text-center">
							<div className="rounded-full border border-cyan-200/35 bg-white/8 px-4 py-1.5"><p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-100/90">Etiqueta do MAC</p></div>
							<p className="mt-4 font-mono text-[clamp(15px,4vw,20px)] font-bold tracking-[0.14em] text-white/95">AA:BB:CC:DD:EE:FF</p>
							<p className="mt-3 max-w-[220px] text-[11px] leading-5 text-blue-50/82">Evite reflexo e mantenha a etiqueta centralizada dentro da moldura.</p>
						</div>
					</div>
				</div>
			</div>
			<div className="grid gap-3 sm:grid-cols-3">
				{["Use boa iluminacao e segure firme por um instante.", "Preencha a foto principalmente com a etiqueta do roteador ou ONU.", "No computador, envie uma imagem nitida e sem cortar as barras laterais."].map((text) => <div key={text} className="rounded-[18px] bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-600">{text}</div>)}
			</div>
		</div>
	);
}

function MacPreview({ macDetectedCrop, macPreviewUrl }) {
	return (
		<div className="rounded-[22px] border border-white/70 bg-white/78 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
			<p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Preview da foto</p>
			<div className="mt-3 overflow-hidden rounded-[20px] border border-slate-200 bg-slate-100">
				{macPreviewUrl ? <MacPreviewImage macDetectedCrop={macDetectedCrop} macPreviewUrl={macPreviewUrl} /> : <MacPreviewEmpty />}
			</div>
		</div>
	);
}

function MacPreviewImage({ macDetectedCrop, macPreviewUrl }) {
	return (
		<div className="relative h-52 w-full sm:h-60">
			<img src={macPreviewUrl} alt="Preview da etiqueta fotografada" className="h-52 w-full object-cover sm:h-60" />
			{macDetectedCrop ? <MacCropOverlay macDetectedCrop={macDetectedCrop} /> : null}
		</div>
	);
}

function MacCropOverlay({ macDetectedCrop }) {
	return (
		<>
			<div className="pointer-events-none absolute inset-0 bg-slate-950/24" />
			<div className="pointer-events-none absolute rounded-[18px] border-[3px] border-orange-400 shadow-[0_0_0_999px_rgba(15,23,42,0.28)]" style={{ left: `${macDetectedCrop.x * 100}%`, top: `${macDetectedCrop.y * 100}%`, width: `${macDetectedCrop.width * 100}%`, height: `${macDetectedCrop.height * 100}%` }}>
				<div className="absolute left-2 top-2 rounded-full bg-orange-500 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white shadow-lg">Area lida</div>
			</div>
		</>
	);
}

function MacPreviewEmpty() {
	return <div className="flex h-52 items-center justify-center px-4 text-center text-sm leading-7 text-slate-500 sm:h-60">A foto da etiqueta aparece aqui para voce validar o enquadramento antes de confiar na leitura.</div>;
}

function MacReaderMessages({ macDetectedCrop, macDetectionMode, macError, macFeedback }) {
	return (
		<>
			{macFeedback ? <div className="mt-4 rounded-[22px] border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{macFeedback}</div> : null}
			{macDetectedCrop ? <div className="mt-4 rounded-[22px] border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">A moldura no preview mostra a area da foto usada para encontrar o MAC {macDetectionMode === "barcode" ? "pelo codigo de barras." : "pelo OCR da etiqueta."}</div> : null}
			{macError ? <div className="mt-4 rounded-[22px] border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{macError}</div> : null}
		</>
	);
}

function DevolucaoRequestCard(props) {
	return (
		<>
			<RequestCardHeader selectedMethod={props.selectedMethod} />
			<RequestAlerts error={props.error} success={props.success} successProtocol={props.successProtocol} />
			<RequestMethodTabs changeMethod={props.changeMethod} form={props.form} />
			<div id="solicitar" className="mt-6 space-y-4">
				<RequestMethodBody {...props} />
			</div>
		</>
	);
}

export default function DevolucaoPage() {
	const protocolInputId = useId();
	const formController = useRetiradaFormController();
	const protocolController = useProtocolSearchController();
	const macController = useMacReaderController(formController.setForm);
	const {
		changeMethod,
		error,
		filteredStores,
		form,
		handleSubmit,
		selectedMethod,
		selectedStore,
		selectStore,
		sending,
		setStoreSearch,
		storeSearch,
		success,
		successProtocol,
		updateField: updateFormField,
	} = formController;
	const {
		handleProtocolSearch,
		protocolError,
		protocolLoading,
		protocolResult,
		protocolSearch,
		setProtocolError,
		setProtocolSearch,
	} = protocolController;
	const {
		handleMacImageChange,
		macDetectedCrop,
		macDetectionMode,
		macError,
		macFeedback,
		macPreviewUrl,
		macReading,
		macSectionOpen,
		resetMacFeedback,
		setMacSectionOpen,
	} = macController;
	const updateField = (field, value) => {
		if (field === "equipamentoMac") resetMacFeedback();
		updateFormField(field, value);
	};

	return (
		<div className="min-h-screen overflow-x-hidden text-slate-950">
			<section className="relative isolate overflow-hidden px-4 pb-14 pt-4 sm:px-6 sm:pb-16 sm:pt-6 lg:px-8 lg:pb-20">
				<div className="absolute inset-0 -z-20 bg-[linear-gradient(135deg,#08245f_0%,#0d47a1_42%,#2576ff_100%)]" />
				<div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_12%_18%,rgba(255,255,255,0.16),transparent_22%),radial-gradient(circle_at_84%_20%,rgba(249,115,22,0.22),transparent_18%),radial-gradient(circle_at_50%_100%,rgba(255,255,255,0.08),transparent_28%)]" />
				<div className="absolute left-0 top-32 h-72 w-72 -translate-x-1/3 rounded-full bg-orange-400/20 blur-3xl" />
				<div className="absolute right-0 top-0 h-80 w-80 translate-x-1/3 rounded-full bg-cyan-300/10 blur-3xl" />

				<div className="mx-auto max-w-7xl">
					<div className="flex flex-col gap-5">
						<div className="sm:px-5 lg:px-6">
							<div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
								<BrandMark />

								<div className="w-full sm:flex sm:flex-1 sm:justify-end">
									<nav className="grid w-full grid-cols-1 gap-2 rounded-[24px] bg-white/10 p-2 backdrop-blur sm:inline-flex sm:w-auto sm:grid-cols-none sm:flex-wrap sm:items-center sm:rounded-full">
										<a
											href="#solicitar"
											className="rounded-full bg-slate-950/65 px-4 py-2.5 text-center text-sm font-black text-white transition hover:bg-slate-950/80"
										>
											Realizar devolucao
										</a>
										<a
											href="#lojas"
											className="rounded-full px-4 py-2.5 text-center text-sm font-semibold text-white/88 transition hover:bg-white/10 hover:text-white"
										>
											Lojas para entrega
										</a>
										<a
											href="#rodape-canais"
											className="rounded-full bg-white px-4 py-2.5 text-center text-sm font-black text-blue-700 transition hover:bg-blue-50"
										>
											Fale com a Sempre
										</a>
									</nav>
								</div>
							</div>
						</div>
					</div>

					<div className="mt-10 grid gap-8 lg:mt-12 lg:grid-cols-[1.02fr_0.98fr] lg:items-start">
						<div className="pb-4">
							<div className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/12 bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-blue-50 backdrop-blur sm:text-[11px] sm:tracking-[0.24em]">
								<Sparkles size={14} />
								Canal oficial de devolucao Sempre Internet
							</div>

							<h1 className="mt-6 max-w-3xl text-[2.35rem] font-black leading-[0.98] tracking-[-0.05em] text-white sm:text-5xl lg:text-[64px]">
								Conclua a devolucao dos equipamentos com praticidade, orientacao
								e rastreabilidade.
							</h1>

							<p className="mt-5 max-w-2xl text-[15px] leading-7 text-blue-50/88 sm:mt-6 sm:text-lg sm:leading-8">
								A Sempre, operadora de telecomunicacoes autorizada pela Anatel,
								centraliza nesta pagina todas as etapas da devolucao. Informe
								seus dados, escolha coleta ou entrega em loja e acompanhe o
								andamento pelo protocolo gerado.
							</p>

							<div className="mt-8 grid gap-3 sm:flex sm:flex-wrap">
								<a
									href="#solicitar"
									className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-orange-500 px-6 py-3.5 text-sm font-black text-white shadow-[0_18px_42px_rgba(249,115,22,0.35)] transition hover:bg-orange-600 sm:w-auto"
								>
									Iniciar devolucao
									<ArrowRight size={16} />
								</a>
								<a
									href="#lojas"
									className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/8 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/12 sm:w-auto"
								>
									Consultar lojas
									<MapPin size={16} />
								</a>
							</div>

							<div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
								<div className="rounded-[30px] border border-white/12 bg-white/10 px-5 py-5 text-white backdrop-blur">
									<p className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-100">
										Rastreabilidade
									</p>
									<p className="mt-3 text-2xl font-black">Automatico</p>
									<p className="mt-2 text-sm leading-6 text-blue-50/76">
										Cada registro gera um protocolo para acompanhamento do
										atendimento com mais seguranca.
									</p>
								</div>
								<div className="rounded-[30px] border border-white/12 bg-white/10 px-5 py-5 text-white backdrop-blur">
									<p className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-100">
										Janela de atendimento
									</p>
									<p className="mt-3 text-2xl font-black">
										Manha, tarde ou noite
									</p>
									<p className="mt-2 text-sm leading-6 text-blue-50/76">
										Uma janela padronizada facilita a organizacao operacional e
										torna o atendimento mais previsivel.
									</p>
								</div>
								<div className="rounded-[30px] border border-white/12 bg-white/10 px-5 py-5 text-white backdrop-blur">
									<p className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-100">
										Suporte oficial
									</p>
									<p className="mt-3 text-2xl font-black">Sempre disponivel</p>
									<p className="mt-2 text-sm leading-6 text-blue-50/76">
										Comunicacao centralizada para dar andamento ao processo com
										mais clareza e agilidade.
									</p>
								</div>
							</div>
						</div>

						<div className="relative min-w-0">
							<div className="absolute inset-x-3 top-6 h-full rounded-[32px] bg-slate-950/22 blur-2xl sm:inset-x-6 sm:top-10 sm:rounded-[40px]" />
							<div className="relative overflow-hidden rounded-[30px] border border-white/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,255,255,0.92))] p-4 shadow-[0_30px_90px_rgba(6,16,37,0.26)] backdrop-blur sm:rounded-[38px] sm:p-7">
								<div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#2563eb,#60a5fa,#f97316)]" />

								<DevolucaoRequestCard
									changeMethod={changeMethod}
									error={error}
									form={form}
									handleMacImageChange={handleMacImageChange}
									handleSubmit={handleSubmit}
									macDetectedCrop={macDetectedCrop}
									macDetectionMode={macDetectionMode}
									macError={macError}
									macFeedback={macFeedback}
									macPreviewUrl={macPreviewUrl}
									macReading={macReading}
									macSectionOpen={macSectionOpen}
									selectStore={selectStore}
									selectedMethod={selectedMethod}
									selectedStore={selectedStore}
									sending={sending}
									setMacSectionOpen={setMacSectionOpen}
									success={success}
									successProtocol={successProtocol}
									updateField={updateField}
								/>
							</div>
						</div>
					</div>
				</div>
			</section>

			<section className="px-4 py-16 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-7xl">
					<SectionHeading
						eyebrow="Fluxo pronto para a operacao"
						title="Uma experiencia clara, confiavel e pronta para o atendimento."
						description="Cada etapa foi estruturada para orientar a devolucao com mais contexto, objetividade e seguranca operacional."
					/>

					<div className="mt-10 grid gap-5 lg:grid-cols-3">
						{JOURNEY_ITEMS.map((item) => (
							<JourneyCard key={item.title} item={item} />
						))}
					</div>
				</div>
			</section>

			<section className="px-4 pb-16 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-7xl rounded-[40px] border border-slate-100 bg-white px-6 py-7 shadow-[0_22px_60px_rgba(15,23,42,0.06)] sm:px-8 lg:px-10">
					<div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
						<SectionHeading
							eyebrow="Consulta de protocolo"
							title="Acompanhe o andamento da sua devolucao."
							description="Informe o protocolo para consultar o status atual, a tratativa em andamento e os proximos passos do atendimento."
						/>

						<div className="rounded-[34px] bg-[linear-gradient(180deg,#f8fbff,#fff7ef)] p-5 ring-1 ring-slate-100">
							<form onSubmit={handleProtocolSearch} className="space-y-4">
								<div>
									<label
										htmlFor={protocolInputId}
										className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-blue-700"
									>
										Consultar protocolo
									</label>
									<div className="flex flex-col gap-3 sm:flex-row">
										<div className="relative flex-1">
											<Search
												size={16}
												className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
											/>
											<input
												id={protocolInputId}
												value={protocolSearch}
												onChange={(event) => {
													setProtocolSearch(event.target.value.toUpperCase());
													setProtocolError("");
												}}
												placeholder="Ex.: RET-20260513-103010-321"
												className={inputClassName("pl-11")}
											/>
										</div>
										<button
											type="submit"
											disabled={protocolLoading}
											className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-3.5 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
										>
											{protocolLoading
												? "Consultando status..."
												: "Consultar status"}
											<ArrowRight size={16} />
										</button>
									</div>
								</div>
							</form>

							{protocolError ? (
								<div className="mt-4 rounded-[24px] border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
									{protocolError}
								</div>
							) : null}

							{protocolResult ? (
								<div className="mt-5 rounded-[28px] bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
									<div className="flex flex-wrap items-center gap-2">
										<span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
											{protocolResult.protocolo}
										</span>
										<span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
											{STATUS_LABELS[protocolResult.status] ||
												protocolResult.status ||
												"Novo"}
										</span>
										{protocolResult.tratativaTipo ? (
											<span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700">
												{TRATATIVA_LABELS[protocolResult.tratativaTipo] ||
													protocolResult.tratativaTipo}
											</span>
										) : null}
									</div>

									<div className="mt-4 grid gap-3 md:grid-cols-2">
										<div className="rounded-[22px] bg-slate-50 px-4 py-4">
											<p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
												Atendimento
											</p>
											<p className="mt-2 text-sm font-semibold text-slate-900">
												{protocolResult.nome || "Cliente Sempre"}
											</p>
											<p className="mt-1 text-sm text-slate-600">
												{protocolResult.metodo === "ponto"
													? `Entrega prevista em ${
															protocolResult.lojaSelecionadaNome ||
															"unidade de apoio"
														}`
													: "Coleta prevista no endereco informado"}
											</p>
										</div>
										<div className="rounded-[22px] bg-slate-50 px-4 py-4">
											<p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
												Ultima atualizacao
											</p>
											<p className="mt-2 text-sm font-semibold text-slate-900">
												{formatDate(
													protocolResult.tratativaAtualizadaEm ||
														protocolResult.updatedAt,
												)}
											</p>
											<p className="mt-1 text-sm text-slate-600">
												{protocolResult.responsavelNome
													? `Responsavel: ${protocolResult.responsavelNome}`
													: "Equipe local acompanhando o atendimento"}
											</p>
										</div>
									</div>

									<div className="mt-5 rounded-[24px] border border-blue-100 bg-blue-50 px-4 py-4">
										<p className="text-sm font-black text-slate-950">
											Precisa de suporte adicional?
										</p>
										<p className="mt-1 text-sm leading-6 text-slate-600">
											Se precisar complementar o atendimento, utilize um dos
											canais oficiais abaixo.
										</p>
										<div className="mt-4 flex flex-wrap gap-3">
											<a
												href={WHATSAPP_URL}
												target="_blank"
												rel="noreferrer"
												className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-5 py-3 text-sm font-black text-white transition hover:brightness-95"
											>
												<MessageCircle size={16} />
												Atendimento via WhatsApp
											</a>
											<a
												href="tel:08003000800"
												className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-blue-700 ring-1 ring-blue-100 transition hover:bg-blue-50"
											>
												<Headphones size={16} />
												Ligar para a central
											</a>
										</div>
									</div>
								</div>
							) : null}
						</div>
					</div>
				</div>
			</section>

			<section id="lojas" className="px-4 pb-16 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-7xl overflow-hidden rounded-[42px] bg-[linear-gradient(135deg,#0f172a,#103477_50%,#1d4ed8)] shadow-[0_30px_85px_rgba(15,23,42,0.18)]">
					<div className="border-b border-white/10 px-6 py-7 sm:px-8 lg:px-10">
						<div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
							<SectionHeading
								eyebrow="Mapa oficial"
								title="Encontre a unidade Sempre mais conveniente para a entrega."
								description="Consulte as lojas disponiveis, compare localizacoes e escolha o melhor ponto para concluir a devolucao."
								light
							/>

							<div className="flex flex-wrap items-center gap-3 lg:justify-end">
								<span className="rounded-full border border-white/12 bg-white/10 px-4 py-2 text-sm font-semibold text-white/88">
									{filteredStores.length} unidades disponiveis
								</span>
								<div className="relative w-full sm:w-[320px]">
									<Search
										size={16}
										className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
									/>
									<input
										value={storeSearch}
										onChange={(event) => setStoreSearch(event.target.value)}
										placeholder="Busque por cidade, bairro ou nome da unidade"
										className={inputClassName(
											"border-white/10 bg-white pl-11 text-slate-900",
										)}
									/>
								</div>
							</div>
						</div>
					</div>

					<div className="grid lg:grid-cols-[0.86fr_1.14fr]">
						<div className="border-b border-white/10 bg-white/7 p-3 backdrop-blur lg:border-b-0 lg:border-r">
							<div className="max-h-[620px] space-y-2 overflow-y-auto pr-1 [scrollbar-color:rgba(255,255,255,0.28)_transparent] [scrollbar-width:thin]">
								{filteredStores.map((store) => (
									<StoreListCard
										key={store.id}
										onClick={() =>
											selectStore(store.id, form.metodo === "ponto")
										}
										store={store}
										selected={selectedStore?.id === store.id}
									/>
								))}

								{filteredStores.length === 0 ? (
									<div className="rounded-[24px] border border-dashed border-white/16 bg-white/6 px-5 py-10 text-center text-sm text-blue-50/72">
										Nenhuma unidade encontrada para a busca informada.
									</div>
								) : null}
							</div>
						</div>

						<div className="bg-white/6 p-3 backdrop-blur">
							<div className="overflow-hidden rounded-[30px] border border-white/10 bg-white shadow-[0_22px_55px_rgba(15,23,42,0.2)]">
								<div className="grid gap-5 border-b border-slate-100 px-5 py-5 lg:grid-cols-[1fr_auto] lg:items-center">
									<div>
										<div className="flex flex-wrap items-center gap-2">
											<span className="rounded-full bg-orange-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-orange-700">
												Unidade selecionada
											</span>
											<span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
												{selectedStore?.city}
											</span>
										</div>
										<h3 className="mt-3 text-2xl font-black text-slate-950">
											{selectedStore?.name}
										</h3>
										<p className="mt-2 text-sm leading-7 text-slate-600">
											{selectedStore?.address}
										</p>
										<div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-500">
											<span>{selectedStore?.phone}</span>
											<span>{selectedStore?.hours}</span>
										</div>
									</div>

									<a
										href={
											selectedStore?.mapsUrl ||
											buildMapsOpenUrl(
												selectedStore?.mapsQuery ||
													selectedStore?.address ||
													"",
											)
										}
										target="_blank"
										rel="noreferrer"
										className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-black text-white transition hover:bg-blue-700"
									>
										Abrir localizacao
										<ArrowRight size={16} />
									</a>
								</div>

								<iframe
									title={`Mapa de ${selectedStore?.name || "loja Sempre Internet"}`}
									src={buildMapsEmbedUrl(
										selectedStore?.mapsQuery || selectedStore?.address || "",
									)}
									className="h-72 w-full border-0 sm:h-[420px] lg:h-[500px]"
									loading="lazy"
									referrerPolicy="no-referrer-when-downgrade"
								/>
							</div>
						</div>
					</div>
				</div>
			</section>

			<section className="px-4 pb-16 sm:px-6 lg:px-8">
				<div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.05fr_0.95fr]">
					<div className="rounded-[38px] border border-slate-100 bg-white px-6 py-7 shadow-[0_22px_60px_rgba(15,23,42,0.06)] sm:px-8">
						<SectionHeading
							eyebrow="Antes da retirada"
							title="Orientacoes essenciais para agilizar a devolucao."
							description="Essas informacoes ajudam a equipe a conduzir o atendimento com mais agilidade e previsibilidade."
						/>

						<div className="mt-7 grid gap-4">
							<div className="rounded-[28px] bg-slate-50 px-5 py-5">
								<div className="flex items-start gap-4">
									<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white">
										<Package size={18} />
									</div>
									<div>
										<h3 className="text-base font-black text-slate-950">
											Separe os equipamentos vinculados ao contrato
										</h3>
										<p className="mt-2 text-sm leading-7 text-slate-600">
											Em geral, a devolucao inclui modem, ONU, roteador, fonte
											de energia e acessorios entregues em comodato.
										</p>
									</div>
								</div>
							</div>

							<div className="rounded-[28px] bg-slate-50 px-5 py-5">
								<div className="flex items-start gap-4">
									<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500 text-white">
										<Clock3 size={18} />
									</div>
									<div>
										<h3 className="text-base font-black text-slate-950">
											Informe a melhor janela para atendimento
										</h3>
										<p className="mt-2 text-sm leading-7 text-slate-600">
											Manha, tarde ou noite. Essa definicao facilita a triagem e
											melhora a distribuicao da fila operacional.
										</p>
									</div>
								</div>
							</div>

							<div className="rounded-[28px] bg-slate-50 px-5 py-5">
								<div className="flex items-start gap-4">
									<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
										<Headphones size={18} />
									</div>
									<div>
										<h3 className="text-base font-black text-slate-950">
											Mantenha o protocolo em maos
										</h3>
										<p className="mt-2 text-sm leading-7 text-slate-600">
											O protocolo e a referencia principal para consulta de
											status, triagem e acompanhamento do atendimento.
										</p>
									</div>
								</div>
							</div>
						</div>
					</div>

					<div className="rounded-[38px] border border-slate-100 bg-white px-6 py-7 shadow-[0_22px_60px_rgba(15,23,42,0.06)] sm:px-8">
						<SectionHeading
							eyebrow="FAQ"
							title="Duvidas frequentes sobre o processo de devolucao."
							description="Confira respostas objetivas para as principais duvidas sobre coleta, entrega em loja e acompanhamento."
						/>

						<div className="mt-7 space-y-4">
							{FAQ_ITEMS.map((item) => (
								<FaqItem key={item.question} item={item} />
							))}
						</div>
					</div>
				</div>
			</section>

			<footer
				id="rodape-canais"
				className="relative overflow-hidden bg-[linear-gradient(135deg,#0f172a,#163d8d_48%,#1d4ed8)] px-4 pb-12 pt-12 text-white sm:px-6 lg:px-8 lg:pb-14 lg:pt-14"
			>
				<div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_22%),radial-gradient(circle_at_bottom_right,rgba(249,115,22,0.12),transparent_24%)]" />
				<div className="relative mx-auto max-w-7xl">
					<div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
						<SectionHeading
							eyebrow="Apoio ao cliente"
							title="Conte com a Sempre pelos canais oficiais de atendimento."
							description="Para suporte, financeiro ou orientacoes sobre a devolucao, utilize sempre os canais oficiais da operacao."
							light
						/>

						<div className="relative lg:justify-self-end">
							<div className="relative flex items-center gap-4">
								<div className="overflow-hidden rounded-[28px] shadow-[0_22px_60px_rgba(8,36,95,0.22)]">
									<img
										src="/retorninho-estela.webp"
										alt="Retorninho e Estela"
										className="h-28 w-auto object-contain transition duration-500 hover:scale-[1.03] sm:h-32"
									/>
								</div>
								<div className="max-w-xs">
									<p className="text-2xl font-black tracking-[-0.04em] text-white sm:text-3xl">
										Obrigado por concluir sua devolucao.
									</p>
									<p className="mt-2 text-sm leading-7 text-blue-50/80">
										Sua colaboracao contribui para uma operacao mais organizada,
										eficiente e preparada para novos atendimentos.
									</p>
								</div>
							</div>
						</div>
					</div>

					<div className="mt-8 grid gap-4 md:grid-cols-3">
						{SUPPORT_ITEMS.map((item) => (
							<div
								key={item.label}
								className="rounded-[30px] border border-white/10 bg-white/10 px-5 py-5 backdrop-blur"
							>
								<p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-100">
									{item.label}
								</p>
								<p className="mt-3 text-lg font-black text-white">
									{item.value}
								</p>
								<p className="mt-2 text-sm leading-7 text-blue-50/78">
									{item.detail}
								</p>
							</div>
						))}
					</div>

					<div className="mt-10 grid gap-8 border-t border-white/12 pt-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
						<div>
							<div className="space-y-2 text-sm leading-7 text-blue-50/80">
								<p className="max-w-2xl text-balance">
									Todos os direitos reservados. Razao Social: SEMPRE
									TELECOMUNICACOES LTDA. CNPJ: 24.605.227/0001-29.
								</p>
								<p className="max-w-2xl text-balance">
									<span className="font-semibold">&reg; 2001 - 2026</span>{" "}
									Sempre Internet e uma empresa
								</p>
							</div>

							<div className="mt-5 flex flex-wrap items-center gap-4">
								<img
									src="/brasil-tecpar-logo.png"
									alt="Brasil TecPar"
									className="h-12 w-auto shrink-0"
								/>
								<p className="max-w-xl text-sm leading-7 text-blue-50/80">
									Brasil TecPar Servicos de Telecomunicacoes SA. - CNPJ
									07.756.651/0001-55.
								</p>
							</div>
						</div>

						<div className="overflow-hidden rounded-[30px] border border-white/10 bg-white/8 p-2 backdrop-blur">
							<img
								src="/brasil-tecpar-certificacoes.svg"
								alt="Certificacoes das operacoes da Brasil TecPar"
								className="w-full rounded-[24px]"
							/>
						</div>
					</div>
				</div>
			</footer>
		</div>
	);
}
