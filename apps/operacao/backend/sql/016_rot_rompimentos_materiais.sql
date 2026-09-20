-- Rompimentos: volta a guardar materiais gastos no formato do app ROT
-- original: quantidades por material + campo separado para outros itens.

alter table rot_rompimentos
	add column if not exists outros text not null default '';
