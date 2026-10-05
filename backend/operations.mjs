import {HttpError,exactKeys,noStoreHeaders} from './policy.mjs';
const groups=['Finding a car','Buying & payment','Shipping & arrival'];
function text(value,max,label,empty=false){if(typeof value!=='string'||value.length>max||!empty&&!value.trim()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))throw new HttpError(400,'Check '+label+'.');return value.trim();}
function instant(value){if(value===null)return null;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)||!Number.isFinite(Date.parse(value)))throw new HttpError(400,'Choose valid announcement dates.');const normalized=new Date(value).toISOString();if(normalized!==(value.includes('.')?value:value.replace('Z','.000Z')))throw new HttpError(400,'Choose valid announcement dates.');return normalized;}
export function validateSite(input){
 exactKeys(input,['phone','email','address','hours','announcement','faq','version']);
 if(!Number.isInteger(input.version)||input.version<1)throw new HttpError(400,'Reload the latest website settings.');
 const phone=text(input.phone,32,'the business phone number'),digits=phone.replace(/\D/g,'');
 if(!/^\+[\d ()-]+$/.test(phone)||digits.length<7||digits.length>15)throw new HttpError(400,'Use the international phone format, including + and the country code.');
 const email=text(input.email,254,'the business email');if(!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/.test(email))throw new HttpError(400,'Enter a valid business email.');
 const a=input.announcement;exactKeys(a,['enabled','text','startsAt','endsAt']);if(typeof a.enabled!=='boolean')throw new HttpError(400);
 const announcement={enabled:a.enabled,text:text(a.text,240,'the announcement text',!a.enabled),startsAt:instant(a.startsAt),endsAt:instant(a.endsAt)};
 if(announcement.startsAt&&announcement.endsAt&&Date.parse(announcement.endsAt)<=Date.parse(announcement.startsAt))throw new HttpError(400,'The announcement end must be after its start.');
 if(!Array.isArray(input.faq)||input.faq.length<1||input.faq.length>20)throw new HttpError(400,'Keep between 1 and 20 customer questions.');
 const faq=input.faq.map(item=>{exactKeys(item,['group','question','answer']);if(!groups.includes(item.group))throw new HttpError(400,'Choose a question category.');return {group:item.group,question:text(item.question,180,'each question'),answer:text(item.answer,1600,'each answer')};});
 if(new Set(faq.map(item=>item.question.toLowerCase())).size!==faq.length)throw new HttpError(400,'Each customer question should be unique.');
 return {phone,email,address:text(input.address,300,'the business address'),hours:text(input.hours,300,'visiting hours'),announcement,faq};
}
export function publicSite(payload,now=Date.now()){
 // Revalidate a deliberate projection, never forward arbitrary stored JSON.
 const safe=validateSite({phone:payload.phone,email:payload.email,address:payload.address,hours:payload.hours,announcement:{enabled:payload.announcement?.enabled,text:payload.announcement?.text,startsAt:payload.announcement?.startsAt,endsAt:payload.announcement?.endsAt},faq:payload.faq?.map(q=>({group:q.group,question:q.question,answer:q.answer})),version:1});
 const a=safe.announcement,visible=a.enabled&&(!a.startsAt||Date.parse(a.startsAt)<=now)&&(!a.endsAt||now<Date.parse(a.endsAt));
 return {...safe,announcement:visible?{text:a.text}:null};
}
// Spreadsheet apps interpret leading =, +, -, @ and control-space prefixes as formulas.
export function csvCell(value){let s=String(value??'');if(/^[\s\uFEFF]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function stockCSV(rows){
 const columns=['Reference','Brand','Model','Year','Price USD','Mileage km','Body','Fuel','Transmission','Seats','Status','Listing path'];
 const lines=rows.map(row=>{const p=row.payload||{};return [p.ref,p.brand,p.model,p.year,p.price,p.mileage,p.body,p.fuel,p.transmission,p.seats,row.status,'/cars/'+row.slug+'/'].map(csvCell).join(',');});
 return '\uFEFF'+[columns.map(csvCell).join(','),...lines].join('\r\n')+'\r\n';
}
export function csvResponse(rows){return new Response(stockCSV(rows),{headers:{...noStoreHeaders,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="jht-stock-'+new Date().toISOString().slice(0,10)+'.csv"'}});}
