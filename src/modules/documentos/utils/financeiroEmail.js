const DEFAULT_FINANCEIRO_EMAIL_TEMPLATE = `Prezados,

Encaminho para conferência e providências a documentação mensal aprovada da empresa {empresa_nome}, referente ao mês de {mes_referencia}.

Dados da empresa:
- Empresa: {empresa_nome}
- CNPJ: {empresa_cnpj}
- Regional: {regional}
- Supervisor responsável: {supervisor_nome}

Documentações enviadas e aprovadas:
{documentos_lista}

O pacote compactado (.zip) foi baixado junto com a geração deste e-mail e contém os documentos aprovados para envio ao financeiro.

Permaneço à disposição para qualquer ajuste ou esclarecimento.

Atenciosamente,`;

function text(value) {
  return String(value || "").trim();
}

export function formatMonthLabel(value, separator = "/") {
  const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return value || "-";
  const monthNames = [
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
  return `${monthNames[Number(match[2]) - 1] || match[2]}${separator}${match[1]}`;
}

function latestFilesByField(files = []) {
  const byField = new Map();
  files.forEach((file) => {
    const key = file.fieldId || file.fieldNome || file.tipo || file.id;
    const current = byField.get(key);
    const currentDate = current ? new Date(current.createdAt || current.updatedAt || 0).getTime() : 0;
    const nextDate = new Date(file.createdAt || file.updatedAt || 0).getTime();
    if (!current || nextDate >= currentDate) byField.set(key, file);
  });
  return [...byField.values()];
}

export function buildDocumentosFinanceiroEmail({ empresa = {}, submission = {}, template } = {}) {
  const files = latestFilesByField(submission.files || [])
    .filter((file) => String(file.status || "").toLowerCase() === "aprovado");
  const documentosLista = files.length
    ? files
      .map((file, index) => `${index + 1}. ${text(file.fieldNome || file.tipo || file.nome || "Documento")}`)
      .join("\n")
    : "- Documentos aprovados conforme pacote em anexo.";

  const values = {
    empresa_nome: text(empresa.nome || submission.empresaNome) || "-",
    empresa_cnpj: text(empresa.cnpj || empresa.documento || submission.empresaCnpj) || "Não informado",
    regional: text(empresa.regional || submission.regional) || "-",
    supervisor_nome: text(empresa.supervisor?.nome || submission.supervisorNome) || "-",
    mes_referencia: formatMonthLabel(submission.mesReferencia, " de "),
    documentos_lista: documentosLista,
  };

  return String(template || DEFAULT_FINANCEIRO_EMAIL_TEMPLATE).replace(
    /\{(empresa_nome|empresa_cnpj|regional|supervisor_nome|mes_referencia|documentos_lista)\}/g,
    (_, key) => values[key] || "",
  );
}

export { DEFAULT_FINANCEIRO_EMAIL_TEMPLATE };
