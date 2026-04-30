import { useRegionais } from '../../regionais/hooks/useRegionais';

const ColaboradorRegionalField = ({ value, onChange }) => {
  const { regionais, loading } = useRegionais();

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">Regional</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        className="input-field"
      >
        <option value="">Sem regional</option>
        {regionais.map((r) => (
          <option key={r.id} value={r.nome}>{r.nome}</option>
        ))}
      </select>
    </div>
  );
};

export default ColaboradorRegionalField;
