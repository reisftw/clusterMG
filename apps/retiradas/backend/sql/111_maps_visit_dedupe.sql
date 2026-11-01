begin;

-- O contador anterior somava cada leitura do GPS. Como essas leituras nao
-- permitem reconstruir saidas e retornos reais, cada tecnico/O.S./dia parte
-- de uma unica visita consolidada. Novas visitas passam a exigir uma ausencia
-- minima de 60 minutos, aplicada pelo servico do Maps.
update maps_order_proximity_events
   set observations = 1
 where observations <> 1;

comment on column maps_order_proximity_events.observations is
  'Visitas consolidadas. Uma nova visita exige o intervalo de reentrada configurado no Maps.';

commit;
