# MapScrape — projetos, categorias e coleta para agentes

## Modelo

- **Projeto** é uma entidade persistida com ID estável, nome e escopo de consumidor (`consumer_project`).
- **Categoria de pesquisa** é um cadastro próprio, separado da categoria que o Google Maps mostra em cada ficha.
- Cada coleta grava `project_id`, `category_id`, `project_name`, `segment`, `location` e o escopo do consumidor.
- Os nomes são normalizados com Unicode NFKC, espaços normalizados e comparação sem distinção de maiúsculas/minúsculas em pt-BR.
- Criar pelo nome é idempotente dentro do escopo autenticado. Consumidores diferentes não compartilham projetos/categorias por coincidência de nome.
- A migração adiciona tabelas/colunas sem apagar coletas ou fichas existentes. Coletas legadas podem continuar sem `project_id`/`category_id`.

## Autenticação

Enviar a chave de consumidor no cabeçalho:

```http
Authorization: Bearer <MAPSCRAPE_API_KEY>
```

As rotas de provisionamento usam `x-mapscrape-provisioning-token`. Não colocar chaves em query strings ou em código versionado.

## Fluxo recomendado para agentes

### 1. Listar projetos

```http
GET /api/v1/projects
Authorization: Bearer <MAPSCRAPE_API_KEY>
```

Resposta: `{ "data": [{ "id": "prj_...", "name": "...", "consumer_project": "...", "created_at": "...", "updated_at": "..." }] }`.

### 2. Reutilizar ou criar projeto

```http
POST /api/v1/projects
Authorization: Bearer <MAPSCRAPE_API_KEY>
Content-Type: application/json

{ "name": "Prospecção de clínicas em São Paulo" }
```

Resposta: `{ "data": { "id": "prj_...", "name": "..." } }`. O mesmo nome normalizado no mesmo escopo resolve para o mesmo projeto.

### 3. Listar categorias de pesquisa

```http
GET /api/v1/categories
Authorization: Bearer <MAPSCRAPE_API_KEY>
```

### 4. Reutilizar ou criar categoria

```http
POST /api/v1/categories
Authorization: Bearer <MAPSCRAPE_API_KEY>
Content-Type: application/json

{ "name": "Clínica odontológica" }
```

### 5. Iniciar coleta

```http
POST /api/v1/jobs
Authorization: Bearer <MAPSCRAPE_API_KEY>
Content-Type: application/json

{
  "projectName": "Prospecção de clínicas em São Paulo",
  "categoryName": "Clínica odontológica",
  "segment": "clínicas odontológicas",
  "location": "São Paulo, SP",
  "limit": 20
}
```

O servidor resolve/cria projeto e categoria dentro do escopo autenticado antes de persistir a coleta. A resposta HTTP 202 contém `data.jobId`, `data.statusUrl` e `data.resultsUrl`. Um 202 significa que a tarefa foi aceita, não que a raspagem terminou.

### 6. Acompanhar e ler resultados

- `GET /api/v1/jobs/{jobId}` — consultar status; a coleta precisa pertencer ao consumidor autenticado.
- `GET /api/v1/jobs/{jobId}/results?limit=50&offset=0` — resultados paginados.
- Status terminal esperado: `completed`, `partial`, `failed` ou `stopped`.

## Erros

- `401 unauthorized`: chave ausente, inválida ou revogada.
- `422 project_name_required` / `category_name_required`: nome obrigatório.
- `422 invalid_request`: segmento/localização obrigatórios.
- `422 invalid_limit`: limite fora do intervalo inteiro de 1 a 100.
- `404 job_not_found`: coleta inexistente ou fora do escopo do consumidor.
- `500 job_start_failed`: falha ao persistir/iniciar tarefa; consultar logs com o ID quando disponível.

## Limites conhecidos

O início da tarefa usa `waitUntil` no Vercel e o estado persistido é a fonte de verdade para polling. A raspagem real ainda precisa ser verificada com uma execução de produção autenticada; resposta 202 ou health check não comprova que fichas foram coletadas.
