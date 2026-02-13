/**
 * Main Fastify Application
 * 
 * This file registers all controllers and services for the API.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import type { StatsDatabase } from './db.js';
import type { RealtimeStore } from './realtime.js';

// Import modules
import { BackendService, backendController } from './modules/backend/index.js';
import { StatsService, statsController } from './modules/stats/index.js';
import { AuthService, authController } from './modules/auth/index.js';

// Extend Fastify instance to include services
declare module 'fastify' {
  interface FastifyInstance {
    backendService: BackendService;
    statsService: StatsService;
  }
}

export interface AppOptions {
  port: number;
  db: StatsDatabase;
  realtimeStore: RealtimeStore;
  logger?: boolean;
}

export async function createApp(options: AppOptions) {
  const { port, db, realtimeStore, logger = false } = options;
  
  // Create Fastify instance
  const app = Fastify({ logger });

  // Register CORS
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  // Register Cookie
  await app.register(cookie, {
    secret: process.env.COOKIE_SECRET || 'neko-master-secret-change-me', // secure cookie sign
    parseOptions: {} 
  });

  // Create services
  const authService = new AuthService(db);
  const backendService = new BackendService(db, realtimeStore, authService);
  const statsService = new StatsService(db, realtimeStore);

  // Decorate Fastify instance with services
  app.decorate('backendService', backendService);
  app.decorate('statsService', statsService);
  app.decorate('authService', authService);

  const getBackendIdFromQuery = (query: Record<string, unknown>): number | null => {
    const backendId = typeof query.backendId === 'string' ? query.backendId : undefined;
    return statsService.resolveBackendId(backendId);
  };

  const getGatewayBaseUrl = (url: string): string => {
    return url
      .replace(/^ws:\/\//, 'http://')
      .replace(/^wss:\/\//, 'https://')
      .replace(/\/connections\/?$/, '');
  };

  // Health check endpoint (not part of any module)
  app.get('/health', async () => ({ status: 'ok' }));

  // Compatibility routes: DB management
  app.get('/api/db/stats', async () => {
    return {
      size: db.getDatabaseSize(),
      totalConnectionsCount: db.getTotalConnectionLogsCount(),
    };
  });

  app.post('/api/db/cleanup', async (request, reply) => {
    if (authService.isShowcaseMode()) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const body = request.body as { days?: number; backendId?: number };
    const days = body?.days;
    const backendId = typeof body?.backendId === 'number' ? body.backendId : undefined;

    if (typeof days !== 'number' || days < 0) {
      return reply.status(400).send({ error: 'Valid days parameter required' });
    }

    const result = db.cleanupOldData(backendId ?? null, days);

    if (days === 0) {
      if (backendId) {
        realtimeStore.clearBackend(backendId);
      } else {
        const backends = db.getAllBackends();
        for (const backend of backends) {
          realtimeStore.clearBackend(backend.id);
        }
      }

      return {
        message: `Cleaned all data: ${result.deletedConnections} connections, ${result.deletedDomains} domains, ${result.deletedProxies} proxies`,
        deleted: result.deletedConnections,
        domains: result.deletedDomains,
        ips: result.deletedIPs,
        proxies: result.deletedProxies,
        rules: result.deletedRules,
      };
    }

    return {
      message: `Cleaned ${result.deletedConnections} old connection logs`,
      deleted: result.deletedConnections,
    };
  });

  app.post('/api/db/vacuum', async (request, reply) => {
    if (authService.isShowcaseMode()) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    db.vacuum();
    return { message: 'Database vacuumed successfully' };
  });

  app.get('/api/db/retention', async () => {
    return db.getRetentionConfig();
  });

  app.put('/api/db/retention', async (request, reply) => {
    if (authService.isShowcaseMode()) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const body = request.body as {
      connectionLogsDays?: number;
      hourlyStatsDays?: number;
      autoCleanup?: boolean;
    };

    if (
      body.connectionLogsDays !== undefined &&
      (body.connectionLogsDays < 1 || body.connectionLogsDays > 90)
    ) {
      return reply.status(400).send({ error: 'connectionLogsDays must be between 1 and 90' });
    }

    if (
      body.hourlyStatsDays !== undefined &&
      (body.hourlyStatsDays < 7 || body.hourlyStatsDays > 365)
    ) {
      return reply.status(400).send({ error: 'hourlyStatsDays must be between 7 and 365' });
    }

    const config = db.updateRetentionConfig({
      connectionLogsDays: body.connectionLogsDays,
      hourlyStatsDays: body.hourlyStatsDays,
      autoCleanup: body.autoCleanup,
    });

    return { message: 'Retention configuration updated', config };
  });

  // Compatibility routes: Gateway APIs
  app.get('/api/gateway/providers/proxies', async (request, reply) => {
    const backendId = getBackendIdFromQuery(request.query as Record<string, unknown>);
    if (backendId === null) {
      return reply.status(404).send({ error: 'No backend specified or active' });
    }

    const backend = db.getBackend(backendId);
    if (!backend) {
      return reply.status(404).send({ error: 'Backend not found' });
    }

    const gatewayBaseUrl = getGatewayBaseUrl(backend.url);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (backend.token) {
      headers.Authorization = `Bearer ${backend.token}`;
    }

    try {
      const res = await fetch(`${gatewayBaseUrl}/providers/proxies`, { headers });
      if (!res.ok) {
        return reply.status(res.status).send({ error: `Gateway API error: ${res.status}` });
      }
      return res.json();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to reach Gateway API';
      return reply.status(502).send({ error: message });
    }
  });

  app.get('/api/gateway/rules', async (request, reply) => {
    const backendId = getBackendIdFromQuery(request.query as Record<string, unknown>);
    if (backendId === null) {
      return reply.status(404).send({ error: 'No backend specified or active' });
    }

    const backend = db.getBackend(backendId);
    if (!backend) {
      return reply.status(404).send({ error: 'Backend not found' });
    }

    const gatewayBaseUrl = getGatewayBaseUrl(backend.url);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (backend.token) {
      headers.Authorization = `Bearer ${backend.token}`;
    }

    try {
      const res = await fetch(`${gatewayBaseUrl}/rules`, { headers });
      if (!res.ok) {
        return reply.status(res.status).send({ error: `Gateway API error: ${res.status}` });
      }
      return res.json();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to reach Gateway API';
      return reply.status(502).send({ error: message });
    }
  });

  // Auth middleware - protects API routes
  app.addHook('onRequest', async (request, reply) => {
    // Skip auth for public routes
    const publicRoutes = [
      '/health',
      '/api/auth/state',
      '/api/auth/verify',
      '/api/auth/logout', // Add logout as public so we can clear cookies even if invalid
    ];
    
    // Check if route is public
    if (publicRoutes.some(route => request.url.startsWith(route))) {
      return;
    }

    // Check if auth is required
    if (!authService.isAuthRequired()) {
      return;
    }

    // Try to get token from Cookie first
    const cookieToken = request.cookies['neko-session'];
    if (cookieToken) {
      const verifyResult = await authService.verifyToken(cookieToken);
      if (verifyResult.valid) {
        return;
      }
    }

    // Fallback: Get token from header (for backward compatibility / API clients)
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const token = authHeader.slice(7);
    const verifyResult = await authService.verifyToken(token);
    
    if (!verifyResult.valid) {
      return reply.status(401).send({ error: verifyResult.message || 'Invalid token' });
    }
  });

  // Register controllers
  await app.register(backendController, { prefix: '/api/backends' });
  await app.register(statsController, { prefix: '/api/stats' });
  await app.register(authController, { prefix: '/api/auth' });

  // Start server
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`[API] Server running at http://localhost:${port}`);

  return app;
}

export class APIServer {
  private app: ReturnType<typeof Fastify> | null = null;
  private db: StatsDatabase;
  private realtimeStore: RealtimeStore;
  private port: number;

  constructor(port: number, db: StatsDatabase, realtimeStore: RealtimeStore) {
    this.port = port;
    this.db = db;
    this.realtimeStore = realtimeStore;
  }

  async start() {
    this.app = await createApp({
      port: this.port,
      db: this.db,
      realtimeStore: this.realtimeStore,
      logger: false,
    });
    return this.app;
  }

  stop() {
    if (this.app) {
      this.app.close();
      console.log('[API] Server stopped');
    }
  }
}

export default createApp;
