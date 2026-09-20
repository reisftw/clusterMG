import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { obterIndiceMes } from "../../../utils/mes";

const MetasResumoMensalStatusBadge = ({ pct, metaSazonal = 80, mes }) => {
	const percentual = Number.parseFloat(pct);
	const mesAtualIdx = new Date().getMonth();
	const mesIdx = obterIndiceMes(mes);
	const mesEncerrado = mesIdx >= 0 && mesIdx < mesAtualIdx;

	if (percentual >= metaSazonal) {
		return (
			<span className="flex w-fit items-center gap-1 rounded-lg border border-green-100 bg-green-50 px-2 py-0.5 text-xs font-bold text-green-700">
				<TrendingUp size={11} /> Atingido
			</span>
		);
	}

	if (mesEncerrado) {
		return (
			<span className="flex w-fit items-center gap-1 rounded-lg border border-red-100 bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600">
				<TrendingDown size={11} /> Nao atingido
			</span>
		);
	}

	if (percentual >= 60) {
		return (
			<span className="flex w-fit items-center gap-1 rounded-lg border border-amber-100 bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-600">
				<Minus size={11} /> Em andamento
			</span>
		);
	}

	return (
		<span className="flex w-fit items-center gap-1 rounded-lg border border-red-100 bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600">
			<TrendingDown size={11} /> Abaixo
		</span>
	);
};

export default MetasResumoMensalStatusBadge;
