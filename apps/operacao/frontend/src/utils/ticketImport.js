import { read, utils } from "xlsx";

// Porta fiel de rot/src/utils/ticketImport.ts (importador de chamados
// via planilha do Operação legado) — mesmo algoritmo de reconhecimento de
// tecnico/tipo de servico/numero de ticket, adaptado de TS pra JS e das
// entidades Firestore (CityDocument/RegionalDocument/...) pros objetos
// que a API nova ja devolve (regionals/serviceTypes/technicians com
// id/name). cityId nunca e preenchido pelo parser tambem no legado
// (fica sempre "") — mantido assim por fidelidade, o campo existe no
// schema mas a planilha nao informa cidade por linha.
const MONTH_SHEET_PATTERN =
	/^(JANEIRO|FEVEREIRO|MARCO|MARÇO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\s?\d{4}$/i;

export function normalizeTicketText(value) {
	return (value || "")
		.toString()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim();
}

export function extractTicketNumber(rawValue) {
	const rawText = String(rawValue || "").trim();
	if (!rawText) return "";
	const match = rawText.match(/ticket#?\s*([0-9]+)/i);
	if (match?.[1]) return match[1];
	return rawText.split("—")[0].split("-")[0].replace(/ticket#?/i, "").trim();
}

export function normalizeTicketKey(rawValue) {
	const extracted = extractTicketNumber(rawValue);
	if (extracted) return extracted.replace(/\D/g, "");
	return normalizeTicketText(rawValue).replace(/\s+/g, "");
}

function excelDateToIso(value) {
	if (!value) return "";
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		const year = value.getFullYear();
		const month = String(value.getMonth() + 1).padStart(2, "0");
		const day = String(value.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}
	if (typeof value === "number") {
		const excelEpoch = new Date(Date.UTC(1899, 11, 30));
		return excelDateToIso(new Date(excelEpoch.getTime() + value * 86400000));
	}
	const rawText = String(value).trim();
	const ddmmyyyy = rawText.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
	if (ddmmyyyy) {
		const [, day, month, year] = ddmmyyyy;
		return `${year}-${month}-${day}`;
	}
	const parsedDate = new Date(rawText);
	if (!Number.isNaN(parsedDate.getTime())) return excelDateToIso(parsedDate);
	return "";
}

function matchServiceTypeId(rawServiceLabel, rawPoints, serviceTypes) {
	const normalizedLabel = normalizeTicketText(rawServiceLabel);
	if (!normalizedLabel) return "";

	const exact = serviceTypes.find((st) => normalizeTicketText(st.name) === normalizedLabel);
	if (exact) return exact.id;

	const contains = serviceTypes.find((st) => {
		const normalizedName = normalizeTicketText(st.name);
		return normalizedName.includes(normalizedLabel) || normalizedLabel.includes(normalizedName);
	});
	if (contains) return contains.id;

	const points = typeof rawPoints === "number" ? rawPoints : Number(String(rawPoints || "").replace(",", "."));
	if (!Number.isNaN(points)) {
		const byPoints = serviceTypes.filter((st) => Number(st.points) === points);
		if (byPoints.length === 1) return byPoints[0].id;
	}
	return "";
}

function buildTechnicianSearchKeys(value) {
	const normalizedValue = normalizeTicketText(value);
	if (!normalizedValue) return [];
	const tokens = normalizedValue.split(" ").filter(Boolean);
	const keys = new Set([normalizedValue]);
	if (tokens.length >= 2) keys.add(`${tokens[0]} ${tokens[tokens.length - 1]}`);
	if (tokens.length >= 1) keys.add(tokens[0]);
	return Array.from(keys);
}

function matchTechnician(rawTechnicianName, usersList) {
	const normalizedRaw = normalizeTicketText(rawTechnicianName);
	if (!normalizedRaw) return null;

	const rawTokens = normalizedRaw.split(" ").filter(Boolean);
	const rawFirstToken = rawTokens[0] || "";

	let bestUser = null;
	let bestScore = -1;

	for (const user of usersList) {
		const normalizedUserName = normalizeTicketText(user.name);
		const userTokens = normalizedUserName.split(" ").filter(Boolean);
		const userFirstToken = userTokens[0] || "";
		let score = 0;

		if (normalizedUserName === normalizedRaw) score += 100;
		if (normalizedUserName.includes(normalizedRaw) || normalizedRaw.includes(normalizedUserName)) score += 60;
		if (rawFirstToken && userFirstToken === rawFirstToken) score += 35;
		score += rawTokens.filter((token) => userTokens.includes(token)).length * 12;
		if (rawTokens.length >= 2) {
			const firstAndLast = `${rawTokens[0]} ${rawTokens[rawTokens.length - 1]}`;
			if (normalizedUserName.includes(firstAndLast)) score += 25;
		}

		if (score > bestScore) {
			bestScore = score;
			bestUser = user;
		}
	}

	return bestScore >= 35 ? bestUser : null;
}

// Le o workbook, acha as abas de mes/ano (padrao "SETEMBRO2026" etc, sem
// depender de um ano fixo — construido a partir do que existe DE FATO
// na planilha enviada), e devolve as linhas ja "casadas" com
// regional/tipo de servico/tecnicos conhecidos + os problemas achados
// em cada linha (pra o usuario corrigir manualmente antes de enviar).
export function listTicketImportSheets(arrayBuffer) {
	const workbook = read(arrayBuffer, { type: "array", cellDates: true });
	return workbook.SheetNames.filter((name) => MONTH_SHEET_PATTERN.test(name));
}

export function parseTicketWorkbook({ arrayBuffer, existingTickets, regionals, selectedSheetName, serviceTypes, usersList }) {
	const workbook = read(arrayBuffer, { type: "array", cellDates: true });
	const existingKeys = new Set((existingTickets || []).map((ticket) => normalizeTicketKey(ticket.ticketNumber)));
	const normalizedUsers = new Map();
	for (const user of usersList) {
		for (const key of buildTechnicianSearchKeys(user.name)) {
			if (!normalizedUsers.has(key)) normalizedUsers.set(key, user);
		}
	}
	const validRegionalIds = new Set(regionals.map((r) => r.id));
	const rows = [];
	const duplicateTickets = [];

	const targetSheetNames = selectedSheetName
		? workbook.SheetNames.filter((name) => name.toUpperCase() === selectedSheetName.toUpperCase())
		: workbook.SheetNames.filter((name) => MONTH_SHEET_PATTERN.test(name));

	for (const sheetName of targetSheetNames) {
		const worksheet = workbook.Sheets[sheetName];
		const sheetRows = utils.sheet_to_json(worksheet, { header: 1, raw: true });

		sheetRows.slice(1).forEach((columns, index) => {
			const rawTicketLabel = String(columns[0] || "").trim();
			if (!rawTicketLabel) return;

			const ticketNumber = extractTicketNumber(rawTicketLabel);
			const ticketKey = normalizeTicketKey(rawTicketLabel);

			if (ticketKey && existingKeys.has(ticketKey)) {
				duplicateTickets.push(ticketNumber || rawTicketLabel);
				return;
			}

			const date = excelDateToIso(columns[1]);
			const rawServiceLabel = String(columns[2] || "").trim();
			const serviceTypeId = matchServiceTypeId(rawServiceLabel, columns[3], serviceTypes);

			const technicianNames = [columns[4], columns[5], columns[6], columns[7]]
				.map((value) => String(value || "").trim())
				.filter(Boolean);

			const matchedUsers = technicianNames
				.map((name) => normalizedUsers.get(normalizeTicketText(name)) || matchTechnician(name, usersList))
				.filter(Boolean);

			const teamIds = Array.from(new Set(matchedUsers.map((u) => u.id).filter(Boolean)));
			const regionalId = matchedUsers.map((u) => u.regionalId || "").find((id) => validRegionalIds.has(id)) || "";

			const issues = [];
			if (!ticketNumber) issues.push("Ticket sem número identificado");
			if (!date) issues.push("Data inválida");
			if (!serviceTypeId) issues.push("Tipo de serviço não reconhecido");
			if (teamIds.length === 0) issues.push("Nenhum técnico reconhecido");
			if (!regionalId) issues.push("Regional não identificada");

			rows.push({
				cityId: "",
				date,
				issues,
				originalRowNumber: index + 2,
				rawServiceLabel,
				rawTicketLabel,
				regionalId,
				serviceTypeId,
				sheetName,
				teamIds,
				technicianNames,
				ticketKey,
				ticketNumber,
			});
		});
	}

	return {
		duplicateCount: duplicateTickets.length,
		duplicateTickets: duplicateTickets.slice(0, 20),
		processedSheets: targetSheetNames,
		rows,
		selectedSheetMissing: Boolean(selectedSheetName) && targetSheetNames.length === 0,
	};
}
