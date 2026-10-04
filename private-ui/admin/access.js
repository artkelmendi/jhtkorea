(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  let invitation=null,factorId='',qrUrl='';
  // Provider invitation tokens stay in memory only and are removed from the address bar immediately.
  const fragment=new URLSearchParams(location.hash.slice(1));
  if(fragment.has('access_token')) {
    invitation={accessToken:fragment.get('access_token'),refreshToken:fragment.get('refresh_token')||''};
    history.replaceState(null,'',location.pathname);
  }
  const forms=[$('#login-form'),$('#setup-form'),$('#mfa-form')];
  function stage(form,title,copy){forms.forEach(f=>{f.hidden=f!==form;});$('#access-result').hidden=true;$('#access-title').textContent=title;$('#access-copy').textContent=copy;$('#access-message').textContent='';}
  async function api(path,body) {
    const response=await fetch('/api/auth/'+path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
    const data=await response.json();
    if(!response.ok) throw Error(data.error||'Access could not be verified. Please try again.');
    return data;
  }
  async function mfa() {
    stage($('#mfa-form'),'Verify it’s you.','Enter the six-digit code from your authenticator app.');
    const state=await api('mfa');
    if(state.factors.length) {
      factorId=state.factors[0].id;
      if(state.factors[0].pending)$('#access-copy').textContent='Use the JHT admin entry already added to your authenticator. Enter its current six-digit code to finish setup.';
    }
    else if(state.enrollmentAllowed) {
      const enrollment=await api('mfa/enroll',{});factorId=enrollment.factorId;
      const qr=enrollment.qrCode;
      if(typeof qr!=='string' || !qr.startsWith('data:image/svg+xml')) throw Error('Authenticator setup is unavailable.');
      const comma=qr.indexOf(','),encoded=qr.slice(comma+1);
      const svg=qr.slice(0,comma).includes(';base64')?atob(encoded):decodeURIComponent(encoded);
      if(qrUrl)URL.revokeObjectURL(qrUrl);
      qrUrl=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
      $('#mfa-qr').src=qrUrl;$('#mfa-qr').hidden=false;
      $('#access-copy').textContent='Scan this code in your authenticator app, then enter its six-digit code.';
    } else throw Error('Access setup requires the account owner.');
    $('#mfa-form input').focus();
  }
  function result(enabled) {
    stage(null,enabled?'Access verified.':'Verification complete.',enabled?'Your identity and two-factor verification are confirmed.':'Your authenticator is ready.');
    $('#mfa-qr').removeAttribute('src');$('#mfa-qr').hidden=true;$('#access-result').hidden=false;
    if(qrUrl){URL.revokeObjectURL(qrUrl);qrUrl='';}
    $('#result-copy').textContent=enabled?'The inventory workspace is still undergoing its production release checks. Management is closed until those checks are complete.':'The account owner must complete the final access activation. Management remains closed.';
  }
  async function submit(form,action) {
    const button=form.querySelector('button');button.disabled=true;$('#access-message').textContent='';
    try{await action();}catch(error){$('#access-message').textContent=error.message;}finally{button.disabled=false;}
  }
  $('#login-form').addEventListener('submit',event=>{event.preventDefault();submit(event.currentTarget,async()=>{const data=new FormData($('#login-form'));await api('login',{email:data.get('email'),password:data.get('password')});$('#login-form input[type=password]').value='';await mfa();});});
  $('#setup-form').addEventListener('submit',event=>{event.preventDefault();submit(event.currentTarget,async()=>{const password=new FormData($('#setup-form')).get('password');await api('activate',{...invitation,password});invitation=null;$('#setup-form input').value='';await mfa();});});
  $('#mfa-form').addEventListener('submit',event=>{event.preventDefault();submit(event.currentTarget,async()=>{const verified=await api('mfa/verify',{factorId,code:new FormData($('#mfa-form')).get('code')});$('#mfa-form input').value='';result(verified.accessEnabled);});});
  $('#sign-out').addEventListener('click',async()=>{try{await api('logout',{});location.replace('/admin/');}catch{ $('#access-message').textContent='Sign-out could not be completed. Please try again.';}});
  if(invitation)stage($('#setup-form'),'Make it yours.','Create your private sign-in password, then set up two-factor verification.');
  else api('session').then(()=>result(true)).catch(()=>{});
})();
