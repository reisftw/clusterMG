# Guia de Contribuição

Este repositório não possuía um guia formal de contribuição versionado. Este documento estabelece o padrão operacional mínimo para evoluir o projeto com segurança.

## Convenção de branches

Padrão recomendado:

- `main`: linha principal do código pronto para deploy
- `develop`: integração contínua, se o time optar por mantê-la
- `feature/<tema>`: novas funcionalidades
- `fix/<tema>`: correções sem alteração estrutural ampla
- `hotfix/<tema>`: correções urgentes em produção
- `chore/<tema>`: ajustes operacionais, tooling e manutenção

Exemplos:

```text
feature/resumo-mensal-metas
fix/login-timeout
chore/atualizar-ci
```

## Padrão de commits

Padrão recomendado: Conventional Commits.

Exemplos:

```text
feat(metas): publicar novo resumo mensal
fix(auth): corrigir refresh do perfil apos troca de senha
refactor(mapa): separar upload legado do fluxo atual
test(utils): ampliar cobertura de dia util e projecao
docs(readme): atualizar instrucoes de deploy
```

## Checklist antes de abrir PR

Execute localmente:

```bash
npm run lint
npm test
npm run build
```

Valide também:

- a alteração não quebrou rotas públicas nem fluxos autenticados
- qualquer mudança em Firestore, Storage ou Functions foi documentada
- coleções, campos e regras de negócio novas foram refletidas em `DOCUMENTATION.md`
- mudanças relevantes foram registradas em `CHANGELOG.md`
- se houver impacto de segurança, as regras correspondentes foram versionadas junto

## Checklist de PR

Inclua no PR:

- objetivo da mudança
- contexto funcional afetado
- evidência de teste manual e automatizado
- riscos conhecidos e plano de rollback, quando aplicável
- prints ou gravações para mudanças visuais relevantes

## Como reportar bugs

Ao abrir uma issue interna ou ticket:

1. descreva o contexto funcional afetado
2. informe ambiente, usuário/perfil e rota
3. liste passos para reproduzir
4. registre comportamento esperado e observado
5. anexe logs, prints ou IDs de documentos quando houver

## Como sugerir melhorias

Ao propor evolução:

1. explique o problema atual
2. detalhe o ganho esperado
3. aponte impacto em dados, autenticação e operação
4. cite dependências técnicas ou validações necessárias
