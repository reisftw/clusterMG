# Liberação de Portas

## Escopo

Módulo do Retiradas para localizar atendimentos finalizados em um mês ou período,
cruzá-los com ordens abertas do mesmo cliente e normalizar automaticamente a O.S.
para Liberação de Portas. A execução é persistida no backend e continua mesmo que
o operador feche a página.

## Contrato HubSoft validado no código existente

- catálogo: `GET /api/v1/ordem_servico/create`;
- catálogo de atendimentos: `GET /api/v1/atendimento/create`;
- atendimentos finalizados: `POST /api/v1/atendimento/consultar/paginado/1000?page=N`;
- pesquisa: `POST /api/v1/ordem_servico/consultar/paginado/1000?page=1`;
- leitura completa e confirmação: `GET /api/v1/ordem_servico/:id`;
- cancelamento de agenda: `GET /api/v1/configuracao/geral/agenda_ordem_servico/cancelar_agendamento/:id`;
- alteração: `PUT /api/v1/ordem_servico/:id` com o objeto completo preservado.

O módulo não usa nomes para decidir elegibilidade. Tipos de origem, destino e
status abertos são configurados com os identificadores reais do catálogo. Sem
essa configuração, pesquisa e execução permanecem bloqueadas.

## Migration

- ID: `126_service_order_port_release.sql`.
- Extensão automática: `130_port_release_automatic_scans.sql`.
- Módulo: Retiradas.
- Natureza: aditiva e compatível com a versão anterior.
- Estruturas: configuração, pesquisas temporárias, varreduras persistentes, lotes
  e operações auditáveis.
- Permissões: `liberacao_portas.view`, `search`, `execute`, `history`, `export` e
  `manage`.

### Preflight

1. Confirmar backup verificável do banco.
2. Confirmar que a migration `125` está aplicada.
3. Executar o preflight oficial de migrations.
4. Aplicar a migration pelo workflow oficial, antes de reiniciar a API.
5. Selecionar em Configuração o ID real de `Liberação de Portas`, os tipos de
   origem e os status abertos para cada empresa/contexto.
6. Validar em homologação uma varredura curta e uma alteração controlada.

### Recuperação

O rollback da aplicação é compatível com as novas tabelas. Não remover as
tabelas durante rollback: elas contêm histórico operacional. Desative o acesso
removendo as permissões do perfil e reverta somente a aplicação pelo workflow
oficial. Uma operação já confirmada no HubSoft não é revertida por transação
PostgreSQL.

Para desativar somente o fluxo automático, remova a permissão
`liberacao_portas.execute` dos cargos e aguarde o lote atual terminar. A tabela
`service_order_port_release_scans` deve permanecer para preservar a auditoria.

## Segurança operacional

- RBAC é aplicado novamente em cada API.
- Apenas o comando explícito de iniciar a verificação cria operações; abrir a
  página ou consultar o progresso não altera ordens.
- A execução relê tipo e status imediatamente antes do `PUT`.
- A agenda existente é cancelada antes da alteração.
- O destino confirmado exige tipo Liberação de Portas, técnico `FILA`, status
  `aguardando_agendamento`, horários `00:00`/`00:01`, duração `00:59:00` e
  ausência de agenda ativa.
- Após o `PUT`, uma nova leitura confirma todos esses campos; resposta HTTP
  isolada não é considerada sucesso.
- Timeout sem confirmação vira `INDETERMINATE` e bloqueia repetição automática.
- Evidências guardam somente identificadores, tipo e status, sem tokens ou
  payload completo do HubSoft.
