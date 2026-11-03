# Etapa 2 - Rollback

## Aplicacao

O workflow preserva o backend anterior e troca o frontend por link simbolico
atomico. Se migration, restart ou healthcheck falhar, o backend anterior e
restaurado e o servico e reiniciado. O frontend so e trocado depois do backend
saudavel.

## Banco

As migrations 114-119 apenas adicionam indices. A versao anterior da aplicacao
e compativel com eles, portanto o rollback normal nao remove indices e nao
restaura o banco automaticamente.

Se houver degradacao comprovada causada por um indice, sua remocao deve ser uma
acao manual separada com `DROP INDEX CONCURRENTLY`, um indice por vez, depois de
preservar evidencias. O dump custom validado antes da migration e a ultima
barreira para incidente de dados, mas nao deve ser restaurado para reverter
indices aditivos.

## Cache

O cache do resumo operacional e local ao processo. Reiniciar a API o elimina.
Para rollback completo da Etapa 2, publicar o commit anterior pelo mesmo
workflow; nao e necessaria limpeza de cache ou mudanca de dados.

## Criterios de interrupcao

Interromper e manter a versao anterior se houver teste critico falho, backup
invalido, indice invalido, lock persistente, regressao de autenticacao/RBAC,
erro 5xx novo ou degradacao severa de latencia.
