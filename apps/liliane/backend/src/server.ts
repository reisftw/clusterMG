import { createApp } from "./app.js";
import { bootstrapAdmin } from "./bootstrap.js";
import { config } from "./config.js";
import { migrate } from "./migrate.js";

await migrate();
await bootstrapAdmin();
createApp().listen(config.port, "127.0.0.1", () => console.log(JSON.stringify({ level: "info", message: "Aprovações Lili online", port: config.port })));
