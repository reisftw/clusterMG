// Feriados nacionais: calculados LOCALMENTE (sem depender de rede — ver
// computeNationalHolidaysForYear), porque a sincronizacao via BrasilAPI
// sozinha se mostrou nao-confiavel em producao (a VPS pode nao ter saida
// de internet pra brasilapi.com.br, ou o firewall bloquear so aquele
// dominio) e isso e uma peca CRITICA do calculo de dia util (regra "todo
// N-esimo dia util do mes"), entao nao pode depender de terceiro externo
// pra funcionar corretamente. As datas moveis (Carnaval, Sexta-feira
// Santa, Corpus Christi) sao derivadas da Pascoa via o algoritmo
// Anonymous Gregorian/Meeus-Jones-Butcher — validado contra os dados
// reais da BrasilAPI pra 2026/2027 antes de entrar em producao.
//
// Feriados municipais continuam 100% cadastro manual (nao tem API
// nacional pra isso).
const db = require("../db");
const { randomId } = require("../secureRandom");

function pad2(value) {
	return String(value).padStart(2, "0");
}

function toDateKey(date) {
	return [date.getFullYear(), pad2(date.getMonth() + 1), pad2(date.getDate())].join("-");
}

function addDays(date, days) {
	const next = new Date(date);
	next.setDate(next.getDate() + days);
	return next;
}

/** Domingo de Pascoa de um ano (calendario gregoriano) — algoritmo Anonymous Gregorian/Meeus-Jones-Butcher. */
function easterSunday(year) {
	const a = year % 19;
	const b = Math.floor(year / 100);
	const c = year % 100;
	const d = Math.floor(b / 4);
	const e = b % 4;
	const f = Math.floor((b + 8) / 25);
	const g = Math.floor((b - f + 1) / 3);
	const h = (19 * a + b - d - g + 15) % 30;
	const i = Math.floor(c / 4);
	const k = c % 4;
	const l = (32 + 2 * e + 2 * i - h - k) % 7;
	const m = Math.floor((a + 11 * h + 22 * l) / 451);
	const month = Math.floor((h + l - 7 * m + 114) / 31);
	const day = ((h + l - 7 * m + 114) % 31) + 1;
	return new Date(year, month - 1, day);
}

/** Feriados nacionais oficiais do Brasil pra um ano — sem chamada de rede, sempre disponivel. */
function computeNationalHolidaysForYear(year) {
	const easter = easterSunday(year);
	const fixed = [
		[`${year}-01-01`, "Confraternização Universal"],
		[`${year}-04-21`, "Tiradentes"],
		[`${year}-05-01`, "Dia do Trabalho"],
		[`${year}-09-07`, "Independência do Brasil"],
		[`${year}-10-12`, "Nossa Senhora Aparecida"],
		[`${year}-11-02`, "Finados"],
		[`${year}-11-15`, "Proclamação da República"],
		[`${year}-11-20`, "Dia da Consciência Negra"],
		[`${year}-12-25`, "Natal"],
	];
	const movable = [
		[toDateKey(addDays(easter, -48)), "Carnaval"],
		[toDateKey(addDays(easter, -47)), "Carnaval"],
		[toDateKey(addDays(easter, -2)), "Sexta-feira Santa"],
		[toDateKey(easter), "Páscoa"],
		[toDateKey(addDays(easter, 60)), "Corpus Christi"],
	];
	return [...fixed, ...movable].map(([date, name]) => ({ date, name }));
}

/** Feriados nacionais calculados localmente pra um intervalo, no mesmo formato de listHolidays (pra exibicao). */
function computeNationalHolidaysForRange(from, to) {
	if (!from || !to) return [];
	const startYear = new Date(from).getFullYear();
	const endYear = new Date(to).getFullYear();
	const holidays = [];
	for (let year = startYear; year <= endYear; year += 1) {
		for (const holiday of computeNationalHolidaysForYear(year)) {
			if (holiday.date >= from && holiday.date <= to) {
				holidays.push({
					id: `national_${holiday.date}`,
					holiday_date: holiday.date,
					name: holiday.name,
					scope: "nacional",
					city: null,
					source: "calculado",
				});
			}
		}
	}
	return holidays;
}

// Evita reinserir os mesmos feriados a cada request dentro do mesmo
// processo Node — o calculo e local/instantaneo, mas nao ha motivo pra
// bater no banco toda vez. Reinicia quando o processo reinicia (deploy),
// o que e inofensivo (so reafirma os mesmos valores via ON CONFLICT DO
// NOTHING).
const ensuredYears = new Set();

async function ensureNationalHolidaysForYear(year) {
	if (ensuredYears.has(year)) return;
	const holidays = computeNationalHolidaysForYear(year);
	for (const holiday of holidays) {
		await db
			.query(
				`insert into finan_calendar_holidays (id, holiday_date, name, scope, source)
				values ($1, $2, $3, 'nacional', 'calculado')
				on conflict (holiday_date, scope, coalesce(city, '')) do nothing`,
				[randomId("finan_holiday"), holiday.date, holiday.name],
			)
			.catch((error) => console.error("[finan-calendario-feriados-insert]", error?.message || error));
	}
	ensuredYears.add(year);
}

async function ensureNationalHolidaysForRange(fromDate, toDate) {
	const startYear = new Date(fromDate).getFullYear();
	const endYear = new Date(toDate).getFullYear();
	for (let year = startYear; year <= endYear; year += 1) {
		await ensureNationalHolidaysForYear(year);
	}
}

async function listHolidays({ from, to, city } = {}) {
	const conditions = [];
	const params = [];
	if (from) {
		params.push(from);
		conditions.push(`holiday_date >= $${params.length}`);
	}
	if (to) {
		params.push(to);
		conditions.push(`holiday_date <= $${params.length}`);
	}
	if (city) {
		params.push(city);
		conditions.push(`(scope = 'nacional' or city = $${params.length})`);
	}
	const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
	const { rows } = await db.query(
		`select id, holiday_date, name, scope, city, source
		from finan_calendar_holidays
		${where}
		order by holiday_date`,
		params,
	);
	return rows;
}

/**
 * Conjunto de datas (YYYY-MM-DD) de feriados nacionais + (se `city`)
 * municipais dessa cidade, num intervalo.
 *
 * IMPORTANTE: os feriados NACIONAIS entram aqui direto do calculo local
 * (computeNationalHolidaysForYear), NUNCA passando por
 * insert-no-banco-e-ler-de-volta — essa ida-e-volta pelo banco se mostrou
 * um ponto de falha real em producao (o calculo de dia util ficou
 * incorreto mais de uma vez porque o feriado nao estava la na hora de
 * ler, por motivo que nao consegui isolar remotamente). O calculo e
 * deterministico e instantaneo, entao nao ha razao pra essa etapa
 * critica depender de I/O de banco. So os feriados MUNICIPAIS (cadastro
 * manual, sem formula) continuam vindo do banco.
 */
async function getHolidaySet({ from, to, city } = {}) {
	const startYear = new Date(from).getFullYear();
	const endYear = new Date(to).getFullYear();
	const set = new Set();
	for (let year = startYear; year <= endYear; year += 1) {
		for (const holiday of computeNationalHolidaysForYear(year)) set.add(holiday.date);
	}
	if (city) {
		const rows = await listHolidays({ from, to, city }).catch(() => []);
		for (const row of rows) {
			if (row.scope === "municipal") set.add(String(row.holiday_date).slice(0, 10));
		}
	}
	return set;
}

function isBusinessDay(date, holidaySet) {
	const day = date.getDay();
	if (day === 0 || day === 6) return false;
	const key = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
	return !holidaySet.has(key);
}

/** Retorna a data (YYYY-MM-DD) do N-esimo dia util de um mes, ou null se N exceder o mes. */
function nthBusinessDayOfMonth(year, month, n, holidaySet) {
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	let count = 0;
	for (let day = 1; day <= daysInMonth; day += 1) {
		const date = new Date(year, month, day);
		if (isBusinessDay(date, holidaySet)) {
			count += 1;
			if (count === n) {
				return [year, String(month + 1).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
			}
		}
	}
	return null;
}

module.exports = {
	computeNationalHolidaysForRange,
	computeNationalHolidaysForYear,
	ensureNationalHolidaysForRange,
	listHolidays,
	getHolidaySet,
	isBusinessDay,
	nthBusinessDayOfMonth,
};
