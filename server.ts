import 'dotenv/config';
import http from 'http';
import path from 'path';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import authRoutes from './src/server/routes/auth.ts';
import profilesRoutes from './src/server/routes/profiles.ts';
import networkRoutes from './src/server/routes/network.ts';
import feedRoutes from './src/server/routes/feed.ts';
import jobsRoutes from './src/server/routes/jobs.ts';
import employersRoutes from './src/server/routes/employers.ts';
import messagingRoutes from './src/server/routes/messaging.ts';
import notificationsRoutes from './src/server/routes/notifications.ts';
import reportsRoutes from './src/server/routes/reports.ts';
import { initializeSocketServer } from './src/server/socket.ts';

async function bootstrap() {
  const app = express();
  const httpServer = http.createServer(app);
  const isProd = process.env.NODE_ENV === 'production';
  const argPortIdx = process.argv.indexOf('--port');
  const cliPort = argPortIdx !== -1 ? Number(process.argv[argPortIdx + 1]) : NaN;
  const envPort = Number(process.env.PORT);
  const nginxPort = Number(process.env.NGINX_PORT);
  const defaultPort = Number(process.env.DEFAULT_APP_PORT) || 3000;
  const port =
    Number.isFinite(cliPort) && cliPort > 0
      ? cliPort
      : !isProd || (Number.isFinite(envPort) && envPort === nginxPort)
        ? defaultPort
        : envPort || defaultPort;

  app.set('trust proxy', 1);

  const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    process.env.APP_URL,
  ].filter((v): v is string => Boolean(v && v !== 'MY_APP_URL'));

  app.use(
    helmet({
      contentSecurityPolicy: false,
      frameguard: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    })
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (
          allowedOrigins.includes(origin) ||
          origin.endsWith('.run.app') ||
          origin.endsWith('.aistudio.google.com')
        ) {
          return callback(null, true);
        }
        return callback(new Error('Origin not allowed by CORS policy'));
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: '4mb' }));
  app.use(express.urlencoded({ extended: true, limit: '4mb' }));

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down and try again.' },
  });

  app.use('/api', apiLimiter);

  // Liveness endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'resumind' });
  });

  // Domain API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/profiles', profilesRoutes);
  app.use('/api/network', networkRoutes);
  app.use('/api/feed', feedRoutes);
  app.use('/api/jobs', jobsRoutes);
  app.use('/api/organizations', employersRoutes);
  app.use('/api/conversations', messagingRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/reports', reportsRoutes);

  // API 404 handler
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  // Centralized safe error handler
  app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled server error:', err);
    res.status(err.status || 500).json({
      error: err.status && err.status < 500 ? err.message : 'An unexpected server error occurred',
    });
  });

  // Initialize authenticated Socket.IO
  initializeSocketServer(httpServer, allowedOrigins);

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      plugins: hmrDisabled
        ? [
            {
              name: 'disable-vite-client-ws-when-hmr-off',
              apply: 'serve',
              enforce: 'post',
              transform(code, id) {
                if (id.includes('vite/dist/client/client.mjs')) {
                  return code
                    .replace(
                      'transport.connect(createHMRHandler(handleMessage));',
                      '/* HMR WebSocket disabled via DISABLE_HMR */'
                    )
                    .replace(
                      'else throw new SendBeforeConnectError("send was called before connect");',
                      'else return;'
                    )
                    .replace(
                      'else throw new SendBeforeConnectError("invoke was called before connect");',
                      'else return undefined;'
                    );
                }
                return null;
              },
            },
          ]
        : [],
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: hmrDisabled ? false : true,
        ws: hmrDisabled
          ? false
          : {
              server: httpServer,
              path: '/__vite_hmr',
            },
        watch: hmrDisabled ? null : {},
      },
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

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`ResuMind unified server running on http://0.0.0.0:${port}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
