# Nota técnica — `xlsx` e GHSA-4r6h-8v6p-xvw6

## Contexto

O pacote `xlsx@0.18.5` permanece presente no projeto e continua aparecendo no `npm audit` com o advisory `GHSA-4r6h-8v6p-xvw6`.

- Pacote afetado: `xlsx`
- Versão atual no projeto: `0.18.5`
- Situação de correção: sem patch disponível upstream no momento desta análise
- Impacto no sprint: é a única vulnerabilidade `high` residual aceita temporariamente na aplicação web

## Onde o pacote é usado hoje

O uso atual de `xlsx` não está concentrado em um único ponto. Ele aparece em fluxos operacionais críticos de leitura de planilhas:

- `src/modules/metas/hooks/useMetas.js`
- `src/modules/metas/hooks/useMetasAuditoriaParser.js`
- `src/modules/mapeamento/utils/uploadMapeamento.js`
- `src/pages/Mapa/utils/uploadMapaOS.js`
- `src/pages/Mapa/utils/uploadMapaOSLegado.js`
- `src/pages/Mapa/utils/uploadMatchOS.js`
- `src/pages/Tecnicos/components/TecnicosAnalise.jsx`
- `src/modules/ferramentas/components/tabs/TabCancelamento.jsx`
- `src/modules/ferramentas/components/tabs/TabCancelamentosMes.jsx`
- `src/modules/ferramentas/components/tabs/TabDevolucoesDia.jsx`
- `src/modules/ferramentas/components/tabs/TabDevolucoesMes.jsx`
- `src/modules/ferramentas/components/tabs/TabDiario.jsx`
- `src/modules/ferramentas/components/tabs/TabEquipServico.jsx`
- `src/modules/ferramentas/components/tabs/TabMedia.jsx`
- `src/modules/ferramentas/components/tabs/TabMensal.jsx`
- `src/modules/ferramentas/components/tabs/TabMultas.jsx`
- `src/modules/ferramentas/components/tabs/TabOSAberto.jsx`

## Avaliação de substituição

O projeto já possui `exceljs`, mas o encaixe entre as duas bibliotecas não é simétrico:

- `exceljs` cobre bem geração de planilhas e leitura orientada a workbook/worksheet.
- `xlsx` hoje é usado com APIs bem específicas de parsing rápido, como `XLSX.read`, `XLSX.utils.sheet_to_json`, `XLSX.SSF.parse_date_code`, acesso por endereço de célula (`A1`, `AH7`) e operações de sheet name normalization.
- Em vários módulos, especialmente `useMetas.js`, a lógica atual depende diretamente desse modelo de leitura por coordenadas e por planilhas heterogêneas recebidas do negócio.

Conclusão desta rodada:

- A substituição completa é viável tecnicamente, mas não é um swap mecânico.
- Não existe, neste momento, um piloto de baixo risco que elimine o pacote vulnerável apenas migrando um módulo exportador.
- Os pontos em que `exceljs` já aparece, como geração de relatórios, não removem a dependência de `xlsx` do caminho crítico de importação.
- Para reduzir o risco de fato, o piloto precisa migrar um fluxo real de leitura de planilha de ponta a ponta.

## Piloto recomendado

O melhor candidato para a primeira migração controlada é:

- `src/modules/mapeamento/utils/uploadMapeamento.js`

Motivos:

- O parser é relativamente isolado.
- A entrada é tabular e usa menos leitura por coordenadas fixas do que `useMetas.js`.
- O impacto funcional é mais fácil de validar com teste unitário e com arquivos de amostra.

## Estratégia recomendada

1. Introduzir um parser dedicado usando `exceljs` em `uploadMapeamento.js`.
2. Validar compatibilidade com:
   - aliases de colunas;
   - parsing de datas;
   - consolidação mensal por regional.
3. Rodar os mesmos testes unitários do módulo antigo e novo em paralelo.
4. Só então repetir a abordagem nos fluxos de:
   - `uploadMapaOS.js`
   - `useMetasAuditoriaParser.js`
   - `useMetas.js`

## Risco residual aceito

Enquanto `xlsx` permanecer no projeto:

- o `npm audit` da raiz continuará apontando um `high`;
- qualquer ingestão de planilhas deve ser tratada como superfície de risco operacional;
- a mitigação prática continua sendo limitar a origem dos arquivos importados a fontes internas controladas e manter o plano de substituição ativo no backlog técnico.
