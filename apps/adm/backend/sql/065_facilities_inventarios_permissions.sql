update app_permissions
set feature_id = 'patrimonio',
    feature_label = 'Patrimônio',
    description = case
      when id = 'facilities.patrimonio_inventario.view' then 'Visualizar patrimônio e itens administrativos.'
      else description
    end
where id in (
  'facilities.patrimonio_inventario.view',
  'facilities.patrimonio.view',
  'facilities.patrimonio.create',
  'facilities.patrimonio.edit',
  'facilities.patrimonio.transfer',
  'facilities.patrimonio.deactivate',
  'facilities.patrimonio.qr.export'
);

update app_permissions
set feature_id = 'inventarios',
    feature_label = 'Inventários'
where id in (
  'facilities.inventario.view',
  'facilities.inventario.execute',
  'facilities.inventario.approve'
);
