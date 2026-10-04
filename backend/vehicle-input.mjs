import {asset} from './content.mjs';
import {HttpError,exactKeys} from './policy.mjs';
const statuses=['available','reserved','sold','draft','archived'];
export function validateVehicle(body) {
  const fields=['slug','brand','model','ref','body','fuel','transmission','year','price','mileage','seats','status','image','gallery','version'];
  exactKeys(body,fields);
  for (const field of ['brand','model','ref','body','fuel','transmission']) if (typeof body[field]!=='string' || !body[field].trim() || body[field].length>120) throw new HttpError(400,'Invalid vehicle details.');
  for (const [field,min,max] of [['year',1980,2030],['price',0,10000000],['seats',2,15]]) if (typeof body[field]!=='number' || !Number.isFinite(body[field]) || body[field]<min || body[field]>max) throw new HttpError(400);
  if (!Number.isInteger(body.year) || !Number.isInteger(body.seats)) throw new HttpError(400);
  if (body.mileage!==null && (typeof body.mileage!=='number' || !Number.isFinite(body.mileage) || body.mileage<0 || body.mileage>3000000)) throw new HttpError(400);
  if (typeof body.slug!=='string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug) || body.slug.length>100 || !statuses.includes(body.status)) throw new HttpError(400);
  if (!asset(body.image) || !Array.isArray(body.gallery) || body.gallery.length>12 || body.gallery.some(value=>!asset(value))) throw new HttpError(400,'Invalid image reference.');
  const payload=Object.fromEntries(fields.filter(field=>!['slug','status','version'].includes(field)).map(field=>[field,body[field]]));
  return {slug:body.slug,status:body.status,payload};
}
