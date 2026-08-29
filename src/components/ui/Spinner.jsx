import RetorninhoLoader from "./RetorninhoLoader";

const Spinner = ({ fullScreen = false }) => {
	if (fullScreen) {
		return (
			<RetorninhoLoader
				fullScreen
				title="Carregando..."
				description="O Retorninho está preparando tudo para você."
				size="lg"
			/>
		);
	}

	return <RetorninhoLoader compact title="" size="sm" />;
};

export default Spinner;
