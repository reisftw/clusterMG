with official_basal_budgets as (
	select jsonb_agg(
		jsonb_build_object(
			'classType', 'basal',
			'categoriaClasse', 'basal',
			'categoryName', category_name,
			'categoriaMae', category_name,
			'accountName', account_name,
			'contaNome', account_name,
			'periodScope', 'monthly_default',
			'planned', planned,
			'orcado', planned,
			'source', '055_financeiro_basal_orcado_padrao_oficial'
		)
		order by ord
	) as items
	from (
		values
			(1, 'Produto', 'Serviços Digitais', 264423.00::numeric),
			(2, 'Ocupação', 'Aluguel', 250797.00::numeric),
			(3, 'Ocupação', 'Energia Elétrica (Lojas, Escritorios)', 50456.00::numeric),
			(4, 'Ocupação', 'Condomínio', 10757.00::numeric),
			(5, 'Ocupação', 'Água e Esgoto', 6454.00::numeric),
			(6, 'Ocupação', 'Segurança e Monitoramento', 6455.00::numeric),
			(7, 'Ocupação', 'IPTU', 6453.00::numeric),
			(8, 'Ocupação', 'Móveis e Utensílios', 15000.00::numeric),
			(9, 'Marketing', 'Feiras, Congressos e Exposições', 30116.00::numeric),
			(10, 'Marketing', 'Ações de venda', 15252.00::numeric),
			(11, 'Marketing', 'Marketing Institucional', 4048.00::numeric),
			(12, 'Marketing', 'Marketing de relacionamento', 14659.00::numeric),
			(13, 'Marketing', 'Propaganda', 410890.00::numeric),
			(14, 'Transmissão', 'Aluguel Postes', 620589.00::numeric),
			(15, 'Transmissão', 'Aluguel Torres', 136689.00::numeric),
			(16, 'Viagens e Estadias', 'Despesas de Viagens e Estadias', 87876.00::numeric),
			(17, 'Conservação e reparo predial', 'Manutenção de Imóveis', 25815.00::numeric),
			(18, 'Veículos', 'Manutenção Preventiva de Veículos', 26500.00::numeric),
			(19, 'Veículos', 'Multas e Infrações', 0.00::numeric),
			(20, 'Veículos', 'Lavagem', 5000.00::numeric),
			(21, 'Veículos', 'Manutenção Corretiva de Veículos', 55000.00::numeric),
			(22, 'Taxas e contribuições', 'Contribuição a Entidades de Classe', 584.00::numeric),
			(23, 'Taxas e contribuições', 'Taxas Estaduais', 495.00::numeric),
			(24, 'Taxas e contribuições', 'Taxas de Expediente', 1120.00::numeric),
			(25, 'Taxas e contribuições', 'Taxas Municipais', 2962.00::numeric),
			(26, 'Taxas e contribuições', 'Taxas Federais', 10838.00::numeric),
			(27, 'Financeiro', 'Tarifas e pacotes bancários', 6052.00::numeric),
			(28, 'Financeiro', 'IOF', 0.00::numeric),
			(29, 'Financeiro', 'IRRF sobre Aplicações', 0.00::numeric),
			(30, 'Financeiro', 'Tarifas Boletos', 116915.00::numeric),
			(31, 'Terceiros', 'Serviços de Consultoria', 78292.00::numeric),
			(32, 'Terceiros', 'Serviços Gráficos', 1008.00::numeric),
			(33, 'Terceiros', 'Serviços Contábeis', 17000.00::numeric),
			(34, 'Terceiros', 'Serviços Jurídicos', 25090.00::numeric),
			(35, 'Terceiros', 'Serviços Prestados - PJ', 32703.00::numeric),
			(36, 'Administrativo', 'Serviços de Conservação e Limpeza', 36571.00::numeric),
			(37, 'Administrativo', 'Material de Consumo', 3390.00::numeric),
			(38, 'Administrativo', 'Locações Diversas', 2510.00::numeric),
			(39, 'Administrativo', 'Lanches e Refeições', 23143.00::numeric),
			(40, 'Administrativo', 'Seguros', 10000.00::numeric),
			(41, 'Administrativo', 'Despesas c/ cartório, autenticação e xerox', 244.00::numeric),
			(42, 'Administrativo', 'Fretes e Carretos', 645.00::numeric),
			(43, 'Administrativo', 'Correios', 2399.00::numeric),
			(44, 'Administrativo', 'Copa e Cozinha', 37965.00::numeric),
			(45, 'Administrativo', 'Material Escrit Impressos e Mat de Exped', 11316.00::numeric),
			(46, 'Administrativo', 'Bens de Valores Reduzidos', 21512.00::numeric),
			(47, 'Impostos Retenção', 'IRRF s/ PJ', 5557.00::numeric),
			(48, 'Impostos Retenção', 'FUST/FUNTEL', 122484.00::numeric),
			(49, 'Impostos Retenção', 'CSLL/PIS/COFINS (retenção)', 20923.00::numeric),
			(50, 'Impostos Retenção', 'IRRF s/ Aluguel', 13705.00::numeric),
			(51, 'Impostos Retenção', 'INSS s/ terceiros', 10644.00::numeric),
			(52, 'Comercial', 'Comissões PJ', 494776.00::numeric),
			(53, 'TI', 'Telefone', 45175.00::numeric),
			(54, 'TI', 'Infraestrutura de Datacenter', 9000.00::numeric),
			(55, 'TI', 'Computadores e Periféricos', 84998.00::numeric),
			(56, 'TI', 'Telefonia - STFC', 10354.00::numeric),
			(57, 'TI', 'Softwares', 430238.00::numeric),
			(58, 'Logística', 'Estacionamento e Pedágios', 15000.00::numeric),
			(59, 'Logística', 'Aluguel de Veículos', 483086.00::numeric),
			(60, 'Logística', 'Combustíveis - Veículos', 273780.00::numeric),
			(61, 'Rede', 'Manutenção de Máquinas e Equipamentos', 8604.00::numeric),
			(62, 'Rede', 'Equipamentos POP (Switches, OTDR, Baterias)', 122565.00::numeric),
			(63, 'Rede', 'Ferramentas', 35000.00::numeric),
			(64, 'Rede', 'Energia Elétrica (Torres, POPs, Cessão de Energia)', 124348.00::numeric),
			(65, 'Rede', 'Rede de Backbone e Rede Ramal', 275483.00::numeric),
			(66, 'Interconexão', 'Link Last Mile', 35907.00::numeric),
			(67, 'Interconexão', 'Aluguel de Rack / Cross Conexões', 135660.00::numeric),
			(68, 'Interconexão', 'Link', 623992.00::numeric),
			(69, 'Pessoal', 'INSS s/ colaborador', 789213.00::numeric),
			(70, 'Pessoal', 'Demissões', 36776.00::numeric),
			(71, 'Pessoal', 'Medicamentos e Assistência Médica', 191845.00::numeric),
			(72, 'Pessoal', 'Vale transporte', 15000.00::numeric),
			(73, 'Pessoal', 'Acordos Trabalhistas e Indenizações', 19360.00::numeric),
			(74, 'Pessoal', 'Serviços de Saúde Ocupacional', 27879.00::numeric),
			(75, 'Pessoal', 'Programas de Bem-estar', 0.00::numeric),
			(76, 'Pessoal', 'Seguros de Vida', 5707.00::numeric),
			(77, 'Pessoal', 'Pró-Labore', 8158.00::numeric),
			(78, 'Pessoal', 'Materiais de Proteção e Uniformes', 34506.00::numeric),
			(79, 'Pessoal', 'Salários e Ordenados - PJ', 310284.00::numeric),
			(80, 'Pessoal', 'Convênio Farmácia', 39283.00::numeric),
			(81, 'Pessoal', 'Eventos Comemorativos e Homenagens', 64535.00::numeric),
			(82, 'Pessoal', 'Ajuda de Custo', 21110.00::numeric),
			(83, 'Pessoal', 'Capacitação e Desenvolvimento', 52500.00::numeric),
			(84, 'Pessoal', 'FGTS', 271834.00::numeric),
			(85, 'Pessoal', 'IRRF s/ salários', 145998.00::numeric),
			(86, 'Pessoal', 'Programa de Alimentação do Trabalhador', 574047.00::numeric),
			(87, 'Pessoal', 'Férias', 316089.00::numeric),
			(88, 'Pessoal', 'Salários e Ordenados', 2726593.00::numeric),
			(89, 'Instalação/Manutenção', 'Roteador / ONU / Modem', 264269.00::numeric),
			(90, 'Instalação/Manutenção', 'Serviços de Manutenção (técnicos)', 639350.00::numeric),
			(91, 'Instalação/Manutenção', 'Materiais de Instalação (metais, conectores, etc)', 244492.00::numeric),
			(92, 'Instalação/Manutenção', 'Cabo Drop', 358369.00::numeric),
			(93, 'Instalação/Manutenção', 'Serviços de Instalação (técnicos)', 934414.00::numeric),
			(94, 'Impostos Sobre Resultado', 'CSLL', 300036.00::numeric),
			(95, 'Impostos Sobre Resultado', 'IRPJ', 891555.00::numeric),
			(96, 'Impostos Deduções', 'ICMS dif aliq.', 44270.00::numeric),
			(97, 'Impostos Deduções', 'ISS', 200046.00::numeric),
			(98, 'Impostos Deduções', 'PIS', 114470.00::numeric),
			(99, 'Impostos Deduções', 'COFINS', 528161.00::numeric),
			(100, 'Impostos Deduções', 'ICMS', 1871254.00::numeric)
	) as values_list(ord, category_name, account_name, planned)
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
		jsonb_set(data, '{settings}', coalesce(data->'settings', '{}'::jsonb), true),
		'{settings,financialCategoryBudgets}',
		(
			select coalesce(jsonb_agg(item), '[]'::jsonb)
			from jsonb_array_elements(
				coalesce(data #> '{settings,financialCategoryBudgets}', '[]'::jsonb)
			) as preserved(item)
			where coalesce(item->>'classType', item->>'categoriaClasse') <> 'basal'
		) || official_basal_budgets.items,
		true
	) as data
	from existing_meta
	cross join official_basal_budgets
	limit 1
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
from prepared_meta
on conflict (config_id) do update set
	data = excluded.data,
	legacy_path = excluded.legacy_path,
	legacy_document_id = excluded.legacy_document_id,
	source_payload = excluded.source_payload,
	updated_at = now();

update financeiro_orcamento_matriz
set
	orcado = 0,
	source_payload = case
		when jsonb_typeof(source_payload) = 'object'
			then jsonb_set(source_payload, '{monthValue}', '0'::jsonb, true)
		else source_payload
	end,
	updated_at = now()
where versao_id = 'importacao'
	and orcado <> 0;
