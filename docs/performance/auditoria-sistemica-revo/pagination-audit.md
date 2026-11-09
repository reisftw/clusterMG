# Auditoria de paginação

Foram identificadas 503 declarações de rota e múltiplas listagens grandes. Tentativas, Maps e recuperação de ativos já possuem paginação ou recorte por área. A paginação de técnicos de recuperação já havia sido movida para SQL na correção anterior.

Não foi feita uma alteração global de limites: isso quebraria exportações, mapas e seletores operacionais. Os candidatos restantes precisam de contrato por consumidor antes de mudar payload ou ordenação. Nenhum endpoint teve campos removidos nesta publicação.
