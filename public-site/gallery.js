(()=>{
'use strict';
const main=document.getElementById('gallery-main-image');const thumbs=[...document.querySelectorAll('.gallery-thumb')];if(!main||!thumbs.length)return;let index=0;
function show(i){index=(i+thumbs.length)%thumbs.length;const b=thumbs[index];main.src=b.dataset.image;main.alt=main.alt.replace(/photo \d+$/,`photo ${index+1}`);thumbs.forEach((t,n)=>{t.classList.toggle('active',n===index);t.setAttribute('aria-pressed',String(n===index))});document.querySelector('.gallery-count').textContent=`${index+1} / ${thumbs.length}`;b.scrollIntoView({behavior:'smooth',block:'nearest',inline:'nearest'})}
thumbs.forEach((b,i)=>b.addEventListener('click',()=>show(i)));document.querySelector('.gallery-prev').onclick=()=>show(index-1);document.querySelector('.gallery-next').onclick=()=>show(index+1);document.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'&&document.activeElement.closest('.vehicle-gallery'))show(index-1);if(e.key==='ArrowRight'&&document.activeElement.closest('.vehicle-gallery'))show(index+1)});

})();
