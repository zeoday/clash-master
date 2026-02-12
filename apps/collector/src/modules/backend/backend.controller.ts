/**
 * Backend Controller - Fastify routes for /api/backends
 */

import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import type { BackendService } from './backend.service.js';
import type {
  CreateBackendInput,
  UpdateBackendInput,
  TestConnectionInput,
} from './backend.types.js';

// Extend Fastify instance to include backendService
declare module 'fastify' {
  interface FastifyInstance {
    backendService: BackendService;
  }
}

interface BackendParams {
  id: string;
}

interface ListeningBody {
  listening: boolean;
}

const backendController: FastifyPluginAsync = async (fastify: FastifyInstance): Promise<void> => {
  const service = fastify.backendService;

  // Get all backends
  fastify.get('/', async () => {
    return service.getAllBackends();
  });

  // Get active backend
  fastify.get('/active', async () => {
    return service.getActiveBackend();
  });

  // Get listening backends
  fastify.get('/listening', async () => {
    return service.getListeningBackends();
  });

  // Create new backend
  fastify.post<{ Body: CreateBackendInput }>('/', async (request, reply) => {
    if (fastify.authService.isShowcaseMode()) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const { name, url, token } = request.body;
    
    if (!name || !url) {
      return reply.status(400).send({ error: 'Name and URL are required' });
    }
    
    try {
      const result = service.createBackend({ name, url, token });
      return result;
    } catch (error: any) {
      if (error.message?.includes('UNIQUE constraint failed')) {
        return reply.status(409).send({ error: 'Backend name already exists' });
      }
      throw error;
    }
  });

  // Update backend
  fastify.put<{ Params: BackendParams; Body: UpdateBackendInput }>('/:id', async (request, reply) => {
    if (fastify.authService.isShowcaseMode()) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const { id } = request.params;
    const backendId = parseInt(id);
    
    const backend = service.getBackend(backendId);
    if (!backend) {
      return reply.status(404).send({ error: 'Backend not found' });
    }
    
    const result = service.updateBackend(backendId, request.body);
    return result;
  });

  // Delete backend
  fastify.delete<{ Params: BackendParams }>('/:id', async (request, reply) => {
    if (fastify.authService.isShowcaseMode()) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const { id } = request.params;
    const backendId = parseInt(id);
    
    const backend = service.getBackend(backendId);
    if (!backend) {
      return reply.status(404).send({ error: 'Backend not found' });
    }
    
    const result = service.deleteBackend(backendId);
    return result;
  });

  // Set active backend
  fastify.post<{ Params: BackendParams }>('/:id/activate', async (request, reply) => {
    // fastify.authService.isShowcaseMode() check removed to allow switching in demo mode

    const { id } = request.params;
    const backendId = parseInt(id);
    
    const backend = service.getBackend(backendId);
    if (!backend) {
      return reply.status(404).send({ error: 'Backend not found' });
    }
    
    const result = service.setActiveBackend(backendId);
    return result;
  });

  // Set listening state for a backend
  fastify.post<{ Params: BackendParams; Body: ListeningBody }>('/:id/listening', async (request, reply) => {
    if (fastify.authService.isShowcaseMode()) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const { id } = request.params;
    const { listening } = request.body;
    const backendId = parseInt(id);
    
    const backend = service.getBackend(backendId);
    if (!backend) {
      return reply.status(404).send({ error: 'Backend not found' });
    }
    
    const result = service.setBackendListening(backendId, listening);
    return result;
  });

  // Test existing backend connection (uses stored token)
  fastify.post<{ Params: BackendParams }>('/:id/test', async (request, reply) => {
    if (fastify.authService.isShowcaseMode()) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const { id } = request.params;
    const backendId = parseInt(id);
    
    const backend = service.getBackend(backendId);
    if (!backend) {
      return reply.status(404).send({ error: 'Backend not found' });
    }

    const result = await service.testExistingBackendConnection(backendId);
    return result;
  });

  // Test backend connection
  fastify.post<{ Body: TestConnectionInput }>('/test', async (request, reply) => {
    if (fastify.authService.isShowcaseMode()) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const result = await service.testConnection(request.body);
    return result;
  });

  // Clear all data for a specific backend
  fastify.post<{ Params: BackendParams }>('/:id/clear-data', async (request, reply) => {
    if (fastify.authService.isShowcaseMode()) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const { id } = request.params;
    const backendId = parseInt(id);
    
    const backend = service.getBackend(backendId);
    if (!backend) {
      return reply.status(404).send({ error: 'Backend not found' });
    }
    
    const result = service.clearBackendData(backendId);
    return result;
  });
};

export default backendController;
