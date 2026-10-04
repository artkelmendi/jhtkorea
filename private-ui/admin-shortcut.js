(() => {
'use strict';
const nav=document.querySelector('.site-header nav,header nav,.main-nav');if(!nav)return;
let link=null;
function remove(){link?.remove();link=null;}
async function check(){try{const r=await fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store'});if(!r.ok){remove();return;}const s=await r.json();if(!s.authenticated||!s.mfaVerified||!s.accessEnabled){remove();return;}if(!link){link=document.createElement('a');link.href='/admin/workspace/';link.className='admin-dashboard-link';link.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z"/></svg><span>Dashboard</span>';nav.append(link);}}catch{remove();}}
check();document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
})();
