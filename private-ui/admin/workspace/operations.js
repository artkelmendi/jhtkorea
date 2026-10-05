(() => {
 'use strict';
 const $=s=>document.querySelector(s),groups=['Finding a car','Buying & payment','Shipping & arrival'];
 const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let api,operate,toast,saved=null,baseline='',loading=false,dirty=false,activityTicket=0,cursor=null,events=[],stockUrl=null;
 const form=()=>$('#site-form');
 function localDate(iso){if(!iso)return '';const d=new Date(iso);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
 function dateValue(name){const value=form().elements[name].value,previous=saved?.settings.announcement[name];return value===localDate(previous)?previous:value?new Date(value).toISOString():null;}
 function questions(){return [...$('#site-questions').children].map(row=>({group:row.querySelector('select').value,question:row.querySelector('input').value,answer:row.querySelector('textarea').value}));}
 function body(){return {phone:form().elements.phone.value,email:form().elements.email.value,address:form().elements.address.value,hours:form().elements.hours.value,announcement:{enabled:form().elements.enabled.checked,text:form().elements.announcementText.value,startsAt:dateValue('startsAt'),endsAt:dateValue('endsAt')},faq:questions(),version:saved?.version};}
 function snapshot(){return JSON.stringify(body());}
 function status(){
  if(!saved)return;
  try{dirty=snapshot()!==baseline;}catch{dirty=true;}
  $('#site-save-state').textContent=dirty?'Unsaved changes':'All changes saved';$('#site-save-state').classList.toggle('has-edits',dirty);
  $('#save-site').disabled=!dirty;$('#save-site-top').disabled=!dirty;$('#site-question-count').textContent=questions().length+' / 20 questions';$('#add-site-question').disabled=questions().length>=20;
  const fields=form().elements;fields.announcementText.required=fields.enabled.checked;$('#contact-preview-phone').textContent=fields.phone.value||'Business phone';$('#contact-preview-email').textContent=fields.email.value||'Business email';$('#contact-preview-address').textContent=fields.address.value||'Business address';$('#contact-preview-hours').textContent=fields.hours.value||'Visiting hours';
  $('#announcement-preview-copy').textContent=fields.announcementText.value||'An update for your customers will appear here.';
  const start=fields.startsAt.value?Date.parse(fields.startsAt.value):-Infinity,end=fields.endsAt.value?Date.parse(fields.endsAt.value):Infinity;
  $('#announcement-preview-state').textContent=!fields.enabled.checked?'Hidden on the website':end<=Date.now()?'Expired — no longer visible':start>Date.now()?'Scheduled for '+new Date(start).toLocaleString():'Visible on the homepage';
 }
 function renderQuestions(items){
  $('#site-questions').innerHTML=items.map((q,index)=>`<article class="managed-question"><div class="question-top"><span>Question ${index+1}</span><div><button type="button" class="icon-button" data-question-up="${index}" aria-label="Move question ${index+1} earlier in its category"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 14 6-6 6 6"/></svg></button><button type="button" class="icon-button" data-question-down="${index}" aria-label="Move question ${index+1} later in its category"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 10 6 6 6-6"/></svg></button><button type="button" class="text-action" data-question-remove="${index}" ${items.length===1?'disabled':''}>Remove</button></div></div><label class="field"><span>Category</span><select>${groups.map(g=>`<option ${g===q.group?'selected':''}>${g}</option>`).join('')}</select></label><label class="field"><span>Question</span><input value="${e(q.question)}" maxlength="180" required></label><label class="field"><span>Answer</span><textarea rows="3" maxlength="1600" required>${e(q.answer)}</textarea></label></article>`).join('');
  reorderButtons();
 }
 function reorderButtons(){const items=questions();for(const [i,row] of [...$('#site-questions').children].entries()){row.querySelector('[data-question-up]').disabled=!items.slice(0,i).some(q=>q.group===items[i].group);row.querySelector('[data-question-down]').disabled=!items.slice(i+1).some(q=>q.group===items[i].group);}}
 function render(){
  const s=saved.settings;
  for(const key of ['phone','email','address','hours'])form().elements[key].value=s[key];
  form().elements.enabled.checked=s.announcement.enabled;form().elements.announcementText.value=s.announcement.text;
  form().elements.startsAt.value=localDate(s.announcement.startsAt);form().elements.endsAt.value=localDate(s.announcement.endsAt);
  renderQuestions(s.faq);baseline=snapshot();$('#site-updated').textContent='Last saved '+new Date(saved.updatedAt).toLocaleString();$('#site-error').textContent='';status();
 }
 async function loadSite(){
  if(loading)return;loading=true;$('#site-loading').hidden=false;form().hidden=true;$('#site-load-error').hidden=true;
  try{saved=await api('admin/site');render();form().hidden=false;window.JHTUI?.enter($('.site-management-grid'),{duration:220,distance:6});}
  catch(error){$('#site-load-error').hidden=false;$('#site-load-error p').textContent=error.message;}
  finally{loading=false;$('#site-loading').hidden=true;}
 }
 async function beforeLeave(){
  if(!dirty)return true;
  const discard=await window.JHTUI.confirm({title:'Leave your unsaved changes?',message:'Your website still uses the last saved version. Stay here to save your edits, or discard this draft.',label:'Discard changes',cancelLabel:'Keep editing'});
  if(discard)render();return discard;
 }
 const labels={'auction.start':'Bidding opened','auction.notice':'Opening notice posted','auction.close':'Car bidding closed','vehicle.create.success':'Vehicle added','vehicle.update.success':'Vehicle updated','vehicle.delete.success':'Vehicle deleted','notice.create.success':'Notice added','notice.update.success':'Notice updated','notice.delete.success':'Notice removed','homepage.update.success':'Homepage selection saved','site.update.success':'Website settings saved','photo.upload.success':'Photo uploaded','stock.export.success':'Stock CSV exported','bid.vehicle.save':'Bidding car saved','bidder.invited':'Member invitation created','bidder.access.update':'Member access updated','bid.accepted':'Bid accepted','auction.draft':'Session draft saved','auction.scheduled':'Bidding session scheduled','auction.cancel':'Bidding session cancelled','auction.confirm':'Winning bid confirmed'};
 function renderActivity(){
  $('#activity-list').innerHTML=events.length?events.map(item=>`<article class="activity-entry"><span class="activity-marker" aria-hidden="true"></span><div><h2>${e(labels[item.action]||'Workspace updated')}</h2><p>${e(item.record)}</p><small>${e(item.actor)}</small></div><time datetime="${e(item.at)}">${e(new Date(item.at).toLocaleString())}</time></article>`).join(''):'<div class="operations-empty"><h2>Your history starts here.</h2><p>Saved changes, stock exports and bidding activity will appear in this view.</p></div>';
  $('#activity-more').hidden=!cursor;
 }
 async function loadActivity(reset=true){
  const ticket=++activityTicket;$('#activity-error').textContent='';$('#activity-list').setAttribute('aria-busy','true');$('#activity-refresh').disabled=true;$('#activity-more').disabled=true;
  if(reset)$('#activity-list').innerHTML='<div class="operations-loading" role="status"><span class="auction-spinner" aria-hidden="true"></span>Loading recent changes…</div>';
  try{
   const category=$('#activity-category').value,result=await api('admin/activity?category='+encodeURIComponent(category)+(reset||!cursor?'':'&before='+encodeURIComponent(cursor)));
   if(ticket!==activityTicket)return;
   events=reset?result.events:[...events,...result.events];cursor=result.nextCursor;renderActivity();if(reset)window.JHTUI?.enter($('#activity-list'),{duration:220,distance:6});
  }catch(error){if(ticket===activityTicket){$('#activity-error').textContent=error.message;renderActivity();}}
  finally{if(ticket===activityTicket){$('#activity-list').removeAttribute('aria-busy');$('#activity-refresh').disabled=false;$('#activity-more').disabled=false;}}
 }
 async function exportStock(){await operate(async()=>{
  const response=await fetch('/api/admin/stock.csv',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(30000)});
  if(!response.ok){if([401,403].includes(response.status)){location.replace('/admin/');return;}const error=await response.json();throw Error(error.error||'The stock export could not be prepared.');}
  if(!response.headers.get('content-type')?.startsWith('text/csv'))throw Error('The server did not return a stock file. Please try again.');
  if(stockUrl)URL.revokeObjectURL(stockUrl);stockUrl=URL.createObjectURL(await response.blob());const a=$('#stock-download-link');a.href=stockUrl;a.download='jht-stock-'+new Date().toISOString().slice(0,10)+'.csv';$('#stock-download-time').textContent='Prepared '+new Date().toLocaleString();$('#stock-download').hidden=false;a.click();toast('Stock export prepared. Use the download link if it does not start automatically.');
 },'Preparing your stock export…');}
 function init(dependencies){
  ({api,operate,showToast:toast}=dependencies);
  $('#site-timezone').textContent='Schedule uses '+Intl.DateTimeFormat().resolvedOptions().timeZone+'.';
  form().addEventListener('input',status);form().addEventListener('change',()=>{reorderButtons();status();});
  form().addEventListener('submit',async event=>{event.preventDefault();if(!saved||!dirty||!form().reportValidity())return;$('#site-error').textContent='';await operate(async()=>{
   try{saved=await api('admin/site',body(),'PUT');render();toast('Website saved. Contact details, questions and the announcement are updated.');}
   catch(error){$('#site-error').textContent=error.message;throw error;}
  },'Updating your website…');status();});
  $('#reload-site').addEventListener('click',async()=>{if(await beforeLeave())loadSite();});$('#retry-site').addEventListener('click',loadSite);
  $('#add-site-question').addEventListener('click',()=>{const list=questions();if(list.length>=20)return;list.push({group:'Finding a car',question:'',answer:''});renderQuestions(list);status();const row=$('#site-questions').lastElementChild;row.querySelector('input').focus();window.JHTUI?.enter(row,{duration:180,distance:5});});
  $('#site-questions').addEventListener('click',async event=>{
   const remove=event.target.closest('[data-question-remove]'),up=event.target.closest('[data-question-up]'),down=event.target.closest('[data-question-down]');
   if(!remove&&!up&&!down)return;
   const list=questions(),index=Number((remove||up||down).dataset[remove?'questionRemove':up?'questionUp':'questionDown']);
   if(remove){if(list.length<=1||!await window.JHTUI.confirm({title:'Remove this question?',message:'It will be removed from your draft. The public FAQ changes only after you save the website.',label:'Remove question'}))return;list.splice(index,1);}
   else{const direction=up?-1:1;let target=index+direction;while(target>=0&&target<list.length&&list[target].group!==list[index].group)target+=direction;if(target<0||target>=list.length)return;[list[index],list[target]]=[list[target],list[index]];}
   renderQuestions(list);status();
  });
  $('#activity-category').addEventListener('change',()=>loadActivity());$('#activity-refresh').addEventListener('click',()=>loadActivity());$('#activity-more').addEventListener('click',()=>loadActivity(false));$('#export-stock').addEventListener('click',exportStock);
  document.addEventListener('jht:admin-view',event=>{if(event.detail==='site'&&!saved)loadSite();if(event.detail==='activity')loadActivity();});
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
 }
 window.JHTOperations={init,beforeLeave};
})();
