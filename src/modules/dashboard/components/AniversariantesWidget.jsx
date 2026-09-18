import { Cake } from "lucide-react";
import { useMemo } from "react";
import { useColaboradores } from "../../colaboradores/hooks/useColaboradores";

const parseLocalDate = (str) => {
	if (!str) return null;
	const [ano, mes, dia] = str.split("-").map(Number);
	return new Date(ano, mes - 1, dia);
};

const calcProximoAniversario = (dataNasc) => {
	const nasc = parseLocalDate(dataNasc);
	if (!nasc) return null;
	const hoje = new Date();
	hoje.setHours(0, 0, 0, 0);
	const anoAtual = hoje.getFullYear();
	const aniv = new Date(anoAtual, nasc.getMonth(), nasc.getDate());
	if (aniv < hoje) aniv.setFullYear(anoAtual + 1);
	const diffDias = Math.ceil((aniv - hoje) / (1000 * 60 * 60 * 24));
	return { aniv, diffDias };
};

const formatarData = (d) =>
	d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });

const AniversariantesWidget = () => {
	const { colaboradores } = useColaboradores();

	const lista = useMemo(() => {
		return colaboradores
			.filter(
				(c) =>
					(c.status === "Ativo" || c.status === "Em Experiencia") &&
					c.data_nascimento,
			)
			.map((c) => {
				const resultado = calcProximoAniversario(c.data_nascimento);
				if (!resultado) return null;
				return { ...c, aniv: resultado.aniv, diffDias: resultado.diffDias };
			})
			.filter(Boolean)
			.sort((a, b) => a.diffDias - b.diffDias)
			.slice(0, 5);
	}, [colaboradores]);

	const proximo = lista[0];

	if (!lista.length) {
		return (
			<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center justify-center h-48">
				<p className="text-sm text-gray-400">
					Nenhum colaborador com data de nascimento cadastrada.
				</p>
			</div>
		);
	}

	return (
		<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col">
			{/* Header */}
			<div className="flex items-center gap-2 mb-4">
				<div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
					<Cake size={16} className="text-orange-500" />
				</div>
				<p className="text-sm font-bold text-gray-900">Aniversariantes</p>
			</div>

			{/* Destaque proximo */}
			{proximo && (
				<div className="bg-gradient-to-r from-orange-50 to-orange-100 border border-orange-100 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
					<div>
						<p className="text-sm font-bold text-orange-700">
							🎂 {proximo.nome.split(" ").slice(0, 2).join(" ")}
						</p>
						<p className="text-xs text-orange-500 mt-0.5">{proximo.cargo}</p>
					</div>
					<div className="text-right">
						<p className="text-xs font-semibold text-orange-600">
							{formatarData(proximo.aniv)}
						</p>
						<p className="text-xs text-orange-400 mt-0.5">
							{proximo.diffDias === 0
								? "🎉 Hoje!"
								: `em ${proximo.diffDias} dias`}
						</p>
					</div>
				</div>
			)}

			{/* Lista */}
			<ul className="space-y-2">
				{lista.slice(1).map((c) => (
					<li
						key={c.id}
						className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
					>
						<div className="flex items-center gap-2">
							<div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-blue-500 flex items-center justify-center shrink-0">
								<span className="text-white text-[10px] font-bold">
									{c.nome.charAt(0).toUpperCase()}
								</span>
							</div>
							<div>
								<p className="text-xs font-semibold text-gray-800">
									{c.nome.split(" ").slice(0, 2).join(" ")}
								</p>
								<p className="text-[10px] text-gray-400">{c.cargo}</p>
							</div>
						</div>
						<div className="text-right">
							<p className="text-xs text-gray-600 font-medium">
								{formatarData(c.aniv)}
							</p>
							{c.diffDias > 0 && c.diffDias <= 7 ? (
								<span className="text-[10px] bg-orange-100 text-orange-600 font-semibold px-1.5 py-0.5 rounded-md">
									esta semana
								</span>
							) : (
								<span className="text-[10px] text-gray-400">
									{c.diffDias} dias
								</span>
							)}
						</div>
					</li>
				))}
			</ul>
		</div>
	);
};

export default AniversariantesWidget;
