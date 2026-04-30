import { useState, useCallback } from 'react';
import { gerarRelatorioHtml, copiarRelatorioParaClipboard } from '../services/clipboardService';

export const useClipboard = () => {
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro]       = useState(null);

  const copiar = useCallback(async (dados, incluir) => {
    setErro(null);
    try {
      const html = gerarRelatorioHtml({ ...dados, incluir });
      await copiarRelatorioParaClipboard(html);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 3000);
    } catch {
      setErro('Erro ao copiar relatório.');
    }
  }, []);

  return { copiar, copiado, erro };
};
