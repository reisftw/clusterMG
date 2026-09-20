# Nota técnica — feature flag do ADM e contrato de rompimentos (Etapa 6)

## Feature flag: gestão inline de técnicos no ADM

- Nome: `VITE_ADM_ENABLE_INLINE_COMPANY_TECHNICIANS`
- Default: `false` (ausência da variável equivale a `false`)
- Owner: time do ADM
- Efeito: quando `true`, exibe a seção de gestão inline de técnicos (adicionar/remover técnico, editar dados) dentro do formulário de empresa em `EmpresasTecnicosPage.jsx`. Quando `false` (padrão), essa seção fica oculta — o resto do formulário, o submit e o payload de `form.tecnicos` continuam funcionando normalmente.
- Não pode ser alterada em produção nesta etapa.

### Como funciona

O parser da flag é uma função pura, testável sem depender de `import.meta.env`:

```js
// apps/adm/frontend/src/modules/empresasTecnicos/inlineTechniciansFlag.js
export function parseInlineCompanyTechniciansFlag(rawValue) {
	return String(rawValue || "").trim().toLowerCase() === "true";
}

export function isInlineCompanyTechniciansEnabled() {
	return parseInlineCompanyTechniciansFlag(
		import.meta.env.VITE_ADM_ENABLE_INLINE_COMPANY_TECHNICIANS,
	);
}
```

Regras: valor ausente, `"false"` ou qualquer valor diferente de `"true"` (case-insensitive, com espaços) resultam em desativado. Documentada em `apps/adm/frontend/.env.example` (arquivo que não existia antes desta etapa).

### Por que essa decisão

O bloco de ~139 linhas de UI de técnicos estava desligado com `{false ? <div>...} : null}` (achado como bloqueador na Etapa 5). `addTecnico`/`removeTecnico` só eram referenciados dentro desse bloco morto, mas `form.tecnicos` continuava sendo lido no submit — indício de que a funcionalidade foi desativada de propósito, não esquecida. Em vez de decidir unilateralmente entre remover ou reativar, a Etapa 6 formalizou a decisão como feature flag: reversível, documentada, sem apagar UI/handlers/estado/validações existentes.

## Contrato de criação de rompimentos (Operação)

### Causa raiz do código inalcançável

`POST /admin/rompimentos` tinha um `return 400` incondicional logo após a validação de campos, seguido de ~25 linhas de `INSERT` nunca executadas. Investigação (Etapa 6, Fase 3):

- Rompimentos anexam imagens via `/admin/attachments` (URL pré-assinada, tabela `rot_image_attachments`), cujo `assertEntityAccess` consulta `rot_rompimentos where id=$1` antes de reservar o upload — ou seja, a linha do rompimento **precisa existir antes de qualquer imagem poder ser anexada**.
- O frontend (`RompimentosPage.jsx`) só chama `createRotRompimento` (`POST /`) quando `isEdit=false`, mas `handleNewRompimento` sempre abre primeiro uma tratativa (`POST /draft`) antes de exibir o modal de edição — ou seja, `isEdit` é sempre `true` na prática e `POST /` era estruturalmente inalcançável pela UI atual.
- `apr/routes.js` usa um padrão diferente (Multer + blob no Postgres, até 10 fotos no mesmo `POST`) — rompimentos nunca usou Multer, não havia fluxo equivalente para portar sem reintroduzir uma arquitetura de armazenamento diferente da já usada (fora do escopo desta etapa, que proíbe adoção de fluxo de dados amplo).

### Contrato final

- `POST /admin/rompimentos`: valida o payload completo (ticket, regional, cidade, pontos A/B, fibra, materiais) e, se válido, **cria a tratativa** (`status='em_tratativa'`) — o mesmo papel que `POST /draft` já cumpria, mas aceitando o conjunto completo de campos de uma vez. Não marca `concluido` aqui (imagens não podem existir antes da linha existir).
- `PUT /admin/rompimentos/:id` com `status=concluido`: valida tratativa existente (implícito pelo `:id`), 1 a 10 imagens confirmadas (`rot_image_attachments`, novo limite superior explícito — antes só o upload em si limitava via `reserveSlot`), e demais campos obrigatórios. Só então persiste como `concluido`.
- Erros de banco/servidor passam por `toClientResponse` (`security/errors.js`), que já sanitizava mensagens de `DatabaseError` reais do driver `pg` antes desta etapa — confirmado com teste novo, não alterado.
- Fila offline (`offlineRotQueue.js`): `isNetworkFailure` já diferenciava corretamente falha de rede real (TypeError do fetch, `navigator.onLine=false`) de erro de validação/autenticação/servidor (que chega como `Error` comum com `.status`, nunca `TypeError`) — confirmado com 6 testes novos (não havia nenhum antes). Nenhuma mudança de comportamento foi necessária no frontend; a correção do `POST /` também corrigiu, como efeito colateral, a sincronização de rompimentos enfileirados offline, que antes falhava sempre (o endpoint sempre respondia 400).

Nenhuma migration, tabela ou coluna foi alterada.
