# Mercado de Retiradas V6

## Escopo

O Mercado possui identidade visual própria em `mercado.retiradas.tech`, mantendo o banco `retiradas` como fonte de dados operacional. Não há banco externo nem cópia de OS para o portal.

## Interface

- Layout claro, responsivo e com navegação lateral para o núcleo interno.
- Portal independente de prestadores: entrada, cadastro PF/PJ, validação, documentos, perfil, oportunidades e lotes.
- Kit visual oficial em `apps/retiradas/frontend/public/mercado`.
- Favicon e manifesto próprios no domínio do Mercado.
- Mapa real de Minas Gerais, com os 853 municípios e geometrias locais do IBGE em `public/geodata/ibge/mg-municipios.geojson`.

## Privacidade operacional

O mapa recebe somente agregados por município e tipo de equipamento. Dados de OS, clientes, endereços, técnicos e informações internas permanecem protegidos nas rotas autenticadas. A elegibilidade é aplicada no backend antes de qualquer resposta ao prestador.

## Dependências

`leaflet` e `react-leaflet` renderizam o mapa localmente. Não são usados tiles, geocoders ou scripts de terceiros.
