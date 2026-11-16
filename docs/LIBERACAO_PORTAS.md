# Liberação de Portas

## Escopo

Módulo do Retiradas para localizar ordens abertas por código de cliente e alterar
somente o tipo da O.S. para um tipo real selecionado no catálogo do HubSoft.

## Contrato HubSoft validado no código existente

- catálogo: `GET /api/v1/ordem_servico/create`;
- pesquisa: `POST /api/v1/ordem_servico/consultar/paginado/1000?page=1`;
- leitura completa e confirmação: `GET /api/v1/ordem_servico/:id`;
- alteração: `PUT /api/v1/ordem_servico/:id` com o objeto completo preservado.

O módulo não usa nomes para decidir elegibilidade. Tipos de origem, destino e
status abertos são configurados com os identificadores reais do catálogo. Sem
essa configuração, pesquisa e execução permanecem bloqueadas.

## Migration

- ID: `126_service_order_port_release.sql`.
- Módulo: Retiradas.
- Natureza: aditiva e compatível com a versão anterior.
- Estruturas: configuração, pesquisas temporárias, lotes e operações auditáveis.
- Permissões: `liberacao_portas.view`, `search`, `execute`, `history`, `export` e
  `manage`.

### Preflight

1. Confirmar backup verificável do banco.
2. Confirmar que a migration `125` está aplicada.
3. Executar o preflight oficial de migrations.
4. Aplicar a migration pelo workflow oficial, antes de reiniciar a API.
5. Selecionar em Configuração o ID real de `Liberação de Portas`, os tipos de
   origem e os status abertos para cada empresa/contexto.
6. Validar em homologação uma pesquisa sem escrita e uma alteração controlada.

### Recuperação

O rollback da aplicação é compatível com as novas tabelas. Não remover as
tabelas durante rollback: elas contêm histórico operacional. Desative o acesso
removendo as permissões do perfil e reverta somente a aplicação pelo workflow
oficial. Uma operação já confirmada no HubSoft não é revertida por transação
PostgreSQL.

## Segurança operacional

- RBAC é aplicado novamente em cada API.
- A pesquisa não altera ordens.
- A execução relê tipo e status imediatamente antes do `PUT`.
- Após o `PUT`, uma nova leitura confirma o tipo; resposta HTTP isolada não é
  considerada sucesso.
- Timeout sem confirmação vira `INDETERMINATE` e bloqueia repetição automática.
- Evidências guardam somente identificadores, tipo e status, sem tokens ou
  payload completo do HubSoft.
