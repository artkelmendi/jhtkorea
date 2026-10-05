(() => {
'use strict';
const main=document.getElementById('gallery-main-image'),thumbs=[...document.querySelectorAll('.gallery-thumb')];
if(!main||!thumbs.length)return;let index=0,ticket=0;
async function show(i){
 index=(i+thumbs.length)%thumbs.length;const selected=index,button=thumbs[index],current=++ticket;
 thumbs.forEach((thumb,n)=>{thumb.classList.toggle('active',n===index);thumb.setAttribute('aria-pressed',String(n===index))});
 const ok=await window.JHTUI.photo(main,button.dataset.image,main.alt.replace(/photo \d+$/,`photo ${selected+1}`));
 if(current!==ticket)return;
 document.querySelector('.gallery-count').textContent=ok?`${selected+1} / ${thumbs.length}`:'Photo unavailable · choose another';
 // Selecting a thumbnail must never pull the document to a new scroll position.
}
thumbs.forEach((button,i)=>button.addEventListener('click',()=>show(i)));
document.querySelector('.gallery-prev').onclick=()=>show(index-1);document.querySelector('.gallery-next').onclick=()=>show(index+1);
document.addEventListener('keydown',event=>{if(!document.activeElement.closest('.vehicle-gallery'))return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();show(index+(event.key==='ArrowLeft'?-1:1))}});
})();
