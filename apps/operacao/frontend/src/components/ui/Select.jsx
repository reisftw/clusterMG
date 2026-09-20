export default function Select({ value, onChange, items, empty = "Selecione" }) {
	return (
		<select value={value || ""} onChange={(e) => onChange(e.target.value)} className="rot-input">
			<option value="">{empty}</option>
			{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
		</select>
	);
}
