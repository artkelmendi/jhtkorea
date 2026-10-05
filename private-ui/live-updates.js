(() => {
 'use strict';
 window.JHTLive={connect(url,{onData,onState,onDenied}){
  let source=null,timer=null,closed=false,cursor=null,attempt=0,generation=0;
  const state=value=>onState?.(value);
  function stopSource(){generation++;source?.close();source=null;clearTimeout(timer);}
  function start(quiet=false){
   if(closed||document.hidden)return;stopSource();const ticket=generation;if(!quiet)state('connecting');
   source=new EventSource(url+(cursor?'?after='+encodeURIComponent(cursor):''));
   source.addEventListener('snapshot',event=>{if(ticket!==generation||closed)return;try{const data=JSON.parse(event.data);cursor=data.cursor||cursor;attempt=0;state('connected');onData(data);}catch{state('interrupted');}});
   source.addEventListener('problem',event=>{if(ticket!==generation)return;try{const data=JSON.parse(event.data);if([401,403].includes(data.status)){stopSource();closed=true;document.removeEventListener('visibilitychange',visibility);onDenied?.();return;}}catch{}retry();});
   source.addEventListener('renew',()=>{if(ticket!==generation||closed)return;stopSource();if(!document.hidden)timer=setTimeout(()=>start(true),50);});
   source.onerror=()=>{if(ticket===generation)retry();};
  }
  function retry(){stopSource();state('interrupted');if(!closed&&!document.hidden)timer=setTimeout(start,Math.min(15000,1000*2**Math.min(attempt++,4)));}
  function visibility(){if(document.hidden){stopSource();state('paused');}else start();}
  document.addEventListener('visibilitychange',visibility);start();
  return {close(){closed=true;stopSource();document.removeEventListener('visibilitychange',visibility);}};
 }};
})();
