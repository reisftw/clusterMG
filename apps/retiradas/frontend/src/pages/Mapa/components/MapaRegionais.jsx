import {
	AlertTriangle,
	Check,
	ChevronDown,
	ChevronUp,
	Copy,
	MapPin,
} from "lucide-react";
import React, { useState } from "react";
import { agruparPorRegional, totalCidade } from "../utils/mapaUtils";
import { formatarRegionalWhatsapp } from "../utils/mapaWhatsapp";
import MapaCidadeDrawer from "./MapaCidadeDrawer";

function getHeatColor(total, max) {
	if (max === 0) return "#f3f4f6";
	const r = total / max;
	if (r >= 0.75) return "#fee2e2";
	if (r >= 0.5) return "#ffedd5";
	if (r >= 0.25) return "#fef9c3";
	return "#f0fdf4";
}
function getHeatBorder(total, max) {
	if (max === 0) return "#e5e7eb";
	const r = total / max;
	if (r >= 0.75) return "#fca5a5";
	if (r >= 0.5) return "#fdba74";
	if (r >= 0.25) return "#fde047";
	return "#86efac";
}

function TipoBadge({ tipo, qtd, status }) {
	return (
		<span
			className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${
				status === "pendente"
					? "bg-purple-50 text-purple-700 border-purple-200"
					: "bg-orange-50 text-orange-700 border-orange-200"
			}`}
		>
			{tipo}: {qtd}
		</span>
	);
}

function CidadeRow({ cidade, data, maxTotal, alertaThreshold, onDrillDown }) {
	const total = totalCidade(data);
	const isAlerta = alertaThreshold > 0 && total >= alertaThreshold;
	return (
		<div
			className="border-b border-gray-100 last:border-0 px-5 py-3 flex flex-col gap-2 cursor-pointer hover:brightness-95 transition-all"
			style={{ background: getHeatColor(total, maxTotal) }}
			onClick={() => onDrillDown(cidade, data)}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onDrillDown(cidade, data);
				}
			}}
			role="button"
			tabIndex={0}
		>
			<div className="flex justify-between items-center">
				<div className="flex items-center gap-2">
					<span className="text-sm font-semibold text-gray-700">{cidade}</span>
					{isAlerta && (
						<span className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
							<AlertTriangle size={10} /> Critico
						</span>
					)}
				</div>
				<span
					className="text-sm font-bold px-2 py-0.5 rounded-lg border"
					style={{
						borderColor: getHeatBorder(total, maxTotal),
						color: "#374151",
					}}
				>
					{total} O.S
				</span>
			</div>
			<div className="flex gap-1.5 flex-wrap">
				{Object.entries(data.pendente || {}).map(([t, q]) => (
					<TipoBadge key={`p-${t}`} tipo={t} qtd={q} status="pendente" />
				))}
				{Object.entries(data.aguardando || {}).map(([t, q]) => (
					<TipoBadge key={`a-${t}`} tipo={t} qtd={q} status="aguardando" />
				))}
			</div>
		</div>
	);
}

function RegionalCard({ regional, cidades, alertaThreshold, onDrillDown }) {
	const [aberto, setAberto] = useState(false);
	const [copiado, setCopiado] = useState(false);
	const cidadesOrdenadas = Object.entries(cidades).sort(
		(a, b) => totalCidade(b[1]) - totalCidade(a[1]),
	);
	const totalRegional = cidadesOrdenadas.reduce(
		(acc, [, d]) => acc + totalCidade(d),
		0,
	);
	const maxTotal = totalCidade(cidadesOrdenadas[0]?.[1] || {});

	return (
		<div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm mb-4">
			<div
				onClick={() => setAberto(!aberto)}
				onKeyDown={(event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						setAberto(!aberto);
					}
				}}
				role="button"
				tabIndex={0}
				className="flex justify-between items-center px-5 py-4 cursor-pointer hover:bg-gray-50 transition-all"
			>
				<div className="flex items-center gap-2">
					<MapPin size={16} className="text-blue-500" />
					<span className="text-sm font-bold text-gray-800">{regional}</span>
					<span className="bg-blue-50 text-blue-600 text-xs font-semibold px-2 py-0.5 rounded-full border border-blue-100">
						{cidadesOrdenadas.length} cidades
					</span>
				</div>
				<div className="flex items-center gap-3">
					<span className="text-base font-extrabold text-gray-900">
						{totalRegional} O.S
					</span>
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							navigator.clipboard.writeText(
								formatarRegionalWhatsapp(regional, cidades),
							);
							setCopiado(true);
							setTimeout(() => setCopiado(false), 2000);
						}}
						className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg transition-all ${copiado ? "bg-green-50 text-green-600 border border-green-200" : "bg-gray-100 text-gray-500 border border-gray-200 hover:bg-green-50 hover:text-green-600 hover:border-green-200"}`}
					>
						{copiado ? <Check size={12} /> : <Copy size={12} />}
						{copiado ? "Copiado!" : "Copiar"}
					</button>
					{aberto ? (
						<ChevronUp size={16} className="text-gray-400" />
					) : (
						<ChevronDown size={16} className="text-gray-400" />
					)}
				</div>
			</div>
			{aberto && (
				<div className="border-t border-gray-100">
					{cidadesOrdenadas.map(([cidade, data]) => (
						<CidadeRow
							key={cidade}
							cidade={cidade}
							data={data}
							maxTotal={maxTotal}
							alertaThreshold={alertaThreshold}
							onDrillDown={onDrillDown}
						/>
					))}
				</div>
			)}
		</div>
	);
}

export default function MapaRegionais({
	ordens = [],
	alertaThreshold,
	dataOverride = null,
}) {
	const [drawer, setDrawer] = useState(null);
	const agrupado = dataOverride || agruparPorRegional(ordens);
	const regionaisOrdenadas = Object.entries(agrupado).sort((a, b) => {
		return (
			Object.values(b[1]).reduce((s, d) => s + totalCidade(d), 0) -
			Object.values(a[1]).reduce((s, d) => s + totalCidade(d), 0)
		);
	});

	return (
		<div>
			<h3 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">
				📡 Regionais
			</h3>
			{regionaisOrdenadas.map(([regional, cidades]) => (
				<RegionalCard
					key={regional}
					regional={regional}
					cidades={cidades}
					alertaThreshold={alertaThreshold}
					onDrillDown={(cidade, data) =>
						setDrawer({ cidade, data, tipo: "regional" })
					}
				/>
			))}
			{regionaisOrdenadas.length === 0 && (
				<p className="text-gray-400 text-sm text-center py-10">
					Nenhuma O.S de regional encontrada
				</p>
			)}
			{drawer && (
				<MapaCidadeDrawer {...drawer} onClose={() => setDrawer(null)} />
			)}
		</div>
	);
}
