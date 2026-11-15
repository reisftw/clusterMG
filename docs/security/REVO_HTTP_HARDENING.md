# REVO HTTP Hardening

Data da auditoria: 2026-11-15. Escopo: `retiradas.tech` e `www.retiradas.tech`.
Os modulos Adm, Finan, Mercado e Operacao nao foram alterados nem publicados.

## Resultado

| Controle | Antes | Depois | Validado |
| --- | --- | --- | --- |
| CSP | Ausente nas respostas estaticas | Politica bloqueante baseada nas dependencias reais | Sim, em navegador automatizado |
| HSTS | Ausente nas respostas estaticas | `max-age=31536000`, sem subdominios e sem preload | Sim |
| X-Frame-Options | Ausente nas respostas estaticas | `SAMEORIGIN` | Sim |
| X-Content-Type-Options | Ausente nas respostas estaticas | `nosniff` | Sim |
| Referrer-Policy | Ausente nas respostas estaticas | `strict-origin-when-cross-origin` | Sim |
| COOP/COEP/CORP | Inconsistente entre Nginx e Express | COOP compativel com popups; COEP/CORP nao forcados | Sim |
| Observatory | D, 30/100 | A medir depois da publicacao | Pendente |

## Causa raiz

O servidor HTTPS possuia headers no bloco `server`, mas os blocos `location`
de frontend declaravam `add_header` para cache. No Nginx, isso substitui os
headers herdados; por isso HTML, assets, service worker e manifesto eram
entregues sem as protecoes. Nas APIs ocorria o inverso: Nginx e Helmet emitiam
CSP e HSTS simultaneamente, com valores diferentes.

## Configuracao efetiva

- Nginx e a fonte dos headers das respostas estaticas. O snippet versionado e
  incluido no servidor e em toda `location` que define headers de cache.
- Helmet e a fonte unica dos headers das respostas da API; o Nginx acrescenta
  somente `Cache-Control: no-store` nesse caminho.
- CSP bloqueia objetos, scripts inline, atributos de script e enquadramento por
  terceiros. Permite apenas as origens usadas por Google Identity, Turnstile,
  Google Fonts, Leaflet legado, mapas, geocodificacao e iframes conhecidos.
- Cookies de sessao permanecem `Secure`, `HttpOnly` e `SameSite=Lax`. O cookie
  CSRF e `Secure` e `SameSite=Lax`, sem `HttpOnly` por precisar ser lido pelo
  cliente para o double-submit token. O CORS e a validacao CSRF existentes nao
  foram relaxados.
- HSTS conserva o ano ja usado pela aplicacao. `includeSubDomains` e `preload`
  ficam desativados porque nem todos os subdominios possuem inventario e TLS
  validado.

## Excecoes justificadas

- `style-src 'unsafe-inline'`: React e Google Identity geram estilos em tempo
  de execucao. A simulacao bloqueante comprovou quebra do login sem a excecao.
  Scripts continuam sem `unsafe-inline` e sem `unsafe-eval`.
- `img-src https:`: imagens de usuarios e documentos possuem hosts variaveis.
- COEP `require-corp` e CORP restritivo nao foram aplicados porque mapas,
  documentos e iframes externos nao publicam contratos CORP uniformes.
- SRI nao foi aplicado a Google Identity e Turnstile, que sao scripts dinamicos
  de terceiros. O Leaflet legado deve ser internalizado em trabalho separado.

## Validacao anterior a publicacao

- 40 testes de caracterizacao do backend aprovados.
- 15 contratos de CI, seguranca e release aprovados.
- CSP bloqueante simulada no navegador em `/login`, `/painel`, `/painel/mapa`,
  `/painel/match`, `/aa-sempre` e `/devolucao`: HTTP 200 e zero violacoes.
- O workflow oficial valida `nginx -t`, headers obrigatorios e ausencia de CSP
  ou HSTS duplicados antes de concluir a publicacao.

## Arquivos

- `apps/retiradas/backend/nginx/retiradas.conf`
- `apps/retiradas/backend/nginx/retiradas-security-headers.conf`
- `apps/retiradas/backend/api/src/app.js`
- `.github/workflows/deploy-retiradas.yml`
- `tests/contracts/cspConfig.test.js`
- `tests/contracts/ciDeployGates.test.js`

## Publicacao e rastreabilidade

- Branch: `codex/security-http-hardening`
- Pull request: a preencher apos abertura
- Commits: a preencher apos abertura
- Versao de producao: a preencher apos publicacao oficial
- Observatory depois: a preencher apos nova varredura

## Rollback

O workflow salva o vhost e o snippet ativos antes da troca. Qualquer falha no
health check, `nginx -t`, reload ou smoke test restaura os dois arquivos,
valida novamente a sintaxe e recarrega o Nginx. A aplicacao e restaurada pelo
rollback ja existente no mesmo workflow. Nao ha migracao nem alteracao de dados.

## Riscos residuais

- A homologacao nao foi usada porque seu certificado TLS nao corresponde ao
  host. A CSP foi validada por injecao no navegador contra as paginas reais,
  sem alterar producao.
- Fluxos autenticados de terceiros devem continuar monitorados por violacoes de
  CSP e erros 4xx/5xx depois da publicacao.
- O curingas de imagens e a excecao de estilo devem ser reduzidos quando os
  conteudos externos e os estilos dinamicos forem internalizados.
