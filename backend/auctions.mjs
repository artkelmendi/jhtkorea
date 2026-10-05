import {validateVehicle} from './vehicle-input.mjs';
import { HttpError, response, jsonBody, exactKeys, digest, seal, unseal, newSessionId } from './policy.mjs';
import { BUCKET } from './images.mjs';
import {auctionStream,liveCursor,providerLiveSubscribe} from './live-auctions.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const slug=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const claims=token=>{try{return JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());}catch{throw new HttpError(401);}};
export const bidderCookie=(id,seconds=3600)=>`__Host-jht_bid_session=${id}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${seconds}`;
function cookieId(request){const values=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith('__Host-jht_bid_session='));if(values.length!==1)return null;const id=values[0].slice(23);return /^[A-Za-z0-9_-]{43}$/.test(id)?id:null;}
async function rpc(service,name,args){const {data,error}=await service.rpc(name,args);if(error)throw new HttpError(['22P02','23514','23505'].includes(error.code)?400:503,'The operation could not be completed.');if(data?.error){const errors={denied:[403,'You do not have access to this bidding session.'],missing:[404,'This session is unavailable.'],locked:[409,'This record changed or is locked by a bidding session. Reload it; cancel an active session before changing its car.'],invalid:[400,'Check the schedule, cars and invited members.'],overlap:[409,'A car is already assigned to another upcoming or live session.'],closed:[409,'Bidding is not open for this car.'],leading:[409,'You already have the highest bid.'],low:[409,`The minimum bid is $${data.minimum}. Refresh the current price.`],replay:[409,'This bid request was already used.'],confirmed:[409,'A winner has already been confirmed. Close remaining cars individually; confirmed results cannot be cancelled.'],price_changed:[409,'A newer bid arrived. Review the latest highest bid before closing this car.'],schedule_conflict:[409,'The car schedule conflicts with another session.']};const [status,message]=errors[data.error]||[503,'The operation could not be completed.'];throw new HttpError(status,message);}return data;}
async function throttle(service,key,limit,seconds=60){if(!await rpc(service,'jht_rate_limit',{p_key:digest(key),p_limit:limit,p_seconds:seconds}))throw new HttpError(429,'Please wait before trying again.');}
export async function bidderIdentity(request,service,auth,settings){
 const id=cookieId(request);if(!id)throw new HttpError(401,'Please sign in to continue.');
 const session=await rpc(service,'jht_bid_session_get',{p_hash:digest(id)});if(!session)throw new HttpError(401,'Please sign in again.');
 const tokens=unseal(session.encrypted_tokens,settings.key);if(tokens.kind!=='bidder')throw new HttpError(401);
 const result=await auth.auth.getUser(tokens.access);if(result.error||!result.data?.user?.email_confirmed_at)throw new HttpError(401);
 const user=result.data.user,c=claims(tokens.access);if(c.sub!==user.id||!Number.isFinite(c.exp)||c.exp*1000<=Date.now())throw new HttpError(401);
 const bidder=await rpc(service,'jht_bidder_get',{p_user:user.id});if(!bidder?.enabled||bidder.activation_pending||bidder.id!==session.bidder_id)throw new HttpError(403,'Bidding access is unavailable.');
 return {id,user,bidder};
}
export async function handleAuctions(request,{path,service,auth,settings,context,admin,liveSubscribe}){
 const isAdmin=path.startsWith('/api/admin/auctions')||path.startsWith('/api/admin/bidders')||path.startsWith('/api/admin/bid-vehicles');
 if(!isAdmin&&!path.startsWith('/api/bidder/'))return null;
 const reply=body=>response(body);
 async function startSession(provider,bidder){
 const expires=Math.min(claims(provider.access_token).exp*1000,Date.now()+3600000);if(!Number.isFinite(expires)||expires<=Date.now())throw new HttpError(401);
 const id=newSessionId();await rpc(service,'jht_bid_session_put',{p_hash:digest(id),p_bidder:bidder.id,p_tokens:seal({kind:'bidder',access:provider.access_token,refresh:provider.refresh_token},settings.key),p_expires:new Date(expires).toISOString()});
 return response({authenticated:true,name:bidder.name},200,{'Set-Cookie':bidderCookie(id,Math.floor((expires-Date.now())/1000))});
 }
 if(path==='/api/bidder/auth/login'&&request.method==='POST'){
 if(!context.ip)throw new HttpError(503);const body=await jsonBody(request);exactKeys(body,['email','password']);
 if(typeof body.email!=='string'||body.email.length>254||typeof body.password!=='string'||body.password.length>1024)throw new HttpError(400);
 await throttle(service,'bid-login-ip:'+context.ip,20,900);await throttle(service,'bid-login-email:'+body.email.trim().toLowerCase(),10,900);
 const {data,error}=await auth.auth.signInWithPassword({email:body.email.trim(),password:body.password});
 if(error||!data?.user?.email_confirmed_at||!data.session)throw new HttpError(401,'Sign-in could not be completed.');
 const b=await rpc(service,'jht_bidder_get',{p_user:data.user.id});if(!b?.enabled||b.activation_pending)throw new HttpError(401,'Sign-in could not be completed.');
 if(claims(data.session.access_token).sub!==data.user.id)throw new HttpError(401);return startSession(data.session,b);
 }
 if(path==='/api/bidder/auth/activate'&&request.method==='POST'){
 if(!context.ip)throw new HttpError(503);await throttle(service,'bid-activate:'+context.ip,10,900);
 const body=await jsonBody(request);exactKeys(body,['accessToken','refreshToken','password']);
 if(typeof body.accessToken!=='string'||body.accessToken.length>8192||typeof body.refreshToken!=='string'||body.refreshToken.length>2048||typeof body.password!=='string'||body.password.length<16||body.password.length>1024)throw new HttpError(400,'Use a unique passphrase of at least 16 characters.');
 const checked=await auth.auth.getUser(body.accessToken);if(checked.error||!checked.data?.user?.invited_at||!checked.data.user.email_confirmed_at)throw new HttpError(401);
 const b=await rpc(service,'jht_bidder_get',{p_user:checked.data.user.id});if(!b?.enabled||!b.activation_pending)throw new HttpError(403);
 await throttle(service,'bid-activate-user:'+b.id,3,3600);
 const provider=await auth.auth.setSession({access_token:body.accessToken,refresh_token:body.refreshToken});if(provider.error||provider.data?.user?.id!==b.user_id)throw new HttpError(401);
 const changed=await auth.auth.updateUser({password:body.password});if(changed.error)throw new HttpError(400,'Password setup could not be completed.');
 await rpc(service,'jht_bidder_activate',{p_user:b.user_id});
 return startSession(provider.data.session,b);
 }
 if(path==='/api/bidder/auth/logout'&&request.method==='POST'){const id=cookieId(request);if(id)await rpc(service,'jht_bid_session_drop',{p_hash:digest(id)});return response({signedOut:true},200,{'Set-Cookie':bidderCookie('',0)});}
 let identity;
 if(isAdmin){if(!admin)throw new HttpError(403);}else{identity=await bidderIdentity(request,service,auth,settings);await throttle(service,'bidder:'+identity.bidder.id,request.method==='GET'?120:20);}
 if(path==='/api/bidder/auth/session'&&request.method==='GET')return reply({authenticated:true,name:identity.bidder.name});
 if(path==='/api/bidder/lobby/stream'&&request.method==='GET'){
  liveCursor(request);await throttle(service,'bid-stream:'+identity.bidder.id,6);
  return auctionStream(request,{verify:()=>bidderIdentity(request,service,auth,settings),read:()=>rpc(service,'jht_auction_list',{p_actor:identity.bidder.id,p_admin:false}),subscribe:liveSubscribe||((cb)=>providerLiveSubscribe(service,cb))});
 }
 const media=path.match(/^\/api\/bidder\/media\/([0-9a-f-]{36})\.webp$/);
 if(media&&request.method==='GET'){
 if(!uuid.test(media[1])||!await rpc(service,'jht_bid_media',{p_bidder:identity.bidder.id,p_media:media[1]}))throw new HttpError(404);
 const {data,error}=await service.storage.from(BUCKET).download(media[1]+'.webp');if(error||!data)throw new HttpError(404);
 return new Response(data,{headers:{'Content-Type':'image/webp','Cache-Control':'private, no-store','Netlify-CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'}});
 }
 if(path==='/api/admin/bid-vehicles'&&request.method==='GET')return reply(await rpc(service,'jht_bid_vehicle_list',{p_actor:admin.user.id}));
 const bidVehicle=path.match(/^\/api\/admin\/bid-vehicles\/([0-9a-f-]{36})$/);
 if((path==='/api/admin/bid-vehicles'&&request.method==='POST')||(bidVehicle&&request.method==='PUT')){
 const body=await jsonBody(request),v=validateVehicle(body);if(!Number.isSafeInteger(v.payload.price)||v.payload.price<1)throw new HttpError(400,'Use a whole USD amount for the suggested opening bid.');if(bidVehicle&&(!uuid.test(bidVehicle[1])||!Number.isInteger(body.version)||body.version<1))throw new HttpError(400);
 const photos=[...new Set([v.payload.image,...v.payload.gallery].filter(p=>p.startsWith('api/media/')).map(p=>p.slice(10,-5)))];
 if(photos.length){const found=await service.from('jht_media').select('id').in('id',photos);if(found.error||found.data.length!==photos.length)throw new HttpError(400,'An uploaded photo is missing. Upload it again.');}
 return reply(await rpc(service,'jht_bid_vehicle_save',{p_actor:admin.user.id,p_id:bidVehicle?bidVehicle[1]:null,p_version:body.version||1,p_slug:v.slug,p_status:v.status,p_payload:v.payload}));
 }
 if(path==='/api/admin/bidders'&&request.method==='GET'){
 return reply(await rpc(service,'jht_bidder_list',{p_actor:admin.user.id}));
 }
 if(path==='/api/admin/bidders'&&request.method==='POST'){
 const b=await jsonBody(request);exactKeys(b,['name','email']);if(typeof b.name!=='string'||!b.name.trim()||b.name.length>100||typeof b.email!=='string'||!/^\S+@\S+\.\S+$/.test(b.email)||b.email.length>254)throw new HttpError(400,'Enter a name and a valid email address.');
 await throttle(service,'bid-invites:'+admin.user.id,10,3600);
 // Pre-register the allowlist before sending an invitation. Failed invitations remain disabled for review.
 const email=b.email.trim().toLowerCase();const inserted=await rpc(service,'jht_bidder_register',{p_actor:admin.user.id,p_name:b.name.trim(),p_email:email});
 const invited=await service.auth.admin.inviteUserByEmail(email,{redirectTo:settings.origin+'/bidding/'});
 if(invited.error||!invited.data?.user)throw new HttpError(400,'Invitation could not be sent. The member remains disabled; contact the site owner to retry.');
 await rpc(service,'jht_bidder_attach',{p_actor:admin.user.id,p_id:inserted.id,p_user:invited.data.user.id});
 await rpc(service,'jht_audit',{p_actor:admin.user.id,p_action:'bidder.invited',p_record:inserted.id});return reply({invited:true});
 }
 const member=path.match(/^\/api\/admin\/bidders\/([0-9a-f-]{36})$/);
 if(member&&request.method==='PUT'){const b=await jsonBody(request);exactKeys(b,['enabled']);if(!uuid.test(member[1])||typeof b.enabled!=='boolean')throw new HttpError(400);return reply(await rpc(service,'jht_bidder_manage',{p_actor:admin.user.id,p_id:member[1],p_enabled:b.enabled}));}
 if(['/api/admin/auctions','/api/bidder/sessions'].includes(path)&&request.method==='GET')return reply(await rpc(service,'jht_auction_list',{p_actor:isAdmin?admin.user.id:identity.bidder.id,p_admin:isAdmin}));
 const stream=path.match(/^\/api\/bidder\/sessions\/([a-z0-9]+(?:-[a-z0-9]+)*)\/stream$/);
 if(stream&&request.method==='GET'){
  liveCursor(request);await throttle(service,'bid-stream:'+identity.bidder.id,6);
  const read=()=>rpc(service,'jht_auction_room',{p_actor:identity.bidder.id,p_admin:false,p_slug:stream[1]});await read();
  return auctionStream(request,{verify:()=>bidderIdentity(request,service,auth,settings),read,subscribe:liveSubscribe||((cb)=>providerLiveSubscribe(service,cb))});
 }
 const room=path.match(/^\/api\/(admin\/auctions|bidder\/sessions)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
 if(room&&request.method==='GET')return reply(await rpc(service,'jht_auction_room',{p_actor:isAdmin?admin.user.id:identity.bidder.id,p_admin:isAdmin,p_slug:room[2]}));
 if(path==='/api/admin/auctions'&&request.method==='POST'){
 const b=await jsonBody(request);exactKeys(b,['id','version','title','slug','starts_at','ends_at','status','lots','members']);
 if(b.id!==null&&!uuid.test(b.id)||b.id&&!Number.isInteger(b.version)||typeof b.title!=='string'||b.title.length>120||typeof b.slug!=='string'||!slug.test(b.slug)||b.slug.length>100||!['draft','scheduled'].includes(b.status)||!Number.isFinite(Date.parse(b.starts_at))||!Number.isFinite(Date.parse(b.ends_at))||!Array.isArray(b.lots)||!b.lots.length||b.lots.length>30||!Array.isArray(b.members)||!b.members.length||b.members.length>200||b.members.some(id=>!uuid.test(id)))throw new HttpError(400,'Check the schedule, selected cars and members.');
 for(const l of b.lots){if(!l||typeof l!=='object'||Array.isArray(l))throw new HttpError(400);exactKeys(l,['vehicle_id','opening_amount','increment']);if(!uuid.test(l.vehicle_id)||!Number.isSafeInteger(l.opening_amount)||!Number.isSafeInteger(l.increment)||l.opening_amount<1||l.opening_amount>10000000||l.increment<1||l.increment>100000)throw new HttpError(400,'Use whole USD amounts for opening prices and increments.');}
 return reply(await rpc(service,'jht_auction_save',{p_actor:admin.user.id,p_id:b.id,p_version:b.version||1,p_title:b.title.trim(),p_slug:b.slug,p_start:b.starts_at,p_end:b.ends_at,p_status:b.status,p_lots:b.lots,p_members:b.members}));
 }
 const control=path.match(/^\/api\/admin\/auctions\/([0-9a-f-]{36})\/(cancel|confirm)$/);
 if(control&&request.method==='POST'){const b=await jsonBody(request);exactKeys(b,['version']);if(!uuid.test(control[1])||!Number.isInteger(b.version)||b.version<1)throw new HttpError(400);return reply(await rpc(service,'jht_auction_control',{p_actor:admin.user.id,p_id:control[1],p_action:control[2],p_version:b.version}));}
 const start=path.match(/^\/api\/admin\/auctions\/([0-9a-f-]{36})\/start$/);
 if(start&&request.method==='POST'){const b=await jsonBody(request);exactKeys(b,['version','notice_minutes','notice']);if(!uuid.test(start[1])||!Number.isInteger(b.version)||b.version<1||!Number.isInteger(b.notice_minutes)||b.notice_minutes<0||b.notice_minutes>1440||typeof b.notice!=='string'||b.notice.length>240||/[\u0000-\u001f]/.test(b.notice))throw new HttpError(400);return reply(await rpc(service,'jht_auction_start',{p_actor:admin.user.id,p_id:start[1],p_version:b.version,p_notice_minutes:b.notice_minutes,p_notice:b.notice}));}
 const close=path.match(/^\/api\/admin\/auctions\/lots\/([0-9a-f-]{36})\/close$/);
 if(close&&request.method==='POST'){const b=await jsonBody(request);exactKeys(b,['highest_amount']);if(!uuid.test(close[1])||!Number.isSafeInteger(b.highest_amount)||b.highest_amount<1||b.highest_amount>10000000)throw new HttpError(400);return reply(await rpc(service,'jht_auction_close_lot',{p_actor:admin.user.id,p_lot:close[1],p_expected:b.highest_amount}));}
 const bid=path.match(/^\/api\/bidder\/lots\/([0-9a-f-]{36})\/bids$/);
 if(bid&&request.method==='POST'){
 const b=await jsonBody(request);exactKeys(b,['amount','request_id']);if(!uuid.test(bid[1])||!uuid.test(b.request_id)||!Number.isSafeInteger(b.amount)||b.amount<1||b.amount>10000000)throw new HttpError(400,'Enter a valid whole USD amount.');
 await throttle(service,'bid-write:'+identity.bidder.id,10);return reply(await rpc(service,'jht_place_bid',{p_bidder:identity.bidder.id,p_lot:bid[1],p_amount:b.amount,p_request:b.request_id}));
 }
 throw new HttpError(404);
}
