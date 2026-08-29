const STATUS_STYLES = {
	pendente:
		"bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
	aprovado:
		"bg-green-100  text-green-700  dark:bg-green-900/30  dark:text-green-400",
	reprovado:
		"bg-red-100    text-red-700    dark:bg-red-900/30    dark:text-red-400",
};

const STATUS_LABEL = {
	pendente: "Pendente",
	aprovado: "Aprovado",
	reprovado: "Reprovado",
};

const FeriasStatusBadge = ({ status }) => (
	<span
		className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[status] ?? ""}`}
	>
		{STATUS_LABEL[status] ?? status}
	</span>
);

export default FeriasStatusBadge;
