-- Complementa a 039: o arquivo enviado pro servidor naquele deploy estava
-- desatualizado (faltava lat/lng, adicionados numa edicao local que nao
-- foi reenviada antes de rodar a migration). code/FK/drop da 039 ja
-- aplicaram certo; só falta lat/lng dedicados em regional_cidades.

alter table regional_cidades add column if not exists lat numeric(10,6);
alter table regional_cidades add column if not exists lng numeric(10,6);

update regional_cidades
   set lat = coalesce(lat, (source_payload->>'lat')::numeric),
       lng = coalesce(lng, (source_payload->>'lng')::numeric)
 where source_payload ? 'lat' or source_payload ? 'lng';
