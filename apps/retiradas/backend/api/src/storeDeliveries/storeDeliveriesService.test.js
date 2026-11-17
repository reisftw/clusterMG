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
