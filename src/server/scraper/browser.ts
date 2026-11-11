import puppeteer from 'puppeteer-core';
import type { Browser } from 'puppeteer-core';

const CONNECT_TIMEOUT_MS = 25_000;

export interface ScraperBrowserOptions {
  token?: string;
}

/**
 * Returns the direct Browserless WebSocket endpoint:
 * wss://production-sfo.browserless.io?token=<token>
 */
export function getBrowserlessEndpoint(token?: string): string {
  const effectiveToken = (token || process.env.BROWSERLESS_TOKEN)?.trim();
  if (!effectiveToken) return '';
  return `wss://production-sfo.browserless.io?token=${encodeURIComponent(effectiveToken)}`;
}

/**
 * Connects with timeout to Browserless WebSocket.
 */
function connectWithTimeout(endpoint: string, timeoutMs = CONNECT_TIMEOUT_MS): Promise<Browser> {
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const connection = puppeteer.connect({
    browserWSEndpoint: endpoint,
    protocolTimeout: 35_000,
  });

  // If the WebSocket handshake completes after the timeout, close the late
  // session so it does not consume a Browserless slot in the background.
  void connection.then((browser) => {
    if (timedOut) void browser.close().catch(() => {});
  }).catch(() => {});

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new Error(`Timeout ao conectar ao Browserless via WebSocket após ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  return Promise.race([connection, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Connects directly to Browserless cloud browser.
 * On Vercel or production, Browserless is required.
 * In local development, falls back to local puppeteer if no token is configured.
 */
export async function connectScraperBrowser(
  options?: string | ScraperBrowserOptions
): Promise<Browser> {
  const token = typeof options === 'string' ? options.trim() : options?.token?.trim();
  const endpoint = getBrowserlessEndpoint(token);

  if (endpoint) {
    const masked = endpoint.replace(/token=([^&]{4})[^&]*([^&]{4})/, 'token=$1••••$2');
    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        console.info(`[Scraper:Browserless] Conectando ao Browserless na nuvem (${masked}) [tentativa ${attempt}/2]...`);
        const browser = await connectWithTimeout(endpoint);
        console.info('[Scraper:Browserless] Sessão Chromium remota conectada com sucesso via WebSocket.');
        return browser;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[Scraper:Browserless] Falha de conexão (${attempt}/2): ${message}`);
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    throw new Error(
      'Não foi possível abrir uma sessão no Browserless: ' +
      (lastError instanceof Error ? lastError.message : String(lastError))
    );
  }

  // On Vercel or production, Browserless is strictly required because serverless containers have no local Chrome
  if (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production') {
    throw new Error(
      'Browserless obrigatório na Vercel. Configure a variável BROWSERLESS_TOKEN no painel da Vercel ou na aba Credenciais do MaisClientes.'
    );
  }

  console.info('[Scraper] BROWSERLESS_TOKEN não configurado. Utilizando Chromium local para desenvolvimento.');
  const localPuppeteer = await import('puppeteer');
  return localPuppeteer.default.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--lang=pt-BR,pt',
    ],
  }) as unknown as Browser;
}

/**
 * Tests connection directly to Browserless and returns diagnostics.
 */
export async function testRemoteBrowserConnection(
  options?: string | ScraperBrowserOptions
): Promise<{ ok: boolean; version?: string; latencyMs?: number; engine: string; error?: string }> {
  const start = Date.now();
  const token = typeof options === 'string' ? options.trim() : options?.token?.trim();
  const endpoint = getBrowserlessEndpoint(token);

  if (!endpoint) {
    return {
      ok: false,
      engine: 'none',
      error: 'Nenhum BROWSERLESS_TOKEN informado para testar a conexão.',
    };
  }

  try {
    const browser = await connectWithTimeout(endpoint, 15_000);
    const version = await browser.version();
    await browser.close().catch(() => {});
    const latencyMs = Date.now() - start;
    return {
      ok: true,
      version,
      latencyMs,
      engine: 'browserless',
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    return {
      ok: false,
      latencyMs,
      engine: 'browserless',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
