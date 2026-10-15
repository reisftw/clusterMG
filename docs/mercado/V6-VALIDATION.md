# Validação V6 do Mercado

## Técnica

```bash
curl -fsS https://mercado.retiradas.tech/api/health
curl -I https://mercado.retiradas.tech/mercado
curl -I https://mercado.retiradas.tech/mercado/favicon.svg
nginx -t
```

## Funcional

1. Abrir `/mercado` em desktop e celular.
2. Confirmar que o favicon e a marca são do Mercado.
3. Criar ou entrar em uma conta de prestador de teste.
4. Verificar zoom, pan, legenda e clique no mapa de Minas Gerais.
5. Pesquisar cidade, montar lote e abrir "Meus lotes".
6. Validar que as APIs públicas não retornam OS, endereço, cliente, técnico ou dados de empresas bloqueadas.

## Segurança

As respostas abertas ao prestador devem conter apenas contagens agregadas por município e equipamento. Detalhes de execução só podem aparecer após autenticação e autorização no backend.
