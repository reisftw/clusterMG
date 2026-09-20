alter table document_required_fields
  add column if not exists publico_alvo text not null default 'ambos';

update document_required_fields
set publico_alvo = 'ambos'
where publico_alvo is null or trim(publico_alvo) = '';

create index if not exists document_required_fields_publico_alvo_idx
  on document_required_fields (publico_alvo);
