/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ============================================================================
 * GUIA DE INTEGRAÇÃO: CLOUDFLARE BROWSER RENDERING COM BROWSER_WS_ENDPOINT
 * ============================================================================
 * 
 * O MapScrape Pro suporta extração 100% REAL do Google Maps utilizando navegadores
 * Chromium autênticos. Para escalar e evitar bloqueios em escala de produção,
 * você pode integrar diretamente com o Cloudflare Browser Rendering via WebSocket.
 * 
 * ----------------------------------------------------------------------------
 * 1. O QUE É O CLOUDFLARE BROWSER RENDERING?
 * ----------------------------------------------------------------------------
 * O Cloudflare Browser Rendering disponibiliza instâncias de Chromium dedicadas
 * gerenciadas pela Cloudflare, acessíveis via protocolo Chrome DevTools (CDP)
 * sobre conexões seguras WebSocket (WSS).
 * 
 * ----------------------------------------------------------------------------
 * 2. COMO CONFIGURAR O CLOUDFLARE WORKER PROXY:
 * ----------------------------------------------------------------------------
 * No seu painel da Cloudflare (Workers & Pages):
 * 1. Crie um Worker chamado `cloudflare-browser-proxy`
 * 2. No `wrangler.toml`, adicione o binding de navegador:
 *      compatibility_flags = ["nodejs_compat"]
 *      [browser]
 *      binding = "MYBROWSER"
 * 
 * 3. No código do Worker (`worker.ts` ou `worker.js`):
 *      import puppeteer from "@cloudflare/puppeteer";
 *      
 *      export default {
 *        async fetch(request, env) {
 *          const url = new URL(request.url);
 *          
 *          // Rota WebSocket para Puppeteer connect
 *          if (request.headers.get("Upgrade") === "websocket") {
 *            const browser = await puppeteer.launch(env.MYBROWSER);
 *            return new Response(null, {
 *              status: 101,
 *              webSocket: browser.getWebSocket(),
 *            });
 *          }
 *          
 *          return new Response("Cloudflare Browser Rendering Proxy Ativo", { status: 200 });
 *        }
 *      };
 * 
 * 4. Faça o deploy: `wrangler deploy`
 * 5. Seu endpoint de conexão será: `wss://cloudflare-browser-proxy.<seu-subdominio>.workers.dev`
 * 
 * ----------------------------------------------------------------------------
 * 3. CONFIGURAÇÃO DIRETA VIA API DA CLOUDFLARE:
 * ----------------------------------------------------------------------------
 * Se você utiliza a API direta de Browser Rendering da Cloudflare:
 * Endpoint:
 *   wss://browser.cloudflare.com/v1/{ACCOUNT_ID}?token={API_TOKEN}
 * 
 * Onde:
 *   - ACCOUNT_ID: ID da sua conta Cloudflare
 *   - API_TOKEN: Token com permissões "Browser Rendering - Edit"
 * 
 * ----------------------------------------------------------------------------
 * 4. CONFIGURAÇÃO NO MAPSCRAPE PRO:
 * ----------------------------------------------------------------------------
 * Você pode fornecer o endpoint de 3 formas:
 * 
 * A) Via Variável de Ambiente no arquivo `.env` (ou Secrets do AI Studio):
 *      BROWSER_WS_ENDPOINT="wss://cloudflare-browser-proxy.exemplo.workers.dev"
 *      # Ou direto:
 *      BROWSER_WS_ENDPOINT="wss://browser.cloudflare.com/v1/SEU_ACCOUNT_ID?token=SEU_CF_API_TOKEN"
 * 
 * B) Pela Interface Gráfica:
 *      Acesse a aba "Credenciais & Chaves API" no menu lateral do sistema,
 *      insira o WebSocket Endpoint no card "Cloudflare Browser Rendering" e clique em "Salvar".
 * 
 * C) Via API REST:
 *      POST /api/v1/scraper/settings
 *      {
 *        "browserWsEndpoint": "wss://...",
 *        "preferredEngine": "cloudflare"
 *      }
 * ============================================================================
 */

export const CLOUDFLARE_BROWSER_SETUP_GUIDE = `
# Guia de Configuração: Cloudflare Browser Rendering

## 1. Cloudflare Worker com @cloudflare/puppeteer (Recomendado)
\`\`\`typescript
import puppeteer from '@cloudflare/puppeteer';

export default {
  async fetch(request: Request, env: { MYBROWSER: any }) {
    if (request.headers.get('Upgrade') === 'websocket') {
      const browser = await puppeteer.launch(env.MYBROWSER, {
        keep_alive: 60000,
      });
      // Retorna a conexão WebSocket CDP
      return new Response(null, {
        status: 101,
        webSocket: (browser as any).getWebSocket(),
      });
    }
    return new Response('MapScrape Cloudflare Browser Rendering Gateway Online');
  }
};
\`\`\`

## 2. Definindo a variável de ambiente no MapScrape Pro
\`\`\`bash
BROWSER_WS_ENDPOINT="wss://seu-worker.workers.dev"
\`\`\`
`;

/**
 * Interface para configuração do Proxy e WebSocket da Cloudflare
 */
export interface CloudflareBrowserProxyConfig {
  /**
   * Endpoint WebSocket completo (ex: wss://browser.cloudflare.com/v1/... ou wss://worker.workers.dev)
   */
  wsEndpoint?: string;
  /**
   * Account ID da Cloudflare (quando usando a API direta)
   */
  accountId?: string;
  /**
   * Token de API da Cloudflare com permissão de Browser Rendering
   */
  apiToken?: string;
  /**
   * URL do Cloudflare Worker proxy dedicado
   */
  workerUrl?: string;
  /**
   * Headers adicionais para o handshake do WebSocket ou proxy HTTP
   */
  customHeaders?: Record<string, string>;
  /**
   * Timeout em milissegundos para handshake e conexões CDP
   */
  timeoutMs?: number;
}

/**
 * Resposta de configurações do motor do Scraper retornado pela API v1
 */
export interface ScraperSettingsResponse {
  engine: 'cloudflare_remote' | 'local_puppeteer';
  browserWsEndpoint: string;
  hasRemoteEndpoint: boolean;
  status: 'ready' | 'connecting' | 'error';
  description: string;
}

/**
 * Constrói a URL WebSocket correta para o Cloudflare Browser Rendering
 */
export function buildCloudflareBrowserWsUrl(config: CloudflareBrowserProxyConfig): string {
  // Se já foi informado um endpoint WebSocket explícito, normaliza e retorna
  if (config.wsEndpoint && config.wsEndpoint.trim()) {
    const ep = config.wsEndpoint.trim();
    if (ep.startsWith('http://')) return ep.replace('http://', 'ws://');
    if (ep.startsWith('https://')) return ep.replace('https://', 'wss://');
    return ep;
  }

  // Se foi fornecido o URL de um Cloudflare Worker
  if (config.workerUrl && config.workerUrl.trim()) {
    let url = config.workerUrl.trim();
    if (url.startsWith('https://')) {
      url = url.replace('https://', 'wss://');
    } else if (url.startsWith('http://')) {
      url = url.replace('http://', 'ws://');
    } else if (!url.startsWith('wss://') && !url.startsWith('ws://')) {
      url = `wss://${url}`;
    }
    return url;
  }

  // Se foi fornecido Account ID e API Token direto da Cloudflare
  if (config.accountId && config.apiToken) {
    const acc = encodeURIComponent(config.accountId.trim());
    const tok = encodeURIComponent(config.apiToken.trim());
    return `wss://browser.cloudflare.com/v1/${acc}?token=${tok}`;
  }

  return '';
}

/**
 * Valida o formato e integridade da URL do endpoint WebSocket do navegador
 */
export function validateBrowserWsEndpoint(endpoint: string): {
  valid: boolean;
  type: 'cloudflare_worker' | 'cloudflare_direct' | 'local_ws' | 'custom' | 'invalid';
  message: string;
} {
  if (!endpoint || !endpoint.trim()) {
    return {
      valid: false,
      type: 'invalid',
      message: 'O endpoint WebSocket não foi informado.',
    };
  }

  const clean = endpoint.trim();

  if (!clean.startsWith('wss://') && !clean.startsWith('ws://')) {
    return {
      valid: false,
      type: 'invalid',
      message: 'O endpoint precisa iniciar com o protocolo wss:// ou ws://.',
    };
  }

  try {
    const parsed = new URL(clean.replace(/^ws/, 'http'));
    
    if (parsed.hostname.includes('workers.dev')) {
      return {
        valid: true,
        type: 'cloudflare_worker',
        message: 'Endpoint válido de Cloudflare Worker com Browser Rendering.',
      };
    }

    if (parsed.hostname.includes('browser.cloudflare.com')) {
      return {
        valid: true,
        type: 'cloudflare_direct',
        message: 'Endpoint direto da API Cloudflare Browser Rendering.',
      };
    }

    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return {
        valid: true,
        type: 'local_ws',
        message: 'Endpoint local de Chromium WebSocket (Chrome CDP DevTools).',
      };
    }

    return {
      valid: true,
      type: 'custom',
      message: 'Endpoint WebSocket remoto customizado válido.',
    };
  } catch {
    return {
      valid: false,
      type: 'invalid',
      message: 'URL do endpoint WebSocket é inválida.',
    };
  }
}

/**
 * Gera headers de proxy e autenticação para requisições Cloudflare
 */
export function getCloudflareProxyHeaders(apiToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'MapScrape-Pro/2.0 (Real Scraper Engine)',
  };

  if (apiToken && apiToken.trim()) {
    headers['Authorization'] = `Bearer ${apiToken.trim()}`;
  }

  return headers;
}

/**
 * Obtém o token de autenticação atual armazenado na sessão
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return (
    window.sessionStorage.getItem('mapscrape_api_key') ||
    window.sessionStorage.getItem('mapscrape_session_token')
  );
}

/**
 * Wrapper HTTP seguro com injeção automática de Bearer Token e cabeçalhos padrão
 */
export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(init.headers || {});
  
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(input, {
    ...init,
    headers,
    cache: init.cache || 'no-store',
  });
}

/**
 * Consulta as configurações ativas do motor de raspagem e status do Cloudflare Browser Rendering
 */
export async function getScraperSettings(): Promise<ScraperSettingsResponse> {
  const response = await apiFetch('/api/v1/scraper/settings');
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.message || `Erro HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Salva e aplica novas configurações de navegador e WebSocket remoto via Cloudflare
 */
export async function updateScraperSettings(settings: {
  browserWsEndpoint?: string;
  preferredEngine?: 'local' | 'cloudflare';
}): Promise<{ success: boolean; message: string; settings: any }> {
  const response = await apiFetch('/api/v1/scraper/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.message || `Erro HTTP ${response.status}`);
  }

  return response.json();
}
