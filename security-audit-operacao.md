# Auditoria Técnica de Segurança - Operação

Data da auditoria: 2026-09-14  
Escopo: aplicação Operação (`apps/rot`), backend Node/Express, frontend PWA, rotas administrativas, integrações, armazenamento de imagens, RBAC e configuração passiva da VPS `operacao.retiradas.tech`.  
Modo de auditoria: análise estática/local + verificação passiva da VPS. Não foi realizado pentest ativo, brute force, fuzzing destrutivo ou exploração de vulnerabilidades.

## Sumário Executivo

A aplicação Operação evoluiu bastante em controles básicos de segurança: autenticação com hash forte (`argon2`), sessão com cookie `HttpOnly`, validação de sessão no banco, MFA por e-mail, CORS com allowlist, rate limit global e específico para login/MFA/reset, CSP, cabeçalhos HTTP, auditoria básica e separação de storage para imagens.

O principal risco atual não está em uma falha única óbvia, mas em maturidade operacional: o serviço ainda roda como `root` na VPS, o deploy de Operação é manual e não está formalizado no CI/CD, há muitos módulos novos não versionados/dirty na workspace local, uploads ainda dependem majoritariamente de MIME/type/header, e alguns controles de autorização/escopo regional/operação precisam de revisão sistemática para garantir consistência em todos os módulos novos.

Pontuação geral: **74 / 100**

Classificação geral: **boa base técnica, com riscos médios relevantes antes de considerar ambiente plenamente maduro para operação crítica**.

## Limites E Observações

- Esta auditoria foi feita sobre o estado local atual da branch `rot`, commit base `7015d646bd75db5cbc036e6290d6ebbc6e3e6deb`.
- A workspace estava com muitas alterações modificadas e arquivos não rastreados em `apps/rot`, incluindo módulos novos de APR, ativos, anexos, empresas, técnicos, inteligência operacional, storage e documentos.
- O estado local parece representar o que foi implantado manualmente, mas não está limpo em Git. Isso reduz rastreabilidade e reprodutibilidade.
- Não foram expostos segredos. Foram citados apenas nomes de variáveis e caminhos.
- `npm audit --audit-level=moderate --prefix apps/rot/backend`: 0 vulnerabilidades.
- `npm audit --audit-level=moderate --prefix apps/rot/frontend`: 0 vulnerabilidades.

## Score Por Categoria

| Categoria | Score | Status | Comentário |
|---|---:|---|---|
| Autenticação | 84 | ✅ | Argon2, rate limit, MFA por e-mail e reset com token hash. |
| Sessões e tokens | 80 | ✅ | Cookie HttpOnly + sessão em DB. Falta `issuer/audience` no JWT. |
| Autorização/RBAC | 72 | 🟡 | RBAC existe e é usado, mas módulos novos exigem revisão de consistência. |
| Escopo regional/operação | 68 | 🟡 | `scopeRegionalFilter` existe, mas nem todas as rotas foram provadas como uniformes. |
| Segurança de API | 76 | ✅ | Helmet, CORS, JSON limit, rate limit. CSRF não tem token dedicado. |
| Validação de entrada | 70 | 🟡 | `validateBody` cobre rotas críticas; validação sem schema tipado geral. |
| Uploads/anexos | 66 | 🟡 | Limites e MIME existem; falta validação por magic bytes/AV e política de conteúdo mais forte. |
| Frontend/PWA | 70 | 🟡 | PWA funcional; IndexedDB guarda dados offline sem criptografia local. |
| Banco de dados | 68 | 🟡 | Pool e queries parametrizadas; privilégio do usuário DB não foi validado. |
| Logs e auditoria | 67 | 🟡 | Logs existem; não há evidência de trilha imutável/WORM. |
| Segredos | 74 | ✅ | Uso por env; scan local não encontrou segredo real no código auditado. |
| Infra/VPS | 62 | 🔴 | Serviço roda como root; SSH root por chave habilitado; deploy manual. |
| Rede e exposição | 70 | 🟡 | UFW ativo; portas Node escutam em `*`, mitigadas por firewall. |
| Headers/CSP | 86 | ✅ | CSP e headers de segurança ativos; ainda há `style-src-attr 'unsafe-inline'`. |
| Dependências | 78 | ✅ | Audit sem vulnerabilidades moderadas; CI tem Semgrep/Gitleaks. |
| CI/CD/DevSecOps | 72 | 🟡 | Pipeline bom para app principal/finan; Operação não está como deploy formal na branch `rot`. |
| Monitoramento/alertas | 55 | ⚠️ | Há Prometheus/health, mas IR/alertas de segurança não comprovados. |
| Backup/DR | 64 | 🟡 | Backups de deploy existem; restore testado não foi comprovado. |
| IA/Warlinho | 73 | 🟡 | Tools filtradas por permissão; risco residual de prompt injection/saída de dados. |
| Privacidade/LGPD | 65 | 🟡 | Há dados pessoais, imagens e localização; retenção/consentimento não comprovados. |

## Pontos Fortes Confirmados

- `apps/rot/backend/src/auth/routes.js`: login local usa `argon2.verify`, mensagens genéricas para usuário/senha inválidos e rate limit.
- `apps/rot/backend/src/auth/routes.js`: MFA por e-mail usa desafio com hash SHA-256, expiração e limite de tentativas.
- `apps/rot/backend/src/auth/middleware.js`: sessão usa JWT com `jti`, grava `rot_sessions` e valida sessão não revogada/não expirada no banco a cada chamada.
- `apps/rot/backend/src/auth/routes.js`: cookie `operacao_session` tem `HttpOnly`, `SameSite=Strict`, `Path=/` e `Secure` em produção.
- `apps/rot/backend/src/app.js`: `helmet`, `cors`, `compression`, `express.json` com limite e rate limit global.
- `apps/rot/backend/src/security/cors.js`: CORS usa allowlist explícita.
- `apps/rot/backend/src/security/bodyValidation.js`: rotas críticas rejeitam campos desconhecidos quando usam `validateBody`.
- `apps/rot/backend/src/warlinho/tools.js`: tools da IA são de leitura e filtradas por permissão do usuário.
- `apps/rot/backend/src/attachments/routes.js`: upload em storage usa URL pré-assinada, reserva pendente, limite de tamanho e confirmação via `headObject`.
- `apps/rot/backend/src/qrcodes/publicRoutes.js`: QR público expõe apenas título e links ativos.
- `apps/rot/backend/src/assetsSecurity/publicRoutes.js`: consulta pública de ativo expõe metadados reduzidos; retirada via QR exige autenticação.
- VPS: UFW ativo com default deny incoming, PostgreSQL escutando em localhost.
- CI: Semgrep, Gitleaks e `npm audit` existem no workflow.

## Achados

### SEC-001 - Serviço da Operação roda como root na VPS

Status: 🔴  
Severidade: Alta  
OWASP/CWE: CWE-250, OWASP ASVS V14  
Evidência: `systemctl cat rot-api.service` mostra `User=root` e `ExecStart=/usr/bin/npm run api:start`.  
Impacto: uma RCE em dependência, rota administrativa ou processamento de arquivo teria privilégios de root no host.  
Probabilidade: Média.  
Recomendação: criar usuário dedicado sem shell administrativo (`operacao`), ajustar permissões de `/opt/retiradas/apps/rot`, rodar serviço com `User=operacao`, `Group=operacao`, `NoNewPrivileges=true`, `PrivateTmp=true`, `ProtectSystem=full` quando compatível.  
Esforço: Médio.  
Prioridade: P0.

### SEC-002 - SSH root por chave está habilitado

Status: 🟡  
Severidade: Média/Alta  
OWASP/CWE: CWE-250  
Evidência: acesso foi feito com `root@145.223.27.204`; `sshd_config` tem `PermitRootLogin prohibit-password` e `PubkeyAuthentication yes`. Senha está negada em arquivo efetivo, mas root por chave continua permitido.  
Impacto: comprometimento da chave de deploy dá controle total do host.  
Probabilidade: Média.  
Recomendação: criar usuário de deploy, desabilitar login root (`PermitRootLogin no`), usar sudo restrito para restart/deploy, rotação da chave atual.  
Esforço: Médio.  
Prioridade: P0.

### SEC-003 - Deploy de Operação não está formalizado no CI/CD

Status: 🔴  
Severidade: Alta  
OWASP/CWE: CWE-494, ASVS V14  
Evidência: `.github/workflows/ci.yml` aciona `main`, `master`, `homolog-dev`, `develop`, `finan`, `feature/**`, `fix/**`, `hotfix/**`, `chore/**`; a branch `rot` não aparece no trigger. O deploy recente foi manual.  
Impacto: aumenta risco de divergência entre Git e produção, rollback difícil, falta de gate automático de testes/scan para Operação.  
Probabilidade: Alta, pois a workspace local está dirty e com vários arquivos não rastreados.  
Recomendação: criar pipeline dedicado `operacao`/`rot`, com build, testes, audit, semgrep, gitleaks, pacote versionado e deploy controlado para `operacao.retiradas.tech`.  
Esforço: Médio.  
Prioridade: P0.

### SEC-004 - Workspace local não rastreada reduz rastreabilidade de segurança

Status: 🔴  
Severidade: Alta  
OWASP/CWE: CWE-1059, ASVS V14  
Evidência: `git status --short` mostra dezenas de arquivos modificados e módulos não rastreados em `apps/rot/backend/src/*`, SQL migrations e frontend.  
Impacto: não é possível reproduzir exatamente produção por Git, auditar diffs com precisão ou garantir rollback limpo.  
Probabilidade: Alta.  
Recomendação: separar mudanças em commits pequenos, versionar migrations e módulos novos, marcar release/deploy com SHA, bloquear deploy manual de workspace suja.  
Esforço: Médio.  
Prioridade: P0.

### SEC-005 - Ausência de proteção CSRF dedicada para sessão em cookie

Status: 🟡  
Severidade: Média  
OWASP/CWE: CWE-352, OWASP A01/A05  
Evidência: sessão autenticada usa cookie `operacao_session`; busca por `csrf/csurf` não encontrou middleware dedicado. Mitigação atual: `SameSite=Strict`, CORS com allowlist e JSON APIs.  
Impacto: risco menor por `SameSite=Strict`, mas rotas state-changing poderiam ficar expostas em cenários de downgrade, navegação incomum, subdomínio confiável comprometido ou mudança futura de SameSite.  
Probabilidade: Baixa/Média.  
Recomendação: adicionar validação de `Origin`/`Referer` para métodos mutáveis e/ou CSRF token double-submit em rotas administrativas.  
Esforço: Médio.  
Prioridade: P1.

### SEC-006 - JWT sem `issuer` e `audience`

Status: 🟡  
Severidade: Média  
OWASP/CWE: CWE-347  
Evidência: `apps/rot/backend/src/auth/middleware.js` assina `jwt.sign({ sub, jti }, JWT_SECRET, { expiresIn })` e valida com `jwt.verify(token, JWT_SECRET)` sem `issuer`/`audience`.  
Impacto: em ecossistema com múltiplos apps e segredos, aumenta risco de confusão de token se segredos forem reutilizados ou vazarem.  
Probabilidade: Baixa/Média.  
Recomendação: assinar com `issuer: "operacao"` e `audience: "operacao-web"`, validar ambos e garantir segredo exclusivo por app.  
Esforço: Baixo.  
Prioridade: P1.

### SEC-007 - Compatibilidade com Bearer token ainda existe no backend

Status: 🟡  
Severidade: Média  
OWASP/CWE: CWE-922  
Evidência: `getRequestToken` em `apps/rot/backend/src/auth/middleware.js` aceita `Authorization: Bearer` antes do cookie. O frontend remove `TOKEN_KEY`, mas o backend ainda aceita header.  
Impacto: mantém uma superfície legada que pode favorecer vazamento por scripts/extensões ou clientes antigos.  
Probabilidade: Média.  
Recomendação: após migração completa, remover Bearer para web ou restringir a clientes técnicos específicos com escopo separado.  
Esforço: Baixo/Médio.  
Prioridade: P1.

### SEC-008 - Senhas temporárias retornam no corpo da resposta administrativa

Status: 🟡  
Severidade: Média  
OWASP/CWE: CWE-522, CWE-256  
Evidência: `apps/rot/backend/src/users/routes.js` retorna `temporaryPassword` ao criar usuário e ao resetar senha.  
Impacto: senha temporária pode aparecer em histórico do navegador, logs de proxy, ferramentas de observabilidade ou prints.  
Probabilidade: Média.  
Recomendação: preferir link de primeiro acesso/reset com token único; se mantiver senha temporária, mostrar uma vez no frontend, não registrar em logs, expirar rápido e exigir troca imediata.  
Esforço: Médio.  
Prioridade: P1.

### SEC-009 - MFA pode ser ignorado para usuário sem e-mail

Status: 🟡  
Severidade: Média  
OWASP/CWE: CWE-308  
Evidência: `issueSessionResponse` só exige MFA quando `user.mfa_enabled && user.email`.  
Impacto: contas sem e-mail cadastrado entram só com senha, enfraquecendo padrão de segurança.  
Probabilidade: Média, dependendo do cadastro.  
Recomendação: bloquear login de contas com MFA habilitado e sem e-mail, ou exigir que admin corrija o cadastro antes de ativar a conta.  
Esforço: Baixo.  
Prioridade: P1.

### SEC-010 - Uploads validam MIME/header, mas não comprovam assinatura real do arquivo

Status: 🟡  
Severidade: Média  
OWASP/CWE: CWE-434  
Evidência: `apps/rot/backend/src/security/uploadFilters.js` aceita imagem por `file.mimetype`; `apps/rot/backend/src/attachments/routes.js` valida `contentType` e tamanho no storage.  
Impacto: arquivo malicioso com MIME/header aceitável pode ser armazenado ou renderizado em algum fluxo futuro.  
Probabilidade: Média.  
Recomendação: validar magic bytes, normalizar imagens no backend quando possível, remover metadados, rejeitar SVG, servir anexos com `Content-Disposition`/headers seguros e considerar antivírus para anexos sensíveis.  
Esforço: Médio.  
Prioridade: P1.

### SEC-011 - Avatar é salvo como data URL no banco

Status: 🟡  
Severidade: Média/Baixa  
OWASP/CWE: CWE-79, CWE-434  
Evidência: `apps/rot/backend/src/auth/routes.js` converte avatar para `data:${req.file.mimetype};base64,...` e salva em `rot_users.avatar_url`.  
Impacto: aumenta tamanho do banco, dificulta varredura/limpeza e mistura mídia com dados de identidade. Como há filtro de MIME e limites, risco de XSS é reduzido, mas não ideal.  
Probabilidade: Média.  
Recomendação: armazenar avatar no mesmo pipeline de storage de anexos, com validação e URL controlada.  
Esforço: Médio.  
Prioridade: P2.

### SEC-012 - Dados offline no IndexedDB sem criptografia local

Status: 🟡  
Severidade: Média  
OWASP/CWE: CWE-922, OWASP M9  
Evidência: `apps/rot/frontend/src/utils/offlineAprQueue.js` e `offlineRotQueue.js` persistem APR, fotos e ações em IndexedDB (`rot-offline`).  
Impacto: em aparelho perdido/compartilhado, dados de localização, imagens e formulários de risco podem ficar acessíveis no perfil do navegador.  
Probabilidade: Média para técnicos em campo.  
Recomendação: política de retenção curta, limpeza após sync/logout, aviso de dispositivo compartilhado, bloqueio por PIN local quando viável, e avaliação de criptografia local com chave derivada de sessão/PIN.  
Esforço: Médio/Alto.  
Prioridade: P1.

### SEC-013 - Rotas públicas de ativos expõem metadados operacionais por token

Status: 🟡  
Severidade: Média/Baixa  
OWASP/CWE: CWE-200  
Evidência: `apps/rot/backend/src/assetsSecurity/publicRoutes.js` permite GET público por `public_token` e retorna código, nome, operação, categoria, tipo, regional, status, criticidade e datas.  
Impacto: qualquer pessoa com QR/link acessa dados do ativo; isso é esperado para QR, mas precisa de token forte, rotação e revogação.  
Probabilidade: Média.  
Recomendação: garantir tokens longos/aleatórios, opção de regenerar token, logs de acesso e configuração do que é visível publicamente.  
Esforço: Médio.  
Prioridade: P2.

### SEC-014 - Escopo regional/operação precisa de revisão sistemática

Status: ⚠️  
Severidade: Média  
OWASP/CWE: CWE-639, OWASP A01  
Evidência: `scopeRegionalFilter` existe e é usado em muitas rotas (`assetsSecurity`, `dashboard`, `rompimentos`, `tickets`, `fleet`, etc.). Porém módulos como `companies`, `agents`, `technicians` usam RBAC, mas não evidenciaram filtro regional no mesmo padrão durante a leitura parcial.  
Impacto: usuários regionais ou de uma operação podem visualizar/alterar dados fora do seu escopo se alguma rota nova não aplicar o filtro.  
Probabilidade: Média, dado o volume de módulos recentes.  
Recomendação: criar testes de autorização por módulo para usuário global, regional, ROT, Field e Delivery; padronizar helper de escopo obrigatório; negar por padrão quando módulo manipula regional/empresa/técnico.  
Esforço: Alto.  
Prioridade: P1.

### SEC-015 - Warlinho tem controle de tools, mas ainda precisa de guardrails formais de IA

Status: 🟡  
Severidade: Média  
OWASP/CWE: OWASP LLM01/LLM06  
Evidência: `apps/rot/backend/src/warlinho/routes.js` usa Gemini com system prompt e tool-calling; `tools.js` filtra tools por permissão e handlers são de leitura.  
Impacto: prompt injection pode induzir resposta indevida ou tentativa de chamar ferramentas fora do propósito; o filtro de tool reduz o risco, mas não há camada explícita de classificação/PII/redaction.  
Probabilidade: Média.  
Recomendação: adicionar testes adversariais de prompt injection, limitar campos retornados pelas tools, redigir PII quando não necessário e registrar tool calls para auditoria.  
Esforço: Médio.  
Prioridade: P2.

### SEC-016 - Logs de auditoria são mutáveis no mesmo banco transacional

Status: 🟡  
Severidade: Média  
OWASP/CWE: CWE-778  
Evidência: `apps/rot/backend/src/audit/auditLog.js` insere em `rot_audit_logs`; não foi encontrada evidência de append-only, hash chain, WORM, export externo ou restrição de update/delete por privilégio.  
Impacto: usuário DB comprometido ou bug administrativo pode alterar histórico.  
Probabilidade: Baixa/Média.  
Recomendação: criar trilha imutável com hash encadeado, proibir update/delete no usuário da app, exportar logs críticos para storage externo/observabilidade.  
Esforço: Médio.  
Prioridade: P2.

### SEC-017 - Health endpoint expõe estado do banco

Status: 🟡  
Severidade: Baixa  
OWASP/CWE: CWE-200  
Evidência: `/api/health` público retorna `service`, `postgres` e timestamp.  
Impacto: facilita fingerprinting básico e confirmação de indisponibilidade parcial.  
Probabilidade: Alta, por ser público.  
Recomendação: manter health público mínimo (`ok`), mover detalhes para health autenticado/interno ou endpoint de monitoramento protegido.  
Esforço: Baixo.  
Prioridade: P3.

### SEC-018 - Portas Node escutam em todas as interfaces

Status: 🟡  
Severidade: Média/Baixa  
OWASP/CWE: CWE-200  
Evidência: `ss -tulpn` mostra Node em `*:3001`, `*:3002`, `*:3101`, `*:3201`. UFW bloqueia entrada exceto 80/443/22/9090, então o risco está mitigado por firewall.  
Impacto: se firewall for alterado/desabilitado, serviços internos ficam expostos diretamente.  
Probabilidade: Baixa/Média.  
Recomendação: fazer apps escutarem em `127.0.0.1` e manter Nginx como único ponto público.  
Esforço: Baixo.  
Prioridade: P2.

### SEC-019 - CSP ainda permite `style-src-attr 'unsafe-inline'`

Status: 🟡  
Severidade: Baixa/Média  
OWASP/CWE: CWE-79  
Evidência: header CSP público contém `style-src-attr 'unsafe-inline'`. Scripts inline não foram liberados, então risco de XSS é bem menor.  
Impacto: permite estilo inline em atributos; pode facilitar abuso visual em XSS limitado.  
Probabilidade: Baixa.  
Recomendação: reduzir inline styles ao longo do tempo, migrar para classes e testar remoção de `style-src-attr 'unsafe-inline'`.  
Esforço: Médio.  
Prioridade: P3.

### SEC-020 - SSL de Postgres remoto aceitaria certificado sem validação quando ativado

Status: ⚠️  
Severidade: Média  
OWASP/CWE: CWE-295  
Evidência: `apps/rot/backend/src/db.js` usa `ssl: { rejectUnauthorized: false }` quando `ROT_PGSSLMODE=require`. Na VPS atual o Postgres escuta em localhost, reduzindo risco.  
Impacto: se o banco migrar para rede externa, conexão TLS não validará CA/host.  
Probabilidade: Baixa hoje; média em migração futura.  
Recomendação: usar CA confiável e `rejectUnauthorized: true` para banco remoto; manter localhost sem TLS quando no mesmo host.  
Esforço: Baixo/Médio.  
Prioridade: P2.

### SEC-021 - Não há evidência de política formal de retenção para imagens, APR e localização

Status: ⚠️  
Severidade: Média  
OWASP/CWE: CWE-359, LGPD  
Evidência: existem APR, anexos, fotos, localização e auditoria; não foi encontrada política clara de retenção/expurgo no escopo lido.  
Impacto: retenção indefinida de fotos/localização pode aumentar risco regulatório e impacto de vazamento.  
Probabilidade: Média.  
Recomendação: definir retenção por tipo de dado, finalidade, expurgo automático, logs de exclusão e base legal.  
Esforço: Médio.  
Prioridade: P2.

### SEC-022 - Falta evidência de backup/restore testado para banco Operação

Status: ❓  
Severidade: Média  
OWASP/CWE: ASVS V14  
Evidência: há backups de deploy no VPS, mas não foi comprovado backup periódico do banco `rot` nem teste de restore.  
Impacto: perda de dados de APR, imagens, rompimentos, ativos e auditorias em falha grave.  
Probabilidade: Desconhecida.  
Recomendação: documentar job de backup do DB, storage R2, retenção, criptografia e teste periódico de restore.  
Esforço: Médio.  
Prioridade: P1.

### SEC-023 - Resposta de erro genérica ainda referencia Finan

Status: ➖  
Severidade: Baixa  
OWASP/CWE: CWE-209  
Evidência: `apps/rot/backend/src/security/errors.js` usa fallback `"Erro interno do Finan."`.  
Impacto: confusão operacional e ruído de suporte; não aumenta risco técnico relevante.  
Probabilidade: Alta.  
Recomendação: trocar para `"Erro interno da Operação."`.  
Esforço: Baixo.  
Prioridade: P3.

### SEC-024 - Login Google informa quando usuário do domínio permitido não está cadastrado

Status: 🟡  
Severidade: Baixa/Média  
OWASP/CWE: CWE-203  
Evidência: login Google retorna `"Usuário não cadastrado na Operação..."` quando e-mail verificado/domínio permitido não existe.  
Impacto: enumeração parcial de cadastro para quem possui conta Google em domínio permitido.  
Probabilidade: Baixa/Média.  
Recomendação: retornar mensagem genérica ou registrar detalhe apenas em log interno.  
Esforço: Baixo.  
Prioridade: P3.

## Quick Wins - 24 a 72 horas

1. Rodar `rot-api.service` com usuário não-root.
2. Criar pipeline dedicado para branch/app Operação e parar deploy manual de workspace dirty.
3. Versionar os módulos/migrations locais atuais em commits pequenos.
4. Remover retorno de `temporaryPassword` da API ou limitar a fluxo de exibição única.
5. Bloquear login MFA de usuário sem e-mail cadastrado.
6. Adicionar validação de `Origin` para métodos mutáveis.
7. Fazer apps Node escutarem em `127.0.0.1`.
8. Corrigir mensagem `"Erro interno do Finan."`.
9. Garantir que `/api/health` público não exponha `postgres`.
10. Criar teste RBAC mínimo para usuário global/regional em `companies`, `technicians`, `agents`, `assets`, `rompimentos`.

## Roadmap Recomendado

### 0-7 dias

- Hardening da VPS: usuário dedicado, root SSH desabilitado, Node somente localhost.
- Pipeline Operação: build/test/audit/gitleaks/deploy com SHA.
- Formalizar release atual da Operação em Git.
- CSRF/Origin guard para POST/PUT/PATCH/DELETE.
- Validação de uploads por magic bytes.

### 7-30 dias

- Testes de autorização por operação: ROT, Field, Delivery, admin, supervisor, técnico.
- Política de retenção para APR, fotos, localização, anexos e auditoria.
- Backups automáticos do DB Operação e teste de restore.
- Revisão de Warlinho contra prompt injection e vazamento de PII.
- Migração de avatar para storage controlado.

### 30-90 dias

- Logs imutáveis ou export externo.
- Hardening systemd adicional (`NoNewPrivileges`, `ProtectSystem`, `ReadWritePaths`).
- Criptografia/limpeza reforçada para filas offline.
- Modelo formal de threat modeling para APR, rompimentos, ativos e integrações.
- Validação ASVS recorrente no pipeline.

## Mapeamento OWASP Top 10

| OWASP | Situação |
|---|---|
| A01 Broken Access Control | 🟡 RBAC existe; precisa revisão sistemática nos módulos novos. |
| A02 Cryptographic Failures | 🟡 Senhas hash OK; dados offline/storage/DB remoto precisam revisão. |
| A03 Injection | ✅ Queries observadas usam parâmetros; sem evidência de concatenação perigosa em pontos críticos lidos. |
| A04 Insecure Design | 🟡 Deploy manual, root service e escopo multioperação pedem desenho formal. |
| A05 Security Misconfiguration | 🔴 Serviço root e portas Node em `*` mitigadas por firewall. |
| A06 Vulnerable Components | ✅ `npm audit` moderado sem vulnerabilidades em frontend/backend ROT. |
| A07 Identification/Auth Failures | 🟡 MFA bom, mas sem e-mail pula MFA; senha temporária volta na API. |
| A08 Software/Data Integrity Failures | 🔴 Pipeline Operação ausente; workspace dirty. |
| A09 Logging/Monitoring Failures | 🟡 Logs existem, mas não imutáveis e alertas não comprovados. |
| A10 SSRF | ❓ Não houve evidência forte; integrações externas devem ser revisadas caso aceitem URLs configuráveis. |

## Mapeamento OWASP API Security

| Categoria | Avaliação |
|---|---|
| API1 Broken Object Level Authorization | 🟡 Escopo regional/operação precisa testes sistemáticos. |
| API2 Broken Authentication | ✅ Base boa; ressalvas MFA sem e-mail/Bearer legado. |
| API3 Broken Object Property Level Authorization | 🟡 `validateBody` existe em rotas críticas; falta schema geral por recurso. |
| API4 Unrestricted Resource Consumption | ✅ Rate limits e JSON limit; uploads têm limites. |
| API5 Broken Function Level Authorization | 🟡 RBAC amplo, mas módulos novos precisam cobertura de teste. |
| API6 Unrestricted Access to Sensitive Business Flows | 🟡 QR público e checkout têm controles; fluxo precisa monitoramento. |
| API7 SSRF | ❓ Não validado em integrações. |
| API8 Security Misconfiguration | 🔴 Serviço root/deploy manual. |
| API9 Improper Inventory Management | 🟡 Muitas rotas novas sem inventário formal. |
| API10 Unsafe Consumption of APIs | 🟡 Gemini/R2/integrações precisam limites e observabilidade. |

## Checklist ASVS Resumido

| Área ASVS | Status |
|---|---|
| V1 Arquitetura | 🟡 |
| V2 Autenticação | ✅ |
| V3 Sessão | ✅ |
| V4 Controle de acesso | 🟡 |
| V5 Validação | 🟡 |
| V7 Erros e logs | 🟡 |
| V8 Proteção de dados | 🟡 |
| V9 Comunicação | ✅ |
| V10 Código malicioso | 🟡 |
| V12 Arquivos | 🟡 |
| V13 API | 🟡 |
| V14 Configuração | 🔴 |

## Testes Recomendados

- Teste automatizado: usuário regional tentando acessar/alterar empresa, técnico, ativo, APR e rompimento de outra regional.
- Teste automatizado: usuário Delivery tentando ver itens exclusivos ROT; usuário Field tentando ver Delivery.
- Teste automatizado: endpoint mutável com `Origin` externo deve falhar.
- Teste automatizado: upload com extensão `.png` mas bytes não imagem deve falhar.
- Teste automatizado: usuário com MFA habilitado e sem e-mail deve ser bloqueado ou sinalizado.
- Teste automatizado: logout deve revogar sessão e limpar acesso a rotas protegidas.
- Teste manual: PWA offline cria APR/rompimento, sincroniza e limpa IndexedDB após envio/logout.
- Teste manual: QR público não expõe dados sensíveis além do necessário.
- Teste infra: serviço roda como usuário não-root e não consegue escrever fora de diretórios permitidos.
- Teste DR: restaurar backup do banco Operação em ambiente isolado.

## Conclusão

O Operação está em um patamar funcional de segurança para uso controlado, mas ainda não está no ponto ideal para ser tratado como aplicação crítica plenamente madura. A base de autenticação, sessão, RBAC, CORS, headers e rate limit está bem encaminhada. Os riscos que mais precisam atenção são operacionais e de governança: rodar como root, deploy manual, workspace não versionada, cobertura insuficiente de testes RBAC/escopo e política de dados offline/imagens.

Prioridade sugerida: resolver `SEC-001`, `SEC-003`, `SEC-004`, `SEC-005`, `SEC-008`, `SEC-010`, `SEC-014` e `SEC-022` antes de expandir ainda mais funcionalidades sensíveis.
