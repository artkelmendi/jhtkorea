(() => {
 'use strict';
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(value||0));
 const date=value=>new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
 let serverTime=Date.now(),anchor=performance.now();
 const sync=value=>{if(Number.isFinite(Date.parse(value))){serverTime=Date.parse(value);anchor=performance.now();}};
 const now=()=>serverTime+performance.now()-anchor;
 const phase=session=>session.status==='cancelled'?'cancelled':session.status==='draft'?'draft':now()<Date.parse(session.starts_at)?'scheduled':now()>=Date.parse(session.ends_at)?'ended':'live';
 const countdown=time=>{let s=Math.max(0,Math.ceil((Date.parse(time)-now())/1000));const d=Math.floor(s/86400);s%=86400;const h=Math.floor(s/3600);s%=3600;const m=Math.floor(s/60);return `${d?d+'d ':''}${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;};
 const asset=value=>typeof value==='string'&&/^(assets\/[a-z0-9][a-z0-9._-]*\.(webp|jpg|png|svg)|api\/media\/[0-9a-f-]{36}\.webp)$/.test(value)?'/'+value:'/assets/car-1.webp';
 window.JHTAuction={escape,money,date,sync,now,phase,countdown,asset};
})();
