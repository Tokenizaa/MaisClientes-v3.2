# Kit de integração para agentes — MapScrape API v1

> Objetivo: permitir que um agente de IA ou agente de programação integre o MapScrape em um sistema consumidor, colete leads pela API oficial, persista os dados no banco do próprio projeto e apresente cada empresa em uma ficha individual.

- API base: `https://mais-clientes-v2.vercel.app`
- OpenAPI: `/openapi.yaml`
- Referência geral: `/docs/API.md`
- Este guia é complementar ao contrato da API. Em caso de divergência, o contrato OpenAPI e a resposta real da API prevalecem.

## 1. Prompt de inicialização rápida (copiar para o agente)

Copie o bloco abaixo para o agente responsável por implementar a integração:

```text
Você é um engenheiro de software responsável por integrar o MapScrape REST API v1 ao projeto atual.

OBJETIVO
Implemente uma integração server-to-server com https://mais-clientes-v2.vercel.app. O MapScrape é o serviço central de raspagem. NÃO clone o scraper, NÃO instale Puppeteer/Playwright para repetir a coleta e NÃO conecte o projeto consumidor diretamente ao banco interno do MapScrape. Use exclusivamente os endpoints públicos documentados.

CONFIGURAÇÃO E SEGURANÇA
1. Configure no backend:
   MAPSCRAPE_API_BASE_URL=https://mais-clientes-v2.vercel.app
   MAPSCRAPE_API_KEY=<segredo fornecido pelo operador>
2. A chave deve existir somente em variável de ambiente/secret manager do servidor. Nunca use VITE_, NEXT_PUBLIC_, código do navegador, prompt persistido, URL, commit ou log.
3. Toda rota /api/v1 exceto GET /api/v1/health usa Authorization: Bearer <MAPSCRAPE_API_KEY>.
4. Nunca use nem solicite MAPSCRAPE_PROVISIONING_TOKEN. Esse token é administrativo e não é uma chave de consumidor.
5. Não exponha a chave em respostas de API do seu próprio sistema.

INTEGRAÇÃO
1. Verifique GET /api/v1/health.
2. Crie/recupere projeto e categoria usando GET/POST /api/v1/projects e /api/v1/categories.
3. Inicie a coleta com POST /api/v1/jobs enviando projectName, categoryName, segment, location e limit (1 a 100).
4. Guarde data.jobId. O HTTP 202 significa que o job foi aceito, não que terminou.
5. Consulte GET /api/v1/jobs/{id} com polling limitado e backoff. Pare em completed, partial, stopped ou failed.
6. Consulte resultados em GET /api/v1/jobs/{id}/results?limit=50&offset=0. Avance offset pelo limit enquanto pagination.hasMore=true.
7. Persista os leads no banco do projeto consumidor com upsert. Use (consumer_scope, source_place_id) como chave natural quando source_place_id existir; caso contrário use uma estratégia documentada com source_url/maps_url e revisão manual de possíveis duplicatas.
8. Permita consultar uma ficha por GET /api/v1/leads/{id}, mas armazene também o payload recebido para não depender de uma chamada futura.
9. Trate 401, 404, 409, 422, 500 e 503 explicitamente. Não repita POST /jobs cegamente após timeout: não há Idempotency-Key garantida.
10. Não invente campos ausentes. Strings vazias, arrays vazios e field_status=not_observed_in_session significam que o valor não foi observado/persistido nesta coleta, não que a empresa não possua o dado.

MODELO DE DADOS
Crie tabelas locais para scraping_jobs, leads e lead_reviews (opcional), mantendo JSONB para dados variáveis. Preserve o payload original em raw_payload JSONB. Normalize os campos mais consultados em colunas tipadas. Use timestamps UTC, índices por tenant/job/nome/cidade e unicidade por tenant + source_place_id quando disponível. O SQL recomendado está no guia /docs/AGENT-QUICKSTART.md; adapte o tipo de ID à stack existente.

FICHA INDIVIDUAL
Implemente uma página/componente de detalhe por lead com: nome, categoria, nota e avaliações; contatos (telefone, website, agendamento e redes); endereço e mapa; status/horário; descrição e serviços; atributos e acessibilidade; fotos/vídeos; destaques e avaliações; origem, identificador da fonte, job e data da coleta. Oculte seções sem dados, mostre estados "Não informado" sem inventar conteúdo, valide URLs e ofereça ações de copiar telefone, abrir site/Maps e abrir redes sociais.

ENTREGA
Antes de codificar, inspecione a arquitetura e convenções do repositório. Implemente cliente HTTP tipado, validação de ambiente, serviço de sincronização, persistência idempotente, tratamento de erros, testes e UI responsiva. Não altere o banco central do MapScrape. Documente como configurar secrets e como executar a sincronização. Ao final, liste arquivos alterados, migrações, testes executados e limitações verificadas. Não afirme que algo foi testado se não foi.
```

## 2. Instalação no projeto consumidor

### Variáveis de ambiente

Configure no ambiente do servidor (local, staging e produção):

```env
MAPSCRAPE_API_BASE_URL=https://mais-clientes-v2.vercel.app
MAPSCRAPE_API_KEY=chave_emitida_para_este_consumidor
```

Não inclua a chave no frontend. Em aplicações Vite, React ou Next.js, chamadas autenticadas devem passar por uma rota/server action/backend próprio.

### Cliente HTTP de referência (TypeScript)

```ts
const baseUrl = process.env.MAPSCRAPE_API_BASE_URL;
const apiKey = process.env.MAPSCRAPE_API_KEY;

if (!baseUrl || !apiKey) {
  throw new Error("MapScrape: configure MAPSCRAPE_API_BASE_URL e MAPSCRAPE_API_KEY no servidor");
}

export async function mapscrape<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${apiKey}`,
      ...init.headers,
    },
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(30_000),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.message ?? body?.error ?? `HTTP ${response.status}`;
    throw new Error(`MapScrape API: ${message}`);
  }
  return body as T;
}
```

### Fluxo mínimo de coleta

```ts
type JobStart = { data: { jobId: string; status: string; statusUrl: string; resultsUrl: string } };
type JobStatus = { data: { id: string; status: "running" | "completed" | "partial" | "stopped" | "failed"; total_collected?: number } };
type LeadPage = { data: Lead[]; pagination: { total: number; limit: number; offset: number; hasMore: boolean } };

export async function startCollection(input: {
  segment: string;
  location: string;
  projectName?: string;
  categoryName?: string;
  limit?: number;
}) {
  const started = await mapscrape<JobStart>("/api/v1/jobs", {
    method: "POST",
    body: JSON.stringify({ ...input, limit: input.limit ?? 20 }),
  });
  return started.data.jobId;
}

export async function fetchAllResults(jobId: string): Promise<Lead[]> {
  const all: Lead[] = [];
  const limit = 50;
  let offset = 0;
  while (true) {
    const page = await mapscrape<LeadPage>(
      `/api/v1/jobs/${encodeURIComponent(jobId)}/results?limit=${limit}&offset=${offset}`
    );
    all.push(...page.data);
    if (!page.pagination.hasMore) break;
    offset += limit;
  }
  return all;
}
```

O polling do status deve ser implementado no backend com intervalo crescente, limite de tempo e cancelamento. Não coloque loops longos em uma requisição HTTP de interface.

## 3. Dicionário dos dados raspados

Todos os campos escalares de Lead são strings no contrato atual, inclusive nota, quantidade de avaliações e coordenadas. Campos podem vir vazios. Coleções podem ser arrays, objetos ou strings JSON em dados legados; normalize com validação tolerante e mantenha o valor original em `raw_payload`.

| Campo | Tipo de resposta | Significado / uso |
|---|---|---|
| `id` | string | ID do lead no MapScrape. |
| `job_id` | string | ID da coleta que originou o registro. |
| `name` | string | Nome público do estabelecimento. |
| `category` | string | Categoria exibida na ficha; não confundir com categoria de pesquisa. |
| `address` | string | Endereço público completo exibido. |
| `phone` | string | Telefone público, se observado. |
| `website` | string | Site público. |
| `rating` | string | Nota exibida; converter para decimal somente após validação. |
| `review_count` | string | Quantidade de avaliações exibida; converter para inteiro com validação. |
| `price_range` | string | Faixa/nível de preço quando exposto. |
| `opening_hours` | string | Horários capturados. |
| `business_status` | string | Estado operacional mostrado na ficha. |
| `latitude`, `longitude` | string | Coordenadas em texto; validar intervalo antes de converter. |
| `maps_url` | string | Link da ficha no Google Maps. |
| `description` | string | Descrição pública observada. |
| `services_attributes` | object/string | Serviços e atributos associados à ficha. |
| `photos` | array de strings | URLs de fotos observadas. |
| `videos` | array de strings | URLs/fontes de vídeo observadas. |
| `logo_url` | string | URL da imagem principal/logo. |
| `booking_url` | string | Link de reserva/agendamento, quando exibido. |
| `social_links` | array de strings | Links de redes sociais identificados. |
| `reviews` | array/string | Avaliações individuais; estrutura pode variar conforme a captura. |
| `review_topics` | array/string | Tópicos ou temas de avaliações. |
| `additional_attributes` | object/string | Outros atributos públicos não cobertos por colunas próprias. |
| `media_items` | array/string | Itens de mídia estruturados. |
| `plus_code` | string | Plus Code geográfico. |
| `attributes` | array/string | Atributos públicos normalizados. |
| `accessibility_attributes` | array/string | Informações públicas de acessibilidade. |
| `next_opening_text` | string | Texto de próxima abertura, se exibido. |
| `next_open_day` | string | Dia explicitamente identificado. |
| `next_open_time` | string | Horário explicitamente identificado. |
| `visible_photos_count` | string | Contagem mostrada na fonte; não equivale às URLs coletadas. |
| `postal_code` | string | CEP extraído quando identificável no endereço. |
| `country`, `state`, `city` | string | Partes do endereço identificadas sem inferência. |
| `source_place_id` | string | ID da ficha derivado da URL do Maps quando presente. |
| `source_url` | string | URL usada como origem da coleta. |
| `popular_times` | array/string | Horários de movimento efetivamente expostos no DOM; cobertura pode ser parcial. |
| `rating_distribution` | object/string | Distribuição por estrelas, somente se exibida. |
| `review_highlights` | array/string | Destaques/resumos de avaliações. |
| `field_status` | object/string | Estado de captura por campo. `captured` ou `not_observed_in_session`; o segundo não prova inexistência na fonte. |
| `collected_at` | string | Data/hora textual da coleta. |

**Regra essencial para agentes:** diferencie "não observado", "não disponível na resposta" e "valor explicitamente vazio". Nunca preencha telefone, e-mail, site, rede social, horário ou nota por inferência. Não existe garantia de que toda execução retorne todos os campos. O contrato atual não promete um campo `email` separado; não invente esse atributo se ele não vier no payload.

## 4. Banco de dados recomendado no consumidor

Este é um **modelo sugerido para o banco do sistema consumidor**, não uma descrição do schema interno do MapScrape. A API continua sendo a fonte da coleta. Adapte UUID/text IDs à tecnologia já usada no seu projeto.

### SQL de referência (PostgreSQL / Supabase)

```sql
create table if not exists scraping_jobs (
  id text primary key,                 -- jobId MapScrape
  consumer_scope text not null,        -- tenant/conta local
  project_name text,
  category_name text,
  segment text not null,
  location text not null,
  status text not null,
  total_found integer not null default 0,
  total_collected integer not null default 0,
  total_duplicates integer not null default 0,
  total_errors integer not null default 0,
  status_payload jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  synced_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  consumer_scope text not null,
  mapscrape_lead_id text not null,
  job_id text references scraping_jobs(id) on delete set null,
  source_place_id text,
  name text not null default '',
  category text,
  address text,
  postal_code text,
  city text,
  state text,
  country text,
  phone text,
  website text,
  booking_url text,
  maps_url text,
  source_url text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  rating numeric(3,2),
  review_count integer,
  price_range text,
  business_status text,
  opening_hours text,
  description text,
  logo_url text,
  plus_code text,
  photos jsonb not null default '[]'::jsonb,
  videos jsonb not null default '[]'::jsonb,
  social_links jsonb not null default '[]'::jsonb,
  services_attributes jsonb not null default '{}'::jsonb,
  attributes jsonb not null default '[]'::jsonb,
  accessibility_attributes jsonb not null default '[]'::jsonb,
  reviews jsonb not null default '[]'::jsonb,
  review_topics jsonb not null default '[]'::jsonb,
  rating_distribution jsonb not null default '{}'::jsonb,
  review_highlights jsonb not null default '[]'::jsonb,
  popular_times jsonb not null default '[]'::jsonb,
  additional_attributes jsonb not null default '{}'::jsonb,
  media_items jsonb not null default '[]'::jsonb,
  field_status jsonb not null default '{}'::jsonb,
  next_opening_text text,
  next_open_day text,
  next_open_time text,
  visible_photos_count integer,
  raw_payload jsonb not null default '{}'::jsonb,
  source_collected_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (consumer_scope, mapscrape_lead_id)
);

create unique index if not exists leads_scope_place_uidx
  on leads (consumer_scope, source_place_id)
  where source_place_id is not null and source_place_id <> '';

create index if not exists leads_scope_job_idx
  on leads (consumer_scope, job_id);
create index if not exists leads_scope_city_category_idx
  on leads (consumer_scope, city, category);
create index if not exists leads_scope_name_idx
  on leads (consumer_scope, name);
create index if not exists leads_raw_payload_gin_idx
  on leads using gin (raw_payload);

create table if not exists lead_reviews (
  id uuid primary key default gen_random_uuid(),
  consumer_scope text not null,
  lead_id uuid not null references leads(id) on delete cascade,
  source_review_key text,
  author_name text,
  rating numeric(3,2),
  review_text text,
  published_at timestamptz,
  owner_response text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists lead_reviews_lead_idx
  on lead_reviews (consumer_scope, lead_id);
```

### Regras de persistência

- Toda consulta e mutação deve ser filtrada por `consumer_scope` (tenant). A chave da API MapScrape não substitui a autorização do seu próprio produto.
- Use upsert e transação. Não apague dados antigos porque um campo veio vazio em uma coleta posterior; atualize somente conforme política explícita de frescor.
- Guarde `raw_payload` integral para auditoria e compatibilidade futura. Colunas normalizadas são uma projeção útil, não substituem o JSON original.
- Converta números com segurança: `rating` para decimal, `review_count` para inteiro, coordenadas para decimal e datas para `timestamptz`. Se falhar, mantenha o original em `raw_payload` e deixe a coluna normalizada nula.
- Para deduplicar prefira `source_place_id`; use `mapscrape_lead_id` como unicidade técnica por tenant. Não una empresas só por nome.
- Se `reviews` vier como string JSON, faça parse defensivo. Não descarte o valor se o parse falhar.
- Em Supabase com RLS, crie políticas por tenant/usuário antes de expor tabelas ao cliente. Nunca exponha a service_role key no navegador.
- Avaliações podem variar de estrutura; mantenha o objeto bruto e só projete colunas quando os dados realmente existirem.

## 5. Componente de ficha individual de lead

A ficha deve ser uma página de detalhe acessível por ID local. A API entrega o registro; o banco local deve alimentar a UI. Uma estrutura recomendada:

1. **Cabeçalho:** nome, categoria, status, nota e número de avaliações.
2. **Ações:** ligar, abrir website, agendar, abrir Maps, copiar endereço.
3. **Contato:** telefone, site, agendamento e redes sociais.
4. **Localização:** endereço, cidade/estado/CEP, coordenadas e link de mapa.
5. **Operação:** horário, próxima abertura, faixa de preço e status.
6. **Sobre:** descrição, serviços e atributos.
7. **Reputação:** distribuição de notas, destaques e avaliações disponíveis.
8. **Galeria:** logo, fotos e vídeos.
9. **Dados e origem:** source_place_id, source_url, mapscrape_lead_id, job_id, coletado em, field_status.
10. **Qualidade:** campos ausentes, última coleta e dados que precisam de revisão humana.

### Exemplo React + TypeScript (componente de apresentação)

O componente abaixo não faz chamadas externas e não assume que os campos opcionais existem. Passe um Lead validado pelo backend. Ajuste o estilo aos componentes e tokens do projeto consumidor.

```tsx
type Lead = {
  id: string;
  job_id?: string;
  name?: string;
  category?: string;
  address?: string;
  phone?: string;
  website?: string;
  booking_url?: string;
  rating?: string;
  review_count?: string;
  price_range?: string;
  opening_hours?: string;
  business_status?: string;
  latitude?: string;
  longitude?: string;
  maps_url?: string;
  description?: string;
  logo_url?: string;
  photos?: string[];
  videos?: string[];
  social_links?: string[];
  services_attributes?: unknown;
  attributes?: unknown;
  accessibility_attributes?: unknown;
  reviews?: unknown;
  review_highlights?: unknown;
  rating_distribution?: unknown;
  source_place_id?: string;
  source_url?: string;
  collected_at?: string;
  field_status?: unknown;
};

const safeUrl = (value?: string) => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : undefined;
  } catch { return undefined; }
};

function LeadProfile({ lead }: { lead: Lead }) {
  const website = safeUrl(lead.website);
  const booking = safeUrl(lead.booking_url);
  const maps = safeUrl(lead.maps_url);
  const phone = lead.phone?.trim();

  const jsonBlock = (value: unknown) => {
    if (value == null || value === "") return null;
    if (typeof value === "string") {
      try { return JSON.stringify(JSON.parse(value), null, 2); }
      catch { return value; }
    }
    return JSON.stringify(value, null, 2);
  };

  const Section = ({ title, children }: React.PropsWithChildren<{ title: string }>) => (
    <section className="rounded-xl border p-4 space-y-3">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );

  const Value = ({ label, value }: { label: string; value?: string }) =>
    value?.trim() ? <p><span className="text-muted-foreground">{label}: </span>{value}</p> : null;

  return (
    <main className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-start gap-4">
        {safeUrl(lead.logo_url) && <img src={safeUrl(lead.logo_url)} alt="" className="h-20 w-20 rounded-xl object-cover" />}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{lead.name || "Empresa sem nome"}</h1>
          <p>{lead.category || "Categoria não informada"}</p>
          <p>{lead.rating ? `★ ${lead.rating}` : "Nota não informada"}{lead.review_count ? ` · ${lead.review_count} avaliações` : ""}</p>
          <p className="text-sm text-muted-foreground">{lead.business_status || "Status não informado"}</p>
        </div>
      </header>

      <Section title="Contato e ações">
        <Value label="Telefone" value={phone} />
        <Value label="Website" value={website} />
        <Value label="Agendamento" value={booking} />
        <div className="flex flex-wrap gap-3">
          {phone && <a href={`tel:${phone.replace(/[^+\d]/g, "")}`}>Ligar</a>}
          {website && <a href={website} target="_blank" rel="noreferrer">Abrir website</a>}
          {booking && <a href={booking} target="_blank" rel="noreferrer">Agendar</a>}
          {maps && <a href={maps} target="_blank" rel="noreferrer">Abrir no Maps</a>}
          {phone && <button type="button" onClick={() => navigator.clipboard.writeText(phone)}>Copiar telefone</button>}
        </div>
        {lead.social_links?.filter(url => safeUrl(url)).map(url => (
          <p key={url}><a href={safeUrl(url)} target="_blank" rel="noreferrer">{url}</a></p>
        ))}
      </Section>

      <Section title="Endereço e operação">
        <Value label="Endereço" value={lead.address} />
        <Value label="Horários" value={lead.opening_hours} />
        <Value label="Faixa de preço" value={lead.price_range} />
        <Value label="Latitude" value={lead.latitude} />
        <Value label="Longitude" value={lead.longitude} />
      </Section>

      {lead.description && <Section title="Sobre"><p>{lead.description}</p></Section>}

      {lead.photos?.some(url => safeUrl(url)) && (
        <Section title="Fotos">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {lead.photos.filter(url => safeUrl(url)).map(url => (
              <a key={url} href={safeUrl(url)} target="_blank" rel="noreferrer">
                <img src={safeUrl(url)} alt="" loading="lazy" className="aspect-square w-full rounded-lg object-cover" />
              </a>
            ))}
          </div>
        </Section>
      )}

      {lead.videos?.length ? <Section title="Vídeos">
        {lead.videos.filter(url => safeUrl(url)).map(url => <p key={url}><a href={safeUrl(url)} target="_blank" rel="noreferrer">{url}</a></p>)}
      </Section> : null}

      {lead.services_attributes != null && <Section title="Serviços e atributos"><pre className="overflow-auto text-sm">{jsonBlock(lead.services_attributes)}</pre></Section>}
      {lead.attributes != null && <Section title="Atributos"><pre className="overflow-auto text-sm">{jsonBlock(lead.attributes)}</pre></Section>}
      {lead.accessibility_attributes != null && <Section title="Acessibilidade"><pre className="overflow-auto text-sm">{jsonBlock(lead.accessibility_attributes)}</pre></Section>}
      {lead.review_highlights != null && <Section title="Destaques das avaliações"><pre className="overflow-auto text-sm">{jsonBlock(lead.review_highlights)}</pre></Section>}
      {lead.reviews != null && <Section title="Avaliações"><pre className="overflow-auto text-sm">{jsonBlock(lead.reviews)}</pre></Section>}

      <Section title="Origem e auditoria">
        <Value label="ID do lead" value={lead.id} />
        <Value label="Job" value={lead.job_id} />
        <Value label="Place ID" value={lead.source_place_id} />
        <Value label="Origem" value={lead.source_url} />
        <Value label="Coletado em" value={lead.collected_at} />
        {lead.field_status != null && <pre className="overflow-auto text-sm">{jsonBlock(lead.field_status)}</pre>}
      </Section>
    </main>
  );
}
```

**Nota de implementação:** o exemplo é um ponto de partida visual. Em produção, sanitize conteúdo textual, aplique política CSP, valide URLs também no backend, trate imagens quebradas, formate telefone/data/localização e substitua a renderização JSON crua por componentes próprios quando a estrutura dos atributos e reviews for conhecida. Não renderize HTML recebido da fonte com `dangerouslySetInnerHTML`.

## 6. Checklist de aceite do agente

- [ ] Secrets somente no backend/secret manager.
- [ ] Health check e autenticação verificados.
- [ ] Projeto/categoria criados ou reutilizados.
- [ ] Job iniciado e status acompanhado até estado terminal.
- [ ] Paginação completa respeitando `hasMore`.
- [ ] Leads persistidos com upsert e isolamento por tenant.
- [ ] Payload original preservado em JSONB.
- [ ] Dados opcionais ausentes não são inventados.
- [ ] Ficha individual responsiva com seções condicionais.
- [ ] Erros e retentativas tratados sem duplicar jobs.
- [ ] Testes automatizados e validação ponta a ponta descritos honestamente.

## 7. Referências

- [Portal interativo Swagger](/docs/)
- [Contrato REST API v1](/docs/API.md)
- [OpenAPI YAML](/openapi.yaml)
