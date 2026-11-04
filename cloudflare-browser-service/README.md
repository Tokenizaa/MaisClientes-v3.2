# Nettos Browser Service

> Status: implementation in progress; deploy only after CI validation and account secrets are configured.

Serviço independente para centralizar sessões Cloudflare Browser Run e permitir que aplicações consumidoras usem CDP/Playwright/Puppeteer sem receber o token administrativo da Cloudflare.

## Arquitetura

- Cloudflare Worker: API REST autenticada por chave de consumidor.
- Cloudflare Browser Run: cria e executa as sessões Chromium.
- Durable Object: faz o proxy WebSocket CDP entre o consumidor e a sessão Browser Run.
- O token Cloudflare permanece exclusivamente como secret do Worker.
- As aplicações consumidoras recebem somente uma chave própria do Browser Service.

O serviço não armazena páginas, cookies ou credenciais de sites. Cada sessão deve ser encerrada explicitamente; keepAliveMs também limita sua duração no Browser Run.

## Deploy

Entre nesta pasta e instale as dependências:

~~~bash
npm install
~~~

Configure os secrets na conta Cloudflare que hospeda o Worker:

~~~bash
npx wrangler secret put CLOUDFLARE_ACCOUNT_ID
npx wrangler secret put CLOUDFLARE_API_TOKEN
npx wrangler secret put BROWSER_SERVICE_API_KEYS
~~~

- CLOUDFLARE_ACCOUNT_ID: ID da conta que tem Browser Run habilitado.
- CLOUDFLARE_API_TOKEN: token com permissão Browser Rendering - Edit para as rotas de sessões/CDP.
- BROWSER_SERVICE_API_KEYS: uma ou mais chaves fortes para consumidores, separadas por vírgula. Gere uma chave diferente por aplicação e não use o token Cloudflare como chave de consumidor.

Valide e publique:

~~~bash
npm run check
npm test
npx wrangler deploy
~~~

O primeiro deploy cria o Durable Object configurado na migração v1. Não altere o nome da classe depois de produção sem uma migração compatível.

## API

Todas as rotas, exceto GET /health, exigem:

~~~http
Authorization: Bearer <BROWSER_SERVICE_API_KEY>
~~~

### Health

GET /health — verificação pública de disponibilidade, sem revelar configuração.

### Criar sessão

POST /v1/sessions

~~~json
{ "keepAliveMs": 600000 }
~~~

keepAliveMs é opcional e aceita inteiros de 10.000 a 1.200.000 ms. Resposta:

~~~json
{
  "sessionId": "1909cef7-23e8-4394-bc31-27404bf4348f",
  "connectUrl": "https://<worker>/v1/sessions/1909cef7-23e8-4394-bc31-27404bf4348f/connect",
  "keepAliveMs": 600000,
  "provider": "cloudflare-browser-run"
}
~~~

### Conectar via CDP

Faça upgrade WebSocket em connectUrl, enviando a mesma chave do consumidor no header Authorization. O Worker valida a chave e encaminha o tráfego CDP ao Browser Run sem revelar o token Cloudflare.

Playwright:

~~~ts
import { chromium } from "playwright-core";

const apiKey = process.env.BROWSER_SERVICE_API_KEY!;
const serviceUrl = process.env.BROWSER_SERVICE_URL!;
const created = await fetch(`${serviceUrl}/v1/sessions`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ keepAliveMs: 600_000 }),
});
if (!created.ok) throw new Error(`Session creation failed: ${created.status}`);

const session = await created.json() as { sessionId: string; connectUrl: string };
const browser = await chromium.connectOverCDP(session.connectUrl, {
  headers: { Authorization: `Bearer ${apiKey}` },
});
try {
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto("https://example.com");
  console.log(await page.title());
} finally {
  await browser.close();
  await fetch(`${serviceUrl}/v1/sessions/${session.sessionId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}
~~~

### Encerrar sessão

DELETE /v1/sessions/:sessionId

O serviço encaminha o encerramento para Browser Run. Fechar o cliente Playwright encerra sua conexão CDP; a chamada DELETE libera explicitamente a sessão remota.

## Segurança e limites

- Nunca coloque CLOUDFLARE_API_TOKEN em VITE_*, frontend, repositórios ou variáveis de consumidor.
- Use HTTPS/WSS e chaves independentes, longas e aleatórias por aplicação.
- A lista BROWSER_SERVICE_API_KEYS é uma configuração inicial simples; antes de oferecer onboarding multi-tenant, evolua para chaves individuais com hash persistido, revogação, quotas e auditoria.
- Nesta primeira versão, todos os consumidores configurados compartilham o mesmo conjunto de permissões e podem operar qualquer sessão conhecida. Não é um plano de isolamento por tenant.
- Configure alertas e limites de uso/custos na conta Cloudflare. O serviço não implementa rate limiting distribuído nesta versão.
- Não há fallback automático para Browserless. O serviço ainda não está integrado ao scraper MaisClientes; essa migração deve ocorrer em etapa separada, com testes de regressão.
