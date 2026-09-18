// DTOs de contratos recorrentes (finan_contratos/finan_contrato_reajustes)
// — ver roteiro Finan #6/#7 em contratos/routes.js.
const { boolean, dateOnly, id, money, object, string } = require("./schema");

const PERIODICIDADES = ["mensal", "bimestral", "trimestral", "semestral", "anual"];

const ContratoUpsertDTO = object(
	{
		nome: string({ required: true, maxLength: 200 }),
		fornecedorId: string({ maxLength: 64 }),
		valor: money({ required: true }),
		periodicidade: string({ required: true, maxLength: 20, pattern: new RegExp(`^(${PERIODICIDADES.join("|")})$`) }),
		dataInicio: dateOnly(),
		dataRenovacao: dateOnly(),
		indiceReajuste: string({ maxLength: 40 }),
		responsavelId: string({ maxLength: 64 }),
		responsavelNome: string({ maxLength: 160 }),
		ativo: boolean(),
		observacoes: string({ maxLength: 2000 }),
	},
	{ unknownKeys: "reject" },
);

const IdParamDTO = object({ id: id({ required: true }) }, { unknownKeys: "strip" });

const ReajusteDTO = object(
	{
		valorNovo: money({ required: true }),
		indice: string({ maxLength: 40 }),
		data: dateOnly(),
	},
	{ unknownKeys: "reject" },
);

module.exports = { ContratoUpsertDTO, IdParamDTO, ReajusteDTO, PERIODICIDADES };
