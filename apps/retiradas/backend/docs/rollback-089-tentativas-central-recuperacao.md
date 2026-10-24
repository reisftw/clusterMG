# Rollback 089 - Central de Tentativas

Esta migration e aditiva. O rollback operacional recomendado e desabilitar as novas rotas e manter as tabelas para preservar a auditoria.

Se a remocao estrutural for realmente necessaria, primeiro exporte `tentativas_events`, `tentativas_callbacks`, `tentativas_recoveries`, `tentativas_recovery_equipments`, `tentativas_settings_versions` e `tentativas_template_versions`. A remocao fisica deve ser executada manualmente em janela de manutencao e nunca faz parte do deploy automatico.

As colunas adicionadas nas tabelas existentes sao opcionais ou possuem valores padrao, portanto a aplicacao anterior continua compativel sem rollback de esquema.
