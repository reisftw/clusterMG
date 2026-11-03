# Gargalos identificados

1. A instrumentacao detalhada normalizava SQL mesmo quando estava desligada.
2. O flush usava uma chave global para suspender metricas e podia ocultar
   consultas concorrentes.
3. `rawQuery()` nao separava espera de pool e duracao da consulta.
4. Integracoes externas e jobs nao tinham duracao agregada por etapa.
5. Nao havia P50/P99, espera de pool ou tamanho agregado das respostas no painel.
6. A migration 113 ainda precisa da aprovacao do teste PostgreSQL no CI antes
   da publicacao.

As proximas otimizacoes de regra de negocio dependem da baseline produtiva;
nao foi criado cache ou alterado polling sem evidencias.

