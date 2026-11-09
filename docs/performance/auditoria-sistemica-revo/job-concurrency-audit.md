# Auditoria de concorrência dos jobs

MAPA e MATCH usam locks persistidos no PostgreSQL, portanto a exclusão mútua continua válida entre processos. O cache de leitura é local por processo; isso é suficiente na produção atual, que executa uma única instância da API, e não protege contra reconstruções duplicadas em uma futura escala horizontal.

Na janela pré-deploy mais recente:

- MAPA: 67 execuções, 49 falhas e 32 timeouts.
- MATCH: 61 execuções, 42 falhas e 23 timeouts.
- META_D0: 70 execuções e 26 falhas.

A causa de amplificação confirmada era retry imediato em camadas e repetição do scheduler após falha. A correção aplica espera padrão de 15 minutos após tentativa falha, mantém o horário de último sucesso separado e evita duas execuções de LOJA no mesmo ciclo.

Rollback de comportamento: `HUBSOFT_FAILURE_RETRY_MINUTES=1` e `HUBSOFT_MAP_MATCH_RETRY_ATTEMPTS=2`.
