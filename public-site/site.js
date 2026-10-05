'use strict';
const $=id=>document.getElementById(id);
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const iconPaths={
  '↗':'<path d="M7 17 17 7M9 7h8v8"/>','↑':'<path d="M12 19V5M6.5 10.5 12 5l5.5 5.5"/>','↓':'<path d="M12 5v14M6.5 13.5 12 19l5.5-5.5"/>',
  '←':'<path d="M19 12H5M10.5 6.5 5 12l5.5 5.5"/>','→':'<path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5"/>','×':'<path d="m7 7 10 10M17 7 7 17"/>'
};
function replaceGlyphIcons(root=document.body){
  if(!root)return;const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];
  while(walker.nextNode())if(/[↗↑↓←→×]/.test(walker.currentNode.nodeValue))nodes.push(walker.currentNode);
  for(const node of nodes){const fragment=document.createDocumentFragment();for(const part of node.nodeValue.split(/([↗↑↓←→×])/)){if(!part)continue;if(iconPaths[part]){const holder=document.createElement('span');holder.innerHTML=`<svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${iconPaths[part]}</svg>`;fragment.append(holder.firstChild)}else fragment.append(document.createTextNode(part))}node.replaceWith(fragment)}
}
replaceGlyphIcons();
new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1||node.nodeType===3)replaceGlyphIcons(node)}).observe(document.body,{childList:true,subtree:true});

const scrollLocks=new Set();let lockedScroll=0;
function setScrollLock(open,key){if(open){if(!scrollLocks.size){lockedScroll=scrollY;document.body.style.setProperty('--locked-top',(-lockedScroll)+'px')}scrollLocks.add(key)}else scrollLocks.delete(key);document.body.classList.toggle('scroll-locked',scrollLocks.size>0);if(!scrollLocks.size)scrollTo(0,lockedScroll)}
window.jhtScrollLock=setScrollLock;
const menu=$('menu-toggle'),mobile=$('mobile-nav');
let menuTicket=0;
function closeMenu(instant=false){
 if(!menu||!mobile||mobile.hidden)return;
 const ticket=++menuTicket;
 const finish=()=>{if(ticket!==menuTicket)return;mobile.hidden=true;setScrollLock(false,'menu');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Open navigation');mobile.inert=false;menu.focus({preventScroll:true})};
 if(instant||reduce||document.documentElement.classList.contains('keyboard-navigation')){finish();return}
 mobile.inert=true;const animation=mobile.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-8px)'}],{duration:160,easing:'cubic-bezier(.23,1,.32,1)'});animation.finished.catch(()=>{}).then(finish);
}
if(menu&&mobile){
 menu.addEventListener('click',()=>{if(!mobile.hidden){closeMenu();return}++menuTicket;mobile.hidden=false;mobile.inert=false;setScrollLock(true,'menu');menu.setAttribute('aria-expanded','true');menu.setAttribute('aria-label','Close navigation');window.JHTUI?.enter(mobile,{duration:220,distance:-8});mobile.querySelector('a')?.focus({preventScroll:true})});
 mobile.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>closeMenu(true)));
 addEventListener('keydown',e=>{if(mobile.hidden)return;if(e.key==='Escape')closeMenu();if(e.key==='Tab'){const controls=[menu,...mobile.querySelectorAll('a')],first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
 addEventListener('resize',()=>{if(innerWidth>1100&&!mobile.hidden)closeMenu(true)},{passive:true});
}
const scrollOrbit=document.createElement('div');scrollOrbit.className='scroll-orbit';scrollOrbit.setAttribute('aria-hidden','true');scrollOrbit.innerHTML='<span></span>';document.body.append(scrollOrbit);
function updateScrollOrbit(){const max=Math.max(1,document.documentElement.scrollHeight-innerHeight),progress=Math.min(1,Math.max(0,scrollY/max)),track=Math.max(0,scrollOrbit.clientHeight-14);scrollOrbit.firstElementChild.style.transform='translateY('+(progress*track)+'px)'}
let scrollTick=false;addEventListener('scroll',()=>{if(scrollTick)return;scrollTick=true;requestAnimationFrame(()=>{if($('header'))$('header').classList.toggle('scrolled',scrollY>70);updateScrollOrbit();scrollTick=false})},{passive:true});
addEventListener('resize',updateScrollOrbit,{passive:true});updateScrollOrbit();

const themeButton=document.querySelector('.theme-toggle');
function setTheme(theme,save=false){document.documentElement.dataset.theme=theme;themeButton?.setAttribute('aria-label',theme==='dark'?'Switch to light mode':'Switch to dark mode');if(themeButton)themeButton.querySelector('.theme-label').textContent=theme==='dark'?'Light':'Dark';if(save)try{localStorage.setItem('jht-theme',theme)}catch(e){}}
setTheme(document.documentElement.dataset.theme||'light');
themeButton?.addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark',true));

const intro=document.querySelector('.site-intro');
function enterHero(){
 document.documentElement.classList.add('hero-ready');
 const elements=[document.querySelector('.hero-welcome'),document.querySelector('.hero-copy h1'),document.querySelector('.hero-intro'),document.querySelector('.hero-actionbar')];
 elements.forEach((element,index)=>window.JHTUI?.enter(element,{duration:700,distance:index===1?22:12,delay:index*85}));
}
if(intro&&document.documentElement.classList.contains('has-intro')){setTimeout(()=>{document.documentElement.classList.remove('has-intro');try{sessionStorage.setItem('jht-intro-seen','1')}catch(e){};enterHero()},1500)}else requestAnimationFrame(enterHero);

const video=$('hero-video'),motion=$('motion-toggle'),hero=document.querySelector('.hero');
let heroVisible=true;
function syncVideo(){if(!video||video.hidden)return;if(document.hidden||!heroVisible||document.body.classList.contains('motion-paused'))video.pause();else video.play().catch(()=>{})}
if(motion){motion.textContent='';motion.addEventListener('click',()=>{const paused=document.body.classList.toggle('motion-paused');motion.setAttribute('aria-pressed',String(paused));motion.setAttribute('aria-label',paused?'Play background motion':'Pause background motion');syncVideo()})}
if(video&&!reduce){video.addEventListener('playing',()=>video.parentElement.classList.add('video-ready'));video.addEventListener('error',()=>video.parentElement.classList.remove('video-ready'));video.src=video.dataset.src;syncVideo();document.addEventListener('visibilitychange',syncVideo);if('IntersectionObserver' in window)new IntersectionObserver(entries=>{heroVisible=entries[0].isIntersecting;syncVideo()},{threshold:.02}).observe(hero)}
if(hero&&!reduce&&matchMedia('(pointer:fine)').matches){let frame=0;hero.addEventListener('pointermove',e=>{if(frame)return;frame=requestAnimationFrame(()=>{const r=hero.getBoundingClientRect();hero.style.setProperty('--mouse-x',(e.clientX-r.left)+'px');hero.style.setProperty('--mouse-y',(e.clientY-r.top)+'px');hero.classList.add('pointer-active');frame=0})});hero.addEventListener('pointerleave',()=>hero.classList.remove('pointer-active'))}

// One reveal system. Every section stays readable before its entrance runs.
const marketingSelectors='.brand-heading,.section-heading,.brand-tile,.company-story,.company-service,.config-heading,.config-workspace,.config-film,.location-copy,.map-shell,.home-contact .wrap,.catalogue-hero .wrap,.vehicle-intro,.vehicle-summary,.info-hero .wrap,.faq-group,.guide-steps article,.notice-row,.footer-lead,.footer-navigation,.featured-photo,.featured-copy';
function revealSections(root=document){
  const nodes=[...root.querySelectorAll(marketingSelectors)].filter(el=>!el.dataset.motionObserved);
  if(reduce||!('IntersectionObserver' in window))return;
  const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){
    const element=entry.target;
    const siblings=element.matches('.brand-tile,.company-service')?[...element.parentElement.children].indexOf(element)%5:0;
    window.JHTUI?.enter(element,{duration:500,distance:14,delay:siblings*40});observer.unobserve(element);
  }},{threshold:.06,rootMargin:'0px 0px -24px 0px'});
  for(const node of nodes){node.dataset.motionObserved='true';observer.observe(node)}
}
window.jhtReveal=revealSections;revealSections();

const rail=$('latest-carousel');
function initCarousel(){
if(!rail||rail.dataset.livePending==='true'||rail.dataset.initialized==='true')return;
rail.dataset.initialized='true';
  const originals=[...rail.querySelectorAll('.car-card')];
  if(originals.length<2){$('latest-prev')?.setAttribute('disabled','');$('latest-next')?.setAttribute('disabled','');return}
  for(const card of originals){const clone=card.cloneNode(true);clone.removeAttribute('data-reveal');clone.removeAttribute('style');clone.setAttribute('aria-hidden','true');clone.querySelectorAll('a,button,[tabindex]').forEach(el=>el.tabIndex=-1);rail.append(clone)}
  let dragging=false,startX=0,startScroll=0,moved=false,last=performance.now(),pauseUntil=0;
  const cycle=()=>rail.children[originals.length]?.offsetLeft-originals[0]?.offsetLeft||0;
  const stride=()=>originals[1]?.offsetLeft-originals[0]?.offsetLeft||280;
  const normalize=()=>{const width=cycle();if(!width)return;if(rail.scrollLeft>=width)rail.scrollLeft-=width;if(rail.scrollLeft<0)rail.scrollLeft+=width};
  function step(){const time=performance.now(),delta=Math.min(60,time-last||16);last=time;const bounds=rail.getBoundingClientRect();if(bounds.bottom>0&&bounds.top<innerHeight&&!document.hidden&&!dragging&&!rail.contains(document.activeElement)&&!document.body.classList.contains('motion-paused')&&time>pauseUntil&&!reduce){rail.scrollLeft+=delta*.034;normalize()}}
  if(!reduce)setInterval(step,24);
  function nudge(dir){pauseUntil=performance.now()+2600;if(dir<0&&rail.scrollLeft<stride())rail.scrollLeft+=cycle();rail.scrollBy({left:stride()*dir,behavior:reduce?'instant':'smooth'});setTimeout(normalize,650)}
  $('latest-prev')?.addEventListener('click',()=>nudge(-1));$('latest-next')?.addEventListener('click',()=>nudge(1));
  rail.addEventListener('pointerdown',e=>{dragging=true;if(e.pointerType==='touch')return;moved=false;startX=e.clientX;startScroll=rail.scrollLeft;rail.classList.add('is-dragging');rail.setPointerCapture(e.pointerId)});
  rail.addEventListener('pointermove',e=>{if(!dragging||e.pointerType==='touch')return;const distance=e.clientX-startX;if(Math.abs(distance)>5)moved=true;if(startScroll-distance<0)startScroll+=cycle();rail.scrollLeft=startScroll-distance;normalize()});
  function stopDrag(){if(!dragging)return;dragging=false;pauseUntil=performance.now()+2200;rail.classList.remove('is-dragging');setTimeout(()=>moved=false,100)}
  rail.addEventListener('pointerup',stopDrag);rail.addEventListener('pointercancel',stopDrag);
  rail.addEventListener('click',e=>{if(moved){e.preventDefault();e.stopPropagation();moved=false}},true);
  rail.addEventListener('focusin',()=>pauseUntil=performance.now()+4000);
  rail.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse')pauseUntil=Infinity});rail.addEventListener('pointerleave',()=>{pauseUntil=performance.now()+1200});
  rail.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();nudge(e.key==='ArrowRight'?1:-1)}});
}

window.jhtInitCarousel=initCarousel;initCarousel();

const play=document.querySelector('.film-play');
play?.addEventListener('click',()=>{const id=play.dataset.videoId;const frame=document.createElement('iframe');frame.src=`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0`;frame.title='JHT Korea video';frame.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';play.replaceWith(frame)});

const configCar=$('config-car');
if(configCar){
  const stage=document.querySelector('.config-stage'),model=$('config-model'),colorLabel=$('config-color-label'),enquiry=$('config-enquiry'),otherStage=$('config-any-brand'),customBrandWrap=$('config-custom-brand-wrap'),customBrand=$('config-custom-brand');
  const brandNames={bmw:'BMW',hyundai:'Hyundai',kia:'Kia',volkswagen:'Volkswagen'};
  const colorNames={blue:'Electric blue',red:'Performance red',silver:'Pearl silver',black:'Obsidian black'};
  const brandButtons=[...document.querySelectorAll('.config-brand')],colorButtons=[...document.querySelectorAll('.config-color')];
  let brand='bmw',color='blue',changeTimer=0,arrivalTimer=0,selectionSeq=0;
  function updateEnquiry(){
    const year=$('config-year').value,budget=$('config-budget').value,body=$('config-body').value;
    const chosenBrand=brand==='other'?(customBrand.value.trim()||'another brand'):brandNames[brand];
    const message=`Hello JHT Korea, I’d like help sourcing a car. Brand: ${chosenBrand}. Body style: ${body}. Color preference: ${colorNames[color]}. Preferred year: ${year}. Budget: ${budget}. Could you help find suitable options and confirm the actual vehicle, price and shipping?`;
    enquiry.href='https://wa.me/821036563439?text='+encodeURIComponent(message);
    enquiry.setAttribute('aria-label',`Ask JHT Korea to source ${chosenBrand} in ${colorNames[color]}`);
  }
  function selectButton(buttons,key,value){for(const button of buttons){const active=button.dataset[key]===value;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active))}}
  function showCar(drive){
    const ticket=++selectionSeq;
    clearTimeout(changeTimer);clearTimeout(arrivalTimer);
    configCar.classList.remove('is-arriving');configCar.classList.add('is-leaving');
    stage.classList.remove('is-driving');
    const isOther=brand==='other';customBrandWrap.hidden=!isOther;
    changeTimer=setTimeout(()=>{
      if(isOther){configCar.hidden=true;otherStage.hidden=false;model.textContent='YOUR CHOICE · SOURCING REQUEST';colorLabel.textContent=colorNames[color];updateEnquiry();return}
      const src=`/jhtkorea/assets/config2-${brand}-${color}.webp`;
      const nextImage=new Image();nextImage.src=src;
      const reveal=()=>{
        if(ticket!==selectionSeq)return;
        otherStage.hidden=true;configCar.hidden=false;
        configCar.src=src;configCar.alt=`Illustration of a ${colorNames[color].toLowerCase()} ${brandNames[brand]} SUV`;
        model.textContent=`${brandNames[brand].toUpperCase()} · SUV ILLUSTRATION`;
        colorLabel.textContent=colorNames[color];
        configCar.classList.remove('is-leaving');
        if(drive&&!reduce){void configCar.offsetWidth;configCar.classList.add('is-arriving');stage.classList.add('is-driving');arrivalTimer=setTimeout(()=>stage.classList.remove('is-driving'),1200)}
      };
      if(nextImage.complete)reveal();else nextImage.onload=reveal;
    },drive?180:120);
    updateEnquiry();
  }
  for(const button of brandButtons)button.addEventListener('click',()=>{brand=button.dataset.brand;selectButton(brandButtons,'brand',brand);showCar(brand!=='other');if(brand==='other')customBrand.focus()});
  for(const button of colorButtons)button.addEventListener('click',()=>{if(color===button.dataset.color)return;color=button.dataset.color;selectButton(colorButtons,'color',color);showCar(false)});
  customBrand.addEventListener('input',updateEnquiry);
  $('config-body').addEventListener('change',updateEnquiry);$('config-year').addEventListener('change',updateEnquiry);$('config-budget').addEventListener('change',updateEnquiry);
  updateEnquiry();
}
