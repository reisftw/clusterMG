# Central de Tentativas e Recuperacao

Modulo operacional para contato manual, retorno programado, agendamento e recuperacao de equipamentos de clientes que permanecem em aberto no Match.

## Fonte e reconciliacao

- A fonte operacional e `ordens_servico`, com `source_collection = 'match_os_abertas'`.
- A sincronizacao materializa os registros em `tentativas_opportunities` sem apagar historico.
- A conciliacao horaria inativa oportunidades que sairam do Match, conclui a esteira e libera a atribuicao.
- Telefones podem ser reaproveitados das fontes locais de mapa, mensageria, callbacks e agendamentos. O frontend nunca consulta o HubSoft diretamente.
- Bairro, latitude e longitude so sao utilizados quando existem na origem. O modulo nao inventa coordenadas.
- A carteira pode ser filtrada por cidade e bairro. Distancias em metros ou quilometros usam Haversine entre a posicao autorizada do dispositivo e coordenadas reais da oportunidade.

## Regras de contato

1. Abrir o WhatsApp cria um contato com estado `OPENED`; isso nao significa mensagem enviada.
2. O operador confirma manualmente se enviou a mensagem e registra o resultado.
3. A janela de duplicidade considera cliente, OS e telefone durante o periodo configurado.
4. Uma politica `WARN` avisa e permite sobrescrita autorizada; `BLOCK` impede novo contato.
5. Retornos combinados viram registros em `tentativas_callbacks` e geram notificacoes deduplicadas.
6. Correcoes administrativas exigem justificativa e geram evento imutavel.

Resultados distinguem falta de resposta, resposta com agendamento, entrega em loja, pedido de retorno, recusa, numero invalido ou indisponivel, equipamento ja devolvido e equipamento nao localizado.

## Recuperacao

- Intencao de devolucao e agendamento nao contam como recuperacao.
- A recuperacao segue uma maquina de estados validada no backend.
- `RECOVERY_CONFIRMED` exige pelo menos um equipamento e evidencia em PDF, JPG, PNG ou WEBP.
- Evidencias ficam em `/api/uploads/tentativas`, protegidas pela autenticacao da API.
- Um MAC ou serial confirmado nao pode ser contabilizado em outra recuperacao.
- A validacao registra origem, usuario, data, equipamentos e evento de auditoria.

## Prioridade explicavel

O score e normalizado de 0 a 100. Os pesos ficam em `tentativas_settings.score_weights` e sao versionados. Fatores atuais:

- tempo da OS em aberto;
- quantidade de equipamentos;
- historico de tentativas;
- historico de resposta;
- retorno pendente;
- tempo sem contato.

Cada oportunidade salva `priority_score`, `priority_factors` e `recommended_action`. O detalhe apresenta as contribuicoes; nao ha modelo opaco ou dado simulado.

## Dados e auditoria

- `tentativas_settings` e `tentativas_settings_versions`: politica e versoes.
- `tentativas_templates` e `tentativas_template_versions`: mensagens e versoes.
- `tentativas_opportunities`: oportunidade sincronizada.
- `tentativas_technician_cities`: cobertura territorial.
- `tentativas_assignments`: atribuicao ativa e transferencias.
- `tentativas_contacts`: contatos declarados pelo operador.
- `tentativas_callbacks`: retornos programados.
- `tentativas_recoveries`: acompanhamento da devolucao.
- `tentativas_recovery_equipments`: equipamentos confirmados.
- `tentativas_events`: linha do tempo imutavel.
- `tentativas_campaigns` e `tentativas_campaign_items`: distribuicoes pontuais.

## Permissoes

- `tentativas.visualizar`
- `tentativas.contatar`
- `tentativas.registrar`
- `tentativas.agendar`
- `tentativas.historico.visualizar`
- `tentativas.carteiras.gerenciar`
- `tentativas.gestao.visualizar`
- `tentativas.relatorios.exportar`
- `tentativas.auditoria.visualizar`
- `tentativas.registros.corrigir`
- permissoes legadas continuam aceitas durante a transicao.

## Endpoints principais

- `GET /api/tentativas/cidades`
- `GET /api/tentativas/localidades`
- `GET /api/tentativas/minha-rota`
- `GET /api/tentativas/:id`
- `GET /api/tentativas/:id/timeline`
- `POST /api/tentativas/:id/iniciar`
- `POST /api/tentativas/:id/retornos`
- `POST /api/tentativas/contacts/:id/resultado`
- `PUT /api/tentativas/contacts/:id/corrigir`
- `GET /api/tentativas/retornos`
- `PUT /api/tentativas/retornos/:id`
- `GET /api/tentativas/recuperacoes`
- `PUT /api/tentativas/recuperacoes/:id/status`
- `POST /api/tentativas/recuperacoes/:id/evidencias`
- `GET /api/tentativas/produtividade`
- `GET /api/tentativas/historico`
- `GET /api/tentativas/historico/export.csv`
- `GET /api/tentativas/admin/analytics`
- `GET /api/tentativas/admin/analytics/export.csv`
- `GET /api/tentativas/admin/inteligencia`
- `GET /api/tentativas/admin/auditoria`
- `POST /api/tentativas/admin/recalcular-prioridades`
- `POST /api/tentativas/admin/atribuicoes/:id/transferir`
- endpoints administrativos legados de distribuicao, cidades, campanhas, templates e configuracoes permanecem ativos.

## Operacao e rollback

- A migration `089_tentativas_central_recuperacao.sql` e aditiva e idempotente.
- O deploy deve executar preflight, migration e testes antes de reiniciar a API.
- A migration nao remove dados existentes.
- O procedimento de recuo esta em `rollback-089-tentativas-central-recuperacao.md`.
