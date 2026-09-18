-- Cada ativo passa a ter um checklist padrao proprio, definido no
-- cadastro do ativo (nao mais escolhido pelo tecnico na hora de
-- executar/devolver). on delete set null: se o modelo for removido,
-- o ativo so perde o vinculo, nao deve travar a exclusao do template.

alter table rot_assets add column if not exists checklist_template_id text references rot_checklist_templates(id) on delete set null;
