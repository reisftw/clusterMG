const HUBSOFT_ACTIVATION_ORDER_TYPES = Object.freeze([
	{ id: 4, name: "INSTALAÇÃO", healthMonitoringMode: "FULL" },
	{ id: 52, name: "INSTALAÇÃO CÂMERAS/ALARMES", healthMonitoringMode: "LIMITED" },
	{ id: 767, name: "INSTALAÇÃO PERMUTA", healthMonitoringMode: "FULL" },
	{ id: 760, name: "INSTALAÇÃO PME", healthMonitoringMode: "FULL" },
	{ id: 6, name: "MUDANÇA DE ENDEREÇO", healthMonitoringMode: "FULL" },
	{ id: 45, name: "PONTO DE REDE ADICIONAL", healthMonitoringMode: "LIMITED" },
	{ id: 65, name: "UPGRADE COM VISITA TÉCNICA", healthMonitoringMode: "FULL" },
]);

const HUBSOFT_ACTIVATION_ORDER_TYPE_IDS = Object.freeze(HUBSOFT_ACTIVATION_ORDER_TYPES.map((item) => item.id));

function getActivationOrderTypeConfig(orderTypeId) {
	return HUBSOFT_ACTIVATION_ORDER_TYPES.find((item) => item.id === Number(orderTypeId)) || null;
}

module.exports = {
	HUBSOFT_ACTIVATION_ORDER_TYPES,
	HUBSOFT_ACTIVATION_ORDER_TYPE_IDS,
	getActivationOrderTypeConfig,
};
