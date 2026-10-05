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
    rail.dataset.livePending='false';if(latest.length){window.jhtInitCarousel?.();window.JHTUI?.enter(rail,{duration:300,distance:8});}
    const feature=available.find(car=>car.id===settings.featured_id);
    const section=document.getElementById('featured-vehicle-section');
    if(feature&&section){
      section.innerHTML='<div class="wrap"><div class="featured-layout"><a class="featured-photo" href="/cars/'+e(feature.slug)+'/" aria-label="View '+e(feature.brand+' '+feature.model)+'"><img src="/'+e(feature.image)+'" alt="'+e(feature.year+' '+feature.brand+' '+feature.model)+'" width="1200" height="850" loading="lazy"></a><div class="featured-copy">'+(settings.show_label?'<p class="section-overline">THE FEATURED VEHICLE</p>':'')+'<p class="featured-make">'+e(feature.brand)+' / '+feature.year+'</p><h2 id="featured-vehicle-title">'+e(feature.model)+'</h2><p class="featured-description">Selected from our collection. Take a closer look at the photos and details, then speak with our team.</p><dl class="featured-specs"><div><dt>Body</dt><dd>'+e(feature.body)+'</dd></div><div><dt>Fuel</dt><dd>'+e(feature.fuel)+'</dd></div><div><dt>Transmission</dt><dd>'+e(feature.transmission)+'</dd></div></dl>'+(settings.show_price?'<p class="featured-price">'+money(feature.price)+'<span>USD · Shipping quoted separately</span></p>':'')+'<a class="featured-action" href="/cars/'+e(feature.slug)+'/">Explore this vehicle <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></a></div></div></div>';
      section.hidden=false;window.jhtReveal?.(section);


    }
  }).catch(()=>{rail.innerHTML='<p class="collection-message">The collection could not load. Please refresh or contact our team.</p>';});
})();
