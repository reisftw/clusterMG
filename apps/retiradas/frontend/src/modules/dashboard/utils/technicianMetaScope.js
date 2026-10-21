function normalizeTechnicianName(value) {
	return String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim();
}

export function scopeMetaRecordToTechnician(record, technicianName) {
	if (!record || !technicianName) return record;
	const expected = normalizeTechnicianName(technicianName);
	const technician = (record.technicians || []).find(
		(item) => normalizeTechnicianName(item?.name || item?.nome) === expected,
	);
	if (!technician) {
		return {
			...record,
			totalOS: 0,
			meta: 0,
			percentAchieved: 0,
			saldoDiario: [],
			technicians: [],
		};
	}
	const total = Number(technician.total || 0);
	const meta = Number(technician.meta || 0);
	const daily = Array.isArray(technician.daily) ? technician.daily : [];
	return {
		...record,
		totalOS: total,
		meta,
		percentAchieved:
			meta > 0 ? Number(((total / meta) * 100).toFixed(1)) : 0,
		saldoDiario: daily.map((totalDia, index) => ({
			dia: index + 1,
			totalDia: Number(totalDia || 0),
		})),
		technicians: [technician],
	};
}

export function scopeMonthToTechnician(month, technicianName) {
	if (!month || !technicianName) return month;
	return {
		...scopeMetaRecordToTechnician(month, technicianName),
		onnet: scopeMetaRecordToTechnician(month.onnet, technicianName),
		onnetSempre: scopeMetaRecordToTechnician(
			month.onnetSempre,
			technicianName,
		),
	};
}
