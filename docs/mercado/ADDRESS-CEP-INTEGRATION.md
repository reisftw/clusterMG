# Endereço e CEP

O endpoint público do Mercado é `GET /api/mercado/onboarding/cep/:cep`. Ele valida oito dígitos, aplica timeout de 4,5 segundos e mantém cache em memória por 24 horas.

O provedor configurável `CEP_BRASIL_API_URL` só é usado quando houver URL e token contratuais documentados. Como não havia endpoint/contrato CEP Brasil no repositório, o fallback implementado é a API pública ViaCEP: `https://viacep.com.br/ws/{cep}/json/`.

O retorno apenas preenche campos ainda vazios no formulário. Número e complemento continuam manuais; endereço não localizado ou genérico permanece editável. O IBGE retornado pelo provedor é salvo somente como dado cadastral, nunca como localização em tempo real.
