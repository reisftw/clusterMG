import { COLLECTIONS } from "../../../constants/dataCollections";
import {
	createVpsDocument,
	deleteVpsDocument,
	getVpsDocument,
	listVpsDocuments,
	updateVpsDocument,
} from "../../../services/vpsApiClient";
import { secureRandomNumberString } from "../../../utils/secureRandom";

export const RETIRADA_METHODS = [
	{
		value: "coleta",
		label: "Agendar coleta",
		description: "A equipe recolhe os equipamentos no endereco informado.",
	},
	{
		value: "ponto",
		label: "Entregar em ponto de apoio",
		description: "O cliente leva os equipamentos para a unidade combinada.",
	},
];

export const RETIRADA_STATUS = [
	{ value: "novo", label: "Novo" },
	{ value: "em_tratativa", label: "Em tratativa" },
	{ value: "agendado", label: "Agendado" },
	{ value: "concluido", label: "Concluido" },
	{ value: "cancelado", label: "Cancelado" },
];

export const RETIRADA_TRATATIVAS = [
	{ value: "primeiro_contato", label: "Primeiro contato" },
	{ value: "aguardando_cliente", label: "Aguardando cliente" },
	{ value: "agendamento_coleta", label: "Agendamento de coleta" },
	{ value: "encaminhado_ponto", label: "Encaminhado para ponto de apoio" },
	{ value: "coleta_confirmada", label: "Coleta confirmada" },
	{ value: "devolucao_finalizada", label: "Devolucao finalizada" },
	{ value: "sem_sucesso", label: "Sem sucesso de contato" },
];

export const RETIRADA_PERIODOS = [
	{ value: "manha", label: "Manha" },
	{ value: "tarde", label: "Tarde" },
	{ value: "noite", label: "Noite" },
];

const text = (value) => String(value || "").trim();
const digits = (value) => String(value || "").replace(/\D/g, "");

function generateRetiradaProtocol() {
	const now = new Date();
	const datePart = [
		now.getFullYear(),
		String(now.getMonth() + 1).padStart(2, "0"),
		String(now.getDate()).padStart(2, "0"),
	].join("");
	const timePart = [
		String(now.getHours()).padStart(2, "0"),
		String(now.getMinutes()).padStart(2, "0"),
		String(now.getSeconds()).padStart(2, "0"),
	].join("");
	const randomPart = secureRandomNumberString(100, 999);

	return `RET-${datePart}-${timePart}-${randomPart}`;
}

export const RETIRADA_EMPTY_FORM = Object.freeze({
	protocolo: "",
	nome: "",
	cpfCnpj: "",
	telefone: "",
	email: "",
	contrato: "",
	equipamentoMac: "",
	cidade: "",
	cep: "",
	bairro: "",
	endereco: "",
	numero: "",
	complemento: "",
	referencia: "",
	equipamento: "",
	motivo: "",
	metodo: "coleta",
	lojaSelecionadaId: "",
	lojaSelecionadaNome: "",
	lojaSelecionadaEndereco: "",
	periodoPreferido: "",
	observacoes: "",
});

export function normalizeRetiradaRecord(id, payload = {}) {
	return {
		id,
		protocolo: text(payload.protocolo),
		nome: text(payload.nome),
		cpfCnpj: text(payload.cpfCnpj),
		telefone: text(payload.telefone),
		email: text(payload.email),
		contrato: text(payload.contrato),
		equipamentoMac: text(payload.equipamentoMac),
		cidade: text(payload.cidade),
		cep: text(payload.cep),
		bairro: text(payload.bairro),
		endereco: text(payload.endereco),
		numero: text(payload.numero),
		complemento: text(payload.complemento),
		referencia: text(payload.referencia),
		equipamento: text(payload.equipamento),
		motivo: text(payload.motivo),
		metodo: text(payload.metodo) || "coleta",
		lojaSelecionadaId: text(payload.lojaSelecionadaId),
		lojaSelecionadaNome: text(payload.lojaSelecionadaNome),
		lojaSelecionadaEndereco: text(payload.lojaSelecionadaEndereco),
		periodoPreferido: text(payload.periodoPreferido),
		observacoes: text(payload.observacoes),
		status: text(payload.status) || "novo",
		origem: text(payload.origem) || "site",
		atendimentoNotas: text(payload.atendimentoNotas),
		responsavelNome: text(payload.responsavelNome),
		tratativaTipo: text(payload.tratativaTipo),
		emailNotificacaoStatus: text(payload.emailNotificacaoStatus),
		emailNotificacaoErro: text(payload.emailNotificacaoErro),
		emailNotificacaoEnviadaEm: payload.emailNotificacaoEnviadaEm || null,
		reciboEmailStatus: text(payload.reciboEmailStatus),
		reciboEmailErro: text(payload.reciboEmailErro),
		reciboEmailEnviadoEm: payload.reciboEmailEnviadoEm || null,
		correiosFreteValor: Number.parseFloat(payload.correiosFreteValor) || 0,
		correiosFreteMoeda: text(payload.correiosFreteMoeda) || "BRL",
		correiosFreteServicoCodigo: text(payload.correiosFreteServicoCodigo),
		correiosFreteServicoNome: text(payload.correiosFreteServicoNome),
		correiosFreteCepOrigem: text(payload.correiosFreteCepOrigem),
		correiosFreteCepDestino: text(payload.correiosFreteCepDestino),
		correiosFreteErro: text(payload.correiosFreteErro),
		createdAt: payload.createdAt || null,
		concluidoEm: payload.concluidoEm || null,
		updatedAt: payload.updatedAt || null,
		tratativaAtualizadaEm:
			payload.tratativaAtualizadaEm || payload.updatedAt || null,
		correiosFreteAtualizadoEm: payload.correiosFreteAtualizadoEm || null,
	};
}

export async function submitRetiradaRequest(form) {
	const protocolo = text(form.protocolo) || generateRetiradaProtocol();
	const payload = {
		protocolo,
		nome: text(form.nome),
		cpfCnpj: digits(form.cpfCnpj),
		telefone: digits(form.telefone),
		email: text(form.email).toLowerCase(),
		contrato: text(form.contrato),
		equipamentoMac: text(form.equipamentoMac).toUpperCase(),
		cidade: text(form.cidade),
		cep: digits(form.cep),
		bairro: text(form.bairro),
		endereco: text(form.endereco),
		numero: text(form.numero),
		complemento: text(form.complemento),
		referencia: text(form.referencia),
		equipamento: text(form.equipamento),
		motivo: text(form.motivo),
		metodo: text(form.metodo) || "coleta",
		lojaSelecionadaId: text(form.lojaSelecionadaId),
		lojaSelecionadaNome: text(form.lojaSelecionadaNome),
		lojaSelecionadaEndereco: text(form.lojaSelecionadaEndereco),
		periodoPreferido: text(form.periodoPreferido),
		observacoes: text(form.observacoes),
		status: "novo",
		origem: "site",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};

	const ref = await createVpsDocument(
		COLLECTIONS.RETIRADAS_SOLICITACOES,
		payload,
	);
	return { id: ref.id, protocolo };
}

export function listenRetiradaRequests(onData, onError) {
	let active = true;

	const load = async () => {
		try {
			const items = await listVpsDocuments(COLLECTIONS.RETIRADAS_SOLICITACOES, {
				limit: 1000,
			});
			if (!active) return;
			onData(
				items
					.map((item) => normalizeRetiradaRecord(item.id, item))
					.sort((a, b) =>
						String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
					),
			);
		} catch (error) {
			onError?.(error);
		}
	};

	load();
	const timer = window.setInterval(load, 30000);
	return () => {
		active = false;
		window.clearInterval(timer);
	};
}

export async function updateRetiradaRequest(id, payload = {}) {
	const current = await getVpsDocument(
		`${COLLECTIONS.RETIRADAS_SOLICITACOES}/${id}`,
	);
	const updates = {
		nome: text(payload.nome),
		cpfCnpj: digits(payload.cpfCnpj),
		telefone: digits(payload.telefone),
		email: text(payload.email).toLowerCase(),
		contrato: text(payload.contrato),
		equipamentoMac: text(payload.equipamentoMac).toUpperCase(),
		cidade: text(payload.cidade),
		cep: digits(payload.cep),
		bairro: text(payload.bairro),
		endereco: text(payload.endereco),
		numero: text(payload.numero),
		complemento: text(payload.complemento),
		referencia: text(payload.referencia),
		equipamento: text(payload.equipamento),
		motivo: text(payload.motivo),
		metodo: text(payload.metodo) || "coleta",
		lojaSelecionadaId: text(payload.lojaSelecionadaId),
		lojaSelecionadaNome: text(payload.lojaSelecionadaNome),
		lojaSelecionadaEndereco: text(payload.lojaSelecionadaEndereco),
		periodoPreferido: text(payload.periodoPreferido),
		observacoes: text(payload.observacoes),
		status: text(payload.status),
		atendimentoNotas: text(payload.atendimentoNotas),
		responsavelNome: text(payload.responsavelNome),
		tratativaTipo: text(payload.tratativaTipo),
		updatedAt: new Date().toISOString(),
		tratativaAtualizadaEm: new Date().toISOString(),
	};

	if (
		text(payload.status) === "concluido" &&
		text(current.status) !== "concluido"
	) {
		updates.concluidoEm = new Date().toISOString();
	}

	return updateVpsDocument(
		`${COLLECTIONS.RETIRADAS_SOLICITACOES}/${id}`,
		updates,
	);
}

export async function deleteRetiradaRequest(id) {
	return deleteVpsDocument(`${COLLECTIONS.RETIRADAS_SOLICITACOES}/${id}`);
}

export async function estimateRetiradaCorreios(id) {
	await updateVpsDocument(`${COLLECTIONS.RETIRADAS_SOLICITACOES}/${id}`, {
		correiosFreteErro: "Calculo de Correios ainda nao foi migrado para a VPS.",
		correiosFreteAtualizadoEm: new Date().toISOString(),
	});
	throw new Error("Calculo de Correios ainda nao foi migrado para a VPS.");
}

export async function fetchRetiradaByProtocol(protocolo) {
	const normalized = text(protocolo).toUpperCase();

	if (!normalized) {
		throw new Error("Informe um protocolo valido.");
	}

	const items = await listVpsDocuments(COLLECTIONS.RETIRADAS_SOLICITACOES, {
		limit: 1000,
	});
	return (
		items
			.map((item) => normalizeRetiradaRecord(item.id, item))
			.find((item) => text(item.protocolo).toUpperCase() === normalized) || null
	);
}

export async function sendRetiradaReceiptEmail(id) {
	await updateVpsDocument(`${COLLECTIONS.RETIRADAS_SOLICITACOES}/${id}`, {
		reciboEmailStatus: "erro",
		reciboEmailErro: "Envio de recibo ainda nao foi migrado para a VPS.",
		reciboEmailEnviadoEm: null,
	});
	throw new Error("Envio de recibo ainda nao foi migrado para a VPS.");
}
