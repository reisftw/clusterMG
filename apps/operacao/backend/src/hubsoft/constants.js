const HUBSOFT_ACTIVATION_ORDER_TYPES = Object.freeze([
	{ id: 4, name: "INSTALAÇÃO", healthMonitoringMode: "FULL" },
	{ id: 52, name: "INSTALAÇÃO CÂMERAS/ALARMES", healthMonitoringMode: "LIMITED" },
	{ id: 767, name: "INSTALAÇÃO PERMUTA", healthMonitoringMode: "FULL" },
	{ id: 760, name: "INSTALAÇÃO PME", healthMonitoringMode: "FULL" },
	{ id: 51, name: "INSTALAÇÃO TELEFONIA", healthMonitoringMode: "LIMITED" },
	{ id: 50, name: "INSTALAÇÃO TV", healthMonitoringMode: "LIMITED" },
	{ id: 453, name: "INSTALAÇÃO WIRELESS", healthMonitoringMode: "LIMITED" },
	{ id: 6, name: "MUDANÇA DE ENDEREÇO", healthMonitoringMode: "FULL" },
	{ id: 508, name: "MUDANÇA DE ENDEREÇO - WIRELESS", healthMonitoringMode: "LIMITED" },
	{ id: 45, name: "PONTO DE REDE ADICIONAL", healthMonitoringMode: "LIMITED" },
	{ id: 7, name: "SUPORTE", healthMonitoringMode: "NONE" },
	{ id: 771, name: "SUPORTE CORREÇÃO DE SINAL", healthMonitoringMode: "NONE" },
	{ id: 64, name: "TROCA DE TECNOLOGIA - LANÇAMENTO FIBRA", healthMonitoringMode: "FULL" },
	{ id: 65, name: "UPGRADE COM VISITA TÉCNICA", healthMonitoringMode: "FULL" },
]);

const HUBSOFT_ACTIVATION_ORDER_TYPE_IDS = Object.freeze(HUBSOFT_ACTIVATION_ORDER_TYPES.map((item) => item.id));
const HUBSOFT_ACTIVATION_KPI_ORDER_TYPE_IDS = Object.freeze([4, 50, 51, 52, 453, 760, 767, 6, 508, 65]);

function getActivationOrderTypeConfig(orderTypeId) {
	return HUBSOFT_ACTIVATION_ORDER_TYPES.find((item) => item.id === Number(orderTypeId)) || null;
}

module.exports = {
	HUBSOFT_ACTIVATION_ORDER_TYPES,
	HUBSOFT_ACTIVATION_ORDER_TYPE_IDS,
	HUBSOFT_ACTIVATION_KPI_ORDER_TYPE_IDS,
	getActivationOrderTypeConfig,
};
