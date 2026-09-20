# Recuperação dos fontes do ADM

Em 18/09/2026, os arquivos atuais de `/opt/retiradas/apps/adm` foram recuperados
via SSH da VPS `145.223.27.204` (`srv1873036`). O serviço `adm-api` estava
ativo, com diretório de trabalho `/opt/retiradas/apps/adm/backend`.
Não houve escrita, deploy, migração ou restart na VPS.

## Conteúdo restaurado

- 667 arquivos ausentes, incluindo bootstrap da API, routers, services,
  repositories, facilities, SQL, scripts, frontend, assets e manifestos.
- Oito arquivos existentes diferiam em bytes; foram preservados em backup
  antes da cópia. Parte dessas diferenças era somente de fim de linha.
- Seis arquivos eram idênticos ao conteúdo local.
- O exemplo `ops/adm-api.service.example` foi mantido na versão local com
  `svc-adm` e restrições systemd. A cópia da VPS usava `User=root` e permanece
  no snapshot para referência. Isso não indica o usuário do serviço ativo,
  que não foi inspecionado nesta recuperação.

Os fontes novos da VPS incluem mudanças funcionais em imóveis e avaliação
de fornecedores/facilities. Foram recuperados juntos para preservar seus
contratos, sem refatoração ou remoção de módulos.

Foram excluídos da transferência `.env*`, chaves `.pem`/`.key`, `.git`,
`node_modules`, uploads, dist e diretórios de versões anteriores. Não houve
dump de banco. Dependências foram reinstaladas localmente pelos lockfiles.

## Cópia de segurança local

Arquivos auxiliares ficam em `apps/adm/tmp/vps-recovery/`, ignorado pelo Git:

- `adm-source.tar.gz`: snapshot transferido.
- `source/`: snapshot extraído, antes de qualquer ajuste local.
- `local-before/`: arquivos locais substituídos.
- `recovery.json`: relação de arquivos adicionados, diferentes e idênticos.

SHA-256 do arquivo transferido:
`e8a38d0c6e562a9189728489be3e6b084f8ecef7db179658e07a31972436e170`.

## Validação após recuperação

| Verificação | Resultado |
| --- | --- |
| `npm ci --prefix apps/adm/frontend --no-audit --no-fund` | Passou; 255 pacotes |
| `npm ci --prefix apps/adm/backend --no-audit --no-fund` | Passou; 417 pacotes |
| `npm run frontend:build --prefix apps/adm` | Passou; 2.416 módulos transformados |
| Sintaxe backend (`node --check`) | 83 arquivos em `src/` e `scripts/`, sem falhas |
| `npm run backend:start --prefix apps/adm` | Interrompido pela validação de configuração: falta `DATABASE_URL` ou variáveis PostgreSQL |
| Lint/test | Manifestos recuperados não definem scripts; suites não executadas |

O build emitiu avisos de chunks maiores que 500 kB e diretivas `use client`
das dependências React Router. Isso não impediu a compilação. Não foi feito
teste visual/navegação ou teste integrado com banco.

A comparação SHA-256 dos 681 arquivos do snapshot confirmou igualdade local,
exceto pelo exemplo systemd preservado intencionalmente. `git diff --check`
identificou uma linha em branco adicional no final da página de imóveis,
já presente no arquivo da VPS; foi mantida para preservar a recuperação.

O inventário estático passou de 5 para 513 fontes e agora encontra 1.212
referências locais. As 20 ocorrências não resolvidas estão em arquivos de
teste recuperados, incluindo testes antigos que resolvem módulos usando
`createRequire` e caminhos do monorepo. A heurística atual não interpreta esse
contexto; portanto essas ocorrências não devem ser tratadas automaticamente
como imports quebrados de produção. Também não comprovam que os testes passam.

## Próxima etapa arquitetural

O baseline anterior era incompleto; não há evidência suficiente nesta etapa
para atribuir a perda local a uma atualização específica. Os fontes do servidor
foram preservados antes de reorganizar. A sequência recomendada é configurar
um banco local de desenvolvimento, validar o startup e os contratos do ADM,
e adaptar testes/lint para execução independente. Preservar os testes legados
até comprovar sua responsabilidade e uso.

As alterações continuam exclusivamente em `apps/adm/`, na branch `adm`, sem
commit: essa referência também está aberta no outro worktree registrado no
baseline histórico.
