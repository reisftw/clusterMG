import { useEffect, useMemo, useState } from "react";
import {
	buildDiarioBoardData,
	localDateKey,
	subscribeDiarioEntriesByMonth,
} from "../services/diarioService";

export function useDiarioEntries(referenceDateKey = localDateKey()) {
	const [state, setState] = useState({
		entries: [],
		error: "",
		loading: true,
		referenceDateKey,
	});

	useEffect(() => {
		return subscribeDiarioEntriesByMonth(
			referenceDateKey,
			(items) => {
				setState({
					entries: items,
					error: "",
					loading: false,
					referenceDateKey,
				});
			},
			() => {
				setState((current) => ({
					...current,
					error: "Nao foi possivel carregar o diario.",
					loading: false,
					referenceDateKey,
				}));
			},
		);
	}, [referenceDateKey]);

	const entries = state.entries;
	const loading =
		state.referenceDateKey === referenceDateKey ? state.loading : true;
	const error = state.referenceDateKey === referenceDateKey ? state.error : "";

	const boardData = useMemo(
		() => buildDiarioBoardData(entries, referenceDateKey),
		[entries, referenceDateKey],
	);

	return { entries, boardData, loading, error };
}
