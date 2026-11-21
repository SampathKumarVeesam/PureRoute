import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { createApp, ensureDbReady, startFifoExpirationWatcher } from './server/createApp.ts';
import { verifySmtpConnection } from './server/email.ts';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = createApp();

  // Ensure MongoDB Atlas is initialized
  await ensureDbReady();
  startFifoExpirationWatcher();

  // Verify Zoho Mail SMTP connection for Render logs
  verifySmtpConnection().catch((err) => {
    console.warn('[SMTP Startup Warning]:', err.message);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PureRoute LocalMilkforYou Hyderabad running on http://0.0.0.0:${PORT}`);
    console.log(`OpenAPI 3.0 Swagger UI available at http://0.0.0.0:${PORT}/api-docs`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
