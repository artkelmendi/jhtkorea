import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { HttpError } from './policy.mjs';
export const BUCKET='jht-vehicle-photos';
export const MAX_UPLOAD=4*1024*1024;
export async function readImage(request) {
  const type=request.headers.get('content-type')?.split(';')[0];
  if(!['image/jpeg','image/png','image/webp'].includes(type))throw new HttpError(415,'Choose a JPG, PNG or WebP photo.');
  const reader=request.body?.getReader();if(!reader)throw new HttpError(400);
  let size=0;const parts=[];
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_UPLOAD){await reader.cancel();throw new HttpError(413,'Each photo must be under 4 MB.');}parts.push(Buffer.from(value));}
  return sanitizeImage(Buffer.concat(parts),type);
}
export async function sanitizeImage(bytes,type) {
  if(!bytes.length||bytes.length>MAX_UPLOAD)throw new HttpError(413);
  const detected=bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff?'image/jpeg':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'image/webp':null;
  if(detected!==type)throw new HttpError(415,'The file is not a supported photo.');
  try {
    const pipeline=sharp(bytes,{limitInputPixels:32000000,failOn:'warning'});
    const meta=await pipeline.metadata();
    if(!['jpeg','png','webp'].includes(meta.format)||!meta.width||!meta.height||meta.width>12000||meta.height>12000||(meta.pages||1)!==1)throw Error('Invalid dimensions');
    // Re-encoding deliberately drops EXIF, GPS, XMP and all original metadata.
    const clean=await pipeline.rotate().resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer();
    if(clean.length>2*1024*1024)throw Error('Image too large');
    return {id:randomUUID(),bytes:clean};
  } catch {throw new HttpError(400,'This photo could not be processed. Choose a smaller, still image.');}
}
