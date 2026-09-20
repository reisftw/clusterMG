-- Mantem a nova funcionalidade no configurador "Menus por operacao"
-- tambem para ambientes que ja possuem menu_config salvo.

update rot_settings
set
	value = jsonb_set(
		jsonb_set(
			jsonb_set(
				value,
				'{ROT,enabledItems}',
				case
					when coalesce(value #> '{ROT,enabledItems}', '[]'::jsonb) ? 'comando'
						then coalesce(value #> '{ROT,enabledItems}', '[]'::jsonb)
					else coalesce(value #> '{ROT,enabledItems}', '[]'::jsonb) || '["comando"]'::jsonb
				end,
				true
			),
			'{FIELD,enabledItems}',
			case
				when coalesce(value #> '{FIELD,enabledItems}', '[]'::jsonb) ? 'comando'
					then coalesce(value #> '{FIELD,enabledItems}', '[]'::jsonb)
				else coalesce(value #> '{FIELD,enabledItems}', '[]'::jsonb) || '["comando"]'::jsonb
			end,
			true
		),
		'{DELIVERY,enabledItems}',
		case
			when coalesce(value #> '{DELIVERY,enabledItems}', '[]'::jsonb) ? 'comando'
				then coalesce(value #> '{DELIVERY,enabledItems}', '[]'::jsonb)
			else coalesce(value #> '{DELIVERY,enabledItems}', '[]'::jsonb) || '["comando"]'::jsonb
		end,
		true
	),
	updated_at = now()
where key = 'menu_config';
