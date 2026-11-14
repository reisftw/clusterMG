# AUD-012 - Timeouts e resiliencia

HubSoft recebeu timeout configuravel, no maximo tres tentativas para falhas transitórias, backoff exponencial com jitter e limite de seis chamadas simultaneas por processo. Operacoes mutaveis nao sao repetidas automaticamente.

As operacoes administrativas Evolution receberam limite configuravel de 15 segundos e erro 504 identificavel. A fila continua responsavel por retry de eventos recebidos.

Configuracoes: `HUBSOFT_REQUEST_TIMEOUT_MS`, `HUBSOFT_REQUEST_MAX_ATTEMPTS`, `HUBSOFT_REQUEST_BACKOFF_MS`, `HUBSOFT_MAX_CONCURRENCY` e `MENSAGERIA_EVOLUTION_REQUEST_TIMEOUT_MS`.

Validar P95/P99, timeouts, falhas externas, chamadas por operacao e espera do pool. Rollback remove os limites novos sem alterar dados.
