# Retorninho IA

## Escopo

O Retorninho IA é um módulo administrativo do Retiradas em `/retorninho`. Ele
usa a instância exclusiva `retorninho-ia` na Evolution ou um Phone Number ID
dedicado na Meta, uma lista de usuários autorizados e ferramentas operacionais
limitadas. O módulo não compartilha conversas nem filas com a Mensageria
produtiva. No modo Meta, ele reutiliza o cofre de credenciais oficial já
protegido pelo backend e isola o tráfego pelo Phone Number ID configurado.

O agente nasce pausado. Publicar a aplicação e aplicar a migration não conecta
um número, não ativa respostas automáticas e não executa ferramentas.

## Segurança

- Acesso ao painel: `retorninho.view`.
- Configuração e autorizações: `retorninho.manage`.
- Logs: `retorninho.audit`.
- Reprocessamento: `retorninho.reprocess`.
- Chaves da Evolution e Gemini são cifradas com AES-256-GCM usando
  `APP_AUTH_SECRET`; a API retorna apenas o estado de configuração.
- O webhook Evolution aceita somente a instância `retorninho-ia`, segredo
  próprio e eventos deduplicados. O webhook Meta exige assinatura HMAC válida e
  aceita para o agente somente eventos do Phone Number ID dedicado.
- O WhatsApp só autentica telefones vinculados a um usuário REVO ativo e a um
  nome de técnico HubSoft.
- Atribuições exigem confirmação explícita e usam o fluxo oficial de
  solicitação de O.S.; o protocolo só conclui após confirmação do resultado.

## Ativação operacional

1. Aplicar `122_retorninho_ia.sql`.
2. Conceder permissões adicionais aos cargos necessários. Apenas `admin`
   recebe as quatro permissões automaticamente.
3. Cadastrar as chaves protegidas no painel.
4. Autorizar técnicos e seus telefones.
5. Conectar a instância exclusiva e validar o recebimento no log técnico.
6. Habilitar o agente e, separadamente, as respostas automáticas.

## Rollback

O rollback de aplicação consiste em desabilitar `enabled` e
`automatic_replies`, parar o worker da versão nova e retornar ao artefato
anterior. As tabelas `retorninho_*` podem permanecer sem afetar os módulos
existentes. A remoção física das tabelas e permissões só deve ocorrer em uma
janela separada, com backup verificado, pois apaga histórico operacional.
