import { clearSessionCookie, jsonResponse } from '../../../lib/admin-server.js';

export async function onRequestPost({ request }) {
  return jsonResponse(
    { ok: true },
    200,
    { 'Set-Cookie': clearSessionCookie(request) }
  );
}
