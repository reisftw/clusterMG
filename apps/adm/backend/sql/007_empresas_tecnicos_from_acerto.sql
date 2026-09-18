with source_empresas as (
  select distinct
         nullif(trim(coalesce(data->>'nome', data->>'empresa', data->>'empresa_nome', document_id)), '') as nome,
         nullif(trim(coalesce(data->>'regional', '')), '') as regional
    from app_documents
   where collection_path = 'acerto_estoque_empresas'
),
normalized as (
  select
    'emp-' || md5(upper(nome)) as document_id,
    nome,
    coalesce(regional, 'METROPOLITANA SUB2') as regional
  from source_empresas
  where nome is not null
),
tecnicos_por_empresa as (
  select
    upper(nullif(trim(coalesce(data->>'empresa', data->>'empresa_nome', '')), '')) as empresa_key,
    jsonb_agg(
      jsonb_build_object(
        'id', coalesce(data->>'id', document_id),
        'nome', coalesce(data->>'nome', data->>'tecnico', data->>'tecnicoNome', ''),
        'telefone', coalesce(data->>'telefone', data->>'celular', ''),
        'cidade', coalesce(data->>'cidade', ''),
        'status', coalesce(data->>'status', 'Ativo')
      )
      order by coalesce(data->>'nome', data->>'tecnico', data->>'tecnicoNome', document_id)
    ) filter (where nullif(trim(coalesce(data->>'nome', data->>'tecnico', data->>'tecnicoNome', '')), '') is not null) as tecnicos
  from app_documents
  where collection_path = 'acerto_estoque_tecnicos'
  group by upper(nullif(trim(coalesce(data->>'empresa', data->>'empresa_nome', '')), ''))
),
inserted as (
  insert into app_documents (path, collection_path, document_id, parent_path, data)
  select
    'empresas_tecnicos/' || normalized.document_id,
    'empresas_tecnicos',
    normalized.document_id,
    null,
    jsonb_build_object(
      'nome', normalized.nome,
      'slug', lower(regexp_replace(regexp_replace(normalized.nome, '[^[:alnum:]]+', '-', 'g'), '(^-|-$)', '', 'g')),
      'status', 'Ativa',
      'atuacao', 'Ambos',
      'regional', normalized.regional,
      'responsavel', jsonb_build_object('nome', '', 'email', ''),
      'supervisor', jsonb_build_object('uid', '', 'nome', '', 'email', ''),
      'cidades', '[]'::jsonb,
      'tecnicos', coalesce(tecnicos_por_empresa.tecnicos, '[]'::jsonb),
      'observacoes', 'Migrado automaticamente do Acerto de Estoque.',
      'criado_em', now(),
      'atualizado_em', now()
    )
  from normalized
  left join tecnicos_por_empresa
    on tecnicos_por_empresa.empresa_key = upper(normalized.nome)
  on conflict (path) do nothing
  returning document_id, data
)
update app_documents acerto
   set data = jsonb_set(coalesce(acerto.data, '{}'::jsonb), '{empresaId}', to_jsonb(emp.document_id), true)
  from (
    select document_id, upper(data->>'nome') as nome_key
      from app_documents
     where collection_path = 'empresas_tecnicos'
  ) emp
 where acerto.collection_path = 'acerto_estoque_acertos'
   and upper(nullif(trim(coalesce(acerto.data->>'empresa', acerto.data->>'empresa_nome', '')), '')) = emp.nome_key
   and nullif(trim(coalesce(acerto.data->>'empresaId', '')), '') is null;
