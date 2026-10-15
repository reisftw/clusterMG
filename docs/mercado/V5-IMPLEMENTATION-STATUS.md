# Mercado de Retiradas V5/V5.1 - Status

## Entregue no código

- Cadastro público independente PF/PJ, validação de CPF/CNPJ, senha Argon2id e confirmação de e-mail por token de uso único.
- Endereço cadastral obrigatório, consulta de CEP com fallback ViaCEP e correção manual preservada.
- Estrutura privada para documentos, upload limitado a PDF/PNG/JPEG com assinatura conferida, nomes aleatórios, cifragem AES-256-GCM e sem URL pública permanente.
- Perfil do prestador para envio documental e situação de e-mail, documento e habilitação.
- Fluxo administrativo de listagem/decisão, com justificativa obrigatória para reprovação ou correção e histórico de análise.
- Migrations `077`, `078` e `079`, todas aditivas; nenhuma é executada no boot ou no deploy.
- Configuração Nginx versionada para `mercado.retiradas.tech` e API same-origin no novo host.
- GeoJSON oficial IBGE de Minas Gerais com 853 municípios baixado por script reproduzível em `apps/retiradas/backend/scripts/download-ibge-mg-geojson.mjs`.

## Proteção de dados de OS

O mapa e as prévias de lote retornam somente agregados por cidade/equipamento. A OS só é retornada pela API do prestador depois de `liberada_em`; a liberação é de três em três e o grupo seguinte depende de conclusão válida do anterior. Rotas de detalhe, evidência, tentativa e agendamento verificam o mesmo escopo. A proteção não depende de desfoque da interface.

## Condições antes de abertura externa

1. Aplicar as migrations no banco de homologação e executar os testes integrados.
2. Definir `MERCADO_DOCUMENTS_ENCRYPTION_KEY` e `MERCADO_DOCUMENTS_DIR` com permissões privadas e backup cifrado.
3. Configurar SMTP e testar e-mail de confirmação.
4. Instalar varredura antimalware no fluxo de armazenamento e acordar a política de retenção LGPD.
5. Emitir/instalar o certificado de `mercado.retiradas.tech`, habilitar o vhost e validar HTTPS antes de expor o cadastro.

## Validações executadas localmente

- `node --check` dos novos módulos do Mercado e do app.
- `node --test apps/retiradas/backend/api/src/mercado/progressivePrivacy.test.js`.
- `npm run build:retiradas`.

Não foram executados e-mail real, upload real, migration, consulta de CNPJ nem testes integrados com banco porque esta worktree não tem credenciais de homologação nem configuração segura de armazenamento/SMTP.
