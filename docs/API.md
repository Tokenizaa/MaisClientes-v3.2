# MapScrape REST API v1 — contrato de integração

Este documento descreve o contrato implementado em `server.ts` para consumidores humanos, agentes de programação e integrações server-to-server. A documentação pública é https://mais-clientes-v2.vercel.app/docs/ e o OpenAPI é https://mais-clientes-v2.vercel.app/openapi.yaml.

## 1. Arquitetura e limites

### Cadastro e autenticação da plataforma

A interface web usa uma conta individual, separada das credenciais de integrações externas. O usuário cadastra nome, e-mail e senha (mínimo de 12 caracteres), entra pelo formulário de login e recebe uma sessão JWT de 12 horas. O token é mantido somente na sessão do navegador; não deve ser incorporado ao bundle nem compartilhado.

| Método | Endpoint | Uso |
|---|---|---|
| POST | `/api/auth/register` | Criar conta de usuário |
| POST | `/api/auth/login` | Iniciar sessão |
| GET | `/api/auth/me` | Validar sessão e recuperar perfil |

A primeira conta só pode ser criada com o e-mail administrador configurado (`MAPSCRAPE_ADMIN_EMAIL`, padrão `olfnetto@gmail.com`) e validada exclusivamente no servidor. Enquanto não houver contas, cadastros sem essa autorização são recusados. Depois da primeira conta, os novos cadastros recebem papel `user`. Como alternativa operacional, `MAPSCRAPE_ADMIN_EMAIL`, `MAPSCRAPE_ADMIN_PASSWORD` e `MAPSCRAPE_SESSION_SECRET` permitem bootstrap server-side sem enviar a senha pelo navegador. Nunca exponha segredos no bundle público, URLs ou logs.


### Uso da plataforma versus integração externa

O uso normal do aplicativo MapScrape — criar projetos, cadastrar categorias, iniciar pesquisas e consultar resultados — não deve exigir que o operador emita ou cole uma chave de consumidor. A chave de consumidor é destinada a um sistema externo independente que chama a REST API.

Para cadastrar um sistema externo, o operador informa **nome do cliente** e **nome do projeto consumidor** em Integrações → Credenciais de API, gera a chave e a copia uma única vez para o gerenciador de segredos do sistema cliente. O token de provisionamento é segredo administrativo da infraestrutura: nunca deve ser solicitado a um consumidor nem exposto em JavaScript público. A tela de emissão deve ser acessível somente por sessão administrativa autenticada; não implemente um proxy público que injete esse token sem autorização.


MapScrape é um serviço central de coleta. O projeto consumidor faz chamadas HTTPS para a API; não clona este repositório, não instala Puppeteer, não cria um scraper paralelo e não acessa o banco central diretamente. Fluxo de coleta: criar/selecionar projeto e categoria → iniciar job → guardar `jobId` → consultar status → buscar resultados paginados.

Configure no **backend** do consumidor:
- `MAPSCRAPE_API_BASE_URL`: origem HTTPS do serviço implantado, sem sufixo de endpoint. Produção atual: `https://mais-clientes-v2.vercel.app`.
- `MAPSCRAPE_API_KEY`: chave individual emitida para esse consumidor.

Não use prefixo `VITE_`, `NEXT_PUBLIC_` ou outra variável pública para a chave. Não coloque segredos em URLs, prompts, HTML, repositório ou logs. Não use a chave bootstrap de provisionamento nas chamadas normais.

## 2. Autenticação

Para toda rota v1 exceto `GET /api/v1/health`:

```http
Authorization: Bearer <MAPSCRAPE_API_KEY>
Accept: application/json
Content-Type: application/json
```

- Credenciais individuais identificam um `consumer_project`; jobs, projetos, categorias e leads ficam limitados a esse escopo.
- Credenciais são armazenadas no serviço como hash e a chave completa é mostrada somente ao emitir/rotacionar.
- Chaves estáticas legadas configuradas em `MAPSCRAPE_API_KEYS` compartilham o escopo operacional `operator-static-key`; não as compartilhe entre consumidores independentes.
- Falta/chave inválida: `401 unauthorized`; falha ao consultar credenciais: `503 authentication_unavailable`.
- O header de resposta `X-MapScrape-Consumer` identifica o escopo autenticado; `Cache-Control: no-store` é aplicado nas rotas autenticadas.

## 3. Provisionamento administrativo (infraestrutura autorizada apenas)

Estas rotas aceitam a sessão Bearer da plataforma de um usuário com papel `admin` (usada pela tela Credenciais) ou, para automação de infraestrutura server-to-server, `X-MapScrape-Provisioning-Token: <MAPSCRAPE_PROVISIONING_TOKEN>`. Nunca entregue o token administrativo de provisionamento a consumidores. O Bearer de consumidor não autoriza provisionamento.

### POST /api/v1/provisioning/credentials
Request JSON:
```json
{"consumerName":"Beleza Digital","consumerProject":"beleza-digital"}
```
`consumerName` (rótulo da interface: **Nome do cliente**): string não vazia, máximo 120 caracteres. `consumerProject` (rótulo da interface: **Nome do projeto**): string não vazia, máximo 200. Retorna `201` com `data.credentialId`, `data.apiKey`, `data.consumerName`, `data.consumerProject` e `data.revealOnce: true`. A chave é persistida como hash SHA-256 na tabela `api_credentials`; a escrita no Supabase é aguardada antes da resposta. A chave completa aparece uma única vez; guarde-a diretamente no secret manager. Um projeto com credencial ativa retorna `409 credential_already_exists`.

### GET /api/v1/provisioning/credentials
Lista metadados (`id`, `consumer_name`, `consumer_project`, `status`, `created_at`); não retorna chave em texto claro nem hash. Resposta usa `Cache-Control: no-store`.

### DELETE /api/v1/provisioning/credentials/{id}
Revoga a credencial ativa. Retorna `200 {"data":{"credentialId":"...","status":"revoked"}}`; não encontrada/ativa: `404 active_credential_not_found`. A alteração é persistida no Supabase antes da resposta.

### POST /api/v1/provisioning/credentials/{id}/rotate
Revoga a credencial anterior e cria uma nova credencial (novo ID) para o mesmo cliente/projeto. Retorna `201` com `data.apiKey`, `data.credentialId`, `data.previousCredentialId`, `data.consumerName`, `data.consumerProject` e `data.revealOnce`. A chave é revelada uma única vez e armazenada somente como hash. A chave anterior deixa de funcionar imediatamente. Se a criação da nova falhar após a revogação, a chave antiga continua revogada; faça nova emissão. Armazene a substituta diretamente no secret manager.

## 4. Projetos e categorias de pesquisa

Projeto e categoria são cadastros separados. A categoria de pesquisa NÃO é o campo `category` que vem da ficha do Google Maps. Nomes são aparados e normalizados (Unicode NFKC, espaços normalizados, comparação sem diferenciar maiúsculas/minúsculas em pt-BR) para evitar duplicação dentro do escopo do consumidor. Não há compartilhamento por nome entre consumidores.

### GET /api/v1/projects
Retorna `200 {"data":[Project...]}`. Projeto contém `id`, `name`, `consumer_project`, `created_at`, `updated_at`.

### POST /api/v1/projects
Request: `{"name":"Prospecção de clínicas em Porto Alegre"}`. Retorna `201 {"data": Project}`. Nome ausente/vazio: `422 project_name_required`. A repetição do mesmo nome normalizado retorna o projeto já existente (operação idempotente por nome e escopo).

### PATCH /api/v1/projects/{id}
Request: `{"name":"Novo nome do projeto"}`. Atualiza o projeto do consumidor. Retorna `200 {"data": Project}`. Nome ausente/vazio: `422 project_name_required`. Conflito com outro projeto existente: `409 project_name_conflict`. Não encontrado: `404 project_not_found`.

### DELETE /api/v1/projects/{id}
Exclui o projeto do consumidor mantendo as pesquisas históricas desvinculadas. Retorna `200 {"data": {"id":"...", "status":"deleted"}}`. Não encontrado: `404 project_not_found`.

### GET /api/v1/categories
Retorna `200 {"data":[Category...]}`. Categoria contém `id`, `name`, `consumer_project`, `created_at`.

### POST /api/v1/categories
Request: `{"name":"Clínica odontológica"}`. Retorna `201 {"data": Category}`. Nome ausente/vazio: `422 category_name_required`. A repetição do nome normalizado retorna o cadastro existente.

### PATCH /api/v1/categories/{id}
Request: `{"name":"Novo nome da categoria"}`. Atualiza a categoria do consumidor. Retorna `200 {"data": Category}`. Nome ausente/vazio: `422 category_name_required`. Conflito: `409 category_name_conflict`. Não encontrada: `404 category_not_found`.

### DELETE /api/v1/categories/{id}
Exclui a categoria de pesquisa do consumidor mantendo as pesquisas históricas. Retorna `200 {"data": {"id":"...", "status":"deleted"}}`. Não encontrada: `404 category_not_found`.

## 5. Endpoints de consumidor

### GET /api/v1/health — público
Sem autenticação. Sucesso `200`: `{"status":"ok","service":"mapscrape-api","apiVersion":"v1","database":"connected","totalLeads":123,"timestamp":"..."}`. Falha de banco: `503` com `status:"degraded"` e `database:"unavailable"`. Não verifica conectividade do navegador de raspagem nem garante que uma coleta funciona.

### POST /api/v1/jobs — iniciar coleta assíncrona
Request:
```json
{
  "projectName": "Prospecção Porto Alegre",
  "categoryName": "Clínica odontológica",
  "segment": "clínicas odontológicas",
  "location": "Porto Alegre, RS",
  "limit": 20
}
```
- `segment`: string não vazia, obrigatória; termo que orienta a busca.
- `location`: string não vazia, obrigatória; local da pesquisa.
- `limit`: inteiro de 1 a 100; padrão 20.
- `projectName`: string opcional; padrão `${segment} · ${location}`.
- `categoryName`: string opcional; padrão igual a `segment`.
- O servidor resolve/cria projeto e categoria antes de gravar o job e vincula `project_id` e `category_id`.
- Retorna `202` com `data.jobId`, `data.status`, `data.statusUrl` e `data.resultsUrl`. Os URLs são relativos à base; resolva-os contra `MAPSCRAPE_API_BASE_URL`.
- `202` significa aceito/iniciado, não concluído nem prova de resultados.
- Erros: `422 invalid_request` para segment/location vazios; `422 invalid_limit` para limite inválido; `500 job_start_failed` se falhar persistência/início.
- Não há chave de idempotência implementada no contrato atual. Não repita automaticamente um POST após timeout; confirme antes se um job foi criado.

### GET /api/v1/jobs/{id} — status e progresso
Retorna `200 {"data": Job}`; `404 job_not_found` para job inexistente ou fora do escopo. Campos persistidos: `id`, `segment`, `project_name`, `project_id`, `category_id`, `location`, `limit_requested`, `status`, `status_message`, `total_found`, `total_collected`, `total_duplicates`, `total_errors`, `current_step`, `created_at`, `completed_at`; a resposta também inclui `isRunning`. Campos opcionais podem faltar em registros legados.
Estados: `running`, `completed`, `partial`, `stopped`, `failed`. Faça polling limitado com intervalo crescente e pare ao chegar a um estado terminal.

### GET /api/v1/jobs/{id}/results?limit=50&offset=0
Verifica primeiro se o job pertence ao consumidor. Retorna leads paginados no mesmo formato de `GET /api/v1/leads`. `limit`: inteiro 1–100, padrão 50. `offset`: inteiro >=0, padrão 0. Erros: `404 job_not_found`, `422 invalid_pagination`.

### GET /api/v1/leads
Consulta leads já persistidos do consumidor autenticado.
Query parameters:
| Nome | Tipo | Padrão / domínio | Comportamento |
|---|---|---|---|
| `query` | string | opcional | Busca textual nos campos de nome, categoria, endereço, telefone e website. |
| `jobId` | string | opcional | Restringe à coleta indicada. |
| `sortBy` | string | padrão interno | Campo de ordenação; opções documentadas: `name`, `category`, `rating`, `review_count`, `collected_at`. |
| `sortOrder` | string | `desc` | `asc` ordena crescente; outros valores caem para `desc`. |
| `limit` | integer | 50; 1–100 | Tamanho máximo da página. |
| `offset` | integer | 0; >=0 | Deslocamento a partir do início. |

Resposta:
```json
{
  "data": [{"id":"lead-id","job_id":"job-id","name":"Nome","category":"Categoria observada","address":"","phone":"","website":"","rating":"","review_count":"","price_range":"","opening_hours":"","business_status":"","latitude":"","longitude":"","maps_url":"","description":"","services_attributes":{},"photos":[],"videos":[],"logo_url":"","booking_url":"","social_links":[],"reviews":[],"review_topics":[],"additional_attributes":{},"media_items":[],"plus_code":"","collected_at":"2026-01-01T12:00:00.000Z"}],
  "pagination": {"total":1,"limit":50,"offset":0,"hasMore":false}
}
```
O exemplo é ilustrativo. Use `pagination.hasMore` para decidir se busca a página seguinte. Não assuma que `total` representa resultados ainda não coletados.

### GET /api/v1/leads/{id}
Retorna `200 {"data": Lead}` com o registro completo se ele pertence ao consumidor; caso contrário, `404 lead_not_found`.

## 6. Catálogo de campos de Lead

Todos os campos escalares abaixo são strings na implementação atual (inclusive `rating`, `review_count`, `latitude` e `longitude`). Preserve strings originais e converta números com validação apenas no seu domínio. Campos vazios indicam ausência de valor persistido, não uma negativa sobre o negócio.

| Campo | Tipo JSON atual | Descrição |
|---|---|---|
| `id` | string | ID persistido do lead. |
| `job_id` | string | ID da coleta de origem. |
| `name` | string | Nome exibido na ficha. |
| `category` | string | Categoria extraída da ficha, não o cadastro de categoria de pesquisa. |
| `address` | string | Endereço exibido. |
| `phone` | string | Telefone público, se exibido. |
| `website` | string | Site exibido. |
| `rating` | string | Nota da ficha como texto. |
| `review_count` | string | Quantidade de avaliações como texto. |
| `price_range` | string | Faixa de preço quando disponível. |
| `opening_hours` | string | Horários de funcionamento capturados. |
| `business_status` | string | Status operacional exibido. |
| `latitude`, `longitude` | string | Coordenadas como texto. |
| `maps_url` | string | URL da ficha no Google Maps. |
| `description` | string | Descrição pública. |
| `services_attributes` | object ou string | Serviços e atributos; texto pode ser preservado em dados legados/JSON inválido. |
| `photos` | array<string> | URLs de fotos. |
| `videos` | array<string> | URLs/fontes de vídeo. |
| `logo_url` | string | URL da imagem de perfil/logo. |
| `booking_url` | string | URL de agendamento. |
| `social_links` | array<string> | URLs sociais identificadas. |
| `reviews` | array ou string | Avaliações públicas; estrutura de cada item depende do conteúdo capturado. |
| `review_topics` | array ou string | Tópicos/contagens de avaliações. |
| `additional_attributes` | object ou string | Atributos públicos adicionais. |
| `media_items` | array ou string | Mídia estruturada quando disponível. |
| `plus_code` | string | Plus Code geográfico exibido. |
| `attributes` | array ou string | Atributos públicos normalizados. |
| `accessibility_attributes` | array ou string | Atributos públicos de acessibilidade. |
| `next_opening_text` | string | Texto de próxima abertura exibido. |
| `next_open_day` | string | Dia explicitamente identificado no texto de status. |
| `next_open_time` | string | Horário explicitamente identificado no texto de status. |
| `visible_photos_count` | string | Contagem explícita exibida na ficha; não é o número de URLs capturadas. |
| `postal_code` | string | CEP/código postal extraído quando identificável no endereço exibido. |
| `country` | string | País identificado no endereço público; vazio quando não identificável. |
| `city` | string | Cidade identificada no endereço público. |
| `state` | string | Estado/região identificada no endereço público. |
| `source_place_id` | string | Identificador da ficha extraído da URL do Maps quando presente. |
| `source_url` | string | URL original usada para a coleta. |
| `popular_times` | array ou string | Rótulos/valores de horários de movimento realmente expostos no DOM. |
| `rating_distribution` | object ou string | Contagens por estrelas 1–5 somente quando explicitamente exibidas. |
| `review_highlights` | array ou string | Trechos de resumo de avaliações capturados separadamente dos reviews individuais. |
| `field_status` | object ou string | Estado de captura por campo; `not_observed_in_session` não prova inexistência na fonte. |
| `collected_at` | string | Timestamp textual da coleta. |

`photos`, `videos` e `social_links` são normalizados para arrays. `reviews`, `review_topics`, `additional_attributes`, `media_items`, `popular_times`, `rating_distribution`, `review_highlights` e `field_status` são persistidos como JSON serializado e podem aparecer como string no contrato legado. `field_status` usa `captured` quando houve valor observado e `not_observed_in_session` quando o extrator não observou valor nesta sessão; esse último estado não diferencia indisponibilidade da fonte de mudança no DOM e não prova que o dado inexiste. Endereço estruturado (cidade/estado/país/CEP) é preenchido apenas quando identificável a partir do endereço exibido. A presença de um campo no schema não garante que a página de origem o disponibilizou em toda execução.

## 7. Paginação, erros e retentativas

Formato de paginação de leads/resultados: `pagination.total`, `pagination.limit`, `pagination.offset`, `pagination.hasMore`. Para avançar, use `offset += limit` enquanto `hasMore === true`.

| HTTP | Códigos de erro típicos | Ação |
|---|---|---|
| `401` | `unauthorized`, `provisioning_unauthorized` | Corrigir secret/autorização; não repetir sem alteração. |
| `404` | `lead_not_found`, `job_not_found`, `active_credential_not_found` | Confirmar ID e escopo. Recursos de outro consumidor são tratados como não encontrados. |
| `409` | `credential_already_exists`, `credential_rotation_conflict` | Resolver conflito de credencial no fluxo administrativo. |
| `422` | `invalid_request`, `invalid_limit`, `invalid_pagination`, `project_name_required`, `category_name_required`, `invalid_consumer` | Corrigir payload ou parâmetros. |
| `500` | `job_start_failed`, `lead_query_failed`, `job_query_failed`, etc. | Registrar status/código sem segredo e investigar; não repetir POST cegamente. |
| `503` | `authentication_unavailable`, health degradado | Dependência indisponível; leituras podem ser repetidas com backoff limitado. |

Não há quota por consumidor nem endpoint separado para avaliações/mídias implementados neste contrato. Não há `Idempotency-Key` documentado para criação de job. Evite retries automáticos em POST. Use timeout e backoff limitado em leituras.

## 8. Exemplo ponta a ponta com cURL

```bash
export MAPSCRAPE_API_BASE_URL="https://mais-clientes-v2.vercel.app"
# Defina MAPSCRAPE_API_KEY no ambiente seguro; não grave a chave em um arquivo versionado.
curl -fsS "$MAPSCRAPE_API_BASE_URL/api/v1/projects" -H "Authorization: Bearer $MAPSCRAPE_API_KEY"
curl -fsS -X POST "$MAPSCRAPE_API_BASE_URL/api/v1/jobs" \
  -H "Authorization: Bearer $MAPSCRAPE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"projectName":"Prospecção POA","categoryName":"Clínicas","segment":"clínicas","location":"Porto Alegre, RS","limit":10}'
# Leia data.jobId da resposta; substitua JOB_ID nas próximas chamadas.
curl -fsS "$MAPSCRAPE_API_BASE_URL/api/v1/jobs/JOB_ID" -H "Authorization: Bearer $MAPSCRAPE_API_KEY"
curl -fsS "$MAPSCRAPE_API_BASE_URL/api/v1/jobs/JOB_ID/results?limit=50&offset=0" -H "Authorization: Bearer $MAPSCRAPE_API_KEY"
```

## 9. Qualidade e validação

O health check valida serviço/banco, não a conexão com navegador nem a raspagem ponta a ponta. Um `202` comprova aceitação da solicitação, não a coleta. Uma validação real deve usar credencial autorizada, uma busca pequena, polling até estado terminal, confirmar contadores e consultar resultados persistidos. Não use registros de teste criados diretamente no banco como prova de integração pela API.

Fontes: [portal](https://mais-clientes-v2.vercel.app/docs/), [OpenAPI](https://mais-clientes-v2.vercel.app/openapi.yaml), [documentação de projetos/categorias](./PROJECTS-CATEGORIES-API.md).
