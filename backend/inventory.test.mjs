import {Query} from './test-db.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import sharp from 'sharp';
import { handle } from './api.mjs';
import { seal,newSessionId,digest } from './policy.mjs';
import { sanitizeImage } from './images.mjs';
const owner='11111111-1111-4111-8111-111111111111';
const env={APP_ORIGIN:'https://jht.example',SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'server',SESSION_ENCRYPTION_KEY:randomBytes(32).toString('base64')};
const base={slug:'integration-car',brand:'Hyundai',model:'Tucson',ref:'TEST-001',body:'SUV',fuel:'Diesel',transmission:'Automatic',year:2022,price:9000,mileage:null,seats:5,status:'available',image:'assets/car-1.webp',gallery:['assets/car-1.webp','assets/car-1-1.webp']};
test('live inventory CRUD, homepage, notices, uploads, hidden URLs and browser grants work against PostgreSQL',async()=>{
  const db=new PGlite(),files=new Map();
  try{
    await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);");
    for(const name of ['202610040001_security.sql','202610040002_inventory.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
    await db.query('insert into auth.users values($1)',[owner]);await db.query('insert into jht_private.admin_slots values(1,$1,true,false)',[owner]);
    const id=newSessionId(),token='header.'+Buffer.from(JSON.stringify({sub:owner,aal:'aal2',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.signature';
    await db.query('select public.jht_session_put($1,$2,$3,now()+interval \'1 hour\')',[digest(id),owner,seal({access:token,refresh:'private-refresh'},Buffer.from(env.SESSION_ENCRYPTION_KEY,'base64'))]);
    const createClient=(_url,key)=>key==='server'?{
      from:table=>new Query(db,table),async rpc(name,args){try{const values=Object.values(args),{rows}=await db.query(`select public.${name}(${values.map((_,i)=>'$'+(i+1)).join(',')}) result`,values);return {data:rows[0].result,error:null};}catch(error){return {data:null,error};}},
      storage:{from(){return {async upload(path,bytes){files.set(path,bytes);return {error:null};},async download(path){return {data:files.has(path)?new Blob([files.get(path)]):null,error:null};},async remove(paths){paths.forEach(path=>files.delete(path));return {error:null};}};}}
    }:{auth:{async getUser(){return {data:{user:{id:owner,email_confirmed_at:'confirmed'}},error:null};},async setSession(){return {error:null};}}};
    async function call(path,body,method='GET',admin=true,mime='application/json'){
      return handle(new Request(env.APP_ORIGIN+path,{method,headers:{...(admin?{Cookie:'__Host-jht_session='+id}:{}),...(method==='GET'?{}:{Origin:env.APP_ORIGIN,'Content-Type':mime})},body:method==='GET'?undefined:mime==='application/json'?JSON.stringify(body):body}),{ip:'trusted-ip'},{env,createClient});
    }
    const created=await call('/api/admin/vehicles',base,'POST');assert.equal(created.status,200);let car=(await created.json()).vehicle;
    // Unknown writable/private fields and forged media references cannot enter the inventory.
    assert.equal((await call('/api/admin/vehicles',{...base,slug:'other',owner_id:owner},'POST')).status,400);
    assert.equal((await call('/api/admin/vehicles',{...base,slug:'other',image:'api/media/22222222-2222-4222-8222-222222222222.webp'},'POST')).status,400);
    await db.query(`update public.jht_vehicles set payload=payload||'{"internalNote":"SECRET_CANARY","location":"PRIVATE_POSITION"}'::jsonb where id=$1`,[car.id]);
    let publicRes=await call('/api/public/catalogue',null,'GET',false);assert.equal(publicRes.status,200);assert.doesNotMatch(await publicRes.clone().text(),/SECRET_CANARY|PRIVATE_POSITION|owner_id|version/);assert.equal((await publicRes.json()).vehicles.length,1);
    const detail=await call('/cars/integration-car/',null,'GET',false);assert.equal(detail.status,200);const html=await detail.text();assert.match(html,/car-1-1.webp/);assert.doesNotMatch(html,/SECRET_CANARY/);
    const home={featured_id:car.id,show_price:true,show_label:true,arrival_order:'manual',arrival_ids:[car.id]};assert.equal((await call('/api/admin/homepage',home,'PUT')).status,200);
    assert.equal((await call('/api/admin/homepage',{...home,arrival_ids:[car.id,car.id]},'PUT')).status,400);
    const photo=await sharp({create:{width:60,height:40,channels:3,background:'#65cbf5'}}).png().toBuffer();
    const upload=await call('/api/admin/uploads',photo,'POST',true,'image/png');assert.equal(upload.status,200);const photoPath=(await upload.json()).path;
    assert.equal((await call('/'+photoPath,null,'GET',false)).status,404);
    assert.equal((await call('/'+photoPath)).status,200);
    assert.equal((await call('/api/admin/uploads',photo,'POST',false,'image/png')).status,401);
    const updated=await call('/api/admin/vehicles/'+car.id,{...base,image:photoPath,gallery:[photoPath,'assets/car-1.webp'],version:car.version},'PUT');assert.equal(updated.status,200);car=(await updated.json()).vehicle;
    assert.equal((await call('/'+photoPath,null,'GET',false)).status,200);
    assert.equal((await call('/api/admin/vehicles/'+car.id,{...base,version:1},'PUT')).status,409);
    for(const status of ['sold','draft','archived']){
      const changed=await call('/api/admin/vehicles/'+car.id,{...base,status,image:photoPath,gallery:[photoPath],version:car.version},'PUT');assert.equal(changed.status,200);car=(await changed.json()).vehicle;
      assert.equal((await call('/cars/integration-car/',null,'GET',false)).status,404);
      assert.equal((await call('/'+photoPath,null,'GET',false)).status,404);
      const publicData=await (await call('/api/public/catalogue',null,'GET',false)).json();assert.equal(publicData.vehicles.length,0);assert.equal(publicData.homepage.featured_id,null);assert.deepEqual(publicData.homepage.arrival_ids,[]);
    }
    assert.equal((await call('/api/admin/vehicles/'+car.id,{version:car.version},'DELETE')).status,200);
    const noticeRes=await call('/api/admin/notices',{slug:'update',title:'<script>plain text</script>',content:'Hello <img src=x onerror=alert(1)>',status:'published'},'POST');assert.equal(noticeRes.status,200);const notice=(await noticeRes.json()).notice;
    const noticeHtml=await (await call('/notices/update/',null,'GET',false)).text();assert.match(noticeHtml,/&lt;img/);assert.doesNotMatch(noticeHtml,/<img src=x/);
    assert.equal((await call('/api/admin/notices/'+notice.id,{slug:'update',title:'Update',content:'Private draft',status:'draft',version:notice.version},'PUT')).status,200);
    assert.equal((await call('/notices/update/',null,'GET',false)).status,404);
    const events=await db.query("select action from jht_private.audit where action like '%.success'");assert.ok(events.rows.length>=8);
    for(const role of ['anon','authenticated']){await db.exec('set role '+role);for(const table of ['jht_vehicles','jht_homepage','jht_notices','jht_media'])await assert.rejects(()=>db.query('select * from public.'+table));await assert.rejects(()=>db.query('select public.jht_media_referenced($1,true)',[owner]));await db.exec('reset role');}
  }finally{await db.close();}
});
test('photo processing checks real file type, rejects executable content and drops original metadata',async()=>{
  const bytes=await sharp({create:{width:100,height:60,channels:3,background:'#fff'}}).jpeg().withMetadata().toBuffer();
  const clean=await sanitizeImage(bytes,'image/jpeg'),metadata=await sharp(clean.bytes).metadata();assert.equal(metadata.format,'webp');assert.equal(metadata.exif,undefined);assert.equal(metadata.icc,undefined);
  await assert.rejects(()=>sanitizeImage(bytes,'image/png'));
  await assert.rejects(()=>sanitizeImage(Buffer.from('<svg onload="alert(1)"></svg>'),'image/png'));
  const large=await sharp({create:{width:6000,height:6000,channels:3,background:'#fff'}}).png().toBuffer();await assert.rejects(()=>sanitizeImage(large,'image/png'));
});
