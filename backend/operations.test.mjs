import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {Query} from './test-db.mjs';
import {handle} from './api.mjs';
import {seal,digest,newSessionId} from './policy.mjs';
import {validateSite,publicSite,stockCSV} from './operations.mjs';
const owner='11111111-1111-4111-8111-111111111111',second='22222222-2222-4222-8222-222222222222';
const data={phone:'+82 10 3656 3439',email:'team@example.com',address:'469, Aam-daero, Incheon',hours:'Visits by appointment.',announcement:{enabled:false,text:'PRIVATE_DRAFT_CANARY',startsAt:null,endsAt:null},faq:[{group:'Finding a car',question:'Can you source another model?',answer:'Tell us what you need.'}],version:1};
test('website edits validate dates, field bounds and categories without accepting extra controls',()=>{
 assert.deepEqual(validateSite(data).phone,data.phone);
 for(const change of [{owner_id:owner},{version:0},{phone:'javascript:alert(1)'},{phone:'+123'},{email:'team?subject=x@example.com'},{faq:[]},{faq:Array(21).fill(data.faq[0])},{faq:[data.faq[0],data.faq[0]]},{faq:[{...data.faq[0],group:'Invalid'}]},{hours:'\u0000'},{announcement:{...data.announcement,enabled:true,text:''}},{announcement:{...data.announcement,startsAt:'2026-02-31T10:00:00Z'}},{announcement:{...data.announcement,startsAt:'2026-10-05T10:00:00Z',endsAt:'2026-10-05T09:00:00Z'}}])assert.throws(()=>validateSite({...data,...change}),{status:400});
});
test('public website projection excludes disabled, scheduled and expired draft announcements and private fields',()=>{
 const payload={...data,privateNote:'SECRET_CANARY',faq:[{...data.faq[0],privateNote:'SECRET_CANARY'}]};
 assert.equal(publicSite(payload).announcement,null);assert.doesNotMatch(JSON.stringify(publicSite(payload)),/PRIVATE_DRAFT_CANARY|SECRET_CANARY|version/);
 const scheduled={...payload,announcement:{enabled:true,text:'Shipping update',startsAt:'2026-10-05T10:00:00.000Z',endsAt:'2026-10-05T11:00:00.000Z'}};
 assert.equal(publicSite(scheduled,Date.parse('2026-10-05T09:59:59Z')).announcement,null);
 assert.deepEqual(publicSite(scheduled,Date.parse('2026-10-05T10:00:00Z')).announcement,{text:'Shipping update'});
 assert.equal(publicSite(scheduled,Date.parse('2026-10-05T11:00:00Z')).announcement,null);
});
test('stock CSV quotes commas and newlines, blocks spreadsheet formulas and drops private fields',()=>{
 const csv=stockCSV([{slug:'safe-car',status:'draft',payload:{ref:' =HYPERLINK("https://bad.example")',brand:'+CMD',model:'Kia, "Sportage"\nEdition',year:2023,price:9500,internalNote:'SECRET_CANARY',location:'SECRET_CANARY'}}]);
 assert.ok(csv.startsWith('\uFEFF'));assert.match(csv,/"' =HYPERLINK/);assert.match(csv,/"'\+CMD"/);assert.match(csv,/"Kia, ""Sportage""\nEdition"/);assert.match(csv,/"9500"/);assert.doesNotMatch(csv,/SECRET_CANARY|internalNote|location/);
});
test('real SQL website saves, stock exports and activity are MFA-protected, atomic, complete and private',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');
  for(const name of ['202610040001_security.sql','202610040002_inventory.sql','202610050001_auctions.sql','202610050002_admin_operations.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
  await db.query('insert into auth.users values($1),($2)',[owner,second]);await db.query('insert into jht_private.admin_slots values(1,$1,true,false),(2,$2,true,false)',[owner,second]);
  const env={APP_ORIGIN:'https://jht.example',SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'server',SESSION_ENCRYPTION_KEY:randomBytes(32).toString('base64')},tokens=new Map(),sessions={};
  for(const [name,user,aal] of [['owner',owner,'aal2'],['second',second,'aal2'],['aal1',owner,'aal1']]){
   const id=newSessionId(),token='header.'+Buffer.from(JSON.stringify({sub:user,aal,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.signature';tokens.set(token,user);sessions[name]=id;
   await db.query('select public.jht_session_put($1,$2,$3,now()+interval \'1 hour\')',[digest(id),user,seal({access:token,refresh:'SECRET_REFRESH_CANARY'},Buffer.from(env.SESSION_ENCRYPTION_KEY,'base64'))]);
  }
  const createClient=(_url,key)=>key==='server'?{from:table=>new Query(db,table),async rpc(name,args){try{const values=Object.values(args).map(v=>v&&typeof v==='object'?JSON.stringify(v):v),{rows}=await db.query(`select public.${name}(${values.map((_,i)=>'$'+(i+1)).join(',')}) result`,values);return {data:rows[0].result,error:null};}catch(error){return {data:null,error};}}}:{auth:{async getUser(token){return tokens.has(token)?{data:{user:{id:tokens.get(token),email_confirmed_at:'confirmed'}},error:null}:{data:{user:null},error:Error('Forged token')};},async setSession(){return {error:null};}}};
  const call=(path,body,method='GET',who='owner',origin=env.APP_ORIGIN)=>handle(new Request(env.APP_ORIGIN+path,{method,headers:{...(sessions[who]?{Cookie:'__Host-jht_session='+sessions[who]}:{}),...(method==='GET'?{}:{Origin:origin,'Content-Type':'application/json'})},body:method==='GET'?undefined:JSON.stringify(body)}),{ip:'trusted-ip'},{env,createClient});
  for(const path of ['/api/admin/site','/api/admin/activity','/api/admin/stock.csv']){
   assert.equal((await call(path,null,'GET','anonymous')).status,401);assert.equal((await call(path,null,'GET','aal1')).status,403);
  }
  assert.equal((await call('/api/admin/site',data,'PUT','owner','https://evil.example')).status,403);
  const initial=await(await call('/api/admin/site')).json();assert.equal(initial.version,1);
  const saved=await call('/api/admin/site',data,'PUT');assert.equal(saved.status,200);const savedData=await saved.json();assert.equal(savedData.version,2);
  assert.equal((await call('/api/admin/site',data,'PUT','second')).status,409);
  await db.query(`update public.jht_site_settings set payload=payload||'{"privateNote":"SECRET_CANARY"}'::jsonb`);
  const projection=await call('/api/public/site',null,'GET','anonymous');assert.equal(projection.status,200);const publicText=await projection.text();assert.doesNotMatch(publicText,/SECRET_CANARY|PRIVATE_DRAFT_CANARY|version|updatedAt/);
  const concurrent=await Promise.all([call('/api/admin/site',{...data,phone:'+82 10 1111 1111',version:2},'PUT'),call('/api/admin/site',{...data,phone:'+82 10 2222 2222',version:2},'PUT','second')]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
  assert.equal((await db.query("select count(*)::int n from jht_private.audit where action='site.update.success'")).rows[0].n,2);
  const car={slug:'original',brand:'Hyundai',model:'Tucson',ref:'ORIGINAL',body:'SUV',fuel:'Diesel',transmission:'Automatic',year:2022,price:9000,mileage:null,seats:5,status:'available',image:'assets/car-1.webp',gallery:['assets/car-1.webp']};
  const original=(await(await call('/api/admin/vehicles',car,'POST')).json()).vehicle;
  const copied=(await(await call('/api/admin/vehicles',{...car,slug:'draft-copy',ref:'COPY-001',status:'draft'},'POST')).json()).vehicle;assert.ok(copied.id!==original.id);
  assert.equal((await call('/cars/draft-copy/',null,'GET','anonymous')).status,404);
  const publicCars=await(await call('/api/public/catalogue',null,'GET','anonymous')).json();assert.equal(publicCars.vehicles.length,1);assert.equal(publicCars.vehicles[0].id,original.id);
  await db.query(`update public.jht_vehicles set payload=payload||'{"internalNote":"SECRET_CANARY","location":"SECRET_LOCATION"}'::jsonb`);
  await db.query(`insert into public.jht_vehicles(slug,status,payload) select 'bulk-'||i,'archived',$1::jsonb from generate_series(1,1001) i`,[JSON.stringify({...car,ref:'EXPORT'})]);
  const exportResponse=await call('/api/admin/stock.csv');assert.equal(exportResponse.status,200);assert.match(exportResponse.headers.get('content-type'),/text\/csv/);assert.match(exportResponse.headers.get('cache-control'),/no-store/);
  const csv=await exportResponse.text();assert.equal(csv.trimEnd().split('\r\n').length,1004);assert.match(csv,/COPY-001/);assert.doesNotMatch(csv,/SECRET_CANARY|SECRET_LOCATION|SECRET_REFRESH_CANARY/);
  await call('/api/admin/vehicles/'+original.id,{version:original.version},'DELETE');
  await db.query(`insert into jht_private.audit(actor,action,record_id,record_label) select $1,'site.update.success','site','Update '||i from generate_series(1,60) i`,[owner]);
  const first=await(await call('/api/admin/activity?category=all')).json();assert.equal(first.events.length,50);assert.ok(first.nextCursor);assert.ok(first.events.every(row=>!Object.hasOwn(row,'actor_id')&&!Object.hasOwn(row,'record_id')));
  const older=await(await call('/api/admin/activity?category=all&before='+first.nextCursor)).json();assert.ok(older.events.length);assert.ok(older.events.every(item=>!first.events.some(other=>other.id===item.id)));
  const inventory=await(await call('/api/admin/activity?category=inventory')).json();assert.ok(inventory.events.some(item=>item.action==='stock.export.success'));assert.ok(inventory.events.some(item=>item.action==='vehicle.delete.success'&&item.record.includes('ORIGINAL')));assert.doesNotMatch(JSON.stringify(inventory),new RegExp(owner+'|'+second+'|SECRET_CANARY|SECRET_REFRESH_CANARY'));
  assert.equal((await call('/api/admin/activity?before=0')).status,400);assert.equal((await call('/api/admin/activity?category=all&category=website')).status,400);
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);await assert.rejects(()=>db.query('select * from public.jht_site_settings'));
   for(const [name,args] of [['jht_activity_feed',"null,'all'"],['jht_stock_export',"'"+owner+"'"],['jht_site_save',"'"+owner+"',3,'{}'"]])await assert.rejects(()=>db.query('select public.'+name+'('+args+')'));await db.exec('reset role');
  }
  await db.query(`insert into public.jht_vehicles(slug,status,payload) select 'excess-'||i,'draft',$1::jsonb from generate_series(1,4000) i`,[JSON.stringify(car)]);assert.equal((await call('/api/admin/stock.csv')).status,413);
  await db.query('update jht_private.admin_slots set enabled=false where user_id=$1',[owner]);assert.equal((await call('/api/admin/site')).status,403);assert.equal((await call('/api/admin/activity')).status,403);assert.equal((await call('/api/admin/stock.csv')).status,403);
 }finally{await db.close();}
});
