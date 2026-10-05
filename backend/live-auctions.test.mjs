import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID,randomBytes} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {handle} from './api.mjs';
import {Query} from './test-db.mjs';
import {seal,digest,newSessionId} from './policy.mjs';
import {auctionStream,liveCursor} from './live-auctions.mjs';
async function setup(){
 const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');
 for(const f of ['202610040001_security.sql','202610040002_inventory.sql','202610050001_auctions.sql','202610050002_admin_operations.sql','202610060001_live_auction_controls.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
 const owner=randomUUID(),users=[randomUUID(),randomUUID(),randomUUID()];for(const id of [owner,...users])await db.query('insert into auth.users values($1)',[id]);await db.query('insert into jht_private.admin_slots values(1,$1,true,false)',[owner]);
 const rpc=async(n,a)=>{const values=Object.values(a).map(v=>v&&typeof v==='object'&&!Array.isArray(v)?JSON.stringify(v):v);if(n==='jht_auction_save')values[8]=JSON.stringify(a.p_lots);return (await db.query(`select public.${n}(${values.map((_,i)=>'$'+(i+1)).join(',')}) result`,values)).rows[0].result;};
 const bidders=[];for(const [i,user] of users.entries())bidders.push((await db.query('insert into jht_private.bidders(user_id,email,name,created_by,activation_pending) values($1,$2,$3,$4,false) returning id',[user,'private-'+i+'@example.com','Buyer '+i,owner])).rows[0].id);
 const cars=[];for(let i=0;i<2;i++)cars.push((await db.query('insert into jht_private.bid_vehicles(slug,status,payload) values($1,$2,$3) returning id',['bid-car-'+i,'available',JSON.stringify({brand:'Kia',model:'Sorento '+i,ref:'BID-'+i,image:'assets/car-1.webp',gallery:['assets/car-1.webp'],internalNote:'PRIVATE_CANARY',location:'PRIVATE_LOCATION'})])).rows[0].id);
 const save=(slug,status='draft',ids=cars)=>rpc('jht_auction_save',{p_actor:owner,p_id:null,p_version:1,p_title:'Selected cars',p_slug:slug,p_start:new Date(Date.now()+3600000).toISOString(),p_end:new Date(Date.now()+7200000).toISOString(),p_status:status,p_lots:ids.map(vehicle_id=>({vehicle_id,opening_amount:1000,increment:100})),p_members:bidders.slice(0,2)});
 const room=(slug,actor=owner,admin=true)=>rpc('jht_auction_room',{p_actor:actor,p_admin:admin,p_slug:slug});
 const bid=(lot,bidder,amount,request=randomUUID())=>rpc('jht_place_bid',{p_bidder:bidder,p_lot:lot,p_amount:amount,p_request:request});
 return {db,owner,users,rpc,bidders,cars,save,room,bid};
}
test('start now, member notices and early car closure preserve bids, isolate other cars and reject races',async()=>{
 const f=await setup();const {db,owner,rpc,bidders,save,room,bid}=f;try{
  const a=await save('prepared');assert.ok(a.id);const original=await room('prepared');
  assert.equal((await rpc('jht_auction_start',{p_actor:bidders[0],p_id:a.id,p_version:1,p_notice_minutes:0,p_notice:''})).error,'denied');
  assert.equal((await rpc('jht_auction_start',{p_actor:owner,p_id:a.id,p_version:1,p_notice_minutes:15,p_notice:'Review the collection before opening.'})).saved,true);
  let r=await room('prepared',bidders[0],false);assert.equal(r.session.start_notice,'Review the collection before opening.');assert.ok(Date.parse(r.session.starts_at)-Date.now()>890000);assert.equal(Date.parse(r.session.ends_at)-Date.parse(r.session.starts_at),Date.parse(original.session.ends_at)-Date.parse(original.session.starts_at));
  assert.equal((await bid(r.lots[0].id,bidders[0],1000)).error,'closed');
  assert.equal((await rpc('jht_auction_start',{p_actor:owner,p_id:a.id,p_version:1,p_notice_minutes:0,p_notice:''})).error,'locked');
  assert.equal((await rpc('jht_auction_start',{p_actor:owner,p_id:a.id,p_version:2,p_notice_minutes:0,p_notice:''})).saved,true);
  r=await room('prepared');assert.equal(r.session.start_notice,'');assert.ok(Date.parse(r.session.starts_at)<=Date.now());const [one,two]=r.lots;
  await bid(one.id,bidders[0],1000);await bid(one.id,bidders[1],1100);
  assert.equal((await rpc('jht_auction_close_lot',{p_actor:owner,p_lot:one.id,p_expected:1000})).error,'price_changed');
  assert.equal((await rpc('jht_auction_close_lot',{p_actor:owner,p_lot:two.id,p_expected:1000})).error,'closed');
  assert.equal((await rpc('jht_auction_close_lot',{p_actor:owner,p_lot:one.id,p_expected:1100})).saved,true);
  assert.equal((await bid(one.id,bidders[0],1200)).error,'closed');assert.equal((await bid(two.id,bidders[0],1000)).accepted,true);
  r=await room('prepared',bidders[1],false);assert.equal(r.lots.find(l=>l.id===one.id).leading,true);assert.equal(r.lots.find(l=>l.id===one.id).closed_early,true);assert.equal(r.lots.find(l=>l.id===one.id).highest_amount,1100);
  assert.doesNotMatch(JSON.stringify(r),/private-\d@example|PRIVATE_CANARY|PRIVATE_LOCATION|manually_closed_by|created_by/);
  assert.equal((await rpc('jht_auction_room',{p_actor:bidders[2],p_admin:false,p_slug:'prepared'})).error,'missing');
  const feed=await rpc('jht_auction_live',{p_actor:owner,p_after:null});assert.equal(feed.lots.length,2);assert.equal(feed.events.filter(e=>e.kind==='bid').length,3);assert.ok(feed.events.some(e=>e.bidder==='Buyer 0'));assert.ok(feed.events.some(e=>e.bidder==='Buyer 1'));assert.doesNotMatch(JSON.stringify(feed),/private-\d@example|PRIVATE_CANARY|PRIVATE_LOCATION|user_id|encrypted_tokens/);
  assert.equal((await rpc('jht_auction_control',{p_actor:owner,p_id:one.id,p_action:'confirm',p_version:1})).saved,true);
  assert.equal((await rpc('jht_auction_control',{p_actor:owner,p_id:a.id,p_action:'cancel',p_version:3})).error,'confirmed');
  assert.equal((await rpc('jht_auction_close_lot',{p_actor:owner,p_lot:two.id,p_expected:1000})).saved,true);r=await room('prepared');assert.ok(Date.parse(r.session.ends_at)<=Date.now());
  assert.ok(Date.parse((await rpc('jht_auction_list',{p_actor:owner,p_admin:true})).sessions[0].ends_at)<=Date.now());
  assert.equal((await db.query('select count(*)::int n from jht_private.bids')).rows[0].n,3);assert.equal(original.lots.length,2);
  // More than one page of events is delivered in sequence without dropping a burst.
  for(let i=0;i<105;i++)await db.query("insert into jht_private.auction_events(auction_id,kind) values($1,'notice')",[a.id]);
  let cursor=feed.cursor,seen=new Set();for(let i=0;i<4;i++){const next=await rpc('jht_auction_live',{p_actor:owner,p_after:cursor});for(const e of next.events){assert.ok(!seen.has(e.seq));seen.add(e.seq);}cursor=next.cursor;if(!next.more)break;}assert.equal(seen.size,107);
  const fresh=(await db.query("insert into jht_private.bid_vehicles(slug,status,payload) values('race-car','available','{}') returning id")).rows[0].id,race=await save('race','scheduled',[fresh]);await rpc('jht_auction_start',{p_actor:owner,p_id:race.id,p_version:1,p_notice_minutes:0,p_notice:''});const raceLot=(await room('race')).lots[0];await bid(raceLot.id,bidders[0],1000);
  const [closing,bidding]=await Promise.all([rpc('jht_auction_close_lot',{p_actor:owner,p_lot:raceLot.id,p_expected:1000}),bid(raceLot.id,bidders[1],1100)]);assert.ok(closing.saved&&bidding.error==='closed'||closing.error==='price_changed'&&bidding.accepted);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(()=>db.query('select * from jht_private.auction_events'));await assert.rejects(()=>rpc('jht_auction_live',{p_actor:owner,p_after:null}));await db.exec('reset role');}
 }finally{await db.close();}
});
test('live endpoints and controls require MFA, reject spoofed identities and stream real committed bids',async()=>{
 const f=await setup();const {db,owner,users,rpc,bidders,save,room}=f;try{
  const a=await save('http','scheduled');await rpc('jht_auction_start',{p_actor:owner,p_id:a.id,p_version:1,p_notice_minutes:0,p_notice:''});const l=(await room('http')).lots[0];
  const env={APP_ORIGIN:'https://jht.example',SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'server',SESSION_ENCRYPTION_KEY:randomBytes(32).toString('base64')};
  const token=(u,aal)=>'h.'+Buffer.from(JSON.stringify({sub:u,aal,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.s';const admin=newSessionId(),weak=newSessionId(),bidder=newSessionId();
  for(const [id,aal] of [[admin,'aal2'],[weak,'aal1']])await rpc('jht_session_put',{p_hash:digest(id),p_user:owner,p_tokens:seal({access:token(owner,aal),refresh:'private-token'},Buffer.from(env.SESSION_ENCRYPTION_KEY,'base64')),p_expires:new Date(Date.now()+3600000).toISOString()});
  await rpc('jht_bid_session_put',{p_hash:digest(bidder),p_bidder:bidders[0],p_tokens:seal({kind:'bidder',access:token(users[0],'aal1'),refresh:'private-token'},Buffer.from(env.SESSION_ENCRYPTION_KEY,'base64')),p_expires:new Date(Date.now()+3600000).toISOString()});
  const createClient=(_u,k)=>k==='server'?{from:t=>new Query(db,t),rpc:async(n,a)=>{try{return {data:await rpc(n,a),error:null};}catch(error){return {data:null,error};}}}:{auth:{getUser:async t=>({data:{user:{id:JSON.parse(Buffer.from(t.split('.')[1],'base64url')).sub,email_confirmed_at:'yes'}},error:null}),setSession:async()=>({error:null})}};
  const call=(path,body,cookie='',origin=env.APP_ORIGIN)=>handle(new Request(env.APP_ORIGIN+path,{method:body?'POST':'GET',headers:{cookie,...(body?{Origin:origin,'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),{ip:'test'},{env,createClient,liveSubscribe:cb=>db.listen('jht_auction_changed',cb)});
  const ownerCookie='__Host-jht_session='+admin,bidCookie='__Host-jht_bid_session='+bidder;
  for(const path of ['/api/admin/auctions-live','/api/admin/auctions-live/stream']){assert.equal((await call(path)).status,401);assert.equal((await call(path,null,'__Host-jht_session='+weak)).status,403);assert.equal((await call(path,null,bidCookie)).status,401);}
  assert.equal((await call('/api/admin/auctions-live?after=1&after=2',null,ownerCookie)).status,400);
  assert.equal((await call('/api/admin/auctions/'+a.id+'/start',{version:2,notice_minutes:0,notice:'',user:users[0]},ownerCookie)).status,400);
  assert.equal((await call('/api/admin/auctions/lots/'+l.id+'/close',{highest_amount:1000},ownerCookie,'https://evil.example')).status,403);
  assert.equal((await call('/api/admin/auctions/lots/'+l.id+'/close',{highest_amount:1000},bidCookie)).status,401);
  const stream=await call('/api/admin/auctions-live/stream',null,ownerCookie);assert.equal(stream.status,200);assert.match(stream.headers.get('content-type'),/text\/event-stream/);const reader=stream.body.getReader(),decoder=new TextDecoder();await reader.read();let text=decoder.decode((await reader.read()).value);assert.match(text,/snapshot/);
  assert.equal((await call('/api/bidder/lots/'+l.id+'/bids',{amount:1000,request_id:randomUUID()},bidCookie)).status,200);
  text=decoder.decode((await reader.read()).value);assert.match(text,/Buyer 0/);assert.match(text,/1000/);assert.doesNotMatch(text,/private-token|private-0@example/);await reader.cancel();
  const closed=await call('/api/admin/auctions/lots/'+l.id+'/close',{highest_amount:1000},ownerCookie);assert.equal(closed.status,200);assert.equal((await call('/api/bidder/lots/'+l.id+'/bids',{amount:1100,request_id:randomUUID()},bidCookie)).status,409);
  const privateStream=await call('/api/bidder/sessions/http/stream',null,bidCookie);const privateReader=privateStream.body.getReader();await privateReader.read();text=decoder.decode((await privateReader.read()).value);assert.match(text,/closed_early/);assert.doesNotMatch(text,/Buyer 0|private-0@example|manually_closed_by|PRIVATE_CANARY/);await privateReader.cancel();
  await db.query('update jht_private.admin_slots set enabled=false where user_id=$1',[owner]);assert.equal((await call('/api/admin/auctions-live',null,ownerCookie)).status,403);
 }finally{await db.close();}
});
test('stream revalidates access, cleans subscriptions and rejects malformed reconnect cursors',async()=>{
 assert.throws(()=>liveCursor(new Request('https://example.test/?after=-1')));assert.throws(()=>liveCursor(new Request('https://example.test/?other=1')));
 let revoked=false,unsubscribe=0,changed,reads=0;const controller=new AbortController();const response=auctionStream(new Request('https://example.test/',{signal:controller.signal}),{verify:async()=>{if(revoked)throw Object.assign(Error(),{status:403});},read:async()=>({cursor:String(++reads),lots:[],events:[]}),subscribe:async cb=>{changed=cb;return ()=>unsubscribe++;},heartbeat:100000});
 const reader=response.body.getReader();await reader.read();await reader.read();revoked=true;await changed();assert.match(new TextDecoder().decode((await reader.read()).value),/403/);assert.equal((await reader.read()).done,true);assert.equal(unsubscribe,1);
});

test('bounded streams renew without reporting a connection failure and release provider subscriptions',async()=>{
 let unsubscribe=0;
 const response=auctionStream(new Request('https://example.test/'),{verify:async()=>{},read:async()=>({cursor:'7',lots:[],events:[]}),subscribe:async()=>()=>unsubscribe++,duration:30,heartbeat:100000});
 const reader=response.body.getReader(),decoder=new TextDecoder();await reader.read();await reader.read();
 assert.match(decoder.decode((await reader.read()).value),/event: renew/);assert.equal((await reader.read()).done,true);assert.equal(unsubscribe,1);
});
