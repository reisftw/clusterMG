const PessoaFields = ({ label, value = {}, onChange }) => {
  const set = (field, val) => onChange({ ...value, [field]: val });
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{label}</p>
      <input
        type="text"
        placeholder="Nome completo"
        value={value.nome || ''}
        onChange={(e) => set('nome', e.target.value)}
        className="input-field"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          placeholder="Telefone"
          value={value.telefone || ''}
          onChange={(e) => set('telefone', e.target.value)}
          className="input-field"
        />
        <input
          type="email"
          placeholder="E-mail"
          value={value.email || ''}
          onChange={(e) => set('email', e.target.value)}
          className="input-field"
        />
      </div>
    </div>
  );
};

export default PessoaFields;

