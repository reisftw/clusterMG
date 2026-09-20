import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { normalizeWorksheetRows } from "../utils/ferramentasTabUtils";

export function useFerramentasTabData({
	pickWorksheet = (workbook) => workbook.Sheets[workbook.SheetNames[0]],
	transformRows = (rows) => rows,
	onLoaded,
} = {}) {
	const [status, setStatus] = useState(null);
	const [rows, setRows] = useState([]);
	const [fname, setFname] = useState("");
	const inputRef = useRef();

	const load = (event) => {
		const file = event.target.files[0];
		if (!file) return;
		setFname(file.name);
		setStatus("loading");

		const reader = new FileReader();
		reader.onload = (ev) => {
			try {
				const workbook = XLSX.read(ev.target.result, { type: "array" });
				const worksheet = pickWorksheet(workbook);
				const normalizedRows = normalizeWorksheetRows(
					XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: "" }),
				);
				const nextRows = transformRows(normalizedRows);
				setRows(nextRows);
				onLoaded?.(nextRows);
				setStatus("ok");
			} catch (error) {
				console.error(error);
				setRows([]);
				setStatus("err");
			}
		};
		reader.readAsArrayBuffer(file);
	};

	return {
		status,
		setStatus,
		rows,
		setRows,
		fname,
		inputRef,
		load,
	};
}
