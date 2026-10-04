import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID,randomBytes} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {handle} from './api.mjs';
import {seal,digest,newSessionId} from './policy.mjs';
const owner=randomUUID(),user1=randomUUID(),user2=randomUUID(),stranger=randomUUID();
const env={APP_ORIGIN:'https://jht.example',SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'server',SESSION_ENCRYPTION_KEY:randomBytes(32).toString('base64')};
async function fixture(){
 const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');
 for(const f of ['202610040001_security.sql','202610040002_inventory.sql','202610050001_auctions.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
 for(const u of [owner,user1,user2,stranger])await db.query('insert into auth.users values($1)',[u]);
 await db.query('insert into jht_private.admin_slots values(1,$1,true,false)',[owner]);
 const rpc=async(name,args)=>{const values=Object.values(args).map(v=>v&&typeof v==='object'&&!Array.isArray(v)?JSON.stringify(v):v);if(name==='jht_auction_save')values[8]=JSON.stringify(args.p_lots);const {rows}=await db.query(`select public.${name}(${values.map((_,i)=>'$'+(i+1)).join(',')}) result`,values);return rows[0].result;};
 const bidders=[];for(const [i,u] of [user1,user2,stranger].entries()){const {rows}=await db.query('insert into jht_private.bidders(user_id,email,name,created_by,activation_pending) values($1,$2,$3,$4,false) returning id',[u,`member${i}@example.com`,'Member '+i,owner]);bidders.push(rows[0].id);}
 const cars=[];for(let i=0;i<2;i++){const payload={brand:'Hyundai',model:'Tucson '+i,year:2022,image:'assets/car-1.webp',gallery:['assets/car-1.webp'],internalNote:'SECRET_NOTE',location:'SECRET_LOCATION'};const {rows}=await db.query('insert into public.jht_vehicles(slug,status,payload) values($1,$2,$3) returning id',['car-'+i,'available',JSON.stringify(payload)]);cars.push(rows[0].id);}
 async function save(status='scheduled',slug='collection',id=null,version=1){return rpc('jht_auction_save',{p_actor:owner,p_id:id,p_version:version,p_title:'Private collection',p_slug:slug,p_start:new Date(Date.now()+3600000).toISOString(),p_end:new Date(Date.now()+7200000).toISOString(),p_status:status,p_lots:cars.map(vehicle_id=>({vehicle_id,opening_amount:1000,increment:100})),p_members:bidders.slice(0,2)});}
 return {db,rpc,bidders,cars,save};
}
test('SQL enforces invitation access, multi-car schedules, bid ordering, idempotency, three-minute extension and history',async()=>{
 const {db,rpc,bidders,cars,save}=await fixture();try{
 const created=await save();assert.ok(created.id);assert.equal((await save('scheduled','overlapping')).error,'overlap');
 const privateRoom=await rpc('jht_auction_room',{p_actor:bidders[0],p_admin:false,p_slug:'collection'});assert.equal(privateRoom.lots.length,2);assert.doesNotMatch(JSON.stringify(privateRoom),/SECRET_NOTE|SECRET_LOCATION|member\d@example.com|created_by|highest_bidder/);
 assert.equal((await rpc('jht_auction_room',{p_actor:bidders[2],p_admin:false,p_slug:'collection'})).error,'missing');
 assert.equal((await rpc('jht_auction_list',{p_actor:bidders[2],p_admin:false})).sessions.length,0);
 assert.equal((await rpc('jht_auction_list',{p_actor:bidders[0],p_admin:true})).error,'denied');
 const lot=privateRoom.lots[0].id;
 const media=randomUUID();await db.query("update jht_private.auction_lots set snapshot=snapshot||jsonb_build_object('image',$1::text) where id=$2",['api/media/'+media+'.webp',lot]);assert.equal(await rpc('jht_bid_media',{p_bidder:bidders[0],p_media:media}),true);assert.equal(await rpc('jht_bid_media',{p_bidder:bidders[2],p_media:media}),false);
 assert.ok((await save('draft','private-draft')).id);assert.equal((await rpc('jht_auction_room',{p_actor:bidders[0],p_admin:false,p_slug:'private-draft'})).error,'missing');
 const bid=(b,amount,id=randomUUID())=>rpc('jht_place_bid',{p_bidder:b,p_lot:lot,p_amount:amount,p_request:id});
 assert.equal((await bid(bidders[0],1000)).error,'closed');
 await db.query("update jht_private.auctions set starts_at=now()-interval '1 minute',ends_at=now()+interval '1 minute' where id=$1",[created.id]);await db.query("update jht_private.auction_lots set closes_at=now()+interval '1 minute' where auction_id=$1",[created.id]);
 assert.equal((await bid(bidders[2],1000)).error,'denied');
 const request=randomUUID(),before=Date.now(),accepted=await bid(bidders[0],1000,request);assert.equal(accepted.accepted,true);const extended=Date.parse(accepted.closes_at)-before;assert.ok(extended>=179000&&extended<=181000);
 assert.equal((await bid(bidders[0],1000,request)).replayed,true);assert.equal((await bid(bidders[0],1100,request)).error,'replay');assert.equal((await bid(bidders[0],1100)).error,'leading');assert.equal((await bid(bidders[1],1050)).minimum,1100);
 assert.equal((await bid(bidders[1],1100)).accepted,true);
 // Concurrent equal-price requests leave one accepted highest bid, never two.
 const results=await Promise.all([bid(bidders[0],1200),bid(bidders[1],1200)]);assert.equal(results.filter(r=>r.accepted).length,1);assert.equal(results.filter(r=>r.error).length,1);
 assert.equal((await save('scheduled','collection',created.id)).error,'locked');
 await assert.rejects(()=>db.query("update public.jht_vehicles set status='sold' where id=$1",[cars[0]]));
 await assert.rejects(()=>db.query('delete from public.jht_vehicles where id=$1',[cars[0]]));
 assert.equal((await rpc('jht_auction_control',{p_actor:owner,p_id:lot,p_action:'confirm',p_version:1})).error,'locked');
 await db.query("update jht_private.auction_lots set closes_at=now()-interval '1 second' where id=$1",[lot]);
 assert.equal((await bid(bidders[1],1300)).error,'closed');
 assert.equal((await rpc('jht_auction_control',{p_actor:owner,p_id:lot,p_action:'confirm',p_version:1})).saved,true);
 const v=await db.query('select status from public.jht_vehicles where id=(select vehicle_id from jht_private.auction_lots where id=$1)',[lot]);assert.equal(v.rows[0].status,'reserved');
 assert.equal((await rpc('jht_auction_control',{p_actor:owner,p_id:lot,p_action:'confirm',p_version:1})).error,'locked');
 assert.equal((await rpc('jht_auction_control',{p_actor:owner,p_id:created.id,p_action:'cancel',p_version:1})).saved,true);assert.equal((await db.query('select count(*)::int n from jht_private.bids')).rows[0].n,3);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);for(const table of ['bidders','bid_sessions','auctions','auction_members','auction_lots','bids'])await assert.rejects(()=>db.query('select * from jht_private.'+table));await assert.rejects(()=>rpc('jht_auction_list',{p_actor:bidders[0],p_admin:false}));await db.exec('reset role');}
 }finally{await db.close();}
});
test('HTTP bidder/admin sessions are isolated; CSRF, forged requests, revocation and anonymous access are denied',async()=>{
 const {db,rpc,bidders,save}=await fixture();try{
 const created=await save();await db.query("update jht_private.auctions set starts_at=now()-interval '1 minute' where id=$1",[created.id]);
 const token=u=>'header.'+Buffer.from(JSON.stringify({sub:u,aal:u===owner?'aal2':'aal1',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.signature';
 const adminId=newSessionId(),bidId=newSessionId();await rpc('jht_session_put',{p_hash:digest(adminId),p_user:owner,p_tokens:seal({access:token(owner),refresh:'admin'},Buffer.from(env.SESSION_ENCRYPTION_KEY,'base64')),p_expires:new Date(Date.now()+3600000).toISOString()});await rpc('jht_bid_session_put',{p_hash:digest(bidId),p_bidder:bidders[0],p_tokens:seal({kind:'bidder',access:token(user1),refresh:'bid'},Buffer.from(env.SESSION_ENCRYPTION_KEY,'base64')),p_expires:new Date(Date.now()+3600000).toISOString()});
 const createClient=(_url,key)=>key==='server'?{rpc:async(name,args)=>{try{return {data:await rpc(name,args),error:null};}catch(error){return {data:null,error};}}}:{auth:{setSession:async()=>({error:null}),getUser:async t=>({data:{user:{id:JSON.parse(Buffer.from(t.split('.')[1],'base64url')).sub,email_confirmed_at:'yes'}},error:null})}};
 const call=(path,body,cookie='',origin=env.APP_ORIGIN)=>handle(new Request(env.APP_ORIGIN+path,{method:body?'POST':'GET',headers:{cookie,...(body?{Origin:origin,'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),{ip:'test-ip'},{env,createClient});
 assert.equal((await call('/api/bidder/sessions')).status,401);assert.equal((await call('/api/bidder/sessions',null,'__Host-jht_session='+adminId)).status,401);assert.equal((await call('/api/admin/auctions',null,'__Host-jht_bid_session='+bidId)).status,401);
 const cookie='__Host-jht_bid_session='+bidId;assert.equal((await call('/api/bidder/auth/session',null,cookie)).status,200);assert.equal((await call('/api/admin/auctions',null,'__Host-jht_session='+adminId)).status,200);
 const room=await (await call('/api/bidder/sessions/collection',null,cookie)).json(),lot=room.lots[0].id;
 assert.equal((await call(`/api/bidder/lots/${lot}/bids`,{amount:1000,request_id:randomUUID()},cookie,'https://attacker.example')).status,403);
 assert.equal((await call(`/api/bidder/lots/${lot}/bids`,{amount:1000.1,request_id:randomUUID()},cookie)).status,400);
 assert.equal((await call(`/api/bidder/lots/${lot}/bids`,{amount:1000,request_id:randomUUID(),bidder_id:bidders[1]},cookie)).status,400);
 const id=randomUUID();assert.equal((await call(`/api/bidder/lots/${lot}/bids`,{amount:1000,request_id:id},cookie)).status,200);assert.equal((await call(`/api/bidder/lots/${lot}/bids`,{amount:1000,request_id:id},cookie)).status,200);
 await rpc('jht_bidder_manage',{p_actor:owner,p_id:bidders[0],p_enabled:false});assert.equal((await call('/api/bidder/sessions',null,cookie)).status,401);
 const pending=await rpc('jht_bidder_register',{p_actor:owner,p_name:'Pending',p_email:'pending@example.com'});assert.equal((await rpc('jht_bidder_attach',{p_actor:owner,p_id:pending.id,p_user:owner})).error,'denied');
 }finally{await db.close();}
});

test('bidder login and invitation activation verify provider identity and never grant admin access',async()=>{
 const {db,rpc,bidders}=await fixture();try{
 const token=u=>'h.'+Buffer.from(JSON.stringify({sub:u,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.s';let signedUser=user1,sessionUser=user1,passwordChanges=0;
 const createClient=(_u,k)=>k==='server'?{rpc:async(n,a)=>{try{return {data:await rpc(n,a),error:null};}catch(error){return {data:null,error};}}}:{auth:{
 signInWithPassword:async()=>({data:{user:{id:signedUser,email_confirmed_at:'yes'},session:{access_token:token(signedUser),refresh_token:'r'}},error:null}),
 getUser:async t=>({data:{user:{id:JSON.parse(Buffer.from(t.split('.')[1],'base64url')).sub,email_confirmed_at:'yes',invited_at:'yes'}},error:null}),
 setSession:async()=>({data:{user:{id:sessionUser},session:{access_token:token(sessionUser),refresh_token:'r'}},error:null}),
 updateUser:async()=>{passwordChanges++;return {error:null};}}};
 const call=(path,body)=>handle(new Request(env.APP_ORIGIN+'/api/bidder/auth/'+path,{method:'POST',headers:{Origin:env.APP_ORIGIN,'Content-Type':'application/json'},body:JSON.stringify(body)}),{ip:'invitation-test'},{env,createClient});
 const login=await call('login',{email:'member0@example.com',password:'sample'});assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/^__Host-jht_bid_session=[A-Za-z0-9_-]{43}; Path=\/; Secure; HttpOnly; SameSite=Strict/);assert.doesNotMatch(await login.text(),/access_token|refresh_token|admin|user_id/);
 signedUser=owner;assert.equal((await call('login',{email:'owner@example.com',password:'sample'})).status,401);
 await db.query('update jht_private.bidders set activation_pending=true where id=$1',[bidders[0]]);
 signedUser=user1;assert.equal((await call('login',{email:'member0@example.com',password:'sample'})).status,401);
 const body={accessToken:token(user1),refreshToken:'r',password:'A sample passphrase of at least sixteen characters'};
 sessionUser=stranger;assert.equal((await call('activate',body)).status,401);assert.equal(passwordChanges,0);
 sessionUser=user1;assert.equal((await call('activate',{...body,password:'short'})).status,400);assert.equal((await call('activate',body)).status,200);assert.equal(passwordChanges,1);assert.equal((await call('activate',body)).status,403);
 const pending=await rpc('jht_bidder_register',{p_actor:owner,p_name:'Failed invitation',p_email:'failed@example.com'});assert.equal((await rpc('jht_bidder_register',{p_actor:owner,p_name:'Retry',p_email:'failed@example.com'})).id,pending.id);
 const list=await rpc('jht_bidder_list',{p_actor:owner});assert.equal(list.bidders.find(b=>b.id===pending.id).invite_delivered,false);assert.doesNotMatch(JSON.stringify(list),/user_id|created_by/);
 }finally{await db.close();}
});
