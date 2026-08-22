const db = require("./db");
const documents = require("./documents");
const notifications = require("./notificationsService");

const APPOINTMENTS_COLLECTION = "agendamentos";
const MAP_COLLECTION = "ordens_abertas";
const LOG_COLLECTION = "agendamentos_logs";
const STATUS_WAITING = "Aguardando dia";
const STATUS_COLLECTED = "Concluido";
const STATUS_NOT_COLLECTED = "Nao recolhido";

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeCode(value) {
  return String(value || "").replace(/\D+/g, "").trim();
}

function firstText(data = {}, fields = []) {
  for (const field of fields) {
    const value = data[field];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function toDateKey(value) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function currentDateKey() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

function minDateByMonthsBack(monthsBack) {
  if (monthsBack === null || monthsBack === undefined) return "";
  const parsed = Number(monthsBack);
  if (!Number.isFinite(parsed) || parsed < 0) return "";
  const today = new Date(`${currentDateKey()}T12:00:00Z`);
  today.setUTCMonth(today.getUTCMonth() - Math.trunc(parsed), 1);
  return today.toISOString().slice(0, 10);
}

function isWaitingAppointment(data = {}) {
  return normalizeText(data.status || STATUS_WAITING) === normalizeText(STATUS_WAITING);
}

function buildOrderIndexes(orders = []) {
  const codes = new Set();
  const names = new Set();
  const byCode = new Map();
  const byName = new Map();

  orders.forEach((record) => {
    const data = record.data || record || {};
    const code = normalizeCode(firstText(data, ["codigo_cliente", "codigo", "cod_cliente", "id_cliente"]));
    const name = normalizeText(firstText(data, ["nome_cliente", "cliente_nome", "cliente", "nome_razaosocial", "assinante"]));
    if (code) {
      codes.add(code);
      if (!byCode.has(code)) byCode.set(code, data);
    }
    if (name) {
      names.add(name);
      if (!byName.has(name)) byName.set(name, data);
    }
  });

  return { codes, names, byCode, byName };
}

function findMatchingOrder(appointment = {}, indexes) {
  const code = normalizeCode(firstText(appointment, ["codigo_cliente", "codigo", "cod_cliente", "id_cliente"]));
  const name = normalizeText(firstText(appointment, ["cliente_nome", "nome_cliente", "cliente", "nome"]));

  if (code && indexes.codes.has(code)) {
    return { matched: true, reason: "codigo_cliente", order: indexes.byCode.get(code) || null };
  }
  if (name && indexes.names.has(name)) {
    return { matched: true, reason: "nome_cliente", order: indexes.byName.get(name) || null };
  }
  return { matched: false, reason: "", order: null };
}

async function listCollection(collectionPath) {
  const result = await db.query(
    `select path, collection_path as "collectionPath", document_id as "documentId",
            parent_path as "parentPath", data, updated_at as "updatedAt"
       from app_documents
      where collection_path = $1
      order by document_id`,
    [collectionPath],
  );
  return result.rows;
}

function shouldEvaluateAppointment(data = {}, { today, minDate }) {
  const dateKey = toDateKey(data.data || data.data_agendamento || data.agendamento_data);
  if (!dateKey) return { ok: false, reason: "sem_data" };
  if (dateKey >= today) return { ok: false, reason: "ainda_no_prazo" };
  if (minDate && dateKey < minDate) return { ok: false, reason: "fora_do_periodo" };
  if (!isWaitingAppointment(data)) return { ok: false, reason: "status_nao_elegivel" };
  return { ok: true, dateKey };
}

function actorUser(user = {}, fallbackName = "Sistema") {
  return {
    uid: user.uid || user.id || "sistema",
    nome: user.profile?.nome || user.nome || user.displayName || fallbackName,
    email: user.email || "",
    role: user.role || user.profile?.role || "",
  };
}

async function notifyNotCollected({ appointment, documentId, match, user }) {
  const clientName = firstText(appointment, ["cliente_nome", "nome_cliente", "cliente", "nome"]) || "Cliente";
  const code = firstText(appointment, ["codigo_cliente", "codigo", "cod_cliente"]);
  const date = firstText(appointment, ["data", "data_agendamento"]);
  const time = firstText(appointment, ["hora", "horario"]);
  const dedupeKey = `agendamento-nao-recolhido-${documentId}`;

  await notifications.createNotification({
    type: "agendamento_nao_recolhido_mapa",
    title: "Agendamento nao recolhido",
    message: `${clientName}${code ? ` (${code})` : ""} ainda aparece no mapa de O.S. apos o agendamento${date ? ` de ${date}` : ""}.`,
    targetPath: "/agendamentos",
    severity: "warning",
    user: actorUser(user),
    targets: { roles: ["admin", "backoffice_retirada"] },
    dedupeKey,
    meta: {
      agendamentoId: documentId,
      codigoCliente: code,
      clienteNome: clientName,
      data: date,
      hora: time,
      matchReason: match.reason,
      os: firstText(match.order || {}, ["num_os", "os", "numero_os"]),
    },
  });
}

async function updateAppointment(record, nextData) {
  await documents.upsertDocument({
    path: record.path,
    collectionPath: APPOINTMENTS_COLLECTION,
    documentId: record.documentId,
    parentPath: record.parentPath || null,
    data: nextData,
  });
}

async function clearPreviousReconciliationLogs() {
  await db.query(
    `delete from app_documents
      where collection_path = $1
        and data->>'tipo' = 'verificacao_mapa'`,
    [LOG_COLLECTION],
  );
}

async function saveReconciliationLog({ record, before, after, match, reason, checkedAt }) {
  const id = `mapa_${checkedAt.replace(/[^0-9]/g, "")}_${record.documentId}`;
  await documents.upsertDocument({
    path: `${LOG_COLLECTION}/${id}`,
    collectionPath: LOG_COLLECTION,
    documentId: id,
    parentPath: null,
    data: {
      tipo: "verificacao_mapa",
      origem: reason,
      agendamento_id: record.documentId,
      codigo_cliente: firstText(before, ["codigo_cliente", "codigo", "cod_cliente"]),
      cliente_nome: firstText(before, ["cliente_nome", "nome_cliente", "cliente", "nome"]),
      cidade: firstText(before, ["cidade"]),
      data_agendamento: firstText(before, ["data", "data_agendamento"]),
      hora: firstText(before, ["hora", "horario"]),
      status_anterior: before.status || STATUS_WAITING,
      status_novo: after.status,
      resultado: match.matched ? "nao_recolhido" : "recolhido",
      motivo: match.matched
        ? "Cliente ainda aparece no mapa de O.S."
        : "Cliente nao localizado no mapa de O.S.",
      criterio: match.reason || "codigo_cliente_nome",
      os_encontrada: firstText(match.order || {}, ["num_os", "os", "numero_os"]),
      criado_em: checkedAt,
    },
  });
}

async function reconcileAppointmentsWithMapa({ user = {}, monthsBack = null, reason = "mapa_import" } = {}) {
  const [orders, appointments] = await Promise.all([
    listCollection(MAP_COLLECTION),
    listCollection(APPOINTMENTS_COLLECTION),
  ]);
  const indexes = buildOrderIndexes(orders);
  const today = currentDateKey();
  const minDate = minDateByMonthsBack(monthsBack);
  const checkedAt = nowIso();
  await clearPreviousReconciliationLogs();

  const summary = {
    ok: true,
    reason,
    checkedAt,
    today,
    minDate: minDate || null,
    mapOrders: orders.length,
    checked: 0,
    recolhidos: 0,
    naoRecolhidos: 0,
    skipped: {},
    updated: [],
  };

  for (const record of appointments) {
    const data = record.data || {};
    const eligibility = shouldEvaluateAppointment(data, { today, minDate });
    if (!eligibility.ok) {
      summary.skipped[eligibility.reason] = (summary.skipped[eligibility.reason] || 0) + 1;
      continue;
    }

    summary.checked += 1;
    const match = findMatchingOrder(data, indexes);
    const nextStatus = match.matched ? STATUS_NOT_COLLECTED : STATUS_COLLECTED;
    const nextData = {
      ...data,
      status: nextStatus,
      verificacao_mapa: {
        status: match.matched ? "ainda_no_mapa" : "nao_encontrado_no_mapa",
        verificado_em: checkedAt,
        origem: reason,
        criterio: match.reason || "codigo_cliente_nome",
        os_encontrada: firstText(match.order || {}, ["num_os", "os", "numero_os"]),
      },
      atualizado_em: checkedAt,
    };

    if (match.matched) {
      nextData.motivo_nao_recolhido = "Cliente ainda aparece no mapa de O.S.";
      nextData.nao_recolhido_em = checkedAt;
      summary.naoRecolhidos += 1;
    } else {
      nextData.recolhido_em = checkedAt;
      nextData.motivo_recolhido = "Cliente nao localizado no mapa de O.S.";
      summary.recolhidos += 1;
    }

    await updateAppointment(record, nextData);
    await saveReconciliationLog({ record, before: data, after: nextData, match, reason, checkedAt });
    if (match.matched) await notifyNotCollected({ appointment: nextData, documentId: record.documentId, match, user });

    summary.updated.push({
      id: record.documentId,
      status: nextStatus,
      codigoCliente: firstText(data, ["codigo_cliente", "codigo", "cod_cliente"]),
      clienteNome: firstText(data, ["cliente_nome", "nome_cliente", "cliente", "nome"]),
    });
  }

  return summary;
}

module.exports = {
  reconcileAppointmentsWithMapa,
};
