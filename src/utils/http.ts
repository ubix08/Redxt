/**
 * HTTP Utilities
 * CORS handling and error responses
 */

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

export function handleCors(): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export function handleError(error: unknown): Response {
  const message = error instanceof Error ? error.message : 'Unknown error';
  
  console.error('Request error:', error);
  
  return new Response(
    JSON.stringify({ 
      error: message,
      timestamp: Date.now(),
    }),
    {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    }
  );
}

export function jsonResponse(data: any, status: number = 200): Response {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    }
  );
}

export function errorResponse(message: string, status: number = 400): Response {
  return jsonResponse({ error: message }, status);
}
