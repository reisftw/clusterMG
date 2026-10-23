const db = require("../api/src/db");
const {
	generateReturnReceiptPdf,
	safeFilename,
} = require("../api/src/serviceOrders/returnReceipts/returnReceiptPdf");

async function main() {
	const result = await db.query(
		`select id, client_code, client_name, service_order_number, service_order_type,
		        company, technician_name, completed_at, equipment, created_at
		   from service_order_return_receipts
		  order by created_at asc`,
	);
	const rendered = [];
	for (const row of result.rows) {
		const pdf = await generateReturnReceiptPdf({
			receiptId: row.id,
			clientCode: row.client_code,
			clientName: row.client_name,
			serviceOrderNumber: row.service_order_number,
			serviceOrderType: row.service_order_type,
			company: row.company,
			technicianName: row.technician_name,
			completedAt: row.completed_at,
			equipment: Array.isArray(row.equipment) ? row.equipment : [],
			generatedAt: row.created_at,
		});
		rendered.push({
			id: row.id,
			filename: safeFilename(row.client_name),
			pdf,
		});
	}

	const client = await db.connect();
	try {
		await client.query("begin");
		for (const receipt of rendered) {
			await client.query(
				`update service_order_return_receipts
				    set pdf_filename = $2,
				        pdf_data = $3
				  where id = $1`,
				[receipt.id, receipt.filename, receipt.pdf],
			);
		}
		await client.query("commit");
	} catch (error) {
		await client.query("rollback");
		throw error;
	} finally {
		client.release();
	}

	console.log(`[return-receipts] ${rendered.length} comprovante(s) reemitido(s).`);
}

main()
	.catch((error) => {
		console.error("[return-receipts] Falha na reemissao:", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await db.closePool();
	});
