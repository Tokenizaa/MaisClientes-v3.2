# Prompt de integração do MapScrape para LLMs

Copie o prompt a seguir para o agente de programação que está trabalhando no repositório consumidor. Este documento é para integrar um cliente HTTP à API central MapScrape, não para instalar o serviço. O consumidor NÃO deve clonar este repositório, copiar seu código, instalar Puppeteer, executar outro scraper nem conectar diretamente ao banco central. A URL-base e a credencial devem ser fornecidas pelo operador de forma segura; a LLM não deve inventá-las.

---

## PROMPT — Integrar este projeto à API MapScrape

Você está trabalhando no repositório do projeto consumidor. Integre-o à API central MapScrape usando o contrato documentado em `docs/API.md` e `docs/openapi.yaml` do repositório MapScrape.

### Regras

1. Inspecione a arquitetura, linguagem, runtime, autenticação, padrões de serviço, telas e testes existentes antes de editar.
2. Faça as alterações apenas no projeto consumidor. Não clone nem copie o repositório MapScrape, não instale suas dependências e não implemente um scraper paralelo. O consumidor deve chamar a API central exclusivamente por HTTP/HTTPS.
3. Não invente URL, endpoint, nome de campo, segredo, capacidade ou dado de lead.
4. Leia o contrato OpenAPI e confirme a versão disponível no ambiente de destino.
5. Configure `MAPSCRAPE_API_BASE_URL` e `MAPSCRAPE_API_KEY` em secrets/variáveis de ambiente server-side. Nunca envie a chave ao browser, bundle frontend, logs ou URLs.
6. Crie um cliente HTTP reutilizável, tipado, com timeout, autenticação, erros normalizados e retentativas limitadas apenas para falhas transitórias. Não repita automaticamente requisições POST sem uma estratégia de idempotência.
7. Implemente paginação usando `pagination.hasMore`, `offset` e `limit`. Não carregue toda a base de uma vez.
8. Para pesquisar, use `GET /api/v1/leads`; para detalhes, `GET /api/v1/leads/{id}`.
9. Para solicitar uma coleta, use `POST /api/v1/jobs`, guarde `data.jobId`, acompanhe `GET /api/v1/jobs/{id}` e só depois consulte `GET /api/v1/jobs/{id}/results`.
10. Não bloqueie uma requisição web esperando a raspagem concluir. Mostre estados pendente/em execução/concluída/parcial/falha de acordo com a resposta real.
11. Preserve os campos que o consumidor não utiliza imediatamente. Não reduza o objeto a nome e telefone, e não converta ausências em valores inventados.
12. Trate reviews, tópicos, atributos e mídias como estruturas, conforme o contrato. Renderize conteúdo por tipo, não como uma lista de URLs em texto.
13. Adapte nomes e componentes aos padrões já existentes. Não crie menus, páginas ou dashboards duplicados.
14. Escreva testes para cliente, paginação, erros, autenticação e UI. Use fixtures nos testes automatizados; não crie registros fictícios na base de produção.
15. Execute testes, lint, verificação de tipos e build disponíveis. Corrija as falhas causadas pela integração e reporte qualquer dependência externa não validada.

### Provisionamento automatizado

Não peça ao usuário para copiar uma chave MapScrape para o chat ou para o código. O projeto consumidor não deve clonar MapScrape para executar o provisionador. A emissão da credencial é uma operação do serviço central/infraestrutura autorizada. O consumidor recebe somente a URL-base confirmada e a chave individual gravada diretamente como secret server-side pelo operador ou pelo pipeline autorizado.

Somente o serviço central/infraestrutura autorizada precisa do token bootstrap e das permissões para emitir credenciais. No projeto consumidor, configure apenas:
- `MAPSCRAPE_API_BASE_URL`: URL-base confirmada da API implantada.
- `MAPSCRAPE_API_KEY`: chave individual emitida para esse consumidor, gravada como secret server-side.

Nunca adicione `MAPSCRAPE_PROVISIONING_TOKEN` ao consumidor. Se a chave individual ainda não existir, solicite ao operador autorizado que a emita e grave diretamente no secret manager do provedor. Não solicite que a chave seja colada no chat, em arquivo ou no repositório. Não declare a integração validada sem um teste real autenticado.

### Cliente TypeScript de referência

Adapte o exemplo ao runtime real. Este código deve executar no servidor, não no browser:

```ts
export type ApiPagination = {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type MapScrapeLead = {
  id: string;
  job_id: string;
  name: string;
  category: string;
  address: string;
  phone: string;
  website: string;
  rating: string;
  review_count: string;
  price_range: string;
  opening_hours: string;
  business_status: string;
  latitude: string;
  longitude: string;
  maps_url: string;
  description: string;
  services_attributes: unknown;
  photos: string[];
  videos: string[];
  logo_url?: string;
  social_links: string[];
  reviews: unknown[];
  review_topics: unknown[];
  additional_attributes: unknown;
  media_items: unknown[];
  plus_code?: string;
  collected_at: string;
};

export class MapScrapeClient {
  constructor(
    private readonly baseUrl = process.env.MAPSCRAPE_API_BASE_URL,
    private readonly apiKey = process.env.MAPSCRAPE_API_KEY,
  ) {
    if (!baseUrl || !apiKey) {
      throw new Error("Configure MAPSCRAPE_API_BASE_URL e MAPSCRAPE_API_KEY no servidor.");
    }
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(new URL(path, this.baseUrl), {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const error = new Error(`MapScrape HTTP ${response.status}`);
        Object.assign(error, { status: response.status, body });
        throw error;
      }
      return body as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  async listLeads(options: { query?: string; jobId?: string; limit?: number; offset?: number } = {}) {
    const params = new URLSearchParams();
    if (options.query) params.set("query", options.query);
    if (options.jobId) params.set("jobId", options.jobId);
    params.set("limit", String(options.limit ?? 50));
    params.set("offset", String(options.offset ?? 0));
    return this.request<{ data: MapScrapeLead[]; pagination: ApiPagination }>(
      `/api/v1/leads?${params.toString()}`,
    );
  }

  async getLead(id: string) {
    return this.request<{ data: MapScrapeLead }>(`/api/v1/leads/${encodeURIComponent(id)}`);
  }

  async startJob(input: { segment: string; location: string; limit?: number }) {
    return this.request<{ data: { jobId: string; status: string; statusUrl: string; resultsUrl: string } }>(
      "/api/v1/jobs",
      { method: "POST", body: JSON.stringify(input) },
    );
  }

  async getJob(id: string) {
    return this.request<{ data: Record<string, unknown> }>(`/api/v1/jobs/${encodeURIComponent(id)}`);
  }

  async getJobResults(id: string, limit = 50, offset = 0) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    return this.request<{ data: MapScrapeLead[]; pagination: ApiPagination }>(
      `/api/v1/jobs/${encodeURIComponent(id)}/results?${params}`,
    );
  }
}
```

### Tratamento mínimo de falhas

- `401`: credencial ausente/inválida; não repetir sem corrigir a configuração.
- `404`: registro ou tarefa inexistente.
- `422`: corrigir parâmetros.
- `429`: respeitar `Retry-After` se o servidor enviar; reduzir frequência. Não assumir que o limite por consumidor já está configurado.
- `5xx` e timeout: retentativas limitadas com backoff para operações de leitura. Não repetir criação de coleta cegamente.
- `503`: serviço ou banco indisponível; verificar a resposta real e encaminhar para operação. Não presumir um código de erro específico sem confirmação do contrato implantado.

### Checklist final

- [ ] Variáveis server-side documentadas, sem segredos commitados.
- [ ] Cliente HTTP reutilizável e tipado.
- [ ] Busca, paginação e detalhe funcionando.
- [ ] Fluxo de coleta assíncrona funcionando se o projeto precisar criar coletas.
- [ ] Lista de cards e modal de detalhes implementados conforme `docs/EMBED-LEADS-UI.md`, caso ainda não existam.
- [ ] Imagens, vídeos, avaliações, tópicos e atributos renderizados com componentes adequados.
- [ ] Estados de loading, vazio, erro e paginação.
- [ ] Testes, lint, tipos e build executados.
- [ ] Teste real de API executado somente com URL e credencial válidas.
- [ ] Relatório final separa evidência real, mocks e bloqueios.

--- 
