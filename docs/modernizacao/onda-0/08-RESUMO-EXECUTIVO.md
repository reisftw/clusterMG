# Resumo executivo

A Onda 0.1 prepara o Retiradas para descobrir os gargalos reais sem mudar
regras de negocio. A telemetria e agregada, limitada e gravada em lote. O modo
padrao evita SQL detalhado e custa aproximadamente 0,007 ms por requisicao no
teste sintetico local.

Foram fechados riscos de privacidade, cardinalidade, concorrencia do flush e
DDL em runtime. A publicacao depende do teste PostgreSQL descartavel no CI. A
baseline produtiva continua pendente e nenhuma afirmacao de ganho real sera
feita antes da coleta.

