import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { handle } from './api.mjs';
import { seal, newSessionId } from './policy.mjs';
const env={APP_ORIGIN:'https://jht.example',SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'server',SESSION_ENCRYPTION_KEY:randomBytes(32).toString('base64')};
test('unconfigured API fails closed without a network connection',async()=>{
  const res=await handle(new Request('https://jht.example/api/admin/vehicles'),{},{env:{}});
  assert.equal(res.status,503);assert.match(res.headers.get('cache-control'),/no-store/);assert.equal(res.headers.get('access-control-allow-origin'),null);
});
test('unauthenticated callers cannot reach any admin route or spoof a role',async()=>{
  let databaseTouched=false;
  const createClient=()=>({from(){databaseTouched=true;throw Error('Should never query');}});
  for(const path of ['/api/admin/vehicles','/api/admin/homepage','/api/admin/roles','/api/admin/uploads']) {
    const res=await handle(new Request('https://jht.example'+path,{headers:{'x-admin':'true'}}),{},{env,createClient});
    assert.equal(res.status,401);assert.equal(databaseTouched,false);
  }
});
test('same-origin and HTTP method enforcement precede provider operations',async()=>{
  const createClient=()=>{throw Error('Must not connect');};
  const req=new Request('https://jht.example/api/admin/vehicles',{method:'POST',body:'{}',headers:{origin:'https://evil.example','content-type':'application/json'}});
  assert.equal((await handle(req,{},{env,createClient})).status,403);
  assert.equal((await handle(new Request('https://jht.example/api/admin/vehicles',{method:'OPTIONS'}),{},{env,createClient})).status,405);
});

test('forged tokens, AAL1, revoked slots and expired sessions never read inventory',async()=>{
  const userId='11111111-1111-4111-8111-111111111111';
  for(const scenario of ['forged','password-only','slot-revoked','session-expired','allowed']) {
    let inventoryRead=false;
    const token='header.'+Buffer.from(JSON.stringify({sub:userId,aal:scenario==='password-only'?'aal1':'aal2'})).toString('base64url')+'.signature';
    const encrypted=seal({access:token,refresh:'private-refresh'},Buffer.from(env.SESSION_ENCRYPTION_KEY,'base64'));
    const createClient=(_url,key)=>key==='server'?{
      async rpc(name) {
        if(name==='jht_session_get') return {data:scenario==='session-expired'?null:{user_id:userId,encrypted_tokens:encrypted}};
        if(name==='jht_admin_slot') return {data:{slot:1,user_id:userId,enabled:scenario!=='slot-revoked'}};
        if(name==='jht_rate_limit') return {data:true};
        throw Error('Unexpected database operation');
      },
      from(){inventoryRead=true;return {select(){return this;},order(){return this;},async limit(){return {data:[],error:null};}};}
    }:{auth:{
      async getUser(){return scenario==='forged'?{error:new Error('Invalid signature'),data:{user:null}}:{data:{user:{id:userId,email_confirmed_at:'confirmed'}},error:null};},
      async setSession(){return {error:null};}
    }};
    const res=await handle(new Request('https://jht.example/api/admin/vehicles',{headers:{cookie:'__Host-jht_session='+newSessionId()}}),{},{env,createClient});
    assert.equal(res.status,scenario==='allowed'?200:['forged','session-expired'].includes(scenario)?401:403);
    assert.equal(inventoryRead,scenario==='allowed');
    assert.doesNotMatch(await res.text(),/private-refresh|signature|encrypted_tokens/);
  }
});

test('invitation setup cannot change a password without a confirmed allowlisted bootstrap identity',async()=>{
  const userId='11111111-1111-4111-8111-111111111111';
  const token='header.'+Buffer.from(JSON.stringify({sub:userId,aal:'aal1'})).toString('base64url')+'.signature';
  for(const scenario of ['invalid-token','not-allowlisted','already-active']) {
    let passwordChanged=false;
    const createClient=(_url,key)=>key==='server'?{async rpc(name){return {data:name==='jht_rate_limit'?true:scenario==='not-allowlisted'?null:{slot:1,user_id:userId,enabled:true,allow_enrollment:false}};}}:{auth:{async getUser(){return {error:scenario==='invalid-token'?new Error('invalid'):null,data:{user:{id:userId,invited_at:'invited',email_confirmed_at:'confirmed'}}};},async updateUser(){passwordChanged=true;}}};
    const request=new Request('https://jht.example/api/auth/activate',{method:'POST',headers:{Origin:env.APP_ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({accessToken:token,refreshToken:'private',password:'a long unique passphrase'})});
    assert.equal((await handle(request,{ip:'trusted-ip'},{env,createClient})).status,scenario==='invalid-token'?401:403);
    assert.equal(passwordChanged,false);
  }
});
