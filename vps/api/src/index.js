const { createApp } = require("./app");
const db = require("./db");
const apiStatus = require("./apiStatus");
const evolutionMessaging = require("./evolutionMessaging");
const agendamentoConfirmacao = require("./agendamentoConfirmacao");
const { closeRealtimeClients } = require("./realtime");

const port = Number(process.env.PORT || 3001);
const app = createApp();

const server = app.listen(port, () => {
  console.log(`[retiradas-api] ouvindo em http://127.0.0.1:${port}`);
  evolutionMessaging.startWorker();
  agendamentoConfirmacao.startWorker();
  apiStatus.recordRuntimeEvent("startup", {
    port,
    reason: "process_started",
  });
});

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[retiradas-api] Encerrando por ${signal}...`);
  evolutionMessaging.stopWorker();
  agendamentoConfirmacao.stopWorker();
  closeRealtimeClients();

  const forceExit = setTimeout(() => {
    console.error("[retiradas-api] Encerramento excedeu 10s. Forcando saida.");
    process.exit(1);
  }, 10000);
  forceExit.unref?.();

  try {
    await apiStatus.recordRuntimeEvent("shutdown", {
      signal,
      reason: "process_signal",
    });
  } catch (error) {
    console.warn("[retiradas-api] Falha ao registrar evento de shutdown:", error?.message || error);
  }

  server.close(async () => {
    await db.closePool().catch(() => {});
    clearTimeout(forceExit);
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("uncaughtException", async (error) => {
  console.error("[retiradas-api] uncaughtException:", error);
  await apiStatus.recordRuntimeEvent("uncaughtException", {
    reason: error?.message || "uncaughtException",
    stack: String(error?.stack || "").slice(0, 4000),
  });
  process.exit(1);
});
process.on("unhandledRejection", async (reason) => {
  console.error("[retiradas-api] unhandledRejection:", reason);
  await apiStatus.recordRuntimeEvent("unhandledRejection", {
    reason: reason?.message || String(reason || "unhandledRejection"),
    stack: String(reason?.stack || "").slice(0, 4000),
  });
});
