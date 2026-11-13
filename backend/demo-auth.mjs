import {HttpError,requireSameOrigin,seal,unseal} from './policy.mjs';

const uid = 'b373f6fe-cfec-408b-80a9-089df4b85440';
const email = 'jht-demo@example.com';
const name = '__Host-jht_demo';
const lifetime = 30 * 60;

export function isDemoUser(user) {
  return user?.id === uid && user.email?.toLowerCase() === email &&
    !!user.email_confirmed_at && !(Date.parse(user.banned_until) > Date.now());
}

function cookie(value, age) {
  return name+'='+value+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age='+age;
}

export function demoLoginCookie(user, session, key) {
  if (!isDemoUser(user) || typeof session?.access_token !== 'string') throw new HttpError(401);
  const expires = Math.min(session.expires_at, Math.floor(Date.now()/1000)+lifetime);
  const age = expires-Math.floor(Date.now()/1000);
  if (!Number.isSafeInteger(age) || age<1) throw new HttpError(401);
  const value=seal({scope:'demo',access:session.access_token,expires},key);
  if(value.length>3600) throw new HttpError(503,'Demo sign-in is temporarily unavailable.');
  return cookie(value,age);
}

export async function verifyDemo(request, auth, key) {
  const matches=(request.headers.get('cookie')||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(name+'='));
  if(matches.length!==1) throw new HttpError(401);
  const value=matches[0].slice(name.length+1);
  if(!/^[A-Za-z0-9_-]{40,3600}$/.test(value)) throw new HttpError(401);
  const session=unseal(value,key);
  if(session.scope!=='demo' || typeof session.access!=='string' || !Number.isSafeInteger(session.expires) || session.expires<=Date.now()/1000) throw new HttpError(401);
  const {data,error}=await auth.auth.getUser(session.access);
  if(error || !isDemoUser(data?.user)) throw new HttpError(401);
}
export function demoLogoutCookie(request, origin) {
  requireSameOrigin(request,origin);
  return cookie('',0);
}
