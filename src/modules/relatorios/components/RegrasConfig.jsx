import { useEffect, useState } from "react";
import RetorninhoLoader from "../../../components/ui/RetorninhoLoader";
import {
	buscarRegrasAtivas,
	criarRegraMetaRisco,
	toggleRegra,
} from "../services/regrasService";

const RegrasConfig = () => {
	const [regras, setRegras] = useState([]);
	const [loading, setLoading] = useState(true);
	const [riscoMeta, setRiscoMeta] = useState(0);

	useEffect(() => {
		carregarRegras();
	}, []);

	const carregarRegras = async () => {
		try {
			const data = await buscarRegrasAtivas();
			setRegras(data.regras || []);
			setRiscoMeta(data.riscoMeta || 0);
		} catch (error) {
			console.error("Erro:", error);
		} finally {
			setLoading(false);
		}
	};

	const handleToggle = async (id) => {
		try {
			await toggleRegra(id);
			carregarRegras();
		} catch (error) {
			console.error("Erro:", error);
		}
	};

	const handleRiscoChange = (e) => {
		const valor = Number.parseInt(e.target.value);
		setRiscoMeta(valor);
	};

	const salvarRiscoMeta = async () => {
		try {
			await criarRegraMetaRisco(riscoMeta);
			alert("Meta de risco salva!");
		} catch (error) {
			console.error("Erro:", error);
		}
	};

	if (loading) {
		return (
			<RetorninhoLoader
				card
				compact
				title="Carregando regras..."
				description="O Retorninho esta conferindo as configuracoes."
			/>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h2 className="text-xl font-bold text-gray-900">Regras Ativas</h2>
			</div>

			{/* Meta de Risco */}
			<div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
				<label className="block text-sm font-medium text-gray-700 mb-3">
					Meta de Risco (%)
				</label>
				<div className="flex items-center gap-4">
					<input
						type="range"
						min="0"
						max="20"
						step="1"
						value={riscoMeta}
						onChange={handleRiscoChange}
						className="w-64 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600 hover:accent-blue-500"
					/>
					<span className="font-mono font-bold text-lg text-blue-600">
						{riscoMeta}%
					</span>
					<button
						onClick={salvarRiscoMeta}
						className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-xl font-medium hover:bg-blue-700 ml-auto"
					>
						Salvar
					</button>
				</div>
			</div>

			{/* Lista de Regras */}
			<div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
				{regras.length === 0 ? (
					<div className="p-12 text-center">
						<div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
							⚙️
						</div>
						<p className="text-gray-500 font-medium">Nenhuma regra ativa</p>
					</div>
				) : (
					<div className="divide-y divide-gray-100">
						{regras.map((regra) => (
							<div key={regra.id} className="p-6 hover:bg-gray-50">
								<div className="flex items-center justify-between">
									<div>
										<h3 className="font-semibold text-gray-900">
											{regra.nome}
										</h3>
										<p className="text-sm text-gray-500">{regra.descricao}</p>
									</div>
									<button
										onClick={() => handleToggle(regra.id)}
										className={`w-11 h-6 rounded-full transition-all relative ${
											regra.ativa ? "bg-green-600 shadow-sm" : "bg-gray-200"
										}`}
									>
										<span
											className={`block w-5 h-5 bg-white rounded-full shadow-sm absolute top-0.5 transition-transform ${
												regra.ativa ? "translate-x-5" : "translate-x-0.5"
											}`}
										/>
									</button>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
};

export default RegrasConfig;
