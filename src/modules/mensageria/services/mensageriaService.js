import { COLLECTIONS } from "../../../constants/dataCollections";
import {
  createVpsDocument,
  getVpsDocument,
  listAllVpsDocuments,
  listVpsDocuments,
  requestVpsApi,
  setVpsDocument,
  updateVpsDocument,
} from "../../../services/vpsApiClient";

const CONFIG_DOC_ID = "global";
const HISTORY_LIMIT = 120;
const QUEUE_LIMIT = 1000;
const CALLBACK_LIST_LIMIT = 250;
export const CENTRAL_WHATSAPP_BUTTON_TEXT = "Falar com a central";
export const CENTRAL_WHATSAPP_PHONE = "+55 31 3987-0880";
export const CENTRAL_WHATSAPP_BUTTON_MESSAGE =
  "Olá, quero agendar a coleta dos equipamentos do contrato {contrato}.";
export const CENTRAL_REDIRECT_MESSAGE =
  "Olá! Este número é utilizado apenas por um sistema automático de mensagens.\n\n" +
  "Não realizamos atendimento e não respondemos por este canal.\n\n" +
  "Para falar com a Central de Retiradas, entre em contato pelo telefone: 31 3987-0880.";

export const DEFAULT_MENSAGERIA_CONFIG = {
  autoSync: true,
  autoSend: false,
  approvedTemplate: false,
  avoidDuplicates: true,
  intervalValue: 1,
  intervalUnit: "hours",
  sendWindowStart: "08:00",
  sendWindowEnd: "18:00",
  sendDays: ["seg", "ter", "qua", "qui", "sex", "sab"],
  duplicateBlockDays: 30,
  retryLimit: 3,
  retryAfterMinutes: 15,
  dailySendLimit: 100,
  buttonText: CENTRAL_WHATSAPP_BUTTON_TEXT,
  buttonPhone: CENTRAL_WHATSAPP_PHONE,
  buttonMessage: CENTRAL_WHATSAPP_BUTTON_MESSAGE,
  requiredCentralButton: false,
  whatsappProvider: "evolution",
  activeTemplateId: "cancelamento",
  autoEnqueueMapDiff: false,
  autoEnqueueCities: [],
  evolutionEnabled: false,
  evolutionPaused: true,
  evolutionBaseUrl: "",
  evolutionInstance: "",
  evolutionApiKey: "",
  evolutionAccounts: [],
  evolutionSelectedAccountId: "default",
  evolutionSendTextPath: "/message/sendText/{instance}",
  evolutionButtonPath: "/message/sendButtons/{instance}",
  evolutionWebhookUrl: "https://retiradas.tech/api/webhooks/evolution",
  officialWhatsappEnabled: false,
  officialWhatsappBaseUrl: "https://graph.facebook.com/v20.0",
  officialWhatsappAccessToken: "",
  officialWhatsappPhoneNumberId: "",
  officialWhatsappBusinessAccountId: "",
  officialWhatsappTemplateName: "",
  officialWhatsappTemplateLanguage: "pt_BR",
  officialWhatsappTemplateBodyUsesMessage: true,
  officialWebhookVerifyToken: "",
  smartDelayEnabled: true,
  evolutionMinDelaySeconds: 45,
  evolutionMaxDelaySeconds: 120,
  evolutionBatchSize: 1,
  replyNoScheduleMessage:
    "Perfeito, vamos agendar sua retirada.\n\nResponda com a data e o horário desejados ou digite SIM para receber as opções disponíveis.",
  replyAfterScheduledMessage: CENTRAL_REDIRECT_MESSAGE,
  replyUnmatchedMessage:
    "Anotado a informação!\n\nNão encontrei sua O.S automaticamente por este telefone. Caso necessite de apoio, acione a central de retiradas: 31 3987-0880.",
  replyScheduledConfirmationMessage:
    "Agendamento registrado com sucesso para {data_agendamento} {hora_agendamento}.\n\nEm caso de dúvidas, fale com nossa central de retiradas.",
  guidedScheduleEnabled: true,
  guidedScheduleDateMessage:
    "Perfeito! Escolha uma das datas abaixo para agendarmos a retirada:\n\n{opcoes_datas}\n\nSe preferir outra data, responda com a data desejada. Exemplo: 25/08.",
  guidedScheduleTimeMessage:
    "Ótimo. Agora escolha um horário para o dia {data_agendamento}:\n\n1 - 09h\n2 - 12h\n3 - 16h\n4 - Outro horário\n\nSe preferir, responda com o horário desejado. Exemplo: 14:30.",
  guidedScheduleInvalidDateMessage:
    "Não entendi a data escolhida. Por favor, escolha uma das opções abaixo ou informe outra data:\n\n{opcoes_datas}\n\nExemplo: 25/08.",
  guidedScheduleInvalidTimeMessage:
    "Não entendi o horário escolhido. Por favor, escolha uma das opções abaixo ou informe outro horário:\n\n1 - 09h\n2 - 12h\n3 - 16h\n4 - Outro horário\n\nExemplo: 14:30.",
};

function getTimestampValue(value) {
  if (!value) return 0;
  if (typeof value === "object") {
    if (typeof value.toDate === "function") {
      const date = value.toDate();
      return Number.isNaN(date?.getTime?.()) ? 0 : date.getTime();
    }
    if (value.value) return getTimestampValue(value.value);
    if (value.seconds) return Number(value.seconds) * 1000;
  }
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getCallbackTimestamp(item = {}) {
  return Math.max(
    getTimestampValue(item.criado_em),
    getTimestampValue(item.criadoEm),
    getTimestampValue(item.recebido_em),
    getTimestampValue(item.recebidoEm),
    getTimestampValue(item.updatedAt),
    getTimestampValue(item.atualizado_em),
  );
}

function sortCallbacksByDateDesc(items = []) {
  return [...items].sort((a, b) => {
    const diff = getCallbackTimestamp(b) - getCallbackTimestamp(a);
    if (diff) return diff;
    return String(b.id || "").localeCompare(String(a.id || ""));
  });
}

export const DEFAULT_TEMPLATES = [
  {
    id: "cancelamento",
    nome: "Contrato cancelado",
    situacao: "Contrato cancelado",
    requiredCentralButton: false,
    conteudo:
      "Olá, {primeiro_nome}! Tudo bem?\n\nIdentificamos que há uma ordem de retirada de equipamento pendente referente ao contrato {contrato}, na cidade de *{cidade}*.\n\nGostaríamos de agendar a retirada. Por favor, responda esta mensagem informando uma data e um horário em que estará disponível para receber nossa equipe ou digite apenas *SIM* para receber opções de agendamento.\n\n⚠️ Importante: a não devolução do equipamento poderá gerar cobrança de multa, conforme previsto em contrato.\n\nAguardamos seu retorno para realizarmos o agendamento.\n\nEquipe de Retiradas - Sempre Internet",
  },
  {
    id: "segunda_tentativa",
    nome: "Segunda tentativa",
    situacao: "Cliente sem resposta",
    requiredCentralButton: false,
    conteudo:
      "Olá, {primeiro_nome}! Tudo bem?\n\nEstamos retornando o contato sobre a ordem de retirada de equipamento pendente referente ao contrato {contrato}, na cidade de *{cidade}*.\n\nPara agendar a retirada, responda com uma data e um horário disponíveis ou digite apenas *SIM* para receber opções de agendamento.\n\n⚠️ Importante: a não devolução do equipamento poderá gerar cobrança de multa, conforme previsto em contrato.\n\nEquipe de Retiradas - Sempre Internet",
  },
  {
    id: "confirmacao",
    nome: "Confirmação de agendamento",
    situacao: "Coleta agendada",
    requiredCentralButton: false,
    conteudo:
      "Olá, {primeiro_nome}! Sua coleta dos equipamentos do contrato {contrato} foi registrada. Em caso de dúvidas, fale com nossa central.",
  },
];

export const SAMPLE_QUEUE_ITEMS = [
  {
    cliente: "Maria Oliveira",
    codigo_cliente: "48291",
    contrato: "CTR-10482",
    os: "OS-72913",
    cidade: "São Paulo",
    regional: "Leste",
    endereco: "Rua das Flores, 120 - Centro",
    telefone: "(11) 98888-2211",
    data_cancelamento: "01/08/2026",
    protocolo: "PRT-20260801",
    origem: "Diferença do Mapa",
  },
  {
    cliente: "Carlos Pereira",
    codigo_cliente: "48292",
    contrato: "CTR-10483",
    os: "OS-72918",
    cidade: "Guarulhos",
    regional: "Metropolitana",
    endereco: "Avenida Brasil, 890 - Jardim Maia",
    telefone: "(11) 97777-4300",
    data_cancelamento: "01/08/2026",
    protocolo: "PRT-20260802",
    origem: "Diferença do Mapa",
  },
  {
    cliente: "Fernanda Lima",
    codigo_cliente: "48293",
    contrato: "CTR-10484",
    os: "OS-72921",
    cidade: "Osasco",
    regional: "Oeste",
    endereco: "Rua Aurora, 45 - Centro",
    telefone: "(11) 96666-1900",
    data_cancelamento: "01/08/2026",
    protocolo: "PRT-20260803",
    origem: "Diferença do Mapa",
  },
];

export function normalizeMensageriaConfig(config = {}) {
  return {
    ...DEFAULT_MENSAGERIA_CONFIG,
    ...config,
    evolutionAccounts: [],
    evolutionSelectedAccountId: "default",
    whatsappProvider: config.whatsappProvider || DEFAULT_MENSAGERIA_CONFIG.whatsappProvider,
    buttonText: config.buttonText || CENTRAL_WHATSAPP_BUTTON_TEXT,
    buttonPhone: config.buttonPhone || CENTRAL_WHATSAPP_PHONE,
    buttonMessage: config.buttonMessage || CENTRAL_WHATSAPP_BUTTON_MESSAGE,
    requiredCentralButton: false,
  };
}

export function normalizeTemplateMensageria(template = {}) {
  return {
    ...template,
    requiredCentralButton: false,
  };
}

export async function buscarConfigMensageria() {
  const config = await getVpsDocument(`${COLLECTIONS.MENSAGERIA_CONFIG}/${CONFIG_DOC_ID}`).catch(() => null);
  return config ? normalizeMensageriaConfig(config) : normalizeMensageriaConfig();
}

export async function salvarConfigMensageria(config) {
  await updateVpsDocument(`${COLLECTIONS.MENSAGERIA_CONFIG}/${CONFIG_DOC_ID}`, {
    ...normalizeMensageriaConfig(config),
    atualizadoEm: new Date().toISOString(),
  });
}

export async function buscarTemplatesMensageria() {
  const templates = (await listVpsDocuments(COLLECTIONS.MENSAGERIA_TEMPLATES, {
    limit: 500,
  })).sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || "")));

  if (!templates.length) return DEFAULT_TEMPLATES.map(normalizeTemplateMensageria);
  return templates.map(normalizeTemplateMensageria);
}

export async function salvarTemplateMensageria(template) {
  const id = template.id || crypto.randomUUID();
  const normalizedTemplate = normalizeTemplateMensageria(template);
  await setVpsDocument(`${COLLECTIONS.MENSAGERIA_TEMPLATES}/${id}`, {
    ...normalizedTemplate,
    id,
    atualizadoEm: new Date().toISOString(),
  });
  return id;
}

export async function buscarFilaMensageria() {
  return (await listVpsDocuments(COLLECTIONS.MENSAGERIA_FILA, {
    limit: QUEUE_LIMIT,
  })).sort((a, b) => {
    const statusWeight = {
      aprovado: 0,
      novo: 1,
      aguardando_janela: 2,
      falhou: 3,
      enviado: 4,
      ignorado: 5,
    };
    const priorityA = a.prioridadeEm ? -1 : statusWeight[a.status] ?? 9;
    const priorityB = b.prioridadeEm ? -1 : statusWeight[b.status] ?? 9;
    if (priorityA !== priorityB) return priorityA - priorityB;
    const dateA = new Date(a.prioridadeEm || a.proximaTentativaEm || a.criadoEm || 0).getTime() || 0;
    const dateB = new Date(b.prioridadeEm || b.proximaTentativaEm || b.criadoEm || 0).getTime() || 0;
    return dateA - dateB;
  });
}

export async function criarItemFilaMensageria(item) {
  return createVpsDocument(COLLECTIONS.MENSAGERIA_FILA, {
    ...item,
    telefone_digits: String(item.telefone || "").replace(/\D/g, ""),
    requiredCentralButton: false,
    centralButtonText: CENTRAL_WHATSAPP_BUTTON_TEXT,
    centralButtonPhone: CENTRAL_WHATSAPP_PHONE,
    centralButtonMessage: item.centralButtonMessage || DEFAULT_MENSAGERIA_CONFIG.buttonMessage,
    status: item.status || "novo",
    tentativas: Number(item.tentativas || 0),
    criadoEm: new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),
  });
}

export async function atualizarItemFilaMensageria(id, updates) {
  await updateVpsDocument(`${COLLECTIONS.MENSAGERIA_FILA}/${id}`, {
    ...updates,
    atualizadoEm: new Date().toISOString(),
  });
}

export async function buscarHistoricoMensageria() {
  return (await listVpsDocuments(COLLECTIONS.MENSAGERIA_HISTORICO, {
    limit: HISTORY_LIMIT,
  })).sort((a, b) => String(b.criadoEm || "").localeCompare(String(a.criadoEm || "")));
}

export async function buscarHistoricoMensageriaPaginado({ limit = 20, offset = 0 } = {}) {
  return (await listVpsDocuments(COLLECTIONS.MENSAGERIA_HISTORICO, {
    limit,
    offset,
  })).sort((a, b) => String(b.criadoEm || "").localeCompare(String(a.criadoEm || "")));
}

export async function registrarHistoricoMensageria(item) {
  return createVpsDocument(COLLECTIONS.MENSAGERIA_HISTORICO, {
    ...item,
    criadoEm: new Date().toISOString(),
  });
}

export async function buscarCallbacksMensageria() {
  const callbacks = await listAllVpsDocuments(COLLECTIONS.MENSAGERIA_CALLBACKS, {
    pageSize: 1000,
    max: 5000,
  });
  return sortCallbacksByDateDesc(callbacks).slice(0, CALLBACK_LIST_LIMIT);
}

export async function buscarMensageriaEnviados() {
  const [historicoResumo, callbacks] = await Promise.all([
    listAllVpsDocuments(COLLECTIONS.MENSAGERIA_HISTORICO, { pageSize: 1000, max: 10000 }),
    listAllVpsDocuments(COLLECTIONS.MENSAGERIA_CALLBACKS, { pageSize: 1000, max: 10000 }),
  ]);
  const historicoOrdenado = historicoResumo.sort((a, b) =>
    String(b.criadoEm || "").localeCompare(String(a.criadoEm || "")),
  );
  const pagina = historicoOrdenado;
  const callbacksOrdenados = sortCallbacksByDateDesc(callbacks);
  const enviados = historicoResumo.filter((item) => String(item.status || "") === "enviado");
  return {
    items: pagina,
    hasNext: false,
    resumo: {
      enviados: enviados.length,
      falhas: historicoResumo.filter((item) => String(item.status || "") === "falhou").length,
      respostas: callbacks.length,
    },
    callbacks: callbacksOrdenados,
  };
}

export async function buscarDadosRelatorioMensageria() {
  const [historico, callbacks, fila, agendamentos] = await Promise.all([
    listAllVpsDocuments(COLLECTIONS.MENSAGERIA_HISTORICO, { pageSize: 1000 }),
    listAllVpsDocuments(COLLECTIONS.MENSAGERIA_CALLBACKS, { pageSize: 1000 }),
    listAllVpsDocuments(COLLECTIONS.MENSAGERIA_FILA, { pageSize: 1000 }),
    listAllVpsDocuments(COLLECTIONS.AGENDAMENTOS, { pageSize: 1000, max: 2000 }),
  ]);

  return { historico, callbacks, fila, agendamentos };
}

export async function registrarCallbackMensageria(payload) {
  return requestVpsApi("/webhooks/evolution", {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}

export async function buscarStatusEvolutionMensageria() {
  return requestVpsApi("/mensageria/evolution/status");
}

export async function conectarEvolutionMensageria() {
  return requestVpsApi("/mensageria/evolution/connect", { method: "POST" });
}

export async function desconectarEvolutionMensageria() {
  return requestVpsApi("/mensageria/evolution/disconnect", { method: "POST" });
}

export async function configurarWebhookEvolutionMensageria(webhookUrl) {
  return requestVpsApi("/mensageria/evolution/webhook", {
    method: "POST",
    body: JSON.stringify({ webhookUrl }),
  });
}

export async function executarEnvioEvolutionAgora() {
  return requestVpsApi("/mensageria/evolution/run", { method: "POST" });
}

export async function enviarTesteEvolution(payload) {
  return requestVpsApi("/mensageria/evolution/test", {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}

export async function pausarEvolutionMensageria() {
  return requestVpsApi("/mensageria/evolution/pause", { method: "POST" });
}

export async function retomarEvolutionMensageria() {
  return requestVpsApi("/mensageria/evolution/resume", { method: "POST" });
}

