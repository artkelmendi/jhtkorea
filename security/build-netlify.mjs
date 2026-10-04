import { readdir,readFile,writeFile,cp,mkdir,stat,rm } from 'node:fs/promises';
import { resolve,join,relative } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
let source=join(root,'public-site');
try { await stat(source); } catch { source=join(root,'jhtkorea'); }
const output=join(root,'netlify-public');
// Empty output is required to avoid stale admin scripts or accidental extra artifacts.
try { const entries=await readdir(output); if(entries.length) throw Error('netlify-public is not empty. Use a fresh checkout for a production build.'); } catch(error) { if(error.code!=='ENOENT') throw error; }
await mkdir(output,{recursive:true});await cp(source,output,{recursive:true,filter:path=>!['.git','.github','.env'].includes(path.split(/[\\/]/).at(-1))});
await cp(join(root,'private-ui','admin-shortcut.js'),join(output,'admin-shortcut.js'));
await writeFile(join(output,'admin-shortcut.css'),'.admin-dashboard-link{display:inline-flex!important;align-items:center;gap:7px;color:#65cbf5!important}.admin-dashboard-link svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.5}');
const hashes=new Set();
async function walk(dir) {
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    const path=join(dir,entry.name);
    if(entry.isDirectory()) {await walk(path);continue;}
    if(/\.(?:html|js|css|json)$/.test(entry.name)) {
      let text=(await readFile(path,'utf8')).replaceAll('/jhtkorea/','/');
      if(entry.name.endsWith('.html')) for(const match of text.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) hashes.add(`'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`);
      if(entry.name.endsWith('.html')&&!relative(output,path).startsWith('admin'))text=text.replace('</head>','<link rel="stylesheet" href="/admin-shortcut.css"><script defer src="/admin-shortcut.js"></script></head>');
      await writeFile(path,text);
    }
  }
}
await walk(output);
// The real sign-in flow is served only by the host that runs its guarded API.
// GitHub Pages retains the closed management page.
await cp(join(root,'private-ui','admin'),join(output,'admin'),{recursive:true});
// Replace public sample cards with live content only in the server-backed release.
let home=await readFile(join(output,'index.html'),'utf8');
if(home.includes('id="latest-carousel"')) {
  const start=home.indexOf('<div',home.lastIndexOf('<div',home.indexOf('id="latest-carousel"')));
  const tagEnd=home.indexOf('>',home.indexOf('id="latest-carousel"'))+1;
  let depth=1,end=tagEnd;const tags=/<\/?div\b[^>]*>/g;tags.lastIndex=tagEnd;let match;
  while(depth&&(match=tags.exec(home))){depth+=match[0].startsWith('</')?-1:1;end=tags.lastIndex;}
  const opening=home.slice(start,tagEnd).replace('id="latest-carousel"','id="latest-carousel" data-live-pending="true"');
  home=home.slice(0,start)+opening+'<p class="collection-message">Loading the collection…</p></div>'+home.slice(end);
  home=home.replace(/(?=<section\b[^>]*\bid="about")/,'<section id="featured-vehicle-section" class="featured-section" aria-labelledby="featured-vehicle-title" hidden></section>');
  home=home.replace('</head>','<script defer src="/security-data.js"></script><script defer src="/live-home.js"></script></head>');
  home=home.replace('Showing 10 recent vehicles from our sample collection. Availability and final pricing are confirmed with the team.','Recent arrivals from our live collection. Confirm condition and final shipping costs with our team.');
  await writeFile(join(output,'index.html'),home);
  await cp(join(root,'private-ui','live-home.js'),join(output,'live-home.js'));
}
// There must be no static detail route that can bypass the current database status.
for(const section of ['cars','notices']){
  let entries=[];try{entries=await readdir(join(output,section),{withFileTypes:true});}catch(error){if(error.code!=='ENOENT')throw error;}
  for(const entry of entries)if(entry.isDirectory())await rm(join(output,section,entry.name),{recursive:true});
}
const catalogue=join(output,'catalogue.js');
try{await writeFile(catalogue,(await readFile(catalogue,'utf8')).replace("fetch('/cars.json',","fetch('/api/public/catalogue',"));}catch(error){if(error.code!=='ENOENT')throw error;}
try{await rm(join(output,'cars.json'));}catch(error){if(error.code!=='ENOENT')throw error;}
await cp(join(root,'private-ui','live-content.css'),join(output,'live-content.css'));
home=await readFile(join(output,'index.html'),'utf8');await writeFile(join(output,'index.html'),home.replace('</head>','<link rel="stylesheet" href="/live-content.css"></head>'));
const scripts=[...hashes].join(' ');
const csp=`default-src 'none'; script-src 'self' ${scripts}; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; font-src 'self'; media-src 'self'; connect-src 'self'; frame-src https://www.google.com https://www.youtube-nocookie.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'`;
await writeFile(join(output,'_headers'),`/*\n  Content-Security-Policy: ${csp}\n/admin/*\n  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'\n`);
const forbidden=['backend','supabase','.env','node_modules','package.json','netlify','security'];
for(const name of forbidden) {try{await stat(join(output,name));throw Error(`Private build artifact exposed: ${name}`);}catch(error){if(error.code!=='ENOENT')throw error;}}
console.log(`Built ${relative(root,output)} with live public catalogue and the MFA-protected workspace.`);
