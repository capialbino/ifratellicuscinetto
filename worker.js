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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    const handlerModule = ROUTES[pathname];

    if (handlerModule) {
      const fnName = METHOD_MAP[request.method];
      const handler = fnName ? handlerModule[fnName] : null;
      if (typeof handler === 'function') {
        return handler({ request, env, ctx });
      }
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};
