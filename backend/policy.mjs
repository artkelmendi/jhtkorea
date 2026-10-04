import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message = 'Request denied.') { super(message); this.status = status; }
}
export function configuration(env = process.env) {
  const required = ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','APP_ORIGIN','SESSION_ENCRYPTION_KEY'];
  if (required.some(key => !env[key])) throw new HttpError(503, 'Management is not configured.');
  let origin, database;
  try { origin = new URL(env.APP_ORIGIN); database = new URL(env.SUPABASE_URL); } catch { throw new HttpError(503); }
  if (origin.protocol !== 'https:' || origin.origin !== env.APP_ORIGIN || database.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(database.hostname) || database.origin !== env.SUPABASE_URL) throw new HttpError(503);
  const key = Buffer.from(env.SESSION_ENCRYPTION_KEY, 'base64');
  if (key.length !== 32) throw new HttpError(503);
  return { origin: origin.origin, database: database.origin, anon: env.SUPABASE_ANON_KEY, service: env.SUPABASE_SERVICE_ROLE_KEY, key };
}
export const digest = value => createHash('sha256').update(value).digest('hex');
export const newSessionId = () => randomBytes(32).toString('base64url');
export function sessionCookie(id, maxAge = 3600) {
  if (id && !/^[A-Za-z0-9_-]{43}$/.test(id)) throw new HttpError(500);
  return `__Host-jht_session=${id}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
}
export function sessionId(request) {
  const values = (request.headers.get('cookie') || '').split(';').map(value => value.trim()).filter(value => value.startsWith('__Host-jht_session='));
  if (values.length !== 1) return null;
  const id = values[0].slice('__Host-jht_session='.length);
  return /^[A-Za-z0-9_-]{43}$/.test(id) ? id : null;
}
export function requireSameOrigin(request, origin) {
  if (new URL(request.url).origin !== origin || request.headers.get('origin') !== origin) throw new HttpError(403);
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') throw new HttpError(403);
}
export async function jsonBody(request, max = 32768) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) throw new HttpError(415);
  const reader = request.body?.getReader();
  let size = 0; const chunks = [];
  if (!reader) throw new HttpError(400);
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); throw new HttpError(413); }
    chunks.push(Buffer.from(value));
  }
  let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400);
  return body;
}
export function exactKeys(body, allowed) {
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new HttpError(400, 'Unexpected field.');
}
export function authorize({ user, slot, claims }, requireMfa = true) {
  if (!user?.id || !user.email_confirmed_at || !claims || claims.sub !== user.id) throw new HttpError(401);
  if (!slot || slot.user_id !== user.id || ![1,2].includes(slot.slot)) throw new HttpError(403);
  if (requireMfa && (!slot.enabled || claims.aal !== 'aal2')) throw new HttpError(403, 'Verified administrator access and MFA are required.');
  return user.id;
}
export function seal(value, key) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('jht-session-v1'));
  const payload = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), payload]).toString('base64url');
}
export function unseal(value, key) {
  try {
    const bytes = Buffer.from(value, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0,12));
    decipher.setAAD(Buffer.from('jht-session-v1')); decipher.setAuthTag(bytes.subarray(12,28));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
  } catch { throw new HttpError(401); }
}
export const noStoreHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Netlify-CDN-Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=(), payment=(), usb=()',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
};
export function response(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...noStoreHeaders, 'Content-Type': 'application/json; charset=utf-8', ...extra } });
}
