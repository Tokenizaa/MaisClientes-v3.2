import puppeteer from 'puppeteer-core';
import type { Browser } from 'puppeteer-core';

const CONNECT_TIMEOUT_MS = 8_000;

function connectWithTimeout(endpoint: string): Promise<Browser> {
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const connection = puppeteer.connect({
    browserWSEndpoint: endpoint,
    protocolTimeout: 20_000,
  });

  // If the WebSocket handshake completes after the timeout, close the late
  // session so it does not consume a Browserless slot in the background.
  void connection.then((browser) => {
    if (timedOut) void browser.close().catch(() => {});
  }).catch(() => {});

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new Error('Timeout ao abrir a sessão Chromium remota após ' + CONNECT_TIMEOUT_MS + ' ms.'));
    }, CONNECT_TIMEOUT_MS);
  });

  return Promise.race([connection, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function connectScraperBrowser(legacyEndpoint?: string): Promise<Browser> {
  const browserlessToken = process.env.BROWSERLESS_TOKEN?.trim();
  const configuredEndpoint = String(
    legacyEndpoint || process.env.BROWSER_WS_ENDPOINT || ''
  ).trim();
  const endpoint = browserlessToken
    ? 'wss://production-sfo.browserless.io?token=' + encodeURIComponent(browserlessToken)
    : configuredEndpoint;

  if (endpoint) {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        console.info('[Scraper] Abrindo sessão Browserless (' + attempt + '/2).');
        const browser = await connectWithTimeout(endpoint);
        console.info('[Scraper] Sessão Chromium conectada.');
        return browser;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        console.error('[Scraper] Conexão Browserless falhou (' + attempt + '/2): ' + message);
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 700));
      }
    }
    throw new Error('Não foi possível abrir uma sessão Browserless: ' +
      (lastError instanceof Error ? lastError.message : String(lastError)));
  }

  if (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production') {
    throw new Error('Browser remoto obrigatório em produção. Configure BROWSERLESS_TOKEN na Vercel.');
  }

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
