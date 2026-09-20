-- Import dos dados reais do Firestore (034_import Firebase, ver
-- scripts/firebase-import/) mostrou que o legado NUNCA garantiu
-- ticket_number unico por regional na pratica — 85 chamados reais
-- tinham numero repetido dentro da mesma regional (reabertura/correcao
-- manual, provavelmente). Relaxa a constraint pra indice normal (mantem
-- a performance de busca por numero) em vez de unique, pra nao perder
-- historico real na migracao. Cadastro novo pela tela continua
-- avisando de duplicata (checagem em rows afetadas, nao mais 409
-- garantido pelo banco).
drop index if exists idx_rot_tickets_number_regional;
create index if not exists idx_rot_tickets_number_regional on rot_tickets(regional_id, ticket_number);
