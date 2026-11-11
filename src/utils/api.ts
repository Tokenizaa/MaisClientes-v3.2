/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Resposta de configurações do motor do Scraper retornado pela API v1
 */
export interface ScraperSettingsResponse {
  engine: 'browserless' | 'local_puppeteer';
  hasRemoteEndpoint: boolean;
  hasToken: boolean;
  tokenMasked?: string;
  status: 'ready' | 'configured' | 'error';
  description: string;
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
 * Consulta as configurações ativas do motor de raspagem Browserless
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
 * Salva e aplica novas configurações de navegador e token do Browserless
 */
export async function updateScraperSettings(settings: {
  browserlessToken?: string;
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
