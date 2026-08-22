import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';

import { parseAgentesWorkbook } from './useMetasAuditoriaParser';

function createSheet(cells = {}, ref = 'A1:AJ60') {
  const sheet = { '!ref': ref };
  Object.entries(cells).forEach(([address, value]) => {
    sheet[address] = {
      t: typeof value === 'number' ? 'n' : 's',
      v: value,
    };
  });
  return sheet;
}

describe('parseAgentesWorkbook', () => {
  it('le todas as cidades da tabela principal mesmo quando novas linhas sao adicionadas ao final', () => {
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      createSheet(
        {
          A5: 'CIDADE',
          B5: 1,
          C5: 2,
          AF5: 'TOTAL',
          AG5: 'CANCEL.\nMES ANT.',
          AH5: 'META',
          A6: 'Formiga',
          B6: 1,
          C6: 2,
          AF6: 3,
          AG6: 10,
          AH6: 8,
          A24: 'Bom Despacho',
          B24: 4,
          C24: 10,
          AF24: 14,
          AG24: 96,
          AH24: 77,
          A25: 'ENTREGA EM LOJA AGENTES',
          A27: 'CIDADE',
          B27: 1,
          C27: 2,
          AF27: 'TOTAL',
          A28: 'Formiga',
          A46: 'Bom Despacho',
        },
        'A1:AJ46',
      ),
      '📝 AG_MAI',
    );

    const resultado = parseAgentesWorkbook(workbook);

    expect(resultado.Maio).toBeDefined();
    expect(resultado.Maio).toHaveLength(2);
    expect(resultado.Maio.map((item) => item.cidade)).toEqual(['Formiga', 'Bom Despacho']);
    expect(resultado.Maio[1]).toMatchObject({
      cidade: 'Bom Despacho',
      total: 14,
      cancelamentos: 96,
      meta: 77,
      pct: 18.2,
    });
    expect(resultado.Maio[1].daily.slice(0, 2)).toEqual([4, 10]);
  });

  it('faz fallback para a soma diaria quando a coluna TOTAL nao existe', () => {
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      createSheet(
        {
          A5: 'CIDADE',
          B5: 1,
          C5: 2,
          D5: 3,
          AF5: 'CANCEL.\nMES ANT.',
          A6: 'Pompeu',
          B6: 1,
          C6: 2,
          D6: 3,
          AF6: 9,
        },
        'A1:AF10',
      ),
      '📝 AG_JAN',
    );

    const resultado = parseAgentesWorkbook(workbook);

    expect(resultado.Janeiro).toEqual([
      {
        cidade: 'Pompeu',
        total: 6,
        cancelamentos: 9,
        meta: 0,
        pct: 0,
        daily: [1, 2, 3],
      },
    ]);
  });

  it('corrige cidade digitada como Aguianil para Aguanil', () => {
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      createSheet(
        {
          A5: 'CIDADE',
          B5: 1,
          C5: 'TOTAL',
          A6: 'Aguianil',
          B6: 2,
          C6: 2,
          A7: 'TOTAL',
        },
        'A1:C10',
      ),
      'AG_MAI',
    );

    const resultado = parseAgentesWorkbook(workbook);

    expect(resultado.Maio[0].cidade).toBe('Aguanil');
  });

  it('nao duplica a mesma cidade quando vem com acento ou espaco diferente', () => {
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      createSheet(
        {
          A5: 'CIDADE',
          B5: 1,
          C5: 'TOTAL',
          A6: 'Araujos',
          B6: 1,
          C6: 1,
          A7: '  Araujos  ',
          B7: 3,
          C7: 3,
          A8: 'TOTAL',
        },
        'A1:C10',
      ),
      'AG_MAI',
    );

    const resultado = parseAgentesWorkbook(workbook);

    expect(resultado.Maio).toHaveLength(1);
    expect(resultado.Maio[0]).toMatchObject({ cidade: 'Araujos', total: 3 });
  });
});

