import { useEffect, useState } from "react";
import { seedAll } from "./seedAll";

const SeedTrigger = () => {
	const [status, setStatus] = useState("Executando seed...");

	useEffect(() => {
		seedAll()
			.then(() => setStatus("✅ Seed concluido! Remova o <SeedTrigger />."))
			.catch((e) => setStatus("❌ Erro: " + e.message));
	}, []);

	return (
		<div className="fixed bottom-4 right-4 z-50 bg-gray-900 text-white text-xs px-4 py-3 rounded-xl shadow-xl max-w-xs">
			<p className="font-bold mb-1">Seed Regionais</p>
			<p>{status}</p>
		</div>
	);
};

export default SeedTrigger;
