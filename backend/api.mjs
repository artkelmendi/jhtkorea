import { createClient } from '@supabase/supabase-js';
import { configuration, HttpError, response, requireSameOrigin, jsonBody, exactKeys, authorize, digest, seal, unseal, newSessionId, sessionCookie, sessionId } from './policy.mjs';

const options = { auth: { autoRefreshToken:false, persistSession:false, detectSessionInUrl:false } };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statuses = ['available','reserved','sold','draft','archived'];
const trustedClaims = token => {
  try { return JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()); } catch { throw new HttpError(401); }
};
async function rpc(service, name, args) {
  const { data, error } = await service.rpc(name,args);
  if (error) throw new HttpError(503,'Management is temporarily unavailable.');
  return data;
}
async function throttle(service,key,limit=5,seconds=900) {
  if (!await rpc(service,'jht_rate_limit',{p_key:digest(key),p_limit:limit,p_seconds:seconds})) throw new HttpError(429,'Please wait before trying again.');
}
function validateVehicle(body) {
  const fields=['slug','brand','model','ref','body','fuel','transmission','year','price','mileage','seats','status','image','gallery','version'];
  exactKeys(body,fields);
  for (const field of ['brand','model','ref','body','fuel','transmission']) if (typeof body[field]!=='string' || !body[field].trim() || body[field].length>120) throw new HttpError(400,'Invalid vehicle details.');
  for (const [field,min,max] of [['year',1980,2030],['price',0,10000000],['seats',2,15]]) if (typeof body[field]!=='number' || !Number.isFinite(body[field]) || body[field]<min || body[field]>max) throw new HttpError(400);
  if (!Number.isInteger(body.year) || !Number.isInteger(body.seats)) throw new HttpError(400);
  if (body.mileage!==null && (typeof body.mileage!=='number' || !Number.isFinite(body.mileage) || body.mileage<0 || body.mileage>3000000)) throw new HttpError(400);
  if (typeof body.slug!=='string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug) || body.slug.length>100 || !statuses.includes(body.status)) throw new HttpError(400);
  // The initial release accepts existing vetted assets only. Raw uploads remain closed.
  const asset = value => typeof value==='string' && /^assets\/[a-z0-9][a-z0-9._-]*\.(?:webp|jpe?g|png)$/i.test(value);
  if (!asset(body.image) || !Array.isArray(body.gallery) || body.gallery.length>12 || body.gallery.some(value=>!asset(value))) throw new HttpError(400,'Invalid image reference.');
  const payload=Object.fromEntries(fields.filter(field=>!['slug','status','version'].includes(field)).map(field=>[field,body[field]]));
  return {slug:body.slug,status:body.status,payload};
}
const rowToVehicle = row => ({...row.payload,id:row.id,slug:row.slug,status:row.status,version:row.version,createdAt:Date.parse(row.created_at)});

export async function handle(request, context = {}, dependencies = {}) {
  let cookie;
  try {
    const settings=configuration(dependencies.env || process.env);
    const path=new URL(request.url).pathname.replace(/^\/\.netlify\/functions\/api/, '/api').replace(/\/$/,'');
    if (new URL(request.url).origin!==settings.origin) throw new HttpError(403);
    if (!['GET','POST','PUT','DELETE'].includes(request.method)) throw new HttpError(405);
    if (request.method!=='GET') requireSameOrigin(request,settings.origin);
    const client=dependencies.createClient || createClient;
    const service=client(settings.database,settings.service,options);
    const auth=client(settings.database,settings.anon,options);

    async function newSession(providerSession,userId,pending=false) {
      const claims=trustedClaims(providerSession.access_token);
      const expires=new Date(Math.min(Number(claims.exp)*1000,Date.now()+(pending?5:60)*60000));
      if (!Number.isFinite(expires.getTime()) || expires<=new Date()) throw new HttpError(401);
      const id=newSessionId();
      await rpc(service,'jht_session_put',{p_hash:digest(id),p_user:userId,p_tokens:seal({access:providerSession.access_token,refresh:providerSession.refresh_token},settings.key),p_expires:expires.toISOString()});
      cookie=sessionCookie(id,Math.floor((expires-Date.now())/1000));
      return id;
    }
    async function identity(requireMfa=true) {
      const id=sessionId(request); if (!id) throw new HttpError(401);
      const session=await rpc(service,'jht_session_get',{p_hash:digest(id)});
      if (!session) throw new HttpError(401);
      const tokens=unseal(session.encrypted_tokens,settings.key);
      const result=await auth.auth.getUser(tokens.access); // Provider validates the token and current user; local session/slot revocation is checked separately.
      if (result.error || !result.data.user || result.data.user.id!==session.user_id) throw new HttpError(401);
      const claims=trustedClaims(tokens.access); // Read claims ONLY after getUser validated this same token.
      const slot=await rpc(service,'jht_admin_slot',{p_user:result.data.user.id});
      authorize({user:result.data.user,slot,claims},requireMfa);
      const {error}=await auth.auth.setSession({access_token:tokens.access,refresh_token:tokens.refresh});
      if(error) throw new HttpError(401);
      return {id,user:result.data.user,slot,claims};
    }
    const reply = body => response(body,200,cookie?{'Set-Cookie':cookie}:{});

    if(path==='/api/auth/activate' && request.method==='POST') {
      if(!context.ip) throw new HttpError(503);
      await throttle(service,`invite-ip:${context.ip}`,10);
      const body=await jsonBody(request);exactKeys(body,['accessToken','refreshToken','password']);
      if(typeof body.accessToken!=='string' || body.accessToken.length>8192 || typeof body.refreshToken!=='string' || body.refreshToken.length>2048 || typeof body.password!=='string' || body.password.length<16 || body.password.length>1024) throw new HttpError(400,'Use a password of at least 16 characters.');
      const verified=await auth.auth.getUser(body.accessToken);
      if(verified.error || !verified.data.user?.invited_at) throw new HttpError(401);
      const user=verified.data.user;
      const slot=await rpc(service,'jht_admin_slot',{p_user:user.id});
      authorize({user,slot,claims:trustedClaims(body.accessToken)},false);
      if(slot.enabled || !slot.allow_enrollment) throw new HttpError(403);
      await throttle(service,`invite-user:${user.id}`,3,3600);
      const current=await auth.auth.setSession({access_token:body.accessToken,refresh_token:body.refreshToken});
      if(current.error || current.data.user.id!==user.id) throw new HttpError(401);
      const factors=await auth.auth.mfa.listFactors();
      if(factors.error || factors.data.totp.some(f=>f.status==='verified')) throw new HttpError(403);
      const changed=await auth.auth.updateUser({password:body.password});
      if(changed.error) throw new HttpError(400,'Password setup could not be completed.');
      await rpc(service,'jht_revoke_user_sessions',{p_user:user.id});
      await newSession(current.data.session,user.id,true);
      return reply({mfaRequired:true});
    }
    if(path==='/api/auth/login' && request.method==='POST') {
      if(!context.ip) throw new HttpError(503); // Do not trust user-supplied X-Forwarded-For.
      const body=await jsonBody(request); exactKeys(body,['email','password']);
      if(typeof body.email!=='string' || body.email.length>254 || typeof body.password!=='string' || body.password.length>1024) throw new HttpError(400);
      await throttle(service,`login-ip:${context.ip}`,20);
      await throttle(service,`login-account:${body.email.trim().toLowerCase()}`,10);
      const {data,error}=await auth.auth.signInWithPassword({email:body.email.trim(),password:body.password});
      if(error || !data.user || !data.session || !data.user.email_confirmed_at) throw new HttpError(401,'Sign-in could not be completed.');
      const slot=await rpc(service,'jht_admin_slot',{p_user:data.user.id});
      try { authorize({user:data.user,slot,claims:trustedClaims(data.session.access_token)},false); } catch { throw new HttpError(401,'Sign-in could not be completed.'); }
      await newSession(data.session,data.user.id,true);
      return reply({mfaRequired:true});
    }
    if(path==='/api/auth/logout' && request.method==='POST') {
      const id=sessionId(request);
      if(id) await rpc(service,'jht_session_drop',{p_hash:digest(id)});
      return response({signedOut:true},200,{'Set-Cookie':sessionCookie('',0)});
    }
    if(path==='/api/auth/session' && request.method==='GET') {
      // A disabled bootstrap account may see its own verification state, never inventory.
      const verified=await identity(false);
      return reply({authenticated:true,mfaVerified:verified.claims.aal==='aal2',accessEnabled:verified.slot.enabled});
    }
    if(path==='/api/auth/mfa' && request.method==='GET') {
      const verified=await identity(false);
      const {data,error}=await auth.auth.mfa.listFactors();
      if(error) throw new HttpError(503);
      const bootstrap=verified.slot.allow_enrollment && !verified.slot.enabled;
      // SDK `totp` contains VERIFIED factors only; `all` also contains the pending
      // factor the invited owner has just scanned and still needs to confirm.
      return reply({factors:data.all.filter(f=>f.factor_type==='totp' && (f.status==='verified' || bootstrap && f.status==='unverified')).map(f=>({id:f.id,pending:f.status!=='verified'})),enrollmentAllowed:bootstrap});
    }
    if(path==='/api/auth/mfa/enroll' && request.method==='POST') {
      const verified=await identity(false);
      await throttle(service,`enroll:${verified.user.id}`,3,3600);
      if(!verified.slot.allow_enrollment || verified.slot.enabled) throw new HttpError(403);
      const factors=await auth.auth.mfa.listFactors();
      if(factors.error || factors.data.totp.some(f=>f.status==='verified')) throw new HttpError(403);
      const {data,error}=await auth.auth.mfa.enroll({factorType:'totp',friendlyName:'JHT admin'});
      if(error) throw new HttpError(503);
      return reply({factorId:data.id,qrCode:data.totp.qr_code});
    }
    if(path==='/api/auth/mfa/verify' && request.method==='POST') {
      const verified=await identity(false);
      await throttle(service,`mfa:${verified.user.id}`,5);
      const body=await jsonBody(request);exactKeys(body,['factorId','code']);
      if(!uuid.test(body.factorId) || typeof body.code!=='string' || !/^\d{6}$/.test(body.code)) throw new HttpError(400);
      const factors=await auth.auth.mfa.listFactors();
      if(factors.error || !factors.data.all.some(f=>f.id===body.factorId && f.factor_type==='totp' && (f.status==='verified' || f.status==='unverified' && verified.slot.allow_enrollment && !verified.slot.enabled))) throw new HttpError(403);
      const {data,error}=await auth.auth.mfa.challengeAndVerify({factorId:body.factorId,code:body.code});
      if(error || !data?.access_token || trustedClaims(data.access_token).aal!=='aal2') throw new HttpError(401,'Verification could not be completed.');
      await newSession(data,verified.user.id);
      await rpc(service,'jht_session_drop',{p_hash:digest(verified.id)});
      return reply({mfaVerified:true,accessEnabled:verified.slot.enabled});
    }

    // Every management route passes through this server guard, including unknown endpoints.
    const verified=await identity();
    await throttle(service,`admin:${verified.user.id}`,request.method==='GET'?300:60,60);
    if(path==='/api/admin/vehicles' && request.method==='GET') {
      const {data,error}=await service.from('jht_vehicles').select('*').order('created_at',{ascending:false}).limit(500);
      if(error) throw new HttpError(503);return reply({vehicles:data.map(rowToVehicle)});
    }
    if(path==='/api/admin/vehicles' && request.method==='POST') {
      const vehicle=validateVehicle(await jsonBody(request));
      await rpc(service,'jht_audit',{p_actor:verified.user.id,p_action:'vehicle.create.attempt',p_record:vehicle.slug});
      const {data,error}=await service.from('jht_vehicles').insert(vehicle).select().single();
      if(error) throw new HttpError(error.code==='23505'?409:503);
      return reply({vehicle:rowToVehicle(data)});
    }
    const match=path.match(/^\/api\/admin\/vehicles\/([0-9a-f-]+)$/i);
    if(match && request.method==='PUT') {
      if(!uuid.test(match[1])) throw new HttpError(400);
      const body=await jsonBody(request),vehicle=validateVehicle(body);
      if(!Number.isInteger(body.version) || body.version<1) throw new HttpError(400);
      await rpc(service,'jht_audit',{p_actor:verified.user.id,p_action:'vehicle.update.attempt',p_record:match[1]});
      const {data,error}=await service.from('jht_vehicles').update({...vehicle,version:body.version+1}).eq('id',match[1]).eq('version',body.version).select().maybeSingle();
      if(error) throw new HttpError(503);if(!data) throw new HttpError(409,'The record changed. Reload before saving.');
      return reply({vehicle:rowToVehicle(data)});
    }
    if(path==='/api/admin/homepage' && request.method==='GET') {
      const {data,error}=await service.from('jht_homepage').select('featured_id,show_price,show_label,arrival_order').eq('singleton',true).single();
      if(error) throw new HttpError(503);return reply(data);
    }
    if(path==='/api/admin/homepage' && request.method==='PUT') {
      const body=await jsonBody(request);exactKeys(body,['featured_id','show_price','show_label','arrival_order']);
      if(body.featured_id!==null && !uuid.test(body.featured_id) || typeof body.show_price!=='boolean' || typeof body.show_label!=='boolean' || !['automatic','manual'].includes(body.arrival_order)) throw new HttpError(400);
      if(body.featured_id) {
        const feature=await service.from('jht_vehicles').select('id').eq('id',body.featured_id).eq('status','available').maybeSingle();
        if(feature.error || !feature.data) throw new HttpError(400);
      }
      await rpc(service,'jht_audit',{p_actor:verified.user.id,p_action:'homepage.update.attempt',p_record:'homepage'});
      const {error}=await service.from('jht_homepage').update(body).eq('singleton',true);
      if(error) throw new HttpError(503);return reply({saved:true});
    }
    // Uploads, recovery, account creation, role changes and hard deletion are not exposed.
    throw new HttpError(404);
  } catch(error) {
    const status=error instanceof HttpError?error.status:503;
    return response({error:error instanceof HttpError?error.message:'Management is temporarily unavailable.'},status,status===429?{'Retry-After':'900'}:{});
  }
}
