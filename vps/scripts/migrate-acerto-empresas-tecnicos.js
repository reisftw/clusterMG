const db = require("../api/src/db");

const TARGET_COLLECTION = "empresas_tecnicos";
const LEGACY_EMPRESAS_COLLECTION = "acerto_estoque_empresas";
const LEGACY_TECNICOS_COLLECTION = "acerto_estoque_tecnicos";

function text(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function slugify(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function cleanList(values = []) {
  const input = Array.isArray(values) ? values : String(values || "").split(/[,\n;]/);
  return [...new Set(input.map(text).filter(Boolean))];
}

function normalizeAtuacao(value) {
  const key = normalizeText(value);
  if (key === "ativacao") return "Ativacao";
  if (key === "manutencao") return "Manutencao";
  return "Ambos";
}

function normalizeStatus(value) {
  const key = normalizeText(value);
  if (key === "inativo" || key === "inativa") return "Inativa";
  return "Ativa";
}

function getResponsavel(data = {}) {
  const responsavel = data.responsavel || {};
  if (typeof responsavel === "string") {
    return {
      nome: text(responsavel || data.nomeResponsavel || data.responsavelNome),
      email: text(data.emailResponsavel || data.responsavelEmail || data.email),
    };
  }
  return {
    nome: text(responsavel.nome || data.nomeResponsavel || data.responsavelNome),
    email: text(responsavel.email || data.emailResponsavel || data.responsavelEmail || data.email),
  };
}

function normalizeTecnico(data = {}) {
  return {
    id: text(data.id),
    nome: text(data.nome || data.tecnicoNome || data.nomeTecnico),
    email: text(data.email || data.tecnicoEmail).toLowerCase(),
    telefone: text(data.telefone || data.celular || data.phone),
    cidade: text(data.cidade),
    agendaId: text(data.agendaId),
    diaAcerto: text(data.diaAcerto),
    turnoAcerto: text(data.turnoAcerto),
    status: text(data.status) || "Ativo",
    observacoes: text(data.observacoes),
    migradoDoAcertoEstoque: true,
  };
}

function tecnicoKey(tecnico = {}) {
  return [
    normalizeText(tecnico.nome),
    normalizeText(tecnico.email),
    normalizeText(tecnico.telefone),
    normalizeText(tecnico.cidade),
  ].join("|");
}

function buildEmpresaPayload(id, data = {}) {
  const nome = text(data.nome || data.empresa || data.empresaNome || data.razaoSocial || id);
  const responsavel = getResponsavel(data);
  return {
    ...data,
    nome,
    slug: text(data.slug) || slugify(nome || id),
    logo: text(data.logo),
    status: normalizeStatus(data.status),
    atuacao: normalizeAtuacao(data.atuacao || data.tipoAtuacao),
    responsavel,
    regional: text(data.regional || data.regionais?.[0]),
    supervisor: data.supervisor || {
      uid: text(data.supervisorUid),
      nome: text(data.supervisorNome),
      email: text(data.supervisorEmail),
    },
    cidades: cleanList(data.cidades),
    tecnicos: Array.isArray(data.tecnicos) ? data.tecnicos.map(normalizeTecnico).filter((item) => item.nome) : [],
    observacoes: text(data.observacoes),
    migradoDoAcertoEstoque: data.migradoDoAcertoEstoque || false,
  };
}

async function listCollection(collectionPath) {
  const result = await db.query(
    `select document_id as id, data
       from app_documents
      where collection_path = $1
      order by document_id`,
    [collectionPath],
  );
  return result.rows.map((row) => ({ id: row.id, ...(row.data || {}) }));
}

async function upsertEmpresa(id, data) {
  const now = new Date().toISOString();
  await db.query(
    `insert into app_documents (path, collection_path, document_id, parent_path, data, imported_at)
     values ($1, $2, $3, null, $4::jsonb, now())
     on conflict (path) do update
        set data = excluded.data,
            collection_path = excluded.collection_path,
            document_id = excluded.document_id,
            updated_at = now()`,
    [`${TARGET_COLLECTION}/${id}`, TARGET_COLLECTION, id, JSON.stringify({ ...data, atualizado_em: now })],
  );
}

function findEmpresaIdForTecnico(tecnico, empresasByLegacyId, empresasByName) {
  const legacyEmpresaId = text(tecnico.empresaId || tecnico.empresa_id);
  if (legacyEmpresaId && empresasByLegacyId.has(legacyEmpresaId)) {
    return empresasByLegacyId.get(legacyEmpresaId);
  }

  const empresaNome = text(tecnico.empresaNome || tecnico.empresa || tecnico.nomeEmpresa);
  if (empresaNome && empresasByName.has(normalizeText(empresaNome))) {
    return empresasByName.get(normalizeText(empresaNome));
  }

  return "";
}

async function main() {
  const [targetEmpresas, legacyEmpresas, legacyTecnicos] = await Promise.all([
    listCollection(TARGET_COLLECTION),
    listCollection(LEGACY_EMPRESAS_COLLECTION),
    listCollection(LEGACY_TECNICOS_COLLECTION),
  ]);

  const empresasById = new Map();
  const empresasByName = new Map();
  const empresasByLegacyId = new Map();

  for (const empresa of targetEmpresas) {
    const normalized = buildEmpresaPayload(empresa.id, empresa);
    empresasById.set(empresa.id, normalized);
    if (normalized.nome) empresasByName.set(normalizeText(normalized.nome), empresa.id);
  }

  let empresasCriadas = 0;
  let empresasAtualizadas = 0;

  for (const legacy of legacyEmpresas) {
    const normalizedLegacy = buildEmpresaPayload(legacy.id, {
      ...legacy,
      migradoDoAcertoEstoque: true,
    });
    const nameKey = normalizeText(normalizedLegacy.nome);
    const targetId = empresasByName.get(nameKey) || text(legacy.id) || slugify(normalizedLegacy.nome);
    const current = empresasById.get(targetId);
    const merged = buildEmpresaPayload(targetId, {
      ...(current || {}),
      ...normalizedLegacy,
      id: targetId,
      tecnicos: current?.tecnicos || normalizedLegacy.tecnicos || [],
      cidades: cleanList([...(current?.cidades || []), ...(normalizedLegacy.cidades || [])]),
      migradoDoAcertoEstoque: true,
    });

    empresasById.set(targetId, merged);
    empresasByName.set(nameKey, targetId);
    empresasByLegacyId.set(text(legacy.id), targetId);
    if (current) empresasAtualizadas += 1;
    else empresasCriadas += 1;
  }

  for (const empresa of targetEmpresas) {
    if (!empresasByLegacyId.has(text(empresa.id))) {
      empresasByLegacyId.set(text(empresa.id), empresa.id);
    }
  }

  let tecnicosMigrados = 0;
  let tecnicosIgnorados = 0;
  let placeholdersCriados = 0;

  for (const legacyTecnico of legacyTecnicos) {
    const tecnico = normalizeTecnico(legacyTecnico);
    if (!tecnico.nome) {
      tecnicosIgnorados += 1;
      continue;
    }

    let empresaId = findEmpresaIdForTecnico(legacyTecnico, empresasByLegacyId, empresasByName);
    if (!empresaId) {
      const fallbackName = text(legacyTecnico.empresaNome || legacyTecnico.empresa || "Empresa nao informada");
      empresaId = slugify(fallbackName) || "empresa-nao-informada";
      if (!empresasById.has(empresaId)) {
        empresasById.set(empresaId, buildEmpresaPayload(empresaId, {
          id: empresaId,
          nome: fallbackName,
          cidades: tecnico.cidade ? [tecnico.cidade] : [],
          migradoDoAcertoEstoque: true,
        }));
        empresasByName.set(normalizeText(fallbackName), empresaId);
        placeholdersCriados += 1;
      }
    }

    const empresa = empresasById.get(empresaId);
    const tecnicos = Array.isArray(empresa.tecnicos) ? empresa.tecnicos : [];
    const keys = new Set(tecnicos.map(tecnicoKey));
    const nextTecnico = {
      ...tecnico,
      id: tecnico.id || `${empresaId}-${slugify(tecnico.nome)}-${tecnicos.length + 1}`,
    };

    if (keys.has(tecnicoKey(nextTecnico))) {
      tecnicosIgnorados += 1;
      continue;
    }

    empresa.tecnicos = [...tecnicos, nextTecnico];
    empresa.cidades = cleanList([...(empresa.cidades || []), nextTecnico.cidade]);
    empresasById.set(empresaId, empresa);
    tecnicosMigrados += 1;
  }

  for (const [empresaId, empresa] of empresasById.entries()) {
    await upsertEmpresa(empresaId, empresa);
  }

  console.log(JSON.stringify({
    ok: true,
    empresasAtuais: targetEmpresas.length,
    empresasLegadas: legacyEmpresas.length,
    empresasCriadas,
    empresasAtualizadas,
    placeholdersCriados,
    tecnicosLegados: legacyTecnicos.length,
    tecnicosMigrados,
    tecnicosIgnorados,
    totalEmpresasPadrao: empresasById.size,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error("[migrate-acerto-empresas-tecnicos] Falha:", error);
    process.exitCode = 1;
  })
  .finally(() => db.closePool());
