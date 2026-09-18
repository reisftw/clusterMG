import { useCallback, useEffect, useRef, useState } from "react";
import {
	copiarRelatorioParaClipboard,
	gerarRelatorioHtml,
} from "../services/clipboardService";

export const useClipboard = () => {
	const [copiado, setCopiado] = useState(false);
	const [erro, setErro] = useState(null);
	const timerRef = useRef(null);

	useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, []);

	const copiar = useCallback(async (dados, incluir) => {
		setErro(null);
		try {
			const html = gerarRelatorioHtml({ ...dados, incluir });
			await copiarRelatorioParaClipboard(html);
			setCopiado(true);
			if (timerRef.current) clearTimeout(timerRef.current);
			timerRef.current = setTimeout(() => setCopiado(false), 3000);
		} catch {
			setErro("Erro ao copiar relatorio.");
		}
	}, []);

	return { copiar, copiado, erro };
};
