# Publicação

Uma única execução manual de `deploy-retiradas.yml` deve partir de `master`, depois de CI verde, com:

- `release_version`: versão rastreável desta entrega;
- `publish_android`: `true`, para publicar o APK 1.0.6 do mesmo commit.

O workflow valida, empacota, verifica checksums, faz backup, publica backend e frontend com rollback e chama a publicação Android assinada. Não há deploy manual ou intermediário.

Pós-deploy obrigatório: health público, login/RBAC, cabeçalhos de cache, leitura e marcação de notificações, jobs MAPA/MATCH/META/LOJA/MULTAS, download/versão do APK e comparação da mesma janela de métricas.
