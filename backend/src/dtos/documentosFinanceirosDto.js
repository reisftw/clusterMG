// DTOs de Notas Fiscais, Contas a Pagar e Contas a Receber (roteiro
// Finan Fase 3, pre-requisito) — ver notas/routes.js, contasPagar/routes.js
// e contasReceber/routes.js.
const { dateOnly, enumField, id, money, object, string } = require("./schema");

const IdParamDTO = object({ id: id({ required: true }) }, { unknownKeys: "strip" });

const NotaFiscalDTO = object(
	{
		numero: string({ maxLength: 60 }),
		serie: string({ maxLength: 20 }),
		cnpjEmissor: string({ maxLength: 20 }),
		fornecedorId: string({ maxLength: 64 }),
		fornecedorNome: string({ maxLength: 200 }),
		descricao: string({ maxLength: 500 }),
		valor: money({ required: true }),
		valorImpostos: money(),
		dataEmissao: dateOnly(),
		dataVencimento: dateOnly(),
		status: enumField(["pendente", "paga", "cancelada"]),
		observacoes: string({ maxLength: 2000 }),
	},
	{ unknownKeys: "reject" },
);

const ContaPagarDTO = object(
	{
		descricao: string({ required: true, maxLength: 300 }),
		fornecedorId: string({ maxLength: 64 }),
		notaId: string({ maxLength: 64 }),
		contaId: string({ maxLength: 64 }),
		centroCustoId: string({ maxLength: 64 }),
		valor: money({ required: true }),
		dataVencimento: dateOnly({ required: true }),
		dataPagamento: dateOnly(),
		formaPagamento: string({ maxLength: 60 }),
		status: enumField(["pendente", "pago", "cancelado"]),
		observacoes: string({ maxLength: 2000 }),
	},
	{ unknownKeys: "reject" },
);

const ContaReceberDTO = object(
	{
		descricao: string({ required: true, maxLength: 300 }),
		clienteNome: string({ required: true, maxLength: 200 }),
		valor: money({ required: true }),
		dataVencimento: dateOnly({ required: true }),
		dataRecebimento: dateOnly(),
		status: enumField(["pendente", "recebido", "cancelado"]),
		observacoes: string({ maxLength: 2000 }),
	},
	{ unknownKeys: "reject" },
);

module.exports = { IdParamDTO, NotaFiscalDTO, ContaPagarDTO, ContaReceberDTO };
