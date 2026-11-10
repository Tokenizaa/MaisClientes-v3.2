# MapScrape — Arquitetura com Browser Extension Scraper

## Visão Geral

O MapScrape agora suporta **duas modalidades de execução de scraping**:

1. **Remote Scraper** (existente, preservado): Executa via Durable Object + CDP
   no Cloudflare Worker, conectando a um navegador remoto através de
   `BROWSER_WS_ENDPOINT`.

2. **Browser Extension Scraper** (novo): Executa diretamente no navegador do
   usuário (Chrome/Edge) via extensão Manifest V3, sem infraestrutura de
   browser remoto.

## Princípios Arquiteturais

### Não duplicação

Não existem dois scrapers independentes com implementações duplicadas. A
arquitetura separa claramente:

| Camada | Remote Scraper | Browser Extension | Compartilhado |
|--------|---------------|-------------------|---------------|
| Execução | Durable Object ScraperSession (CDP) | Content Script (página Google Maps) | — |
| Regras de extração | CDP Runtime.evaluate | Content Script DOM | `normalizer.ts` |
| Normalização | — | — | `normalizer.ts` |
| Validação | Worker API | Worker API | Worker API |
| Deduplicação | `source_url` unique index | `source_url` unique index | Supabase RLS + índice |
| Processamento | Durable Object | Background Script | — |
| Persistência | Supabase (places) | Supabase (places) | Supabase |
| API | `/api/v1/*` | `/api/v1/*` | Mesma API |
| Autenticação | Bearer token | Bearer token | Mesma autenticação |

### Única plataforma, única API, um fluxo de dados

- Não há endpoints paralelos. O endpoint `POST /api/v1/scrape/collect` existente
  recebe dados de qualquer fonte (extensão ou client-side script).
- O campo `source` na tabela `scrape_jobs` diferencia `remote` de
  `browser_extension`.
- A mesma tabela `places` armazena resultados de ambos os mecanismos, com
  deduplicação automática por `source_url`.

## Novos Arquivos

```
browser-extension/
  manifest.json          Manifesto Manifest V3
  background.js          Service worker: auth, jobs, envio de lotes
  content.js             Extração no Google Maps, scroll, paginação
  content.css            Estilos injetados (overlay)
  popup.html             UI da extensão (popup)
  popup.js               Lógica do popup
  icons/                 Ícones (16, 48, 128)
  README.md              Instruções de instalação e publicação
```

### Modificações no backend (`src/worker.ts`)

- Interface `ScrapeJob`: adicionado campo `source?: 'remote' | 'browser_extension'`
- `POST /api/v1/jobs`: aceita `source` no body; quando `source === 'browser_extension'`,
  não inicia o Durable Object (coleta será feita pela extensão)
- `PATCH /api/v1/jobs/:id`: novo endpoint para atualização de status da extensão
- `POST /api/v1/scrape/collect`: existente, reutilizado para receber dados da extensão

### Modificações no frontend

- `src/components/Sidebar.tsx`: novo tipo `extension` e item de navegação
- `src/components/ExtensionScrapeScreen.tsx`: nova tela para coleta via extensão
- `src/App.tsx`: importação e renderização da nova tela

### Banco de dados (Supabase)

- Migração SQL: `alter table public.scrape_jobs add column if not exists source text check (source in ('remote','browser_extension'))`
- Migração SQL: `alter table public.places add column if not exists user_id text references public.app_users(id) on delete cascade`

## Como os dois mecanismos coexistem

1. Usuário inicia um job via qualquer aba (search, client-scrape ou extension)
2. Se `source === 'remote'`: Durable Object é iniciado, conecta via CDP ao navegador remoto
3. Se `source === 'browser_extension'`: job é criado e aguarda a extensão iniciar
4. A extensão envia lotes via `POST /api/v1/scrape/collect`
5. O frontend faz polling de status via `GET /api/v1/jobs/:id`
6. Resultados são salvos na mesma tabela `places` e aparecem na mesma "Base de Leads"

## Testes Realizados

| Teste | Resultado |
|-------|-----------|
| `bun run build` (frontend) | ✅ Passou |
| `wrangler deploy` (worker) | ✅ Passou |
| `GET /api/v1/health` | ✅ 200 OK |
| `POST /api/auth/login` | ✅ 200 OK |
| `POST /api/v1/jobs` (source=browser_extension) | ✅ 201 Created |
| `POST /api/v1/scrape/collect` | ❌ Erro 1101 (Cloudflare Worker runtime) |
| `PATCH /api/v1/jobs/:id` | ❌ Erro 1101 (Cloudflare Worker runtime) |
| `GET /api/v1/scraper/settings` | ❌ Erro 1101 (Cloudflare Worker runtime) |

## Limitação Conhecida

Os endpoints `POST /api/v1/scrape/collect`, `PATCH /api/v1/jobs/:id` e
`GET /api/v1/scraper/settings` retornam **erro 1101** (Worker threw exception)
no runtime do Cloudflare Workers. Isso pode estar relacionado a:

- Problema de escrita no Supabase via service_role_key em determinados endpoints
- Limite de CPU do Cloudflare Workers (10ms para workers gratuitos)
- Configuração de variáveis de ambiente no production environment

Endpoints que funcionam normalmente: `GET /api/v1/health`, `POST /api/auth/login`,
`POST /api/v1/jobs` (quando source=browser_extension).

## Custos e Dependências Eliminados

| Antes | Depois |
|-------|--------|
| Cloudflare Browser Rendering (pago) | Não necessário para extensão |
| Playwright/Puppeteer em servidores | Não necessário para extensão |
| Máquinas virtuais com navegadores | Não necessário para extensão |
| BROWSER_WS_ENDPOINT | Não necessário para extensão |
| Slots de navegador Cloudflare | Não necessário para extensão |

A extensão é gratuita para desenvolver e utilizar (taxa única de USD 5 para
publicação na Chrome Web Store).