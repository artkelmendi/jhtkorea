// LOCAL ONLY: disposable accounts, mocked identity provider, real SQL bidding rules. Never deployed.
import {fileURLToPath} from 'node:url';const previewRoot=fileURLToPath(new URL('..',import.meta.url));
import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';import {readFile} from 'node:fs/promises';import {randomUUID,randomBytes} from 'node:crypto';import {PGlite} from '@electric-sql/pglite';import {handle} from '../backend/api.mjs';import {seal,digest,newSessionId} from '../backend/policy.mjs';
const owner=randomUUID(),user1=randomUUID(),user2=randomUUID(),stranger=randomUUID();
const env={APP_ORIGIN:'https://jht.example',SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'server',SESSION_ENCRYPTION_KEY:randomBytes(32).toString('base64')};
async function fixture(){
 const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');
 for(const f of ['202610040001_security.sql','202610040002_inventory.sql','202610050001_auctions.sql'])await db.exec(await readFile(path.join(previewRoot,'supabase/migrations',f),'utf8'));
 for(const u of [owner,user1,user2,stranger])await db.query('insert into auth.users values($1)',[u]);
 await db.query('insert into jht_private.admin_slots values(1,$1,true,false)',[owner]);
 const rpc=async(name,args)=>{const values=Object.values(args).map(v=>v&&typeof v==='object'&&!Array.isArray(v)?JSON.stringify(v):v);if(name==='jht_auction_save')values[8]=JSON.stringify(args.p_lots);const {rows}=await db.query(`select public.${name}(${values.map((_,i)=>'$'+(i+1)).join(',')}) result`,values);return rows[0].result;};
 const bidders=[];for(const [i,u] of [user1,user2,stranger].entries()){const {rows}=await db.query('insert into jht_private.bidders(user_id,email,name,created_by,activation_pending) values($1,$2,$3,$4,false) returning id',[u,`member${i}@example.com`,'Member '+i,owner]);bidders.push(rows[0].id);}
 const cars=[];for(let i=0;i<2;i++){const payload={brand:'Hyundai',model:'Tucson '+i,year:2022,image:'assets/car-1.webp',gallery:['assets/car-1.webp'],internalNote:'SECRET_NOTE',location:'SECRET_LOCATION'};const {rows}=await db.query('insert into public.jht_vehicles(slug,status,payload) values($1,$2,$3) returning id',['car-'+i,'available',JSON.stringify(payload)]);cars.push(rows[0].id);}
 async function save(status='scheduled',slug='collection',id=null,version=1){return rpc('jht_auction_save',{p_actor:owner,p_id:id,p_version:version,p_title:'Private collection',p_slug:slug,p_start:new Date(Date.now()+3600000).toISOString(),p_end:new Date(Date.now()+7200000).toISOString(),p_status:status,p_lots:cars.map(vehicle_id=>({vehicle_id,opening_amount:1000,increment:100})),p_members:bidders.slice(0,2)});}
 return {db,rpc,bidders,cars,save};
}
class Query {
  constructor(db,table){this.db=db;this.table=table;this.mode='select';this.conditions=[];this.params=[];this.columns='*';}
  select(columns='*'){this.columns=columns;return this;}
  insert(body){this.mode='insert';this.body=body;return this;}
  update(body){this.mode='update';this.body=body;return this;}
  delete(){this.mode='delete';return this;}
  eq(key,value){this.params.push(value);this.conditions.push(`"${key}"=$${this.params.length}`);return this;}
  in(key,values){this.params.push(values);this.conditions.push(`"${key}"=any($${this.params.length})`);return this;}
  order(key,{ascending}){this.orderBy=` order by "${key}" ${ascending?'asc':'desc'}`;return this;}
  limit(n){this.count=n;return this;}
  single(){this.one=true;return this;}
  maybeSingle(){this.one=true;return this;}
  async then(resolve,reject){
    try{
      let sql,params=[...this.params],where=this.conditions.length?' where '+this.conditions.join(' and '):'';
      if(this.mode==='select')sql=`select ${this.columns} from public.${this.table}${where}${this.orderBy||''}${this.count?' limit '+this.count:''}`;
      else if(this.mode==='delete')sql=`delete from public.${this.table}${where} returning ${this.columns}`;
      else {
        const fields=Object.keys(this.body),tokens=fields.map(key=>{params.push(this.body[key]);return '$'+params.length;});
        if(this.mode==='insert')sql=`insert into public.${this.table}(${fields.join(',')}) values(${tokens.join(',')}) returning ${this.columns}`;
        else sql=`update public.${this.table} set ${fields.map((key,i)=>`"${key}"=${tokens[i]}`).join(',')}${where} returning ${this.columns}`;
      }
      try{const {rows}=await this.db.query(sql,params);resolve({data:this.one?rows[0]||null:rows,error:null});}catch(error){resolve({data:null,error});}
    }catch(error){reject(error);}
  }
}

const {db,rpc,cars,bidders,save}=await fixture();const publicCars=JSON.parse(await fs.readFile(path.join(previewRoot,'public-site/cars.json'),'utf8'));
for(const [i,id] of cars.entries())await db.query('update public.jht_vehicles set payload=$1 where id=$2',[JSON.stringify(publicCars[i]),id]);
for(const car of publicCars.slice(2)){const r=await db.query('insert into public.jht_vehicles(slug,status,payload) values($1,$2,$3) returning id',[car.slug,'available',JSON.stringify(car)]);cars.push(r.rows[0].id);}
 const extraCars=cars.splice(2);const created=await save();await db.query("update jht_private.auctions set starts_at=now()-interval '1 minute',ends_at=now()+interval '55 minutes' where id=$1",[created.id]);await db.query("update jht_private.auction_lots set closes_at=now()+interval '55 minutes' where auction_id=$1",[created.id]);
cars.push(...extraCars);await rpc('jht_auction_save',{p_actor:owner,p_id:null,p_version:1,p_title:'The next collection',p_slug:'next-collection',p_start:new Date(Date.now()+3600000).toISOString(),p_end:new Date(Date.now()+7200000).toISOString(),p_status:'scheduled',p_lots:cars.slice(2,4).map(vehicle_id=>({vehicle_id,opening_amount:9000,increment:100})),p_members:bidders.slice(0,2)});
const token=u=>'header.'+Buffer.from(JSON.stringify({sub:u,aal:u===owner?'aal2':'aal1',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.signature';const key=Buffer.from(env.SESSION_ENCRYPTION_KEY,'base64'),aid=newSessionId(),bid=newSessionId();
await rpc('jht_session_put',{p_hash:digest(aid),p_user:owner,p_tokens:seal({access:token(owner),refresh:'demo'},key),p_expires:new Date(Date.now()+3600000).toISOString()});await rpc('jht_bid_session_put',{p_hash:digest(bid),p_bidder:bidders[0],p_tokens:seal({kind:'bidder',access:token(user1),refresh:'demo'},key),p_expires:new Date(Date.now()+3600000).toISOString()});
const createClient=(_u,k)=>k==='server'?{from:t=>new Query(db,t),rpc:async(n,a)=>{try{return {data:await rpc(n,a),error:null};}catch(error){return {data:null,error};}},auth:{admin:{inviteUserByEmail:async(email)=>{const id=randomUUID();await db.query('insert into auth.users values($1)',[id]);return {data:{user:{id}},error:null};}}}}:{auth:{setSession:async()=>({error:null}),getUser:async t=>({data:{user:{id:JSON.parse(Buffer.from(t.split('.')[1],'base64url')).sub,email_confirmed_at:'yes'}},error:null})}};
const output=path.join(previewRoot,'netlify-public'),mimes={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.ttf':'font/ttf','.woff2':'font/woff2','.mp4':'video/mp4'};
http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://127.0.0.1:4190');if(url.pathname.startsWith('/api/')){const headers=new Headers(req.headers);headers.set('origin',env.APP_ORIGIN);headers.set('cookie',url.pathname.startsWith('/api/bidder/')?'__Host-jht_bid_session='+bid:'__Host-jht_session='+aid);const chunks=[];for await(const c of req)chunks.push(c);if(req.method!=='GET')await new Promise(r=>setTimeout(r,800));if(url.pathname==='/api/auth/session')await new Promise(r=>setTimeout(r,1500));const response=await handle(new Request(env.APP_ORIGIN+req.url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)}),{ip:'LOCAL-DEMO'},{env,createClient});res.writeHead(response.status,Object.fromEntries([...response.headers].filter(([k])=>k!=='set-cookie')));res.end(Buffer.from(await response.arrayBuffer()));return;}
let file=path.resolve(output,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(path.resolve(output)+path.sep))throw Error('path');if(url.pathname.endsWith('/'))file=path.join(file,'index.html');let data=await fs.readFile(file);if(file.endsWith('.html'))data=Buffer.from(data.toString().replace('<body>','<body><div style="position:fixed;bottom:0;left:0;z-index:9999;padding:5px 12px;background:#65cbf5;color:#101114;font:11px sans-serif;pointer-events:none">LOCAL PREVIEW · sample accounts and bids · no emails sent</div>'));res.setHeader('Content-Type',mimes[path.extname(file)]||'application/octet-stream');res.end(data);
}catch(error){res.writeHead(500);res.end('Local preview unavailable');console.error(error.message);}}).listen(4190,'127.0.0.1',()=>console.log('Local database-backed preview at http://127.0.0.1:4190/admin/ and /bidding/'));
