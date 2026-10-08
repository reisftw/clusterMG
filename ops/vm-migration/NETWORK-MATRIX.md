# Matriz de rede para migracao VM empresa

Documento para alinhamento com equipe BTP/Palo Alto antes da virada.

## Publicacao externa

| Origem | Destino publico | NAT destino interno | Porta | Protocolo/App | Finalidade | Observacao |
| --- | --- | --- | --- | --- | --- | --- |
| Internet | `retiradas.tech` | VM Retiradas/Operacao | `80` | HTTP | Redirect para HTTPS e desafio Certbot, se SSL ficar na VM | Pode ficar liberado apenas para redirect/desafio ACME. |
| Internet | `retiradas.tech` | VM Retiradas/Operacao | `443` | HTTPS/SSL | App Retiradas | Se SSL terminar no Palo Alto, encaminhar HTTP/HTTPS interno conforme desenho da BTP. |
| Internet | `www.retiradas.tech` | VM Retiradas/Operacao | `80` | HTTP | Redirect | Opcional, usado para redirecionar para `retiradas.tech`. |
| Internet | `www.retiradas.tech` | VM Retiradas/Operacao | `443` | HTTPS/SSL | Redirect/App | Opcional, manter se DNS existir. |
| Internet | `operacao.retiradas.tech` | VM Retiradas/Operacao | `80` | HTTP | Redirect para HTTPS e desafio Certbot, se SSL ficar na VM | Operacao. |
| Internet | `operacao.retiradas.tech` | VM Retiradas/Operacao | `443` | HTTPS/SSL | App Operacao | Operacao. |
| Internet | `rot.retiradas.tech` | VM Retiradas/Operacao | `80` | HTTP | Alias/redirect legado | Pode manter temporariamente apontando para Operacao. |
| Internet | `rot.retiradas.tech` | VM Retiradas/Operacao | `443` | HTTPS/SSL | Alias legado Operacao | Pode virar redirect 301 futuro. |

## Acesso administrativo

| Origem | Destino | Porta | Protocolo/App | Finalidade | Observacao |
| --- | --- | --- | --- | --- | --- |
| IPs autorizados da empresa / Rodrigo / BTP | VM Retiradas/Operacao | `22` | SSH | Deploy, manutencao e copia de pacotes | Restringir por origem. Nao abrir SSH para Internet inteira. |
| GitHub Actions, se for manter deploy automatico | VM Retiradas/Operacao | `22` | SSH | Deploy CI/CD | Liberar somente se a BTP aprovar origem. Como IP do GitHub pode variar, preferir runner interno/VPN ou deploy manual. |

## Portas internas na VM

Estas portas nao precisam ficar expostas diretamente na Internet. O Nginx local recebe `80/443` e encaminha para elas.

| Servico | Bind esperado | Porta | Protocolo | Finalidade |
| --- | --- | --- | --- | --- |
| Retiradas API | `127.0.0.1` | `3001` | HTTP | Backend Retiradas: `/api/*` |
| Operacao API | `127.0.0.1` | `3201` | HTTP | Backend Operacao: `/api/*` |
| PostgreSQL | `127.0.0.1` ou rede interna DB | `5432` | PostgreSQL | Banco dos apps |

## Saidas da VM para Internet

| Origem | Destino | Porta | Protocolo/App | Quem usa | Finalidade |
| --- | --- | --- | --- | --- | --- |
| VM | `sempre.hubsoft.com.br` | `443` | HTTPS | Retiradas | Login/portal HubSoft via Playwright/configuracoes. |
| VM | `bi.sempre.hubsoft.com.br` | `8443` | HTTPS | Retiradas | BI HubSoft/relatorios. |
| VM | `*.hubsoft.com.br` | `443`, `8443` | HTTPS | Retiradas/Operacao | Consultas HubSoft, caso o endpoint mude. |
| VM | SMTP configurado, hoje exemplo `smtp.hostinger.com` | `465` | SMTPS | Retiradas/Operacao | MFA por e-mail, reset de senha e avisos. |
| VM | `accounts.google.com` | `443` | HTTPS | Operacao/Retiradas | Login Google/OAuth, se habilitado. |
| VM | `oauth2.googleapis.com`, `www.googleapis.com` | `443` | HTTPS | Retiradas | Google Drive/OAuth, se habilitado. |
| VM | Evolution/WhatsApp provider configurado | porta do provider | HTTP/HTTPS | Retiradas | Mensageria/WhatsApp. Confirmar host atual no `.env`/config do sistema antes da virada. |
| VM | Cloudflare R2/S3 endpoint configurado | `443` | HTTPS/S3 | Operacao | Anexos/imagens, se R2/S3 estiver habilitado. |
| VM | `registry.npmjs.org` | `443` | HTTPS | Deploy | Instalar dependencias Node durante deploy. Pode ser liberado temporariamente. |
| VM | `playwright.azureedge.net`, CDN Playwright/Microsoft | `443` | HTTPS | Retiradas | Instalar Chromium do Playwright. Pode ser preinstalado para reduzir liberacao. |
| VM | `github.com`, `objects.githubusercontent.com` | `443` | HTTPS/Git | Deploy | Opcional se deploy puxar do Git. No pacote manual, nao precisa. |
| VM | `letsencrypt.org`, `acme-v02.api.letsencrypt.org` | `443` | HTTPS/ACME | Certbot | Apenas se SSL ficar na VM com Let's Encrypt. |

## Banco de dados

Modelo recomendado para simplicidade na VM empresa:

| App | Banco | Porta | Acesso |
| --- | --- | --- | --- |
| Retiradas | `retiradas` | `5432` | Local na VM ou Postgres interno, acessivel apenas pela VM |
| Operacao | `operacao` | `5432` | Local na VM ou Postgres interno, acessivel apenas pela VM |

Se a BTP preferir banco gerenciado/servidor separado, liberar:

| Origem | Destino | Porta | Protocolo |
| --- | --- | --- | --- |
| VM Retiradas/Operacao | Servidor PostgreSQL interno | `5432` | PostgreSQL |

## DNS

Registros esperados na virada:

| Nome | Tipo | Destino |
| --- | --- | --- |
| `retiradas.tech` | `A` ou `CNAME` | IP publico/NAT do Palo Alto ou LB |
| `www.retiradas.tech` | `A` ou `CNAME` | Mesmo destino de `retiradas.tech` |
| `operacao.retiradas.tech` | `A` ou `CNAME` | IP publico/NAT do Palo Alto ou LB |
| `rot.retiradas.tech` | `A` ou `CNAME` | Mesmo destino de `operacao.retiradas.tech`, enquanto alias existir |

## Desenho recomendado no Palo Alto

1. Criar objetos:
   - `srv-vm-retiradas-operacao`: IP interno da VM.
   - `svc-retiradas-api-interno`: TCP `3001`, somente local/Nginx, nao publicar direto.
   - `svc-operacao-api-interno`: TCP `3201`, somente local/Nginx, nao publicar direto.
2. NAT inbound:
   - Publico `80/443` -> VM `80/443`.
3. Security policy inbound:
   - Internet -> VM: permitir `web-browsing`/`ssl` em `80/443`.
   - Admins/BTP -> VM: permitir `ssh` em `22`.
4. Security policy outbound:
   - VM -> Internet: permitir destinos listados na secao "Saidas da VM".
   - VM -> PostgreSQL, se banco externo: permitir `5432`.
5. Nao expor diretamente:
   - `3001`, `3201`, `5432`.

## Validacoes antes da troca definitiva

Na VM:

```bash
curl -fsS http://127.0.0.1:3001/api/health
curl -fsS http://127.0.0.1:3201/api/health
nginx -t
systemctl status retiradas-api.service --no-pager
systemctl status rot-api.service --no-pager
```

De fora da rede:

```bash
curl -I https://retiradas.tech
curl -I https://operacao.retiradas.tech
```

## Pendencias para preencher quando a BTP entregar

- IP interno da VM:
- IP publico/NAT:
- Quem termina SSL: Palo Alto ou Nginx:
- Lista de IPs liberados para SSH:
- Se banco sera local ou servidor PostgreSQL separado:
- Host/porta do Evolution/WhatsApp provider atual:
- Se GitHub Actions tera acesso direto ou deploy sera manual/VPN:

