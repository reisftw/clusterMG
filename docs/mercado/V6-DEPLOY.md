# Deploy V6 do Mercado

## Pré-requisitos

- Build executado com `npm run build:retiradas`.
- Serviço `retiradas-api.service` instalado.
- Certificado e virtual host de `mercado.retiradas.tech` ativos.

## Publicação

1. Criar uma release versionada em `/var/www/mercado/releases`.
2. Extrair o conteúdo de `dist` nessa release.
3. Atualizar o symlink `/var/www/mercado/current` para a nova release.
4. Copiar o backend alterado para `/opt/retiradas/vps/api/src/mercado`.
5. Aplicar o virtual host do Mercado, testar o Nginx e recarregá-lo.
6. Reiniciar somente `retiradas-api.service`.

O virtual host aponta para `/var/www/mercado/current`; o diretório `dist` anterior é preservado como contingência.
