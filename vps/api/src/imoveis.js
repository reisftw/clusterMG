const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const documents = require("./documents");
const drive = require("./documentos/services/googleDriveService");

const COLLECTIONS = Object.freeze({
  imoveis: "imoveis_administrativos",
  reajustes: "imoveis_administrativos_reajustes",
  iptu: "imoveis_administrativos_iptu",
  alugueis: "imoveis_administrativos_alugueis",
  contratos: "imoveis_administrativos_contratos",
  anexos: "imoveis_administrativos_anexos",
  aditivos: "imoveis_administrativos_aditivos",
  config: "imoveis_administrativos_config",
});

const ADMINISTRATIVO_ROLES = ["admin", "supervisor_administrativo", "analista_administrativo"];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.IMOVEIS_CONTRATO_UPLOAD_LIMIT_BYTES || 8 * 1024 * 1024) },
  fileFilter: (_req, file, cb) => {
    const mime = String(file?.mimetype || "").toLowerCase();
    const name = String(file?.originalname || "").toLowerCase();
    const allowedMime = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "video/mp4",
      "video/quicktime",
      "video/webm",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ].includes(mime);
    const allowed = allowedMime && /\.(pdf|png|jpe?g|mp4|mov|webm|xlsx|xls)$/i.test(name);
    if (!allowed) {
      cb(new Error("Envie apenas PDF, PNG, JPG, vídeo ou planilha Excel."));
      return;
    }
    cb(null, true);
  },
});

const DEFAULT_CONFIG = Object.freeze({
  empresas: ["SEMPRE", "ONNET"],
  classificacoes: ["ADMINISTRATIVO", "SITE/POP", "TORRE", "LOJA", "ESTACIONAMENTO"],
  diretorias: ["DSO", "ADMINISTRATIVO", "COMERCIAL", "FINANCEIRO", "OPERAÇÕES"],
  imoveisRootFolderId: "",
});

function text(value) {
  return String(value || "").trim();
}

function numberValue(value) {
  const normalized = String(value ?? "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function boolValue(value) {
  if (typeof value === "boolean") return value;
  return ["true", "1", "sim", "s", "ativo", "possui"].includes(String(value || "").trim().toLowerCase());
}

function dateText(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    excelEpoch.setUTCDate(excelEpoch.getUTCDate() + Math.trunc(value));
    return excelEpoch.toISOString().slice(0, 10);
  }
  return text(value);
}

function normalizeDriveFolderId(value) {
  const source = text(value);
  if (!source) return "";
  const folderMatch = source.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch?.[1]) return folderMatch[1];
  const idQueryMatch = source.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idQueryMatch?.[1]) return idQueryMatch[1];
  return source;
}

function composeEndereco(body = {}, existing = {}) {
  const cep = text(body.cep ?? existing.cep);
  const estado = text(body.estado ?? existing.estado);
  const cidade = text(body.cidade ?? existing.cidade);
  const bairro = text(body.bairro ?? existing.bairro);
  const rua = text(body.rua ?? existing.rua);
  const numero = text(body.numero ?? existing.numero);
  const ruaNumero = [rua, numero].filter(Boolean).join(", ");
  return [ruaNumero, bairro, cidade, estado, cep ? `CEP: ${cep}` : ""].filter(Boolean).join(" - ");
}

function normalizeId(value) {
  return text(value).replace(/[^\w.-]/g, "_").slice(0, 120);
}

function nowIso() {
  return new Date().toISOString();
}

function userName(user = {}) {
  return user?.profile?.nome || user?.nome || user?.email || user?.uid || "Sistema";
}

function mapDocument(row) {
  if (!row) return null;
  return {
    id: row.documentId,
    path: row.path,
    updatedAt: row.updatedAt,
    ...(row.data || {}),
  };
}

async function listCollection(collectionPath) {
  const rows = await documents.listAllDocuments(collectionPath);
  return rows.map(mapDocument);
}

function buildImovelPayload(body = {}, user = {}, existing = {}) {
  const seniorId = normalizeId(body.seniorId || body.idSenior || body.id || existing.seniorId);
  if (!seniorId) {
    const error = new Error("Informe o ID do imovel no Senior.");
    error.statusCode = 400;
    throw error;
  }

  const tipoContrato = text(body.tipoContrato || existing.tipoContrato || "proprio").toLowerCase() === "alugado" ? "alugado" : "proprio";
  const estacionamento = boolValue(body.estacionamento ?? body.temEstacionamento ?? existing.estacionamento ?? existing.temEstacionamento);
  const ativo = body.ativo === undefined
    ? !["inativo", "cancelado", "encerrado"].includes(text(body.situacao || existing.situacao).toLowerCase()) && existing.ativo !== false
    : boolValue(body.ativo);
  const dadosAluguel = tipoContrato === "alugado"
    ? {
        valorOriginal: numberValue(body.valorOriginal ?? existing.valorOriginal),
        valorAluguel: numberValue(body.valorAluguel ?? existing.valorAluguel),
        valorM2: numberValue(body.valorM2 ?? existing.valorM2),
        vencimentoAluguelDia: Math.min(Math.max(Math.trunc(Number(body.vencimentoAluguelDia ?? existing.vencimentoAluguelDia ?? 10)), 1), 31),
        proprietarioNome: text(body.proprietarioNome ?? existing.proprietarioNome),
        proprietarioTelefone: text(body.proprietarioTelefone ?? existing.proprietarioTelefone),
        proprietarioEmail: text(body.proprietarioEmail ?? existing.proprietarioEmail),
        proprietarioContatos: text(body.proprietarioContatos ?? existing.proprietarioContatos),
        contratoInicio: dateText(body.contratoInicio ?? existing.contratoInicio),
        contratoFim: dateText(body.contratoFim ?? body.finalVigencia ?? existing.contratoFim),
        dataUltimoReajuste: dateText(body.dataUltimoReajuste ?? body.mesUltimoReajuste ?? existing.dataUltimoReajuste),
        mesReajuste: text(body.mesReajuste ?? existing.mesReajuste),
        indiceReajuste: text(body.indiceReajuste ?? existing.indiceReajuste),
      }
    : {
        valorOriginal: 0,
        valorAluguel: 0,
        valorM2: 0,
        vencimentoAluguelDia: "",
        proprietarioNome: "",
        proprietarioTelefone: "",
        proprietarioEmail: "",
        proprietarioContatos: "",
        contratoInicio: "",
        contratoFim: "",
        dataUltimoReajuste: "",
        mesReajuste: "",
        indiceReajuste: "",
      };
  return {
    ...existing,
    seniorId,
    nome: text(body.nome ?? body.titulo ?? existing.nome ?? existing.titulo),
    base: text(body.base ?? body.codigoEmpresa ?? existing.base ?? "SEMPRE").toUpperCase(),
    cnpjCpf: text(body.cnpjCpf ?? body.cnpj ?? existing.cnpjCpf),
    classificacao: text(body.classificacao ?? body.ocupacao ?? existing.classificacao),
    diretoria: text(body.diretoria ?? existing.diretoria),
    nomeSite: text(body.nomeSite ?? existing.nomeSite),
    siteDso: text(body.siteDso ?? existing.siteDso),
    pessoaReferencia: text(body.pessoaReferencia ?? existing.pessoaReferencia),
    contatoPessoaReferencia: text(body.contatoPessoaReferencia ?? existing.contatoPessoaReferencia),
    energiaValorMedio: numberValue(body.energiaValorMedio ?? body.contaEnergiaValorMedio ?? existing.energiaValorMedio),
    energiaCodigoCliente: text(body.energiaCodigoCliente ?? body.codigoClienteEnergia ?? existing.energiaCodigoCliente),
    aguaValorMedio: numberValue(body.aguaValorMedio ?? body.contaAguaValorMedio ?? existing.aguaValorMedio),
    aguaCodigoCliente: text(body.aguaCodigoCliente ?? body.codigoClienteAgua ?? existing.aguaCodigoCliente),
    posicoesTrabalho: numberValue(body.posicoesTrabalho ?? existing.posicoesTrabalho),
    quantidadeColaboradores: numberValue(body.quantidadeColaboradores ?? existing.quantidadeColaboradores),
    situacao: text(body.situacao ?? existing.situacao),
    encerramento: dateText(body.encerramento ?? existing.encerramento),
    dataInativacao: ativo ? "" : dateText(body.dataInativacao ?? existing.dataInativacao ?? nowIso().slice(0, 10)),
    motivoInativacao: ativo ? "" : text(body.motivoInativacao ?? existing.motivoInativacao),
    ativo,
    tipoContrato,
    ...dadosAluguel,
    cep: text(body.cep ?? existing.cep),
    estado: text(body.estado ?? existing.estado),
    cidade: text(body.cidade ?? existing.cidade),
    bairro: text(body.bairro ?? existing.bairro),
    rua: text(body.rua ?? existing.rua),
    numero: text(body.numero ?? existing.numero),
    endereco: text(body.endereco ?? existing.endereco) || composeEndereco(body, existing),
    mapsUrl: text(body.mapsUrl ?? existing.mapsUrl),
    streetViewUrl: text(body.streetViewUrl ?? existing.streetViewUrl),
    estacionamento,
    temEstacionamento: estacionamento,
    vagas: estacionamento ? Math.max(Math.trunc(Number(body.vagas ?? existing.vagas ?? 0)), 0) : 0,
    placas: estacionamento
      ? (Array.isArray(body.placas)
          ? body.placas.map(text).filter(Boolean)
          : text(body.placas ?? existing.placas).split(/[,;\n]/).map(text).filter(Boolean))
      : [],
    metrosQuadrados: numberValue(body.metrosQuadrados ?? body.m2 ?? existing.metrosQuadrados),
    seguroTipo: text(body.seguroTipo ?? body.seguro ?? existing.seguroTipo),
    seguroValorMensal: numberValue(body.seguroValorMensal ?? existing.seguroValorMensal),
    seguroVencimento: dateText(body.seguroVencimento ?? existing.seguroVencimento),
    linkApolice: text(body.linkApolice ?? existing.linkApolice),
    vigilanciaContratoLink: text(body.vigilanciaContratoLink ?? existing.vigilanciaContratoLink),
    vigilanciaValorMensal: numberValue(body.vigilanciaValorMensal ?? existing.vigilanciaValorMensal),
    limpezaContrato: text(body.limpezaContrato ?? existing.limpezaContrato),
    limpezaValorMedio: numberValue(body.limpezaValorMedio ?? existing.limpezaValorMedio),
    ppciLink: text(body.ppciLink ?? existing.ppciLink),
    ppciVencimento: dateText(body.ppciVencimento ?? existing.ppciVencimento),
    avcbLink: text(body.avcbLink ?? existing.avcbLink),
    avcbVencimento: dateText(body.avcbVencimento ?? existing.avcbVencimento),
    linkContratoOriginal: text(body.linkContratoOriginal ?? existing.linkContratoOriginal),
    observacao: text(body.observacao ?? existing.observacao),
    updatedAt: nowIso(),
    updatedBy: user?.uid || user?.email || null,
    updatedByName: userName(user),
    createdAt: existing.createdAt || nowIso(),
    createdBy: existing.createdBy || user?.uid || user?.email || null,
    createdByName: existing.createdByName || userName(user),
  };
}

async function upsertDocument(collectionPath, documentId, data) {
  await documents.upsertDocument({
    path: `${collectionPath}/${documentId}`,
    collectionPath,
    documentId,
    parentPath: null,
    data,
  });
  return { id: documentId, ...data };
}

async function getImovelOrThrow(id) {
  const documentId = normalizeId(id);
  const row = await documents.getDocument(`${COLLECTIONS.imoveis}/${documentId}`);
  if (!row) {
    const error = new Error("Imovel nao encontrado.");
    error.statusCode = 404;
    throw error;
  }
  return mapDocument(row);
}

async function getContratoOrThrow(imovelId, contratoId) {
  const documentId = normalizeId(contratoId);
  const row = await documents.getDocument(`${COLLECTIONS.contratos}/${documentId}`);
  const contrato = mapDocument(row);
  if (!contrato || contrato.imovelId !== normalizeId(imovelId)) {
    const error = new Error("Contrato nao encontrado.");
    error.statusCode = 404;
    throw error;
  }
  return contrato;
}

async function getImoveisConfig() {
  const row = await documents.getDocument(`${COLLECTIONS.config}/geral`).catch(() => null);
  return {
    ...DEFAULT_CONFIG,
    ...(row?.data || {}),
  };
}

async function saveImoveisConfig(data = {}, user = {}) {
  const current = await getImoveisConfig();
  const normalizeList = (value, fallback) => {
    const source = Array.isArray(value) ? value : fallback;
    return [...new Set(source.map(text).filter(Boolean))];
  };
  const next = {
    ...current,
    empresas: normalizeList(data.empresas, current.empresas),
    classificacoes: normalizeList(data.classificacoes, current.classificacoes),
    diretorias: normalizeList(data.diretorias, current.diretorias),
    imoveisRootFolderId: Object.prototype.hasOwnProperty.call(data, "imoveisRootFolderId")
      ? normalizeDriveFolderId(data.imoveisRootFolderId)
      : normalizeDriveFolderId(current.imoveisRootFolderId),
    updatedAt: nowIso(),
    updatedByName: userName(user),
  };
  await upsertDocument(COLLECTIONS.config, "geral", next);
  return next;
}

async function ensureImovelFolder(imovel) {
  const config = await getImoveisConfig();
  const parentFolderId = normalizeDriveFolderId(config.imoveisRootFolderId);
  const root = await drive.createFolder("imoveis", parentFolderId || null);
  const folder = await drive.createFolder(imovel.seniorId || imovel.id, root.id);
  const next = {
    ...imovel,
    driveRootFolderId: root.id,
    driveFolderId: folder.id,
    driveFolderName: folder.name,
    updatedAt: nowIso(),
  };
  await upsertDocument(COLLECTIONS.imoveis, imovel.id, next);
  return { root, folder, imovel: next };
}

async function uploadImovelAttachment({ imovel, file, collectionPath, metadata = {} }) {
  if (!file) {
    const error = new Error("Arquivo obrigatorio.");
    error.statusCode = 400;
    throw error;
  }
  const { folder } = await ensureImovelFolder(imovel);
  const uploaded = await drive.uploadFile({
    file,
    folderId: folder.id,
    name: text(metadata.nome) || file.originalname,
  });
  const documentId = `${imovel.id}_${uploaded.id}`;
  const data = {
    imovelId: imovel.id,
    categoria: text(metadata.categoria),
    tipo: text(metadata.tipo) || "drive",
    nome: uploaded.name || file.originalname,
    driveFileId: uploaded.id,
    driveFolderId: folder.id,
    mimeType: uploaded.mimeType || file.mimetype,
    tamanho: Number(uploaded.size || file.size || 0),
    observacao: text(metadata.observacao),
    data: dateText(metadata.data) || nowIso().slice(0, 10),
    createdAt: nowIso(),
    createdByName: userName(metadata.user),
  };
  return upsertDocument(collectionPath, documentId, data);
}

async function deleteDriveFileIfExists(fileId) {
  if (!fileId) return;
  await drive.deleteFile(fileId).catch((error) => {
    if (error?.code !== 404 && error?.status !== 404) throw error;
  });
}

async function deleteImovelCascade(id) {
  const imovel = await getImovelOrThrow(id);
  const relatedCollections = [
    COLLECTIONS.contratos,
    COLLECTIONS.reajustes,
    COLLECTIONS.iptu,
    COLLECTIONS.alugueis,
    COLLECTIONS.anexos,
    COLLECTIONS.aditivos,
  ];
  let deletedRelated = 0;
  for (const collectionPath of relatedCollections) {
    const rows = await listCollection(collectionPath);
    const related = rows.filter((item) => item.imovelId === imovel.id);
    for (const item of related) {
      await deleteDriveFileIfExists(item.driveFileId);
      await documents.deleteDocument(`${collectionPath}/${item.id}`);
      deletedRelated += 1;
    }
  }
  await deleteDriveFileIfExists(imovel.driveFolderId);
  await documents.deleteDocument(`${COLLECTIONS.imoveis}/${imovel.id}`);
  return { id: imovel.id, deletedRelated };
}

function createPeriodFilter(query = {}) {
  const mes = text(query.mes);
  const ano = text(query.ano);
  return (item = {}, dateKeys = ["data", "vencimento", "createdAt"]) => {
    const source = dateKeys.map((key) => item[key]).find(Boolean);
    if (!source) return !mes && !ano;
    const date = new Date(source);
    if (Number.isNaN(date.getTime())) return !mes && !ano;
    if (ano && String(date.getFullYear()) !== String(ano)) return false;
    if (mes && String(date.getMonth() + 1).padStart(2, "0") !== String(mes).padStart(2, "0")) return false;
    return true;
  };
}

function isDateWithinDays(value, days = 30) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today);
  limit.setDate(limit.getDate() + days);
  return date >= today && date <= limit;
}

function buildMonthlyDueDate(day, baseDate = new Date()) {
  const date = new Date(baseDate.getFullYear(), baseDate.getMonth(), Math.min(Math.max(Number(day || 1), 1), 28));
  return date.toISOString().slice(0, 10);
}

function buildReports({ imoveis, iptus, alugueis, reajustes, query }) {
  const inPeriod = createPeriodFilter(query);
  const periodIptus = iptus.filter((item) => inPeriod(item, ["vencimento", "dataPagamento", "createdAt"]));
  const periodAlugueis = alugueis.filter((item) => inPeriod(item, ["vencimento", "dataPagamento", "createdAt"]));
  const imoveisAlugadosAtivos = imoveis.filter((item) => item.ativo !== false && item.tipoContrato === "alugado");
  const gastosIptu = periodIptus.reduce((sum, item) => sum + numberValue(item.valor), 0);
  const gastosAluguel = periodAlugueis.length
    ? periodAlugueis.reduce((sum, item) => sum + numberValue(item.valor), 0)
    : imoveisAlugadosAtivos.reduce((sum, item) => sum + numberValue(item.valorAluguel), 0);
  const contratosProximos = imoveis.filter((item) => item.ativo !== false && isDateWithinDays(item.contratoFim, 60));
  const contratosFinalizados = imoveis.filter((item) => inPeriod({ data: item.contratoFim }, ["data"]) || item.ativo === false);
  const iptuProximo = iptus.filter((item) => !item.pago && isDateWithinDays(item.vencimento, 30));
  const aluguelProximo = imoveis
    .filter((item) => item.ativo !== false && item.tipoContrato === "alugado")
    .map((item) => ({ ...item, vencimentoAluguel: buildMonthlyDueDate(item.vencimentoAluguelDia) }))
    .filter((item) => isDateWithinDays(item.vencimentoAluguel, 30));

  return {
    resumo: {
      totalImoveis: imoveis.length,
      ativos: imoveis.filter((item) => item.ativo !== false).length,
      alugados: imoveis.filter((item) => item.tipoContrato === "alugado").length,
      proprios: imoveis.filter((item) => item.tipoContrato !== "alugado").length,
      gastosIptu,
      gastosAluguel,
    },
    gastosIptu: periodIptus,
    gastosAluguel: periodAlugueis,
    contratosProximos,
    contratosFinalizados,
    iptuProximo,
    aluguelProximo,
    reajustes: reajustes.filter((item) => inPeriod(item, ["data", "createdAt"])),
  };
}

function createImoveisRouter({ requireAuthenticated, requireCsrfToken, requireRoles }) {
  const router = express.Router();
  router.use(requireAuthenticated);
  router.use(requireRoles(ADMINISTRATIVO_ROLES));

  router.get("/config", async (_req, res, next) => {
    try {
      res.json({ config: await getImoveisConfig() });
    } catch (error) {
      next(error);
    }
  });

  router.put("/config", requireCsrfToken, async (req, res, next) => {
    try {
      res.json({ ok: true, config: await saveImoveisConfig(req.body || {}, req.user) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/importar", requireCsrfToken, async (req, res, next) => {
    try {
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      if (!items.length) {
        const error = new Error("Nenhum imovel informado para importacao.");
        error.statusCode = 400;
        throw error;
      }
      let criados = 0;
      let atualizados = 0;
      const erros = [];
      for (const [index, item] of items.entries()) {
        try {
          const id = normalizeId(item.seniorId || item.idSenior || item.id || item.endereco || `${Date.now()}_${index}`);
          const existingRow = await documents.getDocument(`${COLLECTIONS.imoveis}/${id}`).catch(() => null);
          const existing = mapDocument(existingRow) || {};
          const payload = buildImovelPayload({ ...item, seniorId: id }, req.user, existing);
          await upsertDocument(COLLECTIONS.imoveis, payload.seniorId, payload);
          if (existingRow) atualizados += 1;
          else criados += 1;
        } catch (error) {
          erros.push({ linha: index + 2, erro: error.message });
        }
      }
      res.json({ ok: true, total: items.length, criados, atualizados, erros });
    } catch (error) {
      next(error);
    }
  });

  router.post("/excluir-massa", requireCsrfToken, async (req, res, next) => {
    try {
      const ids = Array.isArray(req.body?.ids)
        ? [...new Set(req.body.ids.map(normalizeId).filter(Boolean))]
        : [];
      if (!ids.length) {
        const error = new Error("Selecione ao menos um imovel para excluir.");
        error.statusCode = 400;
        throw error;
      }
      const deleted = [];
      const errors = [];
      for (const id of ids) {
        try {
          deleted.push(await deleteImovelCascade(id));
        } catch (error) {
          errors.push({ id, error: error.message });
        }
      }
      res.json({ ok: true, deleted, errors });
    } catch (error) {
      next(error);
    }
  });

  router.get("/", async (req, res, next) => {
    try {
      const imoveis = await listCollection(COLLECTIONS.imoveis);
      const status = text(req.query.status);
      const items = status === "historico"
        ? imoveis.filter((item) => item.ativo === false)
        : status === "ativos"
          ? imoveis.filter((item) => item.ativo !== false)
          : imoveis;
      res.json({ items });
    } catch (error) {
      next(error);
    }
  });

  router.post("/", requireCsrfToken, async (req, res, next) => {
    try {
      const payload = buildImovelPayload(req.body || {}, req.user);
      const imovel = await upsertDocument(COLLECTIONS.imoveis, payload.seniorId, payload);
      const folder = await ensureImovelFolder(imovel).catch(() => null);
      res.json({ ok: true, imovel: folder?.imovel || imovel, folder: folder?.folder || null });
    } catch (error) {
      next(error);
    }
  });

  router.put("/:id", requireCsrfToken, async (req, res, next) => {
    try {
      const current = await getImovelOrThrow(req.params.id);
      const payload = buildImovelPayload(req.body || {}, req.user, current);
      const imovel = await upsertDocument(COLLECTIONS.imoveis, current.id, payload);
      res.json({ ok: true, imovel });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id", requireCsrfToken, async (req, res, next) => {
    try {
      res.json({ ok: true, deleted: await deleteImovelCascade(req.params.id) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/pasta", requireCsrfToken, async (req, res, next) => {
    try {
      const imovel = await getImovelOrThrow(req.params.id);
      const folder = await ensureImovelFolder(imovel);
      res.json({ ok: true, folder: folder.folder, imovel: folder.imovel });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/reajustes", requireCsrfToken, upload.single("file"), async (req, res, next) => {
    try {
      const imovel = await getImovelOrThrow(req.params.id);
      const documentId = `${imovel.id}_${Date.now()}`;
      const anexo = req.file
        ? await uploadImovelAttachment({
            imovel,
            file: req.file,
            collectionPath: COLLECTIONS.anexos,
            metadata: { ...req.body, categoria: "reajuste", tipo: "planilha_reajuste", user: req.user },
          })
        : null;
      const data = {
        imovelId: imovel.id,
        valorAnterior: numberValue(req.body?.valorAnterior ?? imovel.valorAluguel),
        valorNovo: numberValue(req.body?.valorNovo),
        data: text(req.body?.data) || nowIso().slice(0, 10),
        observacao: text(req.body?.observacao),
        anexoId: anexo?.id || null,
        driveFileId: anexo?.driveFileId || null,
        createdAt: nowIso(),
        createdByName: userName(req.user),
      };
      await upsertDocument(COLLECTIONS.reajustes, documentId, data);
      const updated = {
        ...imovel,
        valorAluguel: data.valorNovo,
        dataUltimoReajuste: data.data,
        updatedAt: nowIso(),
        updatedByName: userName(req.user),
      };
      await upsertDocument(COLLECTIONS.imoveis, imovel.id, updated);
      res.json({ ok: true, item: { id: documentId, ...data }, imovel: updated });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/iptu", requireCsrfToken, upload.single("file"), async (req, res, next) => {
    try {
      const imovel = await getImovelOrThrow(req.params.id);
      const documentId = `${imovel.id}_${Date.now()}`;
      const anexo = req.file
        ? await uploadImovelAttachment({
            imovel,
            file: req.file,
            collectionPath: COLLECTIONS.anexos,
            metadata: { ...req.body, categoria: "iptu", tipo: "guia_iptu", user: req.user },
          })
        : null;
      const data = {
        imovelId: imovel.id,
        ano: text(req.body?.ano) || String(new Date().getFullYear()),
        mes: text(req.body?.mes),
        valor: numberValue(req.body?.valor),
        vencimento: text(req.body?.vencimento),
        pago: boolValue(req.body?.pago),
        observacao: text(req.body?.observacao),
        anexoId: anexo?.id || null,
        driveFileId: anexo?.driveFileId || null,
        createdAt: nowIso(),
        createdByName: userName(req.user),
      };
      res.json({ ok: true, item: await upsertDocument(COLLECTIONS.iptu, documentId, data) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/alugueis", requireCsrfToken, async (req, res, next) => {
    try {
      const imovel = await getImovelOrThrow(req.params.id);
      const documentId = `${imovel.id}_${Date.now()}`;
      const data = {
        imovelId: imovel.id,
        mes: text(req.body?.mes),
        ano: text(req.body?.ano) || String(new Date().getFullYear()),
        valor: numberValue(req.body?.valor ?? imovel.valorAluguel),
        vencimento: text(req.body?.vencimento),
        pago: boolValue(req.body?.pago),
        observacao: text(req.body?.observacao),
        createdAt: nowIso(),
        createdByName: userName(req.user),
      };
      res.json({ ok: true, item: await upsertDocument(COLLECTIONS.alugueis, documentId, data) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/registros", async (req, res, next) => {
    try {
      const imovel = await getImovelOrThrow(req.params.id);
      const [reajustes, iptus, alugueis, contratos] = await Promise.all([
        listCollection(COLLECTIONS.reajustes),
        listCollection(COLLECTIONS.iptu),
        listCollection(COLLECTIONS.alugueis),
        listCollection(COLLECTIONS.contratos),
      ]);
      const byImovel = (item) => item.imovelId === imovel.id;
      res.json({
        imovel,
        reajustes: reajustes.filter(byImovel),
        iptus: iptus.filter(byImovel),
        alugueis: alugueis.filter(byImovel),
        contratos: contratos.filter(byImovel),
        anexos: (await listCollection(COLLECTIONS.anexos)).filter(byImovel),
        aditivos: (await listCollection(COLLECTIONS.aditivos)).filter(byImovel),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/anexos/upload", requireCsrfToken, upload.single("file"), async (req, res, next) => {
    try {
      const imovel = await getImovelOrThrow(req.params.id);
      const item = await uploadImovelAttachment({
        imovel,
        file: req.file,
        collectionPath: COLLECTIONS.anexos,
        metadata: { ...req.body, user: req.user },
      });
      res.json({ ok: true, item });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/aditivos", requireCsrfToken, upload.single("file"), async (req, res, next) => {
    try {
      const imovel = await getImovelOrThrow(req.params.id);
      const anexo = req.file
        ? await uploadImovelAttachment({
            imovel,
            file: req.file,
            collectionPath: COLLECTIONS.anexos,
            metadata: { ...req.body, categoria: "aditivo", tipo: "aditivo", user: req.user },
          })
        : null;
      const documentId = `${imovel.id}_${Date.now()}`;
      const data = {
        imovelId: imovel.id,
        data: dateText(req.body?.data) || nowIso().slice(0, 10),
        observacao: text(req.body?.observacao),
        anexoId: anexo?.id || null,
        driveFileId: anexo?.driveFileId || null,
        nome: text(req.body?.nome) || anexo?.nome || "Aditivo",
        createdAt: nowIso(),
        createdByName: userName(req.user),
      };
      res.json({ ok: true, item: await upsertDocument(COLLECTIONS.aditivos, documentId, data) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/contratos/link", requireCsrfToken, async (req, res, next) => {
    try {
      const imovel = await getImovelOrThrow(req.params.id);
      const documentId = `${imovel.id}_${crypto.randomUUID()}`;
      const data = {
        imovelId: imovel.id,
        tipo: "link",
        nome: text(req.body?.nome) || "Contrato",
        url: text(req.body?.url),
        observacao: text(req.body?.observacao),
        createdAt: nowIso(),
        createdByName: userName(req.user),
      };
      if (!data.url) {
        const error = new Error("Informe o link do contrato.");
        error.statusCode = 400;
        throw error;
      }
      res.json({ ok: true, item: await upsertDocument(COLLECTIONS.contratos, documentId, data) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/contratos/upload", requireCsrfToken, upload.single("file"), async (req, res, next) => {
    try {
      const imovel = await getImovelOrThrow(req.params.id);
      if (!req.file) {
        const error = new Error("Arquivo obrigatorio.");
        error.statusCode = 400;
        throw error;
      }
      const { folder } = await ensureImovelFolder(imovel);
      const uploaded = await drive.uploadFile({
        file: req.file,
        folderId: folder.id,
        name: text(req.body?.nome) || req.file.originalname,
      });
      const documentId = `${imovel.id}_${uploaded.id}`;
      const data = {
        imovelId: imovel.id,
        tipo: "drive",
        nome: uploaded.name || req.file.originalname,
        driveFileId: uploaded.id,
        driveFolderId: folder.id,
        mimeType: uploaded.mimeType || req.file.mimetype,
        tamanho: Number(uploaded.size || req.file.size || 0),
        observacao: text(req.body?.observacao),
        createdAt: nowIso(),
        createdByName: userName(req.user),
      };
      res.json({ ok: true, item: await upsertDocument(COLLECTIONS.contratos, documentId, data) });
    } catch (error) {
      next(error);
    }
  });

  router.put("/:id/contratos/:contratoId", requireCsrfToken, async (req, res, next) => {
    try {
      await getImovelOrThrow(req.params.id);
      const contrato = await getContratoOrThrow(req.params.id, req.params.contratoId);
      const nome = text(req.body?.nome);
      if (!nome) {
        const error = new Error("Informe o nome do contrato.");
        error.statusCode = 400;
        throw error;
      }
      let driveFile = null;
      if (contrato.driveFileId) {
        driveFile = await drive.renameFile(contrato.driveFileId, nome);
      }
      const updated = {
        ...contrato,
        nome: driveFile?.name || nome,
        observacao: text(req.body?.observacao ?? contrato.observacao),
        updatedAt: nowIso(),
        updatedByName: userName(req.user),
      };
      res.json({ ok: true, item: await upsertDocument(COLLECTIONS.contratos, contrato.id, updated) });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id/contratos/:contratoId", requireCsrfToken, async (req, res, next) => {
    try {
      await getImovelOrThrow(req.params.id);
      const contrato = await getContratoOrThrow(req.params.id, req.params.contratoId);
      if (contrato.driveFileId) {
        await drive.deleteFile(contrato.driveFileId).catch((error) => {
          if (error?.code !== 404 && error?.status !== 404) throw error;
        });
      }
      await documents.deleteDocument(`${COLLECTIONS.contratos}/${contrato.id}`);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.get("/relatorios/dados", async (req, res, next) => {
    try {
      const [imoveis, reajustes, iptus, alugueis] = await Promise.all([
        listCollection(COLLECTIONS.imoveis),
        listCollection(COLLECTIONS.reajustes),
        listCollection(COLLECTIONS.iptu),
        listCollection(COLLECTIONS.alugueis),
      ]);
      res.json(buildReports({ imoveis, reajustes, iptus, alugueis, query: req.query || {} }));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = {
  ADMINISTRATIVO_ROLES,
  COLLECTIONS,
  buildReports,
  createImoveisRouter,
};
