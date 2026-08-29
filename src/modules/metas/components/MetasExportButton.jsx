import { FileText } from "lucide-react";
import { exportRelatorioMensal } from "../services/pdfService";

const MetasExportButton = ({ dadosMes }) => {
	const handleExport = () => {
		if (Object.keys(dadosMes).length === 0) {
			alert("⚠️ Carregue os dados primeiro!");
			return;
		}
		exportRelatorioMensal(dadosMes);
	};

	return (
		<button
			onClick={handleExport}
			className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-xl font-medium hover:bg-blue-700 shadow-sm transition-all"
			title="Exportar relatorio CSV"
		>
			<FileText size={14} />
			CSV
		</button>
	);
};

export default MetasExportButton;
