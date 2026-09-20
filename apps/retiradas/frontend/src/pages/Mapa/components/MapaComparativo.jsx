import {
	ChevronDown,
	ChevronUp,
	Minus,
	TrendingDown,
	TrendingUp,
} from "lucide-react";
import React, { useState } from "react";

// Extraido pra achado javascript:S3358 (ternario aninhado).
function resolveDiffRowClass(diff) {
	if (diff > 0) return "bg-red-50/30";
	return diff < 0 ? "bg-green-50/30" : "";
}

function DiffBadge({ diff }) {
	if (diff > 0)
		return (
			<span className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
				<TrendingUp size={11} /> +{diff}
			</span>
		);
	if (diff < 0)
		return (
			<span className="flex items-center gap-1 text-xs font-bold text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
				<TrendingDown size={11} /> {diff}
			</span>
		);
	return (
		<span className="flex items-center gap-1 text-xs font-bold text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
			<Minus size={11} /> 0
		</span>
	);
}

export default function MapaComparativo({ comparativo }) {
	const [aberto, setAberto] = useState(true);
	if (!comparativo?.length) return null;

	const aumentaram = comparativo.filter((r) => r.diff > 0).length;
	const diminuiram = comparativo.filter((r) => r.diff < 0).length;
	const semAlteracao = comparativo.filter((r) => r.diff === 0).length;

	return (
		<div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
			<div
				className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 transition-all"
				onClick={() => setAberto(!aberto)}
				onKeyDown={(event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						setAberto(!aberto);
					}
				}}
				role="button"
				tabIndex={0}
			>
				<div className="flex items-center gap-3">
					<span className="text-base">📊</span>
					<div>
						<h3 className="text-sm font-bold text-gray-800">
							Comparativo com Upload Anterior
						</h3>
						<p className="text-xs text-gray-400 mt-0.5">
							<span className="text-red-500 font-semibold">
								↑ {aumentaram} regionais aumentaram
							</span>
							{" · "}
							<span className="text-green-500 font-semibold">
								↓ {diminuiram} diminuiram
							</span>
							{" · "}
							<span className="text-gray-400">
								{semAlteracao} sem alteracao
							</span>
						</p>
					</div>
				</div>
				{aberto ? (
					<ChevronUp size={16} className="text-gray-400" />
				) : (
					<ChevronDown size={16} className="text-gray-400" />
				)}
			</div>

			{aberto && (
				<div className="border-t border-gray-100">
					<div className="grid grid-cols-4 gap-2 px-5 py-2 bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wide">
						<span>Regional</span>
						<span className="text-center">Anterior</span>
						<span className="text-center">Atual</span>
						<span className="text-center">Diff</span>
					</div>
					{comparativo.map(({ regional, anterior, atual, diff }) => (
						<div
							key={regional}
							className={`grid grid-cols-4 gap-2 px-5 py-3 border-b border-gray-50 last:border-0 items-center ${resolveDiffRowClass(diff)}`}
						>
							<span className="text-sm font-semibold text-gray-700 truncate">
								{regional}
							</span>
							<span className="text-sm text-center text-gray-400 font-medium">
								{anterior}
							</span>
							<span className="text-sm text-center font-bold text-gray-900">
								{atual}
							</span>
							<div className="flex justify-center">
								<DiffBadge diff={diff} />
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
