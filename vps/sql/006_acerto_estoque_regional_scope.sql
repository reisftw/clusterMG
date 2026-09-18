with target_regional as (
  select coalesce(
    (
      select data->>'nome'
        from app_documents
       where collection_path = 'regionais'
         and upper(coalesce(data->>'nome', document_id)) = 'METROPOLITANA SUB2'
       order by document_id
       limit 1
    ),
    'METROPOLITANA SUB2'
  ) as nome
)
update app_documents
   set data = jsonb_set(coalesce(data, '{}'::jsonb), '{regional}', to_jsonb(target_regional.nome), true)
  from target_regional
 where collection_path in (
   'acerto_estoque_empresas',
   'acerto_estoque_tecnicos',
   'acerto_estoque_agendas',
   'acerto_estoque_produtos',
   'acerto_estoque_acertos'
 )
   and nullif(trim(coalesce(data->>'regional', '')), '') is null;
