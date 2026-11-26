import * as sessionHandler from './functions/api/admin/session.js';
import * as loginHandler from './functions/api/admin/login.js';
import * as logoutHandler from './functions/api/admin/logout.js';
import * as articlesHandler from './functions/api/admin/articles.js';
import * as uploadHandler from './functions/api/admin/upload.js';
import * as siteConfigHandler from './functions/api/admin/site-config.js';
import * as aiAssistHandler from './functions/api/admin/ai-assist.js';

const ROUTES = {
  '/api/admin/session': sessionHandler,
  '/api/admin/login': loginHandler,
  '/api/admin/logout': logoutHandler,
  '/api/admin/articles': articlesHandler,
  '/api/admin/upload': uploadHandler,
  '/api/admin/site-config': siteConfigHandler,
  '/api/admin/ai-assist': aiAssistHandler,
};

const METHOD_MAP = {
  GET: 'onRequestGet',
  POST: 'onRequestPost',
  PUT: 'onRequestPut',
  DELETE: 'onRequestDelete',
};

const MUTATING_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

const API_CSP = "default-src 'none'; frame-ancestors 'none'";
const SANDBOX_ASSET_CSP = "default-src 'none'; sandbox; frame-ancestors 'none'";
const DEFAULT_PAGE_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

function withSecurityHeaders(response, isApi = false, pathname = '') {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (isApi) {
    headers.set('Content-Security-Policy', API_CSP);
    if (!headers.has('Cache-Control')) {
      headers.set('Cache-Control', 'no-store');
    }
  } else if (/^\/(?:covers|uploads)\//.test(pathname)) {
    headers.set('Content-Security-Policy', SANDBOX_ASSET_CSP);
  } else if (!headers.has('Content-Security-Policy')) {
    headers.set('Content-Security-Policy', DEFAULT_PAGE_CSP);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isSameOriginMutation(request, url) {
  const fetchSite = request.headers.get('Sec-Fetch-Site');
  if (fetchSite && fetchSite !== 'same-origin') {
    return false;
  }
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
      if (MUTATING_METHODS.has(request.method)) {
        if (!isSameOriginMutation(request, url)) {
          return withSecurityHeaders(
            new Response(JSON.stringify({ error: 'Origine richiesta non autorizzata.' }), {
              status: 403,
              headers: { 'Content-Type': 'application/json; charset=utf-8' },
            }),
            true
          );
        }

        if (pathname !== '/api/admin/logout') {
          const contentType = (request.headers.get('Content-Type') || '').toLowerCase();
          if (contentType.split(';')[0].trim() !== 'application/json') {
            return withSecurityHeaders(
              new Response(JSON.stringify({ error: 'Content-Type application/json richiesto.' }), {
                status: 415,
                headers: { 'Content-Type': 'application/json; charset=utf-8' },
              }),
              true
            );
          }
        }
      }

      const fnName = METHOD_MAP[request.method];
      const handler = fnName ? handlerModule[fnName] : null;
      if (typeof handler === 'function') {
        try {
          const res = await handler({ request, env, ctx });
          return withSecurityHeaders(res, true);
        } catch (err) {
          console.error(`Worker API error on ${pathname}:`, err);
          return withSecurityHeaders(
            new Response(JSON.stringify({ error: 'Errore interno del server.' }), {
              status: 500,
              headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
              },
            }),
            true
          );
        }
      }
      return withSecurityHeaders(
        new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        }),
        true
      );
    }

    if (pathname.startsWith('/api/')) {
      return withSecurityHeaders(
        new Response(JSON.stringify({ error: 'Not Found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        }),
        true
      );
    }

    if (env.ASSETS) {
      const assetRes = await env.ASSETS.fetch(request);
      return withSecurityHeaders(assetRes, false, pathname);
    }

    return withSecurityHeaders(new Response('Not Found', { status: 404 }), true);
  },
};
