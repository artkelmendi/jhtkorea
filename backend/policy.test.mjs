import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { authorize, configuration, seal, unseal, requireSameOrigin, sessionCookie, sessionId, newSessionId, jsonBody, exactKeys } from './policy.mjs';
const approved = { user: { id: 'owner', email_confirmed_at: '2026-10-04' }, slot: { user_id:'owner', slot:1, enabled:true }, claims:{sub:'owner',aal:'aal2'} };
test('authentication and MFA default deny', () => {
  for (const state of [{}, {...approved,user:null}, {...approved,claims:{sub:'attacker',aal:'aal2'}}, {...approved,slot:null}, {...approved,slot:{...approved.slot,enabled:false}}, {...approved,claims:{sub:'owner',aal:'aal1'}}, {...approved,slot:{...approved.slot,slot:3}}, {...approved,user:{id:'owner'}}]) assert.throws(()=>authorize(state));
  assert.equal(authorize(approved),'owner');
});
test('limited pre-MFA access still requires a confirmed, allowlisted user', () => {
  assert.equal(authorize({...approved,claims:{sub:'owner',aal:'aal1'}},false),'owner');
  assert.throws(()=>authorize({...approved,slot:null},false));
});
test('configuration fails closed without provider keys or HTTPS', () => {
  assert.throws(()=>configuration({}));
  const env={APP_ORIGIN:'https://jht.example',SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'server',SESSION_ENCRYPTION_KEY:randomBytes(32).toString('base64')};
  assert.equal(configuration(env).origin,'https://jht.example');
  assert.throws(()=>configuration({...env,APP_ORIGIN:'http://jht.example'}));
  assert.throws(()=>configuration({...env,SESSION_ENCRYPTION_KEY:'weak'}));
});
test('cookie is opaque, host-only, secure, HTTP-only and strict same-site', () => {
  const id=newSessionId(), cookie=sessionCookie(id);
  assert.equal(id.length,43); assert.match(cookie,/Secure; HttpOnly; SameSite=Strict/); assert.doesNotMatch(cookie,/Domain=/);
  assert.equal(sessionId(new Request('https://jht.example',{headers:{cookie}})),id);
  assert.equal(sessionId(new Request('https://jht.example',{headers:{cookie:'__Host-jht_session=x'}})),null);
  assert.equal(sessionId(new Request('https://jht.example',{headers:{cookie:`${cookie}; __Host-jht_session=${id}`}})),null);
});
test('rejects cross-site requests, missing origins and spoofed hostnames', () => {
  const origin='https://jht.example';
  requireSameOrigin(new Request(origin,{headers:{origin,'sec-fetch-site':'same-origin'}}),origin);
  for(const req of [new Request(origin),new Request(origin,{headers:{origin:'https://evil.example'}}),new Request(origin,{headers:{origin,'sec-fetch-site':'cross-site'}}),new Request('https://evil.example',{headers:{origin}})]) assert.throws(()=>requireSameOrigin(req,origin));
});
test('session encryption detects tampering and wrong keys', () => {
  const key=randomBytes(32), encoded=seal({access:'private'},key);
  assert.deepEqual(unseal(encoded,key),{access:'private'});assert.ok(!encoded.includes('private'));
  assert.throws(()=>unseal(encoded,randomBytes(32)));assert.throws(()=>unseal(encoded.slice(0,-4)+'AAAA',key));
});
test('body validation rejects oversized input, arrays, wrong MIME and extra fields', async () => {
  const make=(body,type='application/json')=>new Request('https://jht.example',{method:'POST',body,headers:{'content-type':type}});
  assert.deepEqual(await jsonBody(make('{"title":"safe"}')),{title:'safe'});
  await assert.rejects(()=>jsonBody(make('[]')));await assert.rejects(()=>jsonBody(make('{}','text/plain')));await assert.rejects(()=>jsonBody(make('{"x":"'+ 'a'.repeat(40000)+'"}')));
  assert.throws(()=>exactKeys({title:'safe',role:'admin'},['title']));
});
