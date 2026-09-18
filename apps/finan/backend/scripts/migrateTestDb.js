// Wrapper cross-plataforma (sem depender de `VAR=valor comando`, que nao
// funciona igual em cmd.exe/PowerShell/sh) para aplicar as migrations do
// Finan contra o Postgres de TESTE (docker-compose.test.yml).
//
// Nunca aponta para producao: define NODE_ENV=test e usa
// FINAN_TEST_DATABASE_URL (ou o default do docker-compose.test.yml) como
// FINAN_DATABASE_URL antes de chamar o runner real de migrations.
process.env.NODE_ENV = "test";
process.env.FINAN_DATABASE_URL =
	process.env.FINAN_TEST_DATABASE_URL ||
	"postgres://finan_test:finan_test_only_local@127.0.0.1:55432/finan_test";

require("./run-sql-migrations.js");
