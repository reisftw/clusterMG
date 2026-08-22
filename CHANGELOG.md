# Changelog

Todas as mudanças relevantes deste repositório devem ser registradas aqui.

O formato segue, de forma simplificada, o padrão [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

## [Unreleased] - 2026-05-02

### Added

- suíte mínima de testes com Vitest + React Testing Library;
- cobertura automatizada para utilitários globais em `src/utils/`;
- testes de integração para autenticação, criação de usuário e modais principais;
- documentação técnica consolidada em `DOCUMENTATION.md`;
- utilitários globais de mês, dia útil e impressão em `src/utils/`;
- hook `useMetasResumoMensal` e componentes extraídos para o resumo mensal.

### Changed

- leitura de dados internos e públicos consolidada em snapshots estáticos (`static/data.json` e `static/internal/data.json`);
- `MetasResumoMensal` reduzido a componente orquestrador fino;
- `eslint.config.js` ajustado para projeto React/Vitest atual;
- `vite.config.js` ampliado para testes e cobertura;
- `README.md` atualizado com instruções práticas de teste.

### Removed

- módulo `Field Service` removido da navegação e do código-fonte ativo;
- rotas `FS_*` e alternância de sistema removidas da aplicação autenticada.

### Security

- Storage restrito por regra explícita para `static/` e `user-uploads/{uid}/`;
- troca obrigatória de senha mantida para usuários com `trocar_senha = true`.

### Known Gaps

- `firestore.rules` não está versionado no repositório;
- não existe workflow CI versionado em `.github/workflows`;
- há rotas constantes e módulos presentes no código que ainda não estão registrados no `AppRouter`.
