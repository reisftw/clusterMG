# Guia de Contribuicao

## Convencao de branches

Branches de produto:

- \`master\`: integracao revisada e candidata a release
- \`retiradas\`: trabalho do Retiradas
- \`mercado\`: trabalho do Mercado de Retiradas
- \`operacao\`: trabalho da Operacao
- \`homolog-dev\`: integracao de homologacao

Branches curtas:

- \`feature/<tema>\`: novas funcionalidades
- \`fix/<tema>\`: correcoes sem alteracao estrutural ampla
- \`hotfix/<tema>\`: correcoes urgentes em producao
- \`chore/<tema>\`: tooling e manutencao

## Padrao de commits

Use Conventional Commits.

\`\`\`text
feat(metas): publicar novo resumo mensal
fix(auth): corrigir refresh do perfil apos troca de senha
refactor(mapa): separar upload legado do fluxo atual
test(utils): ampliar cobertura de dia util e projecao
docs(readme): atualizar instrucoes de deploy
\`\`\`

## Checklist antes de abrir PR

\`\`\`bash
npm run verify:retiradas
npm run test:contracts
\`\`\`

Valide tambem:

- a alteracao nao quebrou rotas publicas nem fluxos autenticados
- Mercado passou pela validacao de privacidade e compatibilidade do Retiradas
- Operacao passou por \`npm run verify:operacao\` quando afetada
- mudancas de banco possuem plano de migration e rollback
- mudancas de CI/CD atualizam \`docs/CI_CD.md\` e \`docs/DEPLOY.md\`
- nenhum build, arquivo de ambiente, segredo, tarball de deploy ou artefato local entrou no PR

## Checklist de PR

Inclua no PR:

- objetivo da mudanca
- contexto funcional afetado
- evidencia de teste manual e automatizado
- riscos conhecidos e plano de rollback, quando aplicavel
- prints ou gravacoes para mudancas visuais relevantes

## Como reportar bugs

Ao abrir uma issue interna ou ticket:

1. descreva o contexto funcional afetado
2. informe ambiente, usuario/perfil e rota
3. liste passos para reproduzir
4. registre comportamento esperado e observado
5. anexe logs, prints ou IDs de documentos quando houver

## Como sugerir melhorias

Ao propor evolucao:

1. explique o problema atual
2. detalhe o ganho esperado
3. aponte impacto em dados, autenticacao e operacao
4. cite dependencias tecnicas ou validacoes necessarias
