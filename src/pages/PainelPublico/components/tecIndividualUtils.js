import {
	diasUteisDoMes,
	diasUteisRestantesNoMes,
} from "../../../utils/diaUtil";

const MONTHS = [
	"Janeiro",
	"Fevereiro",
	"Março",
	"Abril",
	"Maio",
	"Junho",
	"Julho",
	"Agosto",
	"Setembro",
	"Outubro",
	"Novembro",
	"Dezembro",
];

const normalizeMonthName = (value) =>
	String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim();

export function getMonthContext(
	month,
	{
		feriadosSet = new Set(),
		lastDayWithData = 0,
		year = new Date().getFullYear(),
		now = new Date(),
	} = {},
) {
	const currentMonthIndex = now.getMonth();
	const selectedMonthIndex = MONTHS.findIndex(
		(item) => normalizeMonthName(item) === normalizeMonthName(month),
	);

	if (selectedMonthIndex < 0) {
		return {
			isCurrentMonth: false,
			isPastMonth: false,
			isFutureMonth: false,
			daysRemaining: 0,
		};
	}

	if (selectedMonthIndex === currentMonthIndex) {
		return {
			isCurrentMonth: true,
			isPastMonth: false,
			isFutureMonth: false,
			daysRemaining: diasUteisRestantesNoMes(
				month,
				feriadosSet,
				lastDayWithData,
				year,
			),
		};
	}

	if (selectedMonthIndex < currentMonthIndex) {
		return {
			isCurrentMonth: false,
			isPastMonth: true,
			isFutureMonth: false,
			daysRemaining: 0,
		};
	}

	return {
		isCurrentMonth: false,
		isPastMonth: false,
		isFutureMonth: true,
		daysRemaining: diasUteisDoMes(month, feriadosSet, year),
	};
}
