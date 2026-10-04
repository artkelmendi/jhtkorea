(()=>{
  'use strict';
  const rail=document.getElementById('latest-carousel');if(!rail)return;
  const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>'$'+Number(n).toLocaleString('en-US');
  fetch('/api/public/catalogue',{cache:'no-store'}).then(async result=>{if(!result.ok)throw Error('Collection unavailable');return result.json();}).then(data=>{
    const cars=window.JHTSecurity.vehicles(data.vehicles),settings=data.homepage;
    const available=cars.filter(car=>car.status==='available');
    const latest=settings.arrival_order==='manual'?settings.arrival_ids.map(id=>available.find(car=>car.id===id)).filter(Boolean):available.slice(0,10);
    rail.innerHTML=latest.length?latest.map(car=>`<article class="car-card"><a class="car-photo" href="/cars/${e(car.slug)}/"><img src="/${e(car.image)}" alt="${e(car.year+' '+car.brand+' '+car.model)}" width="800" height="563" loading="lazy"><span class="car-type">${e(car.body.toUpperCase())}</span></a><div class="car-info"><p class="car-meta">${e(car.brand)} / ${car.year}</p><h3><a href="/cars/${e(car.slug)}/">${e(car.model)}</a></h3><p class="car-specs"><span>${e(car.fuel)}</span><span>${e(car.transmission)}</span><span>${car.seats} seats</span></p><div class="car-bottom"><p class="car-price">${money(car.price)}<small>USD</small></p><a class="view-car" href="/cars/${e(car.slug)}/">View car ↗</a></div></div></article>`).join(''):'<p class="collection-message">New arrivals are on their way. Tell us what you are looking for.</p>';
    rail.dataset.livePending='false';if(latest.length)window.jhtInitCarousel?.();
    const feature=available.find(car=>car.id===settings.featured_id);
    if(feature){
      const video=document.getElementById('hero-video');if(video){video.pause();video.removeAttribute('data-src');video.removeAttribute('src');video.hidden=true;}
      const image=document.querySelector('.hero-media img');image.src='/'+feature.image;image.alt=feature.year+' '+feature.brand+' '+feature.model;image.style.opacity='1';
      document.querySelector('.hero').classList.add('has-featured-car');
      const copy=document.querySelector('.hero-copy');const marker=copy.querySelector('.hero-welcome');marker.textContent=settings.show_label?'Featured vehicle':'JHT Korea';
      copy.querySelector('h1').textContent=feature.brand+' '+feature.model;
      copy.querySelector('.hero-intro').textContent=feature.year+' · '+feature.fuel+' · '+feature.transmission+(settings.show_price?' · '+money(feature.price)+' USD':'');
      const link=copy.querySelector('.hero-action-primary');link.href='/cars/'+feature.slug+'/';link.textContent='Explore this car';
      document.getElementById('motion-toggle').hidden=true;
    }
  }).catch(()=>{rail.innerHTML='<p class="collection-message">The collection could not load. Please refresh or contact our team.</p>';});
})();
