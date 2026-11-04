/**
 * Normalizes Browserless HTTP-style dashboard/API URLs into Puppeteer's
 * browser WebSocket endpoint. Never log or return the URL because it contains
 * the access token in its query string.
 */
export function getBrowserWSEndpoint(): string {
  const configured = process.env.BROWSER_WS_ENDPOINT?.trim();
  if (!configured) {
    throw new Error('Navegador remoto não configurado: defina BROWSER_WS_ENDPOINT.');
  }

  let endpoint: URL;
  try {
    endpoint = new URL(configured);
  } catch {
    throw new Error('BROWSER_WS_ENDPOINT não é uma URL absoluta válida.');
  }

  if (endpoint.protocol === 'https:') endpoint.protocol = 'wss:';
  else if (endpoint.protocol === 'http:') endpoint.protocol = 'ws:';

  // Browserless Shared Cloud's /screenshot route is an HTTP API, not the
  // Puppeteer CDP endpoint. Puppeteer connects to the WebSocket host root.
  if (endpoint.hostname.endsWith('browserless.io') && endpoint.pathname.replace(/\/$/, '') === '/screenshot') {
    endpoint.pathname = '/';
  }

  if (!['ws:', 'wss:'].includes(endpoint.protocol)) {
    throw new Error('BROWSER_WS_ENDPOINT deve apontar para um endpoint WebSocket compatível com Puppeteer.');
  }

  if (endpoint.hostname.endsWith('browserless.io') && endpoint.protocol !== 'wss:') {
    throw new Error('Browserless Shared Cloud exige WebSocket seguro (wss).');
  }

  return endpoint.toString();
}

export function getBrowserEndpointDiagnostic(endpoint: string): Record<string, string | boolean | number> {
  const parsed = new URL(endpoint);
  return {
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    hasCredentials: Boolean(parsed.username || parsed.password),
    hasQuery: Boolean(parsed.search),
    pathDepth: parsed.pathname.split('/').filter(Boolean).length,
    endpointLength: endpoint.length,
  };
}
