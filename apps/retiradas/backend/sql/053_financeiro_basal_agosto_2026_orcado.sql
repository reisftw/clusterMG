with basal_budgets as (
	select jsonb_agg(
		jsonb_build_object(
			'classType', class_type,
			'categoriaClasse', class_type,
			'categoryName', category_name,
			'categoriaMae', category_name,
			'accountName', account_name,
			'contaNome', account_name,
			'year', year_value,
			'ano', year_value,
			'month', month_value,
			'mes', month_value,
			'numMes', month_value,
			'planned', planned,
			'orcado', planned,
			'source', '053_financeiro_basal_agosto_2026_orcado'
		)
		order by ord
	) as items
	from (
		values
			(1, 'basal', 'Produto', 'Serviços Digitais', 2026, 8, 264423.00::numeric),
			(2, 'basal', 'Ocupação', 'Aluguel', 2026, 8, 250797.00::numeric),
			(3, 'basal', 'Ocupação', 'Energia Elétrica (Lojas, Escritorios)', 2026, 8, 50456.00::numeric),
			(4, 'basal', 'Ocupação', 'Condomínio', 2026, 8, 10757.00::numeric),
			(5, 'basal', 'Ocupação', 'Água e Esgoto', 2026, 8, 6454.00::numeric),
			(6, 'basal', 'Ocupação', 'Segurança e Monitoramento', 2026, 8, 6455.00::numeric),
			(7, 'basal', 'Ocupação', 'IPTU', 2026, 8, 6453.00::numeric),
			(8, 'basal', 'Ocupação', 'Móveis e Utensílios', 2026, 8, 15000.00::numeric),
			(9, 'basal', 'Marketing', 'Feiras, Congressos e Exposições', 2026, 8, 30116.00::numeric),
			(10, 'basal', 'Marketing', 'Ações de venda', 2026, 8, 15252.00::numeric),
			(11, 'basal', 'Marketing', 'Marketing Institucional', 2026, 8, 4048.00::numeric),
			(12, 'basal', 'Marketing', 'Marketing de relacionamento', 2026, 8, 14659.00::numeric),
			(13, 'basal', 'Marketing', 'Propaganda', 2026, 8, 410890.00::numeric),
			(14, 'basal', 'Transmissão', 'Aluguel Postes', 2026, 8, 620589.00::numeric),
			(15, 'basal', 'Transmissão', 'Aluguel Torres', 2026, 8, 136689.00::numeric),
			(16, 'basal', 'Viagens e Estadias', 'Despesas de Viagens e Estadias', 2026, 8, 87876.00::numeric),
			(17, 'basal', 'Conservação e reparo predial', 'Manutenção de Imóveis', 2026, 8, 25815.00::numeric),
			(18, 'basal', 'Veículos', 'Manutenção Preventiva de Veículos', 2026, 8, 26500.00::numeric),
			(19, 'basal', 'Veículos', 'Multas e Infrações', 2026, 8, 0.00::numeric),
			(20, 'basal', 'Veículos', 'Lavagem', 2026, 8, 5000.00::numeric),
			(21, 'basal', 'Veículos', 'Manutenção Corretiva de Veículos', 2026, 8, 55000.00::numeric),
			(22, 'basal', 'Taxas e contribuições', 'Contribuição a Entidades de Classe', 2026, 8, 584.00::numeric),
			(23, 'basal', 'Taxas e contribuições', 'Taxas Estaduais', 2026, 8, 495.00::numeric),
			(24, 'basal', 'Taxas e contribuições', 'Taxas de Expediente', 2026, 8, 1120.00::numeric),
			(25, 'basal', 'Taxas e contribuições', 'Taxas Municipais', 2026, 8, 2962.00::numeric),
			(26, 'basal', 'Taxas e contribuições', 'Taxas Federais', 2026, 8, 10838.00::numeric),
			(27, 'basal', 'Financeiro', 'Tarifas e pacotes bancários', 2026, 8, 6052.00::numeric),
			(28, 'basal', 'Financeiro', 'IOF', 2026, 8, 0.00::numeric),
			(29, 'basal', 'Financeiro', 'IRRF sobre Aplicações', 2026, 8, 0.00::numeric),
			(30, 'basal', 'Financeiro', 'Tarifas Boletos', 2026, 8, 116915.00::numeric),
			(31, 'basal', 'Terceiros', 'Serviços de Consultoria', 2026, 8, 78292.00::numeric),
			(32, 'basal', 'Terceiros', 'Serviços Gráficos', 2026, 8, 1008.00::numeric),
			(33, 'basal', 'Terceiros', 'Serviços Contábeis', 2026, 8, 17000.00::numeric),
			(34, 'basal', 'Terceiros', 'Serviços Jurídicos', 2026, 8, 25090.00::numeric),
			(35, 'basal', 'Terceiros', 'Serviços Prestados - PJ', 2026, 8, 32703.00::numeric),
			(36, 'basal', 'Administrativo', 'Serviços de Conservação e Limpeza', 2026, 8, 36571.00::numeric),
			(37, 'basal', 'Administrativo', 'Material de Consumo', 2026, 8, 3390.00::numeric),
			(38, 'basal', 'Administrativo', 'Locações Diversas', 2026, 8, 2510.00::numeric),
			(39, 'basal', 'Administrativo', 'Lanches e Refeições', 2026, 8, 23143.00::numeric),
			(40, 'basal', 'Administrativo', 'Seguros', 2026, 8, 10000.00::numeric),
			(41, 'basal', 'Administrativo', 'Despesas c/ cartório, autenticação e xerox', 2026, 8, 244.00::numeric),
			(42, 'basal', 'Administrativo', 'Fretes e Carretos', 2026, 8, 645.00::numeric),
			(43, 'basal', 'Administrativo', 'Correios', 2026, 8, 2399.00::numeric),
			(44, 'basal', 'Administrativo', 'Copa e Cozinha', 2026, 8, 37965.00::numeric),
			(45, 'basal', 'Administrativo', 'Material Escrit Impressos e Mat de Exped', 2026, 8, 11316.00::numeric),
			(46, 'basal', 'Administrativo', 'Bens de Valores Reduzidos', 2026, 8, 21512.00::numeric),
			(47, 'basal', 'Impostos Retenção', 'IRRF s/ PJ', 2026, 8, 5557.00::numeric),
			(48, 'basal', 'Impostos Retenção', 'FUST/FUNTEL', 2026, 8, 122484.00::numeric),
			(49, 'basal', 'Impostos Retenção', 'CSLL/PIS/COFINS (retenção)', 2026, 8, 20923.00::numeric),
			(50, 'basal', 'Impostos Retenção', 'IRRF s/ Aluguel', 2026, 8, 13705.00::numeric),
			(51, 'basal', 'Impostos Retenção', 'INSS s/ terceiros', 2026, 8, 10644.00::numeric),
			(52, 'basal', 'Comercial', 'Comissões PJ', 2026, 8, 494776.00::numeric),
			(53, 'basal', 'TI', 'Telefone', 2026, 8, 45175.00::numeric),
			(54, 'basal', 'TI', 'Infraestrutura de Datacenter', 2026, 8, 9000.00::numeric),
			(55, 'basal', 'TI', 'Computadores e Periféricos', 2026, 8, 84998.00::numeric),
			(56, 'basal', 'TI', 'Telefonia - STFC', 2026, 8, 10354.00::numeric),
			(57, 'basal', 'TI', 'Softwares', 2026, 8, 430238.00::numeric),
			(58, 'basal', 'Logística', 'Estacionamento e Pedágios', 2026, 8, 15000.00::numeric),
			(59, 'basal', 'Logística', 'Aluguel de Veículos', 2026, 8, 483086.00::numeric),
			(60, 'basal', 'Logística', 'Combustíveis - Veículos', 2026, 8, 273780.00::numeric),
			(61, 'basal', 'Rede', 'Manutenção de Máquinas e Equipamentos', 2026, 8, 8604.00::numeric),
			(62, 'basal', 'Rede', 'Equipamentos POP (Switches, OTDR, Baterias)', 2026, 8, 122565.00::numeric),
			(63, 'basal', 'Rede', 'Ferramentas', 2026, 8, 35000.00::numeric),
			(64, 'basal', 'Rede', 'Energia Elétrica (Torres, POPs, Cessão de Energia)', 2026, 8, 124348.00::numeric),
			(65, 'basal', 'Rede', 'Rede de Backbone e Rede Ramal', 2026, 8, 275483.00::numeric),
			(66, 'basal', 'Interconexão', 'Link Last Mile', 2026, 8, 35907.00::numeric),
			(67, 'basal', 'Interconexão', 'Aluguel de Rack / Cross Conexões', 2026, 8, 135660.00::numeric),
			(68, 'basal', 'Interconexão', 'Link', 2026, 8, 623992.00::numeric),
			(69, 'basal', 'Pessoal', 'INSS s/ colaborador', 2026, 8, 789213.00::numeric),
			(70, 'basal', 'Pessoal', 'Demissões', 2026, 8, 36776.00::numeric),
			(71, 'basal', 'Pessoal', 'Medicamentos e Assistência Médica', 2026, 8, 191845.00::numeric),
			(72, 'basal', 'Pessoal', 'Vale transporte', 2026, 8, 15000.00::numeric),
			(73, 'basal', 'Pessoal', 'Acordos Trabalhistas e Indenizações', 2026, 8, 19360.00::numeric),
			(74, 'basal', 'Pessoal', 'Serviços de Saúde Ocupacional', 2026, 8, 27879.00::numeric),
			(75, 'basal', 'Pessoal', 'Programas de Bem-estar', 2026, 8, 0.00::numeric),
			(76, 'basal', 'Pessoal', 'Seguros de Vida', 2026, 8, 5707.00::numeric),
			(77, 'basal', 'Pessoal', 'Pró-Labore', 2026, 8, 8158.00::numeric),
			(78, 'basal', 'Pessoal', 'Materiais de Proteção e Uniformes', 2026, 8, 34506.00::numeric),
			(79, 'basal', 'Pessoal', 'Salários e Ordenados - PJ', 2026, 8, 310284.00::numeric),
			(80, 'basal', 'Pessoal', 'Convênio Farmácia', 2026, 8, 39283.00::numeric),
			(81, 'basal', 'Pessoal', 'Eventos Comemorativos e Homenagens', 2026, 8, 64535.00::numeric),
			(82, 'basal', 'Pessoal', 'Ajuda de Custo', 2026, 8, 21110.00::numeric),
			(83, 'basal', 'Pessoal', 'Capacitação e Desenvolvimento', 2026, 8, 52500.00::numeric),
			(84, 'basal', 'Pessoal', 'FGTS', 2026, 8, 271834.00::numeric),
			(85, 'basal', 'Pessoal', 'IRRF s/ salários', 2026, 8, 145998.00::numeric),
			(86, 'basal', 'Pessoal', 'Programa de Alimentação do Trabalhador', 2026, 8, 574047.00::numeric),
			(87, 'basal', 'Pessoal', 'Férias', 2026, 8, 316089.00::numeric),
			(88, 'basal', 'Pessoal', 'Salários e Ordenados', 2026, 8, 2726593.00::numeric),
			(89, 'basal', 'Instalação/Manutenção', 'Roteador / ONU / Modem', 2026, 8, 264269.00::numeric),
			(90, 'basal', 'Instalação/Manutenção', 'Serviços de Manutenção (técnicos)', 2026, 8, 639350.00::numeric),
			(91, 'basal', 'Instalação/Manutenção', 'Materiais de Instalação (metais, conectores, etc)', 2026, 8, 244492.00::numeric),
			(92, 'basal', 'Instalação/Manutenção', 'Cabo Drop', 2026, 8, 358369.00::numeric),
			(93, 'basal', 'Instalação/Manutenção', 'Serviços de Instalação (técnicos)', 2026, 8, 934414.00::numeric),
			(94, 'basal', 'Impostos Sobre Resultado', 'CSLL', 2026, 8, 300036.00::numeric),
			(95, 'basal', 'Impostos Sobre Resultado', 'IRPJ', 2026, 8, 891555.00::numeric),
			(96, 'basal', 'Impostos Deduções', 'ICMS dif aliq.', 2026, 8, 44270.00::numeric),
			(97, 'basal', 'Impostos Deduções', 'ISS', 2026, 8, 200046.00::numeric),
			(98, 'basal', 'Impostos Deduções', 'PIS', 2026, 8, 114470.00::numeric),
			(99, 'basal', 'Impostos Deduções', 'COFINS', 2026, 8, 528161.00::numeric),
			(100, 'basal', 'Impostos Deduções', 'ICMS', 2026, 8, 1871254.00::numeric)
	) as values_list(ord, class_type, category_name, account_name, year_value, month_value, planned)
),
existing_meta as (
	select coalesce(data, '{}'::jsonb) as data
	from financeiro_config_meta
	where config_id = 'orcamento_centros_custo'
	union all
	select '{}'::jsonb
	where not exists (
		select 1
		from financeiro_config_meta
		where config_id = 'orcamento_centros_custo'
	)
),
prepared_meta as (
	select jsonb_set(
		data,
		'{settings}',
		coalesce(data->'settings', '{}'::jsonb),
		true
	) as data
	from existing_meta
	limit 1
),
merged_meta as (
	select jsonb_set(
		prepared_meta.data,
		'{settings,financialCategoryBudgets}',
		(
			select coalesce(jsonb_agg(item), '[]'::jsonb)
			from jsonb_array_elements(
				coalesce(prepared_meta.data #> '{settings,financialCategoryBudgets}', '[]'::jsonb)
			) as preserved(item)
			where not (
				coalesce(item->>'classType', item->>'categoriaClasse') = 'basal'
				and coalesce(item->>'year', item->>'ano') = '2026'
				and coalesce(item->>'month', item->>'mes', item->>'numMes') = '8'
			)
		) || basal_budgets.items,
		true
	) as data
	from prepared_meta
	cross join basal_budgets
)
insert into financeiro_config_meta (
	config_id,
	data,
	legacy_path,
	legacy_document_id,
	source_payload
)
select
	'orcamento_centros_custo',
	data,
	'financeiro_config/orcamento_centros_custo',
	'orcamento_centros_custo',
	data
from merged_meta
on conflict (config_id) do update set
	data = excluded.data,
	legacy_path = excluded.legacy_path,
	legacy_document_id = excluded.legacy_document_id,
	source_payload = excluded.source_payload,
	updated_at = now();
