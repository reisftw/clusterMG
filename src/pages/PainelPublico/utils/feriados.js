const _feriadosCache = {};

export async function buscarFeriadosNacionais(ano) {
  if (_feriadosCache[ano]) return _feriadosCache[ano];
  try {
    const res = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`);
    if (!res.ok) throw new Error('Falha na API');
    const lista = await res.json();
    const set = new Set(lista.map(f => f.date.slice(5)));
    _feriadosCache[ano] = set;
    return set;
  } catch (e) {
    const fixos = ['01-01','04-03','04-06','04-21','05-01','06-04','09-07','10-12','11-02','11-15','11-20','12-25'];
    const set = new Set(fixos);
    _feriadosCache[ano] = set;
    return set;
  }
}