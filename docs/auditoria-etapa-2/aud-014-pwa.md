# AUD-014 - Atualizacao PWA

O service worker nao usa mais `skipWaiting` na instalacao. Quando uma versao fica pronta, o aplicativo mostra `Atualizar agora` e `Depois`. Somente a confirmacao grava uma marca de sessao, ativa o worker e autoriza o reload no `controllerchange`.

Testes provam que uma troca inesperada de controller nao recarrega a pagina e que a ativacao depende de acao explicita. O fluxo preserva o gate nativo do APK.

Validar em producao eventos `UPDATE_FOUND`/`UPDATE_READY`, taxa de atualizacao e ausencia de reload inesperado. Rollback nao envolve banco.
