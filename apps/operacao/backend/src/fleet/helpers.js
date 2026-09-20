// Primitivas reutilizadas por todos os fluxos de Frotas (transferencia,
// devolucao/retirada da base, manutencao, bloqueio, inativacao): leitura
// de odometro com validacao, transicao de status com historico, e
// abertura/fechamento de custodia. Nenhum fluxo deve mexer direto nas
// tabelas rot_vehicle_odometer_readings/rot_vehicle_status_history/
// rot_vehicle_custody sem passar por aqui — é o que garante a
// integridade descrita na secao 55 do pedido (uma acao, uma transacao).

const KM_JUMP_THRESHOLD = Number(process.env.ROT_FLEET_KM_JUMP_THRESHOLD || 3000);

function fail(status, message, code) {
	const error = new Error(message);
	error.status = status;
	if (code) error.code = code;
	throw error;
}

// Registra uma leitura de odometro pro veiculo, com as duas validacoes
// centrais do pedido (secoes 7 e 9): nao aceitar KM menor que o ultimo
// (a menos que seja correcao administrativa), e exigir confirmacao
// explicita quando o salto for muito acima do padrao. Atualiza
// rot_vehicles.current_km/current_km_at na mesma transacao.
async function recordOdometerReading(client, { vehicleId, km, userId, origin, note = null, reason = null, movementId = null, maintenanceId = null, allowLower = false, jumpConfirmed = false }) {
	const { rows: vehicleRows } = await client.query("select current_km from rot_vehicles where id = $1 for update", [vehicleId]);
	if (!vehicleRows[0]) fail(404, "Veículo não encontrado.");
	const previousKm = vehicleRows[0].current_km === null ? null : Number(vehicleRows[0].current_km);
	const kmNum = Number(km);
	if (!Number.isFinite(kmNum) || kmNum < 0) fail(400, "Quilometragem inválida.");

	if (previousKm !== null && !allowLower && kmNum < previousKm) {
		fail(409, "A quilometragem informada é inferior à última leitura registrada.", "KM_BELOW_LAST_READING");
	}
	if (previousKm !== null && kmNum - previousKm > KM_JUMP_THRESHOLD && !jumpConfirmed) {
		fail(409, "A diferença de quilometragem está muito acima do padrão. Confirme o valor informado.", "KM_JUMP_CONFIRMATION_REQUIRED");
	}

	const { rows } = await client.query(
		`insert into rot_vehicle_odometer_readings
		 (vehicle_id, km, previous_km, origin, movement_id, maintenance_id, note, reason, jump_confirmed, recorded_by)
		 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
		[vehicleId, kmNum, previousKm, origin, movementId, maintenanceId, note, reason, jumpConfirmed, userId],
	);
	await client.query(`update rot_vehicles set current_km = $2, current_km_at = now() where id = $1`, [vehicleId, kmNum]);
	return rows[0];
}

// Muda o status do veiculo e grava o historico correspondente (base da
// Timeline, secao 27). storePrevious grava o status ATUAL em
// rot_vehicles.previous_status antes de trocar — usado por bloqueio (pra
// desbloqueio restaurar) e transferencia pendente (pra cancelamento
// restaurar), nao em toda troca.
async function changeVehicleStatus(client, { vehicleId, toStatus, reason = null, note = null, userId, movementId = null, maintenanceId = null, claimId = null, storePrevious = false }) {
	const { rows } = await client.query("select status from rot_vehicles where id = $1 for update", [vehicleId]);
	const fromStatus = rows[0]?.status || null;
	if (storePrevious) {
		await client.query("update rot_vehicles set status = $2, previous_status = $3 where id = $1", [vehicleId, toStatus, fromStatus]);
	} else {
		await client.query("update rot_vehicles set status = $2 where id = $1", [vehicleId, toStatus]);
	}
	await client.query(
		`insert into rot_vehicle_status_history (vehicle_id, from_status, to_status, reason, note, movement_id, maintenance_id, claim_id, changed_by)
		 values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		[vehicleId, fromStatus, toStatus, reason, note, movementId, maintenanceId, claimId, userId],
	);
	return fromStatus;
}

async function closeOpenCustody(client, { vehicleId, endedKm = null, endMovementId = null }) {
	await client.query(
		`update rot_vehicle_custody set ended_at = now(), ended_km = $2, end_movement_id = $3
		 where vehicle_id = $1 and ended_at is null`,
		[vehicleId, endedKm, endMovementId],
	);
}

async function openCustody(client, { vehicleId, responsibleId, operationScope, regionalId, startedKm = null, startMovementId = null }) {
	const { rows } = await client.query(
		`insert into rot_vehicle_custody (vehicle_id, responsible_id, operation_scope, regional_id, started_km, start_movement_id)
		 values ($1,$2,$3,$4,$5,$6) returning *`,
		[vehicleId, responsibleId, operationScope, regionalId, startedKm, startMovementId],
	);
	return rows[0];
}

module.exports = {
	KM_JUMP_THRESHOLD,
	fail,
	recordOdometerReading,
	changeVehicleStatus,
	closeOpenCustody,
	openCustody,
};
