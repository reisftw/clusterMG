const db = require("../api/src/db");
const { reconcileAppointmentsWithMapa } = require("../api/src/agendamentoMapaReconciliation");

async function main() {
  const result = await reconcileAppointmentsWithMapa({
    reason: "manual_script_mes_atual_e_anterior",
    monthsBack: 1,
    user: {
      uid: "script",
      nome: "Script de conciliação",
      role: "admin",
    },
  });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error("[reconcile-agendamentos-mapa] Falha:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.closePool().catch(() => {});
  });
