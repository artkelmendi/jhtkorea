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
  function stage(form,title,copy){forms.forEach(f=>{f.hidden=f!==form;});$('#access-result').hidden=true;$('#access-title').textContent=title;$('#access-copy').textContent=copy;$('#access-message').textContent='';if(!document.body.classList.contains('access-checking')){window.JHTUI?.headline($('#access-title'),{compact:true});window.JHTUI?.enter($('.access-content'));}}
  async function api(path,body) {
    const response=await fetch('/api/auth/'+path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
    const data=await response.json();
    if(!response.ok){const error=Error(data.error||'Access could not be verified. Please try again.');error.status=response.status;throw error;}
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
    if(enabled){location.replace('/admin/workspace/');return;}
    stage(null,enabled?'You’re signed in.':'Two-factor setup complete.',enabled?'Your identity and two-factor verification are confirmed.':'Your authenticator is working. Your identity is verified.');
    $('#mfa-qr').removeAttribute('src');$('#mfa-qr').hidden=true;$('#access-result').hidden=false;
    if(qrUrl){URL.revokeObjectURL(qrUrl);qrUrl='';}
    $('#result-copy').textContent='Inventory management has not been activated yet. Your password and authenticator setup are complete; you do not need to repeat them.';
  }
  async function submit(form,action) {
    const button=form.querySelector('button');button.disabled=true;button.classList.add('is-pending');form.setAttribute('aria-busy','true');$('#access-message').textContent='';
    try{await action();}catch(error){$('#access-message').textContent=error.message;}finally{button.disabled=false;button.classList.remove('is-pending');form.removeAttribute('aria-busy');}
  }
  $('#login-form').addEventListener('submit',event=>{event.preventDefault();submit(event.currentTarget,async()=>{const data=new FormData($('#login-form'));await api('login',{email:data.get('email'),password:data.get('password')});$('#login-form input[type=password]').value='';await mfa();});});
  $('#setup-form').addEventListener('submit',event=>{event.preventDefault();submit(event.currentTarget,async()=>{const password=new FormData($('#setup-form')).get('password');await api('activate',{...invitation,password});invitation=null;$('#setup-form input').value='';await mfa();});});
  $('#mfa-form').addEventListener('submit',event=>{event.preventDefault();submit(event.currentTarget,async()=>{const verified=await api('mfa/verify',{factorId,code:new FormData($('#mfa-form')).get('code')});$('#mfa-form input').value='';result(verified.accessEnabled);});});
  $('#sign-out').addEventListener('click',async()=>{try{await api('logout',{});location.replace('/admin/');}catch{ $('#access-message').textContent='Sign-out could not be completed. Please try again.';}});
  async function reveal() {
    await window.JHTAdminFontsReady;window.JHTUI?.headline($('#access-title'),{compact:true});window.JHTUI?.headline($('.access-visual h1'),{delay:120});window.JHTUI?.enter($('.access-content'));
    document.body.classList.remove('access-checking');
    const loader=$('#access-loader');loader.classList.add('is-leaving');setTimeout(()=>loader.remove(),220);
  }
  async function boot() {
    if(invitation){stage($('#setup-form'),'Set up your account.','Choose your password, then secure your account with two-factor verification.');await reveal();return;}
    try {
      const session=await api('session');
      if(session.mfaVerified&&session.accessEnabled){location.replace('/admin/workspace/');return;}
      if(session.mfaVerified){result(session.accessEnabled);await reveal();return;}
      await mfa();await reveal();
    } catch(error) {
      stage($('#login-form'),'Welcome back.','Sign in to your private workspace.');
      if(error.status!==401)$('#access-message').textContent=error.message;
      await reveal();
    }
  }
  boot();
})();
