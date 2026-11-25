import * as sessionHandler from './functions/api/admin/session.js';
import * as loginHandler from './functions/api/admin/login.js';
import * as logoutHandler from './functions/api/admin/logout.js';
import * as articlesHandler from './functions/api/admin/articles.js';
import * as uploadHandler from './functions/api/admin/upload.js';
import * as siteConfigHandler from './functions/api/admin/site-config.js';

const ROUTES = {
  '/api/admin/session': sessionHandler,
  '/api/admin/login': loginHandler,
  '/api/admin/logout': logoutHandler,
  '/api/admin/articles': articlesHandler,
  '/api/admin/upload': uploadHandler,
  '/api/admin/site-config': siteConfigHandler,
};

const METHOD_MAP = {
  GET: 'onRequestGet',
  POST: 'onRequestPost',
  PUT: 'onRequestPut',
  DELETE: 'onRequestDelete',
};

const MUTATING_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isSameOriginMutation(request, url) {
  const origin = request.headers.get('Origin');
  if (origin) {
    return origin === url.origin;
  }
  const referer = request.headers.get('Referer');
  if (referer) {
    try {
      return new URL(referer).origin === url.origin;
    } catch {
      return false;
    }
  }
  return false;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    const handlerModule = ROUTES[pathname];

    if (handlerModule) {
      if (MUTATING_METHODS.has(request.method) && !isSameOriginMutation(request, url)) {
        return withSecurityHeaders(
          new Response(JSON.stringify({ error: 'Origine richiesta non autorizzata.' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
          })
        );
      }

      const fnName = METHOD_MAP[request.method];
      const handler = fnName ? handlerModule[fnName] : null;
      if (typeof handler === 'function') {
        const res = await handler({ request, env, ctx });
        return withSecurityHeaders(res);
      }
      return withSecurityHeaders(
        new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        })
      );
    }

    if (env.ASSETS) {
      const assetRes = await env.ASSETS.fetch(request);
      return withSecurityHeaders(assetRes);
    }

    return withSecurityHeaders(new Response('Not Found', { status: 404 }));
  },
};
