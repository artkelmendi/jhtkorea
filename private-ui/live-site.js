(() => {
 'use strict';
 function apply(site){
  const digits=site.phone.replace(/\D/g,''),wa='https://wa.me/'+digits,tel='tel:+'+digits;
  function links(root){
   const anchors=root.matches?.('a')?[root]:[...root.querySelectorAll?.('a')||[]];
   for(const a of anchors){
    const old=a.getAttribute('href')||'';let next=old;
    if(/^https:\/\/wa\.me\/\d+/.test(old))next=old.replace(/^https:\/\/wa\.me\/\d+/,wa);
    if(old.startsWith('tel:'))next=tel;
    if(old.startsWith('mailto:')){next='mailto:'+site.email;a.textContent=site.email;}
    if(next!==old)a.setAttribute('href',next);
    if((old.startsWith('tel:')||old.startsWith('https://wa.me/'))&&/^\+?[\d ()-]+$/.test(a.textContent.trim())){
     for(const node of a.childNodes)if(node.nodeType===3&&node.textContent.trim())node.textContent=site.phone+' ';
    }
   }
  }
  links(document);
  new MutationObserver(records=>{for(const r of records){if(r.type==='attributes')links(r.target);else for(const node of r.addedNodes)if(node.nodeType===1)links(node);}}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['href']});
  const address=document.querySelector('#location address');if(address)address.textContent=site.address;
  const visit=document.querySelector('.location-details>div:first-child small');if(visit)visit.textContent=site.hours;
  const card=document.querySelector('.location-map-card strong');if(card)card.textContent=site.address;
  const map='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(site.address);
  for(const a of document.querySelectorAll('#location a[href*="google.com/maps"]'))a.href=map;
  const contact=document.querySelector('.footer-navigation>div:last-child');
  if(contact){const info=[...contact.querySelectorAll('span')].find(s=>s.textContent.includes('Incheon'));if(info)info.textContent=site.address;const hours=document.createElement('span');hours.className='public-visiting-hours';hours.textContent=site.hours;contact.append(hours);}
  if(site.announcement&&document.querySelector('.hero')){
   const section=document.createElement('aside');section.className='public-announcement';section.setAttribute('aria-label','Update from JHT Korea');
   const wrap=document.createElement('div');wrap.className='wrap';const label=document.createElement('span');label.textContent='From our team';
   const text=document.createElement('p');text.textContent=site.announcement.text;wrap.append(label,text);section.append(wrap);document.querySelector('.hero').after(section);
  }
  const faqs=document.querySelector('.faq-groups');
  if(faqs){
   const fragment=document.createDocumentFragment();
   for(const group of ['Finding a car','Buying & payment','Shipping & arrival']){
    const questions=site.faq.filter(q=>q.group===group);if(!questions.length)continue;
    const section=document.createElement('section');section.className='faq-group';const heading=document.createElement('h2');heading.textContent=group;section.append(heading);
    for(const q of questions){const details=document.createElement('details'),summary=document.createElement('summary'),answer=document.createElement('p');summary.textContent=q.question;answer.textContent=q.answer;answer.className='managed-answer';details.append(summary,answer);section.append(details);}fragment.append(section);
   }
   faqs.replaceChildren(fragment);window.jhtReveal?.(faqs);
   const attribution=document.querySelector('.info-source-note');if(attribution)attribution.remove();
  }
 }
 fetch('/api/public/site',{cache:'no-store',signal:AbortSignal.timeout(10000)}).then(async r=>{if(!r.ok)throw Error('Website information unavailable');return r.json();}).then(apply).catch(()=>{
  // Existing bundled contact and help content remains usable during a temporary outage.
 });
})();
