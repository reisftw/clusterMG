# Seguranca complementar

- Claims e locks exigem ownership; IDs fornecidos por outro worker nao concluem operacoes.
- POST HubSoft nao recebe retry automatico, evitando duplicacao de efeito.
- Payloads e segredos nao foram ampliados em logs.
- A migration nova e aditiva e passa pelo contrato de rollback.
- Busca estatica nao encontrou credenciais novas nos arquivos alterados.

`npm audit --omit=dev` do frontend: zero alertas. O backend mantem alertas moderados transitivos conhecidos em `glob/minimatch` pelas cadeias Google e Archiver; nao existe correcao compatível simultanea publicada no lock atual. Nao ha alerta alto ou critico. A troca major fica pendente de teste dedicado para nao quebrar Drive e geracao de ZIP.
