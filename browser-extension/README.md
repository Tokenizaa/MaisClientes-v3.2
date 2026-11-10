# MapScrape Browser Extension

Extensão Chrome/Edge (Manifest V3) para coleta automatizada de estabelecimentos
do Google Maps diretamente no navegador do usuário, sem infraestrutura de
browser remoto.

## Arquitetura

A extensão se comunica com a API existente do MapScrape
(`https://maisclientes-api.olfnetto.workers.dev`). Os dois mecanismos de
scraping (remoto via Durable Object/CDP e local via extensão) compartilham a
mesma API, as mesmas tabelas do Supabase e o mesmo fluxo de processamento.

## Arquivos

| Arquivo | Responsabilidade |
|---------|------------------|
| `manifest.json` | Manifesto Manifest V3 (permissões, service worker, content scripts) |
| `background.js` | Service worker: gerencia auth, jobs, comunicação e envio de lotes para a API |
| `content.js` | Executa na página do Google Maps: extração, scroll/paginação, envio de lotes |
| `content.css` | Estilos injetados na página (overlay de progresso) |
| `popup.html` | UI da extensão (popup) |
| `popup.js` | Lógica do popup: criar job, iniciar/parar coleta, abrir Google Maps |
| `icons/icon*.png` | Ícones da extensão |

## Fluxo de uso

1. Usuário instala a extensão no Chrome/Edge
2. Usuário entra no MapScrape (plataforma web)
3. Usuário acessa a aba **"Extensão do Navegador"** na sidebar
4. Usuário preenche segmento, localização e limite
5. Usuário clica em **"Criar Job (Extensão)"** → job é criado na plataforma
6. Usuário clica em **"Iniciar Coleta na Extensão"** → background script é notificado
7. Usuário clica em **"Abrir Google Maps"** → nova aba com a busca pré-preenchida
8. O content script executa automaticamente na página do Google Maps:
   - Extrai nomes, telefones, avaliações, endereços e URLs
   - Faz scroll para carregar mais resultados
   - Envia lotes progressivos para `/api/v1/scrape/collect`
9. O frontend faz polling do status do job e exibe o progresso
10. Quando concluído, os dados aparecem na **"Base de Leads"**

## Instalação para desenvolvimento

```bash
# 1. Navegue até o diretório da extensão
cd browser-extension

# 2. Abra o Chrome/Edge e acesse chrome://extensions/
# 3. Ative o "Modo de desenvolvedor" (toggle no canto superior direito)
# 4. Clique em "Carregar sem compactação" e selecione esta pasta
# 5. A extensão aparecerá na barra de ferramentas
```

## Publicação na Chrome Web Store

1. Compacte o conteúdo da pasta `browser-extension/` em um arquivo ZIP
2. Acesse o [Chrome Web Store Developer Dashboard](https://chromewebstore.google.com/devconsole/)
3. Pague a taxa de desenvolvedor único (USD 5)
4. Clique em "Novo item" e faça upload do ZIP
5. Preencha os detalhes (descrição, capturas de tela, política de privacidade)
6. Envie para revisão
7. Após aprovação, a extensão estará disponível para instalação

## Permissões necessárias

| Permissão | Justificativa |
|-----------|---------------|
| `storage` | Armazenar token de autenticação e estado da extensão |
| `tabs` | Abrir o Google Maps em nova aba |
| `scripting` | Injetar content script nas páginas do Google Maps |
| `activeTab` | Acessar a aba ativa quando necessário |
| `host_permissions: https://www.google.com/maps/*` | Executar content script no Google Maps |
| `host_permissions: https://maisclientes-api.olfnetto.workers.dev/*` | Enviar dados coletados para a API |

## Segurança

- O token de autenticação é armazenado apenas no `chrome.storage.local` (não enviado para servidores externos além da API do MapScrape)
- Nenhuma credencial sensível é armazenada na extensão
- A extensão só acessa páginas do Google Maps e da API do MapScrape
- Dados coletados são validados pela API existente antes da persistência
- Deduplicação automática por `source_url` no banco de dados

## Limitações

- A extensão requer que o usuário esteja logado no MapScrape no navegador
- A coleta depende da estrutura HTML do Google Maps (pode quebrar se o Google alterar os seletores)
- O endpoint `/api/v1/scrape/collect` pode retornar erro 1101 (Worker threw exception) em algumas condições do Cloudflare Workers runtime — verifique os logs do worker para diagnóstico
- A extensão funciona apenas em navegadores baseados em Chromium (Chrome, Edge, Brave, etc.)

## Coexistência com o scraping remoto

| Aspecto | Scraping Remoto (Durable Object/CDP) | Browser Extension |
|---------|--------------------------------------|-------------------|
| Execução | Nuvem (Cloudflare Worker + DO) | Navegador do usuário |
| Infraestrutura | BROWSER_WS_ENDPOINT / Cloudflare Browser Rendering | Nenhuma (gratuito) |
| Endpoint API | POST /api/v1/jobs + DO | POST /api/v1/jobs + POST /api/v1/scrape/collect |
| Tabelas | scrape_jobs, places | scrape_jobs, places |
| Deduplicação | source_url (unique index) | source_url (unique index) |
| Autenticação | Bearer token | Bearer token (chrome.storage.local) |

Ambos os mecanismos gravam nas mesmas tabelas `scrape_jobs` e `places`, diferenciado pelo campo `source` (`remote` ou `browser_extension`).