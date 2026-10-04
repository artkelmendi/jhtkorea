import { HttpError, exactKeys, noStoreHeaders } from './policy.mjs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const asset=value=>typeof value==='string' && (/^assets\/[a-z0-9][a-z0-9._-]*\.(?:webp|jpe?g|png)$/i.test(value)||/^api\/media\/[0-9a-f-]{36}\.webp$/.test(value));
export const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>'$'+Number(n).toLocaleString('en-US',{maximumFractionDigits:0});
export function publicVehicle(row) {
  const p=row.payload||{};
  // Deliberate projection: never forward arbitrary JSON, source data, notes or owner identifiers.
  return {id:row.id,slug:row.slug,status:row.status,brand:p.brand,model:p.model,ref:p.ref,body:p.body,fuel:p.fuel,transmission:p.transmission,year:p.year,price:p.price,mileage:p.mileage,seats:p.seats,image:asset(p.image)?p.image:'assets/car-1.webp',gallery:Array.isArray(p.gallery)?p.gallery.filter(asset).slice(0,12):[],createdAt:Date.parse(row.created_at)};
}
export function validateNotice(body) {
  exactKeys(body,['slug','title','content','status','version']);
  if(typeof body.slug!=='string'|| !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug)||body.slug.length>100||typeof body.title!=='string'||!body.title.trim()||body.title.length>160||typeof body.content!=='string'||!body.content.trim()||body.content.length>15000||!['published','draft'].includes(body.status))throw new HttpError(400,'Check the notice title and text.');
  return {slug:body.slug,title:body.title.trim(),content:body.content.trim(),status:body.status};
}
export async function publishedRows(service) {
  const {data,error}=await service.from('jht_vehicles').select('id,slug,status,payload,created_at').in('status',['available','reserved']).order('created_at',{ascending:false}).limit(500);
  if(error)throw new HttpError(503,'The collection is temporarily unavailable.');return data;
}
let shell;
async function page(main,title,status=200) {
  shell ||= await readFile(new URL('./templates/page.html',import.meta.url),'utf8');
  const html=shell.replace('JHT_PAGE_TITLE',escape(title)).replace('JHT_PAGE_MAIN',main);
  const hashes=[...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>`'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`).join(' ');
  const csp=`default-src 'none'; script-src 'self' ${hashes}; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; font-src 'self'; media-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'`;
  return new Response(html,{status,headers:{...noStoreHeaders,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':csp}});
}
export async function unavailablePage(status=404) {
  return page(`<main class="info-page" id="main"><section class="info-hero"><div class="wrap"><p class="section-overline">JHT KOREA</p><h1>${status===404?'This listing is unavailable.':'Please try again shortly.'}</h1><p>${status===404?'It may have been sold or removed. Explore the current collection or tell us what you are looking for.':'The collection is temporarily unavailable. Your enquiry is always welcome.'}</p><a class="button dark" href="/cars/">Explore available cars</a></div></section></main>`,status===404?'Listing unavailable · JHT Korea':'Collection unavailable · JHT Korea',status);
}
export async function vehiclePage(row) {
  const c=publicVehicle(row),e=escape,title=`${c.year} ${c.brand} ${c.model}`,images=[...new Set([c.image,...c.gallery])];
  const main=`<main class="vehicle-page" id="main"><div class="wrap breadcrumb"><a href="/">Home</a><span>/</span><a href="/cars/">Cars</a><span>/</span><span>${e(c.brand)} ${e(c.model)}</span></div><section class="vehicle-intro wrap"><div><p class="section-overline">${e(c.brand)} / ${c.year}${c.status==='reserved'?' · RESERVED':''}</p><h1>${e(c.model)}</h1><p>${e(c.ref)} · ${e(c.body)} · ${e(c.fuel)}</p></div><div class="intro-price"><span>LISTED PRICE</span><strong>${money(c.price)}</strong><small>USD · Shipping quoted separately</small></div></section><section class="vehicle-layout wrap"><div class="vehicle-gallery"><div class="gallery-main"><img id="gallery-main-image" src="/${e(images[0])}" alt="${e(title)}, photo 1" width="1200" height="800"><button class="gallery-prev" aria-label="Previous photo">←</button><button class="gallery-next" aria-label="Next photo">→</button><span class="gallery-count">1 / ${images.length}</span></div><div class="gallery-thumbnails">${images.map((image,i)=>`<button class="gallery-thumb${i?'':' active'}" data-image="/${e(image)}" aria-label="View photo ${i+1}" aria-pressed="${i===0}"><img src="/${e(image)}" alt="${e(title)} photo ${i+1}" width="180" height="120" loading="lazy"></button>`).join('')}</div></div><aside class="vehicle-summary"><p class="section-overline">YOUR NEXT STEP</p><h2>${c.status==='reserved'?'Currently reserved.':'Take a closer look.'}</h2><p>${c.status==='reserved'?'Contact our team for the latest availability or similar vehicles.':'Ask our team about this vehicle, its condition and delivery options.'}</p><a class="button dark" href="https://wa.me/821036563439?text=${encodeURIComponent('Hello JHT Korea, I am interested in '+title+' ('+c.ref+').')}" target="_blank" rel="noopener">Enquire on WhatsApp ↗</a><a class="text-link" href="/purchase-guide/">How purchasing works ↗</a></aside></section><section class="vehicle-spec-section wrap"><div class="spec-heading"><div><h2>The details.</h2><p>Clear information for your next move.</p></div></div><dl class="vehicle-specs">${Object.entries({'Year':c.year,'Mileage':c.mileage===null?'Confirm with team':Number(c.mileage).toLocaleString()+' km','Fuel':c.fuel,'Transmission':c.transmission,'Seats':c.seats,'Body style':c.body,'Reference':c.ref,'Availability':c.status}).map(([key,value])=>`<div><dt>${e(key)}</dt><dd>${e(value)}</dd></div>`).join('')}</dl><div class="listing-note"><p>Confirm condition, availability and final shipping costs with JHT Korea before purchase.</p></div></section></main>`;
  return page(main,title+' · JHT Korea');
}
export async function noticesPage(rows) {
  return page(`<main class="info-page" id="main"><section class="info-hero notices-hero"><div class="wrap"><p class="section-overline">UPDATES</p><h1>Notices<br><em>from the team.</em></h1><p>Service information and shipping updates from JHT Korea.</p></div></section><section class="info-content wrap notices-layout">${rows.length?rows.map(n=>`<a class="notice-row" href="/notices/${escape(n.slug)}/"><span class="notice-date">${escape(new Date(n.created_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}))}</span><div><strong>${escape(n.title)}</strong><small>JHT Korea update</small></div><span>↗</span></a>`).join(''):'<p>No notices at the moment. Contact our team for current shipping information.</p>'}</section></main>`,'Notices · JHT Korea');
}
export async function noticePage(n) {
  return page(`<main class="info-page" id="main"><section class="info-hero"><div class="wrap"><p class="section-overline">JHT KOREA UPDATE</p><h1>${escape(n.title)}</h1><p>${escape(new Date(n.created_at).toLocaleDateString('en-GB'))}</p></div></section><section class="info-content wrap"><div class="notice-content">${n.content.split(/\n\s*\n/).map(p=>`<p>${escape(p).replaceAll('\n','<br>')}</p>`).join('')}</div><a class="text-link" href="/notices/">All notices ↗</a></section></main>`,n.title+' · JHT Korea');
}
