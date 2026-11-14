# Seguranca

## Corrigido

O principal limite de confianca violado era a leitura anonima de colecoes operacionais. A rota aceitava nomes permitidos, mas os registros devolvidos continham PII e dados de operacao. A correcao exige autenticacao no backend independentemente do frontend e mantem publicos apenas snapshots explicitamente agregados.

Teste automatizado verifica que:

1. nao existe `GET /api/public/documents` para colecoes;
2. o atalho compartilhado registra `requireAuthenticated`;
3. o frontend nao chama `/public/documents` para colecoes operacionais.

## Pendencias priorizadas

- Claim atomico e retry controlado no webhook Meta.
- Deduplicacao atomica e DLQ na Evolution.
- Timeout/AbortSignal padronizado nas integracoes externas.
- Criptografia ou cofre para credenciais persistidas e restricao de URLs configuraveis contra SSRF.

Nao foram exibidos, copiados ou alterados segredos. Nao houve teste invasivo em producao.

