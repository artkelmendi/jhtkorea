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
function closeMenu(){if(!menu||!mobile)return;mobile.hidden=true;setScrollLock(false,'menu');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Open navigation')}
if(menu&&mobile){menu.addEventListener('click',()=>{const open=mobile.hidden;mobile.hidden=!open;setScrollLock(open,'menu');menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Close navigation':'Open navigation')});mobile.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));addEventListener('keydown',e=>{if(e.key==='Escape'&&!mobile.hidden)closeMenu()})}
const scrollOrbit=document.createElement('div');scrollOrbit.className='scroll-orbit';scrollOrbit.setAttribute('aria-hidden','true');scrollOrbit.innerHTML='<span></span>';document.body.append(scrollOrbit);
function updateScrollOrbit(){const max=Math.max(1,document.documentElement.scrollHeight-innerHeight),progress=Math.min(1,Math.max(0,scrollY/max)),track=Math.max(0,scrollOrbit.clientHeight-14);scrollOrbit.firstElementChild.style.transform='translateY('+(progress*track)+'px)'}
let scrollTick=false;addEventListener('scroll',()=>{if(scrollTick)return;scrollTick=true;requestAnimationFrame(()=>{if($('header'))$('header').classList.toggle('scrolled',scrollY>70);updateScrollOrbit();scrollTick=false})},{passive:true});
addEventListener('resize',updateScrollOrbit,{passive:true});updateScrollOrbit();

const themeButton=document.querySelector('.theme-toggle');
function setTheme(theme,save=false){document.documentElement.dataset.theme=theme;themeButton?.setAttribute('aria-label',theme==='dark'?'Switch to light mode':'Switch to dark mode');if(themeButton)themeButton.querySelector('.theme-label').textContent=theme==='dark'?'Light':'Dark';if(save)try{localStorage.setItem('jht-theme',theme)}catch(e){}}
setTheme(document.documentElement.dataset.theme||'light');
themeButton?.addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark',true));

const intro=document.querySelector('.site-intro');
function enterHero(){document.documentElement.classList.add('hero-ready')}
if(intro&&document.documentElement.classList.contains('has-intro')){setTimeout(()=>{document.documentElement.classList.remove('has-intro');try{sessionStorage.setItem('jht-intro-seen','1')}catch(e){};enterHero()},1500)}else requestAnimationFrame(enterHero);

const video=$('hero-video'),motion=$('motion-toggle'),hero=document.querySelector('.hero');
let heroVisible=true;
function syncVideo(){if(!video)return;if(document.hidden||!heroVisible||document.body.classList.contains('motion-paused'))video.pause();else video.play().catch(()=>{})}
if(motion){motion.textContent='';motion.addEventListener('click',()=>{const paused=document.body.classList.toggle('motion-paused');motion.setAttribute('aria-pressed',String(paused));motion.setAttribute('aria-label',paused?'Play background motion':'Pause background motion');syncVideo()})}
if(video&&!reduce){video.addEventListener('playing',()=>video.parentElement.classList.add('video-ready'));video.addEventListener('error',()=>video.parentElement.classList.remove('video-ready'));video.src=video.dataset.src;syncVideo();document.addEventListener('visibilitychange',syncVideo);if('IntersectionObserver' in window)new IntersectionObserver(entries=>{heroVisible=entries[0].isIntersecting;syncVideo()},{threshold:.02}).observe(hero)}
if(hero&&!reduce&&matchMedia('(pointer:fine)').matches){let frame=0;hero.addEventListener('pointermove',e=>{if(frame)return;frame=requestAnimationFrame(()=>{const r=hero.getBoundingClientRect();hero.style.setProperty('--mouse-x',(e.clientX-r.left)+'px');hero.style.setProperty('--mouse-y',(e.clientY-r.top)+'px');hero.classList.add('pointer-active');frame=0})});hero.addEventListener('pointerleave',()=>hero.classList.remove('pointer-active'))}

if(!reduce&&'IntersectionObserver' in window){document.documentElement.classList.add('motion-enabled');const variants=[['.brand-tile','wipe'],['.service-list article','line'],['.map-shell','uncover'],['.location-copy','edge'],['.home-contact .wrap','uncover'],['.catalogue-hero .wrap','edge'],['.vehicle-intro','edge'],['.vehicle-gallery','uncover'],['.vehicle-summary','edge'],['.footer-grid','line']];for(const [selector,type] of variants)document.querySelectorAll(selector).forEach(el=>{if(!el.dataset.reveal)el.dataset.reveal=type});const revealTargets=new Map();const observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){for(const item of revealTargets.get(e.target)||[])item.classList.add('is-in');observer.unobserve(e.target)}},{threshold:.04,rootMargin:'0px 0px 5% 0px'});document.querySelectorAll('[data-reveal],.reveal').forEach(el=>{const target=el.parentElement||el;if(!revealTargets.has(target)){revealTargets.set(target,[]);observer.observe(target)}revealTargets.get(target).push(el)})}

const rail=$('latest-carousel');
if(rail){
  const originals=[...rail.querySelectorAll('.car-card')];
  for(const card of originals){const clone=card.cloneNode(true);clone.removeAttribute('data-reveal');clone.removeAttribute('style');clone.setAttribute('aria-hidden','true');clone.querySelectorAll('a,button,[tabindex]').forEach(el=>el.tabIndex=-1);rail.append(clone)}
  let dragging=false,startX=0,startScroll=0,moved=false,last=performance.now(),pauseUntil=0;
  const cycle=()=>rail.children[originals.length]?.offsetLeft-originals[0]?.offsetLeft||0;
  const stride=()=>originals[1]?.offsetLeft-originals[0]?.offsetLeft||280;
  const normalize=()=>{const width=cycle();if(!width)return;if(rail.scrollLeft>=width)rail.scrollLeft-=width;if(rail.scrollLeft<0)rail.scrollLeft+=width};
  function step(){const time=performance.now(),delta=Math.min(60,time-last||16);last=time;const bounds=rail.getBoundingClientRect();if(bounds.bottom>0&&bounds.top<innerHeight&&!document.hidden&&!dragging&&time>pauseUntil&&!reduce){rail.scrollLeft+=delta*.034;normalize()}}
  if(!reduce)setInterval(step,24);
  function nudge(dir){pauseUntil=performance.now()+2600;if(dir<0&&rail.scrollLeft<stride())rail.scrollLeft+=cycle();rail.scrollBy({left:stride()*dir,behavior:reduce?'instant':'smooth'});setTimeout(normalize,650)}
  $('latest-prev')?.addEventListener('click',()=>nudge(-1));$('latest-next')?.addEventListener('click',()=>nudge(1));
  rail.addEventListener('pointerdown',e=>{dragging=true;if(e.pointerType==='touch')return;moved=false;startX=e.clientX;startScroll=rail.scrollLeft;rail.classList.add('is-dragging');rail.setPointerCapture(e.pointerId)});
  rail.addEventListener('pointermove',e=>{if(!dragging||e.pointerType==='touch')return;const distance=e.clientX-startX;if(Math.abs(distance)>5)moved=true;if(startScroll-distance<0)startScroll+=cycle();rail.scrollLeft=startScroll-distance;normalize()});
  function stopDrag(){if(!dragging)return;dragging=false;pauseUntil=performance.now()+2200;rail.classList.remove('is-dragging');setTimeout(()=>moved=false,100)}
  rail.addEventListener('pointerup',stopDrag);rail.addEventListener('pointercancel',stopDrag);
  rail.addEventListener('click',e=>{if(moved){e.preventDefault();e.stopPropagation();moved=false}},true);
  rail.addEventListener('focusin',()=>pauseUntil=performance.now()+4000);
  rail.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();nudge(e.key==='ArrowRight'?1:-1)}});
}

if(!reduce&&'IntersectionObserver' in window){
  const motionSelectors=['.brand-heading','.section-heading','.history-layout','.history-signature','.service-list article','.location-copy','.map-shell','.film-copy','.film-frame','.home-contact .wrap','.catalogue-hero .wrap','.vehicle-intro','.vehicle-gallery','.vehicle-summary','.info-hero .wrap','.faq-group','.guide-steps article','.notice-row','.footer-main','.footer-bottom'];
  const motionObserver=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('motion-in');motionObserver.unobserve(entry.target)}},{threshold:.08,rootMargin:'0px 0px -4% 0px'});
  for(const selector of motionSelectors)document.querySelectorAll(selector).forEach(element=>{element.classList.add('motion-piece');motionObserver.observe(element)});
}

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
