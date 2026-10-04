import { readdir,readFile,writeFile,cp,mkdir,stat } from 'node:fs/promises';
import { resolve,join,relative } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
let source=join(root,'public-site');
try { await stat(source); } catch { source=join(root,'jhtkorea'); }
const output=join(root,'netlify-public');
// Empty output is required to avoid stale admin scripts or accidental extra artifacts.
try { const entries=await readdir(output); if(entries.length) throw Error('netlify-public is not empty. Use a fresh checkout for a production build.'); } catch(error) { if(error.code!=='ENOENT') throw error; }
await mkdir(output,{recursive:true});await cp(source,output,{recursive:true});
const hashes=new Set();
async function walk(dir) {
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    const path=join(dir,entry.name);
    if(entry.isDirectory()) {await walk(path);continue;}
    if(/\.(?:html|js|css|json)$/.test(entry.name)) {
      let text=(await readFile(path,'utf8')).replaceAll('/jhtkorea/','/');
      if(entry.name.endsWith('.html')) for(const match of text.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) hashes.add(`'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`);
      await writeFile(path,text);
    }
  }
}
await walk(output);
const scripts=[...hashes].join(' ');
const csp=`default-src 'none'; script-src 'self' ${scripts}; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; font-src 'self'; media-src 'self'; connect-src 'self'; frame-src https://www.google.com https://www.youtube-nocookie.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'`;
await writeFile(join(output,'_headers'),`/*\n  Content-Security-Policy: ${csp}\n/admin/*\n  Content-Security-Policy: default-src 'none'; style-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'\n`);
const forbidden=['backend','supabase','.env','node_modules','package.json','netlify','security'];
for(const name of forbidden) {try{await stat(join(output,name));throw Error(`Private build artifact exposed: ${name}`);}catch(error){if(error.code!=='ENOENT')throw error;}}
console.log(`Built ${relative(root,output)} with public assets only. Admin remains closed.`);
