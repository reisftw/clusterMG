# Baseline e mapa arquitetural do ADM

> Registro histórico anterior à recuperação. Consulte
> [recuperação da VPS](recuperacao-vps.md) para o estado atual; as ausências
> descritas abaixo se referem ao checkout original, não aos fontes recuperados.

Inspeção em 18/09/2026, commit `a53ef84`, Node `v24.11.1`, npm `11.6.2`.
Escopo de escrita: somente `apps/adm/`. Nenhuma remoção ou mudança funcional.

## Branch e integridade do checkout

O worktree `223f/retiradas` começou limpo em HEAD destacado. Foi associado à
branch `adm`, que já apontava para `a53ef84`, com
`git switch --ignore-other-worktrees adm`. Ela também está aberta em
`C:/Users/rodri/Desktop/vps-producao/retiradas-adm`, cujo status estava limpo.
Nenhum commit foi criado para não mover a referência compartilhada com esse
outro checkout. Antes de futuros commits, coordenar o uso exclusivo da branch.

Não há sparse checkout nem `AGENTS.md` encontrado no repositório. O baseline
contém 15 arquivos versionados no ADM: cinco fontes JS/JSX, seis imagens,
manifesto e lockfile do backend, e dois arquivos de operação. A ausência dos
fontes não resulta de dependências npm faltantes.

## Validação executada

| Verificação | Resultado |
| --- | --- |
| `npm run --prefix apps/adm/backend` | Somente `api:start`, `api:dev` e `migrate` |
| `npm run api:start --prefix apps/adm/backend` | `MODULE_NOT_FOUND`: falta `backend/src/index.js` |
| Build/lint/test do backend | Scripts não definidos |
| Build do frontend | Falta `frontend/package.json` |
| `node --check` nos três JS do backend e no serviço de sessão | Passou; não resolve imports nem executa a aplicação |
| Diagnóstico estático | 57 referências locais, 56 não resolvidas, cinco fontes examinados |
| Dependências instaladas | Sem `node_modules` na raiz ou no backend ADM |

O script `migrate` também aponta para um arquivo ausente:
`backend/scripts/run-sql-migrations.js`. Não foi executado: não há migração
disponível para validar. `api:dev` usa o mesmo entrypoint ausente de `api:start`.
Não há suite própria de testes ou configuração de lint no ADM. JSX não foi
validado por parser/build; `node --check` não suporta essa entrada.

Os scripts da raiz não validam um ADM independente: Vite usa a entrada raiz,
Vitest inclui `src/**/*.{test,spec}.{js,jsx}`, e os blocos principais do ESLint
cobrem `src/` e `vps/`, sem regras equivalentes para a aplicação em `apps/adm/`.

## Mapa físico

| Parte | Presente | Dependências / lacunas |
| --- | --- | --- |
| Composição HTTP | `backend/src/app.js` (~6 mil linhas), exporta `createApp` | 49 imports locais: 48 ausentes; falta bootstrap/listener |
| Persistência de imóveis | `backend/src/imoveisRepository.js` | `./db` ausente; consultas PostgreSQL |
| Observabilidade | `backend/src/observabilidade/prometheusMetrics.js` | `prom-client`, registry `adm-api`; import resolvido em `app.js` |
| Tela de imóveis | `frontend/src/modules/imoveisAdministrativos/components/ImoveisAdministrativosPage.jsx` | Seis imports locais ausentes; React, router, XLSX, jsPDF e Lucide |
| Sessão | `frontend/src/services/vpsAuthSession.js` | `./errorTracking` ausente; cookies, localStorage e sessão em memória |
| Assets | `frontend/public/` | Seis PNGs; não constituem shell, manifesto PWA ou build |
| Operação | `ops/adm-api.service.example` | Aponta para entrypoint ausente; não foi aplicado |

### Backend

`app.js` ainda reúne autenticação, administração de usuários, documentos,
imóveis, facilities, agendamentos, atendimento, logística, mensageria,
integrações e tarefas periódicas. Os nomes de domínio não são evidência de
código sem uso. Excluir routers ou pacotes para fazer o startup passar mudaria
o produto sem comprovar a segurança da mudança.

O repositório de imóveis usa as tabelas `imoveis`, `imoveis_config`,
`imoveis_anexos` e `imoveis_eventos_financeiros`, com mapeamento de coleções
legadas. A camada `db`, schema e migrações não estão presentes no ADM.
Autenticação, permissões, realtime, DTOs e demais routers também estão ausentes.

Dos 56 imports ausentes, 55 têm um candidato de mesmo caminho em `vps/api/src/`
ou `src/`. `./facilities` não tem candidato nesse mapeamento. Esses arquivos
foram apenas localizados: não há comprovação de equivalência ou fechamento
das dependências transitivas. O diagnóstico lista cada relação individualmente.

O manifesto backend é CommonJS e declara dependências de HTTP, PostgreSQL,
autenticação, S3, Google APIs, email, documentos, imagens e push. A inexistência
dos consumidores completos impede classificar pacotes como dispensáveis.

### Frontend

Faltam `package.json`, HTML de entrada, bootstrap React, roteador, estilos e
configuração de build próprios. A página de imóveis depende de `ModalShell`,
permissões, `AuthContext`, branding de PDF, serviço de imóveis e relatórios.
O serviço de sessão depende de error tracking. Os candidatos correspondentes
do legado devem ser comparados antes de qualquer cópia.

A chave de sessão e o cookie CSRF ainda usam prefixos `retiradas`. Alterá-los
exige validar login, refresh, logout e compatibilidade com o backend; esta
etapa não alterou esses contratos.

### Dependências operacionais

O exemplo systemd usa `/opt/retiradas/apps/adm/backend` como diretório de
trabalho, lê `/opt/retiradas/apps/adm/.env` e executa como `svc-adm`.
Prevê escrita em `backend/uploads` e `/opt/retiradas/backups/adm-postgres`.
`app.js` usa `UPLOADS_DIR` ou `cwd/uploads`, com avatares em `avatars/`;
referencia CORS, token interno, URLs públicas e credenciais Google via ambiente.
O conjunto completo de variáveis depende dos módulos ausentes. Nenhuma
credencial foi lida e nenhum acesso a banco, VPS ou serviço externo foi feito.

## Organização incremental

1. **Concluído nesta etapa:** documentação central em `apps/adm/README.md`,
   mapa em `docs/` e diagnóstico sem dependências em `scripts/`.
2. Recuperar a origem completa do ADM, especialmente bootstrap, `facilities`,
   configuração e migrações. Comparar candidatos do legado e suas dependências
   transitivas antes de trazê-los para o ADM, em alterações temáticas.
3. Tornar backend e frontend executáveis separadamente dentro de `apps/adm/`;
   então instalar pelos lockfiles e validar startup com configuração local,
   build, lint e testes de contratos relevantes.
4. Com baseline funcional, extrair composição HTTP, autenticação, imóveis,
   documentos/facilities e integrações em passos pequenos, preservando rotas,
   permissões, formatos de resposta e efeitos periódicos.
5. Só propor remoções após rastrear imports, rotas, chamadas do frontend,
   tarefas e dependências operacionais. Relatar evidências antes de remoções
   grandes. Ausência de import no recorte incompleto não prova desuso.

Este mapa descreve o checkout inspecionado, não o estado de produção. O ADM
continua sem baseline executável; a infraestrutura de diagnóstico torna essa
limitação explícita e reproduzível, sem mascará-la com mocks de produção.
