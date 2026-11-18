const test = require("node:test");
const assert = require("node:assert/strict");
const service = require("./storeDeliveriesService");

test("normaliza MAC para scanner e impede duplicidade", () => {
	assert.equal(service.__testables.normalizeMac("aa:bb-cc.11 22 33"), "AABBCC112233");
	assert.throws(() => service.__testables.validateItems([
		{ productName:"ONU", mac:"AA:BB:CC:11:22:33" },
		{ productName:"Roteador", mac:"aabbcc112233" },
	]), /mais de uma vez/);
});

test("mapeia acesso do HubSoft sem expor CPF integral", () => {
	const item=service.__testables.mapClientAccess({cliente:{id_cliente:1,codigo_cliente:"44741",nome_razaosocial:"ITALO",cpf_cnpj:"12345678901"},id_cliente_servico:9,equipamentos:[{nome:"ONU",mac:"AA"}]});
	assert.equal(item.clientCode,"44741");
	assert.equal(item.documentMasked,"*******8901");
	assert.equal(item.equipment[0].productName,"ONU");
});

test("mapeia contrato, servico e equipamento em formato aninhado do HubSoft", () => {
	const item = service.__testables.mapClientAccess({ cliente_servico: { id_cliente_servico: 22, numero_plano: "CTR-22", cliente: { codigo_cliente: "44741", nome_razaosocial: "ITALO" }, servico: { id_servico: 7, descricao: "FIBRA" }, equipamentos_cliente: [{ equipamento: { id_equipamento: 5, nome: "ONU" }, phy_addr: "FH-TT99" }] } });
	assert.equal(item.contractId, "22");
	assert.equal(item.serviceId, "7");
	assert.equal(item.serviceName, "FIBRA");
	assert.equal(item.equipment[0].mac, "FH-TT99");
});

test("mapeia lista paginada de equipamentos do acesso HubSoft", () => {
	const item = service.__testables.mapClientAccess({ cliente_servico: { id_cliente_servico: 5, cliente: { codigo_cliente: "10552", nome_razaosocial: "RODRIGO REIS DIVINO" }, equipamentos_cliente: { data: [{ equipamento: { id_equipamento: 9, nome: "ONU", modelo: "FiberHome" }, mac_addr: "54:4B:54:23:57:28" }] } } });
	assert.equal(item.contractId, "5");
	assert.equal(item.equipment[0].mac, "54:4B:54:23:57:28");
	assert.equal(item.equipment[0].productName, "ONU");
});

test("busca de cliente aceita nome parcial sem confundir texto com MAC", () => {
	const item = { clientCode: "44741", clientName: "ÍTALO SILVA VILELA", document: "12345678901", equipment: [{ mac: "FHTT99F06B30" }] };
	assert.equal(service.__testables.matchesSearch(item, "44741"), true);
	assert.equal(service.__testables.matchesSearch(item, "123.456.789-01"), true);
	assert.equal(service.__testables.matchesSearch(item, "italo silva vilela"), true);
	assert.equal(service.__testables.matchesSearch(item, "ITALO"), true);
	assert.equal(service.__testables.matchesSearch(item, "fh:tt:99:f0:6b:30"), true);
	assert.equal(service.__testables.isMacSearch("Rodrigo Reis"), false);
	assert.equal(service.__testables.isMacSearch("FHTT99F06B30"), true);
});
