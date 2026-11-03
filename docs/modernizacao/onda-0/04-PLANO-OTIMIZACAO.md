# Plano de otimizacao

1. Publicar a instrumentacao agregada com coleta detalhada desligada.
2. Coletar pelo menos 24 horas de baseline.
3. Priorizar rotas por P95, erros, espera de pool e tempo SQL.
4. Medir AutoISP, HubSoft e jobs antes de alterar timeout, cache ou concorrencia.
5. Tratar um gargalo por vez, com teste de regressao e comparacao antes/depois.

Nao faz parte desta onda: mudar tamanho do pool, periodicidade de jobs, polling,
fallbacks, contratos de API ou regras operacionais.

