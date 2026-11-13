import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {handle} from './api.mjs';
import {seal} from './policy.mjs';

const origin='https://jht.example';
const key=randomBytes(32);
const env={APP_ORIGIN:origin,SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',SESSION_ENCRYPTION_KEY:key.toString('base64')};
const user={id:'b373f6fe-cfec-408b-80a9-089df4b85440',email:'jht-demo@example.com',email_confirmed_at:'2026-01-01'};
const token=u=>'header.'+Buffer.from(JSON.stringify({sub:u.id,aal:'aal1'})).toString('base64url')+'.signature';
function setup({loginUser=user,verifiedUser=user,wrongPassword=false}={}){
  let lookups=0;
  const createClient=(_url,k)=>k==='service'?{
    rpc:async n=>{if(n==='jht_rate_limit')return {data:true}; if(n==='jht_admin_slot'){lookups++;return {data:null};}throw Error('Demo must never use live permissions');},
    from:()=>{throw Error('Demo must never touch live inventory');}
  }:{auth:{
    signInWithPassword:async ({password})=>wrongPassword||password!=='sample-password'?{data:{},error:{}}:{data:{user:loginUser,session:{access_token:token(loginUser),expires_at:Math.floor(Date.now()/1000)+3600}}},
    getUser:async access=>access===token(user)?{data:{user:verifiedUser}}:{error:{}}
  }};
  const request=(path,{cookie,body,method=body?'POST':'GET',sameOrigin=origin}={})=>handle(new Request(origin+path,{method,headers:{Origin:sameOrigin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body&&JSON.stringify(body)}),{ip:'127.0.0.1'},{env,createClient});
  return {request,lookups:()=>lookups};
}
const signIn={email:user.email,password:'sample-password'};
test('confirmed demo user gets a scoped password-only session, never a live administrator session',async()=>{
  const {request,lookups}=setup();
  const login=await request('/api/auth/login',{body:signIn});
  assert.equal(login.status,200);
  assert.deepEqual(await login.json(),{demo:true});
  const header=login.headers.get('set-cookie');
  assert.match(header,/^__Host-jht_demo=[A-Za-z0-9_-]+; Path=\/; Secure; HttpOnly; SameSite=Strict; Max-Age=1800$/);
  const cookie=header.split(';')[0];
  assert.equal((await request('/admin/demo/',{cookie})).status,200);
  assert.equal((await request('/api/auth/demo/session',{cookie})).status,200);
  for(const path of ['/api/admin/vehicles','/api/admin/site','/api/admin/bidders','/api/admin/auctions','/api/auth/mfa','/api/bidder/auth/session']){
    assert.equal((await request(path,{cookie})).status,401);
  }
  assert.equal((await request('/api/admin/vehicles',{cookie,body:{}})).status,401);
  assert.equal(lookups(),0);
  const logout=await request('/api/auth/demo/logout',{cookie,method:'POST'});
  assert.match(logout.headers.get('set-cookie'),/^__Host-jht_demo=;.*Max-Age=0$/);
  assert.equal((await request('/api/auth/demo/logout',{cookie,method:'POST',sameOrigin:'https://elsewhere.example'})).status,403);
});
test('only the exact confirmed demo identity can sign in and blocked, tampered or expired sessions cannot open the demo',async()=>{
  const {request}=setup();
  assert.equal((await request('/admin/demo/')).status,302);
  assert.equal((await request('/api/auth/demo/session')).status,401);
  for(const loginUser of [{...user,id:'other'},{...user,email:'other@example.com'},{...user,email_confirmed_at:null},{...user,banned_until:'2099-01-01'}]){
    assert.equal((await setup({loginUser}).request('/api/auth/login',{body:signIn})).status,401);
  }
  assert.equal((await setup({wrongPassword:true}).request('/api/auth/login',{body:signIn})).status,401);
  const login=await request('/api/auth/login',{body:signIn});
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const changed=cookie.replace(/=(.)/,(_,v)=>'='+(v==='A'?'B':'A'));
  assert.equal((await request('/api/auth/demo/session',{cookie:changed})).status,401);
  const expired='__Host-jht_demo='+seal({scope:'demo',access:token(user),expires:1},key);
  assert.equal((await request('/api/auth/demo/session',{cookie:expired})).status,401);
  assert.equal((await setup({verifiedUser:{...user,banned_until:'2099-01-01'}}).request('/api/auth/demo/session',{cookie})).status,401);
});
