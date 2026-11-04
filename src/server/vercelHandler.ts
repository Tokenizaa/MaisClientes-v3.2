import type { Request, Response } from 'express';
import { createApp } from '../../server.js';

let appPromise: ReturnType<typeof createApp> | undefined;

/**
 * Shared entry point for Vercel Functions.
 * Keep the Express app initialization lazy so each serverless bundle can reuse it.
 */
export default async function vercelHandler(req: Request, res: Response): Promise<void> {
  try {
    appPromise ??= createApp();
    const app = await appPromise;
    app(req, res);
  } catch (error) {
    console.error('[Vercel API] Application initialization failed:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Falha ao inicializar a API.' });
    }
  }
}
