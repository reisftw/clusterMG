// DTOs do Calendário Financeiro (`calendario/routes.js`). Este módulo já
// tinha a melhor validação manual pré-existente do backend
// (`normalizeEventPayload`/`normalizeRulePayload`, com `.status` no erro e a
// convenção de data local `YYYY-MM-DD` já correta e testada — ver
// `docs/DTO-MAPPING.md` seção 9). Formalizar como DTO aqui é sobretudo
// consistência (mesmo formato de erro `VALIDATION_ERROR` que o resto do
// backend) e cobertura de dois pontos que a validação manual deixava
// passar: `alertDaysBefore`/`notifyRoleIds` com item inválido eram
// silenciosamente FILTRADOS (não geravam erro) em vez de rejeitados, e a
// cor de prioridade (`config/prioridades`) não era validada contra
// `PRIORITY_COLORS` (aceitava qualquer string).
//
// A resolução de aliases (`eventDate`/`event_date`, etc.) continua sendo
// feita por uma função dedicada em `calendario/routes.js` ANTES de chamar
// o DTO — o DTO valida o objeto já resolvido (nomes canônicos), não o
// `req.body` cru com aliases. Isso evita ter que declarar cada alias como
// campo opcional no shape (o que enfraqueceria `required`).
const { string, integer, dateOnly, id, arrayOf, enumField, object } = require("./schema");
// (mantido comentado de propósito: se `label`/`id` de catálogo (tipos,
// prioridades, antecedências) precisar de validação formal como DTO no
// futuro, o padrão de `CatalogItemBaseDTO` pode ser reintroduzido aqui —
// hoje a validação de `label`/`id` continua inline em
// `calendario/routes.js#catalogRouter`, que já cobre os casos reais.)

const PRIORITY_COLORS = ["vermelho", "amarelo", "verde", "azul"];

const alertDaysField = arrayOf(integer({ required: true, min: 1, max: 365 }), { maxLength: 20 });
const notifyRoleIdsField = arrayOf(id({ required: true }), { maxLength: 50 });

const EventShapeDTO = object({
	title: string({ required: true, maxLength: 200 }),
	description: string({ allowEmpty: true, maxLength: 2000 }),
	eventDate: dateOnly({ required: true }),
	eventType: string({ required: true, maxLength: 80 }),
	priority: string({ required: true, maxLength: 40 }),
	responsibleUserId: id({ required: false }),
	alertDaysBefore: alertDaysField,
	notifyRoleIds: notifyRoleIdsField,
});

const RuleShapeDTO = object({
	title: string({ required: true, maxLength: 200 }),
	description: string({ allowEmpty: true, maxLength: 2000 }),
	eventType: string({ required: true, maxLength: 80 }),
	priority: string({ required: true, maxLength: 40 }),
	nthBusinessDay: integer({ required: true, min: 1, max: 23 }),
	businessDayCity: string({ maxLength: 120 }),
	alertDaysBefore: alertDaysField,
	notifyRoleIds: notifyRoleIdsField,
});

const HolidayShapeDTO = object({
	holidayDate: dateOnly({ required: true }),
	name: string({ required: true, maxLength: 200 }),
	city: string({ required: true, maxLength: 120 }),
});

// `finan_calendar_priorities` tem uma coluna extra (`color`) que precisa
// ser uma das cores realmente suportadas pelo front — antes não era
// validada, aceitava qualquer string.
const PriorityColorDTO = enumField(PRIORITY_COLORS, { required: false });

// `finan_calendar_lead_times` valida `days` num middleware dedicado antes
// do `catalogRouter` genérico (`calendario/routes.js`) — mantido lá, esse
// DTO só formaliza o mesmo intervalo pra reuso caso vire validate() direto.
const LeadTimeDaysDTO = integer({ required: true, min: 1, max: 365 });

module.exports = {
	PRIORITY_COLORS,
	EventShapeDTO,
	RuleShapeDTO,
	HolidayShapeDTO,
	PriorityColorDTO,
	LeadTimeDaysDTO,
};
