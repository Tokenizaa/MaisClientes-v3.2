/**
 * Direct Browserless WebSocket endpoint helper.
 * Simple, direct, and zero-configuration on top of BROWSERLESS_TOKEN.
 */
export function getBrowserWSEndpoint(token?: string): string {
  const browserlessToken = (token || process.env.BROWSERLESS_TOKEN)?.trim();
  if (!browserlessToken) {
    throw new Error('Browserless não configurado: defina BROWSERLESS_TOKEN na Vercel ou na aba Credenciais.');
  }
  return `wss://production-sfo.browserless.io?token=${encodeURIComponent(browserlessToken)}`;
}

export function getBrowserEndpointDiagnostic(endpoint: string): Record<string, string | boolean | number> {
  try {
    const parsed = new URL(endpoint);
    return {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      hasCredentials: Boolean(parsed.username || parsed.password),
      hasToken: parsed.searchParams.has('token'),
      pathDepth: parsed.pathname.split('/').filter(Boolean).length,
      endpointLength: endpoint.length,
    };
  } catch {
    return {
      protocol: 'unknown',
      hostname: 'invalid',
      hasCredentials: false,
      hasToken: false,
      pathDepth: 0,
      endpointLength: endpoint.length,
    };
  }
}
