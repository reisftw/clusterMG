// DTOs de metas financeiras (finan_metas) — ver roteiro Finan #18 em
// metas/routes.js.
const { dateOnly, id, money, object, string } = require("./schema");

const MetaUpsertDTO = object(
	{
		titulo: string({ required: true, maxLength: 200 }),
		descricao: string({ maxLength: 1000 }),
		valorBase: money({ required: true }),
		valorAtual: money(),
		valorAlvo: money({ required: true }),
		dataInicio: dateOnly(),
		dataAlvo: dateOnly(),
	},
	{ unknownKeys: "reject" },
);

const IdParamDTO = object({ id: id({ required: true }) }, { unknownKeys: "strip" });

module.exports = { MetaUpsertDTO, IdParamDTO };
