alter table retorninho_config
  alter column ai_model set default 'gemini-flash-latest';

update retorninho_config
   set ai_model = 'gemini-flash-latest',
       updated_at = now()
 where ai_model = 'gemini-2.5-flash';
