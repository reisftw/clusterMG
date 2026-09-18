// DTOs do fechamento mensal (finan_fechamentos_mensais) — ver roteiro
// Finan #12 em fechamento/routes.js.
const { integer, object, string } = require("./schema");

const PeriodoDTO = object(
	{
		ano: integer({ required: true, min: 2000, max: 2100 }),
		mes: integer({ required: true, min: 1, max: 12 }),
	},
	{ unknownKeys: "reject" },
);

const ReabrirDTO = object(
	{
		ano: integer({ required: true, min: 2000, max: 2100 }),
		mes: integer({ required: true, min: 1, max: 12 }),
		motivo: string({ required: true, minLength: 5, maxLength: 500 }),
	},
	{ unknownKeys: "reject" },
);

module.exports = { PeriodoDTO, ReabrirDTO };
