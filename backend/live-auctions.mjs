import {randomUUID} from 'node:crypto';
import {HttpError,noStoreHeaders} from './policy.mjs';
export function liveCursor(request){
 const params=new URL(request.url).searchParams,keys=[...params.keys()],value=params.get('after')||request.headers.get('Last-Event-ID');
 if(keys.some(k=>k!=='after')||keys.length>1||value!==null&&!/^(0|[1-9]\d{0,17})$/.test(value))throw new HttpError(400);
 return value;
}
export function providerLiveSubscribe(service,onChange){
 const channel=service.channel('jht-server-'+randomUUID()).on('postgres_changes',{event:'INSERT',schema:'jht_private',table:'auction_events'},onChange).subscribe();
 return ()=>service.removeChannel(channel);
}
// A bounded stream fits the host's execution limit. Reconnects replay from a durable cursor.
export function auctionStream(request,{verify,read,subscribe,cursor=null,duration=45000,heartbeat=10000}){
 let stopped=false,cleanup=null,interval=null,deadline=null,controller,working=false,pending=false;
 const encoder=new TextEncoder();
 function stop(){if(stopped)return;stopped=true;clearInterval(interval);clearTimeout(deadline);request.signal.removeEventListener('abort',stop);try{controller?.close();}catch{}if(cleanup)Promise.resolve(cleanup()).catch(()=>{});}
 function emit(kind,data,id){if(stopped)return;if(controller.desiredSize<=0){stop();return;}controller.enqueue(encoder.encode((id?'id: '+id+'\n':'')+'event: '+kind+'\ndata: '+JSON.stringify(data)+'\n\n'));}
 async function flush(){
  if(stopped)return;if(working){pending=true;return;}working=true;
  try{
   await verify();
   do{pending=false;const data=await read(cursor);if(stopped)return;cursor=data.cursor??cursor;emit('snapshot',data,data.cursor);if(data.more)pending=true;}while(pending&&!stopped);
  }catch(error){emit('problem',{status:[401,403].includes(error.status)?error.status:503,message:'Live updates are unavailable. Reconnect to verify the latest bids.'});stop();}
  finally{working=false;}
 }
 const body=new ReadableStream({
  start(c){controller=c;controller.enqueue(encoder.encode('retry: 1000\n\n'));request.signal.addEventListener('abort',stop,{once:true});if(request.signal.aborted){stop();return;}
   Promise.resolve().then(()=>subscribe(flush)).then(unsubscribe=>{cleanup=unsubscribe;if(stopped)Promise.resolve(cleanup?.()).catch(()=>{});else flush();}).catch(()=>flush());
   interval=setInterval(flush,heartbeat);deadline=setTimeout(()=>{emit('renew',{});stop();},duration);
  },cancel(){stop();}
 });
 return new Response(body,{headers:{...noStoreHeaders,'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'private, no-store, no-transform','X-Accel-Buffering':'no'}});
}
