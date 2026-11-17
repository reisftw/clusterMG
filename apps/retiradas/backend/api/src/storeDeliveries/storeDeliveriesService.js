const db = require("../db");
const auditLog = require("../auditLog");
const hubsoft = require("../hubsoftSyncProfiles");
const portRelease = require("../serviceOrders/portRelease/portReleaseService");
const {
  generateReturnReceiptPdf,
  safeFilename,
} = require("../serviceOrders/returnReceipts/returnReceiptPdf");

const PERMISSIONS = Object.freeze({
  create: ["loja.entregas.create"],
  mine: ["loja.entregas.mine"],
  store: ["loja.entregas.store"],
  history: ["loja.historico.view"],
  stores: ["loja.lojas.manage"],
  protocols: ["loja.protocolos.view"],
});

const clean = (value) => String(value ?? "").trim();
const digits = (value) => clean(value).replace(/\D/g, "");
const normalizeMac = (value) =>
  clean(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
const actor = (user = {}) => {
  const profile = user.profile || user;
  return {
    uid: clean(user.uid || profile.uid || user.email || profile.email),
    name: clean(
      profile.nome ||
        profile.displayName ||
        user.nome ||
        user.email ||
        profile.email,
    ),
  };
};
const isAdmin = (user = {}) =>
  clean(user.role || user.profile?.role).toLowerCase() === "admin";
const permissionsOf = (user = {}) => {
  if (Array.isArray(user.permissions)) return user.permissions;
  if (Array.isArray(user.profile?.permissions)) return user.profile.permissions;
  return [];
};
const canViewStore = (user = {}) =>
  isAdmin(user) ||
  permissionsOf(user).some((permission) =>
    ["*", "loja.entregas.store", "loja.historico.view"].includes(permission),
  );
const fail = (message, statusCode = 422) =>
  Object.assign(new Error(message), { statusCode });

function rowsOf(payload = {}) {
  const rows =
    payload?.acessos_cliente?.data ||
    payload?.data?.data ||
    payload?.data ||
    payload?.dados ||
    [];
  return Array.isArray(rows) ? rows : [];
}

function mapClientAccess(row = {}) {
  const client = row.cliente || row.cliente_servico?.cliente || row;
  const service = row.cliente_servico || row.servico || row;
  const equipments =
    row.equipamentos || service.equipamentos || row.equipamentos_cliente || [];
  return {
    clientId: clean(client.id_cliente || client.id),
    clientCode: digits(client.codigo_cliente || row.codigo_cliente),
    clientName: clean(
      client.nome_razaosocial || client.nome || row.nome_razaosocial,
    ),
    documentMasked: clean(client.cpf_cnpj || client.documento).replace(
      /.(?=.{4})/g,
      "*",
    ),
    contractId: clean(
      service.id_cliente_servico || service.id_contrato || service.contrato,
    ),
    serviceId: clean(
      service.id_servico || service.servico?.id_servico || service.id,
    ),
    serviceName: clean(
      service.servico?.descricao || service.descricao || service.nome,
    ),
    company: clean(
      service.empresa?.nome || service.empresa?.razao_social || row.empresa,
    ),
    status: clean(service.status || service.status_contrato || row.status),
    equipment: (Array.isArray(equipments) ? equipments : []).map((item) => ({
      assetId: clean(item.id_equipamento || item.id),
      productName: clean(
        item.nome || item.produto?.nome || item.descricao || "Equipamento",
      ),
      model: clean(item.modelo || item.produto?.modelo),
      mac: clean(item.mac || item.endereco_mac || item.numero_serie),
      serial: clean(item.serial || item.numero_serie),
    })),
  };
}

async function searchClients(term) {
  const query = clean(term);
  if (query.length < 3)
    throw fail("Informe CPF, código ou nome completo.", 400);
  const session = await hubsoft.createAutomationSession();
  const payload = await hubsoft.automationRequest(
    session,
    `/api/v1/cliente/acesso/paginado/20?page=1&busca=cliente&termo_busca=${encodeURIComponent(query)}`,
  );
  const seen = new Set();
  const items = rowsOf(payload)
    .map(mapClientAccess)
    .filter((item) => item.clientCode && item.clientName)
    .filter((item) => {
      const key = `${item.clientCode}:${item.contractId}:${item.serviceId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return { items };
}

async function userScope(user = {}) {
  const owner = actor(user);
  const result = await db.query(
    "select store_location_id, managed_store_location_ids from app_users where uid=$1",
    [owner.uid],
  );
  return {
    ...owner,
    storeId: result.rows[0]?.store_location_id || null,
    managedStoreIds: result.rows[0]?.managed_store_location_ids || [],
  };
}

async function resolveStore(user, requestedId) {
  const scope = await userScope(user);
  const requested = clean(requestedId);
  const managed = new Set(scope.managedStoreIds.map(String));
  const allowedRequested =
    isAdmin(user) ||
    requested === String(scope.storeId) ||
    managed.has(requested);
  if (requested && !allowedRequested) {
    throw fail("A loja informada não pertence ao usuário autenticado.", 403);
  }
  const id = requested || scope.storeId;
  if (!id) throw fail("Seu usuário não possui uma loja ativa vinculada.", 422);
  const store = (
    await db.query(
      "select * from store_locations where id=$1 and active=true",
      [id],
    )
  ).rows[0];
  if (!store) throw fail("Loja ativa não encontrada.", 404);
  return { store, scope };
}

function validateItems(items = []) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).map((item) => {
    const mac = normalizeMac(item.mac || item.serial);
    if (mac.length < 8 || mac.length > 64)
      throw fail("Todo equipamento deve possuir MAC ou serial válido.", 400);
    if (seen.has(mac))
      throw fail(`O equipamento ${mac} foi informado mais de uma vez.`, 409);
    seen.add(mac);
    return {
      assetId: clean(item.assetId),
      productName: clean(item.productName || "Equipamento"),
      model: clean(item.model),
      mac,
      serial: clean(item.serial),
      contractId: clean(item.contractId),
      serviceId: clean(item.serviceId),
    };
  });
}

async function duplicateMac(client, item) {
  const result = await client.query(
    `select d.protocol, i.mac from store_delivery_items i join store_deliveries d on d.id=i.delivery_id
		 where regexp_replace(upper(i.mac),'[^A-Z0-9]','','g')=$1 limit 1`,
    [item.mac],
  );
  return result.rows[0] || null;
}

async function nextProtocol(client) {
  const seq = Number(
    (await client.query("select nextval('store_delivery_protocol_seq') value"))
      .rows[0].value,
  );
  return `EL-${new Date().getFullYear()}-${String(seq).padStart(6, "0")}`;
}

async function attemptPortRelease(delivery, user) {
  try {
    const found = await portRelease.search(
      { codes: [delivery.client_code], limit: 20 },
      user,
    );
    const eligible = found.items?.find(
      (item) => item.eligibility === "ELIGIBLE",
    );
    if (!eligible) {
      await db.query(
        "update store_deliveries set port_release_status='NOT_ELIGIBLE', updated_at=now() where id=$1",
        [delivery.id],
      );
      return;
    }
    const batch = await portRelease.createBatch(
      {
        orders: [eligible],
        reason: "Correção operacional",
        note: `Entrega em loja ${delivery.protocol}`,
      },
      user,
    );
    await db.query(
      "update store_deliveries set port_release_status='QUEUED', port_release_batch_id=$2, updated_at=now() where id=$1",
      [delivery.id, batch.id],
    );
  } catch (error) {
    await db
      .query(
        "update store_deliveries set port_release_status='PENDING', integration_error=$2, updated_at=now() where id=$1",
        [delivery.id, clean(error.message).slice(0, 1000)],
      )
      .catch(() => {});
  }
}

async function createDelivery(input = {}, user = {}) {
  const owner = actor(user);
  if (!owner.uid) throw fail("Usuário autenticado não identificado.", 401);
  const { store } = await resolveStore(user, input.storeId);
  const items = validateItems(input.items);
  if (!items.length)
    throw fail("Confirme ao menos um equipamento recebido.", 400);
  const idempotencyKey = clean(input.idempotencyKey);
  if (!idempotencyKey || idempotencyKey.length > 100)
    throw fail("Chave de confirmação inválida.", 400);
  const client = await db.connect();
  let delivery;
  try {
    await client.query("begin");
    const existing = (
      await client.query(
        "select * from store_deliveries where idempotency_key=$1",
        [idempotencyKey],
      )
    ).rows[0];
    if (existing) {
      await client.query("commit");
      return { item: existing, reused: true };
    }
    const protocol = await nextProtocol(client);
    const snapshot = {
      id: store.id,
      code: store.code,
      name: store.name,
      company: store.company,
      address: store.address,
      number: store.address_number,
      city: store.city,
      state: store.state,
    };
    delivery = (
      await client.query(
        `insert into store_deliveries (protocol,idempotency_key,client_code,client_name,client_document_masked,contract_id,service_id,service_order_id,service_order_number,store_id,store_snapshot,received_by_uid,received_by_name,delivery_type)
			 values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14) returning *`,
        [
          protocol,
          idempotencyKey,
          digits(input.clientCode),
          clean(input.clientName),
          clean(input.documentMasked),
          clean(input.contractId),
          clean(input.serviceId),
          clean(input.serviceOrderId),
          clean(input.serviceOrderNumber),
          store.id,
          JSON.stringify(snapshot),
          owner.uid,
          owner.name,
          clean(input.deliveryType) === "PARTIAL" ? "PARTIAL" : "TOTAL",
        ],
      )
    ).rows[0];
    for (const item of items) {
      const duplicate = await duplicateMac(client, item);
      const status = duplicate ? "DIVERGENCE" : "PENDING";
      await client.query(
        `insert into store_delivery_items (delivery_id,asset_id,product_name,model,mac,serial,service_id,contract_id,reconciliation_status,divergence_reason)
			 values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          delivery.id,
          item.assetId,
          item.productName,
          item.model,
          item.mac,
          item.serial,
          item.serviceId || clean(input.serviceId),
          item.contractId || clean(input.contractId),
          status,
          duplicate ? `Já registrado no protocolo ${duplicate.protocol}` : null,
        ],
      );
    }
    await client.query(
      "insert into store_delivery_events(delivery_id,event_type,status,payload,actor_uid,actor_name) values($1,'PHYSICAL_RECEIPT','SUCCESS',$2::jsonb,$3,$4)",
      [
        delivery.id,
        JSON.stringify({ itemCount: items.length, origin: "STORE" }),
        owner.uid,
        owner.name,
      ],
    );
    const pdfSnapshot = {
      clientName: delivery.client_name,
      clientCode: delivery.client_code,
      serviceOrderNumber: delivery.service_order_number || protocol,
      serviceOrderType: "ENTREGA EM LOJA",
      company: store.company,
      technicianName: owner.name,
      completedAt: delivery.confirmed_at,
      equipment: items,
      receiptId: delivery.id,
      generatedAt: delivery.confirmed_at,
    };
    const pdf = await generateReturnReceiptPdf(pdfSnapshot);
    const filename = safeFilename(`${delivery.client_name}-${protocol}`);
    await client.query(
      "update store_deliveries set pdf_filename=$2,pdf_data=$3 where id=$1",
      [delivery.id, filename, pdf],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    if (error.code === "23505") {
      error.statusCode = 409;
    }
    throw error;
  } finally {
    client.release();
  }
  await auditLog.recordAuditLog({
    action: "create",
    module: "store_deliveries",
    entity: "delivery",
    recordId: delivery.id,
    userId: owner.uid,
    userName: owner.name,
    afterData: {
      protocol: delivery.protocol,
      storeId: store.id,
      items: items.map((item) => item.mac),
    },
    changedFields: ["physical_status", "items"],
  });
  void attemptPortRelease(delivery, user);
  return { item: { ...delivery, itemCount: items.length }, reused: false };
}

function scopeWhere(user, scope, mode, params) {
  if (isAdmin(user)) return "true";
  if (mode === "mine") {
    params.push(scope.uid);
    return `d.received_by_uid=$${params.length}`;
  }
  const ids = [scope.storeId, ...scope.managedStoreIds].filter(Boolean);
  params.push(ids);
  return `d.store_id=any($${params.length}::uuid[])`;
}

async function listDeliveries(query = {}, user = {}, mode = "history") {
  const scope = await userScope(user);
  const params = [];
  const where = [scopeWhere(user, scope, mode, params)];
  if (query.q) {
    params.push(`%${clean(query.q)}%`);
    where.push(
      `(d.protocol ilike $${params.length} or d.client_name ilike $${params.length} or d.client_code ilike $${params.length} or exists(select 1 from store_delivery_items i where i.delivery_id=d.id and i.mac ilike $${params.length}))`,
    );
  }
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit || 25)));
  const total = Number(
    (
      await db.query(
        `select count(*) from store_deliveries d where ${where.join(" and ")}`,
        params,
      )
    ).rows[0].count,
  );
  const result = await db.query(
    `select d.*,s.name store_name,(select count(*)::int from store_delivery_items i where i.delivery_id=d.id) item_count from store_deliveries d join store_locations s on s.id=d.store_id where ${where.join(" and ")} order by d.confirmed_at desc limit $${params.length + 1} offset $${params.length + 2}`,
    [...params, limit, (page - 1) * limit],
  );
  return {
    items: result.rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

async function getDelivery(id, user = {}) {
  const scope = await userScope(user);
  const params = [id];
  let access = "true";
  if (!isAdmin(user) && canViewStore(user)) {
    params.push([scope.storeId, ...scope.managedStoreIds].filter(Boolean));
    access = `d.store_id=any($${params.length}::uuid[])`;
  } else if (!isAdmin(user)) {
    params.push(scope.uid);
    access = `d.received_by_uid=$${params.length}`;
  }
  const delivery = (
    await db.query(
      `select d.*,s.name store_name from store_deliveries d join store_locations s on s.id=d.store_id where d.id=$1 and ${access}`,
      params,
    )
  ).rows[0];
  if (!delivery) throw fail("Protocolo não encontrado.", 404);
  const items = (
    await db.query(
      "select * from store_delivery_items where delivery_id=$1 order by created_at",
      [id],
    )
  ).rows;
  return { item: { ...delivery, items } };
}

async function download(id, user) {
  await getDelivery(id, user);
  const row = (
    await db.query(
      "select pdf_filename,pdf_data from store_deliveries where id=$1",
      [id],
    )
  ).rows[0];
  return row;
}
async function listStores(user = {}) {
  if (isAdmin(user))
    return {
      items: (
        await db.query(
          "select * from store_locations order by active desc,name",
        )
      ).rows,
    };
  const scope = await userScope(user);
  const ids = [scope.storeId, ...scope.managedStoreIds].filter(Boolean);
  return {
    items: (
      await db.query(
        "select * from store_locations where id=any($1::uuid[]) order by active desc,name",
        [ids],
      )
    ).rows,
  };
}
async function saveStore(input = {}, user = {}) {
  const owner = actor(user);
  const values = [
    clean(input.code).toUpperCase(),
    clean(input.name),
    clean(input.company || "SEMPRE"),
    digits(input.cnpj) || null,
    digits(input.zipCode) || null,
    clean(input.address),
    clean(input.number),
    clean(input.complement),
    clean(input.district),
    clean(input.city),
    clean(input.state).toUpperCase(),
    input.active !== false,
    owner.uid,
  ];
  if (
    !values[0] ||
    !values[1] ||
    !values[5] ||
    !values[9] ||
    values[10].length !== 2
  ) {
    throw fail("Preencha código, nome e endereço completo da loja.", 400);
  }
  if (!isAdmin(user)) {
    const scope = await userScope(user);
    const existing = (
      await db.query("select id from store_locations where code=$1", [
        values[0],
      ])
    ).rows[0];
    if (
      existing &&
      !scope.managedStoreIds.map(String).includes(String(existing.id))
    ) {
      throw fail("Você não gerencia esta loja.", 403);
    }
  }
  const result = await db.query(
    `insert into store_locations(code,name,company,cnpj,zip_code,address,address_number,complement,district,city,state,active,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) on conflict(code) do update set name=excluded.name,company=excluded.company,cnpj=excluded.cnpj,zip_code=excluded.zip_code,address=excluded.address,address_number=excluded.address_number,complement=excluded.complement,district=excluded.district,city=excluded.city,state=excluded.state,active=excluded.active,updated_at=now() returning *`,
    values,
  );
  if (!isAdmin(user)) {
    await db.query(
      "update app_users set managed_store_location_ids=array(select distinct unnest(managed_store_location_ids||$2::uuid)) where uid=$1",
      [owner.uid, result.rows[0].id],
    );
  }
  return { item: result.rows[0] };
}

async function listStoreUsers(user = {}) {
  const scope = await userScope(user);
  const params = [];
  let where = "true";
  if (!isAdmin(user)) {
    params.push(scope.managedStoreIds);
    where = `(store_location_id=any($1::uuid[]) or store_location_id is null) and role in ('atendente_loja','supervisor_loja')`;
  }
  const result = await db.query(
    `select uid,email,display_name,role,store_location_id from app_users where ${where} order by display_name nulls last,email`,
    params,
  );
  return { items: result.rows };
}
async function assignStoreUser(storeId, input = {}, user = {}) {
  const scope = await userScope(user);
  const managed = new Set(scope.managedStoreIds.map(String));
  if (!isAdmin(user) && !managed.has(String(storeId))) {
    throw fail("Você não gerencia esta loja.", 403);
  }
  const store = (
    await db.query(
      "select id from store_locations where id=$1 and active=true",
      [storeId],
    )
  ).rows[0];
  if (!store) throw fail("Loja ativa não encontrada.", 404);
  const target = (
    await db.query(
      "select uid,role,store_location_id from app_users where uid=$1",
      [clean(input.uid)],
    )
  ).rows[0];
  if (!target) throw fail("Usuário não encontrado.", 404);
  if (
    !isAdmin(user) &&
    (!["atendente_loja", "supervisor_loja"].includes(target.role) ||
      (target.store_location_id &&
        !managed.has(String(target.store_location_id))))
  ) {
    throw fail("Você não pode transferir este usuário.", 403);
  }
  const result = await db.query(
    "update app_users set store_location_id=$2 where uid=$1 returning uid,email,display_name,role,store_location_id",
    [target.uid, store.id],
  );
  return { item: result.rows[0] };
}

module.exports = {
  PERMISSIONS,
  assignStoreUser,
  createDelivery,
  download,
  getDelivery,
  listDeliveries,
  listStores,
  listStoreUsers,
  saveStore,
  searchClients,
  __testables: { normalizeMac, validateItems, mapClientAccess },
};
