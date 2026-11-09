# Integrações externas

HubSoft é a principal dependência de custo. O scheduler separa sucesso de tentativa, usa locks persistidos e agora evita retry em rajada. O backoff não marca uma coleta falha como atualizada; o próximo sucesso continua determinando o frescor real.

Evolution, WhatsApp Cloud, Google, SMTP e AutoISP foram inventariados, mas não sofreram mudança funcional nesta entrega. A rota AutoISP de serial apresentou 7/7 falhas e P95 próximo de 46,9 s em uma janela anterior; corrigir isso exige validação de conectividade externa e não foi misturado ao pacote atual.

Não houve chamada externa real em teste automatizado.
