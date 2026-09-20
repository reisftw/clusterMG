// DTO de agendamento (Fase C — docs/TECHNICAL-AUDIT.md). Campos e enums
// conferidos contra o formulario real do frontend
// (src/modules/agendamentos/components/AgendamentoModal.jsx e
// src/modules/agendamentos/constants.js) para nao quebrar o contrato
// atual — o formulario sempre manda o objeto completo (nao so os campos
// alterados), tanto em criar quanto em editar, entao o mesmo shape serve
// pros dois sem modo `partial`.
const { string, enumField, dateOnly, timeOnly, isoDateTime, id, object } = require("./schema");

const STATUS_VALUES = [
	"Aguardando dia",
	"Enviado ao tecnico",
	"Entregue",
	"Concluido",
	"Nao recolhido",
	"Cancelado",
];

const TURNO_VALUES = ["Manha", "Tarde", "Noite", "Integral"];

const AgendamentoWriteDTO = object(
	{
		tecnico_nome: string({ required: true, maxLength: 160 }),
		codigo_cliente: string({ required: true, maxLength: 40, pattern: /^\d+$/ }),
		cliente_nome: string({ maxLength: 200, allowEmpty: true }),
		cidade: string({ maxLength: 120, allowEmpty: true }),
		data: dateOnly({ required: true }),
		turno: enumField(TURNO_VALUES),
		hora: timeOnly(),
		status: enumField(STATUS_VALUES),
		observacao: string({ maxLength: 2000, allowEmpty: true }),
		// `regional` normalmente nao vem do formulario (a regional e
		// escopada no backend — ver security/regionalScope.js), mas o campo
		// fica no shape pra nao ser rejeitado caso algum fluxo legado ainda
		// mande, e pra scopeWritePayload poder sobrescreve-lo com seguranca
		// depois da validacao.
		regional: string({ maxLength: 120, allowEmpty: true }),
		criado_em: isoDateTime(),
		atualizado_em: isoDateTime(),
	},
	{ unknownKeys: "reject" },
);

const IdParamDTO = object({ id: id({ required: true }) }, { unknownKeys: "strip" });

module.exports = { AgendamentoWriteDTO, IdParamDTO, STATUS_VALUES, TURNO_VALUES };
