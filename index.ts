/**
 * Enhanced Cloudflare Worker Entry Point - Complete Implementation
 */

import { Router } from 'itty-router';
import { SessionDurableObject } from './durable-objects/session';
import { corsHeaders, handleCors, handleError } from './utils/http';
import type { Env } from './types';

const router = Router();

// CORS preflight
router.options('*', handleCors);

// Health check
router.get('/health', () => {
  return new Response(JSON.stringify({ 
    status: 'ok', 
    version: '2.0.0',
    features: [
      'multi-agent',
      'vision-support',
      'follow-up-tasks',
      'replay',
      'events',
      'extraction'
    ],
    timestamp: Date.now() 
  }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
});

// Session Management
router.post('/api/sessions/create', async (request: Request, env: Env) => {
  try {
    const body = await request.json() as { extensionId?: string };
    
    const id = env.SESSIONS.newUniqueId();
    const stub = env.SESSIONS.get(id);
    
    const response = await stub.fetch(new Request('http://internal/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extensionId: body.extensionId }),
    }));
    
    const data = await response.json() as { sessionId: string };
    
    return new Response(JSON.stringify({
      sessionId: data.sessionId,
      durableObjectId: id.toString(),
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    return handleError(error);
  }
});

// Execute Task
router.post('/api/sessions/:sessionId/execute', async (request: Request, env: Env) => {
  try {
    const { sessionId } = request.params as { sessionId: string };
    const body = await request.json();
    
    const id = env.SESSIONS.idFromName(sessionId);
    const stub = env.SESSIONS.get(id);
    
    const response = await stub.fetch(new Request('http://internal/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }));
    
    return new Response(response.body, {
      status: response.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    return handleError(error);
  }
});

// Follow-Up Task
router.post('/api/sessions/:sessionId/follow-up', async (request: Request, env: Env) => {
  try {
    const { sessionId } = request.params as { sessionId: string };
    const body = await request.json();
    
    const id = env.SESSIONS.idFromName(sessionId);
    const stub = env.SESSIONS.get(id);
    
    const response = await stub.fetch(new Request('http://internal/follow-up', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }));
    
    return new Response(response.body, {
      status: response.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    return handleError(error);
  }
});

// Get Next Action
router.get('/api/sessions/:sessionId/next-action', async (request: Request, env: Env) => {
  try {
    const { sessionId } = request.params as { sessionId: string };
    
    const id = env.SESSIONS.idFromName(sessionId);
    const stub = env.SESSIONS.get(id);
    
    const response = await stub.fetch(new Request('http://internal/next-action', {
      method: 'GET',
    }));
    
    return new Response(response.body, {
      status: response.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    return handleError(error);
  }
});

// Report Action Result
router.post('/api/sessions/:sessionId/action-result', async (request: Request, env: Env) => {
  try {
    const { sessionId } = request.params as { sessionId: string };
    const body = await request.json();
    
    const id = env.SESSIONS.idFromName(sessionId);
    const stub = env.SESSIONS.get(id);
    
    const response = await stub.fetch(new Request('http://internal/action-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }));
    
    return new Response(response.body, {
      status: response.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    return handleError(error);
  }
});

// Update Browser State
router.post('/api/sessions/:sessionId/state', async (request: Request, env: Env) => {
  try {
    const { sessionId } = request.params as { sessionId: string };
    const body = await request.json();
    
    const id = env.SESSIONS.idFromName(sessionId);
    const stub = env.SESSIONS.get(id);
    
    const response = await stub.fetch(new Request('http://internal/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }));
    
    return new Response(response.body, {
      status: response.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    return handleError(error);
  }
});

// Pause/Resume/Cancel
router.post('/api/sessions/:sessionId/pause', async (request: Request, env: Env) => {
  try {
    const { sessionId } = request.params as { sessionId: string };
    const id = env.SESSIONS.idFromName(sessionId);
    const stub = env.SESSIONS.get(id);
    
    const response = await stub.fetch(new Request('http://internal/pause', {
      method: 'POST',
    }));
    
    return new Response(response.body, {
      status: response.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    return handleError(error);
  }
});

router.post('/api/sessions/:sessionId/resume', async (request: Request, env: Env) => {
  try {
    const { sessionId } = request.params as { sessionId: string };
    const id = env.SESSIONS.idFromName(sessionId);
    const stub = env.SESSIONS.get(id);
    
    const response = await stub.fetch(new Request('http://internal/resume', {
      method: 'POST',
    }));
    
    return new Response(response.body, {
      status: response.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    return handleError(error);
  }
});

router.post('/api/sessions/:sessionId/cancel', async (request: Request, env: Env) => {
  try {
    const { sessionId } = request.params as { sessionId: string };
    const id = env.SESSIONS.idFromName(sessionId);
    const stub = env.SESSIONS.get(id);
    
    const response = await stub.fetch(new Request('http://internal/cancel', {
      method: 'POST',
    }));
    
    return new Response(response.body, {
      status: response.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    return handleError(error);
  }
});

// Get History
router.get('/api/sessions/:sessionId/history', async (request: Request, env: Env) => {
  try {
    const { sessionId } = request.params as { sessionId: string };
    const id = env.SESSIONS.idFromName(sessionId);
    const stub = env.SESSIONS.get(id);
    
    const response = await stub.fetch(new Request('http://internal/history', {
      method: 'GET',
    }));
    
    return new Response(response.body, {
      status: response.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    return handleError(error);
  }
});

// Event Stream (SSE)
router.get('/api/sessions/:sessionId/events', async (request: Request, env: Env) => {
  try {
    const { sessionId } = request.params as { sessionId: string };
    const id = env.SESSIONS.idFromName(sessionId);
    const stub = env.SESSIONS.get(id);
    
    const response = await stub.fetch(new Request('http://internal/events', {
      method: 'GET',
    }));
    
    return response; // Return SSE stream directly
  } catch (error) {
    return handleError(error);
  }
});

// Replay Session
router.post('/api/sessions/:sessionId/replay', async (request: Request, env: Env) => {
  try {
    const { sessionId } = request.params as { sessionId: string };
    const id = env.SESSIONS.idFromName(sessionId);
    const stub = env.SESSIONS.get(id);
    
    const response = await stub.fetch(new Request('http://internal/replay', {
      method: 'POST',
    }));
    
    return new Response(response.body, {
      status: response.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    return handleError(error);
  }
});

// Extract Data
router.post('/api/sessions/:sessionId/extract', async (request: Request, env: Env) => {
  try {
    const { sessionId } = request.params as { sessionId: string };
    const body = await request.json();
    
    const id = env.SESSIONS.idFromName(sessionId);
    const stub = env.SESSIONS.get(id);
    
    const response = await stub.fetch(new Request('http://internal/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }));
    
    return new Response(response.body, {
      status: response.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    return handleError(error);
  }
});

// 404 handler
router.all('*', () => {
  return new Response(JSON.stringify({ error: 'Not Found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return router.handle(request, env, ctx).catch(handleError);
  },
};

export { SessionDurableObject };
