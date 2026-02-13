/**
 * Enhanced Browser Agent - Main Entry Point
 * Cloudflare Worker with complete feature set
 */

import { Router } from 'itty-router';
import { SessionDurableObject } from './durable-objects/session';
import { corsHeaders, handleCors, handleError } from './utils/http';
import type { Env } from './types';

const router = Router();

// ============================================================================
// CORS
// ============================================================================

router.options('*', handleCors);

// ============================================================================
// HEALTH & INFO
// ============================================================================

router.get('/health', () => {
  return new Response(
    JSON.stringify({
      status: 'ok',
      version: '3.0.0',
      features: [
        'multi-agent-coordination',
        'strategic-planning',
        'security-guardrails',
        'error-recovery',
        'tool-based-actions',
        'content-caching',
        'event-streaming',
        'session-replay',
        'analytics',
        'vision-support',
      ],
      timestamp: Date.now(),
    }),
    {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    }
  );
});

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

router.post('/api/sessions/create', async (request: Request, env: Env) => {
  try {
    const body = (await request.json()) as { 
      extensionId?: string;
      config?: any;
    };

    const id = env.SESSIONS.newUniqueId();
    const stub = env.SESSIONS.get(id);

    const response = await stub.fetch(
      new Request('http://internal/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          extensionId: body.extensionId,
          config: body.config,
        }),
      })
    );

    const data = (await response.json()) as { sessionId: string };

    return new Response(
      JSON.stringify({
        sessionId: data.sessionId,
        durableObjectId: id.toString(),
      }),
      {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  } catch (error) {
    return handleError(error);
  }
});

// ============================================================================
// TASK EXECUTION
// ============================================================================

router.post('/api/sessions/:sessionId/execute', async (request: Request, env: Env) => {
  try {
    const { sessionId } = request.params as { sessionId: string };
    const body = await request.json();

    const id = env.SESSIONS.idFromName(sessionId);
    const stub = env.SESSIONS.get(id);

    const response = await stub.fetch(
      new Request('http://internal/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    );

    return new Response(response.body, {
      status: response.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    return handleError(error);
  }
});

router.post('/api/sessions/:sessionId/follow-up', async (request: Request, env: Env) => {
  try {
    const { sessionId } = request.params as { sessionId: string };
    const body = await request.json();

    const id = env.SESSIONS.idFromName(sessionId);
    const stub = env.SESSIONS.get(id);

    const response = await stub.fetch(
      new Request('http://internal/follow-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    );

    return new Response(response.body, {
      status: response.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    return handleError(error);
  }
});

// ============================================================================
// BROWSER COMMUNICATION
// ============================================================================

router.get('/api/sessions/:sessionId/next-action', async (request: Request, env: Env) => {
  try {
    const { sessionId } = request.params as { sessionId: string };

    const id = env.SESSIONS.idFromName(sessionId);
    const stub = env.SESSIONS.get(id);

    const response = await stub.fetch(
      new Request('http://internal/next-action', {
        method: 'GET',
      })
    );

    return new Response(response.body, {
      status: response.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    return handleError(error);
  }
});

router.post('/api/sessions/:sessionId/action-result', async (request: Request, env: Env) => {
  try {
    const { sessionId } = request.params as { sessionId: string };
    const body = await request.json();

    const id = env.SESSIONS.idFromName(sessionId);
    const stub = env.SESSIONS.get(id);

    const response = await stub.fetch(
      new Request('http://internal/action-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    );

    return new Response(response.body, {
      status: response.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    return handleError(error);
  }
});

router.post('/api/sessions/:sessionId/state', async (request: Request, env: Env) => {
  try {
    const { sessionId } = request.params as { sessionId: string };
    const body = await request.json();

    const id = env.SESSIONS.idFromName(sessionId);
    const stub = env.SESSIONS.get(id);

    const response = await stub.fetch(
      new Request('http://internal/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    );

    return new Response(response.body, {
      status: response.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    return handleError(error);
  }
});

// ============================================================================
// EXECUTION CONTROL
// ============================================================================

router.post('/api/sessions/:sessionId/pause', async (request: Request, env: Env) => {
  try {
    const { sessionId } = request.params as { sessionId: string };
    const id = env.SESSIONS.idFromName(sessionId);
    const stub = env.SESSIONS.get(id);

    const response = await stub.fetch(
      new Request('http://internal/pause', {
        method: 'POST',
      })
    );

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

    const response = await stub.fetch(
      new Request('http://internal/resume', {
        method: 'POST',
      })
    );

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

    const response = await stub.fetch(
      new Request('http://internal/cancel', {
        method: 'POST',
      })
    );

    return new Response(response.body, {
      status: response.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    return handleError(error);
  }
});

// ============================================================================
// HISTORY & MONITORING
// ============================================================================

router.get('/api/sessions/:sessionId/history', async (request: Request, env: Env) => {
  try {
    const { sessionId } = request.params as { sessionId: string };
    const id = env.SESSIONS.idFromName(sessionId);
    const stub = env.SESSIONS.get(id);

    const response = await stub.fetch(
      new Request('http://internal/history', {
        method: 'GET',
      })
    );

    return new Response(response.body, {
      status: response.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    return handleError(error);
  }
});

router.get('/api/sessions/:sessionId/events', async (request: Request, env: Env) => {
  try {
    const { sessionId } = request.params as { sessionId: string };
    const id = env.SESSIONS.idFromName(sessionId);
    const stub = env.SESSIONS.get(id);

    const response = await stub.fetch(
      new Request('http://internal/events', {
        method: 'GET',
      })
    );

    return response; // Return SSE stream directly
  } catch (error) {
    return handleError(error);
  }
});

// ============================================================================
// FEATURES
// ============================================================================

router.post('/api/sessions/:sessionId/replay', async (request: Request, env: Env) => {
  try {
    const { sessionId } = request.params as { sessionId: string };
    const id = env.SESSIONS.idFromName(sessionId);
    const stub = env.SESSIONS.get(id);

    const response = await stub.fetch(
      new Request('http://internal/replay', {
        method: 'POST',
      })
    );

    return new Response(response.body, {
      status: response.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    return handleError(error);
  }
});

router.post('/api/sessions/:sessionId/extract', async (request: Request, env: Env) => {
  try {
    const { sessionId } = request.params as { sessionId: string };
    const body = await request.json();

    const id = env.SESSIONS.idFromName(sessionId);
    const stub = env.SESSIONS.get(id);

    const response = await stub.fetch(
      new Request('http://internal/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    );

    return new Response(response.body, {
      status: response.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    return handleError(error);
  }
});

// ============================================================================
// FALLBACK
// ============================================================================

router.all('*', () => {
  return new Response('Not Found', { status: 404, headers: corsHeaders });
});

// ============================================================================
// WORKER EXPORT
// ============================================================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return router.handle(request, env);
  },
};

export { SessionDurableObject };
