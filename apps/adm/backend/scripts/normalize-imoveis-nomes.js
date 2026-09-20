const db = require("../src/db");
const {
	buildImovelNome,
	resolveUtilityAccountFields,
} = require("../src/imoveis");

function toPayload(row = {}) {
	const source = row.source_payload || {};
	return {
		...source,
		id: row.id,
		seniorId: row.senior_id || source.seniorId || row.id,
		nome: row.nome || source.nome || "",
		classificacao: row.classificacao || source.classificacao || "",
		ocupacao: source.ocupacao || "",
		cidade: row.cidade || source.cidade || "",
		estado: row.estado || source.estado || "",
		endereco: row.endereco || source.endereco || "",
		rua: row.rua || source.rua || "",
		numero: row.numero || source.numero || "",
		nomeSite: source.nomeSite || "",
		energiaValorMedio: source.energiaValorMedio,
		energiaCodigoCliente: source.energiaCodigoCliente,
		contaEnergiaValorMedio: source.contaEnergiaValorMedio,
		codigoClienteEnergia: source.codigoClienteEnergia,
		aguaValorMedio: source.aguaValorMedio,
		aguaCodigoCliente: source.aguaCodigoCliente,
		contaAguaValorMedio: source.contaAguaValorMedio,
		codigoClienteAgua: source.codigoClienteAgua,
	};
}

async function main() {
	const result = await db.query(
		`select id, senior_id, nome, classificacao, cidade, estado, endereco,
		        rua, numero, source_payload
		   from imoveis
		  order by id`,
	);
	let updated = 0;
	let utilityUpdated = 0;
	for (const row of result.rows) {
		const payload = toPayload(row);
		const nextNome = buildImovelNome(payload, payload);
		const utilityFields = resolveUtilityAccountFields(payload, payload);
		const currentSource = row.source_payload || {};
		const nextPayload = {
			...currentSource,
			nome: nextNome || row.nome,
			...utilityFields,
		};
		const changedNome = nextNome && nextNome !== row.nome;
		const changedUtility =
			String(currentSource.energiaValorMedio ?? "") !==
				String(utilityFields.energiaValorMedio ?? "") ||
			String(currentSource.energiaCodigoCliente ?? "") !==
				String(utilityFields.energiaCodigoCliente ?? "") ||
			String(currentSource.aguaValorMedio ?? "") !==
				String(utilityFields.aguaValorMedio ?? "") ||
			String(currentSource.aguaCodigoCliente ?? "") !==
				String(utilityFields.aguaCodigoCliente ?? "");
		if (!changedNome && !changedUtility) continue;
		await db.query(
			`update imoveis
			    set nome = $1,
			        source_payload = coalesce(source_payload, '{}'::jsonb) || $2::jsonb,
			        updated_at = now()
			  where id = $3`,
			[nextPayload.nome, JSON.stringify(nextPayload), row.id],
		);
		if (changedNome) updated += 1;
		if (changedUtility) utilityUpdated += 1;
	}
	console.log(
		JSON.stringify(
			{ ok: true, total: result.rows.length, updated, utilityUpdated },
			null,
			2,
		),
	);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => db.closePool?.());
