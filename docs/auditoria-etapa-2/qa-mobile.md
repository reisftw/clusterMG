# QA mobile

Cobertura automatizada: Maps incremental, apresentacao mobile existente, navegacao de rotas e fluxo PWA sem reload. O login foi renderizado sem overflow em 320, 360, 375, 390, 414, 430, 768, 1024 e 1440 px; o teste gera uma screenshot isolada por largura. O build responsivo permanece no mesmo shell e nao houve alteracao de regra de negocio.

Checklist manual pos-publicacao: 320x568, 360x800, 390x844, 412x915, tablet retrato e paisagem; teclado aberto; safe area; modal; Maps com 15 mil pontos; PWA instalado; atualizacao adiada e confirmada.

Limitacao: nesta etapa foram efetivamente renderizadas duas telas/estados do login; os fluxos autenticados dependem de credenciais de teste e dispositivos reais/APK. A entrega nao declara validacao visual manual onde ela nao foi executada.
