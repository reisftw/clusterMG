# Retiradas - estabilizacao final de 2026-10-17

## Escopo congelado

Esta entrega trata somente do sistema Retiradas. Nao inclui mudancas funcionais,
visuais ou de fluxo do Mercado de Retiradas, Finan, ADM ou Operacao.

Base inicial auditada: `master` em `7f32222`.

## Auditoria RBAC

- Catalogo ativo conferido no banco de producao: 141 permissoes e 11 cargos ativos.
- Cadeia revisada: `app_roles` e `app_role_permissions`, enriquecimento do
  usuario autenticado, cache de perfil, `requireAuthenticated`,
  `requireAnyPermission`, guards de frontend e rotas de dominio.
- Divergencias reais corrigidas: 3 grupos de falha.

| Achado | Correcao | Validacao |
| --- | --- | --- |
| Paginas usavam somente `currentUser.role`, descartando permissoes dinamicas carregadas no perfil | As 11 telas afetadas agora passam o usuario completo para `hasPermission` | Testes de permissao dinamica no frontend |
| Alteracoes de cargo aguardavam expiracao do cache de perfil | A atualizacao de cargo invalida o cache dos usuarios daquele cargo | Caracterizacao de `PUT /api/admin/roles/:roleId` |
| Stream SSE aceitava conexao sem sessao e podia retransmitir payload operacional | O stream padrao exige sessao; o modo publico aceita apenas topicos permitidos e transmite somente metadados de invalidacao | Teste de sanitizacao do SSE |

### Caso obrigatorio: QR Code da Mensageria

Endpoint: `POST /api/mensageria/evolution/connect`.

- Backend: autenticacao, CSRF e `mensageria.api.manage`.
- Frontend: a acao usa as permissoes efetivas do usuario, nao o nome fixo do cargo.
- O papel `backoffice_retirada` permanece um cargo delegavel; nao recebe
  privilegios de administrador para executar a acao.

| Cenario | Resultado coberto |
| --- | --- |
| Sem sessao | 401 |
| BackOffice sem permissao | 403 |
| ADMIN | 200 |
| BackOffice com `mensageria.api.manage` | 200 |
| Cargo personalizado com a mesma permissao | 200 |

O endpoint nao recebe identificador de recurso controlado pelo cliente. As
operacoes de recursos identificaveis continuam passando pelas validacoes de
escopo existentes nos respectivos routers e services.

## Inventario de endpoints

Arquivo gerado: `docs/release/retiradas-endpoint-inventory.json`.

Comando reprodutivel:

```bash
node scripts/audit-retiradas-endpoints.cjs
```

O inventario possui 366 handlers HTTP registrados no codigo, com metodo,
caminho completo, caminho local do router, ponto de montagem, arquivo
controlador, linha e gates detectados.

| Politica detectada | Quantidade |
| --- | ---: |
| Autenticacao + papel | 34 |
| Autenticacao + CSRF + papel | 37 |
| Autenticacao + permissao | 83 |
| Autenticacao + CSRF + permissao | 68 |
| Autenticacao | 47 |
| Autenticacao + CSRF | 64 |
| Publica ou com gate customizado | 33 |
| Total | 366 |

As 33 rotas classificadas como publica/custom foram revisadas por categoria:
health checks, leituras publicas com rate limit/allowlist, login e configuracao
de provedores, webhooks validados por segredo e rotas internas validadas por
token. A classificacao e deliberadamente conservadora: o gerador marca
validacoes implementadas dentro de controllers como `public-or-custom`, para
nao alegar uma protecao que o analisador estatico nao consegue provar.

As protecoes por cargo retidas concentram configuracao de integracoes, backup,
operacoes manuais de alto impacto e escopos operacionais. Elas nao foram
convertidas em permissoes genericas sem uma politica de delegacao existente.

Nao foram executadas chamadas destrutivas, sincronizacoes externas ou webhooks
contra producao durante a auditoria. Esses handlers foram inventariados e
revisados estaticamente, mas permanecem fora da cobertura de integracao deste
release para evitar efeitos colaterais.

## Testes e qualidade

| Verificacao | Resultado |
| --- | --- |
| Testes focados de RBAC e SSE | 42 aprovados |
| Suite Retiradas serial | 71 arquivos, 392 testes aprovados |
| Lint Retiradas | aprovado |
| Build de producao Retiradas | aprovado |
| `git diff --check` | aprovado |
| `npm audit --omit=dev --audit-level=high` | sem vulnerabilidades altas ou criticas |

O `npm audit` reportou uma vulnerabilidade de severidade baixa em `dompurify`.
Nenhuma atualizacao de dependencia foi feita nesta estabilizacao para evitar
alterar o lockfile fora da necessidade do release.

Os avisos de `act(...)` nos testes React e mensagens dos mocks de servicos
HubSoft/e-mail sao preexistentes nos cenarios isolados; a suite terminou verde.

## Publicacao e rollback

O commit final e os hashes de `master` e `homolog-dev` sao registrados apos a
publicacao, no fim deste documento e no relatorio operacional do release.

O rollback de codigo segue `docs/DEPLOY-ROLLBACK.md`: reverter o commit de
release em nova revisao, publicar pela pipeline normal e, somente se uma
migration exigir, restaurar o backup confirmado imediatamente anterior.

## Pacote corporativo

O pacote corporativo usa o procedimento existente em
`ops/vm-migration/scripts/prepare-packages.ps1`. O script agora recebe
`-RetiradasApiBaseUrl`; o release corporativo deve ser construido com
`https://retiradas.sempre.net.br/api`, sem copiar arquivos de ambiente nem
credenciais.

A instalacao na VM corporativa nao faz parte desta entrega. O bundle gerado
inclui checksum, instrucoes de instalacao, validacao pos-instalacao e rollback.

## Encerramento

O escopo funcional esta congelado apos esta estabilizacao. Alteracoes futuras
devem se limitar a manutencao operacional, seguranca ou correcoes criticas
aprovadas separadamente.
