# Runbook de deploy - Fase 1

## Pre-condicoes

- Todos os testes frontend, backend e regras devem estar verdes.
- `npm audit --omit=dev` deve retornar zero vulnerabilidades.
- O projeto Firebase deve possuir App Check com reCAPTCHA Enterprise.
- O secret `AUDIT_HASH_SECRET` deve possuir pelo menos 32 bytes aleatorios.
- O backfill do indice de clientes deve terminar sem conflitos.
- Backup/export do Firestore deve ser concluido e validado.

## Preparacao

```powershell
firebase functions:secrets:set AUDIT_HASH_SECRET
npm --prefix functions run backfill:scheduling-index
```

O primeiro comando grava o secret no Secret Manager. O segundo executa apenas
o dry run. Se houver conflitos de codigo, o deploy deve ser interrompido.

Depois da revisao:

```powershell
npm --prefix functions run backfill:scheduling-index:apply
```

Configurar no ambiente de build:

```text
VITE_RECAPTCHA_ENTERPRISE_SITE_KEY=<site-key>
```

## Ordem obrigatoria

1. Publicar Functions novas, sem publicar regras.
2. Executar smoke tests autenticados dos comandos.
3. Publicar Hosting com o frontend server-side.
4. Confirmar que sessoes ativas usam o novo bundle.
5. Publicar regras do Firestore.
6. Executar testes de autorizacao em producao com contas de teste.
7. Observar erros e latencia por no minimo 60 minutos.

Comandos:

```powershell
firebase deploy --only functions
firebase deploy --only hosting
firebase deploy --only firestore:rules,firestore:indexes
```

## Smoke tests

- Admin importa uma carga contendo um cliente novo e um duplicado.
- Backoffice reserva e desreserva um bloco.
- Dois usuarios tentam reservar o mesmo bloco; apenas um vence.
- Primeira e segunda tentativas atualizam fila e multa.
- Agendamento aparece no mural.
- Tecnico registra recolhido e nao recolhido.
- Admin reabre multa, zera um bloco de teste e consulta logs.
- Mercado rejeita codigo invalido, aceita codigo valido e aplica rate limit.
- Escrita direta pelo SDK em bloco, metrica e log retorna permission denied.

## Rollback

### Antes das regras

Restaurar o Hosting anterior e manter as Functions novas. As Functions mantem
contrato compativel e nao exigem uso imediato.

### Depois das regras

Nao restaurar escrita direta. Restaurar apenas uma versao de Hosting que use as
Functions. Se o defeito estiver na Function, publicar a versao anterior do
comando mantendo o mesmo nome e contrato.

### Dados

- Importacoes possuem recibos e indice unico; retry nao duplica clientes.
- Em caso de divergencia, interromper novos uploads antes de reconciliar.
- Nao apagar logs ou recibos manualmente durante um incidente.

## Criterio de abortar deploy

- Qualquer teste vermelho.
- Backfill com conflito.
- App Check ausente ou 403 generalizado.
- Taxa de erro acima de 1% nos comandos.
- p95 acima de 2 segundos por 10 minutos.
- Divergencia entre bloco e catalogo.
- Qualquer escrita direta autorizada pelas regras.
