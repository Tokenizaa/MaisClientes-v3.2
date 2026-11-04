import { createApp } from './server';

const initialPort = Number(process.env.PORT || 3000);

async function startServer(): Promise<void> {
  const app = await createApp();

  const listen = (port: number): void => {
    const server = app.listen(port, '0.0.0.0', () => {
      const address = server.address();
      const activePort = typeof address === 'object' && address ? address.port : port;

      console.log(
        `[MaisClientes] API disponível em http://localhost:${activePort}`,
      );
    });

    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        console.warn(
          `[MaisClientes] Porta ${port} ocupada; tentando ${port + 1}...`,
        );
        listen(port + 1);
        return;
      }

      console.error('[MaisClientes] Falha ao iniciar:', error);
      process.exit(1);
    });
  };

  listen(initialPort);
}

startServer().catch((error) => {
  console.error('[MaisClientes] Falha ao iniciar:', error);
  process.exit(1);
});
