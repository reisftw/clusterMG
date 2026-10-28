# Retiradas Maps 2.0

Modulo geografico aditivo do Retiradas. A rota nova e `/maps`; a rota legada
`/mapa` e seus contratos nao foram alterados.

## Estado da implementacao

- Mapa vetorial MapLibre com clustering, filtros, busca por cidade/bairro e
  consulta limitada por viewport ou raio.
- Minhas retiradas com coordenada exata e oportunidades com coordenada
  aproximada no backend, sem nome, telefone ou endereco do cliente.
- Solicitacao de oportunidade e fila de analise do BackOffice.
- Aprovacao local em `PENDING_EFFECTUATION`. A implementacao nao simula uma
  atribuicao no HubSoft enquanto nao houver uma integracao de escrita
  homologada.
- Radar web com `watchPosition`, raio independente, cooldown, limite por hora,
  horario de funcionamento, notificacao do navegador e simulador autorizado.
- Roteiros de OS atribuidas ao tecnico, com otimizacao deterministica por
  vizinho mais proximo.
- Feature flag para desabilitar o modulo sem reverter o restante do Retiradas.

## Dependencia e provedor cartografico

O frontend usa `maplibre-gl`. O estilo padrao e o Liberty do OpenFreeMap. Para
producao, pode-se configurar outro estilo MapLibre compativel:

```env
VITE_MAPS_STYLE_URL=https://provedor.exemplo/styles/retiradas/style.json
```

As origens cartograficas precisam estar na CSP do backend:

```env
MAPS_CSP_ORIGINS=https://tiles.openfreemap.org https://*.openfreemap.org
```

Ao trocar o provedor, incluir apenas as origens HTTPS realmente usadas pelo
style, tiles, fontes e sprites. Nao liberar `connect-src *`.

## Variaveis do backend

```env
# Rollback operacional: false desabilita endpoints e interface.
RETIRADAS_MAPS_V2_ENABLED=true

# Segredo exclusivo para o deslocamento deterministico das oportunidades.
MAPS_PRIVACY_SECRET=trocar-por-segredo-longo-e-aleatorio

# Geocodificador compativel com q/format/limit. Sem URL, o worker fica desligado.
MAPS_GEOCODER_URL=https://geocoder.exemplo/search
MAPS_GEOCODER_USER_AGENT=RetiradasMaps/2.0 contato@empresa.com.br
MAPS_GEOCODER_INTERVAL_MS=1500
MAPS_GEOCODER_TIMEOUT_MS=8000

MAPS_READ_RATE_LIMIT=120
MAPS_WRITE_RATE_LIMIT=30
```

O geocodificador nao e chamado durante atualizacoes do GPS. Ele trabalha em
fila, usa cache por hash de endereco, atualiza a fila no maximo a cada cinco
minutos e processa um endereco por intervalo. Coordenadas ja existentes em
`ordens_servico` sao priorizadas.

## Banco e migration

Aplicar, pelo runner oficial de migrations:

```text
apps/retiradas/backend/sql/102_retiradas_maps_v2.sql
```

Estruturas adicionadas:

- `maps_order_locations`
- `maps_geocode_cache`
- `maps_geocode_jobs`
- `maps_assignment_requests`
- `maps_radar_settings`
- `maps_radar_alerts`
- `maps_routes`
- `maps_route_items`

A migration e aditiva e nao remove nem recria tabelas existentes. O desenho
inicial usa indice B-tree de latitude/longitude e filtro por bounding box antes
do Haversine. PostGIS nao e requisito para homologar esta versao; deve ser
avaliado em migration futura caso volume e plano de execucao justifiquem a
extensao e ela esteja disponivel na infraestrutura corporativa.

## RBAC

Permissoes cadastradas pela migration:

- `retiradas.maps.v2.access`
- `retiradas.maps.v2.view_assigned`
- `retiradas.maps.v2.view_opportunities`
- `retiradas.maps.v2.radar`
- `retiradas.maps.v2.request_os`
- `retiradas.maps.v2.approve_request`
- `retiradas.maps.v2.reject_request`
- `retiradas.maps.v2.manage_routes`
- `retiradas.maps.v2.manage_settings`
- `retiradas.maps.v2.audit`

Todas as verificacoes operacionais sao repetidas no backend. A interface nao e
considerada uma fronteira de autorizacao.

## Endpoints

Todos os endpoints abaixo exigem sessao e `retiradas.maps.v2.access`:

```text
GET    /api/maps/health
GET    /api/maps/points
GET    /api/maps/nearby
GET    /api/maps/summary
GET    /api/maps/orders/:id
GET    /api/maps/radar/settings
PUT    /api/maps/radar/settings
POST   /api/maps/radar/evaluate
GET    /api/maps/radar/alerts
POST   /api/maps/radar/alerts/:id/dismiss
POST   /api/maps/radar/simulate
POST   /api/maps/requests
GET    /api/maps/requests
POST   /api/maps/requests/:id/approve
POST   /api/maps/requests/:id/reject
GET    /api/maps/routes
POST   /api/maps/routes
PATCH  /api/maps/routes/:id
POST   /api/maps/routes/:id/optimize
POST   /api/maps/geocoding/queue
```

Rotas de escrita tambem exigem CSRF e possuem rate limit separado.

## Privacidade

Uma oportunidade recebe no backend apenas bairro, cidade, tipo, prioridade,
distancia aproximada e uma coordenada deslocada de forma deterministica. A
resposta nao inclui nome, telefone, endereco completo ou coordenada real.

Uma OS atribuida ao tecnico pode incluir os dados operacionais necessarios e
coordenada exata. O detalhe repete permissao, titularidade e escopo regional.

## Limites do PWA

O radar web funciona enquanto o navegador mantiver a pagina ativa. Android e
Chrome podem suspender `watchPosition` quando o PWA estiver minimizado ou a tela
estiver bloqueada. Com o aplicativo fechado nao ha monitoramento continuo de
GPS por Service Worker. A interface informa essas limitacoes e nao anuncia
geofencing permanente.

Geofencing continuo exige uma futura aplicacao Android nativa ou recurso nativo
equivalente. A implementacao separa localizacao, proximidade e notificacao para
permitir essa evolucao.

## Desempenho do frontend

O shell do Maps e o motor cartografico sao carregados em etapas. No build de
homologacao desta implementacao:

- shell de `/maps`: aproximadamente 32 kB bruto / 9,5 kB gzip;
- MapLibre + canvas: aproximadamente 1,07 MB bruto / 290 kB gzip, carregado sob
  demanda apenas ao acessar o Maps;
- CSS do MapLibre: aproximadamente 70 kB bruto / 10 kB gzip.

Os assets do build possuem hash e podem usar cache imutavel do Nginx. O cliente
solicita no maximo 250 pontos por viewport em telas mobile e 500 no desktop,
com clustering no canvas. O servidor faz bounding box antes do calculo de
distancia e nao consulta o HubSoft durante movimentos de GPS.

## Homologacao

1. Criar backup normal do banco e aplicar a migration `102`.
2. Configurar `MAPS_PRIVACY_SECRET`, provedor de mapa/CSP e, opcionalmente,
   geocodificador.
3. Subir backend e frontend com `RETIRADAS_MAPS_V2_ENABLED=true`.
4. Validar `/api/maps/health` e confirmar `last_order_sync`.
5. Autorizar as permissoes somente aos perfis de teste.
6. Abrir `/maps` no desktop, Chrome Android e PWA instalado.
7. Testar GPS permitido, negado e impreciso, busca manual e raios.
8. Confirmar por inspeção de rede que oportunidades nao transportam PII nem
   coordenadas exatas.
9. Testar concorrencia de duas solicitacoes para a mesma OS; apenas uma deve ser
   aceita pelo indice parcial.
10. Aprovar e recusar pedidos. A aprovacao deve permanecer como pendente de
    efetivacao, sem alterar o HubSoft.
11. Testar radar, cooldown, agrupamento, pausa e simulador.
12. Criar e otimizar um roteiro contendo somente OS do proprio tecnico.
13. Executar `npm run verify:retiradas` e os testes manuais de regressao do mapa
    legado, dashboard, tentativas e mensageria.

## Rollback

O rollback operacional nao exige apagar tabelas:

```env
RETIRADAS_MAPS_V2_ENABLED=false
```

Reiniciar apenas o backend. Os endpoints respondem `503 MAPS_DISABLED` e nenhum
dado do modulo e removido. Se necessario, reverter o bundle frontend para o
commit anterior. Nao executar `DROP TABLE` em producao.
