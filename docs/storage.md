# Operação Image Storage

O Operação usa uma camada desacoplada para imagens de APR e Rompimentos:

React/PWA -> Attachment API -> AttachmentService/Routes -> Storage Provider Registry -> R2/S3 compatible provider.

## Providers

Novos uploads usam `STORAGE_DEFAULT_PROVIDER`. Cada anexo salva seu próprio `storage_provider`, permitindo coexistir arquivos antigos em R2 e novos em outro storage no futuro.

Provider atual:

```env
STORAGE_DEFAULT_PROVIDER=r2
R2_BUCKET=rot-site
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
```

Provider futuro S3:

```env
STORAGE_DEFAULT_PROVIDER=s3
AWS_S3_REGION=sa-east-1
AWS_S3_BUCKET=
AWS_S3_ENDPOINT=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_FORCE_PATH_STYLE=false
```

Credenciais nunca devem ir para o frontend, `VITE_*`, logs ou Git.

## Fluxo

1. Frontend comprime a imagem no dispositivo.
2. Frontend solicita `POST /api/admin/attachments/upload-url`.
3. Backend autentica, autoriza, reserva uma vaga e gera uma URL PUT assinada.
4. Frontend envia direto ao Object Storage.
5. Frontend confirma em `POST /api/admin/attachments/:id/confirm`.
6. Backend executa `HeadObject`, valida MIME/tamanho e confirma no PostgreSQL.
7. Leitura usa URLs GET assinadas curtas via `GET /api/admin/attachments`.

## Limites

- APR: mínimo 1 foto, máximo 10.
- Rompimento: mínimo 1 foto para finalizar, máximo 10.
- Upload direto: JPEG, PNG ou WebP.
- Após otimização: máximo 1 MB por imagem.
- Presigned URL: cerca de 5 minutos.
- Reservas pendentes expiram em 15 minutos.

## Banco

Tabela genérica: `rot_image_attachments`.

Campos principais:

- `entidade_tipo`: `APR` ou `ROMPIMENTO`
- `entidade_id`
- `storage_provider`
- `storage_key`
- `status`: `PENDING`, `CONFIRMED`, `FAILED`, `EXPIRED`, `REMOVED`
- metadados de MIME, tamanho, largura, altura e usuário

O banco não armazena BLOB/base64 nem URL assinada.

## CORS do bucket

Configurar o bucket privado para permitir apenas origens reais da Operação. Em produção:

- `https://rot.retiradas.tech`

Métodos:

- `PUT`
- `GET`
- `HEAD`

Headers:

- `Content-Type`

Não usar `*` em produção.

## Troca futura de provider

Para novos arquivos irem para AWS S3, configure `STORAGE_DEFAULT_PROVIDER=s3` e as variáveis `AWS_*`. Arquivos antigos com `storage_provider=r2` continuam sendo lidos pelo provider R2 enquanto existirem.

Uma migração futura poderá copiar objetos entre providers e atualizar `storage_provider`/`storage_key` no banco após validar tamanho/checksum.
